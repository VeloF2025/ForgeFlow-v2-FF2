// Memory Layer Manager - Core orchestration for job memory and analytics
// Implements the Memory Layer (Layer 2) architecture with atomic operations

import { promises as fs } from 'fs';
import * as path from 'path';
import {
  JobMemory,
  Decision,
  Gotcha,
  ContextEntry,
  Outcome,
  GotchaResolution,
  DecisionOutcome,
  ContextUsage,
  GlobalJobEntry,
  MemoryInsights,
  PatternMatch,
  PatternQuery,
  MemoryConfig,
  IMemoryManager
} from './types';
import { JobMemoryManager } from './job-memory';
import { RuntimeLogger } from './runtime-logger';
import { MemoryAnalytics } from './memory-analytics';
import { KnowledgeManager } from '../knowledge/knowledge-manager';
import { logger } from '../utils/logger';

/**
 * Memory Manager - Core orchestrator for the Memory Layer
 * 
 * Provides centralized access to:
 * - Job Memory Management (per-issue memory persistence)
 * - Runtime Logging (structured event logging)
 * - Memory Analytics (pattern analysis and insights)
 * - Knowledge Layer Integration (gotcha promotion)
 * 
 * Performance Target: <50ms for all operations
 * Quality Target: Zero data loss with atomic operations
 */
export class MemoryManager implements IMemoryManager {
  private config: MemoryConfig;
  private jobMemoryManager: JobMemoryManager;
  private runtimeLogger: RuntimeLogger;
  private memoryAnalytics: MemoryAnalytics;
  private knowledgeManager?: KnowledgeManager;
  private initialized = false;

  constructor(config: MemoryConfig, knowledgeManager?: KnowledgeManager) {
    this.config = config;
    this.jobMemoryManager = new JobMemoryManager(config);
    this.runtimeLogger = new RuntimeLogger(config);
    this.memoryAnalytics = new MemoryAnalytics(config);
    this.knowledgeManager = knowledgeManager;
  }

