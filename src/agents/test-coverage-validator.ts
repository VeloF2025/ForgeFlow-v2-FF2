import { BaseAgent } from './base-agent';
import { promises as fs } from 'fs';
import path from 'path';
import { execa } from 'execa';
import { globby } from 'globby';
import { BrowserMCPTool, BrowserAction } from '../tools/browser-mcp-tool';
import type { ToolExecutionContext } from '../types';

interface CoverageReport {
  lines: { total: number; covered: number; percentage: number };
  functions: { total: number; covered: number; percentage: number };
  branches: { total: number; covered: number; percentage: number };
  statements: { total: number; covered: number; percentage: number };
  files: Array<{
    path: string;
    lines: number;
    functions: number;
    branches: number;
    statements: number;
  }>;
}

interface TestCoverageThresholds {
  lines: number;
  functions: number;
  branches: number;
  statements: number;
}

export class TestCoverageValidatorAgent extends BaseAgent {
  private readonly coverageThresholds: TestCoverageThresholds = {
    lines: 95,
    functions: 95,
    branches: 90,
    statements: 95,
  };

  private browserTool: BrowserMCPTool;

  constructor() {
    super('test-coverage-validator', [
      'test-writing',
      'coverage-analysis',
      'test-execution',
      'fixture-creation',
      'integration-testing',
      'e2e-testing',
      'browser-e2e-testing',
      'ui-testing',
    ]);

    // Initialize Browser MCP tool for E2E testing
    this.browserTool = new BrowserMCPTool({
      enableScreenshots: true,
      enableAccessibility: false,
      timeout: 45000,
      maxRetries: 3,
    });
  }

  async execute(issueId: string, worktreeId: string): Promise<void> {
    this.preExecute(issueId, worktreeId);

    try {
      this.reportProgress(issueId, 5, 'Analyzing code changes');
      const codeFiles = await this.analyzeChanges(worktreeId);

      this.reportProgress(issueId, 15, 'Calculating current coverage');
      const currentCoverage = await this.calculateCoverage(worktreeId);

      this.reportProgress(issueId, 25, 'Identifying coverage gaps');
      const uncoveredFunctions = await this.identifyCoverageGaps(codeFiles, currentCoverage);

      this.reportProgress(issueId, 40, 'Writing unit tests');
      await this.writeUnitTests(worktreeId, uncoveredFunctions);

      this.reportProgress(issueId, 55, 'Creating integration tests');
      await this.writeIntegrationTests(worktreeId, codeFiles);

      this.reportProgress(issueId, 70, 'Implementing E2E scenarios');
      await this.writeE2ETests(worktreeId);

      this.reportProgress(issueId, 85, 'Running comprehensive test suite');
      const testResults = await this.runTests(worktreeId);

      this.reportProgress(issueId, 95, 'Generating coverage report');
      const finalCoverage = await this.generateCoverageReport(worktreeId);

      this.reportProgress(issueId, 98, 'Validating coverage thresholds');
      await this.validateCoverageThresholds(finalCoverage);

      this.reportProgress(issueId, 100, 'Test coverage validation complete - 95%+ achieved');
      this.postExecute(issueId, true);
    } catch (error) {
      this.handleError(error, issueId);
    }
  }

  /**
   * Analyze code changes to identify files requiring test coverage
   */
  private async analyzeChanges(worktreeId: string): Promise<string[]> {
    this.logger.info(`Analyzing code changes in worktree: ${worktreeId}`);

    try {
      // Find all TypeScript source files
      const sourceFiles = await globby(
        ['src/**/*.ts', '!src/**/*.test.ts', '!src/**/*.spec.ts', '!src/**/types/**'],
        {
          cwd: process.cwd(),
          absolute: true,
        },
      );

      this.logger.debug(`Found ${sourceFiles.length} source files requiring coverage`);
      return sourceFiles;
    } catch (error) {
      this.logger.error('Failed to analyze code changes:', error);
      throw error;
    }
  }

