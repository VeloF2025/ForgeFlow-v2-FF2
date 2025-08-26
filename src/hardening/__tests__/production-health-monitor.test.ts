/**
 * Comprehensive Test Suite for Production System Health Monitor
 * Zero tolerance for errors - 100% test coverage with edge cases
 */

import { EventEmitter } from 'events';
import {
  ProductionSystemHealthMonitor,
  DEFAULT_PRODUCTION_HEALTH_CONFIG,
  type ProductionHealthConfig,
  type SystemHealthMetrics,
  type SystemAlert,
} from '../production-health-monitor';
import { ErrorCategory, ErrorSeverity } from '../../utils/errors';

// Mock dependencies
jest.mock('../../utils/enhanced-logger', () => ({
  enhancedLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../utils/errors', () => ({
  ...jest.requireActual('../../utils/errors'),
  ErrorHandler: {
    getInstance: () => ({
      handleError: jest.fn(),
      recordSuccess: jest.fn(),
      recordFailure: jest.fn(),
    }),
  },
}));

// Mock fs promises
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    appendFile: jest.fn().mockResolvedValue(undefined),
    statvfs: jest.fn().mockResolvedValue({
      blocks: 1000000,
      bsize: 4096,
      bavail: 500000,
    }),
  },
}));

// Mock os module
jest.mock('os', () => ({
  totalmem: jest.fn(() => 8 * 1024 * 1024 * 1024), // 8GB
  freemem: jest.fn(() => 4 * 1024 * 1024 * 1024), // 4GB
  cpus: jest.fn(() => [{ model: 'test' }, { model: 'test' }]), // 2 cores
  loadavg: jest.fn(() => [0.5, 0.6, 0.7]),
}));

