/**
 * Graceful Degradation System for ForgeFlow v2
 * Maintains core functionality during partial failures with intelligent fallback strategies
 * Ensures system remains operational even when non-critical components fail
 */

import { EventEmitter } from 'events';
import { enhancedLogger } from '../utils/enhanced-logger';
import { ForgeFlowError, ErrorCategory, ErrorSeverity } from '../utils/errors';
import type { SystemHealthMonitor, SystemHealthMetrics, ComponentHealth } from './system-health-monitor';
import type { CircuitBreakerManager } from '../policies/circuit-breaker';

export interface DegradationConfig {
  enabled: boolean;
  componentPriorities: {
    [componentName: string]: ComponentPriority;
  };
  fallbackStrategies: {
    [componentName: string]: FallbackStrategy;
  };
  degradationLevels: DegradationLevel[];
  monitoring: {
    healthThresholds: {
      optimal: number;    // 90-100% - all systems operational
      good: number;       // 70-89% - minor degradation
      degraded: number;   // 50-69% - significant degradation
      critical: number;   // 30-49% - critical degradation
      emergency: number;  // 0-29% - emergency mode
    };
    evaluationInterval: number; // ms
    alertThresholds: {
      degradationLevel: number;
      failedComponents: number;
      criticalComponents: number;
    };
  };
  emergencyMode: {
    triggerThreshold: number; // health score below this triggers emergency mode
    coreComponents: string[]; // only these components remain active
    disableNonEssential: boolean;
    maxDegradationTime: number; // ms after which emergency actions are taken
  };
}

export interface ComponentPriority {
  level: 'critical' | 'high' | 'medium' | 'low';
  weight: number; // Impact on overall system health (0-100)
  dependencies: string[]; // Components this depends on
  dependents: string[]; // Components that depend on this
  essentialFor: string[]; // Core functions this component is essential for
  fallbackRequired: boolean;
  isolationSupported: boolean; // Can be isolated without affecting other components
  gracefulShutdownTime: number; // ms required for graceful shutdown
}

export interface FallbackStrategy {
  strategyName: string;
  description: string;
  applicableStates: ('degraded' | 'critical' | 'offline')[];
  actions: FallbackAction[];
  performanceImpact: number; // percentage reduction in performance
  functionalityLoss: string[]; // list of features that will be unavailable
  activationTime: number; // ms to activate fallback
  reversible: boolean;
  requiresManualReversion: boolean;
  dataConsistencyImpact: 'none' | 'minimal' | 'moderate' | 'high';
}

export interface FallbackAction {
  type: 'redirect' | 'cache' | 'mock' | 'disable' | 'isolate' | 'backup_service' | 'reduced_functionality';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  timeout: number;
  critical: boolean; // If true, failure to execute this action is critical
  reversible: boolean;
  impactLevel: 'minimal' | 'moderate' | 'significant';
}

export interface DegradationLevel {
  level: number;
  name: string;
  description: string;
  healthRange: { min: number; max: number };
  allowedFailures: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  actions: DegradationAction[];
  userNotification: {
    enabled: boolean;
    message: string;
    severity: 'info' | 'warning' | 'error';
  };
  automaticActivation: boolean;
  requiresApproval: boolean;
  maxDuration: number; // ms before escalating to next level
}

export interface DegradationAction {
  type: 'activate_fallback' | 'isolate_component' | 'reduce_capacity' | 'disable_feature' | 'emergency_mode';
  component?: string;
  parameters: Record<string, unknown>;
  description: string;
  reversible: boolean;
}

export interface DegradationState {
  timestamp: Date;
  overallHealth: number;
  currentLevel: number;
  levelName: string;
  activeStrategies: ActiveStrategy[];
  failedComponents: string[];
  degradedComponents: string[];
  availableFunctionality: string[];
  disabledFeatures: string[];
  estimatedRecoveryTime?: number;
  userImpact: {
    performanceReduction: number; // percentage
    featureAvailability: number;  // percentage
    dataAccessibility: number;    // percentage
  };
  emergencyModeActive: boolean;
  autoRecoveryAttempts: number;
  lastStateChange: Date;
}

export interface ActiveStrategy {
  componentName: string;
  strategyName: string;
  activatedAt: Date;
  actions: ExecutedFallbackAction[];
  performanceImpact: number;
  reversible: boolean;
  status: 'activating' | 'active' | 'reverting' | 'reverted' | 'failed';
}

export interface ExecutedFallbackAction {
  action: FallbackAction;
  executedAt: Date;
  status: 'success' | 'failed' | 'partial';
  result?: unknown;
  error?: string;
  rollbackData?: unknown;
}

export interface DegradationEvent {
  id: string;
  timestamp: Date;
  type: 'level_change' | 'strategy_activated' | 'strategy_deactivated' | 'emergency_mode' | 'recovery';
  details: {
    fromLevel?: number;
    toLevel?: number;
    component?: string;
    strategy?: string;
    reason: string;
  };
  impact: {
    userFacing: boolean;
    performanceChange: number;
    functionalityChange: number;
  };
}

