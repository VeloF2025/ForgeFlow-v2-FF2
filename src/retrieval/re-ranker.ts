// Logistic Re-ranker - Online Learning for Result Reranking
// Implements logistic regression with online learning for adaptive ranking

import type {
  LogisticReranker as ILogisticReranker,
  RetrievalQuery,
  RankingModel,
  RerankingTrainingData,
  RerankingMetrics,
  UserFeedback,
  FeatureVector,
  RetrievalConfig,
} from './types.js';
import { RetrievalResult, RetrievalError, RetrievalErrorCode } from './types.js';
import type { SearchResult } from '../indexing/types.js';
import { logger } from '../utils/logger.js';

export class OnlineLearningReranker implements ILogisticReranker {
  private model: RankingModel;
  private readonly config: RetrievalConfig['reranking'];
  private trainingBuffer: Array<{
    features: number[];
    label: number;
    query: string;
    timestamp: Date;
  }> = [];

  // Performance tracking
  private metrics: RerankingMetrics = {
    accuracy: 0.5,
    precision: 0.5,
    recall: 0.5,
    f1Score: 0.5,
    auc: 0.5,
    meanReciprocalRank: 0,
    ndcg: 0,
    map: 0,
    trainingLoss: 0,
    validationLoss: 0,
    convergence: false,
  };

  private validationData: Array<{
    features: number[];
    label: number;
  }> = [];

  constructor(config: RetrievalConfig['reranking']) {
    this.config = config;

    // Initialize default model
    this.model = {
      weights: this.initializeWeights(22), // Based on feature vector size
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
      accuracy: 0.5,
      precision: 0.5,
      recall: 0.5,
      trainingSize: 0,
      lastTrained: new Date(),
      modelVersion: '1.0.0',
    };

    logger.info('OnlineLearningReranker initialized', {
      algorithm: config.algorithm,
      learningRate: config.learningRate,
      onlineLearning: config.onlineLearning,
      batchSize: config.batchSize,
    });
  }

  async rerank(query: RetrievalQuery, results: SearchResult[]): Promise<SearchResult[]> {
    try {
      if (!this.config.enabled || results.length === 0) {
        return results;
      }

      const startTime = Date.now();

      // Extract features for all results (this would be passed in normally)
      // For now, we'll create mock features
      const features = results.map((result) => this.extractFeaturesFromResult(result, query));

      // Apply model to get new scores
      const rankedResults = results.map((result, index) => {
        const featureArray = this.convertFeaturesToArray(features[index]);
        const modelScore = this.applyModel(featureArray);

        return {
          ...result,
          score: modelScore,
          rank: 0, // Will be set after sorting
        };
      });

      // Sort by new scores and assign ranks
      rankedResults.sort((a, b) => b.score - a.score);
      rankedResults.forEach((result, index) => {
        result.rank = index + 1;
      });

      const rerankingTime = Date.now() - startTime;

      logger.debug('Reranking completed', {
        originalResults: results.length,
        rerankedResults: rankedResults.length,
        rerankingTime,
        modelVersion: this.model.modelVersion,
      });

      return rankedResults;
    } catch (error) {
      logger.error('Reranking failed', error);
      throw new RetrievalError('Reranking failed', RetrievalErrorCode.RERANKER_FAILED, {
        query: query.query,
        resultsCount: results.length,
        error,
      });
    }
  }

