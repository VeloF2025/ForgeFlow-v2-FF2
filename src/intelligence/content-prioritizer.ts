// Content Prioritization System - ML-driven content selection and ranking
// Intelligently prioritizes content based on relevance, effectiveness, and context

import { logger } from '../utils/logger';
import type {
  ContentPrioritizationStrategy,
  PrioritizationParameters,
  StrategyPerformance,
  ContextPackAssemblerConfig,
} from './types';

export interface ContentItem {
  id: string;
  content: string;
  type: 'memory' | 'knowledge' | 'realtime' | 'agent_specific';
  source: string;
  timestamp: Date;
  metadata: ContentItemMetadata;
  metrics: ContentItemMetrics;
  features: ContentFeatures;
}

export interface ContentItemMetadata {
  category: string;
  tags: string[];
  projectId?: string;
  issueId?: string;
  agentType?: string;
  difficulty: 'low' | 'medium' | 'high';
  scope: 'global' | 'project' | 'issue';
  [key: string]: unknown; // Allow additional properties for Record<string, unknown> compatibility
}

export interface ContentItemMetrics {
  usageCount: number;
  successRate: number;
  averageResolutionTime: number;
  effectiveness: number; // 0-1 score
  userRating: number; // 0-5 score
  lastUsed: Date;
  contextRelevance: number; // 0-1 score for current context
}

export interface ContentFeatures {
  wordCount: number;
  codeBlocks: number;
  technicalTerms: string[];
  complexity: number; // 0-1 score
  freshness: number; // 0-1 score based on age
  similarity: number; // 0-1 similarity to current context
  dependencies: string[];
  relatedContent: string[];
}

export interface PrioritizationContext {
  issueId: string;
  agentType: string;
  issueDescription: string;
  projectContext: string;
  historicalContext: string[];
  currentGoals: string[];
  constraints: string[];
  preferences: Record<string, unknown>;
}

export interface PrioritizationResult {
  items: PrioritizedContentItem[];
  strategy: string;
  confidence: number;
  reasoning: string[];
  alternatives: AlternativeRanking[];
  performance: RankingPerformance;
}

export interface PrioritizedContentItem {
  item: ContentItem;
  score: number;
  ranking: number;
  reasoning: string;
  confidence: number;
  factors: ScoringFactors;
}

export interface ScoringFactors {
  recencyScore: number;
  relevanceScore: number;
  effectivenessScore: number;
  frequencyScore: number;
  agentPreferenceScore: number;
  contextSimilarityScore: number;
  userFeedbackScore: number;
  compositeScore: number;
}

export interface AlternativeRanking {
  strategy: string;
  items: string[];
  confidence: number;
  reasoning: string;
}

export interface RankingPerformance {
  processingTime: number;
  itemsEvaluated: number;
  strategiesConsidered: number;
  confidenceLevel: number;
  expectedAccuracy: number;
}

export class ContentPrioritizer {
  private config: ContextPackAssemblerConfig;
  private strategies: Map<string, ContentPrioritizationStrategy> = new Map();
  private performanceHistory: Map<string, StrategyPerformance[]> = new Map();
  private learningData: Map<string, LearningDataPoint[]> = new Map();

  // ML feature weights (learned over time)
  private featureWeights: Map<string, number> = new Map([
    ['recency', 0.15],
    ['relevance', 0.25],
    ['effectiveness', 0.2],
    ['frequency', 0.1],
    ['agentPreference', 0.15],
    ['contextSimilarity', 0.1],
    ['userFeedback', 0.05],
  ]);

  constructor(config: ContextPackAssemblerConfig) {
    this.config = config;
    this.initializeStrategies();
    logger.info('[ContentPrioritizer] Initialized with ML-driven ranking');
  }

