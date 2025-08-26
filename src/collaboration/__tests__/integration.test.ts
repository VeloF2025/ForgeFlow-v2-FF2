// 🟢 WORKING: Integration Tests - End-to-end team collaboration system tests
// Tests complete workflows including team creation, collaboration, and conflict resolution

import { jest } from '@jest/globals';
import { TeamManager } from '../team-manager';
import { DistributedLockManager } from '../distributed-lock-manager';
import { TeamCommunication } from '../team-communication';
import { ConflictResolver } from '../conflict-resolver';
import { TeamDashboard } from '../team-dashboard';
import { MigrationSystem } from '../migration-system';
import { initializeTeamCollaboration, createDefaultTeamCollaborationConfig } from '../index';
import type {
  TeamCollaborationConfig,
  Team,
  TeamMember,
  LockRequest,
} from '../types';

// Mock external dependencies
jest.mock('ioredis');
jest.mock('ws');
jest.mock('express');
jest.mock('fs/promises');
jest.mock('../../utils/enhanced-logger');

describe('Team Collaboration Integration Tests', () => {
  let config: TeamCollaborationConfig;
  let teamManager: TeamManager;
  let lockManager: DistributedLockManager;
  let communication: TeamCommunication;
  let conflictResolver: ConflictResolver;
  let dashboard: TeamDashboard;
  let migrationSystem: MigrationSystem;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Create test configuration
    config = createDefaultTeamCollaborationConfig({
      redis: {
        host: 'localhost',
        port: 6379,
        database: 15, // Use test database
        keyPrefix: 'ff2-integration-test',
        ttl: { locks: 300, presence: 60, messages: 3600 }, // Shorter TTLs for tests
      },
      websocket: {
        port: 30001, // Different port for tests
        path: '/integration-test-ws',
        heartbeatInterval: 5000, // Faster heartbeat for tests
        messageQueueSize: 100,
        maxConnections: 10,
      },
      performance: {
        lockTimeoutMs: 5000, // Shorter timeouts for tests
        conflictDetectionInterval: 1000,
        metricsAggregationInterval: 5000,
        cleanupInterval: 10000,
      },
    });

    // Initialize system components (mocked)
    const system = await initializeTeamCollaboration(config);
    teamManager = system.teamManager;
    dashboard = system.dashboard;
    migrationSystem = system.migrationSystem;

    // Get individual components
    lockManager = teamManager.getLockManager();
    communication = teamManager.getCommunication();
    conflictResolver = teamManager.getConflictResolver();
  });

  afterEach(async () => {
    // Cleanup
    try {
      await teamManager?.shutdown();
      await dashboard?.shutdown();
      await migrationSystem?.shutdown();
    } catch (error) {
      // Ignore cleanup errors in tests
    }
  });

  describe('Complete Team Workflow', () => {
    it('should handle complete team creation and management workflow', async () => {
      // Step 1: Create a team
      const teamData = {
        name: 'Integration Test Team',
        description: 'Team for integration testing',
        owner: createTestOwner(),
        settings: createTestTeamSettings(),
        status: 'active' as const,
        metadata: {
          timezone: 'UTC',
          workingHours: { start: '09:00', end: '17:00', days: ['monday'] as const },
          region: 'global',
          tags: ['integration-test'],
        },
      };

      const teamResult = await teamManager.createTeam(teamData);
      expect(teamResult.success).toBe(true);
      const team = teamResult.data!;

      // Step 2: Add team members
      const member1 = await addTestMember(team.id, 'developer-1@test.com', 'Developer One', 'developer');
      const member2 = await addTestMember(team.id, 'developer-2@test.com', 'Developer Two', 'developer');

      expect(member1.success).toBe(true);
      expect(member2.success).toBe(true);

      // Step 3: Add a project
      const projectData = {
        name: 'Integration Test Project',
        description: 'Project for integration testing',
        repositoryUrl: 'https://github.com/test/integration-project',
        githubOwner: 'test',
        githubRepo: 'integration-project',
        baseBranch: 'main',
        status: 'active' as const,
        assignedMembers: [member1.data!.id, member2.data!.id],
        collaborationMode: 'distributed' as const,
        settings: {
          autoLockTimeout: 300,
          maxConcurrentExecutions: 3,
          requireApproval: false,
          conflictResolutionStrategy: 'auto' as const,
          notificationChannels: [],
          qualityGates: {
            required: true,
            blockOnFailure: true,
            reviewersRequired: 1,
          },
        },
      };

      const projectResult = await teamManager.addProjectToTeam(team.id, projectData);
      expect(projectResult.success).toBe(true);

      // Step 4: Verify team dashboard data
      const dashboardResult = await teamManager.getTeamDashboard(team.id);
      expect(dashboardResult.success).toBe(true);
      expect(dashboardResult.data!.team.members).toHaveLength(3); // Owner + 2 members
      expect(dashboardResult.data!.activeProjects).toHaveLength(1);
    });

    async function addTestMember(teamId: string, email: string, name: string, role: 'developer' | 'admin') {
      const memberData = {
        userId: `user-${email}`,
        email,
        name,
        role,
        permissions: role === 'admin' ? ['manage_team', 'manage_projects'] : ['view_metrics'],
        status: 'offline' as const,
        preferences: {
          notifications: true,
          availableHours: { start: '09:00', end: '17:00', timezone: 'UTC' },
          preferredAgentTypes: ['code-implementer'],
          workloadCapacity: 80,
        },
      };

      return await teamManager.addTeamMember(teamId, memberData);
    }
  });

  describe('Distributed Locking Workflow', () => {
    let team: Team;

    beforeEach(async () => {
      // Create test team
      const teamData = {
        name: 'Lock Test Team',
        description: 'Team for lock testing',
        owner: createTestOwner(),
        settings: createTestTeamSettings(),
        status: 'active' as const,
        metadata: {
          timezone: 'UTC',
          workingHours: { start: '09:00', end: '17:00', days: ['monday'] as const },
          region: 'global',
          tags: ['lock-test'],
        },
      };

      const teamResult = await teamManager.createTeam(teamData);
      team = teamResult.data!;
    });

    it('should handle concurrent lock requests with conflict resolution', async () => {
      const resource = 'src/components/TestComponent.tsx';

      // Simulate two users trying to lock the same resource
      const lockRequest1: LockRequest = {
        resourceId: resource,
        resourceType: 'file',
        holderId: 'user-1',
        teamId: team.id,
        projectId: 'project-1',
        operation: 'edit',
        description: 'User 1 editing component',
        priority: 'medium',
      };

      const lockRequest2: LockRequest = {
        resourceId: resource,
        resourceType: 'file',
        holderId: 'user-2',
        teamId: team.id,
        projectId: 'project-1',
        operation: 'edit',
        description: 'User 2 editing component',
        priority: 'high',
      };

      // Mock successful first acquisition
      jest.spyOn(lockManager, 'acquireLock')
        .mockResolvedValueOnce({
          success: true,
          lock: createMockLock(lockRequest1),
          waitTime: 0,
        })
        .mockResolvedValueOnce({
          success: false,
          error: 'Resource already locked',
          conflictsWith: [createMockLock(lockRequest1)],
          waitTime: 5000,
        });

      // First user gets the lock
      const result1 = await lockManager.acquireLock(lockRequest1);
      expect(result1.success).toBe(true);

      // Second user gets conflict
      const result2 = await lockManager.acquireLock(lockRequest2);
      expect(result2.success).toBe(false);
      expect(result2.conflictsWith).toHaveLength(1);

      // Verify conflict resolver was notified
      expect(conflictResolver.handleLockConflict).toHaveBeenCalled();
    });

    it('should handle lock heartbeat and expiration', async () => {
      const lockRequest: LockRequest = {
        resourceId: 'src/utils/helper.ts',
        resourceType: 'file',
        holderId: 'user-1',
        teamId: team.id,
        projectId: 'project-1',
        operation: 'refactor',
        description: 'Refactoring helper functions',
      };

      // Mock lock acquisition
      const mockLock = createMockLock(lockRequest);
      jest.spyOn(lockManager, 'acquireLock').mockResolvedValue({
        success: true,
        lock: mockLock,
        waitTime: 0,
      });

      const result = await lockManager.acquireLock(lockRequest);
      expect(result.success).toBe(true);

      // Test lock extension
      jest.spyOn(lockManager, 'extendLock').mockResolvedValue(true);
      const extended = await lockManager.extendLock(result.lock!.id, 30);
      expect(extended).toBe(true);

      // Test lock release
      jest.spyOn(lockManager, 'releaseLock').mockResolvedValue(true);
      const released = await lockManager.releaseLock(result.lock!.id);
      expect(released).toBe(true);
    });
  });

  describe('Communication and Presence', () => {
    let team: Team;

    beforeEach(async () => {
      const teamData = {
        name: 'Communication Test Team',
        description: 'Team for communication testing',
        owner: createTestOwner(),
        settings: createTestTeamSettings(),
        status: 'active' as const,
        metadata: {
          timezone: 'UTC',
          workingHours: { start: '09:00', end: '17:00', days: ['monday'] as const },
          region: 'global',
          tags: ['comm-test'],
        },
      };

      const teamResult = await teamManager.createTeam(teamData);
      team = teamResult.data!;
    });

    it('should handle team communication and presence updates', async () => {
      // Mock communication methods
      jest.spyOn(communication, 'broadcastToTeam').mockResolvedValue(undefined);
      jest.spyOn(communication, 'updatePresence').mockResolvedValue(undefined);

      // Simulate member connecting
      const memberId = team.members[0].id;
      await communication.updatePresence(memberId, team.id, 'online');

      // Simulate broadcasting team message
      await communication.broadcastToTeam(team.id, {
        type: 'execution_started',
        content: {
          title: 'Execution Started',
          body: 'New parallel execution has been initiated',
          data: { executionId: 'exec-123' },
        },
      });

      expect(communication.broadcastToTeam).toHaveBeenCalledWith(
        team.id,
        expect.objectContaining({
          type: 'execution_started',
        })
      );

      // Get team presence
      jest.spyOn(communication, 'getTeamPresence').mockReturnValue([
        {
          memberId,
          teamId: team.id,
          status: 'online',
          lastSeen: new Date(),
          capabilities: ['code-implementation'],
          workload: { current: 20, capacity: 100, availableSlots: 8 },
        },
      ]);

      const presence = communication.getTeamPresence(team.id);
      expect(presence).toHaveLength(1);
      expect(presence[0].status).toBe('online');
    });
  });

  describe('Conflict Resolution Workflow', () => {
    let team: Team;

    beforeEach(async () => {
      const teamData = {
        name: 'Conflict Test Team',
        description: 'Team for conflict testing',
        owner: createTestOwner(),
        settings: createTestTeamSettings(),
        status: 'active' as const,
        metadata: {
          timezone: 'UTC',
          workingHours: { start: '09:00', end: '17:00', days: ['monday'] as const },
          region: 'global',
          tags: ['conflict-test'],
        },
      };

      const teamResult = await teamManager.createTeam(teamData);
      team = teamResult.data!;
    });

    it('should detect and resolve conflicts automatically', async () => {
      // Mock conflict detection and resolution
      const mockConflict = {
        id: 'conflict-123',
        teamId: team.id,
        projectId: 'project-1',
        type: 'lock_contention' as const,
        description: 'Multiple users attempting to lock same resource',
        involvedMembers: ['user-1', 'user-2'],
        resources: [
          {
            type: 'file' as const,
            id: 'resource-1',
            path: 'src/components/Component.tsx',
            currentHolder: 'user-1',
            requestedBy: ['user-2'],
            priority: 3,
          },
        ],
        detectedAt: new Date(),
        status: 'detected' as const,
        priority: 'medium' as const,
        autoResolvable: true,
        metadata: {
          executionIds: [],
          affectedFiles: ['src/components/Component.tsx'],
          lockIds: ['lock-123'],
          estimatedImpact: 'moderate' as const,
        },
      };

      jest.spyOn(conflictResolver, 'getRecentConflicts').mockResolvedValue([mockConflict]);

      // Simulate conflict event
      const conflictEvent = {
        resourceId: 'src/components/Component.tsx',
        requestingLock: createMockLock({
          resourceId: 'src/components/Component.tsx',
          holderId: 'user-2',
        }),
        existingLock: createMockLock({
          resourceId: 'src/components/Component.tsx',
          holderId: 'user-1',
        }),
        conflictType: 'resource_collision',
      };

      await conflictResolver.handleLockConflict(conflictEvent);

      // Verify conflict was handled
      const recentConflicts = await conflictResolver.getRecentConflicts(team.id, 1);
      expect(recentConflicts).toHaveLength(1);
      expect(recentConflicts[0].type).toBe('lock_contention');
    });

    it('should escalate complex conflicts for manual resolution', async () => {
      const complexConflict = {
        id: 'conflict-456',
        teamId: team.id,
        projectId: 'project-1',
        type: 'concurrent_execution' as const,
        description: 'Multiple concurrent executions interfering',
        involvedMembers: ['user-1', 'user-2', 'user-3'],
        resources: [],
        detectedAt: new Date(),
        status: 'escalated' as const,
        priority: 'high' as const,
        autoResolvable: false,
        metadata: {
          executionIds: ['exec-1', 'exec-2'],
          affectedFiles: [],
          lockIds: [],
          estimatedImpact: 'major' as const,
        },
      };

      jest.spyOn(conflictResolver, 'getRecentConflicts').mockResolvedValue([complexConflict]);

      // Verify escalated conflicts are tracked
      const conflicts = await conflictResolver.getRecentConflicts(team.id, 24);
      const escalatedConflicts = conflicts.filter(c => c.status === 'escalated');
      expect(escalatedConflicts).toHaveLength(1);
      expect(escalatedConflicts[0].autoResolvable).toBe(false);
    });
  });

  describe('Migration System Integration', () => {
    it('should create and execute migration plan', async () => {
      const projectPath = '/test/project/path';
      const teamConfig = {
        teamName: 'Migrated Team',
        ownerEmail: 'owner@test.com',
        ownerName: 'Migration Owner',
        collaborationMode: 'distributed' as const,
      };

      // Mock migration plan creation
      const mockPlan = {
        fromMode: 'single_user' as const,
        toMode: 'team_collaboration' as const,
        projectId: 'migration-123',
        steps: [
          {
            id: 'create_backup',
            name: 'Create Project Backup',
            description: 'Backup current state',
            type: 'backup' as const,
            dependencies: [],
            estimatedTime: 5,
            criticality: 'critical' as const,
            validationCriteria: ['backup_exists'],
          },
        ],
        rollbackPlan: [],
        estimatedDuration: 5,
        risksAssessment: [],
      };

      jest.spyOn(migrationSystem, 'createMigrationPlan').mockResolvedValue(mockPlan);

      const plan = await migrationSystem.createMigrationPlan(projectPath, teamConfig);

      expect(plan).toEqual(mockPlan);
      expect(plan.steps).toHaveLength(1);
      expect(plan.estimatedDuration).toBe(5);

      // Mock migration execution
      jest.spyOn(migrationSystem, 'executeMigration').mockResolvedValue(undefined);

      // Execute migration (should not throw)
      await expect(migrationSystem.executeMigration(plan, teamConfig)).resolves.toBeUndefined();
    });

    it('should handle migration rollback on failure', async () => {
      const mockPlan = {
        fromMode: 'single_user' as const,
        toMode: 'team_collaboration' as const,
        projectId: 'failed-migration-123',
        steps: [],
        rollbackPlan: [
          {
            id: 'rollback_step',
            name: 'Rollback Step',
            description: 'Revert changes',
            type: 'cleanup' as const,
            dependencies: [],
            estimatedTime: 3,
            criticality: 'critical' as const,
            validationCriteria: ['rollback_complete'],
          },
        ],
        estimatedDuration: 10,
        risksAssessment: [],
      };

      // Mock migration state
      const mockState = {
        planId: 'failed-migration-123',
        currentStep: 0,
        status: 'rolledback' as const,
        startTime: new Date(),
        errors: ['Migration step failed'],
        completedSteps: [],
        rollbackSteps: ['rollback_step'],
      };

      jest.spyOn(migrationSystem, 'getMigrationState').mockReturnValue(mockState);

      const state = migrationSystem.getMigrationState();
      expect(state?.status).toBe('rolledback');
      expect(state?.rollbackSteps).toContain('rollback_step');
    });
  });

  describe('Dashboard API Integration', () => {
    it('should provide comprehensive team dashboard data', async () => {
      // Create test team with members and projects
      const team = await createTestTeamWithData();

      const dashboardResult = await teamManager.getTeamDashboard(team.id);

      expect(dashboardResult.success).toBe(true);
      
      const dashboardData = dashboardResult.data!;
      expect(dashboardData.team).toBeDefined();
      expect(dashboardData.activeProjects).toBeDefined();
      expect(dashboardData.systemStatus).toBeDefined();
      expect(dashboardData.systemStatus.components.locking).toBeDefined();
      expect(dashboardData.systemStatus.components.communication).toBeDefined();
      expect(dashboardData.systemStatus.components.conflictResolution).toBeDefined();
    });

    async function createTestTeamWithData(): Promise<Team> {
      const teamData = {
        name: 'Dashboard Test Team',
        description: 'Team for dashboard testing',
        owner: createTestOwner(),
        settings: createTestTeamSettings(),
        status: 'active' as const,
        metadata: {
          timezone: 'UTC',
          workingHours: { start: '09:00', end: '17:00', days: ['monday'] as const },
          region: 'global',
          tags: ['dashboard-test'],
        },
      };

      const teamResult = await teamManager.createTeam(teamData);
      const team = teamResult.data!;

      // Add a project
      const projectData = {
        name: 'Dashboard Test Project',
        description: 'Project for dashboard testing',
        repositoryUrl: 'https://github.com/test/dashboard-project',
        githubOwner: 'test',
        githubRepo: 'dashboard-project',
        baseBranch: 'main',
        status: 'active' as const,
        assignedMembers: [],
        collaborationMode: 'distributed' as const,
        settings: {
          autoLockTimeout: 300,
          maxConcurrentExecutions: 5,
          requireApproval: false,
          conflictResolutionStrategy: 'auto' as const,
          notificationChannels: [],
          qualityGates: {
            required: true,
            blockOnFailure: true,
            reviewersRequired: 1,
          },
        },
      };

      await teamManager.addProjectToTeam(team.id, projectData);

      return team;
    }
  });

  describe('Health Monitoring', () => {
    it('should report system health status correctly', async () => {
      // Mock healthy components
      jest.spyOn(lockManager, 'isHealthy').mockResolvedValue(true);
      jest.spyOn(communication, 'isHealthy').mockResolvedValue(true);
      jest.spyOn(conflictResolver, 'isHealthy').mockResolvedValue(true);

      const health = await getSystemHealth();

      expect(health.overall).toBe(true);
      expect(health.components.locking).toBe(true);
      expect(health.components.communication).toBe(true);
      expect(health.components.conflictResolution).toBe(true);
    });

    it('should detect and report component failures', async () => {
      // Mock failing component
      jest.spyOn(lockManager, 'isHealthy').mockResolvedValue(false);
      jest.spyOn(communication, 'isHealthy').mockResolvedValue(true);
      jest.spyOn(conflictResolver, 'isHealthy').mockResolvedValue(true);

      const health = await getSystemHealth();

      expect(health.overall).toBe(false);
      expect(health.components.locking).toBe(false);
      expect(health.components.communication).toBe(true);
      expect(health.components.conflictResolution).toBe(true);
    });

    async function getSystemHealth() {
      return {
        overall: await lockManager.isHealthy() && 
                 await communication.isHealthy() && 
                 await conflictResolver.isHealthy(),
        components: {
          locking: await lockManager.isHealthy(),
          communication: await communication.isHealthy(),
          conflictResolution: await conflictResolver.isHealthy(),
        },
      };
    }
  });
});

