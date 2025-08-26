// ForgeFlow ff2 why Command Integration - Transparency and explainability
// Provides detailed explanations of context pack decisions and reasoning

import { logger } from '../utils/logger';
import type {
  ContextPackAssembler,
  AssemblyRequest,
  AssemblyResult,
} from './context-pack-assembler';
import type { ProvenanceReport } from './provenance-tracker';
import type { PrioritizationResult } from './content-prioritizer';
import type { ContextPack, ProvenanceInfo, TokenUsageInfo, PerformanceMetrics } from './types';

export interface TransparencyQuery {
  contextPackId?: string;
  issueId?: string;
  agentType?: string;
  sessionId?: string;
  component?: 'all' | 'prioritization' | 'budget' | 'template' | 'provenance' | 'performance';
  depth?: 'summary' | 'detailed' | 'full';
}

export interface TransparencyReport {
  query: TransparencyQuery;
  timestamp: Date;
  contextPack: ContextPackSummary;
  decisions: DecisionExplanation[];
  performance: PerformanceAnalysis;
  recommendations: string[];
  sources: SourceAnalysis[];
  warnings: TransparencyWarning[];
}

export interface ContextPackSummary {
  id: string;
  agentType: string;
  issueId: string;
  generatedAt: Date;
  tokenUsage: TokenUsageSummary;
  contentBreakdown: ContentBreakdownSummary;
  quality: QualityMetrics;
}

export interface TokenUsageSummary {
  totalTokens: number;
  budgetUtilization: number;
  breakdown: Record<string, number>;
  optimizationsApplied: number;
  warnings: number;
}

export interface ContentBreakdownSummary {
  totalSources: number;
  sourceTypes: Record<string, number>;
  memoryPercentage: number;
  knowledgePercentage: number;
  realtimePercentage: number;
  priorityDistribution: PriorityDistribution;
}

export interface PriorityDistribution {
  high: number;
  medium: number;
  low: number;
  essential: number;
}

export interface QualityMetrics {
  trustScore: number;
  relevanceScore: number;
  freshnessScore: number;
  completenessScore: number;
  consistencyScore: number;
}

export interface DecisionExplanation {
  id: string;
  decision: string;
  component: string;
  rationale: string;
  alternatives: string[];
  confidence: number;
  impact: 'low' | 'medium' | 'high';
  factors: DecisionFactor[];
  tradeoffs: string[];
}

export interface DecisionFactor {
  name: string;
  value: number;
  weight: number;
  contribution: number;
  explanation: string;
}

export interface PerformanceAnalysis {
  totalTime: number;
  stageBreakdown: StagePerformance[];
  bottlenecks: string[];
  optimizations: PerformanceOptimization[];
  comparison: PerformanceComparison;
}

export interface StagePerformance {
  stage: string;
  duration: number;
  percentage: number;
  status: 'optimal' | 'acceptable' | 'slow';
  explanation: string;
}

export interface PerformanceOptimization {
  type: string;
  description: string;
  potentialSavings: number;
  feasibility: 'easy' | 'moderate' | 'difficult';
}

export interface PerformanceComparison {
  vsTarget: number;
  vsAverage: number;
  vsMedian: number;
  percentile: number;
}

export interface SourceAnalysis {
  id: string;
  type: string;
  reliability: number;
  contribution: number;
  usage: 'included' | 'optimized' | 'excluded';
  reason: string;
}

export interface TransparencyWarning {
  type: 'data_quality' | 'performance' | 'reliability' | 'completeness';
  severity: 'info' | 'warning' | 'error';
  message: string;
  recommendation: string;
  affected: string[];
}

export class FF2TransparencyIntegration {
  private assembler: ContextPackAssembler;
  private assemblyHistory: Map<string, AssemblyResult> = new Map();
  private queryHistory: TransparencyQuery[] = [];

  constructor(assembler: ContextPackAssembler) {
    this.assembler = assembler;
    logger.info('[FF2TransparencyIntegration] Initialized transparency integration');
  }

  /**
   * Register an assembly result for transparency queries
   */
  registerAssembly(request: AssemblyRequest, result: AssemblyResult): void {
    const contextPackId = result.contextPack.metadata.id;
    this.assemblyHistory.set(contextPackId, result);

    // Keep only last 100 assemblies
    if (this.assemblyHistory.size > 100) {
      const firstKey = this.assemblyHistory.keys().next().value;
      this.assemblyHistory.delete(firstKey);
    }

    logger.debug(`[FF2TransparencyIntegration] Registered assembly ${contextPackId}`);
  }

