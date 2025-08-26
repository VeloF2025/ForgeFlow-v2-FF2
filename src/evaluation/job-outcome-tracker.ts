// Job Outcome Tracker - Comprehensive job logging with structured NDJSON format
// High-performance logging infrastructure with <10ms overhead target

import { promises as fs } from 'fs';
import { join } from 'path';
import type { WriteStream } from 'fs';
import { createWriteStream } from 'fs';
import { createHash } from 'crypto';
import type { JobOutcome, JobOutcomeFilters, TimeRange, EvaluationConfig } from './types';
import {
  JobMetadata,
  JobMetrics,
  JobContext,
  PatternData,
  QualityMetrics,
  LearningMetrics,
} from './types';
import { enhancedLogger } from '../utils/enhanced-logger';

export class JobOutcomeTracker {
  private config: EvaluationConfig;
  private logStream: WriteStream | null = null;
  private writeQueue: Array<{ data: string; timestamp: Date }> = [];
  private isWriting = false;
  private metricsCache = new Map<string, any>();
  private performanceTracker = {
    writeCount: 0,
    totalWriteTime: 0,
    avgWriteTime: 0,
    lastWrite: new Date(),
  };

  constructor(config: EvaluationConfig) {
    this.config = config;
    this.initializeLogging();
  }

