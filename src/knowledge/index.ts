// Knowledge Management System - Public API
// Provides centralized exports for all knowledge management components

export { KnowledgeManager } from './knowledge-manager';
export { CardStore } from './card-store';
export { GotchaTracker } from './gotcha-tracker';
export { ADRManager } from './adr-manager';
export { SmartRecommendationsEngine } from './smart-recommendations';

// Re-export knowledge-specific types
export type {
  KnowledgeCardFile,
  GotchaFile,
  ADRFile,
  FileOperationResult,
  SearchIndexEntry,
  KnowledgeStorageConfig,
  KnowledgeValidationRules,
  PromotionCandidate,
  EffectivenessMetrics,
  MaintenanceReport,
} from './types';

// Re-export smart recommendations types
export type {
  RecommendationContext,
  KnowledgeRecommendation,
  PatternInsight,
} from './smart-recommendations';

// Configuration factory
import type { KnowledgeConfig } from '../types';
import { KnowledgeManager } from './knowledge-manager';

/**
 * Create default knowledge system configuration
 * @param basePath Base storage path for knowledge files
 * @returns Complete knowledge configuration
 */
export function createKnowledgeConfig(basePath: string = './knowledge'): KnowledgeConfig {
  return {
    storageBasePath: basePath,
    maxCardsPerCategory: 100,
    gotchaPromotionThreshold: 3,
    effectivenessDecayRate: 0.05,
    cleanupIntervalDays: 90,
    autoPromoteGotchas: true,
  };
}

/**
 * Initialize knowledge management system with default configuration
 * @param config Optional configuration overrides
 * @returns Initialized KnowledgeManager instance
 */
export async function initializeKnowledgeSystem(config?: Partial<KnowledgeConfig>) {
  const fullConfig = {
    ...createKnowledgeConfig(),
    ...config,
  };

  const knowledgeManager = new KnowledgeManager(fullConfig);
  await knowledgeManager.initialize();

  return knowledgeManager;
}
