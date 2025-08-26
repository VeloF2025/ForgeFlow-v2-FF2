import { EventEmitter } from 'events';
import type { SimpleGit } from 'simple-git';
import simpleGit from 'simple-git';
import * as fs from 'fs-extra';
import * as path from 'path';
import type { WorktreeConfig, WorktreeInfo } from '../types';
import { LogContext } from '../utils/logger';
import type { LockOptions } from './file-lock';
import { FileLock } from './file-lock';
import type { IdempotencyKey } from './idempotency-manager';
import { IdempotencyManager } from './idempotency-manager';

export class WorktreeManager extends EventEmitter {
  private config: WorktreeConfig;
  private git: SimpleGit;
  private worktrees: Map<string, WorktreeInfo>;
  private logger: LogContext;
  private basePath: string;
  private idempotencyManager: IdempotencyManager;
  private readonly lockOptions: LockOptions = {
    timeout: 30000,
    retryInterval: 100,
    maxRetries: 300,
    staleThreshold: 300000,
  };

  constructor(config: WorktreeConfig) {
    super();
    this.config = config;
    this.logger = new LogContext('WorktreeManager');
    this.worktrees = new Map();
    this.basePath = config.basePath || '.ff2-worktrees';
    this.git = simpleGit();
    this.idempotencyManager = new IdempotencyManager({
      storePath: path.join(this.basePath, 'idempotency'),
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      maxAttempts: 3,
    });
  }