  /**
   * Initialize logging infrastructure
   */
  private async initializeLogging(): Promise<void> {
    try {
      // Ensure .ff2 directory exists
      const ff2Dir = join(process.cwd(), '.ff2');
      await fs.mkdir(ff2Dir, { recursive: true });

      // Initialize jobs log file path
      const jobsLogPath = join(ff2Dir, 'jobs.ndjson');

      // Create write stream with performance optimization
      this.logStream = createWriteStream(jobsLogPath, {
        flags: 'a', // append mode
        encoding: 'utf8',
        highWaterMark: 64 * 1024, // 64KB buffer
      });

      // Handle stream events
      this.logStream.on('error', (error) => {
        enhancedLogger.error('Job outcome log stream error', undefined, { error: error.message });
      });

      this.logStream.on('drain', () => {
        this.processWriteQueue();
      });

      enhancedLogger.info('Job outcome tracker initialized', {
        logPath: jobsLogPath,
        bufferSize: '64KB',
      });
    } catch (error) {
      enhancedLogger.error('Failed to initialize job outcome tracker', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Log job outcome with high performance (<10ms target)
   */
  async logJobOutcome(outcome: JobOutcome): Promise<void> {
    const startTime = performance.now();

    try {
      // Validate outcome data
      this.validateJobOutcome(outcome);

      // Enhance outcome with computed fields
      const enhancedOutcome = this.enhanceJobOutcome(outcome);

      // Create NDJSON line
      const ndjsonLine = JSON.stringify(enhancedOutcome) + '\n';

      // Queue for async writing
      this.writeQueue.push({
        data: ndjsonLine,
        timestamp: new Date(),
      });

      // Process queue if not already processing
      if (!this.isWriting) {
        this.processWriteQueue();
      }

      // Update performance metrics
      const duration = performance.now() - startTime;
      this.updatePerformanceMetrics(duration);

      // Check performance threshold
      if (duration > this.config.performanceThresholds.jobLoggingMs) {
        enhancedLogger.warn('Job logging exceeded performance threshold', {
          duration,
          threshold: this.config.performanceThresholds.jobLoggingMs,
          jobId: outcome.jobId,
        });
      }

      enhancedLogger.debug('Job outcome logged', {
        jobId: outcome.jobId,
        duration,
        queueLength: this.writeQueue.length,
      });
    } catch (error) {
      enhancedLogger.error('Failed to log job outcome', undefined, {
        jobId: outcome.jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Process write queue asynchronously
   */
  private async processWriteQueue(): Promise<void> {
    if (this.isWriting || this.writeQueue.length === 0 || !this.logStream) {
      return;
    }

    this.isWriting = true;

    try {
      // Process all queued writes in batch
      const writes = [...this.writeQueue];
      this.writeQueue = [];

      for (const write of writes) {
        const writeSuccessful = this.logStream.write(write.data);

        if (!writeSuccessful) {
          // Stream buffer is full, wait for drain
          await new Promise<void>((resolve) => {
            this.logStream.once('drain', () => resolve());
          });
        }
      }

      // Force flush for real-time logging
      if (this.logStream.writable) {
        await new Promise<void>((resolve, reject) => {
          this.logStream.write('', (error) => {
            if (error) reject(error);
            else resolve();
          });
        });
      }
    } catch (error) {
      enhancedLogger.error('Failed to process write queue', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
        queueLength: this.writeQueue.length,
      });
    } finally {
      this.isWriting = false;

      // Process any additional writes that were queued during processing
      if (this.writeQueue.length > 0) {
        setImmediate(() => this.processWriteQueue());
      }
    }
  }

  /**
   * Validate job outcome data integrity
   */
  private validateJobOutcome(outcome: JobOutcome): void {
    const requiredFields = ['jobId', 'issueId', 'executionId', 'timestamp', 'success', 'status'];

    for (const field of requiredFields) {
      if (!(field in outcome) || outcome[field as keyof JobOutcome] === undefined) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate timestamp
    if (!(outcome.timestamp instanceof Date) || isNaN(outcome.timestamp.getTime())) {
      throw new Error('Invalid timestamp');
    }

    // Validate job ID format
    if (typeof outcome.jobId !== 'string' || outcome.jobId.length === 0) {
      throw new Error('Invalid job ID');
    }

    // Validate status
    const validStatuses = ['completed', 'failed', 'partial', 'cancelled', 'error'];
    if (!validStatuses.includes(outcome.status)) {
      throw new Error(`Invalid status: ${outcome.status}`);
    }
  }

  /**
   * Enhance job outcome with computed fields
   */
  private enhanceJobOutcome(outcome: JobOutcome): JobOutcome & {
    _id: string;
    _version: string;
    _computedFields: {
      hash: string;
      size: number;
      indexableText: string;
    };
  } {
    // Generate unique ID
    const id = this.generateOutcomeId(outcome);

    // Calculate data hash for integrity
    const hash = this.calculateDataHash(outcome);

    // Generate indexable text for search
    const indexableText = this.generateIndexableText(outcome);

    // Calculate data size
    const size = JSON.stringify(outcome).length;

    return {
      ...outcome,
      _id: id,
      _version: '1.0',
      _computedFields: {
        hash,
        size,
        indexableText,
      },
    };
  }

  /**
   * Generate unique outcome ID
   */
  private generateOutcomeId(outcome: JobOutcome): string {
    const components = [
      outcome.jobId,
      outcome.issueId,
      outcome.executionId,
      outcome.timestamp.toISOString(),
    ];

    return createHash('sha256').update(components.join('|')).digest('hex').substring(0, 16);
  }

  /**
   * Calculate data hash for integrity checking
   */
  private calculateDataHash(outcome: JobOutcome): string {
    const dataString = JSON.stringify(outcome, Object.keys(outcome).sort());
    return createHash('sha256').update(dataString).digest('hex');
  }

  /**
   * Generate indexable text for search capabilities
   */
  private generateIndexableText(outcome: JobOutcome): string {
    const searchableFields = [
      outcome.metadata.category,
      outcome.metadata.complexity,
      outcome.metadata.agentTypes.join(' '),
      outcome.context.projectType,
      outcome.context.knowledgeCards.map((card) => card.title).join(' '),
      outcome.patterns.successPatterns.map((p) => p.description).join(' '),
      outcome.patterns.failurePatterns.map((p) => p.description).join(' '),
      outcome.quality.issues.map((issue) => issue.description).join(' '),
    ];

    return searchableFields
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Update performance tracking metrics
   */
  private updatePerformanceMetrics(duration: number): void {
    this.performanceTracker.writeCount++;
    this.performanceTracker.totalWriteTime += duration;
    this.performanceTracker.avgWriteTime =
      this.performanceTracker.totalWriteTime / this.performanceTracker.writeCount;
    this.performanceTracker.lastWrite = new Date();
  }

  /**
   * Get job outcome by ID
   */
  async getJobOutcome(jobId: string): Promise<JobOutcome | null> {
    try {
      const outcomes = await this.getJobOutcomes({
        limit: 1,
        offset: 0,
      });

      return outcomes.find((outcome) => outcome.jobId === jobId) || null;
    } catch (error) {
      enhancedLogger.error('Failed to get job outcome', undefined, {
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get job outcomes with filtering and pagination
   */
  async getJobOutcomes(filters: JobOutcomeFilters = {}): Promise<JobOutcome[]> {
    try {
      const jobsLogPath = join(process.cwd(), '.ff2', 'jobs.ndjson');

      // Check if log file exists
      try {
        await fs.access(jobsLogPath);
      } catch {
        return []; // No outcomes logged yet
      }

      // Read and parse NDJSON file
      const content = await fs.readFile(jobsLogPath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);

      let outcomes: JobOutcome[] = [];

      for (const line of lines) {
        try {
          const outcome = JSON.parse(line) as JobOutcome;
          outcomes.push(outcome);
        } catch (parseError) {
          enhancedLogger.warn('Failed to parse job outcome line', {
            error: parseError instanceof Error ? parseError.message : 'Unknown error',
          });
        }
      }

      // Apply filters
      outcomes = this.applyFilters(outcomes, filters);

      // Apply pagination
      const offset = filters.offset || 0;
      const limit = filters.limit || 100;

      return outcomes.slice(offset, offset + limit);
    } catch (error) {
      enhancedLogger.error('Failed to get job outcomes', undefined, {
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Apply filters to job outcomes
   */
  private applyFilters(outcomes: JobOutcome[], filters: JobOutcomeFilters): JobOutcome[] {
    return outcomes
      .filter((outcome) => {
        // Time range filter
        if (filters.timeRange) {
          const outcomeTime = new Date(outcome.timestamp);
          if (outcomeTime < filters.timeRange.start || outcomeTime > filters.timeRange.end) {
            return false;
          }
        }

        // Success filter
        if (filters.success !== undefined && outcome.success !== filters.success) {
          return false;
        }

        // Agent types filter
        if (filters.agentTypes && filters.agentTypes.length > 0) {
          const hasMatchingAgent = outcome.metadata.agentTypes.some((agent) =>
            filters.agentTypes.includes(agent),
          );
          if (!hasMatchingAgent) {
            return false;
          }
        }

        // Category filter
        if (filters.categories && filters.categories.length > 0) {
          if (!filters.categories.includes(outcome.metadata.category)) {
            return false;
          }
        }

        // Complexity filter
        if (filters.complexities && filters.complexities.length > 0) {
          if (!filters.complexities.includes(outcome.metadata.complexity)) {
            return false;
          }
        }

        // Quality score filter
        if (filters.minQualityScore !== undefined) {
          if (outcome.quality.overallScore < filters.minQualityScore) {
            return false;
          }
        }

        // Duration filter
        if (filters.maxDuration !== undefined && outcome.metadata.duration) {
          if (outcome.metadata.duration > filters.maxDuration) {
            return false;
          }
        }

        // Issue IDs filter
        if (filters.issueIds && filters.issueIds.length > 0) {
          if (!filters.issueIds.includes(outcome.issueId)) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        // Sort by timestamp descending (newest first)
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): {
    writeCount: number;
    avgWriteTime: number;
    totalWriteTime: number;
    lastWrite: Date;
    queueLength: number;
    isWithinThreshold: boolean;
  } {
    return {
      ...this.performanceTracker,
      queueLength: this.writeQueue.length,
      isWithinThreshold:
        this.performanceTracker.avgWriteTime <= this.config.performanceThresholds.jobLoggingMs,
    };
  }

  /**
   * Get job outcome statistics
   */
  async getStatistics(timeRange?: TimeRange): Promise<{
    totalJobs: number;
    successfulJobs: number;
    failedJobs: number;
    avgDuration: number;
    avgQualityScore: number;
    categoryCounts: Record<string, number>;
    agentTypeCounts: Record<string, number>;
    complexityCounts: Record<string, number>;
  }> {
    try {
      const outcomes = await this.getJobOutcomes({
        timeRange,
        limit: 10000, // Get all within time range
      });

      const stats = {
        totalJobs: outcomes.length,
        successfulJobs: outcomes.filter((o) => o.success).length,
        failedJobs: outcomes.filter((o) => !o.success).length,
        avgDuration: 0,
        avgQualityScore: 0,
        categoryCounts: {} as Record<string, number>,
        agentTypeCounts: {} as Record<string, number>,
        complexityCounts: {} as Record<string, number>,
      };

      if (outcomes.length > 0) {
        // Calculate averages
        const totalDuration = outcomes
          .filter((o) => o.metadata.duration)
          .reduce((sum, o) => sum + (o.metadata.duration || 0), 0);
        const jobsWithDuration = outcomes.filter((o) => o.metadata.duration).length;
        stats.avgDuration = jobsWithDuration > 0 ? totalDuration / jobsWithDuration : 0;

        stats.avgQualityScore =
          outcomes.reduce((sum, o) => sum + o.quality.overallScore, 0) / outcomes.length;

        // Count by category
        outcomes.forEach((outcome) => {
          const category = outcome.metadata.category;
          stats.categoryCounts[category] = (stats.categoryCounts[category] || 0) + 1;

          const complexity = outcome.metadata.complexity;
          stats.complexityCounts[complexity] = (stats.complexityCounts[complexity] || 0) + 1;

          outcome.metadata.agentTypes.forEach((agentType) => {
            stats.agentTypeCounts[agentType] = (stats.agentTypeCounts[agentType] || 0) + 1;
          });
        });
      }

      return stats;
    } catch (error) {
      enhancedLogger.error('Failed to get job outcome statistics', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Export job outcomes to different formats
   */
  async exportOutcomes(
    timeRange: TimeRange,
    format: 'json' | 'csv' = 'json',
    outputPath?: string,
  ): Promise<string> {
    try {
      const outcomes = await this.getJobOutcomes({
        timeRange,
        limit: 50000, // Large export limit
      });

      let exportData: string;
      let fileExtension: string;

      if (format === 'json') {
        exportData = JSON.stringify(outcomes, null, 2);
        fileExtension = 'json';
      } else {
        exportData = this.convertToCSV(outcomes);
        fileExtension = 'csv';
      }

      // Generate output path if not provided
      if (!outputPath) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        outputPath = join(process.cwd(), '.ff2', `job-outcomes-${timestamp}.${fileExtension}`);
      }

      // Write export file
      await fs.writeFile(outputPath, exportData, 'utf8');

      enhancedLogger.info('Job outcomes exported', {
        format,
        outputPath,
        count: outcomes.length,
        timeRange,
      });

      return outputPath;
    } catch (error) {
      enhancedLogger.error('Failed to export job outcomes', undefined, {
        format,
        timeRange,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Convert outcomes to CSV format
   */
  private convertToCSV(outcomes: JobOutcome[]): string {
    if (outcomes.length === 0) {
      return '';
    }

    // Define CSV headers
    const headers = [
      'jobId',
      'issueId',
      'executionId',
      'timestamp',
      'success',
      'status',
      'category',
      'complexity',
      'agentTypes',
      'duration',
      'overallScore',
      'codeQuality',
      'testCoverage',
      'maintainability',
      'security',
      'performance',
      'linesAdded',
      'linesRemoved',
      'filesModified',
      'learningGenerated',
    ];

    // Create CSV content
    const csvLines = [headers.join(',')];

    for (const outcome of outcomes) {
      const row = [
        this.escapeCsvValue(outcome.jobId),
        this.escapeCsvValue(outcome.issueId),
        this.escapeCsvValue(outcome.executionId),
        this.escapeCsvValue(outcome.timestamp.toISOString()),
        outcome.success,
        this.escapeCsvValue(outcome.status),
        this.escapeCsvValue(outcome.metadata.category),
        this.escapeCsvValue(outcome.metadata.complexity),
        this.escapeCsvValue(outcome.metadata.agentTypes.join(';')),
        outcome.metadata.duration || 0,
        outcome.quality.overallScore,
        outcome.quality.components.codeQuality,
        outcome.quality.components.testQuality,
        outcome.quality.components.maintainability,
        outcome.quality.components.security,
        outcome.quality.components.performance,
        outcome.metrics.codeChanges.linesAdded,
        outcome.metrics.codeChanges.linesRemoved,
        outcome.metrics.codeChanges.filesModified,
        outcome.learning.learningGenerated,
      ];

      csvLines.push(row.join(','));
    }

    return csvLines.join('\n');
  }

  /**
   * Escape CSV values
   */
  private escapeCsvValue(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }

    const stringValue = String(value);

    // Escape quotes and wrap in quotes if necessary
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
  }

  /**
   * Clean up old job outcomes
   */
  async cleanup(olderThanDays: number): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const allOutcomes = await this.getJobOutcomes({ limit: 50000 });
      const recentOutcomes = allOutcomes.filter(
        (outcome) => new Date(outcome.timestamp) >= cutoffDate,
      );

      // Rewrite the log file with only recent outcomes
      const jobsLogPath = join(process.cwd(), '.ff2', 'jobs.ndjson');
      const ndjsonContent = recentOutcomes.map((outcome) => JSON.stringify(outcome)).join('\n');

      await fs.writeFile(jobsLogPath, ndjsonContent + (ndjsonContent ? '\n' : ''), 'utf8');

      const removedCount = allOutcomes.length - recentOutcomes.length;

      enhancedLogger.info('Job outcomes cleaned up', {
        removedCount,
        retainedCount: recentOutcomes.length,
        cutoffDate,
      });

      return removedCount;
    } catch (error) {
      enhancedLogger.error('Failed to cleanup job outcomes', undefined, {
        olderThanDays,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Close logging resources
   */
  async close(): Promise<void> {
    try {
      // Process any remaining writes
      if (this.writeQueue.length > 0) {
        await this.processWriteQueue();
      }

      // Close log stream
      if (this.logStream && !this.logStream.destroyed) {
        await new Promise<void>((resolve, reject) => {
          this.logStream.end((error) => {
            if (error) reject(error);
            else resolve();
          });
        });
      }

      enhancedLogger.info('Job outcome tracker closed', {
        finalStats: this.getPerformanceStats(),
      });
    } catch (error) {
      enhancedLogger.error('Failed to close job outcome tracker', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}

// Utility functions for creating job outcomes
export const JobOutcomeBuilder = {
  /**
   * Create a new job outcome with defaults
   */
  create(jobId: string, issueId: string, executionId: string): JobOutcome {
    return {
      jobId,
      issueId,
      executionId,
      timestamp: new Date(),
      success: false,
      status: 'completed',

      metadata: {
        agentTypes: [],
        pattern: '',
        phase: '',
        priority: 'medium',
        startTime: new Date(),
        category: 'feature',
        complexity: 'medium',
        parentJobId: undefined,
        childJobIds: [],
        githubData: {
          labels: [],
        },
      },

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
        resources: {
          memoryUsage: 0,
          cpuUsage: 0,
          diskUsage: 0,
          networkRequests: 0,
        },
      },

      context: {
        projectId: '',
        projectPath: '',
        projectType: '',
        knowledgeCards: [],
        similarJobs: [],
        environment: {
          operatingSystem: process.platform,
          dependencies: {},
        },
        userContext: {
          userInput: '',
          requestType: '',
          urgency: 'medium',
        },
      },

      patterns: {
        successPatterns: [],
        failurePatterns: [],
        decisionPatterns: [],
        antiPatterns: [],
      },

      quality: {
        overallScore: 0,
        components: {
          codeQuality: 0,
          testQuality: 0,
          documentation: 0,
          maintainability: 0,
          security: 0,
          performance: 0,
        },
        gatesPassed: 0,
        gatesTotal: 0,
        gatesSkipped: 0,
        issues: [],
        improvements: [],
      },

      learning: {
        learningGenerated: 0,
        knowledgeReused: 0,
        adaptabilityShown: 0,
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
  },

  /**
   * Mark job as successful
   */
  markSuccess(outcome: JobOutcome, qualityScore: number = 0.8): JobOutcome {
    return {
      ...outcome,
      success: true,
      status: 'completed',
      metadata: {
        ...outcome.metadata,
        endTime: new Date(),
        duration: outcome.metadata.startTime
          ? Date.now() - outcome.metadata.startTime.getTime()
          : 0,
      },
      quality: {
        ...outcome.quality,
        overallScore: qualityScore,
      },
    };
  },

  /**
   * Mark job as failed
   */
  markFailure(outcome: JobOutcome, reason: string, qualityScore: number = 0.3): JobOutcome {
    return {
      ...outcome,
      success: false,
      status: 'failed',
      metadata: {
        ...outcome.metadata,
        endTime: new Date(),
        duration: outcome.metadata.startTime
          ? Date.now() - outcome.metadata.startTime.getTime()
          : 0,
      },
      quality: {
        ...outcome.quality,
        overallScore: qualityScore,
        issues: [
          ...outcome.quality.issues,
          {
            type: 'error',
            category: 'execution',
            description: reason,
            severity: 3,
            fixed: false,
          },
        ],
      },
    };
  },
};
