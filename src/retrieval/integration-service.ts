// Integration Service - Connects Retrieval Layer with Index and Foundation Layers
// Provides seamless integration between ML-enhanced retrieval and FF2's data layers

import {
  createRetrievalSystem,
  DEFAULT_RETRIEVAL_CONFIG,
  RetrievalSystemMonitor
} from './index.js';
import {
  RetrievalQuery,
  RetrievalResults,
  RetrievalConfig,
  SearchContext,
  UserFeedback,
  BanditAlgorithm,
  RetrievalError,
  RetrievalErrorCode
} from './types.js';
import { ISearchEngine } from '../indexing/types.js';
import { KnowledgeManager } from '../knowledge/knowledge-manager.js';
import { MemoryManager } from '../memory/memory-manager.js';
import { logger } from '../utils/logger.js';

export interface RetrievalIntegrationConfig {
  retrieval: RetrievalConfig;
  knowledgeManager: KnowledgeManager;
  memoryManager: MemoryManager;
  searchEngine: ISearchEngine;
  enablePerformanceMonitoring: boolean;
  enableKnowledgeEnrichment: boolean;
  enableMemoryIntegration: boolean;
}

/**
 * FF2 Retrieval Integration Service
 * 
 * Orchestrates ML-enhanced retrieval with knowledge management and memory systems.
 * Provides the primary interface for intelligent content retrieval in FF2.
 */
export class RetrievalIntegrationService {
  private readonly config: RetrievalIntegrationConfig;
  private readonly retrievalSystem: ReturnType<typeof createRetrievalSystem>;
  private readonly monitor: RetrievalSystemMonitor;
  private readonly knowledgeManager: KnowledgeManager;
  private readonly memoryManager: MemoryManager;
  
  // Performance tracking
  private performanceMetrics = {
    totalQueries: 0,
    totalTime: 0,
    averageAccuracy: 0,
    knowledgeEnrichments: 0,
    memoryIntegrations: 0,
    banditUpdates: 0
  };

  constructor(config: RetrievalIntegrationConfig) {
    this.config = config;
    this.knowledgeManager = config.knowledgeManager;
    this.memoryManager = config.memoryManager;
    
    // Create ML-enhanced retrieval system
    this.retrievalSystem = createRetrievalSystem(config.searchEngine, config.retrieval);
    
    // Initialize performance monitoring
    this.monitor = new RetrievalSystemMonitor();
    
    logger.info('RetrievalIntegrationService initialized', {
      enableKnowledgeEnrichment: config.enableKnowledgeEnrichment,
      enableMemoryIntegration: config.enableMemoryIntegration,
      enablePerformanceMonitoring: config.enablePerformanceMonitoring,
      banditAlgorithm: config.retrieval.bandit.algorithm
    });
  }

  /**
   * Perform intelligent retrieval with full FF2 integration
   */
  async retrieve(query: RetrievalQuery): Promise<RetrievalResults> {
    const startTime = Date.now();
    
    try {
      // Enhance query context with knowledge and memory
      const enrichedQuery = await this.enrichQueryContext(query);
      
      // Perform ML-enhanced retrieval
      const rawResults = await this.retrievalSystem.hybridRetriever.retrieve(enrichedQuery);
      
      // Enrich results with knowledge management insights
      const enrichedResults = await this.enrichResults(rawResults, enrichedQuery);
      
      // Track performance
      const totalTime = Date.now() - startTime;
      this.updateMetrics(totalTime, enrichedResults, false);
      
      // Log retrieval for analytics
      await this.retrievalSystem.analytics.trackRetrieval(enrichedQuery, enrichedResults);
      
      logger.debug('Intelligent retrieval completed', {
        query: query.query.substring(0, 50),
        strategy: enrichedResults.strategyUsed,
        results: enrichedResults.results.length,
        totalTime,
        knowledgeEnriched: this.config.enableKnowledgeEnrichment,
        memoryIntegrated: this.config.enableMemoryIntegration
      });

      return enrichedResults;
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.updateMetrics(totalTime, null, true);
      
      logger.error('Intelligent retrieval failed', {
        query: query.query,
        error,
        totalTime
      });
      
      throw new RetrievalError(
        'Integrated retrieval failed',
        RetrievalErrorCode.HYBRID_FUSION_FAILED,
        { query: query.query, error }
      );
    }
  }

