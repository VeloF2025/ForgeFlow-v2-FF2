# ForgeFlow v2 Authentication System

A comprehensive, production-ready authentication and authorization system for ForgeFlow v2 with enterprise-grade security features.

## 🎯 Overview

The ForgeFlow v2 authentication system provides:

- **Multi-provider authentication** (local, OAuth, OIDC)
- **JWT-based tokens** with RS256/HS256 support
- **Role-based access control (RBAC)** with fine-grained permissions
- **Two-factor authentication (2FA)** with TOTP and backup codes
- **Redis-backed session management** with multi-device support
- **Security middleware** with rate limiting and threat detection
- **Team management** with invitations and member onboarding

## 🔧 Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Auth Service  │────│  JWT Manager    │────│  Redis Backend  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ├─ Session Manager ─────┤                       │
         ├─ OAuth Manager   ─────┼───────────────────────┤
         ├─ 2FA Manager     ─────┤                       │
         ├─ RBAC Manager    ─────┼───────────────────────┤
         └─ Team Service    ─────┘                       │
                                                         │
┌─────────────────┐    ┌─────────────────┐              │
│Security Middleware────│ Rate Limiter   │──────────────┘
└─────────────────┘    └─────────────────┘
```

## 🚀 Quick Start

### 1. Installation

```bash
npm install jsonwebtoken bcryptjs speakeasy qrcode rate-limiter-flexible helmet
npm install @types/jsonwebtoken @types/bcryptjs @types/speakeasy @types/qrcode
```

### 2. Environment Configuration

```env
# Database
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key
JWT_ALGORITHM=HS256
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Session Configuration
SESSION_SECRET=your-session-secret
SESSION_TTL=86400
MAX_SESSIONS=10

# OAuth Providers (optional)
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Security
CSRF_SECRET=your-csrf-secret
BCRYPT_ROUNDS=12
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION=900

# Application
APP_URL=http://localhost:3000
PORT=3000
```

### 3. Basic Integration

```typescript
import { createAuthModule, getDefaultAuthConfig } from '@forgeflow/auth';
import { RedisConnectionManager } from '@forgeflow/redis';

async function setupAuth() {
  // Initialize Redis
  const redis = new RedisConnectionManager({
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379')
  });
  await redis.initialize();

  // Create auth configuration
  const authConfig = getDefaultAuthConfig();

  // Create auth module
  const authModule = await createAuthModule(redis, {
    auth: authConfig
  });

  return authModule;
}
```

## 📚 API Documentation

### Authentication Endpoints

#### POST `/auth/register`
Register a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "username": "username",
  "password": "SecurePass123!",
  "displayName": "User Name",
  "deviceInfo": {
    "type": "web",
    "name": "Chrome Browser",
    "os": "Windows",
    "browser": "Chrome"
  },
  "inviteToken": "optional-team-invite-token"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "username": "username",
    "displayName": "User Name",
    "emailVerified": false
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 3600,
    "tokenType": "Bearer"
  },
  "team": {
    "id": "team-123",
    "name": "Team Name",
    "role": "developer"
  }
}
```

