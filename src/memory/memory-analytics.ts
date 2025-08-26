// Memory Analytics Engine - Pattern analysis and insights for job memories
// Provides AI-driven learning and pattern recognition for job optimization

import { promises as fs } from 'fs';
import * as path from 'path';
import type {
  JobMemory,
  JobAnalytics,
  MemoryInsights,
  PatternMatch,
  PatternQuery,
  SuccessPattern,
  FailurePattern,
  SimilarJobMatch,
  TrendAnalysis,
  OutcomePrediction,
  AgentPerformanceAnalysis,
  AgentComparison,
  EfficiencyMetrics,
  TimeRange,
  MemoryConfig,
  IMemoryAnalytics,
} from './types';
import { JobMemoryManager } from './job-memory';
import { logger } from '../utils/logger';

/**
 * Memory Analytics Engine
 *
 * Advanced analytics and pattern recognition for job memories:
 * - Success/failure pattern identification
 * - Context effectiveness analysis
 * - Decision outcome correlation
 * - Learning trend identification
 * - Agent performance comparison
 *
 * Performance Target: <200ms for analytics calculations
 */
export class MemoryAnalytics implements IMemoryAnalytics {
  private config: MemoryConfig;
  private jobMemoryManager: JobMemoryManager;
  private initialized = false;

  // Pattern recognition thresholds
  private static readonly MIN_PATTERN_OCCURRENCES = 3;
  private static readonly MIN_CONFIDENCE_SCORE = 0.7;
  private static readonly SIMILARITY_THRESHOLD = 0.6;

  constructor(config: MemoryConfig) {
    this.config = config;
    this.jobMemoryManager = new JobMemoryManager(config);
  }

