// Evaluation Layer - Self-improving analytics system for ForgeFlow V2
// Export all evaluation components and utilities

// Main evaluation manager
export {
  EvaluationManager,
  createEvaluationManager,
  createDefaultEvaluationConfig,
} from './evaluation-manager';
import { createEvaluationManager, createDefaultEvaluationConfig } from './evaluation-manager';
import type { EvaluationConfig } from './types';

// Core components
export { JobOutcomeTracker, JobOutcomeBuilder } from './job-outcome-tracker';
export { MLPatternAnalysisEngine } from './pattern-analysis-engine';
export { AutomatedKnowledgePromotionSystem } from './knowledge-promotion-system';
export { AdvancedLearningAnalytics } from './learning-analytics';
export { SystemPerformanceMonitor } from './performance-monitor';
export { AutomatedQualityAssessment } from './quality-assessment';

// Types and interfaces
export type {
  // Configuration
  EvaluationConfig,

  // Core interfaces
  IEvaluationManager,
  PatternAnalysisEngine,
  KnowledgePromotionSystem,
  LearningAnalytics,
  PerformanceAnalytics,
  QualityAssessment,

  // Job outcome types
  JobOutcome,
  JobMetadata,
  JobMetrics,
  JobContext,
  PatternData,
  QualityMetrics,
  LearningMetrics,
  JobOutcomeFilters,

  // Pattern analysis types
  PatternAnalysisResult,
  SuccessPattern,
  FailurePattern,
  SuccessPrediction,

  // Knowledge promotion types
  EffectivenessEvaluation,
  PromotionDemotionResult,
  CardUsageOutcome,
  PromotionCandidate,
  DemotionCandidate,

  // Learning analytics types
  EffectivenessReport,
  LearningTrends,
  LearningInsights,
  ProgressMetrics,
  LearningRecommendations,
  TrendIndicator,

  // Performance analytics types
  PerformanceReport,
  SystemPerformanceAnalysis,
  PerformanceBottleneck,
  OptimizationPlan,
  ComponentPerformance,
  ResourceAnalysis,

  // Quality assessment types
  QualityAssessmentResult,
  QualityReport,
  QualityIssue,
  QualityTrends,
  QualityRecommendations,

  // Utility types
  TimeRange,
} from './types';

// Utility functions
export const EvaluationUtils = {
  /**
   * Create a time range for the last N days
   */
  createTimeRangeLastNDays(days: number): { start: Date; end: Date } {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);

    return { start, end };
  },

  /**
   * Create a time range for the current month
   */
  createTimeRangeCurrentMonth(): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    return { start, end };
  },

  /**
   * Create a time range for the last N hours
   */
  createTimeRangeLastNHours(hours: number): { start: Date; end: Date } {
    const end = new Date();
    const start = new Date(end.getTime() - hours * 60 * 60 * 1000);

    return { start, end };
  },

  /**
   * Calculate success rate from job outcomes
   */
  calculateSuccessRate(outcomes: Array<{ success: boolean }>): number {
    if (outcomes.length === 0) return 0;

    const successfulJobs = outcomes.filter((job) => job.success).length;
    return successfulJobs / outcomes.length;
  },

  /**
   * Calculate average quality score from job outcomes
   */
  calculateAverageQualityScore(outcomes: Array<{ quality: { overallScore: number } }>): number {
    if (outcomes.length === 0) return 0;

    const totalScore = outcomes.reduce((sum, job) => sum + job.quality.overallScore, 0);
    return totalScore / outcomes.length;
  },

  /**
   * Group outcomes by time period
   */
  groupOutcomesByTimePeriod(
    outcomes: Array<{ timestamp: Date }>,
    periodType: 'hour' | 'day' | 'week' | 'month',
  ): Map<string, Array<{ timestamp: Date }>> {
    const groups = new Map<string, Array<{ timestamp: Date }>>();

    for (const outcome of outcomes) {
      let key: string;

      switch (periodType) {
        case 'hour':
          key = outcome.timestamp.toISOString().substring(0, 13) + ':00:00';
          break;
        case 'day':
          key = outcome.timestamp.toISOString().substring(0, 10);
          break;
        case 'week':
          const weekStart = new Date(outcome.timestamp);
          weekStart.setDate(weekStart.getDate() - weekStart.getDay());
          key = weekStart.toISOString().substring(0, 10);
          break;
        case 'month':
          key = outcome.timestamp.toISOString().substring(0, 7);
          break;
        default:
          key = outcome.timestamp.toISOString().substring(0, 10);
      }

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(outcome);
    }

    return groups;
  },

  /**
   * Calculate percentile from array of numbers
   */
  calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;

    return sorted[Math.max(0, index)];
  },

  /**
   * Validate evaluation configuration
   */
  validateEvaluationConfig(config: EvaluationConfig): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check required paths
    if (!config.loggingBasePath) {
      errors.push('loggingBasePath is required');
    }

    if (!config.jobsLogFile) {
      errors.push('jobsLogFile is required');
    }

    // Check thresholds
    if (config.promotionThreshold < 0 || config.promotionThreshold > 1) {
      errors.push('promotionThreshold must be between 0 and 1');
    }

    if (config.demotionThreshold < 0 || config.demotionThreshold > 1) {
      errors.push('demotionThreshold must be between 0 and 1');
    }

    if (config.promotionThreshold <= config.demotionThreshold) {
      errors.push('promotionThreshold must be greater than demotionThreshold');
    }

    // Check intervals
    if (config.analysisInterval <= 0) {
      errors.push('analysisInterval must be positive');
    }

    if (config.patternAnalysisWindow <= 0) {
      errors.push('patternAnalysisWindow must be positive');
    }

    // Check performance thresholds
    const thresholds = config.performanceThresholds;
    if (thresholds.jobLoggingMs <= 0) {
      errors.push('jobLoggingMs threshold must be positive');
    }

    if (thresholds.patternAnalysisMs <= 0) {
      errors.push('patternAnalysisMs threshold must be positive');
    }

    if (thresholds.analyticsGenerationMs <= 0) {
      errors.push('analyticsGenerationMs threshold must be positive');
    }

    if (thresholds.qualityAssessmentMs <= 0) {
      errors.push('qualityAssessmentMs threshold must be positive');
    }

    // Check ML configuration
    if (config.mlConfig.enabled) {
      if (config.mlConfig.trainingDataSize <= 0) {
        errors.push('ML trainingDataSize must be positive when ML is enabled');
      }

      if (config.mlConfig.retrainInterval <= 0) {
        errors.push('ML retrainInterval must be positive when ML is enabled');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  },
};

