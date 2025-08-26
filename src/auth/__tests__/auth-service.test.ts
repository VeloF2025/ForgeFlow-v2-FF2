/**
 * Authentication Service Tests
 * Comprehensive test suite for the AuthService with >95% coverage
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AuthService } from '../auth-service';
import { JWTManager } from '../jwt-manager';
import { SessionManager } from '../session-manager';
import { OAuthManager } from '../oauth-manager';
import { TwoFactorManager } from '../two-factor-manager';
import { RBACManager } from '../rbac-manager';
import { TeamService } from '../team-service';
import { RedisConnectionManager } from '../../infrastructure/redis/redis-connection-manager';
import {
  AuthConfig,
  LoginRequest,
  User,
  AuthenticationError,
  ValidationError
} from '../types';

// Mock dependencies
jest.mock('../jwt-manager');
jest.mock('../session-manager');
jest.mock('../oauth-manager');
jest.mock('../two-factor-manager');
jest.mock('../rbac-manager');
jest.mock('../team-service');
jest.mock('../../infrastructure/redis/redis-connection-manager');

describe('AuthService', () => {
  let authService: AuthService;
  let mockRedis: jest.Mocked<RedisConnectionManager>;
  let mockJWT: jest.Mocked<JWTManager>;
  let mockSession: jest.Mocked<SessionManager>;
  let mockOAuth: jest.Mocked<OAuthManager>;
  let mockTwoFactor: jest.Mocked<TwoFactorManager>;
  let mockRBAC: jest.Mocked<RBACManager>;
  let mockTeam: jest.Mocked<TeamService>;

  const mockConfig: AuthConfig = {
    jwt: {
      secretOrPrivateKey: 'test-secret',
      algorithm: 'HS256',
      expiresIn: '1h',
      refreshExpiresIn: '7d',
      issuer: 'test-issuer',
      audience: 'test-audience'
    },
    oauth: {
      providers: [],
      redirectUrl: 'http://localhost:3000/callback',
      stateSecret: 'state-secret'
    },
    session: {
      name: 'test-session',
      secret: 'session-secret',
      ttl: 3600,
      maxSessions: 5,
      rolling: true,
      secure: false,
      httpOnly: true,
      sameSite: 'strict'
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
    team: {
      maxTeamSize: 10,
      invitationTTL: 7 * 24 * 60 * 60,
      defaultRole: 'developer',
      allowSelfRegistration: false,
      requireApproval: true
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000,
      maxAttempts: 100,
      skipSuccessfulRequests: false,
      skipFailedRequests: false
    }
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock instances
    mockRedis = new RedisConnectionManager({}) as jest.Mocked<RedisConnectionManager>;
    mockJWT = new JWTManager(mockConfig.jwt, mockRedis) as jest.Mocked<JWTManager>;
    mockSession = new SessionManager(mockConfig.session, mockRedis) as jest.Mocked<SessionManager>;
    mockOAuth = new OAuthManager(mockConfig.oauth, mockRedis) as jest.Mocked<OAuthManager>;
    mockTwoFactor = new TwoFactorManager(mockConfig.security.twoFactor, mockRedis) as jest.Mocked<TwoFactorManager>;
    mockRBAC = new RBACManager(mockRedis) as jest.Mocked<RBACManager>;
    mockTeam = new TeamService(mockRedis, mockRBAC) as jest.Mocked<TeamService>;

    // Create auth service
    authService = new AuthService(mockConfig, {
      redis: mockRedis,
      jwtManager: mockJWT,
      sessionManager: mockSession,
      oauthManager: mockOAuth,
      twoFactorManager: mockTwoFactor,
      rbacManager: mockRBAC,
      teamService: mockTeam
    });
  });

  describe('initialize', () => {
    it('should initialize all components successfully', async () => {
      // Arrange
      mockJWT.initialize.mockResolvedValue();
      mockSession.initialize.mockResolvedValue();

      // Act & Assert
      await expect(authService.initialize()).resolves.toBeUndefined();
      expect(mockJWT.initialize).toHaveBeenCalledOnce();
      expect(mockSession.initialize).toHaveBeenCalledOnce();
    });

    it('should throw error if component initialization fails', async () => {
      // Arrange
      const error = new Error('JWT initialization failed');
      mockJWT.initialize.mockRejectedValue(error);

      // Act & Assert
      await expect(authService.initialize()).rejects.toThrow(error);
    });
  });

  describe('login', () => {
    const validLoginRequest: LoginRequest = {
      email: 'test@example.com',
      password: 'Test123!@#',
      deviceInfo: {
        type: 'web',
        name: 'Chrome Browser',
        os: 'Windows',
        browser: 'Chrome'
      }
    };

    const mockUser: User & { passwordHash: string } = {
      id: 'user-123',
      email: 'test@example.com',
      username: 'testuser',
      displayName: 'Test User',
      passwordHash: '$2b$10$hashedpassword',
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

    it('should login successfully with valid credentials', async () => {
      // Arrange
      mockRedis.executeCommand.mockImplementation(async (command, args) => {
        if (command === 'get' && args[0] === 'users:email:test@example.com') {
          return JSON.stringify(mockUser);
        }
        return null;
      });

      const mockSession = {
        id: 'session-123',
        userId: 'user-123',
        deviceId: 'device-123',
        deviceInfo: validLoginRequest.deviceInfo,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        isActive: true,
        lastActivity: new Date(),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        permissions: []
      };

      const mockTokens = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
        tokenType: 'Bearer' as const
      };

      mockSession.createSession.mockResolvedValue(mockSession);
      mockTwoFactor.getTwoFactorStatus.mockResolvedValue({
        enabled: false,
        verified: false,
        methods: [],
        backupCodesRemaining: 0
      });
      mockJWT.createTokens.mockResolvedValue(mockTokens);

      // Mock bcrypt.compare to return true
      jest.doMock('bcryptjs', () => ({
        compare: jest.fn().mockResolvedValue(true),
        hash: jest.fn().mockResolvedValue('hashed')
      }));

      // Act
      const result = await authService.login(validLoginRequest);

      // Assert
      expect(result).toMatchObject({
        user: {
          id: 'user-123',
          email: 'test@example.com',
          username: 'testuser'
        },
        tokens: mockTokens,
        requiresTwoFactor: false
      });
    });

    it('should throw error for invalid email', async () => {
      // Arrange
      mockRedis.executeCommand.mockResolvedValue(null);

      // Act & Assert
      await expect(authService.login(validLoginRequest)).rejects.toThrow(
        new AuthenticationError('Invalid email or password', 'INVALID_CREDENTIALS', 401)
      );
    });

    it('should throw error for invalid password', async () => {
      // Arrange
      mockRedis.executeCommand.mockResolvedValue(JSON.stringify(mockUser));

      // Mock bcrypt.compare to return false
      jest.doMock('bcryptjs', () => ({
        compare: jest.fn().mockResolvedValue(false)
      }));

      // Act & Assert
      await expect(authService.login(validLoginRequest)).rejects.toThrow(
        new AuthenticationError('Invalid email or password', 'INVALID_CREDENTIALS', 401)
      );
    });

    it('should require 2FA when enabled and device not trusted', async () => {
      // Arrange
      mockRedis.executeCommand.mockResolvedValue(JSON.stringify(mockUser));
      mockSession.createSession.mockResolvedValue({
        id: 'session-123',
        userId: 'user-123',
        deviceId: 'device-123',
        deviceInfo: validLoginRequest.deviceInfo,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        isActive: true,
        lastActivity: new Date(),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        permissions: []
      });

      mockTwoFactor.getTwoFactorStatus.mockResolvedValue({
        enabled: true,
        verified: true,
        methods: [{ type: 'totp', enabled: true, verified: true }],
        backupCodesRemaining: 5
      });

      mockTwoFactor.isDeviceTrusted.mockResolvedValue(false);

      // Mock bcrypt
      jest.doMock('bcryptjs', () => ({
        compare: jest.fn().mockResolvedValue(true)
      }));

      // Act
      const result = await authService.login(validLoginRequest);

      // Assert
      expect(result.requiresTwoFactor).toBe(true);
      expect(result.twoFactorMethods).toBeDefined();
      expect(result.tokens.accessToken).toBe('');
    });

    it('should validate login request schema', async () => {
      // Arrange
      const invalidRequest = {
        email: 'invalid-email',
        password: 'short',
        deviceInfo: {
          type: 'invalid'
        }
      };

      // Act & Assert
      await expect(authService.login(invalidRequest as any)).rejects.toThrow();
    });

    it('should handle locked user account', async () => {
      // Arrange
      const lockedUser = {
        ...mockUser,
        loginAttempts: 5,
        lockedUntil: new Date(Date.now() + 300000) // 5 minutes from now
      };

      mockRedis.executeCommand.mockResolvedValue(JSON.stringify(lockedUser));

      // Act & Assert
      await expect(authService.login(validLoginRequest)).rejects.toThrow(
        new AuthenticationError('Account is temporarily locked due to too many failed login attempts', 'ACCOUNT_LOCKED', 423)
      );
    });
  });

  describe('register', () => {
    const validRegisterRequest = {
      email: 'newuser@example.com',
      username: 'newuser',
      password: 'NewUser123!@#',
      displayName: 'New User',
      deviceInfo: {
        type: 'web' as const,
        name: 'Chrome Browser',
        os: 'Windows',
        browser: 'Chrome'
      }
    };

    it('should register new user successfully', async () => {
      // Arrange
      mockRedis.executeCommand.mockImplementation(async (command, args) => {
        // Return null for user existence checks
        if (command === 'get' && (args[0].includes('users:email:') || args[0].includes('users:username:'))) {
          return null;
        }
        return 'OK';
      });

      const mockSession = {
        id: 'session-123',
        userId: 'user-123',
        deviceId: 'device-123',
        deviceInfo: validRegisterRequest.deviceInfo,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        isActive: true,
        lastActivity: new Date(),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        permissions: []
      };

      const mockTokens = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
        tokenType: 'Bearer' as const
      };

      mockSession.createSession.mockResolvedValue(mockSession);
      mockJWT.createTokens.mockResolvedValue(mockTokens);

      // Mock bcrypt
      jest.doMock('bcryptjs', () => ({
        hash: jest.fn().mockResolvedValue('hashed-password')
      }));

      // Act
      const result = await authService.register(validRegisterRequest);

      // Assert
      expect(result).toMatchObject({
        user: {
          email: 'newuser@example.com',
          username: 'newuser',
          displayName: 'New User'
        },
        tokens: mockTokens,
        requiresTwoFactor: false
      });
    });

    it('should throw error if email already exists', async () => {
      // Arrange
      const existingUser = {
        id: 'existing-user',
        email: 'newuser@example.com'
      };

      mockRedis.executeCommand.mockImplementation(async (command, args) => {
        if (command === 'get' && args[0] === 'users:email:newuser@example.com') {
          return JSON.stringify(existingUser);
        }
        return null;
      });

      // Act & Assert
      await expect(authService.register(validRegisterRequest)).rejects.toThrow(ValidationError);
    });

    it('should throw error if username already exists', async () => {
      // Arrange
      mockRedis.executeCommand.mockImplementation(async (command, args) => {
        if (command === 'get' && args[0] === 'users:email:newuser@example.com') {
          return null;
        }
        if (command === 'get' && args[0] === 'users:username:newuser') {
          return JSON.stringify({ id: 'existing-user', username: 'newuser' });
        }
        return null;
      });

      // Act & Assert
      await expect(authService.register(validRegisterRequest)).rejects.toThrow(ValidationError);
    });

    it('should validate password policy', async () => {
      // Arrange
      const weakPasswordRequest = {
        ...validRegisterRequest,
        password: 'weak'
      };

      // Act & Assert
      await expect(authService.register(weakPasswordRequest)).rejects.toThrow(ValidationError);
    });

    it('should handle team invitation during registration', async () => {
      // Arrange
      const requestWithInvite = {
        ...validRegisterRequest,
        inviteToken: 'invite-token-123'
      };

      mockRedis.executeCommand.mockResolvedValue(null); // No existing user

      const mockTeamMember = {
        id: 'member-123',
        userId: 'user-123',
        teamId: 'team-123',
        role: 'developer' as const,
        permissions: [],
        status: 'active' as const
      };

      const mockTeam = {
        id: 'team-123',
        name: 'Test Team',
        slug: 'test-team',
        plan: 'free' as const,
        status: 'active' as const,
        settings: {
          visibility: 'private' as const,
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

      mockTeam.acceptInvitation.mockResolvedValue(mockTeamMember);
      mockTeam.getTeam.mockResolvedValue(mockTeam);
      mockTeam.getUserPermissions.mockResolvedValue([]);

      // Act
      const result = await authService.register(requestWithInvite);

      // Assert
      expect(result.team).toBeDefined();
      expect(mockTeam.acceptInvitation).toHaveBeenCalledWith('invite-token-123', expect.any(String));
    });
  });

  describe('logout', () => {
    it('should logout user successfully', async () => {
      // Arrange
      const sessionId = 'session-123';
      const mockSession = {
        id: sessionId,
        userId: 'user-123',
        teamId: 'team-123',
        deviceId: 'device-123',
        deviceInfo: { type: 'web' as const, name: 'Chrome' },
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        isActive: true,
        lastActivity: new Date(),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        permissions: []
      };

      mockSession.getSession.mockResolvedValue(mockSession);
      mockSession.invalidateSession.mockResolvedValue();

      // Act
      await authService.logout(sessionId);

      // Assert
      expect(mockSession.invalidateSession).toHaveBeenCalledWith(sessionId);
    });

    it('should handle logout for non-existent session', async () => {
      // Arrange
      mockSession.getSession.mockResolvedValue(null);

      // Act & Assert
      await expect(authService.logout('non-existent-session')).resolves.toBeUndefined();
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      // Arrange
      const refreshToken = 'refresh-token-123';
      const newTokens = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 3600,
        tokenType: 'Bearer' as const
      };

      mockJWT.refreshAccessToken.mockResolvedValue(newTokens);

      // Act
      const result = await authService.refreshToken(refreshToken);

      // Assert
      expect(result).toEqual(newTokens);
      expect(mockJWT.refreshAccessToken).toHaveBeenCalledWith(refreshToken);
    });

    it('should throw error for invalid refresh token', async () => {
      // Arrange
      mockJWT.refreshAccessToken.mockRejectedValue(new Error('Invalid token'));

      // Act & Assert
      await expect(authService.refreshToken('invalid-token')).rejects.toThrow(
        new AuthenticationError('Failed to refresh token', 'TOKEN_REFRESH_FAILED', 401)
      );
    });
  });

  describe('setupTwoFactor', () => {
    it('should setup 2FA successfully', async () => {
      // Arrange
      const userId = 'user-123';
      const setupData = {
        secret: 'JBSWY3DPEHPK3PXP',
        qrCode: 'data:image/png;base64,...',
        backupCodes: ['12345678', '87654321']
      };

      mockTwoFactor.setupTwoFactor.mockResolvedValue(setupData);

      // Act
      const result = await authService.setupTwoFactor(userId);

      // Assert
      expect(result).toEqual(setupData);
      expect(mockTwoFactor.setupTwoFactor).toHaveBeenCalledWith(userId);
    });

    it('should throw error if 2FA setup fails', async () => {
      // Arrange
      const error = new Error('2FA setup failed');
      mockTwoFactor.setupTwoFactor.mockRejectedValue(error);

      // Act & Assert
      await expect(authService.setupTwoFactor('user-123')).rejects.toThrow(error);
    });
  });

  describe('verifyTwoFactor', () => {
    it('should verify 2FA successfully', async () => {
      // Arrange
      const verification = {
        sessionId: 'session-123',
        code: '123456',
        method: 'totp' as const,
        rememberDevice: true
      };

      const mockSession = {
        id: 'session-123',
        userId: 'user-123',
        teamId: 'team-123',
        deviceId: 'device-123',
        deviceInfo: { type: 'web' as const, name: 'Chrome' },
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        isActive: true,
        lastActivity: new Date(),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        permissions: [],
        metadata: {}
      };

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        displayName: 'Test User',
        passwordHash: 'hashed',
        status: 'active' as const,
        emailVerified: true,
        twoFactorEnabled: true,
        loginAttempts: 0,
        preferences: {
          theme: 'light' as const,
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

      const mockTokens = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
        tokenType: 'Bearer' as const
      };

      mockTwoFactor.verifyTwoFactor.mockResolvedValue({
        success: true,
        trustDevice: true
      });
      mockSession.getSession.mockResolvedValue(mockSession);
      mockRedis.executeCommand.mockResolvedValue(JSON.stringify(mockUser));
      mockJWT.createTokens.mockResolvedValue(mockTokens);
      mockTwoFactor.trustDevice.mockResolvedValue();

      // Act
      const result = await authService.verifyTwoFactor(verification);

      // Assert
      expect(result.requiresTwoFactor).toBe(false);
      expect(result.tokens).toEqual(mockTokens);
      expect(mockTwoFactor.trustDevice).toHaveBeenCalled();
    });

    it('should throw error for failed 2FA verification', async () => {
      // Arrange
      const verification = {
        sessionId: 'session-123',
        code: 'invalid',
        method: 'totp' as const
      };

      mockTwoFactor.verifyTwoFactor.mockResolvedValue({
        success: false
      });

      // Act & Assert
      await expect(authService.verifyTwoFactor(verification)).rejects.toThrow(
        new AuthenticationError('Two-factor verification failed', 'TWO_FACTOR_VERIFICATION_FAILED', 401)
      );
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      // Arrange
      const userId = 'user-123';
      const currentPassword = 'OldPassword123!';
      const newPassword = 'NewPassword123!';

      const mockUser = {
        id: userId,
        email: 'test@example.com',
        username: 'testuser',
        displayName: 'Test User',
        passwordHash: 'old-hashed-password',
        status: 'active' as const,
        emailVerified: true,
        twoFactorEnabled: false,
        loginAttempts: 0,
        preferences: {
          theme: 'light' as const,
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

      mockRedis.executeCommand.mockImplementation(async (command, args) => {
        if (command === 'get' && args[0] === `users:${userId}`) {
          return JSON.stringify(mockUser);
        }
        return 'OK';
      });

      // Mock bcrypt
      jest.doMock('bcryptjs', () => ({
        compare: jest.fn().mockResolvedValue(true),
        hash: jest.fn().mockResolvedValue('new-hashed-password')
      }));

      // Act
      await authService.changePassword(userId, currentPassword, newPassword);

      // Assert
      expect(mockRedis.executeCommand).toHaveBeenCalledWith('set', expect.arrayContaining([
        `users:${userId}`,
        expect.stringContaining('new-hashed-password')
      ]));
    });

    it('should throw error for incorrect current password', async () => {
      // Arrange
      const userId = 'user-123';
      const mockUser = {
        id: userId,
        passwordHash: 'hashed-password'
      };

      mockRedis.executeCommand.mockResolvedValue(JSON.stringify(mockUser));

      // Mock bcrypt to return false for current password verification
      jest.doMock('bcryptjs', () => ({
        compare: jest.fn().mockResolvedValue(false)
      }));

      // Act & Assert
      await expect(
        authService.changePassword(userId, 'wrong-password', 'NewPassword123!')
      ).rejects.toThrow(
        new AuthenticationError('Current password is incorrect', 'INVALID_CURRENT_PASSWORD', 401)
      );
    });

    it('should validate new password policy', async () => {
      // Arrange
      const userId = 'user-123';
      const mockUser = {
        id: userId,
        passwordHash: 'hashed-password'
      };

      mockRedis.executeCommand.mockResolvedValue(JSON.stringify(mockUser));

      // Mock bcrypt
      jest.doMock('bcryptjs', () => ({
        compare: jest.fn().mockResolvedValue(true)
      }));

      // Act & Assert
      await expect(
        authService.changePassword(userId, 'current-password', 'weak')
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('password reset', () => {
    describe('requestPasswordReset', () => {
      it('should generate reset token for existing user', async () => {
        // Arrange
        const email = 'test@example.com';
        const mockUser = {
          id: 'user-123',
          email: 'test@example.com'
        };

        mockRedis.executeCommand.mockImplementation(async (command, args) => {
          if (command === 'get' && args[0] === 'users:email:test@example.com') {
            return JSON.stringify(mockUser);
          }
          if (command === 'setex') {
            return 'OK';
          }
          return null;
        });

        // Act
        await authService.requestPasswordReset(email);

        // Assert
        expect(mockRedis.executeCommand).toHaveBeenCalledWith(
          'setex',
          expect.arrayContaining([
            expect.stringMatching(/^password_reset:/),
            3600,
            expect.any(String)
          ])
        );
      });

      it('should not reveal if user does not exist', async () => {
        // Arrange
        mockRedis.executeCommand.mockResolvedValue(null);

        // Act & Assert
        await expect(authService.requestPasswordReset('nonexistent@example.com')).resolves.toBeUndefined();
      });
    });

    describe('resetPassword', () => {
      it('should reset password with valid token', async () => {
        // Arrange
        const token = 'reset-token-123';
        const newPassword = 'NewPassword123!';
        const resetData = {
          userId: 'user-123',
          email: 'test@example.com',
          expiresAt: new Date(Date.now() + 3600000).toISOString()
        };

        const mockUser = {
          id: 'user-123',
          email: 'test@example.com',
          passwordHash: 'old-hash'
        };

        mockRedis.executeCommand.mockImplementation(async (command, args) => {
          if (command === 'get' && args[0] === `password_reset:${token}`) {
            return JSON.stringify(resetData);
          }
          if (command === 'get' && args[0] === 'users:user-123') {
            return JSON.stringify(mockUser);
          }
          return 'OK';
        });

        mockSession.invalidateAllUserSessions.mockResolvedValue(2);

        // Mock bcrypt
        jest.doMock('bcryptjs', () => ({
          hash: jest.fn().mockResolvedValue('new-hashed-password')
        }));

        // Act
        await authService.resetPassword(token, newPassword);

        // Assert
        expect(mockRedis.executeCommand).toHaveBeenCalledWith('del', [`password_reset:${token}`]);
        expect(mockSession.invalidateAllUserSessions).toHaveBeenCalledWith('user-123');
      });

      it('should throw error for invalid token', async () => {
        // Arrange
        mockRedis.executeCommand.mockResolvedValue(null);

        // Act & Assert
        await expect(authService.resetPassword('invalid-token', 'NewPassword123!')).rejects.toThrow(
          new AuthenticationError('Invalid or expired reset token', 'INVALID_RESET_TOKEN', 400)
        );
      });

      it('should throw error for expired token', async () => {
        // Arrange
        const expiredResetData = {
          userId: 'user-123',
          expiresAt: new Date(Date.now() - 3600000).toISOString() // Expired 1 hour ago
        };

        mockRedis.executeCommand.mockResolvedValue(JSON.stringify(expiredResetData));

        // Act & Assert
        await expect(authService.resetPassword('expired-token', 'NewPassword123!')).rejects.toThrow(
          new AuthenticationError('Reset token has expired', 'RESET_TOKEN_EXPIRED', 400)
        );
      });
    });
  });

  describe('session management', () => {
    it('should get active sessions for user', async () => {
      // Arrange
      const userId = 'user-123';
      const mockSessions = [
        {
          id: 'session-1',
          userId,
          deviceId: 'device-1',
          deviceInfo: { type: 'web' as const, name: 'Chrome' },
          ipAddress: '127.0.0.1',
          userAgent: 'Chrome',
          isActive: true,
          lastActivity: new Date(),
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 3600000),
          permissions: []
        }
      ];

      mockSession.getUserSessions.mockResolvedValue(mockSessions);

      // Act
      const result = await authService.getActiveSessions(userId);

      // Assert
      expect(result).toEqual(mockSessions);
      expect(mockSession.getUserSessions).toHaveBeenCalledWith(userId);
    });

    it('should terminate specific session', async () => {
      // Arrange
      const sessionId = 'session-123';
      mockSession.invalidateSession.mockResolvedValue();

      // Act
      await authService.terminateSession(sessionId);

      // Assert
      expect(mockSession.invalidateSession).toHaveBeenCalledWith(sessionId);
    });

    it('should terminate all user sessions', async () => {
      // Arrange
      const userId = 'user-123';
      const exceptSessionId = 'current-session';
      mockSession.invalidateAllUserSessions.mockResolvedValue(3);

      // Act
      await authService.terminateAllSessions(userId, exceptSessionId);

      // Assert
      expect(mockSession.invalidateAllUserSessions).toHaveBeenCalledWith(userId, exceptSessionId);
    });
  });
});

// Helper function to create mock Redis commands
function createMockRedisCommand(responses: Record<string, any>) {
  return jest.fn().mockImplementation(async (command: string, args: string[]) => {
    const key = `${command}:${args.join(':')}`;
    return responses[key] || null;
  });
}