/**
 * SupervisorIntegration - Integration layer for ProcessSupervisor with AgentPool
 *
 * Provides seamless integration between the ProcessSupervisor and existing
 * AgentPool system, enabling supervised agent execution with comprehensive
 * process management and monitoring.
 */

import { EventEmitter } from 'events';
import { LogContext } from '../utils/logger';
import type { ProcessSupervisorConfig, SupervisedProcessOptions } from './process-supervisor';
import { ProcessSupervisor } from './process-supervisor';
import type { Agent, AgentConfig } from '../types';

export interface SupervisedAgentConfig extends AgentConfig {
  // Process supervisor settings
  processSupervisor: ProcessSupervisorConfig;

  // Integration settings
  autoRestartAgents: boolean;
  maxAgentRestarts: number;
  agentHealthCheckInterval: number;

  // Agent-specific resource limits
  agentResourceOverrides: Record<string, Partial<ProcessSupervisorConfig['resourceLimits']>>;
}

export interface AgentExecutionRequest {
  agentId: string;
  agentType: string;
  taskId: string;
  instructions: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  timeout?: number;
  workingDir: string;
  context?: Record<string, any>;
}

export interface SupervisedAgentResult {
  agentId: string;
  taskId: string;
  processId: string;
  status: 'success' | 'failure' | 'timeout' | 'killed';
  output: string;
  error?: string;
  executionTime: number;
  resourceUsage: {
    memoryMB: number;
    cpuPercent: number;
    fileHandles: number;
  };
}

export class SupervisorIntegration extends EventEmitter {
  private logger: LogContext;
  private config: SupervisedAgentConfig;
  private processSupervisor: ProcessSupervisor;

  // Agent tracking
  private runningAgents: Map<string, { processId: string; agentType: string; startTime: Date }>;
  private agentProcessMap: Map<string, string>; // processId -> agentId
  private agentRestartCounts: Map<string, number>;

  // Integration state
  private initialized: boolean = false;
  private shutdownInProgress: boolean = false;

  constructor(config: SupervisedAgentConfig) {
    super();
    this.logger = new LogContext('SupervisorIntegration');
    this.config = config;
    this.processSupervisor = new ProcessSupervisor(config.processSupervisor);

    this.runningAgents = new Map();
    this.agentProcessMap = new Map();
    this.agentRestartCounts = new Map();

    this.setupSupervisorEventHandlers();
  }

  /**
   * Initialize the supervisor integration
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warning('SupervisorIntegration already initialized');
      return;
    }

    this.logger.info('Initializing Supervisor Integration...');

    try {
      // Initialize the process supervisor
      await this.processSupervisor.initialize();

      // Setup health monitoring for agents
      if (this.config.agentHealthCheckInterval > 0) {
        this.startAgentHealthMonitoring();
      }

      this.initialized = true;
      this.logger.info('Supervisor Integration initialized successfully');
      this.emit('integration:initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Supervisor Integration', error);
      throw error;
    }
  }

  /**
   * Execute an agent task under supervision
   */
  public async executeAgent(request: AgentExecutionRequest): Promise<SupervisedAgentResult> {
    if (!this.initialized) {
      throw new Error('SupervisorIntegration not initialized');
    }

    const startTime = Date.now();
    this.logger.info(
      `Starting supervised agent execution: ${request.agentType} for task ${request.taskId}`,
    );

    // Prepare supervised process options
    const processOptions: SupervisedProcessOptions = {
      taskId: request.taskId,
      agentType: request.agentType,
      priority: request.priority,
      command: this.getClaudeCommand(),
      args: this.buildClaudeArgs(request),
      workingDir: request.workingDir,
      env: this.buildEnvironment(request),
      resourceLimits: this.getAgentResourceLimits(request.agentType),
      timeout: request.timeout || this.config.timeout,
      autoRestart: this.config.autoRestartAgents,
      maxRestarts: this.config.maxAgentRestarts,
      enableHealthCheck: true,
      metadata: {
        agentId: request.agentId,
        taskId: request.taskId,
        agentType: request.agentType,
        startTime: new Date(),
        ...request.context,
      },
    };

    try {
      // Start the supervised process
      const processId = await this.processSupervisor.startProcess(processOptions);

      // Track the running agent
      this.runningAgents.set(request.agentId, {
        processId,
        agentType: request.agentType,
        startTime: new Date(),
      });
      this.agentProcessMap.set(processId, request.agentId);

      this.emit('agent:started', { agentId: request.agentId, processId, taskId: request.taskId });

      // Wait for process completion
      const result = await this.waitForProcessCompletion(
        processId,
        request.timeout || this.config.timeout,
      );

      // Calculate final result
      const executionTime = Date.now() - startTime;
      const finalResult: SupervisedAgentResult = {
        agentId: request.agentId,
        taskId: request.taskId,
        processId,
        status: result.success ? 'success' : 'failure',
        output: result.output,
        error: result.error,
        executionTime,
        resourceUsage: result.resourceUsage,
      };

      this.emit('agent:completed', finalResult);
      return finalResult;
    } catch (error) {
      this.logger.error(`Agent execution failed: ${request.agentId}`, error);

      const executionTime = Date.now() - startTime;
      const errorResult: SupervisedAgentResult = {
        agentId: request.agentId,
        taskId: request.taskId,
        processId: 'unknown',
        status: 'failure',
        output: '',
        error: String(error),
        executionTime,
        resourceUsage: { memoryMB: 0, cpuPercent: 0, fileHandles: 0 },
      };

      this.emit('agent:failed', errorResult);
      return errorResult;
    } finally {
      // Clean up tracking
      this.runningAgents.delete(request.agentId);
      // Note: processId might not be available if start failed
    }
  }

