/**
 * Authentication Module for ForgeFlow v2
 * Main entry point for all authentication components
 */

// 🟢 WORKING: Export all authentication types
export * from './types';

// 🟢 WORKING: Export core authentication services
export { AuthService } from './auth-service';
export { JWTManager, JWTUtils } from './jwt-manager';
export { SessionManager } from './session-manager';
export { OAuthManager } from './oauth-manager';
export { TwoFactorManager } from './two-factor-manager';
export { RBACManager } from './rbac-manager';
export { TeamService } from './team-service';

// 🟢 WORKING: Export security middleware
export { 
  SecurityMiddleware, 
  createSecurityMiddleware, 
  defaultSecurityConfig 
} from './security-middleware';

// 🟢 WORKING: Export authentication factory
import { RedisConnectionManager } from '../infrastructure/redis/redis-connection-manager';
import { AuthService } from './auth-service';
import { JWTManager } from './jwt-manager';
import { SessionManager } from './session-manager';
import { OAuthManager } from './oauth-manager';
import { TwoFactorManager } from './two-factor-manager';
import { RBACManager } from './rbac-manager';
import { TeamService } from './team-service';
import { SecurityMiddleware, createSecurityMiddleware, defaultSecurityConfig } from './security-middleware';
import { 
  AuthConfig, 
  SecurityMiddlewareConfig 
} from './types';
import { Logger } from '../utils/enhanced-logger';

export interface AuthModuleConfig {
  auth: AuthConfig;
  security?: Partial<SecurityMiddlewareConfig>;
}

export interface AuthModule {
  authService: AuthService;
  jwtManager: JWTManager;
  sessionManager: SessionManager;
  oauthManager: OAuthManager;
  twoFactorManager: TwoFactorManager;
  rbacManager: RBACManager;
  teamService: TeamService;
  securityMiddleware: SecurityMiddleware;
}

/**
 * Create authentication module with all components
 */
export async function createAuthModule(
  redis: RedisConnectionManager,
  config: AuthModuleConfig
): Promise<AuthModule> {
  const logger = Logger.getInstance().child({ component: 'AuthModule' });

  try {
    logger.info('Creating authentication module', {
      jwtAlgorithm: config.auth.jwt.algorithm,
      oauthProviders: config.auth.oauth.providers.length,
      twoFactorEnabled: config.auth.security.twoFactor.enabled
    });

    // Create core components
    const jwtManager = new JWTManager(config.auth.jwt, redis);
    const sessionManager = new SessionManager(config.auth.session, redis);
    const oauthManager = new OAuthManager(config.auth.oauth, redis);
    const twoFactorManager = new TwoFactorManager(config.auth.security.twoFactor, redis);
    const rbacManager = new RBACManager(redis);
    
    // Create team service with RBAC integration
    const teamService = new TeamService(redis, rbacManager, config.auth.team);

    // Create main auth service
    const authService = new AuthService(config.auth, {
      redis,
      jwtManager,
      sessionManager,
      oauthManager,
      twoFactorManager,
      rbacManager,
      teamService
    });

    // Create security middleware
    const securityConfig: SecurityMiddlewareConfig = {
      ...defaultSecurityConfig,
      ...config.security
    };
    
    const securityMiddleware = createSecurityMiddleware(
      redis,
      jwtManager,
      sessionManager,
      twoFactorManager,
      securityConfig
    );

    // Initialize all components
    await Promise.all([
      authService.initialize(),
      // Other components are initialized by the auth service
    ]);

    logger.info('Authentication module created successfully');

    return {
      authService,
      jwtManager,
      sessionManager,
      oauthManager,
      twoFactorManager,
      rbacManager,
      teamService,
      securityMiddleware
    };
  } catch (error) {
    logger.error('Failed to create authentication module', { error });
    throw error;
  }
}

/**
 * Default authentication configuration
 */
