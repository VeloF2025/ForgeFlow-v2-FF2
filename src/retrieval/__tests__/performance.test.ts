// Performance Benchmarks for Retrieval Layer - <500ms Response Time Validation
// Tests ML performance, memory usage, concurrency, and end-to-end integration

import { describe, it, expect, beforeEach } from 'vitest';
import { IntelligentHybridRetriever } from '../hybrid-retriever.js';
import { OnlineLearningReranker } from '../re-ranker.js';
import { SmartFeatureExtractor } from '../feature-extractor.js';
import { IntelligentLearningAnalytics } from '../learning-analytics.js';
import { EpsilonGreedyBandit } from '../bandit-learner.js';
import { RankFusionEngine } from '../rank-fusion.js';
import type { RetrievalQuery, SearchContext, RetrievalConfig, UserFeedback } from '../types.js';
import type { ISearchEngine, SearchResult } from '../../indexing/types.js';

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
    slowQueryThreshold: 500, // Strict threshold for performance testing
    lowRelevanceThreshold: 0.3,
    defaultConfidenceLevel: 0.95,
    defaultMinimumEffect: 0.05,
  },
  performance: {
    maxFeatureExtractionTime: 200, // Strict limits for performance testing
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

// Fast mock search engine for performance testing
const fastMockSearchEngine: ISearchEngine = {
  async search(query: any) {
    // Simulate realistic search times (10-50ms)
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 40 + 10));

    const resultCount = query.limit || 20;
    const results: SearchResult[] = [];

    for (let i = 0; i < resultCount; i++) {
      results.push({
        entry: {
          id: `fast-result-${i}`,
          title: `Fast Test Document ${i}`,
          content: `This is fast test content ${i} with relevant information`,
          path: `/fast/test/${i}`,
          type: 'knowledge',
          lastModified: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
          hash: `fast-hash-${i}`,
          metadata: {
            category: `category-${i % 5}`,
            tags: [`tag${i}`, `common-tag`],
            projectId: 'test-project',
            agentTypes: ['test-agent'],
            language: 'en',
            usageCount: Math.floor(Math.random() * 100),
            effectiveness: Math.random(),
            lastUsed: new Date(),
            fileSize: 1024,
            relatedIds: [],
            childIds: [],
          },
        },
        score: (resultCount - i) * 0.5,
        rank: i + 1,
        matchedFields: ['title', 'content'],
        totalMatches: 20,
        titleSnippet: `Fast Test <mark>Document</mark> ${i}`,
        contentSnippets: [
          {
            text: `This is fast test content ${i}`,
            highlighted: `This is fast test <mark>content</mark> ${i}`,
            startOffset: 0,
            endOffset: 50,
            context: `This is fast test content ${i} with relevant information`,
          },
        ],
        relevanceFactors: {
          titleMatch: 0.8,
          contentMatch: 0.7,
          tagMatch: 0.3,
          categoryMatch: 0.2,
          recencyBoost: Math.max(0, 0.5 - i * 0.02),
          effectivenessBoost: Math.random(),
          usageBoost: Math.random() * 0.5,
        },
      });
    }

    return {
      results,
      totalMatches: resultCount,
      totalPages: 1,
      currentPage: 1,
      executionTime: Math.random() * 40 + 10,
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
  },

  async searchSimilar(entryId: string, limit?: number) {
    return this.search({ query: `similar to ${entryId}`, limit: limit || 10 });
  },

  async getSuggestions(partial: string, limit?: number) {
    return [`${partial} suggestion 1`, `${partial} suggestion 2`];
  },

  async getPopularQueries(limit?: number) {
    return [
      {
        query: 'test query',
        count: 10,
        averageResults: 5,
        averageResponseTime: 25,
        successRate: 0.95,
      },
      {
        query: 'performance',
        count: 8,
        averageResults: 3,
        averageResponseTime: 30,
        successRate: 0.88,
      },
    ];
  },

  async recordQuery(query: string, resultCount: number, responseTime: number) {
    // Mock implementation - no-op
  },

  async getAnalytics(startDate: Date, endDate: Date) {
    return {
      totalQueries: 100,
      uniqueQueries: 75,
      averageQueryLength: 12.5,
      topQueries: [
        {
          query: 'test query',
          count: 10,
          averageResults: 5,
          averageResponseTime: 25,
          successRate: 0.95,
        },
        {
          query: 'performance',
          count: 8,
          averageResults: 3,
          averageResponseTime: 30,
          successRate: 0.88,
        },
      ],
      averageResponseTime: 25,
      slowQueries: [],
      cacheMetrics: {
        hitRate: 0.85,
        totalHits: 85,
        totalMisses: 15,
        cacheSize: 1000,
        memoryUsage: 2048,
      },
      averageResults: 4.2,
      zeroResultQueries: 5,
      clickThroughRate: 0.78,
      startDate,
      endDate,
    };
  },
};

