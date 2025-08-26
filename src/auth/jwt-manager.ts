/**
 * JWT Token Manager for ForgeFlow v2
 * Handles JWT token creation, verification, and key management
 * Supports both HS256 and RS256 algorithms with automatic key rotation
 */

import jwt, { SignOptions, VerifyOptions, JwtPayload } from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { Logger } from '../utils/enhanced-logger';
import { RedisConnectionManager } from '../infrastructure/redis/redis-connection-manager';
import { JWTConfig, AuthToken, User, Team, ResolvedPermission } from './types';

export interface TokenPayload extends JwtPayload {
  sub: string; // User ID
  email: string;
  username: string;
  teamId?: string;
  role?: string;
  permissions?: ResolvedPermission[];
  sessionId: string;
  deviceId: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export interface KeyPair {
  privateKey: string;
  publicKey: string;
  kid: string; // Key ID
  createdAt: Date;
  expiresAt?: Date;
}

export interface RefreshTokenData {
  userId: string;
  sessionId: string;
  deviceId: string;
  teamId?: string;
  expiresAt: Date;
  revoked: boolean;
}

// 🟢 WORKING: JWT Manager with comprehensive token handling
export class JWTManager {
  private readonly logger = Logger.getInstance().child({ component: 'JWTManager' });
  private readonly config: JWTConfig;
  private readonly redis: RedisConnectionManager;
  private keyPairs: Map<string, KeyPair> = new Map();
  private currentKeyId?: string;
  private keyRotationInterval?: NodeJS.Timeout;

  constructor(config: JWTConfig, redis: RedisConnectionManager) {
    this.config = config;
    this.redis = redis;
  }

  /**
   * Initialize JWT Manager with key loading/generation
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing JWT Manager', {
        algorithm: this.config.algorithm,
        issuer: this.config.issuer
      });

      if (this.config.algorithm === 'RS256') {
        await this.initializeRSAKeys();
        this.startKeyRotation();
      }

      this.logger.info('JWT Manager initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize JWT Manager', { error });
      throw error;
    }
  }

  /**
   * Create access and refresh tokens for a user
   */
  async createTokens(
    user: User,
    sessionId: string,
    deviceId: string,
    team?: Team,
    permissions?: ResolvedPermission[]
  ): Promise<AuthToken> {
    try {
      const now = Date.now();
      const accessTokenPayload: Partial<TokenPayload> = {
        sub: user.id,
        email: user.email,
        username: user.username,
        teamId: team?.id,
        role: team ? 'member' : undefined,
        permissions: permissions || [],
        sessionId,
        deviceId,
        type: 'access',
        iat: Math.floor(now / 1000),
        iss: this.config.issuer,
        aud: this.config.audience
      };

      const refreshTokenPayload: Partial<TokenPayload> = {
        sub: user.id,
        sessionId,
        deviceId,
        teamId: team?.id,
        type: 'refresh',
        iat: Math.floor(now / 1000),
        iss: this.config.issuer,
        aud: this.config.audience
      };

      // Create tokens
      const accessToken = await this.signToken(accessTokenPayload, this.config.expiresIn);
      const refreshToken = await this.signToken(refreshTokenPayload, this.config.refreshExpiresIn);

      // Store refresh token in Redis
      await this.storeRefreshToken(refreshToken, {
        userId: user.id,
        sessionId,
        deviceId,
        teamId: team?.id,
        expiresAt: new Date(now + this.parseExpiresIn(this.config.refreshExpiresIn)),
        revoked: false
      });

      // Parse expires in to seconds
      const expiresIn = this.parseExpiresIn(this.config.expiresIn) / 1000;

      this.logger.debug('Tokens created successfully', {
        userId: user.id,
        sessionId,
        teamId: team?.id,
        expiresIn
      });

      return {
        accessToken,
        refreshToken,
        expiresIn,
        tokenType: 'Bearer',
        scope: permissions?.map(p => `${p.resource}:${p.actions.join(',')}`).sort()
      };
    } catch (error) {
      this.logger.error('Failed to create tokens', { error, userId: user.id });
      throw error;
    }
  }