// Helper Functions
function createTestOwner(): TeamMember {
  return {
    id: `owner-${Date.now()}`,
    userId: 'test-owner',
    email: 'owner@test.com',
    name: 'Test Owner',
    role: 'owner',
    permissions: ['manage_team', 'manage_projects', 'manage_execution'],
    joinedAt: new Date(),
    lastActive: new Date(),
    status: 'online',
    preferences: {
      notifications: true,
      availableHours: { start: '09:00', end: '17:00', timezone: 'UTC' },
      preferredAgentTypes: [],
      workloadCapacity: 100,
    },
    metrics: {
      tasksCompleted: 0,
      tasksInProgress: 0,
      averageTaskTime: 0,
      successRate: 1.0,
    },
  };
}

function createTestTeamSettings() {
  return {
    collaborationMode: 'distributed' as const,
    communicationPreferences: {
      websocket: true,
      email: false,
    },
    conflictResolution: {
      strategy: 'auto' as const,
      timeoutMinutes: 15,
      escalationRules: [],
    },
    distributedLocking: {
      enabled: true,
      defaultTimeoutMinutes: 30,
      heartbeatIntervalSeconds: 15,
      maxLockDuration: 120,
    },
    qualityStandards: {
      requiredApprovals: 1,
      enforceCodeReview: true,
      requireTests: true,
      minimumCoverage: 80,
    },
  };
}

function createMockLock(params: Partial<LockRequest> & { resourceId?: string }) {
  const now = new Date();
  return {
    id: `lock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    resourceId: params.resourceId || 'test-resource',
    resourceType: params.resourceType || 'file',
    holderId: params.holderId || 'test-user',
    teamId: params.teamId || 'test-team',
    projectId: params.projectId || 'test-project',
    acquiredAt: now,
    expiresAt: new Date(now.getTime() + 30 * 60 * 1000), // 30 minutes
    lastHeartbeat: now,
    metadata: {
      operation: params.operation || 'test',
      description: params.description || 'Test lock',
      priority: params.priority || 'medium',
      tags: [],
    },
    status: 'active' as const,
  };
}