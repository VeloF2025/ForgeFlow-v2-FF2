// Integration Tests for FF2 Retrieval Layer
// Tests complete ML-enhanced retrieval system functionality

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createRetrievalSystem,
  DEFAULT_RETRIEVAL_CONFIG,
  validateRetrievalConfig,
} from '../index.js';
import { EpsilonGreedyBandit } from '../bandit-learner.js';
import { SmartFeatureExtractor } from '../feature-extractor.js';
import { IntelligentHybridRetriever } from '../hybrid-retriever.js';
import { OnlineLearningReranker } from '../re-ranker.js';
import { IntelligentLearningAnalytics } from '../learning-analytics.js';
import type { RetrievalQuery, SearchContext, UserFeedback, RetrievalConfig } from '../types.js';
import type {
  ISearchEngine,
  SearchQuery,
  SearchResults,
  SearchResult,
  IndexEntry,
  IndexContentType,
} from '../../indexing/types.js';

// Mock search engine for testing
class MockSearchEngine implements ISearchEngine {
  private mockResults: SearchResult[] = [];

  setMockResults(results: SearchResult[]) {
    this.mockResults = results;
  }

  async search(query: SearchQuery): Promise<SearchResults> {
    // Simulate search with mock results
    const filteredResults = this.mockResults.filter(
      (result) =>
        result.entry.title.toLowerCase().includes(query.query.toLowerCase()) ||
        result.entry.content.toLowerCase().includes(query.query.toLowerCase()),
    );

    return {
      results: filteredResults.slice(0, query.limit || 20),
      totalMatches: filteredResults.length,
      totalPages: Math.ceil(filteredResults.length / (query.limit || 20)),
      currentPage: Math.floor((query.offset || 0) / (query.limit || 20)) + 1,
      executionTime: Math.random() * 100 + 50, // 50-150ms
      facets: {
        types: [],
        categories: [],
        tags: [],
        projects: [],
        agents: [],
        languages: [],
      },
      suggestions: [],
    };
  }

  async searchSimilar(entryId: string, limit?: number): Promise<SearchResults> {
    return this.search({ query: 'similar', limit });
  }

  async getSuggestions(partial: string, limit?: number): Promise<string[]> {
    return ['suggestion1', 'suggestion2', 'suggestion3'].slice(0, limit || 5);
  }

  async getPopularQueries(limit?: number): Promise<any[]> {
    return [];
  }

  async recordQuery(query: string, resultCount: number, responseTime: number): Promise<void> {
    // Mock implementation
  }

  async getAnalytics(startDate: Date, endDate: Date): Promise<any> {
    return {
      totalQueries: 100,
      uniqueQueries: 50,
      averageQueryLength: 15,
      topQueries: [],
      averageResponseTime: 75,
      slowQueries: [],
      cacheMetrics: {
        hitRate: 0.8,
        totalHits: 80,
        totalMisses: 20,
        cacheSize: 1000,
        memoryUsage: 1024000,
      },
      averageResults: 5.2,
      zeroResultQueries: 5,
      clickThroughRate: 0.65,
      startDate,
      endDate,
    };
  }
}

