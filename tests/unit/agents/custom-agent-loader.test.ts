// 🟢 WORKING: Custom Agent Loader Tests
// Comprehensive test suite for custom agent loading and validation

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'path';
import { writeFile, mkdir, rm } from 'fs/promises';
import { CustomAgentLoader } from '../../../src/agents/custom-agent-loader';
import type { CustomAgentDefinition, ValidationResult } from '../../../src/agents/agent-definition-schema';

describe('CustomAgentLoader', () => {
  let loader: CustomAgentLoader;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(process.cwd(), 'test-temp-agents');
    await mkdir(tempDir, { recursive: true });
    loader = new CustomAgentLoader();
  });

  afterEach(async () => {
    await loader.shutdown();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('Agent Definition Validation', () => {
    it('should validate a correct agent definition', async () => {
      const definition: CustomAgentDefinition = {
        name: 'test-agent',
        type: 'test-agent',
        version: '1.0.0',
        capabilities: ['testing'],
        implementation: {
          type: 'javascript',
          main: 'index.js',
        },
      };

      const result: ValidationResult = await loader.validateDefinition(definition);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject definition with invalid version format', async () => {
      const definition = {
        name: 'test-agent',
        type: 'test-agent',
        version: 'invalid-version',
        capabilities: ['testing'],
        implementation: {
          type: 'javascript',
          main: 'index.js',
        },
      };

      const result: ValidationResult = await loader.validateDefinition(definition);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'invalid_version')).toBe(true);
    });

    it('should reject definition with missing required fields', async () => {
      const definition = {
        name: 'test-agent',
        // Missing type, version, capabilities, implementation
      };

      const result: ValidationResult = await loader.validateDefinition(definition);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate capabilities array', async () => {
      const definition: CustomAgentDefinition = {
        name: 'test-agent',
        type: 'test-agent',
        version: '1.0.0',
        capabilities: [], // Empty capabilities should warn
        implementation: {
          type: 'javascript',
          main: 'index.js',
        },
      };

      const result: ValidationResult = await loader.validateDefinition(definition);
      
      expect(result.warnings.some(w => w.code === 'no_capabilities')).toBe(true);
    });

    it('should validate implementation requirements', async () => {
      const definition = {
        name: 'test-agent',
        type: 'test-agent',
        version: '1.0.0',
        capabilities: ['testing'],
        implementation: {
          type: 'javascript',
          // Missing main, class, or function
        },
      };

      const result: ValidationResult = await loader.validateDefinition(definition);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'missing_implementation')).toBe(true);
    });
  });

  describe('Agent Loading from Files', () => {
    it('should load agent from JSON file', async () => {
      const definition: CustomAgentDefinition = {
        name: 'json-test-agent',
        type: 'json-test-agent',
        version: '1.0.0',
        capabilities: ['testing'],
        implementation: {
          type: 'javascript',
          main: 'index.js',
        },
      };

      const agentFile = join(tempDir, 'agent.json');
      await writeFile(agentFile, JSON.stringify(definition, null, 2));

      const plugin = await loader.loadAgentFromFile(agentFile);
      
      expect(plugin).toBeDefined();
      expect(plugin?.definition.name).toBe('json-test-agent');
      expect(plugin?.definition.type).toBe('json-test-agent');
      expect(plugin?.validated).toBe(true);
      expect(plugin?.source).toBe('file');
    });

    it('should load agent from YAML file', async () => {
      const yamlContent = `
name: yaml-test-agent
type: yaml-test-agent
version: 1.0.0
capabilities:
  - testing
implementation:
  type: javascript
  main: index.js
`;

      const agentFile = join(tempDir, 'agent.yaml');
      await writeFile(agentFile, yamlContent);

      const plugin = await loader.loadAgentFromFile(agentFile);
      
      expect(plugin).toBeDefined();
      expect(plugin?.definition.name).toBe('yaml-test-agent');
      expect(plugin?.definition.type).toBe('yaml-test-agent');
      expect(plugin?.validated).toBe(true);
    });

    it('should handle loading errors gracefully', async () => {
      const invalidFile = join(tempDir, 'invalid.json');
      await writeFile(invalidFile, '{ invalid json');

      const plugin = await loader.loadAgentFromFile(invalidFile);
      
      expect(plugin).toBeNull();
    });

    it('should extract definition from package.json', async () => {
      const packageJson = {
        name: 'package-test-agent',
        version: '1.0.0',
        description: 'Test agent from package.json',
        forgeflowAgent: {
          type: 'package-test-agent',
          capabilities: ['testing'],
          implementation: {
            type: 'javascript',
            main: 'src/agent.js',
          },
        },
      };

      const packageFile = join(tempDir, 'package.json');
      await writeFile(packageFile, JSON.stringify(packageJson, null, 2));

      const plugin = await loader.loadAgentFromFile(packageFile);
      
      expect(plugin).toBeDefined();
      expect(plugin?.definition.name).toBe('package-test-agent');
      expect(plugin?.definition.description).toBe('Test agent from package.json');
    });
  });

  describe('Agent Loading from Directory', () => {
    it('should load agents from directory', async () => {
      // 🟢 WORKING: Create multiple agent definitions
      const agents = [
        {
          name: 'dir-agent-1',
          type: 'dir-agent-1',
          version: '1.0.0',
          capabilities: ['testing'],
          implementation: { type: 'javascript', main: 'index.js' },
        },
        {
          name: 'dir-agent-2',
          type: 'dir-agent-2',
          version: '1.0.0',
          capabilities: ['analysis'],
          implementation: { type: 'typescript', main: 'src/agent.ts' },
        },
      ];

      for (const [index, agent] of agents.entries()) {
        const agentDir = join(tempDir, `agent-${index + 1}`);
        await mkdir(agentDir, { recursive: true });
        await writeFile(join(agentDir, 'agent.json'), JSON.stringify(agent, null, 2));
      }

      const plugins = await loader.loadAgentsFromDirectory(tempDir);
      
      expect(plugins).toHaveLength(2);
      expect(plugins.map(p => p.definition.name)).toContain('dir-agent-1');
      expect(plugins.map(p => p.definition.name)).toContain('dir-agent-2');
    });

    it('should handle directories with no agents', async () => {
      const emptyDir = join(tempDir, 'empty');
      await mkdir(emptyDir, { recursive: true });

      const plugins = await loader.loadAgentsFromDirectory(emptyDir);
      
      expect(plugins).toHaveLength(0);
    });

    it('should skip invalid agents in directory', async () => {
      // 🟢 WORKING: Create valid and invalid agents
      const validAgent = {
        name: 'valid-agent',
        type: 'valid-agent',
        version: '1.0.0',
        capabilities: ['testing'],
        implementation: { type: 'javascript', main: 'index.js' },
      };

      const invalidAgent = {
        name: 'invalid-agent',
        // Missing required fields
      };

      await writeFile(join(tempDir, 'valid.json'), JSON.stringify(validAgent, null, 2));
      await writeFile(join(tempDir, 'invalid.json'), JSON.stringify(invalidAgent, null, 2));

      const plugins = await loader.loadAgentsFromDirectory(tempDir);
      
      expect(plugins).toHaveLength(1);
      expect(plugins[0].definition.name).toBe('valid-agent');
    });
  });

  describe('Agent Instance Creation', () => {
    beforeEach(async () => {
      // 🟢 WORKING: Create a test agent
      const definition: CustomAgentDefinition = {
        name: 'instance-test-agent',
        type: 'instance-test-agent',
        version: '1.0.0',
        capabilities: ['testing'],
        implementation: {
          type: 'javascript',
          main: 'index.js',
          class: 'TestAgent',
        },
      };

      const agentFile = join(tempDir, 'agent.json');
      await writeFile(agentFile, JSON.stringify(definition, null, 2));

      // Create a mock implementation
      const implFile = join(tempDir, 'index.js');
      const implCode = `
        class TestAgent {
          constructor(config) {
            this.config = config;
          }
          
          async execute(issueId, worktreeId) {
            return { success: true, issueId, worktreeId };
          }
        }
        
        module.exports = { TestAgent };
      `;
      await writeFile(implFile, implCode);

      await loader.loadAgentFromFile(agentFile);
    });

    it('should create agent instance', async () => {
      const agent = await loader.createAgentInstance('instance-test-agent');
      
      expect(agent).toBeDefined();
      expect(agent?.type).toBe('instance-test-agent');
      expect(agent?.status).toBe('idle');
    });

    it('should handle missing agent type', async () => {
      const agent = await loader.createAgentInstance('non-existent-agent');
      
      expect(agent).toBeNull();
    });

    it('should create instance with configuration', async () => {
      const config = { testMode: true, timeout: 5000 };
      const agent = await loader.createAgentInstance('instance-test-agent', config);
      
      expect(agent).toBeDefined();
    });
  });

  describe('Hot Reload Functionality', () => {
    it('should enable hot reload with configuration', () => {
      const config = {
        enabled: true,
        watchPaths: [tempDir],
        debounceMs: 500,
        excludePatterns: ['**/*.test.*'],
        reloadStrategy: 'graceful' as const,
      };

      expect(() => {
        loader.enableHotReload(config);
      }).not.toThrow();
    });

    it('should track loaded agent types', async () => {
      const definition: CustomAgentDefinition = {
        name: 'tracked-agent',
        type: 'tracked-agent',
        version: '1.0.0',
        capabilities: ['tracking'],
        implementation: {
          type: 'javascript',
          main: 'index.js',
        },
      };

      const agentFile = join(tempDir, 'agent.json');
      await writeFile(agentFile, JSON.stringify(definition, null, 2));

      await loader.loadAgentFromFile(agentFile);
      
      const types = loader.getLoadedAgentTypes();
      expect(types).toContain('tracked-agent');
    });

    it('should unload agent', async () => {
      const definition: CustomAgentDefinition = {
        name: 'unload-test-agent',
        type: 'unload-test-agent',
        version: '1.0.0',
        capabilities: ['testing'],
        implementation: {
          type: 'javascript',
          main: 'index.js',
        },
      };

      const agentFile = join(tempDir, 'agent.json');
      await writeFile(agentFile, JSON.stringify(definition, null, 2));

      await loader.loadAgentFromFile(agentFile);
      
      expect(loader.getLoadedAgentTypes()).toContain('unload-test-agent');
      
      const unloaded = loader.unloadAgent('unload-test-agent');
      expect(unloaded).toBe(true);
      expect(loader.getLoadedAgentTypes()).not.toContain('unload-test-agent');
    });

    it('should handle unloading non-existent agent', () => {
      const unloaded = loader.unloadAgent('non-existent-agent');
      expect(unloaded).toBe(false);
    });
  });

  describe('Event Handling', () => {
    it('should emit load events', async () => {
      const events: any[] = [];
      
      loader.on('agentLoad', (event) => {
        events.push(event);
      });

      const definition: CustomAgentDefinition = {
        name: 'event-test-agent',
        type: 'event-test-agent',
        version: '1.0.0',
        capabilities: ['testing'],
        implementation: {
          type: 'javascript',
          main: 'index.js',
        },
      };

      const agentFile = join(tempDir, 'agent.json');
      await writeFile(agentFile, JSON.stringify(definition, null, 2));

      await loader.loadAgentFromFile(agentFile);
      
      expect(events).toHaveLength(2); // loading and loaded events
      expect(events.some(e => e.type === 'loading')).toBe(true);
      expect(events.some(e => e.type === 'loaded')).toBe(true);
    });

    it('should emit error events for invalid agents', async () => {
      const events: any[] = [];
      
      loader.on('agentLoad', (event) => {
        events.push(event);
      });

      const invalidFile = join(tempDir, 'invalid.json');
      await writeFile(invalidFile, '{ "invalid": "json" }');

      await loader.loadAgentFromFile(invalidFile);
      
      expect(events.some(e => e.type === 'error')).toBe(true);
    });
  });

  describe('Shutdown Process', () => {
    it('should shutdown cleanly', async () => {
      const definition: CustomAgentDefinition = {
        name: 'shutdown-test-agent',
        type: 'shutdown-test-agent',
        version: '1.0.0',
        capabilities: ['testing'],
        implementation: {
          type: 'javascript',
          main: 'index.js',
        },
      };

      const agentFile = join(tempDir, 'agent.json');
      await writeFile(agentFile, JSON.stringify(definition, null, 2));

      await loader.loadAgentFromFile(agentFile);
      
      expect(loader.getLoadedAgentTypes()).toContain('shutdown-test-agent');
      
      await loader.shutdown();
      
      expect(loader.getLoadedAgentTypes()).toHaveLength(0);
    });
  });
});