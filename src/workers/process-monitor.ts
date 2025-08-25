/**
 * ProcessMonitor - Advanced Process Health Monitoring
 * 
 * Provides real-time process monitoring, resource tracking, and health assessment
 * with cross-platform support, alerting, and automatic remediation capabilities.
 */

import { EventEmitter } from 'events';
import * as os from 'os';
import * as fs from 'fs-extra';
import * as path from 'path';
import { spawn } from 'child_process';
import { LogContext } from '../utils/logger';
import { withErrorHandling, ErrorCategory } from '../utils/errors';

export interface ProcessResourceLimits {
  maxMemoryMB: number;
  maxCpuPercent: number;
  maxExecutionTimeMs: number;
  maxFileHandles: number;
}

export interface ProcessMonitoringData {
  processId: string;
  pid: number;
  
  // Resource usage
  memoryMB: number;
  cpuPercent: number;
  fileHandles: number;
  diskReadMB: number;
  diskWriteMB: number;
  networkRxMB: number;
  networkTxMB: number;
  
  // System metrics
  threadCount: number;
  handleCount: number;
  
  // Timing
  executionTimeMs: number;
  lastUpdate: Date;
  
  // Health indicators
  responsiveness: number; // 0-100 scale
  stability: number; // 0-100 scale
  
  // Resource trends (last 5 minutes)
  memoryTrend: number[]; // MB values
  cpuTrend: number[]; // Percentage values
  
  // Violation tracking
  violations: {
    memory: number;
    cpu: number;
    execution: number;
    handles: number;
  };
}

export interface ProcessHealthReport {
  processId: string;
  pid: number;
  healthScore: number; // 0-100, 100 being perfect health
  status: 'healthy' | 'warning' | 'critical' | 'failing';
  
  issues: Array<{
    type: 'memory' | 'cpu' | 'time' | 'handles' | 'disk' | 'network' | 'responsiveness';
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    currentValue: number;
    threshold: number;
    trend: 'improving' | 'stable' | 'deteriorating';
  }>;
  
  recommendations: string[];
  timestamp: Date;
}

export interface ProcessMonitorConfig {
  monitoringInterval: number;
  trendHistoryLength: number;
  healthCheckInterval: number;
  alertThresholds: {
    memoryWarningPercent: number;
    memoryCriticalPercent: number;
    cpuWarningPercent: number;
    cpuCriticalPercent: number;
    responsivenessWarning: number;
    responsivenessCritical: number;
  };
}

export class ProcessMonitor extends EventEmitter {
  private logger: LogContext;
  private limits: ProcessResourceLimits;
  private config: ProcessMonitorConfig;
  
  // Monitoring data
  private monitoredProcesses: Map<string, ProcessMonitoringData>;
  private pidToProcessId: Map<number, string>;
  private monitoringIntervals: Map<string, NodeJS.Timeout>;
  
  // Health assessment
  private healthReports: Map<string, ProcessHealthReport>;
  private alertHistory: Map<string, Date[]>;
  
  // System monitoring
  private systemMonitoringInterval: NodeJS.Timeout | null = null;
  private systemMetrics: {
    totalMemoryMB: number;
    availableMemoryMB: number;
    cpuCores: number;
    loadAverage: number[];
    uptime: number;
  } | null = null;

  constructor(limits: ProcessResourceLimits, config?: Partial<ProcessMonitorConfig>) {
    super();
    this.logger = new LogContext('ProcessMonitor');
    this.limits = limits;
    
    this.config = {
      monitoringInterval: 1000, // 1 second
      trendHistoryLength: 300, // 5 minutes at 1-second intervals
      healthCheckInterval: 10000, // 10 seconds
      alertThresholds: {
        memoryWarningPercent: 70,
        memoryCriticalPercent: 90,
        cpuWarningPercent: 80,
        cpuCriticalPercent: 95,
        responsivenessWarning: 70,
        responsivenessCritical: 50,
      },
      ...config
    };
    
    this.monitoredProcesses = new Map();
    this.pidToProcessId = new Map();
    this.monitoringIntervals = new Map();
    this.healthReports = new Map();
    this.alertHistory = new Map();
  }

