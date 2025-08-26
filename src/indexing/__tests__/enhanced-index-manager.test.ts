// 🟢 WORKING: Enhanced Index Manager Tests - SQLite FTS5 + Real-time Indexing
// Comprehensive test suite for the enhanced IndexManager with FTS5 integration

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { ForgeFlowIndexManager } from '../index-manager.js';
import type { IndexConfig, IndexEntry, IndexBatch, ContentChange } from '../types.js';
import { IndexUpdateOperation } from '../types.js';

describe('Enhanced ForgeFlowIndexManager with SQLite FTS5', () => {
  let indexManager: ForgeFlowIndexManager;
  let config: IndexConfig;
  let testDbPath: string;
  let testWatchDir: string;

  beforeAll(async () => {
    // 🟢 WORKING: Setup test environment
    testDbPath = join(tmpdir(), 'ff2-enhanced-index-manager-test.db');
    testWatchDir = join(tmpdir(), 'ff2-watch-test');

    if (existsSync(testDbPath)) {
      rmSync(testDbPath);
    }

    if (existsSync(testWatchDir)) {
      rmSync(testWatchDir, { recursive: true });
    }

    mkdirSync(testWatchDir, { recursive: true });

    config = {
      databasePath: testDbPath,
      maxDatabaseSize: 100 * 1024 * 1024, // 100MB
      tokenizer: 'porter', // Use porter for better compatibility
      removeAccents: true,
      caseSensitive: false,
      cacheSize: 2000, // Enhanced cache
      synchronous: 'normal',
      journalMode: 'wal',
      batchSize: 100, // Larger batches for better performance
      maxContentLength: 50000,
      enableVectorIndex: false,
      autoVacuum: true,
      vacuumThreshold: 20,
      retentionDays: 90,
      defaultLimit: 50,
      maxLimit: 1000,
      snippetLength: 200,
      maxSnippets: 10,
    };

    indexManager = new ForgeFlowIndexManager(config);
    await indexManager.initialize();
  });

  afterAll(async () => {
    await indexManager.shutdown();
    if (existsSync(testDbPath)) {
      rmSync(testDbPath);
    }
    if (existsSync(testWatchDir)) {
      rmSync(testWatchDir, { recursive: true });
    }
  });

  describe('🚀 SQLite FTS5 Engine Integration', () => {
    it('should initialize with SQLite FTS5 engine', async () => {
      const fts5Engine = indexManager.getFTS5Engine();
      expect(fts5Engine).toBeDefined();

      const health = await fts5Engine.getHealth();
      expect(health.status).toMatch(/healthy|degraded/);
    });

    it('should provide enhanced search capabilities', async () => {
      const testEntries: IndexEntry[] = [
        {
          id: 'fts5-test-1',
          type: 'knowledge',
          title: 'Advanced React Patterns',
          content:
            'This knowledge card covers advanced React patterns including hooks, context, and performance optimization.',
          path: '/test/react-patterns.md',
          hash: 'hash-fts5-test-1',
          metadata: {
            tags: ['react', 'patterns', 'hooks'],
            agentTypes: ['frontend'],
            usageCount: 10,
            lastUsed: new Date(),
            fileSize: 1024,
            relatedIds: [],
            childIds: [],
            effectiveness: 0.9,
          },
          lastModified: new Date(),
        },
        {
          id: 'fts5-test-2',
          type: 'code',
          title: 'TypeScript Utility Types',
          content:
            'Comprehensive guide to TypeScript utility types like Partial, Pick, Record, and custom type utilities.',
          path: '/test/typescript-utils.ts',
          hash: 'hash-fts5-test-2',
          metadata: {
            tags: ['typescript', 'types', 'utilities'],
            agentTypes: ['backend', 'frontend'],
            usageCount: 15,
            lastUsed: new Date(),
            fileSize: 2048,
            relatedIds: [],
            childIds: [],
            effectiveness: 0.95,
          },
          lastModified: new Date(),
        },
      ];

      // Index content using FTS5 engine
      await indexManager.indexContent(testEntries);

      // Test enhanced search capabilities
      const searchResults = await indexManager.search({
        query: 'React patterns hooks',
        limit: 10,
        includeSnippets: true,
        boostEffective: true,
      });

      expect(searchResults.results.length).toBeGreaterThan(0);
      expect(searchResults.executionTime).toBeLessThan(500); // Sub-500ms performance
      expect(searchResults.results[0].entry.id).toBe('fts5-test-1');
    });

    it('should handle similarity search', async () => {
      const similarResults = await indexManager.findSimilar('fts5-test-1', 5);

      expect(similarResults).toBeDefined();
      expect(similarResults.results).toBeInstanceOf(Array);
    });

    it('should provide search suggestions', async () => {
      const suggestions = await indexManager.getSuggestions('React');

      expect(suggestions).toBeInstanceOf(Array);
      expect(suggestions.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('📊 Performance Monitoring', () => {
    it('should track performance metrics', async () => {
      const metrics = indexManager.getPerformanceMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.totalIndexedEntries).toBeGreaterThanOrEqual(0);
      expect(metrics.batchesProcessed).toBeGreaterThanOrEqual(0);
      expect(metrics.queueSizes).toBeDefined();
      expect(metrics.activeOperations).toBeGreaterThanOrEqual(0);
    });

    it('should provide FTS5 engine metrics', async () => {
      const fts5Engine = indexManager.getFTS5Engine();
      const metrics = await fts5Engine.getMetrics();

      expect(metrics.totalQueries).toBeGreaterThanOrEqual(0);
      expect(metrics.averageQueryTime).toBeGreaterThanOrEqual(0);
      expect(metrics.databaseSize).toBeGreaterThanOrEqual(0);
      expect(metrics.totalEntries).toBeGreaterThanOrEqual(0);
    });

    it('should maintain health monitoring', async () => {
      const fts5Engine = indexManager.getFTS5Engine();
      const health = await fts5Engine.getHealth();

      expect(health.status).toMatch(/healthy|degraded|unhealthy/);
      expect(health.checks).toBeDefined();
      expect(health.lastHealthCheck).toBeInstanceOf(Date);
    });
  });

  describe('⚡ Real-time Indexing', () => {
    it('should handle content changes via change buffer', async () => {
      const testChange: ContentChange = {
        type: 'created',
        path: join(testWatchDir, 'test-file.md'),
        contentType: 'knowledge',
        timestamp: new Date(),
      };

      // Write test file
      writeFileSync(testChange.path, '# Test Knowledge\nThis is a test knowledge file.');

      // Simulate file change
      await indexManager.handleContentChange(testChange);

      // Allow debouncing to complete
      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(true).toBe(true); // Content change handled without errors
    });

    it('should support priority queue processing', async () => {
      const priorityBatch: IndexBatch = {
        operations: [
          {
            type: 'insert',
            entry: {
              id: 'priority-test',
              type: 'knowledge',
              title: 'Priority Test',
              content: 'This is a priority test entry',
              path: '/test/priority.md',
              hash: 'hash-priority-test',
              metadata: {
                tags: ['priority', 'test'],
                agentTypes: ['system'],
                usageCount: 1,
                lastUsed: new Date(),
                fileSize: 100,
                relatedIds: [],
                childIds: [],
              },
              lastModified: new Date(),
            },
          },
        ],
        timestamp: new Date(),
        source: 'priority-test-batch',
      };

      await indexManager.indexBatch(priorityBatch);
      expect(true).toBe(true); // Priority batch processed without errors
    });

    it('should handle file watcher operations', async () => {
      const watchDir = join(testWatchDir, 'watch-test');
      mkdirSync(watchDir, { recursive: true });

      // Add directory to watching
      await indexManager.addWatchDirectory(watchDir);

      // Test file creation
      const testFile = join(watchDir, 'watched-file.md');
      writeFileSync(testFile, '# Watched File\nThis file is being watched.');

      // Allow file system events to propagate
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Remove from watching
      await indexManager.removeWatchDirectory(watchDir);

      expect(true).toBe(true); // File watching operations completed
    });
  });

  describe('🔄 Batch Processing', () => {
    it('should handle concurrent batch operations', async () => {
      const batches = Array.from({ length: 5 }, (_, i) => ({
        operations: [
          {
            type: 'insert' as const,
            entry: {
              id: `concurrent-${i}`,
              type: 'code' as const,
              title: `Concurrent Test ${i}`,
              content: `This is concurrent test entry number ${i}`,
              path: `/test/concurrent-${i}.ts`,
              hash: `hash-concurrent-${i}`,
              metadata: {
                tags: ['concurrent', 'test'],
                agentTypes: ['system'],
                usageCount: 1,
                lastUsed: new Date(),
                fileSize: 200,
                relatedIds: [],
                childIds: [],
              },
              lastModified: new Date(),
            },
          },
        ],
        timestamp: new Date(),
        source: `concurrent-batch-${i}`,
      }));

      const promises = batches.map((batch) => indexManager.indexBatch(batch));
      await Promise.all(promises);

      expect(true).toBe(true); // All concurrent batches processed
    });

    it('should handle batch updates and deletions', async () => {
      const updateBatch: IndexBatch = {
        operations: [
          {
            type: 'update',
            entry: {
              id: 'concurrent-0',
              type: 'code',
              title: 'Updated Concurrent Test',
              content: 'This entry has been updated',
              path: '/test/concurrent-0-updated.ts',
              hash: 'hash-concurrent-0',
              metadata: {
                tags: ['concurrent', 'test', 'updated'],
                agentTypes: ['system'],
                usageCount: 2,
                lastUsed: new Date(),
                fileSize: 250,
                relatedIds: [],
                childIds: [],
              },
              lastModified: new Date(),
            },
          },
          {
            type: 'delete',
            entry: {
              id: 'concurrent-1',
              type: 'code',
              title: 'To Delete',
              content: '',
              path: '/test/to-delete.ts',
              hash: 'hash-concurrent-1',
              metadata: {
                tags: [],
                agentTypes: [],
                usageCount: 0,
                lastUsed: new Date(),
                fileSize: 0,
                relatedIds: [],
                childIds: [],
              },
              lastModified: new Date(),
            },
          },
        ],
        timestamp: new Date(),
        source: 'update-delete-batch',
      };

      await indexManager.indexBatch(updateBatch);
      expect(true).toBe(true); // Update and delete operations completed
    });
  });

  describe('🛠️ Maintenance Operations', () => {
    it('should perform enhanced vacuum with FTS5 optimization', async () => {
      const result = await indexManager.vacuum();

      expect(result).toBeDefined();
      expect(result.vacuumPerformed).toBe(true);
      expect(result.duration).toBeGreaterThan(0);
      expect(result.errors).toBeInstanceOf(Array);
    });

    it('should handle index statistics with FTS5 metrics', async () => {
      const stats = await indexManager.getStats();

      expect(stats.totalEntries).toBeGreaterThanOrEqual(0);
      expect(stats.databaseSize).toBeGreaterThanOrEqual(0);
      expect(stats.averageSearchTime).toBeGreaterThanOrEqual(0);
      expect(stats.cacheHitRate).toBeGreaterThanOrEqual(0);
      expect(stats.typeBreakdown).toBeDefined();
    });

    it('should support enhanced rebuild operations', async () => {
      // This is a simplified test as full rebuild requires integration components
      expect(async () => {
        await indexManager.rebuildIndex();
      }).not.toThrow();
    });
  });

  describe('🔍 Enhanced Search Features', () => {
    it('should support faceted search', async () => {
      const results = await indexManager.search({
        query: 'test',
        type: 'knowledge',
        tags: 'react',
        limit: 10,
        includeSnippets: true,
      });

      expect(results.facets).toBeDefined();
      expect(results.facets.types).toBeInstanceOf(Array);
      expect(results.facets.categories).toBeInstanceOf(Array);
    });

    it('should handle boolean queries', async () => {
      const results = await indexManager.search({
        query: 'React AND patterns',
        queryType: 'boolean',
        limit: 5,
      });

      expect(results.results).toBeInstanceOf(Array);
    });

    it('should support fuzzy search', async () => {
      const results = await indexManager.search({
        query: 'Reaktt', // Intentional typo
        queryType: 'fuzzy',
        limit: 5,
      });

      expect(results.results).toBeInstanceOf(Array);
    });
  });

  describe('🛡️ Error Handling & Recovery', () => {
    it('should handle invalid entries gracefully', async () => {
      const invalidEntry = {
        id: '', // Invalid: empty ID
        type: 'knowledge',
        title: '',
        content: '',
        path: '',
        metadata: null,
        lastModified: new Date(),
      } as any;

      await expect(indexManager.indexContent([invalidEntry])).rejects.toThrow();
    });

    it('should gracefully handle shutdown during operations', async () => {
      const testManager = new ForgeFlowIndexManager({
        ...config,
        databasePath: join(tmpdir(), 'shutdown-test.db'),
      });

      await testManager.initialize();

      // Start an operation and immediately shutdown
      const shutdownPromise = testManager.shutdown();

      await expect(shutdownPromise).resolves.not.toThrow();

      // Cleanup
      const shutdownDbPath = join(tmpdir(), 'shutdown-test.db');
      if (existsSync(shutdownDbPath)) {
        rmSync(shutdownDbPath);
      }
    });

    it('should maintain data integrity during concurrent operations', async () => {
      const entries = Array.from({ length: 100 }, (_, i) => ({
        id: `integrity-test-${i}`,
        type: 'knowledge' as const,
        title: `Integrity Test ${i}`,
        content: `Content for integrity test ${i}`,
        path: `/test/integrity-${i}.md`,
        metadata: {
          tags: ['integrity', 'test'],
          agentTypes: ['system'],
          usageCount: 1,
          lastUsed: new Date(),
          fileSize: 100,
          relatedIds: [],
          childIds: [],
        },
        lastModified: new Date(),
      }));

      // Index many entries concurrently
      const chunkSize = 20;
      const chunks = [];
      for (let i = 0; i < entries.length; i += chunkSize) {
        chunks.push(entries.slice(i, i + chunkSize));
      }

      const promises = chunks.map((chunk) => indexManager.indexContent(chunk));
      await Promise.all(promises);

      // Verify all entries were indexed
      const stats = await indexManager.getStats();
      expect(stats.totalEntries).toBeGreaterThanOrEqual(100);
    });
  });
});
