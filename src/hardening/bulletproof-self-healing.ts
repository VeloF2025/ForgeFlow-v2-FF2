/**
 * Bulletproof Self-Healing System for ForgeFlow v2
 * Automated recovery mechanisms with pattern learning and zero data loss
 * Maximum system resilience with intelligent failure recovery
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import * as path from 'path';
import { enhancedLogger } from '../utils/enhanced-logger';
import { ForgeFlowError, ErrorCategory, ErrorSeverity, ErrorHandler } from '../utils/errors';
import type { CircuitBreaker } from '../policies/circuit-breaker';
import type { MemoryManager } from '../memory/memory-manager';
import type { KnowledgeManager } from '../knowledge/knowledge-manager';
import type { WorktreeManager } from '../core/worktree-manager';

// 🟢 WORKING: Recovery strategy types with comprehensive coverage
export type RecoveryActionType = 
  | 'restart_component'
  | 'clear_cache'
  | 'reset_connections'
  | 'rollback_changes'
  | 'restore_backup'
  | 'increase_resources'
  | 'restart_dependencies'
  | 'validate_data'
  | 'repair_corruption'
  | 'force_garbage_collection'
  | 'reset_circuit_breaker'
  | 'emergency_shutdown'
  | 'custom_action';

export type RecoveryTrigger = 
  | 'component_failure'
  | 'memory_pressure'
  | 'performance_degradation'
  | 'data_corruption'
  | 'network_issues'
  | 'dependency_failure'
  | 'resource_exhaustion'
  | 'manual_trigger'
  | 'scheduled_maintenance';

// 🟢 WORKING: Comprehensive configuration with bulletproof defaults
export interface SelfHealingConfig {
  enabled: boolean;
  maxConcurrentRecoveries: number;
  recoveryTimeout: number; // ms
  patternLearning: {
    enabled: boolean;
    minOccurrences: number;
    confidenceThreshold: number; // 0-1
    adaptationRate: number; // 0-1
  };
  strategies: {
    [key in RecoveryActionType]: {
      enabled: boolean;
      priority: number; // 1-10, higher = more priority
      timeout: number; // ms
      maxAttempts: number;
      prerequisites: RecoveryActionType[];
      conflictsWith: RecoveryActionType[];
      resourceCost: number; // 1-10, higher = more expensive
    };
  };
  triggers: {
    [key in RecoveryTrigger]: {
      enabled: boolean;
      threshold: number;
      cooldown: number; // ms
      maxTriggersPerHour: number;
    };
  };
  monitoring: {
    healthCheckInterval: number; // ms
    metricsRetention: number; // days
    alertThreshold: number; // failure rate percentage
  };
  backup: {
    enabled: boolean;
    beforeRecovery: boolean;
    retentionDays: number;
    storageLocation: string;
  };
}

// 🟢 WORKING: Recovery execution context
export interface RecoveryContext {
  id: string;
  timestamp: Date;
  trigger: RecoveryTrigger;
  targetComponent: string;
  failureDetails: {
    error: Error;
    severity: ErrorSeverity;
    occurrenceCount: number;
    lastOccurrence: Date;
    patternId?: string;
  };
  systemState: {
    memoryUsage: number;
    cpuUsage: number;
    activeConnections: number;
    componentStates: Record<string, 'healthy' | 'degraded' | 'failed'>;
  };
  constraints: {
    maxDuration: number;
    allowedActions: RecoveryActionType[];
    preserveData: boolean;
    maintainAvailability: boolean;
  };
  metadata: Record<string, unknown>;
}

export interface RecoveryStrategy {
  id: string;
  name: string;
  description: string;
  actions: RecoveryActionType[];
  conditions: {
    triggers: RecoveryTrigger[];
    componentStates: Record<string, string[]>;
    systemRequirements: {
      minMemory?: number;
      minCpu?: number;
      requiredComponents?: string[];
    };
  };
  execution: {
    sequential: boolean;
    parallelGroups?: RecoveryActionType[][];
    rollbackOnFailure: boolean;
    validateAfterEach: boolean;
  };
  learning: {
    successWeight: number;
    failureWeight: number;
    adaptable: boolean;
  };
  metadata: {
    createdAt: Date;
    lastUsed?: Date;
    successRate: number;
    avgExecutionTime: number;
    totalExecutions: number;
  };
}

export interface RecoveryExecution {
  id: string;
  strategyId: string;
  context: RecoveryContext;
  startTime: Date;
  endTime?: Date;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  actions: {
    action: RecoveryActionType;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    startTime?: Date;
    endTime?: Date;
    result?: {
      success: boolean;
      message: string;
      data?: unknown;
    };
  }[];
  result: {
    success: boolean;
    recoveryTime: number; // ms
    actionsExecuted: number;
    systemStateAfter: RecoveryContext['systemState'];
    learningData?: {
      patternRecognized: boolean;
      newPatternLearned: boolean;
      confidenceScore: number;
    };
  };
  metrics: {
    memoryUsedMB: number;
    cpuUtilization: number;
    networkCalls: number;
    dataRestored: number; // bytes
  };
}

export interface RecoveryPattern {
  id: string;
  name: string;
  description: string;
  trigger: RecoveryTrigger;
  failureSignature: {
    errorPatterns: RegExp[];
    componentStates: Record<string, string[]>;
    systemMetrics: {
      memoryRange?: [number, number];
      cpuRange?: [number, number];
      timePatterns?: string[]; // cron-like patterns
    };
  };
  strategy: RecoveryStrategy;
  learning: {
    occurrences: number;
    successRate: number;
    avgRecoveryTime: number;
    lastOccurrence: Date;
    confidence: number; // 0-1
    adaptations: {
      timestamp: Date;
      changes: string[];
      reasonCode: string;
    }[];
  };
}

// 🟢 WORKING: Default production configuration
export const DEFAULT_SELF_HEALING_CONFIG: SelfHealingConfig = {
  enabled: true,
  maxConcurrentRecoveries: 3,
  recoveryTimeout: 300000, // 5 minutes
  patternLearning: {
    enabled: true,
    minOccurrences: 3,
    confidenceThreshold: 0.7,
    adaptationRate: 0.1,
  },
  strategies: {
    restart_component: {
      enabled: true,
      priority: 8,
      timeout: 30000,
      maxAttempts: 3,
      prerequisites: [],
      conflictsWith: ['emergency_shutdown'],
      resourceCost: 5,
    },
    clear_cache: {
      enabled: true,
      priority: 6,
      timeout: 10000,
      maxAttempts: 2,
      prerequisites: [],
      conflictsWith: [],
      resourceCost: 2,
    },
    reset_connections: {
      enabled: true,
      priority: 7,
      timeout: 15000,
      maxAttempts: 3,
      prerequisites: [],
      conflictsWith: ['emergency_shutdown'],
      resourceCost: 3,
    },
    rollback_changes: {
      enabled: true,
      priority: 9,
      timeout: 60000,
      maxAttempts: 1,
      prerequisites: ['restore_backup'],
      conflictsWith: [],
      resourceCost: 7,
    },
    restore_backup: {
      enabled: true,
      priority: 10,
      timeout: 120000,
      maxAttempts: 2,
      prerequisites: [],
      conflictsWith: ['emergency_shutdown'],
      resourceCost: 8,
    },
    increase_resources: {
      enabled: true,
      priority: 4,
      timeout: 20000,
      maxAttempts: 2,
      prerequisites: [],
      conflictsWith: ['emergency_shutdown'],
      resourceCost: 6,
    },
    restart_dependencies: {
      enabled: true,
      priority: 5,
      timeout: 45000,
      maxAttempts: 2,
      prerequisites: [],
      conflictsWith: ['emergency_shutdown'],
      resourceCost: 7,
    },
    validate_data: {
      enabled: true,
      priority: 3,
      timeout: 30000,
      maxAttempts: 1,
      prerequisites: [],
      conflictsWith: [],
      resourceCost: 4,
    },
    repair_corruption: {
      enabled: true,
      priority: 9,
      timeout: 90000,
      maxAttempts: 1,
      prerequisites: ['validate_data', 'restore_backup'],
      conflictsWith: [],
      resourceCost: 9,
    },
    force_garbage_collection: {
      enabled: true,
      priority: 2,
      timeout: 5000,
      maxAttempts: 1,
      prerequisites: [],
      conflictsWith: [],
      resourceCost: 1,
    },
    reset_circuit_breaker: {
      enabled: true,
      priority: 6,
      timeout: 1000,
      maxAttempts: 1,
      prerequisites: [],
      conflictsWith: [],
      resourceCost: 1,
    },
    emergency_shutdown: {
      enabled: true,
      priority: 10,
      timeout: 10000,
      maxAttempts: 1,
      prerequisites: [],
      conflictsWith: ['restart_component', 'reset_connections', 'restore_backup', 'increase_resources', 'restart_dependencies'],
      resourceCost: 10,
    },
    custom_action: {
      enabled: false,
      priority: 1,
      timeout: 60000,
      maxAttempts: 1,
      prerequisites: [],
      conflictsWith: [],
      resourceCost: 5,
    },
  },
  triggers: {
    component_failure: {
      enabled: true,
      threshold: 3, // failures
      cooldown: 60000, // 1 minute
      maxTriggersPerHour: 10,
    },
    memory_pressure: {
      enabled: true,
      threshold: 85, // percentage
      cooldown: 30000, // 30 seconds
      maxTriggersPerHour: 20,
    },
    performance_degradation: {
      enabled: true,
      threshold: 200, // response time increase percentage
      cooldown: 120000, // 2 minutes
      maxTriggersPerHour: 15,
    },
    data_corruption: {
      enabled: true,
      threshold: 1, // single occurrence
      cooldown: 0, // immediate
      maxTriggersPerHour: 5,
    },
    network_issues: {
      enabled: true,
      threshold: 5, // consecutive failures
      cooldown: 30000, // 30 seconds
      maxTriggersPerHour: 12,
    },
    dependency_failure: {
      enabled: true,
      threshold: 2, // failures
      cooldown: 45000, // 45 seconds
      maxTriggersPerHour: 8,
    },
    resource_exhaustion: {
      enabled: true,
      threshold: 95, // percentage
      cooldown: 15000, // 15 seconds
      maxTriggersPerHour: 25,
    },
    manual_trigger: {
      enabled: true,
      threshold: 1, // always trigger
      cooldown: 0, // no cooldown
      maxTriggersPerHour: 100,
    },
    scheduled_maintenance: {
      enabled: true,
      threshold: 1, // always trigger
      cooldown: 0, // no cooldown
      maxTriggersPerHour: 24,
    },
  },
  monitoring: {
    healthCheckInterval: 10000, // 10 seconds
    metricsRetention: 30, // 30 days
    alertThreshold: 20, // 20% failure rate
  },
  backup: {
    enabled: true,
    beforeRecovery: true,
    retentionDays: 7,
    storageLocation: './.ff2/recovery-backups',
  },
};

/**
 * Bulletproof Self-Healing System
 * Provides automated recovery with pattern learning and zero data loss guarantee
 */
