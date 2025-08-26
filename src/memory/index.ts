// Memory Layer (Layer 2) - Main exports
// Provides centralized access to job memory, analytics, and runtime logging

// Core components
export { MemoryManager } from './memory-manager';
export { JobMemoryManager } from './job-memory';
export { RuntimeLogger } from './runtime-logger';
export { MemoryAnalytics } from './memory-analytics';

// Types and interfaces
export * from './types';

// Factory function to create a complete Memory Layer instance
import { MemoryManager } from './memory-manager';
import type { KnowledgeManager } from '../knowledge/knowledge-manager';
import type { MemoryConfig } from './types';
import { logger } from '../utils/logger';

/**
 * Create a configured Memory Layer instance
 * @param config Memory configuration
 * @param knowledgeManager Optional knowledge manager for integration
 * @returns Configured MemoryManager instance
 */
export async function createMemoryLayer(
  config: MemoryConfig,
  knowledgeManager?: KnowledgeManager,
): Promise<MemoryManager> {
  try {
    logger.info('Creating Memory Layer instance');

    const memoryManager = new MemoryManager(config, knowledgeManager);
    await memoryManager.initialize();

    logger.info('Memory Layer instance created successfully');
    return memoryManager;
  } catch (error) {
    logger.error('Failed to create Memory Layer instance:', error);
    throw new Error(
      `Memory Layer creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Default Memory Layer configuration
 * Provides sensible defaults for production use
 */
export const defaultMemoryConfig: MemoryConfig = {
  storageBasePath: '.ff2/memory',
  retentionDays: 30,
  logRetentionDays: 7,
  maxJobMemorySize: 1000, // Max entries per job
  compressionEnabled: true,
  analyticsEnabled: true,
  autoPromoteGotchas: true,
  performanceThresholds: {
    memoryOperationTimeMs: 50,
    logWriteTimeMs: 10,
    analyticsCalculationTimeMs: 200,
  },
};

/**
 * Development Memory Layer configuration
 * Optimized for development with more verbose logging
 */
export const developmentMemoryConfig: MemoryConfig = {
  storageBasePath: '.ff2/memory',
  retentionDays: 7,
  logRetentionDays: 3,
  maxJobMemorySize: 500,
  compressionEnabled: false,
  analyticsEnabled: true,
  autoPromoteGotchas: false, // Manual promotion in dev
  performanceThresholds: {
    memoryOperationTimeMs: 100, // More relaxed in dev
    logWriteTimeMs: 20,
    analyticsCalculationTimeMs: 500,
  },
};

/**
 * Test Memory Layer configuration
 * Optimized for testing with minimal retention
 */
export const testMemoryConfig: MemoryConfig = {
  storageBasePath: '.ff2/test/memory',
  retentionDays: 1,
  logRetentionDays: 1,
  maxJobMemorySize: 100,
  compressionEnabled: false,
  analyticsEnabled: false, // Disable analytics in tests
  autoPromoteGotchas: false,
  performanceThresholds: {
    memoryOperationTimeMs: 200, // Very relaxed for CI
    logWriteTimeMs: 50,
    analyticsCalculationTimeMs: 1000,
  },
};
