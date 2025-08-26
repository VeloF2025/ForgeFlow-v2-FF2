import { EventEmitter } from 'events';
import PQueue from 'p-queue';
import type { Agent, AgentConfig, AgentMetrics } from '../types';
import { LogContext } from '@utils/logger';
import { StrategicPlannerAgent } from './strategic-planner';
import { SystemArchitectAgent } from './system-architect';
import { CodeImplementerAgent } from './code-implementer';
import { TestCoverageValidatorAgent } from './test-coverage-validator';
import { SecurityAuditorAgent } from './security-auditor';
import { PerformanceOptimizerAgent } from './performance-optimizer';
import { UIUXOptimizerAgent } from './ui-ux-optimizer';
import { DatabaseArchitectAgent } from './database-architect';
import { DeploymentAutomationAgent } from './deployment-automation';
import { CodeQualityReviewerAgent } from './code-quality-reviewer';
import { AntiHallucinationValidatorAgent } from './antihallucination-validator';
import { GitHubWorkflowAutomationAgent } from './github-workflow-automation';
import type { PluginManagerConfig, PluginExecutionContext } from './plugin-manager';
import { PluginManager } from './plugin-manager';
import type { CustomAgentPlugin, SecurityPermission } from './agent-definition-schema';

export class AgentPool extends EventEmitter {
  private config: AgentConfig;
  private agents: Map<string, Agent[]>;
  private activeAgents: Map<string, Agent>;
  private metrics: Map<string, AgentMetrics>;
  private queue: PQueue;
  private logger: LogContext;
  private agentFactories: Map<string, () => Agent | Promise<Agent>>;
  // 🟢 WORKING: Custom agent support
  private pluginManager?: PluginManager;
  private customAgentTypes: Set<string>;
  // 🟢 WORKING: Real-time agent activity tracking
  private agentActivity: Map<
    string,
    {
      status: 'idle' | 'busy' | 'error';
      currentTask?: string;
      lastActive: Date;
      startTime?: Date;
    }
  >;
  private agentTaskHistory: Map<
    string,
    Array<{
      taskId: string;
      startTime: Date;
      endTime?: Date;
      success?: boolean;
      duration?: number;
    }>
  >;

  constructor(config: AgentConfig, pluginManagerConfig?: PluginManagerConfig) {
    super();
    this.config = config;
    this.logger = new LogContext('AgentPool');
    this.agents = new Map();
    this.activeAgents = new Map();
    this.metrics = new Map();
    this.customAgentTypes = new Set();
    // 🟢 WORKING: Initialize real-time tracking
    this.agentActivity = new Map();
    this.agentTaskHistory = new Map();

    // 🟢 WORKING: Initialize plugin manager if config provided
    if (pluginManagerConfig) {
      this.initializePluginManager(pluginManagerConfig);
    }

    this.queue = new PQueue({
      concurrency: config.maxConcurrent,
      timeout: config.timeout,
    });

    this.agentFactories = new Map();
    this.registerAgentFactories();
    // Note: initializeAgentPools() should be called after construction via initialize() method
  }

  // 🟢 WORKING: Public initialization method
  public async initialize(): Promise<void> {
    await this.initializeAgentPools();
    
    // 🔗 CRITICAL: Ensure GitHub Workflow Automation Agent is always available
    await this.ensureGitHubAgentAvailability();
  }

