// Hybrid Retrieval Engine - ML-Enhanced Multi-Strategy Retrieval System
// Combines FTS, vector search, and semantic retrieval with learned fusion

import type {
  HybridRetriever as IHybridRetriever,
  RetrievalQuery,
  RetrievalResults,
  RetrievalResult,
  RetrievalStrategy,
  RetrievalWeights,
  SearchContext,
  UserFeedback,
  RetrievalConfig,
} from './types.js';
import { HybridRetrievalMode, RetrievalError, RetrievalErrorCode } from './types.js';
import type { SearchResult } from '../indexing/types.js';
import { SearchResults } from '../indexing/types.js';
import type { ISearchEngine } from '../indexing/types.js';
import type { BanditAlgorithm } from './types.js';
import { SmartFeatureExtractor } from './feature-extractor.js';
import { RankFusionEngine } from './rank-fusion.js';
import { logger } from '../utils/logger.js';

export class IntelligentHybridRetriever implements IHybridRetriever {
  private readonly searchEngine: ISearchEngine;
  private readonly banditLearner: BanditAlgorithm;
  private readonly featureExtractor: SmartFeatureExtractor;
  private readonly rankFusion: RankFusionEngine;
  private readonly config: RetrievalConfig;

  // Performance tracking
  private readonly performanceMetrics = new Map<
    string,
    {
      totalTime: number;
      totalQueries: number;
      averageFeatures: number;
      successRate: number;
    }
  >();

  // Result caching for performance
  private readonly resultCache = new Map<
    string,
    {
      results: RetrievalResults;
      timestamp: Date;
      ttl: number;
    }
  >();

  constructor(
    searchEngine: ISearchEngine,
    banditLearner: BanditAlgorithm,
    config: RetrievalConfig,
  ) {
    this.searchEngine = searchEngine;
    this.banditLearner = banditLearner;
    this.featureExtractor = new SmartFeatureExtractor(config.features);
    this.rankFusion = new RankFusionEngine(config);
    this.config = config;

    // Initialize performance tracking
    this.initializePerformanceTracking();

    logger.info('IntelligentHybridRetriever initialized', {
      hybridMode: config.hybrid.defaultMode,
      fusionAlgorithm: config.hybrid.fusionAlgorithm,
      vectorSearchEnabled: config.hybrid.enableVectorSearch,
      cacheEnabled: config.performance.cacheEnabled,
    });
  }

  async retrieve(query: RetrievalQuery): Promise<RetrievalResults> {
    const startTime = Date.now();
    const queryId = this.generateQueryId(query);

    try {
      // Check cache first
      if (this.config.performance.cacheEnabled) {
        const cached = await this.getCachedResults(query);
        if (cached) {
          logger.debug('Retrieved results from cache', { queryId });
          return cached;
        }
      }

      // Select optimal retrieval strategy using bandit algorithm
      const strategy = await this.getOptimalStrategy(query.context);

      logger.info('Starting hybrid retrieval', {
        queryId,
        strategy,
        mode: query.hybridMode || this.config.hybrid.defaultMode,
        query: query.query.substring(0, 100),
      });

      // Execute retrieval based on selected strategy and mode
      const rawResults = await this.executeRetrieval(query, strategy);

      // Extract features for all candidates
      const featureStartTime = Date.now();
      const candidateFeatures = await this.featureExtractor.extractBatchFeatures(
        query,
        rawResults.map((result) => result.entry),
      );
      const featureTime = Date.now() - featureStartTime;

      // Convert SearchResults to RetrievalResults with ML enhancements
      const enrichedResults = await this.enrichResults(
        rawResults,
        candidateFeatures,
        strategy,
        query,
      );

      // Apply rank fusion and final scoring
      const fusedResults = await this.rankFusion.fuseAndRerank([enrichedResults], query, strategy);

      const totalTime = Date.now() - startTime;

      const retrievalResults: RetrievalResults = {
        results: fusedResults.slice(0, query.limit || 20),
        totalMatches: rawResults.length,
        totalPages: Math.ceil(rawResults.length / (query.limit || 20)),
        currentPage: Math.floor((query.offset || 0) / (query.limit || 20)) + 1,
        executionTime: totalTime,
        facets: { types: [], categories: [], tags: [], projects: [], agents: [], languages: [] }, // Simplified
        suggestions: [],

        // ML-specific metadata
        strategyUsed: strategy,
        explorationPerformed: query.explorationRate ? query.explorationRate > 0.1 : false,
        adaptiveLearningActive: query.adaptiveWeights !== false,
        featureExtractionTime: featureTime,
        rankingTime: totalTime - featureTime,
        totalMLTime: featureTime,
      };

      // Cache results if enabled
      if (this.config.performance.cacheEnabled) {
        await this.cacheResults(query, retrievalResults);
      }

      // Update performance metrics
      this.updatePerformanceMetrics(strategy, totalTime, featureTime, true);

      logger.info('Hybrid retrieval completed', {
        queryId,
        strategy,
        totalResults: retrievalResults.results.length,
        totalTime,
        featureTime,
        avgRelevance: this.calculateAverageRelevance(retrievalResults.results),
      });

      return retrievalResults;
    } catch (error) {
      const totalTime = Date.now() - startTime;
      logger.error('Hybrid retrieval failed', {
        queryId,
        error,
        totalTime,
      });

      // Update performance metrics for failure
      const strategy = 'balanced'; // Default fallback
      this.updatePerformanceMetrics(strategy, totalTime, 0, false);

      throw new RetrievalError('Hybrid retrieval failed', RetrievalErrorCode.HYBRID_FUSION_FAILED, {
        query: query.query,
        error,
      });
    }
  }

