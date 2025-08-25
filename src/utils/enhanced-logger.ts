// Enhanced Logger with Comprehensive Error Analysis and Alerting
// Provides structured logging, error categorization, and intelligent alerting

import * as winston from 'winston';
import { ForgeFlowError, ErrorCategory, ErrorSeverity } from './errors';
import { ErrorHandler } from './graceful-degradation';

interface LogEntry {
  timestamp: Date;
  level: string;
  category: string;
  message: string;
  context?: Record<string, unknown>;
  source: string;
  severity?: ErrorSeverity;
  tags: string[];
  stackTrace?: string;
}

interface ErrorAlert {
  id: string;
  timestamp: Date;
  severity: ErrorSeverity;
  category: ErrorCategory;
  message: string;
  affectedComponents: string[];
  actionRequired: boolean;
  escalationLevel: 'low' | 'medium' | 'high' | 'critical';
  additionalContext: Record<string, unknown>;
}

interface LoggingMetrics {
  errorsByCategory: Record<ErrorCategory, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  errorsBySource: Record<string, number>;
  errorTrends: {
    last24Hours: number;
    last7Days: number;
    last30Days: number;
  };
  topErrors: Array<{
    message: string;
    count: number;
    lastOccurrence: Date;
  }>;
  alertsGenerated: number;
  performanceMetrics: {
    averageLogProcessingTime: number;
    logVolume: number;
    storageUsed: number;
  };
}

/**
 * Enhanced Logger with intelligent error analysis and alerting
 * 
 * Features:
 * - Structured logging with categorization
 * - Error pattern recognition
 * - Automated alerting for critical issues
 * - Performance metrics and monitoring
 * - Context-aware log processing
 * - Sensitive data sanitization
 */
export class EnhancedLogger {
  private winston: winston.Logger;
  private logBuffer: LogEntry[] = [];
  private errorCounts = new Map<string, number>();
  private errorLastSeen = new Map<string, Date>();
  private alertQueue: ErrorAlert[] = [];
  private logProcessingTimes: number[] = [];
  private isShuttingDown = false;

