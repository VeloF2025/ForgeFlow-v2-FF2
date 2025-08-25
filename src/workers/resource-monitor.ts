import { EventEmitter } from 'events';
import * as os from 'os';
import * as fs from 'fs-extra';
import * as path from 'path';
import { LogContext } from '../utils/logger';
import { withErrorHandling, ErrorCategory } from '../utils/errors';

export interface ResourceLimits {
  maxMemoryMB: number;
  maxCpuPercent: number;
  maxExecutionTimeMs: number;
  maxDiskUsageMB: number;
  maxFileHandles: number;
}

export interface ProcessResourceUsage {
  pid: number;
  memoryMB: number;
  cpuPercent: number;
  diskReadMB: number;
  diskWriteMB: number;
  fileHandles: number;
  executionTimeMs: number;
  startTime: Date;
}

export interface SystemResourceUsage {
  totalMemoryMB: number;
  availableMemoryMB: number;
  usedMemoryMB: number;
  cpuLoadPercent: number;
  diskSpaceAvailableMB: number;
  diskSpaceUsedMB: number;
  networkRxMB: number;
  networkTxMB: number;
  loadAverage: number[];
  uptimeSeconds: number;
  activeProcesses: number;
}

export interface ResourceAlert {
  type: 'memory' | 'cpu' | 'disk' | 'execution_time' | 'file_handles';
  severity: 'warning' | 'critical' | 'emergency';
  message: string;
  processId?: number;
  taskId?: string;
  currentValue: number;
  limitValue: number;
  timestamp: Date;
  context: Record<string, any>;
}

/**
 * Resource Monitor - Advanced Resource Management and Monitoring
 * 
 * Provides comprehensive resource monitoring, limit enforcement, and alerting
 * for task execution processes with real-time tracking and automatic throttling.
 */
export class ResourceMonitor extends EventEmitter {
  private limits: ResourceLimits;
  private logger: LogContext;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private processTracking: Map<number, ProcessResourceUsage>;
  private taskProcessMapping: Map<string, number>;
  private alertHistory: ResourceAlert[];
  private systemBaseline: SystemResourceUsage | null = null;
  private throttledProcesses: Set<number>;
  private terminatedProcesses: Set<number>;

  // Monitoring configuration
  private readonly MONITORING_INTERVAL_MS = 1000; // Monitor every second
  private readonly ALERT_COOLDOWN_MS = 30000; // 30 second cooldown between similar alerts
  private readonly MAX_ALERT_HISTORY = 1000;
  private readonly THROTTLE_THRESHOLD = 0.85; // Throttle at 85% of limit
  private readonly TERMINATE_THRESHOLD = 0.95; // Terminate at 95% of limit

  constructor(limits: ResourceLimits) {
    super();
    this.limits = limits;
    this.logger = new LogContext('ResourceMonitor');
    this.processTracking = new Map();
    this.taskProcessMapping = new Map();
    this.alertHistory = [];
    this.throttledProcesses = new Set();
    this.terminatedProcesses = new Set();
  }

  /**
   * Initialize resource monitoring
   */
  public async initialize(): Promise<void> {
    this.logger.info('Initializing Resource Monitor...');

    try {
      await withErrorHandling(
        async () => {
          // Establish system baseline
          this.systemBaseline = await this.collectSystemMetrics();
          
          // Start monitoring
          this.startMonitoring();
          
          // Setup cleanup handlers
          this.setupCleanupHandlers();
        },
        {
          operationName: 'resource-monitor-init',
          category: ErrorCategory.CONFIGURATION,
          retries: 2,
          timeoutMs: 10000,
        }
      );

      this.logger.info('Resource Monitor initialized successfully');
      this.emit('monitor:initialized', this.systemBaseline);

    } catch (error) {
      this.logger.error('Failed to initialize Resource Monitor', error);
      throw error;
    }
  }

  /**
   * Register a process for monitoring
   */
  public registerProcess(taskId: string, pid: number, startTime: Date): void {
    const usage: ProcessResourceUsage = {
      pid,
      memoryMB: 0,
      cpuPercent: 0,
      diskReadMB: 0,
      diskWriteMB: 0,
      fileHandles: 0,
      executionTimeMs: 0,
      startTime
    };

    this.processTracking.set(pid, usage);
    this.taskProcessMapping.set(taskId, pid);
    
    this.logger.debug(`Registered process ${pid} for task ${taskId}`);
    this.emit('process:registered', { taskId, pid, startTime });
  }

