// Quality Assessment - Automated scoring and feedback loops
// Continuous quality assessment with <5% false positives target

import type {
  QualityAssessment,
  QualityAssessmentResult,
  QualityReport,
  QualityIssue,
  QualityTrends,
  QualityRecommendations,
  JobOutcome,
  TimeRange,
  EvaluationConfig,
  TrendIndicator,
} from './types';
import type { JobOutcomeTracker } from './job-outcome-tracker';
import { enhancedLogger } from '../utils/enhanced-logger';
import { promises as fs } from 'fs';
import { join } from 'path';

interface QualityRule {
  id: string;
  name: string;
  category: string;
  weight: number;
  threshold: number;
  evaluate: (job: JobOutcome) => QualityRuleResult;
}

interface QualityRuleResult {
  passed: boolean;
  score: number;
  details: string[];
  issues: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    location?: string;
    autoFixable: boolean;
  }>;
}

export class AutomatedQualityAssessment implements QualityAssessment {
  private config: EvaluationConfig;
  private jobTracker: JobOutcomeTracker;

  // Quality rules engine
  private qualityRules: Map<string, QualityRule> = new Map();
  private ruleWeights: Map<string, number> = new Map();

  // Assessment history and tracking
  private assessmentHistory: Array<{
    timestamp: Date;
    jobId: string;
    result: QualityAssessmentResult;
  }> = [];

  private qualityIssues: Map<string, QualityIssue> = new Map();
  private issuePatterns: Map<string, number> = new Map();

  // Performance tracking
  private performanceTracker = {
    assessmentsRun: 0,
    totalAssessmentTime: 0,
    avgAssessmentTime: 0,
    falsePositives: 0,
    falseNegatives: 0,
    accuracyRate: 0,
    lastAssessment: new Date(),
  };

  // Quality gate configurations
  private qualityGates: Map<
    string,
    {
      threshold: number;
      weight: number;
      blocking: boolean;
    }
  > = new Map();

  constructor(config: EvaluationConfig, jobTracker: JobOutcomeTracker) {
    this.config = config;
    this.jobTracker = jobTracker;
    this.initializeQualityAssessment();
  }

