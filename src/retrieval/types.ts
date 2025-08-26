// FF2 Retriever Layer Types - ML-Enhanced Adaptive Learning System
// Layer 4: Intelligent retrieval with bandit algorithms and feature extraction

import type {
  SearchQuery,
  SearchResult,
  SearchResults,
  IndexEntry,
  IndexContentType,
} from '../indexing/types.js';

// === CORE RETRIEVAL INTERFACES ===

export interface RetrievalQuery extends SearchQuery {
  // Enhanced query context for ML features
  context: SearchContext;

  // Learning parameters
  explorationRate?: number; // For bandit algorithms (0.0 - 1.0)
  adaptiveWeights?: boolean; // Whether to use learned weights

  // ML options
  enableReranker?: boolean;
  vectorSearch?: boolean;
  hybridMode?: HybridRetrievalMode;

  // Feedback context
  sessionId?: string;
  userId?: string;
  agentType?: string;
}

export interface SearchContext {
  // Current session/task context
  currentIssue?: {
    id: string;
    title: string;
    labels: string[];
    description: string;
  };

  // Project context
  projectId: string;
  repositoryUrl?: string;
  activeBranch?: string;

  // User context
  agentTypes: string[];
  preferredLanguages: string[];
  expertiseLevel: 'beginner' | 'intermediate' | 'advanced';

  // Historical context
  recentQueries: string[];
  recentResults: string[];
  successfulPatterns: string[];

  // Time context
  timestamp: Date;
  timezone?: string;
  workingHours?: boolean;
}

export interface RetrievalResult extends SearchResult {
  // ML enhancements
  features: FeatureVector;
  confidenceScore: number;
  explorationBonus?: number;

  // Learning feedback
  userFeedback?: UserFeedback;
  clickthrough?: boolean;
  dwellTime?: number;

  // Provenance tracking
  retrievalStrategy: RetrievalStrategy;
  rankerUsed?: 'base' | 'ml-reranker';
  experimentGroup?: string;
}

export interface RetrievalResults extends SearchResults {
  results: RetrievalResult[];

  // ML metadata
  strategyUsed: RetrievalStrategy;
  explorationPerformed: boolean;
  adaptiveLearningActive: boolean;

  // Performance metrics
  featureExtractionTime: number;
  rankingTime: number;
  totalMLTime: number;

  // Experiment tracking
  experimentId?: string;
  controlGroup?: boolean;
}

// === BANDIT ALGORITHM INTERFACES ===

export interface BanditAlgorithm {
  // Core bandit operations
  selectArm(context: SearchContext): Promise<RetrievalStrategy>;
  updateReward(strategy: RetrievalStrategy, context: SearchContext, reward: number): Promise<void>;

  // Learning management
  getArmStatistics(): Promise<BanditStatistics>;
  resetLearning(): Promise<void>;
  exportModel(): Promise<BanditModel>;
  importModel(model: BanditModel): Promise<void>;
}

export interface BanditStatistics {
  totalTrials: number;
  totalReward: number;
  averageReward: number;

  armStats: Record<
    string,
    {
      name: string;
      trials: number;
      totalReward: number;
      averageReward: number;
      confidenceInterval: [number, number];
      lastUsed: Date;
    }
  >;

  // Performance metrics
  regret: number; // Cumulative regret over time
  convergenceRate: number;
  explorationRate: number;
}

export interface BanditModel {
  algorithm: 'epsilon-greedy' | 'ucb' | 'thompson-sampling';
  parameters: Record<string, number>;
  armEstimates: Record<
    string,
    {
      mean: number;
      variance: number;
      samples: number;
    }
  >;
  contextFeatures?: string[];
  modelVersion: string;
  trainingData: {
    contexts: SearchContext[];
    strategies: RetrievalStrategy[];
    rewards: number[];
  };
}

export type RetrievalStrategy =
  | 'fts-heavy'
  | 'vector-heavy'
  | 'balanced'
  | 'recency-focused'
  | 'effectiveness-focused'
  | 'popularity-focused'
  | 'semantic-focused';

