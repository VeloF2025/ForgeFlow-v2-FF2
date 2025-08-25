/**
 * Comprehensive Test Suite for Error Handling and Validation System
 * Tests all error handling components with extensive coverage
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ForgeFlowError,
  ErrorCategory,
  ErrorSeverity,
  ValidationError,
  ConfigurationError,
  GitHubIntegrationError,
  AgentExecutionError,
  WorktreeError,
  SecurityError,
  ResourceExhaustedError,
  ErrorHandler,
  ValidationUtils,
  withErrorHandling,
  DEFAULT_RECOVERY_STRATEGIES,
  GitHubApiErrorHandler,
  GitOperationErrorHandler,
  FileSystemErrorHandler,
  AgentExecutionErrorHandler,
  SystemStateManager
} from '../../../src/utils/errors';

describe('ForgeFlowError', () => {
  it('should create error with all properties', () => {
    const error = new ForgeFlowError({
      code: 'TEST_ERROR',
      message: 'Test error message',
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.HIGH,
      context: { testKey: 'testValue' },
      recoverable: true,
      userMessage: 'User friendly message'
    });

    expect(error.code).toBe('TEST_ERROR');
    expect(error.message).toBe('Test error message');
    expect(error.category).toBe(ErrorCategory.VALIDATION);
    expect(error.severity).toBe(ErrorSeverity.HIGH);
    expect(error.context).toEqual({ testKey: 'testValue' });
    expect(error.recoverable).toBe(true);
    expect(error.userMessage).toBe('User friendly message');
    expect(error.timestamp).toBeInstanceOf(Date);
  });

  it('should serialize to JSON correctly', () => {
    const error = new ForgeFlowError({
      code: 'JSON_TEST',
      message: 'JSON test',
      category: ErrorCategory.INTERNAL_ERROR,
      severity: ErrorSeverity.MEDIUM
    });

    const json = error.toJSON();
    expect(json.name).toBe('ForgeFlowError');
    expect(json.code).toBe('JSON_TEST');
    expect(json.message).toBe('JSON test');
    expect(json.category).toBe(ErrorCategory.INTERNAL_ERROR);
    expect(json.severity).toBe(ErrorSeverity.MEDIUM);
    expect(json.timestamp).toBeDefined();
  });

  it('should handle cause error', () => {
    const causeError = new Error('Original error');
    const error = new ForgeFlowError({
      code: 'CAUSED_ERROR',
      message: 'Error with cause',
      category: ErrorCategory.INTERNAL_ERROR,
      cause: causeError
    });

    expect(error.cause).toBe(causeError);
  });
});

describe('Specific Error Types', () => {
  describe('ValidationError', () => {
    it('should create validation error with field details', () => {
      const error = new ValidationError('testField', 123, 'string', { additional: 'context' });
      
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.category).toBe(ErrorCategory.VALIDATION);
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.recoverable).toBe(true);
      expect(error.context.field).toBe('testField');
      expect(error.context.value).toBe(123);
      expect(error.context.expectedType).toBe('string');
      expect(error.context.additional).toBe('context');
    });
  });

  describe('ConfigurationError', () => {
    it('should create configuration error', () => {
      const error = new ConfigurationError('databaseUrl', 'Invalid format', { env: 'test' });
      
      expect(error.code).toBe('CONFIG_ERROR');
      expect(error.category).toBe(ErrorCategory.CONFIGURATION);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.recoverable).toBe(false);
      expect(error.context.configKey).toBe('databaseUrl');
      expect(error.context.reason).toBe('Invalid format');
    });
  });

  describe('GitHubIntegrationError', () => {
    it('should create GitHub error with status code', () => {
      const error = new GitHubIntegrationError('createIssue', 403, 'Rate limit exceeded');
      
      expect(error.code).toBe('GITHUB_API_ERROR');
      expect(error.category).toBe(ErrorCategory.GITHUB_INTEGRATION);
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.context.operation).toBe('createIssue');
      expect(error.context.statusCode).toBe(403);
      expect(error.context.githubError).toBe('Rate limit exceeded');
    });

    it('should set high severity for server errors', () => {
      const error = new GitHubIntegrationError('getRepo', 500, 'Internal server error');
      
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.recoverable).toBe(false);
    });
  });

  describe('AgentExecutionError', () => {
    it('should create agent execution error', () => {
      const error = new AgentExecutionError('agent-1', 'task-123', 'Task timeout', { duration: 30000 });
      
      expect(error.code).toBe('AGENT_EXECUTION_FAILED');
      expect(error.category).toBe(ErrorCategory.AGENT_EXECUTION);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.context.agentId).toBe('agent-1');
      expect(error.context.taskId).toBe('task-123');
      expect(error.context.reason).toBe('Task timeout');
      expect(error.context.duration).toBe(30000);
    });
  });

  describe('WorktreeError', () => {
    it('should create worktree error', () => {
      const error = new WorktreeError('create', '/tmp/worktree', 'Path already exists');
      
      expect(error.code).toBe('WORKTREE_ERROR');
      expect(error.category).toBe(ErrorCategory.WORKTREE_MANAGEMENT);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.context.operation).toBe('create');
      expect(error.context.worktreePath).toBe('/tmp/worktree');
      expect(error.context.reason).toBe('Path already exists');
    });
  });

  describe('SecurityError', () => {
    it('should create security error with critical severity', () => {
      const error = new SecurityError('Unauthorized access attempt');
      
      expect(error.code).toBe('SECURITY_VIOLATION');
      expect(error.category).toBe(ErrorCategory.SECURITY);
      expect(error.severity).toBe(ErrorSeverity.CRITICAL);
      expect(error.recoverable).toBe(false);
    });
  });

  describe('ResourceExhaustedError', () => {
    it('should create resource exhausted error', () => {
      const error = new ResourceExhaustedError('memory', 1024, 2048, { process: 'agent-pool' });
      
      expect(error.code).toBe('RESOURCE_EXHAUSTED');
      expect(error.category).toBe(ErrorCategory.RESOURCE_EXHAUSTION);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.recoverable).toBe(false);
      expect(error.context.resource).toBe('memory');
      expect(error.context.limit).toBe(1024);
      expect(error.context.current).toBe(2048);
    });
  });
});

describe('ErrorHandler', () => {
  let errorHandler: ErrorHandler;

  beforeEach(() => {
    errorHandler = ErrorHandler.getInstance();
    // Clear any existing state
    vi.clearAllMocks();
  });

  describe('handleError', () => {
    it('should handle ForgeFlowError correctly', () => {
      const originalError = new ForgeFlowError({
        code: 'TEST_ERROR',
        message: 'Test error',
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.HIGH
      });

      const handledError = errorHandler.handleError(originalError);
      expect(handledError).toBe(originalError);
    });

    it('should convert regular Error to ForgeFlowError', () => {
      const originalError = new Error('Regular error');
      const handledError = errorHandler.handleError(originalError);
      
      expect(handledError).toBeInstanceOf(ForgeFlowError);
      expect(handledError.code).toBe('UNKNOWN_ERROR');
      expect(handledError.message).toBe('Regular error');
      expect(handledError.category).toBe(ErrorCategory.INTERNAL_ERROR);
      expect(handledError.cause).toBe(originalError);
    });

    it('should track error counts and notify alerts for critical errors', () => {
      const criticalError = new ForgeFlowError({
        code: 'CRITICAL_TEST',
        message: 'Critical test error',
        category: ErrorCategory.SECURITY,
        severity: ErrorSeverity.CRITICAL
      });

      const alertSpy = vi.fn();
      errorHandler.onCriticalError(alertSpy);

      errorHandler.handleError(criticalError);
      
      expect(alertSpy).toHaveBeenCalledWith(criticalError);
    });
  });

  describe('recordSuccess and recordFailure', () => {
    it('should record successful operations', () => {
      errorHandler.recordSuccess('test-operation', 1500);
      
      const metrics = errorHandler.getErrorMetrics();
      expect(metrics.totalSuccesses).toBeGreaterThan(0);
    });

    it('should record failed operations', () => {
      const testError = new Error('Test failure');
      errorHandler.recordFailure('test-operation', testError, 2000);
      
      const metrics = errorHandler.getErrorMetrics();
      expect(metrics.totalErrors).toBeGreaterThan(0);
    });
  });

  describe('fallback and recovery metrics', () => {
    it('should record fallback success', () => {
      errorHandler.recordFallbackSuccess('github-api-call');
      
      const metrics = errorHandler.getErrorMetrics();
      expect(metrics.fallbackMetrics['github-api-call']).toBeDefined();
      expect(metrics.fallbackMetrics['github-api-call'].successes).toBe(1);
    });

    it('should record fallback failure', () => {
      const error = new Error('Fallback failed');
      errorHandler.recordFallbackFailure('git-operation', error);
      
      const metrics = errorHandler.getErrorMetrics();
      expect(metrics.fallbackMetrics['git-operation']).toBeDefined();
      expect(metrics.fallbackMetrics['git-operation'].failures).toBe(1);
    });

    it('should record recovery attempts', () => {
      errorHandler.recordRecoverySuccess('file-operation', 'permission-fix');
      errorHandler.recordRecoveryFailure('file-operation', 'permission-fix', new Error('Failed'));
      
      const metrics = errorHandler.getErrorMetrics();
      expect(metrics.recoveryMetrics['file-operation:permission-fix']).toBeDefined();
      expect(metrics.recoveryMetrics['file-operation:permission-fix'].attempts).toBe(2);
      expect(metrics.recoveryMetrics['file-operation:permission-fix'].successes).toBe(1);
      expect(metrics.recoveryMetrics['file-operation:permission-fix'].failures).toBe(1);
    });
  });

  describe('system resilience calculation', () => {
    it('should calculate system resilience score', () => {
      // Add some test data
      errorHandler.recordSuccess('test-op', 1000);
      errorHandler.recordFallbackSuccess('test-op');
      errorHandler.recordRecoverySuccess('test-op', 'auto-recovery');
      
      const metrics = errorHandler.getErrorMetrics();
      expect(metrics.systemResilience).toBeGreaterThan(0);
      expect(metrics.systemResilience).toBeLessThanOrEqual(100);
    });
  });
});

describe('ValidationUtils', () => {
  describe('basic validations', () => {
    it('should validate required fields', () => {
      expect(() => ValidationUtils.validateRequired(null, 'testField'))
        .toThrow('Validation failed for field \'testField\'');
      expect(() => ValidationUtils.validateRequired('valid', 'testField'))
        .not.toThrow();
    });

    it('should validate strings with length constraints', () => {
      expect(() => ValidationUtils.validateString('ab', 'testField', 3))
        .toThrow('string with length >= 3');
      expect(() => ValidationUtils.validateString('toolong', 'testField', 0, 5))
        .toThrow('string with length <= 5');
      expect(() => ValidationUtils.validateString('valid', 'testField', 3, 10))
        .not.toThrow();
    });

    it('should validate numbers with range constraints', () => {
      expect(() => ValidationUtils.validateNumber(5, 'testField', 10))
        .toThrow('number >= 10');
      expect(() => ValidationUtils.validateNumber(15, 'testField', 0, 10))
        .toThrow('number <= 10');
      expect(() => ValidationUtils.validateNumber(7, 'testField', 5, 10))
        .not.toThrow();
    });

    it('should validate arrays', () => {
      expect(() => ValidationUtils.validateArray('not-array', 'testField'))
        .toThrow('array');
      expect(() => ValidationUtils.validateArray([], 'testField', 1))
        .toThrow('array with length >= 1');
      expect(() => ValidationUtils.validateArray(['item'], 'testField'))
        .not.toThrow();
    });

    it('should validate enums', () => {
      const validValues = ['option1', 'option2', 'option3'];
      expect(() => ValidationUtils.validateEnum('invalid', 'testField', validValues))
        .toThrow('one of: option1, option2, option3');
      expect(() => ValidationUtils.validateEnum('option1', 'testField', validValues))
        .not.toThrow();
    });
  });

  describe('specialized validations', () => {
    it('should validate email addresses', () => {
      expect(() => ValidationUtils.validateEmail('invalid-email', 'email'))
        .toThrow('valid email address');
      expect(() => ValidationUtils.validateEmail('test@example.com', 'email'))
        .not.toThrow();
    });

    it('should validate URLs', () => {
      expect(() => ValidationUtils.validateUrl('not-a-url', 'url'))
        .toThrow('valid URL');
      expect(() => ValidationUtils.validateUrl('https://example.com', 'url'))
        .not.toThrow();
    });

    it('should validate GitHub repositories', () => {
      expect(() => ValidationUtils.validateGitHubRepo('invalid-repo', 'repo'))
        .toThrow('valid GitHub repository');
      expect(() => ValidationUtils.validateGitHubRepo('owner/repo', 'repo'))
        .not.toThrow();
    });

    it('should validate GitHub tokens', () => {
      expect(() => ValidationUtils.validateGitHubToken('invalid', 'token'))
        .toThrow('valid GitHub token');
      expect(() => ValidationUtils.validateGitHubToken('ghp_' + 'a'.repeat(36), 'token'))
        .not.toThrow();
    });

    it('should validate agent types', () => {
      expect(() => ValidationUtils.validateAgentType('invalid-agent', 'agentType'))
        .toThrow();
      expect(() => ValidationUtils.validateAgentType('strategic-planner', 'agentType'))
        .not.toThrow();
    });

    it('should validate execution patterns', () => {
      expect(() => ValidationUtils.validateExecutionPattern('invalid-pattern', 'pattern'))
        .toThrow();
      expect(() => ValidationUtils.validateExecutionPattern('feature-development', 'pattern'))
        .not.toThrow();
    });
  });

  describe('rate limiting', () => {
    it('should enforce rate limits', () => {
      const identifier = 'test-user';
      
      // Should allow first request
      expect(() => ValidationUtils.validateRateLimit(identifier, 2, 1000))
        .not.toThrow();
      
      // Should allow second request
      expect(() => ValidationUtils.validateRateLimit(identifier, 2, 1000))
        .not.toThrow();
      
      // Should block third request
      expect(() => ValidationUtils.validateRateLimit(identifier, 2, 1000))
        .toThrow('Rate limit exceeded');
    });
  });

  describe('sanitization', () => {
    it('should sanitize strings', () => {
      const input = 'test string with "quotes" and \\backslashes';
      const sanitized = ValidationUtils.sanitizeString(input);
      expect(sanitized).not.toContain('"');
      expect(sanitized).not.toContain('\\');
    });

    it('should sanitize filenames', () => {
      const input = 'file name with spaces & special@chars!.txt';
      const sanitized = ValidationUtils.sanitizeFilename(input);
      expect(sanitized).toMatch(/^[a-zA-Z0-9._-]+$/);
    });
  });
});

describe('withErrorHandling', () => {
  beforeEach(() => {
    vi.clearAllTimers();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should execute operation successfully', async () => {
    const operation = vi.fn().mockResolvedValue('success');
    
    const result = await withErrorHandling(operation, {
      operationName: 'test-operation',
      category: ErrorCategory.INTERNAL_ERROR
    });
    
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledOnce();
  });

  it('should retry on failure', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('First failure'))
      .mockResolvedValue('success');
    
    const result = await withErrorHandling(operation, {
      operationName: 'test-operation',
      category: ErrorCategory.NETWORK,
      retries: 1
    });
    
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should timeout operations', async () => {
    const operation = vi.fn(() => new Promise(resolve => setTimeout(resolve, 10000)));
    
    const promise = withErrorHandling(operation, {
      operationName: 'test-operation',
      category: ErrorCategory.INTERNAL_ERROR,
      timeoutMs: 1000
    });
    
    vi.advanceTimersByTime(1500);
    
    await expect(promise).rejects.toThrow('timed out');
  });

  it('should use fallback operation', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Main operation failed'));
    const fallback = vi.fn().mockResolvedValue('fallback-success');
    
    const result = await withErrorHandling(operation, {
      operationName: 'test-operation',
      category: ErrorCategory.NETWORK,
      fallbackOperation: fallback
    });
    
    expect(result).toBe('fallback-success');
    expect(fallback).toHaveBeenCalledOnce();
  });

  it('should execute recovery strategies', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Network error'));
    const recoverySpy = vi.fn().mockResolvedValue(undefined);
    
    const recoveryStrategy = {
      name: 'test-recovery',
      canRecover: vi.fn().mockReturnValue(true),
      recover: recoverySpy
    };
    
    await expect(withErrorHandling(operation, {
      operationName: 'test-operation',
      category: ErrorCategory.NETWORK,
      recoveryStrategies: [recoveryStrategy]
    })).rejects.toThrow();
    
    expect(recoveryStrategy.canRecover).toHaveBeenCalled();
    expect(recoverySpy).toHaveBeenCalled();
  });

  it('should call success callback', async () => {
    const operation = vi.fn().mockResolvedValue('success');
    const onSuccess = vi.fn();
    
    await withErrorHandling(operation, {
      operationName: 'test-operation',
      category: ErrorCategory.INTERNAL_ERROR,
      onSuccess
    });
    
    expect(onSuccess).toHaveBeenCalledWith('success', expect.any(Number));
  });

  it('should call failure callback', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Test failure'));
    const onFailure = vi.fn();
    
    await expect(withErrorHandling(operation, {
      operationName: 'test-operation',
      category: ErrorCategory.INTERNAL_ERROR,
      onFailure
    })).rejects.toThrow();
    
    expect(onFailure).toHaveBeenCalledWith(expect.any(Error), 0);
  });
});

describe('Recovery Strategies', () => {
  describe('DEFAULT_RECOVERY_STRATEGIES', () => {
    it('should include git cleanup recovery', () => {
      const strategy = DEFAULT_RECOVERY_STRATEGIES.find(s => s.name === 'git-cleanup-recovery');
      expect(strategy).toBeDefined();
      expect(strategy!.canRecover(new Error('git lock error'))).toBe(true);
      expect(strategy!.canRecover(new Error('unrelated error'))).toBe(false);
    });

    it('should include GitHub rate limit recovery', () => {
      const strategy = DEFAULT_RECOVERY_STRATEGIES.find(s => s.name === 'github-rate-limit-recovery');
      expect(strategy).toBeDefined();
      expect(strategy!.canRecover(new Error('rate limit exceeded'))).toBe(true);
      expect(strategy!.canRecover(new Error('403 forbidden'))).toBe(true);
    });

    it('should include network connectivity recovery', () => {
      const strategy = DEFAULT_RECOVERY_STRATEGIES.find(s => s.name === 'network-connectivity-recovery');
      expect(strategy).toBeDefined();
      expect(strategy!.canRecover(new Error('ENOTFOUND example.com'))).toBe(true);
      expect(strategy!.canRecover(new Error('ECONNREFUSED'))).toBe(true);
    });

    it('should include file permission recovery', () => {
      const strategy = DEFAULT_RECOVERY_STRATEGIES.find(s => s.name === 'file-permission-recovery');
      expect(strategy).toBeDefined();
      expect(strategy!.canRecover(new Error('EACCES: permission denied'))).toBe(true);
      expect(strategy!.canRecover(new Error('EPERM: operation not permitted'))).toBe(true);
    });
  });
});

describe('Specialized Error Handlers', () => {
  describe('GitHubApiErrorHandler', () => {
    it('should handle GitHub operations with retries', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await GitHubApiErrorHandler.handleGitHubError(
        operation,
        'createIssue',
        { repo: 'test/repo' }
      );
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledOnce();
    });
  });

  describe('GitOperationErrorHandler', () => {
    it('should handle git operations with cleanup recovery', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await GitOperationErrorHandler.handleGitOperation(
        operation,
        'clone',
        '/tmp/repo'
      );
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledOnce();
    });
  });

  describe('FileSystemErrorHandler', () => {
    it('should handle file system operations', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await FileSystemErrorHandler.handleFileSystemOperation(
        operation,
        'write',
        '/tmp/file.txt'
      );
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledOnce();
    });
  });

  describe('AgentExecutionErrorHandler', () => {
    it('should handle agent execution with priority-based retries', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await AgentExecutionErrorHandler.handleAgentExecution(
        operation,
        'strategic-planner',
        'task-123',
        'critical'
      );
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledOnce();
    });
  });
});

describe('SystemStateManager', () => {
  let stateManager: SystemStateManager;

  beforeEach(() => {
    stateManager = SystemStateManager.getInstance();
  });

  it('should register and manage component state', () => {
    const validator = (state: any) => state.status === 'healthy';
    
    stateManager.registerComponent('test-component', { status: 'healthy' }, validator);
    
    const state = stateManager.getState('test-component');
    expect(state).toEqual({ status: 'healthy' });
  });

  it('should validate state transitions', () => {
    const validator = (state: any) => state.status !== 'invalid';
    
    stateManager.registerComponent('test-component', { status: 'healthy' }, validator);
    
    expect(() => {
      stateManager.updateState('test-component', { status: 'invalid' });
    }).toThrow('Invalid state transition');
  });

  it('should validate system consistency', async () => {
    const validator = (state: any) => state.value > 0;
    
    stateManager.registerComponent('component1', { value: 10 }, validator);
    stateManager.registerComponent('component2', { value: -5 }, validator);
    
    const result = await stateManager.validateSystemConsistency();
    
    expect(result.consistent).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].componentId).toBe('component2');
  });

  it('should recover system consistency', async () => {
    const validator = (state: any) => state.healthy === true;
    const recoveryAction = vi.fn().mockResolvedValue(undefined);
    
    stateManager.registerComponent('test-component', { healthy: false }, validator);
    stateManager.registerRecoveryAction('test-component', recoveryAction);
    
    await expect(stateManager.recoverSystemConsistency()).rejects.toThrow();
    expect(recoveryAction).toHaveBeenCalled();
  });
});