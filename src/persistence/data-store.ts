import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger';
import type { ExecutionStatus, AgentMetrics } from '../types';

export interface ExecutionRecord extends ExecutionStatus {
  savedAt: Date;
  completedTasks: number;
  failedTasks: number;
  totalDuration: number;
}

export interface AgentPerformanceRecord {
  agentId: string;
  type: string;
  date: string;
  tasksCompleted: number;
  tasksFailed: number;
  averageTime: number;
  successRate: number;
  errors: string[];
}

export interface SystemMetricsRecord {
  timestamp: Date;
  cpu: NodeJS.CpuUsage;
  memory: NodeJS.MemoryUsage;
  uptime: number;
  activeConnections: number;
  requestsPerSecond: number;
  errorRate: number;
  responseTime: number;
}

export class DataStore {
  private basePath: string;
  private executionsPath: string;
  private agentsPath: string;
  private metricsPath: string;
  private initialized = false;

  constructor(basePath: string = './data') {
    this.basePath = basePath;
    this.executionsPath = path.join(basePath, 'executions');
    this.agentsPath = path.join(basePath, 'agents');
    this.metricsPath = path.join(basePath, 'metrics');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Create directory structure
      await fs.mkdir(this.basePath, { recursive: true });
      await fs.mkdir(this.executionsPath, { recursive: true });
      await fs.mkdir(this.agentsPath, { recursive: true });
      await fs.mkdir(this.metricsPath, { recursive: true });

      // Create index files if they don't exist
      await this.ensureIndexFiles();

      this.initialized = true;
      logger.info('Data store initialized');
    } catch (error) {
      logger.error('Failed to initialize data store', error);
      throw error;
    }
  }

  private async ensureIndexFiles(): Promise<void> {
    const indexFiles = [
      { path: path.join(this.executionsPath, 'index.json'), data: [] },
      { path: path.join(this.agentsPath, 'index.json'), data: {} },
      { path: path.join(this.metricsPath, 'index.json'), data: [] },
    ];

    for (const indexFile of indexFiles) {
      try {
        await fs.access(indexFile.path);
      } catch {
        await fs.writeFile(indexFile.path, JSON.stringify(indexFile.data, null, 2));
      }
    }
  }

  // Execution Records Management
  async saveExecution(execution: ExecutionStatus): Promise<void> {
    try {
      const record: ExecutionRecord = {
        ...execution,
        savedAt: new Date(),
        completedTasks: execution.phases.reduce(
          (sum, p) => sum + p.tasks.filter((t) => t.status === 'completed').length,
          0,
        ),
        failedTasks: execution.phases.reduce(
          (sum, p) => sum + p.tasks.filter((t) => t.status === 'failed').length,
          0,
        ),
        totalDuration:
          execution.endTime && execution.startTime
            ? new Date(execution.endTime).getTime() - new Date(execution.startTime).getTime()
            : 0,
      };

      // Save individual execution file
      const filename = `${execution.id}.json`;
      const filepath = path.join(this.executionsPath, filename);
      await fs.writeFile(filepath, JSON.stringify(record, null, 2));

      // Update index
      await this.updateExecutionsIndex(record);

      logger.debug(`Saved execution ${execution.id}`);
    } catch (error) {
      logger.error('Failed to save execution', error);
      throw error;
    }
  }

  async getExecution(executionId: string): Promise<ExecutionRecord | null> {
    try {
      const filepath = path.join(this.executionsPath, `${executionId}.json`);
      const data = await fs.readFile(filepath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      logger.error('Failed to get execution', error);
      throw error;
    }
  }

  async getAllExecutions(
    limit = 100,
    offset = 0,
  ): Promise<{
    executions: ExecutionRecord[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      const indexPath = path.join(this.executionsPath, 'index.json');
      const indexData = await fs.readFile(indexPath, 'utf-8');
      const index: Array<{ id: string; startTime: string; status: string; pattern: string }> =
        JSON.parse(indexData);

      // Sort by startTime descending
      index.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

      const total = index.length;
      const paginatedIndex = index.slice(offset, offset + limit);
      const executions: ExecutionRecord[] = [];

      for (const item of paginatedIndex) {
        try {
          const execution = await this.getExecution(item.id);
          if (execution) {
            executions.push(execution);
          }
        } catch (error) {
          logger.warn(`Failed to load execution ${item.id}`, error);
        }
      }

      return {
        executions,
        total,
        hasMore: offset + limit < total,
      };
    } catch (error) {
      logger.error('Failed to get all executions', error);
      return { executions: [], total: 0, hasMore: false };
    }
  }

  async getExecutionsByPattern(pattern: string, limit = 50): Promise<ExecutionRecord[]> {
    try {
      const { executions } = await this.getAllExecutions(1000); // Get more to filter
      return executions.filter((e) => e.pattern === pattern).slice(0, limit);
    } catch (error) {
      logger.error('Failed to get executions by pattern', error);
      return [];
    }
  }

  async getExecutionsByDateRange(startDate: Date, endDate: Date): Promise<ExecutionRecord[]> {
    try {
      const { executions } = await this.getAllExecutions(1000);
      return executions.filter((e) => {
        const executionDate = new Date(e.startTime);
        return executionDate >= startDate && executionDate <= endDate;
      });
    } catch (error) {
      logger.error('Failed to get executions by date range', error);
      return [];
    }
  }

  private async updateExecutionsIndex(execution: ExecutionRecord): Promise<void> {
    try {
      const indexPath = path.join(this.executionsPath, 'index.json');
      let index: Array<{ id: string; startTime: string; status: string; pattern: string }> = [];

      try {
        const indexData = await fs.readFile(indexPath, 'utf-8');
        index = JSON.parse(indexData);
      } catch {
        // Index doesn't exist or is corrupted, start fresh
      }

      // Remove existing entry if it exists
      index = index.filter((item) => item.id !== execution.id);

      // Add new entry
      index.push({
        id: execution.id,
        startTime: execution.startTime.toString(),
        status: execution.status,
        pattern: execution.pattern,
      });

      // Keep only last 10000 entries
      if (index.length > 10000) {
        index = index.slice(-10000);
      }

      await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
    } catch (error) {
      logger.error('Failed to update executions index', error);
    }
  }

  // Agent Performance Records Management
  async saveAgentPerformance(agentId: string, metrics: AgentMetrics): Promise<void> {
    try {
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const record: AgentPerformanceRecord = {
        agentId: metrics.agentId,
        type: metrics.type,
        date: today,
        tasksCompleted: metrics.tasksCompleted,
        tasksFailed: metrics.tasksFailed,
        averageTime: metrics.averageTime,
        successRate: metrics.successRate,
        errors: [], // Would be populated from error logs
      };

      const filename = `${agentId}-${today}.json`;
      const filepath = path.join(this.agentsPath, filename);
      await fs.writeFile(filepath, JSON.stringify(record, null, 2));

      await this.updateAgentsIndex(agentId, today, record);

      logger.debug(`Saved agent performance for ${agentId}`);
    } catch (error) {
      logger.error('Failed to save agent performance', error);
    }
  }

  async getAgentPerformance(agentId: string, days = 30): Promise<AgentPerformanceRecord[]> {
    try {
      const records: AgentPerformanceRecord[] = [];
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().slice(0, 10);
        const filename = `${agentId}-${dateStr}.json`;
        const filepath = path.join(this.agentsPath, filename);

        try {
          const data = await fs.readFile(filepath, 'utf-8');
          records.push(JSON.parse(data));
        } catch {
          // File doesn't exist for this date, skip
        }
      }

      return records;
    } catch (error) {
      logger.error('Failed to get agent performance', error);
      return [];
    }
  }

  async getAllAgentsPerformance(date: string): Promise<Record<string, AgentPerformanceRecord>> {
    try {
      const indexPath = path.join(this.agentsPath, 'index.json');
      const indexData = await fs.readFile(indexPath, 'utf-8');
      const index: Record<string, string[]> = JSON.parse(indexData);

      const performance: Record<string, AgentPerformanceRecord> = {};

      for (const [agentId, dates] of Object.entries(index)) {
        if (dates.includes(date)) {
          const filename = `${agentId}-${date}.json`;
          const filepath = path.join(this.agentsPath, filename);

          try {
            const data = await fs.readFile(filepath, 'utf-8');
            performance[agentId] = JSON.parse(data);
          } catch (error) {
            logger.warn(`Failed to load agent performance for ${agentId} on ${date}`, error);
          }
        }
      }

      return performance;
    } catch (error) {
      logger.error('Failed to get all agents performance', error);
      return {};
    }
  }

  private async updateAgentsIndex(
    agentId: string,
    date: string,
    record: AgentPerformanceRecord,
  ): Promise<void> {
    try {
      const indexPath = path.join(this.agentsPath, 'index.json');
      let index: Record<string, string[]> = {};

      try {
        const indexData = await fs.readFile(indexPath, 'utf-8');
        index = JSON.parse(indexData);
      } catch {
        // Index doesn't exist, start fresh
      }

      if (!index[agentId]) {
        index[agentId] = [];
      }

      if (!index[agentId].includes(date)) {
        index[agentId].push(date);
        index[agentId].sort();

        // Keep only last 90 days per agent
        if (index[agentId].length > 90) {
          index[agentId] = index[agentId].slice(-90);
        }
      }

      await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
    } catch (error) {
      logger.error('Failed to update agents index', error);
    }
  }

  // System Metrics Management
  async saveSystemMetrics(metrics: SystemMetricsRecord): Promise<void> {
    try {
      const dateStr = metrics.timestamp.toISOString().slice(0, 10); // YYYY-MM-DD
      const filename = `system-${dateStr}.json`;
      const filepath = path.join(this.metricsPath, filename);

      let dayMetrics: SystemMetricsRecord[] = [];
      try {
        const data = await fs.readFile(filepath, 'utf-8');
        dayMetrics = JSON.parse(data);
      } catch {
        // File doesn't exist, start with empty array
      }

      dayMetrics.push(metrics);

      // Keep only last 2880 entries per day (every 30 seconds for 24 hours)
      if (dayMetrics.length > 2880) {
        dayMetrics = dayMetrics.slice(-2880);
      }

      await fs.writeFile(filepath, JSON.stringify(dayMetrics, null, 2));

      logger.debug(`Saved system metrics for ${dateStr}`);
    } catch (error) {
      logger.error('Failed to save system metrics', error);
    }
  }

  async getSystemMetrics(startDate: Date, endDate: Date): Promise<SystemMetricsRecord[]> {
    try {
      const metrics: SystemMetricsRecord[] = [];

      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().slice(0, 10);
        const filename = `system-${dateStr}.json`;
        const filepath = path.join(this.metricsPath, filename);

        try {
          const data = await fs.readFile(filepath, 'utf-8');
          const dayMetrics: SystemMetricsRecord[] = JSON.parse(data);

          // Filter by exact time range
          const filteredMetrics = dayMetrics.filter((m) => {
            const metricTime = new Date(m.timestamp);
            return metricTime >= startDate && metricTime <= endDate;
          });

          metrics.push(...filteredMetrics);
        } catch {
          // File doesn't exist for this date, skip
        }
      }

      return metrics.sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
    } catch (error) {
      logger.error('Failed to get system metrics', error);
      return [];
    }
  }

  // Cleanup old data
  async cleanup(retentionDays = 90): Promise<void> {
    try {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      const cutoffDateStr = cutoffDate.toISOString().slice(0, 10);

      // Cleanup old execution files
      const executionFiles = await fs.readdir(this.executionsPath);
      for (const file of executionFiles) {
        if (file.endsWith('.json') && file !== 'index.json') {
          const filepath = path.join(this.executionsPath, file);
          const stats = await fs.stat(filepath);
          if (stats.mtime < cutoffDate) {
            await fs.unlink(filepath);
            logger.debug(`Cleaned up old execution file: ${file}`);
          }
        }
      }

      // Cleanup old agent performance files
      const agentFiles = await fs.readdir(this.agentsPath);
      for (const file of agentFiles) {
        if (file.includes('-') && file.endsWith('.json') && file !== 'index.json') {
          const dateStr = file.split('-').pop()?.replace('.json', '');
          if (dateStr && dateStr < cutoffDateStr) {
            await fs.unlink(path.join(this.agentsPath, file));
            logger.debug(`Cleaned up old agent performance file: ${file}`);
          }
        }
      }

      // Cleanup old system metrics files
      const metricsFiles = await fs.readdir(this.metricsPath);
      for (const file of metricsFiles) {
        if (file.startsWith('system-') && file.endsWith('.json')) {
          const dateStr = file.replace('system-', '').replace('.json', '');
          if (dateStr < cutoffDateStr) {
            await fs.unlink(path.join(this.metricsPath, file));
            logger.debug(`Cleaned up old system metrics file: ${file}`);
          }
        }
      }

      logger.info(`Data cleanup completed (retention: ${retentionDays} days)`);
    } catch (error) {
      logger.error('Failed to cleanup old data', error);
    }
  }

  // Statistics and Analytics
  async getExecutionStatistics(days = 30): Promise<{
    totalExecutions: number;
    completedExecutions: number;
    failedExecutions: number;
    averageDuration: number;
    successRate: number;
    patternUsage: Record<string, number>;
  }> {
    try {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const endDate = new Date();
      const executions = await this.getExecutionsByDateRange(startDate, endDate);

      const stats = {
        totalExecutions: executions.length,
        completedExecutions: executions.filter((e) => e.status === 'completed').length,
        failedExecutions: executions.filter((e) => e.status === 'failed').length,
        averageDuration: 0,
        successRate: 0,
        patternUsage: {} as Record<string, number>,
      };

      if (executions.length > 0) {
        const completedExecs = executions.filter((e) => e.totalDuration > 0);
        stats.averageDuration =
          completedExecs.length > 0
            ? completedExecs.reduce((sum, e) => sum + e.totalDuration, 0) / completedExecs.length
            : 0;

        stats.successRate = (stats.completedExecutions / stats.totalExecutions) * 100;

        stats.patternUsage = executions.reduce(
          (acc, e) => {
            acc[e.pattern] = (acc[e.pattern] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get execution statistics', error);
      return {
        totalExecutions: 0,
        completedExecutions: 0,
        failedExecutions: 0,
        averageDuration: 0,
        successRate: 0,
        patternUsage: {},
      };
    }
  }
}

// Singleton instance
export const dataStore = new DataStore();
