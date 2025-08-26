/**
 * Feature Flag System Types
 * Defines interfaces for runtime feature toggling and safe rollouts
 */

import type { Environment } from './types';

// Re-export Environment for feature flag consumers
export type { Environment };

/**
 * Core feature flag interface
 */
export interface FeatureFlag {
  /** Unique identifier for the feature flag */
  key: string;

  /** Human-readable name */
  name: string;

  /** Description of what this flag controls */
  description: string;

  /** Default value when no rules apply */
  defaultValue: boolean;

  /** Environment-specific overrides */
  environments?: Record<Environment, boolean>;

  /** Rollout percentage (0-100) */
  rolloutPercentage?: number;

  /** Target user segments */
  targetSegments?: string[];

  /** Feature dependencies - flags that must be enabled */
  dependencies?: string[];

  /** Targeting rules for advanced rollouts */
  targetingRules?: TargetingRule[];

  /** Flag expiration date */
  expiresAt?: Date;

  /** Flag creation timestamp */
  createdAt: Date;

  /** Last update timestamp */
  updatedAt: Date;

  /** Flag metadata */
  metadata?: Record<string, any>;

  /** Tags for organization */
  tags?: string[];

  /** Flag status */
  status?: 'active' | 'deprecated' | 'archived';
}

/**
 * Targeting rule for complex rollout logic
 */
export interface TargetingRule {
  /** Unique rule identifier */
  id: string;

  /** Rule name */
  name: string;

  /** Rule description */
  description?: string;

  /** Conditions that must all be true */
  conditions: TargetingCondition[];

  /** Value to return if rule matches */
  value: boolean;

  /** Rule priority (lower number = higher priority) */
  priority?: number;
}

/**
 * Individual targeting condition
 */
export interface TargetingCondition {
  /** Context attribute to evaluate */
  attribute: string;

  /** Comparison operator */
  operator: TargetingOperator;

  /** Expected value(s) */
  value: any;
}

/**
 * Available targeting operators
 */
export type TargetingOperator =
  | 'equals'
  | 'not_equals'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'greater_than'
  | 'less_than'
  | 'greater_than_or_equal'
  | 'less_than_or_equal'
  | 'regex_match'
  | 'version_greater_than'
  | 'version_less_than';

/**
 * Context for flag evaluation
 */
export interface FeatureFlagContext {
  /** Unique context identifier */
  id?: string;

  /** User identifier */
  userId?: string;

  /** Session identifier */
  sessionId?: string;

  /** User email */
  email?: string;

  /** User role/permissions */
  role?: string;

  /** User groups */
  groups?: string[];

  /** Current environment */
  environment?: Environment;

  /** Application version */
  appVersion?: string;

  /** User agent / client info */
  userAgent?: string;

  /** Geographic location */
  location?: {
    country?: string;
    region?: string;
    city?: string;
  };

  /** Device information */
  device?: {
    type?: 'desktop' | 'mobile' | 'tablet';
    os?: string;
    browser?: string;
  };

  /** Custom attributes */
  custom?: Record<string, any>;

  /** Evaluation timestamp */
  timestamp?: number;
}

/**
 * Result of flag evaluation
 */
export interface FeatureFlagResult {
  /** Flag key that was evaluated */
  flagKey: string;

  /** Evaluated value */
  value: boolean;

  /** Whether default value was used */
  defaultUsed: boolean;

  /** Time taken to evaluate in milliseconds */
  evaluationTime: number;

  /** Reason for the result */
  reason: EvaluationReason;

  /** Matching rule ID (if applicable) */
  ruleId?: string;

  /** Rollout percentage (if applicable) */
  rolloutPercentage?: number;

  /** Evaluation context */
  context: Partial<FeatureFlagContext>;

  /** Error message (if evaluation failed) */
  error?: string;

  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Reasons for evaluation results
 */
export type EvaluationReason =
  | 'default_value'
  | 'targeting_rule'
  | 'environment_override'
  | 'rollout_enabled'
  | 'rollout_disabled'
  | 'dependency_failed'
  | 'flag_not_found'
  | 'expired'
  | 'cached'
  | 'error'
  | 'forced_on'
  | 'forced_off';

/**
 * Feature flag engine configuration
 */
export interface FeatureFlagConfig {
  /** Enable result caching */
  enableCaching?: boolean;

