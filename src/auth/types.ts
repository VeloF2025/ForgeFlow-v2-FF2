/**
 * Authentication and Authorization Types for ForgeFlow v2
 * Comprehensive type definitions for team authentication system
 */

import { z } from 'zod';

// 🟢 WORKING: Base authentication interfaces
export interface AuthConfig {
  jwt: JWTConfig;
  oauth: OAuthConfig;
  session: SessionConfig;
  security: SecurityConfig;
  team: TeamAuthConfig;
  rateLimit: RateLimitConfig;
}

export interface JWTConfig {
  secretOrPrivateKey: string;
  publicKey?: string;
  algorithm: 'HS256' | 'RS256' | 'ES256';
  expiresIn: string;
  refreshExpiresIn: string;
  issuer: string;
  audience: string;
}

export interface OAuthConfig {
  providers: OAuthProvider[];
  redirectUrl: string;
  stateSecret: string;
}

export interface OAuthProvider {
  name: 'github' | 'google' | 'microsoft' | 'custom';
  clientId: string;
  clientSecret: string;
  scope: string[];
  authUrl?: string;
  tokenUrl?: string;
  userInfoUrl?: string;
  enabled: boolean;
}

export interface SessionConfig {
  name: string;
  secret: string;
  ttl: number;
  maxSessions: number;
  rolling: boolean;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'strict' | 'lax' | 'none';
}

export interface SecurityConfig {
  bcryptRounds: number;
  maxLoginAttempts: number;
  lockoutDuration: number;
  passwordPolicy: PasswordPolicy;
  twoFactor: TwoFactorConfig;
  auditLog: boolean;
}

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  preventReuse: number;
  maxAge: number;
}

export interface TwoFactorConfig {
  enabled: boolean;
  issuer: string;
  window: number;
  backupCodes: boolean;
}

export interface TeamAuthConfig {
  maxTeamSize: number;
  invitationTTL: number;
  defaultRole: TeamRole;
  allowSelfRegistration: boolean;
  requireApproval: boolean;
}

export interface RateLimitConfig {
  windowMs: number;
  maxAttempts: number;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
}

// 🟢 WORKING: User and team management interfaces
export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatar?: string;
  status: UserStatus;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  lastLogin?: Date;
  loginAttempts: number;
  lockedUntil?: Date;
  passwordChangedAt?: Date;
  preferences: UserPreferences;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export type UserStatus = 'active' | 'inactive' | 'suspended' | 'pending';

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  timezone: string;
  notifications: NotificationPreferences;
  privacy: PrivacyPreferences;
}

export interface NotificationPreferences {
  email: boolean;
  push: boolean;
  desktop: boolean;
  teamActivity: boolean;
  securityAlerts: boolean;
}

export interface PrivacyPreferences {
  profileVisible: boolean;
  activityVisible: boolean;
  allowTeamInvites: boolean;
}

export interface Team {
  id: string;
  name: string;
  slug: string;
  description?: string;
  avatar?: string;
  plan: TeamPlan;
  status: TeamStatus;
  settings: TeamSettings;
  limits: TeamLimits;
  billing?: TeamBilling;
  createdAt: Date;
  updatedAt: Date;
}

export type TeamStatus = 'active' | 'suspended' | 'pending' | 'trial';
export type TeamPlan = 'free' | 'pro' | 'enterprise';

export interface TeamSettings {
  visibility: 'public' | 'private';
  joinApproval: boolean;
  twoFactorRequired: boolean;
  sessionTimeout: number;
  allowedDomains: string[];
  ssoOnly: boolean;
}

export interface TeamLimits {
  maxMembers: number;
  maxProjects: number;
  maxStorageGB: number;
  maxApiCalls: number;
}

export interface TeamBilling {
  subscriptionId?: string;
  customerId?: string;
  status: 'active' | 'canceled' | 'past_due' | 'trialing';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

export interface TeamMember {
  id: string;
  userId: string;
  teamId: string;
  role: TeamRole;
  permissions: TeamPermission[];
  status: MemberStatus;
  invitedBy?: string;
  invitedAt?: Date;
  joinedAt?: Date;
  lastActive?: Date;
  metadata: Record<string, any>;
}

export type TeamRole = 'owner' | 'admin' | 'developer' | 'viewer' | 'guest';
export type MemberStatus = 'active' | 'inactive' | 'invited' | 'suspended';

export interface TeamPermission {
  resource: ResourceType;
  actions: PermissionAction[];
  conditions?: PermissionCondition[];
}

export type ResourceType = 
  | 'team' | 'project' | 'agent' | 'execution' | 'knowledge'
  | 'worktree' | 'github' | 'settings' | 'billing' | 'audit';

export type PermissionAction = 
  | 'create' | 'read' | 'update' | 'delete' | 'execute' | 'manage' | 'invite';

export interface PermissionCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'contains';
  value: any;
}

