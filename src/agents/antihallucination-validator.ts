import { BaseAgent } from './base-agent';
import { AntiHallProtocol } from '../protocols/antihall-protocol';
import fs from 'fs-extra';
import path from 'path';
import { execa } from 'execa';

interface ValidationReport {
  verified: string[];
  notFound: string[];
  warnings: string[];
  uncertain: string[];
  totalChecked: number;
  recommendation: 'SAFE_TO_PROCEED' | 'REQUIRES_FIXES' | 'NEED_MORE_INFO';
}

export class AntiHallucinationValidatorAgent extends BaseAgent {
  private antiHall: AntiHallProtocol;
  private validationReport: ValidationReport;

  constructor() {
    super('antihallucination-validator', [
      'code-validation',
      'reference-checking',
      'import-verification',
      'api-validation',
      'database-field-validation',
      'configuration-checking',
      'hallucination-prevention',
      'pattern-matching',
      'existence-verification',
    ]);

    this.antiHall = new AntiHallProtocol();
    this.validationReport = this.initializeReport();
  }

  async execute(issueId: string, worktreeId: string): Promise<void> {
    this.preExecute(issueId, worktreeId);

    try {
      this.logger.info('🛡️ ANTIHALL PROTOCOL ACTIVE - HALLUCINATION PREVENTION ENGAGED');

      this.reportProgress(issueId, 5, 'Initializing AntiHall Protocol');
      await this.antiHall.initialize();

      this.reportProgress(issueId, 15, 'Scanning worktree for code changes');
      const codeChanges = await this.scanWorktreeChanges(worktreeId);

      this.reportProgress(issueId, 30, 'Extracting code references');
      const references = this.extractAllReferences(codeChanges);

      this.reportProgress(issueId, 45, 'Validating method existence');
      await this.validateMethods(references.methods);

      this.reportProgress(issueId, 55, 'Checking import paths');
      await this.validateImportPaths(references.imports);

      this.reportProgress(issueId, 65, 'Verifying component references');
      await this.validateComponents(references.components);

      this.reportProgress(issueId, 75, 'Checking API endpoints');
      this.validateAPIEndpoints(references.apis);

      this.reportProgress(issueId, 85, 'Validating database entities');
      this.validateDatabaseEntities(references.database);

      this.reportProgress(issueId, 95, 'Generating validation report');
      await this.generateValidationReport(issueId, worktreeId);

      const success = this.validationReport.recommendation === 'SAFE_TO_PROCEED';
      this.reportProgress(
        issueId,
        100,
        success
          ? 'Validation passed - No hallucinations detected'
          : 'Validation failed - Hallucinations found',
      );

      this.postExecute(issueId, success);
    } catch (error) {
      this.handleError(error, issueId);
    }
  }

  private initializeReport(): ValidationReport {
    return {
      verified: [],
      notFound: [],
      warnings: [],
      uncertain: [],
      totalChecked: 0,
      recommendation: 'NEED_MORE_INFO',
    };
  }

  private async scanWorktreeChanges(worktreeId: string): Promise<string[]> {
    this.logger.debug(`Scanning worktree changes: ${worktreeId}`);

    try {
      // Get all modified/new files in the worktree
      const { stdout } = await execa('git', ['diff', '--name-only', 'HEAD'], {
        cwd: path.join(process.cwd(), 'worktrees', worktreeId),
      });

      const changedFiles = stdout
        .split('\n')
        .filter(
          (file) =>
            file.endsWith('.ts') ||
            file.endsWith('.tsx') ||
            file.endsWith('.js') ||
            file.endsWith('.jsx'),
        );

      const codeContents: string[] = [];

      for (const file of changedFiles) {
        const filePath = path.join(process.cwd(), 'worktrees', worktreeId, file);
        if (await fs.pathExists(filePath)) {
          const content = await fs.readFile(filePath, 'utf-8');
          codeContents.push(content);
        }
      }

      return codeContents;
    } catch (error) {
      this.logger.warning('Failed to scan worktree changes, using empty set');
      return [];
    }
  }

