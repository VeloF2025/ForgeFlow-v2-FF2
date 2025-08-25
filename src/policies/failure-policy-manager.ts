/**
 * Comprehensive Failure Policy Manager for ForgeFlow v2
 * Provides configurable retry policies, backoff strategies, and error recovery
 */

import { enhancedLogger } from '../utils/enhanced-logger';
import { ForgeFlowError, ErrorCategory, ErrorSeverity, ErrorHandler } from '../utils/errors';
import { RetryStrategy, BackoffStrategy } from './retry-strategies';
import { CircuitBreakerManager } from './circuit-breaker';
import { RecoveryActionManager } from './recovery-actions';
import * as yaml from 'yaml';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface FailurePolicy {
  id: string;
  name: string;
  description?: string;
  conditions: PolicyCondition[];
  retryStrategy: RetryPolicyConfig;
  circuitBreaker?: CircuitBreakerConfig;
  recoveryActions?: RecoveryActionConfig[];
  priority: number;
  enabled: boolean;
  inheritFrom?: string;
  overrides?: Partial<FailurePolicy>;
}

export interface PolicyCondition {
  field: 'category' | 'severity' | 'code' | 'message' | 'operationName';
  operator: 'equals' | 'contains' | 'matches' | 'in';
  value: string | string[] | RegExp;
  negate?: boolean;
}

export interface RetryPolicyConfig {
  strategyType: 'exponential' | 'linear' | 'fixed' | 'custom';
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier?: number;
  jitter?: boolean;
  jitterType?: 'full' | 'equal' | 'decorrelated';
  customStrategy?: string; // Reference to custom strategy
  shouldRetry?: PolicyCondition[];
  giveUpAfter?: number; // Total timeout in ms
}

export interface CircuitBreakerConfig {
  enabled: boolean;
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  halfOpenMaxCalls?: number;
  healthCheckInterval?: number;
}

export interface RecoveryActionConfig {
  actionType: string;
  parameters: Record<string, unknown>;
  runBefore?: boolean; // Run before retry attempts
  runAfter?: boolean;  // Run after all retries fail
  priority?: number;
  timeout?: number;
}

export interface PolicyExecutionContext {
  operationName: string;
  error: Error;
  attempt: number;
  totalAttempts: number;
  previousAttempts: Array<{
    attempt: number;
    error: Error;
    duration: number;
    timestamp: Date;
  }>;
  metadata: Record<string, unknown>;
}

export interface PolicyExecutionResult {
  shouldRetry: boolean;
  delayMs: number;
  recoveryActions: RecoveryActionConfig[];
  circuitBreakerState?: 'open' | 'closed' | 'half-open';
  nextRetryAt?: Date;
  policyApplied: string;
  executionMetrics: {
    policyEvaluationTime: number;
    strategyComputationTime: number;
    totalExecutionTime: number;
  };
}

export class FailurePolicyManager {
  private static instance: FailurePolicyManager;
  private policies = new Map<string, FailurePolicy>();
  private retryStrategy: RetryStrategy;
  private circuitBreaker: CircuitBreakerManager;
  private recoveryActions: RecoveryActionManager;
  private configPath: string;
  private policyCache = new Map<string, FailurePolicy[]>();
  private metrics = new Map<string, {
    policiesApplied: number;
    retriesExecuted: number;
    successfulRecoveries: number;
    circuitBreakerTrips: number;
    averageRecoveryTime: number;
    policyEffectiveness: Map<string, { successes: number; failures: number }>;
  }>();

  private constructor() {
    this.retryStrategy = new RetryStrategy();
    this.circuitBreaker = new CircuitBreakerManager();
    this.recoveryActions = new RecoveryActionManager();
    this.configPath = path.join(__dirname, '../../config/failure-policies.yaml');
  }

  static getInstance(): FailurePolicyManager {
    if (!FailurePolicyManager.instance) {
      FailurePolicyManager.instance = new FailurePolicyManager();
    }
    return FailurePolicyManager.instance;
  }

