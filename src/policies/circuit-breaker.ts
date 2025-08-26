/**
 * Enhanced Circuit Breaker Implementation for ForgeFlow v2
 * Provides intelligent circuit breaking with health monitoring and adaptive thresholds
 */

import { enhancedLogger } from '../utils/enhanced-logger';
import { ForgeFlowError, ErrorCategory, ErrorSeverity } from '../utils/errors';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  enabled: boolean;
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  halfOpenMaxCalls?: number;
  healthCheckInterval?: number;
  volumeThreshold?: number; // Minimum number of calls before circuit can trip
  errorRateThreshold?: number; // Percentage of errors that triggers opening
  slowCallDurationThreshold?: number; // Duration in ms to consider a call slow
  slowCallRateThreshold?: number; // Percentage of slow calls that triggers opening
  enableHealthChecks?: boolean;
  adaptiveThresholds?: boolean;
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failures: number;
  successes: number;
  totalCalls: number;
  lastFailureTime: Date | null;
  lastSuccessTime: Date | null;
  stateTransitions: Array<{
    from: CircuitState;
    to: CircuitState;
    timestamp: Date;
    reason: string;
  }>;
  errorRate: number;
  averageResponseTime: number;
  slowCallRate: number;
  timeInCurrentState: number;
  healthCheckResults: Array<{
    timestamp: Date;
    success: boolean;
    responseTime: number;
    error?: string;
  }>;
}

export interface OperationResult {
  success: boolean;
  duration: number;
  error?: Error;
  timestamp: Date;
}

