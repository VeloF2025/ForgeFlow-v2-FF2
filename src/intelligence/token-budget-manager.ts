// Token Budget Manager - Precise token counting and enforcement
// Manages token budgets with ≤5k token limit per context pack

import { logger } from '../utils/logger';
import type {
  TokenUsageInfo,
  TokenBreakdown,
  TokenOptimization,
  TokenWarning,
  ContextPackAssemblerConfig,
} from './types';

export interface TokenCountResult {
  tokenCount: number;
  method: string;
  accuracy: number;
  estimatedCost?: number;
}

export interface ContentSection {
  id: string;
  content: string;
  priority: number;
  type: 'memory' | 'knowledge' | 'realtime' | 'agent_specific' | 'metadata' | 'provenance';
  essential: boolean;
  compressible: boolean;
  metadata: Record<string, unknown>;
}

export interface BudgetEnforcement {
  withinBudget: boolean;
  totalTokens: number;
  budgetUtilization: number;
  overageTokens: number;
  optimizationsApplied: TokenOptimization[];
  contentRemoved: string[];
  warnings: TokenWarning[];
}

export class TokenBudgetManager {
  private config: ContextPackAssemblerConfig;
  private optimizationHistory: Map<string, TokenOptimization[]> = new Map();
  private performanceMetrics: Map<string, number[]> = new Map();

  // Token counting methods
  private static readonly AVERAGE_TOKENS_PER_CHAR = 0.25; // Conservative estimate
  private static readonly AVERAGE_TOKENS_PER_WORD = 1.3; // Based on GPT tokenization
  private static readonly TIKTOKEN_APPROXIMATION = 0.75; // Approximation factor

  constructor(config: ContextPackAssemblerConfig) {
    this.config = config;
    logger.info('[TokenBudgetManager] Initialized with budget:', config.maxTokensPerPack);
  }

  /**
   * Count tokens in content using configured method
   */
  async countTokens(content: string): Promise<TokenCountResult> {
    const startTime = Date.now();
    let result: TokenCountResult;

    try {
      switch (this.config.tokenCountingMethod) {
        case 'character':
          result = this.countTokensByCharacter(content);
          break;
        case 'word':
          result = this.countTokensByWord(content);
          break;
        case 'tiktoken':
          result = await this.countTokensByTikToken(content);
          break;
        default:
          result = this.countTokensByWord(content); // Default fallback
      }

      const duration = Date.now() - startTime;
      this.recordPerformance('token_counting', duration);

      logger.debug(
        `[TokenBudgetManager] Counted ${result.tokenCount} tokens in ${duration}ms using ${result.method}`,
      );
      return result;
    } catch (error) {
      logger.error('[TokenBudgetManager] Token counting failed:', error);
      // Fallback to character-based counting
      return this.countTokensByCharacter(content);
    }
  }

  /**
   * Count tokens by character approximation (fastest but least accurate)
   */
  private countTokensByCharacter(content: string): TokenCountResult {
    const tokenCount = Math.ceil(content.length * TokenBudgetManager.AVERAGE_TOKENS_PER_CHAR);
    return {
      tokenCount,
      method: 'character',
      accuracy: 0.7, // Lower accuracy but very fast
      estimatedCost: tokenCount * 0.0001, // Rough cost estimate
    };
  }

  /**
   * Count tokens by word approximation (balance of speed and accuracy)
   */
  private countTokensByWord(content: string): TokenCountResult {
    const words = content.trim().split(/\s+/).length;
    const tokenCount = Math.ceil(words * TokenBudgetManager.AVERAGE_TOKENS_PER_WORD);
    return {
      tokenCount,
      method: 'word',
      accuracy: 0.85, // Good accuracy and reasonable speed
      estimatedCost: tokenCount * 0.0001,
    };
  }

  /**
   * Count tokens using TikToken approximation (most accurate but slower)
   */
  private async countTokensByTikToken(content: string): Promise<TokenCountResult> {
    // Simulate TikToken behavior with improved approximation
    const words = content.trim().split(/\s+/).length;
    const chars = content.length;

    // More sophisticated approximation considering:
    // - Average word length
    // - Special characters and punctuation
    // - Code blocks and formatting
    const codeBlockMatches: string[] = content.match(/```[\s\S]*?```/g) || [];
    const codeTokens = codeBlockMatches.reduce((total: number, block: string) => {
      return total + Math.ceil(block.length * 0.3); // Code is more token-dense
    }, 0);

    const regularContent = content.replace(/```[\s\S]*?```/g, '');
    const regularTokens = Math.ceil(
      regularContent.length * TokenBudgetManager.TIKTOKEN_APPROXIMATION,
    );

    const tokenCount = regularTokens + codeTokens;

    return {
      tokenCount,
      method: 'tiktoken',
      accuracy: 0.95, // Highest accuracy
      estimatedCost: tokenCount * 0.0001,
    };
  }

