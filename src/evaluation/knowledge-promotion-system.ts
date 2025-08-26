// Knowledge Promotion System - Automated card effectiveness assessment and promotion/demotion
// Daily automated assessment with continuous learning

import type {
  KnowledgePromotionSystem,
  EffectivenessEvaluation,
  PromotionDemotionResult,
  CardUsageOutcome,
  PromotionCandidate,
  DemotionCandidate,
  EvaluationConfig,
} from './types';
import { JobOutcome, TimeRange } from './types';
import type { KnowledgeCard } from '../types';
import type { KnowledgeManager } from '../knowledge/knowledge-manager';
import type { JobOutcomeTracker } from './job-outcome-tracker';
import { enhancedLogger } from '../utils/enhanced-logger';
import { promises as fs } from 'fs';
import { join } from 'path';

export class AutomatedKnowledgePromotionSystem implements KnowledgePromotionSystem {
  private config: EvaluationConfig;
  private knowledgeManager: KnowledgeManager;
  private jobTracker: JobOutcomeTracker;
  private usageOutcomes: Map<string, CardUsageOutcome[]> = new Map();
  private evaluationHistory: Map<string, EffectivenessEvaluation[]> = new Map();
  private lastPromotionRun: Date | null = null;

  private performanceTracker = {
    evaluationsRun: 0,
    totalEvaluationTime: 0,
    avgEvaluationTime: 0,
    promotionsExecuted: 0,
    demotionsExecuted: 0,
    lastRun: new Date(),
  };

  constructor(
    config: EvaluationConfig,
    knowledgeManager: KnowledgeManager,
    jobTracker: JobOutcomeTracker,
  ) {
    this.config = config;
    this.knowledgeManager = knowledgeManager;
    this.jobTracker = jobTracker;
    this.initializeSystem();
  }