  /** Cache TTL in milliseconds */
  cacheTtlMs?: number;

  /** Cache cleanup interval */
  cacheCleanupIntervalMs?: number;

  /** Watch for configuration file changes */
  watchChanges?: boolean;

  /** Enable audit logging */
  auditLog?: boolean;

  /** Default rollout strategy */
  defaultRolloutStrategy?: string;

  /** Maximum targeting rules per flag */
  maxTargetingRules?: number;

  /** Enable flag analytics */
  enableAnalytics?: boolean;

  /** Analytics sampling rate */
  analyticsSampleRate?: number;
}

/**
 * Rollout strategy interface
 */
export interface RolloutStrategy {
  /** Strategy name */
  name: string;

  /** Strategy description */
  description: string;

  /** Strategy evaluation function */
  evaluate: (flag: FeatureFlag, context: FeatureFlagContext) => boolean;

  /** Strategy configuration schema */
  configSchema?: any;
}

/**
 * Feature flag analytics event
 */
export interface FeatureFlagEvent {
  /** Event type */
  type: FeatureFlagEventType;

  /** Event timestamp */
  timestamp: Date;

  /** Flag key */
  flagKey: string;

  /** Flag value at time of event */
  flagValue?: boolean;

  /** Evaluation context */
  context?: Partial<FeatureFlagContext>;

  /** Event metadata */
  metadata?: Record<string, any>;

  /** Session identifier */
  sessionId?: string;

  /** User identifier */
  userId?: string;
}

/**
 * Types of feature flag events
 */
export type FeatureFlagEventType =
  | 'flag_evaluated'
  | 'flag_created'
  | 'flag_updated'
  | 'flag_deleted'
  | 'flag_enabled'
  | 'flag_disabled'
  | 'rollout_started'
  | 'rollout_completed'
  | 'targeting_rule_added'
  | 'targeting_rule_removed'
  | 'flag_expired'
  | 'dependency_failed';

/**
 * Feature flag metrics interface
 */
export interface FeatureFlagMetrics {
  /** Flag key */
  flagKey: string;

  /** Total evaluations */
  totalEvaluations: number;

  /** Evaluations that returned true */
  trueEvaluations: number;

  /** Evaluations that returned false */
  falseEvaluations: number;

  /** Evaluations that used default value */
  defaultEvaluations: number;

  /** Average evaluation time */
  avgEvaluationTime: number;

  /** Cache hit rate */
  cacheHitRate: number;

  /** Unique users/sessions evaluated */
  uniqueEvaluations: number;

  /** Time period for metrics */
  period: {
    start: Date;
    end: Date;
  };

  /** Breakdown by reason */
  reasonBreakdown: Record<EvaluationReason, number>;

  /** Breakdown by environment */
  environmentBreakdown: Record<Environment, number>;
}

/**
 * Bulk flag operations
 */
export interface BulkFlagOperation {
  /** Operation type */
  operation: 'enable' | 'disable' | 'update' | 'delete';

  /** Flag keys to operate on */
  flagKeys: string[];

  /** Update data (for update operation) */
  updateData?: Partial<FeatureFlag>;

  /** Operation metadata */
  metadata?: Record<string, any>;
}

/**
 * Flag validation result
 */
export interface FlagValidationResult {
  /** Whether flag is valid */
  valid: boolean;

  /** Validation errors */
  errors: string[];

  /** Validation warnings */
  warnings: string[];

  /** Suggested fixes */
  suggestions: string[];
}

/**
 * Feature flag migration
 */
export interface FeatureFlagMigration {
  /** Migration version */
  version: string;

  /** Migration description */
  description: string;

  /** Migration timestamp */
  timestamp: Date;

  /** Flags added */
  flagsAdded: string[];

  /** Flags removed */
  flagsRemoved: string[];

  /** Flags modified */
  flagsModified: string[];