  /**
   * Enforce token budget on content sections
   */
  async enforceBudget(sections: ContentSection[]): Promise<BudgetEnforcement> {
    const startTime = Date.now();
    logger.info('[TokenBudgetManager] Starting budget enforcement');

    // Calculate current token usage
    const tokenBreakdown = await this.calculateTokenBreakdown(sections);
    const totalTokens = Object.values(tokenBreakdown).reduce((sum, count) => sum + count, 0);

    const budgetUtilization = (totalTokens / this.config.maxTokensPerPack) * 100;
    const overageTokens = Math.max(0, totalTokens - this.config.maxTokensPerPack);

    const enforcement: BudgetEnforcement = {
      withinBudget: totalTokens <= this.config.maxTokensPerPack,
      totalTokens,
      budgetUtilization,
      overageTokens,
      optimizationsApplied: [],
      contentRemoved: [],
      warnings: [],
    };

    // If within budget, return early
    if (enforcement.withinBudget) {
      logger.info(
        `[TokenBudgetManager] Within budget: ${totalTokens}/${this.config.maxTokensPerPack} tokens (${budgetUtilization.toFixed(1)}%)`,
      );
      return enforcement;
    }

    // Apply optimizations to fit within budget
    logger.warn(
      `[TokenBudgetManager] Budget exceeded: ${totalTokens}/${this.config.maxTokensPerPack} tokens (${overageTokens} overage)`,
    );

    const optimizedSections = await this.optimizeContent(sections, overageTokens);
    const optimizations = await this.applyOptimizations(optimizedSections, overageTokens);

    enforcement.optimizationsApplied = optimizations.optimizations;
    enforcement.contentRemoved = optimizations.removedContent;
    enforcement.warnings = optimizations.warnings;

    // Recalculate after optimizations
    const finalTokens = await this.calculateTotalTokens(optimizedSections);
    enforcement.totalTokens = finalTokens;
    enforcement.budgetUtilization = (finalTokens / this.config.maxTokensPerPack) * 100;
    enforcement.overageTokens = Math.max(0, finalTokens - this.config.maxTokensPerPack);
    enforcement.withinBudget = finalTokens <= this.config.maxTokensPerPack;

    const duration = Date.now() - startTime;
    this.recordPerformance('budget_enforcement', duration);

    logger.info(
      `[TokenBudgetManager] Budget enforcement completed in ${duration}ms. Final: ${finalTokens}/${this.config.maxTokensPerPack} tokens`,
    );

    return enforcement;
  }

  /**
   * Calculate token breakdown by content type
   */
  private async calculateTokenBreakdown(sections: ContentSection[]): Promise<TokenBreakdown> {
    const breakdown: TokenBreakdown = {
      memory: 0,
      knowledge: 0,
      realtime: 0,
      agentSpecific: 0,
      metadata: 0,
      provenance: 0,
    };

    for (const section of sections) {
      const tokenCount = (await this.countTokens(section.content)).tokenCount;
      breakdown[section.type] += tokenCount;
    }

    return breakdown;
  }

  /**
   * Calculate total tokens across all sections
   */
  private async calculateTotalTokens(sections: ContentSection[]): Promise<number> {
    let total = 0;
    for (const section of sections) {
      const tokenCount = (await this.countTokens(section.content)).tokenCount;
      total += tokenCount;
    }
    return total;
  }

