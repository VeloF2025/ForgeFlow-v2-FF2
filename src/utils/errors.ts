/**
 * Comprehensive Error Handling and Validation Framework
 * Centralized error types and handling utilities for ForgeFlow v2
 */

import { enhancedLogger } from './enhanced-logger';

// 🟢 ENHANCED: Failure policy system integration (lazy loaded to avoid circular deps)
let failurePolicyManagerInstance: any = null;
let recoveryActionManagerInstance: any = null;

// Lazy loading functions to avoid circular dependencies
async function getFailurePolicyManager() {
  if (!failurePolicyManagerInstance) {
    const { failurePolicyManager } = await import('../policies/failure-policy-manager');
    failurePolicyManagerInstance = failurePolicyManager;

    // Initialize policies if not already loaded
    try {
      await failurePolicyManagerInstance.loadPolicies();
    } catch (error) {
      enhancedLogger.warn('Failed to load failure policies, using defaults', {
        error: error.message,
      });
    }
  }
  return failurePolicyManagerInstance;
}

async function getRecoveryActionManager() {
  if (!recoveryActionManagerInstance) {
    const { recoveryActionManager } = await import('../policies/recovery-actions');
    recoveryActionManagerInstance = recoveryActionManager;
  }
  return recoveryActionManagerInstance;
}

export class ForgeFlowError extends Error {
  public readonly code: string;
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly context?: Record<string, unknown>;
  public readonly timestamp: Date;
  public readonly recoverable: boolean;
  public readonly userMessage?: string;

  constructor(options: {
    code: string;
    message: string;
    category: ErrorCategory;
    severity?: ErrorSeverity;
    context?: Record<string, unknown>;
    recoverable?: boolean;
    userMessage?: string;
    cause?: Error;
    [key: string]: unknown; // Allow additional properties
  }) {
    super(options.message);
    this.name = 'ForgeFlowError';
    this.code = options.code;
    this.category = options.category;
    this.severity = options.severity || ErrorSeverity.MEDIUM;
    this.context = options.context;
    this.timestamp = new Date();
    this.recoverable = options.recoverable ?? true;
    this.userMessage = options.userMessage;

    if (options.cause) {
      this.cause = options.cause;
    }
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      category: this.category,
      severity: this.severity,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      recoverable: this.recoverable,
      userMessage: this.userMessage,
      stack: this.stack,
    };
  }
}

export enum ErrorCategory {
  VALIDATION = 'validation',
  CONFIGURATION = 'configuration',
  GITHUB_INTEGRATION = 'github_integration',
  AGENT_EXECUTION = 'agent_execution',
  WORKTREE_MANAGEMENT = 'worktree_management',
  PROTOCOL_ENFORCEMENT = 'protocol_enforcement',
  QUALITY_GATES = 'quality_gates',
  SECURITY = 'security',
  NETWORK = 'network',
  FILE_SYSTEM = 'file_system',
  DATABASE = 'database',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  RATE_LIMITING = 'rate_limiting',
  TIMEOUT = 'timeout',
  RESOURCE_EXHAUSTION = 'resource_exhaustion',
  EXTERNAL_SERVICE = 'external_service',
  CIRCUIT_BREAKER = 'circuit_breaker',
  INTERNAL_ERROR = 'internal_error',
  DATA_PROTECTION = 'data_protection',
  SYSTEM_HEALTH = 'system_health',
  SYSTEM_RESILIENCE = 'system_resilience',
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
  // Additional severity levels for compatibility
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
}

// Specific error classes for common scenarios
export class ValidationError extends ForgeFlowError {
  constructor(
    field: string,
    value: unknown,
    expectedType: string,
    context?: Record<string, unknown>,
  ) {
    super({
      code: 'VALIDATION_FAILED',
      message: `Validation failed for field '${field}': expected ${expectedType}, got ${typeof value}`,
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.MEDIUM,
      context: { field, value, expectedType, ...context },
      recoverable: true,
      userMessage: `Invalid value for ${field}. Expected ${expectedType}.`,
    });
  }
}

export class ConfigurationError extends ForgeFlowError {
  constructor(configKey: string, reason: string, context?: Record<string, unknown>) {
    super({
      code: 'CONFIG_ERROR',
      message: `Configuration error for '${configKey}': ${reason}`,
      category: ErrorCategory.CONFIGURATION,
      severity: ErrorSeverity.HIGH,
      context: { configKey, reason, ...context },
      recoverable: false,
      userMessage: `Configuration issue: ${reason}`,
    });
  }
}

export class GitHubIntegrationError extends ForgeFlowError {
  constructor(
    operation: string,
    statusCode?: number,
    githubError?: string,
    context?: Record<string, unknown>,
  ) {
    const severity = statusCode && statusCode >= 500 ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM;
    super({
      code: 'GITHUB_API_ERROR',
      message: `GitHub API error during ${operation}: ${githubError || 'Unknown error'}`,
      category: ErrorCategory.GITHUB_INTEGRATION,
      severity,
      context: { operation, statusCode, githubError, ...context },
      recoverable: statusCode ? statusCode < 500 : true,
      userMessage: `GitHub operation failed: ${operation}`,
    });
  }
}

export class AgentExecutionError extends ForgeFlowError {
  constructor(agentId: string, taskId: string, reason: string, context?: Record<string, unknown>) {
    super({
      code: 'AGENT_EXECUTION_FAILED',
      message: `Agent ${agentId} failed to execute task ${taskId}: ${reason}`,
      category: ErrorCategory.AGENT_EXECUTION,
      severity: ErrorSeverity.HIGH,
      context: { agentId, taskId, reason, ...context },
      recoverable: true,
      userMessage: `Task execution failed: ${reason}`,
    });
  }
}

export class WorktreeError extends ForgeFlowError {
  constructor(
    operation: string,
    worktreePath: string,
    reason: string,
    context?: Record<string, unknown>,
  ) {
    super({
      code: 'WORKTREE_ERROR',
      message: `Worktree ${operation} failed for ${worktreePath}: ${reason}`,
      category: ErrorCategory.WORKTREE_MANAGEMENT,
      severity: ErrorSeverity.HIGH,
      context: { operation, worktreePath, reason, ...context },
      recoverable: true,
      userMessage: `Worktree operation failed: ${operation}`,
    });
  }
}

export class SecurityError extends ForgeFlowError {
  constructor(violation: string, context?: Record<string, unknown>) {
    super({
      code: 'SECURITY_VIOLATION',
      message: `Security violation: ${violation}`,
      category: ErrorCategory.SECURITY,
      severity: ErrorSeverity.CRITICAL,
      context,
      recoverable: false,
      userMessage: 'Security policy violation detected',
    });
  }
}

