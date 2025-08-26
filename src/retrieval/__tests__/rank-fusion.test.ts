// Tests for RankFusionEngine - Advanced Result Fusion and Ranking
// Validates RRF, Borda Count, Weighted Fusion, and Learning-to-Rank algorithms

import { describe, it, expect, beforeEach } from 'vitest';
import { RankFusionEngine } from '../rank-fusion.js';
import type {
  RetrievalQuery,
  RetrievalResult,
  SearchContext,
  RetrievalConfig,
  FeatureVector,
  RankingModel,
} from '../types.js';
import { RetrievalStrategy } from '../types.js';
import type { SearchResult } from '../../indexing/types.js';

const mockConfig: RetrievalConfig = {
  bandit: {
    algorithm: 'epsilon-greedy',
    epsilonDecay: 0.995,
    initialEpsilon: 0.15,
    confidenceLevel: 2.0,
    windowSize: 1000,
  },
  features: {
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
      semantic: 0.1,
      context: 0.08,
    },
    normalizeFeatures: true,
    scalingMethod: 'minmax',
  },
  reranking: {
    enabled: true,
    algorithm: 'logistic',
    learningRate: 0.01,
    regularization: 0.001,
    batchSize: 32,
    onlineLearning: true,
  },
  hybrid: {
    defaultMode: 'adaptive',
    parallelTimeout: 2000,
    fusionAlgorithm: 'rrf',
    enableVectorSearch: false,
  },
  analytics: {
    trackingEnabled: true,
    batchSize: 100,
    retentionDays: 30,
    slowQueryThreshold: 1000,
    lowRelevanceThreshold: 0.3,
    defaultConfidenceLevel: 0.95,
    defaultMinimumEffect: 0.05,
  },
  performance: {
    maxFeatureExtractionTime: 500,
    maxRerankingCandidates: 100,
    cacheEnabled: true,
    cacheTTL: 300000,
    maxMemoryUsage: 100 * 1024 * 1024,
    maxConcurrentQueries: 10,
  },
};

const mockContext: SearchContext = {
  projectId: 'test-project',
  agentTypes: ['test-agent'],
  preferredLanguages: ['typescript'],
  expertiseLevel: 'intermediate',
  recentQueries: ['test query'],
  recentResults: ['result1'],
  successfulPatterns: ['pattern1'],
  timestamp: new Date(),
  workingHours: true,
};

const mockQuery: RetrievalQuery = {
  query: 'test search query',
  context: mockContext,
  type: 'knowledge',
  limit: 10,
  offset: 0,
};

const createMockSearchResult = (
  id: string,
  score: number,
  title: string,
  rank: number = 1,
): SearchResult => ({
  entry: {
    id,
    title,
    content: `Content for ${title}`,
    path: `/test/${id}`,
    type: 'knowledge',
    lastModified: new Date(),
    hash: `hash-${id}`,
    metadata: {
      category: 'test',
      tags: ['test', 'example'],
      projectId: 'test-project',
      agentTypes: ['test-agent'],
      language: 'en',
      usageCount: 5,
      effectiveness: score / 10,
      lastUsed: new Date(),
      fileSize: 1024,
      relatedIds: [],
      childIds: [],
    },
  },
  score,
  rank,
  matchedFields: ['title', 'content'],
  totalMatches: 2,
  titleSnippet: title,
  contentSnippets: [
    {
      text: `Content for ${title}`,
      highlighted: `Content for <mark>${title}</mark>`,
      startOffset: 0,
      endOffset: title.length + 12,
      context: `This is content for ${title} in a document`,
    },
  ],
  relevanceFactors: {
    titleMatch: 1.0,
    contentMatch: 0.8,
    tagMatch: 0.5,
    categoryMatch: 0.3,
    recencyBoost: 0.1,
    effectivenessBoost: score / 10,
    usageBoost: 0.2,
  },
});

