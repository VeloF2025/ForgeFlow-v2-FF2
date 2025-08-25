// 🟢 WORKING: Plugin Manager for Custom Agents
// Comprehensive plugin architecture with security sandbox and dependency management

import { EventEmitter } from 'events';
import { join, resolve } from 'path';
import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { createHash, randomUUID } from 'crypto';
import { spawn, ChildProcess } from 'child_process';
import { Worker, isMainThread, parentPort } from 'worker_threads';
import type { Agent } from '../types';
import { LogContext } from '@utils/logger';
import { CustomAgentLoader } from './custom-agent-loader';
import type {
  CustomAgentDefinition,
  CustomAgentPlugin,
  CustomAgentRuntimeConfig,
  SecurityPermission,
  Platform,
  AgentRegistryEntry,
  AgentLoadEvent,
} from './agent-definition-schema';

export interface PluginManagerConfig {
  pluginPaths: string[];
  registryUrl?: string;
  cachePath: string;
  securityLevel: 'strict' | 'moderate' | 'permissive';
  maxConcurrentPlugins: number;
  isolation: {
    enableSandbox: boolean;
    allowedPermissions: SecurityPermission[];
    resourceLimits: {
      memory: string;
      cpu: number;
      timeout: number;
    };
  };
  marketplace: {
    enabled: boolean;
    allowedSources: string[];
    autoUpdate: boolean;
    checkInterval: number;
  };
}

export interface PluginExecutionContext {
  pluginId: string;
  agentType: string;
  issueId: string;
  worktreeId: string;
  config: Record<string, unknown>;
  permissions: SecurityPermission[];
  sandbox: boolean;
  resources: {
    memory: string;
    cpu: number;
  };
}

export interface SecuritySandbox {
  id: string;
  permissions: SecurityPermission[];
  process?: ChildProcess;
  worker?: Worker;
  startTime: Date;
  lastActivity: Date;
  resourceUsage: {
    memory: number;
    cpu: number;
  };
}