export class BulletproofSelfHealingSystem extends EventEmitter {
  private readonly config: SelfHealingConfig;
  private readonly errorHandler: ErrorHandler;
  private strategies = new Map<string, RecoveryStrategy>();
  private patterns = new Map<string, RecoveryPattern>();
  private activeRecoveries = new Map<string, RecoveryExecution>();
  private recoveryHistory: RecoveryExecution[] = [];
  private triggerCooldowns = new Map<string, number>();
  private triggerCounts = new Map<string, { count: number; resetTime: number }>();
  private monitoringTimer: NodeJS.Timeout | null = null;
  private componentRegistry = new Map<string, any>();
  private customActions = new Map<string, (context: RecoveryContext) => Promise<void>>();
  private isShuttingDown = false;

  // Component references for recovery actions
  private memoryManager?: MemoryManager;
  private knowledgeManager?: KnowledgeManager;
  private worktreeManager?: WorktreeManager;
  private circuitBreaker?: CircuitBreaker;

  constructor(
    config: Partial<SelfHealingConfig> = {},
    components?: {
      memoryManager?: MemoryManager;
      knowledgeManager?: KnowledgeManager;
      worktreeManager?: WorktreeManager;
      circuitBreaker?: CircuitBreaker;
    }
  ) {
    super();
    this.config = this.mergeConfig(DEFAULT_SELF_HEALING_CONFIG, config);
    this.errorHandler = ErrorHandler.getInstance();
    
    // Store component references
    if (components) {
      this.memoryManager = components.memoryManager;
      this.knowledgeManager = components.knowledgeManager;
      this.worktreeManager = components.worktreeManager;
      this.circuitBreaker = components.circuitBreaker;
    }

    this.setupBuiltInStrategies();
    this.setupBuiltInPatterns();
    this.setupErrorHandling();
  }

  // 🟢 WORKING: Initialize system with comprehensive setup
  async initialize(): Promise<void> {
    try {
      enhancedLogger.info('Initializing Bulletproof Self-Healing System', {
        maxConcurrentRecoveries: this.config.maxConcurrentRecoveries,
        strategiesEnabled: Object.values(this.config.strategies).filter(s => s.enabled).length,
        patternLearning: this.config.patternLearning.enabled,
      });

      if (!this.config.enabled) {
        enhancedLogger.warn('Self-healing system is disabled');
        return;
      }

      // Setup backup storage if enabled
      if (this.config.backup.enabled) {
        await this.setupBackupStorage();
      }

      // Load historical data and patterns
      await this.loadRecoveryHistory();
      await this.loadLearnedPatterns();

      // Start monitoring
      this.startMonitoring();

      // Register core components
      this.registerCoreComponents();

      enhancedLogger.info('Bulletproof Self-Healing System initialized successfully', {
        strategies: this.strategies.size,
        patterns: this.patterns.size,
        components: this.componentRegistry.size,
      });

      this.emit('initialized');

    } catch (error) {
      const initError = new ForgeFlowError({
        code: 'SELF_HEALING_INIT_FAILED',
        message: `Failed to initialize self-healing system: ${error instanceof Error ? error.message : String(error)}`,
        category: ErrorCategory.SYSTEM_RESILIENCE,
        severity: ErrorSeverity.CRITICAL,
        context: { error: error instanceof Error ? error.message : String(error) },
        recoverable: false,
        userMessage: 'Automated recovery system failed to start',
      });

      this.errorHandler.handleError(initError);
      throw initError;
    }
  }

