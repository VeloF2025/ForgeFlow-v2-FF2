/**
 * Redis Connection Manager for ForgeFlow v2
 * Handles connection pooling, failover, and retry logic
 * Optimized for distributed locking and team collaboration
 */

import Redis, { Cluster, RedisOptions, ClusterOptions } from 'ioredis';
import { EventEmitter } from 'events';
import { Logger } from '../../utils/enhanced-logger';

export interface RedisConnectionConfig {
  // Connection settings
  host?: string;
  port?: number;
  password?: string;
  username?: string;
  db?: number;
  
  // Cluster settings
  cluster?: {
    nodes: Array<{ host: string; port: number }>;
    options?: ClusterOptions;
  };
  
  // Sentinel settings
  sentinels?: Array<{ host: string; port: number }>;
  name?: string; // Sentinel master name
  
  // Connection pool settings
  maxRetriesPerRequest?: number;
  retryDelayOnFailover?: number;
  enableReadyCheck?: boolean;
  maxRetriesPerRequest?: number;
  lazyConnect?: boolean;
  keepAlive?: number;
  
  // Performance settings
  commandTimeout?: number;
  connectTimeout?: number;
  
  // TLS settings
  tls?: {
    cert?: string;
    key?: string;
    ca?: string;
  };
}

export interface ConnectionPoolConfig {
  maxConnections: number;
  minConnections: number;
  acquireTimeoutMillis: number;
  createTimeoutMillis: number;
  destroyTimeoutMillis: number;
  idleTimeoutMillis: number;
  reapIntervalMillis: number;
}

export class RedisConnectionManager extends EventEmitter {
  private readonly logger = Logger.getInstance().child({ component: 'RedisConnectionManager' });
  private connections: Map<string, Redis | Cluster> = new Map();
  private config: RedisConnectionConfig;
  private poolConfig: ConnectionPoolConfig;
  private healthCheckInterval?: NodeJS.Timeout;
  private reconnectAttempts: Map<string, number> = new Map();
  private maxReconnectAttempts = 10;
  private reconnectBackoffMs = 1000;

  constructor(config: RedisConnectionConfig, poolConfig?: Partial<ConnectionPoolConfig>) {
    super();
    this.config = config;
    this.poolConfig = {
      maxConnections: 10,
      minConnections: 2,
      acquireTimeoutMillis: 30000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 300000, // 5 minutes
      reapIntervalMillis: 60000,  // 1 minute
      ...poolConfig
    };
  }

  /**
   * Initialize connection manager
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Redis connection manager', {
        cluster: !!this.config.cluster,
        sentinel: !!this.config.sentinels,
        maxConnections: this.poolConfig.maxConnections
      });

      // Create initial connections
      await this.createInitialConnections();
      
      // Start health checks
      this.startHealthChecks();
      
      // Setup event handlers
      this.setupEventHandlers();
      
      this.logger.info('Redis connection manager initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Redis connection manager', { error });
      throw error;
    }
  }

  /**
   * Get a Redis connection from the pool
   */
  async getConnection(purpose: 'read' | 'write' | 'lock' = 'write'): Promise<Redis | Cluster> {
    const connectionKey = this.getConnectionKey(purpose);
    let connection = this.connections.get(connectionKey);

    if (!connection || connection.status !== 'ready') {
      connection = await this.createConnection(purpose);
      this.connections.set(connectionKey, connection);
    }

    return connection;
  }

  /**
   * Get connection specifically for distributed locking
   */
  async getLockConnection(): Promise<Redis | Cluster> {
    return this.getConnection('lock');
  }

