import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HealthChecker } from '../health-checker';
import fs from 'fs-extra';
import { exec } from 'child_process';

// Mock dependencies
vi.mock('fs-extra');
vi.mock('child_process');

const mockedFs = vi.mocked(fs);
const mockedExec = vi.mocked(exec);

describe('HealthChecker', () => {
  let healthChecker: HealthChecker;

  beforeEach(() => {
    healthChecker = new HealthChecker();
    vi.clearAllMocks();

    // Setup default mock implementations
    (mockedFs.pathExists as any).mockResolvedValue(true);
    (mockedFs.access as any).mockResolvedValue();
    (mockedFs.writeFile as any).mockResolvedValue();
    (mockedFs.remove as any).mockResolvedValue();
    (mockedFs.stat as any).mockResolvedValue({ size: 1024 } as any);
    (mockedFs.readFile as any).mockResolvedValue('{}');
  });

  describe('runInitialCheck', () => {
    it('should pass when all basic requirements are met', async () => {
      const projectPath = '/test/project';

      const result = await healthChecker.runInitialCheck(projectPath);

      expect(result.healthy).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.checks.length).toBeGreaterThan(0);
    });

    it('should fail when project path is not accessible', async () => {
      mockedFs.access.mockRejectedValue(new Error('Access denied'));

      const projectPath = '/inaccessible/path';

      const result = await healthChecker.runInitialCheck(projectPath);

      expect(result.healthy).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]).toContain('permissions');
    });

    it('should complete within reasonable time', async () => {
      const projectPath = '/test/project';

      const startTime = Date.now();
      const result = await healthChecker.runInitialCheck(projectPath);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.metrics.totalDuration).toBeGreaterThan(0);
    });
  });

  describe('runComprehensiveCheck', () => {
    it('should run all available health checks', async () => {
      const projectPath = '/test/project';

      const result = await healthChecker.runComprehensiveCheck(projectPath);

      expect(result.checks.length).toBeGreaterThanOrEqual(10); // Should have many checks
      expect(result.metrics.checksRun).toBeGreaterThanOrEqual(10);
    });

    it('should categorize checks properly', async () => {
      const projectPath = '/test/project';

      const result = await healthChecker.runComprehensiveCheck(projectPath);

      // Should have checks from different categories
      const categories = result.checks.map((check) => check.name);
      expect(categories).toContain('system_requirements');
      expect(categories).toContain('dependencies');
      expect(categories).toContain('disk_space');
      expect(categories).toContain('permissions');
    });
  });

  describe('runQuickCheck', () => {
    it('should run only essential checks', async () => {
      const result = await healthChecker.runQuickCheck();

      expect(result.healthy).toBeDefined();
      expect(result.issues).toBeDefined();
      expect(result.issues).toBeInstanceOf(Array);
    });

    it('should complete faster than comprehensive check', async () => {
      const startTime = Date.now();
      await healthChecker.runQuickCheck();
      const quickDuration = Date.now() - startTime;

      const startTime2 = Date.now();
      await healthChecker.runComprehensiveCheck('/test/project');
      const comprehensiveDuration = Date.now() - startTime2;

      expect(quickDuration).toBeLessThan(comprehensiveDuration);
    });
  });

  describe('system requirements check', () => {
    it('should validate Node.js version', async () => {
      // Test with current Node.js version (should pass)
      const result = await healthChecker.runHealthChecks('/test/project', ['node_version']);

      const nodeCheck = result.checks.find((check) => check.name === 'node_version');
      expect(nodeCheck).toBeDefined();
      expect(nodeCheck?.status).toBe('pass');
    });

    it('should detect unsupported platform', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', {
        value: 'unsupported' as any,
        configurable: true,
      });

      const result = await healthChecker.runHealthChecks('/test/project', ['system_requirements']);

      const systemCheck = result.checks.find((check) => check.name === 'system_requirements');
      expect(systemCheck?.status).toBe('fail');

      // Restore original platform
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
    });

    it('should validate architecture', async () => {
      const result = await healthChecker.runHealthChecks('/test/project', ['system_requirements']);

      const systemCheck = result.checks.find((check) => check.name === 'system_requirements');
      expect(systemCheck).toBeDefined();

      if (systemCheck?.details) {
        expect(['x64', 'arm64']).toContain(systemCheck.details.arch);
      }
    });
  });

  describe('dependencies check', () => {
    it('should pass when package.json and node_modules exist', async () => {
      mockedFs.pathExists.mockImplementation((path: string) => {
        if (path.includes('package.json') || path.includes('node_modules')) {
          return Promise.resolve(true);
        }
        return Promise.resolve(true);
      });

      const result = await healthChecker.runHealthChecks('/test/project', ['dependencies']);

      const depsCheck = result.checks.find((check) => check.name === 'dependencies');
      expect(depsCheck?.status).toBe('pass');
    });

    it('should warn when no package-lock.json exists', async () => {
      mockedFs.pathExists.mockImplementation((path: string) => {
        if (path.includes('package-lock.json')) {
          return Promise.resolve(false);
        }
        return Promise.resolve(true);
      });

      const result = await healthChecker.runHealthChecks('/test/project', ['dependencies']);

      const depsCheck = result.checks.find((check) => check.name === 'dependencies');
      expect(depsCheck?.status).toBe('warning');
      expect(depsCheck?.message).toContain('package-lock.json');
    });

    it('should fail when node_modules is missing', async () => {
      mockedFs.pathExists.mockImplementation((path: string) => {
        if (path.includes('node_modules')) {
          return Promise.resolve(false);
        }
        return Promise.resolve(true);
      });

      const result = await healthChecker.runHealthChecks('/test/project', ['dependencies']);

      const depsCheck = result.checks.find((check) => check.name === 'dependencies');
      expect(depsCheck?.status).toBe('fail');
      expect(depsCheck?.message).toContain('node_modules');
    });
  });

  describe('disk space check', () => {
    it('should pass when project path is accessible', async () => {
      const result = await healthChecker.runHealthChecks('/test/project', ['disk_space']);

      const diskCheck = result.checks.find((check) => check.name === 'disk_space');
      expect(diskCheck?.status).toBe('pass');
    });

    it('should fail when project path is inaccessible', async () => {
      mockedFs.access.mockRejectedValue(new Error('Path not accessible'));

      const result = await healthChecker.runHealthChecks('/test/project', ['disk_space']);

      const diskCheck = result.checks.find((check) => check.name === 'disk_space');
      expect(diskCheck?.status).toBe('fail');
    });
  });

  describe('permissions check', () => {
    it('should pass when read/write permissions are available', async () => {
      const result = await healthChecker.runHealthChecks('/test/project', ['permissions']);

      const permCheck = result.checks.find((check) => check.name === 'permissions');
      expect(permCheck?.status).toBe('pass');
    });

    it('should fail when write permissions are denied', async () => {
      (mockedFs.access as any).mockImplementation((path: string, mode: number) => {
        if (mode === fs.constants.W_OK) {
          return Promise.reject(new Error('Write permission denied'));
        }
        return Promise.resolve();
      });

      const result = await healthChecker.runHealthChecks('/test/project', ['permissions']);

      const permCheck = result.checks.find((check) => check.name === 'permissions');
      expect(permCheck?.status).toBe('fail');
      expect(permCheck?.message).toContain('permission');
    });
  });

  describe('git repository check', () => {
    it('should pass when .git directory exists and repo is clean', async () => {
      mockedFs.pathExists.mockImplementation((path: string) => {
        if (path.includes('.git')) {
          return Promise.resolve(true);
        }
        return Promise.resolve(true);
      });

      // Mock git status to return clean
      vi.doMock('child_process', () => ({
        exec: vi.fn().mockImplementation((cmd: string, options: any, callback: any) => {
          if (cmd.includes('git status')) {
            callback(null, { stdout: '' }); // Clean repo
          }
        }),
      }));

      const result = await healthChecker.runHealthChecks('/test/project', ['git_repository']);

      const gitCheck = result.checks.find((check) => check.name === 'git_repository');
      expect(gitCheck?.status).toBe('pass');
    });

    it('should warn when not a git repository', async () => {
      mockedFs.pathExists.mockImplementation((path: string) => {
        if (path.includes('.git')) {
          return Promise.resolve(false);
        }
        return Promise.resolve(true);
      });

      const result = await healthChecker.runHealthChecks('/test/project', ['git_repository']);

      const gitCheck = result.checks.find((check) => check.name === 'git_repository');
      expect(gitCheck?.status).toBe('warning');
      expect(gitCheck?.message).toContain('Git repository');
    });

    it('should warn when repository has uncommitted changes', async () => {
      (mockedFs.pathExists as any).mockResolvedValue(true);

      // Mock git status to return uncommitted changes
      vi.doMock('child_process', () => ({
        exec: vi.fn().mockImplementation((cmd: string, options: any, callback: any) => {
          if (cmd.includes('git status')) {
            callback(null, { stdout: 'M file1.js\n?? file2.js' }); // Has changes
          }
        }),
      }));

      const result = await healthChecker.runHealthChecks('/test/project', ['git_repository']);

      const gitCheck = result.checks.find((check) => check.name === 'git_repository');
      expect(gitCheck?.status).toBe('warning');
      expect(gitCheck?.message).toContain('uncommitted changes');
    });
  });

  describe('configuration validity check', () => {
    it('should pass when valid configuration file exists', async () => {
      mockedFs.pathExists.mockImplementation((path: string) => {
        if (path.includes('forgeflow.config.yaml')) {
          return Promise.resolve(true);
        }
        return Promise.resolve(true);
      });

      (mockedFs.readFile as any).mockResolvedValue(`
        project:
          name: test
        environment: development
      `);

      const result = await healthChecker.runHealthChecks('/test/project', [
        'configuration_validity',
      ]);

      const configCheck = result.checks.find((check) => check.name === 'configuration_validity');
      expect(configCheck?.status).toBe('pass');
    });

    it('should warn when no configuration file exists', async () => {
      (mockedFs.pathExists as any).mockResolvedValue(false);

      const result = await healthChecker.runHealthChecks('/test/project', [
        'configuration_validity',
      ]);

      const configCheck = result.checks.find((check) => check.name === 'configuration_validity');
      expect(configCheck?.status).toBe('warning');
      expect(configCheck?.message).toContain('configuration file');
    });

    it('should fail when configuration has syntax errors', async () => {
      mockedFs.pathExists.mockImplementation((path: string) => {
        if (path.includes('forgeflow.config.yaml')) {
          return Promise.resolve(true);
        }
        return Promise.resolve(true);
      });

      (mockedFs.readFile as any).mockResolvedValue('invalid: yaml: content: [');

      const result = await healthChecker.runHealthChecks('/test/project', [
        'configuration_validity',
      ]);

      const configCheck = result.checks.find((check) => check.name === 'configuration_validity');
      expect(configCheck?.status).toBe('fail');
      expect(configCheck?.message).toContain('syntax errors');
    });
  });

  describe('memory usage check', () => {
    it('should pass with normal memory usage', async () => {
      const result = await healthChecker.runHealthChecks('/test/project', ['memory_usage']);

      const memCheck = result.checks.find((check) => check.name === 'memory_usage');
      expect(['pass', 'warning']).toContain(memCheck?.status);
      expect(memCheck?.details).toHaveProperty('totalMB');
      expect(memCheck?.details).toHaveProperty('heapUsedMB');
    });

    it('should warn with high memory usage', async () => {
      // Mock high memory usage
      vi.spyOn(process, 'memoryUsage').mockReturnValue({
        rss: 2000 * 1024 * 1024, // 2GB
        heapTotal: 1000 * 1024 * 1024,
        heapUsed: 800 * 1024 * 1024,
        external: 100 * 1024 * 1024,
        arrayBuffers: 50 * 1024 * 1024,
      });

      const result = await healthChecker.runHealthChecks('/test/project', ['memory_usage']);

      const memCheck = result.checks.find((check) => check.name === 'memory_usage');
      expect(memCheck?.status).toBe('warning');
      expect(memCheck?.message).toContain('High memory usage');
    });
  });

  describe('performance baseline check', () => {
    it('should establish performance baseline', async () => {
      const result = await healthChecker.runHealthChecks('/test/project', ['performance_baseline']);

      const perfCheck = result.checks.find((check) => check.name === 'performance_baseline');
      expect(['pass', 'warning']).toContain(perfCheck?.status);
      expect(perfCheck?.details).toHaveProperty('baselineMs');
      expect(perfCheck?.details?.baselineMs).toBeGreaterThan(0);
    });

    it('should warn about slow filesystem performance', async () => {
      // Mock slow filesystem operations
      mockedFs.readdir.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 2000)),
      );

      const result = await healthChecker.runHealthChecks('/test/project', ['performance_baseline']);

      const perfCheck = result.checks.find((check) => check.name === 'performance_baseline');
      expect(perfCheck?.status).toBe('warning');
      expect(perfCheck?.message).toContain('Slow file system performance');
    });
  });

  describe('custom health checks', () => {
    it('should allow adding custom health checks', async () => {
      const customCheck = {
        name: 'custom_test_check',
        description: 'Custom test health check',
        category: 'system' as const,
        critical: false,
        timeout: 5000,
      };

      healthChecker.addHealthCheck(customCheck);

      const checks = healthChecker.getAvailableChecks();
      expect(checks).toContainEqual(customCheck);
    });

    it('should remove health checks', async () => {
      const customCheck = {
        name: 'removable_check',
        description: 'Check that can be removed',
        category: 'system' as const,
        critical: false,
        timeout: 5000,
      };

      healthChecker.addHealthCheck(customCheck);
      healthChecker.removeHealthCheck('removable_check');

      const checks = healthChecker.getAvailableChecks();
      expect(checks).not.toContainEqual(customCheck);
    });
  });

  describe('error handling', () => {
    it('should handle timeouts gracefully', async () => {
      // Mock a check that times out
      const timeoutCheck = {
        name: 'timeout_test',
        description: 'Check that times out',
        category: 'system' as const,
        critical: false,
        timeout: 100, // Very short timeout
      };

      healthChecker.addHealthCheck(timeoutCheck);

      const result = await healthChecker.runHealthChecks('/test/project', ['timeout_test']);

      expect(result.checks).toHaveLength(1);
      expect(result.checks[0].status).toBe('fail');
    });

    it('should continue checking after non-critical failures', async () => {
      const result = await healthChecker.runHealthChecks('/test/project', [
        'system_requirements',
        'dependencies',
        'permissions',
      ]);

      expect(result.checks.length).toBe(3);
      expect(result.metrics.checksRun).toBe(3);
    });

    it('should provide detailed error information', async () => {
      mockedFs.access.mockRejectedValue(new Error('Detailed access error'));

      const result = await healthChecker.runHealthChecks('/test/project', ['permissions']);

      const permCheck = result.checks.find((check) => check.name === 'permissions');
      expect(permCheck?.message).toContain('Detailed access error');
    });
  });

  describe('metrics and reporting', () => {
    it('should track check durations', async () => {
      const result = await healthChecker.runHealthChecks('/test/project', ['system_requirements']);

      expect(result.metrics.totalDuration).toBeGreaterThan(0);
      expect(result.checks[0].duration).toBeGreaterThan(0);
    });

    it('should count check results correctly', async () => {
      const result = await healthChecker.runHealthChecks('/test/project', [
        'system_requirements',
        'dependencies',
        'permissions',
      ]);

      expect(result.metrics.checksRun).toBe(3);
      expect(
        result.metrics.checksPassed + result.metrics.checksFailed + result.metrics.checksWarning,
      ).toBe(3);
    });

    it('should provide recommendations', async () => {
      // Force a warning to generate recommendations
      mockedFs.pathExists.mockImplementation((path: string) => {
        if (path.includes('.git')) {
          return Promise.resolve(false);
        }
        return Promise.resolve(true);
      });

      const result = await healthChecker.runHealthChecks('/test/project', ['git_repository']);

      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('caching and performance', () => {
    it('should cache results appropriately', async () => {
      const projectPath = '/test/project';

      // Run comprehensive check twice
      const result1 = await healthChecker.runComprehensiveCheck(projectPath);
      const result2 = await healthChecker.getLastResults('comprehensive');

      expect(result2).toBeDefined();
      expect(result2?.healthy).toBe(result1.healthy);
    });

    it('should handle multiple concurrent checks', async () => {
      const projectPath = '/test/project';

      const promises = [
        healthChecker.runQuickCheck(),
        healthChecker.runHealthChecks(projectPath, ['system_requirements']),
        healthChecker.runHealthChecks(projectPath, ['dependencies']),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result).toBeDefined();
      });
    });
  });
});