  // 🔗 CRITICAL: Fail-safe to guarantee GitHub Workflow Automation Agent is never forgotten
  private async ensureGitHubAgentAvailability(): Promise<void> {
    const githubAgentType = 'github-workflow-automation';
    
    try {
      // Verify the agent is registered
      if (!this.agentFactories.has(githubAgentType)) {
        this.logger.error('🚨 CRITICAL: GitHub Workflow Automation Agent missing from factories!');
        // Force re-register as fail-safe
        this.agentFactories.set(githubAgentType, () => new GitHubWorkflowAutomationAgent());
      }

      // Ensure agent pool exists
      if (!this.agents.has(githubAgentType) || this.agents.get(githubAgentType)!.length === 0) {
        this.logger.warn('⚠️ GitHub Workflow Automation Agent pool missing, creating...');
        const agent = this.agentFactories.get(githubAgentType)!();
        await agent.initialize();
        
        if (!this.agents.has(githubAgentType)) {
          this.agents.set(githubAgentType, []);
        }
        this.agents.get(githubAgentType)!.push(agent);
      }

      // Initialize metrics if missing
      if (!this.metrics.has(githubAgentType)) {
        this.metrics.set(githubAgentType, {
          tasksCompleted: 0,
          tasksInProgress: 0,
          tasksFailed: 0,
          averageExecutionTime: 0,
          lastTaskTime: new Date(),
        });
      }

      this.logger.info('✅ GitHub Workflow Automation Agent availability verified (HARDCODED)');
    } catch (error) {
      this.logger.error('🚨 CRITICAL: Failed to ensure GitHub agent availability:', error);
      throw new Error('GitHub Workflow Automation Agent initialization failed - this is a critical system failure');
    }
  }

  // 🟢 WORKING: Initialize plugin manager for custom agents
  private async initializePluginManager(config: PluginManagerConfig): Promise<void> {
    try {
      this.pluginManager = new PluginManager(config);

      // 🟢 WORKING: Listen for plugin events
      this.pluginManager.on('pluginRegistered', this.handlePluginRegistered.bind(this));
      this.pluginManager.on('pluginError', this.handlePluginError.bind(this));
      this.pluginManager.on('agentLoadEvent', this.handleAgentLoadEvent.bind(this));

      this.logger.info('Plugin manager initialized for custom agents');
    } catch (error) {
      this.logger.error('Failed to initialize plugin manager', error);
      // Continue without custom agents
    }
  }

  // 🟢 WORKING: Handle plugin registration
  private async handlePluginRegistered(plugin: CustomAgentPlugin): Promise<void> {
    const agentType = plugin.definition.type;
    this.customAgentTypes.add(agentType);

    // 🟢 WORKING: Create factory for custom agent
    this.agentFactories.set(agentType, async () => await this.createCustomAgentInstance(agentType));

    // 🟢 WORKING: Initialize pool for custom agent
    await this.initializeCustomAgentPool(agentType, plugin);

    this.logger.info(`Registered custom agent: ${plugin.definition.name} (${agentType})`);
  }

  // 🟢 WORKING: Handle plugin errors
  private handlePluginError(event: { plugin: CustomAgentPlugin; error: Error }): void {
    this.logger.error(`Plugin error for ${event.plugin.definition.type}`, event.error);
  }

  // 🟢 WORKING: Handle agent load events
  private handleAgentLoadEvent(event: any): void {
    this.logger.debug(`Custom agent load event: ${event.type} - ${event.agentType}`);
  }

  // 🟢 WORKING: Initialize pool for custom agent
  private async initializeCustomAgentPool(
    agentType: string,
    plugin: CustomAgentPlugin,
  ): Promise<void> {
    const pool: Agent[] = [];

    // 🟢 WORKING: Create initial instances (fewer for custom agents)
    const initialInstances = 1; // Start with 1, can scale up

    for (let i = 0; i < initialInstances; i++) {
      try {
        const agent = await this.createCustomAgentInstance(agentType);
        if (agent) {
          pool.push(agent);

          // 🟢 WORKING: Initialize agent activity tracking
          this.agentActivity.set(agent.id, {
            status: 'idle',
            lastActive: new Date(),
          });

          this.agentTaskHistory.set(agent.id, []);
        }
      } catch (error) {
        this.logger.error(`Failed to create custom agent instance: ${agentType}`, error);
      }
    }

    this.agents.set(agentType, pool);

    // 🟢 WORKING: Initialize metrics
    this.metrics.set(agentType, {
      agentId: agentType,
      type: agentType,
      tasksCompleted: 0,
      tasksFailed: 0,
      averageTime: 0,
      successRate: 100,
      lastActive: new Date(),
    });

    this.logger.debug(
      `Initialized custom agent pool for: ${agentType} with ${pool.length} instances`,
    );
  }

