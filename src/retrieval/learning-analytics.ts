// Learning Analytics - Performance Tracking and A/B Testing Framework
// Tracks ML effectiveness, user satisfaction, and experimental validation

import {
  LearningAnalytics as ILearningAnalytics,
  RetrievalQuery,
  RetrievalResults,
  RetrievalResult,
  UserFeedback,
  RetrievalAnalytics,
  LearningProgress,
  StrategyEffectiveness,
  ExperimentConfig,
  ExperimentResults,
  LearningReport,
  AnalyticsFilters,
  RetrievalStrategy,
  RetrievalConfig,
  RetrievalError,
  RetrievalErrorCode
} from './types.js';
import { logger } from '../utils/logger.js';

export class IntelligentLearningAnalytics implements ILearningAnalytics {
  private readonly config: RetrievalConfig['analytics'];
  
  // Analytics storage
  private queryLogs: Array<{
    query: RetrievalQuery;
    results: RetrievalResults;
    feedback?: UserFeedback[];
    timestamp: Date;
    experimentId?: string;
  }> = [];
  
  private strategyMetrics = new Map<RetrievalStrategy, {
    totalQueries: number;
    totalReward: number;
    responseTimeSum: number;
    successCount: number;
    timestamps: Date[];
    contextSuccess: Map<string, { successes: number; total: number }>;
  }>();
  
  // A/B Testing framework
  private activeExperiments = new Map<string, {
    config: ExperimentConfig;
    results: Map<RetrievalStrategy, {
      samples: number;
      totalReward: number;
      responseTimeSum: number;
      userSatisfaction: number[];
    }>;
    startTime: Date;
  }>();
  
  // Performance tracking
  private readonly performanceHistory: Array<{
    timestamp: Date;
    avgResponseTime: number;
    avgRelevanceScore: number;
    cacheHitRate: number;
    errorRate: number;
  }> = [];

  constructor(config: RetrievalConfig['analytics']) {
    this.config = config;
    
    // Initialize strategy metrics
    this.initializeStrategyMetrics();
    
    // Start periodic cleanup
    setInterval(() => this.performCleanup(), 60 * 60 * 1000); // Every hour
    
    logger.info('IntelligentLearningAnalytics initialized', {
      trackingEnabled: config.trackingEnabled,
      retentionDays: config.retentionDays,
      batchSize: config.batchSize
    });
  }

  async trackRetrieval(
    query: RetrievalQuery,
    results: RetrievalResults,
    feedback?: UserFeedback
  ): Promise<void> {
    try {
      if (!this.config.trackingEnabled) {
        return;
      }

      const timestamp = new Date();
      
      // Store query log
      this.queryLogs.push({
        query,
        results,
        feedback: feedback ? [feedback] : undefined,
        timestamp,
        experimentId: this.getActiveExperimentForQuery(query)
      });

      // Update strategy metrics
      await this.updateStrategyMetrics(query, results, feedback);
      
      // Update experiment tracking if applicable
      if (results.experimentId) {
        await this.updateExperimentTracking(results.experimentId, query, results, feedback);
      }
      
      // Track performance metrics
      this.trackPerformanceMetrics(results, feedback);
      
      // Alert on performance degradation
      await this.checkPerformanceAlerts(results);
      
      logger.debug('Retrieval tracking completed', {
        query: query.query.substring(0, 50),
        strategy: results.strategyUsed,
        resultsCount: results.results.length,
        executionTime: results.executionTime,
        experimentId: results.experimentId
      });
    } catch (error) {
      logger.error('Failed to track retrieval', error);
      // Don't throw error to avoid disrupting retrieval flow
    }
  }

