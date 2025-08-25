// Card Store Test Suite
// Tests for markdown-based knowledge card storage

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { CardStore } from '../../../src/knowledge/card-store';
import { createKnowledgeConfig } from '../../../src/knowledge';
import type { KnowledgeCard, KnowledgeQuery } from '../../../src/types';

const createTestCard = (overrides: Partial<KnowledgeCard> = {}): KnowledgeCard => ({
  id: 'test-card-1',
  title: 'Test Card',
  content: '# Test Content\n\nThis is test content for the card.',
  type: 'pattern',
  category: 'testing',
  tags: ['test', 'unit'],
  usageCount: 0,
  effectiveness: 0.5,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastUsed: new Date(),
  metadata: {
    difficulty: 'low',
    scope: 'global',
    agentTypes: ['test-agent'],
    relatedIssues: ['issue-1'],
    outcomes: []
  },
  ...overrides
});

describe('CardStore', () => {
  let cardStore: CardStore;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(__dirname, '..', '..', '..', 'temp-test-cardstore');
    await fs.mkdir(tempDir, { recursive: true });

    const config = createKnowledgeConfig(tempDir);
    cardStore = new CardStore(config);
    await cardStore.initialize();
  });

  afterEach(async () => {
    try {
      await fs.rmdir(tempDir, { recursive: true });
    } catch (error) {
      // Directory might not exist
    }
  });

  describe('Card Storage Operations', () => {
    it('should save and load a card', async () => {
      const card = createTestCard();
      await cardStore.saveCard(card);

      const loadedCard = await cardStore.getCard(card.id);

      expect(loadedCard).toBeDefined();
      expect(loadedCard?.id).toBe(card.id);
      expect(loadedCard?.title).toBe(card.title);
      expect(loadedCard?.content).toBe(card.content);
    });

    it('should return null for non-existent card', async () => {
      const card = await cardStore.getCard('non-existent');
      expect(card).toBeNull();
    });

    it('should delete a card', async () => {
      const card = createTestCard();
      await cardStore.saveCard(card);

      await cardStore.deleteCard(card.id);

      const deletedCard = await cardStore.getCard(card.id);
      expect(deletedCard).toBeNull();
    });

    it('should handle project-specific cards', async () => {
      const projectCard = createTestCard({
        id: 'project-card',
        projectId: 'test-project'
      });

      await cardStore.saveCard(projectCard);
      const loadedCard = await cardStore.getCard('project-card');

      expect(loadedCard?.projectId).toBe('test-project');
    });
  });

  describe('Search Functionality', () => {
    beforeEach(async () => {
      // Set up test cards
      const cards = [
        createTestCard({
          id: 'card-1',
          title: 'React Error Handling',
          content: 'How to handle errors in React components',
          tags: ['react', 'error', 'component']
        }),
        createTestCard({
          id: 'card-2',
          title: 'TypeScript Best Practices',
          content: 'Best practices for writing TypeScript code',
          tags: ['typescript', 'best-practice']
        }),
        createTestCard({
          id: 'card-3',
          title: 'Error Boundary Pattern',
          content: 'Implementing error boundaries in React',
          tags: ['react', 'error', 'pattern']
        })
      ];

      for (const card of cards) {
        await cardStore.saveCard(card);
      }
    });

    it('should search cards by title', async () => {
      const query: KnowledgeQuery = { text: 'error' };
      const results = await cardStore.searchCards(query);

      expect(results.length).toBe(2);
      expect(results.every(r => r.card.title.toLowerCase().includes('error'))).toBe(true);
      expect(results[0].relevanceScore).toBeGreaterThan(0);
    });

    it('should search cards by content', async () => {
      const query: KnowledgeQuery = { text: 'typescript' };
      const results = await cardStore.searchCards(query);

      expect(results.length).toBe(1);
      expect(results[0].card.id).toBe('card-2');
    });

    it('should search cards by tags', async () => {
      const query: KnowledgeQuery = { text: 'react' };
      const results = await cardStore.searchCards(query);

      expect(results.length).toBe(2);
      expect(results.every(r => r.card.tags.includes('react'))).toBe(true);
    });

    it('should limit search results', async () => {
      const query: KnowledgeQuery = { text: 'error', limit: 1 };
      const results = await cardStore.searchCards(query);

      expect(results.length).toBe(1);
    });

    it('should filter by tags', async () => {
      const query: KnowledgeQuery = {
        text: 'error',
        filters: { tags: ['component'] }
      };
      const results = await cardStore.searchCards(query);

      expect(results.length).toBe(1);
      expect(results[0].card.id).toBe('card-1');
    });

    it('should generate relevant snippets', async () => {
      const query: KnowledgeQuery = { text: 'typescript' };
      const results = await cardStore.searchCards(query);

      expect(results[0].snippet).toBeDefined();
      expect(results[0].snippet).toContain('typescript');
    });

    it('should rank results by relevance', async () => {
      const query: KnowledgeQuery = { text: 'error' };
      const results = await cardStore.searchCards(query);

      // Results should be sorted by relevance score
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].relevanceScore).toBeGreaterThanOrEqual(results[i + 1].relevanceScore);
      }
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      const cards = [
        createTestCard({ id: 'card-1', type: 'pattern', category: 'react', effectiveness: 0.8 }),
        createTestCard({ id: 'card-2', type: 'best-practice', category: 'typescript', effectiveness: 0.9 }),
        createTestCard({ id: 'card-3', type: 'pattern', category: 'react', effectiveness: 0.7 })
      ];

      for (const card of cards) {
        await cardStore.saveCard(card);
      }
    });

    it('should provide accurate statistics', async () => {
      const stats = await cardStore.getStats();

      expect(stats.total).toBe(3);
      expect(stats.byType['pattern']).toBe(2);
      expect(stats.byType['best-practice']).toBe(1);
      expect(stats.byCategory['react']).toBe(2);
      expect(stats.byCategory['typescript']).toBe(1);
      expect(stats.averageEffectiveness).toBe(0.8); // (0.8 + 0.9 + 0.7) / 3
    });
  });

  describe('File Format Validation', () => {
    it('should serialize card to markdown with frontmatter', async () => {
      const card = createTestCard({
        title: 'Test Markdown',
        content: 'This is **markdown** content.',
        tags: ['markdown', 'test']
      });

      await cardStore.saveCard(card);

      // Read the raw file
      const filePath = path.join(tempDir, 'knowledge', 'global', `${card.id}.md`);
      const fileContent = await fs.readFile(filePath, 'utf8');

      expect(fileContent).toMatch(/^---\n/);
      expect(fileContent).toContain(`title: "Test Markdown"`);
      expect(fileContent).toContain('This is **markdown** content.');
      expect(fileContent).toMatch(/tags:\n  - "markdown"\n  - "test"/);
    });

    it('should deserialize markdown with frontmatter correctly', async () => {
      const markdownContent = `---
id: "manual-card"
title: "Manual Card"
type: "pattern"
category: "manual"
tags:
  - "manual"
  - "test"
usageCount: 5
effectiveness: 0.95
createdAt: "2024-01-01T00:00:00.000Z"
updatedAt: "2024-01-02T00:00:00.000Z"
lastUsed: "2024-01-03T00:00:00.000Z"
difficulty: "high"
scope: "global"
agentTypes:
  - "test-agent"
relatedIssues: []
---

# Manual Card Content

This card was created manually to test deserialization.`;

      // Write file manually
      const filePath = path.join(tempDir, 'knowledge', 'global', 'manual-card.md');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, markdownContent);

      // Reinitialize to pick up the manual file
      await cardStore.initialize();

      const card = await cardStore.getCard('manual-card');

      expect(card).toBeDefined();
      expect(card?.title).toBe('Manual Card');
      expect(card?.type).toBe('pattern');
      expect(card?.tags).toEqual(['manual', 'test']);
      expect(card?.usageCount).toBe(5);
      expect(card?.effectiveness).toBe(0.95);
    });
  });

  describe('Error Handling', () => {
    it('should handle corrupted card files gracefully', async () => {
      // Create a corrupted file
      const corruptedPath = path.join(tempDir, 'knowledge', 'global', 'corrupted.md');
      await fs.mkdir(path.dirname(corruptedPath), { recursive: true });
      await fs.writeFile(corruptedPath, 'Invalid content without frontmatter');

      // Should not crash during initialization
      await expect(cardStore.initialize()).resolves.not.toThrow();

      // Should return null for corrupted card
      const card = await cardStore.getCard('corrupted');
      expect(card).toBeNull();
    });

    it('should handle concurrent writes safely', async () => {
      const card = createTestCard();

      // Simulate concurrent writes
      const promises = Array.from({ length: 5 }, (_, i) =>
        cardStore.saveCard({ ...card, title: `Concurrent ${i}` })
      );

      await expect(Promise.all(promises)).resolves.not.toThrow();
    });

    it('should validate card data before saving', async () => {
      const invalidCard = {
        ...createTestCard(),
        id: '', // Invalid empty ID
      };

      await expect(cardStore.saveCard(invalidCard)).rejects.toThrow();
    });
  });

  describe('Performance', () => {
    it('should perform operations within acceptable time limits', async () => {
      const card = createTestCard();

      // Save operation
      const saveStart = Date.now();
      await cardStore.saveCard(card);
      const saveTime = Date.now() - saveStart;
      expect(saveTime).toBeLessThan(50); // 50ms

      // Get operation
      const getStart = Date.now();
      await cardStore.getCard(card.id);
      const getTime = Date.now() - getStart;
      expect(getTime).toBeLessThan(25); // 25ms

      // Search operation
      const searchStart = Date.now();
      await cardStore.searchCards({ text: 'test' });
      const searchTime = Date.now() - searchStart;
      expect(searchTime).toBeLessThan(100); // 100ms
    });

    it('should handle large numbers of cards efficiently', async () => {
      // Create 100 test cards
      const cards = Array.from({ length: 100 }, (_, i) =>
        createTestCard({
          id: `perf-card-${i}`,
          title: `Performance Test Card ${i}`,
          content: `Content for card ${i} with various keywords like test, performance, and speed.`
        })
      );

      const saveStart = Date.now();
      for (const card of cards) {
        await cardStore.saveCard(card);
      }
      const saveTime = Date.now() - saveStart;

      expect(saveTime).toBeLessThan(5000); // 5 seconds for 100 cards

      // Search should still be fast
      const searchStart = Date.now();
      const results = await cardStore.searchCards({ text: 'performance', limit: 10 });
      const searchTime = Date.now() - searchStart;

      expect(searchTime).toBeLessThan(200); // 200ms
      expect(results.length).toBeGreaterThan(0);
    });
  });
});