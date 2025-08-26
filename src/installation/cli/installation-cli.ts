import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { table } from 'table';
import ora from 'ora';
import { InstallationManager } from '../installation-manager';
import { ConfigurationManager } from '../configuration-manager';
import { EnvironmentManager } from '../environment-manager';
import { HealthChecker } from '../health-checker';
import { BackupManager } from '../backup-manager';
import { FeatureFlagEngine } from '../feature-flag-engine';
import { SetupWizard } from '../setup-wizard';
import { LogContext } from '../../utils/logger';
import type { InstallationOptions, Environment, ProjectType } from '../types';

/**
 * Installation CLI implementation for ForgeFlow V2
 */
export class InstallationCLI {
  private logger = new LogContext('InstallationCLI');

  /**
   * Initialize ForgeFlow V2
   */
  async init(options: {
    path?: string;
    type?: ProjectType;
    env?: Environment;
    quick?: boolean;
    wizard?: boolean;
    skipHealthCheck?: boolean;
    skipGit?: boolean;
    skipBackup?: boolean;
  }): Promise<void> {
    const projectPath = path.resolve(options.path || process.cwd());

    // Show banner
    this.showBanner();

    if (options.wizard) {
      // Run interactive setup wizard
      const setupWizard = new SetupWizard();
      await setupWizard.run();
      return;
    }

    if (options.quick) {
      // Run quick setup
      console.log(chalk.blue('🚀 Running quick setup...\n'));
      const installationManager = new InstallationManager();
      await installationManager.quickSetup(projectPath);
      return;
    }

    // Standard initialization
    const installationOptions: InstallationOptions = {
      projectPath,
      projectType: options.type || 'nodejs',
      environment: options.env || 'development',
      skipWizard: true,
      github: options.skipGit ? { enabled: false } : { enabled: true, autoDetect: true },
      features: {
        enableFeatureFlags: true,
        enableBackups: !options.skipBackup,
        enableMonitoring: true,
        enableDashboard: true,
      },
    };

    console.log(chalk.cyan('⚙️  Initializing ForgeFlow V2...\n'));

    const installationManager = new InstallationManager();
    await installationManager.install(installationOptions);

    console.log(chalk.green('\n✅ ForgeFlow V2 initialized successfully!'));
    this.showNextSteps(installationOptions);
  }

  /**
   * Run setup wizard
   */
  async wizard(): Promise<void> {
    const setupWizard = new SetupWizard();
    await setupWizard.run();
  }

  /**
   * Show configuration
   */
  async showConfig(projectPath: string, options: { env?: Environment }): Promise<void> {
    try {
      const configManager = new ConfigurationManager();
      const config = await configManager.loadConfiguration(projectPath, options.env);

      console.log(chalk.cyan(`\n📋 Configuration${options.env ? ` (${options.env})` : ''}\n`));

      const configTable = [
        ['Property', 'Value'],
        ['Project Type', config.project.type],
        ['Environment', config.environment],
        ['GitHub Integration', config.github?.enabled ? '✅ Enabled' : '❌ Disabled'],
        ['Max Concurrent Agents', config.agents.maxConcurrent.toString()],
        ['Agent Timeout', `${config.agents.timeout / 1000}s`],
        ['Test Coverage Target', `${config.quality.coverage}%`],
        ['Feature Flags', config.features.featureFlags ? '✅ Enabled' : '❌ Disabled'],
        ['Backups', config.features.backups ? '✅ Enabled' : '❌ Disabled'],
        ['Monitoring', config.features.monitoring ? '✅ Enabled' : '❌ Disabled'],
        ['Analytics', config.features.analytics ? '✅ Enabled' : '❌ Disabled'],
      ];

      console.log(
        table(configTable, {
          border: {
            topBody: '─',
            topJoin: '┬',
            topLeft: '┌',
            topRight: '┐',
            bottomBody: '─',
            bottomJoin: '┴',
            bottomLeft: '└',
            bottomRight: '┘',
            bodyLeft: '│',
            bodyRight: '│',
            bodyJoin: '│',
            joinBody: '─',
            joinLeft: '├',
            joinRight: '┤',
            joinJoin: '┼',
          },
        }),
      );

      if (config.github?.enabled && config.github.owner && config.github.repo) {
        console.log(chalk.gray(`GitHub Repository: ${config.github.owner}/${config.github.repo}`));
      }
    } catch (error) {
      console.error(chalk.red('❌ Failed to load configuration:'), error.message);
      throw error;
    }
  }