export class ResourceExhaustedError extends ForgeFlowError {
  constructor(resource: string, limit: number, current: number, context?: Record<string, unknown>) {
    super({
      code: 'RESOURCE_EXHAUSTED',
      message: `Resource exhausted: ${resource} (limit: ${limit}, current: ${current})`,
      category: ErrorCategory.RESOURCE_EXHAUSTION,
      severity: ErrorSeverity.HIGH,
      context: { resource, limit, current, ...context },
      recoverable: false,
      userMessage: `System resource limit reached: ${resource}`,
    });
  }
}

// Error handler utility functions
export class ErrorHandler {
  private static instance: ErrorHandler;
  private errorCounts = new Map<string, number>();
  private lastErrors = new Map<string, Date>();

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  // 🟢 ENHANCED: Handle error with alerting and improved tracking
  handleError(error: Error | ForgeFlowError): ForgeFlowError {
    // Convert regular Error to ForgeFlowError if needed
    const forgeFlowError =
      error instanceof ForgeFlowError
        ? error
        : new ForgeFlowError({
            code: 'UNKNOWN_ERROR',
            message: error.message,
            category: ErrorCategory.INTERNAL_ERROR,
            severity: ErrorSeverity.MEDIUM,
            context: { originalError: error.name },
            cause: error,
          });

    // Track error frequency
    const errorKey = `${forgeFlowError.category}-${forgeFlowError.code}`;
    this.errorCounts.set(errorKey, (this.errorCounts.get(errorKey) || 0) + 1);
    this.lastErrors.set(errorKey, new Date());

    // Check for critical error conditions and notify alerts
    if (
      forgeFlowError.severity === ErrorSeverity.CRITICAL ||
      (this.errorCounts.get(errorKey) || 0) >= this.criticalErrorThreshold
    ) {
      this.notifyAlerts(forgeFlowError);
    }

    return forgeFlowError;
  }

  isRecurringError(error: ForgeFlowError, threshold = 5, timeWindow = 300000): boolean {
    const errorKey = `${error.category}-${error.code}`;
    const count = this.errorCounts.get(errorKey) || 0;
    const lastOccurrence = this.lastErrors.get(errorKey);

    if (!lastOccurrence) return false;

    const timeDiff = Date.now() - lastOccurrence.getTime();
    return count >= threshold && timeDiff <= timeWindow;
  }

  // 🟢 ENHANCED: Enhanced metrics tracking with fallback and recovery support
  private successCounts = new Map<string, number>();
  private operationDurations = new Map<string, number[]>();
  private lastOperationTimes = new Map<string, Date>();
  private fallbackMetrics = new Map<string, { successes: number; failures: number }>();
  private recoveryMetrics = new Map<
    string,
    { attempts: number; successes: number; failures: number }
  >();
  private criticalErrorThreshold = 10;
  private alertCallbacks = new Set<(error: ForgeFlowError) => void>();

  recordSuccess(operationName: string, duration: number): void {
    this.successCounts.set(operationName, (this.successCounts.get(operationName) || 0) + 1);

    const durations = this.operationDurations.get(operationName) || [];
    durations.push(duration);

    // Keep only last 100 duration measurements
    if (durations.length > 100) {
      durations.shift();
    }

    this.operationDurations.set(operationName, durations);
    this.lastOperationTimes.set(operationName, new Date());
  }

  recordFailure(operationName: string, error: Error, duration: number): void {
    const errorKey = `${operationName}-${error.constructor.name}`;
    this.errorCounts.set(errorKey, (this.errorCounts.get(errorKey) || 0) + 1);
    this.lastErrors.set(errorKey, new Date());
    this.lastOperationTimes.set(operationName, new Date());
  }

