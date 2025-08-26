// Performance Monitor - System-wide tracking and optimization
// Real-time performance analytics with automatic optimization recommendations

import type {
  PerformanceAnalytics,
  PerformanceReport,
  SystemPerformanceAnalysis,
  PerformanceBottleneck,
  OptimizationPlan,
  ComponentPerformance,
  ResourceAnalysis,
  TimeRange,
  JobOutcome,
  EvaluationConfig,
  TrendIndicator,
} from './types';
import type { JobOutcomeTracker } from './job-outcome-tracker';
import { enhancedLogger } from '../utils/enhanced-logger';
import { promises as fs } from 'fs';
import { join } from 'path';
import { performance } from 'perf_hooks';
import { cpus, totalmem, freemem, loadavg } from 'os';

export class SystemPerformanceMonitor implements PerformanceAnalytics {
  private config: EvaluationConfig;
  private jobTracker: JobOutcomeTracker;

  // Performance tracking data
  private performanceMetrics = new Map<
    string,
    Array<{
      timestamp: Date;
      duration: number;
      success: boolean;
      resourceUsage: {
        cpu: number;
        memory: number;
        disk: number;
      };
    }>
  >();

  private systemMetrics: Array<{
    timestamp: Date;
    cpu: number[];
    memory: { total: number; free: number; used: number };
    load: number[];
  }> = [];

  private componentStatus = new Map<
    string,
    {
      isHealthy: boolean;
      lastCheck: Date;
      errorCount: number;
      avgResponseTime: number;
    }
  >();

  private bottleneckHistory: PerformanceBottleneck[] = [];
  private optimizationHistory: OptimizationPlan[] = [];

  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;

  private performanceTracker = {
    reportsGenerated: 0,
    totalAnalysisTime: 0,
    avgAnalysisTime: 0,
    systemChecks: 0,
    bottlenecksIdentified: 0,
    optimizationsGenerated: 0,
    lastCheck: new Date(),
  };

  constructor(config: EvaluationConfig, jobTracker: JobOutcomeTracker) {
    this.config = config;
    this.jobTracker = jobTracker;
    this.initializeMonitoring();
  }

