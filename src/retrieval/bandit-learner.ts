// Multi-Armed Bandit Learner - Adaptive Retrieval Strategy Selection
// Implements epsilon-greedy, UCB, and Thompson sampling algorithms

import {
  BanditAlgorithm,
  BanditStatistics,
  BanditModel,
  RetrievalStrategy,
  SearchContext,
  RetrievalConfig,
  RetrievalError,
  RetrievalErrorCode
} from './types.js';
import { logger } from '../utils/logger.js';

export class EpsilonGreedyBandit implements BanditAlgorithm {
  private armRewards: Map<RetrievalStrategy, number[]> = new Map();
  private armCounts: Map<RetrievalStrategy, number> = new Map();
  private contextualRewards: Map<string, Map<RetrievalStrategy, number[]>> = new Map();
  
  // Configuration
  private epsilon: number;
  private readonly epsilonDecay: number;
  private readonly minEpsilon: number;
  private readonly windowSize: number;
  
  // Statistics tracking
  private totalTrials = 0;
  private totalReward = 0;
  private rewardHistory: Array<{ strategy: RetrievalStrategy; reward: number; timestamp: Date }> = [];
  
  constructor(config: RetrievalConfig['bandit']) {
    this.epsilon = config.initialEpsilon;
    this.epsilonDecay = config.epsilonDecay;
    this.minEpsilon = 0.01;
    this.windowSize = config.windowSize || 1000;
    
    // Initialize arms for all strategies
    this.initializeArms();
    
    logger.info('EpsilonGreedyBandit initialized', {
      initialEpsilon: this.epsilon,
      epsilonDecay: this.epsilonDecay,
      windowSize: this.windowSize
    });
  }

  private initializeArms(): void {
    const strategies: RetrievalStrategy[] = [
      'fts-heavy',
      'vector-heavy', 
      'balanced',
      'recency-focused',
      'effectiveness-focused',
      'popularity-focused',
      'semantic-focused'
    ];

    strategies.forEach(strategy => {
      this.armRewards.set(strategy, []);
      this.armCounts.set(strategy, 0);
    });
  }

  async selectArm(context: SearchContext): Promise<RetrievalStrategy> {
    try {
      // Contextual key for context-aware bandit
      const contextKey = this.generateContextKey(context);
      
      // Exploration vs exploitation decision
      if (Math.random() < this.epsilon) {
        // Exploration: select random arm
        const strategy = this.selectRandomArm();
        logger.debug('Bandit exploration', { 
          strategy, 
          epsilon: this.epsilon,
          contextKey
        });
        return strategy;
      } else {
        // Exploitation: select best performing arm
        const strategy = await this.selectBestArm(contextKey);
        logger.debug('Bandit exploitation', { 
          strategy,
          contextKey
        });
        return strategy;
      }
    } catch (error) {
      logger.error('Failed to select bandit arm', error);
      throw new RetrievalError(
        'Bandit arm selection failed',
        RetrievalErrorCode.BANDIT_UPDATE_FAILED,
        { context, error }
      );
    }
  }