  // 🟢 WORKING: Create custom agent instance
  private async createCustomAgentInstance(agentType: string): Promise<Agent | null> {
    if (!this.pluginManager) {
      this.logger.error('Plugin manager not available for custom agent creation');
      return null;
    }

    const plugin = this.pluginManager.getPluginByType(agentType);
    if (!plugin) {
      this.logger.error(`Custom agent plugin not found: ${agentType}`);
      return null;
    }

    try {
      // 🟢 WORKING: Create execution context
      const context: PluginExecutionContext = {
        pluginId: `${agentType}-${Date.now()}`,
        agentType,
        issueId: '', // Will be set during execution
        worktreeId: '', // Will be set during execution
        config: plugin.definition.configuration?.defaults || {},
        permissions: this.getAgentPermissions(plugin),
        sandbox: plugin.definition.security?.sandbox !== false,
        resources: {
          memory: plugin.definition.execution?.resources?.maxMemory || '512MB',
          cpu: plugin.definition.execution?.resources?.maxCpu || 1.0,
        },
      };

      // 🟢 WORKING: Create secure agent instance
      return await this.pluginManager.createSecureAgentInstance(agentType, context);
    } catch (error) {
      this.logger.error(`Failed to create custom agent instance: ${agentType}`, error);
      return null;
    }
  }

  // 🟢 WORKING: Get agent permissions from definition
  private getAgentPermissions(plugin: CustomAgentPlugin): SecurityPermission[] {
    const defaultPermissions: SecurityPermission[] = ['filesystem:read', 'environment:read'];
    return plugin.definition.security?.permissions || defaultPermissions;
  }

  private registerAgentFactories(): void {
    this.agentFactories.set('strategic-planner', () => new StrategicPlannerAgent());
    this.agentFactories.set('system-architect', () => new SystemArchitectAgent());
    this.agentFactories.set('code-implementer', () => new CodeImplementerAgent());
    this.agentFactories.set('test-coverage-validator', () => new TestCoverageValidatorAgent());
    this.agentFactories.set('security-auditor', () => new SecurityAuditorAgent());
    this.agentFactories.set('performance-optimizer', () => new PerformanceOptimizerAgent());
    this.agentFactories.set('ui-ux-optimizer', () => new UIUXOptimizerAgent());
    this.agentFactories.set('database-architect', () => new DatabaseArchitectAgent());
    this.agentFactories.set('deployment-automation', () => new DeploymentAutomationAgent());
    this.agentFactories.set('code-quality-reviewer', () => new CodeQualityReviewerAgent());
    this.agentFactories.set(
      'antihallucination-validator',
      () => new AntiHallucinationValidatorAgent(),
    );
    
    // 🔗 CRITICAL: GitHub Workflow Automation Agent - HARDCODED & MANDATORY
    // This agent is permanently integrated into FF2 and cannot be disabled or forgotten
    this.agentFactories.set(
      'github-workflow-automation',
      () => new GitHubWorkflowAutomationAgent(),
    );
  }

  private async initializeAgentPools(): Promise<void> {
    for (const [type, factory] of this.agentFactories) {
      const pool: Agent[] = [];

      for (let i = 0; i < 2; i++) {
        const agentResult = factory();
        const agent = agentResult instanceof Promise ? await agentResult : agentResult;
        if (agent) {
          pool.push(agent);
        }

        // 🟢 WORKING: Initialize agent activity tracking
        this.agentActivity.set(agent.id, {
          status: 'idle',
          lastActive: new Date(),
        });

        this.agentTaskHistory.set(agent.id, []);
      }

      this.agents.set(type, pool);

      this.metrics.set(type, {
        agentId: type,
        type,
        tasksCompleted: 0,
        tasksFailed: 0,
        averageTime: 0,
        successRate: 100,
        lastActive: new Date(),
      });

      this.logger.debug(`Initialized agent pool for: ${type}`);
    }
  }

