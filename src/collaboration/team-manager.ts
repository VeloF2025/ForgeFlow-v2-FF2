// 🟢 WORKING: TeamManager - Core orchestration class for team collaboration
// Handles all team operations, member management, and coordination

import { EventEmitter } from 'events';
import { logger } from '../utils/enhanced-logger';
import {
  ErrorHandler,
  withErrorHandling,
  ConfigurationError,
  ErrorCategory,
} from '../utils/errors';
import type {
  Team,
  TeamMember,
  TeamProject,
  TeamSettings,
  TeamRole,
  TeamPermission,
  TeamCollaborationConfig,
  TeamCollaborationResponse,
  PaginatedResponse,
  TeamMetrics,
  TeamDashboardData,
  MigrationPlan,
  TeamActivity,
  ProjectCollaborationSettings,
} from './types';
import { DistributedLockManager } from './distributed-lock-manager';
import { TeamCommunication } from './team-communication';
import { ConflictResolver } from './conflict-resolver';

export class TeamManager extends EventEmitter {
  private config: TeamCollaborationConfig;
  private lockManager: DistributedLockManager;
  private communication: TeamCommunication;
  private conflictResolver: ConflictResolver;
  private teams: Map<string, Team>;
  private members: Map<string, TeamMember>;
  private projects: Map<string, TeamProject>;
  private initialized: boolean = false;

  constructor(config: TeamCollaborationConfig) {
    super();
    this.config = config;
    this.teams = new Map();
    this.members = new Map();
    this.projects = new Map();
    this.initializeComponents();
  }

  private async initializeComponents(): Promise<void> {
    logger.info('🚀 Initializing TeamManager for distributed collaboration...');

    try {
      await withErrorHandling(
        async () => {
          // Initialize core components
          this.lockManager = new DistributedLockManager(this.config);
          this.communication = new TeamCommunication(this.config);
          this.conflictResolver = new ConflictResolver(this.config, this.lockManager);

          // Setup event listeners for component integration
          this.setupEventHandlers();

          // Initialize components
          await this.lockManager.initialize();
          await this.communication.initialize();
          await this.conflictResolver.initialize();

          // Load existing teams and data
          await this.loadTeamData();

          this.initialized = true;
          logger.info('✅ TeamManager initialized successfully');
          this.emit('initialized');
        },
        {
          operationName: 'team-manager-initialization',
          category: ErrorCategory.CONFIGURATION,
          retries: 2,
          timeoutMs: 30000,
        },
      );
    } catch (error) {
      const handledError = ErrorHandler.getInstance().handleError(error as Error);
      logger.error('❌ Failed to initialize TeamManager', handledError);
      throw handledError;
    }
  }

  private setupEventHandlers(): void {
    // Lock manager events
    this.lockManager.on('lock:acquired', (event) => {
      logger.debug('🔒 Lock acquired', { lockId: event.lock.id, resource: event.lock.resourceId });
      this.emit('team:lock_acquired', event);
      this.communication.broadcastToTeam(event.lock.teamId, {
        type: 'lock_acquired',
        content: {
          title: 'Resource Locked',
          body: `${this.getMemberName(event.lock.holderId)} acquired lock on ${event.lock.resourceId}`,
          data: { lock: event.lock },
        },
      });
    });

    this.lockManager.on('lock:released', (event) => {
      logger.debug('🔓 Lock released', { lockId: event.lock.id, resource: event.lock.resourceId });
      this.emit('team:lock_released', event);
      this.communication.broadcastToTeam(event.lock.teamId, {
        type: 'lock_released',
        content: {
          title: 'Resource Unlocked',
          body: `${this.getMemberName(event.lock.holderId)} released lock on ${event.lock.resourceId}`,
          data: { lock: event.lock },
        },
      });
    });

    this.lockManager.on('lock:conflict', (event) => {
      logger.warn('⚠️ Lock conflict detected', event);
      this.conflictResolver.handleLockConflict(event);
    });

    // Communication events
    this.communication.on('member:connected', (event) => {
      logger.info('👋 Team member connected', { memberId: event.memberId, teamId: event.teamId });
      this.updateMemberStatus(event.memberId, 'online');
      this.emit('team:member_connected', event);
    });

    this.communication.on('member:disconnected', (event) => {
      logger.info('👋 Team member disconnected', { memberId: event.memberId, teamId: event.teamId });
      this.updateMemberStatus(event.memberId, 'offline');
      this.emit('team:member_disconnected', event);
    });

    // Conflict resolver events
    this.conflictResolver.on('conflict:detected', (event) => {
      logger.warn('🚨 Conflict detected', { conflictId: event.conflict.id, type: event.conflict.type });
      this.emit('team:conflict_detected', event);
      this.communication.broadcastToTeam(event.conflict.teamId, {
        type: 'conflict_detected',
        content: {
          title: 'Conflict Detected',
          body: `${event.conflict.type} conflict detected in project ${event.conflict.projectId}`,
          data: { conflict: event.conflict },
        },
      });
    });

    this.conflictResolver.on('conflict:resolved', (event) => {
      logger.info('✅ Conflict resolved', { conflictId: event.conflict.id, strategy: event.resolution.strategy });
      this.emit('team:conflict_resolved', event);
      this.communication.broadcastToTeam(event.conflict.teamId, {
        type: 'conflict_resolved',
        content: {
          title: 'Conflict Resolved',
          body: `Conflict resolved using ${event.resolution.strategy} strategy`,
          data: { conflict: event.conflict, resolution: event.resolution },
        },
      });
    });
  }

