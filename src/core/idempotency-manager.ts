/**
 * Idempotency Manager for ForgeFlow v2
 * Ensures operations can be safely repeated without side effects
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { createHash } from 'crypto';
import { LogContext } from '../utils/logger';

export interface IdempotencyKey {
  operation: string;
  parameters: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface IdempotencyRecord {
  key: string;
  operation: string;
  parameters: Record<string, unknown>;
  context?: Record<string, unknown>;
  status: 'pending' | 'completed' | 'failed' | 'rolled_back';
  result?: unknown;
  error?: string;
  startTime: number;
  endTime?: number;
  attempts: number;
  lastAttemptTime: number;
  rollbackData?: unknown;
}

export interface IdempotencyOptions {
  storePath?: string;
  maxAge?: number; // milliseconds, default 24 hours
  maxAttempts?: number; // default 3
  retryBackoff?: number; // milliseconds, default 1000
}

export class IdempotencyManager {
  private static readonly DEFAULT_OPTIONS: Required<Omit<IdempotencyOptions, 'storePath'>> = {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    maxAttempts: 3,
    retryBackoff: 1000,
  };

  private storePath: string;
  private logger: LogContext;
  private records: Map<string, IdempotencyRecord> = new Map();

  constructor(options: IdempotencyOptions = {}) {
    this.storePath = options.storePath || path.join('.ff2-worktrees', 'idempotency');
    this.logger = new LogContext('IdempotencyManager');
    
    // Initialize storage and load existing records
    this.initializeStorage();
  }

  /**
   * Generate idempotency key from operation parameters
   */
  generateKey(keyData: IdempotencyKey): string {
    const normalizedData = {
      operation: keyData.operation,
      parameters: this.normalizeParameters(keyData.parameters),
      context: keyData.context ? this.normalizeParameters(keyData.context) : undefined,
    };

    const keyString = JSON.stringify(normalizedData);
    return createHash('sha256').update(keyString).digest('hex').substring(0, 16);
  }

  /**
   * Check if operation should be executed or has already been completed
   */
  async shouldExecute(keyData: IdempotencyKey): Promise<{
    execute: boolean;
    record?: IdempotencyRecord;
    reason: string;
  }> {
    const key = this.generateKey(keyData);
    await this.loadRecord(key);
    
    const record = this.records.get(key);
    
    if (!record) {
      return {
        execute: true,
        reason: 'No previous execution found',
      };
    }

    // Check if record is too old
    if (this.isRecordStale(record)) {
      await this.removeRecord(key);
      return {
        execute: true,
        reason: 'Previous record expired',
      };
    }

    switch (record.status) {
      case 'completed':
        return {
          execute: false,
          record,
          reason: 'Operation already completed successfully',
        };

      case 'pending':
        // Check if operation might be stuck
        const timeSinceStart = Date.now() - record.startTime;
        if (timeSinceStart > 10 * 60 * 1000) { // 10 minutes
          this.logger.warning(`Pending operation appears stuck: ${key}, resetting`);
          await this.removeRecord(key);
          return {
            execute: true,
            reason: 'Stuck pending operation reset',
          };
        }
        
        return {
          execute: false,
          record,
          reason: 'Operation currently in progress',
        };

      case 'failed':
        if (record.attempts >= IdempotencyManager.DEFAULT_OPTIONS.maxAttempts) {
          return {
            execute: false,
            record,
            reason: 'Maximum retry attempts exceeded',
          };
        }

        // Check retry backoff
        const timeSinceLastAttempt = Date.now() - record.lastAttemptTime;
        const backoffTime = IdempotencyManager.DEFAULT_OPTIONS.retryBackoff * Math.pow(2, record.attempts - 1);
        
        if (timeSinceLastAttempt < backoffTime) {
          return {
            execute: false,
            record,
            reason: `Retry backoff period not elapsed (${backoffTime - timeSinceLastAttempt}ms remaining)`,
          };
        }

        return {
          execute: true,
          record,
          reason: 'Retrying after failure',
        };

      case 'rolled_back':
        return {
          execute: true,
          record,
          reason: 'Previous operation was rolled back',
        };

      default:
        return {
          execute: true,
          reason: 'Unknown record status',
        };
    }
  }

  /**
   * Start tracking an operation
   */
  async startOperation(keyData: IdempotencyKey, rollbackData?: unknown): Promise<string> {
    const key = this.generateKey(keyData);
    const existingRecord = this.records.get(key);

    const record: IdempotencyRecord = {
      key,
      operation: keyData.operation,
      parameters: keyData.parameters,
      context: keyData.context,
      status: 'pending',
      startTime: Date.now(),
      attempts: (existingRecord?.attempts || 0) + 1,
      lastAttemptTime: Date.now(),
      rollbackData,
    };

    this.records.set(key, record);
    await this.saveRecord(key, record);

    this.logger.info(`Started operation: ${keyData.operation}, key: ${key}, attempt: ${record.attempts}`);
    return key;
  }

  /**
   * Mark operation as completed
   */
  async completeOperation(key: string, result?: unknown): Promise<void> {
    const record = this.records.get(key);
    if (!record) {
      throw new Error(`No operation record found for key: ${key}`);
    }

    record.status = 'completed';
    record.endTime = Date.now();
    record.result = result;

    await this.saveRecord(key, record);
    
    const duration = record.endTime - record.startTime;
    this.logger.info(`Completed operation: ${record.operation}, key: ${key}, duration: ${duration}ms`);
  }

  /**
   * Mark operation as failed
   */
  async failOperation(key: string, error: Error | string): Promise<void> {
    const record = this.records.get(key);
    if (!record) {
      throw new Error(`No operation record found for key: ${key}`);
    }

    record.status = 'failed';
    record.endTime = Date.now();
    record.error = error instanceof Error ? error.message : error;

    await this.saveRecord(key, record);
    
    const duration = record.endTime - record.startTime;
    this.logger.error(`Failed operation: ${record.operation}, key: ${key}, attempt: ${record.attempts}, duration: ${duration}ms, error: ${record.error}`);
  }

  /**
   * Rollback operation and optionally execute rollback function
   */
  async rollbackOperation(key: string, rollbackFn?: (data?: unknown) => Promise<void>): Promise<void> {
    const record = this.records.get(key);
    if (!record) {
      throw new Error(`No operation record found for key: ${key}`);
    }

    try {
      if (rollbackFn && record.rollbackData) {
        await rollbackFn(record.rollbackData);
        this.logger.info(`Executed rollback function for operation: ${record.operation}, key: ${key}`);
      }

      record.status = 'rolled_back';
      record.endTime = Date.now();

      await this.saveRecord(key, record);
      this.logger.info(`Rolled back operation: ${record.operation}, key: ${key}`);

    } catch (error) {
      this.logger.error(`Rollback failed for operation: ${record.operation}, key: ${key}`, error);
      throw new Error(`Rollback failed: ${String(error)}`);
    }
  }

  /**
   * Get operation record
   */
  async getRecord(key: string): Promise<IdempotencyRecord | null> {
    await this.loadRecord(key);
    return this.records.get(key) || null;
  }

  /**
   * Get all records for an operation type
   */
  async getOperationRecords(operation: string): Promise<IdempotencyRecord[]> {
    await this.loadAllRecords();
    
    const records: IdempotencyRecord[] = [];
    this.records.forEach((record) => {
      if (record.operation === operation) {
        records.push(record);
      }
    });
    return records;
  }

  /**
   * Clean up old records
   */
  async cleanup(maxAge?: number): Promise<number> {
    const ageThreshold = maxAge || IdempotencyManager.DEFAULT_OPTIONS.maxAge;
    const cutoffTime = Date.now() - ageThreshold;
    
    await this.loadAllRecords();
    
    let cleanedCount = 0;
    const keysToRemove: string[] = [];
    this.records.forEach((record, key) => {
      if (record.startTime < cutoffTime && record.status !== 'pending') {
        keysToRemove.push(key);
      }
    });
    
    for (const key of keysToRemove) {
      await this.removeRecord(key);
      cleanedCount++;
    }

    this.logger.info(`Cleaned up ${cleanedCount} old idempotency records`);
    return cleanedCount;
  }

  /**
   * Get statistics about idempotency records
   */
  async getStats(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byOperation: Record<string, number>;
    avgDuration: number;
    successRate: number;
  }> {
    await this.loadAllRecords();
    
    const records: IdempotencyRecord[] = [];
    this.records.forEach((record) => {
      records.push(record);
    });
    const byStatus: Record<string, number> = {};
    const byOperation: Record<string, number> = {};
    let totalDuration = 0;
    let completedCount = 0;

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      byStatus[record.status] = (byStatus[record.status] || 0) + 1;
      byOperation[record.operation] = (byOperation[record.operation] || 0) + 1;
      
      if (record.endTime) {
        totalDuration += record.endTime - record.startTime;
        if (record.status === 'completed') {
          completedCount++;
        }
      }
    }

    const avgDuration = records.length > 0 ? totalDuration / records.length : 0;
    const successRate = records.length > 0 ? (completedCount / records.length) * 100 : 0;

    return {
      total: records.length,
      byStatus,
      byOperation,
      avgDuration,
      successRate,
    };
  }

  /**
   * Initialize storage directory
   */
  private async initializeStorage(): Promise<void> {
    try {
      await fs.ensureDir(this.storePath);
      this.logger.debug(`Idempotency storage initialized: ${this.storePath}`);
    } catch (error) {
      this.logger.error('Failed to initialize idempotency storage', error);
      throw new Error(`Storage initialization failed: ${String(error)}`);
    }
  }

  /**
   * Load a specific record from storage
   */
  private async loadRecord(key: string): Promise<void> {
    if (this.records.has(key)) {
      return; // Already loaded
    }

    try {
      const recordPath = path.join(this.storePath, `${key}.json`);
      if (await fs.pathExists(recordPath)) {
        const recordData = await fs.readJson(recordPath);
        this.records.set(key, recordData);
      }
    } catch (error) {
      this.logger.debug(`Failed to load record ${key}`, error);
    }
  }

  /**
   * Load all records from storage
   */
  private async loadAllRecords(): Promise<void> {
    try {
      if (!(await fs.pathExists(this.storePath))) {
        return;
      }

      const files = await fs.readdir(this.storePath);
      const jsonFiles = files.filter(file => file.endsWith('.json'));

      for (const file of jsonFiles) {
        const key = path.basename(file, '.json');
        if (!this.records.has(key)) {
          await this.loadRecord(key);
        }
      }
    } catch (error) {
      this.logger.error('Failed to load records from storage', error);
    }
  }

  /**
   * Save record to storage
   */
  private async saveRecord(key: string, record: IdempotencyRecord): Promise<void> {
    try {
      const recordPath = path.join(this.storePath, `${key}.json`);
      await fs.writeJson(recordPath, record, { spaces: 2 });
    } catch (error) {
      this.logger.error(`Failed to save record ${key}`, error);
      throw new Error(`Failed to save idempotency record: ${String(error)}`);
    }
  }

  /**
   * Remove record from storage and memory
   */
  private async removeRecord(key: string): Promise<void> {
    try {
      const recordPath = path.join(this.storePath, `${key}.json`);
      await fs.remove(recordPath);
      this.records.delete(key);
    } catch (error) {
      this.logger.debug(`Failed to remove record ${key}`, error);
    }
  }

  /**
   * Check if record is stale
   */
  private isRecordStale(record: IdempotencyRecord): boolean {
    const age = Date.now() - record.startTime;
    return age > IdempotencyManager.DEFAULT_OPTIONS.maxAge;
  }

  /**
   * Normalize parameters for consistent key generation
   */
  private normalizeParameters(params: Record<string, unknown>): Record<string, unknown> {
    const normalized: Record<string, unknown> = {};
    
    // Sort keys for consistent ordering
    const sortedKeys = Object.keys(params).sort();
    
    for (const key of sortedKeys) {
      const value = params[key];
      
      // Normalize common types
      if (value === null || value === undefined) {
        normalized[key] = null;
      } else if (typeof value === 'object') {
        normalized[key] = this.normalizeParameters(value as Record<string, unknown>);
      } else {
        normalized[key] = value;
      }
    }

    return normalized;
  }
}