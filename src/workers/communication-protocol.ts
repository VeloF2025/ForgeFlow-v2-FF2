import { EventEmitter } from 'events';
import * as net from 'net';
import * as http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { LogContext } from '../utils/logger';
import { withErrorHandling, ErrorCategory } from '../utils/errors';
import type {
  TaskProgress,
  TaskExecutionResult,
  TaskExecutionRequest,
} from './claude-code-adapter';

export interface CommunicationMessage {
  id: string;
  type: 'request' | 'response' | 'notification' | 'progress' | 'status' | 'error';
  timestamp: Date;
  data: any;
  source: 'orchestrator' | 'adapter' | 'executor' | 'agent';
  target?: 'orchestrator' | 'adapter' | 'executor' | 'agent' | 'broadcast';
}

export interface ClientConnection {
  id: string;
  type: 'orchestrator' | 'dashboard' | 'monitor' | 'api';
  socket: WebSocket;
  subscriptions: string[];
  lastActivity: Date;
}

/**
 * Communication Protocol - Bidirectional Message Passing System
 *
 * Provides real-time communication between FF2 orchestrator, Claude Code adapter,
 * agents, and external monitoring systems through WebSocket connections.
 */
export class CommunicationProtocol extends EventEmitter {
  private port: number;
  private logger: LogContext;
  private adapter: any; // Reference to ClaudeCodeAdapter

  // WebSocket Server
  private server: http.Server | null = null;
  private wsServer: WebSocketServer | null = null;

  // Client management
  private clients: Map<string, ClientConnection>;
  private messageQueue: Map<string, CommunicationMessage[]>;
  private messageHistory: CommunicationMessage[];

  // Performance monitoring
  private stats: {
    messagesProcessed: number;
    connectionsTotal: number;
    activeConnections: number;
    startTime: Date;
    lastActivity: Date;
  };

  constructor(port: number, adapter: any) {
    super();
    this.port = port;
    this.logger = new LogContext('CommunicationProtocol');
    this.adapter = adapter;

    this.clients = new Map();
    this.messageQueue = new Map();
    this.messageHistory = [];

    this.stats = {
      messagesProcessed: 0,
      connectionsTotal: 0,
      activeConnections: 0,
      startTime: new Date(),
      lastActivity: new Date(),
    };
  }

  /**
   * Initialize the communication protocol server
   */
  public async initialize(): Promise<void> {
    this.logger.info(`Initializing Communication Protocol on port ${this.port}`);

    try {
      await withErrorHandling(() => this.startWebSocketServer(), {
        operationName: 'communication-protocol-init',
        category: ErrorCategory.CONFIGURATION,
        retries: 3,
        timeoutMs: 10000,
      });

      this.setupEventHandlers();
      this.startPeriodicMaintenance();

      this.logger.info('Communication Protocol initialized successfully');
      this.emit('protocol:initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Communication Protocol', error);
      throw error;
    }
  }

