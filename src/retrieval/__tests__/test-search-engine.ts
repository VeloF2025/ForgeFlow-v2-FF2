// Real Search Engine Implementation for Testing
// Provides actual search functionality using in-memory data store

import type {
  ISearchEngine,
  SearchResults,
  SearchQuery,
  SearchResult,
  IndexEntry,
  QueryStats,
} from '../../indexing/types.js';
import { IndexContentType } from '../../indexing/types.js';

export class TestSearchEngine implements ISearchEngine {
  private entries = new Map<string, IndexEntry>();
  private queryHistory: Array<{
    query: string;
    resultCount: number;
    responseTime: number;
    timestamp: Date;
  }> = [];

  constructor(initialEntries: IndexEntry[] = []) {
    initialEntries.forEach((entry) => this.addEntry(entry));
  }

  /**
   * Add entry to test search engine
   */
  addEntry(entry: IndexEntry): void {
    this.entries.set(entry.id, entry);
  }

  /**
   * Remove entry from test search engine
   */
  removeEntry(id: string): void {
    this.entries.delete(id);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries.clear();
    this.queryHistory = [];
  }

  /**
   * Get all entries
   */
  getAllEntries(): IndexEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Search implementation using real text matching and scoring
   */
  async search(query: SearchQuery): Promise<SearchResults> {
    const startTime = Date.now();

    // Get all entries and filter by type if specified
    let candidates = Array.from(this.entries.values());

    if (query.type) {
      const types = Array.isArray(query.type) ? query.type : [query.type];
      candidates = candidates.filter((entry) => types.includes(entry.type));
    }

    // Filter by category if specified
    if (query.category) {
      const categories = Array.isArray(query.category) ? query.category : [query.category];
      candidates = candidates.filter(
        (entry) => entry.metadata.category && categories.includes(entry.metadata.category),
      );
    }

    // Filter by tags if specified
    if (query.tags) {
      const tags = Array.isArray(query.tags) ? query.tags : [query.tags];
      candidates = candidates.filter((entry) =>
        entry.metadata.tags.some((tag) => tags.includes(tag)),
      );
    }

    // Filter by project if specified
    if (query.projectId) {
      candidates = candidates.filter((entry) => entry.metadata.projectId === query.projectId);
    }

    // Filter by agent types if specified
    if (query.agentTypes) {
      const agentTypes = Array.isArray(query.agentTypes) ? query.agentTypes : [query.agentTypes];
      candidates = candidates.filter((entry) =>
        entry.metadata.agentTypes.some((type) => agentTypes.includes(type)),
      );
    }

    // Apply date filters
    if (query.createdAfter) {
      candidates = candidates.filter((entry) => entry.lastModified >= query.createdAfter);
    }
    if (query.createdBefore) {
      candidates = candidates.filter((entry) => entry.lastModified <= query.createdBefore);
    }
    if (query.usedAfter && query.usedAfter) {
      candidates = candidates.filter((entry) => entry.metadata.lastUsed >= query.usedAfter);
    }

    // Score and rank entries based on query
    const results: SearchResult[] = [];

    for (const entry of candidates) {
      const score = this.calculateScore(entry, query);

      // Apply minimum score filter
      if (query.minScore && score < query.minScore) {
        continue;
      }

      // Create snippets if requested
      const contentSnippets = query.includeSnippets
        ? this.createContentSnippets(entry.content, query.query, query.snippetLength || 150)
        : [];

      const titleSnippet = query.highlightResults
        ? this.highlightText(entry.title, query.query)
        : entry.title;

      const result: SearchResult = {
        entry,
        score,
        rank: 0, // Will be set after sorting
        titleSnippet,
        contentSnippets,
        matchedFields: this.getMatchedFields(entry, query.query),
        totalMatches: this.countMatches(entry, query.query),
        relevanceFactors: {
          titleMatch: this.calculateTitleMatch(entry.title, query.query),
          contentMatch: this.calculateContentMatch(entry.content, query.query),
          tagMatch: this.calculateTagMatch(entry.metadata.tags, query.query),
          categoryMatch: entry.metadata.category
            ? this.calculateTextMatch(entry.metadata.category, query.query)
            : 0,
          recencyBoost: query.boostRecent ? this.calculateRecencyBoost(entry.lastModified) : 0,
          effectivenessBoost:
            query.boostEffective && entry.metadata.effectiveness ? entry.metadata.effectiveness : 0,
          usageBoost: this.calculateUsageBoost(entry.metadata.usageCount),
        },
      };

      results.push(result);
    }

    // Sort by score (descending)
    results.sort((a, b) => b.score - a.score);

    // Set ranks
    results.forEach((result, index) => {
      result.rank = index + 1;
    });

    // Apply pagination
    const limit = query.limit || 20;
    const offset = query.offset || 0;
    const totalMatches = results.length;
    const paginatedResults = results.slice(offset, offset + limit);
    const currentPage = Math.floor(offset / limit) + 1;
    const totalPages = Math.ceil(totalMatches / limit);

    const executionTime = Date.now() - startTime;

    // Record query for analytics
    await this.recordQuery(query.query, totalMatches, executionTime);

    return {
      results: paginatedResults,
      totalMatches,
      totalPages,
      currentPage,
      executionTime,
      facets: this.calculateFacets(candidates),
      suggestions: await this.getSuggestions(query.query, 5),
    };
  }

