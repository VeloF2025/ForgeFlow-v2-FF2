// Tests for Feature Extraction System
// Validates recency, proximity, affinity, semantic, and context features

import { describe, it, expect, beforeEach } from 'vitest';
import { SmartFeatureExtractor } from '../feature-extractor.js';
import { RetrievalQuery, SearchContext, RetrievalConfig } from '../types.js';
import { IndexEntry, IndexContentType } from '../../indexing/types.js';

describe('SmartFeatureExtractor', () => {
  const mockConfig: RetrievalConfig['features'] = {
    enableRecencyFeatures: true,
    enableProximityFeatures: true,
    enableAffinityFeatures: true,
    enableSemanticFeatures: true,
    enableContextFeatures: true,
    
    featureWeights: {
      titleMatch: 0.25,
      contentMatch: 0.18,
      proximity: 0.15,
      recency: 0.12,
      affinity: 0.12,
      semantic: 0.10,
      context: 0.08
    },
    
    normalizeFeatures: true,
    scalingMethod: 'minmax'
  };

  let extractor: SmartFeatureExtractor;
  let mockQuery: RetrievalQuery;
  let mockContent: IndexEntry;

  beforeEach(() => {
    extractor = new SmartFeatureExtractor(mockConfig);

    mockQuery = {
      query: 'authentication error handling',
      context: {
        projectId: 'test-project',
        agentTypes: ['code-implementer'],
        preferredLanguages: ['typescript', 'javascript'],
        expertiseLevel: 'intermediate',
        recentQueries: ['login issues', 'auth flow'],
        recentResults: [],
        successfulPatterns: ['jwt', 'oauth'],
        timestamp: new Date(),
        currentIssue: {
          id: 'issue-123',
          title: 'Fix authentication errors',
          labels: ['bug', 'authentication', 'critical'],
          description: 'Users experiencing auth failures'
        },
        repositoryUrl: 'https://github.com/test/repo',
        activeBranch: 'feature/auth-fix',
        workingHours: true
      }
    };

    mockContent = {
      id: 'content-1',
      type: 'knowledge' as IndexContentType,
      title: 'Authentication Best Practices',
      content: 'This guide covers authentication patterns, error handling, and security considerations. Use JWT tokens for stateless auth...',
      path: '/docs/auth-guide.md',
      metadata: {
        tags: ['authentication', 'security', 'jwt'],
        category: 'security',
        projectId: 'test-project',
        agentTypes: ['code-implementer', 'security-auditor'],
        difficulty: 'medium',
        scope: 'global',
        effectiveness: 0.85,
        severity: undefined,
        status: undefined,
        usageCount: 25,
        lastUsed: new Date('2024-01-15'),
        successRate: 0.9,
        fileSize: 1024,
        language: 'markdown',
        extension: '.md',
        relatedIds: ['content-2', 'content-3'],
        parentId: undefined,
        childIds: []
      },
      lastModified: new Date('2024-01-10'),
      searchVector: undefined
    };
  });

  describe('Feature Extraction', () => {
    it('should extract complete feature vector', async () => {
      const features = await extractor.extractFeatures(mockQuery, mockContent);

      expect(features).toBeDefined();
      expect(features.basic).toBeDefined();
      expect(features.recency).toBeDefined();
      expect(features.proximity).toBeDefined();
      expect(features.affinity).toBeDefined();
      expect(features.semantic).toBeDefined();
      expect(features.context).toBeDefined();
      expect(features.derived).toBeDefined();
    });

    it('should handle batch feature extraction', async () => {
      const contents = [mockContent, { ...mockContent, id: 'content-2' }];
      const features = await extractor.extractBatchFeatures(mockQuery, contents);

      expect(features).toHaveLength(2);
      expect(features[0].basic).toBeDefined();
      expect(features[1].basic).toBeDefined();
    });

    it('should respect feature enable/disable flags', async () => {
      const disabledConfig = {
        ...mockConfig,
        enableRecencyFeatures: false,
        enableSemanticFeatures: false
      };
      
      const disabledExtractor = new SmartFeatureExtractor(disabledConfig);
      const features = await disabledExtractor.extractFeatures(mockQuery, mockContent);

      // Should have empty/default values for disabled features
      expect(features.recency.daysSinceCreated).toBe(0);
      expect(features.recency.daysSinceModified).toBe(0);
      expect(features.semantic.complexityScore).toBe(0.5); // Default value
    });
  });

  describe('Basic Features', () => {
    it('should calculate text match scores accurately', async () => {
      const features = await extractor.extractFeatures(mockQuery, mockContent);

      expect(features.basic.titleMatchScore).toBeGreaterThan(0);
      expect(features.basic.contentMatchScore).toBeGreaterThan(0);
      expect(features.basic.titleMatchScore).toBeLessThanOrEqual(1);
      expect(features.basic.contentMatchScore).toBeLessThanOrEqual(1);
    });

    it('should detect exact phrase matches', async () => {
      const exactMatchContent = {
        ...mockContent,
        title: 'Authentication error handling guide',
        content: 'This covers authentication error handling in detail'
      };

      const features = await extractor.extractFeatures(mockQuery, exactMatchContent);
      
      // Should have high match scores due to exact phrase match
      expect(features.basic.titleMatchScore).toBeGreaterThan(0.8);
    });

    it('should handle tag matches', async () => {
      const taggedContent = {
        ...mockContent,
        metadata: {
          ...mockContent.metadata,
          tags: ['authentication', 'error-handling', 'troubleshooting']
        }
      };

      const features = await extractor.extractFeatures(mockQuery, taggedContent);
      expect(features.basic.tagMatchScore).toBeGreaterThan(0);
    });

    it('should detect category matches', async () => {
      const categoryQuery = {
        ...mockQuery,
        query: 'security patterns'
      };

      const features = await extractor.extractFeatures(categoryQuery, mockContent);
      expect(features.basic.categoryMatch).toBe(true);
    });
  });

  describe('Recency Features', () => {
    it('should calculate time-based features correctly', () => {
      const now = new Date();
      const oldContent = {
        ...mockContent,
        lastModified: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        metadata: {
          ...mockContent.metadata,
          lastUsed: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
        }
      };

      const recencyFeatures = extractor.extractRecencyFeatures(oldContent);

      expect(recencyFeatures.daysSinceModified).toBeCloseTo(30, 1);
      expect(recencyFeatures.daysSinceLastUsed).toBeCloseTo(7, 1);
      expect(recencyFeatures.modificationDecay).toBeLessThan(0.5);
      expect(recencyFeatures.usageDecay).toBeGreaterThan(0.3);
    });

    it('should identify recent activity patterns', () => {
      const recentContent = {
        ...mockContent,
        lastModified: new Date(),
        metadata: {
          ...mockContent.metadata,
          lastUsed: new Date()
        }
      };

      const recencyFeatures = extractor.extractRecencyFeatures(recentContent);

      expect(recencyFeatures.isRecentlyActive).toBe(true);
      expect(recencyFeatures.hasRecentUpdates).toBe(true);
      expect(recencyFeatures.creationDecay).toBeCloseTo(1, 1);
    });

    it('should extract temporal patterns', () => {
      const timestampedContent = {
        ...mockContent,
        lastModified: new Date('2024-01-15T14:30:00Z') // Monday 2:30 PM
      };

      const recencyFeatures = extractor.extractRecencyFeatures(timestampedContent);

      expect(recencyFeatures.weekdayCreated).toBeGreaterThanOrEqual(0);
      expect(recencyFeatures.weekdayCreated).toBeLessThanOrEqual(1);
      expect(recencyFeatures.hourCreated).toBeGreaterThanOrEqual(0);
      expect(recencyFeatures.hourCreated).toBeLessThanOrEqual(1);
    });
  });

  describe('Proximity Features', () => {
    it('should calculate word overlap ratios', () => {
      const query = { ...mockQuery, query: 'authentication security jwt tokens' };
      const content = {
        ...mockContent,
        title: 'JWT Authentication Security Guide',
        content: 'Comprehensive guide on JWT tokens and authentication security practices'
      };

      const proximityFeatures = extractor.extractProximityFeatures(query, content);

      expect(proximityFeatures.wordOverlapRatio).toBeGreaterThan(0.5);
      expect(proximityFeatures.exactPhraseMatch).toBe(false); // No exact phrase
    });

    it('should detect exact phrase matches', () => {
      const query = { ...mockQuery, query: 'authentication security' };
      const content = {
        ...mockContent,
        title: 'Authentication Security Best Practices'
      };

      const proximityFeatures = extractor.extractProximityFeatures(query, content);
      expect(proximityFeatures.exactPhraseMatch).toBe(true);
    });

    it('should calculate semantic similarity metrics', () => {
      const proximityFeatures = extractor.extractProximityFeatures(mockQuery, mockContent);

      expect(proximityFeatures.cosineSimilarity).toBeGreaterThanOrEqual(0);
      expect(proximityFeatures.cosineSimilarity).toBeLessThanOrEqual(1);
      expect(proximityFeatures.jaccardSimilarity).toBeGreaterThanOrEqual(0);
      expect(proximityFeatures.jaccardSimilarity).toBeLessThanOrEqual(1);
    });

    it('should calculate field-specific proximity scores', () => {
      const proximityFeatures = extractor.extractProximityFeatures(mockQuery, mockContent);

      expect(proximityFeatures.titleProximity).toBeGreaterThanOrEqual(0);
      expect(proximityFeatures.contentProximity).toBeGreaterThanOrEqual(0);
      expect(proximityFeatures.tagsProximity).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Affinity Features', () => {
    it('should calculate agent type relevance', () => {
      const query = {
        ...mockQuery,
        context: {
          ...mockQuery.context,
          agentTypes: ['code-implementer', 'security-auditor']
        }
      };

      const affinityFeatures = extractor.extractAffinityFeatures(query.context, mockContent);

      // Should have high relevance since agent types match
      expect(affinityFeatures.agentTypeRelevance).toBeGreaterThan(0.8);
    });

    it('should assess project relevance', () => {
      const sameProjectContent = {
        ...mockContent,
        metadata: {
          ...mockContent.metadata,
          projectId: 'test-project' // Same as query
        }
      };

      const affinityFeatures = extractor.extractAffinityFeatures(mockQuery.context, sameProjectContent);
      expect(affinityFeatures.projectRelevance).toBe(1.0);

      const differentProjectContent = {
        ...mockContent,
        metadata: {
          ...mockContent.metadata,
          projectId: 'other-project'
        }
      };

      const affinityFeatures2 = extractor.extractAffinityFeatures(mockQuery.context, differentProjectContent);
      expect(affinityFeatures2.projectRelevance).toBeLessThan(1.0);
    });

    it('should evaluate complexity fit based on expertise level', () => {
      const beginnerContext = {
        ...mockQuery.context,
        expertiseLevel: 'beginner' as const
      };

      const highComplexityContent = {
        ...mockContent,
        metadata: {
          ...mockContent.metadata,
          difficulty: 'high' as const
        }
      };

      const affinityFeatures = extractor.extractAffinityFeatures(beginnerContext, highComplexityContent);
      expect(affinityFeatures.complexityFit).toBeLessThan(0.5);
    });

    it('should consider language preferences', () => {
      const jsContent = {
        ...mockContent,
        metadata: {
          ...mockContent.metadata,
          language: 'javascript'
        }
      };

      const affinityFeatures = extractor.extractAffinityFeatures(mockQuery.context, jsContent);
      expect(affinityFeatures.languagePreference).toBeGreaterThan(0.7);
    });
  });

  describe('Semantic Features', () => {
    it('should extract content characteristics', () => {
      const codeContent = {
        ...mockContent,
        content: `
          # Authentication Guide
          
          Here's how to implement JWT authentication:
          
          \`\`\`typescript
          function authenticate(token: string) {
            return jwt.verify(token, secret);
          }
          \`\`\`
          
          ![Authentication Flow](auth-diagram.png)
          
          For more info, see https://jwt.io
        `
      };

      const semanticFeatures = extractor.extractSemanticFeatures(codeContent);

      expect(semanticFeatures.hasCodeExamples).toBe(true);
      expect(semanticFeatures.hasImageDiagrams).toBe(true);
      expect(semanticFeatures.hasExternalLinks).toBe(true);
      expect(semanticFeatures.documentLength).toBeGreaterThan(0);
    });

    it('should calculate complexity scores', () => {
      const complexContent = {
        ...mockContent,
        content: 'Complex async function implementation with Promise chaining, error handling, try-catch blocks, and advanced algorithms for optimization and architecture patterns'
      };

      const semanticFeatures = extractor.extractSemanticFeatures(complexContent);
      expect(semanticFeatures.complexityScore).toBeGreaterThan(0.3);
    });

    it('should assess readability', () => {
      const readableContent = {
        ...mockContent,
        content: 'This is a simple guide. It has short sentences. Each sentence is easy to understand.'
      };

      const unreadableContent = {
        ...mockContent,
        content: 'This extraordinarily comprehensive and extensively detailed documentation encompasses numerous sophisticated methodologies and advanced architectural considerations.'
      };

      const readableFeatures = extractor.extractSemanticFeatures(readableContent);
      const unreadableFeatures = extractor.extractSemanticFeatures(unreadableContent);

      expect(readableFeatures.readabilityScore).toBeGreaterThan(unreadableFeatures.readabilityScore);
    });

    it('should determine topic purity', () => {
      const focusedContent = {
        ...mockContent,
        content: 'authentication auth login user password security secure token jwt'
      };

      const unfocusedContent = {
        ...mockContent,
        content: 'authentication database performance UI design testing deployment monitoring analytics'
      };

      const focusedFeatures = extractor.extractSemanticFeatures(focusedContent);
      const unfocusedFeatures = extractor.extractSemanticFeatures(unfocusedContent);

      expect(focusedFeatures.topicPurity).toBeGreaterThan(unfocusedFeatures.topicPurity);
    });
  });

  describe('Context Features', () => {
    it('should calculate issue relevance', () => {
      const relevantContent = {
        ...mockContent,
        title: 'Fix authentication errors and bugs',
        content: 'Guide for fixing critical authentication issues'
      };

      const contextFeatures = extractor.extractContextFeatures(mockQuery.context, relevantContent);
      expect(contextFeatures.issueRelevance).toBeGreaterThan(0.5);
    });

    it('should assess temporal context', () => {
      const workingHoursContext = {
        ...mockQuery.context,
        workingHours: true
      };

      const contextFeatures = extractor.extractContextFeatures(workingHoursContext, mockContent);
      expect(contextFeatures.isWorkingHours).toBe(true);
      expect(contextFeatures.timeOfDay).toBeGreaterThanOrEqual(0);
      expect(contextFeatures.timeOfDay).toBeLessThanOrEqual(1);
    });

    it('should evaluate urgency matching', () => {
      const urgentContext = {
        ...mockQuery.context,
        currentIssue: {
          id: 'urgent-issue',
          title: 'Critical production bug',
          labels: ['critical', 'urgent', 'production'],
          description: 'System is down'
        }
      };

      const urgentContent = {
        ...mockContent,
        metadata: {
          ...mockContent.metadata,
          severity: 'critical' as const,
          tags: ['urgent', 'hotfix', 'production']
        }
      };

      const contextFeatures = extractor.extractContextFeatures(urgentContext, urgentContent);
      expect(contextFeatures.urgencyMatch).toBeGreaterThan(0.8);
    });

    it('should track session and query context', () => {
      const sessionContext = {
        ...mockQuery.context,
        recentQueries: ['login', 'auth', 'security', 'user management']
      };

      const contextFeatures = extractor.extractContextFeatures(sessionContext, mockContent);
      expect(contextFeatures.queryPosition).toBeGreaterThan(0);
      expect(contextFeatures.queryComplexity).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Derived Features', () => {
    it('should calculate overall relevance score', async () => {
      const features = await extractor.extractFeatures(mockQuery, mockContent);

      expect(features.derived.overallRelevance).toBeGreaterThanOrEqual(0);
      expect(features.derived.overallRelevance).toBeLessThanOrEqual(1);
    });

    it('should assess uncertainty levels', async () => {
      const ambiguousQuery = {
        ...mockQuery,
        query: 'stuff things problems'
      };

      const vagueContent = {
        ...mockContent,
        title: 'General Guide',
        content: 'Some information about various topics'
      };

      const features = await extractor.extractFeatures(ambiguousQuery, vagueContent);
      expect(features.derived.uncertaintyScore).toBeGreaterThan(0.3);
    });

    it('should measure content novelty', async () => {
      const novelContent = {
        ...mockContent,
        lastModified: new Date(), // Very recent
        metadata: {
          ...mockContent.metadata,
          usageCount: 1 // Rarely used
        }
      };

      const features = await extractor.extractFeatures(mockQuery, novelContent);
      expect(features.derived.noveltyScore).toBeGreaterThan(0.3);
    });
  });

  describe('Normalization and Scaling', () => {
    it('should normalize features when enabled', async () => {
      const features = await extractor.extractFeatures(mockQuery, mockContent);

      // All derived features should be normalized to [0, 1]
      expect(features.derived.overallRelevance).toBeGreaterThanOrEqual(0);
      expect(features.derived.overallRelevance).toBeLessThanOrEqual(1);
      expect(features.derived.uncertaintyScore).toBeGreaterThanOrEqual(0);
      expect(features.derived.uncertaintyScore).toBeLessThanOrEqual(1);
    });

    it('should handle batch scaling correctly', async () => {
      const contents = Array.from({ length: 5 }, (_, i) => ({
        ...mockContent,
        id: `content-${i}`,
        title: `Test Content ${i}`
      }));

      const features = await extractor.extractBatchFeatures(mockQuery, contents);
      
      expect(features).toHaveLength(5);
      features.forEach(feature => {
        expect(feature.derived.overallRelevance).toBeGreaterThanOrEqual(0);
        expect(feature.derived.overallRelevance).toBeLessThanOrEqual(1);
      });
    });

    it('should apply different scaling methods', () => {
      const minMaxConfig = { ...mockConfig, scalingMethod: 'minmax' as const };
      const zScoreConfig = { ...mockConfig, scalingMethod: 'zscore' as const };

      const minMaxExtractor = new SmartFeatureExtractor(minMaxConfig);
      const zScoreExtractor = new SmartFeatureExtractor(zScoreConfig);

      expect(minMaxExtractor).toBeDefined();
      expect(zScoreExtractor).toBeDefined();
    });
  });

  describe('Performance and Caching', () => {
    it('should handle large batch processing efficiently', async () => {
      const startTime = Date.now();
      const largeContentSet = Array.from({ length: 100 }, (_, i) => ({
        ...mockContent,
        id: `content-${i}`,
        title: `Content ${i}`,
        content: `This is test content number ${i} with various keywords and patterns.`
      }));

      const features = await extractor.extractBatchFeatures(mockQuery, largeContentSet);
      const endTime = Date.now();

      expect(features).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete in under 5 seconds
    });

    it('should cache semantic features for repeated content', async () => {
      // First extraction
      const startTime1 = Date.now();
      await extractor.extractFeatures(mockQuery, mockContent);
      const duration1 = Date.now() - startTime1;

      // Second extraction (should be faster due to caching)
      const startTime2 = Date.now();
      await extractor.extractFeatures(mockQuery, mockContent);
      const duration2 = Date.now() - startTime2;

      expect(duration2).toBeLessThanOrEqual(duration1);
    });

    it('should handle concurrent feature extraction', async () => {
      const promises = Array.from({ length: 10 }, (_, i) => 
        extractor.extractFeatures(mockQuery, {
          ...mockContent,
          id: `concurrent-${i}`
        })
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.basic).toBeDefined();
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty content gracefully', async () => {
      const emptyContent = {
        ...mockContent,
        title: '',
        content: '',
        metadata: {
          ...mockContent.metadata,
          tags: []
        }
      };

      const features = await extractor.extractFeatures(mockQuery, emptyContent);
      
      expect(features).toBeDefined();
      expect(features.basic.titleMatchScore).toBe(0);
      expect(features.basic.contentMatchScore).toBe(0);
      expect(features.basic.tagMatchScore).toBe(0);
    });

    it('should handle malformed metadata', async () => {
      const malformedContent = {
        ...mockContent,
        metadata: {
          ...mockContent.metadata,
          tags: undefined as any,
          category: null as any,
          effectiveness: -1 // Invalid value
        }
      };

      const features = await extractor.extractFeatures(mockQuery, malformedContent);
      expect(features).toBeDefined();
      // Should not throw errors and provide sensible defaults
    });

    it('should handle very long content', async () => {
      const longContent = {
        ...mockContent,
        content: 'word '.repeat(10000) // 50KB of repeated content
      };

      const features = await extractor.extractFeatures(mockQuery, longContent);
      
      expect(features).toBeDefined();
      expect(features.semantic.documentLength).toBeGreaterThan(40000);
    });

    it('should handle special characters and Unicode', async () => {
      const unicodeContent = {
        ...mockContent,
        title: '认证错误处理 🔐 Authentication Führer Guide',
        content: 'Ümlauts and émojis in content 中文 العربية русский'
      };

      const features = await extractor.extractFeatures(mockQuery, unicodeContent);
      expect(features).toBeDefined();
      expect(features.basic.titleMatchScore).toBeGreaterThanOrEqual(0);
    });

    it('should validate feature vector completeness', async () => {
      const features = await extractor.extractFeatures(mockQuery, mockContent);

      // Ensure all required feature categories are present
      const requiredCategories = ['basic', 'recency', 'proximity', 'affinity', 'semantic', 'context', 'derived'];
      requiredCategories.forEach(category => {
        expect(features[category as keyof typeof features]).toBeDefined();
      });

      // Ensure derived features are properly calculated
      expect(typeof features.derived.overallRelevance).toBe('number');
      expect(typeof features.derived.uncertaintyScore).toBe('number');
      expect(typeof features.derived.noveltyScore).toBe('number');
    });
  });
});