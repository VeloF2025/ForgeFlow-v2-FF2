// Provenance System - Complete context source tracking and transparency
// Provides full audit trail and source attribution for all context content

import crypto from 'crypto';
import { logger } from '../utils/logger';
import type {
  ProvenanceInfo,
  ContentSource,
  ContentTransformation,
  ProvenanceDecision,
  AuditTrailEntry,
  ContextPackAssemblerConfig,
} from './types';

export interface TrackingSession {
  id: string;
  contextPackId: string;
  startTime: Date;
  endTime?: Date;
  operations: ProvenanceOperation[];
  status: 'active' | 'completed' | 'error';
}

export interface ProvenanceOperation {
  id: string;
  type: 'source_add' | 'content_transform' | 'decision_make' | 'audit_log';
  timestamp: Date;
  duration?: number;
  data: unknown;
  impact: 'low' | 'medium' | 'high';
  reversible: boolean;
}

export interface SourceRegistration {
  id: string;
  type: 'memory' | 'knowledge' | 'index' | 'retrieval' | 'realtime';
  location: string;
  contentHash: string;
  metadata: Record<string, unknown>;
  reliability: number;
  validatedAt: Date;
}

export interface TransformationRecord {
  id: string;
  type: 'filter' | 'prioritize' | 'summarize' | 'deduplicate' | 'optimize';
  inputSources: string[];
  outputHash: string;
  parameters: Record<string, unknown>;
  algorithm: string;
  confidence: number;
  duration: number;
  reversible: boolean;
}

export interface DecisionRecord {
  id: string;
  decision: string;
  context: string;
  rationale: string;
  alternatives: DecisionAlternative[];
  confidence: number;
  impact: 'low' | 'medium' | 'high';
  reversible: boolean;
  metadata: Record<string, unknown>;
}

export interface DecisionAlternative {
  option: string;
  pros: string[];
  cons: string[];
  score: number;
  risk: 'low' | 'medium' | 'high';
}

export interface ProvenanceQuery {
  contextPackId?: string;
  sourceType?: string;
  timeRange?: { start: Date; end: Date };
  operationType?: string;
  impact?: string;
  includeReversible?: boolean;
  limit?: number;
}

export interface ProvenanceReport {
  summary: ProvenanceSummary;
  sources: ContentSource[];
  transformations: ContentTransformation[];
  decisions: ProvenanceDecision[];
  auditTrail: AuditTrailEntry[];
  trustScore: number;
  recommendations: string[];
  warnings: ProvenanceWarning[];
}

export interface ProvenanceSummary {
  totalSources: number;
  sourceTypes: Record<string, number>;
  totalTransformations: number;
  transformationTypes: Record<string, number>;
  totalDecisions: number;
  averageConfidence: number;
  trustScore: number;
  timespan: { start: Date; end: Date };
}

export interface ProvenanceWarning {
  type: 'low_trust' | 'missing_source' | 'unverified_transformation' | 'conflicting_data';
  severity: 'info' | 'warning' | 'error';
  message: string;
  affectedSources: string[];
  recommendation: string;
}

export class ProvenanceTracker {
  private config: ContextPackAssemblerConfig;
  private sessions: Map<string, TrackingSession> = new Map();
  private sources: Map<string, SourceRegistration> = new Map();
  private transformations: Map<string, TransformationRecord> = new Map();
  private decisions: Map<string, DecisionRecord> = new Map();
  private auditLog: AuditTrailEntry[] = [];

  constructor(config: ContextPackAssemblerConfig) {
    this.config = config;
    logger.info('[ProvenanceTracker] Initialized with full transparency tracking');
  }

