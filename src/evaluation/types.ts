// Evaluation Layer Types - Self-improving analytics system for ForgeFlow V2
// Comprehensive job outcome tracking and pattern analysis

export interface EvaluationConfig {
  loggingBasePath: string;
  jobsLogFile: string; // Path to jobs.ndjson file
  analysisInterval: number; // Hours between analysis runs
  promotionThreshold: number; // Effectiveness threshold for card promotion
  demotionThreshold: number; // Effectiveness threshold for card demotion
  patternAnalysisWindow: number; // Days to analyze for patterns
  performanceThresholds: {
    jobLoggingMs: number; // <10ms target
    patternAnalysisMs: number; // <100ms target
    analyticsGenerationMs: number; // <2000ms target
    qualityAssessmentMs: number; // Continuous assessment target
  };
  mlConfig: {
    enabled: boolean;
    modelPath?: string;
    trainingDataSize: number;
    retrainInterval: number; // Days
  };
}

// Job Outcome Logging Infrastructure
export interface JobOutcome {
  // Core identification
  jobId: string;
  issueId: string;
  issueNumber?: number;
  executionId: string;
  timestamp: Date;

  // Job metadata
  metadata: JobMetadata;

  // Outcome classification
  success: boolean;
  status: 'completed' | 'failed' | 'partial' | 'cancelled' | 'error';

  // Performance metrics
  metrics: JobMetrics;

  // Context and tracking
  context: JobContext;

  // Analysis data
  patterns: PatternData;

  // Quality assessment
  quality: QualityMetrics;

  // Learning data
  learning: LearningMetrics;
}

export interface JobMetadata {
  // Execution details
  agentTypes: string[];
  pattern: string; // Execution pattern used
  phase: string; // Current execution phase
  priority: 'low' | 'medium' | 'high' | 'critical';

  // Timing
  startTime: Date;
  endTime?: Date;
  duration?: number; // milliseconds

  // Classification
  category: 'feature' | 'bugfix' | 'refactor' | 'test' | 'deploy' | 'maintenance';
  complexity: 'low' | 'medium' | 'high' | 'very-high';

  // Environment
  worktreeId?: string;
  branchName?: string;
  parentJobId?: string;
  childJobIds: string[];

  // External references
  githubData: {
    prNumber?: number;
    commitSha?: string;
    reviewers?: string[];
    labels: string[];
  };
}

export interface JobMetrics {
  // Performance
  performance: {
    totalDuration: number; // milliseconds
    agentDurations: Record<string, number>;
    queueTime: number;
    executionTime: number;
    overhead: number;
  };

  // Code changes
  codeChanges: {
    linesAdded: number;
    linesRemoved: number;
    linesModified: number;
    filesAdded: number;
    filesRemoved: number;
    filesModified: number;
    complexity: number; // cyclomatic complexity
  };

  // Quality gates
  qualityGates: {
    linting: { passed: boolean; errors: number; warnings: number };
    typecheck: { passed: boolean; errors: number };
    testing: { passed: boolean; coverage: number; failedTests: number };
    security: { passed: boolean; vulnerabilities: number; severity: string };
    performance: { passed: boolean; score: number; loadTime?: number };
  };

  // Resource usage
  resources: {
    memoryUsage: number; // MB
    cpuUsage: number; // percentage
    diskUsage: number; // MB
    networkRequests: number;
  };
}

export interface JobContext {
  // Project context
  projectId: string;
  projectPath: string;
  projectType: string;

  // Knowledge context
  knowledgeCards: Array<{
    cardId: string;
    title: string;
    relevanceScore: number;
    effectiveness: number;
    usageOutcome: 'success' | 'failure' | 'partial';
  }>;

  // Similar jobs context
  similarJobs: Array<{
    jobId: string;
    similarity: number;
    outcome: boolean;
    lessons: string[];
  }>;

  // Environment context
  environment: {
    nodeVersion?: string;
    npmVersion?: string;
    operatingSystem: string;
    dependencies: Record<string, string>;
  };

  // User context
  userContext: {
    userInput: string;
    requestType: string;
    urgency: 'low' | 'medium' | 'high' | 'critical';
  };
}

