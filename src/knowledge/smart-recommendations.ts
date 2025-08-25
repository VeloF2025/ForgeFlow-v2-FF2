// Smart Knowledge Recommendations Engine
// Provides intelligent knowledge recommendations based on context and patterns

import { KnowledgeCard, GotchaPattern, Issue, Agent, KnowledgeQuery, KnowledgeSearchResult } from '../types';
import { KnowledgeManager } from './knowledge-manager';
import { logger } from '../utils/logger';

export interface RecommendationContext {
  issueTitle: string;
  issueDescription: string;
  agentType: string;
  projectId?: string;
  techStack?: string[];
  previousFailures?: string[];
  timeConstraint?: number; // minutes
}

export interface KnowledgeRecommendation {
  card: KnowledgeCard;
  relevanceScore: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  reasoning: string[];
  applicabilityScore: number; // How likely this will solve the problem (0-1)
  riskLevel: 'low' | 'medium' | 'high';
}

export interface PatternInsight {
  pattern: string;
  frequency: number;
  successRate: number;
  averageTimeToResolution: number;
  commonSolutions: string[];
  relatedIssueTypes: string[];
}

/**
 * Smart Recommendations Engine
 * 
 * Provides intelligent knowledge recommendations using:
 * - Semantic analysis of issue content
 * - Historical success patterns
 * - Agent-specific expertise matching
 * - Context-aware filtering
 * - Risk assessment
 */
export class SmartRecommendationsEngine {
  private knowledgeManager: KnowledgeManager;
  private patternCache: Map<string, PatternInsight> = new Map();
  private lastCacheUpdate = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(knowledgeManager: KnowledgeManager) {
    this.knowledgeManager = knowledgeManager;
  }

