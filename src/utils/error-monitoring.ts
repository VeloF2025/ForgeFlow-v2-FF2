/**
 * 🟢 NEW: Enhanced Error Monitoring and Alerting System
 * Provides comprehensive error monitoring, alerting, and real-time notifications
 */

import { EventEmitter } from 'events';
import { ForgeFlowError, ErrorCategory, ErrorSeverity, ErrorHandler } from './errors';
import { logger } from './logger';
import { gracefulDegradation } from './graceful-degradation';

// Alert configuration and types
export interface AlertConfig {
  id: string;
  name: string;
  description: string;
  severity: ErrorSeverity;
  triggers: AlertTrigger[];
  actions: AlertAction[];
  enabled: boolean;
  cooldownMs: number; // Minimum time between alerts of same type
  maxAlertsPerHour: number;
}

export interface AlertTrigger {
  type: 'error-count' | 'error-rate' | 'severity' | 'category' | 'pattern' | 'health-score';
  condition: string; // e.g., '>= 5', '< 80', 'contains network'
  timeWindowMs: number; // Time window for rate-based triggers
  threshold: number | string;
}

export interface AlertAction {
  type: 'log' | 'email' | 'webhook' | 'slack' | 'console' | 'metric';
  config: Record<string, any>;
  enabled: boolean;
}

export interface Alert {
  id: string;
  configId: string;
  timestamp: Date;
  severity: ErrorSeverity;
  title: string;
  description: string;
  context: Record<string, any>;
  resolved: boolean;
  resolvedAt?: Date;
  actions: Array<{
    type: string;
    status: 'pending' | 'success' | 'failed';
    error?: string;
    timestamp: Date;
  }>;
}

export interface SystemHealthMetrics {
  timestamp: Date;
  errorRate: number; // errors per minute
  totalErrors: number;
  criticalErrors: number;
  systemHealthScore: number;
  componentHealth: Record<string, {
    status: string;
    score: number;
    lastError?: Date;
  }>;
  circuitBreakers: Record<string, {
    state: string;
    failures: number;
    successRate: number;
  }>;
  recoveryMetrics: {
    attempts: number;
    successes: number;
    successRate: number;
  };
}

/**
 * Real-time Error Monitoring System
 */
export class ErrorMonitoringSystem extends EventEmitter {
  private static instance: ErrorMonitoringSystem;
  private alertConfigs = new Map<string, AlertConfig>();
  private activeAlerts = new Map<string, Alert>();
  private alertHistory: Alert[] = [];
  private alertCooldowns = new Map<string, Date>();
  private alertCounts = new Map<string, number>();
  private healthMetrics: SystemHealthMetrics[] = [];
  private isMonitoring = false;
  private metricsInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;

  static getInstance(): ErrorMonitoringSystem {
    if (!ErrorMonitoringSystem.instance) {
      ErrorMonitoringSystem.instance = new ErrorMonitoringSystem();
    }
    return ErrorMonitoringSystem.instance;
  }

  constructor() {
    super();
    this.setupDefaultAlerts();
    this.setupErrorHandler();
  }

