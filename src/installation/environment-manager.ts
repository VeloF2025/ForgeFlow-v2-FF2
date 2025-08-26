import fs from 'fs-extra';
import path from 'path';
import { LogContext } from '../utils/logger';
import { ConfigurationManager } from './configuration-manager';
import { FeatureFlagEngine } from './feature-flag-engine';
import { BackupManager } from './backup-manager';
import type {
  Environment,
  EnvironmentConfig,
  InstallationOptions,
  FeatureOptions,
  SecurityOptions,
  PerformanceOptions,
} from './types';

/**
 * Environment Manager for ForgeFlow V2
 * Handles multi-environment deployment and configuration management
 */
export class EnvironmentManager {
  private logger = new LogContext('EnvironmentManager');
  private configManager: ConfigurationManager;
  private environments = new Map<Environment, EnvironmentConfig>();
  private currentEnvironment: Environment = 'development';
  private projectPath: string;

  constructor(projectPath?: string) {
    this.projectPath = projectPath || process.cwd();
    this.configManager = new ConfigurationManager();
    this.initializeEnvironments();
  }

  /**
   * Initialize the environment manager
   */
  async initialize(environment?: Environment): Promise<void> {
    this.logger.info('Initializing Environment Manager...');

    try {
      // Set current environment
      if (environment) {
        this.currentEnvironment = environment;
      } else {
        this.currentEnvironment = this.detectCurrentEnvironment();
      }

      // Load environment configurations
      await this.loadEnvironmentConfigurations();

      // Validate current environment
      await this.validateEnvironment(this.currentEnvironment);

      // Setup environment-specific directories
      await this.setupEnvironmentDirectories();

      // Initialize environment-specific services
      await this.initializeEnvironmentServices();

      this.logger.info(`Environment Manager initialized for: ${this.currentEnvironment}`);
    } catch (error) {
      this.logger.error('Failed to initialize Environment Manager', error);
      throw error;
    }
  }

  /**
   * Switch to a different environment
   */
  async switchEnvironment(targetEnvironment: Environment): Promise<void> {
    this.logger.info(`Switching from ${this.currentEnvironment} to ${targetEnvironment}`);

    if (this.currentEnvironment === targetEnvironment) {
      this.logger.info('Already in target environment');
      return;
    }

    try {
      // Validate target environment exists
      if (!this.environments.has(targetEnvironment)) {
        throw new Error(`Environment not configured: ${targetEnvironment}`);
      }

      // Backup current environment state if in production
      if (this.currentEnvironment === 'production') {
        await this.createEnvironmentBackup();
      }

      // Switch configurations
      await this.applyEnvironmentConfiguration(targetEnvironment);

      // Update current environment
      this.currentEnvironment = targetEnvironment;

      // Save environment state
      await this.saveEnvironmentState();

      this.logger.info(`Successfully switched to ${targetEnvironment} environment`);
    } catch (error) {
      this.logger.error(`Failed to switch to ${targetEnvironment} environment`, error);
      throw error;
    }
  }

  /**
   * Create a new environment configuration
   */
  async createEnvironment(
    environment: Environment,
    config: Partial<EnvironmentConfig>,
  ): Promise<void> {
    this.logger.info(`Creating environment: ${environment}`);

    if (this.environments.has(environment)) {
      throw new Error(`Environment already exists: ${environment}`);
    }

    try {
      // Create environment configuration with defaults
      const environmentConfig: EnvironmentConfig = {
        environment,
        config: config.config || {},
        features: config.features || this.getDefaultFeatures(environment),
        security: config.security || this.getDefaultSecurity(environment),
        performance: config.performance || this.getDefaultPerformance(environment),
      };

      // Validate configuration
      await this.validateEnvironmentConfig(environmentConfig);

      // Store configuration
      this.environments.set(environment, environmentConfig);

      // Save to file
      await this.saveEnvironmentConfiguration(environment, environmentConfig);

      // Create environment-specific directories
      await this.createEnvironmentDirectories(environment);

      this.logger.info(`Environment created successfully: ${environment}`);
    } catch (error) {
      this.logger.error(`Failed to create environment: ${environment}`, error);
      throw error;
    }
  }

