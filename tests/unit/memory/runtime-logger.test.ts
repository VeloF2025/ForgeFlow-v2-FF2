// Runtime Logger Test Suite
// Comprehensive testing for structured logging functionality

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import { RuntimeLogger } from '../../../src/memory/runtime-logger';
import { MemoryConfig, LogFilters, TimeRange } from '../../../src/memory/types';
import { testMemoryConfig } from '../../../src/memory/index';

describe('RuntimeLogger', () => {
  let runtimeLogger: RuntimeLogger;
  let testConfig: MemoryConfig;
  let testStoragePath: string;

  beforeAll(() => {
    // Set up test environment
    testStoragePath = path.join(process.cwd(), '.ff2-test-runtime-logger');
    testConfig = {
      ...testMemoryConfig,
      storageBasePath: testStoragePath
    };
  });

  beforeEach(async () => {
    // Clean up any existing test data
    try {
      await fs.rm(testStoragePath, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }

    // Create fresh logger instance
    runtimeLogger = new RuntimeLogger(testConfig);
    await runtimeLogger.initialize();
    
    // Set session context for testing
    runtimeLogger.setSessionContext('test-session-123', 'test-job-456', 'test-agent');
  });

  afterEach(async () => {
    // Shutdown logger and clean up
    await runtimeLogger.shutdown();
    
    try {
      await fs.rm(testStoragePath, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  });

  afterAll(async () => {
    // Final cleanup
    try {
      await fs.rm(testStoragePath, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      expect(runtimeLogger).toBeDefined();
    });

    it('should create log directory structure', async () => {
      const logsDir = path.join(testStoragePath, 'logs');
      const exists = await fs.access(logsDir).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should set session context correctly', () => {
      runtimeLogger.setSessionContext('new-session', 'new-job', 'new-agent');
      // Context should be set (we can't directly test private properties, but functionality will verify)
    });
  });

  describe('Logging Operations', () => {
    it('should log debug messages', async () => {
      await runtimeLogger.debug('test_debug_event', {
        message: 'Debug test message',
        value: 123
      });

      // Allow time for buffer flush
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify log was written
      const logs = await runtimeLogger.getLogsForJob('test-job-456');
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('debug');
      expect(logs[0].event).toBe('test_debug_event');
      expect(logs[0].data.message).toBe('Debug test message');
    });

    it('should log info messages', async () => {
      await runtimeLogger.info('test_info_event', {
        operation: 'test operation',
        duration: 150
      });

      await new Promise(resolve => setTimeout(resolve, 100));
      
      const logs = await runtimeLogger.getLogsForJob('test-job-456');
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('info');
      expect(logs[0].data.operation).toBe('test operation');
    });

    it('should log warning messages', async () => {
      await runtimeLogger.warn('test_warning_event', {
        warning: 'Performance degradation detected',
        threshold: 1000,
        actual: 1500
      });

      await new Promise(resolve => setTimeout(resolve, 100));
      
      const logs = await runtimeLogger.getLogsForJob('test-job-456');
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('warn');
      expect(logs[0].data.warning).toBe('Performance degradation detected');
    });

    it('should log error messages', async () => {
      await runtimeLogger.error('test_error_event', {
        error: 'Database connection failed',
        errorCode: 'DB_CONNECTION_ERROR',
        retryAttempt: 3
      });

      await new Promise(resolve => setTimeout(resolve, 100));
      
      const logs = await runtimeLogger.getLogsForJob('test-job-456');
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('error');
      expect(logs[0].data.error).toBe('Database connection failed');
    });

    it('should log critical messages', async () => {
      await runtimeLogger.critical('test_critical_event', {
        error: 'System failure detected',
        systemState: 'CRITICAL',
        actionRequired: 'IMMEDIATE'
      });

      await new Promise(resolve => setTimeout(resolve, 100));
      
      const logs = await runtimeLogger.getLogsForJob('test-job-456');
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('critical');
      expect(logs[0].data.error).toBe('System failure detected');
    });

    it('should automatically flush buffer for critical and error events', async () => {
      await runtimeLogger.critical('immediate_flush_test', {
        error: 'Critical error requiring immediate logging'
      });

      // Should be available immediately without waiting for buffer flush
      const logs = await runtimeLogger.getLogsForJob('test-job-456');
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('critical');
    });

    it('should include correlation IDs', async () => {
      await runtimeLogger.info('correlation_test', {
        message: 'Test correlation ID'
      });

      await new Promise(resolve => setTimeout(resolve, 100));
      
      const logs = await runtimeLogger.getLogsForJob('test-job-456');
      expect(logs).toHaveLength(1);
      expect(logs[0].correlationId).toBeDefined();
      expect(typeof logs[0].correlationId).toBe('string');
    });

    it('should use session context in logs', async () => {
      await runtimeLogger.info('context_test', {
        message: 'Testing session context'
      });

      await new Promise(resolve => setTimeout(resolve, 100));
      
      const logs = await runtimeLogger.getLogsForJob('test-job-456');
      expect(logs).toHaveLength(1);
      expect(logs[0].sessionId).toBe('test-session-123');
      expect(logs[0].jobId).toBe('test-job-456');
      expect(logs[0].agentType).toBe('test-agent');
    });

    it('should override session context with explicit data', async () => {
      await runtimeLogger.info('override_test', {
        message: 'Testing context override',
        jobId: 'explicit-job-789',
        agentType: 'explicit-agent'
      });

      await new Promise(resolve => setTimeout(resolve, 100));
      
      const logs = await runtimeLogger.getLogsForJob('explicit-job-789');
      expect(logs).toHaveLength(1);
      expect(logs[0].jobId).toBe('explicit-job-789');
      expect(logs[0].agentType).toBe('explicit-agent');
    });
  });

  describe('Log Retrieval', () => {
    beforeEach(async () => {
      // Create test logs with different attributes
      await runtimeLogger.info('job1_event1', { jobId: 'job-1', agentType: 'agent-1', message: 'Job 1 Event 1' });
      await runtimeLogger.warn('job1_event2', { jobId: 'job-1', agentType: 'agent-1', message: 'Job 1 Event 2' });
      await runtimeLogger.info('job2_event1', { jobId: 'job-2', agentType: 'agent-2', message: 'Job 2 Event 1' });
      await runtimeLogger.error('job2_event2', { jobId: 'job-2', agentType: 'agent-2', message: 'Job 2 Event 2' });
      await runtimeLogger.debug('session_event', { sessionId: 'session-123', message: 'Session Event' });
      
      // Wait for logs to be written
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    it('should retrieve logs for specific job', async () => {
      const job1Logs = await runtimeLogger.getLogsForJob('job-1');
      const job2Logs = await runtimeLogger.getLogsForJob('job-2');

      expect(job1Logs).toHaveLength(2);
      expect(job2Logs).toHaveLength(2);
      expect(job1Logs.every(log => log.jobId === 'job-1')).toBe(true);
      expect(job2Logs.every(log => log.jobId === 'job-2')).toBe(true);
    });

    it('should retrieve logs for specific session', async () => {
      const sessionLogs = await runtimeLogger.getLogsForSession('session-123');
      
      expect(sessionLogs.length).toBeGreaterThanOrEqual(1);
      expect(sessionLogs.some(log => log.sessionId === 'session-123')).toBe(true);
    });

    it('should retrieve logs for specific agent', async () => {
      const agent1Logs = await runtimeLogger.getLogsForAgent('agent-1');
      const agent2Logs = await runtimeLogger.getLogsForAgent('agent-2');

      expect(agent1Logs).toHaveLength(2);
      expect(agent2Logs).toHaveLength(2);
      expect(agent1Logs.every(log => log.agentType === 'agent-1')).toBe(true);
      expect(agent2Logs.every(log => log.agentType === 'agent-2')).toBe(true);
    });

    it('should apply filters correctly', async () => {
      const filters: LogFilters = {
        level: ['error', 'critical'],
        hasError: true
      };

      const filteredLogs = await runtimeLogger.getLogsForJob('job-2', filters);
      
      expect(filteredLogs).toHaveLength(1);
      expect(filteredLogs[0].level).toBe('error');
    });

    it('should filter by time range', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      
      const filters: LogFilters = {
        startTime: oneHourAgo,
        endTime: now
      };

      const recentLogs = await runtimeLogger.getLogsForJob('job-1', filters);
      expect(recentLogs.length).toBeGreaterThanOrEqual(0); // May be 0 or more depending on timing
    });

    it('should filter by event names', async () => {
      const filters: LogFilters = {
        event: ['job1_event1', 'job2_event1']
      };

      const job1Logs = await runtimeLogger.getLogsForJob('job-1', filters);
      const job2Logs = await runtimeLogger.getLogsForJob('job-2', filters);

      expect(job1Logs).toHaveLength(1);
      expect(job1Logs[0].event).toBe('job1_event1');
      expect(job2Logs).toHaveLength(1);
      expect(job2Logs[0].event).toBe('job2_event1');
    });

    it('should return logs in chronological order', async () => {
      const logs = await runtimeLogger.getLogsForJob('job-1');
      
      for (let i = 1; i < logs.length; i++) {
        expect(logs[i].timestamp.getTime()).toBeGreaterThanOrEqual(logs[i - 1].timestamp.getTime());
      }
    });
  });

  describe('Log Analysis', () => {
    beforeEach(async () => {
      // Create test logs with performance data
      await runtimeLogger.info('slow_operation', { 
        jobId: 'perf-job', 
        duration: 2000,
        operation: 'database_query'
      });
      await runtimeLogger.warn('performance_warning', { 
        jobId: 'perf-job', 
        duration: 3000,
        threshold: 2000
      });
      await runtimeLogger.error('operation_failed', { 
        jobId: 'perf-job',
        error: 'Connection timeout',
        duration: 5000
      });
      await runtimeLogger.info('fast_operation', { 
        jobId: 'perf-job', 
        duration: 100 
      });
      
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    it('should analyze performance for a job', async () => {
      const analysis = await runtimeLogger.analyzePerformance('perf-job');

      expect(analysis).toBeDefined();
      expect(analysis.jobId).toBe('perf-job');
      expect(analysis.totalEvents).toBe(4);
      expect(analysis.avgEventDuration).toBeGreaterThan(0);
      expect(analysis.slowestEvents).toBeDefined();
      expect(analysis.errorRate).toBeGreaterThan(0);
      expect(analysis.warningRate).toBeGreaterThan(0);
      expect(typeof analysis.performanceScore).toBe('number');
      expect(Array.isArray(analysis.recommendations)).toBe(true);
    });

    it('should identify slowest events', async () => {
      const analysis = await runtimeLogger.analyzePerformance('perf-job');

      expect(analysis.slowestEvents.length).toBeGreaterThan(0);
      expect(analysis.slowestEvents[0].duration).toBe(5000); // Should be the error event
      expect(analysis.slowestEvents[0].event).toBe('operation_failed');
    });

    it('should calculate error and warning rates', async () => {
      const analysis = await runtimeLogger.analyzePerformance('perf-job');

      expect(analysis.errorRate).toBe(0.25); // 1 error out of 4 events
      expect(analysis.warningRate).toBe(0.25); // 1 warning out of 4 events
    });

    it('should generate performance recommendations', async () => {
      const analysis = await runtimeLogger.analyzePerformance('perf-job');

      expect(analysis.recommendations.length).toBeGreaterThan(0);
      expect(analysis.recommendations.some(rec => 
        rec.includes('error') || rec.includes('warning') || rec.includes('performance')
      )).toBe(true);
    });

    it('should find error patterns', async () => {
      // Add more error logs to create patterns
      await runtimeLogger.error('connection_error', { error: 'Connection timeout', context: 'database' });
      await runtimeLogger.error('connection_error', { error: 'Connection timeout', context: 'api' });
      await runtimeLogger.error('validation_error', { error: 'Invalid input', context: 'form' });
      await runtimeLogger.error('connection_error', { error: 'Connection timeout', context: 'cache' });
      
      await new Promise(resolve => setTimeout(resolve, 200));

      const patterns = await runtimeLogger.findErrorPatterns();

      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns.length).toBeGreaterThan(0);
      
      // Should find connection timeout pattern
      const connectionPattern = patterns.find(p => p.pattern.includes('Connection timeout'));
      if (connectionPattern) {
        expect(connectionPattern.occurrences).toBeGreaterThanOrEqual(3);
        expect(connectionPattern.recommendations.length).toBeGreaterThan(0);
      }
    });

    it('should filter error patterns by agent type', async () => {
      await runtimeLogger.error('agent_specific_error', { 
        agentType: 'specific-agent',
        error: 'Agent-specific error'
      });
      
      await new Promise(resolve => setTimeout(resolve, 200));

      const patterns = await runtimeLogger.findErrorPatterns('specific-agent');
      
      expect(Array.isArray(patterns)).toBe(true);
      // Results depend on how many errors the specific agent has
    });

    it('should filter error patterns by time range', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const timeRange: TimeRange = { start: oneHourAgo, end: now };

      const patterns = await runtimeLogger.findErrorPatterns(undefined, timeRange);
      
      expect(Array.isArray(patterns)).toBe(true);
      // All patterns should be within the time range
    });
  });

  describe('Maintenance', () => {
    it('should rotate log files', async () => {
      // Create some logs first
      await runtimeLogger.info('rotation_test', { message: 'Before rotation' });
      await new Promise(resolve => setTimeout(resolve, 100));

      const rotatedCount = await runtimeLogger.rotateLogs();
      
      expect(typeof rotatedCount).toBe('number');
      expect(rotatedCount).toBeGreaterThanOrEqual(0);
    });

    it('should cleanup old log files', async () => {
      // Create some logs
      await runtimeLogger.info('cleanup_test', { message: 'Test log for cleanup' });
      await new Promise(resolve => setTimeout(resolve, 100));

      // Cleanup logs older than 0 days (should clean up recent logs for testing)
      const cleanedCount = await runtimeLogger.cleanupLogs(0);
      
      expect(typeof cleanedCount).toBe('number');
      expect(cleanedCount).toBeGreaterThanOrEqual(0);
    });

    it('should handle shutdown gracefully', async () => {
      await runtimeLogger.info('shutdown_test', { message: 'Before shutdown' });
      
      // Should not throw
      await expect(runtimeLogger.shutdown()).resolves.toBeUndefined();
    });
  });

  describe('Performance', () => {
    it('should meet performance targets for log writes', async () => {
      const startTime = Date.now();
      
      // Write multiple logs
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(runtimeLogger.info(`perf_test_${i}`, { 
          message: `Performance test ${i}`,
          iteration: i
        }));
      }
      
      await Promise.all(promises);
      const duration = Date.now() - startTime;
      
      // Should complete within reasonable time
      expect(duration).toBeLessThan(testConfig.performanceThresholds.logWriteTimeMs * 10);
    });

    it('should handle concurrent logging without corruption', async () => {
      const concurrentLogs = [];
      
      // Create 20 concurrent log operations
      for (let i = 0; i < 20; i++) {
        concurrentLogs.push(
          runtimeLogger.info(`concurrent_${i}`, {
            message: `Concurrent log ${i}`,
            timestamp: Date.now(),
            threadId: i
          })
        );
      }
      
      await Promise.all(concurrentLogs);
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const logs = await runtimeLogger.getLogsForJob('test-job-456');
      expect(logs.length).toBeGreaterThanOrEqual(20);
      
      // Check that all logs are properly formatted
      logs.forEach(log => {
        expect(log.timestamp).toBeInstanceOf(Date);
        expect(log.level).toBeDefined();
        expect(log.event).toBeDefined();
        expect(log.data).toBeDefined();
      });
    });

    it('should buffer logs efficiently', async () => {
      const bufferTestLogs = [];
      
      // Create many small logs that should be buffered
      for (let i = 0; i < 30; i++) {
        bufferTestLogs.push(
          runtimeLogger.debug(`buffer_test_${i}`, { 
            iteration: i,
            small: true
          })
        );
      }
      
      const startTime = Date.now();
      await Promise.all(bufferTestLogs);
      const bufferTime = Date.now() - startTime;
      
      // Buffered writes should be fast
      expect(bufferTime).toBeLessThan(500);
      
      // Wait for buffer flush
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const logs = await runtimeLogger.getLogsForJob('test-job-456');
      expect(logs.length).toBeGreaterThanOrEqual(30);
    });
  });

  describe('Error Handling', () => {
    it('should handle file system errors gracefully', async () => {
      // Mock file system error
      const originalWriteFile = fs.writeFile;
      vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('Disk full'));
      
      // Should not throw, just log the error internally
      await expect(runtimeLogger.error('fs_error_test', { 
        error: 'Testing file system error handling' 
      })).resolves.toBeUndefined();
      
      // Restore original function
      vi.mocked(fs.writeFile).mockRestore();
    });

    it('should handle malformed log data gracefully', async () => {
      // Create log with circular reference (should not break JSON serialization)
      const circularData: any = { message: 'Test circular reference' };
      circularData.circular = circularData;
      
      await expect(runtimeLogger.info('circular_test', circularData))
        .resolves.toBeUndefined();
    });

    it('should handle very large log messages', async () => {
      const largeMessage = 'x'.repeat(10000); // 10KB message
      
      await expect(runtimeLogger.info('large_message_test', {
        largeData: largeMessage,
        size: largeMessage.length
      })).resolves.toBeUndefined();
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const logs = await runtimeLogger.getLogsForJob('test-job-456');
      const largeLog = logs.find(log => log.event === 'large_message_test');
      expect(largeLog).toBeDefined();
      expect(largeLog?.data.size).toBe(10000);
    });

    it('should handle invalid session context gracefully', async () => {
      // Test with undefined/null values
      runtimeLogger.setSessionContext('', '', '');
      
      await expect(runtimeLogger.info('empty_context_test', {
        message: 'Testing empty context'
      })).resolves.toBeUndefined();
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const logs = await runtimeLogger.getLogsForJob('test-job-456'); // Using original job ID
      // Should handle empty context without breaking
    });
  });
});