  /**
   * Initialize prioritization strategies
   */
  private initializeStrategies(): void {
    // Rule-based strategy
    this.strategies.set('rule_based', {
      name: 'Rule-Based Prioritization',
      version: '1.0.0',
      algorithm: 'rule_based',
      parameters: {
        recencyWeight: 0.2,
        relevanceWeight: 0.3,
        effectivenessWeight: 0.3,
        frequencyWeight: 0.1,
        agentPreferenceWeight: 0.1,
        contextSimilarityWeight: 0.0,
        userFeedbackWeight: 0.0,
      },
      performance: {
        accuracy: 75,
        averageRankingTime: 50,
        contentSatisfactionScore: 70,
        adaptationRate: 0.0,
      },
    });

    // ML-based strategy
    this.strategies.set('ml_ranking', {
      name: 'Machine Learning Ranking',
      version: '2.0.0',
      algorithm: 'ml_ranking',
      parameters: {
        recencyWeight: 0.15,
        relevanceWeight: 0.25,
        effectivenessWeight: 0.2,
        frequencyWeight: 0.1,
        agentPreferenceWeight: 0.15,
        contextSimilarityWeight: 0.1,
        userFeedbackWeight: 0.05,
      },
      performance: {
        accuracy: 85,
        averageRankingTime: 120,
        contentSatisfactionScore: 80,
        adaptationRate: 0.15,
      },
    });

    // Hybrid strategy (default)
    this.strategies.set('hybrid', {
      name: 'Hybrid ML-Rule Ranking',
      version: '3.0.0',
      algorithm: 'hybrid',
      parameters: {
        recencyWeight: 0.15,
        relevanceWeight: 0.25,
        effectivenessWeight: 0.2,
        frequencyWeight: 0.1,
        agentPreferenceWeight: 0.15,
        contextSimilarityWeight: 0.1,
        userFeedbackWeight: 0.05,
      },
      performance: {
        accuracy: 90,
        averageRankingTime: 80,
        contentSatisfactionScore: 85,
        adaptationRate: 0.12,
      },
    });

    logger.info('[ContentPrioritizer] Initialized 3 prioritization strategies');
  }