  async trainModel(trainingData: RerankingTrainingData): Promise<void> {
    try {
      if (trainingData.queries.length === 0) {
        throw new Error('No training data provided');
      }

      logger.info('Starting model training', {
        trainingSize: trainingData.queries.length,
        algorithm: this.config.algorithm,
      });

      const startTime = Date.now();

      // Prepare training examples
      const trainingExamples = this.prepareTrainingExamples(trainingData);

      // Split into training and validation sets
      const splitIndex = Math.floor(trainingExamples.length * 0.8);
      const trainingSet = trainingExamples.slice(0, splitIndex);
      const validationSet = trainingExamples.slice(splitIndex);
      this.validationData = validationSet;

      // Train using stochastic gradient descent
      await this.trainWithSGD(trainingSet);

      // Evaluate model performance
      await this.evaluateModel(validationSet);

      const trainingTime = Date.now() - startTime;

      logger.info('Model training completed', {
        trainingTime,
        trainingSize: trainingSet.length,
        validationSize: validationSet.length,
        accuracy: this.metrics.accuracy,
        convergence: this.metrics.convergence,
      });

      // Update model metadata
      this.model.trainingSize = trainingSet.length;
      this.model.lastTrained = new Date();
      this.model.accuracy = this.metrics.accuracy;
      this.model.precision = this.metrics.precision;
      this.model.recall = this.metrics.recall;
    } catch (error) {
      logger.error('Model training failed', error);
      throw new RetrievalError('Model training failed', RetrievalErrorCode.MODEL_TRAINING_FAILED, {
        error,
      });
    }
  }

  async updateOnline(
    query: RetrievalQuery,
    result: SearchResult,
    feedback: UserFeedback,
  ): Promise<void> {
    try {
      if (!this.config.onlineLearning) {
        return;
      }

      // Convert feedback to label
      const label = this.feedbackToLabel(feedback);

      // Extract features
      const features = this.extractFeaturesFromResult(result, query);
      const featureArray = this.convertFeaturesToArray(features);

      // Add to training buffer
      this.trainingBuffer.push({
        features: featureArray,
        label,
        query: query.query,
        timestamp: new Date(),
      });

      // Perform online update if buffer is full
      if (this.trainingBuffer.length >= this.config.batchSize) {
        await this.performOnlineUpdate();
      }

      logger.debug('Online feedback recorded', {
        query: query.query,
        label,
        bufferSize: this.trainingBuffer.length,
        resultId: result.entry.id,
      });
    } catch (error) {
      logger.error('Online update failed', error);
      // Don't throw error for online updates to avoid disrupting user experience
    }
  }

  async saveModel(): Promise<void> {
    try {
      // In a real implementation, this would save to persistent storage
      const modelData = {
        model: this.model,
        metrics: this.metrics,
        timestamp: new Date(),
      };

      logger.info('Model saved', {
        modelVersion: this.model.modelVersion,
        accuracy: this.model.accuracy,
        trainingSize: this.model.trainingSize,
      });

      // For now, just log that the model would be saved
      // In production, save to file system or database
    } catch (error) {
      logger.error('Failed to save model', error);
      throw new RetrievalError('Failed to save model', RetrievalErrorCode.MODEL_TRAINING_FAILED, {
        error,
      });
    }
  }

  async loadModel(): Promise<void> {
    try {
      // In a real implementation, this would load from persistent storage
      logger.info('Model loading not implemented - using default model');
    } catch (error) {
      logger.error('Failed to load model', error);
      throw new RetrievalError('Failed to load model', RetrievalErrorCode.MODEL_TRAINING_FAILED, {
        error,
      });
    }
  }

  async getModelMetrics(): Promise<RerankingMetrics> {
    return { ...this.metrics };
  }

  // Private methods

  private initializeWeights(size: number): number[] {
    // Initialize weights with small random values
    return Array.from({ length: size }, () => (Math.random() - 0.5) * 0.01);
  }