export interface PatternData {
  // Success patterns
  successPatterns: Array<{
    patternId: string;
    description: string;
    confidence: number;
    evidence: string[];
  }>;

  // Failure patterns
  failurePatterns: Array<{
    patternId: string;
    description: string;
    confidence: number;
    evidence: string[];
  }>;

  // Decision patterns
  decisionPatterns: Array<{
    decisionId: string;
    effectiveness: number;
    context: string[];
    outcome: 'positive' | 'negative' | 'neutral';
  }>;

  // Anti-patterns detected
  antiPatterns: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    recommendation: string;
  }>;
}

export interface QualityMetrics {
  // Overall quality score (0-1)
  overallScore: number;

  // Component scores
  components: {
    codeQuality: number;
    testQuality: number;
    documentation: number;
    maintainability: number;
    security: number;
    performance: number;
  };

  // Quality gates
  gatesPassed: number;
  gatesTotal: number;
  gatesSkipped: number;

  // Issues found
  issues: Array<{
    type: 'error' | 'warning' | 'info';
    category: string;
    description: string;
    severity: number;
    fixed: boolean;
  }>;

  // Improvements made
  improvements: Array<{
    type: string;
    description: string;
    impact: number; // 0-1 score
  }>;
}

export interface LearningMetrics {
  // Learning scores
  learningGenerated: number; // 0-1 score of new knowledge created
  knowledgeReused: number; // 0-1 score of existing knowledge used
  adaptabilityShown: number; // 0-1 score of adaptation to new situations

  // Knowledge impact
  knowledgeImpact: {
    cardsCreated: number;
    cardsUpdated: number;
    gotchasResolved: number;
    patternsIdentified: number;
  };

  // Learning efficiency
  efficiency: {
    timeToFirstSolution: number;
    iterationsToSuccess: number;
    errorRecoveryTime: number;
    knowledgeRetrievalTime: number;
  };

  // Future predictions
  predictions: {
    futureSuccessLikelihood: number;
    estimatedComplexity: number;
    recommendedApproach: string;
    riskFactors: string[];
  };
}

// Pattern Analysis Engine Types
export interface PatternAnalysisEngine {
  analyzeJobOutcome(job: JobOutcome): Promise<PatternAnalysisResult>;
  identifySuccessPatterns(jobs: JobOutcome[]): Promise<SuccessPattern[]>;
  identifyFailurePatterns(jobs: JobOutcome[]): Promise<FailurePattern[]>;
  predictJobSuccess(context: JobContext, metadata: JobMetadata): Promise<SuccessPrediction>;
  updatePatternModels(jobs: JobOutcome[]): Promise<void>;
}

export interface PatternAnalysisResult {
  jobId: string;
  analysisTimestamp: Date;
  confidence: number;

  // Pattern matches
  matchedPatterns: Array<{
    patternId: string;
    type: 'success' | 'failure' | 'mixed';
    confidence: number;
    relevance: number;
    evidence: string[];
  }>;

  // Recommendations
  recommendations: Array<{
    type: 'prevention' | 'optimization' | 'learning';
    description: string;
    priority: 'low' | 'medium' | 'high';
    impact: number;
  }>;

  // Learning opportunities
  learningOpportunities: Array<{
    category: string;
    description: string;
    value: number; // 0-1 score
  }>;
}

export interface SuccessPattern {
  id: string;
  name: string;
  description: string;
  confidence: number; // 0-1 score
  occurrences: number;

  // Pattern conditions
  conditions: Array<{
    type: 'metric' | 'context' | 'agent' | 'timing' | 'environment';
    field: string;
    operator: 'eq' | 'gt' | 'lt' | 'contains' | 'matches';
    value: any;
    importance: number; // 0-1 score
  }>;

  // Success indicators
  indicators: {
    avgSuccessRate: number;
    avgDuration: number;
    avgQualityScore: number;
    commonFactors: string[];
  };

  // Applicable contexts
  applicableContexts: {
    agentTypes: string[];
    complexities: string[];
    categories: string[];
    patterns: string[];
  };

  // Learning data
  learningData: {
    createdAt: Date;
    lastUpdated: Date;
    trainingJobs: number;
    effectiveness: number; // How often this pattern predicts success
  };
}