  /**
   * Update environment configuration
   */
  async updateEnvironment(
    environment: Environment,
    updates: Partial<EnvironmentConfig>,
  ): Promise<void> {
    this.logger.info(`Updating environment: ${environment}`);

    const existingConfig = this.environments.get(environment);
    if (!existingConfig) {
      throw new Error(`Environment not found: ${environment}`);
    }

    try {
      // Merge updates with existing configuration
      const updatedConfig: EnvironmentConfig = {
        ...existingConfig,
        ...updates,
        config: { ...existingConfig.config, ...updates.config },
        features: { ...existingConfig.features, ...updates.features },
        security: { ...existingConfig.security, ...updates.security },
        performance: { ...existingConfig.performance, ...updates.performance },
      };

      // Validate updated configuration
      await this.validateEnvironmentConfig(updatedConfig);

      // Update stored configuration
      this.environments.set(environment, updatedConfig);

      // Save to file
      await this.saveEnvironmentConfiguration(environment, updatedConfig);

      // Apply changes if this is the current environment
      if (this.currentEnvironment === environment) {
        await this.applyEnvironmentConfiguration(environment);
      }

      this.logger.info(`Environment updated successfully: ${environment}`);
    } catch (error) {
      this.logger.error(`Failed to update environment: ${environment}`, error);
      throw error;
    }
  }

  /**
   * Delete an environment configuration
   */
  async deleteEnvironment(environment: Environment): Promise<void> {
    this.logger.info(`Deleting environment: ${environment}`);

    // Prevent deletion of current environment
    if (this.currentEnvironment === environment) {
      throw new Error('Cannot delete the current environment');
    }

    // Prevent deletion of production environment without confirmation
    if (environment === 'production') {
      throw new Error('Production environment deletion requires special handling');
    }

    try {
      // Remove from memory
      this.environments.delete(environment);

      // Remove configuration file
      const configPath = this.getEnvironmentConfigPath(environment);
      if (await fs.pathExists(configPath)) {
        await fs.remove(configPath);
      }

      // Remove environment-specific directories
      await this.removeEnvironmentDirectories(environment);

      this.logger.info(`Environment deleted successfully: ${environment}`);
    } catch (error) {
      this.logger.error(`Failed to delete environment: ${environment}`, error);
      throw error;
    }
  }

  /**
   * Get current environment
   */
  getCurrentEnvironment(): Environment {
    return this.currentEnvironment;
  }

  /**
   * Get environment configuration
   */
  getEnvironmentConfig(environment?: Environment): EnvironmentConfig | undefined {
    const env = environment || this.currentEnvironment;
    return this.environments.get(env);
  }

  /**
   * Get all environments
   */
  getAllEnvironments(): Environment[] {
    return Array.from(this.environments.keys());
  }

  /**
   * Get environment status
   */
  async getEnvironmentStatus(): Promise<{
    current: Environment;
    available: Environment[];
    healthy: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    // Check if current environment is properly configured
    const currentConfig = this.environments.get(this.currentEnvironment);
    if (!currentConfig) {
      issues.push(`Current environment not configured: ${this.currentEnvironment}`);
    }

    // Check environment-specific directories
    const requiredDirs = [
      `config/environments`,
      `data/${this.currentEnvironment}`,
      `logs/${this.currentEnvironment}`,
    ];

    for (const dir of requiredDirs) {
      const dirPath = path.join(this.projectPath, dir);
      if (!(await fs.pathExists(dirPath))) {
        issues.push(`Missing directory: ${dir}`);
      }
    }

    return {
      current: this.currentEnvironment,
      available: this.getAllEnvironments(),
      healthy: issues.length === 0,
      issues,
    };
  }

