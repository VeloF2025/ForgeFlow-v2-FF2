import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import {
  ErrorHandler,
  withErrorHandling,
  AgentExecutionError,
  WorktreeError,
  ConfigurationError,
  ErrorCategory,
} from '../utils/errors';
import { GitHubIntegration } from '../integrations/github';
import { WorktreeManager } from './worktree-manager';
import { AgentPool } from '../agents/agent-pool';
import { QualityGates } from '../quality/quality-gates';
import { ProtocolEnforcer } from '../protocols/protocol-enforcer';
import { KnowledgeManager, initializeKnowledgeSystem } from '../knowledge';
import { ClaudeCodeAdapter, DEFAULT_WORKER_CONFIG } from '../workers';
import type {
  Epic,
  Issue,
  Agent,
  ExecutionPattern,
  OrchestratorConfig,
  ExecutionStatus,
  ParallelExecutionPlan,
  KnowledgeConfig,
} from '../types';

export class Orchestrator extends EventEmitter {
  private config: OrchestratorConfig;
  private github: GitHubIntegration;
  private worktreeManager: WorktreeManager;
  public agentPool: AgentPool; // 🟢 WORKING: Made public for API access
  private qualityGates: QualityGates;
  private protocolEnforcer: ProtocolEnforcer;
  private knowledgeManager: KnowledgeManager; // 🧠 NEW: Knowledge Management System
  private claudeCodeAdapter: ClaudeCodeAdapter; // 🔗 NEW: Claude Code Worker Bridge
  private activeExecutions: Map<string, ExecutionStatus>;
  private executionPatterns: Map<string, ExecutionPattern>;

  constructor(config: OrchestratorConfig) {
    super();
    this.config = config;
    this.activeExecutions = new Map();
    this.executionPatterns = new Map();
    this.initializeComponents();
  }

  private async initializeComponents(): Promise<void> {
    logger.info('Initializing ForgeFlow v2 Orchestrator...');

    try {
      await withErrorHandling(
        async () => {
          this.github = new GitHubIntegration(this.config.github);
          this.worktreeManager = new WorktreeManager(this.config.worktree);
          this.agentPool = new AgentPool(this.config.agents);
          this.qualityGates = new QualityGates(this.config.quality);
          this.protocolEnforcer = new ProtocolEnforcer(this.config.protocols);
          
          // Initialize Knowledge Management System
          this.knowledgeManager = await initializeKnowledgeSystem(this.config.knowledge);

          // Initialize Claude Code Worker Adapter Bridge
          this.claudeCodeAdapter = new ClaudeCodeAdapter(
            {
              ...DEFAULT_WORKER_CONFIG,
              communicationPort: this.config.communicationPort || DEFAULT_WORKER_CONFIG.communicationPort,
              worktreeBasePath: this.config.worktree.basePath,
              logLevel: this.config.logLevel || 'info',
            },
            this.worktreeManager,
            this.agentPool
          );

          await this.loadExecutionPatterns();
          await this.validateSystemHealth();
        },
        {
          operationName: 'orchestrator-initialization',
          category: ErrorCategory.CONFIGURATION,
          retries: 1,
          timeoutMs: 30000,
        },
      );

      logger.info('ForgeFlow v2 Orchestrator initialized successfully');
      this.emit('initialized');
    } catch (error) {
      const handledError = ErrorHandler.getInstance().handleError(error as Error);
      logger.error('Failed to initialize orchestrator', handledError);
      throw handledError;
    }
  }

