import fs from 'fs-extra';
import path from 'path';
import { z } from 'zod';
import { LogContext } from '../utils/logger';
import { ConfigurationError, ValidationError } from './types';
import type {
  Environment,
  InstallationOptions,
  FeatureOptions,
  SecurityOptions,
  PerformanceOptions,
  DatabaseOptions,
} from './types';

/**
 * Comprehensive Configuration Validator for ForgeFlow V2
 * Provides validation, error handling, and configuration health checks
 */
export class ConfigValidator {
  private logger = new LogContext('ConfigValidator');
  private validationRules = new Map<string, ValidationRule>();
  private customValidators = new Map<string, (value: any) => ValidationResult>();

  constructor() {
    this.initializeValidationRules();
    this.setupCustomValidators();
  }

  /**
   * Validate installation options
   */
  async validateInstallationOptions(options: InstallationOptions): Promise<ValidationSummary> {
    const results: ValidationResult[] = [];

    try {
      // Validate basic options
      results.push(await this.validateProjectPath(options.projectPath));
      results.push(await this.validateProjectType(options.projectType));
      results.push(await this.validateEnvironment(options.environment));

      // Validate GitHub options
      if (options.github?.enabled) {
        results.push(await this.validateGitHubOptions(options.github));
      }

      // Validate features
      if (options.features) {
        results.push(await this.validateFeatureOptions(options.features));
      }

      // Validate backup options
      if (options.backup) {
        results.push(await this.validateBackupOptions(options.backup));
      }

      // Validate advanced options
      if (options.advanced) {
        results.push(await this.validateAdvancedOptions(options.advanced));
      }

      return this.summarizeValidation('Installation Options', results);
    } catch (error) {
      this.logger.error('Installation options validation failed', error);
      throw new ValidationError('Installation options validation failed', undefined);
    }
  }

  /**
   * Validate configuration file
   */
  async validateConfigurationFile(configPath: string): Promise<ValidationSummary> {
    const results: ValidationResult[] = [];

    try {
      // Check if file exists
      if (!(await fs.pathExists(configPath))) {
        return {
          category: 'Configuration File',
          valid: false,
          errors: [`Configuration file not found: ${configPath}`],
          warnings: [],
          suggestions: ['Run "ff2 init" to create a configuration file'],
          details: results,
        };
      }

      // Validate file format
      results.push(await this.validateFileFormat(configPath));

      // Parse and validate content
      const config = await this.parseConfigurationFile(configPath);
      if (config) {
        results.push(await this.validateConfigurationStructure(config));
        results.push(await this.validateConfigurationValues(config));
        results.push(await this.validateConfigurationConstraints(config));
      }

      return this.summarizeValidation('Configuration File', results);
    } catch (error) {
      this.logger.error('Configuration file validation failed', error);
      return {
        category: 'Configuration File',
        valid: false,
        errors: [`Configuration validation error: ${error.message}`],
        warnings: [],
        suggestions: ['Check file syntax and permissions'],
        details: results,
      };
    }
  }

  /**
   * Validate environment configuration
   */
  async validateEnvironmentConfiguration(
    projectPath: string,
    environment: Environment,
  ): Promise<ValidationSummary> {
    const results: ValidationResult[] = [];

    try {
      const envConfigPath = path.join(projectPath, 'config', 'environments', `${environment}.yaml`);

      // Check environment configuration exists
      results.push(await this.validateEnvironmentConfigExists(envConfigPath, environment));

      // Validate environment-specific constraints
      results.push(await this.validateEnvironmentConstraints(projectPath, environment));

      // Validate environment directory structure
      results.push(await this.validateEnvironmentDirectories(projectPath, environment));

      // Validate environment variables
      results.push(await this.validateEnvironmentVariables(environment));

      return this.summarizeValidation(`Environment (${environment})`, results);
    } catch (error) {
      this.logger.error(`Environment validation failed for ${environment}`, error);
      throw new ValidationError(`Environment validation failed for ${environment}`, environment);
    }
  }

