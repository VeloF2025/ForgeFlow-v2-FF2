// Search Engine - BM25 ranking with intelligent result processing
// Provides advanced search capabilities with relevance scoring and highlighting

import type {
  ISearchEngine,
  SearchQuery,
  SearchResults,
  SearchResult,
  SearchAnalytics,
  QueryStats,
  SlowQuery,
  CacheMetrics,
  ContentSnippet,
  SearchFacets,
  FacetCount,
  SearchWeights,
  IndexContentType,
} from './types.js';
import { IndexError, IndexErrorCode } from './types.js';
import type { SQLiteFTS5Index } from './sqlite-index.js';

export class ForgeFlowSearchEngine implements ISearchEngine {
  private sqliteIndex: SQLiteFTS5Index;
  private queryCache = new Map<string, CachedSearchResult>();
  private readonly maxCacheSize = 1000;
  private readonly cacheExpiry = 5 * 60 * 1000; // 5 minutes

  // Search analytics
  private queryStats = new Map<string, QueryStatsData>();
  private slowQueries: SlowQuery[] = [];
  private readonly maxSlowQueries = 100;

  constructor(sqliteIndex: SQLiteFTS5Index) {
    this.sqliteIndex = sqliteIndex;

    // Clean up cache periodically
    setInterval(() => this.cleanupCache(), 60000); // Every minute
  }