  private extractFeaturesFromResult(result: SearchResult, query: RetrievalQuery): FeatureVector {
    // Mock feature extraction - in real implementation, this would come from FeatureExtractor
    return {
      basic: {
        titleMatchScore: Math.min(result.score / 10, 1),
        contentMatchScore: Math.min(result.score / 15, 1),
        tagMatchScore: result.matchedFields.includes('tags') ? 0.8 : 0.2,
        categoryMatch: result.matchedFields.includes('category'),
      },
      recency: {
        daysSinceCreated: 30,
        daysSinceModified: 7,
        daysSinceLastUsed: 1,
        creationDecay: Math.exp(-30 / 30),
        modificationDecay: Math.exp(-7 / 14),
        usageDecay: Math.exp(-1 / 7),
        isRecentlyActive: true,
        hasRecentUpdates: true,
        weekdayCreated: 0.5,
        hourCreated: 0.6,
      },
      proximity: {
        exactPhraseMatch: result.titleSnippet?.includes('<mark>') || false,
        wordOverlapRatio: 0.6,
        characterSimilarity: 0.4,
        cosineSimilarity: 0.5,
        jaccardSimilarity: 0.3,
        titleProximity: 0.7,
        contentProximity: 0.5,
        tagsProximity: 0.4,
        pathSimilarity: 0.2,
        hierarchyDistance: 0.3,
      },
      affinity: {
        userPreviousInteractions: 0.3,
        userSuccessRate: 0.7,
        userDwellTime: 0.5,
        agentTypeRelevance: 0.8,
        agentSuccessHistory: 0.6,
        projectRelevance: query.projectId === result.entry.metadata.projectId ? 1.0 : 0.3,
        crossProjectUsage: 0.7,
        languagePreference: 0.8,
        complexityFit: 0.6,
        domainFit: 0.7,
      },
      semantic: {
        language: result.entry.metadata.language || 'unknown',
        complexityScore: 0.5,
        readabilityScore: 0.6,
        hasCodeExamples: result.entry.content.includes('```'),
        hasImageDiagrams: result.entry.content.includes('!['),
        hasExternalLinks: result.entry.content.includes('http'),
        documentLength: result.entry.content.length,
        topicPurity: 0.7,
      },
      context: {
        issueRelevance: 0.6,
        taskPhaseRelevance: 0.5,
        urgencyMatch: 0.4,
        isWorkingHours: true,
        isWeekend: false,
        timeOfDay: 0.6,
        queryPosition: Math.min(query.context?.recentQueries?.length || 0, 10) / 10,
        sessionLength: 0.3,
        queryComplexity: Math.min(query.query.split(' ').length / 10, 1),
        activeProject: query.projectId === result.entry.metadata.projectId,
        repositoryActive: Boolean(query.context?.repositoryUrl),
        branchContext: Boolean(query.context?.activeBranch),
      },
      derived: {
        overallRelevance: Math.min(result.score / 10, 1),
        uncertaintyScore: 0.3,
        noveltyScore: 0.4,
      },
    };
  }

  private convertFeaturesToArray(features: FeatureVector): number[] {
    return [
      features.basic.titleMatchScore,
      features.basic.contentMatchScore,
      features.basic.tagMatchScore,
      features.basic.categoryMatch ? 1 : 0,
      features.recency.creationDecay,
      features.recency.modificationDecay,
      features.recency.usageDecay,
      features.proximity.wordOverlapRatio,
      features.proximity.cosineSimilarity,
      features.proximity.exactPhraseMatch ? 1 : 0,
      features.affinity.agentTypeRelevance,
      features.affinity.projectRelevance,
      features.affinity.userSuccessRate,
      features.semantic.complexityScore,
      features.semantic.readabilityScore,
      features.semantic.hasCodeExamples ? 1 : 0,
      features.context.issueRelevance,
      features.context.isWorkingHours ? 1 : 0,
      features.context.activeProject ? 1 : 0,
      features.derived.overallRelevance,
      features.derived.uncertaintyScore,
      features.derived.noveltyScore,
    ];
  }

  private applyModel(features: number[]): number {
    let score = this.model.bias;

    for (let i = 0; i < Math.min(features.length, this.model.weights.length); i++) {
      score += this.model.weights[i] * features[i];
    }

    // Apply sigmoid function
    return 1 / (1 + Math.exp(-score));
  }

  private feedbackToLabel(feedback: UserFeedback): number {
    let score = 0.5; // Base score

    if (feedback.relevanceRating) {
      score = feedback.relevanceRating / 5; // Convert 1-5 to 0-1
    }

    if (feedback.thumbsUp) score = Math.max(score, 0.9);
    if (feedback.thumbsDown) score = Math.min(score, 0.1);
    if (feedback.usedInSolution) score = Math.max(score, 0.95);
    if (feedback.clicked && feedback.dwellTime > 10000) score += 0.1;

    return Math.max(0, Math.min(1, score));
  }

