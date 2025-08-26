/**
 * OAuth Manager for ForgeFlow v2
 * Multi-provider OAuth authentication with GitHub, Google, Microsoft, and custom OIDC support
 */

import crypto from 'crypto';
import { URLSearchParams } from 'url';
import fetch from 'node-fetch';
import { Logger } from '../utils/enhanced-logger';
import { RedisConnectionManager } from '../infrastructure/redis/redis-connection-manager';
import {
  OAuthConfig,
  OAuthProvider,
  OAuthState,
  OAuthProfile,
  ExternalAccount,
  AuthenticationError
} from './types';

export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string; // For OIDC
}

export interface GitHubProfile {
  id: number;
  login: string;
  name: string;
  email: string;
  avatar_url: string;
  verified: boolean;
  company?: string;
  location?: string;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
  locale: string;
}

export interface MicrosoftProfile {
  id: string;
  userPrincipalName: string;
  displayName: string;
  givenName: string;
  surname: string;
  mail: string;
  mobilePhone?: string;
  officeLocation?: string;
}

// 🟢 WORKING: OAuth Manager with multi-provider support
export class OAuthManager {
  private readonly logger = Logger.getInstance().child({ component: 'OAuthManager' });
  private readonly config: OAuthConfig;
  private readonly redis: RedisConnectionManager;
  private readonly providers: Map<string, OAuthProvider> = new Map();

  constructor(config: OAuthConfig, redis: RedisConnectionManager) {
    this.config = config;
    this.redis = redis;
    this.initializeProviders();
  }

  /**
   * Initialize OAuth providers
   */
  private initializeProviders(): void {
    this.config.providers.forEach(provider => {
      if (provider.enabled) {
        this.providers.set(provider.name, provider);
      }
    });

    this.logger.info('OAuth providers initialized', {
      providers: Array.from(this.providers.keys())
    });
  }

