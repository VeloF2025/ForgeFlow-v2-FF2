// 🟢 WORKING: Team Collaboration Types for ForgeFlow v2
// Complete type definitions for distributed team collaboration system

import type { ExecutionStatus } from '../types';

// Team Management Types
export interface Team {
  id: string;
  name: string;
  description: string;
  owner: TeamMember;
  members: TeamMember[];
  projects: TeamProject[];
  settings: TeamSettings;
  createdAt: Date;
  updatedAt: Date;
  status: 'active' | 'inactive' | 'archived';
  metadata: {
    timezone: string;
    workingHours: {
      start: string; // HH:mm format
      end: string;   // HH:mm format
      days: ('monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday')[];
    };
    region: string;
    tags: string[];
  };
}

export interface TeamMember {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: TeamRole;
  permissions: TeamPermission[];
  joinedAt: Date;
  lastActive: Date;
  status: 'online' | 'offline' | 'away' | 'busy';
  preferences: {
    notifications: boolean;
    availableHours: {
      start: string;
      end: string;
      timezone: string;
    };
    preferredAgentTypes: string[];
    workloadCapacity: number; // 0-100 percentage
  };
  metrics: {
    tasksCompleted: number;
    tasksInProgress: number;
    averageTaskTime: number;
    successRate: number;
    lastTaskCompletedAt?: Date;
  };
}

export type TeamRole = 'owner' | 'admin' | 'developer' | 'viewer';

export type TeamPermission = 
  | 'manage_team'        // Add/remove members, change settings
  | 'manage_projects'    // Create/archive projects
  | 'manage_execution'   // Start/stop executions
  | 'view_metrics'       // View team analytics
  | 'modify_locks'       // Override distributed locks
  | 'emergency_access'   // Emergency override capabilities
  | 'configure_agents'   // Configure agent assignments
  | 'access_knowledge';  // Access knowledge management

export interface TeamProject {
  id: string;
  name: string;
  description: string;
  repositoryUrl: string;
  githubOwner: string;
  githubRepo: string;
  baseBranch: string;
  status: 'active' | 'maintenance' | 'archived';
  assignedMembers: string[]; // TeamMember IDs
  collaborationMode: 'distributed' | 'sequential' | 'hybrid';
  createdAt: Date;
  updatedAt: Date;
  settings: ProjectCollaborationSettings;
}

export interface ProjectCollaborationSettings {
  autoLockTimeout: number; // seconds
  maxConcurrentExecutions: number;
  requireApproval: boolean;
  conflictResolutionStrategy: 'auto' | 'manual' | 'voting';
  notificationChannels: string[];
  qualityGates: {
    required: boolean;
    blockOnFailure: boolean;
    reviewersRequired: number;
  };
}

export interface TeamSettings {
  collaborationMode: 'real_time' | 'async' | 'hybrid';
  communicationPreferences: {
    websocket: boolean;
    email: boolean;
    slack?: string;
    discord?: string;
    teams?: string;
  };
  conflictResolution: {
    strategy: 'first_come_first_served' | 'priority_based' | 'vote_based' | 'leader_decides';
    timeoutMinutes: number;
    escalationRules: ConflictEscalationRule[];
  };
  distributedLocking: {
    enabled: boolean;
    defaultTimeoutMinutes: number;
    heartbeatIntervalSeconds: number;
    maxLockDuration: number; // minutes
  };
  qualityStandards: {
    requiredApprovals: number;
    enforceCodeReview: boolean;
    requireTests: boolean;
    minimumCoverage: number; // percentage
  };
}

export interface ConflictEscalationRule {
  triggerAfterMinutes: number;
  action: 'notify_admin' | 'auto_resolve' | 'escalate_to_owner' | 'pause_execution';
  participants: string[]; // TeamMember IDs
  message?: string;
}

// Distributed Locking Types
export interface DistributedLock {
  id: string;
  resourceId: string; // File path, issue ID, or other resource identifier
  resourceType: 'file' | 'issue' | 'execution' | 'agent' | 'worktree';
  holderId: string; // TeamMember ID
  teamId: string;
  projectId: string;
  acquiredAt: Date;
  expiresAt: Date;
  lastHeartbeat: Date;
  metadata: {
    operation: string;
    description: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    estimatedDuration?: number; // minutes
    tags: string[];
  };
  status: 'active' | 'expired' | 'released' | 'force_released';
}

export interface LockRequest {
  resourceId: string;
  resourceType: DistributedLock['resourceType'];
  holderId: string;
  teamId: string;
  projectId: string;
  timeoutMinutes?: number;
  priority?: DistributedLock['metadata']['priority'];
  operation: string;
  description: string;
  metadata?: Record<string, any>;
}