  validateAgents(): void {
    this.logger.info('Validating agent pools...');

    for (const [type, pool] of this.agents) {
      if (pool.length === 0) {
        throw new Error(`No agents available for type: ${type}`);
      }

      for (const agent of pool) {
        if (agent.status === 'error') {
          this.logger.warning(`Agent ${agent.id} is in error state`);
        }
      }
    }

    this.logger.info(`Validated ${this.agents.size} agent types`);
  }

  async acquireAgent(type: string): Promise<Agent> {
    return this.queue.add(async () => {
      const pool = this.agents.get(type);
      if (!pool || pool.length === 0) {
        throw new Error(`No agents available for type: ${type}`);
      }

      let availableAgent: Agent | null = null;
      let attempts = 0;
      const maxAttempts = this.config.retryAttempts || 3;

      while (!availableAgent && attempts < maxAttempts) {
        for (const agent of pool) {
          if (agent.status === 'idle') {
            availableAgent = agent;
            break;
          }
        }

        if (!availableAgent) {
          this.logger.debug(`All ${type} agents busy, waiting... (attempt ${attempts + 1})`);
          await this.delay(1000);
          attempts++;
        }
      }

      if (!availableAgent) {
        const factory = this.agentFactories.get(type);
        if (!factory) {
          throw new Error(`No factory for agent type: ${type}`);
        }

        this.logger.info(`Creating new ${type} agent due to high demand`);
        const agentResult = factory();
        availableAgent = agentResult instanceof Promise ? await agentResult : agentResult;
        if (availableAgent) {
          pool.push(availableAgent);
        }
      }

      availableAgent.status = 'busy';
      this.activeAgents.set(availableAgent.id, availableAgent);

      // 🟢 WORKING: Update real-time activity tracking
      this.agentActivity.set(availableAgent.id, {
        status: 'busy',
        lastActive: new Date(),
      });

      this.logger.debug(`Acquired agent: ${availableAgent.id} (${type})`);
      return availableAgent;
    }) as Promise<Agent>;
  }

  releaseAgent(agent: Agent): void {
    if (!this.activeAgents.has(agent.id)) {
      this.logger.warning(`Attempted to release inactive agent: ${agent.id}`);
      return;
    }

    agent.status = 'idle';
    this.activeAgents.delete(agent.id);

    // 🟢 WORKING: Update real-time activity tracking
    const activity = this.agentActivity.get(agent.id);
    if (activity) {
      activity.status = 'idle';
      activity.currentTask = undefined;
      activity.lastActive = new Date();

      // Complete any active task in history
      if (activity.startTime) {
        const history = this.agentTaskHistory.get(agent.id) || [];
        const activeTask = history.find(
          (h) => !h.endTime && h.startTime.getTime() === activity.startTime.getTime(),
        );
        if (activeTask) {
          activeTask.endTime = new Date();
          activeTask.duration = activeTask.endTime.getTime() - activeTask.startTime.getTime();
          activeTask.success = true;
        }
        activity.startTime = undefined;
      }
    }

    this.logger.debug(`Released agent: ${agent.id}`);
  }

  releaseAll(): void {
    this.logger.info('Releasing all active agents...');

    for (const agent of this.activeAgents.values()) {
      agent.status = 'idle';

      // 🟢 WORKING: Update activity tracking for all agents
      const activity = this.agentActivity.get(agent.id);
      if (activity) {
        activity.status = 'idle';
        activity.currentTask = undefined;
        activity.lastActive = new Date();
        activity.startTime = undefined;
      }
    }

    this.activeAgents.clear();
    this.logger.info('All agents released');
  }

  updateMetrics(agentType: string, success: boolean, duration: number): void {
    const metrics = this.metrics.get(agentType);
    if (!metrics) return;

    if (success) {
      metrics.tasksCompleted++;
    } else {
      metrics.tasksFailed++;
    }

    const totalTasks = metrics.tasksCompleted + metrics.tasksFailed;
    metrics.averageTime = (metrics.averageTime * (totalTasks - 1) + duration) / totalTasks;
    metrics.successRate = (metrics.tasksCompleted / totalTasks) * 100;
    metrics.lastActive = new Date();
  }

