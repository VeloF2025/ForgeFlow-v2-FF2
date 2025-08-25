#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { Orchestrator } from '../core/orchestrator';
import { loadConfig } from '../utils/config';
import { logger } from '../utils/logger';
import packageJson from '../../package.json';

const program = new Command();

program
  .name('forgeflow')
  .description('ForgeFlow v2 - True Parallel AI Orchestration System')
  .version(packageJson.version);

program
  .command('init')
  .description('Initialize ForgeFlow v2 in the current repository')
  .option('--repo <url>', 'GitHub repository URL')
  .option('--config <file>', 'Configuration file path')
  .action(async (options) => {
    const spinner = ora('Initializing ForgeFlow v2...').start();

    try {
      const config = await loadConfig(options.config);
      const orchestrator = new Orchestrator(config);

      spinner.succeed('ForgeFlow v2 initialized successfully');
      console.log(chalk.green('\n✨ Ready to orchestrate parallel AI execution!'));
    } catch (error) {
      spinner.fail('Initialization failed');
      console.error(chalk.red(String(error)));
      process.exit(1);
    }
  });

program
  .command('start-parallel <epic>')
  .alias('sp')
  .description('Start parallel execution for an epic')
  .option('--pattern <type>', 'Execution pattern to use')
  .option('--agents <list>', 'Specific agents to deploy (comma-separated)')
  .option('--priority <level>', 'Execution priority (low|normal|high|emergency)')
  .action(async (epic, options) => {
    const spinner = ora(`Starting parallel execution for epic: ${epic}`).start();

    try {
      const config = await loadConfig();
      const orchestrator = new Orchestrator(config);

      const status = await orchestrator.startParallelExecution(epic, options.pattern);

      spinner.succeed(`Execution started: ${status.id}`);
      console.log(chalk.cyan(`\n📊 Track progress at: ${status.id}`));
      console.log(chalk.cyan(`Pattern: ${status.pattern}`));
    } catch (error) {
      spinner.fail('Failed to start execution');
      console.error(chalk.red(String(error)));
      process.exit(1);
    }
  });

