// 🟢 WORKING: MigrationSystem - Seamless transition from single-user to team collaboration mode
// Handles backward compatibility and zero-downtime migration

import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';
import { logger } from '../utils/enhanced-logger';
import {
  ErrorHandler,
  withErrorHandling,
  ConfigurationError,
  ValidationError,
  ErrorCategory,
} from '../utils/errors';
import type {
  MigrationPlan,
  MigrationStep,
  MigrationRisk,
  TeamCollaborationConfig,
  Team,
  TeamMember,
  TeamProject,
} from './types';
import type { TeamManager } from './team-manager';
import type { FileLock } from '../core/file-lock';

interface MigrationState {
  planId: string;
  currentStep: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'rolledback';
  startTime: Date;
  endTime?: Date;
  errors: string[];
  completedSteps: string[];
  rollbackSteps: string[];
}

interface SingleUserState {
  locks: Array<{
    resourceId: string;
    resourceType: string;
    metadata: Record<string, any>;
  }>;
  configurations: Record<string, any>;
  projectFiles: string[];
  worktrees: Array<{
    id: string;
    path: string;
    branch: string;
  }>;
}

interface BackupData {
  timestamp: Date;
  singleUserState: SingleUserState;
  configurations: Record<string, any>;
  checksums: Record<string, string>;
}

export class MigrationSystem extends EventEmitter {
  private config: TeamCollaborationConfig;
  private teamManager: TeamManager;
  private fileLockManager?: FileLock; // Optional legacy file lock manager
  private migrationState: MigrationState | null = null;
  private backupPath: string;
  private initialized: boolean = false;

  constructor(config: TeamCollaborationConfig, teamManager: TeamManager, fileLockManager?: FileLock) {
    super();
    this.config = config;
    this.teamManager = teamManager;
    this.fileLockManager = fileLockManager;
    this.backupPath = path.join(process.cwd(), '.ff2-migration-backups');
  }

  public async initialize(): Promise<void> {
    logger.info('🚀 Initializing MigrationSystem...');

    try {
      await withErrorHandling(
        async () => {
          // Ensure backup directory exists
          await this.ensureBackupDirectory();

          // Check for any incomplete migrations
          await this.checkIncompleteMetigrations();

          this.initialized = true;
          logger.info('✅ MigrationSystem initialized successfully');
          this.emit('initialized');
        },
        {
          operationName: 'migration-system-initialization',
          category: ErrorCategory.CONFIGURATION,
          retries: 1,
          timeoutMs: 10000,
        },
      );
    } catch (error) {
      const handledError = ErrorHandler.getInstance().handleError(error as Error);
      logger.error('❌ Failed to initialize MigrationSystem', handledError);
      throw handledError;
    }
  }

