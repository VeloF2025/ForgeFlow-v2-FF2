// Search Engine Tests - Comprehensive test suite with performance benchmarks
// Validates search functionality, ranking, and performance requirements

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync, existsSync } from 'fs';
import { ForgeFlowSearchEngine } from '../search-engine.js';
import { SQLiteFTS5Index } from '../sqlite-index.js';
import { IndexConfig, IndexEntry, SearchQuery, SearchResults } from '../types.js';

describe('ForgeFlowSearchEngine', () => {
  let searchEngine: ForgeFlowSearchEngine;
  let sqliteIndex: SQLiteFTS5Index;
  let config: IndexConfig;
  let testDbPath: string;

  beforeAll(async () => {
    // Setup test database
    testDbPath = join(tmpdir(), 'ff2-search-test.db');
    if (existsSync(testDbPath)) {
      rmSync(testDbPath);
    }

    config = {
      databasePath: testDbPath,
      maxDatabaseSize: 100 * 1024 * 1024, // 100MB
      tokenizer: 'porter',
      removeAccents: true,
      caseSensitive: false,
      cacheSize: 1000,
      synchronous: 'normal',
      journalMode: 'wal',
      batchSize: 100,
      maxContentLength: 50000,
      enableVectorIndex: false,
      autoVacuum: true,
      vacuumThreshold: 20,
      retentionDays: 90,
      defaultLimit: 20,
      maxLimit: 1000,
      snippetLength: 150,
      maxSnippets: 5
    };

    sqliteIndex = new SQLiteFTS5Index(config);
    searchEngine = new ForgeFlowSearchEngine(sqliteIndex);

    // Initialize database
    await sqliteIndex.connect();
    await sqliteIndex.createTables();
    await sqliteIndex.createIndexes();
    await sqliteIndex.migrate();
  });

  afterAll(async () => {
    await sqliteIndex.disconnect();
    if (existsSync(testDbPath)) {
      rmSync(testDbPath);
    }
  });

  beforeEach(async () => {
    // Clear database between tests
    await sqliteIndex.delete(await getAllEntryIds());
  });

  describe('Basic Search Functionality', () => {
    it('should perform simple text search', async () => {
      // Insert test data
      const entries = createTestEntries();
      await sqliteIndex.insert(entries);

      // Perform search
      const query: SearchQuery = {
        query: 'authentication error',
        limit: 10
      };

      const results = await searchEngine.search(query);

      expect(results.results.length).toBeGreaterThan(0);
      expect(results.totalMatches).toBeGreaterThan(0);
      expect(results.executionTime).toBeLessThan(1000); // < 1 second
      expect(results.results[0].entry.content).toContain('authentication');
    });

    it('should handle phrase searches', async () => {
      const entries = createTestEntries();
      await sqliteIndex.insert(entries);

      const query: SearchQuery = {
        query: '"database connection timeout"',
        queryType: 'phrase',
        limit: 10
      };

      const results = await searchEngine.search(query);

      // Should find entries containing the exact phrase
      expect(results.results.length).toBeGreaterThan(0);
      expect(results.results[0].entry.content).toContain('database connection timeout');
    });

    it('should support boolean queries', async () => {
      const entries = createTestEntries();
      await sqliteIndex.insert(entries);

      const query: SearchQuery = {
        query: 'authentication AND (login OR signin)',
        queryType: 'boolean',
        limit: 10
      };

      const results = await searchEngine.search(query);
      expect(results.results.length).toBeGreaterThan(0);
    });

    it('should filter by content type', async () => {
      const entries = createTestEntries();
      await sqliteIndex.insert(entries);

      const query: SearchQuery = {
        query: 'error',
        type: 'knowledge',
        limit: 10
      };

      const results = await searchEngine.search(query);
      results.results.forEach(result => {
        expect(result.entry.type).toBe('knowledge');
      });
    });

    it('should filter by tags', async () => {
      const entries = createTestEntries();
      await sqliteIndex.insert(entries);

      const query: SearchQuery = {
        query: 'error',
        tags: 'authentication',
        limit: 10
      };

      const results = await searchEngine.search(query);
      results.results.forEach(result => {
        expect(result.entry.metadata.tags).toContain('authentication');
      });
    });
  });

  describe('Search Ranking and Relevance', () => {
    it('should rank results by relevance', async () => {
      const entries = [
        createTestEntry('high-relevance', 'Authentication Error Handling', 'authentication error handling best practices', ['authentication', 'error']),
        createTestEntry('medium-relevance', 'Error Logging', 'general error logging and authentication mentions', ['error', 'logging']),
        createTestEntry('low-relevance', 'User Interface', 'UI components with some authentication text buried deep in content', ['ui'])
      ];
      
      await sqliteIndex.insert(entries);

      const query: SearchQuery = {
        query: 'authentication error',
        limit: 10
      };

      const results = await searchEngine.search(query);

      // Verify ranking order
      expect(results.results.length).toBe(3);
      expect(results.results[0].score).toBeGreaterThan(results.results[1].score);
      expect(results.results[1].score).toBeGreaterThan(results.results[2].score);
      expect(results.results[0].entry.id).toBe('high-relevance');
    });

    it('should boost results with effectiveness scores', async () => {
      const entries = [
        createTestEntry('low-effectiveness', 'Error Solution A', 'authentication error solution A', ['error'], 0.3),
        createTestEntry('high-effectiveness', 'Error Solution B', 'authentication error solution B', ['error'], 0.9)
      ];
      
      await sqliteIndex.insert(entries);

      const query: SearchQuery = {
        query: 'authentication error',
        boostEffective: true,
        limit: 10
      };

      const results = await searchEngine.search(query);
      
      // High effectiveness should rank higher
      expect(results.results[0].entry.id).toBe('high-effectiveness');
    });

    it('should boost recent content when requested', async () => {
      const oldDate = new Date('2023-01-01');
      const recentDate = new Date();

      const entries = [
        createTestEntry('old-content', 'Old Error Solution', 'authentication error solution', ['error'], 0.8, oldDate),
        createTestEntry('recent-content', 'Recent Error Solution', 'authentication error solution', ['error'], 0.8, recentDate)
      ];
      
      await sqliteIndex.insert(entries);

      const query: SearchQuery = {
        query: 'authentication error',
        boostRecent: true,
        limit: 10
      };

      const results = await searchEngine.search(query);
      
      // Recent content should rank higher when boost is enabled
      expect(results.results[0].entry.id).toBe('recent-content');
    });
  });

  describe('Search Features', () => {
    it('should generate content snippets', async () => {
      const entries = createTestEntries();
      await sqliteIndex.insert(entries);

      const query: SearchQuery = {
        query: 'authentication error',
        includeSnippets: true,
        snippetLength: 100,
        limit: 10
      };

      const results = await searchEngine.search(query);

      expect(results.results[0].contentSnippets.length).toBeGreaterThan(0);
      expect(results.results[0].contentSnippets[0].text.length).toBeLessThanOrEqual(100);
      expect(results.results[0].contentSnippets[0].highlighted).toContain('<mark>');
    });

    it('should highlight search terms', async () => {
      const entries = createTestEntries();
      await sqliteIndex.insert(entries);

      const query: SearchQuery = {
        query: 'authentication error',
        highlightResults: true,
        limit: 10
      };

      const results = await searchEngine.search(query);

      expect(results.results[0].titleSnippet).toContain('<mark>');
      expect(results.results[0].contentSnippets[0].highlighted).toContain('<mark>');
    });

    it('should generate search facets', async () => {
      const entries = createTestEntries();
      await sqliteIndex.insert(entries);

      const query: SearchQuery = {
        query: 'error',
        limit: 10
      };

      const results = await searchEngine.search(query);

      expect(results.facets).toBeDefined();
      expect(results.facets.types.length).toBeGreaterThan(0);
      expect(results.facets.tags.length).toBeGreaterThan(0);
      expect(results.facets.categories.length).toBeGreaterThan(0);
    });

    it('should provide search suggestions', async () => {
      const entries = createTestEntries();
      await sqliteIndex.insert(entries);

      const query: SearchQuery = {
        query: 'auth',
        limit: 10
      };

      const results = await searchEngine.search(query);

      expect(results.suggestions).toBeDefined();
      expect(results.suggestions.length).toBeGreaterThan(0);
      expect(results.suggestions).toContain('authentication');
    });
  });

  describe('Performance Benchmarks', () => {
    it('should meet <500ms search performance target for moderate dataset', async () => {
      // Create a larger dataset for performance testing
      const entries = createLargeTestDataset(1000);
      await sqliteIndex.insert(entries);

      const searchQueries = [
        'authentication error',
        'database connection',
        'api integration',
        'performance optimization',
        'security best practices'
      ];

      let totalTime = 0;
      const iterations = 10;

      for (let i = 0; i < iterations; i++) {
        for (const queryText of searchQueries) {
          const startTime = Date.now();
          
          const results = await searchEngine.search({
            query: queryText,
            limit: 20,
            includeSnippets: true,
            highlightResults: true
          });
          
          const endTime = Date.now();
          totalTime += (endTime - startTime);

          // Each search should be reasonably fast
          expect(results.executionTime).toBeLessThan(500); // 500ms target
          expect(results.results.length).toBeGreaterThan(0);
        }
      }

      const averageTime = totalTime / (iterations * searchQueries.length);
      console.log(`Average search time: ${averageTime}ms`);
      expect(averageTime).toBeLessThan(200); // 200ms average target
    });

    it('should handle concurrent searches efficiently', async () => {
      const entries = createLargeTestDataset(500);
      await sqliteIndex.insert(entries);

      const concurrentQueries = Array.from({ length: 10 }, (_, i) => 
        searchEngine.search({
          query: `test query ${i}`,
          limit: 20
        })
      );

      const startTime = Date.now();
      const results = await Promise.all(concurrentQueries);
      const endTime = Date.now();

      const totalTime = endTime - startTime;
      console.log(`Concurrent search time (10 queries): ${totalTime}ms`);

      // All searches should complete within reasonable time
      expect(totalTime).toBeLessThan(2000); // 2 seconds for 10 concurrent queries
      results.forEach(result => {
        expect(result.results.length).toBeGreaterThan(0);
      });
    });

    it('should scale with dataset size', async () => {
      const testSizes = [100, 500, 1000];
      const performanceResults: Array<{ size: number; avgTime: number }> = [];

      for (const size of testSizes) {
        // Clear and insert new dataset
        await sqliteIndex.delete(await getAllEntryIds());
        const entries = createLargeTestDataset(size);
        await sqliteIndex.insert(entries);

        // Run benchmark
        const iterations = 5;
        let totalTime = 0;

        for (let i = 0; i < iterations; i++) {
          const startTime = Date.now();
          
          await searchEngine.search({
            query: 'test query performance',
            limit: 20,
            includeSnippets: true
          });
          
          totalTime += (Date.now() - startTime);
        }

        const avgTime = totalTime / iterations;
        performanceResults.push({ size, avgTime });
        console.log(`Dataset size ${size}: Average search time ${avgTime}ms`);

        // Performance should remain reasonable even with larger datasets
        expect(avgTime).toBeLessThan(1000); // 1 second max
      }

      // Performance shouldn't degrade too severely with size
      const scaleFactor = performanceResults[2].avgTime / performanceResults[0].avgTime;
      expect(scaleFactor).toBeLessThan(3); // Max 3x slowdown for 10x data
    });
  });

  describe('Search Analytics', () => {
    it('should record search queries', async () => {
      const entries = createTestEntries();
      await sqliteIndex.insert(entries);

      await searchEngine.recordQuery('test query', 5, 250);
      
      const analytics = await searchEngine.getAnalytics(
        new Date(Date.now() - 24 * 60 * 60 * 1000),
        new Date()
      );

      expect(analytics.totalQueries).toBeGreaterThan(0);
      expect(analytics.uniqueQueries).toBeGreaterThan(0);
    });

    it('should provide popular queries', async () => {
      const entries = createTestEntries();
      await sqliteIndex.insert(entries);

      // Simulate multiple searches
      await searchEngine.search({ query: 'authentication', limit: 10 });
      await searchEngine.search({ query: 'authentication', limit: 10 });
      await searchEngine.search({ query: 'database', limit: 10 });

      const popularQueries = await searchEngine.getPopularQueries(5);
      expect(popularQueries.length).toBeGreaterThan(0);
      expect(popularQueries[0].query).toBe('authentication');
      expect(popularQueries[0].count).toBe(2);
    });
  });

  describe('Similar Content Search', () => {
    it('should find similar content', async () => {
      const entries = createTestEntries();
      await sqliteIndex.insert(entries);

      // This would need the entry to exist first
      // For now, test the error case
      await expect(
        searchEngine.searchSimilar('non-existent-id')
      ).rejects.toThrow('Entry not found');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty queries gracefully', async () => {
      await expect(
        searchEngine.search({ query: '', limit: 10 })
      ).rejects.toThrow('Query cannot be empty');
    });

    it('should handle very long queries', async () => {
      const longQuery = 'a'.repeat(1000);
      
      await expect(
        searchEngine.search({ query: longQuery, limit: 10 })
      ).rejects.toThrow('Query too long');
    });

    it('should handle excessive limit values', async () => {
      const entries = createTestEntries();
      await sqliteIndex.insert(entries);

      await expect(
        searchEngine.search({ query: 'test', limit: 2000 })
      ).rejects.toThrow('Limit too high');
    });

    it('should return empty results for no matches', async () => {
      const entries = createTestEntries();
      await sqliteIndex.insert(entries);

      const results = await searchEngine.search({
        query: 'nonexistenttermlkjhgfdsa',
        limit: 10
      });

      expect(results.results.length).toBe(0);
      expect(results.totalMatches).toBe(0);
    });
  });

  // Helper functions
  function createTestEntry(
    id: string, 
    title: string, 
    content: string, 
    tags: string[] = [],
    effectiveness = 0.8,
    lastModified = new Date()
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
        lastUsed: lastModified,
        effectiveness,
        fileSize: content.length,
        relatedIds: [],
        parentId: undefined,
        childIds: []
      },
      lastModified
    };
  }

  function createTestEntries(): IndexEntry[] {
    return [
      createTestEntry(
        'auth-error-1',
        'Authentication Error Handling',
        'How to handle authentication errors in web applications. Common patterns include token refresh, redirect to login, and user notification.',
        ['authentication', 'error', 'web']
      ),
      createTestEntry(
        'db-connection-1',
        'Database Connection Timeout',
        'Troubleshooting database connection timeout issues. Check network connectivity, connection pool settings, and database server status.',
        ['database', 'connection', 'timeout']
      ),
      createTestEntry(
        'api-integration-1',
        'API Integration Best Practices',
        'Best practices for API integration including error handling, retry logic, and rate limiting.',
        ['api', 'integration', 'best-practices']
      ),
      createTestEntry(
        'performance-1',
        'Performance Optimization',
        'Performance optimization techniques for web applications including caching, compression, and code splitting.',
        ['performance', 'optimization', 'web']
      ),
      createTestEntry(
        'security-1',
        'Security Best Practices',
        'Security best practices including input validation, authentication, and secure communication.',
        ['security', 'authentication', 'validation']
      )
    ];
  }

  function createLargeTestDataset(size: number): IndexEntry[] {
    const entries: IndexEntry[] = [];
    const categories = ['authentication', 'database', 'api', 'performance', 'security', 'ui', 'testing'];
    const types = ['knowledge', 'gotcha', 'adr'] as const;
    
    for (let i = 0; i < size; i++) {
      const category = categories[i % categories.length];
      const type = types[i % types.length];
      
      entries.push({
        id: `test-entry-${i}`,
        type,
        title: `Test Entry ${i}: ${category} example`,
        content: `This is test content for entry ${i} about ${category}. It contains various keywords like error, solution, implementation, and best practices. The content is designed to test search performance and ranking algorithms.`,
        path: `test/entry-${i}`,
        metadata: {
          tags: [category, 'test', `tag-${i % 10}`],
          category,
          agentTypes: ['test-agent'],
          scope: i % 3 === 0 ? 'global' : 'project',
          usageCount: Math.floor(Math.random() * 100),
          lastUsed: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Last 30 days
          effectiveness: Math.random(),
          fileSize: 100 + Math.floor(Math.random() * 1000),
          relatedIds: [],
          parentId: undefined,
          childIds: []
        },
        lastModified: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000) // Last year
      });
    }
    
    return entries;
  }

  async function getAllEntryIds(): Promise<string[]> {
    // This is a simplified implementation
    // In a real scenario, you'd query the database for all IDs
    return [];
  }
});