  private async loadExecutionPatterns(): Promise<void> {
    const patterns: ExecutionPattern[] = [
      {
        name: 'feature-development',
        description: 'Full feature development with parallel execution',
        phases: [
          {
            name: 'Planning',
            parallel: false,
            agents: ['strategic-planner', 'system-architect'],
          },
          {
            name: 'Implementation',
            parallel: true,
            agents: ['database-architect', 'code-implementer', 'ui-ux-optimizer'],
          },
          {
            name: 'Quality',
            parallel: true,
            agents: ['test-coverage-validator', 'security-auditor', 'performance-optimizer'],
          },
          {
            name: 'Review',
            parallel: false,
            agents: ['code-quality-reviewer', 'deployment-automation'],
          },
        ],
      },
      {
        name: 'bug-fix-sprint',
        description: 'Rapid parallel bug fixing',
        phases: [
          {
            name: 'Analysis',
            parallel: false,
            agents: ['issue-analyzer'],
          },
          {
            name: 'Fixes',
            parallel: true,
            agents: ['code-implementer'],
          },
          {
            name: 'Validation',
            parallel: false,
            agents: ['test-coverage-validator', 'deployment-automation'],
          },
        ],
      },
      {
        name: 'security-audit',
        description: 'Comprehensive security analysis and remediation',
        phases: [
          {
            name: 'Scanning',
            parallel: true,
            agents: ['security-auditor'],
          },
          {
            name: 'Remediation',
            parallel: true,
            agents: ['code-implementer', 'test-coverage-validator'],
          },
          {
            name: 'Validation',
            parallel: false,
            agents: ['security-auditor', 'deployment-automation'],
          },
        ],
      },
    ];

    patterns.forEach((pattern) => {
      this.executionPatterns.set(pattern.name, pattern);
    });

    logger.info(`Loaded ${patterns.length} execution patterns`);
  }

  private async validateSystemHealth(): Promise<void> {
    const checks = [
      {
        name: 'GitHub Connection',
        fn: () => this.github.validateConnection(),
        category: ErrorCategory.GITHUB_INTEGRATION,
      },
      {
        name: 'Git Repository',
        fn: () => this.worktreeManager.validateRepository(),
        category: ErrorCategory.WORKTREE_MANAGEMENT,
      },
      {
        name: 'Agent Pool',
        fn: async () => this.agentPool.validateAgents(),
        category: ErrorCategory.AGENT_EXECUTION,
      },
      {
        name: 'Quality Gates',
        fn: async () => this.qualityGates.validateConfiguration(),
        category: ErrorCategory.QUALITY_GATES,
      },
      {
        name: 'Protocols',
        fn: async () => this.protocolEnforcer.validateProtocols(),
        category: ErrorCategory.PROTOCOL_ENFORCEMENT,
      },
      {
        name: 'Knowledge Management System',
        fn: async () => {
          // Validate knowledge manager is initialized and responsive
          const stats = await this.knowledgeManager.getStats();
          if (stats === null) {
            throw new Error('Knowledge Management System is not responding');
          }
        },
        category: ErrorCategory.CONFIGURATION,
      },
      {
        name: 'Claude Code Adapter Bridge',
        fn: async () => {
          // Validate adapter is initialized and system capacity is available
          const systemStatus = this.claudeCodeAdapter.getSystemStatus();
          if (!systemStatus.capacity.canAcceptNewTasks && systemStatus.activeTasks === 0) {
            throw new Error('Claude Code Adapter is not accepting new tasks');
          }
        },
        category: ErrorCategory.AGENT_EXECUTION,
      },
    ];

    for (const check of checks) {
      try {
        await withErrorHandling(check.fn, {
          operationName: check.name,
          category: check.category,
          retries: 2,
          timeoutMs: 10000,
        });
        logger.info(`✅ ${check.name}: OK`);
      } catch (error) {
        const handledError = ErrorHandler.getInstance().handleError(error as Error);
        logger.error(`❌ ${check.name}: FAILED`, handledError);
        throw new ConfigurationError(
          check.name,
          `System health check failed: ${handledError.message}`,
          { checkName: check.name, originalError: handledError.message },
        );
      }
    }
  }

  public async startParallelExecution(
    epicId: string,
    patternName?: string,
  ): Promise<ExecutionStatus> {
    logger.info(`Starting parallel execution for epic: ${epicId}`);

    await this.protocolEnforcer.enforcePreExecution();

    const epic = await this.github.getEpic(epicId);
    const pattern = patternName
      ? this.executionPatterns.get(patternName)
      : this.selectBestPattern(epic);

    if (!pattern) {
      throw new Error(`No suitable execution pattern found for epic: ${epicId}`);
    }

    const plan = await this.createExecutionPlan(epic, pattern);
    const executionId = this.generateExecutionId();

    const status: ExecutionStatus = {
      id: executionId,
      epicId,
      pattern: pattern.name,
      startTime: new Date(),
      status: 'running',
      progress: 0,
      phases: [],
    };

    this.activeExecutions.set(executionId, status);

    // 🟢 WORKING: Enhanced real-time status tracking
    this.emit('execution:started', status);
    this.emit('status:changed', { type: 'execution', data: status });

    this.executeParallelPlan(plan, status).catch((error) => {
      logger.error(`Execution failed for ${executionId}`, error);
      status.status = 'failed';
      status.error = error.message;
      this.emit('execution:failed', status);
    });

    return status;
  }

