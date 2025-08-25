// Integration Service - Connects Index Layer with Knowledge and Memory systems
// Provides automated indexing when content changes occur

import { EventEmitter } from 'events';
import { ForgeFlowIndexManager } from './index-manager.js';
import { ContentExtractor } from './content-extractor.js';
import { 
  IndexEntry, 
  IndexBatch, 
  IndexUpdateOperation, 
  ContentChange,
  IndexContentType 
} from './types.js';

// Import from existing layers
import { KnowledgeManager } from '../knowledge/knowledge-manager.js';
import { MemoryManager } from '../memory/memory-manager.js';
import { ADRManager } from '../knowledge/adr-manager.js';
import { GotchaTracker } from '../knowledge/gotcha-tracker.js';

export class IndexIntegrationService extends EventEmitter {
  private indexManager: ForgeFlowIndexManager;
  private contentExtractor: ContentExtractor;
  private isListening = false;

  // Component references
  private knowledgeManager?: KnowledgeManager;
  private memoryManager?: MemoryManager;
  private adrManager?: ADRManager;
  private gotchaTracker?: GotchaTracker;

  constructor(indexManager: ForgeFlowIndexManager) {
    super();
    this.indexManager = indexManager;
    this.contentExtractor = new ContentExtractor();
  }

  // Initialize integration with Foundation Layer components
  async initialize(components: {
    knowledgeManager?: KnowledgeManager;
    memoryManager?: MemoryManager;
    adrManager?: ADRManager;
    gotchaTracker?: GotchaTracker;
  }): Promise<void> {
    console.log('🔗 Initializing Index Integration Service...');

    // Store component references
    this.knowledgeManager = components.knowledgeManager;
    this.memoryManager = components.memoryManager;
    this.adrManager = components.adrManager;
    this.gotchaTracker = components.gotchaTracker;

    // Set up event listeners
    this.setupKnowledgeIntegration();
    this.setupMemoryIntegration();
    this.setupADRIntegration();
    this.setupGotchaIntegration();

    this.isListening = true;
    this.emit('initialized');

    console.log('✅ Index Integration Service initialized');
  }

  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down Index Integration Service...');

    // Remove all event listeners
    this.removeAllListeners();

    // Remove listeners from external components
    if (this.knowledgeManager) {
      this.knowledgeManager.removeAllListeners();
    }
    
    if (this.memoryManager) {
      this.memoryManager.removeAllListeners();
    }

    if (this.adrManager) {
      this.adrManager.removeAllListeners();
    }

    if (this.gotchaTracker) {
      this.gotchaTracker.removeAllListeners();
    }

