import { EventEmitter } from 'events';
import * as path from 'path';
import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import { LogContext } from '../utils/logger';
import { withErrorHandling, ErrorCategory, AgentExecutionError } from '../utils/errors';
import type { WorktreeManager } from '../core/worktree-manager';
import type { AgentPool } from '../agents/agent-pool';
import type { Agent } from '../types';
import { TaskExecutor } from './task-executor';
import { CommunicationProtocol } from './communication-protocol';

// 🟢 WORKING: Complete Claude Code Worker Adapter Bridge interface
export interface ClaudeCodeAdapterConfig {
  maxConcurrentTasks: number;
  taskTimeout: number;
  resourceLimits: {
    maxMemoryMB: number;
    maxCpuPercent: number;
    maxExecutionTimeMs: number;
  };
  communicationPort: number;
  worktreeBasePath: string;
  enableSandboxing: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export interface TaskExecutionRequest {
  taskId: string;
  issueId: string;
  agentType: string;
  worktreeId: string;
  instructions: string;
  context?: Record<string, any>;
  priority: 'low' | 'normal' | 'high' | 'critical';
  timeout?: number;
}

export interface TaskExecutionResult {
  taskId: string;
  status: 'success' | 'failure' | 'timeout' | 'cancelled';
  output: string;
  errorMessage?: string;
  executionTime: number;
  resourceUsage: {
    memoryPeak: number;
    cpuTime: number;
    diskIO: number;
  };
  artifacts: string[];
  metrics: {
    linesOfCode: number;
    filesModified: number;
    testsRun: number;
    coveragePercent: number;
  };
}

export interface TaskProgress {
  taskId: string;
  phase: string;
  progress: number; // 0-100
  message: string;
  timestamp: Date;
  resources: {
    memoryUsage: number;
    cpuUsage: number;
  };
}

/**
 * Claude Code Worker Adapter Bridge
 *
 * Main bridge component that connects FF2 orchestration with Claude Code execution.
 * Manages task execution in isolated worktree environments with real-time monitoring.
 */
export class ClaudeCodeAdapter extends EventEmitter {
  private config: ClaudeCodeAdapterConfig;
  private logger: LogContext;
  private worktreeManager: WorktreeManager;
  private agentPool: AgentPool;
  private taskExecutor: TaskExecutor;
  private communicationProtocol: CommunicationProtocol;

  // Task management
  private activeTasks: Map<string, TaskExecutionRequest>;
  private taskProcesses: Map<string, ChildProcess>;
  private taskResults: Map<string, TaskExecutionResult>;
  private taskProgressTracking: Map<string, TaskProgress>;

  // Resource monitoring
  private resourceMonitor: NodeJS.Timeout | null = null;
  private systemLoad: {
    memoryUsage: number;
    cpuUsage: number;
    taskCount: number;
    lastUpdated: Date;
  };

  constructor(
    config: ClaudeCodeAdapterConfig,
    worktreeManager: WorktreeManager,
    agentPool: AgentPool,
  ) {
    super();
    this.config = config;
    this.logger = new LogContext('ClaudeCodeAdapter');
    this.worktreeManager = worktreeManager;
    this.agentPool = agentPool;

    // Initialize components
    this.activeTasks = new Map();
    this.taskProcesses = new Map();
    this.taskResults = new Map();
    this.taskProgressTracking = new Map();

    this.systemLoad = {
      memoryUsage: 0,
      cpuUsage: 0,
      taskCount: 0,
      lastUpdated: new Date(),
    };

    this.taskExecutor = new TaskExecutor(config, this);
    this.communicationProtocol = new CommunicationProtocol(config.communicationPort, this);

    this.initializeAdapter();
  }

