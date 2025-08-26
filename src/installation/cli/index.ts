#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { InstallationCLI } from './installation-cli';
import { version } from '../../../package.json';

/**
 * Main CLI entry point for ForgeFlow V2 Installation & Configuration tools
 */
const program = new Command();

// CLI setup
program
  .name('ff2')
  .description('ForgeFlow V2 - True Parallel AI Orchestration System')
  .version(version, '-v, --version', 'output the current version')
  .helpOption('-h, --help', 'display help for command');

// Initialize CLI manager
const installationCLI = new InstallationCLI();

/**
 * Installation Commands
 */
program
  .command('init')
  .description('Initialize ForgeFlow V2 in the current or specified directory')
  .option('-p, --path <path>', 'project path', process.cwd())
  .option('-t, --type <type>', 'project type (nodejs, python, mixed, generic)', 'nodejs')
  .option(
    '-e, --env <environment>',
    'target environment (development, testing, staging, production)',
    'development',
  )
  .option('-q, --quick', 'quick setup with defaults')
  .option('-w, --wizard', 'run interactive setup wizard')
  .option('--skip-health-check', 'skip pre-installation health check')
  .option('--skip-git', 'skip Git integration setup')
  .option('--skip-backup', 'skip backup configuration')
  .action(async (options) => {
    try {
      await installationCLI.init(options);
    } catch (error) {
      console.error(chalk.red('❌ Initialization failed:'), error.message);
      process.exit(1);
    }
  });

program
  .command('wizard')
  .description('Run interactive setup wizard')
  .action(async () => {
    try {
      await installationCLI.wizard();
    } catch (error) {
      console.error(chalk.red('❌ Setup wizard failed:'), error.message);
      process.exit(1);
    }
  });

/**
 * Configuration Management Commands
 */
const configCmd = program.command('config').description('Configuration management commands');

configCmd
  .command('show [path]')
  .description('Show current configuration')
  .option('-e, --env <environment>', 'environment to show')
  .action(async (path, options) => {
    try {
      await installationCLI.showConfig(path || process.cwd(), options);
    } catch (error) {
      console.error(chalk.red('❌ Failed to show configuration:'), error.message);
      process.exit(1);
    }
  });

configCmd
  .command('set <key> <value> [path]')
  .description('Set configuration value')
  .option('-e, --env <environment>', 'environment to update')
  .action(async (key, value, path, options) => {
    try {
      await installationCLI.setConfig(key, value, path || process.cwd(), options);
    } catch (error) {
      console.error(chalk.red('❌ Failed to set configuration:'), error.message);
      process.exit(1);
    }
  });

configCmd
  .command('validate [path]')
  .description('Validate configuration')
  .option('-e, --env <environment>', 'environment to validate')
  .action(async (path, options) => {
    try {
      await installationCLI.validateConfig(path || process.cwd(), options);
    } catch (error) {
      console.error(chalk.red('❌ Configuration validation failed:'), error.message);
      process.exit(1);
    }
  });

/**
 * Environment Management Commands
 */
const envCmd = program.command('env').description('Environment management commands');

envCmd
  .command('list [path]')
  .description('List available environments')
  .action(async (path) => {
    try {
      await installationCLI.listEnvironments(path || process.cwd());
    } catch (error) {
      console.error(chalk.red('❌ Failed to list environments:'), error.message);
      process.exit(1);
    }
  });

envCmd
  .command('switch <environment> [path]')
  .description('Switch to different environment')
  .action(async (environment, path) => {
    try {
      await installationCLI.switchEnvironment(environment, path || process.cwd());
    } catch (error) {
      console.error(chalk.red('❌ Failed to switch environment:'), error.message);
      process.exit(1);
    }
  });

envCmd
  .command('create <environment> [path]')
  .description('Create new environment')
  .option('--clone <source>', 'clone from existing environment')
  .action(async (environment, path, options) => {
    try {
      await installationCLI.createEnvironment(environment, path || process.cwd(), options);
    } catch (error) {
      console.error(chalk.red('❌ Failed to create environment:'), error.message);
      process.exit(1);
    }
  });

envCmd
  .command('status [path]')
  .description('Show environment status')
  .action(async (path) => {
    try {
      await installationCLI.environmentStatus(path || process.cwd());
    } catch (error) {
      console.error(chalk.red('❌ Failed to get environment status:'), error.message);
      process.exit(1);
    }
  });

/**
 * Health Check Commands
 */
program
  .command('health [path]')
  .description('Run system health check')
  .option('-c, --comprehensive', 'run comprehensive health check')
  .option('-q, --quick', 'run quick health check')
  .option('--checks <checks>', 'specific checks to run (comma-separated)')
  .action(async (path, options) => {
    try {
      await installationCLI.healthCheck(path || process.cwd(), options);
    } catch (error) {
      console.error(chalk.red('❌ Health check failed:'), error.message);
      process.exit(1);
    }
  });

/**
 * Backup Management Commands
 */
const backupCmd = program.command('backup').description('Backup management commands');

backupCmd
  .command('create [path]')
  .description('Create backup')
  .option('-n, --name <name>', 'backup name')
  .option('-d, --description <description>', 'backup description')
  .option('--compress', 'compress backup')
  .option('--encrypt', 'encrypt backup')
  .action(async (path, options) => {
    try {
      await installationCLI.createBackup(path || process.cwd(), options);
    } catch (error) {
      console.error(chalk.red('❌ Failed to create backup:'), error.message);
      process.exit(1);
    }
  });