// Constants
export const EVALUATION_CONSTANTS = {
  // Performance targets
  PERFORMANCE_TARGETS: {
    JOB_LOGGING_MS: 10,
    PATTERN_ANALYSIS_MS: 100,
    ANALYTICS_GENERATION_MS: 2000,
    QUALITY_ASSESSMENT_MS: 100,
  },

  // Quality thresholds
  QUALITY_THRESHOLDS: {
    MIN_SUCCESS_RATE: 0.7,
    MIN_QUALITY_SCORE: 0.7,
    MIN_TEST_COVERAGE: 0.8,
    MAX_SECURITY_VULNERABILITIES: 0,
  },

  // Default intervals
  DEFAULT_INTERVALS: {
    ANALYSIS_HOURS: 6,
    PATTERN_ANALYSIS_DAYS: 30,
    ML_RETRAIN_DAYS: 7,
    CLEANUP_DAYS: 90,
  },

  // Scoring weights
  SCORING_WEIGHTS: {
    CODE_QUALITY: 0.25,
    TEST_COVERAGE: 0.2,
    SECURITY: 0.2,
    PERFORMANCE: 0.15,
    MAINTAINABILITY: 0.1,
    DOCUMENTATION: 0.1,
  },

  // File extensions
  FILE_EXTENSIONS: {
    JOBS_LOG: '.ndjson',
    CONFIG: '.json',
    EXPORT_JSON: '.json',
    EXPORT_CSV: '.csv',
  },
} as const;

// Version information
export const EVALUATION_VERSION = {
  VERSION: '1.0.0',
  BUILD_DATE: new Date().toISOString(),
  FEATURES: [
    'Job Outcome Tracking with NDJSON logging',
    'ML-powered Pattern Analysis Engine',
    'Automated Knowledge Promotion System',
    'Learning Analytics with trend tracking',
    'System-wide Performance Monitoring',
    'Automated Quality Assessment',
    'GitHub Issues integration',
    'Real-time analytics with <5% false positives',
  ],
} as const;

// Export default evaluation manager instance factory
export default {
  async create(knowledgeManager: any, config?: Partial<EvaluationConfig>) {
    const defaultConfig = createDefaultEvaluationConfig();
    const finalConfig = { ...defaultConfig, ...config };

    return createEvaluationManager(finalConfig, knowledgeManager);
  },
};
