// FF2 Retrieval Layer - ML-Enhanced Adaptive Learning System
// Layer 4: Intelligent retrieval with bandit algorithms and feature extraction

// Core exports
export * from './types.js';

// ML Components
export { EpsilonGreedyBandit, UCBBandit, createBanditAlgorithm } from './bandit-learner.js';
export { SmartFeatureExtractor } from './feature-extractor.js';
export { IntelligentHybridRetriever } from './hybrid-retriever.js';
export { RankFusionEngine } from './rank-fusion.js';
export { OnlineLearningReranker } from './re-ranker.js';
export { IntelligentLearningAnalytics } from './learning-analytics.js';

// Factory and convenience functions
import { EpsilonGreedyBandit, UCBBandit } from './bandit-learner.js';
import { SmartFeatureExtractor } from './feature-extractor.js';
import { IntelligentHybridRetriever } from './hybrid-retriever.js';
import { RankFusionEngine } from './rank-fusion.js';
import { OnlineLearningReranker } from './re-ranker.js';
import { IntelligentLearningAnalytics } from './learning-analytics.js';
import type { ISearchEngine } from '../indexing/types.js';
import type { RetrievalConfig, BanditAlgorithm } from './types.js';
import { logger } from '../utils/logger.js';

/**
 * Factory function to create a complete retrieval system
 */
export function createRetrievalSystem(
  searchEngine: ISearchEngine,
  config: RetrievalConfig,
): {
  hybridRetriever: IntelligentHybridRetriever;
  banditLearner: BanditAlgorithm;
  featureExtractor: SmartFeatureExtractor;
  rankFusion: RankFusionEngine;
  reranker: OnlineLearningReranker;
  analytics: IntelligentLearningAnalytics;
} {
  try {
    logger.info('Creating FF2 Retrieval System', {
      banditAlgorithm: config.bandit.algorithm,
      hybridMode: config.hybrid.defaultMode,
      fusionAlgorithm: config.hybrid.fusionAlgorithm,
      rerankingEnabled: config.reranking.enabled,
    });

    // Create bandit algorithm for strategy selection
    const banditLearner =
      config.bandit.algorithm === 'epsilon-greedy'
        ? new EpsilonGreedyBandit(config.bandit)
        : new UCBBandit(config.bandit);

    // Create feature extraction system
    const featureExtractor = new SmartFeatureExtractor(config.features);

    // Create rank fusion engine
    const rankFusion = new RankFusionEngine(config);

    // Create optional re-ranker
    const reranker = new OnlineLearningReranker(config.reranking);

    // Create analytics system
    const analytics = new IntelligentLearningAnalytics(config.analytics);

    // Create hybrid retriever that orchestrates everything
    const hybridRetriever = new IntelligentHybridRetriever(searchEngine, banditLearner, config);

    logger.info('FF2 Retrieval System created successfully', {
      components: [
        'banditLearner',
        'featureExtractor',
        'rankFusion',
        'reranker',
        'analytics',
        'hybridRetriever',
      ],
      ready: true,
    });

    return {
      hybridRetriever,
      banditLearner,
      featureExtractor,
      rankFusion,
      reranker,
      analytics,
    };
  } catch (error) {
    logger.error('Failed to create retrieval system', error);
    throw error;
  }
}

/**
 * Default configuration for FF2 Retrieval System
 */
export const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
  // Bandit configuration
  bandit: {
    algorithm: 'epsilon-greedy',
    epsilonDecay: 0.995,
    initialEpsilon: 0.15,
    confidenceLevel: 2.0,
    windowSize: 1000,
  },

  // Feature extraction configuration
  features: {
    enableRecencyFeatures: true,
    enableProximityFeatures: true,
    enableAffinityFeatures: true,
    enableSemanticFeatures: true,
    enableContextFeatures: true,

    featureWeights: {
      titleMatch: 0.25,
      contentMatch: 0.18,
      proximity: 0.15,
      recency: 0.12,
      affinity: 0.12,
      semantic: 0.1,
      context: 0.08,
    },

    normalizeFeatures: true,
    scalingMethod: 'minmax',
  },

  // Reranking configuration
  reranking: {
    enabled: true,
    algorithm: 'logistic',
    learningRate: 0.01,
    regularization: 0.001,
    batchSize: 32,
    onlineLearning: true,
  },

  // Hybrid retrieval configuration
  hybrid: {
    defaultMode: 'adaptive',
    parallelTimeout: 2000,
    fusionAlgorithm: 'rrf',
    enableVectorSearch: false, // Default off until vector search is implemented
  },

  // Analytics configuration
  analytics: {
    trackingEnabled: true,
    batchSize: 100,
    retentionDays: 30,

    slowQueryThreshold: 1000,
    lowRelevanceThreshold: 0.3,

    defaultConfidenceLevel: 0.95,
    defaultMinimumEffect: 0.05,
  },

  // Performance configuration
  performance: {
    maxFeatureExtractionTime: 500,
    maxRerankingCandidates: 100,
    cacheEnabled: true,
    cacheTTL: 300000, // 5 minutes

    maxMemoryUsage: 100 * 1024 * 1024, // 100MB
    maxConcurrentQueries: 10,
  },
};

/**
 * Utility function to validate retrieval configuration
 */
