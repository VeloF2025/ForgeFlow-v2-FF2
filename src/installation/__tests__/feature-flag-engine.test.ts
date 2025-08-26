import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { FeatureFlagEngine } from '../feature-flag-engine';
import type { FeatureFlag, FeatureFlagContext } from '../feature-flag-types';

// Mock dependencies
vi.mock('fs-extra');

const mockedFs = vi.mocked(fs);

describe('FeatureFlagEngine', () => {
  let featureFlagEngine: FeatureFlagEngine;
  let mockConfigPath: string;
  let testFlagsFile: string;

  beforeEach(() => {
    mockConfigPath = '/test/config';
    testFlagsFile = path.join(mockConfigPath, 'feature-flags.json');
    featureFlagEngine = new FeatureFlagEngine(mockConfigPath);

    vi.clearAllMocks();

    // Setup default mock implementations
    (mockedFs.pathExists as any).mockResolvedValue(false);
    (mockedFs.ensureDir as any).mockResolvedValue();
    (mockedFs.writeFile as any).mockResolvedValue();
    (mockedFs.readFile as any).mockResolvedValue('{"version": "1.0.0", "flags": []}');
  });

  afterEach(async () => {
    await featureFlagEngine.destroy();
  });

  describe('initialization', () => {
    it('should initialize successfully with empty configuration', async () => {
      await expect(featureFlagEngine.initialize()).resolves.not.toThrow();
    });

    it('should create default feature flags when no file exists', async () => {
      (mockedFs.pathExists as any).mockResolvedValue(false);

      await featureFlagEngine.initialize();

      expect(mockedFs.writeFile).toHaveBeenCalled();

      const flags = featureFlagEngine.getAllFlags();
      expect(flags.length).toBeGreaterThan(0);
      expect(flags.some((f) => f.key === 'ff2.realtime_updates')).toBe(true);
      expect(flags.some((f) => f.key === 'ff2.parallel_execution')).toBe(true);
    });

    it('should load existing feature flags from file', async () => {
      const mockFlags = {
        version: '1.0.0',
        flags: [
          {
            key: 'test.flag',
            name: 'Test Flag',
            description: 'Test flag description',
            defaultValue: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };

      (mockedFs.pathExists as any).mockResolvedValue(true);
      (mockedFs.readFile as any).mockResolvedValue(JSON.stringify(mockFlags));

      await featureFlagEngine.initialize();

      const flags = featureFlagEngine.getAllFlags();
      expect(flags).toHaveLength(1);
      expect(flags[0].key).toBe('test.flag');
      expect(flags[0].name).toBe('Test Flag');
    });

    it('should handle malformed configuration files gracefully', async () => {
      // Write real invalid JSON file
      await fs.writeFile(testFlagsFile, 'invalid json');

      await expect(featureFlagEngine.initialize()).resolves.not.toThrow();

      // Should have created default flags instead
      const flags = featureFlagEngine.getAllFlags();
      expect(flags.length).toBeGreaterThan(0);
    });
  });

  describe('feature flag evaluation', () => {
    beforeEach(async () => {
      await featureFlagEngine.initialize();
    });

    it('should return default value for enabled flag', async () => {
      await featureFlagEngine.createFeatureFlag({
        key: 'test.enabled',
        name: 'Test Enabled',
        description: 'Test flag that is enabled',
        defaultValue: true,
      });

      const result = await featureFlagEngine.evaluate('test.enabled');

      expect(result.value).toBe(true);
      expect(result.defaultUsed).toBe(false);
      expect(result.reason).toBe('default_value');
    });

    it('should return default value for disabled flag', async () => {
      await featureFlagEngine.createFeatureFlag({
        key: 'test.disabled',
        name: 'Test Disabled',
        description: 'Test flag that is disabled',
        defaultValue: false,
      });

      const result = await featureFlagEngine.evaluate('test.disabled');

      expect(result.value).toBe(false);
      expect(result.defaultUsed).toBe(false);
      expect(result.reason).toBe('default_value');
    });

    it('should return fallback value for non-existent flag', async () => {
      const result = await featureFlagEngine.evaluate('non.existent', undefined, true);

      expect(result.value).toBe(true);
      expect(result.defaultUsed).toBe(true);
      expect(result.reason).toBe('flag_not_found');
    });

    it('should handle rollout percentage correctly', async () => {
      await featureFlagEngine.createFeatureFlag({
        key: 'test.rollout',
        name: 'Test Rollout',
        description: 'Test flag with 50% rollout',
        defaultValue: true,
        rolloutPercentage: 50,
      });

      // Test multiple evaluations to verify percentage logic
      const results = await Promise.all([
        featureFlagEngine.evaluate('test.rollout', { userId: 'user1' }),
        featureFlagEngine.evaluate('test.rollout', { userId: 'user2' }),
        featureFlagEngine.evaluate('test.rollout', { userId: 'user3' }),
        featureFlagEngine.evaluate('test.rollout', { userId: 'user4' }),
      ]);

      // Should have consistent results for same user
      const user1Result1 = await featureFlagEngine.evaluate('test.rollout', { userId: 'user1' });
      const user1Result2 = await featureFlagEngine.evaluate('test.rollout', { userId: 'user1' });
      expect(user1Result1.value).toBe(user1Result2.value);

      // Should have rollout reasons
      results.forEach((result) => {
        expect(['rollout_enabled', 'rollout_disabled']).toContain(result.reason);
        expect(result.rolloutPercentage).toBe(50);
      });
    });

    it('should respect environment overrides', async () => {
      await featureFlagEngine.createFeatureFlag({
        key: 'test.env',
        name: 'Test Environment',
        description: 'Test flag with environment override',
        defaultValue: false,
        environments: {
          development: true,
          production: false,
          staging: false,
          testing: false,
        },
      });

      const devResult = await featureFlagEngine.evaluate('test.env', {
        environment: 'development',
      });
      const prodResult = await featureFlagEngine.evaluate('test.env', {
        environment: 'production',
      });

      expect(devResult.value).toBe(true);
      expect(devResult.reason).toBe('environment_override');
      expect(prodResult.value).toBe(false);
      expect(prodResult.reason).toBe('environment_override');
    });

    it('should handle expired flags correctly', async () => {
      const expiredDate = new Date();
      expiredDate.setDate(expiredDate.getDate() - 1); // Yesterday

      await featureFlagEngine.createFeatureFlag({
        key: 'test.expired',
        name: 'Test Expired',
        description: 'Test flag that has expired',
        defaultValue: true,
        expiresAt: expiredDate,
      });

      const result = await featureFlagEngine.evaluate('test.expired', undefined, false);

      expect(result.value).toBe(false);
      expect(result.defaultUsed).toBe(true);
      expect(result.reason).toBe('expired');
    });

    it('should measure evaluation time', async () => {
      await featureFlagEngine.createFeatureFlag({
        key: 'test.timing',
        name: 'Test Timing',
        description: 'Test flag for timing measurement',
        defaultValue: true,
      });

      const result = await featureFlagEngine.evaluate('test.timing');

      expect(result.evaluationTime).toBeGreaterThan(0);
      expect(result.evaluationTime).toBeLessThan(100); // Should be fast
    });
  });

  describe('targeting rules', () => {
    beforeEach(async () => {
      await featureFlagEngine.initialize();
    });

    it('should evaluate targeting rules correctly', async () => {
      const flag = await featureFlagEngine.createFeatureFlag({
        key: 'test.targeting',
        name: 'Test Targeting',
        description: 'Test flag with targeting rules',
        defaultValue: false,
        targetingRules: [
          {
            id: 'rule1',
            name: 'Admin Users',
            conditions: [
              {
                attribute: 'role',
                operator: 'equals',
                value: 'admin',
              },
            ],
            value: true,
          },
        ],
      });

      const adminResult = await featureFlagEngine.evaluate('test.targeting', { role: 'admin' });
      const userResult = await featureFlagEngine.evaluate('test.targeting', { role: 'user' });

      expect(adminResult.value).toBe(true);
      expect(adminResult.reason).toBe('targeting_rule');
      expect(adminResult.ruleId).toBe('rule1');

      expect(userResult.value).toBe(false);
      expect(userResult.reason).toBe('default_value');
    });

    it('should handle multiple targeting conditions', async () => {
      await featureFlagEngine.createFeatureFlag({
        key: 'test.multi.conditions',
        name: 'Test Multi Conditions',
        description: 'Test flag with multiple conditions',
        defaultValue: false,
        targetingRules: [
          {
            id: 'rule1',
            name: 'Power Users',
            conditions: [
              {
                attribute: 'role',
                operator: 'equals',
                value: 'admin',
              },
              {
                attribute: 'environment',
                operator: 'equals',
                value: 'production',
              },
            ],
            value: true,
          },
        ],
      });

      const matchResult = await featureFlagEngine.evaluate('test.multi.conditions', {
        role: 'admin',
        environment: 'production',
      });

      const partialMatchResult = await featureFlagEngine.evaluate('test.multi.conditions', {
        role: 'admin',
        environment: 'development',
      });

      expect(matchResult.value).toBe(true);
      expect(matchResult.reason).toBe('targeting_rule');

      expect(partialMatchResult.value).toBe(false);
      expect(partialMatchResult.reason).toBe('default_value');
    });

    it('should support different targeting operators', async () => {
      await featureFlagEngine.createFeatureFlag({
        key: 'test.operators',
        name: 'Test Operators',
        description: 'Test flag with various operators',
        defaultValue: false,
        targetingRules: [
          {
            id: 'in_rule',
            name: 'In Rule',
            conditions: [
              {
                attribute: 'userId',
                operator: 'in',
                value: ['user1', 'user2', 'user3'],
              },
            ],
            value: true,
          },
          {
            id: 'contains_rule',
            name: 'Contains Rule',
            conditions: [
              {
                attribute: 'email',
                operator: 'contains',
                value: '@admin.com',
              },
            ],
            value: true,
          },
        ],
      });

      const inResult = await featureFlagEngine.evaluate('test.operators', { userId: 'user2' });
      const containsResult = await featureFlagEngine.evaluate('test.operators', {
        email: 'test@admin.com',
      });
      const noMatchResult = await featureFlagEngine.evaluate('test.operators', { userId: 'user5' });

      expect(inResult.value).toBe(true);
      expect(containsResult.value).toBe(true);
      expect(noMatchResult.value).toBe(false);
    });
  });

  describe('flag management', () => {
    beforeEach(async () => {
      await featureFlagEngine.initialize();
    });

    it('should create feature flags correctly', async () => {
      const flagData = {
        key: 'test.create',
        name: 'Test Create',
        description: 'Test flag creation',
        defaultValue: true,
        rolloutPercentage: 75,
      };

      const flag = await featureFlagEngine.createFeatureFlag(flagData);

      expect(flag.key).toBe(flagData.key);
      expect(flag.name).toBe(flagData.name);
      expect(flag.defaultValue).toBe(flagData.defaultValue);
      expect(flag.rolloutPercentage).toBe(flagData.rolloutPercentage);
      expect(flag.createdAt).toBeInstanceOf(Date);
      expect(flag.updatedAt).toBeInstanceOf(Date);
    });

    it('should prevent creating duplicate flags', async () => {
      const flagData = {
        key: 'test.duplicate',
        name: 'Test Duplicate',
        description: 'Test duplicate flag',
        defaultValue: true,
      };

      await featureFlagEngine.createFeatureFlag(flagData);

      await expect(featureFlagEngine.createFeatureFlag(flagData)).rejects.toThrow(
        'Feature flag already exists',
      );
    });

    it('should update feature flags correctly', async () => {
      const originalFlag = await featureFlagEngine.createFeatureFlag({
        key: 'test.update',
        name: 'Test Update',
        description: 'Original description',
        defaultValue: false,
      });

      const updatedFlag = await featureFlagEngine.updateFeatureFlag('test.update', {
        name: 'Updated Name',
        description: 'Updated description',
        defaultValue: true,
        rolloutPercentage: 50,
      });

      expect(updatedFlag.name).toBe('Updated Name');
      expect(updatedFlag.description).toBe('Updated description');
      expect(updatedFlag.defaultValue).toBe(true);
      expect(updatedFlag.rolloutPercentage).toBe(50);
      expect(updatedFlag.updatedAt.getTime()).toBeGreaterThan(originalFlag.updatedAt.getTime());
    });

    it('should delete feature flags correctly', async () => {
      await featureFlagEngine.createFeatureFlag({
        key: 'test.delete',
        name: 'Test Delete',
        description: 'Test flag deletion',
        defaultValue: true,
      });

      expect(featureFlagEngine.getFlag('test.delete')).toBeDefined();

      await featureFlagEngine.deleteFeatureFlag('test.delete');

      expect(featureFlagEngine.getFlag('test.delete')).toBeUndefined();
    });

    it('should toggle feature flags correctly', async () => {
      await featureFlagEngine.createFeatureFlag({
        key: 'test.toggle',
        name: 'Test Toggle',
        description: 'Test flag toggling',
        defaultValue: false,
      });

      const toggledFlag = await featureFlagEngine.toggleFlag('test.toggle');

      expect(toggledFlag.defaultValue).toBe(true);

      const toggledAgain = await featureFlagEngine.toggleFlag('test.toggle');

      expect(toggledAgain.defaultValue).toBe(false);
    });

    it('should set rollout percentage correctly', async () => {
      await featureFlagEngine.createFeatureFlag({
        key: 'test.rollout.percentage',
        name: 'Test Rollout Percentage',
        description: 'Test rollout percentage setting',
        defaultValue: true,
      });

      const updatedFlag = await featureFlagEngine.setRolloutPercentage(
        'test.rollout.percentage',
        25,
      );

      expect(updatedFlag.rolloutPercentage).toBe(25);
    });

    it('should validate rollout percentage bounds', async () => {
      await featureFlagEngine.createFeatureFlag({
        key: 'test.rollout.bounds',
        name: 'Test Rollout Bounds',
        description: 'Test rollout percentage bounds',
        defaultValue: true,
      });

      await expect(
        featureFlagEngine.setRolloutPercentage('test.rollout.bounds', -10),
      ).rejects.toThrow('Invalid rollout percentage');

      await expect(
        featureFlagEngine.setRolloutPercentage('test.rollout.bounds', 110),
      ).rejects.toThrow('Invalid rollout percentage');
    });
  });

  describe('targeting rules management', () => {
    beforeEach(async () => {
      await featureFlagEngine.initialize();
    });

    it('should add targeting rules correctly', async () => {
      const flag = await featureFlagEngine.createFeatureFlag({
        key: 'test.targeting.add',
        name: 'Test Targeting Add',
        description: 'Test adding targeting rules',
        defaultValue: false,
      });

      const rule = {
        id: 'new_rule',
        name: 'New Rule',
        conditions: [
          {
            attribute: 'beta_user',
            operator: 'equals' as const,
            value: true,
          },
        ],
        value: true,
      };

      const updatedFlag = await featureFlagEngine.addTargetingRule('test.targeting.add', rule);

      expect(updatedFlag.targetingRules).toHaveLength(1);
      expect(updatedFlag.targetingRules[0]).toEqual(rule);
    });

    it('should remove targeting rules correctly', async () => {
      const flag = await featureFlagEngine.createFeatureFlag({
        key: 'test.targeting.remove',
        name: 'Test Targeting Remove',
        description: 'Test removing targeting rules',
        defaultValue: false,
        targetingRules: [
          {
            id: 'remove_me',
            name: 'Remove Me',
            conditions: [
              {
                attribute: 'test',
                operator: 'equals',
                value: 'value',
              },
            ],
            value: true,
          },
          {
            id: 'keep_me',
            name: 'Keep Me',
            conditions: [
              {
                attribute: 'keep',
                operator: 'equals',
                value: 'yes',
              },
            ],
            value: true,
          },
        ],
      });

      const updatedFlag = await featureFlagEngine.removeTargetingRule(
        'test.targeting.remove',
        'remove_me',
      );

      expect(updatedFlag.targetingRules).toHaveLength(1);
      expect(updatedFlag.targetingRules[0].id).toBe('keep_me');
    });
  });

  describe('context management', () => {
    beforeEach(async () => {
      await featureFlagEngine.initialize();
    });

    it('should set and use context correctly', async () => {
      featureFlagEngine.setContext('user123', {
        userId: 'user123',
        email: 'user@example.com',
        role: 'admin',
        environment: 'production',
      });

      await featureFlagEngine.createFeatureFlag({
        key: 'test.context',
        name: 'Test Context',
        description: 'Test context usage',
        defaultValue: false,
        targetingRules: [
          {
            id: 'admin_rule',
            name: 'Admin Rule',
            conditions: [
              {
                attribute: 'role',
                operator: 'equals',
                value: 'admin',
              },
            ],
            value: true,
          },
        ],
      });

      const result = await featureFlagEngine.evaluate('test.context', { userId: 'user123' });

      expect(result.value).toBe(true);
      expect(result.reason).toBe('targeting_rule');
    });

    it('should clear context correctly', async () => {
      featureFlagEngine.setContext('temp_user', {
        userId: 'temp_user',
        role: 'admin',
      });

      featureFlagEngine.clearContext('temp_user');

      // Context should no longer affect evaluation
      await featureFlagEngine.createFeatureFlag({
        key: 'test.clear.context',
        name: 'Test Clear Context',
        description: 'Test clearing context',
        defaultValue: false,
        targetingRules: [
          {
            id: 'admin_rule',
            name: 'Admin Rule',
            conditions: [
              {
                attribute: 'role',
                operator: 'equals',
                value: 'admin',
              },
            ],
            value: true,
          },
        ],
      });

      const result = await featureFlagEngine.evaluate('test.clear.context', {
        userId: 'temp_user',
      });

      expect(result.value).toBe(false);
      expect(result.reason).toBe('default_value');
    });
  });

  describe('evaluation statistics', () => {
    beforeEach(async () => {
      await featureFlagEngine.initialize();
    });

    it('should provide evaluation statistics', async () => {
      await featureFlagEngine.createFeatureFlag({
        key: 'stats.test1',
        name: 'Stats Test 1',
        description: 'Test flag for statistics',
        defaultValue: true,
      });

      await featureFlagEngine.createFeatureFlag({
        key: 'stats.test2',
        name: 'Stats Test 2',
        description: 'Test flag for statistics',
        defaultValue: false,
        rolloutPercentage: 50,
      });

      const stats = featureFlagEngine.getEvaluationStats();

      expect(stats.totalFlags).toBe(2);
      expect(stats.enabledFlags).toBe(1);
      expect(stats.disabledFlags).toBe(1);
      expect(stats.flagsWithRollout).toBe(1);
    });
  });

  describe('configuration import/export', () => {
    beforeEach(async () => {
      await featureFlagEngine.initialize();
    });

    it('should export configuration correctly', async () => {
      await featureFlagEngine.createFeatureFlag({
        key: 'export.test',
        name: 'Export Test',
        description: 'Test flag for export',
        defaultValue: true,
      });

      const config = featureFlagEngine.exportConfiguration();

      expect(config.version).toBe('1.0.0');
      expect(config.exported).toBeDefined();
      expect(config.flags).toHaveLength(1);
      expect(config.flags[0].key).toBe('export.test');
    });

    it('should import configuration correctly', async () => {
      const config = {
        version: '1.0.0',
        exported: new Date().toISOString(),
        flags: [
          {
            key: 'import.test',
            name: 'Import Test',
            description: 'Test flag for import',
            defaultValue: false,
            rolloutPercentage: 25,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };

      await featureFlagEngine.importConfiguration(config);

      const flags = featureFlagEngine.getAllFlags();
      expect(flags).toHaveLength(1);
      expect(flags[0].key).toBe('import.test');
      expect(flags[0].rolloutPercentage).toBe(25);
    });

    it('should handle invalid import configuration', async () => {
      const invalidConfig = {
        version: '1.0.0',
        notFlags: [], // Wrong property name
      };

      await expect(featureFlagEngine.importConfiguration(invalidConfig)).rejects.toThrow(
        'Invalid configuration format',
      );
    });
  });

  describe('caching', () => {
    beforeEach(async () => {
      // Initialize with caching enabled
      featureFlagEngine = new FeatureFlagEngine(mockConfigPath, {
        enableCaching: true,
        cacheTtlMs: 1000,
      });
      await featureFlagEngine.initialize();
    });

    it('should cache evaluation results', async () => {
      await featureFlagEngine.createFeatureFlag({
        key: 'cache.test',
        name: 'Cache Test',
        description: 'Test flag for caching',
        defaultValue: true,
      });

      const result1 = await featureFlagEngine.evaluate('cache.test', { userId: 'user1' });
      const result2 = await featureFlagEngine.evaluate('cache.test', { userId: 'user1' });

      expect(result1.value).toBe(result2.value);
      expect(result2.reason).toBe('cached');
    });

    it('should respect cache TTL', async () => {
      await featureFlagEngine.createFeatureFlag({
        key: 'ttl.test',
        name: 'TTL Test',
        description: 'Test flag for TTL',
        defaultValue: true,
      });

      const result1 = await featureFlagEngine.evaluate('ttl.test', { userId: 'user1' });

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const result2 = await featureFlagEngine.evaluate('ttl.test', { userId: 'user1' });

      expect(result1.reason).toBe('default_value');
      expect(result2.reason).toBe('default_value'); // Should be re-evaluated, not cached
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await featureFlagEngine.initialize();
    });

    it('should handle evaluation errors gracefully', async () => {
      const result = await featureFlagEngine.evaluate('non.existent.flag');

      expect(result.value).toBe(false); // Default fallback
      expect(result.defaultUsed).toBe(true);
      expect(result.reason).toBe('flag_not_found');
    });

    it('should handle invalid flag updates', async () => {
      await expect(
        featureFlagEngine.updateFeatureFlag('non.existent', { name: 'New Name' }),
      ).rejects.toThrow('Feature flag not found');
    });

    it('should handle invalid flag deletion', async () => {
      await expect(featureFlagEngine.deleteFeatureFlag('non.existent')).rejects.toThrow(
        'Feature flag not found',
      );
    });

    it('should validate flag creation data', async () => {
      await expect(
        featureFlagEngine.createFeatureFlag({
          key: '', // Invalid empty key
          name: 'Invalid Flag',
          description: 'Invalid flag',
          defaultValue: true,
        }),
      ).rejects.toThrow('Flag key is required');
    });
  });

  describe('cleanup and destruction', () => {
    it('should cleanup resources on destroy', async () => {
      await featureFlagEngine.initialize();

      await featureFlagEngine.createFeatureFlag({
        key: 'cleanup.test',
        name: 'Cleanup Test',
        description: 'Test cleanup',
        defaultValue: true,
      });

      expect(featureFlagEngine.getAllFlags()).toHaveLength(1);

      await featureFlagEngine.destroy();

      // After destruction, cache should be cleared but flags persist in storage
      const stats = featureFlagEngine.getEvaluationStats();
      expect(stats.cacheSize).toBe(0);
    });
  });
});
