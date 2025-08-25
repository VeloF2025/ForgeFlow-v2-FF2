import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import cors from 'cors';
import { Orchestrator } from '../core/orchestrator';
import { loadConfig } from '../utils/config';
import { logger } from '../utils/logger';
import { metrics } from '../monitoring/metrics';
import { createWebhookHandlerWithIO } from './webhook-handler';
import * as githubApi from './api/github-api';
import * as executionsApi from './api/executions-api';
import * as agentsApi from './api/agents-api';
import * as metricsApi from './api/metrics-api';
import { dataStore } from '../persistence/data-store';
import { githubApiService } from './services/github-api';
import { logConfigurationStatus } from '../utils/config-checker';

export class DashboardServer {
  private app: express.Application;
  private server: http.Server;
  private io: SocketIOServer;
  private orchestrator: Orchestrator;
  private port: number;
  private systemMetricsInterval?: NodeJS.Timeout;
  private agentStatusInterval?: NodeJS.Timeout;
  private webhookHandler?: any;

  constructor(port: number = 3000) {
    this.port = port;
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupRealTimeUpdates();
    this.setupWebhookRoute();
  }

  private setupRealTimeUpdates(): void {
    // Broadcast system metrics every 10 seconds
    this.systemMetricsInterval = setInterval(async () => {
      try {
        const systemMetrics = {
          ...metrics.getHealthMetrics(),
          connections: this.io.engine.clientsCount,
          timestamp: new Date().toISOString(),
        };

        this.io.emit('system:metrics', systemMetrics);
      } catch (error) {
        logger.error('Failed to broadcast system metrics', error);
      }
    }, 10000);

    // Broadcast agent status every 15 seconds
    this.agentStatusInterval = setInterval(async () => {
      try {
        // Get real agent status from agents API
        const mockReq = { query: { include_metrics: 'true' } } as any;
        const mockRes = {
          json: (data: any) => {
            this.io.emit('agents:status', {
              ...data,
              timestamp: new Date().toISOString(),
            });
          },
          status: () => mockRes,
        } as any;

        await agentsApi.getAllAgents(mockReq, mockRes);
      } catch (error) {
        logger.error('Failed to broadcast agent status', error);
      }
    }, 15000);

    logger.info('Real-time updates configured');
  }

  private setupWebhookRoute(): void {
    // Initialize webhook handler
    const webhookSecret = process.env['GITHUB_WEBHOOK_SECRET'] || 'dev-secret';
    this.webhookHandler = createWebhookHandlerWithIO(webhookSecret, this.io);

    // Add webhook endpoint with raw body parsing for signature verification
    this.app.use('/webhook/github', express.raw({ type: 'application/json' }));
    this.app.post('/webhook/github', (req, res, next) => {
      // Convert raw buffer back to JSON for webhook handler
      try {
        req.body = JSON.parse(req.body.toString());
        this.webhookHandler!.handle(req, res).catch(next);
      } catch (error) {
        logger.error('Failed to parse webhook payload', error);
        res.status(400).json({ error: 'Invalid JSON payload' });
      }
    });

    logger.info('GitHub webhook endpoint configured at /webhook/github');
  }

  public setOrchestrator(orchestrator: Orchestrator): void {
    this.orchestrator = orchestrator;
    this.setupOrchestratorListeners();

    // 🟢 NEW: Initialize cross-project agent discovery
    agentsApi.setOrchestrator(orchestrator);
    agentsApi.initializeCrossProjectDiscovery();
  }

