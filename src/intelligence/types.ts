// Context Pack Assembler Types
// Provides comprehensive type definitions for the Intelligence Layer's context pack system

export interface ContextPackAssemblerConfig {
  // Token Management
  maxTokensPerPack: number; // Default: 5000
  tokenCountingMethod: 'character' | 'word' | 'tiktoken';

  // Content Prioritization
  memoryContentPercentage: number; // Default: 30% (≥30% from job/project memory)
  knowledgeContentPercentage: number; // Default: 40%
  realtimeContentPercentage: number; // Default: 30%

  // Performance Settings
  maxGenerationTimeMs: number; // Default: 1000ms (<1s target)
  cacheEnabled: boolean;
  cacheTtlMinutes: number; // Default: 15 minutes

  // Integration Settings
  enableProvenanceTracking: boolean;
  enableContentDeduplication: boolean;
  enableAdaptiveOptimization: boolean;

  // Agent Template Settings
  templateBasePath: string;
  customTemplateEnabled: boolean;

  // ML Enhancement
  enableMLContentRanking: boolean;
  contentSimilarityThreshold: number; // Default: 0.85
}

// Context Pack Schema - Structured context delivery format
export interface ContextPack {
  metadata: ContextPackMetadata;
  content: ContextContent;
  provenance: ProvenanceInfo;
  tokenUsage: TokenUsageInfo;
}

export interface ContextPackMetadata {
  id: string;
  version: string;
  issueId: string;
  agentType: string;
  generatedAt: Date;
  validUntil: Date;
  priority: 'low' | 'medium' | 'high' | 'critical';
  tags: string[];
  templateUsed: string;
  optimizationLevel: number; // 0-100 score
}

export interface ContextContent {
  // Primary content sections
  jobMemory: MemoryContextSection;
  knowledgeBase: KnowledgeContextSection;
  realtimeData: RealtimeContextSection;

  // Agent-specific sections
  agentSpecific: AgentSpecificContent;

  // Cross-references
  relatedContexts: RelatedContextReference[];

  // Summary and highlights
  executiveSummary: string;
  keyInsights: string[];
  criticalActions: string[];
}

export interface MemoryContextSection {
  jobHistory: JobHistoryItem[];
  decisions: DecisionHistoryItem[];
  gotchas: GotchaContextItem[];
  patterns: PatternContextItem[];
  outcomes: OutcomeContextItem[];
  totalItems: number;
  priorityScore: number;
}

export interface KnowledgeContextSection {
  cards: KnowledgeCardContext[];
  adrs: ADRContextItem[];
  bestPractices: BestPracticeItem[];
  recommendations: RecommendationItem[];
  totalItems: number;
  relevanceScore: number;
}

export interface RealtimeContextSection {
  indexResults: IndexSearchResult[];
  retrievalResults: RetrievalResult[];
  liveData: LiveDataItem[];
  contextualFacts: ContextualFact[];
  totalItems: number;
  freshnessScore: number;
}

export interface AgentSpecificContent {
  agentType: string;
  specializations: string[];
  customInstructions: string[];
  toolsAvailable: string[];
  constraints: string[];
  preferences: Record<string, unknown>;
}

// Provenance System - Complete context source tracking
export interface ProvenanceInfo {
  sources: ContentSource[];
  transformations: ContentTransformation[];
  decisions: ProvenanceDecision[];
  auditTrail: AuditTrailEntry[];
  trustScore: number; // 0-100 score based on source reliability
}

export interface ContentSource {
  id: string;
  type: 'memory' | 'knowledge' | 'index' | 'retrieval' | 'realtime';
  location: string;
  timestamp: Date;
  reliability: number; // 0-100 score
  contentHash: string;
  metadata: Record<string, unknown>;
}

export interface ContentTransformation {
  type: 'filter' | 'prioritize' | 'summarize' | 'deduplicate' | 'optimize';
  input: string[];
  output: string[];
  parameters: Record<string, unknown>;
  duration: number;
  timestamp: Date;
}

