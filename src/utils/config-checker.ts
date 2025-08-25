import { existsSync } from 'fs';
import { join } from 'path';
import { logger } from './logger';

export interface ConfigStatus {
  hasEnvFile: boolean;
  hasGitHubToken: boolean;
  hasGitHubConfig: boolean;
  recommendations: string[];
}

export function checkConfiguration(): ConfigStatus {
  const envPath = join(process.cwd(), '.env');
  const hasEnvFile = existsSync(envPath);

  const hasGitHubToken = !!process.env.GITHUB_TOKEN;
  const hasGitHubConfig = !!(process.env.GITHUB_OWNER && process.env.GITHUB_REPO);

  const recommendations: string[] = [];

  if (!hasEnvFile) {
    recommendations.push('Create a .env file in the project root');
  }

  if (!hasGitHubToken) {
    recommendations.push(
      'Set GITHUB_TOKEN environment variable with your GitHub Personal Access Token',
    );
    recommendations.push('Get a token at: https://github.com/settings/tokens/new');
  }

  if (!hasGitHubConfig) {
    recommendations.push('Set GITHUB_OWNER and GITHUB_REPO environment variables');
    recommendations.push('Example: GITHUB_OWNER=your-username, GITHUB_REPO=your-repo');
  }

  return {
    hasEnvFile,
    hasGitHubToken,
    hasGitHubConfig,
    recommendations,
  };
}

export function logConfigurationStatus(): void {
  const status = checkConfiguration();

  logger.info('🔧 Configuration Check:');
  logger.info(`   📁 .env file: ${status.hasEnvFile ? '✅' : '❌'}`);
  logger.info(`   🔑 GitHub Token: ${status.hasGitHubToken ? '✅' : '❌'}`);
  logger.info(`   ⚙️  GitHub Config: ${status.hasGitHubConfig ? '✅' : '❌'}`);

  if (status.recommendations.length > 0) {
    logger.warn('📋 Configuration Recommendations:');
    status.recommendations.forEach((rec, i) => {
      logger.warn(`   ${i + 1}. ${rec}`);
    });
  } else {
    logger.info('🎉 All configuration checks passed!');
  }
}
