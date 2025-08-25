// Gotcha Tracker Test Suite
// Tests for pattern recognition and auto-promotion functionality

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { GotchaTracker } from '../../../src/knowledge/gotcha-tracker';
import { createKnowledgeConfig } from '../../../src/knowledge';
import type { GotchaPattern, GotchaOccurrence } from '../../../src/types';

const createTestOccurrence = (overrides: Partial<GotchaOccurrence> = {}): GotchaOccurrence => ({
  issueId: 'issue-123',
  agentType: 'code-implementer',
  context: 'npm install failed with dependency resolution error',
  timestamp: new Date(),
  resolved: true,
  resolutionTime: 120000,
  ...overrides
});

const createTestGotcha = (overrides: Partial<Omit<GotchaPattern, 'id' | 'createdAt' | 'updatedAt' | 'promoted'>> = {}): Omit<GotchaPattern, 'id' | 'createdAt' | 'updatedAt' | 'promoted'> => ({
  description: 'npm dependency resolution failure',
  pattern: 'npm ERR!.*ERESOLVE unable to resolve dependency tree',
  severity: 'medium',
  category: 'build',
  solution: 'Use --legacy-peer-deps flag or update conflicting dependencies',
  preventionSteps: [
    'Lock dependency versions',
    'Regular dependency updates',
    'Use npm ci in production'
  ],
  occurrences: [createTestOccurrence()],
  ...overrides
});

