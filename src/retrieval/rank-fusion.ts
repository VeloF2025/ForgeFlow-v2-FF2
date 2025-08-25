// Rank Fusion Engine - Advanced Result Fusion and Ranking Algorithms
// Implements RRF, Borda Count, Weighted Fusion, and Learning-to-Rank

import {
  RankFusionAlgorithm,
  RetrievalResult,
  RetrievalQuery,
  RetrievalStrategy,
  FeatureVector,
  RankingModel,
  RetrievalConfig,
  RetrievalError,
  RetrievalErrorCode
} from './types.js';
import { SearchResult } from '../indexing/types.js';
import { logger } from '../utils/logger.js';

export class RankFusionEngine implements RankFusionAlgorithm {
  private readonly config: RetrievalConfig;
  private rankingModel?: RankingModel;

  constructor(config: RetrievalConfig) {
    this.config = config;
    
    logger.info('RankFusionEngine initialized', {
      fusionAlgorithm: config.hybrid.fusionAlgorithm,
      learningToRank: config.reranking.enabled
    });
  }

  reciprocalRankFusion(
    rankedLists: SearchResult[][],
    k: number = 60
  ): SearchResult[] {
    try {
      if (rankedLists.length === 0) return [];
      if (rankedLists.length === 1) return rankedLists[0];

      const scoreMap = new Map<string, { result: SearchResult; score: number; count: number }>();

      // Calculate RRF scores for each result
      rankedLists.forEach(list => {
        list.forEach((result, rank) => {
          const rrfScore = 1 / (k + rank + 1);
          const existing = scoreMap.get(result.entry.id);
          
          if (existing) {
            existing.score += rrfScore;
            existing.count++;
          } else {
            scoreMap.set(result.entry.id, {
              result,
              score: rrfScore,
              count: 1
            });
          }
        });
      });

      // Sort by combined RRF score and return results
      const fusedResults = Array.from(scoreMap.values())
        .sort((a, b) => b.score - a.score)
        .map((item, index) => ({
          ...item.result,
          score: item.score,
          rank: index + 1
        }));

      logger.debug('Reciprocal Rank Fusion completed', {
        inputLists: rankedLists.length,
        totalResults: scoreMap.size,
        outputResults: fusedResults.length,
        k
      });

      return fusedResults;
    } catch (error) {
      logger.error('Reciprocal Rank Fusion failed', error);
      throw new RetrievalError(
        'Reciprocal Rank Fusion failed',
        RetrievalErrorCode.HYBRID_FUSION_FAILED,
        { error }
      );
    }
  }

  bordaCount(rankedLists: SearchResult[][]): SearchResult[] {
    try {
      if (rankedLists.length === 0) return [];
      if (rankedLists.length === 1) return rankedLists[0];

      const scoreMap = new Map<string, { result: SearchResult; score: number; appearances: number }>();
      const maxRank = Math.max(...rankedLists.map(list => list.length));

      // Calculate Borda Count scores
      rankedLists.forEach(list => {
        list.forEach((result, rank) => {
          const bordaScore = maxRank - rank; // Higher rank = higher score
          const existing = scoreMap.get(result.entry.id);
          
          if (existing) {
            existing.score += bordaScore;
            existing.appearances++;
          } else {
            scoreMap.set(result.entry.id, {
              result,
              score: bordaScore,
              appearances: 1
            });
          }
        });
      });

      // Sort by Borda score and return results
      const fusedResults = Array.from(scoreMap.values())
        .sort((a, b) => {
          // First sort by score, then by number of appearances
          if (b.score !== a.score) return b.score - a.score;
          return b.appearances - a.appearances;
        })
        .map((item, index) => ({
          ...item.result,
          score: item.score / (maxRank * rankedLists.length), // Normalize score
          rank: index + 1
        }));

      logger.debug('Borda Count fusion completed', {
        inputLists: rankedLists.length,
        maxRank,
        totalResults: scoreMap.size,
        outputResults: fusedResults.length
      });

      return fusedResults;
    } catch (error) {
      logger.error('Borda Count fusion failed', error);
      throw new RetrievalError(
        'Borda Count fusion failed',
        RetrievalErrorCode.HYBRID_FUSION_FAILED,
        { error }
      );
    }
  }