#### POST `/auth/login`
Authenticate user with email and password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "deviceInfo": {
    "type": "web",
    "name": "Chrome Browser"
  },
  "rememberMe": true,
  "teamId": "team-123"
}
```

**Response (successful):**
```json
{
  "success": true,
  "user": { /* user object */ },
  "tokens": { /* JWT tokens */ },
  "requiresTwoFactor": false
}
```

**Response (2FA required):**
```json
{
  "success": true,
  "requiresTwoFactor": true,
  "sessionId": "session-123",
  "twoFactorMethods": [
    { "type": "totp", "enabled": true },
    { "type": "backup", "enabled": true }
  ]
}
```

#### POST `/auth/verify-2fa`
Complete two-factor authentication.

**Request:**
```json
{
  "sessionId": "session-123",
  "code": "123456",
  "method": "totp",
  "rememberDevice": true
}
```

#### POST `/auth/setup-2fa`
Setup two-factor authentication for user.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response:**
```json
{
  "success": true,
  "secret": "JBSWY3DPEHPK3PXP",
  "qrCode": "data:image/png;base64,...",
  "backupCodes": ["12345678", "87654321", ...]
}
```

#### GET `/auth/oauth/:provider`
Initiate OAuth authentication flow.

**Parameters:**
- `provider`: `github`, `google`, `microsoft`
- `teamId` (optional): Team to join after authentication
- `inviteToken` (optional): Team invitation token

### Team Management

#### POST `/api/teams`
Create a new team.

**Headers:**
```
Authorization: Bearer <access-token>
X-CSRF-Token: <csrf-token>
```

**Request:**
```json
{
  "name": "My Team",
  "plan": "pro"
}
```

#### POST `/api/teams/:teamId/invitations`
Invite member to team.

**Request:**
```json
{
  "email": "newmember@example.com",
  "role": "developer",
  "message": "Join our awesome team!"
}
```

**Response:**
```json
{
  "success": true,
  "invitation": {
    "id": "inv-123",
    "email": "newmember@example.com",
    "role": "developer",
    "status": "pending",
    "expiresAt": "2024-01-15T10:30:00Z"
  },
  "inviteUrl": "https://app.forgeflow.com/invite/abc123"
}
```

## 🛡️ Security Features

### Rate Limiting

The system includes multiple rate limiters:

- **Authentication endpoints**: 5 attempts per 15 minutes
- **API endpoints**: 100 requests per minute
- **Password reset**: 3 attempts per hour
- **2FA verification**: 10 attempts per 5 minutes
- **Team invitations**: 10 invitations per hour

### Security Headers

Automatically applied security headers:
- Content Security Policy (CSP)
- HTTP Strict Transport Security (HSTS)
- X-Frame-Options
- X-Content-Type-Options
- Referrer-Policy

### Threat Detection

Automatic detection and blocking of:
- SQL injection attempts
- Cross-site scripting (XSS)
- Path traversal attacks
- Command injection
- Rapid request patterns

## 👥 RBAC System

### Default Roles

| Role | Permissions | Description |
|------|-------------|-------------|
| `owner` | Full access | Complete control over team and resources |
| `admin` | Management + all developer permissions | User management and configuration |
| `developer` | Create/update own projects | Development and execution rights |
| `viewer` | Read-only access | View team resources |
| `guest` | Public resources only | Limited external access |

### Permission Structure

```typescript
interface Permission {
  resource: ResourceType; // 'project', 'team', 'agent', etc.
  actions: PermissionAction[]; // 'create', 'read', 'update', 'delete', 'execute'
  conditions?: PermissionCondition[]; // Optional constraints
}
```

### Custom Permissions

```typescript
// Add custom permission to role
await rbacManager.addCustomPermission('developer', {
  resource: 'project',
  actions: ['deploy'],
  conditions: [{
    field: 'environment',
    operator: 'equals',
    value: 'staging'
  }]
});
```

## 🔐 Two-Factor Authentication

### TOTP Setup

```typescript
// Setup 2FA for user
const setup = await authService.setupTwoFactor(userId);

// User scans QR code with authenticator app
console.log(setup.qrCode); // Data URL for QR code
console.log(setup.backupCodes); // Emergency backup codes
```

### Verification

```typescript
// Verify TOTP code
await authService.verifyTwoFactor({
  sessionId: 'session-123',
  code: '123456',
  method: 'totp',
  rememberDevice: true
});

// Verify backup code
await authService.verifyTwoFactor({
  sessionId: 'session-123',
  code: '12345678',
  method: 'backup'
});
```

### Device Trust

```typescript
// Trust device for 30 days
await twoFactorManager.trustDevice(
  userId,
  deviceId,
  'Chrome on Windows',
  deviceInfo,
  ipAddress,
  30 // days
);

