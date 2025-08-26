// Evaluation Manager - Main coordinator for the self-improving analytics system
// Integrates all evaluation components with centralized management

import type {
  IEvaluationManager,
  EvaluationConfig,
  JobOutcome,
  JobOutcomeFilters,
  PatternAnalysisResult,
  SuccessPattern,
  FailurePattern,
  SuccessPrediction,
  JobContext,
  JobMetadata,
  PromotionDemotionResult,
  CardUsageOutcome,
  EffectivenessReport,
  LearningTrends,
  ProgressMetrics,
  PerformanceReport,
  SystemPerformanceAnalysis,
  PerformanceBottleneck,
  QualityAssessmentResult,
  QualityReport,
  QualityIssue,
  LearningInsights,
  LearningRecommendations,
  TimeRange,
} from './types';

import { JobOutcomeTracker } from './job-outcome-tracker';
import { MLPatternAnalysisEngine } from './pattern-analysis-engine';
import { AutomatedKnowledgePromotionSystem } from './knowledge-promotion-system';
import { AdvancedLearningAnalytics } from './learning-analytics';
import { SystemPerformanceMonitor } from './performance-monitor';
import { AutomatedQualityAssessment } from './quality-assessment';

import type { KnowledgeManager } from '../knowledge/knowledge-manager';
import { enhancedLogger } from '../utils/enhanced-logger';
import { promises as fs } from 'fs';
import { join } from 'path';

export class EvaluationManager implements IEvaluationManager {
  private config: EvaluationConfig;

  // Core evaluation components
  private jobTracker: JobOutcomeTracker;
  private patternEngine: MLPatternAnalysisEngine;
  private promotionSystem: AutomatedKnowledgePromotionSystem;
  private learningAnalytics: AdvancedLearningAnalytics;
  private performanceMonitor: SystemPerformanceMonitor;
  private qualityAssessment: AutomatedQualityAssessment;

  // Integration components
  private knowledgeManager: KnowledgeManager;

  // Manager state
  private isInitialized = false;
  private isRunning = false;
  private analyticsInterval: NodeJS.Timeout | null = null;

  // Performance tracking
  private performanceStats = {
    operationsRun: 0,
    totalOperationTime: 0,
    avgOperationTime: 0,
    lastOperation: new Date(),
    errors: 0,
    warnings: 0,
  };

  constructor(config: EvaluationConfig, knowledgeManager: KnowledgeManager) {
    this.config = config;
    this.knowledgeManager = knowledgeManager;

    // Initialize core components
    this.jobTracker = new JobOutcomeTracker(config);
    this.patternEngine = new MLPatternAnalysisEngine(config);
    this.promotionSystem = new AutomatedKnowledgePromotionSystem(
      config,
      knowledgeManager,
      this.jobTracker,
    );
    this.learningAnalytics = new AdvancedLearningAnalytics(
      config,
      this.jobTracker,
      this.patternEngine,
      this.promotionSystem,
    );
    this.performanceMonitor = new SystemPerformanceMonitor(config, this.jobTracker);
    this.qualityAssessment = new AutomatedQualityAssessment(config, this.jobTracker);
  }

