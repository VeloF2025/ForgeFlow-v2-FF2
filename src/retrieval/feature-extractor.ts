// Feature Extractor - ML Feature Engineering for Intelligent Retrieval
// Extracts recency, proximity, affinity, semantic, and contextual features

import {
  FeatureExtractor as IFeatureExtractor,
  FeatureVector,
  RecencyFeatures,
  ProximityFeatures,
  AffinityFeatures,
  SemanticFeatures,
  ContextFeatures,
  RetrievalQuery,
  SearchContext,
  RetrievalConfig,
  RetrievalError,
  RetrievalErrorCode
} from './types.js';
import { IndexEntry } from '../indexing/types.js';
import { logger } from '../utils/logger.js';

export class SmartFeatureExtractor implements IFeatureExtractor {
  private readonly config: RetrievalConfig['features'];
  
  // Feature caches for performance optimization
  private readonly semanticCache = new Map<string, SemanticFeatures>();
  private readonly proximityCache = new Map<string, number>();
  
  // Statistical data for normalization
  private featureStats: {
    recencyMean: number;
    recencyStd: number;
    proximityMean: number;
    proximityStd: number;
    affinityMean: number;
    affinityStd: number;
  } = {
    recencyMean: 0.5,
    recencyStd: 0.2,
    proximityMean: 0.3,
    proximityStd: 0.15,
    affinityMean: 0.25,
    affinityStd: 0.1
  };

  constructor(config: RetrievalConfig['features']) {
    this.config = config;
    
    // Initialize cache cleanup interval
    setInterval(() => this.cleanupCaches(), 300000); // 5 minutes
    
    logger.info('SmartFeatureExtractor initialized', {
      enabledFeatures: {
        recency: config.enableRecencyFeatures,
        proximity: config.enableProximityFeatures,
        affinity: config.enableAffinityFeatures,
        semantic: config.enableSemanticFeatures,
        context: config.enableContextFeatures
      },
      normalization: config.normalizeFeatures,
      scaling: config.scalingMethod
    });
  }

  async extractFeatures(
    query: RetrievalQuery,
    content: IndexEntry
  ): Promise<FeatureVector> {
    try {
      const startTime = Date.now();

      // Extract basic features
      const basic = await this.extractBasicFeatures(query, content);
      
      // Extract feature categories (in parallel for performance)
      const [recency, proximity, affinity, semantic, context] = await Promise.all([
        this.config.enableRecencyFeatures ? this.extractRecencyFeatures(content) : this.getEmptyRecencyFeatures(),
        this.config.enableProximityFeatures ? this.extractProximityFeatures(query, content) : this.getEmptyProximityFeatures(),
        this.config.enableAffinityFeatures ? this.extractAffinityFeatures(query.context, content) : this.getEmptyAffinityFeatures(),
        this.config.enableSemanticFeatures ? this.extractSemanticFeatures(content) : this.getEmptySemanticFeatures(),
        this.config.enableContextFeatures ? this.extractContextFeatures(query.context, content) : this.getEmptyContextFeatures()
      ]);

      // Calculate derived features
      const derived = this.calculateDerivedFeatures(basic, recency, proximity, affinity, semantic, context);

      const features: FeatureVector = {
        basic,
        recency,
        proximity,
        affinity,
        semantic,
        context,
        derived
      };

      // Normalize features if enabled
      const normalizedFeatures = this.config.normalizeFeatures ? 
        this.normalizeFeatures(features) : features;

      const extractionTime = Date.now() - startTime;
      logger.debug('Features extracted', {
        contentId: content.id,
        extractionTime,
        featuresEnabled: Object.keys(this.config).filter(key => (this.config as any)[key] === true)
      });

      return normalizedFeatures;
    } catch (error) {
      logger.error('Feature extraction failed', error);
      throw new RetrievalError(
        'Feature extraction failed',
        RetrievalErrorCode.FEATURE_EXTRACTION_FAILED,
        { contentId: content.id, error }
      );
    }
  }

