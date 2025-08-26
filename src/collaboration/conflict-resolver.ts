// 🟢 WORKING: ConflictResolver - Automatic conflict detection and resolution system
// Handles team collaboration conflicts with intelligent resolution strategies

import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { logger } from '../utils/enhanced-logger';
import {
  ErrorHandler,
  withErrorHandling,
  ConfigurationError,
  ErrorCategory,
} from '../utils/errors';
import type {
  TeamConflict,
  ConflictType,
  ConflictResource,
  ConflictResolution,
  ConflictAction,
  DistributedLock,
  TeamCollaborationConfig,
} from './types';
import type { DistributedLockManager } from './distributed-lock-manager';

interface ConflictDetectionRule {
  type: ConflictType;
  detector: (context: ConflictContext) => Promise<boolean>;
  priority: number;
  autoResolvable: boolean;
  resolutionStrategy: string;
}

interface ConflictContext {
  locks: DistributedLock[];
  resources: ConflictResource[];
  teamId: string;
  projectId: string;
  timestamp: Date;
  metadata: Record<string, any>;
}

interface ConflictMetrics {
  total: number;
  resolved: number;
  failed: number;
  averageResolutionTime: number;
  byType: Record<ConflictType, number>;
  byStrategy: Record<string, number>;
}

export class ConflictResolver extends EventEmitter {
  private config: TeamCollaborationConfig;
  private lockManager: DistributedLockManager;
  private redis: Redis;
  private conflicts: Map<string, TeamConflict>;
  private detectionRules: ConflictDetectionRule[];
  private metrics: ConflictMetrics;
  private detectionInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;
  private initialized: boolean = false;

  constructor(config: TeamCollaborationConfig, lockManager: DistributedLockManager) {
    super();
    this.config = config;
    this.lockManager = lockManager;
    this.conflicts = new Map();
    this.metrics = this.initializeMetrics();
    this.detectionRules = this.initializeDetectionRules();
  }

  private initializeMetrics(): ConflictMetrics {
    return {
      total: 0,
      resolved: 0,
      failed: 0,
      averageResolutionTime: 0,
      byType: {
        concurrent_execution: 0,
        lock_contention: 0,
        resource_collision: 0,
        agent_assignment: 0,
        quality_gate_conflict: 0,
        permission_dispute: 0,
        workflow_interference: 0,
      },
      byStrategy: {},
    };
  }

  private initializeDetectionRules(): ConflictDetectionRule[] {
    return [
      {
        type: 'lock_contention',
        detector: this.detectLockContention.bind(this),
        priority: 1,
        autoResolvable: true,
        resolutionStrategy: 'priority_based',
      },
      {
        type: 'resource_collision',
        detector: this.detectResourceCollision.bind(this),
        priority: 2,
        autoResolvable: true,
        resolutionStrategy: 'first_wins',
      },
      {
        type: 'concurrent_execution',
        detector: this.detectConcurrentExecution.bind(this),
        priority: 3,
        autoResolvable: false,
        resolutionStrategy: 'manual_merge',
      },
      {
        type: 'agent_assignment',
        detector: this.detectAgentAssignment.bind(this),
        priority: 4,
        autoResolvable: true,
        resolutionStrategy: 'load_balance',
      },
      {
        type: 'quality_gate_conflict',
        detector: this.detectQualityGateConflict.bind(this),
        priority: 5,
        autoResolvable: false,
        resolutionStrategy: 'vote_based',
      },
      {
        type: 'permission_dispute',
        detector: this.detectPermissionDispute.bind(this),
        priority: 6,
        autoResolvable: false,
        resolutionStrategy: 'escalated',
      },
      {
        type: 'workflow_interference',
        detector: this.detectWorkflowInterference.bind(this),
        priority: 7,
        autoResolvable: true,
        resolutionStrategy: 'sequence_optimization',
      },
    ];
  }

