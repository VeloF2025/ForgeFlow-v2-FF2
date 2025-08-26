// Learning Analytics - Effectiveness measurement and trend tracking
// Real-time learning effectiveness analytics with predictive insights

import type {
  LearningAnalytics,
  EffectivenessReport,
  LearningTrends,
  LearningInsights,
  ProgressMetrics,
  LearningRecommendations,
  TrendIndicator,
  JobOutcome,
  TimeRange,
  EvaluationConfig,
} from './types';
import type { JobOutcomeTracker } from './job-outcome-tracker';
import type { MLPatternAnalysisEngine } from './pattern-analysis-engine';
import type { AutomatedKnowledgePromotionSystem } from './knowledge-promotion-system';
import { enhancedLogger } from '../utils/enhanced-logger';
import { promises as fs } from 'fs';
import { join } from 'path';

export class AdvancedLearningAnalytics implements LearningAnalytics {
  private config: EvaluationConfig;
  private jobTracker: JobOutcomeTracker;
  private patternEngine: MLPatternAnalysisEngine;
  private promotionSystem: AutomatedKnowledgePromotionSystem;

  private analyticsCache = new Map<string, { data: any; timestamp: Date; ttl: number }>();
  private metricsHistory: Array<{ timestamp: Date; metrics: any }> = [];

  private performanceTracker = {
    reportsGenerated: 0,
    totalAnalysisTime: 0,
    avgAnalysisTime: 0,
    cachehitRate: 0,
    lastAnalysis: new Date(),
  };

  constructor(
    config: EvaluationConfig,
    jobTracker: JobOutcomeTracker,
    patternEngine: MLPatternAnalysisEngine,
    promotionSystem: AutomatedKnowledgePromotionSystem,
  ) {
    this.config = config;
    this.jobTracker = jobTracker;
    this.patternEngine = patternEngine;
    this.promotionSystem = promotionSystem;
    this.initializeAnalytics();
  }

