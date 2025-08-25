/**
 * Comprehensive tests for Recovery Actions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RecoveryActionManager,
  GitCleanupAction,
  GitHubRateLimitWaitAction,
  NetworkConnectivityAction,
  FilePermissionRecoveryAction,
  AgentStateResetAction,
  ServiceHealthCheckAction,
  RecoveryContext,
  RecoveryActionConfig,
  RecoveryAction
} from '../recovery-actions';
import { execAsync } from 'child_process';
import * as fs from 'fs-extra';

// Mock dependencies
vi.mock('child_process', async () => {
  const actual = await vi.importActual('child_process');
  return {
    ...actual,
    exec: vi.fn(),
    execSync: vi.fn()
  };
});

vi.mock('fs-extra', () => ({
  pathExists: vi.fn(),
  stat: vi.fn(),
  chmod: vi.fn(),
  readdir: vi.fn()
}));

vi.mock('../../utils/enhanced-logger', () => ({
  enhancedLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

const mockExec = vi.fn();
const mockExecSync = vi.fn();
const mockFs = fs as any;

// Mock promisify to return our mock exec function
vi.mock('util', () => ({
  promisify: vi.fn((fn) => {
    if (fn === require('child_process').exec) {
      return mockExec;
    }
    return fn;
  })
}));

describe('Recovery Actions', () => {
  let mockContext: RecoveryContext;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockContext = {
      operationName: 'test-operation',
      error: new Error('Test error'),
      attempt: 1,
      totalAttempts: 3,
      metadata: {},
      workingDirectory: '/test/dir',
      environment: {}
    };

    // Setup fs mocks
    mockFs.pathExists.mockResolvedValue(true);
    mockFs.stat.mockResolvedValue({ isFile: () => false, isDirectory: () => true });
    mockFs.chmod.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([]);
  });

  describe('GitCleanupAction', () => {
    let action: GitCleanupAction;

    beforeEach(() => {
      action = new GitCleanupAction();
      mockExec.mockResolvedValue({ stdout: '', stderr: '' });
    });

    it('should identify git-related errors', () => {
      const gitError = new Error('index.lock File exists');
      expect(action.canHandle(gitError, mockContext)).toBe(true);

      const conflictError = new Error('merge conflict detected');
      expect(action.canHandle(conflictError, mockContext)).toBe(true);

      const gitContextError = new Error('some error');
      const gitContext = { ...mockContext, operationName: 'git-commit' };
      expect(action.canHandle(gitContextError, gitContext)).toBe(true);
    });

    it('should not handle non-git errors', () => {
      const networkError = new Error('network timeout');
      const nonGitContext = { ...mockContext, operationName: 'http-request' };
      expect(action.canHandle(networkError, nonGitContext)).toBe(false);
    });

    it('should execute git cleanup successfully', async () => {
      const config: RecoveryActionConfig = {
        actionType: 'git-cleanup',
        parameters: {
          resetHard: true,
          cleanUntracked: true
        }
      };

      mockExec.mockImplementation((cmd: string) => {
        if (cmd.includes('find')) return Promise.resolve({ stdout: '', stderr: '' });
        if (cmd.includes('git reset')) return Promise.resolve({ stdout: '', stderr: '' });
        if (cmd.includes('git clean')) return Promise.resolve({ stdout: '', stderr: '' });
        if (cmd.includes('git merge --abort')) return Promise.resolve({ stdout: '', stderr: '' });
        if (cmd.includes('git rebase --abort')) return Promise.resolve({ stdout: '', stderr: '' });
        if (cmd.includes('git status --porcelain')) return Promise.resolve({ stdout: '', stderr: '' });
        return Promise.reject(new Error('Unexpected command'));
      });

      const result = await action.execute(config, mockContext);

      expect(result.success).toBe(true);
      expect(result.actionType).toBe('git-cleanup');
      expect(result.sideEffects).toBeDefined();
      expect(result.sideEffects!.length).toBeGreaterThan(0);
    });

    it('should handle git cleanup failure', async () => {
      const config: RecoveryActionConfig = {
        actionType: 'git-cleanup',
        parameters: {}
      };

      mockExec.mockRejectedValue(new Error('git command failed'));

      const result = await action.execute(config, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should respect configuration parameters', async () => {
      const config: RecoveryActionConfig = {
        actionType: 'git-cleanup',
        parameters: {
          resetHard: false,
          cleanUntracked: false
        }
      };

      mockExec.mockResolvedValue({ stdout: '', stderr: '' });

      const result = await action.execute(config, mockContext);

      expect(result.success).toBe(true);
      // Should have fewer side effects when not doing hard reset or clean
    });
  });

  describe('GitHubRateLimitWaitAction', () => {
    let action: GitHubRateLimitWaitAction;

    beforeEach(() => {
      action = new GitHubRateLimitWaitAction();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should identify rate limit errors', () => {
      const rateLimitError = new Error('API rate limit exceeded');
      expect(action.canHandle(rateLimitError, mockContext)).toBe(true);

      const githubError = new Error('GitHub API returned 403');
      expect(action.canHandle(githubError, mockContext)).toBe(true);

      const githubContext = { ...mockContext, operationName: 'github-api-call' };
      const someError = new Error('some error');
      expect(action.canHandle(someError, githubContext)).toBe(true);
    });

    it('should wait for rate limit reset with headers', async () => {
      const config: RecoveryActionConfig = {
        actionType: 'github-rate-limit-wait',
        parameters: {
          respectHeaders: true,
          maxWaitTime: 300000
        }
      };

      const contextWithHeaders = {
        ...mockContext,
        metadata: {
          rateLimitHeaders: {
            'x-ratelimit-reset': Math.floor((Date.now() + 5000) / 1000).toString()
          }
        }
      };

      const executePromise = action.execute(config, contextWithHeaders);
      
      // Fast forward time
      vi.advanceTimersByTime(5000);
      
      const result = await executePromise;

      expect(result.success).toBe(true);
      expect(result.message).toContain('Waited');
    });

    it('should extract wait time from error message', async () => {
      const config: RecoveryActionConfig = {
        actionType: 'github-rate-limit-wait',
        parameters: {
          respectHeaders: false
        }
      };

      const errorContext = {
        ...mockContext,
        error: new Error('Rate limit exceeded. Try again in 30 seconds.')
      };

      const executePromise = action.execute(config, errorContext);
      
      // Fast forward time
      vi.advanceTimersByTime(30000);
      
      const result = await executePromise;

      expect(result.success).toBe(true);
    });

    it('should respect maximum wait time', async () => {
      const config: RecoveryActionConfig = {
        actionType: 'github-rate-limit-wait',
        parameters: {
          respectHeaders: true,
          maxWaitTime: 10000
        }
      };

      const contextWithLongWait = {
        ...mockContext,
        metadata: {
          rateLimitHeaders: {
            'x-ratelimit-reset': Math.floor((Date.now() + 300000) / 1000).toString() // 5 minutes
          }
        }
      };

      const executePromise = action.execute(config, contextWithLongWait);
      
      // Should only wait for maxWaitTime
      vi.advanceTimersByTime(10000);
      
      const result = await executePromise;

      expect(result.success).toBe(true);
      expect(result.message).toContain('10'); // Should mention 10 seconds wait
    });
  });

  describe('NetworkConnectivityAction', () => {
    let action: NetworkConnectivityAction;

    beforeEach(() => {
      action = new NetworkConnectivityAction();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should identify network errors', () => {
      const networkError = new Error('ENOTFOUND api.github.com');
      expect(action.canHandle(networkError, mockContext)).toBe(true);

      const connectionError = new Error('ECONNREFUSED');
      expect(action.canHandle(connectionError, mockContext)).toBe(true);

      const timeoutError = new Error('request timeout');
      expect(action.canHandle(timeoutError, mockContext)).toBe(true);
    });

    it('should wait for connectivity restoration', async () => {
      const config: RecoveryActionConfig = {
        actionType: 'network-connectivity-check',
        parameters: {
          timeout: 10000,
          testHosts: ['https://google.com']
        }
      };

      // Mock successful connectivity test
      const originalRequest = require('https').request;
      const mockRequest = vi.fn().mockImplementation((url, options, callback) => {
        // Simulate successful connection after a delay
        setTimeout(() => callback({ statusCode: 200 }), 100);
        return {
          on: vi.fn(),
          end: vi.fn()
        };
      });
      
      require('https').request = mockRequest;

      const executePromise = action.execute(config, mockContext);
      
      // Fast forward to allow connectivity test
      vi.advanceTimersByTime(1000);
      
      const result = await executePromise;

      expect(result.success).toBe(true);
      expect(result.message).toContain('connectivity restored');

      // Restore original
      require('https').request = originalRequest;
    });
  });

  describe('FilePermissionRecoveryAction', () => {
    let action: FilePermissionRecoveryAction;

    beforeEach(() => {
      action = new FilePermissionRecoveryAction();
    });

    it('should identify permission errors', () => {
      const permissionError = new Error('EACCES: permission denied');
      expect(action.canHandle(permissionError, mockContext)).toBe(true);

      const epermError = new Error('EPERM: operation not permitted');
      expect(action.canHandle(epermError, mockContext)).toBe(true);

      const accessDeniedError = new Error('access denied');
      expect(action.canHandle(accessDeniedError, mockContext)).toBe(true);
    });

    it('should fix file permissions', async () => {
      const config: RecoveryActionConfig = {
        actionType: 'file-permission-recovery',
        parameters: {
          targetPath: '/test/file.txt'
        }
      };

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.stat.mockResolvedValue({ isFile: () => true, isDirectory: () => false });
      mockFs.chmod.mockResolvedValue(undefined);

      const result = await action.execute(config, mockContext);

      expect(result.success).toBe(true);
      expect(mockFs.chmod).toHaveBeenCalledWith('/test/file.txt', 0o644);
    });

    it('should fix directory permissions recursively', async () => {
      const config: RecoveryActionConfig = {
        actionType: 'file-permission-recovery',
        parameters: {
          targetPath: '/test/dir'
        }
      };

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.stat.mockImplementation((path) => {
        if (path === '/test/dir') {
          return Promise.resolve({ isFile: () => false, isDirectory: () => true });
        }
        return Promise.resolve({ isFile: () => true, isDirectory: () => false });
      });
      mockFs.readdir.mockResolvedValue(['file1.txt', 'file2.txt']);
      mockFs.chmod.mockResolvedValue(undefined);

      const result = await action.execute(config, mockContext);

      expect(result.success).toBe(true);
      expect(mockFs.chmod).toHaveBeenCalledTimes(3); // Directory + 2 files
    });

    it('should handle non-existent path', async () => {
      const config: RecoveryActionConfig = {
        actionType: 'file-permission-recovery',
        parameters: {
          targetPath: '/non/existent/path'
        }
      };

      mockFs.pathExists.mockResolvedValue(false);

      const result = await action.execute(config, mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('AgentStateResetAction', () => {
    let action: AgentStateResetAction;

    beforeEach(() => {
      action = new AgentStateResetAction();
    });

    it('should identify agent-related errors', () => {
      const agentError = new Error('agent execution failed');
      expect(action.canHandle(agentError, mockContext)).toBe(true);

      const agentContext = { ...mockContext, operationName: 'agent-strategic-planner' };
      const someError = new Error('some error');
      expect(action.canHandle(someError, agentContext)).toBe(true);

      const agentMetadataContext = { 
        ...mockContext, 
        metadata: { agentId: 'test-agent' } 
      };
      expect(action.canHandle(someError, agentMetadataContext)).toBe(true);
    });

    it('should reset agent state with context preservation', async () => {
      const config: RecoveryActionConfig = {
        actionType: 'agent-state-reset',
        parameters: {
          preserveContext: true
        }
      };

      const agentContext = {
        ...mockContext,
        metadata: { agentId: 'strategic-planner' }
      };

      const result = await action.execute(config, agentContext);

      expect(result.success).toBe(true);
      expect(result.message).toContain('strategic-planner');
      expect(result.sideEffects).toBeDefined();
      expect(result.sideEffects!.some(effect => effect.includes('Preserved'))).toBe(true);
    });

    it('should reset agent state without context preservation', async () => {
      const config: RecoveryActionConfig = {
        actionType: 'agent-state-reset',
        parameters: {
          preserveContext: false
        }
      };

      const result = await action.execute(config, mockContext);

      expect(result.success).toBe(true);
      expect(result.sideEffects).toBeDefined();
    });
  });

  describe('ServiceHealthCheckAction', () => {
    let action: ServiceHealthCheckAction;

    beforeEach(() => {
      action = new ServiceHealthCheckAction();
    });

    it('should identify service-related errors', () => {
      const serviceError = new Error('service unavailable');
      expect(action.canHandle(serviceError, mockContext)).toBe(true);

      const apiError = new Error('API endpoint not responding');
      expect(action.canHandle(apiError, mockContext)).toBe(true);

      const serviceContext = { ...mockContext, operationName: 'service-health-check' };
      const someError = new Error('some error');
      expect(action.canHandle(someError, serviceContext)).toBe(true);
    });

    it('should perform health checks on endpoints', async () => {
      const config: RecoveryActionConfig = {
        actionType: 'service-health-check',
        parameters: {
          healthEndpoints: ['https://api.service1.com', 'https://api.service2.com']
        }
      };

      // Mock successful health checks
      const originalRequest = require('https').request;
      const mockRequest = vi.fn().mockImplementation((url, options, callback) => {
        callback({ statusCode: 200 });
        return {
          on: vi.fn(),
          end: vi.fn()
        };
      });
      
      require('https').request = mockRequest;

      const result = await action.execute(config, mockContext);

      expect(result.success).toBe(true);
      expect(result.message).toContain('OK');

      // Restore original
      require('https').request = originalRequest;
    });

    it('should handle failed health checks', async () => {
      const config: RecoveryActionConfig = {
        actionType: 'service-health-check',
        parameters: {
          healthEndpoints: ['https://failing.service.com']
        }
      };

      // Mock failed health check
      const originalRequest = require('https').request;
      const mockRequest = vi.fn().mockImplementation((url, options, callback) => {
        callback({ statusCode: 500 });
        return {
          on: vi.fn(),
          end: vi.fn()
        };
      });
      
      require('https').request = mockRequest;

      const result = await action.execute(config, mockContext);

      expect(result.success).toBe(false);
      expect(result.message).toContain('FAILED');

      // Restore original
      require('https').request = originalRequest;
    });
  });

  describe('RecoveryActionManager', () => {
    let manager: RecoveryActionManager;

    beforeEach(() => {
      manager = new RecoveryActionManager();
    });

    describe('Action Registration', () => {
      it('should register built-in actions on construction', () => {
        const actions = manager.getAvailableActions();
        
        expect(actions.length).toBeGreaterThan(0);
        expect(actions.some(a => a.actionType === 'git-cleanup')).toBe(true);
        expect(actions.some(a => a.actionType === 'github-rate-limit-wait')).toBe(true);
        expect(actions.some(a => a.actionType === 'network-connectivity-check')).toBe(true);
      });

      it('should register custom action', () => {
        const customAction: RecoveryAction = {
          actionType: 'custom-test-action',
          description: 'A custom test action',
          estimatedDuration: 1000,
          riskLevel: 'low',
          canHandle: () => true,
          execute: async () => ({
            success: true,
            actionType: 'custom-test-action',
            duration: 1000,
            message: 'Custom action executed'
          })
        };

        manager.registerAction(customAction);

        const actions = manager.getAvailableActions();
        expect(actions.some(a => a.actionType === 'custom-test-action')).toBe(true);
      });
    });

    describe('Action Execution', () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('should execute recovery actions in priority order', async () => {
        const actionConfigs: RecoveryActionConfig[] = [
          {
            actionType: 'git-cleanup',
            parameters: { resetHard: false },
            priority: 5
          },
          {
            actionType: 'network-connectivity-check',
            parameters: { timeout: 1000 },
            priority: 10
          }
        ];

        const gitError = new Error('git lock file exists');
        const context = { ...mockContext, error: gitError };

        mockExec.mockResolvedValue({ stdout: '', stderr: '' });

        const results = await manager.executeRecoveryActions(actionConfigs, context);

        expect(results).toHaveLength(2);
        // Higher priority action should be executed first
        expect(results[0].actionType).toBe('network-connectivity-check');
        expect(results[1].actionType).toBe('git-cleanup');
      });

      it('should skip actions that cannot handle the error', async () => {
        const actionConfigs: RecoveryActionConfig[] = [
          {
            actionType: 'github-rate-limit-wait',
            parameters: {}
          }
        ];

        const networkError = new Error('network timeout');
        const context = { ...mockContext, error: networkError };

        const results = await manager.executeRecoveryActions(actionConfigs, context);

        expect(results).toHaveLength(1);
        expect(results[0].success).toBe(false);
        expect(results[0].message).toContain('cannot handle');
      });

      it('should handle action execution errors gracefully', async () => {
        // Register a failing action
        const failingAction: RecoveryAction = {
          actionType: 'failing-action',
          description: 'An action that fails',
          estimatedDuration: 1000,
          riskLevel: 'low',
          canHandle: () => true,
          execute: async () => {
            throw new Error('Action execution failed');
          }
        };

        manager.registerAction(failingAction);

        const actionConfigs: RecoveryActionConfig[] = [
          {
            actionType: 'failing-action',
            parameters: {}
          }
        ];

        const results = await manager.executeRecoveryActions(actionConfigs, mockContext);

        expect(results).toHaveLength(1);
        expect(results[0].success).toBe(false);
        expect(results[0].error).toBeDefined();
      });

      it('should retry failed actions when configured', async () => {
        let attemptCount = 0;
        const retryAction: RecoveryAction = {
          actionType: 'retry-test-action',
          description: 'An action that succeeds on retry',
          estimatedDuration: 1000,
          riskLevel: 'low',
          canHandle: () => true,
          execute: async () => {
            attemptCount++;
            if (attemptCount < 3) {
              throw new Error('Temporary failure');
            }
            return {
              success: true,
              actionType: 'retry-test-action',
              duration: 1000,
              message: 'Succeeded on retry'
            };
          }
        };

        manager.registerAction(retryAction);

        const actionConfigs: RecoveryActionConfig[] = [
          {
            actionType: 'retry-test-action',
            parameters: {},
            maxRetries: 3
          }
        ];

        const executePromise = manager.executeRecoveryActions(actionConfigs, mockContext);
        
        // Fast forward time for retry delays
        vi.advanceTimersByTime(10000);
        
        const results = await executePromise;

        expect(results).toHaveLength(1);
        expect(results[0].success).toBe(true);
        expect(attemptCount).toBe(3);
      });

      it('should check prerequisites before execution', async () => {
        const prerequisiteAction: RecoveryAction = {
          actionType: 'prerequisite-action',
          description: 'A prerequisite action',
          estimatedDuration: 500,
          riskLevel: 'low',
          canHandle: () => true,
          execute: async () => ({
            success: true,
            actionType: 'prerequisite-action',
            duration: 500,
            message: 'Prerequisite completed'
          })
        };

        const dependentAction: RecoveryAction = {
          actionType: 'dependent-action',
          description: 'An action with prerequisites',
          estimatedDuration: 1000,
          riskLevel: 'low',
          canHandle: () => true,
          execute: async () => ({
            success: true,
            actionType: 'dependent-action',
            duration: 1000,
            message: 'Dependent action completed'
          })
        };

        manager.registerAction(prerequisiteAction);
        manager.registerAction(dependentAction);

        const actionConfigs: RecoveryActionConfig[] = [
          {
            actionType: 'prerequisite-action',
            parameters: {},
            priority: 10
          },
          {
            actionType: 'dependent-action',
            parameters: {},
            prerequisiteActions: ['prerequisite-action'],
            priority: 5
          }
        ];

        const results = await manager.executeRecoveryActions(actionConfigs, mockContext);

        expect(results).toHaveLength(2);
        expect(results[0].actionType).toBe('prerequisite-action');
        expect(results[1].actionType).toBe('dependent-action');
        expect(results[1].success).toBe(true);
      });

      it('should skip action when prerequisites fail', async () => {
        const failingPrerequisite: RecoveryAction = {
          actionType: 'failing-prerequisite',
          description: 'A failing prerequisite',
          estimatedDuration: 500,
          riskLevel: 'low',
          canHandle: () => true,
          execute: async () => ({
            success: false,
            actionType: 'failing-prerequisite',
            duration: 500,
            message: 'Prerequisite failed'
          })
        };

        const dependentAction: RecoveryAction = {
          actionType: 'dependent-action-2',
          description: 'An action with failing prerequisites',
          estimatedDuration: 1000,
          riskLevel: 'low',
          canHandle: () => true,
          execute: async () => ({
            success: true,
            actionType: 'dependent-action-2',
            duration: 1000,
            message: 'Should not execute'
          })
        };

        manager.registerAction(failingPrerequisite);
        manager.registerAction(dependentAction);

        const actionConfigs: RecoveryActionConfig[] = [
          {
            actionType: 'failing-prerequisite',
            parameters: {},
            priority: 10
          },
          {
            actionType: 'dependent-action-2',
            parameters: {},
            prerequisiteActions: ['failing-prerequisite'],
            priority: 5
          }
        ];

        const results = await manager.executeRecoveryActions(actionConfigs, mockContext);

        expect(results).toHaveLength(2);
        expect(results[0].success).toBe(false);
        expect(results[1].success).toBe(false);
        expect(results[1].message).toContain('Prerequisites not met');
      });
    });

    describe('Recommendations', () => {
      it('should recommend actions for specific errors', () => {
        const gitError = new Error('git lock file exists');
        const gitContext = { ...mockContext, error: gitError };

        const recommendations = manager.getRecommendedActions(gitError, gitContext);

        expect(recommendations.length).toBeGreaterThan(0);
        expect(recommendations.some(r => r.actionType === 'git-cleanup')).toBe(true);
      });

      it('should prioritize recommendations correctly', () => {
        const networkError = new Error('ENOTFOUND api.github.com');
        const networkContext = { ...mockContext, error: networkError };

        const recommendations = manager.getRecommendedActions(networkError, networkContext);

        expect(recommendations.length).toBeGreaterThan(0);
        // Should be sorted by priority (highest first)
        for (let i = 1; i < recommendations.length; i++) {
          expect(recommendations[i-1].priority! >= recommendations[i].priority!).toBe(true);
        }
      });
    });

    describe('Metrics and Monitoring', () => {
      it('should track action execution metrics', async () => {
        const actionConfig: RecoveryActionConfig = {
          actionType: 'git-cleanup',
          parameters: { resetHard: false }
        };

        const gitError = new Error('git conflict');
        const context = { ...mockContext, error: gitError };

        mockExec.mockResolvedValue({ stdout: '', stderr: '' });

        await manager.executeRecoveryActions([actionConfig], context);

        const metrics = manager.getActionMetrics('git-cleanup');
        expect(metrics).toBeDefined();
        expect(typeof metrics).toBe('object');
      });

      it('should provide execution history', async () => {
        const actionConfig: RecoveryActionConfig = {
          actionType: 'agent-state-reset',
          parameters: { preserveContext: true }
        };

        await manager.executeRecoveryActions([actionConfig], mockContext);

        const history = manager.getExecutionHistory('test-operation');
        expect(history['test-operation']).toBeDefined();
        expect(history['test-operation'].length).toBeGreaterThan(0);
      });

      it('should reset metrics', () => {
        manager.resetMetrics();
        
        const allMetrics = manager.getActionMetrics();
        expect(Object.keys(allMetrics)).toHaveLength(0);
        
        const allHistory = manager.getExecutionHistory();
        expect(Object.keys(allHistory)).toHaveLength(0);
      });
    });

    describe('Configuration Validation', () => {
      it('should validate action configuration', () => {
        const validConfig: RecoveryActionConfig = {
          actionType: 'git-cleanup',
          parameters: {},
          priority: 5,
          timeout: 30000,
          maxRetries: 2
        };

        const errors = manager.validateActionConfig(validConfig);
        expect(errors).toHaveLength(0);
      });

      it('should detect configuration errors', () => {
        const invalidConfig: RecoveryActionConfig = {
          actionType: '', // Missing action type
          parameters: {},
          priority: 15, // Invalid priority
          timeout: 500, // Too short
          maxRetries: -1 // Invalid retries
        };

        const errors = manager.validateActionConfig(invalidConfig);
        expect(errors.length).toBeGreaterThan(0);
      });
    });
  });
});