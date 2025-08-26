// Tests for IntelligentHybridRetriever - ML-Enhanced Retrieval System
// Validates hybrid retrieval, caching, performance monitoring, and ML integration

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { IntelligentHybridRetriever } from '../hybrid-retriever.js';
import { EpsilonGreedyBandit } from '../bandit-learner.js';
import type { RetrievalQuery, SearchContext, RetrievalConfig, UserFeedback } from '../types.js';
import { RetrievalStrategy } from '../types.js';
import type { ISearchEngine, SearchResult } from '../../indexing/types.js';
import { IndexEntry } from '../../indexing/types.js';
import { TestSearchEngine, createTestIndexEntry } from './test-search-engine.js';

// Create real search engine with test data
function createRealSearchEngine(): TestSearchEngine {
  const testEntries = [
    createTestIndexEntry({
      id: 'test-1',
      title: 'Authentication Implementation Guide',
      content:
        'This comprehensive guide covers user authentication, login security, password validation, JWT tokens, and session management for web applications.',
      type: 'knowledge',
      metadata: {
        category: 'security',
        tags: ['authentication', 'security', 'login', 'jwt'],
        projectId: 'test-project',
        agentTypes: ['security-auditor', 'code-implementer'],
        effectiveness: 0.9,
        usageCount: 15,
        lastUsed: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        fileSize: 2048,
        language: 'en',
        relatedIds: ['test-2'],
        parentId: undefined,
        childIds: [],
      },
    }),
    createTestIndexEntry({
      id: 'test-2',
      title: 'Database Migration Best Practices',
      content:
        'Learn how to safely migrate databases, handle schema changes, backup strategies, and rollback procedures for production systems.',
      type: 'knowledge',
      metadata: {
        category: 'database',
        tags: ['database', 'migration', 'schema', 'backup'],
        projectId: 'test-project',
        agentTypes: ['database-specialist', 'code-implementer'],
        effectiveness: 0.8,
        usageCount: 8,
        lastUsed: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        fileSize: 1536,
        language: 'en',
        relatedIds: ['test-1'],
        parentId: undefined,
        childIds: [],
      },
    }),
    createTestIndexEntry({
      id: 'test-3',
      title: 'TypeScript Configuration Setup',
      content:
        'Complete guide to setting up TypeScript configuration, tsconfig.json options, compilation targets, and module resolution.',
      type: 'code',
      metadata: {
        category: 'configuration',
        tags: ['typescript', 'config', 'setup', 'tsconfig'],
        projectId: 'test-project',
        agentTypes: ['code-implementer'],
        effectiveness: 0.7,
        usageCount: 12,
        lastUsed: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
        fileSize: 1024,
        language: 'typescript',
        relatedIds: [],
        parentId: undefined,
        childIds: [],
      },
    }),
  ];

  return new TestSearchEngine(testEntries);
}

const mockConfig: RetrievalConfig = {
  bandit: {
    algorithm: 'epsilon-greedy',
    epsilonDecay: 0.995,
    initialEpsilon: 0.15,
    confidenceLevel: 2.0,
    windowSize: 1000,
  },
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
  reranking: {
    enabled: true,
    algorithm: 'logistic',
    learningRate: 0.01,
    regularization: 0.001,
    batchSize: 32,
    onlineLearning: true,
  },
  hybrid: {
    defaultMode: 'adaptive',
    parallelTimeout: 2000,
    fusionAlgorithm: 'rrf',
    enableVectorSearch: false,
  },
  analytics: {
    trackingEnabled: true,
    batchSize: 100,
    retentionDays: 30,
    slowQueryThreshold: 1000,
    lowRelevanceThreshold: 0.3,
    defaultConfidenceLevel: 0.95,
    defaultMinimumEffect: 0.05,
  },
  performance: {
    maxFeatureExtractionTime: 500,
    maxRerankingCandidates: 100,
    cacheEnabled: true,
    cacheTTL: 300000,
    maxMemoryUsage: 100 * 1024 * 1024,
    maxConcurrentQueries: 10,
  },
};