  /**
   * Start the monitoring system
   */
  start(): void {
    if (this.isMonitoring) {
      logger.warn('Error monitoring system is already running');
      return;
    }

    this.isMonitoring = true;
    
    // Collect metrics every 60 seconds
    this.metricsInterval = setInterval(() => {
      this.collectHealthMetrics();
    }, 60000);

    // Clean up old data every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldData();
    }, 3600000);

    logger.info('Error monitoring system started');
    this.emit('started');
  }

  /**
   * Stop the monitoring system
   */
  stop(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    logger.info('Error monitoring system stopped');
    this.emit('stopped');
  }

  /**
   * Register an alert configuration
   */
  registerAlert(config: AlertConfig): void {
    this.alertConfigs.set(config.id, config);
    logger.debug(`Registered alert: ${config.name}`, { alertId: config.id });
  }

  /**
   * Process an error and check for alerts
   */
  private processError(error: ForgeFlowError): void {
    if (!this.isMonitoring) {
      return;
    }

    // Check each alert configuration
    for (const [configId, config] of this.alertConfigs) {
      if (!config.enabled) {
        continue;
      }

      if (this.shouldTriggerAlert(error, config)) {
        this.triggerAlert(error, config);
      }
    }

    // Update metrics immediately for critical errors
    if (error.severity === ErrorSeverity.CRITICAL) {
      this.collectHealthMetrics();
    }
  }

  /**
   * Check if an alert should be triggered
   */
  private shouldTriggerAlert(error: ForgeFlowError, config: AlertConfig): boolean {
    // Check cooldown
    const lastAlert = this.alertCooldowns.get(config.id);
    if (lastAlert && Date.now() - lastAlert.getTime() < config.cooldownMs) {
      return false;
    }

    // Check hourly limit
    const currentHour = Math.floor(Date.now() / 3600000);
    const alertKey = `${config.id}-${currentHour}`;
    const hourlyCount = this.alertCounts.get(alertKey) || 0;
    if (hourlyCount >= config.maxAlertsPerHour) {
      return false;
    }

    // Check triggers
    return config.triggers.some(trigger => this.evaluateTrigger(error, trigger, config));
  }

  /**
   * Evaluate a specific trigger condition
   */
  private evaluateTrigger(error: ForgeFlowError, trigger: AlertTrigger, config: AlertConfig): boolean {
    const errorHandler = ErrorHandler.getInstance();
    const metrics = errorHandler.getErrorMetrics();

    switch (trigger.type) {
      case 'severity':
        return error.severity === trigger.threshold;

      case 'category':
        return error.category === trigger.threshold;

      case 'pattern':
        return error.message.toLowerCase().includes(String(trigger.threshold).toLowerCase());

      case 'error-count':
        return this.evaluateCondition(metrics.totalErrors, trigger.condition, Number(trigger.threshold));

      case 'error-rate':
        const recentMetrics = this.getRecentMetrics(trigger.timeWindowMs);
        const errorRate = this.calculateErrorRate(recentMetrics);
        return this.evaluateCondition(errorRate, trigger.condition, Number(trigger.threshold));

      case 'health-score':
        return this.evaluateCondition(metrics.healthScore, trigger.condition, Number(trigger.threshold));

      default:
        return false;
    }
  }

  /**
   * Evaluate a condition string like ">= 5" or "< 80"
   */
  private evaluateCondition(value: number, condition: string, threshold: number): boolean {
    const trimmedCondition = condition.trim();
    
    if (trimmedCondition.startsWith('>=')) {
      return value >= threshold;
    } else if (trimmedCondition.startsWith('<=')) {
      return value <= threshold;
    } else if (trimmedCondition.startsWith('>')) {
      return value > threshold;
    } else if (trimmedCondition.startsWith('<')) {
      return value < threshold;
    } else if (trimmedCondition === '=' || trimmedCondition === '==') {
      return value === threshold;
    } else if (trimmedCondition === '!=') {
      return value !== threshold;
    }
    
    return false;
  }

  /**
   * Trigger an alert
   */
  private async triggerAlert(error: ForgeFlowError, config: AlertConfig): Promise<void> {
    const alertId = `${config.id}-${Date.now()}`;
    const alert: Alert = {
      id: alertId,
      configId: config.id,
      timestamp: new Date(),
      severity: config.severity,
      title: `${config.name}: ${error.code}`,
      description: `${config.description}\n\nError: ${error.message}`,
      context: {
        error: error.toJSON(),
        trigger: config.triggers,
        systemMetrics: this.getLatestMetrics()
      },
      resolved: false,
      actions: []
    };

    // Store alert
    this.activeAlerts.set(alertId, alert);
    this.alertHistory.push(alert);
    
    // Update cooldown and counts
    this.alertCooldowns.set(config.id, new Date());
    const currentHour = Math.floor(Date.now() / 3600000);
    const alertKey = `${config.id}-${currentHour}`;
    this.alertCounts.set(alertKey, (this.alertCounts.get(alertKey) || 0) + 1);

    // Execute alert actions
    for (const actionConfig of config.actions) {
      if (actionConfig.enabled) {
        await this.executeAlertAction(alert, actionConfig);
      }
    }

    logger.warn(`Alert triggered: ${config.name}`, {
      alertId,
      configId: config.id,
      error: error.message,
      severity: config.severity
    });

    this.emit('alert', alert);
  }

  /**
   * Execute an alert action
   */
  private async executeAlertAction(alert: Alert, actionConfig: AlertAction): Promise<void> {
    const action: {
      type: string;
      status: 'pending' | 'success' | 'failed';
      error?: string;
      timestamp: Date;
    } = {
      type: actionConfig.type,
      status: 'pending',
      timestamp: new Date()
    };

    alert.actions.push(action);

    try {
      switch (actionConfig.type) {
        case 'log':
          this.executeLogAction(alert, actionConfig.config);
          break;
        
        case 'console':
          this.executeConsoleAction(alert, actionConfig.config);
          break;
        
        case 'webhook':
          await this.executeWebhookAction(alert, actionConfig.config);
          break;
        
        case 'email':
          await this.executeEmailAction(alert, actionConfig.config);
          break;
        
        case 'slack':
          await this.executeSlackAction(alert, actionConfig.config);
          break;
        
        case 'metric':
          this.executeMetricAction(alert, actionConfig.config);
          break;
        
        default:
          throw new Error(`Unknown action type: ${actionConfig.type}`);
      }

      action.status = 'success';
    } catch (error) {
      action.status = 'failed';
      action.error = String(error);
      logger.error(`Alert action failed: ${actionConfig.type}`, {
        alertId: alert.id,
        error: String(error)
      });
    }
  }

  /**
   * Execute log action
   */
  private executeLogAction(alert: Alert, config: any): void {
    const level = config.level || 'error';
    logger.log(level, `🚨 ALERT: ${alert.title}`, {
      alertId: alert.id,
      description: alert.description,
      severity: alert.severity,
      context: alert.context
    });
  }

  /**
   * Execute console action
   */
  private executeConsoleAction(alert: Alert, config: any): void {
    const prefix = config.prefix || '🚨 FORGEFLOW ALERT';
    console.error(`\n${prefix}: ${alert.title}`);
    console.error(`Description: ${alert.description}`);
    console.error(`Severity: ${alert.severity}`);
    console.error(`Time: ${alert.timestamp.toISOString()}\n`);
  }

  /**
   * Execute webhook action
   */
  private async executeWebhookAction(alert: Alert, config: any): Promise<void> {
    const https = require('https');
    const url = new URL(config.url);
    
    const payload = {
      alert,
      timestamp: alert.timestamp.toISOString(),
      source: 'forgeflow-v2'
    };

    const postData = JSON.stringify(payload);

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          ...(config.headers || {})
        }
      }, (res: any) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Webhook failed with status ${res.statusCode}`));
        }
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  /**
   * Execute email action (placeholder - requires email service integration)
   */
  private async executeEmailAction(alert: Alert, config: any): Promise<void> {
    // This is a placeholder - in a real implementation, you'd integrate with
    // an email service like SendGrid, AWS SES, etc.
    logger.info('Email alert would be sent', {
      to: config.to,
      subject: `ForgeFlow Alert: ${alert.title}`,
      alertId: alert.id
    });
  }

  /**
   * Execute Slack action (placeholder - requires Slack integration)
   */
  private async executeSlackAction(alert: Alert, config: any): Promise<void> {
    // This is a placeholder - in a real implementation, you'd integrate with
    // Slack's webhook API
    logger.info('Slack alert would be sent', {
      channel: config.channel,
      message: alert.title,
      alertId: alert.id
    });
  }

  /**
   * Execute metric action (send to metrics system)
   */
  private executeMetricAction(alert: Alert, config: any): void {
    // Emit metric event that can be picked up by monitoring systems
    this.emit('metric', {
      name: config.metricName || 'forgeflow.alert',
      value: 1,
      tags: {
        severity: alert.severity,
        configId: alert.configId,
        ...(config.tags || {})
      },
      timestamp: alert.timestamp
    });
  }

  /**
   * Collect current system health metrics
   */
  private collectHealthMetrics(): void {
    const errorHandler = ErrorHandler.getInstance();
    const errorMetrics = errorHandler.getErrorMetrics();
    const gracefulMetrics = gracefulDegradation.getSystemHealth();

    const metrics: SystemHealthMetrics = {
      timestamp: new Date(),
      errorRate: this.calculateCurrentErrorRate(),
      totalErrors: errorMetrics.totalErrors,
      criticalErrors: this.getCriticalErrorCount(),
      systemHealthScore: gracefulMetrics.score,
      componentHealth: this.getComponentHealthSummary(gracefulMetrics.components),
      circuitBreakers: this.getCircuitBreakerSummary(),
      recoveryMetrics: {
        attempts: this.getTotalRecoveryAttempts(errorMetrics.recoveryMetrics),
        successes: this.getTotalRecoverySuccesses(errorMetrics.recoveryMetrics),
        successRate: this.calculateRecoverySuccessRate(errorMetrics.recoveryMetrics)
      }
    };

    this.healthMetrics.push(metrics);
    
    // Keep only last 24 hours of metrics
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    this.healthMetrics = this.healthMetrics.filter(m => m.timestamp.getTime() > cutoff);

    this.emit('metrics', metrics);
  }

  /**
   * Get recent metrics within time window
   */
  private getRecentMetrics(timeWindowMs: number): SystemHealthMetrics[] {
    const cutoff = Date.now() - timeWindowMs;
    return this.healthMetrics.filter(m => m.timestamp.getTime() > cutoff);
  }

  /**
   * Calculate error rate from recent metrics
   */
  private calculateErrorRate(metrics: SystemHealthMetrics[]): number {
    if (metrics.length < 2) {
      return 0;
    }

    const latest = metrics[metrics.length - 1];
    const earliest = metrics[0];
    const timeDiff = latest.timestamp.getTime() - earliest.timestamp.getTime();
    const errorDiff = latest.totalErrors - earliest.totalErrors;

    // Return errors per minute
    return (errorDiff / (timeDiff / 60000));
  }

  /**
   * Calculate current error rate (last 5 minutes)
   */
  private calculateCurrentErrorRate(): number {
    const recentMetrics = this.getRecentMetrics(5 * 60 * 1000); // 5 minutes
    return this.calculateErrorRate(recentMetrics);
  }

  /**
   * Get count of critical errors in active alerts
   */
  private getCriticalErrorCount(): number {
    return Array.from(this.activeAlerts.values())
      .filter(alert => alert.severity === ErrorSeverity.CRITICAL && !alert.resolved)
      .length;
  }

  /**
   * Get latest metrics
   */
  private getLatestMetrics(): SystemHealthMetrics | null {
    return this.healthMetrics.length > 0 ? this.healthMetrics[this.healthMetrics.length - 1] : null;
  }

  /**
   * Helper methods for metrics processing
   */
  private getComponentHealthSummary(components: any[]): Record<string, any> {
    const summary: Record<string, any> = {};
    for (const component of components) {
      summary[component.componentId] = {
        status: component.status,
        score: this.componentStatusToScore(component.status),
        lastError: component.lastFailure
      };
    }
    return summary;
  }

  private componentStatusToScore(status: string): number {
    const scores: Record<string, number> = {
      'healthy': 100,
      'degraded': 60,
      'recovering': 30,
      'failed': 0,
      'disabled': 80
    };
    return scores[status] || 50;
  }

  private getCircuitBreakerSummary(): Record<string, any> {
    // This would integrate with the CircuitBreaker class from errors.ts
    // For now, return empty object
    return {};
  }

  private getTotalRecoveryAttempts(recoveryMetrics: Record<string, any>): number {
    return Object.values(recoveryMetrics).reduce((sum: number, metrics: any) => 
      sum + (metrics.attempts || 0), 0);
  }

  private getTotalRecoverySuccesses(recoveryMetrics: Record<string, any>): number {
    return Object.values(recoveryMetrics).reduce((sum: number, metrics: any) => 
      sum + (metrics.successes || 0), 0);
  }

  private calculateRecoverySuccessRate(recoveryMetrics: Record<string, any>): number {
    const total = this.getTotalRecoveryAttempts(recoveryMetrics);
    const successes = this.getTotalRecoverySuccesses(recoveryMetrics);
    return total > 0 ? (successes / total) * 100 : 100;
  }

  /**
   * Setup error handler integration
   */
  private setupErrorHandler(): void {
    const errorHandler = ErrorHandler.getInstance();
    errorHandler.onCriticalError((error: ForgeFlowError) => {
      this.processError(error);
    });
  }

  /**
   * Setup default alert configurations
   */
  private setupDefaultAlerts(): void {
    // High error rate alert
    this.registerAlert({
      id: 'high-error-rate',
      name: 'High Error Rate',
      description: 'System is experiencing an unusually high error rate',
      severity: ErrorSeverity.HIGH,
      triggers: [{
        type: 'error-rate',
        condition: '> 10',
        timeWindowMs: 300000, // 5 minutes
        threshold: 10
      }],
      actions: [
        { type: 'log', enabled: true, config: { level: 'error' } },
        { type: 'console', enabled: true, config: { prefix: '🚨 HIGH ERROR RATE' } }
      ],
      enabled: true,
      cooldownMs: 300000, // 5 minutes
      maxAlertsPerHour: 6
    });

    // Critical error alert
    this.registerAlert({
      id: 'critical-error',
      name: 'Critical Error',
      description: 'A critical error has occurred',
      severity: ErrorSeverity.CRITICAL,
      triggers: [{
        type: 'severity',
        condition: '=',
        timeWindowMs: 0,
        threshold: ErrorSeverity.CRITICAL
      }],
      actions: [
        { type: 'log', enabled: true, config: { level: 'critical' } },
        { type: 'console', enabled: true, config: { prefix: '🔴 CRITICAL ERROR' } }
      ],
      enabled: true,
      cooldownMs: 60000, // 1 minute
      maxAlertsPerHour: 20
    });

    // Low system health alert
    this.registerAlert({
      id: 'low-health-score',
      name: 'Low System Health',
      description: 'System health score has dropped below acceptable levels',
      severity: ErrorSeverity.HIGH,
      triggers: [{
        type: 'health-score',
        condition: '< 70',
        timeWindowMs: 0,
        threshold: 70
      }],
      actions: [
        { type: 'log', enabled: true, config: { level: 'warn' } },
        { type: 'console', enabled: true, config: { prefix: '⚠️ LOW SYSTEM HEALTH' } }
      ],
      enabled: true,
      cooldownMs: 600000, // 10 minutes
      maxAlertsPerHour: 3
    });
  }

  /**
   * Clean up old data
   */
  private cleanupOldData(): void {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    
    // Clean up alert history
    this.alertHistory = this.alertHistory.filter(alert => 
      alert.timestamp.getTime() > cutoff);
    
    // Clean up resolved alerts from active alerts
    for (const [id, alert] of this.activeAlerts) {
      if (alert.resolved && alert.resolvedAt && alert.resolvedAt.getTime() < cutoff) {
        this.activeAlerts.delete(id);
      }
    }

    // Clean up old alert counts
    const currentHour = Math.floor(Date.now() / 3600000);
    for (const [key] of this.alertCounts) {
      const keyHour = parseInt(key.split('-').pop() || '0');
      if (currentHour - keyHour > 24) { // More than 24 hours old
        this.alertCounts.delete(key);
      }
    }

    logger.debug('Cleaned up old monitoring data');
  }

  /**
   * Get current system status
   */
  getSystemStatus(): {
    monitoring: boolean;
    activeAlerts: number;
    totalAlerts: number;
    latestMetrics: SystemHealthMetrics | null;
    alertConfigs: number;
  } {
    return {
      monitoring: this.isMonitoring,
      activeAlerts: Array.from(this.activeAlerts.values()).filter(a => !a.resolved).length,
      totalAlerts: this.alertHistory.length,
      latestMetrics: this.getLatestMetrics(),
      alertConfigs: this.alertConfigs.size
    };
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string, reason?: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (!alert || alert.resolved) {
      return false;
    }

    alert.resolved = true;
    alert.resolvedAt = new Date();
    if (reason) {
      alert.context.resolutionReason = reason;
    }

    logger.info(`Alert resolved: ${alert.title}`, {
      alertId,
      reason,
      duration: alert.resolvedAt.getTime() - alert.timestamp.getTime()
    });

    this.emit('alertResolved', alert);
    return true;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values()).filter(alert => !alert.resolved);
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit = 100): Alert[] {
    return this.alertHistory.slice(-limit);
  }

  /**
   * Get health metrics history
   */
  getHealthMetrics(hours = 24): SystemHealthMetrics[] {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    return this.healthMetrics.filter(m => m.timestamp.getTime() > cutoff);
  }
}

// Export singleton instance
export const errorMonitoring = ErrorMonitoringSystem.getInstance();