export interface FailurePattern {
  id: string;
  name: string;
  description: string;
  confidence: number; // 0-1 score
  occurrences: number;

  // Failure triggers
  triggers: Array<{
    type: 'metric' | 'context' | 'agent' | 'timing' | 'environment';
    field: string;
    operator: 'eq' | 'gt' | 'lt' | 'contains' | 'matches';
    value: any;
    riskLevel: number; // 0-1 score
  }>;

  // Failure characteristics
  characteristics: {
    avgFailureRate: number;
    avgRecoveryTime: number;
    commonErrors: string[];
    impactAreas: string[];
  };

  // Prevention strategies
  preventionStrategies: Array<{
    strategy: string;
    effectiveness: number; // 0-1 score
    implementationCost: 'low' | 'medium' | 'high';
    description: string;
  }>;

  // Learning data
  learningData: {
    createdAt: Date;
    lastUpdated: Date;
    trainingJobs: number;
    preventionSuccess: number; // How often prevention worked
  };
}

export interface SuccessPrediction {
  jobId?: string;
  timestamp: Date;

  // Prediction results
  successProbability: number; // 0-1 score
  confidence: number; // 0-1 confidence in prediction

  // Risk assessment
  riskFactors: Array<{
    factor: string;
    impact: number; // 0-1 score
    mitigation: string;
  }>;

  // Success factors
  successFactors: Array<{
    factor: string;
    contribution: number; // 0-1 score
    optimization: string;
  }>;

  // Estimated metrics
  estimatedMetrics: {
    duration: number; // milliseconds
    qualityScore: number; // 0-1 score
    learningValue: number; // 0-1 score
  };

  // Recommendations
  recommendations: Array<{
    type: 'agent' | 'approach' | 'resource' | 'timing';
    description: string;
    expectedImprovement: number; // 0-1 score
  }>;
}

// Knowledge Promotion System Types
export interface KnowledgePromotionSystem {
  evaluateCardEffectiveness(cardId: string): Promise<EffectivenessEvaluation>;
  promoteDemoteCards(): Promise<PromotionDemotionResult>;
  trackCardUsageOutcome(cardId: string, jobId: string, outcome: CardUsageOutcome): Promise<void>;
  getPromotionCandidates(): Promise<PromotionCandidate[]>;
  getDemotionCandidates(): Promise<DemotionCandidate[]>;
}

export interface EffectivenessEvaluation {
  cardId: string;
  timestamp: Date;

  // Current effectiveness
  currentEffectiveness: number; // 0-1 score

  // Usage statistics
  usageStats: {
    totalUsages: number;
    recentUsages: number; // last 30 days
    successfulUsages: number;
    failedUsages: number;
    avgImpact: number; // 0-1 score
  };

  // Performance metrics
  performanceMetrics: {
    avgJobDuration: number;
    avgQualityImprovement: number;
    avgLearningValue: number;
    userSatisfaction: number; // 0-1 score
  };

  // Context effectiveness
  contextEffectiveness: {
    bestContexts: Array<{
      context: string;
      effectiveness: number;
      usage: number;
    }>;
    worstContexts: Array<{
      context: string;
      effectiveness: number;
      usage: number;
    }>;
  };

  // Trend analysis
  trendAnalysis: {
    trend: 'improving' | 'declining' | 'stable';
    changeRate: number; // per day
    confidenceInterval: number;
  };

  // Recommendation
  recommendation: 'promote' | 'maintain' | 'demote' | 'retire';
  reasoning: string[];
}

export interface PromotionDemotionResult {
  timestamp: Date;

  // Actions taken
  promoted: Array<{
    cardId: string;
    fromLevel: string;
    toLevel: string;
    reason: string;
  }>;

  demoted: Array<{
    cardId: string;
    fromLevel: string;
    toLevel: string;
    reason: string;
  }>;

  retired: Array<{
    cardId: string;
    reason: string;
    archiveLocation: string;
  }>;

  // Statistics
  stats: {
    totalEvaluated: number;
    promotedCount: number;
    demotedCount: number;
    retiredCount: number;
    maintainedCount: number;
  };