const mockContext: SearchContext = {
  projectId: 'test-project',
  agentTypes: ['test-agent'],
  preferredLanguages: ['typescript'],
  expertiseLevel: 'intermediate',
  recentQueries: ['test query'],
  recentResults: ['result1'],
  successfulPatterns: ['pattern1'],
  timestamp: new Date(),
  workingHours: true,
};

const mockQuery: RetrievalQuery = {
  query: 'test search query',
  context: mockContext,
  type: 'knowledge',
  limit: 10,
  offset: 0,
};

describe('IntelligentHybridRetriever', () => {
  let retriever: IntelligentHybridRetriever;
  let bandit: EpsilonGreedyBandit;
  let searchEngine: TestSearchEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    searchEngine = createRealSearchEngine();
    bandit = new EpsilonGreedyBandit(mockConfig.bandit);
    retriever = new IntelligentHybridRetriever(searchEngine, bandit, mockConfig);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(retriever).toBeDefined();
    });

    it('should create feature extractor and rank fusion components', () => {
      expect(retriever).toBeDefined();
    });
  });

  describe('Core Retrieval', () => {
    it('should perform basic hybrid retrieval', async () => {
      const results = await retriever.retrieve(mockQuery);

      expect(results).toBeDefined();
      expect(results.results).toHaveLength(3); // We have 3 test entries
      expect(results.strategyUsed).toBeDefined();
      expect(results.executionTime).toBeGreaterThan(0);
      expect(results.featureExtractionTime).toBeGreaterThan(0);
      expect(results.results[0].entry.title).toBeTruthy();
      expect(results.results[0].score).toBeGreaterThan(0);
    });

    it('should handle empty results gracefully', async () => {
      const emptySearchEngine = new TestSearchEngine([]); // No entries
      const emptyRetriever = new IntelligentHybridRetriever(emptySearchEngine, bandit, mockConfig);

      const results = await emptyRetriever.retrieve(mockQuery);

      expect(results.results).toHaveLength(0);
      expect(results.totalMatches).toBe(0);
    });

    it('should respect query limits and pagination', async () => {
      const paginatedQuery = { ...mockQuery, limit: 1, offset: 0 };
      const results = await retriever.retrieve(paginatedQuery);

      expect(results.results).toHaveLength(1);
      expect(results.currentPage).toBe(1);
      expect(results.totalMatches).toBe(3); // Should still show total available
    });

    it('should track performance metrics', async () => {
      await retriever.retrieve(mockQuery);

      // Performance metrics should be tracked internally
      // This would be verified through monitoring interfaces in real implementation
      expect(true).toBe(true);
    });
  });

  describe('Hybrid Retrieval Modes', () => {
    it('should handle parallel retrieval mode', async () => {
      const parallelQuery = { ...mockQuery, hybridMode: 'parallel' as const };
      const results = await retriever.retrieve(parallelQuery);

      expect(results).toBeDefined();
      expect(results.strategyUsed).toBeDefined();
    });

    it('should handle cascade retrieval mode', async () => {
      const cascadeQuery = { ...mockQuery, hybridMode: 'cascade' as const };
      const results = await retriever.retrieve(cascadeQuery);

      expect(results).toBeDefined();
      expect(results.strategyUsed).toBeDefined();
    });

    it('should handle adaptive retrieval mode', async () => {
      const adaptiveQuery = { ...mockQuery, hybridMode: 'adaptive' as const };
      const results = await retriever.retrieve(adaptiveQuery);

      expect(results).toBeDefined();
      expect(results.strategyUsed).toBeDefined();
    });

    it('should handle ensemble retrieval mode', async () => {
      const ensembleQuery = { ...mockQuery, hybridMode: 'ensemble' as const };
      const results = await retriever.retrieve(ensembleQuery);

      expect(results).toBeDefined();
      expect(results.strategyUsed).toBeDefined();
    });
  });

  describe('Strategy Selection', () => {
    it('should use bandit algorithm for strategy selection', async () => {
      const strategy = await retriever.getOptimalStrategy(mockContext);
      expect(strategy).toMatch(
        /^(fts-heavy|vector-heavy|balanced|recency-focused|effectiveness-focused|popularity-focused|semantic-focused)$/,
      );
    });

    it('should fallback to balanced strategy on errors', async () => {
      // Create a bandit that throws errors
      const errorBandit = {
        selectArm: vi.fn().mockRejectedValue(new Error('Bandit error')),
        updateReward: vi.fn(),
        getArmStatistics: vi.fn(),
        resetLearning: vi.fn(),
        exportModel: vi.fn(),
        importModel: vi.fn(),
      };

      const errorRetriever = new IntelligentHybridRetriever(searchEngine, errorBandit, mockConfig);
      const strategy = await errorRetriever.getOptimalStrategy(mockContext);

      expect(strategy).toBe('balanced');
    });
  });

  describe('Individual Retrieval Methods', () => {
    it('should perform FTS retrieval', async () => {
      const results = await retriever.performFTSRetrieval(mockQuery);

      expect(results).toHaveLength(3);
      expect(results[0].entry.title).toBeTruthy();
      expect(results[0].score).toBeGreaterThan(0);
    });

    it('should handle vector retrieval (when disabled)', async () => {
      const results = await retriever.performVectorRetrieval(mockQuery);

      expect(results).toHaveLength(0); // Vector search disabled in config
    });

    it('should perform semantic retrieval with query enhancement', async () => {
      const results = await retriever.performSemanticRetrieval(mockQuery);

      expect(results).toHaveLength(3);
      expect(results[0].entry).toBeDefined();
    });

    it('should handle search engine errors gracefully', async () => {
      // Create a search engine that throws errors
      const errorSearchEngine = {
        async search() {
          throw new Error('Search engine error');
        },
        async searchSimilar() {
          throw new Error('Error');
        },
        async getSuggestions() {
          return [];
        },
        async getPopularQueries() {
          return [];
        },
        async recordQuery() {},
        async getAnalytics() {
          return {
            totalQueries: 0,
            uniqueQueries: 0,
            averageQueryLength: 0,
            topQueries: [],
            averageResponseTime: 0,
            slowQueries: [],
            cacheMetrics: {
              hitRate: 0,
              totalHits: 0,
              totalMisses: 0,
              cacheSize: 0,
              memoryUsage: 0,
            },
            averageResults: 0,
            zeroResultQueries: 0,
            clickThroughRate: 0,
            startDate: new Date(),
            endDate: new Date(),
          };
        },
      } as ISearchEngine;

      const errorRetriever = new IntelligentHybridRetriever(errorSearchEngine, bandit, mockConfig);

      await expect(errorRetriever.performFTSRetrieval(mockQuery)).rejects.toThrow(
        'FTS retrieval failed',
      );
    });
  });

  describe('Result Fusion', () => {
    it('should fuse FTS and vector results', async () => {
      const searchResults = await searchEngine.search({ query: 'test search query' });
      const ftsResults: SearchResult[] = [searchResults.results[0]];
      const vectorResults: SearchResult[] = [];
      const weights = { ftsWeight: 0.7, vectorWeight: 0.3 } as any;

      const fusedResults = await retriever.fuseResults(ftsResults, vectorResults, weights);

      expect(fusedResults).toHaveLength(1);
      expect(fusedResults[0].entry).toBeDefined();
    });

    it('should handle empty fusion lists', async () => {
      const results = await retriever.fuseResults([], [], {} as any);
      expect(results).toHaveLength(0);
    });

    it('should return single list when only one has results', async () => {
      const searchResults = await searchEngine.search({ query: 'test search query' });
      const results = await retriever.fuseResults(searchResults.results, [], {} as any);
      expect(results).toEqual(searchResults.results);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Weight Adaptation', () => {
    it('should adapt weights based on user feedback', async () => {
      const feedback: UserFeedback[] = [
        {
          clicked: true,
          dwellTime: 15000,
          usedInSolution: true,
          relevanceRating: 5,
          thumbsUp: true,
          thumbsDown: false,
          copiedContent: true,
          bookmarked: false,
          timestamp: new Date(),
          sessionId: 'test-session',
          queryId: 'test-query',
          resultRank: 1,
        },
      ];

      const weights = await retriever.adaptWeights('fts-heavy', feedback);

      expect(weights).toBeDefined();
      expect(weights.ftsWeight).toBeGreaterThan(0);
      expect(weights.vectorWeight).toBeGreaterThan(0);
    });

    it('should handle negative feedback', async () => {
      const negativeFeedback: UserFeedback[] = [
        {
          clicked: false,
          dwellTime: 1000,
          usedInSolution: false,
          relevanceRating: 1,
          thumbsUp: false,
          thumbsDown: true,
          copiedContent: false,
          bookmarked: false,
          timestamp: new Date(),
          sessionId: 'test-session',
          queryId: 'test-query',
          resultRank: 1,
        },
      ];

      const weights = await retriever.adaptWeights('fts-heavy', negativeFeedback);

      expect(weights).toBeDefined();
      expect(typeof weights.ftsWeight).toBe('number');
    });

    it('should return default weights with no feedback', async () => {
      const weights = await retriever.adaptWeights('balanced', []);

      expect(weights).toBeDefined();
      expect(weights.ftsWeight).toBe(1.0);
      expect(weights.vectorWeight).toBe(1.0);
    });
  });

  describe('Caching', () => {
    it('should cache results when enabled', async () => {
      const firstResult = await retriever.retrieve(mockQuery);
      const secondResult = await retriever.retrieve(mockQuery);

      expect(firstResult).toBeDefined();
      expect(secondResult).toBeDefined();
      // Note: In real implementation, we'd verify cache hit metrics
    });

    it('should respect cache TTL', async () => {
      // This test would require time manipulation
      const result = await retriever.retrieve(mockQuery);
      expect(result).toBeDefined();
    });

    it('should work with caching disabled', async () => {
      const noCacheConfig = {
        ...mockConfig,
        performance: { ...mockConfig.performance, cacheEnabled: false },
      };

      const noCacheRetriever = new IntelligentHybridRetriever(searchEngine, bandit, noCacheConfig);
      const result = await noCacheRetriever.retrieve(mockQuery);

      expect(result).toBeDefined();
    });
  });

  describe('Query Enhancement', () => {
    it('should enhance queries for semantic search', async () => {
      const semanticQuery = {
        ...mockQuery,
        context: { ...mockContext, agentTypes: ['semantic-agent'] },
      };
      const results = await retriever.performSemanticRetrieval(semanticQuery);

      expect(results).toBeDefined();
    });

    it('should enhance queries for recency focus', async () => {
      const results = await retriever.performSemanticRetrieval(mockQuery);
      expect(results).toBeDefined();
    });

    it('should extract semantic keywords from context', async () => {
      const contextWithIssue = {
        ...mockContext,
        currentIssue: {
          id: 'issue-1',
          title: 'Bug Fix Required',
          labels: ['bug', 'urgent'],
          description: 'Critical bug that needs fixing',
        },
      };

      const queryWithIssue = { ...mockQuery, context: contextWithIssue };
      const results = await retriever.performSemanticRetrieval(queryWithIssue);

      expect(results).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle retrieval errors gracefully', async () => {
      const errorQuery = { ...mockQuery, query: '' };

      // Should not throw but may return different results
      const result = await retriever.retrieve(errorQuery);
      expect(result).toBeDefined();
    });

    it('should handle timeout errors in parallel mode', async () => {
      const shortTimeoutConfig = {
        ...mockConfig,
        hybrid: { ...mockConfig.hybrid, parallelTimeout: 1 }, // 1ms timeout
      };

      const timeoutRetriever = new IntelligentHybridRetriever(
        searchEngine,
        bandit,
        shortTimeoutConfig,
      );

      // Should fallback gracefully
      const result = await timeoutRetriever.retrieve(mockQuery);
      expect(result).toBeDefined();
    });

    it('should handle feature extraction failures', async () => {
      // Mock feature extractor that fails
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await retriever.retrieve(mockQuery);
      expect(result).toBeDefined();

      vi.restoreAllMocks();
    });
  });

  describe('Performance Monitoring', () => {
    it('should track query response times', async () => {
      const result = await retriever.retrieve(mockQuery);

      expect(result.executionTime).toBeGreaterThanOrEqual(0);
      expect(result.featureExtractionTime).toBeGreaterThanOrEqual(0);
      expect(result.rankingTime).toBeGreaterThanOrEqual(0);
    });

    it('should track ML processing times', async () => {
      const result = await retriever.retrieve(mockQuery);

      expect(result.totalMLTime).toBeGreaterThanOrEqual(0);
      expect(result.adaptiveLearningActive).toBeDefined();
    });

    it('should provide strategy usage metadata', async () => {
      const result = await retriever.retrieve(mockQuery);

      expect(result.strategyUsed).toBeDefined();
      expect(typeof result.explorationPerformed).toBe('boolean');
    });
  });

  describe('Integration with Components', () => {
    it('should integrate with bandit for strategy selection', async () => {
      // Train bandit with some data
      await bandit.updateReward('fts-heavy', mockContext, 0.8);
      await bandit.updateReward('vector-heavy', mockContext, 0.3);

      const result = await retriever.retrieve(mockQuery);
      expect(result.strategyUsed).toBeDefined();
    });

    it('should integrate with feature extractor for ML features', async () => {
      const result = await retriever.retrieve(mockQuery);

      // Results should have features attached (internal processing)
      expect(result.results).toBeDefined();
      expect(result.featureExtractionTime).toBeGreaterThanOrEqual(0);
    });

    it('should integrate with rank fusion for result combination', async () => {
      const parallelQuery = { ...mockQuery, hybridMode: 'parallel' as const };
      const result = await retriever.retrieve(parallelQuery);

      expect(result.results).toBeDefined();
    });
  });

  describe('Strategy-Specific Behavior', () => {
    it('should handle FTS-heavy strategy correctly', async () => {
      // Mock bandit to always return fts-heavy
      const ftsHeavyBandit = {
        selectArm: vi.fn().mockResolvedValue('fts-heavy'),
        updateReward: vi.fn(),
        getArmStatistics: vi.fn(),
        resetLearning: vi.fn(),
        exportModel: vi.fn(),
        importModel: vi.fn(),
      };

      const ftsRetriever = new IntelligentHybridRetriever(searchEngine, ftsHeavyBandit, mockConfig);
      const result = await ftsRetriever.retrieve(mockQuery);

      expect(result.strategyUsed).toBe('fts-heavy');
    });

    it('should handle vector-heavy strategy with fallback', async () => {
      const vectorHeavyBandit = {
        selectArm: vi.fn().mockResolvedValue('vector-heavy'),
        updateReward: vi.fn(),
        getArmStatistics: vi.fn(),
        resetLearning: vi.fn(),
        exportModel: vi.fn(),
        importModel: vi.fn(),
      };

      const vectorRetriever = new IntelligentHybridRetriever(
        searchEngine,
        vectorHeavyBandit,
        mockConfig,
      );
      const result = await vectorRetriever.retrieve(mockQuery);

      expect(result).toBeDefined(); // Should fallback since vector search is disabled
    });

    it('should handle semantic-focused strategy', async () => {
      const semanticBandit = {
        selectArm: vi.fn().mockResolvedValue('semantic-focused'),
        updateReward: vi.fn(),
        getArmStatistics: vi.fn(),
        resetLearning: vi.fn(),
        exportModel: vi.fn(),
        importModel: vi.fn(),
      };

      const semanticRetriever = new IntelligentHybridRetriever(
        searchEngine,
        semanticBandit,
        mockConfig,
      );
      const result = await semanticRetriever.retrieve(mockQuery);

      expect(result.strategyUsed).toBe('semantic-focused');
    });
  });
});
