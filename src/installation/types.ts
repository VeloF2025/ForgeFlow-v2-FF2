/**
 * Installation & Configuration Layer Types
 * Defines interfaces and types for ForgeFlow V2 installation system
 */

export type ProjectType = 'nodejs' | 'python' | 'mixed' | 'generic';
export type Environment = 'development' | 'staging' | 'production' | 'testing';
export type InstallationStep =
  | 'validation'
  | 'structure'
  | 'dependencies'
  | 'configuration'
  | 'github'
  | 'database'
  | 'backup'
  | 'health';

/**
 * Main installation options interface
 */
export interface InstallationOptions {
  /** Target project directory */
  projectPath: string;

  /** Type of project being set up */
  projectType: ProjectType;

  /** Target environment */
  environment: Environment;

  /** Skip interactive wizard */
  skipWizard?: boolean;

  /** GitHub integration settings */
  github?: GitHubIntegrationOptions;

  /** Feature enablement options */
  features?: FeatureOptions;

  /** Backup settings */
  backup?: BackupOptions;

  /** Advanced configuration */
  advanced?: AdvancedOptions;
}

/**
 * GitHub integration options
 */
export interface GitHubIntegrationOptions {
  /** Enable GitHub integration */
  enabled: boolean;

  /** GitHub personal access token */
  token?: string;

  /** Repository owner/organization */
  owner?: string;

  /** Repository name */
  repo?: string;

  /** Auto-detect repository information */
  autoDetect?: boolean;

  /** Enable GitHub Issues integration */
  enableIssues?: boolean;

  /** Enable automatic PR creation */
  enablePRs?: boolean;
}

/**
 * Feature enablement options
 */
export interface FeatureOptions {
  /** Enable feature flag system */
  enableFeatureFlags?: boolean;

  /** Enable automated backups */
  enableBackups?: boolean;

  /** Enable performance monitoring */
  enableMonitoring?: boolean;

  /** Enable advanced analytics */
  enableAnalytics?: boolean;

  /** Enable web dashboard */
  enableDashboard?: boolean;

  /** Enable real-time updates */
  enableRealtime?: boolean;

  /** Enable distributed execution */
  enableDistributed?: boolean;
}

/**
 * Backup configuration options
 */
export interface BackupOptions {
  /** Enable automated backups */
  enabled?: boolean;

  /** Backup frequency in minutes */
  frequency?: number;

  /** Maximum number of backups to retain */
  retention?: number;

  /** Backup storage path */
  storagePath?: string;

  /** Enable compression */
  compress?: boolean;

  /** Enable encryption */
  encrypt?: boolean;
}

/**
 * Advanced configuration options
 */
export interface AdvancedOptions {
  /** Custom configuration file path */
  configPath?: string;

  /** Maximum concurrent agents */
  maxConcurrentAgents?: number;

  /** Agent execution timeout */
  agentTimeout?: number;

  /** Custom database configuration */
  database?: DatabaseOptions;

  /** Performance tuning options */
  performance?: PerformanceOptions;

  /** Security settings */
  security?: SecurityOptions;
}

/**
 * Database configuration options
 */
export interface DatabaseOptions {
  /** Database type */
  type?: 'sqlite' | 'postgres' | 'mysql';

  /** Database connection URL */
  url?: string;

  /** Connection pool size */
  poolSize?: number;

  /** Enable query logging */
  logging?: boolean;

  /** Migration options */
  migrations?: {
    auto?: boolean;
    path?: string;
  };
}

/**
 * Performance tuning options
 */
export interface PerformanceOptions {
  /** Memory limit for operations */
  memoryLimit?: number;

  /** CPU usage limit */
  cpuLimit?: number;

  /** I/O operation timeout */
  ioTimeout?: number;

  /** Caching strategy */
  caching?: {
    enabled?: boolean;
    size?: number;
    ttl?: number;
  };
}

/**
 * Security configuration options
 */
export interface SecurityOptions {
  /** Enable input validation */
  inputValidation?: boolean;

  /** Enable output sanitization */
  outputSanitization?: boolean;

  /** Enable audit logging */
  auditLogging?: boolean;

  /** Access control settings */
  accessControl?: {
    enabled?: boolean;
    allowedIps?: string[];
    rateLimiting?: boolean;
  };
}

/**
 * Installation result interface
 */
export interface InstallationResult {
  /** Installation success status */
  success: boolean;

  /** Total installation time in milliseconds */
  installationTime: number;

  /** Installed project path */
  projectPath: string;

  /** Project type that was installed */
  projectType: ProjectType;

  /** Target environment */
  environment: Environment;

  /** Enabled features */
  features: FeatureOptions;

  /** GitHub configuration */
  github?: GitHubIntegrationOptions;

  /** Installation timestamp */
  timestamp: Date;

  /** ForgeFlow version */
  version: string;

  /** Any warnings encountered */
  warnings?: string[];

  /** Installation steps completed */
  stepsCompleted?: InstallationStep[];

  /** Performance metrics */
  metrics?: InstallationMetrics;
}

/**
 * Installation performance metrics
 */
export interface InstallationMetrics {
  /** Time spent on each step */
  stepTimes: Record<InstallationStep, number>;

  /** Dependencies installed */
  dependenciesInstalled: number;

  /** Files created */
  filesCreated: number;

  /** Configuration entries set */
  configurationEntries: number;

  /** Peak memory usage during installation */
  peakMemoryUsage: number;
}

/**
 * Dependency check configuration
 */