  private async loadTeamData(): Promise<void> {
    // TODO: Load from persistent storage (Redis/Database)
    // For now, initialize empty state
    logger.info('Loading existing team data...');
  }

  // Team Management Methods
  public async createTeam(teamData: Omit<Team, 'id' | 'createdAt' | 'updatedAt' | 'members' | 'projects'>): Promise<TeamCollaborationResponse<Team>> {
    this.ensureInitialized();

    try {
      const teamId = this.generateId('team');
      const now = new Date();

      const team: Team = {
        ...teamData,
        id: teamId,
        members: [teamData.owner], // Owner is first member
        projects: [],
        createdAt: now,
        updatedAt: now,
      };

      this.teams.set(teamId, team);
      this.members.set(teamData.owner.id, { ...teamData.owner, role: 'owner' });

      logger.info('✅ Team created successfully', { teamId, name: team.name });
      this.emit('team:created', { team });

      return {
        success: true,
        data: team,
        metadata: {
          timestamp: now,
          requestId: this.generateId('req'),
          duration: 0,
          version: '1.0.0',
        },
      };
    } catch (error) {
      const handledError = ErrorHandler.getInstance().handleError(error as Error);
      logger.error('❌ Failed to create team', handledError);
      return {
        success: false,
        error: {
          code: 'TEAM_CREATION_FAILED',
          message: handledError.message,
          details: { error: handledError },
        },
      };
    }
  }

  public async addTeamMember(teamId: string, memberData: Omit<TeamMember, 'id' | 'joinedAt' | 'lastActive' | 'metrics'>): Promise<TeamCollaborationResponse<TeamMember>> {
    this.ensureInitialized();

    try {
      const team = this.teams.get(teamId);
      if (!team) {
        throw new Error(`Team not found: ${teamId}`);
      }

      const memberId = this.generateId('member');
      const now = new Date();

      const member: TeamMember = {
        ...memberData,
        id: memberId,
        joinedAt: now,
        lastActive: now,
        metrics: {
          tasksCompleted: 0,
          tasksInProgress: 0,
          averageTaskTime: 0,
          successRate: 1.0,
        },
      };

      // Check permissions
      if (!this.hasPermission(teamId, memberData.userId, 'manage_team')) {
        throw new Error('Insufficient permissions to add team members');
      }

      team.members.push(member);
      team.updatedAt = now;
      this.members.set(memberId, member);

      logger.info('✅ Team member added', { teamId, memberId, email: member.email });
      this.emit('team:member_added', { teamId, member });

      // Notify team
      await this.communication.broadcastToTeam(teamId, {
        type: 'member_joined',
        content: {
          title: 'New Team Member',
          body: `${member.name} (${member.email}) joined the team as ${member.role}`,
          data: { member },
        },
      });

      return {
        success: true,
        data: member,
        metadata: {
          timestamp: now,
          requestId: this.generateId('req'),
          duration: 0,
          version: '1.0.0',
        },
      };
    } catch (error) {
      const handledError = ErrorHandler.getInstance().handleError(error as Error);
      logger.error('❌ Failed to add team member', handledError);
      return {
        success: false,
        error: {
          code: 'MEMBER_ADD_FAILED',
          message: handledError.message,
          details: { teamId, error: handledError },
        },
      };
    }
  }

