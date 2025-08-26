// Enhanced Graceful Degradation System with Comprehensive Error Handling
// Provides intelligent error recovery, circuit breakers, and health monitoring

import { EventEmitter } from 'events';
import { ForgeFlowError, ErrorCategory, ErrorSeverity } from './errors';
import { logger } from './logger';

// Component Types and Interfaces
export enum ComponentCriticality {
  CRITICAL = 'critical',
  IMPORTANT = 'important',
  OPTIONAL = 'optional',
  ENHANCEMENT = 'enhancement',
}

export enum ComponentStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  FAILED = 'failed',
  RECOVERING = 'recovering',
  DISABLED = 'disabled',
}

export interface ComponentHealth {
  componentId: string;
  status: ComponentStatus;
  criticality: ComponentCriticality;
  lastHealthCheck: Date;
  failureCount: number;
  recoveryAttempts: number;
  maxRecoveryAttempts: number;
  lastFailure?: Date;
  errorMessage?: string;
  fallbackActive: boolean;
  metrics: {
    uptime: number;
    lastResponseTime: number;
    successRate: number;
  };
}

export interface ComponentFallback {
  name: string;
  performance: 'high' | 'medium' | 'low';
  isAvailable: () => boolean;
  execute: () => Promise<void>;
}

export interface SystemComponent {
  id: string;
  name: string;
  criticality: ComponentCriticality;
  healthCheck: () => Promise<boolean>;
  recovery?: () => Promise<void>;
  fallbacks?: ComponentFallback[];
  dependencies?: string[];
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  halfOpenMaxCalls: number;
}

export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

export interface CircuitBreaker {
  state: CircuitBreakerState;
  failures: number;
  nextAttempt: number;
  successfulCalls: number;
}

/**
 * Global Error Handler with Circuit Breaker Pattern
 */
export class ErrorHandler {
  private static instance: ErrorHandler;
  private errorCounts = new Map<string, number>();
  private errorMetrics = new Map<string, { count: number; lastSeen: Date; resolved: number }>();
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private criticalErrors: ForgeFlowError[] = [];

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  /**
   * Handle error with intelligent classification and response
   */
  handleError(error: Error | ForgeFlowError): void {
    const errorKey = this.generateErrorKey(error);

    // Update error tracking
    this.updateErrorMetrics(errorKey, error);

    // Apply circuit breaker logic
    this.updateCircuitBreaker(errorKey, false);

    // Check for critical errors
    if (error instanceof ForgeFlowError && error.severity === ErrorSeverity.CRITICAL) {
      this.handleCriticalError(error);
    }

    // Log with context
    logger.error(`Handled error: ${error.message}`, error, {
      errorKey,
      count: this.errorCounts.get(errorKey),
      circuitState: this.circuitBreakers.get(errorKey)?.state,
    });
  }

