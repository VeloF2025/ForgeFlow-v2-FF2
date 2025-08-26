/**
 * Comprehensive tests for FailurePolicyManager
 */

import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from 'vitest';
import type { FailurePolicy } from '../failure-policy-manager';
import { FailurePolicyManager } from '../failure-policy-manager';
import { ErrorCategory, ErrorSeverity, ForgeFlowError } from '../../utils/errors';
import * as fs from 'fs-extra';
import * as yaml from 'yaml';

// Mock dependencies
vi.mock('fs-extra');
vi.mock('yaml');
vi.mock('../../utils/enhanced-logger', () => ({
  enhancedLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockFs = fs as any;
const mockYaml = yaml as any;

describe('FailurePolicyManager', () => {
  let policyManager: FailurePolicyManager;
  let mockPolicy: FailurePolicy;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Get fresh instance
    policyManager = FailurePolicyManager.getInstance();

    // Setup mock policy
    mockPolicy = {
      id: 'test-policy',
      name: 'Test Policy',
      description: 'A test policy',
      enabled: true,
      priority: 5,
      conditions: [
        {
          field: 'category',
          operator: 'equals',
          value: 'github_integration',
        },
      ],
      retryStrategy: {
        strategyType: 'exponential',
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        jitter: true,
        jitterType: 'full',
      },
    };

    // Setup fs mocks
    mockFs.pathExists = vi.fn();
    mockFs.readFile = vi.fn();
    mockFs.writeFile = vi.fn();
    mockFs.ensureDir = vi.fn();

    // Setup yaml mocks
    mockYaml.parse = vi.fn();
    mockYaml.stringify = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Policy Loading', () => {
    it('should load policies from YAML configuration', async () => {
      const mockConfig = {
        version: '1.0',
        policies: [mockPolicy],
      };

      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readFile.mockResolvedValue('mock yaml content');
      mockYaml.parse.mockReturnValue(mockConfig);

      await policyManager.loadPolicies();

      expect(mockFs.pathExists).toHaveBeenCalled();
      expect(mockFs.readFile).toHaveBeenCalled();
      expect(mockYaml.parse).toHaveBeenCalled();

      const policies = policyManager.getAllPolicies();
      expect(policies).toHaveLength(1);
      expect(policies[0].id).toBe('test-policy');
    });

    it('should create default policies when config file does not exist', async () => {
      mockFs.pathExists.mockResolvedValue(false);
      mockFs.ensureDir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockYaml.stringify.mockReturnValue('mock yaml');

      await policyManager.loadPolicies();

      expect(mockFs.pathExists).toHaveBeenCalled();
      expect(mockFs.ensureDir).toHaveBeenCalled();
      expect(mockFs.writeFile).toHaveBeenCalled();

      const policies = policyManager.getAllPolicies();
      expect(policies.length).toBeGreaterThan(0);
    });

    it('should handle invalid configuration gracefully', async () => {
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readFile.mockResolvedValue('invalid yaml');
      mockYaml.parse.mockReturnValue({ invalid: 'config' });

      await expect(policyManager.loadPolicies()).rejects.toThrow();
    });
  });

  describe('Policy Execution', () => {
    beforeEach(async () => {
      // Load mock policy
      mockFs.pathExists.mockResolvedValue(false);
      mockFs.ensureDir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockYaml.stringify.mockReturnValue('mock yaml');

      await policyManager.loadPolicies();
      await policyManager.addPolicy(mockPolicy);
    });

    it('should execute policy for matching error conditions', async () => {
      const error = new ForgeFlowError({
        code: 'GITHUB_API_ERROR',
        message: 'API request failed',
        category: ErrorCategory.GITHUB_INTEGRATION,
        severity: ErrorSeverity.MEDIUM,
      });

      const context = {
        operationName: 'github-api-call',
        error,
        attempt: 1,
        totalAttempts: 1,
        previousAttempts: [],
        metadata: {},
      };

      const result = await policyManager.executePolicy(context);

      expect(result).toBeDefined();
      expect(result.policyApplied).toBe('test-policy');
      expect(result.shouldRetry).toBe(true);
      expect(result.delayMs).toBeGreaterThan(0);
    });

    it('should return default policy result when no policies match', async () => {
      const error = new ForgeFlowError({
        code: 'UNKNOWN_ERROR',
        message: 'Unknown error',
        category: ErrorCategory.INTERNAL_ERROR,
        severity: ErrorSeverity.LOW,
      });

      const context = {
        operationName: 'unknown-operation',
        error,
        attempt: 1,
        totalAttempts: 1,
        previousAttempts: [],
        metadata: {},
      };

      const result = await policyManager.executePolicy(context);

      expect(result).toBeDefined();
      expect(result.policyApplied).toBe('default');
    });

    it('should respect max attempts limit', async () => {
      const error = new ForgeFlowError({
        code: 'GITHUB_API_ERROR',
        message: 'API request failed',
        category: ErrorCategory.GITHUB_INTEGRATION,
        severity: ErrorSeverity.MEDIUM,
      });

      const context = {
        operationName: 'github-api-call',
        error,
        attempt: 5, // Exceeds maxAttempts
        totalAttempts: 5,
        previousAttempts: [],
        metadata: {},
      };

      const result = await policyManager.executePolicy(context);

      expect(result.shouldRetry).toBe(false);
    });
  });

  describe('Condition Evaluation', () => {
    it('should evaluate equals condition correctly', async () => {
      const policy: FailurePolicy = {
        ...mockPolicy,
        conditions: [
          {
            field: 'category',
            operator: 'equals',
            value: 'github_integration',
          },
        ],
      };

      await policyManager.addPolicy(policy);

      const error = new ForgeFlowError({
        code: 'GITHUB_API_ERROR',
        message: 'API request failed',
        category: ErrorCategory.GITHUB_INTEGRATION,
        severity: ErrorSeverity.MEDIUM,
      });

      const context = {
        operationName: 'test',
        error,
        attempt: 1,
        totalAttempts: 1,
        previousAttempts: [],
        metadata: {},
      };

      const result = await policyManager.executePolicy(context);
      expect(result.policyApplied).toBe('test-policy');
    });

    it('should evaluate contains condition correctly', async () => {
      const policy: FailurePolicy = {
        ...mockPolicy,
        conditions: [
          {
            field: 'message',
            operator: 'contains',
            value: 'timeout',
          },
        ],
      };

      await policyManager.addPolicy(policy);

      const error = new Error('Request timeout occurred');
      const context = {
        operationName: 'test',
        error,
        attempt: 1,
        totalAttempts: 1,
        previousAttempts: [],
        metadata: {},
      };

      const result = await policyManager.executePolicy(context);
      expect(result.policyApplied).toBe('test-policy');
    });

    it('should evaluate in condition correctly', async () => {
      const policy: FailurePolicy = {
        ...mockPolicy,
        conditions: [
          {
            field: 'category',
            operator: 'in',
            value: ['github_integration', 'external_service'],
          },
        ],
      };

      await policyManager.addPolicy(policy);

      const error = new ForgeFlowError({
        code: 'SERVICE_ERROR',
        message: 'Service unavailable',
        category: ErrorCategory.EXTERNAL_SERVICE,
        severity: ErrorSeverity.HIGH,
      });

      const context = {
        operationName: 'test',
        error,
        attempt: 1,
        totalAttempts: 1,
        previousAttempts: [],
        metadata: {},
      };

      const result = await policyManager.executePolicy(context);
      expect(result.policyApplied).toBe('test-policy');
    });

    it('should evaluate negated conditions correctly', async () => {
      const policy: FailurePolicy = {
        ...mockPolicy,
        conditions: [
          {
            field: 'severity',
            operator: 'equals',
            value: 'critical',
            negate: true,
          },
        ],
      };

      await policyManager.addPolicy(policy);

      const error = new ForgeFlowError({
        code: 'LOW_PRIORITY_ERROR',
        message: 'Non-critical error',
        category: ErrorCategory.INTERNAL_ERROR,
        severity: ErrorSeverity.LOW,
      });

      const context = {
        operationName: 'test',
        error,
        attempt: 1,
        totalAttempts: 1,
        previousAttempts: [],
        metadata: {},
      };

      const result = await policyManager.executePolicy(context);
      expect(result.policyApplied).toBe('test-policy');
    });
  });

  describe('Policy Priority', () => {
    it('should apply highest priority policy when multiple match', async () => {
      const lowPriorityPolicy: FailurePolicy = {
        ...mockPolicy,
        id: 'low-priority',
        priority: 1,
      };

      const highPriorityPolicy: FailurePolicy = {
        ...mockPolicy,
        id: 'high-priority',
        priority: 10,
      };

      await policyManager.addPolicy(lowPriorityPolicy);
      await policyManager.addPolicy(highPriorityPolicy);

      const error = new ForgeFlowError({
        code: 'GITHUB_API_ERROR',
        message: 'API request failed',
        category: ErrorCategory.GITHUB_INTEGRATION,
        severity: ErrorSeverity.MEDIUM,
      });

      const context = {
        operationName: 'test',
        error,
        attempt: 1,
        totalAttempts: 1,
        previousAttempts: [],
        metadata: {},
      };

      const result = await policyManager.executePolicy(context);
      expect(result.policyApplied).toBe('high-priority');
    });
  });

  describe('Policy Management', () => {
    it('should add policy successfully', async () => {
      await policyManager.addPolicy(mockPolicy);

      const policies = policyManager.getAllPolicies();
      const addedPolicy = policies.find((p) => p.id === 'test-policy');
      expect(addedPolicy).toBeDefined();
      expect(addedPolicy.name).toBe('Test Policy');
    });

    it('should remove policy successfully', async () => {
      await policyManager.addPolicy(mockPolicy);
      const removed = policyManager.removePolicy('test-policy');

      expect(removed).toBe(true);

      const policies = policyManager.getAllPolicies();
      const removedPolicy = policies.find((p) => p.id === 'test-policy');
      expect(removedPolicy).toBeUndefined();
    });

    it('should toggle policy enabled state', async () => {
      await policyManager.addPolicy(mockPolicy);

      const toggled = policyManager.togglePolicy('test-policy', false);
      expect(toggled).toBe(true);

      const policy = policyManager.getPolicy('test-policy');
      expect(policy.enabled).toBe(false);
    });

    it('should return false when trying to toggle non-existent policy', () => {
      const toggled = policyManager.togglePolicy('non-existent', false);
      expect(toggled).toBe(false);
    });
  });

  describe('Metrics and Monitoring', () => {
    beforeEach(async () => {
      await policyManager.addPolicy(mockPolicy);
    });

    it('should record policy outcomes correctly', () => {
      policyManager.recordPolicyOutcome('test-operation', 'test-policy', true, 1000);

      const metrics = policyManager.getPolicyMetrics();
      expect(metrics).toBeDefined();
      expect(typeof metrics.systemResilience).toBe('number');
    });

    it('should calculate system health metrics', async () => {
      // Execute a policy to generate some metrics
      const error = new ForgeFlowError({
        code: 'GITHUB_API_ERROR',
        message: 'API request failed',
        category: ErrorCategory.GITHUB_INTEGRATION,
        severity: ErrorSeverity.MEDIUM,
      });

      const context = {
        operationName: 'test-operation',
        error,
        attempt: 1,
        totalAttempts: 1,
        previousAttempts: [],
        metadata: {},
      };

      await policyManager.executePolicy(context);
      policyManager.recordPolicyOutcome('test-operation', 'test-policy', true, 500);

      const metrics = policyManager.getPolicyMetrics();
      expect(metrics.totalPoliciesLoaded).toBeGreaterThan(0);
      expect(metrics.systemHealth).toBeDefined();
    });
  });

  describe('Policy Inheritance', () => {
    it('should process policy inheritance correctly', async () => {
      const parentPolicy: FailurePolicy = {
        id: 'parent-policy',
        name: 'Parent Policy',
        enabled: true,
        priority: 5,
        conditions: [
          {
            field: 'category',
            operator: 'equals',
            value: 'github_integration',
          },
        ],
        retryStrategy: {
          strategyType: 'exponential',
          maxAttempts: 2,
          initialDelay: 500,
          maxDelay: 5000,
        },
        recoveryActions: [
          {
            actionType: 'parent-action',
            parameters: { test: true },
            priority: 5,
          },
        ],
      };

      const childPolicy: FailurePolicy = {
        id: 'child-policy',
        name: 'Child Policy',
        enabled: true,
        priority: 6,
        inheritFrom: 'parent-policy',
        conditions: [
          {
            field: 'severity',
            operator: 'equals',
            value: 'high',
          },
        ],
        retryStrategy: {
          strategyType: 'linear',
          maxAttempts: 3,
          initialDelay: 1000,
          maxDelay: 10000,
        },
      };

      await policyManager.addPolicy(parentPolicy);
      await policyManager.addPolicy(childPolicy);

      const retrievedChild = policyManager.getPolicy('child-policy');
      expect(retrievedChild).toBeDefined();
      expect(retrievedChild.conditions).toHaveLength(2); // Parent + child conditions
      expect(retrievedChild.retryStrategy.maxAttempts).toBe(3); // Child overrides
    });
  });

  describe('Error Handling', () => {
    it('should handle policy execution errors gracefully', async () => {
      // Create a policy that would cause an error during execution
      const problematicPolicy: FailurePolicy = {
        id: 'problematic-policy',
        name: 'Problematic Policy',
        enabled: true,
        priority: 10,
        conditions: [
          {
            field: 'category',
            operator: 'equals',
            value: 'github_integration',
          },
        ],
        retryStrategy: {
          strategyType: 'exponential',
          maxAttempts: -1, // Invalid value
          initialDelay: 1000,
          maxDelay: 10000,
        },
      };

      await policyManager.addPolicy(problematicPolicy);

      const error = new ForgeFlowError({
        code: 'GITHUB_API_ERROR',
        message: 'API request failed',
        category: ErrorCategory.GITHUB_INTEGRATION,
        severity: ErrorSeverity.MEDIUM,
      });

      const context = {
        operationName: 'test',
        error,
        attempt: 1,
        totalAttempts: 1,
        previousAttempts: [],
        metadata: {},
      };

      // Should not throw, but return default policy result
      const result = await policyManager.executePolicy(context);
      expect(result).toBeDefined();
      expect(result.policyApplied).toBe('default');
    });

    it('should validate policy configuration', async () => {
      const invalidPolicy: FailurePolicy = {
        id: '', // Invalid empty ID
        name: 'Invalid Policy',
        enabled: true,
        priority: -1, // Invalid priority
        conditions: [],
        retryStrategy: {
          strategyType: 'exponential',
          maxAttempts: 0, // Invalid max attempts
          initialDelay: -100, // Invalid delay
          maxDelay: 10,
        },
      };

      // This should handle the invalid policy gracefully
      await expect(policyManager.addPolicy(invalidPolicy)).resolves.not.toThrow();
    });
  });

  describe('Configuration Persistence', () => {
    it('should save policies to configuration file', async () => {
      mockFs.ensureDir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockYaml.stringify.mockReturnValue('mock yaml content');

      await policyManager.addPolicy(mockPolicy);

      // This would be called internally during policy creation
      expect(mockYaml.stringify).toHaveBeenCalled();
    });

    it('should handle configuration save errors gracefully', async () => {
      mockFs.ensureDir.mockRejectedValue(new Error('Permission denied'));
      mockFs.writeFile.mockRejectedValue(new Error('Disk full'));

      // Should not throw when saving fails
      await expect(policyManager.addPolicy(mockPolicy)).resolves.not.toThrow();
    });
  });
});
