// Index Manager Tests - Integration and performance testing
// Tests the orchestration layer and batch processing functionality

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync, existsSync } from 'fs';
import { ForgeFlowIndexManager } from '../index-manager.js';
import { IndexConfig, IndexEntry, IndexBatch, IndexUpdateOperation } from '../types.js';

describe('ForgeFlowIndexManager', () => {
  let indexManager: ForgeFlowIndexManager;
  let config: IndexConfig;
  let testDbPath: string;

  beforeAll(async () => {
    testDbPath = join(tmpdir(), 'ff2-index-manager-test.db');
    if (existsSync(testDbPath)) {
      rmSync(testDbPath);
    }

    config = {
      databasePath: testDbPath,
      maxDatabaseSize: 100 * 1024 * 1024,
      tokenizer: 'porter',
      removeAccents: true,
      caseSensitive: false,
      cacheSize: 1000,
      synchronous: 'normal',
      journalMode: 'wal',
      batchSize: 50,
      maxContentLength: 10000,
      enableVectorIndex: false,
      autoVacuum: true,
      vacuumThreshold: 20,
      retentionDays: 30,
      defaultLimit: 20,
      maxLimit: 1000,
      snippetLength: 150,
      maxSnippets: 5
    };

    indexManager = new ForgeFlowIndexManager(config);
    await indexManager.initialize();
  });

  afterAll(async () => {
    await indexManager.shutdown();
    if (existsSync(testDbPath)) {
      rmSync(testDbPath);
    }
  });

  beforeEach(async () => {
    // Reset index between tests
    try {
      await indexManager.cleanup(0); // Remove all entries
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Initialization and Lifecycle', () => {
    it('should initialize successfully', async () => {
      const stats = await indexManager.getStats();
      expect(stats).toBeDefined();
      expect(stats.totalEntries).toBeGreaterThanOrEqual(0);
      expect(stats.databaseSize).toBeGreaterThan(0);
    });

    it('should emit initialization event', (done) => {
      const tempManager = new ForgeFlowIndexManager(config);
      
      tempManager.on('initialized', (event) => {
        expect(event.stats).toBeDefined();
        tempManager.shutdown().then(() => done());
      });

      tempManager.initialize();
    });
  });

  describe('Content Indexing', () => {
    it('should index content successfully', async () => {
      const entries = createTestEntries(10);
      
      await indexManager.indexContent(entries);
      
      const stats = await indexManager.getStats();
      expect(stats.totalEntries).toBe(10);
    });

    it('should handle large batch indexing', async () => {
      const entries = createTestEntries(500);
      
      const startTime = Date.now();
      await indexManager.indexContent(entries);
      const endTime = Date.now();

      const indexTime = endTime - startTime;
      console.log(`Indexed 500 entries in ${indexTime}ms`);

      // Should complete within reasonable time (< 5 seconds for 500 entries)
      expect(indexTime).toBeLessThan(5000);

      const stats = await indexManager.getStats();
      expect(stats.totalEntries).toBe(500);
    });

    it('should emit batch indexing events', (done) => {
      const entries = createTestEntries(10);
      let batchCount = 0;

      indexManager.on('batch_indexed', (event) => {
        batchCount++;
        expect(event.batchSize).toBeGreaterThan(0);
        expect(event.totalIndexed).toBeGreaterThan(0);
      });

      indexManager.on('content_indexed', (event) => {
        expect(event.entriesCount).toBe(10);
        expect(event.duration).toBeGreaterThan(0);
        expect(batchCount).toBeGreaterThan(0);
        done();
      });

      indexManager.indexContent(entries);
    });

    it('should validate entries before indexing', async () => {
      const invalidEntries = [
        {
          id: '',
          type: 'knowledge',
          title: 'Invalid Entry',
          content: 'Missing ID',
          path: 'test/invalid',
          metadata: {
            tags: [],
            agentTypes: [],
            scope: 'project',
            usageCount: 0,
            lastUsed: new Date(),
            fileSize: 0,
            relatedIds: [],
            parentId: undefined,
            childIds: []
          },
          lastModified: new Date()
        }
      ] as IndexEntry[];

      await expect(indexManager.indexContent(invalidEntries))
        .rejects.toThrow('Invalid entry: missing required fields');
    });

    it('should reject overly large content', async () => {
      const largeContent = 'a'.repeat(config.maxContentLength + 1);
      const entries = [createTestEntry('large-1', 'Large Entry', largeContent)];

      await expect(indexManager.indexContent(entries))
        .rejects.toThrow('Entry content too long');
    });
  });

  describe('Batch Operations', () => {
    it('should process batch operations', async () => {
      const entries = createTestEntries(5);
      
      const operations: IndexUpdateOperation[] = entries.map(entry => ({
        type: 'insert',
        entry
      }));

      const batch: IndexBatch = {
        operations,
        timestamp: new Date(),
        source: 'test-batch'
      };

      await indexManager.indexBatch(batch);

      const stats = await indexManager.getStats();
      expect(stats.totalEntries).toBe(5);
    });

    it('should handle mixed batch operations', async () => {
      // First, insert some entries
      const initialEntries = createTestEntries(3);
      await indexManager.indexContent(initialEntries);

      // Create mixed operations batch
      const newEntry = createTestEntry('new-entry', 'New Entry', 'New content');
      const updatedEntry = { ...initialEntries[0] };
      updatedEntry.title = 'Updated Title';
      updatedEntry.content = 'Updated content';

      const operations: IndexUpdateOperation[] = [
        { type: 'insert', entry: newEntry },
        { type: 'update', entry: updatedEntry },
        { type: 'delete', entry: initialEntries[1] }
      ];

      const batch: IndexBatch = {
        operations,
        timestamp: new Date(),
        source: 'mixed-batch'
      };

      await indexManager.indexBatch(batch);

      const stats = await indexManager.getStats();
      expect(stats.totalEntries).toBe(3); // 3 initial - 1 deleted + 1 new = 3
    });

    it('should emit batch processing events', (done) => {
      const entries = createTestEntries(3);
      const operations: IndexUpdateOperation[] = entries.map(entry => ({
        type: 'insert',
        entry
      }));

      const batch: IndexBatch = {
        operations,
        timestamp: new Date(),
        source: 'event-test'
      };

      indexManager.on('batch_processed', (event) => {
        expect(event.source).toBe('event-test');
        expect(event.operationsCount).toBe(3);
        expect(event.inserts).toBe(3);
        expect(event.updates).toBe(0);
        expect(event.deletes).toBe(0);
        done();
      });

      indexManager.indexBatch(batch);
    });
  });

  describe('Index Maintenance', () => {
    it('should provide accurate statistics', async () => {
      const entries = createTestEntries(20);
      await indexManager.indexContent(entries);

      const stats = await indexManager.getStats();

      expect(stats.totalEntries).toBe(20);
      expect(stats.databaseSize).toBeGreaterThan(0);
      expect(stats.lastUpdated).toBeInstanceOf(Date);
      expect(stats.typeBreakdown).toBeDefined();
      expect(stats.averageIndexTime).toBeGreaterThan(0);
    });

    it('should perform vacuum operation', async () => {
      const entries = createTestEntries(50);
      await indexManager.indexContent(entries);

      // Delete half the entries to create fragmentation
      const toDelete = entries.slice(0, 25).map(e => e.id);
      await indexManager.removeFromIndex(toDelete);

      const result = await indexManager.vacuum();

      expect(result.vacuumPerformed).toBe(true);
      expect(result.duration).toBeGreaterThan(0);
      expect(result.errors.length).toBe(0);
    });

    it('should perform cleanup operations', async () => {
      const entries = createTestEntries(20);
      await indexManager.indexContent(entries);

      const result = await indexManager.cleanup(0); // Clean all entries

      expect(result.duration).toBeGreaterThan(0);
      expect(result.errors.length).toBe(0);
    });
  });

  describe('Index Rebuilding', () => {
    it('should rebuild index successfully', async () => {
      // This test would require mocked components since we don't have
      // actual Knowledge/Memory managers in test environment
      
      await expect(indexManager.rebuildIndex()).resolves.not.toThrow();
    });

    it('should rebuild partial index by type', async () => {
      await expect(
        indexManager.rebuildPartialIndex('knowledge')
      ).resolves.not.toThrow();
    });

    it('should emit rebuild events', (done) => {
      let startEventReceived = false;

      indexManager.on('rebuild_started', () => {
        startEventReceived = true;
      });

      indexManager.on('rebuild_completed', (event) => {
        expect(startEventReceived).toBe(true);
        expect(event.totalEntries).toBeGreaterThanOrEqual(0);
        expect(event.duration).toBeGreaterThan(0);
        done();
      });

      indexManager.rebuildIndex();
    });
  });

  describe('Error Handling', () => {
    it('should handle indexing errors gracefully', async () => {
      const invalidEntry = {
        // Missing required fields
        id: 'invalid',
        type: 'knowledge'
      } as IndexEntry;

      await expect(indexManager.indexContent([invalidEntry]))
        .rejects.toThrow();
    });

    it('should emit error events', (done) => {
      const invalidEntry = {
        id: 'invalid',
        type: 'knowledge'
      } as IndexEntry;

      indexManager.on('indexing_error', (event) => {
        expect(event.error).toBeDefined();
        expect(event.entriesCount).toBe(1);
        done();
      });

      indexManager.indexContent([invalidEntry]).catch(() => {
        // Expected to fail
      });
    });

    it('should handle batch errors gracefully', (done) => {
      const invalidOperation: IndexUpdateOperation = {
        type: 'insert',
        entry: {} as IndexEntry // Invalid entry
      };

      const batch: IndexBatch = {
        operations: [invalidOperation],
        timestamp: new Date(),
        source: 'error-test'
      };

      indexManager.on('batch_error', (event) => {
        expect(event.error).toBeDefined();
        expect(event.batch.source).toBe('error-test');
        done();
      });

      indexManager.indexBatch(batch).catch(() => {
        // Expected to fail
      });
    });
  });

  describe('Performance Monitoring', () => {
    it('should track indexing performance', async () => {
      const entries = createTestEntries(100);
      
      const startTime = Date.now();
      await indexManager.indexContent(entries);
      const endTime = Date.now();

      const indexTime = endTime - startTime;
      const entriesPerSecond = entries.length / (indexTime / 1000);

      console.log(`Indexing performance: ${entriesPerSecond.toFixed(2)} entries/second`);

      // Should achieve reasonable performance (>20 entries/second)
      expect(entriesPerSecond).toBeGreaterThan(20);

      const stats = await indexManager.getStats();
      expect(stats.averageIndexTime).toBeGreaterThan(0);
    });

    it('should handle concurrent operations', async () => {
      const batches = Array.from({ length: 5 }, (_, i) => {
        const entries = createTestEntries(10, `batch-${i}`);
        const operations: IndexUpdateOperation[] = entries.map(entry => ({
          type: 'insert',
          entry
        }));

        return {
          operations,
          timestamp: new Date(),
          source: `concurrent-batch-${i}`
        } as IndexBatch;
      });

      const startTime = Date.now();
      await Promise.all(batches.map(batch => indexManager.indexBatch(batch)));
      const endTime = Date.now();

      const totalTime = endTime - startTime;
      console.log(`Concurrent batch processing: ${totalTime}ms for 5 batches`);

      // Should complete within reasonable time
      expect(totalTime).toBeLessThan(3000); // 3 seconds

      const stats = await indexManager.getStats();
      expect(stats.totalEntries).toBe(50); // 5 batches * 10 entries
    });
  });

  describe('Integration with Search Engine', () => {
    it('should provide access to search engine', () => {
      const searchEngine = indexManager.getSearchEngine();
      expect(searchEngine).toBeDefined();
      expect(typeof searchEngine.search).toBe('function');
    });

    it('should enable searching indexed content', async () => {
      const entries = createTestEntries(10);
      await indexManager.indexContent(entries);

      const searchEngine = indexManager.getSearchEngine();
      const results = await searchEngine.search({
        query: 'test content',
        limit: 5
      });

      expect(results.results.length).toBeGreaterThan(0);
      expect(results.totalMatches).toBeGreaterThan(0);
    });
  });

  // Helper functions
  function createTestEntry(
    id: string, 
    title: string, 
    content: string,
    tags: string[] = ['test']
  ): IndexEntry {
    return {
      id,
      type: 'knowledge',
      title,
      content,
      path: `test/${id}`,
      metadata: {
        tags,
        category: 'test',
        agentTypes: ['test-agent'],
        scope: 'project',
        usageCount: 1,
        lastUsed: new Date(),
        effectiveness: 0.8,
        fileSize: content.length,
        relatedIds: [],
        parentId: undefined,
        childIds: []
      },
      lastModified: new Date()
    };
  }

  function createTestEntries(count: number, prefix = 'test'): IndexEntry[] {
    return Array.from({ length: count }, (_, i) => 
      createTestEntry(
        `${prefix}-entry-${i}`,
        `Test Entry ${i}`,
        `This is test content for entry ${i}. It contains searchable text and various keywords for testing indexing functionality.`,
        ['test', `tag-${i % 3}`]
      )
    );
  }
});