  /**
   * Kill a running agent
   */
  public async killAgent(agentId: string, reason?: string): Promise<void> {
    const agentInfo = this.runningAgents.get(agentId);
    if (!agentInfo) {
      this.logger.warning(`Agent not found or not running: ${agentId}`);
      return;
    }

    this.logger.info(`Killing agent: ${agentId} - Reason: ${reason || 'User request'}`);

    try {
      await this.processSupervisor.stopProcess(agentInfo.processId, reason);
      this.emit('agent:killed', { agentId, processId: agentInfo.processId, reason });
    } catch (error) {
      this.logger.error(`Failed to kill agent: ${agentId}`, error);
      throw error;
    }
  }

  /**
   * Restart a failed agent
   */
  public async restartAgent(agentId: string): Promise<string> {
    const agentInfo = this.runningAgents.get(agentId);
    if (!agentInfo) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Check restart limits
    const restartCount = this.agentRestartCounts.get(agentId) || 0;
    if (restartCount >= this.config.maxAgentRestarts) {
      throw new Error(`Maximum restart attempts reached for agent: ${agentId}`);
    }

    this.logger.info(`Restarting agent: ${agentId} (attempt ${restartCount + 1})`);

    try {
      const newProcessId = await this.processSupervisor.restartProcess(
        agentInfo.processId,
        `Agent restart ${restartCount + 1}`,
      );

      // Update tracking
      this.agentProcessMap.delete(agentInfo.processId);
      this.runningAgents.set(agentId, {
        ...agentInfo,
        processId: newProcessId,
        startTime: new Date(),
      });
      this.agentProcessMap.set(newProcessId, agentId);
      this.agentRestartCounts.set(agentId, restartCount + 1);

      this.emit('agent:restarted', {
        agentId,
        oldProcessId: agentInfo.processId,
        newProcessId,
        restartCount: restartCount + 1,
      });

      return newProcessId;
    } catch (error) {
      this.logger.error(`Failed to restart agent: ${agentId}`, error);
      throw error;
    }
  }