  async search(query: SearchQuery): Promise<SearchResults> {
    const startTime = Date.now();

    try {
      // Validate query
      this.validateQuery(query);

      // Check cache first
      const cacheKey = this.generateCacheKey(query);
      const cached = this.queryCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
        this.updateQueryStats(
          query.query,
          cached.results.totalMatches,
          Date.now() - startTime,
          true,
        );
        return cached.results;
      }

      // Prepare search options
      const searchOptions = this.prepareSearchOptions(query);

      // Execute search
      const rawResults = await this.sqliteIndex.searchFTS(query.query, searchOptions);

      // Process and rank results
      const processedResults = await this.processSearchResults(rawResults, query);

      // Get total count for pagination
      const totalMatches = await this.sqliteIndex.count(searchOptions.filters);
      const totalPages = Math.ceil(totalMatches / (query.limit || 20));
      const currentPage = Math.floor((query.offset || 0) / (query.limit || 20)) + 1;

      // Generate facets
      const facets = await this.generateFacets(query, rawResults);

      // Generate suggestions
      const suggestions = await this.generateSuggestions(query.query);

      const executionTime = Date.now() - startTime;

      const results: SearchResults = {
        results: processedResults,
        totalMatches,
        totalPages,
        currentPage,
        executionTime,
        facets,
        suggestions,
      };

      // Cache results
      this.cacheResults(cacheKey, results);

      // Record analytics
      this.updateQueryStats(query.query, totalMatches, executionTime, false);

      // Track slow queries
      if (executionTime > 1000) {
        // 1 second threshold
        this.trackSlowQuery(query.query, executionTime, totalMatches);
      }

      return results;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateQueryStats(query.query, 0, executionTime, false, error as Error);

      throw new IndexError(
        `Search failed: ${(error as Error).message}`,
        IndexErrorCode.SEARCH_TIMEOUT,
        { query, executionTime, error },
      );
    }
  }

  async searchSimilar(entryId: string, limit = 10): Promise<SearchResults> {
    // Get the entry to find similar content
    const entry = await this.getEntryById(entryId);
    if (!entry) {
      throw new IndexError(`Entry not found: ${entryId}`, IndexErrorCode.INVALID_QUERY, {
        entryId,
      });
    }

    // Extract keywords from the entry
    const keywords = this.extractKeywords(entry.title + ' ' + entry.content);
    const similarQuery: SearchQuery = {
      query: keywords.slice(0, 10).join(' OR '), // Use top 10 keywords
      queryType: 'boolean',
      limit,
      includeSnippets: true,
      highlightResults: true,
    };

    const results = await this.search(similarQuery);

    // Filter out the original entry
    results.results = results.results.filter((result) => result.entry.id !== entryId);
    results.totalMatches = Math.max(0, results.totalMatches - 1);

    return results;
  }

  async getSuggestions(partial: string, limit = 10): Promise<string[]> {
    if (partial.length < 2) return [];

    try {
      // Get popular queries that start with the partial string
      const suggestions = Array.from(this.queryStats.entries())
        .filter(([query]) => query.toLowerCase().startsWith(partial.toLowerCase()))
        .sort((a, b) => b[1].count - a[1].count) // Sort by frequency
        .slice(0, limit)
        .map(([query]) => query);

      // If we don't have enough suggestions from history, add some basic ones
      if (suggestions.length < limit) {
        const basicSuggestions = this.generateBasicSuggestions(partial);
        suggestions.push(...basicSuggestions.slice(0, limit - suggestions.length));
      }

      return suggestions;
    } catch (error) {
      console.error('Failed to generate suggestions:', error);
      return [];
    }
  }

  async getPopularQueries(limit = 20): Promise<QueryStats[]> {
    return Array.from(this.queryStats.entries())
      .map(([query, stats]) => ({
        query,
        count: stats.count,
        averageResults: stats.totalResults / stats.count,
        averageResponseTime: stats.totalResponseTime / stats.count,
        successRate: (stats.count - stats.failures) / stats.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  async recordQuery(query: string, resultCount: number, responseTime: number): Promise<void> {
    this.updateQueryStats(query, resultCount, responseTime, false);
  }

  async getAnalytics(startDate: Date, endDate: Date): Promise<SearchAnalytics> {
    const totalQueries = Array.from(this.queryStats.values()).reduce(
      (sum, stats) => sum + stats.count,
      0,
    );

    const uniqueQueries = this.queryStats.size;

    const averageQueryLength =
      Array.from(this.queryStats.keys()).reduce((sum, query) => sum + query.length, 0) /
        uniqueQueries || 0;

    const topQueries = await this.getPopularQueries(10);

    const averageResponseTime =
      Array.from(this.queryStats.values()).reduce(
        (sum, stats) => sum + stats.totalResponseTime / stats.count,
        0,
      ) / uniqueQueries || 0;

    const slowQueries = this.slowQueries
      .filter((sq) => sq.timestamp >= startDate && sq.timestamp <= endDate)
      .slice(0, 20);

    const cacheMetrics = this.getCacheMetrics();

    const averageResults =
      Array.from(this.queryStats.values()).reduce(
        (sum, stats) => sum + stats.totalResults / stats.count,
        0,
      ) / uniqueQueries || 0;

    const zeroResultQueries = Array.from(this.queryStats.values()).filter(
      (stats) => stats.totalResults === 0,
    ).length;

    return {
      totalQueries,
      uniqueQueries,
      averageQueryLength,
      topQueries,
      averageResponseTime,
      slowQueries,
      cacheMetrics,
      averageResults,
      zeroResultQueries,
      clickThroughRate: 0.75, // Placeholder - would need click tracking
      startDate,
      endDate,
    };
  }

  private validateQuery(query: SearchQuery): void {
    if (!query.query || query.query.trim().length === 0) {
      throw new IndexError('Query cannot be empty', IndexErrorCode.INVALID_QUERY, { query });
    }

    if (query.query.length > 500) {
      throw new IndexError('Query too long (max 500 characters)', IndexErrorCode.INVALID_QUERY, {
        queryLength: query.query.length,
      });
    }

    if (query.limit && query.limit > 1000) {
      throw new IndexError('Limit too high (max 1000)', IndexErrorCode.INVALID_QUERY, {
        limit: query.limit,
      });
    }
  }

  private prepareSearchOptions(query: SearchQuery): any {
    const limit = Math.min(query.limit || 20, 1000);
    const offset = query.offset || 0;

    return {
      limit,
      offset,
      orderBy: 'score DESC',
      includeSnippets: query.includeSnippets !== false,
      filters: {
        types: Array.isArray(query.type) ? query.type : query.type ? [query.type] : undefined,
        categories: Array.isArray(query.category)
          ? query.category
          : query.category
            ? [query.category]
            : undefined,
        tags: Array.isArray(query.tags) ? query.tags : query.tags ? [query.tags] : undefined,
        projectIds: query.projectId ? [query.projectId] : undefined,
        agentTypes: Array.isArray(query.agentTypes)
          ? query.agentTypes
          : query.agentTypes
            ? [query.agentTypes]
            : undefined,
        createdAfter: query.createdAfter,
        createdBefore: query.createdBefore,
      },
    };
  }

  private async processSearchResults(
    rawResults: any[],
    query: SearchQuery,
  ): Promise<SearchResult[]> {
    const weights = this.getSearchWeights(query);

    return rawResults.map((raw, index) => {
      // Parse metadata
      const metadata = typeof raw.metadata === 'string' ? JSON.parse(raw.metadata) : raw.metadata;

      // Create index entry
      const entry = {
        id: raw.id,
        type: raw.type as IndexContentType,
        title: raw.title,
        content: raw.content,
        path: raw.path,
        hash: raw.hash || '',
        metadata,
        lastModified: new Date(raw.lastModified),
        searchVector: undefined,
      };

      // Calculate enhanced relevance score
      const relevanceFactors = this.calculateRelevanceFactors(raw, query, weights);
      const enhancedScore = this.calculateEnhancedScore(raw.score, relevanceFactors, weights);

      // Generate content snippets
      const contentSnippets = this.generateContentSnippets(
        raw.content,
        query.query,
        query.snippetLength || 150,
      );

      // Determine matched fields
      const matchedFields = this.getMatchedFields(raw, query.query);

      return {
        entry,
        score: enhancedScore,
        rank: index + 1,
        titleSnippet: query.highlightResults
          ? this.highlightText(raw.title, query.query)
          : undefined,
        contentSnippets,
        matchedFields,
        totalMatches: contentSnippets.length,
        relevanceFactors,
      };
    });
  }

  private getSearchWeights(query: SearchQuery): SearchWeights {
    return {
      title: query.customWeights?.title || 3.0,
      content: query.customWeights?.content || 1.0,
      tags: query.customWeights?.tags || 2.0,
      category: query.customWeights?.category || 1.5,
      recency: query.customWeights?.recency || 0.1,
      effectiveness: query.customWeights?.effectiveness || 0.2,
    };
  }

  private calculateRelevanceFactors(raw: any, query: SearchQuery, weights: SearchWeights): any {
    const metadata = typeof raw.metadata === 'string' ? JSON.parse(raw.metadata) : raw.metadata;

    const titleMatch = this.calculateTextMatchScore(raw.title, query.query);
    const contentMatch = this.calculateTextMatchScore(raw.content, query.query);
    const tagMatch = this.calculateTagMatchScore(metadata.tags || [], query.query);
    const categoryMatch =
      metadata.category && query.query.toLowerCase().includes(metadata.category.toLowerCase())
        ? 1.0
        : 0.0;

    // Recency boost (more recent = higher score)
    const daysSinceModified = (Date.now() - raw.lastModified) / (1000 * 60 * 60 * 24);
    const recencyBoost = query.boostRecent ? Math.exp(-daysSinceModified / 30) : 0.0; // 30-day decay

    // Effectiveness boost
    const effectivenessBoost =
      query.boostEffective && metadata.effectiveness ? metadata.effectiveness : 0.0;

    // Usage boost
    const usageBoost = metadata.usageCount ? Math.log(metadata.usageCount + 1) / 10 : 0.0;

    return {
      titleMatch,
      contentMatch,
      tagMatch,
      categoryMatch,
      recencyBoost,
      effectivenessBoost,
      usageBoost,
    };
  }

  private calculateEnhancedScore(
    baseScore: number,
    relevanceFactors: any,
    weights: SearchWeights,
  ): number {
    return (
      baseScore +
      relevanceFactors.titleMatch * weights.title +
      relevanceFactors.contentMatch * weights.content +
      relevanceFactors.tagMatch * weights.tags +
      relevanceFactors.categoryMatch * weights.category +
      relevanceFactors.recencyBoost * weights.recency +
      relevanceFactors.effectivenessBoost * weights.effectiveness
    );
  }

  private calculateTextMatchScore(text: string, query: string): number {
    const textLower = text.toLowerCase();
    const queryLower = query.toLowerCase();

    // Exact phrase match gets highest score
    if (textLower.includes(queryLower)) {
      return 1.0;
    }

    // Individual word matches
    const queryWords = queryLower.split(/\s+/);
    const matchedWords = queryWords.filter((word) => textLower.includes(word));

    return matchedWords.length / queryWords.length;
  }

  private calculateTagMatchScore(tags: string[], query: string): number {
    if (!tags || tags.length === 0) return 0;

    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);

    let matches = 0;
    for (const tag of tags) {
      const tagLower = tag.toLowerCase();
      if (queryWords.some((word) => tagLower.includes(word))) {
        matches++;
      }
    }

    return matches / tags.length;
  }

  private generateContentSnippets(
    content: string,
    query: string,
    maxLength: number,
  ): ContentSnippet[] {
    const queryWords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 2);
    const snippets: ContentSnippet[] = [];
    const contentLower = content.toLowerCase();

    for (const word of queryWords) {
      let startIndex = 0;
      let matchIndex;

      while ((matchIndex = contentLower.indexOf(word, startIndex)) !== -1) {
        const contextStart = Math.max(0, matchIndex - Math.floor(maxLength / 2));
        const contextEnd = Math.min(content.length, contextStart + maxLength);

        const snippetText = content.slice(contextStart, contextEnd);
        const highlighted = this.highlightText(snippetText, word);

        snippets.push({
          text: snippetText,
          highlighted,
          startOffset: contextStart,
          endOffset: contextEnd,
          context: this.getSnippetContext(content, contextStart, contextEnd),
        });

        startIndex = matchIndex + 1;

        // Limit snippets per query word
        if (snippets.length >= 3) break;
      }
    }

    return snippets.slice(0, 5); // Max 5 snippets total
  }

  private highlightText(text: string, query: string): string {
    const queryWords = query.toLowerCase().split(/\s+/);
    let highlighted = text;

    for (const word of queryWords) {
      if (word.length > 2) {
        const regex = new RegExp(`(${this.escapeRegex(word)})`, 'gi');
        highlighted = highlighted.replace(regex, '<mark>$1</mark>');
      }
    }

    return highlighted;
  }

  private getSnippetContext(content: string, start: number, end: number): string {
    const contextBefore = content.slice(Math.max(0, start - 50), start);
    const contextAfter = content.slice(end, Math.min(content.length, end + 50));
    return contextBefore + '...' + contextAfter;
  }

  private getMatchedFields(raw: any, query: string): string[] {
    const fields: string[] = [];
    const queryLower = query.toLowerCase();

    if (raw.title.toLowerCase().includes(queryLower)) {
      fields.push('title');
    }

    if (raw.content.toLowerCase().includes(queryLower)) {
      fields.push('content');
    }

    const metadata = typeof raw.metadata === 'string' ? JSON.parse(raw.metadata) : raw.metadata;

    if (metadata.tags && Array.isArray(metadata.tags)) {
      const tagMatch = metadata.tags.some((tag: string) => tag.toLowerCase().includes(queryLower));
      if (tagMatch) fields.push('tags');
    }

    if (metadata.category && metadata.category.toLowerCase().includes(queryLower)) {
      fields.push('category');
    }

    return fields;
  }

  private async generateFacets(query: SearchQuery, results: any[]): Promise<SearchFacets> {
    // For now, generate facets from current results
    // In production, you might want to run separate aggregation queries

    const types = new Map<string, number>();
    const categories = new Map<string, number>();
    const tags = new Map<string, number>();
    const projects = new Map<string, number>();
    const agents = new Map<string, number>();
    const languages = new Map<string, number>();

    for (const result of results) {
      const metadata =
        typeof result.metadata === 'string' ? JSON.parse(result.metadata) : result.metadata;

      // Count types
      types.set(result.type, (types.get(result.type) || 0) + 1);

      // Count categories
      if (metadata.category) {
        categories.set(metadata.category, (categories.get(metadata.category) || 0) + 1);
      }

      // Count tags
      if (metadata.tags && Array.isArray(metadata.tags)) {
        for (const tag of metadata.tags) {
          tags.set(tag, (tags.get(tag) || 0) + 1);
        }
      }

      // Count projects
      if (metadata.projectId) {
        projects.set(metadata.projectId, (projects.get(metadata.projectId) || 0) + 1);
      }

      // Count agent types
      if (metadata.agentTypes && Array.isArray(metadata.agentTypes)) {
        for (const agentType of metadata.agentTypes) {
          agents.set(agentType, (agents.get(agentType) || 0) + 1);
        }
      }

      // Count languages
      if (metadata.language) {
        languages.set(metadata.language, (languages.get(metadata.language) || 0) + 1);
      }
    }

    return {
      types: this.mapToFacetCounts(types, query.type),
      categories: this.mapToFacetCounts(categories, query.category),
      tags: this.mapToFacetCounts(tags, query.tags),
      projects: this.mapToFacetCounts(projects, query.projectId),
      agents: this.mapToFacetCounts(agents, query.agentTypes),
      languages: this.mapToFacetCounts(languages),
    };
  }

  private mapToFacetCounts(
    map: Map<string, number>,
    selectedValues?: string | string[],
  ): FacetCount[] {
    const selected = Array.isArray(selectedValues)
      ? selectedValues
      : selectedValues
        ? [selectedValues]
        : [];

    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1]) // Sort by count descending
      .slice(0, 20) // Limit facet values
      .map(([value, count]) => ({
        value,
        count,
        selected: selected.includes(value),
      }));
  }

  private async generateSuggestions(query: string): Promise<string[]> {
    const suggestions = await this.getSuggestions(query, 5);

    // Add some smart suggestions based on content types
    if (query.toLowerCase().includes('error')) {
      suggestions.push('error handling', 'debugging', 'troubleshooting');
    }

    if (query.toLowerCase().includes('test')) {
      suggestions.push('unit tests', 'integration tests', 'test coverage');
    }

    return [...new Set(suggestions)].slice(0, 10);
  }

  private generateBasicSuggestions(partial: string): string[] {
    const commonQueries = [
      'error handling',
      'authentication',
      'database connection',
      'API integration',
      'performance optimization',
      'security best practices',
      'testing strategies',
      'deployment configuration',
      'code review',
      'debugging techniques',
    ];

    return commonQueries.filter((query) => query.toLowerCase().includes(partial.toLowerCase()));
  }

  private extractKeywords(text: string): string[] {
    // Simple keyword extraction - in production, you might use more sophisticated NLP
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3 && !this.isStopWord(word));

    const wordCounts = new Map<string, number>();
    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }

    return Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word]) => word);
  }

  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'this',
      'that',
      'these',
      'those',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'have',
      'has',
      'had',
      'will',
      'would',
      'could',
      'should',
      'can',
      'may',
      'from',
      'into',
      'through',
      'during',
      'before',
      'after',
      'above',
      'below',
    ]);

    return stopWords.has(word.toLowerCase());
  }

  private generateCacheKey(query: SearchQuery): string {
    return JSON.stringify({
      query: query.query,
      type: query.type,
      category: query.category,
      tags: query.tags,
      projectId: query.projectId,
      limit: query.limit,
      offset: query.offset,
      filters: {
        createdAfter: query.createdAfter?.getTime(),
        createdBefore: query.createdBefore?.getTime(),
      },
    });
  }

  private cacheResults(key: string, results: SearchResults): void {
    if (this.queryCache.size >= this.maxCacheSize) {
      // Remove oldest entry
      const firstKey = this.queryCache.keys().next().value;
      this.queryCache.delete(firstKey);
    }

    this.queryCache.set(key, {
      results,
      timestamp: Date.now(),
    });
  }

  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, cached] of this.queryCache.entries()) {
      if (now - cached.timestamp > this.cacheExpiry) {
        this.queryCache.delete(key);
      }
    }
  }

  private updateQueryStats(
    query: string,
    resultCount: number,
    responseTime: number,
    fromCache: boolean,
    error?: Error,
  ): void {
    const stats = this.queryStats.get(query) || {
      count: 0,
      totalResults: 0,
      totalResponseTime: 0,
      failures: 0,
      cacheHits: 0,
    };

    stats.count++;
    stats.totalResults += resultCount;
    stats.totalResponseTime += responseTime;

    if (error) {
      stats.failures++;
    }

    if (fromCache) {
      stats.cacheHits++;
    }

    this.queryStats.set(query, stats);
  }

  private trackSlowQuery(query: string, responseTime: number, resultCount: number): void {
    this.slowQueries.push({
      query,
      responseTime,
      timestamp: new Date(),
      resultCount,
    });

    // Keep only recent slow queries
    if (this.slowQueries.length > this.maxSlowQueries) {
      this.slowQueries = this.slowQueries.slice(-this.maxSlowQueries);
    }
  }

  private getCacheMetrics(): CacheMetrics {
    const totalQueries = Array.from(this.queryStats.values()).reduce(
      (sum, stats) => sum + stats.count,
      0,
    );

    const totalCacheHits = Array.from(this.queryStats.values()).reduce(
      (sum, stats) => sum + stats.cacheHits,
      0,
    );

    const hitRate = totalQueries > 0 ? (totalCacheHits / totalQueries) * 100 : 0;

    return {
      hitRate,
      totalHits: totalCacheHits,
      totalMisses: totalQueries - totalCacheHits,
      cacheSize: this.queryCache.size,
      memoryUsage: this.estimateCacheMemoryUsage(),
    };
  }

  private estimateCacheMemoryUsage(): number {
    // Rough estimation of cache memory usage
    let totalSize = 0;
    for (const [key, cached] of this.queryCache.entries()) {
      totalSize += key.length * 2; // String characters are 2 bytes
      totalSize += JSON.stringify(cached.results).length * 2;
    }
    return totalSize;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async getEntryById(entryId: string): Promise<any | null> {
    // This would need to be implemented to retrieve a single entry by ID
    // For now, return null
    return null;
  }
}

// Supporting interfaces
interface CachedSearchResult {
  results: SearchResults;
  timestamp: number;
}

interface QueryStatsData {
  count: number;
  totalResults: number;
  totalResponseTime: number;
  failures: number;
  cacheHits: number;
}