// 🟢 WORKING: Authentication interfaces
export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  scope?: string[];
}

export interface AuthSession {
  id: string;
  userId: string;
  teamId?: string;
  deviceId: string;
  deviceInfo: DeviceInfo;
  ipAddress: string;
  userAgent: string;
  isActive: boolean;
  lastActivity: Date;
  createdAt: Date;
  expiresAt: Date;
  permissions: ResolvedPermission[];
}

export interface DeviceInfo {
  type: 'web' | 'mobile' | 'desktop' | 'api' | 'cli';
  name: string;
  os?: string;
  browser?: string;
  version?: string;
}

export interface ResolvedPermission {
  resource: ResourceType;
  actions: PermissionAction[];
  resourceIds?: string[];
}

export interface LoginRequest {
  email: string;
  password: string;
  deviceInfo: DeviceInfo;
  rememberMe?: boolean;
  teamId?: string;
}

export interface LoginResponse {
  user: PublicUser;
  team?: PublicTeam;
  tokens: AuthToken;
  session: Pick<AuthSession, 'id' | 'expiresAt' | 'deviceInfo'>;
  requiresTwoFactor?: boolean;
  twoFactorMethods?: TwoFactorMethod[];
}

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatar?: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  preferences: UserPreferences;
}

export interface PublicTeam {
  id: string;
  name: string;
  slug: string;
  avatar?: string;
  plan: TeamPlan;
  role: TeamRole;
  permissions: ResolvedPermission[];
}

export interface TwoFactorMethod {
  type: 'totp' | 'sms' | 'email' | 'backup';
  enabled: boolean;
  verified: boolean;
}

export interface TwoFactorSetup {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

export interface TwoFactorVerification {
  sessionId: string;
  code: string;
  method: 'totp' | 'sms' | 'email' | 'backup';
  rememberDevice?: boolean;
}

// 🟢 WORKING: OAuth and external authentication
export interface OAuthState {
  state: string;
  provider: string;
  redirectUrl: string;
  teamId?: string;
  inviteToken?: string;
  expiresAt: Date;
}

export interface OAuthProfile {
  provider: string;
  providerId: string;
  email: string;
  username?: string;
  displayName: string;
  avatar?: string;
  verified: boolean;
  metadata: Record<string, any>;
}

export interface ExternalAccount {
  id: string;
  userId: string;
  provider: string;
  providerId: string;
  email: string;
  displayName: string;
  avatar?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// 🟢 WORKING: Team invitation system
export interface TeamInvitation {
  id: string;
  teamId: string;
  email: string;
  role: TeamRole;
  permissions: TeamPermission[];
  status: InvitationStatus;
  token: string;
  invitedBy: string;
  message?: string;
  metadata: Record<string, any>;
  expiresAt: Date;
  acceptedAt?: Date;
  rejectedAt?: Date;
  createdAt: Date;
}

export type InvitationStatus = 'pending' | 'accepted' | 'rejected' | 'expired' | 'revoked';

export interface InviteRequest {
  email: string;
  role: TeamRole;
  permissions?: TeamPermission[];
  message?: string;
  expiresIn?: number;
}

export interface InviteResponse {
  invitation: Omit<TeamInvitation, 'token'>;
  inviteUrl: string;
}

// 🟢 WORKING: API and CLI authentication
export interface ApiKey {
  id: string;
  name: string;
  userId: string;
  teamId?: string;
  keyHash: string;
  prefix: string;
  permissions: ResolvedPermission[];
  lastUsed?: Date;
  usageCount: number;
  rateLimit?: {
    requests: number;
    windowMs: number;
  };
  ipWhitelist?: string[];
  isActive: boolean;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateApiKeyRequest {
  name: string;
  permissions: TeamPermission[];
  expiresIn?: number;
  rateLimit?: {
    requests: number;
    windowMs: number;
  };
  ipWhitelist?: string[];
}

export interface CreateApiKeyResponse {
  apiKey: Omit<ApiKey, 'keyHash'>;
  key: string; // Only returned once
}

// 🟢 WORKING: Audit and security logging
export interface AuditLog {
  id: string;
  userId?: string;
  teamId?: string;
  sessionId?: string;
  action: AuditAction;
  resource: ResourceType;
  resourceId?: string;
  outcome: 'success' | 'failure' | 'blocked';
  reason?: string;
  metadata: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
}

export type AuditAction = 
  | 'login' | 'logout' | 'register' | 'password_change' | 'password_reset'
  | 'two_factor_setup' | 'two_factor_verify' | 'team_create' | 'team_join' | 'team_leave'
  | 'member_invite' | 'member_remove' | 'role_change' | 'permission_change'
  | 'api_key_create' | 'api_key_delete' | 'session_terminate' | 'security_violation';

export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  teamId?: string;
  description: string;
  metadata: Record<string, any>;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Date;
  timestamp: Date;
}

export type SecurityEventType = 
  | 'brute_force' | 'suspicious_login' | 'rate_limit_exceeded' | 'invalid_token'
  | 'permission_escalation' | 'data_breach_attempt' | 'account_takeover';

// 🟢 WORKING: Validation schemas
export const LoginRequestSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  deviceInfo: z.object({
    type: z.enum(['web', 'mobile', 'desktop', 'api', 'cli']),
    name: z.string().min(1, 'Device name is required'),
    os: z.string().optional(),
    browser: z.string().optional(),
    version: z.string().optional()
  }),
  rememberMe: z.boolean().optional(),
  teamId: z.string().optional()
});