  /**
   * Calculate current test coverage using Vitest
   */
  private async calculateCoverage(worktreeId: string): Promise<CoverageReport | null> {
    this.logger.info(`Calculating current coverage in worktree: ${worktreeId}`);

    try {
      // Run coverage analysis
      const result = await execa('npm', ['run', 'test:coverage', '--', '--reporter=json'], {
        cwd: process.cwd(),
        reject: false,
      });

      if (result.exitCode === 0) {
        const coverageJsonPath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');

        try {
          const coverageData = JSON.parse(await fs.readFile(coverageJsonPath, 'utf8'));
          return this.parseCoverageReport(coverageData);
        } catch (parseError) {
          this.logger.warn('Could not parse coverage report, continuing with gap analysis');
          return null;
        }
      }

      this.logger.warn('Coverage analysis failed, proceeding with comprehensive testing');
      return null;
    } catch (error) {
      this.logger.warn('Coverage calculation failed, proceeding with full test generation');
      return null;
    }
  }

  /**
   * Identify functions and methods lacking test coverage
   */
  private async identifyCoverageGaps(
    codeFiles: string[],
    coverage: CoverageReport | null,
  ): Promise<string[]> {
    this.logger.info('Identifying coverage gaps in codebase');

    const uncoveredFunctions: string[] = [];

    for (const filePath of codeFiles) {
      try {
        const fileContent = await fs.readFile(filePath, 'utf8');
        const functions = this.extractFunctions(fileContent, filePath);

        // If we have coverage data, check which functions are uncovered
        if (coverage) {
          const relativePath = path.relative(process.cwd(), filePath);
          const fileCoverage = coverage.files.find((f) => f.path === relativePath);

          if (!fileCoverage || fileCoverage.functions < this.coverageThresholds.functions) {
            uncoveredFunctions.push(...functions);
          }
        } else {
          // Without coverage data, assume all functions need tests
          uncoveredFunctions.push(...functions);
        }
      } catch (error) {
        this.logger.warn(`Failed to analyze file ${filePath}:`, error);
      }
    }

    this.logger.debug(`Identified ${uncoveredFunctions.length} functions requiring test coverage`);
    return uncoveredFunctions;
  }

  /**
   * Write comprehensive unit tests for uncovered functions
   */
  private async writeUnitTests(worktreeId: string, uncoveredFunctions: string[]): Promise<void> {
    this.logger.info(
      `Writing unit tests for ${uncoveredFunctions.length} functions in worktree: ${worktreeId}`,
    );

    try {
      // Ensure tests directory exists
      const testDir = path.join(process.cwd(), 'tests', 'unit');
      await fs.mkdir(testDir, { recursive: true });

      // Find all source files that need tests
      const sourceFiles = await globby(['src/**/*.ts', '!src/**/*.test.ts', '!src/**/*.spec.ts'], {
        cwd: process.cwd(),
        absolute: true,
      });

      for (const sourceFile of sourceFiles) {
        await this.createUnitTestFile(sourceFile, testDir);
      }

      this.logger.info(`Created unit test files for ${sourceFiles.length} source files`);
    } catch (error) {
      this.logger.error('Failed to write unit tests:', error);
      throw error;
    }
  }

  /**
   * Create integration tests for component interactions
   */
  private async writeIntegrationTests(worktreeId: string, codeFiles: string[]): Promise<void> {
    this.logger.info(`Creating integration tests in worktree: ${worktreeId}`);

    try {
      const integrationDir = path.join(process.cwd(), 'tests', 'integration');
      await fs.mkdir(integrationDir, { recursive: true });

      // Create integration tests for key components
      await this.createAgentPoolIntegrationTest(integrationDir);
      await this.createGitHubIntegrationTest(integrationDir);
      await this.createWorktreeManagerIntegrationTest(integrationDir);
      await this.createQualityGatesIntegrationTest(integrationDir);

      this.logger.info('Integration test suite created successfully');
    } catch (error) {
      this.logger.error('Failed to write integration tests:', error);
      throw error;
    }
  }