// Check if device is trusted
const isTrusted = await twoFactorManager.isDeviceTrusted(userId, deviceId);
```

## 🏢 Team Management

### Creating Teams

```typescript
const team = await teamService.createTeam(
  userId,
  'My Development Team',
  'pro' // plan
);
```

### Member Invitations

```typescript
// Send invitation
const invitation = await teamService.inviteMember(
  teamId,
  invitedBy,
  {
    email: 'newmember@example.com',
    role: 'developer',
    message: 'Welcome to the team!',
    expiresIn: 7 * 24 * 60 * 60 // 7 days
  }
);

// Accept invitation
const member = await teamService.acceptInvitation(
  invitationToken,
  userId
);
```

### Permission Checking

```typescript
// Check if user has permission
const hasPermission = await teamService.hasPermission(
  userId,
  teamId,
  'project',
  'create'
);

// Get all user permissions
const permissions = await teamService.getUserPermissions(userId, teamId);
```

## 📊 Monitoring & Health

### Health Check

```typescript
import { healthCheck } from '@forgeflow/auth';

const health = await healthCheck(authModule);
console.log(health.status); // 'healthy' | 'unhealthy'
console.log(health.checks); // Component-specific checks
```

### Metrics

```typescript
// JWT token statistics
const tokenStats = await jwtManager.getTokenStats();
console.log(tokenStats.activeRefreshTokens);

// Session statistics
const sessionStats = await sessionManager.getSessionStats();
console.log(sessionStats.activeSessions);

// Security events
const securityEvents = await auditService.getSecurityEvents({
  severity: 'high',
  resolved: false,
  limit: 50
});
```

## 🧪 Testing

### Unit Tests

Run the comprehensive test suite:

```bash
npm test src/auth
```

Coverage report:
```bash
npm run test:coverage src/auth
```

### Integration Testing

```typescript
import { createAuthModule } from '@forgeflow/auth';

describe('Authentication Integration', () => {
  let authModule;

  beforeEach(async () => {
    authModule = await createAuthModule(redis, config);
  });

  it('should complete full authentication flow', async () => {
    // Test registration, login, 2FA, team management
  });
});
```

## 🔄 Migration & Backup

### Data Export

```typescript
// Export user data
await authService.exportUserData(userId, '/path/to/backup');

// Export team data
await teamService.exportTeamData(teamId, '/path/to/backup');
```

### Session Migration

```typescript
// Migrate sessions between Redis instances
await sessionManager.migrateSessions(oldRedis, newRedis);
```

## 🚨 Error Handling

### Custom Error Types

```typescript
import { 
  AuthenticationError, 
  AuthorizationError, 
  ValidationError,
  RateLimitError 
} from '@forgeflow/auth';

try {
  await authService.login(request);
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.log(`Auth failed: ${error.code} - ${error.message}`);
  } else if (error instanceof RateLimitError) {
    console.log(`Rate limited. Retry after ${error.retryAfter} seconds`);
  }
}
```

## 📈 Performance

### Benchmarks

- **JWT creation**: <5ms
- **JWT verification**: <2ms
- **Permission check**: <10ms (with caching)
- **Session lookup**: <5ms
- **2FA verification**: <50ms

### Caching

- Permission results cached for 5 minutes
- Session data cached in Redis
- Rate limit counters use Redis for distributed systems

## 🔒 Security Best Practices

1. **Always use HTTPS** in production
2. **Rotate JWT secrets** regularly
3. **Monitor failed login attempts**
4. **Review team permissions** periodically
5. **Enable audit logging**
6. **Use strong password policies**
7. **Require 2FA for admin accounts**
8. **Implement IP whitelisting** for sensitive operations

## 📝 License

MIT License - see [LICENSE](../../LICENSE) file for details.

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

---

**Built for ForgeFlow v2** - Enterprise AI Orchestration Platform