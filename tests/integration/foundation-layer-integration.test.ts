// Foundation Layer Integration Test Suite
// Comprehensive validation of Knowledge ↔ Memory ↔ CLI integration

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import { MemoryManager, createMemoryLayer, testMemoryConfig } from '../../src/memory';
import { KnowledgeManager, initializeKnowledgeSystem, createKnowledgeConfig } from '../../src/knowledge';
import type { 
  JobMemory, 
  Decision, 
  Gotcha, 
  ContextEntry, 
  Outcome,
  MemoryConfig,
  KnowledgeConfig
} from '../../src/types';

describe('Foundation Layer Integration', () => {
  let memoryManager: MemoryManager;
  let knowledgeManager: KnowledgeManager;
  let testBasePath: string;
  let knowledgeBasePath: string;
  let memoryBasePath: string;

  // Test configuration for isolated testing
  const testConfig: MemoryConfig = {
    ...testMemoryConfig,
    storageBasePath: '.ff2/test-integration/memory',
    autoPromoteGotchas: true // Enable for integration testing
  };

  const knowledgeTestConfig: KnowledgeConfig = {
    ...createKnowledgeConfig('.ff2/test-integration/knowledge'),
    gotchaPromotionThreshold: 2, // Lower threshold for testing
    autoPromoteGotchas: true
  };

  beforeAll(async () => {
    // Setup test directories
    testBasePath = path.resolve('.ff2/test-integration');
    memoryBasePath = path.resolve(testConfig.storageBasePath);
    knowledgeBasePath = path.resolve(knowledgeTestConfig.storageBasePath);

    // Clean up any existing test data
    await cleanup();

    // Initialize Knowledge system first (Memory depends on it)
    knowledgeManager = await initializeKnowledgeSystem(knowledgeTestConfig);
    
    // Initialize Memory system with Knowledge integration
    memoryManager = await createMemoryLayer(testConfig, knowledgeManager);
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    // Clean state between tests
    await cleanup();
    
    // Re-initialize systems
    knowledgeManager = await initializeKnowledgeSystem(knowledgeTestConfig);
    memoryManager = await createMemoryLayer(testConfig, knowledgeManager);
  });

  afterEach(async () => {
    // Ensure clean state
    await cleanup();
  });

  async function cleanup() {
    try {
      await fs.rm(testBasePath, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  }

  describe('Knowledge ↔ Memory Integration', () => {
    it('should auto-promote high-severity gotchas from Memory to Knowledge', async () => {
      const issueId = 'test-issue-001';
      const sessionId = 'test-session-001';

      // Initialize job memory
      const jobMemory = await memoryManager.initializeJobMemory(issueId, sessionId);

      // Record a critical gotcha
      const gotcha: Omit<Gotcha, 'id' | 'timestamp'> = {
        agentType: 'code-implementer',
        severity: 'critical',
        category: 'build-error',
        description: 'TypeScript compiler error: Property \'nonExistent\' does not exist on type',
        errorPattern: /Property\s+'[\w]+'\s+does\s+not\s+exist\s+on\s+type/,
        errorDetails: {
          file: 'src/components/test.ts',
          line: 42,
          column: 15,
          stackTrace: 'Error at line 42...'
        },
        context: 'Building component with new interface'
      };

      const recordedGotcha = await memoryManager.recordGotcha(jobMemory.jobId, gotcha);

      // Resolve the gotcha
      const resolution = {
        resolved: true,
        solution: 'Add proper type definition for the property',
        resolutionTime: 120000, // 2 minutes
        confidence: 0.95,
        preventionSteps: [
          'Use strict TypeScript configuration',
          'Implement comprehensive type checking'
        ],
        resolvedBy: 'code-implementer',
        verificationSteps: ['Compile successfully', 'Tests pass']
      };

      await memoryManager.resolveGotcha(jobMemory.jobId, recordedGotcha.id, resolution);

      // Complete job memory to trigger auto-promotion
      const outcome: Outcome = {
        agentType: 'code-implementer',
        type: 'success',
        category: 'implementation',
        description: 'Component implementation completed successfully',
        metadata: {
          linesOfCode: 150,
          testsAdded: 5,
          coverage: 95
        }
      };

      await memoryManager.completeJobMemory(jobMemory.jobId, outcome);

      // Verify gotcha was promoted to Knowledge
      const knowledgeStats = await knowledgeManager.getStats();
      expect(knowledgeStats.gotchas.total).toBeGreaterThan(0);

      // Search for the promoted gotcha
      const searchResults = await knowledgeManager.searchCards({
        query: 'TypeScript compiler error',
        categories: ['build-error'],
        limit: 10
      });

      expect(searchResults.cards.length).toBeGreaterThan(0);
      const promotedCard = searchResults.cards.find(card => 
        card.title.includes('TypeScript') && card.category === 'build-error'
      );
      expect(promotedCard).toBeDefined();
    });

    it('should track knowledge usage in memory analytics', async () => {
      const issueId = 'test-issue-002';
      const sessionId = 'test-session-002';

      // Create a knowledge card first
      const knowledgeCard = await knowledgeManager.createCard({
        title: 'Database Connection Pattern',
        category: 'architecture',
        type: 'pattern',
        content: 'Standard database connection implementation pattern',
        tags: ['database', 'connection', 'pattern'],
        effectiveness: 0.9,
        applicabilityScore: 0.8,
        metadata: {
          author: 'system',
          priority: 'high',
          outcomes: []
        }
      });

      // Initialize job memory
      const jobMemory = await memoryManager.initializeJobMemory(issueId, sessionId);

      // Record context referencing the knowledge card
      const context: Omit<ContextEntry, 'id' | 'timestamp' | 'usage'> = {
        agentType: 'system-architect',
        type: 'knowledge-card',
        source: `knowledge:${knowledgeCard.id}`,
        content: 'Using database connection pattern from knowledge base',
        relevanceScore: 0.95
      };

      const recordedContext = await memoryManager.recordContext(jobMemory.jobId, context);

      // Record decision using the context
      const decision: Omit<Decision, 'id' | 'timestamp'> = {
        agentType: 'system-architect',
        category: 'architecture',
        description: 'Implement database connection using established pattern',
        reasoning: 'Following proven pattern for consistency and reliability',
        confidence: 0.9,
        alternatives: ['Custom connection pool', 'Third-party ORM'],
        riskAssessment: 'Low risk with established pattern',
        contextIds: [recordedContext.id]
      };

      const recordedDecision = await memoryManager.recordDecision(jobMemory.jobId, decision);

      // Track context usage
      await memoryManager.trackContextUsage(jobMemory.jobId, recordedContext.id, {
        decisionId: recordedDecision.id,
        impact: 0.8,
        outcome: 'positive'
      });

      // Complete job memory
      const outcome: Outcome = {
        agentType: 'system-architect',
        type: 'success',
        category: 'architecture',
        description: 'Database architecture implemented successfully',
        metadata: { patternUsed: knowledgeCard.id }
      };

      await memoryManager.completeJobMemory(jobMemory.jobId, outcome);

      // Verify knowledge card usage was tracked
      const updatedCard = await knowledgeManager.getCard(knowledgeCard.id);
      expect(updatedCard).toBeDefined();
      expect(updatedCard!.usageCount).toBe(1);
      expect(updatedCard!.lastUsed).toBeDefined();

      // Verify memory analytics include knowledge usage
      const insights = await memoryManager.getMemoryInsights(jobMemory.jobId);
      expect(insights.contextUsage.length).toBeGreaterThan(0);
      expect(insights.contextUsage[0].source).toContain(knowledgeCard.id);
    });

    it('should maintain data consistency across concurrent operations', async () => {
      const issueId = 'test-issue-003';
      const sessionIds = ['session-001', 'session-002', 'session-003'];

      // Initialize multiple job memories concurrently
      const jobPromises = sessionIds.map(sessionId =>
        memoryManager.initializeJobMemory(issueId, sessionId)
      );

      const jobMemories = await Promise.all(jobPromises);
      expect(jobMemories).toHaveLength(3);

      // Record gotchas concurrently
      const gotchaPromises = jobMemories.map((jobMemory, index) =>
        memoryManager.recordGotcha(jobMemory.jobId, {
          agentType: 'test-coverage-validator',
          severity: 'high',
          category: 'test-failure',
          description: `Test failure in concurrent job ${index}`,
          errorPattern: /Test failed for job \d+/,
          errorDetails: { testSuite: `suite-${index}` },
          context: `Concurrent testing job ${index}`
        })
      );

      const recordedGotchas = await Promise.all(gotchaPromises);
      expect(recordedGotchas).toHaveLength(3);

      // Verify all gotchas are unique and properly stored
      const allJobIds = new Set(recordedGotchas.map(g => g.id));
      expect(allJobIds.size).toBe(3); // All unique

      // Complete all jobs concurrently
      const completionPromises = jobMemories.map(jobMemory =>
        memoryManager.completeJobMemory(jobMemory.jobId, {
          agentType: 'test-coverage-validator',
          type: 'partial-success',
          category: 'testing',
          description: 'Test suite completed with some failures',
          metadata: { testsPassed: 85, testsTotal: 100 }
        })
      );

      await Promise.all(completionPromises);

      // Verify all jobs are completed
      for (const jobMemory of jobMemories) {
        const completedMemory = await memoryManager.getJobMemory(jobMemory.jobId);
        expect(completedMemory?.status).toBe('completed');
        expect(completedMemory?.finalOutcome).toBeDefined();
      }
    });
  });

  describe('Performance Integration Testing', () => {
    it('should meet performance targets for integrated operations', async () => {
      const issueId = 'test-performance-001';
      const sessionId = 'test-performance-session';

      // Test job memory initialization performance
      const initStartTime = Date.now();
      const jobMemory = await memoryManager.initializeJobMemory(issueId, sessionId);
      const initDuration = Date.now() - initStartTime;
      
      expect(initDuration).toBeLessThan(testConfig.performanceThresholds.memoryOperationTimeMs);

      // Test knowledge card creation performance
      const cardStartTime = Date.now();
      const knowledgeCard = await knowledgeManager.createCard({
        title: 'Performance Test Pattern',
        category: 'performance',
        type: 'pattern',
        content: 'Performance testing pattern content',
        tags: ['performance', 'testing'],
        effectiveness: 0.85,
        applicabilityScore: 0.9,
        metadata: {
          author: 'performance-test',
          priority: 'medium',
          outcomes: []
        }
      });
      const cardDuration = Date.now() - cardStartTime;
      
      expect(cardDuration).toBeLessThan(100); // Target: <100ms for knowledge operations

      // Test integrated operation performance (record + search)
      const integratedStartTime = Date.now();
      
      // Record decision
      await memoryManager.recordDecision(jobMemory.jobId, {
        agentType: 'performance-optimizer',
        category: 'optimization',
        description: 'Apply performance optimization pattern',
        reasoning: 'Using established performance pattern',
        confidence: 0.85,
        alternatives: ['Custom optimization'],
        riskAssessment: 'Low risk'
      });

      // Search knowledge for related patterns
      const searchResults = await knowledgeManager.searchCards({
        query: 'performance',
        limit: 5
      });

      const integratedDuration = Date.now() - integratedStartTime;
      expect(integratedDuration).toBeLessThan(200); // Target: <200ms for complex operations
      expect(searchResults.cards.length).toBeGreaterThan(0);
    });

    it('should handle large datasets efficiently', async () => {
      const largeDatasetStartTime = Date.now();

      // Create multiple knowledge cards
      const cardPromises: Promise<any>[] = [];
      for (let i = 0; i < 50; i++) {
        cardPromises.push(
          knowledgeManager.createCard({
            title: `Large Dataset Card ${i}`,
            category: 'test-data',
            type: 'pattern',
            content: `Test pattern content for card ${i}`,
            tags: ['large-dataset', 'test', `card-${i}`],
            effectiveness: 0.7 + (i % 3) * 0.1,
            applicabilityScore: 0.6 + (i % 4) * 0.1,
            metadata: {
              author: 'test-system',
              priority: i % 2 === 0 ? 'high' : 'medium',
              outcomes: []
            }
          })
        );
      }

      const cards = await Promise.all(cardPromises);
      expect(cards).toHaveLength(50);

      // Create multiple job memories
      const jobPromises: Promise<any>[] = [];
      for (let i = 0; i < 20; i++) {
        jobPromises.push(
          memoryManager.initializeJobMemory(`large-test-${i}`, `session-${i}`)
        );
      }

      const jobs = await Promise.all(jobPromises);
      expect(jobs).toHaveLength(20);

      const largeDatasetDuration = Date.now() - largeDatasetStartTime;
      
      // Should handle 50 cards + 20 jobs in reasonable time
      expect(largeDatasetDuration).toBeLessThan(5000); // 5 seconds for large dataset

      // Test search performance with large dataset
      const searchStartTime = Date.now();
      const searchResults = await knowledgeManager.searchCards({
        query: 'Large Dataset',
        limit: 10
      });
      const searchDuration = Date.now() - searchStartTime;

      expect(searchDuration).toBeLessThan(500); // <500ms for search in large dataset
      expect(searchResults.cards.length).toBe(10); // Should return limit
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle knowledge system unavailable gracefully', async () => {
      // Create memory manager without knowledge integration
      const memoryOnlyConfig: MemoryConfig = {
        ...testConfig,
        storageBasePath: '.ff2/test-integration/memory-only',
        autoPromoteGotchas: true // Should handle gracefully when knowledge unavailable
      };

      const memoryOnlyManager = await createMemoryLayer(memoryOnlyConfig);
      const jobMemory = await memoryOnlyManager.initializeJobMemory('test-001', 'session-001');

      // Record and resolve a gotcha (should not fail without knowledge system)
      const gotcha = await memoryOnlyManager.recordGotcha(jobMemory.jobId, {
        agentType: 'test-agent',
        severity: 'critical',
        category: 'test-error',
        description: 'Test error without knowledge system',
        errorPattern: /test error/,
        errorDetails: {},
        context: 'Testing without knowledge'
      });

      await memoryOnlyManager.resolveGotcha(jobMemory.jobId, gotcha.id, {
        resolved: true,
        solution: 'Test solution',
        resolutionTime: 1000,
        confidence: 0.9,
        preventionSteps: [],
        resolvedBy: 'test-agent',
        verificationSteps: []
      });

      // Should complete without throwing errors
      const finalOutcome: Outcome = {
        agentType: 'test-agent',
        type: 'success',
        category: 'test',
        description: 'Test completed without knowledge system',
        metadata: {}
      };

      const completedMemory = await memoryOnlyManager.completeJobMemory(jobMemory.jobId, finalOutcome);
      expect(completedMemory.status).toBe('completed');
    });

    it('should handle corrupted data gracefully', async () => {
      const issueId = 'test-corruption-001';
      const sessionId = 'test-corruption-session';

      // Initialize job memory
      const jobMemory = await memoryManager.initializeJobMemory(issueId, sessionId);

      // Simulate corruption by trying to access non-existent job
      const nonExistentMemory = await memoryManager.getJobMemory('non-existent-job');
      expect(nonExistentMemory).toBeNull();

      // Try to update non-existent job (should throw meaningful error)
      await expect(
        memoryManager.updateJobMemory('non-existent-job', { status: 'in-progress' })
      ).rejects.toThrow(/not found/i);

      // Try to resolve non-existent gotcha (should throw meaningful error)
      await expect(
        memoryManager.resolveGotcha(jobMemory.jobId, 'non-existent-gotcha', {
          resolved: true,
          solution: 'test',
          resolutionTime: 1000,
          confidence: 0.9,
          preventionSteps: [],
          resolvedBy: 'test',
          verificationSteps: []
        })
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('Data Consistency Validation', () => {
    it('should maintain referential integrity across components', async () => {
      const issueId = 'test-integrity-001';
      const sessionId = 'test-integrity-session';

      // Create knowledge card
      const knowledgeCard = await knowledgeManager.createCard({
        title: 'Integrity Test Pattern',
        category: 'integrity',
        type: 'pattern',
        content: 'Data integrity test pattern',
        tags: ['integrity', 'test'],
        effectiveness: 0.9,
        applicabilityScore: 0.8,
        metadata: {
          author: 'integrity-test',
          priority: 'high',
          outcomes: []
        }
      });

      // Initialize job memory
      const jobMemory = await memoryManager.initializeJobMemory(issueId, sessionId);

      // Record context referencing knowledge card
      const context = await memoryManager.recordContext(jobMemory.jobId, {
        agentType: 'integrity-tester',
        type: 'knowledge-card',
        source: `knowledge:${knowledgeCard.id}`,
        content: 'Referencing integrity pattern',
        relevanceScore: 0.9
      });

      // Record decision using context
      const decision = await memoryManager.recordDecision(jobMemory.jobId, {
        agentType: 'integrity-tester',
        category: 'implementation',
        description: 'Implement using integrity pattern',
        reasoning: 'Following established integrity pattern',
        confidence: 0.85,
        alternatives: [],
        riskAssessment: 'Low risk',
        contextIds: [context.id]
      });

      // Verify relationships are maintained
      const updatedMemory = await memoryManager.getJobMemory(jobMemory.jobId);
      expect(updatedMemory?.contexts).toHaveLength(1);
      expect(updatedMemory?.decisions).toHaveLength(1);
      expect(updatedMemory?.decisions[0].contextIds).toContain(context.id);

      // Verify knowledge card usage tracked
      const updatedCard = await knowledgeManager.getCard(knowledgeCard.id);
      expect(updatedCard?.usageCount).toBeGreaterThan(0);

      // Complete job and verify all relationships intact
      await memoryManager.completeJobMemory(jobMemory.jobId, {
        agentType: 'integrity-tester',
        type: 'success',
        category: 'implementation',
        description: 'Integrity test completed',
        metadata: { usedPattern: knowledgeCard.id }
      });

      const finalMemory = await memoryManager.getJobMemory(jobMemory.jobId);
      expect(finalMemory?.status).toBe('completed');
      expect(finalMemory?.contexts).toHaveLength(1);
      expect(finalMemory?.decisions).toHaveLength(1);
      expect(finalMemory?.finalOutcome?.metadata.usedPattern).toBe(knowledgeCard.id);
    });
  });
});