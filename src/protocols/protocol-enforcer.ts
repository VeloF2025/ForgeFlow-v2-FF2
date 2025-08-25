import type { ProtocolConfig, ProtocolViolation } from '../types';
import { LogContext } from '../utils/logger';
import { NLNHProtocol } from './nlnh-protocol';
import { AntiHallProtocol } from './antihall-protocol';
import { RYRProtocol } from './ryr-protocol';

export class ProtocolEnforcer {
  private config: ProtocolConfig;
  private nlnh: NLNHProtocol;
  private antihall: AntiHallProtocol;
  private ryr: RYRProtocol;
  private violations: ProtocolViolation[];
  private logger: LogContext;

  constructor(config: ProtocolConfig) {
    this.config = config;
    this.logger = new LogContext('ProtocolEnforcer');
    this.violations = [];

    this.nlnh = new NLNHProtocol();
    this.antihall = new AntiHallProtocol();
    this.ryr = new RYRProtocol(config.rulesPath);

    this.logger.info('Protocol Enforcer initialized with all safety protocols');
  }

  async validateProtocols(): Promise<void> {
    this.logger.info('Validating all protocols...');

    const validations = [
      { name: 'NLNH', enabled: this.config.nlnh, validator: () => this.nlnh.validate() },
      {
        name: 'AntiHall',
        enabled: this.config.antihall,
        validator: () => this.antihall.validate(),
      },
      { name: 'RYR', enabled: this.config.ryr, validator: () => this.ryr.validate() },
    ];

    for (const validation of validations) {
      if (validation.enabled) {
        try {
          await validation.validator();
          this.logger.info(`✅ ${validation.name} protocol: ACTIVE`);
        } catch (error) {
          this.logger.error(`❌ ${validation.name} protocol: FAILED`, error);
          throw new Error(`Protocol validation failed: ${validation.name}`);
        }
      } else {
        this.logger.warning(`⚠️ ${validation.name} protocol: DISABLED`);
      }
    }
  }

  async enforcePreExecution(): Promise<void> {
    this.logger.info('Enforcing pre-execution protocols...');

    if (this.config.ryr) {
      await this.ryr.loadRules();
      const rules = await this.ryr.getRules();
      this.logger.info(`Loaded ${rules.length} rules for enforcement`);
    }

    if (this.config.nlnh) {
      await this.nlnh.activate();
      this.logger.info('NLNH Protocol: Truth mode activated');
    }

    if (this.config.antihall) {
      await this.antihall.initialize();
      this.logger.info('AntiHall Protocol: Validation ready');
    }
  }

  async enforceNLNH(context: string, data: unknown): Promise<boolean> {
    if (!this.config.nlnh) return true;

    try {
      const result = await this.nlnh.enforce(context, data);
      if (!result.valid) {
        this.recordViolation('nlnh', 'error', result.message || 'NLNH violation detected', {
          context,
          data,
        });
        return false;
      }
      return true;
    } catch (error) {
      this.logger.error('NLNH enforcement failed', error);
      return false;
    }
  }

  async enforceAntiHall(code: string, context: string): Promise<boolean> {
    if (!this.config.antihall) return true;

    try {
      const result = await this.antihall.validateCode(code, context);
      if (!result.valid) {
        const violations = result.violations || [];
        for (const violation of violations) {
          this.recordViolation('antihall', 'critical', violation, { code, context });
        }
        return false;
      }
      return true;
    } catch (error) {
      this.logger.error('AntiHall enforcement failed', error);
      return false;
    }
  }

  async enforceRYR(action: string, context: unknown): Promise<boolean> {
    if (!this.config.ryr) return true;

    try {
      const result = await this.ryr.checkCompliance(action, context);
      if (!result.compliant) {
        const violations = result.violations || [];
        for (const violation of violations) {
          this.recordViolation('ryr', 'error', violation, { action, context });
        }
        return false;
      }
      return true;
    } catch (error) {
      this.logger.error('RYR enforcement failed', error);
      return false;
    }
  }

  private recordViolation(
    protocol: string,
    severity: 'warning' | 'error' | 'critical',
    message: string,
    context?: unknown,
  ): void {
    const violation: ProtocolViolation = {
      protocol,
      severity,
      message,
      timestamp: new Date(),
      context,
    };

    this.violations.push(violation);

    const emoji = severity === 'critical' ? '🔴' : severity === 'error' ? '❌' : '⚠️';
    this.logger.error(`${emoji} Protocol Violation [${protocol}]: ${message}`);

    if (severity === 'critical') {
      throw new Error(`CRITICAL VIOLATION [${protocol}]: ${message}`);
    }
  }

  getViolations(): ProtocolViolation[] {
    return [...this.violations];
  }

  clearViolations(): void {
    this.violations = [];
  }

  async generateComplianceReport(): Promise<{
    timestamp: Date;
    protocols: Record<string, boolean>;
    violations: ProtocolViolation[];
    summary: string;
  }> {
    const report = {
      timestamp: new Date(),
      protocols: {
        nlnh: this.config.nlnh,
        antihall: this.config.antihall,
        ryr: this.config.ryr,
      },
      violations: this.getViolations(),
      summary: this.generateSummary(),
    };

    this.logger.info('Compliance report generated', report);
    return report;
  }

  private generateSummary(): string {
    const total = this.violations.length;
    const critical = this.violations.filter((v) => v.severity === 'critical').length;
    const errors = this.violations.filter((v) => v.severity === 'error').length;
    const warnings = this.violations.filter((v) => v.severity === 'warning').length;

    if (total === 0) {
      return '✅ Full compliance - No violations detected';
    }

    return `⚠️ ${total} violations: ${critical} critical, ${errors} errors, ${warnings} warnings`;
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Protocol Enforcer...');

    await this.nlnh.deactivate();
    await this.antihall.shutdown();
    await this.ryr.shutdown();

    this.clearViolations();
    this.logger.info('Protocol Enforcer shutdown complete');
  }
}