  async validateRepository(): Promise<void> {
    try {
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) {
        throw new Error('Not a git repository');
      }

      const status = await this.git.status();
      this.logger.info(`Repository validated. Branch: ${status.current || 'unknown'}`);

      await this.ensureWorktreeDirectory();
      await this.cleanupStaleWorktrees();
    } catch (error) {
      this.logger.error('Failed to validate repository', error);
      throw new Error(`Repository validation failed: ${String(error)}`);
    }
  }

  private async ensureWorktreeDirectory(): Promise<void> {
    const worktreePath = path.resolve(this.basePath);
    await fs.ensureDir(worktreePath);
    this.logger.debug(`Worktree directory ensured: ${worktreePath}`);
  }

  async createWorktree(issueId: string): Promise<string> {
    // Create idempotency key for this operation
    const idempotencyKey: IdempotencyKey = {
      operation: 'createWorktree',
      parameters: { issueId },
      context: { basePath: this.basePath },
    };

    // Check if operation should execute
    const shouldExecuteResult = await this.idempotencyManager.shouldExecute(idempotencyKey);
    if (!shouldExecuteResult.execute) {
      if (shouldExecuteResult.record?.result) {
        this.logger.info(`Returning cached worktree result: ${shouldExecuteResult.reason}`);
        return shouldExecuteResult.record.result as string;
      }
      throw new Error(`Cannot create worktree: ${shouldExecuteResult.reason}`);
    }

    const lockPath = path.join(this.basePath, 'locks', `create-worktree-${issueId}.lock`);
    const lock = new FileLock(lockPath, 'createWorktree', { issueId });
    let idempotencyKey_tracking: string | null = null;

    try {
      // Acquire lock to prevent concurrent worktree creation
      await lock.acquire(this.lockOptions);
      this.logger.debug(`Acquired lock for worktree creation: ${issueId}`);

      if (this.worktrees.size >= this.config.maxWorktrees) {
        await this.cleanupOldestWorktree();
      }

      const worktreeId = this.generateWorktreeId(issueId);
      const worktreePath = path.join(this.basePath, worktreeId);
      const branchName = `ff-${issueId}-${Date.now()}`;

      // Start tracking this operation
      idempotencyKey_tracking = await this.idempotencyManager.startOperation(idempotencyKey, {
        worktreeId,
        worktreePath,
        branchName,
        issueId,
      });

      this.logger.info(`Creating worktree: ${worktreeId} for issue: ${issueId}`);

      // Check for naming conflicts
      if (await this.hasWorktreeConflict(worktreeId)) {
        throw new Error(`Worktree ID conflict detected: ${worktreeId}`);
      }

      // Atomic worktree creation
      await this.atomicWorktreeCreation(worktreeId, worktreePath, branchName, issueId);

      // Mark operation as completed
      await this.idempotencyManager.completeOperation(idempotencyKey_tracking, worktreeId);

      this.logger.info(`Worktree created successfully: ${worktreeId} at ${worktreePath}`);
      return worktreeId;
    } catch (error) {
      this.logger.error(`Failed to create worktree for issue: ${issueId}`, error);

      // Mark operation as failed and attempt rollback
      if (idempotencyKey_tracking) {
        await this.idempotencyManager.failOperation(idempotencyKey_tracking, error as Error);
        await this.idempotencyManager.rollbackOperation(
          idempotencyKey_tracking,
          async (rollbackData) => {
            if (rollbackData && typeof rollbackData === 'object') {
              const data = rollbackData as {
                worktreeId: string;
                worktreePath: string;
                branchName: string;
              };
              await this.rollbackWorktreeCreation(
                data.worktreeId,
                data.worktreePath,
                data.branchName,
              );
            }
          },
        );
      }

      throw error;
    } finally {
      // Always release the lock
      if (lock.isHeld()) {
        await lock.release();
        this.logger.debug(`Released lock for worktree creation: ${issueId}`);
      }
    }
  }

  async cleanupWorktree(worktreeId: string): Promise<void> {
    // Create idempotency key for cleanup operation
    const idempotencyKey: IdempotencyKey = {
      operation: 'cleanupWorktree',
      parameters: { worktreeId },
      context: { basePath: this.basePath },
    };

    // Check if operation should execute
    const shouldExecuteResult = await this.idempotencyManager.shouldExecute(idempotencyKey);
    if (!shouldExecuteResult.execute) {
      this.logger.info(`Skipping worktree cleanup: ${shouldExecuteResult.reason}`);
      return;
    }

    const info = this.worktrees.get(worktreeId);
    if (!info) {
      this.logger.warning(`Worktree not found: ${worktreeId}`);
      // Still mark as completed since there's nothing to clean up
      const trackingKey = await this.idempotencyManager.startOperation(idempotencyKey);
      await this.idempotencyManager.completeOperation(trackingKey);
      return;
    }

    const lockPath = path.join(this.basePath, 'locks', `cleanup-worktree-${worktreeId}.lock`);
    const lock = new FileLock(lockPath, 'cleanupWorktree', { worktreeId });
    let idempotencyTracking: string | null = null;

    try {
      // Acquire lock to prevent concurrent cleanup
      await lock.acquire(this.lockOptions);
      this.logger.debug(`Acquired lock for worktree cleanup: ${worktreeId}`);

      // Start tracking this operation
      idempotencyTracking = await this.idempotencyManager.startOperation(idempotencyKey, {
        worktreeInfo: { ...info },
      });

      this.logger.info(`Cleaning up worktree: ${worktreeId}`);
      info.status = 'cleaning';

      // Atomic cleanup operation
      await this.atomicWorktreeCleanup(info);

      // Mark operation as completed
      await this.idempotencyManager.completeOperation(idempotencyTracking);

      this.logger.info(`Worktree cleaned up successfully: ${worktreeId}`);
    } catch (error) {
      this.logger.error(`Failed to cleanup worktree: ${worktreeId}`, error);

      // Mark operation as failed
      if (idempotencyTracking) {
        await this.idempotencyManager.failOperation(idempotencyTracking, error as Error);
      }

      if (this.config.cleanupOnError) {
        await this.forceCleanup(worktreeId);
      }
      throw error;
    } finally {
      // Always release the lock
      if (lock.isHeld()) {
        await lock.release();
        this.logger.debug(`Released lock for worktree cleanup: ${worktreeId}`);
      }
    }
  }

  private async forceCleanup(worktreeId: string): Promise<void> {
    try {
      const info = this.worktrees.get(worktreeId);
      if (!info) return;

      await this.git.raw(['worktree', 'remove', info.path, '--force']).catch(() => {});
      await fs.remove(info.path).catch(() => {});
      this.worktrees.delete(worktreeId);

      this.logger.warning(`Force cleaned worktree: ${worktreeId}`);
    } catch (error) {
      this.logger.error(`Force cleanup failed for: ${worktreeId}`, error);
    }
  }

  async cleanupAllWorktrees(): Promise<void> {
    this.logger.info('Cleaning up all worktrees...');
    const worktreeIds = Array.from(this.worktrees.keys());

    for (const id of worktreeIds) {
      await this.cleanupWorktree(id).catch((error) => {
        this.logger.error(`Failed to cleanup worktree ${id}`, error);
      });
    }

    this.logger.info('All worktrees cleaned up');
  }

  private async cleanupStaleWorktrees(): Promise<void> {
    try {
      const result = await this.git.raw(['worktree', 'list', '--porcelain']);
      const lines = result.split('\n').filter(Boolean);

      const activeWorktrees = new Set<string>();
      for (let i = 0; i < lines.length; i += 3) {
        const worktreeLine = lines[i];
        if (worktreeLine?.startsWith('worktree ')) {
          const path = worktreeLine.replace('worktree ', '');
          if (path.includes(this.basePath)) {
            activeWorktrees.add(path);
          }
        }
      }

      const staleWorktreeIds: string[] = [];
      this.worktrees.forEach((info, id) => {
        if (!activeWorktrees.has(info.path)) {
          staleWorktreeIds.push(id);
        }
      });

      for (const id of staleWorktreeIds) {
        this.logger.warning(`Removing stale worktree from tracking: ${id}`);
        this.worktrees.delete(id);
      }

      const worktreeDir = path.resolve(this.basePath);
      if (await fs.pathExists(worktreeDir)) {
        const directories = await fs.readdir(worktreeDir);
        for (const dir of directories) {
          const fullPath = path.join(worktreeDir, dir);
          if (!activeWorktrees.has(fullPath)) {
            this.logger.warning(`Removing orphaned worktree directory: ${dir}`);
            await fs.remove(fullPath).catch(() => {});
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to cleanup stale worktrees', error);
    }
  }

  private async cleanupOldestWorktree(): Promise<void> {
    let oldest: WorktreeInfo | null = null;
    let oldestId: string | null = null;

    this.worktrees.forEach((info, id) => {
      if (!oldest || info.createdAt < oldest.createdAt) {
        oldest = info;
        oldestId = id;
      }
    });

    if (oldestId) {
      this.logger.info(`Cleaning up oldest worktree to make space: ${oldestId}`);
      await this.cleanupWorktree(oldestId);
    }
  }

  async syncWorktree(worktreeId: string): Promise<void> {
    // Create idempotency key for sync operation
    const idempotencyKey: IdempotencyKey = {
      operation: 'syncWorktree',
      parameters: { worktreeId },
      context: { timestamp: Date.now() }, // Include timestamp to allow periodic syncs
    };

    // Check if recent sync was performed (within last 5 minutes)
    const recentSyncKey = {
      ...idempotencyKey,
      context: {
        ...idempotencyKey.context,
        timestamp: Math.floor(Date.now() / (5 * 60 * 1000)) * (5 * 60 * 1000),
      },
    };
    const shouldExecuteResult = await this.idempotencyManager.shouldExecute(recentSyncKey);
    if (!shouldExecuteResult.execute && shouldExecuteResult.record?.status === 'completed') {
      this.logger.debug(`Skipping sync - recent sync completed: ${shouldExecuteResult.reason}`);
      return;
    }

    const info = this.worktrees.get(worktreeId);
    if (!info) {
      throw new Error(`Worktree not found: ${worktreeId}`);
    }

    const lockPath = path.join(this.basePath, 'locks', `sync-worktree-${worktreeId}.lock`);
    const lock = new FileLock(lockPath, 'syncWorktree', { worktreeId });
    let idempotencyTracking: string | null = null;

    try {
      // Acquire lock to prevent concurrent sync
      await lock.acquire({ ...this.lockOptions, timeout: 15000 }); // Shorter timeout for sync
      this.logger.debug(`Acquired lock for worktree sync: ${worktreeId}`);

      // Start tracking this operation
      idempotencyTracking = await this.idempotencyManager.startOperation(recentSyncKey);

      const worktreeGit = simpleGit(info.path);

      await worktreeGit.fetch();
      await worktreeGit.pull('origin', 'main', { '--rebase': 'true' });

      // Mark operation as completed
      await this.idempotencyManager.completeOperation(idempotencyTracking);

      this.logger.debug(`Synced worktree: ${worktreeId}`);
    } catch (error) {
      this.logger.error(`Failed to sync worktree: ${worktreeId}`, error);

      if (idempotencyTracking) {
        await this.idempotencyManager.failOperation(idempotencyTracking, error as Error);
      }

      throw error;
    } finally {
      if (lock.isHeld()) {
        await lock.release();
        this.logger.debug(`Released lock for worktree sync: ${worktreeId}`);
      }
    }
  }

  async commitChanges(worktreeId: string, message: string): Promise<void> {
    const info = this.worktrees.get(worktreeId);
    if (!info) {
      throw new Error(`Worktree not found: ${worktreeId}`);
    }

    const worktreeGit = simpleGit(info.path);
    const status = await worktreeGit.status();

    if (status.modified.length === 0 && status.created.length === 0) {
      this.logger.debug(`No changes to commit in worktree: ${worktreeId}`);
      return;
    }

    await worktreeGit.add('.');
    await worktreeGit.commit(message);

    this.logger.info(`Committed changes in worktree: ${worktreeId}`);
  }

  async pushChanges(worktreeId: string): Promise<void> {
    const info = this.worktrees.get(worktreeId);
    if (!info) {
      throw new Error(`Worktree not found: ${worktreeId}`);
    }

    const worktreeGit = simpleGit(info.path);
    await worktreeGit.push(['--set-upstream', 'origin', info.branch]);

    this.logger.info(`Pushed changes from worktree: ${worktreeId}`);
  }

  getWorktreeInfo(worktreeId: string): WorktreeInfo | undefined {
    return this.worktrees.get(worktreeId);
  }

  getWorktreePath(worktreeId: string): string {
    const info = this.worktrees.get(worktreeId);
    if (!info) {
      throw new Error(`Worktree not found: ${worktreeId}`);
    }
    return info.path;
  }

  getAllWorktrees(): WorktreeInfo[] {
    const allWorktrees: WorktreeInfo[] = [];
    this.worktrees.forEach((worktree) => {
      allWorktrees.push(worktree);
    });
    return allWorktrees;
  }

  getActiveWorktreeCount(): number {
    let activeCount = 0;
    this.worktrees.forEach((worktree) => {
      if (worktree.status === 'active') {
        activeCount++;
      }
    });
    return activeCount;
  }

  private generateWorktreeId(issueId: string): string {
    const timestamp = Date.now().toString(36);
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `wt-${issueId}-${timestamp}-${randomSuffix}`;
  }

  /**
   * Check for worktree naming conflicts
   */
  private async hasWorktreeConflict(worktreeId: string): Promise<boolean> {
    const worktreePath = path.join(this.basePath, worktreeId);

    // Check if directory already exists
    if (await fs.pathExists(worktreePath)) {
      return true;
    }

    // Check if worktree ID is already tracked
    if (this.worktrees.has(worktreeId)) {
      return true;
    }

    // Check git worktree list for conflicts
    try {
      const result = await this.git.raw(['worktree', 'list', '--porcelain']);
      const lines = result.split('\n').filter(Boolean);

      for (let i = 0; i < lines.length; i += 3) {
        const worktreeLine = lines[i];
        if (worktreeLine?.startsWith('worktree ')) {
          const existingPath = worktreeLine.replace('worktree ', '');
          if (existingPath === worktreePath) {
            return true;
          }
        }
      }
    } catch (error) {
      this.logger.warning('Failed to check git worktree list for conflicts', error);
    }

    return false;
  }

  /**
   * Atomic worktree creation with rollback capability
   */
  private async atomicWorktreeCreation(
    worktreeId: string,
    worktreePath: string,
    branchName: string,
    issueId: string,
  ): Promise<void> {
    let gitWorktreeCreated = false;
    let directoryCreated = false;
    let trackingAdded = false;

    try {
      // Step 1: Create git worktree
      await this.git.raw(['worktree', 'add', '-b', branchName, worktreePath]);
      gitWorktreeCreated = true;
      this.logger.debug(`Git worktree created: ${worktreePath}`);

      // Step 2: Verify directory was created
      if (!(await fs.pathExists(worktreePath))) {
        throw new Error(`Worktree directory not created: ${worktreePath}`);
      }
      directoryCreated = true;

      // Step 3: Add to tracking
      const info: WorktreeInfo = {
        id: worktreeId,
        path: worktreePath,
        branch: branchName,
        issueId,
        createdAt: new Date(),
        status: 'active',
      };

      this.worktrees.set(worktreeId, info);
      trackingAdded = true;
      this.logger.debug(`Worktree added to tracking: ${worktreeId}`);
    } catch (error) {
      this.logger.error('Atomic worktree creation failed, rolling back', error);

      // Rollback in reverse order
      if (trackingAdded) {
        this.worktrees.delete(worktreeId);
      }

      if (gitWorktreeCreated) {
        try {
          await this.git.raw(['worktree', 'remove', worktreePath, '--force']);
          await this.git.raw(['branch', '-D', branchName]).catch(() => {});
        } catch (rollbackError) {
          this.logger.error('Failed to rollback git worktree creation', rollbackError);
        }
      }

      if (directoryCreated) {
        try {
          await fs.remove(worktreePath);
        } catch (rollbackError) {
          this.logger.error('Failed to remove directory during rollback', rollbackError);
        }
      }

      throw error;
    }
  }

  /**
   * Atomic worktree cleanup with proper error handling
   */
  private async atomicWorktreeCleanup(info: WorktreeInfo): Promise<void> {
    const worktreeId = info.id;
    let changesCommitted = false;
    let worktreeRemoved = false;
    let branchDeleted = false;
    let directoryRemoved = false;

    try {
      // Step 1: Commit any pending changes
      const worktreeGit = simpleGit(info.path);
      const status = await worktreeGit.status();

      if (status.modified.length > 0 || status.created.length > 0) {
        await worktreeGit.add('.');
        await worktreeGit.commit(`Auto-commit from worktree ${worktreeId}`);
        changesCommitted = true;
        this.logger.debug(`Auto-committed changes in worktree: ${worktreeId}`);
      }

      // Step 2: Remove worktree from git
      await this.git.raw(['worktree', 'remove', info.path, '--force']);
      worktreeRemoved = true;
      this.logger.debug(`Git worktree removed: ${info.path}`);

      // Step 3: Delete branch
      try {
        await this.git.raw(['branch', '-D', info.branch]);
        branchDeleted = true;
        this.logger.debug(`Branch deleted: ${info.branch}`);
      } catch (error) {
        this.logger.debug(`Failed to delete branch ${info.branch}: ${String(error)}`);
        // Continue - branch deletion failure is not critical
      }

      // Step 4: Remove directory
      try {
        await fs.remove(info.path);
        directoryRemoved = true;
        this.logger.debug(`Directory removed: ${info.path}`);
      } catch (error) {
        this.logger.debug(`Failed to remove directory ${info.path}: ${String(error)}`);
        // Continue - directory removal failure is not critical
      }

      // Step 5: Update tracking
      info.status = 'removed';
      this.worktrees.delete(worktreeId);
    } catch (error) {
      this.logger.error(`Atomic cleanup failed for worktree: ${worktreeId}`, error);

      // Log state for debugging
      this.logger.debug(
        `Cleanup state: committed=${changesCommitted}, worktreeRemoved=${worktreeRemoved}, branchDeleted=${branchDeleted}, directoryRemoved=${directoryRemoved}`,
      );

      throw error;
    }
  }

  /**
   * Rollback worktree creation (used by idempotency manager)
   */
  private async rollbackWorktreeCreation(
    worktreeId: string,
    worktreePath: string,
    branchName: string,
  ): Promise<void> {
    this.logger.warning(`Rolling back worktree creation: ${worktreeId}`);

    try {
      // Remove from tracking
      this.worktrees.delete(worktreeId);

      // Remove git worktree
      if (await fs.pathExists(worktreePath)) {
        await this.git.raw(['worktree', 'remove', worktreePath, '--force']).catch(() => {});
      }

      // Delete branch
      await this.git.raw(['branch', '-D', branchName]).catch(() => {});

      // Remove directory
      await fs.remove(worktreePath).catch(() => {});

      this.logger.info(`Worktree rollback completed: ${worktreeId}`);
    } catch (error) {
      this.logger.error(`Worktree rollback failed: ${worktreeId}`, error);
      throw error;
    }
  }

  /**
   * Get idempotency statistics
   */
  async getIdempotencyStats(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byOperation: Record<string, number>;
    avgDuration: number;
    successRate: number;
  }> {
    return await this.idempotencyManager.getStats();
  }

  /**
   * Clean up old idempotency records
   */
  async cleanupIdempotencyRecords(maxAge?: number): Promise<number> {
    return await this.idempotencyManager.cleanup(maxAge);
  }

  /**
   * Force release all locks (use with extreme caution)
   */
  async forceReleaseAllLocks(): Promise<void> {
    try {
      const locksPath = path.join(this.basePath, 'locks');
      if (await fs.pathExists(locksPath)) {
        const lockFiles = await fs.readdir(locksPath);
        for (const lockFile of lockFiles) {
          if (lockFile.endsWith('.lock')) {
            const lockPath = path.join(locksPath, lockFile);
            await FileLock.forceRemove(lockPath);
            this.logger.warning(`Force removed lock: ${lockFile}`);
          }
        }
      }
      this.logger.warning('All locks force released');
    } catch (error) {
      this.logger.error('Failed to force release all locks', error);
      throw error;
    }
  }

  /**
   * Get current lock status
   */
  async getLockStatus(): Promise<
    Array<{
      lockFile: string;
      operation: string;
      info: any;
    }>
  > {
    const lockStatus: Array<{ lockFile: string; operation: string; info: any }> = [];

    try {
      const locksPath = path.join(this.basePath, 'locks');
      if (await fs.pathExists(locksPath)) {
        const lockFiles = await fs.readdir(locksPath);
        for (const lockFile of lockFiles) {
          if (lockFile.endsWith('.lock')) {
            const lockPath = path.join(locksPath, lockFile);
            const lockInfo = await FileLock.getLockInfo(lockPath);
            if (lockInfo) {
              lockStatus.push({
                lockFile,
                operation: lockInfo.operation,
                info: lockInfo,
              });
            }
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to get lock status', error);
    }

    return lockStatus;
  }

  /**
   * Enhanced cleanup with idempotency and lock management
   */
  async cleanup(): Promise<void> {
    try {
      // Clean up all worktrees
      await this.cleanupAllWorktrees();
      this.worktrees.clear();

      // Clean up old idempotency records
      const cleanedRecords = await this.cleanupIdempotencyRecords();
      this.logger.info(`Cleaned up ${cleanedRecords} old idempotency records`);

      // Check for any remaining locks and warn
      const lockStatus = await this.getLockStatus();
      if (lockStatus.length > 0) {
        this.logger.warning(`${lockStatus.length} locks still active after cleanup`);
        for (const lock of lockStatus) {
          this.logger.warning(`Active lock: ${lock.lockFile} (${lock.operation})`);
        }
      }

      this.logger.info('WorktreeManager cleanup complete');
    } catch (error) {
      this.logger.error('WorktreeManager cleanup failed', error);
      throw error;
    }
  }
}
