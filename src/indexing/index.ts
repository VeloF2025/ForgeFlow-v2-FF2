// Index Layer - Main exports and integration point
// Layer 3: High-performance search and retrieval system

export * from './types.js';
export { SQLiteFTS5Index } from './sqlite-index.js';
export { ForgeFlowSearchEngine } from './search-engine.js';
export { ForgeFlowIndexManager } from './index-manager.js';
export { ContentExtractor } from './content-extractor.js';

// Re-export key interfaces for easy import
export type {
  IIndexManager,
  ISearchEngine,
  ISQLiteIndex,
  IndexEntry,
  SearchQuery,
  SearchResults,
  SearchResult,
  IndexConfig,
  IndexStats
} from './types.js';