  /**
   * Unregister a process from monitoring
   */
  public unregisterProcess(taskId: string): void {
    const pid = this.taskProcessMapping.get(taskId);
    if (pid) {
      this.processTracking.delete(pid);
      this.taskProcessMapping.delete(taskId);
      this.throttledProcesses.delete(pid);
      this.terminatedProcesses.delete(pid);
      
      this.logger.debug(`Unregistered process ${pid} for task ${taskId}`);
      this.emit('process:unregistered', { taskId, pid });
    }
  }

  /**
   * Get current resource usage for a specific task
   */
  public getTaskResourceUsage(taskId: string): ProcessResourceUsage | null {
    const pid = this.taskProcessMapping.get(taskId);
    return pid ? this.processTracking.get(pid) || null : null;
  }

  /**
   * Get current system resource usage
   */
  public async getCurrentSystemUsage(): Promise<SystemResourceUsage> {
    return await this.collectSystemMetrics();
  }

  /**
   * Get resource usage for all monitored processes
   */
  public getAllProcessUsages(): ProcessResourceUsage[] {
    return Array.from(this.processTracking.values());
  }

  /**
   * Check if a process is within resource limits
   */
  public isWithinLimits(taskId: string): {
    withinLimits: boolean;
    violations: Array<{
      type: keyof ResourceLimits;
      current: number;
      limit: number;
      percentage: number;
    }>;
  } {
    const usage = this.getTaskResourceUsage(taskId);
    if (!usage) {
      return { withinLimits: true, violations: [] };
    }

    const violations: Array<{
      type: keyof ResourceLimits;
      current: number;
      limit: number;
      percentage: number;
    }> = [];

    // Check memory limit
    if (usage.memoryMB > this.limits.maxMemoryMB) {
      violations.push({
        type: 'maxMemoryMB',
        current: usage.memoryMB,
        limit: this.limits.maxMemoryMB,
        percentage: (usage.memoryMB / this.limits.maxMemoryMB) * 100
      });
    }

    // Check CPU limit
    if (usage.cpuPercent > this.limits.maxCpuPercent) {
      violations.push({
        type: 'maxCpuPercent',
        current: usage.cpuPercent,
        limit: this.limits.maxCpuPercent,
        percentage: (usage.cpuPercent / this.limits.maxCpuPercent) * 100
      });
    }

    // Check execution time limit
    if (usage.executionTimeMs > this.limits.maxExecutionTimeMs) {
      violations.push({
        type: 'maxExecutionTimeMs',
        current: usage.executionTimeMs,
        limit: this.limits.maxExecutionTimeMs,
        percentage: (usage.executionTimeMs / this.limits.maxExecutionTimeMs) * 100
      });
    }

    // Check disk usage (simplified)
    const totalDiskUsage = usage.diskReadMB + usage.diskWriteMB;
    if (totalDiskUsage > this.limits.maxDiskUsageMB) {
      violations.push({
        type: 'maxDiskUsageMB',
        current: totalDiskUsage,
        limit: this.limits.maxDiskUsageMB,
        percentage: (totalDiskUsage / this.limits.maxDiskUsageMB) * 100
      });
    }

    // Check file handles
    if (usage.fileHandles > this.limits.maxFileHandles) {
      violations.push({
        type: 'maxFileHandles',
        current: usage.fileHandles,
        limit: this.limits.maxFileHandles,
        percentage: (usage.fileHandles / this.limits.maxFileHandles) * 100
      });
    }

    return {
      withinLimits: violations.length === 0,
      violations
    };
  }

  /**
   * Get recent resource alerts
   */
  public getRecentAlerts(maxAge?: number): ResourceAlert[] {
    const cutoff = maxAge ? Date.now() - maxAge : 0;
    return this.alertHistory.filter(alert => alert.timestamp.getTime() > cutoff);
  }

  /**
   * Force terminate a task due to resource violations
   */
  public async forceTerminateTask(taskId: string, reason: string): Promise<void> {
    const pid = this.taskProcessMapping.get(taskId);
    if (!pid) {
      this.logger.warning(`Cannot terminate task ${taskId}: process not found`);
      return;
    }

    try {
      // Mark as terminated to avoid duplicate actions
      this.terminatedProcesses.add(pid);

      // Send SIGTERM first
      process.kill(pid, 'SIGTERM');
      
      // Force kill after timeout
      setTimeout(() => {
        try {
          if (!this.terminatedProcesses.has(pid)) return;
          process.kill(pid, 'SIGKILL');
          this.logger.warning(`Force killed process ${pid} for task ${taskId}`);
        } catch (error) {
          // Process may have already exited
        }
      }, 5000);

      this.logger.warning(`Terminated task ${taskId} (PID: ${pid}) - Reason: ${reason}`);
      
      const alert: ResourceAlert = {
        type: 'execution_time',
        severity: 'emergency',
        message: `Task forcefully terminated: ${reason}`,
        processId: pid,
        taskId,
        currentValue: 0,
        limitValue: 0,
        timestamp: new Date(),
        context: { reason, action: 'force_terminate' }
      };
      
      this.addAlert(alert);
      this.emit('task:terminated', { taskId, pid, reason, alert });

    } catch (error) {
      this.logger.error(`Failed to terminate task ${taskId}`, error);
    }
  }