  private selectBestPattern(epic: Epic): ExecutionPattern | undefined {
    if (epic.labels?.includes('bug')) {
      return this.executionPatterns.get('bug-fix-sprint');
    }
    if (epic.labels?.includes('security')) {
      return this.executionPatterns.get('security-audit');
    }
    return this.executionPatterns.get('feature-development');
  }

  private async createExecutionPlan(
    epic: Epic,
    pattern: ExecutionPattern,
  ): Promise<ParallelExecutionPlan> {
    const issues = await this.github.getEpicIssues(epic.id);

    const plan: ParallelExecutionPlan = {
      epicId: epic.id,
      pattern: pattern.name,
      phases: [],
    };

    for (const phase of pattern.phases) {
      const phasePlan = {
        name: phase.name,
        parallel: phase.parallel,
        tasks: [] as Array<{ issueId: string; agentType: string; worktreeId?: string }>,
      };

      const relevantIssues = this.filterIssuesForPhase(issues, phase);

      for (const issue of relevantIssues) {
        const agentType = this.selectAgentForIssue(issue, phase.agents);
        phasePlan.tasks.push({
          issueId: issue.id,
          agentType,
        });
      }

      plan.phases.push(phasePlan);
    }

    return plan;
  }

  private filterIssuesForPhase(issues: Issue[], phase: { agents: string[] }): Issue[] {
    return issues.filter((issue) => {
      return phase.agents.some((agentType) => issue.labels?.includes(agentType));
    });
  }

  private selectAgentForIssue(issue: Issue, availableAgents: string[]): string {
    for (const agent of availableAgents) {
      if (issue.labels?.includes(agent)) {
        return agent;
      }
    }
    return availableAgents[0] || 'code-implementer';
  }

  private async executeParallelPlan(
    plan: ParallelExecutionPlan,
    status: ExecutionStatus,
  ): Promise<void> {
    for (const phase of plan.phases) {
      logger.info(`Executing phase: ${phase.name} (parallel: ${phase.parallel})`);

      const phaseStatus = {
        name: phase.name,
        startTime: new Date(),
        status: 'running' as const,
        tasks: [] as Array<{ taskId: string; status: string }>,
      };

      status.phases.push(phaseStatus);
      this.emit('phase:started', { executionId: status.id, phase: phaseStatus });

      if (phase.parallel) {
        await this.executeParallelTasks(phase.tasks, phaseStatus);
      } else {
        await this.executeSequentialTasks(phase.tasks, phaseStatus);
      }

      await this.runQualityGates(status.id, phase.name);

      (phaseStatus as any).status = 'completed';
      (phaseStatus as any).endTime = new Date();
      this.emit('phase:completed', { executionId: status.id, phase: phaseStatus });

      status.progress = this.calculateProgress(status);
      this.emit('execution:progress', status);
    }

    status.status = 'completed';
    status.endTime = new Date();
    this.emit('execution:completed', status);
  }