  public async removeTeamMember(teamId: string, memberId: string, removedBy: string): Promise<TeamCollaborationResponse<void>> {
    this.ensureInitialized();

    try {
      const team = this.teams.get(teamId);
      if (!team) {
        throw new Error(`Team not found: ${teamId}`);
      }

      const member = this.members.get(memberId);
      if (!member) {
        throw new Error(`Member not found: ${memberId}`);
      }

      // Check permissions
      if (!this.hasPermission(teamId, removedBy, 'manage_team')) {
        throw new Error('Insufficient permissions to remove team members');
      }

      // Cannot remove owner
      if (member.role === 'owner') {
        throw new Error('Cannot remove team owner');
      }

      // Release any locks held by this member
      await this.lockManager.releaseAllLocks(memberId);

      // Remove from team and members map
      team.members = team.members.filter(m => m.id !== memberId);
      this.members.delete(memberId);
      team.updatedAt = new Date();

      logger.info('✅ Team member removed', { teamId, memberId, email: member.email });
      this.emit('team:member_removed', { teamId, memberId, member });

      // Notify team
      await this.communication.broadcastToTeam(teamId, {
        type: 'member_left',
        content: {
          title: 'Member Left Team',
          body: `${member.name} has been removed from the team`,
          data: { member },
        },
      });

      return {
        success: true,
        metadata: {
          timestamp: new Date(),
          requestId: this.generateId('req'),
          duration: 0,
          version: '1.0.0',
        },
      };
    } catch (error) {
      const handledError = ErrorHandler.getInstance().handleError(error as Error);
      logger.error('❌ Failed to remove team member', handledError);
      return {
        success: false,
        error: {
          code: 'MEMBER_REMOVE_FAILED',
          message: handledError.message,
          details: { teamId, memberId, error: handledError },
        },
      };
    }
  }

  // Project Management Methods
  public async addProjectToTeam(teamId: string, projectData: Omit<TeamProject, 'id' | 'createdAt' | 'updatedAt'>): Promise<TeamCollaborationResponse<TeamProject>> {
    this.ensureInitialized();

    try {
      const team = this.teams.get(teamId);
      if (!team) {
        throw new Error(`Team not found: ${teamId}`);
      }

      const projectId = this.generateId('project');
      const now = new Date();

      const project: TeamProject = {
        ...projectData,
        id: projectId,
        createdAt: now,
        updatedAt: now,
      };

      team.projects.push(project);
      team.updatedAt = now;
      this.projects.set(projectId, project);

      logger.info('✅ Project added to team', { teamId, projectId, name: project.name });
      this.emit('team:project_added', { teamId, project });

      return {
        success: true,
        data: project,
        metadata: {
          timestamp: now,
          requestId: this.generateId('req'),
          duration: 0,
          version: '1.0.0',
        },
      };
    } catch (error) {
      const handledError = ErrorHandler.getInstance().handleError(error as Error);
      logger.error('❌ Failed to add project to team', handledError);
      return {
        success: false,
        error: {
          code: 'PROJECT_ADD_FAILED',
          message: handledError.message,
          details: { teamId, error: handledError },
        },
      };
    }
  }

  // Team Operations
  public async getTeam(teamId: string): Promise<TeamCollaborationResponse<Team>> {
    this.ensureInitialized();

    const team = this.teams.get(teamId);
    if (!team) {
      return {
        success: false,
        error: {
          code: 'TEAM_NOT_FOUND',
          message: `Team not found: ${teamId}`,
        },
      };
    }

    return {
      success: true,
      data: team,
      metadata: {
        timestamp: new Date(),
        requestId: this.generateId('req'),
        duration: 0,
        version: '1.0.0',
      },
    };
  }

  public async listTeams(userId: string, page: number = 1, limit: number = 20): Promise<TeamCollaborationResponse<PaginatedResponse<Team>>> {
    this.ensureInitialized();

    try {
      // Find teams where user is a member
      const userTeams = Array.from(this.teams.values()).filter(team =>
        team.members.some(member => member.userId === userId)
      );

      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedTeams = userTeams.slice(startIndex, endIndex);

      const response: PaginatedResponse<Team> = {
        items: paginatedTeams,
        total: userTeams.length,
        page,
        limit,
        hasNext: endIndex < userTeams.length,
        hasPrev: startIndex > 0,
      };

      return {
        success: true,
        data: response,
        metadata: {
          timestamp: new Date(),
          requestId: this.generateId('req'),
          duration: 0,
          version: '1.0.0',
        },
      };
    } catch (error) {
      const handledError = ErrorHandler.getInstance().handleError(error as Error);
      logger.error('❌ Failed to list teams', handledError);
      return {
        success: false,
        error: {
          code: 'TEAM_LIST_FAILED',
          message: handledError.message,
          details: { userId, error: handledError },
        },
      };
    }
  }

