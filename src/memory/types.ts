// Memory Layer Types - Job-specific learning and context persistence
// Part of Layer 2 architecture for per-issue memory management

export interface JobMemory {
  issueId: string;
  jobId: string; // Unique job execution ID
  sessionId: string; // Current session identifier
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'completed' | 'failed' | 'interrupted';

  // Memory components
  decisions: Decision[];
  gotchas: Gotcha[];
  context: ContextEntry[];
  outcomes: Outcome[];

  // Job metadata
  metadata: MemoryMetadata;

  // Analytics tracking
  analytics: JobAnalytics;
}

export interface Decision {
  id: string;
  timestamp: Date;
  agentType: string;
  category: 'architectural' | 'implementation' | 'testing' | 'deployment' | 'configuration';
  description: string;
  options: {
    option: string;
    pros: string[];
    cons: string[];
    selected: boolean;
  }[];
  reasoning: string;
  outcome?: DecisionOutcome;
  relatedContext: string[]; // Context entry IDs that influenced this decision
}

export interface DecisionOutcome {
  success: boolean;
  metrics: {
    implementationTime: number; // minutes
    codeQuality: number; // 0-1 score
    maintainability: number; // 0-1 score
    testCoverage: number; // percentage
  };
  lessons: string[];
  timestamp: Date;
}

export interface Gotcha {
  id: string;
  timestamp: Date;
  agentType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'build' | 'runtime' | 'logic' | 'integration' | 'configuration' | 'deployment';
  description: string;
  errorPattern: string; // For pattern matching
  context: string; // Surrounding context when gotcha occurred
  resolution?: GotchaResolution;
  preventionNotes: string[];
  relatedDecisions: string[]; // Decision IDs that led to this gotcha
}

export interface GotchaResolution {
  resolved: boolean;
  resolutionTime: number; // minutes from discovery
  solution: string;
  preventionSteps: string[];
  confidence: number; // 0-1 score
  timestamp: Date;
}

export interface ContextEntry {
  id: string;
  timestamp: Date;
  agentType: string;
  type:
    | 'code-analysis'
    | 'pattern-match'
    | 'knowledge-retrieval'
    | 'decision-input'
    | 'error-context';
  source: string; // File path, API endpoint, knowledge card ID, etc.
  content: string; // The actual context content
  relevanceScore: number; // 0-1 score
  usage: ContextUsage[];
  effectiveness?: number; // How effective this context was (0-1)
}

export interface ContextUsage {
  decisionId?: string;
  gotchaId?: string;
  timestamp: Date;
  impact: 'high' | 'medium' | 'low';
}

export interface Outcome {
  id: string;
  timestamp: Date;
  agentType: string;
  type: 'success' | 'failure' | 'partial' | 'cancelled';
  category: 'task-completion' | 'quality-check' | 'deployment' | 'testing';
  description: string;
  metrics: OutcomeMetrics;
  relatedDecisions: string[];
  relatedGotchas: string[];
  lessons: string[];
}

export interface OutcomeMetrics {
  duration: number; // minutes
  codeChanges: {
    linesAdded: number;
    linesRemoved: number;
    filesModified: number;
  };
  qualityMetrics: {
    testCoverage: number; // percentage
    lintErrors: number;
    typeErrors: number;
    complexity: number; // cyclomatic complexity
  };
  performance?: {
    buildTime: number; // seconds
    testTime: number; // seconds
    memoryUsage: number; // MB
  };
}

export interface MemoryMetadata {
  agentTypes: string[]; // All agents involved in this job
  totalDuration?: number; // Total job duration in minutes
  complexity: 'low' | 'medium' | 'high'; // Job complexity assessment
  priority: 'low' | 'medium' | 'high' | 'critical';
  tags: string[]; // Custom tags for categorization
  relatedIssues: string[]; // Related GitHub issue numbers
  parentJobId?: string; // If this is a sub-job
  childJobIds: string[]; // Sub-jobs spawned from this job
}

export interface JobAnalytics {
  patternMatches: PatternMatch[];
  efficiencyMetrics: EfficiencyMetrics;
  learningScore: number; // How much was learned from this job (0-1)
  reuseScore: number; // How much previous knowledge was reused (0-1)
  innovationScore: number; // How much new knowledge was created (0-1)
}

export interface PatternMatch {
  patternId: string;
  patternType: 'success' | 'failure' | 'gotcha' | 'decision';
  confidence: number; // 0-1 score
  context: string[];
  timestamp: Date;
}

export interface EfficiencyMetrics {
  decisionTime: number; // Average time per decision (minutes)
  gotchaResolutionTime: number; // Average gotcha resolution time (minutes)
  contextRetrievalTime: number; // Average context lookup time (seconds)
  knowledgeReuseRate: number; // Percentage of reused vs new solutions
  errorRate: number; // Percentage of decisions that led to gotchas
}