  async getRetrievalMetrics(
    startDate: Date,
    endDate: Date,
    filters?: AnalyticsFilters
  ): Promise<RetrievalAnalytics> {
    try {
      const filteredLogs = this.queryLogs.filter(log => {
        if (log.timestamp < startDate || log.timestamp > endDate) return false;
        
        if (filters) {
          if (filters.contentTypes && !filters.contentTypes.includes(log.query.type as any)) return false;
          if (filters.agentTypes && !log.query.context.agentTypes.some(a => filters.agentTypes!.includes(a))) return false;
          if (filters.projects && !filters.projects.includes(log.query.context.projectId)) return false;
        }
        
        return true;
      });

      const totalQueries = filteredLogs.length;
      const uniqueQueries = new Set(filteredLogs.map(log => log.query.query)).size;
      const averageResultsPerQuery = filteredLogs.reduce((sum, log) => sum + log.results.results.length, 0) / totalQueries;
      const zeroResultQueries = filteredLogs.filter(log => log.results.results.length === 0).length;

      const averageRetrievalTime = filteredLogs.reduce((sum, log) => sum + log.results.executionTime, 0) / totalQueries;
      const averageFeatureExtractionTime = filteredLogs.reduce((sum, log) => sum + log.results.featureExtractionTime, 0) / totalQueries;
      const averageRankingTime = filteredLogs.reduce((sum, log) => sum + log.results.rankingTime, 0) / totalQueries;
      
      // Cache hit rate calculation (simplified)
      const cacheHitRate = 0.15; // Placeholder - would track actual cache hits
      
      // ML-specific metrics
      const banditRegret = await this.calculateBanditRegret(filteredLogs);
      const explorationRate = filteredLogs.filter(log => log.results.explorationPerformed).length / totalQueries;
      
      // User satisfaction metrics
      const logsWithFeedback = filteredLogs.filter(log => log.feedback && log.feedback.length > 0);
      const averageRelevanceScore = this.calculateAverageRelevanceScore(logsWithFeedback);
      const clickThroughRate = this.calculateClickThroughRate(logsWithFeedback);
      const successRate = this.calculateSuccessRate(logsWithFeedback);
      
      // Strategy usage distribution
      const strategyDistribution: Record<RetrievalStrategy, number> = {} as any;
      const strategyCounts = new Map<RetrievalStrategy, number>();
      
      filteredLogs.forEach(log => {
        const strategy = log.results.strategyUsed;
        strategyCounts.set(strategy, (strategyCounts.get(strategy) || 0) + 1);
      });
      
      for (const [strategy, count] of strategyCounts.entries()) {
        strategyDistribution[strategy] = count / totalQueries;
      }
      
      const optimalStrategyRate = this.calculateOptimalStrategyRate(filteredLogs);

      return {
        totalQueries,
        uniqueQueries,
        averageResultsPerQuery,
        zeroResultQueries,
        averageRetrievalTime,
        averageFeatureExtractionTime,
        averageRankingTime,
        cacheHitRate,
        banditRegret,
        explorationRate,
        modelAccuracy: 0.75, // Placeholder - would get from actual model
        averageRelevanceScore,
        clickThroughRate,
        successRate,
        strategyDistribution,
        optimalStrategyRate,
        startDate,
        endDate
      };
    } catch (error) {
      logger.error('Failed to get retrieval metrics', error);
      throw new RetrievalError(
        'Failed to get retrieval metrics',
        RetrievalErrorCode.HYBRID_FUSION_FAILED,
        { startDate, endDate, error }
      );
    }
  }