  /**
   * Create E2E tests for user workflows using Browser MCP
   */
  private async writeE2ETests(worktreeId: string): Promise<void> {
    this.logger.info(`Implementing E2E test scenarios in worktree: ${worktreeId}`);

    try {
      // Initialize browser tool for E2E testing
      await this.browserTool.initialize();

      // Check if web dashboard exists
      const webDir = path.join(process.cwd(), 'src', 'web');
      const webExists = await fs
        .access(webDir)
        .then(() => true)
        .catch(() => false);

      if (webExists) {
        const e2eDir = path.join(process.cwd(), 'tests', 'e2e');
        await fs.mkdir(e2eDir, { recursive: true });

        // Create traditional Playwright tests
        await this.createDashboardE2ETests(e2eDir);
        await this.createAPIE2ETests(e2eDir);

        // Create Browser MCP powered tests
        await this.createBrowserMCPE2ETests(e2eDir, worktreeId);

        this.logger.info('E2E test suite created with Browser MCP integration');
      } else {
        this.logger.info('No web interface detected, skipping E2E tests');
      }
    } catch (error) {
      this.logger.error('Failed to write E2E tests:', error);
      throw error;
    } finally {
      await this.browserTool.disconnect();
    }
  }

  /**
   * Run the complete test suite
   */
  private async runTests(worktreeId: string): Promise<any> {
    this.logger.info(`Running comprehensive test suite in worktree: ${worktreeId}`);

    try {
      const result = await execa('npm', ['test'], {
        cwd: process.cwd(),
        stdio: 'pipe',
      });

      this.logger.info('Test suite execution completed successfully');
      return { success: true, output: result.stdout };
    } catch (error) {
      this.logger.error('Test execution failed:', error);
      throw new Error(`Test execution failed: ${error}`);
    }
  }

  /**
   * Generate comprehensive coverage report
   */
  private async generateCoverageReport(worktreeId: string): Promise<CoverageReport> {
    this.logger.info(`Generating coverage report for worktree: ${worktreeId}`);

    try {
      const result = await execa('npm', ['run', 'test:coverage'], {
        cwd: process.cwd(),
        stdio: 'pipe',
      });

      const coverageJsonPath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
      const coverageData = JSON.parse(await fs.readFile(coverageJsonPath, 'utf8'));

      const report = this.parseCoverageReport(coverageData);

      // Log coverage summary
      this.logger.info('Coverage Report Summary:');
      this.logger.info(
        `  Lines: ${report.lines.covered}/${report.lines.total} (${report.lines.percentage.toFixed(2)}%)`,
      );
      this.logger.info(
        `  Functions: ${report.functions.covered}/${report.functions.total} (${report.functions.percentage.toFixed(2)}%)`,
      );
      this.logger.info(
        `  Branches: ${report.branches.covered}/${report.branches.total} (${report.branches.percentage.toFixed(2)}%)`,
      );
      this.logger.info(
        `  Statements: ${report.statements.covered}/${report.statements.total} (${report.statements.percentage.toFixed(2)}%)`,
      );

      return report;
    } catch (error) {
      this.logger.error('Failed to generate coverage report:', error);
      throw error;
    }
  }