  /**
   * Clone environment configuration
   */
  async cloneEnvironment(
    sourceEnvironment: Environment,
    targetEnvironment: Environment,
    overrides?: Partial<EnvironmentConfig>,
  ): Promise<void> {
    this.logger.info(`Cloning environment ${sourceEnvironment} to ${targetEnvironment}`);

    const sourceConfig = this.environments.get(sourceEnvironment);
    if (!sourceConfig) {
      throw new Error(`Source environment not found: ${sourceEnvironment}`);
    }

    if (this.environments.has(targetEnvironment)) {
      throw new Error(`Target environment already exists: ${targetEnvironment}`);
    }

    try {
      // Create cloned configuration
      const clonedConfig: EnvironmentConfig = {
        ...JSON.parse(JSON.stringify(sourceConfig)), // Deep clone
        environment: targetEnvironment,
        ...overrides,
      };

      // Apply environment-specific adjustments
      this.applyEnvironmentAdjustments(clonedConfig);

      // Create the new environment
      await this.createEnvironment(targetEnvironment, clonedConfig);

      this.logger.info(
        `Environment cloned successfully: ${sourceEnvironment} → ${targetEnvironment}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to clone environment: ${sourceEnvironment} → ${targetEnvironment}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Migrate between environments
   */
  async migrateEnvironment(
    sourceEnvironment: Environment,
    targetEnvironment: Environment,
    options?: {
      includeData?: boolean;
      includeConfig?: boolean;
      includeFeatureFlags?: boolean;
    },
  ): Promise<void> {
    this.logger.info(`Migrating from ${sourceEnvironment} to ${targetEnvironment}`);

    try {
      const migrationOptions = {
        includeData: true,
        includeConfig: true,
        includeFeatureFlags: true,
        ...options,
      };

      // Backup current state
      const backupManager = new BackupManager();
      await backupManager.createBackup(this.projectPath, {
        name: `pre-migration-${Date.now()}`,
        description: `Backup before migrating ${sourceEnvironment} to ${targetEnvironment}`,
      });

      // Migrate configuration
      if (migrationOptions.includeConfig) {
        await this.migrateConfiguration(sourceEnvironment, targetEnvironment);
      }

      // Migrate data
      if (migrationOptions.includeData) {
        await this.migrateData(sourceEnvironment, targetEnvironment);
      }

      // Migrate feature flags
      if (migrationOptions.includeFeatureFlags) {
        await this.migrateFeatureFlags(sourceEnvironment, targetEnvironment);
      }

      // Switch to target environment
      await this.switchEnvironment(targetEnvironment);

      this.logger.info(`Migration completed: ${sourceEnvironment} → ${targetEnvironment}`);
    } catch (error) {
      this.logger.error(`Migration failed: ${sourceEnvironment} → ${targetEnvironment}`, error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private initializeEnvironments(): void {
    const defaultEnvironments: Environment[] = ['development', 'testing', 'staging', 'production'];

    for (const env of defaultEnvironments) {
      this.environments.set(env, {
        environment: env,
        config: {},
        features: this.getDefaultFeatures(env),
        security: this.getDefaultSecurity(env),
        performance: this.getDefaultPerformance(env),
      });
    }
  }

  private detectCurrentEnvironment(): Environment {
    // Check environment variable
    const nodeEnv = process.env.NODE_ENV as Environment;
    if (nodeEnv && ['development', 'testing', 'staging', 'production'].includes(nodeEnv)) {
      return nodeEnv;
    }

    // Check for environment-specific files
    const envFiles = [
      { file: '.env.production', env: 'production' as Environment },
      { file: '.env.staging', env: 'staging' as Environment },
      { file: '.env.testing', env: 'testing' as Environment },
      { file: '.env.development', env: 'development' as Environment },
    ];

    for (const { file, env } of envFiles) {
      if (fs.existsSync(path.join(this.projectPath, file))) {
        return env;
      }
    }

    // Default to development
    return 'development';
  }

  private async loadEnvironmentConfigurations(): Promise<void> {
    const configDir = path.join(this.projectPath, 'config', 'environments');

    if (!(await fs.pathExists(configDir))) {
      return;
    }

    const configFiles = await fs.readdir(configDir);

    for (const file of configFiles) {
      if (file.endsWith('.yaml') || file.endsWith('.yml') || file.endsWith('.json')) {
        const envName = path.basename(file, path.extname(file)) as Environment;

        try {
          const configPath = path.join(configDir, file);
          const content = await fs.readFile(configPath, 'utf-8');

          let config;
          if (file.endsWith('.json')) {
            config = JSON.parse(content);
          } else {
            const yaml = require('yaml');
            config = yaml.parse(content);
          }

          this.environments.set(envName, config);
          this.logger.debug(`Loaded environment configuration: ${envName}`);
        } catch (error) {
          this.logger.warn(`Failed to load environment config: ${file}`, error);
        }
      }
    }
  }

  private async validateEnvironment(environment: Environment): Promise<void> {
    const config = this.environments.get(environment);
    if (!config) {
      throw new Error(`Environment configuration not found: ${environment}`);
    }

    // Validate required directories exist
    const requiredDirs = ['config/environments', `data/${environment}`, `logs/${environment}`];

    for (const dir of requiredDirs) {
      await fs.ensureDir(path.join(this.projectPath, dir));
    }
  }

  private async setupEnvironmentDirectories(): Promise<void> {
    const dirs = [
      `config/environments`,
      `data/${this.currentEnvironment}`,
      `logs/${this.currentEnvironment}`,
      `backups/${this.currentEnvironment}`,
      `knowledge/${this.currentEnvironment}`,
    ];

    for (const dir of dirs) {
      await fs.ensureDir(path.join(this.projectPath, dir));
    }
  }

  private async initializeEnvironmentServices(): Promise<void> {
    // Initialize environment-specific feature flags
    const config = this.environments.get(this.currentEnvironment);
    if (config?.features?.enableFeatureFlags) {
      const featureFlagPath = path.join(
        this.projectPath,
        'config',
        'environments',
        this.currentEnvironment,
      );
      const featureFlagEngine = new FeatureFlagEngine(featureFlagPath);
      await featureFlagEngine.initialize();
    }
  }

  private async applyEnvironmentConfiguration(environment: Environment): Promise<void> {
    const config = this.environments.get(environment);
    if (!config) {
      throw new Error(`Environment configuration not found: ${environment}`);
    }

    // Update ForgeFlow configuration with environment-specific values
    await this.configManager.updateConfiguration(this.projectPath, {
      environment,
      ...config.config,
    });

    // Set environment variables
    process.env.NODE_ENV = environment;
    process.env.FORGEFLOW_ENV = environment;
  }

  private async saveEnvironmentState(): Promise<void> {
    const statePath = path.join(this.projectPath, '.forgeflow-env');
    await fs.writeFile(statePath, this.currentEnvironment, 'utf-8');
  }

  private async createEnvironmentBackup(): Promise<void> {
    const backupManager = new BackupManager();
    await backupManager.createBackup(this.projectPath, {
      name: `env-switch-${this.currentEnvironment}-${Date.now()}`,
      description: `Backup before switching from ${this.currentEnvironment}`,
    });
  }

  private async validateEnvironmentConfig(config: EnvironmentConfig): Promise<void> {
    const errors: string[] = [];

    if (!config.environment) {
      errors.push('Environment name is required');
    }

    if (!['development', 'testing', 'staging', 'production'].includes(config.environment)) {
      errors.push('Invalid environment name');
    }

    if (errors.length > 0) {
      throw new Error(`Environment configuration validation failed: ${errors.join(', ')}`);
    }
  }

  private async saveEnvironmentConfiguration(
    environment: Environment,
    config: EnvironmentConfig,
  ): Promise<void> {
    const configPath = this.getEnvironmentConfigPath(environment);
    await fs.ensureDir(path.dirname(configPath));

    const yaml = require('yaml');
    const configYaml = yaml.stringify(config, { indent: 2 });
    await fs.writeFile(configPath, configYaml, 'utf-8');
  }

  private async createEnvironmentDirectories(environment: Environment): Promise<void> {
    const dirs = [
      `data/${environment}`,
      `logs/${environment}`,
      `backups/${environment}`,
      `knowledge/${environment}`,
    ];

    for (const dir of dirs) {
      await fs.ensureDir(path.join(this.projectPath, dir));
    }
  }

  private async removeEnvironmentDirectories(environment: Environment): Promise<void> {
    const dirs = [
      `data/${environment}`,
      `logs/${environment}`,
      `backups/${environment}`,
      `knowledge/${environment}`,
    ];

    for (const dir of dirs) {
      const dirPath = path.join(this.projectPath, dir);
      if (await fs.pathExists(dirPath)) {
        await fs.remove(dirPath);
      }
    }
  }

  private applyEnvironmentAdjustments(config: EnvironmentConfig): void {
    // Adjust configuration based on environment type
    switch (config.environment) {
      case 'development':
        config.performance = {
          ...config.performance,
          memoryLimit: 1024, // Lower memory limit for development
          cpuLimit: 50,
        };
        break;

      case 'testing':
        config.features = {
          ...config.features,
          enableAnalytics: false,
          enableRealtime: false,
        };
        break;

      case 'production':
        config.security = {
          ...config.security,
          inputValidation: true,
          outputSanitization: true,
          auditLogging: true,
          accessControl: {
            enabled: true,
            allowedIps: [],
            rateLimiting: true,
          },
        };
        break;
    }
  }

  private async migrateConfiguration(
    sourceEnv: Environment,
    targetEnv: Environment,
  ): Promise<void> {
    const sourceConfig = this.environments.get(sourceEnv);
    if (sourceConfig) {
      const targetConfig = { ...sourceConfig, environment: targetEnv };
      await this.createEnvironment(targetEnv, targetConfig);
    }
  }

  private async migrateData(sourceEnv: Environment, targetEnv: Environment): Promise<void> {
    const sourceDataPath = path.join(this.projectPath, 'data', sourceEnv);
    const targetDataPath = path.join(this.projectPath, 'data', targetEnv);

    if (await fs.pathExists(sourceDataPath)) {
      await fs.copy(sourceDataPath, targetDataPath);
    }
  }

  private async migrateFeatureFlags(sourceEnv: Environment, targetEnv: Environment): Promise<void> {
    const sourceConfigPath = path.join(this.projectPath, 'config', 'environments', sourceEnv);
    const targetConfigPath = path.join(this.projectPath, 'config', 'environments', targetEnv);

    const sourceFlagsPath = path.join(sourceConfigPath, 'feature-flags.json');
    const targetFlagsPath = path.join(targetConfigPath, 'feature-flags.json');

    if (await fs.pathExists(sourceFlagsPath)) {
      await fs.ensureDir(targetConfigPath);
      await fs.copy(sourceFlagsPath, targetFlagsPath);
    }
  }

  private getEnvironmentConfigPath(environment: Environment): string {
    return path.join(this.projectPath, 'config', 'environments', `${environment}.yaml`);
  }

  private getDefaultFeatures(environment: Environment): FeatureOptions {
    const baseFeatures: FeatureOptions = {
      enableFeatureFlags: true,
      enableBackups: true,
      enableMonitoring: true,
      enableAnalytics: false,
      enableDashboard: true,
      enableRealtime: true,
    };

    switch (environment) {
      case 'testing':
        return {
          ...baseFeatures,
          enableAnalytics: false,
          enableRealtime: false,
          enableDashboard: false,
        };

      case 'production':
        return {
          ...baseFeatures,
          enableAnalytics: true,
        };

      default:
        return baseFeatures;
    }
  }

  private getDefaultSecurity(environment: Environment): SecurityOptions {
    const baseSecurity: SecurityOptions = {
      inputValidation: true,
      outputSanitization: true,
      auditLogging: false,
      accessControl: {
        enabled: false,
        allowedIps: [],
        rateLimiting: false,
      },
    };

    switch (environment) {
      case 'production':
      case 'staging':
        return {
          ...baseSecurity,
          auditLogging: true,
          accessControl: {
            enabled: true,
            allowedIps: [],
            rateLimiting: true,
          },
        };

      default:
        return baseSecurity;
    }
  }

  private getDefaultPerformance(environment: Environment): PerformanceOptions {
    const basePerformance: PerformanceOptions = {
      memoryLimit: 2048,
      cpuLimit: 80,
      ioTimeout: 30000,
      caching: {
        enabled: true,
        size: 100,
        ttl: 3600,
      },
    };

    switch (environment) {
      case 'development':
        return {
          ...basePerformance,
          memoryLimit: 1024,
          cpuLimit: 50,
        };

      case 'production':
        return {
          ...basePerformance,
          memoryLimit: 4096,
          cpuLimit: 90,
          caching: {
            enabled: true,
            size: 500,
            ttl: 7200,
          },
        };

      default:
        return basePerformance;
    }
  }
}
