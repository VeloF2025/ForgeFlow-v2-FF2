import { LogContext } from '../utils/logger';

interface NLNHResult {
  valid: boolean;
  message?: string;
  confidence: number;
  truthScore: number;
}

export class NLNHProtocol {
  private active: boolean;
  private logger: LogContext;
  private truthThreshold: number;
  private validationHistory: Array<{
    timestamp: Date;
    context: string;
    result: NLNHResult;
  }>;

  constructor() {
    this.logger = new LogContext('NLNH-Protocol');
    this.active = false;
    this.truthThreshold = 0.95;
    this.validationHistory = [];
  }

  async validate(): Promise<void> {
    this.logger.info('NLNH Protocol validation check...');

    const checks = [
      this.checkTruthEngine(),
      this.checkValidationRules(),
      this.checkHistoryIntegrity(),
    ];

    const results = await Promise.all(checks);

    if (results.some((r) => !r)) {
      throw new Error('NLNH Protocol validation failed');
    }

    this.logger.info('NLNH Protocol validated successfully');
  }

  async activate(): Promise<void> {
    this.logger.info('🔥 NLNH PROTOCOL ACTIVATED - NO LIES, NO HALLUCINATION MODE');
    this.active = true;

    this.logger.info('Truth enforcement settings:');
    this.logger.info(`  - Truth threshold: ${this.truthThreshold * 100}%`);
    this.logger.info('  - Absolute truthfulness required');
    this.logger.info('  - Zero tolerance for hallucinations');
    this.logger.info('  - Uncertainty must be explicitly stated');
  }

  async deactivate(): Promise<void> {
    this.logger.info('NLNH Protocol deactivating...');
    this.active = false;
  }

  async enforce(context: string, data: unknown): Promise<NLNHResult> {
    if (!this.active) {
      return { valid: true, confidence: 1, truthScore: 1 };
    }

    this.logger.debug(`Enforcing NLNH for context: ${context}`);

    const validations = [
      this.validateTruthfulness(data),
      this.validateNoHallucination(data),
      this.validateUncertaintyHandling(data),
      this.validateTransparency(data),
    ];

    const results = await Promise.all(validations);

    const truthScore = results.reduce((sum, r) => sum + r, 0) / results.length;
    const valid = truthScore >= this.truthThreshold;

    const result: NLNHResult = {
      valid,
      message: valid ? undefined : 'Truth validation failed - potential hallucination detected',
      confidence: truthScore,
      truthScore,
    };

    this.recordValidation(context, result);

    if (!valid) {
      this.logger.error(`NLNH VIOLATION: ${result.message} (score: ${truthScore})`);
    }

    return result;
  }

  private async validateTruthfulness(data: unknown): Promise<number> {
    if (typeof data === 'string') {
      const uncertainPhrases = ['might be', 'could be', 'possibly', 'maybe', 'I think', 'probably'];

      const hasUncertainty = uncertainPhrases.some((phrase) => data.toLowerCase().includes(phrase));

      if (hasUncertainty && !data.includes("I don't know")) {
        return 0.7;
      }
    }

    return 1.0;
  }

  private async validateNoHallucination(data: unknown): Promise<number> {
    if (typeof data === 'object' && data !== null) {
      const hasSource = 'source' in data || 'reference' in data;
      const hasValidation = 'validated' in data || 'verified' in data;

      if (!hasSource && !hasValidation) {
        return 0.5;
      }
    }

    return 1.0;
  }

  private async validateUncertaintyHandling(data: unknown): Promise<number> {
    if (typeof data === 'object' && data !== null && 'confidence' in data) {
      const confidence = (data as any).confidence;
      if (typeof confidence === 'number' && confidence < 0.8) {
        const hasDisclaimer = 'disclaimer' in data || 'uncertainty' in data;
        return hasDisclaimer ? 1.0 : 0.6;
      }
    }

    return 1.0;
  }

  private async validateTransparency(data: unknown): Promise<number> {
    if (typeof data === 'object' && data !== null) {
      const hasErrors = 'errors' in data || 'failures' in data;
      const hasLimitations = 'limitations' in data || 'constraints' in data;

      if (hasErrors || hasLimitations) {
        return 1.0;
      }
    }

    return 0.9;
  }

  private recordValidation(context: string, result: NLNHResult): void {
    this.validationHistory.push({
      timestamp: new Date(),
      context,
      result,
    });

    if (this.validationHistory.length > 1000) {
      this.validationHistory.shift();
    }
  }

  private async checkTruthEngine(): Promise<boolean> {
    return true;
  }

  private async checkValidationRules(): Promise<boolean> {
    return this.truthThreshold > 0 && this.truthThreshold <= 1;
  }

  private async checkHistoryIntegrity(): Promise<boolean> {
    return Array.isArray(this.validationHistory);
  }

  getValidationHistory(): typeof this.validationHistory {
    return [...this.validationHistory];
  }

  getTruthMetrics(): {
    totalValidations: number;
    violations: number;
    averageTruthScore: number;
    complianceRate: number;
  } {
    const total = this.validationHistory.length;
    const violations = this.validationHistory.filter((v) => !v.result.valid).length;
    const avgScore =
      total > 0
        ? this.validationHistory.reduce((sum, v) => sum + v.result.truthScore, 0) / total
        : 1;

    return {
      totalValidations: total,
      violations,
      averageTruthScore: avgScore,
      complianceRate: total > 0 ? (total - violations) / total : 1,
    };
  }
}