  // Team Dashboard and Metrics
  public async getTeamDashboard(teamId: string): Promise<TeamCollaborationResponse<TeamDashboardData>> {
    this.ensureInitialized();

    try {
      const team = this.teams.get(teamId);
      if (!team) {
        throw new Error(`Team not found: ${teamId}`);
      }

      const onlineMembers = team.members.filter(member => member.status === 'online');
      const activeProjects = team.projects.filter(project => project.status === 'active');
      const activeLocks = await this.lockManager.getTeamLocks(teamId);
      const recentConflicts = await this.conflictResolver.getRecentConflicts(teamId, 24); // Last 24 hours
      const recentActivity = await this.getTeamActivity(teamId, 50); // Last 50 activities

      const dashboardData: TeamDashboardData = {
        team,
        activeProjects,
        onlineMembers,
        currentExecutions: [], // TODO: Get from orchestrator
        recentConflicts,
        activeLocks,
        systemStatus: {
          overallHealth: this.getSystemHealth(),
          components: {
            locking: await this.lockManager.isHealthy(),
            communication: await this.communication.isHealthy(),
            conflictResolution: await this.conflictResolver.isHealthy(),
            qualityGates: true, // TODO: Get from quality gates
          },
          metrics: {
            responseTime: await this.getAverageResponseTime(),
            throughput: await this.getThroughput(),
            errorRate: await this.getErrorRate(),
            uptime: this.getUptime(),
          },
        },
        recentActivity,
      };

      return {
        success: true,
        data: dashboardData,
        metadata: {
          timestamp: new Date(),
          requestId: this.generateId('req'),
          duration: 0,
          version: '1.0.0',
        },
      };
    } catch (error) {
      const handledError = ErrorHandler.getInstance().handleError(error as Error);
      logger.error('❌ Failed to get team dashboard', handledError);
      return {
        success: false,
        error: {
          code: 'DASHBOARD_FAILED',
          message: handledError.message,
          details: { teamId, error: handledError },
        },
      };
    }
  }