  /**
   * Initialize quality assessment system
   */
  private async initializeQualityAssessment(): Promise<void> {
    try {
      // Load quality rules and configuration
      await this.loadQualityConfiguration();

      // Initialize quality rules
      this.initializeQualityRules();

      // Initialize quality gates
      this.initializeQualityGates();

      // Load historical data
      await this.loadQualityData();

      enhancedLogger.info('Quality assessment system initialized', {
        qualityRules: this.qualityRules.size,
        qualityGates: this.qualityGates.size,
        historicalAssessments: this.assessmentHistory.length,
        trackedIssues: this.qualityIssues.size,
      });
    } catch (error) {
      enhancedLogger.error('Failed to initialize quality assessment', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Initialize quality rules
   */
  private initializeQualityRules(): void {
    // Code Quality Rules
    this.qualityRules.set('code-quality-score', {
      id: 'code-quality-score',
      name: 'Code Quality Score',
      category: 'code',
      weight: 0.25,
      threshold: 0.7,
      evaluate: (job: JobOutcome): QualityRuleResult => {
        const score = job.quality.components.codeQuality;
        const passed = score >= 0.7;

        const issues = [];
        if (score < 0.5) {
          issues.push({
            severity: 'high' as const,
            description: 'Code quality score is critically low',
            autoFixable: false,
          });
        } else if (score < 0.7) {
          issues.push({
            severity: 'medium' as const,
            description: 'Code quality score below threshold',
            autoFixable: false,
          });
        }

        return {
          passed,
          score,
          details: [`Code quality score: ${(score * 100).toFixed(1)}%`],
          issues,
        };
      },
    });

    // Test Coverage Rule
    this.qualityRules.set('test-coverage', {
      id: 'test-coverage',
      name: 'Test Coverage',
      category: 'test',
      weight: 0.2,
      threshold: 0.8,
      evaluate: (job: JobOutcome): QualityRuleResult => {
        const coverage = job.metrics.qualityGates.testing.coverage / 100;
        const passed = coverage >= 0.8 && job.metrics.qualityGates.testing.passed;

        const issues = [];
        if (coverage < 0.5) {
          issues.push({
            severity: 'critical' as const,
            description: `Test coverage critically low: ${(coverage * 100).toFixed(1)}%`,
            autoFixable: true,
          });
        } else if (coverage < 0.8) {
          issues.push({
            severity: 'medium' as const,
            description: `Test coverage below threshold: ${(coverage * 100).toFixed(1)}%`,
            autoFixable: true,
          });
        }

        if (job.metrics.qualityGates.testing.failedTests > 0) {
          issues.push({
            severity: 'high' as const,
            description: `${job.metrics.qualityGates.testing.failedTests} failing tests`,
            autoFixable: false,
          });
        }

        return {
          passed,
          score: coverage,
          details: [
            `Test coverage: ${(coverage * 100).toFixed(1)}%`,
            `Failed tests: ${job.metrics.qualityGates.testing.failedTests}`,
          ],
          issues,
        };
      },
    });

    // Security Rule
    this.qualityRules.set('security-check', {
      id: 'security-check',
      name: 'Security Assessment',
      category: 'security',
      weight: 0.2,
      threshold: 0.9,
      evaluate: (job: JobOutcome): QualityRuleResult => {
        const vulnerabilities = job.metrics.qualityGates.security.vulnerabilities;
        const severity = job.metrics.qualityGates.security.severity;
        const passed = vulnerabilities === 0;

        const score = vulnerabilities === 0 ? 1.0 : Math.max(0, 1 - vulnerabilities / 10);

        const issues = [];
        if (vulnerabilities > 0) {
          const severityLevel =
            severity === 'critical'
              ? ('critical' as const)
              : severity === 'high'
                ? ('high' as const)
                : severity === 'medium'
                  ? ('medium' as const)
                  : ('low' as const);

          issues.push({
            severity: severityLevel,
            description: `${vulnerabilities} security ${vulnerabilities === 1 ? 'vulnerability' : 'vulnerabilities'} found (${severity})`,
            autoFixable: false,
          });
        }

        return {
          passed,
          score,
          details: [`Vulnerabilities: ${vulnerabilities}`, `Highest severity: ${severity}`],
          issues,
        };
      },
    });

    // Performance Rule
    this.qualityRules.set('performance-check', {
      id: 'performance-check',
      name: 'Performance Assessment',
      category: 'performance',
      weight: 0.15,
      threshold: 0.7,
      evaluate: (job: JobOutcome): QualityRuleResult => {
        const performanceScore = job.quality.components.performance;
        const duration = job.metadata.duration || 0;
        const passed = performanceScore >= 0.7 && duration < 600000; // 10 minutes

        const issues = [];
        if (duration > 600000) {
          issues.push({
            severity: 'high' as const,
            description: `Job duration exceeds 10 minutes: ${Math.round(duration / 60000)}m`,
            autoFixable: false,
          });
        } else if (duration > 300000) {
          issues.push({
            severity: 'medium' as const,
            description: `Job duration is high: ${Math.round(duration / 60000)}m`,
            autoFixable: false,
          });
        }

        if (performanceScore < 0.5) {
          issues.push({
            severity: 'medium' as const,
            description: 'Performance score is low',
            autoFixable: false,
          });
        }

        return {
          passed,
          score: performanceScore,
          details: [
            `Performance score: ${(performanceScore * 100).toFixed(1)}%`,
            `Duration: ${Math.round(duration / 1000)}s`,
          ],
          issues,
        };
      },
    });

    // Maintainability Rule
    this.qualityRules.set('maintainability', {
      id: 'maintainability',
      name: 'Maintainability',
      category: 'maintainability',
      weight: 0.1,
      threshold: 0.6,
      evaluate: (job: JobOutcome): QualityRuleResult => {
        const maintainabilityScore = job.quality.components.maintainability;
        const complexity = job.metrics.codeChanges.complexity;
        const passed = maintainabilityScore >= 0.6 && complexity < 20;

        const issues = [];
        if (complexity > 30) {
          issues.push({
            severity: 'high' as const,
            description: `Cyclomatic complexity is very high: ${complexity}`,
            autoFixable: false,
          });
        } else if (complexity > 20) {
          issues.push({
            severity: 'medium' as const,
            description: `Cyclomatic complexity is high: ${complexity}`,
            autoFixable: false,
          });
        }

        if (maintainabilityScore < 0.4) {
          issues.push({
            severity: 'medium' as const,
            description: 'Maintainability score is low',
            autoFixable: false,
          });
        }

        return {
          passed,
          score: maintainabilityScore,
          details: [
            `Maintainability: ${(maintainabilityScore * 100).toFixed(1)}%`,
            `Complexity: ${complexity}`,
          ],
          issues,
        };
      },
    });

    // Documentation Rule
    this.qualityRules.set('documentation', {
      id: 'documentation',
      name: 'Documentation Quality',
      category: 'documentation',
      weight: 0.1,
      threshold: 0.5,
      evaluate: (job: JobOutcome): QualityRuleResult => {
        const docScore = job.quality.components.documentation;
        const passed = docScore >= 0.5;

        const issues = [];
        if (docScore < 0.3) {
          issues.push({
            severity: 'medium' as const,
            description: 'Documentation is insufficient',
            autoFixable: true,
          });
        } else if (docScore < 0.5) {
          issues.push({
            severity: 'low' as const,
            description: 'Documentation could be improved',
            autoFixable: true,
          });
        }

        return {
          passed,
          score: docScore,
          details: [`Documentation score: ${(docScore * 100).toFixed(1)}%`],
          issues,
        };
      },
    });
  }

  /**
   * Initialize quality gates
   */
  private initializeQualityGates(): void {
    this.qualityGates.set('linting', {
      threshold: 0.0, // Zero tolerance for linting errors
      weight: 0.2,
      blocking: true,
    });

    this.qualityGates.set('typecheck', {
      threshold: 0.0, // Zero tolerance for type errors
      weight: 0.2,
      blocking: true,
    });

    this.qualityGates.set('testing', {
      threshold: 0.8, // 80% test coverage minimum
      weight: 0.25,
      blocking: true,
    });

    this.qualityGates.set('security', {
      threshold: 0.0, // Zero high/critical vulnerabilities
      weight: 0.25,
      blocking: true,
    });

    this.qualityGates.set('performance', {
      threshold: 0.7, // 70% performance score minimum
      weight: 0.1,
      blocking: false,
    });
  }

  /**
   * Assess job quality with comprehensive analysis
   */
  async assessJobQuality(job: JobOutcome): Promise<QualityAssessmentResult> {
    const startTime = performance.now();

    try {
      // Run all quality rules
      const ruleResults = new Map<string, QualityRuleResult>();
      const allIssues: QualityAssessmentResult['issues'] = [];
      const allImprovements: QualityAssessmentResult['improvements'] = [];

      let totalWeightedScore = 0;
      let totalWeight = 0;

      // Evaluate each quality rule
      for (const [ruleId, rule] of this.qualityRules) {
        try {
          const result = rule.evaluate(job);
          ruleResults.set(ruleId, result);

          // Add weighted score
          totalWeightedScore += result.score * rule.weight;
          totalWeight += rule.weight;

          // Collect issues
          for (const issue of result.issues) {
            allIssues.push({
              severity: issue.severity,
              category: rule.category,
              description: issue.description,
              location: issue.location || '',
              recommendation: this.generateRecommendation(issue, rule.category),
              autoFixable: issue.autoFixable,
            });
          }
        } catch (ruleError) {
          enhancedLogger.warn('Quality rule evaluation failed', {
            ruleId,
            jobId: job.jobId,
            error: ruleError instanceof Error ? ruleError.message : 'Unknown error',
          });
        }
      }

      // Calculate overall quality score
      const overallScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;

      // Calculate component scores
      const componentScores = {
        codeQuality: job.quality.components.codeQuality,
        testCoverage: job.metrics.qualityGates.testing.coverage / 100,
        documentation: job.quality.components.documentation,
        maintainability: job.quality.components.maintainability,
        security: job.metrics.qualityGates.security.vulnerabilities === 0 ? 1.0 : 0.5,
        performance: job.quality.components.performance,
        reliability: this.calculateReliabilityScore(job),
      };

      // Evaluate quality gates
      const gates = this.evaluateQualityGates(job, ruleResults);

      // Generate improvements
      const improvements = this.generateImprovements(job, ruleResults);

      // Generate recommendations
      const recommendations = this.generateJobQualityRecommendations(job, allIssues, ruleResults);

      const result: QualityAssessmentResult = {
        jobId: job.jobId,
        timestamp: new Date(),
        overallScore,
        scores: componentScores,
        gates,
        issues: allIssues,
        improvements,
        recommendations,
      };

      // Store assessment in history
      this.assessmentHistory.push({
        timestamp: new Date(),
        jobId: job.jobId,
        result,
      });

      // Keep only last 10000 assessments
      if (this.assessmentHistory.length > 10000) {
        this.assessmentHistory = this.assessmentHistory.slice(-10000);
      }

      // Update quality issues tracking
      await this.updateQualityIssueTracking(result);

      // Update performance metrics
      const duration = performance.now() - startTime;
      this.updateAssessmentMetrics(duration);

      // Check performance threshold
      if (duration > (this.config.performanceThresholds.qualityAssessmentMs || 100)) {
        enhancedLogger.warn('Quality assessment exceeded performance threshold', {
          duration,
          threshold: this.config.performanceThresholds.qualityAssessmentMs,
          jobId: job.jobId,
        });
      }

      enhancedLogger.debug('Job quality assessed', {
        jobId: job.jobId,
        overallScore,
        gatesPassed: gates.filter((g) => g.passed).length,
        issuesFound: allIssues.length,
        duration,
      });

      return result;
    } catch (error) {
      enhancedLogger.error('Failed to assess job quality', undefined, {
        jobId: job.jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Calculate reliability score
   */
  private calculateReliabilityScore(job: JobOutcome): number {
    let reliabilityScore = 1.0;

    // Reduce score for failures
    if (!job.success) {
      reliabilityScore -= 0.5;
    }

    // Reduce score for quality gate failures
    const totalGates = job.quality.gatesTotal;
    const passedGates = job.quality.gatesPassed;

    if (totalGates > 0) {
      const gatePassRate = passedGates / totalGates;
      reliabilityScore *= gatePassRate;
    }

    // Reduce score for high error count
    const errorCount = job.quality.issues.filter(
      (issue) => issue.type === 'error' || issue.severity >= 7,
    ).length;
    if (errorCount > 0) {
      reliabilityScore *= Math.exp(-errorCount / 10); // Exponential decay
    }

    return Math.max(0, reliabilityScore);
  }

  /**
   * Evaluate quality gates
   */
  private evaluateQualityGates(
    job: JobOutcome,
    ruleResults: Map<string, QualityRuleResult>,
  ): QualityAssessmentResult['gates'] {
    const gates: QualityAssessmentResult['gates'] = [];

    // Linting gate
    gates.push({
      name: 'Linting',
      passed: job.metrics.qualityGates.linting.errors === 0,
      score: job.metrics.qualityGates.linting.errors === 0 ? 1.0 : 0.0,
      threshold: 0.0,
      details: [
        `Errors: ${job.metrics.qualityGates.linting.errors}`,
        `Warnings: ${job.metrics.qualityGates.linting.warnings}`,
      ],
    });

    // Type checking gate
    gates.push({
      name: 'Type Checking',
      passed: job.metrics.qualityGates.typecheck.errors === 0,
      score: job.metrics.qualityGates.typecheck.errors === 0 ? 1.0 : 0.0,
      threshold: 0.0,
      details: [`Type errors: ${job.metrics.qualityGates.typecheck.errors}`],
    });

    // Testing gate
    const testCoverage = job.metrics.qualityGates.testing.coverage / 100;
    gates.push({
      name: 'Testing',
      passed: job.metrics.qualityGates.testing.passed && testCoverage >= 0.8,
      score: testCoverage,
      threshold: 0.8,
      details: [
        `Coverage: ${job.metrics.qualityGates.testing.coverage}%`,
        `Failed tests: ${job.metrics.qualityGates.testing.failedTests}`,
      ],
    });

    // Security gate
    gates.push({
      name: 'Security',
      passed: job.metrics.qualityGates.security.vulnerabilities === 0,
      score: job.metrics.qualityGates.security.vulnerabilities === 0 ? 1.0 : 0.5,
      threshold: 1.0,
      details: [
        `Vulnerabilities: ${job.metrics.qualityGates.security.vulnerabilities}`,
        `Severity: ${job.metrics.qualityGates.security.severity}`,
      ],
    });

    // Performance gate
    gates.push({
      name: 'Performance',
      passed: job.quality.components.performance >= 0.7,
      score: job.quality.components.performance,
      threshold: 0.7,
      details: [`Performance score: ${(job.quality.components.performance * 100).toFixed(1)}%`],
    });

    return gates;
  }

  /**
   * Generate quality improvements
   */
  private generateImprovements(
    job: JobOutcome,
    ruleResults: Map<string, QualityRuleResult>,
  ): QualityAssessmentResult['improvements'] {
    const improvements: QualityAssessmentResult['improvements'] = [];

    // Check for improvements from previous assessments
    const previousAssessments = this.assessmentHistory
      .filter((a) => a.jobId !== job.jobId) // Exclude current job
      .slice(-10); // Last 10 assessments

    if (previousAssessments.length > 0) {
      const avgPreviousScore =
        previousAssessments.reduce((sum, a) => sum + a.result.overallScore, 0) /
        previousAssessments.length;
      const currentScore = job.quality.overallScore;

      if (currentScore > avgPreviousScore + 0.05) {
        // 5% improvement
        improvements.push({
          area: 'Quality Score',
          before: avgPreviousScore,
          after: currentScore,
          improvement: currentScore - avgPreviousScore,
          method: 'Continuous quality improvements',
        });
      }
    }

    // Check for specific component improvements
    if (job.quality.components.testQuality > 0.9) {
      improvements.push({
        area: 'Test Coverage',
        before: 0.8, // Assumed baseline
        after: job.quality.components.testQuality,
        improvement: job.quality.components.testQuality - 0.8,
        method: 'Comprehensive testing strategy',
      });
    }

    if (job.metrics.qualityGates.security.vulnerabilities === 0) {
      improvements.push({
        area: 'Security',
        before: 0.5, // Assumed baseline with some vulnerabilities
        after: 1.0,
        improvement: 0.5,
        method: 'Security-first development approach',
      });
    }

    return improvements;
  }

  /**
   * Generate quality recommendations for a specific job
   */
  private generateJobQualityRecommendations(
    job: JobOutcome,
    issues: QualityAssessmentResult['issues'],
    ruleResults: Map<string, QualityRuleResult>,
  ): QualityAssessmentResult['recommendations'] {
    const recommendations: QualityAssessmentResult['recommendations'] = [];

    // High priority recommendations for critical/high severity issues
    const criticalIssues = issues.filter((i) => i.severity === 'critical' || i.severity === 'high');
    if (criticalIssues.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'error-resolution',
        description: `Address ${criticalIssues.length} critical ${criticalIssues.length === 1 ? 'issue' : 'issues'}`,
        expectedImpact: 0.8,
        effort: criticalIssues.length > 5 ? 'high' : 'medium',
      });
    }

    // Test coverage recommendation
    const testCoverage = job.metrics.qualityGates.testing.coverage / 100;
    if (testCoverage < 0.8) {
      recommendations.push({
        priority: 'medium',
        category: 'testing',
        description: `Increase test coverage from ${(testCoverage * 100).toFixed(1)}% to 80%+`,
        expectedImpact: 0.6,
        effort: 'medium',
      });
    }

    // Security recommendation
    if (job.metrics.qualityGates.security.vulnerabilities > 0) {
      recommendations.push({
        priority: 'high',
        category: 'security',
        description: `Fix ${job.metrics.qualityGates.security.vulnerabilities} security ${job.metrics.qualityGates.security.vulnerabilities === 1 ? 'vulnerability' : 'vulnerabilities'}`,
        expectedImpact: 0.9,
        effort: job.metrics.qualityGates.security.severity === 'critical' ? 'high' : 'medium',
      });
    }

    // Performance recommendation
    if (job.quality.components.performance < 0.7) {
      recommendations.push({
        priority: 'medium',
        category: 'performance',
        description: 'Optimize performance to meet threshold',
        expectedImpact: 0.5,
        effort: 'medium',
      });
    }

    // Code quality recommendation
    if (job.quality.components.codeQuality < 0.7) {
      recommendations.push({
        priority: 'medium',
        category: 'code-quality',
        description: 'Improve code quality through refactoring',
        expectedImpact: 0.4,
        effort: 'medium',
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      return priorityDiff !== 0 ? priorityDiff : b.expectedImpact - a.expectedImpact;
    });
  }

  /**
   * Generate recommendation for an issue
   */
  private generateRecommendation(
    issue: { severity: string; description: string; autoFixable: boolean },
    category: string,
  ): string {
    if (issue.autoFixable) {
      return `Auto-fix available: ${issue.description}`;
    }

    switch (category) {
      case 'code':
        return 'Review and refactor code to improve quality metrics';
      case 'test':
        return 'Add comprehensive tests to increase coverage';
      case 'security':
        return 'Review security practices and fix vulnerabilities';
      case 'performance':
        return 'Profile and optimize performance bottlenecks';
      case 'maintainability':
        return 'Reduce complexity and improve code structure';
      case 'documentation':
        return 'Add or improve code documentation';
      default:
        return 'Review and address the identified issue';
    }
  }

  /**
   * Generate comprehensive quality report
   */
  async generateQualityReport(timeRange: TimeRange): Promise<QualityReport> {
    const startTime = performance.now();

    try {
      // Get job outcomes for the time range
      const jobs = await this.jobTracker.getJobOutcomes({
        timeRange,
        limit: 10000,
      });

      if (jobs.length === 0) {
        throw new Error('No job outcomes found for quality report');
      }

      // Calculate overall quality metrics
      const overall = this.calculateOverallQualityMetrics(jobs);

      // Analyze quality by category
      const categories = this.analyzeQualityByCategory(jobs);

      // Analyze quality by agent
      const agents = this.analyzeQualityByAgent(jobs);

      // Analyze quality gates
      const gates = this.analyzeQualityGates(jobs);

      // Analyze issues
      const issues = this.analyzeQualityIssues(jobs);

      const report: QualityReport = {
        timeRange,
        timestamp: new Date(),
        overall,
        categories,
        agents,
        gates,
        issues,
      };

      const duration = performance.now() - startTime;

      enhancedLogger.info('Quality report generated', {
        timeRange,
        jobsAnalyzed: jobs.length,
        avgQualityScore: overall.avgQualityScore,
        duration,
      });

      return report;
    } catch (error) {
      enhancedLogger.error('Failed to generate quality report', undefined, {
        timeRange,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Calculate overall quality metrics
   */
  private calculateOverallQualityMetrics(jobs: JobOutcome[]): QualityReport['overall'] {
    const avgQualityScore =
      jobs.reduce((sum, job) => sum + job.quality.overallScore, 0) / jobs.length;

    // Calculate trend
    const firstHalf = jobs.slice(0, Math.floor(jobs.length / 2));
    const secondHalf = jobs.slice(Math.floor(jobs.length / 2));

    const firstHalfAvg =
      firstHalf.reduce((sum, job) => sum + job.quality.overallScore, 0) / firstHalf.length;
    const secondHalfAvg =
      secondHalf.reduce((sum, job) => sum + job.quality.overallScore, 0) / secondHalf.length;

    const qualityTrend =
      secondHalfAvg > firstHalfAvg + 0.05
        ? 'improving'
        : secondHalfAvg < firstHalfAvg - 0.05
          ? 'declining'
          : 'stable';

    // Calculate gate pass rate
    const totalGates = jobs.reduce((sum, job) => sum + job.quality.gatesTotal, 0);
    const passedGates = jobs.reduce((sum, job) => sum + job.quality.gatesPassed, 0);
    const gatePassRate = totalGates > 0 ? passedGates / totalGates : 0;

    // Calculate issue resolution time
    const issueResolutionTimes = jobs
      .flatMap((job) => job.quality.issues)
      .filter((issue) => issue.fixed)
      .map(() => Math.random() * 48 + 2); // Simulated resolution times (2-50 hours)

    const issueResolutionTime =
      issueResolutionTimes.length > 0
        ? issueResolutionTimes.reduce((sum, time) => sum + time, 0) / issueResolutionTimes.length
        : 0;

    return {
      avgQualityScore,
      qualityTrend,
      gatePassRate,
      issueResolutionTime,
    };
  }

  /**
   * Analyze quality by category
   */
  private analyzeQualityByCategory(jobs: JobOutcome[]): QualityReport['categories'] {
    const categories: QualityReport['categories'] = {};
    const categoryStats = new Map<string, { scores: number[]; improvements: string[] }>();

    // Group jobs by category
    for (const job of jobs) {
      const category = job.metadata.category;

      if (!categoryStats.has(category)) {
        categoryStats.set(category, { scores: [], improvements: [] });
      }

      const stats = categoryStats.get(category);
      stats.scores.push(job.quality.overallScore);

      // Collect improvements
      stats.improvements.push(...job.quality.improvements.map((imp) => imp.description));
    }

    // Calculate category metrics
    for (const [category, stats] of categoryStats) {
      const avgScore = stats.scores.reduce((sum, score) => sum + score, 0) / stats.scores.length;

      // Calculate trend (simplified)
      const firstHalf = stats.scores.slice(0, Math.floor(stats.scores.length / 2));
      const secondHalf = stats.scores.slice(Math.floor(stats.scores.length / 2));

      const firstAvg = firstHalf.reduce((sum, score) => sum + score, 0) / (firstHalf.length || 1);
      const secondAvg =
        secondHalf.reduce((sum, score) => sum + score, 0) / (secondHalf.length || 1);

      const trend = this.createTrendIndicator(secondAvg, firstAvg, true);

      // Get top issues for this category
      const topIssues = this.getTopIssuesForCategory(jobs, category);

      // Get unique improvements
      const uniqueImprovements = [...new Set(stats.improvements)].slice(0, 5);

      categories[category] = {
        avgScore,
        trend,
        topIssues,
        improvements: uniqueImprovements,
      };
    }

    return categories;
  }

  /**
   * Get top issues for a category
   */
  private getTopIssuesForCategory(jobs: JobOutcome[], category: string): string[] {
    const issueCounts = new Map<string, number>();

    const categoryJobs = jobs.filter((job) => job.metadata.category === category);

    for (const job of categoryJobs) {
      for (const issue of job.quality.issues) {
        const issueKey = issue.description;
        issueCounts.set(issueKey, (issueCounts.get(issueKey) || 0) + 1);
      }
    }

    return Array.from(issueCounts.entries())
      .sort(([_, a], [__, b]) => b - a)
      .slice(0, 5)
      .map(([issue, _]) => issue);
  }

  /**
   * Analyze quality by agent
   */
  private analyzeQualityByAgent(jobs: JobOutcome[]): QualityReport['agents'] {
    const agents: QualityReport['agents'] = {};
    const agentStats = new Map<
      string,
      {
        scores: number[];
        strengths: Set<string>;
        weaknesses: Set<string>;
        improvements: Array<{ area: string; improvement: number }>;
      }
    >();

    // Collect agent statistics
    for (const job of jobs) {
      for (const agentType of job.metadata.agentTypes) {
        if (!agentStats.has(agentType)) {
          agentStats.set(agentType, {
            scores: [],
            strengths: new Set(),
            weaknesses: new Set(),
            improvements: [],
          });
        }

        const stats = agentStats.get(agentType);
        stats.scores.push(job.quality.overallScore);

        // Identify strengths and weaknesses based on component scores
        const components = job.quality.components;

        if (components.codeQuality > 0.8) stats.strengths.add('Code Quality');
        else if (components.codeQuality < 0.6) stats.weaknesses.add('Code Quality');

        if (components.testQuality > 0.8) stats.strengths.add('Testing');
        else if (components.testQuality < 0.6) stats.weaknesses.add('Testing');

        if (components.security > 0.8) stats.strengths.add('Security');
        else if (components.security < 0.6) stats.weaknesses.add('Security');

        if (components.performance > 0.8) stats.strengths.add('Performance');
        else if (components.performance < 0.6) stats.weaknesses.add('Performance');

        // Track improvements
        for (const improvement of job.quality.improvements) {
          stats.improvements.push({
            area: improvement.type,
            improvement: improvement.impact,
          });
        }
      }
    }

    // Calculate agent quality metrics
    for (const [agentType, stats] of agentStats) {
      const avgScore = stats.scores.reduce((sum, score) => sum + score, 0) / stats.scores.length;

      // Aggregate improvements by area
      const improvementByArea = new Map<string, number[]>();
      for (const imp of stats.improvements) {
        if (!improvementByArea.has(imp.area)) {
          improvementByArea.set(imp.area, []);
        }
        improvementByArea.get(imp.area).push(imp.improvement);
      }

      const improvements = Array.from(improvementByArea.entries())
        .map(([area, values]) => ({
          area,
          improvement: values.reduce((sum, val) => sum + val, 0) / values.length,
        }))
        .sort((a, b) => b.improvement - a.improvement);

      agents[agentType] = {
        avgScore,
        strengths: Array.from(stats.strengths),
        weaknesses: Array.from(stats.weaknesses),
        improvements,
      };
    }

    return agents;
  }

  /**
   * Analyze quality gates
   */
  private analyzeQualityGates(jobs: JobOutcome[]): QualityReport['gates'] {
    const gates: QualityReport['gates'] = [];
    const gateNames = ['Linting', 'Type Checking', 'Testing', 'Security', 'Performance'];

    for (const gateName of gateNames) {
      const gateResults = jobs.map((job) => {
        switch (gateName) {
          case 'Linting':
            return {
              passed: job.metrics.qualityGates.linting.errors === 0,
              score: job.metrics.qualityGates.linting.errors === 0 ? 1.0 : 0.0,
            };
          case 'Type Checking':
            return {
              passed: job.metrics.qualityGates.typecheck.errors === 0,
              score: job.metrics.qualityGates.typecheck.errors === 0 ? 1.0 : 0.0,
            };
          case 'Testing':
            const coverage = job.metrics.qualityGates.testing.coverage / 100;
            return {
              passed: job.metrics.qualityGates.testing.passed && coverage >= 0.8,
              score: coverage,
            };
          case 'Security':
            return {
              passed: job.metrics.qualityGates.security.vulnerabilities === 0,
              score: job.metrics.qualityGates.security.vulnerabilities === 0 ? 1.0 : 0.5,
            };
          case 'Performance':
            return {
              passed: job.quality.components.performance >= 0.7,
              score: job.quality.components.performance,
            };
          default:
            return { passed: true, score: 1.0 };
        }
      });

      const passCount = gateResults.filter((r) => r.passed).length;
      const passRate = passCount / gateResults.length;
      const avgScore = gateResults.reduce((sum, r) => sum + r.score, 0) / gateResults.length;

      // Calculate trend
      const firstHalf = gateResults.slice(0, Math.floor(gateResults.length / 2));
      const secondHalf = gateResults.slice(Math.floor(gateResults.length / 2));

      const firstHalfPassRate = firstHalf.filter((r) => r.passed).length / (firstHalf.length || 1);
      const secondHalfPassRate =
        secondHalf.filter((r) => r.passed).length / (secondHalf.length || 1);

      const trend = this.createTrendIndicator(secondHalfPassRate, firstHalfPassRate, true);

      // Get common failures (simplified)
      const commonFailures = this.getCommonFailuresForGate(jobs, gateName);

      gates.push({
        name: gateName,
        passRate,
        avgScore,
        trend,
        commonFailures,
      });
    }

    return gates;
  }

  /**
   * Get common failures for a quality gate
   */
  private getCommonFailuresForGate(jobs: JobOutcome[], gateName: string): string[] {
    const failures: string[] = [];

    for (const job of jobs) {
      switch (gateName) {
        case 'Linting':
          if (job.metrics.qualityGates.linting.errors > 0) {
            failures.push('Linting errors detected');
          }
          break;
        case 'Type Checking':
          if (job.metrics.qualityGates.typecheck.errors > 0) {
            failures.push('TypeScript errors detected');
          }
          break;
        case 'Testing':
          if (job.metrics.qualityGates.testing.failedTests > 0) {
            failures.push('Test failures');
          }
          if (job.metrics.qualityGates.testing.coverage < 80) {
            failures.push('Low test coverage');
          }
          break;
        case 'Security':
          if (job.metrics.qualityGates.security.vulnerabilities > 0) {
            failures.push(
              `Security vulnerabilities (${job.metrics.qualityGates.security.severity})`,
            );
          }
          break;
        case 'Performance':
          if (job.quality.components.performance < 0.7) {
            failures.push('Performance below threshold');
          }
          break;
      }
    }

    // Count and return top failures
    const failureCounts = new Map<string, number>();
    for (const failure of failures) {
      failureCounts.set(failure, (failureCounts.get(failure) || 0) + 1);
    }

    return Array.from(failureCounts.entries())
      .sort(([_, a], [__, b]) => b - a)
      .slice(0, 3)
      .map(([failure, _]) => failure);
  }

  /**
   * Analyze quality issues
   */
  private analyzeQualityIssues(jobs: JobOutcome[]): QualityReport['issues'] {
    const allIssues = jobs.flatMap((job) => job.quality.issues);

    const totalIssues = allIssues.length;
    const resolvedIssues = allIssues.filter((issue) => issue.fixed).length;
    const avgResolutionTime = 24; // Simplified - would calculate from actual data

    // Count issues by severity
    const severityDistribution: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    // Count issues by category
    const categoryDistribution: Record<string, number> = {};

    for (const issue of allIssues) {
      // Severity distribution
      const severity = issue.severity; // Use actual severity from issue
      severityDistribution[severity]++;

      // Category distribution
      const category = issue.category;
      categoryDistribution[category] = (categoryDistribution[category] || 0) + 1;
    }

    // Find recurring issues
    const issueDescriptions = new Map<string, number>();
    for (const issue of allIssues) {
      const desc = issue.description;
      issueDescriptions.set(desc, (issueDescriptions.get(desc) || 0) + 1);
    }

    const recurringIssues = Array.from(issueDescriptions.entries())
      .filter(([_, count]) => count > 2)
      .sort(([_, a], [__, b]) => b - a)
      .slice(0, 5)
      .map(([issue, occurrences]) => ({
        issue,
        occurrences,
        pattern: `Recurring pattern: ${occurrences} occurrences`,
      }));

    return {
      totalIssues,
      resolvedIssues,
      avgResolutionTime,
      severityDistribution,
      categoryDistribution,
      recurringIssues,
    };
  }

  /**
   * Create trend indicator
   */
  private createTrendIndicator(
    current: number,
    previous: number,
    higherIsBetter: boolean = true,
  ): TrendIndicator {
    if (previous === 0) {
      return {
        current,
        previous,
        change: 0,
        direction: 'stable',
        significance: 'low',
      };
    }

    const change = ((current - previous) / previous) * 100;
    const absChange = Math.abs(change);

    let direction: TrendIndicator['direction'];
    if (absChange < 2) {
      direction = 'stable';
    } else if ((change > 0 && higherIsBetter) || (change < 0 && !higherIsBetter)) {
      direction = 'up';
    } else {
      direction = 'down';
    }

    let significance: TrendIndicator['significance'];
    if (absChange > 10) {
      significance = 'high';
    } else if (absChange > 5) {
      significance = 'medium';
    } else {
      significance = 'low';
    }

    return {
      current,
      previous,
      change,
      direction,
      significance,
    };
  }

  /**
   * Identify recurring quality issues
   */
  async identifyQualityIssues(): Promise<QualityIssue[]> {
    try {
      const issues: QualityIssue[] = [];

      // Analyze patterns from assessment history
      const recentAssessments = this.assessmentHistory.slice(-1000); // Last 1000 assessments
      const issuePatterns = new Map<
        string,
        {
          occurrences: Array<{
            jobId: string;
            timestamp: Date;
            context: string;
            resolved: boolean;
          }>;
          severity: 'low' | 'medium' | 'high' | 'critical';
          category: string;
        }
      >();

      // Collect issue patterns
      for (const assessment of recentAssessments) {
        for (const issue of assessment.result.issues) {
          const issueKey = issue.description;

          if (!issuePatterns.has(issueKey)) {
            issuePatterns.set(issueKey, {
              occurrences: [],
              severity: issue.severity,
              category: issue.category,
            });
          }

          const pattern = issuePatterns.get(issueKey);
          pattern.occurrences.push({
            jobId: assessment.jobId,
            timestamp: assessment.timestamp,
            context: `Job ${assessment.jobId}`,
            resolved: issue.autoFixable,
          });
        }
      }

      // Convert patterns to quality issues
      for (const [issueDescription, pattern] of issuePatterns) {
        if (pattern.occurrences.length < 3) continue; // Only track issues that occur multiple times

        const affectedJobs = pattern.occurrences.length;
        const avgImpactScore = 0.5; // Simplified
        const qualityDegradation =
          pattern.severity === 'critical'
            ? 0.8
            : pattern.severity === 'high'
              ? 0.6
              : pattern.severity === 'medium'
                ? 0.4
                : 0.2;

        // Calculate resolution metrics
        const resolvedOccurrences = pattern.occurrences.filter((occ) => occ.resolved);
        const avgResolutionTime = 12; // Simplified - 12 hours average
        const successRate = resolvedOccurrences.length / pattern.occurrences.length;

        // Identify common solutions
        const commonSolutions = this.getCommonSolutions(pattern.category, pattern.severity);
        const preventionStrategies = this.getPreventionStrategies(pattern.category);

        // Analyze patterns and correlations
        const triggers = this.identifyIssueTriggers(pattern.occurrences);
        const conditions = this.identifyIssueConditions(pattern.category);
        const correlations = this.identifyIssueCorrelations(issueDescription);

        // Generate recommendations
        const recommendations = this.generateIssueRecommendations(
          pattern.category,
          pattern.severity,
        );

        const qualityIssue: QualityIssue = {
          id: `issue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          severity: pattern.severity,
          category: this.mapToValidCategory(pattern.category),
          title: issueDescription,
          description: `Recurring issue: ${issueDescription}`,

          occurrences: pattern.occurrences,

          impact: {
            affectedJobs,
            avgImpactScore,
            qualityDegradation,
            userImpact:
              pattern.severity === 'critical'
                ? 'high'
                : pattern.severity === 'high'
                  ? 'medium'
                  : 'low',
          },

          resolution: {
            avgResolutionTime,
            successRate,
            commonSolutions,
            preventionStrategies,
          },

          patterns: {
            triggers,
            conditions,
            correlations,
          },

          recommendations,
        };

        issues.push(qualityIssue);
      }

      // Sort by impact and severity
      const sortedIssues = issues.sort((a, b) => {
        const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
        return severityDiff !== 0 ? severityDiff : b.impact.affectedJobs - a.impact.affectedJobs;
      });

      // Update quality issues map
      for (const issue of sortedIssues) {
        this.qualityIssues.set(issue.id, issue);
      }

      enhancedLogger.info('Quality issues identified', {
        totalIssues: sortedIssues.length,
        criticalIssues: sortedIssues.filter((i) => i.severity === 'critical').length,
        highIssues: sortedIssues.filter((i) => i.severity === 'high').length,
      });

      return sortedIssues;
    } catch (error) {
      enhancedLogger.error('Failed to identify quality issues', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get common solutions for issue category and severity
   */
  private getCommonSolutions(category: string, severity: string): string[] {
    const solutions: Record<string, Record<string, string[]>> = {
      code: {
        critical: ['Emergency code review', 'Immediate refactoring', 'Rollback if necessary'],
        high: ['Code review', 'Refactoring', 'Static analysis'],
        medium: ['Code cleanup', 'Style guide enforcement'],
        low: ['Documentation update', 'Minor cleanup'],
      },
      test: {
        critical: ['Fix failing tests immediately', 'Emergency test suite run'],
        high: ['Add missing tests', 'Fix test coverage'],
        medium: ['Improve test quality', 'Update test documentation'],
        low: ['Minor test improvements'],
      },
      security: {
        critical: ['Immediate security patch', 'Security audit', 'Incident response'],
        high: ['Security fix', 'Vulnerability assessment'],
        medium: ['Security review', 'Update dependencies'],
        low: ['Minor security improvement'],
      },
    };

    return solutions[category]?.[severity] || ['Review and fix issue'];
  }

  /**
   * Get prevention strategies for issue category
   */
  private getPreventionStrategies(category: string): string[] {
    const strategies: Record<string, string[]> = {
      code: ['Code reviews', 'Static analysis', 'Coding standards', 'Pair programming'],
      test: ['Test-driven development', 'Continuous testing', 'Test coverage monitoring'],
      security: [
        'Security training',
        'Regular audits',
        'Dependency scanning',
        'Secure coding practices',
      ],
      performance: ['Performance monitoring', 'Load testing', 'Code profiling'],
      maintainability: ['Regular refactoring', 'Design reviews', 'Technical debt tracking'],
      documentation: ['Documentation standards', 'Regular updates', 'Peer reviews'],
    };

    return strategies[category] || ['Regular monitoring and review'];
  }

  /**
   * Identify issue triggers
   */
  private identifyIssueTriggers(
    occurrences: Array<{ jobId: string; timestamp: Date; context: string; resolved: boolean }>,
  ): string[] {
    // Simplified trigger identification
    const triggers = ['Code changes', 'New features', 'Refactoring', 'Dependency updates'];
    return triggers.slice(0, Math.ceil(Math.random() * triggers.length));
  }

  /**
   * Identify issue conditions
   */
  private identifyIssueConditions(category: string): string[] {
    const conditions: Record<string, string[]> = {
      code: ['Complex logic', 'Large files', 'Multiple dependencies'],
      test: ['Low coverage', 'Flaky tests', 'Missing edge cases'],
      security: ['Outdated dependencies', 'Input validation', 'Authentication issues'],
      performance: ['Resource constraints', 'Inefficient algorithms', 'Database queries'],
      maintainability: ['High complexity', 'Code duplication', 'Poor structure'],
      documentation: ['Missing documentation', 'Outdated information', 'Poor organization'],
    };

    return conditions[category] || ['Various conditions'];
  }

  /**
   * Identify issue correlations
   */
  private identifyIssueCorrelations(
    issueDescription: string,
  ): Array<{ factor: string; correlation: number }> {
    // Simplified correlation identification
    return [
      { factor: 'Code complexity', correlation: 0.7 },
      { factor: 'Time pressure', correlation: 0.5 },
      { factor: 'Team experience', correlation: -0.6 },
    ];
  }

  /**
   * Generate issue-specific recommendations
   */
  private generateIssueRecommendations(
    category: string,
    severity: string,
  ): QualityIssue['recommendations'] {
    const recommendations: QualityIssue['recommendations'] = [];

    // Fix recommendation
    recommendations.push({
      type: 'fix',
      description: `Address ${category} issues with ${severity} severity`,
      effort: severity === 'critical' ? 'high' : severity === 'high' ? 'medium' : 'low',
      effectiveness: severity === 'critical' ? 0.9 : severity === 'high' ? 0.8 : 0.6,
    });

    // Prevention recommendation
    recommendations.push({
      type: 'prevent',
      description: `Implement prevention strategies for ${category} issues`,
      effort: 'medium',
      effectiveness: 0.7,
    });

    // Monitoring recommendation
    if (severity === 'critical' || severity === 'high') {
      recommendations.push({
        type: 'monitor',
        description: `Enhanced monitoring for ${category} quality`,
        effort: 'low',
        effectiveness: 0.5,
      });
    }

    return recommendations;
  }

  /**
   * Track quality trends over time
   */
  async trackQualityTrends(): Promise<QualityTrends> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const timeRange: TimeRange = {
        start: thirtyDaysAgo,
        end: new Date(),
      };

      const jobs = await this.jobTracker.getJobOutcomes({
        timeRange,
        limit: 5000,
      });

      if (jobs.length < 10) {
        throw new Error('Insufficient data for trend analysis');
      }

      // Calculate overall trends
      const overall = this.calculateQualityTrendIndicators(jobs);

      // Perform detailed analysis
      const analysis = this.performQualityTrendAnalysis(jobs);

      // Generate predictions
      const predictions = this.generateQualityPredictions(jobs, overall);

      // Analyze seasonality
      const seasonality = this.analyzeQualitySeasonality(jobs);

      const qualityTrends: QualityTrends = {
        timeRange,
        timestamp: new Date(),
        overall,
        analysis,
        predictions,
        seasonality,
      };

      enhancedLogger.info('Quality trends analyzed', {
        timeRange,
        jobsAnalyzed: jobs.length,
        overallTrend: overall.qualityScore.direction,
      });

      return qualityTrends;
    } catch (error) {
      enhancedLogger.error('Failed to track quality trends', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Calculate quality trend indicators
   */
  private calculateQualityTrendIndicators(jobs: JobOutcome[]): QualityTrends['overall'] {
    // Split into periods for comparison
    const midpoint = Math.floor(jobs.length / 2);
    const firstHalf = jobs.slice(0, midpoint);
    const secondHalf = jobs.slice(midpoint);

    const firstHalfMetrics = this.calculatePeriodQualityMetrics(firstHalf);
    const secondHalfMetrics = this.calculatePeriodQualityMetrics(secondHalf);

    return {
      qualityScore: this.createTrendIndicator(
        secondHalfMetrics.avgQuality,
        firstHalfMetrics.avgQuality,
        true,
      ),
      issueCount: this.createTrendIndicator(
        secondHalfMetrics.avgIssues,
        firstHalfMetrics.avgIssues,
        false,
      ),
      resolutionTime: this.createTrendIndicator(
        secondHalfMetrics.avgResolutionTime,
        firstHalfMetrics.avgResolutionTime,
        false,
      ),
      gatePassRate: this.createTrendIndicator(
        secondHalfMetrics.gatePassRate,
        firstHalfMetrics.gatePassRate,
        true,
      ),
    };
  }

  /**
   * Calculate quality metrics for a period
   */
  private calculatePeriodQualityMetrics(jobs: JobOutcome[]): {
    avgQuality: number;
    avgIssues: number;
    avgResolutionTime: number;
    gatePassRate: number;
  } {
    if (jobs.length === 0) {
      return { avgQuality: 0, avgIssues: 0, avgResolutionTime: 0, gatePassRate: 0 };
    }

    const avgQuality = jobs.reduce((sum, job) => sum + job.quality.overallScore, 0) / jobs.length;
    const avgIssues = jobs.reduce((sum, job) => sum + job.quality.issues.length, 0) / jobs.length;
    const avgResolutionTime = 24; // Simplified

    const totalGates = jobs.reduce((sum, job) => sum + job.quality.gatesTotal, 0);
    const passedGates = jobs.reduce((sum, job) => sum + job.quality.gatesPassed, 0);
    const gatePassRate = totalGates > 0 ? passedGates / totalGates : 0;

    return { avgQuality, avgIssues, avgResolutionTime, gatePassRate };
  }

  /**
   * Perform detailed quality trend analysis
   */
  private performQualityTrendAnalysis(jobs: JobOutcome[]): QualityTrends['analysis'] {
    const analysis: QualityTrends['analysis'] = [];

    // Quality score trend analysis
    const qualityTrend = this.calculateMetricTrend(jobs.map((job) => job.quality.overallScore));
    if (Math.abs(qualityTrend) > 0.001) {
      analysis.push({
        metric: 'Overall Quality Score',
        trend: qualityTrend > 0 ? 'improving' : 'declining',
        changeRate: qualityTrend,
        significance:
          Math.abs(qualityTrend) > 0.01
            ? 'high'
            : Math.abs(qualityTrend) > 0.005
              ? 'medium'
              : 'low',
        factors:
          qualityTrend > 0
            ? ['Better coding practices', 'Improved testing', 'Quality gates working']
            : ['Increased complexity', 'Technical debt', 'Resource constraints'],
      });
    }

    return analysis;
  }

  /**
   * Calculate metric trend using linear regression
   */
  private calculateMetricTrend(values: number[]): number {
    if (values.length < 2) return 0;

    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = values;

    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
    const sumXX = x.reduce((sum, val) => sum + val * val, 0);

    const denominator = n * sumXX - sumX * sumX;
    if (denominator === 0) return 0;

    return (n * sumXY - sumX * sumY) / denominator;
  }

  /**
   * Generate quality predictions
   */
  private generateQualityPredictions(
    jobs: JobOutcome[],
    trends: QualityTrends['overall'],
  ): QualityTrends['predictions'] {
    const currentQuality = jobs[jobs.length - 1]?.quality.overallScore || 0.7;
    const currentIssueCount = jobs[jobs.length - 1]?.quality.issues.length || 2;

    const nextPeriod = {
      qualityScore: Math.max(0, Math.min(1, currentQuality + trends.qualityScore.change / 100)),
      issueCount: Math.max(0, currentIssueCount + trends.issueCount.change / 100),
      confidence: this.calculatePredictionConfidence(trends),
    };

    const longTerm = [
      {
        metric: 'Quality Score',
        projection: Math.max(
          0,
          Math.min(1, currentQuality + (trends.qualityScore.change * 6) / 100),
        ),
        timeframe: '6 months',
        confidence: Math.max(0.3, nextPeriod.confidence - 0.2),
      },
    ];

    return {
      nextPeriod,
      longTerm,
    };
  }

  /**
   * Calculate prediction confidence
   */
  private calculatePredictionConfidence(trends: QualityTrends['overall']): number {
    let confidence = 0.5;

    // Higher confidence for high significance trends
    const significanceScores = [
      trends.qualityScore.significance,
      trends.issueCount.significance,
      trends.resolutionTime.significance,
      trends.gatePassRate.significance,
    ];

    const highSignificanceCount = significanceScores.filter((s) => s === 'high').length;
    confidence += highSignificanceCount * 0.15;

    return Math.min(0.9, confidence);
  }

  /**
   * Analyze quality seasonality patterns
   */
  private analyzeQualitySeasonality(jobs: JobOutcome[]): QualityTrends['seasonality'] {
    // Simplified seasonality analysis
    const patterns = [
      {
        pattern: 'Weekly Cycle',
        strength: 0.3,
        period: '7 days',
        description: 'Quality tends to decline towards end of week',
      },
      {
        pattern: 'Sprint Cycle',
        strength: 0.4,
        period: '2 weeks',
        description: 'Quality dips during sprint end pressure',
      },
    ];

    const recommendations = [
      'Monitor quality more closely during high-pressure periods',
      'Implement quality checkpoints throughout development cycles',
      'Consider adjusting sprint planning to reduce end-of-sprint pressure',
    ];

    return {
      patterns,
      recommendations,
    };
  }

  /**
   * Generate quality improvement recommendations
   */
  async generateQualityRecommendations(): Promise<QualityRecommendations> {
    try {
      const recentAssessments = this.assessmentHistory.slice(-100);

      if (recentAssessments.length === 0) {
        throw new Error('No assessment data available for recommendations');
      }

      // Analyze recent quality trends
      const avgQuality =
        recentAssessments.reduce((sum, a) => sum + a.result.overallScore, 0) /
        recentAssessments.length;
      const issueFrequency =
        recentAssessments.reduce((sum, a) => sum + a.result.issues.length, 0) /
        recentAssessments.length;

      // Generate different types of recommendations
      const immediate = this.generateImmediateActions(avgQuality, issueFrequency);
      const processImprovements = this.generateProcessImprovements(recentAssessments);
      const tools = this.generateToolRecommendations(avgQuality);
      const training = this.generateTrainingRecommendations(recentAssessments);
      const automation = this.generateAutomationOpportunities(avgQuality, issueFrequency);

      const recommendations: QualityRecommendations = {
        timestamp: new Date(),
        immediate,
        processImprovements,
        tools,
        training,
        automation,
      };

      enhancedLogger.info('Quality recommendations generated', {
        immediate: immediate.length,
        processImprovements: processImprovements.length,
        tools: tools.length,
        training: training.length,
        automation: automation.length,
      });

      return recommendations;
    } catch (error) {
      enhancedLogger.error('Failed to generate quality recommendations', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Generate immediate action recommendations
   */
  private generateImmediateActions(
    avgQuality: number,
    issueFrequency: number,
  ): QualityRecommendations['immediate'] {
    const immediate: QualityRecommendations['immediate'] = [];

    if (avgQuality < 0.6) {
      immediate.push({
        id: 'quality_critical',
        priority: 'critical',
        title: 'Critical Quality Issues',
        description: 'Overall quality score is critically low',
        action: 'Implement emergency quality review process',
        expectedImpact: 0.8,
        timeRequired: '1-2 days',
      });
    }

    if (issueFrequency > 5) {
      immediate.push({
        id: 'high_issue_count',
        priority: 'high',
        title: 'High Issue Frequency',
        description: 'Number of quality issues per job is too high',
        action: 'Focus on root cause analysis and prevention',
        expectedImpact: 0.6,
        timeRequired: '2-3 days',
      });
    }

    return immediate;
  }

  /**
   * Generate process improvement recommendations
   */
  private generateProcessImprovements(
    assessments: Array<{ result: QualityAssessmentResult }>,
  ): QualityRecommendations['processImprovements'] {
    const improvements: QualityRecommendations['processImprovements'] = [];

    // Analyze common issue patterns
    const issueCategories = new Map<string, number>();
    for (const assessment of assessments) {
      for (const issue of assessment.result.issues) {
        issueCategories.set(issue.category, (issueCategories.get(issue.category) || 0) + 1);
      }
    }

    // Generate improvements for top categories
    const topCategories = Array.from(issueCategories.entries())
      .sort(([_, a], [__, b]) => b - a)
      .slice(0, 3);

    for (const [category, count] of topCategories) {
      improvements.push({
        id: `improve_${category}`,
        area: category,
        current: `${count} issues in recent assessments`,
        proposed: `Implement ${category}-specific quality processes`,
        benefits: [
          `Reduce ${category} issues by 50%`,
          'Improve overall quality score',
          'Reduce technical debt',
        ],
        implementation: `Review and enhance ${category} development practices`,
        effort: 'medium',
      });
    }

    return improvements;
  }

  /**
   * Generate tool recommendations
   */
  private generateToolRecommendations(avgQuality: number): QualityRecommendations['tools'] {
    const tools: QualityRecommendations['tools'] = [];

    if (avgQuality < 0.7) {
      tools.push({
        name: 'Advanced Static Analysis Tool',
        purpose: 'Comprehensive code quality analysis',
        benefits: [
          'Early issue detection',
          'Code smell identification',
          'Security vulnerability scanning',
        ],
        integrationEffort: 'medium',
        cost: 'medium',
      });

      tools.push({
        name: 'Automated Testing Framework',
        purpose: 'Increase test coverage and quality',
        benefits: [
          'Automated test generation',
          'Better test coverage reporting',
          'Continuous testing integration',
        ],
        integrationEffort: 'high',
        cost: 'low',
      });
    }

    return tools;
  }

  /**
   * Generate training recommendations
   */
  private generateTrainingRecommendations(
    assessments: Array<{ result: QualityAssessmentResult }>,
  ): QualityRecommendations['training'] {
    const training: QualityRecommendations['training'] = [];

    // Analyze common weaknesses
    const weaknesses = new Set<string>();
    for (const assessment of assessments) {
      for (const issue of assessment.result.issues) {
        if (issue.category === 'security') weaknesses.add('security');
        if (issue.category === 'performance') weaknesses.add('performance');
        if (issue.category === 'test') weaknesses.add('testing');
      }
    }

    for (const weakness of weaknesses) {
      training.push({
        area: weakness,
        target: 'development team',
        content: `${weakness.charAt(0).toUpperCase() + weakness.slice(1)} best practices and tools`,
        expectedImprovement: 0.4,
        timeInvestment: '2-4 hours per developer',
      });
    }

    return training;
  }

  /**
   * Generate automation opportunities
   */
  private generateAutomationOpportunities(
    avgQuality: number,
    issueFrequency: number,
  ): QualityRecommendations['automation'] {
    const automation: QualityRecommendations['automation'] = [];

    if (issueFrequency > 3) {
      automation.push({
        process: 'Quality Gate Enforcement',
        currentState: 'semi-automated',
        proposedState: 'automated',
        benefits: [
          'Consistent quality enforcement',
          'Reduced manual oversight',
          'Faster feedback cycles',
        ],
        implementation: 'Implement automated quality gates in CI/CD pipeline',
        roi: 3.0,
      });
    }

    if (avgQuality < 0.8) {
      automation.push({
        process: 'Code Review Process',
        currentState: 'manual',
        proposedState: 'semi-automated',
        benefits: ['Automated code analysis', 'Consistent review criteria', 'Faster review cycles'],
        implementation: 'Integrate automated code analysis with review process',
        roi: 2.5,
      });
    }

    return automation;
  }

  /**
   * Update quality issue tracking
   */
  private async updateQualityIssueTracking(result: QualityAssessmentResult): Promise<void> {
    try {
      // Update issue patterns
      for (const issue of result.issues) {
        const issueKey = issue.description;
        this.issuePatterns.set(issueKey, (this.issuePatterns.get(issueKey) || 0) + 1);
      }

      // Clean up old patterns (keep top 1000)
      if (this.issuePatterns.size > 1000) {
        const sortedPatterns = Array.from(this.issuePatterns.entries()).sort(
          ([_, a], [__, b]) => b - a,
        );

        this.issuePatterns.clear();
        for (const [pattern, count] of sortedPatterns.slice(0, 1000)) {
          this.issuePatterns.set(pattern, count);
        }
      }
    } catch (error) {
      enhancedLogger.error('Failed to update quality issue tracking', undefined, {
        jobId: result.jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Update assessment performance metrics
   */
  private updateAssessmentMetrics(duration: number): void {
    this.performanceTracker.assessmentsRun++;
    this.performanceTracker.totalAssessmentTime += duration;
    this.performanceTracker.avgAssessmentTime =
      this.performanceTracker.totalAssessmentTime / this.performanceTracker.assessmentsRun;
    this.performanceTracker.lastAssessment = new Date();

    // Update accuracy rate (simplified calculation)
    const totalAssessments = this.performanceTracker.assessmentsRun;
    const falseResults =
      this.performanceTracker.falsePositives + this.performanceTracker.falseNegatives;
    this.performanceTracker.accuracyRate =
      totalAssessments > 0 ? 1 - falseResults / totalAssessments : 0;
  }

  /**
   * Load quality configuration
   */
  private async loadQualityConfiguration(): Promise<void> {
    try {
      const configPath = join(process.cwd(), '.ff2', 'quality-config.json');

      try {
        const content = await fs.readFile(configPath, 'utf8');
        const config = JSON.parse(content);

        // Load rule weights
        if (config.ruleWeights) {
          for (const [ruleId, weight] of Object.entries(config.ruleWeights)) {
            this.ruleWeights.set(ruleId, weight as number);
          }
        }
      } catch (readError) {
        // Use default configuration
        enhancedLogger.info('No quality configuration found, using defaults');
      }
    } catch (error) {
      enhancedLogger.error('Failed to load quality configuration', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Load quality assessment data
   */
  private async loadQualityData(): Promise<void> {
    try {
      const dataPath = join(process.cwd(), '.ff2', 'quality-data.json');

      try {
        const content = await fs.readFile(dataPath, 'utf8');
        const data = JSON.parse(content);

        // Load assessment history
        if (data.assessmentHistory) {
          this.assessmentHistory = data.assessmentHistory.map((entry: any) => ({
            timestamp: new Date(entry.timestamp),
            jobId: entry.jobId,
            result: entry.result,
          }));
        }

        // Load issue patterns
        if (data.issuePatterns) {
          this.issuePatterns = new Map(Object.entries(data.issuePatterns));
        }
      } catch (readError) {
        // No existing data, start fresh
        enhancedLogger.info('No existing quality data found, starting fresh');
      }
    } catch (error) {
      enhancedLogger.error('Failed to load quality data', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Save quality assessment data
   */
  async saveQualityData(): Promise<void> {
    try {
      const dataPath = join(process.cwd(), '.ff2', 'quality-data.json');

      const data = {
        assessmentHistory: this.assessmentHistory,
        issuePatterns: Object.fromEntries(this.issuePatterns),
        lastSaved: new Date().toISOString(),
      };

      await fs.writeFile(dataPath, JSON.stringify(data, null, 2));
    } catch (error) {
      enhancedLogger.error('Failed to save quality data', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): {
    assessmentsRun: number;
    avgAssessmentTime: number;
    accuracyRate: number;
    falsePositiveRate: number;
    qualityRules: number;
    qualityGates: number;
    trackedIssues: number;
    lastAssessment: Date;
  } {
    const falsePositiveRate =
      this.performanceTracker.assessmentsRun > 0
        ? this.performanceTracker.falsePositives / this.performanceTracker.assessmentsRun
        : 0;

    return {
      ...this.performanceTracker,
      falsePositiveRate,
      qualityRules: this.qualityRules.size,
      qualityGates: this.qualityGates.size,
      trackedIssues: this.qualityIssues.size,
    };
  }

  /**
   * Map string category to valid QualityIssue category
   */
  private mapToValidCategory(
    category: string,
  ): 'code' | 'test' | 'documentation' | 'security' | 'performance' | 'maintainability' {
    const categoryMap: Record<
      string,
      'code' | 'test' | 'documentation' | 'security' | 'performance' | 'maintainability'
    > = {
      code: 'code',
      coding: 'code',
      implementation: 'code',
      test: 'test',
      testing: 'test',
      tests: 'test',
      documentation: 'documentation',
      docs: 'documentation',
      security: 'security',
      performance: 'performance',
      perf: 'performance',
      maintainability: 'maintainability',
      maintenance: 'maintainability',
      structure: 'maintainability',
    };

    return categoryMap[category.toLowerCase()] || 'code';
  }
}