export const RegisterRequestSchema = z.object({
  email: z.string().email('Invalid email address'),
  username: z.string().min(3, 'Username must be at least 3 characters').max(30, 'Username must be less than 30 characters'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().min(1, 'Display name is required').max(100, 'Display name must be less than 100 characters'),
  deviceInfo: z.object({
    type: z.enum(['web', 'mobile', 'desktop', 'api', 'cli']),
    name: z.string().min(1, 'Device name is required'),
    os: z.string().optional(),
    browser: z.string().optional(),
    version: z.string().optional()
  }),
  inviteToken: z.string().optional()
});

export const TwoFactorVerificationSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  code: z.string().min(6, 'Code must be at least 6 characters').max(8, 'Code must be less than 8 characters'),
  method: z.enum(['totp', 'sms', 'email', 'backup']),
  rememberDevice: z.boolean().optional()
});

export const InviteRequestSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['owner', 'admin', 'developer', 'viewer', 'guest']),
  permissions: z.array(z.object({
    resource: z.enum(['team', 'project', 'agent', 'execution', 'knowledge', 'worktree', 'github', 'settings', 'billing', 'audit']),
    actions: z.array(z.enum(['create', 'read', 'update', 'delete', 'execute', 'manage', 'invite'])),
    conditions: z.array(z.object({
      field: z.string(),
      operator: z.enum(['equals', 'not_equals', 'in', 'not_in', 'contains']),
      value: z.any()
    })).optional()
  })).optional(),
  message: z.string().max(500, 'Message must be less than 500 characters').optional(),
  expiresIn: z.number().positive().optional()
});

export const CreateApiKeyRequestSchema = z.object({
  name: z.string().min(1, 'API key name is required').max(100, 'Name must be less than 100 characters'),
  permissions: z.array(z.object({
    resource: z.enum(['team', 'project', 'agent', 'execution', 'knowledge', 'worktree', 'github', 'settings', 'billing', 'audit']),
    actions: z.array(z.enum(['create', 'read', 'update', 'delete', 'execute', 'manage', 'invite'])),
    conditions: z.array(z.object({
      field: z.string(),
      operator: z.enum(['equals', 'not_equals', 'in', 'not_in', 'contains']),
      value: z.any()
    })).optional()
  })),
  expiresIn: z.number().positive().optional(),
  rateLimit: z.object({
    requests: z.number().positive(),
    windowMs: z.number().positive()
  }).optional(),
  ipWhitelist: z.array(z.string().ip()).optional()
});