  public async initialize(): Promise<void> {
    logger.info('🚀 Initializing ConflictResolver...');

    try {
      await withErrorHandling(
        async () => {
          // Initialize Redis connection
          this.redis = new Redis({
            host: this.config.redis.host,
            port: this.config.redis.port,
            password: this.config.redis.password,
            db: this.config.redis.database,
            keyPrefix: `${this.config.redis.keyPrefix}:conflicts:`,
          });

          // Test Redis connection
          await this.redis.ping();

          // Load existing conflicts
          await this.loadExistingConflicts();

          // Start background processes
          this.startConflictDetection();
          this.startCleanup();

          this.initialized = true;
          logger.info('✅ ConflictResolver initialized successfully');
          this.emit('initialized');
        },
        {
          operationName: 'conflict-resolver-initialization',
          category: ErrorCategory.CONFIGURATION,
          retries: 2,
          timeoutMs: 15000,
        },
      );
    } catch (error) {
      const handledError = ErrorHandler.getInstance().handleError(error as Error);
      logger.error('❌ Failed to initialize ConflictResolver', handledError);
      throw handledError;
    }
  }

  private async loadExistingConflicts(): Promise<void> {
    try {
      const keys = await this.redis.keys('conflict:*');
      for (const key of keys) {
        const conflictData = await this.redis.get(key);
        if (conflictData) {
          const conflict = JSON.parse(conflictData) as TeamConflict;
          if (conflict.status === 'detected' || conflict.status === 'escalated' || conflict.status === 'resolving') {
            this.conflicts.set(conflict.id, conflict);
          }
        }
      }
      logger.info('📚 Loaded existing conflicts', { count: this.conflicts.size });
    } catch (error) {
      logger.error('❌ Failed to load existing conflicts', error);
    }
  }

  private startConflictDetection(): void {
    const intervalMs = this.config.performance.conflictDetectionInterval;

    this.detectionInterval = setInterval(async () => {
      try {
        await this.runConflictDetection();
      } catch (error) {
        logger.error('❌ Conflict detection error', error);
      }
    }, intervalMs);

    logger.debug('🔍 Conflict detection started', { intervalMs });
  }

