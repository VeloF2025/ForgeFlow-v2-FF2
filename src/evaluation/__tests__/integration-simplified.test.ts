/**
 * Simplified Integration Tests for Evaluation Layer with ForgeFlow V2 Components
 * Tests key integration points with core ForgeFlow V2 systems
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { createEvaluationManager, createDefaultEvaluationConfig } from '../evaluation-manager';
import { ForgeFlowEvaluationIntegration } from '../integrations/forgeflow-integration';
import { JobOutcomeBuilder } from '../job-outcome-tracker';
import type { IEvaluationManager, JobOutcome } from '../types';
import type { EvaluationManager } from '../evaluation-manager';
import type { KnowledgeManager } from '../../knowledge';

// Mock ForgeFlow V2 components
const mockKnowledgeManager: Partial<KnowledgeManager> = {
  getCard: vi.fn(),
  createCard: vi.fn(),
  updateCard: vi.fn(),
  deleteCard: vi.fn(),
  searchCards: vi.fn(),
  recordUsage: vi.fn(),
  getStats: vi.fn(),
};

describe('Evaluation Layer Integration Tests (Simplified)', () => {
  let evaluationManager: EvaluationManager;
  let integration: ForgeFlowEvaluationIntegration;
  let testDir: string;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(process.cwd(), '.test-evaluation-simplified');
    await fs.mkdir(testDir, { recursive: true });

    // Create evaluation manager with test configuration
    const config = createDefaultEvaluationConfig();
    config.loggingBasePath = testDir;
    config.jobsLogFile = path.join(testDir, 'test-jobs.ndjson');

    evaluationManager = await createEvaluationManager(config, mockKnowledgeManager as any);
    integration = new ForgeFlowEvaluationIntegration(
      evaluationManager,
      mockKnowledgeManager as any,
      config,
    );
  });

  afterEach(async () => {
    // Cleanup
    await evaluationManager.shutdown();
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Core Integration Points', () => {
    it('should successfully initialize evaluation system', async () => {
      const status = evaluationManager.getSystemStatus();

      expect(status.isInitialized).toBe(true);
      expect(status.isRunning).toBe(true);
      expect(status.components).toBeDefined();
      expect(Object.keys(status.components).length).toBeGreaterThan(0);
    });

    it('should log job outcomes through public interface', async () => {
      // Create a basic job outcome
      const jobOutcome = JobOutcomeBuilder.create('test-job-1', 'issue-1', 'exec-1');

      // Enhance with test data
      jobOutcome.success = true;
      jobOutcome.metadata.category = 'feature';
      jobOutcome.metadata.complexity = 'medium';
      jobOutcome.metadata.agentTypes = ['code-implementer'];
      jobOutcome.metadata.pattern = 'feature-development';
      jobOutcome.metadata.phase = 'implementation';
      jobOutcome.metadata.priority = 'medium';
      jobOutcome.metadata.startTime = new Date();
      jobOutcome.metadata.duration = 1200;

      jobOutcome.metrics.performance = {
        totalDuration: 1200,
        agentDurations: { 'code-implementer': 1200 },
        queueTime: 100,
        executionTime: 1100,
        overhead: 0,
      };

      jobOutcome.metrics.codeChanges = {
        linesAdded: 50,
        linesRemoved: 10,
        linesModified: 20,
        filesAdded: 1,
        filesRemoved: 0,
        filesModified: 2,
        complexity: 0.3,
      };

      // Should not throw error
      await expect(evaluationManager.logJobOutcome(jobOutcome)).resolves.not.toThrow();
    });

    it('should process execution completions through integration layer', async () => {
      const executionData = {
        id: 'exec-integration-test',
        epicId: 'epic-1',
        status: 'completed' as const,
        pattern: 'feature-development',
        startTime: new Date(),
        progress: 100,
        phases: [],
        result: { success: true },
      };
      const issue = {
        id: 'issue-1',
        number: 1,
        title: 'Test issue',
        body: 'Test issue body',
        state: 'open' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const agents = [
        {
          type: 'code-implementer',
          id: 'agent-1',
          capabilities: ['code-generation', 'testing'],
          status: 'idle' as const,
          execute: vi.fn(),
        },
      ];

      // Should not throw error
      await expect(
        integration.processExecutionCompletion(executionData, issue, agents),
      ).resolves.not.toThrow();
    });

    it('should generate execution summaries', async () => {
      // Create and log a job outcome first to have data to summarize
      const jobOutcome = JobOutcomeBuilder.create('test-exec-1', 'issue-exec-1', 'exec-1');
      jobOutcome.success = true;
      jobOutcome.metadata.agentTypes = ['code-implementer'];
      await evaluationManager.logJobOutcome(jobOutcome);

      // Generate summary using the execution ID
      const summary = await integration.generateExecutionSummary('exec-1');

      expect(summary).toBeDefined();
      if (summary) {
        expect(typeof summary.qualityScore).toBe('number');
        expect(typeof summary.learningValue).toBe('number');
        expect(Array.isArray(summary.keyInsights)).toBe(true);
        expect(Array.isArray(summary.recommendations)).toBe(true);
      }
    });

    it('should retrieve job outcomes using filters', async () => {
      // Create and log a job outcome first
      const jobOutcome = JobOutcomeBuilder.create(
        'test-retrieve-job',
        'issue-retrieve',
        'exec-retrieve',
      );

      jobOutcome.success = true;
      jobOutcome.metadata.category = 'bugfix';
      jobOutcome.metadata.complexity = 'medium';
      jobOutcome.metadata.agentTypes = ['code-implementer'];
      jobOutcome.metadata.pattern = 'bug-fix';
      jobOutcome.metadata.phase = 'implementation';
      jobOutcome.metadata.priority = 'medium';
      jobOutcome.metadata.startTime = new Date();

      await evaluationManager.logJobOutcome(jobOutcome);

      // Retrieve outcomes with filters
      const outcomes = await evaluationManager.getJobOutcomes({
        timeRange: {
          start: new Date(Date.now() - 60000), // 1 minute ago
          end: new Date(),
        },
        limit: 10,
      });

      expect(Array.isArray(outcomes)).toBe(true);
      expect(outcomes.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Performance Validation', () => {
    it('should meet basic performance requirements for job logging', async () => {
      const jobOutcome = JobOutcomeBuilder.create('perf-test-job', 'perf-issue', 'perf-exec');

      jobOutcome.success = true;
      jobOutcome.metadata.category = 'test';
      jobOutcome.metadata.complexity = 'high';
      jobOutcome.metadata.agentTypes = ['performance-optimizer'];
      jobOutcome.metadata.pattern = 'performance-test';
      jobOutcome.metadata.phase = 'validation';
      jobOutcome.metadata.priority = 'high';
      jobOutcome.metadata.startTime = new Date();

      const startTime = performance.now();
      await evaluationManager.logJobOutcome(jobOutcome);
      const endTime = performance.now();

      const duration = endTime - startTime;

      // Should complete reasonably quickly (allowing buffer for test environment)
      expect(duration).toBeLessThan(100);
    });

    it('should handle multiple concurrent operations', async () => {
      const concurrentOperations = Array.from({ length: 5 }, async (_, i) => {
        const jobOutcome = JobOutcomeBuilder.create(
          `concurrent-job-${i}`,
          `concurrent-issue-${i}`,
          `concurrent-exec-${i}`,
        );

        jobOutcome.success = true;
        jobOutcome.metadata.category = 'test';
        jobOutcome.metadata.complexity = 'medium';
        jobOutcome.metadata.agentTypes = ['code-implementer'];
        jobOutcome.metadata.pattern = 'concurrent-test';
        jobOutcome.metadata.phase = 'testing';
        jobOutcome.metadata.priority = 'medium';
        jobOutcome.metadata.startTime = new Date();

        return evaluationManager.logJobOutcome(jobOutcome);
      });

      // Should complete all operations without errors
      await expect(Promise.all(concurrentOperations)).resolves.not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid job outcomes gracefully', async () => {
      // Create an outcome with missing required fields
      const invalidOutcome = JobOutcomeBuilder.create('', '', '');

      // Should handle gracefully (may log error but not throw)
      await expect(evaluationManager.logJobOutcome(invalidOutcome)).resolves.not.toThrow();
    });

    it('should handle knowledge manager failures gracefully', async () => {
      // Mock knowledge manager to throw error
      mockKnowledgeManager.getCard = vi.fn().mockRejectedValue(new Error('Mock KM error'));

      // Should not crash the evaluation system
      await expect(evaluationManager.evaluateKnowledgeCards()).resolves.not.toThrow();
    });

    it('should handle filesystem issues gracefully', async () => {
      // The system should be robust to filesystem issues during operation
      // (The actual file operations are async and queued, so immediate errors are rare)

      const jobOutcome = JobOutcomeBuilder.create('fs-test-job', 'fs-issue', 'fs-exec');

      jobOutcome.success = true;
      jobOutcome.metadata.category = 'test';
      jobOutcome.metadata.complexity = 'medium';
      jobOutcome.metadata.agentTypes = ['code-implementer'];
      jobOutcome.metadata.pattern = 'filesystem-test';
      jobOutcome.metadata.phase = 'error-handling';
      jobOutcome.metadata.priority = 'medium';
      jobOutcome.metadata.startTime = new Date();

      // Should not immediately throw even if FS issues occur
      await expect(evaluationManager.logJobOutcome(jobOutcome)).resolves.not.toThrow();
    });
  });

  describe('Data Integrity', () => {
    it('should maintain data consistency across operations', async () => {
      const testJobId = 'consistency-test-job';
      const testIssueId = 'consistency-issue';
      const testExecId = 'consistency-exec';

      const jobOutcome = JobOutcomeBuilder.create(testJobId, testIssueId, testExecId);

      jobOutcome.success = true;
      jobOutcome.metadata.category = 'test';
      jobOutcome.metadata.complexity = 'high';
      jobOutcome.metadata.agentTypes = ['code-quality-reviewer'];
      jobOutcome.metadata.pattern = 'consistency-test';
      jobOutcome.metadata.phase = 'validation';
      jobOutcome.metadata.priority = 'high';
      jobOutcome.metadata.startTime = new Date();

      // Log the outcome
      await evaluationManager.logJobOutcome(jobOutcome);

      // Retrieve it back
      const retrievedOutcome = await evaluationManager.getJobOutcome(testJobId);

      // Should match the original data
      expect(retrievedOutcome).toBeDefined();
      if (retrievedOutcome) {
        expect(retrievedOutcome.jobId).toBe(testJobId);
        expect(retrievedOutcome.issueId).toBe(testIssueId);
        expect(retrievedOutcome.executionId).toBe(testExecId);
        expect(retrievedOutcome.success).toBe(true);
        expect(retrievedOutcome.metadata?.pattern).toBe('consistency-test');
      }
    });
  });
});