export interface RetrievalWeights {
  // Base weights
  ftsWeight: number; // Full-text search importance
  vectorWeight: number; // Vector similarity importance

  // Feature weights
  recencyWeight: number;
  proximityWeight: number;
  affinityWeight: number;
  semanticWeight: number;

  // Usage weights
  popularityWeight: number;
  effectivenessWeight: number;

  // Context weights
  projectRelevanceWeight: number;
  agentTypeWeight: number;
}

// === FEATURE EXTRACTION INTERFACES ===

export interface FeatureExtractor {
  // Core feature extraction
  extractFeatures(query: RetrievalQuery, content: IndexEntry): Promise<FeatureVector>;

  extractBatchFeatures(query: RetrievalQuery, contents: IndexEntry[]): Promise<FeatureVector[]>;

  // Feature category extractors
  extractRecencyFeatures(content: IndexEntry): RecencyFeatures;
  extractProximityFeatures(query: RetrievalQuery, content: IndexEntry): ProximityFeatures;
  extractAffinityFeatures(context: SearchContext, content: IndexEntry): AffinityFeatures;
  extractSemanticFeatures(content: IndexEntry): SemanticFeatures;

  // Feature normalization
  normalizeFeatures(features: FeatureVector): FeatureVector;
  scaleFeatures(features: FeatureVector[]): FeatureVector[];
}

export interface FeatureVector {
  // Basic features
  basic: {
    titleMatchScore: number;
    contentMatchScore: number;
    tagMatchScore: number;
    categoryMatch: boolean;
  };

  // Recency features
  recency: RecencyFeatures;

  // Proximity features
  proximity: ProximityFeatures;

  // User affinity features
  affinity: AffinityFeatures;

  // Semantic features
  semantic: SemanticFeatures;

  // Context features
  context: ContextFeatures;

  // Derived features
  derived: {
    overallRelevance: number;
    uncertaintyScore: number;
    noveltyScore: number;
  };
}

export interface RecencyFeatures {
  daysSinceCreated: number;
  daysSinceModified: number;
  daysSinceLastUsed: number;

  // Decay scores (exponential decay)
  creationDecay: number; // e^(-days/30)
  modificationDecay: number;
  usageDecay: number;

  // Temporal patterns
  isRecentlyActive: boolean;
  hasRecentUpdates: boolean;
  weekdayCreated: number; // 0-6, normalized
  hourCreated: number; // 0-23, normalized
}

export interface ProximityFeatures {
  // Text similarity
  exactPhraseMatch: boolean;
  wordOverlapRatio: number;
  characterSimilarity: number;

  // Semantic similarity
  cosineSimilarity: number;
  jaccardSimilarity: number;

  // Query-specific proximity
  titleProximity: number;
  contentProximity: number;
  tagsProximity: number;

  // Structural proximity
  pathSimilarity: number; // For code files
  hierarchyDistance: number; // Folder/namespace distance
}

export interface AffinityFeatures {
  // User interaction history
  userPreviousInteractions: number;
  userSuccessRate: number;
  userDwellTime: number;

  // Agent affinity
  agentTypeRelevance: number;
  agentSuccessHistory: number;

  // Project affinity
  projectRelevance: number;
  crossProjectUsage: number;

  // Content affinity
  languagePreference: number;
  complexityFit: number; // Based on user expertise level
  domainFit: number; // Based on current task domain
}

export interface SemanticFeatures {
  // Vector representations (if available)
  embeddingVector?: number[];
  embeddingSimilarity?: number;

  // Topic modeling features
  topicDistribution?: number[];
  dominantTopic?: string;
  topicPurity: number;

  // Language features
  language: string;
  codeLanguage?: string;
  complexityScore: number;
  readabilityScore: number;

  // Content characteristics
  hasCodeExamples: boolean;
  hasImageDiagrams: boolean;
  hasExternalLinks: boolean;
  documentLength: number;
}

export interface ContextFeatures {
  // Current task context
  issueRelevance: number;
  taskPhaseRelevance: number; // planning/implementation/testing/review
  urgencyMatch: number;

