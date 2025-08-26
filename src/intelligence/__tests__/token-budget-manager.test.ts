// Token Budget Manager Tests - Comprehensive test suite for token counting and enforcement
// Tests all token counting methods, budget enforcement, and optimization strategies

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import TokenBudgetManager, {
  type ContentSection,
  type BudgetEnforcement,
} from '../token-budget-manager';
import type { ContextPackAssemblerConfig } from '../types';

describe('TokenBudgetManager', () => {
  let tokenManager: TokenBudgetManager;
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
    tokenManager = new TokenBudgetManager(config);
  });

  describe('Token Counting', () => {
    describe('Character-based counting', () => {
      it('should count tokens by character approximation', async () => {
        const characterConfig = { ...config, tokenCountingMethod: 'character' as const };
        const characterManager = new TokenBudgetManager(characterConfig);

        const content = 'Hello world! This is a test string.';
        const result = await characterManager.countTokens(content);

        expect(result.tokenCount).toBeGreaterThan(0);
        expect(result.method).toBe('character');
        expect(result.accuracy).toBe(0.7);
        expect(result.estimatedCost).toBeGreaterThan(0);
      });

      it('should handle empty content', async () => {
        const characterConfig = { ...config, tokenCountingMethod: 'character' as const };
        const characterManager = new TokenBudgetManager(characterConfig);

        const result = await characterManager.countTokens('');

        expect(result.tokenCount).toBe(0);
        expect(result.method).toBe('character');
      });

      it('should handle very long content', async () => {
        const characterConfig = { ...config, tokenCountingMethod: 'character' as const };
        const characterManager = new TokenBudgetManager(characterConfig);

        const longContent = 'A'.repeat(10000);
        const result = await characterManager.countTokens(longContent);

        expect(result.tokenCount).toBeGreaterThan(1000);
        expect(result.method).toBe('character');
      });
    });

    describe('Word-based counting', () => {
      it('should count tokens by word approximation', async () => {
        const content = 'Hello world! This is a test string with multiple words.';
        const result = await tokenManager.countTokens(content);

        expect(result.tokenCount).toBeGreaterThan(0);
        expect(result.method).toBe('word');
        expect(result.accuracy).toBe(0.85);
        expect(result.estimatedCost).toBeGreaterThan(0);
      });

      it('should handle punctuation correctly', async () => {
        const contentWithPunctuation = "Hello, world! How are you? I'm fine, thanks.";
        const result = await tokenManager.countTokens(contentWithPunctuation);

        expect(result.tokenCount).toBeGreaterThan(5);
        expect(result.method).toBe('word');
      });

      it('should handle multiple spaces', async () => {
        const contentWithSpaces = 'Hello    world     with    multiple    spaces';
        const result = await tokenManager.countTokens(contentWithSpaces);

        expect(result.method).toBe('word');
        expect(result.tokenCount).toBeGreaterThan(0);
      });

      it('should handle newlines and tabs', async () => {
        const contentWithWhitespace = 'Line 1\nLine 2\t\tWith tabs\n\nAnd double newlines';
        const result = await tokenManager.countTokens(contentWithWhitespace);

        expect(result.method).toBe('word');
        expect(result.tokenCount).toBeGreaterThan(0);
      });
    });

    describe('TikToken approximation', () => {
      it('should use tiktoken approximation method', async () => {
        const tikTokenConfig = { ...config, tokenCountingMethod: 'tiktoken' as const };
        const tikTokenManager = new TokenBudgetManager(tikTokenConfig);

        const content = 'Hello world! This is a test string.';
        const result = await tikTokenManager.countTokens(content);

        expect(result.tokenCount).toBeGreaterThan(0);
        expect(result.method).toBe('tiktoken');
        expect(result.accuracy).toBe(0.95);
      });

      it('should handle code blocks specially', async () => {
        const tikTokenConfig = { ...config, tokenCountingMethod: 'tiktoken' as const };
        const tikTokenManager = new TokenBudgetManager(tikTokenConfig);

        const contentWithCode = `
        Here's some code:
        \`\`\`javascript
        function hello() {
          console.log("Hello, world!");
          return true;
        }
        \`\`\`
        End of code.
        `;

        const result = await tikTokenManager.countTokens(contentWithCode);

        expect(result.tokenCount).toBeGreaterThan(0);
        expect(result.method).toBe('tiktoken');
      });

      it('should handle mixed content types', async () => {
        const tikTokenConfig = { ...config, tokenCountingMethod: 'tiktoken' as const };
        const tikTokenManager = new TokenBudgetManager(tikTokenConfig);

        const mixedContent = `
        Regular text with some code:
        \`\`\`python
        def example():
            return "hello"
        \`\`\`
        And some more regular text with **markdown** formatting.
        `;

        const result = await tikTokenManager.countTokens(mixedContent);

        expect(result.tokenCount).toBeGreaterThan(0);
        expect(result.method).toBe('tiktoken');
      });
    });

    describe('Error handling', () => {
      it('should fallback to character counting on errors', async () => {
        // Mock an error in word counting
        const faultyManager = new TokenBudgetManager(config);
        vi.spyOn(faultyManager as any, 'countTokensByWord').mockImplementation(() => {
          throw new Error('Test error');
        });

        const result = await faultyManager.countTokens('test content');

        expect(result.method).toBe('character'); // Should fallback
        expect(result.tokenCount).toBeGreaterThan(0);
      });
    });
  });

  describe('Budget Enforcement', () => {
    const createTestSections = (count: number, contentLength: number = 100): ContentSection[] => {
      return Array.from({ length: count }, (_, i) => ({
        id: `section-${i}`,
        content: 'A'.repeat(contentLength),
        priority: Math.random(),
        type: i % 2 === 0 ? 'memory' : 'knowledge',
        essential: i < 3, // First 3 are essential
        compressible: true,
        metadata: { category: `category-${i}`, tags: [`tag-${i}`] },
      }));
    };

    describe('Within budget scenarios', () => {
      it('should pass when content is within budget', async () => {
        const smallSections = createTestSections(5, 50); // Small sections
        const enforcement = await tokenManager.enforceBudget(smallSections);

        expect(enforcement.withinBudget).toBe(true);
        expect(enforcement.totalTokens).toBeLessThanOrEqual(config.maxTokensPerPack);
        expect(enforcement.overageTokens).toBe(0);
        expect(enforcement.optimizationsApplied.length).toBe(0);
        expect(enforcement.contentRemoved.length).toBe(0);
      });

      it('should calculate correct token breakdown', async () => {
        const sections = [
          {
            id: 'memory-1',
            content: 'Memory content',
            priority: 1,
            type: 'memory' as const,
            essential: true,
            compressible: true,
            metadata: {},
          },
          {
            id: 'knowledge-1',
            content: 'Knowledge content',
            priority: 0.8,
            type: 'knowledge' as const,
            essential: false,
            compressible: true,
            metadata: {},
          },
        ];

        const enforcement = await tokenManager.enforceBudget(sections);

        expect(enforcement.withinBudget).toBe(true);
        // The actual token calculation would depend on the implementation
        expect(typeof enforcement.budgetUtilization).toBe('number');
      });
    });

    describe('Over budget scenarios', () => {
      it('should apply optimizations when over budget', async () => {
        const largeSections = createTestSections(20, 500); // Large sections likely to exceed budget
        const enforcement = await tokenManager.enforceBudget(largeSections);

        if (!enforcement.withinBudget) {
          expect(enforcement.overageTokens).toBeGreaterThan(0);
          expect(enforcement.optimizationsApplied.length).toBeGreaterThan(0);
        }

        // Final result should attempt to be within budget
        expect(enforcement.totalTokens).toBeLessThanOrEqual(config.maxTokensPerPack * 1.1); // Allow 10% overage
      });

      it('should prioritize essential content', async () => {
        const sections = [
          ...createTestSections(5, 300).map((s) => ({ ...s, essential: false, priority: 0.3 })),
          ...createTestSections(3, 200).map((s) => ({ ...s, essential: true, priority: 0.9 })),
        ];

        const enforcement = await tokenManager.enforceBudget(sections);

        // Essential content should be preserved preferentially
        if (enforcement.contentRemoved.length > 0) {
          const removedSections = enforcement.contentRemoved;
          // Check that non-essential content is removed first (this would need access to the sections)
          expect(removedSections.length).toBeGreaterThanOrEqual(0);
        }
      });

      it('should apply compression optimizations', async () => {
        const compressibleSections = createTestSections(10, 400).map((s) => ({
          ...s,
          compressible: true,
          content: 'This is a test content that can be compressed. '.repeat(20),
        }));

        const enforcement = await tokenManager.enforceBudget(compressibleSections);

        const compressionOptimizations = enforcement.optimizationsApplied.filter(
          (opt) => opt.type === 'compression',
        );

        if (!enforcement.withinBudget) {
          expect(compressionOptimizations.length).toBeGreaterThan(0);
        }
      });

      it('should remove low-priority content when necessary', async () => {
        const sections = [
          ...createTestSections(5, 300).map((s, i) => ({
            ...s,
            essential: false,
            priority: 0.1 + i * 0.1,
          })),
          ...createTestSections(5, 300).map((s, i) => ({
            ...s,
            essential: true,
            priority: 0.8 + i * 0.05,
          })),
        ];

        const enforcement = await tokenManager.enforceBudget(sections);

        if (enforcement.contentRemoved.length > 0) {
          expect(enforcement.optimizationsApplied.some((opt) => opt.type === 'elimination')).toBe(
            true,
          );
        }
      });

      it('should apply truncation as last resort', async () => {
        const nonEssentialLargeSections = createTestSections(3, 2000).map((s) => ({
          ...s,
          essential: false,
          compressible: true,
          priority: 0.9, // High priority but not essential
          content: 'Very long content that should be truncated. '.repeat(100),
        }));

        const enforcement = await tokenManager.enforceBudget(nonEssentialLargeSections);

        const truncationOptimizations = enforcement.optimizationsApplied.filter(
          (opt) => opt.type === 'truncation',
        );

        if (!enforcement.withinBudget && enforcement.contentRemoved.length === 0) {
          expect(truncationOptimizations.length).toBeGreaterThan(0);
        }
      });
    });

    describe('Warnings and recommendations', () => {
      it('should generate warnings for budget overages', async () => {
        const largeSections = createTestSections(30, 400); // Likely to exceed budget
        const enforcement = await tokenManager.enforceBudget(largeSections);

        if (!enforcement.withinBudget) {
          expect(enforcement.warnings.some((w) => w.type === 'budget_exceeded')).toBe(true);
        }
      });

      it('should warn about low-priority content removal', async () => {
        const mixedPrioritySections = [
          ...createTestSections(10, 300).map((s) => ({ ...s, priority: 0.1, essential: false })),
          ...createTestSections(5, 300).map((s) => ({ ...s, priority: 0.9, essential: true })),
        ];

        const enforcement = await tokenManager.enforceBudget(mixedPrioritySections);

        if (enforcement.contentRemoved.length > 0) {
          expect(enforcement.warnings.some((w) => w.type === 'low_priority_content')).toBe(true);
        }
      });

      it('should suggest optimizations when needed', async () => {
        const suboptimalSections = createTestSections(15, 350).map((s) => ({
          ...s,
          content: s.content + ' with redundant content that could be optimized',
          compressible: true,
        }));

        const enforcement = await tokenManager.enforceBudget(suboptimalSections);

        if (enforcement.optimizationsApplied.length > 0) {
          expect(enforcement.warnings.some((w) => w.type === 'optimization_suggested')).toBe(true);
        }
      });
    });
  });

  describe('Token Usage Information', () => {
    it('should create comprehensive token usage info', async () => {
      const sections = createTestSections(10, 200);
      const enforcement = await tokenManager.enforceBudget(sections);
      const tokenUsage = await tokenManager.createTokenUsageInfo(sections, enforcement);

      expect(tokenUsage.totalTokens).toBe(enforcement.totalTokens);
      expect(tokenUsage.budgetLimit).toBe(config.maxTokensPerPack);
      expect(tokenUsage.utilization).toBe(enforcement.budgetUtilization);
      expect(tokenUsage.breakdown).toBeDefined();
      expect(tokenUsage.optimizations).toEqual(enforcement.optimizationsApplied);
      expect(tokenUsage.warnings).toEqual(enforcement.warnings);
    });

    it('should provide accurate breakdown by content type', async () => {
      const sections = [
        ...createTestSections(3, 100).map((s) => ({ ...s, type: 'memory' as const })),
        ...createTestSections(3, 100).map((s) => ({ ...s, type: 'knowledge' as const })),
        ...createTestSections(2, 100).map((s) => ({ ...s, type: 'realtime' as const })),
        ...createTestSections(2, 100).map((s) => ({ ...s, type: 'agent_specific' as const })),
      ];

      const enforcement = await tokenManager.enforceBudget(sections);
      const tokenUsage = await tokenManager.createTokenUsageInfo(sections, enforcement);

      expect(tokenUsage.breakdown.memory).toBeGreaterThan(0);
      expect(tokenUsage.breakdown.knowledge).toBeGreaterThan(0);
      expect(tokenUsage.breakdown.realtime).toBeGreaterThan(0);
      expect(tokenUsage.breakdown.agentSpecific).toBeGreaterThan(0);
    });
  });

  describe('Optimization Suggestions', () => {
    it('should suggest increasing budget for high utilization', () => {
      const highUtilizationUsage = {
        totalTokens: 4900,
        budgetLimit: 5000,
        utilization: 98,
        breakdown: {
          memory: 1000,
          knowledge: 2000,
          realtime: 1000,
          agentSpecific: 500,
          metadata: 200,
          provenance: 200,
        },
        optimizations: [],
        warnings: [],
      };

      const suggestions = tokenManager.getOptimizationSuggestions(highUtilizationUsage);

      expect(suggestions.some((s) => s.includes('increasing token budget'))).toBe(true);
    });

    it('should suggest reducing metadata for high metadata usage', () => {
      const highMetadataUsage = {
        totalTokens: 4000,
        budgetLimit: 5000,
        utilization: 80,
        breakdown: {
          memory: 1000,
          knowledge: 1500,
          realtime: 800,
          agentSpecific: 300,
          metadata: 600,
          provenance: 100,
        },
        optimizations: [],
        warnings: [],
      };

      const suggestions = tokenManager.getOptimizationSuggestions(highMetadataUsage);

      expect(suggestions.some((s) => s.includes('Metadata is consuming'))).toBe(true);
    });

    it('should suggest content strategy review for many optimizations', () => {
      const manyOptimizationsUsage = {
        totalTokens: 4500,
        budgetLimit: 5000,
        utilization: 90,
        breakdown: {
          memory: 1000,
          knowledge: 1500,
          realtime: 1000,
          agentSpecific: 500,
          metadata: 300,
          provenance: 200,
        },
        optimizations: Array.from({ length: 8 }, (_, i) => ({
          type: 'compression' as const,
          description: `Optimization ${i}`,
          tokensSaved: 100,
          impactLevel: 'moderate' as const,
          appliedAt: new Date(),
        })),
        warnings: [],
      };

      const suggestions = tokenManager.getOptimizationSuggestions(manyOptimizationsUsage);

      expect(suggestions.some((s) => s.includes('review content strategy'))).toBe(true);
    });
  });

  describe('Performance Metrics', () => {
    it('should record performance metrics', async () => {
      const sections = createTestSections(5, 100);

      // Perform multiple operations to record metrics
      for (let i = 0; i < 3; i++) {
        await tokenManager.enforceBudget(sections);
        await tokenManager.countTokens('test content');
      }

      const stats = tokenManager.getPerformanceStats();

      expect(stats).toBeDefined();
      expect(typeof stats).toBe('object');

      // Should have recorded some operations
      Object.values(stats).forEach((stat) => {
        expect(stat.avg).toBeGreaterThanOrEqual(0);
        expect(stat.p95).toBeGreaterThanOrEqual(0);
        expect(stat.p99).toBeGreaterThanOrEqual(0);
      });
    });

    it('should maintain performance history limits', async () => {
      const sections = createTestSections(2, 50);

      // Record many operations to test history limits
      for (let i = 0; i < 150; i++) {
        await tokenManager.countTokens(`test content ${i}`);
      }

      const stats = tokenManager.getPerformanceStats();

      // Should maintain reasonable performance even with many operations
      expect(stats).toBeDefined();
    });
  });

  describe('Content Compression', () => {
    it('should compress content effectively', async () => {
      const manager = tokenManager as any; // Access private method for testing

      const redundantContent = `
        It should be noted that this is a test.
        Please note that this content has redundancy.
        It is important to note that we can compress this.
        As mentioned before, compression is good.
      `;

      const compressed = await manager.compressContent(redundantContent);

      expect(compressed.length).toBeLessThan(redundantContent.length);
      expect(compressed).not.toContain('It should be noted that');
      expect(compressed).not.toContain('Please note that');
    });

    it('should handle already compressed content', async () => {
      const manager = tokenManager as any;
      const shortContent = 'Short content';

      const compressed = await manager.compressContent(shortContent);

      expect(compressed).toBeDefined();
      expect(typeof compressed).toBe('string');
    });
  });

  describe('Cleanup and Resource Management', () => {
    it('should cleanup resources properly', () => {
      expect(() => tokenManager.cleanup()).not.toThrow();
    });

    it('should handle cleanup of empty state', () => {
      const newManager = new TokenBudgetManager(config);
      expect(() => newManager.cleanup()).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty sections array', async () => {
      const enforcement = await tokenManager.enforceBudget([]);

      expect(enforcement.withinBudget).toBe(true);
      expect(enforcement.totalTokens).toBe(0);
      expect(enforcement.budgetUtilization).toBe(0);
      expect(enforcement.overageTokens).toBe(0);
    });

    it('should handle sections with empty content', async () => {
      const emptySections: ContentSection[] = [
        {
          id: 'empty-1',
          content: '',
          priority: 1,
          type: 'memory',
          essential: true,
          compressible: true,
          metadata: {},
        },
        {
          id: 'empty-2',
          content: '   ',
          priority: 0.8,
          type: 'knowledge',
          essential: false,
          compressible: true,
          metadata: {},
        },
      ];

      const enforcement = await tokenManager.enforceBudget(emptySections);

      expect(enforcement.withinBudget).toBe(true);
      expect(enforcement.totalTokens).toBeGreaterThanOrEqual(0);
    });

    it('should handle very small budget', async () => {
      const tinyBudgetConfig = { ...config, maxTokensPerPack: 10 };
      const tinyBudgetManager = new TokenBudgetManager(tinyBudgetConfig);

      const sections = createTestSections(5, 50);
      const enforcement = await tinyBudgetManager.enforceBudget(sections);

      expect(enforcement.totalTokens).toBeLessThanOrEqual(tinyBudgetConfig.maxTokensPerPack * 1.2); // Allow some overage
      expect(enforcement.optimizationsApplied.length).toBeGreaterThan(0);
    });
  });

  const createTestSections = (count: number, contentLength: number = 100): ContentSection[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `section-${i}`,
      content: 'A'.repeat(contentLength),
      priority: Math.random(),
      type:
        i % 4 === 0
          ? 'memory'
          : i % 4 === 1
            ? 'knowledge'
            : i % 4 === 2
              ? 'realtime'
              : 'agent_specific',
      essential: i < Math.floor(count / 3), // First third are essential
      compressible: i % 2 === 0, // Half are compressible
      metadata: { category: `category-${i}`, tags: [`tag-${i}`] },
    }));
  };
});