  /**
   * Verify and decode a JWT token
   */
  async verifyToken(token: string, type?: 'access' | 'refresh'): Promise<TokenPayload> {
    try {
      const options: VerifyOptions = {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: [this.config.algorithm]
      };

      let secretOrKey: string;
      if (this.config.algorithm === 'RS256') {
        // Try current key first, then all available keys
        const keyId = this.extractKeyId(token);
        const keyPair = keyId ? this.keyPairs.get(keyId) : this.getCurrentKeyPair();
        
        if (!keyPair) {
          throw new Error('No valid key found for token verification');
        }
        
        secretOrKey = keyPair.publicKey;
      } else {
        secretOrKey = this.config.secretOrPrivateKey;
      }

      const decoded = jwt.verify(token, secretOrKey, options) as TokenPayload;

      // Validate token type if specified
      if (type && decoded.type !== type) {
        throw new Error(`Invalid token type. Expected ${type}, got ${decoded.type}`);
      }

      // Check if refresh token is revoked
      if (decoded.type === 'refresh') {
        const isRevoked = await this.isRefreshTokenRevoked(token);
        if (isRevoked) {
          throw new Error('Refresh token has been revoked');
        }
      }

      this.logger.debug('Token verified successfully', {
        userId: decoded.sub,
        type: decoded.type,
        sessionId: decoded.sessionId
      });

      return decoded;
    } catch (error) {
      this.logger.warn('Token verification failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<AuthToken> {
    try {
      // Verify refresh token
      const decoded = await this.verifyToken(refreshToken, 'refresh');

      // Get refresh token data from Redis
      const refreshData = await this.getRefreshToken(refreshToken);
      if (!refreshData || refreshData.revoked) {
        throw new Error('Refresh token is invalid or revoked');
      }

      // Create new access token with same claims
      const now = Date.now();
      const accessTokenPayload: Partial<TokenPayload> = {
        sub: decoded.sub,
        email: decoded.email,
        username: decoded.username,
        teamId: decoded.teamId,
        role: decoded.role,
        permissions: decoded.permissions,
        sessionId: decoded.sessionId,
        deviceId: decoded.deviceId,
        type: 'access',
        iat: Math.floor(now / 1000),
        iss: this.config.issuer,
        aud: this.config.audience
      };

      const accessToken = await this.signToken(accessTokenPayload, this.config.expiresIn);
      const expiresIn = this.parseExpiresIn(this.config.expiresIn) / 1000;

      this.logger.debug('Access token refreshed successfully', {
        userId: decoded.sub,
        sessionId: decoded.sessionId
      });

      return {
        accessToken,
        refreshToken, // Return the same refresh token
        expiresIn,
        tokenType: 'Bearer',
        scope: decoded.permissions?.map(p => `${p.resource}:${p.actions.join(',')}`).sort()
      };
    } catch (error) {
      this.logger.error('Failed to refresh access token', { error });
      throw error;
    }
  }

  /**
   * Revoke a refresh token
   */
  async revokeRefreshToken(refreshToken: string): Promise<void> {
    try {
      const refreshData = await this.getRefreshToken(refreshToken);
      if (!refreshData) {
        this.logger.warn('Attempted to revoke non-existent refresh token');
        return;
      }

      await this.redis.executeCommand('hset', [
        `refresh_tokens:${this.hashToken(refreshToken)}`,
        'revoked',
        'true'
      ]);

      this.logger.debug('Refresh token revoked successfully', {
        userId: refreshData.userId,
        sessionId: refreshData.sessionId
      });
    } catch (error) {
      this.logger.error('Failed to revoke refresh token', { error });
      throw error;
    }
  }

  /**
   * Revoke all refresh tokens for a user
   */
  async revokeAllRefreshTokens(userId: string, exceptSessionId?: string): Promise<void> {
    try {
      const pattern = `refresh_tokens:user:${userId}:*`;
      const keys = await this.redis.executeCommand<string[]>('keys', [pattern]);

      const pipeline = [];
      for (const key of keys) {
        if (exceptSessionId) {
          const sessionId = key.split(':').pop();
          if (sessionId === exceptSessionId) continue;
        }
        pipeline.push(['hset', key, 'revoked', 'true']);
      }

      if (pipeline.length > 0) {
        await this.redis.executeCommand('multi');
        for (const command of pipeline) {
          await this.redis.executeCommand(command[0], command.slice(1));
        }
        await this.redis.executeCommand('exec');
      }

      this.logger.debug('All refresh tokens revoked for user', {
        userId,
        exceptSessionId,
        count: pipeline.length
      });
    } catch (error) {
      this.logger.error('Failed to revoke all refresh tokens', { error, userId });
      throw error;
    }
  }

  /**
   * Get token statistics
   */
  async getTokenStats(): Promise<{
    activeAccessTokens: number;
    activeRefreshTokens: number;
    revokedRefreshTokens: number;
    expiredTokens: number;
  }> {
    try {
      const [
        refreshTokenKeys,
        revokedCount
      ] = await Promise.all([
        this.redis.executeCommand<string[]>('keys', ['refresh_tokens:*']),
        this.redis.executeCommand<number>('eval', [
          `
          local keys = redis.call('keys', 'refresh_tokens:*')
          local revoked = 0
          for i = 1, #keys do
            local isRevoked = redis.call('hget', keys[i], 'revoked')
            if isRevoked == 'true' then
              revoked = revoked + 1
            end
          end
          return revoked
          `,
          0
        ])
      ]);

      return {
        activeAccessTokens: 0, // Access tokens are stateless
        activeRefreshTokens: refreshTokenKeys.length - (revokedCount || 0),
        revokedRefreshTokens: revokedCount || 0,
        expiredTokens: 0 // TODO: Implement expired token tracking
      };
    } catch (error) {
      this.logger.error('Failed to get token statistics', { error });
      return {
        activeAccessTokens: 0,
        activeRefreshTokens: 0,
        revokedRefreshTokens: 0,
        expiredTokens: 0
      };
    }
  }

  /**
   * Cleanup expired tokens
   */
  async cleanupExpiredTokens(): Promise<number> {
    try {
      const now = Date.now();
      let cleanedCount = 0;

      // Find all refresh tokens
      const refreshTokenKeys = await this.redis.executeCommand<string[]>('keys', ['refresh_tokens:*']);

      for (const key of refreshTokenKeys) {
        const expiresAtStr = await this.redis.executeCommand<string>('hget', [key, 'expiresAt']);
        if (expiresAtStr) {
          const expiresAt = parseInt(expiresAtStr, 10);
          if (expiresAt < now) {
            await this.redis.executeCommand('del', [key]);
            cleanedCount++;
          }
        }
      }

      this.logger.debug('Expired tokens cleaned up', { count: cleanedCount });
      return cleanedCount;
    } catch (error) {
      this.logger.error('Failed to cleanup expired tokens', { error });
      return 0;
    }
  }

  /**
   * Close JWT Manager and cleanup resources
   */
  async close(): Promise<void> {
    try {
      if (this.keyRotationInterval) {
        clearInterval(this.keyRotationInterval);
      }

      this.keyPairs.clear();
      this.logger.info('JWT Manager closed successfully');
    } catch (error) {
      this.logger.error('Error closing JWT Manager', { error });
    }
  }

  // 🟡 PARTIAL: Private helper methods
  private async signToken(payload: Partial<TokenPayload>, expiresIn: string): Promise<string> {
    const options: SignOptions = {
      expiresIn,
      algorithm: this.config.algorithm,
      issuer: this.config.issuer,
      audience: this.config.audience
    };

    if (this.config.algorithm === 'RS256') {
      const keyPair = this.getCurrentKeyPair();
      if (!keyPair) {
        throw new Error('No RSA key pair available for signing');
      }
      options.keyid = keyPair.kid;
      return jwt.sign(payload, keyPair.privateKey, options);
    } else {
      return jwt.sign(payload, this.config.secretOrPrivateKey, options);
    }
  }

  private async initializeRSAKeys(): Promise<void> {
    try {
      // Load existing keys or generate new ones
      if (this.config.publicKey && this.config.secretOrPrivateKey) {
        // Use provided keys
        const keyPair: KeyPair = {
          privateKey: this.config.secretOrPrivateKey,
          publicKey: this.config.publicKey,
          kid: crypto.createHash('sha256').update(this.config.publicKey).digest('hex').substring(0, 16),
          createdAt: new Date()
        };
        this.keyPairs.set(keyPair.kid, keyPair);
        this.currentKeyId = keyPair.kid;
      } else {
        // Generate new key pair
        await this.generateAndStoreKeyPair();
      }

      this.logger.info('RSA keys initialized', {
        keyCount: this.keyPairs.size,
        currentKeyId: this.currentKeyId
      });
    } catch (error) {
      this.logger.error('Failed to initialize RSA keys', { error });
      throw error;
    }
  }

  private async generateAndStoreKeyPair(): Promise<void> {
    const keyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    const kid = crypto.randomBytes(16).toString('hex');
    const newKeyPair: KeyPair = {
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
      kid,
      createdAt: new Date()
    };

    this.keyPairs.set(kid, newKeyPair);
    this.currentKeyId = kid;

    // Store key pair in Redis for distributed systems
    await this.redis.executeCommand('hset', [
      `jwt_keys:${kid}`,
      'privateKey',
      keyPair.privateKey,
      'publicKey',
      keyPair.publicKey,
      'createdAt',
      newKeyPair.createdAt.toISOString()
    ]);

    this.logger.info('New RSA key pair generated and stored', { kid });
  }

  private getCurrentKeyPair(): KeyPair | undefined {
    if (!this.currentKeyId) return undefined;
    return this.keyPairs.get(this.currentKeyId);
  }

  private extractKeyId(token: string): string | undefined {
    try {
      const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString());
      return header.kid;
    } catch {
      return undefined;
    }
  }

  private async storeRefreshToken(token: string, data: RefreshTokenData): Promise<void> {
    const key = `refresh_tokens:${this.hashToken(token)}`;
    const userKey = `refresh_tokens:user:${data.userId}:${data.sessionId}`;

    await Promise.all([
      this.redis.executeCommand('hmset', [
        key,
        'userId',
        data.userId,
        'sessionId',
        data.sessionId,
        'deviceId',
        data.deviceId,
        'teamId',
        data.teamId || '',
        'expiresAt',
        data.expiresAt.getTime().toString(),
        'revoked',
        data.revoked.toString()
      ]),
      this.redis.executeCommand('set', [userKey, key, 'EX', Math.floor((data.expiresAt.getTime() - Date.now()) / 1000)])
    ]);
  }

  private async getRefreshToken(token: string): Promise<RefreshTokenData | null> {
    try {
      const key = `refresh_tokens:${this.hashToken(token)}`;
      const data = await this.redis.executeCommand<Record<string, string>>('hgetall', [key]);

      if (!data || Object.keys(data).length === 0) {
        return null;
      }

      return {
        userId: data.userId,
        sessionId: data.sessionId,
        deviceId: data.deviceId,
        teamId: data.teamId || undefined,
        expiresAt: new Date(parseInt(data.expiresAt, 10)),
        revoked: data.revoked === 'true'
      };
    } catch {
      return null;
    }
  }

  private async isRefreshTokenRevoked(token: string): Promise<boolean> {
    try {
      const key = `refresh_tokens:${this.hashToken(token)}`;
      const revoked = await this.redis.executeCommand<string>('hget', [key, 'revoked']);
      return revoked === 'true';
    } catch {
      return true; // Assume revoked if we can't check
    }
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private parseExpiresIn(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid expiresIn format: ${expiresIn}`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: throw new Error(`Invalid time unit: ${unit}`);
    }
  }

  private startKeyRotation(): void {
    // Rotate keys every 30 days
    this.keyRotationInterval = setInterval(async () => {
      try {
        await this.rotateKeys();
      } catch (error) {
        this.logger.error('Key rotation failed', { error });
      }
    }, 30 * 24 * 60 * 60 * 1000);
  }

  private async rotateKeys(): Promise<void> {
    try {
      this.logger.info('Starting key rotation');

      // Generate new key pair
      await this.generateAndStoreKeyPair();

      // Keep old keys for verification for 7 days
      const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const keysToRemove: string[] = [];

      for (const [kid, keyPair] of this.keyPairs) {
        if (keyPair.createdAt < cutoffDate && kid !== this.currentKeyId) {
          keysToRemove.push(kid);
        }
      }

      // Remove old keys
      for (const kid of keysToRemove) {
        this.keyPairs.delete(kid);
        await this.redis.executeCommand('del', [`jwt_keys:${kid}`]);
      }

      this.logger.info('Key rotation completed', {
        newKeyId: this.currentKeyId,
        removedKeys: keysToRemove.length
      });
    } catch (error) {
      this.logger.error('Key rotation failed', { error });
      throw error;
    }
  }
}

// 🟢 WORKING: Utility functions for JWT operations
export class JWTUtils {
  /**
   * Extract user ID from token without full verification
   */
  static extractUserId(token: string): string | null {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      return payload.sub || null;
    } catch {
      return null;
    }
  }

  /**
   * Check if token is expired without full verification
   */
  static isTokenExpired(token: string): boolean {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      return !payload.exp || payload.exp < Math.floor(Date.now() / 1000);
    } catch {
      return true;
    }
  }

  /**
   * Get token expiration date
   */
  static getTokenExpiration(token: string): Date | null {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      return payload.exp ? new Date(payload.exp * 1000) : null;
    } catch {
      return null;
    }
  }

  /**
   * Get token type (access or refresh)
   */
  static getTokenType(token: string): 'access' | 'refresh' | null {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      return payload.type || null;
    } catch {
      return null;
    }
  }
}