  getMetrics(agentType?: string): AgentMetrics | AgentMetrics[] {
    if (agentType) {
      const metrics = this.metrics.get(agentType);
      if (!metrics) {
        throw new Error(`No metrics for agent type: ${agentType}`);
      }
      return metrics;
    }

    return Array.from(this.metrics.values());
  }

  getActiveAgentCount(): number {
    return this.activeAgents.size;
  }

  getAvailableAgentCount(type?: string): number {
    if (type) {
      const pool = this.agents.get(type);
      if (!pool) return 0;
      return pool.filter((a) => a.status === 'idle').length;
    }

    let total = 0;
    for (const pool of this.agents.values()) {
      total += pool.filter((a) => a.status === 'idle').length;
    }
    return total;
  }

  getAgentTypes(): string[] {
    return Array.from(this.agents.keys());
  }

  // 🟢 WORKING: Get built-in agent types
  getBuiltInAgentTypes(): string[] {
    return Array.from(this.agents.keys()).filter((type) => !this.customAgentTypes.has(type));
  }

  // 🟢 WORKING: Get custom agent types
  getCustomAgentTypes(): string[] {
    return Array.from(this.customAgentTypes);
  }

  // 🟢 WORKING: Check if agent type is custom
  isCustomAgent(agentType: string): boolean {
    return this.customAgentTypes.has(agentType);
  }

  // 🟢 WORKING: Get custom agent plugin
  getCustomAgentPlugin(agentType: string): CustomAgentPlugin | undefined {
    if (!this.pluginManager || !this.isCustomAgent(agentType)) {
      return undefined;
    }
    return this.pluginManager.getPluginByType(agentType);
  }

  // 🟢 WORKING: Reload custom agent
  async reloadCustomAgent(agentType: string): Promise<boolean> {
    if (!this.pluginManager || !this.isCustomAgent(agentType)) {
      return false;
    }

    try {
      // 🟢 WORKING: Remove existing agents from pool
      const pool = this.agents.get(agentType);
      if (pool) {
        // Release all active agents of this type
        for (const agent of pool) {
          if (this.activeAgents.has(agent.id)) {
            this.releaseAgent(agent);
          }
        }
        pool.length = 0; // Clear the pool
      }

      // 🟢 WORKING: Reload the plugin
      const reloaded = await this.pluginManager.reloadPlugin(agentType);
      if (reloaded) {
        this.logger.info(`Successfully reloaded custom agent: ${agentType}`);
      }

      return reloaded;
    } catch (error) {
      this.logger.error(`Failed to reload custom agent: ${agentType}`, error);
      return false;
    }
  }

  // 🟢 WORKING: Get plugin manager statistics
  getCustomAgentStats(): {
    totalCustomAgents: number;
    loadedPlugins: string[];
    activeSandboxes: number;
  } {
    if (!this.pluginManager) {
      return {
        totalCustomAgents: 0,
        loadedPlugins: [],
        activeSandboxes: 0,
      };
    }

    return {
      totalCustomAgents: this.customAgentTypes.size,
      loadedPlugins: this.pluginManager.getLoadedPlugins().map((p) => p.definition.type),
      activeSandboxes: this.pluginManager.getActiveSandboxes().length,
    };
  }

  // 🟢 WORKING: New methods for real-time agent status tracking

  /**
   * Start tracking a task for an agent
   */
  startAgentTask(agentId: string, taskId: string): void {
    const activity = this.agentActivity.get(agentId);
    if (activity) {
      activity.status = 'busy';
      activity.currentTask = taskId;
      activity.lastActive = new Date();
      activity.startTime = new Date();

      // Add to task history
      const history = this.agentTaskHistory.get(agentId) || [];
      history.push({
        taskId,
        startTime: activity.startTime,
      });
      this.agentTaskHistory.set(agentId, history);

      this.logger.debug(`Agent ${agentId} started task ${taskId}`);
    }
  }

