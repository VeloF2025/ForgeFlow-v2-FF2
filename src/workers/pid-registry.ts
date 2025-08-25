/**
 * PidRegistry - Advanced Process Tracking and Registry
 * 
 * Provides comprehensive process tracking, metadata management, and lifecycle
 * monitoring with persistent storage and cross-platform process management.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { LogContext } from '../utils/logger';
import { withErrorHandling, ErrorCategory } from '../utils/errors';

export type ProcessStatus = 'starting' | 'running' | 'idle' | 'stopping' | 'stopped' | 'error' | 'crashed';
export type ProcessHealthStatus = 'healthy' | 'unhealthy' | 'unknown' | 'crashed';
export type ProcessPriority = 'low' | 'normal' | 'high' | 'critical';

export interface ProcessInfo {
  // Basic identification
  processId: string;
  pid: number;
  taskId: string;
  agentType: string;
  
  // Process details
  command: string;
  args: string[];
  workingDir: string;
  priority: ProcessPriority;
  
  // Timing information
  startTime: Date;
  lastActive: Date;
  endTime?: Date;
  
  // Status tracking
  status: ProcessStatus;
  healthStatus: ProcessHealthStatus;
  
  // Resource tracking
  resourceUsage: {
    memoryMB: number;
    cpuPercent: number;
    executionTimeMs: number;
    fileHandles: number;
  };
  
  // Lifecycle tracking
  restartCount: number;
  lastRestart?: Date;
  exitCode?: number;
  exitSignal?: string;
  
  // Metadata
  metadata: Record<string, any>;
  tags: string[];
  
  // Parent/child relationships
  parentPid?: number;
  childPids: number[];
}

export interface ProcessQueryOptions {
  // Filtering
  status?: ProcessStatus | ProcessStatus[];
  healthStatus?: ProcessHealthStatus | ProcessHealthStatus[];
  agentType?: string | string[];
  priority?: ProcessPriority | ProcessPriority[];
  taskId?: string;
  
  // Time range
  startedAfter?: Date;
  startedBefore?: Date;
  activeWithin?: number; // milliseconds
  
  // Resource constraints
  memoryAboveMB?: number;
  cpuAbovePercent?: number;
  
  // Sorting and pagination
  sortBy?: 'startTime' | 'lastActive' | 'memoryMB' | 'cpuPercent' | 'priority';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface ProcessRegistryStats {
  totalProcesses: number;
  processesByStatus: Record<ProcessStatus, number>;
  processesByHealth: Record<ProcessHealthStatus, number>;
  processesByAgent: Record<string, number>;
  processesByPriority: Record<ProcessPriority, number>;
  
  averageLifetime: number;
  averageMemoryUsage: number;
  averageCpuUsage: number;
  
  totalRestarts: number;
  orphanProcesses: number;
  stalePids: number;
  
  oldestProcess: Date | null;
  newestProcess: Date | null;
  lastCleanup: Date;
}

export class PidRegistry extends EventEmitter {
  private logger: LogContext;
  private processes: Map<string, ProcessInfo>;
  private pidToProcessId: Map<number, string>;
  private storageDir: string;
  private persistenceFile: string;
  
  // Configuration
  private readonly PERSISTENCE_INTERVAL = 30000; // 30 seconds
  private readonly MAX_PROCESS_HISTORY = 10000;
  private readonly STALE_PROCESS_THRESHOLD = 3600000; // 1 hour
  
  // Monitoring
  private persistenceInterval: NodeJS.Timeout | null = null;
  private lastPersistence: Date = new Date();

  constructor(storageDir?: string) {
    super();
    this.logger = new LogContext('PidRegistry');
    this.processes = new Map();
    this.pidToProcessId = new Map();
    
    this.storageDir = storageDir || path.join(os.tmpdir(), '.ff2-pid-registry');
    this.persistenceFile = path.join(this.storageDir, 'process-registry.json');
  }

  /**
   * Initialize the PID registry
   */
  public async initialize(): Promise<void> {
    this.logger.info('Initializing PID Registry...');

    try {
      await withErrorHandling(
        async () => {
          // Ensure storage directory exists
          await fs.ensureDir(this.storageDir);
          
          // Load existing process data
          await this.loadProcessData();
          
          // Clean up stale entries
          await this.cleanupStaleProcesses();
          
          // Start persistence interval
          this.startPersistence();
          
          // Setup cleanup handlers
          this.setupCleanupHandlers();
        },
        {
          operationName: 'pid-registry-init',
          category: ErrorCategory.CONFIGURATION,
          retries: 2,
          timeoutMs: 10000,
        }
      );

      this.logger.info(`PID Registry initialized with ${this.processes.size} processes`);
      this.emit('registry:initialized', this.getStats());

    } catch (error) {
      this.logger.error('Failed to initialize PID Registry', error);
      throw error;
    }
  }

  /**
   * Register a new process
   */
  public async registerProcess(processInfo: Omit<ProcessInfo, 'lastActive' | 'resourceUsage' | 'restartCount' | 'tags' | 'childPids'>): Promise<void> {
    const fullProcessInfo: ProcessInfo = {
      ...processInfo,
      lastActive: new Date(),
      resourceUsage: {
        memoryMB: 0,
        cpuPercent: 0,
        executionTimeMs: 0,
        fileHandles: 0,
      },
      restartCount: 0,
      tags: [],
      childPids: [],
    };

    this.processes.set(processInfo.processId, fullProcessInfo);
    this.pidToProcessId.set(processInfo.pid, processInfo.processId);
    
    this.logger.debug(`Registered process: ${processInfo.processId} (PID: ${processInfo.pid})`);
    this.emit('process:registered', fullProcessInfo);
    
    // Persist immediately for critical operations
    if (processInfo.priority === 'critical') {
      await this.persistProcessData();
    }
  }

  /**
   * Unregister a process
   */
  public async unregisterProcess(processId: string): Promise<void> {
    const processInfo = this.processes.get(processId);
    if (!processInfo) {
      this.logger.warning(`Cannot unregister unknown process: ${processId}`);
      return;
    }

    // Update final status
    processInfo.endTime = new Date();
    processInfo.status = 'stopped';
    
    // Keep in history but mark as ended
    this.pidToProcessId.delete(processInfo.pid);
    
    this.logger.debug(`Unregistered process: ${processId} (PID: ${processInfo.pid})`);
    this.emit('process:unregistered', processInfo);
  }

  /**
   * Update process status
   */
  public async updateProcessStatus(processId: string, status: ProcessStatus): Promise<void> {
    const processInfo = this.processes.get(processId);
    if (!processInfo) {
      this.logger.warning(`Cannot update status for unknown process: ${processId}`);
      return;
    }

    const oldStatus = processInfo.status;
    processInfo.status = status;
    processInfo.lastActive = new Date();
    
    this.logger.debug(`Process status updated: ${processId} (${oldStatus} → ${status})`);
    this.emit('process:status-updated', { processId, oldStatus, newStatus: status, processInfo });
  }

  /**
   * Update process health status
   */
  public async updateProcessHealth(processId: string, healthStatus: ProcessHealthStatus): Promise<void> {
    const processInfo = this.processes.get(processId);
    if (!processInfo) {
      this.logger.warning(`Cannot update health for unknown process: ${processId}`);
      return;
    }

    const oldHealth = processInfo.healthStatus;
    processInfo.healthStatus = healthStatus;
    processInfo.lastActive = new Date();
    
    this.logger.debug(`Process health updated: ${processId} (${oldHealth} → ${healthStatus})`);
    this.emit('process:health-updated', { processId, oldHealth, newHealth: healthStatus, processInfo });
  }

  /**
   * Update process resource usage
   */
  public async updateProcessResources(
    processId: string,
    resourceUsage: Partial<ProcessInfo['resourceUsage']>
  ): Promise<void> {
    const processInfo = this.processes.get(processId);
    if (!processInfo) {
      return; // Silently ignore - process may have been unregistered
    }

    Object.assign(processInfo.resourceUsage, resourceUsage);
    processInfo.lastActive = new Date();
    
    // Update execution time
    processInfo.resourceUsage.executionTimeMs = Date.now() - processInfo.startTime.getTime();
    
    this.emit('process:resources-updated', { processId, resourceUsage: processInfo.resourceUsage });
  }

  /**
   * Add process tags
   */
  public addProcessTags(processId: string, tags: string[]): void {
    const processInfo = this.processes.get(processId);
    if (!processInfo) {
      this.logger.warning(`Cannot add tags to unknown process: ${processId}`);
      return;
    }

    for (const tag of tags) {
      if (!processInfo.tags.includes(tag)) {
        processInfo.tags.push(tag);
      }
    }
    
    this.emit('process:tags-updated', { processId, tags: processInfo.tags });
  }

  /**
   * Remove process tags
   */
  public removeProcessTags(processId: string, tags: string[]): void {
    const processInfo = this.processes.get(processId);
    if (!processInfo) {
      this.logger.warning(`Cannot remove tags from unknown process: ${processId}`);
      return;
    }

    processInfo.tags = processInfo.tags.filter(tag => !tags.includes(tag));
    this.emit('process:tags-updated', { processId, tags: processInfo.tags });
  }

  /**
   * Record process exit information
   */
  public async recordProcessExit(
    processId: string,
    exitCode: number | null,
    exitSignal: string | null
  ): Promise<void> {
    const processInfo = this.processes.get(processId);
    if (!processInfo) {
      this.logger.warning(`Cannot record exit for unknown process: ${processId}`);
      return;
    }

    processInfo.endTime = new Date();
    processInfo.exitCode = exitCode || undefined;
    processInfo.exitSignal = exitSignal || undefined;
    processInfo.status = exitCode === 0 ? 'stopped' : 'error';
    processInfo.healthStatus = exitCode === 0 ? 'healthy' : 'crashed';
    
    this.logger.debug(`Process exit recorded: ${processId} (code: ${exitCode}, signal: ${exitSignal})`);
    this.emit('process:exited', { processId, exitCode, exitSignal, processInfo });
  }

  /**
   * Record process restart
   */
  public async recordProcessRestart(processId: string, newPid: number): Promise<void> {
    const processInfo = this.processes.get(processId);
    if (!processInfo) {
      this.logger.warning(`Cannot record restart for unknown process: ${processId}`);
      return;
    }

    // Update PID mapping
    this.pidToProcessId.delete(processInfo.pid);
    this.pidToProcessId.set(newPid, processId);
    
    // Update process info
    processInfo.pid = newPid;
    processInfo.restartCount++;
    processInfo.lastRestart = new Date();
    processInfo.startTime = new Date();
    processInfo.lastActive = new Date();
    processInfo.status = 'running';
    processInfo.healthStatus = 'healthy';
    processInfo.exitCode = undefined;
    processInfo.exitSignal = undefined;
    processInfo.endTime = undefined;
    
    // Reset resource usage
    processInfo.resourceUsage = {
      memoryMB: 0,
      cpuPercent: 0,
      executionTimeMs: 0,
      fileHandles: 0,
    };
    
    this.logger.info(`Process restart recorded: ${processId} (new PID: ${newPid}, restart count: ${processInfo.restartCount})`);
    this.emit('process:restarted', { processId, newPid, restartCount: processInfo.restartCount });
  }

  /**
   * Get process information by process ID
   */
  public getProcessInfo(processId: string): ProcessInfo | null {
    return this.processes.get(processId) || null;
  }

  /**
   * Get process information by PID
   */
  public getProcessInfoByPid(pid: number): ProcessInfo | null {
    const processId = this.pidToProcessId.get(pid);
    return processId ? this.processes.get(processId) || null : null;
  }

  /**
   * Get all processes
   */
  public getAllProcesses(): ProcessInfo[] {
    return Array.from(this.processes.values());
  }

  /**
   * Get processes by status
   */
  public getProcessesByStatus(status: ProcessStatus | ProcessStatus[]): ProcessInfo[] {
    const statuses = Array.isArray(status) ? status : [status];
    return this.getAllProcesses().filter(p => statuses.includes(p.status));
  }

  /**
   * Get processes by health status
   */
  public getProcessesByHealth(healthStatus: ProcessHealthStatus | ProcessHealthStatus[]): ProcessInfo[] {
    const healths = Array.isArray(healthStatus) ? healthStatus : [healthStatus];
    return this.getAllProcesses().filter(p => healths.includes(p.healthStatus));
  }

  /**
   * Get processes by agent type
   */
  public getProcessesByAgent(agentType: string | string[]): ProcessInfo[] {
    const agents = Array.isArray(agentType) ? agentType : [agentType];
    return this.getAllProcesses().filter(p => agents.includes(p.agentType));
  }

  /**
   * Query processes with advanced filtering
   */
  public queryProcesses(options: ProcessQueryOptions): ProcessInfo[] {
    let results = this.getAllProcesses();
    
    // Apply filters
    if (options.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      results = results.filter(p => statuses.includes(p.status));
    }
    
    if (options.healthStatus) {
      const healths = Array.isArray(options.healthStatus) ? options.healthStatus : [options.healthStatus];
      results = results.filter(p => healths.includes(p.healthStatus));
    }
    
    if (options.agentType) {
      const agents = Array.isArray(options.agentType) ? options.agentType : [options.agentType];
      results = results.filter(p => agents.includes(p.agentType));
    }
    
    if (options.priority) {
      const priorities = Array.isArray(options.priority) ? options.priority : [options.priority];
      results = results.filter(p => priorities.includes(p.priority));
    }
    
    if (options.taskId) {
      results = results.filter(p => p.taskId === options.taskId);
    }
    
    if (options.startedAfter) {
      results = results.filter(p => p.startTime >= options.startedAfter!);
    }
    
    if (options.startedBefore) {
      results = results.filter(p => p.startTime <= options.startedBefore!);
    }
    
    if (options.activeWithin) {
      const cutoff = new Date(Date.now() - options.activeWithin);
      results = results.filter(p => p.lastActive >= cutoff);
    }
    
    if (options.memoryAboveMB) {
      results = results.filter(p => p.resourceUsage.memoryMB > options.memoryAboveMB!);
    }
    
    if (options.cpuAbovePercent) {
      results = results.filter(p => p.resourceUsage.cpuPercent > options.cpuAbovePercent!);
    }
    
    // Apply sorting
    if (options.sortBy) {
      const sortField = options.sortBy;
      const sortOrder = options.sortOrder || 'desc';
      
      results.sort((a, b) => {
        let aVal: any, bVal: any;
        
        switch (sortField) {
          case 'startTime':
            aVal = a.startTime.getTime();
            bVal = b.startTime.getTime();
            break;
          case 'lastActive':
            aVal = a.lastActive.getTime();
            bVal = b.lastActive.getTime();
            break;
          case 'memoryMB':
            aVal = a.resourceUsage.memoryMB;
            bVal = b.resourceUsage.memoryMB;
            break;
          case 'cpuPercent':
            aVal = a.resourceUsage.cpuPercent;
            bVal = b.resourceUsage.cpuPercent;
            break;
          case 'priority':
            const priorityOrder = { low: 0, normal: 1, high: 2, critical: 3 };
            aVal = priorityOrder[a.priority];
            bVal = priorityOrder[b.priority];
            break;
          default:
            return 0;
        }
        
        if (sortOrder === 'asc') {
          return aVal - bVal;
        } else {
          return bVal - aVal;
        }
      });
    }
    
    // Apply pagination
    if (options.offset || options.limit) {
      const start = options.offset || 0;
      const end = options.limit ? start + options.limit : undefined;
      results = results.slice(start, end);
    }
    
    return results;
  }

  /**
   * Get registry statistics
   */
  public getStats(): ProcessRegistryStats {
    const processes = this.getAllProcesses();
    
    // Count by status
    const processesByStatus: Record<ProcessStatus, number> = {
      starting: 0, running: 0, idle: 0, stopping: 0, stopped: 0, error: 0, crashed: 0
    };
    
    // Count by health
    const processesByHealth: Record<ProcessHealthStatus, number> = {
      healthy: 0, unhealthy: 0, unknown: 0, crashed: 0
    };
    
    // Count by agent type
    const processesByAgent: Record<string, number> = {};
    
    // Count by priority
    const processesByPriority: Record<ProcessPriority, number> = {
      low: 0, normal: 0, high: 0, critical: 0
    };
    
    let totalMemory = 0;
    let totalCpu = 0;
    let totalLifetime = 0;
    let totalRestarts = 0;
    let orphanCount = 0;
    let staleCount = 0;
    let oldestProcess: Date | null = null;
    let newestProcess: Date | null = null;
    
    for (const process of processes) {
      // Status counts
      processesByStatus[process.status]++;
      processesByHealth[process.healthStatus]++;
      processesByPriority[process.priority]++;
      
      // Agent counts
      processesByAgent[process.agentType] = (processesByAgent[process.agentType] || 0) + 1;
      
      // Resource totals
      totalMemory += process.resourceUsage.memoryMB;
      totalCpu += process.resourceUsage.cpuPercent;
      totalRestarts += process.restartCount;
      
      // Lifetime calculation
      const endTime = process.endTime || new Date();
      totalLifetime += endTime.getTime() - process.startTime.getTime();
      
      // Check for orphans and stale processes
      if (!this.isProcessRunning(process.pid)) {
        if (process.status === 'running') {
          orphanCount++;
        }
      }
      
      if (Date.now() - process.lastActive.getTime() > this.STALE_PROCESS_THRESHOLD) {
        staleCount++;
      }
      
      // Track oldest and newest
      if (!oldestProcess || process.startTime < oldestProcess) {
        oldestProcess = process.startTime;
      }
      if (!newestProcess || process.startTime > newestProcess) {
        newestProcess = process.startTime;
      }
    }
    
    return {
      totalProcesses: processes.length,
      processesByStatus,
      processesByHealth,
      processesByAgent,
      processesByPriority,
      averageLifetime: processes.length > 0 ? totalLifetime / processes.length : 0,
      averageMemoryUsage: processes.length > 0 ? totalMemory / processes.length : 0,
      averageCpuUsage: processes.length > 0 ? totalCpu / processes.length : 0,
      totalRestarts,
      orphanProcesses: orphanCount,
      stalePids: staleCount,
      oldestProcess,
      newestProcess,
      lastCleanup: new Date() // Updated during cleanup operations
    };
  }

  /**
   * Clean up orphaned processes
   */
  public async cleanupOrphanedProcesses(): Promise<number> {
    this.logger.info('Cleaning up orphaned processes...');
    
    let cleanedCount = 0;
    const processes = this.getAllProcesses();
    
    for (const processInfo of processes) {
      // Check if process is marked as running but PID doesn't exist
      if (processInfo.status === 'running' && !this.isProcessRunning(processInfo.pid)) {
        this.logger.warning(`Found orphaned process: ${processInfo.processId} (PID: ${processInfo.pid})`);
        
        // Update status to crashed
        await this.updateProcessStatus(processInfo.processId, 'crashed');
        await this.updateProcessHealth(processInfo.processId, 'crashed');
        
        // Record the orphaned process exit
        await this.recordProcessExit(processInfo.processId, null, 'ORPHANED');
        
        cleanedCount++;
      }
    }
    
    // Clean up old process history
    await this.cleanupOldProcessHistory();
    
    // Update last cleanup time in stats
    this.emit('registry:cleanup-completed', { cleanedCount });
    
    return cleanedCount;
  }

  /**
   * Clean up stale processes (old inactive entries)
   */
  public async cleanupStaleProcesses(): Promise<number> {
    const cutoff = Date.now() - this.STALE_PROCESS_THRESHOLD;
    let cleanedCount = 0;
    
    const staleProcesses = this.queryProcesses({
      status: ['stopped', 'error', 'crashed'],
      activeWithin: this.STALE_PROCESS_THRESHOLD
    });
    
    for (const processInfo of staleProcesses) {
      if (processInfo.lastActive.getTime() < cutoff) {
        this.processes.delete(processInfo.processId);
        this.pidToProcessId.delete(processInfo.pid);
        cleanedCount++;
      }
    }
    
    this.logger.debug(`Cleaned up ${cleanedCount} stale process entries`);
    return cleanedCount;
  }

  /**
   * Clean up old process history to prevent memory bloat
   */
  private async cleanupOldProcessHistory(): Promise<void> {
    if (this.processes.size <= this.MAX_PROCESS_HISTORY) {
      return; // No cleanup needed
    }
    
    // Sort processes by end time, oldest first
    const processArray = this.getAllProcesses()
      .filter(p => p.endTime) // Only ended processes
      .sort((a, b) => (a.endTime || new Date()).getTime() - (b.endTime || new Date()).getTime());
    
    // Remove oldest processes beyond limit
    const toRemove = processArray.slice(0, processArray.length - Math.floor(this.MAX_PROCESS_HISTORY * 0.8));
    
    for (const processInfo of toRemove) {
      this.processes.delete(processInfo.processId);
      this.pidToProcessId.delete(processInfo.pid);
    }
    
    this.logger.debug(`Cleaned up ${toRemove.length} old process history entries`);
  }

  /**
   * Check if a process is currently running
   */
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

  /**
   * Load process data from persistent storage
   */
  private async loadProcessData(): Promise<void> {
    try {
      if (!(await fs.pathExists(this.persistenceFile))) {
        this.logger.debug('No existing process data found');
        return;
      }
      
      const data = await fs.readJSON(this.persistenceFile);
      
      if (data.processes && Array.isArray(data.processes)) {
        for (const processData of data.processes) {
          // Convert date strings back to Date objects
          processData.startTime = new Date(processData.startTime);
          processData.lastActive = new Date(processData.lastActive);
          if (processData.endTime) {
            processData.endTime = new Date(processData.endTime);
          }
          if (processData.lastRestart) {
            processData.lastRestart = new Date(processData.lastRestart);
          }
          
          this.processes.set(processData.processId, processData);
          
          // Only map PID if process is still running
          if (processData.status === 'running' && this.isProcessRunning(processData.pid)) {
            this.pidToProcessId.set(processData.pid, processData.processId);
          }
        }
        
        this.logger.info(`Loaded ${data.processes.length} processes from storage`);
      }
      
    } catch (error) {
      this.logger.error('Failed to load process data', error);
      // Continue without loaded data
    }
  }

  /**
   * Persist process data to storage
   */
  private async persistProcessData(): Promise<void> {
    try {
      const data = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        processes: Array.from(this.processes.values())
      };
      
      await fs.writeJSON(this.persistenceFile, data, { spaces: 2 });
      this.lastPersistence = new Date();
      
    } catch (error) {
      this.logger.error('Failed to persist process data', error);
    }
  }

  /**
   * Start automatic persistence
   */
  private startPersistence(): void {
    this.persistenceInterval = setInterval(async () => {
      try {
        await this.persistProcessData();
      } catch (error) {
        this.logger.error('Persistence cycle failed', error);
      }
    }, this.PERSISTENCE_INTERVAL);
    
    this.logger.debug(`Process persistence started (interval: ${this.PERSISTENCE_INTERVAL}ms)`);
  }

  /**
   * Setup cleanup handlers for graceful shutdown
   */
  private setupCleanupHandlers(): void {
    const shutdown = async () => {
      await this.shutdown();
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception in PidRegistry', error);
    });
  }

  /**
   * Shutdown the PID registry
   */
  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down PID Registry...');

    try {
      // Stop persistence interval
      if (this.persistenceInterval) {
        clearInterval(this.persistenceInterval);
        this.persistenceInterval = null;
      }
      
      // Final persistence
      await this.persistProcessData();
      
      // Mark all running processes as stopped
      const runningProcesses = this.getProcessesByStatus('running');
      for (const processInfo of runningProcesses) {
        await this.updateProcessStatus(processInfo.processId, 'stopped');
      }
      
      // Final persistence with updated statuses
      await this.persistProcessData();
      
      this.logger.info(`PID Registry shutdown complete. Managed ${this.processes.size} processes total.`);
      this.emit('registry:shutdown', this.getStats());
      
    } catch (error) {
      this.logger.error('Error during PID Registry shutdown', error);
      throw error;
    }
  }
}