  async performFTSRetrieval(query: RetrievalQuery): Promise<SearchResult[]> {
    try {
      const searchQuery = this.convertToSearchQuery(query, 'fts');
      const results = await this.searchEngine.search(searchQuery);

      logger.debug('FTS retrieval completed', {
        query: query.query,
        results: results.results.length,
        executionTime: results.executionTime,
      });

      return results.results;
    } catch (error) {
      logger.error('FTS retrieval failed', error);
      throw new RetrievalError('FTS retrieval failed', RetrievalErrorCode.HYBRID_FUSION_FAILED, {
        query: query.query,
        error,
      });
    }
  }

  async performVectorRetrieval(query: RetrievalQuery): Promise<SearchResult[]> {
    try {
      if (!this.config.hybrid.enableVectorSearch) {
        logger.debug('Vector search disabled, returning empty results');
        return [];
      }

      // TODO: Implement actual vector search
      // This would integrate with a vector database like Pinecone, Weaviate, or local embeddings
      logger.debug('Vector retrieval placeholder - returning empty results');
      return [];
    } catch (error) {
      logger.error('Vector retrieval failed', error);
      throw new RetrievalError('Vector retrieval failed', RetrievalErrorCode.HYBRID_FUSION_FAILED, {
        query: query.query,
        error,
      });
    }
  }

  async performSemanticRetrieval(query: RetrievalQuery): Promise<SearchResult[]> {
    try {
      // Semantic search using enhanced query processing
      const semanticQuery = this.enhanceQueryForSemantic(query);
      const results = await this.searchEngine.search(semanticQuery);

      logger.debug('Semantic retrieval completed', {
        originalQuery: query.query,
        enhancedQuery: semanticQuery.query,
        results: results.results.length,
      });

      return results.results;
    } catch (error) {
      logger.error('Semantic retrieval failed', error);
      throw new RetrievalError(
        'Semantic retrieval failed',
        RetrievalErrorCode.HYBRID_FUSION_FAILED,
        { query: query.query, error },
      );
    }
  }

  async fuseResults(
    ftsResults: SearchResult[],
    vectorResults: SearchResult[],
    weights: RetrievalWeights,
  ): Promise<SearchResult[]> {
    try {
      const rankedLists = [ftsResults, vectorResults].filter((list) => list.length > 0);

      if (rankedLists.length === 0) return [];
      if (rankedLists.length === 1) return rankedLists[0];

      // Use configured fusion algorithm
      switch (this.config.hybrid.fusionAlgorithm) {
        case 'rrf':
          return this.rankFusion.reciprocalRankFusion(rankedLists);
        case 'borda':
          return this.rankFusion.bordaCount(rankedLists);
        case 'weighted':
          return this.rankFusion.weightedFusion(rankedLists, [
            weights.ftsWeight,
            weights.vectorWeight,
          ]);
        default:
          return this.rankFusion.reciprocalRankFusion(rankedLists);
      }
    } catch (error) {
      logger.error('Result fusion failed', error);
      throw new RetrievalError('Result fusion failed', RetrievalErrorCode.HYBRID_FUSION_FAILED, {
        error,
      });
    }
  }

