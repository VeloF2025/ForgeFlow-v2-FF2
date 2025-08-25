// Index Layer Types - SQLite FTS5 Search Infrastructure
// Layer 3: High-performance search and retrieval for Knowledge/Memory systems

export interface IndexEntry {
  id: string;
  type: IndexContentType;
  title: string;
  content: string;
  path: string;
  metadata: IndexMetadata;
  lastModified: Date;
  searchVector?: number[];
}

export type IndexContentType = 'knowledge' | 'memory' | 'adr' | 'gotcha' | 'code' | 'config';

export interface IndexMetadata {
  // Common metadata
  tags: string[];
  category?: string;
  projectId?: string;
  agentTypes: string[];
  
  // Content-specific metadata
  difficulty?: 'low' | 'medium' | 'high';
  scope?: 'global' | 'project';
  effectiveness?: number; // 0-1 score for knowledge cards
  severity?: 'low' | 'medium' | 'high' | 'critical'; // For gotchas
  status?: string; // For ADRs, memory entries
  
  // Usage metadata
  usageCount: number;
  lastUsed: Date;
  successRate?: number;
  
  // File metadata
  fileSize: number;
  language?: string; // For code files
  extension?: string;
  
  // Relationships
  relatedIds: string[];
  parentId?: string;
  childIds: string[];
}

export interface SearchQuery {
  // Query text and options
  query: string;
  queryType?: SearchQueryType;
  
  // Filters
  type?: IndexContentType | IndexContentType[];
  category?: string | string[];
  tags?: string | string[];
  projectId?: string;
  agentTypes?: string | string[];
  
  // Search options
  fuzzy?: boolean;
  phrase?: boolean;
  boolean?: boolean;
  
  // Result options
  limit?: number;
  offset?: number;
  includeSnippets?: boolean;
  snippetLength?: number;
  highlightResults?: boolean;
  
  // Ranking options
  minScore?: number;
  boostRecent?: boolean;
  boostEffective?: boolean;
  customWeights?: SearchWeights;
  
  // Time filters
  createdAfter?: Date;
  createdBefore?: Date;
  modifiedAfter?: Date;
  modifiedBefore?: Date;
  usedAfter?: Date;
}

export type SearchQueryType = 'simple' | 'phrase' | 'boolean' | 'fuzzy' | 'field';

export interface SearchWeights {
  title: number; // Default: 3.0
  content: number; // Default: 1.0
  tags: number; // Default: 2.0
  category: number; // Default: 1.5
  recency: number; // Default: 0.1
  effectiveness: number; // Default: 0.2
}

export interface SearchResult {
  entry: IndexEntry;
  score: number;
  rank: number;
  
  // Snippets and highlighting
  titleSnippet?: string;
  contentSnippets: ContentSnippet[];
  
  // Match information
  matchedFields: string[];
  totalMatches: number;
  
  // Relevance factors
  relevanceFactors: {
    titleMatch: number;
    contentMatch: number;
    tagMatch: number;
    categoryMatch: number;
    recencyBoost: number;
    effectivenessBoost: number;
    usageBoost: number;
  };
}

export interface ContentSnippet {
  text: string;
  highlighted: string;
  startOffset: number;
  endOffset: number;
  context: string; // Surrounding context
}

export interface SearchResults {
  results: SearchResult[];
  totalMatches: number;
  totalPages: number;
  currentPage: number;
  executionTime: number; // milliseconds
  
  // Facets for filtering
  facets: SearchFacets;
  
  // Suggestions
  suggestions: string[];
  correctedQuery?: string;
}

export interface SearchFacets {
  types: FacetCount[];
  categories: FacetCount[];
  tags: FacetCount[];
  projects: FacetCount[];
  agents: FacetCount[];
  languages: FacetCount[];
}

export interface FacetCount {
  value: string;
  count: number;
  selected: boolean;
}

export interface IndexStats {
  // Overall statistics
  totalEntries: number;
  totalSize: number; // bytes
  lastUpdated: Date;
  