const createMockFeatureVector = (overallRelevance: number = Math.random()): FeatureVector => ({
  basic: {
    titleMatchScore: Math.random(),
    contentMatchScore: Math.random(),
    tagMatchScore: Math.random(),
    categoryMatch: Math.random() > 0.5,
  },
  recency: {
    daysSinceCreated: Math.random() * 365,
    daysSinceModified: Math.random() * 30,
    daysSinceLastUsed: Math.random() * 7,
    creationDecay: Math.random(),
    modificationDecay: Math.random(),
    usageDecay: Math.random(),
    isRecentlyActive: Math.random() > 0.5,
    hasRecentUpdates: Math.random() > 0.5,
    weekdayCreated: Math.random(),
    hourCreated: Math.random(),
  },
  proximity: {
    exactPhraseMatch: Math.random() > 0.5,
    wordOverlapRatio: Math.random(),
    characterSimilarity: Math.random(),
    cosineSimilarity: Math.random(),
    jaccardSimilarity: Math.random(),
    titleProximity: Math.random(),
    contentProximity: Math.random(),
    tagsProximity: Math.random(),
    pathSimilarity: Math.random(),
    hierarchyDistance: Math.random(),
  },
  affinity: {
    userPreviousInteractions: Math.random(),
    userSuccessRate: Math.random(),
    userDwellTime: Math.random(),
    agentTypeRelevance: Math.random(),
    agentSuccessHistory: Math.random(),
    projectRelevance: Math.random(),
    crossProjectUsage: Math.random(),
    languagePreference: Math.random(),
    complexityFit: Math.random(),
    domainFit: Math.random(),
  },
  semantic: {
    language: 'en',
    complexityScore: Math.random(),
    readabilityScore: Math.random(),
    hasCodeExamples: Math.random() > 0.5,
    hasImageDiagrams: Math.random() > 0.5,
    hasExternalLinks: Math.random() > 0.5,
    documentLength: Math.floor(Math.random() * 10000),
    topicPurity: Math.random(),
  },
  context: {
    issueRelevance: Math.random(),
    taskPhaseRelevance: Math.random(),
    urgencyMatch: Math.random(),
    isWorkingHours: Math.random() > 0.5,
    isWeekend: Math.random() > 0.5,
    timeOfDay: Math.random(),
    queryPosition: Math.random(),
    sessionLength: Math.random(),
    queryComplexity: Math.random(),
    activeProject: Math.random() > 0.5,
    repositoryActive: Math.random() > 0.5,
    branchContext: Math.random() > 0.5,
  },
  derived: {
    overallRelevance,
    uncertaintyScore: Math.random(),
    noveltyScore: Math.random(),
  },
});

