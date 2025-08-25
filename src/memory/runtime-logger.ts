// Runtime Logger - Structured logging system for job memory events
// Provides high-performance logging with correlation and analysis capabilities

import { promises as fs } from 'fs';
import * as path from 'path';
import {
  RuntimeLog,
  LogData,
  LogFilters,
  PerformanceAnalysis,
  ErrorPattern,
  TimeRange,
  MemoryConfig,
  IRuntimeLogger
} from './types';
import { logger as systemLogger } from '../utils/logger';

/**
 * Runtime Logger
 * 
 * High-performance structured logging for memory events with:
 * - Session correlation and tracking
 * - Performance metrics capture
 * - Error pattern analysis
 * - Log rotation and cleanup
 * 
 * Performance Target: <10ms for log writes
 */
export class RuntimeLogger implements IRuntimeLogger {
  private config: MemoryConfig;
  private currentSessionId?: string;
  private currentJobId?: string;
  private currentAgentType?: string;
  private logBuffer: RuntimeLog[] = [];
  private flushTimer?: NodeJS.Timeout;
  private initialized = false;

  private static readonly BUFFER_SIZE = 50;
  private static readonly FLUSH_INTERVAL_MS = 1000; // Flush every 1 second

  constructor(config: MemoryConfig) {
    this.config = config;
  }

  /**
   * Initialize the runtime logger
   * Sets up log directories and starts buffer flushing
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Ensure log directories exist
      await this.ensureLogDirectoryStructure();
      
      // Start periodic buffer flushing
      this.startBufferFlushing();
      
      this.initialized = true;
      systemLogger.debug('Runtime Logger initialized');
    } catch (error) {
      systemLogger.error('Failed to initialize Runtime Logger:', error);
      throw error;
    }
  }

  /**
   * Set session context for correlation
   */
  setSessionContext(sessionId: string, jobId?: string, agentType?: string): void {
    this.currentSessionId = sessionId;
    this.currentJobId = jobId;
    this.currentAgentType = agentType;
  }

  // ==================== Logging Operations ====================

  /**
   * Log a message with specified level
   * @param level Log level
   * @param event Event name
   * @param data Event data
   */
  async log(level: RuntimeLog['level'], event: string, data: LogData): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = Date.now();