  /**
   * Initialize the knowledge promotion system
   */
  private async initializeSystem(): Promise<void> {
    try {
      // Load existing usage outcomes and evaluation history
      await this.loadPromotionData();

      enhancedLogger.info('Knowledge promotion system initialized', {
        trackedCards: this.usageOutcomes.size,
        evaluationHistory: this.evaluationHistory.size,
        promotionThreshold: this.config.promotionThreshold,
        demotionThreshold: this.config.demotionThreshold,
      });
    } catch (error) {
      enhancedLogger.error('Failed to initialize knowledge promotion system', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Evaluate the effectiveness of a specific knowledge card
   */
  async evaluateCardEffectiveness(cardId: string): Promise<EffectivenessEvaluation> {
    const startTime = performance.now();

    try {
      // Get the knowledge card
      const card = await this.knowledgeManager.getCard(cardId);
      if (!card) {
        throw new Error(`Knowledge card not found: ${cardId}`);
      }

      // Get usage outcomes for this card
      const usageOutcomes = this.usageOutcomes.get(cardId) || [];

      // Calculate current effectiveness
      const currentEffectiveness = this.calculateCurrentEffectiveness(card, usageOutcomes);

      // Generate usage statistics
      const usageStats = this.generateUsageStatistics(usageOutcomes);

      // Calculate performance metrics
      const performanceMetrics = this.calculatePerformanceMetrics(usageOutcomes);

      // Analyze context effectiveness
      const contextEffectiveness = this.analyzeContextEffectiveness(usageOutcomes);

      // Perform trend analysis
      const trendAnalysis = this.performTrendAnalysis(cardId, usageOutcomes);

      // Generate recommendation
      const { recommendation, reasoning } = this.generateRecommendation(
        currentEffectiveness,
        usageStats,
        performanceMetrics,
        trendAnalysis,
      );

      const evaluation: EffectivenessEvaluation = {
        cardId,
        timestamp: new Date(),
        currentEffectiveness,
        usageStats,
        performanceMetrics,
        contextEffectiveness,
        trendAnalysis,
        recommendation,
        reasoning,
      };

      // Store evaluation in history
      if (!this.evaluationHistory.has(cardId)) {
        this.evaluationHistory.set(cardId, []);
      }
      this.evaluationHistory.get(cardId).push(evaluation);

      // Keep only last 30 evaluations per card
      const history = this.evaluationHistory.get(cardId);
      if (history.length > 30) {
        this.evaluationHistory.set(cardId, history.slice(-30));
      }

      // Update performance tracking
      const duration = performance.now() - startTime;
      this.updateEvaluationMetrics(duration);

      enhancedLogger.debug('Card effectiveness evaluated', {
        cardId,
        currentEffectiveness,
        recommendation,
        duration,
        usageCount: usageOutcomes.length,
      });

      return evaluation;
    } catch (error) {
      enhancedLogger.error('Failed to evaluate card effectiveness', undefined, {
        cardId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Calculate current effectiveness based on card data and usage outcomes
   */
  private calculateCurrentEffectiveness(
    card: KnowledgeCard,
    usageOutcomes: CardUsageOutcome[],
  ): number {
    if (usageOutcomes.length === 0) {
      // Base effectiveness on card metadata
      return card.effectiveness || 0.5;
    }

    // Weight recent outcomes more heavily
    const now = Date.now();
    let weightedEffectiveness = 0;
    let totalWeight = 0;

    for (const outcome of usageOutcomes) {
      const ageInDays = (now - outcome.timestamp.getTime()) / (1000 * 60 * 60 * 24);
      const weight = Math.exp(-ageInDays / 30); // Exponential decay over 30 days

      weightedEffectiveness += outcome.outcome.effectiveness * weight;
      totalWeight += weight;
    }

    const calculatedEffectiveness = totalWeight > 0 ? weightedEffectiveness / totalWeight : 0.5;

    // Combine with card's current effectiveness (70% calculated, 30% stored)
    return calculatedEffectiveness * 0.7 + (card.effectiveness || 0.5) * 0.3;
  }

  /**
   * Generate usage statistics for a card
   */
  private generateUsageStatistics(
    usageOutcomes: CardUsageOutcome[],
  ): EffectivenessEvaluation['usageStats'] {
    if (usageOutcomes.length === 0) {
      return {
        totalUsages: 0,
        recentUsages: 0,
        successfulUsages: 0,
        failedUsages: 0,
        avgImpact: 0,
      };
    }

    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const recentOutcomes = usageOutcomes.filter(
      (outcome) => outcome.timestamp.getTime() >= thirtyDaysAgo,
    );

    const successfulUsages = usageOutcomes.filter((outcome) => outcome.outcome.success).length;
    const avgImpact =
      usageOutcomes.reduce((sum, outcome) => {
        return (
          sum +
          (outcome.impact.qualityImprovement +
            outcome.impact.performanceGain +
            outcome.impact.learningValue) /
            3
        );
      }, 0) / usageOutcomes.length;

    return {
      totalUsages: usageOutcomes.length,
      recentUsages: recentOutcomes.length,
      successfulUsages,
      failedUsages: usageOutcomes.length - successfulUsages,
      avgImpact,
    };
  }

  /**
   * Calculate performance metrics based on usage outcomes
   */
  private calculatePerformanceMetrics(
    usageOutcomes: CardUsageOutcome[],
  ): EffectivenessEvaluation['performanceMetrics'] {
    if (usageOutcomes.length === 0) {
      return {
        avgJobDuration: 0,
        avgQualityImprovement: 0,
        avgLearningValue: 0,
        userSatisfaction: 0,
      };
    }

    const avgJobDuration =
      usageOutcomes.reduce((sum, outcome) => sum + outcome.outcome.timeToApply, 0) /
      usageOutcomes.length;

    const avgQualityImprovement =
      usageOutcomes.reduce((sum, outcome) => sum + outcome.impact.qualityImprovement, 0) /
      usageOutcomes.length;

    const avgLearningValue =
      usageOutcomes.reduce((sum, outcome) => sum + outcome.impact.learningValue, 0) /
      usageOutcomes.length;

    const userSatisfaction =
      usageOutcomes.reduce((sum, outcome) => sum + outcome.outcome.userSatisfaction, 0) /
      usageOutcomes.length;

    return {
      avgJobDuration,
      avgQualityImprovement,
      avgLearningValue,
      userSatisfaction,
    };
  }

  /**
   * Analyze context effectiveness to understand where the card works best/worst
   */
  private analyzeContextEffectiveness(
    usageOutcomes: CardUsageOutcome[],
  ): EffectivenessEvaluation['contextEffectiveness'] {
    const contextPerformance = new Map<string, { effectiveness: number; usage: number }>();

    // Group by context characteristics
    for (const outcome of usageOutcomes) {
      const contextKey = `${outcome.context.agentType}|${outcome.context.jobCategory}|${outcome.context.complexity}`;

      if (!contextPerformance.has(contextKey)) {
        contextPerformance.set(contextKey, { effectiveness: 0, usage: 0 });
      }

      const perf = contextPerformance.get(contextKey);
      perf.effectiveness =
        (perf.effectiveness * perf.usage + outcome.outcome.effectiveness) / (perf.usage + 1);
      perf.usage++;
    }

    // Sort contexts by effectiveness
    const sortedContexts = Array.from(contextPerformance.entries())
      .map(([context, perf]) => ({
        context,
        effectiveness: perf.effectiveness,
        usage: perf.usage,
      }))
      .sort((a, b) => b.effectiveness - a.effectiveness);

    const midpoint = Math.ceil(sortedContexts.length / 2);

    return {
      bestContexts: sortedContexts.slice(0, midpoint),
      worstContexts: sortedContexts.slice(midpoint).reverse(),
    };
  }

  /**
   * Perform trend analysis on card effectiveness over time
   */
  private performTrendAnalysis(
    cardId: string,
    usageOutcomes: CardUsageOutcome[],
  ): EffectivenessEvaluation['trendAnalysis'] {
    if (usageOutcomes.length < 5) {
      return {
        trend: 'stable',
        changeRate: 0,
        confidenceInterval: 0.5,
      };
    }

    // Sort outcomes by timestamp
    const sortedOutcomes = [...usageOutcomes].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );

    // Calculate effectiveness trend using linear regression
    const n = sortedOutcomes.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = sortedOutcomes.map((outcome) => outcome.outcome.effectiveness);

    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
    const sumXX = x.reduce((sum, val) => sum + val * val, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

    // Determine trend direction
    let trend: 'improving' | 'declining' | 'stable';
    if (Math.abs(slope) < 0.01) {
      trend = 'stable';
    } else if (slope > 0) {
      trend = 'improving';
    } else {
      trend = 'declining';
    }

    // Calculate confidence interval based on data spread
    const meanY = sumY / n;
    const variance = y.reduce((sum, val) => sum + Math.pow(val - meanY, 2), 0) / n;
    const confidenceInterval = Math.max(0.1, Math.min(1 - variance, 0.9));

    return {
      trend,
      changeRate: slope,
      confidenceInterval,
    };
  }

  /**
   * Generate recommendation for card promotion/demotion
   */
  private generateRecommendation(
    currentEffectiveness: number,
    usageStats: EffectivenessEvaluation['usageStats'],
    performanceMetrics: EffectivenessEvaluation['performanceMetrics'],
    trendAnalysis: EffectivenessEvaluation['trendAnalysis'],
  ): { recommendation: EffectivenessEvaluation['recommendation']; reasoning: string[] } {
    const reasoning: string[] = [];

    // Check promotion criteria
    const promotionScore = this.calculatePromotionScore(
      currentEffectiveness,
      usageStats,
      performanceMetrics,
      trendAnalysis,
    );

    if (promotionScore >= this.config.promotionThreshold) {
      reasoning.push(`High effectiveness score: ${currentEffectiveness.toFixed(2)}`);
      reasoning.push(
        `Strong usage pattern: ${usageStats.totalUsages} total uses, ${usageStats.successfulUsages} successful`,
      );

      if (trendAnalysis.trend === 'improving') {
        reasoning.push('Improving effectiveness trend');
      }

      if (performanceMetrics.userSatisfaction > 0.8) {
        reasoning.push('High user satisfaction');
      }

      return { recommendation: 'promote', reasoning };
    }

    // Check demotion criteria
    if (currentEffectiveness < this.config.demotionThreshold) {
      reasoning.push(`Low effectiveness score: ${currentEffectiveness.toFixed(2)}`);

      if (trendAnalysis.trend === 'declining') {
        reasoning.push('Declining effectiveness trend');
      }

      if (usageStats.failedUsages > usageStats.successfulUsages) {
        reasoning.push('More failed than successful uses');
      }

      if (performanceMetrics.userSatisfaction < 0.4) {
        reasoning.push('Low user satisfaction');
      }

      return { recommendation: 'demote', reasoning };
    }

    // Check retirement criteria
    if (
      usageStats.totalUsages > 20 &&
      currentEffectiveness < 0.3 &&
      usageStats.recentUsages === 0
    ) {
      reasoning.push('Very low effectiveness with no recent usage');
      return { recommendation: 'retire', reasoning };
    }

    // Default to maintain
    reasoning.push('Card meets baseline requirements but no significant change needed');
    return { recommendation: 'maintain', reasoning };
  }

  /**
   * Calculate promotion score based on multiple factors
   */
  private calculatePromotionScore(
    effectiveness: number,
    usageStats: EffectivenessEvaluation['usageStats'],
    performanceMetrics: EffectivenessEvaluation['performanceMetrics'],
    trendAnalysis: EffectivenessEvaluation['trendAnalysis'],
  ): number {
    let score = 0;

    // Effectiveness score (40% weight)
    score += effectiveness * 0.4;

    // Usage success rate (25% weight)
    const successRate =
      usageStats.totalUsages > 0 ? usageStats.successfulUsages / usageStats.totalUsages : 0.5;
    score += successRate * 0.25;

    // Impact score (20% weight)
    score += usageStats.avgImpact * 0.2;

    // User satisfaction (10% weight)
    score += performanceMetrics.userSatisfaction * 0.1;

    // Trend bonus/penalty (5% weight)
    const trendMultiplier =
      trendAnalysis.trend === 'improving' ? 1.1 : trendAnalysis.trend === 'declining' ? 0.9 : 1.0;
    score *= trendMultiplier;

    return Math.min(score, 1.0);
  }

  /**
   * Run promotion/demotion process for all cards
   */
  async promoteDemoteCards(): Promise<PromotionDemotionResult> {
    const startTime = performance.now();

    try {
      // Get all knowledge cards
      const allCards = await this.getAllKnowledgeCards();

      const result: PromotionDemotionResult = {
        timestamp: new Date(),
        promoted: [],
        demoted: [],
        retired: [],
        stats: {
          totalEvaluated: allCards.length,
          promotedCount: 0,
          demotedCount: 0,
          retiredCount: 0,
          maintainedCount: 0,
        },
        expectedImpact: {
          qualityImprovement: 0,
          performanceImprovement: 0,
          learningEfficiencyGain: 0,
        },
      };

      // Evaluate each card
      for (const card of allCards) {
        try {
          const evaluation = await this.evaluateCardEffectiveness(card.id);

          switch (evaluation.recommendation) {
            case 'promote':
              const promoted = await this.promoteCard(card, evaluation);
              result.promoted.push(promoted);
              result.stats.promotedCount++;
              break;

            case 'demote':
              const demoted = await this.demoteCard(card, evaluation);
              result.demoted.push(demoted);
              result.stats.demotedCount++;
              break;

            case 'retire':
              const retired = await this.retireCard(card, evaluation);
              result.retired.push(retired);
              result.stats.retiredCount++;
              break;

            case 'maintain':
            default:
              result.stats.maintainedCount++;
              break;
          }
        } catch (cardError) {
          enhancedLogger.warn('Failed to evaluate card for promotion/demotion', {
            cardId: card.id,
            error: cardError instanceof Error ? cardError.message : 'Unknown error',
          });
        }
      }

      // Calculate expected impact
      result.expectedImpact = this.calculateExpectedImpact(result);

      // Update tracking
      this.performanceTracker.promotionsExecuted += result.stats.promotedCount;
      this.performanceTracker.demotionsExecuted += result.stats.demotedCount;
      this.lastPromotionRun = new Date();

      // Save promotion data
      await this.savePromotionData();

      const duration = performance.now() - startTime;
      enhancedLogger.info('Promotion/demotion process completed', {
        duration,
        totalEvaluated: result.stats.totalEvaluated,
        promoted: result.stats.promotedCount,
        demoted: result.stats.demotedCount,
        retired: result.stats.retiredCount,
        maintained: result.stats.maintainedCount,
      });

      return result;
    } catch (error) {
      enhancedLogger.error('Failed to run promotion/demotion process', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Track card usage outcome for effectiveness calculation
   */
  async trackCardUsageOutcome(
    cardId: string,
    jobId: string,
    outcome: CardUsageOutcome,
  ): Promise<void> {
    try {
      if (!this.usageOutcomes.has(cardId)) {
        this.usageOutcomes.set(cardId, []);
      }

      this.usageOutcomes.get(cardId).push(outcome);

      // Keep only last 1000 outcomes per card to prevent memory issues
      const outcomes = this.usageOutcomes.get(cardId);
      if (outcomes.length > 1000) {
        this.usageOutcomes.set(cardId, outcomes.slice(-1000));
      }

      // Update card effectiveness in knowledge manager
      await this.knowledgeManager.recordUsage(cardId, jobId, {
        issueId: jobId,
        success: outcome.outcome.success,
        metrics: {
          timeToResolution: outcome.outcome.timeToApply,
          codeQuality: outcome.impact.qualityImprovement,
          errorReduction: outcome.outcome.relevance,
        },
        timestamp: outcome.timestamp,
      });

      enhancedLogger.debug('Card usage outcome tracked', {
        cardId,
        jobId,
        success: outcome.outcome.success,
        effectiveness: outcome.outcome.effectiveness,
        relevance: outcome.outcome.relevance,
      });
    } catch (error) {
      enhancedLogger.error('Failed to track card usage outcome', undefined, {
        cardId,
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get promotion candidates based on evaluation criteria
   */
  async getPromotionCandidates(): Promise<PromotionCandidate[]> {
    try {
      const allCards = await this.getAllKnowledgeCards();
      const candidates: PromotionCandidate[] = [];

      for (const card of allCards) {
        const evaluation = await this.evaluateCardEffectiveness(card.id);

        if (evaluation.recommendation === 'promote') {
          const promotionScore = this.calculatePromotionScore(
            evaluation.currentEffectiveness,
            evaluation.usageStats,
            evaluation.performanceMetrics,
            evaluation.trendAnalysis,
          );

          candidates.push({
            cardId: card.id,
            title: card.title,
            currentLevel: this.getCurrentLevel(card),
            suggestedLevel: this.getSuggestedLevel(card, 'promote'),
            score: promotionScore,
            reasons: evaluation.reasoning,
            expectedImpact: evaluation.currentEffectiveness,
            confidence: evaluation.trendAnalysis.confidenceInterval,
          });
        }
      }

      return candidates.sort((a, b) => b.score - a.score);
    } catch (error) {
      enhancedLogger.error('Failed to get promotion candidates', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get demotion candidates based on evaluation criteria
   */
  async getDemotionCandidates(): Promise<DemotionCandidate[]> {
    try {
      const allCards = await this.getAllKnowledgeCards();
      const candidates: DemotionCandidate[] = [];

      for (const card of allCards) {
        const evaluation = await this.evaluateCardEffectiveness(card.id);

        if (evaluation.recommendation === 'demote') {
          const demotionScore = 1 - evaluation.currentEffectiveness; // Higher score = more likely to demote

          candidates.push({
            cardId: card.id,
            title: card.title,
            currentLevel: this.getCurrentLevel(card),
            suggestedLevel: this.getSuggestedLevel(card, 'demote'),
            score: demotionScore,
            reasons: evaluation.reasoning,
            alternatives: await this.findAlternativeCards(card),
            confidence: evaluation.trendAnalysis.confidenceInterval,
          });
        }
      }

      return candidates.sort((a, b) => b.score - a.score);
    } catch (error) {
      enhancedLogger.error('Failed to get demotion candidates', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Promote a knowledge card
   */
  private async promoteCard(
    card: KnowledgeCard,
    evaluation: EffectivenessEvaluation,
  ): Promise<PromotionDemotionResult['promoted'][0]> {
    const currentLevel = this.getCurrentLevel(card);
    const newLevel = this.getSuggestedLevel(card, 'promote');

    // Update card with higher effectiveness and priority
    await this.knowledgeManager.updateCard(card.id, {
      effectiveness: Math.min(evaluation.currentEffectiveness * 1.1, 1.0),
      metadata: {
        ...card.metadata,
        scope: newLevel.includes('global') ? 'global' : 'project',
      },
      tags: [...card.tags, 'high-effectiveness'].filter(
        (tag, index, arr) => arr.indexOf(tag) === index,
      ),
    });

    return {
      cardId: card.id,
      fromLevel: currentLevel,
      toLevel: newLevel,
      reason: evaluation.reasoning.join('; '),
    };
  }

  /**
   * Demote a knowledge card
   */
  private async demoteCard(
    card: KnowledgeCard,
    evaluation: EffectivenessEvaluation,
  ): Promise<PromotionDemotionResult['demoted'][0]> {
    const currentLevel = this.getCurrentLevel(card);
    const newLevel = this.getSuggestedLevel(card, 'demote');

    // Update card with lower effectiveness
    await this.knowledgeManager.updateCard(card.id, {
      effectiveness: Math.max(evaluation.currentEffectiveness * 0.9, 0.1),
      metadata: {
        ...card.metadata,
        scope: 'project', // Demote to project level
      },
      tags: card.tags.filter((tag) => tag !== 'high-effectiveness'),
    });

    return {
      cardId: card.id,
      fromLevel: currentLevel,
      toLevel: newLevel,
      reason: evaluation.reasoning.join('; '),
    };
  }

  /**
   * Retire a knowledge card
   */
  private async retireCard(
    card: KnowledgeCard,
    evaluation: EffectivenessEvaluation,
  ): Promise<PromotionDemotionResult['retired'][0]> {
    // Archive the card
    const archivePath = join(process.cwd(), '.ff2', 'archived-cards', `${card.id}.json`);

    // Ensure archive directory exists
    await fs.mkdir(join(process.cwd(), '.ff2', 'archived-cards'), { recursive: true });

    // Save card data
    await fs.writeFile(archivePath, JSON.stringify(card, null, 2));

    // Remove from active knowledge base
    await this.knowledgeManager.deleteCard(card.id);

    return {
      cardId: card.id,
      reason: evaluation.reasoning.join('; '),
      archiveLocation: archivePath,
    };
  }

  /**
   * Get current level of a card (simplified implementation)
   */
  private getCurrentLevel(card: KnowledgeCard): string {
    if (card.metadata.scope === 'global') {
      return card.effectiveness > 0.8 ? 'global-expert' : 'global-standard';
    }
    return card.effectiveness > 0.7 ? 'project-expert' : 'project-standard';
  }

  /**
   * Get suggested level for promotion/demotion
   */
  private getSuggestedLevel(card: KnowledgeCard, action: 'promote' | 'demote'): string {
    const currentLevel = this.getCurrentLevel(card);

    if (action === 'promote') {
      switch (currentLevel) {
        case 'project-standard':
          return 'project-expert';
        case 'project-expert':
          return 'global-standard';
        case 'global-standard':
          return 'global-expert';
        default:
          return currentLevel;
      }
    } else {
      switch (currentLevel) {
        case 'global-expert':
          return 'global-standard';
        case 'global-standard':
          return 'project-expert';
        case 'project-expert':
          return 'project-standard';
        default:
          return currentLevel;
      }
    }
  }

  /**
   * Find alternative cards for demotion candidates
   */
  private async findAlternativeCards(card: KnowledgeCard): Promise<string[]> {
    try {
      // Search for similar cards with higher effectiveness
      const searchResults = await this.knowledgeManager.searchCards({
        text: card.content.substring(0, 100), // First 100 chars for similarity
        filters: {
          type: [card.type],
          category: [card.category],
          minEffectiveness: card.effectiveness + 0.1,
        },
        limit: 3,
      });

      return searchResults.map((result) => result.card.title);
    } catch (error) {
      enhancedLogger.warn('Failed to find alternative cards', {
        cardId: card.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Calculate expected impact of promotions/demotions
   */
  private calculateExpectedImpact(
    result: PromotionDemotionResult,
  ): PromotionDemotionResult['expectedImpact'] {
    // Simplified calculation - in full implementation, this would be more sophisticated
    const totalPromotions = result.stats.promotedCount;
    const totalDemotions = result.stats.demotedCount;
    const totalRetirements = result.stats.retiredCount;

    return {
      qualityImprovement:
        (totalPromotions * 0.1 - totalDemotions * 0.05) / Math.max(result.stats.totalEvaluated, 1),
      performanceImprovement:
        (totalPromotions * 0.08 - totalDemotions * 0.03) / Math.max(result.stats.totalEvaluated, 1),
      learningEfficiencyGain:
        (totalPromotions * 0.12 - totalRetirements * 0.02) /
        Math.max(result.stats.totalEvaluated, 1),
    };
  }

  /**
   * Get all knowledge cards (helper method)
   */
  private async getAllKnowledgeCards(): Promise<KnowledgeCard[]> {
    try {
      // Get stats to determine how many cards we have
      const stats = await this.knowledgeManager.getStats();

      // Search for all cards (using empty query with high limit)
      const searchResults = await this.knowledgeManager.searchCards({
        text: '',
        limit: stats.totalCards,
      });

      return searchResults.map((result) => result.card);
    } catch (error) {
      enhancedLogger.error('Failed to get all knowledge cards', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Update evaluation performance metrics
   */
  private updateEvaluationMetrics(duration: number): void {
    this.performanceTracker.evaluationsRun++;
    this.performanceTracker.totalEvaluationTime += duration;
    this.performanceTracker.avgEvaluationTime =
      this.performanceTracker.totalEvaluationTime / this.performanceTracker.evaluationsRun;
    this.performanceTracker.lastRun = new Date();
  }

  /**
   * Load promotion data from storage
   */
  private async loadPromotionData(): Promise<void> {
    try {
      const dataPath = join(process.cwd(), '.ff2', 'promotion-data.json');

      try {
        const content = await fs.readFile(dataPath, 'utf8');
        const data = JSON.parse(content);

        // Load usage outcomes
        if (data.usageOutcomes) {
          this.usageOutcomes = new Map();
          for (const [cardId, outcomes] of Object.entries(data.usageOutcomes)) {
            this.usageOutcomes.set(cardId, outcomes as CardUsageOutcome[]);
          }
        }

        // Load evaluation history
        if (data.evaluationHistory) {
          this.evaluationHistory = new Map();
          for (const [cardId, history] of Object.entries(data.evaluationHistory)) {
            this.evaluationHistory.set(cardId, history as EffectivenessEvaluation[]);
          }
        }

        // Load last promotion run
        if (data.lastPromotionRun) {
          this.lastPromotionRun = new Date(data.lastPromotionRun);
        }
      } catch (readError) {
        // File doesn't exist or is invalid, start fresh
        enhancedLogger.info('No existing promotion data found, starting fresh');
      }
    } catch (error) {
      enhancedLogger.error('Failed to load promotion data', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Save promotion data to storage
   */
  private async savePromotionData(): Promise<void> {
    try {
      const dataPath = join(process.cwd(), '.ff2', 'promotion-data.json');

      const data = {
        usageOutcomes: Object.fromEntries(this.usageOutcomes),
        evaluationHistory: Object.fromEntries(this.evaluationHistory),
        lastPromotionRun: this.lastPromotionRun?.toISOString(),
        lastSaved: new Date().toISOString(),
      };

      await fs.writeFile(dataPath, JSON.stringify(data, null, 2));
    } catch (error) {
      enhancedLogger.error('Failed to save promotion data', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): {
    evaluationsRun: number;
    avgEvaluationTime: number;
    promotionsExecuted: number;
    demotionsExecuted: number;
    lastPromotionRun: Date | null;
    trackedCards: number;
    lastRun: Date;
  } {
    return {
      ...this.performanceTracker,
      lastPromotionRun: this.lastPromotionRun,
      trackedCards: this.usageOutcomes.size,
    };
  }

  /**
   * Get evaluation history for a card
   */
  getCardEvaluationHistory(cardId: string): EffectivenessEvaluation[] {
    return this.evaluationHistory.get(cardId) || [];
  }

  /**
   * Get usage outcomes for a card
   */
  getCardUsageOutcomes(cardId: string): CardUsageOutcome[] {
    return this.usageOutcomes.get(cardId) || [];
  }
}
