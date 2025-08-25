// Gotcha Pattern Tracker - Issue Pattern Recognition & Auto-Promotion
// Tracks recurring issues and automatically promotes them to knowledge cards

import { promises as fs } from 'fs';
import * as path from 'path';
import { 
  GotchaPattern, 
  GotchaOccurrence, 
  KnowledgeConfig 
} from '../types';
import { 
  GotchaFile, 
  PromotionCandidate, 
  FileOperationResult 
} from './types';
import { logger } from '../utils/logger';
import YAML from 'yaml';

/**
 * Gotcha Tracker Implementation
 * 
 * Provides pattern recognition for recurring issues:
 * - Automatic pattern detection
 * - Occurrence tracking and counting
 * - Auto-promotion when threshold reached (≥3 occurrences by default)
 * - Pattern similarity matching
 * - Category-based organization
 * 
 * Performance Target: <100ms per operation
 */
export class GotchaTracker {
  private config: KnowledgeConfig;
  private initialized = false;
  private gotchaIndex: Map<string, GotchaPattern> = new Map();
  private patternMatcher: RegExp[] = [];

  constructor(config: KnowledgeConfig) {
    this.config = config;
  }

  /**
   * Initialize the gotcha tracker
   * Creates directory structure and loads existing patterns
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Ensure gotcha directory exists
      await this.ensureGotchaDirectory();
      
      // Load existing gotcha patterns
      await this.loadGotchaPatterns();
      
      // Build pattern matchers for similarity detection
      this.buildPatternMatchers();
      
      this.initialized = true;
      logger.debug('Gotcha tracker initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize gotcha tracker:', error);
      throw error;
    }
  }

  /**
   * Record a new gotcha occurrence
   * Automatically detects similar patterns and updates counts
   * @param pattern Gotcha pattern data (without system-generated fields)
   * @returns Promise resolving to created or updated pattern
   */
  async recordGotcha(
    pattern: Omit<GotchaPattern, 'id' | 'createdAt' | 'updatedAt' | 'promoted'>
  ): Promise<GotchaPattern> {
    this.ensureInitialized();
    
    try {
      // Check for existing similar patterns
      const existingPattern = await this.findSimilarPattern(pattern);
      
      if (existingPattern) {
        // Update existing pattern
        existingPattern.occurrences.push(...pattern.occurrences);
        existingPattern.updatedAt = new Date();
        
        // Update severity if new occurrence is more severe
        if (this.getSeverityLevel(pattern.severity) > this.getSeverityLevel(existingPattern.severity)) {
          existingPattern.severity = pattern.severity;
        }

        // Merge prevention steps if different
        const newSteps = pattern.preventionSteps.filter(
          step => !existingPattern.preventionSteps.includes(step)
        );
        existingPattern.preventionSteps.push(...newSteps);

        await this.saveGotcha(existingPattern);
        
        // Check for auto-promotion
        if (this.shouldAutoPromote(existingPattern)) {
          logger.info(`Gotcha pattern ${existingPattern.id} eligible for auto-promotion: ${existingPattern.occurrences.length} occurrences`);
        }
        
        logger.debug(`Updated existing gotcha pattern: ${existingPattern.id}`);
        return existingPattern;
      } else {
        // Create new pattern
        const newPattern: GotchaPattern = {
          id: this.generateId('gotcha'),
          description: pattern.description,
          pattern: pattern.pattern,
          severity: pattern.severity,
          category: pattern.category,
          solution: pattern.solution,
          preventionSteps: [...pattern.preventionSteps],
          occurrences: [...pattern.occurrences],
          createdAt: new Date(),
          updatedAt: new Date(),
          promoted: false
        };

        await this.saveGotcha(newPattern);
        this.gotchaIndex.set(newPattern.id, newPattern);
        
        logger.debug(`Created new gotcha pattern: ${newPattern.id} - ${newPattern.description}`);
        return newPattern;
      }
    } catch (error) {
      logger.error('Failed to record gotcha pattern:', error);
      throw new Error(`Failed to record gotcha: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get a specific gotcha pattern
   * @param id Gotcha pattern identifier
   * @returns Promise resolving to pattern or null if not found
   */
  async getGotcha(id: string): Promise<GotchaPattern | null> {
    this.ensureInitialized();
    
    try {
      const pattern = this.gotchaIndex.get(id);
      if (pattern) {
        return { ...pattern }; // Return copy to prevent external mutation
      }

      // Try loading from file if not in index
      const filePath = path.join(this.config.storageBasePath, 'gotchas', `${id}.md`);
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const gotcha = this.deserializeGotcha(content);
        if (gotcha) {
          this.gotchaIndex.set(id, gotcha);
          return { ...gotcha };
        }
      } catch (fileError) {
        // File doesn't exist
      }

      return null;
    } catch (error) {
      logger.error(`Failed to get gotcha pattern ${id}:`, error);
      throw new Error(`Failed to get gotcha: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Mark a gotcha pattern as promoted to a knowledge card
   * @param gotchaId Gotcha pattern identifier
   * @param knowledgeCardId Associated knowledge card ID
   */
  async markAsPromoted(gotchaId: string, knowledgeCardId: string): Promise<void> {
    this.ensureInitialized();
    
    try {
      const gotcha = await this.getGotcha(gotchaId);
      if (!gotcha) {
        throw new Error(`Gotcha pattern not found: ${gotchaId}`);
      }

      gotcha.promoted = true;
      gotcha.updatedAt = new Date();
      
      // Add knowledge card reference to the gotcha metadata
      // This could be extended to track the relationship

      await this.saveGotcha(gotcha);
      this.gotchaIndex.set(gotchaId, gotcha);
      
      logger.info(`Marked gotcha ${gotchaId} as promoted to knowledge card ${knowledgeCardId}`);
    } catch (error) {
      logger.error(`Failed to mark gotcha ${gotchaId} as promoted:`, error);
      throw new Error(`Failed to mark as promoted: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get gotcha statistics
   * @returns Promise resolving to statistics
   */
  async getStats(): Promise<{ 
    total: number; 
    promoted: number; 
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    promotionCandidates: PromotionCandidate[];
  }> {
    this.ensureInitialized();
    
    try {
      const stats = {
        total: 0,
        promoted: 0,
        byCategory: {} as Record<string, number>,
        bySeverity: {} as Record<string, number>,
        promotionCandidates: [] as PromotionCandidate[]
      };

      for (const gotcha of Array.from(this.gotchaIndex.values())) {
        stats.total++;
        
        if (gotcha.promoted) {
          stats.promoted++;
        }

        // Count by category
        stats.byCategory[gotcha.category] = (stats.byCategory[gotcha.category] || 0) + 1;
        
        // Count by severity
        stats.bySeverity[gotcha.severity] = (stats.bySeverity[gotcha.severity] || 0) + 1;

        // Check for promotion candidates
        if (!gotcha.promoted && this.shouldAutoPromote(gotcha)) {
          stats.promotionCandidates.push({
            gotchaId: gotcha.id,
            occurrenceCount: gotcha.occurrences.length,
            severity: gotcha.severity,
            category: gotcha.category,
            promotionScore: this.calculatePromotionScore(gotcha)
          });
        }
      }

      // Sort promotion candidates by score
      stats.promotionCandidates.sort((a, b) => b.promotionScore - a.promotionScore);

      return stats;
    } catch (error) {
      logger.error('Failed to get gotcha statistics:', error);
      throw new Error(`Failed to get statistics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all gotcha patterns
   * @returns Promise resolving to list of all gotcha patterns
   */
  async getAllGotchas(): Promise<GotchaPattern[]> {
    this.ensureInitialized();
    
    try {
      return Array.from(this.gotchaIndex.values()).map(gotcha => ({ ...gotcha }));
    } catch (error) {
      logger.error('Failed to get all gotchas:', error);
      throw new Error(`Failed to get all gotchas: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get promotion candidates sorted by eligibility
   * @returns Promise resolving to list of promotion candidates
   */
  async getPromotionCandidates(): Promise<PromotionCandidate[]> {
    this.ensureInitialized();
    
    try {
      const candidates: PromotionCandidate[] = [];

      for (const gotcha of Array.from(this.gotchaIndex.values())) {
        if (!gotcha.promoted && this.shouldAutoPromote(gotcha)) {
          candidates.push({
            gotchaId: gotcha.id,
            occurrenceCount: gotcha.occurrences.length,
            severity: gotcha.severity,
            category: gotcha.category,
            promotionScore: this.calculatePromotionScore(gotcha)
          });
        }
      }

      // Sort by promotion score
      candidates.sort((a, b) => b.promotionScore - a.promotionScore);
      
      return candidates;
    } catch (error) {
      logger.error('Failed to get promotion candidates:', error);
      throw new Error(`Failed to get candidates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Cleanup old gotcha patterns
   */
  async cleanup(): Promise<void> {
    this.ensureInitialized();
    
    try {
      let cleanedCount = 0;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.cleanupIntervalDays);

      const idsToDelete: string[] = [];

      for (const id of Array.from(this.gotchaIndex.keys())) {
        const gotcha = this.gotchaIndex.get(id)!;
        if (this.shouldCleanupGotcha(gotcha, cutoffDate)) {
          idsToDelete.push(id);
        }
      }

      // Delete old gotchas
      for (const id of idsToDelete) {
        await this.deleteGotcha(id);
        cleanedCount++;
      }

      logger.info(`Gotcha cleanup completed: ${cleanedCount} patterns removed`);
    } catch (error) {
      logger.error('Failed to cleanup gotchas:', error);
      throw new Error(`Failed to cleanup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ==================== Private Helper Methods ====================

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Gotcha tracker not initialized');
    }
  }

  private async ensureGotchaDirectory(): Promise<void> {
    const gotchaDir = path.join(this.config.storageBasePath, 'gotchas');
    await fs.mkdir(gotchaDir, { recursive: true });
  }

  private async loadGotchaPatterns(): Promise<void> {
    this.gotchaIndex.clear();

    const gotchaDir = path.join(this.config.storageBasePath, 'gotchas');
    
    try {
      const files = await fs.readdir(gotchaDir);
      
      for (const file of files) {
        if (file.endsWith('.md')) {
          const filePath = path.join(gotchaDir, file);
          try {
            const content = await fs.readFile(filePath, 'utf8');
            const gotcha = this.deserializeGotcha(content);
            
            if (gotcha) {
              this.gotchaIndex.set(gotcha.id, gotcha);
            }
          } catch (error) {
            logger.warn(`Failed to load gotcha pattern from ${filePath}:`, error);
          }
        }
      }

      logger.debug(`Loaded ${this.gotchaIndex.size} gotcha patterns`);
    } catch (error) {
      // Directory might not exist yet, that's ok
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn(`Failed to read gotcha directory:`, error);
      }
    }
  }

  private buildPatternMatchers(): void {
    this.patternMatcher = [];
    
    // Build regex patterns for similarity matching
    for (const gotcha of this.gotchaIndex.values()) {
      try {
        // Create fuzzy matching patterns
        const pattern = gotcha.pattern
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape regex chars
          .replace(/\\\*/g, '.*') // Allow wildcards
          .replace(/\s+/g, '\\s+'); // Flexible whitespace
          
        this.patternMatcher.push(new RegExp(pattern, 'i'));
      } catch (error) {
        // Invalid regex, skip
        logger.warn(`Invalid pattern for gotcha ${gotcha.id}: ${gotcha.pattern}`);
      }
    }
  }

  private async findSimilarPattern(
    newPattern: Omit<GotchaPattern, 'id' | 'createdAt' | 'updatedAt' | 'promoted'>
  ): Promise<GotchaPattern | null> {
    // Check for exact pattern match first
    for (const gotcha of this.gotchaIndex.values()) {
      if (gotcha.pattern === newPattern.pattern && gotcha.category === newPattern.category) {
        return gotcha;
      }
    }

    // Check for similar descriptions
    const newDescLower = newPattern.description.toLowerCase();
    for (const gotcha of this.gotchaIndex.values()) {
      const similarity = this.calculateStringSimilarity(
        newDescLower, 
        gotcha.description.toLowerCase()
      );
      
      if (similarity > 0.7 && gotcha.category === newPattern.category) {
        return gotcha;
      }
    }

    // Check for pattern similarity
    for (const gotcha of this.gotchaIndex.values()) {
      if (gotcha.category === newPattern.category) {
        const similarity = this.calculateStringSimilarity(
          newPattern.pattern.toLowerCase(),
          gotcha.pattern.toLowerCase()
        );
        
        if (similarity > 0.6) {
          return gotcha;
        }
      }
    }

    return null;
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    // Simple Jaccard similarity for string comparison
    const set1 = new Set(str1.split(/\s+/));
    const set2 = new Set(str2.split(/\s+/));
    
    const intersection = new Set(Array.from(set1).filter(x => set2.has(x)));
    const union = new Set([...Array.from(set1), ...Array.from(set2)]);
    
    return intersection.size / union.size;
  }

  private shouldAutoPromote(gotcha: GotchaPattern): boolean {
    if (gotcha.promoted) return false;
    
    const occurrenceThreshold = this.config.gotchaPromotionThreshold || 3;
    const hasEnoughOccurrences = gotcha.occurrences.length >= occurrenceThreshold;
    
    // Higher severity patterns can be promoted with fewer occurrences
    const severityMultiplier = this.getSeverityLevel(gotcha.severity);
    const adjustedThreshold = Math.max(2, occurrenceThreshold - severityMultiplier);
    
    return gotcha.occurrences.length >= adjustedThreshold;
  }

  private calculatePromotionScore(gotcha: GotchaPattern): number {
    let score = 0;
    
    // Base score from occurrence count
    score += gotcha.occurrences.length * 10;
    
    // Severity bonus
    score += this.getSeverityLevel(gotcha.severity) * 20;
    
    // Resolution rate penalty (unresolved occurrences are worse)
    const resolvedCount = gotcha.occurrences.filter(o => o.resolved).length;
    const resolutionRate = resolvedCount / gotcha.occurrences.length;
    score -= (1 - resolutionRate) * 30;
    
    // Recent activity bonus
    const recentOccurrences = gotcha.occurrences.filter(o => 
      Date.now() - o.timestamp.getTime() < 7 * 24 * 60 * 60 * 1000 // 7 days
    ).length;
    score += recentOccurrences * 5;
    
    return Math.round(score);
  }

  private getSeverityLevel(severity: GotchaPattern['severity']): number {
    switch (severity) {
      case 'critical': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 1;
    }
  }

  private shouldCleanupGotcha(gotcha: GotchaPattern, cutoffDate: Date): boolean {
    // Don't cleanup promoted gotchas
    if (gotcha.promoted) return false;
    
    // Don't cleanup high severity or frequently occurring gotchas
    if (gotcha.severity === 'critical' || gotcha.severity === 'high') return false;
    if (gotcha.occurrences.length >= 3) return false;
    
    // Cleanup old, low-impact gotchas
    return gotcha.createdAt < cutoffDate && gotcha.occurrences.length <= 1;
  }

  private async saveGotcha(gotcha: GotchaPattern): Promise<void> {
    const filePath = path.join(this.config.storageBasePath, 'gotchas', `${gotcha.id}.md`);
    const content = this.serializeGotcha(gotcha);
    
    // Atomic write
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, content, 'utf8');
    await fs.rename(tempPath, filePath);
  }

  private async deleteGotcha(id: string): Promise<void> {
    const filePath = path.join(this.config.storageBasePath, 'gotchas', `${id}.md`);
    await fs.unlink(filePath);
    this.gotchaIndex.delete(id);
  }

  private serializeGotcha(gotcha: GotchaPattern): string {
    const frontmatter = {
      id: gotcha.id,
      description: gotcha.description,
      pattern: gotcha.pattern,
      severity: gotcha.severity,
      category: gotcha.category,
      solution: gotcha.solution,
      preventionSteps: gotcha.preventionSteps,
      createdAt: gotcha.createdAt.toISOString(),
      updatedAt: gotcha.updatedAt.toISOString(),
      promoted: gotcha.promoted,
      occurrenceCount: gotcha.occurrences.length
    };

    const yamlFrontmatter = this.stringifyYaml(frontmatter);
    
    // Generate content with occurrence details
    const occurrenceDetails = gotcha.occurrences.map((occ, index) => 
      `## Occurrence ${index + 1}

**Issue ID**: ${occ.issueId}  
**Agent Type**: ${occ.agentType}  
**Timestamp**: ${occ.timestamp.toISOString()}  
**Status**: ${occ.resolved ? 'Resolved' : 'Unresolved'}  
${occ.resolutionTime ? `**Resolution Time**: ${occ.resolutionTime}ms` : ''}

**Context**:
\`\`\`
${occ.context}
\`\`\`
`
    ).join('\n\n---\n\n');

    const content = `# Gotcha Pattern: ${gotcha.description}

## Pattern
\`\`\`
${gotcha.pattern}
\`\`\`

## Category
${gotcha.category}

## Severity
${gotcha.severity.toUpperCase()}

${gotcha.solution ? `## Solution
${gotcha.solution}
` : ''}

## Prevention Steps
${gotcha.preventionSteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

## Occurrences

${occurrenceDetails}`;

    return `---\n${yamlFrontmatter}---\n\n${content}`;
  }

  private deserializeGotcha(fileContent: string): GotchaPattern | null {
    try {
      const parts = fileContent.split('---\n');
      if (parts.length < 3) return null;

      const frontmatterYaml = parts[1];
      const frontmatter = this.parseYaml(frontmatterYaml);
      
      if (!frontmatter || !frontmatter.id) return null;

      // Occurrences are stored in the content, but for simplicity in this implementation,
      // we'll create a basic structure. In a full implementation, you'd parse the content
      // to extract occurrence details.
      const occurrences: GotchaOccurrence[] = [];

      const gotcha: GotchaPattern = {
        id: frontmatter.id,
        description: frontmatter.description || '',
        pattern: frontmatter.pattern || '',
        severity: frontmatter.severity || 'medium',
        category: frontmatter.category || 'general',
        solution: frontmatter.solution,
        preventionSteps: frontmatter.preventionSteps || [],
        occurrences,
        createdAt: new Date(frontmatter.createdAt),
        updatedAt: new Date(frontmatter.updatedAt),
        promoted: frontmatter.promoted || false
      };

      return gotcha;
    } catch (error) {
      logger.error('Failed to deserialize gotcha:', error);
      return null;
    }
  }

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private stringifyYaml(obj: any): string {
    return YAML.stringify(obj, {
      indent: 2,
      lineWidth: 0,
      minContentWidth: 0
    });
  }

  private parseYaml(yaml: string): any {
    try {
      return YAML.parse(yaml);
    } catch (error) {
      logger.error('Failed to parse YAML frontmatter:', error);
      return null;
    }
  }
}