export function getDefaultAuthConfig(): AuthConfig {
  return {
    jwt: {
      secretOrPrivateKey: process.env.JWT_SECRET || 'fallback-jwt-secret',
      publicKey: process.env.JWT_PUBLIC_KEY,
      algorithm: (process.env.JWT_ALGORITHM as any) || 'HS256',
      expiresIn: process.env.JWT_EXPIRES_IN || '1h',
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      issuer: process.env.JWT_ISSUER || 'forgeflow-v2',
      audience: process.env.JWT_AUDIENCE || 'forgeflow-v2'
    },
    oauth: {
      providers: [
        {
          name: 'github',
          clientId: process.env.GITHUB_CLIENT_ID || '',
          clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
          scope: ['user:email', 'read:user'],
          enabled: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)
        },
        {
          name: 'google',
          clientId: process.env.GOOGLE_CLIENT_ID || '',
          clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
          scope: ['openid', 'profile', 'email'],
          enabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
        },
        {
          name: 'microsoft',
          clientId: process.env.MICROSOFT_CLIENT_ID || '',
          clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
          scope: ['openid', 'profile', 'email'],
          enabled: !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET)
        }
      ],
      redirectUrl: process.env.OAUTH_REDIRECT_URL || 'http://localhost:3000/auth/callback',
      stateSecret: process.env.OAUTH_STATE_SECRET || 'fallback-state-secret'
    },
    session: {
      name: process.env.SESSION_NAME || 'ff2-session',
      secret: process.env.SESSION_SECRET || 'fallback-session-secret',
      ttl: parseInt(process.env.SESSION_TTL || '86400'), // 24 hours
      maxSessions: parseInt(process.env.MAX_SESSIONS || '10'),
      rolling: process.env.SESSION_ROLLING === 'true',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'strict'
    },
    security: {
      bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12'),
      maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5'),
      lockoutDuration: parseInt(process.env.LOCKOUT_DURATION || '900'), // 15 minutes
      passwordPolicy: {
        minLength: parseInt(process.env.PASSWORD_MIN_LENGTH || '8'),
        requireUppercase: process.env.PASSWORD_REQUIRE_UPPERCASE !== 'false',
        requireLowercase: process.env.PASSWORD_REQUIRE_LOWERCASE !== 'false',
        requireNumbers: process.env.PASSWORD_REQUIRE_NUMBERS !== 'false',
        requireSpecialChars: process.env.PASSWORD_REQUIRE_SPECIAL !== 'false',
        preventReuse: parseInt(process.env.PASSWORD_PREVENT_REUSE || '5'),
        maxAge: parseInt(process.env.PASSWORD_MAX_AGE || '7776000') // 90 days
      },
      twoFactor: {
        enabled: process.env.TWO_FACTOR_ENABLED !== 'false',
        issuer: process.env.TWO_FACTOR_ISSUER || 'ForgeFlow v2',
        window: parseInt(process.env.TWO_FACTOR_WINDOW || '2'),
        backupCodes: process.env.TWO_FACTOR_BACKUP_CODES !== 'false'
      },
      auditLog: process.env.AUDIT_LOG_ENABLED !== 'false'
    },
    team: {
      maxTeamSize: parseInt(process.env.MAX_TEAM_SIZE || '50'),
      invitationTTL: parseInt(process.env.INVITATION_TTL || '604800'), // 7 days
      defaultRole: (process.env.DEFAULT_TEAM_ROLE as any) || 'developer',
      allowSelfRegistration: process.env.ALLOW_SELF_REGISTRATION === 'true',
      requireApproval: process.env.REQUIRE_TEAM_APPROVAL !== 'false'
    },
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'), // 15 minutes
      maxAttempts: parseInt(process.env.RATE_LIMIT_MAX || '100'),
      skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESS === 'true',
      skipFailedRequests: process.env.RATE_LIMIT_SKIP_FAILED === 'true'
    }
  };
}

/**
 * Validation for authentication configuration
 */
export function validateAuthConfig(config: AuthConfig): void {
  const errors: string[] = [];

  // Validate JWT configuration
  if (!config.jwt.secretOrPrivateKey) {
    errors.push('JWT secret or private key is required');
  }

  if (config.jwt.algorithm === 'RS256' && !config.jwt.publicKey) {
    errors.push('JWT public key is required for RS256 algorithm');
  }

  // Validate session configuration
  if (!config.session.secret) {
    errors.push('Session secret is required');
  }

  // Validate OAuth configuration
  for (const provider of config.oauth.providers) {
    if (provider.enabled && (!provider.clientId || !provider.clientSecret)) {
      errors.push(`OAuth provider ${provider.name} is enabled but missing client credentials`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Authentication configuration errors:\n${errors.join('\n')}`);
  }
}

/**
 * Health check for authentication module
 */
export async function healthCheck(authModule: AuthModule): Promise<{
  status: 'healthy' | 'unhealthy';
  checks: Record<string, boolean>;
  details?: Record<string, any>;
}> {
  const logger = Logger.getInstance().child({ component: 'AuthHealthCheck' });

  try {
    const checks: Record<string, boolean> = {};
    const details: Record<string, any> = {};

    // Check JWT manager
    try {
      const tokenStats = await authModule.jwtManager.getTokenStats();
      checks.jwt = true;
      details.jwt = tokenStats;
    } catch {
      checks.jwt = false;
    }

    // Check session manager
    try {
      const sessionStats = await authModule.sessionManager.getSessionStats();
      checks.sessions = true;
      details.sessions = sessionStats;
    } catch {
      checks.sessions = false;
    }

    // Check OAuth manager
    try {
      const enabledProviders = authModule.oauthManager.getEnabledProviders();
      checks.oauth = true;
      details.oauth = { enabledProviders };
    } catch {
      checks.oauth = false;
    }

    // Check RBAC manager
    try {
      const roleValidation = await authModule.rbacManager.validateRoleHierarchy();
      checks.rbac = roleValidation.valid;
      details.rbac = roleValidation;
    } catch {
      checks.rbac = false;
    }

    const allHealthy = Object.values(checks).every(Boolean);

    return {
      status: allHealthy ? 'healthy' : 'unhealthy',
      checks,
      details
    };
  } catch (error) {
    logger.error('Authentication health check failed', { error });
    
    return {
      status: 'unhealthy',
      checks: {
        jwt: false,
        sessions: false,
        oauth: false,
        rbac: false
      }
    };
  }
}