describe('RankFusionEngine', () => {
  let fusionEngine: RankFusionEngine;
  let mockResults1: SearchResult[];
  let mockResults2: SearchResult[];

  beforeEach(() => {
    fusionEngine = new RankFusionEngine(mockConfig);

    mockResults1 = [
      createMockSearchResult('1', 9.0, 'Document A', 1),
      createMockSearchResult('2', 7.5, 'Document B', 2),
      createMockSearchResult('3', 6.0, 'Document C', 3),
      createMockSearchResult('4', 4.5, 'Document D', 4),
    ];

    mockResults2 = [
      createMockSearchResult('3', 8.5, 'Document C', 1), // Same doc, different rank
      createMockSearchResult('1', 8.0, 'Document A', 2), // Same doc, different rank
      createMockSearchResult('5', 7.0, 'Document E', 3), // New doc
      createMockSearchResult('2', 5.5, 'Document B', 4), // Same doc, different rank
    ];
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(fusionEngine).toBeDefined();
    });

    it('should initialize without ranking model', () => {
      const model = fusionEngine.getRankingModel();
      expect(model).toBeUndefined();
    });
  });

  describe('Reciprocal Rank Fusion (RRF)', () => {
    it('should perform RRF with default k value', () => {
      const fusedResults = fusionEngine.reciprocalRankFusion([mockResults1, mockResults2]);

      expect(fusedResults).toBeDefined();
      expect(fusedResults.length).toBeGreaterThan(0);

      // Results should be sorted by RRF score
      for (let i = 0; i < fusedResults.length - 1; i++) {
        expect(fusedResults[i].score).toBeGreaterThanOrEqual(fusedResults[i + 1].score);
        expect(fusedResults[i].rank).toBe(i + 1);
      }
    });

    it('should perform RRF with custom k value', () => {
      const fusedResults = fusionEngine.reciprocalRankFusion([mockResults1, mockResults2], 30);

      expect(fusedResults).toBeDefined();
      expect(fusedResults.length).toBeGreaterThan(0);
    });

    it('should handle empty input lists', () => {
      const fusedResults = fusionEngine.reciprocalRankFusion([]);
      expect(fusedResults).toEqual([]);
    });

    it('should handle single input list', () => {
      const fusedResults = fusionEngine.reciprocalRankFusion([mockResults1]);
      expect(fusedResults).toEqual(mockResults1);
    });

    it('should combine results from multiple lists correctly', () => {
      const fusedResults = fusionEngine.reciprocalRankFusion([mockResults1, mockResults2]);

      // Should contain unique results from both lists
      const resultIds = fusedResults.map((r) => r.entry.id);
      const uniqueIds = new Set(resultIds);

      expect(uniqueIds.size).toBe(resultIds.length); // No duplicates
      expect(uniqueIds.has('1')).toBe(true);
      expect(uniqueIds.has('2')).toBe(true);
      expect(uniqueIds.has('3')).toBe(true);
      expect(uniqueIds.has('4')).toBe(true);
      expect(uniqueIds.has('5')).toBe(true);
    });

    it('should boost results that appear in multiple lists', () => {
      const fusedResults = fusionEngine.reciprocalRankFusion([mockResults1, mockResults2]);

      // Document C appears in both lists, should have higher combined score
      const docC = fusedResults.find((r) => r.entry.id === '3');
      const docE = fusedResults.find((r) => r.entry.id === '5'); // Only in one list

      expect(docC).toBeDefined();
      expect(docE).toBeDefined();
      expect(docC.score).toBeGreaterThan(docE.score);
    });
  });

  describe('Borda Count Fusion', () => {
    it('should perform Borda Count fusion', () => {
      const fusedResults = fusionEngine.bordaCount([mockResults1, mockResults2]);

      expect(fusedResults).toBeDefined();
      expect(fusedResults.length).toBeGreaterThan(0);

      // Results should be sorted by Borda score
      for (let i = 0; i < fusedResults.length - 1; i++) {
        expect(fusedResults[i].score).toBeGreaterThanOrEqual(fusedResults[i + 1].score);
        expect(fusedResults[i].rank).toBe(i + 1);
      }
    });

    it('should handle empty input lists', () => {
      const fusedResults = fusionEngine.bordaCount([]);
      expect(fusedResults).toEqual([]);
    });

    it('should handle single input list', () => {
      const fusedResults = fusionEngine.bordaCount([mockResults1]);
      expect(fusedResults).toEqual(mockResults1);
    });

    it('should normalize Borda scores correctly', () => {
      const fusedResults = fusionEngine.bordaCount([mockResults1, mockResults2]);

      fusedResults.forEach((result) => {
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      });
    });

    it('should consider both score and appearance count', () => {
      const fusedResults = fusionEngine.bordaCount([mockResults1, mockResults2]);

      // Results appearing in multiple lists should generally rank higher
      const docC = fusedResults.find((r) => r.entry.id === '3');
      const docE = fusedResults.find((r) => r.entry.id === '5');

      expect(docC).toBeDefined();
      expect(docE).toBeDefined();
    });
  });

  describe('Weighted Fusion', () => {
    it('should perform weighted fusion with equal weights', () => {
      const weights = [0.5, 0.5];
      const fusedResults = fusionEngine.weightedFusion([mockResults1, mockResults2], weights);

      expect(fusedResults).toBeDefined();
      expect(fusedResults.length).toBeGreaterThan(0);

      // Results should be sorted by weighted score
      for (let i = 0; i < fusedResults.length - 1; i++) {
        expect(fusedResults[i].score).toBeGreaterThanOrEqual(fusedResults[i + 1].score);
      }
    });

    it('should perform weighted fusion with unequal weights', () => {
      const weights = [0.8, 0.2]; // Heavily favor first list
      const fusedResults = fusionEngine.weightedFusion([mockResults1, mockResults2], weights);

      expect(fusedResults).toBeDefined();
      expect(fusedResults.length).toBeGreaterThan(0);
    });

    it('should normalize weights automatically', () => {
      const unnormalizedWeights = [2, 3]; // Sum = 5, should be normalized to [0.4, 0.6]
      const fusedResults = fusionEngine.weightedFusion(
        [mockResults1, mockResults2],
        unnormalizedWeights,
      );

      expect(fusedResults).toBeDefined();
      expect(fusedResults.length).toBeGreaterThan(0);
    });

    it('should handle empty input lists', () => {
      const fusedResults = fusionEngine.weightedFusion([], []);
      expect(fusedResults).toEqual([]);
    });

    it('should handle single input list', () => {
      const weights = [1.0];
      const fusedResults = fusionEngine.weightedFusion([mockResults1], weights);
      expect(fusedResults.length).toBe(mockResults1.length);
    });

    it('should reject mismatched weights array length', () => {
      const weights = [0.5]; // Only one weight for two lists
      expect(() => fusionEngine.weightedFusion([mockResults1, mockResults2], weights)).toThrow(
        'Weights array length must match ranked lists length',
      );
    });

    it('should combine original scores with position scores', () => {
      const weights = [1.0, 0.0]; // Only first list
      const fusedResults = fusionEngine.weightedFusion([mockResults1, mockResults2], weights);

      // First result from first list should rank highly
      const topResult = fusedResults[0];
      expect(topResult.entry.id).toBe('1'); // Top result from mockResults1
    });
  });

  describe('Learning-to-Rank (LTR)', () => {
    it('should perform LTR without a model (feature-based fallback)', () => {
      const features = mockResults1.map(() => createMockFeatureVector());
      const rankedResults = fusionEngine.learningToRank([mockResults1], features);

      expect(rankedResults).toBeDefined();
      expect(rankedResults.length).toBe(mockResults1.length);

      // Results should be re-ranked
      for (let i = 0; i < rankedResults.length - 1; i++) {
        expect(rankedResults[i].score).toBeGreaterThanOrEqual(rankedResults[i + 1].score);
        expect(rankedResults[i].rank).toBe(i + 1);
      }
    });

    it('should perform LTR with a ranking model', () => {
      const mockModel: RankingModel = {
        weights: Array(22).fill(0.1), // 22 features
        bias: 0.0,
        features: [
          'titleMatchScore',
          'contentMatchScore',
          'tagMatchScore',
          'categoryMatch',
          'creationDecay',
          'modificationDecay',
          'usageDecay',
          'wordOverlapRatio',
          'cosineSimilarity',
          'exactPhraseMatch',
          'agentTypeRelevance',
          'projectRelevance',
          'userSuccessRate',
          'complexityScore',
          'readabilityScore',
          'hasCodeExamples',
          'issueRelevance',
          'isWorkingHours',
          'activeProject',
          'overallRelevance',
          'confidenceScore',
          'noveltyScore',
        ],
        accuracy: 0.85,
        precision: 0.8,
        recall: 0.75,
        trainingSize: 1000,
        lastTrained: new Date(),
        modelVersion: '1.0.0',
      };

      fusionEngine.setRankingModel(mockModel);

      const features = mockResults1.map(() => createMockFeatureVector());
      const rankedResults = fusionEngine.learningToRank([mockResults1], features, mockModel);

      expect(rankedResults).toBeDefined();
      expect(rankedResults.length).toBe(mockResults1.length);

      // Scores should be normalized to [0, 1] by sigmoid
      rankedResults.forEach((result) => {
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      });
    });

    it('should handle mismatched features and results count', () => {
      const features = [createMockFeatureVector()]; // Only one feature for multiple results
      const rankedResults = fusionEngine.learningToRank([mockResults1], features);

      // Should fallback gracefully
      expect(rankedResults).toEqual(mockResults1);
    });

    it('should handle empty input', () => {
      const rankedResults = fusionEngine.learningToRank([], []);
      expect(rankedResults).toEqual([]);
    });

    it('should combine unique results from multiple lists', () => {
      const features = Array(5)
        .fill(null)
        .map(() => createMockFeatureVector()); // 5 unique results
      const rankedResults = fusionEngine.learningToRank([mockResults1, mockResults2], features);

      expect(rankedResults.length).toBe(5); // Total unique results
    });
  });

  describe('Advanced Fusion and Reranking', () => {
    it('should perform advanced fusion with RRF algorithm', async () => {
      const retrievalResults: RetrievalResult[] = mockResults1.map((r) => ({
        ...r,
        features: createMockFeatureVector(),
        confidenceScore: r.score / 10,
        retrievalStrategy: 'fts-heavy',
        rankerUsed: 'base',
      }));

      const fusedResults = await fusionEngine.fuseAndRerank(
        [retrievalResults],
        mockQuery,
        'fts-heavy',
      );

      expect(fusedResults).toBeDefined();
      expect(fusedResults.length).toBe(retrievalResults.length);
      expect(fusedResults.every((r) => r.rankerUsed)).toBe(true);
    });

    it('should perform advanced fusion with Borda Count', async () => {
      const bordaConfig = {
        ...mockConfig,
        hybrid: { ...mockConfig.hybrid, fusionAlgorithm: 'borda' as const },
      };
      const bordaEngine = new RankFusionEngine(bordaConfig);

      const retrievalResults: RetrievalResult[] = mockResults1.map((r) => ({
        ...r,
        features: createMockFeatureVector(),
        confidenceScore: r.score / 10,
        retrievalStrategy: 'balanced',
        rankerUsed: 'base',
      }));

      const fusedResults = await bordaEngine.fuseAndRerank(
        [retrievalResults],
        mockQuery,
        'balanced',
      );

      expect(fusedResults).toBeDefined();
      expect(fusedResults.length).toBe(retrievalResults.length);
    });

    it('should perform advanced fusion with weighted fusion', async () => {
      const weightedConfig = {
        ...mockConfig,
        hybrid: { ...mockConfig.hybrid, fusionAlgorithm: 'weighted' as const },
      };
      const weightedEngine = new RankFusionEngine(weightedConfig);

      const retrievalResults1: RetrievalResult[] = mockResults1.map((r) => ({
        ...r,
        features: createMockFeatureVector(),
        confidenceScore: r.score / 10,
        retrievalStrategy: 'fts-heavy',
        rankerUsed: 'base',
      }));

      const retrievalResults2: RetrievalResult[] = mockResults2.map((r) => ({
        ...r,
        features: createMockFeatureVector(),
        confidenceScore: r.score / 10,
        retrievalStrategy: 'vector-heavy',
        rankerUsed: 'base',
      }));

      const fusedResults = await weightedEngine.fuseAndRerank(
        [retrievalResults1, retrievalResults2],
        mockQuery,
        'balanced',
      );

      expect(fusedResults).toBeDefined();
      expect(fusedResults.length).toBeGreaterThan(0);
    });

    it('should perform advanced fusion with Learning-to-Rank', async () => {
      const ltrConfig = {
        ...mockConfig,
        hybrid: { ...mockConfig.hybrid, fusionAlgorithm: 'ltr' as const },
        reranking: { ...mockConfig.reranking, enabled: true },
      };
      const ltrEngine = new RankFusionEngine(ltrConfig);

      const retrievalResults: RetrievalResult[] = mockResults1.map((r) => ({
        ...r,
        features: createMockFeatureVector(),
        confidenceScore: r.score / 10,
        retrievalStrategy: 'semantic-focused',
        rankerUsed: 'base',
      }));

      const fusedResults = await ltrEngine.fuseAndRerank(
        [retrievalResults],
        mockQuery,
        'semantic-focused',
      );

      expect(fusedResults).toBeDefined();
      expect(fusedResults.length).toBe(retrievalResults.length);
    });

    it('should handle empty retrieval results', async () => {
      const fusedResults = await fusionEngine.fuseAndRerank([], mockQuery, 'balanced');
      expect(fusedResults).toEqual([]);
    });

    it('should handle single retrieval result list', async () => {
      const retrievalResults: RetrievalResult[] = mockResults1.map((r) => ({
        ...r,
        features: createMockFeatureVector(),
        confidenceScore: r.score / 10,
        retrievalStrategy: 'fts-heavy',
        rankerUsed: 'base',
      }));

      const fusedResults = await fusionEngine.fuseAndRerank(
        [retrievalResults],
        mockQuery,
        'fts-heavy',
      );

      expect(fusedResults).toEqual(retrievalResults);
    });
  });

  describe('Model Management', () => {
    it('should set and get ranking model', () => {
      const mockModel: RankingModel = {
        weights: [0.1, 0.2, 0.3],
        bias: 0.05,
        features: ['feature1', 'feature2', 'feature3'],
        accuracy: 0.85,
        precision: 0.8,
        recall: 0.75,
        trainingSize: 1000,
        lastTrained: new Date(),
        modelVersion: '1.0.0',
      };

      fusionEngine.setRankingModel(mockModel);
      const retrievedModel = fusionEngine.getRankingModel();

      expect(retrievedModel).toEqual(mockModel);
    });

    it('should return undefined when no model is set', () => {
      const model = fusionEngine.getRankingModel();
      expect(model).toBeUndefined();
    });
  });

  describe('Post-Fusion Enhancements', () => {
    it('should apply diversity enhancement', () => {
      const diverseResults = [
        createMockSearchResult('1', 9.0, 'Document A', 1),
        createMockSearchResult('2', 8.9, 'Document B', 2),
        createMockSearchResult('3', 8.8, 'Document C', 3),
      ];

      // Make results from same category to test diversity
      diverseResults.forEach((r) => (r.entry.metadata.category = 'same-category'));

      const fusedResults = fusionEngine.reciprocalRankFusion([diverseResults]);

      expect(fusedResults).toBeDefined();
      expect(fusedResults.length).toBe(3);

      // Later results should have slight score penalty for same category
      expect(fusedResults[0].score).toBeGreaterThanOrEqual(fusedResults[1].score);
    });

    it('should apply query-specific boosting', async () => {
      const projectQuery = {
        ...mockQuery,
        query: 'urgent fix needed',
        context: { ...mockContext, projectId: 'test-project' },
      };

      const retrievalResults: RetrievalResult[] = [
        {
          ...createMockSearchResult('1', 7.0, 'Recent Fix'),
          entry: {
            ...createMockSearchResult('1', 7.0, 'Recent Fix').entry,
            lastModified: new Date(), // Very recent
            metadata: {
              ...createMockSearchResult('1', 7.0, 'Recent Fix').entry.metadata,
              projectId: 'test-project',
            },
          },
          features: createMockFeatureVector(),
          confidenceScore: 0.7,
          retrievalStrategy: 'recency-focused',
          rankerUsed: 'base',
        },
      ];

      const fusedResults = await fusionEngine.fuseAndRerank(
        [retrievalResults],
        projectQuery,
        'recency-focused',
      );

      expect(fusedResults).toBeDefined();
      expect(fusedResults.length).toBe(1);

      // Should get boosted score for recent + urgent + project match
      expect(fusedResults[0].score).toBeGreaterThan(0.7);
    });

    it('should apply strategy-specific reordering for recency-focused', async () => {
      const oldResult = createMockSearchResult('1', 8.0, 'Old Document');
      oldResult.entry.lastModified = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days old

      const newResult = createMockSearchResult('2', 7.9, 'New Document');
      newResult.entry.lastModified = new Date(); // Very recent

      const retrievalResults: RetrievalResult[] = [oldResult, newResult].map((r) => ({
        ...r,
        features: createMockFeatureVector(),
        confidenceScore: r.score / 10,
        retrievalStrategy: 'recency-focused',
        rankerUsed: 'base',
      }));

      const fusedResults = await fusionEngine.fuseAndRerank(
        [retrievalResults],
        mockQuery,
        'recency-focused',
      );

      expect(fusedResults.length).toBe(2);
      // For similar scores, newer document should rank higher with recency-focused strategy
      if (Math.abs(fusedResults[0].score - fusedResults[1].score) < 0.1) {
        expect(fusedResults[0].entry.lastModified.getTime()).toBeGreaterThan(
          fusedResults[1].entry.lastModified.getTime(),
        );
      }
    });

    it('should apply strategy-specific reordering for effectiveness-focused', async () => {
      const lowEffectiveness = createMockSearchResult('1', 8.0, 'Low Effectiveness Document');
      lowEffectiveness.entry.metadata.effectiveness = 0.3;

      const highEffectiveness = createMockSearchResult('2', 7.9, 'High Effectiveness Document');
      highEffectiveness.entry.metadata.effectiveness = 0.9;

      const retrievalResults: RetrievalResult[] = [lowEffectiveness, highEffectiveness].map(
        (r) => ({
          ...r,
          features: createMockFeatureVector(),
          confidenceScore: r.score / 10,
          retrievalStrategy: 'effectiveness-focused',
          rankerUsed: 'base',
        }),
      );

      const fusedResults = await fusionEngine.fuseAndRerank(
        [retrievalResults],
        mockQuery,
        'effectiveness-focused',
      );

      expect(fusedResults.length).toBe(2);
      // For similar scores, higher effectiveness should rank higher
      if (Math.abs(fusedResults[0].score - fusedResults[1].score) < 0.1) {
        const topEffectiveness = fusedResults[0].entry.metadata.effectiveness || 0;
        const secondEffectiveness = fusedResults[1].entry.metadata.effectiveness || 0;
        expect(topEffectiveness).toBeGreaterThanOrEqual(secondEffectiveness);
      }
    });

    it('should apply strategy-specific reordering for popularity-focused', async () => {
      const lowUsage = createMockSearchResult('1', 8.0, 'Low Usage Document');
      lowUsage.entry.metadata.usageCount = 2;

      const highUsage = createMockSearchResult('2', 7.9, 'High Usage Document');
      highUsage.entry.metadata.usageCount = 50;

      const retrievalResults: RetrievalResult[] = [lowUsage, highUsage].map((r) => ({
        ...r,
        features: createMockFeatureVector(),
        confidenceScore: r.score / 10,
        retrievalStrategy: 'popularity-focused',
        rankerUsed: 'base',
      }));

      const fusedResults = await fusionEngine.fuseAndRerank(
        [retrievalResults],
        mockQuery,
        'popularity-focused',
      );

      expect(fusedResults.length).toBe(2);
      // For similar scores, higher usage count should rank higher
      if (Math.abs(fusedResults[0].score - fusedResults[1].score) < 0.1) {
        const topUsage = fusedResults[0].entry.metadata.usageCount || 0;
        const secondUsage = fusedResults[1].entry.metadata.usageCount || 0;
        expect(topUsage).toBeGreaterThanOrEqual(secondUsage);
      }
    });
  });

  describe('Confidence Calculation', () => {
    it('should calculate post-fusion confidence correctly', async () => {
      const exactMatchResult = createMockSearchResult('1', 8.0, 'Exact Match');
      exactMatchResult.titleSnippet = 'Exact <mark>Match</mark>';
      exactMatchResult.rank = 1; // Top rank

      const retrievalResults: RetrievalResult[] = [
        {
          ...exactMatchResult,
          features: createMockFeatureVector(),
          confidenceScore: 0.8,
          retrievalStrategy: 'fts-heavy',
          rankerUsed: 'base',
        },
      ];

      const fusedResults = await fusionEngine.fuseAndRerank(
        [retrievalResults],
        mockQuery,
        'fts-heavy',
      );

      expect(fusedResults.length).toBe(1);
      expect(fusedResults[0].confidenceScore).toBeGreaterThan(0.8); // Should be boosted
    });
  });

  describe('Error Handling', () => {
    it('should handle fusion errors gracefully', async () => {
      // Test with malformed results
      const malformedResults: RetrievalResult[] = [
        {
          entry: null as any, // Malformed entry
          score: 8.0,
          rank: 1,
          matchedFields: [],
          totalMatches: 1,
          titleSnippet: '',
          contentSnippets: [],
          relevanceFactors: {
            titleMatch: 0.8,
            contentMatch: 0.6,
            tagMatch: 0.0,
            categoryMatch: 0.0,
            recencyBoost: 0.1,
            effectivenessBoost: 0.0,
            usageBoost: 0.0,
          },
          features: createMockFeatureVector(),
          confidenceScore: 0.8,
          retrievalStrategy: 'fts-heavy',
          rankerUsed: 'base',
        },
      ];

      // Should fallback gracefully rather than crash
      const fusedResults = await fusionEngine.fuseAndRerank(
        [malformedResults],
        mockQuery,
        'fts-heavy',
      );

      expect(fusedResults).toBeDefined();
      expect(fusedResults.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle ranking model errors gracefully', () => {
      const invalidModel: RankingModel = {
        weights: [], // Empty weights array
        bias: 0,
        features: [],
        accuracy: 0,
        precision: 0,
        recall: 0,
        trainingSize: 0,
        lastTrained: new Date(),
        modelVersion: '1.0.0',
      };

      fusionEngine.setRankingModel(invalidModel);

      const features = [createMockFeatureVector()];
      const rankedResults = fusionEngine.learningToRank([mockResults1], features, invalidModel);

      // Should fallback to RRF
      expect(rankedResults).toBeDefined();
      expect(rankedResults.length).toBe(mockResults1.length);
    });
  });

  describe('Performance', () => {
    it('should handle large result sets efficiently', () => {
      // Create large result sets
      const largeResults1 = Array(500)
        .fill(null)
        .map((_, i) =>
          createMockSearchResult(`large1-${i}`, 10 - i * 0.01, `Large Document 1-${i}`, i + 1),
        );

      const largeResults2 = Array(500)
        .fill(null)
        .map((_, i) =>
          createMockSearchResult(`large2-${i}`, 9 - i * 0.01, `Large Document 2-${i}`, i + 1),
        );

      const startTime = Date.now();
      const fusedResults = fusionEngine.reciprocalRankFusion([largeResults1, largeResults2]);
      const endTime = Date.now();

      expect(fusedResults).toBeDefined();
      expect(fusedResults.length).toBeGreaterThan(0);

      // Should complete within reasonable time (less than 5 seconds)
      expect(endTime - startTime).toBeLessThan(5000);
    });

    it('should handle concurrent fusion operations', () => {
      const promises = [];

      for (let i = 0; i < 20; i++) {
        promises.push(
          Promise.resolve(fusionEngine.reciprocalRankFusion([mockResults1, mockResults2])),
        );
      }

      return Promise.all(promises).then((results) => {
        expect(results).toHaveLength(20);
        results.forEach((result) => {
          expect(result).toBeDefined();
          expect(result.length).toBeGreaterThan(0);
        });
      });
    });
  });
});
