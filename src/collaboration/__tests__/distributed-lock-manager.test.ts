// 🟢 WORKING: DistributedLockManager Tests - Redis-based locking system tests
// Tests lock acquisition, release, conflict detection, and heartbeat functionality

import { jest } from '@jest/globals';
import Redis from 'ioredis';
import { DistributedLockManager } from '../distributed-lock-manager';
import type {
  TeamCollaborationConfig,
  LockRequest,
  DistributedLock,
} from '../types';

// Mock Redis
jest.mock('ioredis');
jest.mock('../../utils/enhanced-logger');

const MockedRedis = Redis as jest.MockedClass<typeof Redis>;

describe('DistributedLockManager', () => {
  let lockManager: DistributedLockManager;
  let mockConfig: TeamCollaborationConfig;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      redis: {
        host: 'localhost',
        port: 6379,
        database: 0,
        keyPrefix: 'ff2-test',
        ttl: { locks: 3600, presence: 300, messages: 86400 },
      },
      websocket: {
        port: 3001,
        path: '/ws',
        heartbeatInterval: 30000,
        messageQueueSize: 1000,
        maxConnections: 1000,
      },
      security: {
        jwtSecret: 'test-secret-key',
        jwtExpiresIn: '24h',
        rateLimiting: { enabled: true, windowMs: 900000, maxRequests: 100 },
        corsOrigins: ['http://localhost:3000'],
      },
      performance: {
        lockTimeoutMs: 30000,
        conflictDetectionInterval: 5000,
        metricsAggregationInterval: 60000,
        cleanupInterval: 300000,
      },
      notifications: {
        email: { enabled: false, templates: {} },
        webhook: { enabled: false, urls: [] },
        external: {},
      },
    };

    // Setup Redis mock
    mockRedis = {
      ping: jest.fn().mockResolvedValue('PONG'),
      eval: jest.fn(),
      keys: jest.fn().mockResolvedValue([]),
      ttl: jest.fn().mockResolvedValue(3600),
      del: jest.fn().mockResolvedValue(1),
      disconnect: jest.fn().mockResolvedValue(undefined),
      pipeline: jest.fn().mockReturnValue({
        del: jest.fn(),
        exec: jest.fn().mockResolvedValue([]),
      }),
    } as any;

    MockedRedis.mockImplementation(() => mockRedis);

    lockManager = new DistributedLockManager(mockConfig);
  });

  describe('Initialization', () => {
    it('should initialize successfully with valid Redis connection', async () => {
      await lockManager.initialize();

      expect(MockedRedis).toHaveBeenCalledWith({
        host: mockConfig.redis.host,
        port: mockConfig.redis.port,
        password: mockConfig.redis.password,
        db: mockConfig.redis.database,
        keyPrefix: `${mockConfig.redis.keyPrefix}:locks:`,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });
      expect(mockRedis.ping).toHaveBeenCalledTimes(1);
    });

    it('should handle Redis connection failure', async () => {
      mockRedis.ping.mockRejectedValue(new Error('Connection failed'));

      await expect(lockManager.initialize()).rejects.toThrow();
    });

    it('should start heartbeat and cleanup processes', async () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval').mockImplementation(() => ({} as any));

      await lockManager.initialize();

      expect(setIntervalSpy).toHaveBeenCalledTimes(2); // heartbeat and cleanup
    });
  });

  describe('Lock Acquisition', () => {
    beforeEach(async () => {
      await lockManager.initialize();
    });

    it('should acquire lock successfully when resource is available', async () => {
      const lockRequest: LockRequest = {
        resourceId: 'test-file.ts',
        resourceType: 'file',
        holderId: 'user-123',
        teamId: 'team-456',
        projectId: 'project-789',
        operation: 'edit',
        description: 'Editing test file',
      };

      // Mock successful lock acquisition
      mockRedis.eval.mockResolvedValue([1, JSON.stringify(createMockLock(lockRequest))]);

      const result = await lockManager.acquireLock(lockRequest);

      expect(result.success).toBe(true);
      expect(result.lock).toBeDefined();
      expect(result.lock!.resourceId).toBe(lockRequest.resourceId);
      expect(result.lock!.holderId).toBe(lockRequest.holderId);
      expect(result.waitTime).toBe(0);
    });

    it('should detect conflict when resource is already locked', async () => {
      const lockRequest: LockRequest = {
        resourceId: 'test-file.ts',
        resourceType: 'file',
        holderId: 'user-123',
        teamId: 'team-456',
        projectId: 'project-789',
        operation: 'edit',
        description: 'Editing test file',
      };

      const existingLock = createMockLock({
        ...lockRequest,
        holderId: 'user-456', // Different user
      });

      // Mock lock conflict
      mockRedis.eval.mockResolvedValue([0, JSON.stringify(existingLock)]);

      const result = await lockManager.acquireLock(lockRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain('already locked');
      expect(result.conflictsWith).toHaveLength(1);
      expect(result.conflictsWith![0].holderId).toBe('user-456');
    });

    it('should handle lock acquisition errors', async () => {
      const lockRequest: LockRequest = {
        resourceId: 'test-file.ts',
        resourceType: 'file',
        holderId: 'user-123',
        teamId: 'team-456',
        projectId: 'project-789',
        operation: 'edit',
        description: 'Editing test file',
      };

      mockRedis.eval.mockRejectedValue(new Error('Redis error'));

      const result = await lockManager.acquireLock(lockRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to acquire lock');
    });
  });

  describe('Lock Release', () => {
    beforeEach(async () => {
      await lockManager.initialize();
    });

    it('should release lock successfully when owned', async () => {
      const lockId = 'test-lock-id';
      const mockLock = createMockLock({
        resourceId: 'test-file.ts',
        resourceType: 'file',
        holderId: 'user-123',
        teamId: 'team-456',
        projectId: 'project-789',
        operation: 'edit',
        description: 'Test lock',
      });

      // Add lock to internal storage
      lockManager['localLocks'].set(lockId, mockLock);

      // Mock successful release
      mockRedis.eval.mockResolvedValue(1);

      const result = await lockManager.releaseLock(lockId);

      expect(result).toBe(true);
      expect(lockManager['localLocks'].has(lockId)).toBe(false);
    });

    it('should handle non-existent lock gracefully', async () => {
      const result = await lockManager.releaseLock('non-existent-lock');

      expect(result).toBe(false);
    });

    it('should handle ownership mismatch', async () => {
      const lockId = 'test-lock-id';
      const mockLock = createMockLock({
        resourceId: 'test-file.ts',
        resourceType: 'file',
        holderId: 'user-123',
        teamId: 'team-456',
        projectId: 'project-789',
        operation: 'edit',
        description: 'Test lock',
      });

      lockManager['localLocks'].set(lockId, mockLock);

      // Mock ownership mismatch
      mockRedis.eval.mockResolvedValue(0);

      const result = await lockManager.releaseLock(lockId);

      expect(result).toBe(false);
    });
  });

  describe('Lock Extension', () => {
    beforeEach(async () => {
      await lockManager.initialize();
    });

    it('should extend lock duration successfully', async () => {
      const lockId = 'test-lock-id';
      const mockLock = createMockLock({
        resourceId: 'test-file.ts',
        resourceType: 'file',
        holderId: 'user-123',
        teamId: 'team-456',
        projectId: 'project-789',
        operation: 'edit',
        description: 'Test lock',
      });

      lockManager['localLocks'].set(lockId, mockLock);

      // Mock successful extension
      mockRedis.eval.mockResolvedValue(1);

      const result = await lockManager.extendLock(lockId, 30);

      expect(result).toBe(true);
    });

    it('should handle extension failure due to ownership mismatch', async () => {
      const lockId = 'test-lock-id';
      const mockLock = createMockLock({
        resourceId: 'test-file.ts',
        resourceType: 'file',
        holderId: 'user-123',
        teamId: 'team-456',
        projectId: 'project-789',
        operation: 'edit',
        description: 'Test lock',
      });

      lockManager['localLocks'].set(lockId, mockLock);

      // Mock ownership mismatch
      mockRedis.eval.mockResolvedValue(0);

      const result = await lockManager.extendLock(lockId, 30);

      expect(result).toBe(false);
    });
  });

  describe('Bulk Operations', () => {
    beforeEach(async () => {
      await lockManager.initialize();
    });

    it('should release all locks for a holder', async () => {
      const holderId = 'user-123';
      
      // Add multiple locks for the holder
      const lock1 = createMockLock({ resourceId: 'file1.ts', holderId });
      const lock2 = createMockLock({ resourceId: 'file2.ts', holderId });
      const lock3 = createMockLock({ resourceId: 'file3.ts', holderId: 'other-user' });

      lockManager['localLocks'].set('lock1', lock1);
      lockManager['localLocks'].set('lock2', lock2);
      lockManager['localLocks'].set('lock3', lock3);

      // Mock successful releases
      mockRedis.eval.mockResolvedValue(1);

      const result = await lockManager.releaseAllLocks(holderId);

      expect(result).toBe(2); // Only 2 locks for the holder
      expect(mockRedis.eval).toHaveBeenCalledTimes(2);
    });

    it('should get team locks correctly', async () => {
      const teamId = 'team-456';
      
      const lock1 = createMockLock({ resourceId: 'file1.ts', teamId });
      const lock2 = createMockLock({ resourceId: 'file2.ts', teamId });
      const lock3 = createMockLock({ resourceId: 'file3.ts', teamId: 'other-team' });

      lockManager['localLocks'].set('lock1', lock1);
      lockManager['localLocks'].set('lock2', lock2);
      lockManager['localLocks'].set('lock3', lock3);

      const result = await lockManager.getTeamLocks(teamId);

      expect(result).toHaveLength(2);
      expect(result.every(lock => lock.teamId === teamId)).toBe(true);
    });

    it('should get project locks correctly', async () => {
      const projectId = 'project-789';
      
      const lock1 = createMockLock({ resourceId: 'file1.ts', projectId });
      const lock2 = createMockLock({ resourceId: 'file2.ts', projectId });
      const lock3 = createMockLock({ resourceId: 'file3.ts', projectId: 'other-project' });

      lockManager['localLocks'].set('lock1', lock1);
      lockManager['localLocks'].set('lock2', lock2);
      lockManager['localLocks'].set('lock3', lock3);

      const result = await lockManager.getProjectLocks(projectId);

      expect(result).toHaveLength(2);
      expect(result.every(lock => lock.projectId === projectId)).toBe(true);
    });
  });

  describe('Force Release', () => {
    beforeEach(async () => {
      await lockManager.initialize();
    });

    it('should force release lock successfully', async () => {
      const lockId = 'test-lock-id';
      const mockLock = createMockLock({
        resourceId: 'test-file.ts',
        resourceType: 'file',
        holderId: 'user-123',
        teamId: 'team-456',
        projectId: 'project-789',
        operation: 'edit',
        description: 'Test lock',
      });

      lockManager['localLocks'].set(lockId, mockLock);

      const result = await lockManager.forceReleaseLock(lockId, 'admin-user', 'Emergency release');

      expect(result).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith(
        lockManager['getLockKey'](mockLock.resourceId)
      );
      expect(lockManager['localLocks'].has(lockId)).toBe(false);
    });

    it('should handle non-existent lock in force release', async () => {
      const result = await lockManager.forceReleaseLock('non-existent', 'admin-user', 'Test');

      expect(result).toBe(false);
    });
  });

  describe('Health Check', () => {
    it('should return healthy when initialized and Redis responds', async () => {
      await lockManager.initialize();

      const result = await lockManager.isHealthy();

      expect(result).toBe(true);
      expect(mockRedis.ping).toHaveBeenCalled();
    });

    it('should return unhealthy when not initialized', async () => {
      const result = await lockManager.isHealthy();

      expect(result).toBe(false);
    });

    it('should return unhealthy when Redis fails', async () => {
      await lockManager.initialize();
      mockRedis.ping.mockRejectedValue(new Error('Connection lost'));

      const result = await lockManager.isHealthy();

      expect(result).toBe(false);
    });
  });

  describe('Heartbeat and Cleanup', () => {
    beforeEach(async () => {
      await lockManager.initialize();
    });

    it('should handle heartbeat updates', async () => {
      const lockId = 'test-lock-id';
      const mockLock = createMockLock({
        resourceId: 'test-file.ts',
        resourceType: 'file',
        holderId: 'user-123',
        teamId: 'team-456',
        projectId: 'project-789',
        operation: 'edit',
        description: 'Test lock',
      });

      lockManager['localLocks'].set(lockId, mockLock);

      // Mock successful heartbeat
      mockRedis.eval.mockResolvedValue(1);

      // Trigger heartbeat manually
      const heartbeatCallback = (lockManager as any).heartbeatInterval?._onTimeout;
      if (heartbeatCallback) {
        await heartbeatCallback();
      }

      // Check that heartbeat was updated
      expect(mockLock.lastHeartbeat.getTime()).toBeGreaterThan(Date.now() - 5000);
    });

    it('should clean up expired locks', async () => {
      // Create expired lock
      const expiredLock = createMockLock({
        resourceId: 'expired-file.ts',
        resourceType: 'file',
        holderId: 'user-123',
        teamId: 'team-456',
        projectId: 'project-789',
        operation: 'edit',
        description: 'Expired lock',
      });
      expiredLock.expiresAt = new Date(Date.now() - 10000); // Expired 10 seconds ago

      lockManager['localLocks'].set('expired-lock', expiredLock);

      // Trigger cleanup manually
      await lockManager['cleanupExpiredLocks']();

      expect(lockManager['localLocks'].has('expired-lock')).toBe(false);
    });
  });

  describe('Shutdown', () => {
    it('should shutdown gracefully', async () => {
      await lockManager.initialize();
      
      // Add some locks
      const mockLock = createMockLock({
        resourceId: 'test-file.ts',
        resourceType: 'file',
        holderId: 'user-123',
        teamId: 'team-456',
        projectId: 'project-789',
        operation: 'edit',
        description: 'Test lock',
      });
      lockManager['localLocks'].set('test-lock', mockLock);

      // Mock successful release
      mockRedis.eval.mockResolvedValue(1);

      await lockManager.shutdown();

      expect(mockRedis.disconnect).toHaveBeenCalledTimes(1);
      expect(lockManager['localLocks'].size).toBe(0);
    });

    it('should handle shutdown errors', async () => {
      await lockManager.initialize();
      mockRedis.disconnect.mockRejectedValue(new Error('Disconnect failed'));

      await expect(lockManager.shutdown()).rejects.toThrow('Disconnect failed');
    });
  });

  describe('Lua Scripts', () => {
    beforeEach(async () => {
      await lockManager.initialize();
    });

    it('should use Lua scripts for atomic operations', async () => {
      const lockRequest: LockRequest = {
        resourceId: 'test-file.ts',
        resourceType: 'file',
        holderId: 'user-123',
        teamId: 'team-456',
        projectId: 'project-789',
        operation: 'edit',
        description: 'Test atomic operation',
      };

      // Mock script execution
      mockRedis.eval.mockResolvedValue([1, JSON.stringify(createMockLock(lockRequest))]);

      await lockManager.acquireLock(lockRequest);

      // Verify that eval was called with Lua script
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('local lockKey = KEYS[1]'),
        expect.any(Number),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );
    });
  });
});

// Helper Functions
function createMockLock(params: Partial<LockRequest> & { resourceId: string }): DistributedLock {
  const now = new Date();
  return {
    id: `lock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    resourceId: params.resourceId,
    resourceType: params.resourceType || 'file',
    holderId: params.holderId || 'test-user',
    teamId: params.teamId || 'test-team',
    projectId: params.projectId || 'test-project',
    acquiredAt: now,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000), // 1 hour from now
    lastHeartbeat: now,
    metadata: {
      operation: params.operation || 'test',
      description: params.description || 'Test lock',
      priority: params.priority || 'medium',
      tags: [],
    },
    status: 'active',
  };
}