  async getOptimalStrategy(context: SearchContext): Promise<RetrievalStrategy> {
    try {
      return await this.banditLearner.selectArm(context);
    } catch (error) {
      logger.error('Failed to get optimal strategy from bandit', error);
      return 'balanced'; // Fallback to balanced strategy
    }
  }

  async adaptWeights(
    strategy: RetrievalStrategy,
    feedback: UserFeedback[],
  ): Promise<RetrievalWeights> {
    try {
      if (feedback.length === 0) {
        return this.getDefaultWeights(strategy);
      }

      // Calculate average feedback score
      const avgRelevance =
        feedback.reduce((sum, fb) => {
          let score = 0;
          if (fb.relevanceRating) score += fb.relevanceRating / 5;
          if (fb.thumbsUp) score += 1;
          if (fb.thumbsDown) score -= 0.5;
          if (fb.clicked) score += 0.3;
          if (fb.usedInSolution) score += 0.7;
          return sum + Math.max(0, Math.min(1, score));
        }, 0) / feedback.length;

      // Update bandit with aggregated feedback
      // Note: This is a simplified approach - in production, you'd want more sophisticated feedback processing
      for (const fb of feedback) {
        const reward = this.calculateRewardFromFeedback(fb);
        // Context would need to be stored/reconstructed for proper bandit updates
        const mockContext: SearchContext = {
          projectId: 'unknown',
          agentTypes: ['unknown'],
          preferredLanguages: [],
          expertiseLevel: 'intermediate',
          recentQueries: [],
          recentResults: [],
          successfulPatterns: [],
          timestamp: new Date(),
        };

        await this.banditLearner.updateReward(strategy, mockContext, reward);
      }

      // Adapt weights based on feedback
      const baseWeights = this.getDefaultWeights(strategy);
      const adaptationFactor = avgRelevance > 0.6 ? 1.1 : 0.9;

      return {
        ftsWeight: baseWeights.ftsWeight * adaptationFactor,
        vectorWeight: baseWeights.vectorWeight * adaptationFactor,
        recencyWeight: baseWeights.recencyWeight,
        proximityWeight: baseWeights.proximityWeight * adaptationFactor,
        affinityWeight: baseWeights.affinityWeight,
        semanticWeight: baseWeights.semanticWeight,
        popularityWeight: baseWeights.popularityWeight,
        effectivenessWeight: baseWeights.effectivenessWeight,
        projectRelevanceWeight: baseWeights.projectRelevanceWeight,
        agentTypeWeight: baseWeights.agentTypeWeight,
      };
    } catch (error) {
      logger.error('Failed to adapt weights', error);
      return this.getDefaultWeights(strategy);
    }
  }

  // Private helper methods

  private async executeRetrieval(
    query: RetrievalQuery,
    strategy: RetrievalStrategy,
  ): Promise<SearchResult[]> {
    const mode = query.hybridMode || this.config.hybrid.defaultMode;

    switch (mode) {
      case 'parallel':
        return await this.executeParallelRetrieval(query, strategy);
      case 'cascade':
        return await this.executeCascadeRetrieval(query, strategy);
      case 'adaptive':
        return await this.executeAdaptiveRetrieval(query, strategy);
      case 'ensemble':
        return await this.executeEnsembleRetrieval(query, strategy);
      default:
        return await this.executeParallelRetrieval(query, strategy);
    }
  }

  private async executeParallelRetrieval(
    query: RetrievalQuery,
    strategy: RetrievalStrategy,
  ): Promise<SearchResult[]> {
    const timeout = this.config.hybrid.parallelTimeout;

    try {
      // Execute FTS and other retrieval methods in parallel
      const retrievalPromises: Promise<SearchResult[]>[] = [];

      // Always include FTS
      retrievalPromises.push(this.performFTSRetrieval(query));

      // Add vector search if enabled and strategy supports it
      if (this.shouldUseVectorSearch(strategy)) {
        retrievalPromises.push(this.performVectorRetrieval(query));
      }

      // Add semantic search for semantic-focused strategies
      if (strategy === 'semantic-focused') {
        retrievalPromises.push(this.performSemanticRetrieval(query));
      }

      // Execute with timeout
      const results = await Promise.all(
        retrievalPromises.map((promise) =>
          Promise.race([
            promise,
            new Promise<SearchResult[]>((_, reject) =>
              setTimeout(() => reject(new Error('Retrieval timeout')), timeout),
            ),
          ]),
        ),
      );

      // Fuse results
      const weights = this.getDefaultWeights(strategy);
      return await this.fuseResults(results[0], results[1] || [], weights);
    } catch (error) {
      logger.warn('Parallel retrieval failed, falling back to FTS only', error);
      return await this.performFTSRetrieval(query);
    }
  }