  /**
   * Complete a task for an agent
   */
  completeAgentTask(agentId: string, taskId: string, success: boolean = true): void {
    const activity = this.agentActivity.get(agentId);
    const history = this.agentTaskHistory.get(agentId) || [];

    if (activity && activity.currentTask === taskId) {
      const endTime = new Date();
      activity.lastActive = endTime;

      // Update task in history
      const task = history.find((h) => h.taskId === taskId && !h.endTime);
      if (task) {
        task.endTime = endTime;
        task.success = success;
        task.duration = endTime.getTime() - task.startTime.getTime();
      }

      this.logger.debug(
        `Agent ${agentId} completed task ${taskId} (${success ? 'success' : 'failed'})`,
      );
    }
  }

  /**
   * Set agent to error state
   */
  setAgentError(agentId: string, error?: string): void {
    const activity = this.agentActivity.get(agentId);
    if (activity) {
      activity.status = 'error';
      activity.lastActive = new Date();

      this.logger.error(`Agent ${agentId} error: ${error || 'Unknown error'}`);
    }
  }

  /**
   * Get all agents with their real-time status
   */
  getAllAgentsWithStatus(): Array<{
    id: string;
    type: string;
    status: 'idle' | 'busy' | 'error';
    currentTask?: string;
    lastActive: Date;
  }> {
    const result: Array<{
      id: string;
      type: string;
      status: 'idle' | 'busy' | 'error';
      currentTask?: string;
      lastActive: Date;
    }> = [];

    for (const [type, pool] of this.agents) {
      for (const agent of pool) {
        const activity = this.agentActivity.get(agent.id);
        if (activity) {
          result.push({
            id: agent.id,
            type,
            status: activity.status,
            currentTask: activity.currentTask,
            lastActive: activity.lastActive,
          });
        }
      }
    }

    return result;
  }

  /**
   * Get agent task history
   */
  getAgentTaskHistory(agentId: string): Array<{
    taskId: string;
    startTime: Date;
    endTime?: Date;
    success?: boolean;
    duration?: number;
  }> {
    return this.agentTaskHistory.get(agentId) || [];
  }

  /**
   * Get real-time count of busy agents by type
   */
  getBusyAgentCount(type?: string): number {
    if (type) {
      const pool = this.agents.get(type);
      if (!pool) return 0;

      return pool.filter((agent) => {
        const activity = this.agentActivity.get(agent.id);
        return activity?.status === 'busy';
      }).length;
    }

    let total = 0;
    for (const [, pool] of this.agents) {
      total += pool.filter((agent) => {
        const activity = this.agentActivity.get(agent.id);
        return activity?.status === 'busy';
      }).length;
    }
    return total;
  }

  /**
   * Get real-time count of error agents
   */
  getErrorAgentCount(type?: string): number {
    if (type) {
      const pool = this.agents.get(type);
      if (!pool) return 0;

      return pool.filter((agent) => {
        const activity = this.agentActivity.get(agent.id);
        return activity?.status === 'error';
      }).length;
    }

    let total = 0;
    for (const [, pool] of this.agents) {
      total += pool.filter((agent) => {
        const activity = this.agentActivity.get(agent.id);
        return activity?.status === 'error';
      }).length;
    }
    return total;
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down agent pool...');

    await this.queue.onIdle();
    this.queue.clear();

    this.releaseAll();

    // 🟢 WORKING: Shutdown plugin manager
    if (this.pluginManager) {
      await this.pluginManager.shutdown();
      this.pluginManager = undefined;
    }

    for (const pool of this.agents.values()) {
      pool.length = 0;
    }

    this.agents.clear();
    this.metrics.clear();
    this.customAgentTypes.clear();

    // 🟢 WORKING: Clear activity tracking
    this.agentActivity.clear();
    this.agentTaskHistory.clear();

    this.logger.info('Agent pool shutdown complete');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