// Runtime Logging Types
export interface RuntimeLog {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error' | 'critical';
  agentType: string;
  jobId: string;
  sessionId: string;
  event: string;
  data: LogData;
  correlationId?: string; // For tracking related events
}

export interface LogData {
  [key: string]: unknown;
  // Common fields
  duration?: number;
  success?: boolean;
  error?: string;
  context?: string;
}

// Global Job Tracking
export interface GlobalJobEntry {
  jobId: string;
  issueId: string;
  issueNumber?: number; // GitHub issue number
  title: string;
  status: JobMemory['status'];
  agentTypes: string[];
  startTime: Date;
  endTime?: Date;
  duration?: number; // minutes
  success: boolean;
  summary: JobSummary;
}

export interface JobSummary {
  decisionsCount: number;
  gotchasCount: number;
  resolvedGotchas: number;
  contextEntriesCount: number;
  outcomesCount: number;
  successfulOutcomes: number;
  keyLearnings: string[];
  promotedGotchas: string[]; // IDs of gotchas promoted to knowledge cards
}

// Memory Configuration
export interface MemoryConfig {
  storageBasePath: string; // Base path for memory storage
  retentionDays: number; // How long to keep job memories
  logRetentionDays: number; // How long to keep runtime logs
  maxJobMemorySize: number; // Max memory entries per job
  compressionEnabled: boolean; // Enable memory compression for old jobs
  analyticsEnabled: boolean; // Enable analytics calculation
  autoPromoteGotchas: boolean; // Auto-promote frequent gotchas
  performanceThresholds: {
    memoryOperationTimeMs: number; // Max time for memory operations
    logWriteTimeMs: number; // Max time for log writes
    analyticsCalculationTimeMs: number; // Max time for analytics
  };
}

// Memory Manager Interface
export interface IMemoryManager {
  // Job memory lifecycle
  initializeJobMemory(issueId: string, sessionId: string): Promise<JobMemory>;
  getJobMemory(jobId: string): Promise<JobMemory | null>;
  updateJobMemory(jobId: string, updates: Partial<JobMemory>): Promise<JobMemory>;
  completeJobMemory(jobId: string, finalOutcome: Outcome): Promise<JobMemory>;

  // Memory components
  recordDecision(jobId: string, decision: Omit<Decision, 'id' | 'timestamp'>): Promise<Decision>;
  recordGotcha(jobId: string, gotcha: Omit<Gotcha, 'id' | 'timestamp'>): Promise<Gotcha>;
  recordContext(
    jobId: string,
    context: Omit<ContextEntry, 'id' | 'timestamp' | 'usage'>,
  ): Promise<ContextEntry>;
  recordOutcome(jobId: string, outcome: Omit<Outcome, 'id' | 'timestamp'>): Promise<Outcome>;

  // Updates and resolution
  resolveGotcha(jobId: string, gotchaId: string, resolution: GotchaResolution): Promise<Gotcha>;
  updateDecisionOutcome(
    jobId: string,
    decisionId: string,
    outcome: DecisionOutcome,
  ): Promise<Decision>;
  trackContextUsage(
    jobId: string,
    contextId: string,
    usage: Omit<ContextUsage, 'timestamp'>,
  ): Promise<void>;

  // Analytics and insights
  calculateJobAnalytics(jobId: string): Promise<JobAnalytics>;
  getMemoryInsights(jobId: string): Promise<MemoryInsights>;
  searchSimilarPatterns(pattern: PatternQuery): Promise<PatternMatch[]>;

  // Global tracking
  getGlobalJobLog(): Promise<GlobalJobEntry[]>;
  getJobsByIssue(issueId: string): Promise<GlobalJobEntry[]>;
  getJobsByAgent(agentType: string): Promise<GlobalJobEntry[]>;

  // Maintenance
  cleanup(): Promise<void>;
  compressOldMemories(daysOld: number): Promise<number>;
  archiveJobMemory(jobId: string): Promise<void>;
}

export interface MemoryInsights {
  jobId: string;
  summary: {
    overallSuccess: boolean;
    efficiency: number; // 0-1 score
    learningValue: number; // 0-1 score
    reuseRate: number; // 0-1 score
  };
  patterns: {
    successPatterns: string[];
    failurePatterns: string[];
    decisionPatterns: string[];
  };
  recommendations: {
    forFutureJobs: string[];
    forKnowledgeBase: string[];
    forProcessImprovement: string[];
  };
  keyMetrics: {
    totalDecisions: number;
    avgDecisionTime: number;
    totalGotchas: number;
    avgGotchaResolutionTime: number;
    contextEffectiveness: number;
  };
}

export interface PatternQuery {
  type: 'decision' | 'gotcha' | 'outcome' | 'context';
  category?: string;
  description?: string;
  agentType?: string;
  minConfidence?: number;
  maxResults?: number;
  includeSimilar?: boolean;
}

