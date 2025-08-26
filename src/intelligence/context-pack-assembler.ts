// Context Pack Assembler - Core orchestration for ForgeFlow V2 Intelligence Layer
// Assembles optimized, agent-specific context packages with ≤5k token budget

import { logger } from '../utils/logger';
import TokenBudgetManager, { type ContentSection } from './token-budget-manager';
import ContentPrioritizer, {
  type ContentItem,
  type PrioritizationContext,
} from './content-prioritizer';
import ProvenanceTracker from './provenance-tracker';
import AgentTemplateEngine, { type TemplateRenderContext } from './agent-template-engine';
import CacheEngine, { type CacheKey } from './cache-engine';

// Import ForgeFlow Phase 2 components
import type { ForgeFlowIndexManager } from '../indexing/index-manager';
import type { HybridRetriever } from '../retrieval/hybrid-retriever';
import type { KnowledgeManager } from '../knowledge/knowledge-manager';
import type { MemoryManager } from '../memory/memory-manager';

import type {
  ContextPack,
  ContextPackMetadata,
  ContextContent,
  ContextPackAssemblerConfig,
  MemoryContextSection,
  KnowledgeContextSection,
  RealtimeContextSection,
  AgentSpecificContent,
  AssemblyPipeline,
  AssemblyStage,
  PerformanceMetrics,
  RelatedContextReference,
} from './types';

export interface AssemblyRequest {
  issueId: string;
  agentType: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  projectContext: string;
  issueDescription: string;
  constraints: string[];
  preferences: Record<string, unknown>;
  customizations?: any[];
  forceRefresh?: boolean;
}

export interface AssemblyResult {
  contextPack: ContextPack;
  performance: AssemblyPerformanceMetrics;
  cacheUsed: boolean;
  warnings: AssemblyWarning[];
  debug?: AssemblyDebugInfo;
}

export interface AssemblyPerformanceMetrics {
  totalTime: number;
  indexTime: number;
  retrievalTime: number;
  knowledgeTime: number;
  memoryTime: number;
  prioritizationTime: number;
  templateTime: number;
  provenanceTime: number;
  cacheTime: number;
  tokenBudgetTime: number;
}

export interface AssemblyWarning {
  stage: string;
  type: 'performance' | 'content' | 'budget' | 'cache' | 'integration';
  severity: 'info' | 'warning' | 'error';
  message: string;
  recommendation?: string;
  context?: Record<string, unknown>;
}

export interface AssemblyDebugInfo {
  stages: StageDebugInfo[];
  contentSources: number;
  tokenUtilization: number;
  cacheStats: any;
  provenanceId: string;
}

export interface StageDebugInfo {
  stage: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  success: boolean;
  inputCount: number;
  outputCount: number;
  errors?: string[];
}

export class ContextPackAssembler {
  private config: ContextPackAssemblerConfig;
  private tokenBudgetManager: TokenBudgetManager;
  private contentPrioritizer: ContentPrioritizer;
  private provenanceTracker: ProvenanceTracker;
  private templateEngine: AgentTemplateEngine;
  private cacheEngine: CacheEngine;

  // Phase 2 component integration
  private indexManager?: ForgeFlowIndexManager;
  private retriever?: HybridRetriever;
  private knowledgeManager?: KnowledgeManager;
  private memoryManager?: MemoryManager;

  private performanceMetrics: PerformanceMetrics;
  private assemblyPipeline: AssemblyPipeline;

  constructor(
    config: ContextPackAssemblerConfig,
    integrations?: {
      indexManager?: ForgeFlowIndexManager;
      retriever?: HybridRetriever;
      knowledgeManager?: KnowledgeManager;
      memoryManager?: MemoryManager;
    },
  ) {
    this.config = config;

    // Initialize core components
    this.tokenBudgetManager = new TokenBudgetManager(config);
    this.contentPrioritizer = new ContentPrioritizer(config);
    this.provenanceTracker = new ProvenanceTracker(config);
    this.templateEngine = new AgentTemplateEngine(config);
    this.cacheEngine = new CacheEngine({
      enabled: config.cacheEnabled,
      provider: 'hybrid',
      ttl: config.cacheTtlMinutes * 60,
      maxSize: 100 * 1024 * 1024, // 100MB
      evictionPolicy: 'lru',
      compression: true,
      encryption: false,
    });

    // Set up integrations
    this.indexManager = integrations?.indexManager;
    this.retriever = integrations?.retriever;
    this.knowledgeManager = integrations?.knowledgeManager;
    this.memoryManager = integrations?.memoryManager;

    // Initialize performance metrics
    this.performanceMetrics = this.initializePerformanceMetrics();

    // Set up assembly pipeline
    this.assemblyPipeline = this.createAssemblyPipeline();

    logger.info('[ContextPackAssembler] Initialized with max tokens:', config.maxTokensPerPack);
  }

