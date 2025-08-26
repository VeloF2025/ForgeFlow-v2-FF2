export interface OrchestratorConfig {
  github: GitHubConfig;
  worktree: WorktreeConfig;
  agents: AgentConfig;
  quality: QualityConfig;
  protocols: ProtocolConfig;
  knowledge: KnowledgeConfig;
  memory: MemoryConfig;
  communicationPort?: number;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  apiUrl?: string;
}

export interface WorktreeConfig {
  basePath: string;
  maxWorktrees: number;
  cleanupOnError: boolean;
}

export interface AgentConfig {
  maxConcurrent: number;
  timeout: number;
  retryAttempts: number;
  browserMCP?: BrowserMCPIntegrationConfig;
}

export interface BrowserMCPIntegrationConfig {
  enabled: boolean;
  serverUrl: string;
  port: number;
  enabledAgents: string[];
  defaultConfig: {
    enableScreenshots: boolean;
    enableAccessibility: boolean;
    timeout: number;
    maxRetries: number;
    sandbox: boolean;
  };
}

export interface QualityConfig {
  linting: boolean;
  testing: boolean;
  coverage: number;
  security: boolean;
  performance: boolean;
}

export interface ProtocolConfig {
  nlnh: boolean;
  antihall: boolean;
  ryr: boolean;
  rulesPath: string;
}

