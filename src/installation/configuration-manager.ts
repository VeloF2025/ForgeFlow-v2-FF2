import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import chalk from 'chalk';
import { z } from 'zod';
import { LogContext } from '../utils/logger';
import { ConfigurationError, ValidationError } from './types';
import type {
  InstallationOptions,
  Environment,
  ConfigurationTemplate,
  EnvironmentConfig,
  DatabaseOptions,
  PerformanceOptions,
  SecurityOptions,
} from './types';

/**
 * Configuration schema validation using Zod
 */
const ConfigSchema = z.object({
  project: z.object({
    name: z.string().min(1),
    version: z.string().default('1.0.0'),
    type: z.enum(['nodejs', 'python', 'mixed', 'generic']),
    description: z.string().optional(),
  }),
  environment: z.enum(['development', 'staging', 'production', 'testing']),
  github: z
    .object({
      enabled: z.boolean().default(false),
      token: z.string().optional(),
      owner: z.string().optional(),
      repo: z.string().optional(),
      features: z
        .object({
          issues: z.boolean().default(true),
          pullRequests: z.boolean().default(true),
          webhooks: z.boolean().default(false),
        })
        .optional(),
    })
    .optional(),
  agents: z.object({
    maxConcurrent: z.number().min(1).max(20).default(5),
    timeout: z.number().min(10000).default(300000),
    retryAttempts: z.number().min(0).max(5).default(3),
    enabledAgents: z
      .array(z.string())
      .default([
        'strategic-planner',
        'system-architect',
        'code-implementer',
        'test-coverage-validator',
        'code-quality-reviewer',
      ]),
  }),
  quality: z.object({
    linting: z.boolean().default(true),
    testing: z.boolean().default(true),
    coverage: z.number().min(0).max(100).default(95),
    security: z.boolean().default(true),
    performance: z.boolean().default(true),
    typeChecking: z.boolean().default(true),
  }),
  features: z.object({
    featureFlags: z.boolean().default(true),
    backups: z.boolean().default(true),
    monitoring: z.boolean().default(true),
    analytics: z.boolean().default(false),
    dashboard: z.boolean().default(true),
    realtime: z.boolean().default(true),
  }),
  database: z
    .object({
      type: z.enum(['sqlite', 'postgres', 'mysql']).default('sqlite'),
      url: z.string().optional(),
      poolSize: z.number().min(1).max(50).default(10),
      logging: z.boolean().default(false),
      migrations: z
        .object({
          auto: z.boolean().default(true),
          path: z.string().default('./migrations'),
        })
        .optional(),
    })
    .optional(),
  performance: z
    .object({
      memoryLimit: z.number().min(512).default(2048), // MB
      cpuLimit: z.number().min(50).max(100).default(80), // percentage
      ioTimeout: z.number().min(1000).default(30000), // ms
      caching: z
        .object({
          enabled: z.boolean().default(true),
          size: z.number().min(10).default(100), // MB
          ttl: z.number().min(60).default(3600), // seconds
        })
        .optional(),
    })
    .optional(),
  security: z
    .object({
      inputValidation: z.boolean().default(true),
      outputSanitization: z.boolean().default(true),
      auditLogging: z.boolean().default(true),
      accessControl: z
        .object({
          enabled: z.boolean().default(false),
          allowedIps: z.array(z.string()).default([]),
          rateLimiting: z.boolean().default(true),
        })
        .optional(),
    })
    .optional(),
  backup: z
    .object({
      enabled: z.boolean().default(true),
      strategy: z.enum(['incremental', 'full', 'differential']).default('incremental'),
      frequency: z.enum(['hourly', 'daily', 'weekly', 'manual']).default('daily'),
      retention: z.object({
        daily: z.number().min(1).default(7),
        weekly: z.number().min(1).default(4),
        monthly: z.number().min(1).default(12),
      }),
      storage: z.object({
        path: z.string().default('./backups'),
        compress: z.boolean().default(true),
        encrypt: z.boolean().default(false),
      }),
    })
    .optional(),
  logging: z
    .object({
      level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
      file: z.boolean().default(true),
      console: z.boolean().default(true),
      maxFiles: z.number().min(1).default(10),
      maxSize: z.string().default('10MB'),
    })
    .optional(),
});

type ValidatedConfig = z.infer<typeof ConfigSchema>;