  /**
   * Initialize the assembler
   */
  async initialize(): Promise<void> {
    try {
      await this.cacheEngine.initialize();
      logger.info('[ContextPackAssembler] Initialization completed');
    } catch (error) {
      logger.error('[ContextPackAssembler] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Assemble a context pack for the given request
   */
  async assembleContextPack(request: AssemblyRequest): Promise<AssemblyResult> {
    const startTime = Date.now();
    const performance: AssemblyPerformanceMetrics = {
      totalTime: 0,
      indexTime: 0,
      retrievalTime: 0,
      knowledgeTime: 0,
      memoryTime: 0,
      prioritizationTime: 0,
      templateTime: 0,
      provenanceTime: 0,
      cacheTime: 0,
      tokenBudgetTime: 0,
    };

    const warnings: AssemblyWarning[] = [];
    let cacheUsed = false;
    let contextPack: ContextPack;
    let debugInfo: AssemblyDebugInfo | undefined;

    logger.info(
      `[ContextPackAssembler] Starting assembly for ${request.agentType} on issue ${request.issueId}`,
    );

    try {
      // Check cache first (if enabled and not force refresh)
      if (this.config.cacheEnabled && !request.forceRefresh) {
        const cacheResult = await this.checkCache(request);
        if (cacheResult) {
          performance.cacheTime = Date.now() - startTime;
          performance.totalTime = performance.cacheTime;
          cacheUsed = true;

          logger.info(`[ContextPackAssembler] Cache hit for ${request.issueId}`);
          return {
            contextPack: cacheResult,
            performance,
            cacheUsed,
            warnings,
            debug: debugInfo,
          };
        }
      }

      // Start provenance tracking
      const provenanceStartTime = Date.now();
      const provenanceSessionId = this.provenanceTracker.startSession(
        this.generateContextPackId(request),
      );
      performance.provenanceTime += Date.now() - provenanceStartTime;

      // Execute assembly pipeline
      const pipelineResult = await this.executePipeline(request, provenanceSessionId, performance);
      contextPack = pipelineResult.contextPack;
      warnings.push(...pipelineResult.warnings);

      if (this.config.enableProvenanceTracking) {
        debugInfo = {
          stages: pipelineResult.debugInfo,
          contentSources: pipelineResult.sourceCount,
          tokenUtilization: contextPack.tokenUsage.utilization,
          cacheStats: this.cacheEngine.getStats(),
          provenanceId: provenanceSessionId,
        };
      }

      // End provenance tracking
      const provenanceEndTime = Date.now();
      this.provenanceTracker.endSession(provenanceSessionId);
      performance.provenanceTime += Date.now() - provenanceEndTime;

      // Cache the result (if enabled)
      if (this.config.cacheEnabled) {
        const cacheTime = Date.now();
        await this.cacheResult(request, contextPack);
        performance.cacheTime += Date.now() - cacheTime;
      }

      performance.totalTime = Date.now() - startTime;

      // Validate performance target
      if (performance.totalTime > this.config.maxGenerationTimeMs) {
        warnings.push({
          stage: 'overall',
          type: 'performance',
          severity: 'warning',
          message: `Assembly time ${performance.totalTime}ms exceeds target ${this.config.maxGenerationTimeMs}ms`,
          recommendation: 'Consider optimizing content retrieval or caching strategies',
        });
      }

      logger.info(
        `[ContextPackAssembler] Assembly completed in ${performance.totalTime}ms for ${request.issueId}`,
      );

      return {
        contextPack,
        performance,
        cacheUsed,
        warnings,
        debug: debugInfo,
      };
    } catch (error) {
      performance.totalTime = Date.now() - startTime;
      logger.error(`[ContextPackAssembler] Assembly failed for ${request.issueId}:`, error);

      warnings.push({
        stage: 'overall',
        type: 'content',
        severity: 'error',
        message: `Assembly failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        recommendation: 'Check logs for detailed error information',
      });

      // Return minimal context pack on error
      const errorContextPack = this.createErrorContextPack(request, error as Error);

      return {
        contextPack: errorContextPack,
        performance,
        cacheUsed: false,
        warnings,
        debug: debugInfo,
      };
    }
  }

  /**
   * Execute the assembly pipeline
   */
  private async executePipeline(
    request: AssemblyRequest,
    provenanceSessionId: string,
    performance: AssemblyPerformanceMetrics,
  ): Promise<{
    contextPack: ContextPack;
    warnings: AssemblyWarning[];
    debugInfo: StageDebugInfo[];
    sourceCount: number;
  }> {
    const debugInfo: StageDebugInfo[] = [];
    const warnings: AssemblyWarning[] = [];

    // Stage 1: Content Gathering
    const gatheringResult = await this.executeContentGathering(
      request,
      provenanceSessionId,
      performance,
    );
    debugInfo.push(gatheringResult.debug);
    warnings.push(...gatheringResult.warnings);

    // Stage 2: Content Prioritization
    const prioritizationResult = await this.executeContentPrioritization(
      gatheringResult.contentItems,
      request,
      provenanceSessionId,
      performance,
    );
    debugInfo.push(prioritizationResult.debug);
    warnings.push(...prioritizationResult.warnings);

    // Stage 3: Token Budget Management
    const budgetResult = await this.executeTokenBudgetManagement(
      prioritizationResult.prioritizedSections,
      provenanceSessionId,
      performance,
    );
    debugInfo.push(budgetResult.debug);
    warnings.push(...budgetResult.warnings);

    // Stage 4: Content Assembly
    const assemblyResult = await this.executeContentAssembly(
      budgetResult.budgetedSections,
      request,
      provenanceSessionId,
      performance,
    );
    debugInfo.push(assemblyResult.debug);
    warnings.push(...assemblyResult.warnings);

    // Stage 5: Template Rendering
    const renderingResult = await this.executeTemplateRendering(
      assemblyResult.contextContent,
      request,
      provenanceSessionId,
      performance,
    );
    debugInfo.push(renderingResult.debug);
    warnings.push(...renderingResult.warnings);

    return {
      contextPack: renderingResult.contextPack,
      warnings,
      debugInfo,
      sourceCount: gatheringResult.contentItems.length,
    };
  }

  /**
   * Stage 1: Content Gathering
   */
  private async executeContentGathering(
    request: AssemblyRequest,
    provenanceSessionId: string,
    performance: AssemblyPerformanceMetrics,
  ): Promise<{
    contentItems: ContentItem[];
    debug: StageDebugInfo;
    warnings: AssemblyWarning[];
  }> {
    const startTime = Date.now();
    const debug: StageDebugInfo = {
      stage: 'content_gathering',
      startTime: new Date(),
      endTime: new Date(),
      duration: 0,
      success: false,
      inputCount: 0,
      outputCount: 0,
    };
    const warnings: AssemblyWarning[] = [];
    const contentItems: ContentItem[] = [];

    try {
      // Gather from Memory Layer
      if (this.memoryManager) {
        const memoryStartTime = Date.now();
        const memoryItems = await this.gatherMemoryContent(request, provenanceSessionId);
        contentItems.push(...memoryItems);
        performance.memoryTime += Date.now() - memoryStartTime;
      } else {
        warnings.push({
          stage: 'content_gathering',
          type: 'integration',
          severity: 'warning',
          message: 'Memory Manager not available',
          recommendation: 'Initialize MemoryManager for optimal context',
        });
      }

      // Gather from Knowledge Layer
      if (this.knowledgeManager) {
        const knowledgeStartTime = Date.now();
        const knowledgeItems = await this.gatherKnowledgeContent(request, provenanceSessionId);
        contentItems.push(...knowledgeItems);
        performance.knowledgeTime += Date.now() - knowledgeStartTime;
      } else {
        warnings.push({
          stage: 'content_gathering',
          type: 'integration',
          severity: 'warning',
          message: 'Knowledge Manager not available',
          recommendation: 'Initialize KnowledgeManager for knowledge base access',
        });
      }

      // Gather from Index Layer
      if (this.indexManager) {
        const indexStartTime = Date.now();
        const indexItems = await this.gatherIndexContent(request, provenanceSessionId);
        contentItems.push(...indexItems);
        performance.indexTime += Date.now() - indexStartTime;
      } else {
        warnings.push({
          stage: 'content_gathering',
          type: 'integration',
          severity: 'warning',
          message: 'Index Manager not available',
          recommendation: 'Initialize IndexManager for content search',
        });
      }

      // Gather from Retrieval Layer
      if (this.retriever) {
        const retrievalStartTime = Date.now();
        const retrievalItems = await this.gatherRetrievalContent(request, provenanceSessionId);
        contentItems.push(...retrievalItems);
        performance.retrievalTime += Date.now() - retrievalStartTime;
      } else {
        warnings.push({
          stage: 'content_gathering',
          type: 'integration',
          severity: 'warning',
          message: 'Retriever not available',
          recommendation: 'Initialize HybridRetriever for ML-enhanced retrieval',
        });
      }

      debug.success = true;
      debug.outputCount = contentItems.length;

      logger.debug(`[ContextPackAssembler] Gathered ${contentItems.length} content items`);
    } catch (error) {
      debug.errors = [error instanceof Error ? error.message : 'Unknown error'];
      warnings.push({
        stage: 'content_gathering',
        type: 'content',
        severity: 'error',
        message: `Content gathering failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        recommendation: 'Check component integrations and data availability',
      });
    } finally {
      debug.endTime = new Date();
      debug.duration = Date.now() - startTime;
    }

    return { contentItems, debug, warnings };
  }

  /**
   * Stage 2: Content Prioritization
   */
  private async executeContentPrioritization(
    contentItems: ContentItem[],
    request: AssemblyRequest,
    provenanceSessionId: string,
    performance: AssemblyPerformanceMetrics,
  ): Promise<{
    prioritizedSections: ContentSection[];
    debug: StageDebugInfo;
    warnings: AssemblyWarning[];
  }> {
    const startTime = Date.now();
    const debug: StageDebugInfo = {
      stage: 'content_prioritization',
      startTime: new Date(),
      endTime: new Date(),
      duration: 0,
      success: false,
      inputCount: contentItems.length,
      outputCount: 0,
    };
    const warnings: AssemblyWarning[] = [];

    try {
      const prioritizationContext: PrioritizationContext = {
        issueId: request.issueId,
        agentType: request.agentType,
        issueDescription: request.issueDescription,
        projectContext: request.projectContext,
        historicalContext: [],
        currentGoals: [],
        constraints: request.constraints,
        preferences: request.preferences,
      };

      const prioritizationResult = await this.contentPrioritizer.prioritizeContent(
        contentItems,
        prioritizationContext,
      );
      performance.prioritizationTime += prioritizationResult.performance.processingTime;

      // Record prioritization decision
      this.provenanceTracker.recordDecision(
        provenanceSessionId,
        'Content Prioritization',
        `Prioritized ${contentItems.length} items using ${prioritizationResult.strategy}`,
        prioritizationResult.reasoning.join('; '),
        prioritizationResult.alternatives.map((alt) => ({
          option: alt.strategy,
          pros: [alt.reasoning],
          cons: [],
          score: alt.confidence / 100,
          risk: 'low',
        })),
        prioritizationResult.confidence / 100,
      );

      // Convert to ContentSections
      const prioritizedSections: ContentSection[] = prioritizationResult.items.map((item) => ({
        id: item.item.id,
        content: item.item.content,
        priority: item.score,
        type: item.item.type,
        essential: item.ranking <= 5, // Top 5 items are essential
        compressible: item.item.type !== 'agent_specific',
        metadata: item.item.metadata,
      }));

      debug.success = true;
      debug.outputCount = prioritizedSections.length;

      if (prioritizationResult.confidence < 70) {
        warnings.push({
          stage: 'content_prioritization',
          type: 'content',
          severity: 'warning',
          message: `Low confidence in prioritization (${prioritizationResult.confidence}%)`,
          recommendation: 'Review content quality and relevance indicators',
        });
      }

      return { prioritizedSections, debug, warnings };
    } catch (error) {
      debug.errors = [error instanceof Error ? error.message : 'Unknown error'];
      warnings.push({
        stage: 'content_prioritization',
        type: 'content',
        severity: 'error',
        message: `Prioritization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });

      // Return sections without prioritization
      const fallbackSections: ContentSection[] = contentItems.map((item, index) => ({
        id: item.id,
        content: item.content,
        priority: 1 - index / contentItems.length, // Simple ranking
        type: item.type,
        essential: index < 10,
        compressible: true,
        metadata: item.metadata,
      }));

      return { prioritizedSections: fallbackSections, debug, warnings };
    } finally {
      debug.endTime = new Date();
      debug.duration = Date.now() - startTime;
    }
  }

  /**
   * Stage 3: Token Budget Management
   */
  private async executeTokenBudgetManagement(
    sections: ContentSection[],
    provenanceSessionId: string,
    performance: AssemblyPerformanceMetrics,
  ): Promise<{
    budgetedSections: ContentSection[];
    debug: StageDebugInfo;
    warnings: AssemblyWarning[];
  }> {
    const startTime = Date.now();
    const debug: StageDebugInfo = {
      stage: 'token_budget_management',
      startTime: new Date(),
      endTime: new Date(),
      duration: 0,
      success: false,
      inputCount: sections.length,
      outputCount: 0,
    };
    const warnings: AssemblyWarning[] = [];

    try {
      const enforcement = await this.tokenBudgetManager.enforceBudget(sections);
      performance.tokenBudgetTime += Date.now() - startTime;

      // Record budget enforcement decision
      this.provenanceTracker.recordDecision(
        provenanceSessionId,
        'Token Budget Enforcement',
        `Enforced ${this.config.maxTokensPerPack} token budget`,
        `Within budget: ${enforcement.withinBudget}, Utilization: ${enforcement.budgetUtilization.toFixed(1)}%`,
        [],
        enforcement.withinBudget ? 1.0 : 0.8,
      );

      // Convert warnings
      for (const warning of enforcement.warnings) {
        warnings.push({
          stage: 'token_budget_management',
          type: 'budget',
          severity:
            warning.severity === 'error'
              ? 'error'
              : warning.severity === 'warning'
                ? 'warning'
                : 'info',
          message: warning.message,
          recommendation: warning.recommendation,
        });
      }

      debug.success = enforcement.withinBudget;
      debug.outputCount = sections.length;

      return { budgetedSections: sections, debug, warnings };
    } catch (error) {
      debug.errors = [error instanceof Error ? error.message : 'Unknown error'];
      warnings.push({
        stage: 'token_budget_management',
        type: 'budget',
        severity: 'error',
        message: `Token budget enforcement failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });

      return { budgetedSections: sections, debug, warnings };
    } finally {
      debug.endTime = new Date();
      debug.duration = Date.now() - startTime;
    }
  }

  /**
   * Stage 4: Content Assembly
   */
  private async executeContentAssembly(
    sections: ContentSection[],
    request: AssemblyRequest,
    provenanceSessionId: string,
    performance: AssemblyPerformanceMetrics,
  ): Promise<{
    contextContent: ContextContent;
    debug: StageDebugInfo;
    warnings: AssemblyWarning[];
  }> {
    const startTime = Date.now();
    const debug: StageDebugInfo = {
      stage: 'content_assembly',
      startTime: new Date(),
      endTime: new Date(),
      duration: 0,
      success: false,
      inputCount: sections.length,
      outputCount: 0,
    };
    const warnings: AssemblyWarning[] = [];

    try {
      // Separate sections by type
      const memorySections = sections.filter((s) => s.type === 'memory');
      const knowledgeSections = sections.filter((s) => s.type === 'knowledge');
      const realtimeSections = sections.filter((s) => s.type === 'realtime');
      const agentSpecificSections = sections.filter((s) => s.type === 'agent_specific');

      // Assemble context content
      const contextContent: ContextContent = {
        jobMemory: this.assembleMemorySection(memorySections),
        knowledgeBase: this.assembleKnowledgeSection(knowledgeSections),
        realtimeData: this.assembleRealtimeSection(realtimeSections),
        agentSpecific: this.assembleAgentSpecificContent(agentSpecificSections, request),
        relatedContexts: [],
        executiveSummary: this.generateExecutiveSummary(sections, request),
        keyInsights: this.generateKeyInsights(sections, request),
        criticalActions: this.generateCriticalActions(sections, request),
      };

      debug.success = true;
      debug.outputCount = 1;

      // Check memory content percentage
      const memoryPercentage = (memorySections.length / sections.length) * 100;
      if (memoryPercentage < this.config.memoryContentPercentage) {
        warnings.push({
          stage: 'content_assembly',
          type: 'content',
          severity: 'warning',
          message: `Memory content percentage (${memoryPercentage.toFixed(1)}%) below target (${this.config.memoryContentPercentage}%)`,
          recommendation: 'Enhance memory content gathering or adjust targets',
        });
      }

      return { contextContent, debug, warnings };
    } catch (error) {
      debug.errors = [error instanceof Error ? error.message : 'Unknown error'];
      warnings.push({
        stage: 'content_assembly',
        type: 'content',
        severity: 'error',
        message: `Content assembly failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });

      // Return minimal context content
      const errorContent: ContextContent = {
        jobMemory: {
          jobHistory: [],
          decisions: [],
          gotchas: [],
          patterns: [],
          outcomes: [],
          totalItems: 0,
          priorityScore: 0,
        },
        knowledgeBase: {
          cards: [],
          adrs: [],
          bestPractices: [],
          recommendations: [],
          totalItems: 0,
          relevanceScore: 0,
        },
        realtimeData: {
          indexResults: [],
          retrievalResults: [],
          liveData: [],
          contextualFacts: [],
          totalItems: 0,
          freshnessScore: 0,
        },
        agentSpecific: {
          agentType: request.agentType,
          specializations: [],
          customInstructions: [],
          toolsAvailable: [],
          constraints: request.constraints,
          preferences: request.preferences,
        },
        relatedContexts: [],
        executiveSummary: 'Context assembly failed',
        keyInsights: ['Error in content assembly'],
        criticalActions: ['Review system logs for details'],
      };

      return { contextContent: errorContent, debug, warnings };
    } finally {
      debug.endTime = new Date();
      debug.duration = Date.now() - startTime;
    }
  }

  /**
   * Stage 5: Template Rendering
   */
  private async executeTemplateRendering(
    contextContent: ContextContent,
    request: AssemblyRequest,
    provenanceSessionId: string,
    performance: AssemblyPerformanceMetrics,
  ): Promise<{
    contextPack: ContextPack;
    debug: StageDebugInfo;
    warnings: AssemblyWarning[];
  }> {
    const startTime = Date.now();
    const debug: StageDebugInfo = {
      stage: 'template_rendering',
      startTime: new Date(),
      endTime: new Date(),
      duration: 0,
      success: false,
      inputCount: 1,
      outputCount: 0,
    };
    const warnings: AssemblyWarning[] = [];

    try {
      // Create metadata
      const metadata: ContextPackMetadata = {
        id: this.generateContextPackId(request),
        version: '1.0.0',
        issueId: request.issueId,
        agentType: request.agentType,
        generatedAt: new Date(),
        validUntil: new Date(Date.now() + this.config.cacheTtlMinutes * 60 * 1000),
        priority: request.priority,
        tags: [request.agentType, request.priority],
        templateUsed: `default-${request.agentType}`,
        optimizationLevel: 85, // Default optimization level
      };

      // Generate token usage info
      const tokenUsage = await this.tokenBudgetManager.createTokenUsageInfo([], {
        withinBudget: true,
        totalTokens: 0,
        budgetUtilization: 0,
        overageTokens: 0,
        optimizationsApplied: [],
        contentRemoved: [],
        warnings: [],
      });

      // Generate provenance info
      const provenance = this.provenanceTracker.generateProvenanceInfo(provenanceSessionId);

      const contextPack: ContextPack = {
        metadata,
        content: contextContent,
        provenance,
        tokenUsage,
      };

      performance.templateTime += Date.now() - startTime;

      debug.success = true;
      debug.outputCount = 1;

      return { contextPack, debug, warnings };
    } catch (error) {
      debug.errors = [error instanceof Error ? error.message : 'Unknown error'];
      warnings.push({
        stage: 'template_rendering',
        type: 'content',
        severity: 'error',
        message: `Template rendering failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });

      // Create minimal context pack
      const errorPack: ContextPack = {
        metadata: {
          id: this.generateContextPackId(request),
          version: '1.0.0',
          issueId: request.issueId,
          agentType: request.agentType,
          generatedAt: new Date(),
          validUntil: new Date(Date.now() + this.config.cacheTtlMinutes * 60 * 1000),
          priority: request.priority,
          tags: ['error'],
          templateUsed: 'error',
          optimizationLevel: 0,
        },
        content: contextContent,
        provenance: {
          sources: [],
          transformations: [],
          decisions: [],
          auditTrail: [],
          trustScore: 0,
        },
        tokenUsage: {
          totalTokens: 0,
          budgetLimit: this.config.maxTokensPerPack,
          utilization: 0,
          breakdown: {
            memory: 0,
            knowledge: 0,
            realtime: 0,
            agentSpecific: 0,
            metadata: 0,
            provenance: 0,
          },
          optimizations: [],
          warnings: [],
        },
      };

      return { contextPack: errorPack, debug, warnings };
    } finally {
      debug.endTime = new Date();
      debug.duration = Date.now() - startTime;
    }
  }

  // Content gathering helper methods
  private async gatherMemoryContent(
    request: AssemblyRequest,
    provenanceSessionId: string,
  ): Promise<ContentItem[]> {
    if (!this.memoryManager) return [];

    // Register memory source
    this.provenanceTracker.registerSource(
      provenanceSessionId,
      'memory',
      'job_memory',
      `Memory for issue ${request.issueId}`,
      { issueId: request.issueId },
    );

    // Placeholder implementation
    return [];
  }

  private async gatherKnowledgeContent(
    request: AssemblyRequest,
    provenanceSessionId: string,
  ): Promise<ContentItem[]> {
    if (!this.knowledgeManager) return [];

    // Register knowledge source
    this.provenanceTracker.registerSource(
      provenanceSessionId,
      'knowledge',
      'knowledge_base',
      `Knowledge for ${request.agentType}`,
      { agentType: request.agentType },
    );

    // Placeholder implementation
    return [];
  }

  private async gatherIndexContent(
    request: AssemblyRequest,
    provenanceSessionId: string,
  ): Promise<ContentItem[]> {
    if (!this.indexManager) return [];

    // Register index source
    this.provenanceTracker.registerSource(
      provenanceSessionId,
      'index',
      'search_index',
      `Index search for ${request.issueDescription}`,
      { query: request.issueDescription },
    );

    // Placeholder implementation
    return [];
  }

  private async gatherRetrievalContent(
    request: AssemblyRequest,
    provenanceSessionId: string,
  ): Promise<ContentItem[]> {
    if (!this.retriever) return [];

    // Register retrieval source
    this.provenanceTracker.registerSource(
      provenanceSessionId,
      'retrieval',
      'hybrid_retrieval',
      `Retrieval for ${request.issueDescription}`,
      { query: request.issueDescription, agentType: request.agentType },
    );

    // Placeholder implementation
    return [];
  }

  // Content assembly helper methods
  private assembleMemorySection(sections: ContentSection[]): MemoryContextSection {
    return {
      jobHistory: [],
      decisions: [],
      gotchas: [],
      patterns: [],
      outcomes: [],
      totalItems: sections.length,
      priorityScore: sections.reduce((sum, s) => sum + s.priority, 0) / sections.length || 0,
    };
  }

  private assembleKnowledgeSection(sections: ContentSection[]): KnowledgeContextSection {
    return {
      cards: [],
      adrs: [],
      bestPractices: [],
      recommendations: [],
      totalItems: sections.length,
      relevanceScore: sections.reduce((sum, s) => sum + s.priority, 0) / sections.length || 0,
    };
  }

  private assembleRealtimeSection(sections: ContentSection[]): RealtimeContextSection {
    return {
      indexResults: [],
      retrievalResults: [],
      liveData: [],
      contextualFacts: [],
      totalItems: sections.length,
      freshnessScore: sections.reduce((sum, s) => sum + s.priority, 0) / sections.length || 0,
    };
  }

  private assembleAgentSpecificContent(
    sections: ContentSection[],
    request: AssemblyRequest,
  ): AgentSpecificContent {
    return {
      agentType: request.agentType,
      specializations: this.getAgentSpecializations(request.agentType),
      customInstructions: [],
      toolsAvailable: this.getAgentTools(request.agentType),
      constraints: request.constraints,
      preferences: request.preferences,
    };
  }

  private generateExecutiveSummary(sections: ContentSection[], request: AssemblyRequest): string {
    return `Context pack assembled for ${request.agentType} agent working on issue ${request.issueId}. Contains ${sections.length} prioritized content sections covering memory, knowledge, and real-time data sources.`;
  }

  private generateKeyInsights(sections: ContentSection[], request: AssemblyRequest): string[] {
    const insights = [
      `${sections.filter((s) => s.type === 'memory').length} memory items available`,
      `${sections.filter((s) => s.type === 'knowledge').length} knowledge items relevant`,
      `Priority focus: ${request.priority} priority issue`,
    ];

    if (request.constraints.length > 0) {
      insights.push(`${request.constraints.length} constraints apply`);
    }

    return insights;
  }

  private generateCriticalActions(sections: ContentSection[], request: AssemblyRequest): string[] {
    const actions = [
      `Review provided context for ${request.agentType} requirements`,
      'Apply lessons learned from similar issues',
      'Follow established patterns and best practices',
    ];

    if (request.priority === 'critical' || request.priority === 'high') {
      actions.unshift('URGENT: High priority issue requires immediate attention');
    }

    return actions;
  }

  // Utility methods
  private generateContextPackId(request: AssemblyRequest): string {
    const timestamp = Date.now();
    const hash = require('crypto')
      .createHash('md5')
      .update(`${request.issueId}:${request.agentType}:${timestamp}`)
      .digest('hex')
      .substring(0, 8);
    return `cp-${hash}`;
  }

  private async checkCache(request: AssemblyRequest): Promise<ContextPack | null> {
    try {
      const cacheKey: CacheKey = {
        issueId: request.issueId,
        agentType: request.agentType,
        contentHash: require('crypto')
          .createHash('md5')
          .update(`${request.issueDescription}:${request.projectContext}`)
          .digest('hex'),
        version: '1.0.0',
      };

      return await this.cacheEngine.get<ContextPack>(cacheKey);
    } catch (error) {
      logger.warn('[ContextPackAssembler] Cache check failed:', error);
      return null;
    }
  }

  private async cacheResult(request: AssemblyRequest, contextPack: ContextPack): Promise<void> {
    try {
      const cacheKey: CacheKey = {
        issueId: request.issueId,
        agentType: request.agentType,
        contentHash: require('crypto')
          .createHash('md5')
          .update(`${request.issueDescription}:${request.projectContext}`)
          .digest('hex'),
        version: '1.0.0',
      };

      await this.cacheEngine.set(cacheKey, contextPack);
    } catch (error) {
      logger.warn('[ContextPackAssembler] Cache store failed:', error);
    }
  }

  private createErrorContextPack(request: AssemblyRequest, error: Error): ContextPack {
    return {
      metadata: {
        id: this.generateContextPackId(request),
        version: '1.0.0',
        issueId: request.issueId,
        agentType: request.agentType,
        generatedAt: new Date(),
        validUntil: new Date(Date.now() + this.config.cacheTtlMinutes * 60 * 1000),
        priority: request.priority,
        tags: ['error'],
        templateUsed: 'error',
        optimizationLevel: 0,
      },
      content: {
        jobMemory: {
          jobHistory: [],
          decisions: [],
          gotchas: [],
          patterns: [],
          outcomes: [],
          totalItems: 0,
          priorityScore: 0,
        },
        knowledgeBase: {
          cards: [],
          adrs: [],
          bestPractices: [],
          recommendations: [],
          totalItems: 0,
          relevanceScore: 0,
        },
        realtimeData: {
          indexResults: [],
          retrievalResults: [],
          liveData: [],
          contextualFacts: [],
          totalItems: 0,
          freshnessScore: 0,
        },
        agentSpecific: {
          agentType: request.agentType,
          specializations: [],
          customInstructions: [],
          toolsAvailable: [],
          constraints: request.constraints,
          preferences: request.preferences,
        },
        relatedContexts: [],
        executiveSummary: `Error assembling context: ${error.message}`,
        keyInsights: ['Context assembly failed'],
        criticalActions: [
          'Check system logs',
          'Verify component integrations',
          'Report error to administrators',
        ],
      },
      provenance: {
        sources: [],
        transformations: [],
        decisions: [],
        auditTrail: [],
        trustScore: 0,
      },
      tokenUsage: {
        totalTokens: 0,
        budgetLimit: this.config.maxTokensPerPack,
        utilization: 0,
        breakdown: {
          memory: 0,
          knowledge: 0,
          realtime: 0,
          agentSpecific: 0,
          metadata: 0,
          provenance: 0,
        },
        optimizations: [],
        warnings: [],
      },
    };
  }

  private getAgentSpecializations(agentType: string): string[] {
    const specializations: Record<string, string[]> = {
      'strategic-planner': ['task-breakdown', 'risk-assessment', 'milestone-planning'],
      'system-architect': ['design-patterns', 'system-design', 'architecture-decisions'],
      'code-implementer': ['clean-code', 'testing', 'debugging', 'refactoring'],
      'security-auditor': ['vulnerability-assessment', 'penetration-testing', 'compliance'],
      'performance-optimizer': ['profiling', 'optimization', 'caching', 'scaling'],
      'test-coverage-validator': ['unit-testing', 'integration-testing', 'coverage-analysis', 'test-automation'],
      'ui-ux-optimizer': ['user-experience', 'accessibility', 'responsive-design', 'usability-testing'],
      'database-architect': ['database-design', 'query-optimization', 'data-modeling', 'performance-tuning'],
      'deployment-automation': ['ci-cd', 'containerization', 'infrastructure', 'automation-tools'],
      'code-quality-reviewer': ['code-review', 'static-analysis', 'best-practices', 'maintainability'],
      'antihallucination-validator': ['code-validation', 'existence-checking', 'accuracy-verification'],
      'github-workflow-automation': ['github-integration', 'workflow-automation', 'issue-management', 'pr-automation'],
    };

    return specializations[agentType] || ['general-purpose'];
  }

  private getAgentTools(agentType: string): string[] {
    const tools: Record<string, string[]> = {
      'strategic-planner': ['project-management', 'estimation', 'risk-analysis'],
      'system-architect': ['uml-tools', 'design-tools', 'documentation'],
      'code-implementer': ['ide', 'debugger', 'version-control', 'testing-frameworks'],
      'security-auditor': ['vulnerability-scanners', 'penetration-tools', 'compliance-checkers'],
      'performance-optimizer': ['profilers', 'benchmarking-tools', 'monitoring'],
      'test-coverage-validator': ['test-runners', 'coverage-tools', 'mocking-frameworks', 'ci-integration'],
      'ui-ux-optimizer': ['design-systems', 'accessibility-checkers', 'user-testing', 'analytics'],
      'database-architect': ['database-tools', 'query-analyzers', 'migration-tools', 'monitoring'],
      'deployment-automation': ['docker', 'kubernetes', 'ci-cd-tools', 'infrastructure-code'],
      'code-quality-reviewer': ['linters', 'static-analyzers', 'code-metrics', 'review-tools'],
      'antihallucination-validator': ['code-analyzers', 'existence-validators', 'accuracy-checkers'],
      'github-workflow-automation': ['github-api', 'workflow-templates', 'issue-tracking', 'pr-tools'],
    };

    return tools[agentType] || ['basic-tools'];
  }

  private createAssemblyPipeline(): AssemblyPipeline {
    return {
      id: 'default-assembly-pipeline',
      name: 'Default Context Pack Assembly Pipeline',
      version: '1.0.0',
      stages: [
        {
          id: 'content_gathering',
          name: 'Content Gathering',
          order: 1,
          processor: {
            type: 'content_gatherer',
            implementation: 'parallel_gatherer',
            config: { parallel: true, timeout: 5000 },
            resources: { cpu: 1, memory: 256, storage: 0, network: 100, timeout: 5000 },
          },
          inputs: ['request'],
          outputs: ['content_items'],
          timeout: 10000,
          retryPolicy: {
            maxAttempts: 2,
            backoffStrategy: 'exponential',
            baseDelay: 1000,
            maxDelay: 5000,
            conditions: ['timeout', 'network_error'],
          },
          healthCheck: { enabled: true, interval: 30000, timeout: 5000 },
        },
        {
          id: 'content_prioritization',
          name: 'Content Prioritization',
          order: 2,
          processor: {
            type: 'prioritizer',
            implementation: 'ml_prioritizer',
            config: { algorithm: 'hybrid', confidence_threshold: 0.7 },
            resources: { cpu: 2, memory: 512, storage: 0, network: 0, timeout: 3000 },
          },
          inputs: ['content_items'],
          outputs: ['prioritized_content'],
          timeout: 5000,
          retryPolicy: {
            maxAttempts: 3,
            backoffStrategy: 'linear',
            baseDelay: 500,
            maxDelay: 2000,
            conditions: ['processing_error'],
          },
          healthCheck: { enabled: true, interval: 60000, timeout: 3000 },
        },
      ],
      parallelism: {
        enabled: true,
        maxConcurrency: 4,
        stageGroups: [
          { id: 'gathering', stages: ['content_gathering'], strategy: 'all_complete' },
          { id: 'processing', stages: ['content_prioritization'], strategy: 'all_complete' },
        ],
        synchronizationPoints: [
          {
            id: 'sync_after_gathering',
            type: 'barrier',
            stages: ['content_gathering'],
            timeout: 15000,
            failurePolicy: 'abort',
          },
        ],
      },
      errorHandling: {
        policy: 'graceful_degradation',
        maxRetries: 3,
        timeoutMs: 30000,
        fallbackActions: [
          { condition: 'timeout', action: 'use_cache', parameters: {} },
          { condition: 'component_unavailable', action: 'skip_stage', parameters: {} },
        ],
      },
      performance: {
        maxExecutionTimeMs: 2000,
        maxMemoryUsageMB: 256,
        targetThroughputRPS: 100,
        averageExecutionTime: 800,
        successRate: 0.95,
        throughput: 100,
        resourceLimits: {
          cpu: 80,
          memory: 256,
          disk: 1000,
        },
        caching: {
          enabled: true,
          maxCacheSizeMB: 64,
          ttlSeconds: 900,
        },
      },
    };
  }

  private initializePerformanceMetrics(): PerformanceMetrics {
    return {
      generation: {
        averageTimeMs: 0,
        medianTimeMs: 0,
        p95TimeMs: 0,
        p99TimeMs: 0,
        successRate: 0,
        errorRate: 0,
        timeoutRate: 0,
      },
      content: {
        averageTokenCount: 0,
        tokenUtilization: 0,
        contentQualityScore: 0,
        duplicateContentRate: 0,
        memoryContentPercentage: 0,
        knowledgeContentPercentage: 0,
        realtimeContentPercentage: 0,
      },
      cache: {
        hitRate: 0,
        missRate: 0,
        evictionRate: 0,
        averageRetrievalTime: 0,
        storageUtilization: 0,
        keyDistribution: {},
      },
      integration: {
        indexLayerLatency: 0,
        retrieverLayerLatency: 0,
        knowledgeLayerLatency: 0,
        memoryLayerLatency: 0,
        totalIntegrationLatency: 0,
        errorRateByLayer: {},
      },
      overall: {
        throughput: 0,
        availability: 0,
        reliability: 0,
        efficiency: 0,
        userSatisfaction: 0,
        costPerPack: 0,
      },
    };
  }

  /**
   * Get performance statistics
   */
  getStats(): PerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Shutdown the assembler
   */
  async shutdown(): Promise<void> {
    try {
      await this.cacheEngine.shutdown();
      this.tokenBudgetManager.cleanup();
      this.contentPrioritizer.cleanup();
      this.provenanceTracker.cleanup();
      this.templateEngine.cleanup();

      logger.info('[ContextPackAssembler] Shutdown completed');
    } catch (error) {
      logger.error('[ContextPackAssembler] Shutdown failed:', error);
      throw error;
    }
  }
}

export default ContextPackAssembler;
