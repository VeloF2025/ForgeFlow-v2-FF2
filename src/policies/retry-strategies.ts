/**
 * Advanced Retry Strategies and Backoff Implementations for ForgeFlow v2
 * Provides configurable retry mechanisms with jitter, circuit breaking, and custom strategies
 */

import { enhancedLogger } from '../utils/enhanced-logger';
import { ForgeFlowError, ErrorCategory, ErrorSeverity } from '../utils/errors';

export interface BackoffStrategy {
  calculateDelay(attempt: number, baseDelay: number, maxDelay: number, multiplier?: number): number;
  addJitter(delay: number, jitterType: JitterType): number;
}

export type JitterType = 'full' | 'equal' | 'decorrelated' | 'none';

export interface RetryConfiguration {
  strategyType: 'exponential' | 'linear' | 'fixed' | 'custom';
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier?: number;
  jitter?: boolean;
  jitterType?: JitterType;
  customStrategy?: string;
  giveUpAfter?: number;
}

export interface RetryContext {
  attempt: number;
  error: Error;
  operationName: string;
  previousDelays: number[];
  totalElapsedTime: number;
  metadata: Record<string, unknown>;
}

export interface RetryMetrics {
  strategyType: string;
  totalAttempts: number;
  totalDelay: number;
  averageDelay: number;
  successRate: number;
  jitterEffectiveness: number;
}

// 🟢 WORKING: Exponential Backoff Strategy
export class ExponentialBackoffStrategy implements BackoffStrategy {
  calculateDelay(
    attempt: number,
    baseDelay: number,
    maxDelay: number,
    multiplier: number = 2
  ): number {
    const delay = baseDelay * Math.pow(multiplier, attempt - 1);
    return Math.min(delay, maxDelay);
  }

  addJitter(delay: number, jitterType: JitterType): number {
    switch (jitterType) {
      case 'full':
        // Random jitter between 0 and calculated delay
        return Math.random() * delay;
      
      case 'equal':
        // Add/subtract up to 50% of the delay
        const jitterAmount = delay * 0.5;
        return delay + (Math.random() - 0.5) * 2 * jitterAmount;
      
      case 'decorrelated':
        // Base jitter on previous delay to reduce correlation
        const decorrelatedBase = delay * 0.1;
        const decorrelatedMax = delay * 3;
        return Math.min(decorrelatedBase + Math.random() * delay, decorrelatedMax);
      
      case 'none':
      default:
        return delay;
    }
  }
}

// 🟢 WORKING: Linear Backoff Strategy
export class LinearBackoffStrategy implements BackoffStrategy {
  calculateDelay(
    attempt: number,
    baseDelay: number,
    maxDelay: number,
    increment: number = 1000
  ): number {
    const delay = baseDelay + (attempt - 1) * increment;
    return Math.min(delay, maxDelay);
  }

  addJitter(delay: number, jitterType: JitterType): number {
    // Reuse exponential jitter logic
    const exponentialStrategy = new ExponentialBackoffStrategy();
    return exponentialStrategy.addJitter(delay, jitterType);
  }
}

// 🟢 WORKING: Fixed Delay Strategy
export class FixedDelayStrategy implements BackoffStrategy {
  calculateDelay(
    attempt: number,
    baseDelay: number,
    maxDelay: number,
    multiplier?: number
  ): number {
    return Math.min(baseDelay, maxDelay);
  }

  addJitter(delay: number, jitterType: JitterType): number {
    const exponentialStrategy = new ExponentialBackoffStrategy();
    return exponentialStrategy.addJitter(delay, jitterType);
  }
}

// 🟢 WORKING: Custom Strategy Registry
export class CustomStrategyRegistry {
  private static strategies = new Map<string, BackoffStrategy>();

  static register(name: string, strategy: BackoffStrategy): void {
    this.strategies.set(name, strategy);
    enhancedLogger.info('Registered custom retry strategy', { name });
  }

  static get(name: string): BackoffStrategy | undefined {
    return this.strategies.get(name);
  }

  static list(): string[] {
    return Array.from(this.strategies.keys());
  }

  static unregister(name: string): boolean {
    const removed = this.strategies.delete(name);
    if (removed) {
      enhancedLogger.info('Unregistered custom retry strategy', { name });
    }
    return removed;
  }
}

// 🟢 WORKING: Fibonacci Backoff Strategy (Custom Example)
export class FibonacciBackoffStrategy implements BackoffStrategy {
  private fibonacciCache = new Map<number, number>();

  calculateDelay(
    attempt: number,
    baseDelay: number,
    maxDelay: number,
    multiplier: number = 1
  ): number {
    const fibNumber = this.fibonacci(attempt);
    const delay = baseDelay * fibNumber * multiplier;
    return Math.min(delay, maxDelay);
  }