  private prepareTrainingExamples(trainingData: RerankingTrainingData): Array<{
    features: number[];
    label: number;
  }> {
    const examples: Array<{ features: number[]; label: number }> = [];

    for (let i = 0; i < trainingData.queries.length; i++) {
      const candidates = trainingData.candidates[i];
      const labels = trainingData.labels[i];
      const featureVectors = trainingData.features[i];

      for (let j = 0; j < candidates.length; j++) {
        if (featureVectors[j] && labels[j] !== undefined) {
          examples.push({
            features: this.convertFeaturesToArray(featureVectors[j]),
            label: labels[j],
          });
        }
      }
    }

    return examples;
  }

  private async trainWithSGD(
    trainingExamples: Array<{ features: number[]; label: number }>,
  ): Promise<void> {
    const epochs = 100;
    const learningRate = this.config.learningRate;
    const regularization = this.config.regularization;

    let previousLoss = Infinity;
    let convergenceCount = 0;

    for (let epoch = 0; epoch < epochs; epoch++) {
      // Shuffle training examples
      const shuffled = [...trainingExamples].sort(() => Math.random() - 0.5);

      let totalLoss = 0;

      for (const example of shuffled) {
        // Forward pass
        const prediction = this.applyModel(example.features);
        const loss = Math.pow(prediction - example.label, 2); // MSE loss
        totalLoss += loss;

        // Backward pass (gradient descent)
        const error = prediction - example.label;
        const gradient = 2 * error * prediction * (1 - prediction); // Derivative of sigmoid

        // Update weights
        for (let i = 0; i < Math.min(example.features.length, this.model.weights.length); i++) {
          const weightGradient = gradient * example.features[i];
          this.model.weights[i] -=
            learningRate * (weightGradient + regularization * this.model.weights[i]);
        }

        // Update bias
        this.model.bias -= learningRate * gradient;
      }

      const avgLoss = totalLoss / shuffled.length;

      // Check for convergence
      if (Math.abs(previousLoss - avgLoss) < 0.0001) {
        convergenceCount++;
        if (convergenceCount >= 5) {
          this.metrics.convergence = true;
          logger.debug(`Model converged at epoch ${epoch}`);
          break;
        }
      } else {
        convergenceCount = 0;
      }

      previousLoss = avgLoss;

      if (epoch % 10 === 0) {
        logger.debug(`Training epoch ${epoch}, loss: ${avgLoss.toFixed(6)}`);
      }
    }

    this.metrics.trainingLoss = previousLoss;
  }

  private async evaluateModel(
    validationSet: Array<{ features: number[]; label: number }>,
  ): Promise<void> {
    if (validationSet.length === 0) {
      return;
    }

    let correct = 0;
    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;
    let totalLoss = 0;

    const predictions: number[] = [];
    const labels: number[] = [];

    for (const example of validationSet) {
      const prediction = this.applyModel(example.features);
      const predicted = prediction > 0.5 ? 1 : 0;
      const actual = example.label > 0.5 ? 1 : 0;

      predictions.push(prediction);
      labels.push(example.label);

      if (predicted === actual) correct++;

      if (predicted === 1 && actual === 1) truePositives++;
      if (predicted === 1 && actual === 0) falsePositives++;
      if (predicted === 0 && actual === 1) falseNegatives++;

      const loss = Math.pow(prediction - example.label, 2);
      totalLoss += loss;
    }

    // Calculate metrics
    this.metrics.accuracy = correct / validationSet.length;
    this.metrics.precision = truePositives / (truePositives + falsePositives) || 0;
    this.metrics.recall = truePositives / (truePositives + falseNegatives) || 0;
    this.metrics.f1Score =
      (2 * (this.metrics.precision * this.metrics.recall)) /
        (this.metrics.precision + this.metrics.recall) || 0;
    this.metrics.validationLoss = totalLoss / validationSet.length;

    // Calculate AUC (simplified)
    this.metrics.auc = this.calculateAUC(predictions, labels);

    // Calculate ranking metrics
    this.metrics.meanReciprocalRank = this.calculateMRR(predictions, labels);
    this.metrics.ndcg = this.calculateNDCG(predictions, labels);
    this.metrics.map = this.calculateMAP(predictions, labels);
  }