  // Type breakdown
  typeBreakdown: Record<IndexContentType, {
    count: number;
    size: number;
    lastUpdated: Date;
  }>;
  
  // Performance metrics
  averageSearchTime: number; // milliseconds
  averageIndexTime: number; // milliseconds per entry
  cacheHitRate: number; // percentage
  
  // Database stats
  databaseSize: number; // bytes
  indexSize: number; // bytes
  vacuumNeeded: boolean;
}

// Index Management

export interface IndexConfig {
  // Database configuration
  databasePath: string;
  maxDatabaseSize: number; // bytes
  
  // FTS5 configuration
  tokenizer: 'simple' | 'porter' | 'unicode61' | 'ascii';
  removeAccents: boolean;
  caseSensitive: boolean;
  
  // Performance settings
  cacheSize: number; // number of pages
  synchronous: 'off' | 'normal' | 'full';
  journalMode: 'delete' | 'truncate' | 'persist' | 'memory' | 'wal';
  
  // Indexing settings
  batchSize: number;
  maxContentLength: number; // characters
  enableVectorIndex: boolean;
  
  // Maintenance settings
  autoVacuum: boolean;
  vacuumThreshold: number; // percentage fragmentation
  retentionDays: number;
  
  // Search settings
  defaultLimit: number;
  maxLimit: number;
  snippetLength: number;
  maxSnippets: number;
}

export interface IndexUpdateOperation {
  type: 'insert' | 'update' | 'delete';
  entry: IndexEntry;
  previousVersion?: IndexEntry;
}

export interface IndexBatch {
  operations: IndexUpdateOperation[];
  timestamp: Date;
  source: string; // Which component triggered the batch
}

export interface IndexMaintenanceResult {
  vacuumPerformed: boolean;
  spaceReclaimed: number; // bytes
  entriesDeleted: number;
  entriesUpdated: number;
  duration: number; // milliseconds
  errors: string[];
}

// Search Analytics

export interface SearchAnalytics {
  // Query statistics
  totalQueries: number;
  uniqueQueries: number;
  averageQueryLength: number;
  topQueries: QueryStats[];
  
  // Performance metrics
  averageResponseTime: number;
  slowQueries: SlowQuery[];
  cacheMetrics: CacheMetrics;
  
  // Result statistics
  averageResults: number;
  zeroResultQueries: number;
  clickThroughRate: number;
  
  // Time range
  startDate: Date;
  endDate: Date;
}

export interface QueryStats {
  query: string;
  count: number;
  averageResults: number;
  averageResponseTime: number;
  successRate: number;
}

export interface SlowQuery {
  query: string;
  responseTime: number;
  timestamp: Date;
  resultCount: number;
}

export interface CacheMetrics {
  hitRate: number; // percentage
  totalHits: number;
  totalMisses: number;
  cacheSize: number; // entries
  memoryUsage: number; // bytes
}

// Content Processing

export interface ContentExtractor {
  // Extract searchable content from different sources
  extractFromKnowledgeCard(cardFile: any): Promise<IndexEntry>;
  extractFromMemoryEntry(memoryEntry: any): Promise<IndexEntry>;
  extractFromADR(adrFile: any): Promise<IndexEntry>;
  extractFromGotcha(gotchaFile: any): Promise<IndexEntry>;
  extractFromCodeFile(filePath: string): Promise<IndexEntry>;
  
  // Content processing
  cleanContent(content: string): string;
  extractKeywords(content: string): string[];
  generateSummary(content: string, maxLength?: number): string;
}

export interface ContentChange {
  type: 'created' | 'modified' | 'deleted';
  path: string;
  contentType: IndexContentType;
  timestamp: Date;
  checksum?: string;
}

// Interfaces for main components

export interface IIndexManager {
  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  
  // Index operations
  indexContent(entries: IndexEntry[]): Promise<void>;
  indexBatch(batch: IndexBatch): Promise<void>;
  removeFromIndex(ids: string[]): Promise<void>;
  updateIndex(operation: IndexUpdateOperation): Promise<void>;
  