export interface ProvenanceDecision {
  decision: string;
  rationale: string;
  alternatives: string[];
  confidence: number; // 0-100 score
  timestamp: Date;
  parameters: Record<string, unknown>;
}

// Token Budget Manager
export interface TokenUsageInfo {
  totalTokens: number;
  budgetLimit: number;
  utilization: number; // percentage
  breakdown: TokenBreakdown;
  optimizations: TokenOptimization[];
  warnings: TokenWarning[];
}

export interface TokenBreakdown {
  memory: number;
  knowledge: number;
  realtime: number;
  agentSpecific: number;
  metadata: number;
  provenance: number;
  [key: string]: number; // Allow additional numeric properties
}

export interface TokenOptimization {
  type: 'compression' | 'truncation' | 'substitution' | 'elimination';
  description: string;
  tokensSaved: number;
  impactLevel: 'minimal' | 'moderate' | 'significant';
  appliedAt: Date;
}

export interface TokenWarning {
  type: 'budget_exceeded' | 'low_priority_content' | 'optimization_suggested';
  severity: 'info' | 'warning' | 'error';
  message: string;
  recommendation: string;
  timestamp: Date;
}

// Content Prioritization
export interface ContentPrioritizationStrategy {
  name: string;
  version: string;
  algorithm: 'ml_ranking' | 'rule_based' | 'hybrid';
  parameters: PrioritizationParameters;
  performance: StrategyPerformance;
}

export interface PrioritizationParameters {
  recencyWeight: number;
  relevanceWeight: number;
  effectivenessWeight: number;
  frequencyWeight: number;
  agentPreferenceWeight: number;
  contextSimilarityWeight: number;
  userFeedbackWeight: number;
}

export interface StrategyPerformance {
  accuracy: number; // 0-100 score
  averageRankingTime: number; // milliseconds
  contentSatisfactionScore: number; // 0-100 based on outcomes
  adaptationRate: number; // how quickly it learns
}

// Agent Template System
export interface AgentTemplate {
  id: string;
  name: string;
  agentType: string;
  version: string;
  description: string;
  template: TemplateDefinition;
  customizations: TemplateCustomization[];
  performance: TemplatePerformance;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateDefinition {
  structure: TemplateStructure;
  formatting: TemplateFormatting;
  contentRules: ContentRule[];
  transformations: TemplateTransformation[];
}

export interface TemplateStructure {
  sections: TemplateSection[];
  requiredFields: string[];
  optionalFields: string[];
  conditionalFields: ConditionalField[];
}

export interface TemplateSection {
  id: string;
  name: string;
  order: number;
  required: boolean;
  maxTokens?: number;
  contentType: 'text' | 'list' | 'json' | 'code' | 'markdown';
  validation: ValidationRule[];
}

export interface TemplateFormatting {
  style: 'plain' | 'markdown' | 'json' | 'xml' | 'custom';
  indentation: number;
  lineBreaks: 'preserve' | 'normalize' | 'compact';
  codeHighlighting: boolean;
  customDelimiters?: Record<string, string>;
}

// Assembly Pipeline
export interface PipelinePerformance {
  maxExecutionTimeMs: number;
  maxMemoryUsageMB: number;
  targetThroughputRPS: number;
  averageExecutionTime: number; // Added for context-pack-assembler compatibility
  successRate: number; // Added for context-pack-assembler compatibility
  throughput: number; // Added for context-pack-assembler compatibility
  resourceLimits: {
    cpu: number;
    memory: number;
    disk: number;
  };
  caching: {
    enabled: boolean;
    maxCacheSizeMB: number;
    ttlSeconds: number;
  };
}

export interface AssemblyPipeline {
  id: string;
  name: string;
  version: string;
  stages: AssemblyStage[];
  parallelism: PipelineParallelism;
  errorHandling: ErrorHandlingStrategy;
  performance: PipelinePerformance;
}

export interface AssemblyStage {
  id: string;
  name: string;
  order: number;
  processor: StageProcessor;
  inputs: string[];
  outputs: string[];
  timeout: number;
  retryPolicy: RetryPolicy;
  healthCheck: HealthCheckConfig;
}

export interface StageProcessor {
  type: 'content_gatherer' | 'prioritizer' | 'deduplicator' | 'optimizer' | 'formatter';
  implementation: string;
  config: Record<string, unknown>;
  resources: ResourceRequirements;
}

export interface PipelineParallelism {
  enabled: boolean;
  maxConcurrency: number;
  stageGroups: ParallelStageGroup[];
  synchronizationPoints: SynchronizationPoint[];
}

export interface ParallelStageGroup {
  id: string;
  stages: string[];
  strategy: 'all_complete' | 'first_complete' | 'majority_complete';
}

// Caching Engine
export interface CacheConfig {
  enabled: boolean;
  provider: 'memory' | 'redis' | 'file' | 'hybrid';
  ttl: number; // Time to live in seconds
  maxSize: number; // Maximum cache size
  evictionPolicy: 'lru' | 'lfu' | 'ttl' | 'random';
  compression: boolean;
  encryption: boolean;
}

export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  metadata: CacheMetadata;
  tags: string[];
  dependencies: string[];
}