  constructor(options: {
    logDir?: string;
    level?: string;
    maxFiles?: number;
    maxSize?: string;
    enableConsole?: boolean;
    enableAlerts?: boolean;
  } = {}) {
    this.winston = winston.createLogger({
      level: options.level || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] })
      ),
      transports: [
        // File transport for all logs
        new winston.transports.File({
          filename: `${options.logDir || './logs'}/forgeflow-combined.log`,
          maxFiles: options.maxFiles || 10,
          maxsize: this.parseSize(options.maxSize || '50MB'),
          tailable: true
        }),
        
        // Separate file for errors only
        new winston.transports.File({
          filename: `${options.logDir || './logs'}/forgeflow-errors.log`,
          level: 'error',
          maxFiles: options.maxFiles || 5,
          maxsize: this.parseSize(options.maxSize || '50MB'),
          tailable: true
        }),
        
        // Separate file for structured error analysis
        new winston.transports.File({
          filename: `${options.logDir || './logs'}/forgeflow-error-analysis.log`,
          level: 'error',
          maxFiles: 3,
          maxsize: this.parseSize('100MB'),
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
            winston.format.printf((info) => {
              return JSON.stringify({
                ...info,
                analysis: this.generateErrorAnalysis(info)
              }, null, 2);
            })
          )
        })
      ],
      
      // Exception handling
      exceptionHandlers: [
        new winston.transports.File({
          filename: `${options.logDir || './logs'}/forgeflow-exceptions.log`
        })
      ],
      
      // Rejection handling
      rejectionHandlers: [
        new winston.transports.File({
          filename: `${options.logDir || './logs'}/forgeflow-rejections.log`
        })
      ],
      
      exitOnError: false
    });

    // Add console transport if enabled
    if (options.enableConsole !== false) {
      this.winston.add(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple(),
          winston.format.printf((info) => {
            const { timestamp, level, message, ...meta } = info;
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
            return `${timestamp} [${level}]: ${message} ${metaStr}`;
          })
        )
      }));
    }

    this.setupLogProcessing();
    this.setupMetricsCollection();
    
    if (options.enableAlerts !== false) {
      this.setupAlerting();
    }
  }

  /**
   * Log an error with enhanced categorization
   */
  error(
    message: string, 
    error?: Error | ForgeFlowError, 
    context?: Record<string, unknown>,
    source = 'unknown'
  ): void {
    const startTime = Date.now();
    
    const logEntry: LogEntry = {
      timestamp: new Date(),
      level: 'error',
      category: this.categorizeError(error),
      message,
      context: this.sanitizeContext(context),
      source,
      severity: this.determineSeverity(error),
      tags: this.generateTags(error, context)
    };

    if (error) {
      logEntry.stackTrace = error.stack;
      
      if (error instanceof ForgeFlowError) {
        logEntry.context = {
          ...logEntry.context,
          errorCode: error.code,
          errorCategory: error.category,
          errorSeverity: error.severity,
          recoverable: error.recoverable,
          userMessage: error.userMessage
        };
      }
    }

    this.processLogEntry(logEntry);
    this.updateErrorMetrics(logEntry, error);
    this.checkForAlerts(logEntry, error);
    
    this.logProcessingTimes.push(Date.now() - startTime);
    if (this.logProcessingTimes.length > 1000) {
      this.logProcessingTimes = this.logProcessingTimes.slice(-100);
    }
  }

  /**
   * Log a warning with categorization
   */
  warn(
    message: string, 
    context?: Record<string, unknown>,
    source = 'unknown'
  ): void {
    const logEntry: LogEntry = {
      timestamp: new Date(),
      level: 'warn',
      category: 'warning',
      message,
      context: this.sanitizeContext(context),
      source,
      severity: ErrorSeverity.LOW,
      tags: this.generateTags(undefined, context)
    };

    this.processLogEntry(logEntry);
  }

  /**
   * Log info with context
   */
  info(
    message: string,
    context?: Record<string, unknown>,
    source = 'unknown'
  ): void {
    const logEntry: LogEntry = {
      timestamp: new Date(),
      level: 'info',
      category: 'information',
      message,
      context: this.sanitizeContext(context),
      source,
      tags: this.generateTags(undefined, context)
    };

    this.processLogEntry(logEntry);
  }

  /**
   * Log debug information
   */
  debug(
    message: string,
    context?: Record<string, unknown>,
    source = 'unknown'
  ): void {
    const logEntry: LogEntry = {
      timestamp: new Date(),
      level: 'debug',
      category: 'debug',
      message,
      context: this.sanitizeContext(context),
      source,
      tags: this.generateTags(undefined, context)
    };

    this.processLogEntry(logEntry);
  }

  /**
   * Process and store log entry
   */
  private processLogEntry(entry: LogEntry): void {
    // Add to buffer for batch processing
    this.logBuffer.push(entry);
    
    // Write to winston immediately for errors and warnings
    if (entry.level === 'error' || entry.level === 'warn') {
      this.winston.log(entry.level, entry.message, {
        category: entry.category,
        context: entry.context,
        source: entry.source,
        severity: entry.severity,
        tags: entry.tags,
        stackTrace: entry.stackTrace,
        timestamp: entry.timestamp
      });
    } else {
      // For info/debug, use winston's normal logging
      this.winston.log(entry.level, entry.message, entry.context);
    }
  }

  /**
   * Categorize error for structured logging
   */
  private categorizeError(error?: Error | ForgeFlowError): string {
    if (!error) return 'generic';
    
    if (error instanceof ForgeFlowError) {
      return error.category;
    }

    // Categorize based on error message/type
    const message = error.message.toLowerCase();
    
    if (message.includes('network') || message.includes('connection')) {
      return ErrorCategory.NETWORK;
    }
    if (message.includes('timeout')) {
      return ErrorCategory.TIMEOUT;
    }
    if (message.includes('validation') || message.includes('invalid')) {
      return ErrorCategory.VALIDATION;
    }
    if (message.includes('auth') || message.includes('permission')) {
      return ErrorCategory.AUTHENTICATION;
    }
    if (message.includes('github') || message.includes('api')) {
      return ErrorCategory.GITHUB_INTEGRATION;
    }
    if (message.includes('file') || message.includes('path')) {
      return ErrorCategory.FILE_SYSTEM;
    }
    
    return ErrorCategory.INTERNAL_ERROR;
  }

  /**
   * Determine error severity
   */
  private determineSeverity(error?: Error | ForgeFlowError): ErrorSeverity {
    if (!error) return ErrorSeverity.LOW;
    
    if (error instanceof ForgeFlowError) {
      return error.severity;
    }

    // Determine severity based on error characteristics
    const message = error.message.toLowerCase();
    
    if (message.includes('critical') || message.includes('fatal')) {
      return ErrorSeverity.CRITICAL;
    }
    if (message.includes('security') || message.includes('unauthorized')) {
      return ErrorSeverity.HIGH;
    }
    if (message.includes('timeout') || message.includes('network')) {
      return ErrorSeverity.MEDIUM;
    }
    
    return ErrorSeverity.LOW;
  }

  /**
   * Generate contextual tags for log entry
   */
  private generateTags(error?: Error | ForgeFlowError, context?: Record<string, unknown>): string[] {
    const tags: string[] = [];

    if (error instanceof ForgeFlowError) {
      tags.push(`category:${error.category}`);
      tags.push(`severity:${error.severity}`);
      tags.push(`recoverable:${error.recoverable}`);
    }

    if (context) {
      // Extract meaningful tags from context
      if (context.operationName) tags.push(`operation:${context.operationName}`);
      if (context.agentId) tags.push(`agent:${context.agentId}`);
      if (context.executionId) tags.push(`execution:${context.executionId}`);
      if (context.userId) tags.push(`user:${context.userId}`);
    }

    return tags;
  }

  /**
   * Sanitize context for logging (remove sensitive data)
   */
  private sanitizeContext(context?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!context) return undefined;

    const sensitiveFields = ['token', 'password', 'secret', 'key', 'auth', 'credential'];
    const sanitized = { ...context };

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    // Deep sanitize nested objects
    for (const [key, value] of Object.entries(sanitized)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeContext(value as Record<string, unknown>);
      }
    }

    return sanitized;
  }

  /**
   * Update error metrics and tracking
   */
  private updateErrorMetrics(entry: LogEntry, error?: Error | ForgeFlowError): void {
    const errorKey = `${entry.category}:${entry.message.substring(0, 100)}`;
    
    this.errorCounts.set(errorKey, (this.errorCounts.get(errorKey) || 0) + 1);
    this.errorLastSeen.set(errorKey, entry.timestamp);

    // Update global error handler metrics
    if (error) {
      ErrorHandler.getInstance().handleError(error);
    }
  }

  /**
   * Check if alerts should be generated
   */
  private checkForAlerts(entry: LogEntry, error?: Error | ForgeFlowError): void {
    if (entry.level !== 'error' || !error) return;

    const shouldAlert = 
      entry.severity === ErrorSeverity.CRITICAL ||
      (entry.severity === ErrorSeverity.HIGH && entry.category === ErrorCategory.SECURITY) ||
      this.isRecurringError(entry);

    if (shouldAlert) {
      this.generateAlert(entry, error);
    }
  }

  /**
   * Check if error is recurring
   */
  private isRecurringError(entry: LogEntry): boolean {
    const errorKey = `${entry.category}:${entry.message.substring(0, 100)}`;
    const count = this.errorCounts.get(errorKey) || 0;
    
    return count >= 5; // Alert after 5 occurrences
  }

  /**
   * Generate alert for significant errors
   */
  private generateAlert(entry: LogEntry, error: Error | ForgeFlowError): void {
    const alert: ErrorAlert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: entry.timestamp,
      severity: entry.severity || ErrorSeverity.MEDIUM,
      category: entry.category as ErrorCategory,
      message: entry.message,
      affectedComponents: this.identifyAffectedComponents(entry),
      actionRequired: entry.severity === ErrorSeverity.CRITICAL,
      escalationLevel: this.determineEscalationLevel(entry.severity || ErrorSeverity.MEDIUM),
      additionalContext: entry.context || {}
    };

    this.alertQueue.push(alert);
    this.processAlert(alert);
  }

  /**
   * Identify components affected by error
   */
  private identifyAffectedComponents(entry: LogEntry): string[] {
    const components: string[] = [];
    
    if (entry.source && entry.source !== 'unknown') {
      components.push(entry.source);
    }
    
    if (entry.context?.operationName) {
      components.push(String(entry.context.operationName));
    }
    
    return components;
  }

  /**
   * Determine escalation level
   */
  private determineEscalationLevel(severity: ErrorSeverity): 'low' | 'medium' | 'high' | 'critical' {
    switch (severity) {
      case ErrorSeverity.CRITICAL: return 'critical';
      case ErrorSeverity.HIGH: return 'high';
      case ErrorSeverity.MEDIUM: return 'medium';
      case ErrorSeverity.LOW: return 'low';
      default: return 'low';
    }
  }

  /**
   * Process generated alert
   */
  private processAlert(alert: ErrorAlert): void {
    // Log the alert
    this.winston.error('ALERT GENERATED', {
      alertId: alert.id,
      severity: alert.severity,
      category: alert.category,
      escalationLevel: alert.escalationLevel,
      affectedComponents: alert.affectedComponents,
      actionRequired: alert.actionRequired
    });

    // Log the alert generation - external systems can monitor logs for alerts
    this.winston.info('Alert generated', {
      type: 'alert',
      alert: {
        id: alert.id,
        severity: alert.severity,
        category: alert.category,
        escalationLevel: alert.escalationLevel,
        affectedComponents: alert.affectedComponents,
        actionRequired: alert.actionRequired
      }
    });
  }

  /**
   * Generate error analysis for structured logging
   */
  private generateErrorAnalysis(info: any): Record<string, unknown> {
    const analysis = {
      errorFingerprint: this.generateErrorFingerprint(info),
      possibleCauses: this.identifyPossibleCauses(info),
      recommendedActions: this.suggestActions(info),
      relatedErrors: this.findRelatedErrors(info),
      impactAssessment: this.assessImpact(info)
    };

    return analysis;
  }

  /**
   * Generate unique fingerprint for error
   */
  private generateErrorFingerprint(info: any): string {
    const key = `${info.category || 'unknown'}-${info.message?.substring(0, 50) || 'no-message'}`;
    return Buffer.from(key).toString('base64').substring(0, 16);
  }

  /**
   * Identify possible causes of error
   */
  private identifyPossibleCauses(info: any): string[] {
    const causes: string[] = [];
    const message = info.message?.toLowerCase() || '';
    
    if (message.includes('network') || message.includes('connection')) {
      causes.push('Network connectivity issues');
      causes.push('External service unavailable');
    }
    
    if (message.includes('timeout')) {
      causes.push('Operation taking too long');
      causes.push('Resource contention');
    }
    
    if (message.includes('validation') || message.includes('invalid')) {
      causes.push('Invalid input data');
      causes.push('Schema validation failure');
    }
    
    return causes;
  }

  /**
   * Suggest actions based on error
   */
  private suggestActions(info: any): string[] {
    const actions: string[] = [];
    const category = info.category || '';
    
    switch (category) {
      case ErrorCategory.NETWORK:
        actions.push('Check network connectivity');
        actions.push('Verify external service status');
        break;
      case ErrorCategory.VALIDATION:
        actions.push('Validate input parameters');
        actions.push('Check data format requirements');
        break;
      case ErrorCategory.GITHUB_INTEGRATION:
        actions.push('Verify GitHub token validity');
        actions.push('Check repository permissions');
        break;
      default:
        actions.push('Review error details and context');
    }
    
    return actions;
  }

  /**
   * Find related errors
   */
  private findRelatedErrors(info: any): string[] {
    // This would be more sophisticated in a real implementation
    // For now, return placeholder
    return [];
  }

  /**
   * Assess error impact
   */
  private assessImpact(info: any): Record<string, unknown> {
    return {
      severity: info.severity || 'unknown',
      affectedUsers: 'unknown',
      systemAvailability: info.severity === ErrorSeverity.CRITICAL ? 'degraded' : 'normal',
      dataIntegrity: 'unknown'
    };
  }

  /**
   * Get logging metrics
   */
  getMetrics(): LoggingMetrics {
    const now = Date.now();
    const last24Hours = now - (24 * 60 * 60 * 1000);
    const last7Days = now - (7 * 24 * 60 * 60 * 1000);
    const last30Days = now - (30 * 24 * 60 * 60 * 1000);

    const recentErrors = this.logBuffer.filter(entry => entry.level === 'error');
    
    const errorTrends = {
      last24Hours: recentErrors.filter(e => e.timestamp.getTime() > last24Hours).length,
      last7Days: recentErrors.filter(e => e.timestamp.getTime() > last7Days).length,
      last30Days: recentErrors.filter(e => e.timestamp.getTime() > last30Days).length
    };

    const errorsByCategory: Record<ErrorCategory, number> = {} as any;
    const errorsBySeverity: Record<ErrorSeverity, number> = {} as any;
    const errorsBySource: Record<string, number> = {};

    for (const entry of recentErrors) {
      // Count by category
      const category = entry.category as ErrorCategory;
      errorsByCategory[category] = (errorsByCategory[category] || 0) + 1;
      
      // Count by severity
      if (entry.severity) {
        errorsBySeverity[entry.severity] = (errorsBySeverity[entry.severity] || 0) + 1;
      }
      
      // Count by source
      errorsBySource[entry.source] = (errorsBySource[entry.source] || 0) + 1;
    }

    const topErrors = Array.from(this.errorCounts.entries())
      .map(([key, count]) => ({
        message: key,
        count,
        lastOccurrence: this.errorLastSeen.get(key) || new Date()
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const avgProcessingTime = this.logProcessingTimes.length > 0 
      ? this.logProcessingTimes.reduce((sum, time) => sum + time, 0) / this.logProcessingTimes.length
      : 0;

    return {
      errorsByCategory,
      errorsBySeverity,
      errorsBySource,
      errorTrends,
      topErrors,
      alertsGenerated: this.alertQueue.length,
      performanceMetrics: {
        averageLogProcessingTime: avgProcessingTime,
        logVolume: this.logBuffer.length,
        storageUsed: 0 // Would calculate actual storage usage
      }
    };
  }

  /**
   * Setup log processing (batch processing, cleanup)
   */
  private setupLogProcessing(): void {
    setInterval(() => {
      if (this.isShuttingDown) return;
      
      // Clean old log buffer entries (keep last 10000)
      if (this.logBuffer.length > 10000) {
        this.logBuffer = this.logBuffer.slice(-5000);
      }
      
      // Clean old error tracking
      const cutoff = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)); // 30 days
      for (const [key, date] of this.errorLastSeen.entries()) {
        if (date < cutoff) {
          this.errorLastSeen.delete(key);
          this.errorCounts.delete(key);
        }
      }
    }, 300000); // Every 5 minutes
  }

  /**
   * Setup metrics collection
   */
  private setupMetricsCollection(): void {
    setInterval(() => {
      if (this.isShuttingDown) return;
      
      const metrics = this.getMetrics();
      this.winston.info('Logging metrics', { metrics });
    }, 600000); // Every 10 minutes
  }

  /**
   * Setup alerting system
   */
  private setupAlerting(): void {
    setInterval(() => {
      if (this.isShuttingDown) return;
      
      // Clean old alerts
      const cutoff = new Date(Date.now() - (24 * 60 * 60 * 1000)); // 24 hours
      this.alertQueue = this.alertQueue.filter(alert => alert.timestamp > cutoff);
    }, 3600000); // Every hour
  }

  /**
   * Parse size string to bytes
   */
  private parseSize(sizeStr: string): number {
    const units: Record<string, number> = {
      'B': 1,
      'KB': 1024,
      'MB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024
    };
    
    const match = sizeStr.match(/^(\d+)\s*(\w+)$/);
    if (!match) return 52428800; // Default 50MB
    
    const [, size, unit] = match;
    return parseInt(size) * (units[unit.toUpperCase()] || 1);
  }

  /**
   * Shutdown logger
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    return new Promise((resolve) => {
      this.winston.end(() => {
        resolve();
      });
    });
  }
}

// Export singleton instance
export const enhancedLogger = new EnhancedLogger({
  logDir: './logs',
  level: process.env.LOG_LEVEL || 'info',
  enableConsole: process.env.NODE_ENV !== 'production',
  enableAlerts: true
});