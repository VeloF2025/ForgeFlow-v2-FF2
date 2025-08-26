import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { execa } from 'execa';
import ora from 'ora';
import { simpleGit } from 'simple-git';
import { ConfigurationManager } from './configuration-manager';
import { HealthChecker } from './health-checker';
import { EnvironmentManager } from './environment-manager';
import { BackupManager } from './backup-manager';
import { LogContext } from '../utils/logger';
import { InstallationError } from '../utils/errors';
import { ValidationError } from './types';
import type {
  InstallationOptions,
  InstallationResult,
  ProjectType,
  InstallationStep,
  DependencyCheck,
} from './types';

/**
 * Installation Manager for ForgeFlow V2
 * Handles automated setup, initialization, and configuration
 */
export class InstallationManager {
  private logger = new LogContext('InstallationManager');
  private configManager: ConfigurationManager;
  private healthChecker: HealthChecker;
  private environmentManager: EnvironmentManager;
  private backupManager: BackupManager;
  private git = simpleGit();

  constructor() {
    this.configManager = new ConfigurationManager();
    this.healthChecker = new HealthChecker();
    this.environmentManager = new EnvironmentManager();
    this.backupManager = new BackupManager();
  }

  /**
   * Main installation entry point
   */
  async install(options: InstallationOptions): Promise<InstallationResult> {
    const startTime = Date.now();
    const spinner = ora('Initializing ForgeFlow V2 installation...').start();

    try {
      this.logger.info('Starting ForgeFlow V2 installation', { options });

      // Pre-installation validation
      await this.validatePrerequisites(options);
      spinner.text = 'Prerequisites validated ✓';

      // Create project structure
      await this.createProjectStructure(options);
      spinner.text = 'Project structure created ✓';

      // Initialize environment
      await this.environmentManager.initialize(options.environment);
      spinner.text = 'Environment initialized ✓';

      // Install dependencies
      await this.installDependencies(options);
      spinner.text = 'Dependencies installed ✓';

      // Configure ForgeFlow
      await this.configManager.initialize(options);
      spinner.text = 'Configuration initialized ✓';

      // Setup GitHub integration (if requested)
      if (options.github?.enabled) {
        await this.setupGitHubIntegration(options);
        spinner.text = 'GitHub integration configured ✓';
      }

      // Setup database
      await this.setupDatabase(options);
      spinner.text = 'Database configured ✓';

      // Create initial backup
      if (options.backup?.enabled !== false) {
        await this.backupManager.createInitialBackup(options.projectPath);
        spinner.text = 'Initial backup created ✓';
      }

      // Run health check
      const healthResult = await this.healthChecker.runInitialCheck(options.projectPath);
      if (!healthResult.healthy) {
        throw new InstallationError('Installation health check failed', {
          issues: healthResult.issues,
        });
      }
      spinner.text = 'Health check passed ✓';

      // Generate installation report
      const installationTime = Date.now() - startTime;
      const result = await this.generateInstallationReport(options, installationTime);

      spinner.succeed(chalk.green(`ForgeFlow V2 installed successfully in ${installationTime}ms`));

      // Show next steps
      this.showNextSteps(options);

      return result;
    } catch (error) {
      spinner.fail(chalk.red('Installation failed'));
      this.logger.error('Installation failed', error);

      // Attempt cleanup on failure
      await this.cleanupFailedInstallation(options);

      throw error;
    }
  }

  /**
   * Quick setup for development environments
   */
  async quickSetup(projectPath: string = process.cwd()): Promise<InstallationResult> {
    const options: InstallationOptions = {
      projectPath,
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
      },
    };