  /**
   * Initialize the Memory Layer
   * Creates directory structure and loads existing data
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const startTime = Date.now();
    
    try {
      logger.info('Initializing Memory Layer');
      
      // Ensure directory structure exists
      await this.ensureDirectoryStructure();
      
      // Initialize subsystems in parallel
      await Promise.all([
        this.runtimeLogger.initialize(),
        this.memoryAnalytics.initialize()
      ]);

      this.initialized = true;
      
      const duration = Date.now() - startTime;
      logger.info(`Memory Layer initialized successfully in ${duration}ms`);
      
      // Validate performance target
      if (duration > this.config.performanceThresholds.memoryOperationTimeMs) {
        logger.warn(`Memory Layer initialization took ${duration}ms (target: ${this.config.performanceThresholds.memoryOperationTimeMs}ms)`);
      }
    } catch (error) {
      logger.error('Failed to initialize Memory Layer:', error);
      throw new Error(`Memory Layer initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ==================== Job Memory Lifecycle ====================

  /**
   * Initialize memory for a new job
   * @param issueId GitHub issue ID
   * @param sessionId Current session identifier
   * @returns Promise resolving to initialized job memory
   */
  async initializeJobMemory(issueId: string, sessionId: string): Promise<JobMemory> {
    this.ensureInitialized();
    
    const startTime = Date.now();
    
    try {
      // Log job initialization
      await this.runtimeLogger.info('job_memory_init', {
        issueId,
        sessionId,
        timestamp: new Date().toISOString()
      });

      const jobMemory = await this.jobMemoryManager.initializeJobMemory(issueId, sessionId);
      
      const duration = Date.now() - startTime;
      logger.debug(`Initialized job memory ${jobMemory.jobId} in ${duration}ms`);
      
      return jobMemory;
    } catch (error) {
      logger.error(`Failed to initialize job memory for issue ${issueId}:`, error);
      
      // Log error
      await this.runtimeLogger.error('job_memory_init_failed', {
        issueId,
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });
      
      throw new Error(`Failed to initialize job memory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get job memory by ID
   * @param jobId Job identifier
   * @returns Promise resolving to job memory or null if not found
   */
  async getJobMemory(jobId: string): Promise<JobMemory | null> {
    this.ensureInitialized();
    
    const startTime = Date.now();
    
    try {
      const memory = await this.jobMemoryManager.getJobMemory(jobId);
      
      const duration = Date.now() - startTime;
      if (duration > this.config.performanceThresholds.memoryOperationTimeMs) {
        logger.warn(`Job memory retrieval took ${duration}ms for ${jobId} (target: ${this.config.performanceThresholds.memoryOperationTimeMs}ms)`);
      }
      
      return memory;
    } catch (error) {
      logger.error(`Failed to get job memory ${jobId}:`, error);
      throw new Error(`Failed to get job memory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update job memory with partial updates
   * @param jobId Job identifier
   * @param updates Partial job memory updates
   * @returns Promise resolving to updated job memory
   */
  async updateJobMemory(jobId: string, updates: Partial<JobMemory>): Promise<JobMemory> {
    this.ensureInitialized();
    
    const startTime = Date.now();
    
    try {
      // Log update operation
      await this.runtimeLogger.debug('job_memory_update', {
        jobId,
        updateKeys: Object.keys(updates),
        timestamp: new Date().toISOString()
      });

      const updatedMemory = await this.jobMemoryManager.updateJobMemory(jobId, updates);
      
      const duration = Date.now() - startTime;
      logger.debug(`Updated job memory ${jobId} in ${duration}ms`);
      
      return updatedMemory;
    } catch (error) {
      logger.error(`Failed to update job memory ${jobId}:`, error);
      
      // Log error
      await this.runtimeLogger.error('job_memory_update_failed', {
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });
      
      throw new Error(`Failed to update job memory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Complete job memory with final outcome
   * @param jobId Job identifier
   * @param finalOutcome Final outcome data
   * @returns Promise resolving to completed job memory
   */
  async completeJobMemory(jobId: string, finalOutcome: Outcome): Promise<JobMemory> {
    this.ensureInitialized();
    
    const startTime = Date.now();
    
    try {
      // Log job completion
      await this.runtimeLogger.info('job_memory_complete', {
        jobId,
        outcomeType: finalOutcome.type,
        timestamp: new Date().toISOString()
      });

      const completedMemory = await this.jobMemoryManager.completeJobMemory(jobId, finalOutcome);
      
      // Calculate analytics after completion
      if (this.config.analyticsEnabled) {
        try {
          await this.calculateJobAnalytics(jobId);
        } catch (analyticsError) {
          logger.warn(`Failed to calculate analytics for completed job ${jobId}:`, analyticsError);
          // Don't fail the completion due to analytics errors
        }
      }
      
      // Auto-promote gotchas if enabled
      if (this.config.autoPromoteGotchas && this.knowledgeManager && completedMemory.gotchas.length > 0) {
        try {
          await this.autoPromoteGotchas(completedMemory);
        } catch (promotionError) {
          logger.warn(`Failed to auto-promote gotchas for job ${jobId}:`, promotionError);
          // Don't fail the completion due to promotion errors
        }
      }
      
      const duration = Date.now() - startTime;
      logger.info(`Completed job memory ${jobId} in ${duration}ms`);
      
      return completedMemory;
    } catch (error) {
      logger.error(`Failed to complete job memory ${jobId}:`, error);
      
      // Log error
      await this.runtimeLogger.error('job_memory_complete_failed', {
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });
      
      throw new Error(`Failed to complete job memory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ==================== Memory Components ====================

  /**
   * Record a decision in job memory
   * @param jobId Job identifier
   * @param decision Decision data without system-generated fields
   * @returns Promise resolving to created decision
   */
  async recordDecision(jobId: string, decision: Omit<Decision, 'id' | 'timestamp'>): Promise<Decision> {
    this.ensureInitialized();
    
    try {
      // Log decision recording
      await this.runtimeLogger.debug('decision_recorded', {
        jobId,
        agentType: decision.agentType,
        category: decision.category,
        description: decision.description.substring(0, 100) + '...'
      });

      return await this.jobMemoryManager.recordDecision(jobId, decision);
    } catch (error) {
      logger.error(`Failed to record decision in job ${jobId}:`, error);
      throw new Error(`Failed to record decision: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Record a gotcha in job memory
   * @param jobId Job identifier
   * @param gotcha Gotcha data without system-generated fields
   * @returns Promise resolving to created gotcha
   */
  async recordGotcha(jobId: string, gotcha: Omit<Gotcha, 'id' | 'timestamp'>): Promise<Gotcha> {
    this.ensureInitialized();
    
    try {
      // Log gotcha recording
      await this.runtimeLogger.warn('gotcha_recorded', {
        jobId,
        agentType: gotcha.agentType,
        severity: gotcha.severity,
        category: gotcha.category,
        description: gotcha.description.substring(0, 100) + '...'
      });

      return await this.jobMemoryManager.recordGotcha(jobId, gotcha);
    } catch (error) {
      logger.error(`Failed to record gotcha in job ${jobId}:`, error);
      throw new Error(`Failed to record gotcha: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Record context entry in job memory
   * @param jobId Job identifier
   * @param context Context data without system-generated fields
   * @returns Promise resolving to created context entry
   */
  async recordContext(jobId: string, context: Omit<ContextEntry, 'id' | 'timestamp' | 'usage'>): Promise<ContextEntry> {
    this.ensureInitialized();
    
    try {
      // Log context recording
      await this.runtimeLogger.debug('context_recorded', {
        jobId,
        agentType: context.agentType,
        type: context.type,
        source: context.source,
        relevanceScore: context.relevanceScore
      });

      return await this.jobMemoryManager.recordContext(jobId, context);
    } catch (error) {
      logger.error(`Failed to record context in job ${jobId}:`, error);
      throw new Error(`Failed to record context: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Record outcome in job memory
   * @param jobId Job identifier
   * @param outcome Outcome data without system-generated fields
   * @returns Promise resolving to created outcome
   */
  async recordOutcome(jobId: string, outcome: Omit<Outcome, 'id' | 'timestamp'>): Promise<Outcome> {
    this.ensureInitialized();
    
    try {
      // Log outcome recording
      await this.runtimeLogger.info('outcome_recorded', {
        jobId,
        agentType: outcome.agentType,
        type: outcome.type,
        category: outcome.category,
        description: outcome.description.substring(0, 100) + '...'
      });

      return await this.jobMemoryManager.recordOutcome(jobId, outcome);
    } catch (error) {
      logger.error(`Failed to record outcome in job ${jobId}:`, error);
      throw new Error(`Failed to record outcome: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ==================== Updates and Resolution ====================

  /**
   * Resolve a gotcha with solution
   * @param jobId Job identifier
   * @param gotchaId Gotcha identifier
   * @param resolution Resolution data
   * @returns Promise resolving to updated gotcha
   */
  async resolveGotcha(jobId: string, gotchaId: string, resolution: GotchaResolution): Promise<Gotcha> {
    this.ensureInitialized();
    
    try {
      // Log gotcha resolution
      await this.runtimeLogger.info('gotcha_resolved', {
        jobId,
        gotchaId,
        resolved: resolution.resolved,
        resolutionTime: resolution.resolutionTime,
        confidence: resolution.confidence
      });

      return await this.jobMemoryManager.resolveGotcha(jobId, gotchaId, resolution);
    } catch (error) {
      logger.error(`Failed to resolve gotcha ${gotchaId} in job ${jobId}:`, error);
      throw new Error(`Failed to resolve gotcha: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update decision outcome
   * @param jobId Job identifier
   * @param decisionId Decision identifier
   * @param outcome Outcome data
   * @returns Promise resolving to updated decision
   */
  async updateDecisionOutcome(jobId: string, decisionId: string, outcome: DecisionOutcome): Promise<Decision> {
    this.ensureInitialized();
    
    try {
      // Log decision outcome update
      await this.runtimeLogger.debug('decision_outcome_updated', {
        jobId,
        decisionId,
        success: outcome.success,
        codeQuality: outcome.metrics.codeQuality,
        testCoverage: outcome.metrics.testCoverage
      });

      return await this.jobMemoryManager.updateDecisionOutcome(jobId, decisionId, outcome);
    } catch (error) {
      logger.error(`Failed to update decision outcome ${decisionId} in job ${jobId}:`, error);
      throw new Error(`Failed to update decision outcome: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Track context usage
   * @param jobId Job identifier
   * @param contextId Context identifier
   * @param usage Usage data
   */
  async trackContextUsage(jobId: string, contextId: string, usage: Omit<ContextUsage, 'timestamp'>): Promise<void> {
    this.ensureInitialized();
    
    try {
      // Log context usage
      await this.runtimeLogger.debug('context_usage_tracked', {
        jobId,
        contextId,
        decisionId: usage.decisionId,
        gotchaId: usage.gotchaId,
        impact: usage.impact
      });

      await this.jobMemoryManager.trackContextUsage(jobId, contextId, usage);
    } catch (error) {
      logger.error(`Failed to track context usage ${contextId} in job ${jobId}:`, error);
      throw new Error(`Failed to track context usage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ==================== Analytics and Insights ====================

  /**
   * Calculate analytics for a specific job
   * @param jobId Job identifier
   * @returns Promise resolving to job analytics
   */
  async calculateJobAnalytics(jobId: string): Promise<import('./types').JobAnalytics> {
    this.ensureInitialized();
    
    const startTime = Date.now();
    
    try {
      const analytics = await this.memoryAnalytics.calculateJobAnalytics(jobId);
      
      const duration = Date.now() - startTime;
      if (duration > this.config.performanceThresholds.analyticsCalculationTimeMs) {
        logger.warn(`Analytics calculation took ${duration}ms for ${jobId} (target: ${this.config.performanceThresholds.analyticsCalculationTimeMs}ms)`);
      }
      
      return analytics;
    } catch (error) {
      logger.error(`Failed to calculate analytics for job ${jobId}:`, error);
      throw new Error(`Failed to calculate analytics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get comprehensive insights for a job
   * @param jobId Job identifier
   * @returns Promise resolving to memory insights
   */
  async getMemoryInsights(jobId: string): Promise<MemoryInsights> {
    this.ensureInitialized();
    
    try {
      return await this.memoryAnalytics.getMemoryInsights(jobId);
    } catch (error) {
      logger.error(`Failed to get memory insights for job ${jobId}:`, error);
      throw new Error(`Failed to get memory insights: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search for similar patterns across jobs
   * @param pattern Pattern query criteria
   * @returns Promise resolving to pattern matches
   */
  async searchSimilarPatterns(pattern: PatternQuery): Promise<PatternMatch[]> {
    this.ensureInitialized();
    
    try {
      return await this.memoryAnalytics.searchSimilarPatterns(pattern);
    } catch (error) {
      logger.error('Failed to search similar patterns:', error);
      throw new Error(`Failed to search patterns: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ==================== Global Tracking ====================

  /**
   * Get global job log
   * @returns Promise resolving to all job entries
   */
  async getGlobalJobLog(): Promise<GlobalJobEntry[]> {
    this.ensureInitialized();
    
    try {
      return await this.jobMemoryManager.getGlobalJobLog();
    } catch (error) {
      logger.error('Failed to get global job log:', error);
      throw new Error(`Failed to get global job log: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get jobs by issue ID
   * @param issueId Issue identifier
   * @returns Promise resolving to filtered job entries
   */
  async getJobsByIssue(issueId: string): Promise<GlobalJobEntry[]> {
    this.ensureInitialized();
    
    try {
      return await this.jobMemoryManager.getJobsByIssue(issueId);
    } catch (error) {
      logger.error(`Failed to get jobs for issue ${issueId}:`, error);
      throw new Error(`Failed to get jobs by issue: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get jobs by agent type
   * @param agentType Agent type filter
   * @returns Promise resolving to filtered job entries
   */
  async getJobsByAgent(agentType: string): Promise<GlobalJobEntry[]> {
    this.ensureInitialized();
    
    try {
      return await this.jobMemoryManager.getJobsByAgent(agentType);
    } catch (error) {
      logger.error(`Failed to get jobs for agent ${agentType}:`, error);
      throw new Error(`Failed to get jobs by agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ==================== Maintenance ====================

  /**
   * Cleanup old data and optimize storage
   */
  async cleanup(): Promise<void> {
    this.ensureInitialized();
    
    try {
      logger.info('Starting Memory Layer cleanup');
      
      const startTime = Date.now();
      
      // Cleanup subsystems in parallel
      const [jobsCleanedCount, logsCleanedCount] = await Promise.all([
        this.jobMemoryManager.cleanup(),
        this.runtimeLogger.cleanupLogs(this.config.logRetentionDays)
      ]);
      
      const duration = Date.now() - startTime;
      
      logger.info(`Memory Layer cleanup completed in ${duration}ms: ${jobsCleanedCount} jobs, ${logsCleanedCount} logs`);
      
      // Log cleanup operation
      await this.runtimeLogger.info('memory_layer_cleanup', {
        jobsCleanedCount,
        logsCleanedCount,
        duration,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to cleanup Memory Layer:', error);
      throw new Error(`Failed to cleanup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Compress old memories to save storage space
   * @param daysOld Age threshold for compression
   * @returns Promise resolving to number of compressed memories
   */
  async compressOldMemories(daysOld: number): Promise<number> {
    this.ensureInitialized();
    
    try {
      // Implementation will be added based on config.compressionEnabled
      if (!this.config.compressionEnabled) {
        logger.info('Memory compression is disabled');
        return 0;
      }
      
      // TODO: Implement compression logic
      logger.info(`Memory compression not yet implemented (${daysOld} days threshold)`);
      return 0;
    } catch (error) {
      logger.error(`Failed to compress old memories (${daysOld} days):`, error);
      throw new Error(`Failed to compress memories: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Archive job memory
   * @param jobId Job identifier
   */
  async archiveJobMemory(jobId: string): Promise<void> {
    this.ensureInitialized();
    
    try {
      await this.jobMemoryManager.archiveJobMemory(jobId);
      
      // Log archival
      await this.runtimeLogger.info('job_memory_archived', {
        jobId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error(`Failed to archive job memory ${jobId}:`, error);
      throw new Error(`Failed to archive job memory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ==================== Private Helper Methods ====================

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Memory Layer not initialized. Call initialize() first.');
    }
  }

  private async ensureDirectoryStructure(): Promise<void> {
    const dirs = [
      this.config.storageBasePath,
      path.join(this.config.storageBasePath, 'issues'),
      path.join(this.config.storageBasePath, 'logs'),
      path.join(this.config.storageBasePath, 'analytics'),
      path.join(this.config.storageBasePath, 'archive')
    ];

    await Promise.all(
      dirs.map(dir => fs.mkdir(dir, { recursive: true }))
    );
  }

  private async autoPromoteGotchas(memory: JobMemory): Promise<void> {
    if (!this.knowledgeManager) {
      logger.warn('Knowledge Manager not available for gotcha promotion');
      return;
    }

    try {
      // Find gotchas that should be promoted (critical/high severity, resolved)
      const promotionCandidates = memory.gotchas.filter(gotcha => 
        (gotcha.severity === 'critical' || gotcha.severity === 'high') &&
        gotcha.resolution?.resolved === true &&
        gotcha.resolution.confidence >= 0.8
      );

      for (const gotcha of promotionCandidates) {
        try {
          // Create gotcha pattern for knowledge manager
          const gotchaPattern = {
            description: gotcha.description,
            pattern: gotcha.errorPattern,
            severity: gotcha.severity,
            category: gotcha.category,
            solution: gotcha.resolution?.solution,
            preventionSteps: gotcha.resolution?.preventionSteps || [],
            occurrences: [{
              issueId: memory.issueId,
              agentType: gotcha.agentType,
              timestamp: gotcha.timestamp,
              resolved: true,
              resolutionTime: gotcha.resolution?.resolutionTime || 0
            }]
          };

          await this.knowledgeManager.recordGotcha(gotchaPattern);
          
          logger.info(`Auto-promoted gotcha ${gotcha.id} from job ${memory.jobId}`);
        } catch (promotionError) {
          logger.warn(`Failed to promote gotcha ${gotcha.id}:`, promotionError);
        }
      }
    } catch (error) {
      logger.error(`Failed to auto-promote gotchas for job ${memory.jobId}:`, error);
    }
  }
}