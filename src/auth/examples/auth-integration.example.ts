/**
 * Authentication Integration Example
 * Demonstrates how to integrate the ForgeFlow v2 authentication system
 */

import express from 'express';
import { createAuthModule, getDefaultAuthConfig, validateAuthConfig } from '../index';
import { RedisConnectionManager } from '../../infrastructure/redis/redis-connection-manager';

// 🟢 WORKING: Complete authentication integration example
async function createAuthenticatedApp() {
  const app = express();

  // Middleware setup
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  try {
    // 1. Initialize Redis connection
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: 0
    };

    const redis = new RedisConnectionManager(redisConfig);
    await redis.initialize();

    // 2. Create authentication configuration
    const authConfig = getDefaultAuthConfig();
    
    // Validate configuration
    validateAuthConfig(authConfig);

    // 3. Create authentication module
    const authModule = await createAuthModule(redis, {
      auth: authConfig,
      security: {
        csrf: {
          enabled: true,
          cookieName: '__Secure-ff2-csrf',
          headerName: 'x-csrf-token',
          secret: process.env.CSRF_SECRET || 'fallback-secret'
        }
      }
    });

    // 4. Apply security middleware
    app.use(authModule.securityMiddleware.applySecurityHeaders());

    // 5. Authentication routes
    
    // User registration
    app.post('/auth/register', 
      authModule.securityMiddleware.rateLimit('auth'),
      authModule.securityMiddleware.detectSuspiciousActivity(),
      async (req, res) => {
        try {
          const result = await authModule.authService.register(req.body);
          res.json({
            success: true,
            user: result.user,
            tokens: result.tokens,
            requiresTwoFactor: result.requiresTwoFactor
          });
        } catch (error) {
          res.status(400).json({
            success: false,
            error: error.message,
            code: error.code || 'REGISTRATION_FAILED'
          });
        }
      }
    );

    // User login
    app.post('/auth/login',
      authModule.securityMiddleware.rateLimit('auth'),
      authModule.securityMiddleware.detectSuspiciousActivity(),
      async (req, res) => {
        try {
          const result = await authModule.authService.login(req.body);
          
          if (result.requiresTwoFactor) {
            res.json({
              success: true,
              requiresTwoFactor: true,
              sessionId: result.session.id,
              twoFactorMethods: result.twoFactorMethods
            });
          } else {
            res.json({
              success: true,
              user: result.user,
              team: result.team,
              tokens: result.tokens
            });
          }
        } catch (error) {
          res.status(401).json({
            success: false,
            error: error.message,
            code: error.code || 'LOGIN_FAILED'
          });
        }
      }
    );

    // Two-factor authentication verification
    app.post('/auth/verify-2fa',
      authModule.securityMiddleware.rateLimit('two_factor'),
      async (req, res) => {
        try {
          const result = await authModule.authService.verifyTwoFactor(req.body);
          res.json({
            success: true,
            user: result.user,
            team: result.team,
            tokens: result.tokens
          });
        } catch (error) {
          res.status(401).json({
            success: false,
            error: error.message,
            code: error.code || 'TWO_FACTOR_VERIFICATION_FAILED'
          });
        }
      }
    );

    // Setup 2FA
    app.post('/auth/setup-2fa',
      authModule.securityMiddleware.authenticate(true),
      async (req, res) => {
        try {
          const result = await authModule.authService.setupTwoFactor(req.user!.id);
          res.json({
            success: true,
            secret: result.secret,
            qrCode: result.qrCode,
            backupCodes: result.backupCodes
          });
        } catch (error) {
          res.status(400).json({
            success: false,
            error: error.message,
            code: error.code || 'TWO_FACTOR_SETUP_FAILED'
          });
        }
      }
    );

    // OAuth authentication routes
    app.get('/auth/oauth/:provider',
      authModule.securityMiddleware.rateLimit('auth'),
      async (req, res) => {
        try {
          const { provider } = req.params;
          const { teamId, inviteToken } = req.query;

          const { url } = await authModule.oauthManager.getAuthorizationUrl(
            provider,
            undefined, // Use default redirect URL
            teamId as string,
            inviteToken as string
          );

          res.redirect(url);
        } catch (error) {
          res.status(400).json({
            success: false,
            error: error.message,
            code: 'OAUTH_INIT_FAILED'
          });
        }
      }
    );

    app.get('/auth/oauth/callback/:provider',
      authModule.securityMiddleware.rateLimit('auth'),
      async (req, res) => {
        try {
          const { provider } = req.params;
          const { code, state } = req.query;

          const { profile, stateData } = await authModule.oauthManager.handleCallback(
            provider,
            code as string,
            state as string
          );

          // Here you would integrate with your user system
          // For example, find or create user based on OAuth profile
          
          res.json({
            success: true,
            profile,
            message: 'OAuth authentication successful'
          });
        } catch (error) {
          res.status(400).json({
            success: false,
            error: error.message,
            code: 'OAUTH_CALLBACK_FAILED'
          });
        }
      }
    );

    // Logout
    app.post('/auth/logout',
      authModule.securityMiddleware.authenticate(false),
      async (req, res) => {
        try {
          if (req.session?.id) {
            await authModule.authService.logout(req.session.id);
          }
          res.json({
            success: true,
            message: 'Logged out successfully'
          });
        } catch (error) {
          res.status(400).json({
            success: false,
            error: error.message,
            code: 'LOGOUT_FAILED'
          });
        }
      }
    );

    // 6. Protected API routes
    
    // Get user profile (requires authentication)
    app.get('/api/profile',
      authModule.securityMiddleware.authenticate(true),
      authModule.securityMiddleware.rateLimit('api'),
      async (req, res) => {
        res.json({
          success: true,
          user: req.user,
          permissions: req.permissions,
          session: {
            id: req.session?.id,
            deviceInfo: req.session?.deviceInfo,
            expiresAt: req.session?.expiresAt
          }
        });
      }
    );

    // Team management (requires authentication + team permissions)
    app.post('/api/teams',
      authModule.securityMiddleware.authenticate(true),
      authModule.securityMiddleware.rateLimit('api'),
      authModule.securityMiddleware.csrfProtection(),
      async (req, res) => {
        try {
          const team = await authModule.teamService.createTeam(
            req.user!.id,
            req.body.name,
            req.body.plan
          );
          
          res.json({
            success: true,
            team
          });
        } catch (error) {
          res.status(400).json({
            success: false,
            error: error.message,
            code: error.code || 'TEAM_CREATION_FAILED'
          });
        }
      }
    );

    // Team invitations
    app.post('/api/teams/:teamId/invitations',
      authModule.securityMiddleware.authenticate(true),
      authModule.securityMiddleware.rateLimit('invitations'),
      authModule.securityMiddleware.csrfProtection(),
      async (req, res) => {
        try {
          const { teamId } = req.params;
          
          // Check if user has permission to invite members
          const hasPermission = await authModule.teamService.hasPermission(
            req.user!.id,
            teamId,
            'team',
            'invite'
          );

          if (!hasPermission) {
            return res.status(403).json({
              success: false,
              error: 'Insufficient permissions to invite team members',
              code: 'INSUFFICIENT_PERMISSIONS'
            });
          }

          const invitation = await authModule.teamService.inviteMember(
            teamId,
            req.user!.id,
            req.body
          );

          res.json({
            success: true,
            invitation: invitation.invitation,
            inviteUrl: invitation.inviteUrl
          });
        } catch (error) {
          res.status(400).json({
            success: false,
            error: error.message,
            code: error.code || 'INVITATION_FAILED'
          });
        }
      }
    );

    // Sensitive operations (requires 2FA)
    app.delete('/api/teams/:teamId',
      authModule.securityMiddleware.authenticate(true),
      authModule.securityMiddleware.requireTwoFactor(),
      authModule.securityMiddleware.rateLimit('api'),
      authModule.securityMiddleware.csrfProtection(),
      async (req, res) => {
        try {
          const { teamId } = req.params;
          
          // Check if user is team owner
          const hasPermission = await authModule.teamService.hasPermission(
            req.user!.id,
            teamId,
            'team',
            'delete'
          );

          if (!hasPermission) {
            return res.status(403).json({
              success: false,
              error: 'Only team owners can delete teams',
              code: 'INSUFFICIENT_PERMISSIONS'
            });
          }

          await authModule.teamService.deleteTeam(teamId);

          res.json({
            success: true,
            message: 'Team deleted successfully'
          });
        } catch (error) {
          res.status(400).json({
            success: false,
            error: error.message,
            code: error.code || 'TEAM_DELETION_FAILED'
          });
        }
      }
    );

    // 7. Health check endpoint
    app.get('/health',
      async (req, res) => {
        try {
          const { healthCheck } = await import('../index');
          const health = await healthCheck(authModule);
          
          res.status(health.status === 'healthy' ? 200 : 503).json({
            status: health.status,
            checks: health.checks,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          res.status(503).json({
            status: 'unhealthy',
            error: 'Health check failed',
            timestamp: new Date().toISOString()
          });
        }
      }
    );

    // 8. Error handling middleware
    app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('Unhandled error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    });

    return app;
  } catch (error) {
    console.error('Failed to create authenticated app:', error);
    throw error;
  }
}

// 🟢 WORKING: Usage example
export async function startAuthenticatedServer() {
  try {
    const app = await createAuthenticatedApp();
    const port = process.env.PORT || 3000;
    
    const server = app.listen(port, () => {
      console.log(`🚀 ForgeFlow v2 Authentication Server running on port ${port}`);
      console.log(`📚 API Documentation: http://localhost:${port}/api-docs`);
      console.log(`🏥 Health Check: http://localhost:${port}/health`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down gracefully...');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

    return server;
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// 🟢 WORKING: Client-side usage example
export const clientExamples = {
  // Login with email/password
  async login(email: string, password: string) {
    const response = await fetch('/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password,
        deviceInfo: {
          type: 'web',
          name: navigator.userAgent,
          os: navigator.platform,
          browser: 'Web Browser'
        }
      })
    });

    return response.json();
  },

  // Handle 2FA verification
  async verifyTwoFactor(sessionId: string, code: string, method: 'totp' | 'backup' = 'totp') {
    const response = await fetch('/auth/verify-2fa', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId,
        code,
        method,
        rememberDevice: true
      })
    });

    return response.json();
  },

  // Setup 2FA
  async setupTwoFactor(accessToken: string) {
    const response = await fetch('/auth/setup-2fa', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    return response.json();
  },

  // OAuth login
  initiateOAuthLogin(provider: 'github' | 'google' | 'microsoft', teamId?: string) {
    const params = new URLSearchParams();
    if (teamId) params.set('teamId', teamId);
    
    window.location.href = `/auth/oauth/${provider}?${params.toString()}`;
  },

  // API call with authentication
  async makeAuthenticatedRequest(endpoint: string, options: RequestInit = {}) {
    const token = localStorage.getItem('accessToken');
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
    
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
      ...options.headers
    };

    const response = await fetch(endpoint, {
      ...options,
      headers
    });

    if (response.status === 401) {
      // Token expired, try to refresh
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        const refreshResponse = await fetch('/auth/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ refreshToken })
        });

        if (refreshResponse.ok) {
          const { tokens } = await refreshResponse.json();
          localStorage.setItem('accessToken', tokens.accessToken);
          
          // Retry original request
          return fetch(endpoint, {
            ...options,
            headers: {
              ...headers,
              'Authorization': `Bearer ${tokens.accessToken}`
            }
          });
        }
      }
      
      // Redirect to login
      window.location.href = '/login';
      return response;
    }

    return response;
  }
};