  /**
   * Initialize the evaluation manager and all components
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      enhancedLogger.warn('Evaluation manager already initialized');
      return;
    }

    try {
      enhancedLogger.info('Initializing evaluation manager...');

      // Create .ff2 directory if it doesn't exist
      const ff2Dir = join(process.cwd(), '.ff2');
      await fs.mkdir(ff2Dir, { recursive: true });

      // Initialize all components (they initialize themselves in constructors)
      enhancedLogger.info('All evaluation components initialized');

      // Start automated analytics if configured
      if (this.config.analysisInterval > 0) {
        await this.startAutomatedAnalytics();
      }

      this.isInitialized = true;
      this.isRunning = true;

      enhancedLogger.info('Evaluation manager initialized successfully', {
        components: [
          'JobOutcomeTracker',
          'MLPatternAnalysisEngine',
          'KnowledgePromotionSystem',
          'LearningAnalytics',
          'PerformanceMonitor',
          'QualityAssessment',
        ],
        config: {
          analysisInterval: this.config.analysisInterval,
          promotionThreshold: this.config.promotionThreshold,
          demotionThreshold: this.config.demotionThreshold,
        },
      });
    } catch (error) {
      this.isInitialized = false;
      this.isRunning = false;

      enhancedLogger.error('Failed to initialize evaluation manager', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Start automated analytics processing
   */
  private async startAutomatedAnalytics(): Promise<void> {
    const intervalMs = this.config.analysisInterval * 60 * 60 * 1000; // Convert hours to milliseconds

    this.analyticsInterval = setInterval(async () => {
      try {
        await this.runAutomatedAnalysis();
      } catch (error) {
        enhancedLogger.error('Automated analysis failed', undefined, {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        this.performanceStats.errors++;
      }
    }, intervalMs);

    enhancedLogger.info('Automated analytics started', {
      intervalHours: this.config.analysisInterval,
    });
  }

  /**
   * Run automated analysis cycle
   */
  private async runAutomatedAnalysis(): Promise<void> {
    const startTime = performance.now();

    try {
      enhancedLogger.info('Running automated analysis cycle...');

      // 1. Run knowledge promotion/demotion
      const promotionResult = await this.promotionSystem.promoteDemoteCards();
      enhancedLogger.debug('Knowledge promotion completed', {
        promoted: promotionResult.stats.promotedCount,
        demoted: promotionResult.stats.demotedCount,
        retired: promotionResult.stats.retiredCount,
      });

      // 2. Update pattern models with recent jobs
      const recentTimeRange: TimeRange = {
        start: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        end: new Date(),
      };

      const recentJobs = await this.jobTracker.getJobOutcomes({
        timeRange: recentTimeRange,
        limit: 1000,
      });

      if (recentJobs.length > 0) {
        await this.patternEngine.updatePatternModels(recentJobs);
        enhancedLogger.debug('Pattern models updated', {
          jobsProcessed: recentJobs.length,
        });
      }

      // 3. Generate insights and recommendations
      if (recentJobs.length > 10) {
        const insights = await this.learningAnalytics.generateInsights(recentJobs);
        const recommendations = await this.learningAnalytics.generateRecommendations();

        enhancedLogger.debug('Analytics generated', {
          insights: insights.insights.length,
          recommendations:
            recommendations.highPriority.length + recommendations.mediumPriority.length,
        });
      }

      // 4. Run system health checks
      const systemAnalysis = await this.performanceMonitor.analyzeSystemPerformance();
      if (systemAnalysis.health.overall < 0.7) {
        enhancedLogger.warn('System health is degraded', {
          overallHealth: systemAnalysis.health.overall,
          criticalIssues: systemAnalysis.health.criticalIssues,
        });
      }

      // Update performance stats
      const duration = performance.now() - startTime;
      this.updatePerformanceStats(duration);

      enhancedLogger.info('Automated analysis cycle completed', {
        duration: Math.round(duration),
        systemHealth: systemAnalysis.health.overall,
      });
    } catch (error) {
      enhancedLogger.error('Automated analysis cycle failed', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Shutdown the evaluation manager
   */
  async shutdown(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      enhancedLogger.info('Shutting down evaluation manager...');

      // Stop automated analytics
      if (this.analyticsInterval) {
        clearInterval(this.analyticsInterval);
        this.analyticsInterval = null;
      }

      // Close job tracker
      await this.jobTracker.close();

      // Stop performance monitoring
      await this.performanceMonitor.stopMonitoring();

      // Save quality assessment data
      await this.qualityAssessment.saveQualityData();

      this.isRunning = false;

      enhancedLogger.info('Evaluation manager shut down successfully');
    } catch (error) {
      enhancedLogger.error('Failed to shutdown evaluation manager cleanly', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // Implementation of IEvaluationManager interface

  /**
   * Log job outcome with comprehensive processing
   */
  async logJobOutcome(outcome: JobOutcome): Promise<void> {
    const startTime = performance.now();

    try {
      if (!this.isInitialized) {
        throw new Error('Evaluation manager not initialized');
      }

      // 1. Log to job tracker
      await this.jobTracker.logJobOutcome(outcome);

      // 2. Track performance
      await this.performanceMonitor.trackJobPerformance(outcome);

      // 3. Assess quality
      const qualityResult = await this.qualityAssessment.assessJobQuality(outcome);

      // 4. Analyze patterns
      const patternResult = await this.patternEngine.analyzeJobOutcome(outcome);

      // 5. Track knowledge usage if applicable
      for (const card of outcome.context.knowledgeCards) {
        const cardUsage: CardUsageOutcome = {
          cardId: card.cardId,
          jobId: outcome.jobId,
          timestamp: outcome.timestamp,
          context: {
            agentType: outcome.metadata.agentTypes[0] || 'unknown',
            jobCategory: outcome.metadata.category,
            complexity: outcome.metadata.complexity,
            phase: outcome.metadata.phase,
          },
          outcome: {
            success: card.usageOutcome === 'success',
            relevance: card.relevanceScore,
            effectiveness: card.effectiveness,
            timeToApply: 1000, // Simplified
            userSatisfaction: outcome.success ? 0.8 : 0.4,
          },
          impact: {
            qualityImprovement: outcome.quality.overallScore - 0.5, // Simplified baseline
            performanceGain: 0.1, // Simplified
            learningValue: outcome.learning.learningGenerated,
            timesSaved: 5000, // Simplified
          },
          feedback: {
            positive: outcome.success ? ['Helped resolve issue'] : [],
            negative: !outcome.success ? ['Did not prevent failure'] : [],
            suggestions: [],
          },
        };

        await this.promotionSystem.trackCardUsageOutcome(card.cardId, outcome.jobId, cardUsage);
      }

      // Update performance stats
      const duration = performance.now() - startTime;
      this.updatePerformanceStats(duration);

      enhancedLogger.debug('Job outcome processed', {
        jobId: outcome.jobId,
        success: outcome.success,
        qualityScore: qualityResult.overallScore,
        patternsMatched: patternResult.matchedPatterns.length,
        duration: Math.round(duration),
      });
    } catch (error) {
      this.performanceStats.errors++;
      enhancedLogger.error('Failed to log job outcome', undefined, {
        jobId: outcome.jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get job outcome by ID
   */
  async getJobOutcome(jobId: string): Promise<JobOutcome | null> {
    return this.jobTracker.getJobOutcome(jobId);
  }

  /**
   * Get job outcomes with filters
   */
  async getJobOutcomes(filters: JobOutcomeFilters): Promise<JobOutcome[]> {
    return this.jobTracker.getJobOutcomes(filters);
  }

  /**
   * Analyze patterns in job outcomes
   */
  async analyzePatterns(timeRange: TimeRange): Promise<PatternAnalysisResult[]> {
    const jobs = await this.jobTracker.getJobOutcomes({
      timeRange,
      limit: 5000,
    });

    const results: PatternAnalysisResult[] = [];
    for (const job of jobs) {
      try {
        const result = await this.patternEngine.analyzeJobOutcome(job);
        results.push(result);
      } catch (error) {
        enhancedLogger.warn('Pattern analysis failed for job', {
          jobId: job.jobId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Get success patterns
   */
  async getSuccessPatterns(): Promise<SuccessPattern[]> {
    const recentJobs = await this.jobTracker.getJobOutcomes({
      limit: 1000,
    });

    return this.patternEngine.identifySuccessPatterns(recentJobs.filter((job) => job.success));
  }

  /**
   * Get failure patterns
   */
  async getFailurePatterns(): Promise<FailurePattern[]> {
    const recentJobs = await this.jobTracker.getJobOutcomes({
      limit: 1000,
    });

    return this.patternEngine.identifyFailurePatterns(recentJobs.filter((job) => !job.success));
  }

  /**
   * Predict job success
   */
  async predictJobSuccess(context: JobContext, metadata: JobMetadata): Promise<SuccessPrediction> {
    return this.patternEngine.predictJobSuccess(context, metadata);
  }

  /**
   * Evaluate knowledge cards for promotion/demotion
   */
  async evaluateKnowledgeCards(): Promise<PromotionDemotionResult> {
    return this.promotionSystem.promoteDemoteCards();
  }

  /**
   * Track knowledge card usage
   */
  async trackCardUsage(cardId: string, jobId: string, outcome: CardUsageOutcome): Promise<void> {
    return this.promotionSystem.trackCardUsageOutcome(cardId, jobId, outcome);
  }

  /**
   * Generate learning effectiveness report
   */
  async generateLearningReport(timeRange: TimeRange): Promise<EffectivenessReport> {
    return this.learningAnalytics.calculateEffectiveness(timeRange);
  }

  /**
   * Analyze learning trends
   */
  async analyzeLearningTrends(timeRange: TimeRange): Promise<LearningTrends> {
    return this.learningAnalytics.analyzeLearningTrends(timeRange);
  }

  /**
   * Get current progress metrics
   */
  async getProgressMetrics(): Promise<ProgressMetrics> {
    return this.learningAnalytics.trackProgressMetrics();
  }

  /**
   * Generate performance report
   */
  async generatePerformanceReport(timeRange: TimeRange): Promise<PerformanceReport> {
    return this.performanceMonitor.generatePerformanceReport(timeRange);
  }

  /**
   * Analyze system performance
   */
  async analyzeSystemPerformance(): Promise<SystemPerformanceAnalysis> {
    return this.performanceMonitor.analyzeSystemPerformance();
  }

  /**
   * Identify performance bottlenecks
   */
  async identifyBottlenecks(): Promise<PerformanceBottleneck[]> {
    return this.performanceMonitor.identifyBottlenecks();
  }

  /**
   * Assess job quality
   */
  async assessQuality(job: JobOutcome): Promise<QualityAssessmentResult> {
    return this.qualityAssessment.assessJobQuality(job);
  }

  /**
   * Generate quality report
   */
  async generateQualityReport(timeRange: TimeRange): Promise<QualityReport> {
    return this.qualityAssessment.generateQualityReport(timeRange);
  }

  /**
   * Identify quality issues
   */
  async identifyQualityIssues(): Promise<QualityIssue[]> {
    return this.qualityAssessment.identifyQualityIssues();
  }

  /**
   * Generate learning insights
   */
  async generateInsights(timeRange: TimeRange): Promise<LearningInsights> {
    const jobs = await this.jobTracker.getJobOutcomes({
      timeRange,
      limit: 5000,
    });

    return this.learningAnalytics.generateInsights(jobs);
  }

  /**
   * Get learning recommendations
   */
  async getRecommendations(): Promise<LearningRecommendations> {
    return this.learningAnalytics.generateRecommendations();
  }

  /**
   * Update configuration
   */
  async updateConfig(config: Partial<EvaluationConfig>): Promise<void> {
    try {
      this.config = { ...this.config, ...config };

      // Save updated configuration
      const configPath = join(process.cwd(), '.ff2', 'evaluation-config.json');
      await fs.writeFile(configPath, JSON.stringify(this.config, null, 2));

      // Restart automated analytics if interval changed
      if (config.analysisInterval !== undefined && this.analyticsInterval) {
        clearInterval(this.analyticsInterval);
        await this.startAutomatedAnalytics();
      }

      enhancedLogger.info('Evaluation configuration updated', {
        updatedFields: Object.keys(config),
      });
    } catch (error) {
      enhancedLogger.error('Failed to update configuration', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Export evaluation data
   */
  async exportData(timeRange: TimeRange, format: 'json' | 'csv' = 'json'): Promise<string> {
    try {
      const jobs = await this.jobTracker.getJobOutcomes({
        timeRange,
        limit: 50000,
      });

      if (jobs.length === 0) {
        throw new Error('No data found for export in the specified time range');
      }

      // Use job tracker's export functionality
      const exportPath = await this.jobTracker.exportOutcomes(timeRange, format);

      enhancedLogger.info('Evaluation data exported', {
        timeRange,
        format,
        jobCount: jobs.length,
        exportPath,
      });

      return exportPath;
    } catch (error) {
      enhancedLogger.error('Failed to export evaluation data', undefined, {
        timeRange,
        format,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Clean up old evaluation data
   */
  async cleanup(olderThanDays: number): Promise<number> {
    try {
      const removedJobs = await this.jobTracker.cleanup(olderThanDays);

      enhancedLogger.info('Evaluation data cleanup completed', {
        olderThanDays,
        removedJobs,
      });

      return removedJobs;
    } catch (error) {
      enhancedLogger.error('Failed to cleanup evaluation data', undefined, {
        olderThanDays,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get comprehensive system status
   */
  getSystemStatus(): {
    isInitialized: boolean;
    isRunning: boolean;
    components: {
      jobTracker: any;
      patternEngine: any;
      promotionSystem: any;
      learningAnalytics: any;
      performanceMonitor: any;
      qualityAssessment: any;
    };
    performance: typeof this.performanceStats;
  } {
    return {
      isInitialized: this.isInitialized,
      isRunning: this.isRunning,
      components: {
        jobTracker: this.jobTracker.getPerformanceStats(),
        patternEngine: this.patternEngine.getPerformanceStats(),
        promotionSystem: this.promotionSystem.getPerformanceStats(),
        learningAnalytics: this.learningAnalytics.getPerformanceStats(),
        performanceMonitor: this.performanceMonitor.getPerformanceStats(),
        qualityAssessment: this.qualityAssessment.getPerformanceStats(),
      },
      performance: this.performanceStats,
    };
  }

  /**
   * Generate comprehensive health report
   */
  async generateHealthReport(): Promise<{
    timestamp: Date;
    systemHealth: 'healthy' | 'warning' | 'critical';
    components: Record<string, { status: 'healthy' | 'warning' | 'error'; details: string }>;
    recommendations: string[];
    metrics: {
      jobsProcessed: number;
      avgProcessingTime: number;
      successRate: number;
      qualityScore: number;
    };
  }> {
    try {
      const systemStatus = this.getSystemStatus();
      const performanceAnalysis = await this.performanceMonitor.analyzeSystemPerformance();

      // Get recent statistics
      const recentStats = await this.jobTracker.getStatistics({
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        end: new Date(),
      });

      // Assess component health
      const components: Record<
        string,
        { status: 'healthy' | 'warning' | 'error'; details: string }
      > = {};

      components.jobTracker = {
        status: systemStatus.components.jobTracker.isWithinThreshold ? 'healthy' : 'warning',
        details: `Avg write time: ${systemStatus.components.jobTracker.avgWriteTime.toFixed(2)}ms`,
      };

      components.patternEngine = {
        status: systemStatus.components.patternEngine.isWithinThreshold ? 'healthy' : 'warning',
        details: `Avg analysis time: ${systemStatus.components.patternEngine.avgAnalysisTime.toFixed(2)}ms`,
      };

      components.performanceMonitor = {
        status:
          systemStatus.components.performanceMonitor.componentsHealthy >
          systemStatus.components.performanceMonitor.totalComponents * 0.8
            ? 'healthy'
            : 'warning',
        details: `${systemStatus.components.performanceMonitor.componentsHealthy}/${systemStatus.components.performanceMonitor.totalComponents} components healthy`,
      };

      components.qualityAssessment = {
        status:
          systemStatus.components.qualityAssessment.accuracyRate > 0.95 ? 'healthy' : 'warning',
        details: `Accuracy: ${(systemStatus.components.qualityAssessment.accuracyRate * 100).toFixed(1)}%`,
      };

      // Determine overall system health
      const componentStatuses = Object.values(components).map((c) => c.status);
      const errorCount = componentStatuses.filter((s) => s === 'error').length;
      const warningCount = componentStatuses.filter((s) => s === 'warning').length;

      let systemHealth: 'healthy' | 'warning' | 'critical';
      if (errorCount > 0) {
        systemHealth = 'critical';
      } else if (warningCount > 2) {
        systemHealth = 'critical';
      } else if (warningCount > 0) {
        systemHealth = 'warning';
      } else {
        systemHealth = 'healthy';
      }

      // Generate recommendations
      const recommendations: string[] = [];
      if (performanceAnalysis.health.overall < 0.7) {
        recommendations.push('System health is degraded - investigate resource constraints');
      }
      if (recentStats.avgQualityScore < 0.7) {
        recommendations.push('Quality scores are below target - review quality processes');
      }
      if (systemStatus.performance.errors > 10) {
        recommendations.push('High error rate detected - investigate system stability');
      }

      const report = {
        timestamp: new Date(),
        systemHealth,
        components,
        recommendations,
        metrics: {
          jobsProcessed: recentStats.totalJobs,
          avgProcessingTime: systemStatus.performance.avgOperationTime,
          successRate:
            recentStats.totalJobs > 0 ? recentStats.successfulJobs / recentStats.totalJobs : 0,
          qualityScore: recentStats.avgQualityScore,
        },
      };

      enhancedLogger.info('Health report generated', {
        systemHealth,
        componentsHealthy: componentStatuses.filter((s) => s === 'healthy').length,
        recommendations: recommendations.length,
      });

      return report;
    } catch (error) {
      enhancedLogger.error('Failed to generate health report', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Update performance statistics
   */
  private updatePerformanceStats(duration: number): void {
    this.performanceStats.operationsRun++;
    this.performanceStats.totalOperationTime += duration;
    this.performanceStats.avgOperationTime =
      this.performanceStats.totalOperationTime / this.performanceStats.operationsRun;
    this.performanceStats.lastOperation = new Date();
  }
}

// Factory function to create and initialize evaluation manager
export async function createEvaluationManager(
  config: EvaluationConfig,
  knowledgeManager: KnowledgeManager,
): Promise<EvaluationManager> {
  const manager = new EvaluationManager(config, knowledgeManager);
  await manager.initialize();
  return manager;
}

// Default configuration factory
export function createDefaultEvaluationConfig(): EvaluationConfig {
  return {
    loggingBasePath: join(process.cwd(), '.ff2'),
    jobsLogFile: 'jobs.ndjson',
    analysisInterval: 6, // 6 hours
    promotionThreshold: 0.8,
    demotionThreshold: 0.3,
    patternAnalysisWindow: 30, // 30 days
    performanceThresholds: {
      jobLoggingMs: 10,
      patternAnalysisMs: 100,
      analyticsGenerationMs: 2000,
      qualityAssessmentMs: 100,
    },
    mlConfig: {
      enabled: true,
      trainingDataSize: 1000,
      retrainInterval: 7, // 7 days
    },
  };
}
