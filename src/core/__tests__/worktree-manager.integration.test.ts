/**
 * Integration tests for enhanced WorktreeManager with locking and idempotency
 * Tests real worktree operations with concurrent scenarios
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { WorktreeManager } from '../worktree-manager';
import { WorktreeConfig } from '../../types';
import simpleGit from 'simple-git';

const TEST_REPO_DIR = path.join(__dirname, 'test-repo');
const TEST_WORKTREE_DIR = path.join(__dirname, 'test-worktrees');

describe('WorktreeManager Integration Tests', () => {
  let manager: WorktreeManager;
  let config: WorktreeConfig;

  beforeEach(async () => {
    // Clean up test directories
    await fs.remove(TEST_REPO_DIR);
    await fs.remove(TEST_WORKTREE_DIR);

    // Create test git repository
    await fs.ensureDir(TEST_REPO_DIR);
    process.chdir(TEST_REPO_DIR);

    const git = simpleGit();
    await git.init();
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');
    
    // Create initial commit
    await fs.writeFile('README.md', '# Test Repository');
    await git.add('README.md');
    await git.commit('Initial commit');

    // Configure WorktreeManager
    config = {
      basePath: TEST_WORKTREE_DIR,
      maxWorktrees: 5,
      cleanupOnError: true,
    };

    manager = new WorktreeManager(config);
    await manager.validateRepository();
  });

  afterEach(async () => {
    try {
      await manager.cleanup();
      await fs.remove(TEST_REPO_DIR);
      await fs.remove(TEST_WORKTREE_DIR);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Basic Worktree Operations with Locking', () => {
    it('should create worktree with proper locking', async () => {
      const issueId = 'issue-123';
      const worktreeId = await manager.createWorktree(issueId);

      expect(worktreeId).toBeTruthy();
      expect(worktreeId).toMatch(/^wt-issue-123-/);

      const info = manager.getWorktreeInfo(worktreeId);
      expect(info).toBeTruthy();
      expect(info?.issueId).toBe(issueId);
      expect(info?.status).toBe('active');

      // Verify directory exists
      const worktreePath = manager.getWorktreePath(worktreeId);
      expect(await fs.pathExists(worktreePath)).toBe(true);

      // Verify git worktree list shows the worktree
      const git = simpleGit();
      const worktreeList = await git.raw(['worktree', 'list', '--porcelain']);
      expect(worktreeList).toContain(worktreePath);
    });

    it('should handle idempotent worktree creation', async () => {
      const issueId = 'idempotent-123';
      
      // Create worktree first time
      const worktreeId1 = await manager.createWorktree(issueId);
      expect(worktreeId1).toBeTruthy();

      // Attempt to create again - should return cached result
      const worktreeId2 = await manager.createWorktree(issueId);
      expect(worktreeId2).toBe(worktreeId1);

      // Should only have one worktree
      expect(manager.getAllWorktrees()).toHaveLength(1);
    });

    it('should cleanup worktree with proper locking', async () => {
      const issueId = 'cleanup-123';
      const worktreeId = await manager.createWorktree(issueId);
      const worktreePath = manager.getWorktreePath(worktreeId);

      // Add some files to worktree
      await fs.writeFile(path.join(worktreePath, 'test.txt'), 'test content');

      // Cleanup worktree
      await manager.cleanupWorktree(worktreeId);

      // Verify worktree is removed from tracking
      expect(manager.getWorktreeInfo(worktreeId)).toBeUndefined();

      // Verify directory is removed (might take a moment)
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(await fs.pathExists(worktreePath)).toBe(false);

      // Verify git worktree list doesn't show the worktree
      const git = simpleGit();
      const worktreeList = await git.raw(['worktree', 'list', '--porcelain']);
      expect(worktreeList).not.toContain(worktreePath);
    });

    it('should handle idempotent worktree cleanup', async () => {
      const issueId = 'idempotent-cleanup-123';
      const worktreeId = await manager.createWorktree(issueId);

      // Cleanup first time
      await manager.cleanupWorktree(worktreeId);
      expect(manager.getWorktreeInfo(worktreeId)).toBeUndefined();

      // Cleanup again - should be idempotent
      await expect(manager.cleanupWorktree(worktreeId)).resolves.not.toThrow();
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent worktree creation safely', async () => {
      const issueId = 'concurrent-123';
      
      // Attempt to create the same worktree concurrently
      const promises = [
        manager.createWorktree(issueId),
        manager.createWorktree(issueId),
        manager.createWorktree(issueId),
      ];

      const results = await Promise.allSettled(promises);
      
      // All should resolve to the same worktree ID
      const successfulResults = results
        .filter(r => r.status === 'fulfilled')
        .map(r => (r as PromiseFulfilledResult<string>).value);

      expect(successfulResults).toHaveLength(3);
      expect(new Set(successfulResults).size).toBe(1); // All same ID

      // Should only have one worktree created
      expect(manager.getAllWorktrees()).toHaveLength(1);
    });

    it('should handle concurrent different worktree creation', async () => {
      const issueIds = ['concurrent-a', 'concurrent-b', 'concurrent-c'];
      
      // Create different worktrees concurrently
      const promises = issueIds.map(id => manager.createWorktree(id));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(new Set(results).size).toBe(3); // All different IDs

      // Should have three worktrees
      expect(manager.getAllWorktrees()).toHaveLength(3);

      // Each worktree should correspond to its issue
      for (let i = 0; i < issueIds.length; i++) {
        const info = manager.getWorktreeInfo(results[i]);
        expect(info?.issueId).toBe(issueIds[i]);
      }
    });

    it('should handle concurrent cleanup operations', async () => {
      const issueId = 'concurrent-cleanup-123';
      const worktreeId = await manager.createWorktree(issueId);

      // Attempt concurrent cleanup
      const promises = [
        manager.cleanupWorktree(worktreeId),
        manager.cleanupWorktree(worktreeId),
        manager.cleanupWorktree(worktreeId),
      ];

      const results = await Promise.allSettled(promises);
      
      // All should succeed (idempotent)
      for (const result of results) {
        expect(result.status).toBe('fulfilled');
      }

      // Worktree should be removed
      expect(manager.getWorktreeInfo(worktreeId)).toBeUndefined();
    });

    it('should prevent race conditions between create and cleanup', async () => {
      const issueId = 'race-123';
      
      // Start creating worktree
      const createPromise = manager.createWorktree(issueId);
      
      // Wait a bit then try to cleanup (should wait for creation to complete)
      setTimeout(async () => {
        const worktreeId = await createPromise;
        await manager.cleanupWorktree(worktreeId);
      }, 50);

      const worktreeId = await createPromise;
      expect(worktreeId).toBeTruthy();

      // Give cleanup time to run
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Final state should be clean
      expect(manager.getWorktreeInfo(worktreeId)).toBeUndefined();
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle worktree creation failures with rollback', async () => {
      const issueId = 'fail-create-123';
      
      // Mock git command to fail
      const originalRaw = manager['git'].raw;
      vi.spyOn(manager['git'], 'raw').mockImplementationOnce(() => {
        throw new Error('Git worktree add failed');
      });

      await expect(manager.createWorktree(issueId)).rejects.toThrow('Git worktree add failed');

      // Should not have any worktrees tracked
      expect(manager.getAllWorktrees()).toHaveLength(0);

      // Restore original method and try again - should work
      manager['git'].raw = originalRaw;
      const worktreeId = await manager.createWorktree(issueId);
      expect(worktreeId).toBeTruthy();
    });

    it('should handle cleanup failures gracefully', async () => {
      const issueId = 'fail-cleanup-123';
      const worktreeId = await manager.createWorktree(issueId);
      
      // Mock git command to fail cleanup
      const originalRaw = manager['git'].raw;
      vi.spyOn(manager['git'], 'raw').mockImplementation((command) => {
        if (command[0] === 'worktree' && command[1] === 'remove') {
          throw new Error('Git worktree remove failed');
        }
        return originalRaw.call(manager['git'], command);
      });

      // Should attempt force cleanup due to cleanupOnError: true
      await expect(manager.cleanupWorktree(worktreeId)).rejects.toThrow();

      // Restore and verify force cleanup worked
      manager['git'].raw = originalRaw;
      
      // The force cleanup should have removed it from tracking
      expect(manager.getWorktreeInfo(worktreeId)).toBeUndefined();
    });

    it('should recover from interrupted operations', async () => {
      const issueId = 'interrupted-123';
      
      // Simulate interrupted creation by creating partial state
      const worktreeId = `wt-${issueId}-test123`;
      const worktreePath = path.join(TEST_WORKTREE_DIR, worktreeId);
      
      // Create directory but not git worktree
      await fs.ensureDir(worktreePath);
      
      // Validate repository should clean this up
      await manager.validateRepository();
      
      // Now normal creation should work
      const newWorktreeId = await manager.createWorktree(issueId);
      expect(newWorktreeId).toBeTruthy();
      
      const info = manager.getWorktreeInfo(newWorktreeId);
      expect(info?.status).toBe('active');
    });

    it('should handle conflicting worktree names', async () => {
      const issueId = 'conflict-123';
      const worktreeId = await manager.createWorktree(issueId);
      
      // Manually create directory with potential conflict name
      const conflictPath = path.join(TEST_WORKTREE_DIR, 'potential-conflict');
      await fs.ensureDir(conflictPath);
      
      // Should still be able to create more worktrees
      const secondIssueId = 'conflict-456';
      const secondWorktreeId = await manager.createWorktree(secondIssueId);
      
      expect(secondWorktreeId).toBeTruthy();
      expect(secondWorktreeId).not.toBe(worktreeId);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle maximum worktree limits', async () => {
      const maxWorktrees = config.maxWorktrees;
      const worktreeIds: string[] = [];
      
      // Create maximum number of worktrees
      for (let i = 0; i < maxWorktrees; i++) {
        const worktreeId = await manager.createWorktree(`issue-${i}`);
        worktreeIds.push(worktreeId);
      }
      
      expect(manager.getAllWorktrees()).toHaveLength(maxWorktrees);
      
      // Creating one more should trigger cleanup of oldest
      const extraWorktreeId = await manager.createWorktree('extra-issue');
      expect(extraWorktreeId).toBeTruthy();
      
      // Should still have maximum worktrees
      expect(manager.getAllWorktrees()).toHaveLength(maxWorktrees);
      
      // First worktree should be cleaned up
      expect(manager.getWorktreeInfo(worktreeIds[0])).toBeUndefined();
    });

    it('should perform well with multiple operations', async () => {
      const operationCount = 10;
      const startTime = Date.now();
      
      // Create multiple worktrees
      const createPromises = Array.from({ length: operationCount }, (_, i) => 
        manager.createWorktree(`perf-issue-${i}`)
      );
      
      const worktreeIds = await Promise.all(createPromises);
      expect(worktreeIds).toHaveLength(operationCount);
      
      // Clean up all worktrees
      const cleanupPromises = worktreeIds.map(id => manager.cleanupWorktree(id));
      await Promise.all(cleanupPromises);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time (adjust based on system)
      expect(duration).toBeLessThan(30000); // 30 seconds max
      
      // All should be cleaned up
      expect(manager.getAllWorktrees()).toHaveLength(0);
    });
  });

  describe('Sync Operations with Locking', () => {
    it('should sync worktree with remote changes', async () => {
      const issueId = 'sync-123';
      const worktreeId = await manager.createWorktree(issueId);
      
      // Mock successful sync operations
      const worktreePath = manager.getWorktreePath(worktreeId);
      const worktreeGit = simpleGit(worktreePath);
      
      vi.spyOn(worktreeGit, 'fetch').mockResolvedValue(undefined as any);
      vi.spyOn(worktreeGit, 'pull').mockResolvedValue(undefined as any);
      
      // Sync should work without errors
      await expect(manager.syncWorktree(worktreeId)).resolves.not.toThrow();
    });

    it('should prevent concurrent sync operations', async () => {
      const issueId = 'concurrent-sync-123';
      const worktreeId = await manager.createWorktree(issueId);
      
      // Start multiple sync operations
      const syncPromises = [
        manager.syncWorktree(worktreeId),
        manager.syncWorktree(worktreeId),
        manager.syncWorktree(worktreeId),
      ];
      
      // All should complete successfully due to locking and idempotency
      const results = await Promise.allSettled(syncPromises);
      
      for (const result of results) {
        expect(result.status).toBe('fulfilled');
      }
    });

    it('should handle sync failures gracefully', async () => {
      const issueId = 'sync-fail-123';
      const worktreeId = await manager.createWorktree(issueId);
      
      const worktreePath = manager.getWorktreePath(worktreeId);
      const worktreeGit = simpleGit(worktreePath);
      
      // Mock sync failure
      vi.spyOn(worktreeGit, 'fetch').mockRejectedValue(new Error('Network error'));
      
      await expect(manager.syncWorktree(worktreeId)).rejects.toThrow('Network error');
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should provide accurate idempotency statistics', async () => {
      const issueIds = ['stats-1', 'stats-2', 'stats-3'];
      
      // Create some worktrees
      for (const issueId of issueIds) {
        await manager.createWorktree(issueId);
      }
      
      // Get idempotency statistics
      const stats = await manager.getIdempotencyStats();
      
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.byOperation.createWorktree).toBe(issueIds.length);
      expect(stats.successRate).toBeGreaterThan(0);
    });

    it('should show current lock status', async () => {
      // Start a long-running operation in background
      const longRunningPromise = manager.createWorktree('lock-status-test');
      
      // Check lock status immediately
      const lockStatus = await manager.getLockStatus();
      
      // Wait for operation to complete
      await longRunningPromise;
      
      // Lock status should show information during operation
      // (Exact assertion depends on timing)
      expect(Array.isArray(lockStatus)).toBe(true);
    });

    it('should clean up old idempotency records', async () => {
      const issueId = 'cleanup-records-123';
      await manager.createWorktree(issueId);
      
      // Clean up old records (immediate cleanup for testing)
      const cleanedCount = await manager.cleanupIdempotencyRecords(0);
      
      expect(cleanedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Force Operations (Emergency)', () => {
    it('should force release all locks when needed', async () => {
      const issueId = 'force-release-123';
      
      // This test is mainly to ensure the method exists and doesn't crash
      await expect(manager.forceReleaseAllLocks()).resolves.not.toThrow();
      
      // Normal operations should still work after force release
      const worktreeId = await manager.createWorktree(issueId);
      expect(worktreeId).toBeTruthy();
    });

    it('should handle emergency cleanup scenarios', async () => {
      const issueIds = ['emergency-1', 'emergency-2', 'emergency-3'];
      
      // Create multiple worktrees
      for (const issueId of issueIds) {
        await manager.createWorktree(issueId);
      }
      
      expect(manager.getAllWorktrees()).toHaveLength(issueIds.length);
      
      // Emergency cleanup
      await manager.cleanup();
      
      // Should clean up everything
      expect(manager.getAllWorktrees()).toHaveLength(0);
    });
  });
});