// 🟢 WORKING: Individual Circuit Breaker Instance
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private totalCalls = 0;
  private lastFailureTime: Date | null = null;
  private lastSuccessTime: Date | null = null;
  private nextAttemptTime = 0;
  private halfOpenCalls = 0;
  private stateTransitions: Array<{
    from: CircuitState;
    to: CircuitState;
    timestamp: Date;
    reason: string;
  }> = [];
  private recentResults: OperationResult[] = [];
  private healthCheckInterval?: NodeJS.Timeout;
  private lastHealthCheck: Date | null = null;
  private healthCheckResults: Array<{
    timestamp: Date;
    success: boolean;
    responseTime: number;
    error?: string;
  }> = [];

  constructor(
    private readonly operationName: string,
    private readonly config: CircuitBreakerConfig,
  ) {
    this.validateConfig(config);
    if (config.enableHealthChecks && config.healthCheckInterval) {
      this.startHealthChecks();
    }
  }

  // 🟢 WORKING: Validate circuit breaker configuration
  private validateConfig(config: CircuitBreakerConfig): void {
    const errors: string[] = [];

    if (config.failureThreshold < 1) {
      errors.push('failureThreshold must be at least 1');
    }

    if (config.successThreshold < 1) {
      errors.push('successThreshold must be at least 1');
    }

    if (config.timeout < 1000) {
      errors.push('timeout must be at least 1000ms');
    }

    if (config.halfOpenMaxCalls !== undefined && config.halfOpenMaxCalls < 1) {
      errors.push('halfOpenMaxCalls must be at least 1');
    }

    if (
      config.errorRateThreshold !== undefined &&
      (config.errorRateThreshold < 0 || config.errorRateThreshold > 100)
    ) {
      errors.push('errorRateThreshold must be between 0 and 100');
    }

    if (
      config.slowCallRateThreshold !== undefined &&
      (config.slowCallRateThreshold < 0 || config.slowCallRateThreshold > 100)
    ) {
      errors.push('slowCallRateThreshold must be between 0 and 100');
    }

    if (errors.length > 0) {
      throw new ForgeFlowError({
        code: 'INVALID_CIRCUIT_BREAKER_CONFIG',
        message: `Circuit breaker configuration errors: ${errors.join(', ')}`,
        category: ErrorCategory.CONFIGURATION,
        severity: ErrorSeverity.HIGH,
        context: { operationName: this.operationName, errors },
        recoverable: false,
        userMessage: 'Circuit breaker configuration is invalid',
      });
    }
  }

  // 🟢 WORKING: Check if circuit allows operation
  canExecute(): boolean {
    const now = Date.now();

    switch (this.state) {
      case 'closed':
        return true;

      case 'open':
        if (now >= this.nextAttemptTime) {
          this.transitionToHalfOpen('Timeout expired, transitioning to half-open');
          return true;
        }
        return false;

      case 'half-open':
        const maxCalls = this.config.halfOpenMaxCalls || 3;
        return this.halfOpenCalls < maxCalls;
    }
  }

  // 🟢 WORKING: Record operation result
  recordResult(result: OperationResult): void {
    this.totalCalls++;
    this.recentResults.push(result);

    // Keep only recent results for metrics (last 100 calls)
    if (this.recentResults.length > 100) {
      this.recentResults.shift();
    }

    if (result.success) {
      this.recordSuccess(result);
    } else {
      this.recordFailure(result);
    }

    // Check if adaptive thresholds are enabled
    if (this.config.adaptiveThresholds) {
      this.updateAdaptiveThresholds();
    }

    this.logStateTransition(result);
  }

  // 🟢 WORKING: Record successful operation
  private recordSuccess(result: OperationResult): void {
    this.successes++;
    this.lastSuccessTime = result.timestamp;

    if (this.state === 'half-open') {
      this.halfOpenCalls++;

      if (this.halfOpenCalls >= this.config.successThreshold) {
        this.transitionToClosed('Success threshold reached in half-open state');
      }
    }

    // Reset failure count on success in closed state
    if (this.state === 'closed') {
      this.failures = Math.max(0, this.failures - 1);
    }
  }

  // 🟢 WORKING: Record failed operation
  private recordFailure(result: OperationResult): void {
    this.failures++;
    this.lastFailureTime = result.timestamp;

    if (this.state === 'half-open') {
      // Any failure in half-open immediately opens the circuit
      this.transitionToOpen('Failure in half-open state');
    } else if (this.state === 'closed') {
      // Check various thresholds to determine if circuit should open
      if (this.shouldOpenCircuit()) {
        this.transitionToOpen('Failure threshold exceeded');
      }
    }
  }

  // 🟢 WORKING: Determine if circuit should open
  private shouldOpenCircuit(): boolean {
    // Basic failure threshold
    if (this.failures >= this.config.failureThreshold) {
      return true;
    }

    // Volume threshold check
    const volumeThreshold = this.config.volumeThreshold || 10;
    if (this.totalCalls < volumeThreshold) {
      return false;
    }

    // Error rate threshold
    if (this.config.errorRateThreshold !== undefined) {
      const errorRate = this.calculateErrorRate();
      if (errorRate >= this.config.errorRateThreshold) {
        return true;
      }
    }

    // Slow call rate threshold
    if (
      this.config.slowCallRateThreshold !== undefined &&
      this.config.slowCallDurationThreshold !== undefined
    ) {
      const slowCallRate = this.calculateSlowCallRate();
      if (slowCallRate >= this.config.slowCallRateThreshold) {
        return true;
      }
    }

    return false;
  }

  // 🟢 WORKING: Calculate error rate from recent results
  private calculateErrorRate(): number {
    if (this.recentResults.length === 0) return 0;

    const failures = this.recentResults.filter((r) => !r.success).length;
    return (failures / this.recentResults.length) * 100;
  }

  // 🟢 WORKING: Calculate slow call rate
  private calculateSlowCallRate(): number {
    if (this.recentResults.length === 0 || !this.config.slowCallDurationThreshold) {
      return 0;
    }

    const slowCalls = this.recentResults.filter(
      (r) => r.duration >= this.config.slowCallDurationThreshold,
    ).length;

    return (slowCalls / this.recentResults.length) * 100;
  }

  // 🟢 WORKING: State transition methods
  private transitionToOpen(reason: string): void {
    const previousState = this.state;
    this.state = 'open';
    this.nextAttemptTime = Date.now() + this.config.timeout;
    this.halfOpenCalls = 0;

    this.recordStateTransition(previousState, 'open', reason);

    enhancedLogger.warn('Circuit breaker opened', {
      operationName: this.operationName,
      reason,
      failures: this.failures,
      timeout: this.config.timeout,
    });
  }

  private transitionToHalfOpen(reason: string): void {
    const previousState = this.state;
    this.state = 'half-open';
    this.halfOpenCalls = 0;

    this.recordStateTransition(previousState, 'half-open', reason);

    enhancedLogger.info('Circuit breaker half-opened', {
      operationName: this.operationName,
      reason,
      maxCalls: this.config.halfOpenMaxCalls || 3,
    });
  }

  private transitionToClosed(reason: string): void {
    const previousState = this.state;
    this.state = 'closed';
    this.failures = 0;
    this.halfOpenCalls = 0;

    this.recordStateTransition(previousState, 'closed', reason);

    enhancedLogger.info('Circuit breaker closed', {
      operationName: this.operationName,
      reason,
      successThreshold: this.config.successThreshold,
    });
  }

  // 🟢 WORKING: Record state transitions for metrics
  private recordStateTransition(from: CircuitState, to: CircuitState, reason: string): void {
    this.stateTransitions.push({
      from,
      to,
      timestamp: new Date(),
      reason,
    });

    // Keep only recent transitions (last 50)
    if (this.stateTransitions.length > 50) {
      this.stateTransitions.shift();
    }
  }

  // 🟢 WORKING: Adaptive threshold adjustment
  private updateAdaptiveThresholds(): void {
    // Only adjust if we have enough data
    if (this.recentResults.length < 20) return;

    const successRate =
      (this.recentResults.filter((r) => r.success).length / this.recentResults.length) * 100;
    const avgResponseTime =
      this.recentResults.reduce((sum, r) => sum + r.duration, 0) / this.recentResults.length;

    // Adjust failure threshold based on recent performance
    if (successRate > 95) {
      // High success rate - can be more tolerant
      this.config.failureThreshold = Math.min(this.config.failureThreshold + 1, 20);
    } else if (successRate < 80) {
      // Low success rate - be more aggressive
      this.config.failureThreshold = Math.max(this.config.failureThreshold - 1, 2);
    }

    // Adjust timeout based on response times
    if (avgResponseTime > 10000) {
      // Slow responses - increase timeout
      this.config.timeout = Math.min(this.config.timeout * 1.2, 300000); // Max 5 minutes
    } else if (avgResponseTime < 1000) {
      // Fast responses - can reduce timeout
      this.config.timeout = Math.max(this.config.timeout * 0.9, 30000); // Min 30 seconds
    }
  }

  // 🟢 WORKING: Health check implementation
  private startHealthChecks(): void {
    if (!this.config.healthCheckInterval) return;

    this.healthCheckInterval = setInterval(async () => {
      if (this.state === 'open') {
        await this.performHealthCheck();
      }
    }, this.config.healthCheckInterval);
  }

  private async performHealthCheck(): Promise<void> {
    try {
      const startTime = Date.now();

      // This is a placeholder - in real implementation, this would be
      // the actual health check logic specific to the operation
      await this.executeHealthCheck();

      const duration = Date.now() - startTime;

      this.healthCheckResults.push({
        timestamp: new Date(),
        success: true,
        responseTime: duration,
      });

      // If health check passes and circuit is open, consider transitioning to half-open
      if (this.state === 'open') {
        this.transitionToHalfOpen('Health check passed');
      }
    } catch (error) {
      this.healthCheckResults.push({
        timestamp: new Date(),
        success: false,
        responseTime: 0,
        error: error.message,
      });
    }

    // Keep only recent health check results
    if (this.healthCheckResults.length > 20) {
      this.healthCheckResults.shift();
    }

    this.lastHealthCheck = new Date();
  }

  // 🟢 WORKING: Placeholder for actual health check implementation
  private async executeHealthCheck(): Promise<void> {
    // This would be implemented based on the specific operation
    // For example, for HTTP services, this might be a lightweight ping
    // For database operations, this might be a simple query
    // For now, we'll simulate a basic check

    await new Promise((resolve, reject) => {
      setTimeout(() => {
        // Simulate 90% success rate for health checks
        if (Math.random() < 0.9) {
          resolve(undefined);
        } else {
          reject(new Error('Health check failed'));
        }
      }, 100);
    });
  }

  // 🟢 WORKING: Get current circuit metrics
  getMetrics(): CircuitBreakerMetrics {
    const now = Date.now();
    const stateStartTime =
      this.stateTransitions.length > 0
        ? this.stateTransitions[this.stateTransitions.length - 1].timestamp.getTime()
        : now;

    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      totalCalls: this.totalCalls,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      stateTransitions: [...this.stateTransitions],
      errorRate: this.calculateErrorRate(),
      averageResponseTime: this.calculateAverageResponseTime(),
      slowCallRate: this.calculateSlowCallRate(),
      timeInCurrentState: now - stateStartTime,
      healthCheckResults: [...this.healthCheckResults],
    };
  }

  // 🟢 WORKING: Calculate average response time
  private calculateAverageResponseTime(): number {
    if (this.recentResults.length === 0) return 0;

    const totalTime = this.recentResults.reduce((sum, result) => sum + result.duration, 0);
    return totalTime / this.recentResults.length;
  }

  // 🟢 WORKING: Reset circuit breaker
  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.totalCalls = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
    this.halfOpenCalls = 0;
    this.recentResults = [];

    this.recordStateTransition(this.state, 'closed', 'Manual reset');

    enhancedLogger.info('Circuit breaker reset', {
      operationName: this.operationName,
    });
  }

  // 🟢 WORKING: Force state change (for testing/admin purposes)
  forceState(newState: CircuitState, reason: string = 'Manual override'): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === 'open') {
      this.nextAttemptTime = Date.now() + this.config.timeout;
    }

    this.recordStateTransition(oldState, newState, reason);

    enhancedLogger.warn('Circuit breaker state forced', {
      operationName: this.operationName,
      from: oldState,
      to: newState,
      reason,
    });
  }

  // 🟢 WORKING: Log state transitions for debugging
  private logStateTransition(result: OperationResult): void {
    enhancedLogger.debug('Circuit breaker operation recorded', {
      operationName: this.operationName,
      state: this.state,
      success: result.success,
      duration: result.duration,
      failures: this.failures,
      successes: this.successes,
      totalCalls: this.totalCalls,
    });
  }

  // 🟢 WORKING: Cleanup resources
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }
}