  async extractBatchFeatures(
    query: RetrievalQuery,
    contents: IndexEntry[]
  ): Promise<FeatureVector[]> {
    try {
      const batchSize = 50; // Process in batches for memory efficiency
      const results: FeatureVector[] = [];
      
      for (let i = 0; i < contents.length; i += batchSize) {
        const batch = contents.slice(i, i + batchSize);
        const batchFeatures = await Promise.all(
          batch.map(content => this.extractFeatures(query, content))
        );
        results.push(...batchFeatures);
      }

      // Scale features across the batch if enabled
      const scaledFeatures = this.config.normalizeFeatures ? 
        this.scaleFeatures(results) : results;

      logger.debug('Batch features extracted', {
        totalContents: contents.length,
        batchSize,
        batches: Math.ceil(contents.length / batchSize)
      });

      return scaledFeatures;
    } catch (error) {
      logger.error('Batch feature extraction failed', error);
      throw new RetrievalError(
        'Batch feature extraction failed',
        RetrievalErrorCode.FEATURE_EXTRACTION_FAILED,
        { batchSize: contents.length, error }
      );
    }
  }

  extractRecencyFeatures(content: IndexEntry): RecencyFeatures {
    const now = new Date();
    const created = new Date(content.metadata.lastUsed || content.lastModified);
    const modified = content.lastModified;
    const lastUsed = new Date(content.metadata.lastUsed || content.lastModified);

    // Calculate days since events
    const daysSinceCreated = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
    const daysSinceModified = (now.getTime() - modified.getTime()) / (1000 * 60 * 60 * 24);
    const daysSinceLastUsed = (now.getTime() - lastUsed.getTime()) / (1000 * 60 * 60 * 24);

    // Calculate exponential decay scores
    const creationDecay = Math.exp(-daysSinceCreated / 30); // 30-day half-life
    const modificationDecay = Math.exp(-daysSinceModified / 14); // 2-week half-life
    const usageDecay = Math.exp(-daysSinceLastUsed / 7); // 1-week half-life

    // Determine activity patterns
    const isRecentlyActive = daysSinceLastUsed < 7;
    const hasRecentUpdates = daysSinceModified < 3;

    // Extract temporal patterns
    const weekdayCreated = created.getDay() / 6; // Normalize 0-6 to 0-1
    const hourCreated = created.getHours() / 23; // Normalize 0-23 to 0-1

    return {
      daysSinceCreated,
      daysSinceModified,
      daysSinceLastUsed,
      creationDecay,
      modificationDecay,
      usageDecay,
      isRecentlyActive,
      hasRecentUpdates,
      weekdayCreated,
      hourCreated
    };
  }

  extractProximityFeatures(query: RetrievalQuery, content: IndexEntry): ProximityFeatures {
    const queryText = query.query.toLowerCase();
    const title = content.title.toLowerCase();
    const contentText = content.content.toLowerCase();
    const tags = content.metadata.tags.map(tag => tag.toLowerCase());

    // Check exact phrase match
    const exactPhraseMatch = title.includes(queryText) || contentText.includes(queryText);

    // Calculate word overlap ratio
    const queryWords = new Set(queryText.split(/\s+/).filter(word => word.length > 2));
    const titleWords = new Set(title.split(/\s+/).filter(word => word.length > 2));
    const contentWords = new Set(contentText.split(/\s+/).filter(word => word.length > 2));
    
    const titleOverlap = this.calculateJaccardSimilarity(queryWords, titleWords);
    const contentOverlap = this.calculateJaccardSimilarity(queryWords, contentWords);
    const wordOverlapRatio = Math.max(titleOverlap, contentOverlap);

    // Character-level similarity (Levenshtein-based)
    const characterSimilarity = this.calculateCharacterSimilarity(queryText, title + ' ' + contentText);

    // Cosine similarity (simplified TF-IDF approximation)
    const cosineSimilarity = this.calculateTFIDFSimilarity(queryText, title + ' ' + contentText);

    // Jaccard similarity for tags
    const tagWords = new Set(tags.join(' ').split(/\s+/));
    const jaccardSimilarity = this.calculateJaccardSimilarity(queryWords, tagWords);

    // Specific proximity scores
    const titleProximity = this.calculateTextProximity(queryText, title);
    const contentProximity = this.calculateTextProximity(queryText, contentText);
    const tagsProximity = this.calculateTextProximity(queryText, tags.join(' '));

    // Structural proximity (for code files)
    const pathSimilarity = this.calculatePathSimilarity(query, content);
    const hierarchyDistance = this.calculateHierarchyDistance(query, content);

    return {
      exactPhraseMatch,
      wordOverlapRatio,
      characterSimilarity,
      cosineSimilarity,
      jaccardSimilarity,
      titleProximity,
      contentProximity,
      tagsProximity,
      pathSimilarity,
      hierarchyDistance
    };
  }

