// Knowledge Card Storage - Markdown-based Persistence
// Handles file-based storage of knowledge cards with YAML frontmatter

import { promises as fs } from 'fs';
import * as path from 'path';
import { 
  KnowledgeCard, 
  KnowledgeQuery, 
  KnowledgeSearchResult, 
  KnowledgeConfig 
} from '../types';
import { 
  KnowledgeCardFile, 
  FileOperationResult, 
  SearchIndexEntry 
} from './types';
import { logger } from '../utils/logger';
import YAML from 'yaml';

/**
 * Card Store Implementation
 * 
 * Provides markdown-based storage for knowledge cards with:
 * - YAML frontmatter for metadata
 * - Markdown content for card body
 * - File-based indexing for search
 * - Atomic operations for consistency
 * 
 * Performance Target: <50ms per operation
 */
export class CardStore {
  private config: KnowledgeConfig;
  private initialized = false;
  private searchIndex: Map<string, SearchIndexEntry> = new Map();

  constructor(config: KnowledgeConfig) {
    this.config = config;
  }

  /**
   * Initialize the card store
   * Creates directory structure and loads search index
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Ensure directories exist
      await this.ensureDirectories();
      
      // Load existing cards into search index
      await this.rebuildSearchIndex();
      
      this.initialized = true;
      logger.debug('Card store initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize card store:', error);
      throw error;
    }
  }

  /**
   * Save a knowledge card to storage
   * @param card Complete knowledge card data
   */
  async saveCard(card: KnowledgeCard): Promise<void> {
    this.ensureInitialized();
    
    try {
      const filePath = this.getCardPath(card);
      const fileContent = this.serializeCard(card);
      
      // Atomic write operation
      const tempPath = `${filePath}.tmp`;
      await fs.writeFile(tempPath, fileContent, 'utf8');
      await fs.rename(tempPath, filePath);
      
      // Update search index
      this.updateSearchIndex(card);
      
      logger.debug(`Saved knowledge card: ${card.id} at ${filePath}`);
    } catch (error) {
      logger.error(`Failed to save card ${card.id}:`, error);
      throw new Error(`Failed to save card: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Load a knowledge card from storage
   * @param id Card identifier
   * @returns Card data or null if not found
   */
  async getCard(id: string): Promise<KnowledgeCard | null> {
    this.ensureInitialized();
    
    try {
      let filePath = this.findCardPath(id);
      
      // If not found in index, try both paths
      if (!filePath) {
        const possiblePaths = [
          path.join(this.config.storageBasePath, 'knowledge', 'global', `${id}.md`),
          path.join(this.config.storageBasePath, 'knowledge', 'project', `${id}.md`)
        ];
        
        for (const possiblePath of possiblePaths) {
          try {
            await fs.access(possiblePath);
            filePath = possiblePath;
            break;
          } catch {
            // File doesn't exist at this path
          }
        }
      }

      if (!filePath) {
        return null;
      }

      const fileContent = await fs.readFile(filePath, 'utf8');
      const card = this.deserializeCard(fileContent);
      
      if (!card) {
        logger.warn(`Failed to deserialize card ${id} from ${filePath}`);
        return null;
      }

      logger.debug(`Loaded knowledge card: ${id}`);
      return card;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      
      logger.error(`Failed to get card ${id}:`, error);
      throw new Error(`Failed to get card: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a knowledge card from storage
   * @param id Card identifier
   */
  async deleteCard(id: string): Promise<void> {
    this.ensureInitialized();
    
    try {
      const filePath = this.findCardPath(id);
      if (!filePath) {
        throw new Error(`Card not found: ${id}`);
      }

      await fs.unlink(filePath);
      this.searchIndex.delete(id);
      
      logger.debug(`Deleted knowledge card: ${id}`);
    } catch (error) {
      logger.error(`Failed to delete card ${id}:`, error);
      throw new Error(`Failed to delete card: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search knowledge cards based on query criteria
   * @param query Search parameters and filters
   * @returns Matching cards with relevance scores
   */
  async searchCards(query: KnowledgeQuery): Promise<KnowledgeSearchResult[]> {
    this.ensureInitialized();
    
    try {
      const results: KnowledgeSearchResult[] = [];
      const searchTerms = this.tokenizeSearchText(query.text);
      
      // Search through index entries
      for (const cardId of Array.from(this.searchIndex.keys())) {
        const indexEntry = this.searchIndex.get(cardId)!;
        // Apply filters first
        if (!this.matchesFilters(indexEntry, query.filters)) {
          continue;
        }

        // Calculate relevance score
        const relevanceScore = this.calculateRelevance(indexEntry, searchTerms);
        if (relevanceScore > 0) {
          const card = await this.getCard(cardId);
          if (card) {
            results.push({
              card,
              relevanceScore,
              matchType: this.getMatchType(indexEntry, searchTerms),
              snippet: this.generateSnippet(indexEntry.content, searchTerms)
            });
          }
        }
      }

      // Sort by relevance score and apply limit
      results.sort((a, b) => b.relevanceScore - a.relevanceScore);
      
      if (query.limit && query.limit > 0) {
        results.splice(query.limit);
      }

      logger.debug(`Search completed: ${results.length} results for "${query.text}"`);
      return results;
    } catch (error) {
      logger.error('Failed to search cards:', error);
      throw new Error(`Failed to search cards: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get card statistics
   * @returns Statistics about stored cards
   */
  async getStats(): Promise<{
    total: number;
    byType: Record<KnowledgeCard['type'], number>;
    byCategory: Record<string, number>;
    averageEffectiveness: number;
  }> {
    this.ensureInitialized();
    
    try {
      const stats = {
        total: 0,
        byType: {} as Record<KnowledgeCard['type'], number>,
        byCategory: {} as Record<string, number>,
        averageEffectiveness: 0
      };

      let totalEffectiveness = 0;

      for (const entry of Array.from(this.searchIndex.values())) {
        if (entry.type === 'knowledge') {
          stats.total++;
          
          const card = await this.getCard(entry.id);
          if (card) {
            // Count by type
            stats.byType[card.type] = (stats.byType[card.type] || 0) + 1;
            
            // Count by category
            stats.byCategory[card.category] = (stats.byCategory[card.category] || 0) + 1;
            
            // Sum effectiveness for average
            totalEffectiveness += card.effectiveness;
          }
        }
      }

      // Calculate average effectiveness
      if (stats.total > 0) {
        stats.averageEffectiveness = Math.round((totalEffectiveness / stats.total) * 100) / 100;
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get card statistics:', error);
      throw new Error(`Failed to get statistics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Cleanup old or unused cards
   */
  async cleanup(): Promise<void> {
    this.ensureInitialized();
    
    try {
      let cleanedCount = 0;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.cleanupIntervalDays);

      for (const cardId of Array.from(this.searchIndex.keys())) {
        const card = await this.getCard(cardId);
        if (card && this.shouldCleanupCard(card, cutoffDate)) {
          await this.deleteCard(cardId);
          cleanedCount++;
        }
      }

      logger.info(`Card cleanup completed: ${cleanedCount} cards removed`);
    } catch (error) {
      logger.error('Failed to cleanup cards:', error);
      throw new Error(`Failed to cleanup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ==================== Private Helper Methods ====================

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Card store not initialized');
    }
  }

  private async ensureDirectories(): Promise<void> {
    const dirs = [
      path.join(this.config.storageBasePath, 'knowledge', 'project'),
      path.join(this.config.storageBasePath, 'knowledge', 'global')
    ];

    await Promise.all(
      dirs.map(dir => fs.mkdir(dir, { recursive: true }))
    );
  }

  private getCardPath(card: KnowledgeCard): string {
    const subdir = card.projectId ? 'project' : 'global';
    const filename = `${card.id}.md`;
    return path.join(this.config.storageBasePath, 'knowledge', subdir, filename);
  }

  private findCardPath(id: string): string | null {
    // Try both project and global directories
    const paths = [
      path.join(this.config.storageBasePath, 'knowledge', 'project', `${id}.md`),
      path.join(this.config.storageBasePath, 'knowledge', 'global', `${id}.md`)
    ];

    // For performance, check search index first
    for (const entry of this.searchIndex.values()) {
      if (entry.id === id) {
        // Return the path for global directory (most cards go there by default)
        return paths[1]; // Return global path
      }
    }

    // If not in index, return null - we'll handle file existence check in getCard
    return null;
  }

  private serializeCard(card: KnowledgeCard): string {
    const frontmatter = {
      id: card.id,
      title: card.title,
      type: card.type,
      category: card.category,
      tags: card.tags,
      projectId: card.projectId,
      usageCount: card.usageCount,
      effectiveness: card.effectiveness,
      createdAt: card.createdAt.toISOString(),
      updatedAt: card.updatedAt.toISOString(),
      lastUsed: card.lastUsed.toISOString(),
      difficulty: card.metadata.difficulty,
      scope: card.metadata.scope,
      agentTypes: card.metadata.agentTypes,
      relatedIssues: card.metadata.relatedIssues,
      outcomes: card.metadata.outcomes.map(outcome => ({
        ...outcome,
        timestamp: outcome.timestamp.toISOString()
      }))
    };

    const yamlFrontmatter = this.stringifyYaml(frontmatter);
    
    return `---\n${yamlFrontmatter}---\n\n${card.content}`;
  }

  private deserializeCard(fileContent: string): KnowledgeCard | null {
    try {
      const parts = fileContent.split('---\n');
      if (parts.length < 3) {
        return null;
      }

      const frontmatterYaml = parts[1];
      const content = parts.slice(2).join('---\n').trim();
      
      const frontmatter = this.parseYaml(frontmatterYaml);
      if (!frontmatter || !frontmatter.id) {
        return null;
      }

      const card: KnowledgeCard = {
        id: frontmatter.id,
        title: frontmatter.title || '',
        content,
        type: frontmatter.type || 'pattern',
        category: frontmatter.category || 'general',
        tags: frontmatter.tags || [],
        projectId: frontmatter.projectId,
        usageCount: frontmatter.usageCount || 0,
        effectiveness: frontmatter.effectiveness || 0.5,
        createdAt: new Date(frontmatter.createdAt),
        updatedAt: new Date(frontmatter.updatedAt),
        lastUsed: new Date(frontmatter.lastUsed),
        metadata: {
          difficulty: frontmatter.difficulty || 'medium',
          scope: frontmatter.scope || 'global',
          agentTypes: frontmatter.agentTypes || [],
          relatedIssues: frontmatter.relatedIssues || [],
          outcomes: (frontmatter.outcomes || []).map((outcome: any) => ({
            ...outcome,
            timestamp: new Date(outcome.timestamp)
          }))
        }
      };

      return card;
    } catch (error) {
      logger.error('Failed to deserialize card:', error);
      return null;
    }
  }

  private async rebuildSearchIndex(): Promise<void> {
    this.searchIndex.clear();

    const knowledgeDirs = [
      path.join(this.config.storageBasePath, 'knowledge', 'project'),
      path.join(this.config.storageBasePath, 'knowledge', 'global')
    ];

    for (const dir of knowledgeDirs) {
      try {
        const files = await fs.readdir(dir);
        
        for (const file of files) {
          if (file.endsWith('.md')) {
            const filePath = path.join(dir, file);
            try {
              const content = await fs.readFile(filePath, 'utf8');
              const card = this.deserializeCard(content);
              
              if (card) {
                this.updateSearchIndex(card);
              }
            } catch (error) {
              logger.warn(`Failed to index card file ${filePath}:`, error);
            }
          }
        }
      } catch (error) {
        // Directory might not exist yet, that's ok
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          logger.warn(`Failed to read knowledge directory ${dir}:`, error);
        }
      }
    }

    logger.debug(`Search index rebuilt: ${this.searchIndex.size} cards indexed`);
  }

  private updateSearchIndex(card: KnowledgeCard): void {
    const indexEntry: SearchIndexEntry = {
      id: card.id,
      type: 'knowledge',
      title: card.title,
      content: card.content,
      tags: card.tags,
      category: card.category,
      effectiveness: card.effectiveness,
      lastModified: card.updatedAt
    };

    this.searchIndex.set(card.id, indexEntry);
  }

  private tokenizeSearchText(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 2);
  }

  private matchesFilters(entry: SearchIndexEntry, filters?: KnowledgeQuery['filters']): boolean {
    if (!filters) return true;

    // Type filter
    if (filters.type && entry.type === 'knowledge') {
      // This would need the actual card to check type - simplified for now
      // In a real implementation, we'd store type in the search index
    }

    // Category filter
    if (filters.category && entry.category && !filters.category.includes(entry.category)) {
      return false;
    }

    // Tags filter
    if (filters.tags && filters.tags.length > 0) {
      const hasMatchingTag = filters.tags.some(tag => 
        entry.tags.some(entryTag => 
          entryTag.toLowerCase().includes(tag.toLowerCase())
        )
      );
      if (!hasMatchingTag) return false;
    }

    // Effectiveness filter
    if (filters.minEffectiveness && entry.effectiveness && entry.effectiveness < filters.minEffectiveness) {
      return false;
    }

    return true;
  }

  private calculateRelevance(entry: SearchIndexEntry, searchTerms: string[]): number {
    let score = 0;

    // If no search terms (empty search), return base relevance based on effectiveness
    if (searchTerms.length === 0) {
      return entry.effectiveness || 0.5; // Default to 0.5 if no effectiveness
    }

    // Title matches (highest weight)
    const titleLower = entry.title.toLowerCase();
    for (const term of searchTerms) {
      if (titleLower.includes(term)) {
        score += 10;
      }
    }

    // Content matches
    const contentLower = entry.content.toLowerCase();
    for (const term of searchTerms) {
      if (contentLower.includes(term)) {
        score += 3;
      }
    }

    // Tag matches
    for (const tag of entry.tags) {
      const tagLower = tag.toLowerCase();
      for (const term of searchTerms) {
        if (tagLower.includes(term)) {
          score += 5;
        }
      }
    }

    // Boost by effectiveness
    if (entry.effectiveness) {
      score *= (1 + entry.effectiveness);
    }

    return Math.round(score * 100) / 100;
  }

  private getMatchType(entry: SearchIndexEntry, searchTerms: string[]): KnowledgeSearchResult['matchType'] {
    const titleLower = entry.title.toLowerCase();
    for (const term of searchTerms) {
      if (titleLower.includes(term)) {
        return 'title';
      }
    }

    for (const tag of entry.tags) {
      const tagLower = tag.toLowerCase();
      for (const term of searchTerms) {
        if (tagLower.includes(term)) {
          return 'tags';
        }
      }
    }

    return 'content';
  }

  private generateSnippet(content: string, searchTerms: string[]): string {
    const maxSnippetLength = 200;
    
    // Find first occurrence of any search term
    const contentLower = content.toLowerCase();
    let firstMatchIndex = content.length;
    
    for (const term of searchTerms) {
      const index = contentLower.indexOf(term);
      if (index !== -1 && index < firstMatchIndex) {
        firstMatchIndex = index;
      }
    }

    if (firstMatchIndex === content.length) {
      // No matches found, return beginning of content
      return content.substring(0, maxSnippetLength) + (content.length > maxSnippetLength ? '...' : '');
    }

    // Extract snippet around the match
    const start = Math.max(0, firstMatchIndex - 50);
    const end = Math.min(content.length, start + maxSnippetLength);
    
    let snippet = content.substring(start, end);
    
    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';
    
    return snippet;
  }

  private shouldCleanupCard(card: KnowledgeCard, cutoffDate: Date): boolean {
    // Don't cleanup recently used cards
    if (card.lastUsed > cutoffDate) {
      return false;
    }

    // Don't cleanup high-effectiveness cards
    if (card.effectiveness > 0.7) {
      return false;
    }

    // Don't cleanup if used recently or frequently
    if (card.usageCount > 5) {
      return false;
    }

    return true;
  }

  private stringifyYaml(obj: any): string {
    return YAML.stringify(obj, {
      indent: 2,
      lineWidth: 0,
      minContentWidth: 0
    });
  }

  private parseYaml(yaml: string): any {
    try {
      return YAML.parse(yaml);
    } catch (error) {
      logger.error('Failed to parse YAML frontmatter:', error);
      return null;
    }
  }
}