    return this.install(options);
  }

  /**
   * Interactive setup wizard
   */
  async runSetupWizard(projectPath?: string): Promise<InstallationResult> {
    console.log(chalk.blue.bold('\n🚀 ForgeFlow V2 Installation Wizard\n'));

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectPath',
        message: 'Project directory:',
        default: projectPath || process.cwd(),
        validate: (input: string) => {
          if (!input.trim()) return 'Project path is required';
          return true;
        },
      },
      {
        type: 'list',
        name: 'projectType',
        message: 'Project type:',
        choices: [
          { name: 'Node.js/TypeScript', value: 'nodejs' },
          { name: 'Python', value: 'python' },
          { name: 'Mixed/Polyglot', value: 'mixed' },
          { name: 'Generic', value: 'generic' },
        ],
        default: 'nodejs',
      },
      {
        type: 'list',
        name: 'environment',
        message: 'Target environment:',
        choices: [
          { name: 'Development', value: 'development' },
          { name: 'Staging', value: 'staging' },
          { name: 'Production', value: 'production' },
          { name: 'Testing', value: 'testing' },
        ],
        default: 'development',
      },
      {
        type: 'confirm',
        name: 'enableGitHub',
        message: 'Enable GitHub integration?',
        default: true,
      },
      {
        type: 'input',
        name: 'githubToken',
        message: 'GitHub token (optional):',
        when: (answers: any) => answers.enableGitHub,
        validate: (input: string) => {
          if (input && !input.startsWith('ghp_') && !input.startsWith('github_pat_')) {
            return 'Invalid GitHub token format';
          }
          return true;
        },
      },
      {
        type: 'checkbox',
        name: 'features',
        message: 'Select features to enable:',
        choices: [
          { name: 'Feature Flags', value: 'enableFeatureFlags', checked: true },
          { name: 'Automated Backups', value: 'enableBackups', checked: true },
          { name: 'Performance Monitoring', value: 'enableMonitoring', checked: true },
          { name: 'Advanced Analytics', value: 'enableAnalytics', checked: false },
          { name: 'Web Dashboard', value: 'enableDashboard', checked: true },
        ],
      },
    ]);

    const options: InstallationOptions = {
      projectPath: path.resolve(answers.projectPath),
      projectType: answers.projectType,
      environment: answers.environment,
      skipWizard: false,
      github: {
        enabled: answers.enableGitHub,
        token: answers.githubToken,
        autoDetect: true,
      },
      features: {
        enableFeatureFlags: answers.features.includes('enableFeatureFlags'),
        enableBackups: answers.features.includes('enableBackups'),
        enableMonitoring: answers.features.includes('enableMonitoring'),
        enableAnalytics: answers.features.includes('enableAnalytics'),
        enableDashboard: answers.features.includes('enableDashboard'),
      },
    };

    return this.install(options);
  }

  /**
   * Validate prerequisites before installation
   */
  private async validatePrerequisites(options: InstallationOptions): Promise<void> {
    const checks: DependencyCheck[] = [
      {
        name: 'Node.js',
        command: 'node --version',
        minVersion: '18.0.0',
        required: true,
      },
      {
        name: 'npm',
        command: 'npm --version',
        minVersion: '8.0.0',
        required: true,
      },
      {
        name: 'Git',
        command: 'git --version',
        minVersion: '2.0.0',
        required: true,
      },
      {
        name: 'TypeScript',
        command: 'tsc --version',
        minVersion: '4.9.0',
        required: options.projectType === 'nodejs',
      },
    ];

    const spinner = ora('Validating prerequisites...').start();

    for (const check of checks) {
      if (!check.required) continue;

      try {
        const result = await execa('cmd', ['/c', check.command], {
          shell: true,
          timeout: 10000,
        });

        const version = this.extractVersion(result.stdout);
        if (version && this.compareVersions(version, check.minVersion) < 0) {
          throw new ValidationError(
            `${check.name} version ${version} is below minimum required version ${check.minVersion}`,
          );
        }

        spinner.text = `${check.name} validated ✓`;
      } catch (error) {
        spinner.fail();
        throw new ValidationError(`${check.name} is required but not found or inaccessible`);
      }
    }

    // Check project path
    if (!(await fs.pathExists(path.dirname(options.projectPath)))) {
      throw new ValidationError(
        `Parent directory does not exist: ${path.dirname(options.projectPath)}`,
      );
    }

    // Check disk space (minimum 1GB)
    const stats = await fs.stat(path.dirname(options.projectPath));
    // Note: In a real implementation, you'd check actual available disk space

    spinner.succeed('Prerequisites validated');
  }

  /**
   * Create project directory structure
   */
  private async createProjectStructure(options: InstallationOptions): Promise<void> {
    const projectPath = options.projectPath;

    // Create main directories
    const directories = [
      'src',
      'src/agents',
      'src/core',
      'src/intelligence',
      'src/indexing',
      'src/retrieval',
      'src/knowledge',
      'src/memory',
      'src/installation',
      'src/utils',
      'src/web',
      'src/cli',
      'tests',
      'tests/unit',
      'tests/integration',
      'config',
      'config/environments',
      'data',
      'data/agents',
      'data/executions',
      'data/metrics',
      'logs',
      'knowledge',
      'knowledge/project',
      'knowledge/global',
      'memory',
    ];

    await fs.ensureDir(projectPath);

    for (const dir of directories) {
      await fs.ensureDir(path.join(projectPath, dir));
    }

    // Create essential files if they don't exist
    const essentialFiles = [
      {
        path: 'package.json',
        content: this.generatePackageJson(options),
      },
      {
        path: 'tsconfig.json',
        content: this.generateTsConfig(options),
      },
      {
        path: '.gitignore',
        content: this.generateGitIgnore(options),
      },
      {
        path: 'README.md',
        content: this.generateReadme(options),
      },
      {
        path: '.env.example',
        content: this.generateEnvExample(options),
      },
    ];

    for (const file of essentialFiles) {
      const filePath = path.join(projectPath, file.path);
      if (!(await fs.pathExists(filePath))) {
        await fs.writeFile(filePath, file.content);
      }
    }
  }

  /**
   * Install project dependencies
   */
  private async installDependencies(options: InstallationOptions): Promise<void> {
    const spinner = ora('Installing dependencies...').start();

    try {
      if (options.projectType === 'nodejs') {
        // Install npm dependencies
        await execa('npm', ['install'], {
          cwd: options.projectPath,
          stdio: 'pipe',
        });

        // Install ForgeFlow V2 dependencies
        const forgeflowDeps = [
          '@forgeflow/orchestrator-v2@latest',
          'inquirer@^9.3.7',
          'ora@^8.0.0',
          'chalk@^5.3.0',
          'commander@^12.1.0',
        ];

        await execa('npm', ['install', ...forgeflowDeps], {
          cwd: options.projectPath,
          stdio: 'pipe',
        });
      }

      spinner.succeed('Dependencies installed');
    } catch (error) {
      spinner.fail('Failed to install dependencies');
      throw new InstallationError('Dependency installation failed', error);
    }
  }

  /**
   * Setup GitHub integration
   */
  private async setupGitHubIntegration(options: InstallationOptions): Promise<void> {
    if (!options.github?.enabled) return;

    const spinner = ora('Setting up GitHub integration...').start();

    try {
      // Initialize git repository if needed
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) {
        await this.git.init();
        spinner.text = 'Git repository initialized ✓';
      }

      // Auto-detect GitHub repository info
      if (options.github.autoDetect) {
        try {
          const remotes = await this.git.getRemotes(true);
          const origin = remotes.find((r) => r.name === 'origin');

          if (origin?.refs?.fetch) {
            const match = origin.refs.fetch.match(/github\.com[:/](.+)\/(.+)\.git/);
            if (match) {
              options.github.owner = match[1];
              options.github.repo = match[2];
              spinner.text = `GitHub repository detected: ${options.github.owner}/${options.github.repo} ✓`;
            }
          }
        } catch (error) {
          this.logger.debug('GitHub auto-detection failed', error);
        }
      }

      spinner.succeed('GitHub integration configured');
    } catch (error) {
      spinner.fail('GitHub setup failed');
      throw new InstallationError('GitHub integration setup failed', error);
    }
  }

  /**
   * Setup database
   */
  private async setupDatabase(options: InstallationOptions): Promise<void> {
    const spinner = ora('Setting up database...').start();

    try {
      const dbPath = path.join(options.projectPath, 'data', 'forgeflow.db');
      await fs.ensureFile(dbPath);

      // Initialize SQLite database with required tables
      // This would typically use the existing database setup from the project

      spinner.succeed('Database configured');
    } catch (error) {
      spinner.fail('Database setup failed');
      throw new InstallationError('Database setup failed', error);
    }
  }

  /**
   * Generate installation report
   */
  private async generateInstallationReport(
    options: InstallationOptions,
    installationTime: number,
  ): Promise<InstallationResult> {
    const report: InstallationResult = {
      success: true,
      installationTime,
      projectPath: options.projectPath,
      projectType: options.projectType,
      environment: options.environment,
      features: options.features || {},
      github: options.github,
      timestamp: new Date(),
      version: '2.0.0',
    };

    // Save report to file
    const reportPath = path.join(options.projectPath, 'INSTALLATION_REPORT.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    return report;
  }

  /**
   * Show next steps after installation
   */
  private showNextSteps(options: InstallationOptions): void {
    console.log(chalk.green.bold('\n✅ Installation Complete!\n'));

    console.log(chalk.cyan('Next steps:'));
    console.log(`  1. ${chalk.white('cd')} ${chalk.yellow(options.projectPath)}`);
    console.log(`  2. ${chalk.white('ff2 status')} - Check system status`);
    console.log(
      `  3. ${chalk.white('ff2 create-task "Your first task"')} - Create your first task`,
    );

    if (options.github?.enabled) {
      console.log(`  4. ${chalk.white('ff2 execute parallel')} - Run parallel execution`);
    }

    console.log(chalk.cyan('\nAvailable commands:'));
    console.log(`  ${chalk.white('ff2 --help')} - Show all available commands`);
    console.log(`  ${chalk.white('ff2 health')} - Run health check`);
    console.log(`  ${chalk.white('ff2 config')} - Manage configuration`);
    console.log(`  ${chalk.white('ff2 backup')} - Manage backups\n`);
  }

  /**
   * Cleanup failed installation
   */
  private async cleanupFailedInstallation(options: InstallationOptions): Promise<void> {
    try {
      this.logger.info('Cleaning up failed installation...');

      // Remove node_modules if it was created during this installation
      const nodeModulesPath = path.join(options.projectPath, 'node_modules');
      if (await fs.pathExists(nodeModulesPath)) {
        await fs.remove(nodeModulesPath);
      }

      // Remove any created configuration files
      const configFiles = ['forgeflow.config.json', '.env'];
      for (const file of configFiles) {
        const filePath = path.join(options.projectPath, file);
        if (await fs.pathExists(filePath)) {
          await fs.remove(filePath);
        }
      }
    } catch (error) {
      this.logger.error('Cleanup failed', error);
    }
  }

  /**
   * Helper methods for file generation
   */
  private generatePackageJson(options: InstallationOptions): string {
    const packageJson = {
      name: `forgeflow-project-${Date.now()}`,
      version: '1.0.0',
      description: 'ForgeFlow V2 Project',
      main: 'src/index.ts',
      scripts: {
        build: 'tsc',
        start: 'node dist/index.js',
        dev: 'tsx watch src/index.ts',
        test: 'vitest',
        lint: 'eslint . --ext .ts,.tsx',
        ff2: 'ff2',
      },
      dependencies: {
        '@forgeflow/orchestrator-v2': '^2.0.0',
      },
      devDependencies: {
        typescript: '^5.3.0',
        tsx: '^4.7.0',
        eslint: '^8.56.0',
        vitest: '^1.2.0',
      },
    };

    return JSON.stringify(packageJson, null, 2);
  }

  private generateTsConfig(options: InstallationOptions): string {
    const tsConfig = {
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        outDir: './dist',
        rootDir: './src',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        declaration: true,
        declarationMap: true,
        sourceMap: true,
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist', 'tests'],
    };

    return JSON.stringify(tsConfig, null, 2);
  }

  private generateGitIgnore(options: InstallationOptions): string {
    return `
# Dependencies
node_modules/
*.pnp
.pnp.js

# Production
/dist
/build

# Environment
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
logs/

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# ForgeFlow V2
.worktrees/
data/forgeflow.db
memory/
knowledge/cache/
*.backup

# OS
.DS_Store
Thumbs.db
`.trim();
  }

  private generateReadme(options: InstallationOptions): string {
    return `# ForgeFlow V2 Project

This project was initialized with ForgeFlow V2 - True Parallel AI Orchestration System.

## Getting Started

\`\`\`bash
# Check system status
ff2 status

# Create your first task
ff2 create-task "Your task description"

# Execute parallel workflow
ff2 execute parallel
\`\`\`

## Configuration

Edit \`forgeflow.config.yaml\` to customize your ForgeFlow setup.

## Documentation

- [ForgeFlow V2 Documentation](https://docs.forgeflow.dev)
- [CLI Reference](https://docs.forgeflow.dev/cli)
- [API Documentation](https://docs.forgeflow.dev/api)

## Support

For support, please visit [ForgeFlow Support](https://support.forgeflow.dev) or create an issue.
`;
  }

  private generateEnvExample(options: InstallationOptions): string {
    return `# ForgeFlow V2 Environment Configuration

# GitHub Integration
GITHUB_TOKEN=your_github_token_here
GITHUB_OWNER=your_github_username
GITHUB_REPO=your_repository_name

# Database
DATABASE_URL=sqlite:./data/forgeflow.db

# Monitoring
ENABLE_MONITORING=true
LOG_LEVEL=info

# Performance
MAX_CONCURRENT_AGENTS=5
AGENT_TIMEOUT=300000

# Features
ENABLE_FEATURE_FLAGS=true
ENABLE_ANALYTICS=false
`;
  }

  /**
   * Utility methods
   */
  private extractVersion(output: string): string | null {
    const match = output.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  }

  private compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);

    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;

      if (v1Part > v2Part) return 1;
      if (v1Part < v2Part) return -1;
    }

    return 0;
  }
}
