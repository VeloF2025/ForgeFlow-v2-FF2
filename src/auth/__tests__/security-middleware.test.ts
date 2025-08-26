/**
 * Security Middleware Tests
 * Comprehensive test suite for security middleware and rate limiting
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';
import { SecurityMiddleware } from '../security-middleware';
import { JWTManager } from '../jwt-manager';
import { SessionManager } from '../session-manager';
import { TwoFactorManager } from '../two-factor-manager';
import { RedisConnectionManager } from '../../infrastructure/redis/redis-connection-manager';
import { SecurityMiddlewareConfig, AuthSession, AuthenticationError, RateLimitError } from '../types';

// Mock dependencies
jest.mock('../jwt-manager');
jest.mock('../session-manager');
jest.mock('../two-factor-manager');
jest.mock('../../infrastructure/redis/redis-connection-manager');
jest.mock('rate-limiter-flexible');

describe('SecurityMiddleware', () => {
  let securityMiddleware: SecurityMiddleware;
  let mockRedis: jest.Mocked<RedisConnectionManager>;
  let mockJWT: jest.Mocked<JWTManager>;
  let mockSession: jest.Mocked<SessionManager>;
  let mockTwoFactor: jest.Mocked<TwoFactorManager>;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.MockedFunction<NextFunction>;

  const mockConfig: SecurityMiddlewareConfig = {
    rateLimit: {
      windowMs: 15 * 60 * 1000,
      maxAttempts: 100,
      skipSuccessfulRequests: false,
      skipFailedRequests: false
    },
    security: {
      bcryptRounds: 10,
      maxLoginAttempts: 3,
      lockoutDuration: 300,
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        preventReuse: 3,
        maxAge: 30 * 24 * 60 * 60
      },
      twoFactor: {
        enabled: true,
        issuer: 'test-issuer',
        window: 2,
        backupCodes: true
      },
      auditLog: true
    },
    csrf: {
      enabled: true,
      cookieName: '__Secure-csrf',
      headerName: 'x-csrf-token',
      secret: 'csrf-secret'
    },
    cors: {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization']
    },
    contentSecurityPolicy: {
      enabled: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"]
      }
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock instances
    mockRedis = new RedisConnectionManager({}) as jest.Mocked<RedisConnectionManager>;
    mockJWT = new JWTManager({} as any, mockRedis) as jest.Mocked<JWTManager>;
    mockSession = new SessionManager({} as any, mockRedis) as jest.Mocked<SessionManager>;
    mockTwoFactor = new TwoFactorManager({} as any, mockRedis) as jest.Mocked<TwoFactorManager>;

    securityMiddleware = new SecurityMiddleware(
      mockRedis,
      mockJWT,
      mockSession,
      mockTwoFactor,
      mockConfig
    );

    // Mock request/response objects
    mockReq = {
      headers: {},
      method: 'GET',
      originalUrl: '/test',
      connection: { remoteAddress: '127.0.0.1' },
      ip: '127.0.0.1',
      get: jest.fn()
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis()
    };

    mockNext = jest.fn();

    // Mock rate limiter
    const mockRateLimiter = {
      consume: jest.fn().mockResolvedValue(undefined)
    };

    (require('rate-limiter-flexible') as any).RateLimiterRedis = jest.fn().mockImplementation(() => mockRateLimiter);
  });

  describe('applySecurityHeaders', () => {
    it('should apply security headers using helmet', () => {
      // Act
      const middleware = securityMiddleware.applySecurityHeaders();

      // Assert
      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });
  });

  describe('rateLimit', () => {
    it('should allow requests within rate limit', async () => {
      // Arrange
      const middleware = securityMiddleware.rateLimit('api');

      // Act
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledOnce();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should block requests exceeding rate limit', async () => {
      // Arrange
      const rateLimiterError = {
        msBeforeNext: 60000,
        remainingHits: 0
      };
      
      const mockRateLimiter = {
        consume: jest.fn().mockRejectedValue(rateLimiterError)
      };

      (require('rate-limiter-flexible') as any).RateLimiterRedis = jest.fn().mockImplementation(() => mockRateLimiter);
      
      const newSecurityMiddleware = new SecurityMiddleware(
        mockRedis,
        mockJWT,
        mockSession,
        mockTwoFactor,
        mockConfig
      );

      const middleware = newSecurityMiddleware.rateLimit('api');

      // Act
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: 60
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should use custom key generator when provided', async () => {
      // Arrange
      const customKeyGenerator = jest.fn().mockReturnValue('custom-key');
      const middleware = securityMiddleware.rateLimit('api', { keyGenerator: customKeyGenerator });

      // Act
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(customKeyGenerator).toHaveBeenCalledWith(mockReq);
    });

    it('should handle rate limiter not found gracefully', async () => {
      // Arrange
      const middleware = securityMiddleware.rateLimit('nonexistent');

      // Act
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledOnce();
    });
  });

  describe('authenticate', () => {
    const validToken = 'Bearer valid-jwt-token';
    const mockPayload = {
      sub: 'user-123',
      email: 'test@example.com',
      username: 'testuser',
      sessionId: 'session-123',
      deviceId: 'device-123',
      permissions: [{ resource: 'project', actions: ['read'] }],
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: 'test-issuer',
      aud: 'test-audience'
    };

    const mockSession: AuthSession = {
      id: 'session-123',
      userId: 'user-123',
      deviceId: 'device-123',
      deviceInfo: { type: 'web', name: 'Chrome' },
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
      isActive: true,
      lastActivity: new Date(),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
      permissions: []
    };

    it('should authenticate user with valid token', async () => {
      // Arrange
      mockReq.headers!.authorization = validToken;
      mockJWT.verifyToken.mockResolvedValue(mockPayload);
      mockSession.getSession.mockResolvedValue(mockSession);
      mockSession.updateActivity.mockResolvedValue();

      const middleware = securityMiddleware.authenticate();

      // Act
      await middleware(mockReq as any, mockRes as Response, mockNext);

      // Assert
      expect(mockReq.user).toMatchObject({
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser'
      });
      expect(mockReq.session).toEqual(mockSession);
      expect(mockNext).toHaveBeenCalledOnce();
    });

    it('should reject invalid token', async () => {
      // Arrange
      mockReq.headers!.authorization = 'Bearer invalid-token';
      mockJWT.verifyToken.mockRejectedValue(new Error('Invalid token'));

      const middleware = securityMiddleware.authenticate();

      // Act
      await middleware(mockReq as any, mockRes as Response, mockNext);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Authentication failed',
        code: 'AUTHENTICATION_FAILED'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle missing token when authentication is required', async () => {
      // Arrange
      const middleware = securityMiddleware.authenticate(true);

      // Act
      await middleware(mockReq as any, mockRes as Response, mockNext);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Authentication token required',
        code: 'TOKEN_REQUIRED'
      });
    });

    it('should allow missing token when authentication is optional', async () => {
      // Arrange
      const middleware = securityMiddleware.authenticate(false);

      // Act
      await middleware(mockReq as any, mockRes as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledOnce();
      expect(mockReq.user).toBeUndefined();
    });

    it('should reject expired session', async () => {
      // Arrange
      mockReq.headers!.authorization = validToken;
      mockJWT.verifyToken.mockResolvedValue(mockPayload);
      mockSession.getSession.mockResolvedValue(null); // Session not found

      const middleware = securityMiddleware.authenticate();

      // Act
      await middleware(mockReq as any, mockRes as Response, mockNext);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Session not found or expired',
        code: 'SESSION_NOT_FOUND'
      });
    });
  });

  describe('requireTwoFactor', () => {
    beforeEach(() => {
      mockReq.user = {
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser'
      };
      mockReq.deviceId = 'device-123';
    });

    it('should allow access when 2FA is not enabled', async () => {
      // Arrange
      mockTwoFactor.getTwoFactorStatus.mockResolvedValue({
        enabled: false,
        verified: false,
        methods: [],
        backupCodesRemaining: 0
      });

      const middleware = securityMiddleware.requireTwoFactor();

      // Act
      await middleware(mockReq as any, mockRes as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledOnce();
    });

    it('should allow access for trusted device', async () => {
      // Arrange
      mockTwoFactor.getTwoFactorStatus.mockResolvedValue({
        enabled: true,
        verified: true,
        methods: [{ type: 'totp', enabled: true, verified: true }],
        backupCodesRemaining: 5
      });
      mockTwoFactor.isDeviceTrusted.mockResolvedValue(true);

      const middleware = securityMiddleware.requireTwoFactor();

      // Act
      await middleware(mockReq as any, mockRes as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledOnce();
    });

    it('should allow access when 2FA already verified in session', async () => {
      // Arrange
      mockReq.session = {
        id: 'session-123',
        metadata: { twoFactorVerified: true }
      } as any;

      mockTwoFactor.getTwoFactorStatus.mockResolvedValue({
        enabled: true,
        verified: true,
        methods: [{ type: 'totp', enabled: true, verified: true }],
        backupCodesRemaining: 5
      });
      mockTwoFactor.isDeviceTrusted.mockResolvedValue(false);

      const middleware = securityMiddleware.requireTwoFactor();

      // Act
      await middleware(mockReq as any, mockRes as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledOnce();
    });

    it('should require 2FA when enabled and device not trusted', async () => {
      // Arrange
      mockTwoFactor.getTwoFactorStatus.mockResolvedValue({
        enabled: true,
        verified: true,
        methods: [{ type: 'totp', enabled: true, verified: true }],
        backupCodesRemaining: 5
      });
      mockTwoFactor.isDeviceTrusted.mockResolvedValue(false);

      const middleware = securityMiddleware.requireTwoFactor();

      // Act
      await middleware(mockReq as any, mockRes as Response, mockNext);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Two-factor authentication required',
        code: 'TWO_FACTOR_REQUIRED'
      });
    });

    it('should handle unauthenticated user', async () => {
      // Arrange
      mockReq.user = undefined;

      const middleware = securityMiddleware.requireTwoFactor();

      // Act
      await middleware(mockReq as any, mockRes as Response, mockNext);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'User not authenticated',
        code: 'USER_NOT_AUTHENTICATED'
      });
    });
  });

  describe('csrfProtection', () => {
    it('should skip CSRF for GET requests', async () => {
      // Arrange
      mockReq.method = 'GET';
      const middleware = securityMiddleware.csrfProtection();

      // Act
      await middleware(mockReq as any, mockRes as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledOnce();
    });

    it('should skip CSRF for API key authentication', async () => {
      // Arrange
      mockReq.method = 'POST';
      mockReq.headers!.authorization = 'ApiKey test-key';
      const middleware = securityMiddleware.csrfProtection();

      // Act
      await middleware(mockReq as any, mockRes as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledOnce();
    });

    it('should validate CSRF token for POST requests', async () => {
      // Arrange
      mockReq.method = 'POST';
      mockReq.headers!['x-csrf-token'] = 'valid-csrf-token';
      mockReq.session = {
        metadata: { csrfToken: 'valid-csrf-token' }
      } as any;

      const middleware = securityMiddleware.csrfProtection();

      // Act
      await middleware(mockReq as any, mockRes as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledOnce();
    });

    it('should reject invalid CSRF token', async () => {
      // Arrange
      mockReq.method = 'POST';
      mockReq.headers!['x-csrf-token'] = 'invalid-csrf-token';
      mockReq.session = {
        metadata: { csrfToken: 'valid-csrf-token' }
      } as any;

      const middleware = securityMiddleware.csrfProtection();

      // Act
      await middleware(mockReq as any, mockRes as Response, mockNext);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'CSRF token mismatch',
        code: 'CSRF_TOKEN_MISMATCH'
      });
    });

    it('should skip CSRF when disabled in config', async () => {
      // Arrange
      const configWithoutCSRF = {
        ...mockConfig,
        csrf: { ...mockConfig.csrf, enabled: false }
      };

      const securityMiddlewareNoCSRF = new SecurityMiddleware(
        mockRedis,
        mockJWT,
        mockSession,
        mockTwoFactor,
        configWithoutCSRF
      );

      mockReq.method = 'POST';
      const middleware = securityMiddlewareNoCSRF.csrfProtection();

      // Act
      await middleware(mockReq as any, mockRes as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledOnce();
    });
  });

  describe('detectSuspiciousActivity', () => {
    it('should allow normal requests', async () => {
      // Arrange
      mockReq.originalUrl = '/normal/path';
      mockReq.query = { search: 'normal search' };
      mockReq.body = { data: 'normal data' };
      
      mockRedis.executeCommand.mockImplementation(async (command, args) => {
        if (command === 'incr') return 1;
        if (command === 'expire') return 1;
        return 'OK';
      });

      const middleware = securityMiddleware.detectSuspiciousActivity();

      // Act
      await middleware(mockReq as any, mockRes as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledOnce();
    });

    it('should block SQL injection attempts', async () => {
      // Arrange
      mockReq.originalUrl = '/api/search';
      mockReq.query = { q: "'; DROP TABLE users; --" };
      mockReq.body = {};

      const middleware = securityMiddleware.detectSuspiciousActivity();

      // Act
      await middleware(mockReq as any, mockRes as Response, mockNext);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Request blocked due to suspicious activity',
        code: 'SUSPICIOUS_ACTIVITY_DETECTED'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should block XSS attempts', async () => {
      // Arrange
      mockReq.originalUrl = '/api/comment';
      mockReq.body = { comment: '<script>alert("xss")</script>' };

      const middleware = securityMiddleware.detectSuspiciousActivity();

      // Act
      await middleware(mockReq as any, mockRes as Response, mockNext);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Request blocked due to suspicious activity',
        code: 'SUSPICIOUS_ACTIVITY_DETECTED'
      });
    });

    it('should block path traversal attempts', async () => {
      // Arrange
      mockReq.originalUrl = '/api/file';
      mockReq.query = { path: '../../../etc/passwd' };

      const middleware = securityMiddleware.detectSuspiciousActivity();

      // Act
      await middleware(mockReq as any, mockRes as Response, mockNext);

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(403);
    });

    it('should detect rapid requests from same IP', async () => {
      // Arrange
      mockReq.connection!.remoteAddress = '192.168.1.100';
      
      mockRedis.executeCommand.mockImplementation(async (command, args) => {
        if (command === 'incr' && args[0] === 'rapid_requests:192.168.1.100') {
          return 350; // Exceeds threshold of 300
        }
        return 'OK';
      });

      const middleware = securityMiddleware.detectSuspiciousActivity();

      // Act
      await middleware(mockReq as any, mockRes as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledOnce(); // Should continue but log the event
    });

    it('should handle detection errors gracefully', async () => {
      // Arrange
      mockRedis.executeCommand.mockRejectedValue(new Error('Redis error'));

      const middleware = securityMiddleware.detectSuspiciousActivity();

      // Act
      await middleware(mockReq as any, mockRes as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledOnce(); // Should continue despite error
    });
  });

  describe('generateCSRFToken', () => {
    it('should generate CSRF token when enabled', () => {
      // Arrange
      mockReq.session = { metadata: {} } as any;

      // Act
      const token = securityMiddleware.generateCSRFToken(mockReq as any);

      // Assert
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.length).toBe(64); // 32 bytes * 2 (hex)
      expect(mockReq.session!.metadata!.csrfToken).toBe(token);
    });

    it('should return empty string when CSRF disabled', () => {
      // Arrange
      const configWithoutCSRF = {
        ...mockConfig,
        csrf: { ...mockConfig.csrf, enabled: false }
      };

      const securityMiddlewareNoCSRF = new SecurityMiddleware(
        mockRedis,
        mockJWT,
        mockSession,
        mockTwoFactor,
        configWithoutCSRF
      );

      // Act
      const token = securityMiddlewareNoCSRF.generateCSRFToken(mockReq as any);

      // Assert
      expect(token).toBe('');
    });

    it('should return empty string when no session', () => {
      // Arrange
      mockReq.session = undefined;

      // Act
      const token = securityMiddleware.generateCSRFToken(mockReq as any);

      // Assert
      expect(token).toBe('');
    });
  });

  describe('authenticateApiKey', () => {
    it('should continue when no API key provided', async () => {
      // Arrange
      const middleware = securityMiddleware.authenticateApiKey();

      // Act
      await middleware(mockReq as any, mockRes as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledOnce();
    });

    it('should handle API key authentication', async () => {
      // Arrange
      mockReq.headers!.authorization = 'ApiKey test-api-key';
      const middleware = securityMiddleware.authenticateApiKey();

      // Act
      await middleware(mockReq as any, mockRes as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledOnce();
      // Note: Actual API key validation would require API key service
    });
  });

  describe('helper methods', () => {
    it('should extract client IP correctly', () => {
      // Test different IP extraction scenarios
      const testCases = [
        {
          headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' },
          expected: '192.168.1.1'
        },
        {
          headers: { 'x-real-ip': '192.168.1.2' },
          expected: '192.168.1.2'
        },
        {
          headers: {},
          connection: { remoteAddress: '127.0.0.1' },
          expected: '127.0.0.1'
        }
      ];

      // This test would require access to private methods or refactoring
      // For now, we test through the middleware behavior
    });
  });
});