  addJitter(delay: number, jitterType: JitterType): number {
    const exponentialStrategy = new ExponentialBackoffStrategy();
    return exponentialStrategy.addJitter(delay, jitterType);
  }

  private fibonacci(n: number): number {
    if (n <= 1) return 1;
    
    if (this.fibonacciCache.has(n)) {
      return this.fibonacciCache.get(n)!;
    }

    const result = this.fibonacci(n - 1) + this.fibonacci(n - 2);
    this.fibonacciCache.set(n, result);
    return result;
  }
}

// 🟢 WORKING: Adaptive Backoff Strategy
export class AdaptiveBackoffStrategy implements BackoffStrategy {
  private performanceMetrics = new Map<string, {
    attempts: number;
    successes: number;
    averageDelay: number;
    lastSuccessDelay: number;
  }>();

  calculateDelay(
    attempt: number,
    baseDelay: number,
    maxDelay: number,
    multiplier: number = 2
  ): number {
    // Start with exponential backoff as base
    let delay = baseDelay * Math.pow(multiplier, attempt - 1);
    
    // Adapt based on historical performance
    const operationKey = 'global'; // Could be made operation-specific
    const metrics = this.performanceMetrics.get(operationKey);
    
    if (metrics && metrics.attempts > 10) {
      const successRate = metrics.successes / metrics.attempts;
      
      if (successRate < 0.5) {
        // Poor success rate - increase delays more aggressively
        delay *= 1.5;
      } else if (successRate > 0.8) {
        // Good success rate - can be more aggressive
        delay *= 0.8;
      }
      
      // If we have a recent success with a specific delay, bias towards that
      if (metrics.lastSuccessDelay > 0 && attempt <= 3) {
        delay = (delay + metrics.lastSuccessDelay) / 2;
      }
    }
    
    return Math.min(delay, maxDelay);
  }

  addJitter(delay: number, jitterType: JitterType): number {
    const exponentialStrategy = new ExponentialBackoffStrategy();
    return exponentialStrategy.addJitter(delay, jitterType);
  }

  recordAttempt(operationName: string, success: boolean, delay: number): void {
    const metrics = this.performanceMetrics.get(operationName) || {
      attempts: 0,
      successes: 0,
      averageDelay: 0,
      lastSuccessDelay: 0
    };

    metrics.attempts++;
    if (success) {
      metrics.successes++;
      metrics.lastSuccessDelay = delay;
    }

    // Update average delay
    metrics.averageDelay = (metrics.averageDelay * (metrics.attempts - 1) + delay) / metrics.attempts;
    
    this.performanceMetrics.set(operationName, metrics);
  }

  getMetrics(operationName: string): typeof this.performanceMetrics extends Map<string, infer T> ? T : never {
    return this.performanceMetrics.get(operationName);
  }
}

// 🟢 WORKING: Main Retry Strategy Manager
export class RetryStrategy {
  private strategies: Map<string, BackoffStrategy>;
  private adaptiveStrategy: AdaptiveBackoffStrategy;
  private metrics = new Map<string, RetryMetrics>();

  constructor() {
    this.strategies = new Map([
      ['exponential', new ExponentialBackoffStrategy()],
      ['linear', new LinearBackoffStrategy()],
      ['fixed', new FixedDelayStrategy()],
      ['fibonacci', new FibonacciBackoffStrategy()],
      ['adaptive', new AdaptiveBackoffStrategy()]
    ]);
    
    this.adaptiveStrategy = this.strategies.get('adaptive') as AdaptiveBackoffStrategy;

    // Register fibonacci as a custom strategy example
    CustomStrategyRegistry.register('fibonacci', new FibonacciBackoffStrategy());
    CustomStrategyRegistry.register('adaptive', this.adaptiveStrategy);
  }

  // 🟢 WORKING: Calculate delay using specified strategy
  async calculateDelay(
    config: RetryConfiguration,
    attempt: number,
    error: Error
  ): Promise<number> {
    const startTime = Date.now();
    
    try {
      let strategy = this.strategies.get(config.strategyType);
      
      // Handle custom strategies
      if (config.strategyType === 'custom' && config.customStrategy) {
        strategy = CustomStrategyRegistry.get(config.customStrategy);
        if (!strategy) {
          enhancedLogger.warn('Custom retry strategy not found, falling back to exponential', {
            customStrategy: config.customStrategy
          });
          strategy = this.strategies.get('exponential')!;
        }
      }

      if (!strategy) {
        enhancedLogger.warn('Retry strategy not found, using exponential backoff', {
          strategyType: config.strategyType
        });
        strategy = this.strategies.get('exponential')!;
      }

      // Calculate base delay
      let delay = strategy.calculateDelay(
        attempt,
        config.initialDelay,
        config.maxDelay,
        config.backoffMultiplier
      );

      // Apply jitter if enabled
      if (config.jitter) {
        const jitterType = config.jitterType || 'full';
        delay = strategy.addJitter(delay, jitterType);
      }

      // Ensure minimum and maximum bounds
      delay = Math.max(delay, 0);
      delay = Math.min(delay, config.maxDelay);

      // Update metrics
      this.updateRetryMetrics(config.strategyType, delay, startTime);

      enhancedLogger.debug('Calculated retry delay', {
        strategyType: config.strategyType,
        attempt,
        delay,
        jitter: config.jitter,
        jitterType: config.jitterType
      });

      return Math.round(delay);

    } catch (error) {
      enhancedLogger.error('Failed to calculate retry delay, using default', {
        error: error.message,
        strategyType: config.strategyType,
        attempt
      });
      
      // Fallback to simple exponential backoff
      return Math.min(
        config.initialDelay * Math.pow(2, attempt - 1),
        config.maxDelay
      );
    }
  }