export interface CacheMetadata {
  createdAt: Date;
  updatedAt: Date;
  accessCount: number;
  lastAccessed: Date;
  ttl: number;
  size: number;
  compressed: boolean;
  hash: string;
}

export interface CacheInvalidationStrategy {
  type: 'time_based' | 'dependency_based' | 'content_based' | 'manual';
  parameters: Record<string, unknown>;
  triggers: InvalidationTrigger[];
}

export interface InvalidationTrigger {
  event: string;
  condition: string;
  action: 'invalidate' | 'refresh' | 'mark_stale';
  delay?: number;
}

// Performance Monitoring
export interface PerformanceMetrics {
  generation: GenerationMetrics;
  content: ContentMetrics;
  cache: CacheMetrics;
  integration: IntegrationMetrics;
  overall: OverallMetrics;
}

export interface GenerationMetrics {
  averageTimeMs: number;
  medianTimeMs: number;
  p95TimeMs: number;
  p99TimeMs: number;
  successRate: number;
  errorRate: number;
  timeoutRate: number;
}

export interface ContentMetrics {
  averageTokenCount: number;
  tokenUtilization: number;
  contentQualityScore: number;
  duplicateContentRate: number;
  memoryContentPercentage: number;
  knowledgeContentPercentage: number;
  realtimeContentPercentage: number;
}

export interface CacheMetrics {
  hitRate: number;
  missRate: number;
  evictionRate: number;
  averageRetrievalTime: number;
  storageUtilization: number;
  keyDistribution: Record<string, number>;
}

export interface IntegrationMetrics {
  indexLayerLatency: number;
  retrieverLayerLatency: number;
  knowledgeLayerLatency: number;
  memoryLayerLatency: number;
  totalIntegrationLatency: number;
  errorRateByLayer: Record<string, number>;
}

export interface OverallMetrics {
  throughput: number; // Context packs per minute
  availability: number; // Uptime percentage
  reliability: number; // Success rate
  efficiency: number; // Token utilization efficiency
  userSatisfaction: number; // Based on feedback
  costPerPack: number; // Resource cost
}

// Additional supporting types
export interface JobHistoryItem {
  id: string;
  timestamp: Date;
  description: string;
  outcome: string;
  relevance: number;
  tokenCount: number;
}

export interface DecisionHistoryItem {
  id: string;
  decision: string;
  rationale: string;
  outcome: string;
  timestamp: Date;
  relevance: number;
  tokenCount: number;
}

export interface GotchaContextItem {
  id: string;
  pattern: string;
  description: string;
  solution: string;
  occurrences: number;
  relevance: number;
  tokenCount: number;
}

export interface PatternContextItem {
  id: string;
  pattern: string;
  description: string;
  usage: string;
  effectiveness: number;
  relevance: number;
  tokenCount: number;
}