// Runtime Logger Interface
export interface IRuntimeLogger {
  // Logging operations
  log(level: RuntimeLog['level'], event: string, data: LogData): Promise<void>;
  debug(event: string, data: LogData): Promise<void>;
  info(event: string, data: LogData): Promise<void>;
  warn(event: string, data: LogData): Promise<void>;
  error(event: string, data: LogData): Promise<void>;
  critical(event: string, data: LogData): Promise<void>;

  // Log retrieval
  getLogsForJob(jobId: string, filters?: LogFilters): Promise<RuntimeLog[]>;
  getLogsForSession(sessionId: string, filters?: LogFilters): Promise<RuntimeLog[]>;
  getLogsForAgent(agentType: string, filters?: LogFilters): Promise<RuntimeLog[]>;

  // Log analysis
  analyzePerformance(jobId: string): Promise<PerformanceAnalysis>;
  findErrorPatterns(agentType?: string, timeRange?: TimeRange): Promise<ErrorPattern[]>;

  // Maintenance
  rotateLogs(): Promise<number>; // Returns number of rotated logs
  cleanupLogs(olderThanDays: number): Promise<number>; // Returns number of deleted logs
}

export interface LogFilters {
  level?: RuntimeLog['level'][];
  event?: string[];
  startTime?: Date;
  endTime?: Date;
  hasError?: boolean;
  minDuration?: number;
}

export interface PerformanceAnalysis {
  jobId: string;
  totalEvents: number;
  avgEventDuration: number;
  slowestEvents: Array<{ event: string; duration: number; timestamp: Date }>;
  errorRate: number;
  warningRate: number;
  performanceScore: number; // 0-1 score
  recommendations: string[];
}

export interface ErrorPattern {
  pattern: string;
  occurrences: number;
  agentTypes: string[];
  avgResolutionTime?: number;
  commonContext: string[];
  recommendations: string[];
}

export interface TimeRange {
  start: Date;
  end: Date;
}

// Memory Analytics Interface
export interface IMemoryAnalytics {
  // Job-level analytics
  calculateJobEfficiency(jobId: string): Promise<number>;
  calculateLearningScore(jobId: string): Promise<number>;
  calculateReuseScore(jobId: string): Promise<number>;

  // Pattern analysis
  identifySuccessPatterns(jobs: JobMemory[]): Promise<SuccessPattern[]>;
  identifyFailurePatterns(jobs: JobMemory[]): Promise<FailurePattern[]>;
  findSimilarJobs(jobId: string): Promise<SimilarJobMatch[]>;

  // Trend analysis
  analyzeTrends(timeRange: TimeRange): Promise<TrendAnalysis>;
  predictJobOutcome(jobMemory: Partial<JobMemory>): Promise<OutcomePrediction>;

  // Agent performance
  analyzeAgentPerformance(
    agentType: string,
    timeRange?: TimeRange,
  ): Promise<AgentPerformanceAnalysis>;
  compareAgentEffectiveness(): Promise<AgentComparison[]>;
}

export interface SuccessPattern {
  id: string;
  description: string;
  occurrences: number;
  confidence: number; // 0-1 score
  conditions: string[];
  outcomes: string[];
  applicableAgents: string[];
}

export interface FailurePattern {
  id: string;
  description: string;
  occurrences: number;
  confidence: number; // 0-1 score
  triggers: string[];
  preventionSteps: string[];
  affectedAgents: string[];
}

export interface SimilarJobMatch {
  jobId: string;
  similarity: number; // 0-1 score
  commonPatterns: string[];
  differences: string[];
  applicableLearnings: string[];
}

export interface TrendAnalysis {
  timeRange: TimeRange;
  totalJobs: number;
  successRate: number;
  avgJobDuration: number;
  trends: {
    efficiency: 'improving' | 'declining' | 'stable';
    learningRate: 'improving' | 'declining' | 'stable';
    gotchaFrequency: 'improving' | 'declining' | 'stable';
  };
  topGotchas: Array<{ description: string; frequency: number }>;
  topSuccessFactors: Array<{ factor: string; correlation: number }>;
}

export interface OutcomePrediction {
  predictedSuccess: boolean;
  confidence: number; // 0-1 score
  riskFactors: string[];
  successFactors: string[];
  estimatedDuration: number; // minutes
  recommendations: string[];
}

export interface AgentPerformanceAnalysis {
  agentType: string;
  timeRange: TimeRange;
  totalJobs: number;
  successRate: number;
  avgJobDuration: number;
  strengths: string[];
  weaknesses: string[];
  commonGotchas: Array<{ description: string; frequency: number }>;
  improvementSuggestions: string[];
}

export interface AgentComparison {
  agentType: string;
  metrics: {
    successRate: number;
    avgDuration: number;
    gotchaRate: number;
    learningRate: number;
  };
  ranking: number;
  strengths: string[];
  bestUseCases: string[];
}