  /**
   * Initialize performance monitoring system
   */
  private async initializeMonitoring(): Promise<void> {
    try {
      // Load historical data
      await this.loadPerformanceData();

      // Start continuous monitoring
      await this.startMonitoring();

      // Initialize component status
      await this.initializeComponentStatus();

      enhancedLogger.info('Performance monitor initialized', {
        monitoringEnabled: this.isMonitoring,
        componentsTracked: this.componentStatus.size,
        historicalMetrics: this.systemMetrics.length,
      });
    } catch (error) {
      enhancedLogger.error('Failed to initialize performance monitor', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Start continuous system monitoring
   */
  private async startMonitoring(): Promise<void> {
    if (this.isMonitoring) return;

    this.isMonitoring = true;

    // Monitor system metrics every 30 seconds
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.collectSystemMetrics();
        await this.performHealthChecks();
      } catch (error) {
        enhancedLogger.error('Error during system monitoring', undefined, {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }, 30000);

    enhancedLogger.info('System monitoring started', {
      interval: '30 seconds',
    });
  }

  /**
   * Stop system monitoring
   */
  async stopMonitoring(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.isMonitoring = false;
    await this.savePerformanceData();

    enhancedLogger.info('System monitoring stopped');
  }

  /**
   * Track job performance metrics
   */
  async trackJobPerformance(job: JobOutcome): Promise<void> {
    try {
      const componentKey = job.metadata.agentTypes.join('|') || 'unknown';

      if (!this.performanceMetrics.has(componentKey)) {
        this.performanceMetrics.set(componentKey, []);
      }

      const metrics = this.performanceMetrics.get(componentKey);

      // Add performance data point
      metrics.push({
        timestamp: job.timestamp,
        duration: job.metadata.duration || 0,
        success: job.success,
        resourceUsage: {
          cpu: job.metrics.resources.cpuUsage,
          memory: job.metrics.resources.memoryUsage,
          disk: job.metrics.resources.diskUsage,
        },
      });

      // Keep only last 1000 metrics per component
      if (metrics.length > 1000) {
        this.performanceMetrics.set(componentKey, metrics.slice(-1000));
      }

      // Update component status
      this.updateComponentStatus(componentKey, job);

      enhancedLogger.debug('Job performance tracked', {
        jobId: job.jobId,
        component: componentKey,
        duration: job.metadata.duration,
        success: job.success,
      });
    } catch (error) {
      enhancedLogger.error('Failed to track job performance', undefined, {
        jobId: job.jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Generate comprehensive performance report
   */
  async generatePerformanceReport(timeRange: TimeRange): Promise<PerformanceReport> {
    const startTime = performance.now();

    try {
      // Get job outcomes for the time range
      const jobs = await this.jobTracker.getJobOutcomes({
        timeRange,
        limit: 10000,
      });

      // Calculate overall performance metrics
      const overall = this.calculateOverallPerformance(jobs);

      // Analyze component performance
      const components = this.analyzeComponentPerformance(jobs);

      // Calculate performance trends
      const trends = this.calculatePerformanceTrends(jobs, timeRange);

      // Check SLA compliance
      const slaCompliance = this.checkSLACompliance(jobs);

      const report: PerformanceReport = {
        timeRange,
        timestamp: new Date(),
        overall,
        components,
        trends,
        slaCompliance,
      };

      // Update performance tracking
      const duration = performance.now() - startTime;
      this.updateAnalysisMetrics(duration);

      enhancedLogger.info('Performance report generated', {
        timeRange,
        jobsAnalyzed: jobs.length,
        duration,
        overallThroughput: overall.jobThroughput,
      });

      return report;
    } catch (error) {
      enhancedLogger.error('Failed to generate performance report', undefined, {
        timeRange,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Calculate overall system performance
   */
  private calculateOverallPerformance(jobs: JobOutcome[]): PerformanceReport['overall'] {
    if (jobs.length === 0) {
      return {
        avgJobDuration: 0,
        jobThroughput: 0,
        systemUptime: 1.0,
        resourceUtilization: 0,
      };
    }

    // Calculate average job duration
    const jobsWithDuration = jobs.filter((job) => job.metadata.duration);
    const avgJobDuration =
      jobsWithDuration.length > 0
        ? jobsWithDuration.reduce((sum, job) => sum + (job.metadata.duration || 0), 0) /
          jobsWithDuration.length
        : 0;

    // Calculate job throughput (jobs per hour)
    const timeSpanHours =
      (jobs[jobs.length - 1].timestamp.getTime() - jobs[0].timestamp.getTime()) / (1000 * 60 * 60);
    const jobThroughput = timeSpanHours > 0 ? jobs.length / timeSpanHours : 0;

    // Calculate system uptime (based on successful job completion rate)
    const successRate = jobs.filter((job) => job.success).length / jobs.length;
    const systemUptime = Math.max(0.5, successRate); // Minimum 50% uptime

    // Calculate resource utilization
    const avgResourceUtilization =
      jobs.reduce((sum, job) => {
        const jobUtilization =
          (job.metrics.resources.cpuUsage +
            job.metrics.resources.memoryUsage / 1024 + // Convert MB to GB scale
            job.metrics.resources.diskUsage / 1024) /
          3;
        return sum + jobUtilization;
      }, 0) / jobs.length;

    return {
      avgJobDuration,
      jobThroughput,
      systemUptime,
      resourceUtilization: Math.min(avgResourceUtilization / 100, 1), // Normalize to 0-1
    };
  }

  /**
   * Analyze performance by component
   */
  private analyzeComponentPerformance(jobs: JobOutcome[]): PerformanceReport['components'] {
    const components: PerformanceReport['components'] = {
      agents: {},
      indexing: this.createDefaultComponentPerformance(),
      knowledge: this.createDefaultComponentPerformance(),
      memory: this.createDefaultComponentPerformance(),
      retrieval: this.createDefaultComponentPerformance(),
    };

    // Analyze agent performance
    const agentStats = new Map<
      string,
      {
        durations: number[];
        errors: number;
        total: number;
        resourceUsage: { cpu: number[]; memory: number[]; disk: number[] };
      }
    >();

    for (const job of jobs) {
      for (const agentType of job.metadata.agentTypes) {
        if (!agentStats.has(agentType)) {
          agentStats.set(agentType, {
            durations: [],
            errors: 0,
            total: 0,
            resourceUsage: { cpu: [], memory: [], disk: [] },
          });
        }

        const stats = agentStats.get(agentType);
        stats.total++;

        if (job.metadata.duration) {
          stats.durations.push(job.metadata.duration);
        }

        if (!job.success) {
          stats.errors++;
        }

        // Track resource usage
        stats.resourceUsage.cpu.push(job.metrics.resources.cpuUsage);
        stats.resourceUsage.memory.push(job.metrics.resources.memoryUsage);
        stats.resourceUsage.disk.push(job.metrics.resources.diskUsage);
      }
    }

    // Convert agent stats to component performance
    for (const [agentType, stats] of agentStats) {
      const avgDuration =
        stats.durations.length > 0
          ? stats.durations.reduce((sum, d) => sum + d, 0) / stats.durations.length
          : 0;

      const maxDuration = stats.durations.length > 0 ? Math.max(...stats.durations) : 0;
      const minDuration = stats.durations.length > 0 ? Math.min(...stats.durations) : 0;

      const errorRate = stats.total > 0 ? stats.errors / stats.total : 0;
      const availability = 1 - errorRate;

      const throughput = stats.total; // Jobs processed

      const avgCpuUsage =
        stats.resourceUsage.cpu.length > 0
          ? stats.resourceUsage.cpu.reduce((sum, cpu) => sum + cpu, 0) /
            stats.resourceUsage.cpu.length
          : 0;

      const avgMemoryUsage =
        stats.resourceUsage.memory.length > 0
          ? stats.resourceUsage.memory.reduce((sum, mem) => sum + mem, 0) /
            stats.resourceUsage.memory.length
          : 0;

      const avgDiskUsage =
        stats.resourceUsage.disk.length > 0
          ? stats.resourceUsage.disk.reduce((sum, disk) => sum + disk, 0) /
            stats.resourceUsage.disk.length
          : 0;

      components.agents[agentType] = {
        avgDuration,
        maxDuration,
        minDuration,
        throughput,
        errorRate,
        availability,
        resourceUsage: {
          cpu: avgCpuUsage,
          memory: avgMemoryUsage,
          disk: avgDiskUsage,
        },
      };
    }

    return components;
  }

  /**
   * Create default component performance structure
   */
  private createDefaultComponentPerformance(): ComponentPerformance {
    return {
      avgDuration: 0,
      maxDuration: 0,
      minDuration: 0,
      throughput: 0,
      errorRate: 0,
      availability: 1.0,
      resourceUsage: {
        cpu: 0,
        memory: 0,
        disk: 0,
      },
    };
  }

  /**
   * Calculate performance trends
   */
  private calculatePerformanceTrends(
    jobs: JobOutcome[],
    timeRange: TimeRange,
  ): PerformanceReport['trends'] {
    // Split jobs into two halves for comparison
    const midpoint = new Date(
      timeRange.start.getTime() + (timeRange.end.getTime() - timeRange.start.getTime()) / 2,
    );
    const firstHalf = jobs.filter((job) => job.timestamp < midpoint);
    const secondHalf = jobs.filter((job) => job.timestamp >= midpoint);

    // Calculate metrics for each half
    const firstHalfMetrics = this.calculatePeriodPerformanceMetrics(firstHalf);
    const secondHalfMetrics = this.calculatePeriodPerformanceMetrics(secondHalf);

    return {
      duration: this.createTrendIndicator(
        secondHalfMetrics.avgDuration,
        firstHalfMetrics.avgDuration,
        false,
      ),
      throughput: this.createTrendIndicator(
        secondHalfMetrics.throughput,
        firstHalfMetrics.throughput,
        true,
      ),
      quality: this.createTrendIndicator(
        secondHalfMetrics.avgQuality,
        firstHalfMetrics.avgQuality,
        true,
      ),
      resourceUsage: this.createTrendIndicator(
        secondHalfMetrics.resourceUsage,
        firstHalfMetrics.resourceUsage,
        false,
      ),
    };
  }

  /**
   * Calculate performance metrics for a period
   */
  private calculatePeriodPerformanceMetrics(jobs: JobOutcome[]): {
    avgDuration: number;
    throughput: number;
    avgQuality: number;
    resourceUsage: number;
  } {
    if (jobs.length === 0) {
      return { avgDuration: 0, throughput: 0, avgQuality: 0, resourceUsage: 0 };
    }

    const avgDuration =
      jobs
        .filter((job) => job.metadata.duration)
        .reduce((sum, job) => sum + (job.metadata.duration || 0), 0) / jobs.length;

    const throughput = jobs.length; // Simple throughput metric

    const avgQuality = jobs.reduce((sum, job) => sum + job.quality.overallScore, 0) / jobs.length;

    const resourceUsage =
      jobs.reduce((sum, job) => {
        return (
          sum +
          (job.metrics.resources.cpuUsage +
            job.metrics.resources.memoryUsage +
            job.metrics.resources.diskUsage) /
            3
        );
      }, 0) / jobs.length;

    return { avgDuration, throughput, avgQuality, resourceUsage };
  }

  /**
   * Create trend indicator
   */
  private createTrendIndicator(
    current: number,
    previous: number,
    higherIsBetter: boolean = true,
  ): TrendIndicator {
    if (previous === 0) {
      return {
        current,
        previous,
        change: 0,
        direction: 'stable',
        significance: 'low',
      };
    }

    const change = ((current - previous) / previous) * 100;
    const absChange = Math.abs(change);

    let direction: TrendIndicator['direction'];
    if (absChange < 2) {
      direction = 'stable';
    } else if ((change > 0 && higherIsBetter) || (change < 0 && !higherIsBetter)) {
      direction = 'up';
    } else {
      direction = 'down';
    }

    let significance: TrendIndicator['significance'];
    if (absChange > 15) {
      significance = 'high';
    } else if (absChange > 5) {
      significance = 'medium';
    } else {
      significance = 'low';
    }

    return {
      current,
      previous,
      change,
      direction,
      significance,
    };
  }

  /**
   * Check SLA compliance
   */
  private checkSLACompliance(jobs: JobOutcome[]): PerformanceReport['slaCompliance'] {
    const jobsWithDuration = jobs.filter((job) => job.metadata.duration);

    // Job logging SLA (< 10ms target)
    const jobLoggingTimes = jobsWithDuration.map((job) => 5); // Simulated - would get actual logging times
    const avgJobLoggingTime =
      jobLoggingTimes.reduce((sum, time) => sum + time, 0) / jobLoggingTimes.length || 0;

    // Pattern analysis SLA (< 100ms target)
    const patternAnalysisTimes = jobsWithDuration.map((job) => 50); // Simulated
    const avgPatternAnalysisTime =
      patternAnalysisTimes.reduce((sum, time) => sum + time, 0) / patternAnalysisTimes.length || 0;

    // Analytics generation SLA (< 2000ms target)
    const analyticsGenerationTime = 1500; // Simulated

    // Quality assessment SLA (continuous target)
    const avgQualityAssessmentTime = 10; // Simulated

    return {
      jobLogging: {
        target: this.config.performanceThresholds.jobLoggingMs,
        actual: avgJobLoggingTime,
        compliance:
          avgJobLoggingTime <= this.config.performanceThresholds.jobLoggingMs
            ? 1.0
            : this.config.performanceThresholds.jobLoggingMs / avgJobLoggingTime,
      },
      patternAnalysis: {
        target: this.config.performanceThresholds.patternAnalysisMs,
        actual: avgPatternAnalysisTime,
        compliance:
          avgPatternAnalysisTime <= this.config.performanceThresholds.patternAnalysisMs
            ? 1.0
            : this.config.performanceThresholds.patternAnalysisMs / avgPatternAnalysisTime,
      },
      analyticsGeneration: {
        target: this.config.performanceThresholds.analyticsGenerationMs,
        actual: analyticsGenerationTime,
        compliance:
          analyticsGenerationTime <= this.config.performanceThresholds.analyticsGenerationMs
            ? 1.0
            : this.config.performanceThresholds.analyticsGenerationMs / analyticsGenerationTime,
      },
      qualityAssessment: {
        target: this.config.performanceThresholds.qualityAssessmentMs || 100,
        actual: avgQualityAssessmentTime,
        compliance:
          avgQualityAssessmentTime <= (this.config.performanceThresholds.qualityAssessmentMs || 100)
            ? 1.0
            : (this.config.performanceThresholds.qualityAssessmentMs || 100) /
              avgQualityAssessmentTime,
      },
    };
  }

  /**
   * Analyze current system performance
   */
  async analyzeSystemPerformance(): Promise<SystemPerformanceAnalysis> {
    const startTime = performance.now();

    try {
      // Collect current system metrics
      await this.collectSystemMetrics();

      // Calculate system health
      const health = this.calculateSystemHealth();

      // Analyze capacity
      const capacity = this.analyzeSystemCapacity();

      // Analyze resources
      const resources = this.analyzeSystemResources();

      // Generate predictions
      const predictions = this.generateSystemPredictions();

      const analysis: SystemPerformanceAnalysis = {
        timestamp: new Date(),
        health,
        capacity,
        resources,
        predictions,
      };

      const duration = performance.now() - startTime;
      this.updateAnalysisMetrics(duration);

      enhancedLogger.info('System performance analyzed', {
        overallHealth: health.overall,
        currentLoad: capacity.currentLoad,
        duration,
      });

      return analysis;
    } catch (error) {
      enhancedLogger.error('Failed to analyze system performance', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Calculate overall system health
   */
  private calculateSystemHealth(): SystemPerformanceAnalysis['health'] {
    let overallHealth = 0;
    let componentCount = 0;
    const components: Record<string, number> = {};
    let criticalIssues = 0;
    let warnings = 0;

    // Analyze component health
    for (const [componentName, status] of this.componentStatus) {
      const health = status.isHealthy ? 1.0 : 0.3;
      components[componentName] = health;

      overallHealth += health;
      componentCount++;

      if (!status.isHealthy) {
        if (status.errorCount > 10) {
          criticalIssues++;
        } else {
          warnings++;
        }
      }
    }

    // Calculate overall health
    overallHealth = componentCount > 0 ? overallHealth / componentCount : 1.0;

    // Add system-level factors
    const systemMemory = this.getSystemMemoryHealth();
    const systemCpu = this.getSystemCpuHealth();

    overallHealth = (overallHealth + systemMemory + systemCpu) / 3;

    return {
      overall: Math.max(0, Math.min(1, overallHealth)),
      components,
      criticalIssues,
      warnings,
    };
  }

  /**
   * Get system memory health (0-1)
   */
  private getSystemMemoryHealth(): number {
    const totalMem = totalmem();
    const freeMem = freemem();
    const usedMem = totalMem - freeMem;
    const memoryUsage = usedMem / totalMem;

    // Memory usage above 90% is critical, above 80% is warning
    if (memoryUsage > 0.9) return 0.2;
    if (memoryUsage > 0.8) return 0.6;
    return 1.0;
  }

  /**
   * Get system CPU health (0-1)
   */
  private getSystemCpuHealth(): number {
    const load = loadavg();
    const cpuCount = cpus().length;
    const avgLoad = load[0] / cpuCount; // 1-minute average normalized by CPU count

    // Load above 2.0 is critical, above 1.5 is warning
    if (avgLoad > 2.0) return 0.2;
    if (avgLoad > 1.5) return 0.6;
    return 1.0;
  }

  /**
   * Analyze system capacity
   */
  private analyzeSystemCapacity(): SystemPerformanceAnalysis['capacity'] {
    // Calculate current load based on recent job throughput
    const recentMetrics = this.systemMetrics.slice(-10); // Last 10 measurements
    const avgLoad =
      recentMetrics.length > 0
        ? recentMetrics.reduce((sum, metric) => sum + metric.load[0], 0) / recentMetrics.length
        : 0;

    const currentLoad = Math.min(avgLoad / cpus().length, 1.0);

    // Estimate max capacity (simplified)
    const maxCapacity = cpus().length * 10; // Assume 10 jobs per CPU core per hour

    // Determine utilization trend
    let utilizationTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (recentMetrics.length >= 3) {
      const recent = recentMetrics.slice(-3).map((m) => m.load[0]);
      const trend = (recent[2] - recent[0]) / 2; // Simple linear trend

      if (trend > 0.1) utilizationTrend = 'increasing';
      else if (trend < -0.1) utilizationTrend = 'decreasing';
    }

    // Generate scaling recommendation
    let recommendedScaling = 'maintain current resources';
    if (currentLoad > 0.8) {
      recommendedScaling = 'scale up - high resource utilization detected';
    } else if (currentLoad < 0.2) {
      recommendedScaling = 'consider scaling down - low resource utilization';
    }

    return {
      currentLoad,
      maxCapacity,
      utilizationTrend,
      recommendedScaling,
    };
  }

  /**
   * Analyze system resources
   */
  private analyzeSystemResources(): SystemPerformanceAnalysis['resources'] {
    const totalMem = totalmem();
    const freeMem = freemem();
    const usedMem = totalMem - freeMem;

    // CPU analysis
    const cpuLoad = loadavg();
    const cpuUsage = (cpuLoad[0] / cpus().length) * 100;

    // Memory analysis
    const memoryUsage = (usedMem / totalMem) * 100;

    // Disk analysis (simplified - would use actual disk monitoring)
    const diskUsage = 45; // Simulated 45% disk usage

    // Network analysis (simplified)
    const networkUsage = 20; // Simulated 20% network utilization

    return {
      cpu: this.createResourceAnalysis(cpuUsage, 80, 95, 'stable'),
      memory: this.createResourceAnalysis(memoryUsage, 80, 95, 'increasing'),
      disk: this.createResourceAnalysis(diskUsage, 85, 95, 'stable'),
      network: this.createResourceAnalysis(networkUsage, 70, 90, 'stable'),
    };
  }

  /**
   * Create resource analysis structure
   */
  private createResourceAnalysis(
    current: number,
    alertThreshold: number,
    criticalThreshold: number,
    trend: 'increasing' | 'decreasing' | 'stable',
  ): ResourceAnalysis {
    return {
      current: Math.min(current, 100),
      average: current * 0.9, // Simplified average
      peak: Math.min(current * 1.2, 100), // Simplified peak
      trend,
      alertThreshold,
      criticalThreshold,
    };
  }

  /**
   * Generate system performance predictions
   */
  private generateSystemPredictions(): SystemPerformanceAnalysis['predictions'] {
    // Simple predictions based on current trends
    const currentLoad = this.analyzeSystemCapacity().currentLoad;

    const nextHourLoad = Math.min(currentLoad * 1.1, 1.0); // 10% increase assumption
    const nextDayLoad = Math.min(currentLoad * 1.2, 1.0); // 20% increase assumption

    // Capacity exhaustion prediction
    let capacityExhaustionETA: Date | null = null;
    if (currentLoad > 0.8) {
      // Estimate time to reach 100% based on current growth
      const remainingCapacity = 1.0 - currentLoad;
      const growthRate = 0.01; // 1% per hour assumption
      const hoursToExhaustion = remainingCapacity / growthRate;

      capacityExhaustionETA = new Date(Date.now() + hoursToExhaustion * 60 * 60 * 1000);
    }

    const recommendations = [];
    if (currentLoad > 0.8) {
      recommendations.push('Consider scaling up resources');
      recommendations.push('Optimize high-resource operations');
    }
    if (nextHourLoad > 0.9) {
      recommendations.push('Monitor system closely');
      recommendations.push('Prepare for potential load balancing');
    }

    return {
      nextHourLoad,
      nextDayLoad,
      capacityExhaustionETA,
      recommendations,
    };
  }

  /**
   * Identify system bottlenecks
   */
  async identifyBottlenecks(): Promise<PerformanceBottleneck[]> {
    try {
      const bottlenecks: PerformanceBottleneck[] = [];

      // Analyze component performance data
      for (const [componentName, metrics] of this.performanceMetrics) {
        const bottleneck = this.analyzeComponentForBottlenecks(componentName, metrics);
        if (bottleneck) {
          bottlenecks.push(bottleneck);
        }
      }

      // Analyze system-level bottlenecks
      const systemBottlenecks = this.identifySystemBottlenecks();
      bottlenecks.push(...systemBottlenecks);

      // Sort by severity
      const sortedBottlenecks = bottlenecks.sort((a, b) => {
        const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        return severityOrder[b.severity] - severityOrder[a.severity];
      });

      // Store in history
      this.bottleneckHistory.push(...sortedBottlenecks);
      if (this.bottleneckHistory.length > 100) {
        this.bottleneckHistory = this.bottleneckHistory.slice(-100);
      }

      this.performanceTracker.bottlenecksIdentified += sortedBottlenecks.length;

      enhancedLogger.info('Performance bottlenecks identified', {
        totalBottlenecks: sortedBottlenecks.length,
        critical: sortedBottlenecks.filter((b) => b.severity === 'critical').length,
        high: sortedBottlenecks.filter((b) => b.severity === 'high').length,
      });

      return sortedBottlenecks;
    } catch (error) {
      enhancedLogger.error('Failed to identify bottlenecks', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Analyze component for bottlenecks
   */
  private analyzeComponentForBottlenecks(
    componentName: string,
    metrics: Array<{ timestamp: Date; duration: number; success: boolean; resourceUsage: any }>,
  ): PerformanceBottleneck | null {
    if (metrics.length < 10) return null;

    const recentMetrics = metrics.slice(-50); // Last 50 measurements
    const avgDuration =
      recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length;
    const errorRate = recentMetrics.filter((m) => !m.success).length / recentMetrics.length;

    // Check for performance issues
    let severity: PerformanceBottleneck['severity'] = 'low';
    const issues: string[] = [];

    if (avgDuration > 600000) {
      // > 10 minutes
      severity = 'critical';
      issues.push('Extremely high response time');
    } else if (avgDuration > 300000) {
      // > 5 minutes
      severity = 'high';
      issues.push('High response time');
    } else if (avgDuration > 120000) {
      // > 2 minutes
      severity = 'medium';
      issues.push('Elevated response time');
    }

    if (errorRate > 0.2) {
      severity = 'critical';
      issues.push('High error rate');
    } else if (errorRate > 0.1) {
      severity = severity === 'critical' ? 'critical' : 'high';
      issues.push('Elevated error rate');
    }

    if (issues.length === 0) return null;

    return {
      id: `bottleneck_${componentName}_${Date.now()}`,
      component: componentName,
      severity,
      description: `Performance issues in ${componentName}: ${issues.join(', ')}`,
      impact: {
        avgDelay: avgDuration,
        jobsAffected: recentMetrics.length,
        qualityImpact: errorRate,
      },
      rootCause: this.identifyRootCause(avgDuration, errorRate),
      recommendations: this.generateBottleneckRecommendations(
        componentName,
        avgDuration,
        errorRate,
      ),
    };
  }

  /**
   * Identify system-level bottlenecks
   */
  private identifySystemBottlenecks(): PerformanceBottleneck[] {
    const bottlenecks: PerformanceBottleneck[] = [];

    // Memory bottleneck
    const memoryHealth = this.getSystemMemoryHealth();
    if (memoryHealth < 0.5) {
      bottlenecks.push({
        id: `system_memory_${Date.now()}`,
        component: 'system_memory',
        severity: memoryHealth < 0.3 ? 'critical' : 'high',
        description: 'System memory usage is critically high',
        impact: {
          avgDelay: 5000, // 5s estimated delay
          jobsAffected: 100, // Estimated
          qualityImpact: 0.3,
        },
        rootCause: 'Insufficient available memory',
        recommendations: [
          {
            solution: 'Increase system memory',
            effort: 'medium',
            expectedImprovement: 0.8,
            implementationTime: '1-2 hours',
          },
          {
            solution: 'Optimize memory usage in applications',
            effort: 'high',
            expectedImprovement: 0.6,
            implementationTime: '1-3 days',
          },
        ],
      });
    }

    // CPU bottleneck
    const cpuHealth = this.getSystemCpuHealth();
    if (cpuHealth < 0.5) {
      bottlenecks.push({
        id: `system_cpu_${Date.now()}`,
        component: 'system_cpu',
        severity: cpuHealth < 0.3 ? 'critical' : 'high',
        description: 'System CPU usage is critically high',
        impact: {
          avgDelay: 3000, // 3s estimated delay
          jobsAffected: 150, // Estimated
          qualityImpact: 0.2,
        },
        rootCause: 'High CPU load affecting all operations',
        recommendations: [
          {
            solution: 'Scale up CPU resources',
            effort: 'low',
            expectedImprovement: 0.7,
            implementationTime: '30 minutes',
          },
          {
            solution: 'Optimize CPU-intensive operations',
            effort: 'high',
            expectedImprovement: 0.5,
            implementationTime: '2-5 days',
          },
        ],
      });
    }

    return bottlenecks;
  }

  /**
   * Identify root cause of performance issues
   */
  private identifyRootCause(avgDuration: number, errorRate: number): string {
    if (errorRate > 0.2) {
      return 'High error rate indicates systematic issues or overload';
    }

    if (avgDuration > 600000) {
      return 'Extremely slow processing indicates resource constraints or inefficient algorithms';
    }

    if (avgDuration > 120000) {
      return 'Slow processing may indicate resource contention or inefficient operations';
    }

    return 'Performance degradation detected';
  }

  /**
   * Generate bottleneck recommendations
   */
  private generateBottleneckRecommendations(
    component: string,
    avgDuration: number,
    errorRate: number,
  ): PerformanceBottleneck['recommendations'] {
    const recommendations: PerformanceBottleneck['recommendations'] = [];

    // Duration-based recommendations
    if (avgDuration > 300000) {
      recommendations.push({
        solution: 'Implement parallel processing',
        effort: 'high',
        expectedImprovement: 0.6,
        implementationTime: '3-7 days',
      });

      recommendations.push({
        solution: 'Add caching layer',
        effort: 'medium',
        expectedImprovement: 0.4,
        implementationTime: '1-2 days',
      });
    }

    // Error-based recommendations
    if (errorRate > 0.1) {
      recommendations.push({
        solution: 'Implement circuit breaker pattern',
        effort: 'medium',
        expectedImprovement: 0.7,
        implementationTime: '1-3 days',
      });

      recommendations.push({
        solution: 'Add retry logic with exponential backoff',
        effort: 'low',
        expectedImprovement: 0.3,
        implementationTime: '4-8 hours',
      });
    }

    // Component-specific recommendations
    if (component.includes('agent')) {
      recommendations.push({
        solution: 'Optimize agent resource allocation',
        effort: 'medium',
        expectedImprovement: 0.5,
        implementationTime: '2-4 days',
      });
    }

    return recommendations;
  }

  /**
   * Generate optimization plan
   */
  async generateOptimizationPlan(): Promise<OptimizationPlan> {
    try {
      const bottlenecks = await this.identifyBottlenecks();

      // Categorize optimizations by implementation time
      const quickFixes: OptimizationPlan['quickFixes'] = [];
      const mediumTerm: OptimizationPlan['mediumTerm'] = [];
      const longTerm: OptimizationPlan['longTerm'] = [];

      // Process bottleneck recommendations
      for (const bottleneck of bottlenecks) {
        for (const recommendation of bottleneck.recommendations) {
          const optimization = {
            id: `opt_${bottleneck.id}_${Date.now()}`,
            title: recommendation.solution,
            description: `Address ${bottleneck.component} bottleneck: ${bottleneck.description}`,
            implementation: recommendation.solution,
            expectedGain: recommendation.expectedImprovement * 100,
            timeRequired: recommendation.implementationTime,
            risk:
              recommendation.effort === 'high'
                ? ('high' as const)
                : recommendation.effort === 'medium'
                  ? ('medium' as const)
                  : ('low' as const),
          };

          // Categorize by implementation time
          if (recommendation.implementationTime.includes('hour')) {
            quickFixes.push(optimization);
          } else if (
            recommendation.implementationTime.includes('day') &&
            !recommendation.implementationTime.includes('5-') &&
            !recommendation.implementationTime.includes('7-')
          ) {
            mediumTerm.push({
              ...optimization,
              dependencies: [],
            });
          } else {
            longTerm.push({
              ...optimization,
              investment: `${recommendation.effort} effort optimization`,
              roi:
                optimization.expectedGain /
                (recommendation.effort === 'high'
                  ? 10
                  : recommendation.effort === 'medium'
                    ? 5
                    : 2),
            });
          }
        }
      }

      // Create implementation roadmap
      const roadmap: OptimizationPlan['roadmap'] = [
        {
          phase: 'Phase 1: Quick Fixes',
          duration: '1-3 days',
          optimizations: quickFixes.map((opt) => opt.id),
          milestones: ['Initial performance improvements', 'Quick wins implemented'],
          expectedCumulativeGain:
            quickFixes.reduce((sum, opt) => sum + opt.expectedGain, 0) / quickFixes.length || 0,
        },
      ];

      if (mediumTerm.length > 0) {
        roadmap.push({
          phase: 'Phase 2: Medium-term Improvements',
          duration: '1-2 weeks',
          optimizations: mediumTerm.map((opt) => opt.id),
          milestones: ['Core bottlenecks addressed', 'System stability improved'],
          expectedCumulativeGain:
            mediumTerm.reduce((sum, opt) => sum + opt.expectedGain, 0) / mediumTerm.length || 0,
        });
      }

      if (longTerm.length > 0) {
        roadmap.push({
          phase: 'Phase 3: Strategic Optimizations',
          duration: '3-8 weeks',
          optimizations: longTerm.map((opt) => opt.id),
          milestones: ['Architectural improvements', 'Long-term performance gains'],
          expectedCumulativeGain:
            longTerm.reduce((sum, opt) => sum + opt.expectedGain, 0) / longTerm.length || 0,
        });
      }

      const plan: OptimizationPlan = {
        timestamp: new Date(),
        quickFixes,
        mediumTerm,
        longTerm,
        roadmap,
      };

      // Store in history
      this.optimizationHistory.push(plan);
      if (this.optimizationHistory.length > 50) {
        this.optimizationHistory = this.optimizationHistory.slice(-50);
      }

      this.performanceTracker.optimizationsGenerated++;

      enhancedLogger.info('Optimization plan generated', {
        quickFixes: quickFixes.length,
        mediumTerm: mediumTerm.length,
        longTerm: longTerm.length,
        totalPhases: roadmap.length,
      });

      return plan;
    } catch (error) {
      enhancedLogger.error('Failed to generate optimization plan', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Collect system metrics
   */
  private async collectSystemMetrics(): Promise<void> {
    try {
      const cpuInfo = cpus();
      const load = loadavg();

      const totalMem = totalmem();
      const freeMem = freemem();
      const usedMem = totalMem - freeMem;

      const systemMetric = {
        timestamp: new Date(),
        cpu: cpuInfo.map((cpu) => cpu.speed),
        memory: {
          total: totalMem,
          free: freeMem,
          used: usedMem,
        },
        load,
      };

      this.systemMetrics.push(systemMetric);

      // Keep only last 1000 metrics
      if (this.systemMetrics.length > 1000) {
        this.systemMetrics = this.systemMetrics.slice(-1000);
      }

      this.performanceTracker.systemChecks++;
    } catch (error) {
      enhancedLogger.error('Failed to collect system metrics', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Initialize component status tracking
   */
  private async initializeComponentStatus(): Promise<void> {
    const components = [
      'agents',
      'indexing',
      'knowledge',
      'memory',
      'retrieval',
      'pattern-analysis',
      'job-tracker',
      'quality-assessment',
    ];

    for (const component of components) {
      this.componentStatus.set(component, {
        isHealthy: true,
        lastCheck: new Date(),
        errorCount: 0,
        avgResponseTime: 0,
      });
    }
  }

  /**
   * Update component status based on job outcome
   */
  private updateComponentStatus(componentKey: string, job: JobOutcome): void {
    if (!this.componentStatus.has(componentKey)) {
      this.componentStatus.set(componentKey, {
        isHealthy: true,
        lastCheck: new Date(),
        errorCount: 0,
        avgResponseTime: 0,
      });
    }

    const status = this.componentStatus.get(componentKey);

    status.lastCheck = new Date();

    if (!job.success) {
      status.errorCount++;
      status.isHealthy = status.errorCount < 5; // Healthy if less than 5 recent errors
    } else {
      // Gradually reduce error count on success
      status.errorCount = Math.max(0, status.errorCount - 0.5);
      status.isHealthy = status.errorCount < 5;
    }

    // Update average response time
    if (job.metadata.duration) {
      status.avgResponseTime = (status.avgResponseTime + job.metadata.duration) / 2;
    }
  }

  /**
   * Perform health checks on all components
   */
  private async performHealthChecks(): Promise<void> {
    const now = new Date();

    for (const [componentName, status] of this.componentStatus) {
      // Check if component has been inactive for too long
      const timeSinceLastCheck = now.getTime() - status.lastCheck.getTime();
      const maxInactiveTime = 5 * 60 * 1000; // 5 minutes

      if (timeSinceLastCheck > maxInactiveTime) {
        status.isHealthy = false;
        enhancedLogger.warn('Component inactive for too long', {
          component: componentName,
          lastCheck: status.lastCheck,
          inactiveTime: timeSinceLastCheck,
        });
      }
    }
  }

  /**
   * Update analysis performance metrics
   */
  private updateAnalysisMetrics(duration: number): void {
    this.performanceTracker.reportsGenerated++;
    this.performanceTracker.totalAnalysisTime += duration;
    this.performanceTracker.avgAnalysisTime =
      this.performanceTracker.totalAnalysisTime / this.performanceTracker.reportsGenerated;
    this.performanceTracker.lastCheck = new Date();
  }

  /**
   * Load performance data from storage
   */
  private async loadPerformanceData(): Promise<void> {
    try {
      const dataPath = join(process.cwd(), '.ff2', 'performance-data.json');

      try {
        const content = await fs.readFile(dataPath, 'utf8');
        const data = JSON.parse(content);

        // Load system metrics
        if (data.systemMetrics) {
          this.systemMetrics = data.systemMetrics.map((metric: any) => ({
            ...metric,
            timestamp: new Date(metric.timestamp),
          }));
        }

        // Load bottleneck history
        if (data.bottleneckHistory) {
          this.bottleneckHistory = data.bottleneckHistory;
        }

        // Load optimization history
        if (data.optimizationHistory) {
          this.optimizationHistory = data.optimizationHistory.map((plan: any) => ({
            ...plan,
            timestamp: new Date(plan.timestamp),
          }));
        }
      } catch (readError) {
        // File doesn't exist or is invalid, start fresh
        enhancedLogger.info('No existing performance data found, starting fresh');
      }
    } catch (error) {
      enhancedLogger.error('Failed to load performance data', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Save performance data to storage
   */
  private async savePerformanceData(): Promise<void> {
    try {
      const dataPath = join(process.cwd(), '.ff2', 'performance-data.json');

      const data = {
        systemMetrics: this.systemMetrics,
        bottleneckHistory: this.bottleneckHistory,
        optimizationHistory: this.optimizationHistory,
        lastSaved: new Date().toISOString(),
      };

      await fs.writeFile(dataPath, JSON.stringify(data, null, 2));
    } catch (error) {
      enhancedLogger.error('Failed to save performance data', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): {
    reportsGenerated: number;
    avgAnalysisTime: number;
    systemChecks: number;
    bottlenecksIdentified: number;
    optimizationsGenerated: number;
    isMonitoring: boolean;
    componentsHealthy: number;
    totalComponents: number;
    lastCheck: Date;
  } {
    const healthyComponents = Array.from(this.componentStatus.values()).filter(
      (status) => status.isHealthy,
    ).length;

    return {
      ...this.performanceTracker,
      isMonitoring: this.isMonitoring,
      componentsHealthy: healthyComponents,
      totalComponents: this.componentStatus.size,
    };
  }
}