  /**
   * Execute Redis command with retry logic
   */
  async executeCommand<T = any>(
    command: string,
    args: any[] = [],
    purpose: 'read' | 'write' | 'lock' = 'write',
    retries: number = 3
  ): Promise<T> {
    const startTime = Date.now();
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const connection = await this.getConnection(purpose);
        const result = await (connection as any)[command](...args);
        
        // Log successful command execution
        if (Date.now() - startTime > 100) {
          this.logger.warn('Slow Redis command detected', {
            command,
            duration: Date.now() - startTime,
            attempt,
            purpose
          });
        }
        
        return result;
      } catch (error) {
        this.logger.warn(`Redis command failed (attempt ${attempt}/${retries})`, {
          command,
          error: error.message,
          attempt,
          purpose
        });

        if (attempt === retries) {
          this.logger.error('Redis command failed after all retries', {
            command,
            error,
            attempts: retries,
            purpose
          });
          throw error;
        }

        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await this.sleep(delay);
      }
    }

    throw new Error('Redis command failed after all retries');
  }

  /**
   * Execute Lua script with retry logic
   */
  async executeScript<T = any>(
    script: string,
    keys: string[] = [],
    args: any[] = [],
    retries: number = 3
  ): Promise<T> {
    return this.executeCommand('eval', [script, keys.length, ...keys, ...args], 'lock', retries);
  }

  /**
   * Health check for all connections
   */
  async healthCheck(): Promise<boolean> {
    try {
      const promises = Array.from(this.connections.values()).map(async (connection) => {
        try {
          await connection.ping();
          return true;
        } catch (error) {
          this.logger.warn('Redis health check failed for connection', {
            status: connection.status,
            error: error.message
          });
          return false;
        }
      });

      const results = await Promise.all(promises);
      const healthyConnections = results.filter(Boolean).length;
      const totalConnections = results.length;
      
      this.logger.debug('Redis health check completed', {
        healthy: healthyConnections,
        total: totalConnections
      });

      return healthyConnections > 0;
    } catch (error) {
      this.logger.error('Redis health check failed', { error });
      return false;
    }
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    try {
      this.logger.info('Closing Redis connection manager');
      
      // Stop health checks
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }

      // Close all connections
      const closePromises = Array.from(this.connections.values()).map(async (connection) => {
        try {
          await connection.quit();
        } catch (error) {
          this.logger.warn('Error closing Redis connection', { error });
        }
      });

      await Promise.all(closePromises);
      this.connections.clear();
      this.reconnectAttempts.clear();
      
      this.logger.info('Redis connection manager closed');
    } catch (error) {
      this.logger.error('Error closing Redis connection manager', { error });
      throw error;
    }
  }

  /**
   * Create initial connections based on pool configuration
   */
  private async createInitialConnections(): Promise<void> {
    const connectionPromises: Promise<void>[] = [];

    // Create write connections
    for (let i = 0; i < this.poolConfig.minConnections; i++) {
      connectionPromises.push(this.createAndStoreConnection('write', i));
    }

    // Create read connections if using replicas
    if (this.config.sentinels || this.config.cluster) {
      for (let i = 0; i < this.poolConfig.minConnections; i++) {
        connectionPromises.push(this.createAndStoreConnection('read', i));
      }
    }

    // Create dedicated lock connection
    connectionPromises.push(this.createAndStoreConnection('lock', 0));

    await Promise.all(connectionPromises);
  }

  /**
   * Create and store a connection
   */
  private async createAndStoreConnection(purpose: 'read' | 'write' | 'lock', index: number): Promise<void> {
    try {
      const connection = await this.createConnection(purpose);
      const key = `${purpose}-${index}`;
      this.connections.set(key, connection);
    } catch (error) {
      this.logger.error(`Failed to create ${purpose} connection ${index}`, { error });
      throw error;
    }
  }

  /**
   * Create a new Redis connection
   */
  private async createConnection(purpose: 'read' | 'write' | 'lock'): Promise<Redis | Cluster> {
    const baseOptions: RedisOptions = {
      connectTimeout: this.config.connectTimeout || 10000,
      commandTimeout: this.config.commandTimeout || 5000,
      lazyConnect: true,
      enableReadyCheck: true,
      maxRetriesPerRequest: this.config.maxRetriesPerRequest || 3,
      retryDelayOnFailover: this.config.retryDelayOnFailover || 100,
      keepAlive: this.config.keepAlive || 30000,
      password: this.config.password,
      username: this.config.username,
      db: this.config.db || 0,
      ...this.getOptionsForPurpose(purpose)
    };

    let connection: Redis | Cluster;

    if (this.config.cluster) {
      // Cluster mode
      const clusterOptions: ClusterOptions = {
        ...baseOptions,
        enableReadyCheck: true,
        redisOptions: baseOptions,
        ...this.config.cluster.options
      };
      connection = new Cluster(this.config.cluster.nodes, clusterOptions);
    } else if (this.config.sentinels) {
      // Sentinel mode
      const sentinelOptions: RedisOptions = {
        ...baseOptions,
        sentinels: this.config.sentinels,
        name: this.config.name || 'forgeflow-master'
      };
      connection = new Redis(sentinelOptions);
    } else {
      // Single instance
      connection = new Redis({
        ...baseOptions,
        host: this.config.host || 'localhost',
        port: this.config.port || 6379
      });
    }

    // Setup connection event handlers
    this.setupConnectionEventHandlers(connection, purpose);

    // Connect
    await connection.connect();
    
    return connection;
  }

  /**
   * Get connection-specific options based on purpose
   */
  private getOptionsForPurpose(purpose: 'read' | 'write' | 'lock'): Partial<RedisOptions> {
    switch (purpose) {
      case 'read':
        return {
          readOnly: true,
          enableOfflineQueue: false
        };
      case 'lock':
        return {
          enableOfflineQueue: false,
          commandTimeout: 1000, // Faster timeout for locks
          maxRetriesPerRequest: 2
        };
      case 'write':
      default:
        return {};
    }
  }

  /**
   * Get connection key for pooling
   */
  private getConnectionKey(purpose: 'read' | 'write' | 'lock'): string {
    const connections = Array.from(this.connections.keys()).filter(k => k.startsWith(purpose));
    
    if (connections.length === 0) {
      return `${purpose}-0`;
    }

    // Round-robin selection
    const index = Math.floor(Math.random() * connections.length);
    return connections[index];
  }

  /**
   * Setup event handlers for connections
   */
  private setupEventHandlers(): void {
    this.on('connection:error', (error, purpose) => {
      this.logger.error('Redis connection error', { error, purpose });
    });

    this.on('connection:close', (purpose) => {
      this.logger.warn('Redis connection closed', { purpose });
    });

    this.on('connection:reconnecting', (purpose) => {
      this.logger.info('Redis connection reconnecting', { purpose });
    });
  }

  /**
   * Setup event handlers for individual connections
   */
  private setupConnectionEventHandlers(connection: Redis | Cluster, purpose: string): void {
    connection.on('error', (error) => {
      this.emit('connection:error', error, purpose);
    });

    connection.on('close', () => {
      this.emit('connection:close', purpose);
    });

    connection.on('reconnecting', () => {
      this.emit('connection:reconnecting', purpose);
    });

    connection.on('ready', () => {
      this.logger.info(`Redis connection ready`, { purpose });
      this.reconnectAttempts.delete(purpose);
    });
  }

  /**
   * Start health check monitoring
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.healthCheck();
      } catch (error) {
        this.logger.error('Health check failed', { error });
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Sleep utility for backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Distributed Lock Manager using Redis
 */
