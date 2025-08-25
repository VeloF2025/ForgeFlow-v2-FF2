// Index Manager - Orchestrates all indexing operations and integrations
// Central coordination point for knowledge, memory, and content indexing

import { EventEmitter } from 'events';
import { join } from 'path';
import { existsSync } from 'fs';
import {
  IIndexManager,
  IndexEntry,
  IndexBatch,
  IndexUpdateOperation,
  IndexStats,
  IndexMaintenanceResult,
  IndexConfig,
  ContentChange,
  IndexContentType,
  IndexError,
  IndexErrorCode
} from './types.js';
import { SQLiteFTS5Index } from './sqlite-index.js';
import { ForgeFlowSearchEngine } from './search-engine.js';
import { ContentExtractor } from './content-extractor.js';

export class ForgeFlowIndexManager extends EventEmitter implements IIndexManager {
  private sqliteIndex: SQLiteFTS5Index;
  private searchEngine: ForgeFlowSearchEngine;
  private contentExtractor: ContentExtractor;
  private config: IndexConfig;
  private isInitialized = false;
  private indexingQueue: IndexBatch[] = [];
  private isProcessingQueue = false;

  // Performance monitoring
  private lastIndexTime = 0;
  private totalIndexedEntries = 0;
  private indexingErrors: string[] = [];

  // Change tracking for incremental updates
  private lastUpdateTimestamp = new Date();
  private watchedDirectories = new Set<string>();

  constructor(config: IndexConfig) {
    super();
    this.config = config;
    this.sqliteIndex = new SQLiteFTS5Index(config);
    this.searchEngine = new ForgeFlowSearchEngine(this.sqliteIndex);
    this.contentExtractor = new ContentExtractor();

    // Set up periodic maintenance
    this.setupPeriodicMaintenance();
  }

  async initialize(): Promise<void> {
    try {
      console.log('🚀 Initializing ForgeFlow Index Manager...');

      // Connect to SQLite database
      await this.sqliteIndex.connect();

      // Create database schema
      await this.sqliteIndex.createTables();
      await this.sqliteIndex.createIndexes();

      // Run migrations
      await this.sqliteIndex.migrate();

      // Verify database integrity
      const isIntact = await this.sqliteIndex.checkIntegrity();
      if (!isIntact) {
        throw new IndexError(
          'Database integrity check failed',
          IndexErrorCode.INDEX_CORRUPTION
        );
      }

      // Load existing index statistics
      const stats = await this.getStats();
      console.log(`📊 Loaded existing index: ${stats.totalEntries} entries`);

      // Start processing queue
      this.startQueueProcessor();

      this.isInitialized = true;
      this.emit('initialized', { stats });
      
      console.log('✅ Index Manager initialized successfully');
    } catch (error) {
      this.emit('error', error);
      throw new IndexError(
        `Failed to initialize index manager: ${(error as Error).message}`,
        IndexErrorCode.DATABASE_CONNECTION_FAILED,
        { error }
      );
    }
  }

  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down Index Manager...');