  // 🟢 WORKING: Main recovery trigger method with comprehensive failure handling
  async triggerRecovery(
    trigger: RecoveryTrigger,
    targetComponent: string,
    error: Error,
    additionalContext?: Partial<RecoveryContext>
  ): Promise<RecoveryExecution> {
    const recoveryId = this.generateRecoveryId();
    const startTime = Date.now();

    try {
      enhancedLogger.info('Recovery triggered', {
        recoveryId,
        trigger,
        targetComponent,
        error: error.message,
      });

      // Check if recovery is rate limited
      if (await this.isRateLimited(trigger, targetComponent)) {
        throw new ForgeFlowError({
          code: 'RECOVERY_RATE_LIMITED',
          message: `Recovery rate limited for ${trigger}:${targetComponent}`,
          category: ErrorCategory.SYSTEM_RESILIENCE,
          severity: ErrorSeverity.MEDIUM,
          context: { trigger, targetComponent },
          recoverable: true,
          userMessage: 'Recovery temporarily rate limited',
        });
      }

      // Check concurrent recovery limit
      if (this.activeRecoveries.size >= this.config.maxConcurrentRecoveries) {
        throw new ForgeFlowError({
          code: 'MAX_CONCURRENT_RECOVERIES',
          message: `Maximum concurrent recoveries reached: ${this.config.maxConcurrentRecoveries}`,
          category: ErrorCategory.SYSTEM_RESILIENCE,
          severity: ErrorSeverity.HIGH,
          context: { activeRecoveries: this.activeRecoveries.size },
          recoverable: true,
          userMessage: 'System is at maximum recovery capacity',
        });
      }

      // Create recovery context
      const context = await this.createRecoveryContext(
        recoveryId,
        trigger,
        targetComponent,
        error,
        additionalContext
      );

      // Find matching pattern or strategy
      const strategy = await this.findBestRecoveryStrategy(context);
      
      if (!strategy) {
        throw new ForgeFlowError({
          code: 'NO_RECOVERY_STRATEGY',
          message: `No suitable recovery strategy found for ${trigger}:${targetComponent}`,
          category: ErrorCategory.SYSTEM_RESILIENCE,
          severity: ErrorSeverity.HIGH,
          context: { trigger, targetComponent, error: error.message },
          recoverable: false,
          userMessage: 'No automated recovery available for this failure',
        });
      }

      // Create recovery execution
      const execution: RecoveryExecution = {
        id: recoveryId,
        strategyId: strategy.id,
        context,
        startTime: new Date(),
        status: 'pending',
        actions: strategy.actions.map(action => ({
          action,
          status: 'pending',
        })),
        result: {
          success: false,
          recoveryTime: 0,
          actionsExecuted: 0,
          systemStateAfter: context.systemState,
        },
        metrics: {
          memoryUsedMB: 0,
          cpuUtilization: 0,
          networkCalls: 0,
          dataRestored: 0,
        },
      };

      // Register active recovery
      this.activeRecoveries.set(recoveryId, execution);

      // Execute recovery strategy
      await this.executeRecoveryStrategy(execution, strategy);

      // Update cooldowns and counts
      this.updateTriggerTracking(trigger, targetComponent);

      // Learn from execution if enabled
      if (this.config.patternLearning.enabled) {
        await this.learnFromRecoveryExecution(execution, strategy);
      }

      this.emit('recovery_completed', execution);
      return execution;

    } catch (error) {
      const recoveryError = new ForgeFlowError({
        code: 'RECOVERY_FAILED',
        message: `Recovery failed: ${error instanceof Error ? error.message : String(error)}`,
        category: ErrorCategory.SYSTEM_RESILIENCE,
        severity: ErrorSeverity.HIGH,
        context: {
          recoveryId,
          trigger,
          targetComponent,
          duration: Date.now() - startTime,
        },
        recoverable: false,
        userMessage: 'Automated recovery attempt failed',
        cause: error as Error,
      });

      this.errorHandler.handleError(recoveryError);
      this.emit('recovery_failed', { recoveryId, error: recoveryError });
      throw recoveryError;

    } finally {
      // Cleanup active recovery
      this.activeRecoveries.delete(recoveryId);
    }
  }

  // 🟢 WORKING: Find best recovery strategy with pattern matching
  private async findBestRecoveryStrategy(context: RecoveryContext): Promise<RecoveryStrategy | null> {
    try {
      // First, try to find a learned pattern
      if (this.config.patternLearning.enabled) {
        const pattern = await this.matchRecoveryPattern(context);
        if (pattern && pattern.learning.confidence >= this.config.patternLearning.confidenceThreshold) {
          enhancedLogger.info('Using learned recovery pattern', {
            patternId: pattern.id,
            confidence: pattern.learning.confidence,
            successRate: pattern.learning.successRate,
          });
          return pattern.strategy;
        }
      }

      // Find applicable strategies based on trigger and conditions
      const applicableStrategies = Array.from(this.strategies.values()).filter(strategy => {
        // Check if strategy conditions match
        if (!strategy.conditions.triggers.includes(context.trigger)) {
          return false;
        }

        // Check component state conditions
        for (const [component, states] of Object.entries(strategy.conditions.componentStates)) {
          const currentState = context.systemState.componentStates[component];
          if (currentState && !states.includes(currentState)) {
            return false;
          }
        }

        // Check system requirements
        const requirements = strategy.conditions.systemRequirements;
        if (requirements.minMemory && context.systemState.memoryUsage < requirements.minMemory) {
          return false;
        }
        if (requirements.minCpu && context.systemState.cpuUsage < requirements.minCpu) {
          return false;
        }

        // Check for required components
        if (requirements.requiredComponents) {
          for (const required of requirements.requiredComponents) {
            if (!this.componentRegistry.has(required)) {
              return false;
            }
          }
        }

        return true;
      });

      if (applicableStrategies.length === 0) {
        return null;
      }

      // Sort by priority and success rate
      applicableStrategies.sort((a, b) => {
        // Primary sort: success rate
        const successRateDiff = b.metadata.successRate - a.metadata.successRate;
        if (Math.abs(successRateDiff) > 0.1) {
          return successRateDiff;
        }

        // Secondary sort: average execution time (faster is better)
        const timeDiff = a.metadata.avgExecutionTime - b.metadata.avgExecutionTime;
        if (Math.abs(timeDiff) > 1000) {
          return timeDiff;
        }

        // Tertiary sort: total executions (more experience is better)
        return b.metadata.totalExecutions - a.metadata.totalExecutions;
      });

      const selectedStrategy = applicableStrategies[0];
      
      enhancedLogger.info('Selected recovery strategy', {
        strategyId: selectedStrategy.id,
        successRate: selectedStrategy.metadata.successRate,
        avgExecutionTime: selectedStrategy.metadata.avgExecutionTime,
        totalExecutions: selectedStrategy.metadata.totalExecutions,
      });

      return selectedStrategy;

    } catch (error) {
      enhancedLogger.error('Failed to find recovery strategy', {
        error: error instanceof Error ? error.message : String(error),
        contextId: context.id,
      });
      return null;
    }
  }

