import type { Request, Response } from 'express';
import type { Orchestrator } from '../../core/orchestrator';
import { logger } from '../../utils/logger';
import { metrics } from '../../monitoring/metrics';
import type { ExecutionStatus, ExecutionPattern } from '../../types';

let orchestratorInstance: Orchestrator | null = null;

export const setOrchestrator = (orchestrator: Orchestrator): void => {
  orchestratorInstance = orchestrator;
};

const requireOrchestrator = (): Orchestrator => {
  if (!orchestratorInstance) {
    throw new Error('Orchestrator not initialized');
  }
  return orchestratorInstance;
};

// Get all executions with filtering and pagination
export const getAllExecutions = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      status,
      pattern,
      limit = 50,
      offset = 0,
      sort_by = 'startTime',
      sort_order = 'desc',
    } = req.query;

    const orchestrator = requireOrchestrator();
    let executions = orchestrator.getAllExecutions();

    // Apply filters
    if (status && typeof status === 'string') {
      executions = executions.filter((exec) => exec.status === status);
    }
    if (pattern && typeof pattern === 'string') {
      executions = executions.filter((exec) => exec.pattern === pattern);
    }

    // Sort executions
    const sortField = sort_by as keyof ExecutionStatus;
    executions.sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return sort_order === 'desc' ? -comparison : comparison;
    });

    // Apply pagination
    const total = executions.length;
    const paginatedExecutions = executions.slice(
      parseInt(offset as string, 10),
      parseInt(offset as string, 10) + parseInt(limit as string, 10),
    );

    // Calculate execution statistics
    const stats = {
      total,
      running: executions.filter((e) => e.status === 'running').length,
      completed: executions.filter((e) => e.status === 'completed').length,
      failed: executions.filter((e) => e.status === 'failed').length,
      stopped: executions.filter((e) => e.status === 'stopped').length,
      averageProgress:
        executions.length > 0
          ? executions.reduce((sum, e) => sum + e.progress, 0) / executions.length
          : 0,
      patterns: [...new Set(executions.map((e) => e.pattern))],
    };

    res.json({
      executions: paginatedExecutions.map((execution) => ({
        ...execution,
        duration:
          execution.endTime && execution.startTime
            ? new Date(execution.endTime).getTime() - new Date(execution.startTime).getTime()
            : execution.startTime
              ? Date.now() - new Date(execution.startTime).getTime()
              : null,
        phasesCompleted: execution.phases.filter((p) => p.status === 'completed').length,
        totalPhases: execution.phases.length,
      })),
      pagination: {
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
        total,
        hasMore: parseInt(offset as string, 10) + parseInt(limit as string, 10) < total,
      },
      statistics: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to fetch executions', error);
    res.status(500).json({ error: 'Failed to fetch executions' });
  }
};

// Get specific execution with detailed information
export const getExecutionDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const orchestrator = requireOrchestrator();

    const execution = orchestrator.getExecutionStatus(id);
    if (!execution) {
      res.status(404).json({ error: 'Execution not found' });
      return;
    }

    // Calculate detailed metrics
    const duration =
      execution.endTime && execution.startTime
        ? new Date(execution.endTime).getTime() - new Date(execution.startTime).getTime()
        : execution.startTime
          ? Date.now() - new Date(execution.startTime).getTime()
          : null;

    const phaseMetrics = execution.phases.map((phase) => ({
      ...phase,
      duration:
        (phase as any).endTime && phase.startTime
          ? new Date((phase as any).endTime).getTime() - new Date(phase.startTime).getTime()
          : phase.startTime
            ? Date.now() - new Date(phase.startTime).getTime()
            : null,
      tasksCompleted: phase.tasks.filter((t) => t.status === 'completed').length,
      tasksFailed: phase.tasks.filter((t) => t.status === 'failed').length,
      tasksRunning: phase.tasks.filter((t) => t.status === 'running').length,
    }));

    const detailedExecution = {
      ...execution,
      duration,
      phases: phaseMetrics,
      metrics: {
        totalTasks: execution.phases.reduce((sum, p) => sum + p.tasks.length, 0),
        completedTasks: execution.phases.reduce(
          (sum, p) => sum + p.tasks.filter((t) => t.status === 'completed').length,
          0,
        ),
        failedTasks: execution.phases.reduce(
          (sum, p) => sum + p.tasks.filter((t) => t.status === 'failed').length,
          0,
        ),
        runningTasks: execution.phases.reduce(
          (sum, p) => sum + p.tasks.filter((t) => t.status === 'running').length,
          0,
        ),
        averagePhaseTime:
          phaseMetrics.filter((p) => p.duration).length > 0
            ? phaseMetrics
                .filter((p) => p.duration)
                .reduce((sum, p) => sum + (p.duration || 0), 0) /
              phaseMetrics.filter((p) => p.duration).length
            : null,
      },
    };

    res.json({
      execution: detailedExecution,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to fetch execution details', error);
    res.status(500).json({ error: 'Failed to fetch execution details' });
  }
};