  /**
   * Get intelligent knowledge recommendations for a given context
   * @param context The problem context
   * @returns Ranked recommendations with confidence scores
   */
  async getRecommendations(context: RecommendationContext): Promise<KnowledgeRecommendation[]> {
    try {
      logger.debug(`Getting recommendations for agent ${context.agentType} on issue: ${context.issueTitle}`);

      // Extract keywords and analyze context
      const keywords = this.extractKeywords(context);
      const techKeywords = this.extractTechnicalKeywords(context);
      
      // Search for relevant knowledge cards
      const searchResults = await this.searchRelevantKnowledge(keywords, context);
      
      // Score and rank recommendations
      const recommendations = await this.scoreRecommendations(searchResults, context, keywords, techKeywords);
      
      // Filter and limit results
      const filteredRecommendations = this.filterRecommendations(recommendations, context);
      
      logger.debug(`Generated ${filteredRecommendations.length} recommendations`);
      return filteredRecommendations;
    } catch (error) {
      logger.error('Failed to generate knowledge recommendations:', error);
      throw new Error(`Failed to get recommendations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Analyze patterns in knowledge usage and effectiveness
   * @returns Insights about common patterns and solutions
   */
  async analyzePatterns(): Promise<PatternInsight[]> {
    try {
      await this.updatePatternCache();
      return Array.from(this.patternCache.values())
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 20); // Top 20 patterns
    } catch (error) {
      logger.error('Failed to analyze patterns:', error);
      throw new Error(`Failed to analyze patterns: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get recommendations specifically for preventing known gotchas
   * @param context The problem context
   * @returns Preventive recommendations
   */
  async getPreventiveRecommendations(context: RecommendationContext): Promise<KnowledgeRecommendation[]> {
    try {
      // Get gotcha patterns that might apply
      const gotchaStats = await this.knowledgeManager.getGotchaStats();
      const relevantGotchas: KnowledgeRecommendation[] = [];

      // Search for gotcha-related knowledge cards
      const gotchaQuery: KnowledgeQuery = {
        text: `${context.issueTitle} ${context.issueDescription}`,
        filters: {
          type: ['gotcha'],
          agentTypes: [context.agentType]
        },
        limit: 10
      };

      const gotchaResults = await this.knowledgeManager.searchCards(gotchaQuery);
      
      for (const result of gotchaResults) {
        relevantGotchas.push({
          card: result.card,
          relevanceScore: result.relevanceScore,
          confidenceLevel: this.determineConfidenceLevel(result.relevanceScore, result.card.effectiveness),
          reasoning: [
            `Preventive measure for common ${result.card.category} issues`,
            `${result.card.usageCount} previous applications`,
            `${Math.round(result.card.effectiveness * 100)}% effectiveness rate`
          ],
          applicabilityScore: result.card.effectiveness,
          riskLevel: 'low' // Preventive measures are low risk
        });
      }

      return relevantGotchas.slice(0, 5); // Top 5 preventive recommendations
    } catch (error) {
      logger.error('Failed to get preventive recommendations:', error);
      throw new Error(`Failed to get preventive recommendations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get agent-specific knowledge recommendations
   * @param agentType The type of agent requesting recommendations
   * @param limit Maximum number of recommendations
   * @returns Agent-optimized knowledge recommendations
   */
  async getAgentSpecificRecommendations(agentType: string, limit = 10): Promise<KnowledgeCard[]> {
    try {
      const query: KnowledgeQuery = {
        text: '',
        filters: {
          agentTypes: [agentType]
        },
        limit
      };

      const results = await this.knowledgeManager.searchCards(query);
      
      // Sort by effectiveness and usage count
      return results
        .sort((a, b) => {
          const scoreA = a.card.effectiveness * 0.7 + (a.card.usageCount / 100) * 0.3;
          const scoreB = b.card.effectiveness * 0.7 + (b.card.usageCount / 100) * 0.3;
          return scoreB - scoreA;
        })
        .map(result => result.card);
    } catch (error) {
      logger.error(`Failed to get recommendations for agent ${agentType}:`, error);
      throw new Error(`Failed to get agent recommendations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ==================== Private Helper Methods ====================

  private extractKeywords(context: RecommendationContext): string[] {
    const text = `${context.issueTitle} ${context.issueDescription}`.toLowerCase();
    
    // Remove common words and extract meaningful terms
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those']);
    
    const words = text
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
    
    // Extract compound technical terms
    const technicalTerms = this.extractTechnicalTerms(text);
    
    return [...new Set([...words, ...technicalTerms])];
  }

  private extractTechnicalKeywords(context: RecommendationContext): string[] {
    const techKeywords: string[] = [];
    
    // Add tech stack keywords
    if (context.techStack) {
      techKeywords.push(...context.techStack);
    }

    // Extract technical terms from text
    const text = `${context.issueTitle} ${context.issueDescription}`.toLowerCase();
    const technicalPatterns = [
      /\b(typescript|javascript|react|node|npm|webpack|babel|jest|vitest)\b/g,
      /\b(database|sql|mongodb|postgresql|redis|cache)\b/g,
      /\b(api|rest|graphql|http|https|cors|auth|jwt)\b/g,
      /\b(docker|kubernetes|aws|azure|gcp|ci\/cd|github)\b/g,
      /\b(error|exception|bug|issue|problem|fail|crash)\b/g
    ];

    for (const pattern of technicalPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        techKeywords.push(...matches);
      }
    }

    return [...new Set(techKeywords)];
  }

  private extractTechnicalTerms(text: string): string[] {
    const technicalTerms: string[] = [];
    
    // Look for camelCase and PascalCase terms
    const camelCaseMatches = text.match(/\b[a-z][a-zA-Z]*[A-Z][a-zA-Z]*\b/g) || [];
    technicalTerms.push(...camelCaseMatches);
    
    // Look for snake_case terms
    const snakeCaseMatches = text.match(/\b[a-z]+_[a-z_]+\b/g) || [];
    technicalTerms.push(...snakeCaseMatches);
    
    // Look for kebab-case terms
    const kebabCaseMatches = text.match(/\b[a-z]+-[a-z-]+\b/g) || [];
    technicalTerms.push(...kebabCaseMatches);
    
    return technicalTerms;
  }

  private async searchRelevantKnowledge(keywords: string[], context: RecommendationContext): Promise<KnowledgeSearchResult[]> {
    const queries: KnowledgeQuery[] = [
      // Exact match query
      {
        text: `${context.issueTitle} ${context.issueDescription}`,
        filters: {
          agentTypes: [context.agentType],
          projectId: context.projectId
        },
        limit: 10
      },
      // Keyword-based query
      {
        text: keywords.slice(0, 5).join(' '),
        filters: {
          agentTypes: [context.agentType]
        },
        limit: 15
      },
      // Broad category search
      {
        text: context.agentType,
        limit: 10
      }
    ];

    const allResults: KnowledgeSearchResult[] = [];
    
    for (const query of queries) {
      try {
        const results = await this.knowledgeManager.searchCards(query);
        allResults.push(...results);
      } catch (error) {
        logger.warn('Search query failed:', error);
      }
    }

    // Remove duplicates
    const uniqueResults = new Map<string, KnowledgeSearchResult>();
    for (const result of allResults) {
      if (!uniqueResults.has(result.card.id)) {
        uniqueResults.set(result.card.id, result);
      }
    }

    return Array.from(uniqueResults.values());
  }

  private async scoreRecommendations(
    searchResults: KnowledgeSearchResult[], 
    context: RecommendationContext,
    keywords: string[],
    techKeywords: string[]
  ): Promise<KnowledgeRecommendation[]> {
    const recommendations: KnowledgeRecommendation[] = [];

    for (const result of searchResults) {
      const card = result.card;
      
      // Base relevance score
      let relevanceScore = result.relevanceScore;
      
      // Agent type match bonus
      if (card.metadata.agentTypes.includes(context.agentType)) {
        relevanceScore += 0.2;
      }
      
      // Technical keyword match bonus
      const cardText = `${card.title} ${card.content}`.toLowerCase();
      const techMatches = techKeywords.filter(keyword => 
        cardText.includes(keyword.toLowerCase())
      ).length;
      relevanceScore += techMatches * 0.1;
      
      // Time constraint consideration
      if (context.timeConstraint && context.timeConstraint < 60) {
        // Prefer simpler, proven solutions for tight deadlines
        if (card.type === 'solution' && card.effectiveness > 0.8) {
          relevanceScore += 0.15;
        }
      }
      
      // Calculate applicability score
      const applicabilityScore = this.calculateApplicabilityScore(card, context);
      
      // Determine risk level
      const riskLevel = this.assessRiskLevel(card, context);
      
      // Generate reasoning
      const reasoning = this.generateReasoning(card, context, techMatches);

      recommendations.push({
        card,
        relevanceScore,
        confidenceLevel: this.determineConfidenceLevel(relevanceScore, card.effectiveness),
        reasoning,
        applicabilityScore,
        riskLevel
      });
    }

    return recommendations.sort((a, b) => {
      // Sort by combined score of relevance and applicability
      const scoreA = a.relevanceScore * 0.6 + a.applicabilityScore * 0.4;
      const scoreB = b.relevanceScore * 0.6 + b.applicabilityScore * 0.4;
      return scoreB - scoreA;
    });
  }

  private calculateApplicabilityScore(card: KnowledgeCard, context: RecommendationContext): number {
    let score = card.effectiveness;
    
    // Recent usage boost
    const daysSinceLastUsed = (Date.now() - card.lastUsed.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastUsed < 7) {
      score += 0.1;
    }
    
    // Usage frequency boost
    if (card.usageCount > 5) {
      score += 0.1;
    }
    
    // Project-specific boost
    if (context.projectId && card.projectId === context.projectId) {
      score += 0.15;
    }
    
    return Math.min(1.0, score);
  }

  private assessRiskLevel(card: KnowledgeCard, context: RecommendationContext): 'low' | 'medium' | 'high' {
    // Low effectiveness = high risk
    if (card.effectiveness < 0.5) return 'high';
    
    // Unused or rarely used = medium risk
    if (card.usageCount < 3) return 'medium';
    
    // High difficulty with time constraints = high risk
    if (card.metadata.difficulty === 'high' && context.timeConstraint && context.timeConstraint < 120) {
      return 'high';
    }
    
    // Well-tested solutions = low risk
    if (card.effectiveness > 0.8 && card.usageCount > 5) return 'low';
    
    return 'medium';
  }

  private determineConfidenceLevel(relevanceScore: number, effectiveness: number): 'high' | 'medium' | 'low' {
    const combinedScore = relevanceScore * 0.6 + effectiveness * 0.4;
    
    if (combinedScore > 0.8) return 'high';
    if (combinedScore > 0.5) return 'medium';
    return 'low';
  }

  private generateReasoning(card: KnowledgeCard, context: RecommendationContext, techMatches: number): string[] {
    const reasons: string[] = [];
    
    // Effectiveness reasoning
    if (card.effectiveness > 0.8) {
      reasons.push(`High success rate: ${Math.round(card.effectiveness * 100)}%`);
    }
    
    // Usage reasoning
    if (card.usageCount > 0) {
      reasons.push(`Used ${card.usageCount} times previously`);
    }
    
    // Agent match reasoning
    if (card.metadata.agentTypes.includes(context.agentType)) {
      reasons.push(`Optimized for ${context.agentType} agent`);
    }
    
    // Technical match reasoning
    if (techMatches > 0) {
      reasons.push(`Matches ${techMatches} technical keyword${techMatches > 1 ? 's' : ''}`);
    }
    
    // Difficulty reasoning
    if (card.metadata.difficulty === 'low') {
      reasons.push('Low complexity implementation');
    }
    
    // Recent usage reasoning
    const daysSinceLastUsed = (Date.now() - card.lastUsed.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastUsed < 7) {
      reasons.push('Recently applied successfully');
    }
    
    return reasons.length > 0 ? reasons : ['General knowledge match'];
  }

  private filterRecommendations(recommendations: KnowledgeRecommendation[], context: RecommendationContext): KnowledgeRecommendation[] {
    let filtered = recommendations;
    
    // Filter out very low confidence recommendations
    filtered = filtered.filter(rec => rec.confidenceLevel !== 'low' || rec.relevanceScore > 0.3);
    
    // Limit high-risk recommendations if time is constrained
    if (context.timeConstraint && context.timeConstraint < 60) {
      filtered = filtered.filter(rec => rec.riskLevel !== 'high');
    }
    
    // Ensure diversity in recommendation types
    const typeGroups = new Map<string, KnowledgeRecommendation[]>();
    for (const rec of filtered) {
      const type = rec.card.type;
      if (!typeGroups.has(type)) {
        typeGroups.set(type, []);
      }
      typeGroups.get(type)!.push(rec);
    }
    
    // Take top recommendations from each type
    const diverseRecommendations: KnowledgeRecommendation[] = [];
    const maxPerType = Math.max(2, Math.floor(10 / typeGroups.size));
    
    for (const [type, recs] of typeGroups) {
      diverseRecommendations.push(...recs.slice(0, maxPerType));
    }
    
    return diverseRecommendations
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 10); // Final limit
  }

  private async updatePatternCache(): Promise<void> {
    if (Date.now() - this.lastCacheUpdate < this.CACHE_TTL) {
      return; // Cache is still fresh
    }

    try {
      // This is a simplified pattern analysis
      // In a full implementation, this would analyze all knowledge cards and their outcomes
      const stats = await this.knowledgeManager.getStats();
      
      // Create sample pattern insights
      this.patternCache.set('build-errors', {
        pattern: 'Build and compilation errors',
        frequency: 25,
        successRate: 0.85,
        averageTimeToResolution: 15,
        commonSolutions: ['Type checking', 'Dependency updates', 'Configuration fixes'],
        relatedIssueTypes: ['typescript-error', 'webpack-error', 'build-failure']
      });
      
      this.patternCache.set('api-integration', {
        pattern: 'API integration issues',
        frequency: 18,
        successRate: 0.78,
        averageTimeToResolution: 45,
        commonSolutions: ['CORS configuration', 'Authentication setup', 'Error handling'],
        relatedIssueTypes: ['cors-error', 'auth-failure', 'api-timeout']
      });
      
      this.lastCacheUpdate = Date.now();
    } catch (error) {
      logger.error('Failed to update pattern cache:', error);
    }
  }
}