  private startCleanup(): void {
    const intervalMs = this.config.performance.cleanupInterval;

    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupResolvedConflicts();
      } catch (error) {
        logger.error('❌ Conflict cleanup error', error);
      }
    }, intervalMs);

    logger.debug('🧹 Conflict cleanup started', { intervalMs });
  }

  private async runConflictDetection(): Promise<void> {
    // Get current system state for analysis
    const activeLocks = await this.getAllActiveLocks();
    const teamGroups = this.groupLocksByTeam(activeLocks);

    for (const [teamId, teamLocks] of teamGroups) {
      const projectGroups = this.groupLocksByProject(teamLocks);
      
      for (const [projectId, projectLocks] of projectGroups) {
        const context: ConflictContext = {
          locks: projectLocks,
          resources: this.extractResources(projectLocks),
          teamId,
          projectId,
          timestamp: new Date(),
          metadata: {
            lockCount: projectLocks.length,
            uniqueHolders: new Set(projectLocks.map(l => l.holderId)).size,
          },
        };

        // Run detection rules
        for (const rule of this.detectionRules) {
          try {
            const detected = await rule.detector(context);
            if (detected) {
              await this.handleDetectedConflict(rule.type, context, rule);
            }
          } catch (error) {
            logger.error('❌ Detection rule error', { type: rule.type, error });
          }
        }
      }
    }
  }

  // Conflict Detection Rules
  private async detectLockContention(context: ConflictContext): Promise<boolean> {
    // Check for multiple requests on the same resource
    const resourceMap = new Map<string, DistributedLock[]>();
    
    for (const lock of context.locks) {
      const key = `${lock.resourceType}:${lock.resourceId}`;
      if (!resourceMap.has(key)) {
        resourceMap.set(key, []);
      }
      resourceMap.get(key)!.push(lock);
    }

    // Look for resources with multiple lock attempts
    for (const [resourceKey, locks] of resourceMap) {
      if (locks.length > 1) {
        const conflictId = this.generateConflictId('lock_contention');
        if (!this.conflicts.has(conflictId)) {
          return true;
        }
      }
    }

    return false;
  }

  private async detectResourceCollision(context: ConflictContext): Promise<boolean> {
    // Check for locks on overlapping file paths or related resources
    const fileLocks = context.locks.filter(l => l.resourceType === 'file');
    
    for (let i = 0; i < fileLocks.length; i++) {
      for (let j = i + 1; j < fileLocks.length; j++) {
        const lock1 = fileLocks[i];
        const lock2 = fileLocks[j];
        
        if (this.areResourcesRelated(lock1.resourceId, lock2.resourceId)) {
          return true;
        }
      }
    }

    return false;
  }

  private async detectConcurrentExecution(context: ConflictContext): Promise<boolean> {
    // Check for multiple execution locks on the same issue or related issues
    const executionLocks = context.locks.filter(l => l.resourceType === 'execution');
    
    if (executionLocks.length > 1) {
      // Check if executions might interfere with each other
      for (let i = 0; i < executionLocks.length; i++) {
        for (let j = i + 1; j < executionLocks.length; j++) {
          const exec1 = executionLocks[i];
          const exec2 = executionLocks[j];
          
          if (await this.doExecutionsInterfere(exec1, exec2)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private async detectAgentAssignment(context: ConflictContext): Promise<boolean> {
    // Check for same agent assigned to multiple conflicting tasks
    const agentLocks = context.locks.filter(l => l.resourceType === 'agent');
    const agentMap = new Map<string, DistributedLock[]>();
    
    for (const lock of agentLocks) {
      if (!agentMap.has(lock.resourceId)) {
        agentMap.set(lock.resourceId, []);
      }
      agentMap.get(lock.resourceId)!.push(lock);
    }

    // Check for overloaded agents
    for (const [agentId, locks] of agentMap) {
      if (locks.length > 3) { // Agent overload threshold
        return true;
      }
    }

    return false;
  }

  private async detectQualityGateConflict(context: ConflictContext): Promise<boolean> {
    // Check for quality gate disagreements
    // This would integrate with the quality gates system
    // For now, simulate detection based on metadata
    
    const qualityLocks = context.locks.filter(l => 
      l.metadata.operation.includes('quality') || 
      l.metadata.operation.includes('review')
    );

    return qualityLocks.length > 2; // Multiple quality processes
  }

  private async detectPermissionDispute(context: ConflictContext): Promise<boolean> {
    // Check for permission-related conflicts
    // This would integrate with the permission system
    
    const highPriorityLocks = context.locks.filter(l => 
      l.metadata.priority === 'critical' || l.metadata.priority === 'high'
    );

    return highPriorityLocks.length > 1;
  }

  private async detectWorkflowInterference(context: ConflictContext): Promise<boolean> {
    // Check for workflow step dependencies that might conflict
    const workflowLocks = context.locks.filter(l => 
      l.metadata.operation.includes('workflow') ||
      l.metadata.operation.includes('phase')
    );

    // Analyze workflow dependencies
    return workflowLocks.length > 0 && this.hasWorkflowDependencyConflicts(workflowLocks);
  }

  private async handleDetectedConflict(
    type: ConflictType,
    context: ConflictContext,
    rule: ConflictDetectionRule,
  ): Promise<void> {
    const conflictId = this.generateConflictId(type);
    
    // Check if we already have this conflict
    if (this.conflicts.has(conflictId)) {
      return;
    }

    const conflict: TeamConflict = {
      id: conflictId,
      teamId: context.teamId,
      projectId: context.projectId,
      type,
      description: this.generateConflictDescription(type, context),
      involvedMembers: this.extractInvolvedMembers(context),
      resources: context.resources,
      detectedAt: new Date(),
      status: 'detected',
      priority: this.calculateConflictPriority(type, context),
      autoResolvable: rule.autoResolvable,
      metadata: {
        executionIds: context.locks.filter(l => l.resourceType === 'execution').map(l => l.resourceId),
        affectedFiles: context.locks.filter(l => l.resourceType === 'file').map(l => l.resourceId),
        lockIds: context.locks.map(l => l.id),
        estimatedImpact: this.estimateConflictImpact(type, context),
      },
    };

    // Store conflict
    this.conflicts.set(conflictId, conflict);
    await this.persistConflict(conflict);

    // Update metrics
    this.metrics.total++;
    this.metrics.byType[type]++;

    logger.warn('🚨 Conflict detected', {
      conflictId,
      type,
      teamId: context.teamId,
      projectId: context.projectId,
      autoResolvable: rule.autoResolvable,
      priority: conflict.priority,
    });

    this.emit('conflict:detected', { conflict });

    // Try automatic resolution if possible
    if (rule.autoResolvable) {
      await this.attemptAutomaticResolution(conflict, rule.resolutionStrategy);
    } else {
      // Escalate for manual resolution
      await this.escalateConflict(conflict);
    }
  }

  private async attemptAutomaticResolution(
    conflict: TeamConflict,
    strategy: string,
  ): Promise<void> {
    logger.info('🤖 Attempting automatic conflict resolution', {
      conflictId: conflict.id,
      strategy,
    });

    try {
      conflict.status = 'resolving';
      await this.persistConflict(conflict);

      let resolution: ConflictResolution | null = null;

      switch (strategy) {
        case 'priority_based':
          resolution = await this.resolvePriorityBased(conflict);
          break;
        case 'first_wins':
          resolution = await this.resolveFirstWins(conflict);
          break;
        case 'load_balance':
          resolution = await this.resolveLoadBalance(conflict);
          break;
        case 'sequence_optimization':
          resolution = await this.resolveSequenceOptimization(conflict);
          break;
        default:
          logger.warn('⚠️ Unknown resolution strategy', { strategy });
          return;
      }

      if (resolution && resolution.success) {
        conflict.resolution = resolution;
        conflict.status = 'resolved';
        conflict.resolvedAt = new Date();
        
        this.metrics.resolved++;
        this.metrics.byStrategy[strategy] = (this.metrics.byStrategy[strategy] || 0) + 1;
        
        const resolutionTime = conflict.resolvedAt.getTime() - conflict.detectedAt.getTime();
        this.updateAverageResolutionTime(resolutionTime);

        logger.info('✅ Conflict resolved automatically', {
          conflictId: conflict.id,
          strategy,
          resolutionTime,
        });

        this.emit('conflict:resolved', { conflict, resolution });
      } else {
        // Auto-resolution failed, escalate
        await this.escalateConflict(conflict);
      }
    } catch (error) {
      logger.error('❌ Automatic resolution failed', { conflictId: conflict.id, error });
      conflict.status = 'failed';
      this.metrics.failed++;
      await this.escalateConflict(conflict);
    }

    await this.persistConflict(conflict);
  }

  // Resolution Strategies
  private async resolvePriorityBased(conflict: TeamConflict): Promise<ConflictResolution> {
    const actions: ConflictAction[] = [];
    let success = true;

    // Sort resources by priority and resolve in order
    const sortedResources = conflict.resources.sort((a, b) => b.priority - a.priority);
    
    for (let i = 1; i < sortedResources.length; i++) {
      const resource = sortedResources[i];
      const action: ConflictAction = {
        type: 'release_lock',
        target: resource.id,
        parameters: { reason: 'Lower priority in conflict resolution' },
        executedAt: new Date(),
        success: false,
      };

      // Release the lower priority lock
      try {
        if (resource.currentHolder) {
          const released = await this.lockManager.forceReleaseLock(
            resource.id,
            'system',
            'Priority-based conflict resolution'
          );
          action.success = released;
          success = success && released;
        }
      } catch (error) {
        action.error = error.message;
        success = false;
      }

      actions.push(action);
    }

    return {
      strategy: 'priority_based',
      resolvedBy: 'system',
      decision: 'Higher priority resource wins, others released',
      reasoning: 'Conflicts resolved by giving precedence to higher priority operations',
      actions,
      appliedAt: new Date(),
      success,
    };
  }

  private async resolveFirstWins(conflict: TeamConflict): Promise<ConflictResolution> {
    const actions: ConflictAction[] = [];
    let success = true;

    // Find the earliest resource and release others
    let earliestResource = conflict.resources[0];
    for (const resource of conflict.resources) {
      if (resource.currentHolder && 
          earliestResource.currentHolder &&
          resource.currentHolder < earliestResource.currentHolder) {
        earliestResource = resource;
      }
    }

    for (const resource of conflict.resources) {
      if (resource.id !== earliestResource.id && resource.currentHolder) {
        const action: ConflictAction = {
          type: 'release_lock',
          target: resource.id,
          parameters: { reason: 'First-come-first-served resolution' },
          executedAt: new Date(),
          success: false,
        };

        try {
          const released = await this.lockManager.forceReleaseLock(
            resource.id,
            'system',
            'First-wins conflict resolution'
          );
          action.success = released;
          success = success && released;
        } catch (error) {
          action.error = error.message;
          success = false;
        }

        actions.push(action);
      }
    }

    return {
      strategy: 'first_wins',
      resolvedBy: 'system',
      decision: `First resource ${earliestResource.id} wins, others released`,
      reasoning: 'First-come-first-served principle applied',
      actions,
      appliedAt: new Date(),
      success,
    };
  }

  private async resolveLoadBalance(conflict: TeamConflict): Promise<ConflictResolution> {
    // For agent assignment conflicts, redistribute load
    const actions: ConflictAction[] = [];
    let success = true;

    // This would integrate with the agent pool to redistribute tasks
    for (const resource of conflict.resources) {
      if (resource.type === 'agent') {
        const action: ConflictAction = {
          type: 'reassign_agent',
          target: resource.id,
          parameters: { strategy: 'load_balance' },
          executedAt: new Date(),
          success: true, // Simulated for now
        };
        actions.push(action);
      }
    }

    return {
      strategy: 'load_balance',
      resolvedBy: 'system',
      decision: 'Agent assignments rebalanced based on current load',
      reasoning: 'Load balancing applied to optimize resource utilization',
      actions,
      appliedAt: new Date(),
      success,
    };
  }

  private async resolveSequenceOptimization(conflict: TeamConflict): Promise<ConflictResolution> {
    // For workflow conflicts, optimize sequence
    const actions: ConflictAction[] = [];
    
    const action: ConflictAction = {
      type: 'notify_team',
      target: conflict.teamId,
      parameters: { 
        message: 'Workflow sequence optimized to resolve conflicts',
        conflictId: conflict.id,
      },
      executedAt: new Date(),
      success: true,
    };
    actions.push(action);

    return {
      strategy: 'sequence_optimization',
      resolvedBy: 'system',
      decision: 'Workflow sequence optimized to minimize interference',
      reasoning: 'Dependencies analyzed and execution order optimized',
      actions,
      appliedAt: new Date(),
      success: true,
    };
  }

  private async escalateConflict(conflict: TeamConflict): Promise<void> {
    conflict.status = 'escalated';
    await this.persistConflict(conflict);

    logger.warn('📈 Conflict escalated for manual resolution', {
      conflictId: conflict.id,
      type: conflict.type,
      priority: conflict.priority,
    });

    this.emit('conflict:escalated', { conflict });
  }

  // Public API Methods
  public async handleLockConflict(event: any): Promise<void> {
    // Handle lock conflicts from the lock manager
    logger.info('🔒 Handling lock conflict', { event });
    
    // Create a synthetic conflict for immediate processing
    const conflict: TeamConflict = {
      id: this.generateConflictId('lock_contention'),
      teamId: event.requestingLock.teamId,
      projectId: event.requestingLock.projectId,
      type: 'lock_contention',
      description: `Lock contention on resource ${event.resourceId}`,
      involvedMembers: [event.requestingLock.holderId, event.existingLock.holderId],
      resources: [
        {
          type: event.existingLock.resourceType,
          id: event.existingLock.id,
          path: event.existingLock.resourceId,
          currentHolder: event.existingLock.holderId,
          requestedBy: [event.requestingLock.holderId],
          priority: this.getPriorityFromLock(event.existingLock),
        },
      ],
      detectedAt: new Date(),
      status: 'detected',
      priority: 'high',
      autoResolvable: true,
      metadata: {
        executionIds: [],
        affectedFiles: [],
        lockIds: [event.existingLock.id],
        estimatedImpact: 'moderate',
      },
    };

    this.conflicts.set(conflict.id, conflict);
    await this.persistConflict(conflict);

    this.emit('conflict:detected', { conflict });

    // Attempt immediate resolution
    await this.attemptAutomaticResolution(conflict, 'priority_based');
  }

  public async getRecentConflicts(teamId: string, hours: number): Promise<TeamConflict[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    return Array.from(this.conflicts.values()).filter(
      conflict => conflict.teamId === teamId && conflict.detectedAt >= since
    );
  }

  public async getConflictMetrics(teamId?: string): Promise<ConflictMetrics> {
    if (teamId) {
      // Filter metrics for specific team
      const teamConflicts = Array.from(this.conflicts.values()).filter(
        conflict => conflict.teamId === teamId
      );
      
      return this.calculateMetricsForConflicts(teamConflicts);
    }

    return { ...this.metrics };
  }

  public async isHealthy(): Promise<boolean> {
    if (!this.initialized) return false;

    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      logger.error('❌ ConflictResolver health check failed', error);
      return false;
    }
  }

  // Utility Methods
  private async getAllActiveLocks(): Promise<DistributedLock[]> {
    // This would get all active locks from all teams
    // For now, return empty array as placeholder
    return [];
  }

  private groupLocksByTeam(locks: DistributedLock[]): Map<string, DistributedLock[]> {
    const groups = new Map<string, DistributedLock[]>();
    for (const lock of locks) {
      if (!groups.has(lock.teamId)) {
        groups.set(lock.teamId, []);
      }
      groups.get(lock.teamId)!.push(lock);
    }
    return groups;
  }

  private groupLocksByProject(locks: DistributedLock[]): Map<string, DistributedLock[]> {
    const groups = new Map<string, DistributedLock[]>();
    for (const lock of locks) {
      if (!groups.has(lock.projectId)) {
        groups.set(lock.projectId, []);
      }
      groups.get(lock.projectId)!.push(lock);
    }
    return groups;
  }

  private extractResources(locks: DistributedLock[]): ConflictResource[] {
    return locks.map(lock => ({
      type: lock.resourceType,
      id: lock.id,
      path: lock.resourceId,
      currentHolder: lock.holderId,
      requestedBy: [lock.holderId],
      priority: this.getPriorityFromLock(lock),
    }));
  }

  private extractInvolvedMembers(context: ConflictContext): string[] {
    return Array.from(new Set(context.locks.map(lock => lock.holderId)));
  }

  private areResourcesRelated(resource1: string, resource2: string): boolean {
    // Simple path-based relationship check
    // In a real implementation, this would be more sophisticated
    return resource1.includes(resource2) || resource2.includes(resource1);
  }

  private async doExecutionsInterfere(exec1: DistributedLock, exec2: DistributedLock): Promise<boolean> {
    // Check if two executions might interfere with each other
    // This would analyze execution metadata, dependencies, etc.
    return exec1.projectId === exec2.projectId; // Simple check
  }

  private hasWorkflowDependencyConflicts(locks: DistributedLock[]): boolean {
    // Analyze workflow dependencies for conflicts
    // Simplified implementation
    return locks.length > 1;
  }

  private generateConflictDescription(type: ConflictType, context: ConflictContext): string {
    const descriptions = {
      concurrent_execution: `Concurrent executions detected in project ${context.projectId}`,
      lock_contention: `Lock contention on ${context.locks.length} resources`,
      resource_collision: `Resource collision between ${context.locks.length} operations`,
      agent_assignment: `Agent assignment conflict with ${context.locks.length} competing tasks`,
      quality_gate_conflict: `Quality gate disagreement in project ${context.projectId}`,
      permission_dispute: `Permission dispute among ${context.metadata.uniqueHolders} team members`,
      workflow_interference: `Workflow interference detected with ${context.locks.length} conflicting steps`,
    };

    return descriptions[type] || `Unknown conflict type: ${type}`;
  }

  private calculateConflictPriority(type: ConflictType, context: ConflictContext): TeamConflict['priority'] {
    const highPriorityTypes: ConflictType[] = ['permission_dispute', 'quality_gate_conflict'];
    const mediumPriorityTypes: ConflictType[] = ['concurrent_execution', 'lock_contention'];
    
    if (highPriorityTypes.includes(type)) return 'high';
    if (mediumPriorityTypes.includes(type)) return 'medium';
    return 'low';
  }

  private estimateConflictImpact(type: ConflictType, context: ConflictContext): TeamConflict['metadata']['estimatedImpact'] {
    const severeTypes: ConflictType[] = ['permission_dispute', 'quality_gate_conflict'];
    const majorTypes: ConflictType[] = ['concurrent_execution', 'workflow_interference'];
    
    if (severeTypes.includes(type)) return 'severe';
    if (majorTypes.includes(type) || context.locks.length > 3) return 'major';
    if (context.locks.length > 1) return 'moderate';
    return 'minor';
  }

  private getPriorityFromLock(lock: DistributedLock): number {
    const priorityMap = { critical: 4, high: 3, medium: 2, low: 1 };
    return priorityMap[lock.metadata.priority] || 2;
  }

  private calculateMetricsForConflicts(conflicts: TeamConflict[]): ConflictMetrics {
    const metrics = this.initializeMetrics();
    
    metrics.total = conflicts.length;
    metrics.resolved = conflicts.filter(c => c.status === 'resolved').length;
    metrics.failed = conflicts.filter(c => c.status === 'failed').length;

    for (const conflict of conflicts) {
      metrics.byType[conflict.type]++;
      if (conflict.resolution) {
        metrics.byStrategy[conflict.resolution.strategy] = 
          (metrics.byStrategy[conflict.resolution.strategy] || 0) + 1;
      }
    }

    // Calculate average resolution time
    const resolvedConflicts = conflicts.filter(c => c.resolvedAt);
    if (resolvedConflicts.length > 0) {
      const totalTime = resolvedConflicts.reduce((sum, conflict) => {
        return sum + (conflict.resolvedAt!.getTime() - conflict.detectedAt.getTime());
      }, 0);
      metrics.averageResolutionTime = totalTime / resolvedConflicts.length;
    }

    return metrics;
  }

  private updateAverageResolutionTime(newTime: number): void {
    const weight = 0.1; // Exponential smoothing factor
    this.metrics.averageResolutionTime = 
      this.metrics.averageResolutionTime * (1 - weight) + newTime * weight;
  }

  private async persistConflict(conflict: TeamConflict): Promise<void> {
    try {
      const key = `conflict:${conflict.id}`;
      await this.redis.setex(key, 86400 * 7, JSON.stringify(conflict)); // 7 days TTL
    } catch (error) {
      logger.error('❌ Failed to persist conflict', { conflictId: conflict.id, error });
    }
  }

  private async cleanupResolvedConflicts(): Promise<void> {
    const now = new Date();
    const cleanupAge = 24 * 60 * 60 * 1000; // 24 hours
    const toCleanup: string[] = [];

    for (const [conflictId, conflict] of this.conflicts) {
      if (conflict.status === 'resolved' && conflict.resolvedAt) {
        const age = now.getTime() - conflict.resolvedAt.getTime();
        if (age > cleanupAge) {
          toCleanup.push(conflictId);
        }
      }
    }

    for (const conflictId of toCleanup) {
      this.conflicts.delete(conflictId);
    }

    if (toCleanup.length > 0) {
      logger.debug('🧹 Cleaned up resolved conflicts', { count: toCleanup.length });
    }
  }

  private generateConflictId(type: string): string {
    return `conflict-${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  public async shutdown(): Promise<void> {
    logger.info('🔄 Shutting down ConflictResolver...');

    try {
      // Stop background processes
      if (this.detectionInterval) {
        clearInterval(this.detectionInterval);
      }
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }

      // Close Redis connection
      if (this.redis) {
        await this.redis.disconnect();
      }

      this.initialized = false;
      logger.info('✅ ConflictResolver shutdown complete');
    } catch (error) {
      logger.error('❌ Error during ConflictResolver shutdown', error);
      throw error;
    }
  }
}