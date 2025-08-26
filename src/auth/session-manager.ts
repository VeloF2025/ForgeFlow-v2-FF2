/**
 * Session Manager for ForgeFlow v2
 * Redis-backed session storage with multi-device support, activity tracking, and security features
 */

import crypto from 'crypto';
import { Logger } from '../utils/enhanced-logger';
import { RedisConnectionManager } from '../infrastructure/redis/redis-connection-manager';
import {
  SessionConfig,
  AuthSession,
  DeviceInfo,
  ResolvedPermission,
  User,
  Team,
  AuthenticationError
} from './types';

export interface SessionData {
  id: string;
  userId: string;
  teamId?: string;
  deviceId: string;
  deviceInfo: DeviceInfo;
  ipAddress: string;
  userAgent: string;
  permissions: ResolvedPermission[];
  metadata: Record<string, any>;
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
  isActive: boolean;
}

export interface SessionActivity {
  sessionId: string;
  timestamp: Date;
  action: string;
  resource?: string;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  metadata?: Record<string, any>;
}

export interface SessionStats {
  totalSessions: number;
  activeSessions: number;
  expiredSessions: number;
  deviceTypes: Record<DeviceInfo['type'], number>;
  averageSessionDuration: number;
  sessionsLast24h: number;
}

// 🟢 WORKING: Comprehensive session management system
export class SessionManager {
  private readonly logger = Logger.getInstance().child({ component: 'SessionManager' });
  private readonly redis: RedisConnectionManager;
  private readonly config: SessionConfig;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: SessionConfig, redis: RedisConnectionManager) {
    this.config = config;
    this.redis = redis;
  }

  /**
   * Initialize session manager
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Session Manager', {
        ttl: this.config.ttl,
        maxSessions: this.config.maxSessions,
        rolling: this.config.rolling
      });

      // Start cleanup interval
      this.startCleanupInterval();

      this.logger.info('Session Manager initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Session Manager', { error });
      throw error;
    }
  }

  /**
   * Create a new session
   */
  async createSession(
    user: User,
    deviceInfo: DeviceInfo,
    ipAddress: string,
    userAgent: string,
    teamId?: string,
    permissions: ResolvedPermission[] = []
  ): Promise<AuthSession> {
    try {
      // Generate unique session and device IDs
      const sessionId = this.generateSessionId();
      const deviceId = this.generateDeviceId(deviceInfo, userAgent);

      // Check max sessions limit
      await this.enforceMaxSessions(user.id, teamId);

      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.config.ttl * 1000);

      const sessionData: SessionData = {
        id: sessionId,
        userId: user.id,
        teamId,
        deviceId,
        deviceInfo,
        ipAddress,
        userAgent,
        permissions,
        metadata: {},
        createdAt: now,
        lastActivity: now,
        expiresAt,
        isActive: true
      };

      // Store session in Redis
      await this.storeSession(sessionData);

      // Track session creation
      await this.trackActivity(sessionId, 'session_created', undefined, ipAddress, userAgent, true);

      // Create session response
      const session: AuthSession = {
        id: sessionId,
        userId: user.id,
        teamId,
        deviceId,
        deviceInfo,
        ipAddress,
        userAgent,
        isActive: true,
        lastActivity: now,
        createdAt: now,
        expiresAt,
        permissions
      };

      this.logger.debug('Session created successfully', {
        sessionId,
        userId: user.id,
        teamId,
        deviceType: deviceInfo.type,
        expiresAt
      });

      return session;
    } catch (error) {
      this.logger.error('Failed to create session', { error, userId: user.id });
      throw error;
    }
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<AuthSession | null> {
    try {
      const sessionData = await this.getSessionData(sessionId);
      if (!sessionData) {
        return null;
      }

      // Check if session is expired
      if (!sessionData.isActive || new Date() > sessionData.expiresAt) {
        await this.invalidateSession(sessionId);
        return null;
      }

      // Update last activity if rolling sessions enabled
      if (this.config.rolling) {
        await this.updateLastActivity(sessionId);
      }

      return {
        id: sessionData.id,
        userId: sessionData.userId,
        teamId: sessionData.teamId,
        deviceId: sessionData.deviceId,
        deviceInfo: sessionData.deviceInfo,
        ipAddress: sessionData.ipAddress,
        userAgent: sessionData.userAgent,
        isActive: sessionData.isActive,
        lastActivity: sessionData.lastActivity,
        createdAt: sessionData.createdAt,
        expiresAt: sessionData.expiresAt,
        permissions: sessionData.permissions
      };
    } catch (error) {
      this.logger.error('Failed to get session', { error, sessionId });
      return null;
    }
  }

  /**
   * Update session activity
   */
  async updateActivity(
    sessionId: string,
    action: string,
    resource?: string,
    success: boolean = true,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const sessionData = await this.getSessionData(sessionId);
      if (!sessionData || !sessionData.isActive) {
        return;
      }

      // Update last activity
      await this.updateLastActivity(sessionId);

      // Track activity
      await this.trackActivity(
        sessionId,
        action,
        resource,
        sessionData.ipAddress,
        sessionData.userAgent,
        success,
        metadata
      );

      this.logger.debug('Session activity updated', {
        sessionId,
        action,
        resource,
        success
      });
    } catch (error) {
      this.logger.error('Failed to update session activity', {
        error,
        sessionId,
        action
      });
    }
  }

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId: string, teamId?: string): Promise<AuthSession[]> {
    try {
      const pattern = teamId 
        ? `sessions:user:${userId}:${teamId}:*`
        : `sessions:user:${userId}:*`;

      const sessionKeys = await this.redis.executeCommand<string[]>('keys', [pattern]);
      const sessions: AuthSession[] = [];

      for (const key of sessionKeys) {
        const sessionId = key.split(':').pop();
        if (sessionId) {
          const session = await this.getSession(sessionId);
          if (session) {
            sessions.push(session);
          }
        }
      }

      return sessions.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
    } catch (error) {
      this.logger.error('Failed to get user sessions', { error, userId, teamId });
      return [];
    }
  }

  /**
   * Invalidate a session
   */
  async invalidateSession(sessionId: string): Promise<void> {
    try {
      const sessionData = await this.getSessionData(sessionId);
      if (!sessionData) {
        return;
      }

      // Mark session as inactive
      await this.redis.executeCommand('hset', [
        `sessions:${sessionId}`,
        'isActive',
        'false',
        'invalidatedAt',
        Date.now().toString()
      ]);

      // Remove from user session index
      const userKey = sessionData.teamId
        ? `sessions:user:${sessionData.userId}:${sessionData.teamId}:${sessionId}`
        : `sessions:user:${sessionData.userId}:global:${sessionId}`;
      
      await this.redis.executeCommand('del', [userKey]);

      // Track session invalidation
      await this.trackActivity(
        sessionId,
        'session_invalidated',
        undefined,
        sessionData.ipAddress,
        sessionData.userAgent,
        true
      );

      this.logger.debug('Session invalidated successfully', {
        sessionId,
        userId: sessionData.userId,
        teamId: sessionData.teamId
      });
    } catch (error) {
      this.logger.error('Failed to invalidate session', { error, sessionId });
      throw error;
    }
  }

  /**
   * Invalidate all sessions for a user
   */
  async invalidateAllUserSessions(
    userId: string,
    exceptSessionId?: string,
    teamId?: string
  ): Promise<number> {
    try {
      const sessions = await this.getUserSessions(userId, teamId);
      let invalidatedCount = 0;

      for (const session of sessions) {
        if (session.id !== exceptSessionId) {
          await this.invalidateSession(session.id);
          invalidatedCount++;
        }
      }

      this.logger.info('All user sessions invalidated', {
        userId,
        teamId,
        exceptSessionId,
        invalidatedCount
      });

      return invalidatedCount;
    } catch (error) {
      this.logger.error('Failed to invalidate all user sessions', {
        error,
        userId,
        teamId
      });
      throw error;
    }
  }

  /**
   * Update session permissions
   */
  async updateSessionPermissions(
    sessionId: string,
    permissions: ResolvedPermission[]
  ): Promise<void> {
    try {
      await this.redis.executeCommand('hset', [
        `sessions:${sessionId}`,
        'permissions',
        JSON.stringify(permissions),
        'permissionsUpdatedAt',
        Date.now().toString()
      ]);

      this.logger.debug('Session permissions updated', {
        sessionId,
        permissionCount: permissions.length
      });
    } catch (error) {
      this.logger.error('Failed to update session permissions', {
        error,
        sessionId
      });
      throw error;
    }
  }

  /**
   * Get session activity history
   */
  async getSessionActivity(
    sessionId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<SessionActivity[]> {
    try {
      const activities = await this.redis.executeCommand<string[]>(
        'lrange',
        [`session_activity:${sessionId}`, offset, offset + limit - 1]
      );

      return activities.map(activityStr => {
        const activity = JSON.parse(activityStr) as SessionActivity;
        return {
          ...activity,
          timestamp: new Date(activity.timestamp)
        };
      });
    } catch (error) {
      this.logger.error('Failed to get session activity', { error, sessionId });
      return [];
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats(teamId?: string): Promise<SessionStats> {
    try {
      const pattern = teamId ? `sessions:*:${teamId}:*` : 'sessions:*';
      const sessionKeys = await this.redis.executeCommand<string[]>('keys', [pattern]);
      
      const stats: SessionStats = {
        totalSessions: sessionKeys.length,
        activeSessions: 0,
        expiredSessions: 0,
        deviceTypes: {
          web: 0,
          mobile: 0,
          desktop: 0,
          api: 0,
          cli: 0
        },
        averageSessionDuration: 0,
        sessionsLast24h: 0
      };

      const now = Date.now();
      const last24h = now - (24 * 60 * 60 * 1000);
      let totalDuration = 0;
      let sessionCount = 0;

      for (const key of sessionKeys) {
        const sessionData = await this.redis.executeCommand<Record<string, string>>(
          'hgetall',
          [key]
        );

        if (!sessionData) continue;

        const createdAt = parseInt(sessionData.createdAt, 10);
        const expiresAt = parseInt(sessionData.expiresAt, 10);
        const isActive = sessionData.isActive === 'true';

        if (isActive && now < expiresAt) {
          stats.activeSessions++;
        } else {
          stats.expiredSessions++;
        }

        // Count device types
        if (sessionData.deviceInfo) {
          try {
            const deviceInfo = JSON.parse(sessionData.deviceInfo) as DeviceInfo;
            stats.deviceTypes[deviceInfo.type]++;
          } catch {
            // Ignore parsing errors
          }
        }

        // Calculate duration and count recent sessions
        if (createdAt) {
          if (createdAt > last24h) {
            stats.sessionsLast24h++;
          }

          const lastActivity = parseInt(sessionData.lastActivity || sessionData.createdAt, 10);
          const duration = lastActivity - createdAt;
          totalDuration += duration;
          sessionCount++;
        }
      }

      if (sessionCount > 0) {
        stats.averageSessionDuration = Math.round(totalDuration / sessionCount / 1000); // Convert to seconds
      }

      this.logger.debug('Session statistics calculated', stats);
      return stats;
    } catch (error) {
      this.logger.error('Failed to get session statistics', { error, teamId });
      return {
        totalSessions: 0,
        activeSessions: 0,
        expiredSessions: 0,
        deviceTypes: { web: 0, mobile: 0, desktop: 0, api: 0, cli: 0 },
        averageSessionDuration: 0,
        sessionsLast24h: 0
      };
    }
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const sessionKeys = await this.redis.executeCommand<string[]>('keys', ['sessions:*']);
      let cleanedCount = 0;

      const now = Date.now();

      for (const key of sessionKeys) {
        const expiresAtStr = await this.redis.executeCommand<string>(
          'hget',
          [key, 'expiresAt']
        );

        if (expiresAtStr) {
          const expiresAt = parseInt(expiresAtStr, 10);
          if (expiresAt < now) {
            await this.redis.executeCommand('del', [key]);
            cleanedCount++;
          }
        }
      }

      if (cleanedCount > 0) {
        this.logger.info('Expired sessions cleaned up', { count: cleanedCount });
      }

      return cleanedCount;
    } catch (error) {
      this.logger.error('Failed to cleanup expired sessions', { error });
      return 0;
    }
  }

  /**
   * Close session manager
   */
  async close(): Promise<void> {
    try {
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }
      this.logger.info('Session Manager closed successfully');
    } catch (error) {
      this.logger.error('Error closing Session Manager', { error });
    }
  }

  // 🟡 PARTIAL: Private helper methods
  private generateSessionId(): string {
    return `sess_${crypto.randomBytes(32).toString('hex')}`;
  }

  private generateDeviceId(deviceInfo: DeviceInfo, userAgent: string): string {
    const fingerprint = crypto
      .createHash('sha256')
      .update(`${deviceInfo.type}:${deviceInfo.name}:${userAgent}`)
      .digest('hex');
    
    return `dev_${fingerprint.substring(0, 16)}`;
  }

  private async enforceMaxSessions(userId: string, teamId?: string): Promise<void> {
    const sessions = await this.getUserSessions(userId, teamId);
    
    if (sessions.length >= this.config.maxSessions) {
      // Remove oldest sessions to make room
      const sessionsToRemove = sessions
        .sort((a, b) => a.lastActivity.getTime() - b.lastActivity.getTime())
        .slice(0, sessions.length - this.config.maxSessions + 1);

      for (const session of sessionsToRemove) {
        await this.invalidateSession(session.id);
      }

      this.logger.info('Enforced max sessions limit', {
        userId,
        teamId,
        maxSessions: this.config.maxSessions,
        removedSessions: sessionsToRemove.length
      });
    }
  }

  private async storeSession(sessionData: SessionData): Promise<void> {
    const sessionKey = `sessions:${sessionData.id}`;
    const userKey = sessionData.teamId
      ? `sessions:user:${sessionData.userId}:${sessionData.teamId}:${sessionData.id}`
      : `sessions:user:${sessionData.userId}:global:${sessionData.id}`;

    // Store session data
    await Promise.all([
      this.redis.executeCommand('hmset', [
        sessionKey,
        'id',
        sessionData.id,
        'userId',
        sessionData.userId,
        'teamId',
        sessionData.teamId || '',
        'deviceId',
        sessionData.deviceId,
        'deviceInfo',
        JSON.stringify(sessionData.deviceInfo),
        'ipAddress',
        sessionData.ipAddress,
        'userAgent',
        sessionData.userAgent,
        'permissions',
        JSON.stringify(sessionData.permissions),
        'metadata',
        JSON.stringify(sessionData.metadata),
        'createdAt',
        sessionData.createdAt.getTime().toString(),
        'lastActivity',
        sessionData.lastActivity.getTime().toString(),
        'expiresAt',
        sessionData.expiresAt.getTime().toString(),
        'isActive',
        sessionData.isActive.toString()
      ]),
      this.redis.executeCommand('setex', [
        userKey,
        this.config.ttl,
        sessionData.id
      ])
    ]);

    // Set expiration for session
    await this.redis.executeCommand('expire', [sessionKey, this.config.ttl]);
  }

  private async getSessionData(sessionId: string): Promise<SessionData | null> {
    try {
      const data = await this.redis.executeCommand<Record<string, string>>(
        'hgetall',
        [`sessions:${sessionId}`]
      );

      if (!data || Object.keys(data).length === 0) {
        return null;
      }

      return {
        id: data.id,
        userId: data.userId,
        teamId: data.teamId || undefined,
        deviceId: data.deviceId,
        deviceInfo: JSON.parse(data.deviceInfo),
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        permissions: JSON.parse(data.permissions || '[]'),
        metadata: JSON.parse(data.metadata || '{}'),
        createdAt: new Date(parseInt(data.createdAt, 10)),
        lastActivity: new Date(parseInt(data.lastActivity, 10)),
        expiresAt: new Date(parseInt(data.expiresAt, 10)),
        isActive: data.isActive === 'true'
      };
    } catch (error) {
      this.logger.error('Failed to parse session data', { error, sessionId });
      return null;
    }
  }

  private async updateLastActivity(sessionId: string): Promise<void> {
    const now = Date.now();
    const newExpiresAt = now + (this.config.ttl * 1000);

    await Promise.all([
      this.redis.executeCommand('hmset', [
        `sessions:${sessionId}`,
        'lastActivity',
        now.toString(),
        'expiresAt',
        newExpiresAt.toString()
      ]),
      this.redis.executeCommand('expire', [`sessions:${sessionId}`, this.config.ttl])
    ]);
  }

  private async trackActivity(
    sessionId: string,
    action: string,
    resource: string | undefined,
    ipAddress: string,
    userAgent: string,
    success: boolean,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const activity: SessionActivity = {
        sessionId,
        timestamp: new Date(),
        action,
        resource,
        ipAddress,
        userAgent,
        success,
        metadata
      };

      const activityKey = `session_activity:${sessionId}`;
      
      // Store activity (keep last 100 activities)
      await Promise.all([
        this.redis.executeCommand('lpush', [activityKey, JSON.stringify(activity)]),
        this.redis.executeCommand('ltrim', [activityKey, 0, 99]),
        this.redis.executeCommand('expire', [activityKey, this.config.ttl])
      ]);
    } catch (error) {
      this.logger.error('Failed to track session activity', {
        error,
        sessionId,
        action
      });
    }
  }

  private startCleanupInterval(): void {
    // Run cleanup every hour
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupExpiredSessions();
      } catch (error) {
        this.logger.error('Session cleanup failed', { error });
      }
    }, 60 * 60 * 1000);
  }
}