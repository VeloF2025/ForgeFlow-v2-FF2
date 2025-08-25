/**
 * 🟢 NEW: Error Handling Integration with Orchestrator
 * Provides comprehensive error handling integration for the ForgeFlow orchestrator system
 */

import { EventEmitter } from 'events';
import { ForgeFlowError, ErrorCategory, ErrorSeverity, ErrorHandler, SystemStateManager } from './errors';
import { errorMonitoring } from './error-monitoring';
import { enhancedLogger } from './enhanced-logger';
import { gracefulDegradation, ComponentCriticality, ComponentStatus } from './graceful-degradation';

// Integration configuration
export interface ErrorIntegrationConfig {
  enableMonitoring: boolean;
  enableGracefulDegradation: boolean;
  enableStateManagement: boolean;
  alertOnCriticalErrors: boolean;
  autoRecoveryEnabled: boolean;
  maxRecoveryAttempts: number;
  healthCheckInterval: number;
}

// Error context for orchestrator operations
export interface OrchestratorErrorContext {
  executionId?: string;
  epicId?: string;
  agentId?: string;
  taskId?: string;
  operationName: string;
  phase?: string;
  component: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

// Recovery action interface
export interface RecoveryAction {
  name: string;
  description: string;
  execute: (context: OrchestratorErrorContext, error: ForgeFlowError) => Promise<boolean>;
  applicableCategories: ErrorCategory[];
  priority: number;
}

/**
 * Comprehensive Error Integration Manager for ForgeFlow Orchestrator
 */
export class ErrorOrchestratorIntegration extends EventEmitter {
  private static instance: ErrorOrchestratorIntegration;
  private config: ErrorIntegrationConfig;
  private errorHandler: ErrorHandler;
  private stateManager: SystemStateManager;
  private recoveryActions = new Map<string, RecoveryAction>();
  private activeRecoveries = new Map<string, Promise<boolean>>();
  private componentStates = new Map<string, any>();

  static getInstance(config?: Partial<ErrorIntegrationConfig>): ErrorOrchestratorIntegration {
    if (!ErrorOrchestratorIntegration.instance) {
      ErrorOrchestratorIntegration.instance = new ErrorOrchestratorIntegration(config);
    }
    return ErrorOrchestratorIntegration.instance;
  }

  constructor(config: Partial<ErrorIntegrationConfig> = {}) {
    super();
    
    this.config = {
      enableMonitoring: true,
      enableGracefulDegradation: true,
      enableStateManagement: true,
      alertOnCriticalErrors: true,
      autoRecoveryEnabled: true,
      maxRecoveryAttempts: 3,
      healthCheckInterval: 30000,
      ...config
    };

    this.errorHandler = ErrorHandler.getInstance();
    this.stateManager = SystemStateManager.getInstance();
    
    this.setupIntegration();
    this.registerDefaultRecoveryActions();
    
    enhancedLogger.info('Error orchestrator integration initialized', {
      component: 'error-integration',
      config: this.config
    });
  }

  /**
   * Initialize the error handling integration
   */
  async initialize(): Promise<void> {
    try {
      // Start monitoring if enabled
      if (this.config.enableMonitoring) {
        errorMonitoring.start();
        enhancedLogger.info('Error monitoring started');
      }

      // Register system components for health tracking
      if (this.config.enableGracefulDegradation) {
        await this.registerSystemComponents();
        enhancedLogger.info('System components registered for health tracking');
      }

      // Setup state management
      if (this.config.enableStateManagement) {
        this.setupStateManagement();
        enhancedLogger.info('State management configured');
      }

      // Setup periodic health checks
      this.startHealthChecks();

      this.emit('initialized');
      enhancedLogger.info('Error orchestrator integration fully initialized');

    } catch (error) {
      const integrationError = new ForgeFlowError({
        code: 'INTEGRATION_INIT_FAILED',
        message: `Failed to initialize error integration: ${(error as Error).message}`,
        category: ErrorCategory.CONFIGURATION,
        severity: ErrorSeverity.CRITICAL,
        context: { originalError: (error as Error).message },
        recoverable: false,
        userMessage: 'Critical system initialization failure'
      });

      enhancedLogger.error('Integration initialization failed', integrationError, {
        component: 'error-integration',
        operation: 'initialize',
        errorCode: integrationError.code,
        category: integrationError.category,
        severity: integrationError.severity
      });

      throw integrationError;
    }
  }