// 🟢 WORKING: Error types
export class AuthenticationError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly metadata?: Record<string, any>;

  constructor(message: string, code: string, statusCode: number = 401, metadata?: Record<string, any>) {
    super(message);
    this.name = 'AuthenticationError';
    this.code = code;
    this.statusCode = statusCode;
    this.metadata = metadata;
  }
}

export class AuthorizationError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly metadata?: Record<string, any>;

  constructor(message: string, code: string, statusCode: number = 403, metadata?: Record<string, any>) {
    super(message);
    this.name = 'AuthorizationError';
    this.code = code;
    this.statusCode = statusCode;
    this.metadata = metadata;
  }
}

export class ValidationError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly errors: Array<{ field: string; message: string }>;

  constructor(errors: Array<{ field: string; message: string }>) {
    super('Validation failed');
    this.name = 'ValidationError';
    this.code = 'VALIDATION_ERROR';
    this.statusCode = 400;
    this.errors = errors;
  }
}

export class RateLimitError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly retryAfter: number;

  constructor(retryAfter: number) {
    super('Rate limit exceeded');
    this.name = 'RateLimitError';
    this.code = 'RATE_LIMIT_EXCEEDED';
    this.statusCode = 429;
    this.retryAfter = retryAfter;
  }
}

// 🟢 WORKING: Service interfaces
export interface IAuthService {
  // Authentication
  login(request: LoginRequest): Promise<LoginResponse>;
  register(request: z.infer<typeof RegisterRequestSchema>): Promise<LoginResponse>;
  logout(sessionId: string): Promise<void>;
  refreshToken(refreshToken: string): Promise<AuthToken>;
  
  // Two-factor authentication
  setupTwoFactor(userId: string): Promise<TwoFactorSetup>;
  verifyTwoFactor(verification: TwoFactorVerification): Promise<LoginResponse>;
  disableTwoFactor(userId: string, password: string): Promise<void>;
  
  // Password management
  changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<void>;
  
  // Session management
  getActiveSessions(userId: string): Promise<AuthSession[]>;
  terminateSession(sessionId: string): Promise<void>;
  terminateAllSessions(userId: string, exceptSessionId?: string): Promise<void>;
}

export interface ITeamService {
  // Team management
  createTeam(userId: string, name: string, plan?: TeamPlan): Promise<Team>;
  getTeam(teamId: string): Promise<Team | null>;
  updateTeam(teamId: string, updates: Partial<Team>): Promise<Team>;
  deleteTeam(teamId: string): Promise<void>;
  
  // Member management
  inviteMember(teamId: string, invitedBy: string, request: InviteRequest): Promise<InviteResponse>;
  acceptInvitation(token: string, userId?: string): Promise<TeamMember>;
  rejectInvitation(token: string): Promise<void>;
  removeMember(teamId: string, memberId: string): Promise<void>;
  updateMemberRole(teamId: string, memberId: string, role: TeamRole): Promise<TeamMember>;
  
  // Permissions
  hasPermission(userId: string, teamId: string, resource: ResourceType, action: PermissionAction, resourceId?: string): Promise<boolean>;
  getUserPermissions(userId: string, teamId: string): Promise<ResolvedPermission[]>;
}

export interface IApiKeyService {
  createApiKey(userId: string, teamId: string, request: CreateApiKeyRequest): Promise<CreateApiKeyResponse>;
  getApiKeys(userId: string, teamId?: string): Promise<ApiKey[]>;
  getApiKey(keyId: string): Promise<ApiKey | null>;
  validateApiKey(key: string): Promise<{ userId: string; teamId?: string; permissions: ResolvedPermission[] } | null>;
  revokeApiKey(keyId: string): Promise<void>;
  updateApiKey(keyId: string, updates: Partial<ApiKey>): Promise<ApiKey>;
}

export interface IAuditService {
  logEvent(event: Omit<AuditLog, 'id' | 'timestamp'>): Promise<void>;
  logSecurityEvent(event: Omit<SecurityEvent, 'id' | 'timestamp' | 'resolved'>): Promise<void>;
  getAuditLogs(filters: {
    userId?: string;
    teamId?: string;
    resource?: ResourceType;
    action?: AuditAction;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: AuditLog[]; total: number }>;
  getSecurityEvents(filters: {
    userId?: string;
    teamId?: string;
    type?: SecurityEventType;
    severity?: SecurityEvent['severity'];
    resolved?: boolean;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ events: SecurityEvent[]; total: number }>;
}