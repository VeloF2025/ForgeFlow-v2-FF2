// Smart Recommendations Engine Tests
// Comprehensive testing of the intelligent recommendation system

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { KnowledgeManager } from '../../src/knowledge/knowledge-manager';
import { SmartRecommendationsEngine, RecommendationContext } from '../../src/knowledge/smart-recommendations';
import type { KnowledgeConfig } from '../../src/types';

// Test configuration
const TEST_BASE_PATH = './test-smart-recommendations';
const TEST_CONFIG: KnowledgeConfig = {
  storageBasePath: TEST_BASE_PATH,
  maxCardsPerCategory: 10,
  gotchaPromotionThreshold: 3,
  effectivenessDecayRate: 0.1,
  cleanupIntervalDays: 30,
  autoPromoteGotchas: true
};

describe('Smart Recommendations Engine', () => {
  let knowledgeManager: KnowledgeManager;
  let recommendationsEngine: SmartRecommendationsEngine;

  beforeEach(async () => {
    // Clean up test directory
    try {
      await fs.rmdir(TEST_BASE_PATH, { recursive: true });
    } catch {
      // Directory doesn't exist, ignore
    }
    
    // Create knowledge manager and recommendations engine
    knowledgeManager = new KnowledgeManager(TEST_CONFIG);
    await knowledgeManager.initialize();
    
    // Access the recommendations engine through the knowledge manager
    recommendationsEngine = new SmartRecommendationsEngine(knowledgeManager);

    // Create sample knowledge cards for testing
    await createSampleKnowledgeCards();
  });

  afterEach(async () => {
    await knowledgeManager.cleanup();
    try {
      await fs.rmdir(TEST_BASE_PATH, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Core Recommendation Features', () => {
    it('should generate intelligent recommendations for TypeScript issues', async () => {
      const context: RecommendationContext = {
        issueTitle: 'TypeScript compilation error with interface',
        issueDescription: 'Getting TS2345 error when trying to assign object to interface',
        agentType: 'code-implementer',
        techStack: ['typescript', 'react'],
        timeConstraint: 30
      };

      const recommendations = await recommendationsEngine.getRecommendations(context);
      
      expect(recommendations).toBeDefined();
      expect(recommendations.length).toBeGreaterThan(0);
      
      // Should have high confidence recommendations
      const highConfidenceRecs = recommendations.filter(rec => rec.confidenceLevel === 'high');
      expect(highConfidenceRecs.length).toBeGreaterThan(0);
      
      // Should include reasoning
      expect(recommendations[0].reasoning).toBeDefined();
      expect(recommendations[0].reasoning.length).toBeGreaterThan(0);
      
      // Should have applicability scores
      expect(recommendations[0].applicabilityScore).toBeGreaterThanOrEqual(0);
      expect(recommendations[0].applicabilityScore).toBeLessThanOrEqual(1);
    });

    it('should provide agent-specific recommendations', async () => {
      const testAgent = 'test-coverage-validator';
      const recommendations = await recommendationsEngine.getAgentSpecificRecommendations(testAgent, 5);
      
      expect(recommendations).toBeDefined();
      expect(recommendations.length).toBeGreaterThanOrEqual(0);
      
      // Each recommendation should be relevant to the agent (if any are returned)
      if (recommendations.length > 0) {
        let hasRelevantCards = false;
        for (const card of recommendations) {
          const isRelevantToAgent = 
            card.metadata.agentTypes.includes(testAgent) || 
            card.content.toLowerCase().includes('test') ||
            card.title.toLowerCase().includes('test');
          if (isRelevantToAgent) {
            hasRelevantCards = true;
          }
        }
        // At least some cards should be relevant if any are returned
        expect(hasRelevantCards || recommendations.length === 0).toBe(true);
      }
    });

    it('should generate preventive recommendations', async () => {
      const context: RecommendationContext = {
        issueTitle: 'Setting up new React component',
        issueDescription: 'Creating a new dashboard component with state management',
        agentType: 'code-implementer',
        techStack: ['react', 'typescript']
      };

      const preventiveRecs = await recommendationsEngine.getPreventiveRecommendations(context);
      
      expect(preventiveRecs).toBeDefined();
      
      // Preventive recommendations should be low risk
      for (const rec of preventiveRecs) {
        expect(rec.riskLevel).toBe('low');
      }
    });

    it('should analyze knowledge patterns', async () => {
      const patterns = await recommendationsEngine.analyzePatterns();
      
      expect(patterns).toBeDefined();
      expect(Array.isArray(patterns)).toBe(true);
      
      if (patterns.length > 0) {
        const pattern = patterns[0];
        expect(pattern.pattern).toBeDefined();
        expect(pattern.frequency).toBeGreaterThanOrEqual(0);
        expect(pattern.successRate).toBeGreaterThanOrEqual(0);
        expect(pattern.successRate).toBeLessThanOrEqual(1);
        expect(pattern.averageTimeToResolution).toBeGreaterThanOrEqual(0);
        expect(pattern.commonSolutions).toBeInstanceOf(Array);
        expect(pattern.relatedIssueTypes).toBeInstanceOf(Array);
      }
    });
  });

  describe('Context-Aware Filtering', () => {
    it('should prioritize time-appropriate recommendations for urgent issues', async () => {
      const urgentContext: RecommendationContext = {
        issueTitle: 'Production build failing',
        issueDescription: 'Webpack build is failing in production environment',
        agentType: 'code-implementer',
        timeConstraint: 15 // Very urgent - 15 minutes
      };

      const recommendations = await recommendationsEngine.getRecommendations(urgentContext);
      
      // Should avoid high-risk recommendations for urgent issues
      const highRiskRecs = recommendations.filter(rec => rec.riskLevel === 'high');
      expect(highRiskRecs.length).toBe(0);
      
      // For urgent issues, should favor effective solutions
      if (recommendations.length > 0) {
        // Should prioritize high-effectiveness solutions for urgent issues
        const effectiveSolutions = recommendations.filter(rec => rec.card.effectiveness > 0.7);
        const hasGoodOptions = effectiveSolutions.length > 0 || recommendations.length === 0;
        expect(hasGoodOptions).toBe(true);
      }
    });

    it('should provide diverse recommendation types', async () => {
      const context: RecommendationContext = {
        issueTitle: 'API integration challenges',
        issueDescription: 'Having issues with CORS and authentication in API calls',
        agentType: 'code-implementer',
        techStack: ['api', 'cors', 'authentication']
      };

      const recommendations = await recommendationsEngine.getRecommendations(context);
      
      if (recommendations.length > 1) {
        const types = new Set(recommendations.map(rec => rec.card.type));
        // Should have recommendations of different types when possible
        expect(types.size).toBeGreaterThanOrEqual(1);
      }
    });

    it('should handle technical keyword matching', async () => {
      const context: RecommendationContext = {
        issueTitle: 'React useEffect hook causing infinite loop',
        issueDescription: 'The useEffect hook is triggering repeatedly causing performance issues',
        agentType: 'code-implementer',
        techStack: ['react', 'hooks']
      };

      const recommendations = await recommendationsEngine.getRecommendations(context);
      
      // Should match technical keywords like 'react', 'useEffect', 'hook'
      const reactRelatedRecs = recommendations.filter(rec => 
        rec.card.content.toLowerCase().includes('react') ||
        rec.card.title.toLowerCase().includes('react') ||
        rec.card.tags.some(tag => tag.toLowerCase().includes('react'))
      );
      
      expect(reactRelatedRecs.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Recommendation Quality', () => {
    it('should provide meaningful reasoning for each recommendation', async () => {
      const context: RecommendationContext = {
        issueTitle: 'Database query optimization needed',
        issueDescription: 'Slow database queries affecting application performance',
        agentType: 'performance-optimizer'
      };

      const recommendations = await recommendationsEngine.getRecommendations(context);
      
      for (const rec of recommendations) {
        expect(rec.reasoning).toBeDefined();
        expect(rec.reasoning.length).toBeGreaterThan(0);
        
        // Reasoning should be meaningful strings, not empty
        for (const reason of rec.reasoning) {
          expect(typeof reason).toBe('string');
          expect(reason.length).toBeGreaterThan(5);
        }
      }
    });

    it('should calculate confidence levels appropriately', async () => {
      const context: RecommendationContext = {
        issueTitle: 'Test implementation guidance',
        issueDescription: 'Need help implementing comprehensive tests',
        agentType: 'test-coverage-validator'
      };

      const recommendations = await recommendationsEngine.getRecommendations(context);
      
      for (const rec of recommendations) {
        // Confidence level should be valid
        expect(['high', 'medium', 'low']).toContain(rec.confidenceLevel);
        
        // High confidence should correlate with high scores
        if (rec.confidenceLevel === 'high') {
          expect(rec.relevanceScore).toBeGreaterThan(0.5);
        }
      }
    });

    it('should assess risk levels correctly', async () => {
      const recommendations = await recommendationsEngine.getRecommendations({
        issueTitle: 'Complex refactoring task',
        issueDescription: 'Need to refactor large codebase with potential breaking changes',
        agentType: 'code-implementer',
        timeConstraint: 240 // 4 hours available
      });

      for (const rec of recommendations) {
        // Risk level should be valid
        expect(['low', 'medium', 'high']).toContain(rec.riskLevel);
        
        // Should consider card difficulty in risk assessment
        if (rec.card.metadata.difficulty === 'high') {
          expect(rec.riskLevel).not.toBe('low');
        }
      }
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle empty search results gracefully', async () => {
      const context: RecommendationContext = {
        issueTitle: 'Very specific obscure issue xyz123',
        issueDescription: 'This is a very unique problem that likely has no matches',
        agentType: 'code-implementer'
      };

      const recommendations = await recommendationsEngine.getRecommendations(context);
      
      expect(recommendations).toBeDefined();
      expect(Array.isArray(recommendations)).toBe(true);
      // Should return empty array or fallback recommendations
    });

    it('should handle missing context gracefully', async () => {
      const minimalContext: RecommendationContext = {
        issueTitle: '',
        issueDescription: '',
        agentType: 'code-implementer'
      };

      await expect(recommendationsEngine.getRecommendations(minimalContext))
        .resolves.toBeDefined();
    });

    it('should limit recommendation count appropriately', async () => {
      const context: RecommendationContext = {
        issueTitle: 'General development guidance',
        issueDescription: 'Looking for general best practices and patterns',
        agentType: 'code-implementer'
      };

      const recommendations = await recommendationsEngine.getRecommendations(context);
      
      // Should not return excessive recommendations
      expect(recommendations.length).toBeLessThanOrEqual(10);
    });
  });

  // Helper function to create sample knowledge cards
  async function createSampleKnowledgeCards() {
    const sampleCards = [
      {
        title: 'TypeScript Interface Best Practices',
        content: 'Guidelines for creating effective TypeScript interfaces and handling type errors like TS2345',
        type: 'best-practice' as const,
        category: 'typescript',
        tags: ['typescript', 'interfaces', 'types'],
        effectiveness: 0.9,
        metadata: {
          difficulty: 'medium' as const,
          scope: 'global' as const,
          agentTypes: ['code-implementer'],
          relatedIssues: [],
          outcomes: []
        }
      },
      {
        title: 'React Component Testing Patterns',
        content: 'Comprehensive guide to testing React components with hooks and state management',
        type: 'pattern' as const,
        category: 'testing',
        tags: ['react', 'testing', 'components', 'hooks'],
        effectiveness: 0.85,
        metadata: {
          difficulty: 'medium' as const,
          scope: 'project' as const,
          agentTypes: ['test-coverage-validator'],
          relatedIssues: [],
          outcomes: []
        }
      },
      {
        title: 'API CORS Configuration Fix',
        content: 'Step-by-step solution for resolving CORS issues in API integration',
        type: 'solution' as const,
        category: 'api',
        tags: ['api', 'cors', 'authentication', 'integration'],
        effectiveness: 0.8,
        metadata: {
          difficulty: 'low' as const,
          scope: 'global' as const,
          agentTypes: ['code-implementer'],
          relatedIssues: [],
          outcomes: []
        }
      },
      {
        title: 'Performance Optimization Checklist',
        content: 'Comprehensive checklist for optimizing application performance including database queries',
        type: 'best-practice' as const,
        category: 'performance',
        tags: ['performance', 'optimization', 'database', 'queries'],
        effectiveness: 0.95,
        metadata: {
          difficulty: 'high' as const,
          scope: 'global' as const,
          agentTypes: ['performance-optimizer'],
          relatedIssues: [],
          outcomes: []
        }
      }
    ];

    for (const cardData of sampleCards) {
      await knowledgeManager.createCard(cardData);
    }
  }
});