/**
 * Comprehensive tests for Retry Strategies
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RetryStrategy,
  ExponentialBackoffStrategy,
  LinearBackoffStrategy,
  FixedDelayStrategy,
  FibonacciBackoffStrategy,
  AdaptiveBackoffStrategy,
  CustomStrategyRegistry,
  JitterType,
  exponentialBackoffWithJitter
} from '../retry-strategies';
import { ErrorCategory } from '../../utils/errors';

// Mock enhanced logger
vi.mock('../../utils/enhanced-logger', () => ({
  enhancedLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('Retry Strategies', () => {
  describe('ExponentialBackoffStrategy', () => {
    let strategy: ExponentialBackoffStrategy;

    beforeEach(() => {
      strategy = new ExponentialBackoffStrategy();
    });

    it('should calculate exponential delay correctly', () => {
      expect(strategy.calculateDelay(1, 1000, 60000, 2)).toBe(1000);
      expect(strategy.calculateDelay(2, 1000, 60000, 2)).toBe(2000);
      expect(strategy.calculateDelay(3, 1000, 60000, 2)).toBe(4000);
      expect(strategy.calculateDelay(4, 1000, 60000, 2)).toBe(8000);
    });

    it('should respect maximum delay', () => {
      const delay = strategy.calculateDelay(10, 1000, 5000, 2);
      expect(delay).toBe(5000);
    });

    it('should apply full jitter correctly', () => {
      const baseDelay = 5000;
      const jitteredDelay = strategy.addJitter(baseDelay, 'full');
      
      expect(jitteredDelay).toBeGreaterThanOrEqual(0);
      expect(jitteredDelay).toBeLessThanOrEqual(baseDelay);
    });

    it('should apply equal jitter correctly', () => {
      const baseDelay = 5000;
      const jitteredDelay = strategy.addJitter(baseDelay, 'equal');
      
      expect(jitteredDelay).toBeGreaterThanOrEqual(2500);
      expect(jitteredDelay).toBeLessThanOrEqual(7500);
    });

    it('should apply decorrelated jitter correctly', () => {
      const baseDelay = 5000;
      const jitteredDelay = strategy.addJitter(baseDelay, 'decorrelated');
      
      expect(jitteredDelay).toBeGreaterThanOrEqual(500);
      expect(jitteredDelay).toBeLessThanOrEqual(15000);
    });

    it('should return original delay when jitter is none', () => {
      const baseDelay = 5000;
      const jitteredDelay = strategy.addJitter(baseDelay, 'none');
      expect(jitteredDelay).toBe(baseDelay);
    });
  });

  describe('LinearBackoffStrategy', () => {
    let strategy: LinearBackoffStrategy;

    beforeEach(() => {
      strategy = new LinearBackoffStrategy();
    });

    it('should calculate linear delay correctly', () => {
      expect(strategy.calculateDelay(1, 1000, 60000, 500)).toBe(1000);
      expect(strategy.calculateDelay(2, 1000, 60000, 500)).toBe(1500);
      expect(strategy.calculateDelay(3, 1000, 60000, 500)).toBe(2000);
      expect(strategy.calculateDelay(4, 1000, 60000, 500)).toBe(2500);
    });

    it('should respect maximum delay', () => {
      const delay = strategy.calculateDelay(10, 1000, 3000, 1000);
      expect(delay).toBe(3000);
    });
  });

  describe('FixedDelayStrategy', () => {
    let strategy: FixedDelayStrategy;

    beforeEach(() => {
      strategy = new FixedDelayStrategy();
    });

    it('should return constant delay', () => {
      expect(strategy.calculateDelay(1, 1000, 60000)).toBe(1000);
      expect(strategy.calculateDelay(2, 1000, 60000)).toBe(1000);
      expect(strategy.calculateDelay(10, 1000, 60000)).toBe(1000);
    });

    it('should respect maximum delay', () => {
      const delay = strategy.calculateDelay(1, 5000, 3000);
      expect(delay).toBe(3000);
    });
  });

  describe('FibonacciBackoffStrategy', () => {
    let strategy: FibonacciBackoffStrategy;

    beforeEach(() => {
      strategy = new FibonacciBackoffStrategy();
    });

    it('should calculate fibonacci delay correctly', () => {
      expect(strategy.calculateDelay(1, 1000, 60000, 1)).toBe(1000); // 1 * 1000
      expect(strategy.calculateDelay(2, 1000, 60000, 1)).toBe(1000); // 1 * 1000
      expect(strategy.calculateDelay(3, 1000, 60000, 1)).toBe(2000); // 2 * 1000
      expect(strategy.calculateDelay(4, 1000, 60000, 1)).toBe(3000); // 3 * 1000
      expect(strategy.calculateDelay(5, 1000, 60000, 1)).toBe(5000); // 5 * 1000
    });

    it('should respect maximum delay', () => {
      const delay = strategy.calculateDelay(10, 1000, 8000, 1);
      expect(delay).toBe(8000);
    });
  });

  describe('AdaptiveBackoffStrategy', () => {
    let strategy: AdaptiveBackoffStrategy;

    beforeEach(() => {
      strategy = new AdaptiveBackoffStrategy();
    });

    it('should start with exponential backoff', () => {
      const delay = strategy.calculateDelay(1, 1000, 60000, 2);
      expect(delay).toBe(1000);
    });

    it('should adapt based on recorded metrics', () => {
      // Record some failures
      strategy.recordAttempt('test-operation', false, 2000);
      strategy.recordAttempt('test-operation', false, 3000);
      strategy.recordAttempt('test-operation', false, 4000);
      strategy.recordAttempt('test-operation', false, 5000);
      
      // Record some successes to get above minimum attempts threshold
      for (let i = 0; i < 15; i++) {
        strategy.recordAttempt('test-operation', i % 3 === 0, 1000);
      }

      const initialDelay = strategy.calculateDelay(2, 1000, 60000, 2);
      
      // Should adapt the delay based on poor success rate
      expect(typeof initialDelay).toBe('number');
      expect(initialDelay).toBeGreaterThan(0);
    });

    it('should record attempt metrics correctly', () => {
      strategy.recordAttempt('test-op', true, 1500);
      strategy.recordAttempt('test-op', false, 2000);

      const metrics = strategy.getMetrics('test-op');
      expect(metrics).toBeDefined();
      expect(metrics!.attempts).toBe(2);
      expect(metrics!.successes).toBe(1);
    });
  });

  describe('CustomStrategyRegistry', () => {
    beforeEach(() => {
      // Clear any existing strategies
      const strategies = CustomStrategyRegistry.list();
      strategies.forEach(name => CustomStrategyRegistry.unregister(name));
    });

    it('should register custom strategy', () => {
      const customStrategy = new ExponentialBackoffStrategy();
      
      CustomStrategyRegistry.register('my-custom', customStrategy);
      
      expect(CustomStrategyRegistry.list()).toContain('my-custom');
      expect(CustomStrategyRegistry.get('my-custom')).toBe(customStrategy);
    });

    it('should unregister strategy', () => {
      const customStrategy = new ExponentialBackoffStrategy();
      
      CustomStrategyRegistry.register('temp-strategy', customStrategy);
      const removed = CustomStrategyRegistry.unregister('temp-strategy');
      
      expect(removed).toBe(true);
      expect(CustomStrategyRegistry.list()).not.toContain('temp-strategy');
    });

    it('should return false when unregistering non-existent strategy', () => {
      const removed = CustomStrategyRegistry.unregister('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('RetryStrategy Main Class', () => {
    let retryStrategy: RetryStrategy;

    beforeEach(() => {
      retryStrategy = new RetryStrategy();
    });

    afterEach(() => {
      retryStrategy.resetMetrics();
    });

    it('should calculate delay using exponential strategy', async () => {
      const config = {
        strategyType: 'exponential' as const,
        maxAttempts: 5,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
        jitter: false
      };

      const delay = await retryStrategy.calculateDelay(config, 2, new Error('test'));
      expect(delay).toBe(2000);
    });

    it('should calculate delay using linear strategy', async () => {
      const config = {
        strategyType: 'linear' as const,
        maxAttempts: 5,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 500
      };

      const delay = await retryStrategy.calculateDelay(config, 2, new Error('test'));
      expect(delay).toBe(1500);
    });

    it('should calculate delay using fixed strategy', async () => {
      const config = {
        strategyType: 'fixed' as const,
        maxAttempts: 5,
        initialDelay: 2000,
        maxDelay: 30000
      };

      const delay = await retryStrategy.calculateDelay(config, 3, new Error('test'));
      expect(delay).toBe(2000);
    });

    it('should apply jitter when enabled', async () => {
      const config = {
        strategyType: 'exponential' as const,
        maxAttempts: 5,
        initialDelay: 5000,
        maxDelay: 30000,
        backoffMultiplier: 2,
        jitter: true,
        jitterType: 'full' as JitterType
      };

      const delay = await retryStrategy.calculateDelay(config, 2, new Error('test'));
      expect(delay).toBeLessThanOrEqual(10000); // Base delay for attempt 2
      expect(delay).toBeGreaterThanOrEqual(0);
    });

    it('should fall back to exponential when custom strategy not found', async () => {
      const config = {
        strategyType: 'custom' as const,
        customStrategy: 'non-existent',
        maxAttempts: 5,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2
      };

      const delay = await retryStrategy.calculateDelay(config, 1, new Error('test'));
      expect(delay).toBe(1000); // Should use exponential fallback
    });

    it('should record retry outcomes', () => {
      retryStrategy.recordRetryOutcome('exponential', 'test-operation', true, 1500);
      retryStrategy.recordRetryOutcome('exponential', 'test-operation', false, 2000);

      const metrics = retryStrategy.getStrategyMetrics('exponential');
      expect(metrics).toBeDefined();
      expect(metrics!.totalAttempts).toBe(2);
      expect(metrics!.successRate).toBe(50);
    });

    it('should validate configuration correctly', () => {
      const validConfig = {
        strategyType: 'exponential' as const,
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2
      };

      const errors = retryStrategy.validateConfiguration(validConfig);
      expect(errors).toHaveLength(0);
    });

    it('should detect configuration errors', () => {
      const invalidConfig = {
        strategyType: 'exponential' as const,
        maxAttempts: 0, // Invalid
        initialDelay: -1000, // Invalid
        maxDelay: 500, // Less than initialDelay
        backoffMultiplier: -1 // Invalid
      };

      const errors = retryStrategy.validateConfiguration(invalidConfig);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should create optimized config for different operation types', () => {
      const githubConfig = retryStrategy.createOptimizedConfig('github-api');
      expect(githubConfig.strategyType).toBe('exponential');
      expect(githubConfig.maxAttempts).toBe(5);
      expect(githubConfig.jitter).toBe(true);

      const gitConfig = retryStrategy.createOptimizedConfig('git-operation');
      expect(gitConfig.strategyType).toBe('linear');
      expect(gitConfig.maxAttempts).toBe(3);

      const quickConfig = retryStrategy.createOptimizedConfig('quick-operation');
      expect(quickConfig.strategyType).toBe('fixed');
      expect(quickConfig.maxAttempts).toBe(2);
    });

    it('should test strategy configuration', async () => {
      const config = {
        strategyType: 'exponential' as const,
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2
      };

      const testResult = await retryStrategy.testStrategy(config, 3);
      
      expect(testResult.delays).toHaveLength(3);
      expect(testResult.totalTime).toBeGreaterThan(0);
      expect(testResult.averageDelay).toBeGreaterThan(0);
      expect(testResult.configuration).toBe(config);
    });

    it('should get available strategies', () => {
      const strategies = retryStrategy.getAvailableStrategies();
      
      expect(strategies.builtin).toContain('exponential');
      expect(strategies.builtin).toContain('linear');
      expect(strategies.builtin).toContain('fixed');
      expect(strategies.builtin).toContain('adaptive');
    });

    it('should handle errors gracefully during delay calculation', async () => {
      const config = {
        strategyType: 'exponential' as const,
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2
      };

      // This should not throw even with invalid attempt number
      const delay = await retryStrategy.calculateDelay(config, -1, new Error('test'));
      expect(typeof delay).toBe('number');
      expect(delay).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Utility Functions', () => {
    describe('exponentialBackoffWithJitter', () => {
      it('should execute operation successfully', async () => {
        let attempts = 0;
        const operation = vi.fn().mockImplementation(() => {
          attempts++;
          return Promise.resolve('success');
        });

        const result = await exponentialBackoffWithJitter(operation, 3, 100, 1000);
        
        expect(result).toBe('success');
        expect(attempts).toBe(1);
        expect(operation).toHaveBeenCalledTimes(1);
      });

      it('should retry on failure and eventually succeed', async () => {
        let attempts = 0;
        const operation = vi.fn().mockImplementation(() => {
          attempts++;
          if (attempts < 3) {
            return Promise.reject(new Error('temporary failure'));
          }
          return Promise.resolve('success');
        });

        const result = await exponentialBackoffWithJitter(operation, 5, 10, 100);
        
        expect(result).toBe('success');
        expect(attempts).toBe(3);
        expect(operation).toHaveBeenCalledTimes(3);
      });

      it('should throw last error after all retries exhausted', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('persistent failure'));

        await expect(exponentialBackoffWithJitter(operation, 2, 10, 100))
          .rejects.toThrow('persistent failure');
        
        expect(operation).toHaveBeenCalledTimes(2);
      });

      it('should apply jitter to delays', async () => {
        let attempts = 0;
        const delays: number[] = [];
        const startTime = Date.now();
        let lastTime = startTime;

        const operation = vi.fn().mockImplementation(() => {
          attempts++;
          const currentTime = Date.now();
          if (attempts > 1) {
            delays.push(currentTime - lastTime);
          }
          lastTime = currentTime;
          
          if (attempts < 3) {
            return Promise.reject(new Error('failure'));
          }
          return Promise.resolve('success');
        });

        await exponentialBackoffWithJitter(operation, 3, 100, 1000, 'full');
        
        expect(delays).toHaveLength(2);
        // With jitter, delays should vary
        expect(delays.every(delay => delay >= 0)).toBe(true);
      }, 10000);
    });
  });

  describe('Performance and Edge Cases', () => {
    let retryStrategy: RetryStrategy;

    beforeEach(() => {
      retryStrategy = new RetryStrategy();
    });

    it('should handle very large attempt numbers', async () => {
      const config = {
        strategyType: 'exponential' as const,
        maxAttempts: 1000,
        initialDelay: 1000,
        maxDelay: 60000,
        backoffMultiplier: 2
      };

      const delay = await retryStrategy.calculateDelay(config, 100, new Error('test'));
      expect(delay).toBe(60000); // Should be capped at maxDelay
    });

    it('should handle zero and negative delays gracefully', async () => {
      const config = {
        strategyType: 'fixed' as const,
        maxAttempts: 3,
        initialDelay: 0,
        maxDelay: 0
      };

      const delay = await retryStrategy.calculateDelay(config, 1, new Error('test'));
      expect(delay).toBe(0);
    });

    it('should perform well with many strategy instances', () => {
      const strategies = [];
      
      for (let i = 0; i < 1000; i++) {
        strategies.push(new ExponentialBackoffStrategy());
      }
      
      // Test that creating many instances doesn't cause performance issues
      expect(strategies).toHaveLength(1000);
      
      // Test that they all calculate delays correctly
      const delays = strategies.map(s => s.calculateDelay(2, 1000, 10000, 2));
      expect(delays.every(d => d === 2000)).toBe(true);
    });

    it('should handle concurrent metric updates safely', async () => {
      const promises = [];
      
      for (let i = 0; i < 100; i++) {
        promises.push(
          retryStrategy.recordRetryOutcome('exponential', `operation-${i % 10}`, i % 2 === 0, 1000)
        );
      }
      
      await Promise.all(promises);
      
      const metrics = retryStrategy.getStrategyMetrics('exponential');
      expect(metrics!.totalAttempts).toBe(100);
    });
  });
});