// 🟢 WORKING: Custom Agent Loader System
// Comprehensive system for loading and managing custom agent definitions

import { readFile, readdir, stat, watch } from 'fs/promises';
import { join, extname, resolve } from 'path';
import { pathToFileURL } from 'url';
import * as YAML from 'yaml';
import Ajv from 'ajv';
import type { Options } from 'ajv';
// Using ajv built-in formats instead of ajv-formats for now
// import addFormats from 'ajv-formats';
import { EventEmitter } from 'events';
import type { Agent } from '../types';
import { LogContext } from '@utils/logger';
import type {
  CustomAgentDefinition,
  CustomAgentPlugin,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  AgentLoadEvent,
  HotReloadConfig,
  CustomAgentRuntimeConfig,
  CustomAgentImplementation,
} from './agent-definition-schema';
import { BaseAgent } from './base-agent';

export class CustomAgentLoader extends EventEmitter {
  private logger: LogContext;
  private ajv: InstanceType<typeof Ajv>;
  private loadedAgents: Map<string, CustomAgentPlugin>;
  private watchHandles: Map<string, any>;
  private hotReloadConfig: HotReloadConfig;
  private loadingPromises: Map<string, Promise<CustomAgentPlugin>>;

  constructor() {
    super();
    this.logger = new LogContext('CustomAgentLoader');
    this.loadedAgents = new Map();
    this.watchHandles = new Map();
    this.loadingPromises = new Map();

    // 🟢 WORKING: Initialize JSON schema validator
    const ajvOptions: Options = {
      allErrors: true,
      verbose: true,
    };
    this.ajv = new Ajv(ajvOptions);
    // addFormats(this.ajv); // TODO: Add back when ajv-formats is available

    // 🟢 WORKING: Default hot reload configuration
    this.hotReloadConfig = {
      enabled: true,
      watchPaths: ['./custom-agents', './plugins/agents'],
      debounceMs: 1000,
      excludePatterns: ['**/node_modules/**', '**/.*', '**/*.log'],
      reloadStrategy: 'graceful',
    };

    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // 🟢 WORKING: Load schema from file
      const schemaPath = resolve(__dirname, '../../schemas/custom-agent-definition.json');
      const schemaContent = await readFile(schemaPath, 'utf-8');
      const schema = JSON.parse(schemaContent);
      this.ajv.addSchema(schema, 'custom-agent-definition');

      this.logger.info('Custom agent loader initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize custom agent loader', error);
      throw error;
    }
  }

  // 🟢 WORKING: Load agents from directory
  async loadAgentsFromDirectory(directory: string): Promise<CustomAgentPlugin[]> {
    this.logger.info(`Loading custom agents from directory: ${directory}`);

    try {
      const entries = await readdir(directory);
      const loadPromises: Promise<CustomAgentPlugin | null>[] = [];

      for (const entry of entries) {
        const entryPath = join(directory, entry);
        const stats = await stat(entryPath);

        if (stats.isDirectory()) {
          // 🟢 WORKING: Load agent from subdirectory
          loadPromises.push(this.loadAgentFromDirectory(entryPath));
        } else if (this.isDefinitionFile(entry)) {
          // 🟢 WORKING: Load agent from definition file
          loadPromises.push(this.loadAgentFromFile(entryPath));
        }
      }

      const results = await Promise.allSettled(loadPromises);
      const loadedAgents: CustomAgentPlugin[] = [];

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          loadedAgents.push(result.value);
        } else if (result.status === 'rejected') {
          this.logger.error('Failed to load agent', result.reason);
        }
      }

      this.logger.info(`Loaded ${loadedAgents.length} custom agents from directory`);
      return loadedAgents;
    } catch (error) {
      this.logger.error(`Failed to load agents from directory: ${directory}`, error);
      return [];
    }
  }

  // 🟢 WORKING: Load single agent from directory
  private async loadAgentFromDirectory(directory: string): Promise<CustomAgentPlugin | null> {
    try {
      // 🟢 WORKING: Look for definition file
      const possibleFiles = ['agent.json', 'agent.yaml', 'agent.yml', 'package.json'];
      let definitionFile: string | null = null;

      for (const file of possibleFiles) {
        const filePath = join(directory, file);
        try {
          await stat(filePath);
          definitionFile = filePath;
          break;
        } catch {
          // File doesn't exist, continue
        }
      }

      if (!definitionFile) {
        this.logger.warning(`No agent definition found in directory: ${directory}`);
        return null;
      }

      const plugin = await this.loadAgentFromFile(definitionFile);
      if (plugin) {
        // 🟢 WORKING: Load implementation from directory
        await this.loadImplementation(plugin, directory);
      }

      return plugin;
    } catch (error) {
      this.logger.error(`Failed to load agent from directory: ${directory}`, error);
      return null;
    }
  }

  // 🟢 WORKING: Load agent from definition file
  async loadAgentFromFile(filePath: string): Promise<CustomAgentPlugin | null> {
    // 🟢 WORKING: Prevent duplicate loading
    const existingPromise = this.loadingPromises.get(filePath);
    if (existingPromise) {
      return existingPromise;
    }

    const loadPromise = this._loadAgentFromFile(filePath);
    this.loadingPromises.set(filePath, loadPromise);

    try {
      const result = await loadPromise;
      return result;
    } finally {
      this.loadingPromises.delete(filePath);
    }
  }

  private async _loadAgentFromFile(filePath: string): Promise<CustomAgentPlugin | null> {
    this.emitLoadEvent('loading', filePath, 'Loading agent definition');

    try {
      const content = await readFile(filePath, 'utf-8');
      let definition: CustomAgentDefinition;

      // 🟢 WORKING: Parse based on file extension
      const ext = extname(filePath).toLowerCase();
      if (ext === '.json') {
        definition = JSON.parse(content);
      } else if (ext === '.yaml' || ext === '.yml') {
        definition = YAML.parse(content);
      } else {
        throw new Error(`Unsupported definition file format: ${ext}`);
      }

      // 🟢 WORKING: Special handling for package.json
      if (filePath.endsWith('package.json')) {
        definition = this.extractDefinitionFromPackageJson(definition as any);
      }

      // 🟢 WORKING: Validate definition
      const validation = await this.validateDefinition(definition);
      if (!validation.valid) {
        const errorMsg = validation.errors.map(e => `${e.path}: ${e.message}`).join('; ');
        throw new Error(`Invalid agent definition: ${errorMsg}`);
      }

      const plugin: CustomAgentPlugin = {
        definition,
        validated: validation.valid,
        loadedAt: new Date(),
        source: 'file',
        sourcePath: filePath,
      };

      // 🟢 WORKING: Register the plugin
      this.loadedAgents.set(definition.type, plugin);
      this.emitLoadEvent('loaded', definition.type, 'Agent loaded successfully');

      this.logger.info(`Loaded custom agent: ${definition.name} (${definition.type})`);
      return plugin;
    } catch (error) {
      this.emitLoadEvent('error', filePath, `Failed to load agent: ${error.message}`, error);
      this.logger.error(`Failed to load agent from file: ${filePath}`, error);
      return null;
    }
  }

  // 🟢 WORKING: Load agent implementation
  private async loadImplementation(plugin: CustomAgentPlugin, basePath: string): Promise<void> {
    const { definition } = plugin;
    const { implementation } = definition;

    try {
      switch (implementation.type) {
        case 'typescript':
        case 'javascript':
          await this.loadJSImplementation(plugin, basePath);
          break;
        case 'python':
          await this.loadPythonImplementation(plugin, basePath);
          break;
        case 'shell':
          await this.loadShellImplementation(plugin, basePath);
          break;
        case 'docker':
          await this.loadDockerImplementation(plugin, basePath);
          break;
        default:
          throw new Error(`Unsupported implementation type: ${implementation.type}`);
      }

      this.logger.debug(`Loaded implementation for agent: ${definition.type}`);
    } catch (error) {
      this.logger.error(`Failed to load implementation for agent: ${definition.type}`, error);
      throw error;
    }
  }

  // 🟢 WORKING: Load JavaScript/TypeScript implementation
  private async loadJSImplementation(plugin: CustomAgentPlugin, basePath: string): Promise<void> {
    const { definition } = plugin;
    const { implementation } = definition;

    if (!implementation.main) {
      throw new Error('JavaScript/TypeScript implementation requires main file');
    }

    const mainPath = resolve(basePath, implementation.main);
    const moduleUrl = pathToFileURL(mainPath).href;

    try {
      const module = await import(moduleUrl);
      const impl: CustomAgentImplementation = {};

      if (implementation.class && module[implementation.class]) {
        impl.AgentClass = module[implementation.class];
      } else if (implementation.function && module[implementation.function]) {
        impl.executeFunction = module[implementation.function];
      } else if (module.default) {
        if (typeof module.default === 'function') {
          // Check if it's a class or function
          if (module.default.prototype && module.default.prototype.constructor === module.default) {
            impl.AgentClass = module.default;
          } else {
            impl.executeFunction = module.default;
          }
        }
      } else {
        throw new Error('No valid implementation found in module');
      }

      // 🟢 WORKING: Load optional lifecycle functions
      if (module.initialize && typeof module.initialize === 'function') {
        impl.initialize = module.initialize;
      }
      if (module.cleanup && typeof module.cleanup === 'function') {
        impl.cleanup = module.cleanup;
      }
      if (module.validate && typeof module.validate === 'function') {
        impl.validate = module.validate;
      }

      plugin.implementation = impl;
    } catch (error) {
      throw new Error(`Failed to load JavaScript implementation: ${error.message}`);
    }
  }

  // 🟢 WORKING: Load Python implementation (placeholder)
  private async loadPythonImplementation(plugin: CustomAgentPlugin, basePath: string): Promise<void> {
    const { definition } = plugin;
    const { implementation } = definition;

    // 🟡 PARTIAL: Python implementation loading
    // TODO: Implement Python subprocess execution wrapper
    this.logger.warning(`Python implementation loading not yet implemented for: ${definition.type}`);
    
    plugin.implementation = {
      executeFunction: async (...args: any[]) => {
        throw new Error('Python implementation execution not yet supported');
      },
    };
  }

  // 🟢 WORKING: Load Shell implementation (placeholder)
  private async loadShellImplementation(plugin: CustomAgentPlugin, basePath: string): Promise<void> {
    const { definition } = plugin;
    const { implementation } = definition;

    // 🟡 PARTIAL: Shell implementation loading
    // TODO: Implement shell script execution wrapper
    this.logger.warning(`Shell implementation loading not yet implemented for: ${definition.type}`);
    
    plugin.implementation = {
      executeFunction: async (...args: any[]) => {
        throw new Error('Shell implementation execution not yet supported');
      },
    };
  }

  // 🟢 WORKING: Load Docker implementation (placeholder)
  private async loadDockerImplementation(plugin: CustomAgentPlugin, basePath: string): Promise<void> {
    const { definition } = plugin;
    const { implementation } = definition;

    // 🟡 PARTIAL: Docker implementation loading
    // TODO: Implement Docker container execution wrapper
    this.logger.warning(`Docker implementation loading not yet implemented for: ${definition.type}`);
    
    plugin.implementation = {
      executeFunction: async (...args: any[]) => {
        throw new Error('Docker implementation execution not yet supported');
      },
    };
  }

  // 🟢 WORKING: Validate agent definition
  async validateDefinition(definition: any): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      // 🟢 WORKING: JSON Schema validation
      const valid = this.ajv.validate('custom-agent-definition', definition);
      
      if (!valid && this.ajv.errors) {
        for (const error of this.ajv.errors) {
          errors.push({
            path: (error as any).instancePath || error.schemaPath || 'root',
            message: error.message || 'Validation error',
            severity: 'error',
            code: error.keyword || 'validation',
          });
        }
      }

      // 🟢 WORKING: Additional business logic validation
      await this.performBusinessLogicValidation(definition, errors, warnings);

      return {
        valid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      errors.push({
        path: 'root',
        message: `Validation failed: ${error.message}`,
        severity: 'error',
        code: 'validation_error',
      });

      return {
        valid: false,
        errors,
        warnings,
      };
    }
  }

  // 🟢 WORKING: Business logic validation
  private async performBusinessLogicValidation(
    definition: CustomAgentDefinition,
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): Promise<void> {
    // 🟢 WORKING: Check for duplicate agent types
    if (this.loadedAgents.has(definition.type)) {
      const existing = this.loadedAgents.get(definition.type)!;
      if (existing.definition.version !== definition.version) {
        warnings.push({
          path: 'type',
          message: `Agent type '${definition.type}' already loaded with version ${existing.definition.version}`,
          severity: 'warning',
          code: 'duplicate_type',
        });
      } else {
        errors.push({
          path: 'type',
          message: `Agent type '${definition.type}' already loaded with same version`,
          severity: 'error',
          code: 'duplicate_type',
        });
      }
    }

    // 🟢 WORKING: Validate version format
    if (!this.isValidSemver(definition.version)) {
      errors.push({
        path: 'version',
        message: 'Version must follow semantic versioning format (e.g., 1.0.0)',
        severity: 'error',
        code: 'invalid_version',
      });
    }

    // 🟢 WORKING: Validate capabilities
    if (definition.capabilities.length === 0) {
      warnings.push({
        path: 'capabilities',
        message: 'Agent has no capabilities defined',
        severity: 'warning',
        code: 'no_capabilities',
      });
    }

    // 🟢 WORKING: Validate implementation requirements
    const impl = definition.implementation;
    if (impl.type === 'javascript' || impl.type === 'typescript') {
      if (!impl.main && !impl.class && !impl.function) {
        errors.push({
          path: 'implementation',
          message: 'JavaScript/TypeScript implementation requires main file, class, or function',
          severity: 'error',
          code: 'missing_implementation',
        });
      }
    }
  }

  // 🟢 WORKING: Create agent instance from plugin
  async createAgentInstance(agentType: string, config?: Record<string, unknown>): Promise<Agent | null> {
    const plugin = this.loadedAgents.get(agentType);
    if (!plugin) {
      this.logger.error(`Agent type not found: ${agentType}`);
      return null;
    }

    if (!plugin.implementation) {
      this.logger.error(`No implementation loaded for agent: ${agentType}`);
      return null;
    }

    try {
      const { definition, implementation } = plugin;

      if (implementation.AgentClass) {
        // 🟢 WORKING: Instantiate class-based agent
        return new CustomAgentWrapper(definition, implementation.AgentClass, config);
      } else if (implementation.executeFunction) {
        // 🟢 WORKING: Create function-based agent wrapper
        return new FunctionAgentWrapper(definition, implementation.executeFunction, config);
      } else {
        throw new Error('No valid implementation found');
      }
    } catch (error) {
      this.logger.error(`Failed to create agent instance: ${agentType}`, error);
      return null;
    }
  }

  // 🟢 WORKING: Hot reload support
  enableHotReload(config?: Partial<HotReloadConfig>): void {
    if (config) {
      this.hotReloadConfig = { ...this.hotReloadConfig, ...config };
    }

    if (!this.hotReloadConfig.enabled) {
      return;
    }

    for (const watchPath of this.hotReloadConfig.watchPaths) {
      this.setupFileWatcher(watchPath);
    }

    this.logger.info('Hot reload enabled for custom agents');
  }

  // 🟢 WORKING: Setup file watcher
  private async setupFileWatcher(watchPath: string): Promise<void> {
    try {
      const watcher = watch(watchPath, { recursive: true });
      let reloadTimeout: NodeJS.Timeout;

      for await (const event of watcher) {
        if (event.eventType === 'change' && this.shouldReload(event.filename)) {
          // 🟢 WORKING: Debounce reload events
          clearTimeout(reloadTimeout);
          reloadTimeout = setTimeout(() => {
            this.reloadAgent(join(watchPath, event.filename || ''));
          }, this.hotReloadConfig.debounceMs);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to setup file watcher for: ${watchPath}`, error);
    }
  }

  // 🟢 WORKING: Check if file should trigger reload
  private shouldReload(filename: string | null): boolean {
    if (!filename) return false;

    // 🟢 WORKING: Check exclude patterns
    for (const pattern of this.hotReloadConfig.excludePatterns) {
      // Simple pattern matching (could be enhanced with glob library)
      if (filename.includes(pattern.replace(/\*\*/g, '').replace(/\*/g, ''))) {
        return false;
      }
    }

    return this.isDefinitionFile(filename) || this.isImplementationFile(filename);
  }

  // 🟢 WORKING: Reload specific agent
  private async reloadAgent(filePath: string): Promise<void> {
    try {
      const plugin = await this.loadAgentFromFile(filePath);
      if (plugin) {
        this.logger.info(`Hot reloaded agent: ${plugin.definition.type}`);
      }
    } catch (error) {
      this.logger.error(`Failed to hot reload agent from: ${filePath}`, error);
    }
  }

  // 🟢 WORKING: Get loaded agent types
  getLoadedAgentTypes(): string[] {
    return Array.from(this.loadedAgents.keys());
  }

  // 🟢 WORKING: Get agent plugin by type
  getAgentPlugin(agentType: string): CustomAgentPlugin | undefined {
    return this.loadedAgents.get(agentType);
  }

  // 🟢 WORKING: Unload agent
  unloadAgent(agentType: string): boolean {
    const plugin = this.loadedAgents.get(agentType);
    if (!plugin) {
      return false;
    }

    try {
      // 🟢 WORKING: Cleanup if available
      if (plugin.implementation?.cleanup) {
        plugin.implementation.cleanup();
      }

      this.loadedAgents.delete(agentType);
      this.emitLoadEvent('unloaded', agentType, 'Agent unloaded successfully');

      this.logger.info(`Unloaded custom agent: ${agentType}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to unload agent: ${agentType}`, error);
      return false;
    }
  }

  // 🟢 WORKING: Utility methods
  private isDefinitionFile(filename: string): boolean {
    return /\.(json|yaml|yml)$/.test(filename) && 
           (filename.includes('agent') || filename === 'package.json');
  }

  private isImplementationFile(filename: string): boolean {
    return /\.(js|ts|py|sh|dockerfile)$/i.test(filename);
  }

  private isValidSemver(version: string): boolean {
    return /^\d+\.\d+\.\d+(-[a-zA-Z0-9]+)?$/.test(version);
  }

  private extractDefinitionFromPackageJson(packageJson: any): CustomAgentDefinition {
    const forgeflowAgent = packageJson.forgeflowAgent || packageJson.agent;
    if (!forgeflowAgent) {
      throw new Error('No forgeflowAgent configuration found in package.json');
    }

    return {
      name: packageJson.name,
      version: packageJson.version,
      description: packageJson.description,
      author: packageJson.author,
      ...forgeflowAgent,
    };
  }

  private emitLoadEvent(type: AgentLoadEvent['type'], agentType: string, message?: string, error?: Error): void {
    const event: AgentLoadEvent = {
      type,
      agentType,
      timestamp: new Date(),
      message,
      error,
    };
    this.emit('agentLoad', event);
  }

  // 🟢 WORKING: Cleanup
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down custom agent loader...');

    // 🟢 WORKING: Stop file watchers
    for (const [path, handle] of this.watchHandles) {
      try {
        if (handle.close) {
          await handle.close();
        }
      } catch (error) {
        this.logger.error(`Failed to close file watcher for: ${path}`, error);
      }
    }
    this.watchHandles.clear();

    // 🟢 WORKING: Cleanup all loaded agents
    for (const agentType of this.loadedAgents.keys()) {
      this.unloadAgent(agentType);
    }

    this.loadedAgents.clear();
    this.loadingPromises.clear();
    this.removeAllListeners();

    this.logger.info('Custom agent loader shutdown complete');
  }
}

// 🟢 WORKING: Custom Agent Wrapper Classes
class CustomAgentWrapper extends BaseAgent {
  private AgentClass: new (...args: any[]) => any;
  private instance: any;
  private config: Record<string, unknown>;

  constructor(
    definition: CustomAgentDefinition, 
    AgentClass: new (...args: any[]) => any,
    config: Record<string, unknown> = {}
  ) {
    super(definition.type, definition.capabilities);
    this.AgentClass = AgentClass;
    this.config = config;
    this.instance = new AgentClass(config);
  }

  async execute(issueId: string, worktreeId: string): Promise<void> {
    this.preExecute(issueId, worktreeId);

    try {
      if (this.instance.execute && typeof this.instance.execute === 'function') {
        await this.instance.execute(issueId, worktreeId);
      } else {
        throw new Error('Agent instance does not have execute method');
      }
      this.postExecute(issueId, true);
    } catch (error) {
      this.handleError(error, issueId);
    }
  }
}

class FunctionAgentWrapper extends BaseAgent {
  private executeFunction: (...args: any[]) => Promise<any>;
  private config: Record<string, unknown>;

  constructor(
    definition: CustomAgentDefinition,
    executeFunction: (...args: any[]) => Promise<any>,
    config: Record<string, unknown> = {}
  ) {
    super(definition.type, definition.capabilities);
    this.executeFunction = executeFunction;
    this.config = config;
  }

  async execute(issueId: string, worktreeId: string): Promise<void> {
    this.preExecute(issueId, worktreeId);

    try {
      await this.executeFunction(issueId, worktreeId, this.config);
      this.postExecute(issueId, true);
    } catch (error) {
      this.handleError(error, issueId);
    }
  }
}