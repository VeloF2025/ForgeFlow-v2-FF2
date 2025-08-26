// ForgeFlow V2 Intelligence Layer - Public API
// Context Pack Assembler with integrated ML-driven content prioritization

// Core Components
export {
  ContextPackAssembler,
  type AssemblyRequest,
  type AssemblyResult,
} from './context-pack-assembler';
export {
  default as TokenBudgetManager,
  type ContentSection,
  type TokenCountResult,
} from './token-budget-manager';
export {
  default as ContentPrioritizer,
  type ContentItem,
  type PrioritizationContext,
  type PrioritizationResult,
} from './content-prioritizer';
export {
  default as ProvenanceTracker,
  type TrackingSession,
  type SourceRegistration,
  type ProvenanceReport,
} from './provenance-tracker';
export {
  default as AgentTemplateEngine,
  type TemplateRenderContext,
  type TemplateRenderResult,
} from './agent-template-engine';
export { default as CacheEngine, type CacheKey, type CacheStats } from './cache-engine';

// Types and Interfaces
export type * from './types';

// Integration Factory
import { ContextPackAssembler, type AssemblyRequest } from './context-pack-assembler';
import type { ForgeFlowIndexManager } from '../indexing/index-manager';
import type { HybridRetriever } from '../retrieval/hybrid-retriever';
import type { KnowledgeManager } from '../knowledge/knowledge-manager';
import type { MemoryManager } from '../memory/memory-manager';
import { logger } from '../utils/logger';
import type { ContextPackAssemblerConfig } from './types';

/**
 * Default configuration for the Context Pack Assembler
 */
export const defaultAssemblerConfig: ContextPackAssemblerConfig = {
  // Token Management
  maxTokensPerPack: 5000,
  tokenCountingMethod: 'word',

  // Content Prioritization
  memoryContentPercentage: 30, // ≥30% from job/project memory
  knowledgeContentPercentage: 40,
  realtimeContentPercentage: 30,

  // Performance Settings
  maxGenerationTimeMs: 1000, // <1s target
  cacheEnabled: true,
  cacheTtlMinutes: 15,

  // Integration Settings
  enableProvenanceTracking: true,
  enableContentDeduplication: true,
  enableAdaptiveOptimization: true,

  // Agent Template Settings
  templateBasePath: './templates/agents',
  customTemplateEnabled: true,

  // ML Enhancement
  enableMLContentRanking: true,
  contentSimilarityThreshold: 0.85,
};

/**
 * Development configuration with more verbose settings
 */
export const developmentAssemblerConfig: ContextPackAssemblerConfig = {
  ...defaultAssemblerConfig,
  maxGenerationTimeMs: 2000, // More relaxed in development
  cacheEnabled: false, // Disable cache for development
  enableProvenanceTracking: true, // Full tracking for debugging
  enableMLContentRanking: false, // Simpler ranking in development
};

/**
 * Production configuration optimized for performance
 */
export const productionAssemblerConfig: ContextPackAssemblerConfig = {
  ...defaultAssemblerConfig,
  maxGenerationTimeMs: 800, // Strict performance target
  cacheEnabled: true,
  cacheTtlMinutes: 30, // Longer cache TTL in production
  enableProvenanceTracking: false, // Reduce overhead in production
  enableMLContentRanking: true,
  enableAdaptiveOptimization: true,
};

/**
 * Phase 2 component integrations interface
 */
export interface Phase2Integrations {
  indexManager?: ForgeFlowIndexManager;
  retriever?: HybridRetriever;
  knowledgeManager?: KnowledgeManager;
  memoryManager?: MemoryManager;
}

/**
 * Intelligence Layer Factory - Creates fully integrated Context Pack Assembler
 *
 * @param config Configuration for the assembler
 * @param integrations Phase 2 component integrations
 * @returns Initialized ContextPackAssembler instance
 */