  // Temporal context
  isWorkingHours: boolean;
  isWeekend: boolean;
  timeOfDay: number; // 0-1 normalized

  // Session context
  queryPosition: number; // Position in query sequence
  sessionLength: number; // Current session duration
  queryComplexity: number; // Based on query structure

  // Environmental context
  activeProject: boolean;
  repositoryActive: boolean;
  branchContext: boolean;
}

// === HYBRID RETRIEVAL INTERFACES ===

export interface HybridRetriever {
  // Main retrieval operation
  retrieve(query: RetrievalQuery): Promise<RetrievalResults>;

  // Individual retrieval methods
  performFTSRetrieval(query: RetrievalQuery): Promise<SearchResult[]>;
  performVectorRetrieval(query: RetrievalQuery): Promise<SearchResult[]>;
  performSemanticRetrieval(query: RetrievalQuery): Promise<SearchResult[]>;

  // Fusion algorithms
  fuseResults(
    ftsResults: SearchResult[],
    vectorResults: SearchResult[],
    weights: RetrievalWeights,
  ): Promise<SearchResult[]>;

  // Strategy management
  getOptimalStrategy(context: SearchContext): Promise<RetrievalStrategy>;
  adaptWeights(strategy: RetrievalStrategy, feedback: UserFeedback[]): Promise<RetrievalWeights>;
}

export type HybridRetrievalMode =
  | 'parallel' // Run FTS and vector search in parallel
  | 'cascade' // Run FTS first, then vector if needed
  | 'adaptive' // Use bandit to decide approach
  | 'ensemble'; // Combine multiple approaches with learned weights

export interface RankFusionAlgorithm {
  // Fusion methods
  reciprocalRankFusion(rankedLists: SearchResult[][], k?: number): SearchResult[];

  bordaCount(rankedLists: SearchResult[][]): SearchResult[];

  weightedFusion(rankedLists: SearchResult[][], weights: number[]): SearchResult[];

  // Advanced fusion
  learningToRank(
    rankedLists: SearchResult[][],
    features: FeatureVector[],
    model?: RankingModel,
  ): SearchResult[];
}

// === RERANKING INTERFACES ===

export interface LogisticReranker {
  // Core reranking
  rerank(query: RetrievalQuery, results: SearchResult[]): Promise<SearchResult[]>;

  // Model operations
  trainModel(trainingData: RerankingTrainingData): Promise<void>;
  updateOnline(query: RetrievalQuery, result: SearchResult, feedback: UserFeedback): Promise<void>;

  // Model management
  saveModel(): Promise<void>;
  loadModel(): Promise<void>;
  getModelMetrics(): Promise<RerankingMetrics>;
}

export interface RankingModel {
  // Model parameters
  weights: number[];
  bias: number;

  // Model metadata
  features: string[];
  accuracy: number;
  precision: number;
  recall: number;

  // Training info
  trainingSize: number;
  lastTrained: Date;
  modelVersion: string;
}

export interface RerankingTrainingData {
  queries: RetrievalQuery[];
  candidates: SearchResult[][];
  labels: number[][]; // Relevance scores 0-1 or binary
  features: FeatureVector[][];
}

export interface RerankingMetrics {
  // Model performance
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  auc: number;

  // Ranking metrics
  meanReciprocalRank: number;
  ndcg: number; // Normalized Discounted Cumulative Gain
  map: number; // Mean Average Precision

  // Training metrics
  trainingLoss: number;
  validationLoss: number;
  convergence: boolean;
}

// === LEARNING & ANALYTICS INTERFACES ===

export interface LearningAnalytics {
  // Performance tracking
  trackRetrieval(
    query: RetrievalQuery,
    results: RetrievalResults,
    feedback?: UserFeedback,
  ): Promise<void>;

  // Analytics queries
  getRetrievalMetrics(
    startDate: Date,
    endDate: Date,
    filters?: AnalyticsFilters,
  ): Promise<RetrievalAnalytics>;

  getLearningProgress(): Promise<LearningProgress>;
  getStrategyEffectiveness(): Promise<StrategyEffectiveness[]>;

