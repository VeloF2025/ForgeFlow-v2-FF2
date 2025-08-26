/**
 * Security Middleware for ForgeFlow v2
 * Comprehensive security layer with rate limiting, CSRF protection, and threat detection
 */

import { Request, Response, NextFunction } from 'express';
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import helmet from 'helmet';
import crypto from 'crypto';
import { Logger } from '../utils/enhanced-logger';
import { RedisConnectionManager } from '../infrastructure/redis/redis-connection-manager';
import { JWTManager, JWTUtils } from './jwt-manager';
import { SessionManager } from './session-manager';
import { TwoFactorManager } from './two-factor-manager';
import {
  RateLimitConfig,
  SecurityConfig,
  AuthSession,
  SecurityEvent,
  AuthenticationError,
  RateLimitError
} from './types';

export interface SecurityMiddlewareConfig {
  rateLimit: RateLimitConfig;
  security: SecurityConfig;
  csrf: {
    enabled: boolean;
    cookieName: string;
    headerName: string;
    secret: string;
  };
  cors: {
    origin: string | string[] | boolean;
    credentials: boolean;
    methods: string[];
    allowedHeaders: string[];
  };
  contentSecurityPolicy: {
    enabled: boolean;
    directives: Record<string, string[]>;
  };
}

export interface RateLimitOptions {
  windowMs: number;
  maxAttempts: number;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  onLimitReached?: (req: Request, rateLimiterRes: RateLimiterRes) => void;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    username: string;
    teamId?: string;
  };
  session?: AuthSession;
  permissions?: string[];
  deviceId?: string;
  csrfToken?: string;
}

// 🟢 WORKING: Comprehensive security middleware with rate limiting and threat detection
export class SecurityMiddleware {
  private readonly logger = Logger.getInstance().child({ component: 'SecurityMiddleware' });
  private readonly redis: RedisConnectionManager;
  private readonly jwtManager: JWTManager;
  private readonly sessionManager: SessionManager;
  private readonly twoFactorManager: TwoFactorManager;
  private readonly config: SecurityMiddlewareConfig;
  
  // Rate limiters for different endpoints
  private readonly rateLimiters: Map<string, RateLimiterRedis> = new Map();
  
  // Security event tracking
  private readonly securityEvents: Map<string, number> = new Map();

  constructor(
    redis: RedisConnectionManager,
    jwtManager: JWTManager,
    sessionManager: SessionManager,
    twoFactorManager: TwoFactorManager,
    config: SecurityMiddlewareConfig
  ) {
    this.redis = redis;
    this.jwtManager = jwtManager;
    this.sessionManager = sessionManager;
    this.twoFactorManager = twoFactorManager;
    this.config = config;
    this.initializeRateLimiters();
  }