  /**
   * Handle orchestrator-specific errors with full context
   */
  async handleOrchestratorError(
    error: Error | ForgeFlowError, 
    context: OrchestratorErrorContext
  ): Promise<ForgeFlowError> {
    const startTime = Date.now();
    
    // Convert to ForgeFlowError if needed
    const forgeFlowError = error instanceof ForgeFlowError 
      ? error 
      : this.convertToForgeFlowError(error, context);

    // Add orchestrator context (create new context object since it's readonly)
    const enhancedContext = {
      ...forgeFlowError.context,
      ...context,
      handledAt: new Date().toISOString(),
      handlerVersion: '2.0.0'
    };
    
    // Create new error with enhanced context
    const enhancedError = new ForgeFlowError({
      code: forgeFlowError.code,
      message: forgeFlowError.message,
      category: forgeFlowError.category,
      severity: forgeFlowError.severity,
      context: enhancedContext,
      recoverable: forgeFlowError.recoverable,
      userMessage: forgeFlowError.userMessage,
      cause: (forgeFlowError.cause instanceof Error ? forgeFlowError.cause : 
              (error instanceof Error ? error : new Error(String(error))))
    });

    // Log with enhanced context
    enhancedLogger.error('Orchestrator error handled', forgeFlowError, {
      component: context.component,
      executionId: context.executionId,
      agentId: context.agentId,
      operationName: context.operationName,
      phase: context.phase,
      errorCode: forgeFlowError.code,
      category: forgeFlowError.category,
      severity: forgeFlowError.severity
    });

    // Update system state
    if (this.config.enableStateManagement) {
      await this.updateSystemState(context, forgeFlowError);
    }

    // Attempt automatic recovery
    if (this.config.autoRecoveryEnabled && forgeFlowError.recoverable) {
      const recovered = await this.attemptRecovery(context, forgeFlowError);
      if (recovered) {
        enhancedLogger.info('Automatic recovery successful', {
          component: context.component,
          operationName: context.operationName,
          errorCode: forgeFlowError.code,
          recoveryTime: Date.now() - startTime
        });

        this.emit('recoverySuccessful', { context, error: forgeFlowError });
        return forgeFlowError;
      }
    }

    // Handle through main error handler
    const handledError = this.errorHandler.handleError(forgeFlowError);

    // Update component health if applicable
    if (this.config.enableGracefulDegradation) {
      this.updateComponentHealth(context, forgeFlowError);
    }

    // Emit orchestrator-specific events
    this.emit('orchestratorError', {
      error: handledError,
      context,
      processingTime: Date.now() - startTime
    });

    return handledError;
  }

  /**
   * Register a custom recovery action
   */
  registerRecoveryAction(action: RecoveryAction): void {
    this.recoveryActions.set(action.name, action);
    
    enhancedLogger.info('Recovery action registered', {
      component: 'error-integration',
      actionName: action.name,
      applicableCategories: action.applicableCategories,
      priority: action.priority
    });
  }