export interface LockResult {
  success: boolean;
  lock?: DistributedLock;
  error?: string;
  waitTime?: number; // milliseconds
  queuePosition?: number;
  conflictsWith?: DistributedLock[];
}

// Communication Types
export interface TeamMessage {
  id: string;
  teamId: string;
  projectId?: string;
  senderId: string;
  type: MessageType;
  content: MessageContent;
  timestamp: Date;
  recipients?: string[]; // If undefined, broadcast to all team members
  metadata: {
    priority: 'low' | 'medium' | 'high' | 'urgent';
    channel: 'websocket' | 'email' | 'slack' | 'discord' | 'teams';
    readBy: string[]; // TeamMember IDs who have read the message
    acknowledged: boolean;
  };
}

export type MessageType =
  | 'execution_started'
  | 'execution_completed' 
  | 'execution_failed'
  | 'conflict_detected'
  | 'conflict_resolved'
  | 'lock_acquired'
  | 'lock_released'
  | 'member_joined'
  | 'member_left'
  | 'project_updated'
  | 'quality_gate_failed'
  | 'emergency_alert'
  | 'chat_message'
  | 'status_update'
  | 'system_notification';

export interface MessageContent {
  title: string;
  body: string;
  data?: Record<string, any>;
  actions?: MessageAction[];
  links?: MessageLink[];
  attachments?: MessageAttachment[];
}

export interface MessageAction {
  id: string;
  label: string;
  type: 'button' | 'link' | 'approve' | 'reject';
  action: string; // Function name or URL
  style?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
  requiresConfirmation?: boolean;
}

export interface MessageLink {
  label: string;
  url: string;
  type: 'internal' | 'external' | 'github' | 'dashboard';
}

export interface MessageAttachment {
  name: string;
  type: 'file' | 'image' | 'log' | 'report';
  url: string;
  size?: number;
  preview?: string;
}

// Conflict Resolution Types
export interface TeamConflict {
  id: string;
  teamId: string;
  projectId: string;
  type: ConflictType;
  description: string;
  involvedMembers: string[]; // TeamMember IDs
  resources: ConflictResource[];
  detectedAt: Date;
  resolvedAt?: Date;
  resolution?: ConflictResolution;
  status: 'detected' | 'escalated' | 'resolving' | 'resolved' | 'failed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  autoResolvable: boolean;
  metadata: {
    executionIds: string[];
    affectedFiles: string[];
    lockIds: string[];
    estimatedImpact: 'minor' | 'moderate' | 'major' | 'severe';
  };
}

export type ConflictType =
  | 'concurrent_execution'     // Multiple executions on same resource
  | 'lock_contention'          // Multiple users want same lock
  | 'resource_collision'       // File/worktree conflicts
  | 'agent_assignment'         // Same agent assigned to multiple tasks
  | 'quality_gate_conflict'    // Quality gate disagreements
  | 'permission_dispute'       // Permission-related conflicts
  | 'workflow_interference';   // Workflow step conflicts

export interface ConflictResource {
  type: 'file' | 'issue' | 'execution' | 'agent' | 'worktree' | 'quality_gate';
  id: string;
  path?: string;
  currentHolder?: string;
  requestedBy: string[];
  priority: number;
}

export interface ConflictResolution {
  strategy: 'auto_merge' | 'manual_merge' | 'first_wins' | 'priority_based' | 'vote_based' | 'escalated';
  resolvedBy: string; // TeamMember ID or 'system'
  decision: string;
  reasoning: string;
  actions: ConflictAction[];
  appliedAt: Date;
  success: boolean;
  rollbackPlan?: ConflictAction[];
}

export interface ConflictAction {
  type: 'release_lock' | 'reassign_agent' | 'merge_changes' | 'rollback_execution' | 'notify_team' | 'escalate';
  target: string;
  parameters: Record<string, any>;
  executedAt?: Date;
  success?: boolean;
  error?: string;
}

// Real-time Communication Types
export interface WebSocketMessage {
  id: string;
  type: 'team_event' | 'execution_update' | 'conflict_alert' | 'lock_change' | 'chat' | 'presence' | 'system';
  teamId: string;
  projectId?: string;
  senderId: string;
  data: Record<string, any>;
  timestamp: Date;
  requiresAck: boolean;
  expiresAt?: Date;
}

export interface TeamPresence {
  memberId: string;
  teamId: string;
  status: 'online' | 'offline' | 'away' | 'busy';
  currentProject?: string;
  currentTask?: string;
  lastSeen: Date;
  capabilities: string[];
  workload: {
    current: number; // 0-100 percentage
    capacity: number; // 0-100 percentage
    availableSlots: number;
  };
  location?: {
    timezone: string;
    workingHours: boolean;
  };
}