  private async executeCascadeRetrieval(
    query: RetrievalQuery,
    strategy: RetrievalStrategy,
  ): Promise<SearchResult[]> {
    // Try FTS first
    const ftsResults = await this.performFTSRetrieval(query);

    // If we have good results, return them
    const goodResultsThreshold = 5;
    if (ftsResults.length >= goodResultsThreshold) {
      const avgScore = ftsResults.reduce((sum, r) => sum + r.score, 0) / ftsResults.length;
      if (avgScore > 0.5) {
        return ftsResults;
      }
    }

    // Otherwise, try vector search or semantic search
    if (this.shouldUseVectorSearch(strategy)) {
      const vectorResults = await this.performVectorRetrieval(query);
      if (vectorResults.length > 0) {
        const weights = this.getDefaultWeights(strategy);
        return await this.fuseResults(ftsResults, vectorResults, weights);
      }
    }

    return ftsResults;
  }

  private async executeAdaptiveRetrieval(
    query: RetrievalQuery,
    strategy: RetrievalStrategy,
  ): Promise<SearchResult[]> {
    // Use bandit algorithm to decide which retrieval methods to use
    const optimalStrategy = await this.getOptimalStrategy(query.context);

    // Adapt the execution based on learned strategy
    if (optimalStrategy === 'fts-heavy') {
      return await this.performFTSRetrieval(query);
    } else if (optimalStrategy === 'vector-heavy') {
      const vectorResults = await this.performVectorRetrieval(query);
      if (vectorResults.length === 0) {
        return await this.performFTSRetrieval(query);
      }
      return vectorResults;
    } else {
      return await this.executeParallelRetrieval(query, optimalStrategy);
    }
  }

  private async executeEnsembleRetrieval(
    query: RetrievalQuery,
    strategy: RetrievalStrategy,
  ): Promise<SearchResult[]> {
    // Execute multiple strategies and combine results
    const strategies: RetrievalStrategy[] = ['fts-heavy', 'semantic-focused'];
    if (this.shouldUseVectorSearch(strategy)) {
      strategies.push('vector-heavy');
    }

    const allResults: SearchResult[][] = [];
    for (const strat of strategies) {
      try {
        const results = await this.executeStrategySpecificRetrieval(query, strat);
        if (results.length > 0) {
          allResults.push(results);
        }
      } catch (error) {
        logger.warn(`Strategy ${strat} failed in ensemble`, error);
      }
    }

    if (allResults.length === 0) {
      return await this.performFTSRetrieval(query);
    }

    // Use advanced fusion for ensemble
    return this.rankFusion.reciprocalRankFusion(allResults);
  }

  private async executeStrategySpecificRetrieval(
    query: RetrievalQuery,
    strategy: RetrievalStrategy,
  ): Promise<SearchResult[]> {
    switch (strategy) {
      case 'fts-heavy':
        return await this.performFTSRetrieval(query);
      case 'vector-heavy':
        return await this.performVectorRetrieval(query);
      case 'semantic-focused':
        return await this.performSemanticRetrieval(query);
      case 'recency-focused':
        return await this.performFTSRetrieval(this.enhanceQueryForRecency(query));
      case 'effectiveness-focused':
        return await this.performFTSRetrieval(this.enhanceQueryForEffectiveness(query));
      case 'popularity-focused':
        return await this.performFTSRetrieval(this.enhanceQueryForPopularity(query));
      default:
        return await this.performFTSRetrieval(query);
    }
  }

  private async enrichResults(
    rawResults: SearchResult[],
    features: any[],
    strategy: RetrievalStrategy,
    query: RetrievalQuery,
  ): Promise<RetrievalResult[]> {
    return rawResults.map((result, index) => ({
      ...result,
      features: features[index],
      confidenceScore: this.calculateConfidenceScore(result, features[index]),
      explorationBonus: query.explorationRate ? query.explorationRate * 0.1 : 0,
      retrievalStrategy: strategy,
      rankerUsed: 'base',
    }));
  }

