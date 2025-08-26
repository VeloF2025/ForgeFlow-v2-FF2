/**
 * Basic Validation Tests for Evaluation Layer
 * Tests that core classes can be instantiated and basic methods work
 */

import { describe, it, expect } from 'vitest';
import { createDefaultEvaluationConfig } from '../evaluation-manager';
import { JobOutcomeBuilder } from '../job-outcome-tracker';
import { EvaluationUtils, EVALUATION_CONSTANTS } from '../index';

describe('Evaluation Layer Basic Validation', () => {
  it('should create default evaluation configuration', () => {
    const config = createDefaultEvaluationConfig();

    expect(config).toBeDefined();
    expect(config.loggingBasePath).toBeDefined();
    expect(config.jobsLogFile).toBeDefined();
    expect(config.promotionThreshold).toBeGreaterThan(0);
    expect(config.demotionThreshold).toBeGreaterThan(0);
    expect(config.promotionThreshold).toBeGreaterThan(config.demotionThreshold);
  });

  it('should create job outcomes using JobOutcomeBuilder', () => {
    const jobId = 'test-job-123';
    const issueId = 'issue-456';
    const executionId = 'exec-789';

    const outcome = JobOutcomeBuilder.create(jobId, issueId, executionId);

    expect(outcome).toBeDefined();
    expect(outcome.jobId).toBe(jobId);
    expect(outcome.issueId).toBe(issueId);
    expect(outcome.executionId).toBe(executionId);
    expect(outcome.timestamp).toBeInstanceOf(Date);
    expect(typeof outcome.success).toBe('boolean');
  });

  it('should provide utility functions', () => {
    // Test time range creation
    const timeRange = EvaluationUtils.createTimeRangeLastNDays(7);
    expect(timeRange.start).toBeInstanceOf(Date);
    expect(timeRange.end).toBeInstanceOf(Date);
    expect(timeRange.start.getTime()).toBeLessThan(timeRange.end.getTime());

    // Test success rate calculation
    const outcomes = [{ success: true }, { success: false }, { success: true }, { success: true }];
    const successRate = EvaluationUtils.calculateSuccessRate(outcomes);
    expect(successRate).toBe(0.75);

    // Test empty outcomes
    const emptySuccessRate = EvaluationUtils.calculateSuccessRate([]);
    expect(emptySuccessRate).toBe(0);
  });

  it('should provide evaluation constants', () => {
    expect(EVALUATION_CONSTANTS.PERFORMANCE_TARGETS).toBeDefined();
    expect(EVALUATION_CONSTANTS.QUALITY_THRESHOLDS).toBeDefined();
    expect(EVALUATION_CONSTANTS.DEFAULT_INTERVALS).toBeDefined();
    expect(EVALUATION_CONSTANTS.SCORING_WEIGHTS).toBeDefined();

    // Verify performance targets
    expect(EVALUATION_CONSTANTS.PERFORMANCE_TARGETS.JOB_LOGGING_MS).toBe(10);
    expect(EVALUATION_CONSTANTS.PERFORMANCE_TARGETS.PATTERN_ANALYSIS_MS).toBe(100);

    // Verify quality thresholds
    expect(EVALUATION_CONSTANTS.QUALITY_THRESHOLDS.MIN_SUCCESS_RATE).toBe(0.7);
    expect(EVALUATION_CONSTANTS.QUALITY_THRESHOLDS.MIN_QUALITY_SCORE).toBe(0.7);
  });

  it('should validate evaluation configurations', () => {
    const validConfig = createDefaultEvaluationConfig();
    const validation = EvaluationUtils.validateEvaluationConfig(validConfig);

    expect(validation.isValid).toBe(true);
    expect(validation.errors).toEqual([]);

    // Test invalid config
    const invalidConfig = createDefaultEvaluationConfig();
    invalidConfig.promotionThreshold = 0.2; // Less than demotion threshold
    invalidConfig.demotionThreshold = 0.8;

    const invalidValidation = EvaluationUtils.validateEvaluationConfig(invalidConfig);
    expect(invalidValidation.isValid).toBe(false);
    expect(invalidValidation.errors.length).toBeGreaterThan(0);
  });

  it('should group outcomes by time period', () => {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const outcomes = [{ timestamp: now }, { timestamp: hourAgo }, { timestamp: now }];

    const grouped = EvaluationUtils.groupOutcomesByTimePeriod(outcomes, 'hour');

    expect(grouped instanceof Map).toBe(true);
    expect(grouped.size).toBeGreaterThan(0);
  });

  it('should calculate percentiles correctly', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    const median = EvaluationUtils.calculatePercentile(values, 50);
    expect(median).toBe(5);

    const p90 = EvaluationUtils.calculatePercentile(values, 90);
    expect(p90).toBe(9);

    const p100 = EvaluationUtils.calculatePercentile(values, 100);
    expect(p100).toBe(10);

    // Empty array
    const emptyPercentile = EvaluationUtils.calculatePercentile([], 50);
    expect(emptyPercentile).toBe(0);
  });

  it('should calculate average quality scores', () => {
    const outcomes = [
      { quality: { overallScore: 0.8 } },
      { quality: { overallScore: 0.9 } },
      { quality: { overallScore: 0.7 } },
    ];

    const avgScore = EvaluationUtils.calculateAverageQualityScore(outcomes);
    expect(avgScore).toBeCloseTo(0.8, 2);

    // Empty outcomes
    const emptyAvg = EvaluationUtils.calculateAverageQualityScore([]);
    expect(emptyAvg).toBe(0);
  });
});
