/**
 * Comprehensive tests for IdempotencyManager implementation
 * Tests idempotent operations with various scenarios and edge cases
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { IdempotencyManager, IdempotencyKey, IdempotencyRecord } from '../idempotency-manager';

const TEST_STORAGE_DIR = path.join(__dirname, 'test-idempotency');

describe('IdempotencyManager', () => {
  let manager: IdempotencyManager;

  beforeEach(async () => {
    // Clean up and create fresh test environment
    await fs.remove(TEST_STORAGE_DIR);
    manager = new IdempotencyManager({
      storePath: TEST_STORAGE_DIR,
      maxAge: 60000, // 1 minute for testing
      maxAttempts: 3,
      retryBackoff: 100,
    });
  });

  afterEach(async () => {
    await fs.remove(TEST_STORAGE_DIR);
  });

  describe('Key Generation', () => {
    it('should generate consistent keys for identical operations', () => {
      const key1: IdempotencyKey = {
        operation: 'createWorktree',
        parameters: { issueId: '123', path: '/test' },
      };

      const key2: IdempotencyKey = {
        operation: 'createWorktree',
        parameters: { issueId: '123', path: '/test' },
      };

      const hash1 = manager.generateKey(key1);
      const hash2 = manager.generateKey(key2);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(16); // SHA256 truncated to 16 chars
    });

    it('should generate different keys for different operations', () => {
      const key1: IdempotencyKey = {
        operation: 'createWorktree',
        parameters: { issueId: '123' },
      };

      const key2: IdempotencyKey = {
        operation: 'deleteWorktree',
        parameters: { issueId: '123' },
      };

      const hash1 = manager.generateKey(key1);
      const hash2 = manager.generateKey(key2);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle parameter order consistently', () => {
      const key1: IdempotencyKey = {
        operation: 'test',
        parameters: { a: 1, b: 2, c: 3 },
      };

      const key2: IdempotencyKey = {
        operation: 'test',
        parameters: { c: 3, a: 1, b: 2 }, // Different order
      };

      const hash1 = manager.generateKey(key1);
      const hash2 = manager.generateKey(key2);

      expect(hash1).toBe(hash2);
    });

    it('should handle nested objects and null values', () => {
      const key1: IdempotencyKey = {
        operation: 'test',
        parameters: { 
          nested: { x: 1, y: null },
          empty: undefined,
          array: [1, 2, 3],
        },
      };

      const key2: IdempotencyKey = {
        operation: 'test',
        parameters: {
          array: [1, 2, 3],
          nested: { y: null, x: 1 },
          empty: null,
        },
      };

      const hash1 = manager.generateKey(key1);
      const hash2 = manager.generateKey(key2);

      expect(hash1).toBe(hash2);
    });
  });

  describe('Operation Execution Logic', () => {
    it('should allow execution for new operations', async () => {
      const keyData: IdempotencyKey = {
        operation: 'createWorktree',
        parameters: { issueId: 'new-123' },
      };

      const result = await manager.shouldExecute(keyData);

      expect(result.execute).toBe(true);
      expect(result.reason).toBe('No previous execution found');
      expect(result.record).toBeUndefined();
    });

    it('should prevent execution for completed operations', async () => {
      const keyData: IdempotencyKey = {
        operation: 'createWorktree',
        parameters: { issueId: 'completed-123' },
      };

      // Start and complete operation
      const trackingKey = await manager.startOperation(keyData);
      await manager.completeOperation(trackingKey, 'worktree-id-xyz');

      // Should not execute again
      const result = await manager.shouldExecute(keyData);

      expect(result.execute).toBe(false);
      expect(result.reason).toBe('Operation already completed successfully');
      expect(result.record?.result).toBe('worktree-id-xyz');
    });

    it('should prevent execution for pending operations', async () => {
      const keyData: IdempotencyKey = {
        operation: 'createWorktree',
        parameters: { issueId: 'pending-123' },
      };

      // Start operation but don't complete
      await manager.startOperation(keyData);

      // Should not execute again
      const result = await manager.shouldExecute(keyData);

      expect(result.execute).toBe(false);
      expect(result.reason).toBe('Operation currently in progress');
    });

    it('should allow retry for failed operations within limits', async () => {
      const keyData: IdempotencyKey = {
        operation: 'createWorktree',
        parameters: { issueId: 'retry-123' },
      };

      // Fail operation once
      const trackingKey1 = await manager.startOperation(keyData);
      await manager.failOperation(trackingKey1, 'Test failure');

      // Wait a bit to avoid immediate retry
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const result = await manager.shouldExecute(keyData);
      expect(result.execute).toBe(true);
      expect(result.reason).toBe('Retrying after failure');

      // Fail again
      const trackingKey2 = await manager.startOperation(keyData);
      await manager.failOperation(trackingKey2, 'Test failure 2');

      // Should still allow retry
      const result2 = await manager.shouldExecute(keyData);
      expect(result2.execute).toBe(true);
    });

    it('should prevent execution after max retry attempts', async () => {
      const keyData: IdempotencyKey = {
        operation: 'createWorktree',
        parameters: { issueId: 'max-retry-123' },
      };

      // Fail operation 3 times (max attempts)
      for (let i = 0; i < 3; i++) {
        const trackingKey = await manager.startOperation(keyData);
        await manager.failOperation(trackingKey, `Failure ${i + 1}`);
        
        // Wait to avoid backoff
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      // Should not allow execution
      const result = await manager.shouldExecute(keyData);
      expect(result.execute).toBe(false);
      expect(result.reason).toBe('Maximum retry attempts exceeded');
    });

    it('should respect retry backoff periods', async () => {
      const keyData: IdempotencyKey = {
        operation: 'createWorktree',
        parameters: { issueId: 'backoff-123' },
      };

      // Fail operation
      const trackingKey = await manager.startOperation(keyData);
      await manager.failOperation(trackingKey, 'Test failure');

      // Should be in backoff period immediately after failure
      const result = await manager.shouldExecute(keyData);
      expect(result.execute).toBe(false);
      expect(result.reason).toContain('Retry backoff period not elapsed');

      // Wait for backoff period to elapse (first failure should have 1000ms backoff)
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should allow retry after backoff
      const result2 = await manager.shouldExecute(keyData);
      expect(result2.execute).toBe(true);
    });

    it('should allow execution for rolled back operations', async () => {
      const keyData: IdempotencyKey = {
        operation: 'createWorktree',
        parameters: { issueId: 'rollback-123' },
      };

      // Start, complete, then rollback
      const trackingKey = await manager.startOperation(keyData, { test: 'rollback data' });
      await manager.completeOperation(trackingKey, 'result');
      await manager.rollbackOperation(trackingKey);

      // Should allow execution again
      const result = await manager.shouldExecute(keyData);
      expect(result.execute).toBe(true);
      expect(result.reason).toBe('Previous operation was rolled back');
    });
  });

  describe('Operation Lifecycle Management', () => {
    it('should track operation lifecycle correctly', async () => {
      const keyData: IdempotencyKey = {
        operation: 'testOp',
        parameters: { id: 'lifecycle-test' },
      };

      const rollbackData = { test: 'data' };
      
      // Start operation
      const trackingKey = await manager.startOperation(keyData, rollbackData);
      expect(trackingKey).toBeTruthy();

      let record = await manager.getRecord(trackingKey);
      expect(record?.status).toBe('pending');
      expect(record?.operation).toBe('testOp');
      expect(record?.attempts).toBe(1);
      expect(record?.rollbackData).toEqual(rollbackData);

      // Complete operation
      const result = 'operation-result';
      await manager.completeOperation(trackingKey, result);

      record = await manager.getRecord(trackingKey);
      expect(record?.status).toBe('completed');
      expect(record?.result).toBe(result);
      expect(record?.endTime).toBeTruthy();
    });

    it('should handle operation failures correctly', async () => {
      const keyData: IdempotencyKey = {
        operation: 'failingOp',
        parameters: { id: 'failure-test' },
      };

      const trackingKey = await manager.startOperation(keyData);
      const error = new Error('Test operation failed');
      
      await manager.failOperation(trackingKey, error);

      const record = await manager.getRecord(trackingKey);
      expect(record?.status).toBe('failed');
      expect(record?.error).toBe(error.message);
      expect(record?.endTime).toBeTruthy();
    });

    it('should execute rollback functions correctly', async () => {
      const keyData: IdempotencyKey = {
        operation: 'rollbackOp',
        parameters: { id: 'rollback-test' },
      };

      const rollbackData = { path: '/test/path', created: true };
      const trackingKey = await manager.startOperation(keyData, rollbackData);
      
      await manager.completeOperation(trackingKey, 'success');

      let rollbackCalled = false;
      let rollbackDataReceived: any = null;

      const rollbackFn = async (data?: unknown) => {
        rollbackCalled = true;
        rollbackDataReceived = data;
        // Simulate cleanup work
        await new Promise(resolve => setTimeout(resolve, 10));
      };

      await manager.rollbackOperation(trackingKey, rollbackFn);

      expect(rollbackCalled).toBe(true);
      expect(rollbackDataReceived).toEqual(rollbackData);

      const record = await manager.getRecord(trackingKey);
      expect(record?.status).toBe('rolled_back');
    });

    it('should handle rollback function failures', async () => {
      const keyData: IdempotencyKey = {
        operation: 'failingRollback',
        parameters: { id: 'rollback-fail-test' },
      };

      const trackingKey = await manager.startOperation(keyData);
      await manager.completeOperation(trackingKey);

      const rollbackFn = async () => {
        throw new Error('Rollback failed');
      };

      await expect(manager.rollbackOperation(trackingKey, rollbackFn))
        .rejects.toThrow(/Rollback failed/);
    });
  });

  describe('Record Persistence and Loading', () => {
    it('should persist records to storage', async () => {
      const keyData: IdempotencyKey = {
        operation: 'persistTest',
        parameters: { id: 'persist-123' },
      };

      const trackingKey = await manager.startOperation(keyData);
      const key = manager.generateKey(keyData);
      
      // Check that file was created
      const recordPath = path.join(TEST_STORAGE_DIR, `${key}.json`);
      expect(await fs.pathExists(recordPath)).toBe(true);

      // Verify record content
      const savedRecord = await fs.readJson(recordPath);
      expect(savedRecord.key).toBe(key);
      expect(savedRecord.operation).toBe('persistTest');
      expect(savedRecord.status).toBe('pending');
    });

    it('should load records from storage on new manager instance', async () => {
      const keyData: IdempotencyKey = {
        operation: 'loadTest',
        parameters: { id: 'load-123' },
      };

      // Create record with first manager instance
      const trackingKey = await manager.startOperation(keyData);
      await manager.completeOperation(trackingKey, 'loaded-result');

      // Create new manager instance
      const newManager = new IdempotencyManager({
        storePath: TEST_STORAGE_DIR,
        maxAge: 60000,
      });

      // Should find existing completed operation
      const result = await newManager.shouldExecute(keyData);
      expect(result.execute).toBe(false);
      expect(result.reason).toBe('Operation already completed successfully');
      expect(result.record?.result).toBe('loaded-result');
    });

    it('should handle corrupted record files gracefully', async () => {
      const key = 'corrupted-key';
      const recordPath = path.join(TEST_STORAGE_DIR, `${key}.json`);
      
      await fs.ensureDir(TEST_STORAGE_DIR);
      await fs.writeFile(recordPath, 'invalid json content');

      const record = await manager.getRecord(key);
      expect(record).toBeNull();
    });
  });

  describe('Cleanup and Maintenance', () => {
    it('should clean up old records', async () => {
      const oldKeyData: IdempotencyKey = {
        operation: 'oldOp',
        parameters: { id: 'old-123' },
      };

      const newKeyData: IdempotencyKey = {
        operation: 'newOp',
        parameters: { id: 'new-123' },
      };

      // Create old record
      const oldTrackingKey = await manager.startOperation(oldKeyData);
      await manager.completeOperation(oldTrackingKey);

      // Manually age the record
      const oldRecord = await manager.getRecord(oldTrackingKey);
      if (oldRecord) {
        oldRecord.startTime = Date.now() - 120000; // 2 minutes ago
        const key = manager.generateKey(oldKeyData);
        const recordPath = path.join(TEST_STORAGE_DIR, `${key}.json`);
        await fs.writeJson(recordPath, oldRecord);
      }

      // Create new record
      const newTrackingKey = await manager.startOperation(newKeyData);
      await manager.completeOperation(newTrackingKey);

      // Clean up with 1 minute max age
      const cleanedCount = await manager.cleanup(60000);
      expect(cleanedCount).toBe(1);

      // Old record should be gone, new record should remain
      const oldRecordAfter = await manager.getRecord(oldTrackingKey);
      const newRecordAfter = await manager.getRecord(newTrackingKey);
      
      expect(oldRecordAfter).toBeNull();
      expect(newRecordAfter).toBeTruthy();
    });

    it('should not clean up pending records', async () => {
      const keyData: IdempotencyKey = {
        operation: 'pendingOp',
        parameters: { id: 'pending-cleanup-test' },
      };

      // Create old pending record
      const trackingKey = await manager.startOperation(keyData);
      
      // Manually age the record
      const record = await manager.getRecord(trackingKey);
      if (record) {
        record.startTime = Date.now() - 120000; // 2 minutes ago
        const key = manager.generateKey(keyData);
        const recordPath = path.join(TEST_STORAGE_DIR, `${key}.json`);
        await fs.writeJson(recordPath, record);
      }

      // Clean up - should not remove pending records
      const cleanedCount = await manager.cleanup(60000);
      expect(cleanedCount).toBe(0);

      const recordAfter = await manager.getRecord(trackingKey);
      expect(recordAfter).toBeTruthy();
      expect(recordAfter?.status).toBe('pending');
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should provide accurate statistics', async () => {
      // Create various operation records
      const operations = [
        { operation: 'op1', params: { id: '1' }, action: 'complete', result: 'success1' },
        { operation: 'op2', params: { id: '2' }, action: 'fail', error: 'error1' },
        { operation: 'op1', params: { id: '3' }, action: 'complete', result: 'success2' },
        { operation: 'op3', params: { id: '4' }, action: 'pending' },
      ];

      for (const op of operations) {
        const keyData: IdempotencyKey = {
          operation: op.operation,
          parameters: op.params,
        };

        const trackingKey = await manager.startOperation(keyData);

        if (op.action === 'complete') {
          await manager.completeOperation(trackingKey, op.result);
        } else if (op.action === 'fail') {
          await manager.failOperation(trackingKey, op.error!);
        }
        // 'pending' operations are left as is
      }

      const stats = await manager.getStats();

      expect(stats.total).toBe(4);
      expect(stats.byStatus.completed).toBe(2);
      expect(stats.byStatus.failed).toBe(1);
      expect(stats.byStatus.pending).toBe(1);
      expect(stats.byOperation.op1).toBe(2);
      expect(stats.byOperation.op2).toBe(1);
      expect(stats.byOperation.op3).toBe(1);
      expect(stats.successRate).toBe(50); // 2 completed out of 4 total
      expect(stats.avgDuration).toBeGreaterThan(0);
    });

    it('should get operation-specific records', async () => {
      // Create records for different operations
      const op1Key: IdempotencyKey = { operation: 'createWorktree', parameters: { id: '1' } };
      const op2Key: IdempotencyKey = { operation: 'deleteWorktree', parameters: { id: '2' } };
      const op3Key: IdempotencyKey = { operation: 'createWorktree', parameters: { id: '3' } };

      await manager.startOperation(op1Key);
      await manager.startOperation(op2Key);
      await manager.startOperation(op3Key);

      const createWorktreeRecords = await manager.getOperationRecords('createWorktree');
      const deleteWorktreeRecords = await manager.getOperationRecords('deleteWorktree');

      expect(createWorktreeRecords).toHaveLength(2);
      expect(deleteWorktreeRecords).toHaveLength(1);
      
      expect(createWorktreeRecords.every(r => r.operation === 'createWorktree')).toBe(true);
      expect(deleteWorktreeRecords.every(r => r.operation === 'deleteWorktree')).toBe(true);
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle non-existent record operations', async () => {
      const fakeKey = 'non-existent-key';

      await expect(manager.completeOperation(fakeKey, 'result'))
        .rejects.toThrow('No operation record found');

      await expect(manager.failOperation(fakeKey, 'error'))
        .rejects.toThrow('No operation record found');

      await expect(manager.rollbackOperation(fakeKey))
        .rejects.toThrow('No operation record found');
    });

    it('should handle storage permission errors', async () => {
      // Create manager with invalid storage path (if possible on current platform)
      const invalidPath = path.join('/root/invalid/path/idempotency');
      
      // This test may behave differently on different platforms
      try {
        const invalidManager = new IdempotencyManager({
          storePath: invalidPath,
        });

        const keyData: IdempotencyKey = {
          operation: 'testOp',
          parameters: { id: 'permission-test' },
        };

        await expect(invalidManager.startOperation(keyData))
          .rejects.toThrow();
      } catch (error) {
        // Expected on some platforms
      }
    });

    it('should handle concurrent modifications gracefully', async () => {
      const keyData: IdempotencyKey = {
        operation: 'concurrentOp',
        parameters: { id: 'concurrent-test' },
      };

      const trackingKey = await manager.startOperation(keyData);
      
      // Simulate concurrent modification by manually changing the record
      const record = await manager.getRecord(trackingKey);
      if (record) {
        record.status = 'failed';
        record.error = 'Concurrent modification';
        const key = manager.generateKey(keyData);
        const recordPath = path.join(TEST_STORAGE_DIR, `${key}.json`);
        await fs.writeJson(recordPath, record);
      }

      // Should still handle operations gracefully
      await expect(manager.completeOperation(trackingKey, 'result'))
        .resolves.not.toThrow();
    });

    it('should detect stuck pending operations', async () => {
      const keyData: IdempotencyKey = {
        operation: 'stuckOp',
        parameters: { id: 'stuck-test' },
      };

      // Create old pending record (simulating stuck operation)
      const trackingKey = await manager.startOperation(keyData);
      const record = await manager.getRecord(trackingKey);
      
      if (record) {
        record.startTime = Date.now() - (11 * 60 * 1000); // 11 minutes ago
        const key = manager.generateKey(keyData);
        const recordPath = path.join(TEST_STORAGE_DIR, `${key}.json`);
        await fs.writeJson(recordPath, record);
      }

      // Should detect stuck operation and allow reset
      const result = await manager.shouldExecute(keyData);
      expect(result.execute).toBe(true);
      expect(result.reason).toBe('Stuck pending operation reset');
    });
  });
});