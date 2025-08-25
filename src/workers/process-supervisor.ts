/**
 * ProcessSupervisor - Advanced Process Lifecycle Management
 * 
 * Provides comprehensive process supervision, health monitoring, and lifecycle management
 * for worker processes with automatic recovery, resource enforcement, and cross-platform support.
 */

import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import * as os from 'os';
import * as fs from 'fs-extra';
import * as path from 'path';
import { LogContext } from '../utils/logger';
import { withErrorHandling, ErrorCategory } from '../utils/errors';
import { PidRegistry, ProcessInfo, ProcessHealthStatus, ProcessStatus } from './pid-registry';
import { ProcessMonitor, ProcessMonitoringData } from './process-monitor';

export interface ProcessSupervisorConfig {
  // Process limits
  maxProcesses: number;
  defaultTimeout: number;
  gracefulShutdownTimeoutMs: number;
  forceKillTimeoutMs: number;
  
  // Resource limits per process
  resourceLimits: {
    maxMemoryMB: number;
    maxCpuPercent: number;
    maxExecutionTimeMs: number;
    maxFileHandles: number;
  };
  
  // Health monitoring
  healthCheckInterval: number;
  restartAttempts: number;
  restartDelay: number;
  
  // Cleanup settings
  orphanCleanupInterval: number;
  processHistoryRetention: number;
  
  // Security settings
  enableSandboxing: boolean;
  allowedCommands: string[];
  restrictedPaths: string[];
}

export interface SupervisedProcessOptions {
  // Process identification
  taskId: string;
  agentType: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  
  // Execution context
  command: string;
  args: string[];
  workingDir: string;
  env?: Record<string, string>;
  
  // Resource constraints
  resourceLimits?: Partial<ProcessSupervisorConfig['resourceLimits']>;
  timeout?: number;
  
  // Recovery settings
  autoRestart?: boolean;
  maxRestarts?: number;
  
  // Monitoring
  enableHealthCheck?: boolean;
  healthCheckCommand?: string;
  
  // Metadata
  metadata?: Record<string, any>;
}

export interface ProcessSupervisorStats {
  // Process counts
  activeProcesses: number;
  idleProcesses: number;
  errorProcesses: number;
  totalProcesses: number;
  
  // Resource usage
  totalMemoryMB: number;
  totalCpuPercent: number;
  systemLoadPercent: number;
  
  // Operations
  processesStarted: number;
  processesCompleted: number;
  processesFailed: number;
  processesRestarted: number;
  orphansCleanedUp: number;
  
  // Health status
  healthyProcesses: number;
  unhealthyProcesses: number;
  lastHealthCheck: Date;
  
  // System status
  supervisorUptime: number;
  lastCleanup: Date;
}

export class ProcessSupervisor extends EventEmitter {
  private config: ProcessSupervisorConfig;
  private logger: LogContext;
  private pidRegistry: PidRegistry;
  private processMonitor: ProcessMonitor;
  
  // Process management
  private activeProcesses: Map<string, ChildProcess>;
  private processOptions: Map<string, SupervisedProcessOptions>;
  private restartCounts: Map<string, number>;
  private shutdownInProgress: boolean = false;
  
  // Monitoring and cleanup
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private orphanCleanupInterval: NodeJS.Timeout | null = null;
  private statsInterval: NodeJS.Timeout | null = null;
  
  // Statistics
  private stats: ProcessSupervisorStats;
  private startTime: Date;

  constructor(config: ProcessSupervisorConfig) {
    super();
    this.config = config;
    this.logger = new LogContext('ProcessSupervisor');
    this.pidRegistry = new PidRegistry();
    this.processMonitor = new ProcessMonitor(config.resourceLimits);
    
    this.activeProcesses = new Map();
    this.processOptions = new Map();
    this.restartCounts = new Map();
    
    this.startTime = new Date();
    this.stats = this.initializeStats();
    
    this.setupEventHandlers();
  }