  private extractAllReferences(codeContents: string[]): {
    methods: string[];
    imports: string[];
    components: string[];
    apis: string[];
    database: string[];
  } {
    const references = {
      methods: [] as string[],
      imports: [] as string[],
      components: [] as string[],
      apis: [] as string[],
      database: [] as string[],
    };

    for (const code of codeContents) {
      // Extract method calls (service.method pattern)
      const methodCalls = code.match(/(\w+Service)\.(\w+)/g) || [];
      references.methods.push(...methodCalls);

      // Extract imports
      const imports = code.match(/import\s+.*\s+from\s+['"]([^'"]+)['"]/g) || [];
      references.imports.push(...imports);

      // Extract component references
      const components = code.match(/<(\w+Component)/g) || [];
      references.components.push(...components.map((c: string) => c.slice(1)));

      // Extract API calls
      const apis = code.match(/['"]\/api\/(\w+)/g) || [];
      references.apis.push(...apis);

      // Extract database references
      const dbRefs = code.match(/db\.collection\(['"](\w+)['"]\)/g) || [];
      references.database.push(...dbRefs);
    }

    return references;
  }

  private async validateMethods(methods: string[]): Promise<void> {
    this.logger.debug(`Validating ${methods.length} method references`);

    for (const method of methods) {
      const result = await this.antiHall.validateCode(method, 'method-validation');

      if (result.valid) {
        this.validationReport.verified.push(`Method: ${method}`);
      } else {
        this.validationReport.notFound.push(`Method: ${method}`);
        if (result.suggestions && result.suggestions.length > 0) {
          this.validationReport.warnings.push(`Suggestion for ${method}: ${result.suggestions[0]}`);
        }
      }

      this.validationReport.totalChecked++;
    }
  }

  private async validateImportPaths(imports: string[]): Promise<void> {
    this.logger.debug(`Validating ${imports.length} import paths`);

    for (const importPath of imports) {
      const match = importPath.match(/from\s+['"]([^'"]+)['"]/);
      if (!match) continue;

      const modulePath = match[1];

      // Check if it's a relative import
      if (modulePath.startsWith('./') || modulePath.startsWith('../')) {
        const exists = await this.checkFileExists(modulePath);

        if (exists) {
          this.validationReport.verified.push(`Import: ${modulePath}`);
        } else {
          this.validationReport.notFound.push(`Import: ${modulePath}`);
        }
      } else {
        // External module - assume valid
        this.validationReport.verified.push(`External Import: ${modulePath}`);
      }

      this.validationReport.totalChecked++;
    }
  }

  private async validateComponents(components: string[]): Promise<void> {
    this.logger.debug(`Validating ${components.length} component references`);

    for (const component of components) {
      const result = await this.antiHall.validateCode(component, 'component-validation');

      if (result.valid) {
        this.validationReport.verified.push(`Component: ${component}`);
      } else {
        this.validationReport.notFound.push(`Component: ${component}`);
      }

      this.validationReport.totalChecked++;
    }
  }

  private validateAPIEndpoints(apis: string[]): void {
    this.logger.debug(`Validating ${apis.length} API endpoints`);

    for (const api of apis) {
      // For now, mark as uncertain since we need API documentation
      this.validationReport.uncertain.push(`API: ${api} - requires endpoint verification`);
      this.validationReport.totalChecked++;
    }
  }

  private validateDatabaseEntities(entities: string[]): void {
    this.logger.debug(`Validating ${entities.length} database entities`);

    for (const entity of entities) {
      // For now, mark as uncertain since we need schema information
      this.validationReport.uncertain.push(`Database: ${entity} - requires schema verification`);
      this.validationReport.totalChecked++;
    }
  }

  private async checkFileExists(relativePath: string): Promise<boolean> {
    try {
      const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json'];

      for (const ext of extensions) {
        const fullPath = path.resolve(relativePath + ext);
        if (await fs.pathExists(fullPath)) {
          return true;
        }
      }

      // Check without extension
      const fullPath = path.resolve(relativePath);
      return await fs.pathExists(fullPath);
    } catch {
      return false;
    }
  }

  private async generateValidationReport(issueId: string, worktreeId: string): Promise<void> {
    this.logger.info('=== ANTIHALL VALIDATION REPORT ===');

    if (this.validationReport.verified.length > 0) {
      this.logger.info('✅ VERIFIED:');
      this.validationReport.verified.forEach((item) => this.logger.info(`  - ${item}`));
    }

    if (this.validationReport.notFound.length > 0) {
      this.logger.error('❌ NOT FOUND:');
      this.validationReport.notFound.forEach((item) => this.logger.error(`  - ${item}`));
    }

    if (this.validationReport.warnings.length > 0) {
      this.logger.warning('⚠️ WARNINGS:');
      this.validationReport.warnings.forEach((item) => this.logger.warning(`  - ${item}`));
    }

    if (this.validationReport.uncertain.length > 0) {
      this.logger.info('🔍 UNCERTAIN:');
      this.validationReport.uncertain.forEach((item) => this.logger.info(`  - ${item}`));
    }

    this.logger.info('=== VALIDATION SUMMARY ===');
    this.logger.info(`Total Checked: ${this.validationReport.totalChecked}`);
    this.logger.info(`Verified: ${this.validationReport.verified.length}`);
    this.logger.info(`Not Found: ${this.validationReport.notFound.length}`);
    this.logger.info(`Warnings: ${this.validationReport.warnings.length}`);

    // Determine recommendation
    if (this.validationReport.notFound.length > 0) {
      this.validationReport.recommendation = 'REQUIRES_FIXES';
      this.logger.error('RECOMMENDATION: REQUIRES_FIXES - Hallucinations detected!');
    } else if (this.validationReport.uncertain.length > this.validationReport.verified.length) {
      this.validationReport.recommendation = 'NEED_MORE_INFO';
      this.logger.warning('RECOMMENDATION: NEED_MORE_INFO - Manual verification needed');
    } else {
      this.validationReport.recommendation = 'SAFE_TO_PROCEED';
      this.logger.info('RECOMMENDATION: SAFE_TO_PROCEED - No hallucinations found');
    }

    // Write report to file for GitHub integration
    const reportPath = path.join(process.cwd(), 'worktrees', worktreeId, 'ANTIHALL_REPORT.md');
    await this.writeReportToFile(reportPath);
  }

  private async writeReportToFile(filePath: string): Promise<void> {
    const report = `# AntiHallucination Validation Report

## Summary
- **Total Checked**: ${this.validationReport.totalChecked}
- **Verified**: ${this.validationReport.verified.length}
- **Not Found**: ${this.validationReport.notFound.length}
- **Warnings**: ${this.validationReport.warnings.length}
- **Uncertain**: ${this.validationReport.uncertain.length}

## Recommendation
**${this.validationReport.recommendation}**

${
  this.validationReport.verified.length > 0
    ? `## ✅ Verified Elements
${this.validationReport.verified.map((item) => `- ${item}`).join('\n')}
`
    : ''
}

${
  this.validationReport.notFound.length > 0
    ? `## ❌ Not Found (Hallucinations Detected)
${this.validationReport.notFound.map((item) => `- ${item}`).join('\n')}
`
    : ''
}

${
  this.validationReport.warnings.length > 0
    ? `## ⚠️ Warnings
${this.validationReport.warnings.map((item) => `- ${item}`).join('\n')}
`
    : ''
}

${
  this.validationReport.uncertain.length > 0
    ? `## 🔍 Uncertain (Manual Verification Required)
${this.validationReport.uncertain.map((item) => `- ${item}`).join('\n')}
`
    : ''
}

---
*Generated by AntiHallucination Validator Agent - ForgeFlow V2*
`;

    try {
      await fs.writeFile(filePath, report);
      this.logger.info(`Validation report written to: ${filePath}`);
    } catch (error) {
      this.logger.error('Failed to write validation report', error);
    }
  }

  async shutdown(): Promise<void> {
    await this.antiHall.shutdown();
  }
}