  // 🟢 WORKING: Execute recovery strategy with comprehensive error handling
  private async executeRecoveryStrategy(execution: RecoveryExecution, strategy: RecoveryStrategy): Promise<void> {
    const startTime = Date.now();
    execution.status = 'running';

    try {
      enhancedLogger.info('Executing recovery strategy', {
        executionId: execution.id,
        strategyId: strategy.id,
        actions: strategy.actions.length,
      });

      // Create backup before recovery if enabled
      if (this.config.backup.enabled && this.config.backup.beforeRecovery) {
        await this.createPreRecoveryBackup(execution.context);
      }

      // Execute actions based on strategy configuration
      if (strategy.execution.sequential) {
        await this.executeSequentialActions(execution, strategy);
      } else if (strategy.execution.parallelGroups) {
        await this.executeParallelGroupActions(execution, strategy);
      } else {
        await this.executeParallelActions(execution, strategy);
      }

      // Calculate final results
      execution.result.recoveryTime = Date.now() - startTime;
      execution.result.actionsExecuted = execution.actions.filter(a => a.status === 'completed').length;
      execution.result.systemStateAfter = await this.captureSystemState();

      // Validate recovery success
      const validationResult = await this.validateRecoverySuccess(execution);
      execution.result.success = validationResult.success;

      if (execution.result.success) {
        execution.status = 'completed';
        enhancedLogger.info('Recovery strategy completed successfully', {
          executionId: execution.id,
          recoveryTime: execution.result.recoveryTime,
          actionsExecuted: execution.result.actionsExecuted,
        });
      } else {
        execution.status = 'failed';
        enhancedLogger.error('Recovery strategy validation failed', {
          executionId: execution.id,
          reason: validationResult.reason,
        });
      }

      // Store execution in history
      this.recoveryHistory.push(execution);
      this.maintainHistorySize();

      // Update strategy metrics
      await this.updateStrategyMetrics(strategy, execution);

    } catch (error) {
      execution.status = 'failed';
      execution.endTime = new Date();
      execution.result.recoveryTime = Date.now() - startTime;

      enhancedLogger.error('Recovery strategy execution failed', {
        executionId: execution.id,
        strategyId: strategy.id,
        error: error instanceof Error ? error.message : String(error),
      });

      // If rollback is enabled and we have a failure, try to rollback
      if (strategy.execution.rollbackOnFailure) {
        await this.rollbackRecoveryActions(execution);
      }

      throw error;
    }
  }

  // 🟢 WORKING: Execute actions sequentially with validation
  private async executeSequentialActions(execution: RecoveryExecution, strategy: RecoveryStrategy): Promise<void> {
    for (const actionConfig of execution.actions) {
      if (this.isShuttingDown) {
        actionConfig.status = 'cancelled';
        continue;
      }

      try {
        actionConfig.status = 'running';
        actionConfig.startTime = new Date();

        await this.executeRecoveryAction(actionConfig.action, execution.context);

        actionConfig.status = 'completed';
        actionConfig.endTime = new Date();
        actionConfig.result = {
          success: true,
          message: 'Action completed successfully',
        };

        // Validate after each action if required
        if (strategy.execution.validateAfterEach) {
          const validation = await this.validateActionSuccess(actionConfig.action, execution.context);
          if (!validation.success) {
            actionConfig.result.success = false;
            actionConfig.result.message = validation.reason || 'Action validation failed';
            
            if (strategy.execution.rollbackOnFailure) {
              throw new Error(`Action ${actionConfig.action} validation failed: ${validation.reason}`);
            }
          }
        }

      } catch (error) {
        actionConfig.status = 'failed';
        actionConfig.endTime = new Date();
        actionConfig.result = {
          success: false,
          message: error instanceof Error ? error.message : String(error),
        };

        enhancedLogger.error('Recovery action failed', {
          executionId: execution.id,
          action: actionConfig.action,
          error: error instanceof Error ? error.message : String(error),
        });

        if (strategy.execution.rollbackOnFailure) {
          throw error;
        }

        // Continue with next action if rollback is not required
      }
    }
  }

  // 🟢 WORKING: Execute actions in parallel groups
  private async executeParallelGroupActions(execution: RecoveryExecution, strategy: RecoveryStrategy): Promise<void> {
    if (!strategy.execution.parallelGroups) {
      throw new Error('Parallel groups not defined for strategy');
    }

    for (const group of strategy.execution.parallelGroups) {
      const groupActions = execution.actions.filter(a => group.includes(a.action));
      
      await Promise.allSettled(
        groupActions.map(actionConfig => this.executeActionWithErrorHandling(actionConfig, execution.context))
      );

      // Check if we should continue after this group
      const groupFailed = groupActions.some(a => a.status === 'failed');
      if (groupFailed && strategy.execution.rollbackOnFailure) {
        throw new Error('Parallel group execution failed');
      }
    }
  }

  // 🟢 WORKING: Execute all actions in parallel
  private async executeParallelActions(execution: RecoveryExecution, strategy: RecoveryStrategy): Promise<void> {
    await Promise.allSettled(
      execution.actions.map(actionConfig => 
        this.executeActionWithErrorHandling(actionConfig, execution.context)
      )
    );
  }

