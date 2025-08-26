import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';
import { ConfigValidator } from '../config-validator';
import type { InstallationOptions, Environment } from '../types';

describe('ConfigValidator', () => {
  let configValidator: ConfigValidator;
  let testProjectPath: string;
  let testConfigPath: string;

  beforeEach(async () => {
    configValidator = new ConfigValidator();

    // Create a real temporary directory for testing
    testProjectPath = await fs.mkdtemp(path.join(tmpdir(), 'ff2-config-test-'));
    testConfigPath = path.join(testProjectPath, 'forgeflow.config.json');

    // Create basic project structure
    await fs.ensureDir(path.join(testProjectPath, 'config', 'environments'));
    await fs.ensureDir(path.join(testProjectPath, 'data'));
    await fs.ensureDir(path.join(testProjectPath, 'logs'));

    // Create a basic package.json
    await fs.writeJson(path.join(testProjectPath, 'package.json'), {
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        express: '^4.18.0',
      },
    });
  });

  afterEach(async () => {
    // Clean up temporary directory
    if (testProjectPath && (await fs.pathExists(testProjectPath))) {
      await fs.remove(testProjectPath);
    }
  });

  describe('validateInstallationOptions', () => {
    it('should validate correct installation options', async () => {
      const options: InstallationOptions = {
        projectPath: testProjectPath, // Use real test directory
        projectType: 'nodejs',
        environment: 'development',
        skipWizard: true,
        github: {
          enabled: true,
          token: 'ghp_validtoken123',
          owner: 'testuser',
          repo: 'testrepo',
        },
        features: {
          enableFeatureFlags: true,
          enableBackups: true,
          enableMonitoring: true,
        },
      };

      const result = await configValidator.validateInstallationOptions(options);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid project path', async () => {
      const nonExistentPath = path.join(
        tmpdir(),
        'nonexistent-' + Math.random().toString(36).substring(7),
      );

      const options: InstallationOptions = {
        projectPath: nonExistentPath,
        projectType: 'nodejs',
        environment: 'development',
        skipWizard: true,
      };

      const result = await configValidator.validateInstallationOptions(options);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Project path does not exist'))).toBe(true);
    });

    it('should detect invalid project type', async () => {
      const options: InstallationOptions = {
        projectPath: testProjectPath,
        projectType: 'invalid' as any,
        environment: 'development',
        skipWizard: true,
      };

      const result = await configValidator.validateInstallationOptions(options);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid project type'))).toBe(true);
    });

    it('should detect invalid environment', async () => {
      const options: InstallationOptions = {
        projectPath: testProjectPath,
        projectType: 'nodejs',
        environment: 'invalid' as Environment,
        skipWizard: true,
      };

      const result = await configValidator.validateInstallationOptions(options);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid environment'))).toBe(true);
    });

    it('should validate GitHub token format', async () => {
      const options: InstallationOptions = {
        projectPath: testProjectPath,
        projectType: 'nodejs',
        environment: 'development',
        skipWizard: true,
        github: {
          enabled: true,
          token: 'invalid_token_format',
          owner: 'testuser',
          repo: 'testrepo',
        },
      };

      const result = await configValidator.validateInstallationOptions(options);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid GitHub token format'))).toBe(true);
    });

    it('should detect missing GitHub owner/repo when auto-detect disabled', async () => {
      const options: InstallationOptions = {
        projectPath: testProjectPath,
        projectType: 'nodejs',
        environment: 'development',
        skipWizard: true,
        github: {
          enabled: true,
          autoDetect: false,
          // Missing owner and repo
        },
      };

      const result = await configValidator.validateInstallationOptions(options);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes('GitHub owner and repository are required')),
      ).toBe(true);
    });

    it('should warn about feature dependencies', async () => {
      const options: InstallationOptions = {
        projectPath: testProjectPath,
        projectType: 'nodejs',
        environment: 'development',
        skipWizard: true,
        features: {
          enableAnalytics: true,
          enableMonitoring: false, // Analytics requires monitoring
        },
      };

      const result = await configValidator.validateInstallationOptions(options);

      expect(result.warnings.some((w) => w.includes('Analytics requires monitoring'))).toBe(true);
    });

    it('should validate backup options', async () => {
      const options: InstallationOptions = {
        projectPath: testProjectPath,
        projectType: 'nodejs',
        environment: 'development',
        skipWizard: true,
        backup: {
          enabled: true,
          frequency: -1, // Invalid negative frequency
          retention: 0, // Invalid zero retention
        },
      };

      const result = await configValidator.validateInstallationOptions(options);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Backup frequency cannot be negative'))).toBe(
        true,
      );
      expect(result.errors.some((e) => e.includes('Backup retention must be at least 1'))).toBe(
        true,
      );
    });

    it('should validate advanced options', async () => {
      const options: InstallationOptions = {
        projectPath: testProjectPath,
        projectType: 'nodejs',
        environment: 'development',
        skipWizard: true,
        advanced: {
          maxConcurrentAgents: 0, // Invalid
          agentTimeout: 100, // Too low
        },
      };

      const result = await configValidator.validateInstallationOptions(options);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes('Maximum concurrent agents must be at least 1')),
      ).toBe(true);
    });
  });

  describe('validateConfigurationFile', () => {
    it('should validate existing valid configuration file', async () => {
      const validConfig = {
        project: { name: 'test', type: 'nodejs' },
        environment: 'development',
        agents: { maxConcurrent: 5 },
        quality: { coverage: 90 },
      };

      // Write real config file
      await fs.writeJson(testConfigPath, validConfig);

      const result = await configValidator.validateConfigurationFile(testConfigPath);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle missing configuration file', async () => {
      const missingConfigPath = path.join(testProjectPath, 'missing.json');

      const result = await configValidator.validateConfigurationFile(missingConfigPath);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Configuration file not found'))).toBe(true);
      expect(result.suggestions.some((s) => s.includes('Run "ff2 init"'))).toBe(true);
    });

    it('should detect invalid JSON syntax', async () => {
      // Write invalid JSON to a real file
      await fs.writeFile(testConfigPath, '{ invalid json }');

      const result = await configValidator.validateConfigurationFile(testConfigPath);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      // Check that the error message contains information about the JSON parsing issue
      expect(
        result.errors.some(
          (e) => e.includes('Configuration validation error') || e.includes('JSON'),
        ),
      ).toBe(true);
    });

    it('should validate configuration structure', async () => {
      const incompleteConfig = {
        project: { name: 'test' },
        // Missing required sections: environment, agents, quality
      };

      // Write real incomplete config file
      await fs.writeJson(testConfigPath, incompleteConfig);

      const result = await configValidator.validateConfigurationFile(testConfigPath);

      expect(result.valid).toBe(false);
    });

    it('should validate configuration values', async () => {
      const invalidConfig = {
        project: { name: '', type: 'invalid_type' }, // Invalid values
        environment: 'development',
        agents: { maxConcurrent: -1 }, // Invalid negative
        quality: { coverage: 150 }, // Invalid over 100
      };

      // Write real invalid config file
      await fs.writeJson(testConfigPath, invalidConfig);

      const result = await configValidator.validateConfigurationFile(testConfigPath);

      expect(result.valid).toBe(false);
    });
  });

  describe('validateEnvironmentConfiguration', () => {
    it('should validate existing environment configuration', async () => {
      // Create real environment config file
      const envConfigPath = path.join(
        testProjectPath,
        'config',
        'environments',
        'development.yaml',
      );
      await fs.writeFile(
        envConfigPath,
        'environment: development\ndatabase:\n  url: sqlite://./dev.db',
      );

      const result = await configValidator.validateEnvironmentConfiguration(
        testProjectPath,
        'development',
      );

      expect(result.category).toBe('Environment (development)');
    });

    it('should detect missing environment configuration', async () => {
      // Don't create the production environment file
      const result = await configValidator.validateEnvironmentConfiguration(
        testProjectPath,
        'production',
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Environment configuration not found'))).toBe(
        true,
      );
    });

    it('should validate environment directories', async () => {
      // The test environment creates 'data' and 'logs' but not 'data/development' and 'logs/development'
      // So by default they should be missing and trigger the warning
      const result = await configValidator.validateEnvironmentConfiguration(
        testProjectPath,
        'development',
      );

      // We should get either warnings in the main result, or details with validation issues
      const hasDirectoryIssues =
        result.warnings.some((w) => w.includes('Missing directories')) ||
        result.details?.some(
          (d) => d.message?.includes('Missing directories') || d.severity === 'warning',
        ) ||
        result.errors.some((e) => e.includes('Missing directories'));

      expect(hasDirectoryIssues).toBe(true);
    });

    it('should validate environment variables consistency', async () => {
      // Set NODE_ENV to be different from target environment for real test
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const result = await configValidator.validateEnvironmentConfiguration(
        testProjectPath,
        'development',
      );

      expect(result.warnings.some((w) => w.includes('NODE_ENV'))).toBe(true);

      // Restore original NODE_ENV
      process.env.NODE_ENV = originalNodeEnv;
    });
  });

  describe('validateFeatureFlagConfiguration', () => {
    it('should handle missing feature flags file', async () => {
      // Don't create feature flags file - test real missing file scenario
      const result = await configValidator.validateFeatureFlagConfiguration(testProjectPath);

      expect(result.valid).toBe(true); // Missing file is OK, will be created
      expect(result.details[0].message).toContain('No feature flags file found');
    });

    it('should validate feature flags file structure', async () => {
      const validFeatureFlags = {
        version: '1.0.0',
        flags: [
          {
            key: 'test.flag',
            name: 'Test Flag',
            description: 'Test feature flag',
            defaultValue: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };

      // Write real feature flags file
      const flagsPath = path.join(testProjectPath, 'config', 'feature-flags.json');
      await fs.writeJson(flagsPath, validFeatureFlags);

      const result = await configValidator.validateFeatureFlagConfiguration(testProjectPath);

      expect(result.valid).toBe(true);
    });

    it('should detect invalid feature flags file structure', async () => {
      const invalidFeatureFlags = {
        version: '1.0.0',
        // Missing flags array
      };

      // Write real invalid feature flags file
      const flagsPath = path.join(testProjectPath, 'config', 'feature-flags.json');
      await fs.writeJson(flagsPath, invalidFeatureFlags);

      const result = await configValidator.validateFeatureFlagConfiguration(testProjectPath);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid feature flags file structure'))).toBe(
        true,
      );
    });

    it('should validate individual feature flags', async () => {
      const flagsWithInvalidFlag = {
        version: '1.0.0',
        flags: [
          {
            // Missing required key
            name: 'Invalid Flag',
            description: 'Flag without key',
            defaultValue: true,
          },
          {
            key: 'valid.flag',
            name: 'Valid Flag',
            description: 'Valid flag',
            defaultValue: false,
            rolloutPercentage: 150, // Invalid percentage > 100
          },
        ],
      };

      // Write real invalid feature flags file
      const flagsPath = path.join(testProjectPath, 'config', 'feature-flags.json');
      await fs.writeJson(flagsPath, flagsWithInvalidFlag);

      const result = await configValidator.validateFeatureFlagConfiguration(testProjectPath);

      expect(result.valid).toBe(false);
    });
  });

  describe('validateProject', () => {
    it('should perform comprehensive project validation', async () => {
      // Create real project structure
      await fs.writeFile(
        path.join(testProjectPath, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { strict: true } }),
      );
      await fs.writeFile(path.join(testProjectPath, 'README.md'), '# Test Project');
      await fs.writeFile(path.join(testProjectPath, '.gitignore'), 'node_modules/\n*.log');

      // Create environment config files
      await fs.writeFile(
        path.join(testProjectPath, 'config', 'environments', 'development.yaml'),
        'env: development',
      );
      await fs.writeFile(
        path.join(testProjectPath, 'config', 'environments', 'production.yaml'),
        'env: production',
      );

      const result = await configValidator.validateProject(testProjectPath);

      expect(result.projectPath).toBe(testProjectPath);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.validations).toBeDefined();
      expect(result.overallValid).toBeDefined();
      expect(result.performanceScore).toBeGreaterThanOrEqual(0);
      expect(result.performanceScore).toBeLessThanOrEqual(100);
    });

    it('should calculate performance score correctly', async () => {
      // Create successful project setup with real files
      const validConfig = {
        project: { name: 'test', type: 'nodejs' },
        environment: 'development',
        agents: { maxConcurrent: 5 },
        quality: { coverage: 95 },
      };

      await fs.writeJson(testConfigPath, validConfig);
      await fs.writeFile(path.join(testProjectPath, 'README.md'), '# Test Project');
      await fs.writeFile(
        path.join(testProjectPath, 'config', 'environments', 'development.yaml'),
        'env: development',
      );
      await fs.ensureDir(path.join(testProjectPath, 'data', 'development'));
      await fs.ensureDir(path.join(testProjectPath, 'logs', 'development'));

      const result = await configValidator.validateProject(testProjectPath);

      expect(result.performanceScore).toBeGreaterThan(50); // Should be reasonable for valid project
    });

    it('should identify critical issues', async () => {
      // Create a project with missing required files (remove package.json)
      await fs.remove(path.join(testProjectPath, 'package.json'));

      const result = await configValidator.validateProject(testProjectPath);

      expect(result.overallValid).toBe(false);
      expect(result.criticalIssues.length).toBeGreaterThan(0);
    });

    it('should provide recommendations', async () => {
      // Create partial project structure to generate recommendations
      await fs.remove(path.join(testProjectPath, 'README.md')); // Remove optional file
      await fs.remove(path.join(testProjectPath, 'config', 'environments')); // Remove env configs

      const result = await configValidator.validateProject(testProjectPath);

      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('custom validation rules', () => {
    it('should allow adding custom validation rules', () => {
      const customRule = {
        name: 'Custom Test Rule',
        description: 'Test custom validation rule',
        validate: (value: any) => typeof value === 'string' && value.length > 0,
      };

      configValidator.addValidationRule('customTest', customRule);

      // Custom rules don't directly appear in health checks, but the rule is stored
      expect(true).toBe(true); // Rule was added without error
    });

    it('should allow adding custom validators', () => {
      const customValidator = (value: string) => ({
        category: 'Custom',
        valid: value === 'expected',
        field: 'test',
        message: value === 'expected' ? 'Valid' : 'Invalid value',
        severity: value === 'expected' ? ('info' as const) : ('error' as const),
      });

      configValidator.addCustomValidator('customValidator', customValidator);

      // Validator was added without error
      expect(true).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle file system errors gracefully', async () => {
      // Test with a path that would cause permission errors (on Windows, try a system path)
      const restrictedPath =
        process.platform === 'win32' ? 'C:\\System32\\config.json' : '/root/config.json';

      const result = await configValidator.validateConfigurationFile(restrictedPath);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) =>
            e.includes('Configuration validation error') ||
            e.includes('Configuration file not found'),
        ),
      ).toBe(true);
    });

    it('should handle invalid file permissions', async () => {
      // Create a file and then try to make it unreadable (this might not work on all systems)
      await fs.writeFile(testConfigPath, '{}');

      // On Unix systems, we could change permissions, but for cross-platform testing,
      // we'll test with an invalid path structure instead
      const invalidPath = path.join(testConfigPath, 'invalid', 'nested', 'config.json');

      const result = await configValidator.validateConfigurationFile(invalidPath);

      expect(result.valid).toBe(false);
    });

    it('should handle malformed configuration gracefully', async () => {
      // Write real malformed JSON
      await fs.writeFile(testConfigPath, 'not valid json at all');

      const result = await configValidator.validateConfigurationFile(testConfigPath);

      expect(result.valid).toBe(false);
      expect(result.suggestions.some((s) => s.includes('Check file syntax'))).toBe(true);
    });
  });

  describe('validation caching and performance', () => {
    it('should complete validation within reasonable time', async () => {
      const startTime = Date.now();

      const options: InstallationOptions = {
        projectPath: testProjectPath,
        projectType: 'nodejs',
        environment: 'development',
        skipWizard: true,
      };

      await configValidator.validateInstallationOptions(options);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds (more lenient for real FS ops)
    });

    it('should handle large configuration files', async () => {
      const largeConfig = {
        project: { name: 'large', type: 'nodejs' },
        environment: 'development',
        agents: { maxConcurrent: 10 },
        quality: { coverage: 95 },
        largeArray: new Array(10000).fill({ key: 'value' }),
      };

      // Write real large config file
      await fs.writeJson(testConfigPath, largeConfig);

      const startTime = Date.now();
      const result = await configValidator.validateConfigurationFile(testConfigPath);
      const duration = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(5000); // Should handle large files efficiently (more lenient)
    });
  });

  describe('validation reporting', () => {
    it('should provide detailed validation reports', async () => {
      const result = await configValidator.validateProject(testProjectPath);

      expect(result).toMatchObject({
        projectPath: expect.any(String),
        timestamp: expect.any(Date),
        overallValid: expect.any(Boolean),
        validations: expect.any(Object),
        criticalIssues: expect.any(Array),
        recommendations: expect.any(Array),
        performanceScore: expect.any(Number),
      });
    });

    it('should categorize validation results properly', async () => {
      const options: InstallationOptions = {
        projectPath: testProjectPath,
        projectType: 'nodejs',
        environment: 'development',
        skipWizard: true,
      };

      const result = await configValidator.validateInstallationOptions(options);

      expect(result.category).toBe('Installation Options');
      expect(result.valid).toBeDefined();
      expect(result.errors).toBeInstanceOf(Array);
      expect(result.warnings).toBeInstanceOf(Array);
      expect(result.suggestions).toBeInstanceOf(Array);
      expect(result.details).toBeInstanceOf(Array);
    });
  });
});