  private setupOrchestratorListeners(): void {
    if (!this.orchestrator) return;

    // Forward orchestrator events to WebSocket clients
    this.orchestrator.on('execution:started', (execution) => {
      this.io.emit('execution:started', execution);
    });

    this.orchestrator.on('execution:progress', (execution) => {
      this.io.emit('execution:progress', execution);
    });

    this.orchestrator.on('execution:completed', (execution) => {
      this.io.emit('execution:completed', execution);
    });

    this.orchestrator.on('execution:failed', (execution) => {
      this.io.emit('execution:failed', execution);
    });

    this.orchestrator.on('agent:started', (agent) => {
      this.io.emit('agent:started', agent);
    });

    this.orchestrator.on('agent:completed', (agent) => {
      this.io.emit('agent:completed', agent);
    });

    // 🟢 WORKING: Enhanced real-time agent status events
    this.orchestrator.on('agent:failed', (data) => {
      this.io.emit('agent:failed', data);
      this.io.to('agents').emit('agent:status:changed', { type: 'failed', ...data });
    });

    this.orchestrator.on('agent:released', (data) => {
      this.io.emit('agent:released', data);
      this.io.to('agents').emit('agent:status:changed', { type: 'released', ...data });
    });

    this.orchestrator.on('status:changed', (data) => {
      this.io.emit('status:changed', data);
    });
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, 'public')));

    // Add request metrics middleware
    this.app.use(metricsApi.requestMetricsMiddleware);
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      });
    });

    // Metrics endpoint
    this.app.get('/metrics', metrics.metricsMiddleware());

    // API Routes
    this.app.get('/api/status', async (req, res) => {
      if (!this.orchestrator) {
        return res.status(503).json({ error: 'Orchestrator not initialized' });
      }

      const executions = this.orchestrator.getAllExecutions();
      const patterns = this.orchestrator.getAvailablePatterns();

      res.json({
        executions,
        patterns,
        health: metrics.getHealthMetrics(),
      });
    });

    // Execution routes are handled by executionsApi module below

    // GitHub API Routes - Enhanced
    this.app.get('/api/github/user', githubApi.getUserInfo);
    this.app.get('/api/github/repositories', githubApi.getRepositories);
    this.app.get('/api/github/repositories/search', githubApi.searchRepositories);
    this.app.get('/api/github/repositories/:owner/:repo', githubApi.getRepositoryStats);
    this.app.get('/api/github/repositories/:owner/:repo/issues', githubApi.getRepositoryIssues);
    this.app.get(
      '/api/github/repositories/:owner/:repo/milestones',
      githubApi.getRepositoryMilestones,
    );
    this.app.get('/api/github/repositories/:owner/:repo/pulls', githubApi.getRepositoryPulls);
    this.app.get('/api/github/repositories/:owner/:repo/branches', githubApi.getRepositoryBranches);
    this.app.get('/api/github/repositories/:owner/:repo/activity', githubApi.getRepositoryActivity);
    this.app.get('/api/github/repositories/:owner/:repo/insights', githubApi.getRepositoryInsights);
    this.app.post('/api/github/repositories/:owner/:repo/issues', githubApi.createRepositoryIssue);
    this.app.put(
      '/api/github/repositories/:owner/:repo/issues/:issue_number',
      githubApi.updateRepositoryIssue,
    );

    // Repository Management Routes
    this.app.get(
      '/api/github/repositories/:owner/:repo/management',
      githubApi.getRepositoryManagementOptions,
    );
    this.app.post('/api/github/repositories/:owner/:repo/archive', githubApi.archiveRepository);
    this.app.post('/api/github/repositories/:owner/:repo/unarchive', githubApi.unarchiveRepository);
    this.app.delete('/api/github/repositories/:owner/:repo', githubApi.deleteRepository);

    // ForgeFlow Executions API
    this.app.get('/api/executions', executionsApi.getAllExecutions);
    this.app.get('/api/executions/patterns', executionsApi.getExecutionPatterns);
    this.app.get('/api/executions/history', executionsApi.getExecutionHistory);
    this.app.get('/api/executions/metrics', executionsApi.getExecutionMetrics);
    this.app.get('/api/executions/:id', executionsApi.getExecutionDetails);
    this.app.post('/api/executions', executionsApi.startExecution);
    this.app.post('/api/executions/:id/stop', executionsApi.stopExecution);

    // ForgeFlow Agents API
    this.app.get('/api/agents', agentsApi.getAllAgents);
    this.app.get('/api/agents/analytics', agentsApi.getAgentAnalytics);
    this.app.get('/api/agents/health', agentsApi.getAgentHealth);
    this.app.get('/api/agents/:id', agentsApi.getAgentDetails);
    this.app.put('/api/agents/:id/status', agentsApi.updateAgentStatus);
    this.app.post('/api/agents/:agentId/simulate', agentsApi.simulateAgentTask);

    // 🟢 NEW: Cross-Project Agent Discovery API
    this.app.get('/api/agents/external', agentsApi.getExternalAgents);
    this.app.post('/api/agents/discovery/refresh', agentsApi.refreshAgentDiscovery);
    this.app.get('/api/agents/discovery/status', agentsApi.getDiscoveryStatus);

    // System Metrics API
    this.app.get('/api/metrics/current', metricsApi.getCurrentMetrics);
    this.app.get('/api/metrics/historical', metricsApi.getHistoricalMetrics);
    this.app.get('/api/metrics/performance', metricsApi.getPerformanceBenchmarks);
    this.app.get('/api/metrics/health', metricsApi.getSystemHealth);
    this.app.post('/api/metrics/reset', metricsApi.resetMetrics);

    // Real-time connection tracking
    this.io.engine.on('connection_error', (err) => {
      logger.error('Socket.IO connection error:', err);
    });

    // API 404 handler - catch invalid API routes before dashboard
    this.app.use('/api/*', (req, res) => {
      res.status(404).json({
        error: 'API endpoint not found',
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString(),
      });
    });

    // Serve dashboard - MUST BE LAST (catch-all route)
    this.app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
  }

  private setupWebSocket(): void {
    this.io.on('connection', (socket) => {
      logger.info(`Client connected: ${socket.id}`);

      // Update connection count for metrics
      metricsApi.updateConnectionCount(this.io.engine.clientsCount);

      // Send initial status
      if (this.orchestrator) {
        socket.emit('status', {
          executions: this.orchestrator.getAllExecutions(),
          patterns: this.orchestrator.getAvailablePatterns(),
        });
      }

      // Join default rooms for targeted broadcasts
      socket.join('system');
      socket.join('agents');
      socket.join('executions');

      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
        metricsApi.updateConnectionCount(this.io.engine.clientsCount);
      });

      socket.on('error', (error) => {
        logger.error(`Socket error for ${socket.id}:`, error);
      });
    });
  }

  async initialize(): Promise<void> {
    try {
      // Check and log configuration status
      logConfigurationStatus();

      const config = await loadConfig();
      this.orchestrator = new Orchestrator(config);

      // Initialize GitHub API service first
      try {
        await githubApiService.initialize();
        logger.info('GitHub API service initialized successfully');
      } catch (error) {
        logger.warn(
          'GitHub API service initialization failed - GitHub features may not work:',
          error,
        );
        // Don't throw - let the server start without GitHub integration
      }

      // Initialize data persistence
      try {
        await dataStore.initialize();
        logger.info('Data store initialized successfully');
      } catch (error) {
        logger.warn('Data store initialization failed - using in-memory storage:', error);
      }

      // Pass orchestrator to executions API and agents API
      executionsApi.setOrchestrator(this.orchestrator);
      agentsApi.setOrchestrator(this.orchestrator);

      // Listen to orchestrator events
      this.orchestrator.on('execution:started', (status) => {
        this.io.emit('execution:started', status);
        metrics.recordExecutionStart(status.id, status.pattern);
      });

      this.orchestrator.on('execution:progress', (status) => {
        this.io.emit('execution:progress', status);
      });

      this.orchestrator.on('execution:completed', (status) => {
        this.io.emit('execution:completed', status);
        this.io.to('executions').emit('execution:completed', status);
        const duration = status.endTime
          ? new Date(status.endTime).getTime() - new Date(status.startTime).getTime()
          : 0;
        metrics.recordExecutionEnd(status.id, status.pattern, true, duration);

        // Persist execution data
        dataStore
          .saveExecution(status)
          .catch((error) => logger.error('Failed to persist execution data', error));
      });

      this.orchestrator.on('execution:failed', (status) => {
        this.io.emit('execution:failed', status);
        const duration = status.endTime
          ? new Date(status.endTime).getTime() - new Date(status.startTime).getTime()
          : 0;
        metrics.recordExecutionEnd(status.id, status.pattern, false, duration);
      });

      this.orchestrator.on('phase:started', (data) => {
        this.io.emit('phase:started', data);
      });

      this.orchestrator.on('phase:completed', (data) => {
        this.io.emit('phase:completed', data);
      });

      logger.info('Dashboard server initialized');
    } catch (error) {
      logger.error('Failed to initialize dashboard server', error);
      throw error;
    }
  }

  async start(): Promise<void> {
    await this.initialize();

    this.server.listen(this.port, () => {
      logger.info(`🚀 Dashboard server running at http://localhost:${this.port}`);
      logger.info(`📊 Metrics available at http://localhost:${this.port}/metrics`);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      // Clear intervals
      if (this.systemMetricsInterval) {
        clearInterval(this.systemMetricsInterval);
      }
      if (this.agentStatusInterval) {
        clearInterval(this.agentStatusInterval);
      }

      this.server.close(() => {
        logger.info('Dashboard server stopped');
        resolve();
      });
    });
  }
}

// Start server if run directly
if (require.main === module) {
  const server = new DashboardServer(parseInt(process.env['PORT'] || '3000', 10));

  server.start().catch((error) => {
    logger.error('Failed to start dashboard server', error);
    process.exit(1);
  });

  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });
}