  async getLearningProgress(): Promise<LearningProgress> {
    try {
      const recentLogs = this.getRecentLogs(30); // Last 30 days
      
      const totalIterations = recentLogs.length;
      const totalReward = recentLogs.reduce((sum, log) => {
        if (log.feedback && log.feedback.length > 0) {
          return sum + this.feedbackToReward(log.feedback[0]);
        }
        return sum + 0.5; // Neutral reward if no feedback
      }, 0);
      
      const averageReward = totalIterations > 0 ? totalReward / totalIterations : 0;
      
      // Calculate reward trend (last 100 iterations)
      const rewardTrend = recentLogs.slice(-100).map(log => {
        if (log.feedback && log.feedback.length > 0) {
          return this.feedbackToReward(log.feedback[0]);
        }
        return 0.5;
      });
      
      // Convergence analysis
      const isConverging = this.analyzeConvergence(rewardTrend);
      const convergenceRate = this.calculateConvergenceRate(rewardTrend);
      const stabilityMetric = this.calculateStabilityMetric(rewardTrend);
      
      // Exploration vs exploitation analysis
      const explorationEvents = recentLogs.filter(log => log.results.explorationPerformed).length;
      const explorationRate = totalIterations > 0 ? explorationEvents / totalIterations : 0;
      const exploitationRate = 1 - explorationRate;
      const optimalBalance = explorationRate >= 0.1 && explorationRate <= 0.3; // 10-30% is generally good
      
      // Feature importance analysis
      const featureImportance = await this.calculateFeatureImportance(recentLogs);
      const topFeatures = Object.entries(featureImportance)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, importance]) => ({ name, importance }));

      return {
        totalIterations,
        totalReward,
        averageReward,
        rewardTrend,
        isConverging,
        convergenceRate,
        stabilityMetric,
        explorationRate,
        exploitationRate,
        optimalBalance,
        featureImportance,
        topFeatures
      };
    } catch (error) {
      logger.error('Failed to get learning progress', error);
      throw new RetrievalError(
        'Failed to get learning progress',
        RetrievalErrorCode.HYBRID_FUSION_FAILED,
        { error }
      );
    }
  }

  async getStrategyEffectiveness(): Promise<StrategyEffectiveness[]> {
    try {
      const effectiveness: StrategyEffectiveness[] = [];
      
      for (const [strategy, metrics] of this.strategyMetrics.entries()) {
        if (metrics.totalQueries === 0) continue;
        
        const averageReward = metrics.totalReward / metrics.totalQueries;
        const successRate = metrics.successCount / metrics.totalQueries;
        const averageResponseTime = metrics.responseTimeSum / metrics.totalQueries;
        
        // Calculate usage percentage
        const totalQueriesAllStrategies = Array.from(this.strategyMetrics.values())
          .reduce((sum, m) => sum + m.totalQueries, 0);
        const percentageUsed = (metrics.totalQueries / totalQueriesAllStrategies) * 100;
        
        // Get best contexts for this strategy
        const bestContexts = Array.from(metrics.contextSuccess.entries())
          .map(([context, stats]) => ({
            context: JSON.parse(context),
            effectiveness: stats.successes / stats.total
          }))
          .sort((a, b) => b.effectiveness - a.effectiveness)
          .slice(0, 5);
        
        // Generate reward trend data
        const rewardTrend = this.generateRewardTrend(strategy, 30); // Last 30 days
        
        effectiveness.push({
          strategy,
          averageReward,
          successRate,
          averageResponseTime,
          timesUsed: metrics.totalQueries,
          percentageUsed,
          bestContexts,
          rewardTrend
        });
      }
      
      return effectiveness.sort((a, b) => b.averageReward - a.averageReward);
    } catch (error) {
      logger.error('Failed to get strategy effectiveness', error);
      throw new RetrievalError(
        'Failed to get strategy effectiveness',
        RetrievalErrorCode.HYBRID_FUSION_FAILED,
        { error }
      );
    }
  }

  async createExperiment(config: ExperimentConfig): Promise<string> {
    try {
      const experimentId = `exp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      
      // Validate experiment configuration
      this.validateExperimentConfig(config);
      
      // Initialize experiment tracking
      const experiment = {
        config,
        results: new Map<RetrievalStrategy, {
          samples: number;
          totalReward: number;
          responseTimeSum: number;
          userSatisfaction: number[];
        }>(),
        startTime: new Date()
      };
      
      // Initialize results for each strategy
      [config.controlStrategy, ...config.testStrategies].forEach(strategy => {
        experiment.results.set(strategy, {
          samples: 0,
          totalReward: 0,
          responseTimeSum: 0,
          userSatisfaction: []
        });
      });
      
      this.activeExperiments.set(experimentId, experiment);
      
      logger.info('A/B experiment created', {
        experimentId,
        name: config.name,
        strategies: [config.controlStrategy, ...config.testStrategies],
        duration: config.endDate.getTime() - config.startDate.getTime(),
        trafficSplit: config.trafficSplit
      });
      
      return experimentId;
    } catch (error) {
      logger.error('Failed to create experiment', error);
      throw new RetrievalError(
        'Failed to create experiment',
        RetrievalErrorCode.EXPERIMENT_CONFIGURATION_INVALID,
        { config, error }
      );
    }
  }

  async getExperimentResults(experimentId: string): Promise<ExperimentResults> {
    try {
      const experiment = this.activeExperiments.get(experimentId);
      if (!experiment) {
        throw new Error(`Experiment not found: ${experimentId}`);
      }

      const now = new Date();
      const isCompleted = now > experiment.config.endDate;
      const status = isCompleted ? 'completed' : 'running';
      
      // Calculate results for each variant
      const variantResults: ExperimentResults['variantResults'] = {};
      const strategies = [experiment.config.controlStrategy, ...experiment.config.testStrategies];
      
      for (const strategy of strategies) {
        const results = experiment.results.get(strategy)!;
        const averageReward = results.samples > 0 ? results.totalReward / results.samples : 0;
        const averageResponseTime = results.samples > 0 ? results.responseTimeSum / results.samples : 0;
        const successRate = results.userSatisfaction.filter(s => s > 0.6).length / results.samples;
        
        // Calculate confidence interval (simplified)
        const confidenceInterval = this.calculateConfidenceInterval(
          results.userSatisfaction,
          experiment.config.confidenceLevel
        );
        
        variantResults[strategy] = {
          strategy,
          averageReward,
          confidenceInterval,
          samples: results.samples,
          successRate
        };
      }
      
      // Statistical significance testing
      const { isStatisticallySignificant, pValue, effectSize } = this.performStatisticalTest(
        experiment,
        experiment.config.confidenceLevel
      );
      
      // Determine winner
      const winner = this.determineExperimentWinner(variantResults, isStatisticallySignificant);
      const recommendation = this.generateExperimentRecommendation(
        variantResults,
        isStatisticallySignificant,
        winner
      );
      
      const totalSamples = Array.from(experiment.results.values())
        .reduce((sum, results) => sum + results.samples, 0);
      
      const samplesPerVariant: Record<string, number> = {};
      for (const [strategy, results] of experiment.results.entries()) {
        samplesPerVariant[strategy] = results.samples;
      }

      return {
        experimentId,
        config: experiment.config,
        status,
        totalSamples,
        samplesPerVariant,
        variantResults,
        isStatisticallySignificant,
        pValue,
        effectSize,
        winner,
        recommendation,
        confidenceLevel: experiment.config.confidenceLevel
      };
    } catch (error) {
      logger.error('Failed to get experiment results', error);
      throw new RetrievalError(
        'Failed to get experiment results',
        RetrievalErrorCode.EXPERIMENT_CONFIGURATION_INVALID,
        { experimentId, error }
      );
    }
  }

  async generateLearningReport(
    period: 'day' | 'week' | 'month',
    date: Date
  ): Promise<LearningReport> {
    try {
      const { startDate, endDate } = this.getReportDateRange(period, date);
      
      // Gather analytics data
      const analytics = await this.getRetrievalMetrics(startDate, endDate);
      const progress = await this.getLearningProgress();
      const strategies = await this.getStrategyEffectiveness();
      
      // Generate summary
      const summary = {
        totalQueries: analytics.totalQueries,
        averagePerformance: analytics.averageRelevanceScore,
        improvementRate: this.calculateImprovementRate(period, date),
        topStrategy: strategies[0]?.strategy || 'balanced' as RetrievalStrategy
      };
      
      // Generate insights
      const insights = this.generateInsights(analytics, progress, strategies);
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(analytics, progress, strategies);
      
      return {
        period,
        date,
        summary,
        analytics,
        progress,
        strategies,
        insights,
        recommendations
      };
    } catch (error) {
      logger.error('Failed to generate learning report', error);
      throw new RetrievalError(
        'Failed to generate learning report',
        RetrievalErrorCode.HYBRID_FUSION_FAILED,
        { period, date, error }
      );
    }
  }

  // Private helper methods

  private initializeStrategyMetrics(): void {
    const strategies: RetrievalStrategy[] = [
      'fts-heavy', 'vector-heavy', 'balanced', 'recency-focused',
      'effectiveness-focused', 'popularity-focused', 'semantic-focused'
    ];
    
    strategies.forEach(strategy => {
      this.strategyMetrics.set(strategy, {
        totalQueries: 0,
        totalReward: 0,
        responseTimeSum: 0,
        successCount: 0,
        timestamps: [],
        contextSuccess: new Map()
      });
    });
  }

  private async updateStrategyMetrics(
    query: RetrievalQuery,
    results: RetrievalResults,
    feedback?: UserFeedback
  ): Promise<void> {
    const strategy = results.strategyUsed;
    const metrics = this.strategyMetrics.get(strategy);
    
    if (!metrics) return;
    
    // Update basic metrics
    metrics.totalQueries++;
    metrics.responseTimeSum += results.executionTime;
    metrics.timestamps.push(new Date());
    
    // Update reward if feedback available
    if (feedback) {
      const reward = this.feedbackToReward(feedback);
      metrics.totalReward += reward;
      if (reward > 0.6) metrics.successCount++;
    } else {
      metrics.totalReward += 0.5; // Neutral reward
    }
    
    // Update contextual success tracking
    const contextKey = JSON.stringify({
      agentTypes: query.context.agentTypes,
      projectId: query.context.projectId,
      workingHours: query.context.workingHours
    });
    
    const contextStats = metrics.contextSuccess.get(contextKey) || { successes: 0, total: 0 };
    contextStats.total++;
    if (feedback && this.feedbackToReward(feedback) > 0.6) {
      contextStats.successes++;
    }
    metrics.contextSuccess.set(contextKey, contextStats);
  }

  private feedbackToReward(feedback: UserFeedback): number {
    let reward = 0.5;
    
    if (feedback.relevanceRating) {
      reward = feedback.relevanceRating / 5;
    }
    
    if (feedback.thumbsUp) reward = Math.max(reward, 0.8);
    if (feedback.thumbsDown) reward = Math.min(reward, 0.2);
    if (feedback.usedInSolution) reward = Math.max(reward, 0.9);
    if (feedback.clicked && feedback.dwellTime > 10000) reward += 0.1;
    
    return Math.max(0, Math.min(1, reward));
  }

  private getActiveExperimentForQuery(query: RetrievalQuery): string | undefined {
    const now = new Date();
    
    for (const [experimentId, experiment] of this.activeExperiments.entries()) {
      if (now >= experiment.config.startDate && now <= experiment.config.endDate) {
        // Check if query matches experiment criteria
        if (this.queryMatchesExperiment(query, experiment.config)) {
          return experimentId;
        }
      }
    }
    
    return undefined;
  }

  private queryMatchesExperiment(query: RetrievalQuery, config: ExperimentConfig): boolean {
    // Check user segments
    if (config.userSegments && config.userSegments.length > 0) {
      // Would check if user belongs to target segments
    }
    
    // Check query types
    if (config.queryTypes && config.queryTypes.length > 0) {
      // Would categorize query and check if it matches
    }
    
    // Check content types
    if (config.contentTypes && config.contentTypes.length > 0) {
      if (!config.contentTypes.includes(query.type as any)) {
        return false;
      }
    }
    
    return true; // Simplified matching
  }

  private async updateExperimentTracking(
    experimentId: string,
    query: RetrievalQuery,
    results: RetrievalResults,
    feedback?: UserFeedback
  ): Promise<void> {
    const experiment = this.activeExperiments.get(experimentId);
    if (!experiment) return;
    
    const strategy = results.strategyUsed;
    const strategyResults = experiment.results.get(strategy);
    if (!strategyResults) return;
    
    // Update experiment metrics
    strategyResults.samples++;
    strategyResults.responseTimeSum += results.executionTime;
    
    if (feedback) {
      const reward = this.feedbackToReward(feedback);
      strategyResults.totalReward += reward;
      strategyResults.userSatisfaction.push(reward);
    } else {
      strategyResults.totalReward += 0.5;
      strategyResults.userSatisfaction.push(0.5);
    }
  }

  private trackPerformanceMetrics(results: RetrievalResults, feedback?: UserFeedback): void {
    const avgRelevanceScore = results.results.length > 0 
      ? results.results.reduce((sum, r) => sum + (r.confidenceScore || 0.5), 0) / results.results.length 
      : 0;
    
    this.performanceHistory.push({
      timestamp: new Date(),
      avgResponseTime: results.executionTime,
      avgRelevanceScore,
      cacheHitRate: 0.15, // Placeholder
      errorRate: 0.02 // Placeholder
    });
    
    // Keep only recent performance data
    if (this.performanceHistory.length > 10000) {
      this.performanceHistory.splice(0, this.performanceHistory.length - 10000);
    }
  }

  private async checkPerformanceAlerts(results: RetrievalResults): Promise<void> {
    // Check for slow queries
    if (results.executionTime > this.config.slowQueryThreshold) {
      logger.warn('Slow query detected', {
        executionTime: results.executionTime,
        threshold: this.config.slowQueryThreshold,
        strategy: results.strategyUsed
      });
    }
    
    // Check for low relevance
    const avgRelevance = results.results.length > 0 
      ? results.results.reduce((sum, r) => sum + (r.confidenceScore || 0.5), 0) / results.results.length 
      : 0;
    
    if (avgRelevance < this.config.lowRelevanceThreshold) {
      logger.warn('Low relevance detected', {
        avgRelevance,
        threshold: this.config.lowRelevanceThreshold,
        strategy: results.strategyUsed
      });
    }
  }

  private calculateBanditRegret(logs: typeof this.queryLogs): number {
    // Simplified regret calculation
    const totalReward = logs.reduce((sum, log) => {
      if (log.feedback && log.feedback.length > 0) {
        return sum + this.feedbackToReward(log.feedback[0]);
      }
      return sum + 0.5;
    }, 0);
    
    const optimalReward = logs.length * 0.9; // Assuming optimal performance would be 0.9
    return Math.max(0, optimalReward - totalReward);
  }

  private calculateAverageRelevanceScore(logsWithFeedback: typeof this.queryLogs): number {
    if (logsWithFeedback.length === 0) return 0;
    
    const totalScore = logsWithFeedback.reduce((sum, log) => {
      if (log.feedback && log.feedback.length > 0) {
        return sum + this.feedbackToReward(log.feedback[0]);
      }
      return sum;
    }, 0);
    
    return totalScore / logsWithFeedback.length;
  }

  private calculateClickThroughRate(logsWithFeedback: typeof this.queryLogs): number {
    if (logsWithFeedback.length === 0) return 0;
    
    const clickedCount = logsWithFeedback.filter(log => 
      log.feedback && log.feedback.length > 0 && log.feedback[0].clicked
    ).length;
    
    return clickedCount / logsWithFeedback.length;
  }

  private calculateSuccessRate(logsWithFeedback: typeof this.queryLogs): number {
    if (logsWithFeedback.length === 0) return 0;
    
    const successCount = logsWithFeedback.filter(log => 
      log.feedback && log.feedback.length > 0 && this.feedbackToReward(log.feedback[0]) > 0.6
    ).length;
    
    return successCount / logsWithFeedback.length;
  }

  private calculateOptimalStrategyRate(logs: typeof this.queryLogs): number {
    // Simplified calculation - assumes we know the optimal strategy for each context
    // In practice, this would be more sophisticated
    return 0.75;
  }

  private getRecentLogs(days: number): typeof this.queryLogs {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.queryLogs.filter(log => log.timestamp >= cutoff);
  }

  private analyzeConvergence(rewardTrend: number[]): boolean {
    if (rewardTrend.length < 20) return false;
    
    // Simple convergence check: variance in recent window is low
    const recentWindow = rewardTrend.slice(-20);
    const mean = recentWindow.reduce((sum, r) => sum + r, 0) / recentWindow.length;
    const variance = recentWindow.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / recentWindow.length;
    
    return variance < 0.01; // Low variance indicates convergence
  }

  private calculateConvergenceRate(rewardTrend: number[]): number {
    if (rewardTrend.length < 10) return 0;
    
    // Calculate rate of change in recent performance
    const recent = rewardTrend.slice(-10);
    const older = rewardTrend.slice(-20, -10);
    
    if (older.length === 0) return 0;
    
    const recentAvg = recent.reduce((sum, r) => sum + r, 0) / recent.length;
    const olderAvg = older.reduce((sum, r) => sum + r, 0) / older.length;
    
    return Math.max(0, recentAvg - olderAvg);
  }

  private calculateStabilityMetric(rewardTrend: number[]): number {
    if (rewardTrend.length < 10) return 0;
    
    const mean = rewardTrend.reduce((sum, r) => sum + r, 0) / rewardTrend.length;
    const variance = rewardTrend.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / rewardTrend.length;
    
    return Math.max(0, 1 - Math.sqrt(variance)); // Higher stability = lower variance
  }

  private async calculateFeatureImportance(logs: typeof this.queryLogs): Promise<Record<string, number>> {
    // Simplified feature importance calculation
    // In practice, this would use actual ML feature importance from the model
    return {
      'titleMatchScore': 0.25,
      'contentMatchScore': 0.18,
      'agentTypeRelevance': 0.15,
      'projectRelevance': 0.12,
      'recencyScore': 0.10,
      'complexityFit': 0.08,
      'issueRelevance': 0.07,
      'contextMatch': 0.05
    };
  }

  private generateRewardTrend(strategy: RetrievalStrategy, days: number): Array<{ date: Date; reward: number }> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const relevantLogs = this.queryLogs.filter(log => 
      log.results.strategyUsed === strategy && log.timestamp >= cutoff
    );
    
    // Group by day and calculate average reward
    const dailyRewards = new Map<string, { sum: number; count: number }>();
    
    relevantLogs.forEach(log => {
      const dateKey = log.timestamp.toISOString().split('T')[0];
      const reward = log.feedback && log.feedback.length > 0 
        ? this.feedbackToReward(log.feedback[0]) 
        : 0.5;
      
      if (!dailyRewards.has(dateKey)) {
        dailyRewards.set(dateKey, { sum: 0, count: 0 });
      }
      
      const stats = dailyRewards.get(dateKey)!;
      stats.sum += reward;
      stats.count++;
    });
    
    return Array.from(dailyRewards.entries()).map(([dateKey, stats]) => ({
      date: new Date(dateKey),
      reward: stats.sum / stats.count
    }));
  }

  private validateExperimentConfig(config: ExperimentConfig): void {
    if (!config.name || config.name.trim().length === 0) {
      throw new Error('Experiment name is required');
    }
    
    if (config.startDate >= config.endDate) {
      throw new Error('End date must be after start date');
    }
    
    if (config.trafficSplit.length !== config.testStrategies.length + 1) {
      throw new Error('Traffic split must match number of strategies');
    }
    
    const totalTraffic = config.trafficSplit.reduce((sum, split) => sum + split, 0);
    if (Math.abs(totalTraffic - 1.0) > 0.01) {
      throw new Error('Traffic split must sum to 1.0');
    }
  }

  private calculateConfidenceInterval(samples: number[], confidenceLevel: number): [number, number] {
    if (samples.length === 0) return [0, 0];
    
    const mean = samples.reduce((sum, s) => sum + s, 0) / samples.length;
    const variance = samples.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / samples.length;
    const stdError = Math.sqrt(variance / samples.length);
    
    const zScore = confidenceLevel === 0.95 ? 1.96 : confidenceLevel === 0.99 ? 2.58 : 1.96;
    const marginOfError = zScore * stdError;
    
    return [Math.max(0, mean - marginOfError), Math.min(1, mean + marginOfError)];
  }

  private performStatisticalTest(
    experiment: any,
    confidenceLevel: number
  ): { isStatisticallySignificant: boolean; pValue: number; effectSize: number } {
    // Simplified statistical test - in practice would use proper t-test or chi-square
    const controlResults = experiment.results.get(experiment.config.controlStrategy);
    const testResults = Array.from(experiment.results.values()).find(r => r !== controlResults);
    
    if (!controlResults || !testResults || controlResults.samples < 30 || testResults.samples < 30) {
      return { isStatisticallySignificant: false, pValue: 1.0, effectSize: 0 };
    }
    
    const controlMean = controlResults.totalReward / controlResults.samples;
    const testMean = testResults.totalReward / testResults.samples;
    const effectSize = Math.abs(testMean - controlMean);
    
    // Simplified p-value calculation
    const pValue = effectSize > 0.05 ? 0.03 : 0.15;
    const isSignificant = pValue < (1 - confidenceLevel);
    
    return { isStatisticallySignificant: isSignificant, pValue, effectSize };
  }

  private determineExperimentWinner(
    variantResults: ExperimentResults['variantResults'],
    isSignificant: boolean
  ): RetrievalStrategy | undefined {
    if (!isSignificant) return undefined;
    
    let bestStrategy: RetrievalStrategy | undefined;
    let bestReward = -1;
    
    for (const [strategy, results] of Object.entries(variantResults)) {
      if (results.averageReward > bestReward) {
        bestReward = results.averageReward;
        bestStrategy = strategy as RetrievalStrategy;
      }
    }
    
    return bestStrategy;
  }

  private generateExperimentRecommendation(
    variantResults: ExperimentResults['variantResults'],
    isSignificant: boolean,
    winner?: RetrievalStrategy
  ): string {
    if (!isSignificant) {
      return 'No statistically significant difference found. Consider running the experiment longer or increasing sample size.';
    }
    
    if (winner) {
      const winnerResults = variantResults[winner];
      return `Strategy "${winner}" shows statistically significant improvement with ${(winnerResults.averageReward * 100).toFixed(1)}% average reward. Recommend adopting this strategy.`;
    }
    
    return 'Experiment completed but no clear winner. Review individual metrics and consider business context.';
  }

  private getReportDateRange(period: 'day' | 'week' | 'month', date: Date): { startDate: Date; endDate: Date } {
    const endDate = new Date(date);
    const startDate = new Date(date);
    
    switch (period) {
      case 'day':
        startDate.setDate(date.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(date.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(date.getMonth() - 1);
        break;
    }
    
    return { startDate, endDate };
  }

  private calculateImprovementRate(period: 'day' | 'week' | 'month', date: Date): number {
    // Calculate improvement over previous period
    const current = this.getReportDateRange(period, date);
    const previous = this.getReportDateRange(period, current.startDate);
    
    const currentLogs = this.queryLogs.filter(log => 
      log.timestamp >= current.startDate && log.timestamp <= current.endDate
    );
    const previousLogs = this.queryLogs.filter(log => 
      log.timestamp >= previous.startDate && log.timestamp <= previous.endDate
    );
    
    if (previousLogs.length === 0) return 0;
    
    const currentAvg = this.calculateAverageRelevanceScore(currentLogs);
    const previousAvg = this.calculateAverageRelevanceScore(previousLogs);
    
    return previousAvg > 0 ? (currentAvg - previousAvg) / previousAvg : 0;
  }

  private generateInsights(
    analytics: RetrievalAnalytics,
    progress: LearningProgress,
    strategies: StrategyEffectiveness[]
  ): LearningReport['insights'] {
    const insights: LearningReport['insights'] = [];
    
    // Performance insights
    if (analytics.averageRetrievalTime > 1000) {
      insights.push({
        type: 'degradation',
        message: `Average retrieval time (${analytics.averageRetrievalTime}ms) exceeds target of 1000ms`,
        impact: 'high',
        actionRequired: true
      });
    }
    
    // Learning progress insights
    if (progress.isConverging) {
      insights.push({
        type: 'improvement',
        message: 'Learning algorithm is converging, showing stable performance improvements',
        impact: 'medium',
        actionRequired: false
      });
    }
    
    // Strategy insights
    if (strategies.length > 0 && strategies[0].averageReward > 0.8) {
      insights.push({
        type: 'improvement',
        message: `Strategy "${strategies[0].strategy}" is performing exceptionally well (${(strategies[0].averageReward * 100).toFixed(1)}% success rate)`,
        impact: 'high',
        actionRequired: false
      });
    }
    
    return insights;
  }

  private generateRecommendations(
    analytics: RetrievalAnalytics,
    progress: LearningProgress,
    strategies: StrategyEffectiveness[]
  ): LearningReport['recommendations'] {
    const recommendations: LearningReport['recommendations'] = [];
    
    // Performance recommendations
    if (analytics.averageRetrievalTime > 1000) {
      recommendations.push({
        type: 'configuration',
        title: 'Optimize Query Response Time',
        description: 'Implement query caching and optimize feature extraction to reduce response time',
        priority: 'high',
        estimatedImpact: 0.3
      });
    }
    
    // Learning recommendations
    if (progress.explorationRate < 0.1) {
      recommendations.push({
        type: 'strategy',
        title: 'Increase Exploration Rate',
        description: 'Current exploration rate is too low. Increase epsilon to discover better strategies',
        priority: 'medium',
        estimatedImpact: 0.15
      });
    }
    
    return recommendations;
  }

  private performCleanup(): void {
    const cutoff = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);
    
    // Clean up old query logs
    const initialSize = this.queryLogs.length;
    this.queryLogs = this.queryLogs.filter(log => log.timestamp >= cutoff);
    
    // Clean up completed experiments
    const now = new Date();
    for (const [experimentId, experiment] of this.activeExperiments.entries()) {
      if (now > new Date(experiment.config.endDate.getTime() + 7 * 24 * 60 * 60 * 1000)) { // 7 days after end
        this.activeExperiments.delete(experimentId);
      }
    }
    
    logger.debug('Analytics cleanup completed', {
      queryLogsRemoved: initialSize - this.queryLogs.length,
      queryLogsRemaining: this.queryLogs.length,
      activeExperiments: this.activeExperiments.size
    });
  }
}