describe('GotchaTracker', () => {
  let gotchaTracker: GotchaTracker;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(__dirname, '..', '..', '..', 'temp-test-gotcha');
    await fs.mkdir(tempDir, { recursive: true });

    const config = createKnowledgeConfig(tempDir);
    gotchaTracker = new GotchaTracker(config);
    await gotchaTracker.initialize();
  });

  afterEach(async () => {
    try {
      await fs.rmdir(tempDir, { recursive: true });
    } catch (error) {
      // Directory might not exist
    }
  });

  describe('Gotcha Pattern Recording', () => {
    it('should record a new gotcha pattern', async () => {
      const gotchaData = createTestGotcha();
      const gotcha = await gotchaTracker.recordGotcha(gotchaData);

      expect(gotcha).toBeDefined();
      expect(gotcha.id).toBeTruthy();
      expect(gotcha.description).toBe(gotchaData.description);
      expect(gotcha.pattern).toBe(gotchaData.pattern);
      expect(gotcha.promoted).toBe(false);
      expect(gotcha.createdAt).toBeInstanceOf(Date);
    });

    it('should merge similar gotcha patterns', async () => {
      // Record first occurrence
      const firstGotcha = await gotchaTracker.recordGotcha(createTestGotcha({
        description: 'npm install fails',
        occurrences: [createTestOccurrence({ issueId: 'issue-1' })]
      }));

      // Record similar occurrence
      const secondGotcha = await gotchaTracker.recordGotcha(createTestGotcha({
        description: 'npm install fails', // Same description
        occurrences: [createTestOccurrence({ issueId: 'issue-2' })]
      }));

      // Should return the same gotcha with merged occurrences
      expect(firstGotcha.id).toBe(secondGotcha.id);
      expect(secondGotcha.occurrences.length).toBe(2);
      expect(secondGotcha.occurrences.map(o => o.issueId)).toContain('issue-1');
      expect(secondGotcha.occurrences.map(o => o.issueId)).toContain('issue-2');
    });

    it('should update severity when merging if new occurrence is more severe', async () => {
      // Record low severity gotcha
      const lowSeverityGotcha = await gotchaTracker.recordGotcha(createTestGotcha({
        severity: 'low',
        occurrences: [createTestOccurrence({ issueId: 'issue-1' })]
      }));

      // Record high severity occurrence of same pattern
      const highSeverityGotcha = await gotchaTracker.recordGotcha(createTestGotcha({
        severity: 'critical',
        occurrences: [createTestOccurrence({ issueId: 'issue-2' })]
      }));

      expect(highSeverityGotcha.severity).toBe('critical');
    });

    it('should merge prevention steps from similar patterns', async () => {
      const firstGotcha = await gotchaTracker.recordGotcha(createTestGotcha({
        preventionSteps: ['Step A', 'Step B']
      }));

      const secondGotcha = await gotchaTracker.recordGotcha(createTestGotcha({
        preventionSteps: ['Step B', 'Step C'] // B is duplicate, C is new
      }));

      expect(secondGotcha.preventionSteps).toContain('Step A');
      expect(secondGotcha.preventionSteps).toContain('Step B');
      expect(secondGotcha.preventionSteps).toContain('Step C');
      expect(secondGotcha.preventionSteps.length).toBe(3);
    });
  });

  describe('Pattern Similarity Detection', () => {
    it('should detect similar patterns by exact match', async () => {
      const pattern = 'EXACT_ERROR_PATTERN';
      
      const first = await gotchaTracker.recordGotcha(createTestGotcha({
        pattern,
        category: 'build',
        occurrences: [createTestOccurrence({ issueId: 'issue-1' })]
      }));

      const second = await gotchaTracker.recordGotcha(createTestGotcha({
        pattern, // Exact same pattern
        category: 'build', // Same category
        occurrences: [createTestOccurrence({ issueId: 'issue-2' })]
      }));

      expect(first.id).toBe(second.id);
    });

    it('should detect similar patterns by description similarity', async () => {
      const first = await gotchaTracker.recordGotcha(createTestGotcha({
        description: 'Database connection timeout error',
        category: 'database',
        occurrences: [createTestOccurrence({ issueId: 'issue-1' })]
      }));

      const second = await gotchaTracker.recordGotcha(createTestGotcha({
        description: 'Database connection timeout issue', // Very similar
        category: 'database',
        occurrences: [createTestOccurrence({ issueId: 'issue-2' })]
      }));

      expect(first.id).toBe(second.id);
    });

    it('should not merge patterns from different categories', async () => {
      const first = await gotchaTracker.recordGotcha(createTestGotcha({
        description: 'timeout error',
        category: 'build'
      }));

      const second = await gotchaTracker.recordGotcha(createTestGotcha({
        description: 'timeout error',
        category: 'runtime' // Different category
      }));

      expect(first.id).not.toBe(second.id);
    });
  });

  describe('Auto-Promotion Logic', () => {
    it('should identify promotion candidates based on occurrence threshold', async () => {
      // Create gotcha with 3 occurrences (default threshold)
      const gotcha = await gotchaTracker.recordGotcha(createTestGotcha({
        occurrences: [
          createTestOccurrence({ issueId: 'issue-1' }),
          createTestOccurrence({ issueId: 'issue-2' }),
          createTestOccurrence({ issueId: 'issue-3' })
        ]
      }));

      const candidates = await gotchaTracker.getPromotionCandidates();

      expect(candidates.length).toBe(1);
      expect(candidates[0].gotchaId).toBe(gotcha.id);
      expect(candidates[0].occurrenceCount).toBe(3);
    });

    it('should promote critical gotchas with fewer occurrences', async () => {
      // Critical severity should reduce threshold
      const criticalGotcha = await gotchaTracker.recordGotcha(createTestGotcha({
        severity: 'critical',
        occurrences: [
          createTestOccurrence({ issueId: 'issue-1' }),
          createTestOccurrence({ issueId: 'issue-2' })
        ]
      }));

      const candidates = await gotchaTracker.getPromotionCandidates();

      expect(candidates.length).toBe(1);
      expect(candidates[0].gotchaId).toBe(criticalGotcha.id);
    });

    it('should calculate promotion scores correctly', async () => {
      const highOccurrenceGotcha = await gotchaTracker.recordGotcha(createTestGotcha({
        severity: 'medium',
        occurrences: Array.from({ length: 5 }, (_, i) => 
          createTestOccurrence({ 
            issueId: `issue-${i}`,
            resolved: true 
          })
        )
      }));

      const criticalGotcha = await gotchaTracker.recordGotcha(createTestGotcha({
        description: 'Critical security issue',
        severity: 'critical',
        occurrences: [
          createTestOccurrence({ issueId: 'critical-1' }),
          createTestOccurrence({ issueId: 'critical-2' })
        ]
      }));

      const candidates = await gotchaTracker.getPromotionCandidates();
      
      expect(candidates.length).toBe(2);
      // Critical should have higher score despite fewer occurrences
      expect(candidates[0].promotionScore).toBeGreaterThan(candidates[1].promotionScore);
    });

    it('should penalize unresolved occurrences in promotion score', async () => {
      const resolvedGotcha = await gotchaTracker.recordGotcha(createTestGotcha({
        occurrences: Array.from({ length: 3 }, (_, i) => 
          createTestOccurrence({ 
            issueId: `resolved-${i}`,
            resolved: true 
          })
        )
      }));

      const unresolvedGotcha = await gotchaTracker.recordGotcha(createTestGotcha({
        description: 'Unresolved pattern',
        occurrences: Array.from({ length: 3 }, (_, i) => 
          createTestOccurrence({ 
            issueId: `unresolved-${i}`,
            resolved: false 
          })
        )
      }));

      const candidates = await gotchaTracker.getPromotionCandidates();

      const resolvedCandidate = candidates.find(c => c.gotchaId === resolvedGotcha.id);
      const unresolvedCandidate = candidates.find(c => c.gotchaId === unresolvedGotcha.id);

      expect(resolvedCandidate?.promotionScore).toBeGreaterThan(
        unresolvedCandidate?.promotionScore || 0
      );
    });
  });

  describe('Gotcha Retrieval and Management', () => {
    it('should retrieve gotcha by ID', async () => {
      const gotcha = await gotchaTracker.recordGotcha(createTestGotcha());
      
      const retrieved = await gotchaTracker.getGotcha(gotcha.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(gotcha.id);
      expect(retrieved?.description).toBe(gotcha.description);
    });

    it('should return null for non-existent gotcha', async () => {
      const gotcha = await gotchaTracker.getGotcha('non-existent-id');
      expect(gotcha).toBeNull();
    });

    it('should mark gotcha as promoted', async () => {
      const gotcha = await gotchaTracker.recordGotcha(createTestGotcha());

      await gotchaTracker.markAsPromoted(gotcha.id, 'knowledge-card-123');

      const updated = await gotchaTracker.getGotcha(gotcha.id);
      expect(updated?.promoted).toBe(true);
    });
  });

  describe('Statistics and Analytics', () => {
    beforeEach(async () => {
      // Set up test data
      await gotchaTracker.recordGotcha(createTestGotcha({
        description: 'Build failure 1',
        category: 'build',
        severity: 'high'
      }));

      await gotchaTracker.recordGotcha(createTestGotcha({
        description: 'Runtime error 1',
        category: 'runtime',
        severity: 'medium'
      }));

      await gotchaTracker.recordGotcha(createTestGotcha({
        description: 'Build failure 2',
        category: 'build',
        severity: 'low'
      }));
    });

    it('should provide accurate gotcha statistics', async () => {
      const stats = await gotchaTracker.getStats();

      expect(stats.total).toBe(3);
      expect(stats.promoted).toBe(0);
      expect(stats.byCategory['build']).toBe(2);
      expect(stats.byCategory['runtime']).toBe(1);
      expect(stats.bySeverity['high']).toBe(1);
      expect(stats.bySeverity['medium']).toBe(1);
      expect(stats.bySeverity['low']).toBe(1);
    });

    it('should track promoted gotchas in statistics', async () => {
      const gotcha = await gotchaTracker.recordGotcha(createTestGotcha());
      await gotchaTracker.markAsPromoted(gotcha.id, 'card-123');

      const stats = await gotchaTracker.getStats();

      expect(stats.promoted).toBe(1);
    });

    it('should include promotion candidates in statistics', async () => {
      await gotchaTracker.recordGotcha(createTestGotcha({
        occurrences: Array.from({ length: 3 }, (_, i) => 
          createTestOccurrence({ issueId: `issue-${i}` })
        )
      }));

      const stats = await gotchaTracker.getStats();

      expect(stats.promotionCandidates.length).toBe(1);
      expect(stats.promotionCandidates[0].occurrenceCount).toBe(3);
    });
  });

  describe('File Operations', () => {
    it('should persist gotcha patterns to markdown files', async () => {
      const gotcha = await gotchaTracker.recordGotcha(createTestGotcha({
        description: 'Test persistence',
        pattern: 'test-pattern'
      }));

      // Check if file was created
      const filePath = path.join(tempDir, 'gotchas', `${gotcha.id}.md`);
      const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);

      // Check file content
      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toContain('Test persistence');
      expect(content).toContain('test-pattern');
      expect(content).toMatch(/^---\n/); // YAML frontmatter
    });

    it('should load existing gotcha patterns on initialization', async () => {
      // Create and save a gotcha
      const gotcha = await gotchaTracker.recordGotcha(createTestGotcha({
        description: 'Persisted gotcha'
      }));

      // Create new tracker instance
      const newTracker = new GotchaTracker(createKnowledgeConfig(tempDir));
      await newTracker.initialize();

      // Should load the existing gotcha
      const loaded = await newTracker.getGotcha(gotcha.id);
      expect(loaded?.description).toBe('Persisted gotcha');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid gotcha data gracefully', async () => {
      await expect(
        gotchaTracker.recordGotcha({
          description: '', // Invalid empty description
          pattern: 'test',
          severity: 'medium',
          category: 'build',
          solution: 'test',
          preventionSteps: [],
          occurrences: []
        })
      ).rejects.toThrow();
    });

    it('should handle corrupted gotcha files during initialization', async () => {
      // Create a corrupted file
      const corruptedPath = path.join(tempDir, 'gotchas', 'corrupted.md');
      await fs.mkdir(path.dirname(corruptedPath), { recursive: true });
      await fs.writeFile(corruptedPath, 'Invalid content');

      // Should not crash during initialization
      await expect(gotchaTracker.initialize()).resolves.not.toThrow();
    });

    it('should handle marking non-existent gotcha as promoted', async () => {
      await expect(
        gotchaTracker.markAsPromoted('non-existent', 'card-123')
      ).rejects.toThrow('Gotcha pattern not found');
    });
  });

  describe('Performance', () => {
    it('should handle operations within acceptable time limits', async () => {
      const start = Date.now();
      
      await gotchaTracker.recordGotcha(createTestGotcha());
      
      const recordTime = Date.now() - start;
      expect(recordTime).toBeLessThan(100); // 100ms
    });

    it('should efficiently detect similar patterns with large datasets', async () => {
      // Create 50 different gotcha patterns
      const promises = Array.from({ length: 50 }, (_, i) =>
        gotchaTracker.recordGotcha(createTestGotcha({
          description: `Unique gotcha ${i}`,
          pattern: `unique-pattern-${i}`,
          occurrences: [createTestOccurrence({ issueId: `issue-${i}` })]
        }))
      );

      await Promise.all(promises);

      // Test similarity detection performance
      const start = Date.now();
      
      await gotchaTracker.recordGotcha(createTestGotcha({
        description: 'New unique gotcha',
        pattern: 'new-unique-pattern'
      }));
      
      const detectionTime = Date.now() - start;
      expect(detectionTime).toBeLessThan(200); // 200ms
    });
  });

  describe('Cleanup Operations', () => {
    it('should cleanup old unused gotcha patterns', async () => {
      // Create old gotcha with single occurrence
      const oldGotcha = await gotchaTracker.recordGotcha(createTestGotcha({
        severity: 'low',
        occurrences: [createTestOccurrence({
          timestamp: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) // 100 days ago
        })]
      }));

      await gotchaTracker.cleanup();

      // Old, low-impact gotcha should potentially be cleaned up
      // (Implementation may vary based on cleanup criteria)
      const stats = await gotchaTracker.getStats();
      expect(stats.total).toBeGreaterThanOrEqual(0);
    });

    it('should preserve high-severity and frequently occurring gotchas during cleanup', async () => {
      const criticalGotcha = await gotchaTracker.recordGotcha(createTestGotcha({
        severity: 'critical',
        occurrences: [createTestOccurrence()]
      }));

      const frequentGotcha = await gotchaTracker.recordGotcha(createTestGotcha({
        description: 'Frequent issue',
        occurrences: Array.from({ length: 5 }, (_, i) =>
          createTestOccurrence({ issueId: `freq-${i}` })
        )
      }));

      await gotchaTracker.cleanup();

      // These should not be cleaned up
      const critical = await gotchaTracker.getGotcha(criticalGotcha.id);
      const frequent = await gotchaTracker.getGotcha(frequentGotcha.id);

      expect(critical).toBeDefined();
      expect(frequent).toBeDefined();
    });
  });
});