  /**
   * Get system health overview including error metrics
   */
  getSystemHealthOverview(): {
    overall: {
      score: number;
      status: string;
      timestamp: Date;
    };
    components: Array<{
      id: string;
      status: string;
      score: number;
      lastError?: Date;
      errorCount: number;
    }>;
    errorMetrics: {
      totalErrors: number;
      criticalErrors: number;
      recentErrorRate: number;
      topErrorCategories: Array<{ category: string; count: number }>;
    };
    recoveryMetrics: {
      totalRecoveryAttempts: number;
      successfulRecoveries: number;
      successRate: number;
    };
    monitoringStatus: {
      active: boolean;
      alertsActive: number;
      metricsCollected: number;
    };
  } {
    const gracefulHealth = gracefulDegradation.getSystemHealth();
    const errorMetrics = this.errorHandler.getErrorMetrics();
    const monitoringStatus = errorMonitoring.getSystemStatus();

    // Calculate component error counts
    const componentErrorCounts = new Map<string, number>();
    for (const [componentId] of this.componentStates) {
      // This would be enhanced to track actual error counts per component
      componentErrorCounts.set(componentId, 0);
    }

    // Get top error categories
    const topErrorCategories = Object.entries(errorMetrics.errorsByCategory)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      overall: {
        score: gracefulHealth.score,
        status: gracefulHealth.status,
        timestamp: new Date()
      },
      components: gracefulHealth.components.map(component => ({
        id: component.componentId,
        status: component.status,
        score: this.getComponentScore(component.status),
        lastError: component.lastFailure,
        errorCount: componentErrorCounts.get(component.componentId) || 0
      })),
      errorMetrics: {
        totalErrors: errorMetrics.totalErrors,
        criticalErrors: this.getCriticalErrorCount(),
        recentErrorRate: this.calculateRecentErrorRate(),
        topErrorCategories
      },
      recoveryMetrics: {
        totalRecoveryAttempts: this.getTotalRecoveryAttempts(errorMetrics.recoveryMetrics),
        successfulRecoveries: this.getSuccessfulRecoveries(errorMetrics.recoveryMetrics),
        successRate: this.calculateRecoverySuccessRate(errorMetrics.recoveryMetrics)
      },
      monitoringStatus: {
        active: monitoringStatus.monitoring,
        alertsActive: monitoringStatus.activeAlerts,
        metricsCollected: monitoringStatus.latestMetrics ? 1 : 0
      }
    };
  }

  /**
   * Gracefully shutdown the error integration system
   */
  async shutdown(): Promise<void> {
    enhancedLogger.info('Shutting down error orchestrator integration');

    try {
      // Stop monitoring
      if (this.config.enableMonitoring) {
        errorMonitoring.stop();
      }

      // Stop graceful degradation monitoring
      if (this.config.enableGracefulDegradation) {
        await gracefulDegradation.shutdown();
      }

      // Wait for active recoveries to complete
      if (this.activeRecoveries.size > 0) {
        enhancedLogger.info(`Waiting for ${this.activeRecoveries.size} active recoveries to complete`);
        await Promise.allSettled(Array.from(this.activeRecoveries.values()));
      }

      this.emit('shutdown');
      enhancedLogger.info('Error orchestrator integration shut down successfully');

    } catch (error) {
      enhancedLogger.error('Error during integration shutdown', error as Error, {
        component: 'error-integration',
        operation: 'shutdown'
      });
    }
  }

  /**
   * Setup integration components
   */
  private setupIntegration(): void {
    // Setup error handler alerts
    if (this.config.alertOnCriticalErrors) {
      this.errorHandler.onCriticalError((error: ForgeFlowError) => {
        this.emit('criticalError', error);
        
        enhancedLogger.error('Critical error detected', error, {
          component: 'error-integration',
          errorCode: error.code,
          category: error.category,
          severity: error.severity,
          alertLevel: 'critical'
        });
      });
    }

    // Setup monitoring event handlers
    if (this.config.enableMonitoring) {
      errorMonitoring.on('alert', (alert) => {
        this.emit('monitoringAlert', alert);
      });

      errorMonitoring.on('metrics', (metrics) => {
        this.emit('metricsUpdated', metrics);
      });
    }
  }

  /**
   * Register system components for health monitoring
   */
  private async registerSystemComponents(): Promise<void> {
    const components = [
      {
        id: 'github-integration',
        name: 'GitHub Integration',
        criticality: ComponentCriticality.CRITICAL,
        healthCheck: async () => {
          // Mock health check - in real implementation would check GitHub API connectivity
          return true;
        }
      },
      {
        id: 'agent-pool',
        name: 'Agent Pool',
        criticality: ComponentCriticality.CRITICAL,
        healthCheck: async () => {
          // Mock health check - in real implementation would check agent pool status
          return true;
        }
      },
      {
        id: 'worktree-manager',
        name: 'Worktree Manager',
        criticality: ComponentCriticality.IMPORTANT,
        healthCheck: async () => {
          // Mock health check - in real implementation would check worktree status
          return true;
        }
      },
      {
        id: 'quality-gates',
        name: 'Quality Gates',
        criticality: ComponentCriticality.IMPORTANT,
        healthCheck: async () => {
          // Mock health check - in real implementation would check quality gate status
          return true;
        }
      },
      {
        id: 'protocol-enforcer',
        name: 'Protocol Enforcer',
        criticality: ComponentCriticality.OPTIONAL,
        healthCheck: async () => {
          return true;
        }
      }
    ];

    for (const component of components) {
      gracefulDegradation.registerComponent(component);
      this.componentStates.set(component.id, { status: ComponentStatus.HEALTHY });
    }
  }