  /**
   * Provide feedback to improve future retrievals
   */
  async provideFeedback(
    query: RetrievalQuery,
    results: RetrievalResults,
    feedback: UserFeedback
  ): Promise<void> {
    try {
      // Update bandit algorithm
      const reward = this.calculateReward(feedback);
      await this.retrievalSystem.banditLearner.updateReward(
        results.strategyUsed,
        query.context,
        reward
      );
      
      // Update re-ranker if enabled
      if (this.config.retrieval.reranking.enabled && results.results.length > 0) {
        await this.retrievalSystem.reranker.updateOnline(
          query,
          results.results[0] as any, // Cast for compatibility
          feedback
        );
      }
      
      // Update knowledge effectiveness if applicable
      if (feedback.usedInSolution && this.config.enableKnowledgeEnrichment) {
        await this.updateKnowledgeEffectiveness(results, feedback);
      }
      
      // Track in memory system
      if (this.config.enableMemoryIntegration) {
        await this.recordMemoryOutcome(query, results, feedback);
      }
      
      // Update analytics
      await this.retrievalSystem.analytics.trackRetrieval(query, results, feedback);
      
      this.performanceMetrics.banditUpdates++;
      
      logger.debug('Feedback processed', {
        reward,
        strategy: results.strategyUsed,
        usedInSolution: feedback.usedInSolution,
        relevanceRating: feedback.relevanceRating
      });
    } catch (error) {
      logger.error('Failed to process feedback', error);
      // Don't throw - feedback processing should not break user flow
    }
  }

  /**
   * Get comprehensive analytics and learning progress
   */
  async getAnalytics(
    startDate: Date,
    endDate: Date
  ): Promise<{
    retrievalAnalytics: any;
    learningProgress: any;
    strategyEffectiveness: any;
    performanceMetrics: typeof this.performanceMetrics;
    integrationStats: {
      knowledgeEnrichmentRate: number;
      memoryIntegrationRate: number;
      averageEnrichmentTime: number;
    };
  }> {
    try {
      const [retrievalAnalytics, learningProgress, strategyEffectiveness] = await Promise.all([
        this.retrievalSystem.analytics.getRetrievalMetrics(startDate, endDate),
        this.retrievalSystem.analytics.getLearningProgress(),
        this.retrievalSystem.analytics.getStrategyEffectiveness()
      ]);

      const integrationStats = {
        knowledgeEnrichmentRate: this.performanceMetrics.totalQueries > 0 
          ? this.performanceMetrics.knowledgeEnrichments / this.performanceMetrics.totalQueries 
          : 0,
        memoryIntegrationRate: this.performanceMetrics.totalQueries > 0 
          ? this.performanceMetrics.memoryIntegrations / this.performanceMetrics.totalQueries 
          : 0,
        averageEnrichmentTime: 15 // Placeholder - would track actual enrichment time
      };

      return {
        retrievalAnalytics,
        learningProgress,
        strategyEffectiveness,
        performanceMetrics: { ...this.performanceMetrics },
        integrationStats
      };
    } catch (error) {
      logger.error('Failed to get analytics', error);
      throw new RetrievalError(
        'Failed to retrieve analytics',
        RetrievalErrorCode.HYBRID_FUSION_FAILED,
        { error }
      );
    }
  }

  /**
   * Create A/B experiment for testing retrieval strategies
   */
  async createExperiment(config: any): Promise<string> {
    return await this.retrievalSystem.analytics.createExperiment(config);
  }

  /**
   * Get experiment results
   */
  async getExperimentResults(experimentId: string): Promise<any> {
    return await this.retrievalSystem.analytics.getExperimentResults(experimentId);
  }

  /**
   * Export bandit model for backup/analysis
   */
  async exportBanditModel(): Promise<any> {
    return await this.retrievalSystem.banditLearner.exportModel();
  }

