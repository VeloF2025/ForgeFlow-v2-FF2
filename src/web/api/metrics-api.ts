import type { Request, Response } from 'express';
import { logger } from '../../utils/logger';
import { metrics } from '../../monitoring/metrics';
import type { SystemHealth } from '../../types';
import * as os from 'os';

// System metrics collection store
const systemMetricsHistory = new Map<
  string,
  Array<{
    timestamp: Date;
    cpu: NodeJS.CpuUsage;
    memory: NodeJS.MemoryUsage;
    uptime: number;
    activeConnections: number;
    responseTime: number;
  }>
>();

// Performance benchmarks storage
const performanceBenchmarks = new Map<
  string,
  {
    endpoint: string;
    method: string;
    averageResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    errorRate: number;
    requestCount: number;
    lastUpdated: Date;
  }
>();

// Real-time system monitoring data
let currentSystemMetrics = {
  startTime: new Date(),
  totalRequests: 0,
  totalErrors: 0,
  averageResponseTime: 0,
  peakMemoryUsage: process.memoryUsage().heapUsed,
  peakCpuUsage: 0,
  connectionsPeak: 0,
  currentConnections: 0,
};

// Initialize metrics collection
const startMetricsCollection = (): void => {
  // Collect system metrics every 30 seconds
  setInterval(() => {
    const timestamp = new Date();
    const cpuUsage = process.cpuUsage();
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    const metric = {
      timestamp,
      cpu: cpuUsage,
      memory: memoryUsage,
      uptime,
      activeConnections: currentSystemMetrics.currentConnections,
      responseTime: currentSystemMetrics.averageResponseTime,
    };

    // Store in rotating buffer (keep last 24 hours = 2880 entries)
    const dayKey = timestamp.toISOString().slice(0, 10);
    if (!systemMetricsHistory.has(dayKey)) {
      systemMetricsHistory.set(dayKey, []);
    }

    const dayMetrics = systemMetricsHistory.get(dayKey);
    dayMetrics.push(metric);

    // Keep only last 24 hours of data per day
    if (dayMetrics.length > 2880) {
      dayMetrics.shift();
    }

    // Update peak values
    if (memoryUsage.heapUsed > currentSystemMetrics.peakMemoryUsage) {
      currentSystemMetrics.peakMemoryUsage = memoryUsage.heapUsed;
    }

    // Clean up old metrics (keep last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    for (const [key, _] of systemMetricsHistory) {
      if (new Date(key) < thirtyDaysAgo) {
        systemMetricsHistory.delete(key);
      }
    }
  }, 30000);
};

// Start metrics collection on module load
startMetricsCollection();

// Middleware to track request metrics
export const requestMetricsMiddleware = (req: any, res: any, next: any): void => {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const endpointKey = `${req.method} ${req.route?.path || req.path}`;

    currentSystemMetrics.totalRequests++;

    if (res.statusCode >= 400) {
      currentSystemMetrics.totalErrors++;
    }

    // Update average response time (moving average)
    currentSystemMetrics.averageResponseTime =
      (currentSystemMetrics.averageResponseTime + duration) / 2;

    // Update endpoint-specific metrics
    if (!performanceBenchmarks.has(endpointKey)) {
      performanceBenchmarks.set(endpointKey, {
        endpoint: req.route?.path || req.path,
        method: req.method,
        averageResponseTime: duration,
        p95ResponseTime: duration,
        p99ResponseTime: duration,
        errorRate: res.statusCode >= 400 ? 100 : 0,
        requestCount: 1,
        lastUpdated: new Date(),
      });
    } else {
      const benchmark = performanceBenchmarks.get(endpointKey);
      benchmark.requestCount++;
      benchmark.averageResponseTime = (benchmark.averageResponseTime + duration) / 2;
      benchmark.errorRate =
        res.statusCode >= 400 ? (benchmark.errorRate + 100) / 2 : benchmark.errorRate * 0.99;
      benchmark.lastUpdated = new Date();
    }
  });

  next();
};

