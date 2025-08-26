// Caching Engine - Performance optimization with intelligent invalidation
// Provides high-performance caching with >80% hit rate target and intelligent invalidation

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger';
import type {
  CacheConfig,
  CacheEntry,
  CacheMetadata,
  CacheInvalidationStrategy,
  InvalidationTrigger,
  ContextPack,
  ContextPackAssemblerConfig,
} from './types';

export interface CacheKey {
  issueId: string;
  agentType: string;
  contentHash: string;
  version: string;
}

export interface CacheStats {
  hitRate: number;
  missRate: number;
  totalRequests: number;
  totalHits: number;
  totalMisses: number;
  evictionCount: number;
  currentSize: number;
  maxSize: number;
  averageRetrievalTime: number;
  storageUtilization: number;
}

export interface CacheOperation {
  operation: 'get' | 'set' | 'delete' | 'invalidate' | 'evict';
  key: string;
  duration: number;
  success: boolean;
  size?: number;
  reason?: string;
}

export interface InvalidationContext {
  trigger: string;
  affectedKeys: string[];
  reason: string;
  strategy: string;
  timestamp: Date;
}

export class CacheEngine {
  private config: CacheConfig;
  private memoryCache: Map<string, CacheEntry> = new Map();
  private accessOrder: string[] = []; // For LRU eviction
  private accessCount: Map<string, number> = new Map(); // For LFU eviction
  private stats: CacheStats = {
    hitRate: 0,
    missRate: 0,
    totalRequests: 0,
    totalHits: 0,
    totalMisses: 0,
    evictionCount: 0,
    currentSize: 0,
    maxSize: 0,
    averageRetrievalTime: 0,
    storageUtilization: 0,
  };
  private operations: CacheOperation[] = [];
  private invalidationStrategies: Map<string, CacheInvalidationStrategy> = new Map();
  private cacheBasePath: string;

  constructor(config: CacheConfig, basePath: string = './.ff2/cache') {
    this.config = config;
    this.cacheBasePath = basePath;
    this.stats.maxSize = config.maxSize;

    this.setupInvalidationStrategies();
    this.initializeCleanupTimer();

    logger.info('[CacheEngine] Initialized with provider:', config.provider);
  }

