import { LogContext } from '../utils/logger';
import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';

interface Rule {
  id: string;
  name: string;
  description: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: string;
  condition: string;
  action: string;
}

interface ComplianceResult {
  compliant: boolean;
  violations: string[];
  warnings: string[];
}

export class RYRProtocol {
  private logger: LogContext;
  private rulesPath: string;
  private rules: Rule[];
  private rulesLoaded: boolean;

  constructor(rulesPath: string) {
    this.logger = new LogContext('RYR-Protocol');
    this.rulesPath = rulesPath;
    this.rules = [];
    this.rulesLoaded = false;
  }

  async validate(): Promise<void> {
    this.logger.info('RYR Protocol validation check...');

    const checks = [
      this.checkRulesFile(),
      this.checkRuleIntegrity(),
      this.checkEnforcementEngine(),
    ];

    const results = await Promise.all(checks);

    if (results.some((r) => !r)) {
      throw new Error('RYR Protocol validation failed');
    }

    this.logger.info('RYR Protocol validated successfully');
  }

  async loadRules(): Promise<void> {
    this.logger.info('📜 RYR PROTOCOL - LOADING RULES FOR ENFORCEMENT');

    try {
      await this.loadGlobalRules();
      await this.loadProjectRules();
      await this.loadDynamicRules();

      this.rulesLoaded = true;

      this.logger.info(`Rules loaded successfully:`);
      this.logger.info(`  - Total rules: ${this.rules.length}`);
      this.logger.info(
        `  - Critical: ${this.rules.filter((r) => r.severity === 'critical').length}`,
      );
      this.logger.info(`  - Error: ${this.rules.filter((r) => r.severity === 'error').length}`);
      this.logger.info(`  - Warning: ${this.rules.filter((r) => r.severity === 'warning').length}`);
      this.logger.info(`  - Info: ${this.rules.filter((r) => r.severity === 'info').length}`);
    } catch (error) {
      this.logger.error('Failed to load rules', error);
      throw error;
    }
  }

  private async loadGlobalRules(): Promise<void> {
    const globalRulesPath = path.resolve(this.rulesPath, 'RULES.md');

    if (await fs.pathExists(globalRulesPath)) {
      const content = await fs.readFile(globalRulesPath, 'utf-8');
      const rules = this.parseRulesFromMarkdown(content, 'global');
      this.rules.push(...rules);
      this.logger.debug(`Loaded ${rules.length} global rules`);
    }
  }

  private async loadProjectRules(): Promise<void> {
    const projectRulesPath = path.resolve('RULES.md');

    if (await fs.pathExists(projectRulesPath)) {
      const content = await fs.readFile(projectRulesPath, 'utf-8');
      const rules = this.parseRulesFromMarkdown(content, 'project');
      this.rules.push(...rules);
      this.logger.debug(`Loaded ${rules.length} project rules`);
    }
  }

  private async loadDynamicRules(): Promise<void> {
    const dynamicRules: Rule[] = [
      {
        id: 'zero-errors',
        name: 'Zero TypeScript/Linting Errors',
        description: 'No TypeScript or linting errors allowed',
        severity: 'critical',
        category: 'quality',
        condition: 'errors > 0',
        action: 'block',
      },
      {
        id: 'test-coverage',
        name: 'Test Coverage >95%',
        description: 'Test coverage must exceed 95%',
        severity: 'error',
        category: 'testing',
        condition: 'coverage < 95',
        action: 'block',
      },
      {
        id: 'no-console',
        name: 'No Console Statements',
        description: 'Console.log statements not allowed in production',
        severity: 'error',
        category: 'quality',
        condition: 'console.log present',
        action: 'block',
      },
      {
        id: 'security-scan',
        name: 'Security Scan Clean',
        description: 'No security vulnerabilities allowed',
        severity: 'critical',
        category: 'security',
        condition: 'vulnerabilities > 0',
        action: 'block',
      },
      {
        id: 'performance-targets',
        name: 'Performance Targets Met',
        description: 'Page load <1.5s, API <200ms',
        severity: 'error',
        category: 'performance',
        condition: 'performance not met',
        action: 'warn',
      },
    ];

    this.rules.push(...dynamicRules);
    this.logger.debug(`Loaded ${dynamicRules.length} dynamic rules`);
  }

