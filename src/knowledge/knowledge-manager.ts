// Knowledge Management System - Core Operations
// Implements the KnowledgeManager interface with file-based storage

import { promises as fs } from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import type {
  KnowledgeCard,
  KnowledgeQuery,
  KnowledgeSearchResult,
  KnowledgeStats,
  KnowledgeOutcome,
  GotchaPattern,
  ArchitectureDecisionRecord,
  KnowledgeManager as IKnowledgeManager,
  KnowledgeConfig,
} from '../types';
import { CardStore } from './card-store';
import { GotchaTracker } from './gotcha-tracker';
import { ADRManager } from './adr-manager';
import type { RecommendationContext, KnowledgeRecommendation } from './smart-recommendations';
import { SmartRecommendationsEngine } from './smart-recommendations';
import { logger } from '../utils/logger';

/**
 * Core Knowledge Management System
 *
 * Provides centralized access to:
 * - Knowledge Cards (patterns, solutions, best practices)
 * - Gotcha Patterns (recurring issues and failures)
 * - Architecture Decision Records (design decisions)
 *
 * Performance Target: <100ms for all operations
 */
export class KnowledgeManager extends EventEmitter implements IKnowledgeManager {
  private cardStore: CardStore;
  private gotchaTracker: GotchaTracker;
  private adrManager: ADRManager;
  private recommendationsEngine: SmartRecommendationsEngine;
  private config: KnowledgeConfig;
  private initialized = false;

  constructor(config: KnowledgeConfig) {
    super();
    this.config = config;
    this.cardStore = new CardStore(config);
    this.gotchaTracker = new GotchaTracker(config);
    this.adrManager = new ADRManager(config);
    this.recommendationsEngine = new SmartRecommendationsEngine(this);
  }