  extractAffinityFeatures(context: SearchContext, content: IndexEntry): AffinityFeatures {
    // User interaction history (simplified - would need real user data)
    const userPreviousInteractions = content.metadata.usageCount || 0;
    const userSuccessRate = content.metadata.successRate || 0.5;
    const userDwellTime = 30; // Placeholder - would need real tracking

    // Agent affinity
    const agentTypeRelevance = this.calculateAgentTypeRelevance(context.agentTypes, content);
    const agentSuccessHistory = content.metadata.effectiveness || 0.5;

    // Project affinity
    const projectRelevance = content.metadata.projectId === context.projectId ? 1.0 : 0.3;
    const crossProjectUsage = content.metadata.projectId ? 0.7 : 1.0; // Global content is more versatile

    // Content affinity based on user expertise and preferences
    const languagePreference = this.calculateLanguagePreference(context, content);
    const complexityFit = this.calculateComplexityFit(context.expertiseLevel, content);
    const domainFit = this.calculateDomainFit(context, content);

    return {
      userPreviousInteractions: Math.min(userPreviousInteractions / 100, 1.0), // Normalize
      userSuccessRate,
      userDwellTime: Math.min(userDwellTime / 300, 1.0), // Normalize to max 5 minutes
      agentTypeRelevance,
      agentSuccessHistory,
      projectRelevance,
      crossProjectUsage,
      languagePreference,
      complexityFit,
      domainFit
    };
  }

  extractSemanticFeatures(content: IndexEntry): SemanticFeatures {
    const cacheKey = `semantic_${content.id}`;
    const cached = this.semanticCache.get(cacheKey);
    if (cached) return cached;

    // Extract language information
    const language = content.metadata.language || 'unknown';
    const codeLanguage = content.type === 'code' ? language : undefined;

    // Calculate content complexity (simplified heuristics)
    const complexityScore = this.calculateComplexityScore(content);
    const readabilityScore = this.calculateReadabilityScore(content);

    // Content characteristics
    const hasCodeExamples = /```[\s\S]*?```/.test(content.content) || 
                           content.content.includes('function ') ||
                           content.content.includes('class ') ||
                           content.content.includes('def ');
    
    const hasImageDiagrams = /!\[.*?\]\(.*?\)/.test(content.content) ||
                            content.content.includes('[image]') ||
                            content.content.includes('[diagram]');
    
    const hasExternalLinks = /https?:\/\//.test(content.content);
    const documentLength = content.content.length;

    // Topic modeling (simplified - would use real NLP in production)
    const topicPurity = this.calculateTopicPurity(content);
    const dominantTopic = this.identifyDominantTopic(content);

    const features: SemanticFeatures = {
      language,
      codeLanguage,
      complexityScore,
      readabilityScore,
      hasCodeExamples,
      hasImageDiagrams,
      hasExternalLinks,
      documentLength,
      topicPurity,
      dominantTopic
    };

    // Cache the results
    this.semanticCache.set(cacheKey, features);
    
    return features;
  }