  /**
   * Process ff2 why command
   */
  async processWhyCommand(query: TransparencyQuery): Promise<TransparencyReport> {
    const startTime = Date.now();

    logger.info('[FF2TransparencyIntegration] Processing why command:', query);

    // Record query
    this.queryHistory.push(query);

    try {
      // Find the relevant assembly
      const assemblyResult = await this.findRelevantAssembly(query);
      if (!assemblyResult) {
        throw new Error(`No assembly found matching query: ${JSON.stringify(query)}`);
      }

      // Generate comprehensive transparency report
      const report = await this.generateTransparencyReport(query, assemblyResult);

      const duration = Date.now() - startTime;
      logger.info(`[FF2TransparencyIntegration] Generated transparency report in ${duration}ms`);

      return report;
    } catch (error) {
      logger.error('[FF2TransparencyIntegration] Failed to process why command:', error);
      throw new Error(
        `Transparency query failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Find relevant assembly result based on query
   */
  private async findRelevantAssembly(query: TransparencyQuery): Promise<AssemblyResult | null> {
    // Direct lookup by context pack ID
    if (query.contextPackId) {
      return this.assemblyHistory.get(query.contextPackId) || null;
    }

    // Search by issue ID or agent type
    for (const [id, assembly] of this.assemblyHistory) {
      const metadata = assembly.contextPack.metadata;

      if (query.issueId && metadata.issueId === query.issueId) {
        if (!query.agentType || metadata.agentType === query.agentType) {
          return assembly;
        }
      }
    }

    return null;
  }

  /**
   * Generate comprehensive transparency report
   */
  private async generateTransparencyReport(
    query: TransparencyQuery,
    assemblyResult: AssemblyResult,
  ): Promise<TransparencyReport> {
    const contextPack = assemblyResult.contextPack;
    const performance = assemblyResult.performance;

    // Generate context pack summary
    const contextPackSummary = this.generateContextPackSummary(contextPack, assemblyResult);

    // Explain key decisions
    const decisions = await this.explainDecisions(
      contextPack,
      assemblyResult,
      query.depth || 'summary',
    );

    // Analyze performance
    const performanceAnalysis = this.analyzePerformance(performance, assemblyResult);

    // Analyze sources
    const sourceAnalysis = this.analyzeSources(contextPack.provenance);

    // Generate recommendations
    const recommendations = this.generateRecommendations(assemblyResult, contextPackSummary);

    // Identify warnings
    const warnings = this.identifyWarnings(assemblyResult, contextPackSummary);

    return {
      query,
      timestamp: new Date(),
      contextPack: contextPackSummary,
      decisions,
      performance: performanceAnalysis,
      recommendations,
      sources: sourceAnalysis,
      warnings,
    };
  }

  /**
   * Generate context pack summary
   */
  private generateContextPackSummary(
    contextPack: ContextPack,
    assemblyResult: AssemblyResult,
  ): ContextPackSummary {
    const metadata = contextPack.metadata;
    const content = contextPack.content;
    const tokenUsage = contextPack.tokenUsage;

    // Calculate content breakdown
    const totalSources =
      content.jobMemory.totalItems +
      content.knowledgeBase.totalItems +
      content.realtimeData.totalItems;

    const memoryPercentage =
      totalSources > 0 ? (content.jobMemory.totalItems / totalSources) * 100 : 0;
    const knowledgePercentage =
      totalSources > 0 ? (content.knowledgeBase.totalItems / totalSources) * 100 : 0;
    const realtimePercentage =
      totalSources > 0 ? (content.realtimeData.totalItems / totalSources) * 100 : 0;

    // Calculate quality metrics
    const trustScore = contextPack.provenance.trustScore;
    const relevanceScore = content.knowledgeBase.relevanceScore;
    const freshnessScore = content.realtimeData.freshnessScore;
    const completenessScore = this.calculateCompleteness(content);
    const consistencyScore = this.calculateConsistency(contextPack);

    return {
      id: metadata.id,
      agentType: metadata.agentType,
      issueId: metadata.issueId,
      generatedAt: metadata.generatedAt,
      tokenUsage: {
        totalTokens: tokenUsage.totalTokens,
        budgetUtilization: tokenUsage.utilization,
        breakdown: tokenUsage.breakdown,
        optimizationsApplied: tokenUsage.optimizations.length,
        warnings: tokenUsage.warnings.length,
      },
      contentBreakdown: {
        totalSources,
        sourceTypes: {
          memory: content.jobMemory.totalItems,
          knowledge: content.knowledgeBase.totalItems,
          realtime: content.realtimeData.totalItems,
          agent_specific: 1,
        },
        memoryPercentage,
        knowledgePercentage,
        realtimePercentage,
        priorityDistribution: {
          high: 0, // Would need to track this during assembly
          medium: 0,
          low: 0,
          essential: 0,
        },
      },
      quality: {
        trustScore,
        relevanceScore,
        freshnessScore,
        completenessScore,
        consistencyScore,
      },
    };
  }

  /**
   * Explain key decisions made during assembly
   */
  private async explainDecisions(
    contextPack: ContextPack,
    assemblyResult: AssemblyResult,
    depth: string,
  ): Promise<DecisionExplanation[]> {
    const decisions: DecisionExplanation[] = [];

    // Explain prioritization decisions
    if (contextPack.provenance.decisions.length > 0) {
      for (const decision of contextPack.provenance.decisions) {
        const explanation: DecisionExplanation = {
          id: `decision-${decisions.length}`,
          decision: decision.decision,
          component: 'prioritization',
          rationale: decision.rationale,
          alternatives: decision.alternatives,
          confidence: decision.confidence / 100,
          impact: 'medium', // Would need to determine from decision context
          factors: this.extractDecisionFactors(decision),
          tradeoffs: this.identifyTradeoffs(decision),
        };

        decisions.push(explanation);
      }
    }

    // Explain token budget decisions
    if (contextPack.tokenUsage.optimizations.length > 0) {
      const budgetDecision: DecisionExplanation = {
        id: 'token-budget',
        decision: 'Token Budget Enforcement',
        component: 'budget_management',
        rationale: `Applied ${contextPack.tokenUsage.optimizations.length} optimizations to fit within ${contextPack.tokenUsage.budgetLimit} token budget`,
        alternatives: ['Increase budget', 'Remove low-priority content', 'Apply compression'],
        confidence: contextPack.tokenUsage.utilization <= 100 ? 0.9 : 0.6,
        impact: contextPack.tokenUsage.optimizations.length > 3 ? 'high' : 'medium',
        factors: [
          {
            name: 'Budget Utilization',
            value: contextPack.tokenUsage.utilization,
            weight: 1.0,
            contribution: contextPack.tokenUsage.utilization / 100,
            explanation: `${contextPack.tokenUsage.utilization}% of ${contextPack.tokenUsage.budgetLimit} token budget used`,
          },
        ],
        tradeoffs: contextPack.tokenUsage.optimizations.map(
          (opt) =>
            `${opt.type}: ${opt.description} (saved ${opt.tokensSaved} tokens, ${opt.impactLevel} impact)`,
        ),
      };

      decisions.push(budgetDecision);
    }

    // Explain template selection decisions
    const templateDecision: DecisionExplanation = {
      id: 'template-selection',
      decision: `Selected template: ${contextPack.metadata.templateUsed}`,
      component: 'template_engine',
      rationale: `Chose specialized template for ${contextPack.metadata.agentType} agent`,
      alternatives: ['Generic template', 'Custom template', 'Agent-specific variations'],
      confidence: 0.85,
      impact: 'medium',
      factors: [
        {
          name: 'Agent Type Match',
          value: 1.0,
          weight: 0.8,
          contribution: 0.8,
          explanation: `Template specifically designed for ${contextPack.metadata.agentType}`,
        },
        {
          name: 'Optimization Level',
          value: contextPack.metadata.optimizationLevel / 100,
          weight: 0.2,
          contribution: (contextPack.metadata.optimizationLevel / 100) * 0.2,
          explanation: `Template optimized to ${contextPack.metadata.optimizationLevel}% efficiency`,
        },
      ],
      tradeoffs: [
        'Agent-specific template provides better context but may be less flexible',
        'Optimized template saves tokens but may reduce comprehensive context',
      ],
    };

    decisions.push(templateDecision);

    return decisions;
  }

  /**
   * Analyze performance characteristics
   */
  private analyzePerformance(
    performance: any,
    assemblyResult: AssemblyResult,
  ): PerformanceAnalysis {
    const stages: StagePerformance[] = [
      {
        stage: 'Memory Gathering',
        duration: performance.memoryTime || 0,
        percentage: ((performance.memoryTime || 0) / performance.totalTime) * 100,
        status:
          (performance.memoryTime || 0) < 200
            ? 'optimal'
            : (performance.memoryTime || 0) < 500
              ? 'acceptable'
              : 'slow',
        explanation: 'Time spent gathering job memory and historical context',
      },
      {
        stage: 'Knowledge Retrieval',
        duration: performance.knowledgeTime || 0,
        percentage: ((performance.knowledgeTime || 0) / performance.totalTime) * 100,
        status:
          (performance.knowledgeTime || 0) < 300
            ? 'optimal'
            : (performance.knowledgeTime || 0) < 600
              ? 'acceptable'
              : 'slow',
        explanation: 'Time spent retrieving relevant knowledge cards and ADRs',
      },
      {
        stage: 'Content Prioritization',
        duration: performance.prioritizationTime || 0,
        percentage: ((performance.prioritizationTime || 0) / performance.totalTime) * 100,
        status:
          (performance.prioritizationTime || 0) < 200
            ? 'optimal'
            : (performance.prioritizationTime || 0) < 400
              ? 'acceptable'
              : 'slow',
        explanation: 'Time spent ML ranking and prioritizing content',
      },
      {
        stage: 'Token Budget Management',
        duration: performance.tokenBudgetTime || 0,
        percentage: ((performance.tokenBudgetTime || 0) / performance.totalTime) * 100,
        status:
          (performance.tokenBudgetTime || 0) < 100
            ? 'optimal'
            : (performance.tokenBudgetTime || 0) < 200
              ? 'acceptable'
              : 'slow',
        explanation: 'Time spent enforcing token budget and applying optimizations',
      },
    ];

    // Identify bottlenecks
    const bottlenecks = stages
      .filter((stage) => stage.status === 'slow')
      .map((stage) => `${stage.stage}: ${stage.duration}ms (${stage.percentage.toFixed(1)}%)`);

    // Suggest optimizations
    const optimizations: PerformanceOptimization[] = [];

    if ((performance.memoryTime || 0) > 500) {
      optimizations.push({
        type: 'caching',
        description: 'Cache frequently accessed memory entries',
        potentialSavings: Math.floor((performance.memoryTime || 0) * 0.6),
        feasibility: 'easy',
      });
    }

    if ((performance.knowledgeTime || 0) > 600) {
      optimizations.push({
        type: 'indexing',
        description: 'Improve knowledge base search indexing',
        potentialSavings: Math.floor((performance.knowledgeTime || 0) * 0.4),
        feasibility: 'moderate',
      });
    }

    if ((performance.prioritizationTime || 0) > 400) {
      optimizations.push({
        type: 'algorithm',
        description: 'Use simpler prioritization algorithm for non-critical requests',
        potentialSavings: Math.floor((performance.prioritizationTime || 0) * 0.3),
        feasibility: 'moderate',
      });
    }

    return {
      totalTime: performance.totalTime,
      stageBreakdown: stages,
      bottlenecks,
      optimizations,
      comparison: {
        vsTarget: (performance.totalTime / 1000 - 1) * 100, // vs 1s target
        vsAverage: 0, // Would need historical data
        vsMedian: 0, // Would need historical data
        percentile: 0, // Would need historical data
      },
    };
  }

  /**
   * Analyze content sources
   */
  private analyzeSources(provenance: ProvenanceInfo): SourceAnalysis[] {
    return provenance.sources.map((source) => ({
      id: source.id,
      type: source.type,
      reliability: source.reliability,
      contribution: 1 / provenance.sources.length, // Simplified - could be more sophisticated
      usage: 'included', // Would need to track exclusions during assembly
      reason: `${source.type} source with ${source.reliability}% reliability from ${source.location}`,
    }));
  }

  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(
    assemblyResult: AssemblyResult,
    summary: ContextPackSummary,
  ): string[] {
    const recommendations: string[] = [];

    // Performance recommendations
    if (assemblyResult.performance.totalTime > 1000) {
      recommendations.push(
        `Performance: Assembly took ${assemblyResult.performance.totalTime}ms, consider enabling caching or optimizing content sources`,
      );
    }

    // Token budget recommendations
    if (summary.tokenUsage.budgetUtilization > 90) {
      recommendations.push(
        `Token Budget: High utilization (${summary.tokenUsage.budgetUtilization}%), consider increasing budget or improving content prioritization`,
      );
    }

    // Content balance recommendations
    if (summary.contentBreakdown.memoryPercentage < 20) {
      recommendations.push(
        `Content Balance: Low memory content (${summary.contentBreakdown.memoryPercentage.toFixed(1)}%), consider improving job memory integration`,
      );
    }

    // Quality recommendations
    if (summary.quality.trustScore < 70) {
      recommendations.push(
        `Quality: Low trust score (${summary.quality.trustScore}%), review source reliability and validation processes`,
      );
    }

    // Cache recommendations
    if (!assemblyResult.cacheUsed && assemblyResult.performance.totalTime > 500) {
      recommendations.push(
        'Caching: Consider enabling cache for similar requests to improve performance',
      );
    }

    return recommendations;
  }

  /**
   * Identify warnings and issues
   */
  private identifyWarnings(
    assemblyResult: AssemblyResult,
    summary: ContextPackSummary,
  ): TransparencyWarning[] {
    const warnings: TransparencyWarning[] = [];

    // Convert assembly warnings to transparency warnings
    for (const warning of assemblyResult.warnings) {
      warnings.push({
        type:
          warning.type === 'performance'
            ? 'performance'
            : warning.type === 'budget'
              ? 'data_quality'
              : warning.type === 'integration'
                ? 'completeness'
                : 'reliability',
        severity:
          warning.severity === 'error'
            ? 'error'
            : warning.severity === 'warning'
              ? 'warning'
              : 'info',
        message: warning.message,
        recommendation: warning.recommendation || 'Review system configuration',
        affected: [warning.stage],
      });
    }

    // Add quality-based warnings
    if (summary.quality.trustScore < 50) {
      warnings.push({
        type: 'reliability',
        severity: 'warning',
        message: `Low trust score: ${summary.quality.trustScore}%`,
        recommendation: 'Review source quality and validation processes',
        affected: ['provenance', 'sources'],
      });
    }

    if (summary.contentBreakdown.totalSources < 5) {
      warnings.push({
        type: 'completeness',
        severity: 'warning',
        message: `Limited content sources: ${summary.contentBreakdown.totalSources}`,
        recommendation: 'Ensure all content integration layers are functioning',
        affected: ['content_gathering'],
      });
    }

    return warnings;
  }

  /**
   * Helper methods for decision analysis
   */
  private extractDecisionFactors(decision: any): DecisionFactor[] {
    // Simplified implementation - would extract from decision parameters
    return [
      {
        name: 'Confidence Level',
        value: decision.confidence / 100,
        weight: 1.0,
        contribution: decision.confidence / 100,
        explanation: `Decision made with ${decision.confidence}% confidence`,
      },
    ];
  }

  private identifyTradeoffs(decision: any): string[] {
    return [
      'Higher precision vs processing time',
      'Comprehensive context vs token budget efficiency',
      'Recent content vs proven effectiveness',
    ];
  }

  private calculateCompleteness(content: any): number {
    // Simplified completeness calculation
    const sections = [
      content.jobMemory.totalItems > 0,
      content.knowledgeBase.totalItems > 0,
      content.realtimeData.totalItems > 0,
      content.executiveSummary.length > 0,
      content.keyInsights.length > 0,
      content.criticalActions.length > 0,
    ];

    return (sections.filter(Boolean).length / sections.length) * 100;
  }

  private calculateConsistency(contextPack: ContextPack): number {
    // Simplified consistency calculation
    // Would analyze coherence between sections, metadata accuracy, etc.
    return 85; // Placeholder
  }

  /**
   * Get transparency statistics
   */
  getStats(): {
    totalQueries: number;
    queryTypes: Record<string, number>;
    averageReportSize: number;
    assembliesTracked: number;
  } {
    const queryTypes = this.queryHistory.reduce(
      (acc, query) => {
        const component = query.component || 'all';
        acc[component] = (acc[component] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      totalQueries: this.queryHistory.length,
      queryTypes,
      averageReportSize: 0, // Would need to track report sizes
      assembliesTracked: this.assemblyHistory.size,
    };
  }

  /**
   * Clear old data
   */
  cleanup(): void {
    // Keep only last 10 queries
    if (this.queryHistory.length > 10) {
      this.queryHistory = this.queryHistory.slice(-10);
    }

    logger.info('[FF2TransparencyIntegration] Cleaned up transparency data');
  }
}

export default FF2TransparencyIntegration;