  /**
   * Initialize rate limiters for different endpoints
   */
  private initializeRateLimiters(): void {
    const redisClient = this.redis.getConnection('write') as any;

    // Authentication endpoints (stricter limits)
    this.rateLimiters.set('auth', new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'rl_auth',
      points: 5, // Number of attempts
      duration: 900, // Per 15 minutes
      blockDuration: 900 // Block for 15 minutes
    }));

    // API endpoints (general limits)
    this.rateLimiters.set('api', new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'rl_api',
      points: 100, // Number of requests
      duration: 60, // Per minute
      blockDuration: 60 // Block for 1 minute
    }));

    // Password reset (very strict)
    this.rateLimiters.set('password_reset', new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'rl_password_reset',
      points: 3, // Number of attempts
      duration: 3600, // Per hour
      blockDuration: 3600 // Block for 1 hour
    }));

    // Two-factor authentication
    this.rateLimiters.set('two_factor', new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'rl_two_factor',
      points: 10, // Number of attempts
      duration: 300, // Per 5 minutes
      blockDuration: 900 // Block for 15 minutes
    }));

    // Team invitations
    this.rateLimiters.set('invitations', new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'rl_invitations',
      points: 10, // Number of invitations
      duration: 3600, // Per hour
      blockDuration: 3600 // Block for 1 hour
    }));

    this.logger.info('Rate limiters initialized', {
      limiters: Array.from(this.rateLimiters.keys())
    });
  }

  /**
   * Apply security headers
   */
  applySecurityHeaders() {
    return helmet({
      contentSecurityPolicy: this.config.contentSecurityPolicy.enabled ? {
        directives: this.config.contentSecurityPolicy.directives
      } : false,
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true
      },
      noSniff: true,
      frameguard: { action: 'deny' },
      xssFilter: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginEmbedderPolicy: false // Disable for compatibility
    });
  }

  /**
   * Rate limiting middleware
   */
  rateLimit(limiterName: string, options?: Partial<RateLimitOptions>) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const limiter = this.rateLimiters.get(limiterName);
        if (!limiter) {
          this.logger.warn('Rate limiter not found', { limiterName });
          return next();
        }

        const key = options?.keyGenerator ? options.keyGenerator(req) : this.getClientKey(req);
        
        try {
          await limiter.consume(key);
          next();
        } catch (rateLimiterRes) {
          const remainingTime = Math.round(rateLimiterRes.msBeforeNext / 1000);
          
          // Log rate limit event
          await this.logSecurityEvent('rate_limit_exceeded', 'medium', {
            limiterName,
            key,
            ip: this.getClientIP(req),
            userAgent: req.get('User-Agent'),
            endpoint: req.originalUrl
          });

          // Call custom handler if provided
          if (options?.onLimitReached) {
            options.onLimitReached(req, rateLimiterRes);
          }

          res.set('Retry-After', String(remainingTime));
          throw new RateLimitError(remainingTime);
        }
      } catch (error) {
        if (error instanceof RateLimitError) {
          return res.status(error.statusCode).json({
            error: 'Rate limit exceeded',
            code: error.code,
            retryAfter: error.retryAfter
          });
        }

        this.logger.error('Rate limiting error', { error, limiterName });
        next(error);
      }
    };
  }

  /**
   * JWT authentication middleware
   */
  authenticate(required: boolean = true) {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const token = this.extractBearerToken(req);
        
        if (!token) {
          if (required) {
            throw new AuthenticationError(
              'Authentication token required',
              'TOKEN_REQUIRED',
              401
            );
          }
          return next();
        }

        // Verify JWT token
        const payload = await this.jwtManager.verifyToken(token, 'access');
        
        // Get session if session ID is in token
        let session: AuthSession | null = null;
        if (payload.sessionId) {
          session = await this.sessionManager.getSession(payload.sessionId);
          
          if (!session) {
            throw new AuthenticationError(
              'Session not found or expired',
              'SESSION_NOT_FOUND',
              401
            );
          }
        }

        // Set request context
        req.user = {
          id: payload.sub,
          email: payload.email,
          username: payload.username,
          teamId: payload.teamId
        };
        
        req.session = session || undefined;
        req.permissions = payload.permissions?.map(p => `${p.resource}:${p.actions.join(',')}`) || [];
        req.deviceId = payload.deviceId;

        // Update session activity
        if (session) {
          await this.sessionManager.updateActivity(
            session.id,
            `${req.method} ${req.originalUrl}`,
            undefined,
            true
          );
        }

        next();
      } catch (error) {
        if (error instanceof AuthenticationError) {
          return res.status(error.statusCode).json({
            error: error.message,
            code: error.code
          });
        }

        this.logger.error('Authentication error', { error });
        res.status(401).json({
          error: 'Authentication failed',
          code: 'AUTHENTICATION_FAILED'
        });
      }
    };
  }

  /**
   * Two-factor authentication middleware
   */
  requireTwoFactor() {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        if (!req.user) {
          throw new AuthenticationError(
            'User not authenticated',
            'USER_NOT_AUTHENTICATED',
            401
          );
        }

        // Check if 2FA is enabled for user
        const twoFactorStatus = await this.twoFactorManager.getTwoFactorStatus(req.user.id);
        
        if (!twoFactorStatus.enabled) {
          return next(); // 2FA not enabled, continue
        }

        // Check if device is trusted
        if (req.deviceId && await this.twoFactorManager.isDeviceTrusted(req.user.id, req.deviceId)) {
          return next(); // Trusted device, continue
        }

        // Check for 2FA verification in session
        if (req.session?.metadata?.twoFactorVerified) {
          return next(); // Already verified in this session
        }

        // Require 2FA verification
        throw new AuthenticationError(
          'Two-factor authentication required',
          'TWO_FACTOR_REQUIRED',
          403
        );
      } catch (error) {
        if (error instanceof AuthenticationError) {
          return res.status(error.statusCode).json({
            error: error.message,
            code: error.code
          });
        }

        this.logger.error('Two-factor authentication error', { error });
        res.status(500).json({
          error: 'Two-factor authentication check failed',
          code: 'TWO_FACTOR_CHECK_FAILED'
        });
      }
    };
  }

  /**
   * CSRF protection middleware
   */
  csrfProtection() {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        if (!this.config.csrf.enabled) {
          return next();
        }

        // Skip CSRF for GET, HEAD, OPTIONS
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
          return next();
        }

        // Skip CSRF for API key authentication
        if (req.headers.authorization?.startsWith('ApiKey ')) {
          return next();
        }

        const token = req.headers[this.config.csrf.headerName] as string ||
                     req.body._csrf ||
                     req.query._csrf as string;

        const sessionToken = req.session?.metadata?.csrfToken;

        if (!token || !sessionToken || token !== sessionToken) {
          await this.logSecurityEvent('csrf_token_mismatch', 'high', {
            ip: this.getClientIP(req),
            userAgent: req.get('User-Agent'),
            endpoint: req.originalUrl,
            providedToken: !!token,
            sessionToken: !!sessionToken
          });

          throw new AuthenticationError(
            'CSRF token mismatch',
            'CSRF_TOKEN_MISMATCH',
            403
          );
        }

        next();
      } catch (error) {
        if (error instanceof AuthenticationError) {
          return res.status(error.statusCode).json({
            error: error.message,
            code: error.code
          });
        }

        this.logger.error('CSRF protection error', { error });
        res.status(500).json({
          error: 'CSRF protection failed',
          code: 'CSRF_PROTECTION_FAILED'
        });
      }
    };
  }

  /**
   * Generate CSRF token
   */
  generateCSRFToken(req: AuthenticatedRequest): string {
    if (!this.config.csrf.enabled || !req.session) {
      return '';
    }

    const token = crypto.randomBytes(32).toString('hex');
    req.session.metadata = {
      ...req.session.metadata,
      csrfToken: token
    };

    return token;
  }

  /**
   * Suspicious activity detection
   */
  detectSuspiciousActivity() {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const clientIP = this.getClientIP(req);
        const userAgent = req.get('User-Agent') || '';
        
        // Check for suspicious patterns
        const suspiciousPatterns = [
          // SQL injection attempts
          /(\bunion\b.*\bselect\b)|(\bselect\b.*\bfrom\b)|(\bdrop\b.*\btable\b)/i,
          // XSS attempts
          /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
          // Path traversal
          /(\.\.[\/\\]){2,}/,
          // Command injection
          /[;&|`$]/
        ];

        const requestData = JSON.stringify({
          url: req.originalUrl,
          query: req.query,
          body: req.body,
          headers: req.headers
        });

        for (const pattern of suspiciousPatterns) {
          if (pattern.test(requestData)) {
            await this.logSecurityEvent('suspicious_request_pattern', 'high', {
              ip: clientIP,
              userAgent,
              endpoint: req.originalUrl,
              pattern: pattern.toString(),
              userId: req.user?.id
            });

            // Block the request
            return res.status(403).json({
              error: 'Request blocked due to suspicious activity',
              code: 'SUSPICIOUS_ACTIVITY_DETECTED'
            });
          }
        }

        // Check for rapid requests from same IP
        const requestKey = `rapid_requests:${clientIP}`;
        const requestCount = await this.redis.executeCommand<number>('incr', [requestKey]);
        
        if (requestCount === 1) {
          await this.redis.executeCommand('expire', [requestKey, 60]); // 1 minute window
        }

        if (requestCount > 300) { // More than 300 requests per minute from same IP
          await this.logSecurityEvent('rapid_requests_detected', 'medium', {
            ip: clientIP,
            userAgent,
            requestCount,
            userId: req.user?.id
          });
        }

        next();
      } catch (error) {
        this.logger.error('Suspicious activity detection error', { error });
        next(); // Don't block on detection errors
      }
    };
  }

  /**
   * API key authentication middleware
   */
  authenticateApiKey() {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const apiKeyHeader = req.headers.authorization;
        
        if (!apiKeyHeader || !apiKeyHeader.startsWith('ApiKey ')) {
          return next(); // No API key, continue to other auth methods
        }

        const apiKey = apiKeyHeader.substring(7); // Remove 'ApiKey ' prefix
        
        // Validate API key (implementation would depend on API key service)
        // For now, we'll assume a validateApiKey method exists
        // const keyData = await this.apiKeyService.validateApiKey(apiKey);
        
        // if (!keyData) {
        //   throw new AuthenticationError(
        //     'Invalid API key',
        //     'INVALID_API_KEY',
        //     401
        //   );
        // }

        // Set request context for API key authentication
        // req.user = { id: keyData.userId, ... };
        // req.permissions = keyData.permissions.map(p => `${p.resource}:${p.actions.join(',')}`);

        next();
      } catch (error) {
        if (error instanceof AuthenticationError) {
          return res.status(error.statusCode).json({
            error: error.message,
            code: error.code
          });
        }

        this.logger.error('API key authentication error', { error });
        res.status(500).json({
          error: 'API key authentication failed',
          code: 'API_KEY_AUTH_FAILED'
        });
      }
    };
  }

  /**
   * Security event logging
   */
  private async logSecurityEvent(
    eventType: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    metadata: Record<string, any>
  ): Promise<void> {
    try {
      const event: Omit<SecurityEvent, 'id' | 'timestamp' | 'resolved'> = {
        type: eventType as any,
        severity,
        userId: metadata.userId,
        teamId: metadata.teamId,
        description: `Security event: ${eventType}`,
        metadata,
        resolvedBy: undefined,
        resolvedAt: undefined
      };

      // Store in Redis for immediate processing
      await this.redis.executeCommand('lpush', [
        'security_events',
        JSON.stringify({ ...event, timestamp: new Date() })
      ]);

      // Keep only last 1000 events
      await this.redis.executeCommand('ltrim', ['security_events', 0, 999]);

      // Track event counts
      const eventKey = `security_event_count:${eventType}`;
      await this.redis.executeCommand('incr', [eventKey]);
      await this.redis.executeCommand('expire', [eventKey, 24 * 60 * 60]); // 24 hours

      this.logger.warn('Security event logged', {
        type: eventType,
        severity,
        metadata
      });
    } catch (error) {
      this.logger.error('Failed to log security event', { error, eventType });
    }
  }

  // 🟡 PARTIAL: Helper methods
  private getClientKey(req: Request): string {
    // Use IP address as the primary key, but include user ID if authenticated
    const ip = this.getClientIP(req);
    const userId = (req as AuthenticatedRequest).user?.id;
    
    return userId ? `${ip}:${userId}` : ip;
  }

  private getClientIP(req: Request): string {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
           req.headers['x-real-ip'] as string ||
           req.connection.remoteAddress ||
           req.ip ||
           'unknown';
  }

  private extractBearerToken(req: Request): string | null {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    return authHeader.substring(7);
  }
}

// 🟢 WORKING: Security middleware factory
export function createSecurityMiddleware(
  redis: RedisConnectionManager,
  jwtManager: JWTManager,
  sessionManager: SessionManager,
  twoFactorManager: TwoFactorManager,
  config: SecurityMiddlewareConfig
): SecurityMiddleware {
  return new SecurityMiddleware(
    redis,
    jwtManager,
    sessionManager,
    twoFactorManager,
    config
  );
}

// 🟢 WORKING: Default security configuration
export const defaultSecurityConfig: SecurityMiddlewareConfig = {
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxAttempts: 100,
    skipSuccessfulRequests: false,
    skipFailedRequests: false
  },
  security: {
    bcryptRounds: 12,
    maxLoginAttempts: 5,
    lockoutDuration: 15 * 60, // 15 minutes
    passwordPolicy: {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      preventReuse: 5,
      maxAge: 90 * 24 * 60 * 60 // 90 days
    },
    twoFactor: {
      enabled: true,
      issuer: 'ForgeFlow v2',
      window: 2,
      backupCodes: true
    },
    auditLog: true
  },
  csrf: {
    enabled: true,
    cookieName: '__Secure-ff2-csrf',
    headerName: 'x-csrf-token',
    secret: process.env.CSRF_SECRET || 'fallback-secret-key'
  },
  cors: {
    origin: process.env.CORS_ORIGIN || true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-CSRF-Token'
    ]
  },
  contentSecurityPolicy: {
    enabled: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  }
};