  // Impact assessment
  expectedImpact: {
    qualityImprovement: number; // 0-1 score
    performanceImprovement: number; // 0-1 score
    learningEfficiencyGain: number; // 0-1 score
  };
}

export interface CardUsageOutcome {
  cardId: string;
  jobId: string;
  timestamp: Date;

  // Usage context
  context: {
    agentType: string;
    jobCategory: string;
    complexity: string;
    phase: string;
  };

  // Usage outcome
  outcome: {
    success: boolean;
    relevance: number; // 0-1 score - how relevant the card was
    effectiveness: number; // 0-1 score - how effective it was
    timeToApply: number; // milliseconds
    userSatisfaction: number; // 0-1 score
  };

  // Impact metrics
  impact: {
    qualityImprovement: number;
    performanceGain: number;
    learningValue: number;
    timesSaved: number; // milliseconds
  };

  // Feedback
  feedback: {
    positive: string[];
    negative: string[];
    suggestions: string[];
  };
}

export interface PromotionCandidate {
  cardId: string;
  title: string;
  currentLevel: string;
  suggestedLevel: string;
  score: number; // 0-1 promotion score
  reasons: string[];
  expectedImpact: number; // 0-1 score
  confidence: number; // 0-1 score
}

export interface DemotionCandidate {
  cardId: string;
  title: string;
  currentLevel: string;
  suggestedLevel: string;
  score: number; // 0-1 demotion score (higher = more likely to demote)
  reasons: string[];
  alternatives: string[]; // alternative cards to suggest
  confidence: number; // 0-1 score
}

// Learning Effectiveness Analytics Types
export interface LearningAnalytics {
  calculateEffectiveness(timeRange: TimeRange): Promise<EffectivenessReport>;
  analyzeLearningTrends(timeRange: TimeRange): Promise<LearningTrends>;
  generateInsights(jobs: JobOutcome[]): Promise<LearningInsights>;
  trackProgressMetrics(): Promise<ProgressMetrics>;
  generateRecommendations(): Promise<LearningRecommendations>;
}

export interface EffectivenessReport {
  timeRange: TimeRange;
  timestamp: Date;

  // Overall effectiveness
  overallScore: number; // 0-1 score

  // Learning metrics
  learningMetrics: {
    knowledgeCreationRate: number; // cards created per job
    knowledgeReuseRate: number; // cards reused per job
    adaptabilityScore: number; // 0-1 score
    improvementRate: number; // quality improvement over time
  };

  // Agent effectiveness
  agentEffectiveness: Array<{
    agentType: string;
    effectiveness: number; // 0-1 score
    learningRate: number; // improvement over time
    strengths: string[];
    weaknesses: string[];
  }>;

  // Pattern effectiveness
  patternEffectiveness: {
    successPatterns: Array<{
      patternId: string;
      accuracy: number; // prediction accuracy
      coverage: number; // % of jobs covered
      impact: number; // 0-1 score
    }>;

    failurePatterns: Array<{
      patternId: string;
      accuracy: number; // prediction accuracy
      preventionRate: number; // % of failures prevented
      impact: number; // 0-1 score
    }>;
  };

  // Knowledge effectiveness
  knowledgeEffectiveness: {
    topPerformingCards: Array<{
      cardId: string;
      title: string;
      effectiveness: number;
      impact: number;
    }>;

    underPerformingCards: Array<{
      cardId: string;
      title: string;
      effectiveness: number;
      issues: string[];
    }>;

    categoryPerformance: Record<string, number>;
  };
}

export interface LearningTrends {
  timeRange: TimeRange;
  timestamp: Date;

  // Trend indicators
  trends: {
    overallLearning: TrendIndicator;
    knowledgeCreation: TrendIndicator;
    knowledgeReuse: TrendIndicator;
    patternAccuracy: TrendIndicator;
    jobSuccessRate: TrendIndicator;
    averageJobQuality: TrendIndicator;
  };

  // Detailed analysis
  analysis: {
    periodComparison: Array<{
      period: string; // "week 1", "week 2", etc.
      metrics: {
        jobCount: number;
        successRate: number;
        avgQuality: number;
        learningGenerated: number;
      };
    }>;

    trendExplanations: Array<{
      metric: string;
      trend: 'improving' | 'declining' | 'stable';
      explanation: string;
      confidence: number;
    }>;
  };

