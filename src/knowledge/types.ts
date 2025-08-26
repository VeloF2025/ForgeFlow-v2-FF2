// Knowledge Management System Internal Types
// Provides type-safe interfaces for the knowledge layer implementation

export interface KnowledgeCardFile {
  frontmatter: {
    id: string;
    title: string;
    type: 'pattern' | 'gotcha' | 'solution' | 'best-practice';
    category: string;
    tags: string[];
    projectId?: string;
    usageCount: number;
    effectiveness: number;
    createdAt: string; // ISO string for YAML frontmatter
    updatedAt: string;
    lastUsed: string;
    difficulty: 'low' | 'medium' | 'high';
    scope: 'global' | 'project';
    agentTypes: string[];
    relatedIssues: string[];
  };
  content: string;
}

export interface GotchaFile {
  frontmatter: {
    id: string;
    description: string;
    pattern: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: 'build' | 'runtime' | 'logic' | 'integration' | 'configuration';
    solution?: string;
    preventionSteps: string[];
    createdAt: string;
    updatedAt: string;
    promoted: boolean;
    occurrenceCount: number;
  };
  content: string; // Detailed gotcha information
}

export interface ADRFile {
  frontmatter: {
    id: string;
    title: string;
    status: 'proposed' | 'accepted' | 'rejected' | 'deprecated' | 'superseded';
    deciders: string[];
    date: string;
    tags: string[];
    complexity: 'low' | 'medium' | 'high';
    impact: 'local' | 'system' | 'architecture';
    reversible: boolean;
    supersededBy?: string;
    relatedDecisions: string[];
  };
  content: string; // Markdown content with sections
}

export interface FileOperationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface SearchIndexEntry {
  id: string;
  type: 'knowledge' | 'gotcha' | 'adr';
  title: string;
  content: string;
  tags: string[];
  category?: string;
  effectiveness?: number;
  lastModified: Date;
}

export interface KnowledgeStorageConfig {
  basePath: string;
  knowledgeDir: string;
  gotchasDir: string;
  adrDir: string;
  indexFile: string;
  backupDir: string;
}

export interface KnowledgeValidationRules {
  maxTitleLength: number;
  maxContentLength: number;
  maxTagsCount: number;
  requiredFields: string[];
  allowedCategories: string[];
}

// Internal processing types
export interface PromotionCandidate {
  gotchaId: string;
  occurrenceCount: number;
  severity: GotchaFile['frontmatter']['severity'];
  category: string;
  promotionScore: number;
}

export interface EffectivenessMetrics {
  totalUsages: number;
  successRate: number;
  averageResolutionTime: number;
  errorReductionRate: number;
  lastCalculated: Date;
}

export interface MaintenanceReport {
  cleanedFiles: number;
  updatedEffectiveness: number;
  promotedGotchas: number;
  errors: string[];
  duration: number;
}
