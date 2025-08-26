import fs from 'fs-extra';
import path from 'path';
import { EventEmitter } from 'events';
import { LogContext } from '../utils/logger';
import { FeatureFlagError } from './types';
import type {
  FeatureFlag,
  Environment,
  FeatureFlagResult,
  FeatureFlagConfig,
  FeatureFlagContext,
  RolloutStrategy,
  TargetingRule,
} from './feature-flag-types';

/**
 * Feature Flag Engine for ForgeFlow V2
 * Provides runtime feature toggling with safe rollout capabilities
 */
export class FeatureFlagEngine extends EventEmitter {
  private logger = new LogContext('FeatureFlagEngine');
  private flags = new Map<string, FeatureFlag>();
  private contexts = new Map<string, FeatureFlagContext>();
  private config: FeatureFlagConfig;
  private evaluationCache = new Map<string, { value: boolean; expiry: number }>();
  private rolloutStrategies = new Map<string, RolloutStrategy>();
  private configPath: string;
  private watchingChanges = false;

  constructor(configPath: string, config?: FeatureFlagConfig) {
    super();
    this.configPath = configPath;
    this.config = config || this.getDefaultConfig();
    this.setupRolloutStrategies();
  }

  /**
   * Initialize the feature flag engine
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing Feature Flag Engine...');

    try {
      // Load feature flags from configuration
      await this.loadFeatureFlags();

      // Start watching for configuration changes if enabled
      if (this.config.watchChanges) {
        await this.startWatchingChanges();
      }

      // Setup automatic cache cleanup
      this.startCacheCleanup();

      this.logger.info('Feature Flag Engine initialized successfully');
      this.emit('initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Feature Flag Engine', error);
      throw new FeatureFlagError('Initialization failed', undefined);
    }
  }

  /**
   * Evaluate a feature flag
   */
  async evaluate(
    flagKey: string,
    context?: Partial<FeatureFlagContext>,
    defaultValue = false,
  ): Promise<FeatureFlagResult> {
    const startTime = Date.now();

    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(flagKey, context);
      const cached = this.evaluationCache.get(cacheKey);

      if (cached && cached.expiry > Date.now()) {
        return {
          flagKey,
          value: cached.value,
          defaultUsed: false,
          evaluationTime: Date.now() - startTime,
          reason: 'cached',
          context: context || {},
        };
      }

      // Get the feature flag
      const flag = this.flags.get(flagKey);
      if (!flag) {
        this.logger.warn(`Feature flag not found: ${flagKey}`);
        return {
          flagKey,
          value: defaultValue,
          defaultUsed: true,
          evaluationTime: Date.now() - startTime,
          reason: 'flag_not_found',
          context: context || {},
        };
      }

      // Check if flag is expired
      if (flag.expiresAt && flag.expiresAt < new Date()) {
        this.logger.warn(`Feature flag expired: ${flagKey}`);
        return {
          flagKey,
          value: defaultValue,
          defaultUsed: true,
          evaluationTime: Date.now() - startTime,
          reason: 'expired',
          context: context || {},
        };
      }

      // Evaluate the flag
      const evaluationContext = this.mergeContexts(context);
      const result = await this.evaluateFlag(flag, evaluationContext);

      // Cache the result
      if (this.config.enableCaching) {
        this.evaluationCache.set(cacheKey, {
          value: result.value,
          expiry: Date.now() + (this.config.cacheTtlMs || 60000),
        });
      }

      // Emit evaluation event
      this.emit('flagEvaluated', result);

      return result;
    } catch (error) {
      this.logger.error(`Failed to evaluate feature flag: ${flagKey}`, error);

      return {
        flagKey,
        value: defaultValue,
        defaultUsed: true,
        evaluationTime: Date.now() - startTime,
        reason: 'error',
        error: error.message,
        context: context || {},
      };
    }
  }

  /**
   * Create a new feature flag
   */
  async createFeatureFlag(
    flag: Omit<FeatureFlag, 'createdAt' | 'updatedAt'>,
  ): Promise<FeatureFlag> {
    this.logger.info(`Creating feature flag: ${flag.key}`);

    if (this.flags.has(flag.key)) {
      throw new FeatureFlagError(`Feature flag already exists: ${flag.key}`, flag.key);
    }

    const newFlag: FeatureFlag = {
      ...flag,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Validate the flag
    this.validateFlag(newFlag);

    this.flags.set(flag.key, newFlag);
    await this.saveFeatureFlags();

    this.emit('flagCreated', newFlag);
    this.logger.info(`Feature flag created: ${flag.key}`);

    return newFlag;
  }

  /**
   * Update an existing feature flag
   */
  async updateFeatureFlag(
    flagKey: string,
    updates: Partial<Omit<FeatureFlag, 'key' | 'createdAt' | 'updatedAt'>>,
  ): Promise<FeatureFlag> {
    this.logger.info(`Updating feature flag: ${flagKey}`);

    const existingFlag = this.flags.get(flagKey);
    if (!existingFlag) {
      throw new FeatureFlagError(`Feature flag not found: ${flagKey}`, flagKey);
    }

    const updatedFlag: FeatureFlag = {
      ...existingFlag,
      ...updates,
      updatedAt: new Date(),
    };

    // Validate the updated flag
    this.validateFlag(updatedFlag);

    this.flags.set(flagKey, updatedFlag);
    await this.saveFeatureFlags();

    // Clear cache for this flag
    this.clearFlagCache(flagKey);

    this.emit('flagUpdated', updatedFlag);
    this.logger.info(`Feature flag updated: ${flagKey}`);

    return updatedFlag;
  }

  /**
   * Delete a feature flag
   */
  async deleteFeatureFlag(flagKey: string): Promise<void> {
    this.logger.info(`Deleting feature flag: ${flagKey}`);

    if (!this.flags.has(flagKey)) {
      throw new FeatureFlagError(`Feature flag not found: ${flagKey}`, flagKey);
    }

    const flag = this.flags.get(flagKey);
    this.flags.delete(flagKey);
    await this.saveFeatureFlags();

    // Clear cache for this flag
    this.clearFlagCache(flagKey);

    this.emit('flagDeleted', flag);
    this.logger.info(`Feature flag deleted: ${flagKey}`);
  }

  /**
   * Get all feature flags
   */
  getAllFlags(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }

  /**
   * Get a specific feature flag
   */
  getFlag(flagKey: string): FeatureFlag | undefined {
    return this.flags.get(flagKey);
  }

  /**
   * Toggle a feature flag on/off
   */
  async toggleFlag(flagKey: string): Promise<FeatureFlag> {
    const flag = this.flags.get(flagKey);
    if (!flag) {
      throw new FeatureFlagError(`Feature flag not found: ${flagKey}`, flagKey);
    }

    return this.updateFeatureFlag(flagKey, {
      defaultValue: !flag.defaultValue,
    });
  }

  /**
   * Set rollout percentage for a flag
   */
  async setRolloutPercentage(flagKey: string, percentage: number): Promise<FeatureFlag> {
    if (percentage < 0 || percentage > 100) {
      throw new FeatureFlagError(`Invalid rollout percentage: ${percentage}`, flagKey);
    }

    return this.updateFeatureFlag(flagKey, {
      rolloutPercentage: percentage,
    });
  }

  /**
   * Add targeting rule to a flag
   */
  async addTargetingRule(flagKey: string, rule: TargetingRule): Promise<FeatureFlag> {
    const flag = this.flags.get(flagKey);
    if (!flag) {
      throw new FeatureFlagError(`Feature flag not found: ${flagKey}`, flagKey);
    }

    const targetingRules = [...(flag.targetingRules || []), rule];
    return this.updateFeatureFlag(flagKey, { targetingRules });
  }

  /**
   * Remove targeting rule from a flag
   */
  async removeTargetingRule(flagKey: string, ruleId: string): Promise<FeatureFlag> {
    const flag = this.flags.get(flagKey);
    if (!flag) {
      throw new FeatureFlagError(`Feature flag not found: ${flagKey}`, flagKey);
    }

    const targetingRules = (flag.targetingRules || []).filter((rule) => rule.id !== ruleId);
    return this.updateFeatureFlag(flagKey, { targetingRules });
  }

  /**
   * Set context for evaluations
   */
  setContext(contextId: string, context: FeatureFlagContext): void {
    this.contexts.set(contextId, { ...context, id: contextId });
    this.logger.debug(`Context set: ${contextId}`);
  }

  /**
   * Clear context
   */
  clearContext(contextId: string): void {
    this.contexts.delete(contextId);
    this.logger.debug(`Context cleared: ${contextId}`);
  }

  /**
   * Get evaluation statistics
   */
  getEvaluationStats(): any {
    const flags = Array.from(this.flags.values());
    const totalFlags = flags.length;
    const enabledFlags = flags.filter((f) => f.defaultValue).length;
    const flagsWithRollout = flags.filter(
      (f) => f.rolloutPercentage && f.rolloutPercentage > 0,
    ).length;
    const flagsWithTargeting = flags.filter(
      (f) => f.targetingRules && f.targetingRules.length > 0,
    ).length;
    const expiredFlags = flags.filter((f) => f.expiresAt && f.expiresAt < new Date()).length;

    return {
      totalFlags,
      enabledFlags,
      disabledFlags: totalFlags - enabledFlags,
      flagsWithRollout,
      flagsWithTargeting,
      expiredFlags,
      cacheSize: this.evaluationCache.size,
      contexts: this.contexts.size,
    };
  }

  /**
   * Export flags configuration
   */
  exportConfiguration(): any {
    const flags = Array.from(this.flags.values());
    return {
      version: '1.0.0',
      exported: new Date().toISOString(),
      flags: flags.map((flag) => ({
        ...flag,
        createdAt: flag.createdAt.toISOString(),
        updatedAt: flag.updatedAt.toISOString(),
        expiresAt: flag.expiresAt?.toISOString(),
      })),
    };
  }

  /**
   * Import flags configuration
   */
  async importConfiguration(config: any): Promise<void> {
    if (!config.flags || !Array.isArray(config.flags)) {
      throw new FeatureFlagError('Invalid configuration format');
    }

    this.flags.clear();

    for (const flagData of config.flags) {
      const flag: FeatureFlag = {
        ...flagData,
        createdAt: new Date(flagData.createdAt),
        updatedAt: new Date(flagData.updatedAt),
        expiresAt: flagData.expiresAt ? new Date(flagData.expiresAt) : undefined,
      };

      this.validateFlag(flag);
      this.flags.set(flag.key, flag);
    }

    await this.saveFeatureFlags();
    this.clearCache();

    this.emit('configurationImported', config);
    this.logger.info(`Imported ${config.flags.length} feature flags`);
  }

  /**
   * Private methods
   */
  private async loadFeatureFlags(): Promise<void> {
    const flagsPath = path.join(this.configPath, 'feature-flags.json');

    if (await fs.pathExists(flagsPath)) {
      try {
        const content = await fs.readFile(flagsPath, 'utf-8');
        const data = JSON.parse(content);

        if (data.flags) {
          for (const flagData of data.flags) {
            const flag: FeatureFlag = {
              ...flagData,
              createdAt: new Date(flagData.createdAt),
              updatedAt: new Date(flagData.updatedAt),
              expiresAt: flagData.expiresAt ? new Date(flagData.expiresAt) : undefined,
            };

            this.flags.set(flag.key, flag);
          }
        }

        this.logger.info(`Loaded ${this.flags.size} feature flags`);
      } catch (error) {
        this.logger.error('Failed to load feature flags', error);
      }
    } else {
      // Create default feature flags
      await this.createDefaultFlags();
    }
  }

  private async saveFeatureFlags(): Promise<void> {
    const flagsPath = path.join(this.configPath, 'feature-flags.json');
    await fs.ensureDir(path.dirname(flagsPath));

    const config = this.exportConfiguration();
    await fs.writeFile(flagsPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  private async createDefaultFlags(): Promise<void> {
    const defaultFlags: Omit<FeatureFlag, 'createdAt' | 'updatedAt'>[] = [
      {
        key: 'ff2.realtime_updates',
        name: 'Real-time Updates',
        description: 'Enable real-time updates in the dashboard',
        defaultValue: true,
        rolloutPercentage: 100,
      },
      {
        key: 'ff2.advanced_analytics',
        name: 'Advanced Analytics',
        description: 'Enable advanced analytics features',
        defaultValue: false,
        rolloutPercentage: 0,
      },
      {
        key: 'ff2.parallel_execution',
        name: 'Parallel Execution',
        description: 'Enable parallel agent execution',
        defaultValue: true,
        rolloutPercentage: 100,
      },
      {
        key: 'ff2.auto_backup',
        name: 'Automatic Backups',
        description: 'Enable automatic backup creation',
        defaultValue: true,
        rolloutPercentage: 100,
      },
    ];

    for (const flagData of defaultFlags) {
      await this.createFeatureFlag(flagData);
    }
  }

  private async evaluateFlag(
    flag: FeatureFlag,
    context: FeatureFlagContext,
  ): Promise<FeatureFlagResult> {
    const startTime = Date.now();

    try {
      // Check targeting rules first
      if (flag.targetingRules && flag.targetingRules.length > 0) {
        for (const rule of flag.targetingRules) {
          if (this.evaluateTargetingRule(rule, context)) {
            return {
              flagKey: flag.key,
              value: rule.value,
              defaultUsed: false,
              evaluationTime: Date.now() - startTime,
              reason: 'targeting_rule',
              ruleId: rule.id,
              context,
            };
          }
        }
      }

      // Check environment overrides
      if (flag.environments && context.environment) {
        const envOverride = flag.environments[context.environment];
        if (envOverride !== undefined) {
          return {
            flagKey: flag.key,
            value: envOverride,
            defaultUsed: false,
            evaluationTime: Date.now() - startTime,
            reason: 'environment_override',
            context,
          };
        }
      }

      // Check rollout percentage
      if (flag.rolloutPercentage !== undefined && flag.rolloutPercentage < 100) {
        const hash = this.hashContext(flag.key, context);
        const inRollout = hash % 100 < flag.rolloutPercentage;

        return {
          flagKey: flag.key,
          value: inRollout ? flag.defaultValue : false,
          defaultUsed: false,
          evaluationTime: Date.now() - startTime,
          reason: inRollout ? 'rollout_enabled' : 'rollout_disabled',
          rolloutPercentage: flag.rolloutPercentage,
          context,
        };
      }

      // Use default value
      return {
        flagKey: flag.key,
        value: flag.defaultValue,
        defaultUsed: false,
        evaluationTime: Date.now() - startTime,
        reason: 'default_value',
        context,
      };
    } catch (error) {
      this.logger.error(`Error evaluating flag ${flag.key}`, error);
      throw error;
    }
  }

  private evaluateTargetingRule(rule: TargetingRule, context: FeatureFlagContext): boolean {
    try {
      for (const condition of rule.conditions) {
        const contextValue = this.getContextValue(context, condition.attribute);

        if (!this.evaluateCondition(contextValue, condition.operator, condition.value)) {
          return false;
        }
      }
      return true;
    } catch (error) {
      this.logger.error('Error evaluating targeting rule', error);
      return false;
    }
  }

  private evaluateCondition(contextValue: any, operator: string, expectedValue: any): boolean {
    switch (operator) {
      case 'equals':
        return contextValue === expectedValue;
      case 'not_equals':
        return contextValue !== expectedValue;
      case 'in':
        return Array.isArray(expectedValue) && expectedValue.includes(contextValue);
      case 'not_in':
        return Array.isArray(expectedValue) && !expectedValue.includes(contextValue);
      case 'contains':
        return typeof contextValue === 'string' && contextValue.includes(expectedValue);
      case 'starts_with':
        return typeof contextValue === 'string' && contextValue.startsWith(expectedValue);
      case 'ends_with':
        return typeof contextValue === 'string' && contextValue.endsWith(expectedValue);
      case 'greater_than':
        return typeof contextValue === 'number' && contextValue > expectedValue;
      case 'less_than':
        return typeof contextValue === 'number' && contextValue < expectedValue;
      default:
        return false;
    }
  }

  private getContextValue(context: FeatureFlagContext, attribute: string): any {
    const keys = attribute.split('.');
    let value: any = context;

    for (const key of keys) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = value[key];
    }

    return value;
  }

  private hashContext(flagKey: string, context: FeatureFlagContext): number {
    const key = `${flagKey}:${context.userId || context.sessionId || 'anonymous'}`;
    let hash = 0;

    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    return Math.abs(hash);
  }

  private mergeContexts(context?: Partial<FeatureFlagContext>): FeatureFlagContext {
    const defaultContext: FeatureFlagContext = {
      timestamp: Date.now(),
      environment: (process.env.NODE_ENV as Environment) || 'development',
    };

    // Merge with stored contexts
    const mergedContext = { ...defaultContext };
    for (const storedContext of this.contexts.values()) {
      Object.assign(mergedContext, storedContext);
    }

    // Merge with provided context
    if (context) {
      Object.assign(mergedContext, context);
    }

    return mergedContext;
  }

  private generateCacheKey(flagKey: string, context?: Partial<FeatureFlagContext>): string {
    const contextStr = context ? JSON.stringify(context) : '';
    return `${flagKey}:${Buffer.from(contextStr).toString('base64')}`;
  }

  private clearFlagCache(flagKey: string): void {
    const keysToDelete = Array.from(this.evaluationCache.keys()).filter((key) =>
      key.startsWith(`${flagKey}:`),
    );

    for (const key of keysToDelete) {
      this.evaluationCache.delete(key);
    }
  }

  private clearCache(): void {
    this.evaluationCache.clear();
  }

  private startCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, cached] of this.evaluationCache) {
        if (cached.expiry <= now) {
          this.evaluationCache.delete(key);
        }
      }
    }, this.config.cacheCleanupIntervalMs || 60000);
  }

  private async startWatchingChanges(): Promise<void> {
    if (this.watchingChanges) return;

    const flagsPath = path.join(this.configPath, 'feature-flags.json');

    try {
      fs.watchFile(flagsPath, { interval: 1000 }, async () => {
        this.logger.info('Feature flags configuration changed, reloading...');
        await this.loadFeatureFlags();
        this.clearCache();
        this.emit('configurationReloaded');
      });

      this.watchingChanges = true;
      this.logger.info('Started watching feature flags configuration');
    } catch (error) {
      this.logger.error('Failed to start watching configuration changes', error);
    }
  }

  private validateFlag(flag: FeatureFlag): void {
    if (!flag.key || typeof flag.key !== 'string') {
      throw new FeatureFlagError('Flag key is required and must be a string');
    }

    if (!flag.name || typeof flag.name !== 'string') {
      throw new FeatureFlagError('Flag name is required and must be a string');
    }

    if (flag.rolloutPercentage !== undefined) {
      if (
        typeof flag.rolloutPercentage !== 'number' ||
        flag.rolloutPercentage < 0 ||
        flag.rolloutPercentage > 100
      ) {
        throw new FeatureFlagError('Rollout percentage must be a number between 0 and 100');
      }
    }

    if (flag.targetingRules) {
      for (const rule of flag.targetingRules) {
        if (!rule.id || !rule.conditions || !Array.isArray(rule.conditions)) {
          throw new FeatureFlagError('Invalid targeting rule format');
        }
      }
    }
  }

  private setupRolloutStrategies(): void {
    // Setup built-in rollout strategies
    this.rolloutStrategies.set('percentage', {
      name: 'Percentage',
      description: 'Roll out to a percentage of users',
      evaluate: (flag: FeatureFlag, context: FeatureFlagContext) => {
        if (!flag.rolloutPercentage) return flag.defaultValue;
        const hash = this.hashContext(flag.key, context);
        return hash % 100 < flag.rolloutPercentage;
      },
    });

    this.rolloutStrategies.set('user_list', {
      name: 'User List',
      description: 'Roll out to specific users',
      evaluate: (flag: FeatureFlag, context: FeatureFlagContext) => {
        if (!flag.targetSegments || !context.userId) return flag.defaultValue;
        return flag.targetSegments.includes(context.userId);
      },
    });
  }

  private getDefaultConfig(): FeatureFlagConfig {
    return {
      enableCaching: true,
      cacheTtlMs: 60000,
      cacheCleanupIntervalMs: 300000,
      watchChanges: true,
      auditLog: true,
      defaultRolloutStrategy: 'percentage',
    };
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    if (this.watchingChanges) {
      const flagsPath = path.join(this.configPath, 'feature-flags.json');
      fs.unwatchFile(flagsPath);
      this.watchingChanges = false;
    }

    this.clearCache();
    this.removeAllListeners();

    this.logger.info('Feature Flag Engine destroyed');
  }
}
