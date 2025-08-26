import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { LogContext } from '../utils/logger';
import { withErrorHandling, ErrorCategory, AgentExecutionError } from '../utils/errors';
import type { ResourceAlert } from './resource-monitor';
import { ResourceMonitor } from './resource-monitor';
import type { WorktreeInfo } from '../types';
import type {
  ClaudeCodeAdapterConfig,
  TaskExecutionRequest,
  TaskExecutionResult,
  TaskProgress,
} from './claude-code-adapter';

/**
 * Task Execution Interface
 *
 * Handles the actual execution of agent tasks in isolated worktree environments
 * with comprehensive monitoring, resource management, and secure sandboxing.
 */
export class TaskExecutor extends EventEmitter {
  private config: ClaudeCodeAdapterConfig;
  private logger: LogContext;
  private adapter: any; // Reference to ClaudeCodeAdapter
  private activeProcesses: Map<string, ChildProcess>;
  private resourceTracking: Map<string, NodeJS.Timeout>;
  private resourceMonitor: ResourceMonitor; // 🔧 NEW: Advanced resource monitoring

  constructor(config: ClaudeCodeAdapterConfig, adapter: any) {
    super();
    this.config = config;
    this.logger = new LogContext('TaskExecutor');
    this.adapter = adapter;
    this.activeProcesses = new Map();
    this.resourceTracking = new Map();

    // Initialize resource monitor
    this.resourceMonitor = new ResourceMonitor({
      maxMemoryMB: config.resourceLimits.maxMemoryMB,
      maxCpuPercent: config.resourceLimits.maxCpuPercent,
      maxExecutionTimeMs: config.resourceLimits.maxExecutionTimeMs,
      maxDiskUsageMB: 500, // 500MB default disk usage limit
      maxFileHandles: 100, // 100 file handles limit
    });

    this.setupResourceMonitorEvents();
  }

  private setupResourceMonitorEvents(): void {
    this.resourceMonitor.on('resource:alert', (alert: ResourceAlert) => {
      this.logger.warning(`Resource alert: ${alert.message} - ${JSON.stringify(alert)}`);
      this.emit('executor:resource-alert', alert);
    });

    this.resourceMonitor.on('process:throttled', (event: any) => {
      this.logger.warning(`Process throttled: ${event.taskId} - ${JSON.stringify(event)}`);
      this.emit('executor:process-throttled', event);
    });

    this.resourceMonitor.on('task:terminated', (event: any) => {
      this.logger.error(
        `Task terminated due to resource violation: ${event.taskId} - ${JSON.stringify(event)}`,
      );
      this.emit('executor:task-terminated', event);
    });
  }

  /**
   * Initialize the task executor and resource monitor
   */
  public async initialize(): Promise<void> {
    await this.resourceMonitor.initialize();
    this.logger.info('TaskExecutor initialized with resource monitoring');
  }