/**
 * Configuration Manager for ForgeFlow V2
 * Handles environment-specific configuration management
 */
export class ConfigurationManager {
  private logger = new LogContext('ConfigurationManager');
  private configCache = new Map<string, ValidatedConfig>();
  private templates = new Map<string, ConfigurationTemplate>();

  constructor() {
    this.loadDefaultTemplates();
  }

  /**
   * Initialize configuration for a new installation
   */
  async initialize(options: InstallationOptions): Promise<ValidatedConfig> {
    this.logger.info('Initializing configuration', {
      environment: options.environment,
      projectPath: options.projectPath,
    });

    try {
      // Generate configuration based on options
      const config = this.generateConfiguration(options);

      // Validate configuration
      const validatedConfig = await this.validateConfiguration(config);

      // Save configuration files
      await this.saveConfiguration(validatedConfig, options.projectPath);

      // Create environment-specific configurations
      await this.createEnvironmentConfigs(validatedConfig, options.projectPath);

      // Setup configuration templates
      await this.setupConfigurationTemplates(options.projectPath);

      this.logger.info('Configuration initialized successfully');
      return validatedConfig;
    } catch (error) {
      this.logger.error('Configuration initialization failed', error);
      throw new ConfigurationError('Failed to initialize configuration', undefined, error);
    }
  }

  /**
   * Load configuration from file or environment
   */
  async loadConfiguration(
    projectPath: string,
    environment?: Environment,
  ): Promise<ValidatedConfig> {
    const cacheKey = `${projectPath}-${environment || 'default'}`;

    if (this.configCache.has(cacheKey)) {
      return this.configCache.get(cacheKey);
    }

    try {
      // Try to load from various configuration files
      const configPaths = [
        'forgeflow.config.yaml',
        'forgeflow.config.yml',
        '.forgeflow.yaml',
        '.forgeflow.yml',
        'forgeflow.yaml',
        'forgeflow.yml',
      ];

      let configData: any = {};
      let foundConfigPath: string | null = null;

      for (const configPath of configPaths) {
        const fullPath = path.join(projectPath, configPath);
        if (await fs.pathExists(fullPath)) {
          const content = await fs.readFile(fullPath, 'utf-8');
          configData = yaml.parse(content);
          foundConfigPath = fullPath;
          break;
        }
      }

      if (!foundConfigPath) {
        throw new ConfigurationError('No configuration file found');
      }

      // Load environment-specific overrides
      if (environment) {
        const envConfigPath = path.join(
          projectPath,
          'config',
          'environments',
          `${environment}.yaml`,
        );
        if (await fs.pathExists(envConfigPath)) {
          const envContent = await fs.readFile(envConfigPath, 'utf-8');
          const envConfig = yaml.parse(envContent);
          configData = this.mergeConfigurations(configData, envConfig);
        }
      }

      // Apply environment variable overrides
      configData = this.applyEnvironmentVariables(configData);

      // Validate configuration
      const validatedConfig = await this.validateConfiguration(configData);

      // Cache the configuration
      this.configCache.set(cacheKey, validatedConfig);

      return validatedConfig;
    } catch (error) {
      this.logger.error('Failed to load configuration', error);
      throw new ConfigurationError('Failed to load configuration', undefined, error);
    }
  }

  /**
   * Save configuration to file
   */
  async saveConfiguration(config: ValidatedConfig, projectPath: string): Promise<void> {
    try {
      const configPath = path.join(projectPath, 'forgeflow.config.yaml');
      const configYaml = yaml.stringify(config, {
        indent: 2,
        lineWidth: 0,
        minContentWidth: 0,
      });

      await fs.writeFile(configPath, configYaml, 'utf-8');

      // Also create a JSON version for programmatic access
      const jsonPath = path.join(projectPath, 'forgeflow.config.json');
      await fs.writeFile(jsonPath, JSON.stringify(config, null, 2), 'utf-8');

      this.logger.info(`Configuration saved to ${configPath}`);
    } catch (error) {
      this.logger.error('Failed to save configuration', error);
      throw new ConfigurationError('Failed to save configuration', undefined, error);
    }
  }

