// 🟢 WORKING: TeamCommunication - Real-time WebSocket-based team communication
// Handles real-time messaging, presence tracking, and team coordination

import { EventEmitter } from 'events';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer, Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import Redis from 'ioredis';
import { logger } from '../utils/enhanced-logger';
import {
  ErrorHandler,
  withErrorHandling,
  ConfigurationError,
  ErrorCategory,
} from '../utils/errors';
import type {
  TeamMessage,
  MessageContent,
  MessageType,
  WebSocketMessage,
  TeamPresence,
  TeamCollaborationConfig,
} from './types';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  teamId?: string;
  memberId?: string;
  lastActivity?: Date;
}

interface ChannelSubscription {
  websocket: AuthenticatedWebSocket;
  userId: string;
  teamId: string;
  channels: Set<string>;
  joinedAt: Date;
}

export class TeamCommunication extends EventEmitter {
  private config: TeamCollaborationConfig;
  private httpServer: HttpServer;
  private wsServer: WebSocketServer;
  private redis: Redis;
  private pubSub: Redis;
  private connections: Map<string, AuthenticatedWebSocket>;
  private subscriptions: Map<string, ChannelSubscription>;
  private presence: Map<string, TeamPresence>;
  private messageQueue: Map<string, WebSocketMessage[]>;
  private heartbeatInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;
  private initialized: boolean = false;

  constructor(config: TeamCollaborationConfig) {
    super();
    this.config = config;
    this.connections = new Map();
    this.subscriptions = new Map();
    this.presence = new Map();
    this.messageQueue = new Map();
  }

  public async initialize(): Promise<void> {
    logger.info('🚀 Initializing TeamCommunication system...');

    try {
      await withErrorHandling(
        async () => {
          // Initialize Redis connections
          this.redis = new Redis({
            host: this.config.redis.host,
            port: this.config.redis.port,
            password: this.config.redis.password,
            db: this.config.redis.database,
            keyPrefix: `${this.config.redis.keyPrefix}:comm:`,
          });

          this.pubSub = new Redis({
            host: this.config.redis.host,
            port: this.config.redis.port,
            password: this.config.redis.password,
            db: this.config.redis.database,
            keyPrefix: `${this.config.redis.keyPrefix}:comm:`,
          });

          // Test Redis connections
          await this.redis.ping();
          await this.pubSub.ping();

          // Setup HTTP server and WebSocket server
          this.httpServer = createServer();
          this.wsServer = new WebSocketServer({
            server: this.httpServer,
            path: this.config.websocket.path,
            maxPayload: 1024 * 1024, // 1MB max message size
          });

          // Setup WebSocket event handlers
          this.setupWebSocketHandlers();

          // Setup Redis pub/sub handlers
          this.setupRedisPubSubHandlers();

          // Start HTTP server
          await new Promise<void>((resolve, reject) => {
            this.httpServer.listen(this.config.websocket.port, (error) => {
              if (error) {
                reject(error);
              } else {
                resolve();
              }
            });
          });

          // Start background processes
          this.startHeartbeat();
          this.startCleanup();

          this.initialized = true;
          logger.info('✅ TeamCommunication initialized successfully', {
            port: this.config.websocket.port,
            path: this.config.websocket.path,
          });
          this.emit('initialized');
        },
        {
          operationName: 'team-communication-initialization',
          category: ErrorCategory.CONFIGURATION,
          retries: 2,
          timeoutMs: 20000,
        },
      );
    } catch (error) {
      const handledError = ErrorHandler.getInstance().handleError(error as Error);
      logger.error('❌ Failed to initialize TeamCommunication', handledError);
      throw handledError;
    }
  }

  private setupWebSocketHandlers(): void {
    this.wsServer.on('connection', (ws: AuthenticatedWebSocket, request) => {
      logger.debug('🔌 New WebSocket connection attempt');

      // Authenticate the connection
      this.authenticateConnection(ws, request)
        .then((authData) => {
          if (authData) {
            this.handleNewConnection(ws, authData);
          } else {
            ws.close(1008, 'Authentication failed');
          }
        })
        .catch((error) => {
          logger.error('❌ WebSocket authentication error', error);
          ws.close(1008, 'Authentication error');
        });
    });

    this.wsServer.on('error', (error) => {
      logger.error('❌ WebSocket server error', error);
      this.emit('error', error);
    });
  }