  /**
   * Initialize the knowledge management system
   * Creates directory structure and loads existing data
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      logger.info('Initializing Knowledge Management System');

      // Ensure directory structure exists
      await this.ensureDirectoryStructure();

      // Initialize subsystems
      await Promise.all([
        this.cardStore.initialize(),
        this.gotchaTracker.initialize(),
        this.adrManager.initialize(),
      ]);

      this.initialized = true;
      logger.info('Knowledge Management System initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Knowledge Management System:', error);
      throw error;
    }
  }

  // ==================== Knowledge Card Operations ====================

  /**
   * Create a new knowledge card
   * @param card Card data without system-generated fields
   * @returns Promise resolving to created card with generated fields
   */
  async createCard(
    card: Omit<KnowledgeCard, 'id' | 'createdAt' | 'updatedAt' | 'lastUsed' | 'usageCount'>,
  ): Promise<KnowledgeCard> {
    this.ensureInitialized();

    try {
      const newCard: KnowledgeCard = {
        ...card,
        id: this.generateId('card'),
        usageCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastUsed: new Date(),
        metadata: {
          ...card.metadata,
          outcomes: [],
        },
      };

      await this.cardStore.saveCard(newCard);

      logger.debug(`Created knowledge card: ${newCard.id} - ${newCard.title}`);
      return newCard;
    } catch (error) {
      logger.error('Failed to create knowledge card:', error);
      throw new Error(
        `Failed to create knowledge card: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Retrieve a knowledge card by ID
   * @param id Card identifier
   * @returns Promise resolving to card or null if not found
   */
  async getCard(id: string): Promise<KnowledgeCard | null> {
    this.ensureInitialized();

    try {
      return await this.cardStore.getCard(id);
    } catch (error) {
      logger.error(`Failed to get knowledge card ${id}:`, error);
      throw new Error(
        `Failed to get knowledge card: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Update an existing knowledge card
   * @param id Card identifier
   * @param updates Partial card updates
   * @returns Promise resolving to updated card
   */
  async updateCard(id: string, updates: Partial<KnowledgeCard>): Promise<KnowledgeCard> {
    this.ensureInitialized();

    try {
      const existingCard = await this.cardStore.getCard(id);
      if (!existingCard) {
        throw new Error(`Knowledge card not found: ${id}`);
      }

      const updatedCard: KnowledgeCard = {
        ...existingCard,
        ...updates,
        id, // Ensure ID cannot be changed
        updatedAt: new Date(),
      };

      await this.cardStore.saveCard(updatedCard);

      logger.debug(`Updated knowledge card: ${id}`);
      return updatedCard;
    } catch (error) {
      logger.error(`Failed to update knowledge card ${id}:`, error);
      throw new Error(
        `Failed to update knowledge card: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Delete a knowledge card
   * @param id Card identifier
   */
  async deleteCard(id: string): Promise<void> {
    this.ensureInitialized();

    try {
      await this.cardStore.deleteCard(id);
      logger.debug(`Deleted knowledge card: ${id}`);
    } catch (error) {
      logger.error(`Failed to delete knowledge card ${id}:`, error);
      throw new Error(
        `Failed to delete knowledge card: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Search knowledge cards based on query criteria
   * @param query Search parameters and filters
   * @returns Promise resolving to search results with relevance scores
   */
  async searchCards(query: KnowledgeQuery): Promise<KnowledgeSearchResult[]> {
    this.ensureInitialized();

    try {
      return await this.cardStore.searchCards(query);
    } catch (error) {
      logger.error('Failed to search knowledge cards:', error);
      throw new Error(
        `Failed to search knowledge cards: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // ==================== Usage Tracking ====================

  /**
   * Record usage of a knowledge card with outcome metrics
   * @param cardId Card identifier
   * @param issueId Associated issue ID
   * @param outcome Usage outcome data
   */
  async recordUsage(cardId: string, issueId: string, outcome: KnowledgeOutcome): Promise<void> {
    this.ensureInitialized();

    try {
      const card = await this.cardStore.getCard(cardId);
      if (!card) {
        throw new Error(`Knowledge card not found: ${cardId}`);
      }

      // Update usage statistics
      card.usageCount += 1;
      card.lastUsed = new Date();
      card.metadata.outcomes.push(outcome);

      // Save the updated card
      await this.cardStore.saveCard(card);

      // Update effectiveness score (which will save the card again)
      await this.updateEffectiveness(cardId);

      logger.debug(`Recorded usage for card ${cardId} in issue ${issueId}`);
    } catch (error) {
      logger.error(`Failed to record usage for card ${cardId}:`, error);
      throw new Error(
        `Failed to record usage: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Recalculate effectiveness score for a knowledge card
   * @param cardId Card identifier
   */
  async updateEffectiveness(cardId: string): Promise<void> {
    this.ensureInitialized();

    try {
      const card = await this.cardStore.getCard(cardId);
      if (!card) {
        throw new Error(`Knowledge card not found: ${cardId}`);
      }

      // Calculate effectiveness based on outcomes
      const outcomes = card.metadata.outcomes;
      if (outcomes.length === 0) {
        card.effectiveness = 0.5; // Neutral score for unused cards
      } else {
        const successCount = outcomes.filter((o) => o.success).length;
        const baseEffectiveness = successCount / outcomes.length;

        // Weight recent outcomes more heavily
        const recentOutcomes = outcomes.filter(
          (o) => Date.now() - o.timestamp.getTime() < 30 * 24 * 60 * 60 * 1000, // 30 days
        );
        const recentSuccessRate =
          recentOutcomes.length > 0
            ? recentOutcomes.filter((o) => o.success).length / recentOutcomes.length
            : baseEffectiveness;

        // Blend historical and recent effectiveness
        card.effectiveness =
          Math.round((baseEffectiveness * 0.3 + recentSuccessRate * 0.7) * 100) / 100;
      }

      await this.cardStore.saveCard(card);
      logger.debug(`Updated effectiveness for card ${cardId}: ${card.effectiveness}`);
    } catch (error) {
      logger.error(`Failed to update effectiveness for card ${cardId}:`, error);
      throw new Error(
        `Failed to update effectiveness: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // ==================== Gotcha Operations ====================

  /**
   * Record a new gotcha pattern
   * @param pattern Gotcha pattern data
   * @returns Promise resolving to created pattern
   */
  async recordGotcha(
    pattern: Omit<GotchaPattern, 'id' | 'createdAt' | 'updatedAt' | 'promoted'>,
  ): Promise<GotchaPattern> {
    this.ensureInitialized();

    try {
      return await this.gotchaTracker.recordGotcha(pattern);
    } catch (error) {
      logger.error('Failed to record gotcha pattern:', error);
      throw new Error(
        `Failed to record gotcha: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Promote a gotcha pattern to a knowledge card
   * @param gotchaId Gotcha pattern identifier
   * @returns Promise resolving to created knowledge card
   */
  async promoteGotcha(gotchaId: string): Promise<KnowledgeCard> {
    this.ensureInitialized();

    try {
      const gotcha = await this.gotchaTracker.getGotcha(gotchaId);
      if (!gotcha) {
        throw new Error(`Gotcha pattern not found: ${gotchaId}`);
      }

      // Create knowledge card from gotcha
      const knowledgeCard = await this.createCard({
        title: `Gotcha: ${gotcha.description}`,
        content: this.generateGotchaCardContent(gotcha),
        type: 'gotcha',
        category: gotcha.category,
        tags: ['gotcha', gotcha.severity, ...gotcha.category.split('-')],
        effectiveness: 0.8, // Start with high effectiveness for promoted gotchas
        metadata: {
          difficulty:
            gotcha.severity === 'critical' ? 'high' : gotcha.severity === 'high' ? 'medium' : 'low',
          scope: 'global',
          agentTypes: Array.from(new Set(gotcha.occurrences.map((o) => o.agentType))),
          relatedIssues: gotcha.occurrences.map((o) => o.issueId),
          outcomes: [],
        },
      });

      // Mark gotcha as promoted
      await this.gotchaTracker.markAsPromoted(gotchaId, knowledgeCard.id);

      logger.info(`Promoted gotcha ${gotchaId} to knowledge card ${knowledgeCard.id}`);
      return knowledgeCard;
    } catch (error) {
      logger.error(`Failed to promote gotcha ${gotchaId}:`, error);
      throw new Error(
        `Failed to promote gotcha: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get gotcha statistics
   * @returns Promise resolving to gotcha statistics
   */
  async getGotchaStats(): Promise<{
    total: number;
    promoted: number;
    byCategory: Record<string, number>;
  }> {
    this.ensureInitialized();

    try {
      return await this.gotchaTracker.getStats();
    } catch (error) {
      logger.error('Failed to get gotcha statistics:', error);
      throw new Error(
        `Failed to get gotcha stats: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // ==================== ADR Operations ====================

  /**
   * Create a new Architecture Decision Record
   * @param adr ADR data without system-generated fields
   * @returns Promise resolving to created ADR
   */
  async createADR(
    adr: Omit<ArchitectureDecisionRecord, 'id' | 'date'>,
  ): Promise<ArchitectureDecisionRecord> {
    this.ensureInitialized();

    try {
      return await this.adrManager.createADR(adr);
    } catch (error) {
      logger.error('Failed to create ADR:', error);
      throw new Error(
        `Failed to create ADR: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Update an existing ADR
   * @param id ADR identifier
   * @param updates Partial ADR updates
   * @returns Promise resolving to updated ADR
   */
  async updateADR(
    id: string,
    updates: Partial<ArchitectureDecisionRecord>,
  ): Promise<ArchitectureDecisionRecord> {
    this.ensureInitialized();

    try {
      return await this.adrManager.updateADR(id, updates);
    } catch (error) {
      logger.error(`Failed to update ADR ${id}:`, error);
      throw new Error(
        `Failed to update ADR: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get an ADR by ID
   * @param id ADR identifier
   * @returns Promise resolving to ADR or null if not found
   */
  async getADR(id: string): Promise<ArchitectureDecisionRecord | null> {
    this.ensureInitialized();

    try {
      return await this.adrManager.getADR(id);
    } catch (error) {
      logger.error(`Failed to get ADR ${id}:`, error);
      throw new Error(
        `Failed to get ADR: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * List ADRs with optional filtering
   * @param filters Optional status filters
   * @returns Promise resolving to filtered ADR list
   */
  async listADRs(filters?: {
    status?: ArchitectureDecisionRecord['status'][];
  }): Promise<ArchitectureDecisionRecord[]> {
    this.ensureInitialized();

    try {
      return await this.adrManager.listADRs(filters);
    } catch (error) {
      logger.error('Failed to list ADRs:', error);
      throw new Error(
        `Failed to list ADRs: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // ==================== Statistics ====================

  /**
   * Get comprehensive knowledge system statistics
   * @returns Promise resolving to system statistics
   */
  async getStats(): Promise<KnowledgeStats> {
    this.ensureInitialized();

    try {
      const [cardStats, gotchaStats, adrStats] = await Promise.all([
        this.cardStore.getStats(),
        this.gotchaTracker.getStats(),
        this.adrManager.getStats(),
      ]);

      return {
        totalCards: cardStats.total,
        cardsByType: cardStats.byType,
        cardsByCategory: cardStats.byCategory,
        totalGotchas: gotchaStats.total,
        gotchasByCategory: gotchaStats.byCategory,
        promotedGotchas: gotchaStats.promoted,
        totalADRs: adrStats.total,
        adrsByStatus: adrStats.byStatus,
        averageEffectiveness: cardStats.averageEffectiveness,
        lastUpdated: new Date(),
      };
    } catch (error) {
      logger.error('Failed to get knowledge statistics:', error);
      throw new Error(
        `Failed to get statistics: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // ==================== Maintenance ====================

  /**
   * Cleanup old data and optimize storage
   */
  async cleanup(): Promise<void> {
    this.ensureInitialized();

    try {
      logger.info('Starting knowledge system cleanup');

      await Promise.all([
        this.cardStore.cleanup(),
        this.gotchaTracker.cleanup(),
        this.adrManager.cleanup(),
      ]);

      logger.info('Knowledge system cleanup completed');
    } catch (error) {
      logger.error('Failed to cleanup knowledge system:', error);
      throw new Error(
        `Failed to cleanup: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Export knowledge data to specified path
   * @param path Export destination path
   */
  async export(path: string): Promise<void> {
    this.ensureInitialized();

    try {
      logger.info(`Starting export to ${path}`);

      // Gather all data for export
      const [cards, gotchas, adrs, stats] = await Promise.all([
        this.getAllCards(),
        this.getAllGotchas(),
        this.adrManager.listADRs(),
        this.getStats(),
      ]);

      const exportData = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        config: {
          storageBasePath: this.config.storageBasePath,
          maxCardsPerCategory: this.config.maxCardsPerCategory,
          gotchaPromotionThreshold: this.config.gotchaPromotionThreshold,
          effectivenessDecayRate: this.config.effectivenessDecayRate,
          cleanupIntervalDays: this.config.cleanupIntervalDays,
          autoPromoteGotchas: this.config.autoPromoteGotchas,
        },
        data: {
          knowledgeCards: cards,
          gotchaPatterns: gotchas,
          architectureDecisionRecords: adrs,
        },
        statistics: stats,
      };

      // Write to file with atomic operation
      const tempPath = `${path}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(exportData, null, 2), 'utf8');
      await fs.rename(tempPath, path);

      logger.info(`Successfully exported knowledge data to ${path}`);
    } catch (error) {
      logger.error(`Failed to export knowledge data to ${path}:`, error);
      throw new Error(
        `Failed to export: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Import knowledge data from specified path
   * @param path Import source path
   */
  async import(path: string): Promise<void> {
    this.ensureInitialized();

    try {
      logger.info(`Starting import from ${path}`);

      // Read and parse import data
      const fileContent = await fs.readFile(path, 'utf8');
      const importData = JSON.parse(fileContent);

      // Validate import data structure
      if (!importData.version || !importData.data) {
        throw new Error('Invalid import file format');
      }

      const importStats = {
        cardsImported: 0,
        gotchasImported: 0,
        adrsImported: 0,
        errors: [] as string[],
      };

      // Import knowledge cards
      if (importData.data.knowledgeCards && Array.isArray(importData.data.knowledgeCards)) {
        for (const cardData of importData.data.knowledgeCards) {
          try {
            // Remove system-generated fields and recreate
            const { id, createdAt, updatedAt, lastUsed, usageCount, ...cleanCardData } = cardData;
            await this.createCard(cleanCardData);
            importStats.cardsImported++;
          } catch (error) {
            const errorMsg = `Failed to import card ${cardData.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            importStats.errors.push(errorMsg);
            logger.warn(errorMsg);
          }
        }
      }

      // Import gotcha patterns
      if (importData.data.gotchaPatterns && Array.isArray(importData.data.gotchaPatterns)) {
        for (const gotchaData of importData.data.gotchaPatterns) {
          try {
            // Remove system-generated fields and recreate
            const { id, createdAt, updatedAt, promoted, ...cleanGotchaData } = gotchaData;
            await this.recordGotcha(cleanGotchaData);
            importStats.gotchasImported++;
          } catch (error) {
            const errorMsg = `Failed to import gotcha ${gotchaData.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            importStats.errors.push(errorMsg);
            logger.warn(errorMsg);
          }
        }
      }

      // Import ADRs
      if (
        importData.data.architectureDecisionRecords &&
        Array.isArray(importData.data.architectureDecisionRecords)
      ) {
        for (const adrData of importData.data.architectureDecisionRecords) {
          try {
            // Remove system-generated fields and recreate
            const { id, date, ...cleanAdrData } = adrData;
            await this.createADR(cleanAdrData);
            importStats.adrsImported++;
          } catch (error) {
            const errorMsg = `Failed to import ADR ${adrData.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            importStats.errors.push(errorMsg);
            logger.warn(errorMsg);
          }
        }
      }

      logger.info(
        `Successfully imported knowledge data: ${importStats.cardsImported} cards, ${importStats.gotchasImported} gotchas, ${importStats.adrsImported} ADRs`,
      );

      if (importStats.errors.length > 0) {
        logger.warn(`Import completed with ${importStats.errors.length} errors`);
      }
    } catch (error) {
      logger.error(`Failed to import knowledge data from ${path}:`, error);
      throw new Error(
        `Failed to import: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // ==================== Smart Recommendations ====================

  /**
   * Get intelligent knowledge recommendations for a given context
   * @param context The problem context including issue details and constraints
   * @returns Ranked recommendations with confidence scores
   */
  async getSmartRecommendations(
    context: RecommendationContext,
  ): Promise<KnowledgeRecommendation[]> {
    this.ensureInitialized();

    try {
      return await this.recommendationsEngine.getRecommendations(context);
    } catch (error) {
      logger.error('Failed to get smart recommendations:', error);
      throw new Error(
        `Failed to get smart recommendations: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get preventive recommendations to avoid known gotchas
   * @param context The problem context
   * @returns Preventive knowledge recommendations
   */
  async getPreventiveRecommendations(
    context: RecommendationContext,
  ): Promise<KnowledgeRecommendation[]> {
    this.ensureInitialized();

    try {
      return await this.recommendationsEngine.getPreventiveRecommendations(context);
    } catch (error) {
      logger.error('Failed to get preventive recommendations:', error);
      throw new Error(
        `Failed to get preventive recommendations: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get agent-specific knowledge recommendations
   * @param agentType The type of agent requesting recommendations
   * @param limit Maximum number of recommendations
   * @returns Agent-optimized knowledge cards
   */
  async getAgentRecommendations(agentType: string, limit = 10): Promise<KnowledgeCard[]> {
    this.ensureInitialized();

    try {
      return await this.recommendationsEngine.getAgentSpecificRecommendations(agentType, limit);
    } catch (error) {
      logger.error(`Failed to get recommendations for agent ${agentType}:`, error);
      throw new Error(
        `Failed to get agent recommendations: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Analyze patterns in knowledge usage and provide insights
   * @returns Pattern analysis and insights
   */
  async analyzeKnowledgePatterns() {
    this.ensureInitialized();

    try {
      return await this.recommendationsEngine.analyzePatterns();
    } catch (error) {
      logger.error('Failed to analyze knowledge patterns:', error);
      throw new Error(
        `Failed to analyze patterns: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // ==================== Private Helper Methods ====================

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Knowledge Management System not initialized. Call initialize() first.');
    }
  }

  private async ensureDirectoryStructure(): Promise<void> {
    const dirs = [
      this.config.storageBasePath,
      path.join(this.config.storageBasePath, 'project'),
      path.join(this.config.storageBasePath, 'global'),
      path.join(this.config.storageBasePath, 'gotchas'),
      path.join(this.config.storageBasePath, 'adr'),
    ];

    await Promise.all(dirs.map((dir) => fs.mkdir(dir, { recursive: true })));
  }

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async getAllCards(): Promise<KnowledgeCard[]> {
    const allCards: KnowledgeCard[] = [];
    const searchResults = await this.cardStore.searchCards({ text: '', limit: 1000 });

    for (const result of searchResults) {
      allCards.push(result.card);
    }

    return allCards;
  }

  private async getAllGotchas(): Promise<GotchaPattern[]> {
    return await this.gotchaTracker.getAllGotchas();
  }

  private generateGotchaCardContent(gotcha: GotchaPattern): string {
    return `# ${gotcha.description}

## Problem Pattern
\`\`\`
${gotcha.pattern}
\`\`\`

## Severity: ${gotcha.severity.toUpperCase()}

## Category: ${gotcha.category}

## Solution
${gotcha.solution || 'No solution documented yet.'}

## Prevention Steps
${gotcha.preventionSteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

## Occurrence History
This gotcha has occurred ${gotcha.occurrences.length} time(s) across different issues:
${gotcha.occurrences
  .map(
    (occ) =>
      `- Issue #${occ.issueId} (${occ.agentType}) - ${occ.resolved ? 'Resolved' : 'Unresolved'}`,
  )
  .join('\n')}

## Generated From Gotcha Pattern
Original Pattern ID: ${gotcha.id}
Promotion Date: ${new Date().toISOString()}
`;
  }
}