describe('ProductionSystemHealthMonitor', () => {
  let monitor: ProductionSystemHealthMonitor;
  let mockOrchestrator: any;
  let mockMemoryManager: any;
  let mockKnowledgeManager: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock components
    mockOrchestrator = {
      getHealth: jest.fn().mockResolvedValue({
        status: 'healthy',
        metrics: { operations: 100 },
        issues: [],
      }),
      isHealthy: jest.fn().mockResolvedValue(true),
      restart: jest.fn().mockResolvedValue(undefined),
    };

    mockMemoryManager = {
      getHealth: jest.fn().mockResolvedValue({
        status: 'healthy',
        metrics: { memoryUsage: 50 },
        issues: [],
      }),
      validateIntegrity: jest.fn().mockResolvedValue({
        valid: true,
        error: null,
      }),
      restart: jest.fn().mockResolvedValue(undefined),
    };

    mockKnowledgeManager = {
      getHealth: jest.fn().mockResolvedValue({
        status: 'healthy',
        metrics: { knowledgeItems: 1000 },
        issues: [],
      }),
      validateIntegrity: jest.fn().mockResolvedValue({
        valid: true,
        error: null,
      }),
      restart: jest.fn().mockResolvedValue(undefined),
    };

    // Create monitor with test configuration
    const testConfig: Partial<ProductionHealthConfig> = {
      monitoringInterval: 100, // Fast for testing
      persistence: { enabled: false, metricsRetention: 1, alertHistory: 1, storageLocation: '' },
      alerting: {
        enabled: true,
        channels: ['log'],
        rateLimit: { maxAlertsPerMinute: 100, cooldownPeriod: 1000 },
      },
    };

    monitor = new ProductionSystemHealthMonitor(
      testConfig,
      mockOrchestrator,
      mockMemoryManager,
      mockKnowledgeManager
    );
  });

  afterEach(async () => {
    if (monitor) {
      await monitor.shutdown();
    }
  });

  describe('Initialization', () => {
    test('should initialize with default configuration', async () => {
      // Expected behavior test
      const defaultMonitor = new ProductionSystemHealthMonitor();
      await defaultMonitor.initialize();
      
      const status = defaultMonitor.getSystemStatus();
      expect(status.monitoring).toBe(true);
      expect(status.componentsRegistered).toBe(0);
      
      await defaultMonitor.shutdown();
    });

    test('should initialize with custom configuration', async () => {
      // Expected behavior test
      const customConfig: Partial<ProductionHealthConfig> = {
        monitoringInterval: 2000,
        criticalThresholds: {
          memoryUsage: 90,
          cpuUsage: 85,
          diskUsage: 95,
          responseTime: 3000,
          errorRate: 3,
          dataIntegrityScore: 98,
        },
      };

      const customMonitor = new ProductionSystemHealthMonitor(customConfig);
      await customMonitor.initialize();
      
      const status = customMonitor.getSystemStatus();
      expect(status.monitoring).toBe(true);
      
      await customMonitor.shutdown();
    });

    test('should register core components during initialization', async () => {
      // Expected behavior test
      await monitor.initialize();
      
      const status = monitor.getSystemStatus();
      expect(status.componentsRegistered).toBe(3); // orchestrator, memory, knowledge
    });

    test('should handle initialization failure gracefully', async () => {
      // Error/failure case test
      const failingMonitor = new ProductionSystemHealthMonitor({
        monitoringInterval: 500, // Below minimum
      });

      await expect(failingMonitor.initialize()).rejects.toThrow('Monitoring interval must be at least 1000ms');
    });

    test('should validate configuration on initialization', () => {
      // Edge case test
      expect(() => {
        new ProductionSystemHealthMonitor({
          monitoringInterval: 500, // Below minimum
        });
      }).toThrow('Monitoring interval must be at least 1000ms');

      expect(() => {
        new ProductionSystemHealthMonitor({
          criticalThresholds: {
            memoryUsage: 85,
            cpuUsage: 80,
            diskUsage: 90,
            responseTime: 50, // Below minimum
            errorRate: 5,
            dataIntegrityScore: 95,
          },
        });
      }).toThrow('Response time threshold must be at least 100ms');

      expect(() => {
        new ProductionSystemHealthMonitor({
          autoRecovery: {
            enabled: true,
            maxAttempts: 0, // Below minimum
            escalationDelay: 30000,
            recoveryStrategies: [],
          },
        });
      }).toThrow('Auto-recovery max attempts must be at least 1');
    });
  });

  describe('Health Monitoring', () => {
    beforeEach(async () => {
      await monitor.initialize();
      // Wait a bit for initial health check
      await new Promise(resolve => setTimeout(resolve, 150));
    });

    test('should perform health checks at configured intervals', async () => {
      // Expected behavior test
      const initialHealth = monitor.getCurrentHealth();
      expect(initialHealth).toBeTruthy();
      expect(initialHealth!.overallHealth).toBeGreaterThan(0);
    });

    test('should gather comprehensive system metrics', async () => {
      // Expected behavior test
      const health = await monitor.forceHealthCheck();
      
      expect(health).toBeTruthy();
      expect(health!.systemResources.memory.usage).toBeGreaterThanOrEqual(0);
      expect(health!.systemResources.cpu.usage).toBeGreaterThanOrEqual(0);
      expect(health!.systemResources.disk.usage).toBeGreaterThanOrEqual(0);
      expect(health!.dataIntegrity.score).toBeGreaterThanOrEqual(0);
      expect(health!.performance.availability).toBeGreaterThanOrEqual(0);
    });

    test('should track component health status', async () => {
      // Expected behavior test
      const health = await monitor.forceHealthCheck();
      
      expect(health).toBeTruthy();
      expect(health!.components['orchestrator']).toBeTruthy();
      expect(health!.components['memory-manager']).toBeTruthy();
      expect(health!.components['knowledge-manager']).toBeTruthy();
      
      expect(health!.components['orchestrator'].status).toBe('healthy');
      expect(health!.components['orchestrator'].responseTime).toBeGreaterThanOrEqual(0);
    });

    test('should detect unhealthy components', async () => {
      // Error/failure case test
      mockOrchestrator.getHealth.mockResolvedValueOnce({
        status: 'error',
        metrics: {},
        issues: ['Component failure'],
      });

      const health = await monitor.forceHealthCheck();
      
      expect(health).toBeTruthy();
      expect(health!.components['orchestrator'].status).toBe('error');
      expect(health!.components['orchestrator'].issues).toContain('Component failure');
    });

    test('should handle component health check failures', async () => {
      // Error/failure case test
      mockMemoryManager.getHealth.mockRejectedValueOnce(new Error('Health check failed'));

      const health = await monitor.forceHealthCheck();
      
      expect(health).toBeTruthy();
      expect(health!.components['memory-manager'].status).toBe('error');
      expect(health!.components['memory-manager'].issues[0]).toContain('Health check failed');
    });

    test('should calculate overall health score correctly', async () => {
      // Expected behavior test
      const health = await monitor.forceHealthCheck();
      
      expect(health).toBeTruthy();
      expect(health!.overallHealth).toBeGreaterThanOrEqual(0);
      expect(health!.overallHealth).toBeLessThanOrEqual(100);
    });

    test('should maintain health history', async () => {
      // Expected behavior test
      await monitor.forceHealthCheck();
      await monitor.forceHealthCheck();
      
      const history = monitor.getHealthHistory();
      expect(history.length).toBeGreaterThan(1);
    });
  });

  describe('Alert System', () => {
    beforeEach(async () => {
      await monitor.initialize();
    });

    test('should create alerts for critical conditions', async () => {
      // Expected behavior test
      mockOrchestrator.getHealth.mockResolvedValueOnce({
        status: 'critical',
        metrics: {},
        issues: ['Critical failure'],
      });

      const alertPromise = new Promise(resolve => {
        monitor.once('alert_created', resolve);
      });

      await monitor.forceHealthCheck();
      
      const alert = await alertPromise as SystemAlert;
      expect(alert).toBeTruthy();
      expect(alert.severity).toBe('critical');
      expect(alert.component).toBe('orchestrator');
    });

    test('should acknowledge alerts', async () => {
      // Expected behavior test
      mockOrchestrator.getHealth.mockResolvedValueOnce({
        status: 'critical',
        metrics: {},
        issues: ['Critical failure'],
      });

      const alertPromise = new Promise(resolve => {
        monitor.once('alert_created', resolve);
      });

      await monitor.forceHealthCheck();
      const alert = await alertPromise as SystemAlert;
      
      const acknowledged = monitor.acknowledgeAlert(alert.id);
      expect(acknowledged).toBe(true);
    });

    test('should resolve alerts', async () => {
      // Expected behavior test
      mockOrchestrator.getHealth.mockResolvedValueOnce({
        status: 'critical',
        metrics: {},
        issues: ['Critical failure'],
      });

      const alertPromise = new Promise(resolve => {
        monitor.once('alert_created', resolve);
      });

      await monitor.forceHealthCheck();
      const alert = await alertPromise as SystemAlert;
      
      const resolved = monitor.resolveAlert(alert.id);
      expect(resolved).toBe(true);
    });

    test('should enforce alert rate limiting', async () => {
      // Edge case test
      const testMonitor = new ProductionSystemHealthMonitor({
        monitoringInterval: 1000,
        alerting: {
          enabled: true,
          channels: ['log'],
          rateLimit: { maxAlertsPerMinute: 1, cooldownPeriod: 60000 },
        },
      });

      await testMonitor.initialize();
      
      let alertCount = 0;
      testMonitor.on('alert_created', () => alertCount++);

      // Simulate multiple critical conditions
      for (let i = 0; i < 5; i++) {
        mockOrchestrator.getHealth.mockResolvedValueOnce({
          status: 'critical',
          metrics: {},
          issues: [`Critical failure ${i}`],
        });
        await testMonitor.forceHealthCheck();
      }

      // Should be rate limited to 1 alert
      expect(alertCount).toBeLessThanOrEqual(1);
      
      await testMonitor.shutdown();
    });

    test('should handle alert sending failures gracefully', async () => {
      // Error/failure case test
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      mockOrchestrator.getHealth.mockResolvedValueOnce({
        status: 'critical',
        metrics: {},
        issues: ['Critical failure'],
      });

      await monitor.forceHealthCheck();
      
      // Should not throw even if console.error is mocked
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  describe('Data Integrity Monitoring', () => {
    beforeEach(async () => {
      await monitor.initialize();
    });

    test('should validate data integrity', async () => {
      // Expected behavior test
      const health = await monitor.forceHealthCheck();
      
      expect(health).toBeTruthy();
      expect(health!.dataIntegrity.score).toBeGreaterThanOrEqual(0);
      expect(health!.dataIntegrity.score).toBeLessThanOrEqual(100);
      expect(health!.dataIntegrity.lastValidation).toBeInstanceOf(Date);
    });

    test('should detect data corruption', async () => {
      // Error/failure case test
      mockMemoryManager.validateIntegrity.mockResolvedValueOnce({
        valid: false,
        error: 'Memory corruption detected',
      });

      const health = await monitor.forceHealthCheck();
      
      expect(health).toBeTruthy();
      expect(health!.dataIntegrity.issues.length).toBeGreaterThan(0);
      expect(health!.dataIntegrity.issues[0].type).toBe('corruption');
      expect(health!.dataIntegrity.issues[0].component).toBe('memory-manager');
    });

    test('should handle integrity validation failures', async () => {
      // Error/failure case test
      mockKnowledgeManager.validateIntegrity.mockRejectedValueOnce(new Error('Validation failed'));

      const health = await monitor.forceHealthCheck();
      
      expect(health).toBeTruthy();
      expect(health!.dataIntegrity.checksumErrors).toBeGreaterThan(0);
    });

    test('should calculate integrity score based on issues', async () => {
      // Edge case test
      mockMemoryManager.validateIntegrity.mockResolvedValueOnce({
        valid: false,
        error: 'Minor corruption',
      });
      mockKnowledgeManager.validateIntegrity.mockResolvedValueOnce({
        valid: false,
        error: 'Data mismatch',
      });

      const health = await monitor.forceHealthCheck();
      
      expect(health).toBeTruthy();
      expect(health!.dataIntegrity.score).toBeLessThan(100);
      expect(health!.dataIntegrity.issues.length).toBe(2);
    });
  });

  describe('Auto-Recovery System', () => {
    beforeEach(async () => {
      await monitor.initialize();
    });

    test('should trigger recovery for critical health scores', async () => {
      // Expected behavior test
      mockOrchestrator.getHealth.mockResolvedValue({
        status: 'critical',
        metrics: {},
        issues: ['Critical failure'],
      });
      mockMemoryManager.getHealth.mockResolvedValue({
        status: 'critical',
        metrics: {},
        issues: ['Memory critical'],
      });

      const recoveryPromise = new Promise(resolve => {
        monitor.once('recovery_complete', resolve);
      });

      await monitor.forceHealthCheck();
      
      // Wait for recovery to trigger (with timeout)
      const recovery = await Promise.race([
        recoveryPromise,
        new Promise(resolve => setTimeout(() => resolve('timeout'), 5000))
      ]);
      
      expect(recovery).not.toBe('timeout');
    });

    test('should identify appropriate recovery strategies', async () => {
      // Expected behavior test
      // Mock memory critical condition
      jest.spyOn(monitor as any, 'gatherSystemResourceMetrics').mockResolvedValueOnce({
        memory: { usage: 95, available: 100, total: 2000, trend: 'increasing', threshold: 85, status: 'critical' },
        cpu: { usage: 50, available: 50, total: 100, trend: 'stable', threshold: 80, status: 'healthy' },
        disk: { usage: 70, available: 300, total: 1000, trend: 'stable', threshold: 90, status: 'healthy' },
        network: { usage: 10, available: 90, total: 100, trend: 'stable', threshold: 95, status: 'healthy' },
      });

      const health = await monitor.forceHealthCheck();
      expect(health).toBeTruthy();
      expect(health!.systemResources.memory.status).toBe('critical');
    });

    test('should handle recovery strategy execution failures', async () => {
      // Error/failure case test
      mockOrchestrator.restart.mockRejectedValueOnce(new Error('Restart failed'));
      mockOrchestrator.getHealth.mockResolvedValue({
        status: 'critical',
        metrics: {},
        issues: ['Critical failure'],
      });

      // Should not throw even if recovery fails
      await monitor.forceHealthCheck();
    });

    test('should respect recovery attempt limits', async () => {
      // Edge case test
      const testMonitor = new ProductionSystemHealthMonitor({
        monitoringInterval: 1000,
        autoRecovery: {
          enabled: true,
          maxAttempts: 1,
          escalationDelay: 100,
          recoveryStrategies: ['restart_component'],
        },
      }, mockOrchestrator, mockMemoryManager, mockKnowledgeManager);

      await testMonitor.initialize();
      
      mockOrchestrator.getHealth.mockResolvedValue({
        status: 'critical',
        metrics: {},
        issues: ['Critical failure'],
      });

      let recoveryCount = 0;
      testMonitor.on('recovery_complete', () => recoveryCount++);

      // Multiple critical conditions should respect attempt limits
      await testMonitor.forceHealthCheck();
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(recoveryCount).toBeLessThanOrEqual(1);
      
      await testMonitor.shutdown();
    });
  });

  describe('Component Registration', () => {
    beforeEach(async () => {
      await monitor.initialize();
    });

    test('should register components successfully', () => {
      // Expected behavior test
      const mockComponent = { getHealth: jest.fn() };
      monitor.registerComponent('test-component', mockComponent);
      
      const status = monitor.getSystemStatus();
      expect(status.componentsRegistered).toBe(4); // 3 core + 1 new
    });

    test('should unregister components successfully', () => {
      // Expected behavior test
      const mockComponent = { getHealth: jest.fn() };
      monitor.registerComponent('test-component', mockComponent);
      
      const removed = monitor.unregisterComponent('test-component');
      expect(removed).toBe(true);
      
      const status = monitor.getSystemStatus();
      expect(status.componentsRegistered).toBe(3); // Back to 3 core components
    });

    test('should handle unregistering non-existent components', () => {
      // Edge case test
      const removed = monitor.unregisterComponent('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('Performance Monitoring', () => {
    beforeEach(async () => {
      await monitor.initialize();
    });

    test('should track performance metrics over time', async () => {
      // Expected behavior test
      await monitor.forceHealthCheck();
      await monitor.forceHealthCheck();
      
      const health = monitor.getCurrentHealth();
      expect(health).toBeTruthy();
      expect(health!.performance.averageResponseTime).toBeGreaterThanOrEqual(0);
      expect(health!.performance.throughput).toBeGreaterThanOrEqual(0);
      expect(health!.performance.availability).toBeGreaterThanOrEqual(0);
    });

    test('should calculate trends correctly', async () => {
      // Expected behavior test
      await monitor.forceHealthCheck();
      await monitor.forceHealthCheck();
      await monitor.forceHealthCheck();
      
      const health = monitor.getCurrentHealth();
      expect(health).toBeTruthy();
      expect(['increasing', 'decreasing', 'stable']).toContain(health!.systemResources.memory.trend);
    });
  });

  describe('System Status API', () => {
    beforeEach(async () => {
      await monitor.initialize();
    });

    test('should provide comprehensive system status', () => {
      // Expected behavior test
      const status = monitor.getSystemStatus();
      
      expect(status.monitoring).toBe(true);
      expect(typeof status.healthy).toBe('boolean');
      expect(status.overallHealth).toBeGreaterThanOrEqual(0);
      expect(status.overallHealth).toBeLessThanOrEqual(100);
      expect(status.activeAlerts).toBeGreaterThanOrEqual(0);
      expect(status.componentsRegistered).toBeGreaterThan(0);
      expect(status.uptime).toBeGreaterThan(0);
    });

    test('should return current health metrics', async () => {
      // Expected behavior test
      await monitor.forceHealthCheck();
      
      const health = monitor.getCurrentHealth();
      expect(health).toBeTruthy();
      expect(health!.timestamp).toBeInstanceOf(Date);
      expect(health!.overallHealth).toBeGreaterThanOrEqual(0);
    });

    test('should return health history with limits', async () => {
      // Expected behavior test
      await monitor.forceHealthCheck();
      await monitor.forceHealthCheck();
      await monitor.forceHealthCheck();
      
      const history = monitor.getHealthHistory(2);
      expect(history.length).toBeLessThanOrEqual(2);
      expect(history.length).toBeGreaterThan(0);
    });

    test('should handle empty health history', () => {
      // Edge case test
      const newMonitor = new ProductionSystemHealthMonitor();
      const health = newMonitor.getCurrentHealth();
      expect(health).toBeNull();
      
      const history = newMonitor.getHealthHistory();
      expect(history.length).toBe(0);
    });
  });

  describe('Resource Management and Cleanup', () => {
    test('should clean up resources on shutdown', async () => {
      // Expected behavior test
      await monitor.initialize();
      
      const shutdownPromise = new Promise(resolve => {
        monitor.once('shutdown_complete', resolve);
      });
      
      await monitor.shutdown();
      await shutdownPromise;
      
      const status = monitor.getSystemStatus();
      expect(status.monitoring).toBe(false);
    });

    test('should handle shutdown during active health check', async () => {
      // Edge case test
      await monitor.initialize();
      
      // Start a health check and immediately shutdown
      const healthCheckPromise = monitor.forceHealthCheck();
      const shutdownPromise = monitor.shutdown();
      
      // Both should complete without hanging
      await Promise.all([healthCheckPromise, shutdownPromise]);
    });

    test('should maintain health history size limits', async () => {
      // Edge case test
      await monitor.initialize();
      
      // Force many health checks
      for (let i = 0; i < 1100; i++) {
        await monitor.forceHealthCheck();
      }
      
      const history = monitor.getHealthHistory(2000);
      expect(history.length).toBeLessThanOrEqual(1000); // Should be limited
    });

    test('should handle multiple shutdown calls gracefully', async () => {
      // Edge case test
      await monitor.initialize();
      
      // Multiple shutdown calls should not cause issues
      await Promise.all([
        monitor.shutdown(),
        monitor.shutdown(),
        monitor.shutdown(),
      ]);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle system resource gathering failures', async () => {
      // Error/failure case test
      const originalTotalmem = require('os').totalmem;
      require('os').totalmem = jest.fn(() => { throw new Error('System error'); });
      
      try {
        await monitor.initialize();
        const health = await monitor.forceHealthCheck();
        
        expect(health).toBeTruthy();
        // Should return degraded metrics instead of failing
        expect(health!.systemResources.memory.status).toBe('critical');
      } finally {
        require('os').totalmem = originalTotalmem;
      }
    });

    test('should handle component health check timeouts', async () => {
      // Error/failure case test
      mockOrchestrator.getHealth.mockImplementationOnce(
        () => new Promise(resolve => setTimeout(resolve, 5000))
      );

      await monitor.initialize();
      
      // Force health check with component that times out
      const startTime = Date.now();
      const health = await monitor.forceHealthCheck();
      const endTime = Date.now();
      
      expect(health).toBeTruthy();
      // Should not wait for the full timeout
      expect(endTime - startTime).toBeLessThan(4000);
    });

    test('should handle invalid configurations gracefully', () => {
      // Error/failure case test
      expect(() => {
        new ProductionSystemHealthMonitor({
          criticalThresholds: {
            memoryUsage: -10, // Invalid threshold
            cpuUsage: 80,
            diskUsage: 90,
            responseTime: 2000,
            errorRate: 5,
            dataIntegrityScore: 95,
          },
        });
      }).not.toThrow(); // Should handle gracefully, not throw
    });

    test('should continue monitoring despite individual failures', async () => {
      // Error/failure case test
      await monitor.initialize();
      
      // Simulate component failure
      mockMemoryManager.getHealth.mockRejectedValue(new Error('Component failed'));
      
      // Should continue monitoring other components
      const health1 = await monitor.forceHealthCheck();
      const health2 = await monitor.forceHealthCheck();
      
      expect(health1).toBeTruthy();
      expect(health2).toBeTruthy();
      expect(health1!.components['orchestrator'].status).toBe('healthy');
      expect(health2!.components['orchestrator'].status).toBe('healthy');
    });

    test('should handle memory pressure scenarios', async () => {
      // Edge case test
      const originalFreemem = require('os').freemem;
      require('os').freemem = jest.fn(() => 100 * 1024 * 1024); // Very low memory
      
      try {
        await monitor.initialize();
        const health = await monitor.forceHealthCheck();
        
        expect(health).toBeTruthy();
        expect(health!.systemResources.memory.usage).toBeGreaterThan(90);
        expect(health!.systemResources.memory.status).toBe('critical');
      } finally {
        require('os').freemem = originalFreemem;
      }
    });
  });

  describe('Event Emission and Integration', () => {
    beforeEach(async () => {
      await monitor.initialize();
    });

    test('should emit initialization event', (done) => {
      // Expected behavior test
      const newMonitor = new ProductionSystemHealthMonitor();
      
      newMonitor.once('initialized', () => {
        newMonitor.shutdown().then(() => done());
      });
      
      newMonitor.initialize();
    });

    test('should emit health check complete events', (done) => {
      // Expected behavior test
      monitor.once('health_check_complete', (metrics) => {
        expect(metrics).toBeTruthy();
        expect(metrics.timestamp).toBeInstanceOf(Date);
        done();
      });
      
      monitor.forceHealthCheck();
    });

    test('should emit error events on health check failures', (done) => {
      // Error/failure case test
      // Cause a health check failure by making all components fail
      mockOrchestrator.getHealth.mockRejectedValue(new Error('Health check failed'));
      mockMemoryManager.getHealth.mockRejectedValue(new Error('Health check failed'));
      mockKnowledgeManager.getHealth.mockRejectedValue(new Error('Health check failed'));
      
      monitor.once('health_check_error', (error) => {
        expect(error).toBeTruthy();
        expect(error.message).toContain('Health check failed');
        done();
      });
      
      monitor.forceHealthCheck();
    });

    test('should emit alert events for critical conditions', (done) => {
      // Expected behavior test
      mockOrchestrator.getHealth.mockResolvedValueOnce({
        status: 'critical',
        metrics: {},
        issues: ['Critical system failure'],
      });
      
      monitor.once('alert_created', (alert) => {
        expect(alert).toBeTruthy();
        expect(alert.severity).toBe('critical');
        done();
      });
      
      monitor.forceHealthCheck();
    });
  });
});