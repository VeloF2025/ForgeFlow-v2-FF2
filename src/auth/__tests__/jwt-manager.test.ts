/**
 * JWT Manager Tests
 * Comprehensive test suite for JWT token management
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { JWTManager, JWTUtils } from '../jwt-manager';
import { RedisConnectionManager } from '../../infrastructure/redis/redis-connection-manager';
import { JWTConfig, User, Team } from '../types';

// Mock dependencies
jest.mock('../../infrastructure/redis/redis-connection-manager');

describe('JWTManager', () => {
  let jwtManager: JWTManager;
  let mockRedis: jest.Mocked<RedisConnectionManager>;

  const mockConfig: JWTConfig = {
    secretOrPrivateKey: 'test-secret-key',
    algorithm: 'HS256',
    expiresIn: '1h',
    refreshExpiresIn: '7d',
    issuer: 'test-issuer',
    audience: 'test-audience'
  };

  const mockUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    username: 'testuser',
    displayName: 'Test User',
    status: 'active',
    emailVerified: true,
    twoFactorEnabled: false,
    loginAttempts: 0,
    preferences: {
      theme: 'light',
      language: 'en',
      timezone: 'UTC',
      notifications: {
        email: true,
        push: false,
        desktop: false,
        teamActivity: true,
        securityAlerts: true
      },
      privacy: {
        profileVisible: true,
        activityVisible: false,
        allowTeamInvites: true
      }
    },
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis = new RedisConnectionManager({}) as jest.Mocked<RedisConnectionManager>;
    jwtManager = new JWTManager(mockConfig, mockRedis);
  });

  describe('initialize', () => {
    it('should initialize successfully with HS256 algorithm', async () => {
      // Act & Assert
      await expect(jwtManager.initialize()).resolves.toBeUndefined();
    });

    it('should initialize RSA keys for RS256 algorithm', async () => {
      // Arrange
      const rsaConfig: JWTConfig = {
        ...mockConfig,
        algorithm: 'RS256'
      };
      const rsaJwtManager = new JWTManager(rsaConfig, mockRedis);

      mockRedis.executeCommand.mockResolvedValue('OK');

      // Act & Assert
      await expect(rsaJwtManager.initialize()).resolves.toBeUndefined();
    });

    it('should use provided RSA keys for RS256', async () => {
      // Arrange
      const privateKey = '-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----';
      const publicKey = '-----BEGIN PUBLIC KEY-----\nMIIBIj...\n-----END PUBLIC KEY-----';
      
      const rsaConfig: JWTConfig = {
        ...mockConfig,
        algorithm: 'RS256',
        secretOrPrivateKey: privateKey,
        publicKey: publicKey
      };
      
      const rsaJwtManager = new JWTManager(rsaConfig, mockRedis);

      // Act & Assert
      await expect(rsaJwtManager.initialize()).resolves.toBeUndefined();
    });
  });

  describe('createTokens', () => {
    beforeEach(async () => {
      await jwtManager.initialize();
      mockRedis.executeCommand.mockResolvedValue('OK');
    });

    it('should create access and refresh tokens', async () => {
      // Arrange
      const sessionId = 'session-123';
      const deviceId = 'device-123';

      // Act
      const tokens = await jwtManager.createTokens(mockUser, sessionId, deviceId);

      // Assert
      expect(tokens).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        expiresIn: expect.any(Number),
        tokenType: 'Bearer'
      });
      expect(tokens.accessToken).not.toBe(tokens.refreshToken);
    });

    it('should create tokens with team information', async () => {
      // Arrange
      const sessionId = 'session-123';
      const deviceId = 'device-123';
      const mockTeam: Team = {
        id: 'team-123',
        name: 'Test Team',
        slug: 'test-team',
        plan: 'free',
        status: 'active',
        settings: {
          visibility: 'private',
          joinApproval: true,
          twoFactorRequired: false,
          sessionTimeout: 3600,
          allowedDomains: [],
          ssoOnly: false
        },
        limits: {
          maxMembers: 5,
          maxProjects: 3,
          maxStorageGB: 1,
          maxApiCalls: 1000
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const permissions = [
        {
          resource: 'project' as const,
          actions: ['create', 'read', 'update'] as const
        }
      ];

      // Act
      const tokens = await jwtManager.createTokens(mockUser, sessionId, deviceId, mockTeam, permissions);

      // Assert
      expect(tokens.scope).toContain('project:create,read,update');
    });

    it('should store refresh token in Redis', async () => {
      // Arrange
      const sessionId = 'session-123';
      const deviceId = 'device-123';

      // Act
      await jwtManager.createTokens(mockUser, sessionId, deviceId);

      // Assert
      expect(mockRedis.executeCommand).toHaveBeenCalledWith(
        'hmset',
        expect.arrayContaining([
          expect.stringMatching(/^refresh_tokens:/),
          'userId', mockUser.id,
          'sessionId', sessionId,
          'deviceId', deviceId
        ])
      );
    });
  });

  describe('verifyToken', () => {
    let accessToken: string;
    let refreshToken: string;

    beforeEach(async () => {
      await jwtManager.initialize();
      mockRedis.executeCommand.mockResolvedValue('OK');
      
      const tokens = await jwtManager.createTokens(mockUser, 'session-123', 'device-123');
      accessToken = tokens.accessToken;
      refreshToken = tokens.refreshToken;
    });

    it('should verify valid access token', async () => {
      // Act
      const payload = await jwtManager.verifyToken(accessToken, 'access');

      // Assert
      expect(payload).toMatchObject({
        sub: mockUser.id,
        email: mockUser.email,
        username: mockUser.username,
        type: 'access',
        iss: mockConfig.issuer,
        aud: mockConfig.audience
      });
    });

    it('should verify valid refresh token', async () => {
      // Arrange
      mockRedis.executeCommand.mockImplementation(async (command, args) => {
        if (command === 'hget' && args[1] === 'revoked') {
          return 'false';
        }
        return 'OK';
      });

      // Act
      const payload = await jwtManager.verifyToken(refreshToken, 'refresh');

      // Assert
      expect(payload.type).toBe('refresh');
    });

    it('should throw error for invalid token', async () => {
      // Arrange
      const invalidToken = 'invalid.token.here';

      // Act & Assert
      await expect(jwtManager.verifyToken(invalidToken)).rejects.toThrow();
    });

    it('should throw error for wrong token type', async () => {
      // Act & Assert
      await expect(jwtManager.verifyToken(accessToken, 'refresh')).rejects.toThrow(
        'Invalid token type. Expected refresh, got access'
      );
    });

    it('should throw error for revoked refresh token', async () => {
      // Arrange
      mockRedis.executeCommand.mockImplementation(async (command, args) => {
        if (command === 'hget' && args[1] === 'revoked') {
          return 'true';
        }
        return null;
      });

      // Act & Assert
      await expect(jwtManager.verifyToken(refreshToken, 'refresh')).rejects.toThrow(
        'Refresh token has been revoked'
      );
    });
  });

  describe('refreshAccessToken', () => {
    let refreshToken: string;

    beforeEach(async () => {
      await jwtManager.initialize();
      mockRedis.executeCommand.mockImplementation(async (command, args) => {
        if (command === 'hmset') {
          return 'OK';
        }
        if (command === 'hgetall') {
          return {
            userId: mockUser.id,
            sessionId: 'session-123',
            deviceId: 'device-123',
            teamId: '',
            expiresAt: (Date.now() + 7 * 24 * 60 * 60 * 1000).toString(),
            revoked: 'false'
          };
        }
        if (command === 'hget' && args[1] === 'revoked') {
          return 'false';
        }
        return 'OK';
      });

      const tokens = await jwtManager.createTokens(mockUser, 'session-123', 'device-123');
      refreshToken = tokens.refreshToken;
    });

    it('should refresh access token successfully', async () => {
      // Act
      const newTokens = await jwtManager.refreshAccessToken(refreshToken);

      // Assert
      expect(newTokens).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: refreshToken, // Should be the same
        expiresIn: expect.any(Number),
        tokenType: 'Bearer'
      });
    });

    it('should throw error for revoked refresh token', async () => {
      // Arrange
      mockRedis.executeCommand.mockImplementation(async (command, args) => {
        if (command === 'hgetall') {
          return {
            userId: mockUser.id,
            revoked: 'true'
          };
        }
        return null;
      });

      // Act & Assert
      await expect(jwtManager.refreshAccessToken(refreshToken)).rejects.toThrow(
        'Refresh token is invalid or revoked'
      );
    });
  });

  describe('revokeRefreshToken', () => {
    let refreshToken: string;

    beforeEach(async () => {
      await jwtManager.initialize();
      mockRedis.executeCommand.mockResolvedValue('OK');
      
      const tokens = await jwtManager.createTokens(mockUser, 'session-123', 'device-123');
      refreshToken = tokens.refreshToken;
    });

    it('should revoke refresh token', async () => {
      // Arrange
      mockRedis.executeCommand.mockImplementation(async (command, args) => {
        if (command === 'hgetall') {
          return {
            userId: mockUser.id,
            sessionId: 'session-123',
            revoked: 'false'
          };
        }
        return 'OK';
      });

      // Act
      await jwtManager.revokeRefreshToken(refreshToken);

      // Assert
      expect(mockRedis.executeCommand).toHaveBeenCalledWith(
        'hset',
        expect.arrayContaining([
          expect.stringMatching(/^refresh_tokens:/),
          'revoked',
          'true'
        ])
      );
    });

    it('should handle non-existent token gracefully', async () => {
      // Arrange
      mockRedis.executeCommand.mockResolvedValue(null);

      // Act & Assert
      await expect(jwtManager.revokeRefreshToken('non-existent-token')).resolves.toBeUndefined();
    });
  });

  describe('revokeAllRefreshTokens', () => {
    beforeEach(async () => {
      await jwtManager.initialize();
    });

    it('should revoke all refresh tokens for user', async () => {
      // Arrange
      const userId = 'user-123';
      mockRedis.executeCommand.mockImplementation(async (command, args) => {
        if (command === 'keys') {
          return [`refresh_tokens:user:${userId}:session-1`, `refresh_tokens:user:${userId}:session-2`];
        }
        if (command === 'multi' || command === 'exec') {
          return 'OK';
        }
        return 'OK';
      });

      // Act
      await jwtManager.revokeAllRefreshTokens(userId);

      // Assert
      expect(mockRedis.executeCommand).toHaveBeenCalledWith('keys', [`refresh_tokens:user:${userId}:*`]);
    });

    it('should exclude specified session from revocation', async () => {
      // Arrange
      const userId = 'user-123';
      const exceptSessionId = 'session-1';
      
      mockRedis.executeCommand.mockImplementation(async (command, args) => {
        if (command === 'keys') {
          return [`refresh_tokens:user:${userId}:session-1`, `refresh_tokens:user:${userId}:session-2`];
        }
        return 'OK';
      });

      // Act
      await jwtManager.revokeAllRefreshTokens(userId, exceptSessionId);

      // Assert - Only session-2 should be revoked
      expect(mockRedis.executeCommand).toHaveBeenCalledWith('keys', [`refresh_tokens:user:${userId}:*`]);
    });
  });

  describe('getTokenStats', () => {
    beforeEach(async () => {
      await jwtManager.initialize();
    });

    it('should return token statistics', async () => {
      // Arrange
      mockRedis.executeCommand.mockImplementation(async (command, args) => {
        if (command === 'keys') {
          return ['refresh_tokens:1', 'refresh_tokens:2', 'refresh_tokens:3'];
        }
        if (command === 'eval') {
          return 1; // 1 revoked token
        }
        return [];
      });

      // Act
      const stats = await jwtManager.getTokenStats();

      // Assert
      expect(stats).toMatchObject({
        activeAccessTokens: 0, // Access tokens are stateless
        activeRefreshTokens: 2, // 3 total - 1 revoked
        revokedRefreshTokens: 1,
        expiredTokens: 0
      });
    });

    it('should handle Redis errors gracefully', async () => {
      // Arrange
      mockRedis.executeCommand.mockRejectedValue(new Error('Redis error'));

      // Act
      const stats = await jwtManager.getTokenStats();

      // Assert
      expect(stats).toMatchObject({
        activeAccessTokens: 0,
        activeRefreshTokens: 0,
        revokedRefreshTokens: 0,
        expiredTokens: 0
      });
    });
  });

  describe('cleanupExpiredTokens', () => {
    beforeEach(async () => {
      await jwtManager.initialize();
    });

    it('should cleanup expired refresh tokens', async () => {
      // Arrange
      const now = Date.now();
      const expiredTime = now - 3600000; // 1 hour ago

      mockRedis.executeCommand.mockImplementation(async (command, args) => {
        if (command === 'keys') {
          return ['refresh_tokens:1', 'refresh_tokens:2'];
        }
        if (command === 'hget' && args[1] === 'expiresAt') {
          if (args[0] === 'refresh_tokens:1') {
            return expiredTime.toString();
          }
          return now.toString(); // Not expired
        }
        if (command === 'del') {
          return 1;
        }
        return 'OK';
      });

      // Act
      const cleanedCount = await jwtManager.cleanupExpiredTokens();

      // Assert
      expect(cleanedCount).toBe(1);
      expect(mockRedis.executeCommand).toHaveBeenCalledWith('del', ['refresh_tokens:1']);
    });

    it('should handle cleanup errors gracefully', async () => {
      // Arrange
      mockRedis.executeCommand.mockRejectedValue(new Error('Redis error'));

      // Act
      const cleanedCount = await jwtManager.cleanupExpiredTokens();

      // Assert
      expect(cleanedCount).toBe(0);
    });
  });

  describe('close', () => {
    it('should close JWT manager successfully', async () => {
      // Act & Assert
      await expect(jwtManager.close()).resolves.toBeUndefined();
    });
  });
});

describe('JWTUtils', () => {
  const mockJWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsInR5cGUiOiJhY2Nlc3MiLCJpYXQiOjE2MzQwMDAwMDAsImV4cCI6MTYzNDAwMzYwMH0.signature';

  describe('extractUserId', () => {
    it('should extract user ID from valid token', () => {
      // Act
      const userId = JWTUtils.extractUserId(mockJWT);

      // Assert
      expect(userId).toBe('user-123');
    });

    it('should return null for invalid token', () => {
      // Act
      const userId = JWTUtils.extractUserId('invalid.token');

      // Assert
      expect(userId).toBeNull();
    });
  });

  describe('isTokenExpired', () => {
    it('should return true for expired token', () => {
      // Act
      const isExpired = JWTUtils.isTokenExpired(mockJWT);

      // Assert
      expect(isExpired).toBe(true); // Mock token has past expiry
    });

    it('should return true for invalid token', () => {
      // Act
      const isExpired = JWTUtils.isTokenExpired('invalid.token');

      // Assert
      expect(isExpired).toBe(true);
    });
  });

  describe('getTokenExpiration', () => {
    it('should return expiration date for valid token', () => {
      // Act
      const expiration = JWTUtils.getTokenExpiration(mockJWT);

      // Assert
      expect(expiration).toBeInstanceOf(Date);
      expect(expiration?.getTime()).toBe(1634003600 * 1000);
    });

    it('should return null for invalid token', () => {
      // Act
      const expiration = JWTUtils.getTokenExpiration('invalid.token');

      // Assert
      expect(expiration).toBeNull();
    });
  });

  describe('getTokenType', () => {
    it('should return token type for valid token', () => {
      // Act
      const tokenType = JWTUtils.getTokenType(mockJWT);

      // Assert
      expect(tokenType).toBe('access');
    });

    it('should return null for invalid token', () => {
      // Act
      const tokenType = JWTUtils.getTokenType('invalid.token');

      // Assert
      expect(tokenType).toBeNull();
    });
  });
});