export interface DependencyCheck {
  /** Name of the dependency */
  name: string;

  /** Command to check if dependency exists */
  command: string;

  /** Minimum required version */
  minVersion: string;

  /** Whether this dependency is required */
  required: boolean;

  /** Installation instructions if missing */
  installInstructions?: string;
}

/**
 * Configuration management interfaces
 */
export interface ConfigurationTemplate {
  /** Template name */
  name: string;

  /** Template description */
  description: string;

  /** Target environment */
  environment: Environment;

  /** Configuration content */
  content: Record<string, any>;

  /** Required variables */
  requiredVariables?: string[];

  /** Optional variables with defaults */
  optionalVariables?: Record<string, any>;
}

/**
 * Environment-specific configuration
 */
export interface EnvironmentConfig {
  /** Environment name */
  environment: Environment;

  /** Configuration values */
  config: Record<string, any>;

  /** Environment-specific features */
  features: FeatureOptions;

  /** Security settings for environment */
  security: SecurityOptions;

  /** Performance settings for environment */
  performance: PerformanceOptions;
}

/**
 * Feature flag configuration
 */
export interface FeatureFlag {
  /** Feature flag key */
  key: string;

  /** Human-readable name */
  name: string;

  /** Feature description */
  description: string;

  /** Default value */
  defaultValue: boolean;

  /** Environment-specific overrides */
  environments?: Record<Environment, boolean>;

  /** Rollout percentage (0-100) */
  rolloutPercentage?: number;

  /** Target user segments */
  targetSegments?: string[];

  /** Feature dependencies */
  dependencies?: string[];

  /** Expiration date */
  expiresAt?: Date;
}

/**
 * Health check configuration
 */
export interface HealthCheck {
  /** Check name */
  name: string;

  /** Check description */
  description: string;

  /** Check category */
  category: 'system' | 'dependencies' | 'configuration' | 'connectivity';

  /** Whether check is critical */
  critical: boolean;

  /** Timeout for check in milliseconds */
  timeout: number;

  /** Expected result */
  expectedResult?: any;

  /** Retry configuration */
  retry?: {
    attempts: number;
    delay: number;
  };
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  /** Overall health status */
  healthy: boolean;

  /** Individual check results */
  checks: Array<{
    name: string;
    status: 'pass' | 'fail' | 'warning';
    message: string;
    duration: number;
    details?: any;
  }>;

  /** Performance metrics */
  metrics: {
    totalDuration: number;
    checksRun: number;
    checksPassed: number;
    checksFailed: number;
    checksWarning: number;
  };

  /** Any critical issues */
  issues: string[];

  /** Recommendations for improvements */
  recommendations: string[];
}

/**
 * Backup configuration and management
 */
export interface BackupConfig {
  /** Backup strategy */
  strategy: 'incremental' | 'full' | 'differential';

  /** Backup schedule */
  schedule: {
    frequency: 'hourly' | 'daily' | 'weekly' | 'manual';
    time?: string; // For daily/weekly backups
  };

  /** Retention policy */
  retention: {
    daily: number;
    weekly: number;
    monthly: number;
  };

  /** Storage configuration */
  storage: {
    path: string;
    compress: boolean;
    encrypt: boolean;
    encryptionKey?: string;
  };

  /** Items to backup */
  include: string[];

  /** Items to exclude from backup */
  exclude: string[];
}

/**
 * Backup result
 */
export interface BackupResult {
  /** Backup success status */
  success: boolean;

  /** Backup timestamp */
  timestamp: Date;

  /** Backup file path */
  filePath: string;

  /** Backup size in bytes */
  size: number;

  /** Backup duration in milliseconds */
  duration: number;

  /** Files backed up count */
  fileCount: number;

  /** Compression ratio (if enabled) */
  compressionRatio?: number;

  /** Any errors encountered */
  errors?: string[];

  /** Any warnings */
  warnings?: string[];
}

/**
 * CLI command configuration
 */
export interface CLICommand {
  /** Command name */
  name: string;

  /** Command description */
  description: string;

  /** Command aliases */
  aliases?: string[];

  /** Command arguments */
  arguments?: Array<{
    name: string;
    description: string;
    required: boolean;
    type: 'string' | 'number' | 'boolean';
    choices?: string[];
  }>;

  /** Command options */
  options?: Array<{
    flag: string;
    description: string;
    type: 'string' | 'number' | 'boolean';
    default?: any;
  }>;

  /** Command examples */
  examples?: Array<{
    command: string;
    description: string;
  }>;
}

/**
 * Migration configuration
 */
export interface MigrationConfig {
  /** Migration version */
  version: string;

  /** Migration description */
  description: string;

  /** Migration type */
  type: 'config' | 'database' | 'files' | 'dependencies';

  /** Pre-migration checks */
  preChecks?: Array<() => Promise<boolean>>;

  /** Migration steps */
  steps: Array<() => Promise<void>>;

  /** Post-migration validation */
  postValidation?: Array<() => Promise<boolean>>;

  /** Rollback steps */
  rollback?: Array<() => Promise<void>>;
}

/**
 * Error types for installation system
 */
export class InstallationError extends Error {
  constructor(
    message: string,
    public readonly details?: any,
  ) {
    super(message);
    this.name = 'InstallationError';
  }
}

export class ConfigurationError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: any,
  ) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class FeatureFlagError extends Error {
  constructor(
    message: string,
    public readonly flagKey?: string,
  ) {
    super(message);
    this.name = 'FeatureFlagError';
  }
}