  /**
   * Validate feature flag configuration
   */
  async validateFeatureFlagConfiguration(projectPath: string): Promise<ValidationSummary> {
    const results: ValidationResult[] = [];

    try {
      const flagsPath = path.join(projectPath, 'config', 'feature-flags.json');

      // Check if feature flags file exists
      if (await fs.pathExists(flagsPath)) {
        results.push(await this.validateFeatureFlagsFile(flagsPath));

        // Parse and validate individual flags
        const flagsData = await fs.readJson(flagsPath);
        if (flagsData.flags) {
          for (const flag of flagsData.flags) {
            results.push(await this.validateFeatureFlag(flag));
          }
        }
      } else {
        results.push({
          category: 'Feature Flags',
          valid: true,
          field: 'existence',
          message: 'No feature flags file found - will be created with defaults',
          severity: 'info',
          suggestions: ['Feature flags will be initialized during setup'],
        });
      }

      return this.summarizeValidation('Feature Flags', results);
    } catch (error) {
      this.logger.error('Feature flag validation failed', error);
      throw new ValidationError('Feature flag validation failed');
    }
  }

  /**
   * Comprehensive project validation
   */
  async validateProject(projectPath: string): Promise<ProjectValidationReport> {
    const report: ProjectValidationReport = {
      projectPath,
      timestamp: new Date(),
      overallValid: true,
      validations: {},
      criticalIssues: [],
      recommendations: [],
      performanceScore: 0,
    };

    try {
      // Validate project structure
      report.validations.structure = await this.validateProjectStructure(projectPath);

      // Validate configuration
      const configPath = await this.findConfigurationFile(projectPath);
      if (configPath) {
        report.validations.configuration = await this.validateConfigurationFile(configPath);
      }

      // Validate environments
      const environments = await this.getAvailableEnvironments(projectPath);
      for (const env of environments) {
        report.validations[`environment_${env}`] = await this.validateEnvironmentConfiguration(
          projectPath,
          env,
        );
      }

      // Validate feature flags
      report.validations.featureFlags = await this.validateFeatureFlagConfiguration(projectPath);

      // Calculate overall validity and performance score
      this.calculateProjectHealth(report);

      return report;
    } catch (error) {
      this.logger.error('Project validation failed', error);
      report.overallValid = false;
      report.criticalIssues.push(`Project validation failed: ${error.message}`);
      return report;
    }
  }

  /**
   * Add custom validation rule
   */
  addValidationRule(name: string, rule: ValidationRule): void {
    this.validationRules.set(name, rule);
    this.logger.debug(`Added validation rule: ${name}`);
  }

  /**
   * Add custom validator function
   */
  addCustomValidator(name: string, validator: (value: any) => ValidationResult): void {
    this.customValidators.set(name, validator);
    this.logger.debug(`Added custom validator: ${name}`);
  }

  /**
   * Private validation methods
   */
  private async validateProjectPath(projectPath: string): Promise<ValidationResult> {
    try {
      // Check if path exists
      if (!(await fs.pathExists(projectPath))) {
        return {
          category: 'Project Path',
          valid: false,
          field: 'projectPath',
          message: `Project path does not exist: ${projectPath}`,
          severity: 'error',
          suggestions: ['Ensure the project path exists', 'Use an absolute path'],
        };
      }

      // Check if path is writable
      try {
        const testFile = path.join(projectPath, '.ff2-write-test');
        await fs.writeFile(testFile, 'test');
        await fs.remove(testFile);
      } catch (error) {
        return {
          category: 'Project Path',
          valid: false,
          field: 'projectPath',
          message: `Project path is not writable: ${projectPath}`,
          severity: 'error',
          suggestions: ['Check file permissions', 'Run with elevated privileges if needed'],
        };
      }

      // Check path length (Windows limitation)
      if (process.platform === 'win32' && projectPath.length > 240) {
        return {
          category: 'Project Path',
          valid: false,
          field: 'projectPath',
          message: 'Project path is too long for Windows (>240 characters)',
          severity: 'error',
          suggestions: ['Use a shorter path', 'Move project closer to drive root'],
        };
      }

      return {
        category: 'Project Path',
        valid: true,
        field: 'projectPath',
        message: 'Project path is valid and accessible',
        severity: 'info',
      };
    } catch (error) {
      return {
        category: 'Project Path',
        valid: false,
        field: 'projectPath',
        message: `Path validation error: ${error.message}`,
        severity: 'error',
      };
    }
  }