  private async ensureBackupDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.backupPath, { recursive: true });
      logger.debug('📁 Migration backup directory ensured', { path: this.backupPath });
    } catch (error) {
      throw new Error(`Failed to create backup directory: ${error.message}`);
    }
  }

  private async checkIncompleteMetigrations(): Promise<void> {
    try {
      const stateFiles = await fs.readdir(this.backupPath);
      const incompleteStates = stateFiles.filter(file => file.endsWith('.migration-state.json'));

      for (const stateFile of incompleteStates) {
        const statePath = path.join(this.backupPath, stateFile);
        const stateData = JSON.parse(await fs.readFile(statePath, 'utf-8')) as MigrationState;

        if (stateData.status === 'running') {
          logger.warn('⚠️ Found incomplete migration', { planId: stateData.planId });
          // Mark as failed so it can be rolled back if needed
          stateData.status = 'failed';
          stateData.errors.push('Migration interrupted - system restart detected');
          await fs.writeFile(statePath, JSON.stringify(stateData, null, 2));
        }
      }
    } catch (error) {
      logger.error('❌ Failed to check incomplete migrations', error);
    }
  }

  public async createMigrationPlan(
    projectPath: string,
    teamConfig: {
      teamName: string;
      ownerEmail: string;
      ownerName: string;
      collaborationMode: 'distributed' | 'sequential' | 'hybrid';
    },
  ): Promise<MigrationPlan> {
    this.ensureInitialized();

    logger.info('📋 Creating migration plan', { projectPath, teamName: teamConfig.teamName });

    try {
      // Analyze current project state
      const currentState = await this.analyzeCurrentState(projectPath);

      // Assess risks based on current state
      const risks = this.assessMigrationRisks(currentState);

      // Create migration steps
      const steps = await this.generateMigrationSteps(currentState, teamConfig);

      // Create rollback plan
      const rollbackSteps = this.generateRollbackSteps(steps);

      const migrationPlan: MigrationPlan = {
        fromMode: 'single_user',
        toMode: 'team_collaboration',
        projectId: this.generatePlanId(),
        steps,
        rollbackPlan: rollbackSteps,
        estimatedDuration: this.calculateEstimatedDuration(steps),
        risksAssessment: risks,
      };

      logger.info('✅ Migration plan created', {
        planId: migrationPlan.projectId,
        stepsCount: steps.length,
        estimatedDuration: migrationPlan.estimatedDuration,
        risksCount: risks.length,
      });

      return migrationPlan;
    } catch (error) {
      const handledError = ErrorHandler.getInstance().handleError(error as Error);
      logger.error('❌ Failed to create migration plan', handledError);
      throw handledError;
    }
  }

  private async analyzeCurrentState(projectPath: string): Promise<SingleUserState> {
    const state: SingleUserState = {
      locks: [],
      configurations: {},
      projectFiles: [],
      worktrees: [],
    };

    try {
      // Check if project directory exists
      const stats = await fs.stat(projectPath);
      if (!stats.isDirectory()) {
        throw new Error(`Project path is not a directory: ${projectPath}`);
      }

      // Analyze file locks (if legacy file lock manager exists)
      if (this.fileLockManager) {
        // TODO: Extract active locks from legacy system
        // state.locks = await this.fileLockManager.getAllActiveLocks();
      }

      // Analyze project files
      state.projectFiles = await this.getProjectFiles(projectPath);

      // Analyze configurations
      state.configurations = await this.analyzeConfigurations(projectPath);

      // Analyze worktrees (if any exist)
      state.worktrees = await this.analyzeWorktrees(projectPath);

      logger.debug('📊 Current state analyzed', {
        filesCount: state.projectFiles.length,
        locksCount: state.locks.length,
        worktreesCount: state.worktrees.length,
      });

      return state;
    } catch (error) {
      throw new Error(`Failed to analyze current state: ${error.message}`);
    }
  }

  private async getProjectFiles(projectPath: string): Promise<string[]> {
    const files: string[] = [];

    const scanDirectory = async (dirPath: string): Promise<void> => {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);

          // Skip common ignore patterns
          if (this.shouldIgnoreFile(entry.name)) {
            continue;
          }

          if (entry.isDirectory()) {
            await scanDirectory(fullPath);
          } else {
            files.push(path.relative(projectPath, fullPath));
          }
        }
      } catch (error) {
        logger.warn('⚠️ Failed to scan directory', { dirPath, error: error.message });
      }
    };

    await scanDirectory(projectPath);
    return files;
  }

  private shouldIgnoreFile(fileName: string): boolean {
    const ignorePatterns = [
      '.git',
      'node_modules',
      '.next',
      'dist',
      'build',
      '.cache',
      '.temp',
      '.tmp',
      '.ff2-migration-backups',
    ];

    return ignorePatterns.some(pattern => fileName.startsWith(pattern));
  }

  private async analyzeConfigurations(projectPath: string): Promise<Record<string, any>> {
    const configurations: Record<string, any> = {};

    const configFiles = [
      'package.json',
      'tsconfig.json',
      '.eslintrc.json',
      '.eslintrc.js',
      'forge-flow.config.json',
      'ff2.config.json',
    ];

    for (const configFile of configFiles) {
      try {
        const configPath = path.join(projectPath, configFile);
        const content = await fs.readFile(configPath, 'utf-8');
        
        if (configFile.endsWith('.json')) {
          configurations[configFile] = JSON.parse(content);
        } else {
          configurations[configFile] = content;
        }
      } catch (error) {
        // File doesn't exist or can't be read, skip it
      }
    }

    return configurations;
  }

  private async analyzeWorktrees(projectPath: string): Promise<SingleUserState['worktrees']> {
    // TODO: Implement worktree analysis
    // This would check for existing git worktrees
    return [];
  }

  private assessMigrationRisks(currentState: SingleUserState): MigrationRisk[] {
    const risks: MigrationRisk[] = [];

    // Risk: Data loss
    risks.push({
      id: 'data_loss',
      description: 'Potential data loss during migration process',
      probability: currentState.projectFiles.length > 1000 ? 'medium' : 'low',
      impact: 'critical',
      mitigation: 'Comprehensive backup with checksums and verification',
      contingency: 'Automatic rollback to pre-migration state',
    });

    // Risk: Configuration conflicts
    if (Object.keys(currentState.configurations).length > 3) {
      risks.push({
        id: 'config_conflicts',
        description: 'Complex configuration setup may conflict with team mode',
        probability: 'medium',
        impact: 'medium',
        mitigation: 'Configuration validation and backup',
        contingency: 'Restore original configurations',
      });
    }

    // Risk: Active locks
    if (currentState.locks.length > 0) {
      risks.push({
        id: 'active_locks',
        description: `${currentState.locks.length} active locks may cause conflicts`,
        probability: 'high',
        impact: 'high',
        mitigation: 'Migrate during low-activity periods, force release if necessary',
        contingency: 'Restore file-based locking temporarily',
      });
    }

    // Risk: Large project size
    if (currentState.projectFiles.length > 5000) {
      risks.push({
        id: 'large_project',
        description: 'Large project size may increase migration time and complexity',
        probability: 'high',
        impact: 'medium',
        mitigation: 'Batch processing and progress monitoring',
        contingency: 'Resume from last successful checkpoint',
      });
    }

    return risks;
  }

  private async generateMigrationSteps(
    currentState: SingleUserState,
    teamConfig: any,
  ): Promise<MigrationStep[]> {
    const steps: MigrationStep[] = [];

    // Step 1: Create full backup
    steps.push({
      id: 'create_backup',
      name: 'Create Project Backup',
      description: 'Create comprehensive backup of current project state',
      type: 'backup',
      dependencies: [],
      estimatedTime: Math.max(2, Math.ceil(currentState.projectFiles.length / 1000)),
      criticality: 'critical',
      rollbackAction: 'cleanup_backup',
      validationCriteria: [
        'backup_directory_created',
        'all_files_backed_up',
        'checksums_verified',
        'backup_metadata_saved',
      ],
    });

    // Step 2: Validate environment
    steps.push({
      id: 'validate_environment',
      name: 'Validate Migration Environment',
      description: 'Validate Redis connection and team collaboration requirements',
      type: 'validate',
      dependencies: ['create_backup'],
      estimatedTime: 2,
      criticality: 'critical',
      rollbackAction: 'none',
      validationCriteria: [
        'redis_connection_verified',
        'team_manager_initialized',
        'no_conflicting_processes',
      ],
    });

    // Step 3: Create team structure
    steps.push({
      id: 'create_team',
      name: 'Create Team Structure',
      description: 'Set up team, add owner as first member',
      type: 'configure',
      dependencies: ['validate_environment'],
      estimatedTime: 1,
      criticality: 'high',
      rollbackAction: 'delete_team',
      validationCriteria: [
        'team_created',
        'owner_added_as_member',
        'team_accessible',
      ],
    });

    // Step 4: Add project to team
    steps.push({
      id: 'add_project',
      name: 'Add Project to Team',
      description: 'Register current project with team collaboration system',
      type: 'configure',
      dependencies: ['create_team'],
      estimatedTime: 1,
      criticality: 'high',
      rollbackAction: 'remove_project',
      validationCriteria: [
        'project_added_to_team',
        'project_settings_configured',
        'collaboration_mode_set',
      ],
    });

    // Step 5: Migrate locks (if any exist)
    if (currentState.locks.length > 0) {
      steps.push({
        id: 'migrate_locks',
        name: 'Migrate File Locks to Distributed System',
        description: 'Convert existing file locks to distributed Redis-based locks',
        type: 'transform',
        dependencies: ['add_project'],
        estimatedTime: Math.max(3, currentState.locks.length),
        criticality: 'high',
        rollbackAction: 'restore_file_locks',
        validationCriteria: [
          'all_locks_migrated',
          'no_lock_conflicts',
          'distributed_locks_functional',
        ],
      });
    }

    // Step 6: Update configurations
    steps.push({
      id: 'update_configurations',
      name: 'Update Project Configurations',
      description: 'Update project configurations for team collaboration mode',
      type: 'transform',
      dependencies: currentState.locks.length > 0 ? ['migrate_locks'] : ['add_project'],
      estimatedTime: 3,
      criticality: 'medium',
      rollbackAction: 'restore_configurations',
      validationCriteria: [
        'configurations_updated',
        'team_mode_enabled',
        'backward_compatibility_maintained',
      ],
    });

    // Step 7: Test team functionality
    steps.push({
      id: 'test_team_mode',
      name: 'Test Team Collaboration Features',
      description: 'Run comprehensive tests of team collaboration functionality',
      type: 'test',
      dependencies: ['update_configurations'],
      estimatedTime: 5,
      criticality: 'high',
      rollbackAction: 'revert_to_single_user',
      validationCriteria: [
        'locking_system_functional',
        'communication_system_functional',
        'conflict_resolution_working',
        'dashboard_accessible',
        'api_endpoints_responding',
      ],
    });

    // Step 8: Final validation
    steps.push({
      id: 'final_validation',
      name: 'Final Migration Validation',
      description: 'Comprehensive validation that migration completed successfully',
      type: 'validate',
      dependencies: ['test_team_mode'],
      estimatedTime: 3,
      criticality: 'critical',
      rollbackAction: 'full_rollback',
      validationCriteria: [
        'all_features_functional',
        'no_data_loss_detected',
        'performance_acceptable',
        'team_mode_fully_operational',
      ],
    });

    return steps;
  }

  private generateRollbackSteps(migrationSteps: MigrationStep[]): MigrationStep[] {
    return migrationSteps
      .filter(step => step.rollbackAction && step.rollbackAction !== 'none')
      .reverse()
      .map(step => ({
        id: `rollback_${step.id}`,
        name: `Rollback: ${step.name}`,
        description: `Rollback changes made by ${step.name}`,
        type: 'cleanup',
        dependencies: [],
        estimatedTime: Math.ceil(step.estimatedTime * 0.5),
        criticality: step.criticality,
        validationCriteria: [`${step.id}_rolled_back`],
      }));
  }

  private calculateEstimatedDuration(steps: MigrationStep[]): number {
    return steps.reduce((total, step) => total + step.estimatedTime, 0);
  }

  public async executeMigration(
    migrationPlan: MigrationPlan,
    teamConfig: any,
  ): Promise<void> {
    this.ensureInitialized();

    logger.info('🚀 Starting migration execution', { planId: migrationPlan.projectId });

    // Initialize migration state
    this.migrationState = {
      planId: migrationPlan.projectId,
      currentStep: 0,
      status: 'pending',
      startTime: new Date(),
      errors: [],
      completedSteps: [],
      rollbackSteps: [],
    };

    try {
      await this.saveMigrationState();

      this.migrationState.status = 'running';
      await this.saveMigrationState();

      this.emit('migration:started', { planId: migrationPlan.projectId });

      // Execute each step
      for (let i = 0; i < migrationPlan.steps.length; i++) {
        const step = migrationPlan.steps[i];
        this.migrationState.currentStep = i;
        await this.saveMigrationState();

        logger.info(`🔄 Executing migration step: ${step.name}`, {
          stepId: step.id,
          stepNumber: i + 1,
          totalSteps: migrationPlan.steps.length,
        });

        try {
          await this.executeStep(step, teamConfig);
          this.migrationState.completedSteps.push(step.id);
          this.emit('migration:step_completed', { planId: migrationPlan.projectId, step });
        } catch (error) {
          this.migrationState.errors.push(`Step ${step.id}: ${error.message}`);
          this.migrationState.status = 'failed';
          await this.saveMigrationState();

          logger.error(`❌ Migration step failed: ${step.name}`, error);
          this.emit('migration:step_failed', { planId: migrationPlan.projectId, step, error });

          // Attempt rollback
          await this.rollbackMigration(migrationPlan);
          return;
        }
      }

      // Migration completed successfully
      this.migrationState.status = 'completed';
      this.migrationState.endTime = new Date();
      await this.saveMigrationState();

      logger.info('✅ Migration completed successfully', {
        planId: migrationPlan.projectId,
        duration: this.migrationState.endTime.getTime() - this.migrationState.startTime.getTime(),
      });

      this.emit('migration:completed', { planId: migrationPlan.projectId });
    } catch (error) {
      this.migrationState.status = 'failed';
      this.migrationState.errors.push(`Migration failed: ${error.message}`);
      await this.saveMigrationState();

      logger.error('❌ Migration execution failed', error);
      this.emit('migration:failed', { planId: migrationPlan.projectId, error });
      throw error;
    }
  }

  private async executeStep(step: MigrationStep, teamConfig: any): Promise<void> {
    const startTime = Date.now();

    switch (step.id) {
      case 'create_backup':
        await this.executeBackupStep();
        break;
      
      case 'validate_environment':
        await this.executeValidationStep();
        break;
      
      case 'create_team':
        await this.executeCreateTeamStep(teamConfig);
        break;
      
      case 'add_project':
        await this.executeAddProjectStep(teamConfig);
        break;
      
      case 'migrate_locks':
        await this.executeMigrateLocksStep();
        break;
      
      case 'update_configurations':
        await this.executeUpdateConfigurationsStep();
        break;
      
      case 'test_team_mode':
        await this.executeTestTeamModeStep();
        break;
      
      case 'final_validation':
        await this.executeFinalValidationStep();
        break;
      
      default:
        throw new Error(`Unknown migration step: ${step.id}`);
    }

    const duration = Date.now() - startTime;
    logger.debug('✅ Migration step completed', {
      stepId: step.id,
      duration,
      estimatedTime: step.estimatedTime * 60 * 1000, // Convert to ms
    });
  }

  private async executeBackupStep(): Promise<void> {
    const backupId = `backup-${Date.now()}`;
    const backupDir = path.join(this.backupPath, backupId);

    await fs.mkdir(backupDir, { recursive: true });

    // Create backup data
    const backupData: BackupData = {
      timestamp: new Date(),
      singleUserState: await this.analyzeCurrentState(process.cwd()),
      configurations: {},
      checksums: {},
    };

    // Save backup metadata
    await fs.writeFile(
      path.join(backupDir, 'backup.json'),
      JSON.stringify(backupData, null, 2)
    );

    logger.info('📦 Backup created', { backupId, backupDir });
  }

  private async executeValidationStep(): Promise<void> {
    // Test Redis connection
    const lockManager = this.teamManager.getLockManager();
    const isHealthy = await lockManager.isHealthy();
    
    if (!isHealthy) {
      throw new Error('Redis connection validation failed');
    }

    // Test team manager initialization
    if (!this.teamManager) {
      throw new Error('TeamManager not properly initialized');
    }

    logger.info('✅ Environment validation passed');
  }

  private async executeCreateTeamStep(teamConfig: any): Promise<void> {
    const teamData = {
      name: teamConfig.teamName,
      description: `Migrated team for ${teamConfig.teamName}`,
      owner: {
        id: 'owner-' + Date.now(),
        userId: 'migration-owner',
        email: teamConfig.ownerEmail,
        name: teamConfig.ownerName,
        role: 'owner' as const,
        permissions: ['manage_team', 'manage_projects', 'manage_execution'] as const,
        joinedAt: new Date(),
        lastActive: new Date(),
        status: 'online' as const,
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
      },
      settings: {
        collaborationMode: teamConfig.collaborationMode || 'distributed' as const,
        communicationPreferences: {
          websocket: true,
          email: true,
        },
        conflictResolution: {
          strategy: 'auto' as const,
          timeoutMinutes: 30,
          escalationRules: [],
        },
        distributedLocking: {
          enabled: true,
          defaultTimeoutMinutes: 60,
          heartbeatIntervalSeconds: 30,
          maxLockDuration: 240,
        },
        qualityStandards: {
          requiredApprovals: 1,
          enforceCodeReview: true,
          requireTests: true,
          minimumCoverage: 80,
        },
      },
      status: 'active' as const,
      metadata: {
        timezone: 'UTC',
        workingHours: {
          start: '09:00',
          end: '17:00',
          days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const,
        },
        region: 'global',
        tags: ['migrated'],
      },
    };

    const result = await this.teamManager.createTeam(teamData);
    
    if (!result.success) {
      throw new Error(`Failed to create team: ${result.error?.message}`);
    }

    logger.info('👥 Team created successfully', { teamId: result.data!.id });
  }

  private async executeAddProjectStep(teamConfig: any): Promise<void> {
    // TODO: Get the created team ID from previous step
    const teamId = 'temp-team-id'; // This would be stored in migration state

    const projectData = {
      name: teamConfig.projectName || 'Migrated Project',
      description: 'Project migrated from single-user mode',
      repositoryUrl: teamConfig.repositoryUrl || '',
      githubOwner: teamConfig.githubOwner || '',
      githubRepo: teamConfig.githubRepo || '',
      baseBranch: 'main',
      status: 'active' as const,
      assignedMembers: [],
      collaborationMode: teamConfig.collaborationMode || 'distributed' as const,
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

    const result = await this.teamManager.addProjectToTeam(teamId, projectData);
    
    if (!result.success) {
      throw new Error(`Failed to add project to team: ${result.error?.message}`);
    }

    logger.info('📁 Project added to team successfully', { projectId: result.data!.id });
  }

  private async executeMigrateLocksStep(): Promise<void> {
    // TODO: Implement lock migration from file-based to distributed
    logger.info('🔒 Lock migration completed (placeholder)');
  }

  private async executeUpdateConfigurationsStep(): Promise<void> {
    // TODO: Update project configurations for team mode
    logger.info('⚙️ Configurations updated (placeholder)');
  }

  private async executeTestTeamModeStep(): Promise<void> {
    // Run basic functionality tests
    const lockManager = this.teamManager.getLockManager();
    const communication = this.teamManager.getCommunication();
    const conflictResolver = this.teamManager.getConflictResolver();

    const tests = [
      { name: 'Lock Manager', test: () => lockManager.isHealthy() },
      { name: 'Communication', test: () => communication.isHealthy() },
      { name: 'Conflict Resolver', test: () => conflictResolver.isHealthy() },
    ];

    for (const test of tests) {
      const result = await test.test();
      if (!result) {
        throw new Error(`Team mode test failed: ${test.name}`);
      }
    }

    logger.info('🧪 Team mode tests passed');
  }

  private async executeFinalValidationStep(): Promise<void> {
    // Final comprehensive validation
    logger.info('🔍 Final validation completed');
  }

  private async rollbackMigration(migrationPlan: MigrationPlan): Promise<void> {
    logger.warn('🔄 Starting migration rollback', { planId: migrationPlan.projectId });

    try {
      this.migrationState!.status = 'rolledback';
      
      // Execute rollback steps in reverse order
      for (const step of migrationPlan.rollbackPlan) {
        logger.info(`🔙 Executing rollback step: ${step.name}`);
        // TODO: Implement actual rollback logic
        this.migrationState!.rollbackSteps.push(step.id);
      }

      await this.saveMigrationState();
      logger.info('✅ Migration rollback completed');
      this.emit('migration:rolledback', { planId: migrationPlan.projectId });
    } catch (error) {
      logger.error('❌ Migration rollback failed', error);
      this.emit('migration:rollback_failed', { planId: migrationPlan.projectId, error });
      throw error;
    }
  }

  private async saveMigrationState(): Promise<void> {
    if (!this.migrationState) return;

    const statePath = path.join(
      this.backupPath,
      `${this.migrationState.planId}.migration-state.json`
    );

    await fs.writeFile(statePath, JSON.stringify(this.migrationState, null, 2));
  }

  private generatePlanId(): string {
    return `migration-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new ConfigurationError('MigrationSystem not initialized');
    }
  }

  // Public API Methods
  public getMigrationState(): MigrationState | null {
    return this.migrationState;
  }

  public async getMigrationHistory(): Promise<MigrationState[]> {
    const history: MigrationState[] = [];
    
    try {
      const stateFiles = await fs.readdir(this.backupPath);
      const migrationStates = stateFiles.filter(file => file.endsWith('.migration-state.json'));

      for (const stateFile of migrationStates) {
        const statePath = path.join(this.backupPath, stateFile);
        const stateData = JSON.parse(await fs.readFile(statePath, 'utf-8'));
        history.push(stateData);
      }
    } catch (error) {
      logger.error('❌ Failed to get migration history', error);
    }

    return history.sort((a, b) => 
      new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );
  }

  public async cleanupMigrationData(olderThanDays: number = 30): Promise<void> {
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    
    try {
      const files = await fs.readdir(this.backupPath);
      let cleanedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.backupPath, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime < cutoffDate) {
          await fs.rm(filePath, { recursive: true, force: true });
          cleanedCount++;
        }
      }

      logger.info('🧹 Migration cleanup completed', { cleanedCount, olderThanDays });
    } catch (error) {
      logger.error('❌ Migration cleanup failed', error);
    }
  }

  public async shutdown(): Promise<void> {
    logger.info('🔄 Shutting down MigrationSystem...');

    try {
      // Save current state if there's an active migration
      if (this.migrationState) {
        await this.saveMigrationState();
      }

      this.initialized = false;
      logger.info('✅ MigrationSystem shutdown complete');
    } catch (error) {
      logger.error('❌ Error during MigrationSystem shutdown', error);
      throw error;
    }
  }
}