export interface Epic {
  id: string;
  title: string;
  description: string;
  labels?: string[];
  milestone?: string;
  issues?: Issue[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Issue {
  id: string;
  number: number;
  title: string;
  body: string;
  labels?: string[];
  assignee?: string;
  state: 'open' | 'closed';
  milestone?: string;
  epicId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Agent {
  id: string;
  type: string;
  capabilities: string[];
  status: 'idle' | 'busy' | 'error';
  execute: (issueId: string, worktreeId: string) => Promise<void>;
}

export interface ToolExecutionContext {
  issueId: string;
  worktreeId: string;
  agentId: string;
  startTime: Date;
  metadata?: Record<string, any>;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  duration?: number;
  metadata?: Record<string, any>;
}

export interface ExecutionPattern {
  name: string;
  description: string;
  phases: ExecutionPhase[];
}

export interface ExecutionPhase {
  name: string;
  parallel: boolean;
  agents: string[];
}

export interface ExecutionStatus {
  id: string;
  epicId: string;
  pattern: string;
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  progress: number;
  phases: PhaseStatus[];
  error?: string;
}

export interface PhaseStatus {
  name: string;
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'completed' | 'failed';
  tasks: TaskStatus[];
}

export interface TaskStatus {
  taskId: string;
  status: string;
}

export interface ParallelExecutionPlan {
  epicId: string;
  pattern: string;
  phases: Array<{
    name: string;
    parallel: boolean;
    tasks: Array<{
      issueId: string;
      agentType: string;
      worktreeId?: string;
    }>;
  }>;
}

export interface QualityGateResult {
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    message?: string;
    details?: unknown;
  }>;
}

export interface ProtocolViolation {
  protocol: string;
  severity: 'warning' | 'error' | 'critical';
  message: string;
  timestamp: Date;
  context?: unknown;
}

export interface WorktreeInfo {
  id: string;
  path: string;
  branch: string;
  issueId: string;
  createdAt: Date;
  status: 'active' | 'cleaning' | 'removed';
}

export interface AgentMetrics {
  agentId: string;
  type: string;
  tasksCompleted: number;
  tasksFailed: number;
  averageTime: number;
  successRate: number;
  lastActive: Date;
}

export interface SystemHealth {
  github: boolean;
  repository: boolean;
  agents: boolean;
  quality: boolean;
  protocols: boolean;
  knowledge: boolean;
  memory: boolean;
  overall: boolean;
}

// Re-export architect types
export * from './architect';

// Knowledge Management System Interfaces
export interface KnowledgeManager {
  // Card operations
  createCard(
    card: Omit<KnowledgeCard, 'id' | 'createdAt' | 'updatedAt' | 'lastUsed' | 'usageCount'>,
  ): Promise<KnowledgeCard>;
  getCard(id: string): Promise<KnowledgeCard | null>;
  updateCard(id: string, updates: Partial<KnowledgeCard>): Promise<KnowledgeCard>;
  deleteCard(id: string): Promise<void>;
  searchCards(query: KnowledgeQuery): Promise<KnowledgeSearchResult[]>;

  // Usage tracking
  recordUsage(cardId: string, issueId: string, outcome: KnowledgeOutcome): Promise<void>;
  updateEffectiveness(cardId: string): Promise<void>;

  // Gotcha operations
  recordGotcha(
    pattern: Omit<GotchaPattern, 'id' | 'createdAt' | 'updatedAt' | 'promoted'>,
  ): Promise<GotchaPattern>;
  promoteGotcha(gotchaId: string): Promise<KnowledgeCard>;
  getGotchaStats(): Promise<{
    total: number;
    promoted: number;
    byCategory: Record<string, number>;
  }>;

  // ADR operations
  createADR(
    adr: Omit<ArchitectureDecisionRecord, 'id' | 'date'>,
  ): Promise<ArchitectureDecisionRecord>;
  updateADR(
    id: string,
    updates: Partial<ArchitectureDecisionRecord>,
  ): Promise<ArchitectureDecisionRecord>;
  getADR(id: string): Promise<ArchitectureDecisionRecord | null>;
  listADRs(filters?: {
    status?: ArchitectureDecisionRecord['status'][];
  }): Promise<ArchitectureDecisionRecord[]>;

  // Statistics
  getStats(): Promise<KnowledgeStats>;

  // Maintenance
  cleanup(): Promise<void>;
  export(path: string): Promise<void>;
  import(path: string): Promise<void>;
}

// Knowledge Management System Configuration
export interface KnowledgeConfig {
  storageBasePath: string;
  maxCardsPerCategory: number;
  gotchaPromotionThreshold: number;
  effectivenessDecayRate: number;
  cleanupIntervalDays: number;
  autoPromoteGotchas: boolean;
}

// Strategic Planning Types
export interface Task {
  id: string;
  title: string;
  description: string;
  estimatedHours: number;
  agentType: string;
  phase: string;
  dependencies: string[];
  parallel: boolean;
}

export interface Risk {
  id: string;
  description: string;
  probability: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  category: 'technical' | 'quality' | 'performance' | 'security' | 'external';
  mitigation: string[];
  owner: string;
}

export interface Dependency {
  id: string;
  type: 'technical' | 'process' | 'external' | 'infrastructure';
  source: string;
  target: string;
  description: string;
  criticality: 'low' | 'medium' | 'high';
}

export interface Milestone {
  id: string;
  name: string;
  description: string;
  dueDate: Date;
  dependencies: string[];
  deliverables: string[];
}

// Knowledge Management System Types
export interface KnowledgeCard {
  id: string;
  title: string;
  content: string;
  type: 'pattern' | 'gotcha' | 'solution' | 'best-practice';
  category: string;
  tags: string[];
  projectId?: string;
  usageCount: number;
  effectiveness: number; // 0-1 score
  createdAt: Date;
  updatedAt: Date;
  lastUsed: Date;
  metadata: {
    difficulty: 'low' | 'medium' | 'high';
    scope: 'global' | 'project';
    agentTypes: string[];
    relatedIssues: string[];
    outcomes: KnowledgeOutcome[];
  };
}

export interface KnowledgeOutcome {
  issueId: string;
  success: boolean;
  metrics: {
    timeToResolution: number;
    codeQuality: number;
    errorReduction: number;
  };
  timestamp: Date;
}

export interface GotchaPattern {
  id: string;
  description: string;
  pattern: string; // regex or text pattern
  occurrences: GotchaOccurrence[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'build' | 'runtime' | 'logic' | 'integration' | 'configuration' | 'deployment';
  solution?: string;
  preventionSteps: string[];
  createdAt: Date;
  updatedAt: Date;
  promoted: boolean; // promoted to knowledge card
}

export interface GotchaOccurrence {
  issueId: string;
  agentType: string;
  context: string;
  timestamp: Date;
  resolved: boolean;
  resolutionTime?: number;
}

export interface ArchitectureDecisionRecord {
  id: string;
  title: string;
  status: 'proposed' | 'accepted' | 'rejected' | 'deprecated' | 'superseded';
  deciders: string[];
  date: Date;
  context: string;
  decision: string;
  rationale: string;
  consequences: {
    positive: string[];
    negative: string[];
    risks: string[];
  };
  alternatives: {
    option: string;
    pros: string[];
    cons: string[];
  }[];
  relatedDecisions: string[];
  supersededBy?: string;
  tags: string[];
  metadata: {
    complexity: 'low' | 'medium' | 'high';
    impact: 'local' | 'system' | 'architecture';
    reversible: boolean;
  };
}

export interface KnowledgeQuery {
  text: string;
  filters?: {
    type?: KnowledgeCard['type'][];
    category?: string[];
    tags?: string[];
    projectId?: string;
    agentTypes?: string[];
    minEffectiveness?: number;
    excludeIds?: string[];
  };
  limit?: number;
  includeGlobal?: boolean;
}

export interface KnowledgeSearchResult {
  card: KnowledgeCard;
  relevanceScore: number;
  matchType: 'title' | 'content' | 'tags' | 'metadata';
  snippet?: string;
}

export interface KnowledgeStats {
  totalCards: number;
  cardsByType: Record<KnowledgeCard['type'], number>;
  cardsByCategory: Record<string, number>;
  totalGotchas: number;
  gotchasByCategory: Record<string, number>;
  promotedGotchas: number;
  totalADRs: number;
  adrsByStatus: Record<ArchitectureDecisionRecord['status'], number>;
  averageEffectiveness: number;
  lastUpdated: Date;
}

// Memory Layer Configuration and Types
export interface MemoryConfig {
  storageBasePath: string;
  retentionDays: number;
  logRetentionDays: number;
  maxJobMemorySize: number;
  compressionEnabled: boolean;
  analyticsEnabled: boolean;
  autoPromoteGotchas: boolean;
  performanceThresholds: {
    memoryOperationTimeMs: number;
    logWriteTimeMs: number;
    analyticsCalculationTimeMs: number;
  };
}

// Re-export Memory types
export type {
  JobMemory,
  Decision,
  Gotcha,
  ContextEntry,
  Outcome,
  MemoryInsights,
  JobAnalytics,
  GlobalJobEntry,
  RuntimeLog,
  IMemoryManager,
  IRuntimeLogger,
  IMemoryAnalytics,
} from '../memory/types';
