import type { Request, Response } from 'express';
import type { Orchestrator } from '../../core/orchestrator';
import { logger } from '../../utils/logger';
import { metrics } from '../../monitoring/metrics';
import type { Agent, AgentMetrics } from '../../types';
import { CrossProjectAgentDiscovery } from '../../monitoring/cross-project-discovery';
import type { ExternalAgent } from '../../monitoring/cross-project-discovery';

// 🟢 WORKING: Real orchestrator integration - no more mock data
let orchestratorInstance: Orchestrator | null = null;

// 🟢 NEW: Cross-project agent discovery system
let crossProjectDiscovery: CrossProjectAgentDiscovery | null = null;

// In-memory agent performance store (in production, this would be in a database)
const agentMetricsStore = new Map<string, AgentMetrics>();
const agentExecutionHistory = new Map<
  string,
  Array<{
    taskId: string;
    executionId: string;
    startTime: Date;
    endTime: Date | null;
    status: 'running' | 'completed' | 'failed';
    duration: number | null;
    errorMessage?: string;
  }>
>();

// Set orchestrator instance (called by web server)
export const setOrchestrator = (orchestrator: Orchestrator): void => {
  orchestratorInstance = orchestrator;
};

// 🟢 NEW: Initialize cross-project agent discovery
export const initializeCrossProjectDiscovery = (): void => {
  if (!crossProjectDiscovery) {
    crossProjectDiscovery = new CrossProjectAgentDiscovery();
    crossProjectDiscovery.startDiscovery(15000); // Every 15 seconds
    logger.info('Cross-project agent discovery initialized');
  }
};

const requireOrchestrator = (): Orchestrator => {
  if (!orchestratorInstance) {
    throw new Error('Orchestrator not initialized');
  }
  return orchestratorInstance;
};

// 🟢 WORKING: Agent capabilities mapping for UI display
const AGENT_CAPABILITIES = {
  'strategic-planner': [
    'epic-analysis',
    'task-breakdown',
    'priority-assessment',
    'requirement-gathering',
  ],
  'system-architect': [
    'architecture-design',
    'pattern-selection',
    'component-design',
    'api-specification',
  ],
  'code-implementer': ['coding', 'bug-fixing', 'feature-implementation', 'code-refactoring'],
  'test-coverage-validator': [
    'test-writing',
    'coverage-analysis',
    'test-automation',
    'quality-assurance',
  ],
  'security-auditor': [
    'vulnerability-scanning',
    'security-analysis',
    'penetration-testing',
    'compliance-check',
  ],
  'performance-optimizer': ['performance-analysis', 'optimization', 'profiling', 'load-testing'],
  'ui-ux-optimizer': ['ui-design', 'ux-analysis', 'accessibility', 'responsive-design'],
  'database-architect': [
    'schema-design',
    'query-optimization',
    'migration-planning',
    'data-modeling',
  ],
  'deployment-automation': [
    'ci-cd-setup',
    'deployment-scripting',
    'infrastructure-management',
    'monitoring-setup',
  ],
  'code-quality-reviewer': [
    'code-review',
    'quality-metrics',
    'best-practices',
    'documentation-review',
  ],
  'antihallucination-validator': [
    'code-validation',
    'existence-checking',
    'hallucination-prevention',
  ],
} as const;

// 🟢 WORKING: Get REAL agent status from orchestrator's agent pool (NO MORE FAKE DATA)
const getRealAgentStatus = (orchestrator: Orchestrator) => {
  const agentPool = orchestrator.agentPool;
  if (!agentPool) {
    throw new Error('Agent pool not available in orchestrator');
  }

  // 🟢 WORKING: Get all agents with their ACTUAL status from the agent pool
  const agentsWithStatus = agentPool.getAllAgentsWithStatus();

  const allAgents = agentsWithStatus.map((agent) => {
    const capabilities = AGENT_CAPABILITIES[agent.type as keyof typeof AGENT_CAPABILITIES] || [];

    return {
      id: agent.id,
      type: agent.type,
      status: agent.status, // 🟢 WORKING: Real status from agent pool activity tracking
      currentTask: agent.currentTask, // 🟢 WORKING: Real current task (not fake)
      lastActive: agent.lastActive, // 🟢 WORKING: Real last active time
      capabilities,
      version: '2.0.0',
    };
  });

  return allAgents;
};