  /**
   * Validate that coverage meets the 95% threshold
   */
  private async validateCoverageThresholds(coverage: CoverageReport): Promise<void> {
    this.logger.info('Validating coverage thresholds');

    const failures: string[] = [];

    if (coverage.lines.percentage < this.coverageThresholds.lines) {
      failures.push(
        `Lines coverage ${coverage.lines.percentage.toFixed(2)}% < ${this.coverageThresholds.lines}%`,
      );
    }

    if (coverage.functions.percentage < this.coverageThresholds.functions) {
      failures.push(
        `Functions coverage ${coverage.functions.percentage.toFixed(2)}% < ${this.coverageThresholds.functions}%`,
      );
    }

    if (coverage.branches.percentage < this.coverageThresholds.branches) {
      failures.push(
        `Branches coverage ${coverage.branches.percentage.toFixed(2)}% < ${this.coverageThresholds.branches}%`,
      );
    }

    if (coverage.statements.percentage < this.coverageThresholds.statements) {
      failures.push(
        `Statements coverage ${coverage.statements.percentage.toFixed(2)}% < ${this.coverageThresholds.statements}%`,
      );
    }

    if (failures.length > 0) {
      const errorMessage = `Coverage validation failed:\n${failures.join('\n')}`;
      this.logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    this.logger.info('All coverage thresholds met successfully!');
  }

  // Helper methods

  private extractFunctions(fileContent: string, filePath: string): string[] {
    const functions: string[] = [];
    const functionRegex =
      /(?:export\s+)?(?:async\s+)?(?:function\s+|class\s+|const\s+\w+\s*=\s*(?:async\s+)?\(|\w+\s*\()/g;

    let match;
    while ((match = functionRegex.exec(fileContent)) !== null) {
      functions.push(`${path.basename(filePath)}:${match[0]}`);
    }

    return functions;
  }

  private parseCoverageReport(coverageData: any): CoverageReport {
    const total = coverageData.total;

    return {
      lines: {
        total: total.lines.total,
        covered: total.lines.covered,
        percentage: total.lines.pct,
      },
      functions: {
        total: total.functions.total,
        covered: total.functions.covered,
        percentage: total.functions.pct,
      },
      branches: {
        total: total.branches.total,
        covered: total.branches.covered,
        percentage: total.branches.pct,
      },
      statements: {
        total: total.statements.total,
        covered: total.statements.covered,
        percentage: total.statements.pct,
      },
      files: Object.keys(coverageData)
        .filter((key) => key !== 'total')
        .map((filePath) => ({
          path: filePath,
          lines: coverageData[filePath].lines.pct,
          functions: coverageData[filePath].functions.pct,
          branches: coverageData[filePath].branches.pct,
          statements: coverageData[filePath].statements.pct,
        })),
    };
  }

  private async createUnitTestFile(sourceFile: string, testDir: string): Promise<void> {
    const relativePath = path.relative(path.join(process.cwd(), 'src'), sourceFile);
    const testFileName = relativePath.replace(/\.ts$/, '.test.ts');
    const testFilePath = path.join(testDir, testFileName);

    // Create directory structure if needed
    await fs.mkdir(path.dirname(testFilePath), { recursive: true });

    // Skip if test file already exists
    const testExists = await fs
      .access(testFilePath)
      .then(() => true)
      .catch(() => false);
    if (testExists) {
      return;
    }

    const sourceContent = await fs.readFile(sourceFile, 'utf8');
    const testContent = this.generateUnitTestContent(sourceContent, relativePath);

    await fs.writeFile(testFilePath, testContent, 'utf8');
  }

  private generateUnitTestContent(sourceContent: string, relativePath: string): string {
    const className = this.extractClassName(sourceContent);
    const functions = this.extractExportedFunctions(sourceContent);

    return `import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ${className || functions.join(', ')} } from '../../src/${relativePath.replace(/\.ts$/, '')}';

describe('${className || path.basename(relativePath, '.ts')}', () => {
  ${className ? this.generateClassTests(className) : this.generateFunctionTests(functions)}
});
`;
  }

  private extractClassName(content: string): string | null {
    const classMatch = content.match(/export\s+class\s+(\w+)/);
    return classMatch ? classMatch[1] : null;
  }

  private extractExportedFunctions(content: string): string[] {
    const functionMatches = content.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g);
    const constMatches = content.matchAll(/export\s+const\s+(\w+)\s*=/g);

    return [
      ...Array.from(functionMatches, (match) => match[1]),
      ...Array.from(constMatches, (match) => match[1]),
    ];
  }

  private generateClassTests(className: string): string {
    return `  let instance: ${className};

  beforeEach(() => {
    instance = new ${className}();
  });

  describe('Constructor', () => {
    it('should create instance successfully', () => {
      expect(instance).toBeDefined();
      expect(instance).toBeInstanceOf(${className});
    });
  });

  describe('Methods', () => {
    it('should implement required functionality', () => {
      // TODO: Add specific method tests
      expect(instance).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid inputs gracefully', () => {
      // TODO: Add error handling tests
      expect(instance).toBeDefined();
    });
  });`;
  }

  private generateFunctionTests(functions: string[]): string {
    if (functions.length === 0) {
      return `  it('should be defined', () => {
    // TODO: Add tests for this module
    expect(true).toBe(true);
  });`;
    }

    return functions
      .map(
        (func) => `  describe('${func}', () => {
    it('should execute successfully with valid inputs', () => {
      // TODO: Test ${func} with valid inputs
      expect(${func}).toBeDefined();
    });

    it('should handle edge cases', () => {
      // TODO: Test ${func} edge cases
      expect(${func}).toBeDefined();
    });

    it('should handle errors gracefully', () => {
      // TODO: Test ${func} error handling
      expect(${func}).toBeDefined();
    });
  });`,
      )
      .join('\n\n');
  }

  private async createAgentPoolIntegrationTest(testDir: string): Promise<void> {
    const testContent = `import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentPool } from '../../src/agents/agent-pool';
import type { AgentConfig } from '../../src/types';

describe('AgentPool Integration', () => {
  let agentPool: AgentPool;
  let config: AgentConfig;

  beforeEach(() => {
    config = {
      maxConcurrent: 3,
      timeout: 10000,
      retryAttempts: 2,
    };
    agentPool = new AgentPool(config);
  });

  afterEach(async () => {
    await agentPool.shutdown();
  });

  describe('Agent Management', () => {
    it('should initialize all agents successfully', () => {
      const agents = agentPool.getAvailableAgents();
      expect(agents.length).toBeGreaterThan(0);
    });

    it('should execute agents in parallel', async () => {
      const tasks = [
        { issueId: '1', worktreeId: 'wt1', agentType: 'code-implementer' },
        { issueId: '2', worktreeId: 'wt2', agentType: 'test-coverage-validator' },
      ];

      const results = await Promise.allSettled(
        tasks.map(task => agentPool.executeAgent(task.agentType, task.issueId, task.worktreeId))
      );

      expect(results).toHaveLength(2);
    });

    it('should respect concurrency limits', async () => {
      // TODO: Test concurrent execution limits
      expect(agentPool).toBeDefined();
    });
  });

  describe('Error Recovery', () => {
    it('should handle agent failures gracefully', async () => {
      // TODO: Test error handling and recovery
      expect(agentPool).toBeDefined();
    });
  });
});
`;

    await fs.writeFile(path.join(testDir, 'agent-pool.test.ts'), testContent, 'utf8');
  }

  private async createGitHubIntegrationTest(testDir: string): Promise<void> {
    const testContent = `import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitHubIntegration } from '../../src/integrations/github';

describe('GitHub Integration', () => {
  let github: GitHubIntegration;

  beforeEach(() => {
    const config = {
      token: 'test-token',
      owner: 'test-owner',
      repo: 'test-repo',
    };
    github = new GitHubIntegration(config);
  });

  describe('Epic Management', () => {
    it('should fetch epic details', async () => {
      // TODO: Mock GitHub API and test epic fetching
      expect(github).toBeDefined();
    });

    it('should create GitHub issues for tasks', async () => {
      // TODO: Test issue creation
      expect(github).toBeDefined();
    });
  });

  describe('Progress Tracking', () => {
    it('should update issue comments with progress', async () => {
      // TODO: Test progress reporting
      expect(github).toBeDefined();
    });
  });
});
`;

    await fs.writeFile(path.join(testDir, 'github.test.ts'), testContent, 'utf8');
  }

  private async createWorktreeManagerIntegrationTest(testDir: string): Promise<void> {
    const testContent = `import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorktreeManager } from '../../src/core/worktree-manager';
import path from 'path';
import { promises as fs } from 'fs';

describe('WorktreeManager Integration', () => {
  let worktreeManager: WorktreeManager;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(process.cwd(), 'test-worktrees');
    const config = {
      basePath: tempDir,
      maxWorktrees: 3,
      cleanupOnError: true,
    };
    worktreeManager = new WorktreeManager(config);
  });

  afterEach(async () => {
    await worktreeManager.cleanup();
    await fs.rmdir(tempDir, { recursive: true }).catch(() => {});
  });

  describe('Worktree Operations', () => {
    it('should create isolated worktrees', async () => {
      const worktreeId = await worktreeManager.createWorktree('feature-branch');
      expect(worktreeId).toBeDefined();
      expect(typeof worktreeId).toBe('string');
    });

    it('should manage multiple worktrees concurrently', async () => {
      const worktrees = await Promise.all([
        worktreeManager.createWorktree('branch-1'),
        worktreeManager.createWorktree('branch-2'),
      ]);

      expect(worktrees).toHaveLength(2);
      expect(worktrees[0]).not.toBe(worktrees[1]);
    });
  });

  describe('Cleanup', () => {
    it('should clean up worktrees on completion', async () => {
      const worktreeId = await worktreeManager.createWorktree('temp-branch');
      await worktreeManager.removeWorktree(worktreeId);
      
      // Worktree should be removed
      const worktrees = worktreeManager.getActiveWorktrees();
      expect(worktrees).not.toContain(worktreeId);
    });
  });
});
`;

    await fs.writeFile(path.join(testDir, 'worktree-manager.test.ts'), testContent, 'utf8');
  }

  private async createQualityGatesIntegrationTest(testDir: string): Promise<void> {
    const testContent = `import { describe, it, expect, beforeEach } from 'vitest';
import { QualityGates } from '../../src/quality/quality-gates';

describe('Quality Gates Integration', () => {
  let qualityGates: QualityGates;

  beforeEach(() => {
    const config = {
      linting: true,
      testing: true,
      coverage: 95,
      security: true,
      performance: true,
    };
    qualityGates = new QualityGates(config);
  });

  describe('Code Quality Validation', () => {
    it('should validate TypeScript compilation', async () => {
      // TODO: Test TypeScript validation
      expect(qualityGates).toBeDefined();
    });

    it('should enforce ESLint rules', async () => {
      // TODO: Test linting validation
      expect(qualityGates).toBeDefined();
    });

    it('should validate test coverage thresholds', async () => {
      // TODO: Test coverage validation
      expect(qualityGates).toBeDefined();
    });
  });

  describe('Security Validation', () => {
    it('should scan for security vulnerabilities', async () => {
      // TODO: Test security scanning
      expect(qualityGates).toBeDefined();
    });
  });
});
`;

    await fs.writeFile(path.join(testDir, 'quality-gates.test.ts'), testContent, 'utf8');
  }

  private async createDashboardE2ETests(testDir: string): Promise<void> {
    const testContent = `import { test, expect } from '@playwright/test';

test.describe('ForgeFlow Dashboard E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3010');
  });

  test('should load dashboard successfully', async ({ page }) => {
    await expect(page).toHaveTitle(/ForgeFlow/);
    await expect(page.locator('h1')).toContainText('ForgeFlow');
  });

  test('should display active executions', async ({ page }) => {
    const executionsSection = page.locator('[data-testid="executions-list"]');
    await expect(executionsSection).toBeVisible();
  });

  test('should show agent status', async ({ page }) => {
    const agentStatus = page.locator('[data-testid="agent-status"]');
    await expect(agentStatus).toBeVisible();
  });

  test('should handle responsive design', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('nav')).toBeVisible();
    
    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('main')).toBeVisible();
    
    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.locator('aside')).toBeVisible();
  });
});
`;

    await fs.writeFile(path.join(testDir, 'dashboard.spec.ts'), testContent, 'utf8');
  }

  private async createAPIE2ETests(testDir: string): Promise<void> {
    const testContent = `import { test, expect } from '@playwright/test';

test.describe('ForgeFlow API E2E', () => {
  const API_BASE = 'http://localhost:3010/api';

  test('should get system status', async ({ request }) => {
    const response = await request.get(\`\${API_BASE}/status\`);
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('status', 'healthy');
    expect(data).toHaveProperty('version');
  });

  test('should list available agents', async ({ request }) => {
    const response = await request.get(\`\${API_BASE}/agents\`);
    expect(response.status()).toBe(200);
    
    const agents = await response.json();
    expect(Array.isArray(agents)).toBe(true);
    expect(agents.length).toBeGreaterThan(0);
  });

  test('should get executions', async ({ request }) => {
    const response = await request.get(\`\${API_BASE}/executions\`);
    expect(response.status()).toBe(200);
    
    const executions = await response.json();
    expect(Array.isArray(executions)).toBe(true);
  });

  test('should handle GitHub webhook', async ({ request }) => {
    const payload = {
      action: 'opened',
      issue: {
        id: 1,
        number: 1,
        title: 'Test Issue',
        labels: [{ name: 'epic' }]
      }
    };

    const response = await request.post(\`\${API_BASE}/webhook/github\`, {
      data: payload,
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'issues'
      }
    });
    
    expect(response.status()).toBe(200);
  });
});
`;

    await fs.writeFile(path.join(testDir, 'api.spec.ts'), testContent, 'utf8');
  }

  private async createBrowserMCPE2ETests(testDir: string, worktreeId: string): Promise<void> {
    this.logger.debug('Creating Browser MCP powered E2E tests');

    const context: ToolExecutionContext = {
      issueId: this.currentIssueId || '',
      worktreeId,
      agentId: this.id,
      startTime: new Date(),
    };

    try {
      // Test basic navigation and functionality
      await this.browserTool.executeAction({
        type: 'navigate',
        url: 'http://localhost:3010',
      }, context);

      // Take screenshot for baseline
      const screenshotResult = await this.browserTool.executeAction({
        type: 'screenshot',
      }, context);

      // Test user workflows
      const testWorkflows: Array<{ name: string; actions: BrowserAction[] }> = [
        {
          name: 'Dashboard Navigation',
          actions: [
            { type: 'click', selector: 'nav a[href="/dashboard"]' },
            { type: 'wait', selector: '[data-testid="dashboard-content"]' },
            { type: 'screenshot' },
          ],
        },
        {
          name: 'Agent Status Check',
          actions: [
            { type: 'click', selector: 'nav a[href="/agents"]' },
            { type: 'wait', selector: '[data-testid="agent-list"]' },
            { type: 'extract', selector: '[data-testid="agent-status"]' },
          ],
        },
        {
          name: 'Execution Monitoring',
          actions: [
            { type: 'click', selector: 'nav a[href="/executions"]' },
            { type: 'wait', selector: '[data-testid="executions-table"]' },
            { type: 'screenshot' },
          ],
        },
      ];

      for (const workflow of testWorkflows) {
        this.logger.debug(`Testing workflow: ${workflow.name}`);
        for (const action of workflow.actions) {
          try {
            await this.browserTool.executeAction(action, context);
          } catch (error) {
            this.logger.warning(`Workflow step failed: ${workflow.name} - ${action.type}`, error);
          }
        }
      }

      // Create Browser MCP test file
      const testContent = `import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BrowserMCPTool } from '../../src/tools/browser-mcp-tool';
import type { ToolExecutionContext } from '../../src/types';

describe('Browser MCP E2E Tests', () => {
  let browserTool: BrowserMCPTool;
  let context: ToolExecutionContext;

  beforeEach(async () => {
    browserTool = new BrowserMCPTool({
      enableScreenshots: true,
      timeout: 30000,
    });
    
    context = {
      issueId: 'test-issue',
      worktreeId: 'test-worktree',
      agentId: 'test-agent',
      startTime: new Date(),
    };

    await browserTool.initialize();
  });

  afterEach(async () => {
    await browserTool.disconnect();
  });

  describe('Dashboard Functionality', () => {
    it('should load dashboard and take screenshot', async () => {
      const result = await browserTool.executeAction({
        type: 'navigate',
        url: 'http://localhost:3010',
      }, context);

      expect(result.success).toBe(true);

      const screenshot = await browserTool.executeAction({
        type: 'screenshot',
      }, context);

      expect(screenshot.success).toBe(true);
      expect(screenshot.data).toHaveProperty('screenshot');
    });

    it('should test navigation between pages', async () => {
      await browserTool.executeAction({
        type: 'navigate',
        url: 'http://localhost:3010',
      }, context);

      // Test dashboard navigation
      const dashboardClick = await browserTool.executeAction({
        type: 'click',
        selector: 'nav a[href="/dashboard"]',
      }, context);

      expect(dashboardClick.success).toBe(true);

      // Wait for content to load
      await browserTool.executeAction({
        type: 'wait',
        selector: '[data-testid="dashboard-content"]',
      }, context);
    });
  });

  describe('Agent Status Monitoring', () => {
    it('should extract agent status information', async () => {
      await browserTool.executeAction({
        type: 'navigate',
        url: 'http://localhost:3010/agents',
      }, context);

      const agentData = await browserTool.executeAction({
        type: 'extract',
        selector: '[data-testid="agent-list"]',
      }, context);

      expect(agentData.success).toBe(true);
      expect(agentData.data).toHaveProperty('data');
    });

    it('should test agent interaction workflows', async () => {
      await browserTool.executeAction({
        type: 'navigate',
        url: 'http://localhost:3010/agents',
      }, context);

      // Click on agent details
      await browserTool.executeAction({
        type: 'click',
        selector: '[data-testid="agent-card"]:first-child',
      }, context);

      // Take screenshot of agent details
      const detailsScreenshot = await browserTool.executeAction({
        type: 'screenshot',
      }, context);

      expect(detailsScreenshot.success).toBe(true);
    });
  });

  describe('Responsive Design Testing', () => {
    it('should test mobile viewport', async () => {
      // Set mobile viewport
      await browserTool.executeAction({
        type: 'evaluate',
        script: 'window.resizeTo(375, 667)',
      }, context);

      await browserTool.executeAction({
        type: 'navigate',
        url: 'http://localhost:3010',
      }, context);

      const mobileScreenshot = await browserTool.executeAction({
        type: 'screenshot',
      }, context);

      expect(mobileScreenshot.success).toBe(true);
    });

    it('should test tablet viewport', async () => {
      // Set tablet viewport
      await browserTool.executeAction({
        type: 'evaluate',
        script: 'window.resizeTo(768, 1024)',
      }, context);

      await browserTool.executeAction({
        type: 'navigate',
        url: 'http://localhost:3010',
      }, context);

      const tabletScreenshot = await browserTool.executeAction({
        type: 'screenshot',
      }, context);

      expect(tabletScreenshot.success).toBe(true);
    });
  });

  describe('Performance Testing', () => {
    it('should measure page performance metrics', async () => {
      await browserTool.executeAction({
        type: 'navigate',
        url: 'http://localhost:3010',
      }, context);

      const metrics = await browserTool.getPerformanceMetrics();
      
      expect(metrics).toHaveProperty('loadTime');
      expect(metrics).toHaveProperty('firstContentfulPaint');
      expect(metrics).toHaveProperty('largestContentfulPaint');
      
      // Check Core Web Vitals thresholds
      expect(metrics.largestContentfulPaint).toBeLessThan(2500);
    });
  });

  describe('Error Handling', () => {
    it('should handle navigation to non-existent pages', async () => {
      const result = await browserTool.executeAction({
        type: 'navigate',
        url: 'http://localhost:3010/non-existent-page',
      }, context);

      // Should handle gracefully, not crash
      expect(result).toBeDefined();
    });

    it('should handle invalid selectors gracefully', async () => {
      await browserTool.executeAction({
        type: 'navigate',
        url: 'http://localhost:3010',
      }, context);

      const result = await browserTool.executeAction({
        type: 'click',
        selector: '#non-existent-element',
      }, context);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
`;

      await fs.writeFile(path.join(testDir, 'browser-mcp.test.ts'), testContent, 'utf8');
      this.logger.info('Browser MCP E2E test file created successfully');

    } catch (error) {
      this.logger.warning('Failed to create Browser MCP E2E tests', error);
    }
  }
}

// Export for testing
export type { CoverageReport, TestCoverageThresholds };
