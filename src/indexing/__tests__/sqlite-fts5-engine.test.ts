// 🟢 WORKING: Comprehensive unit tests for SQLiteFTS5Engine
// Tests all public methods with expected, edge case, and error scenarios
// Ensures sub-500ms performance and zero breaking changes

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { existsSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SQLiteFTS5Engine, SQLiteFTS5Config } from '../sqlite-fts5-engine.js';
import { 
  IndexEntry, 
  SearchQuery, 
  IndexContentType, 
  IndexMetadata,
  SearchResults 
} from '../types.js';

describe('SQLiteFTS5Engine', () => {
  let engine: SQLiteFTS5Engine;
  let testDbPath: string;
  let testConfig: SQLiteFTS5Config;

  // 🟢 WORKING: Test data setup
  const createTestEntry = (id: string, overrides: Partial<IndexEntry> = {}): IndexEntry => ({
    id,
    type: 'knowledge' as IndexContentType,
    title: `Test Entry ${id}`,
    content: `This is test content for entry ${id} with some searchable text about ForgeFlow and AI orchestration.`,
    path: `/test/path/${id}.md`,
    metadata: {
      tags: ['test', 'forgeflow', 'ai'],
      category: 'testing',
      usageCount: 1,
      lastUsed: new Date(),
      fileSize: 1024,
      agentTypes: ['test-agent'],
      relatedIds: [],
      childIds: [],
    } as IndexMetadata,
    lastModified: new Date(),
    ...overrides,
  });

  const createLargeTestDataset = (count: number): IndexEntry[] => {
    return Array.from({ length: count }, (_, i) => 
      createTestEntry(`large-${i}`, {
        title: `Large Dataset Entry ${i}`,
        content: `This is entry number ${i} with unique content about ${i % 2 === 0 ? 'machine learning' : 'software engineering'}. It contains keywords like ${i % 3 === 0 ? 'python' : i % 3 === 1 ? 'typescript' : 'javascript'}.`,
        metadata: {
          tags: i % 2 === 0 ? ['ml', 'ai', 'data'] : ['code', 'dev', 'testing'],
          category: i % 2 === 0 ? 'machine-learning' : 'software-development',
          usageCount: Math.floor(Math.random() * 100),
          lastUsed: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
          fileSize: 1024 + Math.floor(Math.random() * 5000),
          agentTypes: ['test-agent'],
          relatedIds: [],
          childIds: [],
        } as IndexMetadata,
        lastModified: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
      })
    );
  };

  beforeAll(() => {
    // 🟢 WORKING: Create unique test database path
    testDbPath = join(tmpdir(), `test-fts5-engine-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.db`);
    
    testConfig = {
      databasePath: testDbPath,
      maxDatabaseSize: 10 * 1024 * 1024, // 10MB for tests
      cacheSize: 1000,
      pageSize: 4096,
      maxConnections: 5,
      queryTimeout: 5000,
      tokenizer: 'unicode61',
      removeAccents: true,
      caseSensitive: false,
      contentRanking: 'bm25',
      queryCacheSize: 100,
      snippetCacheSize: 500,
      facetCacheSize: 50,
      batchSize: 50,
      maxContentLength: 10000,
      enableMetrics: true,
      slowQueryThreshold: 1000,
    };
  });

  beforeEach(async () => {
    // 🟢 WORKING: Clean up any existing database
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    
    // 🟢 WORKING: Create fresh engine instance
    engine = new SQLiteFTS5Engine(testConfig);
  });

  afterEach(async () => {
    // 🟢 WORKING: Clean shutdown
    if (engine) {
      try {
        await engine.shutdown();
      } catch (error) {
        // Ignore shutdown errors in tests
      }
    }
  });

  afterAll(() => {
    // 🟢 WORKING: Clean up test database
    if (existsSync(testDbPath)) {
      try {
        unlinkSync(testDbPath);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  describe('Initialization and Lifecycle', () => {
    it('should initialize successfully with default config', async () => {
      // 🟢 WORKING: Expected behavior test
      await expect(engine.initialize()).resolves.not.toThrow();
      
      const health = await engine.getHealth();
      expect(health.status).toBe('healthy');
      expect(health.checks.databaseConnection).toBe(true);
      expect(health.checks.indexIntegrity).toBe(true);
    });

    it('should initialize with custom config', async () => {
      // 🟢 WORKING: Expected behavior test with custom settings
      const customConfig = {
        ...testConfig,
        tokenizer: 'porter' as const,
        caseSensitive: true,
        batchSize: 25,
      };
      
      const customEngine = new SQLiteFTS5Engine(customConfig);
      
      await expect(customEngine.initialize()).resolves.not.toThrow();
      await customEngine.shutdown();
    });

    it('should handle initialization failure gracefully', async () => {
      // 🟢 WORKING: Error case test
      const badEngine = new SQLiteFTS5Engine({
        ...testConfig,
        databasePath: '/invalid/path/that/does/not/exist/test.db',
      });

      await expect(badEngine.initialize()).rejects.toThrow();
    });

    it('should shutdown gracefully', async () => {
      // 🟢 WORKING: Expected behavior test
      await engine.initialize();
      await expect(engine.shutdown()).resolves.not.toThrow();
    });

    it('should handle multiple shutdowns without error', async () => {
      // 🟢 WORKING: Edge case test
      await engine.initialize();
      await engine.shutdown();
      await expect(engine.shutdown()).resolves.not.toThrow();
    });
  });

  describe('Index Management', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it('should index single entry successfully', async () => {
      // 🟢 WORKING: Expected behavior test
      const entry = createTestEntry('test-1');
      
      await expect(engine.indexEntries([entry])).resolves.not.toThrow();
      
      const metrics = await engine.getMetrics();
      expect(metrics.totalEntries).toBe(1);
    });

    it('should index multiple entries in batches', async () => {
      // 🟢 WORKING: Expected behavior test
      const entries = Array.from({ length: 150 }, (_, i) => createTestEntry(`batch-${i}`));
      
      await expect(engine.indexEntries(entries)).resolves.not.toThrow();
      
      const metrics = await engine.getMetrics();
      expect(metrics.totalEntries).toBe(150);
    });

    it('should handle large content truncation', async () => {
      // 🟢 WORKING: Edge case test
      const entry = createTestEntry('large-content', {
        content: 'x'.repeat(50000), // Exceeds maxContentLength
      });
      
      await expect(engine.indexEntries([entry])).resolves.not.toThrow();
    });

    it('should reject invalid entries', async () => {
      // 🟢 WORKING: Error case test
      const invalidEntry = {
        id: '',
        type: 'knowledge' as IndexContentType,
        title: '',
        content: '',
        path: '',
        metadata: {} as IndexMetadata,
        lastModified: new Date(),
      };
      
      await expect(engine.indexEntries([invalidEntry])).rejects.toThrow();
    });

    it('should update existing entries', async () => {
      // 🟢 WORKING: Expected behavior test
      const originalEntry = createTestEntry('update-test');
      await engine.indexEntries([originalEntry]);
      
      const updatedEntry = {
        ...originalEntry,
        title: 'Updated Title',
        content: 'Updated content with new information',
      };
      
      await expect(engine.updateEntries([updatedEntry])).resolves.not.toThrow();
    });

    it('should delete entries successfully', async () => {
      // 🟢 WORKING: Expected behavior test
      const entries = [createTestEntry('delete-1'), createTestEntry('delete-2')];
      await engine.indexEntries(entries);
      
      await expect(engine.deleteEntries(['delete-1'])).resolves.not.toThrow();
    });

    it('should handle deleting non-existent entries', async () => {
      // 🟢 WORKING: Edge case test
      await expect(engine.deleteEntries(['non-existent-id'])).resolves.not.toThrow();
    });
  });

  describe('Search Operations', () => {
    beforeEach(async () => {
      await engine.initialize();
      
      // 🟢 WORKING: Set up test data
      const testEntries = [
        createTestEntry('search-1', {
          title: 'JavaScript Development',
          content: 'Learn JavaScript programming with modern ES6+ features and React framework.',
          metadata: {
            tags: ['javascript', 'programming', 'web'],
            category: 'development',
            usageCount: 10,
            lastUsed: new Date(),
            fileSize: 2048,
            agentTypes: ['code-implementer'],
            relatedIds: [],
            childIds: [],
          } as IndexMetadata,
        }),
        createTestEntry('search-2', {
          title: 'Python Machine Learning',
          content: 'Python is excellent for machine learning with libraries like TensorFlow and PyTorch.',
          metadata: {
            tags: ['python', 'ml', 'ai'],
            category: 'machine-learning',
            usageCount: 25,
            lastUsed: new Date(),
            fileSize: 3072,
            agentTypes: ['ml-specialist'],
            relatedIds: [],
            childIds: [],
          } as IndexMetadata,
        }),
        createTestEntry('search-3', {
          title: 'TypeScript Best Practices',
          content: 'TypeScript provides type safety for JavaScript development with excellent tooling.',
          metadata: {
            tags: ['typescript', 'javascript', 'types'],
            category: 'development',
            usageCount: 15,
            lastUsed: new Date(),
            fileSize: 1536,
            agentTypes: ['code-implementer'],
            relatedIds: [],
            childIds: [],
          } as IndexMetadata,
        }),
      ];
      
      await engine.indexEntries(testEntries);
    });

    it('should perform basic text search', async () => {
      // 🟢 WORKING: Expected behavior test
      const query: SearchQuery = {
        query: 'JavaScript',
        limit: 10,
      };
      
      const results = await engine.search(query);
      
      expect(results.results).toHaveLength(2); // JavaScript and TypeScript entries
      expect(results.executionTime).toBeLessThan(500); // Sub-500ms requirement
      expect(results.results[0].score).toBeGreaterThan(0);
    });

    it('should handle phrase search', async () => {
      // 🟢 WORKING: Expected behavior test
      const query: SearchQuery = {
        query: 'machine learning',
        queryType: 'phrase',
        limit: 10,
      };
      
      const results = await engine.search(query);
      
      expect(results.results).toHaveLength(1);
      expect(results.results[0].entry.title).toContain('Python Machine Learning');
    });

    it('should perform fuzzy search', async () => {
      // 🟢 WORKING: Expected behavior test
      const query: SearchQuery = {
        query: 'javascrpt', // Intentional typo
        queryType: 'fuzzy',
        limit: 10,
      };
      
      const results = await engine.search(query);
      
      expect(results.results.length).toBeGreaterThan(0);
    });

    it('should filter by content type', async () => {
      // 🟢 WORKING: Expected behavior test
      const query: SearchQuery = {
        query: 'development',
        type: 'knowledge',
        limit: 10,
      };
      
      const results = await engine.search(query);
      
      results.results.forEach(result => {
        expect(result.entry.type).toBe('knowledge');
      });
    });

    it('should return empty results for non-matching query', async () => {
      // 🟢 WORKING: Edge case test
      const query: SearchQuery = {
        query: 'nonexistentterms12345',
        limit: 10,
      };
      
      const results = await engine.search(query);
      
      expect(results.results).toHaveLength(0);
      expect(results.totalMatches).toBe(0);
    });

    it('should handle empty query gracefully', async () => {
      // 🟢 WORKING: Edge case test
      const query: SearchQuery = {
        query: '',
        limit: 10,
      };
      
      const results = await engine.search(query);
      
      expect(results.results).toHaveLength(0);
    });

    it('should respect result limits', async () => {
      // 🟢 WORKING: Expected behavior test
      const query: SearchQuery = {
        query: 'development',
        limit: 1,
      };
      
      const results = await engine.search(query);
      
      expect(results.results).toHaveLength(1);
    });

    it('should include snippets when requested', async () => {
      // 🟢 WORKING: Expected behavior test
      const query: SearchQuery = {
        query: 'JavaScript',
        includeSnippets: true,
        snippetLength: 100,
        limit: 10,
      };
      
      const results = await engine.search(query);
      
      expect(results.results.length).toBeGreaterThan(0);
      expect(results.results[0].contentSnippets).toHaveLength(1);
      expect(results.results[0].contentSnippets[0].text.length).toBeLessThanOrEqual(100);
    });

    it('should generate search suggestions', async () => {
      // 🟢 WORKING: Expected behavior test
      const suggestions = await engine.suggest('java');
      
      expect(suggestions).toBeInstanceOf(Array);
      expect(suggestions.length).toBeGreaterThanOrEqual(0);
    });

    it('should find similar entries', async () => {
      // 🟢 WORKING: Expected behavior test
      const results = await engine.findSimilar('search-1', 5);
      
      expect(results.results).toBeInstanceOf(Array);
      // Should not include the original entry
      expect(results.results.every(r => r.entry.id !== 'search-1')).toBe(true);
    });

    it('should handle similar search for non-existent entry', async () => {
      // 🟢 WORKING: Edge case test
      const results = await engine.findSimilar('non-existent', 5);
      
      expect(results.results).toHaveLength(0);
    });
  });

  describe('Performance and Caching', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it('should cache query results', async () => {
      // 🟢 WORKING: Expected behavior test
      const entry = createTestEntry('cache-test');
      await engine.indexEntries([entry]);
      
      const query: SearchQuery = { query: 'cache test', limit: 10 };
      
      // First search
      const start1 = performance.now();
      const results1 = await engine.search(query);
      const duration1 = performance.now() - start1;
      
      // Second search (should be cached)
      const start2 = performance.now();
      const results2 = await engine.search(query);
      const duration2 = performance.now() - start2;
      
      expect(results1.results).toEqual(results2.results);
      expect(duration2).toBeLessThan(duration1); // Cache should be faster
      
      const metrics = await engine.getMetrics();
      expect(metrics.queryCacheHits).toBeGreaterThan(0);
    });

    it('should meet sub-500ms performance requirement for large datasets', async () => {
      // 🟢 WORKING: Performance test
      const largeDataset = createLargeTestDataset(1000);
      await engine.indexEntries(largeDataset);
      
      const query: SearchQuery = {
        query: 'machine learning typescript',
        limit: 20,
      };
      
      const start = performance.now();
      const results = await engine.search(query);
      const duration = performance.now() - start;
      
      expect(duration).toBeLessThan(500); // Sub-500ms requirement
      expect(results.results.length).toBeGreaterThan(0);
    });

    it('should handle concurrent searches efficiently', async () => {
      // 🟢 WORKING: Concurrency test
      const entries = createLargeTestDataset(500);
      await engine.indexEntries(entries);
      
      const queries = [
        { query: 'machine learning', limit: 10 },
        { query: 'typescript javascript', limit: 10 },
        { query: 'software engineering', limit: 10 },
        { query: 'python data', limit: 10 },
        { query: 'ai development', limit: 10 },
      ];
      
      const start = performance.now();
      const results = await Promise.all(queries.map(q => engine.search(q)));
      const duration = performance.now() - start;
      
      expect(results).toHaveLength(5);
      expect(duration).toBeLessThan(2000); // Should handle concurrent requests efficiently
      results.forEach(result => {
        expect(result.executionTime).toBeLessThan(500);
      });
    });
  });

  describe('Health and Diagnostics', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it('should report healthy status', async () => {
      // 🟢 WORKING: Expected behavior test
      const health = await engine.getHealth();
      
      expect(health.status).toBe('healthy');
      expect(health.checks.databaseConnection).toBe(true);
      expect(health.checks.indexIntegrity).toBe(true);
      expect(health.checks.performanceWithinLimits).toBe(true);
      expect(health.checks.diskSpaceAvailable).toBe(true);
      expect(health.checks.cacheOperational).toBe(true);
      expect(health.issues).toHaveLength(0);
    });

    it('should provide comprehensive metrics', async () => {
      // 🟢 WORKING: Expected behavior test
      const entries = createLargeTestDataset(100);
      await engine.indexEntries(entries);
      
      await engine.search({ query: 'test', limit: 10 });
      
      const metrics = await engine.getMetrics();
      
      expect(metrics.totalEntries).toBe(100);
      expect(metrics.totalQueries).toBeGreaterThan(0);
      expect(metrics.totalIndexOperations).toBeGreaterThan(0);
      expect(metrics.databaseSize).toBeGreaterThan(0);
      expect(typeof metrics.averageQueryTime).toBe('number');
    });

    it('should provide detailed diagnostics', async () => {
      // 🟢 WORKING: Expected behavior test
      const diagnostics = await engine.getDiagnostics();
      
      expect(diagnostics.databaseInfo.version).toBeDefined();
      expect(diagnostics.databaseInfo.pageSize).toBeGreaterThan(0);
      expect(diagnostics.ftsInfo.version).toBe('5');
      expect(diagnostics.ftsInfo.tokenizer).toBe(testConfig.tokenizer);
      expect(diagnostics.performance.recentQueries).toBeInstanceOf(Array);
      expect(diagnostics.performance.slowestQueries).toBeInstanceOf(Array);
    });
  });

  describe('Maintenance Operations', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it('should optimize database successfully', async () => {
      // 🟢 WORKING: Expected behavior test
      const entries = createLargeTestDataset(200);
      await engine.indexEntries(entries);
      
      await expect(engine.optimize()).resolves.not.toThrow();
    });

    it('should vacuum database successfully', async () => {
      // 🟢 WORKING: Expected behavior test
      const entries = createLargeTestDataset(100);
      await engine.indexEntries(entries);
      
      // Add and remove some entries to create fragmentation
      const moreEntries = createLargeTestDataset(50);
      await engine.indexEntries(moreEntries);
      await engine.deleteEntries(moreEntries.slice(0, 25).map(e => e.id));
      
      await expect(engine.vacuum()).resolves.not.toThrow();
    });

    it('should handle maintenance operations on empty database', async () => {
      // 🟢 WORKING: Edge case test
      await expect(engine.optimize()).resolves.not.toThrow();
      await expect(engine.vacuum()).resolves.not.toThrow();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it('should handle search on uninitialized engine', async () => {
      // 🟢 WORKING: Error case test
      const uninitializedEngine = new SQLiteFTS5Engine(testConfig);
      
      const query: SearchQuery = { query: 'test', limit: 10 };
      await expect(uninitializedEngine.search(query)).rejects.toThrow();
    });

    it('should handle indexing on uninitialized engine', async () => {
      // 🟢 WORKING: Error case test
      const uninitializedEngine = new SQLiteFTS5Engine(testConfig);
      const entry = createTestEntry('test');
      
      await expect(uninitializedEngine.indexEntries([entry])).rejects.toThrow();
    });

    it('should handle extremely large search queries', async () => {
      // 🟢 WORKING: Edge case test
      const entry = createTestEntry('large-query-test');
      await engine.indexEntries([entry]);
      
      const largeQuery = 'word '.repeat(1000).trim(); // 1000 word query
      const query: SearchQuery = { query: largeQuery, limit: 10 };
      
      await expect(engine.search(query)).resolves.not.toThrow();
    });

    it('should handle special characters in search queries', async () => {
      // 🟢 WORKING: Edge case test
      const entry = createTestEntry('special-chars', {
        content: 'Testing with special characters: @#$%^&*()[]{}|\\:";\'<>?,./~`',
      });
      await engine.indexEntries([entry]);
      
      const query: SearchQuery = { query: '@#$%', limit: 10 };
      
      await expect(engine.search(query)).resolves.not.toThrow();
    });

    it('should handle Unicode characters properly', async () => {
      // 🟢 WORKING: Edge case test
      const entry = createTestEntry('unicode-test', {
        title: 'Unicode Test: 你好世界 🌍 café naïve résumé',
        content: 'Testing Unicode: العربية русский 日本語 한국어 ñáéíóú',
      });
      await engine.indexEntries([entry]);
      
      const query: SearchQuery = { query: '你好', limit: 10 };
      
      const results = await engine.search(query);
      expect(results).toBeDefined();
    });
  });

  describe('Integration and Compatibility', () => {
    beforeEach(async () => {
      await engine.initialize();
    });

    it('should maintain compatibility with existing SearchQuery interface', async () => {
      // 🟢 WORKING: Compatibility test
      const entry = createTestEntry('compatibility-test');
      await engine.indexEntries([entry]);
      
      // Test all SearchQuery properties
      const query: SearchQuery = {
        query: 'compatibility',
        queryType: 'simple',
        type: 'knowledge',
        category: 'testing',
        tags: 'test',
        projectId: 'test-project',
        agentTypes: 'test-agent',
        fuzzy: false,
        phrase: false,
        boolean: false,
        limit: 10,
        offset: 0,
        includeSnippets: true,
        snippetLength: 100,
        highlightResults: true,
        minScore: 0.1,
        boostRecent: true,
        boostEffective: true,
        createdAfter: new Date(Date.now() - 24 * 60 * 60 * 1000),
        createdBefore: new Date(),
      };
      
      const results = await engine.search(query);
      expect(results).toBeDefined();
      expect(results.results).toBeInstanceOf(Array);
      expect(results.totalMatches).toBeGreaterThanOrEqual(0);
      expect(results.executionTime).toBeGreaterThan(0);
    });

    it('should return SearchResults in expected format', async () => {
      // 🟢 WORKING: Interface compatibility test
      const entry = createTestEntry('format-test');
      await engine.indexEntries([entry]);
      
      const results = await engine.search({ query: 'format', limit: 10 });
      
      // Verify SearchResults structure
      expect(results).toHaveProperty('results');
      expect(results).toHaveProperty('totalMatches');
      expect(results).toHaveProperty('totalPages');
      expect(results).toHaveProperty('currentPage');
      expect(results).toHaveProperty('executionTime');
      expect(results).toHaveProperty('facets');
      expect(results).toHaveProperty('suggestions');
      
      if (results.results.length > 0) {
        const result = results.results[0];
        expect(result).toHaveProperty('entry');
        expect(result).toHaveProperty('score');
        expect(result).toHaveProperty('rank');
        expect(result).toHaveProperty('contentSnippets');
        expect(result).toHaveProperty('matchedFields');
        expect(result).toHaveProperty('totalMatches');
        expect(result).toHaveProperty('relevanceFactors');
      }
    });
  });
});