describe('FF2 Retrieval Layer Integration', () => {
  let mockSearchEngine: MockSearchEngine;
  let retrievalSystem: ReturnType<typeof createRetrievalSystem>;
  let config: RetrievalConfig;

  const mockContext: SearchContext = {
    projectId: 'integration-test',
    agentTypes: ['code-implementer', 'test-validator'],
    preferredLanguages: ['typescript'],
    expertiseLevel: 'intermediate',
    recentQueries: ['authentication', 'testing'],
    recentResults: [],
    successfulPatterns: ['jwt', 'oauth2'],
    timestamp: new Date(),
    currentIssue: {
      id: 'test-issue',
      title: 'Improve authentication flow',
      labels: ['enhancement', 'auth'],
      description: 'Need to enhance the authentication system',
    },
    repositoryUrl: 'https://github.com/test/repo',
    activeBranch: 'feature/auth-improvements',
    workingHours: true,
  };

  const createMockContent = (
    id: string,
    title: string,
    content: string,
    type: IndexContentType = 'knowledge',
  ): IndexEntry => ({
    id,
    type,
    title,
    content,
    path: `/docs/${id}.md`,
    metadata: {
      tags: ['test', 'mock'],
      category: 'development',
      projectId: mockContext.projectId,
      agentTypes: mockContext.agentTypes,
      difficulty: 'medium',
      scope: 'project',
      effectiveness: 0.75 + Math.random() * 0.2,
      usageCount: Math.floor(Math.random() * 50),
      lastUsed: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
      successRate: 0.6 + Math.random() * 0.3,
      fileSize: content.length,
      language: 'markdown',
      extension: '.md',
      relatedIds: [],
      parentId: undefined,
      childIds: [],
    },
    lastModified: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000),
    hash: `mock-hash-${id}`,
    searchVector: undefined,
  });

  beforeEach(() => {
    mockSearchEngine = new MockSearchEngine();
    config = { ...DEFAULT_RETRIEVAL_CONFIG };

    // Create mock search results
    const mockResults: SearchResult[] = [
      {
        entry: createMockContent(
          'auth-guide',
          'Authentication Best Practices',
          'Comprehensive guide on authentication patterns, JWT tokens, OAuth2 flows, and security considerations. Includes error handling strategies.',
        ),
        score: 8.5,
        rank: 1,
        contentSnippets: [],
        matchedFields: ['title', 'content'],
        totalMatches: 3,
        relevanceFactors: {
          titleMatch: 0.9,
          contentMatch: 0.8,
          tagMatch: 0.5,
          categoryMatch: 0.7,
          recencyBoost: 0.3,
          effectivenessBoost: 0.8,
          usageBoost: 0.4,
        },
      },
      {
        entry: createMockContent(
          'testing-guide',
          'Testing Authentication Flows',
          'Guide for testing authentication systems, including unit tests, integration tests, and E2E testing strategies.',
        ),
        score: 7.2,
        rank: 2,
        contentSnippets: [],
        matchedFields: ['title', 'content'],
        totalMatches: 2,
        relevanceFactors: {
          titleMatch: 0.7,
          contentMatch: 0.6,
          tagMatch: 0.8,
          categoryMatch: 0.6,
          recencyBoost: 0.5,
          effectivenessBoost: 0.7,
          usageBoost: 0.3,
        },
      },
      {
        entry: createMockContent(
          'security-patterns',
          'Security Patterns and Anti-Patterns',
          'Common security patterns to follow and anti-patterns to avoid in authentication and authorization systems.',
        ),
        score: 6.8,
        rank: 3,
        contentSnippets: [],
        matchedFields: ['content', 'tags'],
        totalMatches: 1,
        relevanceFactors: {
          titleMatch: 0.4,
          contentMatch: 0.7,
          tagMatch: 0.3,
          categoryMatch: 0.8,
          recencyBoost: 0.2,
          effectivenessBoost: 0.9,
          usageBoost: 0.6,
        },
      },
    ];

    mockSearchEngine.setMockResults(mockResults);
    retrievalSystem = createRetrievalSystem(mockSearchEngine, config);
  });

  afterEach(() => {
    // Cleanup if needed
  });

  describe('System Creation and Configuration', () => {
    it('should create complete retrieval system', () => {
      expect(retrievalSystem.hybridRetriever).toBeInstanceOf(IntelligentHybridRetriever);
      expect(retrievalSystem.banditLearner).toBeInstanceOf(EpsilonGreedyBandit);
      expect(retrievalSystem.featureExtractor).toBeInstanceOf(SmartFeatureExtractor);
      expect(retrievalSystem.reranker).toBeInstanceOf(OnlineLearningReranker);
      expect(retrievalSystem.analytics).toBeInstanceOf(IntelligentLearningAnalytics);
    });

    it('should validate configuration correctly', () => {
      const validConfig = { ...DEFAULT_RETRIEVAL_CONFIG };
      const errors = validateRetrievalConfig(validConfig);
      expect(errors).toHaveLength(0);

      const invalidConfig = {
        ...DEFAULT_RETRIEVAL_CONFIG,
        bandit: {
          ...DEFAULT_RETRIEVAL_CONFIG.bandit,
          initialEpsilon: 2.0, // Invalid: > 1
        },
      };

      const invalidErrors = validateRetrievalConfig(invalidConfig);
      expect(invalidErrors.length).toBeGreaterThan(0);
      expect(invalidErrors[0]).toContain('epsilon');
    });

    it('should create system with custom configuration', () => {
      const customConfig = {
        ...DEFAULT_RETRIEVAL_CONFIG,
        bandit: {
          ...DEFAULT_RETRIEVAL_CONFIG.bandit,
          algorithm: 'ucb' as const,
        },
        hybrid: {
          ...DEFAULT_RETRIEVAL_CONFIG.hybrid,
          defaultMode: 'parallel' as const,
        },
      };

      const customSystem = createRetrievalSystem(mockSearchEngine, customConfig);
      expect(customSystem).toBeDefined();
      expect(customSystem.hybridRetriever).toBeDefined();
    });
  });

  describe('End-to-End Retrieval Flow', () => {
    it('should perform complete retrieval with ML enhancements', async () => {
      const query: RetrievalQuery = {
        query: 'authentication testing best practices',
        context: mockContext,
        limit: 10,
        includeSnippets: true,
        adaptiveWeights: true,
        enableReranker: true,
      };

      const results = await retrievalSystem.hybridRetriever.retrieve(query);

      expect(results).toBeDefined();
      expect(results.results).toHaveLength(3); // All mock results should match
      expect(results.strategyUsed).toBeDefined();
      expect(results.executionTime).toBeGreaterThan(0);
      expect(results.featureExtractionTime).toBeGreaterThan(0);
      expect(results.adaptiveLearningActive).toBe(true);

      // Results should be RetrievalResults with ML enhancements
      results.results.forEach((result) => {
        expect(result.features).toBeDefined();
        expect(result.confidenceScore).toBeGreaterThanOrEqual(0);
        expect(result.confidenceScore).toBeLessThanOrEqual(1);
        expect(result.retrievalStrategy).toBeDefined();
      });
    });

    it('should adapt strategy selection based on feedback', async () => {
      const query: RetrievalQuery = {
        query: 'authentication patterns',
        context: mockContext,
        adaptiveWeights: true,
      };

      // Initial retrieval
      const results1 = await retrievalSystem.hybridRetriever.retrieve(query);
      const initialStrategy = results1.strategyUsed;

      // Provide negative feedback for current strategy
      const negativeFeedback: UserFeedback = {
        clicked: false,
        dwellTime: 1000, // Short dwell time
        thumbsDown: true,
        usedInSolution: false,
        copiedContent: false,
        bookmarked: false,
        timestamp: new Date(),
        sessionId: 'test-session',
        queryId: 'test-query',
        resultRank: 1,
      };

      // Simulate strategy update through analytics
      await retrievalSystem.analytics.trackRetrieval(query, results1, negativeFeedback);

      // Update bandit with negative reward
      await retrievalSystem.banditLearner.updateReward(initialStrategy, mockContext, 0.2);

      // Perform multiple retrievals to see strategy adaptation
      const strategies = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const result = await retrievalSystem.hybridRetriever.retrieve({
          ...query,
          explorationRate: 0.3, // Higher exploration to see different strategies
        });
        strategies.add(result.strategyUsed);
      }

      // Should explore different strategies
      expect(strategies.size).toBeGreaterThan(1);
    });

    it('should improve performance through online learning', async () => {
      const query: RetrievalQuery = {
        query: 'security testing',
        context: mockContext,
        enableReranker: true,
      };

      // Collect initial performance
      const initialResults = await retrievalSystem.hybridRetriever.retrieve(query);

      // Provide positive feedback for top results and negative for bottom ones
      for (let i = 0; i < initialResults.results.length; i++) {
        const feedback: UserFeedback = {
          clicked: i < 2, // Click on top 2 results
          dwellTime: i < 2 ? 15000 : 2000, // Long dwell time for relevant results
          thumbsUp: i === 0, // Thumbs up for best result
          usedInSolution: i === 0,
          relevanceRating: i < 2 ? 5 : 2,
          copiedContent: i === 0,
          bookmarked: i === 0,
          timestamp: new Date(),
          sessionId: 'learning-session',
          queryId: `query-${i}`,
          resultRank: i + 1,
        };

        await retrievalSystem.reranker.updateOnline(
          query,
          initialResults.results[i] as any, // Cast to SearchResult for compatibility
          feedback,
        );
      }

      // Perform another retrieval - should show improvement
      const improvedResults = await retrievalSystem.hybridRetriever.retrieve(query);

      expect(improvedResults).toBeDefined();
      expect(improvedResults.results).toHaveLength(initialResults.results.length);

      // Top results should have higher confidence scores after learning
      expect(improvedResults.results[0].confidenceScore).toBeGreaterThan(0.5);
    });
  });

  describe('Analytics and Learning Progress', () => {
    it('should track retrieval analytics', async () => {
      const queries = [
        { query: 'authentication', expected: 'security' },
        { query: 'testing frameworks', expected: 'testing' },
        { query: 'error handling', expected: 'development' },
      ];

      // Perform multiple retrievals
      for (const { query, expected } of queries) {
        const retrievalQuery: RetrievalQuery = {
          query,
          context: mockContext,
        };

        const results = await retrievalSystem.hybridRetriever.retrieve(retrievalQuery);

        const feedback: UserFeedback = {
          clicked: true,
          dwellTime: 8000,
          relevanceRating: 4,
          usedInSolution: true,
          copiedContent: false,
          bookmarked: false,
          timestamp: new Date(),
          sessionId: 'analytics-test',
          queryId: query,
          resultRank: 1,
        };

        await retrievalSystem.analytics.trackRetrieval(retrievalQuery, results, feedback);
      }

      // Get analytics
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
      const analytics = await retrievalSystem.analytics.getRetrievalMetrics(startDate, endDate);

      expect(analytics.totalQueries).toBeGreaterThanOrEqual(3);
      expect(analytics.averageRelevanceScore).toBeGreaterThan(0.5);
      expect(analytics.clickThroughRate).toBeGreaterThan(0.5);
      expect(analytics.strategyDistribution).toBeDefined();
    });

    it('should show learning progress over time', async () => {
      // Simulate learning progression
      for (let i = 0; i < 50; i++) {
        const query: RetrievalQuery = {
          query: `test query ${i}`,
          context: mockContext,
        };

        const results = await retrievalSystem.hybridRetriever.retrieve(query);

        // Simulate improving feedback over time
        const reward = Math.min(0.9, 0.3 + i * 0.01);
        const feedback: UserFeedback = {
          clicked: reward > 0.5,
          dwellTime: reward * 10000,
          usedInSolution: reward > 0.7,
          copiedContent: reward > 0.6,
          bookmarked: reward > 0.8,
          relevanceRating: Math.ceil(reward * 5),
          timestamp: new Date(),
          sessionId: 'progress-test',
          queryId: `progress-${i}`,
          resultRank: 1,
        };

        await retrievalSystem.analytics.trackRetrieval(query, results, feedback);
        await retrievalSystem.banditLearner.updateReward(results.strategyUsed, mockContext, reward);
      }

      const progress = await retrievalSystem.analytics.getLearningProgress();

      expect(progress.totalIterations).toBe(50);
      expect(progress.averageReward).toBeGreaterThan(0.5);
      expect(progress.rewardTrend).toHaveLength(50);
      expect(progress.featureImportance).toBeDefined();
      expect(progress.topFeatures).toHaveLength(10);
    });

    it('should provide strategy effectiveness analysis', async () => {
      // Force usage of different strategies with different success rates
      const strategies = ['fts-heavy', 'vector-heavy', 'balanced', 'semantic-focused'];

      for (const strategy of strategies) {
        for (let i = 0; i < 20; i++) {
          // Different success rates for different strategies
          let reward;
          switch (strategy) {
            case 'fts-heavy':
              reward = 0.8 + Math.random() * 0.15;
              break;
            case 'vector-heavy':
              reward = 0.4 + Math.random() * 0.3;
              break;
            case 'balanced':
              reward = 0.65 + Math.random() * 0.2;
              break;
            case 'semantic-focused':
              reward = 0.7 + Math.random() * 0.25;
              break;
            default:
              reward = 0.5;
          }

          await retrievalSystem.banditLearner.updateReward(strategy as any, mockContext, reward);
        }
      }

      const effectiveness = await retrievalSystem.analytics.getStrategyEffectiveness();

      expect(effectiveness).toHaveLength(strategies.length);
      expect(effectiveness[0].averageReward).toBeGreaterThan(
        effectiveness[effectiveness.length - 1].averageReward,
      );

      // FTS-heavy should be most effective based on our simulation
      expect(effectiveness[0].strategy).toBe('fts-heavy');
    });
  });

  describe('A/B Testing Framework', () => {
    it('should create and run A/B experiments', async () => {
      const experimentConfig = {
        name: 'Strategy Comparison Test',
        description: 'Compare FTS-heavy vs Vector-heavy strategies',
        controlStrategy: 'fts-heavy' as const,
        testStrategies: ['vector-heavy' as const],
        trafficSplit: [0.5, 0.5],
        startDate: new Date(),
        endDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        successMetrics: ['relevance', 'click-through-rate'],
        minimumSampleSize: 100,
        confidenceLevel: 0.95,
        minimumEffect: 0.05,
      };

      const experimentId = await retrievalSystem.analytics.createExperiment(experimentConfig);
      expect(experimentId).toBeDefined();
      expect(experimentId).toMatch(/^exp_/);

      // Simulate experiment data collection
      for (let i = 0; i < 50; i++) {
        const query: RetrievalQuery = {
          query: `experiment query ${i}`,
          context: mockContext,
        };

        const results = await retrievalSystem.hybridRetriever.retrieve(query);

        // Assign to experiment
        const experimentResults = {
          ...results,
          experimentId,
        };

        const feedback: UserFeedback = {
          clicked: Math.random() > 0.4,
          dwellTime: 3000 + Math.random() * 7000,
          usedInSolution: Math.random() > 0.6,
          copiedContent: Math.random() > 0.7,
          bookmarked: Math.random() > 0.8,
          relevanceRating: Math.ceil(Math.random() * 5),
          timestamp: new Date(),
          sessionId: 'experiment-session',
          queryId: `exp-${i}`,
          resultRank: 1,
        };

        await retrievalSystem.analytics.trackRetrieval(query, experimentResults, feedback);
      }

      // Get experiment results
      const experimentResults = await retrievalSystem.analytics.getExperimentResults(experimentId);

      expect(experimentResults.experimentId).toBe(experimentId);
      expect(experimentResults.status).toBe('running');
      expect(experimentResults.totalSamples).toBeGreaterThan(0);
      expect(experimentResults.variantResults).toBeDefined();
      expect(experimentResults.recommendation).toBeDefined();
    });

    it('should handle statistical significance testing', async () => {
      const experimentConfig = {
        name: 'Statistical Significance Test',
        description: 'Test statistical significance detection',
        controlStrategy: 'balanced' as const,
        testStrategies: ['effectiveness-focused' as const],
        trafficSplit: [0.5, 0.5],
        startDate: new Date(),
        endDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        successMetrics: ['relevance'],
        minimumSampleSize: 30,
        confidenceLevel: 0.95,
        minimumEffect: 0.1,
      };

      const experimentId = await retrievalSystem.analytics.createExperiment(experimentConfig);

      // Simulate data with clear difference
      for (let i = 0; i < 60; i++) {
        const strategy = i % 2 === 0 ? 'balanced' : 'effectiveness-focused';
        const baseReward = strategy === 'effectiveness-focused' ? 0.8 : 0.5; // Clear difference
        const reward = baseReward + (Math.random() - 0.5) * 0.2;

        await retrievalSystem.banditLearner.updateReward(
          strategy as any,
          mockContext,
          Math.max(0, Math.min(1, reward)),
        );
      }

      const results = await retrievalSystem.analytics.getExperimentResults(experimentId);

      expect(results.pValue).toBeLessThan(0.05); // Should detect significance
      expect(results.isStatisticallySignificant).toBe(true);
      expect(results.winner).toBe('effectiveness-focused');
    });
  });

  describe('Performance and Scalability', () => {
    it('should maintain performance under load', async () => {
      const startTime = Date.now();
      const concurrentQueries = 20;

      const promises = Array.from({ length: concurrentQueries }, (_, i) =>
        retrievalSystem.hybridRetriever.retrieve({
          query: `concurrent query ${i}`,
          context: mockContext,
          limit: 10,
        }),
      );

      const results = await Promise.all(promises);
      const endTime = Date.now();

      const avgTime = (endTime - startTime) / concurrentQueries;

      expect(results).toHaveLength(concurrentQueries);
      expect(avgTime).toBeLessThan(1000); // Average < 1 second per query

      results.forEach((result) => {
        expect(result.executionTime).toBeLessThan(2000); // Individual queries < 2 seconds
        expect(result.results).toBeDefined();
      });
    });

    it('should handle memory usage efficiently', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Perform many retrievals to test memory management
      for (let i = 0; i < 100; i++) {
        const result = await retrievalSystem.hybridRetriever.retrieve({
          query: `memory test ${i}`,
          context: mockContext,
        });

        // Simulate feedback for analytics
        const feedback: UserFeedback = {
          clicked: Math.random() > 0.5,
          dwellTime: Math.random() * 10000,
          usedInSolution: Math.random() > 0.6,
          copiedContent: Math.random() > 0.7,
          bookmarked: Math.random() > 0.8,
          timestamp: new Date(),
          sessionId: 'memory-test',
          queryId: `mem-${i}`,
          resultRank: 1,
        };

        await retrievalSystem.analytics.trackRetrieval(
          {
            query: `memory test ${i}`,
            context: mockContext,
          },
          result,
          feedback,
        );
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;

      // Memory growth should be reasonable (< 50MB for 100 queries)
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024);
    });

    it('should recover gracefully from errors', async () => {
      // Simulate search engine failure
      const originalSearch = mockSearchEngine.search;
      mockSearchEngine.search = async () => {
        throw new Error('Search engine temporarily unavailable');
      };

      // Should handle error gracefully
      await expect(
        retrievalSystem.hybridRetriever.retrieve({
          query: 'error test',
          context: mockContext,
        }),
      ).rejects.toThrow();

      // Restore search engine
      mockSearchEngine.search = originalSearch;

      // Should work normally after recovery
      const result = await retrievalSystem.hybridRetriever.retrieve({
        query: 'recovery test',
        context: mockContext,
      });

      expect(result).toBeDefined();
      expect(result.results).toBeDefined();
    });
  });

  describe('Feature Integration', () => {
    it('should integrate all ML components seamlessly', async () => {
      const query: RetrievalQuery = {
        query: 'comprehensive integration test',
        context: mockContext,
        adaptiveWeights: true,
        enableReranker: true,
        explorationRate: 0.2,
        hybridMode: 'adaptive',
      };

      const results = await retrievalSystem.hybridRetriever.retrieve(query);

      // Should demonstrate integration of all components
      expect(results.adaptiveLearningActive).toBe(true);
      expect(results.strategyUsed).toBeDefined();
      expect(results.featureExtractionTime).toBeGreaterThan(0);
      expect(results.results[0].features).toBeDefined();
      expect(results.results[0].confidenceScore).toBeGreaterThan(0);

      // All results should have ML-enhanced metadata
      results.results.forEach((result) => {
        expect(result.retrievalStrategy).toBeDefined();
        expect(result.rankerUsed).toBeDefined();
        expect(typeof result.confidenceScore).toBe('number');
      });
    });

    it('should provide comprehensive reporting', async () => {
      // Generate diverse activity
      const activities = [
        'authentication flows',
        'testing strategies',
        'security patterns',
        'error handling',
        'performance optimization',
      ];

      for (const activity of activities) {
        for (let i = 0; i < 10; i++) {
          const result = await retrievalSystem.hybridRetriever.retrieve({
            query: `${activity} ${i}`,
            context: mockContext,
          });

          const feedback: UserFeedback = {
            clicked: Math.random() > 0.3,
            dwellTime: Math.random() * 12000,
            usedInSolution: Math.random() > 0.5,
            copiedContent: Math.random() > 0.6,
            bookmarked: Math.random() > 0.7,
            relevanceRating: Math.ceil(Math.random() * 5),
            timestamp: new Date(),
            sessionId: 'reporting-test',
            queryId: `report-${activity}-${i}`,
            resultRank: 1,
          };

          await retrievalSystem.analytics.trackRetrieval(
            {
              query: `${activity} ${i}`,
              context: mockContext,
            },
            result,
            feedback,
          );
        }
      }

      // Generate comprehensive report
      const report = await retrievalSystem.analytics.generateLearningReport('week', new Date());

      expect(report.period).toBe('week');
      expect(report.summary.totalQueries).toBeGreaterThan(0);
      expect(report.analytics).toBeDefined();
      expect(report.progress).toBeDefined();
      expect(report.strategies.length).toBeGreaterThan(0);
      expect(report.insights.length).toBeGreaterThan(0);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });
  });
});