export class RedisDistributedLock {
  private readonly lockScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  private readonly connectionManager: RedisConnectionManager;
  private readonly logger = Logger.getInstance().child({ component: 'RedisDistributedLock' });

  constructor(connectionManager: RedisConnectionManager) {
    this.connectionManager = connectionManager;
  }

  /**
   * Acquire a distributed lock
   */
  async acquire(
    lockKey: string,
    lockValue: string,
    ttlMs: number = 30000,
    retryCount: number = 3,
    retryDelayMs: number = 100
  ): Promise<boolean> {
    const fullKey = `locks:${lockKey}`;
    
    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        const result = await this.connectionManager.executeCommand(
          'set',
          [fullKey, lockValue, 'PX', ttlMs, 'NX'],
          'lock'
        );

        if (result === 'OK') {
          this.logger.debug('Lock acquired successfully', { lockKey, attempt });
          return true;
        }

        if (attempt < retryCount) {
          await this.sleep(retryDelayMs * attempt);
        }
      } catch (error) {
        this.logger.warn(`Lock acquisition failed (attempt ${attempt}/${retryCount})`, {
          lockKey,
          error: error.message,
          attempt
        });
      }
    }

    this.logger.warn('Failed to acquire lock after all attempts', { lockKey, retryCount });
    return false;
  }

  /**
   * Release a distributed lock
   */
  async release(lockKey: string, lockValue: string): Promise<boolean> {
    try {
      const fullKey = `locks:${lockKey}`;
      const result = await this.connectionManager.executeScript(
        this.lockScript,
        [fullKey],
        [lockValue]
      );

      const released = result === 1;
      this.logger.debug('Lock release attempted', { lockKey, released });
      return released;
    } catch (error) {
      this.logger.error('Lock release failed', { lockKey, error });
      return false;
    }
  }

  /**
   * Extend lock TTL
   */
  async extend(lockKey: string, lockValue: string, ttlMs: number): Promise<boolean> {
    try {
      const fullKey = `locks:${lockKey}`;
      const extendScript = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("pexpire", KEYS[1], ARGV[2])
        else
          return 0
        end
      `;

      const result = await this.connectionManager.executeScript(
        extendScript,
        [fullKey],
        [lockValue, ttlMs]
      );

      return result === 1;
    } catch (error) {
      this.logger.error('Lock extension failed', { lockKey, error });
      return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}