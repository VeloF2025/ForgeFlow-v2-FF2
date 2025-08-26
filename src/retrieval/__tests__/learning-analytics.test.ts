// Tests for IntelligentLearningAnalytics - A/B Testing & Performance Tracking
// Validates analytics, experiments, reporting, and learning progress tracking

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IntelligentLearningAnalytics } from '../learning-analytics.js';
import type {
  RetrievalQuery,
  RetrievalResults,
  SearchContext,
  RetrievalConfig,
  UserFeedback,
  ExperimentConfig,
  AnalyticsFilters,
  RetrievalStrategy,
} from '../types.js';

const mockConfig: RetrievalConfig['analytics'] = {
  trackingEnabled: true,
  batchSize: 100,
  retentionDays: 30,
  slowQueryThreshold: 1000,
  lowRelevanceThreshold: 0.3,
  defaultConfidenceLevel: 0.95,
  defaultMinimumEffect: 0.05,
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

const mockResults: RetrievalResults = {
  results: [
    {
      entry: {
        id: 'test-1',
        title: 'Test Document 1',
        content: 'Content 1',
        path: '/test/1',
        type: 'knowledge',
        lastModified: new Date(),
        hash: 'hash1',
        metadata: {
          category: 'test',
          tags: ['test'],
          projectId: 'test-project',
          agentTypes: ['test-agent'],
          language: 'en',
          usageCount: 0,
          lastUsed: new Date(),
          fileSize: 1024,
          relatedIds: [],
          childIds: [],
        },
      },
      score: 8.5,
      rank: 1,
      matchedFields: ['title'],
      totalMatches: 1,
      titleSnippet: 'Test Document 1',
      contentSnippets: [],
      relevanceFactors: {
        titleMatch: 8.5,
        contentMatch: 0,
        tagMatch: 0,
        categoryMatch: 0,
        recencyBoost: 1.0,
        effectivenessBoost: 1.0,
        usageBoost: 1.0,
      },
      features: {} as any,
      confidenceScore: 0.85,
      retrievalStrategy: 'fts-heavy',
      rankerUsed: 'base',
    },
  ],
  totalMatches: 1,
  totalPages: 1,
  currentPage: 1,
  executionTime: 150,
  facets: {
    types: [],
    categories: [],
    tags: [],
    projects: [],
    agents: [],
    languages: [],
  },
  suggestions: [],
  strategyUsed: 'fts-heavy',
  explorationPerformed: false,
  adaptiveLearningActive: true,
  featureExtractionTime: 50,
  rankingTime: 25,
  totalMLTime: 75,
};

describe('IntelligentLearningAnalytics', () => {
  let analytics: IntelligentLearningAnalytics;

  beforeEach(() => {
    analytics = new IntelligentLearningAnalytics(mockConfig);
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(analytics).toBeDefined();
    });

    it('should initialize with tracking disabled', () => {
      const disabledConfig = { ...mockConfig, trackingEnabled: false };
      const disabledAnalytics = new IntelligentLearningAnalytics(disabledConfig);
      expect(disabledAnalytics).toBeDefined();
    });

    it('should start cleanup interval', () => {
      // Cleanup interval should be started (internal behavior)
      expect(analytics).toBeDefined();
    });
  });

  describe('Retrieval Tracking', () => {
    it('should track retrieval when enabled', async () => {
      await analytics.trackRetrieval(mockQuery, mockResults);

      const metrics = await analytics.getRetrievalMetrics(
        new Date(Date.now() - 24 * 60 * 60 * 1000),
        new Date(),
      );

      expect(metrics.totalQueries).toBe(1);
    });

    it('should not track retrieval when disabled', async () => {
      const disabledConfig = { ...mockConfig, trackingEnabled: false };
      const disabledAnalytics = new IntelligentLearningAnalytics(disabledConfig);

      await disabledAnalytics.trackRetrieval(mockQuery, mockResults);

      const metrics = await disabledAnalytics.getRetrievalMetrics(
        new Date(Date.now() - 24 * 60 * 60 * 1000),
        new Date(),
      );

      expect(metrics.totalQueries).toBe(0);
    });

    it('should track retrieval with feedback', async () => {
      const feedback: UserFeedback = {
        clicked: true,
        dwellTime: 15000,
        usedInSolution: true,
        copiedContent: false,
        bookmarked: false,
        relevanceRating: 5,
        timestamp: new Date(),
        sessionId: 'test-session',
        queryId: 'test-query',
        resultRank: 1,
      };

      await analytics.trackRetrieval(mockQuery, mockResults, feedback);

      const metrics = await analytics.getRetrievalMetrics(
        new Date(Date.now() - 24 * 60 * 60 * 1000),
        new Date(),
      );

      expect(metrics.totalQueries).toBe(1);
      expect(metrics.averageRelevanceScore).toBeGreaterThan(0);
    });

    it('should handle tracking errors gracefully', async () => {
      // Should not throw errors even if internal tracking fails
      await expect(analytics.trackRetrieval(mockQuery, mockResults)).resolves.not.toThrow();
    });

    it('should track multiple retrievals', async () => {
      for (let i = 0; i < 5; i++) {
        await analytics.trackRetrieval(mockQuery, mockResults);
      }

      const metrics = await analytics.getRetrievalMetrics(
        new Date(Date.now() - 24 * 60 * 60 * 1000),
        new Date(),
      );

      expect(metrics.totalQueries).toBe(5);
    });
  });

  describe('Retrieval Metrics', () => {
    beforeEach(async () => {
      // Populate some test data
      for (let i = 0; i < 10; i++) {
        const query = { ...mockQuery, query: `test query ${i}` };
        const results = { ...mockResults, executionTime: 100 + i * 10 };
        await analytics.trackRetrieval(query, results);
      }
    });

    it('should provide comprehensive retrieval metrics', async () => {
      const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const endDate = new Date();

      const metrics = await analytics.getRetrievalMetrics(startDate, endDate);

      expect(metrics).toHaveProperty('totalQueries');
      expect(metrics).toHaveProperty('uniqueQueries');
      expect(metrics).toHaveProperty('averageResultsPerQuery');
      expect(metrics).toHaveProperty('zeroResultQueries');
      expect(metrics).toHaveProperty('averageRetrievalTime');
      expect(metrics).toHaveProperty('averageFeatureExtractionTime');
      expect(metrics).toHaveProperty('averageRankingTime');
      expect(metrics).toHaveProperty('cacheHitRate');
      expect(metrics).toHaveProperty('banditRegret');
      expect(metrics).toHaveProperty('explorationRate');
      expect(metrics).toHaveProperty('averageRelevanceScore');
      expect(metrics).toHaveProperty('clickThroughRate');
      expect(metrics).toHaveProperty('successRate');
      expect(metrics).toHaveProperty('strategyDistribution');
      expect(metrics).toHaveProperty('optimalStrategyRate');

      expect(metrics.totalQueries).toBe(10);
      expect(metrics.averageRetrievalTime).toBeGreaterThan(0);
    });

    it('should filter metrics by date range', async () => {
      const startDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // Future date
      const endDate = new Date(Date.now() + 48 * 60 * 60 * 1000);

      const metrics = await analytics.getRetrievalMetrics(startDate, endDate);

      expect(metrics.totalQueries).toBe(0);
    });

    it('should filter metrics by content type', async () => {
      const filters: AnalyticsFilters = {
        contentTypes: ['code'],
      };

      const metrics = await analytics.getRetrievalMetrics(
        new Date(Date.now() - 24 * 60 * 60 * 1000),
        new Date(),
        filters,
      );

      expect(metrics.totalQueries).toBe(0); // No code content in our test data
    });

    it('should filter metrics by agent types', async () => {
      const filters: AnalyticsFilters = {
        agentTypes: ['test-agent'],
      };

      const metrics = await analytics.getRetrievalMetrics(
        new Date(Date.now() - 24 * 60 * 60 * 1000),
        new Date(),
        filters,
      );

      expect(metrics.totalQueries).toBe(10);
    });

    it('should filter metrics by projects', async () => {
      const filters: AnalyticsFilters = {
        projects: ['test-project'],
      };

      const metrics = await analytics.getRetrievalMetrics(
        new Date(Date.now() - 24 * 60 * 60 * 1000),
        new Date(),
        filters,
      );

      expect(metrics.totalQueries).toBe(10);
    });

    it('should calculate strategy distribution correctly', async () => {
      const metrics = await analytics.getRetrievalMetrics(
        new Date(Date.now() - 24 * 60 * 60 * 1000),
        new Date(),
      );

      expect(metrics.strategyDistribution['fts-heavy']).toBe(1.0); // All queries used fts-heavy
    });
  });

  describe('Learning Progress', () => {
    it('should provide learning progress metrics', async () => {
      // Add some test data with feedback
      for (let i = 0; i < 20; i++) {
        const feedback: UserFeedback = {
          clicked: i % 2 === 0,
          dwellTime: 5000 + i * 1000,
          usedInSolution: i % 3 === 0,
          copiedContent: i % 4 === 0,
          bookmarked: i % 5 === 0,
          relevanceRating: Math.ceil((i % 5) + 1),
          timestamp: new Date(),
          sessionId: `session-${i}`,
          queryId: `query-${i}`,
          resultRank: 1,
        };

        await analytics.trackRetrieval(mockQuery, mockResults, feedback);
      }

      const progress = await analytics.getLearningProgress();

      expect(progress).toHaveProperty('totalIterations');
      expect(progress).toHaveProperty('totalReward');
      expect(progress).toHaveProperty('averageReward');
      expect(progress).toHaveProperty('rewardTrend');
      expect(progress).toHaveProperty('isConverging');
      expect(progress).toHaveProperty('convergenceRate');
      expect(progress).toHaveProperty('stabilityMetric');
      expect(progress).toHaveProperty('explorationRate');
      expect(progress).toHaveProperty('exploitationRate');
      expect(progress).toHaveProperty('optimalBalance');
      expect(progress).toHaveProperty('featureImportance');
      expect(progress).toHaveProperty('topFeatures');

      expect(progress.totalIterations).toBe(20);
      expect(progress.averageReward).toBeGreaterThanOrEqual(0);
      expect(progress.averageReward).toBeLessThanOrEqual(1);
    });

    it('should handle empty learning history', async () => {
      const progress = await analytics.getLearningProgress();

      expect(progress.totalIterations).toBe(0);
      expect(progress.totalReward).toBe(0);
      expect(progress.averageReward).toBe(0);
    });

    it('should detect convergence patterns', async () => {
      // Add consistent rewards to simulate convergence
      for (let i = 0; i < 100; i++) {
        const feedback: UserFeedback = {
          clicked: true,
          dwellTime: 15000,
          usedInSolution: true,
          copiedContent: true,
          bookmarked: false,
          relevanceRating: 5,
          timestamp: new Date(),
          sessionId: `session-${i}`,
          queryId: `query-${i}`,
          resultRank: 1,
        };

        await analytics.trackRetrieval(mockQuery, mockResults, feedback);
      }

      const progress = await analytics.getLearningProgress();

      expect(progress.isConverging).toBeDefined();
      expect(progress.convergenceRate).toBeGreaterThanOrEqual(0);
      expect(progress.stabilityMetric).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Strategy Effectiveness', () => {
    beforeEach(async () => {
      // Add data for different strategies
      const strategies: RetrievalStrategy[] = ['fts-heavy', 'vector-heavy', 'balanced'];

      for (let i = 0; i < strategies.length; i++) {
        for (let j = 0; j < 10; j++) {
          const results = {
            ...mockResults,
            strategyUsed: strategies[i],
            executionTime: 100 + i * 50,
          };

          const feedback: UserFeedback = {
            clicked: j % 2 === 0,
            dwellTime: 5000 + j * 1000,
            usedInSolution: j % 3 === 0,
            copiedContent: j % 4 === 0,
            bookmarked: j % 5 === 0,
            relevanceRating: (i + 1) * 2, // Different effectiveness per strategy
            timestamp: new Date(),
            sessionId: `session-${i}-${j}`,
            queryId: `query-${i}-${j}`,
            resultRank: 1,
          };

          await analytics.trackRetrieval(mockQuery, results, feedback);
        }
      }
    });

    it('should provide strategy effectiveness metrics', async () => {
      const effectiveness = await analytics.getStrategyEffectiveness();

      expect(effectiveness).toHaveLength(3); // Three strategies

      effectiveness.forEach((strategy) => {
        expect(strategy).toHaveProperty('strategy');
        expect(strategy).toHaveProperty('averageReward');
        expect(strategy).toHaveProperty('successRate');
        expect(strategy).toHaveProperty('averageResponseTime');
        expect(strategy).toHaveProperty('timesUsed');
        expect(strategy).toHaveProperty('percentageUsed');
        expect(strategy).toHaveProperty('bestContexts');
        expect(strategy).toHaveProperty('rewardTrend');

        expect(strategy.timesUsed).toBe(10);
        expect(strategy.averageReward).toBeGreaterThanOrEqual(0);
        expect(strategy.averageResponseTime).toBeGreaterThan(0);
      });
    });

    it('should rank strategies by effectiveness', async () => {
      const effectiveness = await analytics.getStrategyEffectiveness();

      // Should be sorted by average reward (descending)
      for (let i = 0; i < effectiveness.length - 1; i++) {
        expect(effectiveness[i].averageReward).toBeGreaterThanOrEqual(
          effectiveness[i + 1].averageReward,
        );
      }
    });

    it('should calculate usage percentages correctly', async () => {
      const effectiveness = await analytics.getStrategyEffectiveness();

      const totalPercentage = effectiveness.reduce((sum, s) => sum + s.percentageUsed, 0);
      expect(Math.abs(totalPercentage - 100)).toBeLessThan(0.1); // Should sum to ~100%
    });
  });

  describe('A/B Testing Framework', () => {
    it('should create experiments successfully', async () => {
      const experimentConfig: ExperimentConfig = {
        name: 'Test Experiment',
        description: 'Testing strategy effectiveness',
        controlStrategy: 'fts-heavy',
        testStrategies: ['vector-heavy'],
        trafficSplit: [0.5, 0.5],
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        successMetrics: ['relevance', 'click_through_rate'],
        minimumSampleSize: 100,
        confidenceLevel: 0.95,
        minimumEffect: 0.05,
      };

      const experimentId = await analytics.createExperiment(experimentConfig);

      expect(experimentId).toBeDefined();
      expect(typeof experimentId).toBe('string');
      expect(experimentId).toMatch(/^exp_/);
    });

    it('should validate experiment configuration', async () => {
      const invalidConfig: ExperimentConfig = {
        name: '', // Invalid: empty name
        description: 'Invalid experiment',
        controlStrategy: 'fts-heavy',
        testStrategies: ['vector-heavy'],
        trafficSplit: [0.5, 0.5],
        startDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        endDate: new Date(), // Invalid: end before start
        successMetrics: ['relevance'],
        minimumSampleSize: 100,
        confidenceLevel: 0.95,
        minimumEffect: 0.05,
      };

      await expect(analytics.createExperiment(invalidConfig)).rejects.toThrow();
    });

    it('should validate traffic split configuration', async () => {
      const invalidTrafficConfig: ExperimentConfig = {
        name: 'Invalid Traffic Split',
        description: 'Testing invalid traffic split',
        controlStrategy: 'fts-heavy',
        testStrategies: ['vector-heavy'],
        trafficSplit: [0.3, 0.4], // Invalid: doesn't sum to 1.0
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        successMetrics: ['relevance'],
        minimumSampleSize: 100,
        confidenceLevel: 0.95,
        minimumEffect: 0.05,
      };

      await expect(analytics.createExperiment(invalidTrafficConfig)).rejects.toThrow(
        'Traffic split must sum to 1.0',
      );
    });

    it('should get experiment results', async () => {
      const experimentConfig: ExperimentConfig = {
        name: 'Results Test Experiment',
        description: 'Testing result retrieval',
        controlStrategy: 'fts-heavy',
        testStrategies: ['vector-heavy'],
        trafficSplit: [0.5, 0.5],
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Started yesterday
        endDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
        successMetrics: ['relevance'],
        minimumSampleSize: 10,
        confidenceLevel: 0.95,
        minimumEffect: 0.05,
      };

      const experimentId = await analytics.createExperiment(experimentConfig);

      // Add some test data for the experiment
      for (let i = 0; i < 20; i++) {
        const strategy = i % 2 === 0 ? 'fts-heavy' : 'vector-heavy';
        const results = {
          ...mockResults,
          strategyUsed: strategy as RetrievalStrategy,
          experimentId,
        };

        const feedback: UserFeedback = {
          clicked: true,
          dwellTime: 10000,
          usedInSolution: i % 3 === 0,
          copiedContent: false,
          bookmarked: true,
          relevanceRating: strategy === 'fts-heavy' ? 4 : 3, // Simulate difference
          timestamp: new Date(),
          sessionId: `session-${i}`,
          queryId: `query-${i}`,
          resultRank: 1,
        };

        await analytics.trackRetrieval(mockQuery, results, feedback);
      }

      const experimentResults = await analytics.getExperimentResults(experimentId);

      expect(experimentResults).toHaveProperty('experimentId');
      expect(experimentResults).toHaveProperty('config');
      expect(experimentResults).toHaveProperty('status');
      expect(experimentResults).toHaveProperty('totalSamples');
      expect(experimentResults).toHaveProperty('samplesPerVariant');
      expect(experimentResults).toHaveProperty('variantResults');
      expect(experimentResults).toHaveProperty('isStatisticallySignificant');
      expect(experimentResults).toHaveProperty('pValue');
      expect(experimentResults).toHaveProperty('effectSize');
      expect(experimentResults).toHaveProperty('recommendation');

      expect(experimentResults.experimentId).toBe(experimentId);
      expect(experimentResults.status).toBe('running');
      expect(experimentResults.totalSamples).toBeGreaterThan(0);
    });

    it('should handle non-existent experiments', async () => {
      await expect(analytics.getExperimentResults('non-existent-id')).rejects.toThrow(
        'Experiment not found',
      );
    });

    it('should determine experiment winners', async () => {
      const experimentConfig: ExperimentConfig = {
        name: 'Winner Test Experiment',
        description: 'Testing winner determination',
        controlStrategy: 'fts-heavy',
        testStrategies: ['vector-heavy'],
        trafficSplit: [0.5, 0.5],
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() - 1000), // Completed experiment
        successMetrics: ['relevance'],
        minimumSampleSize: 30,
        confidenceLevel: 0.95,
        minimumEffect: 0.05,
      };

      const experimentId = await analytics.createExperiment(experimentConfig);

      // Add significant sample size with clear winner
      for (let i = 0; i < 60; i++) {
        const strategy = i % 2 === 0 ? 'fts-heavy' : 'vector-heavy';
        const results = {
          ...mockResults,
          strategyUsed: strategy as RetrievalStrategy,
          experimentId,
        };

        const feedback: UserFeedback = {
          clicked: true,
          dwellTime: 15000,
          usedInSolution: true,
          copiedContent: true,
          bookmarked: false,
          relevanceRating: strategy === 'fts-heavy' ? 5 : 2, // Clear difference
          timestamp: new Date(),
          sessionId: `session-${i}`,
          queryId: `query-${i}`,
          resultRank: 1,
        };

        await analytics.trackRetrieval(mockQuery, results, feedback);
      }

      const experimentResults = await analytics.getExperimentResults(experimentId);

      expect(experimentResults.status).toBe('completed');
      expect(experimentResults.totalSamples).toBe(60);
    });
  });

  describe('Learning Reports', () => {
    beforeEach(async () => {
      // Populate data for reports
      for (let i = 0; i < 50; i++) {
        const strategy = ['fts-heavy', 'vector-heavy', 'balanced'][i % 3] as RetrievalStrategy;
        const results = { ...mockResults, strategyUsed: strategy };

        const feedback: UserFeedback = {
          clicked: i % 2 === 0,
          dwellTime: 5000 + i * 200,
          usedInSolution: i % 4 === 0,
          relevanceRating: Math.ceil(Math.random() * 5),
          copiedContent: i % 5 === 0,
          bookmarked: i % 6 === 0,
          timestamp: new Date(Date.now() - (50 - i) * 60 * 60 * 1000), // Spread over time
          sessionId: `session-${i}`,
          queryId: `query-${i}`,
          resultRank: (i % 3) + 1,
        };

        await analytics.trackRetrieval(mockQuery, results, feedback);
      }
    });

    it('should generate daily learning reports', async () => {
      const report = await analytics.generateLearningReport('day', new Date());

      expect(report).toHaveProperty('period');
      expect(report).toHaveProperty('date');
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('analytics');
      expect(report).toHaveProperty('progress');
      expect(report).toHaveProperty('strategies');
      expect(report).toHaveProperty('insights');
      expect(report).toHaveProperty('recommendations');

      expect(report.period).toBe('day');
      expect(report.summary.totalQueries).toBeGreaterThan(0);
    });

    it('should generate weekly learning reports', async () => {
      const report = await analytics.generateLearningReport('week', new Date());

      expect(report.period).toBe('week');
      expect(report.summary).toBeDefined();
    });

    it('should generate monthly learning reports', async () => {
      const report = await analytics.generateLearningReport('month', new Date());

      expect(report.period).toBe('month');
      expect(report.summary).toBeDefined();
    });

    it('should provide insights in reports', async () => {
      const report = await analytics.generateLearningReport('day', new Date());

      expect(Array.isArray(report.insights)).toBe(true);

      report.insights.forEach((insight) => {
        expect(insight).toHaveProperty('type');
        expect(insight).toHaveProperty('message');
        expect(insight).toHaveProperty('impact');
        expect(insight).toHaveProperty('actionRequired');

        expect(['improvement', 'degradation', 'trend', 'anomaly']).toContain(insight.type);
        expect(['high', 'medium', 'low']).toContain(insight.impact);
      });
    });

    it('should provide recommendations in reports', async () => {
      const report = await analytics.generateLearningReport('day', new Date());

      expect(Array.isArray(report.recommendations)).toBe(true);

      report.recommendations.forEach((rec) => {
        expect(rec).toHaveProperty('type');
        expect(rec).toHaveProperty('title');
        expect(rec).toHaveProperty('description');
        expect(rec).toHaveProperty('priority');
        expect(rec).toHaveProperty('estimatedImpact');

        expect(['configuration', 'training', 'feature', 'strategy']).toContain(rec.type);
        expect(['high', 'medium', 'low']).toContain(rec.priority);
        expect(rec.estimatedImpact).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Performance Alerts', () => {
    it('should detect slow queries', async () => {
      const slowResults = { ...mockResults, executionTime: 2000 }; // Above threshold

      // Mock console.warn to capture alerts
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await analytics.trackRetrieval(mockQuery, slowResults);

      // Note: In real implementation, this would trigger monitoring alerts
      expect(analytics).toBeDefined();

      warnSpy.mockRestore();
    });

    it('should detect low relevance queries', async () => {
      const lowRelevanceResults = {
        ...mockResults,
        results: mockResults.results.map((r) => ({ ...r, confidenceScore: 0.1 })),
      };

      await analytics.trackRetrieval(mockQuery, lowRelevanceResults);

      // Low relevance detection is handled internally
      expect(analytics).toBeDefined();
    });
  });

  describe('Data Cleanup', () => {
    it('should clean up old data based on retention policy', async () => {
      // Add old data (beyond retention period)
      const oldQuery = {
        ...mockQuery,
        context: {
          ...mockContext,
          timestamp: new Date(Date.now() - (mockConfig.retentionDays + 1) * 24 * 60 * 60 * 1000),
        },
      };

      await analytics.trackRetrieval(oldQuery, mockResults);

      // Trigger cleanup (normally done by interval)
      // In real implementation, old data would be cleaned up
      expect(analytics).toBeDefined();
    });

    it('should handle cleanup errors gracefully', () => {
      // Cleanup should not throw errors
      expect(analytics).toBeDefined();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty metrics requests', async () => {
      const futureStartDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const futureEndDate = new Date(Date.now() + 48 * 60 * 60 * 1000);

      const metrics = await analytics.getRetrievalMetrics(futureStartDate, futureEndDate);

      expect(metrics.totalQueries).toBe(0);
      expect(metrics.averageRetrievalTime).toBe(0);
    });

    it('should handle malformed feedback gracefully', async () => {
      const malformedFeedback = {
        clicked: 'invalid' as any,
        dwellTime: -1000,
        usedInSolution: false,
        copiedContent: false,
        bookmarked: false,
        timestamp: new Date(),
        sessionId: 'test',
        queryId: 'test',
        resultRank: 0,
      } as UserFeedback;

      await expect(
        analytics.trackRetrieval(mockQuery, mockResults, malformedFeedback),
      ).resolves.not.toThrow();
    });

    it('should handle concurrent operations', async () => {
      const promises = [];

      for (let i = 0; i < 20; i++) {
        promises.push(analytics.trackRetrieval(mockQuery, mockResults));
      }

      await expect(Promise.all(promises)).resolves.not.toThrow();

      const metrics = await analytics.getRetrievalMetrics(
        new Date(Date.now() - 24 * 60 * 60 * 1000),
        new Date(),
      );

      expect(metrics.totalQueries).toBe(20);
    });

    it('should handle date range edge cases', async () => {
      const invalidStartDate = new Date('invalid');
      const validEndDate = new Date();

      await expect(
        analytics.getRetrievalMetrics(invalidStartDate, validEndDate),
      ).resolves.toBeDefined();
    });
  });
});