  private async authenticateConnection(
    ws: AuthenticatedWebSocket,
    request: any,
  ): Promise<{ userId: string; teamId: string; memberId: string } | null> {
    try {
      const url = new URL(request.url || '', 'ws://localhost');
      const token = url.searchParams.get('token');

      if (!token) {
        logger.warn('⚠️ WebSocket connection missing authentication token');
        return null;
      }

      // Verify JWT token
      const decoded = jwt.verify(token, this.config.security.jwtSecret) as any;
      const { userId, teamId, memberId } = decoded;

      if (!userId || !teamId || !memberId) {
        logger.warn('⚠️ Invalid token payload', { userId, teamId, memberId });
        return null;
      }

      return { userId, teamId, memberId };
    } catch (error) {
      logger.error('❌ Token verification failed', error);
      return null;
    }
  }

  private handleNewConnection(
    ws: AuthenticatedWebSocket,
    authData: { userId: string; teamId: string; memberId: string },
  ): void {
    const { userId, teamId, memberId } = authData;
    const connectionId = this.generateConnectionId();

    // Setup connection properties
    ws.userId = userId;
    ws.teamId = teamId;
    ws.memberId = memberId;
    ws.lastActivity = new Date();

    // Store connection
    this.connections.set(connectionId, ws);

    // Create subscription record
    const subscription: ChannelSubscription = {
      websocket: ws,
      userId,
      teamId,
      channels: new Set([`team:${teamId}`, `user:${userId}`]),
      joinedAt: new Date(),
    };
    this.subscriptions.set(connectionId, subscription);

    // Update presence
    this.updatePresence(memberId, teamId, 'online');

    // Setup message handlers
    this.setupConnectionHandlers(ws, connectionId);

    // Subscribe to team channels
    this.subscribeToChannels(connectionId, Array.from(subscription.channels));

    // Send welcome message
    this.sendToConnection(connectionId, {
      type: 'system',
      data: {
        message: 'Connected to team communication system',
        timestamp: new Date().toISOString(),
        channels: Array.from(subscription.channels),
      },
    });

    // Notify team about member connection
    this.emit('member:connected', { memberId, userId, teamId, connectionId });

    logger.info('✅ Team member connected', {
      connectionId,
      userId,
      teamId,
      memberId,
      totalConnections: this.connections.size,
    });
  }

  private setupConnectionHandlers(ws: AuthenticatedWebSocket, connectionId: string): void {
    ws.on('message', (data) => {
      try {
        ws.lastActivity = new Date();
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        this.handleIncomingMessage(connectionId, message);
      } catch (error) {
        logger.error('❌ Failed to parse WebSocket message', error);
        this.sendError(connectionId, 'Invalid message format');
      }
    });

    ws.on('close', (code, reason) => {
      this.handleConnectionClose(connectionId, code, reason.toString());
    });

    ws.on('error', (error) => {
      logger.error('❌ WebSocket connection error', { connectionId, error });
      this.handleConnectionClose(connectionId, 1006, 'Connection error');
    });

    // Setup ping/pong for keepalive
    ws.on('pong', () => {
      ws.lastActivity = new Date();
    });
  }

  private async handleIncomingMessage(connectionId: string, message: WebSocketMessage): Promise<void> {
    const subscription = this.subscriptions.get(connectionId);
    if (!subscription) {
      logger.warn('⚠️ Message from unknown connection', { connectionId });
      return;
    }

    logger.debug('📨 Incoming message', {
      connectionId,
      type: message.type,
      teamId: message.teamId,
      senderId: message.senderId,
    });

    // Validate message
    if (!this.validateMessage(message, subscription)) {
      this.sendError(connectionId, 'Invalid message or insufficient permissions');
      return;
    }

    // Process based on message type
    switch (message.type) {
      case 'chat':
        await this.handleChatMessage(connectionId, message);
        break;
      
      case 'presence':
        await this.handlePresenceUpdate(connectionId, message);
        break;
      
      case 'team_event':
        await this.handleTeamEvent(connectionId, message);
        break;
      
      case 'execution_update':
        await this.handleExecutionUpdate(connectionId, message);
        break;
      
      case 'conflict_alert':
        await this.handleConflictAlert(connectionId, message);
        break;
      
      case 'system':
        await this.handleSystemMessage(connectionId, message);
        break;
      
      default:
        logger.warn('⚠️ Unknown message type', { type: message.type, connectionId });
    }
  }

