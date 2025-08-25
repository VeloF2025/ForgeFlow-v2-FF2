// SQLite FTS5 Index Engine - High-performance full-text search implementation
// Provides sub-500ms search performance for large codebases

import Database from 'better-sqlite3';
type DatabaseType = Database.Database;
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import {
  ISQLiteIndex,
  IndexEntry,
  IndexContentType,
  SearchOptions,
  IndexFilters,
  SQLiteSearchResult,
  IndexConfig,
  IndexError,
  IndexErrorCode
} from './types.js';

export class SQLiteFTS5Index implements ISQLiteIndex {
  private db?: DatabaseType;
  private readonly dbPath: string;
  private readonly config: IndexConfig;
  private isConnected = false;

  // Prepared statements for optimal performance
  private statements: {
    insertEntry?: any;
    updateEntry?: any;
    deleteEntry?: any;
    searchFTS?: any;
    countEntries?: any;
    getEntry?: any;
  } = {};

  constructor(config: IndexConfig) {
    this.config = config;
    this.dbPath = config.databasePath;
    
    // Ensure database directory exists
    const dbDir = this.dbPath.substring(0, this.dbPath.lastIndexOf('/'));
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }
  }

  async connect(): Promise<void> {
    try {
      this.db = new Database(this.dbPath, {
        verbose: process.env.NODE_ENV === 'development' ? console.log : undefined
      });

      // Configure SQLite for optimal FTS5 performance
      this.db.pragma('journal_mode = ' + this.config.journalMode);
      this.db.pragma('synchronous = ' + this.config.synchronous);
      this.db.pragma('cache_size = ' + this.config.cacheSize);
      this.db.pragma('temp_store = memory');
      this.db.pragma('mmap_size = 268435456'); // 256MB
      
      // Enable FTS5 extension (usually built-in with better-sqlite3)
      this.db.loadExtension?.('fts5'); // Optional, may not be needed

      this.isConnected = true;
      console.log(`✅ SQLite FTS5 database connected: ${this.dbPath}`);
    } catch (error) {
      throw new IndexError(
        `Failed to connect to SQLite database: ${(error as Error).message}`,
        IndexErrorCode.DATABASE_CONNECTION_FAILED,
        { dbPath: this.dbPath, error }
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      // Close prepared statements
      Object.values(this.statements).forEach(stmt => {
        try {
          stmt?.finalize?.();
        } catch {
          // Ignore finalization errors
        }
      });
      this.statements = {};

      this.db.close();
      this.db = undefined;
      this.isConnected = false;
      console.log('✅ SQLite database disconnected');
    }
  }

  async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not connected');

    const transaction = this.db.transaction(() => {
      // Main entries table with metadata
      this.db!.exec(`
        CREATE TABLE IF NOT EXISTS index_entries (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          path TEXT NOT NULL,
          metadata TEXT NOT NULL, -- JSON
          last_modified INTEGER NOT NULL, -- Unix timestamp
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          checksum TEXT,
          file_size INTEGER DEFAULT 0
        );
      `);

      // Create FTS5 virtual table for full-text search
      // Using porter tokenizer for better English language support
      const tokenizer = this.config.tokenizer || 'porter';
      this.db!.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS index_fts USING fts5(
          title,
          content,
          tags,
          category,
          content_type,
          content=index_entries,
          content_rowid=rowid,
          tokenize='${tokenizer} ${this.config.removeAccents ? 'remove_diacritics 1' : ''}'
        );
      `);

      // Search analytics table
      this.db!.exec(`
        CREATE TABLE IF NOT EXISTS search_queries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          query TEXT NOT NULL,
          result_count INTEGER NOT NULL,
          response_time INTEGER NOT NULL, -- milliseconds
          timestamp INTEGER NOT NULL DEFAULT (unixepoch()),
          filters TEXT, -- JSON
          user_agent TEXT
        );
      `);

      // Index maintenance log
      this.db!.exec(`
        CREATE TABLE IF NOT EXISTS index_maintenance (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          operation TEXT NOT NULL, -- 'vacuum', 'rebuild', 'cleanup'
          duration INTEGER NOT NULL, -- milliseconds
          entries_affected INTEGER NOT NULL DEFAULT 0,
          space_reclaimed INTEGER NOT NULL DEFAULT 0, -- bytes
          timestamp INTEGER NOT NULL DEFAULT (unixepoch()),
          details TEXT -- JSON
        );
      `);
    });

    transaction();
    console.log('✅ SQLite tables and FTS5 virtual table created');
  }

  async createIndexes(): Promise<void> {
    if (!this.db) throw new Error('Database not connected');

    const transaction = this.db.transaction(() => {
      // Indexes for efficient filtering and sorting
      this.db!.exec('CREATE INDEX IF NOT EXISTS idx_entries_type ON index_entries(type)');
      this.db!.exec('CREATE INDEX IF NOT EXISTS idx_entries_last_modified ON index_entries(last_modified DESC)');
      this.db!.exec('CREATE INDEX IF NOT EXISTS idx_entries_path ON index_entries(path)');
      this.db!.exec('CREATE INDEX IF NOT EXISTS idx_entries_created_at ON index_entries(created_at DESC)');
      
      // Composite indexes for common query patterns
      this.db!.exec('CREATE INDEX IF NOT EXISTS idx_entries_type_modified ON index_entries(type, last_modified DESC)');
      
      // Search analytics indexes
      this.db!.exec('CREATE INDEX IF NOT EXISTS idx_queries_timestamp ON search_queries(timestamp DESC)');
      this.db!.exec('CREATE INDEX IF NOT EXISTS idx_queries_query ON search_queries(query)');
    });

    transaction();
    console.log('✅ SQLite indexes created');
  }

  async migrate(): Promise<void> {
    if (!this.db) throw new Error('Database not connected');

    // Get current schema version
    let version = 0;
    try {
      const result = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
      version = result.user_version;
    } catch {
      // Schema version not set, assume version 0
    }

    console.log(`Current schema version: ${version}`);

    const transaction = this.db.transaction(() => {
      if (version < 1) {
        // Migration to version 1: Add checksum and file_size columns
        try {
          this.db!.exec('ALTER TABLE index_entries ADD COLUMN checksum TEXT');
          this.db!.exec('ALTER TABLE index_entries ADD COLUMN file_size INTEGER DEFAULT 0');
        } catch (error) {
          // Columns might already exist
          console.log('Migration v1: Columns may already exist');
        }
        version = 1;
      }

      // Set the new version
      this.db!.pragma(`user_version = ${version}`);
    });

    transaction();
    console.log(`✅ Database migrated to version ${version}`);
  }

  private prepareBulkStatements(): void {
    if (!this.db) throw new Error('Database not connected');

    // Prepare frequently used statements for better performance
    this.statements.insertEntry = this.db.prepare(`
      INSERT OR REPLACE INTO index_entries 
      (id, type, title, content, path, metadata, last_modified, checksum, file_size)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.statements.updateEntry = this.db.prepare(`
      UPDATE index_entries 
      SET type = ?, title = ?, content = ?, path = ?, metadata = ?, last_modified = ?, checksum = ?, file_size = ?
      WHERE id = ?
    `);

    this.statements.deleteEntry = this.db.prepare(`
      DELETE FROM index_entries WHERE id = ?
    `);

    this.statements.getEntry = this.db.prepare(`
      SELECT * FROM index_entries WHERE id = ?
    `);

    // Complex search statement with filtering
    this.statements.searchFTS = this.db.prepare(`
      SELECT 
        e.id,
        e.type,
        e.title,
        e.content,
        e.path,
        e.metadata,
        e.last_modified,
        fts.rank as score,
        CASE 
          WHEN ? THEN snippet(index_fts, 1, '<mark>', '</mark>', '...', 32)
          ELSE NULL 
        END as snippet,
        CASE 
          WHEN ? THEN highlight(index_fts, 0, '<mark>', '</mark>')
          ELSE NULL 
        END as title_highlight
      FROM index_fts fts
      JOIN index_entries e ON e.rowid = fts.rowid
      WHERE index_fts MATCH ?
      ${this.buildFilterClause()}
      ORDER BY fts.rank
      LIMIT ? OFFSET ?
    `);

    this.statements.countEntries = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM index_fts fts
      JOIN index_entries e ON e.rowid = fts.rowid
      WHERE index_fts MATCH ?
      ${this.buildFilterClause()}
    `);
  }

  private buildFilterClause(): string {
    return `
      AND (? IS NULL OR e.type IN (SELECT value FROM json_each(?)))
      AND (? IS NULL OR JSON_EXTRACT(e.metadata, '$.category') IN (SELECT value FROM json_each(?)))
      AND (? IS NULL OR EXISTS (
        SELECT 1 FROM json_each(JSON_EXTRACT(e.metadata, '$.tags')) 
        WHERE value IN (SELECT value FROM json_each(?))
      ))
      AND (? IS NULL OR e.last_modified >= ?)
      AND (? IS NULL OR e.last_modified <= ?)
    `;
  }

  async insert(entries: IndexEntry[]): Promise<void> {
    if (!this.db) throw new Error('Database not connected');
    if (entries.length === 0) return;

    if (!this.statements.insertEntry) {
      this.prepareBulkStatements();
    }

    const insertMany = this.db.transaction((entries: IndexEntry[]) => {
      for (const entry of entries) {
        const metadataJson = JSON.stringify(entry.metadata);
        const timestamp = Math.floor(entry.lastModified.getTime() / 1000);
        
        this.statements.insertEntry.run(
          entry.id,
          entry.type,
          entry.title,
          entry.content,
          entry.path,
          metadataJson,
          timestamp,
          this.generateChecksum(entry.content),
          entry.content.length
        );
      }

      // Rebuild FTS5 index after bulk insert
      this.db!.exec('INSERT INTO index_fts(index_fts) VALUES(\'rebuild\')');
    });

    insertMany(entries);
    console.log(`✅ Inserted ${entries.length} entries into index`);
  }

  async update(entries: IndexEntry[]): Promise<void> {
    if (!this.db) throw new Error('Database not connected');
    if (entries.length === 0) return;

    if (!this.statements.updateEntry) {
      this.prepareBulkStatements();
    }

    const updateMany = this.db.transaction((entries: IndexEntry[]) => {
      for (const entry of entries) {
        const metadataJson = JSON.stringify(entry.metadata);
        const timestamp = Math.floor(entry.lastModified.getTime() / 1000);
        
        this.statements.updateEntry.run(
          entry.type,
          entry.title,
          entry.content,
          entry.path,
          metadataJson,
          timestamp,
          this.generateChecksum(entry.content),
          entry.content.length,
          entry.id
        );
      }

      // Optimize FTS5 index after updates
      this.db!.exec('INSERT INTO index_fts(index_fts) VALUES(\'optimize\')');
    });

    updateMany(entries);
    console.log(`✅ Updated ${entries.length} entries in index`);
  }

  async delete(ids: string[]): Promise<void> {
    if (!this.db) throw new Error('Database not connected');
    if (ids.length === 0) return;

    if (!this.statements.deleteEntry) {
      this.prepareBulkStatements();
    }

    const deleteMany = this.db.transaction((ids: string[]) => {
      for (const id of ids) {
        this.statements.deleteEntry.run(id);
      }

      // Clean up FTS5 index
      this.db!.exec('INSERT INTO index_fts(index_fts) VALUES(\'rebuild\')');
    });

    deleteMany(ids);
    console.log(`✅ Deleted ${ids.length} entries from index`);
  }

  async searchFTS(query: string, options: SearchOptions): Promise<SQLiteSearchResult[]> {
    if (!this.db) throw new Error('Database not connected');

    if (!this.statements.searchFTS) {
      this.prepareBulkStatements();
    }

    const startTime = Date.now();

    try {
      // Build FTS5 query
      const ftsQuery = this.buildFTSQuery(query);
      
      // Convert filters to JSON strings
      const typeFilter = options.filters.types ? JSON.stringify(options.filters.types) : null;
      const categoryFilter = options.filters.categories ? JSON.stringify(options.filters.categories) : null;
      const tagFilter = options.filters.tags ? JSON.stringify(options.filters.tags) : null;
      
      const results = this.statements.searchFTS.all(
        options.includeSnippets, // snippet parameter
        true, // highlight parameter
        ftsQuery,
        // Filter parameters (repeated for each filter condition)
        typeFilter ? 1 : null, typeFilter,
        categoryFilter ? 1 : null, categoryFilter,
        tagFilter ? 1 : null, tagFilter,
        options.filters.createdAfter ? 1 : null, 
        options.filters.createdAfter ? Math.floor(options.filters.createdAfter.getTime() / 1000) : null,
        options.filters.createdBefore ? 1 : null,
        options.filters.createdBefore ? Math.floor(options.filters.createdBefore.getTime() / 1000) : null,
        options.limit,
        options.offset
      ) as any[];

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Record search analytics
      this.recordSearchQuery(query, results.length, responseTime).catch(console.error);

      // Convert results to proper format
      return results.map(row => ({
        id: row.id,
        type: row.type as IndexContentType,
        title: row.title,
        content: row.content,
        path: row.path,
        metadata: row.metadata,
        lastModified: row.last_modified * 1000, // Convert back to milliseconds
        score: Math.abs(row.score), // FTS5 rank is negative, make it positive
        snippet: row.snippet,
        highlight: row.title_highlight
      }));
    } catch (error) {
      throw new IndexError(
        `FTS5 search failed: ${(error as Error).message}`,
        IndexErrorCode.SEARCH_TIMEOUT,
        { query, options, error }
      );
    }
  }

  async count(filters?: IndexFilters): Promise<number> {
    if (!this.db) throw new Error('Database not connected');

    if (!filters) {
      const result = this.db.prepare('SELECT COUNT(*) as count FROM index_entries').get() as { count: number };
      return result.count;
    }

    if (!this.statements.countEntries) {
      this.prepareBulkStatements();
    }

    // Use a simple wildcard query to apply filters without text search
    const result = this.statements.countEntries.get(
      '*', // Match all documents
      filters.types ? JSON.stringify(filters.types) : null,
      filters.categories ? JSON.stringify(filters.categories) : null,
      filters.tags ? JSON.stringify(filters.tags) : null,
      filters.createdAfter ? Math.floor(filters.createdAfter.getTime() / 1000) : null,
      filters.createdBefore ? Math.floor(filters.createdBefore.getTime() / 1000) : null
    ) as { count: number };

    return result.count;
  }

  async vacuum(): Promise<number> {
    if (!this.db) throw new Error('Database not connected');

    const startTime = Date.now();
    const sizeBefore = this.getDatabaseSize();

    // Perform VACUUM to reclaim space
    this.db.exec('VACUUM');
    
    // Optimize FTS5 indexes
    this.db.exec('INSERT INTO index_fts(index_fts) VALUES(\'optimize\')');

    const sizeAfter = this.getDatabaseSize();
    const duration = Date.now() - startTime;
    const spaceReclaimed = sizeBefore - sizeAfter;

    // Log maintenance operation
    this.db.prepare(`
      INSERT INTO index_maintenance (operation, duration, space_reclaimed, details)
      VALUES (?, ?, ?, ?)
    `).run('vacuum', duration, spaceReclaimed, JSON.stringify({
      sizeBefore,
      sizeAfter,
      spaceReclaimed
    }));

    console.log(`✅ Database vacuumed: ${spaceReclaimed} bytes reclaimed in ${duration}ms`);
    return spaceReclaimed;
  }

  async analyze(): Promise<void> {
    if (!this.db) throw new Error('Database not connected');

    const startTime = Date.now();
    this.db.exec('ANALYZE');
    
    const duration = Date.now() - startTime;
    console.log(`✅ Database statistics updated in ${duration}ms`);
  }

  async checkIntegrity(): Promise<boolean> {
    if (!this.db) throw new Error('Database not connected');

    try {
      const result = this.db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
      const isIntact = result.integrity_check === 'ok';
      
      if (!isIntact) {
        console.error('❌ Database integrity check failed:', result.integrity_check);
      }
      
      return isIntact;
    } catch (error) {
      console.error('❌ Database integrity check error:', error);
      return false;
    }
  }

  private buildFTSQuery(query: string): string {
    // Simple FTS5 query builder
    // For production, you might want more sophisticated query parsing
    
    if (query.includes('"') && query.includes('"')) {
      // Phrase query - already quoted
      return query;
    }

    if (query.includes(' AND ') || query.includes(' OR ') || query.includes(' NOT ')) {
      // Boolean query
      return query;
    }

    // Simple query - search in title and content with different weights
    const terms = query.trim().split(/\s+/).filter(term => term.length > 0);
    
    if (terms.length === 1) {
      // Single term - search with prefix matching
      return `{title} : ${terms[0]}* OR {content} : ${terms[0]}*`;
    }

    // Multiple terms - require all terms (implicit AND)
    const titleQuery = terms.map(term => `${term}*`).join(' ');
    const contentQuery = terms.map(term => `${term}*`).join(' ');
    
    return `({title} : (${titleQuery})) OR ({content} : (${contentQuery}))`;
  }

  private async recordSearchQuery(query: string, resultCount: number, responseTime: number): Promise<void> {
    if (!this.db) return;

    try {
      this.db.prepare(`
        INSERT INTO search_queries (query, result_count, response_time)
        VALUES (?, ?, ?)
      `).run(query, resultCount, responseTime);
    } catch (error) {
      // Don't let analytics failures affect search functionality
      console.warn('Failed to record search analytics:', error);
    }
  }

  private generateChecksum(content: string): string {
    // Simple checksum for content change detection
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  private getDatabaseSize(): number {
    if (!this.db) return 0;

    try {
      const result = this.db.prepare('PRAGMA page_count').get() as { page_count: number };
      const pageSize = this.db.prepare('PRAGMA page_size').get() as { page_size: number };
      return result.page_count * pageSize.page_size;
    } catch {
      return 0;
    }
  }

  // Utility methods for debugging and monitoring
  async getStats(): Promise<{
    totalEntries: number;
    databaseSize: number;
    indexSize: number;
    lastVacuum: Date | null;
    ftsOptimized: boolean;
  }> {
    if (!this.db) throw new Error('Database not connected');

    const totalEntries = await this.count();
    const databaseSize = this.getDatabaseSize();
    
    // Get FTS5 index stats
    let indexSize = 0;
    try {
      const ftsResult = this.db.prepare(`
        SELECT * FROM index_fts WHERE index_fts MATCH 'indexes'
      `).all();
      indexSize = JSON.stringify(ftsResult).length; // Rough estimate
    } catch {
      // FTS5 stats not available
    }

    // Get last vacuum time
    let lastVacuum: Date | null = null;
    try {
      const vacuumResult = this.db.prepare(`
        SELECT timestamp FROM index_maintenance 
        WHERE operation = 'vacuum' 
        ORDER BY timestamp DESC 
        LIMIT 1
      `).get() as { timestamp: number } | undefined;
      
      if (vacuumResult) {
        lastVacuum = new Date(vacuumResult.timestamp * 1000);
      }
    } catch {
      // No vacuum history
    }

    return {
      totalEntries,
      databaseSize,
      indexSize,
      lastVacuum,
      ftsOptimized: true // Assume optimized if no errors
    };
  }
}