  /**
   * Initialize the process monitor
   */
  public async initialize(): Promise<void> {
    this.logger.info('Initializing Process Monitor...');

    try {
      await withErrorHandling(
        async () => {
          // Collect initial system metrics
          await this.updateSystemMetrics();
          
          // Start system monitoring
          this.startSystemMonitoring();
          
          // Setup cleanup handlers
          this.setupCleanupHandlers();
        },
        {
          operationName: 'process-monitor-init',
          category: ErrorCategory.CONFIGURATION,
          retries: 2,
          timeoutMs: 10000,
        }
      );

      this.logger.info('Process Monitor initialized successfully');
      this.emit('monitor:initialized', this.systemMetrics);

    } catch (error) {
      this.logger.error('Failed to initialize Process Monitor', error);
      throw error;
    }
  }

  /**
   * Register a process for monitoring
   */
  public registerProcess(processId: string, pid: number): void {
    const monitoringData: ProcessMonitoringData = {
      processId,
      pid,
      memoryMB: 0,
      cpuPercent: 0,
      fileHandles: 0,
      diskReadMB: 0,
      diskWriteMB: 0,
      networkRxMB: 0,
      networkTxMB: 0,
      threadCount: 0,
      handleCount: 0,
      executionTimeMs: 0,
      lastUpdate: new Date(),
      responsiveness: 100,
      stability: 100,
      memoryTrend: [],
      cpuTrend: [],
      violations: {
        memory: 0,
        cpu: 0,
        execution: 0,
        handles: 0,
      }
    };

    this.monitoredProcesses.set(processId, monitoringData);
    this.pidToProcessId.set(pid, processId);
    
    this.logger.debug(`Registered process for monitoring: ${processId} (PID: ${pid})`);
    this.emit('process:registered', { processId, pid });
  }

  /**
   * Start monitoring a specific process
   */
  public async startMonitoring(processId: string): Promise<void> {
    const monitoringData = this.monitoredProcesses.get(processId);
    if (!monitoringData) {
      throw new Error(`Process not registered: ${processId}`);
    }

    // Stop existing monitoring if any
    this.stopMonitoring(processId);
    
    // Start periodic monitoring
    const interval = setInterval(async () => {
      try {
        await this.updateProcessMetrics(processId);
        await this.assessProcessHealth(processId);
      } catch (error) {
        this.logger.error(`Monitoring error for process ${processId}`, error);
        // Don't stop monitoring on errors, just log them
      }
    }, this.config.monitoringInterval);
    
    this.monitoringIntervals.set(processId, interval);
    
    this.logger.debug(`Started monitoring process: ${processId}`);
    this.emit('monitoring:started', { processId });
  }

  /**
   * Stop monitoring a specific process
   */
  public stopMonitoring(processId: string): void {
    const interval = this.monitoringIntervals.get(processId);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(processId);
    }
    
    const monitoringData = this.monitoredProcesses.get(processId);
    if (monitoringData) {
      this.pidToProcessId.delete(monitoringData.pid);
      this.monitoredProcesses.delete(processId);
      this.healthReports.delete(processId);
      this.alertHistory.delete(processId);
    }
    