  /**
   * Initialize the process supervisor
   */
  public async initialize(): Promise<void> {
    this.logger.info('Initializing Process Supervisor...');

    try {
      await withErrorHandling(
        async () => {
          // Initialize components
          await this.pidRegistry.initialize();
          await this.processMonitor.initialize();
          
          // Start monitoring intervals
          this.startHealthChecking();
          this.startOrphanCleanup();
          this.startStatsCollection();
          
          // Setup cleanup handlers
          this.setupCleanupHandlers();
          
          // Clean up any existing orphaned processes
          await this.cleanupOrphanedProcesses();
        },
        {
          operationName: 'process-supervisor-init',
          category: ErrorCategory.CONFIGURATION,
          retries: 2,
          timeoutMs: 30000,
        }
      );

      this.logger.info('Process Supervisor initialized successfully');
      this.emit('supervisor:initialized', this.getStats());

    } catch (error) {
      this.logger.error('Failed to initialize Process Supervisor', error);
      throw error;
    }
  }

  /**
   * Start a new supervised process
   */
  public async startProcess(options: SupervisedProcessOptions): Promise<string> {
    const processId = this.generateProcessId(options.taskId, options.agentType);
    
    this.logger.info(`Starting supervised process: ${processId}`);
    
    // Validate system capacity
    await this.validateSystemCapacity();
    
    // Validate command security
    await this.validateCommandSecurity(options);
    
    // Prepare execution environment
    const executionEnv = await this.prepareExecutionEnvironment(options);
    
    try {
      const process = await this.spawnSupervisedProcess(processId, options, executionEnv);
      
      // Register with all tracking systems
      await this.registerProcess(processId, process, options);
      
      // Start monitoring
      await this.startProcessMonitoring(processId, process);
      
      this.stats.processesStarted++;
      this.emit('process:started', { processId, pid: process.pid, options });
      
      this.logger.info(`Process started successfully: ${processId} (PID: ${process.pid})`);
      return processId;
      
    } catch (error) {
      this.logger.error(`Failed to start process: ${processId}`, error);
      this.stats.processesFailed++;
      throw error;
    }
  }