  normalizeFeatures(features: FeatureVector): FeatureVector {
    const normalized = JSON.parse(JSON.stringify(features)); // Deep clone

    // Normalize recency features
    if (this.config.scalingMethod === 'minmax') {
      normalized.recency.daysSinceCreated = Math.min(normalized.recency.daysSinceCreated / 365, 1.0);
      normalized.recency.daysSinceModified = Math.min(normalized.recency.daysSinceModified / 365, 1.0);
      normalized.recency.daysSinceLastUsed = Math.min(normalized.recency.daysSinceLastUsed / 365, 1.0);
    } else if (this.config.scalingMethod === 'zscore') {
      // Z-score normalization using statistical estimates
      normalized.recency.daysSinceCreated = 
        (normalized.recency.daysSinceCreated - this.featureStats.recencyMean) / this.featureStats.recencyStd;
      // ... apply to other features
    }

    // Normalize derived features
    normalized.derived.overallRelevance = Math.max(0, Math.min(1, normalized.derived.overallRelevance));
    normalized.derived.uncertaintyScore = Math.max(0, Math.min(1, normalized.derived.uncertaintyScore));
    normalized.derived.noveltyScore = Math.max(0, Math.min(1, normalized.derived.noveltyScore));

    return normalized;
  }

  scaleFeatures(features: FeatureVector[]): FeatureVector[] {
    if (features.length === 0) return features;

    // Calculate batch statistics for scaling
    const batchStats = this.calculateBatchStatistics(features);
    
    return features.map(feature => this.scaleSingleFeature(feature, batchStats));
  }

  // Private helper methods

  private async extractBasicFeatures(query: RetrievalQuery, content: IndexEntry) {
    const queryText = query.query.toLowerCase();
    const title = content.title.toLowerCase();
    const contentText = content.content.toLowerCase();
    const tags = content.metadata.tags.map(tag => tag.toLowerCase());
    const category = content.metadata.category?.toLowerCase() || '';

    return {
      titleMatchScore: this.calculateTextMatchScore(queryText, title),
      contentMatchScore: this.calculateTextMatchScore(queryText, contentText),
      tagMatchScore: this.calculateTagMatchScore(queryText, tags),
      categoryMatch: category.includes(queryText) || queryText.includes(category)
    };
  }

  private extractContextFeatures(context: SearchContext, content: IndexEntry): ContextFeatures {
    // Issue relevance
    const issueRelevance = context.currentIssue ? 
      this.calculateIssueRelevance(context.currentIssue, content) : 0.5;

    // Task phase relevance (simplified heuristic)
    const taskPhaseRelevance = this.calculateTaskPhaseRelevance(context, content);

    // Urgency match (based on issue labels or content metadata)
    const urgencyMatch = this.calculateUrgencyMatch(context, content);

    // Temporal context
    const now = new Date();
    const isWorkingHours = context.workingHours || (now.getHours() >= 9 && now.getHours() < 18);
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    const timeOfDay = now.getHours() / 24;

    // Session context
    const queryPosition = context.recentQueries.length;
    const sessionLength = 30; // Placeholder - would track real session duration
    const queryComplexity = context.recentQueries.join(' ').split(' ').length / 10;

    // Environmental context
    const activeProject = content.metadata.projectId === context.projectId;
    const repositoryActive = Boolean(context.repositoryUrl);
    const branchContext = Boolean(context.activeBranch);

    return {
      issueRelevance,
      taskPhaseRelevance,
      urgencyMatch,
      isWorkingHours,
      isWeekend,
      timeOfDay,
      queryPosition: Math.min(queryPosition / 10, 1.0), // Normalize
      sessionLength: Math.min(sessionLength / 120, 1.0), // Normalize to 2 hours max
      queryComplexity: Math.min(queryComplexity, 1.0),
      activeProject,
      repositoryActive,
      branchContext
    };
  }