// Start a new execution
export const startExecution = async (req: Request, res: Response): Promise<void> => {
  try {
    const { epicId, pattern, priority = 'normal' } = req.body;

    if (!epicId) {
      res.status(400).json({ error: 'Epic ID is required' });
      return;
    }

    const orchestrator = requireOrchestrator();

    // Record execution start metrics
    metrics.incrementExecution(pattern || 'auto-selected', 'started');

    const execution = await orchestrator.startParallelExecution(epicId, pattern);

    logger.info(
      `Started execution ${execution.id} for epic ${epicId} with pattern ${execution.pattern}`,
    );

    res.status(201).json({
      execution,
      message: 'Execution started successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to start execution', error);
    metrics.incrementError('execution_start', 'error');
    res.status(500).json({ error: 'Failed to start execution' });
  }
};

// Stop a running execution
export const stopExecution = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason = 'User requested' } = req.body;

    const orchestrator = requireOrchestrator();

    const execution = orchestrator.getExecutionStatus(id);
    if (!execution) {
      res.status(404).json({ error: 'Execution not found' });
      return;
    }

    if (execution.status !== 'running') {
      res.status(400).json({ error: 'Execution is not running' });
      return;
    }

    await orchestrator.stopExecution(id);

    logger.info(`Stopped execution ${id}. Reason: ${reason}`);
    metrics.incrementExecution(execution.pattern, 'failed');

    res.json({
      message: 'Execution stopped successfully',
      executionId: id,
      reason,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to stop execution', error);
    res.status(500).json({ error: 'Failed to stop execution' });
  }
};