  /**
   * Set configuration value
   */
  async setConfig(
    key: string,
    value: string,
    projectPath: string,
    options: { env?: Environment },
  ): Promise<void> {
    try {
      const configManager = new ConfigurationManager();

      // Parse value based on type
      let parsedValue: any = value;
      if (value === 'true') parsedValue = true;
      else if (value === 'false') parsedValue = false;
      else if (/^\d+$/.test(value)) parsedValue = parseInt(value, 10);
      else if (/^\d+\.\d+$/.test(value)) parsedValue = parseFloat(value);

      await configManager.setConfigValue(projectPath, key, parsedValue);

      console.log(chalk.green(`✅ Configuration updated: ${key} = ${parsedValue}`));
    } catch (error) {
      console.error(chalk.red('❌ Failed to set configuration:'), error.message);
      throw error;
    }
  }

  /**
   * Validate configuration
   */
  async validateConfig(projectPath: string, options: { env?: Environment }): Promise<void> {
    try {
      const spinner = ora('Validating configuration...').start();

      const configManager = new ConfigurationManager();
      await configManager.loadConfiguration(projectPath, options.env);

      spinner.succeed('Configuration is valid');
      console.log(chalk.green('✅ Configuration validation passed'));
    } catch (error) {
      console.error(chalk.red('❌ Configuration validation failed:'), error.message);
      throw error;
    }
  }

  /**
   * List environments
   */
  async listEnvironments(projectPath: string): Promise<void> {
    try {
      const envManager = new EnvironmentManager(projectPath);
      await envManager.initialize();

      const environments = envManager.getAllEnvironments();
      const current = envManager.getCurrentEnvironment();

      console.log(chalk.cyan('\n🌍 Available Environments\n'));

      const envTable = [['Environment', 'Status', 'Description']];

      for (const env of environments) {
        const isCurrent = env === current;
        const status = isCurrent ? '🔴 Current' : '⚫ Available';
        const description = this.getEnvironmentDescription(env);

        envTable.push([isCurrent ? chalk.bold(env) : env, status, description]);
      }

      console.log(table(envTable));
    } catch (error) {
      console.error(chalk.red('❌ Failed to list environments:'), error.message);
      throw error;
    }
  }

  /**
   * Switch environment
   */
  async switchEnvironment(environment: Environment, projectPath: string): Promise<void> {
    try {
      const spinner = ora(`Switching to ${environment} environment...`).start();

      const envManager = new EnvironmentManager(projectPath);
      await envManager.initialize();

      const current = envManager.getCurrentEnvironment();
      if (current === environment) {
        spinner.info(`Already in ${environment} environment`);
        return;
      }

      // Confirm if switching to production
      if (environment === 'production') {
        spinner.stop();
        const { confirmed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmed',
            message: chalk.yellow('⚠️  Switching to production environment. Are you sure?'),
            default: false,
          },
        ]);

        if (!confirmed) {
          console.log(chalk.yellow('Environment switch cancelled'));
          return;
        }
        spinner.start(`Switching to ${environment} environment...`);
      }

      await envManager.switchEnvironment(environment);