  private calculateDerivedFeatures(
    basic: any, recency: RecencyFeatures, proximity: ProximityFeatures,
    affinity: AffinityFeatures, semantic: SemanticFeatures, context: ContextFeatures
  ) {
    // Overall relevance score (weighted combination)
    const weights = this.config.featureWeights;
    const overallRelevance = (
      basic.titleMatchScore * (weights.titleMatch || 0.3) +
      basic.contentMatchScore * (weights.contentMatch || 0.2) +
      proximity.wordOverlapRatio * (weights.proximity || 0.2) +
      recency.usageDecay * (weights.recency || 0.15) +
      affinity.agentTypeRelevance * (weights.affinity || 0.15)
    );

    // Uncertainty score (how confident we are in this result)
    const uncertaintyScore = this.calculateUncertaintyScore(basic, proximity, affinity);

    // Novelty score (how new/unique this content is)
    const noveltyScore = this.calculateNoveltyScore(recency, semantic, context);

    return {
      overallRelevance,
      uncertaintyScore,
      noveltyScore
    };
  }

  private calculateTextMatchScore(query: string, text: string): number {
    const queryWords = query.split(/\s+/).filter(word => word.length > 2);
    const textWords = text.split(/\s+/).filter(word => word.length > 2);
    
    let matches = 0;
    for (const queryWord of queryWords) {
      if (textWords.some(textWord => textWord.includes(queryWord) || queryWord.includes(textWord))) {
        matches++;
      }
    }
    
    return queryWords.length > 0 ? matches / queryWords.length : 0;
  }

  private calculateTagMatchScore(query: string, tags: string[]): number {
    if (tags.length === 0) return 0;
    
    const queryWords = query.split(/\s+/).filter(word => word.length > 2);
    let matches = 0;
    
    for (const tag of tags) {
      for (const queryWord of queryWords) {
        if (tag.includes(queryWord) || queryWord.includes(tag)) {
          matches++;
          break; // Count each tag only once per query
        }
      }
    }
    
    return Math.min(matches / tags.length, 1.0);
  }

  private calculateJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private calculateCharacterSimilarity(str1: string, str2: string): number {
    // Simplified character similarity using longest common subsequence
    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 1.0;
    
    const lcs = this.longestCommonSubsequence(str1, str2);
    return lcs / maxLen;
  }