// Get available execution patterns
export const getExecutionPatterns = async (req: Request, res: Response): Promise<void> => {
  try {
    const orchestrator = requireOrchestrator();
    const patterns = orchestrator.getAvailablePatterns();

    const patternsWithMetrics = patterns.map((pattern) => {
      // Calculate pattern usage metrics from active executions
      const executions = orchestrator.getAllExecutions();
      const patternExecutions = executions.filter((e) => e.pattern === pattern.name);

      const metrics = {
        totalExecutions: patternExecutions.length,
        successRate:
          patternExecutions.length > 0
            ? (patternExecutions.filter((e) => e.status === 'completed').length /
                patternExecutions.length) *
              100
            : 0,
        averageDuration:
          patternExecutions.filter((e) => e.endTime && e.startTime).length > 0
            ? patternExecutions
                .filter((e) => e.endTime && e.startTime)
                .reduce(
                  (sum, e) =>
                    sum + (new Date(e.endTime).getTime() - new Date(e.startTime).getTime()),
                  0,
                ) / patternExecutions.filter((e) => e.endTime && e.startTime).length
            : null,
        lastUsed:
          patternExecutions.length > 0
            ? new Date(Math.max(...patternExecutions.map((e) => new Date(e.startTime).getTime())))
            : null,
      };

      return {
        ...pattern,
        metrics,
        phases: pattern.phases.map((phase) => ({
          ...phase,
          estimatedDuration: null, // TODO: Implement phase duration estimation
          requiredAgents: phase.agents.length,
          parallelCapable: phase.parallel,
        })),
      };
    });

    res.json({
      patterns: patternsWithMetrics,
      total: patternsWithMetrics.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to fetch execution patterns', error);
    res.status(500).json({ error: 'Failed to fetch execution patterns' });
  }
};

// Get execution history and analytics
export const getExecutionHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { days = 30, pattern, group_by = 'day' } = req.query;

    const orchestrator = requireOrchestrator();
    const executions = orchestrator.getAllExecutions();

    // Filter by date range
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days as string, 10));

    let filteredExecutions = executions.filter((e) => new Date(e.startTime) >= cutoffDate);

    // Filter by pattern if specified
    if (pattern && typeof pattern === 'string') {
      filteredExecutions = filteredExecutions.filter((e) => e.pattern === pattern);
    }

    // Group executions by time period
    const groupedData = new Map<
      string,
      {
        date: string;
        executions: number;
        completed: number;
        failed: number;
        stopped: number;
        averageDuration: number;
      }
    >();

    filteredExecutions.forEach((execution) => {
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

      if (!groupedData.has(groupKey)) {
        groupedData.set(groupKey, {
          date: groupKey,
          executions: 0,
          completed: 0,
          failed: 0,
          stopped: 0,
          averageDuration: 0,
        });
      }

      const group = groupedData.get(groupKey);
      group.executions++;

      if (execution.status === 'completed') group.completed++;
      else if (execution.status === 'failed') group.failed++;
      else if (execution.status === 'stopped') group.stopped++;
    });

    // Calculate average durations
    for (const [key, group] of groupedData) {
      const dayExecutions = filteredExecutions.filter((e) => {
        const date = new Date(e.startTime);
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

        return groupKey === key && e.endTime;
      });

      if (dayExecutions.length > 0) {
        const totalDuration = dayExecutions.reduce(
          (sum, e) => sum + (new Date(e.endTime).getTime() - new Date(e.startTime).getTime()),
          0,
        );
        group.averageDuration = totalDuration / dayExecutions.length;
      }
    }

    const historyData = Array.from(groupedData.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    // Calculate summary statistics
    const summary = {
      totalExecutions: filteredExecutions.length,
      totalCompleted: filteredExecutions.filter((e) => e.status === 'completed').length,
      totalFailed: filteredExecutions.filter((e) => e.status === 'failed').length,
      totalStopped: filteredExecutions.filter((e) => e.status === 'stopped').length,
      successRate:
        filteredExecutions.length > 0
          ? (filteredExecutions.filter((e) => e.status === 'completed').length /
              filteredExecutions.length) *
            100
          : 0,
      averageDuration:
        filteredExecutions.filter((e) => e.endTime).length > 0
          ? filteredExecutions
              .filter((e) => e.endTime)
              .reduce(
                (sum, e) => sum + (new Date(e.endTime).getTime() - new Date(e.startTime).getTime()),
                0,
              ) / filteredExecutions.filter((e) => e.endTime).length
          : 0,
      mostUsedPattern:
        filteredExecutions.length > 0
          ? filteredExecutions.reduce(
              (acc, e) => {
                acc[e.pattern] = (acc[e.pattern] || 0) + 1;
                return acc;
              },
              {} as Record<string, number>,
            )
          : {},
      peakHour: null, // TODO: Calculate peak execution hour
    };

    res.json({
      history: historyData,
      summary,
      filters: {
        days: parseInt(days as string, 10),
        pattern: pattern || null,
        groupBy: group_by,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to fetch execution history', error);
    res.status(500).json({ error: 'Failed to fetch execution history' });
  }
};

// Get execution performance metrics
export const getExecutionMetrics = async (req: Request, res: Response): Promise<void> => {
  try {
    const orchestrator = requireOrchestrator();
    const executions = orchestrator.getAllExecutions();

    // Performance metrics calculation
    const performanceMetrics = {
      throughput: {
        executionsPerHour: 0,
        executionsPerDay: 0,
        currentActive: executions.filter((e) => e.status === 'running').length,
      },
      efficiency: {
        averageExecutionTime: 0,
        medianExecutionTime: 0,
        fastestExecution: null as number | null,
        slowestExecution: null as number | null,
      },
      reliability: {
        successRate: 0,
        failureRate: 0,
        stopRate: 0,
        meanTimeBetweenFailures: 0,
      },
      patterns: {} as Record<
        string,
        {
          usage: number;
          successRate: number;
          averageDuration: number;
        }
      >,
    };

    if (executions.length > 0) {
      // Calculate completed execution durations
      const completedExecutions = executions.filter((e) => e.endTime && e.startTime);
      const durations = completedExecutions.map(
        (e) => new Date(e.endTime).getTime() - new Date(e.startTime).getTime(),
      );

      if (durations.length > 0) {
        performanceMetrics.efficiency.averageExecutionTime =
          durations.reduce((a, b) => a + b, 0) / durations.length;
        performanceMetrics.efficiency.fastestExecution = Math.min(...durations);
        performanceMetrics.efficiency.slowestExecution = Math.max(...durations);

        const sortedDurations = durations.sort((a, b) => a - b);
        performanceMetrics.efficiency.medianExecutionTime =
          sortedDurations[Math.floor(sortedDurations.length / 2)];
      }

      // Calculate rates
      const completed = executions.filter((e) => e.status === 'completed').length;
      const failed = executions.filter((e) => e.status === 'failed').length;
      const stopped = executions.filter((e) => e.status === 'stopped').length;
      const total = executions.length;

      performanceMetrics.reliability.successRate = (completed / total) * 100;
      performanceMetrics.reliability.failureRate = (failed / total) * 100;
      performanceMetrics.reliability.stopRate = (stopped / total) * 100;

      // Calculate throughput (last 24 hours)
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recent = executions.filter((e) => new Date(e.startTime) >= last24Hours);
      performanceMetrics.throughput.executionsPerDay = recent.length;
      performanceMetrics.throughput.executionsPerHour = recent.length / 24;

      // Pattern-specific metrics
      const patternGroups = executions.reduce(
        (groups, execution) => {
          if (!groups[execution.pattern]) {
            groups[execution.pattern] = [];
          }
          groups[execution.pattern].push(execution);
          return groups;
        },
        {} as Record<string, typeof executions>,
      );

      Object.entries(patternGroups).forEach(([pattern, patternExecutions]) => {
        const patternCompleted = patternExecutions.filter((e) => e.status === 'completed').length;
        const patternDurations = patternExecutions
          .filter((e) => e.endTime && e.startTime)
          .map((e) => new Date(e.endTime).getTime() - new Date(e.startTime).getTime());

        performanceMetrics.patterns[pattern] = {
          usage: patternExecutions.length,
          successRate: (patternCompleted / patternExecutions.length) * 100,
          averageDuration:
            patternDurations.length > 0
              ? patternDurations.reduce((a, b) => a + b, 0) / patternDurations.length
              : 0,
        };
      });
    }

    // System resource metrics
    const systemMetrics = metrics.getHealthMetrics();

    res.json({
      performance: performanceMetrics,
      system: systemMetrics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to fetch execution metrics', error);
    res.status(500).json({ error: 'Failed to fetch execution metrics' });
  }
};