  // Predictions
  predictions: {
    nextPeriodProjection: {
      successRate: number;
      qualityScore: number;
      learningRate: number;
      confidence: number;
    };

    longTermTrends: Array<{
      metric: string;
      projected6Month: number;
      projected1Year: number;
      confidence: number;
    }>;
  };
}

export interface TrendIndicator {
  current: number;
  previous: number;
  change: number; // percentage change
  direction: 'up' | 'down' | 'stable';
  significance: 'high' | 'medium' | 'low';
}

export interface LearningInsights {
  timestamp: Date;

  // Key insights
  insights: Array<{
    type: 'success_factor' | 'failure_factor' | 'learning_opportunity' | 'optimization';
    title: string;
    description: string;
    evidence: string[];
    confidence: number;
    impact: number;
    actionable: boolean;
  }>;

  // Success factors
  successFactors: Array<{
    factor: string;
    correlation: number; // -1 to 1
    examples: string[];
    recommendations: string[];
  }>;

  // Learning gaps
  learningGaps: Array<{
    area: string;
    severity: 'low' | 'medium' | 'high';
    description: string;
    suggestedActions: string[];
  }>;

  // Optimization opportunities
  optimizations: Array<{
    area: string;
    currentPerformance: number;
    potentialImprovement: number;
    effortRequired: 'low' | 'medium' | 'high';
    description: string;
  }>;

  // Knowledge distribution
  knowledgeDistribution: {
    byCategory: Record<string, number>;
    byAgent: Record<string, number>;
    byComplexity: Record<string, number>;
    gaps: string[];
    duplications: string[];
  };
}

export interface ProgressMetrics {
  timestamp: Date;

  // Cumulative progress
  cumulative: {
    totalJobs: number;
    successfulJobs: number;
    knowledgeCards: number;
    patternsLearned: number;
    gotchasResolved: number;
  };

  // Recent progress (last 30 days)
  recent: {
    jobsCompleted: number;
    avgQuality: number;
    avgLearningValue: number;
    newKnowledge: number;
    improvementRate: number;
  };

  // Milestones achieved
  milestones: Array<{
    name: string;
    achievedAt: Date;
    significance: 'minor' | 'major' | 'critical';
    description: string;
  }>;

  // Performance indicators
  kpis: {
    successRate: number; // target: >90%
    avgJobDuration: number; // target: decreasing
    qualityScore: number; // target: >0.8
    learningEfficiency: number; // target: >0.7
    knowledgeReuse: number; // target: >0.6
  };

  // Targets and progress
  targets: Array<{
    metric: string;
    current: number;
    target: number;
    deadline: Date;
    progress: number; // 0-1 score
    onTrack: boolean;
  }>;
}

export interface LearningRecommendations {
  timestamp: Date;

  // High-priority recommendations
  highPriority: Array<{
    id: string;
    type: 'knowledge' | 'pattern' | 'process' | 'agent' | 'system';
    title: string;
    description: string;
    rationale: string;
    expectedImpact: number; // 0-1 score
    implementationEffort: 'low' | 'medium' | 'high';
    timeline: string;
    prerequisites: string[];
  }>;

  // Medium-priority recommendations
  mediumPriority: Array<{
    id: string;
    type: 'knowledge' | 'pattern' | 'process' | 'agent' | 'system';
    title: string;
    description: string;
    expectedImpact: number;
    implementationEffort: 'low' | 'medium' | 'high';
  }>;

  // Quick wins
  quickWins: Array<{
    id: string;
    title: string;
    description: string;
    implementation: string;
    expectedBenefit: string;
    timeRequired: string;
  }>;

  // Strategic recommendations
  strategic: Array<{
    id: string;
    title: string;
    description: string;
    longTermImpact: string;
    investmentRequired: string;
    timeline: string;
    dependencies: string[];
  }>;
}

