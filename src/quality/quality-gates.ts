import type { QualityConfig, QualityGateResult } from '../types';
import { LogContext } from '../utils/logger';
import { execa } from 'execa';
import path from 'path';

interface QualityCheck {
  name: string;
  check: () => Promise<boolean>;
  critical: boolean;
}

export class QualityGates {
  private config: QualityConfig;
  private logger: LogContext;
  private checks: QualityCheck[];

  constructor(config: QualityConfig) {
    this.config = config;
    this.logger = new LogContext('QualityGates');
    this.checks = this.initializeChecks();
  }

  private initializeChecks(): QualityCheck[] {
    const checks: QualityCheck[] = [];

    if (this.config.linting) {
      checks.push({
        name: 'Linting',
        check: () => this.runLinting(),
        critical: true,
      });
    }

    if (this.config.testing) {
      checks.push({
        name: 'Testing',
        check: () => this.runTests(),
        critical: true,
      });

      checks.push({
        name: 'Test Coverage',
        check: () => this.checkCoverage(),
        critical: true,
      });
    }

    if (this.config.security) {
      checks.push({
        name: 'Security Scan',
        check: () => this.runSecurityScan(),
        critical: true,
      });
    }

    if (this.config.performance) {
      checks.push({
        name: 'Performance Check',
        check: () => this.checkPerformance(),
        critical: false,
      });
    }

    checks.push({
      name: 'TypeScript Compilation',
      check: () => this.runTypeCheck(),
      critical: true,
    });

    checks.push({
      name: 'Build Validation',
      check: () => this.runBuild(),
      critical: true,
    });

    return checks;
  }

  async validateConfiguration(): Promise<void> {
    this.logger.info('Validating quality gates configuration...');

    if (this.config.coverage < 0 || this.config.coverage > 100) {
      throw new Error(`Invalid coverage threshold: ${this.config.coverage}`);
    }

    this.logger.info(`Quality gates configured:`);
    this.logger.info(`  - Linting: ${this.config.linting ? '✅' : '❌'}`);
    this.logger.info(`  - Testing: ${this.config.testing ? '✅' : '❌'}`);
    this.logger.info(`  - Coverage: ${this.config.coverage}%`);
    this.logger.info(`  - Security: ${this.config.security ? '✅' : '❌'}`);
    this.logger.info(`  - Performance: ${this.config.performance ? '✅' : '❌'}`);
  }

  async validate(context: { executionId: string; phaseName: string }): Promise<QualityGateResult> {
    this.logger.info(`Running quality gates for ${context.phaseName}...`);

    const results: Array<{ name: string; passed: boolean; message?: string; details?: unknown }> =
      [];
    let allPassed = true;

    for (const check of this.checks) {
      this.logger.debug(`Running ${check.name}...`);

      try {
        const passed = await check.check();

        results.push({
          name: check.name,
          passed,
          message: passed ? `${check.name} passed` : `${check.name} failed`,
        });

        if (!passed && check.critical) {
          allPassed = false;
          this.logger.error(`❌ Critical check failed: ${check.name}`);
        } else if (!passed) {
          this.logger.warning(`⚠️ Non-critical check failed: ${check.name}`);
        } else {
          this.logger.info(`✅ ${check.name} passed`);
        }
      } catch (error) {
        results.push({
          name: check.name,
          passed: false,
          message: `${check.name} error: ${String(error)}`,
          details: error,
        });

        if (check.critical) {
          allPassed = false;
        }

        this.logger.error(`${check.name} failed with error`, error);
      }
    }

    const result: QualityGateResult = {
      passed: allPassed,
      checks: results,
    };

    if (allPassed) {
      this.logger.info('🎉 All quality gates passed!');
    } else {
      this.logger.error('🚫 Quality gates failed - blocking progression');
    }

    return result;
  }

  private async runLinting(): Promise<boolean> {
    try {
      const { stdout, stderr } = await execa('npm', ['run', 'lint'], {
        cwd: process.cwd(),
        reject: false,
      });

      if (stderr && stderr.includes('error')) {
        this.logger.error('Linting errors found', { stderr });
        return false;
      }

      return !stdout.includes(' error') && !stdout.includes(' warning');
    } catch (error) {
      this.logger.error('Linting failed', error);
      return false;
    }
  }

  private async runTests(): Promise<boolean> {
    try {
      const { exitCode } = await execa('npm', ['test'], {
        cwd: process.cwd(),
        reject: false,
      });

      return exitCode === 0;
    } catch (error) {
      this.logger.error('Tests failed', error);
      return false;
    }
  }

  private async checkCoverage(): Promise<boolean> {
    try {
      const { stdout } = await execa('npm', ['run', 'test:coverage'], {
        cwd: process.cwd(),
        reject: false,
      });

      const coverageMatch = stdout.match(/All files[^|]*\|[^|]*\|[^|]*\|[^|]*\|\s*(\d+(?:\.\d+)?)/);

      if (coverageMatch) {
        const coverage = parseFloat(coverageMatch[1]);
        this.logger.info(`Test coverage: ${coverage}%`);
        return coverage >= this.config.coverage;
      }

      return false;
    } catch (error) {
      this.logger.error('Coverage check failed', error);
      return false;
    }
  }

  private async runSecurityScan(): Promise<boolean> {
    try {
      const { stdout } = await execa('npm', ['audit', '--json'], {
        cwd: process.cwd(),
        reject: false,
      });

      const audit = JSON.parse(stdout);
      const vulnerabilities = audit.metadata?.vulnerabilities || {};

      const critical = vulnerabilities.critical || 0;
      const high = vulnerabilities.high || 0;

      if (critical > 0 || high > 0) {
        this.logger.error(`Security vulnerabilities found: ${critical} critical, ${high} high`);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error('Security scan failed', error);
      return false;
    }
  }

  private async checkPerformance(): Promise<boolean> {
    this.logger.debug('Performance check placeholder - implement based on project needs');
    return true;
  }

  private async runTypeCheck(): Promise<boolean> {
    try {
      const { exitCode, stderr } = await execa('npm', ['run', 'typecheck'], {
        cwd: process.cwd(),
        reject: false,
      });

      if (stderr && stderr.includes('error')) {
        this.logger.error('TypeScript errors found', { stderr });
        return false;
      }

      return exitCode === 0;
    } catch (error) {
      this.logger.error('TypeScript check failed', error);
      return false;
    }
  }

  private async runBuild(): Promise<boolean> {
    try {
      const { exitCode } = await execa('npm', ['run', 'build'], {
        cwd: process.cwd(),
        reject: false,
      });

      return exitCode === 0;
    } catch (error) {
      this.logger.error('Build failed', error);
      return false;
    }
  }

  async runQuickCheck(): Promise<boolean> {
    this.logger.info('Running quick quality check...');

    const quickChecks = [this.runTypeCheck(), this.runLinting()];

    const results = await Promise.all(quickChecks);
    const passed = results.every((r) => r);

    if (passed) {
      this.logger.info('✅ Quick check passed');
    } else {
      this.logger.error('❌ Quick check failed');
    }

    return passed;
  }

  async generateReport(): Promise<string> {
    const result = await this.validate({ executionId: 'report', phaseName: 'manual' });

    const report = [
      '# Quality Gates Report',
      `Generated: ${new Date().toISOString()}`,
      '',
      `## Overall Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`,
      '',
      '## Check Results:',
    ];

    for (const check of result.checks) {
      const status = check.passed ? '✅' : '❌';
      report.push(`- ${status} ${check.name}: ${check.message || ''}`);
    }

    return report.join('\n');
  }
}
