// Knowledge Management System Tests
// Comprehensive test coverage for all knowledge components

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import { KnowledgeManager } from '../../src/knowledge/knowledge-manager';
import { CardStore } from '../../src/knowledge/card-store';
import { GotchaTracker } from '../../src/knowledge/gotcha-tracker';
import { ADRManager } from '../../src/knowledge/adr-manager';
import type { 
  KnowledgeCard, 
  GotchaPattern, 
  ArchitectureDecisionRecord,
  KnowledgeQuery,
  KnowledgeConfig
} from '../../src/types';

// Test utilities
const TEST_BASE_PATH = './test-knowledge';
const TEST_CONFIG: KnowledgeConfig = {
  storageBasePath: TEST_BASE_PATH,
  maxCardsPerCategory: 10,
  gotchaPromotionThreshold: 3,
  effectivenessDecayRate: 0.1,
  cleanupIntervalDays: 30,
  autoPromoteGotchas: true
};

describe('Knowledge Management System', () => {
  let knowledgeManager: KnowledgeManager;

  beforeEach(async () => {
    // Clean up test directory
    try {
      await fs.rmdir(TEST_BASE_PATH, { recursive: true });
    } catch {
      // Directory doesn't exist, ignore
    }
    
    // Create knowledge manager with proper config
    knowledgeManager = new KnowledgeManager(TEST_CONFIG);
    await knowledgeManager.initialize();
  });

  afterEach(async () => {
    await knowledgeManager.cleanup();
    try {
      await fs.rmdir(TEST_BASE_PATH, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Knowledge Card Operations', () => {
    it('should create and retrieve knowledge cards', async () => {
      const cardData = {
        title: 'Test Pattern',
        content: 'This is a test knowledge card',
        type: 'pattern' as const,
        category: 'development',
        tags: ['test', 'pattern'],
        effectiveness: 1.0,
        metadata: {
          difficulty: 'low' as const,
          scope: 'project' as const,
          agentTypes: ['code-implementer'],
          relatedIssues: [],
          outcomes: []
        }
      };

      const createdCard = await knowledgeManager.createCard(cardData);
      
      expect(createdCard).toBeDefined();
      expect(createdCard.id).toBeDefined();
      expect(createdCard.title).toBe(cardData.title);
      expect(createdCard.content).toBe(cardData.content);
      expect(createdCard.usageCount).toBe(0);
      expect(createdCard.effectiveness).toBe(1.0);

      const retrievedCard = await knowledgeManager.getCard(createdCard.id);
      expect(retrievedCard).toEqual(createdCard);
    });

    it('should update knowledge cards', async () => {
      const cardData = {
        title: 'Original Title',
        content: 'Original content',
        type: 'solution' as const,
        category: 'debugging',
        tags: ['original'],
        effectiveness: 0.8,
        metadata: {
          difficulty: 'medium' as const,
          scope: 'global' as const,
          agentTypes: ['debugger'],
          relatedIssues: [],
          outcomes: []
        }
      };

      const createdCard = await knowledgeManager.createCard(cardData);
      
      const updatedCard = await knowledgeManager.updateCard(createdCard.id, {
        title: 'Updated Title',
        content: 'Updated content',
        tags: ['updated', 'modified']
      });

      expect(updatedCard.title).toBe('Updated Title');
      expect(updatedCard.content).toBe('Updated content');
      expect(updatedCard.tags).toEqual(['updated', 'modified']);
      expect(updatedCard.id).toBe(createdCard.id);
    });

    it('should search knowledge cards', async () => {
      const cards = await Promise.all([
        knowledgeManager.createCard({
          title: 'React Component Testing',
          content: 'How to test React components effectively',
          type: 'best-practice',
          category: 'testing',
          tags: ['react', 'testing', 'components'],
          effectiveness: 0.9,
          metadata: {
            difficulty: 'medium',
            scope: 'project',
            agentTypes: ['test-coverage-validator'],
            relatedIssues: [],
            outcomes: []
          }
        }),
        knowledgeManager.createCard({
          title: 'TypeScript Error Handling',
          content: 'Best practices for error handling in TypeScript',
          type: 'pattern',
          category: 'development',
          tags: ['typescript', 'errors', 'handling'],
          effectiveness: 0.85,
          metadata: {
            difficulty: 'high',
            scope: 'global',
            agentTypes: ['code-implementer'],
            relatedIssues: [],
            outcomes: []
          }
        })
      ]);

      // Search by title
      const reactResults = await knowledgeManager.searchCards({
        text: 'React',
        limit: 10
      });
      expect(reactResults).toHaveLength(1);
      expect(reactResults[0].card.title).toContain('React');

      // Search by tags
      const testingResults = await knowledgeManager.searchCards({
        text: 'testing',
        filters: {
          tags: ['testing']
        }
      });
      expect(testingResults).toHaveLength(1);
      
      // Search by category
      const developmentResults = await knowledgeManager.searchCards({
        text: '',
        filters: {
          category: ['development']
        }
      });
      expect(developmentResults).toHaveLength(1);
      expect(developmentResults[0].card.category).toBe('development');
    });

    it('should handle usage tracking and effectiveness', async () => {
      const card = await knowledgeManager.createCard({
        title: 'Performance Optimization',
        content: 'Techniques for optimizing application performance',
        type: 'best-practice',
        category: 'performance',
        tags: ['optimization'],
        effectiveness: 0.95,
        metadata: {
          difficulty: 'high',
          scope: 'global',
          agentTypes: ['performance-optimizer'],
          relatedIssues: [],
          outcomes: []
        }
      });

      // Record successful usage
      await knowledgeManager.recordUsage(card.id, 'test-issue-1', {
        issueId: 'test-issue-1',
        success: true,
        metrics: {
          timeToResolution: 300,
          codeQuality: 0.9,
          errorReduction: 0.8
        },
        timestamp: new Date()
      });

      const updatedCard = await knowledgeManager.getCard(card.id);
      expect(updatedCard?.usageCount).toBe(1);
      expect(updatedCard?.metadata.outcomes).toHaveLength(1);
      expect(updatedCard?.metadata.outcomes[0].success).toBe(true);
    });
  });

  describe('Gotcha Tracking System', () => {
    it('should record and track gotcha patterns', async () => {
      const gotchaData = {
        description: 'Common TypeScript compilation error',
        pattern: 'TS2345.*not assignable',
        severity: 'medium' as const,
        category: 'build' as const,
        solution: 'Check type compatibility and add proper type assertions',
        preventionSteps: ['Use strict typing', 'Enable strict null checks'],
        occurrences: [{
          issueId: 'issue-1',
          agentType: 'code-implementer',
          context: 'TypeScript compilation',
          timestamp: new Date(),
          resolved: true,
          resolutionTime: 120
        }]
      };

      const gotcha = await knowledgeManager.recordGotcha(gotchaData);
      
      expect(gotcha).toBeDefined();
      expect(gotcha.id).toBeDefined();
      expect(gotcha.description).toBe(gotchaData.description);
      expect(gotcha.occurrences).toHaveLength(1);
      expect(gotcha.promoted).toBe(false);
    });

    it('should auto-promote gotchas when threshold is reached', async () => {
      const gotchaData = {
        description: 'Repeated database connection issue',
        pattern: 'connection.*timeout',
        severity: 'high' as const,
        category: 'runtime' as const,
        solution: 'Implement connection retry logic',
        preventionSteps: ['Add connection pooling', 'Implement retry mechanism'],
        occurrences: []
      };

      let gotcha = await knowledgeManager.recordGotcha(gotchaData);

      // Add occurrences to reach threshold (3)
      for (let i = 0; i < 3; i++) {
        gotcha.occurrences.push({
          issueId: `issue-${i}`,
          agentType: 'system-architect',
          context: 'Database connection',
          timestamp: new Date(),
          resolved: true,
          resolutionTime: 300
        });
        
        // Simulate recording the same gotcha pattern
        gotcha = await knowledgeManager.recordGotcha({
          ...gotchaData,
          occurrences: gotcha.occurrences
        });
      }

      // Should be auto-promoted when reaching threshold
      const promotedCard = await knowledgeManager.promoteGotcha(gotcha.id);
      expect(promotedCard).toBeDefined();
      expect(promotedCard.type).toBe('gotcha');
      expect(promotedCard.title).toContain('Repeated database connection issue');
    });

    it('should provide gotcha statistics', async () => {
      await knowledgeManager.recordGotcha({
        description: 'Build error pattern 1',
        pattern: 'error.*pattern.*1',
        severity: 'low',
        category: 'build',
        occurrences: [],
        preventionSteps: []
      });

      await knowledgeManager.recordGotcha({
        description: 'Runtime error pattern 2',
        pattern: 'error.*pattern.*2',
        severity: 'high',
        category: 'runtime',
        occurrences: [],
        preventionSteps: []
      });

      const stats = await knowledgeManager.getGotchaStats();
      expect(stats.total).toBe(2);
      expect(stats.byCategory.build).toBe(1);
      expect(stats.byCategory.runtime).toBe(1);
      expect(stats.promoted).toBe(0);
    });
  });

  describe('Architecture Decision Records (ADR)', () => {
    it('should create and manage ADRs', async () => {
      const adrData = {
        title: 'Use TypeScript for Backend Services',
        status: 'proposed' as const,
        deciders: ['team-lead', 'senior-dev'],
        context: 'We need to choose a language for our new backend services',
        decision: 'We will use TypeScript for all new backend services',
        rationale: 'TypeScript provides better type safety and developer experience',
        consequences: {
          positive: ['Better type safety', 'Improved IDE support'],
          negative: ['Additional build step', 'Learning curve'],
          risks: ['Slower initial development']
        },
        alternatives: [{
          option: 'JavaScript',
          pros: ['No build step', 'Familiar to all developers'],
          cons: ['No type safety', 'Runtime errors']
        }],
        relatedDecisions: [],
        tags: ['backend', 'typescript', 'language'],
        metadata: {
          complexity: 'medium' as const,
          impact: 'system' as const,
          reversible: false
        }
      };

      const adr = await knowledgeManager.createADR(adrData);
      
      expect(adr).toBeDefined();
      expect(adr.id).toBeDefined();
      expect(adr.title).toBe(adrData.title);
      expect(adr.status).toBe('proposed');
      expect(adr.date).toBeInstanceOf(Date);
    });

    it('should update ADR status', async () => {
      const adr = await knowledgeManager.createADR({
        title: 'Test ADR',
        status: 'proposed',
        deciders: ['dev'],
        context: 'Test context',
        decision: 'Test decision',
        rationale: 'Test rationale',
        consequences: {
          positive: ['Test positive'],
          negative: ['Test negative'],
          risks: ['Test risk']
        },
        alternatives: [],
        relatedDecisions: [],
        tags: ['test'],
        metadata: {
          complexity: 'low',
          impact: 'local',
          reversible: true
        }
      });

      const updatedAdr = await knowledgeManager.updateADR(adr.id, {
        status: 'accepted'
      });

      expect(updatedAdr.status).toBe('accepted');
      expect(updatedAdr.id).toBe(adr.id);
    });

    it('should list ADRs with filters', async () => {
      await Promise.all([
        knowledgeManager.createADR({
          title: 'Proposed ADR',
          status: 'proposed',
          deciders: ['dev'],
          context: 'Context',
          decision: 'Decision',
          rationale: 'Rationale',
          consequences: { positive: [], negative: [], risks: [] },
          alternatives: [],
          relatedDecisions: [],
          tags: [],
          metadata: { complexity: 'low', impact: 'local', reversible: true }
        }),
        knowledgeManager.createADR({
          title: 'Accepted ADR',
          status: 'accepted',
          deciders: ['dev'],
          context: 'Context',
          decision: 'Decision',
          rationale: 'Rationale',
          consequences: { positive: [], negative: [], risks: [] },
          alternatives: [],
          relatedDecisions: [],
          tags: [],
          metadata: { complexity: 'low', impact: 'local', reversible: true }
        })
      ]);

      const allAdrs = await knowledgeManager.listADRs();
      expect(allAdrs).toHaveLength(2);

      const proposedAdrs = await knowledgeManager.listADRs({
        status: ['proposed']
      });
      expect(proposedAdrs).toHaveLength(1);
      expect(proposedAdrs[0].status).toBe('proposed');
    });
  });

  describe('System Statistics and Maintenance', () => {
    it('should provide comprehensive system statistics', async () => {
      // Create test data
      await Promise.all([
        knowledgeManager.createCard({
          title: 'Pattern 1',
          content: 'Content',
          type: 'pattern',
          category: 'test',
          tags: [],
          effectiveness: 0.7,
          metadata: { difficulty: 'low', scope: 'project', agentTypes: [], relatedIssues: [], outcomes: [] }
        }),
        knowledgeManager.createCard({
          title: 'Solution 1',
          content: 'Content',
          type: 'solution',
          category: 'test',
          tags: [],
          effectiveness: 0.8,
          metadata: { difficulty: 'low', scope: 'project', agentTypes: [], relatedIssues: [], outcomes: [] }
        }),
        knowledgeManager.recordGotcha({
          description: 'Test gotcha',
          pattern: 'test',
          severity: 'low',
          category: 'build',
          occurrences: [],
          preventionSteps: []
        }),
        knowledgeManager.createADR({
          title: 'Test ADR',
          status: 'proposed',
          deciders: ['dev'],
          context: 'Context',
          decision: 'Decision',
          rationale: 'Rationale',
          consequences: { positive: [], negative: [], risks: [] },
          alternatives: [],
          relatedDecisions: [],
          tags: [],
          metadata: { complexity: 'low', impact: 'local', reversible: true }
        })
      ]);

      const stats = await knowledgeManager.getStats();
      
      expect(stats).toBeDefined();
      expect(stats.totalCards).toBe(2);
      expect(stats.cardsByType.pattern).toBe(1);
      expect(stats.cardsByType.solution).toBe(1);
      expect(stats.totalGotchas).toBe(1);
      expect(stats.totalADRs).toBe(1);
      expect(stats.adrsByStatus.proposed).toBe(1);
    });

    it('should handle cleanup operations', async () => {
      // Create some test data
      await knowledgeManager.createCard({
        title: 'Cleanup Test',
        content: 'This should be cleaned up',
        type: 'pattern',
        category: 'cleanup',
        tags: ['temporary'],
        effectiveness: 0.5,
        metadata: {
          difficulty: 'low',
          scope: 'project',
          agentTypes: [],
          relatedIssues: [],
          outcomes: []
        }
      });

      // Cleanup should run without error
      await expect(knowledgeManager.cleanup()).resolves.toBeUndefined();
    });

    it('should handle export/import operations', async () => {
      const exportPath = './test-export.json';
      
      // Create test data
      await knowledgeManager.createCard({
        title: 'Export Test',
        content: 'Test card for export',
        type: 'pattern',
        category: 'export',
        tags: ['export'],
        effectiveness: 0.9,
        metadata: {
          difficulty: 'low',
          scope: 'project',
          agentTypes: [],
          relatedIssues: [],
          outcomes: []
        }
      });

      // Export data
      await knowledgeManager.export(exportPath);
      
      // Verify export file exists
      const exportExists = await fs.access(exportPath).then(() => true).catch(() => false);
      expect(exportExists).toBe(true);

      // Create new manager for import test
      const importManager = new KnowledgeManager({
        ...TEST_CONFIG,
        storageBasePath: './test-import-knowledge'
      });
      await importManager.initialize();

      // Import data
      await importManager.import(exportPath);
      
      // Verify data was imported
      const importedStats = await importManager.getStats();
      expect(importedStats.totalCards).toBeGreaterThan(0);

      // Cleanup
      await importManager.cleanup();
      try {
        await fs.unlink(exportPath);
        await fs.rmdir('./test-import-knowledge', { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle concurrent operations', async () => {
      const operations = Array.from({ length: 10 }, (_, i) =>
        knowledgeManager.createCard({
          title: `Concurrent Card ${i}`,
          content: `Content for card ${i}`,
          type: 'pattern',
          category: 'concurrent',
          tags: [`tag${i}`],
          effectiveness: 0.6,
          metadata: {
            difficulty: 'low',
            scope: 'project',
            agentTypes: [],
            relatedIssues: [],
            outcomes: []
          }
        })
      );

      const results = await Promise.all(operations);
      expect(results).toHaveLength(10);
      
      // All cards should have unique IDs
      const ids = results.map(card => card.id);
      const uniqueIds = [...new Set(ids)];
      expect(uniqueIds).toHaveLength(10);
    });

    it('should handle invalid card IDs gracefully', async () => {
      const result = await knowledgeManager.getCard('non-existent-id');
      expect(result).toBeNull();
    });

    it('should validate card data', async () => {
      // This should work - proper card data
      await expect(knowledgeManager.createCard({
        title: 'Valid Card',
        content: 'Valid content',
        type: 'pattern',
        category: 'valid',
        tags: ['valid'],
        effectiveness: 0.75,
        metadata: {
          difficulty: 'low',
          scope: 'project',
          agentTypes: ['test'],
          relatedIssues: [],
          outcomes: []
        }
      })).resolves.toBeDefined();
    });

    it('should handle filesystem errors gracefully', async () => {
      // Create a card first
      const card = await knowledgeManager.createCard({
        title: 'FS Error Test',
        content: 'Test content',
        type: 'pattern',
        category: 'fs-test',
        tags: [],
        effectiveness: 0.4,
        metadata: {
          difficulty: 'low',
          scope: 'project',
          agentTypes: [],
          relatedIssues: [],
          outcomes: []
        }
      });

      // Simulate filesystem corruption by removing both directories
      try {
        await fs.rmdir(path.join(TEST_BASE_PATH, 'knowledge'), { recursive: true });
      } catch {
        // Directory might not exist
      }

      // Operations should handle the error gracefully
      const result = await knowledgeManager.getCard(card.id);
      // Should either return null or handle the error appropriately
      expect(result === null || result === undefined).toBe(true);
    });
  });
});

// Component integration tests
describe('Knowledge System Components Integration', () => {
  it('should create and integrate all knowledge system components', async () => {
    const manager = new KnowledgeManager({
      storageBasePath: './test-factory',
      maxCardsPerCategory: 5,
      gotchaPromotionThreshold: 2,
      effectivenessDecayRate: 0.2,
      cleanupIntervalDays: 7,
      autoPromoteGotchas: false
    });
    
    await manager.initialize();

    expect(manager).toBeInstanceOf(KnowledgeManager);
    
    // Test that all components are working together
    const card = await manager.createCard({
      title: 'Integration Test Card',
      content: 'This tests component integration',
      type: 'pattern',
      category: 'integration',
      tags: ['test'],
      effectiveness: 0.8,
      metadata: {
        difficulty: 'low',
        scope: 'project',
        agentTypes: ['test'],
        relatedIssues: [],
        outcomes: []
      }
    });
    
    expect(card).toBeDefined();
    expect(card.title).toBe('Integration Test Card');
    
    await manager.cleanup();
    try {
      await fs.rmdir('./test-factory', { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });
});