  /**
   * Search for similar entries (simplified implementation)
   */
  async searchSimilar(entryId: string, limit = 10): Promise<SearchResults> {
    const targetEntry = this.entries.get(entryId);
    if (!targetEntry) {
      return {
        results: [],
        totalMatches: 0,
        totalPages: 0,
        currentPage: 1,
        executionTime: 0,
        facets: { types: [], categories: [], tags: [], projects: [], agents: [], languages: [] },
        suggestions: [],
      };
    }

    // Use tags and category for similarity
    const similarityQuery: SearchQuery = {
      query: targetEntry.metadata.tags.join(' ') + ' ' + (targetEntry.metadata.category || ''),
      type: targetEntry.type,
      limit,
    };

    const results = await this.search(similarityQuery);

    // Remove the original entry from results
    results.results = results.results.filter((result) => result.entry.id !== entryId);
    results.totalMatches = Math.max(0, results.totalMatches - 1);

    return results;
  }

  /**
   * Get search suggestions based on partial input
   */
  async getSuggestions(partial: string, limit = 10): Promise<string[]> {
    if (!partial || partial.length < 2) {
      return [];
    }

    const suggestions = new Set<string>();
    const partialLower = partial.toLowerCase();

    // Extract suggestions from entry titles, content, and tags
    for (const entry of this.entries.values()) {
      // From title
      if (entry.title.toLowerCase().includes(partialLower)) {
        suggestions.add(entry.title);
      }

      // From tags
      entry.metadata.tags.forEach((tag) => {
        if (tag.toLowerCase().includes(partialLower)) {
          suggestions.add(tag);
        }
      });

      // From category
      if (entry.metadata.category?.toLowerCase().includes(partialLower)) {
        suggestions.add(entry.metadata.category);
      }
    }

    return Array.from(suggestions).slice(0, limit);
  }