  weightedFusion(
    rankedLists: SearchResult[][],
    weights: number[]
  ): SearchResult[] {
    try {
      if (rankedLists.length === 0) return [];
      if (rankedLists.length === 1) return rankedLists[0];
      if (weights.length !== rankedLists.length) {
        throw new Error('Weights array length must match ranked lists length');
      }

      // Normalize weights to sum to 1
      const totalWeight = weights.reduce((sum, w) => sum + w, 0);
      const normalizedWeights = weights.map(w => w / totalWeight);

      const scoreMap = new Map<string, { result: SearchResult; score: number; weightedAppearances: number }>();

      // Calculate weighted scores
      rankedLists.forEach((list, listIndex) => {
        const weight = normalizedWeights[listIndex];
        
        list.forEach((result, rank) => {
          // Use both original score and rank position
          const positionScore = 1 / (rank + 1); // Higher for better positions
          const originalScore = result.score || 1; // Use original score if available
          const combinedScore = (positionScore + originalScore) * weight;
          
          const existing = scoreMap.get(result.entry.id);
          
          if (existing) {
            existing.score += combinedScore;
            existing.weightedAppearances += weight;
          } else {
            scoreMap.set(result.entry.id, {
              result,
              score: combinedScore,
              weightedAppearances: weight
            });
          }
        });
      });

      // Sort by weighted score and return results
      const fusedResults = Array.from(scoreMap.values())
        .sort((a, b) => b.score - a.score)
        .map((item, index) => ({
          ...item.result,
          score: item.score,
          rank: index + 1
        }));

      logger.debug('Weighted fusion completed', {
        inputLists: rankedLists.length,
        weights: normalizedWeights,
        totalResults: scoreMap.size,
        outputResults: fusedResults.length
      });

      return fusedResults;
    } catch (error) {
      logger.error('Weighted fusion failed', error);
      throw new RetrievalError(
        'Weighted fusion failed',
        RetrievalErrorCode.HYBRID_FUSION_FAILED,
        { weights, error }
      );
    }
  }

  learningToRank(
    rankedLists: SearchResult[][],
    features: FeatureVector[],
    model?: RankingModel
  ): SearchResult[] {
    try {
      // If no model provided, fall back to simple feature-based ranking
      if (!model && !this.rankingModel) {
        logger.debug('No ranking model available, using feature-based ranking');
        return this.featureBasedRanking(rankedLists, features);
      }

      const activeModel = model || this.rankingModel!;
      
      // Combine all unique results from ranked lists
      const allResults = this.combineUniqueResults(rankedLists);
      
      if (allResults.length !== features.length) {
        logger.warn('Mismatch between results and features count', {
          results: allResults.length,
          features: features.length
        });
        return allResults; // Fall back to original results
      }

      // Apply learned model to rank results
      const rankedResults = allResults.map((result, index) => {
        const feature = features[index];
        const modelScore = this.applyRankingModel(feature, activeModel);
        
        return {
          ...result,
          score: modelScore,
          rank: 0 // Will be set after sorting
        };
      });

      // Sort by model score and assign ranks
      rankedResults.sort((a, b) => b.score - a.score);
      rankedResults.forEach((result, index) => {
        result.rank = index + 1;
      });

      logger.debug('Learning-to-Rank completed', {
        inputLists: rankedLists.length,
        modelFeatures: activeModel.features.length,
        totalResults: rankedResults.length,
        modelAccuracy: activeModel.accuracy
      });

      return rankedResults;
    } catch (error) {
      logger.error('Learning-to-Rank failed', error);
      // Fall back to reciprocal rank fusion
      return this.reciprocalRankFusion(rankedLists);
    }
  }

  // Advanced fusion method that combines multiple strategies
  async fuseAndRerank(
    rankedLists: RetrievalResult[][],
    query: RetrievalQuery,
    strategy: RetrievalStrategy
  ): Promise<RetrievalResult[]> {
    try {
      if (rankedLists.length === 0) return [];
      if (rankedLists.length === 1) return rankedLists[0];

      // Convert RetrievalResult[][] to SearchResult[][] for fusion
      const searchResultLists = rankedLists.map(list => 
        list.map(result => result as SearchResult)
      );

      let fusedResults: SearchResult[];

      // Choose fusion algorithm based on configuration
      switch (this.config.hybrid.fusionAlgorithm) {
        case 'rrf':
          fusedResults = this.reciprocalRankFusion(searchResultLists);
          break;
        case 'borda':
          fusedResults = this.bordaCount(searchResultLists);
          break;
        case 'weighted':
          const weights = this.getStrategyWeights(strategy);
          fusedResults = this.weightedFusion(searchResultLists, weights);
          break;
        case 'ltr':
          if (this.config.reranking.enabled) {
            const features = rankedLists[0].map(result => result.features);
            fusedResults = this.learningToRank(searchResultLists, features, this.rankingModel);
          } else {
            fusedResults = this.reciprocalRankFusion(searchResultLists);
          }
          break;
        default:
          fusedResults = this.reciprocalRankFusion(searchResultLists);
      }

      // Apply post-fusion enhancements
      const enhancedResults = this.applyPostFusionEnhancements(
        fusedResults,
        query,
        strategy
      );

      // Convert back to RetrievalResult[]
      const retrievalResults = enhancedResults.map(result => ({
        ...result,
        features: rankedLists[0].find(r => r.entry.id === result.entry.id)?.features || {},
        confidenceScore: this.calculatePostFusionConfidence(result),
        retrievalStrategy: strategy,
        rankerUsed: this.config.reranking.enabled ? 'ml-reranker' : 'base'
      } as RetrievalResult));

      logger.debug('Advanced fusion and reranking completed', {
        algorithm: this.config.hybrid.fusionAlgorithm,
        inputLists: rankedLists.length,
        outputResults: retrievalResults.length,
        strategy
      });

      return retrievalResults;
    } catch (error) {
      logger.error('Advanced fusion failed', error);
      // Return the first list as fallback
      return rankedLists.length > 0 ? rankedLists[0] : [];
    }
  }