    this.isListening = false;
    console.log('✅ Index Integration Service shut down');
  }

  // Perform initial indexing of all existing content
  async performInitialIndexing(): Promise<void> {
    console.log('📚 Starting initial indexing of all content...');
    const startTime = Date.now();

    try {
      const allEntries: IndexEntry[] = [];

      // Index knowledge cards
      if (this.knowledgeManager) {
        console.log('📝 Indexing knowledge cards...');
        const knowledgeEntries = await this.indexAllKnowledgeCards();
        allEntries.push(...knowledgeEntries);
        console.log(`✅ Indexed ${knowledgeEntries.length} knowledge cards`);
      }

      // Index memory entries
      if (this.memoryManager) {
        console.log('🧠 Indexing memory entries...');
        const memoryEntries = await this.indexAllMemoryEntries();
        allEntries.push(...memoryEntries);
        console.log(`✅ Indexed ${memoryEntries.length} memory entries`);
      }

      // Index ADR documents
      if (this.adrManager) {
        console.log('📋 Indexing ADR documents...');
        const adrEntries = await this.indexAllADRs();
        allEntries.push(...adrEntries);
        console.log(`✅ Indexed ${adrEntries.length} ADR documents`);
      }

      // Index gotchas
      if (this.gotchaTracker) {
        console.log('⚠️ Indexing gotchas...');
        const gotchaEntries = await this.indexAllGotchas();
        allEntries.push(...gotchaEntries);
        console.log(`✅ Indexed ${gotchaEntries.length} gotchas`);
      }

      // Perform bulk indexing
      if (allEntries.length > 0) {
        await this.indexManager.indexContent(allEntries);
      }

      const duration = Date.now() - startTime;
      console.log(`✅ Initial indexing completed: ${allEntries.length} total entries in ${duration}ms`);

      this.emit('initial_indexing_completed', {
        totalEntries: allEntries.length,
        duration,
        breakdown: {
          knowledge: allEntries.filter(e => e.type === 'knowledge').length,
          memory: allEntries.filter(e => e.type === 'memory').length,
          adr: allEntries.filter(e => e.type === 'adr').length,
          gotcha: allEntries.filter(e => e.type === 'gotcha').length
        }
      });
    } catch (error) {
      console.error('❌ Initial indexing failed:', error);
      this.emit('initial_indexing_error', error);
      throw error;
    }
  }

  // Knowledge Manager Integration
  private setupKnowledgeIntegration(): void {
    if (!this.knowledgeManager) return;

    // Listen for knowledge card events
    this.knowledgeManager.on('card_created', async (event) => {
      try {
        const entry = await this.contentExtractor.extractFromKnowledgeCard(event.card);
        const operation: IndexUpdateOperation = {
          type: 'insert',
          entry
        };
        await this.indexManager.updateIndex(operation);
        this.emit('knowledge_indexed', { cardId: event.card.frontmatter.id, operation: 'insert' });
      } catch (error) {
        console.error('Failed to index new knowledge card:', error);
        this.emit('indexing_error', { source: 'knowledge', operation: 'insert', error });
      }
    });

    this.knowledgeManager.on('card_updated', async (event) => {
      try {
        const entry = await this.contentExtractor.extractFromKnowledgeCard(event.card);
        const operation: IndexUpdateOperation = {
          type: 'update',
          entry,
          previousVersion: event.previousCard ? await this.contentExtractor.extractFromKnowledgeCard(event.previousCard) : undefined
        };
        await this.indexManager.updateIndex(operation);
        this.emit('knowledge_indexed', { cardId: event.card.frontmatter.id, operation: 'update' });
      } catch (error) {
        console.error('Failed to update indexed knowledge card:', error);
        this.emit('indexing_error', { source: 'knowledge', operation: 'update', error });
      }
    });

    this.knowledgeManager.on('card_deleted', async (event) => {
      try {
        await this.indexManager.removeFromIndex([event.cardId]);
        this.emit('knowledge_indexed', { cardId: event.cardId, operation: 'delete' });
      } catch (error) {
        console.error('Failed to remove deleted knowledge card from index:', error);
        this.emit('indexing_error', { source: 'knowledge', operation: 'delete', error });
      }
    });
  }

  // Memory Manager Integration
  private setupMemoryIntegration(): void {
    if (!this.memoryManager) return;

    // Listen for memory events
    this.memoryManager.on('job_created', async (event) => {
      try {
        const entry = await this.contentExtractor.extractFromMemoryEntry(event.jobMemory);
        const operation: IndexUpdateOperation = {
          type: 'insert',
          entry
        };
        await this.indexManager.updateIndex(operation);
        this.emit('memory_indexed', { jobId: event.jobMemory.jobId, operation: 'insert' });
      } catch (error) {
        console.error('Failed to index new job memory:', error);
        this.emit('indexing_error', { source: 'memory', operation: 'insert', error });
      }
    });

    this.memoryManager.on('job_updated', async (event) => {
      try {
        const entry = await this.contentExtractor.extractFromMemoryEntry(event.jobMemory);
        const operation: IndexUpdateOperation = {
          type: 'update',
          entry
        };
        await this.indexManager.updateIndex(operation);
        this.emit('memory_indexed', { jobId: event.jobMemory.jobId, operation: 'update' });
      } catch (error) {
        console.error('Failed to update indexed job memory:', error);
        this.emit('indexing_error', { source: 'memory', operation: 'update', error });
      }
    });

    this.memoryManager.on('job_completed', async (event) => {
      // Re-index completed job with final state
      try {
        const entry = await this.contentExtractor.extractFromMemoryEntry(event.jobMemory);
        const operation: IndexUpdateOperation = {
          type: 'update',
          entry
        };
        await this.indexManager.updateIndex(operation);
        this.emit('memory_indexed', { jobId: event.jobMemory.jobId, operation: 'complete' });
      } catch (error) {
        console.error('Failed to update completed job memory in index:', error);
        this.emit('indexing_error', { source: 'memory', operation: 'complete', error });
      }
    });
  }

  // ADR Manager Integration
  private setupADRIntegration(): void {
    if (!this.adrManager) return;

    this.adrManager.on('adr_created', async (event) => {
      try {
        const entry = await this.contentExtractor.extractFromADR(event.adr);
        const operation: IndexUpdateOperation = {
          type: 'insert',
          entry
        };
        await this.indexManager.updateIndex(operation);
        this.emit('adr_indexed', { adrId: event.adr.frontmatter.id, operation: 'insert' });
      } catch (error) {
        console.error('Failed to index new ADR:', error);
        this.emit('indexing_error', { source: 'adr', operation: 'insert', error });
      }
    });

    this.adrManager.on('adr_updated', async (event) => {
      try {
        const entry = await this.contentExtractor.extractFromADR(event.adr);
        const operation: IndexUpdateOperation = {
          type: 'update',
          entry
        };
        await this.indexManager.updateIndex(operation);
        this.emit('adr_indexed', { adrId: event.adr.frontmatter.id, operation: 'update' });
      } catch (error) {
        console.error('Failed to update indexed ADR:', error);
        this.emit('indexing_error', { source: 'adr', operation: 'update', error });
      }
    });
  }

  // Gotcha Tracker Integration
  private setupGotchaIntegration(): void {
    if (!this.gotchaTracker) return;

    this.gotchaTracker.on('gotcha_created', async (event) => {
      try {
        const entry = await this.contentExtractor.extractFromGotcha(event.gotcha);
        const operation: IndexUpdateOperation = {
          type: 'insert',
          entry
        };
        await this.indexManager.updateIndex(operation);
        this.emit('gotcha_indexed', { gotchaId: event.gotcha.frontmatter.id, operation: 'insert' });
      } catch (error) {
        console.error('Failed to index new gotcha:', error);
        this.emit('indexing_error', { source: 'gotcha', operation: 'insert', error });
      }
    });

    this.gotchaTracker.on('gotcha_updated', async (event) => {
      try {
        const entry = await this.contentExtractor.extractFromGotcha(event.gotcha);
        const operation: IndexUpdateOperation = {
          type: 'update',
          entry
        };
        await this.indexManager.updateIndex(operation);
        this.emit('gotcha_indexed', { gotchaId: event.gotcha.frontmatter.id, operation: 'update' });
      } catch (error) {
        console.error('Failed to update indexed gotcha:', error);
        this.emit('indexing_error', { source: 'gotcha', operation: 'update', error });
      }
    });

    this.gotchaTracker.on('gotcha_promoted', async (event) => {
      // Re-index promoted gotcha with updated metadata
      try {
        const entry = await this.contentExtractor.extractFromGotcha(event.gotcha);
        const operation: IndexUpdateOperation = {
          type: 'update',
          entry
        };
        await this.indexManager.updateIndex(operation);
        this.emit('gotcha_indexed', { gotchaId: event.gotcha.frontmatter.id, operation: 'promote' });
      } catch (error) {
        console.error('Failed to update promoted gotcha in index:', error);
        this.emit('indexing_error', { source: 'gotcha', operation: 'promote', error });
      }
    });
  }

  // Bulk indexing methods
  private async indexAllKnowledgeCards(): Promise<IndexEntry[]> {
    if (!this.knowledgeManager) return [];

    try {
      // This would need to be implemented in the KnowledgeManager
      // For now, return empty array
      const cards: any[] = []; // await this.knowledgeManager.getAllCards();
      const entries: IndexEntry[] = [];

      for (const card of cards) {
        try {
          const entry = await this.contentExtractor.extractFromKnowledgeCard(card);
          entries.push(entry);
        } catch (error) {
          console.warn(`Failed to extract knowledge card ${card.frontmatter?.id}:`, error);
        }
      }

      return entries;
    } catch (error) {
      console.error('Failed to index all knowledge cards:', error);
      return [];
    }
  }

  private async indexAllMemoryEntries(): Promise<IndexEntry[]> {
    if (!this.memoryManager) return [];

    try {
      // This would need to be implemented in the MemoryManager
      // For now, return empty array
      const memories: any[] = []; // await this.memoryManager.getAllJobMemories();
      const entries: IndexEntry[] = [];

      for (const memory of memories) {
        try {
          const entry = await this.contentExtractor.extractFromMemoryEntry(memory);
          entries.push(entry);
        } catch (error) {
          console.warn(`Failed to extract memory entry ${memory.jobId}:`, error);
        }
      }

      return entries;
    } catch (error) {
      console.error('Failed to index all memory entries:', error);
      return [];
    }
  }

  private async indexAllADRs(): Promise<IndexEntry[]> {
    if (!this.adrManager) return [];

    try {
      // This would need to be implemented in the ADRManager
      // For now, return empty array
      const adrs: any[] = []; // await this.adrManager.getAllADRs();
      const entries: IndexEntry[] = [];

      for (const adr of adrs) {
        try {
          const entry = await this.contentExtractor.extractFromADR(adr);
          entries.push(entry);
        } catch (error) {
          console.warn(`Failed to extract ADR ${adr.frontmatter?.id}:`, error);
        }
      }

      return entries;
    } catch (error) {
      console.error('Failed to index all ADRs:', error);
      return [];
    }
  }

  private async indexAllGotchas(): Promise<IndexEntry[]> {
    if (!this.gotchaTracker) return [];

    try {
      // This would need to be implemented in the GotchaTracker
      // For now, return empty array
      const gotchas: any[] = []; // await this.gotchaTracker.getAllGotchas();
      const entries: IndexEntry[] = [];

      for (const gotcha of gotchas) {
        try {
          const entry = await this.contentExtractor.extractFromGotcha(gotcha);
          entries.push(entry);
        } catch (error) {
          console.warn(`Failed to extract gotcha ${gotcha.frontmatter?.id}:`, error);
        }
      }

      return entries;
    } catch (error) {
      console.error('Failed to index all gotchas:', error);
      return [];
    }
  }

  // Batch processing for efficient updates
  async processBatchUpdates(changes: ContentChange[]): Promise<void> {
    if (changes.length === 0) return;

    console.log(`🔄 Processing batch of ${changes.length} content changes...`);
    const startTime = Date.now();

    try {
      const operations: IndexUpdateOperation[] = [];

      for (const change of changes) {
        try {
          let entry: IndexEntry | null = null;

          switch (change.type) {
            case 'created':
            case 'modified':
              entry = await this.contentExtractor.extractFromPath(change.path, change.contentType);
              if (entry) {
                operations.push({
                  type: change.type === 'created' ? 'insert' : 'update',
                  entry
                });
              }
              break;

            case 'deleted':
              const entryId = this.generateEntryIdFromPath(change.path);
              operations.push({
                type: 'delete',
                entry: { id: entryId } as IndexEntry // Minimal entry for deletion
              });
              break;
          }
        } catch (error) {
          console.warn(`Failed to process change for ${change.path}:`, error);
        }
      }

      if (operations.length > 0) {
        const batch: IndexBatch = {
          operations,
          timestamp: new Date(),
          source: 'batch_update'
        };

        await this.indexManager.indexBatch(batch);
      }

      const duration = Date.now() - startTime;
      console.log(`✅ Batch processing completed: ${operations.length} operations in ${duration}ms`);

      this.emit('batch_processed', {
        changesCount: changes.length,
        operationsCount: operations.length,
        duration
      });
    } catch (error) {
      console.error('❌ Batch processing failed:', error);
      this.emit('batch_error', { changes, error });
      throw error;
    }
  }

  private generateEntryIdFromPath(path: string): string {
    return Buffer.from(path).toString('base64').replace(/[/+=]/g, '');
  }

  // Health check and status methods
  getStatus(): {
    isListening: boolean;
    connectedComponents: string[];
    lastError?: Error;
  } {
    const connectedComponents: string[] = [];
    
    if (this.knowledgeManager) connectedComponents.push('knowledge');
    if (this.memoryManager) connectedComponents.push('memory');
    if (this.adrManager) connectedComponents.push('adr');
    if (this.gotchaTracker) connectedComponents.push('gotcha');

    return {
      isListening: this.isListening,
      connectedComponents
    };
  }
}