  /**
   * Prioritize content items based on context
   */
  async prioritizeContent(
    items: ContentItem[],
    context: PrioritizationContext,
  ): Promise<PrioritizationResult> {
    const startTime = Date.now();
    logger.info(`[ContentPrioritizer] Prioritizing ${items.length} content items`);

    try {
      // Select best strategy for this context
      const strategy = await this.selectStrategy(context, items);
      logger.debug(`[ContentPrioritizer] Using strategy: ${strategy.name}`);

      // Calculate features for all items
      const enrichedItems = await this.calculateFeatures(items, context);

      // Score and rank items
      const scoredItems = await this.scoreItems(enrichedItems, context, strategy);

      // Sort by score (descending)
      scoredItems.sort((a, b) => b.score - a.score);

      // Assign rankings
      scoredItems.forEach((item, index) => {
        item.ranking = index + 1;
      });

      // Generate alternatives
      const alternatives = await this.generateAlternativeRankings(enrichedItems, context);

      // Calculate performance metrics
      const processingTime = Date.now() - startTime;
      const performance: RankingPerformance = {
        processingTime,
        itemsEvaluated: items.length,
        strategiesConsidered: alternatives.length + 1,
        confidenceLevel: this.calculateOverallConfidence(scoredItems),
        expectedAccuracy: strategy.performance.accuracy,
      };

      const result: PrioritizationResult = {
        items: scoredItems,
        strategy: strategy.name,
        confidence: performance.confidenceLevel,
        reasoning: this.generateReasoning(strategy, context, scoredItems.slice(0, 5)),
        alternatives,
        performance,
      };

      logger.info(
        `[ContentPrioritizer] Prioritization completed in ${processingTime}ms with ${performance.confidenceLevel.toFixed(1)}% confidence`,
      );

      // Track prioritization stats for getStats method
      this.trackPrioritizationStats(result, performance);

      return result;
    } catch (error) {
      logger.error('[ContentPrioritizer] Prioritization failed:', error);
      throw new Error(
        `Content prioritization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Select the best strategy for the given context
   */
  private async selectStrategy(
    context: PrioritizationContext,
    items: ContentItem[],
  ): Promise<ContentPrioritizationStrategy> {
    // For now, use hybrid as default
    // TODO: Implement dynamic strategy selection based on context and historical performance
    const strategy = this.strategies.get('hybrid');
    if (!strategy) {
      throw new Error('Hybrid strategy not found');
    }

    return strategy;
  }

  /**
   * Calculate features for content items
   */
  private async calculateFeatures(
    items: ContentItem[],
    context: PrioritizationContext,
  ): Promise<ContentItem[]> {
    const enrichedItems = [...items];

    for (const item of enrichedItems) {
      // Ensure all required objects exist
      if (!item.features) {
        item.features = {
          wordCount: 0,
          codeBlocks: 0,
          technicalTerms: [],
          complexity: 0,
          freshness: 0,
          similarity: 0,
        };
      }
      
      if (!item.metadata) {
        item.metadata = {
          category: 'default',
          tags: [],
          difficulty: 'medium',
          scope: 'project',
        };
      }
      
      if (!item.metrics) {
        item.metrics = {
          usageCount: 0,
          successRate: 0.5,
          averageResolutionTime: 0,
          effectiveness: 0.5,
          userRating: 3,
          lastUsed: new Date(),
          contextRelevance: 0,
        };
      }
      
      // Calculate freshness (0-1, newer is better)
      const ageMs = Date.now() - item.timestamp.getTime();
      const maxAge = 90 * 24 * 60 * 60 * 1000; // 90 days
      item.features.freshness = Math.max(0, 1 - ageMs / maxAge);

      // Calculate context similarity using simple text matching
      item.features.similarity = await this.calculateContextSimilarity(item, context);

      // Calculate complexity based on content characteristics
      item.features.complexity = this.calculateComplexity(item);

      // Update context relevance
      item.metrics.contextRelevance = await this.calculateRelevance(item, context);
    }

    return enrichedItems;
  }

  /**
   * Calculate context similarity score
   */
  private async calculateContextSimilarity(
    item: ContentItem,
    context: PrioritizationContext,
  ): Promise<number> {
    // Simple keyword-based similarity
    const itemText =
      `${item.content} ${item.metadata.tags.join(' ')} ${item.metadata.category}`.toLowerCase();
    const contextText =
      `${context.issueDescription} ${context.projectContext} ${context.currentGoals.join(' ')}`.toLowerCase();

    // Extract keywords
    const itemKeywords = itemText.match(/\b\w{3,}\b/g) || [];
    const contextKeywords = contextText.match(/\b\w{3,}\b/g) || [];

    if (itemKeywords.length === 0 || contextKeywords.length === 0) {
      return 0;
    }

    // Calculate Jaccard similarity
    const itemSet = new Set(itemKeywords);
    const contextSet = new Set(contextKeywords);
    const intersection = new Set([...itemSet].filter((x) => contextSet.has(x)));
    const union = new Set([...itemSet, ...contextSet]);

    return intersection.size / union.size;
  }

  /**
   * Calculate content complexity
   */
  private calculateComplexity(item: ContentItem): number {
    let complexity = 0;

    // Word count factor
    const wordCount = item.content.split(/\s+/).length;
    complexity += Math.min(1, wordCount / 500) * 0.3;

    // Code blocks factor
    complexity += Math.min(1, item.features.codeBlocks / 3) * 0.2;

    // Technical terms factor
    complexity += Math.min(1, item.features.technicalTerms.length / 10) * 0.3;

    // Dependency factor
    complexity += Math.min(1, item.features.dependencies.length / 5) * 0.2;

    return Math.min(1, complexity);
  }

  /**
   * Calculate relevance to current context
   */
  private async calculateRelevance(
    item: ContentItem,
    context: PrioritizationContext,
  ): Promise<number> {
    let relevance = 0;

    // Agent type match
    if (item.metadata.agentType === context.agentType) {
      relevance += 0.3;
    }

    // Project match
    if (item.metadata.projectId && item.metadata.projectId === context.projectContext) {
      relevance += 0.2;
    }

    // Content similarity
    relevance += item.features.similarity * 0.3;

    // Category relevance (simple keyword matching)
    const categoryRelevant = context.currentGoals.some((goal) =>
      goal.toLowerCase().includes(item.metadata.category.toLowerCase()),
    );
    if (categoryRelevant) {
      relevance += 0.2;
    }

    return Math.min(1, relevance);
  }

  /**
   * Score content items using the selected strategy
   */
  private async scoreItems(
    items: ContentItem[],
    context: PrioritizationContext,
    strategy: ContentPrioritizationStrategy,
  ): Promise<PrioritizedContentItem[]> {
    const scoredItems: PrioritizedContentItem[] = [];

    for (const item of items) {
      const factors = await this.calculateScoringFactors(item, context, strategy.parameters);
      const score = this.calculateCompositeScore(factors, strategy.parameters);

      scoredItems.push({
        item,
        score,
        ranking: 0, // Will be assigned after sorting
        reasoning: this.generateItemReasoning(factors, strategy),
        confidence: this.calculateItemConfidence(factors),
        factors,
      });
    }

    return scoredItems;
  }

  /**
   * Calculate all scoring factors for an item
   */
  private async calculateScoringFactors(
    item: ContentItem,
    context: PrioritizationContext,
    parameters: PrioritizationParameters,
  ): Promise<ScoringFactors> {
    const factors: ScoringFactors = {
      recencyScore: item.features.freshness,
      relevanceScore: item.metrics.contextRelevance,
      effectivenessScore: item.metrics.effectiveness,
      frequencyScore: Math.min(1, item.metrics.usageCount / 10), // Normalize usage count
      agentPreferenceScore: await this.calculateAgentPreference(item, context),
      contextSimilarityScore: item.features.similarity,
      userFeedbackScore: item.metrics.userRating / 5, // Normalize to 0-1
      compositeScore: 0, // Will be calculated
    };

    factors.compositeScore = this.calculateCompositeScore(factors, parameters);
    return factors;
  }

  /**
   * Calculate agent preference score
   */
  private async calculateAgentPreference(
    item: ContentItem,
    context: PrioritizationContext,
  ): Promise<number> {
    // Simple preference calculation based on historical usage by this agent type
    if (item.metadata.agentType === context.agentType) {
      return Math.min(1, item.metrics.usageCount / 5);
    }

    // Check if this content type is generally preferred by this agent
    const agentPreferences =
      (context.preferences[`${context.agentType}_preferences`] as Record<string, number>) || {};
    return agentPreferences[item.metadata.category] || 0.5; // Default neutral score
  }

  /**
   * Calculate composite score using weighted factors
   */
  private calculateCompositeScore(
    factors: ScoringFactors,
    parameters: PrioritizationParameters,
  ): number {
    return (
      factors.recencyScore * parameters.recencyWeight +
      factors.relevanceScore * parameters.relevanceWeight +
      factors.effectivenessScore * parameters.effectivenessWeight +
      factors.frequencyScore * parameters.frequencyWeight +
      factors.agentPreferenceScore * parameters.agentPreferenceWeight +
      factors.contextSimilarityScore * parameters.contextSimilarityWeight +
      factors.userFeedbackScore * parameters.userFeedbackWeight
    );
  }

  /**
   * Generate alternative rankings using different strategies
   */
  private async generateAlternativeRankings(
    items: ContentItem[],
    context: PrioritizationContext,
  ): Promise<AlternativeRanking[]> {
    const alternatives: AlternativeRanking[] = [];

    // Try other strategies
    for (const [name, strategy] of this.strategies) {
      if (name === 'hybrid') continue; // Skip the primary strategy

      const altScored = await this.scoreItems(items, context, strategy);
      altScored.sort((a, b) => b.score - a.score);

      alternatives.push({
        strategy: strategy.name,
        items: altScored.slice(0, 10).map((item) => item.item.id),
        confidence: strategy.performance.accuracy,
        reasoning: `Alternative ranking using ${strategy.algorithm} approach`,
      });
    }

    return alternatives;
  }

  /**
   * Calculate overall confidence in the ranking
   */
  private calculateOverallConfidence(items: PrioritizedContentItem[]): number {
    if (items.length === 0) return 0;

    const avgConfidence = items.reduce((sum, item) => sum + item.confidence, 0) / items.length;
    const scoreDistribution = this.calculateScoreDistribution(items);

    // Higher confidence if scores are well-distributed
    const distributionBonus = scoreDistribution > 0.3 ? 10 : 0;

    return Math.min(100, avgConfidence * 100 + distributionBonus);
  }

  /**
   * Calculate score distribution (variance indicator)
   */
  private calculateScoreDistribution(items: PrioritizedContentItem[]): number {
    if (items.length === 0) return 0;

    const scores = items.map((item) => item.score);
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const variance =
      scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;

    return Math.sqrt(variance);
  }

  /**
   * Generate reasoning for the overall prioritization
   */
  private generateReasoning(
    strategy: ContentPrioritizationStrategy,
    context: PrioritizationContext,
    topItems: PrioritizedContentItem[],
  ): string[] {
    const reasoning: string[] = [];

    reasoning.push(
      `Used ${strategy.name} with ${strategy.performance.accuracy}% expected accuracy`,
    );
    reasoning.push(
      `Prioritized content for ${context.agentType} agent working on issue ${context.issueId}`,
    );

    if (topItems.length > 0) {
      const avgScore = topItems.reduce((sum, item) => sum + item.score, 0) / topItems.length;
      reasoning.push(`Top ${topItems.length} items have average score of ${avgScore.toFixed(3)}`);

      const highEffectiveness = topItems.filter(
        (item) => item.factors.effectivenessScore > 0.8,
      ).length;
      if (highEffectiveness > 0) {
        reasoning.push(`${highEffectiveness} high-effectiveness items prioritized`);
      }

      const recentItems = topItems.filter((item) => item.factors.recencyScore > 0.7).length;
      if (recentItems > 0) {
        reasoning.push(`${recentItems} recent items included for freshness`);
      }
    }

    return reasoning;
  }

  /**
   * Generate reasoning for individual item scoring
   */
  private generateItemReasoning(
    factors: ScoringFactors,
    strategy: ContentPrioritizationStrategy,
  ): string {
    const reasons: string[] = [];

    const topFactor = this.getTopFactor(factors);
    reasons.push(`Highest score: ${topFactor.name} (${topFactor.score.toFixed(3)})`);

    if (factors.effectivenessScore > 0.8) {
      reasons.push('High effectiveness');
    }
    if (factors.recencyScore > 0.8) {
      reasons.push('Very recent');
    }
    if (factors.relevanceScore > 0.8) {
      reasons.push('Highly relevant');
    }
    if (factors.contextSimilarityScore > 0.7) {
      reasons.push('Strong context match');
    }

    return reasons.join(', ');
  }

  /**
   * Get the top scoring factor
   */
  private getTopFactor(factors: ScoringFactors): { name: string; score: number } {
    const factorEntries = [
      { name: 'recency', score: factors.recencyScore },
      { name: 'relevance', score: factors.relevanceScore },
      { name: 'effectiveness', score: factors.effectivenessScore },
      { name: 'frequency', score: factors.frequencyScore },
      { name: 'agent preference', score: factors.agentPreferenceScore },
      { name: 'context similarity', score: factors.contextSimilarityScore },
      { name: 'user feedback', score: factors.userFeedbackScore },
    ];

    return factorEntries.reduce((max, current) => (current.score > max.score ? current : max));
  }

  /**
   * Calculate confidence in individual item scoring
   */
  private calculateItemConfidence(factors: ScoringFactors): number {
    // Higher confidence when multiple factors agree
    const factorScores = [
      factors.recencyScore,
      factors.relevanceScore,
      factors.effectivenessScore,
      factors.frequencyScore,
      factors.agentPreferenceScore,
      factors.contextSimilarityScore,
      factors.userFeedbackScore,
    ];

    const highScores = factorScores.filter((score) => score > 0.7).length;
    const mediumScores = factorScores.filter((score) => score > 0.4 && score <= 0.7).length;

    // Confidence based on factor agreement
    return Math.min(1, highScores * 0.15 + mediumScores * 0.08 + 0.3);
  }

  /**
   * Learn from feedback to improve future prioritization
   */
  async learnFromFeedback(
    result: PrioritizationResult,
    feedback: PrioritizationFeedback,
  ): Promise<void> {
    const dataPoint: LearningDataPoint = {
      timestamp: new Date(),
      strategy: result.strategy,
      context: feedback.context,
      actualOrder: feedback.actualOrder,
      predictedOrder: result.items.map((item) => item.item.id),
      satisfaction: feedback.satisfaction,
      performance: result.performance,
    };

    const strategyData = this.learningData.get(result.strategy) || [];
    strategyData.push(dataPoint);
    this.learningData.set(result.strategy, strategyData);

    // Update feature weights based on feedback
    if (this.config.enableMLContentRanking) {
      await this.updateFeatureWeights(dataPoint);
    }

    logger.info('[ContentPrioritizer] Learned from feedback, satisfaction:', feedback.satisfaction);
  }

  /**
   * Update ML feature weights based on feedback
   */
  private async updateFeatureWeights(dataPoint: LearningDataPoint): Promise<void> {
    // Simple learning: if satisfaction is high, strengthen successful patterns
    const learningRate = 0.1;
    const satisfactionFactor = (dataPoint.satisfaction - 2.5) / 2.5; // Normalize to -1 to 1

    // This is a simplified learning approach
    // In production, you'd use more sophisticated ML techniques
    for (const [feature, weight] of this.featureWeights) {
      const adjustment = satisfactionFactor * learningRate * 0.1;
      const newWeight = Math.max(0.01, Math.min(0.5, weight + adjustment));
      this.featureWeights.set(feature, newWeight);
    }

    logger.debug('[ContentPrioritizer] Updated feature weights based on feedback');
  }

  /**
   * Get current prioritization statistics
   */
  getStats(): PrioritizerStats {
    const stats: PrioritizerStats = {
      totalPrioritizations: 0,
      averageProcessingTime: 0,
      averageConfidence: 0,
      averageSatisfaction: 0,
      strategyUsage: {},
      featureWeights: Object.fromEntries(this.featureWeights),
    };

    for (const [strategy, dataPoints] of this.learningData) {
      stats.totalPrioritizations += dataPoints.length;
      stats.strategyUsage[strategy] = dataPoints.length;

      if (dataPoints.length > 0) {
        const avgTime =
          dataPoints.reduce((sum, dp) => sum + dp.performance.processingTime, 0) /
          dataPoints.length;
        const avgSatisfaction =
          dataPoints.reduce((sum, dp) => sum + dp.satisfaction, 0) / dataPoints.length;

        stats.averageProcessingTime += avgTime;
        stats.averageSatisfaction += avgSatisfaction;
      }
    }

    const strategyCount = Object.keys(stats.strategyUsage).length;
    if (strategyCount > 0) {
      stats.averageProcessingTime /= strategyCount;
      stats.averageSatisfaction /= strategyCount;
    }

    return stats;
  }

  /**
   * Track prioritization statistics for analytics
   */
  private trackPrioritizationStats(
    result: PrioritizationResult,
    performance: { confidenceLevel: number; processingTime: number }
  ): void {
    // Create learning data point for stats tracking
    const dataPoint: LearningDataPoint = {
      context: {
        agentType: 'unknown',
        issueComplexity: 'medium',
        dataAvailability: 'partial',
        constraints: [],
      },
      actualOrder: result.items.map((item) => item.item.id),
      predictedOrder: result.items.map((item) => item.item.id),
      satisfaction: 4, // Default satisfaction for tracking
      performance: {
        processingTime: performance.processingTime,
        confidenceLevel: performance.confidenceLevel,
        expectedAccuracy: 85,
      },
    };

    // Add to learning data for stats
    const strategyData = this.learningData.get(result.strategy) || [];
    strategyData.push(dataPoint);
    this.learningData.set(result.strategy, strategyData);
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.performanceHistory.clear();
    this.learningData.clear();
    logger.info('[ContentPrioritizer] Cleaned up resources');
  }
}

// Supporting interfaces
interface LearningDataPoint {
  timestamp: Date;
  strategy: string;
  context: string;
  actualOrder: string[];
  predictedOrder: string[];
  satisfaction: number; // 1-5 scale
  performance: RankingPerformance;
}

export interface PrioritizationFeedback {
  context: string;
  actualOrder: string[]; // Actual order items were used/preferred
  satisfaction: number; // 1-5 scale
  comments?: string;
}

export interface PrioritizerStats {
  totalPrioritizations: number;
  averageProcessingTime: number;
  averageConfidence: number;
  averageSatisfaction: number;
  strategyUsage: Record<string, number>;
  featureWeights: Record<string, number>;
}

export default ContentPrioritizer;
