// Tests for Multi-Armed Bandit Algorithm Implementation
// Validates epsilon-greedy, UCB, and adaptive learning behavior

import { describe, it, expect, beforeEach } from 'vitest';
import { EpsilonGreedyBandit, UCBBandit, createBanditAlgorithm } from '../bandit-learner.js';
import { RetrievalStrategy, SearchContext, RetrievalConfig } from '../types.js';

describe('Multi-Armed Bandit Algorithms', () => {
  const mockConfig: RetrievalConfig['bandit'] = {
    algorithm: 'epsilon-greedy',
    epsilonDecay: 0.99,
    initialEpsilon: 0.2,
    confidenceLevel: 2.0,
    windowSize: 100
  };

  const mockContext: SearchContext = {
    projectId: 'test-project',
    agentTypes: ['code-implementer'],
    preferredLanguages: ['typescript'],
    expertiseLevel: 'intermediate',
    recentQueries: [],
    recentResults: [],
    successfulPatterns: [],
    timestamp: new Date()
  };

  describe('EpsilonGreedyBandit', () => {
    let bandit: EpsilonGreedyBandit;

    beforeEach(() => {
      bandit = new EpsilonGreedyBandit(mockConfig);
    });

    it('should initialize with correct configuration', () => {
      expect(bandit).toBeDefined();
    });

    it('should select arms based on epsilon-greedy strategy', async () => {
      const strategy = await bandit.selectArm(mockContext);
      expect(strategy).toMatch(/^(fts-heavy|vector-heavy|balanced|recency-focused|effectiveness-focused|popularity-focused|semantic-focused)$/);
    });

    it('should update rewards and adjust strategy preferences', async () => {
      const strategy: RetrievalStrategy = 'fts-heavy';
      
      // Update with positive rewards
      for (let i = 0; i < 10; i++) {
        await bandit.updateReward(strategy, mockContext, 0.8);
      }

      // Update with negative rewards for another strategy
      for (let i = 0; i < 10; i++) {
        await bandit.updateReward('vector-heavy', mockContext, 0.2);
      }

      const stats = await bandit.getArmStatistics();
      expect(stats.armStats['fts-heavy'].averageReward).toBeGreaterThan(stats.armStats['vector-heavy'].averageReward);
    });

    it('should decay epsilon over time', async () => {
      const initialStats = await bandit.getArmStatistics();
      const initialEpsilon = initialStats.explorationRate;

      // Perform several updates to trigger epsilon decay
      for (let i = 0; i < 50; i++) {
        await bandit.updateReward('balanced', mockContext, 0.5);
      }

      const finalStats = await bandit.getArmStatistics();
      const finalEpsilon = finalStats.explorationRate;

      expect(finalEpsilon).toBeLessThan(initialEpsilon);
    });

    it('should maintain sliding window of rewards', async () => {
      const strategy: RetrievalStrategy = 'fts-heavy';
      
      // Fill window with rewards
      for (let i = 0; i < mockConfig.windowSize + 50; i++) {
        await bandit.updateReward(strategy, mockContext, i % 2 === 0 ? 0.8 : 0.2);
      }

      const stats = await bandit.getArmStatistics();
      expect(stats.armStats[strategy].trials).toBeLessThanOrEqual(mockConfig.windowSize);
    });

    it('should calculate confidence intervals for arm statistics', async () => {
      const strategy: RetrievalStrategy = 'effectiveness-focused';
      
      // Add enough samples for meaningful confidence interval
      for (let i = 0; i < 30; i++) {
        await bandit.updateReward(strategy, mockContext, 0.7 + (Math.random() - 0.5) * 0.2);
      }

      const stats = await bandit.getArmStatistics();
      const armStats = stats.armStats[strategy];
      
      expect(armStats.confidenceInterval).toHaveLength(2);
      expect(armStats.confidenceInterval[0]).toBeLessThan(armStats.confidenceInterval[1]);
      expect(armStats.confidenceInterval[0]).toBeGreaterThanOrEqual(0);
      expect(armStats.confidenceInterval[1]).toBeLessThanOrEqual(1);
    });

    it('should track contextual rewards', async () => {
      const context1 = { ...mockContext, agentTypes: ['test-agent-1'] };
      const context2 = { ...mockContext, agentTypes: ['test-agent-2'] };
      
      // Different contexts should learn independently
      for (let i = 0; i < 20; i++) {
        await bandit.updateReward('fts-heavy', context1, 0.9); // Good for context1
        await bandit.updateReward('fts-heavy', context2, 0.1); // Bad for context2
      }

      // The bandit should still function (contextual learning is internal)
      const stats = await bandit.getArmStatistics();
      expect(stats.armStats['fts-heavy'].trials).toBe(40);
    });

    it('should handle model export and import', async () => {
      // Train the bandit
      for (let i = 0; i < 100; i++) {
        const strategy = i % 2 === 0 ? 'fts-heavy' : 'vector-heavy';
        const reward = strategy === 'fts-heavy' ? 0.8 : 0.3;
        await bandit.updateReward(strategy, mockContext, reward);
      }

      // Export model
      const model = await bandit.exportModel();
      expect(model).toBeDefined();
      expect(model.algorithm).toBe('epsilon-greedy');
      expect(model.armEstimates).toBeDefined();
      expect(Object.keys(model.armEstimates)).toContain('fts-heavy');

      // Create new bandit and import model
      const newBandit = new EpsilonGreedyBandit(mockConfig);
      await newBandit.importModel(model);

      // Verify performance is similar
      const newStats = await newBandit.getArmStatistics();
      expect(newStats.armStats['fts-heavy'].averageReward).toBeGreaterThan(0.5);
    });

    it('should calculate regret properly', async () => {
      // Create scenario where one arm is clearly better
      for (let i = 0; i < 50; i++) {
        await bandit.updateReward('fts-heavy', mockContext, 0.9);
        await bandit.updateReward('vector-heavy', mockContext, 0.2);
      }

      const stats = await bandit.getArmStatistics();
      expect(stats.regret).toBeGreaterThanOrEqual(0);
    });

    it('should reset learning state', async () => {
      // Train the bandit
      await bandit.updateReward('fts-heavy', mockContext, 0.8);
      await bandit.updateReward('vector-heavy', mockContext, 0.3);

      let stats = await bandit.getArmStatistics();
      expect(stats.totalTrials).toBeGreaterThan(0);

      // Reset
      await bandit.resetLearning();

      stats = await bandit.getArmStatistics();
      expect(stats.totalTrials).toBe(0);
      expect(stats.totalReward).toBe(0);
    });

    it('should validate reward values', async () => {
      // Invalid rewards should be rejected
      await expect(bandit.updateReward('fts-heavy', mockContext, -0.1))
        .rejects.toThrow('Invalid reward value');
      
      await expect(bandit.updateReward('fts-heavy', mockContext, 1.1))
        .rejects.toThrow('Invalid reward value');
      
      // Valid rewards should work
      await expect(bandit.updateReward('fts-heavy', mockContext, 0.0))
        .resolves.not.toThrow();
      
      await expect(bandit.updateReward('fts-heavy', mockContext, 1.0))
        .resolves.not.toThrow();
    });
  });

  describe('UCBBandit', () => {
    let bandit: UCBBandit;

    beforeEach(() => {
      bandit = new UCBBandit(mockConfig);
    });

    it('should initialize correctly', () => {
      expect(bandit).toBeDefined();
    });

    it('should explore unvisited arms first', async () => {
      // UCB should select unvisited arms before exploiting
      const selectedStrategies = new Set<RetrievalStrategy>();
      
      // Collect first few selections (should cover all arms)
      for (let i = 0; i < 10; i++) {
        const strategy = await bandit.selectArm(mockContext);
        selectedStrategies.add(strategy);
        await bandit.updateReward(strategy, mockContext, 0.5);
      }

      expect(selectedStrategies.size).toBeGreaterThan(1);
    });

    it('should balance exploration and exploitation', async () => {
      // Create a clear winner
      for (let i = 0; i < 20; i++) {
        await bandit.updateReward('fts-heavy', mockContext, 0.9);
        await bandit.updateReward('vector-heavy', mockContext, 0.1);
      }

      // UCB should still occasionally explore other options
      const selections = new Map<RetrievalStrategy, number>();
      
      for (let i = 0; i < 100; i++) {
        const strategy = await bandit.selectArm(mockContext);
        selections.set(strategy, (selections.get(strategy) || 0) + 1);
        await bandit.updateReward(strategy, mockContext, 0.5);
      }

      // Should heavily favor 'fts-heavy' but not exclusively
      expect(selections.get('fts-heavy') || 0).toBeGreaterThan(50);
      expect(selections.size).toBeGreaterThan(1); // Should explore others too
    });

    it('should export and import models', async () => {
      // Train the bandit
      for (let i = 0; i < 50; i++) {
        await bandit.updateReward('effectiveness-focused', mockContext, 0.8);
      }

      const model = await bandit.exportModel();
      expect(model.algorithm).toBe('ucb');
      expect(model.armEstimates).toBeDefined();
    });
  });

  describe('Bandit Factory', () => {
    it('should create epsilon-greedy bandit', () => {
      const config = { ...mockConfig, algorithm: 'epsilon-greedy' as const };
      const bandit = createBanditAlgorithm('epsilon-greedy', config);
      expect(bandit).toBeInstanceOf(EpsilonGreedyBandit);
    });

    it('should create UCB bandit', () => {
      const config = { ...mockConfig, algorithm: 'ucb' as const };
      const bandit = createBanditAlgorithm('ucb', config);
      expect(bandit).toBeInstanceOf(UCBBandit);
    });

    it('should reject unknown algorithms', () => {
      expect(() => {
        createBanditAlgorithm('unknown-algorithm' as any, mockConfig);
      }).toThrow('Unknown bandit algorithm');
    });

    it('should reject Thompson sampling (not yet implemented)', () => {
      expect(() => {
        createBanditAlgorithm('thompson-sampling', mockConfig);
      }).toThrow('Thompson sampling not yet implemented');
    });
  });

  describe('Performance and Edge Cases', () => {
    let bandit: EpsilonGreedyBandit;

    beforeEach(() => {
      bandit = new EpsilonGreedyBandit(mockConfig);
    });

    it('should handle rapid sequential updates', async () => {
      const promises = [];
      
      // Fire many updates simultaneously
      for (let i = 0; i < 100; i++) {
        promises.push(bandit.updateReward('balanced', mockContext, Math.random()));
      }

      await Promise.all(promises);
      
      const stats = await bandit.getArmStatistics();
      expect(stats.totalTrials).toBe(100);
    });

    it('should handle edge case rewards', async () => {
      // Test boundary values
      await bandit.updateReward('fts-heavy', mockContext, 0.0);
      await bandit.updateReward('vector-heavy', mockContext, 1.0);
      
      const stats = await bandit.getArmStatistics();
      expect(stats.armStats['fts-heavy'].averageReward).toBe(0.0);
      expect(stats.armStats['vector-heavy'].averageReward).toBe(1.0);
    });

    it('should maintain performance with large datasets', async () => {
      const startTime = Date.now();
      
      // Large number of updates
      for (let i = 0; i < 1000; i++) {
        const strategy = ['fts-heavy', 'vector-heavy', 'balanced'][i % 3] as RetrievalStrategy;
        await bandit.updateReward(strategy, mockContext, Math.random());
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete in reasonable time (less than 5 seconds)
      expect(duration).toBeLessThan(5000);
      
      const stats = await bandit.getArmStatistics();
      expect(stats.totalTrials).toBe(1000);
    });

    it('should handle empty contexts gracefully', async () => {
      const emptyContext: SearchContext = {
        projectId: '',
        agentTypes: [],
        preferredLanguages: [],
        expertiseLevel: 'beginner',
        recentQueries: [],
        recentResults: [],
        successfulPatterns: [],
        timestamp: new Date()
      };

      const strategy = await bandit.selectArm(emptyContext);
      expect(strategy).toBeDefined();
      
      await expect(bandit.updateReward(strategy, emptyContext, 0.5))
        .resolves.not.toThrow();
    });

    it('should calculate convergence metrics', async () => {
      // Create convergent scenario
      for (let i = 0; i < 200; i++) {
        await bandit.updateReward('fts-heavy', mockContext, 0.8 + Math.random() * 0.1);
        await bandit.updateReward('vector-heavy', mockContext, 0.2 + Math.random() * 0.1);
      }

      const stats = await bandit.getArmStatistics();
      expect(stats.convergenceRate).toBeGreaterThanOrEqual(0);
      expect(stats.convergenceRate).toBeLessThanOrEqual(1);
    });
  });

  describe('Statistical Properties', () => {
    let bandit: EpsilonGreedyBandit;

    beforeEach(() => {
      bandit = new EpsilonGreedyBandit(mockConfig);
    });

    it('should converge to optimal strategy', async () => {
      const optimalStrategy: RetrievalStrategy = 'fts-heavy';
      const suboptimalStrategy: RetrievalStrategy = 'vector-heavy';
      
      // Simulate clear performance difference
      for (let i = 0; i < 500; i++) {
        await bandit.updateReward(optimalStrategy, mockContext, 0.85);
        await bandit.updateReward(suboptimalStrategy, mockContext, 0.15);
      }

      // Test convergence by measuring selection frequency
      const selections = new Map<RetrievalStrategy, number>();
      
      for (let i = 0; i < 100; i++) {
        const selected = await bandit.selectArm(mockContext);
        selections.set(selected, (selections.get(selected) || 0) + 1);
      }

      // Should heavily favor optimal strategy (but not exclusively due to exploration)
      const optimalSelections = selections.get(optimalStrategy) || 0;
      expect(optimalSelections).toBeGreaterThan(70); // At least 70% optimal selections
    });

    it('should maintain exploration-exploitation balance', async () => {
      // Track epsilon decay over time
      const epsilonHistory: number[] = [];
      
      for (let i = 0; i < 100; i++) {
        await bandit.updateReward('balanced', mockContext, 0.5);
        const stats = await bandit.getArmStatistics();
        epsilonHistory.push(stats.explorationRate);
      }

      // Epsilon should generally decrease
      const firstHalf = epsilonHistory.slice(0, 50);
      const secondHalf = epsilonHistory.slice(50);
      
      const firstAvg = firstHalf.reduce((sum, e) => sum + e, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, e) => sum + e, 0) / secondHalf.length;
      
      expect(secondAvg).toBeLessThan(firstAvg);
    });

    it('should handle reward variance correctly', async () => {
      // Strategy with high variance
      for (let i = 0; i < 100; i++) {
        const reward = Math.random() > 0.5 ? 0.9 : 0.1; // High variance
        await bandit.updateReward('semantic-focused', mockContext, reward);
      }

      // Strategy with low variance
      for (let i = 0; i < 100; i++) {
        const reward = 0.5 + (Math.random() - 0.5) * 0.1; // Low variance
        await bandit.updateReward('popularity-focused', mockContext, reward);
      }

      const stats = await bandit.getArmStatistics();
      
      // Both strategies should have reasonable confidence intervals
      const highVarianceArm = stats.armStats['semantic-focused'];
      const lowVarianceArm = stats.armStats['popularity-focused'];
      
      expect(highVarianceArm.confidenceInterval[1] - highVarianceArm.confidenceInterval[0])
        .toBeGreaterThan(lowVarianceArm.confidenceInterval[1] - lowVarianceArm.confidenceInterval[0]);
    });
  });
});