  // 🟢 NEW: Enhanced metrics with fallback and recovery tracking
  getErrorMetrics() {
    return {
      totalErrors: Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0),
      totalSuccesses: Array.from(this.successCounts.values()).reduce(
        (sum, count) => sum + count,
        0,
      ),
      errorsByCategory: this.groupErrorsByCategory(),
      errorsBySeverity: this.groupErrorsBySeverity(),
      recurringErrors: this.getRecurringErrors(),
      operationMetrics: this.getOperationMetrics(),
      healthScore: this.calculateHealthScore(),
      fallbackMetrics: Object.fromEntries(this.fallbackMetrics),
      recoveryMetrics: Object.fromEntries(this.recoveryMetrics),
      systemResilience: this.calculateSystemResilience(),
    };
  }

  // 🟢 NEW: Record fallback operation results
  recordFallbackSuccess(operationName: string): void {
    const current = this.fallbackMetrics.get(operationName) || { successes: 0, failures: 0 };
    current.successes++;
    this.fallbackMetrics.set(operationName, current);
  }

  recordFallbackFailure(operationName: string, error: Error): void {
    const current = this.fallbackMetrics.get(operationName) || { successes: 0, failures: 0 };
    current.failures++;
    this.fallbackMetrics.set(operationName, current);
  }

  // 🟢 NEW: Record recovery attempt results
  recordRecoveryFailure(operationName: string, strategyName: string, error: Error): void {
    const key = `${operationName}:${strategyName}`;
    const current = this.recoveryMetrics.get(key) || { attempts: 0, successes: 0, failures: 0 };
    current.attempts++;
    current.failures++;
    this.recoveryMetrics.set(key, current);
  }

  recordRecoverySuccess(operationName: string, strategyName: string): void {
    const key = `${operationName}:${strategyName}`;
    const current = this.recoveryMetrics.get(key) || { attempts: 0, successes: 0, failures: 0 };
    current.attempts++;
    current.successes++;
    this.recoveryMetrics.set(key, current);
  }

  // 🟢 NEW: Calculate system resilience score
  private calculateSystemResilience(): number {
    let totalRecoveryAttempts = 0;
    let successfulRecoveries = 0;
    let fallbackSuccessRate = 0;
    let fallbackUsageCount = 0;

    // Recovery success rate
    for (const metrics of this.recoveryMetrics.values()) {
      totalRecoveryAttempts += metrics.attempts;
      successfulRecoveries += metrics.successes;
    }

    // Fallback success rate
    for (const metrics of this.fallbackMetrics.values()) {
      const total = metrics.successes + metrics.failures;
      if (total > 0) {
        fallbackSuccessRate += metrics.successes / total;
        fallbackUsageCount++;
      }
    }

    const recoveryRate =
      totalRecoveryAttempts > 0 ? (successfulRecoveries / totalRecoveryAttempts) * 100 : 100;
    const avgFallbackRate =
      fallbackUsageCount > 0 ? (fallbackSuccessRate / fallbackUsageCount) * 100 : 100;
    const healthScore = this.calculateHealthScore();

    // Weighted resilience score
    return Math.round(recoveryRate * 0.4 + avgFallbackRate * 0.3 + healthScore * 0.3);
  }

  // 🟢 NEW: Alert system for critical errors
  onCriticalError(callback: (error: ForgeFlowError) => void): void {
    this.alertCallbacks.add(callback);
  }

  private notifyAlerts(error: ForgeFlowError): void {
    for (const callback of this.alertCallbacks) {
      try {
        callback(error);
      } catch (alertError) {
        console.error('Alert callback failed:', alertError);
      }
    }
  }

  private getOperationMetrics() {
    const metrics: Record<
      string,
      {
        successCount: number;
        errorCount: number;
        successRate: number;
        averageDuration: number;
        lastExecution: Date | null;
      }
    > = {};

    // Collect all operation names
    const operations = new Set([
      ...Array.from(this.successCounts.keys()),
      ...Array.from(this.errorCounts.keys()).map((key) => key.split('-')[0]),
    ]);

    for (const operation of operations) {
      const successCount = this.successCounts.get(operation) || 0;
      const errorCount = Array.from(this.errorCounts.entries())
        .filter(([key]) => key.startsWith(operation + '-'))
        .reduce((sum, [, count]) => sum + count, 0);

      const totalCount = successCount + errorCount;
      const successRate = totalCount > 0 ? (successCount / totalCount) * 100 : 100;

      const durations = this.operationDurations.get(operation) || [];
      const averageDuration =
        durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length : 0;

      metrics[operation] = {
        successCount,
        errorCount,
        successRate,
        averageDuration,
        lastExecution: this.lastOperationTimes.get(operation) || null,
      };
    }

    return metrics;
  }

  private calculateHealthScore(): number {
    const metrics = this.getOperationMetrics();
    const operations = Object.values(metrics);

    if (operations.length === 0) return 100;

    const averageSuccessRate =
      operations.reduce((sum, op) => sum + op.successRate, 0) / operations.length;
    const recentOperations = operations.filter(
      (op) => op.lastExecution && Date.now() - op.lastExecution.getTime() < 24 * 60 * 60 * 1000,
    );

    const recencyScore = recentOperations.length > 0 ? 100 : 80;
    const errorScore = Math.max(0, 100 - this.getRecurringErrors().length * 10);

    return Math.round(averageSuccessRate * 0.6 + recencyScore * 0.2 + errorScore * 0.2);
  }

  private groupErrorsByCategory() {
    const byCategory = new Map<ErrorCategory, number>();
    for (const [key, count] of this.errorCounts) {
      const category = key.split('-')[0] as ErrorCategory;
      byCategory.set(category, (byCategory.get(category) || 0) + count);
    }
    return Object.fromEntries(byCategory);
  }

  private errorSeverities = new Map<string, ErrorSeverity>();

  setSeverityForError(errorKey: string, severity: ErrorSeverity): void {
    this.errorSeverities.set(errorKey, severity);
  }

  private groupErrorsBySeverity() {
    const severities = { low: 0, medium: 0, high: 0, critical: 0 };

    for (const [errorKey, count] of this.errorCounts) {
      const severity = this.errorSeverities.get(errorKey) || ErrorSeverity.MEDIUM;
      severities[severity] += count;
    }

    return severities;
  }

  private getRecurringErrors() {
    return Array.from(this.errorCounts.entries())
      .filter(([_, count]) => count >= 5)
      .map(([key, count]) => ({ key, count }));
  }
}

// Enhanced validation utilities with comprehensive input validation
export class ValidationUtils {
  static validateRequired(value: unknown, fieldName: string): void {
    if (value === undefined || value === null || value === '') {
      throw new ValidationError(fieldName, value, 'non-empty value');
    }
  }

  static validateString(
    value: unknown,
    fieldName: string,
    minLength = 0,
    maxLength = Infinity,
  ): void {
    if (typeof value !== 'string') {
      throw new ValidationError(fieldName, value, 'string');
    }
    if (value.length < minLength) {
      throw new ValidationError(fieldName, value, `string with length >= ${minLength}`);
    }
    if (value.length > maxLength) {
      throw new ValidationError(fieldName, value, `string with length <= ${maxLength}`);
    }
  }

  static validateNumber(value: unknown, fieldName: string, min = -Infinity, max = Infinity): void {
    if (typeof value !== 'number' || isNaN(value)) {
      throw new ValidationError(fieldName, value, 'number');
    }
    if (value < min) {
      throw new ValidationError(fieldName, value, `number >= ${min}`);
    }
    if (value > max) {
      throw new ValidationError(fieldName, value, `number <= ${max}`);
    }
  }

  static validateArray(value: unknown, fieldName: string, minLength = 0): void {
    if (!Array.isArray(value)) {
      throw new ValidationError(fieldName, value, 'array');
    }
    if (value.length < minLength) {
      throw new ValidationError(fieldName, value, `array with length >= ${minLength}`);
    }
  }

  static validateEnum<T>(value: unknown, fieldName: string, enumValues: T[]): void {
    if (!enumValues.includes(value as T)) {
      throw new ValidationError(fieldName, value, `one of: ${enumValues.join(', ')}`);
    }
  }