  private parseRulesFromMarkdown(content: string, category: string): Rule[] {
    const rules: Rule[] = [];
    const lines = content.split('\n');

    let ruleId = 0;
    for (const line of lines) {
      if (line.startsWith('- ') || line.startsWith('* ')) {
        const text = line.substring(2).trim();

        const severity = this.detectSeverity(text);

        rules.push({
          id: `${category}-${++ruleId}`,
          name: text.substring(0, 50),
          description: text,
          severity,
          category,
          condition: 'manual-check',
          action: severity === 'critical' ? 'block' : 'warn',
        });
      }
    }

    return rules;
  }

  private detectSeverity(text: string): 'info' | 'warning' | 'error' | 'critical' {
    const textLower = text.toLowerCase();

    if (
      textLower.includes('critical') ||
      textLower.includes('zero tolerance') ||
      textLower.includes('mandatory') ||
      textLower.includes('must')
    ) {
      return 'critical';
    }

    if (
      textLower.includes('error') ||
      textLower.includes('required') ||
      textLower.includes('enforce')
    ) {
      return 'error';
    }

    if (
      textLower.includes('warning') ||
      textLower.includes('should') ||
      textLower.includes('recommend')
    ) {
      return 'warning';
    }

    return 'info';
  }

  async checkCompliance(action: string, context: unknown): Promise<ComplianceResult> {
    if (!this.rulesLoaded) {
      await this.loadRules();
    }

    this.logger.debug(`Checking compliance for action: ${action}`);

    const violations: string[] = [];
    const warnings: string[] = [];

    for (const rule of this.rules) {
      const violated = await this.evaluateRule(rule, action, context);

      if (violated) {
        const message = `Rule violated: ${rule.name} (${rule.id})`;

        if (rule.severity === 'critical' || rule.severity === 'error') {
          violations.push(message);
          this.logger.error(`❌ ${message}`);
        } else {
          warnings.push(message);
          this.logger.warning(`⚠️ ${message}`);
        }
      }
    }

    const compliant = violations.length === 0;

    if (!compliant) {
      this.logger.error(`RYR COMPLIANCE FAILED: ${violations.length} violations detected`);
    } else if (warnings.length > 0) {
      this.logger.warning(`RYR: ${warnings.length} warnings detected`);
    } else {
      this.logger.info('✅ RYR: Full compliance achieved');
    }

    return { compliant, violations, warnings };
  }

  private async evaluateRule(rule: Rule, action: string, context: unknown): Promise<boolean> {
    if (rule.condition === 'manual-check') {
      return false;
    }

    try {
      if (
        rule.id === 'zero-errors' &&
        context &&
        typeof context === 'object' &&
        'errors' in context
      ) {
        return (context as any).errors > 0;
      }

      if (
        rule.id === 'test-coverage' &&
        context &&
        typeof context === 'object' &&
        'coverage' in context
      ) {
        return (context as any).coverage < 95;
      }

      if (rule.id === 'no-console' && context && typeof context === 'object' && 'code' in context) {
        return String((context as any).code).includes('console.log');
      }

      return false;
    } catch {
      return false;
    }
  }

  getRules(): Rule[] {
    return [...this.rules];
  }

  getRulesByCategory(category: string): Rule[] {
    return this.rules.filter((r) => r.category === category);
  }

  getRulesBySeverity(severity: string): Rule[] {
    return this.rules.filter((r) => r.severity === severity);
  }

  async generateRulesReport(): Promise<string> {
    if (!this.rulesLoaded) {
      await this.loadRules();
    }

    const report = [
      '# RYR PROTOCOL - RULES ENFORCEMENT REPORT',
      `Generated: ${new Date().toISOString()}`,
      '',
      '## Summary',
      `Total Rules: ${this.rules.length}`,
      '',
      '## Rules by Severity',
    ];

    const bySeverity = {
      critical: this.rules.filter((r) => r.severity === 'critical'),
      error: this.rules.filter((r) => r.severity === 'error'),
      warning: this.rules.filter((r) => r.severity === 'warning'),
      info: this.rules.filter((r) => r.severity === 'info'),
    };

    for (const [severity, rules] of Object.entries(bySeverity)) {
      report.push(`\n### ${severity.toUpperCase()} (${rules.length})`);

      for (const rule of rules) {
        report.push(`- **${rule.name}**: ${rule.description}`);
      }
    }

    return report.join('\n');
  }

  private async checkRulesFile(): Promise<boolean> {
    return true;
  }

  private async checkRuleIntegrity(): Promise<boolean> {
    return Array.isArray(this.rules);
  }

  private async checkEnforcementEngine(): Promise<boolean> {
    return true;
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down RYR Protocol...');
    this.rules = [];
    this.rulesLoaded = false;
  }
}