  private longestCommonSubsequence(str1: string, str2: string): number {
    const dp: number[][] = Array(str1.length + 1).fill(null).map(() => Array(str2.length + 1).fill(0));
    
    for (let i = 1; i <= str1.length; i++) {
      for (let j = 1; j <= str2.length; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }
    
    return dp[str1.length][str2.length];
  }

  private calculateTFIDFSimilarity(query: string, document: string): number {
    // Simplified TF-IDF similarity calculation
    const queryTerms = query.split(/\s+/).filter(word => word.length > 2);
    const docTerms = document.split(/\s+/).filter(word => word.length > 2);
    
    if (queryTerms.length === 0 || docTerms.length === 0) return 0;
    
    const docTermFreq = new Map<string, number>();
    docTerms.forEach(term => {
      docTermFreq.set(term, (docTermFreq.get(term) || 0) + 1);
    });
    
    let similarity = 0;
    for (const term of queryTerms) {
      const tf = (docTermFreq.get(term) || 0) / docTerms.length;
      const idf = Math.log(1 + docTerms.length / (docTermFreq.get(term) || 0.1));
      similarity += tf * idf;
    }
    
    return Math.min(similarity, 1.0);
  }

  private calculateTextProximity(query: string, text: string): number {
    return this.calculateTextMatchScore(query, text);
  }

  private calculatePathSimilarity(query: RetrievalQuery, content: IndexEntry): number {
    // For code files, calculate path-based similarity
    if (content.type === 'code' && query.context.repositoryUrl) {
      // Simplified - would implement actual path comparison
      return 0.5;
    }
    return 0;
  }

  private calculateHierarchyDistance(query: RetrievalQuery, content: IndexEntry): number {
    // Calculate hierarchical distance for structured content
    const pathParts = content.path.split('/');
    return Math.min(pathParts.length / 10, 1.0); // Normalize depth
  }

  private calculateAgentTypeRelevance(agentTypes: string[], content: IndexEntry): number {
    const contentAgentTypes = content.metadata.agentTypes || [];
    if (contentAgentTypes.length === 0) return 0.5; // Neutral for content with no agent type
    
    const matches = agentTypes.filter(type => contentAgentTypes.includes(type)).length;
    return matches / agentTypes.length;
  }

  private calculateLanguagePreference(context: SearchContext, content: IndexEntry): number {
    const contentLang = content.metadata.language;
    if (!contentLang || context.preferredLanguages.length === 0) return 0.5;
    
    return context.preferredLanguages.includes(contentLang) ? 1.0 : 0.3;
  }

  private calculateComplexityFit(expertiseLevel: string, content: IndexEntry): number {
    const contentComplexity = content.metadata.difficulty || 'medium';
    
    const complexityMap: Record<string, Record<string, number>> = {
      beginner: { low: 1.0, medium: 0.7, high: 0.3 },
      intermediate: { low: 0.8, medium: 1.0, high: 0.8 },
      advanced: { low: 0.5, medium: 0.8, high: 1.0 }
    };
    
    return complexityMap[expertiseLevel]?.[contentComplexity] || 0.5;
  }

  private calculateDomainFit(context: SearchContext, content: IndexEntry): number {
    // Match content domain with current issue/task domain
    const issueDomain = context.currentIssue?.labels?.join(' ').toLowerCase() || '';
    const contentCategory = content.metadata.category?.toLowerCase() || '';
    const contentTags = content.metadata.tags.join(' ').toLowerCase();
    
    if (contentCategory && issueDomain.includes(contentCategory)) return 1.0;
    if (contentTags && issueDomain.split(' ').some(word => contentTags.includes(word))) return 0.8;
    
    return 0.5;
  }

  private calculateComplexityScore(content: IndexEntry): number {
    // Heuristic-based complexity scoring
    let complexity = 0;
    
    // Length-based complexity
    complexity += Math.min(content.content.length / 5000, 0.3);
    
    // Code complexity indicators
    const codeIndicators = ['function', 'class', 'interface', 'async', 'await', 'Promise', 'try', 'catch'];
    const codeMatches = codeIndicators.filter(indicator => 
      content.content.toLowerCase().includes(indicator)
    ).length;
    complexity += Math.min(codeMatches / 10, 0.3);
    
    // Technical terms complexity
    const technicalTerms = ['algorithm', 'optimization', 'architecture', 'infrastructure', 'deployment'];
    const techMatches = technicalTerms.filter(term => 
      content.content.toLowerCase().includes(term)
    ).length;
    complexity += Math.min(techMatches / 10, 0.4);
    
    return Math.min(complexity, 1.0);
  }

  private calculateReadabilityScore(content: IndexEntry): number {
    // Simplified readability score based on sentence/word structure
    const sentences = content.content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = content.content.split(/\s+/).filter(w => w.length > 0);
    
    if (sentences.length === 0 || words.length === 0) return 0.5;
    
    const avgWordsPerSentence = words.length / sentences.length;
    const avgCharsPerWord = words.reduce((sum, word) => sum + word.length, 0) / words.length;
    
    // Lower values indicate higher readability (invert the score)
    const readabilityRaw = Math.min((avgWordsPerSentence / 15) + (avgCharsPerWord / 7), 2.0);
    return Math.max(0, 1.0 - (readabilityRaw / 2.0));
  }

  private calculateTopicPurity(content: IndexEntry): number {
    // Simplified topic purity based on keyword consistency
    const words = content.content.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const wordFreq = new Map<string, number>();
    
    words.forEach(word => wordFreq.set(word, (wordFreq.get(word) || 0) + 1));
    
    if (words.length === 0) return 0.5;
    
    // Calculate entropy-like measure
    const totalWords = words.length;
    let entropy = 0;
    for (const [, freq] of wordFreq.entries()) {
      const prob = freq / totalWords;
      entropy -= prob * Math.log2(prob);
    }
    
    // Convert entropy to purity (lower entropy = higher purity)
    const maxEntropy = Math.log2(Math.min(wordFreq.size, 10)); // Cap max entropy
    return maxEntropy > 0 ? 1 - (entropy / maxEntropy) : 0.5;
  }

  private identifyDominantTopic(content: IndexEntry): string {
    // Simple keyword-based topic identification
    const topicKeywords = {
      'authentication': ['auth', 'login', 'password', 'token', 'jwt'],
      'database': ['database', 'sql', 'query', 'schema', 'table'],
      'api': ['api', 'endpoint', 'request', 'response', 'http'],
      'ui': ['component', 'render', 'style', 'css', 'html'],
      'testing': ['test', 'spec', 'expect', 'mock', 'assert'],
      'deployment': ['deploy', 'docker', 'kubernetes', 'aws', 'cloud'],
      'security': ['security', 'vulnerability', 'encrypt', 'ssl', 'https']
    };
    
    const contentLower = content.content.toLowerCase();
    let maxScore = 0;
    let dominantTopic = 'general';
    
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      const score = keywords.filter(keyword => contentLower.includes(keyword)).length;
      if (score > maxScore) {
        maxScore = score;
        dominantTopic = topic;
      }
    }
    
    return dominantTopic;
  }

