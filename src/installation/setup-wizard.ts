import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { LogContext } from '../utils/logger';
import { InstallationManager } from './installation-manager';
import { ConfigurationManager } from './configuration-manager';
import { HealthChecker } from './health-checker';
import { FeatureFlagEngine } from './feature-flag-engine';
import type {
  InstallationOptions,
  ProjectType,
  Environment,
  GitHubIntegrationOptions,
  FeatureOptions,
  BackupOptions,
  AdvancedOptions,
} from './types';

/**
 * Interactive Setup Wizard for ForgeFlow V2
 * Provides guided installation with user-friendly prompts
 */
export class SetupWizard {
  private logger = new LogContext('SetupWizard');
  private installationManager: InstallationManager;
  private configManager: ConfigurationManager;
  private healthChecker: HealthChecker;

  constructor() {
    this.installationManager = new InstallationManager();
    this.configManager = new ConfigurationManager();
    this.healthChecker = new HealthChecker();
  }

  /**
   * Run the complete setup wizard
   */
  async run(): Promise<void> {
    console.clear();
    this.showWelcomeBanner();

    try {
      // Run pre-setup health check
      await this.runPreSetupHealthCheck();

      // Collect installation preferences
      const options = await this.collectInstallationOptions();

      // Show configuration summary
      await this.showConfigurationSummary(options);

      // Confirm installation
      const confirmed = await this.confirmInstallation();
      if (!confirmed) {
        console.log(chalk.yellow('\n⚠️  Installation cancelled by user.'));
        return;
      }

      // Run installation
      await this.runInstallation(options);

      // Post-installation steps
      await this.runPostInstallationSteps(options);

      // Show completion message
      this.showCompletionMessage(options);
    } catch (error) {
      this.logger.error('Setup wizard failed', error);
      console.log(chalk.red('\n❌ Setup failed:'), error.message);
      console.log(chalk.gray('Check the logs for more details.'));

      // Show recovery options
      await this.showRecoveryOptions();
    }
  }