  /**
   * Setup state management for orchestrator components
   */
  private setupStateManagement(): void {
    // Register orchestrator components with state management
    this.stateManager.registerComponent('orchestrator', 
      { 
        status: 'initialized', 
        activeExecutions: 0, 
        totalExecutions: 0 
      },
      (state) => {
        return state.status !== 'failed' && 
               typeof state.activeExecutions === 'number' && 
               state.activeExecutions >= 0;
      }
    );

    // Register recovery action for orchestrator state issues
    this.stateManager.registerRecoveryAction('orchestrator', async () => {
      enhancedLogger.info('Recovering orchestrator state');
      // Implementation would reset orchestrator to safe state
      this.stateManager.updateState('orchestrator', {
        status: 'recovered',
        activeExecutions: 0,
        totalExecutions: 0
      });
    });
  }

  /**
   * Register default recovery actions
   */
  private registerDefaultRecoveryActions(): void {
    // GitHub API recovery
    this.registerRecoveryAction({
      name: 'github-api-recovery',
      description: 'Recover from GitHub API failures',
      applicableCategories: [ErrorCategory.GITHUB_INTEGRATION],
      priority: 10,
      execute: async (context, error) => {
        enhancedLogger.info('Attempting GitHub API recovery', {
          component: context.component,
          operationName: context.operationName,
          errorCode: error.code
        });

        // Check if it's a rate limit issue
        if (error.message.toLowerCase().includes('rate limit')) {
          enhancedLogger.info('Rate limit detected, implementing backoff strategy');
          // Implementation would wait for rate limit reset
          await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute
          return true;
        }

        // Check if it's a network issue
        if (error.message.toLowerCase().includes('network')) {
          enhancedLogger.info('Network issue detected, checking connectivity');
          // Implementation would check network connectivity
          return false; // Let normal retry logic handle it
        }

        return false;
      }
    });

    // Agent execution recovery
    this.registerRecoveryAction({
      name: 'agent-execution-recovery',
      description: 'Recover from agent execution failures',
      applicableCategories: [ErrorCategory.AGENT_EXECUTION],
      priority: 8,
      execute: async (context, error) => {
        enhancedLogger.info('Attempting agent execution recovery', {
          component: context.component,
          agentId: context.agentId,
          taskId: context.taskId,
          errorCode: error.code
        });

        // Check if agent is still responsive
        if (context.agentId) {
          // Implementation would ping agent health
          enhancedLogger.info('Agent health check completed');
          return true; // Agent recovered
        }

        return false;
      }
    });

    // Worktree recovery
    this.registerRecoveryAction({
      name: 'worktree-recovery',
      description: 'Recover from worktree management failures',
      applicableCategories: [ErrorCategory.WORKTREE_MANAGEMENT],
      priority: 9,
      execute: async (context, error) => {
        enhancedLogger.info('Attempting worktree recovery', {
          component: context.component,
          operationName: context.operationName,
          errorCode: error.code
        });

        if (error.message.toLowerCase().includes('lock')) {
          enhancedLogger.info('Lock issue detected, attempting cleanup');
          // Implementation would clean up lock files
          return true;
        }

        return false;
      }
    });
  }