  // Migration Methods
  public async createMigrationPlan(projectPath: string, teamId: string): Promise<TeamCollaborationResponse<MigrationPlan>> {
    this.ensureInitialized();

    try {
      const migrationPlan: MigrationPlan = {
        fromMode: 'single_user',
        toMode: 'team_collaboration',
        projectId: this.generateId('migration'),
        steps: [
          {
            id: 'backup',
            name: 'Backup Project State',
            description: 'Create backup of current project state',
            type: 'backup',
            dependencies: [],
            estimatedTime: 5,
            criticality: 'critical',
            rollbackAction: 'restore_backup',
            validationCriteria: ['backup_exists', 'backup_complete', 'backup_verified'],
          },
          {
            id: 'configure_redis',
            name: 'Configure Redis for Distributed Locking',
            description: 'Setup Redis connection and key schemas',
            type: 'configure',
            dependencies: ['backup'],
            estimatedTime: 3,
            criticality: 'critical',
            rollbackAction: 'cleanup_redis',
            validationCriteria: ['redis_connected', 'schemas_created'],
          },
          {
            id: 'migrate_locks',
            name: 'Migrate File Locks to Distributed System',
            description: 'Convert local file locks to Redis-based distributed locks',
            type: 'transform',
            dependencies: ['configure_redis'],
            estimatedTime: 10,
            criticality: 'high',
            rollbackAction: 'restore_local_locks',
            validationCriteria: ['all_locks_migrated', 'no_lock_conflicts'],
          },
          {
            id: 'setup_communication',
            name: 'Setup WebSocket Communication',
            description: 'Initialize real-time communication system',
            type: 'configure',
            dependencies: ['configure_redis'],
            estimatedTime: 5,
            criticality: 'medium',
            rollbackAction: 'disable_websockets',
            validationCriteria: ['websocket_server_running', 'connection_test_passed'],
          },
          {
            id: 'test_collaboration',
            name: 'Test Team Collaboration Features',
            description: 'Run comprehensive tests of team collaboration features',
            type: 'test',
            dependencies: ['migrate_locks', 'setup_communication'],
            estimatedTime: 15,
            criticality: 'high',
            rollbackAction: 'revert_to_single_user',
            validationCriteria: ['locking_tests_passed', 'communication_tests_passed', 'conflict_resolution_working'],
          },
        ],
        rollbackPlan: [
          {
            id: 'restore_backup',
            name: 'Restore Project Backup',
            description: 'Restore project to pre-migration state',
            type: 'cleanup',
            dependencies: [],
            estimatedTime: 10,
            criticality: 'critical',
            validationCriteria: ['backup_restored', 'project_functional'],
          },
        ],
        estimatedDuration: 38, // Sum of all step times
        risksAssessment: [
          {
            id: 'data_loss',
            description: 'Risk of losing project data during migration',
            probability: 'low',
            impact: 'critical',
            mitigation: 'Comprehensive backup strategy with verification',
            contingency: 'Immediate rollback to backup',
          },
          {
            id: 'redis_failure',
            description: 'Redis connection issues during migration',
            probability: 'medium',
            impact: 'high',
            mitigation: 'Pre-flight Redis connectivity tests',
            contingency: 'Use local fallback mode temporarily',
          },
          {
            id: 'lock_conflicts',
            description: 'Lock conflicts during migration process',
            probability: 'medium',
            impact: 'medium',
            mitigation: 'Migrate during low-activity periods',
            contingency: 'Force release conflicting locks',
          },
        ],
      };

      return {
        success: true,
        data: migrationPlan,
        metadata: {
          timestamp: new Date(),
          requestId: this.generateId('req'),
          duration: 0,
          version: '1.0.0',
        },
      };
    } catch (error) {
      const handledError = ErrorHandler.getInstance().handleError(error as Error);
      logger.error('❌ Failed to create migration plan', handledError);
      return {
        success: false,
        error: {
          code: 'MIGRATION_PLAN_FAILED',
          message: handledError.message,
          details: { projectPath, teamId, error: handledError },
        },
      };
    }
  }

  // Utility Methods
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new ConfigurationError('TeamManager not initialized');
    }
  }

  private hasPermission(teamId: string, userId: string, permission: TeamPermission): boolean {
    const team = this.teams.get(teamId);
    if (!team) return false;

    const member = team.members.find(m => m.userId === userId);
    if (!member) return false;

    // Owner has all permissions
    if (member.role === 'owner') return true;

    return member.permissions.includes(permission);
  }

  private getMemberName(memberId: string): string {
    const member = this.members.get(memberId);
    return member ? member.name : 'Unknown';
  }

  private updateMemberStatus(memberId: string, status: TeamMember['status']): void {
    const member = this.members.get(memberId);
    if (member) {
      member.status = status;
      member.lastActive = new Date();
    }
  }

  private getSystemHealth(): 'healthy' | 'warning' | 'critical' {
    // TODO: Implement comprehensive health check
    return 'healthy';
  }

  private async getAverageResponseTime(): Promise<number> {
    // TODO: Implement metrics collection
    return 150; // milliseconds
  }

  private async getThroughput(): Promise<number> {
    // TODO: Implement throughput calculation
    return 50; // operations per minute
  }

  private async getErrorRate(): Promise<number> {
    // TODO: Implement error rate calculation
    return 0.5; // percentage
  }

  private getUptime(): number {
    // TODO: Implement uptime tracking
    return 99.9; // percentage
  }

  private async getTeamActivity(teamId: string, limit: number): Promise<TeamActivity[]> {
    // TODO: Implement activity tracking
    return [];
  }

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public Getters for Component Access
  public getLockManager(): DistributedLockManager {
    return this.lockManager;
  }

  public getCommunication(): TeamCommunication {
    return this.communication;
  }

  public getConflictResolver(): ConflictResolver {
    return this.conflictResolver;
  }

  // Cleanup Methods
  public async shutdown(): Promise<void> {
    logger.info('🔄 Shutting down TeamManager...');

    try {
      if (this.conflictResolver) {
        await this.conflictResolver.shutdown();
      }
      if (this.communication) {
        await this.communication.shutdown();
      }
      if (this.lockManager) {
        await this.lockManager.shutdown();
      }

      this.initialized = false;
      logger.info('✅ TeamManager shutdown complete');
    } catch (error) {
      logger.error('❌ Error during TeamManager shutdown', error);
      throw error;
    }
  }
}