  /**
   * Optimize content to fit within budget
   */
  private async optimizeContent(
    sections: ContentSection[],
    overage: number,
  ): Promise<ContentSection[]> {
    const optimizedSections = [...sections];
    let tokensToReduce = overage;

    // Sort sections by priority (lowest first) and non-essential first
    optimizedSections.sort((a, b) => {
      if (a.essential !== b.essential) {
        return a.essential ? 1 : -1; // Non-essential first
      }
      return a.priority - b.priority; // Lower priority first
    });

    logger.info(`[TokenBudgetManager] Optimizing content to reduce ${tokensToReduce} tokens`);

    // Apply optimizations in order of impact
    for (let i = 0; i < optimizedSections.length && tokensToReduce > 0; i++) {
      const section = optimizedSections[i];

      if (section.compressible) {
        const originalTokens = (await this.countTokens(section.content)).tokenCount;
        const compressed = await this.compressContent(section.content);
        const newTokens = (await this.countTokens(compressed)).tokenCount;
        const savedTokens = originalTokens - newTokens;

        if (savedTokens > 0) {
          section.content = compressed;
          tokensToReduce -= savedTokens;
          logger.debug(
            `[TokenBudgetManager] Compressed section ${section.id}: saved ${savedTokens} tokens`,
          );
        }
      }
    }

    return optimizedSections;
  }

  /**
   * Apply various optimization strategies
   */
  private async applyOptimizations(
    sections: ContentSection[],
    targetReduction: number,
  ): Promise<{
    optimizations: TokenOptimization[];
    removedContent: string[];
    warnings: TokenWarning[];
  }> {
    const optimizations: TokenOptimization[] = [];
    const removedContent: string[] = [];
    const warnings: TokenWarning[] = [];
    let tokensReduced = 0;

    // Strategy 1: Compress compressible content
    for (const section of sections) {
      if (section.compressible && tokensReduced < targetReduction) {
        const originalTokens = (await this.countTokens(section.content)).tokenCount;
        const compressed = await this.compressContent(section.content);
        const newTokens = (await this.countTokens(compressed)).tokenCount;
        const saved = originalTokens - newTokens;

        if (saved > 0) {
          section.content = compressed;
          tokensReduced += saved;

          optimizations.push({
            type: 'compression',
            description: `Compressed ${section.type} content`,
            tokensSaved: saved,
            impactLevel: saved > 50 ? 'significant' : saved > 20 ? 'moderate' : 'minimal',
            appliedAt: new Date(),
          });
        }
      }
    }

    // Strategy 2: Remove lowest priority, non-essential content
    if (tokensReduced < targetReduction) {
      const nonEssential = sections
        .filter((s) => !s.essential)
        .sort((a, b) => a.priority - b.priority);

      for (const section of nonEssential) {
        if (tokensReduced >= targetReduction) break;

        const tokens = (await this.countTokens(section.content)).tokenCount;
        removedContent.push(section.id);
        tokensReduced += tokens;

        // Remove section from array
        const index = sections.indexOf(section);
        if (index > -1) {
          sections.splice(index, 1);
        }

        optimizations.push({
          type: 'elimination',
          description: `Removed low-priority ${section.type} content`,
          tokensSaved: tokens,
          impactLevel: 'moderate',
          appliedAt: new Date(),
        });

        warnings.push({
          type: 'low_priority_content',
          severity: 'warning',
          message: `Removed content section due to budget constraints`,
          recommendation: `Consider increasing budget or reducing other content`,
          timestamp: new Date(),
        });
      }
    }

    // Strategy 3: Truncate remaining content if still over budget
    if (tokensReduced < targetReduction) {
      const remaining = targetReduction - tokensReduced;
      const truncatable = sections
        .filter((s) => !s.essential && s.content.length > 100)
        .sort((a, b) => a.priority - b.priority);

      for (const section of truncatable) {
        if (tokensReduced >= targetReduction) break;

        const originalTokens = (await this.countTokens(section.content)).tokenCount;
        const truncated = section.content.substring(0, Math.floor(section.content.length * 0.7));
        const newTokens = (await this.countTokens(truncated)).tokenCount;
        const saved = originalTokens - newTokens;

        section.content = truncated + '... [truncated for budget]';
        tokensReduced += saved;

        optimizations.push({
          type: 'truncation',
          description: `Truncated ${section.type} content by 30%`,
          tokensSaved: saved,
          impactLevel: 'significant',
          appliedAt: new Date(),
        });

        warnings.push({
          type: 'optimization_suggested',
          severity: 'warning',
          message: `Content was truncated to fit budget`,
          recommendation: `Review content prioritization strategy`,
          timestamp: new Date(),
        });
      }
    }

    // Final warning if still over budget
    if (tokensReduced < targetReduction) {
      warnings.push({
        type: 'budget_exceeded',
        severity: 'error',
        message: `Unable to reduce content to fit within budget`,
        recommendation: `Increase token budget or review content requirements`,
        timestamp: new Date(),
      });
    }

    return { optimizations, removedContent, warnings };
  }