  private async validateProjectType(projectType: string): Promise<ValidationResult> {
    const validTypes = ['nodejs', 'python', 'mixed', 'generic'];

    if (!validTypes.includes(projectType)) {
      return {
        category: 'Project Type',
        valid: false,
        field: 'projectType',
        message: `Invalid project type: ${projectType}`,
        severity: 'error',
        suggestions: [`Valid types: ${validTypes.join(', ')}`],
      };
    }

    return {
      category: 'Project Type',
      valid: true,
      field: 'projectType',
      message: `Project type '${projectType}' is valid`,
      severity: 'info',
    };
  }

  private async validateEnvironment(environment: Environment): Promise<ValidationResult> {
    const validEnvironments: Environment[] = ['development', 'testing', 'staging', 'production'];

    if (!validEnvironments.includes(environment)) {
      return {
        category: 'Environment',
        valid: false,
        field: 'environment',
        message: `Invalid environment: ${environment}`,
        severity: 'error',
        suggestions: [`Valid environments: ${validEnvironments.join(', ')}`],
      };
    }

    return {
      category: 'Environment',
      valid: true,
      field: 'environment',
      message: `Environment '${environment}' is valid`,
      severity: 'info',
    };
  }

  private async validateGitHubOptions(github: any): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    if (github.token && !this.isValidGitHubToken(github.token)) {
      errors.push('Invalid GitHub token format');
      suggestions.push('Token should start with "ghp_" or "github_pat_"');
    }

    if (!github.autoDetect && (!github.owner || !github.repo)) {
      errors.push('GitHub owner and repository are required when auto-detect is disabled');
      suggestions.push('Enable auto-detect or provide owner and repo values');
    }

    if (github.owner && !this.isValidGitHubOwner(github.owner)) {
      warnings.push('GitHub owner contains unusual characters');
      suggestions.push(
        'GitHub usernames typically contain only alphanumeric characters and hyphens',
      );
    }