  /**
   * Create circuit breaker for operation
   */
  createCircuitBreaker(operationKey: string, config: CircuitBreakerConfig): void {
    this.circuitBreakers.set(operationKey, {
      state: CircuitBreakerState.CLOSED,
      failures: 0,
      nextAttempt: 0,
      successfulCalls: 0,
    });
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async executeWithCircuitBreaker<T>(
    operationKey: string,
    operation: () => Promise<T>,
    fallback?: () => Promise<T>,
  ): Promise<T> {
    const breaker = this.circuitBreakers.get(operationKey);
    if (!breaker) {
      throw new ForgeFlowError({
        code: 'CIRCUIT_BREAKER_NOT_FOUND',
        message: 'Circuit breaker not found',
        category: ErrorCategory.INTERNAL_ERROR,
        severity: ErrorSeverity.HIGH,
        context: { operationKey },
      });
    }

    // Check circuit breaker state
    if (breaker.state === CircuitBreakerState.OPEN) {
      if (Date.now() < breaker.nextAttempt) {
        if (fallback) {
          logger.warn(`Circuit breaker OPEN, using fallback for ${operationKey}`);
          return await fallback();
        }
        throw new ForgeFlowError({
          code: 'CIRCUIT_BREAKER_OPEN',
          message: 'Circuit breaker is OPEN',
          category: ErrorCategory.CIRCUIT_BREAKER,
          severity: ErrorSeverity.HIGH,
          context: { operationKey, nextAttempt: breaker.nextAttempt },
        });
      }
      // Move to half-open state
      breaker.state = CircuitBreakerState.HALF_OPEN;
      breaker.successfulCalls = 0;
    }

    try {
      const result = await operation();
      this.updateCircuitBreaker(operationKey, true);
      return result;
    } catch (error) {
      this.updateCircuitBreaker(operationKey, false);
      this.handleError(error as Error);

      // Check circuit breaker state after update
      const updatedBreaker = this.circuitBreakers.get(operationKey);
      if (fallback && updatedBreaker?.state === CircuitBreakerState.OPEN) {
        logger.warn(`Operation failed, using fallback for ${operationKey}`);
        return await fallback();
      }

      throw error;
    }
  }

  /**
   * Update circuit breaker state based on operation result
   */
  private updateCircuitBreaker(operationKey: string, success: boolean): void {
    const breaker = this.circuitBreakers.get(operationKey);
    if (!breaker) return;

    if (success) {
      breaker.failures = 0;
      breaker.successfulCalls++;

      if (breaker.state === CircuitBreakerState.HALF_OPEN && breaker.successfulCalls >= 3) {
        breaker.state = CircuitBreakerState.CLOSED;
        logger.info(`Circuit breaker CLOSED for ${operationKey}`);
      }
    } else {
      breaker.failures++;

      if (breaker.state === CircuitBreakerState.CLOSED && breaker.failures >= 5) {
        breaker.state = CircuitBreakerState.OPEN;
        breaker.nextAttempt = Date.now() + 60000; // 1 minute
        logger.warn(`Circuit breaker OPEN for ${operationKey}`);
      } else if (breaker.state === CircuitBreakerState.HALF_OPEN) {
        breaker.state = CircuitBreakerState.OPEN;
        breaker.nextAttempt = Date.now() + 60000;
        logger.warn(`Circuit breaker returned to OPEN for ${operationKey}`);
      }
    }
  }

  private generateErrorKey(error: Error): string {
    return `${error.constructor.name}:${(error.message || '').substring(0, 100)}`;
  }

  private updateErrorMetrics(errorKey: string, error: Error): void {
    const current = this.errorCounts.get(errorKey) || 0;
    this.errorCounts.set(errorKey, current + 1);

    const metrics = this.errorMetrics.get(errorKey) || {
      count: 0,
      lastSeen: new Date(),
      resolved: 0,
    };
    metrics.count++;
    metrics.lastSeen = new Date();
    this.errorMetrics.set(errorKey, metrics);
  }

  private handleCriticalError(error: ForgeFlowError): void {
    this.criticalErrors.push(error);

    // Keep only last 50 critical errors
    if (this.criticalErrors.length > 50) {
      this.criticalErrors = this.criticalErrors.slice(-50);
    }

    // Log critical error for external monitoring
    logger.error('Critical error detected', error, {
      type: 'critical-error',
      errorId: error.code,
      severity: error.severity,
      category: error.category,
      context: error.context,
    });
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    totalErrors: number;
    uniqueErrors: number;
    criticalErrors: number;
    circuitBreakers: Array<{ operation: string; state: CircuitBreakerState; failures: number }>;
    topErrors: Array<{ error: string; count: number; lastSeen: Date }>;
  } {
    const circuitBreakers = Array.from(this.circuitBreakers.entries()).map(
      ([operation, breaker]) => ({
        operation,
        state: breaker.state,
        failures: breaker.failures,
      }),
    );

    const topErrors = Array.from(this.errorMetrics.entries())
      .map(([error, metrics]) => ({
        error,
        count: metrics.count,
        lastSeen: metrics.lastSeen,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const totalErrors = Array.from(this.errorCounts.values()).reduce(
      (sum, count) => sum + count,
      0,
    );

    return {
      totalErrors,
      uniqueErrors: this.errorCounts.size,
      criticalErrors: this.criticalErrors.length,
      circuitBreakers,
      topErrors,
    };
  }
}

/**
 * Comprehensive Graceful Degradation Manager
 */
export class GracefulDegradationManager extends EventEmitter {
  private components = new Map<string, SystemComponent>();
  private componentHealth = new Map<string, ComponentHealth>();
  private healthCheckIntervals = new Map<string, NodeJS.Timeout>();
  private recoveryQueues = new Map<string, Promise<void>>();
  private systemHealthScore = 100;
  private isShuttingDown = false;

  constructor() {
    super();
    this.setupSystemHealthTracking();
  }

  /**
   * Register a component for health monitoring
   */
  registerComponent(component: SystemComponent): void {
    this.components.set(component.id, component);

    const health: ComponentHealth = {
      componentId: component.id,
      status: ComponentStatus.HEALTHY,
      criticality: component.criticality,
      lastHealthCheck: new Date(),
      failureCount: 0,
      recoveryAttempts: 0,
      maxRecoveryAttempts: 3,
      fallbackActive: false,
      metrics: {
        uptime: 0,
        lastResponseTime: 0,
        successRate: 1.0,
      },
    };

    this.componentHealth.set(component.id, health);

    // Start health check monitoring
    const interval = setInterval(async () => {
      if (!this.isShuttingDown) {
        await this.checkComponentHealth(component.id);
      }
    }, 30000); // Check every 30 seconds

    this.healthCheckIntervals.set(component.id, interval);

    logger.info(`Registered component ${component.name}`, {
      componentId: component.id,
      criticality: component.criticality,
    });
  }

  /**
   * Check health of a specific component
   */
  async checkComponentHealth(componentId: string): Promise<ComponentHealth> {
    const component = this.components.get(componentId);
    const health = this.componentHealth.get(componentId);

    if (!component || !health) {
      throw new Error(`Component ${componentId} not found`);
    }

    const previousStatus = health.status;

    try {
      const startTime = Date.now();
      const isHealthy = await component.healthCheck();
      const responseTime = Date.now() - startTime;

      health.metrics.lastResponseTime = responseTime;

      if (isHealthy) {
        if (
          previousStatus === ComponentStatus.FAILED ||
          previousStatus === ComponentStatus.DEGRADED
        ) {
          logger.info(`Component ${component.name} recovered`, { componentId });
          this.emit('componentRecovered', componentId, health);
        }

        health.status = ComponentStatus.HEALTHY;
        health.errorMessage = undefined;
        health.fallbackActive = false;
        health.recoveryAttempts = 0;
      } else {
        await this.handleComponentFailure(componentId, new Error('Health check failed'));
      }
    } catch (error) {
      await this.handleComponentFailure(componentId, error as Error);
    }

    health.lastHealthCheck = new Date();
    this.updateSystemHealthScore();

    return health;
  }

  /**
   * Handle component failure and attempt graceful degradation
   */
  private async handleComponentFailure(componentId: string, error: Error): Promise<void> {
    const component = this.components.get(componentId);
    const health = this.componentHealth.get(componentId);

    if (!component || !health) return;

    health.failureCount++;
    health.lastFailure = new Date();
    health.errorMessage = error.message;
    const previousStatus = health.status;

    logger.error(`Component ${component.name} failed health check`, {
      componentId,
      error: error.message,
      failureCount: health.failureCount,
      criticality: component.criticality,
    });

    // Determine new status based on criticality and available fallbacks
    if (component.criticality === ComponentCriticality.CRITICAL) {
      if (component.fallbacks && component.fallbacks.length > 0) {
        health.status = ComponentStatus.DEGRADED;
        await this.activateFallback(componentId);
      } else {
        health.status = ComponentStatus.FAILED;
        this.emit('criticalComponentFailed', componentId, error);
      }
    } else {
      health.status = ComponentStatus.FAILED;
      if (component.fallbacks && component.fallbacks.length > 0) {
        await this.activateFallback(componentId);
      }
    }

    // Attempt recovery if available
    if (component.recovery && health.recoveryAttempts < health.maxRecoveryAttempts) {
      this.scheduleRecovery(componentId);
    }

    // Emit events based on criticality
    if (previousStatus !== health.status) {
      this.emit('componentStatusChanged', componentId, health.status, previousStatus);

      if (component.criticality === ComponentCriticality.CRITICAL) {
        this.emit('criticalComponentDegraded', componentId, health);
      }
    }
  }

  /**
   * Activate fallback strategies for a component
   */
  private async activateFallback(componentId: string): Promise<void> {
    const component = this.components.get(componentId);
    const health = this.componentHealth.get(componentId);

    if (!component?.fallbacks || !health) return;

    // Find the best available fallback
    const availableFallbacks = component.fallbacks.filter((fallback) => fallback.isAvailable());

    if (availableFallbacks.length === 0) {
      logger.warn(`No fallbacks available for component ${component.name}`, { componentId });
      return;
    }

    // Sort by performance (high > medium > low)
    const sortedFallbacks = availableFallbacks.sort((a, b) => {
      const performanceOrder = { high: 3, medium: 2, low: 1 };
      return performanceOrder[b.performance] - performanceOrder[a.performance];
    });

    const selectedFallback = sortedFallbacks[0];

    try {
      logger.info(`Activating fallback for component ${component.name}`, {
        componentId,
        fallback: selectedFallback.name,
        performance: selectedFallback.performance,
      });

      await selectedFallback.execute();
      health.fallbackActive = true;

      this.emit('fallbackActivated', componentId, selectedFallback.name);
    } catch (fallbackError) {
      logger.error(`Fallback failed for component ${component.name}`, {
        componentId,
        fallback: selectedFallback.name,
        error: String(fallbackError),
      });

      this.emit('fallbackFailed', componentId, selectedFallback.name, fallbackError);
    }
  }

  /**
   * Schedule component recovery
   */
  private scheduleRecovery(componentId: string): void {
    const component = this.components.get(componentId);
    const health = this.componentHealth.get(componentId);

    if (!component?.recovery || !health) return;

    // Avoid multiple concurrent recovery attempts
    if (this.recoveryQueues.has(componentId)) {
      return;
    }

    const recoveryDelay = Math.min(Math.pow(2, health.recoveryAttempts) * 1000, 300000); // Max 5 minutes

    logger.info(`Scheduling recovery for component ${component.name}`, {
      componentId,
      attempt: health.recoveryAttempts + 1,
      delay: recoveryDelay,
    });

    const recoveryPromise = new Promise<void>(async (resolve) => {
      await new Promise((r) => setTimeout(r, recoveryDelay));

      if (this.isShuttingDown) {
        resolve();
        return;
      }

      health.status = ComponentStatus.RECOVERING;
      health.recoveryAttempts++;

      this.emit('componentRecoveryStarted', componentId, health.recoveryAttempts);

      try {
        await component.recovery();

        // Verify recovery with health check
        const isHealthy = await component.healthCheck();

        if (isHealthy) {
          health.status = ComponentStatus.HEALTHY;
          health.errorMessage = undefined;
          health.failureCount = 0;
          health.recoveryAttempts = 0;
          health.fallbackActive = false;

          logger.info(`Component ${component.name} recovered successfully`, { componentId });
          this.emit('componentRecovered', componentId, health);
        } else {
          throw new Error('Health check failed after recovery');
        }
      } catch (recoveryError) {
        logger.error(`Recovery failed for component ${component.name}`, {
          componentId,
          attempt: health.recoveryAttempts,
          error: String(recoveryError),
        });

        health.status = ComponentStatus.FAILED;
        this.emit('componentRecoveryFailed', componentId, health.recoveryAttempts, recoveryError);

        // Schedule next recovery attempt if within limits
        if (health.recoveryAttempts < health.maxRecoveryAttempts) {
          setTimeout(() => this.scheduleRecovery(componentId), recoveryDelay * 2);
        }
      } finally {
        this.recoveryQueues.delete(componentId);
        resolve();
      }
    });

    this.recoveryQueues.set(componentId, recoveryPromise);
  }

  /**
   * Get system health status
   */
  getSystemHealth(): {
    score: number;
    status: 'healthy' | 'degraded' | 'critical';
    components: ComponentHealth[];
    criticalIssues: string[];
    recommendedActions: string[];
  } {
    const components = Array.from(this.componentHealth.values());
    const criticalIssues: string[] = [];
    const recommendedActions: string[] = [];

    // Identify critical issues
    const criticalFailed = components.filter(
      (c) => c.criticality === ComponentCriticality.CRITICAL && c.status === ComponentStatus.FAILED,
    );

    const criticalDegraded = components.filter(
      (c) =>
        c.criticality === ComponentCriticality.CRITICAL && c.status === ComponentStatus.DEGRADED,
    );

    if (criticalFailed.length > 0) {
      criticalIssues.push(`${criticalFailed.length} critical components failed`);
      recommendedActions.push('Immediate attention required for critical components');
    }

    if (criticalDegraded.length > 0) {
      criticalIssues.push(`${criticalDegraded.length} critical components degraded`);
      recommendedActions.push('Monitor critical components running on fallbacks');
    }

    const status =
      this.systemHealthScore >= 90
        ? 'healthy'
        : this.systemHealthScore >= 70
          ? 'degraded'
          : 'critical';

    return {
      score: this.systemHealthScore,
      status,
      components,
      criticalIssues,
      recommendedActions,
    };
  }

  /**
   * Update system health score based on component status
   */
  private updateSystemHealthScore(): void {
    const components = Array.from(this.componentHealth.values());
    if (components.length === 0) {
      this.systemHealthScore = 100;
      return;
    }

    let totalWeight = 0;
    let weightedScore = 0;

    for (const health of components) {
      const weight = this.getComponentWeight(health.criticality);
      const score = this.getComponentScore(health);

      totalWeight += weight;
      weightedScore += score * weight;
    }

    this.systemHealthScore = Math.round(weightedScore / totalWeight);
    this.emit('systemHealthUpdated', this.systemHealthScore);
  }

  /**
   * Get component weight for health score calculation
   */
  private getComponentWeight(criticality: ComponentCriticality): number {
    switch (criticality) {
      case ComponentCriticality.CRITICAL:
        return 4;
      case ComponentCriticality.IMPORTANT:
        return 3;
      case ComponentCriticality.OPTIONAL:
        return 2;
      case ComponentCriticality.ENHANCEMENT:
        return 1;
    }
  }

  /**
   * Get component score based on status
   */
  private getComponentScore(health: ComponentHealth): number {
    switch (health.status) {
      case ComponentStatus.HEALTHY:
        return 100;
      case ComponentStatus.DEGRADED:
        return health.fallbackActive ? 60 : 40;
      case ComponentStatus.RECOVERING:
        return 30;
      case ComponentStatus.FAILED:
        return 0;
      case ComponentStatus.DISABLED:
        return 80; // Intentionally disabled
      default:
        return 0;
    }
  }

  /**
   * Setup system health tracking
   */
  private setupSystemHealthTracking(): void {
    // Track system health metrics
    setInterval(() => {
      if (this.isShuttingDown) return;

      const health = this.getSystemHealth();

      logger.debug('System health update', {
        score: health.score,
        status: health.status,
        components: health.components.length,
        criticalIssues: health.criticalIssues.length,
      });
    }, 60000); // Every minute
  }

  /**
   * Manually trigger component health check
   */
  async forceHealthCheck(componentId: string): Promise<ComponentHealth> {
    return await this.checkComponentHealth(componentId);
  }

  /**
   * Get specific component health
   */
  getComponentHealth(componentId: string): ComponentHealth | null {
    return this.componentHealth.get(componentId) || null;
  }

  /**
   * Disable component (for maintenance)
   */
  disableComponent(componentId: string, reason: string): void {
    const health = this.componentHealth.get(componentId);
    if (health) {
      health.status = ComponentStatus.DISABLED;
      health.errorMessage = `Disabled: ${reason}`;

      logger.info(`Component ${componentId} disabled`, { reason });
      this.emit('componentDisabled', componentId, reason);
    }
  }

  /**
   * Enable component
   */
  enableComponent(componentId: string): void {
    const health = this.componentHealth.get(componentId);
    if (health && health.status === ComponentStatus.DISABLED) {
      health.status = ComponentStatus.HEALTHY;
      health.errorMessage = undefined;

      logger.info(`Component ${componentId} enabled`);
      this.emit('componentEnabled', componentId);
    }
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Clear all timers
    for (const timer of this.healthCheckIntervals.values()) {
      clearInterval(timer);
    }
    this.healthCheckIntervals.clear();

    // Wait for ongoing recovery operations
    await Promise.all(this.recoveryQueues.values());

    logger.info('Graceful degradation manager shut down');
    this.emit('shutdown');
  }
}

// Singleton instance
export const gracefulDegradation = new GracefulDegradationManager();