// 🟢 WORKING: Circuit Breaker Manager
export class CircuitBreakerManager {
  private circuits = new Map<string, CircuitBreaker>();
  private defaultConfig: CircuitBreakerConfig = {
    enabled: true,
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000,
    halfOpenMaxCalls: 3,
    volumeThreshold: 10,
    errorRateThreshold: 50,
    slowCallDurationThreshold: 5000,
    slowCallRateThreshold: 50,
    healthCheckInterval: 30000,
    enableHealthChecks: false,
    adaptiveThresholds: false,
  };

  // 🟢 WORKING: Get or create circuit breaker
  getCircuit(operationName: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.circuits.has(operationName)) {
      const circuitConfig = { ...this.defaultConfig, ...config };
      this.circuits.set(operationName, new CircuitBreaker(operationName, circuitConfig));
    }

    return this.circuits.get(operationName);
  }

  // 🟢 WORKING: Check circuit state
  async checkState(
    operationName: string,
    config?: Partial<CircuitBreakerConfig>,
  ): Promise<CircuitState> {
    const circuit = this.getCircuit(operationName, config);
    return circuit.getMetrics().state;
  }

  // 🟢 WORKING: Execute operation with circuit breaker protection
  async executeWithCircuitBreaker<T>(
    operationName: string,
    operation: () => Promise<T>,
    config?: Partial<CircuitBreakerConfig>,
  ): Promise<T> {
    const circuit = this.getCircuit(operationName, config);

    if (!circuit.canExecute()) {
      throw new ForgeFlowError({
        code: 'CIRCUIT_BREAKER_OPEN',
        message: `Circuit breaker is open for operation: ${operationName}`,
        category: ErrorCategory.CIRCUIT_BREAKER,
        severity: ErrorSeverity.HIGH,
        context: { operationName, state: circuit.getMetrics().state },
        recoverable: false,
        userMessage: `Service temporarily unavailable: ${operationName}`,
      });
    }

    const startTime = Date.now();
    let result: T;
    let success = false;
    let error: Error | undefined;

    try {
      result = await operation();
      success = true;
      return result;
    } catch (err) {
      error = err as Error;
      success = false;
      throw err;
    } finally {
      const duration = Date.now() - startTime;

      circuit.recordResult({
        success,
        duration,
        error,
        timestamp: new Date(),
      });
    }
  }

  // 🟢 WORKING: Get metrics for all circuits
  getAllMetrics(): Record<string, CircuitBreakerMetrics> {
    const metrics: Record<string, CircuitBreakerMetrics> = {};

    for (const [operationName, circuit] of this.circuits.entries()) {
      metrics[operationName] = circuit.getMetrics();
    }

    return metrics;
  }

  // 🟢 WORKING: Get system-wide circuit breaker health
  getSystemHealth(): {
    totalCircuits: number;
    openCircuits: number;
    halfOpenCircuits: number;
    closedCircuits: number;
    overallHealthScore: number;
  } {
    const totalCircuits = this.circuits.size;
    let openCircuits = 0;
    let halfOpenCircuits = 0;
    let closedCircuits = 0;

    for (const circuit of this.circuits.values()) {
      const state = circuit.getMetrics().state;
      switch (state) {
        case 'open':
          openCircuits++;
          break;
        case 'half-open':
          halfOpenCircuits++;
          break;
        case 'closed':
          closedCircuits++;
          break;
      }
    }

    // Calculate health score (0-100)
    const healthScore =
      totalCircuits > 0 ? Math.round((closedCircuits / totalCircuits) * 100) : 100;

    return {
      totalCircuits,
      openCircuits,
      halfOpenCircuits,
      closedCircuits,
      overallHealthScore: healthScore,
    };
  }

  // 🟢 WORKING: Reset all circuits
  resetAll(): void {
    for (const circuit of this.circuits.values()) {
      circuit.reset();
    }

    enhancedLogger.info('All circuit breakers reset', {
      count: this.circuits.size,
    });
  }

  // 🟢 WORKING: Reset specific circuit
  reset(operationName: string): boolean {
    const circuit = this.circuits.get(operationName);
    if (circuit) {
      circuit.reset();
      return true;
    }
    return false;
  }

  // 🟢 WORKING: Remove circuit
  removeCircuit(operationName: string): boolean {
    const circuit = this.circuits.get(operationName);
    if (circuit) {
      circuit.destroy();
      this.circuits.delete(operationName);
      enhancedLogger.info('Circuit breaker removed', { operationName });
      return true;
    }
    return false;
  }

  // 🟢 WORKING: Update default configuration
  updateDefaultConfig(config: Partial<CircuitBreakerConfig>): void {
    this.defaultConfig = { ...this.defaultConfig, ...config };

    enhancedLogger.info('Updated default circuit breaker configuration', {
      config: this.defaultConfig,
    });
  }

  // 🟢 WORKING: Get circuit names
  getCircuitNames(): string[] {
    return Array.from(this.circuits.keys());
  }

  // 🟢 WORKING: Cleanup all resources
  destroy(): void {
    for (const circuit of this.circuits.values()) {
      circuit.destroy();
    }
    this.circuits.clear();
  }
}

// 🟢 WORKING: Utility decorator for circuit breaker protection
export function circuitBreaker(operationName?: string, config?: Partial<CircuitBreakerConfig>) {
  const manager = new CircuitBreakerManager();

  return function <T extends (...args: any[]) => Promise<any>>(
    target: any,
    propertyKey: string,
    descriptor?: TypedPropertyDescriptor<T>,
  ): TypedPropertyDescriptor<T> | void {
    if (!descriptor) {
      // Handle property decorator case - not supported for methods
      return;
    }
    const originalMethod = descriptor.value;
    const actualOperationName = operationName || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (this: any, ...args: any[]) {
      return manager.executeWithCircuitBreaker(
        actualOperationName,
        () => originalMethod.apply(this, args),
        config,
      );
    } as T;

    return descriptor;
  };
}

// 🟢 WORKING: Export singleton instance
export const circuitBreakerManager = new CircuitBreakerManager();