  /**
   * Generate OAuth authorization URL
   */
  async getAuthorizationUrl(
    providerName: string,
    redirectUrl?: string,
    teamId?: string,
    inviteToken?: string
  ): Promise<{ url: string; state: string }> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new AuthenticationError(
        `OAuth provider ${providerName} not found`,
        'PROVIDER_NOT_FOUND',
        400
      );
    }

    // Generate secure state parameter
    const state = crypto.randomBytes(32).toString('hex');
    const stateData: OAuthState = {
      state,
      provider: providerName,
      redirectUrl: redirectUrl || this.config.redirectUrl,
      teamId,
      inviteToken,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
    };

    // Store state in Redis
    await this.redis.executeCommand('setex', [
      `oauth_state:${state}`,
      600, // 10 minutes
      JSON.stringify(stateData)
    ]);

    const authUrl = this.buildAuthorizationUrl(provider, state);

    this.logger.debug('OAuth authorization URL generated', {
      provider: providerName,
      state,
      teamId,
      hasInviteToken: !!inviteToken
    });

    return { url: authUrl, state };
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  async handleCallback(
    providerName: string,
    code: string,
    state: string
  ): Promise<{
    profile: OAuthProfile;
    tokens: OAuthTokenResponse;
    stateData: OAuthState;
  }> {
    try {
      // Verify state parameter
      const stateData = await this.verifyState(state);
      if (stateData.provider !== providerName) {
        throw new AuthenticationError(
          'State provider mismatch',
          'INVALID_STATE',
          400
        );
      }

      const provider = this.providers.get(providerName);
      if (!provider) {
        throw new AuthenticationError(
          `OAuth provider ${providerName} not found`,
          'PROVIDER_NOT_FOUND',
          400
        );
      }

      // Exchange code for tokens
      const tokens = await this.exchangeCodeForTokens(provider, code);
      
      // Get user profile
      const profile = await this.getUserProfile(provider, tokens);

      // Clean up state
      await this.redis.executeCommand('del', [`oauth_state:${state}`]);

      this.logger.debug('OAuth callback handled successfully', {
        provider: providerName,
        userId: profile.providerId,
        email: profile.email
      });

      return { profile, tokens, stateData };
    } catch (error) {
      this.logger.error('OAuth callback failed', { error, provider: providerName });
      throw error;
    }
  }

  /**
   * Refresh OAuth tokens
   */
  async refreshTokens(
    providerName: string,
    refreshToken: string
  ): Promise<OAuthTokenResponse> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new AuthenticationError(
        `OAuth provider ${providerName} not found`,
        'PROVIDER_NOT_FOUND',
        400
      );
    }

    const tokenUrl = this.getTokenUrl(provider);
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: provider.clientId,
      client_secret: provider.clientSecret
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'ForgeFlow-v2-OAuth'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new AuthenticationError(
        `Token refresh failed: ${errorText}`,
        'TOKEN_REFRESH_FAILED',
        response.status
      );
    }

    const tokens = await response.json() as OAuthTokenResponse;

    this.logger.debug('OAuth tokens refreshed successfully', {
      provider: providerName,
      hasRefreshToken: !!tokens.refresh_token
    });

    return tokens;
  }

  /**
   * Revoke OAuth tokens
   */
  async revokeTokens(
    providerName: string,
    accessToken: string,
    refreshToken?: string
  ): Promise<void> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      return; // Silently fail for non-existent providers
    }

    try {
      const revokeUrl = this.getRevokeUrl(provider);
      if (!revokeUrl) {
        this.logger.warn('No revoke URL available for provider', { provider: providerName });
        return;
      }

      // Revoke access token
      await this.revokeToken(revokeUrl, accessToken, provider);

      // Revoke refresh token if available
      if (refreshToken) {
        await this.revokeToken(revokeUrl, refreshToken, provider);
      }

      this.logger.debug('OAuth tokens revoked successfully', {
        provider: providerName,
        revokedRefreshToken: !!refreshToken
      });
    } catch (error) {
      this.logger.warn('Token revocation failed', { error, provider: providerName });
      // Don't throw - revocation failures shouldn't break logout
    }
  }

  /**
   * Validate provider configuration
   */
  validateProviderConfig(providerName: string): boolean {
    const provider = this.providers.get(providerName);
    if (!provider) return false;

    return !!(
      provider.clientId &&
      provider.clientSecret &&
      provider.enabled
    );
  }

  /**
   * Get list of enabled providers
   */
  getEnabledProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  // 🟡 PARTIAL: Private helper methods
  private buildAuthorizationUrl(provider: OAuthProvider, state: string): string {
    const baseUrl = this.getAuthUrl(provider);
    const params = new URLSearchParams({
      client_id: provider.clientId,
      response_type: 'code',
      state,
      scope: provider.scope.join(' '),
      redirect_uri: this.config.redirectUrl
    });

    // Add provider-specific parameters
    if (provider.name === 'microsoft') {
      params.set('response_mode', 'query');
    }

    return `${baseUrl}?${params.toString()}`;
  }

  private async verifyState(state: string): Promise<OAuthState> {
    const stateDataStr = await this.redis.executeCommand<string>('get', [`oauth_state:${state}`]);
    if (!stateDataStr) {
      throw new AuthenticationError(
        'Invalid or expired OAuth state',
        'INVALID_STATE',
        400
      );
    }

    const stateData = JSON.parse(stateDataStr) as OAuthState;
    if (new Date() > new Date(stateData.expiresAt)) {
      await this.redis.executeCommand('del', [`oauth_state:${state}`]);
      throw new AuthenticationError(
        'OAuth state has expired',
        'EXPIRED_STATE',
        400
      );
    }

    return stateData;
  }

  private async exchangeCodeForTokens(
    provider: OAuthProvider,
    code: string
  ): Promise<OAuthTokenResponse> {
    const tokenUrl = this.getTokenUrl(provider);
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      redirect_uri: this.config.redirectUrl
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'ForgeFlow-v2-OAuth'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new AuthenticationError(
        `Token exchange failed: ${errorText}`,
        'TOKEN_EXCHANGE_FAILED',
        response.status
      );
    }

    return await response.json() as OAuthTokenResponse;
  }

  private async getUserProfile(
    provider: OAuthProvider,
    tokens: OAuthTokenResponse
  ): Promise<OAuthProfile> {
    switch (provider.name) {
      case 'github':
        return await this.getGitHubProfile(tokens.access_token);
      case 'google':
        return await this.getGoogleProfile(tokens.access_token, tokens.id_token);
      case 'microsoft':
        return await this.getMicrosoftProfile(tokens.access_token);
      case 'custom':
        return await this.getCustomProfile(provider, tokens.access_token);
      default:
        throw new AuthenticationError(
          `Unsupported OAuth provider: ${provider.name}`,
          'UNSUPPORTED_PROVIDER',
          400
        );
    }
  }

  private async getGitHubProfile(accessToken: string): Promise<OAuthProfile> {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ForgeFlow-v2-OAuth'
      }
    });

    if (!response.ok) {
      throw new AuthenticationError(
        'Failed to fetch GitHub profile',
        'PROFILE_FETCH_FAILED',
        response.status
      );
    }

    const profile = await response.json() as GitHubProfile;
    
    return {
      provider: 'github',
      providerId: profile.id.toString(),
      email: profile.email,
      username: profile.login,
      displayName: profile.name || profile.login,
      avatar: profile.avatar_url,
      verified: profile.verified,
      metadata: {
        company: profile.company,
        location: profile.location,
        originalProfile: profile
      }
    };
  }

  private async getGoogleProfile(accessToken: string, idToken?: string): Promise<OAuthProfile> {
    // Use ID token if available (more reliable)
    if (idToken) {
      const profile = this.decodeIdToken(idToken) as GoogleProfile;
      return {
        provider: 'google',
        providerId: profile.sub,
        email: profile.email,
        username: profile.email.split('@')[0],
        displayName: profile.name,
        avatar: profile.picture,
        verified: profile.email_verified,
        metadata: {
          givenName: profile.given_name,
          familyName: profile.family_name,
          locale: profile.locale,
          originalProfile: profile
        }
      };
    }

    // Fallback to userinfo endpoint
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new AuthenticationError(
        'Failed to fetch Google profile',
        'PROFILE_FETCH_FAILED',
        response.status
      );
    }

    const profile = await response.json() as GoogleProfile;
    
    return {
      provider: 'google',
      providerId: profile.sub,
      email: profile.email,
      username: profile.email.split('@')[0],
      displayName: profile.name,
      avatar: profile.picture,
      verified: profile.email_verified,
      metadata: {
        givenName: profile.given_name,
        familyName: profile.family_name,
        locale: profile.locale,
        originalProfile: profile
      }
    };
  }

  private async getMicrosoftProfile(accessToken: string): Promise<OAuthProfile> {
    const response = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new AuthenticationError(
        'Failed to fetch Microsoft profile',
        'PROFILE_FETCH_FAILED',
        response.status
      );
    }

    const profile = await response.json() as MicrosoftProfile;
    
    return {
      provider: 'microsoft',
      providerId: profile.id,
      email: profile.mail || profile.userPrincipalName,
      username: profile.userPrincipalName.split('@')[0],
      displayName: profile.displayName,
      verified: true, // Microsoft accounts are verified
      metadata: {
        givenName: profile.givenName,
        surname: profile.surname,
        officeLocation: profile.officeLocation,
        originalProfile: profile
      }
    };
  }

  private async getCustomProfile(
    provider: OAuthProvider,
    accessToken: string
  ): Promise<OAuthProfile> {
    if (!provider.userInfoUrl) {
      throw new AuthenticationError(
        'Custom provider missing userInfoUrl',
        'INVALID_PROVIDER_CONFIG',
        500
      );
    }

    const response = await fetch(provider.userInfoUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new AuthenticationError(
        'Failed to fetch custom provider profile',
        'PROFILE_FETCH_FAILED',
        response.status
      );
    }

    const profile = await response.json() as any;
    
    return {
      provider: 'custom',
      providerId: profile.sub || profile.id || profile.user_id,
      email: profile.email,
      username: profile.preferred_username || profile.username || profile.email?.split('@')[0],
      displayName: profile.name || profile.display_name || profile.username,
      avatar: profile.picture || profile.avatar_url,
      verified: profile.email_verified !== false,
      metadata: {
        originalProfile: profile
      }
    };
  }

  private decodeIdToken(idToken: string): any {
    try {
      const payload = idToken.split('.')[1];
      return JSON.parse(Buffer.from(payload, 'base64').toString());
    } catch (error) {
      throw new AuthenticationError(
        'Invalid ID token format',
        'INVALID_ID_TOKEN',
        400
      );
    }
  }

  private async revokeToken(
    revokeUrl: string,
    token: string,
    provider: OAuthProvider
  ): Promise<void> {
    const params = new URLSearchParams({
      token,
      client_id: provider.clientId,
      client_secret: provider.clientSecret
    });

    await fetch(revokeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    });
  }

  private getAuthUrl(provider: OAuthProvider): string {
    if (provider.authUrl) return provider.authUrl;

    switch (provider.name) {
      case 'github':
        return 'https://github.com/login/oauth/authorize';
      case 'google':
        return 'https://accounts.google.com/o/oauth2/v2/auth';
      case 'microsoft':
        return 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
      default:
        throw new AuthenticationError(
          `No auth URL configured for provider ${provider.name}`,
          'MISSING_AUTH_URL',
          500
        );
    }
  }

  private getTokenUrl(provider: OAuthProvider): string {
    if (provider.tokenUrl) return provider.tokenUrl;

    switch (provider.name) {
      case 'github':
        return 'https://github.com/login/oauth/access_token';
      case 'google':
        return 'https://oauth2.googleapis.com/token';
      case 'microsoft':
        return 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
      default:
        throw new AuthenticationError(
          `No token URL configured for provider ${provider.name}`,
          'MISSING_TOKEN_URL',
          500
        );
    }
  }

  private getRevokeUrl(provider: OAuthProvider): string | null {
    switch (provider.name) {
      case 'github':
        return null; // GitHub doesn't support token revocation via API
      case 'google':
        return 'https://oauth2.googleapis.com/revoke';
      case 'microsoft':
        return null; // Microsoft uses different revocation mechanism
      default:
        return null;
    }
  }
}