  // Bulk operations
  rebuildIndex(): Promise<void>;
  rebuildPartialIndex(type: IndexContentType): Promise<void>;
  
  // Status and maintenance
  getStats(): Promise<IndexStats>;
  vacuum(): Promise<IndexMaintenanceResult>;
  cleanup(olderThanDays?: number): Promise<IndexMaintenanceResult>;
}

export interface ISearchEngine {
  // Search operations
  search(query: SearchQuery): Promise<SearchResults>;
  searchSimilar(entryId: string, limit?: number): Promise<SearchResults>;
  
  // Autocomplete and suggestions
  getSuggestions(partial: string, limit?: number): Promise<string[]>;
  getPopularQueries(limit?: number): Promise<QueryStats[]>;
  
  // Analytics
  recordQuery(query: string, resultCount: number, responseTime: number): Promise<void>;
  getAnalytics(startDate: Date, endDate: Date): Promise<SearchAnalytics>;
}

export interface ISQLiteIndex {
  // Database operations
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  
  // Schema management
  createTables(): Promise<void>;
  createIndexes(): Promise<void>;
  migrate(): Promise<void>;
  
  // CRUD operations
  insert(entries: IndexEntry[]): Promise<void>;
  update(entries: IndexEntry[]): Promise<void>;
  delete(ids: string[]): Promise<void>;
  
  // Search operations
  searchFTS(query: string, options: SearchOptions): Promise<SQLiteSearchResult[]>;
  count(filters?: IndexFilters): Promise<number>;
  
  // Maintenance
  vacuum(): Promise<number>; // returns space reclaimed
  analyze(): Promise<void>;
  checkIntegrity(): Promise<boolean>;
}

export interface SearchOptions {
  limit: number;
  offset: number;
  orderBy: string;
  includeSnippets: boolean;
  filters: IndexFilters;
}

export interface IndexFilters {
  types?: IndexContentType[];
  categories?: string[];
  tags?: string[];
  projectIds?: string[];
  agentTypes?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
}

export interface SQLiteSearchResult {
  id: string;
  type: IndexContentType;
  title: string;
  content: string;
  path: string;
  metadata: string; // JSON string
  lastModified: number; // timestamp
  score: number;
  snippet?: string;
  highlight?: string;
}

// Error types
export class IndexError extends Error {
  constructor(
    message: string,
    public code: IndexErrorCode,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'IndexError';
  }
}

export enum IndexErrorCode {
  DATABASE_CONNECTION_FAILED = 'DATABASE_CONNECTION_FAILED',
  INDEX_CORRUPTION = 'INDEX_CORRUPTION',
  CONTENT_EXTRACTION_FAILED = 'CONTENT_EXTRACTION_FAILED',
  SEARCH_TIMEOUT = 'SEARCH_TIMEOUT',
  INVALID_QUERY = 'INVALID_QUERY',
  INSUFFICIENT_DISK_SPACE = 'INSUFFICIENT_DISK_SPACE',
  CONCURRENT_UPDATE_CONFLICT = 'CONCURRENT_UPDATE_CONFLICT',
  SCHEMA_MIGRATION_FAILED = 'SCHEMA_MIGRATION_FAILED'
}

// Vector search preparation (for future ML integration)
export interface VectorIndex {
  // Vector operations
  addVectors(entries: VectorEntry[]): Promise<void>;
  searchVectors(vector: number[], limit: number): Promise<VectorSearchResult[]>;
  
  // Hybrid search
  hybridSearch(textQuery: string, vector?: number[], weights?: HybridSearchWeights): Promise<SearchResults>;
}

export interface VectorEntry {
  id: string;
  vector: number[];
  metadata: Record<string, unknown>;
}

export interface VectorSearchResult {
  id: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

export interface HybridSearchWeights {
  textWeight: number; // 0-1, weight for FTS results
  vectorWeight: number; // 0-1, weight for vector similarity
}