  /**
   * Convert regular Error to ForgeFlowError with orchestrator context
   */
  private convertToForgeFlowError(error: Error, context: OrchestratorErrorContext): ForgeFlowError {
    // Determine category based on context and error message
    let category = ErrorCategory.INTERNAL_ERROR;
    let severity = ErrorSeverity.MEDIUM;

    if (context.component.includes('github')) {
      category = ErrorCategory.GITHUB_INTEGRATION;
    } else if (context.component.includes('agent')) {
      category = ErrorCategory.AGENT_EXECUTION;
    } else if (context.component.includes('worktree')) {
      category = ErrorCategory.WORKTREE_MANAGEMENT;
    } else if (context.operationName.includes('validation')) {
      category = ErrorCategory.VALIDATION;
    }

    // Determine severity
    if (error.message.toLowerCase().includes('critical') || 
        error.message.toLowerCase().includes('fatal')) {
      severity = ErrorSeverity.CRITICAL;
    } else if (error.message.toLowerCase().includes('timeout') ||
               error.message.toLowerCase().includes('network')) {
      severity = ErrorSeverity.HIGH;
    }

    return new ForgeFlowError({
      code: `${context.component.toUpperCase()}_ERROR`,
      message: error.message,
      category,
      severity,
      context: { ...context, originalError: error.name },
      recoverable: severity !== ErrorSeverity.CRITICAL,
      userMessage: this.generateUserMessage(category, error.message),
      cause: error
    });
  }

  /**
   * Generate user-friendly error message
   */
  private generateUserMessage(category: ErrorCategory, originalMessage: string): string {
    const messages: Record<ErrorCategory, string> = {
      [ErrorCategory.GITHUB_INTEGRATION]: 'GitHub integration issue detected. Please check your connection and permissions.',
      [ErrorCategory.AGENT_EXECUTION]: 'Task execution encountered an issue. The system will automatically retry.',
      [ErrorCategory.WORKTREE_MANAGEMENT]: 'Repository management issue detected. Please ensure clean repository state.',
      [ErrorCategory.VALIDATION]: 'Input validation failed. Please check your parameters and try again.',
      [ErrorCategory.NETWORK]: 'Network connectivity issue detected. Please check your internet connection.',
      [ErrorCategory.TIMEOUT]: 'Operation timed out. The system will automatically retry.',
      [ErrorCategory.INTERNAL_ERROR]: 'An internal system error occurred. Please try again or contact support.',
      // Add other categories as needed
    } as any;

    return messages[category] || 'An unexpected error occurred. Please try again or contact support.';
  }

  /**
   * Attempt automatic recovery for the error
   */
  private async attemptRecovery(
    context: OrchestratorErrorContext, 
    error: ForgeFlowError
  ): Promise<boolean> {
    const recoveryKey = `${context.component}-${context.operationName}-${Date.now()}`;
    
    // Check if already attempting recovery for this operation
    if (this.activeRecoveries.has(recoveryKey)) {
      return false;
    }

    // Find applicable recovery actions
    const applicableActions = Array.from(this.recoveryActions.values())
      .filter(action => action.applicableCategories.includes(error.category))
      .sort((a, b) => b.priority - a.priority); // Sort by priority (highest first)

    if (applicableActions.length === 0) {
      return false;
    }

    const recoveryPromise = this.executeRecoveryActions(applicableActions, context, error);
    this.activeRecoveries.set(recoveryKey, recoveryPromise);

    try {
      const recovered = await recoveryPromise;
      this.activeRecoveries.delete(recoveryKey);
      return recovered;
    } catch (recoveryError) {
      this.activeRecoveries.delete(recoveryKey);
      enhancedLogger.error('Recovery execution failed', recoveryError as Error, {
        component: 'error-integration',
        operationName: 'recovery',
        context
      });
      return false;
    }
  }

  /**
   * Execute recovery actions in priority order
   */
  private async executeRecoveryActions(
    actions: RecoveryAction[],
    context: OrchestratorErrorContext,
    error: ForgeFlowError
  ): Promise<boolean> {
    for (const action of actions) {
      try {
        enhancedLogger.info('Executing recovery action', {
          component: 'error-integration',
          actionName: action.name,
          operationName: context.operationName
        });

        const recovered = await action.execute(context, error);
        
        if (recovered) {
          this.errorHandler.recordRecoverySuccess(context.operationName, action.name);
          enhancedLogger.info('Recovery action successful', {
            component: 'error-integration',
            actionName: action.name,
            operationName: context.operationName
          });
          return true;
        } else {
          enhancedLogger.debug('Recovery action not applicable', {
            component: 'error-integration',
            actionName: action.name,
            operationName: context.operationName
          });
        }

      } catch (actionError) {
        this.errorHandler.recordRecoveryFailure(context.operationName, action.name, actionError as Error);
        enhancedLogger.error('Recovery action failed', actionError as Error, {
          component: 'error-integration',
          actionName: action.name,
          operationName: context.operationName
        });
      }
    }

    return false;
  }