  private calculateAUC(predictions: number[], labels: number[]): number {
    // Simplified AUC calculation
    const pairs = predictions
      .map((pred, i) => ({ pred, label: labels[i] }))
      .sort((a, b) => b.pred - a.pred);

    let concordant = 0;
    let total = 0;

    for (let i = 0; i < pairs.length; i++) {
      for (let j = i + 1; j < pairs.length; j++) {
        if (pairs[i].label !== pairs[j].label) {
          total++;
          if (
            (pairs[i].label > pairs[j].label && pairs[i].pred > pairs[j].pred) ||
            (pairs[i].label < pairs[j].label && pairs[i].pred < pairs[j].pred)
          ) {
            concordant++;
          }
        }
      }
    }

    return total > 0 ? concordant / total : 0.5;
  }

  private calculateMRR(predictions: number[], labels: number[]): number {
    // Mean Reciprocal Rank calculation
    const sorted = predictions
      .map((pred, i) => ({ pred, label: labels[i] }))
      .sort((a, b) => b.pred - a.pred);

    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].label > 0.5) {
        return 1 / (i + 1);
      }
    }

    return 0;
  }

  private calculateNDCG(predictions: number[], labels: number[]): number {
    // Normalized Discounted Cumulative Gain
    const sorted = predictions
      .map((pred, i) => ({ pred, label: labels[i] }))
      .sort((a, b) => b.pred - a.pred);

    let dcg = 0;
    let idcg = 0;

    // Calculate DCG
    for (let i = 0; i < sorted.length; i++) {
      const relevance = sorted[i].label;
      dcg += relevance / Math.log2(i + 2);
    }

    // Calculate IDCG (ideal DCG)
    const idealSorted = [...labels].sort((a, b) => b - a);
    for (let i = 0; i < idealSorted.length; i++) {
      idcg += idealSorted[i] / Math.log2(i + 2);
    }

    return idcg > 0 ? dcg / idcg : 0;
  }

  private calculateMAP(predictions: number[], labels: number[]): number {
    // Mean Average Precision
    const sorted = predictions
      .map((pred, i) => ({ pred, label: labels[i] }))
      .sort((a, b) => b.pred - a.pred);

    let relevantFound = 0;
    let sumPrecision = 0;
    const totalRelevant = labels.filter((l) => l > 0.5).length;

    if (totalRelevant === 0) return 0;

    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].label > 0.5) {
        relevantFound++;
        sumPrecision += relevantFound / (i + 1);
      }
    }

    return sumPrecision / totalRelevant;
  }

  private async performOnlineUpdate(): Promise<void> {
    try {
      // Perform mini-batch gradient descent
      const batchSize = Math.min(this.config.batchSize, this.trainingBuffer.length);
      const batch = this.trainingBuffer.slice(0, batchSize);

      // Remove processed items from buffer
      this.trainingBuffer = this.trainingBuffer.slice(batchSize);

      const learningRate = this.config.learningRate * 0.1; // Lower learning rate for online updates

      for (const example of batch) {
        const prediction = this.applyModel(example.features);
        const error = prediction - example.label;
        const gradient = 2 * error * prediction * (1 - prediction);

        // Update weights
        for (let i = 0; i < Math.min(example.features.length, this.model.weights.length); i++) {
          const weightGradient = gradient * example.features[i];
          this.model.weights[i] -= learningRate * weightGradient;
        }

        // Update bias
        this.model.bias -= learningRate * gradient;
      }

      logger.debug('Online model update completed', {
        batchSize: batch.length,
        bufferRemaining: this.trainingBuffer.length,
      });
    } catch (error) {
      logger.error('Online update failed', error);
    }
  }
}