  /**
   * Get status of all running agents
   */
  public getRunningAgents(): Array<{
    agentId: string;
    processId: string;
    agentType: string;
    startTime: Date;
    executionTime: number;
    status: string;
  }> {
    const result: Array<{
      agentId: string;
      processId: string;
      agentType: string;
      startTime: Date;
      executionTime: number;
      status: string;
    }> = [];

    for (const [agentId, agentInfo] of this.runningAgents) {
      const processInfo = this.processSupervisor.getProcessInfo(agentInfo.processId);

      result.push({
        agentId,
        processId: agentInfo.processId,
        agentType: agentInfo.agentType,
        startTime: agentInfo.startTime,
        executionTime: Date.now() - agentInfo.startTime.getTime(),
        status: processInfo?.status || 'unknown',
      });
    }

    return result;
  }

  /**
   * Get process monitoring data
   */
  public getProcessMonitoringData(processId: string): any | null {
    const processInfo = this.processSupervisor.getProcessInfo(processId);
    if (!processInfo) return null;

    // This would need to be implemented properly with access to process monitor
    return null; // Placeholder
  }

  /**
   * Get comprehensive stats
   */
  public getIntegrationStats(): {
    runningAgents: number;
    totalAgentsExecuted: number;
    restartedAgents: number;
    processStats: any;
  } {
    const processStats = this.processSupervisor.getStats();

    return {
      runningAgents: this.runningAgents.size,
      totalAgentsExecuted: processStats.processesStarted,
      restartedAgents: Array.from(this.agentRestartCounts.values()).reduce((a, b) => a + b, 0),
      processStats,
    };
  }

  /**
   * Shutdown the supervisor integration
   */
  public async shutdown(): Promise<void> {
    if (this.shutdownInProgress) {
      return;
    }

    this.shutdownInProgress = true;
    this.logger.info('Shutting down Supervisor Integration...');

    try {
      // Kill all running agents
      const runningAgentIds = Array.from(this.runningAgents.keys());
      for (const agentId of runningAgentIds) {
        try {
          await this.killAgent(agentId, 'System shutdown');
        } catch (error) {
          this.logger.error(`Failed to kill agent during shutdown: ${agentId}`, error);
        }
      }

      // Shutdown the process supervisor
      await this.processSupervisor.shutdown();

      // Clear tracking data
      this.runningAgents.clear();
      this.agentProcessMap.clear();
      this.agentRestartCounts.clear();

      this.initialized = false;
      this.logger.info('Supervisor Integration shutdown complete');
      this.emit('integration:shutdown');
    } catch (error) {
      this.logger.error('Error during Supervisor Integration shutdown', error);
      throw error;
    } finally {
      this.shutdownInProgress = false;
    }
  }

  // Private methods

  private setupSupervisorEventHandlers(): void {
    this.processSupervisor.on('process:started', (event) => {
      const agentId = this.agentProcessMap.get(event.processId);
      if (agentId) {
        this.emit('agent:process-started', { agentId, ...event });
      }
    });

    this.processSupervisor.on('process:stopped', (event) => {
      const agentId = this.agentProcessMap.get(event.processId);
      if (agentId) {
        this.runningAgents.delete(agentId);
        this.agentProcessMap.delete(event.processId);
        this.emit('agent:process-stopped', { agentId, ...event });
      }
    });

    this.processSupervisor.on('process:restarted', (event) => {
      const agentId = this.agentProcessMap.get(event.oldProcessId);
      if (agentId) {
        this.agentProcessMap.delete(event.oldProcessId);
        this.agentProcessMap.set(event.newProcessId, agentId);
        this.emit('agent:process-restarted', { agentId, ...event });
      }
    });

    this.processSupervisor.on('process:error', (event) => {
      const agentId = this.agentProcessMap.get(event.processId);
      if (agentId) {
        this.emit('agent:process-error', { agentId, ...event });
      }
    });
  }

  private getClaudeCommand(): string {
    // Determine Claude CLI command (could be 'claude', 'claude-code', etc.)
    return 'claude'; // This should be configurable
  }

  private buildClaudeArgs(request: AgentExecutionRequest): string[] {
    const args: string[] = [];

    // Add basic arguments
    args.push('--task', request.instructions);
    args.push('--agent-type', request.agentType);
    args.push('--task-id', request.taskId);

    // Add timeout if specified
    if (request.timeout) {
      args.push('--timeout', String(request.timeout));
    }

    // Add priority if not normal
    if (request.priority !== 'normal') {
      args.push('--priority', request.priority);
    }

    return args;
  }

