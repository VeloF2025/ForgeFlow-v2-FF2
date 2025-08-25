import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import type { OrchestratorConfig } from '../types';
import { LogContext } from './logger';

const logger = new LogContext('ConfigLoader');

const DEFAULT_CONFIG: OrchestratorConfig = {
  github: {
    token: process.env.GITHUB_TOKEN || '',
    owner: process.env.GITHUB_OWNER || '',
    repo: process.env.GITHUB_REPO || '',
  },
  worktree: {
    basePath: '.worktrees',
    maxWorktrees: 10,
    cleanupOnError: true,
  },
  agents: {
    maxConcurrent: 5,
    timeout: 300000,
    retryAttempts: 3,
  },
  quality: {
    linting: true,
    testing: true,
    coverage: 95,
    security: true,
    performance: true,
  },
  protocols: {
    nlnh: true,
    antihall: true,
    ryr: true,
    rulesPath: process.cwd(),
  },
  knowledge: {
    storageBasePath: './knowledge',
    maxCardsPerCategory: 100,
    gotchaPromotionThreshold: 3,
    effectivenessDecayRate: 0.05,
    cleanupIntervalDays: 90,
    autoPromoteGotchas: true
  },
  memory: {
    storageBasePath: './memory',
    retentionDays: 90,
    logRetentionDays: 30,
    maxJobMemorySize: 1000,
    compressionEnabled: true,
    analyticsEnabled: true,
    autoPromoteGotchas: true,
    performanceThresholds: {
      memoryOperationTimeMs: 100,
      logWriteTimeMs: 50,
      analyticsCalculationTimeMs: 200,
    }
  },
};

export async function loadConfig(configPath?: string): Promise<OrchestratorConfig> {
  logger.info('Loading configuration...');

  let config = { ...DEFAULT_CONFIG };

  const possiblePaths = [
    configPath,
    'forgeflow.yaml',
    'forgeflow.yml',
    '.forgeflow.yaml',
    '.forgeflow.yml',
    'forgeflow.config.yaml',
    'forgeflow.config.yml',
  ].filter(Boolean);

  for (const p of possiblePaths) {
    const fullPath = path.resolve(p);

    if (await fs.pathExists(fullPath)) {
      logger.info(`Loading configuration from: ${fullPath}`);

      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        const fileConfig = yaml.parse(content) as Partial<OrchestratorConfig>;

        config = mergeConfig(config, fileConfig);
        logger.info('Configuration loaded successfully');
        break;
      } catch (error) {
        logger.error(`Failed to parse configuration file: ${fullPath}`, error);
        throw error;
      }
    }
  }

  await loadEnvVariables(config);
  validateConfig(config);

  return config;
}

function mergeConfig(
  base: OrchestratorConfig,
  override: Partial<OrchestratorConfig>,
): OrchestratorConfig {
  return {
    github: { ...base.github, ...override.github },
    worktree: { ...base.worktree, ...override.worktree },
    agents: { ...base.agents, ...override.agents },
    quality: { ...base.quality, ...override.quality },
    protocols: { ...base.protocols, ...override.protocols },
    knowledge: { ...base.knowledge, ...override.knowledge },
    memory: { ...base.memory, ...override.memory },
  };
}

async function loadEnvVariables(config: OrchestratorConfig): Promise<void> {
  const envPath = path.resolve('.env');

  if (await fs.pathExists(envPath)) {
    logger.debug('Loading environment variables from .env');
    const { config: dotenvConfig } = await import('dotenv');
    dotenvConfig({ path: envPath });
  }

  if (process.env.GITHUB_TOKEN) {
    config.github.token = process.env.GITHUB_TOKEN;
  }

  if (process.env.GITHUB_OWNER) {
    config.github.owner = process.env.GITHUB_OWNER;
  }

  if (process.env.GITHUB_REPO) {
    config.github.repo = process.env.GITHUB_REPO;
  }

  if (process.env.FORGEFLOW_MAX_WORKERS) {
    config.agents.maxConcurrent = parseInt(process.env.FORGEFLOW_MAX_WORKERS, 10);
  }

  if (process.env.FORGEFLOW_COVERAGE) {
    config.quality.coverage = parseInt(process.env.FORGEFLOW_COVERAGE, 10);
  }
}

function validateConfig(config: OrchestratorConfig): void {
  const errors: string[] = [];

  if (!config.github.token) {
    errors.push('GitHub token is required (GITHUB_TOKEN)');
  }

  if (!config.github.owner) {
    errors.push('GitHub owner is required (GITHUB_OWNER)');
  }

  if (!config.github.repo) {
    errors.push('GitHub repository is required (GITHUB_REPO)');
  }

  if (config.agents.maxConcurrent < 1) {
    errors.push('Maximum concurrent agents must be at least 1');
  }

  if (config.quality.coverage < 0 || config.quality.coverage > 100) {
    errors.push('Test coverage threshold must be between 0 and 100');
  }

  if (errors.length > 0) {
    logger.error('Configuration validation failed:');
    errors.forEach((e) => logger.error(`  - ${e}`));
    throw new Error('Invalid configuration');
  }

  logger.info('Configuration validated successfully');
}

export async function saveConfig(config: OrchestratorConfig, configPath?: string): Promise<void> {
  const targetPath = configPath || 'forgeflow.yaml';
  const fullPath = path.resolve(targetPath);

  const configYaml = yaml.stringify(config);
  await fs.writeFile(fullPath, configYaml, 'utf-8');

  logger.info(`Configuration saved to: ${fullPath}`);
}

export function getDefaultConfig(): OrchestratorConfig {
  return { ...DEFAULT_CONFIG };
}