export interface OutcomeContextItem {
  id: string;
  action: string;
  result: string;
  metrics: Record<string, number>;
  timestamp: Date;
  relevance: number;
  tokenCount: number;
}

export interface KnowledgeCardContext {
  id: string;
  title: string;
  content: string;
  type: string;
  effectiveness: number;
  relevance: number;
  tokenCount: number;
}

export interface ADRContextItem {
  id: string;
  title: string;
  decision: string;
  rationale: string;
  consequences: string[];
  status: string;
  relevance: number;
  tokenCount: number;
}

export interface BestPracticeItem {
  id: string;
  title: string;
  description: string;
  category: string;
  applicability: string;
  relevance: number;
  tokenCount: number;
}

export interface RecommendationItem {
  id: string;
  recommendation: string;
  context: string;
  confidence: number;
  source: string;
  relevance: number;
  tokenCount: number;
}

export interface IndexSearchResult {
  id: string;
  title: string;
  content: string;
  score: number;
  source: string;
  timestamp: Date;
  relevance: number;
  tokenCount: number;
}

export interface RetrievalResult {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
  algorithm: string;
  timestamp: Date;
  relevance: number;
  tokenCount: number;
}

export interface LiveDataItem {
  id: string;
  type: 'metric' | 'status' | 'event' | 'alert';
  data: unknown;
  timestamp: Date;
  source: string;
  relevance: number;
  tokenCount: number;
}

export interface ContextualFact {
  id: string;
  fact: string;
  category: string;
  confidence: number;
  source: string;
  timestamp: Date;
  relevance: number;
  tokenCount: number;
}

export interface RelatedContextReference {
  contextId: string;
  relationship: 'related' | 'prerequisite' | 'follow_up' | 'alternative';
  relevance: number;
  description: string;
}

export interface AuditTrailEntry {
  id: string;
  timestamp: Date;
  event: string;
  actor: string;
  details: Record<string, unknown>;
  impact: 'low' | 'medium' | 'high';
}

export interface ValidationRule {
  type: 'required' | 'format' | 'range' | 'custom';
  parameters: Record<string, unknown>;
  errorMessage: string;
}

export interface ConditionalField {
  field: string;
  condition: string;
  value: unknown;
}

export interface TemplateCustomization {
  id: string;
  type: 'override' | 'extend' | 'replace';
  target: string;
  value: unknown;
  condition?: string;
}

export interface TemplatePerformance {
  averageRenderTime: number;
  tokenEfficiency: number;
  userSatisfaction: number;
  errorRate: number;
}

export interface ContentRule {
  id: string;
  type: 'include' | 'exclude' | 'transform' | 'validate';
  condition: string;
  action: string;
  parameters: Record<string, unknown>;
}

export interface TemplateTransformation {
  id: string;
  type: 'filter' | 'format' | 'summarize' | 'enhance';
  input: string;
  output: string;
  parameters: Record<string, unknown>;
}

export interface ResourceRequirements {
  cpu: number;
  memory: number;
  storage: number;
  network: number;
  timeout: number;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffStrategy: 'linear' | 'exponential' | 'fixed';
  baseDelay: number;
  maxDelay: number;
  conditions: string[];
}

export interface HealthCheckConfig {
  enabled: boolean;
  interval: number;
  timeout: number;
  endpoint?: string;
  expectedResponse?: unknown;
}

export interface SynchronizationPoint {
  id: string;
  type: 'barrier' | 'checkpoint' | 'merge';
  stages: string[];
  timeout: number;
  failurePolicy: 'abort' | 'continue' | 'retry';
}

export interface ErrorHandlingStrategy {
  policy: 'fail_fast' | 'graceful_degradation' | 'retry_with_fallback';
  maxRetries: number;
  timeoutMs: number;
  fallbackActions: FallbackAction[];
}

export interface FallbackAction {
  condition: string;
  action: 'use_cache' | 'use_defaults' | 'skip_stage' | 'abort';
  parameters: Record<string, unknown>;
}
