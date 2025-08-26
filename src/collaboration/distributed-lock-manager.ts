// 🟢 WORKING: DistributedLockManager - Redis-based distributed locking system
// Replaces local file locks with team-aware distributed locking

import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { logger } from '../utils/enhanced-logger';
import {
  ErrorHandler,
  withErrorHandling,
  ConfigurationError,
  ErrorCategory,
} from '../utils/errors';
import type {
  DistributedLock,
  LockRequest,
  LockResult,
  TeamCollaborationConfig,
} from './types';

export class DistributedLockManager extends EventEmitter {
  private config: TeamCollaborationConfig;
  private redis: Redis;
  private localLocks: Map<string, DistributedLock>;
  private lockScripts: {
    acquire: string;
    release: string;
    extend: string;
    heartbeat: string;
  };
  private heartbeatInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;
  private initialized: boolean = false;

  constructor(config: TeamCollaborationConfig) {
    super();
    this.config = config;
    this.localLocks = new Map();
    this.lockScripts = this.initializeLuaScripts();
  }

  private initializeLuaScripts(): typeof this.lockScripts {
    return {
      // Atomic lock acquisition with conflict detection
      acquire: `
        local lockKey = KEYS[1]
        local lockData = ARGV[1]
        local ttl = tonumber(ARGV[2])
        local conflictKey = KEYS[2]
        
        -- Check if lock already exists
        local existing = redis.call('GET', lockKey)
        if existing then
          -- Lock exists, check if it's expired
          local lockTtl = redis.call('TTL', lockKey)
          if lockTtl > 0 then
            -- Lock is still valid, record conflict
            redis.call('SADD', conflictKey, lockData)
            redis.call('EXPIRE', conflictKey, 3600) -- Expire conflicts after 1 hour
            return {0, existing}
          end
        end
        
        -- Acquire the lock
        redis.call('SET', lockKey, lockData, 'EX', ttl)
        redis.call('SREM', conflictKey, lockData) -- Remove from conflicts if it was there
        return {1, lockData}
      `,

      // Atomic lock release with ownership verification
      release: `
        local lockKey = KEYS[1]
        local expectedData = ARGV[1]
        
        local currentData = redis.call('GET', lockKey)
        if currentData == expectedData then
          redis.call('DEL', lockKey)
          return 1
        else
          return 0
        end
      `,

      // Extend lock duration if owned
      extend: `
        local lockKey = KEYS[1]
        local expectedData = ARGV[1]
        local ttl = tonumber(ARGV[2])
        
        local currentData = redis.call('GET', lockKey)
        if currentData == expectedData then
          redis.call('EXPIRE', lockKey, ttl)
          return 1
        else
          return 0
        end
      `,

      // Update heartbeat timestamp
      heartbeat: `
        local lockKey = KEYS[1]
        local heartbeatKey = KEYS[2]
        local expectedData = ARGV[1]
        local timestamp = ARGV[2]
        
        local currentData = redis.call('GET', lockKey)
        if currentData == expectedData then
          redis.call('SET', heartbeatKey, timestamp, 'EX', 300) -- Heartbeat expires in 5 minutes
          return 1
        else
          return 0
        end
      `,
    };
  }

  public async initialize(): Promise<void> {
    logger.info('🚀 Initializing DistributedLockManager...');

    try {
      await withErrorHandling(
        async () => {
          // Initialize Redis connection
          this.redis = new Redis({
            host: this.config.redis.host,
            port: this.config.redis.port,
            password: this.config.redis.password,
            db: this.config.redis.database,
            keyPrefix: `${this.config.redis.keyPrefix}:locks:`,
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 3,
            lazyConnect: true,
          });

          // Test Redis connection
          await this.redis.ping();

          // Start background processes
          this.startHeartbeat();
          this.startCleanupProcess();

          this.initialized = true;
          logger.info('✅ DistributedLockManager initialized successfully');
          this.emit('initialized');
        },
        {
          operationName: 'distributed-lock-manager-initialization',
          category: ErrorCategory.CONFIGURATION,
          retries: 3,
          timeoutMs: 15000,
        },
      );
    } catch (error) {
      const handledError = ErrorHandler.getInstance().handleError(error as Error);
      logger.error('❌ Failed to initialize DistributedLockManager', handledError);
      throw handledError;
    }
  }

