/**
 * Installation & Configuration Layer for ForgeFlow V2
 * Main export file for all installation components
 */

// Core installation components
export { InstallationManager } from './installation-manager';
export { ConfigurationManager } from './configuration-manager';
import { InstallationManager } from './installation-manager';
import { ConfigurationManager } from './configuration-manager';
import { EnvironmentManager } from './environment-manager';
import { HealthChecker } from './health-checker';
import { BackupManager } from './backup-manager';
import { FeatureFlagEngine } from './feature-flag-engine';
import { SetupWizard } from './setup-wizard';
export { FeatureFlagEngine } from './feature-flag-engine';
export { BackupManager } from './backup-manager';
export { HealthChecker } from './health-checker';
export { SetupWizard } from './setup-wizard';
export { EnvironmentManager } from './environment-manager';

// CLI components
export { InstallationCLI } from './cli/installation-cli';

// Type definitions
export * from './types';
export * from './feature-flag-types';

// Re-export common interfaces for convenience
export type {
  InstallationOptions,
  InstallationResult,
  Environment,
  ProjectType,
  FeatureFlag,
  HealthCheckResult,
  BackupResult,
  ConfigurationTemplate,
  EnvironmentConfig,
} from './types';

/**
 * Installation Layer Factory
 * Provides easy access to installation components
 */
export class InstallationLayer {
  private projectPath: string;

  constructor(projectPath: string = process.cwd()) {
    this.projectPath = projectPath;
  }

  /**
   * Get installation manager instance
   */
  getInstallationManager(): InstallationManager {
    return new InstallationManager();
  }

  /**
   * Get configuration manager instance
   */
  getConfigurationManager(): ConfigurationManager {
    return new ConfigurationManager();
  }

  /**
   * Get environment manager instance
   */
  getEnvironmentManager(): EnvironmentManager {
    return new EnvironmentManager(this.projectPath);
  }

  /**
   * Get health checker instance
   */
  getHealthChecker(): HealthChecker {
    return new HealthChecker();
  }

  /**
   * Get backup manager instance
   */
  getBackupManager(): BackupManager {
    return new BackupManager();
  }

  /**
   * Get feature flag engine instance
   */
  getFeatureFlagEngine(): FeatureFlagEngine {
    const configPath = require('path').join(this.projectPath, 'config');
    return new FeatureFlagEngine(configPath);
  }

  /**
   * Get setup wizard instance
   */
  getSetupWizard(): SetupWizard {
    return new SetupWizard();
  }

  /**
   * Get CLI instance
   */
  // getCLI(): InstallationCLI {
  //   return new InstallationCLI();
  // }

  /**
   * Quick initialization method
   */
  async quickInit(options?: {
    projectType?: 'nodejs' | 'python' | 'mixed' | 'generic';
    environment?: 'development' | 'testing' | 'staging' | 'production';
    enableGitHub?: boolean;
    enableFeatureFlags?: boolean;
    enableBackups?: boolean;
  }): Promise<void> {
    const installationManager = this.getInstallationManager();

    const installationOptions = {
      projectPath: this.projectPath,
      projectType: options?.projectType || 'nodejs',
      environment: options?.environment || 'development',
      skipWizard: true,
      github: {
        enabled: options?.enableGitHub !== false,
        autoDetect: true,
      },
      features: {
        enableFeatureFlags: options?.enableFeatureFlags !== false,
        enableBackups: options?.enableBackups !== false,
        enableMonitoring: true,
        enableDashboard: true,
      },
    };

    await installationManager.install(installationOptions);
  }

  /**
   * Run interactive setup wizard
   */
  async runWizard(): Promise<void> {
    const wizard = this.getSetupWizard();
    await wizard.run();
  }

  /**
   * Run health check
   */
  async runHealthCheck(): Promise<any> {
    const healthChecker = this.getHealthChecker();
    return healthChecker.runInitialCheck(this.projectPath);
  }

  /**
   * Create backup
   */
  async createBackup(options?: {
    name?: string;
    description?: string;
    compress?: boolean;
    encrypt?: boolean;
  }): Promise<any> {
    const backupManager = this.getBackupManager();
    return backupManager.createBackup(this.projectPath, options);
  }
}

/**
 * Default export - Factory function
 */
export default function createInstallationLayer(projectPath?: string): InstallationLayer {
  return new InstallationLayer(projectPath);
}