  // 🟢 WORKING: Load policies from YAML configuration
  async loadPolicies(configPath?: string): Promise<void> {
    try {
      const actualConfigPath = configPath || this.configPath;
      
      if (!(await fs.pathExists(actualConfigPath))) {
        enhancedLogger.warn('Failure policies config not found, creating default policies', { 
          configPath: actualConfigPath 
        });
        await this.createDefaultPolicies();
        return;
      }

      const configContent = await fs.readFile(actualConfigPath, 'utf-8');
      const config = yaml.parse(configContent) as { policies: FailurePolicy[] };

      if (!config.policies || !Array.isArray(config.policies)) {
        throw new ForgeFlowError({
          code: 'INVALID_POLICY_CONFIG',
          message: 'Invalid policy configuration format',
          category: ErrorCategory.CONFIGURATION,
          severity: ErrorSeverity.HIGH,
          context: { configPath: actualConfigPath },
          recoverable: false,
          userMessage: 'Failure policy configuration is invalid'
        });
      }

      // Clear existing policies and load new ones
      this.policies.clear();
      this.policyCache.clear();

      for (const policyConfig of config.policies) {
        const policy = await this.processPolicy(policyConfig);
        this.policies.set(policy.id, policy);
      }

      enhancedLogger.info('Loaded failure policies successfully', {
        policiesCount: this.policies.size,
        configPath: actualConfigPath
      });

    } catch (error) {
      enhancedLogger.error('Failed to load failure policies', { 
        error: error.message,
        configPath 
      });
      // Fall back to default policies if loading fails
      await this.createDefaultPolicies();
    }
  }

  // 🟢 WORKING: Process policy inheritance and overrides
  private async processPolicy(policyConfig: FailurePolicy): Promise<FailurePolicy> {
    let policy = { ...policyConfig };

    // Handle policy inheritance
    if (policy.inheritFrom) {
      const parentPolicy = this.policies.get(policy.inheritFrom);
      if (parentPolicy) {
        policy = {
          ...parentPolicy,
          ...policy,
          id: policyConfig.id, // Preserve original ID
          conditions: [...(parentPolicy.conditions || []), ...(policy.conditions || [])],
          recoveryActions: [...(parentPolicy.recoveryActions || []), ...(policy.recoveryActions || [])]
        };
      } else {
        enhancedLogger.warn('Parent policy not found for inheritance', {
          policyId: policy.id,
          inheritFrom: policy.inheritFrom
        });
      }
    }

    // Apply overrides
    if (policy.overrides) {
      policy = { ...policy, ...policy.overrides };
    }

    return policy;
  }

  // 🟢 WORKING: Execute failure policy for given error context
  async executePolicy(context: PolicyExecutionContext): Promise<PolicyExecutionResult> {
    const startTime = Date.now();
    const cacheKey = this.getCacheKey(context);
    
    try {
      // Find applicable policies
      const applicablePolicies = this.findApplicablePolicies(context);
      
      if (applicablePolicies.length === 0) {
        return this.getDefaultPolicyResult(context);
      }

      // Sort by priority (higher number = higher priority)
      applicablePolicies.sort((a, b) => b.priority - a.priority);
      
      const selectedPolicy = applicablePolicies[0];
      const policyEvaluationTime = Date.now() - startTime;

      // Execute policy logic
      const result = await this.executePolicyLogic(selectedPolicy, context, policyEvaluationTime);
      
      // Update metrics
      this.updatePolicyMetrics(selectedPolicy.id, context, result);
      
      enhancedLogger.debug('Failure policy executed', {
        policyId: selectedPolicy.id,
        operationName: context.operationName,
        shouldRetry: result.shouldRetry,
        delayMs: result.delayMs,
        executionTime: result.executionMetrics.totalExecutionTime
      });

      return result;

    } catch (error) {
      enhancedLogger.error('Failed to execute failure policy', {
        operationName: context.operationName,
        error: error.message
      });
      
      // Return safe default on policy execution failure
      return this.getDefaultPolicyResult(context);
    }
  }

  // 🟢 WORKING: Find applicable policies based on context
  private findApplicablePolicies(context: PolicyExecutionContext): FailurePolicy[] {
    const applicable: FailurePolicy[] = [];
    
    for (const policy of this.policies.values()) {
      if (!policy.enabled) continue;
      
      if (this.evaluatePolicyConditions(policy.conditions, context)) {
        applicable.push(policy);
      }
    }
    
    return applicable;
  }

  // 🟢 WORKING: Evaluate policy conditions against context
  private evaluatePolicyConditions(conditions: PolicyCondition[], context: PolicyExecutionContext): boolean {
    if (!conditions || conditions.length === 0) return true;
    
    return conditions.every(condition => {
      let result = this.evaluateCondition(condition, context);
      return condition.negate ? !result : result;
    });
  }