  /**
   * Import bandit model from backup
   */
  async importBanditModel(model: any): Promise<void> {
    return await this.retrievalSystem.banditLearner.importModel(model);
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      monitorMetrics: this.monitor.getMetrics()
    };
  }

  /**
   * Reset learning state (for testing/maintenance)
   */
  async resetLearning(): Promise<void> {
    await this.retrievalSystem.banditLearner.resetLearning();
    this.monitor.reset();
    this.performanceMetrics = {
      totalQueries: 0,
      totalTime: 0,
      averageAccuracy: 0,
      knowledgeEnrichments: 0,
      memoryIntegrations: 0,
      banditUpdates: 0
    };
    
    logger.info('Retrieval learning state reset');
  }

  // Private helper methods

  private async enrichQueryContext(query: RetrievalQuery): Promise<RetrievalQuery> {
    try {
      const enrichedContext = { ...query.context };

      // Enhance with knowledge insights
      if (this.config.enableKnowledgeEnrichment) {
        const knowledgeInsights = await this.getKnowledgeInsights(query);
        enrichedContext.successfulPatterns = [
          ...enrichedContext.successfulPatterns,
          ...knowledgeInsights.patterns
        ];
        
        if (knowledgeInsights.recommendations.length > 0) {
          enrichedContext.recentQueries = [
            ...enrichedContext.recentQueries,
            ...knowledgeInsights.recommendations.slice(0, 3)
          ];
        }
        
        this.performanceMetrics.knowledgeEnrichments++;
      }

      // Enhance with memory insights
      if (this.config.enableMemoryIntegration) {
        const memoryInsights = await this.getMemoryInsights(query);
        if (memoryInsights.relatedQueries.length > 0) {
          enrichedContext.recentQueries = [
            ...enrichedContext.recentQueries,
            ...memoryInsights.relatedQueries.slice(0, 2)
          ];
        }
        
        this.performanceMetrics.memoryIntegrations++;
      }

      return {
        ...query,
        context: enrichedContext
      };
    } catch (error) {
      logger.warn('Failed to enrich query context', error);
      return query; // Return original query if enrichment fails
    }
  }

  private async enrichResults(
    results: RetrievalResults,
    query: RetrievalQuery
  ): Promise<RetrievalResults> {
    try {
      // Add knowledge-based recommendations
      if (this.config.enableKnowledgeEnrichment && results.results.length > 0) {
        const topResult = results.results[0];
        const relatedKnowledge = await this.findRelatedKnowledge(topResult, query);
        
        if (relatedKnowledge.length > 0) {
          // Add related knowledge as additional context (could extend results)
          logger.debug('Found related knowledge', {
            count: relatedKnowledge.length,
            topResult: topResult.entry.id
          });
        }
      }

      // Add memory-based context
      if (this.config.enableMemoryIntegration) {
        const memoryContext = await this.getResultMemoryContext(results, query);
        if (memoryContext.insights.length > 0) {
          logger.debug('Added memory context', {
            insights: memoryContext.insights.length
          });
        }
      }

      return results;
    } catch (error) {
      logger.warn('Failed to enrich results', error);
      return results;
    }
  }

  private async getKnowledgeInsights(query: RetrievalQuery): Promise<{
    patterns: string[];
    recommendations: string[];
  }> {
    try {
      // Search for relevant knowledge cards
      const searchResults = await this.knowledgeManager.searchCards({
        text: query.query,
        limit: 5,
        agentTypes: query.context.agentTypes,
        projectId: query.context.projectId
      });

      const patterns = searchResults
        .filter(result => result.card.type === 'pattern')
        .map(result => result.card.title.toLowerCase())
        .slice(0, 3);

      const recommendations = searchResults
        .filter(result => result.card.effectiveness > 0.7)
        .map(result => result.card.tags.join(' '))
        .slice(0, 2);

      return { patterns, recommendations };
    } catch (error) {
      logger.warn('Failed to get knowledge insights', error);
      return { patterns: [], recommendations: [] };
    }
  }

  private async getMemoryInsights(query: RetrievalQuery): Promise<{
    relatedQueries: string[];
    successPatterns: string[];
  }> {
    try {
      // Get related queries from job memory
      const memoryEntries = await this.memoryManager.searchEntries(query.query, {
        limit: 5,
        agentTypes: query.context.agentTypes
      });

      const relatedQueries = memoryEntries
        .map(entry => entry.content.summary)
        .filter(summary => summary.length > 0)
        .slice(0, 3);

      const successPatterns = memoryEntries
        .filter(entry => entry.outcome === 'success')
        .map(entry => entry.tags.join(' '))
        .slice(0, 2);

      return { relatedQueries, successPatterns };
    } catch (error) {
      logger.warn('Failed to get memory insights', error);
      return { relatedQueries: [], successPatterns: [] };
    }
  }

  private async findRelatedKnowledge(result: any, query: RetrievalQuery): Promise<any[]> {
    try {
      const relatedCards = await this.knowledgeManager.searchCards({
        text: result.entry.title,
        limit: 3,
        excludeIds: [result.entry.id]
      });

      return relatedCards.filter(card => card.relevanceScore > 0.6);
    } catch (error) {
      logger.warn('Failed to find related knowledge', error);
      return [];
    }
  }

  private async getResultMemoryContext(results: RetrievalResults, query: RetrievalQuery): Promise<{
    insights: string[];
    patterns: string[];
  }> {
    try {
      if (results.results.length === 0) {
        return { insights: [], patterns: [] };
      }

      const topResult = results.results[0];
      const memoryEntries = await this.memoryManager.searchEntries(topResult.entry.title, {
        limit: 3
      });

      const insights = memoryEntries
        .map(entry => entry.content.learnings)
        .filter(learning => learning && learning.length > 0)
        .slice(0, 2);

      const patterns = memoryEntries
        .filter(entry => entry.outcome === 'success')
        .map(entry => entry.category)
        .slice(0, 2);

      return { insights, patterns };
    } catch (error) {
      logger.warn('Failed to get result memory context', error);
      return { insights: [], patterns: [] };
    }
  }

  private calculateReward(feedback: UserFeedback): number {
    let reward = 0.5; // Base reward
    
    if (feedback.relevanceRating) {
      reward = feedback.relevanceRating / 5; // 1-5 scale to 0-1
    }
    
    if (feedback.thumbsUp) reward = Math.max(reward, 0.8);
    if (feedback.thumbsDown) reward = Math.min(reward, 0.2);
    if (feedback.usedInSolution) reward = Math.max(reward, 0.9);
    
    // Dwell time bonus
    if (feedback.clicked && feedback.dwellTime > 10000) { // 10+ seconds
      reward += 0.1;
    }
    
    return Math.max(0, Math.min(1, reward));
  }

  private async updateKnowledgeEffectiveness(
    results: RetrievalResults,
    feedback: UserFeedback
  ): Promise<void> {
    try {
      // Find knowledge cards in results and update their effectiveness
      for (const result of results.results) {
        if (result.entry.type === 'knowledge') {
          await this.knowledgeManager.recordUsage(
            result.entry.id,
            feedback.queryId,
            {
              success: feedback.usedInSolution || feedback.relevanceRating > 3,
              timeToResolution: feedback.dwellTime,
              agentType: results.results[0]?.retrievalStrategy || 'unknown',
              feedback: feedback.relevanceRating || 3,
              timestamp: new Date()
            }
          );
        }
      }
    } catch (error) {
      logger.warn('Failed to update knowledge effectiveness', error);
    }
  }

  private async recordMemoryOutcome(
    query: RetrievalQuery,
    results: RetrievalResults,
    feedback: UserFeedback
  ): Promise<void> {
    try {
      const outcome = feedback.usedInSolution ? 'success' : 
                     feedback.relevanceRating && feedback.relevanceRating >= 4 ? 'success' : 'partial';
      
      await this.memoryManager.recordJobMemory({
        issueId: query.context.currentIssue?.id || 'unknown',
        agentType: results.strategyUsed,
        category: 'retrieval',
        content: {
          query: query.query,
          strategy: results.strategyUsed,
          resultCount: results.results.length,
          summary: `Retrieved ${results.results.length} results using ${results.strategyUsed} strategy`,
          context: JSON.stringify(query.context),
          learnings: feedback.usedInSolution ? 'Query was successful and used in solution' : 'Query provided partial results'
        },
        outcome,
        executionTime: results.executionTime,
        tags: [results.strategyUsed, 'retrieval', query.context.projectId],
        relatedIssues: query.context.currentIssue?.id ? [query.context.currentIssue.id] : []
      });
    } catch (error) {
      logger.warn('Failed to record memory outcome', error);
    }
  }

  private updateMetrics(
    totalTime: number,
    results: RetrievalResults | null,
    error: boolean
  ): void {
    this.performanceMetrics.totalQueries++;
    this.performanceMetrics.totalTime += totalTime;
    
    if (results && !error) {
      // Update accuracy based on confidence scores
      const avgConfidence = results.results.reduce((sum, r) => sum + r.confidenceScore, 0) / results.results.length;
      this.performanceMetrics.averageAccuracy = 
        (this.performanceMetrics.averageAccuracy * (this.performanceMetrics.totalQueries - 1) + avgConfidence) / 
        this.performanceMetrics.totalQueries;
    }

    // Update monitor
    this.monitor.recordQuery(totalTime, false, error);
  }
}

/**
 * Factory function to create integrated retrieval service
 */
export function createRetrievalIntegrationService(
  config: Omit<RetrievalIntegrationConfig, 'retrieval'> & {
    retrievalConfig?: Partial<RetrievalConfig>;
  }
): RetrievalIntegrationService {
  const fullConfig: RetrievalIntegrationConfig = {
    ...config,
    retrieval: {
      ...DEFAULT_RETRIEVAL_CONFIG,
      ...config.retrievalConfig
    }
  };

  return new RetrievalIntegrationService(fullConfig);
}

/**
 * Default integration configuration
 */
export const DEFAULT_INTEGRATION_CONFIG = {
  enablePerformanceMonitoring: true,
  enableKnowledgeEnrichment: true,
  enableMemoryIntegration: true,
  retrievalConfig: {
    // Enhanced settings for integration
    bandit: {
      ...DEFAULT_RETRIEVAL_CONFIG.bandit,
      initialEpsilon: 0.2 // Slightly higher exploration for new integrations
    },
    analytics: {
      ...DEFAULT_RETRIEVAL_CONFIG.analytics,
      trackingEnabled: true,
      retentionDays: 30
    }
  }
};