  /**
   * Initialize learning analytics system
   */
  private async initializeAnalytics(): Promise<void> {
    try {
      // Load historical metrics
      await this.loadMetricsHistory();

      enhancedLogger.info('Learning analytics initialized', {
        cacheSize: this.analyticsCache.size,
        metricsHistory: this.metricsHistory.length,
        analyticsInterval: this.config.analysisInterval,
      });
    } catch (error) {
      enhancedLogger.error('Failed to initialize learning analytics', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Calculate effectiveness metrics for a given time range
   */
  async calculateEffectiveness(timeRange: TimeRange): Promise<EffectivenessReport> {
    const startTime = performance.now();
    const cacheKey = `effectiveness_${timeRange.start.toISOString()}_${timeRange.end.toISOString()}`;

    try {
      // Check cache first
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        this.performanceTracker.cachehitRate++;
        return cached;
      }

      // Get job outcomes for the time range
      const jobs = await this.jobTracker.getJobOutcomes({
        timeRange,
        limit: 10000, // Large limit for comprehensive analysis
      });

      if (jobs.length === 0) {
        throw new Error('No job outcomes found for the specified time range');
      }

      // Calculate overall effectiveness score
      const overallScore = this.calculateOverallEffectiveness(jobs);

      // Calculate learning metrics
      const learningMetrics = this.calculateLearningMetrics(jobs);

      // Analyze agent effectiveness
      const agentEffectiveness = await this.analyzeAgentEffectiveness(jobs);

      // Analyze pattern effectiveness
      const patternEffectiveness = await this.analyzePatternEffectiveness(jobs);

      // Analyze knowledge effectiveness
      const knowledgeEffectiveness = await this.analyzeKnowledgeEffectiveness(jobs);

      const report: EffectivenessReport = {
        timeRange,
        timestamp: new Date(),
        overallScore,
        learningMetrics,
        agentEffectiveness,
        patternEffectiveness,
        knowledgeEffectiveness,
      };

      // Cache the result
      this.setCache(cacheKey, report, 60 * 60 * 1000); // 1 hour TTL

      // Update performance metrics
      const duration = performance.now() - startTime;
      this.updateAnalysisMetrics(duration);

      enhancedLogger.info('Effectiveness report generated', {
        timeRange,
        jobsAnalyzed: jobs.length,
        overallScore,
        duration,
      });

      return report;
    } catch (error) {
      enhancedLogger.error('Failed to calculate effectiveness', undefined, {
        timeRange,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Calculate overall learning effectiveness from job outcomes
   */
  private calculateOverallEffectiveness(jobs: JobOutcome[]): number {
    if (jobs.length === 0) return 0;

    let totalScore = 0;
    let weightSum = 0;

    for (const job of jobs) {
      // Weight based on job complexity and duration
      const complexityWeight = this.getComplexityWeight(job.metadata.complexity);
      const durationWeight = this.getDurationWeight(job.metadata.duration || 0);
      const weight = complexityWeight * durationWeight;

      // Calculate job effectiveness score
      const jobScore =
        job.quality.overallScore * 0.4 +
        job.learning.learningGenerated * 0.3 +
        job.learning.knowledgeReused * 0.2 +
        job.learning.adaptabilityShown * 0.1;

      totalScore += jobScore * weight;
      weightSum += weight;
    }

    return weightSum > 0 ? totalScore / weightSum : 0;
  }

  /**
   * Get complexity weight for scoring
   */
  private getComplexityWeight(complexity: string): number {
    const weights = {
      low: 0.5,
      medium: 1.0,
      high: 1.5,
      'very-high': 2.0,
    };
    return weights[complexity as keyof typeof weights] || 1.0;
  }

  /**
   * Get duration weight for scoring (longer jobs get more weight)
   */
  private getDurationWeight(duration: number): number {
    if (duration === 0) return 1.0;

    // Normalize to minutes and apply logarithmic scaling
    const minutes = duration / (1000 * 60);
    return Math.log(Math.max(minutes, 1)) / Math.log(60); // Base 60 (1 hour)
  }

  /**
   * Calculate learning-specific metrics
   */
  private calculateLearningMetrics(jobs: JobOutcome[]): EffectivenessReport['learningMetrics'] {
    if (jobs.length === 0) {
      return {
        knowledgeCreationRate: 0,
        knowledgeReuseRate: 0,
        adaptabilityScore: 0,
        improvementRate: 0,
      };
    }

    // Knowledge creation rate (new knowledge cards created per job)
    const totalKnowledgeCreated = jobs.reduce(
      (sum, job) => sum + job.learning.knowledgeImpact.cardsCreated,
      0,
    );
    const knowledgeCreationRate = totalKnowledgeCreated / jobs.length;

    // Knowledge reuse rate (existing knowledge cards used per job)
    const avgKnowledgeReuse =
      jobs.reduce((sum, job) => sum + job.learning.knowledgeReused, 0) / jobs.length;

    // Adaptability score (how well the system adapts to new situations)
    const avgAdaptability =
      jobs.reduce((sum, job) => sum + job.learning.adaptabilityShown, 0) / jobs.length;

    // Improvement rate (quality improvement over time)
    const improvementRate = this.calculateImprovementRate(jobs);

    return {
      knowledgeCreationRate,
      knowledgeReuseRate: avgKnowledgeReuse,
      adaptabilityScore: avgAdaptability,
      improvementRate,
    };
  }

  /**
   * Calculate improvement rate over time
   */
  private calculateImprovementRate(jobs: JobOutcome[]): number {
    if (jobs.length < 2) return 0;

    // Sort jobs by timestamp
    const sortedJobs = [...jobs].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Calculate quality trend using moving averages
    const windowSize = Math.min(10, Math.floor(sortedJobs.length / 4)); // Adaptive window
    if (windowSize < 2) return 0;

    const earlyAvg =
      sortedJobs.slice(0, windowSize).reduce((sum, job) => sum + job.quality.overallScore, 0) /
      windowSize;

    const lateAvg =
      sortedJobs.slice(-windowSize).reduce((sum, job) => sum + job.quality.overallScore, 0) /
      windowSize;

    return lateAvg - earlyAvg; // Positive = improvement, negative = decline
  }

  /**
   * Analyze agent effectiveness across all agents
   */
  private async analyzeAgentEffectiveness(
    jobs: JobOutcome[],
  ): Promise<EffectivenessReport['agentEffectiveness']> {
    const agentStats = new Map<
      string,
      {
        jobs: JobOutcome[];
        totalJobs: number;
        successfulJobs: number;
        avgQuality: number;
        avgLearning: number;
        strengths: Set<string>;
        weaknesses: Set<string>;
      }
    >();

    // Group jobs by agent types
    for (const job of jobs) {
      for (const agentType of job.metadata.agentTypes) {
        if (!agentStats.has(agentType)) {
          agentStats.set(agentType, {
            jobs: [],
            totalJobs: 0,
            successfulJobs: 0,
            avgQuality: 0,
            avgLearning: 0,
            strengths: new Set(),
            weaknesses: new Set(),
          });
        }

        const stats = agentStats.get(agentType);
        stats.jobs.push(job);
        stats.totalJobs++;
        if (job.success) stats.successfulJobs++;
      }
    }

    // Calculate effectiveness for each agent
    const agentEffectiveness: EffectivenessReport['agentEffectiveness'] = [];

    for (const [agentType, stats] of agentStats) {
      // Calculate metrics
      const successRate = stats.totalJobs > 0 ? stats.successfulJobs / stats.totalJobs : 0;
      const avgQuality =
        stats.jobs.reduce((sum, job) => sum + job.quality.overallScore, 0) / stats.jobs.length;
      const avgLearning =
        stats.jobs.reduce((sum, job) => sum + job.learning.learningGenerated, 0) /
        stats.jobs.length;

      // Calculate learning rate (improvement over time)
      const learningRate = this.calculateAgentLearningRate(stats.jobs);

      // Calculate overall effectiveness
      const effectiveness = successRate * 0.4 + avgQuality * 0.4 + avgLearning * 0.2;

      // Identify strengths and weaknesses
      const { strengths, weaknesses } = this.identifyAgentStrengthsWeaknesses(stats.jobs);

      agentEffectiveness.push({
        agentType,
        effectiveness,
        learningRate,
        strengths,
        weaknesses,
      });
    }

    return agentEffectiveness.sort((a, b) => b.effectiveness - a.effectiveness);
  }

  /**
   * Calculate learning rate for a specific agent
   */
  private calculateAgentLearningRate(jobs: JobOutcome[]): number {
    if (jobs.length < 5) return 0; // Need minimum jobs for trend analysis

    const sortedJobs = [...jobs].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Calculate improvement in various metrics over time
    const qualityTrend = this.calculateMetricTrend(
      sortedJobs.map((job) => job.quality.overallScore),
    );
    const learningTrend = this.calculateMetricTrend(
      sortedJobs.map((job) => job.learning.learningGenerated),
    );
    const adaptabilityTrend = this.calculateMetricTrend(
      sortedJobs.map((job) => job.learning.adaptabilityShown),
    );

    // Combine trends with weights
    return qualityTrend * 0.5 + learningTrend * 0.3 + adaptabilityTrend * 0.2;
  }

  /**
   * Calculate trend for a series of metrics using linear regression
   */
  private calculateMetricTrend(values: number[]): number {
    if (values.length < 2) return 0;

    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = values;

    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
    const sumXX = x.reduce((sum, val) => sum + val * val, 0);

    const denominator = n * sumXX - sumX * sumX;
    if (denominator === 0) return 0;

    return (n * sumXY - sumX * sumY) / denominator;
  }

  /**
   * Identify agent strengths and weaknesses
   */
  private identifyAgentStrengthsWeaknesses(jobs: JobOutcome[]): {
    strengths: string[];
    weaknesses: string[];
  } {
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    if (jobs.length === 0) return { strengths, weaknesses };

    // Analyze different aspects
    const avgQuality = jobs.reduce((sum, job) => sum + job.quality.overallScore, 0) / jobs.length;
    const avgCodeQuality =
      jobs.reduce((sum, job) => sum + job.quality.components.codeQuality, 0) / jobs.length;
    const avgTestQuality =
      jobs.reduce((sum, job) => sum + job.quality.components.testQuality, 0) / jobs.length;
    const avgSecurity =
      jobs.reduce((sum, job) => sum + job.quality.components.security, 0) / jobs.length;
    const avgPerformance =
      jobs.reduce((sum, job) => sum + job.quality.components.performance, 0) / jobs.length;
    const avgLearning =
      jobs.reduce((sum, job) => sum + job.learning.learningGenerated, 0) / jobs.length;
    const avgAdaptability =
      jobs.reduce((sum, job) => sum + job.learning.adaptabilityShown, 0) / jobs.length;

    // Identify strengths (above 0.8)
    if (avgCodeQuality > 0.8) strengths.push('High code quality');
    if (avgTestQuality > 0.8) strengths.push('Excellent test coverage');
    if (avgSecurity > 0.8) strengths.push('Strong security practices');
    if (avgPerformance > 0.8) strengths.push('Performance optimization');
    if (avgLearning > 0.8) strengths.push('Effective knowledge creation');
    if (avgAdaptability > 0.8) strengths.push('High adaptability');

    // Identify weaknesses (below 0.5)
    if (avgCodeQuality < 0.5) weaknesses.push('Code quality issues');
    if (avgTestQuality < 0.5) weaknesses.push('Insufficient testing');
    if (avgSecurity < 0.5) weaknesses.push('Security vulnerabilities');
    if (avgPerformance < 0.5) weaknesses.push('Performance issues');
    if (avgLearning < 0.5) weaknesses.push('Limited knowledge creation');
    if (avgAdaptability < 0.5) weaknesses.push('Poor adaptability');

    return { strengths, weaknesses };
  }

  /**
   * Analyze pattern effectiveness
   */
  private async analyzePatternEffectiveness(
    jobs: JobOutcome[],
  ): Promise<EffectivenessReport['patternEffectiveness']> {
    const successPatterns = await this.patternEngine.identifySuccessPatterns(
      jobs.filter((j) => j.success),
    );
    const failurePatterns = await this.patternEngine.identifyFailurePatterns(
      jobs.filter((j) => !j.success),
    );

    // Analyze success pattern effectiveness
    const successPatternEffectiveness = successPatterns.map((pattern) => ({
      patternId: pattern.id,
      accuracy: pattern.indicators.avgSuccessRate,
      coverage: pattern.occurrences / jobs.length,
      impact: pattern.learningData.effectiveness,
    }));

    // Analyze failure pattern effectiveness
    const failurePatternEffectiveness = failurePatterns.map((pattern) => ({
      patternId: pattern.id,
      accuracy: pattern.characteristics.avgFailureRate,
      preventionRate: pattern.learningData.preventionSuccess,
      impact: pattern.confidence,
    }));

    return {
      successPatterns: successPatternEffectiveness,
      failurePatterns: failurePatternEffectiveness,
    };
  }

  /**
   * Analyze knowledge effectiveness
   */
  private async analyzeKnowledgeEffectiveness(
    jobs: JobOutcome[],
  ): Promise<EffectivenessReport['knowledgeEffectiveness']> {
    // Collect knowledge card usage data
    const cardUsage = new Map<
      string,
      {
        usageCount: number;
        successCount: number;
        avgEffectiveness: number;
        avgImpact: number;
        title: string;
      }
    >();

    for (const job of jobs) {
      for (const card of job.context.knowledgeCards) {
        if (!cardUsage.has(card.cardId)) {
          cardUsage.set(card.cardId, {
            usageCount: 0,
            successCount: 0,
            avgEffectiveness: 0,
            avgImpact: 0,
            title: card.title,
          });
        }

        const usage = cardUsage.get(card.cardId);
        usage.usageCount++;

        if (card.usageOutcome === 'success') {
          usage.successCount++;
        }

        // Update running averages
        usage.avgEffectiveness =
          (usage.avgEffectiveness * (usage.usageCount - 1) + card.effectiveness) / usage.usageCount;

        usage.avgImpact =
          (usage.avgImpact * (usage.usageCount - 1) + card.relevanceScore) / usage.usageCount;
      }
    }

    // Sort cards by effectiveness
    const sortedCards = Array.from(cardUsage.entries())
      .map(([cardId, usage]) => ({
        cardId,
        title: usage.title,
        effectiveness: usage.avgEffectiveness,
        impact: usage.avgImpact,
      }))
      .sort((a, b) => b.effectiveness - a.effectiveness);

    const topPerforming = sortedCards.slice(0, 10);
    const underPerforming = sortedCards.filter((card) => card.effectiveness < 0.4).slice(0, 10);

    // Analyze by category
    const categoryStats = new Map<string, { total: number; avgEffectiveness: number }>();

    for (const job of jobs) {
      for (const card of job.context.knowledgeCards) {
        // Simplified category extraction - in full implementation, would get from card metadata
        const category = card.title.split(':')[0] || 'general';

        if (!categoryStats.has(category)) {
          categoryStats.set(category, { total: 0, avgEffectiveness: 0 });
        }

        const stats = categoryStats.get(category);
        stats.avgEffectiveness =
          (stats.avgEffectiveness * stats.total + card.effectiveness) / (stats.total + 1);
        stats.total++;
      }
    }

    const categoryPerformance = Object.fromEntries(
      Array.from(categoryStats.entries()).map(([category, stats]) => [
        category,
        stats.avgEffectiveness,
      ]),
    );

    return {
      topPerformingCards: topPerforming,
      underPerformingCards: underPerforming.map((card) => ({
        cardId: card.cardId,
        title: card.title,
        effectiveness: card.effectiveness,
        issues:
          card.effectiveness < 0.2 ? ['Very low effectiveness'] : ['Below average effectiveness'],
      })),
      categoryPerformance,
    };
  }

  /**
   * Analyze learning trends over time
   */
  async analyzeLearningTrends(timeRange: TimeRange): Promise<LearningTrends> {
    const startTime = performance.now();

    try {
      // Get jobs for analysis
      const jobs = await this.jobTracker.getJobOutcomes({
        timeRange,
        limit: 10000,
      });

      if (jobs.length < 10) {
        throw new Error('Insufficient data for trend analysis');
      }

      // Calculate current and previous period metrics
      const periodLength = timeRange.end.getTime() - timeRange.start.getTime();
      const midpoint = new Date(timeRange.start.getTime() + periodLength / 2);

      const currentPeriodJobs = jobs.filter((job) => job.timestamp >= midpoint);
      const previousPeriodJobs = jobs.filter((job) => job.timestamp < midpoint);

      // Calculate trend indicators
      const trends = this.calculateTrendIndicators(currentPeriodJobs, previousPeriodJobs);

      // Perform detailed analysis
      const analysis = this.performDetailedTrendAnalysis(jobs, timeRange);

      // Generate predictions
      const predictions = this.generateTrendPredictions(jobs, trends);

      const learningTrends: LearningTrends = {
        timeRange,
        timestamp: new Date(),
        trends,
        analysis,
        predictions,
      };

      const duration = performance.now() - startTime;
      enhancedLogger.info('Learning trends analyzed', {
        timeRange,
        jobsAnalyzed: jobs.length,
        duration,
      });

      return learningTrends;
    } catch (error) {
      enhancedLogger.error('Failed to analyze learning trends', undefined, {
        timeRange,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Calculate trend indicators comparing current vs previous period
   */
  private calculateTrendIndicators(
    currentJobs: JobOutcome[],
    previousJobs: JobOutcome[],
  ): LearningTrends['trends'] {
    const currentMetrics = this.calculatePeriodMetrics(currentJobs);
    const previousMetrics = this.calculatePeriodMetrics(previousJobs);

    return {
      overallLearning: this.createTrendIndicator(
        currentMetrics.avgLearning,
        previousMetrics.avgLearning,
      ),
      knowledgeCreation: this.createTrendIndicator(
        currentMetrics.avgKnowledgeCreated,
        previousMetrics.avgKnowledgeCreated,
      ),
      knowledgeReuse: this.createTrendIndicator(
        currentMetrics.avgKnowledgeReuse,
        previousMetrics.avgKnowledgeReuse,
      ),
      patternAccuracy: this.createTrendIndicator(
        currentMetrics.avgPatternAccuracy,
        previousMetrics.avgPatternAccuracy,
      ),
      jobSuccessRate: this.createTrendIndicator(
        currentMetrics.successRate,
        previousMetrics.successRate,
      ),
      averageJobQuality: this.createTrendIndicator(
        currentMetrics.avgQuality,
        previousMetrics.avgQuality,
      ),
    };
  }

  /**
   * Calculate metrics for a period of jobs
   */
  private calculatePeriodMetrics(jobs: JobOutcome[]): {
    avgLearning: number;
    avgKnowledgeCreated: number;
    avgKnowledgeReuse: number;
    avgPatternAccuracy: number;
    successRate: number;
    avgQuality: number;
  } {
    if (jobs.length === 0) {
      return {
        avgLearning: 0,
        avgKnowledgeCreated: 0,
        avgKnowledgeReuse: 0,
        avgPatternAccuracy: 0,
        successRate: 0,
        avgQuality: 0,
      };
    }

    return {
      avgLearning: jobs.reduce((sum, job) => sum + job.learning.learningGenerated, 0) / jobs.length,
      avgKnowledgeCreated:
        jobs.reduce((sum, job) => sum + job.learning.knowledgeImpact.cardsCreated, 0) / jobs.length,
      avgKnowledgeReuse:
        jobs.reduce((sum, job) => sum + job.learning.knowledgeReused, 0) / jobs.length,
      avgPatternAccuracy:
        jobs.reduce((sum, job) => sum + job.patterns.successPatterns.length, 0) / jobs.length,
      successRate: jobs.filter((job) => job.success).length / jobs.length,
      avgQuality: jobs.reduce((sum, job) => sum + job.quality.overallScore, 0) / jobs.length,
    };
  }

  /**
   * Create trend indicator from current and previous values
   */
  private createTrendIndicator(current: number, previous: number): TrendIndicator {
    if (previous === 0) {
      return {
        current,
        previous,
        change: 0,
        direction: 'stable',
        significance: 'low',
      };
    }

    const change = ((current - previous) / previous) * 100;
    const absChange = Math.abs(change);

    let direction: TrendIndicator['direction'];
    if (absChange < 2) {
      direction = 'stable';
    } else if (change > 0) {
      direction = 'up';
    } else {
      direction = 'down';
    }

    let significance: TrendIndicator['significance'];
    if (absChange > 10) {
      significance = 'high';
    } else if (absChange > 5) {
      significance = 'medium';
    } else {
      significance = 'low';
    }

    return {
      current,
      previous,
      change,
      direction,
      significance,
    };
  }

  /**
   * Perform detailed trend analysis
   */
  private performDetailedTrendAnalysis(
    jobs: JobOutcome[],
    timeRange: TimeRange,
  ): LearningTrends['analysis'] {
    // Divide time range into periods for comparison
    const periodCount = Math.min(8, Math.floor(jobs.length / 10)); // Max 8 periods, min 10 jobs per period
    const periodLength = (timeRange.end.getTime() - timeRange.start.getTime()) / periodCount;

    const periodComparison = [];

    for (let i = 0; i < periodCount; i++) {
      const periodStart = new Date(timeRange.start.getTime() + i * periodLength);
      const periodEnd = new Date(timeRange.start.getTime() + (i + 1) * periodLength);

      const periodJobs = jobs.filter(
        (job) => job.timestamp >= periodStart && job.timestamp < periodEnd,
      );

      if (periodJobs.length > 0) {
        const metrics = this.calculatePeriodMetrics(periodJobs);

        periodComparison.push({
          period: `Period ${i + 1}`,
          metrics: {
            jobCount: periodJobs.length,
            successRate: metrics.successRate,
            avgQuality: metrics.avgQuality,
            learningGenerated: metrics.avgLearning,
          },
        });
      }
    }

    // Generate trend explanations
    const trendExplanations = this.generateTrendExplanations(jobs);

    return {
      periodComparison,
      trendExplanations,
    };
  }

  /**
   * Generate explanations for observed trends
   */
  private generateTrendExplanations(
    jobs: JobOutcome[],
  ): LearningTrends['analysis']['trendExplanations'] {
    const explanations: LearningTrends['analysis']['trendExplanations'] = [];

    // Analyze quality trends
    const qualityTrend = this.calculateMetricTrend(jobs.map((job) => job.quality.overallScore));
    if (Math.abs(qualityTrend) > 0.01) {
      explanations.push({
        metric: 'Quality Score',
        trend: qualityTrend > 0 ? 'improving' : 'declining',
        explanation:
          qualityTrend > 0
            ? 'Quality gates and learning processes are showing positive impact'
            : 'Quality may be affected by increased complexity or technical debt',
        confidence: Math.min(Math.abs(qualityTrend) * 10, 0.9),
      });
    }

    // Analyze learning trends
    const learningTrend = this.calculateMetricTrend(
      jobs.map((job) => job.learning.learningGenerated),
    );
    if (Math.abs(learningTrend) > 0.01) {
      explanations.push({
        metric: 'Learning Generation',
        trend: learningTrend > 0 ? 'improving' : 'declining',
        explanation:
          learningTrend > 0
            ? 'System is becoming more effective at generating new knowledge'
            : 'Learning efficiency may be plateauing or facing diminishing returns',
        confidence: Math.min(Math.abs(learningTrend) * 8, 0.85),
      });
    }

    // Analyze success rate trends
    const successTrend = this.calculateMetricTrend(jobs.map((job) => (job.success ? 1 : 0)));
    if (Math.abs(successTrend) > 0.005) {
      explanations.push({
        metric: 'Success Rate',
        trend: successTrend > 0 ? 'improving' : 'declining',
        explanation:
          successTrend > 0
            ? 'Pattern recognition and knowledge application are improving outcomes'
            : 'Increasing complexity or new challenges may be impacting success rates',
        confidence: Math.min(Math.abs(successTrend) * 20, 0.95),
      });
    }

    return explanations;
  }

  /**
   * Generate predictions based on trends
   */
  private generateTrendPredictions(
    jobs: JobOutcome[],
    trends: LearningTrends['trends'],
  ): LearningTrends['predictions'] {
    // Calculate next period projections based on current trends
    const nextPeriodProjection = {
      successRate: Math.max(
        0,
        Math.min(1, trends.jobSuccessRate.current + trends.jobSuccessRate.change / 100),
      ),
      qualityScore: Math.max(
        0,
        Math.min(1, trends.averageJobQuality.current + trends.averageJobQuality.change / 100),
      ),
      learningRate: Math.max(
        0,
        Math.min(1, trends.overallLearning.current + trends.overallLearning.change / 100),
      ),
      confidence: this.calculatePredictionConfidence(trends),
    };

    // Generate long-term trend projections
    const longTermTrends = [
      {
        metric: 'Success Rate',
        projected6Month: this.projectLongTerm(trends.jobSuccessRate, 6),
        projected1Year: this.projectLongTerm(trends.jobSuccessRate, 12),
        confidence: trends.jobSuccessRate.significance === 'high' ? 0.7 : 0.5,
      },
      {
        metric: 'Quality Score',
        projected6Month: this.projectLongTerm(trends.averageJobQuality, 6),
        projected1Year: this.projectLongTerm(trends.averageJobQuality, 12),
        confidence: trends.averageJobQuality.significance === 'high' ? 0.8 : 0.6,
      },
      {
        metric: 'Learning Rate',
        projected6Month: this.projectLongTerm(trends.overallLearning, 6),
        projected1Year: this.projectLongTerm(trends.overallLearning, 12),
        confidence: trends.overallLearning.significance === 'high' ? 0.6 : 0.4,
      },
    ];

    return {
      nextPeriodProjection,
      longTermTrends,
    };
  }

  /**
   * Calculate prediction confidence based on trend stability
   */
  private calculatePredictionConfidence(trends: LearningTrends['trends']): number {
    const trendValues = Object.values(trends);
    let confidenceSum = 0;

    for (const trend of trendValues) {
      let trendConfidence = 0.5; // Base confidence

      // Higher confidence for high significance trends
      if (trend.significance === 'high') {
        trendConfidence += 0.3;
      } else if (trend.significance === 'medium') {
        trendConfidence += 0.2;
      }

      // Lower confidence for very volatile trends
      if (Math.abs(trend.change) > 50) {
        trendConfidence -= 0.2;
      }

      confidenceSum += Math.max(0.1, Math.min(0.9, trendConfidence));
    }

    return confidenceSum / trendValues.length;
  }

  /**
   * Project long-term trend
   */
  private projectLongTerm(trend: TrendIndicator, periods: number): number {
    const monthlyChange = trend.change / 100 / periods; // Assuming monthly periods
    const projected = trend.current * Math.pow(1 + monthlyChange, periods);

    return Math.max(0, Math.min(1, projected));
  }

  /**
   * Generate comprehensive insights from job outcomes
   */
  async generateInsights(jobs: JobOutcome[]): Promise<LearningInsights> {
    try {
      // Identify key insights
      const insights = this.identifyKeyInsights(jobs);

      // Analyze success factors
      const successFactors = this.analyzeSuccessFactors(jobs);

      // Identify learning gaps
      const learningGaps = this.identifyLearningGaps(jobs);

      // Find optimization opportunities
      const optimizations = this.identifyOptimizationOpportunities(jobs);

      // Analyze knowledge distribution
      const knowledgeDistribution = this.analyzeKnowledgeDistribution(jobs);

      const learningInsights: LearningInsights = {
        timestamp: new Date(),
        insights,
        successFactors,
        learningGaps,
        optimizations,
        knowledgeDistribution,
      };

      enhancedLogger.info('Learning insights generated', {
        totalInsights: insights.length,
        successFactors: successFactors.length,
        learningGaps: learningGaps.length,
        optimizations: optimizations.length,
      });

      return learningInsights;
    } catch (error) {
      enhancedLogger.error('Failed to generate learning insights', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Identify key insights from job patterns
   */
  private identifyKeyInsights(jobs: JobOutcome[]): LearningInsights['insights'] {
    const insights: LearningInsights['insights'] = [];

    // Success rate insight
    const successRate = jobs.filter((job) => job.success).length / jobs.length;
    if (successRate > 0.9) {
      insights.push({
        type: 'success_factor',
        title: 'Exceptional Success Rate',
        description: `System achieving ${(successRate * 100).toFixed(1)}% success rate`,
        evidence: [
          'High quality patterns',
          'Effective knowledge reuse',
          'Strong pattern recognition',
        ],
        confidence: 0.9,
        impact: 0.8,
        actionable: true,
      });
    } else if (successRate < 0.6) {
      insights.push({
        type: 'failure_factor',
        title: 'Low Success Rate Concern',
        description: `Success rate of ${(successRate * 100).toFixed(1)}% indicates systemic issues`,
        evidence: ['Pattern failures', 'Knowledge gaps', 'Quality issues'],
        confidence: 0.8,
        impact: 0.9,
        actionable: true,
      });
    }

    // Learning efficiency insight
    const avgLearning =
      jobs.reduce((sum, job) => sum + job.learning.learningGenerated, 0) / jobs.length;
    if (avgLearning > 0.8) {
      insights.push({
        type: 'learning_opportunity',
        title: 'High Learning Efficiency',
        description: 'System is effectively generating new knowledge from experiences',
        evidence: ['High knowledge creation', 'Pattern discovery', 'Adaptive behavior'],
        confidence: 0.85,
        impact: 0.7,
        actionable: false,
      });
    }

    // Quality trend insight
    const qualityTrend = this.calculateMetricTrend(jobs.map((job) => job.quality.overallScore));
    if (qualityTrend > 0.02) {
      insights.push({
        type: 'optimization',
        title: 'Quality Improvement Trend',
        description: 'Consistent quality improvements indicate effective learning',
        evidence: ['Upward quality trend', 'Better patterns', 'Knowledge application'],
        confidence: 0.75,
        impact: 0.8,
        actionable: true,
      });
    }

    return insights.sort((a, b) => b.confidence * b.impact - a.confidence * a.impact);
  }

  /**
   * Analyze factors that contribute to success
   */
  private analyzeSuccessFactors(jobs: JobOutcome[]): LearningInsights['successFactors'] {
    const successfulJobs = jobs.filter((job) => job.success);
    const failedJobs = jobs.filter((job) => !job.success);

    if (successfulJobs.length === 0) return [];

    const factors: LearningInsights['successFactors'] = [];

    // Knowledge reuse factor
    const successfulKnowledgeReuse =
      successfulJobs.reduce((sum, job) => sum + job.learning.knowledgeReused, 0) /
      successfulJobs.length;
    const failedKnowledgeReuse =
      failedJobs.length > 0
        ? failedJobs.reduce((sum, job) => sum + job.learning.knowledgeReused, 0) / failedJobs.length
        : 0;

    if (successfulKnowledgeReuse > failedKnowledgeReuse + 0.1) {
      factors.push({
        factor: 'Knowledge Reuse',
        correlation: successfulKnowledgeReuse - failedKnowledgeReuse,
        examples: [
          'Effective pattern matching',
          'Best practice application',
          'Historical lesson utilization',
        ],
        recommendations: [
          'Improve knowledge search',
          'Better pattern recognition',
          'Knowledge accessibility',
        ],
      });
    }

    // Quality gates factor
    const successfulGatesRatio =
      successfulJobs.reduce((sum, job) => {
        return (
          sum + (job.quality.gatesTotal > 0 ? job.quality.gatesPassed / job.quality.gatesTotal : 0)
        );
      }, 0) / successfulJobs.length;

    if (successfulGatesRatio > 0.8) {
      factors.push({
        factor: 'Quality Gates Compliance',
        correlation: successfulGatesRatio,
        examples: ['Code quality standards', 'Test coverage requirements', 'Security validation'],
        recommendations: [
          'Maintain strict quality gates',
          'Automate quality checks',
          'Early quality validation',
        ],
      });
    }

    return factors;
  }

  /**
   * Identify areas where learning is insufficient
   */
  private identifyLearningGaps(jobs: JobOutcome[]): LearningInsights['learningGaps'] {
    const gaps: LearningInsights['learningGaps'] = [];

    // Low learning generation
    const avgLearning =
      jobs.reduce((sum, job) => sum + job.learning.learningGenerated, 0) / jobs.length;
    if (avgLearning < 0.4) {
      gaps.push({
        area: 'Knowledge Generation',
        severity: 'high',
        description: 'System is not effectively capturing and creating new knowledge',
        suggestedActions: [
          'Improve knowledge capture processes',
          'Enhance pattern recognition',
          'Increase documentation requirements',
          'Implement learning incentives',
        ],
      });
    }

    // Poor adaptability
    const avgAdaptability =
      jobs.reduce((sum, job) => sum + job.learning.adaptabilityShown, 0) / jobs.length;
    if (avgAdaptability < 0.5) {
      gaps.push({
        area: 'Adaptability',
        severity: 'medium',
        description: 'System struggles to adapt to new or unique situations',
        suggestedActions: [
          'Improve pattern flexibility',
          'Enhance context understanding',
          'Better similarity matching',
          'Adaptive learning algorithms',
        ],
      });
    }

    // Knowledge reuse issues
    const avgKnowledgeReuse =
      jobs.reduce((sum, job) => sum + job.learning.knowledgeReused, 0) / jobs.length;
    if (avgKnowledgeReuse < 0.5) {
      gaps.push({
        area: 'Knowledge Utilization',
        severity: 'medium',
        description: 'Existing knowledge is not being effectively utilized',
        suggestedActions: [
          'Improve search and retrieval',
          'Better knowledge organization',
          'Context-aware recommendations',
          'Knowledge accessibility improvements',
        ],
      });
    }

    return gaps.sort((a, b) => {
      const severityOrder = { high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  /**
   * Identify optimization opportunities
   */
  private identifyOptimizationOpportunities(jobs: JobOutcome[]): LearningInsights['optimizations'] {
    const optimizations: LearningInsights['optimizations'] = [];

    // Quality score optimization
    const avgQuality = jobs.reduce((sum, job) => sum + job.quality.overallScore, 0) / jobs.length;
    if (avgQuality < 0.8) {
      optimizations.push({
        area: 'Quality Score',
        currentPerformance: avgQuality,
        potentialImprovement: Math.min(0.9 - avgQuality, 0.3),
        effortRequired: avgQuality < 0.6 ? 'high' : 'medium',
        description: 'Systematic quality improvements through better patterns and processes',
      });
    }

    // Duration optimization
    const avgDuration =
      jobs
        .filter((job) => job.metadata.duration)
        .reduce((sum, job) => sum + (job.metadata.duration || 0), 0) /
      jobs.filter((job) => job.metadata.duration).length;
    const targetDuration = 300000; // 5 minutes

    if (avgDuration > targetDuration) {
      optimizations.push({
        area: 'Job Duration',
        currentPerformance: avgDuration / 60000, // Convert to minutes for display
        potentialImprovement: Math.min((avgDuration - targetDuration) / 60000, 10),
        effortRequired: avgDuration > 600000 ? 'high' : 'medium',
        description: 'Reduce job execution time through better patterns and parallel processing',
      });
    }

    return optimizations;
  }

  /**
   * Analyze knowledge distribution across categories and agents
   */
  private analyzeKnowledgeDistribution(
    jobs: JobOutcome[],
  ): LearningInsights['knowledgeDistribution'] {
    const byCategory: Record<string, number> = {};
    const byAgent: Record<string, number> = {};
    const byComplexity: Record<string, number> = {};

    for (const job of jobs) {
      // By category
      const category = job.metadata.category;
      byCategory[category] = (byCategory[category] || 0) + 1;

      // By agent
      for (const agent of job.metadata.agentTypes) {
        byAgent[agent] = (byAgent[agent] || 0) + 1;
      }

      // By complexity
      const complexity = job.metadata.complexity;
      byComplexity[complexity] = (byComplexity[complexity] || 0) + 1;
    }

    // Identify gaps (categories/agents with low representation)
    const totalJobs = jobs.length;
    const gaps: string[] = [];

    Object.entries(byCategory).forEach(([category, count]) => {
      if (count / totalJobs < 0.05) {
        // Less than 5% representation
        gaps.push(`Low ${category} category representation`);
      }
    });

    // Identify potential duplications
    const duplications: string[] = [];
    const knowledgeCards = new Map<string, number>();

    for (const job of jobs) {
      for (const card of job.context.knowledgeCards) {
        knowledgeCards.set(card.title, (knowledgeCards.get(card.title) || 0) + 1);
      }
    }

    knowledgeCards.forEach((count, title) => {
      if (count > totalJobs * 0.3) {
        // Used in more than 30% of jobs
        duplications.push(`Overused: ${title}`);
      }
    });

    return {
      byCategory,
      byAgent,
      byComplexity,
      gaps,
      duplications,
    };
  }

  /**
   * Track and store current progress metrics
   */
  async trackProgressMetrics(): Promise<ProgressMetrics> {
    try {
      // Get cumulative statistics
      const cumulativeStats = await this.jobTracker.getStatistics();

      // Get recent statistics (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentStats = await this.jobTracker.getStatistics({
        start: thirtyDaysAgo,
        end: new Date(),
      });

      // Calculate milestones (simplified)
      const milestones = this.calculateMilestones(cumulativeStats, recentStats);

      // Calculate KPIs
      const kpis = this.calculateKPIs(cumulativeStats, recentStats);

      // Generate targets and progress
      const targets = this.generateTargets(kpis);

      const progressMetrics: ProgressMetrics = {
        timestamp: new Date(),
        cumulative: {
          totalJobs: cumulativeStats.totalJobs,
          successfulJobs: cumulativeStats.successfulJobs,
          knowledgeCards: Object.keys(cumulativeStats.categoryCounts).length, // Simplified
          patternsLearned: 0, // Would be calculated from pattern engine
          gotchasResolved: 0, // Would be calculated from knowledge system
        },
        recent: {
          jobsCompleted: recentStats.totalJobs,
          avgQuality: recentStats.avgQualityScore,
          avgLearningValue: 0.5, // Simplified
          newKnowledge: 0, // Would be calculated
          improvementRate: 0, // Would be calculated
        },
        milestones,
        kpis,
        targets,
      };

      // Store metrics in history
      this.metricsHistory.push({
        timestamp: new Date(),
        metrics: progressMetrics,
      });

      // Keep only last 100 entries
      if (this.metricsHistory.length > 100) {
        this.metricsHistory = this.metricsHistory.slice(-100);
      }

      await this.saveMetricsHistory();

      return progressMetrics;
    } catch (error) {
      enhancedLogger.error('Failed to track progress metrics', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Calculate milestones achieved
   */
  private calculateMilestones(
    cumulativeStats: any,
    recentStats: any,
  ): ProgressMetrics['milestones'] {
    const milestones: ProgressMetrics['milestones'] = [];

    // Job count milestones
    if (cumulativeStats.totalJobs >= 1000) {
      milestones.push({
        name: '1000 Jobs Milestone',
        achievedAt: new Date(), // Simplified - would track actual achievement
        significance: 'major',
        description: 'System has processed over 1000 jobs',
      });
    }

    // Success rate milestones
    const successRate =
      cumulativeStats.totalJobs > 0
        ? cumulativeStats.successfulJobs / cumulativeStats.totalJobs
        : 0;
    if (successRate >= 0.9) {
      milestones.push({
        name: '90% Success Rate',
        achievedAt: new Date(),
        significance: 'critical',
        description: 'Achieved 90% or higher success rate',
      });
    }

    return milestones;
  }

  /**
   * Calculate Key Performance Indicators
   */
  private calculateKPIs(cumulativeStats: any, recentStats: any): ProgressMetrics['kpis'] {
    return {
      successRate:
        cumulativeStats.totalJobs > 0
          ? cumulativeStats.successfulJobs / cumulativeStats.totalJobs
          : 0,
      avgJobDuration: cumulativeStats.avgDuration,
      qualityScore: cumulativeStats.avgQualityScore,
      learningEfficiency: 0.7, // Simplified
      knowledgeReuse: 0.6, // Simplified
    };
  }

  /**
   * Generate targets and track progress
   */
  private generateTargets(kpis: ProgressMetrics['kpis']): ProgressMetrics['targets'] {
    const targets: ProgressMetrics['targets'] = [
      {
        metric: 'Success Rate',
        current: kpis.successRate,
        target: 0.9,
        deadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
        progress: Math.min(kpis.successRate / 0.9, 1),
        onTrack: kpis.successRate >= 0.8,
      },
      {
        metric: 'Quality Score',
        current: kpis.qualityScore,
        target: 0.85,
        deadline: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
        progress: Math.min(kpis.qualityScore / 0.85, 1),
        onTrack: kpis.qualityScore >= 0.75,
      },
    ];

    return targets;
  }

  /**
   * Generate learning recommendations based on analysis
   */
  async generateRecommendations(): Promise<LearningRecommendations> {
    try {
      // Get recent job data for analysis
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentJobs = await this.jobTracker.getJobOutcomes({
        timeRange: { start: thirtyDaysAgo, end: new Date() },
        limit: 1000,
      });

      // Generate different types of recommendations
      const highPriority = this.generateHighPriorityRecommendations(recentJobs);
      const mediumPriority = this.generateMediumPriorityRecommendations(recentJobs);
      const quickWins = this.generateQuickWins(recentJobs);
      const strategic = this.generateStrategicRecommendations(recentJobs);

      const recommendations: LearningRecommendations = {
        timestamp: new Date(),
        highPriority,
        mediumPriority,
        quickWins,
        strategic,
      };

      enhancedLogger.info('Learning recommendations generated', {
        highPriority: highPriority.length,
        mediumPriority: mediumPriority.length,
        quickWins: quickWins.length,
        strategic: strategic.length,
      });

      return recommendations;
    } catch (error) {
      enhancedLogger.error('Failed to generate learning recommendations', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Generate high-priority recommendations
   */
  private generateHighPriorityRecommendations(
    jobs: JobOutcome[],
  ): LearningRecommendations['highPriority'] {
    const recommendations: LearningRecommendations['highPriority'] = [];

    // Check success rate
    const successRate = jobs.filter((job) => job.success).length / jobs.length;
    if (successRate < 0.7) {
      recommendations.push({
        id: 'success_rate_critical',
        type: 'system',
        title: 'Critical Success Rate Issue',
        description: 'Success rate below 70% requires immediate attention',
        rationale: 'Low success rate impacts all system learning and effectiveness',
        expectedImpact: 0.9,
        implementationEffort: 'high',
        timeline: 'Immediate (1-2 weeks)',
        prerequisites: ['Pattern analysis', 'Failure root cause analysis', 'Quality gate review'],
      });
    }

    // Check quality issues
    const avgQuality = jobs.reduce((sum, job) => sum + job.quality.overallScore, 0) / jobs.length;
    if (avgQuality < 0.6) {
      recommendations.push({
        id: 'quality_critical',
        type: 'process',
        title: 'Quality Standards Enforcement',
        description: 'Implement stricter quality gates and validation processes',
        rationale: 'Low quality scores indicate systematic quality issues',
        expectedImpact: 0.8,
        implementationEffort: 'medium',
        timeline: '2-3 weeks',
        prerequisites: ['Quality framework definition', 'Automated quality checks'],
      });
    }

    return recommendations;
  }

  /**
   * Generate medium-priority recommendations
   */
  private generateMediumPriorityRecommendations(
    jobs: JobOutcome[],
  ): LearningRecommendations['mediumPriority'] {
    const recommendations: LearningRecommendations['mediumPriority'] = [];

    // Learning efficiency improvement
    const avgLearning =
      jobs.reduce((sum, job) => sum + job.learning.learningGenerated, 0) / jobs.length;
    if (avgLearning < 0.6) {
      recommendations.push({
        id: 'learning_efficiency',
        type: 'knowledge',
        title: 'Enhance Knowledge Capture',
        description: 'Improve processes for capturing and structuring learning outcomes',
        expectedImpact: 0.6,
        implementationEffort: 'medium',
      });
    }

    // Knowledge reuse improvement
    const avgKnowledgeReuse =
      jobs.reduce((sum, job) => sum + job.learning.knowledgeReused, 0) / jobs.length;
    if (avgKnowledgeReuse < 0.5) {
      recommendations.push({
        id: 'knowledge_reuse',
        type: 'system',
        title: 'Improve Knowledge Accessibility',
        description: 'Enhance knowledge search and recommendation systems',
        expectedImpact: 0.5,
        implementationEffort: 'medium',
      });
    }

    return recommendations;
  }

  /**
   * Generate quick win recommendations
   */
  private generateQuickWins(jobs: JobOutcome[]): LearningRecommendations['quickWins'] {
    const quickWins: LearningRecommendations['quickWins'] = [];

    // Pattern documentation
    quickWins.push({
      id: 'pattern_docs',
      title: 'Document Common Patterns',
      description: 'Create documentation for frequently used successful patterns',
      implementation: 'Identify top 10 successful patterns and create documentation',
      expectedBenefit: 'Improved pattern reuse and knowledge sharing',
      timeRequired: '1-2 days',
    });

    // Quality gate automation
    quickWins.push({
      id: 'automate_quality',
      title: 'Automate Quality Checks',
      description: 'Implement automated quality validation in the pipeline',
      implementation: 'Add pre-commit hooks and CI/CD quality gates',
      expectedBenefit: 'Consistent quality enforcement with minimal overhead',
      timeRequired: '2-3 days',
    });

    return quickWins;
  }

  /**
   * Generate strategic recommendations
   */
  private generateStrategicRecommendations(
    jobs: JobOutcome[],
  ): LearningRecommendations['strategic'] {
    const strategic: LearningRecommendations['strategic'] = [];

    // AI/ML enhancement
    strategic.push({
      id: 'ml_enhancement',
      title: 'Advanced Machine Learning Integration',
      description: 'Implement sophisticated ML models for pattern recognition and prediction',
      longTermImpact: 'Dramatically improved pattern accuracy and prediction capabilities',
      investmentRequired: 'High - specialized ML expertise and infrastructure',
      timeline: '6-12 months',
      dependencies: ['Data collection infrastructure', 'ML expertise', 'Training data preparation'],
    });

    // Knowledge graph implementation
    strategic.push({
      id: 'knowledge_graph',
      title: 'Knowledge Graph Architecture',
      description: 'Implement graph-based knowledge representation for better relationships',
      longTermImpact: 'Enhanced knowledge discovery and contextual understanding',
      investmentRequired: 'Medium-High - graph database and specialized development',
      timeline: '4-8 months',
      dependencies: ['Graph database selection', 'Knowledge modeling', 'Migration planning'],
    });

    return strategic;
  }

  /**
   * Update analysis performance metrics
   */
  private updateAnalysisMetrics(duration: number): void {
    this.performanceTracker.reportsGenerated++;
    this.performanceTracker.totalAnalysisTime += duration;
    this.performanceTracker.avgAnalysisTime =
      this.performanceTracker.totalAnalysisTime / this.performanceTracker.reportsGenerated;
    this.performanceTracker.lastAnalysis = new Date();
  }

  /**
   * Cache management
   */
  private getFromCache(key: string): any {
    const cached = this.analyticsCache.get(key);
    if (cached && Date.now() - cached.timestamp.getTime() < cached.ttl) {
      return cached.data;
    }
    return null;
  }

  private setCache(key: string, data: any, ttl: number): void {
    this.analyticsCache.set(key, {
      data,
      timestamp: new Date(),
      ttl,
    });

    // Clean up expired entries
    for (const [cacheKey, cached] of this.analyticsCache) {
      if (Date.now() - cached.timestamp.getTime() > cached.ttl) {
        this.analyticsCache.delete(cacheKey);
      }
    }
  }

  /**
   * Load metrics history from storage
   */
  private async loadMetricsHistory(): Promise<void> {
    try {
      const historyPath = join(process.cwd(), '.ff2', 'metrics-history.json');

      try {
        const content = await fs.readFile(historyPath, 'utf8');
        const data = JSON.parse(content);

        if (Array.isArray(data)) {
          this.metricsHistory = data.map((entry) => ({
            timestamp: new Date(entry.timestamp),
            metrics: entry.metrics,
          }));
        }
      } catch (readError) {
        // File doesn't exist or is invalid, start fresh
        enhancedLogger.info('No existing metrics history found, starting fresh');
      }
    } catch (error) {
      enhancedLogger.error('Failed to load metrics history', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Save metrics history to storage
   */
  private async saveMetricsHistory(): Promise<void> {
    try {
      const historyPath = join(process.cwd(), '.ff2', 'metrics-history.json');

      await fs.writeFile(historyPath, JSON.stringify(this.metricsHistory, null, 2));
    } catch (error) {
      enhancedLogger.error('Failed to save metrics history', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): {
    reportsGenerated: number;
    avgAnalysisTime: number;
    cacheHitRate: number;
    lastAnalysis: Date;
    cacheSize: number;
    metricsHistory: number;
  } {
    const cacheHitRate =
      this.performanceTracker.reportsGenerated > 0
        ? this.performanceTracker.cachehitRate / this.performanceTracker.reportsGenerated
        : 0;

    return {
      ...this.performanceTracker,
      cacheHitRate,
      cacheSize: this.analyticsCache.size,
      metricsHistory: this.metricsHistory.length,
    };
  }
}
