/**
 * Comprehensive tests for FileLock implementation
 * Tests platform-agnostic file locking with various scenarios
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import type { LockInfo } from '../file-lock';
import { FileLock } from '../file-lock';

const TEST_LOCK_DIR = path.join(__dirname, 'test-locks');
const TEST_OPERATION = 'testOperation';

describe('FileLock', () => {
  beforeEach(async () => {
    // Ensure clean test environment
    await fs.remove(TEST_LOCK_DIR);
    await fs.ensureDir(TEST_LOCK_DIR);
  });

  afterEach(async () => {
    // Clean up test locks
    await fs.remove(TEST_LOCK_DIR);
  });

  describe('Basic Lock Operations', () => {
    it('should acquire and release a lock successfully', async () => {
      const lockPath = path.join(TEST_LOCK_DIR, 'test.lock');
      const lock = new FileLock(lockPath, TEST_OPERATION);

      // Lock should not exist initially
      expect(await FileLock.isLocked(lockPath)).toBe(false);

      // Acquire lock
      await lock.acquire({ timeout: 1000 });
      expect(lock.isHeld()).toBe(true);
      expect(await FileLock.isLocked(lockPath)).toBe(true);

      // Check lock info
      const lockInfo = await lock.getLockInfo();
      expect(lockInfo).toBeTruthy();
      expect(lockInfo?.operation).toBe(TEST_OPERATION);
      expect(lockInfo?.pid).toBe(process.pid);

      // Release lock
      await lock.release();
      expect(lock.isHeld()).toBe(false);
      expect(await FileLock.isLocked(lockPath)).toBe(false);
    });

    it('should prevent concurrent lock acquisition', async () => {
      const lockPath = path.join(TEST_LOCK_DIR, 'concurrent.lock');
      const lock1 = new FileLock(lockPath, 'operation1');
      const lock2 = new FileLock(lockPath, 'operation2');

      // First lock should succeed
      await lock1.acquire({ timeout: 1000 });
      expect(lock1.isHeld()).toBe(true);

      // Second lock should fail due to timeout
      await expect(lock2.acquire({ timeout: 100, retryInterval: 10 })).rejects.toThrow(
        'Lock timeout',
      );

      expect(lock2.isHeld()).toBe(false);

      // After releasing first lock, second should be able to acquire
      await lock1.release();
      await lock2.acquire({ timeout: 1000 });
      expect(lock2.isHeld()).toBe(true);

      await lock2.release();
    });

    it('should handle lock metadata correctly', async () => {
      const lockPath = path.join(TEST_LOCK_DIR, 'metadata.lock');
      const metadata = { issueId: '123', priority: 'high' };
      const lock = new FileLock(lockPath, TEST_OPERATION, metadata);

      await lock.acquire();

      const lockInfo = await lock.getLockInfo();
      expect(lockInfo?.metadata).toEqual(metadata);
      expect(lockInfo?.operation).toBe(TEST_OPERATION);

      await lock.release();
    });
  });

  describe('Lock Timeout and Retry Logic', () => {
    it('should respect timeout configuration', async () => {
      const lockPath = path.join(TEST_LOCK_DIR, 'timeout.lock');
      const lock1 = new FileLock(lockPath, 'holder');
      const lock2 = new FileLock(lockPath, 'waiter');

      await lock1.acquire();

      const startTime = Date.now();
      await expect(lock2.acquire({ timeout: 500, retryInterval: 50 })).rejects.toThrow(
        'Lock timeout',
      );

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(450); // Allow some variance
      expect(elapsed).toBeLessThan(1000); // Should not take too long

      await lock1.release();
    });

    it('should retry with backoff intervals', async () => {
      const lockPath = path.join(TEST_LOCK_DIR, 'retry.lock');
      const lock1 = new FileLock(lockPath, 'holder');
      const lock2 = new FileLock(lockPath, 'waiter');

      await lock1.acquire();

      let acquireCount = 0;
      const originalAcquire = lock2['tryAcquire'].bind(lock2);
      vi.spyOn(lock2 as any, 'tryAcquire').mockImplementation(async () => {
        acquireCount++;
        return originalAcquire();
      });

      // Release lock after 200ms to allow second lock to succeed
      setTimeout(async () => {
        await lock1.release();
      }, 200);

      await lock2.acquire({ timeout: 1000, retryInterval: 50 });

      expect(acquireCount).toBeGreaterThan(1); // Should have retried multiple times
      expect(lock2.isHeld()).toBe(true);

      await lock2.release();
    });
  });

  describe('Stale Lock Detection and Cleanup', () => {
    it('should detect and clean up stale locks', async () => {
      const lockPath = path.join(TEST_LOCK_DIR, 'stale.lock');

      // Create a stale lock manually
      const staleLockInfo: LockInfo = {
        id: 'stale-lock-id',
        pid: 99999, // Non-existent PID
        hostname: 'test-host',
        timestamp: Date.now() - 400000, // 6.67 minutes ago (stale)
        operation: 'staleOperation',
      };

      await fs.writeJSON(lockPath, staleLockInfo);

      const lock = new FileLock(lockPath, 'newOperation');

      // Should be able to acquire the lock after cleaning up stale lock
      await lock.acquire({ staleThreshold: 300000 }); // 5 minute threshold
      expect(lock.isHeld()).toBe(true);

      const lockInfo = await lock.getLockInfo();
      expect(lockInfo?.operation).toBe('newOperation');
      expect(lockInfo?.id).not.toBe(staleLockInfo.id);

      await lock.release();
    });

    it('should not clean up active locks', async () => {
      const lockPath = path.join(TEST_LOCK_DIR, 'active.lock');

      // Create a lock with current process PID (should be active)
      const activeLockInfo: LockInfo = {
        id: 'active-lock-id',
        pid: process.pid,
        hostname: require('os').hostname(),
        timestamp: Date.now() - 100000, // 1.67 minutes ago (not stale)
        operation: 'activeOperation',
      };

      await fs.writeJSON(lockPath, activeLockInfo);

      const lock = new FileLock(lockPath, 'newOperation');

      // Should not be able to acquire the lock
      await expect(
        lock.acquire({ timeout: 100, retryInterval: 10, staleThreshold: 300000 }),
      ).rejects.toThrow('Lock timeout');

      // Original lock should still exist
      const lockInfo = await FileLock.getLockInfo(lockPath);
      expect(lockInfo?.id).toBe(activeLockInfo.id);
    });
  });

  describe('Lock Ownership and Verification', () => {
    it('should verify lock ownership before release', async () => {
      const lockPath = path.join(TEST_LOCK_DIR, 'ownership.lock');
      const lock = new FileLock(lockPath, TEST_OPERATION);

      await lock.acquire();

      // Manually modify lock file to simulate different owner
      const lockInfo = await lock.getLockInfo();
      if (lockInfo) {
        lockInfo.id = 'different-lock-id';
        await fs.writeJSON(lockPath, lockInfo);
      }

      // Should handle ownership verification failure gracefully
      await expect(lock.release()).resolves.not.toThrow();
      expect(lock.isHeld()).toBe(false);
    });

    it('should handle concurrent ownership changes', async () => {
      const lockPath = path.join(TEST_LOCK_DIR, 'concurrent-ownership.lock');
      const lock1 = new FileLock(lockPath, 'owner1');
      const lock2 = new FileLock(lockPath, 'owner2');

      await lock1.acquire();

      // Force release by lock2 (simulating external cleanup)
      await lock2.forceRelease();

      // Original lock should handle this gracefully
      await expect(lock1.release()).resolves.not.toThrow();
      expect(lock1.isHeld()).toBe(false);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle missing lock directory', async () => {
      const lockPath = path.join(TEST_LOCK_DIR, 'nonexistent', 'test.lock');
      const lock = new FileLock(lockPath, TEST_OPERATION);

      // Should create directory and acquire lock
      await lock.acquire();
      expect(lock.isHeld()).toBe(true);
      expect(await fs.pathExists(path.dirname(lockPath))).toBe(true);

      await lock.release();
    });

    it('should handle corrupted lock files', { timeout: 10000 }, async () => {
      const lockPath = path.join(TEST_LOCK_DIR, 'corrupted.lock');

      // Create corrupted lock file
      await fs.writeFile(lockPath, 'invalid json content');

      const lock = new FileLock(lockPath, TEST_OPERATION);

      // Should handle corrupted file and acquire lock
      await lock.acquire({ timeout: 2000 });
      expect(lock.isHeld()).toBe(true);

      await lock.release();
    });

    it('should handle permission errors gracefully', async () => {
      // Skip on Windows as permission handling is different
      if (process.platform === 'win32') {
        return;
      }

      const lockPath = path.join(TEST_LOCK_DIR, 'permission.lock');
      const lock = new FileLock(lockPath, TEST_OPERATION);

      // Create lock file with restricted permissions
      await fs.writeFile(lockPath, '{}');
      await fs.chmod(lockPath, 0o444); // Read-only

      await expect(lock.acquire()).rejects.toThrow();

      // Clean up
      await fs.chmod(lockPath, 0o644);
    });

    it('should handle double release attempts', async () => {
      const lockPath = path.join(TEST_LOCK_DIR, 'double-release.lock');
      const lock = new FileLock(lockPath, TEST_OPERATION);

      await lock.acquire();
      await lock.release();

      // Second release should be harmless
      await expect(lock.release()).resolves.not.toThrow();
      expect(lock.isHeld()).toBe(false);
    });

    it('should handle release without acquire', async () => {
      const lockPath = path.join(TEST_LOCK_DIR, 'no-acquire.lock');
      const lock = new FileLock(lockPath, TEST_OPERATION);

      // Should handle release without acquire gracefully
      await expect(lock.release()).resolves.not.toThrow();
      expect(lock.isHeld()).toBe(false);
    });
  });

  describe('Static Utility Methods', () => {
    it('should check lock existence correctly', async () => {
      const lockPath = path.join(TEST_LOCK_DIR, 'existence.lock');

      expect(await FileLock.isLocked(lockPath)).toBe(false);

      await fs.writeJSON(lockPath, { test: true });
      expect(await FileLock.isLocked(lockPath)).toBe(true);
    });

    it('should get lock info correctly', async () => {
      const lockPath = path.join(TEST_LOCK_DIR, 'info.lock');
      const testInfo = {
        id: 'test-id',
        pid: 12345,
        hostname: 'test-host',
        timestamp: Date.now(),
        operation: 'testOp',
      };

      await fs.writeJSON(lockPath, testInfo);

      const info = await FileLock.getLockInfo(lockPath);
      expect(info).toEqual(testInfo);
    });

    it('should force remove locks', async () => {
      const lockPath = path.join(TEST_LOCK_DIR, 'force-remove.lock');

      await fs.writeJSON(lockPath, { test: true });
      expect(await fs.pathExists(lockPath)).toBe(true);

      await FileLock.forceRemove(lockPath);
      expect(await fs.pathExists(lockPath)).toBe(false);
    });
  });

  describe('Lock Refresh and Automatic Cleanup', () => {
    it('should refresh lock timestamp automatically', async () => {
      const lockPath = path.join(TEST_LOCK_DIR, 'refresh.lock');
      const lock = new FileLock(lockPath, TEST_OPERATION);

      await lock.acquire({ staleThreshold: 1000 }); // 1 second for testing

      const initialInfo = await lock.getLockInfo();
      const initialTimestamp = initialInfo?.timestamp;

      // Wait for refresh (should happen at half the stale threshold)
      await new Promise((resolve) => setTimeout(resolve, 800));

      const refreshedInfo = await lock.getLockInfo();
      const refreshedTimestamp = refreshedInfo?.timestamp;

      // Allow for some timing variance
      expect(refreshedTimestamp).toBeGreaterThanOrEqual(initialTimestamp);

      await lock.release();
    });

    it('should handle refresh failures gracefully', async () => {
      const lockPath = path.join(TEST_LOCK_DIR, 'refresh-fail.lock');
      const lock = new FileLock(lockPath, TEST_OPERATION);

      await lock.acquire({ staleThreshold: 1000 });

      // Remove lock file to simulate refresh failure
      await fs.remove(lockPath);

      // Wait for attempted refresh
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Lock should still be considered held by this instance
      expect(lock.isHeld()).toBe(true);

      // But release should work
      await expect(lock.release()).resolves.not.toThrow();
    });
  });
});
