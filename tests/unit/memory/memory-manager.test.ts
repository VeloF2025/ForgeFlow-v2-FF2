// Memory Manager Test Suite
// Comprehensive testing for the Memory Layer core functionality

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import { MemoryManager } from '../../../src/memory/memory-manager';
import { KnowledgeManager } from '../../../src/knowledge/knowledge-manager';
import { MemoryConfig, JobMemory, Decision, Gotcha, ContextEntry, Outcome } from '../../../src/memory/types';
import { testMemoryConfig } from '../../../src/memory/index';

describe('MemoryManager', () => {
  let memoryManager: MemoryManager;
  let knowledgeManager: KnowledgeManager;
  let testConfig: MemoryConfig;
  let testStoragePath: string;

  beforeAll(() => {
    // Set up test environment
    testStoragePath = path.join(process.cwd(), '.ff2-test-memory');
    testConfig = {
      ...testMemoryConfig,
      storageBasePath: testStoragePath
    };
  });

  beforeEach(async () => {
    // Clean up any existing test data
    try {
      await fs.rm(testStoragePath, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }

    // Create fresh instances
    knowledgeManager = new KnowledgeManager({
      storageBasePath: path.join(testStoragePath, 'knowledge'),
      maxCardsPerCategory: 100,
      gotchaPromotionThreshold: 3,
      effectivenessDecayRate: 0.1,
      cleanupIntervalDays: 1,
      autoPromoteGotchas: false
    });

    await knowledgeManager.initialize();

    memoryManager = new MemoryManager(testConfig, knowledgeManager);
    await memoryManager.initialize();
  });

  afterEach(async () => {
    // Clean up test data
    try {
      await fs.rm(testStoragePath, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  });

  afterAll(async () => {
    // Final cleanup
    try {
      await fs.rm(testStoragePath, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      expect(memoryManager).toBeDefined();
    });

    it('should create required directory structure', async () => {
      const issuesDir = path.join(testStoragePath, 'issues');
      const logsDir = path.join(testStoragePath, 'logs');
      const analyticsDir = path.join(testStoragePath, 'analytics');
      const archiveDir = path.join(testStoragePath, 'archive');

      expect(await fs.access(issuesDir).then(() => true).catch(() => false)).toBe(true);
      expect(await fs.access(logsDir).then(() => true).catch(() => false)).toBe(true);
      expect(await fs.access(analyticsDir).then(() => true).catch(() => false)).toBe(true);
      expect(await fs.access(archiveDir).then(() => true).catch(() => false)).toBe(true);
    });

    it('should not re-initialize if already initialized', async () => {
      const spy = vi.spyOn(console, 'log');
      await memoryManager.initialize(); // Second initialization
      // Should not throw or create duplicate directories
      expect(spy).not.toHaveBeenCalledWith('Initializing Memory Layer');
      spy.mockRestore();
    });
  });

  describe('Job Memory Lifecycle', () => {
    it('should initialize job memory successfully', async () => {
      const jobMemory = await memoryManager.initializeJobMemory('test-issue-123', 'session-456');

      expect(jobMemory).toBeDefined();
      expect(jobMemory.issueId).toBe('test-issue-123');
      expect(jobMemory.sessionId).toBe('session-456');
      expect(jobMemory.status).toBe('running');
      expect(jobMemory.decisions).toEqual([]);
      expect(jobMemory.gotchas).toEqual([]);
      expect(jobMemory.context).toEqual([]);
      expect(jobMemory.outcomes).toEqual([]);
      expect(jobMemory.metadata.agentTypes).toEqual([]);
    });

    it('should retrieve job memory by ID', async () => {
      const originalMemory = await memoryManager.initializeJobMemory('test-issue-123', 'session-456');
      const retrievedMemory = await memoryManager.getJobMemory(originalMemory.jobId);

      expect(retrievedMemory).toBeDefined();
      expect(retrievedMemory?.jobId).toBe(originalMemory.jobId);
      expect(retrievedMemory?.issueId).toBe('test-issue-123');
    });

    it('should return null for non-existent job memory', async () => {
      const memory = await memoryManager.getJobMemory('non-existent-job');
      expect(memory).toBeNull();
    });

    it('should update job memory successfully', async () => {
      const originalMemory = await memoryManager.initializeJobMemory('test-issue-123', 'session-456');
      
      const updatedMemory = await memoryManager.updateJobMemory(originalMemory.jobId, {
        metadata: {
          ...originalMemory.metadata,
          complexity: 'high',
          priority: 'critical'
        }
      });

      expect(updatedMemory.metadata.complexity).toBe('high');
      expect(updatedMemory.metadata.priority).toBe('critical');
      expect(updatedMemory.jobId).toBe(originalMemory.jobId); // ID should not change
    });

    it('should complete job memory with final outcome', async () => {
      const originalMemory = await memoryManager.initializeJobMemory('test-issue-123', 'session-456');
      
      const finalOutcome: Omit<Outcome, 'id' | 'timestamp'> = {
        agentType: 'test-agent',
        type: 'success',
        category: 'task-completion',
        description: 'Job completed successfully',
        metrics: {
          duration: 60,
          codeChanges: {
            linesAdded: 100,
            linesRemoved: 20,
            filesModified: 5
          },
          qualityMetrics: {
            testCoverage: 95,
            lintErrors: 0,
            typeErrors: 0,
            complexity: 3
          }
        },
        relatedDecisions: [],
        relatedGotchas: [],
        lessons: ['Great test coverage led to successful outcome']
      };

      const completedMemory = await memoryManager.completeJobMemory(originalMemory.jobId, finalOutcome);

      expect(completedMemory.status).toBe('completed');
      expect(completedMemory.endTime).toBeDefined();
      expect(completedMemory.metadata.totalDuration).toBeGreaterThan(0);
      expect(completedMemory.outcomes).toHaveLength(1);
      expect(completedMemory.outcomes[0].type).toBe('success');
    });

    it('should handle job completion with failure outcome', async () => {
      const originalMemory = await memoryManager.initializeJobMemory('test-issue-123', 'session-456');
      
      const finalOutcome: Omit<Outcome, 'id' | 'timestamp'> = {
        agentType: 'test-agent',
        type: 'failure',
        category: 'task-completion',
        description: 'Job failed due to critical error',
        metrics: {
          duration: 30,
          codeChanges: {
            linesAdded: 0,
            linesRemoved: 0,
            filesModified: 0
          },
          qualityMetrics: {
            testCoverage: 0,
            lintErrors: 5,
            typeErrors: 2,
            complexity: 0
          }
        },
        relatedDecisions: [],
        relatedGotchas: [],
        lessons: ['Better error handling needed']
      };

      const completedMemory = await memoryManager.completeJobMemory(originalMemory.jobId, finalOutcome);

      expect(completedMemory.status).toBe('failed');
      expect(completedMemory.outcomes[0].type).toBe('failure');
    });
  });

  describe('Memory Components', () => {
    let jobMemory: JobMemory;

    beforeEach(async () => {
      jobMemory = await memoryManager.initializeJobMemory('test-issue-123', 'session-456');
    });

    describe('Decision Recording', () => {
      it('should record a decision successfully', async () => {
        const decisionData: Omit<Decision, 'id' | 'timestamp'> = {
          agentType: 'strategic-planner',
          category: 'architectural',
          description: 'Choose between monolith vs microservices',
          options: [
            {
              option: 'Monolithic architecture',
              pros: ['Simpler deployment', 'Better performance for small scale'],
              cons: ['Harder to scale', 'Technology lock-in'],
              selected: false
            },
            {
              option: 'Microservices architecture',
              pros: ['Better scalability', 'Technology diversity'],
              cons: ['Complex deployment', 'Network overhead'],
              selected: true
            }
          ],
          reasoning: 'Given the expected growth and team structure, microservices provide better long-term scalability',
          relatedContext: []
        };

        const decision = await memoryManager.recordDecision(jobMemory.jobId, decisionData);

        expect(decision).toBeDefined();
        expect(decision.id).toBeDefined();
        expect(decision.timestamp).toBeInstanceOf(Date);
        expect(decision.agentType).toBe('strategic-planner');
        expect(decision.category).toBe('architectural');
        expect(decision.options).toHaveLength(2);
        expect(decision.options[1].selected).toBe(true);
      });

      it('should update agent types in metadata when recording decision', async () => {
        await memoryManager.recordDecision(jobMemory.jobId, {
          agentType: 'code-implementer',
          category: 'implementation',
          description: 'Test decision',
          options: [],
          reasoning: 'Test reasoning',
          relatedContext: []
        });

        const updatedMemory = await memoryManager.getJobMemory(jobMemory.jobId);
        expect(updatedMemory?.metadata.agentTypes).toContain('code-implementer');
      });

      it('should update decision outcome', async () => {
        const decision = await memoryManager.recordDecision(jobMemory.jobId, {
          agentType: 'strategic-planner',
          category: 'architectural',
          description: 'Test decision',
          options: [],
          reasoning: 'Test reasoning',
          relatedContext: []
        });

        const outcome = {
          success: true,
          metrics: {
            implementationTime: 45,
            codeQuality: 0.9,
            maintainability: 0.85,
            testCoverage: 95
          },
          lessons: ['Good architecture choice led to clean implementation'],
          timestamp: new Date()
        };

        const updatedDecision = await memoryManager.updateDecisionOutcome(jobMemory.jobId, decision.id, outcome);

        expect(updatedDecision.outcome).toBeDefined();
        expect(updatedDecision.outcome?.success).toBe(true);
        expect(updatedDecision.outcome?.metrics.codeQuality).toBe(0.9);
      });
    });

    describe('Gotcha Recording', () => {
      it('should record a gotcha successfully', async () => {
        const gotchaData: Omit<Gotcha, 'id' | 'timestamp'> = {
          agentType: 'code-implementer',
          severity: 'high',
          category: 'build',
          description: 'TypeScript compilation fails with circular dependency',
          errorPattern: 'Circular dependency detected',
          context: 'Building user authentication module',
          preventionNotes: ['Use dependency injection', 'Restructure imports'],
          relatedDecisions: []
        };

        const gotcha = await memoryManager.recordGotcha(jobMemory.jobId, gotchaData);

        expect(gotcha).toBeDefined();
        expect(gotcha.id).toBeDefined();
        expect(gotcha.timestamp).toBeInstanceOf(Date);
        expect(gotcha.severity).toBe('high');
        expect(gotcha.category).toBe('build');
        expect(gotcha.preventionNotes).toHaveLength(2);
      });

      it('should resolve a gotcha', async () => {
        const gotcha = await memoryManager.recordGotcha(jobMemory.jobId, {
          agentType: 'code-implementer',
          severity: 'high',
          category: 'build',
          description: 'Test gotcha',
          errorPattern: 'Test pattern',
          context: 'Test context',
          preventionNotes: [],
          relatedDecisions: []
        });

        const resolution = {
          resolved: true,
          resolutionTime: 30,
          solution: 'Restructured import dependencies',
          preventionSteps: ['Use barrel exports', 'Check dependency graph'],
          confidence: 0.9,
          timestamp: new Date()
        };

        const resolvedGotcha = await memoryManager.resolveGotcha(jobMemory.jobId, gotcha.id, resolution);

        expect(resolvedGotcha.resolution).toBeDefined();
        expect(resolvedGotcha.resolution?.resolved).toBe(true);
        expect(resolvedGotcha.resolution?.solution).toBe('Restructured import dependencies');
        expect(resolvedGotcha.resolution?.confidence).toBe(0.9);
      });
    });

    describe('Context Recording', () => {
      it('should record context entry successfully', async () => {
        const contextData: Omit<ContextEntry, 'id' | 'timestamp' | 'usage'> = {
          agentType: 'code-implementer',
          type: 'code-analysis',
          source: '/src/auth/user.service.ts',
          content: 'UserService class with authentication methods',
          relevanceScore: 0.85
        };

        const context = await memoryManager.recordContext(jobMemory.jobId, contextData);

        expect(context).toBeDefined();
        expect(context.id).toBeDefined();
        expect(context.timestamp).toBeInstanceOf(Date);
        expect(context.type).toBe('code-analysis');
        expect(context.relevanceScore).toBe(0.85);
        expect(context.usage).toEqual([]);
      });

      it('should track context usage', async () => {
        const context = await memoryManager.recordContext(jobMemory.jobId, {
          agentType: 'code-implementer',
          type: 'knowledge-retrieval',
          source: 'knowledge-card-123',
          content: 'Authentication best practices',
          relevanceScore: 0.9
        });

        await memoryManager.trackContextUsage(jobMemory.jobId, context.id, {
          impact: 'high'
        });

        const updatedMemory = await memoryManager.getJobMemory(jobMemory.jobId);
        const updatedContext = updatedMemory?.context.find(c => c.id === context.id);

        expect(updatedContext?.usage).toHaveLength(1);
        expect(updatedContext?.usage[0].impact).toBe('high');
        expect(updatedContext?.usage[0].timestamp).toBeInstanceOf(Date);
      });
    });

    describe('Outcome Recording', () => {
      it('should record outcome successfully', async () => {
        const outcomeData: Omit<Outcome, 'id' | 'timestamp'> = {
          agentType: 'test-coverage-validator',
          type: 'success',
          category: 'quality-check',
          description: 'Test coverage validation passed',
          metrics: {
            duration: 15,
            codeChanges: {
              linesAdded: 0,
              linesRemoved: 0,
              filesModified: 0
            },
            qualityMetrics: {
              testCoverage: 96,
              lintErrors: 0,
              typeErrors: 0,
              complexity: 2
            }
          },
          relatedDecisions: [],
          relatedGotchas: [],
          lessons: ['Comprehensive test suite provides confidence']
        };

        const outcome = await memoryManager.recordOutcome(jobMemory.jobId, outcomeData);

        expect(outcome).toBeDefined();
        expect(outcome.id).toBeDefined();
        expect(outcome.timestamp).toBeInstanceOf(Date);
        expect(outcome.type).toBe('success');
        expect(outcome.metrics.qualityMetrics.testCoverage).toBe(96);
      });
    });
  });

  describe('Analytics and Insights', () => {
    let jobMemory: JobMemory;

    beforeEach(async () => {
      jobMemory = await memoryManager.initializeJobMemory('test-issue-123', 'session-456');
      
      // Add some test data
      await memoryManager.recordDecision(jobMemory.jobId, {
        agentType: 'strategic-planner',
        category: 'architectural',
        description: 'Test decision',
        options: [],
        reasoning: 'Test reasoning',
        relatedContext: []
      });

      await memoryManager.recordGotcha(jobMemory.jobId, {
        agentType: 'code-implementer',
        severity: 'medium',
        category: 'build',
        description: 'Test gotcha',
        errorPattern: 'Test pattern',
        context: 'Test context',
        preventionNotes: ['Test prevention'],
        relatedDecisions: []
      });
    });

    it('should calculate job analytics', async () => {
      const analytics = await memoryManager.calculateJobAnalytics(jobMemory.jobId);

      expect(analytics).toBeDefined();
      expect(analytics.efficiencyMetrics).toBeDefined();
      expect(analytics.patternMatches).toBeDefined();
      expect(typeof analytics.learningScore).toBe('number');
      expect(typeof analytics.reuseScore).toBe('number');
      expect(typeof analytics.innovationScore).toBe('number');
      expect(analytics.learningScore).toBeGreaterThanOrEqual(0);
      expect(analytics.learningScore).toBeLessThanOrEqual(1);
    });

    it('should get memory insights', async () => {
      const insights = await memoryManager.getMemoryInsights(jobMemory.jobId);

      expect(insights).toBeDefined();
      expect(insights.jobId).toBe(jobMemory.jobId);
      expect(insights.summary).toBeDefined();
      expect(insights.patterns).toBeDefined();
      expect(insights.recommendations).toBeDefined();
      expect(insights.keyMetrics).toBeDefined();
      
      expect(typeof insights.summary.efficiency).toBe('number');
      expect(typeof insights.summary.learningValue).toBe('number');
      expect(typeof insights.summary.reuseRate).toBe('number');
      expect(typeof insights.summary.overallSuccess).toBe('boolean');
    });

    it('should search similar patterns', async () => {
      const patternQuery = {
        type: 'decision' as const,
        description: 'test',
        minConfidence: 0.5,
        maxResults: 10
      };

      const patterns = await memoryManager.searchSimilarPatterns(patternQuery);

      expect(Array.isArray(patterns)).toBe(true);
      // Patterns array might be empty in a fresh test environment
    });
  });

  describe('Global Tracking', () => {
    it('should maintain global job log', async () => {
      const job1 = await memoryManager.initializeJobMemory('issue-1', 'session-1');
      const job2 = await memoryManager.initializeJobMemory('issue-2', 'session-2');

      const globalLog = await memoryManager.getGlobalJobLog();

      expect(globalLog).toHaveLength(2);
      expect(globalLog.find(entry => entry.jobId === job1.jobId)).toBeDefined();
      expect(globalLog.find(entry => entry.jobId === job2.jobId)).toBeDefined();
    });

    it('should get jobs by issue ID', async () => {
      await memoryManager.initializeJobMemory('issue-1', 'session-1');
      await memoryManager.initializeJobMemory('issue-1', 'session-2'); // Same issue, different session
      await memoryManager.initializeJobMemory('issue-2', 'session-3');

      const issue1Jobs = await memoryManager.getJobsByIssue('issue-1');
      const issue2Jobs = await memoryManager.getJobsByIssue('issue-2');

      expect(issue1Jobs).toHaveLength(2);
      expect(issue2Jobs).toHaveLength(1);
      expect(issue1Jobs.every(job => job.issueId === 'issue-1')).toBe(true);
    });

    it('should get jobs by agent type', async () => {
      const job = await memoryManager.initializeJobMemory('issue-1', 'session-1');
      
      // Record activities from different agents
      await memoryManager.recordDecision(job.jobId, {
        agentType: 'strategic-planner',
        category: 'architectural',
        description: 'Test decision',
        options: [],
        reasoning: 'Test',
        relatedContext: []
      });

      await memoryManager.recordGotcha(job.jobId, {
        agentType: 'code-implementer',
        severity: 'low',
        category: 'build',
        description: 'Test gotcha',
        errorPattern: 'Test',
        context: 'Test',
        preventionNotes: [],
        relatedDecisions: []
      });

      const plannerJobs = await memoryManager.getJobsByAgent('strategic-planner');
      const implementerJobs = await memoryManager.getJobsByAgent('code-implementer');

      expect(plannerJobs.length).toBeGreaterThanOrEqual(1);
      expect(implementerJobs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when not initialized', async () => {
      const uninitializedManager = new MemoryManager(testConfig);
      
      await expect(uninitializedManager.getJobMemory('test-job'))
        .rejects.toThrow('Memory Layer not initialized');
    });

    it('should throw error for non-existent job updates', async () => {
      await expect(memoryManager.updateJobMemory('non-existent-job', {}))
        .rejects.toThrow('Job memory not found');
    });

    it('should throw error for non-existent job completion', async () => {
      const fakeOutcome: Omit<Outcome, 'id' | 'timestamp'> = {
        agentType: 'test',
        type: 'success',
        category: 'task-completion',
        description: 'Test',
        metrics: {
          duration: 1,
          codeChanges: { linesAdded: 0, linesRemoved: 0, filesModified: 0 },
          qualityMetrics: { testCoverage: 0, lintErrors: 0, typeErrors: 0, complexity: 0 }
        },
        relatedDecisions: [],
        relatedGotchas: [],
        lessons: []
      };

      await expect(memoryManager.completeJobMemory('non-existent-job', fakeOutcome))
        .rejects.toThrow('Job memory not found');
    });

    it('should throw error for invalid gotcha resolution', async () => {
      const job = await memoryManager.initializeJobMemory('issue-1', 'session-1');
      
      const resolution = {
        resolved: true,
        resolutionTime: 10,
        solution: 'Test solution',
        preventionSteps: [],
        confidence: 0.8,
        timestamp: new Date()
      };

      await expect(memoryManager.resolveGotcha(job.jobId, 'non-existent-gotcha', resolution))
        .rejects.toThrow('Gotcha not found');
    });
  });

  describe('Performance', () => {
    it('should meet performance targets for memory operations', async () => {
      const startTime = Date.now();
      
      const job = await memoryManager.initializeJobMemory('perf-test', 'session-1');
      await memoryManager.getJobMemory(job.jobId);
      await memoryManager.updateJobMemory(job.jobId, { metadata: { ...job.metadata, complexity: 'high' } });
      
      const duration = Date.now() - startTime;
      
      // Should complete all operations within performance threshold
      expect(duration).toBeLessThan(testConfig.performanceThresholds.memoryOperationTimeMs * 3);
    });

    it('should handle concurrent operations without corruption', async () => {
      const job = await memoryManager.initializeJobMemory('concurrent-test', 'session-1');
      
      // Create multiple concurrent operations
      const operations = [
        memoryManager.recordDecision(job.jobId, {
          agentType: 'agent-1',
          category: 'implementation',
          description: 'Decision 1',
          options: [],
          reasoning: 'Test',
          relatedContext: []
        }),
        memoryManager.recordDecision(job.jobId, {
          agentType: 'agent-2',
          category: 'testing',
          description: 'Decision 2',
          options: [],
          reasoning: 'Test',
          relatedContext: []
        }),
        memoryManager.recordGotcha(job.jobId, {
          agentType: 'agent-3',
          severity: 'low',
          category: 'runtime',
          description: 'Concurrent gotcha',
          errorPattern: 'Test',
          context: 'Test',
          preventionNotes: [],
          relatedDecisions: []
        })
      ];

      await Promise.all(operations);
      
      const finalMemory = await memoryManager.getJobMemory(job.jobId);
      expect(finalMemory?.decisions).toHaveLength(2);
      expect(finalMemory?.gotchas).toHaveLength(1);
      expect(finalMemory?.metadata.agentTypes).toHaveLength(3);
    });
  });

  describe('Maintenance', () => {
    it('should cleanup old memories', async () => {
      // Create some test jobs
      const job1 = await memoryManager.initializeJobMemory('old-job-1', 'session-1');
      const job2 = await memoryManager.initializeJobMemory('old-job-2', 'session-2');

      // Complete the jobs
      await memoryManager.completeJobMemory(job1.jobId, {
        agentType: 'test',
        type: 'success',
        category: 'task-completion',
        description: 'Completed',
        metrics: {
          duration: 60,
          codeChanges: { linesAdded: 10, linesRemoved: 0, filesModified: 1 },
          qualityMetrics: { testCoverage: 90, lintErrors: 0, typeErrors: 0, complexity: 1 }
        },
        relatedDecisions: [],
        relatedGotchas: [],
        lessons: []
      });

      await memoryManager.completeJobMemory(job2.jobId, {
        agentType: 'test',
        type: 'success',
        category: 'task-completion',
        description: 'Completed',
        metrics: {
          duration: 30,
          codeChanges: { linesAdded: 5, linesRemoved: 0, filesModified: 1 },
          qualityMetrics: { testCoverage: 85, lintErrors: 0, typeErrors: 0, complexity: 1 }
        },
        relatedDecisions: [],
        relatedGotchas: [],
        lessons: []
      });

      // Run cleanup (in test config, retention is 1 day, so won't actually clean up recent jobs)
      await memoryManager.cleanup();
      
      // Jobs should still exist since they're recent
      const globalLog = await memoryManager.getGlobalJobLog();
      expect(globalLog.length).toBeGreaterThanOrEqual(2);
    });

    it('should archive job memory', async () => {
      const job = await memoryManager.initializeJobMemory('archive-test', 'session-1');
      
      await memoryManager.completeJobMemory(job.jobId, {
        agentType: 'test',
        type: 'success',
        category: 'task-completion',
        description: 'Ready for archive',
        metrics: {
          duration: 45,
          codeChanges: { linesAdded: 20, linesRemoved: 5, filesModified: 3 },
          qualityMetrics: { testCoverage: 95, lintErrors: 0, typeErrors: 0, complexity: 2 }
        },
        relatedDecisions: [],
        relatedGotchas: [],
        lessons: ['Archive test successful']
      });

      await memoryManager.archiveJobMemory(job.jobId);
      
      // Original memory should be gone
      const memory = await memoryManager.getJobMemory(job.jobId);
      expect(memory).toBeNull();

      // Archive file should exist
      const archivePath = path.join(testStoragePath, 'archive', `${job.jobId}.json`);
      const archiveExists = await fs.access(archivePath).then(() => true).catch(() => false);
      expect(archiveExists).toBe(true);
    });
  });
});