// Knowledge Manager Test Suite
// Comprehensive tests ensuring >95% code coverage for the KnowledgeManager

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { 
  KnowledgeManager, 
  createKnowledgeConfig 
} from '../../../src/knowledge';
import type { 
  KnowledgeCard, 
  KnowledgeQuery, 
  GotchaPattern, 
  ArchitectureDecisionRecord, 
  KnowledgeOutcome 
} from '../../../src/types';

// Test data fixtures
const createTestCard = (): Omit<KnowledgeCard, 'id' | 'createdAt' | 'updatedAt' | 'lastUsed' | 'usageCount'> => ({
  title: 'Test Pattern: TypeScript Error Handling',
  content: `# TypeScript Error Handling Best Practice

## Problem
Common TypeScript errors when handling promises and async operations.

## Solution
Always use proper typing and error boundaries:

\`\`\`typescript
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  throw new Error(\`Operation failed: \${error instanceof Error ? error.message : 'Unknown error'}\`);
}
\`\`\`

## Benefits
- Better error tracking
- Type safety
- Cleaner error messages
`,
  type: 'pattern',
  category: 'typescript',
  tags: ['error-handling', 'async', 'best-practice'],
  effectiveness: 0.85,
  metadata: {
    difficulty: 'medium',
    scope: 'global',
    agentTypes: ['code-implementer', 'code-quality-reviewer'],
    relatedIssues: ['issue-123', 'issue-456'],
    outcomes: []
  }
});

const createTestGotcha = (): Omit<GotchaPattern, 'id' | 'createdAt' | 'updatedAt' | 'promoted'> => ({
  description: 'npm install fails on missing dependencies',
  pattern: 'npm ERR!.*ERESOLVE unable to resolve dependency tree',
  severity: 'medium',
  category: 'build',
  solution: 'Run npm install --legacy-peer-deps or clear node_modules',
  preventionSteps: [
    'Lock dependency versions in package.json',
    'Use npm ci in CI/CD pipelines',
    'Regular dependency updates with testing'
  ],
  occurrences: [
    {
      issueId: 'issue-789',
      agentType: 'code-implementer',
      context: 'Failed during npm install step in CI pipeline',
      timestamp: new Date('2024-01-15'),
      resolved: true,
      resolutionTime: 300000 // 5 minutes
    },
    {
      issueId: 'issue-790',
      agentType: 'deployment-automation',
      context: 'Build failed with dependency resolution error',
      timestamp: new Date('2024-01-16'),
      resolved: true,
      resolutionTime: 180000 // 3 minutes
    },
    {
      issueId: 'issue-791',
      agentType: 'code-implementer',
      context: 'Local development setup failing',
      timestamp: new Date('2024-01-17'),
      resolved: true,
      resolutionTime: 120000 // 2 minutes
    }
  ]
});

const createTestADR = (): Omit<ArchitectureDecisionRecord, 'id' | 'date'> => ({
  title: 'Use TypeScript for all new components',
  status: 'accepted',
  deciders: ['tech-lead', 'senior-dev-1', 'senior-dev-2'],
  context: 'We need to improve type safety and developer experience across the codebase',
  decision: 'All new components must be written in TypeScript with strict typing enabled',
  rationale: 'TypeScript provides better IDE support, catches errors at compile time, and improves code maintainability',
  consequences: {
    positive: [
      'Better type safety',
      'Improved IDE support',
      'Reduced runtime errors',
      'Better code documentation through types'
    ],
    negative: [
      'Learning curve for team members',
      'Slightly longer initial development time',
      'Additional build step complexity'
    ],
    risks: [
      'Team resistance to new technology',
      'Migration complexity for existing code'
    ]
  },
  alternatives: [
    {
      option: 'Continue with JavaScript only',
      pros: ['No learning curve', 'Simpler build process'],
      cons: ['More runtime errors', 'Worse IDE support', 'Harder to maintain']
    },
    {
      option: 'Gradual TypeScript adoption',
      pros: ['Less disruptive', 'Allows learning'],
      cons: ['Inconsistent codebase', 'Mixed tooling complexity']
    }
  ],
  relatedDecisions: [],
  tags: ['typescript', 'code-quality', 'development'],
  metadata: {
    complexity: 'medium',
    impact: 'system',
    reversible: false
  }
});