// Performance Analytics Types
export interface PerformanceAnalytics {
  trackJobPerformance(job: JobOutcome): Promise<void>;
  generatePerformanceReport(timeRange: TimeRange): Promise<PerformanceReport>;
  analyzeSystemPerformance(): Promise<SystemPerformanceAnalysis>;
  identifyBottlenecks(): Promise<PerformanceBottleneck[]>;
  generateOptimizationPlan(): Promise<OptimizationPlan>;
}

export interface PerformanceReport {
  timeRange: TimeRange;
  timestamp: Date;

  // Overall performance
  overall: {
    avgJobDuration: number;
    jobThroughput: number; // jobs per hour
    systemUptime: number; // percentage
    resourceUtilization: number; // 0-1 score
  };

  // Component performance
  components: {
    agents: Record<string, ComponentPerformance>;
    indexing: ComponentPerformance;
    knowledge: ComponentPerformance;
    memory: ComponentPerformance;
    retrieval: ComponentPerformance;
  };

  // Performance trends
  trends: {
    duration: TrendIndicator;
    throughput: TrendIndicator;
    quality: TrendIndicator;
    resourceUsage: TrendIndicator;
  };

  // SLA compliance
  slaCompliance: {
    jobLogging: { target: number; actual: number; compliance: number };
    patternAnalysis: { target: number; actual: number; compliance: number };
    analyticsGeneration: { target: number; actual: number; compliance: number };
    qualityAssessment: { target: number; actual: number; compliance: number };
  };
}

export interface ComponentPerformance {
  avgDuration: number;
  maxDuration: number;
  minDuration: number;
  throughput: number;
  errorRate: number;
  availability: number;
  resourceUsage: {
    cpu: number;
    memory: number;
    disk: number;
  };
}

export interface SystemPerformanceAnalysis {
  timestamp: Date;

  // System health
  health: {
    overall: number; // 0-1 score
    components: Record<string, number>;
    criticalIssues: number;
    warnings: number;
  };

  // Capacity analysis
  capacity: {
    currentLoad: number; // 0-1 score
    maxCapacity: number; // jobs per hour
    utilizationTrend: 'increasing' | 'decreasing' | 'stable';
    recommendedScaling: string;
  };

  // Resource analysis
  resources: {
    cpu: ResourceAnalysis;
    memory: ResourceAnalysis;
    disk: ResourceAnalysis;
    network: ResourceAnalysis;
  };

  // Performance predictions
  predictions: {
    nextHourLoad: number;
    nextDayLoad: number;
    capacityExhaustionETA: Date | null;
    recommendations: string[];
  };
}

export interface ResourceAnalysis {
  current: number; // percentage used
  average: number; // average over time period
  peak: number; // peak usage
  trend: 'increasing' | 'decreasing' | 'stable';
  alertThreshold: number;
  criticalThreshold: number;
}

export interface PerformanceBottleneck {
  id: string;
  component: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: {
    avgDelay: number; // milliseconds
    jobsAffected: number;
    qualityImpact: number; // 0-1 score
  };
  rootCause: string;
  recommendations: Array<{
    solution: string;
    effort: 'low' | 'medium' | 'high';
    expectedImprovement: number; // 0-1 score
    implementationTime: string;
  }>;
}

export interface OptimizationPlan {
  timestamp: Date;

  // Quick fixes (< 1 day)
  quickFixes: Array<{
    id: string;
    title: string;
    description: string;
    implementation: string;
    expectedGain: number; // percentage improvement
    timeRequired: string;
    risk: 'low' | 'medium' | 'high';
  }>;

  // Medium-term improvements (1-5 days)
  mediumTerm: Array<{
    id: string;
    title: string;
    description: string;
    implementation: string;
    expectedGain: number;
    timeRequired: string;
    dependencies: string[];
    risk: 'low' | 'medium' | 'high';
  }>;

  // Long-term optimizations (> 5 days)
  longTerm: Array<{
    id: string;
    title: string;
    description: string;
    implementation: string;
    expectedGain: number;
    timeRequired: string;
    investment: string;
    roi: number; // return on investment
    risk: 'low' | 'medium' | 'high';
  }>;

  // Implementation roadmap
  roadmap: Array<{
    phase: string;
    duration: string;
    optimizations: string[];
    milestones: string[];
    expectedCumulativeGain: number;
  }>;
}