  /**
   * Update specific configuration values
   */
  async updateConfiguration(
    projectPath: string,
    updates: Partial<ValidatedConfig>,
  ): Promise<ValidatedConfig> {
    try {
      // Load current configuration
      const currentConfig = await this.loadConfiguration(projectPath);

      // Merge updates
      const mergedConfig = this.mergeConfigurations(currentConfig, updates);

      // Validate merged configuration
      const validatedConfig = await this.validateConfiguration(mergedConfig);

      // Save updated configuration
      await this.saveConfiguration(validatedConfig, projectPath);

      // Clear cache to force reload
      this.configCache.clear();

      this.logger.info('Configuration updated successfully');
      return validatedConfig;
    } catch (error) {
      this.logger.error('Failed to update configuration', error);
      throw new ConfigurationError('Failed to update configuration', undefined, error);
    }
  }

  /**
   * Create environment-specific configuration files
   */
  async createEnvironmentConfigs(config: ValidatedConfig, projectPath: string): Promise<void> {
    const environments: Environment[] = ['development', 'staging', 'production', 'testing'];
    const configDir = path.join(projectPath, 'config', 'environments');

    await fs.ensureDir(configDir);

    for (const env of environments) {
      const envConfig = this.generateEnvironmentConfig(config, env);
      const envConfigPath = path.join(configDir, `${env}.yaml`);
      const envConfigYaml = yaml.stringify(envConfig, { indent: 2 });

      await fs.writeFile(envConfigPath, envConfigYaml, 'utf-8');
      this.logger.debug(`Created environment configuration: ${env}.yaml`);
    }
  }

  /**
   * Setup configuration templates
   */
  async setupConfigurationTemplates(projectPath: string): Promise<void> {
    const templatesDir = path.join(projectPath, 'config', 'templates');
    await fs.ensureDir(templatesDir);

    for (const [name, template] of this.templates) {
      const templatePath = path.join(templatesDir, `${name}.yaml`);
      const templateYaml = yaml.stringify(template, { indent: 2 });

      await fs.writeFile(templatePath, templateYaml, 'utf-8');
    }

    this.logger.info('Configuration templates created');
  }