// Environment variables needed:
export const requiredEnvVars = {
  // Database
  REDIS_HOST: 'Redis server host',
  REDIS_PORT: 'Redis server port',
  REDIS_PASSWORD: 'Redis password (optional)',
  
  // JWT
  JWT_SECRET: 'Secret key for HS256 or private key for RS256',
  JWT_PUBLIC_KEY: 'Public key for RS256 (optional)',
  JWT_ALGORITHM: 'JWT algorithm (HS256 or RS256)',
  
  // Session
  SESSION_SECRET: 'Session encryption secret',
  SESSION_TTL: 'Session timeout in seconds',
  
  // OAuth (optional)
  GITHUB_CLIENT_ID: 'GitHub OAuth client ID',
  GITHUB_CLIENT_SECRET: 'GitHub OAuth client secret',
  GOOGLE_CLIENT_ID: 'Google OAuth client ID',
  GOOGLE_CLIENT_SECRET: 'Google OAuth client secret',
  MICROSOFT_CLIENT_ID: 'Microsoft OAuth client ID',
  MICROSOFT_CLIENT_SECRET: 'Microsoft OAuth client secret',
  
  // Security
  CSRF_SECRET: 'CSRF token secret',
  BCRYPT_ROUNDS: 'Password hashing rounds (default: 12)',
  
  // Application
  APP_URL: 'Application base URL',
  PORT: 'Server port (default: 3000)'
};

export default { createAuthenticatedApp, startAuthenticatedServer, clientExamples, requiredEnvVars };