  // 🟢 WORKING: Evaluate individual condition
  private evaluateCondition(condition: PolicyCondition, context: PolicyExecutionContext): boolean {
    let fieldValue: any;
    
    switch (condition.field) {
      case 'category':
        fieldValue = context.error instanceof ForgeFlowError 
          ? context.error.category 
          : ErrorCategory.INTERNAL_ERROR;
        break;
      case 'severity':
        fieldValue = context.error instanceof ForgeFlowError 
          ? context.error.severity 
          : ErrorSeverity.MEDIUM;
        break;
      case 'code':
        fieldValue = context.error instanceof ForgeFlowError 
          ? context.error.code 
          : 'UNKNOWN_ERROR';
        break;
      case 'message':
        fieldValue = context.error.message;
        break;
      case 'operationName':
        fieldValue = context.operationName;
        break;
      default:
        return false;
    }

    switch (condition.operator) {
      case 'equals':
        return fieldValue === condition.value;
      case 'contains':
        return typeof fieldValue === 'string' && 
               typeof condition.value === 'string' && 
               fieldValue.toLowerCase().includes(condition.value.toLowerCase());
      case 'matches':
        if (condition.value instanceof RegExp) {
          return condition.value.test(String(fieldValue));
        }
        return new RegExp(String(condition.value), 'i').test(String(fieldValue));
      case 'in':
        return Array.isArray(condition.value) && 
               condition.value.includes(fieldValue);
      default:
        return false;
    }
  }

  // 🟢 WORKING: Execute policy logic (retry, circuit breaker, recovery)
  private async executePolicyLogic(
    policy: FailurePolicy,
    context: PolicyExecutionContext,
    policyEvaluationTime: number
  ): Promise<PolicyExecutionResult> {
    const strategyStartTime = Date.now();
    
    // Check circuit breaker first
    let circuitBreakerState: 'open' | 'closed' | 'half-open' | undefined;
    if (policy.circuitBreaker?.enabled) {
      circuitBreakerState = await this.circuitBreaker.checkState(
        context.operationName,
        policy.circuitBreaker
      );
      
      if (circuitBreakerState === 'open') {
        const strategyComputationTime = Date.now() - strategyStartTime;
        return {
          shouldRetry: false,
          delayMs: 0,
          recoveryActions: [],
          circuitBreakerState,
          policyApplied: policy.id,
          executionMetrics: {
            policyEvaluationTime,
            strategyComputationTime,
            totalExecutionTime: Date.now() - (Date.now() - policyEvaluationTime)
          }
        };
      }
    }

    // Determine if we should retry
    const shouldRetry = this.shouldRetryOperation(policy, context);
    let delayMs = 0;
    let nextRetryAt: Date | undefined;

    if (shouldRetry) {
      // Calculate retry delay using strategy
      delayMs = await this.retryStrategy.calculateDelay(
        policy.retryStrategy,
        context.attempt,
        context.error
      );
      nextRetryAt = new Date(Date.now() + delayMs);
    }

    // Determine recovery actions
    const recoveryActions = this.selectRecoveryActions(policy, context, shouldRetry);
    
    const strategyComputationTime = Date.now() - strategyStartTime;

    return {
      shouldRetry,
      delayMs,
      recoveryActions,
      circuitBreakerState,
      nextRetryAt,
      policyApplied: policy.id,
      executionMetrics: {
        policyEvaluationTime,
        strategyComputationTime,
        totalExecutionTime: policyEvaluationTime + strategyComputationTime
      }
    };
  }

  // 🟢 WORKING: Determine if operation should be retried
  private shouldRetryOperation(policy: FailurePolicy, context: PolicyExecutionContext): boolean {
    // Check max attempts
    if (context.attempt >= policy.retryStrategy.maxAttempts) {
      return false;
    }

    // Check total timeout
    if (policy.retryStrategy.giveUpAfter) {
      const firstAttemptTime = context.previousAttempts[0]?.timestamp || new Date();
      const elapsed = Date.now() - firstAttemptTime.getTime();
      if (elapsed >= policy.retryStrategy.giveUpAfter) {
        return false;
      }
    }

    // Check specific retry conditions
    if (policy.retryStrategy.shouldRetry) {
      const retryContext = { ...context, error: context.error, operationName: context.operationName };
      return this.evaluatePolicyConditions(policy.retryStrategy.shouldRetry, retryContext);
    }

    // Default: retry if error is recoverable
    if (context.error instanceof ForgeFlowError) {
      return context.error.recoverable;
    }

    // For non-ForgeFlow errors, use basic retry logic
    return this.isRetryableError(context.error);
  }