  /**
   * Initialize the cache engine
   */
  async initialize(): Promise<void> {
    try {
      if (this.config.provider === 'file' || this.config.provider === 'hybrid') {
        await fs.mkdir(this.cacheBasePath, { recursive: true });
      }

      // Load existing cache data if using file storage
      if (this.config.provider === 'file') {
        await this.loadCacheFromDisk();
      }

      logger.info('[CacheEngine] Initialization completed');
    } catch (error) {
      logger.error('[CacheEngine] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Get a context pack from cache
   */
  async get<T = ContextPack>(cacheKey: CacheKey): Promise<T | null> {
    const startTime = Date.now();
    const key = this.generateKey(cacheKey);

    this.stats.totalRequests++;

    try {
      let entry: CacheEntry<T> | null = null;

      // Try memory cache first
      if (this.config.provider === 'memory' || this.config.provider === 'hybrid') {
        entry = this.getFromMemory<T>(key);
      }

      // Try file cache if not found in memory
      if (!entry && (this.config.provider === 'file' || this.config.provider === 'hybrid')) {
        entry = await this.getFromFile<T>(key);

        // Store in memory for faster future access
        if (entry && this.config.provider === 'hybrid') {
          this.setInMemory(key, entry);
        }
      }

      const duration = Date.now() - startTime;

      if (entry && this.isValidEntry(entry)) {
        this.recordHit(key, duration);
        this.updateAccessMetrics(key);
        return entry.value;
      } else {
        this.recordMiss(key, duration);
        return null;
      }
    } catch (error) {
      this.recordMiss(key, Date.now() - startTime, error as Error);
      return null;
    }
  }

  /**
   * Store a context pack in cache
   */
  async set<T = ContextPack>(cacheKey: CacheKey, value: T, customTtl?: number): Promise<boolean> {
    const startTime = Date.now();
    const key = this.generateKey(cacheKey);
    const ttl = customTtl || this.config.ttl;

    try {
      const entry = this.createCacheEntry(key, value, ttl);

      // Apply compression if enabled
      if (this.config.compression) {
        entry.value = await this.compress(entry.value);
        entry.metadata.compressed = true;
      }

      // Apply encryption if enabled
      if (this.config.encryption) {
        entry.value = await this.encrypt(entry.value);
      }

      // Store in memory
      if (this.config.provider === 'memory' || this.config.provider === 'hybrid') {
        this.setInMemory(key, entry);
      }

      // Store in file
      if (this.config.provider === 'file' || this.config.provider === 'hybrid') {
        await this.setInFile(key, entry);
      }

      // Check if eviction is needed
      await this.performEvictionIfNeeded();

      const duration = Date.now() - startTime;
      this.recordOperation({
        operation: 'set',
        key,
        duration,
        success: true,
        size: entry.metadata.size,
      });

      logger.debug(
        `[CacheEngine] Cached entry ${key} (${entry.metadata.size} bytes, TTL: ${ttl}s)`,
      );
      return true;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.recordOperation({
        operation: 'set',
        key,
        duration,
        success: false,
        reason: error instanceof Error ? error.message : 'Unknown error',
      });

      logger.error(`[CacheEngine] Failed to cache entry ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete a specific cache entry
   */
  async delete(cacheKey: CacheKey): Promise<boolean> {
    const startTime = Date.now();
    const key = this.generateKey(cacheKey);

    try {
      let deleted = false;

      // Delete from memory
      if (this.memoryCache.has(key)) {
        const entry = this.memoryCache.get(key);
        this.stats.currentSize -= entry.metadata.size;
        this.memoryCache.delete(key);
        this.accessOrder = this.accessOrder.filter((k) => k !== key);
        this.accessCount.delete(key);
        deleted = true;
      }

      // Delete from file
      if (this.config.provider === 'file' || this.config.provider === 'hybrid') {
        try {
          const filePath = this.getFilePath(key);
          await fs.unlink(filePath);
          deleted = true;
        } catch (error) {
          // File might not exist, which is okay
        }
      }

      const duration = Date.now() - startTime;
      this.recordOperation({
        operation: 'delete',
        key,
        duration,
        success: deleted,
      });

      return deleted;
    } catch (error) {
      logger.error(`[CacheEngine] Failed to delete entry ${key}:`, error);
      return false;
    }
  }

  /**
   * Invalidate cache entries based on patterns or conditions
   */
  async invalidate(
    pattern: string | RegExp,
    reason: string = 'Manual invalidation',
  ): Promise<InvalidationContext> {
    const startTime = Date.now();
    const affectedKeys: string[] = [];

    try {
      const keys = Array.from(this.memoryCache.keys());
      const matcher =
        typeof pattern === 'string' ? new RegExp(pattern.replace(/\*/g, '.*')) : pattern;

      for (const key of keys) {
        if (matcher.test(key)) {
          await this.delete(this.parseKey(key));
          affectedKeys.push(key);
        }
      }

      const context: InvalidationContext = {
        trigger: 'manual',
        affectedKeys,
        reason,
        strategy: 'pattern_match',
        timestamp: new Date(),
      };

      const duration = Date.now() - startTime;
      this.recordOperation({
        operation: 'invalidate',
        key: String(pattern),
        duration,
        success: true,
        reason: `Invalidated ${affectedKeys.length} entries`,
      });

      logger.info(
        `[CacheEngine] Invalidated ${affectedKeys.length} cache entries matching pattern: ${pattern}`,
      );
      return context;
    } catch (error) {
      logger.error(`[CacheEngine] Failed to invalidate entries with pattern ${pattern}:`, error);
      throw error;
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    const startTime = Date.now();

    try {
      // Clear memory cache
      this.memoryCache.clear();
      this.accessOrder = [];
      this.accessCount.clear();
      this.stats.currentSize = 0;

      // Clear file cache
      if (this.config.provider === 'file' || this.config.provider === 'hybrid') {
        try {
          const files = await fs.readdir(this.cacheBasePath);
          for (const file of files) {
            if (file.endsWith('.cache')) {
              await fs.unlink(path.join(this.cacheBasePath, file));
            }
          }
        } catch (error) {
          logger.warn('[CacheEngine] Some cache files could not be deleted:', error);
        }
      }

      const duration = Date.now() - startTime;
      this.recordOperation({
        operation: 'invalidate',
        key: '*',
        duration,
        success: true,
        reason: 'Cache cleared',
      });

      logger.info('[CacheEngine] Cache cleared');
    } catch (error) {
      logger.error('[CacheEngine] Failed to clear cache:', error);
      throw error;
    }
  }

  /**
   * Check if a cache key exists and is valid
   */
  async exists(cacheKey: CacheKey): Promise<boolean> {
    const key = this.generateKey(cacheKey);
    const entry = this.memoryCache.get(key);

    if (entry && this.isValidEntry(entry)) {
      return true;
    }

    // Check file cache
    if (this.config.provider === 'file' || this.config.provider === 'hybrid') {
      try {
        const filePath = this.getFilePath(key);
        await fs.access(filePath);

        const fileEntry = await this.getFromFile(key);
        return fileEntry ? this.isValidEntry(fileEntry) : false;
      } catch {
        return false;
      }
    }

    return false;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    // Update calculated stats
    if (this.stats.totalRequests > 0) {
      this.stats.hitRate = (this.stats.totalHits / this.stats.totalRequests) * 100;
      this.stats.missRate = (this.stats.totalMisses / this.stats.totalRequests) * 100;
    }

    if (this.config.maxSize > 0) {
      this.stats.storageUtilization = (this.stats.currentSize / this.config.maxSize) * 100;
    }

    // Calculate average retrieval time
    const getOperations = this.operations.filter((op) => op.operation === 'get' && op.success);
    if (getOperations.length > 0) {
      this.stats.averageRetrievalTime =
        getOperations.reduce((sum, op) => sum + op.duration, 0) / getOperations.length;
    }

    return { ...this.stats };
  }

  /**
   * Get cache usage information
   */
  getCacheInfo(): {
    memoryEntries: number;
    fileEntries: number;
    totalSize: number;
    oldestEntry: Date | null;
    newestEntry: Date | null;
  } {
    const memoryEntries = this.memoryCache.size;
    const fileEntries = 0;
    let oldestEntry: Date | null = null;
    let newestEntry: Date | null = null;

    // Find oldest and newest entries
    for (const entry of this.memoryCache.values()) {
      if (!oldestEntry || entry.metadata.createdAt < oldestEntry) {
        oldestEntry = entry.metadata.createdAt;
      }
      if (!newestEntry || entry.metadata.createdAt > newestEntry) {
        newestEntry = entry.metadata.createdAt;
      }
    }

    return {
      memoryEntries,
      fileEntries,
      totalSize: this.stats.currentSize,
      oldestEntry,
      newestEntry,
    };
  }

  // Private helper methods

  private setupInvalidationStrategies(): void {
    // Time-based invalidation
    this.invalidationStrategies.set('time_based', {
      type: 'time_based',
      parameters: { maxAge: this.config.ttl * 1000 },
      triggers: [
        {
          event: 'entry_access',
          condition: 'age > maxAge',
          action: 'invalidate',
        },
      ],
    });

    // Dependency-based invalidation
    this.invalidationStrategies.set('dependency_based', {
      type: 'dependency_based',
      parameters: {},
      triggers: [
        {
          event: 'content_update',
          condition: 'dependency_changed',
          action: 'invalidate',
        },
      ],
    });
  }

  private initializeCleanupTimer(): void {
    // Run cleanup every 5 minutes
    setInterval(
      () => {
        this.performCleanup().catch((error) => {
          logger.error('[CacheEngine] Cleanup failed:', error);
        });
      },
      5 * 60 * 1000,
    );
  }

  private generateKey(cacheKey: CacheKey): string {
    const keyString = `${cacheKey.issueId}:${cacheKey.agentType}:${cacheKey.contentHash}:${cacheKey.version}`;
    return crypto.createHash('md5').update(keyString).digest('hex');
  }

  private parseKey(hashedKey: string): CacheKey {
    // This is a simplified implementation
    // In production, you'd need to store the original key mapping
    return {
      issueId: 'parsed',
      agentType: 'parsed',
      contentHash: 'parsed',
      version: 'parsed',
    };
  }

  private createCacheEntry<T>(key: string, value: T, ttl: number): CacheEntry<T> {
    const now = new Date();
    const content = JSON.stringify(value);

    return {
      key,
      value,
      metadata: {
        createdAt: now,
        updatedAt: now,
        accessCount: 0,
        lastAccessed: now,
        ttl: ttl * 1000, // Convert to milliseconds
        size: Buffer.byteLength(content, 'utf8'),
        compressed: false,
        hash: crypto.createHash('md5').update(content).digest('hex'),
      },
      tags: [],
      dependencies: [],
    };
  }

  private isValidEntry<T>(entry: CacheEntry<T>): boolean {
    const now = Date.now();
    const expiryTime = entry.metadata.createdAt.getTime() + entry.metadata.ttl;
    return now < expiryTime;
  }

  private getFromMemory<T>(key: string): CacheEntry<T> | null {
    const entry = this.memoryCache.get(key) as CacheEntry<T> | undefined;
    return entry || null;
  }

  private setInMemory<T>(key: string, entry: CacheEntry<T>): void {
    this.memoryCache.set(key, entry);
    this.stats.currentSize += entry.metadata.size;

    // Update access order for LRU
    this.accessOrder = this.accessOrder.filter((k) => k !== key);
    this.accessOrder.push(key);

    // Initialize access count for LFU
    if (!this.accessCount.has(key)) {
      this.accessCount.set(key, 0);
    }
  }

  private async getFromFile<T>(key: string): Promise<CacheEntry<T> | null> {
    try {
      const filePath = this.getFilePath(key);
      const content = await fs.readFile(filePath, 'utf8');
      const entry: CacheEntry<T> = JSON.parse(content);

      // Restore Date objects
      entry.metadata.createdAt = new Date(entry.metadata.createdAt);
      entry.metadata.updatedAt = new Date(entry.metadata.updatedAt);
      entry.metadata.lastAccessed = new Date(entry.metadata.lastAccessed);

      // Decrypt if needed
      if (this.config.encryption) {
        entry.value = await this.decrypt(entry.value);
      }

      // Decompress if needed
      if (entry.metadata.compressed && this.config.compression) {
        entry.value = await this.decompress(entry.value);
        entry.metadata.compressed = false;
      }

      return entry;
    } catch (error) {
      return null;
    }
  }

  private async setInFile<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    const filePath = this.getFilePath(key);
    const content = JSON.stringify(entry, null, 0); // Compact JSON
    await fs.writeFile(filePath, content, 'utf8');
  }

  private getFilePath(key: string): string {
    return path.join(this.cacheBasePath, `${key}.cache`);
  }

  private async loadCacheFromDisk(): Promise<void> {
    try {
      const files = await fs.readdir(this.cacheBasePath);
      const cacheFiles = files.filter((file) => file.endsWith('.cache'));

      let loadedCount = 0;
      for (const file of cacheFiles) {
        try {
          const key = file.replace('.cache', '');
          const entry = await this.getFromFile(key);

          if (entry && this.isValidEntry(entry)) {
            this.setInMemory(key, entry);
            loadedCount++;
          } else {
            // Remove expired cache file
            await fs.unlink(path.join(this.cacheBasePath, file));
          }
        } catch (error) {
          logger.warn(`[CacheEngine] Failed to load cache file ${file}:`, error);
        }
      }

      logger.info(`[CacheEngine] Loaded ${loadedCount} cache entries from disk`);
    } catch (error) {
      logger.warn('[CacheEngine] Failed to load cache from disk:', error);
    }
  }

  private async performEvictionIfNeeded(): Promise<void> {
    if (this.stats.currentSize <= this.config.maxSize) {
      return;
    }

    const targetSize = this.config.maxSize * 0.8; // Evict to 80% capacity
    let evictedCount = 0;

    while (this.stats.currentSize > targetSize && this.memoryCache.size > 0) {
      const keyToEvict = this.selectEvictionCandidate();
      if (keyToEvict) {
        await this.evictEntry(keyToEvict);
        evictedCount++;
      } else {
        break;
      }
    }

    if (evictedCount > 0) {
      this.stats.evictionCount += evictedCount;
      logger.debug(`[CacheEngine] Evicted ${evictedCount} cache entries`);
    }
  }

  private selectEvictionCandidate(): string | null {
    if (this.memoryCache.size === 0) {
      return null;
    }

    switch (this.config.evictionPolicy) {
      case 'lru':
        return this.accessOrder[0] || null;

      case 'lfu':
        let minCount = Infinity;
        let leastUsed: string | null = null;
        for (const [key, count] of this.accessCount) {
          if (count < minCount) {
            minCount = count;
            leastUsed = key;
          }
        }
        return leastUsed;

      case 'ttl':
        let earliestExpiry = Infinity;
        let earliest: string | null = null;
        for (const [key, entry] of this.memoryCache) {
          const expiryTime = entry.metadata.createdAt.getTime() + entry.metadata.ttl;
          if (expiryTime < earliestExpiry) {
            earliestExpiry = expiryTime;
            earliest = key;
          }
        }
        return earliest;

      case 'random':
        const keys = Array.from(this.memoryCache.keys());
        return keys[Math.floor(Math.random() * keys.length)];

      default:
        return this.accessOrder[0] || null;
    }
  }

  private async evictEntry(key: string): Promise<void> {
    const entry = this.memoryCache.get(key);
    if (entry) {
      this.stats.currentSize -= entry.metadata.size;
      this.memoryCache.delete(key);
      this.accessOrder = this.accessOrder.filter((k) => k !== key);
      this.accessCount.delete(key);

      this.recordOperation({
        operation: 'evict',
        key,
        duration: 0,
        success: true,
        reason: `Evicted due to ${this.config.evictionPolicy} policy`,
      });
    }
  }

  private async performCleanup(): Promise<void> {
    const now = Date.now();
    const expiredKeys: string[] = [];

    // Find expired entries
    for (const [key, entry] of this.memoryCache) {
      const expiryTime = entry.metadata.createdAt.getTime() + entry.metadata.ttl;
      if (now >= expiryTime) {
        expiredKeys.push(key);
      }
    }

    // Remove expired entries
    for (const key of expiredKeys) {
      await this.evictEntry(key);
    }

    // Clean up operation history (keep last 1000 operations)
    if (this.operations.length > 1000) {
      this.operations = this.operations.slice(-500);
    }

    if (expiredKeys.length > 0) {
      logger.debug(`[CacheEngine] Cleaned up ${expiredKeys.length} expired cache entries`);
    }
  }

  private updateAccessMetrics(key: string): void {
    // Update access count
    const currentCount = this.accessCount.get(key) || 0;
    this.accessCount.set(key, currentCount + 1);

    // Update access order for LRU
    this.accessOrder = this.accessOrder.filter((k) => k !== key);
    this.accessOrder.push(key);

    // Update entry metadata
    const entry = this.memoryCache.get(key);
    if (entry) {
      entry.metadata.accessCount++;
      entry.metadata.lastAccessed = new Date();
    }
  }

  private recordHit(key: string, duration: number): void {
    this.stats.totalHits++;
    this.recordOperation({
      operation: 'get',
      key,
      duration,
      success: true,
    });
  }

  private recordMiss(key: string, duration: number, error?: Error): void {
    this.stats.totalMisses++;
    this.recordOperation({
      operation: 'get',
      key,
      duration,
      success: false,
      reason: error ? error.message : 'Cache miss',
    });
  }

  private recordOperation(operation: CacheOperation): void {
    this.operations.push(operation);
  }

  private async compress<T>(value: T): Promise<T> {
    // Simple compression simulation
    // In production, use zlib or similar
    return value;
  }

  private async decompress<T>(value: T): Promise<T> {
    // Simple decompression simulation
    return value;
  }

  private async encrypt<T>(value: T): Promise<T> {
    // Simple encryption simulation
    // In production, use proper encryption
    return value;
  }

  private async decrypt<T>(value: T): Promise<T> {
    // Simple decryption simulation
    return value;
  }

  /**
   * Shutdown the cache engine
   */
  async shutdown(): Promise<void> {
    try {
      // Save memory cache to disk if using file storage
      if (this.config.provider === 'file' || this.config.provider === 'hybrid') {
        await this.saveCacheToDisk();
      }

      // Clear memory
      this.memoryCache.clear();
      this.accessOrder = [];
      this.accessCount.clear();

      logger.info('[CacheEngine] Shutdown completed');
    } catch (error) {
      logger.error('[CacheEngine] Shutdown failed:', error);
      throw error;
    }
  }

  private async saveCacheToDisk(): Promise<void> {
    const savePromises: Promise<void>[] = [];

    for (const [key, entry] of this.memoryCache) {
      if (this.isValidEntry(entry)) {
        savePromises.push(this.setInFile(key, entry));
      }
    }

    try {
      await Promise.all(savePromises);
      logger.info('[CacheEngine] Saved cache to disk');
    } catch (error) {
      logger.warn('[CacheEngine] Failed to save some cache entries to disk:', error);
    }
  }
}

export default CacheEngine;