  // A/B testing
  createExperiment(config: ExperimentConfig): Promise<string>;
  getExperimentResults(experimentId: string): Promise<ExperimentResults>;

  // Reporting
  generateLearningReport(period: 'day' | 'week' | 'month', date: Date): Promise<LearningReport>;
}

export interface UserFeedback {
  // Explicit feedback
  relevanceRating?: number; // 1-5 scale
  thumbsUp?: boolean;
  thumbsDown?: boolean;

  // Implicit feedback
  clicked: boolean;
  dwellTime: number; // milliseconds
  scrollDepth?: number; // 0-1

  // Action feedback
  usedInSolution: boolean;
  copiedContent: boolean;
  bookmarked: boolean;

  // Context
  timestamp: Date;
  sessionId: string;
  queryId: string;
  resultRank: number;
}

export interface RetrievalAnalytics {
  // Query statistics
  totalQueries: number;
  uniqueQueries: number;
  averageResultsPerQuery: number;
  zeroResultQueries: number;

  // Performance metrics
  averageRetrievalTime: number;
  averageFeatureExtractionTime: number;
  averageRankingTime: number;
  cacheHitRate: number;

  // ML metrics
  banditRegret: number;
  explorationRate: number;
  modelAccuracy?: number;

  // User satisfaction
  averageRelevanceScore: number;
  clickThroughRate: number;
  successRate: number; // Based on task completion

  // Strategy usage
  strategyDistribution: Record<RetrievalStrategy, number>;
  optimalStrategyRate: number;

  // Time period
  startDate: Date;
  endDate: Date;
}

export interface LearningProgress {
  // Overall progress
  totalIterations: number;
  totalReward: number;
  averageReward: number;
  rewardTrend: number[]; // Last N iterations

  // Convergence metrics
  isConverging: boolean;
  convergenceRate: number;
  stabilityMetric: number;

  // Exploration vs exploitation
  explorationRate: number;
  exploitationRate: number;
  optimalBalance: boolean;

  // Feature importance
  featureImportance: Record<string, number>;
  topFeatures: Array<{ name: string; importance: number }>;
}

export interface StrategyEffectiveness {
  strategy: RetrievalStrategy;

  // Performance metrics
  averageReward: number;
  successRate: number;
  averageResponseTime: number;

  // Usage statistics
  timesUsed: number;
  percentageUsed: number;

  // Context effectiveness
  bestContexts: Array<{
    context: Partial<SearchContext>;
    effectiveness: number;
  }>;

  // Trend data
  rewardTrend: Array<{
    date: Date;
    reward: number;
  }>;
}

export interface ExperimentConfig {
  name: string;
  description: string;

  // Experiment design
  controlStrategy: RetrievalStrategy;
  testStrategies: RetrievalStrategy[];
  trafficSplit: number[]; // Percentages for each strategy

  // Targeting
  userSegments?: string[];
  queryTypes?: string[];
  contentTypes?: IndexContentType[];

  // Duration and goals
  startDate: Date;
  endDate: Date;
  successMetrics: string[];
  minimumSampleSize: number;

  // Statistical parameters
  confidenceLevel: number; // 0.95 = 95%
  minimumEffect: number; // Minimum effect size to detect
}

export interface ExperimentResults {
  experimentId: string;
  config: ExperimentConfig;
  status: 'running' | 'completed' | 'stopped';

  // Sample statistics
  totalSamples: number;
  samplesPerVariant: Record<string, number>;

  // Performance results
  variantResults: Record<
    string,
    {
      strategy: RetrievalStrategy;
      averageReward: number;
      confidenceInterval: [number, number];
      samples: number;
      successRate: number;
    }
  >;

  // Statistical significance
  isStatisticallySignificant: boolean;
  pValue: number;
  effectSize: number;

  // Recommendations
  winner?: RetrievalStrategy;
  recommendation: string;
  confidenceLevel: number;
}

export interface LearningReport {
  period: 'day' | 'week' | 'month';
  date: Date;

  // Executive summary
  summary: {
    totalQueries: number;
    averagePerformance: number;
    improvementRate: number;
    topStrategy: RetrievalStrategy;
  };