describe('Retrieval Layer Performance Benchmarks', () => {
  let retriever: IntelligentHybridRetriever;
  let bandit: EpsilonGreedyBandit;
  let reranker: OnlineLearningReranker;
  let featureExtractor: SmartFeatureExtractor;
  let analytics: IntelligentLearningAnalytics;
  let fusionEngine: RankFusionEngine;

  beforeEach(() => {
    bandit = new EpsilonGreedyBandit(mockConfig.bandit);
    retriever = new IntelligentHybridRetriever(fastMockSearchEngine, bandit, mockConfig);
    reranker = new OnlineLearningReranker(mockConfig.reranking);
    featureExtractor = new SmartFeatureExtractor(mockConfig.features);
    analytics = new IntelligentLearningAnalytics(mockConfig.analytics);
    fusionEngine = new RankFusionEngine(mockConfig);
  });

  describe('Core Retrieval Performance (<500ms Target)', () => {
    it('should complete basic retrieval within 500ms', async () => {
      const query: RetrievalQuery = {
        query: 'performance test query',
        context: mockContext,
        type: 'knowledge',
        limit: 10,
        offset: 0,
      };

      const startTime = Date.now();
      const results = await retriever.retrieve(query);
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      expect(results).toBeDefined();
      expect(results.results.length).toBeGreaterThan(0);
      expect(executionTime).toBeLessThan(500); // Core requirement
      expect(results.executionTime).toBeLessThan(500);

      console.log(`Basic retrieval completed in ${executionTime}ms (target: <500ms)`);
    });

    it('should complete retrieval with reranking within 500ms', async () => {
      const query: RetrievalQuery = {
        query: 'reranking performance test',
        context: mockContext,
        type: 'knowledge',
        limit: 20,
        offset: 0,
        enableReranker: true,
      };

      const startTime = Date.now();
      const results = await retriever.retrieve(query);
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      expect(results).toBeDefined();
      expect(executionTime).toBeLessThan(500);

      console.log(`Retrieval with reranking completed in ${executionTime}ms (target: <500ms)`);
    });

    it('should complete feature extraction within time limits', async () => {
      const query: RetrievalQuery = {
        query: 'feature extraction performance test',
        context: mockContext,
        type: 'knowledge',
        limit: 50,
        offset: 0,
      };

      const startTime = Date.now();
      const results = await retriever.retrieve(query);
      const endTime = Date.now();

      expect(results.featureExtractionTime).toBeLessThan(200); // Config limit
      expect(results.featureExtractionTime).toBeGreaterThan(0);

      console.log(
        `Feature extraction completed in ${results.featureExtractionTime}ms (target: <200ms)`,
      );
    });

    it('should handle large result sets within performance limits', async () => {
      const query: RetrievalQuery = {
        query: 'large result set performance test',
        context: mockContext,
        type: 'knowledge',
        limit: 100, // Large result set
        offset: 0,
      };

      const startTime = Date.now();
      const results = await retriever.retrieve(query);
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      expect(results.results.length).toBe(100);
      expect(executionTime).toBeLessThan(500);

      console.log(`Large result set (100 items) completed in ${executionTime}ms (target: <500ms)`);
    });
  });

  describe('ML Component Performance', () => {
    it('should complete bandit strategy selection quickly', async () => {
      const iterations = 1000;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await bandit.selectArm(mockContext);
      }

      const endTime = Date.now();
      const avgTime = (endTime - startTime) / iterations;

      expect(avgTime).toBeLessThan(1); // Should be <1ms per selection

      console.log(`Bandit selection: ${avgTime.toFixed(3)}ms average (${iterations} iterations)`);
    });

    it('should complete feature extraction in batch efficiently', async () => {
      // Generate test entries
      const entries = Array(50)
        .fill(null)
        .map((_, i) => ({
          id: `perf-test-${i}`,
          title: `Performance Test Document ${i}`,
          content: `This is performance test content ${i} with various features to extract`,
          path: `/perf/test/${i}`,
          type: 'knowledge' as const,
          lastModified: new Date(),
          hash: `perf-hash-${i}`,
          metadata: {
            category: `category-${i % 5}`,
            tags: [`tag${i}`, 'performance'],
            projectId: 'test-project',
            agentTypes: ['test-agent'],
            language: 'en',
            usageCount: Math.floor(Math.random() * 100),
            lastUsed: new Date(),
            fileSize: 1024,
            relatedIds: [],
            childIds: [],
          },
        }));

      const query: RetrievalQuery = {
        query: 'performance test batch features',
        context: mockContext,
        type: 'knowledge',
        limit: 50,
        offset: 0,
      };

      const startTime = Date.now();
      const features = await featureExtractor.extractBatchFeatures(query, entries);
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      expect(features.length).toBe(entries.length);
      expect(executionTime).toBeLessThan(200); // Performance target

      const avgTime = executionTime / entries.length;
      console.log(
        `Batch feature extraction: ${executionTime}ms total, ${avgTime.toFixed(2)}ms per item`,
      );
    });

    it('should complete reranking within performance limits', async () => {
      const mockResults = Array(50)
        .fill(null)
        .map((_, i) => ({
          entry: {
            id: `rerank-test-${i}`,
            title: `Rerank Test Document ${i}`,
            content: `Content ${i}`,
            path: `/rerank/${i}`,
            type: 'knowledge' as const,
            lastModified: new Date(),
            hash: `rerank-hash-${i}`,
            metadata: {
              category: 'test',
              tags: ['rerank', 'performance'],
              projectId: 'test-project',
              agentTypes: ['test-agent'],
              language: 'en',
              usageCount: Math.floor(Math.random() * 100),
              lastUsed: new Date(),
              fileSize: 1024,
              relatedIds: [],
              childIds: [],
            },
          },
          score: Math.random() * 10,
          rank: i + 1,
          matchedFields: ['title'],
          totalMatches: 50,
          titleSnippet: `Rerank Test Document ${i}`,
          contentSnippets: [],
          relevanceFactors: {
            titleMatch: Math.random() * 10,
            contentMatch: Math.random() * 5,
            tagMatch: Math.random() * 3,
            categoryMatch: Math.random() * 2,
            recencyBoost: 1.0,
            effectivenessBoost: 1.0,
            usageBoost: 1.0,
          },
        }));

      const query: RetrievalQuery = {
        query: 'reranking performance test',
        context: mockContext,
        type: 'knowledge',
      };

      const startTime = Date.now();
      const rerankedResults = await reranker.rerank(query, mockResults);
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      expect(rerankedResults.length).toBe(mockResults.length);
      expect(executionTime).toBeLessThan(100); // Reranking should be very fast

      console.log(`Reranking ${mockResults.length} results: ${executionTime}ms`);
    });

    it('should handle rank fusion efficiently', () => {
      const list1 = Array(50)
        .fill(null)
        .map((_, i) => ({
          entry: {
            id: `fusion1-${i}`,
            title: `Fusion Document 1-${i}`,
            content: 'Content',
            path: `/fusion1/${i}`,
            type: 'knowledge' as const,
            lastModified: new Date(),
            hash: `fusion1-hash-${i}`,
            metadata: {
              category: 'test',
              tags: [],
              projectId: 'test',
              agentTypes: [],
              language: 'en',
              usageCount: 1,
              lastUsed: new Date(),
              fileSize: 100,
              relatedIds: [],
              childIds: [],
            },
          },
          score: Math.random() * 10,
          rank: i + 1,
          matchedFields: ['title'],
          totalMatches: 1,
          titleSnippet: `Fusion Document 1-${i}`,
          contentSnippets: [],
          relevanceFactors: {
            titleMatch: 1.0,
            contentMatch: 0.5,
            tagMatch: 0.0,
            categoryMatch: 0.2,
            recencyBoost: 0.1,
            effectivenessBoost: 0.0,
            usageBoost: 0.0,
          },
        }));

      const list2 = Array(50)
        .fill(null)
        .map((_, i) => ({
          entry: {
            id: `fusion2-${i}`,
            title: `Fusion Document 2-${i}`,
            content: 'Content',
            path: `/fusion2/${i}`,
            type: 'knowledge' as const,
            lastModified: new Date(),
            hash: `fusion2-hash-${i}`,
            metadata: {
              category: 'test',
              tags: [],
              projectId: 'test',
              agentTypes: [],
              language: 'en',
              usageCount: 1,
              lastUsed: new Date(),
              fileSize: 100,
              relatedIds: [],
              childIds: [],
            },
          },
          score: Math.random() * 10,
          rank: i + 1,
          matchedFields: ['title'],
          totalMatches: 1,
          titleSnippet: `Fusion Document 2-${i}`,
          contentSnippets: [],
          relevanceFactors: {
            titleMatch: 1.0,
            contentMatch: 0.5,
            tagMatch: 0.0,
            categoryMatch: 0.2,
            recencyBoost: 0.1,
            effectivenessBoost: 0.0,
            usageBoost: 0.0,
          },
        }));

      const startTime = Date.now();
      const fusedResults = fusionEngine.reciprocalRankFusion([list1, list2]);
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      expect(fusedResults.length).toBeGreaterThan(0);
      expect(executionTime).toBeLessThan(50); // Fusion should be very fast

      console.log(`Rank fusion of ${list1.length + list2.length} results: ${executionTime}ms`);
    });
  });

  describe('Concurrency Performance', () => {
    it('should handle concurrent retrievals efficiently', async () => {
      const concurrentQueries = 10;
      const queries: RetrievalQuery[] = Array(concurrentQueries)
        .fill(null)
        .map((_, i) => ({
          query: `concurrent test query ${i}`,
          context: { ...mockContext, projectId: `project-${i}` },
          type: 'knowledge',
          limit: 10,
          offset: 0,
        }));

      const startTime = Date.now();
      const results = await Promise.all(queries.map((query) => retriever.retrieve(query)));
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      expect(results.length).toBe(concurrentQueries);
      expect(results.every((r) => r.results.length > 0)).toBe(true);

      // Concurrent execution should be faster than sequential
      expect(totalTime).toBeLessThan(concurrentQueries * 500); // Should be much less due to parallelism

      const avgTime = totalTime / concurrentQueries;
      console.log(
        `Concurrent retrieval (${concurrentQueries} queries): ${totalTime}ms total, ${avgTime.toFixed(1)}ms average`,
      );
    });

    it('should handle concurrent bandit updates without degradation', async () => {
      const concurrentUpdates = 100;
      const strategies = ['fts-heavy', 'vector-heavy', 'balanced', 'semantic-focused'];

      const startTime = Date.now();
      const updates = Array(concurrentUpdates)
        .fill(null)
        .map((_, i) =>
          bandit.updateReward(strategies[i % strategies.length] as any, mockContext, Math.random()),
        );

      await Promise.all(updates);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      expect(totalTime).toBeLessThan(1000); // Should complete quickly

      const avgTime = totalTime / concurrentUpdates;
      console.log(
        `Concurrent bandit updates (${concurrentUpdates}): ${totalTime}ms total, ${avgTime.toFixed(2)}ms average`,
      );
    });

    it('should maintain performance under concurrent analytics tracking', async () => {
      const concurrentTracks = 50;
      const mockResults = {
        results: [
          {
            entry: {
              id: 'analytics-test',
              title: 'Analytics Test Document',
              content: 'Content',
              path: '/analytics/test',
              type: 'knowledge' as const,
              lastModified: new Date(),
              hash: 'analytics-hash',
              metadata: {
                category: 'test',
                tags: ['analytics'],
                projectId: 'test-project',
                agentTypes: ['test-agent'],
                language: 'en',
                usageCount: 1,
                lastUsed: new Date(),
                fileSize: 500,
                relatedIds: [],
                childIds: [],
              },
            },
            score: 8.5,
            rank: 1,
            matchedFields: ['title'],
            totalMatches: 1,
            titleSnippet: 'Analytics Test Document',
            contentSnippets: [],
            relevanceFactors: {
              titleMatch: 1.0,
              contentMatch: 0.5,
              tagMatch: 0.8,
              categoryMatch: 0.2,
              recencyBoost: 0.1,
              effectivenessBoost: 0.0,
              usageBoost: 0.0,
            },
            features: {} as any,
            confidenceScore: 0.85,
            retrievalStrategy: 'fts-heavy' as const,
            rankerUsed: 'base' as const,
          },
        ],
        totalMatches: 1,
        totalPages: 1,
        currentPage: 1,
        executionTime: 150,
        facets: { types: [], categories: [], tags: [], projects: [], agents: [], languages: [] },
        suggestions: [],
        strategyUsed: 'fts-heavy' as const,
        explorationPerformed: false,
        adaptiveLearningActive: true,
        featureExtractionTime: 50,
        rankingTime: 25,
        totalMLTime: 75,
      };

      const startTime = Date.now();
      const trackingPromises = Array(concurrentTracks)
        .fill(null)
        .map((_, i) =>
          analytics.trackRetrieval(
            {
              query: `analytics test ${i}`,
              context: mockContext,
              type: 'knowledge',
            },
            mockResults,
          ),
        );

      await Promise.all(trackingPromises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      expect(totalTime).toBeLessThan(2000); // Should handle concurrent tracking efficiently

      console.log(`Concurrent analytics tracking (${concurrentTracks}): ${totalTime}ms`);
    });
  });

  describe('Memory Performance', () => {
    it('should maintain reasonable memory usage during processing', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Perform memory-intensive operations
      const largeQueries = Array(100)
        .fill(null)
        .map((_, i) => ({
          query: `memory test query ${i} with lots of additional text to test memory usage patterns and ensure efficient processing`,
          context: {
            ...mockContext,
            projectId: `memory-test-project-${i}`,
            recentQueries: Array(20).fill(`recent query ${i}`),
            recentResults: Array(20).fill(`recent result ${i}`),
            successfulPatterns: Array(20).fill(`pattern ${i}`),
          },
          type: 'knowledge' as const,
          limit: 50,
          offset: 0,
        }));

      // Process queries in batches to avoid overwhelming the system
      const batchSize = 10;
      for (let i = 0; i < largeQueries.length; i += batchSize) {
        const batch = largeQueries.slice(i, i + batchSize);
        await Promise.all(batch.map((query) => retriever.retrieve(query)));

        // Force garbage collection if available (for testing)
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const memoryIncreaseMB = memoryIncrease / (1024 * 1024);

      expect(memoryIncreaseMB).toBeLessThan(100); // Should not increase by more than 100MB

      console.log(
        `Memory increase after processing ${largeQueries.length} queries: ${memoryIncreaseMB.toFixed(2)}MB`,
      );
    });

    it('should clean up resources properly', async () => {
      const query: RetrievalQuery = {
        query: 'resource cleanup test',
        context: mockContext,
        type: 'knowledge',
        limit: 100,
        offset: 0,
      };

      // Process multiple queries and measure memory stability
      const memoryReadings = [];

      for (let i = 0; i < 20; i++) {
        await retriever.retrieve(query);
        memoryReadings.push(process.memoryUsage().heapUsed);

        // Small delay to allow cleanup
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Memory should not continuously increase (indicating proper cleanup)
      const firstHalf = memoryReadings.slice(0, 10).reduce((sum, val) => sum + val, 0) / 10;
      const secondHalf = memoryReadings.slice(10).reduce((sum, val) => sum + val, 0) / 10;
      const memoryGrowthMB = (secondHalf - firstHalf) / (1024 * 1024);

      expect(memoryGrowthMB).toBeLessThan(10); // Should not grow significantly

      console.log(`Memory growth over 20 iterations: ${memoryGrowthMB.toFixed(2)}MB`);
    });
  });

  describe('Scalability Performance', () => {
    it('should scale linearly with result set size', async () => {
      const sizes = [10, 25, 50, 100];
      const timings: Array<{ size: number; time: number }> = [];

      for (const size of sizes) {
        const query: RetrievalQuery = {
          query: `scalability test query for ${size} results`,
          context: mockContext,
          type: 'knowledge',
          limit: size,
          offset: 0,
        };

        const startTime = Date.now();
        const results = await retriever.retrieve(query);
        const endTime = Date.now();

        const executionTime = endTime - startTime;
        timings.push({ size, time: executionTime });

        expect(results.results.length).toBe(size);
        expect(executionTime).toBeLessThan(500); // All should be under 500ms

        console.log(`Size ${size}: ${executionTime}ms`);
      }

      // Check for reasonable scaling (should not be exponential)
      const smallTime = timings[0].time;
      const largeTime = timings[timings.length - 1].time;
      const scalingFactor = largeTime / smallTime;

      expect(scalingFactor).toBeLessThan(5); // Should not be more than 5x slower for 10x data
    });

    it('should handle burst traffic efficiently', async () => {
      // Simulate burst of queries
      const burstSize = 50;
      const queries = Array(burstSize)
        .fill(null)
        .map((_, i) => ({
          query: `burst test query ${i}`,
          context: mockContext,
          type: 'knowledge' as const,
          limit: 20,
          offset: 0,
        }));

      const startTime = Date.now();

      // Send all queries simultaneously (burst)
      const results = await Promise.all(queries.map((query) => retriever.retrieve(query)));

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      expect(results.length).toBe(burstSize);
      expect(results.every((r) => r.results.length > 0)).toBe(true);

      const avgTime = totalTime / burstSize;
      console.log(
        `Burst traffic (${burstSize} simultaneous): ${totalTime}ms total, ${avgTime.toFixed(1)}ms average`,
      );

      // Average time should still be reasonable due to concurrency
      expect(avgTime).toBeLessThan(200);
    });
  });

  describe('Real-World Scenario Performance', () => {
    it('should handle realistic user session efficiently', async () => {
      // Simulate a realistic user session with multiple queries
      const sessionQueries = [
        'how to implement authentication',
        'user authentication best practices',
        'jwt token security',
        'password hashing algorithms',
        'authentication middleware setup',
      ];

      const sessionStart = Date.now();
      let totalMLTime = 0;

      for (const queryText of sessionQueries) {
        const query: RetrievalQuery = {
          query: queryText,
          context: {
            ...mockContext,
            recentQueries: sessionQueries.slice(0, sessionQueries.indexOf(queryText)),
          },
          type: 'knowledge',
          limit: 15,
          offset: 0,
          enableReranker: true,
          adaptiveWeights: true,
        };

        const result = await retriever.retrieve(query);
        totalMLTime += result.totalMLTime;

        // Simulate user feedback
        const feedback: UserFeedback = {
          clicked: Math.random() > 0.3,
          dwellTime: Math.random() * 20000 + 5000,
          usedInSolution: Math.random() > 0.7,
          relevanceRating: Math.ceil(Math.random() * 5),
          copiedContent: Math.random() > 0.6,
          bookmarked: Math.random() > 0.8,
          timestamp: new Date(),
          sessionId: 'realistic-session',
          queryId: `query-${sessionQueries.indexOf(queryText)}`,
          resultRank: Math.ceil(Math.random() * 10),
        };

        await analytics.trackRetrieval(query, result, feedback);
      }

      const sessionEnd = Date.now();
      const totalSessionTime = sessionEnd - sessionStart;
      const avgQueryTime = totalSessionTime / sessionQueries.length;

      expect(avgQueryTime).toBeLessThan(500);

      console.log(`Realistic session (${sessionQueries.length} queries):`);
      console.log(`  Total time: ${totalSessionTime}ms`);
      console.log(`  Average per query: ${avgQueryTime.toFixed(1)}ms`);
      console.log(`  Total ML processing: ${totalMLTime}ms`);
    });

    it('should maintain performance with continuous learning', async () => {
      // Simulate continuous learning scenario
      const learningQueries = 100;
      const strategies = ['fts-heavy', 'vector-heavy', 'balanced', 'semantic-focused'];

      const timings: number[] = [];

      for (let i = 0; i < learningQueries; i++) {
        const strategy = strategies[i % strategies.length];
        const query: RetrievalQuery = {
          query: `continuous learning query ${i}`,
          context: mockContext,
          type: 'knowledge',
          limit: 20,
          offset: 0,
        };

        const startTime = Date.now();
        const result = await retriever.retrieve(query);
        const endTime = Date.now();

        timings.push(endTime - startTime);

        // Update bandit with feedback
        const reward = Math.random() * (strategy === 'fts-heavy' ? 0.8 : 0.4) + 0.2;
        await bandit.updateReward(strategy as any, mockContext, reward);

        // Track for analytics
        await analytics.trackRetrieval(query, result);

        expect(endTime - startTime).toBeLessThan(500);
      }

      // Performance should remain stable over time
      const firstQuarter = timings.slice(0, 25).reduce((sum, t) => sum + t, 0) / 25;
      const lastQuarter = timings.slice(-25).reduce((sum, t) => sum + t, 0) / 25;
      const performanceDegradation = (lastQuarter - firstQuarter) / firstQuarter;

      expect(performanceDegradation).toBeLessThan(0.2); // Less than 20% degradation

      console.log(`Continuous learning (${learningQueries} queries):`);
      console.log(`  Initial avg: ${firstQuarter.toFixed(1)}ms`);
      console.log(`  Final avg: ${lastQuarter.toFixed(1)}ms`);
      console.log(`  Degradation: ${(performanceDegradation * 100).toFixed(1)}%`);
    });
  });

  describe('Error Recovery Performance', () => {
    it('should recover quickly from search engine errors', async () => {
      // Mock search engine that fails occasionally
      const unreliableSearchEngine: ISearchEngine = {
        async search(query: any) {
          if (Math.random() < 0.3) {
            // 30% failure rate
            throw new Error('Simulated search engine failure');
          }
          return await fastMockSearchEngine.search(query);
        },
        async searchSimilar(entryId: string, limit?: number) {
          return await fastMockSearchEngine.searchSimilar(entryId, limit);
        },
        async getSuggestions(partial: string, limit?: number) {
          return await fastMockSearchEngine.getSuggestions(partial, limit);
        },
        async getPopularQueries(limit?: number) {
          return await fastMockSearchEngine.getPopularQueries(limit);
        },
        async recordQuery(query: string, resultCount: number, responseTime: number) {
          return await fastMockSearchEngine.recordQuery(query, resultCount, responseTime);
        },
        async getAnalytics(startDate: Date, endDate: Date) {
          return await fastMockSearchEngine.getAnalytics(startDate, endDate);
        },
      };

      const unreliableRetriever = new IntelligentHybridRetriever(
        unreliableSearchEngine,
        bandit,
        mockConfig,
      );

      const query: RetrievalQuery = {
        query: 'error recovery test',
        context: mockContext,
        type: 'knowledge',
        limit: 10,
        offset: 0,
      };

      const attempts = 20;
      const timings: number[] = [];
      let failures = 0;

      for (let i = 0; i < attempts; i++) {
        const startTime = Date.now();
        try {
          await unreliableRetriever.retrieve(query);
          const endTime = Date.now();
          timings.push(endTime - startTime);
        } catch (error) {
          failures++;
          const endTime = Date.now();
          timings.push(endTime - startTime); // Include failure time
        }
      }

      const avgTime = timings.reduce((sum, t) => sum + t, 0) / timings.length;

      console.log(
        `Error recovery test: ${failures}/${attempts} failures, ${avgTime.toFixed(1)}ms average`,
      );

      // Even with errors, average time should be reasonable
      expect(avgTime).toBeLessThan(600); // Slightly higher due to error handling
    });
  });

  describe('Performance Summary', () => {
    it('should provide comprehensive performance report', async () => {
      // Run a comprehensive performance test
      const testScenarios = [
        { name: 'Basic Retrieval', limit: 10 },
        { name: 'Large Result Set', limit: 50 },
        { name: 'With Reranking', limit: 20, enableReranker: true },
        { name: 'Adaptive Mode', limit: 15, hybridMode: 'adaptive' as const },
        { name: 'Full ML Pipeline', limit: 25, enableReranker: true, adaptiveWeights: true },
      ];

      const performanceResults = [];

      for (const scenario of testScenarios) {
        const query: RetrievalQuery = {
          query: `performance test for ${scenario.name}`,
          context: mockContext,
          type: 'knowledge',
          limit: scenario.limit,
          offset: 0,
          enableReranker: scenario.enableReranker,
          hybridMode: scenario.hybridMode,
          adaptiveWeights: scenario.adaptiveWeights,
        };

        const startTime = Date.now();
        const result = await retriever.retrieve(query);
        const endTime = Date.now();

        const executionTime = endTime - startTime;

        performanceResults.push({
          scenario: scenario.name,
          executionTime,
          featureTime: result.featureExtractionTime,
          rankingTime: result.rankingTime,
          mlTime: result.totalMLTime,
          resultCount: result.results.length,
        });

        expect(executionTime).toBeLessThan(500);
      }

      console.log('\n=== PERFORMANCE SUMMARY ===');
      performanceResults.forEach((result) => {
        console.log(`${result.scenario}:`);
        console.log(`  Total: ${result.executionTime}ms`);
        console.log(`  Features: ${result.featureTime}ms`);
        console.log(`  Ranking: ${result.rankingTime}ms`);
        console.log(`  ML Total: ${result.mlTime}ms`);
        console.log(`  Results: ${result.resultCount}`);
        console.log('');
      });

      // All scenarios should meet performance requirements
      expect(performanceResults.every((r) => r.executionTime < 500)).toBe(true);

      const avgPerformance =
        performanceResults.reduce((sum, r) => sum + r.executionTime, 0) / performanceResults.length;
      console.log(`Overall average performance: ${avgPerformance.toFixed(1)}ms (target: <500ms)`);

      expect(avgPerformance).toBeLessThan(300); // Should be well under the limit
    });
  });
});