      spinner.succeed(`Switched to ${environment} environment`);
      console.log(chalk.green(`✅ Now using ${environment} environment`));
    } catch (error) {
      console.error(chalk.red('❌ Failed to switch environment:'), error.message);
      throw error;
    }
  }

  /**
   * Create environment
   */
  async createEnvironment(
    environment: Environment,
    projectPath: string,
    options: { clone?: Environment },
  ): Promise<void> {
    try {
      const spinner = ora(`Creating ${environment} environment...`).start();

      const envManager = new EnvironmentManager(projectPath);
      await envManager.initialize();

      if (options.clone) {
        await envManager.cloneEnvironment(options.clone, environment);
        spinner.succeed(`Created ${environment} environment (cloned from ${options.clone})`);
      } else {
        await envManager.createEnvironment(environment, {});
        spinner.succeed(`Created ${environment} environment`);
      }

      console.log(chalk.green(`✅ Environment ${environment} created successfully`));
    } catch (error) {
      console.error(chalk.red('❌ Failed to create environment:'), error.message);
      throw error;
    }
  }

  /**
   * Show environment status
   */
  async environmentStatus(projectPath: string): Promise<void> {
    try {
      const envManager = new EnvironmentManager(projectPath);
      await envManager.initialize();

      const status = await envManager.getEnvironmentStatus();

      console.log(chalk.cyan('\n🌍 Environment Status\n'));

      console.log(`${chalk.bold('Current:')} ${status.current}`);
      console.log(`${chalk.bold('Available:')} ${status.available.join(', ')}`);
      console.log(`${chalk.bold('Health:')} ${status.healthy ? '✅ Healthy' : '❌ Issues Found'}`);

      if (!status.healthy && status.issues.length > 0) {
        console.log(chalk.yellow('\n⚠️  Issues:'));
        status.issues.forEach((issue) => {
          console.log(chalk.yellow(`   • ${issue}`));
        });
      }
    } catch (error) {
      console.error(chalk.red('❌ Failed to get environment status:'), error.message);
      throw error;
    }
  }

  /**
   * Run health check
   */
  async healthCheck(
    projectPath: string,
    options: { comprehensive?: boolean; quick?: boolean; checks?: string },
  ): Promise<void> {
    try {
      const healthChecker = new HealthChecker();
      let result;

      if (options.quick) {
        const spinner = ora('Running quick health check...').start();
        const quickResult = await healthChecker.runQuickCheck();
        spinner.succeed('Quick health check completed');

        console.log(chalk.cyan('\n🏥 Quick Health Check Results\n'));
        console.log(
          `${chalk.bold('Status:')} ${quickResult.healthy ? '✅ Healthy' : '❌ Issues Found'}`,
        );

        if (!quickResult.healthy) {
          console.log(chalk.yellow('\nIssues:'));
          quickResult.issues.forEach((issue) => {
            console.log(chalk.yellow(`   • ${issue}`));
          });
        }
        return;
      }

      const spinner = ora('Running health check...').start();

      if (options.checks) {
        const checkNames = options.checks.split(',').map((c) => c.trim());
        result = await healthChecker.runHealthChecks(projectPath, checkNames);
        spinner.succeed('Specific health checks completed');
      } else if (options.comprehensive) {
        result = await healthChecker.runComprehensiveCheck(projectPath);
        spinner.succeed('Comprehensive health check completed');
      } else {
        result = await healthChecker.runInitialCheck(projectPath);
        spinner.succeed('Health check completed');
      }

      this.displayHealthCheckResults(result);
    } catch (error) {
      console.error(chalk.red('❌ Health check failed:'), error.message);
      throw error;
    }
  }

  /**
   * Create backup
   */
  async createBackup(
    projectPath: string,
    options: {
      name?: string;
      description?: string;
      compress?: boolean;
      encrypt?: boolean;
    },
  ): Promise<void> {
    try {
      const spinner = ora('Creating backup...').start();

      const backupManager = new BackupManager();
      const result = await backupManager.createBackup(projectPath, {
        name: options.name,
        description: options.description,
        compress: options.compress,
        encrypt: options.encrypt,
      });

      if (result.success) {
        spinner.succeed('Backup created successfully');
        console.log(chalk.green('✅ Backup created:'));
        console.log(`   Path: ${result.filePath}`);
        console.log(`   Size: ${this.formatSize(result.size)}`);
        console.log(`   Files: ${result.fileCount}`);
        console.log(`   Duration: ${result.duration}ms`);
        if (result.compressionRatio) {
          console.log(`   Compression: ${(result.compressionRatio * 100).toFixed(1)}%`);
        }
      } else {
        spinner.fail('Backup creation failed');
        if (result.errors) {
          result.errors.forEach((error) => {
            console.error(chalk.red(`   Error: ${error}`));
          });
        }
      }
    } catch (error) {
      console.error(chalk.red('❌ Failed to create backup:'), error.message);
      throw error;
    }
  }

  /**
   * Restore backup
   */
  async restoreBackup(
    backup: string,
    targetPath: string,
    options: { overwrite?: boolean; dryRun?: boolean },
  ): Promise<void> {
    try {
      if (!options.dryRun && !options.overwrite) {
        const { confirmed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmed',
            message: chalk.yellow('⚠️  This will restore files to the target directory. Continue?'),
            default: false,
          },
        ]);

        if (!confirmed) {
          console.log(chalk.yellow('Restore cancelled'));
          return;
        }
      }

      const spinner = ora(`${options.dryRun ? 'Simulating' : 'Restoring'} backup...`).start();

      const backupManager = new BackupManager();
      const result = await backupManager.restoreBackup(backup, targetPath, {
        overwrite: options.overwrite,
        dryRun: options.dryRun,
      });

      if (result.success) {
        spinner.succeed(`Backup ${options.dryRun ? 'simulation' : 'restoration'} completed`);
        console.log(
          chalk.green(`✅ ${options.dryRun ? 'Would restore' : 'Restored'} to: ${targetPath}`),
        );
        console.log(`   Files: ${result.fileCount}`);
        console.log(`   Duration: ${result.duration}ms`);
      } else {
        spinner.fail('Restore failed');
        if (result.errors) {
          result.errors.forEach((error) => {
            console.error(chalk.red(`   Error: ${error}`));
          });
        }
      }
    } catch (error) {
      console.error(chalk.red('❌ Failed to restore backup:'), error.message);
      throw error;
    }
  }

  /**
   * List backups
   */
  async listBackups(projectPath: string): Promise<void> {
    try {
      const backupManager = new BackupManager();
      const backups = await backupManager.listBackups();

      console.log(chalk.cyan('\n💾 Available Backups\n'));

      if (backups.length === 0) {
        console.log(chalk.gray('No backups found'));
        return;
      }

      const backupTable = [['ID', 'Date', 'Size', 'Files', 'Type']];

      for (const backup of backups) {
        backupTable.push([
          backup.id,
          backup.timestamp.toLocaleDateString(),
          this.formatSize(backup.size),
          backup.metadata.fileCount?.toString() || 'N/A',
          backup.metadata.strategy || 'full',
        ]);
      }

      console.log(table(backupTable));
    } catch (error) {
      console.error(chalk.red('❌ Failed to list backups:'), error.message);
      throw error;
    }
  }

  /**
   * Delete backup
   */
  async deleteBackup(backup: string, options: { force?: boolean }): Promise<void> {
    try {
      if (!options.force) {
        const { confirmed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmed',
            message: chalk.yellow(`⚠️  Delete backup '${backup}'? This cannot be undone.`),
            default: false,
          },
        ]);

        if (!confirmed) {
          console.log(chalk.yellow('Deletion cancelled'));
          return;
        }
      }

      const spinner = ora(`Deleting backup ${backup}...`).start();

      const backupManager = new BackupManager();
      await backupManager.deleteBackup(backup);

      spinner.succeed('Backup deleted');
      console.log(chalk.green(`✅ Backup '${backup}' deleted successfully`));
    } catch (error) {
      console.error(chalk.red('❌ Failed to delete backup:'), error.message);
      throw error;
    }
  }

  /**
   * List feature flags
   */
  async listFeatureFlags(projectPath: string): Promise<void> {
    try {
      const configPath = path.join(projectPath, 'config');
      const featureFlagEngine = new FeatureFlagEngine(configPath);
      await featureFlagEngine.initialize();

      const flags = featureFlagEngine.getAllFlags();

      console.log(chalk.cyan('\n🚩 Feature Flags\n'));

      if (flags.length === 0) {
        console.log(chalk.gray('No feature flags found'));
        return;
      }

      const flagTable = [['Key', 'Name', 'Status', 'Rollout %', 'Description']];

      for (const flag of flags) {
        flagTable.push([
          flag.key,
          flag.name,
          flag.defaultValue ? '✅ ON' : '❌ OFF',
          flag.rolloutPercentage ? `${flag.rolloutPercentage}%` : '100%',
          flag.description,
        ]);
      }

      console.log(table(flagTable));
    } catch (error) {
      console.error(chalk.red('❌ Failed to list feature flags:'), error.message);
      throw error;
    }
  }

  /**
   * Toggle feature flag
   */
  async toggleFeatureFlag(flag: string, projectPath: string): Promise<void> {
    try {
      const configPath = path.join(projectPath, 'config');
      const featureFlagEngine = new FeatureFlagEngine(configPath);
      await featureFlagEngine.initialize();

      const spinner = ora(`Toggling feature flag ${flag}...`).start();

      const updatedFlag = await featureFlagEngine.toggleFlag(flag);

      spinner.succeed('Feature flag toggled');
      console.log(
        chalk.green(`✅ Feature flag '${flag}' is now ${updatedFlag.defaultValue ? 'ON' : 'OFF'}`),
      );
    } catch (error) {
      console.error(chalk.red('❌ Failed to toggle feature flag:'), error.message);
      throw error;
    }
  }

  /**
   * Set feature flag value
   */
  async setFeatureFlag(flag: string, value: boolean, projectPath: string): Promise<void> {
    try {
      const configPath = path.join(projectPath, 'config');
      const featureFlagEngine = new FeatureFlagEngine(configPath);
      await featureFlagEngine.initialize();

      const spinner = ora(`Setting feature flag ${flag}...`).start();

      await featureFlagEngine.updateFeatureFlag(flag, { defaultValue: value });

      spinner.succeed('Feature flag updated');
      console.log(chalk.green(`✅ Feature flag '${flag}' set to ${value ? 'ON' : 'OFF'}`));
    } catch (error) {
      console.error(chalk.red('❌ Failed to set feature flag:'), error.message);
      throw error;
    }
  }

  /**
   * Show system status
   */
  async status(projectPath: string): Promise<void> {
    try {
      console.log(chalk.cyan('\n📊 ForgeFlow V2 Status\n'));

      const spinner = ora('Gathering system information...').start();

      // Get environment info
      const envManager = new EnvironmentManager(projectPath);
      await envManager.initialize();
      const envStatus = await envManager.getEnvironmentStatus();

      // Get configuration info
      const configManager = new ConfigurationManager();
      let config;
      try {
        config = await configManager.loadConfiguration(projectPath);
      } catch (error) {
        config = null;
      }

      // Get health status
      const healthChecker = new HealthChecker();
      const healthStatus = await healthChecker.runQuickCheck();

      spinner.succeed('System information gathered');

      // Display status
      const statusTable = [['Component', 'Status', 'Details']];

      statusTable.push([
        'Environment',
        envStatus.healthy ? '✅ Healthy' : '❌ Issues',
        `Current: ${envStatus.current}`,
      ]);

      statusTable.push([
        'Configuration',
        config ? '✅ Loaded' : '❌ Missing',
        config ? `Type: ${config.project.type}` : 'No config found',
      ]);

      statusTable.push([
        'System Health',
        healthStatus.healthy ? '✅ Healthy' : '❌ Issues',
        healthStatus.healthy ? 'All checks passed' : `${healthStatus.issues.length} issues`,
      ]);

      if (config?.github?.enabled) {
        statusTable.push([
          'GitHub Integration',
          '✅ Enabled',
          config.github.owner && config.github.repo
            ? `${config.github.owner}/${config.github.repo}`
            : 'Auto-detect',
        ]);
      }

      console.log(table(statusTable));

      if (!healthStatus.healthy) {
        console.log(chalk.yellow('\n⚠️  Health Issues:'));
        healthStatus.issues.forEach((issue) => {
          console.log(chalk.yellow(`   • ${issue}`));
        });
        console.log(chalk.gray('\nRun "ff2 health" for detailed diagnostics'));
      }
    } catch (error) {
      console.error(chalk.red('❌ Failed to get status:'), error.message);
      throw error;
    }
  }

  /**
   * Show detailed system information
   */
  async info(projectPath: string): Promise<void> {
    try {
      console.log(chalk.cyan('\n📋 System Information\n'));

      const infoTable = [['Property', 'Value']];

      // System info
      infoTable.push(['Node.js Version', process.version]);
      infoTable.push(['Platform', `${process.platform} ${process.arch}`]);
      infoTable.push(['Project Path', projectPath]);
      infoTable.push(['Working Directory', process.cwd()]);

      // Memory usage
      const memUsage = process.memoryUsage();
      infoTable.push(['Memory Usage (RSS)', this.formatSize(memUsage.rss)]);
      infoTable.push(['Heap Used', this.formatSize(memUsage.heapUsed)]);

      console.log(table(infoTable));

      // Check for package.json
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (await fs.pathExists(packageJsonPath)) {
        const packageJson = await fs.readJson(packageJsonPath);
        console.log(chalk.cyan('\n📦 Package Information\n'));

        const packageTable = [
          ['Property', 'Value'],
          ['Name', packageJson.name || 'N/A'],
          ['Version', packageJson.version || 'N/A'],
          ['Description', packageJson.description || 'N/A'],
        ];

        console.log(table(packageTable));
      }
    } catch (error) {
      console.error(chalk.red('❌ Failed to get system info:'), error.message);
      throw error;
    }
  }

  /**
   * Clean temporary files and caches
   */
  async clean(projectPath: string, options: { all?: boolean; dryRun?: boolean }): Promise<void> {
    try {
      const itemsToClean = [
        'node_modules/.cache',
        'dist',
        'build',
        '.worktrees',
        'logs/*.log',
        'coverage',
        '.nyc_output',
      ];

      if (options.all) {
        itemsToClean.push('backups/*', 'knowledge/cache/*');
      }

      console.log(
        chalk.cyan(`\n🧹 ${options.dryRun ? 'Would clean' : 'Cleaning'} temporary files...\n`),
      );

      let cleaned = 0;
      for (const item of itemsToClean) {
        const itemPath = path.join(projectPath, item);

        if (await fs.pathExists(itemPath)) {
          console.log(`   ${options.dryRun ? 'Would remove' : 'Removing'}: ${item}`);

          if (!options.dryRun) {
            await fs.remove(itemPath);
          }
          cleaned++;
        }
      }

      if (cleaned === 0) {
        console.log(chalk.gray('No temporary files to clean'));
      } else {
        console.log(
          chalk.green(`\n✅ ${options.dryRun ? 'Would clean' : 'Cleaned'} ${cleaned} items`),
        );
      }
    } catch (error) {
      console.error(chalk.red('❌ Failed to clean:'), error.message);
      throw error;
    }
  }

  /**
   * Reset ForgeFlow V2 installation
   */
  async reset(
    projectPath: string,
    options: { force?: boolean; keepConfig?: boolean; keepData?: boolean },
  ): Promise<void> {
    try {
      if (!options.force) {
        const { confirmed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmed',
            message: chalk.red('⚠️  This will reset your ForgeFlow V2 installation. Are you sure?'),
            default: false,
          },
        ]);

        if (!confirmed) {
          console.log(chalk.yellow('Reset cancelled'));
          return;
        }
      }

      console.log(chalk.cyan('\n🔄 Resetting ForgeFlow V2 installation...\n'));

      const itemsToReset = ['.worktrees', 'node_modules', 'dist', 'build'];

      if (!options.keepConfig) {
        itemsToReset.push('forgeflow.config.yaml', 'forgeflow.config.json', '.forgeflow.yaml');
      }

      if (!options.keepData) {
        itemsToReset.push('data', 'logs', 'knowledge', 'memory');
      }

      let reset = 0;
      for (const item of itemsToReset) {
        const itemPath = path.join(projectPath, item);

        if (await fs.pathExists(itemPath)) {
          console.log(`   Removing: ${item}`);
          await fs.remove(itemPath);
          reset++;
        }
      }

      console.log(chalk.green(`\n✅ Reset complete - removed ${reset} items`));
      console.log(chalk.gray('Run "ff2 init" to reinitialize ForgeFlow V2'));
    } catch (error) {
      console.error(chalk.red('❌ Failed to reset:'), error.message);
      throw error;
    }
  }

  /**
   * Helper methods
   */
  private showBanner(): void {
    const banner = `
${chalk.blue.bold('╔══════════════════════════════════════════════════════════╗')}
${chalk.blue.bold('║')}  ${chalk.white.bold('🔥 ForgeFlow V2 - AI Orchestration System')}            ${chalk.blue.bold('║')}
${chalk.blue.bold('║')}  ${chalk.gray('True Parallel Execution • Enterprise Ready')}            ${chalk.blue.bold('║')}
${chalk.blue.bold('╚══════════════════════════════════════════════════════════╝')}
`;
    console.log(banner);
  }

  private showNextSteps(options: InstallationOptions): void {
    console.log(chalk.cyan('\n🚀 Next Steps:\n'));
    console.log(`  1. ${chalk.white('ff2 status')} - Check system status`);
    console.log(`  2. ${chalk.white('ff2 config show')} - View configuration`);
    console.log(`  3. ${chalk.white('ff2 health')} - Run health check`);

    if (options.github?.enabled) {
      console.log(`  4. ${chalk.white('ff2 create-task "Your first task"')} - Create a task`);
    }

    console.log(chalk.gray('\nFor help: ff2 --help'));
  }

  private displayHealthCheckResults(result: any): void {
    console.log(chalk.cyan('\n🏥 Health Check Results\n'));

    const overallStatus = result.healthy ? '✅ Healthy' : '❌ Issues Found';
    console.log(`${chalk.bold('Overall Status:')} ${overallStatus}`);
    console.log(`${chalk.bold('Checks Run:')} ${result.metrics.checksRun}`);
    console.log(`${chalk.bold('Duration:')} ${result.metrics.totalDuration.toFixed(2)}ms\n`);

    if (result.checks.length > 0) {
      const checkTable = [['Check', 'Status', 'Message', 'Time (ms)']];

      for (const check of result.checks) {
        const status = check.status === 'pass' ? '✅' : check.status === 'warning' ? '⚠️' : '❌';

        checkTable.push([check.name, status, check.message, check.duration.toFixed(2)]);
      }

      console.log(table(checkTable));
    }

    if (result.issues.length > 0) {
      console.log(chalk.yellow('\n⚠️  Issues:'));
      result.issues.forEach((issue: string) => {
        console.log(chalk.yellow(`   • ${issue}`));
      });
    }

    if (result.recommendations.length > 0) {
      console.log(chalk.blue('\n💡 Recommendations:'));
      result.recommendations.forEach((rec: string) => {
        console.log(chalk.blue(`   • ${rec}`));
      });
    }
  }

  private getEnvironmentDescription(env: Environment): string {
    const descriptions = {
      development: 'Local development environment',
      testing: 'Automated testing environment',
      staging: 'Pre-production staging environment',
      production: 'Live production environment',
    };
    return descriptions[env] || 'Custom environment';
  }

  private formatSize(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  }
}