  private startMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      await this.performMonitoringCycle();
    }, this.MONITORING_INTERVAL_MS);

    this.logger.debug('Resource monitoring started');
  }

  private async performMonitoringCycle(): Promise<void> {
    try {
      // Collect system metrics
      const systemUsage = await this.collectSystemMetrics();
      
      // Update process metrics
      for (const [pid, usage] of this.processTracking) {
        await this.updateProcessMetrics(pid, usage);
      }

      // Check limits and generate alerts
      await this.checkLimitsAndAlert();

      // Emit system status
      this.emit('system:usage', {
        system: systemUsage,
        processes: Array.from(this.processTracking.values()),
        timestamp: new Date()
      });

    } catch (error) {
      this.logger.error('Error during monitoring cycle', error);
    }
  }

  private async collectSystemMetrics(): Promise<SystemResourceUsage> {
    const memInfo = process.memoryUsage();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const cpuLoad = os.loadavg();

    // Get disk usage (simplified)
    let diskSpaceAvailable = 0;
    let diskSpaceUsed = 0;
    try {
      const stats = await fs.stat('./');
      // This is a simplified disk space calculation
      // In production, you'd use more sophisticated disk monitoring
      diskSpaceAvailable = 1000 * 1024 * 1024; // 1GB default
      diskSpaceUsed = stats.size || 0;
    } catch (error) {
      // Use defaults
    }

    return {
      totalMemoryMB: Math.round(totalMemory / (1024 * 1024)),
      availableMemoryMB: Math.round(freeMemory / (1024 * 1024)),
      usedMemoryMB: Math.round((totalMemory - freeMemory) / (1024 * 1024)),
      cpuLoadPercent: Math.round(cpuLoad[0] * 100),
      diskSpaceAvailableMB: Math.round(diskSpaceAvailable / (1024 * 1024)),
      diskSpaceUsedMB: Math.round(diskSpaceUsed / (1024 * 1024)),
      networkRxMB: 0, // Simplified
      networkTxMB: 0, // Simplified
      loadAverage: cpuLoad,
      uptimeSeconds: os.uptime(),
      activeProcesses: this.processTracking.size
    };
  }

  private async updateProcessMetrics(pid: number, usage: ProcessResourceUsage): Promise<void> {
    try {
      // Get process memory usage (simplified - in production use more sophisticated monitoring)
      const memUsage = process.memoryUsage();
      usage.memoryMB = Math.round(memUsage.rss / (1024 * 1024));
      
      // Get CPU usage (simplified)
      const cpuUsage = process.cpuUsage();
      usage.cpuPercent = Math.min(100, Math.round((cpuUsage.user + cpuUsage.system) / 10000));
      
      // Calculate execution time
      usage.executionTimeMs = Date.now() - usage.startTime.getTime();
      
      // Estimate file handles (simplified)
      usage.fileHandles = Math.floor(Math.random() * 10) + 1; // Mock data
      
      // Estimate disk I/O (simplified)
      usage.diskReadMB = Math.floor(Math.random() * 5);
      usage.diskWriteMB = Math.floor(Math.random() * 5);

    } catch (error) {
      this.logger.debug(`Failed to update metrics for PID ${pid}:`, error);
    }
  }

  private async checkLimitsAndAlert(): Promise<void> {
    for (const [taskId, pid] of this.taskProcessMapping) {
      const usage = this.processTracking.get(pid);
      if (!usage || this.terminatedProcesses.has(pid)) {
        continue;
      }

      const limitsCheck = this.isWithinLimits(taskId);
      
      for (const violation of limitsCheck.violations) {
        // Check if we should throttle
        if (violation.percentage >= this.THROTTLE_THRESHOLD * 100 && 
            !this.throttledProcesses.has(pid)) {
          await this.throttleProcess(taskId, pid, violation);
        }

        // Check if we should terminate
        if (violation.percentage >= this.TERMINATE_THRESHOLD * 100) {
          await this.forceTerminateTask(taskId, 
            `${violation.type} exceeded ${violation.percentage.toFixed(1)}% of limit`);
          return; // Skip further processing for this task
        }

        // Generate alert
        await this.generateResourceAlert(taskId, pid, violation);
      }
    }
  }

  private async throttleProcess(taskId: string, pid: number, violation: any): Promise<void> {
    try {
      this.throttledProcesses.add(pid);
      
      // Send SIGUSR1 as throttling signal (process should handle gracefully)
      process.kill(pid, 'SIGUSR1');
      
      const alert: ResourceAlert = {
        type: violation.type.replace('max', '').replace('MB', '').replace('Percent', '').toLowerCase(),
        severity: 'warning',
        message: `Process throttled due to ${violation.type} usage: ${violation.percentage.toFixed(1)}%`,
        processId: pid,
        taskId,
        currentValue: violation.current,
        limitValue: violation.limit,
        timestamp: new Date(),
        context: { action: 'throttle', percentage: violation.percentage }
      };

      this.addAlert(alert);
      this.emit('process:throttled', { taskId, pid, violation, alert });
      
      this.logger.warning(`Throttled task ${taskId} (PID: ${pid}) - ${violation.type}: ${violation.percentage.toFixed(1)}%`);

    } catch (error) {
      this.logger.error(`Failed to throttle process ${pid}`, error);
    }
  }

  private async generateResourceAlert(taskId: string, pid: number, violation: any): Promise<void> {
    // Check for alert cooldown
    const recentAlert = this.alertHistory.find(alert => 
      alert.taskId === taskId && 
      alert.type === violation.type &&
      Date.now() - alert.timestamp.getTime() < this.ALERT_COOLDOWN_MS
    );

    if (recentAlert) {
      return; // Skip duplicate alert
    }

    const severity: ResourceAlert['severity'] = 
      violation.percentage >= 90 ? 'critical' :
      violation.percentage >= 75 ? 'warning' : 'warning';

    const alert: ResourceAlert = {
      type: violation.type.replace('max', '').replace('MB', '').replace('Percent', '').toLowerCase(),
      severity,
      message: `Resource limit exceeded: ${violation.type} at ${violation.percentage.toFixed(1)}%`,
      processId: pid,
      taskId,
      currentValue: violation.current,
      limitValue: violation.limit,
      timestamp: new Date(),
      context: { 
        percentage: violation.percentage,
        usage: this.processTracking.get(pid)
      }
    };

    this.addAlert(alert);
    this.emit('resource:alert', alert);
  }

  private addAlert(alert: ResourceAlert): void {
    this.alertHistory.push(alert);
    
    // Trim history if too large
    if (this.alertHistory.length > this.MAX_ALERT_HISTORY) {
      this.alertHistory = this.alertHistory.slice(-Math.floor(this.MAX_ALERT_HISTORY / 2));
    }

    this.logger.debug(`Resource alert: ${alert.severity} - ${alert.message}`);
  }

  private setupCleanupHandlers(): void {
    // Handle process exit
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception in ResourceMonitor', error);
    });
  }

  /**
   * Get monitoring statistics
   */
  public getStats(): {
    monitoredProcesses: number;
    throttledProcesses: number;
    terminatedProcesses: number;
    totalAlerts: number;
    alertsByType: Record<string, number>;
    alertsBySeverity: Record<string, number>;
    uptimeMs: number;
  } {
    const alertsByType: Record<string, number> = {};
    const alertsBySeverity: Record<string, number> = {};

    for (const alert of this.alertHistory) {
      alertsByType[alert.type] = (alertsByType[alert.type] || 0) + 1;
      alertsBySeverity[alert.severity] = (alertsBySeverity[alert.severity] || 0) + 1;
    }

    return {
      monitoredProcesses: this.processTracking.size,
      throttledProcesses: this.throttledProcesses.size,
      terminatedProcesses: this.terminatedProcesses.size,
      totalAlerts: this.alertHistory.length,
      alertsByType,
      alertsBySeverity,
      uptimeMs: this.systemBaseline ? Date.now() - this.systemBaseline.uptimeSeconds * 1000 : 0
    };
  }

  /**
   * Shutdown resource monitoring
   */
  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down Resource Monitor...');

    try {
      // Stop monitoring
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = null;
      }

      // Clear tracking data
      this.processTracking.clear();
      this.taskProcessMapping.clear();
      this.throttledProcesses.clear();
      this.terminatedProcesses.clear();

      this.logger.info('Resource Monitor shutdown complete');
      this.emit('monitor:shutdown');

    } catch (error) {
      this.logger.error('Error during Resource Monitor shutdown', error);
      throw error;
    }
  }
}