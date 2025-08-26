// 🟢 WORKING: Collaboration System Index - Main export file for team collaboration
// Provides unified access to all team collaboration components

export * from './types';
export * from './team-manager';
export * from './distributed-lock-manager';
export * from './team-communication';
export * from './conflict-resolver';
export * from './team-dashboard';
export * from './migration-system';

import { logger } from '../utils/enhanced-logger';
import {
  ErrorHandler,
  withErrorHandling,
  ConfigurationError,
  ErrorCategory,
} from '../utils/errors';
import type {
  TeamCollaborationConfig,
  Team,
  TeamMember,
  TeamProject,
} from './types';
import { TeamManager } from './team-manager';
import { TeamDashboard } from './team-dashboard';
import { MigrationSystem } from './migration-system';

/**
 * Initialize the complete team collaboration system for ForgeFlow v2
 * 
 * @param config Team collaboration configuration
 * @returns Initialized collaboration system components
 */
export async function initializeTeamCollaboration(config: TeamCollaborationConfig): Promise<{
  teamManager: TeamManager;
  dashboard: TeamDashboard;
  migrationSystem: MigrationSystem;
}> {
  logger.info('🚀 Initializing ForgeFlow v2 Team Collaboration System...');

  try {
    return await withErrorHandling(
      async () => {
        // Initialize core team manager
        const teamManager = new TeamManager(config);
        await teamManager.initialize?.();

        // Initialize dashboard API
        const dashboard = new TeamDashboard(config, teamManager);
        await dashboard.initialize();

        // Initialize migration system
        const migrationSystem = new MigrationSystem(config, teamManager);
        await migrationSystem.initialize();

        logger.info('✅ Team Collaboration System initialized successfully');

        return {
          teamManager,
          dashboard,
          migrationSystem,
        };
      },
      {
        operationName: 'team-collaboration-system-initialization',
        category: ErrorCategory.CONFIGURATION,
        retries: 2,
        timeoutMs: 60000,
      },
    );
  } catch (error) {
    const handledError = ErrorHandler.getInstance().handleError(error as Error);
    logger.error('❌ Failed to initialize Team Collaboration System', handledError);
    throw handledError;
  }
}

/**
 * Create default team collaboration configuration
 * 
 * @param overrides Configuration overrides
 * @returns Default configuration with overrides applied
 */
export function createDefaultTeamCollaborationConfig(
  overrides: Partial<TeamCollaborationConfig> = {}
): TeamCollaborationConfig {
  const defaultConfig: TeamCollaborationConfig = {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      database: parseInt(process.env.REDIS_DB || '0'),
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'ff2',
      ttl: {
        locks: 3600, // 1 hour
        presence: 300, // 5 minutes
        messages: 86400, // 24 hours
      },
    },
    websocket: {
      port: parseInt(process.env.WEBSOCKET_PORT || '3001'),
      path: process.env.WEBSOCKET_PATH || '/ws',
      heartbeatInterval: parseInt(process.env.WEBSOCKET_HEARTBEAT || '30000'),
      messageQueueSize: parseInt(process.env.WEBSOCKET_QUEUE_SIZE || '1000'),
      maxConnections: parseInt(process.env.WEBSOCKET_MAX_CONNECTIONS || '1000'),
    },
    security: {
      jwtSecret: process.env.JWT_SECRET || 'ff2-team-collaboration-secret',
      jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
      rateLimiting: {
        enabled: process.env.RATE_LIMITING_ENABLED !== 'false',
        windowMs: parseInt(process.env.RATE_WINDOW_MS || '900000'), // 15 minutes
        maxRequests: parseInt(process.env.RATE_MAX_REQUESTS || '100'),
      },
      corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001').split(','),
    },
    performance: {
      lockTimeoutMs: parseInt(process.env.LOCK_TIMEOUT_MS || '30000'),
      conflictDetectionInterval: parseInt(process.env.CONFLICT_DETECTION_INTERVAL || '5000'),
      metricsAggregationInterval: parseInt(process.env.METRICS_AGGREGATION_INTERVAL || '60000'),
      cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL || '300000'), // 5 minutes
    },
    notifications: {
      email: {
        enabled: process.env.EMAIL_NOTIFICATIONS_ENABLED === 'true',
        templates: {},
      },
      webhook: {
        enabled: process.env.WEBHOOK_NOTIFICATIONS_ENABLED === 'true',
        urls: (process.env.WEBHOOK_URLS || '').split(',').filter(url => url),
      },
      external: {
        slack: process.env.SLACK_WEBHOOK ? { webhook: process.env.SLACK_WEBHOOK } : undefined,
        discord: process.env.DISCORD_WEBHOOK ? { webhook: process.env.DISCORD_WEBHOOK } : undefined,
        teams: process.env.TEAMS_WEBHOOK ? { webhook: process.env.TEAMS_WEBHOOK } : undefined,
      },
    },
  };

  return {
    ...defaultConfig,
    ...overrides,
    redis: { ...defaultConfig.redis, ...overrides.redis },
    websocket: { ...defaultConfig.websocket, ...overrides.websocket },
    security: { ...defaultConfig.security, ...overrides.security },
    performance: { ...defaultConfig.performance, ...overrides.performance },
    notifications: { ...defaultConfig.notifications, ...overrides.notifications },
  };
}