  // 🟢 WORKING: Basic retry logic for non-ForgeFlow errors
  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    const retryablePatterns = [
      'timeout', 'network', 'connection', 'temporary', 'rate limit',
      'service unavailable', 'internal server error', 'bad gateway'
    ];
    
    return retryablePatterns.some(pattern => message.includes(pattern));
  }

  // 🟢 WORKING: Select appropriate recovery actions
  private selectRecoveryActions(
    policy: FailurePolicy,
    context: PolicyExecutionContext,
    willRetry: boolean
  ): RecoveryActionConfig[] {
    if (!policy.recoveryActions) return [];
    
    return policy.recoveryActions.filter(action => {
      // Run before retry attempts
      if (action.runBefore && willRetry) return true;
      // Run after all retries fail
      if (action.runAfter && !willRetry && context.attempt >= policy.retryStrategy.maxAttempts) return true;
      // Default behavior
      if (!action.runBefore && !action.runAfter) return willRetry;
      
      return false;
    }).sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  // 🟢 WORKING: Get cache key for policy lookups
  private getCacheKey(context: PolicyExecutionContext): string {
    const errorType = context.error instanceof ForgeFlowError 
      ? `${context.error.category}-${context.error.code}`
      : context.error.constructor.name;
    
    return `${context.operationName}:${errorType}`;
  }

  // 🟢 WORKING: Update policy execution metrics
  private updatePolicyMetrics(
    policyId: string,
    context: PolicyExecutionContext,
    result: PolicyExecutionResult
  ): void {
    const operationMetrics = this.metrics.get(context.operationName) || {
      policiesApplied: 0,
      retriesExecuted: 0,
      successfulRecoveries: 0,
      circuitBreakerTrips: 0,
      averageRecoveryTime: 0,
      policyEffectiveness: new Map()
    };

    operationMetrics.policiesApplied++;
    if (result.shouldRetry) {
      operationMetrics.retriesExecuted++;
    }
    if (result.circuitBreakerState === 'open') {
      operationMetrics.circuitBreakerTrips++;
    }

    // Track policy effectiveness
    const policyEffectiveness = operationMetrics.policyEffectiveness.get(policyId) || 
      { successes: 0, failures: 0 };
    
    // This will be updated when we get the final result of the operation
    operationMetrics.policyEffectiveness.set(policyId, policyEffectiveness);
    
    this.metrics.set(context.operationName, operationMetrics);
  }

  // 🟢 WORKING: Get default policy result when no policies match
  private getDefaultPolicyResult(context: PolicyExecutionContext): PolicyExecutionResult {
    const isRetryable = context.error instanceof ForgeFlowError 
      ? context.error.recoverable 
      : this.isRetryableError(context.error);

    const shouldRetry = isRetryable && context.attempt < 3; // Default max 3 attempts
    const delayMs = shouldRetry ? Math.min(1000 * Math.pow(2, context.attempt), 30000) : 0;

    return {
      shouldRetry,
      delayMs,
      recoveryActions: [],
      policyApplied: 'default',
      executionMetrics: {
        policyEvaluationTime: 0,
        strategyComputationTime: 0,
        totalExecutionTime: 0
      }
    };
  }

  // 🟢 WORKING: Create default policies if none exist
  private async createDefaultPolicies(): Promise<void> {
    const defaultPolicies: FailurePolicy[] = [
      {
        id: 'github-api-policy',
        name: 'GitHub API Error Policy',
        description: 'Handles GitHub API errors with exponential backoff and rate limit recovery',
        conditions: [
          { field: 'category', operator: 'equals', value: 'github_integration' }
        ],
        retryStrategy: {
          strategyType: 'exponential',
          maxAttempts: 5,
          initialDelay: 1000,
          maxDelay: 30000,
          backoffMultiplier: 2,
          jitter: true,
          jitterType: 'full',
          giveUpAfter: 300000 // 5 minutes
        },
        circuitBreaker: {
          enabled: true,
          failureThreshold: 5,
          successThreshold: 2,
          timeout: 60000,
          halfOpenMaxCalls: 3
        },
        recoveryActions: [
          {
            actionType: 'github-rate-limit-wait',
            parameters: { respectHeaders: true },
            runBefore: true,
            priority: 10
          },
          {
            actionType: 'github-token-rotation',
            parameters: { fallbackTokens: [] },
            runAfter: true,
            priority: 8
          }
        ],
        priority: 10,
        enabled: true
      },
      {
        id: 'git-operations-policy',
        name: 'Git Operations Policy',
        description: 'Handles git command failures with cleanup and retry',
        conditions: [
          { field: 'category', operator: 'equals', value: 'worktree_management' }
        ],
        retryStrategy: {
          strategyType: 'linear',
          maxAttempts: 3,
          initialDelay: 2000,
          maxDelay: 10000,
          giveUpAfter: 120000 // 2 minutes
        },
        recoveryActions: [
          {
            actionType: 'git-cleanup',
            parameters: { resetHard: true, cleanUntracked: true },
            runBefore: true,
            priority: 10
          }
        ],
        priority: 9,
        enabled: true
      },
      {
        id: 'network-timeout-policy',
        name: 'Network Timeout Policy',
        description: 'Handles network timeouts and connectivity issues',
        conditions: [
          { field: 'category', operator: 'equals', value: 'timeout' },
          { field: 'category', operator: 'equals', value: 'network' }
        ],
        retryStrategy: {
          strategyType: 'exponential',
          maxAttempts: 4,
          initialDelay: 5000,
          maxDelay: 60000,
          backoffMultiplier: 1.5,
          jitter: true,
          giveUpAfter: 180000 // 3 minutes
        },
        priority: 8,
        enabled: true
      },
      {
        id: 'agent-execution-policy',
        name: 'Agent Execution Policy',
        description: 'Handles agent execution failures with state recovery',
        conditions: [
          { field: 'category', operator: 'equals', value: 'agent_execution' }
        ],
        retryStrategy: {
          strategyType: 'exponential',
          maxAttempts: 3,
          initialDelay: 2000,
          maxDelay: 20000,
          backoffMultiplier: 2,
          jitter: true
        },
        recoveryActions: [
          {
            actionType: 'agent-state-reset',
            parameters: { preserveContext: true },
            runBefore: true,
            priority: 9
          },
          {
            actionType: 'agent-fallback-assignment',
            parameters: { preferSameType: true },
            runAfter: true,
            priority: 7
          }
        ],
        priority: 9,
        enabled: true
      },
      {
        id: 'default-retry-policy',
        name: 'Default Retry Policy',
        description: 'Catch-all policy for unmatched errors',
        conditions: [], // Matches everything
        retryStrategy: {
          strategyType: 'exponential',
          maxAttempts: 3,
          initialDelay: 1000,
          maxDelay: 15000,
          backoffMultiplier: 2,
          jitter: true
        },
        priority: 1,
        enabled: true
      }
    ];

    // Store default policies
    for (const policy of defaultPolicies) {
      this.policies.set(policy.id, policy);
    }

    // Save to config file
    await this.savePoliciesConfig(defaultPolicies);
    
    enhancedLogger.info('Created default failure policies', {
      policiesCount: defaultPolicies.length
    });
  }

  // 🟢 WORKING: Save policies configuration to YAML file
  private async savePoliciesConfig(policies: FailurePolicy[]): Promise<void> {
    try {
      await fs.ensureDir(path.dirname(this.configPath));
      
      const config = {
        version: '1.0',
        description: 'ForgeFlow v2 Failure Policies Configuration',
        policies: policies
      };
      
      const yamlContent = yaml.stringify(config, {
        indent: 2,
        lineWidth: 100
      });
      
      await fs.writeFile(this.configPath, yamlContent, 'utf-8');
      
    } catch (error) {
      enhancedLogger.error('Failed to save policies configuration', {
        error: error.message,
        configPath: this.configPath
      });
    }
  }

  // 🟢 WORKING: Get policy execution metrics
  getPolicyMetrics(): Record<string, unknown> {
    const globalMetrics = {
      totalPoliciesLoaded: this.policies.size,
      enabledPolicies: Array.from(this.policies.values()).filter(p => p.enabled).length,
      operationMetrics: Object.fromEntries(this.metrics),
      policyEffectiveness: this.calculatePolicyEffectiveness(),
      systemHealth: this.calculateSystemHealth()
    };

    return globalMetrics;
  }

  // 🟢 WORKING: Calculate overall policy effectiveness
  private calculatePolicyEffectiveness(): Record<string, { 
    successRate: number; 
    totalApplications: number;
    averageRecoveryTime: number; 
  }> {
    const effectiveness: Record<string, any> = {};

    for (const [operation, metrics] of this.metrics.entries()) {
      let totalSuccesses = 0;
      let totalApplications = 0;

      for (const [policyId, policyMetrics] of metrics.policyEffectiveness.entries()) {
        totalSuccesses += policyMetrics.successes;
        totalApplications += policyMetrics.successes + policyMetrics.failures;
      }

      effectiveness[operation] = {
        successRate: totalApplications > 0 ? (totalSuccesses / totalApplications) * 100 : 100,
        totalApplications,
        averageRecoveryTime: metrics.averageRecoveryTime
      };
    }

    return effectiveness;
  }

  // 🟢 WORKING: Calculate system health based on policy performance
  private calculateSystemHealth(): {
    overallHealthScore: number;
    circuitBreakerHealth: number;
    policyEffectiveness: number;
    averageRecoveryTime: number;
  } {
    let totalTrips = 0;
    let totalRecoveries = 0;
    let totalOperations = 0;
    let totalRecoveryTime = 0;
    let recoveryCount = 0;

    for (const metrics of this.metrics.values()) {
      totalTrips += metrics.circuitBreakerTrips;
      totalRecoveries += metrics.successfulRecoveries;
      totalOperations += metrics.policiesApplied;
      
      if (metrics.averageRecoveryTime > 0) {
        totalRecoveryTime += metrics.averageRecoveryTime;
        recoveryCount++;
      }
    }

    const circuitBreakerHealth = totalOperations > 0 
      ? Math.max(0, 100 - (totalTrips / totalOperations) * 100)
      : 100;

    const policyEffectiveness = totalOperations > 0 
      ? (totalRecoveries / totalOperations) * 100
      : 100;

    const averageRecoveryTime = recoveryCount > 0 
      ? totalRecoveryTime / recoveryCount
      : 0;

    const overallHealthScore = Math.round(
      (circuitBreakerHealth * 0.4) + (policyEffectiveness * 0.6)
    );

    return {
      overallHealthScore,
      circuitBreakerHealth: Math.round(circuitBreakerHealth),
      policyEffectiveness: Math.round(policyEffectiveness),
      averageRecoveryTime: Math.round(averageRecoveryTime)
    };
  }

  // 🟢 WORKING: Add or update a failure policy
  async addPolicy(policy: FailurePolicy): Promise<void> {
    const processedPolicy = await this.processPolicy(policy);
    this.policies.set(processedPolicy.id, processedPolicy);
    this.policyCache.clear(); // Clear cache to force re-evaluation
    
    enhancedLogger.info('Added failure policy', {
      policyId: processedPolicy.id,
      name: processedPolicy.name,
      enabled: processedPolicy.enabled
    });
  }

  // 🟢 WORKING: Remove a failure policy
  removePolicy(policyId: string): boolean {
    const removed = this.policies.delete(policyId);
    if (removed) {
      this.policyCache.clear();
      enhancedLogger.info('Removed failure policy', { policyId });
    }
    return removed;
  }

  // 🟢 WORKING: Enable or disable a policy
  togglePolicy(policyId: string, enabled: boolean): boolean {
    const policy = this.policies.get(policyId);
    if (policy) {
      policy.enabled = enabled;
      this.policyCache.clear();
      enhancedLogger.info('Toggled failure policy', { policyId, enabled });
      return true;
    }
    return false;
  }

  // 🟢 WORKING: Get all policies
  getAllPolicies(): FailurePolicy[] {
    return Array.from(this.policies.values());
  }

  // 🟢 WORKING: Get policy by ID
  getPolicy(policyId: string): FailurePolicy | undefined {
    return this.policies.get(policyId);
  }

  // 🟢 WORKING: Reload policies from configuration
  async reloadPolicies(): Promise<void> {
    await this.loadPolicies();
  }

  // 🟢 WORKING: Record successful operation outcome
  recordPolicyOutcome(operationName: string, policyId: string, success: boolean, recoveryTime?: number): void {
    const operationMetrics = this.metrics.get(operationName);
    if (operationMetrics) {
      const policyMetrics = operationMetrics.policyEffectiveness.get(policyId);
      if (policyMetrics) {
        if (success) {
          policyMetrics.successes++;
          operationMetrics.successfulRecoveries++;
          
          if (recoveryTime !== undefined) {
            const currentAvg = operationMetrics.averageRecoveryTime;
            const totalRecoveries = operationMetrics.successfulRecoveries;
            operationMetrics.averageRecoveryTime = 
              (currentAvg * (totalRecoveries - 1) + recoveryTime) / totalRecoveries;
          }
        } else {
          policyMetrics.failures++;
        }
      }
    }
  }
}

// 🟢 WORKING: Export singleton instance for easy access
export const failurePolicyManager = FailurePolicyManager.getInstance();