  /** Migration rollback function */
  rollback?: () => Promise<void>;
}

/**
 * Feature flag experiment configuration
 */
export interface FeatureFlagExperiment {
  /** Experiment ID */
  id: string;

  /** Experiment name */
  name: string;

  /** Description */
  description: string;

  /** Associated feature flag */
  flagKey: string;

  /** Experiment start date */
  startDate: Date;

  /** Experiment end date */
  endDate?: Date;

  /** Traffic allocation percentage */
  trafficAllocation: number;

  /** Experiment variants */
  variants: ExperimentVariant[];

  /** Success metrics */
  successMetrics: string[];

  /** Experiment status */
  status: 'draft' | 'running' | 'paused' | 'completed' | 'cancelled';
}

/**
 * Experiment variant
 */
export interface ExperimentVariant {
  /** Variant ID */
  id: string;

  /** Variant name */
  name: string;

  /** Feature flag value for this variant */
  flagValue: boolean;

  /** Traffic percentage for this variant */
  trafficPercentage: number;

  /** Variant configuration */
  config?: Record<string, any>;
}

/**
 * Feature flag SDK configuration
 */
export interface FeatureFlagSDKConfig {
  /** SDK API key */
  apiKey?: string;

  /** Base URL for flag service */
  baseUrl?: string;

  /** Polling interval for updates */
  pollingIntervalMs?: number;

  /** Enable streaming updates */
  enableStreaming?: boolean;

  /** Offline mode configuration */
  offlineMode?: {
    enabled: boolean;
    fallbackFlags?: Record<string, boolean>;
  };

  /** Request timeout */
  timeoutMs?: number;

  /** Retry configuration */
  retry?: {
    attempts: number;
    backoffMs: number;
  };
}

/**
 * Feature flag export/import formats
 */
export interface FeatureFlagExport {
  /** Export version */
  version: string;

  /** Export timestamp */
  timestamp: string;

  /** Source environment */
  environment: Environment;

  /** Exported flags */
  flags: FeatureFlag[];

  /** Export metadata */
  metadata?: Record<string, any>;
}

/**
 * Webhook configuration for flag changes
 */
export interface FeatureFlagWebhook {
  /** Webhook ID */
  id: string;

  /** Webhook URL */
  url: string;

  /** Events to listen for */
  events: FeatureFlagEventType[];

  /** Webhook secret for verification */
  secret?: string;

  /** Custom headers */
  headers?: Record<string, string>;

  /** Webhook status */
  enabled: boolean;

  /** Retry configuration */
  retry?: {
    attempts: number;
    backoffMs: number;
  };
}

/**
 * Feature flag audit log entry
 */
export interface FeatureFlagAuditLog {
  /** Log entry ID */
  id: string;

  /** Timestamp */
  timestamp: Date;

  /** Action performed */
  action: string;

  /** Flag key affected */
  flagKey: string;

  /** User who performed action */
  userId?: string;

  /** Before state */
  before?: Partial<FeatureFlag>;

  /** After state */
  after?: Partial<FeatureFlag>;

  /** Additional context */
  context?: Record<string, any>;

  /** IP address */
  ipAddress?: string;

  /** User agent */
  userAgent?: string;
}

/**
 * Feature flag performance metrics
 */
export interface FeatureFlagPerformance {
  /** Average evaluation time by flag */
  avgEvaluationTime: Record<string, number>;

  /** Cache hit rates by flag */
  cacheHitRates: Record<string, number>;

  /** Memory usage */
  memoryUsage: {
    flagsSize: number;
    cacheSize: number;
    totalSize: number;
  };

  /** Performance thresholds */
  thresholds: {
    maxEvaluationTime: number;
    minCacheHitRate: number;
    maxMemoryUsage: number;
  };
}

/**
 * Feature flag health check
 */
export interface FeatureFlagHealthCheck {
  /** Overall health status */
  healthy: boolean;

  /** Individual checks */
  checks: Array<{
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message: string;
    details?: any;
  }>;

  /** Performance metrics */
  performance: FeatureFlagPerformance;

  /** Recommendations */
  recommendations: string[];
}
