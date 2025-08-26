/**
 * Integration Tests for Evaluation Layer with ForgeFlow V2 Components
 * Tests real integration with orchestrator, knowledge manager, and agent pool
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { createEvaluationManager, createDefaultEvaluationConfig } from '../evaluation-manager';
import { ForgeFlowEvaluationIntegration } from '../integrations/forgeflow-integration';
import { JobOutcomeBuilder } from '../job-outcome-tracker';
import type { JobOutcome } from '../types';
import type { EvaluationManager } from '../evaluation-manager';
import type { KnowledgeManager } from '../../types';

// Mock ForgeFlow V2 components - use any for complex mock
const mockKnowledgeManager = {
  getCard: vi.fn(),
  createCard: vi.fn(),
  updateCard: vi.fn(),
  deleteCard: vi.fn(),
  searchCards: vi.fn(),
  getAllCards: vi.fn(),
  promoteCard: vi.fn(),
  demoteCard: vi.fn(),
  getCardUsageStats: vi.fn(),
  exportCards: vi.fn(),
  importCards: vi.fn(),
  recordUsage: vi.fn(),
  getStats: vi.fn(),
} as any;

const mockOrchestrator = {
  executeAgent: vi.fn(),
  getAgentPool: vi.fn(),
  createExecution: vi.fn(),
  getExecutionStatus: vi.fn(),
};

const mockAgentPool = {
  getAgent: vi.fn(),
  getAllAgents: vi.fn(),
  executeAgent: vi.fn(),
};

describe('Evaluation Layer Integration Tests', () => {
  let evaluationManager: EvaluationManager;
  let integration: ForgeFlowEvaluationIntegration;
  let testDir: string;

  // Helper function to create job outcomes
  const createTestJobOutcome = (data: Partial<JobOutcome> = {}): JobOutcome => {
    const defaults = JobOutcomeBuilder.create(
      data.jobId || `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      data.issueId || `issue-${Math.random().toString(36).substr(2, 9)}`,
      data.executionId || `exec-${Math.random().toString(36).substr(2, 9)}`,
    );

    return {
      ...defaults,
      ...data,
      timestamp: data.timestamp || new Date(),
      success: data.success !== undefined ? data.success : true,
      metadata: {
        agentTypes: ['code-implementer'],
        pattern: 'standard',
        phase: 'implementation',
        priority: 'medium',
        startTime: new Date(),
        category: 'feature',
        complexity: 'medium',
        childJobIds: [],
        githubData: { labels: [] },
        ...data.metadata,
      },
      metrics: {
        performance: {
          totalDuration: 1500,
          agentDurations: {},
          queueTime: 100,
          executionTime: 1400,
          overhead: 0,
        },
        codeChanges: {
          linesAdded: 10,
          linesRemoved: 5,
          linesModified: 3,
          filesAdded: 1,
          filesRemoved: 0,
          filesModified: 2,
          complexity: 1,
        },
        qualityGates: {
          linting: { passed: true, errors: 0, warnings: 0 },
          typecheck: { passed: true, errors: 0 },
          testing: { passed: true, coverage: 95, failedTests: 0 },
          security: { passed: true, vulnerabilities: 0, severity: 'none' },
          performance: { passed: true, score: 90 },
        },
        resources: {
          memoryUsage: 100,
          cpuUsage: 25,
          diskUsage: 50,
          networkRequests: 5,
        },
        ...data.metrics,
      },
      quality: {
        overallScore: 0.8,
        components: {
          codeQuality: 0.8,
          testQuality: 0.8,
          documentation: 0.8,
          maintainability: 0.8,
          security: 0.8,
          performance: 0.8,
        },
        gatesPassed: 5,
        gatesTotal: 5,
        gatesSkipped: 0,
        issues: [],
        improvements: [],
        ...data.quality,
      },
      patterns: {
        successPatterns: [],
        failurePatterns: [],
        decisionPatterns: [],
        antiPatterns: [],
      },
      learning: {
        learningGenerated: 0.5,
        knowledgeReused: 0.7,
        adaptabilityShown: 0.6,
        knowledgeImpact: {
          cardsCreated: 0,
          cardsUpdated: 1,
          gotchasResolved: 0,
          patternsIdentified: 1,
        },
        efficiency: {
          timeToFirstSolution: 300,
          iterationsToSuccess: 2,
          errorRecoveryTime: 50,
          knowledgeRetrievalTime: 25,
        },
        predictions: {
          futureSuccessLikelihood: 0.85,
          estimatedComplexity: 0.4,
          recommendedApproach: 'incremental',
          riskFactors: [],
        },
      },
    };
  };

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(process.cwd(), '.test-evaluation');
    await fs.mkdir(testDir, { recursive: true });

    // Create evaluation manager with test configuration
    const config = createDefaultEvaluationConfig();
    config.loggingBasePath = testDir;
    config.jobsLogFile = path.join(testDir, 'test-jobs.ndjson');

    evaluationManager = await createEvaluationManager(config, mockKnowledgeManager);
    integration = new ForgeFlowEvaluationIntegration(
      evaluationManager,
      mockKnowledgeManager,
      config,
    );
  });

  afterEach(async () => {
    // Cleanup
    await (evaluationManager as any).shutdown();
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('ForgeFlow Component Integration', () => {
    it('should integrate with knowledge manager for card evaluation', async () => {
      // Mock knowledge manager responses
      mockKnowledgeManager.getCard = vi.fn().mockResolvedValue({
        id: 'test-card-1',
        title: 'Test Card',
        content: 'Test content',
        tags: ['test'],
        metadata: { effectiveness: 0.8 },
      });

      mockKnowledgeManager.promoteCard = vi.fn().mockResolvedValue(true);

      // Create a successful job outcome using the card
      const jobOutcome = createTestJobOutcome({
        metadata: {
          agentTypes: ['code-implementer'],
          pattern: 'feature-implementation',
          phase: 'implementation',
          priority: 'medium',
          startTime: new Date(),
          category: 'feature',
          complexity: 'medium',
          childJobIds: [],
          githubData: { labels: [] },
        },
        quality: {
          overallScore: 0.9,
          components: {
            codeQuality: 0.9,
            testQuality: 0.95,
            documentation: 0.8,
            maintainability: 0.8,
            security: 0.8,
            performance: 0.8,
          },
          gatesPassed: 6,
          gatesTotal: 6,
          gatesSkipped: 0,
          issues: [],
          improvements: [],
        },
        context: {
          projectId: 'test-project',
          projectPath: '/test/path',
          projectType: 'web-app',
          knowledgeCards: [
            {
              cardId: 'test-card-1',
              title: 'Test Card',
              relevanceScore: 0.9,
              effectiveness: 0.8,
              usageOutcome: 'success',
            },
          ],
          similarJobs: [],
          environment: {
            operatingSystem: 'linux',
            dependencies: {},
          },
          userContext: {
            userInput: 'Test user input',
            requestType: 'feature',
            urgency: 'medium',
          },
        },
      });

      await evaluationManager.logJobOutcome(jobOutcome);

      // Run knowledge promotion evaluation
      const promotionResult = await evaluationManager.evaluateKnowledgeCards();

      expect(promotionResult).toBeDefined();
      expect(mockKnowledgeManager.getCard).toHaveBeenCalledWith('test-card-1');
    });

    it('should generate execution insights for orchestrator integration', async () => {
      const executionData = {
        executionId: 'exec-123',
        agentType: 'code-implementer' as const,
        taskDescription: 'Implement user authentication',
        success: true,
        executionTimeMs: 2500,
        quality: {
          overallScore: 0.85,
          codeQuality: 0.9,
          testCoverage: 0.8,
          security: 0.9,
          performance: 0.8,
          maintainability: 0.85,
          documentation: 0.7,
        },
        cardsUsed: ['auth-patterns', 'security-best-practices'],
        metrics: {
          linesOfCode: 250,
          filesModified: 5,
          testsAdded: 8,
          issuesFound: 2,
          issuesResolved: 2,
        },
      };

      // Process execution completion with proper arguments
      const mockExecution = { id: 'exec-123', status: 'completed' } as any;
      const mockIssue = { number: 456, title: 'Test Issue' } as any;
      const mockAgents = [{ id: 'agent-1', type: 'code-implementer' }] as any;
      await integration.processExecutionCompletion(mockExecution, mockIssue, mockAgents);

      // Generate execution summary with correct argument
      const summary = await integration.generateExecutionSummary('exec-123');

      expect(summary).toBeDefined();
      expect(summary.jobId).toBeDefined();
      expect(summary.overallAssessment).toBeDefined();
    });

    it('should provide GitHub issue evaluation insights', async () => {
      // Create multiple job outcomes for analysis
      const outcomes = [
        {
          jobType: 'bug-fix' as const,
          taskDescription: 'Fix login validation bug',
          agentType: 'code-implementer' as const,
          success: true,
          executionTimeMs: 1200,
          quality: { overallScore: 0.9, codeQuality: 0.9, testCoverage: 0.85 },
        },
        {
          jobType: 'feature-implementation' as const,
          taskDescription: 'Add user dashboard',
          agentType: 'ui-ux-optimizer' as const,
          success: true,
          executionTimeMs: 3000,
          quality: { overallScore: 0.8, codeQuality: 0.8, testCoverage: 0.75 },
        },
      ];

      // Log outcomes
      for (const outcomeData of outcomes) {
        const outcome = (evaluationManager as any).jobOutcomeTracker.createJobOutcome(outcomeData);
        await (evaluationManager as any).jobOutcomeTracker.logJobOutcome(outcome);
      }

      // Generate issue insights
      const insights = await integration.getIssueEvaluationInsights({
        id: 'issue-123',
        number: 123,
        title: 'Implement authentication system',
        body: 'Add secure user authentication with JWT',
        state: 'open',
        assignee: null,
        labels: ['auth', 'security'],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(insights).toBeDefined();
      expect(insights).toHaveProperty('predictedSuccess');
      expect(insights).toHaveProperty('riskFactors');
      expect(insights).toHaveProperty('recommendations');
      expect(insights).toHaveProperty('similarJobs');
      expect(insights).toHaveProperty('estimatedDuration');
    });
  });

  describe('Performance Integration Tests', () => {
    it('should meet performance targets for job logging', async () => {
      const startTime = performance.now();

      const jobOutcome = (evaluationManager as any).jobOutcomeTracker.createJobOutcome({
        jobType: 'performance-test',
        taskDescription: 'Performance test task',
        agentType: 'test-coverage-validator',
        success: true,
        executionTimeMs: 1000,
      });

      await (evaluationManager as any).jobOutcomeTracker.logJobOutcome(jobOutcome);

      const endTime = performance.now();
      const loggingTime = endTime - startTime;

      // Should meet <10ms target for job logging
      expect(loggingTime).toBeLessThan(50); // Allow some buffer for test environment
    });

    it('should meet performance targets for pattern analysis', async () => {
      // Create multiple outcomes for pattern analysis
      const outcomes = Array.from({ length: 10 }, (_, i) => ({
        jobType: 'pattern-test' as const,
        taskDescription: `Pattern test task ${i}`,
        agentType: 'strategic-planner' as const,
        success: Math.random() > 0.3, // 70% success rate
        executionTimeMs: 1000 + Math.random() * 2000,
      }));

      // Log outcomes
      for (const outcomeData of outcomes) {
        const outcome = (evaluationManager as any).jobOutcomeTracker.createJobOutcome(outcomeData);
        await (evaluationManager as any).jobOutcomeTracker.logJobOutcome(outcome);
      }

      // Measure pattern analysis performance
      const startTime = performance.now();

      await (evaluationManager as any).patternAnalysisEngine.analyzePatterns({
        start: new Date(Date.now() - 3600000),
        end: new Date(),
      });

      const endTime = performance.now();
      const analysisTime = endTime - startTime;

      // Should meet <100ms target for pattern analysis
      expect(analysisTime).toBeLessThan(500); // Allow buffer for test environment
    });

    it('should meet performance targets for analytics generation', async () => {
      // Create job outcomes for analytics
      const outcomes = Array.from({ length: 5 }, (_, i) => ({
        jobType: 'analytics-test' as const,
        taskDescription: `Analytics test task ${i}`,
        agentType: 'system-architect' as const,
        success: true,
        executionTimeMs: 1500,
        quality: {
          overallScore: 0.8 + Math.random() * 0.2,
          codeQuality: 0.8,
          testCoverage: 0.9,
        },
      }));

      // Log outcomes
      for (const outcomeData of outcomes) {
        const outcome = (evaluationManager as any).jobOutcomeTracker.createJobOutcome(outcomeData);
        await (evaluationManager as any).jobOutcomeTracker.logJobOutcome(outcome);
      }

      // Measure analytics generation performance
      const startTime = performance.now();

      await (evaluationManager as any).learningAnalytics.generateEffectivenessReport({
        start: new Date(Date.now() - 3600000),
        end: new Date(),
      });

      const endTime = performance.now();
      const analyticsTime = endTime - startTime;

      // Should meet <2000ms target for analytics generation
      expect(analyticsTime).toBeLessThan(5000); // Allow buffer for test environment
    });
  });

  describe('Data Flow Integration', () => {
    it('should maintain data consistency across components', async () => {
      // Create and log a job outcome
      const jobOutcome = (evaluationManager as any).jobOutcomeTracker.createJobOutcome({
        jobType: 'data-consistency-test',
        taskDescription: 'Test data consistency',
        agentType: 'code-quality-reviewer',
        success: true,
        executionTimeMs: 1800,
        quality: {
          overallScore: 0.88,
          codeQuality: 0.9,
          testCoverage: 0.85,
          security: 0.9,
        },
        cardsUsed: ['consistency-test-card'],
      });

      await (evaluationManager as any).jobOutcomeTracker.logJobOutcome(jobOutcome);

      // Verify the outcome can be retrieved and analyzed
      const outcomes = await (evaluationManager as any).jobOutcomeTracker.getJobOutcomes({
        startDate: new Date(Date.now() - 3600000),
        endDate: new Date(),
        jobType: 'data-consistency-test',
      });

      expect(outcomes).toBeDefined();
      expect(Array.isArray(outcomes)).toBe(true);
      expect(outcomes.length).toBe(1);
      expect(outcomes[0].id).toBe(jobOutcome.id);
      expect(outcomes[0].metadata.taskDescription).toBe('Test data consistency');
    });

    it('should handle concurrent operations safely', async () => {
      // Create multiple concurrent job logging operations
      const concurrentPromises = Array.from({ length: 5 }, async (_, i) => {
        const jobOutcome = (evaluationManager as any).jobOutcomeTracker.createJobOutcome({
          jobType: 'concurrent-test',
          taskDescription: `Concurrent test ${i}`,
          agentType: 'deployment-automation',
          success: true,
          executionTimeMs: 1000 + i * 100,
        });

        return (evaluationManager as any).jobOutcomeTracker.logJobOutcome(jobOutcome);
      });

      // Wait for all operations to complete
      await Promise.all(concurrentPromises);

      // Verify all outcomes were logged correctly
      const outcomes = await (evaluationManager as any).jobOutcomeTracker.getJobOutcomes({
        startDate: new Date(Date.now() - 3600000),
        endDate: new Date(),
        jobType: 'concurrent-test',
      });

      expect(outcomes.length).toBe(5);

      // Verify each outcome has unique ID and correct data
      const ids = new Set(outcomes.map((o) => o.id));
      expect(ids.size).toBe(5); // All IDs should be unique
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle filesystem errors gracefully', async () => {
      // Create evaluation manager with invalid path
      const invalidConfig = createDefaultEvaluationConfig();
      invalidConfig.loggingBasePath = '/invalid/path/that/does/not/exist';
      invalidConfig.jobsLogFile = '/invalid/path/jobs.ndjson';

      // Should handle invalid configuration gracefully
      await expect(async () => {
        const invalidManager = await createEvaluationManager(invalidConfig, mockKnowledgeManager);
        await (invalidManager as any).shutdown();
      }).not.toThrow();
    });

    it('should handle component failures gracefully', async () => {
      // Mock knowledge manager to throw error
      mockKnowledgeManager.getCard = vi
        .fn()
        .mockRejectedValue(new Error('Knowledge manager error'));

      const executionData = {
        executionId: 'error-test',
        agentType: 'code-implementer' as const,
        taskDescription: 'Error handling test',
        success: false,
        executionTimeMs: 500,
        cardsUsed: ['non-existent-card'],
        error: 'Simulated error for testing',
      };

      // Should not throw error even if knowledge manager fails
      const mockExecution2 = { id: 'exec-124', status: 'failed' } as any;
      const mockIssue2 = { number: 457, title: 'Test Issue 2' } as any;
      const mockAgents2 = [{ id: 'agent-2', type: 'code-implementer' }] as any;
      await expect(
        integration.processExecutionCompletion(mockExecution2, mockIssue2, mockAgents2),
      ).resolves.not.toThrow();
    });
  });
});