// Quality Assessment Types
export interface QualityAssessment {
  assessJobQuality(job: JobOutcome): Promise<QualityAssessmentResult>;
  generateQualityReport(timeRange: TimeRange): Promise<QualityReport>;
  identifyQualityIssues(): Promise<QualityIssue[]>;
  trackQualityTrends(): Promise<QualityTrends>;
  generateQualityRecommendations(): Promise<QualityRecommendations>;
}

export interface QualityAssessmentResult {
  jobId: string;
  timestamp: Date;

  // Overall quality score
  overallScore: number; // 0-1 score

  // Component scores
  scores: {
    codeQuality: number;
    testCoverage: number;
    documentation: number;
    maintainability: number;
    security: number;
    performance: number;
    reliability: number;
  };

  // Quality gates
  gates: Array<{
    name: string;
    passed: boolean;
    score: number;
    threshold: number;
    details: string[];
  }>;

  // Issues identified
  issues: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: string;
    description: string;
    location: string;
    recommendation: string;
    autoFixable: boolean;
  }>;

  // Quality improvements
  improvements: Array<{
    area: string;
    before: number;
    after: number;
    improvement: number;
    method: string;
  }>;

  // Recommendations
  recommendations: Array<{
    priority: 'low' | 'medium' | 'high';
    category: string;
    description: string;
    expectedImpact: number;
    effort: 'low' | 'medium' | 'high';
  }>;
}

export interface QualityReport {
  timeRange: TimeRange;
  timestamp: Date;

  // Overall quality metrics
  overall: {
    avgQualityScore: number;
    qualityTrend: 'improving' | 'declining' | 'stable';
    gatePassRate: number; // percentage
    issueResolutionTime: number; // average hours
  };

  // Quality by category
  categories: Record<
    string,
    {
      avgScore: number;
      trend: TrendIndicator;
      topIssues: string[];
      improvements: string[];
    }
  >;

  // Quality by agent
  agents: Record<
    string,
    {
      avgScore: number;
      strengths: string[];
      weaknesses: string[];
      improvements: Array<{
        area: string;
        improvement: number;
      }>;
    }
  >;

  // Quality gates analysis
  gates: Array<{
    name: string;
    passRate: number;
    avgScore: number;
    trend: TrendIndicator;
    commonFailures: string[];
  }>;

  // Issues analysis
  issues: {
    totalIssues: number;
    resolvedIssues: number;
    avgResolutionTime: number;
    severityDistribution: Record<string, number>;
    categoryDistribution: Record<string, number>;
    recurringIssues: Array<{
      issue: string;
      occurrences: number;
      pattern: string;
    }>;
  };
}

export interface QualityIssue {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'code' | 'test' | 'documentation' | 'security' | 'performance' | 'maintainability';
  title: string;
  description: string;

  // Occurrence data
  occurrences: Array<{
    jobId: string;
    timestamp: Date;
    context: string;
    resolved: boolean;
  }>;

  // Impact analysis
  impact: {
    affectedJobs: number;
    avgImpactScore: number;
    qualityDegradation: number;
    userImpact: 'low' | 'medium' | 'high';
  };

  // Resolution data
  resolution: {
    avgResolutionTime: number;
    successRate: number;
    commonSolutions: string[];
    preventionStrategies: string[];
  };

  // Pattern analysis
  patterns: {
    triggers: string[];
    conditions: string[];
    correlations: Array<{
      factor: string;
      correlation: number;
    }>;
  };

  // Recommendations
  recommendations: Array<{
    type: 'fix' | 'prevent' | 'mitigate' | 'monitor';
    description: string;
    effort: 'low' | 'medium' | 'high';
    effectiveness: number;
  }>;
}

export interface QualityTrends {
  timeRange: TimeRange;
  timestamp: Date;

  // Overall trends
  overall: {
    qualityScore: TrendIndicator;
    issueCount: TrendIndicator;
    resolutionTime: TrendIndicator;
    gatePassRate: TrendIndicator;
  };

  // Detailed trend analysis
  analysis: Array<{
    metric: string;
    trend: 'improving' | 'declining' | 'stable';
    changeRate: number; // per period
    significance: 'high' | 'medium' | 'low';
    factors: string[];
  }>;