  /**
   * Validate configuration against schema
   */
  async validateConfiguration(config: any): Promise<ValidatedConfig> {
    try {
      const validatedConfig = ConfigSchema.parse(config);

      // Additional validation logic
      await this.performAdvancedValidation(validatedConfig);

      return validatedConfig;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors
          .map((err) => `${err.path.join('.')}: ${err.message}`)
          .join(', ');

        throw new ValidationError(`Configuration validation failed: ${errorMessages}`);
      }

      throw error;
    }
  }

  /**
   * Generate configuration from installation options
   */
  private generateConfiguration(options: InstallationOptions): any {
    const baseConfig = {
      project: {
        name: path.basename(options.projectPath),
        type: options.projectType,
        version: '1.0.0',
        description: 'ForgeFlow V2 Project',
      },
      environment: options.environment,
      github: options.github
        ? {
            enabled: options.github.enabled,
            token: options.github.token,
            owner: options.github.owner,
            repo: options.github.repo,
            features: {
              issues: options.github.enableIssues !== false,
              pullRequests: options.github.enablePRs !== false,
              webhooks: false,
            },
          }
        : undefined,
      agents: {
        maxConcurrent: options.advanced?.maxConcurrentAgents || 5,
        timeout: options.advanced?.agentTimeout || 300000,
        retryAttempts: 3,
        enabledAgents: [
          'strategic-planner',
          'system-architect',
          'code-implementer',
          'test-coverage-validator',
          'code-quality-reviewer',
          'antihallucination-validator',
        ],
      },
      quality: {
        linting: true,
        testing: true,
        coverage: 95,
        security: true,
        performance: true,
        typeChecking: options.projectType === 'nodejs',
      },
      features: {
        featureFlags: options.features?.enableFeatureFlags !== false,
        backups: options.features?.enableBackups !== false,
        monitoring: options.features?.enableMonitoring !== false,
        analytics: options.features?.enableAnalytics === true,
        dashboard: options.features?.enableDashboard !== false,
        realtime: options.features?.enableRealtime !== false,
      },
    };

    // Add database configuration if specified
    if (options.advanced?.database) {
      (baseConfig as any).database = {
        type: options.advanced.database.type || 'sqlite',
        url: options.advanced.database.url,
        poolSize: options.advanced.database.poolSize || 10,
        logging: options.advanced.database.logging || false,
        migrations: options.advanced.database.migrations,
      };
    }

    // Add performance configuration if specified
    if (options.advanced?.performance) {
      (baseConfig as any).performance = {
        memoryLimit: options.advanced.performance.memoryLimit || 2048,
        cpuLimit: options.advanced.performance.cpuLimit || 80,
        ioTimeout: options.advanced.performance.ioTimeout || 30000,
        caching: options.advanced.performance.caching,
      };
    }

    // Add security configuration if specified
    if (options.advanced?.security) {
      (baseConfig as any).security = {
        inputValidation: options.advanced.security.inputValidation !== false,
        outputSanitization: options.advanced.security.outputSanitization !== false,
        auditLogging: options.advanced.security.auditLogging !== false,
        accessControl: options.advanced.security.accessControl,
      };
    }

    // Add backup configuration
    if (options.backup?.enabled !== false) {
      (baseConfig as any).backup = {
        enabled: true,
        strategy: 'incremental',
        frequency: options.backup?.frequency
          ? options.backup.frequency < 60
            ? 'hourly'
            : 'daily'
          : 'daily',
        retention: {
          daily: 7,
          weekly: 4,
          monthly: 12,
        },
        storage: {
          path: options.backup?.storagePath || './backups',
          compress: options.backup?.compress !== false,
          encrypt: options.backup?.encrypt === true,
        },
      };
    }

    return baseConfig;
  }

  /**
   * Generate environment-specific configuration
   */
  private generateEnvironmentConfig(baseConfig: ValidatedConfig, environment: Environment): any {
    const envOverrides: Record<Environment, Partial<ValidatedConfig>> = {
      development: {
        agents: {
          ...baseConfig.agents,
          maxConcurrent: 3,
          timeout: 180000,
        },
        quality: {
          ...baseConfig.quality,
          coverage: 80,
        },
        logging: {
          level: 'debug',
          file: true,
          console: true,
          maxFiles: 5,
          maxSize: '5MB',
        },
      },
      testing: {
        agents: {
          ...baseConfig.agents,
          maxConcurrent: 2,
          timeout: 60000,
        },
        quality: {
          ...baseConfig.quality,
          coverage: 100,
        },
        features: {
          ...baseConfig.features,
          analytics: false,
          realtime: false,
        },
      },
      staging: {
        agents: {
          ...baseConfig.agents,
          maxConcurrent: 4,
          timeout: 240000,
        },
        quality: {
          ...baseConfig.quality,
          coverage: 95,
        },
        logging: {
          level: 'info',
          file: true,
          console: true,
          maxFiles: 7,
          maxSize: '10MB',
        },
      },
      production: {
        agents: {
          ...baseConfig.agents,
          maxConcurrent: 8,
          timeout: 300000,
        },
        quality: {
          ...baseConfig.quality,
          coverage: 95,
        },
        security: {
          inputValidation: true,
          outputSanitization: true,
          auditLogging: true,
          accessControl: {
            enabled: true,
            allowedIps: [],
            rateLimiting: true,
          },
        },
        logging: {
          level: 'warn',
          file: true,
          console: false,
          maxFiles: 20,
          maxSize: '50MB',
        },
      },
    };

    return this.mergeConfigurations(baseConfig, envOverrides[environment] || {});
  }

  /**
   * Apply environment variable overrides
   */
  private applyEnvironmentVariables(config: any): any {
    const envMappings = {
      FORGEFLOW_GITHUB_TOKEN: 'github.token',
      FORGEFLOW_GITHUB_OWNER: 'github.owner',
      FORGEFLOW_GITHUB_REPO: 'github.repo',
      FORGEFLOW_MAX_AGENTS: 'agents.maxConcurrent',
      FORGEFLOW_AGENT_TIMEOUT: 'agents.timeout',
      FORGEFLOW_LOG_LEVEL: 'logging.level',
      FORGEFLOW_DB_URL: 'database.url',
      FORGEFLOW_COVERAGE_TARGET: 'quality.coverage',
    };

    for (const [envVar, configPath] of Object.entries(envMappings)) {
      const value = process.env[envVar];
      if (value !== undefined) {
        this.setNestedValue(config, configPath, this.parseEnvValue(value));
      }
    }

    return config;
  }

  /**
   * Perform advanced validation checks
   */
  private async performAdvancedValidation(config: ValidatedConfig): Promise<void> {
    const errors: string[] = [];

    // Validate GitHub configuration
    if (config.github?.enabled) {
      if (!config.github.token) {
        errors.push('GitHub token is required when GitHub integration is enabled');
      }
      if (!config.github.owner) {
        errors.push('GitHub owner is required when GitHub integration is enabled');
      }
      if (!config.github.repo) {
        errors.push('GitHub repository is required when GitHub integration is enabled');
      }
    }

    // Validate database configuration
    if (config.database?.type === 'postgres' || config.database?.type === 'mysql') {
      if (!config.database.url) {
        errors.push(`Database URL is required for ${config.database.type}`);
      }
    }

    // Validate feature dependencies
    if (config.features.analytics && !config.features.monitoring) {
      errors.push('Analytics feature requires monitoring to be enabled');
    }

    // Validate resource limits
    if (config.performance) {
      if (config.performance.memoryLimit && config.performance.memoryLimit < 512) {
        errors.push('Memory limit must be at least 512MB');
      }
      if (
        config.performance.cpuLimit &&
        (config.performance.cpuLimit < 10 || config.performance.cpuLimit > 100)
      ) {
        errors.push('CPU limit must be between 10% and 100%');
      }
    }

    if (errors.length > 0) {
      throw new ValidationError(`Configuration validation failed: ${errors.join(', ')}`);
    }
  }

  /**
   * Load default configuration templates
   */
  private loadDefaultTemplates(): void {
    const templates: ConfigurationTemplate[] = [
      {
        name: 'minimal',
        description: 'Minimal configuration for small projects',
        environment: 'development',
        content: {
          agents: { maxConcurrent: 2 },
          features: {
            featureFlags: false,
            analytics: false,
            realtime: false,
          },
        },
      },
      {
        name: 'enterprise',
        description: 'Enterprise configuration with all features',
        environment: 'production',
        content: {
          agents: { maxConcurrent: 10 },
          features: {
            featureFlags: true,
            backups: true,
            monitoring: true,
            analytics: true,
            dashboard: true,
            realtime: true,
          },
          security: {
            inputValidation: true,
            outputSanitization: true,
            auditLogging: true,
            accessControl: { enabled: true },
          },
        },
      },
    ];

    for (const template of templates) {
      this.templates.set(template.name, template);
    }
  }

  /**
   * Utility methods
   */
  private mergeConfigurations(base: any, override: any): any {
    if (typeof override !== 'object' || override === null) {
      return override;
    }

    const result = { ...base };

    for (const [key, value] of Object.entries(override)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = this.mergeConfigurations(result[key] || {}, value);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }

  private parseEnvValue(value: string): any {
    // Try to parse as number
    if (/^\d+$/.test(value)) {
      return parseInt(value, 10);
    }

    // Try to parse as boolean
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // Return as string
    return value;
  }

  /**
   * Public utility methods for external use
   */
  async getConfiguration(projectPath: string, environment?: Environment): Promise<ValidatedConfig> {
    return this.loadConfiguration(projectPath, environment);
  }

  async setConfigValue(projectPath: string, path: string, value: any): Promise<void> {
    const updates = {};
    this.setNestedValue(updates, path, value);
    await this.updateConfiguration(projectPath, updates);
  }

  async getConfigValue(projectPath: string, path: string, environment?: Environment): Promise<any> {
    const config = await this.loadConfiguration(projectPath, environment);
    return this.getNestedValue(config, path);
  }

  private getNestedValue(obj: any, path: string): any {
    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current === null || current === undefined || !(key in current)) {
        return undefined;
      }
      current = current[key];
    }

    return current;
  }

  /**
   * Configuration export and import
   */
  async exportConfiguration(projectPath: string): Promise<string> {
    const config = await this.loadConfiguration(projectPath);
    return yaml.stringify(config, { indent: 2 });
  }

  async importConfiguration(projectPath: string, configYaml: string): Promise<ValidatedConfig> {
    const config = yaml.parse(configYaml);
    const validatedConfig = await this.validateConfiguration(config);
    await this.saveConfiguration(validatedConfig, projectPath);
    return validatedConfig;
  }

  /**
   * Clear configuration cache
   */
  clearCache(): void {
    this.configCache.clear();
    this.logger.debug('Configuration cache cleared');
  }
}