    try {
      const logEntry: RuntimeLog = {
        timestamp: new Date(),
        level,
        agentType: data.agentType as string || this.currentAgentType || 'unknown',
        jobId: data.jobId as string || this.currentJobId || 'unknown',
        sessionId: data.sessionId as string || this.currentSessionId || 'unknown',
        event,
        data: {
          ...data,
          // Remove redundant fields to avoid duplication
          agentType: undefined,
          jobId: undefined,
          sessionId: undefined
        },
        correlationId: this.generateCorrelationId()
      };

      // Add to buffer
      this.logBuffer.push(logEntry);

      // Flush buffer if it's full or on critical events
      if (this.logBuffer.length >= RuntimeLogger.BUFFER_SIZE || level === 'critical' || level === 'error') {
        await this.flushBuffer();
      }

      const duration = Date.now() - startTime;
      if (duration > this.config.performanceThresholds.logWriteTimeMs) {
        systemLogger.warn(`Log write took ${duration}ms (target: ${this.config.performanceThresholds.logWriteTimeMs}ms)`);
      }
    } catch (error) {
      systemLogger.error(`Failed to log ${level} event ${event}:`, error);
      // Don't throw - logging failures shouldn't break the application
    }
  }

  /**
   * Log debug message
   */
  async debug(event: string, data: LogData): Promise<void> {
    await this.log('debug', event, data);
  }

  /**
   * Log info message
   */
  async info(event: string, data: LogData): Promise<void> {
    await this.log('info', event, data);
  }

  /**
   * Log warning message
   */
  async warn(event: string, data: LogData): Promise<void> {
    await this.log('warn', event, data);
  }

  /**
   * Log error message
   */
  async error(event: string, data: LogData): Promise<void> {
    await this.log('error', event, data);
  }

  /**
   * Log critical message
   */
  async critical(event: string, data: LogData): Promise<void> {
    await this.log('critical', event, data);
  }

  // ==================== Log Retrieval ====================

  /**
   * Get logs for a specific job
   * @param jobId Job identifier
   * @param filters Optional filters
   * @returns Promise resolving to filtered logs
   */
  async getLogsForJob(jobId: string, filters?: LogFilters): Promise<RuntimeLog[]> {
    try {
      const allLogs = await this.readAllLogs();
      
      let filteredLogs = allLogs.filter(log => log.jobId === jobId);
      
      if (filters) {
        filteredLogs = this.applyFilters(filteredLogs, filters);
      }
      
      return filteredLogs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    } catch (error) {
      systemLogger.error(`Failed to get logs for job ${jobId}:`, error);
      throw new Error(`Failed to get job logs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get logs for a specific session
   * @param sessionId Session identifier
   * @param filters Optional filters
   * @returns Promise resolving to filtered logs
   */
  async getLogsForSession(sessionId: string, filters?: LogFilters): Promise<RuntimeLog[]> {
    try {
      const allLogs = await this.readAllLogs();
      
      let filteredLogs = allLogs.filter(log => log.sessionId === sessionId);
      
      if (filters) {
        filteredLogs = this.applyFilters(filteredLogs, filters);
      }
      
      return filteredLogs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    } catch (error) {
      systemLogger.error(`Failed to get logs for session ${sessionId}:`, error);
      throw new Error(`Failed to get session logs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get logs for a specific agent
   * @param agentType Agent type
   * @param filters Optional filters
   * @returns Promise resolving to filtered logs
   */
  async getLogsForAgent(agentType: string, filters?: LogFilters): Promise<RuntimeLog[]> {
    try {
      const allLogs = await this.readAllLogs();
      
      let filteredLogs = allLogs.filter(log => log.agentType === agentType);
      
      if (filters) {
        filteredLogs = this.applyFilters(filteredLogs, filters);
      }
      
      return filteredLogs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    } catch (error) {
      systemLogger.error(`Failed to get logs for agent ${agentType}:`, error);
      throw new Error(`Failed to get agent logs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ==================== Log Analysis ====================

  /**
   * Analyze performance for a specific job
   * @param jobId Job identifier
   * @returns Promise resolving to performance analysis
   */
  async analyzePerformance(jobId: string): Promise<PerformanceAnalysis> {
    try {
      const jobLogs = await this.getLogsForJob(jobId);
      
      if (jobLogs.length === 0) {
        throw new Error(`No logs found for job ${jobId}`);
      }

      // Calculate performance metrics
      const eventsWithDuration = jobLogs.filter(log => log.data.duration && typeof log.data.duration === 'number');
      const avgEventDuration = eventsWithDuration.length > 0
        ? eventsWithDuration.reduce((sum, log) => sum + (log.data.duration as number), 0) / eventsWithDuration.length
        : 0;

      // Find slowest events
      const slowestEvents = eventsWithDuration
        .sort((a, b) => (b.data.duration as number) - (a.data.duration as number))
        .slice(0, 5)
        .map(log => ({
          event: log.event,
          duration: log.data.duration as number,
          timestamp: log.timestamp
        }));

      // Calculate error and warning rates
      const errorLogs = jobLogs.filter(log => log.level === 'error' || log.level === 'critical');
      const warningLogs = jobLogs.filter(log => log.level === 'warn');
      
      const errorRate = jobLogs.length > 0 ? errorLogs.length / jobLogs.length : 0;
      const warningRate = jobLogs.length > 0 ? warningLogs.length / jobLogs.length : 0;

      // Calculate performance score (0-1, higher is better)
      const performanceScore = Math.max(0, 1 - (errorRate * 0.5) - (warningRate * 0.2) - (avgEventDuration > 1000 ? 0.3 : 0));

      // Generate recommendations
      const recommendations: string[] = [];
      if (errorRate > 0.1) {
        recommendations.push('High error rate detected - investigate error patterns');
      }
      if (warningRate > 0.2) {
        recommendations.push('Many warnings detected - review warning patterns');
      }
      if (avgEventDuration > 1000) {
        recommendations.push('Slow average event duration - optimize performance');
      }
      if (slowestEvents.length > 0 && slowestEvents[0].duration > 5000) {
        recommendations.push(`Very slow event detected: ${slowestEvents[0].event}`);
      }

      return {
        jobId,
        totalEvents: jobLogs.length,
        avgEventDuration,
        slowestEvents,
        errorRate,
        warningRate,
        performanceScore,
        recommendations
      };
    } catch (error) {
      systemLogger.error(`Failed to analyze performance for job ${jobId}:`, error);
      throw new Error(`Failed to analyze performance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find error patterns across logs
   * @param agentType Optional agent type filter
   * @param timeRange Optional time range filter
   * @returns Promise resolving to error patterns
   */
  async findErrorPatterns(agentType?: string, timeRange?: TimeRange): Promise<ErrorPattern[]> {
    try {
      let logs = await this.readAllLogs();
      
      // Filter by agent type if specified
      if (agentType) {
        logs = logs.filter(log => log.agentType === agentType);
      }
      
      // Filter by time range if specified
      if (timeRange) {
        logs = logs.filter(log => 
          log.timestamp >= timeRange.start && log.timestamp <= timeRange.end
        );
      }
      
      // Get error logs only
      const errorLogs = logs.filter(log => log.level === 'error' || log.level === 'critical');
      
      // Group errors by pattern (event + error message)
      const patternMap = new Map<string, {
        pattern: string;
        occurrences: number;
        agentTypes: Set<string>;
        avgResolutionTime?: number;
        commonContext: string[];
        logs: RuntimeLog[];
      }>();

      for (const log of errorLogs) {
        const errorMsg = log.data.error as string || 'Unknown error';
        const pattern = `${log.event}: ${errorMsg.substring(0, 100)}`;
        
        if (!patternMap.has(pattern)) {
          patternMap.set(pattern, {
            pattern,
            occurrences: 0,
            agentTypes: new Set(),
            commonContext: [],
            logs: []
          });
        }
        
        const entry = patternMap.get(pattern)!;
        entry.occurrences++;
        entry.agentTypes.add(log.agentType);
        entry.logs.push(log);
      }

      // Convert to error patterns and calculate metrics
      const errorPatterns: ErrorPattern[] = Array.from(patternMap.entries())
        .filter(([_, entry]) => entry.occurrences >= 2) // Only patterns with multiple occurrences
        .map(([_, entry]) => {
          // Calculate average resolution time (if available)
          const resolutionTimes = entry.logs
            .map(log => log.data.resolutionTime as number)
            .filter(time => typeof time === 'number');
          
          const avgResolutionTime = resolutionTimes.length > 0
            ? resolutionTimes.reduce((sum, time) => sum + time, 0) / resolutionTimes.length
            : undefined;

          // Extract common context
          const contextEntries = entry.logs
            .map(log => log.data.context as string)
            .filter(context => typeof context === 'string');
          
          const commonContext = [...new Set(contextEntries)].slice(0, 5);

          // Generate recommendations
          const recommendations: string[] = [];
          if (entry.occurrences > 5) {
            recommendations.push('High frequency error - add prevention logic');
          }
          if (avgResolutionTime && avgResolutionTime > 30) {
            recommendations.push('Long resolution time - improve error handling');
          }
          if (entry.agentTypes.size > 1) {
            recommendations.push('Cross-agent error - check shared dependencies');
          }

          return {
            pattern: entry.pattern,
            occurrences: entry.occurrences,
            agentTypes: Array.from(entry.agentTypes),
            avgResolutionTime,
            commonContext,
            recommendations
          };
        })
        .sort((a, b) => b.occurrences - a.occurrences); // Sort by frequency

      return errorPatterns;
    } catch (error) {
      systemLogger.error('Failed to find error patterns:', error);
      throw new Error(`Failed to find error patterns: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ==================== Maintenance ====================

  /**
   * Rotate log files
   * @returns Promise resolving to number of rotated logs
   */
  async rotateLogs(): Promise<number> {
    try {
      // Flush any pending logs first
      await this.flushBuffer();
      
      const logDir = path.join(this.config.storageBasePath, 'logs');
      const files = await fs.readdir(logDir);
      const logFiles = files.filter(file => file.endsWith('.log'));
      
      let rotatedCount = 0;
      const now = new Date();
      const rotationSuffix = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
      
      for (const file of logFiles) {
        const filePath = path.join(logDir, file);
        const stats = await fs.stat(filePath);
        
        // Rotate files older than 24 hours
        if (Date.now() - stats.mtime.getTime() > 24 * 60 * 60 * 1000) {
          const baseName = file.replace('.log', '');
          const rotatedName = `${baseName}.${rotationSuffix}.log`;
          const rotatedPath = path.join(logDir, rotatedName);
          
          await fs.rename(filePath, rotatedPath);
          rotatedCount++;
        }
      }
      
      systemLogger.info(`Rotated ${rotatedCount} log files`);
      return rotatedCount;
    } catch (error) {
      systemLogger.error('Failed to rotate logs:', error);
      throw new Error(`Failed to rotate logs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Cleanup old log files
   * @param olderThanDays Age threshold in days
   * @returns Promise resolving to number of deleted logs
   */
  async cleanupLogs(olderThanDays: number): Promise<number> {
    try {
      const logDir = path.join(this.config.storageBasePath, 'logs');
      const files = await fs.readdir(logDir);
      const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
      
      let deletedCount = 0;
      
      for (const file of files) {
        const filePath = path.join(logDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime.getTime() < cutoffTime) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }
      
      systemLogger.info(`Cleaned up ${deletedCount} old log files`);
      return deletedCount;
    } catch (error) {
      systemLogger.error(`Failed to cleanup logs older than ${olderThanDays} days:`, error);
      throw new Error(`Failed to cleanup logs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Flush pending logs and stop logger
   */
  async shutdown(): Promise<void> {
    try {
      if (this.flushTimer) {
        clearInterval(this.flushTimer);
        this.flushTimer = undefined;
      }
      
      await this.flushBuffer();
      systemLogger.debug('Runtime Logger shutdown complete');
    } catch (error) {
      systemLogger.error('Failed to shutdown Runtime Logger:', error);
    }
  }

  // ==================== Private Helper Methods ====================

  private async ensureLogDirectoryStructure(): Promise<void> {
    const logDir = path.join(this.config.storageBasePath, 'logs');
    await fs.mkdir(logDir, { recursive: true });
  }

  private startBufferFlushing(): void {
    this.flushTimer = setInterval(async () => {
      try {
        await this.flushBuffer();
      } catch (error) {
        systemLogger.error('Failed to flush log buffer:', error);
      }
    }, RuntimeLogger.FLUSH_INTERVAL_MS);
  }

  private async flushBuffer(): Promise<void> {
    if (this.logBuffer.length === 0) return;

    try {
      // Group logs by job/session for efficient writing
      const logsByJob = new Map<string, RuntimeLog[]>();
      
      for (const log of this.logBuffer) {
        const key = `${log.jobId}_${log.sessionId}`;
        if (!logsByJob.has(key)) {
          logsByJob.set(key, []);
        }
        logsByJob.get(key)!.push(log);
      }
      
      // Write logs to files
      const writePromises = Array.from(logsByJob.entries()).map(async ([key, logs]) => {
        const logFilePath = this.getLogFilePath(key);
        const logLines = logs.map(log => JSON.stringify(log) + '\n').join('');
        
        try {
          await fs.appendFile(logFilePath, logLines);
        } catch (error) {
          // If file doesn't exist, create it
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            await fs.writeFile(logFilePath, logLines);
          } else {
            throw error;
          }
        }
      });
      
      await Promise.all(writePromises);
      
      // Clear buffer
      this.logBuffer.length = 0;
    } catch (error) {
      systemLogger.error('Failed to flush log buffer:', error);
      // Keep logs in buffer for retry
    }
  }

  private async readAllLogs(): Promise<RuntimeLog[]> {
    try {
      const logDir = path.join(this.config.storageBasePath, 'logs');
      const files = await fs.readdir(logDir);
      const logFiles = files.filter(file => file.endsWith('.log'));
      
      const allLogs: RuntimeLog[] = [];
      
      for (const file of logFiles) {
        const filePath = path.join(logDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.trim().split('\n').filter(line => line);
        
        for (const line of lines) {
          try {
            const log = JSON.parse(line, this.dateReviver) as RuntimeLog;
            allLogs.push(log);
          } catch (parseError) {
            systemLogger.warn(`Failed to parse log line in ${file}:`, parseError);
          }
        }
      }
      
      return allLogs;
    } catch (error) {
      systemLogger.error('Failed to read all logs:', error);
      return [];
    }
  }

  private applyFilters(logs: RuntimeLog[], filters: LogFilters): RuntimeLog[] {
    let filtered = logs;
    
    if (filters.level) {
      filtered = filtered.filter(log => filters.level!.includes(log.level));
    }
    
    if (filters.event) {
      filtered = filtered.filter(log => filters.event!.includes(log.event));
    }
    
    if (filters.startTime) {
      filtered = filtered.filter(log => log.timestamp >= filters.startTime!);
    }
    
    if (filters.endTime) {
      filtered = filtered.filter(log => log.timestamp <= filters.endTime!);
    }
    
    if (filters.hasError !== undefined) {
      filtered = filtered.filter(log => 
        filters.hasError ? (log.data.error !== undefined) : (log.data.error === undefined)
      );
    }
    
    if (filters.minDuration !== undefined) {
      filtered = filtered.filter(log => 
        log.data.duration !== undefined && (log.data.duration as number) >= filters.minDuration!
      );
    }
    
    return filtered;
  }

  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getLogFilePath(key: string): string {
    const logDir = path.join(this.config.storageBasePath, 'logs');
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(logDir, `${key}_${today}.log`);
  }

  private dateReviver(key: string, value: unknown): unknown {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      return new Date(value);
    }
    return value;
  }
}