  // Model training and management
  setRankingModel(model: RankingModel): void {
    this.rankingModel = model;
    logger.info('Ranking model updated', {
      modelVersion: model.modelVersion,
      features: model.features.length,
      accuracy: model.accuracy
    });
  }

  getRankingModel(): RankingModel | undefined {
    return this.rankingModel;
  }

  // Private helper methods

  private featureBasedRanking(
    rankedLists: SearchResult[][],
    features: FeatureVector[]
  ): SearchResult[] {
    const allResults = this.combineUniqueResults(rankedLists);
    
    if (allResults.length !== features.length) {
      return allResults;
    }

    // Simple feature-based scoring
    const scoredResults = allResults.map((result, index) => {
      const feature = features[index];
      const score = this.calculateSimpleFeatureScore(feature);
      
      return {
        ...result,
        score,
        rank: 0
      };
    });

    // Sort and assign ranks
    scoredResults.sort((a, b) => b.score - a.score);
    scoredResults.forEach((result, index) => {
      result.rank = index + 1;
    });

    return scoredResults;
  }

  private combineUniqueResults(rankedLists: SearchResult[][]): SearchResult[] {
    const seenIds = new Set<string>();
    const uniqueResults: SearchResult[] = [];

    rankedLists.forEach(list => {
      list.forEach(result => {
        if (!seenIds.has(result.entry.id)) {
          seenIds.add(result.entry.id);
          uniqueResults.push(result);
        }
      });
    });

    return uniqueResults;
  }

  private applyRankingModel(feature: FeatureVector, model: RankingModel): number {
    try {
      // Simple linear model application
      let score = model.bias;
      
      // Apply weights to features (simplified feature extraction)
      const featureArray = this.extractFeatureArray(feature);
      
      for (let i = 0; i < Math.min(model.weights.length, featureArray.length); i++) {
        score += model.weights[i] * featureArray[i];
      }
      
      // Apply sigmoid function to normalize score to [0, 1]
      return 1 / (1 + Math.exp(-score));
    } catch (error) {
      logger.warn('Failed to apply ranking model', error);
      return 0.5; // Default score
    }
  }

  private extractFeatureArray(feature: FeatureVector): number[] {
    // Convert FeatureVector to a flat array of numbers for model application
    return [
      feature.basic.titleMatchScore,
      feature.basic.contentMatchScore,
      feature.basic.tagMatchScore,
      feature.basic.categoryMatch ? 1 : 0,
      feature.recency.creationDecay,
      feature.recency.modificationDecay,
      feature.recency.usageDecay,
      feature.proximity.wordOverlapRatio,
      feature.proximity.cosineSimilarity,
      feature.proximity.exactPhraseMatch ? 1 : 0,
      feature.affinity.agentTypeRelevance,
      feature.affinity.projectRelevance,
      feature.affinity.userSuccessRate,
      feature.semantic.complexityScore,
      feature.semantic.readabilityScore,
      feature.semantic.hasCodeExamples ? 1 : 0,
      feature.context.issueRelevance,
      feature.context.isWorkingHours ? 1 : 0,
      feature.context.activeProject ? 1 : 0,
      feature.derived.overallRelevance,
      feature.derived.uncertaintyScore || 0.5,
      feature.derived.noveltyScore
    ];
  }

  private calculateSimpleFeatureScore(feature: FeatureVector): number {
    // Weighted combination of key features
    const weights = {
      titleMatch: 0.25,
      contentMatch: 0.15,
      proximity: 0.15,
      recency: 0.1,
      affinity: 0.15,
      context: 0.1,
      overall: 0.1
    };

    return (
      feature.basic.titleMatchScore * weights.titleMatch +
      feature.basic.contentMatchScore * weights.contentMatch +
      feature.proximity.wordOverlapRatio * weights.proximity +
      feature.recency.usageDecay * weights.recency +
      feature.affinity.agentTypeRelevance * weights.affinity +
      feature.context.issueRelevance * weights.context +
      feature.derived.overallRelevance * weights.overall
    );
  }