program
  .command('status [executionId]')
  .description('Check execution status')
  .action(async (executionId) => {
    try {
      const config = await loadConfig();
      const orchestrator = new Orchestrator(config);

      if (executionId) {
        const status = orchestrator.getExecutionStatus(executionId);
        if (status) {
          displayExecutionStatus(status);
        } else {
          console.log(chalk.yellow(`No execution found: ${executionId}`));
        }
      } else {
        const executions = orchestrator.getAllExecutions();
        displayAllExecutions(executions);
      }
    } catch (error) {
      console.error(chalk.red(String(error)));
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Run quality gates validation')
  .action(async () => {
    const spinner = ora('Running quality gates...').start();

    try {
      const config = await loadConfig();
      const orchestrator = new Orchestrator(config);

      const qualityGates = (orchestrator as any).qualityGates;
      const result = await qualityGates.validate({
        executionId: 'manual',
        phaseName: 'cli-validation',
      });

      if (result.passed) {
        spinner.succeed('All quality gates passed');
        displayQualityResults(result);
      } else {
        spinner.fail('Quality gates failed');
        displayQualityResults(result);
        process.exit(1);
      }
    } catch (error) {
      spinner.fail('Validation failed');
      console.error(chalk.red(String(error)));
      process.exit(1);
    }
  });

program
  .command('agent <type> <issue>')
  .description('Spawn a specific agent for an issue')
  .action(async (type, issue) => {
    const spinner = ora(`Spawning ${type} agent for issue ${issue}...`).start();

    try {
      const config = await loadConfig();
      const orchestrator = new Orchestrator(config);

      spinner.info('Agent spawning not yet implemented in CLI');
    } catch (error) {
      spinner.fail('Failed to spawn agent');
      console.error(chalk.red(String(error)));
      process.exit(1);
    }
  });

program
  .command('protocol <name>')
  .description('Activate a specific protocol (nlnh|antihall|ryr)')
  .action(async (name) => {
    const spinner = ora(`Activating ${name} protocol...`).start();

    try {
      const config = await loadConfig();
      const orchestrator = new Orchestrator(config);

      const protocolEnforcer = (orchestrator as any).protocolEnforcer;

      switch (name.toLowerCase()) {
        case 'nlnh':
          await protocolEnforcer.nlnh.activate();
          spinner.succeed('NLNH Protocol activated - No Lies, No Hallucination mode');
          break;
        case 'antihall':
          await protocolEnforcer.antihall.initialize();
          spinner.succeed('AntiHall Protocol activated - Hallucination prevention enabled');
          break;
        case 'ryr':
          await protocolEnforcer.ryr.loadRules();
          spinner.succeed('RYR Protocol activated - Rules enforcement enabled');
          break;
        default:
          spinner.fail(`Unknown protocol: ${name}`);
          console.log(chalk.yellow('Available protocols: nlnh, antihall, ryr'));
      }
    } catch (error) {
      spinner.fail('Protocol activation failed');
      console.error(chalk.red(String(error)));
      process.exit(1);
    }
  });

program
  .command('patterns')
  .description('List available execution patterns')
  .action(async () => {
    try {
      const config = await loadConfig();
      const orchestrator = new Orchestrator(config);

      const patterns = orchestrator.getAvailablePatterns();

      console.log(chalk.cyan('\n📋 Available Execution Patterns:\n'));

      for (const pattern of patterns) {
        console.log(chalk.bold(`  ${pattern.name}`));
        console.log(chalk.gray(`    ${pattern.description}`));
        console.log(chalk.gray(`    Phases: ${pattern.phases.map((p) => p.name).join(' → ')}`));
        console.log();
      }
    } catch (error) {
      console.error(chalk.red(String(error)));
      process.exit(1);
    }
  });

program
  .command('emergency <task>')
  .alias('!')
  .description('Emergency mode - bypass all prompts and execute immediately')
  .action(async (task) => {
    console.log(chalk.red.bold('\n🚨 EMERGENCY MODE ACTIVATED 🚨'));
    const spinner = ora(`Executing emergency task: ${task}`).start();

    try {
      const config = await loadConfig();
      config.protocols.nlnh = false;

      const orchestrator = new Orchestrator(config);

      const status = await orchestrator.startParallelExecution(task, 'bug-fix-sprint');

      spinner.succeed(`Emergency execution started: ${status.id}`);
      console.log(chalk.red(`\n⚡ Maximum parallelism engaged`));
    } catch (error) {
      spinner.fail('Emergency execution failed');
      console.error(chalk.red(String(error)));
      process.exit(1);
    }
  });

function displayExecutionStatus(status: any): void {
  console.log(chalk.cyan('\n📊 Execution Status\n'));
  console.log(`  ID: ${status.id}`);
  console.log(`  Epic: ${status.epicId}`);
  console.log(`  Pattern: ${status.pattern}`);
  console.log(`  Status: ${getStatusColor(status.status)}`);
  console.log(`  Progress: ${getProgressBar(status.progress)}`);
  console.log(`  Started: ${status.startTime}`);

  if (status.endTime) {
    console.log(`  Ended: ${status.endTime}`);
  }

  if (status.phases.length > 0) {
    console.log('\n  Phases:');
    for (const phase of status.phases) {
      const phaseStatus =
        phase.status === 'completed' ? '✅' : phase.status === 'running' ? '🔄' : '❌';
      console.log(`    ${phaseStatus} ${phase.name}`);
    }
  }
}

function displayAllExecutions(executions: any[]): void {
  if (executions.length === 0) {
    console.log(chalk.yellow('\nNo active executions'));
    return;
  }

  console.log(chalk.cyan('\n📊 All Executions\n'));

  for (const exec of executions) {
    const statusIcon =
      exec.status === 'completed'
        ? '✅'
        : exec.status === 'running'
          ? '🔄'
          : exec.status === 'failed'
            ? '❌'
            : '⏸️';

    console.log(`  ${statusIcon} ${exec.id}`);
    console.log(`     Epic: ${exec.epicId}`);
    console.log(`     Progress: ${getProgressBar(exec.progress)}`);
    console.log();
  }
}

function displayQualityResults(result: any): void {
  console.log(chalk.cyan('\n✨ Quality Gates Results\n'));

  for (const check of result.checks) {
    const icon = check.passed ? '✅' : '❌';
    console.log(`  ${icon} ${check.name}`);

    if (check.message) {
      console.log(chalk.gray(`     ${check.message}`));
    }
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'running':
      return chalk.blue(status);
    case 'completed':
      return chalk.green(status);
    case 'failed':
      return chalk.red(status);
    case 'stopped':
      return chalk.yellow(status);
    default:
      return status;
  }
}

function getProgressBar(progress: number): string {
  const width = 20;
  const filled = Math.round((progress / 100) * width);
  const empty = width - filled;

  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const color = progress === 100 ? chalk.green : progress >= 50 ? chalk.yellow : chalk.red;

  return `${color(bar)} ${progress}%`;
}

program.parse();
