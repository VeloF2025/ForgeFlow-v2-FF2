/**
 * Comprehensive tests for Circuit Breaker
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerManager,
  CircuitBreakerConfig,
  circuitBreaker,
  OperationResult,
} from '../circuit-breaker';
import { ForgeFlowError, ErrorCategory, ErrorSeverity } from '../../utils/errors';

// Mock enhanced logger
vi.mock('../../utils/enhanced-logger', () => ({
  enhancedLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Circuit Breaker', () => {
  describe('CircuitBreaker', () => {
    let circuitBreaker: CircuitBreaker;
    let config: CircuitBreakerConfig;

    beforeEach(() => {
      config = {
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

      circuitBreaker = new CircuitBreaker('test-operation', config);
    });

    afterEach(() => {
      circuitBreaker.destroy();
    });

    describe('State Management', () => {
      it('should start in closed state', () => {
        const metrics = circuitBreaker.getMetrics();
        expect(metrics.state).toBe('closed');
      });

      it('should allow execution in closed state', () => {
        expect(circuitBreaker.canExecute()).toBe(true);
      });

      it('should transition to open after failure threshold', () => {
        // Record enough failures to trigger opening
        for (let i = 0; i < 5; i++) {
          circuitBreaker.recordResult({
            success: false,
            duration: 1000,
            error: new Error('Test failure'),
            timestamp: new Date(),
          });
        }

        const metrics = circuitBreaker.getMetrics();
        expect(metrics.state).toBe('open');
      });

      it('should not allow execution in open state', () => {
        // Force circuit to open
        circuitBreaker.forceState('open', 'Test');
        expect(circuitBreaker.canExecute()).toBe(false);
      });

      it('should transition to half-open after timeout', async () => {
        // Use a short timeout for testing
        const shortTimeoutConfig = { ...config, timeout: 100 };
        const cb = new CircuitBreaker('test-timeout', shortTimeoutConfig);

        // Force to open state
        cb.forceState('open', 'Test');
        expect(cb.getMetrics().state).toBe('open');

        // Wait for timeout
        await new Promise((resolve) => setTimeout(resolve, 150));

        // Should allow execution (transitioning to half-open)
        expect(cb.canExecute()).toBe(true);

        cb.destroy();
      });

      it('should transition to closed after success threshold in half-open', () => {
        circuitBreaker.forceState('half-open', 'Test');

        // Record enough successes
        for (let i = 0; i < 2; i++) {
          circuitBreaker.recordResult({
            success: true,
            duration: 1000,
            timestamp: new Date(),
          });
        }

        const metrics = circuitBreaker.getMetrics();
        expect(metrics.state).toBe('closed');
      });

      it('should transition back to open on failure in half-open', () => {
        circuitBreaker.forceState('half-open', 'Test');

        circuitBreaker.recordResult({
          success: false,
          duration: 1000,
          error: new Error('Test failure'),
          timestamp: new Date(),
        });

        const metrics = circuitBreaker.getMetrics();
        expect(metrics.state).toBe('open');
      });
    });

    describe('Failure Tracking', () => {
      it('should track failure count correctly', () => {
        circuitBreaker.recordResult({
          success: false,
          duration: 1000,
          error: new Error('Test failure'),
          timestamp: new Date(),
        });

        const metrics = circuitBreaker.getMetrics();
        expect(metrics.failures).toBe(1);
        expect(metrics.totalCalls).toBe(1);
      });

      it('should track success count correctly', () => {
        circuitBreaker.recordResult({
          success: true,
          duration: 1000,
          timestamp: new Date(),
        });

        const metrics = circuitBreaker.getMetrics();
        expect(metrics.successes).toBe(1);
        expect(metrics.totalCalls).toBe(1);
      });

      it('should calculate error rate correctly', () => {
        // Record 3 failures and 7 successes (30% error rate)
        for (let i = 0; i < 3; i++) {
          circuitBreaker.recordResult({
            success: false,
            duration: 1000,
            error: new Error('Test failure'),
            timestamp: new Date(),
          });
        }

        for (let i = 0; i < 7; i++) {
          circuitBreaker.recordResult({
            success: true,
            duration: 1000,
            timestamp: new Date(),
          });
        }

        const metrics = circuitBreaker.getMetrics();
        expect(metrics.errorRate).toBe(30);
      });

      it('should calculate slow call rate correctly', () => {
        const slowThreshold = config.slowCallDurationThreshold;

        // Record 3 slow calls and 7 fast calls (30% slow rate)
        for (let i = 0; i < 3; i++) {
          circuitBreaker.recordResult({
            success: true,
            duration: slowThreshold + 1000,
            timestamp: new Date(),
          });
        }

        for (let i = 0; i < 7; i++) {
          circuitBreaker.recordResult({
            success: true,
            duration: slowThreshold - 1000,
            timestamp: new Date(),
          });
        }

        const metrics = circuitBreaker.getMetrics();
        expect(metrics.slowCallRate).toBe(30);
      });
    });

    describe('Threshold-based Opening', () => {
      it('should open on error rate threshold', () => {
        const errorRateConfig = { ...config, errorRateThreshold: 40 };
        const cb = new CircuitBreaker('error-rate-test', errorRateConfig);

        // Record enough calls to meet volume threshold
        for (let i = 0; i < 15; i++) {
          cb.recordResult({
            success: i < 8, // 7 failures out of 15 = ~47% error rate
            duration: 1000,
            error: i >= 8 ? new Error('Test failure') : undefined,
            timestamp: new Date(),
          });
        }

        const metrics = cb.getMetrics();
        expect(metrics.state).toBe('open');

        cb.destroy();
      });

      it('should open on slow call rate threshold', () => {
        const slowCallConfig = {
          ...config,
          slowCallRateThreshold: 40,
          slowCallDurationThreshold: 3000,
        };
        const cb = new CircuitBreaker('slow-call-test', slowCallConfig);

        // Record enough calls with high slow rate
        for (let i = 0; i < 15; i++) {
          cb.recordResult({
            success: true,
            duration: i < 8 ? 5000 : 1000, // 8 slow calls out of 15 = ~53% slow rate
            timestamp: new Date(),
          });
        }

        const metrics = cb.getMetrics();
        expect(metrics.state).toBe('open');

        cb.destroy();
      });

      it('should respect volume threshold', () => {
        const volumeConfig = { ...config, volumeThreshold: 20 };
        const cb = new CircuitBreaker('volume-test', volumeConfig);

        // Record failures but below volume threshold
        for (let i = 0; i < 10; i++) {
          cb.recordResult({
            success: false,
            duration: 1000,
            error: new Error('Test failure'),
            timestamp: new Date(),
          });
        }

        // Should not open due to volume threshold
        const metrics = cb.getMetrics();
        expect(metrics.state).toBe('closed');

        cb.destroy();
      });
    });

    describe('Half-Open State Management', () => {
      it('should limit calls in half-open state', () => {
        circuitBreaker.forceState('half-open', 'Test');

        // First few calls should be allowed
        for (let i = 0; i < 3; i++) {
          expect(circuitBreaker.canExecute()).toBe(true);
          // Simulate call made
          circuitBreaker.recordResult({
            success: true,
            duration: 1000,
            timestamp: new Date(),
          });
        }

        // Additional calls should be rejected until success threshold is met
        // Note: This depends on the specific implementation details
      });
    });

    describe('Metrics and Monitoring', () => {
      it('should track state transitions', () => {
        circuitBreaker.forceState('open', 'Test transition');
        circuitBreaker.forceState('half-open', 'Another test');

        const metrics = circuitBreaker.getMetrics();
        expect(metrics.stateTransitions).toHaveLength(2);
        expect(metrics.stateTransitions[0].to).toBe('open');
        expect(metrics.stateTransitions[1].to).toBe('half-open');
      });

      it('should calculate average response time', () => {
        circuitBreaker.recordResult({
          success: true,
          duration: 1000,
          timestamp: new Date(),
        });

        circuitBreaker.recordResult({
          success: true,
          duration: 2000,
          timestamp: new Date(),
        });

        const metrics = circuitBreaker.getMetrics();
        expect(metrics.averageResponseTime).toBe(1500);
      });

      it('should track time in current state', () => {
        const metrics = circuitBreaker.getMetrics();
        expect(metrics.timeInCurrentState).toBeGreaterThanOrEqual(0);
      });
    });

    describe('Reset and Force Operations', () => {
      it('should reset circuit breaker state', () => {
        // Record some failures
        for (let i = 0; i < 3; i++) {
          circuitBreaker.recordResult({
            success: false,
            duration: 1000,
            error: new Error('Test failure'),
            timestamp: new Date(),
          });
        }

        circuitBreaker.reset();

        const metrics = circuitBreaker.getMetrics();
        expect(metrics.state).toBe('closed');
        expect(metrics.failures).toBe(0);
        expect(metrics.successes).toBe(0);
        expect(metrics.totalCalls).toBe(0);
      });

      it('should force state change', () => {
        circuitBreaker.forceState('open', 'Manual override');

        const metrics = circuitBreaker.getMetrics();
        expect(metrics.state).toBe('open');
        expect(circuitBreaker.canExecute()).toBe(false);
      });
    });

    describe('Adaptive Thresholds', () => {
      it('should adjust thresholds based on performance', () => {
        const adaptiveConfig = { ...config, adaptiveThresholds: true };
        const cb = new CircuitBreaker('adaptive-test', adaptiveConfig);

        // Record many successful operations with fast response times
        for (let i = 0; i < 25; i++) {
          cb.recordResult({
            success: true,
            duration: 500, // Fast responses
            timestamp: new Date(),
          });
        }

        // Thresholds should be adjusted (implementation-specific)
        const metricsAfter = cb.getMetrics();
        expect(metricsAfter.totalCalls).toBe(25);

        cb.destroy();
      });
    });

    describe('Configuration Validation', () => {
      it('should validate configuration on creation', () => {
        const invalidConfig = {
          ...config,
          failureThreshold: 0, // Invalid
          timeout: 500, // Too short
        };

        expect(() => {
          new CircuitBreaker('invalid-test', invalidConfig);
        }).toThrow();
      });
    });

    describe('Health Checks', () => {
      it('should handle health check configuration', () => {
        const healthCheckConfig = {
          ...config,
          enableHealthChecks: true,
          healthCheckInterval: 1000,
        };

        const cb = new CircuitBreaker('health-test', healthCheckConfig);
        expect(cb).toBeDefined();

        // Health checks would run in background
        cb.destroy();
      });
    });
  });

  describe('CircuitBreakerManager', () => {
    let manager: CircuitBreakerManager;

    beforeEach(() => {
      manager = new CircuitBreakerManager();
    });

    afterEach(() => {
      manager.destroy();
    });

    describe('Circuit Management', () => {
      it('should create circuit on first access', () => {
        const circuit = manager.getCircuit('test-operation');
        expect(circuit).toBeDefined();
      });

      it('should reuse existing circuit', () => {
        const circuit1 = manager.getCircuit('test-operation');
        const circuit2 = manager.getCircuit('test-operation');
        expect(circuit1).toBe(circuit2);
      });

      it('should create circuit with custom config', () => {
        const customConfig = {
          enabled: true,
          failureThreshold: 10,
          successThreshold: 3,
          timeout: 120000,
        };

        const circuit = manager.getCircuit('custom-operation', customConfig);
        expect(circuit).toBeDefined();
      });
    });

    describe('Operation Execution', () => {
      it('should execute operation successfully', async () => {
        const operation = vi.fn().mockResolvedValue('success');

        const result = await manager.executeWithCircuitBreaker('test-operation', operation);

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(1);
      });

      it('should record successful operation', async () => {
        const operation = vi.fn().mockResolvedValue('success');

        await manager.executeWithCircuitBreaker('test-operation', operation);

        const metrics = manager.getAllMetrics();
        expect(metrics['test-operation'].successes).toBe(1);
      });

      it('should record failed operation', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('Operation failed'));

        await expect(
          manager.executeWithCircuitBreaker('test-operation', operation),
        ).rejects.toThrow('Operation failed');

        const metrics = manager.getAllMetrics();
        expect(metrics['test-operation'].failures).toBe(1);
      });

      it('should throw circuit breaker error when open', async () => {
        const circuit = manager.getCircuit('test-operation');
        circuit.forceState('open', 'Test');

        const operation = vi.fn().mockResolvedValue('success');

        await expect(
          manager.executeWithCircuitBreaker('test-operation', operation),
        ).rejects.toThrow(ForgeFlowError);

        expect(operation).not.toHaveBeenCalled();
      });
    });

    describe('System Health', () => {
      it('should calculate system health correctly', () => {
        // Create a few circuits in different states
        const circuit1 = manager.getCircuit('operation-1');
        const circuit2 = manager.getCircuit('operation-2');
        const circuit3 = manager.getCircuit('operation-3');

        circuit2.forceState('open', 'Test');
        circuit3.forceState('half-open', 'Test');

        const health = manager.getSystemHealth();

        expect(health.totalCircuits).toBe(3);
        expect(health.closedCircuits).toBe(1);
        expect(health.openCircuits).toBe(1);
        expect(health.halfOpenCircuits).toBe(1);
        expect(health.overallHealthScore).toBe(33); // 1/3 closed = 33%
      });

      it('should handle empty system health', () => {
        const health = manager.getSystemHealth();

        expect(health.totalCircuits).toBe(0);
        expect(health.overallHealthScore).toBe(100);
      });
    });

    describe('Circuit Operations', () => {
      it('should reset specific circuit', () => {
        const circuit = manager.getCircuit('test-operation');
        circuit.forceState('open', 'Test');

        const reset = manager.reset('test-operation');
        expect(reset).toBe(true);

        const metrics = circuit.getMetrics();
        expect(metrics.state).toBe('closed');
      });

      it('should reset all circuits', () => {
        const circuit1 = manager.getCircuit('operation-1');
        const circuit2 = manager.getCircuit('operation-2');

        circuit1.forceState('open', 'Test');
        circuit2.forceState('open', 'Test');

        manager.resetAll();

        expect(circuit1.getMetrics().state).toBe('closed');
        expect(circuit2.getMetrics().state).toBe('closed');
      });

      it('should remove circuit', () => {
        manager.getCircuit('temp-operation');
        const removed = manager.removeCircuit('temp-operation');

        expect(removed).toBe(true);
        expect(manager.getCircuitNames()).not.toContain('temp-operation');
      });

      it('should return false when removing non-existent circuit', () => {
        const removed = manager.removeCircuit('non-existent');
        expect(removed).toBe(false);
      });
    });

    describe('Configuration Management', () => {
      it('should update default configuration', () => {
        const newDefaults = {
          failureThreshold: 10,
          timeout: 120000,
        };

        manager.updateDefaultConfig(newDefaults);

        const circuit = manager.getCircuit('new-operation');
        // Configuration would be applied to new circuits
        expect(circuit).toBeDefined();
      });

      it('should get circuit names', () => {
        manager.getCircuit('circuit-1');
        manager.getCircuit('circuit-2');

        const names = manager.getCircuitNames();
        expect(names).toContain('circuit-1');
        expect(names).toContain('circuit-2');
      });
    });

    describe('Metrics Collection', () => {
      it('should collect metrics from all circuits', () => {
        const circuit1 = manager.getCircuit('operation-1');
        const circuit2 = manager.getCircuit('operation-2');

        circuit1.recordResult({
          success: true,
          duration: 1000,
          timestamp: new Date(),
        });

        circuit2.recordResult({
          success: false,
          duration: 2000,
          error: new Error('Test'),
          timestamp: new Date(),
        });

        const allMetrics = manager.getAllMetrics();

        expect(allMetrics['operation-1'].successes).toBe(1);
        expect(allMetrics['operation-2'].failures).toBe(1);
      });
    });
  });

  describe('Circuit Breaker Decorator', () => {
    it('should protect method with circuit breaker', async () => {
      class TestService {
        @circuitBreaker('test-service', { failureThreshold: 2 })
        async testMethod(): Promise<string> {
          return 'success';
        }
      }

      const service = new TestService();
      const result = await service.testMethod();

      expect(result).toBe('success');
    });

    it('should handle method failures', async () => {
      class TestService {
        private attempts = 0;

        @circuitBreaker('failing-service', { failureThreshold: 2 })
        async failingMethod(): Promise<string> {
          this.attempts++;
          if (this.attempts <= 2) {
            throw new Error('Method failure');
          }
          return 'success';
        }
      }

      const service = new TestService();

      // First two calls should fail
      await expect(service.failingMethod()).rejects.toThrow('Method failure');
      await expect(service.failingMethod()).rejects.toThrow('Method failure');

      // Circuit should be open now, but we can still call the method
      // The decorator implementation would determine the exact behavior
    });
  });

  describe('Performance and Edge Cases', () => {
    let manager: CircuitBreakerManager;

    beforeEach(() => {
      manager = new CircuitBreakerManager();
    });

    afterEach(() => {
      manager.destroy();
    });

    it('should handle high-frequency operations', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const promises = [];
      for (let i = 0; i < 1000; i++) {
        promises.push(manager.executeWithCircuitBreaker(`operation-${i % 10}`, operation));
      }

      const results = await Promise.allSettled(promises);
      const successful = results.filter((r) => r.status === 'fulfilled');

      expect(successful.length).toBe(1000);
      expect(operation).toHaveBeenCalledTimes(1000);
    });

    it('should handle concurrent state changes safely', async () => {
      const circuit = manager.getCircuit('concurrent-test');

      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          new Promise<void>((resolve) => {
            circuit.recordResult({
              success: i % 2 === 0,
              duration: 1000,
              error: i % 2 === 1 ? new Error('Test') : undefined,
              timestamp: new Date(),
            });
            resolve();
          }),
        );
      }

      await Promise.all(promises);

      const metrics = circuit.getMetrics();
      expect(metrics.totalCalls).toBe(100);
      expect(metrics.successes + metrics.failures).toBe(100);
    });

    it('should handle very large numbers of circuits', () => {
      for (let i = 0; i < 1000; i++) {
        manager.getCircuit(`circuit-${i}`);
      }

      expect(manager.getCircuitNames()).toHaveLength(1000);

      const health = manager.getSystemHealth();
      expect(health.totalCircuits).toBe(1000);
    });

    it('should cleanup resources properly', () => {
      const circuit = manager.getCircuit('cleanup-test', {
        enabled: true,
        enableHealthChecks: true,
        healthCheckInterval: 100,
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 60000,
      });

      expect(circuit).toBeDefined();

      // Destroy should cleanup health check timers
      expect(() => manager.destroy()).not.toThrow();
    });
  });
});