/**
 * Validate team collaboration configuration
 * 
 * @param config Configuration to validate
 * @throws {ConfigurationError} If configuration is invalid
 */
export function validateTeamCollaborationConfig(config: TeamCollaborationConfig): void {
  const errors: string[] = [];

  // Redis configuration validation
  if (!config.redis.host) {
    errors.push('Redis host is required');
  }
  if (!config.redis.port || config.redis.port < 1 || config.redis.port > 65535) {
    errors.push('Valid Redis port is required (1-65535)');
  }
  if (config.redis.database < 0 || config.redis.database > 15) {
    errors.push('Redis database must be between 0 and 15');
  }

  // WebSocket configuration validation
  if (!config.websocket.port || config.websocket.port < 1 || config.websocket.port > 65535) {
    errors.push('Valid WebSocket port is required (1-65535)');
  }
  if (!config.websocket.path || !config.websocket.path.startsWith('/')) {
    errors.push('WebSocket path must start with /');
  }

  // Security configuration validation
  if (!config.security.jwtSecret || config.security.jwtSecret.length < 16) {
    errors.push('JWT secret must be at least 16 characters long');
  }
  if (config.security.corsOrigins.length === 0) {
    errors.push('At least one CORS origin is required');
  }

  // Performance configuration validation
  if (config.performance.lockTimeoutMs < 1000) {
    errors.push('Lock timeout must be at least 1000ms');
  }
  if (config.performance.conflictDetectionInterval < 1000) {
    errors.push('Conflict detection interval must be at least 1000ms');
  }

  if (errors.length > 0) {
    throw new ConfigurationError(
      'Team collaboration configuration validation failed',
      { errors }
    );
  }
}

/**
 * Shutdown the team collaboration system gracefully
 * 
 * @param components System components to shutdown
 */
export async function shutdownTeamCollaboration(components: {
  teamManager?: TeamManager;
  dashboard?: TeamDashboard;
  migrationSystem?: MigrationSystem;
}): Promise<void> {
  logger.info('🔄 Shutting down Team Collaboration System...');

  const shutdownPromises: Promise<void>[] = [];

  if (components.migrationSystem) {
    shutdownPromises.push(components.migrationSystem.shutdown());
  }

  if (components.dashboard) {
    shutdownPromises.push(components.dashboard.shutdown());
  }

  if (components.teamManager) {
    shutdownPromises.push(components.teamManager.shutdown());
  }

  try {
    await Promise.all(shutdownPromises);
    logger.info('✅ Team Collaboration System shutdown complete');
  } catch (error) {
    logger.error('❌ Error during Team Collaboration System shutdown', error);
    throw error;
  }
}

/**
 * Get system health status for all collaboration components
 * 
 * @param components System components to check
 * @returns Health status for each component
 */
export async function getTeamCollaborationHealth(components: {
  teamManager?: TeamManager;
  dashboard?: TeamDashboard;
  migrationSystem?: MigrationSystem;
}): Promise<{
  overall: boolean;
  components: {
    teamManager: boolean;
    locking: boolean;
    communication: boolean;
    conflictResolution: boolean;
    dashboard: boolean;
    migration: boolean;
  };
}> {
  const health = {
    overall: false,
    components: {
      teamManager: false,
      locking: false,
      communication: false,
      conflictResolution: false,
      dashboard: false,
      migration: false,
    },
  };

  try {
    if (components.teamManager) {
      health.components.teamManager = true;
      health.components.locking = await components.teamManager.getLockManager().isHealthy();
      health.components.communication = await components.teamManager.getCommunication().isHealthy();
      health.components.conflictResolution = await components.teamManager.getConflictResolver().isHealthy();
    }

    if (components.dashboard) {
      health.components.dashboard = true; // TODO: Add health check to dashboard
    }

    if (components.migrationSystem) {
      health.components.migration = true; // TODO: Add health check to migration system
    }

    // Calculate overall health
    health.overall = Object.values(health.components).every(status => status);
  } catch (error) {
    logger.error('❌ Health check failed', error);
  }

  return health;
}

// Export convenience types for easy access
export type {
  TeamCollaborationConfig,
  Team,
  TeamMember,
  TeamProject,
} from './types';