  public async acquireLock(request: LockRequest): Promise<LockResult> {
    this.ensureInitialized();

    try {
      const lockId = this.generateLockId();
      const now = new Date();
      const timeoutMs = (request.timeoutMinutes || this.config.performance.lockTimeoutMs / 60000) * 60 * 1000;
      const expiresAt = new Date(now.getTime() + timeoutMs);

      const lock: DistributedLock = {
        id: lockId,
        resourceId: request.resourceId,
        resourceType: request.resourceType,
        holderId: request.holderId,
        teamId: request.teamId,
        projectId: request.projectId,
        acquiredAt: now,
        expiresAt,
        lastHeartbeat: now,
        metadata: {
          operation: request.operation,
          description: request.description,
          priority: request.priority || 'medium',
          estimatedDuration: request.timeoutMinutes,
          tags: [],
        },
        status: 'active',
      };

      const lockKey = this.getLockKey(request.resourceId);
      const conflictKey = this.getConflictKey(request.resourceId);
      const lockData = JSON.stringify(lock);
      const ttlSeconds = Math.ceil(timeoutMs / 1000);

      // Use Lua script for atomic acquisition
      const result = await this.redis.eval(
        this.lockScripts.acquire,
        2,
        lockKey,
        conflictKey,
        lockData,
        ttlSeconds.toString(),
      ) as [number, string];

      const [success, data] = result;

      if (success === 1) {
        // Lock acquired successfully
        this.localLocks.set(lockId, lock);
        
        logger.info('🔒 Lock acquired', {
          lockId,
          resourceId: request.resourceId,
          holderId: request.holderId,
          teamId: request.teamId,
        });

        this.emit('lock:acquired', { lock });

        return {
          success: true,
          lock,
          waitTime: 0,
        };
      } else {
        // Lock acquisition failed - conflict detected
        const existingLock = JSON.parse(data) as DistributedLock;
        
        logger.warn('⚠️ Lock conflict detected', {
          resourceId: request.resourceId,
          requestedBy: request.holderId,
          heldBy: existingLock.holderId,
          conflictType: 'resource_collision',
        });

        this.emit('lock:conflict', {
          resourceId: request.resourceId,
          requestingLock: lock,
          existingLock,
          conflictType: 'resource_collision',
        });

        return {
          success: false,
          error: `Resource ${request.resourceId} is already locked by ${existingLock.holderId}`,
          conflictsWith: [existingLock],
          waitTime: expiresAt.getTime() - now.getTime(),
        };
      }
    } catch (error) {
      const handledError = ErrorHandler.getInstance().handleError(error as Error);
      logger.error('❌ Failed to acquire lock', handledError);
      
      return {
        success: false,
        error: `Failed to acquire lock: ${handledError.message}`,
      };
    }
  }

  public async releaseLock(lockId: string): Promise<boolean> {
    this.ensureInitialized();

    try {
      const lock = this.localLocks.get(lockId);
      if (!lock) {
        logger.warn('⚠️ Attempted to release non-existent lock', { lockId });
        return false;
      }

      const lockKey = this.getLockKey(lock.resourceId);
      const lockData = JSON.stringify(lock);

      // Use Lua script for atomic release
      const result = await this.redis.eval(
        this.lockScripts.release,
        1,
        lockKey,
        lockData,
      ) as number;

      if (result === 1) {
        // Lock released successfully
        this.localLocks.delete(lockId);
        lock.status = 'released';

        logger.info('🔓 Lock released', {
          lockId,
          resourceId: lock.resourceId,
          holderId: lock.holderId,
          duration: Date.now() - lock.acquiredAt.getTime(),
        });

        this.emit('lock:released', { lock });
        return true;
      } else {
        logger.warn('⚠️ Failed to release lock - ownership mismatch', { lockId });
        return false;
      }
    } catch (error) {
      const handledError = ErrorHandler.getInstance().handleError(error as Error);
      logger.error('❌ Failed to release lock', handledError);
      return false;
    }
  }