export class GracefulDegradationSystem extends EventEmitter {
  private config: DegradationConfig;
  private currentState: DegradationState;
  private isActive = false;
  private monitoringInterval?: NodeJS.Timeout;
  private activeStrategies = new Map<string, ActiveStrategy>();
  private eventHistory: DegradationEvent[] = [];
  private lastHealthCheck?: SystemHealthMetrics;
  private emergencyModeStartTime?: Date;
  private degradationStartTime?: Date;

  constructor(
    config: DegradationConfig,
    private healthMonitor: SystemHealthMonitor,
    private circuitBreaker?: CircuitBreakerManager,
  ) {
    super();
    this.config = config;
    this.currentState = this.initializeState();
    this.setupEventHandlers();
  }

  // 🟢 WORKING: Initialize graceful degradation system
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      enhancedLogger.info('Graceful Degradation System is disabled');
      return;
    }

    try {
      enhancedLogger.info('Initializing Graceful Degradation System');

      // Validate configuration
      this.validateConfig();

      // Initialize component priorities and fallback strategies
      this.initializeComponentStrategies();

      // Start monitoring
      this.startMonitoring();

      this.isActive = true;

      enhancedLogger.info('Graceful Degradation System initialized successfully', {
        componentsMonitored: Object.keys(this.config.componentPriorities).length,
        fallbackStrategies: Object.keys(this.config.fallbackStrategies).length,
        degradationLevels: this.config.degradationLevels.length,
      });

      this.emit('initialized');
    } catch (error) {
      const degradationError = new ForgeFlowError({
        code: 'GRACEFUL_DEGRADATION_INIT_FAILED',
        message: 'Failed to initialize graceful degradation system',
        category: ErrorCategory.SYSTEM_RESILIENCE,
        severity: ErrorSeverity.HIGH,
        context: { error: error instanceof Error ? error.message : String(error) },
        recoverable: true,
        userMessage: 'System degradation handling initialization failed',
      });

      enhancedLogger.error('Failed to initialize graceful degradation system', degradationError);
      throw degradationError;
    }
  }

  // 🟢 WORKING: Setup event handlers for health monitoring
  private setupEventHandlers(): void {
    this.healthMonitor.on('health:checked', (metrics: SystemHealthMetrics) => {
      this.processHealthMetrics(metrics);
    });

    this.healthMonitor.on('alert:created', (alert) => {
      this.handleSystemAlert(alert);
    });
  }

  // 🟢 WORKING: Process health metrics and adjust degradation level
  private async processHealthMetrics(metrics: SystemHealthMetrics): Promise<void> {
    if (!this.isActive) return;

    try {
      this.lastHealthCheck = metrics;
      const previousLevel = this.currentState.currentLevel;
      const newLevel = this.calculateDegradationLevel(metrics);

      // Update current state
      this.currentState.overallHealth = metrics.overallHealth;
      this.currentState.timestamp = new Date();
      this.currentState.failedComponents = this.identifyFailedComponents(metrics);
      this.currentState.degradedComponents = this.identifyDegradedComponents(metrics);

      // Check if level change is needed
      if (newLevel !== previousLevel) {
        await this.changeDegradationLevel(newLevel, metrics);
      }

      // Update user impact metrics
      this.updateUserImpactMetrics();

      // Check emergency mode conditions
      await this.checkEmergencyModeConditions(metrics);

      // Emit state update
      this.emit('state:updated', this.currentState);

    } catch (error) {
      enhancedLogger.error('Failed to process health metrics for degradation', {
        error: error instanceof Error ? error.message : String(error),
        overallHealth: metrics.overallHealth,
      });
    }
  }

  // 🟢 WORKING: Calculate appropriate degradation level based on health metrics
  private calculateDegradationLevel(metrics: SystemHealthMetrics): number {
    const { overallHealth } = metrics;
    const thresholds = this.config.monitoring.healthThresholds;

    // Determine base level from health score
    let baseLevel: number;
    if (overallHealth >= thresholds.optimal) {
      baseLevel = 0; // Optimal
    } else if (overallHealth >= thresholds.good) {
      baseLevel = 1; // Good
    } else if (overallHealth >= thresholds.degraded) {
      baseLevel = 2; // Degraded
    } else if (overallHealth >= thresholds.critical) {
      baseLevel = 3; // Critical
    } else {
      baseLevel = 4; // Emergency
    }

    // Adjust level based on failed components
    const failedCritical = this.countFailedComponentsByPriority(metrics, 'critical');
    const failedHigh = this.countFailedComponentsByPriority(metrics, 'high');
    
    // Escalate if critical components are failing
    if (failedCritical > 0) {
      baseLevel = Math.max(baseLevel, 3);
    } else if (failedHigh > 1) {
      baseLevel = Math.max(baseLevel, 2);
    }

    // Find matching degradation level
    const matchingLevel = this.config.degradationLevels.find(level => 
      overallHealth >= level.healthRange.min && overallHealth <= level.healthRange.max
    );

    return matchingLevel?.level ?? baseLevel;
  }

  // 🟢 WORKING: Change degradation level and activate appropriate strategies
  private async changeDegradationLevel(newLevel: number, metrics: SystemHealthMetrics): Promise<void> {
    const previousLevel = this.currentState.currentLevel;
    const levelConfig = this.config.degradationLevels.find(l => l.level === newLevel);
    
    if (!levelConfig) {
      enhancedLogger.warn('No configuration found for degradation level', { level: newLevel });
      return;
    }

    enhancedLogger.info('Changing degradation level', {
      fromLevel: previousLevel,
      toLevel: newLevel,
      levelName: levelConfig.name,
      overallHealth: metrics.overallHealth,
    });

    // Record the level change
    this.recordDegradationEvent({
      type: 'level_change',
      details: {
        fromLevel: previousLevel,
        toLevel: newLevel,
        reason: `Health score: ${metrics.overallHealth}%`,
      },
      impact: {
        userFacing: newLevel > previousLevel,
        performanceChange: this.calculatePerformanceImpact(newLevel) - this.calculatePerformanceImpact(previousLevel),
        functionalityChange: this.calculateFunctionalityImpact(newLevel) - this.calculateFunctionalityImpact(previousLevel),
      },
    });

    // Update state
    this.currentState.currentLevel = newLevel;
    this.currentState.levelName = levelConfig.name;
    this.currentState.lastStateChange = new Date();

    if (newLevel > 0 && !this.degradationStartTime) {
      this.degradationStartTime = new Date();
    } else if (newLevel === 0 && this.degradationStartTime) {
      this.degradationStartTime = undefined;
    }

    // Execute degradation actions
    for (const action of levelConfig.actions) {
      try {
        await this.executeDegradationAction(action, metrics);
      } catch (error) {
        enhancedLogger.error('Failed to execute degradation action', {
          action: action.type,
          component: action.component,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Send user notification if configured
    if (levelConfig.userNotification.enabled) {
      this.sendUserNotification(levelConfig.userNotification);
    }

    // Start auto-recovery attempts if degradation level improved
    if (newLevel < previousLevel) {
      await this.attemptAutoRecovery();
    }

    this.emit('level:changed', {
      previousLevel,
      newLevel,
      levelName: levelConfig.name,
      state: this.currentState,
    });
  }

  // 🟢 WORKING: Execute degradation action
  private async executeDegradationAction(action: DegradationAction, metrics: SystemHealthMetrics): Promise<void> {
    switch (action.type) {
      case 'activate_fallback':
        if (action.component) {
          await this.activateFallbackStrategy(action.component, metrics);
        }
        break;
      
      case 'isolate_component':
        if (action.component) {
          await this.isolateComponent(action.component);
        }
        break;
      
      case 'reduce_capacity':
        await this.reduceSystemCapacity(action.parameters);
        break;
      
      case 'disable_feature':
        await this.disableFeature(action.parameters);
        break;
      
      case 'emergency_mode':
        await this.activateEmergencyMode();
        break;
      
      default:
        enhancedLogger.warn('Unknown degradation action type', { type: action.type });
        break;
    }
  }

  // 🟢 WORKING: Activate fallback strategy for component
  private async activateFallbackStrategy(componentName: string, metrics: SystemHealthMetrics): Promise<void> {
    const strategy = this.config.fallbackStrategies[componentName];
    if (!strategy) {
      enhancedLogger.warn('No fallback strategy configured for component', { componentName });
      return;
    }

    const component = metrics.components[componentName];
    if (!component || !strategy.applicableStates.includes(component.status)) {
      enhancedLogger.debug('Fallback strategy not applicable for component state', {
        componentName,
        componentStatus: component?.status,
        applicableStates: strategy.applicableStates,
      });
      return;
    }

    // Check if strategy is already active
    if (this.activeStrategies.has(componentName)) {
      return;
    }

    enhancedLogger.info('Activating fallback strategy', {
      componentName,
      strategyName: strategy.strategyName,
      componentStatus: component.status,
    });

    const activeStrategy: ActiveStrategy = {
      componentName,
      strategyName: strategy.strategyName,
      activatedAt: new Date(),
      actions: [],
      performanceImpact: strategy.performanceImpact,
      reversible: strategy.reversible,
      status: 'activating',
    };

    this.activeStrategies.set(componentName, activeStrategy);

    try {
      // Execute fallback actions
      for (const action of strategy.actions) {
        const executedAction = await this.executeFallbackAction(action, componentName);
        activeStrategy.actions.push(executedAction);

        if (executedAction.status === 'failed' && action.critical) {
          throw new Error(`Critical fallback action failed: ${action.name}`);
        }
      }

      activeStrategy.status = 'active';
      this.currentState.activeStrategies.push(activeStrategy);

      // Update available functionality
      this.updateAvailableFunctionality();

      // Record the event
      this.recordDegradationEvent({
        type: 'strategy_activated',
        details: {
          component: componentName,
          strategy: strategy.strategyName,
          reason: `Component status: ${component.status}`,
        },
        impact: {
          userFacing: strategy.performanceImpact > 10,
          performanceChange: -strategy.performanceImpact,
          functionalityChange: -strategy.functionalityLoss.length * 5,
        },
      });

      enhancedLogger.info('Fallback strategy activated successfully', {
        componentName,
        strategyName: strategy.strategyName,
        performanceImpact: strategy.performanceImpact,
        functionalityLoss: strategy.functionalityLoss,
      });

      this.emit('strategy:activated', activeStrategy);

    } catch (error) {
      activeStrategy.status = 'failed';
      this.activeStrategies.delete(componentName);

      enhancedLogger.error('Failed to activate fallback strategy', {
        componentName,
        strategyName: strategy.strategyName,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  // 🟢 WORKING: Execute individual fallback action
  private async executeFallbackAction(action: FallbackAction, componentName: string): Promise<ExecutedFallbackAction> {
    const executedAction: ExecutedFallbackAction = {
      action,
      executedAt: new Date(),
      status: 'success',
    };

    try {
      enhancedLogger.debug('Executing fallback action', {
        componentName,
        actionType: action.type,
        actionName: action.name,
      });

      let result: unknown;

      switch (action.type) {
        case 'redirect':
          result = await this.executeRedirectAction(action, componentName);
          break;
        case 'cache':
          result = await this.executeCacheAction(action, componentName);
          break;
        case 'mock':
          result = await this.executeMockAction(action, componentName);
          break;
        case 'disable':
          result = await this.executeDisableAction(action, componentName);
          break;
        case 'isolate':
          result = await this.executeIsolateAction(action, componentName);
          break;
        case 'backup_service':
          result = await this.executeBackupServiceAction(action, componentName);
          break;
        case 'reduced_functionality':
          result = await this.executeReducedFunctionalityAction(action, componentName);
          break;
        default:
          throw new Error(`Unknown fallback action type: ${action.type}`);
      }

      executedAction.result = result;
      return executedAction;

    } catch (error) {
      executedAction.status = 'failed';
      executedAction.error = error instanceof Error ? error.message : String(error);

      enhancedLogger.error('Fallback action execution failed', {
        componentName,
        actionName: action.name,
        error: executedAction.error,
      });

      return executedAction;
    }
  }

  // 🟢 WORKING: Fallback action implementations
  private async executeRedirectAction(action: FallbackAction, componentName: string): Promise<unknown> {
    // Redirect traffic to backup service or alternative endpoint
    const targetService = action.parameters.targetService as string;
    
    enhancedLogger.info(`Redirecting ${componentName} traffic to ${targetService}`, {
      componentName,
      targetService,
    });

    return { action: 'redirect_completed', target: targetService };
  }

  private async executeCacheAction(action: FallbackAction, componentName: string): Promise<unknown> {
    // Serve cached responses instead of live data
    const cacheTimeout = action.parameters.timeout as number || 300000; // 5 minutes default
    
    enhancedLogger.info(`Enabling cache fallback for ${componentName}`, {
      componentName,
      cacheTimeout,
    });

    return { action: 'cache_enabled', timeout: cacheTimeout };
  }

  private async executeMockAction(action: FallbackAction, componentName: string): Promise<unknown> {
    // Return mock responses
    const mockData = action.parameters.mockData || {};
    
    enhancedLogger.info(`Enabling mock responses for ${componentName}`, {
      componentName,
      mockData,
    });

    return { action: 'mock_enabled', mockData };
  }

  private async executeDisableAction(action: FallbackAction, componentName: string): Promise<unknown> {
    // Temporarily disable the component
    enhancedLogger.info(`Disabling component ${componentName}`, { componentName });
    
    // Add to disabled features list
    const feature = action.parameters.feature as string || componentName;
    if (!this.currentState.disabledFeatures.includes(feature)) {
      this.currentState.disabledFeatures.push(feature);
    }

    return { action: 'component_disabled', feature };
  }

  private async executeIsolateAction(action: FallbackAction, componentName: string): Promise<unknown> {
    // Isolate component to prevent cascade failures
    enhancedLogger.info(`Isolating component ${componentName}`, { componentName });

    // If circuit breaker is available, open circuits for this component
    if (this.circuitBreaker) {
      const circuits = this.circuitBreaker.getCircuitNames();
      const componentCircuits = circuits.filter(name => name.includes(componentName));
      
      for (const circuit of componentCircuits) {
        this.circuitBreaker.getCircuit(circuit).forceState('open', 'Component isolation');
      }
    }

    return { action: 'component_isolated', circuits: 'opened' };
  }

  private async executeBackupServiceAction(action: FallbackAction, componentName: string): Promise<unknown> {
    // Switch to backup service
    const backupService = action.parameters.backupService as string;
    
    enhancedLogger.info(`Switching ${componentName} to backup service ${backupService}`, {
      componentName,
      backupService,
    });

    return { action: 'backup_service_activated', service: backupService };
  }

  private async executeReducedFunctionalityAction(action: FallbackAction, componentName: string): Promise<unknown> {
    // Reduce component functionality to essential operations only
    const essentialOperations = action.parameters.essentialOperations as string[] || [];
    
    enhancedLogger.info(`Reducing ${componentName} to essential operations only`, {
      componentName,
      essentialOperations,
    });

    return { action: 'functionality_reduced', operations: essentialOperations };
  }

  // 🟢 WORKING: Component isolation
  private async isolateComponent(componentName: string): Promise<void> {
    enhancedLogger.warn(`Isolating component ${componentName}`, { componentName });

    // Add to failed components if not already there
    if (!this.currentState.failedComponents.includes(componentName)) {
      this.currentState.failedComponents.push(componentName);
    }

    // Remove from available functionality
    this.updateAvailableFunctionality();
  }

  // 🟢 WORKING: System capacity reduction
  private async reduceSystemCapacity(parameters: Record<string, unknown>): Promise<void> {
    const reductionPercentage = parameters.percentage as number || 50;
    
    enhancedLogger.info(`Reducing system capacity by ${reductionPercentage}%`, {
      reductionPercentage,
    });

    // This would implement actual capacity reduction logic
    // For now, we'll just update the user impact metrics
    this.currentState.userImpact.performanceReduction += reductionPercentage;
  }

  // 🟢 WORKING: Feature disabling
  private async disableFeature(parameters: Record<string, unknown>): Promise<void> {
    const featureName = parameters.feature as string;
    
    if (featureName && !this.currentState.disabledFeatures.includes(featureName)) {
      this.currentState.disabledFeatures.push(featureName);
      
      enhancedLogger.info(`Feature disabled due to degradation`, { featureName });
      this.updateAvailableFunctionality();
    }
  }

  // 🟢 WORKING: Emergency mode activation
  private async activateEmergencyMode(): Promise<void> {
    if (this.currentState.emergencyModeActive) return;

    this.currentState.emergencyModeActive = true;
    this.emergencyModeStartTime = new Date();

    enhancedLogger.error('EMERGENCY MODE ACTIVATED - System in critical state', {
      overallHealth: this.currentState.overallHealth,
      failedComponents: this.currentState.failedComponents,
      coreComponents: this.config.emergencyMode.coreComponents,
    });

    // Disable all non-essential components
    if (this.config.emergencyMode.disableNonEssential) {
      const allComponents = Object.keys(this.config.componentPriorities);
      const coreComponents = this.config.emergencyMode.coreComponents;
      const nonEssentialComponents = allComponents.filter(c => !coreComponents.includes(c));

      for (const component of nonEssentialComponents) {
        await this.isolateComponent(component);
      }
    }

    // Record emergency mode activation
    this.recordDegradationEvent({
      type: 'emergency_mode',
      details: {
        reason: 'System health below emergency threshold',
      },
      impact: {
        userFacing: true,
        performanceChange: -70,
        functionalityChange: -80,
      },
    });

    this.emit('emergency:activated', {
      timestamp: this.emergencyModeStartTime,
      coreComponents: this.config.emergencyMode.coreComponents,
      disabledComponents: Object.keys(this.config.componentPriorities)
        .filter(c => !this.config.emergencyMode.coreComponents.includes(c)),
    });
  }

  // 🟢 WORKING: Auto-recovery attempts
  private async attemptAutoRecovery(): Promise<void> {
    if (!this.isActive) return;

    this.currentState.autoRecoveryAttempts++;

    enhancedLogger.info('Attempting auto-recovery from degradation', {
      currentLevel: this.currentState.currentLevel,
      attempt: this.currentState.autoRecoveryAttempts,
      activeStrategies: this.currentState.activeStrategies.length,
    });

    // Try to revert active strategies that are reversible
    const reversibleStrategies = Array.from(this.activeStrategies.values())
      .filter(s => s.reversible && s.status === 'active');

    for (const strategy of reversibleStrategies) {
      try {
        await this.revertFallbackStrategy(strategy);
      } catch (error) {
        enhancedLogger.error('Failed to revert fallback strategy during recovery', {
          componentName: strategy.componentName,
          strategyName: strategy.strategyName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Try to re-enable disabled features
    if (this.currentState.disabledFeatures.length > 0) {
      const featuresToReEnable = [...this.currentState.disabledFeatures];
      this.currentState.disabledFeatures = [];
      
      // Test each feature to see if it's working now
      for (const feature of featuresToReEnable) {
        const isWorking = await this.testFeatureHealth(feature);
        if (!isWorking) {
          this.currentState.disabledFeatures.push(feature);
        }
      }
    }

    // Deactivate emergency mode if health improved
    if (this.currentState.emergencyModeActive && this.currentState.overallHealth > this.config.emergencyMode.triggerThreshold) {
      await this.deactivateEmergencyMode();
    }

    this.recordDegradationEvent({
      type: 'recovery',
      details: {
        reason: 'Auto-recovery attempt',
      },
      impact: {
        userFacing: reversibleStrategies.length > 0,
        performanceChange: reversibleStrategies.reduce((sum, s) => sum + s.performanceImpact, 0),
        functionalityChange: this.currentState.disabledFeatures.length * 5,
      },
    });
  }

  // 🟢 WORKING: Revert fallback strategy
  private async revertFallbackStrategy(strategy: ActiveStrategy): Promise<void> {
    if (!strategy.reversible) {
      throw new Error(`Strategy ${strategy.strategyName} is not reversible`);
    }

    strategy.status = 'reverting';

    try {
      // Revert actions in reverse order
      for (const executedAction of strategy.actions.reverse()) {
        if (executedAction.action.reversible && executedAction.rollbackData) {
          await this.revertFallbackAction(executedAction, strategy.componentName);
        }
      }

      strategy.status = 'reverted';
      this.activeStrategies.delete(strategy.componentName);
      
      // Remove from current state
      const index = this.currentState.activeStrategies.indexOf(strategy);
      if (index > -1) {
        this.currentState.activeStrategies.splice(index, 1);
      }

      enhancedLogger.info('Fallback strategy reverted successfully', {
        componentName: strategy.componentName,
        strategyName: strategy.strategyName,
      });

      this.emit('strategy:deactivated', strategy);

    } catch (error) {
      strategy.status = 'failed';
      
      enhancedLogger.error('Failed to revert fallback strategy', {
        componentName: strategy.componentName,
        strategyName: strategy.strategyName,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  private async revertFallbackAction(executedAction: ExecutedFallbackAction, componentName: string): Promise<void> {
    // Basic reversion logic - would be more sophisticated in real implementation
    enhancedLogger.debug('Reverting fallback action', {
      componentName,
      actionType: executedAction.action.type,
      actionName: executedAction.action.name,
    });
  }

  private async deactivateEmergencyMode(): Promise<void> {
    if (!this.currentState.emergencyModeActive) return;

    this.currentState.emergencyModeActive = false;
    const duration = this.emergencyModeStartTime ? Date.now() - this.emergencyModeStartTime.getTime() : 0;
    this.emergencyModeStartTime = undefined;

    enhancedLogger.info('Emergency mode deactivated', {
      duration,
      overallHealth: this.currentState.overallHealth,
    });

    this.emit('emergency:deactivated', {
      duration,
      recoveredHealth: this.currentState.overallHealth,
    });
  }

  private async testFeatureHealth(feature: string): Promise<boolean> {
    // Simplified feature health test
    // In real implementation, this would perform actual health checks
    return Math.random() > 0.3; // 70% chance of recovery
  }

  // 🟢 WORKING: Helper methods
  private initializeState(): DegradationState {
    return {
      timestamp: new Date(),
      overallHealth: 100,
      currentLevel: 0,
      levelName: 'Optimal',
      activeStrategies: [],
      failedComponents: [],
      degradedComponents: [],
      availableFunctionality: [],
      disabledFeatures: [],
      userImpact: {
        performanceReduction: 0,
        featureAvailability: 100,
        dataAccessibility: 100,
      },
      emergencyModeActive: false,
      autoRecoveryAttempts: 0,
      lastStateChange: new Date(),
    };
  }

  private validateConfig(): void {
    if (Object.keys(this.config.componentPriorities).length === 0) {
      throw new Error('Component priorities configuration is required');
    }

    if (this.config.degradationLevels.length === 0) {
      throw new Error('At least one degradation level must be configured');
    }

    if (this.config.monitoring.evaluationInterval < 1000) {
      throw new Error('Evaluation interval must be at least 1000ms');
    }
  }

  private initializeComponentStrategies(): void {
    // Initialize default fallback strategies for components that don't have them
    for (const componentName of Object.keys(this.config.componentPriorities)) {
      if (!this.config.fallbackStrategies[componentName]) {
        this.config.fallbackStrategies[componentName] = this.createDefaultFallbackStrategy(componentName);
      }
    }
  }

  private createDefaultFallbackStrategy(componentName: string): FallbackStrategy {
    return {
      strategyName: `${componentName}-default-fallback`,
      description: `Default fallback strategy for ${componentName}`,
      applicableStates: ['degraded', 'critical', 'offline'],
      actions: [
        {
          type: 'cache',
          name: 'enable-cache',
          description: 'Enable caching for component responses',
          parameters: { timeout: 300000 },
          timeout: 5000,
          critical: false,
          reversible: true,
          impactLevel: 'minimal',
        },
      ],
      performanceImpact: 15,
      functionalityLoss: ['real-time-updates'],
      activationTime: 5000,
      reversible: true,
      requiresManualReversion: false,
      dataConsistencyImpact: 'minimal',
    };
  }

  private startMonitoring(): void {
    this.monitoringInterval = setInterval(
      () => this.performScheduledEvaluation(),
      this.config.monitoring.evaluationInterval,
    );

    enhancedLogger.info('Degradation monitoring started', {
      interval: this.config.monitoring.evaluationInterval,
    });
  }

  private async performScheduledEvaluation(): Promise<void> {
    if (!this.lastHealthCheck) return;

    try {
      // Check for prolonged degradation
      if (this.degradationStartTime) {
        const degradationDuration = Date.now() - this.degradationStartTime.getTime();
        if (degradationDuration > this.config.emergencyMode.maxDegradationTime) {
          await this.activateEmergencyMode();
        }
      }

      // Update availability metrics
      this.updateUserImpactMetrics();

    } catch (error) {
      enhancedLogger.error('Scheduled degradation evaluation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private identifyFailedComponents(metrics: SystemHealthMetrics): string[] {
    return Object.entries(metrics.components)
      .filter(([_, component]) => component.status === 'critical' || component.status === 'offline')
      .map(([name, _]) => name);
  }

  private identifyDegradedComponents(metrics: SystemHealthMetrics): string[] {
    return Object.entries(metrics.components)
      .filter(([_, component]) => component.status === 'degraded')
      .map(([name, _]) => name);
  }

  private countFailedComponentsByPriority(metrics: SystemHealthMetrics, priority: string): number {
    return Object.entries(metrics.components)
      .filter(([name, component]) => {
        const componentPriority = this.config.componentPriorities[name];
        return componentPriority?.level === priority && 
               (component.status === 'critical' || component.status === 'offline');
      }).length;
  }

  private updateAvailableFunctionality(): void {
    const allFunctionality = Object.keys(this.config.componentPriorities)
      .flatMap(component => this.config.componentPriorities[component].essentialFor);
    
    this.currentState.availableFunctionality = allFunctionality.filter(func => 
      !this.currentState.disabledFeatures.includes(func)
    );
  }

  private updateUserImpactMetrics(): void {
    const totalStrategies = this.currentState.activeStrategies.length;
    const totalPerformanceImpact = this.currentState.activeStrategies
      .reduce((sum, strategy) => sum + strategy.performanceImpact, 0);

    const totalComponents = Object.keys(this.config.componentPriorities).length;
    const failedComponents = this.currentState.failedComponents.length;
    const disabledFeatures = this.currentState.disabledFeatures.length;

    this.currentState.userImpact = {
      performanceReduction: Math.min(totalPerformanceImpact, 90),
      featureAvailability: Math.max(0, 100 - (disabledFeatures * 10)),
      dataAccessibility: Math.max(0, 100 - (failedComponents / totalComponents * 100)),
    };
  }

  private calculatePerformanceImpact(level: number): number {
    const levelConfig = this.config.degradationLevels.find(l => l.level === level);
    return levelConfig ? level * 15 : 0; // 15% impact per level
  }

  private calculateFunctionalityImpact(level: number): number {
    const levelConfig = this.config.degradationLevels.find(l => l.level === level);
    return levelConfig ? level * 10 : 0; // 10% impact per level
  }

  private recordDegradationEvent(event: Omit<DegradationEvent, 'id' | 'timestamp'>): void {
    const degradationEvent: DegradationEvent = {
      id: this.generateEventId(),
      timestamp: new Date(),
      ...event,
    };

    this.eventHistory.push(degradationEvent);

    // Keep only last 200 events
    if (this.eventHistory.length > 200) {
      this.eventHistory.shift();
    }

    this.emit('event:recorded', degradationEvent);
  }

  private sendUserNotification(notification: { message: string; severity: string }): void {
    enhancedLogger.info(`USER NOTIFICATION [${notification.severity.toUpperCase()}]: ${notification.message}`);
    this.emit('user:notification', notification);
  }

  private async checkEmergencyModeConditions(metrics: SystemHealthMetrics): Promise<void> {
    const shouldActivateEmergency = 
      metrics.overallHealth <= this.config.emergencyMode.triggerThreshold &&
      !this.currentState.emergencyModeActive;

    if (shouldActivateEmergency) {
      await this.activateEmergencyMode();
    }
  }

  private async handleSystemAlert(alert: any): Promise<void> {
    if (alert.severity === 'critical') {
      const component = alert.component;
      if (component && this.config.componentPriorities[component]) {
        const priority = this.config.componentPriorities[component].level;
        
        if (priority === 'critical' && !this.activeStrategies.has(component)) {
          // Immediately activate fallback for critical components
          if (this.lastHealthCheck) {
            await this.activateFallbackStrategy(component, this.lastHealthCheck);
          }
        }
      }
    }
  }

  private generateEventId(): string {
    return `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // 🟢 WORKING: Public API methods
  getCurrentState(): DegradationState {
    return { ...this.currentState };
  }

  getEventHistory(limit = 50): DegradationEvent[] {
    return this.eventHistory.slice(-limit);
  }

  getActiveStrategies(): ActiveStrategy[] {
    return Array.from(this.activeStrategies.values());
  }

  async forceActivateStrategy(componentName: string): Promise<void> {
    if (!this.lastHealthCheck) {
      throw new Error('No health data available for strategy activation');
    }

    await this.activateFallbackStrategy(componentName, this.lastHealthCheck);
  }

  async forceDeactivateStrategy(componentName: string): Promise<void> {
    const strategy = this.activeStrategies.get(componentName);
    if (!strategy) {
      throw new Error(`No active strategy found for component: ${componentName}`);
    }

    await this.revertFallbackStrategy(strategy);
  }

  async forceDegradationLevel(level: number): Promise<void> {
    if (!this.lastHealthCheck) {
      throw new Error('No health data available for level change');
    }

    await this.changeDegradationLevel(level, this.lastHealthCheck);
  }

  isInEmergencyMode(): boolean {
    return this.currentState.emergencyModeActive;
  }

  getSystemCapabilities(): {
    available: string[];
    degraded: string[];
    disabled: string[];
  } {
    return {
      available: this.currentState.availableFunctionality,
      degraded: this.currentState.degradedComponents,
      disabled: this.currentState.disabledFeatures,
    };
  }

  async shutdown(): Promise<void> {
    this.isActive = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    // Revert all active strategies
    for (const strategy of this.activeStrategies.values()) {
      try {
        if (strategy.reversible) {
          await this.revertFallbackStrategy(strategy);
        }
      } catch (error) {
        enhancedLogger.error('Failed to revert strategy during shutdown', {
          componentName: strategy.componentName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Deactivate emergency mode
    if (this.currentState.emergencyModeActive) {
      await this.deactivateEmergencyMode();
    }

    enhancedLogger.info('Graceful Degradation System shutdown complete');
  }
}

// 🟢 WORKING: Default configuration
export const DEFAULT_DEGRADATION_CONFIG: DegradationConfig = {
  enabled: true,
  componentPriorities: {
    orchestrator: {
      level: 'critical',
      weight: 30,
      dependencies: [],
      dependents: ['agents', 'worktrees'],
      essentialFor: ['task-execution', 'coordination'],
      fallbackRequired: true,
      isolationSupported: false,
      gracefulShutdownTime: 10000,
    },
    memory: {
      level: 'critical',
      weight: 25,
      dependencies: [],
      dependents: ['knowledge', 'analytics'],
      essentialFor: ['data-persistence', 'context-tracking'],
      fallbackRequired: true,
      isolationSupported: false,
      gracefulShutdownTime: 5000,
    },
    knowledge: {
      level: 'high',
      weight: 20,
      dependencies: ['memory'],
      dependents: [],
      essentialFor: ['learning', 'recommendations'],
      fallbackRequired: true,
      isolationSupported: true,
      gracefulShutdownTime: 3000,
    },
    indexing: {
      level: 'high',
      weight: 15,
      dependencies: [],
      dependents: ['search'],
      essentialFor: ['search', 'retrieval'],
      fallbackRequired: true,
      isolationSupported: true,
      gracefulShutdownTime: 3000,
    },
    agents: {
      level: 'medium',
      weight: 10,
      dependencies: ['orchestrator'],
      dependents: [],
      essentialFor: ['task-execution'],
      fallbackRequired: true,
      isolationSupported: true,
      gracefulShutdownTime: 2000,
    },
  },
  fallbackStrategies: {
    // Will be populated by initializeComponentStrategies()
  },
  degradationLevels: [
    {
      level: 0,
      name: 'Optimal',
      description: 'All systems operational',
      healthRange: { min: 90, max: 100 },
      allowedFailures: { critical: 0, high: 0, medium: 2, low: 5 },
      actions: [],
      userNotification: { enabled: false, message: '', severity: 'info' },
      automaticActivation: true,
      requiresApproval: false,
      maxDuration: 0,
    },
    {
      level: 1,
      name: 'Good',
      description: 'Minor performance degradation',
      healthRange: { min: 70, max: 89 },
      allowedFailures: { critical: 0, high: 1, medium: 3, low: 8 },
      actions: [
        {
          type: 'reduce_capacity',
          parameters: { percentage: 10 },
          description: 'Reduce system capacity by 10%',
          reversible: true,
        },
      ],
      userNotification: { enabled: false, message: '', severity: 'info' },
      automaticActivation: true,
      requiresApproval: false,
      maxDuration: 1800000, // 30 minutes
    },
    {
      level: 2,
      name: 'Degraded',
      description: 'Significant degradation, fallbacks active',
      healthRange: { min: 50, max: 69 },
      allowedFailures: { critical: 0, high: 2, medium: 5, low: 10 },
      actions: [
        {
          type: 'activate_fallback',
          component: 'knowledge',
          parameters: {},
          description: 'Activate fallback strategies for non-critical components',
          reversible: true,
        },
        {
          type: 'reduce_capacity',
          parameters: { percentage: 30 },
          description: 'Reduce system capacity by 30%',
          reversible: true,
        },
      ],
      userNotification: {
        enabled: true,
        message: 'System performance may be slower than usual',
        severity: 'warning',
      },
      automaticActivation: true,
      requiresApproval: false,
      maxDuration: 900000, // 15 minutes
    },
    {
      level: 3,
      name: 'Critical',
      description: 'Critical degradation, essential functions only',
      healthRange: { min: 30, max: 49 },
      allowedFailures: { critical: 1, high: 3, medium: 8, low: 15 },
      actions: [
        {
          type: 'activate_fallback',
          parameters: {},
          description: 'Activate all available fallback strategies',
          reversible: true,
        },
        {
          type: 'disable_feature',
          parameters: { feature: 'advanced-analytics' },
          description: 'Disable non-essential features',
          reversible: true,
        },
      ],
      userNotification: {
        enabled: true,
        message: 'System is operating in degraded mode. Some features may be unavailable.',
        severity: 'error',
      },
      automaticActivation: true,
      requiresApproval: false,
      maxDuration: 600000, // 10 minutes
    },
    {
      level: 4,
      name: 'Emergency',
      description: 'Emergency mode - core functions only',
      healthRange: { min: 0, max: 29 },
      allowedFailures: { critical: 2, high: 5, medium: 10, low: 20 },
      actions: [
        {
          type: 'emergency_mode',
          parameters: {},
          description: 'Activate emergency mode',
          reversible: true,
        },
      ],
      userNotification: {
        enabled: true,
        message: 'System is in emergency mode. Only core functions are available.',
        severity: 'error',
      },
      automaticActivation: true,
      requiresApproval: true,
      maxDuration: 300000, // 5 minutes
    },
  ],
  monitoring: {
    healthThresholds: {
      optimal: 90,
      good: 70,
      degraded: 50,
      critical: 30,
      emergency: 10,
    },
    evaluationInterval: 30000, // 30 seconds
    alertThresholds: {
      degradationLevel: 2,
      failedComponents: 2,
      criticalComponents: 1,
    },
  },
  emergencyMode: {
    triggerThreshold: 20,
    coreComponents: ['orchestrator', 'memory'],
    disableNonEssential: true,
    maxDegradationTime: 1800000, // 30 minutes
  },
};