  private validateMessage(message: WebSocketMessage, subscription: ChannelSubscription): boolean {
    // Basic validation
    if (!message.type || !message.senderId || !message.timestamp) {
      return false;
    }

    // Check if sender matches connection
    if (message.senderId !== subscription.userId) {
      return false;
    }

    // Check team membership
    if (message.teamId && message.teamId !== subscription.teamId) {
      return false;
    }

    return true;
  }

  private async handleChatMessage(connectionId: string, message: WebSocketMessage): Promise<void> {
    const subscription = this.subscriptions.get(connectionId);
    if (!subscription) return;

    // Broadcast to team channel
    const channelKey = `team:${message.teamId}`;
    await this.publishToChannel(channelKey, message);

    // Store message in Redis for history
    const messageKey = `messages:${message.teamId}:${Date.now()}`;
    await this.redis.setex(messageKey, this.config.redis.ttl.messages, JSON.stringify(message));

    this.emit('message:sent', { message, senderId: subscription.userId });
  }

  private async handlePresenceUpdate(connectionId: string, message: WebSocketMessage): Promise<void> {
    const subscription = this.subscriptions.get(connectionId);
    if (!subscription) return;

    const { status, currentProject, currentTask } = message.data;
    
    await this.updatePresence(subscription.websocket.memberId!, subscription.teamId, status, {
      currentProject,
      currentTask,
    });

    // Broadcast presence update to team
    const presenceMessage: WebSocketMessage = {
      ...message,
      type: 'presence',
      data: {
        ...message.data,
        memberId: subscription.websocket.memberId,
      },
    };

    const channelKey = `team:${message.teamId}`;
    await this.publishToChannel(channelKey, presenceMessage);
  }

  private async handleTeamEvent(connectionId: string, message: WebSocketMessage): Promise<void> {
    // Forward team events to appropriate channels
    const channelKey = `team:${message.teamId}`;
    await this.publishToChannel(channelKey, message);

    this.emit('team_event', { message, connectionId });
  }

  private async handleExecutionUpdate(connectionId: string, message: WebSocketMessage): Promise<void> {
    // Broadcast execution updates to interested parties
    const channelKey = `team:${message.teamId}:executions`;
    await this.publishToChannel(channelKey, message);

    this.emit('execution_update', { message, connectionId });
  }

  private async handleConflictAlert(connectionId: string, message: WebSocketMessage): Promise<void> {
    // High priority conflict alerts
    const channelKey = `team:${message.teamId}:conflicts`;
    await this.publishToChannel(channelKey, message);

    this.emit('conflict_alert', { message, connectionId });
  }

  private async handleSystemMessage(connectionId: string, message: WebSocketMessage): Promise<void> {
    // System messages are typically responses, not broadcasts
    logger.debug('📋 System message received', { connectionId, data: message.data });
  }

  private handleConnectionClose(connectionId: string, code: number, reason: string): void {
    const subscription = this.subscriptions.get(connectionId);
    if (subscription) {
      // Update presence to offline
      this.updatePresence(subscription.websocket.memberId!, subscription.teamId, 'offline');

      // Clean up subscriptions
      this.unsubscribeFromChannels(connectionId, Array.from(subscription.channels));
      
      // Remove from maps
      this.subscriptions.delete(connectionId);
      this.connections.delete(connectionId);

      // Notify about disconnection
      this.emit('member:disconnected', {
        memberId: subscription.websocket.memberId,
        userId: subscription.userId,
        teamId: subscription.teamId,
        connectionId,
        code,
        reason,
      });

      logger.info('👋 Team member disconnected', {
        connectionId,
        userId: subscription.userId,
        teamId: subscription.teamId,
        code,
        reason,
        totalConnections: this.connections.size,
      });
    }
  }

