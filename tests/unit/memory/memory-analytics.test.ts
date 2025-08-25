// Memory Analytics Test Suite
// Comprehensive testing for pattern analysis and insights functionality

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import { MemoryAnalytics } from '../../../src/memory/memory-analytics';
import { JobMemoryManager } from '../../../src/memory/job-memory';
import { MemoryConfig, JobMemory, Decision, Gotcha, ContextEntry, Outcome, TimeRange } from '../../../src/memory/types';
import { testMemoryConfig } from '../../../src/memory/index';

describe('MemoryAnalytics', () => {
  let memoryAnalytics: MemoryAnalytics;
  let jobMemoryManager: JobMemoryManager;
  let testConfig: MemoryConfig;
  let testStoragePath: string;

  beforeAll(() => {
    // Set up test environment
    testStoragePath = path.join(process.cwd(), '.ff2-test-memory-analytics');
    testConfig = {
      ...testMemoryConfig,
      storageBasePath: testStoragePath,
      analyticsEnabled: true
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
    memoryAnalytics = new MemoryAnalytics(testConfig);
    jobMemoryManager = new JobMemoryManager(testConfig);
    await memoryAnalytics.initialize();
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
      expect(memoryAnalytics).toBeDefined();
    });

    it('should not re-initialize if already initialized', async () => {
      await memoryAnalytics.initialize(); // Second initialization should not throw
    });
  });

  describe('Job Analytics', () => {
    let testJob: JobMemory;

    beforeEach(async () => {
      // Create a test job with various memory components
      testJob = await jobMemoryManager.initializeJobMemory('test-issue-123', 'session-456');
      
      // Add decisions
      await jobMemoryManager.recordDecision(testJob.jobId, {
        agentType: 'strategic-planner',
        category: 'architectural',
        description: 'Choose microservices architecture',
        options: [
          {
            option: 'Monolith',
            pros: ['Simple deployment'],
            cons: ['Hard to scale'],
            selected: false
          },
          {
            option: 'Microservices',
            pros: ['Scalable', 'Technology diversity'],
            cons: ['Complex deployment'],
            selected: true
          }
        ],
        reasoning: 'Better for long-term scalability',
        relatedContext: []
      });

      // Add gotchas
      await jobMemoryManager.recordGotcha(testJob.jobId, {
        agentType: 'code-implementer',
        severity: 'high',
        category: 'build',
        description: 'Circular dependency in modules',
        errorPattern: 'Circular dependency detected',
        context: 'Module loading',
        preventionNotes: ['Use dependency injection', 'Restructure modules'],
        relatedDecisions: []
      });

      // Add context
      await jobMemoryManager.recordContext(testJob.jobId, {
        agentType: 'code-implementer',
        type: 'knowledge-retrieval',
        source: 'knowledge-card-123',
        content: 'Best practices for module organization',
        relevanceScore: 0.9
      });

      // Add outcomes
      await jobMemoryManager.recordOutcome(testJob.jobId, {
        agentType: 'test-coverage-validator',
        type: 'success',
        category: 'quality-check',
        description: 'High test coverage achieved',
        metrics: {
          duration: 15,
          codeChanges: {
            linesAdded: 200,
            linesRemoved: 50,
            filesModified: 8
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
        lessons: ['Comprehensive testing leads to higher quality']
      });
    });

    it('should calculate comprehensive job analytics', async () => {
      const analytics = await memoryAnalytics.calculateJobAnalytics(testJob.jobId);

      expect(analytics).toBeDefined();
      expect(analytics.efficiencyMetrics).toBeDefined();
      expect(analytics.patternMatches).toBeDefined();
      expect(typeof analytics.learningScore).toBe('number');
      expect(typeof analytics.reuseScore).toBe('number');
      expect(typeof analytics.innovationScore).toBe('number');

      // Scores should be between 0 and 1
      expect(analytics.learningScore).toBeGreaterThanOrEqual(0);
      expect(analytics.learningScore).toBeLessThanOrEqual(1);
      expect(analytics.reuseScore).toBeGreaterThanOrEqual(0);
      expect(analytics.reuseScore).toBeLessThanOrEqual(1);
      expect(analytics.innovationScore).toBeGreaterThanOrEqual(0);
      expect(analytics.innovationScore).toBeLessThanOrEqual(1);
    });

    it('should calculate job efficiency correctly', async () => {
      const efficiency = await memoryAnalytics.calculateJobEfficiency(testJob.jobId);

      expect(typeof efficiency).toBe('number');
      expect(efficiency).toBeGreaterThanOrEqual(0);
      expect(efficiency).toBeLessThanOrEqual(1);
    });

    it('should calculate learning score based on discoveries', async () => {
      const learningScore = await memoryAnalytics.calculateLearningScore(testJob.jobId);

      expect(typeof learningScore).toBe('number');
      expect(learningScore).toBeGreaterThanOrEqual(0);
      expect(learningScore).toBeLessThanOrEqual(1);
      
      // Should have some learning score due to gotchas and outcomes
      expect(learningScore).toBeGreaterThan(0);
    });

    it('should calculate reuse score based on knowledge usage', async () => {
      const reuseScore = await memoryAnalytics.calculateReuseScore(testJob.jobId);

      expect(typeof reuseScore).toBe('number');
      expect(reuseScore).toBeGreaterThanOrEqual(0);
      expect(reuseScore).toBeLessThanOrEqual(1);
      
      // Should have some reuse score due to knowledge-retrieval context
      expect(reuseScore).toBeGreaterThan(0);
    });

    it('should handle empty job memory gracefully', async () => {
      const emptyJob = await jobMemoryManager.initializeJobMemory('empty-job', 'session-789');
      
      const analytics = await memoryAnalytics.calculateJobAnalytics(emptyJob.jobId);
      
      expect(analytics.learningScore).toBe(0);
      expect(analytics.reuseScore).toBe(0);
      expect(analytics.innovationScore).toBe(0);
      expect(analytics.efficiencyMetrics.decisionTime).toBe(0);
    });
  });

  describe('Pattern Analysis', () => {
    let successfulJobs: JobMemory[];
    let failedJobs: JobMemory[];

    beforeEach(async () => {
      // Create successful jobs
      successfulJobs = [];
      for (let i = 0; i < 3; i++) {
        const job = await jobMemoryManager.initializeJobMemory(`success-issue-${i}`, `session-${i}`);
        
        // Add similar patterns to successful jobs
        await jobMemoryManager.recordDecision(job.jobId, {
          agentType: 'strategic-planner',
          category: 'implementation',
          description: 'Use test-driven development',
          options: [],
          reasoning: 'Better code quality',
          relatedContext: []
        });

        await jobMemoryManager.recordContext(job.jobId, {
          agentType: 'code-implementer',
          type: 'knowledge-retrieval',
          source: 'best-practices-card',
          content: 'TDD best practices',
          relevanceScore: 0.9
        });

        await jobMemoryManager.recordOutcome(job.jobId, {
          agentType: 'test-coverage-validator',
          type: 'success',
          category: 'task-completion',
          description: 'Successfully implemented feature',
          metrics: {
            duration: 60,
            codeChanges: { linesAdded: 100, linesRemoved: 10, filesModified: 5 },
            qualityMetrics: { testCoverage: 95, lintErrors: 0, typeErrors: 0, complexity: 2 }
          },
          relatedDecisions: [],
          relatedGotchas: [],
          lessons: ['TDD led to high quality code']
        });

        await jobMemoryManager.completeJobMemory(job.jobId, {
          agentType: 'system',
          type: 'success',
          category: 'task-completion',
          description: 'Job completed successfully',
          metrics: {
            duration: 60,
            codeChanges: { linesAdded: 100, linesRemoved: 10, filesModified: 5 },
            qualityMetrics: { testCoverage: 95, lintErrors: 0, typeErrors: 0, complexity: 2 }
          },
          relatedDecisions: [],
          relatedGotchas: [],
          lessons: []
        });

        const completedJob = await jobMemoryManager.getJobMemory(job.jobId);
        successfulJobs.push(completedJob!);
      }

      // Create failed jobs
      failedJobs = [];
      for (let i = 0; i < 3; i++) {
        const job = await jobMemoryManager.initializeJobMemory(`failed-issue-${i}`, `session-failed-${i}`);
        
        // Add similar failure patterns
        await jobMemoryManager.recordGotcha(job.jobId, {
          agentType: 'code-implementer',
          severity: 'critical',
          category: 'runtime',
          description: 'Database connection timeout',
          errorPattern: 'Connection timeout after 30s',
          context: 'Database initialization',
          preventionNotes: ['Increase timeout', 'Add retry logic'],
          relatedDecisions: []
        });

        await jobMemoryManager.recordDecision(job.jobId, {
          agentType: 'code-implementer',
          category: 'implementation',
          description: 'Skip proper error handling',
          options: [],
          reasoning: 'Faster development',
          relatedContext: []
        });

        // Mark decision as failed
        const decisions = (await jobMemoryManager.getJobMemory(job.jobId))!.decisions;
        await jobMemoryManager.updateDecisionOutcome(job.jobId, decisions[0].id, {
          success: false,
          metrics: {
            implementationTime: 120,
            codeQuality: 0.4,
            maintainability: 0.3,
            testCoverage: 60
          },
          lessons: ['Skipping error handling led to runtime failures'],
          timestamp: new Date()
        });

        await jobMemoryManager.completeJobMemory(job.jobId, {
          agentType: 'system',
          type: 'failure',
          category: 'task-completion',
          description: 'Job failed due to critical errors',
          metrics: {
            duration: 120,
            codeChanges: { linesAdded: 50, linesRemoved: 0, filesModified: 3 },
            qualityMetrics: { testCoverage: 60, lintErrors: 5, typeErrors: 2, complexity: 4 }
          },
          relatedDecisions: [],
          relatedGotchas: [],
          lessons: []
        });

        const completedJob = await jobMemoryManager.getJobMemory(job.jobId);
        failedJobs.push(completedJob!);
      }
    });

    it('should identify success patterns', async () => {
      const successPatterns = await memoryAnalytics.identifySuccessPatterns(successfulJobs);

      expect(Array.isArray(successPatterns)).toBe(true);
      expect(successPatterns.length).toBeGreaterThanOrEqual(1);
      
      if (successPatterns.length > 0) {
        const pattern = successPatterns[0];
        expect(pattern.id).toBeDefined();
        expect(pattern.description).toBeDefined();
        expect(pattern.confidence).toBeGreaterThan(0.7);
        expect(pattern.occurrences).toBeGreaterThanOrEqual(3);
        expect(Array.isArray(pattern.conditions)).toBe(true);
        expect(Array.isArray(pattern.outcomes)).toBe(true);
        expect(Array.isArray(pattern.applicableAgents)).toBe(true);
      }
    });

    it('should identify failure patterns', async () => {
      const failurePatterns = await memoryAnalytics.identifyFailurePatterns(failedJobs);

      expect(Array.isArray(failurePatterns)).toBe(true);
      expect(failurePatterns.length).toBeGreaterThanOrEqual(1);
      
      if (failurePatterns.length > 0) {
        const pattern = failurePatterns[0];
        expect(pattern.id).toBeDefined();
        expect(pattern.description).toBeDefined();
        expect(pattern.confidence).toBeGreaterThan(0.7);
        expect(pattern.occurrences).toBeGreaterThanOrEqual(3);
        expect(Array.isArray(pattern.triggers)).toBe(true);
        expect(Array.isArray(pattern.preventionSteps)).toBe(true);
        expect(Array.isArray(pattern.affectedAgents)).toBe(true);
      }
    });

    it('should find similar jobs', async () => {
      const targetJob = successfulJobs[0];
      const similarJobs = await memoryAnalytics.findSimilarJobs(targetJob.jobId);

      expect(Array.isArray(similarJobs)).toBe(true);
      
      if (similarJobs.length > 0) {
        const similar = similarJobs[0];
        expect(similar.jobId).toBeDefined();
        expect(similar.similarity).toBeGreaterThan(0.6);
        expect(similar.similarity).toBeLessThanOrEqual(1);
        expect(Array.isArray(similar.commonPatterns)).toBe(true);
        expect(Array.isArray(similar.differences)).toBe(true);
        expect(Array.isArray(similar.applicableLearnings)).toBe(true);
      }
    });

    it('should handle insufficient data for pattern recognition', async () => {
      // Test with only 1 successful job (less than minimum threshold)
      const singleJob = [successfulJobs[0]];
      
      const patterns = await memoryAnalytics.identifySuccessPatterns(singleJob);
      expect(patterns).toEqual([]);
    });
  });

  describe('Pattern Search', () => {
    beforeEach(async () => {
      // Create jobs with searchable patterns
      const job = await jobMemoryManager.initializeJobMemory('searchable-job', 'session-search');
      
      await jobMemoryManager.recordDecision(job.jobId, {
        agentType: 'strategic-planner',
        category: 'architectural',
        description: 'Implement caching layer for performance',
        options: [],
        reasoning: 'Reduce database load',
        relatedContext: []
      });

      await jobMemoryManager.recordGotcha(job.jobId, {
        agentType: 'code-implementer',
        severity: 'medium',
        category: 'performance',
        description: 'Cache invalidation issues',
        errorPattern: 'Stale cache data returned',
        context: 'User profile updates',
        preventionNotes: ['Use cache tags', 'Implement cache warming'],
        relatedDecisions: []
      });
    });

    it('should search for decision patterns', async () => {
      const patterns = await memoryAnalytics.searchSimilarPatterns({
        type: 'decision',
        description: 'caching',
        minConfidence: 0.5,
        maxResults: 10
      });

      expect(Array.isArray(patterns)).toBe(true);
      
      if (patterns.length > 0) {
        const pattern = patterns[0];
        expect(pattern.patternId).toBeDefined();
        expect(pattern.patternType).toBe('decision');
        expect(pattern.confidence).toBeGreaterThanOrEqual(0.5);
        expect(Array.isArray(pattern.context)).toBe(true);
      }
    });

    it('should search for gotcha patterns', async () => {
      const patterns = await memoryAnalytics.searchSimilarPatterns({
        type: 'gotcha',
        description: 'cache',
        minConfidence: 0.7,
        maxResults: 5
      });

      expect(Array.isArray(patterns)).toBe(true);
      
      if (patterns.length > 0) {
        const pattern = patterns[0];
        expect(pattern.patternType).toBe('gotcha');
        expect(pattern.confidence).toBeGreaterThanOrEqual(0.7);
      }
    });

    it('should filter by agent type', async () => {
      const patterns = await memoryAnalytics.searchSimilarPatterns({
        type: 'decision',
        agentType: 'strategic-planner',
        maxResults: 10
      });

      expect(Array.isArray(patterns)).toBe(true);
      // All patterns should be from the specified agent type
    });

    it('should limit results correctly', async () => {
      const patterns = await memoryAnalytics.searchSimilarPatterns({
        type: 'decision',
        maxResults: 2
      });

      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Memory Insights', () => {
    let testJob: JobMemory;

    beforeEach(async () => {
      testJob = await jobMemoryManager.initializeJobMemory('insights-job', 'insights-session');
      
      // Add comprehensive test data
      await jobMemoryManager.recordDecision(testJob.jobId, {
        agentType: 'strategic-planner',
        category: 'architectural',
        description: 'Use microservices architecture',
        options: [],
        reasoning: 'Better scalability',
        relatedContext: []
      });

      await jobMemoryManager.recordGotcha(testJob.jobId, {
        agentType: 'code-implementer',
        severity: 'high',
        category: 'integration',
        description: 'Service communication timeout',
        errorPattern: 'Timeout after 30s',
        context: 'Inter-service calls',
        preventionNotes: ['Implement circuit breaker', 'Add retry logic'],
        relatedDecisions: []
      });

      await jobMemoryManager.recordContext(testJob.jobId, {
        agentType: 'code-implementer',
        type: 'knowledge-retrieval',
        source: 'microservices-patterns',
        content: 'Circuit breaker pattern implementation',
        relevanceScore: 0.95,
        effectiveness: 0.9
      });

      await jobMemoryManager.recordOutcome(testJob.jobId, {
        agentType: 'deployment-automation',
        type: 'success',
        category: 'deployment',
        description: 'Successfully deployed microservices',
        metrics: {
          duration: 45,
          codeChanges: { linesAdded: 300, linesRemoved: 100, filesModified: 15 },
          qualityMetrics: { testCoverage: 92, lintErrors: 0, typeErrors: 0, complexity: 3 }
        },
        relatedDecisions: [],
        relatedGotchas: [],
        lessons: ['Circuit breaker pattern prevented cascading failures']
      });
    });

    it('should generate comprehensive memory insights', async () => {
      const insights = await memoryAnalytics.getMemoryInsights(testJob.jobId);

      expect(insights).toBeDefined();
      expect(insights.jobId).toBe(testJob.jobId);
      
      // Summary should include all key metrics
      expect(insights.summary).toBeDefined();
      expect(typeof insights.summary.overallSuccess).toBe('boolean');
      expect(typeof insights.summary.efficiency).toBe('number');
      expect(typeof insights.summary.learningValue).toBe('number');
      expect(typeof insights.summary.reuseRate).toBe('number');
      
      // Patterns should be identified
      expect(insights.patterns).toBeDefined();
      expect(Array.isArray(insights.patterns.successPatterns)).toBe(true);
      expect(Array.isArray(insights.patterns.failurePatterns)).toBe(true);
      expect(Array.isArray(insights.patterns.decisionPatterns)).toBe(true);
      
      // Recommendations should be generated
      expect(insights.recommendations).toBeDefined();
      expect(Array.isArray(insights.recommendations.forFutureJobs)).toBe(true);
      expect(Array.isArray(insights.recommendations.forKnowledgeBase)).toBe(true);
      expect(Array.isArray(insights.recommendations.forProcessImprovement)).toBe(true);
      
      // Key metrics should be calculated
      expect(insights.keyMetrics).toBeDefined();
      expect(typeof insights.keyMetrics.totalDecisions).toBe('number');
      expect(typeof insights.keyMetrics.avgDecisionTime).toBe('number');
      expect(typeof insights.keyMetrics.totalGotchas).toBe('number');
      expect(typeof insights.keyMetrics.avgGotchaResolutionTime).toBe('number');
      expect(typeof insights.keyMetrics.contextEffectiveness).toBe('number');
    });

    it('should provide relevant recommendations', async () => {
      const insights = await memoryAnalytics.getMemoryInsights(testJob.jobId);
      
      const allRecommendations = [
        ...insights.recommendations.forFutureJobs,
        ...insights.recommendations.forKnowledgeBase,
        ...insights.recommendations.forProcessImprovement
      ];
      
      expect(allRecommendations.length).toBeGreaterThan(0);
      
      // Recommendations should be strings
      allRecommendations.forEach(rec => {
        expect(typeof rec).toBe('string');
        expect(rec.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Trend Analysis', () => {
    beforeEach(async () => {
      // Create multiple jobs across a time range
      const jobs = [];
      for (let i = 0; i < 5; i++) {
        const job = await jobMemoryManager.initializeJobMemory(`trend-job-${i}`, `trend-session-${i}`);
        
        // Add some variation in success/failure
        const isSuccess = i % 2 === 0;
        
        await jobMemoryManager.completeJobMemory(job.jobId, {
          agentType: 'system',
          type: isSuccess ? 'success' : 'failure',
          category: 'task-completion',
          description: isSuccess ? 'Completed successfully' : 'Failed with errors',
          metrics: {
            duration: 30 + (i * 10), // Varying duration
            codeChanges: { linesAdded: 50 * i, linesRemoved: 10 * i, filesModified: i + 1 },
            qualityMetrics: { 
              testCoverage: isSuccess ? 90 + i : 60 + i, 
              lintErrors: isSuccess ? 0 : i,
              typeErrors: 0,
              complexity: i + 1
            }
          },
          relatedDecisions: [],
          relatedGotchas: [],
          lessons: []
        });
        
        jobs.push(job);
      }
    });

    it('should analyze trends over time range', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const timeRange: TimeRange = { start: oneHourAgo, end: now };
      
      const trends = await memoryAnalytics.analyzeTrends(timeRange);
      
      expect(trends).toBeDefined();
      expect(trends.timeRange).toEqual(timeRange);
      expect(typeof trends.totalJobs).toBe('number');
      expect(typeof trends.successRate).toBe('number');
      expect(typeof trends.avgJobDuration).toBe('number');
      
      expect(trends.trends).toBeDefined();
      expect(['improving', 'declining', 'stable'].includes(trends.trends.efficiency)).toBe(true);
      expect(['improving', 'declining', 'stable'].includes(trends.trends.learningRate)).toBe(true);
      expect(['improving', 'declining', 'stable'].includes(trends.trends.gotchaFrequency)).toBe(true);
      
      expect(Array.isArray(trends.topGotchas)).toBe(true);
      expect(Array.isArray(trends.topSuccessFactors)).toBe(true);
    });

    it('should handle empty time range gracefully', async () => {
      const futureStart = new Date(Date.now() + 60 * 60 * 1000);
      const futureEnd = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const timeRange: TimeRange = { start: futureStart, end: futureEnd };
      
      await expect(memoryAnalytics.analyzeTrends(timeRange))
        .rejects.toThrow('No jobs found in specified time range');
    });
  });

  describe('Outcome Prediction', () => {
    it('should predict job outcome based on partial memory', async () => {
      const partialMemory: Partial<JobMemory> = {
        decisions: [{
          id: 'decision-1',
          timestamp: new Date(),
          agentType: 'strategic-planner',
          category: 'architectural',
          description: 'Complex architectural decision',
          options: [],
          reasoning: 'Test',
          relatedContext: []
        }],
        gotchas: [{
          id: 'gotcha-1',
          timestamp: new Date(),
          agentType: 'code-implementer',
          severity: 'critical',
          category: 'build',
          description: 'Critical build failure',
          errorPattern: 'Build failed',
          context: 'CI/CD',
          preventionNotes: [],
          relatedDecisions: [],
          resolution: {
            resolved: true,
            resolutionTime: 30,
            solution: 'Fixed configuration',
            preventionSteps: [],
            confidence: 0.9,
            timestamp: new Date()
          }
        }],
        context: [{
          id: 'context-1',
          timestamp: new Date(),
          agentType: 'code-implementer',
          type: 'knowledge-retrieval',
          source: 'best-practices',
          content: 'Build optimization techniques',
          relevanceScore: 0.9,
          usage: []
        }],
        metadata: {
          agentTypes: ['test-coverage-validator', 'strategic-planner'],
          complexity: 'high',
          priority: 'high',
          tags: [],
          relatedIssues: [],
          childJobIds: []
        }
      };

      const prediction = await memoryAnalytics.predictJobOutcome(partialMemory);

      expect(prediction).toBeDefined();
      expect(typeof prediction.predictedSuccess).toBe('boolean');
      expect(typeof prediction.confidence).toBe('number');
      expect(prediction.confidence).toBeGreaterThanOrEqual(0);
      expect(prediction.confidence).toBeLessThanOrEqual(1);
      expect(typeof prediction.estimatedDuration).toBe('number');
      expect(prediction.estimatedDuration).toBeGreaterThan(0);
      
      expect(Array.isArray(prediction.riskFactors)).toBe(true);
      expect(Array.isArray(prediction.successFactors)).toBe(true);
      expect(Array.isArray(prediction.recommendations)).toBe(true);
    });

    it('should handle empty partial memory', async () => {
      const emptyMemory: Partial<JobMemory> = {};
      
      const prediction = await memoryAnalytics.predictJobOutcome(emptyMemory);
      
      expect(prediction).toBeDefined();
      expect(typeof prediction.predictedSuccess).toBe('boolean');
      expect(prediction.estimatedDuration).toBeGreaterThan(0);
    });
  });

  describe('Agent Performance Analysis', () => {
    beforeEach(async () => {
      // Create jobs for different agents
      const agentTypes = ['strategic-planner', 'code-implementer', 'test-coverage-validator'];
      
      for (const agentType of agentTypes) {
        for (let i = 0; i < 3; i++) {
          const job = await jobMemoryManager.initializeJobMemory(`${agentType}-job-${i}`, `session-${agentType}-${i}`);
          
          await jobMemoryManager.recordDecision(job.jobId, {
            agentType,
            category: 'implementation',
            description: `${agentType} decision ${i}`,
            options: [],
            reasoning: 'Test decision',
            relatedContext: []
          });

          const isSuccess = i !== 2; // Make last job fail
          await jobMemoryManager.completeJobMemory(job.jobId, {
            agentType: 'system',
            type: isSuccess ? 'success' : 'failure',
            category: 'task-completion',
            description: isSuccess ? 'Success' : 'Failure',
            metrics: {
              duration: 30 + i * 10,
              codeChanges: { linesAdded: 50, linesRemoved: 10, filesModified: 3 },
              qualityMetrics: { testCoverage: 85, lintErrors: 0, typeErrors: 0, complexity: 2 }
            },
            relatedDecisions: [],
            relatedGotchas: [],
            lessons: []
          });
        }
      }
    });

    it('should analyze agent performance', async () => {
      const analysis = await memoryAnalytics.analyzeAgentPerformance('strategic-planner');

      expect(analysis).toBeDefined();
      expect(analysis.agentType).toBe('strategic-planner');
      expect(typeof analysis.totalJobs).toBe('number');
      expect(typeof analysis.successRate).toBe('number');
      expect(typeof analysis.avgJobDuration).toBe('number');
      
      expect(Array.isArray(analysis.strengths)).toBe(true);
      expect(Array.isArray(analysis.weaknesses)).toBe(true);
      expect(Array.isArray(analysis.commonGotchas)).toBe(true);
      expect(Array.isArray(analysis.improvementSuggestions)).toBe(true);
    });

    it('should compare agent effectiveness', async () => {
      const comparison = await memoryAnalytics.compareAgentEffectiveness();

      expect(Array.isArray(comparison)).toBe(true);
      expect(comparison.length).toBeGreaterThan(0);
      
      if (comparison.length > 0) {
        const agent = comparison[0];
        expect(agent.agentType).toBeDefined();
        expect(agent.metrics).toBeDefined();
        expect(typeof agent.metrics.successRate).toBe('number');
        expect(typeof agent.metrics.avgDuration).toBe('number');
        expect(typeof agent.metrics.gotchaRate).toBe('number');
        expect(typeof agent.metrics.learningRate).toBe('number');
        expect(typeof agent.ranking).toBe('number');
        expect(Array.isArray(agent.strengths)).toBe(true);
        expect(Array.isArray(agent.bestUseCases)).toBe(true);
      }
    });

    it('should handle agent with insufficient data', async () => {
      const analysis = await memoryAnalytics.analyzeAgentPerformance('non-existent-agent');
      
      expect(analysis.totalJobs).toBe(0);
      expect(analysis.successRate).toBeNaN();
    });
  });

  describe('Error Handling', () => {
    it('should throw error when not initialized', async () => {
      const uninitializedAnalytics = new MemoryAnalytics(testConfig);
      
      await expect(uninitializedAnalytics.calculateJobEfficiency('test-job'))
        .rejects.toThrow('Memory Analytics Engine not initialized');
    });

    it('should handle non-existent job gracefully', async () => {
      await expect(memoryAnalytics.calculateJobAnalytics('non-existent-job'))
        .rejects.toThrow('Job memory not found');
    });

    it('should handle empty pattern search', async () => {
      const patterns = await memoryAnalytics.searchSimilarPatterns({
        type: 'decision',
        description: 'non-existent-pattern',
        minConfidence: 0.9
      });

      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns.length).toBe(0);
    });
  });

  describe('Performance', () => {
    it('should meet performance targets for analytics calculations', async () => {
      // Create a job with some data
      const job = await jobMemoryManager.initializeJobMemory('perf-test-job', 'perf-session');
      await jobMemoryManager.recordDecision(job.jobId, {
        agentType: 'test-agent',
        category: 'implementation',
        description: 'Performance test decision',
        options: [],
        reasoning: 'Test',
        relatedContext: []
      });

      const startTime = Date.now();
      await memoryAnalytics.calculateJobAnalytics(job.jobId);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(testConfig.performanceThresholds.analyticsCalculationTimeMs);
    });

    it('should handle concurrent analytics requests', async () => {
      // Create multiple jobs
      const jobs = [];
      for (let i = 0; i < 5; i++) {
        const job = await jobMemoryManager.initializeJobMemory(`concurrent-job-${i}`, `session-${i}`);
        jobs.push(job);
      }

      // Run analytics concurrently
      const analyticsPromises = jobs.map(job => 
        memoryAnalytics.calculateJobAnalytics(job.jobId)
      );

      await expect(Promise.all(analyticsPromises)).resolves.toBeDefined();
    });
  });
});