  public async extendLock(lockId: string, additionalMinutes: number): Promise<boolean> {
    this.ensureInitialized();

    try {
      const lock = this.localLocks.get(lockId);
      if (!lock) {
        return false;
      }

      const lockKey = this.getLockKey(lock.resourceId);
      const lockData = JSON.stringify(lock);
      const additionalSeconds = additionalMinutes * 60;

      const result = await this.redis.eval(
        this.lockScripts.extend,
        1,
        lockKey,
        lockData,
        additionalSeconds.toString(),
      ) as number;

      if (result === 1) {
        // Update local lock expiration
        lock.expiresAt = new Date(lock.expiresAt.getTime() + (additionalMinutes * 60 * 1000));
        
        logger.info('⏰ Lock extended', {
          lockId,
          resourceId: lock.resourceId,
          additionalMinutes,
          newExpiresAt: lock.expiresAt,
        });

        return true;
      } else {
        logger.warn('⚠️ Failed to extend lock - ownership mismatch', { lockId });
        return false;
      }
    } catch (error) {
      logger.error('❌ Failed to extend lock', error);
      return false;
    }
  }

  public async releaseAllLocks(holderId: string): Promise<number> {
    this.ensureInitialized();

    let releasedCount = 0;
    const holderLocks = Array.from(this.localLocks.values()).filter(
      lock => lock.holderId === holderId
    );

    for (const lock of holderLocks) {
      const released = await this.releaseLock(lock.id);
      if (released) {
        releasedCount++;
      }
    }

    if (releasedCount > 0) {
      logger.info('🔓 Released all locks for holder', { holderId, releasedCount });
    }

    return releasedCount;
  }

  public async getTeamLocks(teamId: string): Promise<DistributedLock[]> {
    this.ensureInitialized();

    return Array.from(this.localLocks.values()).filter(
      lock => lock.teamId === teamId && lock.status === 'active'
    );
  }

  public async getProjectLocks(projectId: string): Promise<DistributedLock[]> {
    this.ensureInitialized();

    return Array.from(this.localLocks.values()).filter(
      lock => lock.projectId === projectId && lock.status === 'active'
    );
  }

  public async getResourceLocks(resourceId: string): Promise<DistributedLock[]> {
    this.ensureInitialized();

    return Array.from(this.localLocks.values()).filter(
      lock => lock.resourceId === resourceId && lock.status === 'active'
    );
  }

  public async getLockStatus(lockId: string): Promise<DistributedLock | null> {
    this.ensureInitialized();

    return this.localLocks.get(lockId) || null;
  }

  public async forceReleaseLock(lockId: string, releasedBy: string, reason: string): Promise<boolean> {
    this.ensureInitialized();

    try {
      const lock = this.localLocks.get(lockId);
      if (!lock) {
        return false;
      }

      const lockKey = this.getLockKey(lock.resourceId);
      await this.redis.del(lockKey);

      this.localLocks.delete(lockId);
      lock.status = 'force_released';

      logger.warn('🚨 Lock force released', {
        lockId,
        resourceId: lock.resourceId,
        originalHolder: lock.holderId,
        releasedBy,
        reason,
      });

      this.emit('lock:force_released', { lock, releasedBy, reason });
      return true;
    } catch (error) {
      logger.error('❌ Failed to force release lock', error);
      return false;
    }
  }