  /**
   * Stop a supervised process gracefully
   */
  public async stopProcess(processId: string, reason?: string): Promise<void> {
    this.logger.info(`Stopping supervised process: ${processId} - Reason: ${reason || 'User request'}`);
    
    const process = this.activeProcesses.get(processId);
    if (!process) {
      this.logger.warning(`Process not found for stopping: ${processId}`);
      return;
    }

    try {
      // Send graceful shutdown signal
      process.kill('SIGTERM');
      
      // Wait for graceful shutdown
      const shutdownPromise = new Promise<void>((resolve) => {
        process.once('exit', () => resolve());
      });
      
      const timeout = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('Graceful shutdown timeout')), 
                  this.config.gracefulShutdownTimeoutMs);
      });
      
      try {
        await Promise.race([shutdownPromise, timeout]);
        this.logger.info(`Process stopped gracefully: ${processId}`);
      } catch {
        // Force kill if graceful shutdown failed
        this.logger.warning(`Forcing process termination: ${processId}`);
        process.kill('SIGKILL');
        
        // Wait for force kill
        await new Promise<void>((resolve) => {
          process.once('exit', () => resolve());
          setTimeout(() => {
            this.logger.error(`Failed to force kill process: ${processId}`);
            resolve();
          }, this.config.forceKillTimeoutMs);
        });
      }
      
      this.stats.processesCompleted++;
      this.emit('process:stopped', { processId, reason });
      
    } catch (error) {
      this.logger.error(`Error stopping process: ${processId}`, error);
      this.stats.processesFailed++;
      throw error;
    }
  }

  /**
   * Restart a supervised process
   */
  public async restartProcess(processId: string, reason?: string): Promise<string> {
    this.logger.info(`Restarting supervised process: ${processId} - Reason: ${reason || 'Manual restart'}`);
    
    const options = this.processOptions.get(processId);
    if (!options) {
      throw new Error(`Cannot restart process: options not found for ${processId}`);
    }
    
    // Check restart limits
    const restartCount = this.restartCounts.get(processId) || 0;
    const maxRestarts = options.maxRestarts || this.config.restartAttempts;
    
    if (restartCount >= maxRestarts) {
      throw new Error(`Maximum restart attempts reached for process: ${processId} (${restartCount}/${maxRestarts})`);
    }
    
    try {
      // Stop existing process
      await this.stopProcess(processId, `Restart attempt ${restartCount + 1}`);
      
      // Wait for restart delay
      if (this.config.restartDelay > 0) {
        await this.sleep(this.config.restartDelay);
      }
      
      // Start new process with same options
      const newProcessId = await this.startProcess({
        ...options,
        taskId: `${options.taskId}-restart-${restartCount + 1}`
      });
      
      // Update restart count
      this.restartCounts.set(processId, restartCount + 1);
      this.stats.processesRestarted++;
      
      this.emit('process:restarted', { 
        oldProcessId: processId, 
        newProcessId, 
        restartCount: restartCount + 1,
        reason 
      });
      
      return newProcessId;
      
    } catch (error) {
      this.logger.error(`Failed to restart process: ${processId}`, error);
      throw error;
    }
  }

  /**
   * Get process information
   */
  public getProcessInfo(processId: string): ProcessInfo | null {
    return this.pidRegistry.getProcessInfo(processId);
  }

  /**
   * Get all supervised processes
   */
  public getAllProcesses(): ProcessInfo[] {
    return this.pidRegistry.getAllProcesses();
  }

  /**
   * Get processes by status
   */
  public getProcessesByHealth(healthStatus: ProcessHealthStatus): ProcessInfo[] {
    return this.pidRegistry.getProcessesByHealth(healthStatus);
  }

  public getProcessesByStatus(status: ProcessStatus): ProcessInfo[] {
    return this.pidRegistry.getProcessesByStatus(status);
  }

  /**
   * Get process monitoring data
   */
  public getProcessMonitoringData(processId: string): ProcessMonitoringData | null {
    const processInfo = this.pidRegistry.getProcessInfo(processId);
    if (!processInfo) return null;
    
    return this.processMonitor.getProcessData(processInfo.pid);
  }

  /**
   * Get supervisor statistics
   */
  public getStats(): ProcessSupervisorStats {
    // Update real-time stats
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * Perform health check on all processes
   */
  public async performHealthCheck(): Promise<Map<string, ProcessHealthStatus>> {
    this.logger.debug('Performing health check on all supervised processes');
    
    const healthStatuses = new Map<string, ProcessHealthStatus>();
    const processes = this.getAllProcesses();
    
    for (const processInfo of processes) {
      try {
        const health = await this.checkProcessHealth(processInfo);
        healthStatuses.set(processInfo.processId, health);
        
        // Update registry with health status
        await this.pidRegistry.updateProcessHealth(processInfo.processId, health);
        
        // Handle unhealthy processes
        if (health === 'unhealthy' || health === 'crashed') {
          await this.handleUnhealthyProcess(processInfo, health);
        }
        
      } catch (error) {
        this.logger.error(`Health check failed for process ${processInfo.processId}`, error);
        healthStatuses.set(processInfo.processId, 'unknown');
      }
    }
    
    this.stats.lastHealthCheck = new Date();
    return healthStatuses;
  }

  /**
   * Clean up orphaned processes
   */
  public async cleanupOrphanedProcesses(): Promise<number> {
    this.logger.info('Cleaning up orphaned processes...');
    
    try {
      const orphanCount = await this.pidRegistry.cleanupOrphanedProcesses();
      
      if (orphanCount > 0) {
        this.logger.info(`Cleaned up ${orphanCount} orphaned processes`);
        this.stats.orphansCleanedUp += orphanCount;
        this.emit('supervisor:orphans-cleaned', { count: orphanCount });
      }
      
      this.stats.lastCleanup = new Date();
      return orphanCount;
      
    } catch (error) {
      this.logger.error('Failed to clean up orphaned processes', error);
      throw error;
    }
  }

  /**
   * Shutdown the process supervisor
   */
  public async shutdown(): Promise<void> {
    if (this.shutdownInProgress) {
      this.logger.warning('Shutdown already in progress');
      return;
    }
    
    this.shutdownInProgress = true;
    this.logger.info('Shutting down Process Supervisor...');

    try {
      // Stop monitoring intervals
      this.stopMonitoringIntervals();
      
      // Get all active processes
      const activeProcessIds = Array.from(this.activeProcesses.keys());
      
      if (activeProcessIds.length > 0) {
        this.logger.info(`Stopping ${activeProcessIds.length} active processes...`);
        
        // Stop all processes gracefully
        const stopPromises = activeProcessIds.map(processId => 
          this.stopProcess(processId, 'Supervisor shutdown')
            .catch(error => this.logger.error(`Failed to stop process ${processId}`, error))
        );
        
        await Promise.allSettled(stopPromises);
      }
      
      // Shutdown components
      await this.processMonitor.shutdown();
      await this.pidRegistry.shutdown();
      
      // Clear tracking data
      this.activeProcesses.clear();
      this.processOptions.clear();
      this.restartCounts.clear();
      
      this.logger.info('Process Supervisor shutdown complete');
      this.emit('supervisor:shutdown', this.getStats());
      
    } catch (error) {
      this.logger.error('Error during Process Supervisor shutdown', error);
      throw error;
    } finally {
      this.shutdownInProgress = false;
    }
  }

  // Private methods

  private initializeStats(): ProcessSupervisorStats {
    return {
      activeProcesses: 0,
      idleProcesses: 0,
      errorProcesses: 0,
      totalProcesses: 0,
      totalMemoryMB: 0,
      totalCpuPercent: 0,
      systemLoadPercent: 0,
      processesStarted: 0,
      processesCompleted: 0,
      processesFailed: 0,
      processesRestarted: 0,
      orphansCleanedUp: 0,
      healthyProcesses: 0,
      unhealthyProcesses: 0,
      lastHealthCheck: new Date(),
      supervisorUptime: 0,
      lastCleanup: new Date()
    };
  }

  private generateProcessId(taskId: string, agentType: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${agentType}-${taskId}-${timestamp}-${random}`;
  }

  private async validateSystemCapacity(): Promise<void> {
    const currentProcessCount = this.activeProcesses.size;
    
    if (currentProcessCount >= this.config.maxProcesses) {
      throw new Error(
        `Maximum process limit reached: ${currentProcessCount}/${this.config.maxProcesses}`
      );
    }
    
    // Check system resources
    const memInfo = process.memoryUsage();
    const totalMemMB = os.totalmem() / (1024 * 1024);
    const usedMemMB = (os.totalmem() - os.freemem()) / (1024 * 1024);
    const memUsagePercent = (usedMemMB / totalMemMB) * 100;
    
    if (memUsagePercent > 85) {
      throw new Error(
        `System memory usage too high: ${memUsagePercent.toFixed(1)}% (limit: 85%)`
      );
    }
    
    const loadAvg = os.loadavg()[0];
    const cpuCount = os.cpus().length;
    const loadPercent = (loadAvg / cpuCount) * 100;
    
    if (loadPercent > 80) {
      throw new Error(
        `System CPU load too high: ${loadPercent.toFixed(1)}% (limit: 80%)`
      );
    }
  }

  private async validateCommandSecurity(options: SupervisedProcessOptions): Promise<void> {
    if (!this.config.enableSandboxing) {
      return; // Skip security validation if sandboxing is disabled
    }
    
    // Check if command is allowed
    const command = path.basename(options.command);
    if (!this.config.allowedCommands.includes(command)) {
      throw new Error(`Command not allowed: ${command}`);
    }
    
    // Check working directory is not restricted
    const workingDir = path.resolve(options.workingDir);
    for (const restrictedPath of this.config.restrictedPaths) {
      const resolvedRestricted = path.resolve(restrictedPath);
      if (workingDir.startsWith(resolvedRestricted)) {
        throw new Error(`Working directory is restricted: ${workingDir}`);
      }
    }
  }

  private async prepareExecutionEnvironment(
    options: SupervisedProcessOptions
  ): Promise<Record<string, string>> {
    // Prepare environment variables
    const env: Record<string, string> = {
      ...process.env,
      ...options.env,
      // Add supervisor context
      FF2_SUPERVISED: 'true',
      FF2_SUPERVISOR_PID: String(process.pid),
      FF2_PROCESS_ID: this.generateProcessId(options.taskId, options.agentType),
      FF2_TASK_ID: options.taskId,
      FF2_AGENT_TYPE: options.agentType,
      FF2_PRIORITY: options.priority,
      // Resource limits
      FF2_MAX_MEMORY_MB: String(options.resourceLimits?.maxMemoryMB || this.config.resourceLimits.maxMemoryMB),
      FF2_MAX_CPU_PERCENT: String(options.resourceLimits?.maxCpuPercent || this.config.resourceLimits.maxCpuPercent),
      FF2_MAX_EXECUTION_TIME: String(options.timeout || this.config.defaultTimeout),
    };
    
    return env;
  }

  private async spawnSupervisedProcess(
    processId: string,
    options: SupervisedProcessOptions,
    env: Record<string, string>
  ): Promise<ChildProcess> {
    
    const process = spawn(options.command, options.args, {
      cwd: options.workingDir,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false, // Keep attached to supervisor
    });
    
    if (!process.pid) {
      throw new Error(`Failed to spawn process: ${processId}`);
    }
    
    // Store process and options
    this.activeProcesses.set(processId, process);
    this.processOptions.set(processId, options);
    
    return process;
  }

  private async registerProcess(
    processId: string,
    process: ChildProcess,
    options: SupervisedProcessOptions
  ): Promise<void> {
    
    // Register with PID registry
    await this.pidRegistry.registerProcess({
      processId,
      pid: process.pid!,
      taskId: options.taskId,
      agentType: options.agentType,
      command: options.command,
      args: options.args,
      workingDir: options.workingDir,
      priority: options.priority,
      startTime: new Date(),
      status: 'running',
      healthStatus: 'healthy',
      metadata: options.metadata || {}
    });
    
    // Register with process monitor
    this.processMonitor.registerProcess(processId, process.pid!);
  }

  private async startProcessMonitoring(processId: string, process: ChildProcess): Promise<void> {
    // Set up process event handlers
    process.on('exit', async (code, signal) => {
      await this.handleProcessExit(processId, code, signal);
    });
    
    process.on('error', async (error) => {
      await this.handleProcessError(processId, error);
    });
    
    // Start resource monitoring
    await this.processMonitor.startMonitoring(processId);
  }

  private async handleProcessExit(
    processId: string,
    code: number | null,
    signal: string | null
  ): Promise<void> {
    
    this.logger.info(`Process exited: ${processId} (code: ${code}, signal: ${signal})`);
    
    try {
      // Update registry
      await this.pidRegistry.updateProcessStatus(processId, 'stopped');
      
      // Stop monitoring
      this.processMonitor.stopMonitoring(processId);
      
      // Clean up tracking
      this.activeProcesses.delete(processId);
      
      // Check if auto-restart is enabled
      const options = this.processOptions.get(processId);
      if (options?.autoRestart && !this.shutdownInProgress) {
        const shouldRestart = code !== 0 || signal !== null; // Restart on failure
        
        if (shouldRestart) {
          this.logger.info(`Auto-restarting failed process: ${processId}`);
          try {
            await this.restartProcess(processId, `Process failed (code: ${code}, signal: ${signal})`);
          } catch (error) {
            this.logger.error(`Auto-restart failed for process: ${processId}`, error);
          }
        }
      }
      
      this.emit('process:exited', { processId, code, signal });
      
    } catch (error) {
      this.logger.error(`Error handling process exit: ${processId}`, error);
    }
  }

  private async handleProcessError(processId: string, error: Error): Promise<void> {
    this.logger.error(`Process error: ${processId}`, error);
    
    try {
      // Update registry
      await this.pidRegistry.updateProcessStatus(processId, 'error');
      await this.pidRegistry.updateProcessHealth(processId, 'crashed');
      
      this.emit('process:error', { processId, error });
      
    } catch (registryError) {
      this.logger.error(`Error updating registry for process error: ${processId}`, registryError);
    }
  }

  private async checkProcessHealth(processInfo: ProcessInfo): Promise<ProcessHealthStatus> {
    try {
      // Check if process is still running
      if (!this.isProcessRunning(processInfo.pid)) {
        return 'crashed';
      }
      
      // Check resource usage
      const monitoringData = this.processMonitor.getProcessData(processInfo.pid);
      if (monitoringData) {
        // Check memory limit
        if (monitoringData.memoryMB > this.config.resourceLimits.maxMemoryMB) {
          return 'unhealthy';
        }
        
        // Check CPU limit
        if (monitoringData.cpuPercent > this.config.resourceLimits.maxCpuPercent) {
          return 'unhealthy';
        }
        
        // Check execution time
        const executionTime = Date.now() - processInfo.startTime.getTime();
        if (executionTime > this.config.resourceLimits.maxExecutionTimeMs) {
          return 'unhealthy';
        }
      }
      
      // Run custom health check if configured
      const options = this.processOptions.get(processInfo.processId);
      if (options?.enableHealthCheck && options.healthCheckCommand) {
        const isHealthy = await this.runCustomHealthCheck(processInfo, options.healthCheckCommand);
        return isHealthy ? 'healthy' : 'unhealthy';
      }
      
      return 'healthy';
      
    } catch (error) {
      this.logger.error(`Health check failed for process ${processInfo.processId}`, error);
      return 'unknown';
    }
  }

  private isProcessRunning(pid: number): boolean {
    try {
      // On Unix-like systems, sending signal 0 checks if process exists
      // On Windows, this will throw if process doesn't exist
      process.kill(pid, 0);
      return true;
    } catch (error: any) {
      // ESRCH means process not found
      // EPERM means we don't have permission but process exists
      return error.code === 'EPERM';
    }
  }

  private async runCustomHealthCheck(
    processInfo: ProcessInfo,
    healthCheckCommand: string
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const [command, ...args] = healthCheckCommand.split(' ');
      const healthCheck = spawn(command, args, {
        cwd: processInfo.workingDir,
        stdio: 'ignore',
        timeout: 5000 // 5 second timeout
      });
      
      healthCheck.on('close', (code) => {
        resolve(code === 0);
      });
      
      healthCheck.on('error', () => {
        resolve(false);
      });
    });
  }

  private async handleUnhealthyProcess(
    processInfo: ProcessInfo,
    healthStatus: ProcessHealthStatus
  ): Promise<void> {
    
    this.logger.warning(`Unhealthy process detected: ${processInfo.processId} (${healthStatus})`);
    
    const options = this.processOptions.get(processInfo.processId);
    if (!options?.autoRestart) {
      return; // Don't restart if auto-restart is disabled
    }
    
    try {
      if (healthStatus === 'crashed') {
        // Process is dead, restart it
        await this.restartProcess(processInfo.processId, 'Process crashed');
      } else if (healthStatus === 'unhealthy') {
        // Process is consuming too many resources, restart it
        await this.restartProcess(processInfo.processId, 'Process unhealthy (resource violation)');
      }
      
    } catch (error) {
      this.logger.error(`Failed to handle unhealthy process: ${processInfo.processId}`, error);
    }
  }

  private startHealthChecking(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        this.logger.error('Health check cycle failed', error);
      }
    }, this.config.healthCheckInterval);
    
    this.logger.debug(`Health checking started (interval: ${this.config.healthCheckInterval}ms)`);
  }

  private startOrphanCleanup(): void {
    this.orphanCleanupInterval = setInterval(async () => {
      try {
        await this.cleanupOrphanedProcesses();
      } catch (error) {
        this.logger.error('Orphan cleanup cycle failed', error);
      }
    }, this.config.orphanCleanupInterval);
    
    this.logger.debug(`Orphan cleanup started (interval: ${this.config.orphanCleanupInterval}ms)`);
  }

  private startStatsCollection(): void {
    this.statsInterval = setInterval(() => {
      this.updateStats();
    }, 10000); // Update stats every 10 seconds
    
    this.logger.debug('Stats collection started');
  }

  private stopMonitoringIntervals(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    if (this.orphanCleanupInterval) {
      clearInterval(this.orphanCleanupInterval);
      this.orphanCleanupInterval = null;
    }
    
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }

  private updateStats(): void {
    const processes = this.getAllProcesses();
    
    // Count processes by status
    this.stats.activeProcesses = processes.filter(p => p.status === 'running').length;
    this.stats.idleProcesses = processes.filter(p => p.status === 'idle').length;
    this.stats.errorProcesses = processes.filter(p => p.status === 'error').length;
    this.stats.totalProcesses = processes.length;
    
    // Count by health status
    this.stats.healthyProcesses = processes.filter(p => p.healthStatus === 'healthy').length;
    this.stats.unhealthyProcesses = processes.filter(p => p.healthStatus === 'unhealthy').length;
    
    // Calculate resource usage
    let totalMemoryMB = 0;
    let totalCpuPercent = 0;
    
    for (const processInfo of processes) {
      const monitoringData = this.processMonitor.getProcessData(processInfo.pid);
      if (monitoringData) {
        totalMemoryMB += monitoringData.memoryMB;
        totalCpuPercent += monitoringData.cpuPercent;
      }
    }
    
    this.stats.totalMemoryMB = totalMemoryMB;
    this.stats.totalCpuPercent = totalCpuPercent;
    
    // System load
    const loadAvg = os.loadavg()[0];
    const cpuCount = os.cpus().length;
    this.stats.systemLoadPercent = (loadAvg / cpuCount) * 100;
    
    // Supervisor uptime
    this.stats.supervisorUptime = Date.now() - this.startTime.getTime();
  }

  private setupEventHandlers(): void {
    // Handle process monitor events
    this.processMonitor.on('resource-violation', async (event: any) => {
      this.logger.warning(`Resource violation detected: ${event.processId}`, event);
      
      if (event.severity === 'critical') {
        // Force restart the violating process
        try {
          await this.restartProcess(event.processId, `Resource violation: ${event.type}`);
        } catch (error) {
          this.logger.error(`Failed to restart violating process: ${event.processId}`, error);
        }
      }
    });
    
    // Handle registry events
    this.pidRegistry.on('process-updated', (event: any) => {
      this.emit('supervisor:process-updated', event);
    });
  }

  private setupCleanupHandlers(): void {
    // Handle process exit
    process.on('SIGINT', () => this.shutdown().catch(console.error));
    process.on('SIGTERM', () => this.shutdown().catch(console.error));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception in ProcessSupervisor', error);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled rejection in ProcessSupervisor', { reason, promise });
    });
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}