  private setupRedisPubSubHandlers(): void {
    this.pubSub.on('message', (channel: string, message: string) => {
      try {
        const wsMessage = JSON.parse(message) as WebSocketMessage;
        this.broadcastToChannel(channel, wsMessage);
      } catch (error) {
        logger.error('❌ Failed to parse Redis pub/sub message', error);
      }
    });

    this.pubSub.on('error', (error) => {
      logger.error('❌ Redis pub/sub error', error);
      this.emit('error', error);
    });
  }

  private subscribeToChannels(connectionId: string, channels: string[]): void {
    for (const channel of channels) {
      this.pubSub.subscribe(channel);
    }
    logger.debug('📡 Subscribed to channels', { connectionId, channels });
  }

  private unsubscribeFromChannels(connectionId: string, channels: string[]): void {
    for (const channel of channels) {
      // Check if any other connections are using this channel
      const stillUsed = Array.from(this.subscriptions.values()).some(
        sub => sub.channels.has(channel) && sub.websocket !== this.connections.get(connectionId)
      );
      
      if (!stillUsed) {
        this.pubSub.unsubscribe(channel);
      }
    }
    logger.debug('📡 Unsubscribed from channels', { connectionId, channels });
  }

  private async publishToChannel(channel: string, message: WebSocketMessage): Promise<void> {
    try {
      await this.redis.publish(channel, JSON.stringify(message));
    } catch (error) {
      logger.error('❌ Failed to publish to Redis channel', { channel, error });
    }
  }

  private broadcastToChannel(channel: string, message: WebSocketMessage): void {
    // Find all subscriptions for this channel
    const targetSubscriptions = Array.from(this.subscriptions.values()).filter(
      sub => sub.channels.has(channel)
    );

    for (const subscription of targetSubscriptions) {
      this.sendToConnection(
        this.getConnectionId(subscription.websocket),
        message
      );
    }

    logger.debug('📢 Broadcast to channel', {
      channel,
      recipients: targetSubscriptions.length,
      messageType: message.type,
    });
  }