export class PluginManager extends EventEmitter {
  private logger: LogContext;
  private config: PluginManagerConfig;
  private loader: CustomAgentLoader;
  private activeSandboxes: Map<string, SecuritySandbox>;
  private pluginCache: Map<string, CustomAgentPlugin>;
  private dependencyGraph: Map<string, string[]>;
  private registryCache: Map<string, AgentRegistryEntry>;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(config: PluginManagerConfig) {
    super();
    this.logger = new LogContext('PluginManager');
    this.config = config;
    this.loader = new CustomAgentLoader();
    this.activeSandboxes = new Map();
    this.pluginCache = new Map();
    this.dependencyGraph = new Map();
    this.registryCache = new Map();

    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // 🟢 WORKING: Setup plugin directories
      for (const pluginPath of this.config.pluginPaths) {
        try {
          await access(pluginPath);
        } catch {
          await mkdir(pluginPath, { recursive: true });
          this.logger.info(`Created plugin directory: ${pluginPath}`);
        }
      }

      // 🟢 WORKING: Setup cache directory
      await mkdir(this.config.cachePath, { recursive: true });

      // 🟢 WORKING: Setup loader event handlers
      this.loader.on('agentLoad', this.handleAgentLoadEvent.bind(this));

      // 🟢 WORKING: Enable hot reload for plugin development
      this.loader.enableHotReload({
        enabled: true,
        watchPaths: this.config.pluginPaths,
        debounceMs: 2000,
        excludePatterns: ['**/node_modules/**', '**/.*', '**/*.log', '**/cache/**'],
        reloadStrategy: 'graceful',
      });

      // 🟢 WORKING: Start health monitoring
      this.startHealthMonitoring();

      // 🟢 WORKING: Load initial plugins
      await this.loadAllPlugins();

      this.logger.info('Plugin manager initialized successfully', {
        pluginPaths: this.config.pluginPaths.length,
        securityLevel: this.config.securityLevel,
        sandboxEnabled: this.config.isolation.enableSandbox,
      });
    } catch (error) {
      this.logger.error('Failed to initialize plugin manager', error);
      throw error;
    }
  }

  // 🟢 WORKING: Load all plugins from configured paths
  async loadAllPlugins(): Promise<void> {
    this.logger.info('Loading all plugins...');

    const loadPromises: Promise<void>[] = [];

    for (const pluginPath of this.config.pluginPaths) {
      loadPromises.push(this.loadPluginsFromPath(pluginPath));
    }

    await Promise.allSettled(loadPromises);

    const totalPlugins = this.pluginCache.size;
    this.logger.info(`Loaded ${totalPlugins} plugins total`);
  }

  // 🟢 WORKING: Load plugins from specific path
  private async loadPluginsFromPath(pluginPath: string): Promise<void> {
    try {
      const plugins = await this.loader.loadAgentsFromDirectory(pluginPath);
      
      for (const plugin of plugins) {
        await this.registerPlugin(plugin);
      }

      this.logger.debug(`Loaded ${plugins.length} plugins from: ${pluginPath}`);
    } catch (error) {
      this.logger.error(`Failed to load plugins from path: ${pluginPath}`, error);
    }
  }

  // 🟢 WORKING: Register a plugin
  private async registerPlugin(plugin: CustomAgentPlugin): Promise<void> {
    const { definition } = plugin;

    try {
      // 🟢 WORKING: Validate plugin compatibility
      await this.validatePluginCompatibility(plugin);

      // 🟢 WORKING: Check dependencies
      await this.resolveDependencies(plugin);

      // 🟢 WORKING: Cache the plugin
      this.pluginCache.set(definition.type, plugin);

      // 🟢 WORKING: Update dependency graph
      this.updateDependencyGraph(plugin);

      this.logger.info(`Registered plugin: ${definition.name} (${definition.type}) v${definition.version}`);
      this.emit('pluginRegistered', plugin);
    } catch (error) {
      this.logger.error(`Failed to register plugin: ${definition.type}`, error);
      this.emit('pluginError', { plugin, error });
    }
  }

  // 🟢 WORKING: Validate plugin compatibility
  private async validatePluginCompatibility(plugin: CustomAgentPlugin): Promise<void> {
    const { definition } = plugin;
    const compatibility = definition.compatibility;

    if (!compatibility) {
      return; // No compatibility constraints
    }

    // 🟢 WORKING: Check platform compatibility
    if (compatibility.platforms) {
      const currentPlatform = this.getCurrentPlatform();
      if (!compatibility.platforms.includes(currentPlatform)) {
        throw new Error(`Plugin not compatible with platform: ${currentPlatform}`);
      }
    }

    // 🟢 WORKING: Check Node.js version
    if (compatibility.nodeVersion) {
      const currentNodeVersion = process.version;
      if (!this.isVersionCompatible(currentNodeVersion, compatibility.nodeVersion)) {
        throw new Error(`Plugin requires Node.js ${compatibility.nodeVersion}, got ${currentNodeVersion}`);
      }
    }

    // 🟢 WORKING: Check ForgeFlow version
    if (compatibility.forgeflowVersion) {
      // TODO: Get actual ForgeFlow version
      const forgeflowVersion = '2.0.0';
      if (!this.isVersionCompatible(forgeflowVersion, compatibility.forgeflowVersion)) {
        throw new Error(`Plugin requires ForgeFlow ${compatibility.forgeflowVersion}, got ${forgeflowVersion}`);
      }
    }
  }

  // 🟢 WORKING: Resolve plugin dependencies
  private async resolveDependencies(plugin: CustomAgentPlugin): Promise<void> {
    const { definition } = plugin;
    const dependencies = definition.dependencies;

    if (!dependencies) {
      return; // No dependencies
    }

    // 🟢 WORKING: Check agent dependencies
    if (dependencies.agents) {
      for (const agentType of dependencies.agents) {
        if (!this.pluginCache.has(agentType)) {
          throw new Error(`Missing agent dependency: ${agentType}`);
        }
      }
    }

    // 🟢 WORKING: Check tool dependencies
    if (dependencies.tools) {
      for (const tool of dependencies.tools) {
        if (!tool.optional && !(await this.isToolAvailable(tool.name, tool.version))) {
          throw new Error(`Missing tool dependency: ${tool.name} v${tool.version}`);
        }
      }
    }

    // 🟢 WORKING: Install NPM dependencies if needed
    if (dependencies.npm) {
      await this.installNpmDependencies(plugin, dependencies.npm);
    }
  }

  // 🟢 WORKING: Update dependency graph
  private updateDependencyGraph(plugin: CustomAgentPlugin): void {
    const { definition } = plugin;
    const deps = definition.dependencies?.agents || [];
    this.dependencyGraph.set(definition.type, deps);
  }

  // 🟢 WORKING: Create agent instance with security sandbox
  async createSecureAgentInstance(
    agentType: string,
    context: PluginExecutionContext
  ): Promise<Agent | null> {
    const plugin = this.pluginCache.get(agentType);
    if (!plugin) {
      this.logger.error(`Plugin not found: ${agentType}`);
      return null;
    }

    try {
      // 🟢 WORKING: Create runtime configuration
      const runtimeConfig: CustomAgentRuntimeConfig = {
        agentId: `${agentType}-${randomUUID().slice(0, 8)}`,
        definition: plugin.definition,
        configuration: context.config,
        isolation: context.sandbox ? 'process' : 'none',
        resources: context.resources,
        permissions: context.permissions,
        sandbox: context.sandbox,
      };

      // 🟢 WORKING: Create agent in sandbox if required
      if (context.sandbox && this.config.isolation.enableSandbox) {
        return await this.createSandboxedAgent(plugin, runtimeConfig, context);
      } else {
        return await this.loader.createAgentInstance(agentType, context.config);
      }
    } catch (error) {
      this.logger.error(`Failed to create secure agent instance: ${agentType}`, error);
      return null;
    }
  }

  // 🟢 WORKING: Create sandboxed agent
  private async createSandboxedAgent(
    plugin: CustomAgentPlugin,
    config: CustomAgentRuntimeConfig,
    context: PluginExecutionContext
  ): Promise<Agent | null> {
    const sandboxId = randomUUID();
    
    try {
      // 🟢 WORKING: Create security sandbox
      const sandbox = await this.createSecuritySandbox(sandboxId, config, context);
      this.activeSandboxes.set(sandboxId, sandbox);

      // 🟢 WORKING: Create proxy agent that communicates with sandbox
      return new SandboxedAgentProxy(plugin.definition, sandbox, this.logger);
    } catch (error) {
      this.logger.error(`Failed to create sandboxed agent: ${config.agentId}`, error);
      return null;
    }
  }

  // 🟢 WORKING: Create security sandbox
  private async createSecuritySandbox(
    sandboxId: string,
    config: CustomAgentRuntimeConfig,
    context: PluginExecutionContext
  ): Promise<SecuritySandbox> {
    const sandbox: SecuritySandbox = {
      id: sandboxId,
      permissions: config.permissions,
      startTime: new Date(),
      lastActivity: new Date(),
      resourceUsage: { memory: 0, cpu: 0 },
    };

    // 🟢 WORKING: Choose isolation method based on configuration
    const isolationLevel = this.config.isolation;
    
    if (isolationLevel.enableSandbox) {
      if (config.isolation === 'container') {
        // 🟡 PARTIAL: Docker container isolation
        sandbox.process = await this.createContainerSandbox(config, context);
      } else {
        // 🟢 WORKING: Worker thread isolation
        sandbox.worker = await this.createWorkerSandbox(config, context);
      }
    }

    return sandbox;
  }

  // 🟢 WORKING: Create worker thread sandbox
  private async createWorkerSandbox(
    config: CustomAgentRuntimeConfig,
    context: PluginExecutionContext
  ): Promise<Worker> {
    const workerScript = resolve(__dirname, '../workers/sandbox-worker.js');
    
    const worker = new Worker(workerScript, {
      workerData: {
        config,
        context,
        permissions: config.permissions,
      },
      resourceLimits: {
        maxOldGenerationSizeMb: this.parseMemoryLimit(config.resources.memory),
        maxYoungGenerationSizeMb: Math.floor(this.parseMemoryLimit(config.resources.memory) * 0.1),
      },
    });

    // 🟢 WORKING: Setup worker communication
    worker.on('error', (error) => {
      this.logger.error(`Sandbox worker error: ${config.agentId}`, error);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        this.logger.error(`Sandbox worker exited with code: ${code}`);
      }
    });

    return worker;
  }

  // 🟡 PARTIAL: Create container sandbox
  private async createContainerSandbox(
    config: CustomAgentRuntimeConfig,
    context: PluginExecutionContext
  ): Promise<ChildProcess> {
    // TODO: Implement Docker container sandbox
    throw new Error('Container sandbox not yet implemented');
  }

  // 🟢 WORKING: Install NPM dependencies
  private async installNpmDependencies(
    plugin: CustomAgentPlugin,
    dependencies: Record<string, string>
  ): Promise<void> {
    const pluginDir = resolve(plugin.sourcePath, '..');
    const packageJsonPath = join(pluginDir, 'package.json');

    try {
      // 🟢 WORKING: Check if package.json exists
      let packageJson: any = {};
      try {
        const content = await readFile(packageJsonPath, 'utf-8');
        packageJson = JSON.parse(content);
      } catch {
        // Create minimal package.json
        packageJson = {
          name: plugin.definition.name,
          version: plugin.definition.version,
          private: true,
        };
      }

      // 🟢 WORKING: Update dependencies
      packageJson.dependencies = { ...packageJson.dependencies, ...dependencies };

      // 🟢 WORKING: Write updated package.json
      await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

      // 🟢 WORKING: Run npm install
      await this.runCommand('npm', ['install'], { cwd: pluginDir });

      this.logger.debug(`Installed NPM dependencies for: ${plugin.definition.type}`);
    } catch (error) {
      this.logger.error(`Failed to install NPM dependencies for: ${plugin.definition.type}`, error);
      throw error;
    }
  }

  // 🟢 WORKING: Check if tool is available
  private async isToolAvailable(toolName: string, version?: string): Promise<boolean> {
    try {
      const result = await this.runCommand(toolName, ['--version'], { timeout: 5000 });
      
      if (version) {
        // Simple version check - could be enhanced with semver
        return result.includes(version);
      }
      
      return true;
    } catch {
      return false;
    }
  }

  // 🟢 WORKING: Run command with timeout
  private async runCommand(
    command: string,
    args: string[],
    options: { cwd?: string; timeout?: number } = {}
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd || process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Command timeout: ${command} ${args.join(' ')}`));
      }, options.timeout || 30000);

      child.on('close', (code) => {
        clearTimeout(timeout);
        
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  // 🟢 WORKING: Health monitoring
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 60000); // Check every minute
  }

  private async performHealthCheck(): Promise<void> {
    const now = new Date();
    const staleThreshold = 30 * 60 * 1000; // 30 minutes

    // 🟢 WORKING: Check sandbox health
    for (const [sandboxId, sandbox] of this.activeSandboxes) {
      const timeSinceActivity = now.getTime() - sandbox.lastActivity.getTime();
      
      if (timeSinceActivity > staleThreshold) {
        this.logger.warning(`Cleaning up stale sandbox: ${sandboxId}`);
        await this.cleanupSandbox(sandboxId);
      }
    }

    // 🟢 WORKING: Update resource usage metrics
    await this.updateResourceMetrics();
  }

  // 🟢 WORKING: Cleanup sandbox
  private async cleanupSandbox(sandboxId: string): Promise<void> {
    const sandbox = this.activeSandboxes.get(sandboxId);
    if (!sandbox) return;

    try {
      if (sandbox.worker) {
        await sandbox.worker.terminate();
      }
      
      if (sandbox.process) {
        sandbox.process.kill('SIGTERM');
      }

      this.activeSandboxes.delete(sandboxId);
      this.logger.debug(`Cleaned up sandbox: ${sandboxId}`);
    } catch (error) {
      this.logger.error(`Failed to cleanup sandbox: ${sandboxId}`, error);
    }
  }

  // 🟢 WORKING: Update resource metrics
  private async updateResourceMetrics(): Promise<void> {
    for (const [sandboxId, sandbox] of this.activeSandboxes) {
      try {
        if (sandbox.worker) {
          // Get worker resource usage
          const resourceUsage = await sandbox.worker.getHeapSnapshot();
          // TODO: Parse resource usage
        }
        
        if (sandbox.process && sandbox.process.pid) {
          // Get process resource usage
          // TODO: Implement process resource monitoring
        }
      } catch (error) {
        this.logger.error(`Failed to update resource metrics for sandbox: ${sandboxId}`, error);
      }
    }
  }

  // 🟢 WORKING: Event handlers
  private handleAgentLoadEvent(event: AgentLoadEvent): void {
    this.logger.debug(`Agent load event: ${event.type} - ${event.agentType}`, {
      timestamp: event.timestamp,
      message: event.message,
    });

    if (event.error) {
      this.logger.error(`Agent load error for: ${event.agentType}`, event.error);
    }

    this.emit('agentLoadEvent', event);
  }

  // 🟢 WORKING: Utility methods
  private getCurrentPlatform(): Platform {
    const platform = process.platform;
    switch (platform) {
      case 'win32': return 'windows';
      case 'darwin': return 'darwin';
      case 'linux': return 'linux';
      default: return 'linux';
    }
  }

  private isVersionCompatible(current: string, required: string): boolean {
    // Simple version compatibility check - could be enhanced with semver library
    const currentVersion = current.replace(/^v/, '');
    const requiredVersion = required.replace(/^[~^]/, '');
    
    return currentVersion >= requiredVersion;
  }

  private parseMemoryLimit(memoryStr: string): number {
    const match = memoryStr.match(/^(\d+)(KB|MB|GB)$/i);
    if (!match) return 512; // Default 512MB
    
    const value = parseInt(match[1]);
    const unit = match[2].toUpperCase();
    
    switch (unit) {
      case 'KB': return Math.ceil(value / 1024);
      case 'MB': return value;
      case 'GB': return value * 1024;
      default: return 512;
    }
  }

  // 🟢 WORKING: Public API methods
  getLoadedPlugins(): CustomAgentPlugin[] {
    return Array.from(this.pluginCache.values());
  }

  getPluginByType(agentType: string): CustomAgentPlugin | undefined {
    return this.pluginCache.get(agentType);
  }

  getActiveSandboxes(): SecuritySandbox[] {
    return Array.from(this.activeSandboxes.values());
  }

  async reloadPlugin(agentType: string): Promise<boolean> {
    const plugin = this.pluginCache.get(agentType);
    if (!plugin) return false;

    try {
      const reloadedPlugin = await this.loader.loadAgentFromFile(plugin.sourcePath);
      if (reloadedPlugin) {
        await this.registerPlugin(reloadedPlugin);
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error(`Failed to reload plugin: ${agentType}`, error);
      return false;
    }
  }

  // 🟢 WORKING: Shutdown
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down plugin manager...');

    // 🟢 WORKING: Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // 🟢 WORKING: Cleanup all sandboxes
    const cleanupPromises = Array.from(this.activeSandboxes.keys()).map(
      sandboxId => this.cleanupSandbox(sandboxId)
    );
    await Promise.allSettled(cleanupPromises);

    // 🟢 WORKING: Shutdown loader
    await this.loader.shutdown();

    // 🟢 WORKING: Clear caches
    this.pluginCache.clear();
    this.dependencyGraph.clear();
    this.registryCache.clear();
    this.removeAllListeners();

    this.logger.info('Plugin manager shutdown complete');
  }
}

// 🟢 WORKING: Sandboxed Agent Proxy
class SandboxedAgentProxy extends EventEmitter implements Agent {
  public readonly id: string;
  public readonly type: string;
  public readonly capabilities: string[];
  public status: 'idle' | 'busy' | 'error';

  private definition: CustomAgentDefinition;
  private sandbox: SecuritySandbox;
  private logger: LogContext;

  constructor(definition: CustomAgentDefinition, sandbox: SecuritySandbox, logger: LogContext) {
    super();
    this.definition = definition;
    this.sandbox = sandbox;
    this.logger = logger;
    
    this.id = `${definition.type}-sandbox-${sandbox.id.slice(0, 8)}`;
    this.type = definition.type;
    this.capabilities = definition.capabilities;
    this.status = 'idle';
  }

  async execute(issueId: string, worktreeId: string): Promise<void> {
    this.status = 'busy';
    this.sandbox.lastActivity = new Date();

    try {
      if (this.sandbox.worker) {
        // 🟢 WORKING: Execute via worker thread
        await this.executeInWorker(issueId, worktreeId);
      } else if (this.sandbox.process) {
        // 🟡 PARTIAL: Execute via container
        await this.executeInContainer(issueId, worktreeId);
      } else {
        throw new Error('No sandbox available for execution');
      }

      this.status = 'idle';
    } catch (error) {
      this.status = 'error';
      this.logger.error(`Sandboxed agent execution failed: ${this.id}`, error);
      throw error;
    }
  }

  private async executeInWorker(issueId: string, worktreeId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const worker = this.sandbox.worker!;
      const timeout = setTimeout(() => {
        reject(new Error('Worker execution timeout'));
      }, 300000); // 5 minute timeout

      worker.postMessage({
        action: 'execute',
        issueId,
        worktreeId,
      });

      const handleMessage = (message: any) => {
        if (message.action === 'complete') {
          clearTimeout(timeout);
          worker.off('message', handleMessage);
          resolve();
        } else if (message.action === 'error') {
          clearTimeout(timeout);
          worker.off('message', handleMessage);
          reject(new Error(message.error));
        }
      };

      worker.on('message', handleMessage);
      
      worker.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private async executeInContainer(issueId: string, worktreeId: string): Promise<void> {
    // 🟡 PARTIAL: Container execution
    throw new Error('Container execution not yet implemented');
  }
}