  /**
   * Execute a task in a specific worktree with full isolation and monitoring
   */
  public async executeInWorktree(
    request: TaskExecutionRequest,
    worktreeInfo: WorktreeInfo,
  ): Promise<TaskExecutionResult> {
    const startTime = Date.now();
    this.logger.info(`Executing task ${request.taskId} in worktree ${request.worktreeId}`);

    // Validate worktree environment
    await this.validateWorktreeEnvironment(worktreeInfo);

    // Prepare execution environment
    const executionContext = await this.prepareExecutionContext(request, worktreeInfo);

    // Start progress tracking
    this.startProgressTracking(request.taskId, executionContext.workingDir);

    try {
      const result = await withErrorHandling(
        () => this.executeClaudeCodeTask(request, executionContext),
        {
          operationName: 'claude-code-execution',
          category: ErrorCategory.AGENT_EXECUTION,
          retries: 1,
          timeoutMs: request.timeout || this.config.taskTimeout,
        },
      );

      this.logger.info(
        `Task ${request.taskId} completed successfully in ${Date.now() - startTime}ms`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `Task ${request.taskId} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new AgentExecutionError(
        request.agentType,
        request.taskId,
        `Task execution failed: ${String(error)}`,
        {
          worktreeId: request.worktreeId,
          agentType: request.agentType,
          originalError: error,
        },
      );
    } finally {
      // Cleanup resources
      await this.cleanupExecution(request.taskId, executionContext);
    }
  }

  private async validateWorktreeEnvironment(worktreeInfo: WorktreeInfo): Promise<void> {
    // Check if worktree path exists and is accessible
    if (!(await fs.pathExists(worktreeInfo.path))) {
      throw new AgentExecutionError(
        'task-executor',
        worktreeInfo.id,
        `Worktree path does not exist: ${worktreeInfo.path}`,
        { worktreeId: worktreeInfo.id, path: worktreeInfo.path },
      );
    }

    // Verify git repository status
    const gitDir = path.join(worktreeInfo.path, '.git');
    if (!(await fs.pathExists(gitDir))) {
      throw new AgentExecutionError(
        'task-executor',
        worktreeInfo.id,
        `Invalid git worktree: ${worktreeInfo.path}`,
        { worktreeId: worktreeInfo.id },
      );
    }

    // Check permissions
    try {
      await fs.access(worktreeInfo.path, fs.constants.R_OK | fs.constants.W_OK);
    } catch (error) {
      throw new AgentExecutionError(
        'task-executor',
        worktreeInfo.id,
        `Insufficient permissions for worktree: ${worktreeInfo.path}`,
        { worktreeId: worktreeInfo.id, error },
      );
    }

    this.logger.debug(`Worktree environment validated: ${worktreeInfo.id}`);
  }

  private async prepareExecutionContext(
    request: TaskExecutionRequest,
    worktreeInfo: WorktreeInfo,
  ): Promise<{
    workingDir: string;
    logFile: string;
    resourceFile: string;
    environmentVars: Record<string, string>;
    securityContext: {
      allowedCommands: string[];
      restrictedPaths: string[];
      maxFileSize: number;
    };
  }> {
    const workingDir = worktreeInfo.path;
    const logsDir = path.join(workingDir, '.ff2-logs');
    const logFile = path.join(logsDir, `${request.taskId}.log`);
    const resourceFile = path.join(logsDir, `${request.taskId}.resources`);

    // Ensure logs directory exists
    await fs.ensureDir(logsDir);

    // Prepare environment variables
    const environmentVars: Record<string, string> = {
      FF2_TASK_ID: request.taskId,
      FF2_ISSUE_ID: request.issueId,
      FF2_AGENT_TYPE: request.agentType,
      FF2_WORKTREE_ID: request.worktreeId,
      FF2_WORKING_DIR: workingDir,
      FF2_LOG_FILE: logFile,
      FF2_RESOURCE_FILE: resourceFile,
      // Security context
      FF2_SANDBOX_MODE: this.config.enableSandboxing ? 'true' : 'false',
      // Resource limits
      FF2_MAX_MEMORY_MB: String(this.config.resourceLimits.maxMemoryMB),
      FF2_MAX_CPU_PERCENT: String(this.config.resourceLimits.maxCpuPercent),
      FF2_MAX_EXECUTION_TIME: String(this.config.resourceLimits.maxExecutionTimeMs),
      // Additional context
      ...process.env, // Inherit system environment
      ...(request.context || {}), // Request-specific context
    };

    // Security context for sandboxing
    const securityContext = {
      allowedCommands: [
        'git',
        'npm',
        'node',
        'python',
        'pip',
        'yarn',
        'pnpm',
        'tsc',
        'eslint',
        'prettier',
        'jest',
        'vitest',
        'playwright',
        'docker',
        'kubectl',
        'terraform',
      ],
      restrictedPaths: [
        '/etc',
        '/usr',
        '/var',
        '/boot',
        '/sys',
        '/proc',
        path.resolve(os.homedir()), // User home directory
        path.resolve('/'), // Root directory
      ].filter((p) => !p.startsWith(workingDir)), // Allow access to worktree
      maxFileSize: 100 * 1024 * 1024, // 100MB max file size
    };

    this.logger.debug(`Execution context prepared for task ${request.taskId}`);

    return {
      workingDir,
      logFile,
      resourceFile,
      environmentVars,
      securityContext,
    };
  }

  private async executeClaudeCodeTask(
    request: TaskExecutionRequest,
    context: {
      workingDir: string;
      logFile: string;
      resourceFile: string;
      environmentVars: Record<string, string>;
      securityContext: any;
    },
  ): Promise<TaskExecutionResult> {
    const startTime = Date.now();

    // Create Claude Code command
    const claudeCommand = this.buildClaudeCodeCommand(request, context);

    // Update progress
    this.emitProgress(request.taskId, 'execution', 10, 'Starting Claude Code execution');

    // Execute Claude Code with monitoring
    const { output, errorOutput, resourceUsage } = await this.runCommandWithMonitoring(
      request.taskId,
      claudeCommand.command,
      claudeCommand.args,
      context,
    );

    const executionTime = Date.now() - startTime;

    // Analyze execution results
    const artifacts = await this.collectArtifacts(context.workingDir);
    const metrics = await this.calculateMetrics(context.workingDir, output);

    // Determine status
    const status = errorOutput.length > 0 ? 'failure' : 'success';

    // Update final progress
    this.emitProgress(
      request.taskId,
      'completed',
      100,
      status === 'success' ? 'Task completed successfully' : 'Task completed with errors',
    );

    return {
      taskId: request.taskId,
      status,
      output,
      errorMessage: errorOutput,
      executionTime,
      resourceUsage,
      artifacts,
      metrics,
    };
  }

  private buildClaudeCodeCommand(
    request: TaskExecutionRequest,
    context: { workingDir: string; environmentVars: Record<string, string> },
  ): { command: string; args: string[] } {
    // Build Claude Code command based on agent type and instructions
    const baseCommand = 'claude'; // Assuming 'claude' is the CLI command
    const args: string[] = [];

    // Add task-specific parameters
    args.push('--task', request.instructions);
    args.push('--working-directory', context.workingDir);
    args.push('--agent-type', request.agentType);
    args.push('--issue-id', request.issueId);

    // Add priority if specified
    if (request.priority !== 'normal') {
      args.push('--priority', request.priority);
    }

    // Add timeout
    args.push('--timeout', String(request.timeout || this.config.taskTimeout));

    // Add logging configuration
    args.push('--log-level', this.config.logLevel);
    args.push('--log-file', context.environmentVars.FF2_LOG_FILE);

    // Add resource limits
    args.push('--max-memory', String(this.config.resourceLimits.maxMemoryMB));
    args.push('--max-cpu', String(this.config.resourceLimits.maxCpuPercent));

    // Enable sandboxing if configured
    if (this.config.enableSandboxing) {
      args.push('--sandbox');
    }

    this.logger.debug(`Claude Code command: ${baseCommand} ${args.join(' ')}`);

    return { command: baseCommand, args };
  }

  private async runCommandWithMonitoring(
    taskId: string,
    command: string,
    args: string[],
    context: {
      workingDir: string;
      logFile: string;
      resourceFile: string;
      environmentVars: Record<string, string>;
      securityContext: any;
    },
  ): Promise<{
    output: string;
    errorOutput: string;
    resourceUsage: {
      memoryPeak: number;
      cpuTime: number;
      diskIO: number;
    };
  }> {
    return new Promise((resolve, reject) => {
      let output = '';
      let errorOutput = '';
      let resourceUsage = { memoryPeak: 0, cpuTime: 0, diskIO: 0 };

      // Spawn the process
      const process = spawn(command, args, {
        cwd: context.workingDir,
        env: context.environmentVars,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: this.config.resourceLimits.maxExecutionTimeMs,
      });

      // Register process for monitoring
      this.activeProcesses.set(taskId, process);
      this.adapter.registerTaskProcess(taskId, process);

      // 🔧 ENHANCED: Register with resource monitor
      this.resourceMonitor.registerProcess(taskId, process.pid, new Date());

      // Start resource monitoring
      const resourceMonitor = this.startResourceMonitoring(
        taskId,
        process.pid,
        context.resourceFile,
      );
      this.resourceTracking.set(taskId, resourceMonitor);

      // Handle stdout
      process.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        output += chunk;
        this.logger.debug(`Task ${taskId} stdout: ${chunk.trim()}`);

        // Parse progress from output if available
        this.parseProgressFromOutput(taskId, chunk);
      });

      // Handle stderr
      process.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        errorOutput += chunk;
        this.logger.debug(`Task ${taskId} stderr: ${chunk.trim()}`);
      });

      // Handle process completion
      process.on('close', async (code: number | null, signal: string | null) => {
        this.logger.debug(`Task ${taskId} process closed with code ${code}, signal ${signal}`);

        // Stop resource monitoring
        const monitor = this.resourceTracking.get(taskId);
        if (monitor) {
          clearInterval(monitor);
          this.resourceTracking.delete(taskId);
        }

        // Collect final resource usage from resource monitor
        const monitoredUsage = this.resourceMonitor.getTaskResourceUsage(taskId);
        resourceUsage = monitoredUsage
          ? {
              memoryPeak: monitoredUsage.memoryMB,
              cpuTime: Math.round(
                (monitoredUsage.cpuPercent / 100) * monitoredUsage.executionTimeMs,
              ),
              diskIO: monitoredUsage.diskReadMB + monitoredUsage.diskWriteMB,
            }
          : await this.collectResourceUsage(context.resourceFile);

        // Clean up
        this.activeProcesses.delete(taskId);
        this.resourceMonitor.unregisterProcess(taskId);

        if (code === 0) {
          resolve({ output, errorOutput, resourceUsage });
        } else {
          reject(new Error(`Process exited with code ${code}: ${errorOutput}`));
        }
      });

      // Handle process errors
      process.on('error', (error: Error) => {
        this.logger.error(
          `Task ${taskId} process error: ${error instanceof Error ? error.message : String(error)}`,
        );

        // Clean up
        const monitor = this.resourceTracking.get(taskId);
        if (monitor) {
          clearInterval(monitor);
          this.resourceTracking.delete(taskId);
        }
        this.activeProcesses.delete(taskId);
        this.resourceMonitor.unregisterProcess(taskId);

        reject(error);
      });

      // Handle timeout
      process.on('spawn', () => {
        setTimeout(() => {
          if (!process.killed) {
            this.logger.warning(`Task ${taskId} timed out, killing process`);
            process.kill('SIGTERM');

            setTimeout(() => {
              if (!process.killed) {
                process.kill('SIGKILL');
              }
            }, 5000);
          }
        }, this.config.resourceLimits.maxExecutionTimeMs);
      });
    });
  }

  private startResourceMonitoring(
    taskId: string,
    pid: number | undefined,
    resourceFile: string,
  ): NodeJS.Timeout {
    return setInterval(async () => {
      if (!pid) return;

      try {
        // Get process statistics (simplified - in production use proper monitoring)
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();

        const stats = {
          timestamp: new Date().toISOString(),
          pid,
          memory: {
            rss: memUsage.rss,
            heapTotal: memUsage.heapTotal,
            heapUsed: memUsage.heapUsed,
            external: memUsage.external,
          },
          cpu: {
            user: cpuUsage.user,
            system: cpuUsage.system,
          },
        };

        // Write to resource file
        await fs.appendFile(resourceFile, JSON.stringify(stats) + '\n');

        // Check resource limits
        const memoryMB = memUsage.rss / (1024 * 1024);
        if (memoryMB > this.config.resourceLimits.maxMemoryMB) {
          this.logger.warning(`Task ${taskId} exceeding memory limit: ${memoryMB}MB`);
          this.emit('executor:resource-warning', {
            taskId,
            type: 'memory',
            current: memoryMB,
            limit: this.config.resourceLimits.maxMemoryMB,
          });
        }
      } catch (error) {
        this.logger.debug(
          `Resource monitoring error for task ${taskId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }, 1000); // Monitor every second
  }

  private parseProgressFromOutput(taskId: string, output: string): void {
    // Parse progress indicators from Claude Code output
    // This is a simplified implementation - you might want more sophisticated parsing
    const progressPatterns = [
      /Progress:\s*(\d+)%\s*-\s*(.+)/i,
      /\[(\d+)%\]\s*(.+)/i,
      /(\d+)%\s*complete/i,
    ];

    for (const pattern of progressPatterns) {
      const match = output.match(pattern);
      if (match) {
        const progress = parseInt(match[1], 10);
        const message = match[2] || 'Processing...';

        this.emitProgress(taskId, 'execution', progress, message);
        break;
      }
    }

    // Detect phase changes
    const phasePatterns = [
      /Starting\s+(.+)/i,
      /Executing\s+(.+)/i,
      /Completing\s+(.+)/i,
      /Finished\s+(.+)/i,
    ];

    for (const pattern of phasePatterns) {
      const match = output.match(pattern);
      if (match) {
        const phase = match[1].toLowerCase().replace(/\s+/g, '-');
        this.emitProgress(taskId, phase, undefined, match[0]);
        break;
      }
    }
  }

  private async collectResourceUsage(resourceFile: string): Promise<{
    memoryPeak: number;
    cpuTime: number;
    diskIO: number;
  }> {
    try {
      if (!(await fs.pathExists(resourceFile))) {
        return { memoryPeak: 0, cpuTime: 0, diskIO: 0 };
      }

      const content = await fs.readFile(resourceFile, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);

      let memoryPeak = 0;
      let totalCpuTime = 0;

      for (const line of lines) {
        try {
          const stats = JSON.parse(line);
          memoryPeak = Math.max(memoryPeak, stats.memory?.rss || 0);
          totalCpuTime += (stats.cpu?.user || 0) + (stats.cpu?.system || 0);
        } catch (error) {
          // Skip invalid lines
        }
      }

      return {
        memoryPeak: Math.round(memoryPeak / (1024 * 1024)), // Convert to MB
        cpuTime: Math.round(totalCpuTime / 1000), // Convert to ms
        diskIO: 0, // Simplified - would need more sophisticated monitoring
      };
    } catch (error) {
      this.logger.debug(
        `Error collecting resource usage: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { memoryPeak: 0, cpuTime: 0, diskIO: 0 };
    }
  }

  private async collectArtifacts(workingDir: string): Promise<string[]> {
    const artifacts: string[] = [];

    try {
      // Common artifact patterns
      const artifactPatterns = [
        '**/*.log',
        '**/dist/**/*',
        '**/build/**/*',
        '**/coverage/**/*',
        '**/test-results/**/*',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/package.json',
        '**/tsconfig.json',
        '**/.eslintrc*',
        '**/README.md',
      ];

      // Use glob to find artifacts (simplified - would use actual glob library)
      const glob = require('glob');
      for (const pattern of artifactPatterns) {
        try {
          const files = glob.sync(pattern, { cwd: workingDir, absolute: false });
          artifacts.push(...files);
        } catch (error) {
          // Continue with other patterns
        }
      }

      // Remove duplicates and sort
      return [...new Set(artifacts)].sort();
    } catch (error) {
      this.logger.debug(
        `Error collecting artifacts: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  private async calculateMetrics(
    workingDir: string,
    output: string,
  ): Promise<{
    linesOfCode: number;
    filesModified: number;
    testsRun: number;
    coveragePercent: number;
  }> {
    const metrics = {
      linesOfCode: 0,
      filesModified: 0,
      testsRun: 0,
      coveragePercent: 0,
    };

    try {
      // Extract metrics from output
      const locMatch = output.match(/(\d+)\s+lines?\s+of\s+code/i);
      if (locMatch) {
        metrics.linesOfCode = parseInt(locMatch[1], 10);
      }

      const filesMatch = output.match(/(\d+)\s+files?\s+(?:modified|changed|updated)/i);
      if (filesMatch) {
        metrics.filesModified = parseInt(filesMatch[1], 10);
      }

      const testsMatch = output.match(/(\d+)\s+tests?\s+(?:run|passed|executed)/i);
      if (testsMatch) {
        metrics.testsRun = parseInt(testsMatch[1], 10);
      }

      const coverageMatch = output.match(/(?:coverage|covered):\s*(\d+(?:\.\d+)?)%/i);
      if (coverageMatch) {
        metrics.coveragePercent = parseFloat(coverageMatch[1]);
      }

      // Try to get metrics from files as well
      const statsFile = path.join(workingDir, '.ff2-logs', 'stats.json');
      if (await fs.pathExists(statsFile)) {
        const stats = await fs.readJSON(statsFile);
        Object.assign(metrics, stats);
      }
    } catch (error) {
      this.logger.debug(
        `Error calculating metrics: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return metrics;
  }

  private startProgressTracking(taskId: string, workingDir: string): void {
    // Initialize progress tracking
    this.emitProgress(taskId, 'initialization', 5, 'Initializing task execution environment');

    // Monitor for progress files
    const progressFile = path.join(workingDir, '.ff2-logs', 'progress.json');
    const progressWatcher = setInterval(async () => {
      try {
        if (await fs.pathExists(progressFile)) {
          const progress = await fs.readJSON(progressFile);
          this.emitProgress(taskId, progress.phase, progress.percent, progress.message);
        }
      } catch (error) {
        // Continue monitoring
      }
    }, 2000);

    // Store watcher for cleanup
    this.resourceTracking.set(`${taskId}-progress`, progressWatcher);
  }

  private emitProgress(taskId: string, phase: string, progress?: number, message?: string): void {
    const progressUpdate: TaskProgress = {
      taskId,
      phase,
      progress: progress !== undefined ? Math.max(0, Math.min(100, progress)) : 0,
      message: message || `Processing ${phase}...`,
      timestamp: new Date(),
      resources: {
        memoryUsage: 0, // Would be calculated from actual monitoring
        cpuUsage: 0, // Would be calculated from actual monitoring
      },
    };

    this.emit('executor:progress', progressUpdate);
  }

  private async cleanupExecution(
    taskId: string,
    context: {
      workingDir: string;
      logFile: string;
      resourceFile: string;
    },
  ): Promise<void> {
    try {
      // Stop all monitoring for this task
      const progressWatcher = this.resourceTracking.get(`${taskId}-progress`);
      if (progressWatcher) {
        clearInterval(progressWatcher);
        this.resourceTracking.delete(`${taskId}-progress`);
      }

      const resourceMonitor = this.resourceTracking.get(taskId);
      if (resourceMonitor) {
        clearInterval(resourceMonitor);
        this.resourceTracking.delete(taskId);
      }

      // Kill process if still running
      const process = this.activeProcesses.get(taskId);
      if (process && !process.killed) {
        process.kill('SIGTERM');
      }
      this.activeProcesses.delete(taskId);

      // Archive logs if configured
      if (this.config.logLevel === 'debug') {
        await this.archiveLogs(taskId, context);
      }

      this.logger.debug(`Execution cleanup completed for task ${taskId}`);
    } catch (error) {
      this.logger.error(
        `Error during execution cleanup for task ${taskId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async archiveLogs(
    taskId: string,
    context: { workingDir: string; logFile: string; resourceFile: string },
  ): Promise<void> {
    try {
      const archiveDir = path.join(context.workingDir, '.ff2-archive', taskId);
      await fs.ensureDir(archiveDir);

      // Copy logs to archive
      if (await fs.pathExists(context.logFile)) {
        await fs.copy(context.logFile, path.join(archiveDir, 'execution.log'));
      }

      if (await fs.pathExists(context.resourceFile)) {
        await fs.copy(context.resourceFile, path.join(archiveDir, 'resources.log'));
      }

      this.logger.debug(`Logs archived for task ${taskId}`);
    } catch (error) {
      this.logger.debug(
        `Failed to archive logs for task ${taskId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get resource monitor instance
   */
  public getResourceMonitor(): ResourceMonitor {
    return this.resourceMonitor;
  }

  /**
   * Get current system resource status
   */
  public async getSystemResourceStatus(): Promise<{
    system: any;
    limits: any;
    monitored: any;
    alerts: any;
  }> {
    return {
      system: await this.resourceMonitor.getCurrentSystemUsage(),
      limits: this.config.resourceLimits,
      monitored: this.resourceMonitor.getAllProcessUsages(),
      alerts: this.resourceMonitor.getRecentAlerts(300000), // Last 5 minutes
    };
  }

  /**
   * Check if system can accept new tasks based on resource availability
   */
  public async canAcceptNewTask(): Promise<{
    canAccept: boolean;
    reasons: string[];
    systemUsage: any;
  }> {
    const systemUsage = await this.resourceMonitor.getCurrentSystemUsage();
    const reasons: string[] = [];

    // Check memory availability (leave 20% buffer)
    if (systemUsage.usedMemoryMB / systemUsage.totalMemoryMB > 0.8) {
      reasons.push('System memory usage above 80%');
    }

    // Check CPU load
    if (systemUsage.cpuLoadPercent > 85) {
      reasons.push('System CPU load above 85%');
    }

    // Check active process count
    if (systemUsage.activeProcesses >= this.config.maxConcurrentTasks) {
      reasons.push('Maximum concurrent tasks reached');
    }

    return {
      canAccept: reasons.length === 0,
      reasons,
      systemUsage,
    };
  }

  /**
   * Force cancel a task and clean up resources
   */
  public async forceCancelTask(taskId: string): Promise<void> {
    await this.resourceMonitor.forceTerminateTask(taskId, 'User requested cancellation');
    await this.cleanupExecution(taskId, {} as any);
  }

  /**
   * Shutdown task executor and resource monitor
   */
  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down TaskExecutor...');

    try {
      // Cancel all active tasks
      const activeTasks = Array.from(this.activeProcesses.keys());
      for (const taskId of activeTasks) {
        await this.forceCancelTask(taskId);
      }

      // Shutdown resource monitor
      await this.resourceMonitor.shutdown();

      // Clear tracking data
      this.activeProcesses.clear();
      for (const timer of this.resourceTracking.values()) {
        clearInterval(timer);
      }
      this.resourceTracking.clear();

      this.logger.info('TaskExecutor shutdown complete');
    } catch (error) {
      this.logger.error(
        `Error during TaskExecutor shutdown: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