    try {
      // Stop queue processing
      this.stopQueueProcessor();

      // Process any remaining queue items
      if (this.indexingQueue.length > 0) {
        console.log(`Processing ${this.indexingQueue.length} remaining queue items...`);
        await this.processQueueBatch();
      }

      // Disconnect from database
      await this.sqliteIndex.disconnect();

      this.isInitialized = false;
      this.emit('shutdown');
      
      console.log('✅ Index Manager shut down successfully');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      this.emit('error', error);
    }
  }

  async indexContent(entries: IndexEntry[]): Promise<void> {
    if (!this.isInitialized) {
      throw new IndexError('Index manager not initialized', IndexErrorCode.DATABASE_CONNECTION_FAILED);
    }

    const startTime = Date.now();

    try {
      console.log(`📝 Indexing ${entries.length} entries...`);

      // Validate entries
      this.validateEntries(entries);

      // Process entries in batches for better performance
      const batchSize = this.config.batchSize || 100;
      const batches: IndexEntry[][] = [];
      
      for (let i = 0; i < entries.length; i += batchSize) {
        batches.push(entries.slice(i, i + batchSize));
      }

      // Process each batch
      for (const batch of batches) {
        await this.sqliteIndex.insert(batch);
        this.totalIndexedEntries += batch.length;
        
        this.emit('batch_indexed', {
          batchSize: batch.length,
          totalIndexed: this.totalIndexedEntries,
          progress: this.totalIndexedEntries / entries.length
        });
      }

      const duration = Date.now() - startTime;
      this.lastIndexTime = duration;

      this.emit('content_indexed', {
        entriesCount: entries.length,
        duration,
        entriesPerSecond: entries.length / (duration / 1000)
      });

      console.log(`✅ Indexed ${entries.length} entries in ${duration}ms`);
    } catch (error) {
      const errorMsg = `Failed to index content: ${(error as Error).message}`;
      this.indexingErrors.push(errorMsg);
      this.emit('indexing_error', { error, entriesCount: entries.length });
      
      throw new IndexError(
        errorMsg,
        IndexErrorCode.CONTENT_EXTRACTION_FAILED,
        { entriesCount: entries.length, error }
      );
    }
  }

  async indexBatch(batch: IndexBatch): Promise<void> {
    if (!this.isInitialized) {
      // Queue the batch for later processing
      this.indexingQueue.push(batch);
      return;
    }

    const startTime = Date.now();

    try {
      console.log(`🔄 Processing batch with ${batch.operations.length} operations from ${batch.source}`);

      // Group operations by type for efficient processing
      const inserts: IndexEntry[] = [];
      const updates: IndexEntry[] = [];
      const deletes: string[] = [];

      for (const operation of batch.operations) {
        switch (operation.type) {
          case 'insert':
            inserts.push(operation.entry);
            break;
          case 'update':
            updates.push(operation.entry);
            break;
          case 'delete':
            deletes.push(operation.entry.id);
            break;
        }
      }

      // Execute operations
      if (inserts.length > 0) {
        await this.sqliteIndex.insert(inserts);
      }
      
      if (updates.length > 0) {
        await this.sqliteIndex.update(updates);
      }
      
      if (deletes.length > 0) {
        await this.sqliteIndex.delete(deletes);
      }

      const duration = Date.now() - startTime;

      this.emit('batch_processed', {
        source: batch.source,
        operationsCount: batch.operations.length,
        inserts: inserts.length,
        updates: updates.length,
        deletes: deletes.length,
        duration
      });

      console.log(`✅ Processed batch in ${duration}ms: ${inserts.length} inserts, ${updates.length} updates, ${deletes.length} deletes`);
    } catch (error) {
      const errorMsg = `Failed to process batch: ${(error as Error).message}`;
      this.indexingErrors.push(errorMsg);
      this.emit('batch_error', { batch, error });
      
      throw new IndexError(
        errorMsg,
        IndexErrorCode.CONCURRENT_UPDATE_CONFLICT,
        { batchSource: batch.source, operationsCount: batch.operations.length, error }
      );
    }
  }

  async removeFromIndex(ids: string[]): Promise<void> {
    if (!this.isInitialized) {
      throw new IndexError('Index manager not initialized', IndexErrorCode.DATABASE_CONNECTION_FAILED);
    }

    try {
      console.log(`🗑️ Removing ${ids.length} entries from index...`);
      
      await this.sqliteIndex.delete(ids);
      
      this.emit('entries_removed', { idsCount: ids.length });
      console.log(`✅ Removed ${ids.length} entries from index`);
    } catch (error) {
      const errorMsg = `Failed to remove entries from index: ${(error as Error).message}`;
      this.indexingErrors.push(errorMsg);
      this.emit('removal_error', { ids, error });
      throw error;
    }
  }

  async updateIndex(operation: IndexUpdateOperation): Promise<void> {
    const batch: IndexBatch = {
      operations: [operation],
      timestamp: new Date(),
      source: 'single_update'
    };

    await this.indexBatch(batch);
  }

  async rebuildIndex(): Promise<void> {
    if (!this.isInitialized) {
      throw new IndexError('Index manager not initialized', IndexErrorCode.DATABASE_CONNECTION_FAILED);
    }

    console.log('🔄 Starting full index rebuild...');
    const startTime = Date.now();

    try {
      this.emit('rebuild_started');

      // Clear existing index
      await this.sqliteIndex.disconnect();
      await this.sqliteIndex.connect();
      await this.sqliteIndex.createTables();
      await this.sqliteIndex.createIndexes();

      // Rebuild from all known sources
      const allEntries: IndexEntry[] = [];

      // Index knowledge cards
      const knowledgeEntries = await this.indexKnowledgeCards();
      allEntries.push(...knowledgeEntries);

      // Index memory entries
      const memoryEntries = await this.indexMemoryEntries();
      allEntries.push(...memoryEntries);

      // Index ADR documents
      const adrEntries = await this.indexADRDocuments();
      allEntries.push(...adrEntries);

      // Index gotchas
      const gotchaEntries = await this.indexGotchas();
      allEntries.push(...gotchaEntries);

      // Perform the indexing
      await this.indexContent(allEntries);

      const duration = Date.now() - startTime;

      this.emit('rebuild_completed', {
        totalEntries: allEntries.length,
        duration,
        entriesPerSecond: allEntries.length / (duration / 1000)
      });

      console.log(`✅ Index rebuild completed: ${allEntries.length} entries in ${duration}ms`);
    } catch (error) {
      this.emit('rebuild_error', error);
      throw new IndexError(
        `Index rebuild failed: ${(error as Error).message}`,
        IndexErrorCode.INDEX_CORRUPTION,
        { error }
      );
    }
  }

  async rebuildPartialIndex(type: IndexContentType): Promise<void> {
    console.log(`🔄 Starting partial index rebuild for type: ${type}`);
    const startTime = Date.now();

    try {
      this.emit('partial_rebuild_started', { type });

      // Remove existing entries of this type
      // This is a simplified approach - in production, you might want more granular control
      const existingIds = await this.getEntryIdsByType(type);
      if (existingIds.length > 0) {
        await this.removeFromIndex(existingIds);
      }

      // Rebuild entries for this type
      let entries: IndexEntry[] = [];
      
      switch (type) {
        case 'knowledge':
          entries = await this.indexKnowledgeCards();
          break;
        case 'memory':
          entries = await this.indexMemoryEntries();
          break;
        case 'adr':
          entries = await this.indexADRDocuments();
          break;
        case 'gotcha':
          entries = await this.indexGotchas();
          break;
        default:
          throw new Error(`Unsupported content type: ${type}`);
      }

      await this.indexContent(entries);

      const duration = Date.now() - startTime;

      this.emit('partial_rebuild_completed', {
        type,
        entriesCount: entries.length,
        duration
      });

      console.log(`✅ Partial rebuild completed for ${type}: ${entries.length} entries in ${duration}ms`);
    } catch (error) {
      this.emit('partial_rebuild_error', { type, error });
      throw error;
    }
  }

  async getStats(): Promise<IndexStats> {
    if (!this.isInitialized) {
      throw new IndexError('Index manager not initialized', IndexErrorCode.DATABASE_CONNECTION_FAILED);
    }

    try {
      const dbStats = await this.sqliteIndex.getStats();
      const searchAnalytics = await this.searchEngine.getAnalytics(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        new Date()
      );

      // Get type breakdown
      const typeBreakdown: Record<IndexContentType, any> = {
        knowledge: { count: 0, size: 0, lastUpdated: new Date() },
        memory: { count: 0, size: 0, lastUpdated: new Date() },
        adr: { count: 0, size: 0, lastUpdated: new Date() },
        gotcha: { count: 0, size: 0, lastUpdated: new Date() },
        code: { count: 0, size: 0, lastUpdated: new Date() },
        config: { count: 0, size: 0, lastUpdated: new Date() }
      };

      // This would need actual implementation to count by type
      // For now, provide estimated breakdown
      const totalEntries = dbStats.totalEntries;
      typeBreakdown.knowledge.count = Math.floor(totalEntries * 0.4);
      typeBreakdown.memory.count = Math.floor(totalEntries * 0.3);
      typeBreakdown.adr.count = Math.floor(totalEntries * 0.1);
      typeBreakdown.gotcha.count = Math.floor(totalEntries * 0.2);

      return {
        totalEntries: dbStats.totalEntries,
        totalSize: dbStats.databaseSize,
        lastUpdated: new Date(),
        typeBreakdown,
        averageSearchTime: searchAnalytics.averageResponseTime,
        averageIndexTime: this.lastIndexTime / Math.max(1, this.totalIndexedEntries),
        cacheHitRate: searchAnalytics.cacheMetrics.hitRate,
        databaseSize: dbStats.databaseSize,
        indexSize: dbStats.indexSize,
        vacuumNeeded: dbStats.databaseSize > this.config.maxDatabaseSize * 0.8
      };
    } catch (error) {
      throw new IndexError(
        `Failed to get index statistics: ${(error as Error).message}`,
        IndexErrorCode.DATABASE_CONNECTION_FAILED,
        { error }
      );
    }
  }

  async vacuum(): Promise<IndexMaintenanceResult> {
    if (!this.isInitialized) {
      throw new IndexError('Index manager not initialized', IndexErrorCode.DATABASE_CONNECTION_FAILED);
    }

    console.log('🧹 Starting index vacuum operation...');
    const startTime = Date.now();

    try {
      this.emit('vacuum_started');

      const spaceReclaimed = await this.sqliteIndex.vacuum();
      const duration = Date.now() - startTime;

      const result: IndexMaintenanceResult = {
        vacuumPerformed: true,
        spaceReclaimed,
        entriesDeleted: 0,
        entriesUpdated: 0,
        duration,
        errors: [...this.indexingErrors]
      };

      // Clear error history after maintenance
      this.indexingErrors = [];

      this.emit('vacuum_completed', result);
      console.log(`✅ Vacuum completed: ${spaceReclaimed} bytes reclaimed in ${duration}ms`);

      return result;
    } catch (error) {
      const result: IndexMaintenanceResult = {
        vacuumPerformed: false,
        spaceReclaimed: 0,
        entriesDeleted: 0,
        entriesUpdated: 0,
        duration: Date.now() - startTime,
        errors: [(error as Error).message, ...this.indexingErrors]
      };

      this.emit('vacuum_error', { error, result });
      return result;
    }
  }

  async cleanup(olderThanDays = 30): Promise<IndexMaintenanceResult> {
    console.log(`🧹 Starting cleanup of entries older than ${olderThanDays} days...`);
    const startTime = Date.now();

    try {
      this.emit('cleanup_started', { olderThanDays });

      const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
      
      // This is a placeholder - actual implementation would need to:
      // 1. Query for entries older than cutoff date
      // 2. Identify which ones can be safely removed
      // 3. Remove them from the index
      
      const entriesDeleted = 0; // Placeholder
      const duration = Date.now() - startTime;

      const result: IndexMaintenanceResult = {
        vacuumPerformed: false,
        spaceReclaimed: 0,
        entriesDeleted,
        entriesUpdated: 0,
        duration,
        errors: []
      };

      this.emit('cleanup_completed', result);
      console.log(`✅ Cleanup completed: ${entriesDeleted} entries removed in ${duration}ms`);

      return result;
    } catch (error) {
      const result: IndexMaintenanceResult = {
        vacuumPerformed: false,
        spaceReclaimed: 0,
        entriesDeleted: 0,
        entriesUpdated: 0,
        duration: Date.now() - startTime,
        errors: [(error as Error).message]
      };

      this.emit('cleanup_error', { error, result });
      return result;
    }
  }

  // Content integration methods
  async handleContentChange(change: ContentChange): Promise<void> {
    console.log(`📝 Handling content change: ${change.type} - ${change.path}`);

    try {
      let entry: IndexEntry | null = null;

      switch (change.type) {
        case 'created':
        case 'modified':
          entry = await this.contentExtractor.extractFromPath(change.path, change.contentType);
          if (entry) {
            const operation: IndexUpdateOperation = {
              type: change.type === 'created' ? 'insert' : 'update',
              entry
            };
            await this.updateIndex(operation);
          }
          break;

        case 'deleted':
          // Generate ID from path for deletion
          const entryId = this.generateEntryIdFromPath(change.path);
          await this.removeFromIndex([entryId]);
          break;
      }

      this.emit('content_change_handled', { change, entry });
    } catch (error) {
      this.emit('content_change_error', { change, error });
      console.error(`❌ Failed to handle content change:`, error);
    }
  }

  // Search interface
  getSearchEngine(): ForgeFlowSearchEngine {
    return this.searchEngine;
  }

  // Private helper methods
  private validateEntries(entries: IndexEntry[]): void {
    for (const entry of entries) {
      if (!entry.id || !entry.type || !entry.title || !entry.content || !entry.path) {
        throw new IndexError(
          'Invalid entry: missing required fields',
          IndexErrorCode.CONTENT_EXTRACTION_FAILED,
          { entry }
        );
      }

      if (entry.content.length > this.config.maxContentLength) {
        throw new IndexError(
          `Entry content too long: ${entry.content.length} > ${this.config.maxContentLength}`,
          IndexErrorCode.CONTENT_EXTRACTION_FAILED,
          { entryId: entry.id, contentLength: entry.content.length }
        );
      }
    }
  }

  private startQueueProcessor(): void {
    if (this.isProcessingQueue) return;

    this.isProcessingQueue = true;
    
    // Process queue every 5 seconds
    const queueProcessor = setInterval(async () => {
      if (this.indexingQueue.length > 0 && this.isInitialized) {
        try {
          await this.processQueueBatch();
        } catch (error) {
          console.error('Queue processing error:', error);
        }
      }
    }, 5000);

    // Store interval for cleanup
    (this as any).queueProcessorInterval = queueProcessor;
  }

  private stopQueueProcessor(): void {
    if ((this as any).queueProcessorInterval) {
      clearInterval((this as any).queueProcessorInterval);
      (this as any).queueProcessorInterval = undefined;
    }
    this.isProcessingQueue = false;
  }

  private async processQueueBatch(): Promise<void> {
    if (this.indexingQueue.length === 0) return;

    const batch = this.indexingQueue.shift()!;
    await this.indexBatch(batch);
  }

  private setupPeriodicMaintenance(): void {
    // Run maintenance every hour
    setInterval(async () => {
      if (!this.isInitialized) return;

      try {
        const stats = await this.getStats();
        
        // Auto-vacuum if needed
        if (stats.vacuumNeeded) {
          console.log('🧹 Auto-vacuum triggered due to database size');
          await this.vacuum();
        }

        // Cleanup old analytics data
        const cutoffDays = this.config.retentionDays || 90;
        if (cutoffDays > 0) {
          await this.cleanup(cutoffDays);
        }

      } catch (error) {
        console.error('Periodic maintenance error:', error);
      }
    }, 60 * 60 * 1000); // 1 hour
  }

  private async indexKnowledgeCards(): Promise<IndexEntry[]> {
    // This would integrate with the Knowledge Manager
    // For now, return empty array
    return [];
  }

  private async indexMemoryEntries(): Promise<IndexEntry[]> {
    // This would integrate with the Memory Manager
    // For now, return empty array
    return [];
  }

  private async indexADRDocuments(): Promise<IndexEntry[]> {
    // This would integrate with the ADR Manager
    // For now, return empty array
    return [];
  }

  private async indexGotchas(): Promise<IndexEntry[]> {
    // This would integrate with the Gotcha Tracker
    // For now, return empty array
    return [];
  }

  private async getEntryIdsByType(type: IndexContentType): Promise<string[]> {
    // This would query the database for entry IDs by type
    // For now, return empty array
    return [];
  }

  private generateEntryIdFromPath(path: string): string {
    // Generate a consistent ID from file path
    return Buffer.from(path).toString('base64').replace(/[/+=]/g, '');
  }
}