  private convertToSearchQuery(query: RetrievalQuery, type: 'fts' | 'semantic'): RetrievalQuery {
    return {
      query: query.query,
      context: query.context,
      type: query.type,
      category: query.category,
      tags: query.tags,
      projectId: query.projectId,
      agentTypes: query.agentTypes,
      fuzzy: query.fuzzy,
      phrase: query.phrase,
      boolean: query.boolean,
      limit: query.limit,
      offset: query.offset,
      includeSnippets: query.includeSnippets,
      snippetLength: query.snippetLength,
      highlightResults: query.highlightResults,
      minScore: query.minScore,
      boostRecent: type === 'fts' ? query.boostRecent : false,
      boostEffective: query.boostEffective,
      customWeights: query.customWeights,
      createdAfter: query.createdAfter,
      createdBefore: query.createdBefore,
      modifiedAfter: query.modifiedAfter,
      modifiedBefore: query.modifiedBefore,
      usedAfter: query.usedAfter,
      explorationRate: query.explorationRate,
      adaptiveWeights: query.adaptiveWeights,
      enableReranker: query.enableReranker,
      vectorSearch: query.vectorSearch,
      hybridMode: query.hybridMode,
      sessionId: query.sessionId,
      userId: query.userId,
      agentType: query.agentType,
    };
  }

  private enhanceQueryForSemantic(query: RetrievalQuery) {
    // Enhance query with semantic expansion
    const enhanced = { ...this.convertToSearchQuery(query, 'semantic') };

    // Add semantic keywords based on context
    const semanticKeywords = this.extractSemanticKeywords(query);
    if (semanticKeywords.length > 0) {
      enhanced.query = `${enhanced.query} ${semanticKeywords.join(' ')}`;
    }

    return enhanced;
  }

  private enhanceQueryForRecency(query: RetrievalQuery) {
    const enhanced = { ...this.convertToSearchQuery(query, 'fts') };
    enhanced.boostRecent = true;
    enhanced.customWeights = {
      ...enhanced.customWeights,
      recency: 2.0,
    };
    return enhanced;
  }

  private enhanceQueryForEffectiveness(query: RetrievalQuery) {
    const enhanced = { ...this.convertToSearchQuery(query, 'fts') };
    enhanced.boostEffective = true;
    enhanced.customWeights = {
      ...enhanced.customWeights,
      effectiveness: 2.0,
    };
    return enhanced;
  }

  private enhanceQueryForPopularity(query: RetrievalQuery) {
    const enhanced = { ...this.convertToSearchQuery(query, 'fts') };
    enhanced.customWeights = {
      ...enhanced.customWeights,
      content: 1.5, // Boost content that's been accessed more
    };
    return enhanced;
  }

  private extractSemanticKeywords(query: RetrievalQuery): string[] {
    // Simple semantic keyword extraction
    const context = query.context;
    const keywords: string[] = [];

    // Add issue-related keywords
    if (context.currentIssue) {
      keywords.push(...context.currentIssue.labels);
    }

    // Add agent-type specific keywords
    keywords.push(...context.agentTypes);

    // Add recent successful patterns
    keywords.push(...context.successfulPatterns);

    return keywords.filter((k) => k.length > 2).slice(0, 5); // Limit to 5 keywords
  }

  private shouldUseVectorSearch(strategy: RetrievalStrategy): boolean {
    return (
      this.config.hybrid.enableVectorSearch &&
      (strategy === 'vector-heavy' || strategy === 'balanced' || strategy === 'semantic-focused')
    );
  }

  private getDefaultWeights(strategy: RetrievalStrategy): RetrievalWeights {
    const baseWeights: RetrievalWeights = {
      ftsWeight: 1.0,
      vectorWeight: 1.0,
      recencyWeight: 0.1,
      proximityWeight: 0.8,
      affinityWeight: 0.6,
      semanticWeight: 0.5,
      popularityWeight: 0.3,
      effectivenessWeight: 0.4,
      projectRelevanceWeight: 0.7,
      agentTypeWeight: 0.5,
    };

    // Adjust weights based on strategy
    switch (strategy) {
      case 'fts-heavy':
        return { ...baseWeights, ftsWeight: 2.0, vectorWeight: 0.3 };
      case 'vector-heavy':
        return { ...baseWeights, ftsWeight: 0.3, vectorWeight: 2.0 };
      case 'recency-focused':
        return { ...baseWeights, recencyWeight: 1.5 };
      case 'effectiveness-focused':
        return { ...baseWeights, effectivenessWeight: 1.5 };
      case 'popularity-focused':
        return { ...baseWeights, popularityWeight: 1.5 };
      case 'semantic-focused':
        return { ...baseWeights, semanticWeight: 1.5, vectorWeight: 1.5 };
      default:
        return baseWeights;
    }
  }