  private async executeParallelTasks(
    tasks: Array<{ issueId: string; agentType: string; worktreeId?: string }>,
    phaseStatus: { tasks: Array<{ taskId: string; status: string }> },
  ): Promise<void> {
    const promises = tasks.map(async (task) => {
      const worktreeId = await this.worktreeManager.createWorktree(task.issueId);
      task.worktreeId = worktreeId;

      const agent = await this.agentPool.acquireAgent(task.agentType);
      const taskStatus = { taskId: task.issueId, status: 'running' };
      phaseStatus.tasks.push(taskStatus);

      // 🟢 WORKING: Real-time agent status tracking with agent pool integration
      this.agentPool.startAgentTask(agent.id, task.issueId);
      this.emit('agent:started', {
        agentId: agent.id,
        taskId: task.issueId,
        agentType: task.agentType,
      });

      const taskStartTime = Date.now();
      try {
        // 🔗 ENHANCED: Use Claude Code Adapter for task execution
        const executionRequest = {
          taskId: `${agent.id}-${task.issueId}`,
          issueId: task.issueId,
          agentType: task.agentType,
          worktreeId,
          instructions: `Execute ${task.agentType} agent task for issue ${task.issueId}`,
          priority: 'normal' as const,
          context: {
            agentId: agent.id,
            executionPhase: 'parallel'
          }
        };

        const result = await this.claudeCodeAdapter.executeTask(executionRequest);
        taskStatus.status = result.status === 'success' ? 'completed' : 'failed';

        // 🟢 WORKING: Track agent completion in pool and emit event
        const duration = Date.now() - taskStartTime;
        const success = result.status === 'success';
        this.agentPool.completeAgentTask(agent.id, task.issueId, success);
        this.agentPool.updateMetrics(task.agentType, success, duration);
        
        if (success) {
          this.emit('agent:completed', { 
            agentId: agent.id, 
            taskId: task.issueId, 
            success: true,
            result 
          });
        } else {
          throw new Error(result.errorMessage || 'Task execution failed');
        }
      } catch (error) {
        taskStatus.status = 'failed';

        // 🟢 WORKING: Track agent failure in pool and emit event
        const duration = Date.now() - taskStartTime;
        this.agentPool.completeAgentTask(agent.id, task.issueId, false);
        this.agentPool.updateMetrics(task.agentType, false, duration);
        this.emit('agent:failed', {
          agentId: agent.id,
          taskId: task.issueId,
          error: error.message,
        });
        throw error;
      } finally {
        this.agentPool.releaseAgent(agent);
        await this.worktreeManager.cleanupWorktree(worktreeId);

        // 🟢 WORKING: Track agent release
        this.emit('agent:released', { agentId: agent.id, agentType: task.agentType });
      }
    });

    await Promise.all(promises);
  }

  private async executeSequentialTasks(
    tasks: Array<{ issueId: string; agentType: string; worktreeId?: string }>,
    phaseStatus: { tasks: Array<{ taskId: string; status: string }> },
  ): Promise<void> {
    for (const task of tasks) {
      const worktreeId = await this.worktreeManager.createWorktree(task.issueId);
      task.worktreeId = worktreeId;

      const agent = await this.agentPool.acquireAgent(task.agentType);
      const taskStatus = { taskId: task.issueId, status: 'running' };
      phaseStatus.tasks.push(taskStatus);

      // 🟢 WORKING: Real-time agent status tracking with agent pool integration
      this.agentPool.startAgentTask(agent.id, task.issueId);
      this.emit('agent:started', {
        agentId: agent.id,
        taskId: task.issueId,
        agentType: task.agentType,
      });

      const taskStartTime = Date.now();
      try {
        // 🔗 ENHANCED: Use Claude Code Adapter for task execution
        const executionRequest = {
          taskId: `${agent.id}-${task.issueId}`,
          issueId: task.issueId,
          agentType: task.agentType,
          worktreeId,
          instructions: `Execute ${task.agentType} agent task for issue ${task.issueId}`,
          priority: 'normal' as const,
          context: {
            agentId: agent.id,
            executionPhase: 'sequential'
          }
        };

        const result = await this.claudeCodeAdapter.executeTask(executionRequest);
        taskStatus.status = result.status === 'success' ? 'completed' : 'failed';

        // 🟢 WORKING: Track agent completion in pool and emit event
        const duration = Date.now() - taskStartTime;
        const success = result.status === 'success';
        this.agentPool.completeAgentTask(agent.id, task.issueId, success);
        this.agentPool.updateMetrics(task.agentType, success, duration);
        
        if (success) {
          this.emit('agent:completed', { 
            agentId: agent.id, 
            taskId: task.issueId, 
            success: true,
            result 
          });
        } else {
          throw new Error(result.errorMessage || 'Task execution failed');
        }
      } catch (error) {
        taskStatus.status = 'failed';

        // 🟢 WORKING: Track agent failure in pool and emit event
        const duration = Date.now() - taskStartTime;
        this.agentPool.completeAgentTask(agent.id, task.issueId, false);
        this.agentPool.updateMetrics(task.agentType, false, duration);
        this.emit('agent:failed', {
          agentId: agent.id,
          taskId: task.issueId,
          error: error.message,
        });
        throw error;
      } finally {
        this.agentPool.releaseAgent(agent);
        await this.worktreeManager.cleanupWorktree(worktreeId);

        // 🟢 WORKING: Track agent release
        this.emit('agent:released', { agentId: agent.id, agentType: task.agentType });
      }
    }
  }