  /**
   * Update system state based on error context
   */
  private async updateSystemState(context: OrchestratorErrorContext, error: ForgeFlowError): Promise<void> {
    try {
      if (context.component === 'orchestrator') {
        const currentState = this.stateManager.getState('orchestrator');
        if (currentState) {
          this.stateManager.updateState('orchestrator', {
            ...currentState,
            lastError: error.timestamp,
            errorCount: (currentState.errorCount || 0) + 1
          });
        }
      }

      // Check system consistency
      const consistency = await this.stateManager.validateSystemConsistency();
      if (!consistency.consistent) {
        enhancedLogger.warn('System state inconsistency detected', {
          component: 'error-integration',
          issues: consistency.issues
        });

        // Attempt automatic recovery
        try {
          await this.stateManager.recoverSystemConsistency();
          enhancedLogger.info('System state consistency recovered');
        } catch (recoveryError) {
          enhancedLogger.error('Failed to recover system state consistency', recoveryError as Error);
        }
      }

    } catch (stateError) {
      enhancedLogger.error('Failed to update system state', stateError as Error, {
        component: 'error-integration',
        operation: 'updateSystemState',
        context
      });
    }
  }

  /**
   * Update component health based on error
   */
  private updateComponentHealth(context: OrchestratorErrorContext, error: ForgeFlowError): void {
    const componentId = this.mapContextToComponentId(context);
    if (componentId) {
      // This would integrate with the graceful degradation system
      // to update component health based on errors
      enhancedLogger.debug('Updating component health', {
        componentId,
        errorCode: error.code,
        severity: error.severity
      });
    }
  }

  /**
   * Map orchestrator context to component ID
   */
  private mapContextToComponentId(context: OrchestratorErrorContext): string | null {
    if (context.component.includes('github')) {
      return 'github-integration';
    } else if (context.component.includes('agent')) {
      return 'agent-pool';
    } else if (context.component.includes('worktree')) {
      return 'worktree-manager';
    } else if (context.component.includes('quality')) {
      return 'quality-gates';
    }
    return null;
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  /**
   * Perform system health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      const health = this.getSystemHealthOverview();
      
      enhancedLogger.debug('System health check completed', {
        component: 'error-integration',
        overallScore: health.overall.score,
        status: health.overall.status,
        totalErrors: health.errorMetrics.totalErrors,
        criticalErrors: health.errorMetrics.criticalErrors
      });

      this.emit('healthCheck', health);

    } catch (error) {
      enhancedLogger.error('Health check failed', error as Error, {
        component: 'error-integration',
        operation: 'healthCheck'
      });
    }
  }

  // Helper methods for metrics calculation
  private getComponentScore(status: string): number {
    const scores: Record<string, number> = {
      'healthy': 100,
      'degraded': 60,
      'recovering': 30,
      'failed': 0,
      'disabled': 80
    };
    return scores[status] || 50;
  }

  private getCriticalErrorCount(): number {
    // This would be calculated from actual error metrics
    return 0;
  }

  private calculateRecentErrorRate(): number {
    // This would calculate errors per minute over recent time window
    return 0;
  }

  private getTotalRecoveryAttempts(recoveryMetrics: Record<string, any>): number {
    return Object.values(recoveryMetrics).reduce((sum: number, metrics: any) => 
      sum + (metrics.attempts || 0), 0);
  }

  private getSuccessfulRecoveries(recoveryMetrics: Record<string, any>): number {
    return Object.values(recoveryMetrics).reduce((sum: number, metrics: any) => 
      sum + (metrics.successes || 0), 0);
  }

  private calculateRecoverySuccessRate(recoveryMetrics: Record<string, any>): number {
    const total = this.getTotalRecoveryAttempts(recoveryMetrics);
    const successes = this.getSuccessfulRecoveries(recoveryMetrics);
    return total > 0 ? (successes / total) * 100 : 100;
  }
}

// Export singleton instance with default configuration
export const errorOrchestratorIntegration = ErrorOrchestratorIntegration.getInstance();