  private calculateConfidenceScore(result: SearchResult, features: any): number {
    // Simple confidence calculation based on multiple factors
    let confidence = result.score / 10; // Normalize base score

    // Add feature-based confidence
    if (features.proximity?.exactPhraseMatch) confidence += 0.3;
    if (features.affinity?.agentTypeRelevance > 0.7) confidence += 0.2;
    if (features.context?.activeProject) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  private calculateRewardFromFeedback(feedback: UserFeedback): number {
    let reward = 0.5; // Base reward

    if (feedback.relevanceRating) {
      reward = feedback.relevanceRating / 5; // 1-5 scale to 0-1
    }

    if (feedback.thumbsUp) reward = Math.max(reward, 0.8);
    if (feedback.thumbsDown) reward = Math.min(reward, 0.2);
    if (feedback.usedInSolution) reward = Math.max(reward, 0.9);
    if (feedback.clicked && feedback.dwellTime > 10000) reward += 0.1; // 10+ seconds

    return Math.max(0, Math.min(1, reward));
  }

  private calculateAverageRelevance(results: RetrievalResult[]): number {
    if (results.length === 0) return 0;
    return results.reduce((sum, r) => sum + r.confidenceScore, 0) / results.length;
  }

  private generateQueryId(query: RetrievalQuery): string {
    return `q_${Date.now()}_${query.query.substring(0, 10).replace(/\s/g, '')}`;
  }

  private async getCachedResults(query: RetrievalQuery): Promise<RetrievalResults | null> {
    const cacheKey = this.generateCacheKey(query);
    const cached = this.resultCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp.getTime() < cached.ttl) {
      return cached.results;
    }

    if (cached) {
      this.resultCache.delete(cacheKey);
    }

    return null;
  }

  private async cacheResults(query: RetrievalQuery, results: RetrievalResults): Promise<void> {
    const cacheKey = this.generateCacheKey(query);
    this.resultCache.set(cacheKey, {
      results,
      timestamp: new Date(),
      ttl: this.config.performance.cacheTTL,
    });

    // Clean up old cache entries
    if (this.resultCache.size > 1000) {
      // Max 1000 cached queries
      const oldestKey = this.resultCache.keys().next().value;
      this.resultCache.delete(oldestKey);
    }
  }

  private generateCacheKey(query: RetrievalQuery): string {
    return JSON.stringify({
      query: query.query,
      type: query.type,
      projectId: query.projectId,
      agentTypes: query.agentTypes,
      limit: query.limit,
      offset: query.offset,
    });
  }

  private initializePerformanceTracking(): void {
    // Initialize performance tracking for all strategies
    const strategies: RetrievalStrategy[] = [
      'fts-heavy',
      'vector-heavy',
      'balanced',
      'recency-focused',
      'effectiveness-focused',
      'popularity-focused',
      'semantic-focused',
    ];

    strategies.forEach((strategy) => {
      this.performanceMetrics.set(strategy, {
        totalTime: 0,
        totalQueries: 0,
        averageFeatures: 0,
        successRate: 0,
      });
    });
  }

  private updatePerformanceMetrics(
    strategy: RetrievalStrategy,
    totalTime: number,
    featureTime: number,
    success: boolean,
  ): void {
    const metrics = this.performanceMetrics.get(strategy);
    if (!metrics) return;

    metrics.totalQueries++;
    metrics.totalTime += totalTime;
    metrics.averageFeatures =
      (metrics.averageFeatures * (metrics.totalQueries - 1) + featureTime) / metrics.totalQueries;
    metrics.successRate =
      (metrics.successRate * (metrics.totalQueries - 1) + (success ? 1 : 0)) / metrics.totalQueries;

    this.performanceMetrics.set(strategy, metrics);
  }
}

// Export alias for backward compatibility
export { IntelligentHybridRetriever as HybridRetriever };