export async function createIntelligenceLayer(
  config: ContextPackAssemblerConfig = defaultAssemblerConfig,
  integrations: Phase2Integrations = {},
): Promise<ContextPackAssembler> {
  logger.info('[IntelligenceLayer] Creating Context Pack Assembler with Phase 2 integrations');

  try {
    // Validate integrations
    const availableIntegrations = validateIntegrations(integrations);

    // Create assembler with integrations
    const assembler = new ContextPackAssembler(config, availableIntegrations);

    // Initialize the assembler
    await assembler.initialize();

    logger.info('[IntelligenceLayer] Context Pack Assembler created successfully');
    logger.info('[IntelligenceLayer] Available integrations:', Object.keys(availableIntegrations));

    return assembler;
  } catch (error) {
    logger.error('[IntelligenceLayer] Failed to create Intelligence Layer:', error);
    throw new Error(
      `Intelligence Layer creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Validate and filter available integrations
 */
function validateIntegrations(integrations: Phase2Integrations): Phase2Integrations {
  const validated: Phase2Integrations = {};

  if (integrations.indexManager) {
    validated.indexManager = integrations.indexManager;
    logger.debug('[IntelligenceLayer] Index Manager integration available');
  } else {
    logger.warn('[IntelligenceLayer] Index Manager not available - search functionality limited');
  }

  if (integrations.retriever) {
    validated.retriever = integrations.retriever;
    logger.debug('[IntelligenceLayer] Hybrid Retriever integration available');
  } else {
    logger.warn('[IntelligenceLayer] Hybrid Retriever not available - ML retrieval disabled');
  }

  if (integrations.knowledgeManager) {
    validated.knowledgeManager = integrations.knowledgeManager;
    logger.debug('[IntelligenceLayer] Knowledge Manager integration available');
  } else {
    logger.warn('[IntelligenceLayer] Knowledge Manager not available - knowledge cards disabled');
  }

  if (integrations.memoryManager) {
    validated.memoryManager = integrations.memoryManager;
    logger.debug('[IntelligenceLayer] Memory Manager integration available');
  } else {
    logger.warn('[IntelligenceLayer] Memory Manager not available - job memory disabled');
  }

  return validated;
}

/**
 * Quick assembly helper for common use cases
 *
 * @param assembler The initialized assembler
 * @param issueId Issue identifier
 * @param agentType Agent type for context optimization
 * @param description Issue description for context gathering
 * @param options Additional options
 */
export async function quickAssemble(
  assembler: ContextPackAssembler,
  issueId: string,
  agentType: string,
  description: string,
  options: {
    priority?: 'low' | 'medium' | 'high' | 'critical';
    projectContext?: string;
    constraints?: string[];
    preferences?: Record<string, unknown>;
    forceRefresh?: boolean;
  } = {},
) {
  const request: AssemblyRequest = {
    issueId,
    agentType,
    priority: options.priority || 'medium',
    projectContext: options.projectContext || '',
    issueDescription: description,
    constraints: options.constraints || [],
    preferences: options.preferences || {},
    forceRefresh: options.forceRefresh || false,
  };

  return assembler.assembleContextPack(request);
}

/**
 * Batch assembly for multiple requests
 *
 * @param assembler The initialized assembler
 * @param requests Array of assembly requests
 * @param maxConcurrency Maximum number of concurrent assemblies
 */
export async function batchAssemble(
  assembler: ContextPackAssembler,
  requests: AssemblyRequest[],
  maxConcurrency: number = 3,
) {
  logger.info(
    `[IntelligenceLayer] Starting batch assembly of ${requests.length} requests with concurrency ${maxConcurrency}`,
  );

  const results = [];
  const chunks = [];

  // Split requests into chunks for controlled concurrency
  for (let i = 0; i < requests.length; i += maxConcurrency) {
    chunks.push(requests.slice(i, i + maxConcurrency));
  }

  for (const chunk of chunks) {
    const chunkPromises = chunk.map((request) =>
      assembler.assembleContextPack(request).catch((error) => ({
        error,
        request,
      })),
    );

    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);
  }

  const successful = results.filter((r) => !('error' in r)).length;
  const failed = results.length - successful;

  logger.info(
    `[IntelligenceLayer] Batch assembly completed: ${successful} successful, ${failed} failed`,
  );

  return results;
}

/**
 * Health check for the Intelligence Layer
 *
 * @param assembler The initialized assembler
 */
export async function healthCheck(assembler: ContextPackAssembler): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  components: Record<string, 'ok' | 'warning' | 'error'>;
  metrics: any;
  timestamp: Date;
}> {
  const timestamp = new Date();
  const components: Record<string, 'ok' | 'warning' | 'error'> = {};

  try {
    // Test basic assembly with minimal request
    const testRequest: AssemblyRequest = {
      issueId: 'health-check',
      agentType: 'code-implementer',
      priority: 'low',
      projectContext: 'health-check',
      issueDescription: 'Health check test',
      constraints: [],
      preferences: {},
    };

    const startTime = Date.now();
    const result = await assembler.assembleContextPack(testRequest);
    const duration = Date.now() - startTime;

    // Check performance
    components.assembly = duration < 2000 ? 'ok' : duration < 5000 ? 'warning' : 'error';

    // Check result quality
    components.quality =
      result.warnings.filter((w) => w.severity === 'error').length === 0 ? 'ok' : 'error';

    // Get metrics
    const metrics = assembler.getStats();
    components.metrics = 'ok';

    // Determine overall status
    const componentStatuses = Object.values(components);
    const status = componentStatuses.includes('error')
      ? 'unhealthy'
      : componentStatuses.includes('warning')
        ? 'degraded'
        : 'healthy';

    return {
      status,
      components,
      metrics,
      timestamp,
    };
  } catch (error) {
    logger.error('[IntelligenceLayer] Health check failed:', error);

    return {
      status: 'unhealthy',
      components: { assembly: 'error', quality: 'error', metrics: 'error' },
      metrics: null,
      timestamp,
    };
  }
}

/**
 * Intelligence Layer utilities
 */
export const IntelligenceUtils = {
  /**
   * Validate assembly request
   */
  validateRequest(request: AssemblyRequest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!request.issueId || request.issueId.trim() === '') {
      errors.push('issueId is required');
    }

    if (!request.agentType || request.agentType.trim() === '') {
      errors.push('agentType is required');
    }

    if (!request.issueDescription || request.issueDescription.trim() === '') {
      errors.push('issueDescription is required');
    }

    if (!['low', 'medium', 'high', 'critical'].includes(request.priority)) {
      errors.push('priority must be one of: low, medium, high, critical');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },

  /**
   * Estimate assembly time based on request complexity
   */
  estimateAssemblyTime(request: AssemblyRequest): number {
    let baseTime = 500; // Base 500ms

    // Add time for description complexity
    baseTime += Math.min(200, request.issueDescription.length / 10);

    // Add time for constraints
    baseTime += request.constraints.length * 50;

    // Add time for high priority
    if (request.priority === 'high' || request.priority === 'critical') {
      baseTime += 100;
    }

    return baseTime;
  },

  /**
   * Generate cache key for request
   */
  generateCacheKey(request: AssemblyRequest): string {
    const crypto = require('crypto');
    const keyData = `${request.issueId}:${request.agentType}:${request.issueDescription}:${request.projectContext}`;
    return crypto.createHash('md5').update(keyData).digest('hex');
  },
};

/**
 * Export configuration presets
 */
export const ConfigPresets = {
  default: defaultAssemblerConfig,
  development: developmentAssemblerConfig,
  production: productionAssemblerConfig,

  /**
   * Create custom configuration
   */
  custom(overrides: Partial<ContextPackAssemblerConfig>): ContextPackAssemblerConfig {
    return { ...defaultAssemblerConfig, ...overrides };
  },

  /**
   * High performance configuration
   */
  highPerformance: {
    ...defaultAssemblerConfig,
    maxGenerationTimeMs: 600,
    cacheEnabled: true,
    cacheTtlMinutes: 60,
    enableProvenanceTracking: false,
    enableMLContentRanking: true,
    maxTokensPerPack: 4000, // Slightly lower for better performance
  },

  /**
   * High accuracy configuration
   */
  highAccuracy: {
    ...defaultAssemblerConfig,
    maxGenerationTimeMs: 1500,
    enableProvenanceTracking: true,
    enableMLContentRanking: true,
    enableAdaptiveOptimization: true,
    contentSimilarityThreshold: 0.9,
    maxTokensPerPack: 6000, // Higher for more comprehensive context
  },
};

/**
 * Version information
 */
export const VERSION = '1.0.0';
export const API_VERSION = 'v2';

logger.info(`[IntelligenceLayer] Exported API version ${API_VERSION} (${VERSION})`);

// Default export for convenience
export default {
  ContextPackAssembler,
  createIntelligenceLayer,
  quickAssemble,
  batchAssemble,
  healthCheck,
  IntelligenceUtils,
  ConfigPresets,
  VERSION,
  API_VERSION,
};
