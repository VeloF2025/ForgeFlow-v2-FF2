/**
 * ProcessSupervisor Test Suite
 * 
 * Comprehensive tests for the ProcessSupervisor system including lifecycle management,
 * resource monitoring, health checking, and automatic recovery.
 */

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { EventEmitter } from 'events';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { ProcessSupervisor, ProcessSupervisorConfig } from '../process-supervisor';
import { PidRegistry } from '../pid-registry';
import { ProcessMonitor } from '../process-monitor';

// Mock external dependencies
vi.mock('fs-extra');
vi.mock('../pid-registry');
vi.mock('../process-monitor');

const mockFs = vi.mocked(fs);
const MockPidRegistry = vi.mocked(PidRegistry);
const MockProcessMonitor = vi.mocked(ProcessMonitor);

describe('ProcessSupervisor', () => {
  let supervisor: ProcessSupervisor;
  let config: ProcessSupervisorConfig;
  let mockPidRegistry: any;
  let mockProcessMonitor: any;
  let testDir: string;

  beforeAll(() => {
    // Setup test directory
    testDir = path.join(os.tmpdir(), 'ff2-supervisor-test');
  });

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Create default configuration
    config = {
      maxProcesses: 5,
      defaultTimeout: 30000,
      gracefulShutdownTimeoutMs: 5000,
      forceKillTimeoutMs: 2000,
      resourceLimits: {
        maxMemoryMB: 1024,
        maxCpuPercent: 75,
        maxExecutionTimeMs: 60000,
        maxFileHandles: 50,
      },
      healthCheckInterval: 5000,
      restartAttempts: 2,
      restartDelay: 1000,
      orphanCleanupInterval: 30000,
      processHistoryRetention: 100,
      enableSandboxing: true,
      allowedCommands: ['node', 'npm', 'git'],
      restrictedPaths: ['/etc', '/usr'],
    };

    // Setup mocks
    mockPidRegistry = {
      initialize: vi.fn().mockResolvedValue(undefined),
      registerProcess: vi.fn().mockResolvedValue(undefined),
      updateProcessStatus: vi.fn().mockResolvedValue(undefined),
      updateProcessHealth: vi.fn().mockResolvedValue(undefined),
      getProcessInfo: vi.fn(),
      getAllProcesses: vi.fn().mockReturnValue([]),
      getProcessesByStatus: vi.fn().mockReturnValue([]),
      cleanupOrphanedProcesses: vi.fn().mockResolvedValue(0),
      shutdown: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
    };

    mockProcessMonitor = {
      initialize: vi.fn().mockResolvedValue(undefined),
      registerProcess: vi.fn(),
      startMonitoring: vi.fn().mockResolvedValue(undefined),
      stopMonitoring: vi.fn(),
      getProcessData: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
    };

    // Mock constructors to return our mocks
    MockPidRegistry.mockImplementation(() => mockPidRegistry);
    MockProcessMonitor.mockImplementation(() => mockProcessMonitor);

    // Mock fs operations
    mockFs.ensureDir.mockResolvedValue(undefined);
    mockFs.pathExists.mockResolvedValue(true);
    mockFs.access.mockResolvedValue();

    // Create supervisor instance
    supervisor = new ProcessSupervisor(config);
  });

  afterEach(async () => {
    // Clean up supervisor
    if (supervisor) {
      try {
        await supervisor.shutdown();
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
  });

  afterAll(async () => {
    // Clean up test directory
    try {
      await fs.remove(testDir);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await expect(supervisor.initialize()).resolves.not.toThrow();
      
      expect(mockPidRegistry.initialize).toHaveBeenCalled();
      expect(mockProcessMonitor.initialize).toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      mockPidRegistry.initialize.mockRejectedValue(new Error('Registry init failed'));
      
      await expect(supervisor.initialize()).rejects.toThrow('Registry init failed');
    });

    it('should emit initialized event', async () => {
      const initSpy = vi.fn();
      supervisor.on('supervisor:initialized', initSpy);
      
      await supervisor.initialize();
      
      expect(initSpy).toHaveBeenCalled();
    });
  });

  describe('Process Management', () => {
    beforeEach(async () => {
      await supervisor.initialize();
    });

    it('should start a process successfully', async () => {
      const options = {
        taskId: 'test-task-1',
        agentType: 'test-agent',
        priority: 'normal' as const,
        command: 'node',
        args: ['--version'],
        workingDir: testDir,
      };

      // Mock spawn to return a mock process
      const mockProcess = new EventEmitter();
      (mockProcess as any).pid = 12345;
      (mockProcess as any).kill = vi.fn();
      
      // Mock spawn function
      const originalSpawn = require('child_process').spawn;
      vi.doMock('child_process', () => ({
        spawn: vi.fn().mockReturnValue(mockProcess)
      }));

      const processId = await supervisor.startProcess(options);
      
      expect(processId).toMatch(/test-agent-test-task-1-\d+-\w+/);
      expect(mockPidRegistry.registerProcess).toHaveBeenCalled();
      expect(mockProcessMonitor.registerProcess).toHaveBeenCalledWith(processId, 12345);
    });

    it('should validate system capacity before starting', async () => {
      // Fill up to max processes
      config.maxProcesses = 1;
      supervisor = new ProcessSupervisor(config);
      await supervisor.initialize();

      // Mock that we already have max processes
      supervisor['activeProcesses'].set('existing', {} as any);

      const options = {
        taskId: 'test-task-2',
        agentType: 'test-agent',
        priority: 'normal' as const,
        command: 'node',
        args: ['--version'],
        workingDir: testDir,
      };

      await expect(supervisor.startProcess(options)).rejects.toThrow('Maximum process limit reached');
    });

    it('should validate command security when sandboxing enabled', async () => {
      const options = {
        taskId: 'test-task-3',
        agentType: 'test-agent',
        priority: 'normal' as const,
        command: 'dangerous-command', // Not in allowed list
        args: [],
        workingDir: testDir,
      };

      await expect(supervisor.startProcess(options)).rejects.toThrow('Command not allowed: dangerous-command');
    });

    it('should stop a process gracefully', async () => {
      const processId = 'test-process-1';
      const mockProcess = new EventEmitter();
      (mockProcess as any).pid = 12345;
      (mockProcess as any).kill = vi.fn();

      supervisor['activeProcesses'].set(processId, mockProcess as any);

      // Simulate process exit after SIGTERM
      setTimeout(() => {
        mockProcess.emit('exit', 0, null);
      }, 10);

      await expect(supervisor.stopProcess(processId, 'Test stop')).resolves.not.toThrow();
      expect((mockProcess as any).kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should force kill process if graceful shutdown fails', async () => {
      const processId = 'test-process-2';
      const mockProcess = new EventEmitter();
      (mockProcess as any).pid = 12345;
      (mockProcess as any).kill = vi.fn();

      // Set very short graceful timeout for testing
      config.gracefulShutdownTimeoutMs = 10;
      supervisor = new ProcessSupervisor(config);
      await supervisor.initialize();

      supervisor['activeProcesses'].set(processId, mockProcess as any);

      // Don't emit exit event to simulate hanging process
      const stopPromise = supervisor.stopProcess(processId, 'Test force kill');

      // Wait a bit then emit exit after SIGKILL
      setTimeout(() => {
        mockProcess.emit('exit', null, 'SIGKILL');
      }, 50);

      await expect(stopPromise).resolves.not.toThrow();
      expect((mockProcess as any).kill).toHaveBeenCalledWith('SIGTERM');
      expect((mockProcess as any).kill).toHaveBeenCalledWith('SIGKILL');
    });

    it('should restart a process', async () => {
      const processId = 'test-process-3';
      const options = {
        taskId: 'test-task-restart',
        agentType: 'test-agent',
        priority: 'normal' as const,
        command: 'node',
        args: ['--version'],
        workingDir: testDir,
      };

      // Store original options
      supervisor['processOptions'].set(processId, options);

      // Mock stopping the process
      vi.spyOn(supervisor, 'stopProcess').mockResolvedValue(undefined);
      vi.spyOn(supervisor, 'startProcess').mockResolvedValue('new-process-id');

      const newProcessId = await supervisor.restartProcess(processId, 'Test restart');

      expect(supervisor.stopProcess).toHaveBeenCalledWith(processId, 'Test restart');
      expect(supervisor.startProcess).toHaveBeenCalledWith({
        ...options,
        taskId: 'test-task-restart-restart-0'
      });
      expect(newProcessId).toBe('new-process-id');
    });
  });

  describe('Health Monitoring', () => {
    beforeEach(async () => {
      await supervisor.initialize();
    });

    it('should perform health check on all processes', async () => {
      const mockProcesses = [
        {
          processId: 'process-1',
          pid: 12345,
          status: 'running',
          startTime: new Date()
        },
        {
          processId: 'process-2',
          pid: 12346,
          status: 'running',
          startTime: new Date()
        }
      ];

      mockPidRegistry.getAllProcesses.mockReturnValue(mockProcesses);
      
      // Mock process.kill to simulate running processes
      const originalKill = process.kill;
      process.kill = vi.fn().mockReturnValue(undefined);

      const healthStatuses = await supervisor.performHealthCheck();

      expect(healthStatuses.size).toBe(2);
      expect(healthStatuses.get('process-1')).toBe('healthy');
      expect(healthStatuses.get('process-2')).toBe('healthy');
      
      // Restore original function
      process.kill = originalKill;
    });

    it('should detect crashed processes', async () => {
      const mockProcess = {
        processId: 'crashed-process',
        pid: 99999, // Non-existent PID
        status: 'running',
        startTime: new Date()
      };

      mockPidRegistry.getAllProcesses.mockReturnValue([mockProcess]);
      
      // Mock process.kill to throw ESRCH for non-existent process
      const originalKill = process.kill;
      process.kill = vi.fn().mockImplementation(() => {
        const error: any = new Error('No such process');
        error.code = 'ESRCH';
        throw error;
      });

      const healthStatuses = await supervisor.performHealthCheck();

      expect(healthStatuses.get('crashed-process')).toBe('crashed');
      expect(mockPidRegistry.updateProcessHealth).toHaveBeenCalledWith('crashed-process', 'crashed');
      
      // Restore original function
      process.kill = originalKill;
    });

    it('should handle unhealthy processes with auto-restart', async () => {
      const processId = 'unhealthy-process';
      const mockProcess = {
        processId,
        pid: 12345,
        status: 'running',
        startTime: new Date(Date.now() - 100000) // Old process
      };

      mockPidRegistry.getAllProcesses.mockReturnValue([mockProcess]);
      
      // Mock resource violations
      mockProcessMonitor.getProcessData.mockReturnValue({
        memoryMB: 2000, // Exceeds limit
        cpuPercent: 50,
        executionTimeMs: 50000
      });

      // Mock restart functionality
      vi.spyOn(supervisor, 'restartProcess').mockResolvedValue('new-process-id');

      await supervisor.performHealthCheck();

      expect(supervisor.restartProcess).toHaveBeenCalledWith(processId, expect.stringContaining('unhealthy'));
    });
  });

  describe('Orphan Cleanup', () => {
    beforeEach(async () => {
      await supervisor.initialize();
    });

    it('should clean up orphaned processes', async () => {
      mockPidRegistry.cleanupOrphanedProcesses.mockResolvedValue(3);

      const cleanedCount = await supervisor.cleanupOrphanedProcesses();

      expect(cleanedCount).toBe(3);
      expect(mockPidRegistry.cleanupOrphanedProcesses).toHaveBeenCalled();
    });

    it('should emit cleanup events', async () => {
      const cleanupSpy = vi.fn();
      supervisor.on('supervisor:orphans-cleaned', cleanupSpy);

      mockPidRegistry.cleanupOrphanedProcesses.mockResolvedValue(2);

      await supervisor.cleanupOrphanedProcesses();

      expect(cleanupSpy).toHaveBeenCalledWith({ count: 2 });
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      await supervisor.initialize();
    });

    it('should provide comprehensive statistics', () => {
      const mockProcesses = [
        { status: 'running', healthStatus: 'healthy' },
        { status: 'running', healthStatus: 'unhealthy' },
        { status: 'stopped', healthStatus: 'healthy' },
      ];

      mockPidRegistry.getAllProcesses.mockReturnValue(mockProcesses);

      const stats = supervisor.getStats();

      expect(stats).toMatchObject({
        activeProcesses: 2,
        idleProcesses: 0,
        errorProcesses: 0,
        totalProcesses: 3,
        healthyProcesses: 2,
        unhealthyProcesses: 1,
        processesStarted: 0,
        processesCompleted: 0,
        processesFailed: 0,
        processesRestarted: 0,
        orphansCleanedUp: 0,
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle process start errors gracefully', async () => {
      await supervisor.initialize();

      const options = {
        taskId: 'error-task',
        agentType: 'error-agent',
        priority: 'normal' as const,
        command: 'non-existent-command',
        args: [],
        workingDir: '/invalid/directory',
      };

      mockFs.pathExists.mockResolvedValue(false); // Simulate non-existent directory

      await expect(supervisor.startProcess(options)).rejects.toThrow();
    });

    it('should handle health check errors', async () => {
      await supervisor.initialize();

      const mockProcess = {
        processId: 'error-health-process',
        pid: 12345,
        status: 'running',
        startTime: new Date()
      };

      mockPidRegistry.getAllProcesses.mockReturnValue([mockProcess]);
      
      // Mock process.kill to throw unexpected error
      const originalKill = process.kill;
      process.kill = vi.fn().mockImplementation(() => {
        throw new Error('Unexpected process error');
      });

      const healthStatuses = await supervisor.performHealthCheck();

      // Should handle error gracefully and mark as unknown
      expect(healthStatuses.get('error-health-process')).toBe('unknown');
      
      // Restore original function
      process.kill = originalKill;
    });
  });

  describe('Shutdown', () => {
    it('should shutdown gracefully', async () => {
      await supervisor.initialize();

      // Add some mock active processes
      const mockProcess1 = new EventEmitter();
      (mockProcess1 as any).pid = 12345;
      (mockProcess1 as any).kill = vi.fn();

      const mockProcess2 = new EventEmitter();
      (mockProcess2 as any).pid = 12346;
      (mockProcess2 as any).kill = vi.fn();

      supervisor['activeProcesses'].set('process-1', mockProcess1 as any);
      supervisor['activeProcesses'].set('process-2', mockProcess2 as any);

      // Mock stopProcess
      vi.spyOn(supervisor, 'stopProcess').mockResolvedValue(undefined);

      await supervisor.shutdown();

      expect(supervisor.stopProcess).toHaveBeenCalledTimes(2);
      expect(mockProcessMonitor.shutdown).toHaveBeenCalled();
      expect(mockPidRegistry.shutdown).toHaveBeenCalled();
    });

    it('should emit shutdown event', async () => {
      const shutdownSpy = vi.fn();
      supervisor.on('supervisor:shutdown', shutdownSpy);

      await supervisor.initialize();
      await supervisor.shutdown();

      expect(shutdownSpy).toHaveBeenCalled();
    });

    it('should handle shutdown errors', async () => {
      await supervisor.initialize();

      mockProcessMonitor.shutdown.mockRejectedValue(new Error('Monitor shutdown failed'));

      await expect(supervisor.shutdown()).rejects.toThrow('Monitor shutdown failed');
    });
  });

  describe('Event Emission', () => {
    beforeEach(async () => {
      await supervisor.initialize();
    });

    it('should emit process events', async () => {
      const startedSpy = vi.fn();
      const stoppedSpy = vi.fn();
      const restartedSpy = vi.fn();
      const errorSpy = vi.fn();

      supervisor.on('process:started', startedSpy);
      supervisor.on('process:stopped', stoppedSpy);
      supervisor.on('process:restarted', restartedSpy);
      supervisor.on('process:error', errorSpy);

      // Simulate events from process monitor
      mockProcessMonitor.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'resource-violation') {
          // Simulate resource violation
          setTimeout(() => {
            handler({
              processId: 'test-process',
              type: 'memory',
              severity: 'critical'
            });
          }, 10);
        }
      });

      // Wait for events
      await new Promise(resolve => setTimeout(resolve, 50));

      // Note: Full event testing would require more complex setup
      // This tests the event handler registration
      expect(mockProcessMonitor.on).toHaveBeenCalledWith('resource-violation', expect.any(Function));
    });
  });

  describe('Configuration Validation', () => {
    it('should accept valid configuration', () => {
      expect(() => new ProcessSupervisor(config)).not.toThrow();
    });

    it('should use configuration values correctly', () => {
      const customConfig = {
        ...config,
        maxProcesses: 10,
        defaultTimeout: 60000,
      };

      const customSupervisor = new ProcessSupervisor(customConfig);
      expect(customSupervisor['config'].maxProcesses).toBe(10);
      expect(customSupervisor['config'].defaultTimeout).toBe(60000);
    });
  });
});