  /**
   * Get popular queries from history
   */
  async getPopularQueries(limit = 10): Promise<QueryStats[]> {
    const queryStats = new Map<
      string,
      { count: number; totalTime: number; totalResults: number; successes: number }
    >();

    this.queryHistory.forEach((record) => {
      const existing = queryStats.get(record.query) || {
        count: 0,
        totalTime: 0,
        totalResults: 0,
        successes: 0,
      };
      queryStats.set(record.query, {
        count: existing.count + 1,
        totalTime: existing.totalTime + record.responseTime,
        totalResults: existing.totalResults + (record.resultCount || 0),
        successes: existing.successes + (record.resultCount > 0 ? 1 : 0),
      });
    });

    return Array.from(queryStats.entries())
      .map(([query, stats]) => ({
        query,
        count: stats.count,
        averageResults: stats.totalResults / stats.count,
        averageResponseTime: stats.totalTime / stats.count,
        successRate: stats.successes / stats.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Record a query for analytics
   */
  async recordQuery(query: string, resultCount: number, responseTime: number): Promise<void> {
    this.queryHistory.push({
      query,
      resultCount,
      responseTime,
      timestamp: new Date(),
    });

    // Keep only last 1000 queries to prevent memory issues
    if (this.queryHistory.length > 1000) {
      this.queryHistory = this.queryHistory.slice(-1000);
    }
  }

  /**
   * Get analytics data
   */
  async getAnalytics(startDate: Date, endDate: Date): Promise<any> {
    const relevantQueries = this.queryHistory.filter(
      (record) => record.timestamp >= startDate && record.timestamp <= endDate,
    );

    return {
      totalQueries: relevantQueries.length,
      avgResponseTime:
        relevantQueries.length > 0
          ? relevantQueries.reduce((sum, q) => sum + q.responseTime, 0) / relevantQueries.length
          : 0,
      avgResultCount:
        relevantQueries.length > 0
          ? relevantQueries.reduce((sum, q) => sum + q.resultCount, 0) / relevantQueries.length
          : 0,
    };
  }

  // Helper methods for scoring and matching

  private calculateScore(entry: IndexEntry, query: SearchQuery): number {
    let score = 0;

    const weights = query.customWeights || {
      title: 3.0,
      content: 1.0,
      tags: 2.0,
      category: 1.5,
      recency: 0.1,
      effectiveness: 0.2,
    };

    // Title match
    score += this.calculateTitleMatch(entry.title, query.query) * weights.title;

    // Content match
    score += this.calculateContentMatch(entry.content, query.query) * weights.content;

    // Tag match
    score += this.calculateTagMatch(entry.metadata.tags, query.query) * weights.tags;

    // Category match
    if (entry.metadata.category) {
      score += this.calculateTextMatch(entry.metadata.category, query.query) * weights.category;
    }

    // Recency boost
    if (query.boostRecent) {
      score += this.calculateRecencyBoost(entry.lastModified) * weights.recency;
    }

    // Effectiveness boost
    if (query.boostEffective && entry.metadata.effectiveness) {
      score += entry.metadata.effectiveness * weights.effectiveness;
    }

    return Math.max(0, score);
  }

  private calculateTitleMatch(title: string, query: string): number {
    return this.calculateTextMatch(title, query) * 1.5; // Title matches are weighted higher
  }

  private calculateContentMatch(content: string, query: string): number {
    return this.calculateTextMatch(content, query);
  }

  private calculateTagMatch(tags: string[], query: string): number {
    return Math.max(...tags.map((tag) => this.calculateTextMatch(tag, query)));
  }

  private calculateTextMatch(text: string, query: string): number {
    if (!text || !query) return 0;

    const textLower = text.toLowerCase();
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);

    let matchScore = 0;

    // Exact match bonus
    if (textLower.includes(queryLower)) {
      matchScore += 2.0;
    }

    // Word matches
    queryWords.forEach((word) => {
      if (textLower.includes(word)) {
        matchScore += 1.0 / queryWords.length;
      }
    });

    // Fuzzy matching (simple substring matching)
    if (queryLower.length >= 3) {
      for (let i = 0; i <= queryLower.length - 3; i++) {
        const trigram = queryLower.substring(i, i + 3);
        if (textLower.includes(trigram)) {
          matchScore += 0.1;
        }
      }
    }

    return Math.min(matchScore, 5.0); // Cap the score
  }

  private calculateRecencyBoost(lastModified: Date): number {
    const daysSinceModified = (Date.now() - lastModified.getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, 1 - daysSinceModified / 365); // Boost decreases over a year
  }

  private calculateUsageBoost(usageCount: number): number {
    return Math.log(usageCount + 1) / 10; // Logarithmic boost based on usage
  }

  private getMatchedFields(entry: IndexEntry, query: string): string[] {
    const matchedFields: string[] = [];
    const queryLower = query.toLowerCase();

    if (entry.title.toLowerCase().includes(queryLower)) {
      matchedFields.push('title');
    }
    if (entry.content.toLowerCase().includes(queryLower)) {
      matchedFields.push('content');
    }
    if (entry.metadata.tags.some((tag) => tag.toLowerCase().includes(queryLower))) {
      matchedFields.push('tags');
    }
    if (entry.metadata.category?.toLowerCase().includes(queryLower)) {
      matchedFields.push('category');
    }

    return matchedFields;
  }

  private countMatches(entry: IndexEntry, query: string): number {
    const queryLower = query.toLowerCase();
    let count = 0;

    count += this.countOccurrences(entry.title.toLowerCase(), queryLower);
    count += this.countOccurrences(entry.content.toLowerCase(), queryLower);

    entry.metadata.tags.forEach((tag) => {
      count += this.countOccurrences(tag.toLowerCase(), queryLower);
    });

    if (entry.metadata.category) {
      count += this.countOccurrences(entry.metadata.category.toLowerCase(), queryLower);
    }

    return count;
  }

  private countOccurrences(text: string, substring: string): number {
    let count = 0;
    let position = 0;

    while ((position = text.indexOf(substring, position)) !== -1) {
      count++;
      position += substring.length;
    }

    return count;
  }

  private createContentSnippets(
    content: string,
    query: string,
    maxLength: number,
  ): Array<{
    text: string;
    highlighted: string;
    startOffset: number;
    endOffset: number;
    context: string;
  }> {
    const snippets: any[] = [];
    const queryLower = query.toLowerCase();
    const contentLower = content.toLowerCase();

    let position = 0;
    while ((position = contentLower.indexOf(queryLower, position)) !== -1) {
      const startOffset = Math.max(0, position - Math.floor(maxLength / 2));
      const endOffset = Math.min(
        content.length,
        position + query.length + Math.floor(maxLength / 2),
      );

      const text = content.substring(startOffset, endOffset);
      const highlighted = this.highlightText(text, query);

      snippets.push({
        text,
        highlighted,
        startOffset,
        endOffset,
        context: content.substring(
          Math.max(0, startOffset - 50),
          Math.min(content.length, endOffset + 50),
        ),
      });

      position += query.length;

      // Limit to 3 snippets
      if (snippets.length >= 3) {
        break;
      }
    }

    return snippets;
  }

  private highlightText(text: string, query: string): string {
    if (!query) return text;

    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  private calculateFacets(entries: IndexEntry[]): any {
    const facets = {
      types: new Map<string, number>(),
      categories: new Map<string, number>(),
      tags: new Map<string, number>(),
      projects: new Map<string, number>(),
      agents: new Map<string, number>(),
      languages: new Map<string, number>(),
    };

    entries.forEach((entry) => {
      // Types
      facets.types.set(entry.type, (facets.types.get(entry.type) || 0) + 1);

      // Categories
      if (entry.metadata.category) {
        facets.categories.set(
          entry.metadata.category,
          (facets.categories.get(entry.metadata.category) || 0) + 1,
        );
      }

      // Tags
      entry.metadata.tags.forEach((tag) => {
        facets.tags.set(tag, (facets.tags.get(tag) || 0) + 1);
      });

      // Projects
      if (entry.metadata.projectId) {
        facets.projects.set(
          entry.metadata.projectId,
          (facets.projects.get(entry.metadata.projectId) || 0) + 1,
        );
      }

      // Agents
      entry.metadata.agentTypes.forEach((agent) => {
        facets.agents.set(agent, (facets.agents.get(agent) || 0) + 1);
      });

      // Languages
      if (entry.metadata.language) {
        facets.languages.set(
          entry.metadata.language,
          (facets.languages.get(entry.metadata.language) || 0) + 1,
        );
      }
    });

    // Convert maps to arrays
    return {
      types: Array.from(facets.types.entries()).map(([value, count]) => ({
        value,
        count,
        selected: false,
      })),
      categories: Array.from(facets.categories.entries()).map(([value, count]) => ({
        value,
        count,
        selected: false,
      })),
      tags: Array.from(facets.tags.entries()).map(([value, count]) => ({
        value,
        count,
        selected: false,
      })),
      projects: Array.from(facets.projects.entries()).map(([value, count]) => ({
        value,
        count,
        selected: false,
      })),
      agents: Array.from(facets.agents.entries()).map(([value, count]) => ({
        value,
        count,
        selected: false,
      })),
      languages: Array.from(facets.languages.entries()).map(([value, count]) => ({
        value,
        count,
        selected: false,
      })),
    };
  }
}

// Helper function to create test entries
export function createTestIndexEntry(overrides: Partial<IndexEntry> = {}): IndexEntry {
  const id = overrides.id || `test-entry-${Math.random().toString(36).substr(2, 9)}`;

  return {
    id,
    type: 'knowledge',
    title: `Test Entry ${id}`,
    content: 'This is test content for search indexing and retrieval testing.',
    path: `/test/entries/${id}`,
    hash: `hash-${id}`,
    lastModified: new Date(),
    metadata: {
      tags: ['test', 'example'],
      category: 'test-category',
      projectId: 'test-project',
      agentTypes: ['test-agent'],
      difficulty: 'medium',
      scope: 'project',
      effectiveness: 0.8,
      usageCount: 5,
      lastUsed: new Date(),
      successRate: 0.9,
      fileSize: 1024,
      language: 'en',
      relatedIds: [],
      parentId: undefined,
      childIds: [],
    },
    ...overrides,
  };
}