  static validateEmail(value: unknown, fieldName: string): void {
    this.validateString(value, fieldName);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value as string)) {
      throw new ValidationError(fieldName, value, 'valid email address');
    }
  }

  static validateUrl(value: unknown, fieldName: string): void {
    this.validateString(value, fieldName);
    try {
      new URL(value as string);
    } catch {
      throw new ValidationError(fieldName, value, 'valid URL');
    }
  }

  static validateGitHubRepo(value: unknown, fieldName: string): void {
    this.validateString(value, fieldName);
    const repoRegex = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
    if (!repoRegex.test(value as string)) {
      throw new ValidationError(fieldName, value, 'valid GitHub repository (owner/repo)');
    }
  }

  // New enhanced validation methods
  static validateGitHubToken(value: unknown, fieldName: string): void {
    this.validateString(value, fieldName, 10);
    const tokenPattern =
      /^gh[pousr]_[A-Za-z0-9_]{36,255}$|^[A-Fa-f0-9]{40}$|^[A-Za-z0-9_]{40,255}$/;
    if (!tokenPattern.test(value as string)) {
      throw new ValidationError(
        fieldName,
        '[REDACTED]',
        'valid GitHub token (ghp_, gho_, ghu_, ghs_, or ghp format)',
      );
    }
  }

  static validatePath(value: unknown, fieldName: string, mustExist = false): void {
    this.validateString(value, fieldName, 1);
    const path = value as string;

    // Basic path validation
    if (path.includes('..') || path.includes('\0')) {
      throw new ValidationError(fieldName, value, 'safe file path without directory traversal');
    }

    if (mustExist) {
      // This would require file system access - implement when needed
      // For now, just validate the format
    }
  }

  static validatePort(value: unknown, fieldName: string): void {
    this.validateNumber(value, fieldName, 1, 65535);
  }

  static validateTimeout(value: unknown, fieldName: string): void {
    this.validateNumber(value, fieldName, 100, 600000); // 100ms to 10 minutes
  }

  static validateAgentType(value: unknown, fieldName: string): void {
    const validAgentTypes = [
      'strategic-planner',
      'system-architect',
      'code-implementer',
      'test-coverage-validator',
      'security-auditor',
      'performance-optimizer',
      'ui-ux-optimizer',
      'database-architect',
      'deployment-automation',
      'code-quality-reviewer',
      'antihallucination-validator',
    ];
    this.validateEnum(value, fieldName, validAgentTypes);
  }

  static validateExecutionPattern(value: unknown, fieldName: string): void {
    const validPatterns = [
      'feature-development',
      'bug-fix-sprint',
      'refactoring',
      'security-audit',
      'performance-optimization',
      'testing-enhancement',
    ];
    this.validateEnum(value, fieldName, validPatterns);
  }

  static validatePriority(value: unknown, fieldName: string): void {
    const validPriorities = ['low', 'normal', 'high', 'emergency'];
    this.validateEnum(value, fieldName, validPriorities);
  }

  static validateJson(value: unknown, fieldName: string): void {
    if (typeof value === 'string') {
      try {
        JSON.parse(value);
      } catch {
        throw new ValidationError(fieldName, '[INVALID JSON]', 'valid JSON string');
      }
    } else if (typeof value !== 'object' || value === null) {
      throw new ValidationError(fieldName, value, 'valid JSON object or string');
    }
  }

  static validateObject<T>(
    value: unknown,
    fieldName: string,
    schema: Record<string, (val: unknown) => void>,
  ): T {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new ValidationError(fieldName, value, 'object');
    }

    const obj = value as Record<string, unknown>;
    const validated: Record<string, unknown> = {};

    for (const [key, validator] of Object.entries(schema)) {
      try {
        validator(obj[key]);
        validated[key] = obj[key];
      } catch (error) {
        if (error instanceof ValidationError) {
          throw new ValidationError(
            `${fieldName}.${key}`,
            obj[key],
            error.userMessage || error.message,
          );
        }
        throw error;
      }
    }

    return validated as T;
  }

  // Sanitization utilities
  static sanitizeString(value: string, maxLength = 1000): string {
    return value
      .trim()
      .replace(/[\0\x08\x09\x1a\n\r"'\\%]/g, '') // Remove potential SQL injection chars
      .slice(0, maxLength);
  }

  static sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .slice(0, 255);
  }

  // Rate limiting validation
  private static rateLimits = new Map<string, { count: number; resetTime: number }>();

  static validateRateLimit(identifier: string, maxRequests = 100, windowMs = 60000): void {
    const now = Date.now();
    const key = identifier;
    const current = this.rateLimits.get(key);

    if (!current || now > current.resetTime) {
      this.rateLimits.set(key, { count: 1, resetTime: now + windowMs });
      return;
    }

    if (current.count >= maxRequests) {
      throw new ForgeFlowError({
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit exceeded for ${identifier}`,
        category: ErrorCategory.RATE_LIMITING,
        severity: ErrorSeverity.MEDIUM,
        context: { identifier, maxRequests, windowMs },
        recoverable: true,
        userMessage: `Too many requests. Please try again in ${Math.ceil((current.resetTime - now) / 1000)} seconds.`,
      });
    }

    current.count++;
  }
}

// 🟢 ENHANCED: Execute operation with failure policy system
async function executeWithFailurePolicies<T>(
  operation: () => Promise<T>,
  context: any,
  attemptHistory: Array<{ attempt: number; error: Error; duration: number; timestamp: Date }>,
): Promise<T> {
  const { operationName, category, timeoutMs } = context;
  const failurePolicyManager = await getFailurePolicyManager();
  const recoveryActionManager = await getRecoveryActionManager();

  let attempt = 1;
  let lastError: Error;

  while (true) {
    const attemptStartTime = Date.now();

    try {
      let result: T;

      if (timeoutMs) {
        result = await Promise.race([
          operation(),
          new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(
                new ForgeFlowError({
                  code: 'OPERATION_TIMEOUT',
                  message: `Operation '${operationName}' timed out after ${timeoutMs}ms`,
                  category: ErrorCategory.TIMEOUT,
                  severity: ErrorSeverity.HIGH,
                  context: { operationName, timeoutMs, attempt },
                  recoverable: attempt < 10, // Allow policy to decide on retries
                  userMessage: `Operation timed out. Please try again.`,
                }),
              );
            }, timeoutMs);
          }),
        ]);
      } else {
        result = await operation();
      }

      // Success - record policy outcome and return
      if (attemptHistory.length > 0) {
        const firstAttempt = attemptHistory[0];
        const policyId = (firstAttempt as any).policyId || 'unknown';
        const recoveryTime = Date.now() - (attemptHistory[0]?.timestamp?.getTime() || Date.now());

        failurePolicyManager.recordPolicyOutcome(operationName, policyId, true, recoveryTime);
      }

      return result;
    } catch (error) {
      lastError = error as Error;
      const attemptDuration = Date.now() - attemptStartTime;

      // Record attempt in history
      attemptHistory.push({
        attempt,
        error: lastError,
        duration: attemptDuration,
        timestamp: new Date(),
      });

      // Create policy execution context
      const policyContext = {
        operationName,
        error: lastError,
        attempt,
        totalAttempts: attempt,
        previousAttempts: attemptHistory,
        metadata: { category, timeoutMs },
      };

      // Execute failure policy
      const policyResult = await failurePolicyManager.executePolicy(policyContext);

      // Store policy ID for outcome tracking
      (attemptHistory[attemptHistory.length - 1] as any).policyId = policyResult.policyApplied;

      enhancedLogger.debug('Failure policy executed', {
        operationName,
        attempt,
        policyApplied: policyResult.policyApplied,
        shouldRetry: policyResult.shouldRetry,
        delayMs: policyResult.delayMs,
        recoveryActions: policyResult.recoveryActions.length,
      });

      // Execute recovery actions if any
      if (policyResult.recoveryActions.length > 0) {
        const recoveryContext = {
          operationName,
          error: lastError,
          attempt,
          totalAttempts: attempt,
          metadata: { category, timeoutMs, policyResult },
        };

        try {
          const recoveryResults = await recoveryActionManager.executeRecoveryActions(
            policyResult.recoveryActions,
            recoveryContext,
          );

          const successfulRecoveries = recoveryResults.filter((r) => r.success);
          enhancedLogger.info('Recovery actions completed', {
            operationName,
            totalActions: recoveryResults.length,
            successful: successfulRecoveries.length,
            totalDuration: recoveryResults.reduce((sum, r) => sum + r.duration, 0),
          });

          // If all recovery actions failed, don't retry
          if (successfulRecoveries.length === 0 && recoveryResults.length > 0) {
            enhancedLogger.warn('All recovery actions failed, stopping retries', {
              operationName,
              attempt,
            });
            break;
          }
        } catch (recoveryError) {
          enhancedLogger.error(`Recovery action execution failed for ${operationName}`, undefined, {
            errorMessage:
              recoveryError instanceof Error ? recoveryError.message : String(recoveryError),
            attempt,
          });
          // Continue with normal retry logic
        }
      }

      // Check if we should retry based on policy decision
      if (!policyResult.shouldRetry) {
        // Record failed policy outcome
        failurePolicyManager.recordPolicyOutcome(operationName, policyResult.policyApplied, false);
        break;
      }

      // Wait for the calculated delay before retry
      if (policyResult.delayMs > 0) {
        enhancedLogger.debug('Waiting before retry', {
          operationName,
          attempt,
          delayMs: policyResult.delayMs,
        });
        await new Promise((resolve) => setTimeout(resolve, policyResult.delayMs));
      }

      attempt++;
    }
  }

  // All retries exhausted or policy decided not to retry
  const finalPolicyId = (attemptHistory[attemptHistory.length - 1] as any)?.policyId || 'unknown';
  failurePolicyManager.recordPolicyOutcome(operationName, finalPolicyId, false);

  throw ErrorHandler.getInstance().handleError(
    new ForgeFlowError({
      code: 'OPERATION_FAILED_WITH_POLICIES',
      message: `Operation '${operationName}' failed after ${attempt} attempts using failure policies: ${lastError.message}`,
      category,
      severity: getErrorSeverity(lastError),
      context: {
        operationName,
        attempts: attempt,
        lastError: lastError.message,
        totalDuration: Date.now() - attemptHistory[0].timestamp.getTime(),
        policyExecutions: attemptHistory.map((h) => ({
          attempt: h.attempt,
          duration: h.duration,
          policyId: (h as any).policyId,
        })),
      },
      recoverable: false,
      userMessage: getUserFriendlyErrorMessage(operationName, lastError),
      cause: lastError,
    }),
  );
}

// Enhanced async operation wrapper with comprehensive error handling and recovery
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context: {
    operationName: string;
    category: ErrorCategory;
    retries?: number;
    timeoutMs?: number;
    onRetry?: (attempt: number, error: Error) => void;
    shouldRetry?: (error: Error) => boolean;
    backoffMultiplier?: number;
    maxBackoffMs?: number;
    circuitBreaker?: boolean;
    recoveryStrategies?: ErrorRecoveryStrategy[];
    priority?: number;
    useFailurePolicies?: boolean; // 🟢 NEW: Enable failure policy system
  },
): Promise<T> {
  const {
    operationName,
    category,
    retries = 0,
    timeoutMs,
    onRetry,
    shouldRetry,
    backoffMultiplier = 2,
    maxBackoffMs = 30000,
    circuitBreaker = false,
    useFailurePolicies = false, // 🟢 NEW: Enable advanced failure policies
  } = context;

  let lastError: Error;
  const startTime = Date.now();
  const attemptHistory: Array<{
    attempt: number;
    error: Error;
    duration: number;
    timestamp: Date;
  }> = [];

  // 🟢 ENHANCED: Use failure policy system if enabled
  if (useFailurePolicies) {
    return executeWithFailurePolicies(operation, context, attemptHistory);
  }

  // Circuit breaker check (legacy implementation)
  if (circuitBreaker && CircuitBreaker.isOpen(operationName)) {
    throw new ForgeFlowError({
      code: 'CIRCUIT_BREAKER_OPEN',
      message: `Circuit breaker is open for operation: ${operationName}`,
      category: ErrorCategory.EXTERNAL_SERVICE,
      severity: ErrorSeverity.HIGH,
      context: { operationName },
      recoverable: false,
      userMessage: `Service temporarily unavailable. Please try again later.`,
    });
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let result: T;

      if (timeoutMs) {
        result = await Promise.race([
          operation(),
          new Promise<never>((_, reject) => {
            const timeoutId = setTimeout(() => {
              reject(
                new ForgeFlowError({
                  code: 'OPERATION_TIMEOUT',
                  message: `Operation '${operationName}' timed out after ${timeoutMs}ms`,
                  category: ErrorCategory.TIMEOUT,
                  severity: ErrorSeverity.HIGH,
                  context: { operationName, timeoutMs, attempt },
                  recoverable: attempt < retries,
                  userMessage: `Operation timed out. Please try again.`,
                }),
              );
            }, timeoutMs);

            // Store timeout ID for potential cleanup
            (reject as any).timeoutId = timeoutId;
          }),
        ]);
      } else {
        result = await operation();
      }

      // Success - record metrics and reset circuit breaker
      const duration = Date.now() - startTime;
      ErrorHandler.getInstance().recordSuccess(operationName, duration);

      if (circuitBreaker) {
        CircuitBreaker.recordSuccess(operationName);
      }

      return result;
    } catch (error) {
      lastError = error as Error;
      const duration = Date.now() - startTime;

      // Record failure metrics
      ErrorHandler.getInstance().recordFailure(operationName, lastError, duration);

      if (circuitBreaker) {
        CircuitBreaker.recordFailure(operationName);
      }

      // Check if we should retry this error
      const shouldRetryThis = shouldRetry ? shouldRetry(lastError) : isRetryableError(lastError);

      if (attempt < retries && shouldRetryThis) {
        const backoffMs = Math.min(Math.pow(backoffMultiplier, attempt) * 1000, maxBackoffMs);

        onRetry?.(attempt + 1, lastError);

        // Add jitter to prevent thundering herd
        const jitteredBackoff = backoffMs + Math.random() * 1000;
        await new Promise((resolve) => setTimeout(resolve, jitteredBackoff));

        continue;
      }

      break; // Don't retry
    }
  }

  throw ErrorHandler.getInstance().handleError(
    new ForgeFlowError({
      code: 'OPERATION_FAILED',
      message: `Operation '${operationName}' failed after ${retries + 1} attempts: ${lastError.message}`,
      category,
      severity: getErrorSeverity(lastError),
      context: {
        operationName,
        attempts: retries + 1,
        lastError: lastError.message,
        totalDuration: Date.now() - startTime,
      },
      recoverable: false,
      userMessage: getUserFriendlyErrorMessage(operationName, lastError),
      cause: lastError,
    }),
  );
}

// Helper functions for enhanced error handling
function isRetryableError(error: Error): boolean {
  if (error instanceof ForgeFlowError) {
    return (
      error.recoverable &&
      [
        ErrorCategory.NETWORK,
        ErrorCategory.EXTERNAL_SERVICE,
        ErrorCategory.TIMEOUT,
        ErrorCategory.RATE_LIMITING,
      ].includes(error.category)
    );
  }

  // Network/timeout errors are generally retryable
  const retryableMessages = [
    'timeout',
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'socket hang up',
    'network',
    'Rate limit',
  ];

  return retryableMessages.some((msg) => error.message.toLowerCase().includes(msg.toLowerCase()));
}

function getErrorSeverity(error: Error): ErrorSeverity {
  if (error instanceof ForgeFlowError) {
    return error.severity;
  }

  // Determine severity based on error type
  if (error.message.includes('timeout') || error.message.includes('network')) {
    return ErrorSeverity.MEDIUM;
  }

  if (error.message.includes('unauthorized') || error.message.includes('forbidden')) {
    return ErrorSeverity.HIGH;
  }

  return ErrorSeverity.MEDIUM;
}

function getUserFriendlyErrorMessage(operationName: string, error: Error): string {
  if (error instanceof ForgeFlowError && error.userMessage) {
    return error.userMessage;
  }

  // Generate user-friendly messages based on operation and error type
  const friendlyMessages: Record<string, string> = {
    'github-api': 'GitHub API request failed. Please check your token and network connection.',
    'git-operation': 'Git operation failed. Please check repository access and try again.',
    'file-operation': 'File operation failed. Please check file permissions and disk space.',
    'agent-execution': 'Agent task failed. The system will automatically retry.',
    'worktree-operation':
      'Repository worktree operation failed. Please ensure clean repository state.',
  };

  const friendlyMessage = Object.entries(friendlyMessages).find(([key]) =>
    operationName.includes(key),
  )?.[1];

  return (
    friendlyMessage || `Operation '${operationName}' failed. Please try again or contact support.`
  );
}

// Circuit breaker implementation for external service calls
class CircuitBreaker {
  private static circuits = new Map<
    string,
    {
      failures: number;
      successes: number;
      lastFailureTime: number;
      lastSuccessTime: number;
      state: 'closed' | 'open' | 'half-open';
      nextAttemptTime: number;
      totalRequests: number;
      halfOpenRequests: number;
    }
  >();

  private static readonly FAILURE_THRESHOLD = 5;
  private static readonly TIMEOUT_MS = 60000; // 1 minute

  static isOpen(operationName: string): boolean {
    const circuit = this.circuits.get(operationName);
    if (!circuit) return false;

    const now = Date.now();

    if (circuit.state === 'open') {
      if (now > circuit.nextAttemptTime) {
        circuit.state = 'half-open';
        return false;
      }
      return true;
    }

    return false;
  }

  static recordSuccess(operationName: string): void {
    const circuit = this.circuits.get(operationName);
    if (circuit) {
      circuit.failures = 0;
      circuit.state = 'closed';
    }
  }

  static recordFailure(operationName: string): void {
    const now = Date.now();
    const circuit = this.circuits.get(operationName) || {
      failures: 0,
      successes: 0,
      lastFailureTime: 0,
      lastSuccessTime: 0,
      state: 'closed' as const,
      nextAttemptTime: 0,
      totalRequests: 0,
      halfOpenRequests: 0,
    };

    circuit.failures++;
    circuit.totalRequests++;
    circuit.lastFailureTime = now;

    if (circuit.state === 'closed' && circuit.failures >= this.FAILURE_THRESHOLD) {
      circuit.state = 'open';
      circuit.nextAttemptTime = now + this.TIMEOUT_MS;
    } else if (circuit.state === 'half-open') {
      circuit.state = 'open';
      circuit.nextAttemptTime = now + this.TIMEOUT_MS;
      circuit.halfOpenRequests = 0;
    }

    this.circuits.set(operationName, circuit);
  }

  // 🟢 NEW: Get circuit breaker metrics
  static getMetrics(): Record<
    string,
    {
      state: string;
      failures: number;
      successes: number;
      totalRequests: number;
      successRate: number;
      lastFailure: Date | null;
      lastSuccess: Date | null;
    }
  > {
    const metrics: Record<string, any> = {};

    for (const [operationName, circuit] of this.circuits.entries()) {
      const successRate =
        circuit.totalRequests > 0 ? (circuit.successes / circuit.totalRequests) * 100 : 100;

      metrics[operationName] = {
        state: circuit.state,
        failures: circuit.failures,
        successes: circuit.successes,
        totalRequests: circuit.totalRequests,
        successRate,
        lastFailure: circuit.lastFailureTime > 0 ? new Date(circuit.lastFailureTime) : null,
        lastSuccess: circuit.lastSuccessTime > 0 ? new Date(circuit.lastSuccessTime) : null,
      };
    }

    return metrics;
  }

  // 🟢 NEW: Reset circuit breaker for maintenance
  static reset(operationName: string): void {
    this.circuits.delete(operationName);
  }

  // 🟢 NEW: Get overall system circuit breaker health
  static getSystemHealth(): {
    totalCircuits: number;
    openCircuits: number;
    halfOpenCircuits: number;
    overallSuccessRate: number;
  } {
    const totalCircuits = this.circuits.size;
    let openCircuits = 0;
    let halfOpenCircuits = 0;
    let totalRequests = 0;
    let totalSuccesses = 0;

    for (const circuit of this.circuits.values()) {
      if (circuit.state === 'open') openCircuits++;
      if (circuit.state === 'half-open') halfOpenCircuits++;
      totalRequests += circuit.totalRequests;
      totalSuccesses += circuit.successes;
    }

    const overallSuccessRate = totalRequests > 0 ? (totalSuccesses / totalRequests) * 100 : 100;

    return {
      totalCircuits,
      openCircuits,
      halfOpenCircuits,
      overallSuccessRate,
    };
  }
}

// 🟢 ENHANCED: Advanced error recovery strategies
export interface ErrorRecoveryStrategy {
  name: string;
  canRecover(error: Error): boolean;
  recover(
    error: Error,
    context: { operationName: string; attempt: number; category: ErrorCategory },
  ): Promise<void>;
  priority?: number; // Higher number = higher priority
}

// Built-in recovery strategies
export const DEFAULT_RECOVERY_STRATEGIES: ErrorRecoveryStrategy[] = [
  {
    name: 'git-cleanup-recovery',
    priority: 10,
    canRecover: (error: Error) => {
      const message = error.message.toLowerCase();
      return message.includes('lock') || message.includes('conflict') || message.includes('merge');
    },
    recover: async (error: Error, context) => {
      const { execSync } = require('child_process');
      try {
        // Clean up git locks and reset to a clean state
        execSync('git clean -fd', { timeout: 10000 });
        execSync('git reset --hard HEAD', { timeout: 10000 });
        // Remove any lock files
        execSync('find . -name "*.lock" -type f -delete 2>/dev/null || true', { timeout: 5000 });
      } catch {
        throw new Error('Git cleanup recovery failed');
      }
    },
  },
  {
    name: 'github-rate-limit-recovery',
    priority: 8,
    canRecover: (error: Error) => {
      const message = error.message.toLowerCase();
      return (
        message.includes('rate limit') ||
        message.includes('403') ||
        message.includes('secondary rate limit')
      );
    },
    recover: async (error: Error, context) => {
      // Wait for rate limit to reset
      const waitTime = extractRateLimitWaitTime(error) || 60000; // Default 1 minute
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    },
  },
  {
    name: 'network-connectivity-recovery',
    priority: 6,
    canRecover: (error: Error) => {
      const message = error.message.toLowerCase();
      return (
        message.includes('network') ||
        message.includes('enotfound') ||
        message.includes('econnrefused')
      );
    },
    recover: async (error: Error, context) => {
      // Wait for network connectivity to return
      await waitForNetworkConnectivity();
    },
  },
  {
    name: 'file-permission-recovery',
    priority: 7,
    canRecover: (error: Error) => {
      const message = error.message.toLowerCase();
      return (
        message.includes('permission') || message.includes('eacces') || message.includes('eperm')
      );
    },
    recover: async (error: Error, context) => {
      const fs = require('fs-extra');
      // Try to fix common permission issues
      if (context.operationName.includes('file') || context.operationName.includes('write')) {
        // This is a basic recovery - in production, this might need admin privileges
        throw new Error('Permission recovery requires manual intervention');
      }
    },
  },
];

// Helper functions for recovery strategies
function extractRateLimitWaitTime(error: Error): number | null {
  // Try to extract wait time from GitHub rate limit headers or error message
  const match = error.message.match(/(\d+)\s*seconds?/i);
  if (match) {
    return parseInt(match[1]) * 1000; // Convert to milliseconds
  }
  return null;
}

async function waitForNetworkConnectivity(timeout = 30000): Promise<void> {
  const https = require('https');
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = https.request(
          'https://api.github.com',
          { method: 'HEAD', timeout: 5000 },
          () => {
            resolve();
          },
        );
        req.on('error', reject);
        req.on('timeout', () => reject(new Error('Timeout')));
        req.end();
      });
      return; // Success
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
    }
  }
  throw new Error('Network connectivity not restored within timeout');
}

// 🟢 ENHANCED: Specialized error handlers using failure policy system
export class GitHubApiErrorHandler {
  static async handleGitHubError<T>(
    operation: () => Promise<T>,
    operationName: string,
    context?: Record<string, unknown>,
  ): Promise<T> {
    return withErrorHandling(operation, {
      operationName: `github-${operationName}`,
      category: ErrorCategory.GITHUB_INTEGRATION,
      useFailurePolicies: true, // 🟢 NEW: Use failure policy system
      timeoutMs: 30000,
      // Legacy fallback parameters if policies fail to load
      retries: 3,
      circuitBreaker: true,
      shouldRetry: (error: Error) => {
        const status = (error as any).status;
        return (
          status >= 500 ||
          status === 403 ||
          status === 429 ||
          error.message.includes('network') ||
          error.message.includes('timeout')
        );
      },
      onRetry: (attempt, error) => {
        enhancedLogger.warn(`GitHub API retry ${attempt}/3 for ${operationName}`, {
          error: error.message,
          context,
        });
      },
    });
  }
}

export class GitOperationErrorHandler {
  static async handleGitOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    workingDirectory?: string,
  ): Promise<T> {
    return withErrorHandling(operation, {
      operationName: `git-${operationName}`,
      category: ErrorCategory.WORKTREE_MANAGEMENT,
      useFailurePolicies: true, // 🟢 NEW: Use failure policy system
      timeoutMs: 60000,
      // Legacy fallback parameters
      retries: 2,
      shouldRetry: (error: Error) => {
        const message = error.message.toLowerCase();
        return (
          message.includes('lock') ||
          message.includes('conflict') ||
          message.includes('merge') ||
          message.includes('fetch')
        );
      },
      onRetry: (attempt, error) => {
        enhancedLogger.warn(`Git operation retry ${attempt}/2 for ${operationName}`, {
          error: error.message,
          workingDirectory,
        });
      },
    });
  }
}

export class FileSystemErrorHandler {
  static async handleFileSystemOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    filePath?: string,
  ): Promise<T> {
    return withErrorHandling(operation, {
      operationName: `fs-${operationName}`,
      category: ErrorCategory.FILE_SYSTEM,
      useFailurePolicies: true, // 🟢 NEW: Use failure policy system
      timeoutMs: 30000,
      // Legacy fallback parameters
      retries: 1,
      shouldRetry: (error: Error) => {
        const message = error.message.toLowerCase();
        return (
          message.includes('busy') || message.includes('locked') || message.includes('temporary')
        );
      },
      onRetry: (attempt, error) => {
        enhancedLogger.warn(`File system retry ${attempt}/1 for ${operationName}`, {
          error: error.message,
          filePath,
        });
      },
    });
  }
}

export class AgentExecutionErrorHandler {
  static async handleAgentExecution<T>(
    operation: () => Promise<T>,
    agentId: string,
    taskId: string,
    priority: 'low' | 'normal' | 'high' | 'critical' = 'normal',
  ): Promise<T> {
    return withErrorHandling(operation, {
      operationName: `agent-${agentId}-${taskId}`,
      category: ErrorCategory.AGENT_EXECUTION,
      useFailurePolicies: true, // 🟢 NEW: Use failure policy system
      timeoutMs: priority === 'critical' ? 600000 : 300000,
      priority:
        priority === 'critical' ? 10 : priority === 'high' ? 8 : priority === 'normal' ? 5 : 3,
      // Legacy fallback parameters
      retries: priority === 'critical' ? 5 : priority === 'high' ? 3 : 1,
      shouldRetry: (error: Error) => {
        const message = error.message.toLowerCase();
        return (
          !message.includes('validation') &&
          !message.includes('security') &&
          !message.includes('unauthorized')
        );
      },
      onRetry: (attempt, error) => {
        const maxRetries = priority === 'critical' ? 5 : priority === 'high' ? 3 : 1;
        enhancedLogger.warn(`Agent execution retry ${attempt}/${maxRetries} for ${agentId}`, {
          error: error.message,
          taskId,
          priority,
        });
      },
    });
  }
}

// 🟢 NEW: System state consistency manager
export class SystemStateManager {
  private static instance: SystemStateManager;
  private systemState = new Map<string, any>();
  private stateValidators = new Map<string, (state: any) => boolean>();
  private stateRecoveryActions = new Map<string, () => Promise<void>>();

  static getInstance(): SystemStateManager {
    if (!SystemStateManager.instance) {
      SystemStateManager.instance = new SystemStateManager();
    }
    return SystemStateManager.instance;
  }

  registerComponent(
    componentId: string,
    initialState: any,
    validator?: (state: any) => boolean,
  ): void {
    this.systemState.set(componentId, initialState);
    if (validator) {
      this.stateValidators.set(componentId, validator);
    }
  }

  updateState(componentId: string, newState: any): void {
    const validator = this.stateValidators.get(componentId);
    if (validator && !validator(newState)) {
      throw new ForgeFlowError({
        code: 'INVALID_STATE_TRANSITION',
        message: `Invalid state transition for component ${componentId}`,
        category: ErrorCategory.INTERNAL_ERROR,
        severity: ErrorSeverity.HIGH,
        context: { componentId, newState },
        recoverable: true,
        userMessage: `System component ${componentId} attempted an invalid state change`,
      });
    }
    this.systemState.set(componentId, newState);
  }

  getState(componentId: string): any {
    return this.systemState.get(componentId);
  }

  async validateSystemConsistency(): Promise<{
    consistent: boolean;
    issues: Array<{ componentId: string; issue: string }>;
  }> {
    const issues: Array<{ componentId: string; issue: string }> = [];

    for (const [componentId, state] of this.systemState.entries()) {
      const validator = this.stateValidators.get(componentId);
      if (validator && !validator(state)) {
        issues.push({
          componentId,
          issue: `Component state is invalid: ${JSON.stringify(state)}`,
        });
      }
    }

    return {
      consistent: issues.length === 0,
      issues,
    };
  }

  async recoverSystemConsistency(): Promise<void> {
    const { consistent, issues } = await this.validateSystemConsistency();

    if (consistent) {
      return;
    }

    for (const issue of issues) {
      const recoveryAction = this.stateRecoveryActions.get(issue.componentId);
      if (recoveryAction) {
        try {
          await recoveryAction();
        } catch (recoveryError) {
          throw new ForgeFlowError({
            code: 'STATE_RECOVERY_FAILED',
            message: `Failed to recover state for component ${issue.componentId}`,
            category: ErrorCategory.INTERNAL_ERROR,
            severity: ErrorSeverity.CRITICAL,
            context: { componentId: issue.componentId, issue: issue.issue },
            recoverable: false,
            userMessage: `Critical system recovery failed for ${issue.componentId}`,
            cause: recoveryError as Error,
          });
        }
      }
    }
  }

  registerRecoveryAction(componentId: string, action: () => Promise<void>): void {
    this.stateRecoveryActions.set(componentId, action);
  }
}

// 🟢 NEW: Enhanced error handling utilities with failure policy system
export class EnhancedErrorHandling {
  private static failurePoliciesEnabled = false;

  // Enable failure policies globally
  static async enableFailurePolicies(): Promise<void> {
    try {
      const failurePolicyManager = await getFailurePolicyManager();
      await failurePolicyManager.loadPolicies();
      this.failurePoliciesEnabled = true;

      enhancedLogger.info('Failure policy system enabled globally', {
        policiesLoaded: failurePolicyManager.getAllPolicies().length,
      });
    } catch (error) {
      enhancedLogger.error('Failed to enable failure policy system', undefined, {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // Disable failure policies (fallback to legacy error handling)
  static disableFailurePolicies(): void {
    this.failurePoliciesEnabled = false;
    enhancedLogger.info('Failure policy system disabled, using legacy error handling');
  }

  // Check if failure policies are enabled
  static areFailurePoliciesEnabled(): boolean {
    return this.failurePoliciesEnabled;
  }

  // Enhanced wrapper that automatically uses failure policies if enabled
  static async executeWithEnhancedErrorHandling<T>(
    operation: () => Promise<T>,
    operationName: string,
    category: ErrorCategory,
    options?: {
      timeoutMs?: number;
      priority?: number;
      metadata?: Record<string, unknown>;
      workingDirectory?: string;
      fallbackRetries?: number;
    },
  ): Promise<T> {
    const useFailurePolicies = this.failurePoliciesEnabled;

    return withErrorHandling(operation, {
      operationName,
      category,
      useFailurePolicies,
      timeoutMs: options?.timeoutMs,
      priority: options?.priority,
      // Fallback parameters if policies are disabled
      retries: options?.fallbackRetries || 3,
      circuitBreaker:
        category === ErrorCategory.GITHUB_INTEGRATION ||
        category === ErrorCategory.EXTERNAL_SERVICE,
      onRetry: (attempt, error) => {
        enhancedLogger.warn(`Enhanced error handling retry ${attempt} for ${operationName}`, {
          error: error.message,
          category,
          useFailurePolicies,
          metadata: options?.metadata,
        });
      },
    });
  }

  // Get failure policy system status
  static async getSystemStatus(): Promise<{
    failurePoliciesEnabled: boolean;
    policiesLoaded: number;
    systemHealth: Record<string, unknown>;
    policyMetrics: Record<string, unknown>;
    recoveryMetrics: Record<string, unknown>;
  }> {
    try {
      if (!this.failurePoliciesEnabled) {
        return {
          failurePoliciesEnabled: false,
          policiesLoaded: 0,
          systemHealth: { status: 'disabled' },
          policyMetrics: {},
          recoveryMetrics: {},
        };
      }

      const failurePolicyManager = await getFailurePolicyManager();
      const recoveryActionManager = await getRecoveryActionManager();

      return {
        failurePoliciesEnabled: true,
        policiesLoaded: failurePolicyManager.getAllPolicies().length,
        systemHealth: failurePolicyManager.getPolicyMetrics(),
        policyMetrics: failurePolicyManager.getPolicyMetrics(),
        recoveryMetrics: recoveryActionManager.getActionMetrics(),
      };
    } catch (error) {
      return {
        failurePoliciesEnabled: false,
        policiesLoaded: 0,
        systemHealth: { status: 'error', error: error.message },
        policyMetrics: {},
        recoveryMetrics: {},
      };
    }
  }

  // Reload failure policies configuration
  static async reloadFailurePolicies(): Promise<void> {
    if (!this.failurePoliciesEnabled) {
      throw new Error('Failure policies are not enabled');
    }

    try {
      const failurePolicyManager = await getFailurePolicyManager();
      await failurePolicyManager.reloadPolicies();

      enhancedLogger.info('Failure policies reloaded successfully', {
        policiesLoaded: failurePolicyManager.getAllPolicies().length,
      });
    } catch (error) {
      enhancedLogger.error('Failed to reload failure policies', undefined, {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

// Installation-specific error class
export class InstallationError extends ForgeFlowError {
  constructor(message: string, context?: Record<string, unknown>) {
    super({
      code: 'INSTALLATION_ERROR',
      message,
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.HIGH,
      context,
      recoverable: true,
      userMessage: message,
    });
  }
}
