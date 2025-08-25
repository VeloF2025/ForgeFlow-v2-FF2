// Performance Benchmarks - Validates search performance requirements
// Tests the <500ms search performance target for 50k+ files

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync, existsSync } from 'fs';
import { ForgeFlowIndexManager } from '../index-manager.js';
import { IndexConfig, IndexEntry } from '../types.js';

describe('Index Layer Performance Benchmarks', () => {
  let indexManager: ForgeFlowIndexManager;
  let config: IndexConfig;
  let testDbPath: string;

  beforeAll(async () => {
    testDbPath = join(tmpdir(), 'ff2-performance-test.db');
    if (existsSync(testDbPath)) {
      rmSync(testDbPath);
    }

    config = {
      databasePath: testDbPath,
      maxDatabaseSize: 500 * 1024 * 1024, // 500MB for large dataset
      tokenizer: 'porter',
      removeAccents: true,
      caseSensitive: false,
      cacheSize: 5000, // Larger cache for performance
      synchronous: 'normal',
      journalMode: 'wal',
      batchSize: 500, // Larger batches for performance
      maxContentLength: 50000,
      enableVectorIndex: false,
      autoVacuum: false, // Disable for performance testing
      vacuumThreshold: 50,
      retentionDays: 90,
      defaultLimit: 20,
      maxLimit: 1000,
      snippetLength: 150,
      maxSnippets: 5
    };

    indexManager = new ForgeFlowIndexManager(config);
    await indexManager.initialize();
  }, 30000); // 30 second timeout for setup

  afterAll(async () => {
    await indexManager.shutdown();
    if (existsSync(testDbPath)) {
      rmSync(testDbPath);
    }
  });

  describe('Indexing Performance', () => {
    it('should index 10k entries in under 60 seconds', async () => {
      const entries = createLargeDataset(10000);
      
      const startTime = Date.now();
      await indexManager.indexContent(entries);
      const endTime = Date.now();

      const indexTime = endTime - startTime;
      const entriesPerSecond = entries.length / (indexTime / 1000);

      console.log(`\n📊 Indexing Performance (10k entries):`);
      console.log(`  Total time: ${indexTime}ms (${(indexTime / 1000).toFixed(2)}s)`);
      console.log(`  Entries/second: ${entriesPerSecond.toFixed(2)}`);
      console.log(`  Average time per entry: ${(indexTime / entries.length).toFixed(2)}ms`);

      expect(indexTime).toBeLessThan(60000); // 60 seconds
      expect(entriesPerSecond).toBeGreaterThan(100); // Target: >100 entries/second

      const stats = await indexManager.getStats();
      expect(stats.totalEntries).toBe(10000);
    }, 120000); // 2 minute timeout

    it('should handle batch indexing efficiently', async () => {
      await clearIndex();
      
      const batchSizes = [100, 500, 1000];
      const performanceResults: Array<{ batchSize: number; entriesPerSecond: number }> = [];

      for (const batchSize of batchSizes) {
        await clearIndex();
        
        const entries = createLargeDataset(5000);
        const originalBatchSize = config.batchSize;
        config.batchSize = batchSize;

        const startTime = Date.now();
        await indexManager.indexContent(entries);
        const endTime = Date.now();

        const indexTime = endTime - startTime;
        const entriesPerSecond = entries.length / (indexTime / 1000);
        performanceResults.push({ batchSize, entriesPerSecond });

        console.log(`\n📊 Batch Size ${batchSize}: ${entriesPerSecond.toFixed(2)} entries/second`);
        
        config.batchSize = originalBatchSize;
      }

      // Larger batch sizes should generally perform better
      const bestPerformance = Math.max(...performanceResults.map(r => r.entriesPerSecond));
      expect(bestPerformance).toBeGreaterThan(150);
    }, 180000); // 3 minute timeout
  });

  describe('Search Performance - Core Requirement Tests', () => {
    beforeAll(async () => {
      // Index a large dataset for search testing
      await clearIndex();
      console.log('\n🔄 Setting up large dataset for search performance tests...');
      
      const startTime = Date.now();
      const largeDataset = createLargeDataset(50000); // 50k entries
      await indexManager.indexContent(largeDataset);
      const endTime = Date.now();

      console.log(`✅ Indexed ${largeDataset.length} entries in ${(endTime - startTime) / 1000}s`);
    }, 300000); // 5 minute timeout

    it('should achieve <500ms search performance for 50k entries (CORE REQUIREMENT)', async () => {
      const searchEngine = indexManager.getSearchEngine();
      const testQueries = [
        'authentication error',
        'database connection timeout',
        'api integration best practices',
        'performance optimization techniques',
        'security vulnerability assessment',
        'deployment configuration',
        'testing strategy',
        'code review process',
        'monitoring and alerting',
        'scalability patterns'
      ];

      let totalSearchTime = 0;
      let maxSearchTime = 0;
      let minSearchTime = Infinity;
      const searchTimes: number[] = [];

      console.log('\n🎯 Core Performance Requirement Test: <500ms search for 50k entries');
      console.log('─────────────────────────────────────────────────────────────');

      for (const query of testQueries) {
        const startTime = Date.now();
        
        const results = await searchEngine.search({
          query,
          limit: 20,
          includeSnippets: true,
          highlightResults: true
        });
        
        const searchTime = Date.now() - startTime;
        searchTimes.push(searchTime);
        totalSearchTime += searchTime;
        maxSearchTime = Math.max(maxSearchTime, searchTime);
        minSearchTime = Math.min(minSearchTime, searchTime);

        console.log(`  "${query}": ${searchTime}ms (${results.totalMatches} results)`);

        // CORE REQUIREMENT: Each search must be <500ms
        expect(searchTime).toBeLessThan(500); // 500ms requirement
        expect(results.results.length).toBeGreaterThan(0);
      }

      const avgSearchTime = totalSearchTime / testQueries.length;
      const p95SearchTime = calculatePercentile(searchTimes, 95);
      const p99SearchTime = calculatePercentile(searchTimes, 99);

      console.log('\n📈 Search Performance Summary:');
      console.log(`  Average: ${avgSearchTime.toFixed(2)}ms`);
      console.log(`  Min: ${minSearchTime}ms`);
      console.log(`  Max: ${maxSearchTime}ms`);
      console.log(`  P95: ${p95SearchTime}ms`);
      console.log(`  P99: ${p99SearchTime}ms`);
      console.log(`  Requirement: <500ms per search ✅`);

      // Additional performance targets
      expect(avgSearchTime).toBeLessThan(250); // Target: <250ms average
      expect(p95SearchTime).toBeLessThan(400); // Target: P95 <400ms
      expect(maxSearchTime).toBeLessThan(500); // Hard requirement: no search >500ms
    }, 60000); // 1 minute timeout

    it('should maintain performance under concurrent load', async () => {
      const searchEngine = indexManager.getSearchEngine();
      const concurrentQueries = 20;
      const queriesPerUser = 5;

      console.log(`\n🚀 Concurrent Load Test: ${concurrentQueries} simultaneous users`);

      const queries = [
        'error handling patterns',
        'database optimization',
        'security best practices',
        'api design guidelines',
        'performance monitoring'
      ];

      // Simulate concurrent users
      const userSessions = Array.from({ length: concurrentQueries }, async (_, userId) => {
        const userSearchTimes: number[] = [];
        
        for (let i = 0; i < queriesPerUser; i++) {
          const query = queries[i % queries.length];
          const startTime = Date.now();
          
          const results = await searchEngine.search({
            query,
            limit: 20,
            includeSnippets: true
          });
          
          const searchTime = Date.now() - startTime;
          userSearchTimes.push(searchTime);
          
          // Each search should still meet performance requirement
          expect(searchTime).toBeLessThan(1000); // Relaxed under load
          expect(results.results.length).toBeGreaterThan(0);
        }
        
        return userSearchTimes;
      });

      const startTime = Date.now();
      const allUserResults = await Promise.all(userSessions);
      const totalTime = Date.now() - startTime;

      const allSearchTimes = allUserResults.flat();
      const avgSearchTime = allSearchTimes.reduce((a, b) => a + b, 0) / allSearchTimes.length;
      const maxSearchTime = Math.max(...allSearchTimes);
      const totalQueries = concurrentQueries * queriesPerUser;
      const queriesPerSecond = totalQueries / (totalTime / 1000);

      console.log(`\n📊 Concurrent Performance Results:`);
      console.log(`  Total queries: ${totalQueries}`);
      console.log(`  Total time: ${totalTime}ms`);
      console.log(`  Queries/second: ${queriesPerSecond.toFixed(2)}`);
      console.log(`  Average search time: ${avgSearchTime.toFixed(2)}ms`);
      console.log(`  Max search time: ${maxSearchTime}ms`);

      // Performance under load
      expect(avgSearchTime).toBeLessThan(800); // Average <800ms under load
      expect(maxSearchTime).toBeLessThan(2000); // Max <2s under load
      expect(queriesPerSecond).toBeGreaterThan(10); // >10 queries/second throughput
    }, 120000); // 2 minute timeout

    it('should scale efficiently with dataset growth', async () => {
      const searchEngine = indexManager.getSearchEngine();
      
      // Test search performance after adding more data
      console.log('\n📈 Scaling Test: Adding more entries to existing dataset');
      
      const additionalEntries = createLargeDataset(25000, 'scale-test'); // Add 25k more
      
      const indexStartTime = Date.now();
      await indexManager.indexContent(additionalEntries);
      const indexEndTime = Date.now();
      
      const indexTime = indexEndTime - indexStartTime;
      console.log(`  Indexed additional 25k entries in ${indexTime}ms`);
      
      const stats = await indexManager.getStats();
      console.log(`  Total entries now: ${stats.totalEntries}`);
      expect(stats.totalEntries).toBe(75000); // 50k + 25k
      
      // Test search performance on larger dataset
      const testQueries = [
        'authentication error handling',
        'database performance tuning',
        'api security validation'
      ];
      
      const searchTimes: number[] = [];
      
      for (const query of testQueries) {
        const startTime = Date.now();
        const results = await searchEngine.search({
          query,
          limit: 20,
          includeSnippets: true
        });
        const searchTime = Date.now() - startTime;
        searchTimes.push(searchTime);
        
        console.log(`  "${query}": ${searchTime}ms (${results.totalMatches} results)`);
        
        // Should still meet performance requirement with larger dataset
        expect(searchTime).toBeLessThan(600); // Slightly relaxed for 75k entries
        expect(results.results.length).toBeGreaterThan(0);
      }
      
      const avgSearchTime = searchTimes.reduce((a, b) => a + b, 0) / searchTimes.length;
      console.log(`  Average search time with 75k entries: ${avgSearchTime.toFixed(2)}ms`);
      
      expect(avgSearchTime).toBeLessThan(400); // Should remain reasonable
    }, 180000); // 3 minute timeout
  });

  describe('Memory and Resource Usage', () => {
    it('should maintain reasonable memory usage during large operations', async () => {
      const initialMemory = process.memoryUsage();
      
      // Perform memory-intensive operations
      await clearIndex();
      const largeDataset = createLargeDataset(20000);
      await indexManager.indexContent(largeDataset);
      
      // Perform multiple searches
      const searchEngine = indexManager.getSearchEngine();
      for (let i = 0; i < 100; i++) {
        await searchEngine.search({
          query: `test query ${i}`,
          limit: 50,
          includeSnippets: true
        });
      }
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryMB = memoryIncrease / (1024 * 1024);
      
      console.log(`\n💾 Memory Usage Analysis:`);
      console.log(`  Initial heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  Final heap: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  Memory increase: ${memoryMB.toFixed(2)}MB`);
      
      // Memory increase should be reasonable for 20k entries
      expect(memoryMB).toBeLessThan(200); // <200MB increase
    });

    it('should handle disk space efficiently', async () => {
      const stats = await indexManager.getStats();
      const entriesCount = stats.totalEntries;
      const dbSize = stats.databaseSize;
      const bytesPerEntry = dbSize / entriesCount;
      
      console.log(`\n💽 Disk Usage Analysis:`);
      console.log(`  Entries: ${entriesCount.toLocaleString()}`);
      console.log(`  Database size: ${(dbSize / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  Bytes per entry: ${bytesPerEntry.toFixed(2)}`);
      
      // Database should be reasonably sized
      expect(bytesPerEntry).toBeLessThan(10000); // <10KB per entry average
      expect(dbSize).toBeLessThan(config.maxDatabaseSize);
    });
  });

  describe('Performance Under Stress', () => {
    it('should maintain performance during maintenance operations', async () => {
      const searchEngine = indexManager.getSearchEngine();
      
      // Start a vacuum operation (maintenance)
      const vacuumPromise = indexManager.vacuum();
      
      // Perform searches during vacuum
      const searchPromises = Array.from({ length: 10 }, (_, i) =>
        searchEngine.search({
          query: `concurrent search ${i}`,
          limit: 20
        })
      );
      
      const startTime = Date.now();
      const [vacuumResult, ...searchResults] = await Promise.all([
        vacuumPromise,
        ...searchPromises
      ]);
      const endTime = Date.now();
      
      console.log(`\n🔧 Performance During Maintenance:`);
      console.log(`  Vacuum completed: ${vacuumResult.vacuumPerformed}`);
      console.log(`  Concurrent operations time: ${endTime - startTime}ms`);
      console.log(`  Searches completed: ${searchResults.length}`);
      
      // All operations should complete successfully
      expect(vacuumResult.vacuumPerformed).toBe(true);
      searchResults.forEach(result => {
        expect(result.results).toBeDefined();
      });
    });
  });

  // Helper functions
  async function clearIndex(): Promise<void> {
    try {
      await indexManager.cleanup(0);
    } catch {
      // Ignore errors - index might be empty
    }
  }

  function createLargeDataset(size: number, prefix = 'perf'): IndexEntry[] {
    const entries: IndexEntry[] = [];
    const categories = [
      'authentication', 'database', 'api', 'performance', 'security', 
      'ui', 'testing', 'deployment', 'monitoring', 'scalability'
    ];
    const types = ['knowledge', 'gotcha', 'adr'] as const;
    const difficulties = ['low', 'medium', 'high'] as const;
    const scopes = ['global', 'project'] as const;

    console.log(`  Generating ${size.toLocaleString()} test entries...`);
    
    for (let i = 0; i < size; i++) {
      const category = categories[i % categories.length];
      const type = types[i % types.length];
      const difficulty = difficulties[i % difficulties.length];
      const scope = scopes[i % scopes.length];
      
      // Create realistic content with varying lengths
      const baseContent = `This is ${type} content for entry ${i} about ${category}. `;
      const contentVariations = [
        'It contains detailed information about implementation patterns and best practices.',
        'Common issues include configuration problems, integration challenges, and performance bottlenecks.',
        'The solution involves careful analysis of requirements, proper architecture design, and thorough testing.',
        'Key considerations include security implications, scalability requirements, and maintainability aspects.',
        'Implementation requires understanding of the underlying technology, proper error handling, and monitoring.'
      ];
      
      const content = baseContent + contentVariations[i % contentVariations.length].repeat(1 + (i % 5));
      
      entries.push({
        id: `${prefix}-entry-${i}`,
        type,
        title: `${category} ${type} example ${i}`,
        content,
        path: `test/${prefix}/entry-${i}`,
        metadata: {
          tags: [category, type, `tag-${i % 20}`],
          category,
          agentTypes: ['test-agent', 'performance-agent'],
          difficulty,
          scope,
          usageCount: Math.floor(Math.random() * 1000),
          lastUsed: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
          effectiveness: Math.random(),
          fileSize: content.length,
          relatedIds: [],
          parentId: i > 0 && i % 10 === 0 ? `${prefix}-entry-${i - 10}` : undefined,
          childIds: []
        },
        lastModified: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000)
      });
      
      // Progress indicator for large datasets
      if (i > 0 && i % 10000 === 0) {
        console.log(`    Generated ${i.toLocaleString()} / ${size.toLocaleString()} entries...`);
      }
    }
    
    return entries;
  }

  function calculatePercentile(values: number[], percentile: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
});