export function validateRetrievalConfig(config: RetrievalConfig): string[] {
  const errors: string[] = [];

  // Validate bandit configuration
  if (config.bandit.initialEpsilon < 0 || config.bandit.initialEpsilon > 1) {
    errors.push('Bandit initial epsilon must be between 0 and 1');
  }

  if (config.bandit.epsilonDecay <= 0 || config.bandit.epsilonDecay > 1) {
    errors.push('Bandit epsilon decay must be between 0 and 1');
  }

  if (config.bandit.windowSize < 10) {
    errors.push('Bandit window size must be at least 10');
  }

  // Validate feature weights
  const totalWeight = Object.values(config.features.featureWeights).reduce((sum, w) => sum + w, 0);
  if (Math.abs(totalWeight - 1.0) > 0.1) {
    errors.push(
      `Feature weights should sum to approximately 1.0 (current: ${totalWeight.toFixed(2)})`,
    );
  }

  // Validate reranking configuration
  if (config.reranking.learningRate <= 0 || config.reranking.learningRate > 1) {
    errors.push('Reranking learning rate must be between 0 and 1');
  }

  if (config.reranking.batchSize < 1 || config.reranking.batchSize > 1000) {
    errors.push('Reranking batch size must be between 1 and 1000');
  }

  // Validate hybrid configuration
  if (config.hybrid.parallelTimeout < 100 || config.hybrid.parallelTimeout > 10000) {
    errors.push('Hybrid parallel timeout must be between 100ms and 10s');
  }

  // Validate analytics configuration
  if (config.analytics.retentionDays < 1 || config.analytics.retentionDays > 365) {
    errors.push('Analytics retention days must be between 1 and 365');
  }

  if (
    config.analytics.defaultConfidenceLevel < 0.8 ||
    config.analytics.defaultConfidenceLevel > 0.99
  ) {
    errors.push('Analytics confidence level must be between 0.8 and 0.99');
  }

  // Validate performance configuration
  if (
    config.performance.maxFeatureExtractionTime < 50 ||
    config.performance.maxFeatureExtractionTime > 5000
  ) {
    errors.push('Max feature extraction time must be between 50ms and 5s');
  }

  if (config.performance.cacheTTL < 1000 || config.performance.cacheTTL > 3600000) {
    errors.push('Cache TTL must be between 1s and 1h');
  }

  return errors;
}

/**
 * Create retrieval config with validation
 */
export function createRetrievalConfig(overrides: Partial<RetrievalConfig> = {}): RetrievalConfig {
  const config: RetrievalConfig = {
    ...DEFAULT_RETRIEVAL_CONFIG,
    ...overrides,
    bandit: { ...DEFAULT_RETRIEVAL_CONFIG.bandit, ...overrides.bandit },
    features: { ...DEFAULT_RETRIEVAL_CONFIG.features, ...overrides.features },
    reranking: { ...DEFAULT_RETRIEVAL_CONFIG.reranking, ...overrides.reranking },
    hybrid: { ...DEFAULT_RETRIEVAL_CONFIG.hybrid, ...overrides.hybrid },
    analytics: { ...DEFAULT_RETRIEVAL_CONFIG.analytics, ...overrides.analytics },
    performance: { ...DEFAULT_RETRIEVAL_CONFIG.performance, ...overrides.performance },
  };

  const errors = validateRetrievalConfig(config);
  if (errors.length > 0) {
    throw new Error(`Invalid retrieval configuration: ${errors.join(', ')}`);
  }

  return config;
}

/**
 * Performance monitoring utilities
 */
export class RetrievalSystemMonitor {
  private metrics = {
    queriesPerSecond: 0,
    averageResponseTime: 0,
    memoryUsage: 0,
    cacheHitRate: 0,
    errorRate: 0,
  };

  private queryTimes: number[] = [];
  private errors = 0;
  private totalQueries = 0;
  private cacheHits = 0;

  recordQuery(responseTime: number, fromCache: boolean = false, error: boolean = false): void {
    this.totalQueries++;
    this.queryTimes.push(responseTime);

    if (fromCache) this.cacheHits++;
    if (error) this.errors++;

    // Keep only recent query times
    if (this.queryTimes.length > 1000) {
      this.queryTimes = this.queryTimes.slice(-1000);
    }

    this.updateMetrics();
  }

  private updateMetrics(): void {
    if (this.queryTimes.length === 0) return;

    this.metrics.averageResponseTime =
      this.queryTimes.reduce((sum, time) => sum + time, 0) / this.queryTimes.length;

    this.metrics.cacheHitRate =
      this.totalQueries > 0 ? (this.cacheHits / this.totalQueries) * 100 : 0;

    this.metrics.errorRate = this.totalQueries > 0 ? (this.errors / this.totalQueries) * 100 : 0;

    // Calculate QPS over last minute (simplified)
    const recentQueries = this.queryTimes.filter((time) => Date.now() - time < 60000);
    this.metrics.queriesPerSecond = recentQueries.length / 60;

    // Memory usage (simplified - would need actual memory tracking)
    this.metrics.memoryUsage = process.memoryUsage().heapUsed;
  }

  getMetrics() {
    return { ...this.metrics };
  }

  reset(): void {
    this.queryTimes = [];
    this.errors = 0;
    this.totalQueries = 0;
    this.cacheHits = 0;
    this.metrics = {
      queriesPerSecond: 0,
      averageResponseTime: 0,
      memoryUsage: 0,
      cacheHitRate: 0,
      errorRate: 0,
    };
  }
}