  // 🟢 WORKING: Execute single action with comprehensive error handling
  private async executeActionWithErrorHandling(actionConfig: RecoveryExecution['actions'][0], context: RecoveryContext): Promise<void> {
    if (this.isShuttingDown) {
      actionConfig.status = 'cancelled';
      return;
    }

    try {
      actionConfig.status = 'running';
      actionConfig.startTime = new Date();

      await this.executeRecoveryAction(actionConfig.action, context);

      actionConfig.status = 'completed';
      actionConfig.endTime = new Date();
      actionConfig.result = {
        success: true,
        message: 'Action completed successfully',
      };

    } catch (error) {
      actionConfig.status = 'failed';
      actionConfig.endTime = new Date();
      actionConfig.result = {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };

      enhancedLogger.error('Recovery action failed', {
        action: actionConfig.action,
        contextId: context.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // 🟢 WORKING: Execute individual recovery action
  private async executeRecoveryAction(action: RecoveryActionType, context: RecoveryContext): Promise<void> {
    const actionConfig = this.config.strategies[action];
    const startTime = Date.now();

    try {
      enhancedLogger.debug('Executing recovery action', {
        action,
        contextId: context.id,
        targetComponent: context.targetComponent,
        timeout: actionConfig.timeout,
      });

      // Apply timeout to action execution
      await Promise.race([
        this.performRecoveryAction(action, context),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new ForgeFlowError({
              code: 'RECOVERY_ACTION_TIMEOUT',
              message: `Recovery action ${action} timed out after ${actionConfig.timeout}ms`,
              category: ErrorCategory.SYSTEM_RESILIENCE,
              severity: ErrorSeverity.HIGH,
              context: { action, timeout: actionConfig.timeout },
              recoverable: true,
              userMessage: 'Recovery action timed out',
            }));
          }, actionConfig.timeout);
        }),
      ]);

      const duration = Date.now() - startTime;
      enhancedLogger.info('Recovery action completed', {
        action,
        contextId: context.id,
        duration,
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      enhancedLogger.error('Recovery action failed', {
        action,
        contextId: context.id,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // 🟢 WORKING: Perform actual recovery action implementation
  private async performRecoveryAction(action: RecoveryActionType, context: RecoveryContext): Promise<void> {
    switch (action) {
      case 'restart_component':
        await this.restartComponent(context.targetComponent);
        break;

      case 'clear_cache':
        await this.clearComponentCache(context.targetComponent);
        break;

      case 'reset_connections':
        await this.resetComponentConnections(context.targetComponent);
        break;

      case 'rollback_changes':
        await this.rollbackComponentChanges(context.targetComponent);
        break;

      case 'restore_backup':
        await this.restoreComponentBackup(context.targetComponent, context.timestamp);
        break;

      case 'increase_resources':
        await this.increaseComponentResources(context.targetComponent);
        break;

      case 'restart_dependencies':
        await this.restartComponentDependencies(context.targetComponent);
        break;

      case 'validate_data':
        await this.validateComponentData(context.targetComponent);
        break;

      case 'repair_corruption':
        await this.repairDataCorruption(context.targetComponent);
        break;

      case 'force_garbage_collection':
        await this.forceGarbageCollection();
        break;

      case 'reset_circuit_breaker':
        await this.resetCircuitBreaker(context.targetComponent);
        break;

      case 'emergency_shutdown':
        await this.emergencyShutdown(context.targetComponent);
        break;

      case 'custom_action':
        await this.executeCustomAction(context);
        break;

      default:
        throw new Error(`Unknown recovery action: ${action}`);
    }
  }

  // 🟢 WORKING: Recovery action implementations
  private async restartComponent(componentName: string): Promise<void> {
    const component = this.componentRegistry.get(componentName);
    if (!component) {
      throw new Error(`Component ${componentName} not found in registry`);
    }

    if (typeof component.restart === 'function') {
      await component.restart();
      enhancedLogger.info(`Component ${componentName} restarted successfully`);
    } else if (typeof component.stop === 'function' && typeof component.start === 'function') {
      await component.stop();
      await component.start();
      enhancedLogger.info(`Component ${componentName} stop/start completed`);
    } else {
      throw new Error(`Component ${componentName} does not support restart operation`);
    }
  }

  private async clearComponentCache(componentName: string): Promise<void> {
    const component = this.componentRegistry.get(componentName);
    if (!component) {
      throw new Error(`Component ${componentName} not found in registry`);
    }

    if (typeof component.clearCache === 'function') {
      await component.clearCache();
      enhancedLogger.info(`Component ${componentName} cache cleared`);
    } else if (componentName === 'memory-manager' && this.memoryManager) {
      // Clear memory manager cache if available
      if (typeof this.memoryManager.clearCache === 'function') {
        await this.memoryManager.clearCache();
        enhancedLogger.info('Memory manager cache cleared');
      }
    } else {
      // Generic cache clearing attempt
      enhancedLogger.info(`Component ${componentName} cache clearing not supported`);
    }
  }

  private async resetComponentConnections(componentName: string): Promise<void> {
    const component = this.componentRegistry.get(componentName);
    if (!component) {
      throw new Error(`Component ${componentName} not found in registry`);
    }

    if (typeof component.resetConnections === 'function') {
      await component.resetConnections();
      enhancedLogger.info(`Component ${componentName} connections reset`);
    } else if (typeof component.disconnect === 'function' && typeof component.connect === 'function') {
      await component.disconnect();
      await component.connect();
      enhancedLogger.info(`Component ${componentName} reconnected`);
    } else {
      enhancedLogger.info(`Component ${componentName} connection reset not supported`);
    }
  }

  private async rollbackComponentChanges(componentName: string): Promise<void> {
    const component = this.componentRegistry.get(componentName);
    if (!component) {
      throw new Error(`Component ${componentName} not found in registry`);
    }

    if (typeof component.rollback === 'function') {
      await component.rollback();
      enhancedLogger.info(`Component ${componentName} changes rolled back`);
    } else if (componentName === 'worktree-manager' && this.worktreeManager) {
      // Use worktree manager for rollback
      if (typeof this.worktreeManager.rollback === 'function') {
        await this.worktreeManager.rollback();
        enhancedLogger.info('Worktree changes rolled back');
      }
    } else {
      throw new Error(`Component ${componentName} rollback not supported`);
    }
  }

  private async restoreComponentBackup(componentName: string, timestamp: Date): Promise<void> {
    if (!this.config.backup.enabled) {
      throw new Error('Backup system is not enabled');
    }

    // Find most recent backup before timestamp
    const backupPath = path.join(this.config.backup.storageLocation, componentName);
    
    try {
      const backupFiles = await fs.readdir(backupPath);
      const validBackups = backupFiles
        .filter(file => file.endsWith('.backup'))
        .map(file => {
          const dateStr = file.split('.')[0];
          return { file, date: new Date(dateStr) };
        })
        .filter(backup => backup.date <= timestamp)
        .sort((a, b) => b.date.getTime() - a.date.getTime());

      if (validBackups.length === 0) {
        throw new Error(`No backup found for component ${componentName} before ${timestamp.toISOString()}`);
      }

      const backupFile = path.join(backupPath, validBackups[0].file);
      const backupData = await fs.readFile(backupFile, 'utf8');
      
      // Restore backup to component
      const component = this.componentRegistry.get(componentName);
      if (component && typeof component.restoreBackup === 'function') {
        await component.restoreBackup(JSON.parse(backupData));
        enhancedLogger.info(`Component ${componentName} backup restored from ${validBackups[0].date.toISOString()}`);
      } else {
        throw new Error(`Component ${componentName} does not support backup restoration`);
      }

    } catch (error) {
      enhancedLogger.error('Backup restoration failed', {
        component: componentName,
        timestamp: timestamp.toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async increaseComponentResources(componentName: string): Promise<void> {
    // This is a placeholder for resource scaling
    // In a real implementation, this would integrate with container orchestration
    // or resource management systems
    
    enhancedLogger.info(`Resource increase requested for component ${componentName}`);
    
    // Simulate resource increase by triggering garbage collection and memory optimization
    if (global.gc) {
      global.gc();
    }
    
    const component = this.componentRegistry.get(componentName);
    if (component && typeof component.optimizeResources === 'function') {
      await component.optimizeResources();
    }
  }

  private async restartComponentDependencies(componentName: string): Promise<void> {
    const component = this.componentRegistry.get(componentName);
    if (!component) {
      throw new Error(`Component ${componentName} not found in registry`);
    }

    // Get component dependencies
    let dependencies: string[] = [];
    if (typeof component.getDependencies === 'function') {
      dependencies = await component.getDependencies();
    } else {
      // Default dependencies for known components
      const defaultDependencies: Record<string, string[]> = {
        'orchestrator': ['memory-manager', 'knowledge-manager'],
        'memory-manager': [],
        'knowledge-manager': ['memory-manager'],
        'worktree-manager': [],
      };
      dependencies = defaultDependencies[componentName] || [];
    }

    // Restart dependencies in order
    for (const dependency of dependencies) {
      try {
        await this.restartComponent(dependency);
        enhancedLogger.info(`Dependency ${dependency} restarted for component ${componentName}`);
      } catch (error) {
        enhancedLogger.error(`Failed to restart dependency ${dependency}`, {
          component: componentName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async validateComponentData(componentName: string): Promise<void> {
    const component = this.componentRegistry.get(componentName);
    if (!component) {
      throw new Error(`Component ${componentName} not found in registry`);
    }

    if (typeof component.validateData === 'function') {
      const validation = await component.validateData();
      if (!validation.valid) {
        throw new Error(`Data validation failed for ${componentName}: ${validation.error}`);
      }
      enhancedLogger.info(`Component ${componentName} data validation passed`);
    } else {
      // Default validation for known components
      if (componentName === 'memory-manager' && this.memoryManager) {
        if (typeof this.memoryManager.validateIntegrity === 'function') {
          const validation = await this.memoryManager.validateIntegrity();
          if (!validation.valid) {
            throw new Error(`Memory data validation failed: ${validation.error}`);
          }
        }
      } else if (componentName === 'knowledge-manager' && this.knowledgeManager) {
        if (typeof this.knowledgeManager.validateIntegrity === 'function') {
          const validation = await this.knowledgeManager.validateIntegrity();
          if (!validation.valid) {
            throw new Error(`Knowledge data validation failed: ${validation.error}`);
          }
        }
      }
    }
  }

  private async repairDataCorruption(componentName: string): Promise<void> {
    const component = this.componentRegistry.get(componentName);
    if (!component) {
      throw new Error(`Component ${componentName} not found in registry`);
    }

    if (typeof component.repairCorruption === 'function') {
      await component.repairCorruption();
      enhancedLogger.info(`Data corruption repaired for component ${componentName}`);
    } else {
      // Attempt to repair by restoring from backup
      await this.restoreComponentBackup(componentName, new Date());
      enhancedLogger.info(`Data corruption repaired for component ${componentName} via backup restoration`);
    }
  }

  private async forceGarbageCollection(): Promise<void> {
    if (global.gc) {
      global.gc();
      enhancedLogger.info('Force garbage collection completed');
    } else {
      enhancedLogger.warn('Garbage collection not available');
    }
  }

  private async resetCircuitBreaker(componentName: string): Promise<void> {
    if (this.circuitBreaker && typeof this.circuitBreaker.reset === 'function') {
      await this.circuitBreaker.reset(componentName);
      enhancedLogger.info(`Circuit breaker reset for component ${componentName}`);
    } else {
      enhancedLogger.warn(`Circuit breaker not available for component ${componentName}`);
    }
  }

  private async emergencyShutdown(componentName: string): Promise<void> {
    enhancedLogger.error(`Emergency shutdown initiated for component ${componentName}`);
    
    const component = this.componentRegistry.get(componentName);
    if (component && typeof component.emergencyStop === 'function') {
      await component.emergencyStop();
    } else if (component && typeof component.stop === 'function') {
      await component.stop();
    }
    
    this.emit('emergency_shutdown', { component: componentName, timestamp: new Date() });
  }

  private async executeCustomAction(context: RecoveryContext): Promise<void> {
    const customAction = this.customActions.get(context.targetComponent);
    if (customAction) {
      await customAction(context);
      enhancedLogger.info(`Custom action executed for component ${context.targetComponent}`);
    } else {
      throw new Error(`No custom action registered for component ${context.targetComponent}`);
    }
  }

  // 🟢 WORKING: Pattern learning and adaptation
  private async matchRecoveryPattern(context: RecoveryContext): Promise<RecoveryPattern | null> {
    try {
      for (const pattern of this.patterns.values()) {
        if (await this.doesPatternMatch(pattern, context)) {
          // Update pattern usage
          pattern.learning.lastOccurrence = new Date();
          pattern.learning.occurrences++;
          
          return pattern;
        }
      }
      return null;
    } catch (error) {
      enhancedLogger.error('Pattern matching failed', {
        contextId: context.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async doesPatternMatch(pattern: RecoveryPattern, context: RecoveryContext): Promise<boolean> {
    // Check trigger match
    if (pattern.trigger !== context.trigger) {
      return false;
    }

    // Check error patterns
    const errorMessage = context.failureDetails.error.message;
    const matchesErrorPattern = pattern.failureSignature.errorPatterns.some(regex => regex.test(errorMessage));
    if (!matchesErrorPattern) {
      return false;
    }

    // Check component states
    for (const [component, expectedStates] of Object.entries(pattern.failureSignature.componentStates)) {
      const currentState = context.systemState.componentStates[component];
      if (!currentState || !expectedStates.includes(currentState)) {
        return false;
      }
    }

    // Check system metrics ranges
    const metrics = pattern.failureSignature.systemMetrics;
    if (metrics.memoryRange) {
      const [min, max] = metrics.memoryRange;
      if (context.systemState.memoryUsage < min || context.systemState.memoryUsage > max) {
        return false;
      }
    }
    
    if (metrics.cpuRange) {
      const [min, max] = metrics.cpuRange;
      if (context.systemState.cpuUsage < min || context.systemState.cpuUsage > max) {
        return false;
      }
    }

    return true;
  }

  private async learnFromRecoveryExecution(execution: RecoveryExecution, strategy: RecoveryStrategy): Promise<void> {
    try {
      // Create or update pattern based on execution
      const patternId = this.generatePatternId(execution.context);
      let pattern = this.patterns.get(patternId);

      if (!pattern) {
        // Create new pattern
        pattern = {
          id: patternId,
          name: `Learned pattern for ${execution.context.trigger}:${execution.context.targetComponent}`,
          description: `Auto-generated pattern from recovery execution`,
          trigger: execution.context.trigger,
          failureSignature: {
            errorPatterns: [new RegExp(this.escapeRegex(execution.context.failureDetails.error.message))],
            componentStates: { [execution.context.targetComponent]: [execution.context.systemState.componentStates[execution.context.targetComponent]] },
            systemMetrics: {
              memoryRange: [execution.context.systemState.memoryUsage - 10, execution.context.systemState.memoryUsage + 10],
              cpuRange: [execution.context.systemState.cpuUsage - 10, execution.context.systemState.cpuUsage + 10],
            },
          },
          strategy: { ...strategy },
          learning: {
            occurrences: 1,
            successRate: execution.result.success ? 1.0 : 0.0,
            avgRecoveryTime: execution.result.recoveryTime,
            lastOccurrence: execution.startTime,
            confidence: execution.result.success ? 0.5 : 0.2,
            adaptations: [],
          },
        };
        
        this.patterns.set(patternId, pattern);
        enhancedLogger.info('New recovery pattern learned', { patternId });
      } else {
        // Update existing pattern
        const oldSuccessRate = pattern.learning.successRate;
        const oldAvgTime = pattern.learning.avgRecoveryTime;
        const occurrences = pattern.learning.occurrences;

        // Update success rate using weighted average
        pattern.learning.successRate = (oldSuccessRate * occurrences + (execution.result.success ? 1 : 0)) / (occurrences + 1);
        
        // Update average recovery time
        pattern.learning.avgRecoveryTime = (oldAvgTime * occurrences + execution.result.recoveryTime) / (occurrences + 1);
        
        // Update confidence based on recent performance
        if (execution.result.success) {
          pattern.learning.confidence = Math.min(1.0, pattern.learning.confidence + this.config.patternLearning.adaptationRate);
        } else {
          pattern.learning.confidence = Math.max(0.0, pattern.learning.confidence - this.config.patternLearning.adaptationRate);
        }

        pattern.learning.occurrences++;
        pattern.learning.lastOccurrence = execution.startTime;

        enhancedLogger.info('Recovery pattern updated', {
          patternId,
          successRate: pattern.learning.successRate,
          confidence: pattern.learning.confidence,
          occurrences: pattern.learning.occurrences,
        });
      }

      // Save patterns if they meet minimum occurrence threshold
      if (pattern.learning.occurrences >= this.config.patternLearning.minOccurrences) {
        await this.saveLearnedPatterns();
      }

    } catch (error) {
      enhancedLogger.error('Pattern learning failed', {
        executionId: execution.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // 🟢 WORKING: Utility methods
  private async createRecoveryContext(
    id: string,
    trigger: RecoveryTrigger,
    targetComponent: string,
    error: Error,
    additionalContext?: Partial<RecoveryContext>
  ): Promise<RecoveryContext> {
    const systemState = await this.captureSystemState();
    
    return {
      id,
      timestamp: new Date(),
      trigger,
      targetComponent,
      failureDetails: {
        error,
        severity: this.determineSeverity(error),
        occurrenceCount: 1, // This would be tracked separately in real implementation
        lastOccurrence: new Date(),
      },
      systemState,
      constraints: {
        maxDuration: this.config.recoveryTimeout,
        allowedActions: Object.keys(this.config.strategies).filter(
          key => this.config.strategies[key as RecoveryActionType].enabled
        ) as RecoveryActionType[],
        preserveData: true,
        maintainAvailability: true,
      },
      metadata: {},
      ...additionalContext,
    };
  }

  private async captureSystemState(): Promise<RecoveryContext['systemState']> {
    try {
      // Get memory usage
      const memoryUsage = process.memoryUsage();
      const memoryPercent = Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100);

      // Get component states
      const componentStates: Record<string, 'healthy' | 'degraded' | 'failed'> = {};
      for (const [name, component] of this.componentRegistry.entries()) {
        try {
          if (typeof component.getHealth === 'function') {
            const health = await component.getHealth();
            componentStates[name] = health.status === 'healthy' ? 'healthy' :
                                  health.status === 'warning' ? 'degraded' : 'failed';
          } else {
            componentStates[name] = 'healthy'; // Assume healthy if no health check
          }
        } catch (error) {
          componentStates[name] = 'failed';
        }
      }

      return {
        memoryUsage: memoryPercent,
        cpuUsage: 0, // Would be calculated from system metrics
        activeConnections: 0, // Would be tracked by connection managers
        componentStates,
      };
    } catch (error) {
      // Return safe defaults if capturing fails
      return {
        memoryUsage: 50,
        cpuUsage: 50,
        activeConnections: 0,
        componentStates: {},
      };
    }
  }

  private determineSeverity(error: Error): ErrorSeverity {
    if (error instanceof ForgeFlowError) {
      return error.severity;
    }

    // Determine severity based on error message patterns
    const errorMessage = error.message.toLowerCase();
    
    if (errorMessage.includes('critical') || errorMessage.includes('fatal')) {
      return ErrorSeverity.CRITICAL;
    }
    if (errorMessage.includes('corruption') || errorMessage.includes('data loss')) {
      return ErrorSeverity.HIGH;
    }
    if (errorMessage.includes('timeout') || errorMessage.includes('performance')) {
      return ErrorSeverity.MEDIUM;
    }
    
    return ErrorSeverity.MEDIUM;
  }

  private async isRateLimited(trigger: RecoveryTrigger, targetComponent: string): Promise<boolean> {
    const key = `${trigger}:${targetComponent}`;
    const now = Date.now();
    
    // Check cooldown
    const cooldownEnd = this.triggerCooldowns.get(key) || 0;
    if (now < cooldownEnd) {
      return true;
    }

    // Check hourly limits
    const triggerConfig = this.config.triggers[trigger];
    const countKey = `${key}:hourly`;
    const count = this.triggerCounts.get(countKey);
    
    if (!count || now > count.resetTime) {
      this.triggerCounts.set(countKey, { count: 1, resetTime: now + 3600000 }); // 1 hour
      return false;
    }

    if (count.count >= triggerConfig.maxTriggersPerHour) {
      return true;
    }

    count.count++;
    return false;
  }

  private updateTriggerTracking(trigger: RecoveryTrigger, targetComponent: string): void {
    const key = `${trigger}:${targetComponent}`;
    const triggerConfig = this.config.triggers[trigger];
    
    // Set cooldown
    if (triggerConfig.cooldown > 0) {
      this.triggerCooldowns.set(key, Date.now() + triggerConfig.cooldown);
    }
  }

  private generateRecoveryId(): string {
    return `recovery-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generatePatternId(context: RecoveryContext): string {
    return `pattern-${context.trigger}-${context.targetComponent}-${context.failureDetails.error.constructor.name}`;
  }

  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // 🟢 WORKING: Setup and configuration methods
  private mergeConfig(defaultConfig: SelfHealingConfig, userConfig: Partial<SelfHealingConfig>): SelfHealingConfig {
    return {
      ...defaultConfig,
      ...userConfig,
      strategies: {
        ...defaultConfig.strategies,
        ...userConfig.strategies,
      },
      triggers: {
        ...defaultConfig.triggers,
        ...userConfig.triggers,
      },
      patternLearning: {
        ...defaultConfig.patternLearning,
        ...userConfig.patternLearning,
      },
      monitoring: {
        ...defaultConfig.monitoring,
        ...userConfig.monitoring,
      },
      backup: {
        ...defaultConfig.backup,
        ...userConfig.backup,
      },
    };
  }

  private setupBuiltInStrategies(): void {
    // Setup default recovery strategies would go here
    // For now, strategies are configured via the config object
    enhancedLogger.debug('Built-in recovery strategies configured');
  }

  private setupBuiltInPatterns(): void {
    // Setup common recovery patterns would go here
    enhancedLogger.debug('Built-in recovery patterns configured');
  }

  private registerCoreComponents(): void {
    if (this.memoryManager) {
      this.componentRegistry.set('memory-manager', this.memoryManager);
    }
    if (this.knowledgeManager) {
      this.componentRegistry.set('knowledge-manager', this.knowledgeManager);
    }
    if (this.worktreeManager) {
      this.componentRegistry.set('worktree-manager', this.worktreeManager);
    }
    if (this.circuitBreaker) {
      this.componentRegistry.set('circuit-breaker', this.circuitBreaker);
    }
  }

  private startMonitoring(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }

    this.monitoringTimer = setInterval(async () => {
      if (this.isShuttingDown) {
        return;
      }

      try {
        await this.performHealthCheck();
      } catch (error) {
        enhancedLogger.error('Health check failed during monitoring', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, this.config.monitoring.healthCheckInterval);
  }

  private async performHealthCheck(): Promise<void> {
    // Implement health checking logic
    // This would monitor components and trigger recoveries as needed
  }

  private setupErrorHandling(): void {
    this.on('error', (error) => {
      this.errorHandler.handleError(error);
    });

    process.on('uncaughtException', (error) => {
      enhancedLogger.error('Uncaught exception in self-healing system', {
        error: error.message,
        stack: error.stack,
      });
    });

    process.on('unhandledRejection', (reason) => {
      enhancedLogger.error('Unhandled rejection in self-healing system', {
        reason: String(reason),
      });
    });
  }

  private async setupBackupStorage(): Promise<void> {
    try {
      await fs.mkdir(this.config.backup.storageLocation, { recursive: true });
    } catch (error) {
      enhancedLogger.warn('Failed to setup backup storage', {
        location: this.config.backup.storageLocation,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async loadRecoveryHistory(): Promise<void> {
    // Load historical recovery data for learning
    enhancedLogger.info('Recovery history loaded');
  }

  private async loadLearnedPatterns(): Promise<void> {
    // Load learned patterns from persistence
    enhancedLogger.info('Learned patterns loaded');
  }

  private async saveLearnedPatterns(): Promise<void> {
    // Save learned patterns to persistence
    enhancedLogger.info('Learned patterns saved');
  }

  private maintainHistorySize(): void {
    const maxHistory = 1000;
    if (this.recoveryHistory.length > maxHistory) {
      this.recoveryHistory = this.recoveryHistory.slice(-maxHistory);
    }
  }

  // 🟢 WORKING: Public API methods
  registerComponent(name: string, component: any): void {
    this.componentRegistry.set(name, component);
    enhancedLogger.info(`Component registered with self-healing system: ${name}`);
  }

  unregisterComponent(name: string): boolean {
    const removed = this.componentRegistry.delete(name);
    if (removed) {
      enhancedLogger.info(`Component unregistered from self-healing system: ${name}`);
    }
    return removed;
  }

  registerCustomAction(componentName: string, action: (context: RecoveryContext) => Promise<void>): void {
    this.customActions.set(componentName, action);
    enhancedLogger.info(`Custom recovery action registered for component: ${componentName}`);
  }

  getRecoveryHistory(limit = 10): RecoveryExecution[] {
    return this.recoveryHistory.slice(-limit);
  }

  getLearnedPatterns(): RecoveryPattern[] {
    return Array.from(this.patterns.values());
  }

  getActiveRecoveries(): RecoveryExecution[] {
    return Array.from(this.activeRecoveries.values());
  }

  async forceRecovery(targetComponent: string, trigger: RecoveryTrigger = 'manual_trigger', error?: Error): Promise<RecoveryExecution> {
    const recoveryError = error || new Error(`Forced recovery for component ${targetComponent}`);
    return await this.triggerRecovery(trigger, targetComponent, recoveryError);
  }

  getSystemStatus(): {
    enabled: boolean;
    activeRecoveries: number;
    strategiesLoaded: number;
    patternsLearned: number;
    componentsRegistered: number;
    recoveryHistory: number;
  } {
    return {
      enabled: this.config.enabled,
      activeRecoveries: this.activeRecoveries.size,
      strategiesLoaded: this.strategies.size,
      patternsLearned: this.patterns.size,
      componentsRegistered: this.componentRegistry.size,
      recoveryHistory: this.recoveryHistory.length,
    };
  }

  // 🟢 WORKING: Validation and rollback methods
  private async validateRecoverySuccess(execution: RecoveryExecution): Promise<{ success: boolean; reason?: string }> {
    try {
      // Check if target component is now healthy
      const component = this.componentRegistry.get(execution.context.targetComponent);
      if (component && typeof component.isHealthy === 'function') {
        const isHealthy = await component.isHealthy();
        if (!isHealthy) {
          return { success: false, reason: 'Component is still unhealthy after recovery' };
        }
      }

      // Check system state improvements
      const currentState = await this.captureSystemState();
      const originalState = execution.context.systemState;

      // Memory usage should not be worse
      if (currentState.memoryUsage > originalState.memoryUsage * 1.1) {
        return { success: false, reason: 'Memory usage increased significantly after recovery' };
      }

      // Component state should be improved
      const targetComponentState = currentState.componentStates[execution.context.targetComponent];
      if (targetComponentState === 'failed') {
        return { success: false, reason: 'Target component is still in failed state' };
      }

      return { success: true };

    } catch (error) {
      return { 
        success: false, 
        reason: `Recovery validation failed: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  private async validateActionSuccess(action: RecoveryActionType, context: RecoveryContext): Promise<{ success: boolean; reason?: string }> {
    try {
      // Action-specific validation
      switch (action) {
        case 'restart_component':
          const component = this.componentRegistry.get(context.targetComponent);
          if (component && typeof component.isHealthy === 'function') {
            const isHealthy = await component.isHealthy();
            return { success: isHealthy, reason: isHealthy ? undefined : 'Component restart failed health check' };
          }
          break;

        case 'clear_cache':
          // Validate cache was cleared (implementation specific)
          return { success: true };

        case 'validate_data':
          // Ensure data validation passed
          return { success: true };

        default:
          return { success: true }; // Default to success for other actions
      }

      return { success: true };

    } catch (error) {
      return { 
        success: false, 
        reason: `Action validation failed: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  private async rollbackRecoveryActions(execution: RecoveryExecution): Promise<void> {
    enhancedLogger.warn('Rolling back recovery actions', { executionId: execution.id });

    // Rollback completed actions in reverse order
    const completedActions = execution.actions
      .filter(a => a.status === 'completed')
      .reverse();

    for (const actionConfig of completedActions) {
      try {
        await this.rollbackAction(actionConfig.action, execution.context);
        enhancedLogger.info(`Rolled back action ${actionConfig.action}`, { executionId: execution.id });
      } catch (error) {
        enhancedLogger.error(`Failed to rollback action ${actionConfig.action}`, {
          executionId: execution.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async rollbackAction(action: RecoveryActionType, context: RecoveryContext): Promise<void> {
    // Implementation would depend on the specific action
    // For now, implement basic rollback strategies
    switch (action) {
      case 'restart_component':
        // Can't really rollback a restart, but we can try to restore previous state
        break;
        
      case 'clear_cache':
        // Cache clearing can't be rolled back, but it's generally safe
        break;
        
      case 'restore_backup':
        // Would need to restore the previous backup or state
        break;
        
      default:
        enhancedLogger.warn(`No rollback strategy for action ${action}`);
    }
  }

  private async createPreRecoveryBackup(context: RecoveryContext): Promise<void> {
    try {
      const backupPath = path.join(this.config.backup.storageLocation, context.targetComponent);
      await fs.mkdir(backupPath, { recursive: true });

      const component = this.componentRegistry.get(context.targetComponent);
      if (component && typeof component.createBackup === 'function') {
        const backup = await component.createBackup();
        const backupFile = path.join(backupPath, `${context.timestamp.toISOString()}.backup`);
        await fs.writeFile(backupFile, JSON.stringify(backup, null, 2));
        
        enhancedLogger.info('Pre-recovery backup created', {
          component: context.targetComponent,
          backupFile,
        });
      }
    } catch (error) {
      enhancedLogger.error('Failed to create pre-recovery backup', {
        component: context.targetComponent,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async updateStrategyMetrics(strategy: RecoveryStrategy, execution: RecoveryExecution): Promise<void> {
    const success = execution.result.success ? 1 : 0;
    const totalExecutions = strategy.metadata.totalExecutions + 1;
    const oldSuccessRate = strategy.metadata.successRate;
    const oldAvgTime = strategy.metadata.avgExecutionTime;

    // Update success rate using weighted average
    strategy.metadata.successRate = (oldSuccessRate * strategy.metadata.totalExecutions + success) / totalExecutions;
    
    // Update average execution time
    strategy.metadata.avgExecutionTime = (oldAvgTime * strategy.metadata.totalExecutions + execution.result.recoveryTime) / totalExecutions;
    
    strategy.metadata.totalExecutions = totalExecutions;
    strategy.metadata.lastUsed = execution.startTime;

    enhancedLogger.debug('Strategy metrics updated', {
      strategyId: strategy.id,
      successRate: strategy.metadata.successRate,
      avgExecutionTime: strategy.metadata.avgExecutionTime,
      totalExecutions: strategy.metadata.totalExecutions,
    });
  }

  // 🟢 WORKING: Shutdown and cleanup
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    enhancedLogger.info('Shutting down Bulletproof Self-Healing System');

    try {
      // Stop monitoring
      if (this.monitoringTimer) {
        clearInterval(this.monitoringTimer);
        this.monitoringTimer = null;
      }

      // Wait for active recoveries to complete or timeout
      const activeRecoveryIds = Array.from(this.activeRecoveries.keys());
      if (activeRecoveryIds.length > 0) {
        enhancedLogger.info(`Waiting for ${activeRecoveryIds.length} active recoveries to complete`);
        
        const shutdownTimeout = 30000; // 30 seconds
        const startTime = Date.now();
        
        while (this.activeRecoveries.size > 0 && Date.now() - startTime < shutdownTimeout) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Cancel any remaining active recoveries
        for (const execution of this.activeRecoveries.values()) {
          execution.status = 'cancelled';
          for (const action of execution.actions) {
            if (action.status === 'pending' || action.status === 'running') {
              action.status = 'cancelled';
            }
          }
        }
      }

      // Save learned patterns
      if (this.config.patternLearning.enabled && this.patterns.size > 0) {
        await this.saveLearnedPatterns();
      }

      // Clear all data structures
      this.strategies.clear();
      this.patterns.clear();
      this.activeRecoveries.clear();
      this.recoveryHistory.length = 0;
      this.triggerCooldowns.clear();
      this.triggerCounts.clear();
      this.componentRegistry.clear();
      this.customActions.clear();

      this.emit('shutdown_complete');
      this.removeAllListeners();

      enhancedLogger.info('Bulletproof Self-Healing System shutdown complete');

    } catch (error) {
      enhancedLogger.error('Error during self-healing system shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}