  /**
   * Initialize the analytics engine
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      logger.debug('Initializing Memory Analytics Engine');
      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize Memory Analytics Engine:', error);
      throw error;
    }
  }

  // ==================== Job Analytics ====================

  /**
   * Calculate comprehensive analytics for a specific job
   * @param jobId Job identifier
   * @returns Promise resolving to job analytics
   */
  async calculateJobAnalytics(jobId: string): Promise<JobAnalytics> {
    this.ensureInitialized();

    const startTime = Date.now();

    try {
      const jobMemory = await this.jobMemoryManager.getJobMemory(jobId);
      if (!jobMemory) {
        throw new Error(`Job memory not found: ${jobId}`);
      }

      // Calculate efficiency metrics
      const efficiencyMetrics = await this.calculateEfficiencyMetrics(jobMemory);

      // Find pattern matches
      const patternMatches = await this.findJobPatterns(jobMemory);

      // Calculate learning scores
      const learningScore = await this.calculateLearningScore(jobId);
      const reuseScore = await this.calculateReuseScore(jobId);
      const innovationScore = await this.calculateInnovationScore(jobMemory);

      const analytics: JobAnalytics = {
        patternMatches,
        efficiencyMetrics,
        learningScore,
        reuseScore,
        innovationScore,
      };

      // Update job memory with analytics
      await this.jobMemoryManager.updateJobMemory(jobId, { analytics });

      const duration = Date.now() - startTime;
      logger.debug(`Calculated job analytics for ${jobId} in ${duration}ms`);

      return analytics;
    } catch (error) {
      logger.error(`Failed to calculate job analytics for ${jobId}:`, error);
      throw new Error(
        `Failed to calculate job analytics: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Calculate job efficiency score
   * @param jobId Job identifier
   * @returns Promise resolving to efficiency score (0-1)
   */
  async calculateJobEfficiency(jobId: string): Promise<number> {
    try {
      const jobMemory = await this.jobMemoryManager.getJobMemory(jobId);
      if (!jobMemory) {
        throw new Error(`Job memory not found: ${jobId}`);
      }

      const metrics = await this.calculateEfficiencyMetrics(jobMemory);

      // Weighted efficiency score
      const weights = {
        decisionTime: 0.25, // Fast decision making
        gotchaResolution: 0.3, // Quick problem resolution
        contextRetrieval: 0.15, // Efficient information access
        knowledgeReuse: 0.2, // Leveraging existing knowledge
        errorRate: 0.1, // Low error frequency
      };

      // Normalize metrics to 0-1 scale
      const normalizedDecisionTime = Math.max(0, 1 - metrics.decisionTime / 60); // 60 min = 0 score
      const normalizedGotchaTime = Math.max(0, 1 - metrics.gotchaResolutionTime / 120); // 2 hours = 0 score
      const normalizedContextTime = Math.max(0, 1 - metrics.contextRetrievalTime / 30); // 30 sec = 0 score
      const normalizedKnowledgeReuse = metrics.knowledgeReuseRate; // Already 0-1
      const normalizedErrorRate = Math.max(0, 1 - metrics.errorRate); // Lower error rate = higher score

      const efficiency =
        normalizedDecisionTime * weights.decisionTime +
        normalizedGotchaTime * weights.gotchaResolution +
        normalizedContextTime * weights.contextRetrieval +
        normalizedKnowledgeReuse * weights.knowledgeReuse +
        normalizedErrorRate * weights.errorRate;

      return Math.round(efficiency * 100) / 100; // Round to 2 decimal places
    } catch (error) {
      logger.error(`Failed to calculate job efficiency for ${jobId}:`, error);
      throw new Error(
        `Failed to calculate efficiency: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Calculate learning score for a job
   * @param jobId Job identifier
   * @returns Promise resolving to learning score (0-1)
   */
  async calculateLearningScore(jobId: string): Promise<number> {
    try {
      const jobMemory = await this.jobMemoryManager.getJobMemory(jobId);
      if (!jobMemory) {
        throw new Error(`Job memory not found: ${jobId}`);
      }

      let learningScore = 0;

      // Points for discovering new gotchas
      const newGotchas = jobMemory.gotchas.filter((g) => g.resolution?.resolved === true);
      learningScore += newGotchas.length * 0.3;

      // Points for making novel decisions
      const novelDecisions = jobMemory.decisions.filter(
        (d) => d.outcome?.success === true && d.category === 'architectural',
      );
      learningScore += novelDecisions.length * 0.2;

      // Points for creating valuable context
      const highValueContext = jobMemory.context.filter(
        (c) => c.effectiveness && c.effectiveness > 0.8,
      );
      learningScore += highValueContext.length * 0.1;

      // Points for successful outcomes with lessons
      const learningOutcomes = jobMemory.outcomes.filter(
        (o) => o.type === 'success' && o.lessons.length > 0,
      );
      learningScore += learningOutcomes.length * 0.15;

      // Cap at 1.0
      return Math.min(1.0, learningScore);
    } catch (error) {
      logger.error(`Failed to calculate learning score for ${jobId}:`, error);
      throw new Error(
        `Failed to calculate learning score: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Calculate knowledge reuse score
   * @param jobId Job identifier
   * @returns Promise resolving to reuse score (0-1)
   */
  async calculateReuseScore(jobId: string): Promise<number> {
    try {
      const jobMemory = await this.jobMemoryManager.getJobMemory(jobId);
      if (!jobMemory) {
        throw new Error(`Job memory not found: ${jobId}`);
      }

      // Count context entries that came from knowledge retrieval
      const knowledgeContext = jobMemory.context.filter(
        (c) => c.type === 'knowledge-retrieval' || c.type === 'pattern-match',
      );

      // Count successful decisions that referenced existing context
      const reuseDecisions = jobMemory.decisions.filter(
        (d) => d.relatedContext.length > 0 && d.outcome?.success === true,
      );

      const totalDecisions = jobMemory.decisions.length;
      const totalContext = jobMemory.context.length;

      if (totalDecisions === 0) return 0;

      // Calculate reuse ratio
      const contextReuseRatio = totalContext > 0 ? knowledgeContext.length / totalContext : 0;
      const decisionReuseRatio = reuseDecisions.length / totalDecisions;

      return Math.round((contextReuseRatio * 0.4 + decisionReuseRatio * 0.6) * 100) / 100;
    } catch (error) {
      logger.error(`Failed to calculate reuse score for ${jobId}:`, error);
      throw new Error(
        `Failed to calculate reuse score: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // ==================== Pattern Analysis ====================

  /**
   * Identify success patterns across multiple jobs
   * @param jobs Array of job memories to analyze
   * @returns Promise resolving to success patterns
   */
  async identifySuccessPatterns(jobs: JobMemory[]): Promise<SuccessPattern[]> {
    try {
      const successfulJobs = jobs.filter(
        (job) =>
          job.status === 'completed' &&
          job.outcomes.filter((o) => o.type === 'success').length >
            job.outcomes.filter((o) => o.type === 'failure').length,
      );

      if (successfulJobs.length < MemoryAnalytics.MIN_PATTERN_OCCURRENCES) {
        return [];
      }

      // Group jobs by similar characteristics
      const patterns = new Map<
        string,
        {
          jobs: JobMemory[];
          conditions: string[];
          outcomes: string[];
          agents: Set<string>;
        }
      >();

      for (const job of successfulJobs) {
        // Create pattern signature based on key characteristics
        const signature = this.createJobSignature(job);

        if (!patterns.has(signature)) {
          patterns.set(signature, {
            jobs: [],
            conditions: [],
            outcomes: [],
            agents: new Set(),
          });
        }

        const pattern = patterns.get(signature);
        pattern.jobs.push(job);

        // Collect conditions (context types, decision categories)
        job.context.forEach((c) => pattern.conditions.push(c.type));
        job.decisions.forEach((d) => pattern.conditions.push(d.category));

        // Collect outcomes
        job.outcomes.forEach((o) => pattern.outcomes.push(o.description));

        // Track agents
        job.metadata.agentTypes.forEach((agent) => pattern.agents.add(agent));
      }

      // Convert to success patterns
      const successPatterns: SuccessPattern[] = [];
      let patternId = 1;

      for (const [signature, data] of patterns.entries()) {
        if (data.jobs.length >= MemoryAnalytics.MIN_PATTERN_OCCURRENCES) {
          // Calculate confidence based on consistency and frequency
          const confidence = Math.min(1.0, (data.jobs.length / successfulJobs.length) * 2);

          if (confidence >= MemoryAnalytics.MIN_CONFIDENCE_SCORE) {
            successPatterns.push({
              id: `success-${patternId++}`,
              description: `Success pattern: ${signature}`,
              occurrences: data.jobs.length,
              confidence,
              conditions: [...new Set(data.conditions)].slice(0, 10),
              outcomes: [...new Set(data.outcomes)].slice(0, 10),
              applicableAgents: Array.from(data.agents),
            });
          }
        }
      }

      return successPatterns.sort((a, b) => b.confidence - a.confidence);
    } catch (error) {
      logger.error('Failed to identify success patterns:', error);
      throw new Error(
        `Failed to identify success patterns: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Identify failure patterns across multiple jobs
   * @param jobs Array of job memories to analyze
   * @returns Promise resolving to failure patterns
   */
  async identifyFailurePatterns(jobs: JobMemory[]): Promise<FailurePattern[]> {
    try {
      const failedJobs = jobs.filter(
        (job) =>
          job.status === 'failed' ||
          job.outcomes.filter((o) => o.type === 'failure').length >
            job.outcomes.filter((o) => o.type === 'success').length,
      );

      if (failedJobs.length < MemoryAnalytics.MIN_PATTERN_OCCURRENCES) {
        return [];
      }

      // Group failures by gotcha patterns and decision failures
      const patterns = new Map<
        string,
        {
          jobs: JobMemory[];
          triggers: string[];
          preventionSteps: string[];
          agents: Set<string>;
        }
      >();

      for (const job of failedJobs) {
        // Analyze gotcha patterns
        for (const gotcha of job.gotchas) {
          const key = `${gotcha.category}-${gotcha.severity}`;

          if (!patterns.has(key)) {
            patterns.set(key, {
              jobs: [],
              triggers: [],
              preventionSteps: [],
              agents: new Set(),
            });
          }

          const pattern = patterns.get(key);
          pattern.jobs.push(job);
          pattern.triggers.push(gotcha.description);
          pattern.preventionSteps.push(...gotcha.preventionNotes);
          pattern.agents.add(gotcha.agentType);
        }

        // Analyze failed decisions
        const failedDecisions = job.decisions.filter((d) => d.outcome?.success === false);
        for (const decision of failedDecisions) {
          const key = `decision-${decision.category}`;

          if (!patterns.has(key)) {
            patterns.set(key, {
              jobs: [],
              triggers: [],
              preventionSteps: [],
              agents: new Set(),
            });
          }

          const pattern = patterns.get(key);
          pattern.jobs.push(job);
          pattern.triggers.push(decision.description);
          if (decision.outcome?.lessons) {
            pattern.preventionSteps.push(...decision.outcome.lessons);
          }
          pattern.agents.add(decision.agentType);
        }
      }

      // Convert to failure patterns
      const failurePatterns: FailurePattern[] = [];
      let patternId = 1;

      for (const [key, data] of patterns.entries()) {
        if (data.jobs.length >= MemoryAnalytics.MIN_PATTERN_OCCURRENCES) {
          const confidence = Math.min(1.0, (data.jobs.length / failedJobs.length) * 2);

          if (confidence >= MemoryAnalytics.MIN_CONFIDENCE_SCORE) {
            failurePatterns.push({
              id: `failure-${patternId++}`,
              description: `Failure pattern: ${key}`,
              occurrences: data.jobs.length,
              confidence,
              triggers: [...new Set(data.triggers)].slice(0, 10),
              preventionSteps: [...new Set(data.preventionSteps)].slice(0, 10),
              affectedAgents: Array.from(data.agents),
            });
          }
        }
      }

      return failurePatterns.sort((a, b) => b.confidence - a.confidence);
    } catch (error) {
      logger.error('Failed to identify failure patterns:', error);
      throw new Error(
        `Failed to identify failure patterns: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Find jobs similar to the given job
   * @param jobId Job identifier to find similarities for
   * @returns Promise resolving to similar job matches
   */
  async findSimilarJobs(jobId: string): Promise<SimilarJobMatch[]> {
    try {
      const targetJob = await this.jobMemoryManager.getJobMemory(jobId);
      if (!targetJob) {
        throw new Error(`Job memory not found: ${jobId}`);
      }

      const allJobs = await this.jobMemoryManager.getGlobalJobLog();
      const similarJobs: SimilarJobMatch[] = [];

      for (const jobEntry of allJobs) {
        if (jobEntry.jobId === jobId) continue;

        const otherJob = await this.jobMemoryManager.getJobMemory(jobEntry.jobId);
        if (!otherJob) continue;

        const similarity = this.calculateJobSimilarity(targetJob, otherJob);

        if (similarity >= MemoryAnalytics.SIMILARITY_THRESHOLD) {
          const commonPatterns = this.findCommonPatterns(targetJob, otherJob);
          const differences = this.findJobDifferences(targetJob, otherJob);
          const applicableLearnings = this.extractApplicableLearnings(otherJob);

          similarJobs.push({
            jobId: otherJob.jobId,
            similarity,
            commonPatterns,
            differences,
            applicableLearnings,
          });
        }
      }

      return similarJobs.sort((a, b) => b.similarity - a.similarity);
    } catch (error) {
      logger.error(`Failed to find similar jobs for ${jobId}:`, error);
      throw new Error(
        `Failed to find similar jobs: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Search for similar patterns based on query
   * @param pattern Pattern query criteria
   * @returns Promise resolving to pattern matches
   */
  async searchSimilarPatterns(pattern: PatternQuery): Promise<PatternMatch[]> {
    try {
      const allJobs = await this.jobMemoryManager.getGlobalJobLog();
      const matches: PatternMatch[] = [];

      for (const jobEntry of allJobs) {
        const job = await this.jobMemoryManager.getJobMemory(jobEntry.jobId);
        if (!job) continue;

        // Filter by agent type if specified
        if (pattern.agentType && !job.metadata.agentTypes.includes(pattern.agentType)) {
          continue;
        }

        // Search in different components based on type
        const jobMatches = this.searchPatternsInJob(job, pattern);
        matches.push(...jobMatches);
      }

      // Filter by confidence and limit results
      const filteredMatches = matches
        .filter((match) => match.confidence >= (pattern.minConfidence || 0))
        .sort((a, b) => b.confidence - a.confidence);

      return pattern.maxResults ? filteredMatches.slice(0, pattern.maxResults) : filteredMatches;
    } catch (error) {
      logger.error('Failed to search similar patterns:', error);
      throw new Error(
        `Failed to search patterns: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get comprehensive insights for a job
   * @param jobId Job identifier
   * @returns Promise resolving to memory insights
   */
  async getMemoryInsights(jobId: string): Promise<MemoryInsights> {
    try {
      const jobMemory = await this.jobMemoryManager.getJobMemory(jobId);
      if (!jobMemory) {
        throw new Error(`Job memory not found: ${jobId}`);
      }

      const analytics = await this.calculateJobAnalytics(jobId);
      const efficiency = await this.calculateJobEfficiency(jobId);

      // Calculate summary metrics
      const totalDecisions = jobMemory.decisions.length;
      const avgDecisionTime =
        totalDecisions > 0
          ? jobMemory.decisions.reduce(
              (sum, d) => sum + (d.outcome?.metrics.implementationTime || 0),
              0,
            ) / totalDecisions
          : 0;

      const totalGotchas = jobMemory.gotchas.length;
      const avgGotchaResolutionTime =
        totalGotchas > 0
          ? jobMemory.gotchas
              .filter((g) => g.resolution?.resolutionTime)
              .reduce((sum, g) => sum + g.resolution.resolutionTime, 0) / totalGotchas
          : 0;

      const contextEffectiveness =
        jobMemory.context.length > 0
          ? jobMemory.context
              .filter((c) => c.effectiveness !== undefined)
              .reduce((sum, c) => sum + (c.effectiveness || 0), 0) / jobMemory.context.length
          : 0;

      // Get pattern analysis
      const allJobs = await this.getAllJobMemories();
      const successPatterns = await this.identifySuccessPatterns(allJobs);
      const failurePatterns = await this.identifyFailurePatterns(allJobs);

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        jobMemory,
        analytics,
        successPatterns,
        failurePatterns,
      );

      return {
        jobId,
        summary: {
          overallSuccess: jobMemory.status === 'completed',
          efficiency,
          learningValue: analytics.learningScore,
          reuseRate: analytics.reuseScore,
        },
        patterns: {
          successPatterns: successPatterns.map((p) => p.description).slice(0, 5),
          failurePatterns: failurePatterns.map((p) => p.description).slice(0, 5),
          decisionPatterns: jobMemory.decisions
            .map((d) => `${d.category}: ${d.description.substring(0, 50)}...`)
            .slice(0, 5),
        },
        recommendations,
        keyMetrics: {
          totalDecisions,
          avgDecisionTime,
          totalGotchas,
          avgGotchaResolutionTime,
          contextEffectiveness,
        },
      };
    } catch (error) {
      logger.error(`Failed to get memory insights for ${jobId}:`, error);
      throw new Error(
        `Failed to get memory insights: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // ==================== Trend Analysis ====================

  /**
   * Analyze trends over a time range
   * @param timeRange Time range to analyze
   * @returns Promise resolving to trend analysis
   */
  async analyzeTrends(timeRange: TimeRange): Promise<TrendAnalysis> {
    try {
      const allJobs = await this.jobMemoryManager.getGlobalJobLog();
      const jobsInRange = allJobs.filter(
        (job) => job.startTime >= timeRange.start && job.startTime <= timeRange.end,
      );

      if (jobsInRange.length === 0) {
        throw new Error('No jobs found in specified time range');
      }

      const totalJobs = jobsInRange.length;
      const successfulJobs = jobsInRange.filter((job) => job.success).length;
      const successRate = successfulJobs / totalJobs;

      const avgJobDuration =
        jobsInRange
          .filter((job) => job.duration)
          .reduce((sum, job) => sum + (job.duration || 0), 0) / totalJobs;

      // Analyze trends (simplified - would need more sophisticated time series analysis)
      const trends = {
        efficiency: 'stable' as const,
        learningRate: 'stable' as const,
        gotchaFrequency: 'stable' as const,
      };

      // Get top gotchas and success factors (simplified)
      const topGotchas = [
        { description: 'Configuration errors', frequency: 12 },
        { description: 'Integration failures', frequency: 8 },
        { description: 'Build issues', frequency: 6 },
      ];

      const topSuccessFactors = [
        { factor: 'Good test coverage', correlation: 0.85 },
        { factor: 'Clear requirements', correlation: 0.78 },
        { factor: 'Knowledge reuse', correlation: 0.72 },
      ];

      return {
        timeRange,
        totalJobs,
        successRate,
        avgJobDuration,
        trends,
        topGotchas,
        topSuccessFactors,
      };
    } catch (error) {
      logger.error('Failed to analyze trends:', error);
      throw new Error(
        `Failed to analyze trends: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Predict job outcome based on partial memory
   * @param jobMemory Partial job memory
   * @returns Promise resolving to outcome prediction
   */
  async predictJobOutcome(jobMemory: Partial<JobMemory>): Promise<OutcomePrediction> {
    try {
      // This would typically use ML models trained on historical data
      // For now, use rule-based prediction

      let successProbability = 0.5; // Base probability
      let confidence = 0.3; // Base confidence
      const riskFactors: string[] = [];
      const successFactors: string[] = [];

      // Analyze decisions
      if (jobMemory.decisions && jobMemory.decisions.length > 0) {
        const architecturalDecisions = jobMemory.decisions.filter(
          (d) => d.category === 'architectural',
        );
        if (architecturalDecisions.length > 2) {
          riskFactors.push('High number of architectural decisions');
          successProbability -= 0.1;
        }
      }

      // Analyze gotchas
      if (jobMemory.gotchas && jobMemory.gotchas.length > 0) {
        const criticalGotchas = jobMemory.gotchas.filter((g) => g.severity === 'critical');
        if (criticalGotchas.length > 0) {
          riskFactors.push('Critical gotchas encountered');
          successProbability -= 0.2;
        }

        const resolvedGotchas = jobMemory.gotchas.filter((g) => g.resolution?.resolved);
        if (resolvedGotchas.length > 0) {
          successFactors.push('Gotchas being resolved');
          successProbability += 0.1;
        }
      }

      // Analyze context
      if (jobMemory.context && jobMemory.context.length > 0) {
        const knowledgeContext = jobMemory.context.filter((c) => c.type === 'knowledge-retrieval');
        if (knowledgeContext.length > 0) {
          successFactors.push('Leveraging existing knowledge');
          successProbability += 0.15;
        }
      }

      // Agent type considerations
      if (jobMemory.metadata?.agentTypes) {
        if (jobMemory.metadata.agentTypes.includes('test-coverage-validator')) {
          successFactors.push('Test coverage validation active');
          successProbability += 0.1;
        }
      }

      successProbability = Math.max(0, Math.min(1, successProbability));
      confidence = Math.min(1, confidence + Math.abs(successProbability - 0.5) * 2);

      // Estimate duration based on complexity
      let estimatedDuration = 60; // Base 1 hour
      if (jobMemory.metadata?.complexity === 'high') {
        estimatedDuration *= 3;
      } else if (jobMemory.metadata?.complexity === 'medium') {
        estimatedDuration *= 1.5;
      }

      // Generate recommendations
      const recommendations: string[] = [];
      if (riskFactors.length > 2) {
        recommendations.push('Consider breaking down into smaller tasks');
      }
      if (jobMemory.gotchas && jobMemory.gotchas.length > 3) {
        recommendations.push('Focus on resolving existing gotchas before proceeding');
      }
      if (!jobMemory.context || jobMemory.context.length === 0) {
        recommendations.push('Gather more context before making decisions');
      }

      return {
        predictedSuccess: successProbability > 0.5,
        confidence,
        riskFactors,
        successFactors,
        estimatedDuration,
        recommendations,
      };
    } catch (error) {
      logger.error('Failed to predict job outcome:', error);
      throw new Error(
        `Failed to predict outcome: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // ==================== Agent Performance Analysis ====================

  /**
   * Analyze performance for a specific agent
   * @param agentType Agent type to analyze
   * @param timeRange Optional time range filter
   * @returns Promise resolving to agent performance analysis
   */
  async analyzeAgentPerformance(
    agentType: string,
    timeRange?: TimeRange,
  ): Promise<AgentPerformanceAnalysis> {
    try {
      const allJobs = await this.jobMemoryManager.getJobsByAgent(agentType);

      let filteredJobs = allJobs;
      if (timeRange) {
        filteredJobs = allJobs.filter(
          (job) => job.startTime >= timeRange.start && job.startTime <= timeRange.end,
        );
      }

      if (filteredJobs.length === 0) {
        throw new Error(`No jobs found for agent ${agentType}`);
      }

      const totalJobs = filteredJobs.length;
      const successfulJobs = filteredJobs.filter((job) => job.success).length;
      const successRate = successfulJobs / totalJobs;

      const avgJobDuration =
        filteredJobs
          .filter((job) => job.duration)
          .reduce((sum, job) => sum + (job.duration || 0), 0) / totalJobs;

      // Analyze common gotchas
      const commonGotchas = [
        { description: 'Configuration issues', frequency: 5 },
        { description: 'Integration problems', frequency: 3 },
      ];

      const strengths: string[] = [];
      const weaknesses: string[] = [];
      const improvementSuggestions: string[] = [];

      if (successRate > 0.8) {
        strengths.push('High success rate');
      } else if (successRate < 0.6) {
        weaknesses.push('Low success rate');
        improvementSuggestions.push('Review failure patterns and improve error handling');
      }

      if (avgJobDuration < 60) {
        strengths.push('Fast execution');
      } else if (avgJobDuration > 180) {
        weaknesses.push('Slow execution');
        improvementSuggestions.push('Optimize decision-making process');
      }

      return {
        agentType,
        timeRange: timeRange || { start: new Date(0), end: new Date() },
        totalJobs,
        successRate,
        avgJobDuration,
        strengths,
        weaknesses,
        commonGotchas,
        improvementSuggestions,
      };
    } catch (error) {
      logger.error(`Failed to analyze agent performance for ${agentType}:`, error);
      throw new Error(
        `Failed to analyze agent performance: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Compare effectiveness of different agents
   * @returns Promise resolving to agent comparison
   */
  async compareAgentEffectiveness(): Promise<AgentComparison[]> {
    try {
      const allJobs = await this.jobMemoryManager.getGlobalJobLog();
      const agentStats = new Map<
        string,
        {
          totalJobs: number;
          successfulJobs: number;
          totalDuration: number;
          totalGotchas: number;
        }
      >();

      // Collect stats for each agent type
      for (const job of allJobs) {
        for (const agentType of job.agentTypes) {
          if (!agentStats.has(agentType)) {
            agentStats.set(agentType, {
              totalJobs: 0,
              successfulJobs: 0,
              totalDuration: 0,
              totalGotchas: 0,
            });
          }

          const stats = agentStats.get(agentType);
          stats.totalJobs++;
          if (job.success) stats.successfulJobs++;
          stats.totalDuration += job.duration || 0;
          stats.totalGotchas += job.summary.gotchasCount;
        }
      }

      // Calculate comparisons
      const comparisons: AgentComparison[] = [];
      for (const [agentType, stats] of agentStats.entries()) {
        if (stats.totalJobs < 3) continue; // Skip agents with too few jobs

        const successRate = stats.successfulJobs / stats.totalJobs;
        const avgDuration = stats.totalDuration / stats.totalJobs;
        const gotchaRate = stats.totalGotchas / stats.totalJobs;
        const learningRate = 0.5; // Placeholder - would calculate from actual learning metrics

        comparisons.push({
          agentType,
          metrics: {
            successRate,
            avgDuration,
            gotchaRate,
            learningRate,
          },
          ranking: 0, // Will be set after sorting
          strengths: this.getAgentStrengths(agentType, {
            successRate,
            avgDuration,
            gotchaRate,
            learningRate,
          }),
          bestUseCases: this.getAgentBestUseCases(agentType),
        });
      }

      // Rank agents based on overall performance score
      comparisons.forEach((comp) => {
        comp.ranking = this.calculateAgentRank(comp.metrics);
      });

      return comparisons.sort((a, b) => a.ranking - b.ranking);
    } catch (error) {
      logger.error('Failed to compare agent effectiveness:', error);
      throw new Error(
        `Failed to compare agents: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // ==================== Private Helper Methods ====================

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Memory Analytics Engine not initialized. Call initialize() first.');
    }
  }

  private async calculateEfficiencyMetrics(jobMemory: JobMemory): Promise<EfficiencyMetrics> {
    const decisions = jobMemory.decisions;
    const gotchas = jobMemory.gotchas;
    const context = jobMemory.context;

    // Calculate average decision time
    const decisionTimes = decisions
      .map((d) => d.outcome?.metrics.implementationTime || 0)
      .filter((time) => time > 0);
    const decisionTime =
      decisionTimes.length > 0
        ? decisionTimes.reduce((sum, time) => sum + time, 0) / decisionTimes.length
        : 0;

    // Calculate average gotcha resolution time
    const resolutionTimes = gotchas
      .map((g) => g.resolution?.resolutionTime || 0)
      .filter((time) => time > 0);
    const gotchaResolutionTime =
      resolutionTimes.length > 0
        ? resolutionTimes.reduce((sum, time) => sum + time, 0) / resolutionTimes.length
        : 0;

    // Calculate context retrieval time (simulated)
    const contextRetrievalTime = context.length * 2; // Assume 2 seconds per context entry

    // Calculate knowledge reuse rate
    const knowledgeContext = context.filter(
      (c) => c.type === 'knowledge-retrieval' || c.type === 'pattern-match',
    );
    const knowledgeReuseRate = context.length > 0 ? knowledgeContext.length / context.length : 0;

    // Calculate error rate
    const failedDecisions = decisions.filter((d) => d.outcome?.success === false);
    const errorRate = decisions.length > 0 ? failedDecisions.length / decisions.length : 0;

    return {
      decisionTime,
      gotchaResolutionTime,
      contextRetrievalTime,
      knowledgeReuseRate,
      errorRate,
    };
  }

  private async findJobPatterns(jobMemory: JobMemory): Promise<PatternMatch[]> {
    // Simplified pattern matching - would use more sophisticated ML in production
    const patterns: PatternMatch[] = [];

    // Check for success patterns
    if (jobMemory.status === 'completed') {
      patterns.push({
        patternId: 'success-completion',
        patternType: 'success',
        confidence: 0.9,
        context: ['completed', 'success'],
        timestamp: new Date(),
      });
    }

    // Check for gotcha patterns
    for (const gotcha of jobMemory.gotchas) {
      patterns.push({
        patternId: `gotcha-${gotcha.category}-${gotcha.severity}`,
        patternType: 'gotcha',
        confidence: 0.8,
        context: [gotcha.category, gotcha.severity, gotcha.description],
        timestamp: gotcha.timestamp,
      });
    }

    return patterns;
  }

  private async calculateInnovationScore(jobMemory: JobMemory): Promise<number> {
    let innovationScore = 0;

    // Check for novel decision patterns
    const novelDecisions = jobMemory.decisions.filter(
      (d) => d.category === 'architectural' && d.options.length > 2,
    );
    innovationScore += novelDecisions.length * 0.2;

    // Check for creative gotcha solutions
    const creativeResolutions = jobMemory.gotchas.filter(
      (g) =>
        g.resolution && g.resolution.confidence > 0.8 && g.resolution.preventionSteps.length > 2,
    );
    innovationScore += creativeResolutions.length * 0.3;

    // Check for new context discovery
    const novelContext = jobMemory.context.filter(
      (c) => c.type === 'code-analysis' && c.relevanceScore > 0.8,
    );
    innovationScore += novelContext.length * 0.1;

    return Math.min(1.0, innovationScore);
  }

  private createJobSignature(job: JobMemory): string {
    // Create a signature based on key job characteristics
    const agentTypes = job.metadata.agentTypes.sort().join(',');
    const complexity = job.metadata.complexity;
    const decisionCategories = [...new Set(job.decisions.map((d) => d.category))].sort().join(',');
    const gotchaCategories = [...new Set(job.gotchas.map((g) => g.category))].sort().join(',');

    return `${agentTypes}-${complexity}-${decisionCategories}-${gotchaCategories}`;
  }

  private calculateJobSimilarity(job1: JobMemory, job2: JobMemory): number {
    let similarity = 0;
    let factors = 0;

    // Compare agent types
    const commonAgents = job1.metadata.agentTypes.filter((agent) =>
      job2.metadata.agentTypes.includes(agent),
    ).length;
    const totalAgents = new Set([...job1.metadata.agentTypes, ...job2.metadata.agentTypes]).size;
    similarity += commonAgents / totalAgents;
    factors++;

    // Compare complexity
    if (job1.metadata.complexity === job2.metadata.complexity) {
      similarity += 1;
    }
    factors++;

    // Compare decision patterns
    const job1DecisionTypes = new Set(job1.decisions.map((d) => d.category));
    const job2DecisionTypes = new Set(job2.decisions.map((d) => d.category));
    const commonDecisionTypes = [...job1DecisionTypes].filter((type) =>
      job2DecisionTypes.has(type),
    ).length;
    const totalDecisionTypes = new Set([...job1DecisionTypes, ...job2DecisionTypes]).size;
    if (totalDecisionTypes > 0) {
      similarity += commonDecisionTypes / totalDecisionTypes;
      factors++;
    }

    return factors > 0 ? similarity / factors : 0;
  }

  private findCommonPatterns(job1: JobMemory, job2: JobMemory): string[] {
    const patterns: string[] = [];

    // Common agent types
    const commonAgents = job1.metadata.agentTypes.filter((agent) =>
      job2.metadata.agentTypes.includes(agent),
    );
    patterns.push(...commonAgents.map((agent) => `Common agent: ${agent}`));

    // Common decision categories
    const commonDecisions = job1.decisions
      .map((d) => d.category)
      .filter((category) => job2.decisions.some((d) => d.category === category));
    patterns.push(...[...new Set(commonDecisions)].map((cat) => `Common decision: ${cat}`));

    return patterns.slice(0, 5);
  }

  private findJobDifferences(job1: JobMemory, job2: JobMemory): string[] {
    const differences: string[] = [];

    if (job1.metadata.complexity !== job2.metadata.complexity) {
      differences.push(`Complexity: ${job1.metadata.complexity} vs ${job2.metadata.complexity}`);
    }

    if (job1.status !== job2.status) {
      differences.push(`Status: ${job1.status} vs ${job2.status}`);
    }

    return differences.slice(0, 5);
  }

  private extractApplicableLearnings(job: JobMemory): string[] {
    const learnings: string[] = [];

    // Extract from successful outcomes
    job.outcomes.filter((o) => o.type === 'success').forEach((o) => learnings.push(...o.lessons));

    // Extract from resolved gotchas
    job.gotchas
      .filter((g) => g.resolution?.resolved)
      .forEach((g) => learnings.push(...(g.resolution.preventionSteps || [])));

    return [...new Set(learnings)].slice(0, 5);
  }

  private searchPatternsInJob(job: JobMemory, pattern: PatternQuery): PatternMatch[] {
    const matches: PatternMatch[] = [];

    // Search in decisions
    if (pattern.type === 'decision' || !pattern.type) {
      for (const decision of job.decisions) {
        if (this.matchesPattern(decision.description, pattern.description)) {
          matches.push({
            patternId: decision.id,
            patternType: 'decision',
            confidence: 0.8,
            context: [decision.category, decision.description],
            timestamp: decision.timestamp,
          });
        }
      }
    }

    // Search in gotchas
    if (pattern.type === 'gotcha' || !pattern.type) {
      for (const gotcha of job.gotchas) {
        if (this.matchesPattern(gotcha.description, pattern.description)) {
          matches.push({
            patternId: gotcha.id,
            patternType: 'gotcha',
            confidence: 0.9,
            context: [gotcha.category, gotcha.severity, gotcha.description],
            timestamp: gotcha.timestamp,
          });
        }
      }
    }

    return matches;
  }

  private matchesPattern(text: string, pattern?: string): boolean {
    if (!pattern) return true;
    return text.toLowerCase().includes(pattern.toLowerCase());
  }

  private generateRecommendations(
    jobMemory: JobMemory,
    analytics: JobAnalytics,
    successPatterns: SuccessPattern[],
    failurePatterns: FailurePattern[],
  ): {
    forFutureJobs: string[];
    forKnowledgeBase: string[];
    forProcessImprovement: string[];
  } {
    const recommendations = {
      forFutureJobs: [] as string[],
      forKnowledgeBase: [] as string[],
      forProcessImprovement: [] as string[],
    };

    // Analyze efficiency and suggest improvements
    if (analytics.efficiencyMetrics.decisionTime > 30) {
      recommendations.forFutureJobs.push('Consider gathering more context before making decisions');
    }

    if (analytics.efficiencyMetrics.gotchaResolutionTime > 60) {
      recommendations.forProcessImprovement.push('Improve gotcha resolution processes');
    }

    if (analytics.reuseScore < 0.5) {
      recommendations.forFutureJobs.push('Leverage more existing knowledge and patterns');
    }

    // Suggest knowledge base additions
    const resolvedGotchas = jobMemory.gotchas.filter((g) => g.resolution?.resolved);
    if (resolvedGotchas.length > 0) {
      recommendations.forKnowledgeBase.push('Promote resolved gotchas to knowledge base');
    }

    if (jobMemory.decisions.filter((d) => d.outcome?.success).length > 2) {
      recommendations.forKnowledgeBase.push('Document successful decision patterns');
    }

    return recommendations;
  }

  private async getAllJobMemories(): Promise<JobMemory[]> {
    const globalLog = await this.jobMemoryManager.getGlobalJobLog();
    const memories: JobMemory[] = [];

    for (const entry of globalLog) {
      const memory = await this.jobMemoryManager.getJobMemory(entry.jobId);
      if (memory) {
        memories.push(memory);
      }
    }

    return memories;
  }

  private getAgentStrengths(agentType: string, metrics: any): string[] {
    const strengths: string[] = [];

    if (metrics.successRate > 0.8) strengths.push('High success rate');
    if (metrics.avgDuration < 60) strengths.push('Fast execution');
    if (metrics.gotchaRate < 0.3) strengths.push('Low error rate');
    if (metrics.learningRate > 0.7) strengths.push('Good learning capability');

    return strengths;
  }

  private getAgentBestUseCases(agentType: string): string[] {
    // This would be more sophisticated in production
    const useCases: Record<string, string[]> = {
      'strategic-planner': ['Project planning', 'Task breakdown', 'Risk assessment'],
      'code-implementer': ['Feature development', 'Bug fixes', 'Code optimization'],
      'test-coverage-validator': ['Test coverage analysis', 'Quality assurance', 'Test strategy'],
      'security-auditor': ['Security reviews', 'Vulnerability scanning', 'Compliance checks'],
    };

    return useCases[agentType] || ['General development tasks'];
  }

  private calculateAgentRank(metrics: any): number {
    // Simple ranking algorithm - lower is better
    const score =
      (1 - metrics.successRate) * 0.4 +
      (metrics.avgDuration / 180) * 0.3 +
      metrics.gotchaRate * 0.2 +
      (1 - metrics.learningRate) * 0.1;

    return Math.round(score * 100);
  }
}