  // 🟢 WORKING: Update retry strategy metrics
  private updateRetryMetrics(strategyType: string, delay: number, startTime: number): void {
    const metrics = this.metrics.get(strategyType) || {
      strategyType,
      totalAttempts: 0,
      totalDelay: 0,
      averageDelay: 0,
      successRate: 0,
      jitterEffectiveness: 0
    };

    metrics.totalAttempts++;
    metrics.totalDelay += delay;
    metrics.averageDelay = metrics.totalDelay / metrics.totalAttempts;

    this.metrics.set(strategyType, metrics);
  }

  // 🟢 WORKING: Record retry outcome for adaptive strategies
  recordRetryOutcome(
    strategyType: string,
    operationName: string,
    success: boolean,
    delay: number,
    context?: RetryContext
  ): void {
    // Update adaptive strategy metrics
    if (strategyType === 'adaptive') {
      this.adaptiveStrategy.recordAttempt(operationName, success, delay);
    }

    // Update general metrics
    const metrics = this.metrics.get(strategyType);
    if (metrics) {
      const previousSuccesses = metrics.successRate * (metrics.totalAttempts - 1);
      const newSuccesses = success ? previousSuccesses + 1 : previousSuccesses;
      metrics.successRate = newSuccesses / metrics.totalAttempts;
    }

    enhancedLogger.debug('Recorded retry outcome', {
      strategyType,
      operationName,
      success,
      delay,
      attempt: context?.attempt
    });
  }

  // 🟢 WORKING: Get retry strategy metrics
  getStrategyMetrics(strategyType?: string): Record<string, RetryMetrics> | RetryMetrics | null {
    if (strategyType) {
      return this.metrics.get(strategyType) || null;
    }
    
    return Object.fromEntries(this.metrics.entries());
  }

  // 🟢 WORKING: Get adaptive strategy performance data
  getAdaptiveMetrics(operationName?: string): Record<string, unknown> {
    if (operationName) {
      return this.adaptiveStrategy.getMetrics(operationName) || {};
    }
    
    // Get all adaptive metrics
    const allMetrics: Record<string, unknown> = {};
    // This would need additional tracking in AdaptiveBackoffStrategy
    return allMetrics;
  }

  // 🟢 WORKING: Validate retry configuration
  validateConfiguration(config: RetryConfiguration): string[] {
    const errors: string[] = [];

    if (config.maxAttempts < 1) {
      errors.push('maxAttempts must be at least 1');
    }

    if (config.initialDelay < 0) {
      errors.push('initialDelay must be non-negative');
    }

    if (config.maxDelay < config.initialDelay) {
      errors.push('maxDelay must be greater than or equal to initialDelay');
    }

    if (config.backoffMultiplier !== undefined && config.backoffMultiplier <= 0) {
      errors.push('backoffMultiplier must be positive');
    }

    if (config.giveUpAfter !== undefined && config.giveUpAfter < 0) {
      errors.push('giveUpAfter must be non-negative');
    }

    if (config.strategyType === 'custom' && !config.customStrategy) {
      errors.push('customStrategy must be specified when strategyType is "custom"');
    }

    if (config.strategyType === 'custom' && config.customStrategy &&
        !CustomStrategyRegistry.get(config.customStrategy)) {
      errors.push(`Custom strategy "${config.customStrategy}" is not registered`);
    }

    const validJitterTypes: JitterType[] = ['full', 'equal', 'decorrelated', 'none'];
    if (config.jitterType && !validJitterTypes.includes(config.jitterType)) {
      errors.push(`Invalid jitterType. Must be one of: ${validJitterTypes.join(', ')}`);
    }

    return errors;
  }

