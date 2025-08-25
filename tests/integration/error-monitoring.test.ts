/**
 * Integration Tests for Error Monitoring System
 * Tests the complete error monitoring and alerting workflow
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ForgeFlowError, ErrorCategory, ErrorSeverity } from '../../src/utils/errors';
import { errorMonitoring, ErrorMonitoringSystem, AlertConfig } from '../../src/utils/error-monitoring';
import { gracefulDegradation } from '../../src/utils/graceful-degradation';

describe('Error Monitoring System Integration', () => {
  let monitoring: ErrorMonitoringSystem;
  
  beforeEach(() => {
    monitoring = ErrorMonitoringSystem.getInstance();
    vi.clearAllTimers();
    vi.useFakeTimers();
  });

  afterEach(() => {
    monitoring.stop();
    vi.restoreAllMocks();
  });

  describe('System Startup and Health Monitoring', () => {
    it('should start monitoring system successfully', () => {
      expect(monitoring.getSystemStatus().monitoring).toBe(false);
      
      monitoring.start();
      
      expect(monitoring.getSystemStatus().monitoring).toBe(true);
    });

    it('should collect health metrics periodically', async () => {
      monitoring.start();
      
      // Advance time to trigger metrics collection
      vi.advanceTimersByTime(60000);
      
      const status = monitoring.getSystemStatus();
      expect(status.latestMetrics).not.toBeNull();
    });

    it('should handle multiple start/stop cycles', () => {
      monitoring.start();
      expect(monitoring.getSystemStatus().monitoring).toBe(true);
      
      monitoring.stop();
      expect(monitoring.getSystemStatus().monitoring).toBe(false);
      
      monitoring.start();
      expect(monitoring.getSystemStatus().monitoring).toBe(true);
    });
  });

  describe('Alert Configuration and Triggering', () => {
    it('should register custom alert configuration', () => {
      const alertConfig: AlertConfig = {
        id: 'test-alert',
        name: 'Test Alert',
        description: 'Test alert for integration testing',
        severity: ErrorSeverity.HIGH,
        triggers: [{
          type: 'severity',
          condition: '=',
          timeWindowMs: 0,
          threshold: ErrorSeverity.HIGH
        }],
        actions: [{
          type: 'log',
          enabled: true,
          config: { level: 'error' }
        }],
        enabled: true,
        cooldownMs: 60000,
        maxAlertsPerHour: 10
      };

      monitoring.registerAlert(alertConfig);
      
      const status = monitoring.getSystemStatus();
      expect(status.alertConfigs).toBeGreaterThan(0);
    });

    it('should trigger alerts for critical errors', async () => {
      monitoring.start();
      
      const criticalError = new ForgeFlowError({
        code: 'CRITICAL_TEST',
        message: 'Critical test error for monitoring',
        category: ErrorCategory.SECURITY,
        severity: ErrorSeverity.CRITICAL
      });

      // Create a promise to wait for alert
      const alertPromise = new Promise((resolve) => {
        monitoring.once('alert', resolve);
      });

      // Trigger the error through the error handler
      const errorHandler = require('../../src/utils/errors').ErrorHandler.getInstance();
      errorHandler.handleError(criticalError);

      const alert = await alertPromise;
      expect(alert).toBeDefined();
      expect((alert as any).severity).toBe(ErrorSeverity.CRITICAL);
    });

    it('should respect alert cooldown periods', async () => {
      monitoring.start();
      
      const alertConfig: AlertConfig = {
        id: 'cooldown-test',
        name: 'Cooldown Test Alert',
        description: 'Test cooldown functionality',
        severity: ErrorSeverity.MEDIUM,
        triggers: [{
          type: 'pattern',
          condition: 'contains',
          timeWindowMs: 0,
          threshold: 'cooldown-test'
        }],
        actions: [{
          type: 'console',
          enabled: true,
          config: {}
        }],
        enabled: true,
        cooldownMs: 5000,
        maxAlertsPerHour: 100
      };

      monitoring.registerAlert(alertConfig);

      const testError = new ForgeFlowError({
        code: 'COOLDOWN_TEST',
        message: 'cooldown-test error message',
        category: ErrorCategory.INTERNAL_ERROR,
        severity: ErrorSeverity.MEDIUM
      });

      let alertCount = 0;
      monitoring.on('alert', () => alertCount++);

      // First error should trigger alert
      const errorHandler = require('../../src/utils/errors').ErrorHandler.getInstance();
      errorHandler.handleError(testError);
      
      // Wait a moment for processing
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Second error within cooldown should not trigger alert
      errorHandler.handleError(testError);
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(alertCount).toBe(1);
      
      // Advance time past cooldown
      vi.advanceTimersByTime(6000);
      
      // Third error after cooldown should trigger alert
      errorHandler.handleError(testError);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(alertCount).toBe(2);
    });

    it('should enforce hourly alert limits', async () => {
      monitoring.start();
      
      const alertConfig: AlertConfig = {
        id: 'rate-limit-test',
        name: 'Rate Limit Test',
        description: 'Test rate limiting',
        severity: ErrorSeverity.MEDIUM,
        triggers: [{
          type: 'pattern',
          condition: 'contains',
          timeWindowMs: 0,
          threshold: 'rate-limit-test'
        }],
        actions: [{
          type: 'console',
          enabled: true,
          config: {}
        }],
        enabled: true,
        cooldownMs: 0,
        maxAlertsPerHour: 2
      };

      monitoring.registerAlert(alertConfig);

      let alertCount = 0;
      monitoring.on('alert', () => alertCount++);

      const testError = new ForgeFlowError({
        code: 'RATE_LIMIT_TEST',
        message: 'rate-limit-test error message',
        category: ErrorCategory.INTERNAL_ERROR,
        severity: ErrorSeverity.MEDIUM
      });

      const errorHandler = require('../../src/utils/errors').ErrorHandler.getInstance();
      
      // Send 3 errors quickly
      for (let i = 0; i < 3; i++) {
        errorHandler.handleError(testError);
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Should only have 2 alerts due to hourly limit
      expect(alertCount).toBe(2);
    });
  });

  describe('Error Rate and Pattern Detection', () => {
    it('should detect high error rates', async () => {
      monitoring.start();
      
      // Register high error rate alert
      const alertConfig: AlertConfig = {
        id: 'high-error-rate-test',
        name: 'High Error Rate Test',
        description: 'Test high error rate detection',
        severity: ErrorSeverity.HIGH,
        triggers: [{
          type: 'error-rate',
          condition: '> 5',
          timeWindowMs: 60000,
          threshold: 5
        }],
        actions: [{
          type: 'console',
          enabled: true,
          config: {}
        }],
        enabled: true,
        cooldownMs: 30000,
        maxAlertsPerHour: 10
      };

      monitoring.registerAlert(alertConfig);

      let alertCount = 0;
      monitoring.on('alert', () => alertCount++);

      const errorHandler = require('../../src/utils/errors').ErrorHandler.getInstance();
      
      // Generate multiple errors to trigger high rate detection
      for (let i = 0; i < 10; i++) {
        const error = new ForgeFlowError({
          code: `ERROR_${i}`,
          message: `Test error ${i}`,
          category: ErrorCategory.INTERNAL_ERROR,
          severity: ErrorSeverity.MEDIUM
        });
        
        errorHandler.handleError(error);
        errorHandler.recordFailure(`operation-${i}`, error, 1000);
      }

      // Advance time to trigger metrics collection
      vi.advanceTimersByTime(60000);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Should trigger high error rate alert
      expect(alertCount).toBeGreaterThan(0);
    });

    it('should detect error patterns by category', async () => {
      monitoring.start();
      
      const alertConfig: AlertConfig = {
        id: 'github-error-pattern',
        name: 'GitHub Error Pattern',
        description: 'Detect GitHub integration issues',
        severity: ErrorSeverity.MEDIUM,
        triggers: [{
          type: 'category',
          condition: '=',
          timeWindowMs: 0,
          threshold: ErrorCategory.GITHUB_INTEGRATION
        }],
        actions: [{
          type: 'log',
          enabled: true,
          config: { level: 'warn' }
        }],
        enabled: true,
        cooldownMs: 10000,
        maxAlertsPerHour: 20
      };

      monitoring.registerAlert(alertConfig);

      let alertCount = 0;
      monitoring.on('alert', () => alertCount++);

      const gitHubError = new ForgeFlowError({
        code: 'GITHUB_API_ERROR',
        message: 'GitHub API rate limit exceeded',
        category: ErrorCategory.GITHUB_INTEGRATION,
        severity: ErrorSeverity.MEDIUM
      });

      const errorHandler = require('../../src/utils/errors').ErrorHandler.getInstance();
      errorHandler.handleError(gitHubError);

      await new Promise(resolve => setTimeout(resolve, 100));
      expect(alertCount).toBe(1);
    });
  });

  describe('Alert Actions and Processing', () => {
    it('should execute log actions', async () => {
      monitoring.start();
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const alertConfig: AlertConfig = {
        id: 'log-action-test',
        name: 'Log Action Test',
        description: 'Test log action execution',
        severity: ErrorSeverity.MEDIUM,
        triggers: [{
          type: 'pattern',
          condition: 'contains',
          timeWindowMs: 0,
          threshold: 'log-action-test'
        }],
        actions: [
          {
            type: 'log',
            enabled: true,
            config: { level: 'error' }
          },
          {
            type: 'console',
            enabled: true,
            config: { prefix: 'TEST ALERT' }
          }
        ],
        enabled: true,
        cooldownMs: 0,
        maxAlertsPerHour: 100
      };

      monitoring.registerAlert(alertConfig);

      const testError = new ForgeFlowError({
        code: 'LOG_ACTION_TEST',
        message: 'log-action-test error for testing',
        category: ErrorCategory.INTERNAL_ERROR,
        severity: ErrorSeverity.MEDIUM
      });

      const errorHandler = require('../../src/utils/errors').ErrorHandler.getInstance();
      errorHandler.handleError(testError);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('TEST ALERT')
      );
      
      consoleSpy.mockRestore();
    });

    it('should handle action failures gracefully', async () => {
      monitoring.start();
      
      const alertConfig: AlertConfig = {
        id: 'action-failure-test',
        name: 'Action Failure Test',
        description: 'Test action failure handling',
        severity: ErrorSeverity.MEDIUM,
        triggers: [{
          type: 'pattern',
          condition: 'contains',
          timeWindowMs: 0,
          threshold: 'action-failure-test'
        }],
        actions: [{
          type: 'webhook',
          enabled: true,
          config: {
            url: 'http://invalid-webhook-url-that-will-fail.test'
          }
        }],
        enabled: true,
        cooldownMs: 0,
        maxAlertsPerHour: 100
      };

      monitoring.registerAlert(alertConfig);

      const testError = new ForgeFlowError({
        code: 'ACTION_FAILURE_TEST',
        message: 'action-failure-test error',
        category: ErrorCategory.INTERNAL_ERROR,
        severity: ErrorSeverity.MEDIUM
      });

      const errorHandler = require('../../src/utils/errors').ErrorHandler.getInstance();
      
      // Should not throw even with failing webhook
      expect(() => {
        errorHandler.handleError(testError);
      }).not.toThrow();

      await new Promise(resolve => setTimeout(resolve, 100));
    });
  });

  describe('System Health Integration', () => {
    it('should detect low system health score', async () => {
      monitoring.start();
      
      const alertConfig: AlertConfig = {
        id: 'low-health-test',
        name: 'Low Health Test',
        description: 'Test low system health detection',
        severity: ErrorSeverity.HIGH,
        triggers: [{
          type: 'health-score',
          condition: '< 50',
          timeWindowMs: 0,
          threshold: 50
        }],
        actions: [{
          type: 'console',
          enabled: true,
          config: { prefix: 'LOW HEALTH' }
        }],
        enabled: true,
        cooldownMs: 60000,
        maxAlertsPerHour: 5
      };

      monitoring.registerAlert(alertConfig);

      // Mock graceful degradation to return low health score
      const mockHealth = {
        score: 30,
        status: 'critical' as const,
        components: [],
        criticalIssues: ['System degraded'],
        recommendedActions: ['Investigate issues']
      };

      vi.spyOn(gracefulDegradation, 'getSystemHealth').mockReturnValue(mockHealth);

      let alertCount = 0;
      monitoring.on('alert', () => alertCount++);

      // Trigger metrics collection
      vi.advanceTimersByTime(60000);

      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should trigger low health alert
      expect(alertCount).toBeGreaterThan(0);
    });

    it('should collect comprehensive system metrics', async () => {
      monitoring.start();
      
      // Advance time to trigger metrics collection
      vi.advanceTimersByTime(60000);
      
      const metrics = monitoring.getHealthMetrics(1);
      expect(metrics).toHaveLength(1);
      
      const latestMetric = metrics[0];
      expect(latestMetric).toHaveProperty('timestamp');
      expect(latestMetric).toHaveProperty('errorRate');
      expect(latestMetric).toHaveProperty('totalErrors');
      expect(latestMetric).toHaveProperty('systemHealthScore');
      expect(latestMetric).toHaveProperty('componentHealth');
      expect(latestMetric).toHaveProperty('circuitBreakers');
      expect(latestMetric).toHaveProperty('recoveryMetrics');
    });
  });

  describe('Alert Management', () => {
    it('should track and manage active alerts', async () => {
      monitoring.start();
      
      const testError = new ForgeFlowError({
        code: 'ACTIVE_ALERT_TEST',
        message: 'Test error for active alerts',
        category: ErrorCategory.SECURITY,
        severity: ErrorSeverity.CRITICAL
      });

      const initialActiveAlerts = monitoring.getActiveAlerts();
      const initialCount = initialActiveAlerts.length;

      const errorHandler = require('../../src/utils/errors').ErrorHandler.getInstance();
      errorHandler.handleError(testError);

      await new Promise(resolve => setTimeout(resolve, 100));

      const activeAlerts = monitoring.getActiveAlerts();
      expect(activeAlerts.length).toBe(initialCount + 1);
      
      const newAlert = activeAlerts.find(alert => 
        alert.title.includes('ACTIVE_ALERT_TEST')
      );
      expect(newAlert).toBeDefined();
      expect(newAlert!.resolved).toBe(false);
    });

    it('should resolve alerts', async () => {
      monitoring.start();
      
      const testError = new ForgeFlowError({
        code: 'RESOLVE_TEST',
        message: 'Test error for alert resolution',
        category: ErrorCategory.SECURITY,
        severity: ErrorSeverity.CRITICAL
      });

      const errorHandler = require('../../src/utils/errors').ErrorHandler.getInstance();
      errorHandler.handleError(testError);

      await new Promise(resolve => setTimeout(resolve, 100));

      const activeAlerts = monitoring.getActiveAlerts();
      const alert = activeAlerts.find(alert => 
        alert.title.includes('RESOLVE_TEST')
      );
      
      expect(alert).toBeDefined();
      
      const resolved = monitoring.resolveAlert(alert!.id, 'Test resolution');
      expect(resolved).toBe(true);
      
      const updatedActiveAlerts = monitoring.getActiveAlerts();
      const resolvedAlert = updatedActiveAlerts.find(alert => alert.id === alert!.id);
      expect(resolvedAlert).toBeUndefined(); // Should be filtered out of active alerts
    });

    it('should maintain alert history', async () => {
      monitoring.start();
      
      const testError = new ForgeFlowError({
        code: 'HISTORY_TEST',
        message: 'Test error for alert history',
        category: ErrorCategory.CRITICAL,
        severity: ErrorSeverity.CRITICAL
      });

      const initialHistory = monitoring.getAlertHistory();
      const initialCount = initialHistory.length;

      const errorHandler = require('../../src/utils/errors').ErrorHandler.getInstance();
      errorHandler.handleError(testError);

      await new Promise(resolve => setTimeout(resolve, 100));

      const alertHistory = monitoring.getAlertHistory();
      expect(alertHistory.length).toBe(initialCount + 1);
      
      const newAlert = alertHistory.find(alert => 
        alert.title.includes('HISTORY_TEST')
      );
      expect(newAlert).toBeDefined();
    });
  });

  describe('Data Cleanup and Maintenance', () => {
    it('should clean up old data periodically', async () => {
      monitoring.start();
      
      // Generate some test data
      const testError = new ForgeFlowError({
        code: 'CLEANUP_TEST',
        message: 'Test error for cleanup',
        category: ErrorCategory.INTERNAL_ERROR,
        severity: ErrorSeverity.MEDIUM
      });

      const errorHandler = require('../../src/utils/errors').ErrorHandler.getInstance();
      errorHandler.handleError(testError);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Advance time by more than 24 hours to trigger cleanup
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);

      // The system should still be functioning
      const status = monitoring.getSystemStatus();
      expect(status.monitoring).toBe(true);
    });

    it('should handle shutdown gracefully', async () => {
      monitoring.start();
      
      const testError = new ForgeFlowError({
        code: 'SHUTDOWN_TEST',
        message: 'Test error before shutdown',
        category: ErrorCategory.INTERNAL_ERROR,
        severity: ErrorSeverity.MEDIUM
      });

      const errorHandler = require('../../src/utils/errors').ErrorHandler.getInstance();
      errorHandler.handleError(testError);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(monitoring.getSystemStatus().monitoring).toBe(true);
      
      monitoring.stop();
      
      expect(monitoring.getSystemStatus().monitoring).toBe(false);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle high volume of errors efficiently', async () => {
      monitoring.start();
      
      const startTime = Date.now();
      const errorHandler = require('../../src/utils/errors').ErrorHandler.getInstance();
      
      // Generate many errors quickly
      for (let i = 0; i < 1000; i++) {
        const error = new ForgeFlowError({
          code: `PERF_TEST_${i}`,
          message: `Performance test error ${i}`,
          category: ErrorCategory.INTERNAL_ERROR,
          severity: ErrorSeverity.LOW
        });
        
        errorHandler.handleError(error);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should process 1000 errors in reasonable time (less than 1 second)
      expect(duration).toBeLessThan(1000);
      
      // System should still be responsive
      const status = monitoring.getSystemStatus();
      expect(status.monitoring).toBe(true);
    });

    it('should maintain bounded memory usage', async () => {
      monitoring.start();
      
      const initialStatus = monitoring.getSystemStatus();
      const errorHandler = require('../../src/utils/errors').ErrorHandler.getInstance();
      
      // Generate many errors to test memory bounds
      for (let i = 0; i < 5000; i++) {
        const error = new ForgeFlowError({
          code: `MEMORY_TEST_${i}`,
          message: `Memory test error ${i}`,
          category: ErrorCategory.INTERNAL_ERROR,
          severity: ErrorSeverity.MEDIUM
        });
        
        errorHandler.handleError(error);
      }
      
      // Advance time to trigger cleanup
      vi.advanceTimersByTime(60000);
      
      const finalStatus = monitoring.getSystemStatus();
      
      // System should still be functioning
      expect(finalStatus.monitoring).toBe(true);
      
      // Memory usage should be bounded (metrics should not grow indefinitely)
      const metrics = monitoring.getHealthMetrics(1);
      expect(metrics).toHaveLength(1);
    });
  });
});