  /**
   * Run quick setup with minimal prompts
   */
  async runQuickSetup(): Promise<void> {
    console.clear();
    this.showWelcomeBanner();

    console.log(chalk.blue('🚀 Quick Setup Mode\n'));
    console.log('This will set up ForgeFlow V2 with recommended defaults.\n');

    const { projectPath } = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectPath',
        message: 'Project directory:',
        default: process.cwd(),
        validate: (input: string) => {
          if (!input.trim()) return 'Project path is required';
          return true;
        },
      },
    ]);

    const options: InstallationOptions = {
      projectPath: path.resolve(projectPath),
      projectType: 'nodejs',
      environment: 'development',
      skipWizard: true,
      github: {
        enabled: true,
        autoDetect: true,
      },
      features: {
        enableFeatureFlags: true,
        enableBackups: true,
        enableMonitoring: true,
        enableDashboard: true,
      },
    };

    try {
      await this.installationManager.install(options);
      this.showCompletionMessage(options);
    } catch (error) {
      console.log(chalk.red('\n❌ Quick setup failed:'), error.message);
      await this.showRecoveryOptions();
    }
  }

  /**
   * Show welcome banner
   */
  private showWelcomeBanner(): void {
    const banner = `
${chalk.blue.bold('╔══════════════════════════════════════════════════════════╗')}
${chalk.blue.bold('║')}  ${chalk.white.bold('🔥 ForgeFlow V2 - Installation Wizard')}               ${chalk.blue.bold('║')}
${chalk.blue.bold('║')}  ${chalk.gray('True Parallel AI Orchestration System')}                ${chalk.blue.bold('║')}
${chalk.blue.bold('╚══════════════════════════════════════════════════════════╝')}

${chalk.green('Welcome to the ForgeFlow V2 setup wizard!')}
${chalk.gray('This wizard will guide you through the installation process.')}
`;
    console.log(banner);
  }

  /**
   * Run pre-setup health check
   */
  private async runPreSetupHealthCheck(): Promise<void> {
    const spinner = ora('Running pre-setup health check...').start();

    try {
      const result = await this.healthChecker.runQuickCheck();

      if (result.healthy) {
        spinner.succeed('Pre-setup health check passed');
      } else {
        spinner.warn('Pre-setup health check found issues');
        console.log(chalk.yellow('\n⚠️  Issues found:'));
        result.issues.forEach((issue) => {
          console.log(chalk.yellow(`   • ${issue}`));
        });

        const { continue: shouldContinue } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'continue',
            message: 'Continue with installation despite issues?',
            default: false,
          },
        ]);

        if (!shouldContinue) {
          throw new Error('Installation aborted due to health check failures');
        }
      }
    } catch (error) {
      spinner.fail('Pre-setup health check failed');
      throw error;
    }
  }

  /**
   * Collect installation options through interactive prompts
   */
  private async collectInstallationOptions(): Promise<InstallationOptions> {
    console.log(chalk.cyan('\n📋 Installation Configuration\n'));

    // Basic project information
    const basicInfo = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectPath',
        message: 'Project directory:',
        default: process.cwd(),
        validate: (input: string) => {
          if (!input.trim()) return 'Project path is required';
          if (!path.isAbsolute(input) && !input.startsWith('./')) {
            return 'Please provide an absolute path or relative path starting with ./';
          }
          return true;
        },
        filter: (input: string) => path.resolve(input),
      },
      {
        type: 'list',
        name: 'projectType',
        message: 'What type of project is this?',
        choices: [
          { name: '🟢 Node.js/TypeScript (Recommended)', value: 'nodejs' },
          { name: '🐍 Python', value: 'python' },
          { name: '🌈 Mixed/Polyglot', value: 'mixed' },
          { name: '📦 Generic', value: 'generic' },
        ],
        default: 'nodejs',
      },
      {
        type: 'list',
        name: 'environment',
        message: 'Target environment:',
        choices: [
          { name: '💻 Development', value: 'development' },
          { name: '🧪 Testing', value: 'testing' },
          { name: '🚀 Staging', value: 'staging' },
          { name: '🏭 Production', value: 'production' },
        ],
        default: 'development',
      },
    ]);

    // GitHub integration
    const githubInfo = await this.collectGitHubOptions();

    // Feature selection
    const features = await this.collectFeatureOptions(basicInfo.environment);

    // Backup configuration
    const backup = await this.collectBackupOptions();

    // Advanced options (for production environments)
    let advanced: AdvancedOptions | undefined;
    if (basicInfo.environment === 'production' || basicInfo.environment === 'staging') {
      advanced = await this.collectAdvancedOptions();
    }

    return {
      projectPath: basicInfo.projectPath,
      projectType: basicInfo.projectType,
      environment: basicInfo.environment,
      skipWizard: false,
      github: githubInfo,
      features,
      backup,
      advanced,
    };
  }

  /**
   * Collect GitHub integration options
   */
  private async collectGitHubOptions(): Promise<GitHubIntegrationOptions> {
    console.log(chalk.cyan('\n🐙 GitHub Integration\n'));

    const { enableGitHub } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'enableGitHub',
        message: 'Enable GitHub integration?',
        default: true,
      },
    ]);

    if (!enableGitHub) {
      return { enabled: false };
    }

    const githubQuestions = [
      {
        type: 'confirm',
        name: 'autoDetect',
        message: 'Auto-detect GitHub repository from git remote?',
        default: true,
      },
      {
        type: 'input',
        name: 'token',
        message: 'GitHub personal access token (optional):',
        validate: (input: string) => {
          if (input && !input.startsWith('ghp_') && !input.startsWith('github_pat_')) {
            return 'Invalid GitHub token format (should start with ghp_ or github_pat_)';
          }
          return true;
        },
      },
      {
        type: 'input',
        name: 'owner',
        message: 'GitHub owner/organization:',
        when: (answers: any) => !answers.autoDetect,
        validate: (input: string) => {
          if (!input.trim()) return 'GitHub owner is required';
          return true;
        },
      },
      {
        type: 'input',
        name: 'repo',
        message: 'Repository name:',
        when: (answers: any) => !answers.autoDetect,
        validate: (input: string) => {
          if (!input.trim()) return 'Repository name is required';
          return true;
        },
      },
      {
        type: 'checkbox',
        name: 'githubFeatures',
        message: 'Select GitHub features to enable:',
        choices: [
          { name: 'GitHub Issues integration', value: 'enableIssues', checked: true },
          { name: 'Automatic Pull Request creation', value: 'enablePRs', checked: true },
          { name: 'Webhook notifications', value: 'enableWebhooks', checked: false },
        ],
      },
    ];

    const githubAnswers = await inquirer.prompt(githubQuestions);

    return {
      enabled: true,
      token: githubAnswers.token || undefined,
      owner: githubAnswers.owner || undefined,
      repo: githubAnswers.repo || undefined,
      autoDetect: githubAnswers.autoDetect,
      enableIssues: githubAnswers.githubFeatures.includes('enableIssues'),
      enablePRs: githubAnswers.githubFeatures.includes('enablePRs'),
    };
  }

  /**
   * Collect feature options
   */
  private async collectFeatureOptions(environment: Environment): Promise<FeatureOptions> {
    console.log(chalk.cyan('\n⚡ Feature Selection\n'));

    const recommendedFeatures = this.getRecommendedFeatures(environment);

    const { features } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'features',
        message: 'Select features to enable:',
        choices: [
          {
            name: '🚩 Feature Flags (Runtime feature toggling)',
            value: 'enableFeatureFlags',
            checked: recommendedFeatures.enableFeatureFlags,
          },
          {
            name: '💾 Automated Backups (Data safety)',
            value: 'enableBackups',
            checked: recommendedFeatures.enableBackups,
          },
          {
            name: '📊 Performance Monitoring (System metrics)',
            value: 'enableMonitoring',
            checked: recommendedFeatures.enableMonitoring,
          },
          {
            name: '📈 Advanced Analytics (Detailed insights)',
            value: 'enableAnalytics',
            checked: recommendedFeatures.enableAnalytics,
          },
          {
            name: '🌐 Web Dashboard (Management UI)',
            value: 'enableDashboard',
            checked: recommendedFeatures.enableDashboard,
          },
          {
            name: '⚡ Real-time Updates (Live notifications)',
            value: 'enableRealtime',
            checked: recommendedFeatures.enableRealtime,
          },
        ],
      },
    ]);

    return {
      enableFeatureFlags: features.includes('enableFeatureFlags'),
      enableBackups: features.includes('enableBackups'),
      enableMonitoring: features.includes('enableMonitoring'),
      enableAnalytics: features.includes('enableAnalytics'),
      enableDashboard: features.includes('enableDashboard'),
      enableRealtime: features.includes('enableRealtime'),
    };
  }

  /**
   * Collect backup options
   */
  private async collectBackupOptions(): Promise<BackupOptions> {
    console.log(chalk.cyan('\n💾 Backup Configuration\n'));

    const { enableBackup } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'enableBackup',
        message: 'Configure automated backups?',
        default: true,
      },
    ]);

    if (!enableBackup) {
      return { enabled: false };
    }

    const backupQuestions = [
      {
        type: 'list',
        name: 'frequency',
        message: 'Backup frequency:',
        choices: [
          { name: '🕐 Hourly (Development)', value: 60 },
          { name: '📅 Daily (Recommended)', value: 1440 },
          { name: '📆 Weekly', value: 10080 },
          { name: '✋ Manual only', value: 0 },
        ],
        default: 1440,
      },
      {
        type: 'number',
        name: 'retention',
        message: 'Number of backups to keep:',
        default: 7,
        validate: (input: number) => {
          if (input < 1) return 'Must keep at least 1 backup';
          if (input > 100) return 'Maximum 100 backups allowed';
          return true;
        },
      },
      {
        type: 'input',
        name: 'storagePath',
        message: 'Backup storage directory:',
        default: './backups',
        filter: (input: string) => path.resolve(input),
      },
      {
        type: 'confirm',
        name: 'compress',
        message: 'Enable backup compression?',
        default: true,
      },
      {
        type: 'confirm',
        name: 'encrypt',
        message: 'Enable backup encryption?',
        default: false,
      },
    ];

    const answers = await inquirer.prompt(backupQuestions);

    return {
      enabled: true,
      frequency: answers.frequency,
      retention: answers.retention,
      storagePath: answers.storagePath,
      compress: answers.compress,
      encrypt: answers.encrypt,
    };
  }

  /**
   * Collect advanced options for production environments
   */
  private async collectAdvancedOptions(): Promise<AdvancedOptions> {
    console.log(chalk.cyan('\n🔧 Advanced Configuration\n'));

    const questions = [
      {
        type: 'number',
        name: 'maxConcurrentAgents',
        message: 'Maximum concurrent agents:',
        default: 8,
        validate: (input: number) => {
          if (input < 1) return 'Must have at least 1 agent';
          if (input > 50) return 'Maximum 50 agents allowed';
          return true;
        },
      },
      {
        type: 'number',
        name: 'agentTimeout',
        message: 'Agent timeout (seconds):',
        default: 300,
        validate: (input: number) => {
          if (input < 30) return 'Minimum timeout is 30 seconds';
          if (input > 3600) return 'Maximum timeout is 1 hour';
          return true;
        },
        filter: (input: number) => input * 1000, // Convert to milliseconds
      },
      {
        type: 'confirm',
        name: 'enableSecurity',
        message: 'Enable security features (input validation, audit logging)?',
        default: true,
      },
    ];

    const answers = await inquirer.prompt(questions);

    const advanced: AdvancedOptions = {
      maxConcurrentAgents: answers.maxConcurrentAgents,
      agentTimeout: answers.agentTimeout,
    };

    if (answers.enableSecurity) {
      advanced.security = {
        inputValidation: true,
        outputSanitization: true,
        auditLogging: true,
        accessControl: {
          enabled: true,
          allowedIps: [],
          rateLimiting: true,
        },
      };
    }

    return advanced;
  }

  /**
   * Show configuration summary
   */
  private async showConfigurationSummary(options: InstallationOptions): Promise<void> {
    console.log(chalk.cyan('\n📋 Configuration Summary\n'));

    console.log(`${chalk.bold('Project:')} ${options.projectPath}`);
    console.log(`${chalk.bold('Type:')} ${options.projectType}`);
    console.log(`${chalk.bold('Environment:')} ${options.environment}`);

    if (options.github?.enabled) {
      console.log(`${chalk.bold('GitHub:')} ${chalk.green('Enabled')}`);
      if (options.github.owner && options.github.repo) {
        console.log(`  Repository: ${options.github.owner}/${options.github.repo}`);
      }
    } else {
      console.log(`${chalk.bold('GitHub:')} ${chalk.gray('Disabled')}`);
    }

    console.log(`${chalk.bold('Features:')}`);
    Object.entries(options.features || {}).forEach(([key, enabled]) => {
      const icon = enabled ? chalk.green('✓') : chalk.gray('✗');
      const name = key
        .replace('enable', '')
        .replace(/([A-Z])/g, ' $1')
        .trim();
      console.log(`  ${icon} ${name}`);
    });

    if (options.backup?.enabled) {
      console.log(`${chalk.bold('Backup:')} ${chalk.green('Enabled')}`);
      const freq =
        options.backup.frequency === 0
          ? 'Manual'
          : options.backup.frequency === 60
            ? 'Hourly'
            : options.backup.frequency === 1440
              ? 'Daily'
              : 'Weekly';
      console.log(`  Frequency: ${freq}`);
      console.log(`  Retention: ${options.backup.retention} backups`);
    } else {
      console.log(`${chalk.bold('Backup:')} ${chalk.gray('Disabled')}`);
    }
  }

  /**
   * Confirm installation
   */
  private async confirmInstallation(): Promise<boolean> {
    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: 'Proceed with installation?',
        default: true,
      },
    ]);

    return confirmed;
  }

  /**
   * Run the actual installation
   */
  private async runInstallation(options: InstallationOptions): Promise<void> {
    console.log(chalk.cyan('\n🚀 Starting Installation...\n'));

    try {
      const result = await this.installationManager.install(options);

      if (!result.success) {
        throw new Error('Installation failed');
      }

      console.log(chalk.green('\n✅ Installation completed successfully!'));

      if (result.warnings && result.warnings.length > 0) {
        console.log(chalk.yellow('\n⚠️  Warnings:'));
        result.warnings.forEach((warning) => {
          console.log(chalk.yellow(`   • ${warning}`));
        });
      }
    } catch (error) {
      console.log(chalk.red('\n❌ Installation failed:'), error.message);
      throw error;
    }
  }

  /**
   * Run post-installation steps
   */
  private async runPostInstallationSteps(options: InstallationOptions): Promise<void> {
    console.log(chalk.cyan('\n🔧 Post-Installation Setup...\n'));

    const steps = [
      { name: 'Final health check', action: () => this.runFinalHealthCheck(options.projectPath) },
      { name: 'Feature flag setup', action: () => this.setupFeatureFlags(options) },
      {
        name: 'Configuration validation',
        action: () => this.validateConfiguration(options.projectPath),
      },
    ];

    for (const step of steps) {
      const spinner = ora(step.name).start();

      try {
        await step.action();
        spinner.succeed();
      } catch (error) {
        spinner.warn(`${step.name} completed with warnings`);
        this.logger.warn(`Post-installation step failed: ${step.name}`, error);
      }
    }
  }

  /**
   * Run final health check
   */
  private async runFinalHealthCheck(projectPath: string): Promise<void> {
    const result = await this.healthChecker.runComprehensiveCheck(projectPath);

    if (!result.healthy) {
      console.log(chalk.yellow('\n⚠️  Health check found issues:'));
      result.issues.forEach((issue) => {
        console.log(chalk.yellow(`   • ${issue}`));
      });
    }
  }

  /**
   * Setup feature flags
   */
  private async setupFeatureFlags(options: InstallationOptions): Promise<void> {
    if (!options.features?.enableFeatureFlags) return;

    const configPath = path.join(options.projectPath, 'config');
    const featureFlagEngine = new FeatureFlagEngine(configPath);
    await featureFlagEngine.initialize();
  }

  /**
   * Validate configuration
   */
  private async validateConfiguration(projectPath: string): Promise<void> {
    await this.configManager.loadConfiguration(projectPath);
  }

  /**
   * Show completion message
   */
  private showCompletionMessage(options: InstallationOptions): void {
    const completionBanner = `
${chalk.green.bold('🎉 ForgeFlow V2 Installation Complete!')}

${chalk.cyan('Your project is ready! Here are your next steps:')}

${chalk.bold('1. Navigate to your project:')}
   ${chalk.yellow(`cd "${options.projectPath}"`)}

${chalk.bold('2. Check system status:')}
   ${chalk.yellow('ff2 status')}

${chalk.bold('3. Create your first task:')}
   ${chalk.yellow('ff2 create-task "Implement user authentication"')}

${chalk.bold('4. Run parallel execution:')}
   ${chalk.yellow('ff2 execute parallel')}

${chalk.cyan('Additional Commands:')}
   ${chalk.yellow('ff2 --help')}        Show all available commands
   ${chalk.yellow('ff2 health')}        Run health check
   ${chalk.yellow('ff2 config')}        Manage configuration
   ${chalk.yellow('ff2 backup')}        Manage backups
   ${chalk.yellow('ff2 feature-flags')} Manage feature flags

${chalk.gray('For documentation and support:')}
${chalk.gray('• Documentation: https://docs.forgeflow.dev')}
${chalk.gray('• Support: https://support.forgeflow.dev')}
${chalk.gray('• GitHub: https://github.com/forgeflow/v2')}

${chalk.green('Happy coding with ForgeFlow V2! 🚀')}
`;

    console.log(completionBanner);
  }

  /**
   * Show recovery options on failure
   */
  private async showRecoveryOptions(): Promise<void> {
    console.log(chalk.cyan('\n🔧 Recovery Options:\n'));

    const { recovery } = await inquirer.prompt([
      {
        type: 'list',
        name: 'recovery',
        message: 'What would you like to do?',
        choices: [
          { name: '🔄 Retry installation', value: 'retry' },
          { name: '🚀 Try quick setup instead', value: 'quick' },
          { name: '📋 Show installation logs', value: 'logs' },
          { name: '❌ Exit', value: 'exit' },
        ],
      },
    ]);

    switch (recovery) {
      case 'retry':
        await this.run();
        break;
      case 'quick':
        await this.runQuickSetup();
        break;
      case 'logs':
        console.log(chalk.gray('\nLogs are available in the logs directory.'));
        await this.showRecoveryOptions();
        break;
      case 'exit':
        console.log(chalk.gray('Setup cancelled. You can run the wizard again anytime.'));
        break;
    }
  }

  /**
   * Get recommended features based on environment
   */
  private getRecommendedFeatures(environment: Environment): FeatureOptions {
    const recommendations: Record<Environment, FeatureOptions> = {
      development: {
        enableFeatureFlags: true,
        enableBackups: true,
        enableMonitoring: true,
        enableAnalytics: false,
        enableDashboard: true,
        enableRealtime: true,
      },
      testing: {
        enableFeatureFlags: true,
        enableBackups: false,
        enableMonitoring: true,
        enableAnalytics: false,
        enableDashboard: false,
        enableRealtime: false,
      },
      staging: {
        enableFeatureFlags: true,
        enableBackups: true,
        enableMonitoring: true,
        enableAnalytics: true,
        enableDashboard: true,
        enableRealtime: true,
      },
      production: {
        enableFeatureFlags: true,
        enableBackups: true,
        enableMonitoring: true,
        enableAnalytics: true,
        enableDashboard: true,
        enableRealtime: true,
      },
    };

    return recommendations[environment];
  }
}