  private getStrategyWeights(strategy: RetrievalStrategy): number[] {
    // Return weights for different fusion lists based on strategy
    switch (strategy) {
      case 'fts-heavy':
        return [0.8, 0.2]; // Heavy weight on FTS results
      case 'vector-heavy':
        return [0.2, 0.8]; // Heavy weight on vector results
      case 'semantic-focused':
        return [0.4, 0.4, 0.2]; // Balanced FTS/vector, light semantic
      case 'balanced':
      default:
        return [0.5, 0.5]; // Equal weights
    }
  }

  private applyPostFusionEnhancements(
    results: SearchResult[],
    query: RetrievalQuery,
    strategy: RetrievalStrategy
  ): SearchResult[] {
    // Apply strategy-specific enhancements after fusion
    let enhancedResults = [...results];

    // Diversity enhancement - avoid too many results from same source
    enhancedResults = this.enhanceDiversity(enhancedResults);

    // Query-specific boosting
    enhancedResults = this.applyQuerySpecificBoosting(enhancedResults, query);

    // Strategy-specific reordering
    enhancedResults = this.applyStrategySpecificReordering(enhancedResults, strategy);

    return enhancedResults;
  }

  private enhanceDiversity(results: SearchResult[]): SearchResult[] {
    // Simple diversity enhancement - penalize results from same category/type
    const seenCategories = new Map<string, number>();
    const seenTypes = new Map<string, number>();
    
    return results.map(result => {
      const category = result.entry.metadata.category || 'unknown';
      const type = result.entry.type;
      
      const categoryCount = seenCategories.get(category) || 0;
      const typeCount = seenTypes.get(type) || 0;
      
      // Apply small penalty for repeated categories/types
      const diversityPenalty = Math.min(0.1, (categoryCount + typeCount) * 0.02);
      
      seenCategories.set(category, categoryCount + 1);
      seenTypes.set(type, typeCount + 1);
      
      return {
        ...result,
        score: Math.max(0, result.score - diversityPenalty)
      };
    });
  }

  private applyQuerySpecificBoosting(
    results: SearchResult[],
    query: RetrievalQuery
  ): SearchResult[] {
    // Boost results based on query context
    return results.map(result => {
      let boost = 0;
      
      // Boost results matching current project
      if (result.entry.metadata.projectId === query.context.projectId) {
        boost += 0.05;
      }
      
      // Boost results matching agent types
      if (query.context.agentTypes.some(agent => 
        result.entry.metadata.agentTypes.includes(agent)
      )) {
        boost += 0.03;
      }
      
      // Boost recent results if query seems urgent
      const urgentKeywords = ['critical', 'urgent', 'fix', 'broken', 'error'];
      if (urgentKeywords.some(keyword => 
        query.query.toLowerCase().includes(keyword)
      )) {
        const daysSinceModified = (Date.now() - result.entry.lastModified.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceModified < 7) boost += 0.04;
      }
      
      return {
        ...result,
        score: result.score + boost
      };
    });
  }

  private applyStrategySpecificReordering(
    results: SearchResult[],
    strategy: RetrievalStrategy
  ): SearchResult[] {
    switch (strategy) {
      case 'recency-focused':
        return results.sort((a, b) => {
          // First sort by score, then by recency
          if (Math.abs(b.score - a.score) < 0.1) {
            return b.entry.lastModified.getTime() - a.entry.lastModified.getTime();
          }
          return b.score - a.score;
        });
        
      case 'effectiveness-focused':
        return results.sort((a, b) => {
          // First sort by score, then by effectiveness
          if (Math.abs(b.score - a.score) < 0.1) {
            const aEff = a.entry.metadata.effectiveness || 0;
            const bEff = b.entry.metadata.effectiveness || 0;
            return bEff - aEff;
          }
          return b.score - a.score;
        });
        
      case 'popularity-focused':
        return results.sort((a, b) => {
          // First sort by score, then by usage count
          if (Math.abs(b.score - a.score) < 0.1) {
            const aUsage = a.entry.metadata.usageCount || 0;
            const bUsage = b.entry.metadata.usageCount || 0;
            return bUsage - aUsage;
          }
          return b.score - a.score;
        });
        
      default:
        return results;
    }
  }

  private calculatePostFusionConfidence(result: SearchResult): number {
    // Calculate confidence based on various factors
    let confidence = Math.min(result.score, 1.0);
    
    // Boost confidence for exact matches
    if (result.titleSnippet?.includes('<mark>') || result.contentSnippets.some(s => s.highlighted.includes('<mark>'))) {
      confidence += 0.1;
    }
    
    // Consider result rank (higher rank = higher confidence)
    if (result.rank <= 3) confidence += 0.05;
    if (result.rank <= 10) confidence += 0.02;
    
    return Math.min(confidence, 1.0);
  }
}