backupCmd
  .command('restore <backup> [target]')
  .description('Restore from backup')
  .option('--overwrite', 'overwrite existing files')
  .option('--dry-run', 'show what would be restored without doing it')
  .action(async (backup, target, options) => {
    try {
      await installationCLI.restoreBackup(backup, target || process.cwd(), options);
    } catch (error) {
      console.error(chalk.red('❌ Failed to restore backup:'), error.message);
      process.exit(1);
    }
  });

backupCmd
  .command('list [path]')
  .description('List available backups')
  .action(async (path) => {
    try {
      await installationCLI.listBackups(path || process.cwd());
    } catch (error) {
      console.error(chalk.red('❌ Failed to list backups:'), error.message);
      process.exit(1);
    }
  });

backupCmd
  .command('delete <backup>')
  .description('Delete backup')
  .option('-f, --force', 'force deletion without confirmation')
  .action(async (backup, options) => {
    try {
      await installationCLI.deleteBackup(backup, options);
    } catch (error) {
      console.error(chalk.red('❌ Failed to delete backup:'), error.message);
      process.exit(1);
    }
  });

/**
 * Feature Flag Management Commands
 */
const featureFlagsCmd = program
  .command('feature-flags')
  .alias('ff')
  .description('Feature flag management commands');

featureFlagsCmd
  .command('list [path]')
  .description('List feature flags')
  .action(async (path) => {
    try {
      await installationCLI.listFeatureFlags(path || process.cwd());
    } catch (error) {
      console.error(chalk.red('❌ Failed to list feature flags:'), error.message);
      process.exit(1);
    }
  });

featureFlagsCmd
  .command('toggle <flag> [path]')
  .description('Toggle feature flag')
  .action(async (flag, path) => {
    try {
      await installationCLI.toggleFeatureFlag(flag, path || process.cwd());
    } catch (error) {
      console.error(chalk.red('❌ Failed to toggle feature flag:'), error.message);
      process.exit(1);
    }
  });

featureFlagsCmd
  .command('set <flag> <value> [path]')
  .description('Set feature flag value')
  .action(async (flag, value, path) => {
    try {
      const boolValue = value.toLowerCase() === 'true';
      await installationCLI.setFeatureFlag(flag, boolValue, path || process.cwd());
    } catch (error) {
      console.error(chalk.red('❌ Failed to set feature flag:'), error.message);
      process.exit(1);
    }
  });

/**
 * Status and Information Commands
 */
program
  .command('status [path]')
  .description('Show ForgeFlow V2 system status')
  .action(async (path) => {
    try {
      await installationCLI.status(path || process.cwd());
    } catch (error) {
      console.error(chalk.red('❌ Failed to get status:'), error.message);
      process.exit(1);
    }
  });

program
  .command('info [path]')
  .description('Show detailed system information')
  .action(async (path) => {
    try {
      await installationCLI.info(path || process.cwd());
    } catch (error) {
      console.error(chalk.red('❌ Failed to get system info:'), error.message);
      process.exit(1);
    }
  });

/**
 * Utility Commands
 */
program
  .command('clean [path]')
  .description('Clean temporary files and caches')
  .option('--all', 'clean everything including backups')
  .option('--dry-run', 'show what would be cleaned without doing it')
  .action(async (path, options) => {
    try {
      await installationCLI.clean(path || process.cwd(), options);
    } catch (error) {
      console.error(chalk.red('❌ Failed to clean:'), error.message);
      process.exit(1);
    }
  });

program
  .command('reset [path]')
  .description('Reset ForgeFlow V2 installation')
  .option('-f, --force', 'force reset without confirmation')
  .option('--keep-config', 'keep configuration files')
  .option('--keep-data', 'keep data files')
  .action(async (path, options) => {
    try {
      await installationCLI.reset(path || process.cwd(), options);
    } catch (error) {
      console.error(chalk.red('❌ Failed to reset:'), error.message);
      process.exit(1);
    }
  });

/**
 * Global error handling
 */
process.on('uncaughtException', (error) => {
  console.error(chalk.red('❌ Uncaught Exception:'), error.message);
  console.error(chalk.gray('Stack trace:'), error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('❌ Unhandled Rejection at:'), promise);
  console.error(chalk.red('Reason:'), reason);
  process.exit(1);
});

/**
 * Help and examples
 */
program.on('--help', () => {
  console.log('');
  console.log(chalk.cyan('Examples:'));
  console.log('  $ ff2 init                          Initialize ForgeFlow V2');
  console.log('  $ ff2 wizard                        Run interactive setup wizard');
  console.log('  $ ff2 init --quick                  Quick setup with defaults');
  console.log('  $ ff2 config show                   Show current configuration');
  console.log('  $ ff2 env switch production         Switch to production environment');
  console.log('  $ ff2 health                        Run health check');
  console.log('  $ ff2 backup create                 Create backup');
  console.log('  $ ff2 feature-flags list            List feature flags');
  console.log('  $ ff2 status                        Show system status');
  console.log('');
  console.log(chalk.cyan('For more help on a specific command:'));
  console.log('  $ ff2 <command> --help');
  console.log('');
});

// Parse command line arguments
program.parse();

// If no command provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