// Get all agents with their current status and performance metrics
export const getAllAgents = async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, status, include_metrics = 'true' } = req.query;

    // 🟢 WORKING: Get REAL agent status from orchestrator
    const orchestrator = requireOrchestrator();
    const internalAgents = getRealAgentStatus(orchestrator);

    // 🟢 NEW: Get external agents from cross-project discovery
    const externalAgents = crossProjectDiscovery
      ? crossProjectDiscovery.getAllDiscoveredAgents().map((agent) => ({
          id: agent.id,
          type: agent.type,
          status: agent.status,
          currentTask: agent.currentTask,
          lastActive: agent.lastSeen,
          capabilities: agent.capabilities,
          version: 'external',
          isExternal: true,
          source: agent.source,
          location: agent.location,
          metadata: agent.metadata,
        }))
      : [];

    // Combine internal and external agents
    let agents = [
      ...internalAgents.map((agent) => ({ ...agent, isExternal: false })),
      ...externalAgents,
    ];

    // Apply filters
    if (type && typeof type === 'string') {
      agents = agents.filter((agent) => agent.type === type);
    }
    if (status && typeof status === 'string') {
      agents = agents.filter((agent) => agent.status === status);
    }

    const agentsWithMetrics = agents.map((agent) => {
      const baseAgent = {
        ...agent,
        uptime: Date.now() - agent.lastActive.getTime(),
        isHealthy:
          agent.status !== 'error' && Date.now() - agent.lastActive.getTime() < 5 * 60 * 1000, // 5 minutes
      };

      if (include_metrics === 'true' && !agent.isExternal) {
        // 🟢 WORKING: Get REAL task history from agent pool (only for internal agents)
        const listOrchestrator = requireOrchestrator();
        const realHistory = listOrchestrator.agentPool.getAgentTaskHistory(agent.id);

        // Convert to the expected format
        const history = realHistory.map((task) => ({
          taskId: task.taskId,
          executionId: `exec-${task.taskId}`,
          startTime: task.startTime,
          endTime: task.endTime || null,
          status: task.endTime ? (task.success ? 'completed' : 'failed') : 'running',
          duration: task.duration || null,
          errorMessage: task.success === false ? 'Task execution failed' : undefined,
        }));

        // 🟢 WORKING: Calculate REAL metrics from actual task history
        const completedTasks = history.filter((h) => h.status === 'completed');
        const failedTasks = history.filter((h) => h.status === 'failed');
        const totalTasks = completedTasks.length + failedTasks.length;

        const metrics = {
          agentId: agent.id,
          type: agent.type,
          tasksCompleted: completedTasks.length,
          tasksFailed: failedTasks.length,
          averageTime:
            completedTasks.length > 0 && completedTasks.filter((h) => h.duration).length > 0
              ? completedTasks
                  .filter((h) => h.duration)
                  .reduce((sum, h) => sum + (h.duration || 0), 0) /
                completedTasks.filter((h) => h.duration).length
              : 0,
          successRate: totalTasks > 0 ? (completedTasks.length / totalTasks) * 100 : 100,
          lastActive: agent.lastActive,
        };

        return {
          ...baseAgent,
          metrics,
          recentActivity: {
            tasksLast24h: history.filter(
              (h) => new Date(h.startTime).getTime() > Date.now() - 24 * 60 * 60 * 1000,
            ).length,
            averageTaskTime:
              completedTasks.length > 0 && completedTasks.filter((h) => h.duration).length > 0
                ? completedTasks
                    .filter((h) => h.duration)
                    .reduce((sum, h) => sum + (h.duration || 0), 0) /
                  completedTasks.filter((h) => h.duration).length
                : null,
            lastTaskCompleted:
              completedTasks.length > 0
                ? completedTasks.sort(
                    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
                  )[0]
                : null,
          },
        };
      }

      return baseAgent;
    });

    // Calculate enhanced summary statistics
    const summary = {
      total: agents.length,
      internal: agents.filter((a) => !a.isExternal).length,
      external: agents.filter((a) => a.isExternal).length,
      idle: agents.filter((a) => a.status === 'idle').length,
      busy: agents.filter((a) => a.status === 'busy' || a.status === 'active').length,
      error: agents.filter((a) => a.status === 'error').length,
      healthy: agents.filter(
        (a) => a.status !== 'error' && Date.now() - a.lastActive.getTime() < 5 * 60 * 1000,
      ).length,
      byType: agents.reduce(
        (acc, agent) => {
          acc[agent.type] = (acc[agent.type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
      bySource: crossProjectDiscovery ? crossProjectDiscovery.getAgentMetrics().bySource : {},
    };

    res.json({
      agents: agentsWithMetrics,
      summary,
      discoveryEnabled: !!crossProjectDiscovery,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to fetch agents', error);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
};

// Get specific agent details with comprehensive metrics
export const getAgentDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { history_limit = 50 } = req.query;

    // 🟢 WORKING: Get real agent status from orchestrator
    const orchestrator = requireOrchestrator();
    const agents = getRealAgentStatus(orchestrator);
    const agent = agents.find((a) => a.id === id);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    // 🟢 WORKING: Get REAL metrics and history from agent pool
    const metricsOrchestrator = requireOrchestrator();
    const realHistory = metricsOrchestrator.agentPool.getAgentTaskHistory(agent.id);

    // Convert to the expected format
    const history = realHistory.map((task) => ({
      taskId: task.taskId,
      executionId: `exec-${task.taskId}`,
      startTime: task.startTime,
      endTime: task.endTime || null,
      status: task.endTime ? (task.success ? 'completed' : 'failed') : 'running',
      duration: task.duration || null,
      errorMessage: task.success === false ? 'Task execution failed' : undefined,
    }));

    // 🟢 WORKING: Calculate REAL metrics from actual task history
    const completedTasks = history.filter((h) => h.status === 'completed');
    const failedTasks = history.filter((h) => h.status === 'failed');
    const totalTasks = completedTasks.length + failedTasks.length;

    const metrics = {
      agentId: id,
      type: agent.type,
      tasksCompleted: completedTasks.length,
      tasksFailed: failedTasks.length,
      averageTime:
        completedTasks.length > 0 && completedTasks.filter((h) => h.duration).length > 0
          ? completedTasks
              .filter((h) => h.duration)
              .reduce((sum, h) => sum + (h.duration || 0), 0) /
            completedTasks.filter((h) => h.duration).length
          : 0,
      successRate: totalTasks > 0 ? (completedTasks.length / totalTasks) * 100 : 100,
      lastActive: agent.lastActive,
    };

    // Get recent execution history
    const recentHistory = history
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .slice(0, parseInt(history_limit as string, 10));

    // Use already calculated completedTasks and failedTasks from above

    const performanceMetrics = {
      totalTasks: history.length,
      completedTasks: completedTasks.length,
      failedTasks: failedTasks.length,
      runningTasks: history.filter((h) => h.status === 'running').length,
      successRate: history.length > 0 ? (completedTasks.length / history.length) * 100 : 100,
      averageExecutionTime:
        completedTasks.filter((h) => h.duration).length > 0
          ? completedTasks
              .filter((h) => h.duration)
              .reduce((sum, h) => sum + (h.duration || 0), 0) /
            completedTasks.filter((h) => h.duration).length
          : null,
      fastestTask:
        completedTasks.filter((h) => h.duration).length > 0
          ? Math.min(...completedTasks.filter((h) => h.duration).map((h) => h.duration))
          : null,
      slowestTask:
        completedTasks.filter((h) => h.duration).length > 0
          ? Math.max(...completedTasks.filter((h) => h.duration).map((h) => h.duration))
          : null,
      recentActivity: {
        last24h: history.filter(
          (h) => new Date(h.startTime).getTime() > Date.now() - 24 * 60 * 60 * 1000,
        ).length,
        last7days: history.filter(
          (h) => new Date(h.startTime).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000,
        ).length,
        last30days: history.filter(
          (h) => new Date(h.startTime).getTime() > Date.now() - 30 * 24 * 60 * 60 * 1000,
        ).length,
      },
    };

    // Error analysis
    const errorAnalysis = {
      commonErrors: failedTasks.reduce(
        (acc, task) => {
          if (task.errorMessage) {
            const errorType = task.errorMessage.split(':')[0];
            acc[errorType] = (acc[errorType] || 0) + 1;
          }
          return acc;
        },
        {} as Record<string, number>,
      ),
      errorRate: history.length > 0 ? (failedTasks.length / history.length) * 100 : 0,
      recentErrors: failedTasks.filter(
        (h) => new Date(h.startTime).getTime() > Date.now() - 24 * 60 * 60 * 1000,
      ).length,
    };

    const detailedAgent = {
      ...agent,
      uptime: Date.now() - agent.lastActive.getTime(),
      isHealthy:
        agent.status !== 'error' && Date.now() - agent.lastActive.getTime() < 5 * 60 * 1000,
      metrics,
      performance: performanceMetrics,
      errors: errorAnalysis,
      history: recentHistory.map((h) => ({
        ...h,
        duration: h.duration ? `${(h.duration / 1000).toFixed(2)}s` : null,
      })),
    };

    res.json({
      agent: detailedAgent,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to fetch agent details', error);
    res.status(500).json({ error: 'Failed to fetch agent details' });
  }
};

// Get agent performance analytics
export const getAgentAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { agent_type, days = 30, group_by = 'day', metric_type = 'all' } = req.query;

    const cutoffDate = new Date(Date.now() - parseInt(days as string, 10) * 24 * 60 * 60 * 1000);

    // 🟢 WORKING: Get real agent status from orchestrator
    const orchestrator = requireOrchestrator();
    let relevantAgents = getRealAgentStatus(orchestrator);
    if (agent_type && typeof agent_type === 'string') {
      relevantAgents = relevantAgents.filter((a) => a.type === agent_type);
    }

    const analyticsData = new Map<
      string,
      {
        date: string;
        tasksCompleted: number;
        tasksFailed: number;
        averageExecutionTime: number;
        activeAgents: number;
        totalTasks: number;
      }
    >();

    // Process execution history for each agent
    relevantAgents.forEach((agent) => {
      const history = agentExecutionHistory.get(agent.id) || [];
      const relevantHistory = history.filter((h) => new Date(h.startTime) >= cutoffDate);

      relevantHistory.forEach((execution) => {
        const date = new Date(execution.startTime);
        let groupKey: string;

        if (group_by === 'hour') {
          groupKey = date.toISOString().slice(0, 13) + ':00:00.000Z';
        } else if (group_by === 'week') {
          const startOfWeek = new Date(date);
          startOfWeek.setDate(date.getDate() - date.getDay());
          groupKey = startOfWeek.toISOString().slice(0, 10) + 'T00:00:00.000Z';
        } else {
          // day
          groupKey = date.toISOString().slice(0, 10) + 'T00:00:00.000Z';
        }

        if (!analyticsData.has(groupKey)) {
          analyticsData.set(groupKey, {
            date: groupKey,
            tasksCompleted: 0,
            tasksFailed: 0,
            averageExecutionTime: 0,
            activeAgents: 0,
            totalTasks: 0,
          });
        }

        const group = analyticsData.get(groupKey);
        group.totalTasks++;

        if (execution.status === 'completed') group.tasksCompleted++;
        else if (execution.status === 'failed') group.tasksFailed++;
      });
    });

    // Calculate average execution times and active agents for each group
    for (const [key, group] of analyticsData) {
      const groupExecutions = [];

      relevantAgents.forEach((agent) => {
        const history = agentExecutionHistory.get(agent.id) || [];
        const groupExecs = history.filter((h) => {
          const date = new Date(h.startTime);
          let groupKey: string;

          if (group_by === 'hour') {
            groupKey = date.toISOString().slice(0, 13) + ':00:00.000Z';
          } else if (group_by === 'week') {
            const startOfWeek = new Date(date);
            startOfWeek.setDate(date.getDate() - date.getDay());
            groupKey = startOfWeek.toISOString().slice(0, 10) + 'T00:00:00.000Z';
          } else {
            groupKey = date.toISOString().slice(0, 10) + 'T00:00:00.000Z';
          }

          return groupKey === key && h.duration && h.status === 'completed';
        });

        groupExecutions.push(...groupExecs);
      });

      if (groupExecutions.length > 0) {
        group.averageExecutionTime =
          groupExecutions.reduce((sum, e) => sum + (e.duration || 0), 0) / groupExecutions.length;
        group.activeAgents = new Set(
          groupExecutions
            .map((e) => {
              // Find which agent executed this task
              for (const agent of relevantAgents) {
                const agentHistory = agentExecutionHistory.get(agent.id) || [];
                if (agentHistory.includes(e)) return agent.id;
              }
              return null;
            })
            .filter(Boolean),
        ).size;
      }
    }

    const timeSeriesData = Array.from(analyticsData.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    // Calculate summary analytics
    const totalHistory = [];
    relevantAgents.forEach((agent) => {
      const history = agentExecutionHistory.get(agent.id) || [];
      totalHistory.push(...history.filter((h) => new Date(h.startTime) >= cutoffDate));
    });

    const summaryAnalytics = {
      totalTasks: totalHistory.length,
      completedTasks: totalHistory.filter((h) => h.status === 'completed').length,
      failedTasks: totalHistory.filter((h) => h.status === 'failed').length,
      averageSuccessRate:
        totalHistory.length > 0
          ? (totalHistory.filter((h) => h.status === 'completed').length / totalHistory.length) *
            100
          : 100,
      averageTaskDuration:
        totalHistory.filter((h) => h.duration).length > 0
          ? totalHistory.filter((h) => h.duration).reduce((sum, h) => sum + (h.duration || 0), 0) /
            totalHistory.filter((h) => h.duration).length
          : 0,
      peakPerformanceDay: timeSeriesData.reduce(
        (best, current) => (!best || current.tasksCompleted > best.tasksCompleted ? current : best),
        null,
      ),
      agentTypeDistribution: relevantAgents.reduce(
        (acc, agent) => {
          acc[agent.type] = (acc[agent.type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
      trends: {
        tasksCompletedTrend:
          timeSeriesData.length > 1
            ? timeSeriesData[timeSeriesData.length - 1].tasksCompleted -
              timeSeriesData[0].tasksCompleted
            : 0,
        successRateTrend:
          timeSeriesData.length > 1
            ? (timeSeriesData[timeSeriesData.length - 1].tasksCompleted /
                Math.max(timeSeriesData[timeSeriesData.length - 1].totalTasks, 1)) *
                100 -
              (timeSeriesData[0].tasksCompleted / Math.max(timeSeriesData[0].totalTasks, 1)) * 100
            : 0,
      },
    };

    res.json({
      timeSeries: timeSeriesData,
      summary: summaryAnalytics,
      filters: {
        agentType: agent_type || null,
        days: parseInt(days as string, 10),
        groupBy: group_by,
        metricType: metric_type,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to fetch agent analytics', error);
    res.status(500).json({ error: 'Failed to fetch agent analytics' });
  }
};

// Simulate agent task execution for testing (in production, this would be called by the orchestrator)
export const simulateAgentTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { agentId, taskId, executionId, duration = 5000, shouldFail = false } = req.body;

    if (!agentId || !taskId || !executionId) {
      res.status(400).json({ error: 'Agent ID, task ID, and execution ID are required' });
      return;
    }

    // 🟢 WORKING: Get real agent status from orchestrator
    const orchestrator = requireOrchestrator();
    const agents = getRealAgentStatus(orchestrator);
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    // 🟢 WORKING: Use real agent pool for task simulation
    const taskOrchestrator = requireOrchestrator();
    taskOrchestrator.agentPool.startAgentTask(agentId, taskId);

    agent.status = 'busy';
    agent.currentTask = taskId;
    agent.lastActive = new Date();

    // 🟢 WORKING: Simulate task execution with real agent pool tracking
    setTimeout(
      () => {
        const endTime = new Date();

        // Update agent status
        agent.status = 'idle';
        agent.currentTask = undefined;
        agent.lastActive = endTime;

        // 🟢 WORKING: Complete task in agent pool with real tracking
        taskOrchestrator.agentPool.completeAgentTask(agentId, taskId, !shouldFail);

        if (shouldFail) {
          taskOrchestrator.agentPool.setAgentError(agentId, 'Simulated task failure');
        }

        const taskDuration = parseInt(duration as string, 10);
        taskOrchestrator.agentPool.updateMetrics(agent.type, !shouldFail, taskDuration);

        logger.info(
          `Agent ${agentId} ${shouldFail ? 'failed' : 'completed'} task ${taskId} in ${taskDuration}ms`,
        );
      },
      parseInt(duration as string, 10),
    );

    res.json({
      message: 'Task simulation started',
      agentId,
      taskId,
      executionId,
      estimatedDuration: duration,
      willFail: shouldFail,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to simulate agent task', error);
    res.status(500).json({ error: 'Failed to simulate agent task' });
  }
};

// Update agent status (for monitoring integration)
export const updateAgentStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, currentTask, errorMessage } = req.body;

    // 🟢 WORKING: Get real agent status from orchestrator
    const orchestrator = requireOrchestrator();
    const agents = getRealAgentStatus(orchestrator);
    const agent = agents.find((a) => a.id === id);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    // 🟢 WORKING: Update agent status through agent pool for real tracking
    const statusOrchestrator = requireOrchestrator();

    if (status) {
      agent.status = status;
      if (status === 'error') {
        statusOrchestrator.agentPool.setAgentError(id, errorMessage);
      }
    }

    if (currentTask !== undefined) {
      agent.currentTask = currentTask;
      if (currentTask && status === 'busy') {
        statusOrchestrator.agentPool.startAgentTask(id, currentTask);
      }
    }

    agent.lastActive = new Date();

    // If agent encountered an error, log it
    if (status === 'error' && errorMessage) {
      logger.error(`Agent ${id} encountered error: ${errorMessage}`);
      metrics.incrementError('agent_error', 'error');
    }

    res.json({
      agent: {
        ...agent,
        uptime: Date.now() - agent.lastActive.getTime(),
        isHealthy: agent.status !== 'error',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to update agent status', error);
    res.status(500).json({ error: 'Failed to update agent status' });
  }
};

// Get agent health status
export const getAgentHealth = async (req: Request, res: Response): Promise<void> => {
  try {
    // 🟢 WORKING: Get real agent status from orchestrator
    const orchestrator = requireOrchestrator();
    const agents = getRealAgentStatus(orchestrator);
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;

    const healthStatus = {
      overall: 'healthy' as 'healthy' | 'degraded' | 'unhealthy',
      totalAgents: agents.length,
      healthyAgents: 0,
      unhealthyAgents: 0,
      idleAgents: 0,
      busyAgents: 0,
      errorAgents: 0,
      staleAgents: 0, // Agents that haven't reported in > 5 minutes
      details: agents.map((agent) => {
        const isStale = agent.lastActive.getTime() < fiveMinutesAgo;
        const isHealthy = agent.status !== 'error' && !isStale;

        return {
          id: agent.id,
          type: agent.type,
          status: agent.status,
          healthy: isHealthy,
          stale: isStale,
          uptime: now - agent.lastActive.getTime(),
          currentTask: agent.currentTask || null,
          lastActive: agent.lastActive,
        };
      }),
    };

    // Calculate counts
    healthStatus.details.forEach((agent) => {
      if (agent.healthy) healthStatus.healthyAgents++;
      else healthStatus.unhealthyAgents++;

      if (agent.stale) healthStatus.staleAgents++;

      switch (agent.status) {
        case 'idle':
          healthStatus.idleAgents++;
          break;
        case 'busy':
          healthStatus.busyAgents++;
          break;
        case 'error':
          healthStatus.errorAgents++;
          break;
      }
    });

    // Determine overall health
    const healthyPercentage = (healthStatus.healthyAgents / healthStatus.totalAgents) * 100;
    if (healthyPercentage >= 90) {
      healthStatus.overall = 'healthy';
    } else if (healthyPercentage >= 70) {
      healthStatus.overall = 'degraded';
    } else {
      healthStatus.overall = 'unhealthy';
    }

    res.json({
      health: healthStatus,
      recommendations: [
        ...(healthStatus.staleAgents > 0
          ? [`${healthStatus.staleAgents} agents haven't reported recently`]
          : []),
        ...(healthStatus.errorAgents > 0
          ? [`${healthStatus.errorAgents} agents are in error state`]
          : []),
        ...(healthStatus.unhealthyAgents > healthStatus.totalAgents * 0.3
          ? ['High number of unhealthy agents detected']
          : []),
      ],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to fetch agent health', error);
    res.status(500).json({ error: 'Failed to fetch agent health' });
  }
};

// 🟢 NEW: Get external agents only
export const getExternalAgents = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!crossProjectDiscovery) {
      res.json({
        success: true,
        agents: [],
        metrics: { total: 0, byStatus: {}, byType: {}, bySource: {} },
        message: 'Cross-project discovery not initialized',
      });
      return;
    }

    const externalAgents = crossProjectDiscovery.getAllDiscoveredAgents();
    const busyAgents = crossProjectDiscovery.getBusyAgents();
    const metrics = crossProjectDiscovery.getAgentMetrics();

    res.json({
      success: true,
      agents: externalAgents,
      busyAgents,
      metrics,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get external agents:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve external agent information',
    });
  }
};

// 🟢 NEW: Refresh agent discovery
export const refreshAgentDiscovery = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!crossProjectDiscovery) {
      res.status(400).json({
        success: false,
        error: 'Cross-project discovery not initialized',
      });
      return;
    }

    // Force a discovery refresh
    await (crossProjectDiscovery as any).performDiscovery();

    res.json({
      success: true,
      message: 'Agent discovery refreshed',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to refresh agent discovery:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh agent discovery',
    });
  }
};

// 🟢 NEW: Get cross-project agent discovery status
export const getDiscoveryStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const status = {
      enabled: !!crossProjectDiscovery,
      sources: crossProjectDiscovery
        ? Array.from((crossProjectDiscovery as any).sources.keys())
        : [],
      lastDiscovery: crossProjectDiscovery ? new Date().toISOString() : null,
      metrics: crossProjectDiscovery ? crossProjectDiscovery.getAgentMetrics() : null,
    };

    res.json({
      success: true,
      status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get discovery status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve discovery status',
    });
  }
};