  private async startWebSocketServer(): Promise<void> {
    // Create HTTP server for WebSocket upgrade
    this.server = http.createServer();

    // Create WebSocket server
    this.wsServer = new WebSocketServer({
      server: this.server,
      path: '/ff2-communication',
      perMessageDeflate: false,
      maxPayload: 1024 * 1024, // 1MB max message size
    });

    // Handle WebSocket connections
    this.wsServer.on('connection', (socket: WebSocket, request: http.IncomingMessage) => {
      this.handleNewConnection(socket, request);
    });

    // Start HTTP server
    await new Promise<void>((resolve, reject) => {
      this.server.listen(this.port, (error?: Error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    this.logger.info(`WebSocket server started on port ${this.port}`);
  }

  private handleNewConnection(socket: WebSocket, request: http.IncomingMessage): void {
    const clientId = this.generateClientId();
    const clientType = this.determineClientType(request);

    const client: ClientConnection = {
      id: clientId,
      type: clientType,
      socket,
      subscriptions: [],
      lastActivity: new Date(),
    };

    this.clients.set(clientId, client);
    this.stats.connectionsTotal++;
    this.stats.activeConnections++;

    this.logger.info(`New ${clientType} connection: ${clientId}`);

    // Send welcome message
    this.sendToClient(clientId, {
      id: this.generateMessageId(),
      type: 'notification',
      timestamp: new Date(),
      data: {
        message: 'Connected to ForgeFlow v2 Communication Protocol',
        clientId,
        serverInfo: {
          version: '2.0.0',
          capabilities: ['task-progress', 'status-updates', 'real-time-monitoring'],
          uptime: Date.now() - this.stats.startTime.getTime(),
        },
      },
      source: 'adapter',
    });

    // Setup socket event handlers
    this.setupSocketHandlers(client);
  }

  private setupSocketHandlers(client: ClientConnection): void {
    const { socket } = client;

    // Handle incoming messages
    socket.on('message', async (data: Buffer) => {
      try {
        const message: CommunicationMessage = JSON.parse(data.toString());
        await this.handleIncomingMessage(client, message);
      } catch (error) {
        this.logger.error(`Error parsing message from client ${client.id}`, error);
        this.sendErrorToClient(client.id, 'Invalid message format', String(error));
      }
    });

    // Handle connection close
    socket.on('close', (code: number, reason: Buffer) => {
      this.logger.info(`Client ${client.id} disconnected: ${code} ${reason.toString()}`);
      this.clients.delete(client.id);
      this.stats.activeConnections--;
      this.emit('client:disconnected', { clientId: client.id, type: client.type });
    });

    // Handle connection errors
    socket.on('error', (error: Error) => {
      this.logger.error(`Socket error for client ${client.id}`, error);
      this.clients.delete(client.id);
      this.stats.activeConnections--;
    });

    // Setup ping/pong for connection health
    socket.on('pong', () => {
      client.lastActivity = new Date();
    });
  }

  private async handleIncomingMessage(
    client: ClientConnection,
    message: CommunicationMessage,
  ): Promise<void> {
    client.lastActivity = new Date();
    this.stats.messagesProcessed++;
    this.stats.lastActivity = new Date();

    this.logger.debug(
      `Received ${message.type} from ${client.id}: ${message.data?.action || 'no-action'}`,
    );

    // Add to message history
    this.messageHistory.push(message);
    if (this.messageHistory.length > 1000) {
      this.messageHistory = this.messageHistory.slice(-500); // Keep last 500 messages
    }

    try {
      switch (message.type) {
        case 'request':
          await this.handleRequest(client, message);
          break;

        case 'response':
          await this.handleResponse(client, message);
          break;

        case 'notification':
          await this.handleNotification(client, message);
          break;

        default:
          this.logger.warning(`Unknown message type: ${message.type} from client ${client.id}`);
      }
    } catch (error) {
      this.logger.error(`Error handling message from client ${client.id}`, error);
      this.sendErrorToClient(client.id, 'Message processing error', String(error));
    }
  }

  private async handleRequest(
    client: ClientConnection,
    message: CommunicationMessage,
  ): Promise<void> {
    const { action, data } = message.data;

    switch (action) {
      case 'subscribe':
        await this.handleSubscription(client, data.topics);
        break;

      case 'unsubscribe':
        await this.handleSubscription(client, data.topics);
        break;

      case 'get-status':
        await this.handleStatusRequest(client, message);
        break;

      case 'get-tasks':
        await this.handleTasksRequest(client, message);
        break;

      case 'get-metrics':
        await this.handleMetricsRequest(client, message);
        break;

      case 'cancel-task':
        await this.handleTaskCancellation(client, message, data.taskId);
        break;

      default:
        this.sendErrorToClient(client.id, `Unknown action: ${action}`);
    }
  }

  private async handleSubscription(client: ClientConnection, topics: string[]): Promise<void> {
    const validTopics = [
      'task-progress',
      'task-completed',
      'task-failed',
      'task-cancelled',
      'agent-started',
      'agent-completed',
      'agent-failed',
      'system-load',
      'worktree-created',
      'worktree-cleaned',
      'protocol-events',
      'error-events',
    ];

    const subscriptions = topics.filter((topic) => validTopics.includes(topic));
    client.subscriptions = [...new Set([...client.subscriptions, ...subscriptions])];

    this.sendToClient(client.id, {
      id: this.generateMessageId(),
      type: 'response',
      timestamp: new Date(),
      data: {
        action: 'subscribed',
        topics: subscriptions,
        message: `Subscribed to ${subscriptions.length} topics`,
      },
      source: 'adapter',
    });

    this.logger.debug(`Client ${client.id} subscribed to: ${subscriptions.join(', ')}`);
  }

  private async handleStatusRequest(
    client: ClientConnection,
    message: CommunicationMessage,
  ): Promise<void> {
    const systemStatus = this.adapter.getSystemStatus();
    const protocolStats = this.getProtocolStats();

    this.sendToClient(client.id, {
      id: this.generateMessageId(),
      type: 'response',
      timestamp: new Date(),
      data: {
        action: 'status-response',
        requestId: message.id,
        system: systemStatus,
        protocol: protocolStats,
      },
      source: 'adapter',
    });
  }

  private async handleTasksRequest(
    client: ClientConnection,
    message: CommunicationMessage,
  ): Promise<void> {
    const activeTasks = this.adapter.getAllTaskStatuses();

    this.sendToClient(client.id, {
      id: this.generateMessageId(),
      type: 'response',
      timestamp: new Date(),
      data: {
        action: 'tasks-response',
        requestId: message.id,
        tasks: activeTasks,
      },
      source: 'adapter',
    });
  }

  private async handleMetricsRequest(
    client: ClientConnection,
    message: CommunicationMessage,
  ): Promise<void> {
    const adapterMetrics = this.adapter.getMetrics();
    const protocolMetrics = this.getProtocolStats();

    this.sendToClient(client.id, {
      id: this.generateMessageId(),
      type: 'response',
      timestamp: new Date(),
      data: {
        action: 'metrics-response',
        requestId: message.id,
        adapter: adapterMetrics,
        protocol: protocolMetrics,
      },
      source: 'adapter',
    });
  }

  private async handleTaskCancellation(
    client: ClientConnection,
    message: CommunicationMessage,
    taskId: string,
  ): Promise<void> {
    try {
      await this.adapter.cancelTask(taskId);

      this.sendToClient(client.id, {
        id: this.generateMessageId(),
        type: 'response',
        timestamp: new Date(),
        data: {
          action: 'task-cancelled',
          requestId: message.id,
          taskId,
          message: 'Task cancellation requested',
        },
        source: 'adapter',
      });
    } catch (error) {
      this.sendErrorToClient(client.id, `Failed to cancel task ${taskId}`, String(error));
    }
  }

  private async handleResponse(
    client: ClientConnection,
    message: CommunicationMessage,
  ): Promise<void> {
    // Handle responses from clients (acknowledgments, etc.)
    this.logger.debug(
      `Received response from ${client.id}: ${message.data?.message || 'no-message'}`,
    );
    this.emit('protocol:response', { client, message });
  }

  private async handleNotification(
    client: ClientConnection,
    message: CommunicationMessage,
  ): Promise<void> {
    // Handle notifications from clients
    this.logger.debug(
      `Received notification from ${client.id}: ${message.data?.type || 'no-type'}`,
    );
    this.emit('protocol:notification', { client, message });
  }

  /**
   * Broadcast task progress to subscribed clients
   */
  public broadcastProgress(progress: TaskProgress): void {
    const message: CommunicationMessage = {
      id: this.generateMessageId(),
      type: 'notification',
      timestamp: new Date(),
      data: {
        type: 'task-progress',
        progress,
      },
      source: 'adapter',
      target: 'broadcast',
    };

    this.broadcastToSubscribers('task-progress', message);
  }

  /**
   * Broadcast task completion to subscribed clients
   */
  public broadcastTaskResult(result: TaskExecutionResult): void {
    const eventType =
      result.status === 'success'
        ? 'task-completed'
        : result.status === 'failure'
          ? 'task-failed'
          : 'task-cancelled';

    const message: CommunicationMessage = {
      id: this.generateMessageId(),
      type: 'notification',
      timestamp: new Date(),
      data: {
        type: eventType,
        result,
      },
      source: 'adapter',
      target: 'broadcast',
    };

    this.broadcastToSubscribers(eventType, message);
  }

  /**
   * Broadcast system status updates
   */
  public broadcastSystemStatus(status: any): void {
    const message: CommunicationMessage = {
      id: this.generateMessageId(),
      type: 'notification',
      timestamp: new Date(),
      data: {
        type: 'system-status',
        status,
      },
      source: 'adapter',
      target: 'broadcast',
    };

    this.broadcastToSubscribers('system-load', message);
  }

  private broadcastToSubscribers(topic: string, message: CommunicationMessage): void {
    const subscribers = Array.from(this.clients.values()).filter(
      (client) =>
        client.subscriptions.includes(topic) && client.socket.readyState === WebSocket.OPEN,
    );

    if (subscribers.length === 0) {
      return;
    }

    const messageString = JSON.stringify(message);

    for (const client of subscribers) {
      try {
        client.socket.send(messageString);
      } catch (error) {
        this.logger.error(`Failed to send message to client ${client.id}`, error);
        // Remove dead connection
        this.clients.delete(client.id);
        this.stats.activeConnections--;
      }
    }

    this.logger.debug(`Broadcasted ${topic} to ${subscribers.length} clients`);
  }

  private sendToClient(clientId: string, message: CommunicationMessage): void {
    const client = this.clients.get(clientId);
    if (!client || client.socket.readyState !== WebSocket.OPEN) {
      this.logger.debug(`Cannot send message to client ${clientId}: not connected`);
      return;
    }

    try {
      client.socket.send(JSON.stringify(message));
    } catch (error) {
      this.logger.error(`Failed to send message to client ${clientId}`, error);
      this.clients.delete(clientId);
      this.stats.activeConnections--;
    }
  }

  private sendErrorToClient(clientId: string, error: string, details?: string): void {
    this.sendToClient(clientId, {
      id: this.generateMessageId(),
      type: 'error',
      timestamp: new Date(),
      data: {
        error,
        details,
        clientId,
      },
      source: 'adapter',
    });
  }

  private determineClientType(request: http.IncomingMessage): ClientConnection['type'] {
    const userAgent = request.headers['user-agent'] || '';
    const origin = request.headers.origin || '';

    if (userAgent.includes('ForgeFlow-Dashboard')) {
      return 'dashboard';
    } else if (userAgent.includes('ForgeFlow-Monitor')) {
      return 'monitor';
    } else if (userAgent.includes('ForgeFlow-Orchestrator')) {
      return 'orchestrator';
    } else {
      return 'api';
    }
  }

  private generateClientId(): string {
    return `client-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  private setupEventHandlers(): void {
    // Listen to adapter events
    this.adapter.on('task:progress', (progress: TaskProgress) => {
      this.broadcastProgress(progress);
    });

    this.adapter.on('task:completed', (result: TaskExecutionResult) => {
      this.broadcastTaskResult(result);
    });

    this.adapter.on('task:failed', (result: TaskExecutionResult) => {
      this.broadcastTaskResult(result);
    });

    this.adapter.on('task:cancelled', (result: TaskExecutionResult) => {
      this.broadcastTaskResult(result);
    });

    this.adapter.on('system:load', (status: any) => {
      this.broadcastSystemStatus(status);
    });

    this.logger.debug('Event handlers configured');
  }

  private startPeriodicMaintenance(): void {
    // Periodic connection health check
    setInterval(() => {
      this.performHealthCheck();
    }, 30000); // Every 30 seconds

    // Clean up old message history
    setInterval(() => {
      this.cleanupMessageHistory();
    }, 300000); // Every 5 minutes

    this.logger.debug('Periodic maintenance started');
  }

  private performHealthCheck(): void {
    const staleThreshold = Date.now() - 5 * 60 * 1000; // 5 minutes

    for (const [clientId, client] of this.clients) {
      if (client.lastActivity.getTime() < staleThreshold) {
        this.logger.info(`Removing stale client connection: ${clientId}`);
        client.socket.close(1000, 'Stale connection cleanup');
        this.clients.delete(clientId);
        this.stats.activeConnections--;
        continue;
      }

      // Send ping to check connection
      if (client.socket.readyState === WebSocket.OPEN) {
        try {
          client.socket.ping();
        } catch (error) {
          this.logger.debug(`Failed to ping client ${clientId}`, error);
          this.clients.delete(clientId);
          this.stats.activeConnections--;
        }
      }
    }
  }

  private cleanupMessageHistory(): void {
    // Keep only recent messages
    const cutoff = Date.now() - 60 * 60 * 1000; // 1 hour
    this.messageHistory = this.messageHistory.filter((msg) => msg.timestamp.getTime() > cutoff);
  }

  private getProtocolStats(): {
    activeConnections: number;
    totalConnections: number;
    messagesProcessed: number;
    uptime: number;
    messageHistory: number;
    clientTypes: Record<string, number>;
  } {
    const clientTypes: Record<string, number> = {};
    for (const client of this.clients.values()) {
      clientTypes[client.type] = (clientTypes[client.type] || 0) + 1;
    }

    return {
      activeConnections: this.stats.activeConnections,
      totalConnections: this.stats.connectionsTotal,
      messagesProcessed: this.stats.messagesProcessed,
      uptime: Date.now() - this.stats.startTime.getTime(),
      messageHistory: this.messageHistory.length,
      clientTypes,
    };
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down Communication Protocol...');

    try {
      // Close all client connections
      for (const [clientId, client] of this.clients) {
        try {
          client.socket.close(1000, 'Server shutdown');
        } catch (error) {
          this.logger.debug(`Error closing client ${clientId}`, error);
        }
      }
      this.clients.clear();

      // Close WebSocket server
      if (this.wsServer) {
        await new Promise<void>((resolve) => {
          this.wsServer!.close(() => {
            this.logger.debug('WebSocket server closed');
            resolve();
          });
        });
      }

      // Close HTTP server
      if (this.server) {
        await new Promise<void>((resolve) => {
          this.server.close(() => {
            this.logger.debug('HTTP server closed');
            resolve();
          });
        });
      }

      this.logger.info('Communication Protocol shutdown complete');
      this.emit('protocol:shutdown');
    } catch (error) {
      this.logger.error('Error during Communication Protocol shutdown', error);
      throw error;
    }
  }
}