    return {
      category: 'GitHub Options',
      valid: errors.length === 0,
      field: 'github',
      message: errors.length > 0 ? errors.join(', ') : 'GitHub options are valid',
      severity: errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'info',
      suggestions,
    };
  }

  private async validateFeatureOptions(features: FeatureOptions): Promise<ValidationResult> {
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Check feature dependencies
    if (features.enableAnalytics && !features.enableMonitoring) {
      warnings.push('Analytics requires monitoring to be enabled');
      suggestions.push('Enable monitoring for analytics to work properly');
    }

    if (features.enableRealtime && !features.enableDashboard) {
      warnings.push('Real-time updates require dashboard to be enabled');
      suggestions.push('Enable dashboard for real-time features');
    }

    // Check resource implications
    const heavyFeatures = [
      features.enableAnalytics,
      features.enableMonitoring,
      features.enableRealtime,
    ].filter(Boolean).length;

    if (heavyFeatures >= 3) {
      warnings.push('Multiple resource-intensive features enabled');
      suggestions.push('Monitor system performance with heavy feature load');
    }

    return {
      category: 'Feature Options',
      valid: true,
      field: 'features',
      message: warnings.length > 0 ? warnings.join(', ') : 'Feature options are valid',
      severity: warnings.length > 0 ? 'warning' : 'info',
      suggestions,
    };
  }

  private async validateBackupOptions(backup: any): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    if (backup.frequency !== undefined && backup.frequency < 0) {
      errors.push('Backup frequency cannot be negative');
    }

    if (backup.retention !== undefined && backup.retention < 1) {
      errors.push('Backup retention must be at least 1');
    }

    if (backup.storagePath) {
      try {
        const resolvedPath = path.resolve(backup.storagePath);
        await fs.ensureDir(path.dirname(resolvedPath));
      } catch (error) {
        errors.push(`Invalid backup storage path: ${backup.storagePath}`);
        suggestions.push('Ensure backup directory is writable');
      }
    }

    if (backup.encrypt && !backup.encryptionKey) {
      warnings.push('Encryption enabled but no encryption key provided');
      suggestions.push('Provide encryption key or disable encryption');
    }

    return {
      category: 'Backup Options',
      valid: errors.length === 0,
      field: 'backup',
      message: errors.length > 0 ? errors.join(', ') : 'Backup options are valid',
      severity: errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'info',
      suggestions,
    };
  }

  private async validateAdvancedOptions(advanced: any): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    if (advanced.maxConcurrentAgents !== undefined) {
      if (advanced.maxConcurrentAgents < 1) {
        errors.push('Maximum concurrent agents must be at least 1');
      } else if (advanced.maxConcurrentAgents > 50) {
        warnings.push('Very high concurrent agent limit may impact performance');
        suggestions.push('Consider system resources when setting high limits');
      }
    }

    if (advanced.agentTimeout !== undefined) {
      if (advanced.agentTimeout < 30000) {
        // 30 seconds
        warnings.push('Agent timeout is very low (< 30 seconds)');
        suggestions.push('Consider longer timeout for complex operations');
      } else if (advanced.agentTimeout > 3600000) {
        // 1 hour
        warnings.push('Agent timeout is very high (> 1 hour)');
        suggestions.push('Long timeouts may mask underlying issues');
      }
    }

    if (advanced.database) {
      const dbValidation = await this.validateDatabaseOptions(advanced.database);
      if (!dbValidation.valid) {
        errors.push(`Database configuration: ${dbValidation.message}`);
      }
    }

    return {
      category: 'Advanced Options',
      valid: errors.length === 0,
      field: 'advanced',
      message: errors.length > 0 ? errors.join(', ') : 'Advanced options are valid',
      severity: errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'info',
      suggestions,
    };
  }

  private async validateDatabaseOptions(database: DatabaseOptions): Promise<ValidationResult> {
    const errors: string[] = [];
    const suggestions: string[] = [];

    if (database.type === 'postgres' || database.type === 'mysql') {
      if (!database.url) {
        errors.push(`Database URL is required for ${database.type}`);
        suggestions.push(`Provide connection URL for ${database.type} database`);
      } else if (!this.isValidDatabaseUrl(database.url, database.type)) {
        errors.push(`Invalid ${database.type} connection URL format`);
        suggestions.push(`Check ${database.type} URL format`);
      }
    }

    if (database.poolSize !== undefined) {
      if (database.poolSize < 1) {
        errors.push('Database pool size must be at least 1');
      } else if (database.poolSize > 100) {
        errors.push('Database pool size is too high (max 100)');
      }
    }

    return {
      category: 'Database Options',
      valid: errors.length === 0,
      field: 'database',
      message: errors.length > 0 ? errors.join(', ') : 'Database options are valid',
      severity: errors.length > 0 ? 'error' : 'info',
      suggestions,
    };
  }

  private async validateFileFormat(filePath: string): Promise<ValidationResult> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const ext = path.extname(filePath).toLowerCase();

      if (ext === '.json') {
        JSON.parse(content);
      } else if (ext === '.yaml' || ext === '.yml') {
        const yaml = require('yaml');
        yaml.parse(content);
      } else {
        return {
          category: 'File Format',
          valid: false,
          field: 'format',
          message: `Unsupported file format: ${ext}`,
          severity: 'error',
          suggestions: ['Use .json, .yaml, or .yml format'],
        };
      }

      return {
        category: 'File Format',
        valid: true,
        field: 'format',
        message: 'File format is valid',
        severity: 'info',
      };
    } catch (error) {
      return {
        category: 'File Format',
        valid: false,
        field: 'format',
        message: `File parsing error: ${error.message}`,
        severity: 'error',
        suggestions: ['Check file syntax', 'Validate JSON/YAML format'],
      };
    }
  }

  private async parseConfigurationFile(filePath: string): Promise<any> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const ext = path.extname(filePath).toLowerCase();

      if (ext === '.json') {
        return JSON.parse(content);
      } else if (ext === '.yaml' || ext === '.yml') {
        const yaml = require('yaml');
        return yaml.parse(content);
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to parse configuration file', error);
      return null;
    }
  }

  private async validateConfigurationStructure(config: any): Promise<ValidationResult> {
    const requiredFields = ['project', 'environment', 'agents', 'quality'];
    const missingFields = [];

    for (const field of requiredFields) {
      if (!config[field]) {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      return {
        category: 'Configuration Structure',
        valid: false,
        field: 'structure',
        message: `Missing required fields: ${missingFields.join(', ')}`,
        severity: 'error',
        suggestions: ['Add missing configuration sections'],
      };
    }

    return {
      category: 'Configuration Structure',
      valid: true,
      field: 'structure',
      message: 'Configuration structure is valid',
      severity: 'info',
    };
  }

  private async validateConfigurationValues(config: any): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate project section
    if (config.project) {
      if (!config.project.name || typeof config.project.name !== 'string') {
        errors.push('Project name is required and must be a string');
      }
      if (
        config.project.type &&
        !['nodejs', 'python', 'mixed', 'generic'].includes(config.project.type)
      ) {
        errors.push('Invalid project type');
      }
    }

    // Validate agents section
    if (config.agents) {
      if (config.agents.maxConcurrent && config.agents.maxConcurrent < 1) {
        errors.push('maxConcurrent must be at least 1');
      }
      if (config.agents.timeout && config.agents.timeout < 10000) {
        warnings.push('Agent timeout is very low');
      }
    }

    // Validate quality section
    if (config.quality) {
      if (
        config.quality.coverage !== undefined &&
        (config.quality.coverage < 0 || config.quality.coverage > 100)
      ) {
        errors.push('Coverage must be between 0 and 100');
      }
    }

    return {
      category: 'Configuration Values',
      valid: errors.length === 0,
      field: 'values',
      message: errors.length > 0 ? errors.join(', ') : 'Configuration values are valid',
      severity: errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'info',
    };
  }

  private async validateConfigurationConstraints(config: any): Promise<ValidationResult> {
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Check for resource constraints
    if (config.agents?.maxConcurrent > 10 && config.performance?.memoryLimit < 2048) {
      warnings.push('High agent concurrency with low memory limit');
      suggestions.push('Increase memory limit for better performance');
    }

    // Check for feature dependencies
    if (config.features?.analytics && !config.features?.monitoring) {
      warnings.push('Analytics enabled without monitoring');
      suggestions.push('Enable monitoring for analytics features');
    }

    return {
      category: 'Configuration Constraints',
      valid: true,
      field: 'constraints',
      message: warnings.length > 0 ? warnings.join(', ') : 'Configuration constraints satisfied',
      severity: warnings.length > 0 ? 'warning' : 'info',
      suggestions,
    };
  }

  private async validateEnvironmentConfigExists(
    configPath: string,
    environment: Environment,
  ): Promise<ValidationResult> {
    if (!(await fs.pathExists(configPath))) {
      return {
        category: 'Environment Config',
        valid: false,
        field: 'existence',
        message: `Environment configuration not found: ${environment}`,
        severity: environment === 'production' ? 'error' : 'warning',
        suggestions: [`Create ${environment}.yaml in config/environments/`],
      };
    }

    return {
      category: 'Environment Config',
      valid: true,
      field: 'existence',
      message: `Environment configuration exists: ${environment}`,
      severity: 'info',
    };
  }

  private async validateEnvironmentConstraints(
    projectPath: string,
    environment: Environment,
  ): Promise<ValidationResult> {
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Production-specific validations
    if (environment === 'production') {
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (await fs.pathExists(packageJsonPath)) {
        const packageJson = await fs.readJson(packageJsonPath);

        // Check for development dependencies in production
        if (packageJson.devDependencies && Object.keys(packageJson.devDependencies).length > 0) {
          warnings.push('Development dependencies present in production environment');
          suggestions.push('Use npm ci --only=production for production builds');
        }
      }

      // Check for debug configurations
      if (process.env.DEBUG) {
        warnings.push('Debug mode enabled in production environment');
        suggestions.push('Disable debug mode for production');
      }
    }

    return {
      category: 'Environment Constraints',
      valid: true,
      field: 'constraints',
      message: warnings.length > 0 ? warnings.join(', ') : 'Environment constraints satisfied',
      severity: warnings.length > 0 ? 'warning' : 'info',
      suggestions,
    };
  }

  private async validateEnvironmentDirectories(
    projectPath: string,
    environment: Environment,
  ): Promise<ValidationResult> {
    const requiredDirs = [`data/${environment}`, `logs/${environment}`, `config/environments`];

    const missingDirs: string[] = [];

    for (const dir of requiredDirs) {
      const dirPath = path.join(projectPath, dir);
      if (!(await fs.pathExists(dirPath))) {
        missingDirs.push(dir);
      }
    }

    if (missingDirs.length > 0) {
      return {
        category: 'Environment Directories',
        valid: false,
        field: 'directories',
        message: `Missing directories: ${missingDirs.join(', ')}`,
        severity: 'warning',
        suggestions: ['Create missing directories during initialization'],
      };
    }

    return {
      category: 'Environment Directories',
      valid: true,
      field: 'directories',
      message: 'Environment directories exist',
      severity: 'info',
    };
  }

  private async validateEnvironmentVariables(environment: Environment): Promise<ValidationResult> {
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Check NODE_ENV consistency
    if (process.env.NODE_ENV && process.env.NODE_ENV !== environment) {
      warnings.push(
        `NODE_ENV (${process.env.NODE_ENV}) doesn't match target environment (${environment})`,
      );
      suggestions.push('Ensure NODE_ENV matches the target environment');
    }

    // Check for required production variables
    if (environment === 'production') {
      const requiredVars = ['NODE_ENV'];
      for (const varName of requiredVars) {
        if (!process.env[varName]) {
          warnings.push(`Required environment variable not set: ${varName}`);
          suggestions.push(`Set ${varName} environment variable`);
        }
      }
    }

    return {
      category: 'Environment Variables',
      valid: true,
      field: 'variables',
      message: warnings.length > 0 ? warnings.join(', ') : 'Environment variables are properly set',
      severity: warnings.length > 0 ? 'warning' : 'info',
      suggestions,
    };
  }

  private async validateFeatureFlagsFile(filePath: string): Promise<ValidationResult> {
    try {
      const content = await fs.readJson(filePath);

      if (!content.flags || !Array.isArray(content.flags)) {
        return {
          category: 'Feature Flags File',
          valid: false,
          field: 'structure',
          message: 'Invalid feature flags file structure',
          severity: 'error',
          suggestions: ['Feature flags file should contain a "flags" array'],
        };
      }

      return {
        category: 'Feature Flags File',
        valid: true,
        field: 'structure',
        message: 'Feature flags file structure is valid',
        severity: 'info',
      };
    } catch (error) {
      return {
        category: 'Feature Flags File',
        valid: false,
        field: 'format',
        message: `Failed to parse feature flags file: ${error.message}`,
        severity: 'error',
        suggestions: ['Check JSON syntax in feature flags file'],
      };
    }
  }

  private async validateFeatureFlag(flag: any): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!flag.key || typeof flag.key !== 'string') {
      errors.push('Feature flag must have a string key');
    }

    if (!flag.name || typeof flag.name !== 'string') {
      errors.push('Feature flag must have a string name');
    }

    if (flag.rolloutPercentage !== undefined) {
      if (
        typeof flag.rolloutPercentage !== 'number' ||
        flag.rolloutPercentage < 0 ||
        flag.rolloutPercentage > 100
      ) {
        errors.push('Rollout percentage must be a number between 0 and 100');
      }
    }

    if (flag.expiresAt) {
      const expiryDate = new Date(flag.expiresAt);
      if (expiryDate < new Date()) {
        warnings.push(`Feature flag '${flag.key}' has expired`);
      }
    }

    return {
      category: 'Feature Flag',
      valid: errors.length === 0,
      field: flag.key || 'unknown',
      message: errors.length > 0 ? errors.join(', ') : `Feature flag '${flag.key}' is valid`,
      severity: errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'info',
    };
  }

  private async validateProjectStructure(projectPath: string): Promise<ValidationSummary> {
    const results: ValidationResult[] = [];

    // Check for essential files
    const essentialFiles = [
      { path: 'package.json', required: true },
      { path: 'tsconfig.json', required: false },
      { path: '.gitignore', required: false },
      { path: 'README.md', required: false },
    ];

    for (const file of essentialFiles) {
      const filePath = path.join(projectPath, file.path);
      const exists = await fs.pathExists(filePath);

      if (!exists && file.required) {
        results.push({
          category: 'Project Structure',
          valid: false,
          field: file.path,
          message: `Required file missing: ${file.path}`,
          severity: 'error',
          suggestions: [`Create ${file.path} file`],
        });
      } else if (!exists) {
        results.push({
          category: 'Project Structure',
          valid: true,
          field: file.path,
          message: `Optional file missing: ${file.path}`,
          severity: 'info',
          suggestions: [`Consider creating ${file.path} file`],
        });
      } else {
        results.push({
          category: 'Project Structure',
          valid: true,
          field: file.path,
          message: `File exists: ${file.path}`,
          severity: 'info',
        });
      }
    }

    return this.summarizeValidation('Project Structure', results);
  }

  private async findConfigurationFile(projectPath: string): Promise<string | null> {
    const configFiles = [
      'forgeflow.config.yaml',
      'forgeflow.config.yml',
      'forgeflow.yaml',
      'forgeflow.yml',
      'forgeflow.config.json',
      '.forgeflow.yaml',
      '.forgeflow.yml',
    ];

    for (const file of configFiles) {
      const filePath = path.join(projectPath, file);
      if (await fs.pathExists(filePath)) {
        return filePath;
      }
    }

    return null;
  }

  private async getAvailableEnvironments(projectPath: string): Promise<Environment[]> {
    const environments: Environment[] = [];
    const envDir = path.join(projectPath, 'config', 'environments');

    if (await fs.pathExists(envDir)) {
      const files = await fs.readdir(envDir);

      for (const file of files) {
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          const envName = path.basename(file, path.extname(file));
          if (['development', 'testing', 'staging', 'production'].includes(envName)) {
            environments.push(envName as Environment);
          }
        }
      }
    }

    return environments;
  }

  private calculateProjectHealth(report: ProjectValidationReport): void {
    let totalScore = 0;
    let maxScore = 0;
    const criticalIssues: string[] = [];
    const recommendations: string[] = [];

    for (const [key, validation] of Object.entries(report.validations)) {
      maxScore += 100;

      if (validation.valid) {
        // Calculate score based on severity of issues
        let score = 100;
        const warningCount = validation.warnings.length;
        const suggestionCount = validation.suggestions.length;

        score -= warningCount * 10; // -10 per warning
        score -= suggestionCount * 5; // -5 per suggestion

        totalScore += Math.max(score, 0);
      } else {
        // Failed validation
        totalScore += 0;
        criticalIssues.push(...validation.errors);
      }

      // Collect recommendations
      recommendations.push(...validation.suggestions);
    }

    report.performanceScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    report.overallValid = report.performanceScore >= 70 && criticalIssues.length === 0;
    report.criticalIssues = [...new Set(criticalIssues)];
    report.recommendations = [...new Set(recommendations)];
  }

  private summarizeValidation(category: string, results: ValidationResult[]): ValidationSummary {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    for (const result of results) {
      if (!result.valid || result.severity === 'error') {
        errors.push(result.message);
      } else if (result.severity === 'warning') {
        warnings.push(result.message);
      }

      if (result.suggestions) {
        suggestions.push(...result.suggestions);
      }
    }

    return {
      category,
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions: [...new Set(suggestions)],
      details: results,
    };
  }

  private initializeValidationRules(): void {
    // Add built-in validation rules
    this.validationRules.set('required', {
      name: 'Required Field',
      description: 'Field must be present and not empty',
      validate: (value: any) => value !== undefined && value !== null && value !== '',
    });

    this.validationRules.set('string', {
      name: 'String Type',
      description: 'Field must be a string',
      validate: (value: any) => typeof value === 'string',
    });

    this.validationRules.set('number', {
      name: 'Number Type',
      description: 'Field must be a number',
      validate: (value: any) => typeof value === 'number' && !isNaN(value),
    });

    this.validationRules.set('boolean', {
      name: 'Boolean Type',
      description: 'Field must be a boolean',
      validate: (value: any) => typeof value === 'boolean',
    });
  }

  private setupCustomValidators(): void {
    // Add custom validators for specific use cases
    this.customValidators.set('gitHubToken', (token: string) => ({
      category: 'GitHub Token',
      valid: this.isValidGitHubToken(token),
      field: 'token',
      message: this.isValidGitHubToken(token)
        ? 'Valid GitHub token format'
        : 'Invalid GitHub token format',
      severity: this.isValidGitHubToken(token) ? 'info' : 'error',
    }));

    this.customValidators.set('projectPath', (projectPath: string) => ({
      category: 'Project Path',
      valid: path.isAbsolute(projectPath),
      field: 'projectPath',
      message: path.isAbsolute(projectPath) ? 'Valid absolute path' : 'Path must be absolute',
      severity: path.isAbsolute(projectPath) ? 'info' : 'error',
    }));
  }

  private isValidGitHubToken(token: string): boolean {
    return token.startsWith('ghp_') || token.startsWith('github_pat_');
  }

  private isValidGitHubOwner(owner: string): boolean {
    return /^[a-zA-Z0-9-]+$/.test(owner);
  }

  private isValidDatabaseUrl(url: string, type: string): boolean {
    try {
      const parsed = new URL(url);

      switch (type) {
        case 'postgres':
          return parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:';
        case 'mysql':
          return parsed.protocol === 'mysql:';
        default:
          return false;
      }
    } catch {
      return false;
    }
  }
}

/**
 * Type definitions for validation
 */
export interface ValidationRule {
  name: string;
  description: string;
  validate: (value: any) => boolean;
}

export interface ValidationResult {
  category: string;
  valid: boolean;
  field: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  suggestions?: string[];
}

export interface ValidationSummary {
  category: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  details: ValidationResult[];
}

export interface ProjectValidationReport {
  projectPath: string;
  timestamp: Date;
  overallValid: boolean;
  validations: Record<string, ValidationSummary>;
  criticalIssues: string[];
  recommendations: string[];
  performanceScore: number;
}
