// Pattern Analysis Engine - ML-powered success/failure pattern recognition
// Real-time processing with <100ms latency target

import type {
  JobOutcome,
  PatternAnalysisEngine,
  PatternAnalysisResult,
  SuccessPattern,
  FailurePattern,
  SuccessPrediction,
  JobContext,
  JobMetadata,
  EvaluationConfig,
} from './types';
import { TimeRange } from './types';
import { enhancedLogger } from '../utils/enhanced-logger';
import { promises as fs } from 'fs';
import { join } from 'path';

export class MLPatternAnalysisEngine implements PatternAnalysisEngine {
  private config: EvaluationConfig;
  private successPatterns: Map<string, SuccessPattern> = new Map();
  private failurePatterns: Map<string, FailurePattern> = new Map();
  private featureWeights: Map<string, number> = new Map();
  private performanceTracker = {
    analysisCount: 0,
    totalAnalysisTime: 0,
    avgAnalysisTime: 0,
    patternUpdates: 0,
    lastUpdate: new Date(),
  };

  constructor(config: EvaluationConfig) {
    this.config = config;
    this.initializeEngine();
  }

  /**
   * Initialize the pattern analysis engine
   */
  private async initializeEngine(): Promise<void> {
    try {
      // Load existing patterns from storage
      await this.loadPatterns();

      // Initialize feature weights with default values
      this.initializeFeatureWeights();

      enhancedLogger.info('Pattern analysis engine initialized', {
        successPatterns: this.successPatterns.size,
        failurePatterns: this.failurePatterns.size,
        mlEnabled: this.config.mlConfig.enabled,
      });
    } catch (error) {
      enhancedLogger.error('Failed to initialize pattern analysis engine', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Analyze job outcome and identify patterns
   */
  async analyzeJobOutcome(job: JobOutcome): Promise<PatternAnalysisResult> {
    const startTime = performance.now();

    try {
      // Extract features from job outcome
      const features = this.extractFeatures(job);

      // Match against existing patterns
      const matchedPatterns = await this.matchPatterns(job, features);

      // Generate recommendations based on patterns
      const recommendations = this.generateRecommendations(job, matchedPatterns);

      // Identify learning opportunities
      const learningOpportunities = this.identifyLearningOpportunities(job, features);

      // Create analysis result
      const result: PatternAnalysisResult = {
        jobId: job.jobId,
        analysisTimestamp: new Date(),
        confidence: this.calculateOverallConfidence(matchedPatterns),
        matchedPatterns,
        recommendations,
        learningOpportunities,
      };

      // Update performance metrics
      const duration = performance.now() - startTime;
      this.updateAnalysisMetrics(duration);

      // Check performance threshold
      if (duration > this.config.performanceThresholds.patternAnalysisMs) {
        enhancedLogger.warn('Pattern analysis exceeded performance threshold', {
          duration,
          threshold: this.config.performanceThresholds.patternAnalysisMs,
          jobId: job.jobId,
        });
      }

      enhancedLogger.debug('Job outcome analyzed', {
        jobId: job.jobId,
        duration,
        patternsMatched: matchedPatterns.length,
        confidence: result.confidence,
      });

      return result;
    } catch (error) {
      enhancedLogger.error('Failed to analyze job outcome', undefined, {
        jobId: job.jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Extract features from job outcome for ML analysis
   */
  private extractFeatures(job: JobOutcome): Record<string, number> {
    const features: Record<string, number> = {};

    // Metadata features
    features.complexity = this.encodeComplexity(job.metadata.complexity);
    features.priority = this.encodePriority(job.metadata.priority);
    features.category = this.encodeCategory(job.metadata.category);
    features.agentCount = job.metadata.agentTypes.length;
    features.duration = job.metadata.duration || 0;

    // Code change features
    const codeChanges = job.metrics.codeChanges;
    features.linesAdded = codeChanges.linesAdded;
    features.linesRemoved = codeChanges.linesRemoved;
    features.filesModified = codeChanges.filesModified;
    features.codeComplexity = codeChanges.complexity;

    // Quality features
    const quality = job.quality;
    features.overallQuality = quality.overallScore;
    features.codeQuality = quality.components.codeQuality;
    features.testCoverage = quality.components.testQuality;
    features.maintainability = quality.components.maintainability;
    features.security = quality.components.security;
    features.performance = quality.components.performance;

    // Quality gates features
    features.gatesPassed = quality.gatesPassed;
    features.gatesTotal = quality.gatesTotal;
    features.gatesRatio = quality.gatesTotal > 0 ? quality.gatesPassed / quality.gatesTotal : 0;

    // Learning features
    const learning = job.learning;
    features.learningGenerated = learning.learningGenerated;
    features.knowledgeReused = learning.knowledgeReused;
    features.adaptability = learning.adaptabilityShown;

    // Context features
    features.knowledgeCardsUsed = job.context.knowledgeCards.length;
    features.avgCardEffectiveness =
      job.context.knowledgeCards.length > 0
        ? job.context.knowledgeCards.reduce((sum, card) => sum + card.effectiveness, 0) /
          job.context.knowledgeCards.length
        : 0;

    // Resource usage features
    const resources = job.metrics.resources;
    features.memoryUsage = resources.memoryUsage;
    features.cpuUsage = resources.cpuUsage;
    features.networkRequests = resources.networkRequests;

    return features;
  }

  /**
   * Encode categorical values to numerical for ML processing
   */
  private encodeComplexity(complexity: string): number {
    const mapping = { low: 1, medium: 2, high: 3, 'very-high': 4 };
    return mapping[complexity as keyof typeof mapping] || 2;
  }

  private encodePriority(priority: string): number {
    const mapping = { low: 1, medium: 2, high: 3, critical: 4 };
    return mapping[priority as keyof typeof mapping] || 2;
  }

  private encodeCategory(category: string): number {
    const mapping = {
      feature: 1,
      bugfix: 2,
      refactor: 3,
      test: 4,
      deploy: 5,
      maintenance: 6,
    };
    return mapping[category as keyof typeof mapping] || 1;
  }

  /**
   * Match job against existing patterns
   */
  private async matchPatterns(
    job: JobOutcome,
    features: Record<string, number>,
  ): Promise<PatternAnalysisResult['matchedPatterns']> {
    const matches: PatternAnalysisResult['matchedPatterns'] = [];

    // Match against success patterns
    for (const [patternId, pattern] of this.successPatterns) {
      const relevance = this.calculatePatternRelevance(pattern.conditions, features, job);

      if (relevance > 0.3) {
        // Minimum relevance threshold
        matches.push({
          patternId,
          type: 'success',
          confidence: pattern.confidence,
          relevance,
          evidence: this.generatePatternEvidence(pattern.conditions, features, job),
        });
      }
    }

    // Match against failure patterns
    for (const [patternId, pattern] of this.failurePatterns) {
      const relevance = this.calculatePatternRelevance(pattern.triggers, features, job);

      if (relevance > 0.3) {
        // Minimum relevance threshold
        matches.push({
          patternId,
          type: 'failure',
          confidence: pattern.confidence,
          relevance,
          evidence: this.generatePatternEvidence(pattern.triggers, features, job),
        });
      }
    }

    // Sort by relevance * confidence
    return matches.sort((a, b) => b.relevance * b.confidence - a.relevance * a.confidence);
  }

  /**
   * Calculate pattern relevance based on conditions/triggers
   */
  private calculatePatternRelevance(
    conditions: Array<{ field: string; operator: string; value: any; importance?: number }>,
    features: Record<string, number>,
    job: JobOutcome,
  ): number {
    let totalRelevance = 0;
    let totalImportance = 0;

    for (const condition of conditions) {
      const importance = condition.importance || 0.5;
      totalImportance += importance;

      const featureValue = this.getFeatureValue(condition.field, features, job);
      const conditionMet = this.evaluateCondition(
        featureValue,
        condition.operator,
        condition.value,
      );

      if (conditionMet) {
        totalRelevance += importance;
      }
    }

    return totalImportance > 0 ? totalRelevance / totalImportance : 0;
  }

  /**
   * Get feature value from various sources
   */
  private getFeatureValue(field: string, features: Record<string, number>, job: JobOutcome): any {
    // Try features first
    if (field in features) {
      return features[field];
    }

    // Try nested job properties
    const fieldParts = field.split('.');
    let value: any = job;

    for (const part of fieldParts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return null;
      }
    }

    return value;
  }

  /**
   * Evaluate condition based on operator
   */
  private evaluateCondition(value: any, operator: string, expectedValue: any): boolean {
    switch (operator) {
      case 'eq':
        return value === expectedValue;
      case 'gt':
        return Number(value) > Number(expectedValue);
      case 'lt':
        return Number(value) < Number(expectedValue);
      case 'contains':
        return String(value).includes(String(expectedValue));
      case 'matches':
        try {
          const regex = new RegExp(String(expectedValue));
          return regex.test(String(value));
        } catch {
          return false;
        }
      default:
        return false;
    }
  }

  /**
   * Generate evidence for pattern match
   */
  private generatePatternEvidence(
    conditions: Array<{ field: string; operator: string; value: any }>,
    features: Record<string, number>,
    job: JobOutcome,
  ): string[] {
    const evidence: string[] = [];

    for (const condition of conditions) {
      const featureValue = this.getFeatureValue(condition.field, features, job);
      const conditionMet = this.evaluateCondition(
        featureValue,
        condition.operator,
        condition.value,
      );

      if (conditionMet) {
        evidence.push(
          `${condition.field} ${condition.operator} ${condition.value} (actual: ${featureValue})`,
        );
      }
    }

    return evidence;
  }

  /**
   * Generate recommendations based on matched patterns
   */
  private generateRecommendations(
    job: JobOutcome,
    matchedPatterns: PatternAnalysisResult['matchedPatterns'],
  ): PatternAnalysisResult['recommendations'] {
    const recommendations: PatternAnalysisResult['recommendations'] = [];

    // Process success patterns for optimization recommendations
    const successPatterns = matchedPatterns.filter((p) => p.type === 'success');
    for (const match of successPatterns) {
      const pattern = this.successPatterns.get(match.patternId);
      if (pattern && match.relevance > 0.7) {
        recommendations.push({
          type: 'optimization',
          description: `Leverage success pattern: ${pattern.description}`,
          priority: 'medium',
          impact: match.relevance * match.confidence,
        });
      }
    }

    // Process failure patterns for prevention recommendations
    const failurePatterns = matchedPatterns.filter((p) => p.type === 'failure');
    for (const match of failurePatterns) {
      const pattern = this.failurePatterns.get(match.patternId);
      if (pattern && match.relevance > 0.5) {
        pattern.preventionStrategies.forEach((strategy) => {
          recommendations.push({
            type: 'prevention',
            description: `Prevent failure: ${strategy.strategy}`,
            priority: strategy.effectiveness > 0.7 ? 'high' : 'medium',
            impact: match.relevance * match.confidence * strategy.effectiveness,
          });
        });
      }
    }

    // Generate learning recommendations based on job characteristics
    if (job.learning.learningGenerated < 0.3) {
      recommendations.push({
        type: 'learning',
        description: 'Increase knowledge capture and documentation',
        priority: 'low',
        impact: 0.4,
      });
    }

    // Sort by priority and impact
    return recommendations.sort((a, b) => {
      const priorityWeight = { high: 3, medium: 2, low: 1 };
      const priorityDiff = priorityWeight[b.priority] - priorityWeight[a.priority];
      return priorityDiff !== 0 ? priorityDiff : b.impact - a.impact;
    });
  }

  /**
   * Identify learning opportunities from job outcome
   */
  private identifyLearningOpportunities(
    job: JobOutcome,
    features: Record<string, number>,
  ): PatternAnalysisResult['learningOpportunities'] {
    const opportunities: PatternAnalysisResult['learningOpportunities'] = [];

    // Check for novel patterns (high uniqueness)
    const uniqueness = this.calculateJobUniqueness(features);
    if (uniqueness > 0.7) {
      opportunities.push({
        category: 'novel_pattern',
        description: 'This job shows unique characteristics that could form a new pattern',
        value: uniqueness,
      });
    }

    // Check for knowledge gaps
    if (job.context.knowledgeCards.length === 0 && job.learning.knowledgeReused < 0.2) {
      opportunities.push({
        category: 'knowledge_gap',
        description: 'Low knowledge reuse suggests potential knowledge gaps',
        value: 0.8,
      });
    }

    // Check for improvement opportunities
    if (job.success && job.quality.overallScore > 0.8) {
      opportunities.push({
        category: 'best_practice',
        description: 'High-quality successful job could become a best practice pattern',
        value: job.quality.overallScore,
      });
    }

    // Check for failure learning
    if (!job.success && job.quality.issues.length > 0) {
      opportunities.push({
        category: 'failure_pattern',
        description: 'Failed job provides learning opportunity for failure prevention',
        value: 0.7,
      });
    }

    return opportunities.sort((a, b) => b.value - a.value);
  }

  /**
   * Calculate overall confidence from matched patterns
   */
  private calculateOverallConfidence(
    matchedPatterns: PatternAnalysisResult['matchedPatterns'],
  ): number {
    if (matchedPatterns.length === 0) {
      return 0;
    }

    const weightedConfidence = matchedPatterns.reduce(
      (sum, pattern) => sum + pattern.confidence * pattern.relevance,
      0,
    );
    const totalWeight = matchedPatterns.reduce((sum, pattern) => sum + pattern.relevance, 0);

    return totalWeight > 0 ? weightedConfidence / totalWeight : 0;
  }

  /**
   * Calculate job uniqueness for learning opportunity detection
   */
  private calculateJobUniqueness(features: Record<string, number>): number {
    // Compare against historical feature distributions
    let uniquenessScore = 0;
    let featureCount = 0;

    for (const [feature, value] of Object.entries(features)) {
      const weight = this.featureWeights.get(feature) || 0.5;

      // Simple uniqueness calculation based on deviation from typical values
      // In a full ML implementation, this would use statistical distributions
      const typicalValue = this.getTypicalFeatureValue(feature);
      const deviation = Math.abs(value - typicalValue) / Math.max(typicalValue, 1);

      uniquenessScore += deviation * weight;
      featureCount += weight;
    }

    return featureCount > 0 ? Math.min(uniquenessScore / featureCount, 1) : 0;
  }

  /**
   * Get typical value for a feature (simplified implementation)
   */
  private getTypicalFeatureValue(feature: string): number {
    // In a full implementation, this would be based on historical data
    const typicalValues: Record<string, number> = {
      complexity: 2,
      priority: 2,
      category: 1,
      agentCount: 2,
      duration: 300000, // 5 minutes
      overallQuality: 0.7,
      gatesRatio: 0.8,
      learningGenerated: 0.5,
      knowledgeReused: 0.6,
    };

    return typicalValues[feature] || 0.5;
  }

  /**
   * Identify success patterns from job outcomes
   */
  async identifySuccessPatterns(jobs: JobOutcome[]): Promise<SuccessPattern[]> {
    try {
      const successfulJobs = jobs.filter((job) => job.success);

      if (successfulJobs.length < 5) {
        enhancedLogger.warn('Insufficient successful jobs for pattern identification', {
          successfulJobs: successfulJobs.length,
          totalJobs: jobs.length,
        });
        return [];
      }

      const patterns = await this.mineSuccessPatterns(successfulJobs);

      // Update stored patterns
      for (const pattern of patterns) {
        this.successPatterns.set(pattern.id, pattern);
      }

      await this.savePatterns();

      enhancedLogger.info('Success patterns identified', {
        patternCount: patterns.length,
        jobsAnalyzed: successfulJobs.length,
      });

      return patterns;
    } catch (error) {
      enhancedLogger.error('Failed to identify success patterns', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Mine success patterns using simplified pattern mining
   */
  private async mineSuccessPatterns(jobs: JobOutcome[]): Promise<SuccessPattern[]> {
    const patterns: SuccessPattern[] = [];

    // Group jobs by similar characteristics
    const groups = this.groupJobsByCharacteristics(jobs);

    for (const [groupKey, groupJobs] of groups) {
      if (groupJobs.length < 3) continue; // Minimum group size

      // Calculate pattern characteristics
      const avgQuality =
        groupJobs.reduce((sum, job) => sum + job.quality.overallScore, 0) / groupJobs.length;
      const avgDuration =
        groupJobs.reduce((sum, job) => sum + (job.metadata.duration || 0), 0) / groupJobs.length;
      const successRate = groupJobs.filter((job) => job.success).length / groupJobs.length;

      if (successRate > 0.8 && avgQuality > 0.7) {
        // High success pattern
        const pattern: SuccessPattern = {
          id: `success_${groupKey}_${Date.now()}`,
          name: `High Success Pattern: ${groupKey}`,
          description: `Pattern identified for ${groupKey} with ${(successRate * 100).toFixed(1)}% success rate`,
          confidence: Math.min(successRate * avgQuality, 1),
          occurrences: groupJobs.length,

          conditions: this.extractPatternConditions(groupJobs, 'success'),

          indicators: {
            avgSuccessRate: successRate,
            avgDuration,
            avgQualityScore: avgQuality,
            commonFactors: this.extractCommonFactors(groupJobs),
          },

          applicableContexts: {
            agentTypes: [...new Set(groupJobs.flatMap((job) => job.metadata.agentTypes))],
            complexities: [...new Set(groupJobs.map((job) => job.metadata.complexity))],
            categories: [...new Set(groupJobs.map((job) => job.metadata.category))],
            patterns: [...new Set(groupJobs.map((job) => job.metadata.pattern))],
          },

          learningData: {
            createdAt: new Date(),
            lastUpdated: new Date(),
            trainingJobs: groupJobs.length,
            effectiveness: successRate * avgQuality,
          },
        };

        patterns.push(pattern);
      }
    }

    return patterns;
  }

  /**
   * Identify failure patterns from job outcomes
   */
  async identifyFailurePatterns(jobs: JobOutcome[]): Promise<FailurePattern[]> {
    try {
      const failedJobs = jobs.filter((job) => !job.success);

      if (failedJobs.length < 3) {
        enhancedLogger.warn('Insufficient failed jobs for pattern identification', {
          failedJobs: failedJobs.length,
          totalJobs: jobs.length,
        });
        return [];
      }

      const patterns = await this.mineFailurePatterns(failedJobs);

      // Update stored patterns
      for (const pattern of patterns) {
        this.failurePatterns.set(pattern.id, pattern);
      }

      await this.savePatterns();

      enhancedLogger.info('Failure patterns identified', {
        patternCount: patterns.length,
        jobsAnalyzed: failedJobs.length,
      });

      return patterns;
    } catch (error) {
      enhancedLogger.error('Failed to identify failure patterns', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Mine failure patterns using pattern mining techniques
   */
  private async mineFailurePatterns(jobs: JobOutcome[]): Promise<FailurePattern[]> {
    const patterns: FailurePattern[] = [];

    // Group jobs by similar failure characteristics
    const groups = this.groupJobsByCharacteristics(jobs);

    for (const [groupKey, groupJobs] of groups) {
      if (groupJobs.length < 2) continue; // Minimum group size for failures

      const failureRate = groupJobs.filter((job) => !job.success).length / groupJobs.length;
      const avgQuality =
        groupJobs.reduce((sum, job) => sum + job.quality.overallScore, 0) / groupJobs.length;

      if (failureRate > 0.6 && avgQuality < 0.5) {
        // High failure pattern
        const pattern: FailurePattern = {
          id: `failure_${groupKey}_${Date.now()}`,
          name: `High Failure Pattern: ${groupKey}`,
          description: `Pattern identified for ${groupKey} with ${(failureRate * 100).toFixed(1)}% failure rate`,
          confidence: failureRate,
          occurrences: groupJobs.length,

          triggers: this.extractFailureTriggers(groupJobs),

          characteristics: {
            avgFailureRate: failureRate,
            avgRecoveryTime: this.calculateAvgRecoveryTime(groupJobs),
            commonErrors: this.extractCommonErrors(groupJobs),
            impactAreas: this.extractImpactAreas(groupJobs),
          },

          preventionStrategies: this.generatePreventionStrategies(groupJobs),

          learningData: {
            createdAt: new Date(),
            lastUpdated: new Date(),
            trainingJobs: groupJobs.length,
            preventionSuccess: 0, // Will be updated as prevention strategies are used
          },
        };

        patterns.push(pattern);
      }
    }

    return patterns;
  }

  /**
   * Group jobs by similar characteristics
   */
  private groupJobsByCharacteristics(jobs: JobOutcome[]): Map<string, JobOutcome[]> {
    const groups = new Map<string, JobOutcome[]>();

    for (const job of jobs) {
      // Create grouping key based on key characteristics
      const groupKey = [
        job.metadata.category,
        job.metadata.complexity,
        job.metadata.agentTypes.slice(0, 2).sort().join('-'), // First 2 agent types
        Math.floor(job.quality.overallScore * 10) / 10, // Quality score rounded to 1 decimal
      ].join('|');

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey).push(job);
    }

    return groups;
  }

  /**
   * Extract pattern conditions from job group
   */
  private extractPatternConditions(
    jobs: JobOutcome[],
    type: 'success' | 'failure',
  ): Array<{
    type: 'metric' | 'context' | 'agent' | 'timing' | 'environment';
    field: string;
    operator: 'eq' | 'gt' | 'lt' | 'contains' | 'matches';
    value: any;
    importance: number;
  }> {
    const conditions: Array<{
      type: 'metric' | 'context' | 'agent' | 'timing' | 'environment';
      field: string;
      operator: 'eq' | 'gt' | 'lt' | 'contains' | 'matches';
      value: any;
      importance: number;
    }> = [];

    // Common category
    const categories = jobs.map((job) => job.metadata.category);
    const mostCommonCategory = this.getMostCommon(categories);
    if (categories.filter((c) => c === mostCommonCategory).length / categories.length > 0.7) {
      conditions.push({
        type: 'context' as const,
        field: 'metadata.category',
        operator: 'eq' as const,
        value: mostCommonCategory,
        importance: 0.8,
      });
    }

    // Quality score range
    const qualityScores = jobs.map((job) => job.quality.overallScore);
    const avgQuality = qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length;
    const qualityThreshold =
      type === 'success' ? Math.max(0.7, avgQuality - 0.1) : Math.min(0.5, avgQuality + 0.1);

    conditions.push({
      type: 'metric' as const,
      field: 'quality.overallScore',
      operator: type === 'success' ? 'gt' : 'lt',
      value: qualityThreshold,
      importance: 0.9,
    });

    // Complexity
    const complexities = jobs.map((job) => job.metadata.complexity);
    const mostCommonComplexity = this.getMostCommon(complexities);
    if (complexities.filter((c) => c === mostCommonComplexity).length / complexities.length > 0.6) {
      conditions.push({
        type: 'context' as const,
        field: 'metadata.complexity',
        operator: 'eq' as const,
        value: mostCommonComplexity,
        importance: 0.7,
      });
    }

    return conditions;
  }

  /**
   * Extract failure triggers with riskLevel instead of importance
   */
  private extractFailureTriggers(jobs: JobOutcome[]): Array<{
    type: 'metric' | 'context' | 'agent' | 'timing' | 'environment';
    field: string;
    operator: 'eq' | 'gt' | 'lt' | 'contains' | 'matches';
    value: any;
    riskLevel: number;
  }> {
    const triggers: Array<{
      type: 'metric' | 'context' | 'agent' | 'timing' | 'environment';
      field: string;
      operator: 'eq' | 'gt' | 'lt' | 'contains' | 'matches';
      value: any;
      riskLevel: number;
    }> = [];

    // Common category
    const categories = jobs.map((job) => job.metadata.category);
    const mostCommonCategory = this.getMostCommon(categories);
    if (categories.filter((c) => c === mostCommonCategory).length / categories.length > 0.7) {
      triggers.push({
        type: 'context' as const,
        field: 'metadata.category',
        operator: 'eq' as const,
        value: mostCommonCategory,
        riskLevel: 0.8,
      });
    }

    // Quality score range
    const qualityScores = jobs.map((job) => job.quality.overallScore);
    const avgQuality = qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length;
    const qualityThreshold = Math.min(0.5, avgQuality + 0.1);

    triggers.push({
      type: 'metric' as const,
      field: 'quality.overallScore',
      operator: 'lt' as const,
      value: qualityThreshold,
      riskLevel: 0.9,
    });

    // Complexity
    const complexities = jobs.map((job) => job.metadata.complexity);
    const mostCommonComplexity = this.getMostCommon(complexities);
    if (complexities.filter((c) => c === mostCommonComplexity).length / complexities.length > 0.6) {
      triggers.push({
        type: 'context' as const,
        field: 'metadata.complexity',
        operator: 'eq' as const,
        value: mostCommonComplexity,
        riskLevel: 0.7,
      });
    }

    return triggers;
  }

  /**
   * Extract common factors from job group
   */
  private extractCommonFactors(jobs: JobOutcome[]): string[] {
    const factors: string[] = [];

    // High code quality
    const avgCodeQuality =
      jobs.reduce((sum, job) => sum + job.quality.components.codeQuality, 0) / jobs.length;
    if (avgCodeQuality > 0.8) {
      factors.push('High code quality');
    }

    // Good test coverage
    const avgTestQuality =
      jobs.reduce((sum, job) => sum + job.quality.components.testQuality, 0) / jobs.length;
    if (avgTestQuality > 0.8) {
      factors.push('Good test coverage');
    }

    // Knowledge reuse
    const avgKnowledgeReuse =
      jobs.reduce((sum, job) => sum + job.learning.knowledgeReused, 0) / jobs.length;
    if (avgKnowledgeReuse > 0.7) {
      factors.push('Effective knowledge reuse');
    }

    // Quality gates compliance
    const avgGatesRatio =
      jobs.reduce((sum, job) => {
        return (
          sum + (job.quality.gatesTotal > 0 ? job.quality.gatesPassed / job.quality.gatesTotal : 0)
        );
      }, 0) / jobs.length;
    if (avgGatesRatio > 0.9) {
      factors.push('High quality gates compliance');
    }

    return factors;
  }

  /**
   * Extract common errors from failed jobs
   */
  private extractCommonErrors(jobs: JobOutcome[]): string[] {
    const errorCounts = new Map<string, number>();

    jobs.forEach((job) => {
      job.quality.issues.forEach((issue) => {
        if (issue.type === 'error') {
          const error = issue.description;
          errorCounts.set(error, (errorCounts.get(error) || 0) + 1);
        }
      });
    });

    // Return errors that occur in more than 30% of jobs
    const threshold = Math.max(1, jobs.length * 0.3);
    return Array.from(errorCounts.entries())
      .filter(([_, count]) => count >= threshold)
      .sort(([_, a], [__, b]) => b - a)
      .map(([error, _]) => error)
      .slice(0, 5); // Top 5 common errors
  }

  /**
   * Extract impact areas from failed jobs
   */
  private extractImpactAreas(jobs: JobOutcome[]): string[] {
    const impacts = new Set<string>();

    jobs.forEach((job) => {
      if (job.quality.components.codeQuality < 0.5) impacts.add('Code Quality');
      if (job.quality.components.testQuality < 0.5) impacts.add('Test Coverage');
      if (job.quality.components.security < 0.5) impacts.add('Security');
      if (job.quality.components.performance < 0.5) impacts.add('Performance');
      if (job.quality.components.maintainability < 0.5) impacts.add('Maintainability');
    });

    return Array.from(impacts);
  }

  /**
   * Generate prevention strategies for failure patterns
   */
  private generatePreventionStrategies(jobs: JobOutcome[]): Array<{
    strategy: string;
    effectiveness: number;
    implementationCost: 'low' | 'medium' | 'high';
    description: string;
  }> {
    const strategies: Array<{
      strategy: string;
      effectiveness: number;
      implementationCost: 'low' | 'medium' | 'high';
      description: string;
    }> = [];

    // Analyze common failure points
    const avgCodeQuality =
      jobs.reduce((sum, job) => sum + job.quality.components.codeQuality, 0) / jobs.length;
    if (avgCodeQuality < 0.5) {
      strategies.push({
        strategy: 'Enhanced Code Review',
        effectiveness: 0.8,
        implementationCost: 'medium',
        description: 'Implement stricter code review process with quality gates',
      });
    }

    const avgTestQuality =
      jobs.reduce((sum, job) => sum + job.quality.components.testQuality, 0) / jobs.length;
    if (avgTestQuality < 0.5) {
      strategies.push({
        strategy: 'Test Coverage Requirements',
        effectiveness: 0.7,
        implementationCost: 'low',
        description: 'Enforce minimum test coverage thresholds',
      });
    }

    const avgLearningReuse =
      jobs.reduce((sum, job) => sum + job.learning.knowledgeReused, 0) / jobs.length;
    if (avgLearningReuse < 0.3) {
      strategies.push({
        strategy: 'Knowledge Base Enhancement',
        effectiveness: 0.6,
        implementationCost: 'medium',
        description: 'Improve knowledge management and reuse patterns',
      });
    }

    return strategies;
  }

  /**
   * Calculate average recovery time for failed jobs
   */
  private calculateAvgRecoveryTime(jobs: JobOutcome[]): number {
    const recoveryTimes = jobs
      .map((job) => job.learning.efficiency.errorRecoveryTime)
      .filter((time) => time > 0);

    return recoveryTimes.length > 0
      ? recoveryTimes.reduce((sum, time) => sum + time, 0) / recoveryTimes.length
      : 0;
  }

  /**
   * Predict job success based on context and metadata
   */
  async predictJobSuccess(context: JobContext, metadata: JobMetadata): Promise<SuccessPrediction> {
    try {
      // Create pseudo job for feature extraction
      const pseudoJob = this.createPseudoJob(context, metadata);
      const features = this.extractFeatures(pseudoJob);

      // Calculate success probability based on patterns
      const successProbability = this.calculateSuccessProbability(features, context, metadata);

      // Calculate prediction confidence
      const confidence = this.calculatePredictionConfidence(features, successProbability);

      // Identify risk factors
      const riskFactors = this.identifyRiskFactors(features, context, metadata);

      // Identify success factors
      const successFactors = this.identifySuccessFactors(features, context, metadata);

      // Estimate metrics
      const estimatedMetrics = this.estimateJobMetrics(features, successProbability);

      // Generate recommendations
      const recommendations = this.generatePredictionRecommendations(
        features,
        successProbability,
        riskFactors,
      );

      const prediction: SuccessPrediction = {
        timestamp: new Date(),
        successProbability,
        confidence,
        riskFactors,
        successFactors,
        estimatedMetrics,
        recommendations,
      };

      enhancedLogger.debug('Job success predicted', {
        successProbability,
        confidence,
        riskCount: riskFactors.length,
        successFactorCount: successFactors.length,
      });

      return prediction;
    } catch (error) {
      enhancedLogger.error('Failed to predict job success', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Create pseudo job for prediction
   */
  private createPseudoJob(context: JobContext, metadata: JobMetadata): JobOutcome {
    // Create minimal job outcome for feature extraction
    return {
      jobId: 'prediction',
      issueId: 'prediction',
      executionId: 'prediction',
      timestamp: new Date(),
      success: true, // Assumption for prediction
      status: 'completed',
      metadata,
      context,
      // Default values for other fields
      metrics: {
        performance: {
          totalDuration: 0,
          agentDurations: {},
          queueTime: 0,
          executionTime: 0,
          overhead: 0,
        },
        codeChanges: {
          linesAdded: 0,
          linesRemoved: 0,
          linesModified: 0,
          filesAdded: 0,
          filesRemoved: 0,
          filesModified: 0,
          complexity: 0,
        },
        qualityGates: {
          linting: { passed: true, errors: 0, warnings: 0 },
          typecheck: { passed: true, errors: 0 },
          testing: { passed: true, coverage: 0, failedTests: 0 },
          security: { passed: true, vulnerabilities: 0, severity: 'none' },
          performance: { passed: true, score: 0 },
        },
        resources: { memoryUsage: 0, cpuUsage: 0, diskUsage: 0, networkRequests: 0 },
      },
      patterns: {
        successPatterns: [],
        failurePatterns: [],
        decisionPatterns: [],
        antiPatterns: [],
      },
      quality: {
        overallScore: 0.5,
        components: {
          codeQuality: 0.5,
          testQuality: 0.5,
          documentation: 0.5,
          maintainability: 0.5,
          security: 0.5,
          performance: 0.5,
        },
        gatesPassed: 0,
        gatesTotal: 0,
        gatesSkipped: 0,
        issues: [],
        improvements: [],
      },
      learning: {
        learningGenerated: 0.5,
        knowledgeReused: 0.5,
        adaptabilityShown: 0.5,
        knowledgeImpact: {
          cardsCreated: 0,
          cardsUpdated: 0,
          gotchasResolved: 0,
          patternsIdentified: 0,
        },
        efficiency: {
          timeToFirstSolution: 0,
          iterationsToSuccess: 0,
          errorRecoveryTime: 0,
          knowledgeRetrievalTime: 0,
        },
        predictions: {
          futureSuccessLikelihood: 0,
          estimatedComplexity: 0,
          recommendedApproach: '',
          riskFactors: [],
        },
      },
    };
  }

  /**
   * Calculate success probability using pattern matching
   */
  private calculateSuccessProbability(
    features: Record<string, number>,
    context: JobContext,
    metadata: JobMetadata,
  ): number {
    let probabilitySum = 0;
    let weightSum = 0;

    // Check against success patterns
    for (const [_, pattern] of this.successPatterns) {
      const pseudoJob = this.createPseudoJob(context, metadata);
      const relevance = this.calculatePatternRelevance(pattern.conditions, features, pseudoJob);

      if (relevance > 0.3) {
        const weight = pattern.confidence * pattern.learningData.effectiveness;
        probabilitySum += pattern.indicators.avgSuccessRate * weight;
        weightSum += weight;
      }
    }

    // Check against failure patterns (inverse probability)
    for (const [_, pattern] of this.failurePatterns) {
      const pseudoJob = this.createPseudoJob(context, metadata);
      const relevance = this.calculatePatternRelevance(pattern.triggers, features, pseudoJob);

      if (relevance > 0.3) {
        const weight = pattern.confidence;
        probabilitySum += (1 - pattern.characteristics.avgFailureRate) * weight;
        weightSum += weight;
      }
    }

    // Default probability if no patterns match
    const baseProbability = 0.7; // Default success rate

    return weightSum > 0 ? probabilitySum / weightSum : baseProbability;
  }

  /**
   * Calculate prediction confidence
   */
  private calculatePredictionConfidence(
    features: Record<string, number>,
    successProbability: number,
  ): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence if we have more patterns
    const patternCount = this.successPatterns.size + this.failurePatterns.size;
    confidence += Math.min(patternCount * 0.05, 0.3);

    // Adjust based on feature completeness
    const featureCompleteness =
      Object.values(features).filter((v) => v > 0).length / Object.keys(features).length;
    confidence *= featureCompleteness;

    // Adjust based on probability certainty
    const probabilityCertainty = Math.abs(successProbability - 0.5) * 2; // Distance from 0.5
    confidence += probabilityCertainty * 0.2;

    return Math.min(confidence, 0.95); // Cap at 95%
  }

  /**
   * Identify risk factors for the prediction
   */
  private identifyRiskFactors(
    features: Record<string, number>,
    context: JobContext,
    metadata: JobMetadata,
  ): SuccessPrediction['riskFactors'] {
    const risks: SuccessPrediction['riskFactors'] = [];

    // High complexity risk
    if (features.complexity >= 3) {
      risks.push({
        factor: 'High complexity job',
        impact: (features.complexity - 2) / 2, // Scale from 0.5 to 1
        mitigation: 'Break down into smaller tasks, increase testing, add code review',
      });
    }

    // Low knowledge availability
    if (features.knowledgeCardsUsed === 0) {
      risks.push({
        factor: 'No relevant knowledge cards available',
        impact: 0.6,
        mitigation: 'Research similar solutions, create new knowledge cards',
      });
    }

    // Low average card effectiveness
    if (features.avgCardEffectiveness < 0.5) {
      risks.push({
        factor: 'Available knowledge cards have low effectiveness',
        impact: 0.5,
        mitigation: 'Validate knowledge cards, seek alternative solutions',
      });
    }

    // Many agents involved
    if (features.agentCount > 3) {
      risks.push({
        factor: 'Multiple agents coordination complexity',
        impact: Math.min((features.agentCount - 3) * 0.2, 0.8),
        mitigation: 'Ensure clear agent communication protocols, sequential execution',
      });
    }

    return risks.sort((a, b) => b.impact - a.impact);
  }

  /**
   * Identify success factors for the prediction
   */
  private identifySuccessFactors(
    features: Record<string, number>,
    context: JobContext,
    metadata: JobMetadata,
  ): SuccessPrediction['successFactors'] {
    const factors: SuccessPrediction['successFactors'] = [];

    // Good knowledge availability
    if (features.knowledgeCardsUsed > 0 && features.avgCardEffectiveness > 0.7) {
      factors.push({
        factor: 'High-quality knowledge cards available',
        contribution: features.avgCardEffectiveness,
        optimization: 'Leverage existing knowledge cards effectively',
      });
    }

    // Appropriate complexity
    if (features.complexity <= 2) {
      factors.push({
        factor: 'Manageable complexity level',
        contribution: 0.7,
        optimization: 'Maintain focus on quality implementation',
      });
    }

    // Good historical performance for category
    const categorySuccessRate = this.getCategorySuccessRate(metadata.category);
    if (categorySuccessRate > 0.8) {
      factors.push({
        factor: `High success rate for ${metadata.category} category`,
        contribution: categorySuccessRate,
        optimization: 'Follow established patterns for this category',
      });
    }

    return factors.sort((a, b) => b.contribution - a.contribution);
  }

  /**
   * Get historical success rate for a category
   */
  private getCategorySuccessRate(category: string): number {
    // Simplified implementation - in full version, this would query historical data
    const categoryRates: Record<string, number> = {
      feature: 0.75,
      bugfix: 0.85,
      refactor: 0.7,
      test: 0.9,
      deploy: 0.65,
      maintenance: 0.8,
    };

    return categoryRates[category] || 0.7;
  }

  /**
   * Estimate job metrics based on features and success probability
   */
  private estimateJobMetrics(
    features: Record<string, number>,
    successProbability: number,
  ): SuccessPrediction['estimatedMetrics'] {
    // Base estimates adjusted by success probability and complexity
    const complexityMultiplier = features.complexity / 2; // 0.5 to 2
    const successMultiplier = 0.5 + successProbability * 0.5; // 0.5 to 1

    return {
      duration: Math.round((300000 * complexityMultiplier) / successMultiplier), // Base 5 minutes
      qualityScore: Math.min(0.4 + successProbability * 0.5, 0.95), // 0.4 to 0.95
      learningValue: Math.min(0.3 + complexityMultiplier * 0.3, 0.9), // 0.3 to 0.9
    };
  }

  /**
   * Generate recommendations for the prediction
   */
  private generatePredictionRecommendations(
    features: Record<string, number>,
    successProbability: number,
    riskFactors: SuccessPrediction['riskFactors'],
  ): SuccessPrediction['recommendations'] {
    const recommendations: SuccessPrediction['recommendations'] = [];

    // Agent recommendations
    if (features.agentCount > 3) {
      recommendations.push({
        type: 'agent',
        description: 'Consider reducing agent count or implementing sequential execution',
        expectedImprovement: 0.2,
      });
    }

    // Approach recommendations based on success probability
    if (successProbability < 0.6) {
      recommendations.push({
        type: 'approach',
        description: 'Consider breaking down into smaller, less risky tasks',
        expectedImprovement: 0.3,
      });
    }

    // Resource recommendations
    if (features.complexity >= 3) {
      recommendations.push({
        type: 'resource',
        description: 'Allocate additional time and resources for high complexity',
        expectedImprovement: 0.25,
      });
    }

    // Timing recommendations based on risk factors
    if (riskFactors.length > 2) {
      recommendations.push({
        type: 'timing',
        description: 'Allow additional time for risk mitigation and testing',
        expectedImprovement: 0.2,
      });
    }

    return recommendations.sort((a, b) => b.expectedImprovement - a.expectedImprovement);
  }

  /**
   * Update pattern models with new job outcomes
   */
  async updatePatternModels(jobs: JobOutcome[]): Promise<void> {
    try {
      if (jobs.length === 0) return;

      // Update success patterns
      const successfulJobs = jobs.filter((job) => job.success);
      if (successfulJobs.length > 0) {
        await this.identifySuccessPatterns(successfulJobs);
      }

      // Update failure patterns
      const failedJobs = jobs.filter((job) => !job.success);
      if (failedJobs.length > 0) {
        await this.identifyFailurePatterns(failedJobs);
      }

      // Update feature weights based on recent performance
      this.updateFeatureWeights(jobs);

      // Update performance metrics
      this.performanceTracker.patternUpdates++;
      this.performanceTracker.lastUpdate = new Date();

      enhancedLogger.info('Pattern models updated', {
        jobsProcessed: jobs.length,
        successPatterns: this.successPatterns.size,
        failurePatterns: this.failurePatterns.size,
        updateTime: new Date(),
      });
    } catch (error) {
      enhancedLogger.error('Failed to update pattern models', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Update feature weights based on job performance
   */
  private updateFeatureWeights(jobs: JobOutcome[]): void {
    // Simplified weight update - in full ML implementation, this would be more sophisticated
    const featureImportance = new Map<string, { total: number; count: number }>();

    for (const job of jobs) {
      const features = this.extractFeatures(job);
      const success = job.success ? 1 : 0;

      for (const [feature, value] of Object.entries(features)) {
        if (!featureImportance.has(feature)) {
          featureImportance.set(feature, { total: 0, count: 0 });
        }

        const importance = featureImportance.get(feature);
        importance.total += Math.abs(value) * success;
        importance.count++;
      }
    }

    // Update weights based on importance
    for (const [feature, importance] of featureImportance) {
      const weight = importance.count > 0 ? importance.total / importance.count : 0.5;
      this.featureWeights.set(feature, Math.min(Math.max(weight, 0.1), 1.0));
    }
  }

  /**
   * Initialize default feature weights
   */
  private initializeFeatureWeights(): void {
    const defaultWeights: Record<string, number> = {
      complexity: 0.8,
      overallQuality: 0.9,
      codeQuality: 0.8,
      testCoverage: 0.7,
      maintainability: 0.6,
      security: 0.7,
      performance: 0.6,
      gatesRatio: 0.8,
      learningGenerated: 0.5,
      knowledgeReused: 0.6,
      avgCardEffectiveness: 0.7,
    };

    for (const [feature, weight] of Object.entries(defaultWeights)) {
      this.featureWeights.set(feature, weight);
    }
  }

  /**
   * Get most common value from array
   */
  private getMostCommon<T>(array: T[]): T {
    const counts = new Map<T, number>();

    for (const item of array) {
      counts.set(item, (counts.get(item) || 0) + 1);
    }

    let mostCommon = array[0];
    let maxCount = 0;

    for (const [item, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = item;
      }
    }

    return mostCommon;
  }

  /**
   * Update analysis performance metrics
   */
  private updateAnalysisMetrics(duration: number): void {
    this.performanceTracker.analysisCount++;
    this.performanceTracker.totalAnalysisTime += duration;
    this.performanceTracker.avgAnalysisTime =
      this.performanceTracker.totalAnalysisTime / this.performanceTracker.analysisCount;
  }

  /**
   * Load patterns from storage
   */
  private async loadPatterns(): Promise<void> {
    try {
      const patternsPath = join(process.cwd(), '.ff2', 'patterns.json');

      try {
        const content = await fs.readFile(patternsPath, 'utf8');
        const data = JSON.parse(content);

        // Load success patterns
        if (data.successPatterns) {
          for (const pattern of data.successPatterns) {
            this.successPatterns.set(pattern.id, pattern);
          }
        }

        // Load failure patterns
        if (data.failurePatterns) {
          for (const pattern of data.failurePatterns) {
            this.failurePatterns.set(pattern.id, pattern);
          }
        }

        // Load feature weights
        if (data.featureWeights) {
          this.featureWeights = new Map(Object.entries(data.featureWeights));
        }
      } catch (readError) {
        // File doesn't exist or is invalid, start with empty patterns
        enhancedLogger.info('No existing patterns found, starting fresh');
      }
    } catch (error) {
      enhancedLogger.error('Failed to load patterns', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Save patterns to storage
   */
  private async savePatterns(): Promise<void> {
    try {
      const patternsPath = join(process.cwd(), '.ff2', 'patterns.json');

      const data = {
        successPatterns: Array.from(this.successPatterns.values()),
        failurePatterns: Array.from(this.failurePatterns.values()),
        featureWeights: Object.fromEntries(this.featureWeights),
        lastUpdated: new Date().toISOString(),
      };

      await fs.writeFile(patternsPath, JSON.stringify(data, null, 2));
    } catch (error) {
      enhancedLogger.error('Failed to save patterns', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): {
    analysisCount: number;
    avgAnalysisTime: number;
    patternUpdates: number;
    lastUpdate: Date;
    successPatterns: number;
    failurePatterns: number;
    isWithinThreshold: boolean;
  } {
    return {
      ...this.performanceTracker,
      successPatterns: this.successPatterns.size,
      failurePatterns: this.failurePatterns.size,
      isWithinThreshold:
        this.performanceTracker.avgAnalysisTime <=
        this.config.performanceThresholds.patternAnalysisMs,
    };
  }
}