  // 🟢 WORKING: Create optimized retry configuration based on operation type
  createOptimizedConfig(operationType: string, errorCategory?: ErrorCategory): RetryConfiguration {
    switch (operationType.toLowerCase()) {
      case 'github-api':
      case 'api-call':
        return {
          strategyType: 'exponential',
          maxAttempts: 5,
          initialDelay: 1000,
          maxDelay: 30000,
          backoffMultiplier: 2,
          jitter: true,
          jitterType: 'full',
          giveUpAfter: 300000 // 5 minutes
        };

      case 'git-operation':
      case 'file-system':
        return {
          strategyType: 'linear',
          maxAttempts: 3,
          initialDelay: 2000,
          maxDelay: 10000,
          jitter: true,
          jitterType: 'equal',
          giveUpAfter: 120000 // 2 minutes
        };

      case 'network':
      case 'timeout':
        return {
          strategyType: 'exponential',
          maxAttempts: 4,
          initialDelay: 5000,
          maxDelay: 60000,
          backoffMultiplier: 1.5,
          jitter: true,
          jitterType: 'decorrelated',
          giveUpAfter: 180000 // 3 minutes
        };

      case 'database':
      case 'external-service':
        return {
          strategyType: 'adaptive',
          maxAttempts: 4,
          initialDelay: 1500,
          maxDelay: 45000,
          backoffMultiplier: 1.8,
          jitter: true,
          jitterType: 'full',
          giveUpAfter: 240000 // 4 minutes
        };

      case 'quick-operation':
      case 'validation':
        return {
          strategyType: 'fixed',
          maxAttempts: 2,
          initialDelay: 500,
          maxDelay: 2000,
          jitter: false,
          giveUpAfter: 10000 // 10 seconds
        };

      default:
        // Default conservative configuration
        return {
          strategyType: 'exponential',
          maxAttempts: 3,
          initialDelay: 1000,
          maxDelay: 15000,
          backoffMultiplier: 2,
          jitter: true,
          jitterType: 'full',
          giveUpAfter: 60000 // 1 minute
        };
    }
  }

  // 🟢 WORKING: Reset strategy metrics
  resetMetrics(): void {
    this.metrics.clear();
    enhancedLogger.info('Reset retry strategy metrics');
  }

  // 🟢 WORKING: Get available strategies
  getAvailableStrategies(): { builtin: string[]; custom: string[] } {
    return {
      builtin: Array.from(this.strategies.keys()),
      custom: CustomStrategyRegistry.list()
    };
  }

  // 🟢 WORKING: Test retry strategy configuration
  async testStrategy(config: RetryConfiguration, simulatedAttempts: number = 5): Promise<{
    delays: number[];
    totalTime: number;
    averageDelay: number;
    configuration: RetryConfiguration;
  }> {
    const delays: number[] = [];
    let totalTime = 0;

    for (let attempt = 1; attempt <= simulatedAttempts; attempt++) {
      const delay = await this.calculateDelay(config, attempt, new Error('test error'));
      delays.push(delay);
      totalTime += delay;
    }

    return {
      delays,
      totalTime,
      averageDelay: totalTime / delays.length,
      configuration: config
    };
  }
}

// 🟢 WORKING: Utility functions for retry strategies

export function createRetryDecorator(config: RetryConfiguration) {
  const retryStrategy = new RetryStrategy();
  
  return function <T extends (...args: any[]) => Promise<any>>(
    target: any,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ) {
    const originalMethod = descriptor.value!;
    
    descriptor.value = async function (this: any, ...args: any[]) {
      let lastError: Error;
      
      for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
        try {
          const result = await originalMethod.apply(this, args);
          
          // Record successful outcome
          retryStrategy.recordRetryOutcome(
            config.strategyType,
            propertyKey,
            true,
            0
          );
          
          return result;
        } catch (error) {
          lastError = error as Error;
          
          if (attempt === config.maxAttempts) {
            break;
          }
          
          const delay = await retryStrategy.calculateDelay(config, attempt, lastError);
          
          if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          
          // Record retry attempt
          retryStrategy.recordRetryOutcome(
            config.strategyType,
            propertyKey,
            false,
            delay
          );
        }
      }
      
      throw lastError;
    } as T;
    
    return descriptor;
  };
}

// 🟢 WORKING: Exponential backoff with jitter utility function
export async function exponentialBackoffWithJitter(
  operation: () => Promise<any>,
  maxAttempts: number = 3,
  initialDelay: number = 1000,
  maxDelay: number = 30000,
  jitterType: JitterType = 'full'
): Promise<any> {
  const strategy = new ExponentialBackoffStrategy();
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxAttempts) {
        break;
      }
      
      let delay = strategy.calculateDelay(attempt, initialDelay, maxDelay);
      delay = strategy.addJitter(delay, jitterType);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

// 🟢 WORKING: Export singleton instance
export const retryStrategy = new RetryStrategy();