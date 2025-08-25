/**
 * Platform-agnostic file locking implementation for worktree operations
 * Prevents concurrent operations that could corrupt git state
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { LogContext } from '../utils/logger';

export interface LockOptions {
  timeout?: number; // milliseconds, default 30000
  retryInterval?: number; // milliseconds, default 100
  maxRetries?: number; // default 300 (30 seconds with 100ms intervals)
  staleThreshold?: number; // milliseconds, default 300000 (5 minutes)
}

export interface LockInfo {
  id: string;
  pid: number;
  hostname: string;
  timestamp: number;
  operation: string;
  metadata?: Record<string, unknown>;
}

export class FileLock {
  private static readonly DEFAULT_OPTIONS: Required<LockOptions> = {
    timeout: 30000,
    retryInterval: 100,
    maxRetries: 300,
    staleThreshold: 300000,
  };

  private lockPath: string;
  private lockId: string;
  private logger: LogContext;
  private isLocked: boolean = false;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(lockFilePath: string, private operation: string, private metadata?: Record<string, unknown>) {
    this.lockPath = path.resolve(lockFilePath);
    this.lockId = randomUUID();
    this.logger = new LogContext(`FileLock:${operation}`);
  }

  /**
   * Acquire the lock with optional configuration
   */
  async acquire(options: LockOptions = {}): Promise<void> {
    const opts = { ...FileLock.DEFAULT_OPTIONS, ...options };
    
    this.logger.debug(`Attempting to acquire lock: ${this.lockPath}`);
    
    let attempts = 0;
    const startTime = Date.now();

    while (attempts < opts.maxRetries) {
      try {
        // Check if we can acquire the lock
        if (await this.tryAcquire()) {
          this.isLocked = true;
          this.setupCleanupTimer(opts.staleThreshold);
          this.logger.info(`Lock acquired: ${this.lockId} for operation: ${this.operation}`);
          return;
        }

        // Check for timeout
        if (Date.now() - startTime >= opts.timeout) {
          throw new Error(`Lock timeout after ${opts.timeout}ms for operation: ${this.operation}`);
        }

        // Check for stale locks
        await this.cleanupStaleLock(opts.staleThreshold);

        // Wait before retry
        await this.sleep(opts.retryInterval);
        attempts++;

      } catch (error) {
        this.logger.error(`Failed to acquire lock attempt ${attempts + 1}`, error);
        throw new Error(`Lock acquisition failed: ${String(error)}`);
      }
    }

    throw new Error(`Failed to acquire lock after ${opts.maxRetries} attempts for operation: ${this.operation}`);
  }

  /**
   * Release the lock
   */
  async release(): Promise<void> {
    if (!this.isLocked) {
      this.logger.debug('Lock already released or never acquired');
      return;
    }

    try {
      // Clear cleanup timer
      if (this.cleanupTimer) {
        clearTimeout(this.cleanupTimer);
        this.cleanupTimer = undefined;
      }

      // Verify we own the lock before releasing
      if (await this.verifyOwnership()) {
        await fs.remove(this.lockPath);
        this.logger.info(`Lock released: ${this.lockId}`);
      } else {
        this.logger.warning(`Cannot release lock - ownership verification failed: ${this.lockId}`);
      }

    } catch (error) {
      this.logger.error(`Failed to release lock: ${this.lockId}`, error);
      throw new Error(`Lock release failed: ${String(error)}`);
    } finally {
      this.isLocked = false;
    }
  }

  /**
   * Check if the lock is currently held by this instance
   */
  isHeld(): boolean {
    return this.isLocked;
  }

  /**
   * Get information about the current lock holder
   */
  async getLockInfo(): Promise<LockInfo | null> {
    try {
      if (!(await fs.pathExists(this.lockPath))) {
        return null;
      }

      const lockContent = await fs.readFile(this.lockPath, 'utf-8');
      return JSON.parse(lockContent) as LockInfo;
    } catch (error) {
      this.logger.debug('Failed to read lock info', error);
      return null;
    }
  }

  /**
   * Force remove a lock file (use with caution)
   */
  async forceRelease(): Promise<void> {
    try {
      if (await fs.pathExists(this.lockPath)) {
        await fs.remove(this.lockPath);
        this.logger.warning(`Force released lock: ${this.lockPath}`);
      }
      this.isLocked = false;
    } catch (error) {
      this.logger.error('Failed to force release lock', error);
      throw new Error(`Force release failed: ${String(error)}`);
    }
  }

  /**
   * Try to acquire the lock atomically
   */
  private async tryAcquire(): Promise<boolean> {
    try {
      // Ensure lock directory exists
      await fs.ensureDir(path.dirname(this.lockPath));

      const lockInfo: LockInfo = {
        id: this.lockId,
        pid: process.pid,
        hostname: require('os').hostname(),
        timestamp: Date.now(),
        operation: this.operation,
        metadata: this.metadata,
      };

      // Use exclusive file creation as atomic lock mechanism
      // This will fail if the file already exists
      await fs.writeFile(this.lockPath, JSON.stringify(lockInfo, null, 2), { flag: 'wx' });
      return true;

    } catch (error: any) {
      if (error.code === 'EEXIST') {
        // Lock file already exists
        return false;
      }
      throw error;
    }
  }

  /**
   * Verify that we still own the lock
   */
  private async verifyOwnership(): Promise<boolean> {
    try {
      const lockInfo = await this.getLockInfo();
      return lockInfo?.id === this.lockId;
    } catch {
      return false;
    }
  }

  /**
   * Clean up stale locks based on timestamp and process existence
   */
  private async cleanupStaleLock(staleThreshold: number): Promise<void> {
    try {
      const lockInfo = await this.getLockInfo();
      
      if (!lockInfo) {
        return;
      }

      const age = Date.now() - lockInfo.timestamp;
      
      // Check if lock is stale based on time
      if (age > staleThreshold) {
        // Try to determine if the process is still running
        if (await this.isProcessStale(lockInfo.pid)) {
          this.logger.warning(`Removing stale lock: ${lockInfo.id}, age: ${age}ms, pid: ${lockInfo.pid}`);
          await fs.remove(this.lockPath);
        }
      }
    } catch (error) {
      this.logger.debug('Failed to cleanup stale lock', error);
    }
  }

  /**
   * Check if a process is still running (cross-platform)
   */
  private async isProcessStale(pid: number): Promise<boolean> {
    try {
      // On Unix-like systems, sending signal 0 checks if process exists
      // On Windows, this will throw if process doesn't exist
      process.kill(pid, 0);
      return false; // Process is still running
    } catch (error: any) {
      // ESRCH means process not found, so it's stale
      // EPERM means we don't have permission but process exists
      return error.code === 'ESRCH';
    }
  }

  /**
   * Set up automatic cleanup timer
   */
  private setupCleanupTimer(staleThreshold: number): void {
    // Set timer for half the stale threshold to refresh our lock
    const refreshInterval = Math.max(staleThreshold / 2, 30000); // At least 30 seconds
    
    this.cleanupTimer = setTimeout(async () => {
      if (this.isLocked) {
        try {
          // Refresh lock timestamp by updating the file
          const lockInfo = await this.getLockInfo();
          if (lockInfo && lockInfo.id === this.lockId) {
            lockInfo.timestamp = Date.now();
            await fs.writeFile(this.lockPath, JSON.stringify(lockInfo, null, 2));
            this.logger.debug(`Refreshed lock timestamp: ${this.lockId}`);
          }
        } catch (error) {
          this.logger.warning('Failed to refresh lock timestamp', error);
        }
        
        // Set up next refresh
        this.setupCleanupTimer(staleThreshold);
      }
    }, refreshInterval);
  }

  /**
   * Sleep for specified milliseconds
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Static method to check if a path is locked
   */
  static async isLocked(lockFilePath: string): Promise<boolean> {
    try {
      return await fs.pathExists(path.resolve(lockFilePath));
    } catch {
      return false;
    }
  }

  /**
   * Static method to get lock info without creating a FileLock instance
   */
  static async getLockInfo(lockFilePath: string): Promise<LockInfo | null> {
    try {
      const lockPath = path.resolve(lockFilePath);
      if (!(await fs.pathExists(lockPath))) {
        return null;
      }

      const lockContent = await fs.readFile(lockPath, 'utf-8');
      return JSON.parse(lockContent) as LockInfo;
    } catch {
      return null;
    }
  }

  /**
   * Static method to force remove a lock (use with extreme caution)
   */
  static async forceRemove(lockFilePath: string): Promise<void> {
    const lockPath = path.resolve(lockFilePath);
    await fs.remove(lockPath);
  }
}