  private calculateIssueRelevance(issue: { title: string; labels: string[]; description: string }, content: IndexEntry): number {
    const issueText = (issue.title + ' ' + issue.description + ' ' + issue.labels.join(' ')).toLowerCase();
    const contentText = (content.title + ' ' + content.content).toLowerCase();
    
    return this.calculateTextMatchScore(issueText, contentText);
  }

  private calculateTaskPhaseRelevance(context: SearchContext, content: IndexEntry): number {
    // Heuristic: determine task phase from recent queries and content
    const recentQueries = context.recentQueries.join(' ').toLowerCase();
    
    if (recentQueries.includes('plan') || recentQueries.includes('design')) {
      return content.type === 'adr' || content.metadata.category === 'architecture' ? 1.0 : 0.5;
    }
    
    if (recentQueries.includes('implement') || recentQueries.includes('code')) {
      return content.type === 'code' || content.type === 'knowledge' ? 1.0 : 0.5;
    }
    
    if (recentQueries.includes('test') || recentQueries.includes('debug')) {
      return content.metadata.category === 'testing' || content.type === 'gotcha' ? 1.0 : 0.5;
    }
    
    return 0.5; // Neutral if phase unclear
  }

  private calculateUrgencyMatch(context: SearchContext, content: IndexEntry): number {
    const urgentLabels = ['critical', 'urgent', 'hotfix', 'production', 'blocker'];
    const issueLabels = context.currentIssue?.labels?.map(l => l.toLowerCase()) || [];
    const contentTags = content.metadata.tags.map(t => t.toLowerCase());
    
    const urgentIssue = urgentLabels.some(label => issueLabels.includes(label));
    const urgentContent = urgentLabels.some(label => contentTags.includes(label)) ||
                         content.metadata.severity === 'critical';
    
    if (urgentIssue && urgentContent) return 1.0;
    if (urgentIssue || urgentContent) return 0.7;
    return 0.5;
  }

  private calculateUncertaintyScore(basic: any, proximity: ProximityFeatures, affinity: AffinityFeatures): number {
    // Higher uncertainty when features are inconsistent or low confidence
    const titleContentGap = Math.abs(basic.titleMatchScore - basic.contentMatchScore);
    const proximityVariance = Math.abs(proximity.titleProximity - proximity.contentProximity);
    const lowAffinity = 1 - affinity.agentTypeRelevance;
    
    return Math.min((titleContentGap + proximityVariance + lowAffinity) / 3, 1.0);
  }