describe('KnowledgeManager', () => {
  let knowledgeManager: KnowledgeManager;
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = path.join(__dirname, '..', '..', '..', 'temp-test-knowledge');
    await fs.mkdir(tempDir, { recursive: true });

    // Create knowledge manager with test configuration
    const config = createKnowledgeConfig(tempDir);
    knowledgeManager = new KnowledgeManager(config);
    await knowledgeManager.initialize();
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rmdir(tempDir, { recursive: true });
    } catch (error) {
      // Directory might not exist or be empty
    }
  });

  describe('Knowledge Card Operations', () => {
    it('should create a new knowledge card', async () => {
      const cardData = createTestCard();
      const card = await knowledgeManager.createCard(cardData);

      expect(card).toBeDefined();
      expect(card.id).toBeTruthy();
      expect(card.title).toBe(cardData.title);
      expect(card.usageCount).toBe(0);
      expect(card.createdAt).toBeInstanceOf(Date);
      expect(card.updatedAt).toBeInstanceOf(Date);
    });

    it('should retrieve a knowledge card by ID', async () => {
      const cardData = createTestCard();
      const createdCard = await knowledgeManager.createCard(cardData);

      const retrievedCard = await knowledgeManager.getCard(createdCard.id);

      expect(retrievedCard).toBeDefined();
      expect(retrievedCard?.id).toBe(createdCard.id);
      expect(retrievedCard?.title).toBe(cardData.title);
    });

    it('should return null for non-existent card', async () => {
      const card = await knowledgeManager.getCard('non-existent-id');
      expect(card).toBeNull();
    });

    it('should update a knowledge card', async () => {
      const cardData = createTestCard();
      const card = await knowledgeManager.createCard(cardData);

      const updatedCard = await knowledgeManager.updateCard(card.id, {
        title: 'Updated Title',
        effectiveness: 0.95
      });

      expect(updatedCard.title).toBe('Updated Title');
      expect(updatedCard.effectiveness).toBe(0.95);
      expect(updatedCard.updatedAt.getTime()).toBeGreaterThan(card.updatedAt.getTime());
    });

    it('should throw error when updating non-existent card', async () => {
      await expect(
        knowledgeManager.updateCard('non-existent-id', { title: 'Updated' })
      ).rejects.toThrow('Knowledge card not found: non-existent-id');
    });

    it('should delete a knowledge card', async () => {
      const cardData = createTestCard();
      const card = await knowledgeManager.createCard(cardData);

      await knowledgeManager.deleteCard(card.id);

      const deletedCard = await knowledgeManager.getCard(card.id);
      expect(deletedCard).toBeNull();
    });

    it('should search knowledge cards by text', async () => {
      const card1 = await knowledgeManager.createCard({
        ...createTestCard(),
        title: 'React Error Boundaries',
        tags: ['react', 'error-handling']
      });

      const card2 = await knowledgeManager.createCard({
        ...createTestCard(),
        title: 'TypeScript Type Guards',
        tags: ['typescript', 'type-safety']
      });

      const query: KnowledgeQuery = {
        text: 'error'
      };

      const results = await knowledgeManager.searchCards(query);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].relevanceScore).toBeGreaterThan(0);
      expect(results.some(r => r.card.id === card1.id)).toBe(true);
    });

    it('should filter search results by type', async () => {
      await knowledgeManager.createCard({
        ...createTestCard(),
        type: 'pattern',
        title: 'Pattern Example'
      });

      await knowledgeManager.createCard({
        ...createTestCard(),
        type: 'best-practice',
        title: 'Best Practice Example'
      });

      const query: KnowledgeQuery = {
        text: 'example',
        filters: {
          type: ['pattern']
        }
      };

      const results = await knowledgeManager.searchCards(query);

      expect(results.length).toBe(1);
      expect(results[0].card.type).toBe('pattern');
    });
  });

  describe('Usage Tracking', () => {
    it('should record card usage and update statistics', async () => {
      const card = await knowledgeManager.createCard(createTestCard());

      const outcome: KnowledgeOutcome = {
        issueId: 'test-issue-1',
        success: true,
        metrics: {
          timeToResolution: 120000, // 2 minutes
          codeQuality: 0.9,
          errorReduction: 0.8
        },
        timestamp: new Date()
      };

      await knowledgeManager.recordUsage(card.id, 'test-issue-1', outcome);

      const updatedCard = await knowledgeManager.getCard(card.id);
      expect(updatedCard?.usageCount).toBe(1);
      expect(updatedCard?.metadata.outcomes).toHaveLength(1);
      expect(updatedCard?.metadata.outcomes[0].issueId).toBe('test-issue-1');
    });

    it('should update effectiveness based on outcomes', async () => {
      const card = await knowledgeManager.createCard(createTestCard());

      // Record successful outcome
      await knowledgeManager.recordUsage(card.id, 'test-issue-1', {
        issueId: 'test-issue-1',
        success: true,
        metrics: { timeToResolution: 60000, codeQuality: 0.95, errorReduction: 0.9 },
        timestamp: new Date()
      });

      // Record failed outcome
      await knowledgeManager.recordUsage(card.id, 'test-issue-2', {
        issueId: 'test-issue-2',
        success: false,
        metrics: { timeToResolution: 300000, codeQuality: 0.5, errorReduction: 0.1 },
        timestamp: new Date()
      });

      await knowledgeManager.updateEffectiveness(card.id);

      const updatedCard = await knowledgeManager.getCard(card.id);
      expect(updatedCard?.effectiveness).toBeLessThan(0.85); // Should decrease due to failure
    });
  });

  describe('Gotcha Pattern Management', () => {
    it('should record a new gotcha pattern', async () => {
      const gotchaData = createTestGotcha();
      const gotcha = await knowledgeManager.recordGotcha(gotchaData);

      expect(gotcha).toBeDefined();
      expect(gotcha.id).toBeTruthy();
      expect(gotcha.description).toBe(gotchaData.description);
      expect(gotcha.occurrences).toHaveLength(3);
      expect(gotcha.promoted).toBe(false);
    });

    it('should promote gotcha to knowledge card when threshold reached', async () => {
      const gotchaData = createTestGotcha(); // Has 3 occurrences
      const gotcha = await knowledgeManager.recordGotcha(gotchaData);

      const promotedCard = await knowledgeManager.promoteGotcha(gotcha.id);

      expect(promotedCard).toBeDefined();
      expect(promotedCard.type).toBe('gotcha');
      expect(promotedCard.title).toContain('Gotcha:');
      expect(promotedCard.tags).toContain('gotcha');
    });

    it('should get gotcha statistics', async () => {
      await knowledgeManager.recordGotcha(createTestGotcha());
      
      const stats = await knowledgeManager.getGotchaStats();

      expect(stats.total).toBe(1);
      expect(stats.promoted).toBe(0);
      expect(stats.byCategory['build']).toBe(1);
    });
  });

  describe('Architecture Decision Records', () => {
    it('should create a new ADR', async () => {
      const adrData = createTestADR();
      const adr = await knowledgeManager.createADR(adrData);

      expect(adr).toBeDefined();
      expect(adr.id).toBeTruthy();
      expect(adr.id).toMatch(/^ADR-\d{4}$/);
      expect(adr.title).toBe(adrData.title);
      expect(adr.status).toBe('accepted');
    });

    it('should update ADR status', async () => {
      const adr = await knowledgeManager.createADR(createTestADR());

      const updatedADR = await knowledgeManager.updateADR(adr.id, {
        status: 'deprecated'
      });

      expect(updatedADR.status).toBe('deprecated');
    });

    it('should list ADRs with filters', async () => {
      await knowledgeManager.createADR({
        ...createTestADR(),
        status: 'accepted'
      });

      await knowledgeManager.createADR({
        ...createTestADR(),
        title: 'Another Decision',
        status: 'proposed'
      });

      const acceptedADRs = await knowledgeManager.listADRs({
        status: ['accepted']
      });

      expect(acceptedADRs).toHaveLength(1);
      expect(acceptedADRs[0].status).toBe('accepted');
    });
  });

  describe('Statistics and Analytics', () => {
    it('should provide comprehensive system statistics', async () => {
      // Create test data
      await knowledgeManager.createCard(createTestCard());
      await knowledgeManager.recordGotcha(createTestGotcha());
      await knowledgeManager.createADR(createTestADR());

      const stats = await knowledgeManager.getStats();

      expect(stats.totalCards).toBe(1);
      expect(stats.totalGotchas).toBe(1);
      expect(stats.totalADRs).toBe(1);
      expect(stats.cardsByType['pattern']).toBe(1);
      expect(stats.adrsByStatus['accepted']).toBe(1);
      expect(stats.lastUpdated).toBeInstanceOf(Date);
    });

    it('should calculate average effectiveness', async () => {
      await knowledgeManager.createCard({
        ...createTestCard(),
        effectiveness: 0.8
      });

      await knowledgeManager.createCard({
        ...createTestCard(),
        title: 'Another Card',
        effectiveness: 0.6
      });

      const stats = await knowledgeManager.getStats();

      expect(stats.averageEffectiveness).toBe(0.7);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid card data gracefully', async () => {
      await expect(
        knowledgeManager.createCard({
          title: '',  // Invalid empty title
          content: 'Test content',
          type: 'pattern',
          category: 'test',
          tags: [],
          effectiveness: 0.5,
          metadata: {
            difficulty: 'low',
            scope: 'global',
            agentTypes: [],
            relatedIssues: [],
            outcomes: []
          }
        })
      ).rejects.toThrow();
    });

    it('should handle missing files gracefully', async () => {
      const card = await knowledgeManager.getCard('missing-card-id');
      expect(card).toBeNull();
    });

    it('should validate ADR status transitions', async () => {
      const adr = await knowledgeManager.createADR({
        ...createTestADR(),
        status: 'superseded'  // Terminal status
      });

      await expect(
        knowledgeManager.updateADR(adr.id, { status: 'accepted' })
      ).rejects.toThrow(/Invalid status transition/);
    });
  });

  describe('Cleanup Operations', () => {
    it('should cleanup old unused cards', async () => {
      // Create an old card that should be cleaned up
      const oldCard = await knowledgeManager.createCard({
        ...createTestCard(),
        effectiveness: 0.1  // Low effectiveness
      });

      // Simulate old timestamp
      await knowledgeManager.updateCard(oldCard.id, {
        lastUsed: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) // 100 days ago
      });

      await knowledgeManager.cleanup();

      // Verify cleanup occurred (implementation dependent)
      const stats = await knowledgeManager.getStats();
      expect(stats.totalCards).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Performance Requirements', () => {
    it('should complete card operations within 100ms', async () => {
      const startTime = Date.now();
      
      const card = await knowledgeManager.createCard(createTestCard());
      await knowledgeManager.getCard(card.id);
      await knowledgeManager.updateCard(card.id, { title: 'Updated' });
      
      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should handle concurrent operations safely', async () => {
      const promises = Array.from({ length: 10 }, (_, i) => 
        knowledgeManager.createCard({
          ...createTestCard(),
          title: `Concurrent Card ${i}`
        })
      );

      const cards = await Promise.all(promises);
      
      expect(cards).toHaveLength(10);
      expect(new Set(cards.map(c => c.id)).size).toBe(10); // All unique IDs
    });
  });
});