// Job Memory Management - Per-issue memory handling
// Implements atomic operations for job-specific memory persistence

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
  JobSummary,
  MemoryConfig
} from './types';
import { logger } from '../utils/logger';

/**
 * Job Memory Manager
 * 
 * Handles per-job memory persistence with atomic operations
 * Performance target: <50ms for all operations
 */
export class JobMemoryManager {
  private config: MemoryConfig;
  private activeJobs = new Map<string, JobMemory>();
  private memoryLocks = new Map<string, Promise<void>>();

  constructor(config: MemoryConfig) {
    this.config = config;
  }

  /**
   * Initialize memory for a new job
   * Creates directory structure and initial memory file
   */
  async initializeJobMemory(issueId: string, sessionId: string): Promise<JobMemory> {
    const jobId = this.generateJobId(issueId);
    const startTime = new Date();

    const initialMemory: JobMemory = {
      issueId,
      jobId,
      sessionId,
      startTime,
      status: 'running',
      decisions: [],
      gotchas: [],
      context: [],
      outcomes: [],
      metadata: {
        agentTypes: [],
        complexity: 'low',
        priority: 'medium',
        tags: [],
        relatedIssues: [issueId],
        childJobIds: []
      },
      analytics: {
        patternMatches: [],
        efficiencyMetrics: {
          decisionTime: 0,
          gotchaResolutionTime: 0,
          contextRetrievalTime: 0,
          knowledgeReuseRate: 0,
          errorRate: 0
        },
        learningScore: 0,
        reuseScore: 0,
        innovationScore: 0
      }
    };

    try {
      // Create job directory structure
      await this.ensureJobDirectoryStructure(jobId);
      
      // Save initial memory
      await this.saveJobMemory(initialMemory);
      
      // Cache in active jobs
      this.activeJobs.set(jobId, initialMemory);
      
      // Record in global job log
      await this.recordGlobalJobEntry(initialMemory);
      
      logger.info(`Initialized job memory: ${jobId} for issue ${issueId}`);
      return initialMemory;
    } catch (error) {
      logger.error(`Failed to initialize job memory for ${jobId}:`, error);
      throw new Error(`Failed to initialize job memory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get job memory with caching
   */
  async getJobMemory(jobId: string): Promise<JobMemory | null> {
    // Check active cache first
    if (this.activeJobs.has(jobId)) {
      return this.activeJobs.get(jobId)!;
    }

    try {
      const memoryPath = this.getJobMemoryPath(jobId);
      const exists = await this.fileExists(memoryPath);
      
      if (!exists) {
        return null;
      }

      const data = await fs.readFile(memoryPath, 'utf-8');
      const memory = JSON.parse(data, this.dateReviver) as JobMemory;
      
      // Cache if job is still running
      if (memory.status === 'running') {
        this.activeJobs.set(jobId, memory);
      }
      
      return memory;
    } catch (error) {
      logger.error(`Failed to get job memory ${jobId}:`, error);
      throw new Error(`Failed to get job memory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update job memory with atomic write operations
   */
  async updateJobMemory(jobId: string, updates: Partial<JobMemory>): Promise<JobMemory> {
    return this.withLock(jobId, async () => {
      const currentMemory = await this.getJobMemory(jobId);
      if (!currentMemory) {
        throw new Error(`Job memory not found: ${jobId}`);
      }

      const updatedMemory: JobMemory = {
        ...currentMemory,
        ...updates,
        jobId, // Ensure jobId cannot be changed
        metadata: {
          ...currentMemory.metadata,
          ...(updates.metadata || {})
        },
        analytics: {
          ...currentMemory.analytics,
          ...(updates.analytics || {})
        }
      };

      await this.saveJobMemory(updatedMemory);
      
      // Update cache
      this.activeJobs.set(jobId, updatedMemory);
      
      return updatedMemory;
    });
  }

  /**
   * Complete job memory with final outcome
   */
  async completeJobMemory(jobId: string, finalOutcome: Outcome): Promise<JobMemory> {
    return this.withLock(jobId, async () => {
      const memory = await this.getJobMemory(jobId);
      if (!memory) {
        throw new Error(`Job memory not found: ${jobId}`);
      }

      const endTime = new Date();
      const durationMs = endTime.getTime() - memory.startTime.getTime();
      const duration = Math.max(1, Math.floor(durationMs / 1000 / 60)); // minutes, minimum 1

      // Add final outcome
      const outcomes = [...memory.outcomes, { ...finalOutcome, id: this.generateId('outcome'), timestamp: endTime }];
      
      // Determine final status based on outcomes
      const successfulOutcomes = outcomes.filter(o => o.type === 'success').length;
      const failedOutcomes = outcomes.filter(o => o.type === 'failure').length;
      const status = successfulOutcomes > failedOutcomes ? 'completed' : 'failed';

      const completedMemory: JobMemory = {
        ...memory,
        endTime,
        status,
        outcomes,
        metadata: {
          ...memory.metadata,
          totalDuration: duration
        }
      };

      await this.saveJobMemory(completedMemory);
      
      // Update global job log
      await this.updateGlobalJobEntry(completedMemory);
      
      // Remove from active cache
      this.activeJobs.delete(jobId);
      
      logger.info(`Completed job memory: ${jobId} (${status}) in ${duration} minutes`);
      return completedMemory;
    });
  }

  /**
   * Record a decision in job memory
   */
  async recordDecision(jobId: string, decision: Omit<Decision, 'id' | 'timestamp'>): Promise<Decision> {
    return this.withLock(jobId, async () => {
      const memory = await this.getJobMemory(jobId);
      if (!memory) {
        throw new Error(`Job memory not found: ${jobId}`);
      }

      const newDecision: Decision = {
        ...decision,
        id: this.generateId('decision'),
        timestamp: new Date()
      };

      // Add agent type to metadata if not already present
      if (!memory.metadata.agentTypes.includes(decision.agentType)) {
        memory.metadata.agentTypes.push(decision.agentType);
      }

      memory.decisions.push(newDecision);
      await this.saveJobMemory(memory);
      
      // Update global job log with new agent types
      await this.updateGlobalJobEntry(memory);

      logger.debug(`Recorded decision ${newDecision.id} in job ${jobId}`);
      return newDecision;
    });
  }

  /**
   * Record a gotcha in job memory
   */
  async recordGotcha(jobId: string, gotcha: Omit<Gotcha, 'id' | 'timestamp'>): Promise<Gotcha> {
    return this.withLock(jobId, async () => {
      const memory = await this.getJobMemory(jobId);
      if (!memory) {
        throw new Error(`Job memory not found: ${jobId}`);
      }

      const newGotcha: Gotcha = {
        ...gotcha,
        id: this.generateId('gotcha'),
        timestamp: new Date()
      };

      // Add agent type to metadata if not already present
      if (!memory.metadata.agentTypes.includes(gotcha.agentType)) {
        memory.metadata.agentTypes.push(gotcha.agentType);
      }

      memory.gotchas.push(newGotcha);
      await this.saveJobMemory(memory);
      
      // Update global job log with new agent types
      await this.updateGlobalJobEntry(memory);

      logger.debug(`Recorded gotcha ${newGotcha.id} in job ${jobId}`);
      return newGotcha;
    });
  }

  /**
   * Record context entry in job memory
   */
  async recordContext(jobId: string, context: Omit<ContextEntry, 'id' | 'timestamp' | 'usage'>): Promise<ContextEntry> {
    return this.withLock(jobId, async () => {
      const memory = await this.getJobMemory(jobId);
      if (!memory) {
        throw new Error(`Job memory not found: ${jobId}`);
      }

      const newContext: ContextEntry = {
        ...context,
        id: this.generateId('context'),
        timestamp: new Date(),
        usage: []
      };

      // Add agent type to metadata if not already present
      if (!memory.metadata.agentTypes.includes(context.agentType)) {
        memory.metadata.agentTypes.push(context.agentType);
      }

      memory.context.push(newContext);
      await this.saveJobMemory(memory);

      logger.debug(`Recorded context ${newContext.id} in job ${jobId}`);
      return newContext;
    });
  }

  /**
   * Record outcome in job memory
   */
  async recordOutcome(jobId: string, outcome: Omit<Outcome, 'id' | 'timestamp'>): Promise<Outcome> {
    return this.withLock(jobId, async () => {
      const memory = await this.getJobMemory(jobId);
      if (!memory) {
        throw new Error(`Job memory not found: ${jobId}`);
      }

      const newOutcome: Outcome = {
        ...outcome,
        id: this.generateId('outcome'),
        timestamp: new Date()
      };

      // Add agent type to metadata if not already present
      if (!memory.metadata.agentTypes.includes(outcome.agentType)) {
        memory.metadata.agentTypes.push(outcome.agentType);
      }

      memory.outcomes.push(newOutcome);
      await this.saveJobMemory(memory);

      logger.debug(`Recorded outcome ${newOutcome.id} in job ${jobId}`);
      return newOutcome;
    });
  }

  /**
   * Resolve a gotcha with solution
   */
  async resolveGotcha(jobId: string, gotchaId: string, resolution: GotchaResolution): Promise<Gotcha> {
    return this.withLock(jobId, async () => {
      const memory = await this.getJobMemory(jobId);
      if (!memory) {
        throw new Error(`Job memory not found: ${jobId}`);
      }

      const gotcha = memory.gotchas.find(g => g.id === gotchaId);
      if (!gotcha) {
        throw new Error(`Gotcha not found: ${gotchaId}`);
      }

      gotcha.resolution = {
        ...resolution,
        timestamp: new Date()
      };

      await this.saveJobMemory(memory);

      logger.debug(`Resolved gotcha ${gotchaId} in job ${jobId}`);
      return gotcha;
    });
  }

  /**
   * Update decision outcome
   */
  async updateDecisionOutcome(jobId: string, decisionId: string, outcome: DecisionOutcome): Promise<Decision> {
    return this.withLock(jobId, async () => {
      const memory = await this.getJobMemory(jobId);
      if (!memory) {
        throw new Error(`Job memory not found: ${jobId}`);
      }

      const decision = memory.decisions.find(d => d.id === decisionId);
      if (!decision) {
        throw new Error(`Decision not found: ${decisionId}`);
      }

      decision.outcome = {
        ...outcome,
        timestamp: new Date()
      };

      await this.saveJobMemory(memory);

      logger.debug(`Updated decision outcome ${decisionId} in job ${jobId}`);
      return decision;
    });
  }

  /**
   * Track context usage
   */
  async trackContextUsage(jobId: string, contextId: string, usage: Omit<ContextUsage, 'timestamp'>): Promise<void> {
    return this.withLock(jobId, async () => {
      const memory = await this.getJobMemory(jobId);
      if (!memory) {
        throw new Error(`Job memory not found: ${jobId}`);
      }

      const context = memory.context.find(c => c.id === contextId);
      if (!context) {
        throw new Error(`Context not found: ${contextId}`);
      }

      context.usage.push({
        ...usage,
        timestamp: new Date()
      });

      await this.saveJobMemory(memory);

      logger.debug(`Tracked context usage ${contextId} in job ${jobId}`);
    });
  }

  /**
   * Get jobs by issue ID
   */
  async getJobsByIssue(issueId: string): Promise<GlobalJobEntry[]> {
    try {
      const globalLog = await this.getGlobalJobLog();
      return globalLog.filter(entry => entry.issueId === issueId);
    } catch (error) {
      logger.error(`Failed to get jobs for issue ${issueId}:`, error);
      throw new Error(`Failed to get jobs by issue: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get jobs by agent type
   */
  async getJobsByAgent(agentType: string): Promise<GlobalJobEntry[]> {
    try {
      const globalLog = await this.getGlobalJobLog();
      return globalLog.filter(entry => entry.agentTypes.includes(agentType));
    } catch (error) {
      logger.error(`Failed to get jobs for agent ${agentType}:`, error);
      throw new Error(`Failed to get jobs by agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get global job log
   */
  async getGlobalJobLog(): Promise<GlobalJobEntry[]> {
    try {
      const globalLogPath = this.getGlobalJobLogPath();
      const exists = await this.fileExists(globalLogPath);
      
      if (!exists) {
        return [];
      }

      const data = await fs.readFile(globalLogPath, 'utf-8');
      const lines = data.trim().split('\n').filter(line => line);
      
      return lines.map(line => JSON.parse(line, this.dateReviver) as GlobalJobEntry);
    } catch (error) {
      logger.error('Failed to get global job log:', error);
      throw new Error(`Failed to get global job log: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Archive job memory (compress and move to archive)
   */
  async archiveJobMemory(jobId: string): Promise<void> {
    try {
      const memory = await this.getJobMemory(jobId);
      if (!memory) {
        throw new Error(`Job memory not found: ${jobId}`);
      }

      // Create archive directory
      const archivePath = path.join(this.config.storageBasePath, 'archive');
      await fs.mkdir(archivePath, { recursive: true });

      // Compress and save to archive
      const archivedMemory = this.compressJobMemory(memory);
      const archiveFilePath = path.join(archivePath, `${jobId}.json`);
      await fs.writeFile(archiveFilePath, JSON.stringify(archivedMemory, null, 2));

      // Remove original
      const originalPath = this.getJobMemoryPath(jobId);
      await fs.unlink(originalPath);

      // Remove job directory if empty
      const jobDir = this.getJobDirectoryPath(jobId);
      try {
        await fs.rmdir(jobDir);
      } catch {
        // Directory not empty, keep it
      }

      // Remove from cache
      this.activeJobs.delete(jobId);

      logger.info(`Archived job memory: ${jobId}`);
    } catch (error) {
      logger.error(`Failed to archive job memory ${jobId}:`, error);
      throw new Error(`Failed to archive job memory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Cleanup old job memories
   */
  async cleanup(): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

      const globalLog = await this.getGlobalJobLog();
      const oldJobs = globalLog.filter(entry => entry.endTime && entry.endTime < cutoffDate);

      let cleanedCount = 0;
      for (const job of oldJobs) {
        try {
          await this.archiveJobMemory(job.jobId);
          cleanedCount++;
        } catch (error) {
          logger.warn(`Failed to archive job ${job.jobId}:`, error);
        }
      }

      // Update global job log
      const remainingJobs = globalLog.filter(entry => !entry.endTime || entry.endTime >= cutoffDate);
      await this.saveGlobalJobLog(remainingJobs);

      logger.info(`Cleaned up ${cleanedCount} old job memories`);
      return cleanedCount;
    } catch (error) {
      logger.error('Failed to cleanup job memories:', error);
      throw new Error(`Failed to cleanup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ==================== Private Helper Methods ====================

  private async withLock<T>(jobId: string, operation: () => Promise<T>): Promise<T> {
    // Wait for any existing lock
    const existingLock = this.memoryLocks.get(jobId);
    if (existingLock) {
      await existingLock;
    }

    // Create new lock
    let resolveLock: () => void;
    const lockPromise = new Promise<void>(resolve => {
      resolveLock = resolve;
    });
    this.memoryLocks.set(jobId, lockPromise);

    try {
      const result = await operation();
      return result;
    } finally {
      // Release lock
      this.memoryLocks.delete(jobId);
      resolveLock!();
    }
  }

  private async saveJobMemory(memory: JobMemory): Promise<void> {
    const filePath = this.getJobMemoryPath(memory.jobId);
    const tempPath = `${filePath}.tmp`;
    
    try {
      // Write to temp file first for atomic operation
      await fs.writeFile(tempPath, JSON.stringify(memory, null, 2));
      
      // Rename to actual file (atomic on most filesystems)
      await fs.rename(tempPath, filePath);
    } catch (error) {
      // Cleanup temp file if it exists
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  private async ensureJobDirectoryStructure(jobId: string): Promise<void> {
    const jobDir = this.getJobDirectoryPath(jobId);
    const logDir = path.join(jobDir, 'logs');
    
    await Promise.all([
      fs.mkdir(jobDir, { recursive: true }),
      fs.mkdir(logDir, { recursive: true })
    ]);
  }

  private async recordGlobalJobEntry(memory: JobMemory): Promise<void> {
    const entry: GlobalJobEntry = {
      jobId: memory.jobId,
      issueId: memory.issueId,
      title: `Job ${memory.jobId}`, // TODO: Get actual issue title
      status: memory.status,
      agentTypes: memory.metadata.agentTypes,
      startTime: memory.startTime,
      success: memory.status === 'completed',
      summary: this.calculateJobSummary(memory)
    };

    await this.appendGlobalJobEntry(entry);
  }

  private async updateGlobalJobEntry(memory: JobMemory): Promise<void> {
    try {
      const globalLog = await this.getGlobalJobLog();
      const entryIndex = globalLog.findIndex(entry => entry.jobId === memory.jobId);
      
      if (entryIndex === -1) {
        // Entry doesn't exist, create it
        await this.recordGlobalJobEntry(memory);
        return;
      }

      // Update existing entry
      const entry = globalLog[entryIndex];
      entry.status = memory.status;
      entry.endTime = memory.endTime;
      entry.duration = memory.metadata.totalDuration;
      entry.success = memory.status === 'completed';
      entry.summary = this.calculateJobSummary(memory);
      entry.agentTypes = memory.metadata.agentTypes;

      await this.saveGlobalJobLog(globalLog);
    } catch (error) {
      logger.error(`Failed to update global job entry for ${memory.jobId}:`, error);
      // Don't throw - this is non-critical
    }
  }

  private async appendGlobalJobEntry(entry: GlobalJobEntry): Promise<void> {
    const globalLogPath = this.getGlobalJobLogPath();
    const line = JSON.stringify(entry) + '\n';
    
    try {
      await fs.appendFile(globalLogPath, line);
    } catch (error) {
      // If file doesn't exist, create it
      await fs.writeFile(globalLogPath, line);
    }
  }

  private async saveGlobalJobLog(entries: GlobalJobEntry[]): Promise<void> {
    const globalLogPath = this.getGlobalJobLogPath();
    const lines = entries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
    await fs.writeFile(globalLogPath, lines);
  }

  private calculateJobSummary(memory: JobMemory): JobSummary {
    const resolvedGotchas = memory.gotchas.filter(g => g.resolution?.resolved).length;
    const successfulOutcomes = memory.outcomes.filter(o => o.type === 'success').length;
    
    return {
      decisionsCount: memory.decisions.length,
      gotchasCount: memory.gotchas.length,
      resolvedGotchas,
      contextEntriesCount: memory.context.length,
      outcomesCount: memory.outcomes.length,
      successfulOutcomes,
      keyLearnings: [], // TODO: Extract key learnings
      promotedGotchas: [] // TODO: Track promoted gotchas
    };
  }

  private compressJobMemory(memory: JobMemory): Partial<JobMemory> {
    // Remove detailed logs and keep only essential data for archival
    return {
      ...memory,
      // Keep only high-level summaries for context entries
      context: memory.context.map(c => ({
        ...c,
        content: c.content.length > 500 ? c.content.substring(0, 500) + '...' : c.content
      }))
    };
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private generateJobId(issueId: string): string {
    return `job-${issueId}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  }

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getJobDirectoryPath(jobId: string): string {
    const issueId = jobId.split('-')[1]; // Extract issue ID from job ID
    return path.join(this.config.storageBasePath, 'issues', issueId);
  }

  private getJobMemoryPath(jobId: string): string {
    return path.join(this.getJobDirectoryPath(jobId), 'memory.json');
  }

  private getGlobalJobLogPath(): string {
    return path.join(this.config.storageBasePath, 'jobs.ndjson');
  }

  private dateReviver(key: string, value: unknown): unknown {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      return new Date(value);
    }
    return value;
  }
}