    this.logger.debug(`Stopped monitoring process: ${processId}`);
    this.emit('monitoring:stopped', { processId });
  }

  /**
   * Get process monitoring data
   */
  public getProcessData(pid: number): ProcessMonitoringData | null {
    const processId = this.pidToProcessId.get(pid);
    return processId ? this.monitoredProcesses.get(processId) || null : null;
  }

  /**
   * Get process monitoring data by process ID
   */
  public getProcessDataById(processId: string): ProcessMonitoringData | null {
    return this.monitoredProcesses.get(processId) || null;
  }

  /**
   * Get all monitored processes
   */
  public getAllProcessData(): ProcessMonitoringData[] {
    return Array.from(this.monitoredProcesses.values());
  }

  /**
   * Get process health report
   */
  public getProcessHealth(processId: string): ProcessHealthReport | null {
    return this.healthReports.get(processId) || null;
  }

  /**
   * Get all health reports
   */
  public getAllHealthReports(): ProcessHealthReport[] {
    return Array.from(this.healthReports.values());
  }

  /**
   * Get system metrics
   */
  public getSystemMetrics(): typeof this.systemMetrics {
    return this.systemMetrics;
  }

  /**
   * Force update metrics for a specific process
   */
  public async updateProcessMetrics(processId: string): Promise<void> {
    const monitoringData = this.monitoredProcesses.get(processId);
    if (!monitoringData) {
      return;
    }

    try {
      const startTime = Date.now();
      
      // Get process metrics based on platform
      if (os.platform() === 'win32') {
        await this.updateWindowsProcessMetrics(monitoringData);
      } else {
        await this.updateUnixProcessMetrics(monitoringData);
      }
      
      // Update execution time
      monitoringData.executionTimeMs = Date.now() - startTime;
      monitoringData.lastUpdate = new Date();
      
      // Update trends
      this.updateTrends(monitoringData);
      
      // Check for violations
      this.checkResourceViolations(monitoringData);
      
      this.emit('metrics:updated', { processId, data: monitoringData });
      
    } catch (error) {
      this.logger.error(`Failed to update metrics for process ${processId}`, error);
      
      // Mark as unresponsive if we can't get metrics
      monitoringData.responsiveness = Math.max(0, monitoringData.responsiveness - 10);
      monitoringData.stability = Math.max(0, monitoringData.stability - 5);
    }
  }

  /**
   * Assess process health and generate report
   */
  public async assessProcessHealth(processId: string): Promise<ProcessHealthReport> {
    const monitoringData = this.monitoredProcesses.get(processId);
    if (!monitoringData) {
      throw new Error(`Process not monitored: ${processId}`);
    }

    const healthReport: ProcessHealthReport = {
      processId,
      pid: monitoringData.pid,
      healthScore: 100,
      status: 'healthy',
      issues: [],
      recommendations: [],
      timestamp: new Date()
    };

    let healthScore = 100;
    
    // Memory health assessment
    const memoryUsagePercent = (monitoringData.memoryMB / this.limits.maxMemoryMB) * 100;
    if (memoryUsagePercent >= this.config.alertThresholds.memoryCriticalPercent) {
      healthScore -= 25;
      healthReport.issues.push({
        type: 'memory',
        severity: 'critical',
        description: `Memory usage critically high: ${memoryUsagePercent.toFixed(1)}%`,
        currentValue: monitoringData.memoryMB,
        threshold: this.limits.maxMemoryMB,
        trend: this.calculateTrend(monitoringData.memoryTrend)
      });
      healthReport.recommendations.push('Consider restarting process or increasing memory limits');
    } else if (memoryUsagePercent >= this.config.alertThresholds.memoryWarningPercent) {
      healthScore -= 10;
      healthReport.issues.push({
        type: 'memory',
        severity: 'medium',
        description: `Memory usage high: ${memoryUsagePercent.toFixed(1)}%`,
        currentValue: monitoringData.memoryMB,
        threshold: this.limits.maxMemoryMB,
        trend: this.calculateTrend(monitoringData.memoryTrend)
      });
      healthReport.recommendations.push('Monitor memory usage and consider optimizations');
    }
    
    // CPU health assessment
    const cpuUsagePercent = (monitoringData.cpuPercent / this.limits.maxCpuPercent) * 100;
    if (monitoringData.cpuPercent >= this.config.alertThresholds.cpuCriticalPercent) {
      healthScore -= 20;
      healthReport.issues.push({
        type: 'cpu',
        severity: 'critical',
        description: `CPU usage critically high: ${monitoringData.cpuPercent.toFixed(1)}%`,
        currentValue: monitoringData.cpuPercent,
        threshold: this.limits.maxCpuPercent,
        trend: this.calculateTrend(monitoringData.cpuTrend)
      });
      healthReport.recommendations.push('Process may need optimization or resource adjustment');
    } else if (monitoringData.cpuPercent >= this.config.alertThresholds.cpuWarningPercent) {
      healthScore -= 8;
      healthReport.issues.push({
        type: 'cpu',
        severity: 'medium',
        description: `CPU usage high: ${monitoringData.cpuPercent.toFixed(1)}%`,
        currentValue: monitoringData.cpuPercent,
        threshold: this.limits.maxCpuPercent,
        trend: this.calculateTrend(monitoringData.cpuTrend)
      });
    }
    
    // Execution time assessment
    if (monitoringData.executionTimeMs > this.limits.maxExecutionTimeMs) {
      healthScore -= 15;
      healthReport.issues.push({
        type: 'time',
        severity: 'high',
        description: `Execution time exceeded: ${(monitoringData.executionTimeMs / 1000).toFixed(1)}s`,
        currentValue: monitoringData.executionTimeMs,
        threshold: this.limits.maxExecutionTimeMs,
        trend: 'deteriorating'
      });
      healthReport.recommendations.push('Process may be stuck or running inefficiently');
    }
    
    // File handles assessment
    if (monitoringData.fileHandles > this.limits.maxFileHandles) {
      healthScore -= 10;
      healthReport.issues.push({
        type: 'handles',
        severity: 'medium',
        description: `File handles exceeded: ${monitoringData.fileHandles}`,
        currentValue: monitoringData.fileHandles,
        threshold: this.limits.maxFileHandles,
        trend: 'stable'
      });
      healthReport.recommendations.push('Check for file handle leaks');
    }
    
    // Responsiveness assessment
    if (monitoringData.responsiveness < this.config.alertThresholds.responsivenessCritical) {
      healthScore -= 20;
      healthReport.issues.push({
        type: 'responsiveness',
        severity: 'critical',
        description: `Process unresponsive: ${monitoringData.responsiveness}%`,
        currentValue: monitoringData.responsiveness,
        threshold: this.config.alertThresholds.responsivenessCritical,
        trend: 'deteriorating'
      });
      healthReport.recommendations.push('Process may be deadlocked or frozen');
    } else if (monitoringData.responsiveness < this.config.alertThresholds.responsivenessWarning) {
      healthScore -= 10;
      healthReport.issues.push({
        type: 'responsiveness',
        severity: 'medium',
        description: `Process sluggish: ${monitoringData.responsiveness}%`,
        currentValue: monitoringData.responsiveness,
        threshold: this.config.alertThresholds.responsivenessWarning,
        trend: 'deteriorating'
      });
    }
    
    // Determine overall status
    healthReport.healthScore = Math.max(0, healthScore);
    
    if (healthReport.healthScore >= 80) {
      healthReport.status = 'healthy';
    } else if (healthReport.healthScore >= 60) {
      healthReport.status = 'warning';
    } else if (healthReport.healthScore >= 30) {
      healthReport.status = 'critical';
    } else {
      healthReport.status = 'failing';
    }
    
    // Store the report
    this.healthReports.set(processId, healthReport);
    
    // Emit health events
    if (healthReport.status !== 'healthy') {
      this.emit('health:alert', healthReport);
      this.recordAlert(processId);
    }
    
    this.emit('health:assessed', healthReport);
    
    return healthReport;
  }

  // Private methods for platform-specific monitoring

  private async updateWindowsProcessMetrics(data: ProcessMonitoringData): Promise<void> {
    try {
      // Use wmic or PowerShell to get process metrics on Windows
      const result = await this.executeCommand(
        'powershell',
        [
          '-Command',
          `Get-Process -Id ${data.pid} | Select-Object WorkingSet,CPU,Handles,Threads | ConvertTo-Json`
        ]
      );
      
      const metrics = JSON.parse(result);
      
      // Update metrics (WorkingSet is in bytes)
      data.memoryMB = Math.round((metrics.WorkingSet || 0) / (1024 * 1024));
      data.cpuPercent = Math.round(metrics.CPU || 0);
      data.handleCount = metrics.Handles || 0;
      data.threadCount = metrics.Threads || 0;
      data.fileHandles = Math.min(data.handleCount, this.limits.maxFileHandles); // Approximation
      
    } catch (error) {
      this.logger.debug(`Failed to get Windows metrics for PID ${data.pid}`, error);
      // Fall back to basic Node.js process metrics
      await this.updateBasicProcessMetrics(data);
    }
  }

  private async updateUnixProcessMetrics(data: ProcessMonitoringData): Promise<void> {
    try {
      // Use ps command to get process metrics on Unix-like systems
      const result = await this.executeCommand('ps', [
        '-p', String(data.pid),
        '-o', 'rss,pcpu,nlwp', // RSS memory, CPU%, thread count
        '--no-headers'
      ]);
      
      const values = result.trim().split(/\s+/);
      if (values.length >= 2) {
        data.memoryMB = Math.round(parseInt(values[0] || '0') / 1024); // RSS in KB, convert to MB
        data.cpuPercent = Math.round(parseFloat(values[1] || '0'));
        data.threadCount = parseInt(values[2] || '1');
      }
      
      // Get file descriptor count
      try {
        const fdDir = `/proc/${data.pid}/fd`;
        if (await fs.pathExists(fdDir)) {
          const fdList = await fs.readdir(fdDir);
          data.fileHandles = fdList.length;
        }
      } catch {
        // Ignore errors getting file handles
      }
      
    } catch (error) {
      this.logger.debug(`Failed to get Unix metrics for PID ${data.pid}`, error);
      // Fall back to basic Node.js process metrics
      await this.updateBasicProcessMetrics(data);
    }
  }

  private async updateBasicProcessMetrics(data: ProcessMonitoringData): Promise<void> {
    try {
      // Use Node.js built-in process metrics as fallback
      if (data.pid === process.pid) {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        data.memoryMB = Math.round(memUsage.rss / (1024 * 1024));
        data.cpuPercent = Math.round(((cpuUsage.user + cpuUsage.system) / 1000000) * 100);
      } else {
        // For other processes, we can't get accurate metrics
        // Mark as unresponsive and let higher-level systems handle it
        data.responsiveness = Math.max(0, data.responsiveness - 5);
      }
    } catch (error) {
      this.logger.debug(`Failed to get basic metrics for PID ${data.pid}`, error);
      data.responsiveness = Math.max(0, data.responsiveness - 10);
    }
  }

  private async updateSystemMetrics(): Promise<void> {
    try {
      this.systemMetrics = {
        totalMemoryMB: Math.round(os.totalmem() / (1024 * 1024)),
        availableMemoryMB: Math.round(os.freemem() / (1024 * 1024)),
        cpuCores: os.cpus().length,
        loadAverage: os.loadavg(),
        uptime: os.uptime()
      };
      
      this.emit('system:metrics-updated', this.systemMetrics);
      
    } catch (error) {
      this.logger.error('Failed to update system metrics', error);
    }
  }

  private updateTrends(data: ProcessMonitoringData): void {
    // Add current values to trends
    data.memoryTrend.push(data.memoryMB);
    data.cpuTrend.push(data.cpuPercent);
    
    // Trim trends to configured length
    if (data.memoryTrend.length > this.config.trendHistoryLength) {
      data.memoryTrend = data.memoryTrend.slice(-this.config.trendHistoryLength);
    }
    if (data.cpuTrend.length > this.config.trendHistoryLength) {
      data.cpuTrend = data.cpuTrend.slice(-this.config.trendHistoryLength);
    }
  }

  private calculateTrend(values: number[]): 'improving' | 'stable' | 'deteriorating' {
    if (values.length < 10) {
      return 'stable';
    }
    
    const recent = values.slice(-10);
    const older = values.slice(-20, -10);
    
    if (older.length === 0) {
      return 'stable';
    }
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    
    const change = ((recentAvg - olderAvg) / olderAvg) * 100;
    
    if (change < -10) {
      return 'improving';
    } else if (change > 10) {
      return 'deteriorating';
    } else {
      return 'stable';
    }
  }

  private checkResourceViolations(data: ProcessMonitoringData): void {
    // Check memory violation
    if (data.memoryMB > this.limits.maxMemoryMB) {
      data.violations.memory++;
      this.emit('resource-violation', {
        processId: data.processId,
        pid: data.pid,
        type: 'memory',
        current: data.memoryMB,
        limit: this.limits.maxMemoryMB,
        severity: 'critical'
      });
    }
    
    // Check CPU violation
    if (data.cpuPercent > this.limits.maxCpuPercent) {
      data.violations.cpu++;
      this.emit('resource-violation', {
        processId: data.processId,
        pid: data.pid,
        type: 'cpu',
        current: data.cpuPercent,
        limit: this.limits.maxCpuPercent,
        severity: 'high'
      });
    }
    
    // Check file handles violation
    if (data.fileHandles > this.limits.maxFileHandles) {
      data.violations.handles++;
      this.emit('resource-violation', {
        processId: data.processId,
        pid: data.pid,
        type: 'handles',
        current: data.fileHandles,
        limit: this.limits.maxFileHandles,
        severity: 'medium'
      });
    }
  }

  private recordAlert(processId: string): void {
    const alerts = this.alertHistory.get(processId) || [];
    alerts.push(new Date());
    
    // Keep only recent alerts (last hour)
    const cutoff = new Date(Date.now() - 3600000);
    const recentAlerts = alerts.filter(date => date > cutoff);
    
    this.alertHistory.set(processId, recentAlerts);
  }

  private async executeCommand(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });
      
      child.on('error', (error) => {
        reject(error);
      });
      
      // Timeout after 5 seconds
      setTimeout(() => {
        child.kill();
        reject(new Error('Command timeout'));
      }, 5000);
    });
  }

  private startSystemMonitoring(): void {
    this.systemMonitoringInterval = setInterval(async () => {
      await this.updateSystemMetrics();
    }, 30000); // Update every 30 seconds
    
    this.logger.debug('System monitoring started');
  }

  private setupCleanupHandlers(): void {
    process.on('SIGINT', () => this.shutdown().catch(console.error));
    process.on('SIGTERM', () => this.shutdown().catch(console.error));
    
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception in ProcessMonitor', error);
    });
  }

  /**
   * Get monitoring statistics
   */
  public getStats(): {
    monitoredProcesses: number;
    totalViolations: number;
    violationsByType: Record<string, number>;
    healthyProcesses: number;
    unhealthyProcesses: number;
    averageHealthScore: number;
    totalAlerts: number;
  } {
    const processes = this.getAllProcessData();
    const healthReports = this.getAllHealthReports();
    
    let totalViolations = 0;
    const violationsByType: Record<string, number> = {
      memory: 0,
      cpu: 0,
      execution: 0,
      handles: 0,
    };
    
    let totalAlerts = 0;
    
    for (const process of processes) {
      totalViolations += Object.values(process.violations).reduce((a, b) => a + b, 0);
      
      Object.keys(violationsByType).forEach(key => {
        violationsByType[key] += process.violations[key as keyof typeof process.violations];
      });
    }
    
    for (const alerts of this.alertHistory.values()) {
      totalAlerts += alerts.length;
    }
    
    const healthyProcesses = healthReports.filter(r => r.status === 'healthy').length;
    const unhealthyProcesses = healthReports.length - healthyProcesses;
    const averageHealthScore = healthReports.length > 0 
      ? healthReports.reduce((sum, r) => sum + r.healthScore, 0) / healthReports.length 
      : 100;
    
    return {
      monitoredProcesses: processes.length,
      totalViolations,
      violationsByType,
      healthyProcesses,
      unhealthyProcesses,
      averageHealthScore,
      totalAlerts,
    };
  }

  /**
   * Shutdown the process monitor
   */
  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down Process Monitor...');

    try {
      // Stop system monitoring
      if (this.systemMonitoringInterval) {
        clearInterval(this.systemMonitoringInterval);
        this.systemMonitoringInterval = null;
      }
      
      // Stop all process monitoring
      const processIds = Array.from(this.monitoringIntervals.keys());
      for (const processId of processIds) {
        this.stopMonitoring(processId);
      }
      
      // Clear all data
      this.monitoredProcesses.clear();
      this.pidToProcessId.clear();
      this.healthReports.clear();
      this.alertHistory.clear();
      
      this.logger.info('Process Monitor shutdown complete');
      this.emit('monitor:shutdown', this.getStats());
      
    } catch (error) {
      this.logger.error('Error during Process Monitor shutdown', error);
      throw error;
    }
  }
}