  private calculateNoveltyScore(recency: RecencyFeatures, semantic: SemanticFeatures, context: ContextFeatures): number {
    // Higher novelty for recent, unique, or less commonly accessed content
    const recencyNovelty = recency.creationDecay * recency.modificationDecay;
    const accessNovelty = 1 - Math.min(semantic.documentLength / 10000, 1.0); // Shorter docs might be novel
    const contextNovelty = context.queryPosition / 10; // Later in session might be exploring
    
    return Math.min((recencyNovelty + accessNovelty + contextNovelty) / 3, 1.0);
  }

  private calculateBatchStatistics(features: FeatureVector[]) {
    // Calculate mean and std for batch normalization
    // Implementation simplified for brevity
    return {
      recencyMean: 0.5,
      recencyStd: 0.2,
      proximityMean: 0.3,
      proximityStd: 0.15
    };
  }

  private scaleSingleFeature(feature: FeatureVector, batchStats: any): FeatureVector {
    // Apply batch-level scaling to individual feature
    return feature; // Simplified - would apply actual scaling
  }

  private cleanupCaches(): void {
    // Clean up caches periodically to prevent memory leaks
    const maxCacheSize = 10000;
    
    if (this.semanticCache.size > maxCacheSize) {
      const keysToDelete = Array.from(this.semanticCache.keys()).slice(0, this.semanticCache.size - maxCacheSize);
      keysToDelete.forEach(key => this.semanticCache.delete(key));
      
      logger.debug('Cleaned up semantic cache', {
        deletedEntries: keysToDelete.length,
        remainingEntries: this.semanticCache.size
      });
    }
  }

  // Default empty features for disabled feature categories

  private getEmptyRecencyFeatures(): RecencyFeatures {
    return {
      daysSinceCreated: 0,
      daysSinceModified: 0,
      daysSinceLastUsed: 0,
      creationDecay: 1,
      modificationDecay: 1,
      usageDecay: 1,
      isRecentlyActive: false,
      hasRecentUpdates: false,
      weekdayCreated: 0,
      hourCreated: 0
    };
  }

  private getEmptyProximityFeatures(): ProximityFeatures {
    return {
      exactPhraseMatch: false,
      wordOverlapRatio: 0,
      characterSimilarity: 0,
      cosineSimilarity: 0,
      jaccardSimilarity: 0,
      titleProximity: 0,
      contentProximity: 0,
      tagsProximity: 0,
      pathSimilarity: 0,
      hierarchyDistance: 0
    };
  }

  private getEmptyAffinityFeatures(): AffinityFeatures {
    return {
      userPreviousInteractions: 0,
      userSuccessRate: 0.5,
      userDwellTime: 0,
      agentTypeRelevance: 0.5,
      agentSuccessHistory: 0.5,
      projectRelevance: 0.5,
      crossProjectUsage: 0.5,
      languagePreference: 0.5,
      complexityFit: 0.5,
      domainFit: 0.5
    };
  }

  private getEmptySemanticFeatures(): SemanticFeatures {
    return {
      language: 'unknown',
      complexityScore: 0.5,
      readabilityScore: 0.5,
      hasCodeExamples: false,
      hasImageDiagrams: false,
      hasExternalLinks: false,
      documentLength: 0,
      topicPurity: 0.5
    };
  }

  private getEmptyContextFeatures(): ContextFeatures {
    return {
      issueRelevance: 0.5,
      taskPhaseRelevance: 0.5,
      urgencyMatch: 0.5,
      isWorkingHours: true,
      isWeekend: false,
      timeOfDay: 0.5,
      queryPosition: 0,
      sessionLength: 0,
      queryComplexity: 0,
      activeProject: false,
      repositoryActive: false,
      branchContext: false
    };
  }
}