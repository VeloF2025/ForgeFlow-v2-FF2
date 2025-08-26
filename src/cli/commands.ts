import {
  addEnhancedCommands,
  areEnhancedCommandsAvailable,
  showEnhancedCommandsHelp,
} from './enhanced-commands';
import { SearchCommands } from './commands/search.js';
import { Command } from 'commander';
import { Orchestrator } from '../core/orchestrator';
import { loadConfig } from '../utils/config';
import { logger } from '../utils/logger';
import { createWebhookHandler } from '../web/webhook-handler';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { execSync } from 'child_process';

export function createCLI(): Command {
  const program = new Command();

  program
    .name('forgeflow')
    .description('ForgeFlow v2 - True Parallel AI Orchestration System')
    .version('2.0.0');

  // Initialize command
  program
    .command('init')
    .description('Initialize ForgeFlow in current repository')
    .action(async () => {
      try {
        logger.info('Initializing ForgeFlow v2...');

        // Check if in a git repository
        try {
          execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
        } catch {
          logger.error(
            'Not in a git repository. Please run this command from within a git repository.',
          );
          process.exit(1);
        }

        // Create configuration file
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'githubOwner',
            message: 'GitHub owner (username or organization):',
            default: 'VeloF2025',
          },
          {
            type: 'input',
            name: 'githubRepo',
            message: 'GitHub repository name:',
            default: 'ForgeFlow-v2-FF2',
          },
          {
            type: 'password',
            name: 'githubToken',
            message: 'GitHub Personal Access Token:',
            mask: '*',
          },
        ]);

        // Create .env file
        const envContent = `GITHUB_TOKEN=${answers.githubToken}
GITHUB_OWNER=${answers.githubOwner}
GITHUB_REPO=${answers.githubRepo}
NODE_ENV=production
PORT=3000
LOG_LEVEL=info`;

        require('fs').writeFileSync('.env', envContent);
        logger.info(chalk.green('✓ Configuration file created'));

        // Create forgeflow.yaml
        const yamlContent = `github:
  owner: ${answers.githubOwner}
  repo: ${answers.githubRepo}

worktree:
  basePath: .worktrees
  maxWorktrees: 10
  cleanupOnError: true

agents:
  maxConcurrent: 5
  timeout: 300000
  retryAttempts: 3

quality:
  linting: true
  testing: true
  coverage: 95
  security: true
  performance: true

protocols:
  nlnh: true
  antihall: true
  ryr: true
  rulesPath: .`;

        require('fs').writeFileSync('forgeflow.yaml', yamlContent);
        logger.info(chalk.green('✓ ForgeFlow configuration created'));

        logger.info(chalk.green('✓ ForgeFlow v2 initialized successfully!'));
        logger.info('Run "forgeflow start-parallel <epic-id>" to begin parallel execution');
      } catch (error) {
        logger.error('Failed to initialize ForgeFlow:', error);
        process.exit(1);
      }
    });

  // Start parallel execution
  program
    .command('start-parallel <epicId>')
    .description('Start parallel execution for an epic')
    .option('-p, --pattern <pattern>', 'Execution pattern to use')
    .action(async (epicId, options) => {
      try {
        const config = await loadConfig();
        const orchestrator = new Orchestrator(config);

        logger.info(`Starting parallel execution for epic: ${epicId}`);
        const status = await orchestrator.startParallelExecution(epicId, options.pattern);

        logger.info(chalk.green(`✓ Execution started: ${status.id}`));
        logger.info(`Pattern: ${status.pattern}`);
        logger.info(`Status: ${status.status}`);
      } catch (error) {
        logger.error('Failed to start execution:', error);
        process.exit(1);
      }
    });

  // Check status
  program
    .command('status')
    .description('Check execution status')
    .option('-e, --execution <id>', 'Specific execution ID')
    .action(async (options) => {
      try {
        const config = await loadConfig();
        const orchestrator = new Orchestrator(config);

        if (options.execution) {
          const status = orchestrator.getExecutionStatus(options.execution);
          if (status) {
            console.log(chalk.cyan('Execution Status:'));
            console.log(`  ID: ${status.id}`);
            console.log(`  Epic: ${status.epicId}`);
            console.log(`  Status: ${status.status}`);
            console.log(`  Progress: ${status.progress}%`);
            console.log(`  Pattern: ${status.pattern}`);
          } else {
            logger.error('Execution not found');
          }
        } else {
          const executions = orchestrator.getAllExecutions();
          if (executions.length === 0) {
            console.log('No active executions');
          } else {
            console.log(chalk.cyan('Active Executions:'));
            executions.forEach((exec) => {
              console.log(`  ${exec.id}: ${exec.status} (${exec.progress}%)`);
            });
          }
        }
      } catch (error) {
        logger.error('Failed to get status:', error);
        process.exit(1);
      }
    });

  // Stop execution
  program
    .command('stop <executionId>')
    .description('Stop a running execution')
    .action(async (executionId) => {
      try {
        const config = await loadConfig();
        const orchestrator = new Orchestrator(config);

        await orchestrator.stopExecution(executionId);
        logger.info(chalk.green(`✓ Execution ${executionId} stopped`));
      } catch (error) {
        logger.error('Failed to stop execution:', error);
        process.exit(1);
      }
    });

  // Run quality gates
  program
    .command('validate')
    .description('Run quality gates validation')
    .action(async () => {
      try {
        logger.info('Running quality gates validation...');

        // Run linting
        logger.info('Running linting...');
        execSync('npm run lint', { stdio: 'inherit' });

        // Run tests
        logger.info('Running tests...');
        execSync('npm test', { stdio: 'inherit' });

        // Run type checking
        logger.info('Running type checking...');
        execSync('npm run typecheck', { stdio: 'inherit' });

        logger.info(chalk.green('✓ All quality gates passed!'));
      } catch (error) {
        logger.error('Quality gates validation failed');
        process.exit(1);
      }
    });

  // Activate protocol
  program
    .command('protocol <name>')
    .description('Activate a specific protocol (nlnh, antihall, ryr)')
    .action((name) => {
      const protocols = {
        nlnh: 'No Lies, No Hallucination',
        antihall: 'Anti-Hallucination Validator',
        ryr: 'Remember Your Rules',
      };

      if (protocols[name as keyof typeof protocols]) {
        logger.info(
          chalk.green(`✓ ${protocols[name as keyof typeof protocols]} protocol activated`),
        );
      } else {
        logger.error(`Unknown protocol: ${name}`);
        logger.info('Available protocols: nlnh, antihall, ryr');
      }
    });

  // Emergency mode
  program
    .command('! <taskId>')
    .description('Emergency mode - bypass all prompts')
    .action(async (taskId) => {
      try {
        logger.warn(chalk.yellow('⚠ Emergency mode activated!'));
        logger.warn('Bypassing all prompts and quality gates...');

        const config = await loadConfig();
        (config as any).emergency = { mode: true, bypassQualityGates: true };
        const orchestrator = new Orchestrator(config);

        const status = await orchestrator.startParallelExecution(taskId);
        logger.info(chalk.green(`✓ Emergency execution started: ${status.id}`));
      } catch (error) {
        logger.error('Emergency execution failed:', error);
        process.exit(1);
      }
    });

  // List patterns
  program
    .command('patterns')
    .description('List available execution patterns')
    .action(async () => {
      try {
        const config = await loadConfig();
        const orchestrator = new Orchestrator(config);

        const patterns = orchestrator.getAvailablePatterns();
        console.log(chalk.cyan('Available Execution Patterns:'));
        patterns.forEach((pattern) => {
          console.log(`  ${chalk.bold(pattern.name)}: ${pattern.description}`);
          console.log(`    Phases: ${pattern.phases.map((p) => p.name).join(' → ')}`);
        });
      } catch (error) {
        logger.error('Failed to list patterns:', error);
        process.exit(1);
      }
    });

  // Setup webhook
  program
    .command('webhook-setup')
    .description('Setup GitHub webhook for real-time updates')
    .action(async () => {
      try {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'webhookUrl',
            message: 'Your server URL (e.g., https://your-server.com):',
          },
          {
            type: 'password',
            name: 'webhookSecret',
            message: 'Webhook secret (random string):',
            default: require('crypto').randomBytes(32).toString('hex'),
          },
        ]);

        logger.info(chalk.cyan('\nTo setup the webhook in GitHub:'));
        logger.info('1. Go to your repository settings');
        logger.info('2. Navigate to Webhooks > Add webhook');
        logger.info(`3. Payload URL: ${answers.webhookUrl}/webhook`);
        logger.info('4. Content type: application/json');
        logger.info(`5. Secret: ${answers.webhookSecret}`);
        logger.info('6. Select events: Issues, Pull requests, Push, Workflow runs');
        logger.info('7. Click "Add webhook"');

        // Update .env with webhook settings
        const envPath = '.env';
        if (require('fs').existsSync(envPath)) {
          let envContent = require('fs').readFileSync(envPath, 'utf8');
          envContent += `\n\n# Webhook Configuration\nWEBHOOK_SECRET=${answers.webhookSecret}\nWEBHOOK_PORT=3002`;
          require('fs').writeFileSync(envPath, envContent);
          logger.info(chalk.green('\n✓ Webhook configuration saved to .env'));
        }
      } catch (error) {
        logger.error('Failed to setup webhook:', error);
        process.exit(1);
      }
    });

  // Start webhook handler
  program
    .command('webhook-start')
    .description('Start the webhook handler server')
    .option('-p, --port <port>', 'Port to listen on', '3002')
    .action(async (options) => {
      try {
        const config = await loadConfig();
        const orchestrator = new Orchestrator(config);

        const webhookSecret = process.env.WEBHOOK_SECRET || 'default-secret';
        const webhookHandler = createWebhookHandler({
          secret: webhookSecret,
          port: parseInt(options.port),
          orchestrator,
        });

        webhookHandler.start();
        logger.info(chalk.green(`✓ Webhook handler started on port ${options.port}`));
        logger.info('Press Ctrl+C to stop');

        // Keep the process running
        process.on('SIGINT', () => {
          logger.info('Stopping webhook handler...');
          webhookHandler.stop();
          process.exit(0);
        });
      } catch (error) {
        logger.error('Failed to start webhook handler:', error);
        process.exit(1);
      }
    });

  // Add Search Commands (Index Layer)
  try {
    const searchCommands = new SearchCommands();
    searchCommands.registerCommands(program);
    logger.debug('Search commands (Index Layer) added');
  } catch (error) {
    logger.debug('Failed to add search commands:', error);
  }

  // Add enhanced CLI commands if available
  if (process.env.NODE_ENV !== 'test') {
    areEnhancedCommandsAvailable()
      .then((available) => {
        if (available) {
          addEnhancedCommands(program);
          logger.debug('Enhanced CLI commands (Foundation Layer) added');
        } else {
          logger.debug('Enhanced CLI commands not available - Foundation Layer not initialized');
        }
      })
      .catch((error) => {
        logger.debug('Failed to check enhanced commands availability:', error);
      });
  }

  // Add enhanced commands help
  program
    .command('enhanced-help')
    .description('Show help for enhanced Foundation Layer commands')
    .action(() => {
      showEnhancedCommandsHelp();
    });

  return program;
}
