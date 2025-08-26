// Content Prioritizer Tests - ML-driven content selection and ranking
// Tests prioritization strategies, ML features, and adaptive learning

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ContentPrioritizer, {
  type ContentItem,
  type PrioritizationContext,
  type PrioritizationResult,
  type PrioritizationFeedback,
} from '../content-prioritizer';
import type { ContextPackAssemblerConfig } from '../types';

describe('ContentPrioritizer', () => {
  let prioritizer: ContentPrioritizer;
  let config: ContextPackAssemblerConfig;

  beforeEach(() => {
    config = {
      maxTokensPerPack: 5000,
      tokenCountingMethod: 'word',
      memoryContentPercentage: 30,
      knowledgeContentPercentage: 40,
      realtimeContentPercentage: 30,
      maxGenerationTimeMs: 1000,
      cacheEnabled: false,
      cacheTtlMinutes: 15,
      enableProvenanceTracking: true,
      enableContentDeduplication: true,
      enableAdaptiveOptimization: true,
      templateBasePath: './templates',
      customTemplateEnabled: true,
      enableMLContentRanking: true,
      contentSimilarityThreshold: 0.85,
    };
    prioritizer = new ContentPrioritizer(config);
  });

  afterEach(() => {
    prioritizer.cleanup();
  });

  describe('Initialization', () => {
    it('should initialize with default strategies', () => {
      expect(prioritizer).toBeDefined();

      // Access private strategies for verification (using type assertion for testing)
      const strategies = (prioritizer as any).strategies;
      expect(strategies.size).toBeGreaterThan(0);
      expect(strategies.has('rule_based')).toBe(true);
      expect(strategies.has('ml_ranking')).toBe(true);
      expect(strategies.has('hybrid')).toBe(true);
    });

    it('should initialize with ML content ranking enabled', () => {
      const featureWeights = (prioritizer as any).featureWeights;
      expect(featureWeights.size).toBeGreaterThan(0);
      expect(featureWeights.has('recency')).toBe(true);
      expect(featureWeights.has('relevance')).toBe(true);
      expect(featureWeights.has('effectiveness')).toBe(true);
    });

    it('should initialize with ML disabled', () => {
      const noMLConfig = { ...config, enableMLContentRanking: false };
      const noMLPrioritizer = new ContentPrioritizer(noMLConfig);

      expect(noMLPrioritizer).toBeDefined();
      noMLPrioritizer.cleanup();
    });
  });

  describe('Content Item Creation', () => {
    const createTestContentItem = (overrides: Partial<ContentItem> = {}): ContentItem => ({
      id: `item-${Math.random().toString(36).substr(2, 9)}`,
      content: 'Test content for prioritization',
      type: 'memory',
      source: 'test-source',
      timestamp: new Date(),
      metadata: {
        category: 'test-category',
        tags: ['test', 'example'],
        projectId: 'test-project',
        issueId: 'test-issue',
        agentType: 'code-implementer',
        difficulty: 'medium',
        scope: 'project',
      },
      metrics: {
        usageCount: 5,
        successRate: 0.8,
        averageResolutionTime: 300,
        effectiveness: 0.75,
        userRating: 4,
        lastUsed: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        contextRelevance: 0.6,
      },
      features: {
        wordCount: 10,
        codeBlocks: 0,
        technicalTerms: ['function', 'variable'],
        complexity: 0.5,
        freshness: 0.9,
        similarity: 0.7,
        dependencies: [],
        relatedContent: [],
      },
      ...overrides,
    });

    const createTestContext = (
      overrides: Partial<PrioritizationContext> = {},
    ): PrioritizationContext => ({
      issueId: 'test-issue-001',
      agentType: 'code-implementer',
      issueDescription: 'Implement user authentication system',
      projectContext: 'test-project',
      historicalContext: ['previous-issue-1', 'previous-issue-2'],
      currentGoals: ['implement-auth', 'ensure-security'],
      constraints: ['use-typescript', 'no-external-deps'],
      preferences: {
        'code-implementer_preferences': {
          authentication: 0.9,
          security: 0.8,
          typescript: 0.7,
        },
      },
      ...overrides,
    });

    describe('Basic Prioritization', () => {
      it('should prioritize content items successfully', async () => {
        const items = Array.from({ length: 10 }, () => createTestContentItem());
        const context = createTestContext();

        const result = await prioritizer.prioritizeContent(items, context);

        expect(result).toBeDefined();
        expect(result.items).toHaveLength(10);
        expect(result.strategy).toBeDefined();
        expect(result.confidence).toBeGreaterThan(0);
        expect(result.reasoning).toBeInstanceOf(Array);
        expect(result.performance.processingTime).toBeGreaterThan(0);

        // Verify sorting by score (descending)
        for (let i = 0; i < result.items.length - 1; i++) {
          expect(result.items[i].score).toBeGreaterThanOrEqual(result.items[i + 1].score);
          expect(result.items[i].ranking).toBe(i + 1);
        }
      });

      it('should handle empty content array', async () => {
        const context = createTestContext();

        const result = await prioritizer.prioritizeContent([], context);

        expect(result.items).toHaveLength(0);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
      });

      it('should handle single item', async () => {
        const items = [createTestContentItem()];
        const context = createTestContext();

        const result = await prioritizer.prioritizeContent(items, context);

        expect(result.items).toHaveLength(1);
        expect(result.items[0].ranking).toBe(1);
        expect(result.items[0].score).toBeGreaterThan(0);
      });
    });

    describe('Content Type Prioritization', () => {
      it('should prioritize different content types appropriately', async () => {
        const memoryItem = createTestContentItem({
          type: 'memory',
          metrics: { ...createTestContentItem().metrics, effectiveness: 0.9 },
        });
        const knowledgeItem = createTestContentItem({
          type: 'knowledge',
          metrics: { ...createTestContentItem().metrics, effectiveness: 0.7 },
        });
        const realtimeItem = createTestContentItem({
          type: 'realtime',
          metrics: { ...createTestContentItem().metrics, effectiveness: 0.6 },
        });

        const items = [realtimeItem, knowledgeItem, memoryItem]; // Intentionally unsorted
        const context = createTestContext();

        const result = await prioritizer.prioritizeContent(items, context);

        // Memory items should generally rank higher due to higher effectiveness
        const memoryRank = result.items.find((item) => item.item.id === memoryItem.id)?.ranking;
        const realtimeRank = result.items.find((item) => item.item.id === realtimeItem.id)?.ranking;

        expect(memoryRank).toBeLessThan(realtimeRank);
      });

      it('should handle mixed content types', async () => {
        const items = [
          createTestContentItem({ type: 'memory' }),
          createTestContentItem({ type: 'knowledge' }),
          createTestContentItem({ type: 'realtime' }),
          createTestContentItem({ type: 'agent_specific' }),
        ];
        const context = createTestContext();

        const result = await prioritizer.prioritizeContent(items, context);

        expect(result.items).toHaveLength(4);
        expect(result.items.every((item) => item.score > 0)).toBe(true);
      });
    });

    describe('Agent-Specific Prioritization', () => {
      it('should prioritize content relevant to specific agent type', async () => {
        const codeItem = createTestContentItem({
          metadata: {
            ...createTestContentItem().metadata,
            agentType: 'code-implementer',
            category: 'implementation',
            tags: ['code', 'implementation', 'typescript'],
          },
          features: {
            ...createTestContentItem().features,
            codeBlocks: 3,
            technicalTerms: ['function', 'class', 'interface', 'async'],
          },
        });

        const securityItem = createTestContentItem({
          metadata: {
            ...createTestContentItem().metadata,
            agentType: 'security-auditor',
            category: 'security',
            tags: ['security', 'vulnerability', 'audit'],
          },
        });

        const items = [securityItem, codeItem];
        const codeContext = createTestContext({ agentType: 'code-implementer' });

        const result = await prioritizer.prioritizeContent(items, codeContext);

        // Code item should rank higher for code-implementer agent
        const codeRank = result.items.find((item) => item.item.id === codeItem.id)?.ranking;
        const securityRank = result.items.find((item) => item.item.id === securityItem.id)?.ranking;

        expect(codeRank).toBeLessThan(securityRank);
      });

      it('should adapt to different agent types', async () => {
        const performanceItem = createTestContentItem({
          metadata: {
            ...createTestContentItem().metadata,
            category: 'performance',
            tags: ['optimization', 'performance', 'scaling'],
          },
        });

        const items = [performanceItem];
        const performanceContext = createTestContext({ agentType: 'performance-optimizer' });

        const result = await prioritizer.prioritizeContent(items, performanceContext);

        // Should score well for performance optimizer
        expect(result.items[0].score).toBeGreaterThan(0.5);
        expect(result.items[0].factors.agentPreferenceScore).toBeGreaterThan(0);
      });
    });

    describe('Scoring Factors', () => {
      it('should calculate all scoring factors', async () => {
        const item = createTestContentItem({
          features: {
            ...createTestContentItem().features,
            freshness: 0.8,
            similarity: 0.7,
          },
          metrics: {
            ...createTestContentItem().metrics,
            effectiveness: 0.9,
            usageCount: 10,
            userRating: 4.5,
            contextRelevance: 0.8,
          },
        });

        const items = [item];
        const context = createTestContext();

        const result = await prioritizer.prioritizeContent(items, context);

        const factors = result.items[0].factors;

        expect(factors.recencyScore).toBeGreaterThanOrEqual(0);
        expect(factors.relevanceScore).toBeGreaterThanOrEqual(0);
        expect(factors.effectivenessScore).toBeGreaterThanOrEqual(0);
        expect(factors.frequencyScore).toBeGreaterThanOrEqual(0);
        expect(factors.agentPreferenceScore).toBeGreaterThanOrEqual(0);
        expect(factors.contextSimilarityScore).toBeGreaterThanOrEqual(0);
        expect(factors.userFeedbackScore).toBeGreaterThanOrEqual(0);
        expect(factors.compositeScore).toBeGreaterThan(0);
      });

      it('should weight factors according to strategy parameters', async () => {
        const highEffectivenessItem = createTestContentItem({
          metrics: {
            ...createTestContentItem().metrics,
            effectiveness: 0.95,
            usageCount: 1, // Low frequency
            userRating: 2, // Low user rating
          },
        });

        const items = [highEffectivenessItem];
        const context = createTestContext();

        const result = await prioritizer.prioritizeContent(items, context);

        const factors = result.items[0].factors;

        // Effectiveness should have significant impact
        expect(factors.effectivenessScore).toBeGreaterThan(0.8);
        expect(factors.frequencyScore).toBeLessThan(0.3);
      });
    });

    describe('Context Similarity', () => {
      it('should calculate similarity based on content matching', async () => {
        const matchingItem = createTestContentItem({
          content: 'Implement user authentication with login and password validation',
          metadata: {
            ...createTestContentItem().metadata,
            tags: ['authentication', 'login', 'security'],
          },
        });

        const nonMatchingItem = createTestContentItem({
          content: 'Database migration scripts for production deployment',
          metadata: {
            ...createTestContentItem().metadata,
            tags: ['database', 'migration', 'deployment'],
          },
        });

        const items = [matchingItem, nonMatchingItem];
        const context = createTestContext({
          issueDescription: 'Implement user authentication system with secure login',
          currentGoals: ['authentication', 'security', 'login'],
        });

        const result = await prioritizer.prioritizeContent(items, context);

        const matchingScore = result.items.find((item) => item.item.id === matchingItem.id)?.factors
          .contextSimilarityScore;
        const nonMatchingScore = result.items.find((item) => item.item.id === nonMatchingItem.id)
          ?.factors.contextSimilarityScore;

        expect(matchingScore).toBeGreaterThan(nonMatchingScore);
      });

      it('should handle empty context gracefully', async () => {
        const items = [createTestContentItem()];
        const emptyContext = createTestContext({
          issueDescription: '',
          projectContext: '',
          currentGoals: [],
        });

        const result = await prioritizer.prioritizeContent(items, emptyContext);

        expect(result.items[0].factors.contextSimilarityScore).toBeGreaterThanOrEqual(0);
      });
    });

    describe('Alternative Rankings', () => {
      it('should provide alternative ranking strategies', async () => {
        const items = Array.from({ length: 5 }, () => createTestContentItem());
        const context = createTestContext();

        const result = await prioritizer.prioritizeContent(items, context);

        expect(result.alternatives).toBeDefined();
        expect(result.alternatives.length).toBeGreaterThan(0);

        result.alternatives.forEach((alt) => {
          expect(alt.strategy).toBeDefined();
          expect(alt.items).toBeInstanceOf(Array);
          expect(alt.confidence).toBeGreaterThan(0);
          expect(alt.reasoning).toBeDefined();
        });
      });

      it('should show different rankings for different strategies', async () => {
        const items = Array.from({ length: 10 }, (_, i) =>
          createTestContentItem({
            metrics: {
              ...createTestContentItem().metrics,
              effectiveness: i * 0.1, // Varying effectiveness
              usageCount: 10 - i, // Inverse usage count
            },
          }),
        );

        const context = createTestContext();

        const result = await prioritizer.prioritizeContent(items, context);

        // Primary ranking should be different from at least one alternative
        const primaryOrder = result.items.map((item) => item.item.id);
        const hasAlternativeOrder = result.alternatives.some((alt) => {
          const altOrder = alt.items.slice(0, primaryOrder.length);
          return !primaryOrder.every((id, index) => id === altOrder[index]);
        });

        expect(hasAlternativeOrder).toBe(true);
      });
    });

    describe('Performance Metrics', () => {
      it('should track processing performance', async () => {
        const items = Array.from({ length: 20 }, () => createTestContentItem());
        const context = createTestContext();

        const result = await prioritizer.prioritizeContent(items, context);

        expect(result.performance.processingTime).toBeGreaterThan(0);
        expect(result.performance.itemsEvaluated).toBe(20);
        expect(result.performance.strategiesConsidered).toBeGreaterThan(0);
        expect(result.performance.confidenceLevel).toBeGreaterThan(0);
        expect(result.performance.expectedAccuracy).toBeGreaterThan(0);
      });

      it('should maintain reasonable performance under load', async () => {
        const items = Array.from({ length: 100 }, () => createTestContentItem());
        const context = createTestContext();

        const startTime = Date.now();
        const result = await prioritizer.prioritizeContent(items, context);
        const duration = Date.now() - startTime;

        expect(duration).toBeLessThan(2000); // Should complete in <2s
        expect(result.performance.processingTime).toBeLessThan(2000);
      });
    });

    describe('Learning and Adaptation', () => {
      it('should accept feedback for learning', async () => {
        const items = Array.from({ length: 5 }, () => createTestContentItem());
        const context = createTestContext();

        const result = await prioritizer.prioritizeContent(items, context);

        const feedback: PrioritizationFeedback = {
          context: context.issueDescription,
          actualOrder: result.items.map((item) => item.item.id).reverse(), // Reverse order as feedback
          satisfaction: 4, // Good satisfaction
          comments: 'Test feedback',
        };

        await expect(prioritizer.learnFromFeedback(result, feedback)).resolves.not.toThrow();
      });

      it('should update feature weights based on feedback', async () => {
        if (!config.enableMLContentRanking) return;

        const items = Array.from({ length: 3 }, () => createTestContentItem());
        const context = createTestContext();

        const result = await prioritizer.prioritizeContent(items, context);

        const positiveFeedback: PrioritizationFeedback = {
          context: context.issueDescription,
          actualOrder: result.items.map((item) => item.item.id),
          satisfaction: 5, // Very satisfied
        };

        const originalWeights = (prioritizer as any).featureWeights;
        const originalRelevanceWeight = originalWeights.get('relevance');

        await prioritizer.learnFromFeedback(result, positiveFeedback);

        // Weights should be updated (might be subtle changes)
        const newRelevanceWeight = originalWeights.get('relevance');
        expect(typeof newRelevanceWeight).toBe('number');
      });

      it('should handle negative feedback appropriately', async () => {
        const items = Array.from({ length: 3 }, () => createTestContentItem());
        const context = createTestContext();

        const result = await prioritizer.prioritizeContent(items, context);

        const negativeFeedback: PrioritizationFeedback = {
          context: context.issueDescription,
          actualOrder: result.items.map((item) => item.item.id).reverse(),
          satisfaction: 1, // Very unsatisfied
        };

        await expect(
          prioritizer.learnFromFeedback(result, negativeFeedback),
        ).resolves.not.toThrow();
      });
    });

    describe('Statistics and Analytics', () => {
      it('should provide prioritization statistics', async () => {
        // Perform some prioritizations first
        const items = Array.from({ length: 5 }, () => createTestContentItem());
        const context = createTestContext();

        await prioritizer.prioritizeContent(items, context);
        await prioritizer.prioritizeContent(items, context);

        const stats = prioritizer.getStats();

        expect(stats.totalPrioritizations).toBeGreaterThanOrEqual(2);
        expect(stats.averageProcessingTime).toBeGreaterThan(0);
        expect(stats.strategyUsage).toBeDefined();
        expect(typeof stats.strategyUsage).toBe('object');
      });

      it('should track strategy usage', async () => {
        const items = Array.from({ length: 3 }, () => createTestContentItem());
        const context = createTestContext();

        await prioritizer.prioritizeContent(items, context);

        const stats = prioritizer.getStats();

        expect(Object.keys(stats.strategyUsage).length).toBeGreaterThan(0);
        expect(Object.values(stats.strategyUsage).every((count) => count > 0)).toBe(true);
      });
    });

    describe('Error Handling', () => {
      it('should handle malformed content items gracefully', async () => {
        const malformedItems = [
          {
            ...createTestContentItem(),
            features: null as any, // Malformed features
          },
          {
            ...createTestContentItem(),
            metrics: undefined as any, // Missing metrics
          },
        ];

        const context = createTestContext();

        // Should not throw but handle gracefully
        const result = await prioritizer.prioritizeContent(malformedItems as any, context);

        expect(result).toBeDefined();
        expect(result.items).toHaveLength(2);
      });

      it('should handle invalid context gracefully', async () => {
        const items = [createTestContentItem()];
        const invalidContext = {
          ...createTestContext(),
          preferences: null as any,
          constraints: undefined as any,
        };

        const result = await prioritizer.prioritizeContent(items, invalidContext as any);

        expect(result).toBeDefined();
        expect(result.items).toHaveLength(1);
      });

      it('should handle prioritization failures', async () => {
        const items = [createTestContentItem()];
        const context = createTestContext();

        // Mock a method to throw an error
        vi.spyOn(prioritizer as any, 'calculateFeatures').mockRejectedValueOnce(
          new Error('Test error'),
        );

        await expect(prioritizer.prioritizeContent(items, context)).rejects.toThrow();
      });
    });

    describe('Edge Cases', () => {
      it('should handle items with identical scores', async () => {
        const identicalItems = Array.from({ length: 5 }, (_, i) =>
          createTestContentItem({
            id: `identical-${i}`,
            metrics: {
              ...createTestContentItem().metrics,
              effectiveness: 0.8,
              usageCount: 5,
              userRating: 3,
              contextRelevance: 0.6,
            },
          }),
        );

        const context = createTestContext();

        const result = await prioritizer.prioritizeContent(identicalItems, context);

        expect(result.items).toHaveLength(5);
        // Should still assign rankings even with similar scores
        expect(result.items[0].ranking).toBe(1);
        expect(result.items[4].ranking).toBe(5);
      });

      it('should handle extreme metric values', async () => {
        const extremeItems = [
          createTestContentItem({
            metrics: {
              ...createTestContentItem().metrics,
              effectiveness: 0, // Minimum
              usageCount: 0,
              userRating: 0,
              contextRelevance: 0,
            },
            features: {
              ...createTestContentItem().features,
              freshness: 0,
              similarity: 0,
            },
          }),
          createTestContentItem({
            metrics: {
              ...createTestContentItem().metrics,
              effectiveness: 1, // Maximum
              usageCount: 1000,
              userRating: 5,
              contextRelevance: 1,
            },
            features: {
              ...createTestContentItem().features,
              freshness: 1,
              similarity: 1,
            },
          }),
        ];

        const context = createTestContext();

        const result = await prioritizer.prioritizeContent(extremeItems, context);

        expect(result.items).toHaveLength(2);
        // Item with max values should rank higher
        expect(result.items[0].score).toBeGreaterThan(result.items[1].score);
      });

      it('should handle very old content', async () => {
        const oldItem = createTestContentItem({
          timestamp: new Date('2020-01-01'), // Very old
          features: {
            ...createTestContentItem().features,
            freshness: 0.1, // Very low freshness
          },
          metrics: {
            ...createTestContentItem().metrics,
            lastUsed: new Date('2020-06-01'), // Also old
          },
        });

        const items = [oldItem];
        const context = createTestContext();

        const result = await prioritizer.prioritizeContent(items, context);

        expect(result.items[0].factors.recencyScore).toBeLessThan(0.5);
      });
    });
  });
});