  private buildEnvironment(request: AgentExecutionRequest): Record<string, string> {
    return {
      // Inherit system environment
      ...process.env,

      // Add FF2 context
      FF2_AGENT_ID: request.agentId,
      FF2_TASK_ID: request.taskId,
      FF2_AGENT_TYPE: request.agentType,
      FF2_PRIORITY: request.priority,
      FF2_SUPERVISED: 'true',

      // Add request context
      ...Object.fromEntries(
        Object.entries(request.context || {}).map(([key, value]) => [
          `FF2_${key.toUpperCase()}`,
          String(value),
        ]),
      ),
    };
  }

  private getAgentResourceLimits(
    agentType: string,
  ): Partial<ProcessSupervisorConfig['resourceLimits']> | undefined {
    return this.config.agentResourceOverrides[agentType];
  }

  private async waitForProcessCompletion(
    processId: string,
    timeout: number,
  ): Promise<{
    success: boolean;
    output: string;
    error?: string;
    resourceUsage: { memoryMB: number; cpuPercent: number; fileHandles: number };
  }> {
    return new Promise((resolve, reject) => {
      let completed = false;

      const handleCompletion = (success: boolean, output: string = '', error?: string) => {
        if (completed) return;
        completed = true;

        // Get final resource usage
        const processInfo = this.processSupervisor.getProcessInfo(processId);
        const monitoringData = this.processSupervisor.getProcessMonitoringData(processId);

        const resourceUsage = monitoringData
          ? {
              memoryMB: monitoringData.memoryMB,
              cpuPercent: monitoringData.cpuPercent,
              fileHandles: monitoringData.fileHandles,
            }
          : { memoryMB: 0, cpuPercent: 0, fileHandles: 0 };

        resolve({ success, output, error, resourceUsage });
      };

      // Listen for process completion events
      const onStopped = (event: any) => {
        if (event.processId === processId) {
          this.processSupervisor.off('process:stopped', onStopped);
          this.processSupervisor.off('process:error', onError);
          handleCompletion(true, event.output || '');
        }
      };

      const onError = (event: any) => {
        if (event.processId === processId) {
          this.processSupervisor.off('process:stopped', onStopped);
          this.processSupervisor.off('process:error', onError);
          handleCompletion(false, '', String(event.error));
        }
      };

      this.processSupervisor.on('process:stopped', onStopped);
      this.processSupervisor.on('process:error', onError);

      // Set timeout
      setTimeout(() => {
        if (!completed) {
          completed = true;
          this.processSupervisor.off('process:stopped', onStopped);
          this.processSupervisor.off('process:error', onError);

          // Try to kill the process
          this.processSupervisor
            .stopProcess(processId, 'Execution timeout')
            .catch((error) =>
              this.logger.error(`Failed to stop timed out process: ${processId}`, error),
            );

          handleCompletion(false, '', 'Execution timeout');
        }
      }, timeout);
    });
  }

  private startAgentHealthMonitoring(): void {
    setInterval(async () => {
      if (this.shutdownInProgress) return;

      try {
        await this.performAgentHealthCheck();
      } catch (error) {
        this.logger.error('Agent health check failed', error);
      }
    }, this.config.agentHealthCheckInterval);

    this.logger.debug('Agent health monitoring started');
  }

  private async performAgentHealthCheck(): Promise<void> {
    const healthStatuses = await this.processSupervisor.performHealthCheck();

    for (const [processId, healthStatus] of healthStatuses) {
      const agentId = this.agentProcessMap.get(processId);

      if (agentId && (healthStatus === 'unhealthy' || healthStatus === 'crashed')) {
        this.logger.warning(`Unhealthy agent detected: ${agentId} (${healthStatus})`);

        if (this.config.autoRestartAgents) {
          try {
            await this.restartAgent(agentId);
          } catch (error) {
            this.logger.error(`Failed to restart unhealthy agent: ${agentId}`, error);
          }
        }

        this.emit('agent:unhealthy', { agentId, processId, healthStatus });
      }
    }
  }
}