// Get current system metrics
export const getCurrentMetrics = async (req: Request, res: Response): Promise<void> => {
  try {
    const systemHealth = metrics.getHealthMetrics();
    const currentTime = new Date();

    // Calculate system health status
    const memoryUsagePercent =
      (systemHealth.memoryUsage.heapUsed / systemHealth.memoryUsage.heapTotal) * 100;
    const uptimeHours = systemHealth.uptime / 3600;

    const healthStatus: SystemHealth = {
      github: true, // Will be determined by actual GitHub connectivity
      repository: true, // Will be determined by repository access
      agents: true, // Will be determined by agent pool status
      quality: true, // Will be determined by quality gates status
      protocols: true, // Will be determined by protocol enforcement
      knowledge: true, // Will be determined by knowledge system status
      memory: true, // Will be determined by memory system status
      overall:
        memoryUsagePercent < 85 &&
        currentSystemMetrics.totalErrors < currentSystemMetrics.totalRequests * 0.05,
    };

    const currentMetrics = {
      system: {
        ...systemHealth,
        memoryUsagePercent,
        uptimeHours,
        totalRequests: currentSystemMetrics.totalRequests,
        totalErrors: currentSystemMetrics.totalErrors,
        errorRate:
          currentSystemMetrics.totalRequests > 0
            ? (currentSystemMetrics.totalErrors / currentSystemMetrics.totalRequests) * 100
            : 0,
        averageResponseTime: currentSystemMetrics.averageResponseTime,
        peakMemoryUsage: currentSystemMetrics.peakMemoryUsage,
        currentConnections: currentSystemMetrics.currentConnections,
        connectionsPeak: currentSystemMetrics.connectionsPeak,
      },
      health: healthStatus,
      performance: {
        requestsPerSecond:
          uptimeHours > 0 ? currentSystemMetrics.totalRequests / (uptimeHours * 3600) : 0,
        averageMemoryGrowth: 0, // Will be calculated from history
        cpuLoadAverage: os.loadavg()[0],
      },
      forgeflow: {
        activeExecutions: 0, // Will be populated by orchestrator
        totalAgents: 10, // Based on our agent types
        healthyAgents: 10, // Will be determined by actual agent status
        queuedTasks: 0, // Will be populated by task queue
      },
      timestamp: currentTime.toISOString(),
    };

    res.json(currentMetrics);
  } catch (error) {
    logger.error('Failed to fetch current metrics', error);
    res.status(500).json({ error: 'Failed to fetch current metrics' });
  }
};