  // Detailed metrics
  analytics: RetrievalAnalytics;
  progress: LearningProgress;
  strategies: StrategyEffectiveness[];

  // Insights and recommendations
  insights: Array<{
    type: 'improvement' | 'degradation' | 'trend' | 'anomaly';
    message: string;
    impact: 'high' | 'medium' | 'low';
    actionRequired: boolean;
  }>;

  recommendations: Array<{
    type: 'configuration' | 'training' | 'feature' | 'strategy';
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    estimatedImpact: number;
  }>;
}

export interface AnalyticsFilters {
  // Time filters
  startDate?: Date;
  endDate?: Date;

  // Content filters
  contentTypes?: IndexContentType[];
  categories?: string[];
  projects?: string[];

  // User filters
  agentTypes?: string[];
  userSegments?: string[];

  // Query filters
  queryTypes?: string[];
  complexityLevel?: 'low' | 'medium' | 'high';

  // Performance filters
  minResponseTime?: number;
  maxResponseTime?: number;
  minRelevanceScore?: number;
}

// === ERROR HANDLING ===

export class RetrievalError extends Error {
  constructor(
    message: string,
    public code: RetrievalErrorCode,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'RetrievalError';
  }
}

export enum RetrievalErrorCode {
  FEATURE_EXTRACTION_FAILED = 'FEATURE_EXTRACTION_FAILED',
  BANDIT_UPDATE_FAILED = 'BANDIT_UPDATE_FAILED',
  RERANKER_FAILED = 'RERANKER_FAILED',
  HYBRID_FUSION_FAILED = 'HYBRID_FUSION_FAILED',
  MODEL_TRAINING_FAILED = 'MODEL_TRAINING_FAILED',
  INVALID_STRATEGY = 'INVALID_STRATEGY',
  INSUFFICIENT_TRAINING_DATA = 'INSUFFICIENT_TRAINING_DATA',
  EXPERIMENT_CONFIGURATION_INVALID = 'EXPERIMENT_CONFIGURATION_INVALID',
}

// === CONFIGURATION ===

export interface RetrievalConfig {
  // Bandit configuration
  bandit: {
    algorithm: 'epsilon-greedy' | 'ucb' | 'thompson-sampling';
    epsilonDecay: number;
    initialEpsilon: number;
    confidenceLevel: number;
    windowSize: number; // For sliding window algorithms
  };

  // Feature extraction configuration
  features: {
    enableRecencyFeatures: boolean;
    enableProximityFeatures: boolean;
    enableAffinityFeatures: boolean;
    enableSemanticFeatures: boolean;
    enableContextFeatures: boolean;

    // Feature weights (for linear combination)
    featureWeights: Record<string, number>;

    // Normalization
    normalizeFeatures: boolean;
    scalingMethod: 'minmax' | 'zscore' | 'robust';
  };

  // Reranking configuration
  reranking: {
    enabled: boolean;
    algorithm: 'logistic' | 'ranknet' | 'lambdamart';
    learningRate: number;
    regularization: number;
    batchSize: number;
    onlineLearning: boolean;
  };

  // Hybrid retrieval configuration
  hybrid: {
    defaultMode: HybridRetrievalMode;
    parallelTimeout: number; // milliseconds
    fusionAlgorithm: 'rrf' | 'borda' | 'weighted' | 'ltr';
    enableVectorSearch: boolean;
  };

  // Analytics configuration
  analytics: {
    trackingEnabled: boolean;
    batchSize: number;
    retentionDays: number;

    // Performance thresholds for alerting
    slowQueryThreshold: number; // milliseconds
    lowRelevanceThreshold: number; // 0-1 score

    // Experiment configuration
    defaultConfidenceLevel: number;
    defaultMinimumEffect: number;
  };

  // Performance configuration
  performance: {
    maxFeatureExtractionTime: number; // milliseconds
    maxRerankingCandidates: number;
    cacheEnabled: boolean;
    cacheTTL: number; // milliseconds

    // Resource limits
    maxMemoryUsage: number; // bytes
    maxConcurrentQueries: number;
  };
}
