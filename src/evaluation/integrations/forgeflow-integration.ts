// ForgeFlow V2 Integration - Connect evaluation layer with existing components
// Seamless integration with orchestrator, agents, and GitHub Issues

import type { EvaluationManager } from '../evaluation-manager';
import { JobOutcomeBuilder } from '../job-outcome-tracker';
import type {
  JobOutcome,
  JobContext,
  JobMetadata,
  EvaluationConfig,
  CardUsageOutcome,
} from '../types';

import type { ExecutionStatus, Issue, Agent, QualityGateResult } from '../../types';

import type { KnowledgeManager } from '../../knowledge/knowledge-manager';
import { enhancedLogger } from '../../utils/enhanced-logger';

/**
 * ForgeFlow Integration Service
 * Bridges the evaluation layer with ForgeFlow's existing components
 */
export class ForgeFlowEvaluationIntegration {
  private evaluationManager: EvaluationManager;
  private knowledgeManager: KnowledgeManager;
  private config: EvaluationConfig;

  constructor(
    evaluationManager: EvaluationManager,
    knowledgeManager: KnowledgeManager,
    config: EvaluationConfig,
  ) {
    this.evaluationManager = evaluationManager;
    this.knowledgeManager = knowledgeManager;
    this.config = config;
  }

  /**
   * Process execution completion and create job outcome
   */
  async processExecutionCompletion(
    execution: ExecutionStatus,
    issue: Issue,
    agents: Agent[],
    qualityResults?: QualityGateResult,
  ): Promise<void> {
    try {
      enhancedLogger.info('Processing execution completion for evaluation', {
        executionId: execution.id,
        issueNumber: issue.number,
        status: execution.status,
      });

      // Create job outcome from execution data
      const jobOutcome = await this.createJobOutcomeFromExecution(
        execution,
        issue,
        agents,
        qualityResults,
      );

      // Log to evaluation system
      await this.evaluationManager.logJobOutcome(jobOutcome);

      // Update knowledge cards if used
      await this.updateKnowledgeCardUsage(jobOutcome, execution, issue);

      enhancedLogger.debug('Execution evaluation completed', {
        jobId: jobOutcome.jobId,
        success: jobOutcome.success,
        qualityScore: jobOutcome.quality.overallScore,
      });
    } catch (error) {
      enhancedLogger.error('Failed to process execution completion', undefined, {
        executionId: execution.id || 'unknown',
        issueId: issue?.id || 'unknown',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Don't re-throw in integration layer - log and continue
      return;
    }
  }

  /**
   * Create job outcome from ForgeFlow execution data
   */
  private async createJobOutcomeFromExecution(
    execution: ExecutionStatus,
    issue: Issue,
    agents: Agent[],
    qualityResults?: QualityGateResult,
  ): Promise<JobOutcome> {
    // Create base job outcome
    const jobOutcome = JobOutcomeBuilder.create(`job_${execution.id}`, issue.id, execution.id);

    // Set success based on execution status
    const isSuccess = execution.status === 'completed' && execution.progress >= 1.0;

    // Build job metadata from execution and issue data
    const metadata: JobMetadata = {
      agentTypes: agents.map((agent) => agent.type),
      pattern: execution.pattern,
      phase: this.getCurrentPhase(execution),
      priority: this.mapIssuePriorityToJobPriority(issue),
      startTime: execution.startTime,
      endTime: execution.endTime || new Date(),
      duration: execution.endTime
        ? execution.endTime.getTime() - execution.startTime.getTime()
        : undefined,
      category: this.mapIssueToJobCategory(issue),
      complexity: this.estimateComplexity(issue, execution),
      childJobIds: [],
      githubData: {
        prNumber: undefined, // Would be set if PR exists
        commitSha: undefined, // Would be set from git operations
        reviewers: [],
        labels: issue.labels || [],
      },
    };

    // Build job context
    const context: JobContext = {
      projectId: this.extractProjectId(issue),
      projectPath: process.cwd(),
      projectType: this.detectProjectType(),
      knowledgeCards: await this.getUsedKnowledgeCards(execution, issue),
      similarJobs: [], // Would be populated by pattern analysis
      environment: {
        operatingSystem: process.platform,
        nodeVersion: process.version,
        dependencies: await this.getProjectDependencies(),
      },
      userContext: {
        userInput: issue.title + '\n' + issue.body,
        requestType: this.mapIssueToRequestType(issue),
        urgency: this.mapIssuePriorityToUrgency(issue),
      },
    };

    // Calculate quality metrics
    const qualityMetrics = this.calculateQualityMetrics(execution, qualityResults);

    // Calculate learning metrics
    const learningMetrics = this.calculateLearningMetrics(execution, agents);

    // Apply success/failure with calculated metrics
    const finalOutcome = isSuccess
      ? JobOutcomeBuilder.markSuccess(
          {
            ...jobOutcome,
            metadata,
            context,
            quality: qualityMetrics,
            learning: learningMetrics,
          },
          qualityMetrics.overallScore,
        )
      : JobOutcomeBuilder.markFailure(
          {
            ...jobOutcome,
            metadata,
            context,
            quality: qualityMetrics,
            learning: learningMetrics,
          },
          execution.error || 'Execution failed',
          qualityMetrics.overallScore,
        );

    return finalOutcome;
  }

  /**
   * Get current execution phase
   */
  private getCurrentPhase(execution: ExecutionStatus): string {
    if (execution.status === 'running') {
      // Find the currently running phase
      const currentPhase = execution.phases.find((phase) => phase.status === 'running');
      return currentPhase?.name || 'unknown';
    }

    return execution.status;
  }

  /**
   * Map issue priority to job priority
   */
  private mapIssuePriorityToJobPriority(issue: Issue): 'low' | 'medium' | 'high' | 'critical' {
    const labels = issue.labels || [];

    if (labels.some((label) => label.toLowerCase().includes('critical'))) return 'critical';
    if (labels.some((label) => label.toLowerCase().includes('high'))) return 'high';
    if (labels.some((label) => label.toLowerCase().includes('low'))) return 'low';

    return 'medium';
  }

  /**
   * Map issue to job category
   */
  private mapIssueToJobCategory(
    issue: Issue,
  ): 'feature' | 'bugfix' | 'refactor' | 'test' | 'deploy' | 'maintenance' {
    const title = issue.title.toLowerCase();
    const labels = (issue.labels || []).map((label) => label.toLowerCase());

    if (labels.includes('bug') || title.includes('fix') || title.includes('bug')) {
      return 'bugfix';
    }

    if (labels.includes('feature') || labels.includes('enhancement') || title.includes('feature')) {
      return 'feature';
    }

    if (labels.includes('refactor') || title.includes('refactor')) {
      return 'refactor';
    }

    if (labels.includes('test') || title.includes('test')) {
      return 'test';
    }

    if (labels.includes('deployment') || title.includes('deploy')) {
      return 'deploy';
    }

    return 'maintenance';
  }

  /**
   * Estimate complexity from issue and execution data
   */
  private estimateComplexity(
    issue: Issue,
    execution: ExecutionStatus,
  ): 'low' | 'medium' | 'high' | 'very-high' {
    // Base complexity on execution duration and phases
    const duration = execution.endTime
      ? execution.endTime.getTime() - execution.startTime.getTime()
      : 0;
    const phaseCount = execution.phases.length;

    // Factor in issue characteristics
    const titleLength = issue.title.length;
    const bodyLength = issue.body.length;
    const labelCount = (issue.labels || []).length;

    // Simple heuristic calculation
    let complexityScore = 0;

    // Duration factor (in minutes)
    const durationMinutes = duration / (1000 * 60);
    if (durationMinutes > 60) complexityScore += 3;
    else if (durationMinutes > 30) complexityScore += 2;
    else if (durationMinutes > 15) complexityScore += 1;

    // Phase count factor
    if (phaseCount > 5) complexityScore += 2;
    else if (phaseCount > 3) complexityScore += 1;

    // Content complexity factor
    if (titleLength > 100 || bodyLength > 1000) complexityScore += 1;
    if (labelCount > 5) complexityScore += 1;

    // Map score to complexity level
    if (complexityScore >= 6) return 'very-high';
    if (complexityScore >= 4) return 'high';
    if (complexityScore >= 2) return 'medium';
    return 'low';
  }

  /**
   * Extract project ID from issue
   */
  private extractProjectId(issue: Issue): string {
    // Use epic ID if available, otherwise generate from issue
    return issue.epicId || `project_${issue.id.split('-')[0] || 'default'}`;
  }

  /**
   * Detect project type from file system
   */
  private detectProjectType(): string {
    // Simple project type detection - in real implementation would be more sophisticated
    try {
      const fs = require('fs');
      if (fs.existsSync('package.json')) return 'typescript';
      if (fs.existsSync('pom.xml')) return 'java';
      if (fs.existsSync('requirements.txt')) return 'python';
      if (fs.existsSync('Cargo.toml')) return 'rust';
      if (fs.existsSync('go.mod')) return 'go';
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get knowledge cards that were used during execution
   */
  private async getUsedKnowledgeCards(
    execution: ExecutionStatus,
    issue: Issue,
  ): Promise<JobContext['knowledgeCards']> {
    try {
      // Search for relevant knowledge cards
      const searchQuery = issue.title + ' ' + issue.body;
      const searchResults = await this.knowledgeManager.searchCards({
        text: searchQuery,
        limit: 10,
        includeGlobal: true,
      });

      return searchResults.map((result) => ({
        cardId: result.card.id,
        title: result.card.title,
        relevanceScore: result.relevanceScore,
        effectiveness: result.card.effectiveness || 0.5,
        usageOutcome: execution.status === 'completed' ? 'success' : 'failure',
      }));
    } catch (error) {
      enhancedLogger.warn('Failed to get knowledge cards for execution', {
        executionId: execution.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Get project dependencies
   */
  private async getProjectDependencies(): Promise<Record<string, string>> {
    try {
      const fs = require('fs').promises;
      const path = require('path');

      // Try to read package.json for Node.js projects
      try {
        const packagePath = path.join(process.cwd(), 'package.json');
        const packageContent = await fs.readFile(packagePath, 'utf8');
        const packageData = JSON.parse(packageContent);
        return {
          ...(packageData.dependencies || {}),
          ...(packageData.devDependencies || {}),
        };
      } catch {
        // Not a Node.js project or no package.json
      }

      // Could add support for other dependency files (requirements.txt, pom.xml, etc.)
      return {};
    } catch (error) {
      enhancedLogger.warn('Failed to get project dependencies', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {};
    }
  }

  /**
   * Map issue to request type
   */
  private mapIssueToRequestType(issue: Issue): string {
    const labels = (issue.labels || []).map((label) => label.toLowerCase());

    if (labels.includes('bug')) return 'bugfix';
    if (labels.includes('feature') || labels.includes('enhancement')) return 'feature';
    if (labels.includes('refactor')) return 'refactor';
    if (labels.includes('documentation')) return 'documentation';
    if (labels.includes('test')) return 'testing';

    return 'general';
  }

  /**
   * Map issue priority to urgency
   */
  private mapIssuePriorityToUrgency(issue: Issue): 'low' | 'medium' | 'high' | 'critical' {
    return this.mapIssuePriorityToJobPriority(issue);
  }

  /**
   * Calculate quality metrics from execution data
   */
  private calculateQualityMetrics(
    execution: ExecutionStatus,
    qualityResults?: QualityGateResult,
  ): JobOutcome['quality'] {
    const baseQuality = execution.status === 'completed' ? 0.7 : 0.3;

    // Factor in quality gate results if available
    let qualityScore = baseQuality;
    let gatesPassed = 0;
    let gatesTotal = 0;

    const issues: JobOutcome['quality']['issues'] = [];

    if (qualityResults) {
      gatesTotal = qualityResults.checks.length;
      gatesPassed = qualityResults.checks.filter((check) => check.passed).length;

      // Adjust quality score based on gates
      if (gatesTotal > 0) {
        qualityScore = (qualityScore + gatesPassed / gatesTotal) / 2;
      }

      // Add issues for failed checks
      for (const check of qualityResults.checks) {
        if (!check.passed) {
          issues.push({
            type: 'error',
            category: 'quality-gate',
            description: check.message || `${check.name} check failed`,
            severity: 5,
            fixed: false,
          });
        }
      }
    }

    return {
      overallScore: qualityScore,
      components: {
        codeQuality: qualityScore,
        testQuality: Math.min(qualityScore * 1.1, 1.0),
        documentation: Math.max(qualityScore * 0.9, 0.0),
        maintainability: qualityScore,
        security: qualityScore,
        performance: qualityScore,
      },
      gatesPassed,
      gatesTotal,
      gatesSkipped: 0,
      issues,
      improvements:
        execution.status === 'completed'
          ? [
              {
                type: 'Process',
                description: 'Successful execution completed',
                impact: qualityScore - 0.5,
              },
            ]
          : [],
    };
  }

  /**
   * Calculate learning metrics from execution data
   */
  private calculateLearningMetrics(
    execution: ExecutionStatus,
    agents: Agent[],
  ): JobOutcome['learning'] {
    const isSuccess = execution.status === 'completed';
    const baseLearningness = isSuccess ? 0.6 : 0.4;

    return {
      learningGenerated: baseLearningness,
      knowledgeReused: 0.5, // Would be calculated from knowledge card usage
      adaptabilityShown: execution.phases.length > 1 ? 0.7 : 0.5,
      knowledgeImpact: {
        cardsCreated: isSuccess ? 1 : 0,
        cardsUpdated: 0,
        gotchasResolved: isSuccess ? 1 : 0,
        patternsIdentified: 0,
      },
      efficiency: {
        timeToFirstSolution:
          execution.endTime && execution.phases.length > 0
            ? Math.min(
                (execution.phases[0].endTime?.getTime() || Date.now()) -
                  execution.startTime.getTime(),
                3600000,
              )
            : 0,
        iterationsToSuccess: execution.phases.length,
        errorRecoveryTime: 0, // Would be calculated from error events
        knowledgeRetrievalTime: 1000, // Estimated
      },
      predictions: {
        futureSuccessLikelihood: isSuccess ? 0.8 : 0.4,
        estimatedComplexity: this.estimateComplexityScore(execution),
        recommendedApproach: isSuccess ? 'continue current approach' : 'review and adjust',
        riskFactors: !isSuccess ? ['Execution failure', 'Quality issues'] : [],
      },
    };
  }

  /**
   * Estimate complexity as a numeric score
   */
  private estimateComplexityScore(execution: ExecutionStatus): number {
    const phaseCount = execution.phases.length;
    const duration = execution.endTime
      ? execution.endTime.getTime() - execution.startTime.getTime()
      : 0;

    // Normalize to 0-1 scale
    const phaseScore = Math.min(phaseCount / 10, 1.0); // Max 10 phases
    const durationScore = Math.min(duration / (4 * 60 * 60 * 1000), 1.0); // Max 4 hours

    return (phaseScore + durationScore) / 2;
  }

  /**
   * Update knowledge card usage based on job outcome
   */
  private async updateKnowledgeCardUsage(
    jobOutcome: JobOutcome,
    execution: ExecutionStatus,
    issue: Issue,
  ): Promise<void> {
    try {
      for (const card of jobOutcome.context.knowledgeCards) {
        const cardUsage: CardUsageOutcome = {
          cardId: card.cardId,
          jobId: jobOutcome.jobId,
          timestamp: jobOutcome.timestamp,
          context: {
            agentType: jobOutcome.metadata.agentTypes[0] || 'unknown',
            jobCategory: jobOutcome.metadata.category,
            complexity: jobOutcome.metadata.complexity,
            phase: jobOutcome.metadata.phase,
          },
          outcome: {
            success: card.usageOutcome === 'success',
            relevance: card.relevanceScore,
            effectiveness: card.effectiveness,
            timeToApply: 2000, // Estimated
            userSatisfaction: jobOutcome.success ? 0.8 : 0.4,
          },
          impact: {
            qualityImprovement: jobOutcome.quality.overallScore - 0.5,
            performanceGain: jobOutcome.success ? 0.1 : 0,
            learningValue: jobOutcome.learning.learningGenerated,
            timesSaved: 5000, // Estimated
          },
          feedback: {
            positive: jobOutcome.success ? ['Contributed to success'] : [],
            negative: !jobOutcome.success ? ['Did not prevent failure'] : [],
            suggestions: [],
          },
        };

        await this.evaluationManager.trackCardUsage(card.cardId, jobOutcome.jobId, cardUsage);
      }
    } catch (error) {
      enhancedLogger.error('Failed to update knowledge card usage', undefined, {
        jobId: jobOutcome.jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get evaluation insights for GitHub issue
   */
  async getIssueEvaluationInsights(issue: Issue): Promise<{
    predictedSuccess: number;
    riskFactors: string[];
    recommendations: string[];
    similarJobs: Array<{ jobId: string; similarity: number; outcome: boolean }>;
    estimatedDuration: number;
  }> {
    try {
      // Create context and metadata for prediction
      const context = await this.createPredictionContext(issue);
      const metadata = this.createPredictionMetadata(issue);

      // Get success prediction
      const prediction = await this.evaluationManager.predictJobSuccess(context, metadata);

      // Get similar historical jobs
      const recentJobs = await this.evaluationManager.getJobOutcomes({
        categories: [this.mapIssueToJobCategory(issue)],
        limit: 100,
      });

      const similarJobs = this.findSimilarJobs(issue, recentJobs);

      return {
        predictedSuccess: prediction.successProbability,
        riskFactors: prediction.riskFactors.map((rf) => rf.factor),
        recommendations: prediction.recommendations.map((r) => r.description),
        similarJobs,
        estimatedDuration: prediction.estimatedMetrics.duration,
      };
    } catch (error) {
      enhancedLogger.error('Failed to get evaluation insights for issue', undefined, {
        issueId: issue.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Return default insights on error
      return {
        predictedSuccess: 0.7,
        riskFactors: ['Insufficient historical data'],
        recommendations: ['Proceed with standard approach'],
        similarJobs: [],
        estimatedDuration: 1800000, // 30 minutes default
      };
    }
  }

  /**
   * Create prediction context from issue
   */
  private async createPredictionContext(issue: Issue): Promise<JobContext> {
    const knowledgeCards = await this.getUsedKnowledgeCards(
      {
        id: 'prediction',
        epicId: issue.epicId || 'unknown',
        startTime: new Date(),
        status: 'running',
        pattern: '',
        progress: 0,
        phases: [],
      },
      issue,
    );

    return {
      projectId: this.extractProjectId(issue),
      projectPath: process.cwd(),
      projectType: this.detectProjectType(),
      knowledgeCards,
      similarJobs: [],
      environment: {
        operatingSystem: process.platform,
        dependencies: await this.getProjectDependencies(),
      },
      userContext: {
        userInput: issue.title + '\n' + issue.body,
        requestType: this.mapIssueToRequestType(issue),
        urgency: this.mapIssuePriorityToUrgency(issue),
      },
    };
  }

  /**
   * Create prediction metadata from issue
   */
  private createPredictionMetadata(issue: Issue): JobMetadata {
    return {
      agentTypes: ['strategic-planner', 'code-implementer'], // Default agents
      pattern: 'feature-development',
      phase: 'planning',
      priority: this.mapIssuePriorityToJobPriority(issue),
      startTime: new Date(),
      category: this.mapIssueToJobCategory(issue),
      complexity: 'medium', // Would be estimated more accurately
      childJobIds: [],
      githubData: {
        labels: issue.labels || [],
      },
    };
  }

  /**
   * Find similar jobs based on issue characteristics
   */
  private findSimilarJobs(
    issue: Issue,
    recentJobs: JobOutcome[],
  ): Array<{ jobId: string; similarity: number; outcome: boolean }> {
    const issueCategory = this.mapIssueToJobCategory(issue);
    const issueLabels = new Set(issue.labels || []);

    return recentJobs
      .map((job) => {
        let similarity = 0;

        // Category similarity
        if (job.metadata.category === issueCategory) {
          similarity += 0.4;
        }

        // Label similarity
        const jobLabels = new Set(job.metadata.githubData.labels);
        const commonLabels = [...issueLabels].filter((label) => jobLabels.has(label)).length;
        const totalLabels = Math.max(issueLabels.size, jobLabels.size);
        if (totalLabels > 0) {
          similarity += (commonLabels / totalLabels) * 0.3;
        }

        // Title similarity (simple word matching)
        const issueWords = new Set(issue.title.toLowerCase().split(/\s+/));
        const jobWords = new Set(job.context.userContext.userInput.toLowerCase().split(/\s+/));
        const commonWords = [...issueWords].filter((word) => jobWords.has(word)).length;
        const totalWords = Math.max(issueWords.size, jobWords.size);
        if (totalWords > 0) {
          similarity += (commonWords / totalWords) * 0.3;
        }

        return {
          jobId: job.jobId,
          similarity,
          outcome: job.success,
        };
      })
      .filter((job) => job.similarity > 0.3) // Minimum similarity threshold
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5); // Top 5 similar jobs
  }

  /**
   * Generate evaluation summary for completed execution
   */
  async generateExecutionSummary(executionId: string): Promise<{
    jobId: string;
    overallAssessment: 'excellent' | 'good' | 'fair' | 'poor';
    qualityScore: number;
    learningValue: number;
    keyInsights: string[];
    recommendations: string[];
    performanceMetrics: {
      duration: number;
      efficiency: number;
      resourceUsage: 'low' | 'medium' | 'high';
    };
  } | null> {
    try {
      // Find the job outcome for this execution
      const jobs = await this.evaluationManager.getJobOutcomes({
        limit: 1000,
      });

      const job = jobs.find((j) => j.executionId === executionId);
      if (!job) {
        return null;
      }

      // Generate assessment
      const qualityScore = job.quality.overallScore;
      let overallAssessment: 'excellent' | 'good' | 'fair' | 'poor';

      if (qualityScore >= 0.9) overallAssessment = 'excellent';
      else if (qualityScore >= 0.7) overallAssessment = 'good';
      else if (qualityScore >= 0.5) overallAssessment = 'fair';
      else overallAssessment = 'poor';

      // Extract key insights
      const keyInsights: string[] = [];

      if (job.success) {
        keyInsights.push('Execution completed successfully');
      } else {
        keyInsights.push('Execution encountered issues');
      }

      if (job.learning.learningGenerated > 0.7) {
        keyInsights.push('High learning value generated');
      }

      if (job.quality.components.testQuality > 0.8) {
        keyInsights.push('Excellent test coverage achieved');
      }

      if (job.quality.issues.length > 0) {
        keyInsights.push(`${job.quality.issues.length} quality issues identified`);
      }

      // Generate recommendations
      const recommendations: string[] = [];

      if (qualityScore < 0.7) {
        recommendations.push('Focus on improving code quality in future iterations');
      }

      if (job.learning.knowledgeReused < 0.5) {
        recommendations.push('Leverage existing knowledge base more effectively');
      }

      if (job.metadata.duration && job.metadata.duration > 3600000) {
        // > 1 hour
        recommendations.push('Consider breaking down complex tasks into smaller units');
      }

      // Calculate performance metrics
      const duration = job.metadata.duration || 0;
      const efficiency = job.success ? Math.min(1800000 / Math.max(duration, 60000), 1.0) : 0.3; // Target 30 min

      let resourceUsage: 'low' | 'medium' | 'high' = 'medium';
      if (job.metrics.resources.memoryUsage > 1000 || job.metrics.resources.cpuUsage > 80) {
        resourceUsage = 'high';
      } else if (job.metrics.resources.memoryUsage < 200 && job.metrics.resources.cpuUsage < 20) {
        resourceUsage = 'low';
      }

      return {
        jobId: job.jobId,
        overallAssessment,
        qualityScore,
        learningValue: job.learning.learningGenerated,
        keyInsights,
        recommendations,
        performanceMetrics: {
          duration,
          efficiency,
          resourceUsage,
        },
      };
    } catch (error) {
      enhancedLogger.error('Failed to generate execution summary', undefined, {
        executionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }
}

/**
 * Factory function to create ForgeFlow integration
 */
export async function createForgeFlowIntegration(
  evaluationManager: EvaluationManager,
  knowledgeManager: KnowledgeManager,
  config: EvaluationConfig,
): Promise<ForgeFlowEvaluationIntegration> {
  return new ForgeFlowEvaluationIntegration(evaluationManager, knowledgeManager, config);
}

/**
 * Integration utilities
 */
export const ForgeFlowIntegrationUtils = {
  /**
   * Extract execution metrics from ForgeFlow execution status
   */
  extractExecutionMetrics(execution: ExecutionStatus): {
    duration: number;
    phaseCount: number;
    successRate: number;
    errorCount: number;
  } {
    const duration = execution.endTime
      ? execution.endTime.getTime() - execution.startTime.getTime()
      : 0;

    const phaseCount = execution.phases.length;
    const completedPhases = execution.phases.filter((phase) => phase.status === 'completed').length;
    const failedPhases = execution.phases.filter((phase) => phase.status === 'failed').length;

    const successRate = phaseCount > 0 ? completedPhases / phaseCount : 0;
    const errorCount = failedPhases;

    return {
      duration,
      phaseCount,
      successRate,
      errorCount,
    };
  },

  /**
   * Map ForgeFlow agent types to evaluation categories
   */
  mapAgentTypeToCategory(agentType: string): string {
    const categoryMap: Record<string, string> = {
      'strategic-planner': 'planning',
      'system-architect': 'architecture',
      'code-implementer': 'implementation',
      'test-coverage-validator': 'testing',
      'code-quality-reviewer': 'quality',
      'security-auditor': 'security',
      'performance-optimizer': 'performance',
      'deployment-automation': 'deployment',
    };

    return categoryMap[agentType] || 'general';
  },

  /**
   * Create GitHub issue comment with evaluation insights
   */
  formatEvaluationInsightsComment(insights: {
    predictedSuccess: number;
    riskFactors: string[];
    recommendations: string[];
    estimatedDuration: number;
  }): string {
    const successPercentage = (insights.predictedSuccess * 100).toFixed(1);
    const durationMinutes = Math.round(insights.estimatedDuration / (1000 * 60));

    return `## 🤖 ForgeFlow V2 Evaluation Insights

**Predicted Success Rate:** ${successPercentage}%
**Estimated Duration:** ${durationMinutes} minutes

### 🚨 Risk Factors
${
  insights.riskFactors.length > 0
    ? insights.riskFactors.map((risk) => `- ${risk}`).join('\n')
    : '- No significant risks identified'
}

### 💡 Recommendations
${
  insights.recommendations.length > 0
    ? insights.recommendations.map((rec) => `- ${rec}`).join('\n')
    : '- Proceed with standard approach'
}

---
*Generated by ForgeFlow V2 Evaluation Layer*`;
  },
};
