// Architecture Decision Record Manager - Design Decision Tracking
// Handles creation, versioning, and management of ADRs with full lifecycle support

import { promises as fs } from 'fs';
import * as path from 'path';
import { 
  ArchitectureDecisionRecord, 
  KnowledgeConfig 
} from '../types';
import { 
  ADRFile, 
  FileOperationResult 
} from './types';
import { logger } from '../utils/logger';
import YAML from 'yaml';

/**
 * ADR Manager Implementation
 * 
 * Provides comprehensive ADR lifecycle management:
 * - ADR creation with standardized templates
 * - Status transitions (proposed → accepted → deprecated)
 * - Supersession tracking and relationships
 * - Decision impact assessment
 * - Stakeholder and decider management
 * - Full audit trail preservation
 * 
 * Performance Target: <75ms per operation
 */
export class ADRManager {
  private config: KnowledgeConfig;
  private initialized = false;
  private adrIndex: Map<string, ArchitectureDecisionRecord> = new Map();
  private adrCounter = 0; // For sequential numbering

  constructor(config: KnowledgeConfig) {
    this.config = config;
  }

  /**
   * Initialize the ADR manager
   * Creates directory structure and loads existing ADRs
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Ensure ADR directory exists
      await this.ensureADRDirectory();
      
      // Load existing ADRs
      await this.loadExistingADRs();
      
      // Initialize counter from existing ADRs
      this.initializeCounter();
      
      this.initialized = true;
      logger.debug('ADR manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize ADR manager:', error);
      throw error;
    }
  }

  /**
   * Create a new Architecture Decision Record
   * @param adr ADR data without system-generated fields
   * @returns Promise resolving to created ADR with generated fields
   */
  async createADR(
    adr: Omit<ArchitectureDecisionRecord, 'id' | 'date'>
  ): Promise<ArchitectureDecisionRecord> {
    this.ensureInitialized();
    
    try {
      const newADR: ArchitectureDecisionRecord = {
        ...adr,
        id: this.generateADRId(),
        date: new Date(),
        status: adr.status || 'proposed' // Default to proposed if not specified
      };

      // Validate ADR structure
      this.validateADR(newADR);

      // Handle supersession relationships
      if (newADR.supersededBy) {
        await this.handleSupersession(newADR.supersededBy, newADR.id);
      }

      // Save ADR to file
      await this.saveADR(newADR);
      
      // Update index
      this.adrIndex.set(newADR.id, newADR);
      
      logger.info(`Created ADR ${newADR.id}: ${newADR.title}`);
      return newADR;
    } catch (error) {
      logger.error('Failed to create ADR:', error);
      throw new Error(`Failed to create ADR: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update an existing ADR
   * @param id ADR identifier
   * @param updates Partial ADR updates
   * @returns Promise resolving to updated ADR
   */
  async updateADR(id: string, updates: Partial<ArchitectureDecisionRecord>): Promise<ArchitectureDecisionRecord> {
    this.ensureInitialized();
    
    try {
      const existingADR = await this.getADR(id);
      if (!existingADR) {
        throw new Error(`ADR not found: ${id}`);
      }

      // Validate status transitions
      if (updates.status && updates.status !== existingADR.status) {
        this.validateStatusTransition(existingADR.status, updates.status);
      }

      const updatedADR: ArchitectureDecisionRecord = {
        ...existingADR,
        ...updates,
        id, // Ensure ID cannot be changed
        date: existingADR.date // Preserve original date
      };

      // Validate updated ADR
      this.validateADR(updatedADR);

      // Handle supersession changes
      if (updates.supersededBy && updates.supersededBy !== existingADR.supersededBy) {
        await this.handleSupersession(updates.supersededBy, id);
      }

      // Save updated ADR
      await this.saveADR(updatedADR);
      
      // Update index
      this.adrIndex.set(id, updatedADR);
      
      logger.info(`Updated ADR ${id}: status=${updatedADR.status}`);
      return updatedADR;
    } catch (error) {
      logger.error(`Failed to update ADR ${id}:`, error);
      throw new Error(`Failed to update ADR: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get an ADR by ID
   * @param id ADR identifier
   * @returns Promise resolving to ADR or null if not found
   */
  async getADR(id: string): Promise<ArchitectureDecisionRecord | null> {
    this.ensureInitialized();
    
    try {
      const adr = this.adrIndex.get(id);
      if (adr) {
        return { ...adr }; // Return copy to prevent external mutation
      }

      // Try loading from file if not in index
      const filePath = this.getADRPath(id);
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const loadedADR = this.deserializeADR(content);
        if (loadedADR) {
          this.adrIndex.set(id, loadedADR);
          return { ...loadedADR };
        }
      } catch (fileError) {
        // File doesn't exist
      }

      return null;
    } catch (error) {
      logger.error(`Failed to get ADR ${id}:`, error);
      throw new Error(`Failed to get ADR: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List ADRs with optional filtering
   * @param filters Optional filters to apply
   * @returns Promise resolving to filtered list of ADRs
   */
  async listADRs(filters?: { 
    status?: ArchitectureDecisionRecord['status'][];
    tags?: string[];
    complexity?: ArchitectureDecisionRecord['metadata']['complexity'][];
    impact?: ArchitectureDecisionRecord['metadata']['impact'][];
    deciders?: string[];
  }): Promise<ArchitectureDecisionRecord[]> {
    this.ensureInitialized();
    
    try {
      let adrs = Array.from(this.adrIndex.values());

      if (filters) {
        // Apply status filter
        if (filters.status && filters.status.length > 0) {
          adrs = adrs.filter(adr => filters.status!.includes(adr.status));
        }

        // Apply tags filter
        if (filters.tags && filters.tags.length > 0) {
          adrs = adrs.filter(adr => 
            filters.tags!.some(tag => 
              adr.tags.some(adrTag => 
                adrTag.toLowerCase().includes(tag.toLowerCase())
              )
            )
          );
        }

        // Apply complexity filter
        if (filters.complexity && filters.complexity.length > 0) {
          adrs = adrs.filter(adr => filters.complexity!.includes(adr.metadata.complexity));
        }

        // Apply impact filter
        if (filters.impact && filters.impact.length > 0) {
          adrs = adrs.filter(adr => filters.impact!.includes(adr.metadata.impact));
        }

        // Apply deciders filter
        if (filters.deciders && filters.deciders.length > 0) {
          adrs = adrs.filter(adr => 
            filters.deciders!.some(decider => 
              adr.deciders.some(adrDecider => 
                adrDecider.toLowerCase().includes(decider.toLowerCase())
              )
            )
          );
        }
      }

      // Sort by date (newest first)
      adrs.sort((a, b) => b.date.getTime() - a.date.getTime());

      return adrs.map(adr => ({ ...adr })); // Return copies
    } catch (error) {
      logger.error('Failed to list ADRs:', error);
      throw new Error(`Failed to list ADRs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get ADR statistics
   * @returns Promise resolving to statistics
   */
  async getStats(): Promise<{
    total: number;
    byStatus: Record<ArchitectureDecisionRecord['status'], number>;
    byComplexity: Record<string, number>;
    byImpact: Record<string, number>;
    recent: number; // ADRs created in last 30 days
  }> {
    this.ensureInitialized();
    
    try {
      const stats = {
        total: 0,
        byStatus: {} as Record<ArchitectureDecisionRecord['status'], number>,
        byComplexity: {} as Record<string, number>,
        byImpact: {} as Record<string, number>,
        recent: 0
      };

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      for (const adr of Array.from(this.adrIndex.values())) {
        stats.total++;

        // Count by status
        stats.byStatus[adr.status] = (stats.byStatus[adr.status] || 0) + 1;

        // Count by complexity
        stats.byComplexity[adr.metadata.complexity] = (stats.byComplexity[adr.metadata.complexity] || 0) + 1;

        // Count by impact
        stats.byImpact[adr.metadata.impact] = (stats.byImpact[adr.metadata.impact] || 0) + 1;

        // Count recent ADRs
        if (adr.date > thirtyDaysAgo) {
          stats.recent++;
        }
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get ADR statistics:', error);
      throw new Error(`Failed to get statistics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Deprecate an ADR (mark as superseded)
   * @param id ADR identifier to deprecate
   * @param supersededById ID of the ADR that supersedes this one
   * @returns Promise resolving to updated ADR
   */
  async deprecateADR(id: string, supersededById: string): Promise<ArchitectureDecisionRecord> {
    this.ensureInitialized();
    
    try {
      const adr = await this.getADR(id);
      if (!adr) {
        throw new Error(`ADR not found: ${id}`);
      }

      const supersedingADR = await this.getADR(supersededById);
      if (!supersedingADR) {
        throw new Error(`Superseding ADR not found: ${supersededById}`);
      }

      // Update status and supersession
      return await this.updateADR(id, {
        status: 'superseded',
        supersededBy: supersededById
      });
    } catch (error) {
      logger.error(`Failed to deprecate ADR ${id}:`, error);
      throw new Error(`Failed to deprecate ADR: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get ADRs related to a specific ADR
   * @param id ADR identifier
   * @returns Promise resolving to related ADRs
   */
  async getRelatedADRs(id: string): Promise<{
    supersedes: ArchitectureDecisionRecord[];
    supersededBy: ArchitectureDecisionRecord[];
    related: ArchitectureDecisionRecord[];
  }> {
    this.ensureInitialized();
    
    try {
      const adr = await this.getADR(id);
      if (!adr) {
        throw new Error(`ADR not found: ${id}`);
      }

      const result = {
        supersedes: [] as ArchitectureDecisionRecord[],
        supersededBy: [] as ArchitectureDecisionRecord[],
        related: [] as ArchitectureDecisionRecord[]
      };

      for (const otherADR of this.adrIndex.values()) {
        if (otherADR.id === id) continue;

        // Check if this ADR supersedes the other
        if (otherADR.supersededBy === id) {
          result.supersedes.push({ ...otherADR });
        }

        // Check if this ADR is superseded by the other
        if (adr.supersededBy === otherADR.id) {
          result.supersededBy.push({ ...otherADR });
        }

        // Check if related
        if (adr.relatedDecisions.includes(otherADR.id) || 
            otherADR.relatedDecisions.includes(id)) {
          result.related.push({ ...otherADR });
        }
      }

      return result;
    } catch (error) {
      logger.error(`Failed to get related ADRs for ${id}:`, error);
      throw new Error(`Failed to get related ADRs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Cleanup old or invalid ADRs
   */
  async cleanup(): Promise<void> {
    this.ensureInitialized();
    
    try {
      let cleanedCount = 0;
      const idsToCheck: string[] = [];

      for (const id of Array.from(this.adrIndex.keys())) {
        const adr = this.adrIndex.get(id)!;
        if (this.shouldCleanupADR(adr)) {
          idsToCheck.push(id);
        }
      }

      // Validate cleanup candidates (ensure no broken references)
      for (const id of idsToCheck) {
        const relatedADRs = await this.getRelatedADRs(id);
        const hasActiveReferences = relatedADRs.related.length > 0 || 
                                  relatedADRs.supersedes.length > 0;

        if (!hasActiveReferences) {
          await this.deleteADR(id);
          cleanedCount++;
        }
      }

      logger.info(`ADR cleanup completed: ${cleanedCount} ADRs removed`);
    } catch (error) {
      logger.error('Failed to cleanup ADRs:', error);
      throw new Error(`Failed to cleanup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ==================== Private Helper Methods ====================

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('ADR manager not initialized');
    }
  }

  private async ensureADRDirectory(): Promise<void> {
    const adrDir = path.join(this.config.storageBasePath, 'adr');
    await fs.mkdir(adrDir, { recursive: true });
  }

  private async loadExistingADRs(): Promise<void> {
    this.adrIndex.clear();

    const adrDir = path.join(this.config.storageBasePath, 'adr');
    
    try {
      const files = await fs.readdir(adrDir);
      
      for (const file of files) {
        if (file.endsWith('.md')) {
          const filePath = path.join(adrDir, file);
          try {
            const content = await fs.readFile(filePath, 'utf8');
            const adr = this.deserializeADR(content);
            
            if (adr) {
              this.adrIndex.set(adr.id, adr);
            }
          } catch (error) {
            logger.warn(`Failed to load ADR from ${filePath}:`, error);
          }
        }
      }

      logger.debug(`Loaded ${this.adrIndex.size} ADRs`);
    } catch (error) {
      // Directory might not exist yet, that's ok
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn(`Failed to read ADR directory:`, error);
      }
    }
  }

  private initializeCounter(): void {
    // Extract numeric IDs and find highest
    let maxNumber = 0;
    
    for (const id of Array.from(this.adrIndex.keys())) {
      const match = id.match(/^ADR-(\d+)$/);
      if (match) {
        const number = parseInt(match[1], 10);
        if (number > maxNumber) {
          maxNumber = number;
        }
      }
    }
    
    this.adrCounter = maxNumber;
  }

  private generateADRId(): string {
    this.adrCounter++;
    return `ADR-${this.adrCounter.toString().padStart(4, '0')}`;
  }

  private getADRPath(id: string): string {
    return path.join(this.config.storageBasePath, 'adr', `${id}.md`);
  }

  private validateADR(adr: ArchitectureDecisionRecord): void {
    if (!adr.title || adr.title.trim().length === 0) {
      throw new Error('ADR title is required');
    }

    if (!adr.context || adr.context.trim().length === 0) {
      throw new Error('ADR context is required');
    }

    if (!adr.decision || adr.decision.trim().length === 0) {
      throw new Error('ADR decision is required');
    }

    if (!adr.deciders || adr.deciders.length === 0) {
      throw new Error('ADR must have at least one decider');
    }

    // Validate status
    const validStatuses: ArchitectureDecisionRecord['status'][] = [
      'proposed', 'accepted', 'rejected', 'deprecated', 'superseded'
    ];
    if (!validStatuses.includes(adr.status)) {
      throw new Error(`Invalid ADR status: ${adr.status}`);
    }
  }

  private validateStatusTransition(
    currentStatus: ArchitectureDecisionRecord['status'], 
    newStatus: ArchitectureDecisionRecord['status']
  ): void {
    // Define valid status transitions
    const validTransitions: Record<ArchitectureDecisionRecord['status'], ArchitectureDecisionRecord['status'][]> = {
      'proposed': ['accepted', 'rejected'],
      'accepted': ['deprecated', 'superseded'],
      'rejected': ['proposed'], // Can be reconsidered
      'deprecated': ['superseded'],
      'superseded': [] // Terminal state
    };

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      throw new Error(`Invalid status transition from ${currentStatus} to ${newStatus}`);
    }
  }

  private async handleSupersession(supersededById: string, supersedingId: string): Promise<void> {
    const supersededADR = await this.getADR(supersededById);
    if (supersededADR) {
      await this.updateADR(supersededById, {
        status: 'superseded',
        supersededBy: supersedingId
      });
    }
  }

  private shouldCleanupADR(adr: ArchitectureDecisionRecord): boolean {
    // Only cleanup rejected ADRs that are old and have no references
    if (adr.status !== 'rejected') return false;
    
    // Don't cleanup recent rejections (might be reconsidered)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    return adr.date < sixMonthsAgo;
  }

  private async saveADR(adr: ArchitectureDecisionRecord): Promise<void> {
    const filePath = this.getADRPath(adr.id);
    const content = this.serializeADR(adr);
    
    // Atomic write
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, content, 'utf8');
    await fs.rename(tempPath, filePath);
  }

  private async deleteADR(id: string): Promise<void> {
    const filePath = this.getADRPath(id);
    await fs.unlink(filePath);
    this.adrIndex.delete(id);
  }

  private serializeADR(adr: ArchitectureDecisionRecord): string {
    const frontmatter = {
      id: adr.id,
      title: adr.title,
      status: adr.status,
      deciders: adr.deciders,
      date: adr.date.toISOString(),
      tags: adr.tags,
      complexity: adr.metadata.complexity,
      impact: adr.metadata.impact,
      reversible: adr.metadata.reversible,
      supersededBy: adr.supersededBy,
      relatedDecisions: adr.relatedDecisions
    };

    const yamlFrontmatter = this.stringifyYaml(frontmatter);
    
    // Generate standardized ADR content
    const content = `# ${adr.id}: ${adr.title}

## Status

${adr.status.toUpperCase()}${adr.supersededBy ? ` (superseded by ${adr.supersededBy})` : ''}

## Context

${adr.context}

## Decision

${adr.decision}

## Rationale

${adr.rationale}

## Consequences

### Positive
${adr.consequences.positive.map(item => `- ${item}`).join('\n')}

### Negative
${adr.consequences.negative.map(item => `- ${item}`).join('\n')}

### Risks
${adr.consequences.risks.map(item => `- ${item}`).join('\n')}

## Alternatives Considered

${adr.alternatives.map(alt => `
### ${alt.option}

**Pros:**
${alt.pros.map(pro => `- ${pro}`).join('\n')}

**Cons:**
${alt.cons.map(con => `- ${con}`).join('\n')}
`).join('\n')}

## Metadata

- **Complexity**: ${adr.metadata.complexity}
- **Impact**: ${adr.metadata.impact}
- **Reversible**: ${adr.metadata.reversible ? 'Yes' : 'No'}
- **Deciders**: ${adr.deciders.join(', ')}
- **Date**: ${adr.date.toISOString().split('T')[0]}

${adr.relatedDecisions.length > 0 ? `
## Related Decisions

${adr.relatedDecisions.map(id => `- ${id}`).join('\n')}
` : ''}`;

    return `---\n${yamlFrontmatter}---\n\n${content}`;
  }

  private deserializeADR(fileContent: string): ArchitectureDecisionRecord | null {
    try {
      const parts = fileContent.split('---\n');
      if (parts.length < 3) return null;

      const frontmatterYaml = parts[1];
      const content = parts.slice(2).join('---\n').trim();
      
      const frontmatter = this.parseYaml(frontmatterYaml);
      if (!frontmatter || !frontmatter.id) return null;

      // For simplicity, we'll construct basic ADR data from frontmatter
      // In a full implementation, you'd parse the content sections as well
      const adr: ArchitectureDecisionRecord = {
        id: frontmatter.id,
        title: frontmatter.title || '',
        status: frontmatter.status || 'proposed',
        deciders: frontmatter.deciders || [],
        date: new Date(frontmatter.date),
        context: 'Context extracted from content', // Would parse from content
        decision: 'Decision extracted from content', // Would parse from content  
        rationale: 'Rationale extracted from content', // Would parse from content
        consequences: {
          positive: [],
          negative: [],
          risks: []
        }, // Would parse from content
        alternatives: [], // Would parse from content
        relatedDecisions: frontmatter.relatedDecisions || [],
        supersededBy: frontmatter.supersededBy,
        tags: frontmatter.tags || [],
        metadata: {
          complexity: frontmatter.complexity || 'medium',
          impact: frontmatter.impact || 'local',
          reversible: frontmatter.reversible !== false
        }
      };

      return adr;
    } catch (error) {
      logger.error('Failed to deserialize ADR:', error);
      return null;
    }
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