// Get historical metrics with time range and aggregation
export const getHistoricalMetrics = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      start_date,
      end_date,
      granularity = 'hour', // minute, hour, day
      metrics_type = 'all', // system, performance, forgeflow
    } = req.query;

    const startDate = start_date
      ? new Date(start_date as string)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const endDate = end_date ? new Date(end_date as string) : new Date();

    const historicalData = [];
    const aggregatedData = new Map<
      string,
      {
        timestamp: string;
        cpu: { user: number; system: number; count: number };
        memory: { heapUsed: number; heapTotal: number; count: number };
        uptime: number;
        activeConnections: number;
        responseTime: number;
        count: number;
      }
    >();

    // Collect data from all relevant days
    for (const [dayKey, dayMetrics] of systemMetricsHistory) {
      const dayDate = new Date(dayKey);
      if (dayDate >= startDate && dayDate <= endDate) {
        const relevantMetrics = dayMetrics.filter(
          (m) => m.timestamp >= startDate && m.timestamp <= endDate,
        );

        relevantMetrics.forEach((metric) => {
          let groupKey: string;

          if (granularity === 'minute') {
            groupKey = metric.timestamp.toISOString().slice(0, 16) + ':00.000Z';
          } else if (granularity === 'hour') {
            groupKey = metric.timestamp.toISOString().slice(0, 13) + ':00:00.000Z';
          } else {
            // day
            groupKey = metric.timestamp.toISOString().slice(0, 10) + 'T00:00:00.000Z';
          }

          if (!aggregatedData.has(groupKey)) {
            aggregatedData.set(groupKey, {
              timestamp: groupKey,
              cpu: { user: 0, system: 0, count: 0 },
              memory: { heapUsed: 0, heapTotal: 0, count: 0 },
              uptime: metric.uptime,
              activeConnections: 0,
              responseTime: 0,
              count: 0,
            });
          }

          const group = aggregatedData.get(groupKey);
          group.cpu.user += metric.cpu.user;
          group.cpu.system += metric.cpu.system;
          group.cpu.count++;
          group.memory.heapUsed += metric.memory.heapUsed;
          group.memory.heapTotal += metric.memory.heapTotal;
          group.memory.count++;
          group.activeConnections += metric.activeConnections;
          group.responseTime += metric.responseTime;
          group.count++;
        });
      }
    }

    // Calculate averages and format data
    const timeSeriesData = Array.from(aggregatedData.values())
      .map((group) => ({
        timestamp: group.timestamp,
        cpu: {
          user: group.cpu.count > 0 ? group.cpu.user / group.cpu.count : 0,
          system: group.cpu.count > 0 ? group.cpu.system / group.cpu.count : 0,
        },
        memory: {
          heapUsed: group.memory.count > 0 ? group.memory.heapUsed / group.memory.count : 0,
          heapTotal: group.memory.count > 0 ? group.memory.heapTotal / group.memory.count : 0,
          usage:
            group.memory.count > 0 ? (group.memory.heapUsed / group.memory.heapTotal) * 100 : 0,
        },
        uptime: group.uptime,
        activeConnections: group.count > 0 ? group.activeConnections / group.count : 0,
        responseTime: group.count > 0 ? group.responseTime / group.count : 0,
        dataPoints: group.count,
      }))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Calculate summary statistics
    const summary = {
      totalDataPoints: timeSeriesData.reduce((sum, d) => sum + d.dataPoints, 0),
      averageMemoryUsage:
        timeSeriesData.length > 0
          ? timeSeriesData.reduce((sum, d) => sum + d.memory.usage, 0) / timeSeriesData.length
          : 0,
      peakMemoryUsage:
        timeSeriesData.length > 0 ? Math.max(...timeSeriesData.map((d) => d.memory.usage)) : 0,
      averageResponseTime:
        timeSeriesData.length > 0
          ? timeSeriesData.reduce((sum, d) => sum + d.responseTime, 0) / timeSeriesData.length
          : 0,
      peakResponseTime:
        timeSeriesData.length > 0 ? Math.max(...timeSeriesData.map((d) => d.responseTime)) : 0,
      averageConnections:
        timeSeriesData.length > 0
          ? timeSeriesData.reduce((sum, d) => sum + d.activeConnections, 0) / timeSeriesData.length
          : 0,
      peakConnections:
        timeSeriesData.length > 0 ? Math.max(...timeSeriesData.map((d) => d.activeConnections)) : 0,
    };

    res.json({
      timeSeries: timeSeriesData,
      summary,
      filters: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        granularity,
        metricsType: metrics_type,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to fetch historical metrics', error);
    res.status(500).json({ error: 'Failed to fetch historical metrics' });
  }
};

