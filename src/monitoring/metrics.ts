import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import type express from 'express';

export class MetricsCollector {
  private registry: Registry;

  // Counters
  private executionCounter: Counter;
  private agentExecutionCounter: Counter;
  private errorCounter: Counter;
  private protocolViolationCounter: Counter;

  // Histograms
  private executionDuration: Histogram;
  private agentExecutionDuration: Histogram;
  private qualityGateDuration: Histogram;

  // Gauges
  private activeExecutions: Gauge;
  private activeAgents: Gauge;
  private worktreeCount: Gauge;
  private queueSize: Gauge;

  constructor() {
    this.registry = new Registry();

    // Collect default Node.js metrics
    collectDefaultMetrics({ register: this.registry });

    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    // Execution metrics
    this.executionCounter = new Counter({
      name: 'forgeflow_executions_total',
      help: 'Total number of executions',
      labelNames: ['pattern', 'status'],
      registers: [this.registry],
    });

    this.agentExecutionCounter = new Counter({
      name: 'forgeflow_agent_executions_total',
      help: 'Total number of agent executions',
      labelNames: ['agent_type', 'status'],
      registers: [this.registry],
    });

    this.errorCounter = new Counter({
      name: 'forgeflow_errors_total',
      help: 'Total number of errors',
      labelNames: ['type', 'severity'],
      registers: [this.registry],
    });

    this.protocolViolationCounter = new Counter({
      name: 'forgeflow_protocol_violations_total',
      help: 'Total number of protocol violations',
      labelNames: ['protocol', 'severity'],
      registers: [this.registry],
    });

    // Duration metrics
    this.executionDuration = new Histogram({
      name: 'forgeflow_execution_duration_seconds',
      help: 'Duration of executions in seconds',
      labelNames: ['pattern'],
      buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300, 600],
      registers: [this.registry],
    });

    this.agentExecutionDuration = new Histogram({
      name: 'forgeflow_agent_execution_duration_seconds',
      help: 'Duration of agent executions in seconds',
      labelNames: ['agent_type'],
      buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120],
      registers: [this.registry],
    });

    this.qualityGateDuration = new Histogram({
      name: 'forgeflow_quality_gate_duration_seconds',
      help: 'Duration of quality gate checks in seconds',
      labelNames: ['gate_type'],
      buckets: [0.1, 0.5, 1, 5, 10, 30],
      registers: [this.registry],
    });

    // Current state metrics
    this.activeExecutions = new Gauge({
      name: 'forgeflow_active_executions',
      help: 'Number of currently active executions',
      registers: [this.registry],
    });

    this.activeAgents = new Gauge({
      name: 'forgeflow_active_agents',
      help: 'Number of currently active agents',
      labelNames: ['agent_type'],
      registers: [this.registry],
    });

    this.worktreeCount = new Gauge({
      name: 'forgeflow_worktree_count',
      help: 'Number of active worktrees',
      registers: [this.registry],
    });

    this.queueSize = new Gauge({
      name: 'forgeflow_queue_size',
      help: 'Size of task queue',
      labelNames: ['queue_type'],
      registers: [this.registry],
    });
  }

  // Increment counters
  incrementExecution(pattern: string, status: 'started' | 'completed' | 'failed'): void {
    this.executionCounter.inc({ pattern, status });
  }

  incrementAgentExecution(agentType: string, status: 'started' | 'completed' | 'failed'): void {
    this.agentExecutionCounter.inc({ agent_type: agentType, status });
  }

  incrementError(type: string, severity: 'warning' | 'error' | 'critical'): void {
    this.errorCounter.inc({ type, severity });
  }

  incrementProtocolViolation(protocol: string, severity: 'warning' | 'error' | 'critical'): void {
    this.protocolViolationCounter.inc({ protocol, severity });
  }

  // Record durations
  recordExecutionDuration(pattern: string, durationSeconds: number): void {
    this.executionDuration.observe({ pattern }, durationSeconds);
  }

  recordAgentExecutionDuration(agentType: string, durationSeconds: number): void {
    this.agentExecutionDuration.observe({ agent_type: agentType }, durationSeconds);
  }

  recordQualityGateDuration(gateType: string, durationSeconds: number): void {
    this.qualityGateDuration.observe({ gate_type: gateType }, durationSeconds);
  }

  // Update gauges
  setActiveExecutions(count: number): void {
    this.activeExecutions.set(count);
  }

  setActiveAgents(agentType: string, count: number): void {
    this.activeAgents.set({ agent_type: agentType }, count);
  }

  setWorktreeCount(count: number): void {
    this.worktreeCount.set(count);
  }

  setQueueSize(queueType: string, size: number): void {
    this.queueSize.set({ queue_type: queueType }, size);
  }

  // Get metrics for export
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  // Create Express middleware
  metricsMiddleware(): express.RequestHandler {
    return async (req, res) => {
      res.set('Content-Type', this.registry.contentType);
      const metrics = await this.getMetrics();
      res.end(metrics);
    };
  }

  // Custom metrics for specific events
  recordExecutionStart(executionId: string, pattern: string): void {
    this.incrementExecution(pattern, 'started');
    this.activeExecutions.inc();
  }

  recordExecutionEnd(
    executionId: string,
    pattern: string,
    success: boolean,
    durationMs: number,
  ): void {
    this.incrementExecution(pattern, success ? 'completed' : 'failed');
    this.recordExecutionDuration(pattern, durationMs / 1000);
    this.activeExecutions.dec();
  }

  recordAgentStart(agentId: string, agentType: string): void {
    this.incrementAgentExecution(agentType, 'started');
    this.activeAgents.inc({ agent_type: agentType });
  }

  recordAgentEnd(agentId: string, agentType: string, success: boolean, durationMs: number): void {
    this.incrementAgentExecution(agentType, success ? 'completed' : 'failed');
    this.recordAgentExecutionDuration(agentType, durationMs / 1000);
    this.activeAgents.dec({ agent_type: agentType });
  }

  // System health metrics
  getHealthMetrics(): {
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    activeConnections: number;
  } {
    return {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      activeConnections: 0, // Will be tracked separately
    };
  }
}

// Singleton instance
export const metrics = new MetricsCollector();
