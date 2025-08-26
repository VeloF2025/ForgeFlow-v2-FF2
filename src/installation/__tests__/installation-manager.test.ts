import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { InstallationManager } from '../installation-manager';
import { ConfigurationManager } from '../configuration-manager';
import { HealthChecker } from '../health-checker';
import { EnvironmentManager } from '../environment-manager';
import { BackupManager } from '../backup-manager';
import type { InstallationOptions } from '../types';

// Mock dependencies
vi.mock('fs-extra');
vi.mock('../configuration-manager');
vi.mock('../health-checker');
vi.mock('../environment-manager');
vi.mock('../backup-manager');

const mockedFs = vi.mocked(fs);
const MockedConfigurationManager = vi.mocked(ConfigurationManager);
const MockedHealthChecker = vi.mocked(HealthChecker);
const MockedEnvironmentManager = vi.mocked(EnvironmentManager);
const MockedBackupManager = vi.mocked(BackupManager);

describe('InstallationManager', () => {
  let installationManager: InstallationManager;
  let mockTempDir: string;

  beforeEach(() => {
    installationManager = new InstallationManager();
    mockTempDir = path.join(__dirname, 'temp-test-project');

    // Reset all mocks
    vi.clearAllMocks();

    // Setup common mock implementations
    (mockedFs.pathExists as any).mockResolvedValue(true);
    (mockedFs.ensureDir as any).mockResolvedValue();
    (mockedFs.writeFile as any).mockResolvedValue();
    (mockedFs.stat as any).mockResolvedValue({ size: 1024 } as any);
    (mockedFs.access as any).mockResolvedValue();

    (MockedConfigurationManager.prototype.initialize as any).mockResolvedValue({} as any);
    (MockedHealthChecker.prototype.runInitialCheck as any).mockResolvedValue({
      healthy: true,
      checks: [],
      metrics: {
        totalDuration: 100,
        checksRun: 1,
        checksPassed: 1,
        checksFailed: 0,
        checksWarning: 0,
      },
      issues: [],
      recommendations: [],
    });
    (MockedEnvironmentManager.prototype.initialize as any).mockResolvedValue();
    (MockedBackupManager.prototype.createInitialBackup as any).mockResolvedValue({
      success: true,
      timestamp: new Date(),
      filePath: '/mock/backup.zip',
      size: 1024,
      duration: 500,
      fileCount: 10,
    });
  });

  afterEach(async () => {
    // Cleanup temp directory if it exists
    if (await fs.pathExists(mockTempDir)) {
      await fs.remove(mockTempDir);
    }
  });

  describe('install', () => {
    it('should successfully install with default options', async () => {
      const options: InstallationOptions = {
        projectPath: mockTempDir,
        projectType: 'nodejs',
        environment: 'development',
        skipWizard: true,
        github: { enabled: true, autoDetect: true },
        features: {
          enableFeatureFlags: true,
          enableBackups: true,
          enableMonitoring: true,
        },
      };

      const result = await installationManager.install(options);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.projectPath).toBe(mockTempDir);
      expect(result.projectType).toBe('nodejs');
      expect(result.environment).toBe('development');

      // Verify that all required components were initialized
      expect(MockedConfigurationManager.prototype.initialize).toHaveBeenCalledWith(options);
      expect(MockedEnvironmentManager.prototype.initialize).toHaveBeenCalledWith('development');
      expect(MockedHealthChecker.prototype.runInitialCheck).toHaveBeenCalledWith(mockTempDir);
    });

    it('should fail installation when health check fails', async () => {
      // Mock health check failure
      (MockedHealthChecker.prototype.runInitialCheck as any).mockResolvedValue({
        healthy: false,
        checks: [],
        metrics: {
          totalDuration: 100,
          checksRun: 1,
          checksPassed: 0,
          checksFailed: 1,
          checksWarning: 0,
        },
        issues: ['Critical system requirement not met'],
        recommendations: [],
      });

      const options: InstallationOptions = {
        projectPath: mockTempDir,
        projectType: 'nodejs',
        environment: 'development',
        skipWizard: true,
      };

      await expect(installationManager.install(options)).rejects.toThrow(
        'Installation health check failed',
      );
    });

    it('should create project structure correctly', async () => {
      const options: InstallationOptions = {
        projectPath: mockTempDir,
        projectType: 'nodejs',
        environment: 'development',
        skipWizard: true,
      };

      await installationManager.install(options);

      // Verify directory creation
      const expectedDirs = [
        'src',
        'src/agents',
        'src/core',
        'config',
        'data',
        'tests',
        'logs',
        'knowledge',
      ];

      for (const dir of expectedDirs) {
        expect(mockedFs.ensureDir).toHaveBeenCalledWith(path.join(mockTempDir, dir));
      }
    });

    it('should handle GitHub integration setup', async () => {
      const options: InstallationOptions = {
        projectPath: mockTempDir,
        projectType: 'nodejs',
        environment: 'development',
        skipWizard: true,
        github: {
          enabled: true,
          token: 'ghp_test_token',
          owner: 'testuser',
          repo: 'testrepo',
        },
      };

      const result = await installationManager.install(options);

      expect(result.success).toBe(true);
      expect(result.github).toEqual({
        enabled: true,
        token: 'ghp_test_token',
        owner: 'testuser',
        repo: 'testrepo',
      });
    });

    it('should skip backup creation when disabled', async () => {
      const options: InstallationOptions = {
        projectPath: mockTempDir,
        projectType: 'nodejs',
        environment: 'development',
        skipWizard: true,
        backup: { enabled: false },
      };

      await installationManager.install(options);

      expect(MockedBackupManager.prototype.createInitialBackup).not.toHaveBeenCalled();
    });

    it('should cleanup on installation failure', async () => {
      // Mock configuration manager to throw an error
      (MockedConfigurationManager.prototype.initialize as any).mockRejectedValue(
        new Error('Config init failed'),
      );

      const options: InstallationOptions = {
        projectPath: mockTempDir,
        projectType: 'nodejs',
        environment: 'development',
        skipWizard: true,
      };

      await expect(installationManager.install(options)).rejects.toThrow();

      // Verify cleanup was attempted
      expect(mockedFs.remove).toHaveBeenCalled();
    });
  });

  describe('quickSetup', () => {
    it('should perform quick setup with default options', async () => {
      const result = await installationManager.quickSetup(mockTempDir);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.projectPath).toBe(mockTempDir);
      expect(result.projectType).toBe('nodejs');
      expect(result.environment).toBe('development');
    });

    it('should enable default features in quick setup', async () => {
      const result = await installationManager.quickSetup(mockTempDir);

      expect(result.features).toEqual({
        enableFeatureFlags: true,
        enableBackups: true,
        enableMonitoring: true,
      });
    });
  });

  describe('prerequisite validation', () => {
    it('should validate required Node.js version', async () => {
      // Mock process.version to simulate old Node.js
      const originalVersion = process.version;
      Object.defineProperty(process, 'version', {
        value: 'v16.0.0', // Below minimum v18.0.0
        configurable: true,
      });

      const options: InstallationOptions = {
        projectPath: mockTempDir,
        projectType: 'nodejs',
        environment: 'development',
        skipWizard: true,
      };

      await expect(installationManager.install(options)).rejects.toThrow();

      // Restore original version
      Object.defineProperty(process, 'version', {
        value: originalVersion,
        configurable: true,
      });
    });

    it('should validate project path exists', async () => {
      (mockedFs.pathExists as any).mockResolvedValueOnce(false);

      const options: InstallationOptions = {
        projectPath: '/non/existent/path',
        projectType: 'nodejs',
        environment: 'development',
        skipWizard: true,
      };

      await expect(installationManager.install(options)).rejects.toThrow();
    });
  });

  describe('file generation', () => {
    it('should generate package.json correctly', async () => {
      const options: InstallationOptions = {
        projectPath: mockTempDir,
        projectType: 'nodejs',
        environment: 'development',
        skipWizard: true,
      };

      await installationManager.install(options);

      // Check that package.json was written
      const packageJsonCall = mockedFs.writeFile.mock.calls.find((call) =>
        call[0].toString().includes('package.json'),
      );

      expect(packageJsonCall).toBeDefined();

      const packageContent = JSON.parse(packageJsonCall[1] as string);
      expect(packageContent).toMatchObject({
        name: expect.stringMatching(/^forgeflow-project-\d+$/),
        version: '1.0.0',
        scripts: expect.objectContaining({
          ff2: 'ff2',
        }),
        dependencies: expect.objectContaining({
          '@forgeflow/orchestrator-v2': '^2.0.0',
        }),
      });
    });

    it('should generate TypeScript config for nodejs projects', async () => {
      const options: InstallationOptions = {
        projectPath: mockTempDir,
        projectType: 'nodejs',
        environment: 'development',
        skipWizard: true,
      };

      await installationManager.install(options);

      const tsconfigCall = mockedFs.writeFile.mock.calls.find((call) =>
        call[0].toString().includes('tsconfig.json'),
      );

      expect(tsconfigCall).toBeDefined();

      const tsconfigContent = JSON.parse(tsconfigCall[1] as string);
      expect(tsconfigContent.compilerOptions).toMatchObject({
        target: 'ES2022',
        module: 'NodeNext',
        strict: true,
      });
    });

    it('should generate appropriate .gitignore', async () => {
      const options: InstallationOptions = {
        projectPath: mockTempDir,
        projectType: 'nodejs',
        environment: 'development',
        skipWizard: true,
      };

      await installationManager.install(options);

      const gitignoreCall = mockedFs.writeFile.mock.calls.find((call) =>
        call[0].toString().includes('.gitignore'),
      );

      expect(gitignoreCall).toBeDefined();

      const gitignoreContent = gitignoreCall[1] as string;
      expect(gitignoreContent).toContain('node_modules/');
      expect(gitignoreContent).toContain('.worktrees/');
      expect(gitignoreContent).toContain('*.backup');
    });

    it('should generate environment example file', async () => {
      const options: InstallationOptions = {
        projectPath: mockTempDir,
        projectType: 'nodejs',
        environment: 'development',
        skipWizard: true,
      };

      await installationManager.install(options);

      const envExampleCall = mockedFs.writeFile.mock.calls.find((call) =>
        call[0].toString().includes('.env.example'),
      );

      expect(envExampleCall).toBeDefined();

      const envContent = envExampleCall[1] as string;
      expect(envContent).toContain('GITHUB_TOKEN=');
      expect(envContent).toContain('DATABASE_URL=');
      expect(envContent).toContain('ENABLE_MONITORING=');
    });
  });

  describe('error handling', () => {
    it('should handle permission errors gracefully', async () => {
      mockedFs.ensureDir.mockRejectedValue(new Error('Permission denied'));

      const options: InstallationOptions = {
        projectPath: mockTempDir,
        projectType: 'nodejs',
        environment: 'development',
        skipWizard: true,
      };

      await expect(installationManager.install(options)).rejects.toThrow();
    });

    it('should handle network errors during dependency installation', async () => {
      // Mock execa to simulate npm install failure
      vi.doMock('execa', () => ({
        execa: vi.fn().mockRejectedValue(new Error('Network error')),
      }));

      const options: InstallationOptions = {
        projectPath: mockTempDir,
        projectType: 'nodejs',
        environment: 'development',
        skipWizard: true,
      };

      await expect(installationManager.install(options)).rejects.toThrow();
    });

    it('should provide meaningful error messages', async () => {
      (MockedConfigurationManager.prototype.initialize as any).mockRejectedValue(
        new Error('Invalid configuration format'),
      );

      const options: InstallationOptions = {
        projectPath: mockTempDir,
        projectType: 'nodejs',
        environment: 'development',
        skipWizard: true,
      };

      try {
        await installationManager.install(options);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Invalid configuration format');
      }
    });
  });

  describe('installation metrics', () => {
    it('should track installation duration', async () => {
      const options: InstallationOptions = {
        projectPath: mockTempDir,
        projectType: 'nodejs',
        environment: 'development',
        skipWizard: true,
      };

      const startTime = Date.now();
      const result = await installationManager.install(options);
      const endTime = Date.now();

      expect(result.installationTime).toBeGreaterThanOrEqual(0);
      expect(result.installationTime).toBeLessThanOrEqual(endTime - startTime + 100); // Allow some margin
    });

    it('should include version in installation result', async () => {
      const options: InstallationOptions = {
        projectPath: mockTempDir,
        projectType: 'nodejs',
        environment: 'development',
        skipWizard: true,
      };

      const result = await installationManager.install(options);

      expect(result.version).toBe('2.0.0');
    });

    it('should track installation timestamp', async () => {
      const options: InstallationOptions = {
        projectPath: mockTempDir,
        projectType: 'nodejs',
        environment: 'development',
        skipWizard: true,
      };

      const beforeInstall = new Date();
      const result = await installationManager.install(options);
      const afterInstall = new Date();

      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(beforeInstall.getTime());
      expect(result.timestamp.getTime()).toBeLessThanOrEqual(afterInstall.getTime());
    });
  });

  describe('different project types', () => {
    it('should handle Python project installation', async () => {
      const options: InstallationOptions = {
        projectPath: mockTempDir,
        projectType: 'python',
        environment: 'development',
        skipWizard: true,
      };

      const result = await installationManager.install(options);

      expect(result.success).toBe(true);
      expect(result.projectType).toBe('python');
    });

    it('should handle mixed project installation', async () => {
      const options: InstallationOptions = {
        projectPath: mockTempDir,
        projectType: 'mixed',
        environment: 'development',
        skipWizard: true,
      };

      const result = await installationManager.install(options);

      expect(result.success).toBe(true);
      expect(result.projectType).toBe('mixed');
    });

    it('should handle generic project installation', async () => {
      const options: InstallationOptions = {
        projectPath: mockTempDir,
        projectType: 'generic',
        environment: 'development',
        skipWizard: true,
      };

      const result = await installationManager.install(options);

      expect(result.success).toBe(true);
      expect(result.projectType).toBe('generic');
    });
  });

  describe('environment-specific installation', () => {
    it('should handle production environment installation', async () => {
      const options: InstallationOptions = {
        projectPath: mockTempDir,
        projectType: 'nodejs',
        environment: 'production',
        skipWizard: true,
      };

      const result = await installationManager.install(options);

      expect(result.success).toBe(true);
      expect(result.environment).toBe('production');
      expect(MockedEnvironmentManager.prototype.initialize).toHaveBeenCalledWith('production');
    });

    it('should handle staging environment installation', async () => {
      const options: InstallationOptions = {
        projectPath: mockTempDir,
        projectType: 'nodejs',
        environment: 'staging',
        skipWizard: true,
      };

      const result = await installationManager.install(options);

      expect(result.success).toBe(true);
      expect(result.environment).toBe('staging');
    });

    it('should handle testing environment installation', async () => {
      const options: InstallationOptions = {
        projectPath: mockTempDir,
        projectType: 'nodejs',
        environment: 'testing',
        skipWizard: true,
      };

      const result = await installationManager.install(options);

      expect(result.success).toBe(true);
      expect(result.environment).toBe('testing');
    });
  });
});