  // Predictions
  predictions: {
    nextPeriod: {
      qualityScore: number;
      issueCount: number;
      confidence: number;
    };
    longTerm: Array<{
      metric: string;
      projection: number;
      timeframe: string;
      confidence: number;
    }>;
  };

  // Seasonality analysis
  seasonality: {
    patterns: Array<{
      pattern: string;
      strength: number;
      period: string;
      description: string;
    }>;
    recommendations: string[];
  };
}

export interface QualityRecommendations {
  timestamp: Date;

  // Immediate actions
  immediate: Array<{
    id: string;
    priority: 'critical' | 'high';
    title: string;
    description: string;
    action: string;
    expectedImpact: number;
    timeRequired: string;
  }>;

  // Process improvements
  processImprovements: Array<{
    id: string;
    area: string;
    current: string;
    proposed: string;
    benefits: string[];
    implementation: string;
    effort: 'low' | 'medium' | 'high';
  }>;

  // Tool recommendations
  tools: Array<{
    name: string;
    purpose: string;
    benefits: string[];
    integrationEffort: 'low' | 'medium' | 'high';
    cost: 'free' | 'low' | 'medium' | 'high';
  }>;

  // Training recommendations
  training: Array<{
    area: string;
    target: string; // agents, patterns, etc.
    content: string;
    expectedImprovement: number;
    timeInvestment: string;
  }>;

  // Automation opportunities
  automation: Array<{
    process: string;
    currentState: 'manual' | 'semi-automated' | 'automated';
    proposedState: 'semi-automated' | 'automated' | 'intelligent';
    benefits: string[];
    implementation: string;
    roi: number;
  }>;
}

// Evaluation Manager Interface
export interface IEvaluationManager {
  // Job outcome logging
  logJobOutcome(outcome: JobOutcome): Promise<void>;
  getJobOutcome(jobId: string): Promise<JobOutcome | null>;
  getJobOutcomes(filters: JobOutcomeFilters): Promise<JobOutcome[]>;

  // Pattern analysis
  analyzePatterns(timeRange: TimeRange): Promise<PatternAnalysisResult[]>;
  getSuccessPatterns(): Promise<SuccessPattern[]>;
  getFailurePatterns(): Promise<FailurePattern[]>;
  predictJobSuccess(context: JobContext, metadata: JobMetadata): Promise<SuccessPrediction>;

  // Knowledge promotion
  evaluateKnowledgeCards(): Promise<PromotionDemotionResult>;
  trackCardUsage(cardId: string, jobId: string, outcome: CardUsageOutcome): Promise<void>;

  // Learning analytics
  generateLearningReport(timeRange: TimeRange): Promise<EffectivenessReport>;
  analyzeLearningTrends(timeRange: TimeRange): Promise<LearningTrends>;
  getProgressMetrics(): Promise<ProgressMetrics>;

  // Performance analytics
  generatePerformanceReport(timeRange: TimeRange): Promise<PerformanceReport>;
  analyzeSystemPerformance(): Promise<SystemPerformanceAnalysis>;
  identifyBottlenecks(): Promise<PerformanceBottleneck[]>;

  // Quality assessment
  assessQuality(job: JobOutcome): Promise<QualityAssessmentResult>;
  generateQualityReport(timeRange: TimeRange): Promise<QualityReport>;
  identifyQualityIssues(): Promise<QualityIssue[]>;

  // Insights and recommendations
  generateInsights(timeRange: TimeRange): Promise<LearningInsights>;
  getRecommendations(): Promise<LearningRecommendations>;

  // Configuration and maintenance
  updateConfig(config: Partial<EvaluationConfig>): Promise<void>;
  exportData(timeRange: TimeRange, format: 'json' | 'csv'): Promise<string>;
  cleanup(olderThanDays: number): Promise<number>;
}

export interface JobOutcomeFilters {
  timeRange?: TimeRange;
  success?: boolean;
  agentTypes?: string[];
  categories?: string[];
  complexities?: string[];
  minQualityScore?: number;
  maxDuration?: number;
  issueIds?: string[];
  limit?: number;
  offset?: number;
}

export interface TimeRange {
  start: Date;
  end: Date;
}