  private async initializeAdapter(): Promise<void> {
    this.logger.info('Initializing Claude Code Adapter Bridge...');

    try {
      await withErrorHandling(
        async () => {
          // Initialize task executor with resource monitoring
          await this.taskExecutor.initialize();

          // Initialize communication protocol
          await this.communicationProtocol.initialize();

          // Start resource monitoring
          this.startResourceMonitoring();

          // Setup event listeners
          this.setupEventListeners();
        },
        {
          operationName: 'adapter-initialization',
          category: ErrorCategory.CONFIGURATION,
          retries: 2,
          timeoutMs: 15000,
        },
      );

      this.logger.info('Claude Code Adapter Bridge initialized successfully');
      this.emit('adapter:initialized');
    } catch (error) {
      this.logger.error(
        `Failed to initialize Claude Code Adapter: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new AgentExecutionError(
        'claude-code-adapter',
        'initialization',
        `Adapter initialization failed: ${String(error)}`,
        { originalError: error },
      );
    }
  }

  /**
   * Execute a task using Claude Code in an isolated worktree environment
   */
  public async executeTask(request: TaskExecutionRequest): Promise<TaskExecutionResult> {
    const startTime = Date.now();
    this.logger.info(`Starting task execution: ${request.taskId} (${request.agentType})`);

    // Validate system capacity
    await this.validateSystemCapacity();

    // Check worktree availability
    const worktreeInfo = this.worktreeManager.getWorktreeInfo(request.worktreeId);
    if (!worktreeInfo) {
      throw new AgentExecutionError(
        request.agentType || 'claude-code-adapter',
        request.taskId,
        `Worktree not found: ${request.worktreeId}`,
        { worktreeId: request.worktreeId },
      );
    }

    // Register active task
    this.activeTasks.set(request.taskId, request);

    // Initialize progress tracking
    const initialProgress: TaskProgress = {
      taskId: request.taskId,
      phase: 'initialization',
      progress: 0,
      message: 'Initializing task execution',
      timestamp: new Date(),
      resources: { memoryUsage: 0, cpuUsage: 0 },
    };

    this.taskProgressTracking.set(request.taskId, initialProgress);
    this.emit('task:progress', initialProgress);

    try {
      const result = await withErrorHandling(
        () => this.taskExecutor.executeInWorktree(request, worktreeInfo),
        {
          operationName: 'task-execution',
          category: ErrorCategory.AGENT_EXECUTION,
          retries: 1,
          timeoutMs: request.timeout || this.config.taskTimeout,
        },
      );

      // Update agent pool metrics
      const executionTime = Date.now() - startTime;
      this.agentPool.updateMetrics(request.agentType, result.status === 'success', executionTime);

      // Store result and emit event
      this.taskResults.set(request.taskId, result);
      this.emit('task:completed', result);

      this.logger.info(
        `Task completed: ${request.taskId} (${result.status}) in ${executionTime}ms`,
      );
      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.agentPool.updateMetrics(request.agentType, false, executionTime);

      const failedResult: TaskExecutionResult = {
        taskId: request.taskId,
        status: 'failure',
        output: '',
        errorMessage: String(error),
        executionTime,
        resourceUsage: { memoryPeak: 0, cpuTime: 0, diskIO: 0 },
        artifacts: [],
        metrics: { linesOfCode: 0, filesModified: 0, testsRun: 0, coveragePercent: 0 },
      };

      this.taskResults.set(request.taskId, failedResult);
      this.emit('task:failed', failedResult);

      this.logger.error(
        `Task failed: ${request.taskId} - ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    } finally {
      // Cleanup
      this.activeTasks.delete(request.taskId);
      this.taskProgressTracking.delete(request.taskId);
    }
  }

  /**
   * Cancel a running task
   */
  public async cancelTask(taskId: string): Promise<void> {
    const task = this.activeTasks.get(taskId);
    if (!task) {
      this.logger.warning(`Attempted to cancel non-existent task: ${taskId}`);
      return;
    }

    this.logger.info(`Cancelling task: ${taskId}`);

    const process = this.taskProcesses.get(taskId);
    if (process && !process.killed) {
      process.kill('SIGTERM');

      // Force kill after timeout
      setTimeout(() => {
        if (!process.killed) {
          process.kill('SIGKILL');
        }
      }, 5000);
    }

    const cancelledResult: TaskExecutionResult = {
      taskId,
      status: 'cancelled',
      output: 'Task was cancelled by user request',
      executionTime: 0,
      resourceUsage: { memoryPeak: 0, cpuTime: 0, diskIO: 0 },
      artifacts: [],
      metrics: { linesOfCode: 0, filesModified: 0, testsRun: 0, coveragePercent: 0 },
    };

    this.taskResults.set(taskId, cancelledResult);
    this.activeTasks.delete(taskId);
    this.taskProcesses.delete(taskId);
    this.taskProgressTracking.delete(taskId);

    this.emit('task:cancelled', cancelledResult);
  }

  /**
   * Get task status and progress
   */
  public getTaskStatus(taskId: string): {
    request?: TaskExecutionRequest;
    progress?: TaskProgress;
    result?: TaskExecutionResult;
    isActive: boolean;
  } {
    return {
      request: this.activeTasks.get(taskId),
      progress: this.taskProgressTracking.get(taskId),
      result: this.taskResults.get(taskId),
      isActive: this.activeTasks.has(taskId),
    };
  }

  /**
   * Get all active task statuses
   */
  public getAllTaskStatuses(): Array<{
    taskId: string;
    request: TaskExecutionRequest;
    progress: TaskProgress;
  }> {
    const statuses: Array<{
      taskId: string;
      request: TaskExecutionRequest;
      progress: TaskProgress;
    }> = [];

    for (const [taskId, request] of this.activeTasks) {
      const progress = this.taskProgressTracking.get(taskId);
      if (progress) {
        statuses.push({ taskId, request, progress });
      }
    }

    return statuses;
  }

  /**
   * Get system resource status
   */
  public getSystemStatus(): {
    activeTasks: number;
    systemLoad: typeof this.systemLoad;
    capacity: {
      canAcceptNewTasks: boolean;
      availableSlots: number;
      memoryAvailable: number;
      cpuAvailable: number;
    };
  } {
    const availableSlots = Math.max(0, this.config.maxConcurrentTasks - this.activeTasks.size);

    return {
      activeTasks: this.activeTasks.size,
      systemLoad: { ...this.systemLoad },
      capacity: {
        canAcceptNewTasks:
          availableSlots > 0 && this.systemLoad.memoryUsage < 80 && this.systemLoad.cpuUsage < 80,
        availableSlots,
        memoryAvailable: 100 - this.systemLoad.memoryUsage,
        cpuAvailable: 100 - this.systemLoad.cpuUsage,
      },
    };
  }

  /**
   * Update task progress (called by TaskExecutor)
   */
  public updateTaskProgress(progress: TaskProgress): void {
    this.taskProgressTracking.set(progress.taskId, progress);
    this.emit('task:progress', progress);

    // Send to communication protocol for real-time updates
    this.communicationProtocol.broadcastProgress(progress);
  }

  /**
   * Register task process for monitoring
   */
  public registerTaskProcess(taskId: string, process: ChildProcess): void {
    this.taskProcesses.set(taskId, process);

    process.on('exit', (code, signal) => {
      this.logger.debug(`Task process exited: ${taskId} (code: ${code}, signal: ${signal})`);
      this.taskProcesses.delete(taskId);
    });
  }

  private async validateSystemCapacity(): Promise<void> {
    if (this.activeTasks.size >= this.config.maxConcurrentTasks) {
      throw new AgentExecutionError(
        'claude-code-adapter',
        'capacity-check',
        `Maximum concurrent tasks exceeded: ${this.config.maxConcurrentTasks}`,
        { activeTasks: this.activeTasks.size },
      );
    }

    if (this.systemLoad.memoryUsage > 90) {
      throw new AgentExecutionError(
        'claude-code-adapter',
        'memory-check',
        `System memory usage too high: ${this.systemLoad.memoryUsage}%`,
        { memoryUsage: this.systemLoad.memoryUsage },
      );
    }

    if (this.systemLoad.cpuUsage > 95) {
      throw new AgentExecutionError(
        'claude-code-adapter',
        'cpu-check',
        `System CPU usage too high: ${this.systemLoad.cpuUsage}%`,
        { cpuUsage: this.systemLoad.cpuUsage },
      );
    }
  }

  private startResourceMonitoring(): void {
    this.resourceMonitor = setInterval(() => {
      this.updateSystemLoad();
    }, 5000); // Update every 5 seconds

    this.logger.debug('Resource monitoring started');
  }

  private updateSystemLoad(): void {
    const memUsage = process.memoryUsage();
    const totalMem = require('os').totalmem();

    this.systemLoad = {
      memoryUsage: Math.round((memUsage.heapUsed / totalMem) * 100),
      cpuUsage: this.getCpuUsage(), // Simplified CPU usage estimation
      taskCount: this.activeTasks.size,
      lastUpdated: new Date(),
    };

    this.emit('system:load', this.systemLoad);
  }

  private getCpuUsage(): number {
    // Simplified CPU usage calculation
    // In production, you might want to use a more sophisticated approach
    const usage = process.cpuUsage();
    const total = usage.user + usage.system;
    return Math.min(Math.round(((total / 1000000) * 100) / this.config.maxConcurrentTasks), 100);
  }

  private setupEventListeners(): void {
    // Agent pool events
    this.agentPool.on('agent:started', (event: any) => {
      this.emit('agent:started', event);
    });

    this.agentPool.on('agent:completed', (event: any) => {
      this.emit('agent:completed', event);
    });

    // Worktree manager events
    this.worktreeManager.on('worktree:created', (event: any) => {
      this.emit('worktree:created', event);
    });

    // Task executor events
    this.taskExecutor.on('executor:progress', (progress: TaskProgress) => {
      this.updateTaskProgress(progress);
    });

    this.taskExecutor.on('executor:error', (error: any) => {
      this.emit('task:error', error);
    });

    // Resource monitoring events from task executor
    this.taskExecutor.on('executor:resource-alert', (alert: any) => {
      this.logger.warning(
        `Resource alert from executor: ${alert.message} - ${JSON.stringify(alert)}`,
      );
      this.emit('resource:alert', alert);
    });

    this.taskExecutor.on('executor:process-throttled', (event: any) => {
      this.logger.warning(`Process throttled: ${event.taskId} - ${JSON.stringify(event)}`);
      this.emit('process:throttled', event);
    });

    this.taskExecutor.on('executor:task-terminated', (event: any) => {
      this.logger.error(`Task terminated: ${event.taskId} - ${JSON.stringify(event)}`);
      this.emit('task:terminated', event);

      // Clean up internal tracking
      this.activeTasks.delete(event.taskId);
      this.taskProgressTracking.delete(event.taskId);
      const taskResult = {
        taskId: event.taskId,
        status: 'cancelled' as const,
        output: `Task terminated due to resource violation: ${event.reason}`,
        errorMessage: event.reason,
        executionTime: 0,
        resourceUsage: { memoryPeak: 0, cpuTime: 0, diskIO: 0 },
        artifacts: [],
        metrics: { linesOfCode: 0, filesModified: 0, testsRun: 0, coveragePercent: 0 },
      };
      this.taskResults.set(event.taskId, taskResult);
    });

    this.logger.debug('Event listeners configured');
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down Claude Code Adapter...');

    try {
      // Stop resource monitoring
      if (this.resourceMonitor) {
        clearInterval(this.resourceMonitor);
        this.resourceMonitor = null;
      }

      // Cancel all active tasks
      const cancelPromises = Array.from(this.activeTasks.keys()).map((taskId) =>
        this.cancelTask(taskId).catch((error) =>
          this.logger.error(
            `Error cancelling task ${taskId}: ${error instanceof Error ? error.message : String(error)}`,
          ),
        ),
      );

      await Promise.all(cancelPromises);

      // Shutdown task executor (includes resource monitor)
      await this.taskExecutor.shutdown();

      // Shutdown communication protocol
      await this.communicationProtocol.shutdown();

      // Clear all maps
      this.activeTasks.clear();
      this.taskProcesses.clear();
      this.taskResults.clear();
      this.taskProgressTracking.clear();

      this.logger.info('Claude Code Adapter shutdown complete');
      this.emit('adapter:shutdown');
    } catch (error) {
      this.logger.error(
        `Error during adapter shutdown: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Get adapter metrics and statistics
   */
  public getMetrics(): {
    totalTasksExecuted: number;
    successfulTasks: number;
    failedTasks: number;
    averageExecutionTime: number;
    currentActiveTasks: number;
    resourceUtilization: typeof this.systemLoad;
    uptimeMs: number;
  } {
    const successful = Array.from(this.taskResults.values()).filter(
      (r) => r.status === 'success',
    ).length;
    const failed = Array.from(this.taskResults.values()).filter(
      (r) => r.status === 'failure',
    ).length;
    const total = this.taskResults.size;

    const executionTimes = Array.from(this.taskResults.values()).map((r) => r.executionTime);
    const avgExecutionTime =
      executionTimes.length > 0
        ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
        : 0;

    return {
      totalTasksExecuted: total,
      successfulTasks: successful,
      failedTasks: failed,
      averageExecutionTime: Math.round(avgExecutionTime),
      currentActiveTasks: this.activeTasks.size,
      resourceUtilization: { ...this.systemLoad },
      uptimeMs: process.uptime() * 1000,
    };
  }
}