  async updateReward(
    strategy: RetrievalStrategy,
    context: SearchContext,
    reward: number
  ): Promise<void> {
    try {
      // Validate reward
      if (reward < 0 || reward > 1) {
        throw new Error(`Invalid reward value: ${reward}. Must be between 0 and 1.`);
      }

      const contextKey = this.generateContextKey(context);
      const timestamp = new Date();

      // Update global arm statistics
      if (!this.armRewards.has(strategy)) {
        this.armRewards.set(strategy, []);
        this.armCounts.set(strategy, 0);
      }

      const rewards = this.armRewards.get(strategy)!;
      rewards.push(reward);
      this.armCounts.set(strategy, this.armCounts.get(strategy)! + 1);

      // Keep only recent rewards (sliding window)
      if (rewards.length > this.windowSize) {
        rewards.splice(0, rewards.length - this.windowSize);
      }

      // Update contextual statistics
      if (!this.contextualRewards.has(contextKey)) {
        this.contextualRewards.set(contextKey, new Map());
      }
      
      const contextRewards = this.contextualRewards.get(contextKey)!;
      if (!contextRewards.has(strategy)) {
        contextRewards.set(strategy, []);
      }
      
      const contextArm = contextRewards.get(strategy)!;
      contextArm.push(reward);
      
      // Keep sliding window for contextual rewards too
      if (contextArm.length > this.windowSize / 10) { // Smaller window for context
        contextArm.splice(0, contextArm.length - Math.floor(this.windowSize / 10));
      }

      // Update global statistics
      this.totalTrials++;
      this.totalReward += reward;
      
      // Store reward history
      this.rewardHistory.push({ strategy, reward, timestamp });
      if (this.rewardHistory.length > this.windowSize) {
        this.rewardHistory.splice(0, this.rewardHistory.length - this.windowSize);
      }

      // Decay epsilon
      this.decayEpsilon();

      logger.debug('Bandit reward updated', {
        strategy,
        reward,
        newEpsilon: this.epsilon,
        contextKey,
        totalTrials: this.totalTrials,
        averageReward: this.totalReward / this.totalTrials
      });
    } catch (error) {
      logger.error('Failed to update bandit reward', error);
      throw new RetrievalError(
        'Bandit reward update failed',
        RetrievalErrorCode.BANDIT_UPDATE_FAILED,
        { strategy, context, reward, error }
      );
    }
  }

  async getArmStatistics(): Promise<BanditStatistics> {
    try {
      const armStats: BanditStatistics['armStats'] = {};
      
      for (const [strategy, rewards] of this.armRewards.entries()) {
        const trials = rewards.length;
        const totalReward = rewards.reduce((sum, r) => sum + r, 0);
        const averageReward = trials > 0 ? totalReward / trials : 0;
        
        // Calculate confidence interval (95% confidence)
        const stdError = trials > 1 ? Math.sqrt(
          rewards.reduce((sum, r) => sum + Math.pow(r - averageReward, 2), 0) / (trials - 1)
        ) / Math.sqrt(trials) : 0;
        
        const marginOfError = 1.96 * stdError; // 95% confidence
        
        // Find last used timestamp
        const lastUsed = this.rewardHistory
          .filter(entry => entry.strategy === strategy)
          .pop()?.timestamp || new Date(0);

        armStats[strategy] = {
          name: strategy,
          trials,
          totalReward,
          averageReward,
          confidenceInterval: [
            Math.max(0, averageReward - marginOfError),
            Math.min(1, averageReward + marginOfError)
          ] as [number, number],
          lastUsed
        };
      }

      // Calculate cumulative regret
      const regret = this.calculateRegret();
      
      // Calculate convergence rate
      const convergenceRate = this.calculateConvergenceRate();

      return {
        totalTrials: this.totalTrials,
        totalReward: this.totalReward,
        averageReward: this.totalTrials > 0 ? this.totalReward / this.totalTrials : 0,
        armStats,
        regret,
        convergenceRate,
        explorationRate: this.epsilon
      };
    } catch (error) {
      logger.error('Failed to get bandit statistics', error);
      throw new RetrievalError(
        'Failed to retrieve bandit statistics',
        RetrievalErrorCode.BANDIT_UPDATE_FAILED,
        { error }
      );
    }
  }