// Team Analytics and Metrics Types
export interface TeamMetrics {
  teamId: string;
  projectId?: string;
  period: {
    start: Date;
    end: Date;
  };
  collaboration: {
    totalExecutions: number;
    concurrentExecutions: number;
    conflictsDetected: number;
    conflictsResolved: number;
    averageResolutionTime: number; // minutes
    lockContention: number;
    communicationVolume: number;
  };
  performance: {
    tasksCompleted: number;
    averageTaskTime: number; // minutes
    successRate: number; // 0-1
    qualityScore: number; // 0-1
    distributionEfficiency: number; // 0-1
  };
  memberActivity: {
    activeMembers: number;
    averageOnlineTime: number; // hours per day
    workloadDistribution: Record<string, number>; // memberId -> percentage
    collaborationIndex: number; // 0-1, measures how well team collaborates
  };
  systemHealth: {
    lockingSystemUptime: number; // percentage
    communicationLatency: number; // milliseconds
    conflictResolutionSuccess: number; // percentage
    dataConsistency: number; // percentage
  };
}

// Dashboard and Monitoring Types
export interface TeamDashboardData {
  team: Team;
  activeProjects: TeamProject[];
  onlineMembers: TeamMember[];
  currentExecutions: ExecutionStatus[];
  recentConflicts: TeamConflict[];
  activeLocks: DistributedLock[];
  systemStatus: {
    overallHealth: 'healthy' | 'warning' | 'critical';
    components: {
      locking: boolean;
      communication: boolean;
      conflictResolution: boolean;
      qualityGates: boolean;
    };
    metrics: {
      responseTime: number; // milliseconds
      throughput: number; // operations per minute
      errorRate: number; // percentage
      uptime: number; // percentage
    };
  };
  recentActivity: TeamActivity[];
}

export interface TeamActivity {
  id: string;
  teamId: string;
  type: 'execution' | 'conflict' | 'member_action' | 'system_event';
  description: string;
  performedBy: string; // TeamMember ID
  timestamp: Date;
  metadata: Record<string, any>;
  importance: 'low' | 'medium' | 'high';
}

// Migration and Compatibility Types
export interface MigrationPlan {
  fromMode: 'single_user';
  toMode: 'team_collaboration';
  projectId: string;
  steps: MigrationStep[];
  rollbackPlan: MigrationStep[];
  estimatedDuration: number; // minutes
  risksAssessment: MigrationRisk[];
}

export interface MigrationStep {
  id: string;
  name: string;
  description: string;
  type: 'backup' | 'transform' | 'validate' | 'configure' | 'test' | 'cleanup';
  dependencies: string[]; // Other step IDs
  estimatedTime: number; // minutes
  criticality: 'low' | 'medium' | 'high' | 'critical';
  rollbackAction?: string;
  validationCriteria: string[];
}

export interface MigrationRisk {
  id: string;
  description: string;
  probability: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high' | 'critical';
  mitigation: string;
  contingency: string;
}

// API Response Types
export interface TeamCollaborationResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  metadata?: {
    timestamp: Date;
    requestId: string;
    duration: number; // milliseconds
    version: string;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// Event Types for Real-time Updates
export interface TeamEvent {
  type: string;
  teamId: string;
  projectId?: string;
  data: Record<string, any>;
  timestamp: Date;
  source: 'user' | 'system' | 'external';
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

export interface TeamEventSubscription {
  subscriberId: string;
  teamId: string;
  eventTypes: string[];
  filters?: Record<string, any>;
  createdAt: Date;
  lastActivity: Date;
  active: boolean;
}

// Configuration Types
export interface TeamCollaborationConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    database: number;
    keyPrefix: string;
    ttl: {
      locks: number; // seconds
      presence: number; // seconds
      messages: number; // seconds
    };
  };
  websocket: {
    port: number;
    path: string;
    heartbeatInterval: number; // milliseconds
    messageQueueSize: number;
    maxConnections: number;
  };
  security: {
    jwtSecret: string;
    jwtExpiresIn: string;
    rateLimiting: {
      enabled: boolean;
      windowMs: number;
      maxRequests: number;
    };
    corsOrigins: string[];
  };
  performance: {
    lockTimeoutMs: number;
    conflictDetectionInterval: number; // milliseconds
    metricsAggregationInterval: number; // milliseconds
    cleanupInterval: number; // milliseconds
  };
  notifications: {
    email: {
      enabled: boolean;
      templates: Record<string, string>;
    };
    webhook: {
      enabled: boolean;
      urls: string[];
    };
    external: {
      slack?: { webhook: string };
      discord?: { webhook: string };
      teams?: { webhook: string };
    };
  };
}