  public async isHealthy(): Promise<boolean> {
    if (!this.initialized) return false;

    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      logger.error('❌ DistributedLockManager health check failed', error);
      return false;
    }
  }

  private startHeartbeat(): void {
    const intervalMs = this.config.redis.ttl.locks * 1000 / 4; // Send heartbeat every 1/4 of lock TTL

    this.heartbeatInterval = setInterval(async () => {
      try {
        const now = new Date().toISOString();
        
        for (const [lockId, lock] of this.localLocks) {
          if (lock.status === 'active') {
            const lockKey = this.getLockKey(lock.resourceId);
            const heartbeatKey = this.getHeartbeatKey(lock.resourceId);
            const lockData = JSON.stringify(lock);

            const result = await this.redis.eval(
              this.lockScripts.heartbeat,
              2,
              lockKey,
              heartbeatKey,
              lockData,
              now,
            ) as number;

            if (result === 1) {
              lock.lastHeartbeat = new Date();
            } else {
              // Lock was lost, clean up locally
              logger.warn('💔 Lock lost during heartbeat', { lockId, resourceId: lock.resourceId });
              this.localLocks.delete(lockId);
              this.emit('lock:lost', { lock });
            }
          }
        }
      } catch (error) {
        logger.error('❌ Heartbeat error', error);
      }
    }, intervalMs);

    logger.debug('💗 Lock heartbeat started', { intervalMs });
  }

  private startCleanupProcess(): void {
    const intervalMs = this.config.performance.cleanupInterval;

    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupExpiredLocks();
      } catch (error) {
        logger.error('❌ Cleanup process error', error);
      }
    }, intervalMs);

    logger.debug('🧹 Lock cleanup process started', { intervalMs });
  }

  private async cleanupExpiredLocks(): Promise<void> {
    const now = new Date();
    const expiredLocks: string[] = [];

    for (const [lockId, lock] of this.localLocks) {
      if (lock.expiresAt < now) {
        expiredLocks.push(lockId);
      }
    }

    if (expiredLocks.length > 0) {
      logger.info('🧹 Cleaning up expired locks', { count: expiredLocks.length });

      for (const lockId of expiredLocks) {
        const lock = this.localLocks.get(lockId);
        if (lock) {
          lock.status = 'expired';
          this.localLocks.delete(lockId);
          this.emit('lock:expired', { lock });
        }
      }
    }

    // Also clean up Redis keys for expired locks
    const keys = await this.redis.keys('*');
    const pipeline = this.redis.pipeline();
    let keysToDelete = 0;

    for (const key of keys) {
      const ttl = await this.redis.ttl(key);
      if (ttl === -1) {
        // Key exists but has no TTL - should not happen, clean it up
        pipeline.del(key);
        keysToDelete++;
      }
    }

    if (keysToDelete > 0) {
      await pipeline.exec();
      logger.info('🧹 Cleaned up orphaned Redis keys', { count: keysToDelete });
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new ConfigurationError('DistributedLockManager not initialized');
    }
  }

  private generateLockId(): string {
    return `lock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getLockKey(resourceId: string): string {
    return `resource:${resourceId}`;
  }

  private getConflictKey(resourceId: string): string {
    return `conflicts:${resourceId}`;
  }

  private getHeartbeatKey(resourceId: string): string {
    return `heartbeat:${resourceId}`;
  }

  public async shutdown(): Promise<void> {
    logger.info('🔄 Shutting down DistributedLockManager...');

    try {
      // Stop background processes
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
      }
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }

      // Release all locks held by this instance
      const activeLocks = Array.from(this.localLocks.keys());
      for (const lockId of activeLocks) {
        await this.releaseLock(lockId);
      }

      // Close Redis connection
      if (this.redis) {
        await this.redis.disconnect();
      }

      this.initialized = false;
      logger.info('✅ DistributedLockManager shutdown complete');
    } catch (error) {
      logger.error('❌ Error during DistributedLockManager shutdown', error);
      throw error;
    }
  }
}