  private async runQualityGates(executionId: string, phaseName: string): Promise<void> {
    logger.info(`Running quality gates for phase: ${phaseName}`);

    const results = await this.qualityGates.validate({
      executionId,
      phaseName,
    });

    if (!results.passed) {
      const failures = results.checks.filter((c) => !c.passed);
      const errorMsg = `Quality gates failed: ${failures.map((f) => f.name).join(', ')}`;
      throw new Error(errorMsg);
    }

    logger.info(`✅ All quality gates passed for phase: ${phaseName}`);
  }

  private calculateProgress(status: ExecutionStatus): number {
    const totalPhases = status.phases.length;
    const completedPhases = status.phases.filter((p) => p.status === 'completed').length;
    return Math.round((completedPhases / totalPhases) * 100);
  }

  private generateExecutionId(): string {
    return `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  public async stopExecution(executionId: string): Promise<void> {
    const status = this.activeExecutions.get(executionId);
    if (!status) {
      throw new Error(`No active execution found: ${executionId}`);
    }

    logger.info(`Stopping execution: ${executionId}`);
    status.status = 'stopped';
    status.endTime = new Date();

    await this.worktreeManager.cleanupAllWorktrees();
    this.agentPool.releaseAll();

    this.emit('execution:stopped', status);
  }

  public getExecutionStatus(executionId: string): ExecutionStatus | undefined {
    return this.activeExecutions.get(executionId);
  }

  public getAllExecutions(): ExecutionStatus[] {
    return Array.from(this.activeExecutions.values());
  }

  public getAvailablePatterns(): ExecutionPattern[] {
    return Array.from(this.executionPatterns.values());
  }

  /**
   * Get the knowledge management system instance
   * @returns KnowledgeManager for accessing learning and patterns
   */
  public getKnowledgeManager(): KnowledgeManager {
    return this.knowledgeManager;
  }

  /**
   * Get the Claude Code Adapter instance
   * @returns ClaudeCodeAdapter for task execution management
   */
  public getClaudeCodeAdapter(): ClaudeCodeAdapter {
    return this.claudeCodeAdapter;
  }

  /**
   * Get system status including all components
   */
  public getSystemStatus(): {
    orchestrator: {
      activeExecutions: number;
      availablePatterns: number;
      uptime: number;
    };
    adapter: ReturnType<ClaudeCodeAdapter['getSystemStatus']>;
    agentPool: {
      activeAgents: number;
      availableAgents: number;
      busyAgents: number;
      errorAgents: number;
    };
    worktrees: {
      active: number;
      total: number;
    };
  } {
    return {
      orchestrator: {
        activeExecutions: this.activeExecutions.size,
        availablePatterns: this.executionPatterns.size,
        uptime: Date.now() - this.stats?.startTime?.getTime() || 0
      },
      adapter: this.claudeCodeAdapter.getSystemStatus(),
      agentPool: {
        activeAgents: this.agentPool.getActiveAgentCount(),
        availableAgents: this.agentPool.getAvailableAgentCount(),
        busyAgents: this.agentPool.getBusyAgentCount(),
        errorAgents: this.agentPool.getErrorAgentCount()
      },
      worktrees: {
        active: this.worktreeManager.getActiveWorktreeCount(),
        total: this.worktreeManager.getAllWorktrees().length
      }
    };
  }

  public async shutdown(): Promise<void> {
    logger.info('Shutting down orchestrator...');

    try {
      // Stop all active executions
      for (const [id, status] of this.activeExecutions) {
        if (status.status === 'running') {
          await this.stopExecution(id);
        }
      }

      // Shutdown Claude Code Adapter first (may have active tasks)
      await this.claudeCodeAdapter.shutdown();
      
      // Shutdown other components
      await this.worktreeManager.cleanup();
      await this.agentPool.shutdown();

      logger.info('Orchestrator shutdown complete');
    } catch (error) {
      logger.error('Error during orchestrator shutdown', error);
      throw error;
    }
  }
}
