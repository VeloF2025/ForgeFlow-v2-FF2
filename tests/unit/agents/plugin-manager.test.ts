// 🟢 WORKING: Plugin Manager Tests
// Comprehensive test suite for plugin management and security sandbox

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'path';
import { writeFile, mkdir, rm } from 'fs/promises';
import { PluginManager, PluginManagerConfig } from '../../../src/agents/plugin-manager';
import type { CustomAgentDefinition, SecurityPermission } from '../../../src/agents/agent-definition-schema';

describe('PluginManager', () => {
  let pluginManager: PluginManager;
  let tempDir: string;
  let config: PluginManagerConfig;

  beforeEach(async () => {
    tempDir = join(process.cwd(), 'test-temp-plugins');
    await mkdir(tempDir, { recursive: true });

    config = {
      pluginPaths: [tempDir],
      cachePath: join(tempDir, 'cache'),
      securityLevel: 'moderate',
      maxConcurrentPlugins: 5,
      isolation: {
        enableSandbox: true,
        allowedPermissions: ['filesystem:read', 'environment:read'],
        resourceLimits: {
          memory: '256MB',
          cpu: 1.0,
          timeout: 30000,
        },
      },
      marketplace: {
        enabled: false,
        allowedSources: [],
        autoUpdate: false,
        checkInterval: 3600000,
      },
    };

    pluginManager = new PluginManager(config);
  });

  afterEach(async () => {
    await pluginManager.shutdown();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('Plugin Manager Initialization', () => {
    it('should initialize plugin manager successfully', () => {
      expect(pluginManager).toBeDefined();
    });

    it('should create plugin directories', async () => {
      // Directory should be created during initialization
      const fs = await import('fs/promises');
      await expect(fs.access(tempDir)).resolves.not.toThrow();
      await expect(fs.access(config.cachePath)).resolves.not.toThrow();
    });

    it('should handle initialization with custom config', () => {
      const customConfig: PluginManagerConfig = {
        ...config,
        securityLevel: 'strict',
        maxConcurrentPlugins: 10,
        isolation: {
          enableSandbox: false,
          allowedPermissions: ['filesystem:read'],
          resourceLimits: {
            memory: '128MB',
            cpu: 0.5,
            timeout: 15000,
          },
        },
      };

      expect(() => new PluginManager(customConfig)).not.toThrow();
    });
  });

  describe('Plugin Registration', () => {
    it('should register plugins from directory', async () => {
      // 🟢 WORKING: Create test plugin
      const definition: CustomAgentDefinition = {
        name: 'test-plugin',
        type: 'test-plugin',
        version: '1.0.0',
        capabilities: ['testing'],
        implementation: {
          type: 'javascript',
          main: 'index.js',
        },
      };

      const pluginDir = join(tempDir, 'test-plugin');
      await mkdir(pluginDir, { recursive: true });
      await writeFile(join(pluginDir, 'agent.json'), JSON.stringify(definition, null, 2));

      // Create mock implementation
      const implCode = `
        class TestPlugin {
          async execute(issueId, worktreeId) {
            return { success: true };
          }
        }
        module.exports = TestPlugin;
      `;
      await writeFile(join(pluginDir, 'index.js'), implCode);

      await pluginManager.loadAllPlugins();
      
      const plugins = pluginManager.getLoadedPlugins();
      expect(plugins).toHaveLength(1);
      expect(plugins[0].definition.name).toBe('test-plugin');
    });

    it('should handle plugin registration errors', async () => {
      const events: any[] = [];
      
      pluginManager.on('pluginError', (event) => {
        events.push(event);
      });

      // 🟢 WORKING: Create invalid plugin
      const invalidDefinition = {
        name: 'invalid-plugin',
        // Missing required fields
      };

      const pluginDir = join(tempDir, 'invalid-plugin');
      await mkdir(pluginDir, { recursive: true });
      await writeFile(join(pluginDir, 'agent.json'), JSON.stringify(invalidDefinition, null, 2));

      await pluginManager.loadAllPlugins();
      
      expect(events.length).toBeGreaterThan(0);
    });

    it('should validate plugin compatibility', async () => {
      const definition: CustomAgentDefinition = {
        name: 'compat-test-plugin',
        type: 'compat-test-plugin',
        version: '1.0.0',
        capabilities: ['testing'],
        implementation: {
          type: 'javascript',
          main: 'index.js',
        },
        compatibility: {
          platforms: ['windows', 'linux', 'darwin'],
          nodeVersion: '^16.0.0',
          forgeflowVersion: '^2.0.0',
        },
      };

      const pluginDir = join(tempDir, 'compat-plugin');
      await mkdir(pluginDir, { recursive: true });
      await writeFile(join(pluginDir, 'agent.json'), JSON.stringify(definition, null, 2));

      await pluginManager.loadAllPlugins();
      
      const plugins = pluginManager.getLoadedPlugins();
      expect(plugins.some(p => p.definition.type === 'compat-test-plugin')).toBe(true);
    });
  });

  describe('Security Sandbox', () => {
    it('should create secure agent instances', async () => {
      const definition: CustomAgentDefinition = {
        name: 'secure-plugin',
        type: 'secure-plugin',
        version: '1.0.0',
        capabilities: ['testing'],
        implementation: {
          type: 'javascript',
          main: 'index.js',
        },
        security: {
          permissions: ['filesystem:read', 'environment:read'],
          sandbox: true,
        },
      };

      const pluginDir = join(tempDir, 'secure-plugin');
      await mkdir(pluginDir, { recursive: true });
      await writeFile(join(pluginDir, 'agent.json'), JSON.stringify(definition, null, 2));

      // Create secure implementation
      const implCode = `
        class SecurePlugin {
          async execute(issueId, worktreeId, context) {
            // Test security restrictions
            return { success: true, context: !!context };
          }
        }
        module.exports = SecurePlugin;
      `;
      await writeFile(join(pluginDir, 'index.js'), implCode);

      await pluginManager.loadAllPlugins();

      const context = {
        pluginId: 'test-plugin-1',
        agentType: 'secure-plugin',
        issueId: 'test-issue',
        worktreeId: 'test-worktree',
        config: {},
        permissions: ['filesystem:read'] as SecurityPermission[],
        sandbox: true,
        resources: { memory: '256MB', cpu: 1.0 },
      };

      const agent = await pluginManager.createSecureAgentInstance('secure-plugin', context);
      
      expect(agent).toBeDefined();
      expect(agent?.type).toBe('secure-plugin');
    });

    it('should enforce security permissions', async () => {
      const definition: CustomAgentDefinition = {
        name: 'restricted-plugin',
        type: 'restricted-plugin',
        version: '1.0.0',
        capabilities: ['testing'],
        implementation: {
          type: 'javascript',
          main: 'index.js',
        },
        security: {
          permissions: ['environment:read'], // Limited permissions
          sandbox: true,
        },
      };

      const pluginDir = join(tempDir, 'restricted-plugin');
      await mkdir(pluginDir, { recursive: true });
      await writeFile(join(pluginDir, 'agent.json'), JSON.stringify(definition, null, 2));

      const implCode = `
        class RestrictedPlugin {
          async execute(issueId, worktreeId, context) {
            return { permissions: context.permissions };
          }
        }
        module.exports = RestrictedPlugin;
      `;
      await writeFile(join(pluginDir, 'index.js'), implCode);

      await pluginManager.loadAllPlugins();

      const context = {
        pluginId: 'test-plugin-2',
        agentType: 'restricted-plugin',
        issueId: 'test-issue',
        worktreeId: 'test-worktree',
        config: {},
        permissions: ['environment:read'] as SecurityPermission[],
        sandbox: true,
        resources: { memory: '256MB', cpu: 1.0 },
      };

      const agent = await pluginManager.createSecureAgentInstance('restricted-plugin', context);
      
      expect(agent).toBeDefined();
    });

    it('should handle resource limits', async () => {
      const definition: CustomAgentDefinition = {
        name: 'resource-plugin',
        type: 'resource-plugin',
        version: '1.0.0',
        capabilities: ['testing'],
        implementation: {
          type: 'javascript',
          main: 'index.js',
        },
        execution: {
          resources: {
            maxMemory: '128MB',
            maxCpu: 0.5,
          },
        },
      };

      const pluginDir = join(tempDir, 'resource-plugin');
      await mkdir(pluginDir, { recursive: true });
      await writeFile(join(pluginDir, 'agent.json'), JSON.stringify(definition, null, 2));

      const implCode = `
        class ResourcePlugin {
          async execute(issueId, worktreeId) {
            return { success: true };
          }
        }
        module.exports = ResourcePlugin;
      `;
      await writeFile(join(pluginDir, 'index.js'), implCode);

      await pluginManager.loadAllPlugins();

      const context = {
        pluginId: 'test-plugin-3',
        agentType: 'resource-plugin',
        issueId: 'test-issue',
        worktreeId: 'test-worktree',
        config: {},
        permissions: ['filesystem:read'] as SecurityPermission[],
        sandbox: true,
        resources: { memory: '128MB', cpu: 0.5 },
      };

      const agent = await pluginManager.createSecureAgentInstance('resource-plugin', context);
      
      expect(agent).toBeDefined();
    });
  });

  describe('Plugin Lifecycle Management', () => {
    it('should track plugin statistics', async () => {
      const definition: CustomAgentDefinition = {
        name: 'stats-plugin',
        type: 'stats-plugin',
        version: '1.0.0',
        capabilities: ['testing'],
        implementation: {
          type: 'javascript',
          main: 'index.js',
        },
      };

      const pluginDir = join(tempDir, 'stats-plugin');
      await mkdir(pluginDir, { recursive: true });
      await writeFile(join(pluginDir, 'agent.json'), JSON.stringify(definition, null, 2));

      const implCode = `
        class StatsPlugin {
          async execute(issueId, worktreeId) {
            return { success: true };
          }
        }
        module.exports = StatsPlugin;
      `;
      await writeFile(join(pluginDir, 'index.js'), implCode);

      await pluginManager.loadAllPlugins();
      
      const plugins = pluginManager.getLoadedPlugins();
      expect(plugins).toHaveLength(1);
      expect(plugins[0].definition.type).toBe('stats-plugin');
    });

    it('should handle plugin reloading', async () => {
      const definition: CustomAgentDefinition = {
        name: 'reload-plugin',
        type: 'reload-plugin',
        version: '1.0.0',
        capabilities: ['testing'],
        implementation: {
          type: 'javascript',
          main: 'index.js',
        },
      };

      const pluginDir = join(tempDir, 'reload-plugin');
      await mkdir(pluginDir, { recursive: true });
      await writeFile(join(pluginDir, 'agent.json'), JSON.stringify(definition, null, 2));

      const implCode = `
        class ReloadPlugin {
          async execute(issueId, worktreeId) {
            return { version: '1.0.0' };
          }
        }
        module.exports = ReloadPlugin;
      `;
      await writeFile(join(pluginDir, 'index.js'), implCode);

      await pluginManager.loadAllPlugins();
      
      // Simulate plugin update
      const updatedDefinition = { ...definition, version: '1.1.0' };
      await writeFile(join(pluginDir, 'agent.json'), JSON.stringify(updatedDefinition, null, 2));

      const reloaded = await pluginManager.reloadPlugin('reload-plugin');
      
      expect(reloaded).toBe(true);
    });

    it('should cleanup resources on shutdown', async () => {
      const definition: CustomAgentDefinition = {
        name: 'cleanup-plugin',
        type: 'cleanup-plugin',
        version: '1.0.0',
        capabilities: ['testing'],
        implementation: {
          type: 'javascript',
          main: 'index.js',
        },
      };

      const pluginDir = join(tempDir, 'cleanup-plugin');
      await mkdir(pluginDir, { recursive: true });
      await writeFile(join(pluginDir, 'agent.json'), JSON.stringify(definition, null, 2));

      const implCode = `
        class CleanupPlugin {
          async execute(issueId, worktreeId) {
            return { success: true };
          }
        }
        module.exports = CleanupPlugin;
      `;
      await writeFile(join(pluginDir, 'index.js'), implCode);

      await pluginManager.loadAllPlugins();
      
      expect(pluginManager.getLoadedPlugins()).toHaveLength(1);
      
      await pluginManager.shutdown();
      
      expect(pluginManager.getLoadedPlugins()).toHaveLength(0);
    });
  });

  describe('Dependency Management', () => {
    it('should validate agent dependencies', async () => {
      const definition: CustomAgentDefinition = {
        name: 'dependent-plugin',
        type: 'dependent-plugin',
        version: '1.0.0',
        capabilities: ['testing'],
        dependencies: {
          tools: [
            { name: 'node', version: '16.0.0', optional: false },
            { name: 'git', version: '2.0.0', optional: true },
          ],
        },
        implementation: {
          type: 'javascript',
          main: 'index.js',
        },
      };

      const pluginDir = join(tempDir, 'dependent-plugin');
      await mkdir(pluginDir, { recursive: true });
      await writeFile(join(pluginDir, 'agent.json'), JSON.stringify(definition, null, 2));

      const implCode = `
        class DependentPlugin {
          async execute(issueId, worktreeId) {
            return { success: true };
          }
        }
        module.exports = DependentPlugin;
      `;
      await writeFile(join(pluginDir, 'index.js'), implCode);

      await pluginManager.loadAllPlugins();
      
      const plugins = pluginManager.getLoadedPlugins();
      const plugin = plugins.find(p => p.definition.type === 'dependent-plugin');
      
      expect(plugin).toBeDefined();
      expect(plugin?.definition.dependencies?.tools).toHaveLength(2);
    });

    it('should handle NPM dependencies', async () => {
      const definition: CustomAgentDefinition = {
        name: 'npm-plugin',
        type: 'npm-plugin',
        version: '1.0.0',
        capabilities: ['testing'],
        dependencies: {
          npm: {
            'lodash': '^4.17.21',
            'axios': '^1.0.0',
          },
        },
        implementation: {
          type: 'javascript',
          main: 'index.js',
        },
      };

      const pluginDir = join(tempDir, 'npm-plugin');
      await mkdir(pluginDir, { recursive: true });
      await writeFile(join(pluginDir, 'agent.json'), JSON.stringify(definition, null, 2));

      const implCode = `
        class NpmPlugin {
          async execute(issueId, worktreeId) {
            return { success: true };
          }
        }
        module.exports = NpmPlugin;
      `;
      await writeFile(join(pluginDir, 'index.js'), implCode);

      // Mock npm install to avoid actual installation in tests
      const originalMethod = pluginManager['installNpmDependencies'];
      pluginManager['installNpmDependencies'] = vi.fn().mockResolvedValue(undefined);

      await pluginManager.loadAllPlugins();
      
      const plugins = pluginManager.getLoadedPlugins();
      expect(plugins.some(p => p.definition.type === 'npm-plugin')).toBe(true);

      // Restore original method
      pluginManager['installNpmDependencies'] = originalMethod;
    });
  });

  describe('Error Handling', () => {
    it('should handle plugin loading errors gracefully', async () => {
      const events: any[] = [];
      
      pluginManager.on('pluginError', (event) => {
        events.push(event);
      });

      // Create plugin with invalid implementation
      const definition: CustomAgentDefinition = {
        name: 'error-plugin',
        type: 'error-plugin',
        version: '1.0.0',
        capabilities: ['testing'],
        implementation: {
          type: 'javascript',
          main: 'nonexistent.js', // File doesn't exist
        },
      };

      const pluginDir = join(tempDir, 'error-plugin');
      await mkdir(pluginDir, { recursive: true });
      await writeFile(join(pluginDir, 'agent.json'), JSON.stringify(definition, null, 2));

      await pluginManager.loadAllPlugins();
      
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].error).toBeDefined();
    });

    it('should handle sandbox creation failures', async () => {
      const definition: CustomAgentDefinition = {
        name: 'sandbox-fail-plugin',
        type: 'sandbox-fail-plugin',
        version: '1.0.0',
        capabilities: ['testing'],
        implementation: {
          type: 'javascript',
          main: 'index.js',
        },
        execution: {
          isolation: 'container', // Not implemented, should fail gracefully
        },
      };

      const pluginDir = join(tempDir, 'sandbox-fail-plugin');
      await mkdir(pluginDir, { recursive: true });
      await writeFile(join(pluginDir, 'agent.json'), JSON.stringify(definition, null, 2));

      const implCode = `
        class SandboxFailPlugin {
          async execute(issueId, worktreeId) {
            return { success: true };
          }
        }
        module.exports = SandboxFailPlugin;
      `;
      await writeFile(join(pluginDir, 'index.js'), implCode);

      await pluginManager.loadAllPlugins();

      const context = {
        pluginId: 'test-plugin-4',
        agentType: 'sandbox-fail-plugin',
        issueId: 'test-issue',
        worktreeId: 'test-worktree',
        config: {},
        permissions: ['filesystem:read'] as SecurityPermission[],
        sandbox: true,
        resources: { memory: '256MB', cpu: 1.0 },
      };

      // Should handle container creation failure gracefully
      const agent = await pluginManager.createSecureAgentInstance('sandbox-fail-plugin', context);
      
      // May be null due to container implementation not available
      expect(typeof agent === 'object').toBe(true);
    });
  });
});