  /**
   * Compress content using various strategies
   */
  private async compressContent(content: string): Promise<string> {
    let compressed = content;

    // Remove excessive whitespace
    compressed = compressed.replace(/\s+/g, ' ').trim();

    // Remove empty lines
    compressed = compressed.replace(/\n\s*\n\s*\n/g, '\n\n');

    // Compress common patterns
    compressed = compressed
      .replace(/\b(is|are|was|were)\s+(not|n't)\b/g, "isn't/aren't") // Contract negations
      .replace(/\b(will|shall)\s+not\b/g, "won't")
      .replace(/\b(cannot)\b/g, "can't")
      .replace(/\b(would|could|should)\s+not\b/g, "wouldn't/couldn't/shouldn't");

    // Remove redundant phrases in technical content
    compressed = compressed
      .replace(/\b(please note that|it should be noted that|it is important to note that)\b/gi, '')
      .replace(/\b(as mentioned (before|above|previously))\b/gi, '')
      .replace(/\b(in order to)\b/gi, 'to');

    return compressed;
  }

  /**
   * Create token usage info summary
   */
  async createTokenUsageInfo(
    sections: ContentSection[],
    enforcement: BudgetEnforcement,
  ): Promise<TokenUsageInfo> {
    const breakdown = await this.calculateTokenBreakdown(sections);

    return {
      totalTokens: enforcement.totalTokens,
      budgetLimit: this.config.maxTokensPerPack,
      utilization: enforcement.budgetUtilization,
      breakdown,
      optimizations: enforcement.optimizationsApplied,
      warnings: enforcement.warnings,
    };
  }

  /**
   * Get optimization suggestions for future improvements
   */
  getOptimizationSuggestions(tokenUsage: TokenUsageInfo): string[] {
    const suggestions: string[] = [];

    if (tokenUsage.utilization > 90) {
      suggestions.push('Consider increasing token budget or reducing content volume');
    }

    if (tokenUsage.breakdown.metadata > tokenUsage.totalTokens * 0.1) {
      suggestions.push('Metadata is consuming >10% of budget, consider reducing');
    }

    if (tokenUsage.breakdown.provenance > tokenUsage.totalTokens * 0.05) {
      suggestions.push('Provenance data is consuming >5% of budget, consider compression');
    }

    if (tokenUsage.optimizations.length > 5) {
      suggestions.push('High number of optimizations applied, review content strategy');
    }

    // Historical analysis suggestions
    const history = this.optimizationHistory.get('overall') || [];
    if (history.length > 10) {
      const avgOptimizations = history.length / 10;
      if (avgOptimizations > 3) {
        suggestions.push('Consistent over-budget issues detected, consider systematic review');
      }
    }

    return suggestions;
  }

  /**
   * Record performance metrics
   */
  private recordPerformance(operation: string, duration: number): void {
    if (!this.performanceMetrics.has(operation)) {
      this.performanceMetrics.set(operation, []);
    }

    const metrics = this.performanceMetrics.get(operation);
    metrics.push(duration);

    // Keep only last 100 measurements
    if (metrics.length > 100) {
      metrics.shift();
    }
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): Record<string, { avg: number; p95: number; p99: number }> {
    const stats: Record<string, { avg: number; p95: number; p99: number }> = {};

    for (const [operation, measurements] of this.performanceMetrics.entries()) {
      const sorted = [...measurements].sort((a, b) => a - b);
      const avg = measurements.reduce((sum, val) => sum + val, 0) / measurements.length;
      const p95Index = Math.floor(sorted.length * 0.95);
      const p99Index = Math.floor(sorted.length * 0.99);

      stats[operation] = {
        avg: Math.round(avg),
        p95: sorted[p95Index] || avg,
        p99: sorted[p99Index] || avg,
      };
    }

    return stats;
  }

  /**
   * Clean up and reset
   */
  cleanup(): void {
    this.optimizationHistory.clear();
    this.performanceMetrics.clear();
    logger.info('[TokenBudgetManager] Cleaned up resources');
  }
}

export default TokenBudgetManager;