  /**
   * Start a new provenance tracking session
   */
  startSession(contextPackId: string): string {
    const sessionId = this.generateId();
    const session: TrackingSession = {
      id: sessionId,
      contextPackId,
      startTime: new Date(),
      operations: [],
      status: 'active',
    };

    this.sessions.set(sessionId, session);

    this.logAudit({
      id: this.generateId(),
      timestamp: new Date(),
      event: 'session_started',
      actor: 'provenance_tracker',
      details: { sessionId, contextPackId },
      impact: 'low',
    });

    logger.debug(
      `[ProvenanceTracker] Started session ${sessionId} for context pack ${contextPackId}`,
    );
    return sessionId;
  }

  /**
   * End a tracking session
   */
  endSession(sessionId: string): TrackingSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`[ProvenanceTracker] Session ${sessionId} not found`);
      return null;
    }

    session.endTime = new Date();
    session.status = 'completed';

    this.logAudit({
      id: this.generateId(),
      timestamp: new Date(),
      event: 'session_completed',
      actor: 'provenance_tracker',
      details: {
        sessionId,
        duration: session.endTime.getTime() - session.startTime.getTime(),
        operationCount: session.operations.length,
      },
      impact: 'low',
    });

    logger.debug(`[ProvenanceTracker] Completed session ${sessionId}`);
    return session;
  }

  /**
   * Register a content source
   */
  registerSource(
    sessionId: string,
    type: ContentSource['type'],
    location: string,
    content: string,
    metadata: Record<string, unknown> = {},
  ): string {
    const sourceId = this.generateId();
    const contentHash = this.calculateHash(content);
    const reliability = this.calculateSourceReliability(type, metadata);

    const source: SourceRegistration = {
      id: sourceId,
      type,
      location,
      contentHash,
      metadata,
      reliability,
      validatedAt: new Date(),
    };

    this.sources.set(sourceId, source);
    this.addSessionOperation(sessionId, {
      id: this.generateId(),
      type: 'source_add',
      timestamp: new Date(),
      data: { sourceId, type, location, reliability },
      impact: 'medium',
      reversible: true,
    });

    this.logAudit({
      id: this.generateId(),
      timestamp: new Date(),
      event: 'source_registered',
      actor: 'provenance_tracker',
      details: { sourceId, type, location, reliability },
      impact: 'medium',
    });

    logger.debug(
      `[ProvenanceTracker] Registered source ${sourceId} with reliability ${reliability}`,
    );
    return sourceId;
  }

  /**
   * Record a content transformation
   */
  recordTransformation(
    sessionId: string,
    type: TransformationRecord['type'],
    inputSources: string[],
    outputContent: string,
    parameters: Record<string, unknown>,
    algorithm: string,
    confidence: number = 1.0,
  ): string {
    const transformationId = this.generateId();
    const startTime = Date.now();

    const transformation: TransformationRecord = {
      id: transformationId,
      type,
      inputSources,
      outputHash: this.calculateHash(outputContent),
      parameters,
      algorithm,
      confidence,
      duration: 0, // Will be updated when transformation completes
      reversible: this.isReversibleTransformation(type),
    };

    this.transformations.set(transformationId, transformation);
    this.addSessionOperation(sessionId, {
      id: this.generateId(),
      type: 'content_transform',
      timestamp: new Date(),
      data: { transformationId, type, algorithm, confidence },
      impact: this.getTransformationImpact(type),
      reversible: transformation.reversible,
    });

    this.logAudit({
      id: this.generateId(),
      timestamp: new Date(),
      event: 'transformation_recorded',
      actor: 'provenance_tracker',
      details: { transformationId, type, algorithm, inputCount: inputSources.length },
      impact: this.getTransformationImpact(type),
    });

    logger.debug(`[ProvenanceTracker] Recorded transformation ${transformationId} of type ${type}`);
    return transformationId;
  }

  /**
   * Update transformation duration when completed
   */
  completeTransformation(transformationId: string, duration: number): void {
    const transformation = this.transformations.get(transformationId);
    if (transformation) {
      transformation.duration = duration;
      logger.debug(
        `[ProvenanceTracker] Updated transformation ${transformationId} duration: ${duration}ms`,
      );
    }
  }

  /**
   * Record a decision made during context pack assembly
   */
  recordDecision(
    sessionId: string,
    decision: string,
    context: string,
    rationale: string,
    alternatives: DecisionAlternative[],
    confidence: number,
    metadata: Record<string, unknown> = {},
  ): string {
    const decisionId = this.generateId();
    const impact = this.calculateDecisionImpact(decision, confidence);

    const decisionRecord: DecisionRecord = {
      id: decisionId,
      decision,
      context,
      rationale,
      alternatives,
      confidence,
      impact,
      reversible: this.isReversibleDecision(decision),
      metadata,
    };

    this.decisions.set(decisionId, decisionRecord);
    this.addSessionOperation(sessionId, {
      id: this.generateId(),
      type: 'decision_make',
      timestamp: new Date(),
      data: { decisionId, decision, confidence, alternativeCount: alternatives.length },
      impact,
      reversible: decisionRecord.reversible,
    });

    this.logAudit({
      id: this.generateId(),
      timestamp: new Date(),
      event: 'decision_recorded',
      actor: 'provenance_tracker',
      details: { decisionId, decision, confidence, impact },
      impact,
    });

    logger.debug(`[ProvenanceTracker] Recorded decision ${decisionId}: ${decision}`);
    return decisionId;
  }

  /**
   * Generate complete provenance information for a context pack
   */
  generateProvenanceInfo(sessionId: string): ProvenanceInfo {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const sources = this.getSessionSources(session);
    const transformations = this.getSessionTransformations(session);
    const decisions = this.getSessionDecisions(session);
    const auditTrail = this.getSessionAuditTrail(session);
    const trustScore = this.calculateTrustScore(sources, transformations, decisions);

    const provenanceInfo: ProvenanceInfo = {
      sources: sources.map((s) => this.convertToContentSource(s)),
      transformations: transformations.map((t) => this.convertToContentTransformation(t)),
      decisions: decisions.map((d) => this.convertToProvenanceDecision(d)),
      auditTrail,
      trustScore,
    };

    logger.info(
      `[ProvenanceTracker] Generated provenance info for session ${sessionId} with trust score ${trustScore}`,
    );
    return provenanceInfo;
  }

  /**
   * Query provenance data
   */
  queryProvenance(query: ProvenanceQuery): ProvenanceReport {
    const startTime = Date.now();

    // Filter sources
    let sources = Array.from(this.sources.values());
    if (query.sourceType) {
      sources = sources.filter((s) => s.type === query.sourceType);
    }

    // Filter transformations
    let transformations = Array.from(this.transformations.values());

    // Filter decisions
    let decisions = Array.from(this.decisions.values());

    // Filter audit trail
    let auditTrail = [...this.auditLog];
    if (query.timeRange) {
      auditTrail = auditTrail.filter(
        (entry) =>
          entry.timestamp >= query.timeRange.start && entry.timestamp <= query.timeRange.end,
      );
    }

    // Apply limit
    if (query.limit) {
      sources = sources.slice(0, query.limit);
      transformations = transformations.slice(0, query.limit);
      decisions = decisions.slice(0, query.limit);
      auditTrail = auditTrail.slice(0, query.limit);
    }

    // Calculate summary
    const summary = this.generateProvenanceSummary(sources, transformations, decisions, auditTrail);

    // Generate recommendations and warnings
    const recommendations = this.generateRecommendations(summary);
    const warnings = this.generateWarnings(sources, transformations, decisions);

    const report: ProvenanceReport = {
      summary,
      sources: sources.map((s) => this.convertToContentSource(s)),
      transformations: transformations.map((t) => this.convertToContentTransformation(t)),
      decisions: decisions.map((d) => this.convertToProvenanceDecision(d)),
      auditTrail,
      trustScore: summary.trustScore,
      recommendations,
      warnings,
    };

    const queryDuration = Date.now() - startTime;
    logger.info(
      `[ProvenanceTracker] Query completed in ${queryDuration}ms, found ${sources.length} sources, ${transformations.length} transformations, ${decisions.length} decisions`,
    );

    return report;
  }

  /**
   * Verify the integrity of provenance data
   */
  verifyIntegrity(sessionId: string): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    const session = this.sessions.get(sessionId);

    if (!session) {
      issues.push(`Session ${sessionId} not found`);
      return { valid: false, issues };
    }

    // Verify source integrity
    const sessionSources = this.getSessionSources(session);
    for (const source of sessionSources) {
      if (!this.sources.has(source.id)) {
        issues.push(`Source ${source.id} referenced but not found`);
      }
    }

    // Verify transformation integrity
    const sessionTransformations = this.getSessionTransformations(session);
    for (const transformation of sessionTransformations) {
      for (const inputId of transformation.inputSources) {
        if (!this.sources.has(inputId)) {
          issues.push(`Transformation ${transformation.id} references missing source ${inputId}`);
        }
      }
    }

    // Verify session operations
    for (const operation of session.operations) {
      if (operation.type === 'source_add') {
        const data = operation.data as { sourceId: string };
        if (!this.sources.has(data.sourceId)) {
          issues.push(`Operation references missing source ${data.sourceId}`);
        }
      }
    }

    const valid = issues.length === 0;
    logger.info(
      `[ProvenanceTracker] Integrity verification for session ${sessionId}: ${valid ? 'PASS' : 'FAIL'} (${issues.length} issues)`,
    );

    return { valid, issues };
  }

  /**
   * Export provenance data for external storage or analysis
   */
  exportProvenance(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const exportData = {
      session,
      sources: this.getSessionSources(session),
      transformations: this.getSessionTransformations(session),
      decisions: this.getSessionDecisions(session),
      auditTrail: this.getSessionAuditTrail(session),
      exportedAt: new Date(),
      version: '1.0.0',
    };

    const exported = JSON.stringify(exportData, null, 2);
    logger.info(
      `[ProvenanceTracker] Exported provenance data for session ${sessionId} (${exported.length} characters)`,
    );

    return exported;
  }

  // Private helper methods

  private generateId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private calculateHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private calculateSourceReliability(
    type: ContentSource['type'],
    metadata: Record<string, unknown>,
  ): number {
    let reliability = 0.5; // Base reliability

    switch (type) {
      case 'memory':
        reliability = 0.9; // High reliability for job memory
        break;
      case 'knowledge':
        reliability = 0.8; // Good reliability for knowledge base
        break;
      case 'index':
        reliability = 0.7; // Moderate reliability for indexed content
        break;
      case 'retrieval':
        reliability = 0.6; // Lower reliability for retrieval results
        break;
      case 'realtime':
        reliability = 0.5; // Variable reliability for real-time data
        break;
    }

    // Adjust based on metadata
    if (metadata.validated) {
      reliability += 0.1;
    }
    if (metadata.authoritative) {
      reliability += 0.2;
    }
    if (metadata.age && typeof metadata.age === 'number') {
      const ageInDays = metadata.age;
      reliability -= Math.min(0.3, ageInDays / 100); // Reduce reliability as content ages
    }

    return Math.max(0.1, Math.min(1.0, reliability));
  }

  private isReversibleTransformation(type: TransformationRecord['type']): boolean {
    return ['filter', 'prioritize'].includes(type); // Summarize and optimize are generally not reversible
  }

  private getTransformationImpact(type: TransformationRecord['type']): 'low' | 'medium' | 'high' {
    switch (type) {
      case 'filter':
        return 'medium';
      case 'prioritize':
        return 'medium';
      case 'summarize':
        return 'high';
      case 'deduplicate':
        return 'low';
      case 'optimize':
        return 'high';
      default:
        return 'medium';
    }
  }

  private calculateDecisionImpact(decision: string, confidence: number): 'low' | 'medium' | 'high' {
    if (confidence < 0.5) return 'high'; // Low confidence decisions have high impact
    if (decision.toLowerCase().includes('remove') || decision.toLowerCase().includes('exclude')) {
      return 'high';
    }
    if (
      decision.toLowerCase().includes('prioritize') ||
      decision.toLowerCase().includes('optimize')
    ) {
      return 'medium';
    }
    return 'low';
  }

  private isReversibleDecision(decision: string): boolean {
    const irreversibleTerms = ['remove', 'delete', 'exclude', 'summarize'];
    return !irreversibleTerms.some((term) => decision.toLowerCase().includes(term));
  }

  private addSessionOperation(sessionId: string, operation: ProvenanceOperation): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.operations.push(operation);
    }
  }

  private logAudit(entry: AuditTrailEntry): void {
    this.auditLog.push(entry);

    // Keep only last 10000 entries to prevent memory issues
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-5000);
    }
  }

  private getSessionSources(session: TrackingSession): SourceRegistration[] {
    const sourceIds = session.operations
      .filter((op) => op.type === 'source_add')
      .map((op) => (op.data as { sourceId: string }).sourceId);

    return sourceIds
      .map((id) => this.sources.get(id))
      .filter((source): source is SourceRegistration => source !== undefined);
  }

  private getSessionTransformations(session: TrackingSession): TransformationRecord[] {
    const transformationIds = session.operations
      .filter((op) => op.type === 'content_transform')
      .map((op) => (op.data as { transformationId: string }).transformationId);

    return transformationIds
      .map((id) => this.transformations.get(id))
      .filter(
        (transformation): transformation is TransformationRecord => transformation !== undefined,
      );
  }

  private getSessionDecisions(session: TrackingSession): DecisionRecord[] {
    const decisionIds = session.operations
      .filter((op) => op.type === 'decision_make')
      .map((op) => (op.data as { decisionId: string }).decisionId);

    return decisionIds
      .map((id) => this.decisions.get(id))
      .filter((decision): decision is DecisionRecord => decision !== undefined);
  }

  private getSessionAuditTrail(session: TrackingSession): AuditTrailEntry[] {
    return this.auditLog.filter(
      (entry) =>
        entry.details &&
        typeof entry.details === 'object' &&
        'sessionId' in entry.details &&
        entry.details.sessionId === session.id,
    );
  }

  private calculateTrustScore(
    sources: SourceRegistration[],
    transformations: TransformationRecord[],
    decisions: DecisionRecord[],
  ): number {
    if (sources.length === 0) return 0;

    // Calculate average source reliability
    const avgSourceReliability =
      sources.reduce((sum, s) => sum + s.reliability, 0) / sources.length;

    // Calculate transformation confidence
    const avgTransformationConfidence =
      transformations.length > 0
        ? transformations.reduce((sum, t) => sum + t.confidence, 0) / transformations.length
        : 1.0;

    // Calculate decision confidence
    const avgDecisionConfidence =
      decisions.length > 0
        ? decisions.reduce((sum, d) => sum + d.confidence, 0) / decisions.length
        : 1.0;

    // Weighted trust score
    const trustScore =
      (avgSourceReliability * 0.5 +
        avgTransformationConfidence * 0.3 +
        avgDecisionConfidence * 0.2) *
      100;

    return Math.round(trustScore);
  }

  private convertToContentSource(source: SourceRegistration): ContentSource {
    return {
      id: source.id,
      type: source.type,
      location: source.location,
      timestamp: source.validatedAt,
      reliability: source.reliability * 100, // Convert to percentage
      contentHash: source.contentHash,
      metadata: source.metadata,
    };
  }

  private convertToContentTransformation(
    transformation: TransformationRecord,
  ): ContentTransformation {
    return {
      type: transformation.type,
      input: transformation.inputSources,
      output: [transformation.outputHash],
      parameters: transformation.parameters,
      duration: transformation.duration,
      timestamp: new Date(), // Transformation timestamp not stored separately
    };
  }

  private convertToProvenanceDecision(decision: DecisionRecord): ProvenanceDecision {
    return {
      decision: decision.decision,
      rationale: decision.rationale,
      alternatives: decision.alternatives.map((alt) => alt.option),
      confidence: decision.confidence * 100, // Convert to percentage
      timestamp: new Date(), // Decision timestamp not stored separately
      parameters: decision.metadata,
    };
  }

  private generateProvenanceSummary(
    sources: SourceRegistration[],
    transformations: TransformationRecord[],
    decisions: DecisionRecord[],
    auditTrail: AuditTrailEntry[],
  ): ProvenanceSummary {
    const sourceTypes = sources.reduce(
      (acc, source) => {
        acc[source.type] = (acc[source.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const transformationTypes = transformations.reduce(
      (acc, transformation) => {
        acc[transformation.type] = (acc[transformation.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const avgConfidence =
      [...transformations, ...decisions].reduce((sum, item) => sum + item.confidence, 0) /
      (transformations.length + decisions.length || 1);

    const timestamps = [
      ...sources.map((s) => s.validatedAt),
      ...auditTrail.map((a) => a.timestamp),
    ];
    const timespan = {
      start: new Date(Math.min(...timestamps.map((t) => t.getTime()))),
      end: new Date(Math.max(...timestamps.map((t) => t.getTime()))),
    };

    return {
      totalSources: sources.length,
      sourceTypes,
      totalTransformations: transformations.length,
      transformationTypes,
      totalDecisions: decisions.length,
      averageConfidence: avgConfidence * 100,
      trustScore: this.calculateTrustScore(sources, transformations, decisions),
      timespan,
    };
  }

  private generateRecommendations(summary: ProvenanceSummary): string[] {
    const recommendations: string[] = [];

    if (summary.trustScore < 70) {
      recommendations.push(
        'Consider improving source reliability or reducing high-risk transformations',
      );
    }

    if (summary.averageConfidence < 70) {
      recommendations.push('Review decision-making processes to improve confidence levels');
    }

    if (summary.totalTransformations > summary.totalSources * 2) {
      recommendations.push('High transformation-to-source ratio may indicate over-processing');
    }

    return recommendations;
  }

  private generateWarnings(
    sources: SourceRegistration[],
    transformations: TransformationRecord[],
    decisions: DecisionRecord[],
  ): ProvenanceWarning[] {
    const warnings: ProvenanceWarning[] = [];

    // Check for low-trust sources
    const lowTrustSources = sources.filter((s) => s.reliability < 0.5);
    if (lowTrustSources.length > 0) {
      warnings.push({
        type: 'low_trust',
        severity: 'warning',
        message: `${lowTrustSources.length} sources have low reliability scores`,
        affectedSources: lowTrustSources.map((s) => s.id),
        recommendation: 'Review and validate these sources or consider excluding them',
      });
    }

    // Check for missing transformations
    const orphanedSources = sources.filter(
      (source) => !transformations.some((t) => t.inputSources.includes(source.id)),
    );
    if (orphanedSources.length > sources.length * 0.3) {
      warnings.push({
        type: 'missing_source',
        severity: 'info',
        message: `${orphanedSources.length} sources are not used in any transformations`,
        affectedSources: orphanedSources.map((s) => s.id),
        recommendation: 'Consider whether these sources are necessary',
      });
    }

    return warnings;
  }

  /**
   * Clean up old sessions and data
   */
  cleanup(maxAge: number = 7 * 24 * 60 * 60 * 1000): void {
    // Default 7 days
    const cutoff = new Date(Date.now() - maxAge);

    // Clean up old sessions
    for (const [sessionId, session] of this.sessions) {
      if (session.startTime < cutoff && session.status === 'completed') {
        this.sessions.delete(sessionId);
      }
    }

    // Clean up old audit log entries
    this.auditLog = this.auditLog.filter((entry) => entry.timestamp >= cutoff);

    logger.info('[ProvenanceTracker] Cleaned up old data');
  }
}

export default ProvenanceTracker;