  async resetLearning(): Promise<void> {
    try {
      // Clear all learning data
      this.armRewards.clear();
      this.armCounts.clear();
      this.contextualRewards.clear();
      this.rewardHistory.length = 0;
      
      // Reset statistics
      this.totalTrials = 0;
      this.totalReward = 0;
      
      // Reset epsilon
      this.epsilon = 0.1; // Reset to initial value
      
      // Reinitialize arms
      this.initializeArms();
      
      logger.info('Bandit learning reset', {
        epsilon: this.epsilon,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Failed to reset bandit learning', error);
      throw new RetrievalError(
        'Failed to reset bandit learning',
        RetrievalErrorCode.BANDIT_UPDATE_FAILED,
        { error }
      );
    }
  }

  async exportModel(): Promise<BanditModel> {
    try {
      const armEstimates: BanditModel['armEstimates'] = {};
      
      for (const [strategy, rewards] of this.armRewards.entries()) {
        const trials = rewards.length;
        const mean = trials > 0 ? rewards.reduce((sum, r) => sum + r, 0) / trials : 0;
        const variance = trials > 1 ? 
          rewards.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (trials - 1) : 0;
        
        armEstimates[strategy] = {
          mean,
          variance,
          samples: trials
        };
      }

      // Extract training data (recent samples)
      const recentData = this.rewardHistory.slice(-1000); // Last 1000 samples
      const contexts = recentData.map(entry => ({}) as SearchContext); // Simplified for export
      const strategies = recentData.map(entry => entry.strategy);
      const rewards = recentData.map(entry => entry.reward);

      return {
        algorithm: 'epsilon-greedy',
        parameters: {
          epsilon: this.epsilon,
          epsilonDecay: this.epsilonDecay,
          windowSize: this.windowSize
        },
        armEstimates,
        contextFeatures: ['agentTypes', 'projectId', 'timestamp'], // Simplified
        modelVersion: '1.0.0',
        trainingData: {
          contexts,
          strategies,
          rewards
        }
      };
    } catch (error) {
      logger.error('Failed to export bandit model', error);
      throw new RetrievalError(
        'Failed to export bandit model',
        RetrievalErrorCode.MODEL_TRAINING_FAILED,
        { error }
      );
    }
  }

  async importModel(model: BanditModel): Promise<void> {
    try {
      // Validate model
      if (model.algorithm !== 'epsilon-greedy') {
        throw new Error(`Incompatible algorithm: ${model.algorithm}`);
      }

      // Reset current state
      await this.resetLearning();

      // Import parameters
      this.epsilon = model.parameters.epsilon || this.epsilon;
      
      // Import arm estimates
      for (const [strategy, estimates] of Object.entries(model.armEstimates)) {
        const retrievalStrategy = strategy as RetrievalStrategy;
        
        // Reconstruct rewards from estimates (approximation)
        const syntheticRewards = this.generateSyntheticRewards(
          estimates.mean,
          estimates.variance,
          estimates.samples
        );
        
        this.armRewards.set(retrievalStrategy, syntheticRewards);
        this.armCounts.set(retrievalStrategy, estimates.samples);
        
        // Update global statistics
        this.totalTrials += estimates.samples;
        this.totalReward += estimates.mean * estimates.samples;
      }

      logger.info('Bandit model imported successfully', {
        algorithm: model.algorithm,
        modelVersion: model.modelVersion,
        totalArms: Object.keys(model.armEstimates).length,
        totalSamples: this.totalTrials
      });
    } catch (error) {
      logger.error('Failed to import bandit model', error);
      throw new RetrievalError(
        'Failed to import bandit model',
        RetrievalErrorCode.MODEL_TRAINING_FAILED,
        { model: model.modelVersion, error }
      );
    }
  }

  // Private helper methods

  private generateContextKey(context: SearchContext): string {
    // Create a simplified context key for contextual bandits
    const keyParts = [
      context.agentTypes.sort().join(','),
      context.projectId,
      context.currentIssue?.labels?.sort().join(',') || '',
      context.workingHours ? 'work' : 'off'
    ];
    
    return keyParts.join('|');
  }

  private selectRandomArm(): RetrievalStrategy {
    const strategies = Array.from(this.armRewards.keys());
    const randomIndex = Math.floor(Math.random() * strategies.length);
    return strategies[randomIndex];
  }

  private async selectBestArm(contextKey: string): Promise<RetrievalStrategy> {
    let bestStrategy: RetrievalStrategy = 'balanced';
    let bestScore = -1;

    // First try contextual information
    const contextualArms = this.contextualRewards.get(contextKey);
    if (contextualArms && contextualArms.size > 0) {
      for (const [strategy, rewards] of contextualArms.entries()) {
        if (rewards.length > 0) {
          const avgReward = rewards.reduce((sum, r) => sum + r, 0) / rewards.length;
          if (avgReward > bestScore) {
            bestScore = avgReward;
            bestStrategy = strategy;
          }
        }
      }
      
      // If we found a good contextual strategy, use it
      if (bestScore > 0) {
        return bestStrategy;
      }
    }

    // Fall back to global best performing arm
    bestScore = -1;
    for (const [strategy, rewards] of this.armRewards.entries()) {
      if (rewards.length > 0) {
        const avgReward = rewards.reduce((sum, r) => sum + r, 0) / rewards.length;
        if (avgReward > bestScore) {
          bestScore = avgReward;
          bestStrategy = strategy;
        }
      }
    }

    return bestStrategy;
  }

  private decayEpsilon(): void {
    this.epsilon = Math.max(
      this.minEpsilon,
      this.epsilon * this.epsilonDecay
    );
  }

  private calculateRegret(): number {
    // Calculate cumulative regret based on optimal strategy performance
    if (this.rewardHistory.length === 0) return 0;

    // Find the best average reward across all arms
    let maxAvgReward = 0;
    for (const rewards of this.armRewards.values()) {
      if (rewards.length > 0) {
        const avgReward = rewards.reduce((sum, r) => sum + r, 0) / rewards.length;
        maxAvgReward = Math.max(maxAvgReward, avgReward);
      }
    }

    // Calculate regret as the difference between optimal and actual performance
    const actualAvgReward = this.totalTrials > 0 ? this.totalReward / this.totalTrials : 0;
    return Math.max(0, maxAvgReward - actualAvgReward) * this.totalTrials;
  }

  private calculateConvergenceRate(): number {
    // Simple convergence rate based on recent reward variance
    if (this.rewardHistory.length < 10) return 0;

    const recentRewards = this.rewardHistory.slice(-100).map(entry => entry.reward);
    const mean = recentRewards.reduce((sum, r) => sum + r, 0) / recentRewards.length;
    const variance = recentRewards.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / recentRewards.length;
    
    // Lower variance indicates higher convergence
    return Math.max(0, 1 - Math.sqrt(variance));
  }

  private generateSyntheticRewards(mean: number, variance: number, samples: number): number[] {
    // Generate synthetic rewards based on normal distribution approximation
    const rewards: number[] = [];
    const stdDev = Math.sqrt(variance);
    
    for (let i = 0; i < Math.min(samples, this.windowSize); i++) {
      // Box-Muller transform for normal distribution
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      
      let reward = mean + z * stdDev;
      reward = Math.max(0, Math.min(1, reward)); // Clamp to [0, 1]
      
      rewards.push(reward);
    }
    
    return rewards;
  }
}

// Upper Confidence Bound (UCB) Bandit Implementation
export class UCBBandit implements BanditAlgorithm {
  private armRewards: Map<RetrievalStrategy, number[]> = new Map();
  private armCounts: Map<RetrievalStrategy, number> = new Map();
  private totalTrials = 0;
  private confidenceLevel: number;

  constructor(config: RetrievalConfig['bandit']) {
    this.confidenceLevel = config.confidenceLevel || 2.0;
    this.initializeArms();
    
    logger.info('UCBBandit initialized', {
      confidenceLevel: this.confidenceLevel
    });
  }

  private initializeArms(): void {
    const strategies: RetrievalStrategy[] = [
      'fts-heavy', 'vector-heavy', 'balanced',
      'recency-focused', 'effectiveness-focused', 
      'popularity-focused', 'semantic-focused'
    ];

    strategies.forEach(strategy => {
      this.armRewards.set(strategy, []);
      this.armCounts.set(strategy, 0);
    });
  }

  async selectArm(context: SearchContext): Promise<RetrievalStrategy> {
    try {
      let bestStrategy: RetrievalStrategy = 'balanced';
      let bestUCB = -Infinity;

      for (const [strategy, rewards] of this.armRewards.entries()) {
        const trials = rewards.length;
        
        if (trials === 0) {
          // Unvisited arms get infinite UCB (exploration)
          return strategy;
        }

        const avgReward = rewards.reduce((sum, r) => sum + r, 0) / trials;
        const confidence = Math.sqrt(
          (this.confidenceLevel * Math.log(this.totalTrials)) / trials
        );
        
        const ucb = avgReward + confidence;
        
        if (ucb > bestUCB) {
          bestUCB = ucb;
          bestStrategy = strategy;
        }
      }

      logger.debug('UCB arm selected', {
        strategy: bestStrategy,
        ucb: bestUCB,
        totalTrials: this.totalTrials
      });

      return bestStrategy;
    } catch (error) {
      logger.error('Failed to select UCB arm', error);
      throw new RetrievalError(
        'UCB arm selection failed',
        RetrievalErrorCode.BANDIT_UPDATE_FAILED,
        { context, error }
      );
    }
  }

  async updateReward(strategy: RetrievalStrategy, context: SearchContext, reward: number): Promise<void> {
    try {
      if (!this.armRewards.has(strategy)) {
        this.armRewards.set(strategy, []);
        this.armCounts.set(strategy, 0);
      }

      this.armRewards.get(strategy)!.push(reward);
      this.armCounts.set(strategy, this.armCounts.get(strategy)! + 1);
      this.totalTrials++;

      logger.debug('UCB reward updated', {
        strategy,
        reward,
        totalTrials: this.totalTrials
      });
    } catch (error) {
      logger.error('Failed to update UCB reward', error);
      throw new RetrievalError(
        'UCB reward update failed',
        RetrievalErrorCode.BANDIT_UPDATE_FAILED,
        { strategy, context, reward, error }
      );
    }
  }

  async getArmStatistics(): Promise<BanditStatistics> {
    // Implementation similar to EpsilonGreedyBandit
    const armStats: BanditStatistics['armStats'] = {};
    let totalReward = 0;
    
    for (const [strategy, rewards] of this.armRewards.entries()) {
      const trials = rewards.length;
      const strategyTotalReward = rewards.reduce((sum, r) => sum + r, 0);
      const averageReward = trials > 0 ? strategyTotalReward / trials : 0;
      totalReward += strategyTotalReward;
      
      armStats[strategy] = {
        name: strategy,
        trials,
        totalReward: strategyTotalReward,
        averageReward,
        confidenceInterval: [0, 1], // Simplified
        lastUsed: new Date()
      };
    }

    return {
      totalTrials: this.totalTrials,
      totalReward,
      averageReward: this.totalTrials > 0 ? totalReward / this.totalTrials : 0,
      armStats,
      regret: 0, // Simplified
      convergenceRate: 0, // Simplified
      explorationRate: 0 // UCB doesn't have explicit exploration rate
    };
  }

  async resetLearning(): Promise<void> {
    this.armRewards.clear();
    this.armCounts.clear();
    this.totalTrials = 0;
    this.initializeArms();
  }

  async exportModel(): Promise<BanditModel> {
    // Simplified implementation
    const armEstimates: BanditModel['armEstimates'] = {};
    
    for (const [strategy, rewards] of this.armRewards.entries()) {
      const mean = rewards.length > 0 ? rewards.reduce((sum, r) => sum + r, 0) / rewards.length : 0;
      armEstimates[strategy] = {
        mean,
        variance: 0, // Simplified
        samples: rewards.length
      };
    }

    return {
      algorithm: 'ucb',
      parameters: { confidenceLevel: this.confidenceLevel },
      armEstimates,
      modelVersion: '1.0.0',
      trainingData: { contexts: [], strategies: [], rewards: [] }
    };
  }

  async importModel(model: BanditModel): Promise<void> {
    if (model.algorithm !== 'ucb') {
      throw new Error(`Incompatible algorithm: ${model.algorithm}`);
    }
    
    this.confidenceLevel = model.parameters.confidenceLevel || this.confidenceLevel;
    // Simplified import - would need full implementation
  }
}

// Factory function for creating bandit instances
export function createBanditAlgorithm(
  algorithm: 'epsilon-greedy' | 'ucb' | 'thompson-sampling',
  config: RetrievalConfig['bandit']
): BanditAlgorithm {
  switch (algorithm) {
    case 'epsilon-greedy':
      return new EpsilonGreedyBandit(config);
    case 'ucb':
      return new UCBBandit(config);
    case 'thompson-sampling':
      throw new Error('Thompson sampling not yet implemented');
    default:
      throw new Error(`Unknown bandit algorithm: ${algorithm}`);
  }
}