  private sendToConnection(connectionId: string, message: Partial<WebSocketMessage>): void {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      const fullMessage: WebSocketMessage = {
        id: this.generateMessageId(),
        timestamp: new Date(),
        requiresAck: false,
        ...message,
      } as WebSocketMessage;

      connection.send(JSON.stringify(fullMessage));
    } catch (error) {
      logger.error('❌ Failed to send message to connection', { connectionId, error });
    }
  }

  private sendError(connectionId: string, error: string): void {
    this.sendToConnection(connectionId, {
      type: 'system',
      senderId: 'system',
      data: {
        error: true,
        message: error,
      },
    });
  }

  // Public API Methods
  public async broadcastToTeam(teamId: string, content: { type: MessageType; content: MessageContent }): Promise<void> {
    const message: WebSocketMessage = {
      id: this.generateMessageId(),
      type: content.type,
      teamId,
      senderId: 'system',
      data: content.content,
      timestamp: new Date(),
      requiresAck: false,
    };

    const channelKey = `team:${teamId}`;
    await this.publishToChannel(channelKey, message);
  }

  public async sendToUser(userId: string, content: { type: MessageType; content: MessageContent }): Promise<void> {
    const message: WebSocketMessage = {
      id: this.generateMessageId(),
      type: content.type,
      senderId: 'system',
      data: content.content,
      timestamp: new Date(),
      requiresAck: false,
    };

    const channelKey = `user:${userId}`;
    await this.publishToChannel(channelKey, message);
  }

  public async updatePresence(
    memberId: string,
    teamId: string,
    status: TeamPresence['status'],
    additional?: {
      currentProject?: string;
      currentTask?: string;
      capabilities?: string[];
      workload?: TeamPresence['workload'];
    }
  ): Promise<void> {
    const presence: TeamPresence = {
      memberId,
      teamId,
      status,
      currentProject: additional?.currentProject,
      currentTask: additional?.currentTask,
      lastSeen: new Date(),
      capabilities: additional?.capabilities || [],
      workload: additional?.workload || { current: 0, capacity: 100, availableSlots: 10 },
    };

    this.presence.set(memberId, presence);

    // Store in Redis
    const presenceKey = `presence:${memberId}`;
    await this.redis.setex(
      presenceKey,
      this.config.redis.ttl.presence,
      JSON.stringify(presence)
    );

    logger.debug('👤 Presence updated', { memberId, teamId, status });
  }

  public getPresence(memberId: string): TeamPresence | undefined {
    return this.presence.get(memberId);
  }

  public getTeamPresence(teamId: string): TeamPresence[] {
    return Array.from(this.presence.values()).filter(p => p.teamId === teamId);
  }

  public async isHealthy(): Promise<boolean> {
    if (!this.initialized) return false;

    try {
      await this.redis.ping();
      await this.pubSub.ping();
      return this.wsServer && this.httpServer.listening;
    } catch (error) {
      logger.error('❌ TeamCommunication health check failed', error);
      return false;
    }
  }

  private startHeartbeat(): void {
    const intervalMs = this.config.websocket.heartbeatInterval;

    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      
      for (const [connectionId, connection] of this.connections) {
        if (connection.readyState === WebSocket.OPEN) {
          // Send ping
          connection.ping();
          
          // Check for stale connections
          const lastActivity = connection.lastActivity || new Date(0);
          const staleThreshold = intervalMs * 3; // 3 missed heartbeats
          
          if (now.getTime() - lastActivity.getTime() > staleThreshold) {
            logger.warn('💔 Closing stale connection', { connectionId });
            connection.close(1008, 'Connection timeout');
          }
        } else {
          // Clean up dead connections
          this.handleConnectionClose(connectionId, 1006, 'Connection lost');
        }
      }
    }, intervalMs);

    logger.debug('💗 Communication heartbeat started', { intervalMs });
  }

  private startCleanup(): void {
    const intervalMs = this.config.performance.cleanupInterval;

    this.cleanupInterval = setInterval(async () => {
      try {
        // Clean up expired presence records
        const now = new Date();
        const expiredPresence: string[] = [];

        for (const [memberId, presence] of this.presence) {
          const age = now.getTime() - presence.lastSeen.getTime();
          if (age > this.config.redis.ttl.presence * 1000) {
            expiredPresence.push(memberId);
          }
        }

        for (const memberId of expiredPresence) {
          this.presence.delete(memberId);
        }

        if (expiredPresence.length > 0) {
          logger.debug('🧹 Cleaned up expired presence records', { count: expiredPresence.length });
        }
      } catch (error) {
        logger.error('❌ Communication cleanup error', error);
      }
    }, intervalMs);

    logger.debug('🧹 Communication cleanup started', { intervalMs });
  }

  private generateConnectionId(): string {
    return `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getConnectionId(ws: AuthenticatedWebSocket): string {
    for (const [id, connection] of this.connections) {
      if (connection === ws) {
        return id;
      }
    }
    return '';
  }

  public async shutdown(): Promise<void> {
    logger.info('🔄 Shutting down TeamCommunication...');

    try {
      // Stop background processes
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
      }
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }

      // Close all WebSocket connections
      for (const [connectionId, connection] of this.connections) {
        connection.close(1001, 'Server shutting down');
      }

      // Close WebSocket server
      if (this.wsServer) {
        this.wsServer.close();
      }

      // Close HTTP server
      if (this.httpServer) {
        await new Promise<void>((resolve) => {
          this.httpServer.close(() => resolve());
        });
      }

      // Close Redis connections
      if (this.redis) {
        await this.redis.disconnect();
      }
      if (this.pubSub) {
        await this.pubSub.disconnect();
      }

      this.initialized = false;
      logger.info('✅ TeamCommunication shutdown complete');
    } catch (error) {
      logger.error('❌ Error during TeamCommunication shutdown', error);
      throw error;
    }
  }
}