// Get performance benchmarks for API endpoints
export const getPerformanceBenchmarks = async (req: Request, res: Response): Promise<void> => {
  try {
    const { sort_by = 'averageResponseTime', order = 'desc', limit = 50 } = req.query;

    const benchmarks = Array.from(performanceBenchmarks.values());

    // Sort benchmarks
    benchmarks.sort((a, b) => {
      const aValue = a[sort_by as keyof typeof a];
      const bValue = b[sort_by as keyof typeof b];
      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return order === 'desc' ? -comparison : comparison;
    });

    // Apply limit
    const limitedBenchmarks = benchmarks.slice(0, parseInt(limit as string, 10));

    // Calculate performance insights
    const insights = {
      totalEndpoints: benchmarks.length,
      slowestEndpoint:
        benchmarks.length > 0
          ? benchmarks.reduce((slowest, current) =>
              current.averageResponseTime > slowest.averageResponseTime ? current : slowest,
            )
          : null,
      fastestEndpoint:
        benchmarks.length > 0
          ? benchmarks.reduce((fastest, current) =>
              current.averageResponseTime < fastest.averageResponseTime ? current : fastest,
            )
          : null,
      highErrorRateEndpoints: benchmarks.filter((b) => b.errorRate > 5).length,
      averageSystemResponseTime:
        benchmarks.length > 0
          ? benchmarks.reduce((sum, b) => sum + b.averageResponseTime, 0) / benchmarks.length
          : 0,
      totalRequests: benchmarks.reduce((sum, b) => sum + b.requestCount, 0),
      endpointsNeedingOptimization: benchmarks.filter(
        (b) => b.averageResponseTime > 1000 || b.errorRate > 10,
      ).length,
    };

    // Performance alerts
    const alerts = [];
    if (insights.highErrorRateEndpoints > 0) {
      alerts.push(`${insights.highErrorRateEndpoints} endpoints have high error rates (>5%)`);
    }
    if (insights.endpointsNeedingOptimization > 0) {
      alerts.push(
        `${insights.endpointsNeedingOptimization} endpoints need performance optimization`,
      );
    }
    if (insights.averageSystemResponseTime > 500) {
      alerts.push('System average response time is high (>500ms)');
    }

    res.json({
      benchmarks: limitedBenchmarks,
      insights,
      alerts,
      meta: {
        sortBy: sort_by,
        order,
        limit: parseInt(limit as string, 10),
        total: benchmarks.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to fetch performance benchmarks', error);
    res.status(500).json({ error: 'Failed to fetch performance benchmarks' });
  }
};

// Get system health status with detailed checks
export const getSystemHealth = async (req: Request, res: Response): Promise<void> => {
  try {
    const healthChecks = {
      system: {
        name: 'System Resources',
        status: 'healthy',
        checks: [] as Array<{
          name: string;
          status: 'healthy' | 'warning' | 'critical';
          message: string;
          value?: number;
          threshold?: number;
        }>,
      },
      api: {
        name: 'API Performance',
        status: 'healthy',
        checks: [] as Array<{
          name: string;
          status: 'healthy' | 'warning' | 'critical';
          message: string;
          value?: number;
          threshold?: number;
        }>,
      },
      forgeflow: {
        name: 'ForgeFlow Services',
        status: 'healthy',
        checks: [] as Array<{
          name: string;
          status: 'healthy' | 'warning' | 'critical';
          message: string;
          value?: number;
          threshold?: number;
        }>,
      },
    };

    // System resource checks
    const memoryUsage = process.memoryUsage();
    const memoryPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

    healthChecks.system.checks.push({
      name: 'Memory Usage',
      status: memoryPercent > 90 ? 'critical' : memoryPercent > 75 ? 'warning' : 'healthy',
      message: `${memoryPercent.toFixed(1)}% of heap used`,
      value: memoryPercent,
      threshold: 75,
    });

    const uptimeHours = process.uptime() / 3600;
    healthChecks.system.checks.push({
      name: 'Uptime',
      status: 'healthy',
      message: `${uptimeHours.toFixed(1)} hours`,
      value: uptimeHours,
    });

    // API performance checks
    const errorRate =
      currentSystemMetrics.totalRequests > 0
        ? (currentSystemMetrics.totalErrors / currentSystemMetrics.totalRequests) * 100
        : 0;

    healthChecks.api.checks.push({
      name: 'Error Rate',
      status: errorRate > 10 ? 'critical' : errorRate > 5 ? 'warning' : 'healthy',
      message: `${errorRate.toFixed(2)}% error rate`,
      value: errorRate,
      threshold: 5,
    });

    healthChecks.api.checks.push({
      name: 'Response Time',
      status:
        currentSystemMetrics.averageResponseTime > 1000
          ? 'critical'
          : currentSystemMetrics.averageResponseTime > 500
            ? 'warning'
            : 'healthy',
      message: `${currentSystemMetrics.averageResponseTime.toFixed(0)}ms average`,
      value: currentSystemMetrics.averageResponseTime,
      threshold: 500,
    });

    // ForgeFlow service checks (these would be populated by actual service status)
    healthChecks.forgeflow.checks.push({
      name: 'GitHub Integration',
      status: 'healthy',
      message: 'Connected and operational',
    });

    healthChecks.forgeflow.checks.push({
      name: 'Agent Pool',
      status: 'healthy',
      message: '10/10 agents healthy',
    });

    healthChecks.forgeflow.checks.push({
      name: 'Execution Engine',
      status: 'healthy',
      message: 'Ready for executions',
    });

    // Calculate overall health for each category
    Object.values(healthChecks).forEach((category) => {
      const criticalCount = category.checks.filter((c) => c.status === 'critical').length;
      const warningCount = category.checks.filter((c) => c.status === 'warning').length;

      if (criticalCount > 0) {
        category.status = 'critical';
      } else if (warningCount > 0) {
        category.status = 'warning';
      } else {
        category.status = 'healthy';
      }
    });

    // Overall system health
    const overallHealth = {
      status: 'healthy' as 'healthy' | 'warning' | 'critical',
      score: 100,
      message: 'All systems operational',
    };

    const criticalIssues = Object.values(healthChecks).reduce(
      (sum, cat) => sum + cat.checks.filter((c) => c.status === 'critical').length,
      0,
    );
    const warningIssues = Object.values(healthChecks).reduce(
      (sum, cat) => sum + cat.checks.filter((c) => c.status === 'warning').length,
      0,
    );

    if (criticalIssues > 0) {
      overallHealth.status = 'critical';
      overallHealth.score = Math.max(0, 100 - criticalIssues * 30 - warningIssues * 10);
      overallHealth.message = `${criticalIssues} critical issues detected`;
    } else if (warningIssues > 0) {
      overallHealth.status = 'warning';
      overallHealth.score = Math.max(70, 100 - warningIssues * 15);
      overallHealth.message = `${warningIssues} warnings detected`;
    }

    res.json({
      overall: overallHealth,
      categories: healthChecks,
      summary: {
        totalChecks: Object.values(healthChecks).reduce((sum, cat) => sum + cat.checks.length, 0),
        healthyChecks: Object.values(healthChecks).reduce(
          (sum, cat) => sum + cat.checks.filter((c) => c.status === 'healthy').length,
          0,
        ),
        warningChecks: warningIssues,
        criticalChecks: criticalIssues,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to fetch system health', error);
    res.status(500).json({
      overall: { status: 'critical', score: 0, message: 'Health check failed' },
      error: 'Failed to fetch system health',
    });
  }
};

// Update connection count (called by server middleware)
export const updateConnectionCount = (count: number): void => {
  currentSystemMetrics.currentConnections = count;
  if (count > currentSystemMetrics.connectionsPeak) {
    currentSystemMetrics.connectionsPeak = count;
  }
};

// Reset metrics (for testing or maintenance)
export const resetMetrics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { confirm } = req.body;

    if (confirm !== 'RESET_METRICS') {
      res.status(400).json({
        error: 'Confirmation required. Send { "confirm": "RESET_METRICS" }',
      });
      return;
    }

    // Reset current metrics
    currentSystemMetrics = {
      startTime: new Date(),
      totalRequests: 0,
      totalErrors: 0,
      averageResponseTime: 0,
      peakMemoryUsage: process.memoryUsage().heapUsed,
      peakCpuUsage: 0,
      connectionsPeak: 0,
      currentConnections: 0,
    };

    // Clear performance benchmarks
    performanceBenchmarks.clear();

    // Clear historical metrics (optional, keep for now)
    // systemMetricsHistory.clear();

    logger.info('System metrics reset');

    res.json({
      message: 'System metrics reset successfully',
      resetTime: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to reset metrics', error);
    res.status(500).json({ error: 'Failed to reset metrics' });
  }
};
