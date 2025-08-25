import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestCoverageValidatorAgent } from '../../../src/agents/test-coverage-validator';
import type {
  CoverageReport,
  TestCoverageThresholds,
} from '../../../src/agents/test-coverage-validator';
import { promises as fs } from 'fs';
import path from 'path';

// Mock dependencies
vi.mock('execa');
vi.mock('globby');
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
      access: vi.fn(),
      rmdir: vi.fn(),
    },
  };
});

describe('TestCoverageValidatorAgent', () => {
  let agent: TestCoverageValidatorAgent;
  let mockLogger: any;

  beforeEach(() => {
    agent = new TestCoverageValidatorAgent();
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    // @ts-ignore - Access private logger for testing
    agent.logger = mockLogger;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create instance successfully', () => {
      expect(agent).toBeDefined();
      expect(agent).toBeInstanceOf(TestCoverageValidatorAgent);
    });

    it('should initialize with correct capabilities', () => {
      // @ts-ignore - Access private capabilities for testing
      expect(agent.capabilities).toContain('test-writing');
      expect(agent.capabilities).toContain('coverage-analysis');
      expect(agent.capabilities).toContain('test-execution');
      expect(agent.capabilities).toContain('fixture-creation');
      expect(agent.capabilities).toContain('integration-testing');
      expect(agent.capabilities).toContain('e2e-testing');
    });

    it('should set coverage thresholds correctly', () => {
      // @ts-ignore - Access private coverageThresholds for testing
      const thresholds = agent.coverageThresholds;
      expect(thresholds.lines).toBe(95);
      expect(thresholds.functions).toBe(95);
      expect(thresholds.branches).toBe(90);
      expect(thresholds.statements).toBe(95);
    });
  });

  describe('execute', () => {
    const mockIssueId = 'test-issue-123';
    const mockWorktreeId = 'test-worktree-456';

    beforeEach(() => {
      // Mock the BaseAgent methods
      // @ts-ignore
      agent.preExecute = vi.fn();
      // @ts-ignore
      agent.reportProgress = vi.fn();
      // @ts-ignore
      agent.postExecute = vi.fn();
      // @ts-ignore
      agent.handleError = vi.fn();

      // Mock private methods
      // @ts-ignore
      agent.analyzeChanges = vi.fn().mockResolvedValue(['src/test.ts']);
      // @ts-ignore
      agent.calculateCoverage = vi.fn().mockResolvedValue(null);
      // @ts-ignore
      agent.identifyCoverageGaps = vi.fn().mockResolvedValue(['testFunction']);
      // @ts-ignore
      agent.writeUnitTests = vi.fn().mockResolvedValue(undefined);
      // @ts-ignore
      agent.writeIntegrationTests = vi.fn().mockResolvedValue(undefined);
      // @ts-ignore
      agent.writeE2ETests = vi.fn().mockResolvedValue(undefined);
      // @ts-ignore
      agent.runTests = vi.fn().mockResolvedValue({ success: true });
      // @ts-ignore
      agent.generateCoverageReport = vi.fn().mockResolvedValue({
        lines: { total: 100, covered: 96, percentage: 96 },
        functions: { total: 50, covered: 48, percentage: 96 },
        branches: { total: 75, covered: 70, percentage: 93.33 },
        statements: { total: 120, covered: 115, percentage: 95.83 },
        files: [],
      });
      // @ts-ignore
      agent.validateCoverageThresholds = vi.fn().mockResolvedValue(undefined);
    });

    it('should execute successfully with valid inputs', async () => {
      await agent.execute(mockIssueId, mockWorktreeId);

      // @ts-ignore
      expect(agent.preExecute).toHaveBeenCalledWith(mockIssueId, mockWorktreeId);
      // @ts-ignore
      expect(agent.reportProgress).toHaveBeenCalledWith(
        mockIssueId,
        100,
        'Test coverage validation complete - 95%+ achieved',
      );
      // @ts-ignore
      expect(agent.postExecute).toHaveBeenCalledWith(mockIssueId, true);
    });

    it('should handle errors gracefully', async () => {
      const testError = new Error('Test execution failed');
      // @ts-ignore
      agent.analyzeChanges = vi.fn().mockRejectedValue(testError);

      await agent.execute(mockIssueId, mockWorktreeId);

      // @ts-ignore
      expect(agent.handleError).toHaveBeenCalledWith(testError, mockIssueId);
    });

    it('should call all execution steps in correct order', async () => {
      await agent.execute(mockIssueId, mockWorktreeId);

      const progressCalls = agent.reportProgress.mock.calls;
      expect(progressCalls[0]).toEqual([mockIssueId, 5, 'Analyzing code changes']);
      expect(progressCalls[1]).toEqual([mockIssueId, 15, 'Calculating current coverage']);
      expect(progressCalls[2]).toEqual([mockIssueId, 25, 'Identifying coverage gaps']);
      expect(progressCalls[3]).toEqual([mockIssueId, 40, 'Writing unit tests']);
      expect(progressCalls[4]).toEqual([mockIssueId, 55, 'Creating integration tests']);
      expect(progressCalls[5]).toEqual([mockIssueId, 70, 'Implementing E2E scenarios']);
      expect(progressCalls[6]).toEqual([mockIssueId, 85, 'Running comprehensive test suite']);
      expect(progressCalls[7]).toEqual([mockIssueId, 95, 'Generating coverage report']);
      expect(progressCalls[8]).toEqual([mockIssueId, 98, 'Validating coverage thresholds']);
      expect(progressCalls[9]).toEqual([
        mockIssueId,
        100,
        'Test coverage validation complete - 95%+ achieved',
      ]);
    });
  });

  describe('analyzeChanges', () => {
    beforeEach(() => {
      const { glob } = require('globby');
      vi.mocked(glob).mockResolvedValue([
        'src/agents/test-agent.ts',
        'src/core/orchestrator.ts',
        'src/utils/logger.ts',
      ]);
    });

    it('should find source files requiring coverage', async () => {
      // @ts-ignore
      const result = await agent.analyzeChanges('test-worktree');

      expect(result).toHaveLength(3);
      expect(result).toContain('src/agents/test-agent.ts');
      expect(result).toContain('src/core/orchestrator.ts');
      expect(result).toContain('src/utils/logger.ts');
      expect(mockLogger.debug).toHaveBeenCalledWith('Found 3 source files requiring coverage');
    });

    it('should exclude test files and types', async () => {
      const { glob } = require('globby');
      expect(glob).toHaveBeenCalledWith(
        ['src/**/*.ts', '!src/**/*.test.ts', '!src/**/*.spec.ts', '!src/**/types/**'],
        {
          cwd: process.cwd(),
          absolute: true,
        },
      );
    });

    it('should handle errors gracefully', async () => {
      const { glob } = require('globby');
      const testError = new Error('Glob failed');
      vi.mocked(glob).mockRejectedValue(testError);

      await expect(agent.analyzeChanges('test-worktree')).rejects.toThrow('Glob failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to analyze code changes:', testError);
    });
  });

  describe('calculateCoverage', () => {
    beforeEach(() => {
      const { execa } = require('execa');
      const mockFs = vi.mocked(fs);

      vi.mocked(execa).mockResolvedValue({
        exitCode: 0,
        stdout: 'Coverage completed',
        stderr: '',
      });

      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          total: {
            lines: { total: 100, covered: 95, pct: 95 },
            functions: { total: 50, covered: 48, pct: 96 },
            branches: { total: 75, covered: 68, pct: 90.67 },
            statements: { total: 120, covered: 114, pct: 95 },
          },
        }),
      );
    });

    it('should calculate coverage successfully', async () => {
      // @ts-ignore
      const result = await agent.calculateCoverage('test-worktree');

      expect(result).toBeDefined();
      expect(result?.lines.percentage).toBe(95);
      expect(result?.functions.percentage).toBe(96);
      expect(result?.branches.percentage).toBe(90.67);
      expect(result?.statements.percentage).toBe(95);
    });

    it('should handle coverage analysis failure gracefully', async () => {
      const { execa } = require('execa');
      vi.mocked(execa).mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'Test failed',
      });

      // @ts-ignore
      const result = await agent.calculateCoverage('test-worktree');

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Coverage analysis failed, proceeding with comprehensive testing',
      );
    });

    it('should handle JSON parse errors gracefully', async () => {
      const mockFs = vi.mocked(fs);
      mockFs.readFile.mockResolvedValue('invalid json');

      // @ts-ignore
      const result = await agent.calculateCoverage('test-worktree');

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Could not parse coverage report, continuing with gap analysis',
      );
    });
  });

  describe('identifyCoverageGaps', () => {
    const mockCodeFiles = ['src/test.ts', 'src/another.ts'];
    const mockCoverage: CoverageReport = {
      lines: { total: 100, covered: 95, percentage: 95 },
      functions: { total: 50, covered: 45, percentage: 90 },
      branches: { total: 75, covered: 68, percentage: 90.67 },
      statements: { total: 120, covered: 114, percentage: 95 },
      files: [
        { path: 'src/test.ts', lines: 95, functions: 90, branches: 85, statements: 95 },
        { path: 'src/another.ts', lines: 98, functions: 100, branches: 95, statements: 96 },
      ],
    };

    beforeEach(() => {
      const mockFs = vi.mocked(fs);
      mockFs.readFile.mockImplementation((filePath) => {
        if (filePath.includes('test.ts')) {
          return Promise.resolve('export function testFunc() {}');
        }
        return Promise.resolve('export class TestClass {}');
      });

      // @ts-ignore
      agent.extractFunctions = vi.fn().mockImplementation((content, filePath) => {
        if (content.includes('testFunc')) {
          return ['testFunc'];
        }
        return ['TestClass'];
      });
    });

    it('should identify uncovered functions when coverage data is available', async () => {
      // @ts-ignore
      const result = await agent.identifyCoverageGaps(mockCodeFiles, mockCoverage);

      expect(result).toContain('testFunc'); // Functions coverage < threshold
      expect(result).not.toContain('TestClass'); // Functions coverage >= threshold
    });

    it('should assume all functions need tests when no coverage data', async () => {
      // @ts-ignore
      const result = await agent.identifyCoverageGaps(mockCodeFiles, null);

      expect(result).toContain('testFunc');
      expect(result).toContain('TestClass');
    });

    it('should handle file read errors gracefully', async () => {
      const mockFs = vi.mocked(fs);
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      // @ts-ignore
      const result = await agent.identifyCoverageGaps(mockCodeFiles, null);

      expect(result).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to analyze file src/test.ts:',
        expect.any(Error),
      );
    });
  });

  describe('writeUnitTests', () => {
    const mockUncoveredFunctions = ['testFunc1', 'testFunc2'];

    beforeEach(() => {
      const { glob } = require('globby');
      const mockFs = vi.mocked(fs);

      vi.mocked(glob).mockResolvedValue(['src/test.ts', 'src/another.ts']);
      mockFs.mkdir.mockResolvedValue(undefined);

      // @ts-ignore
      agent.createUnitTestFile = vi.fn().mockResolvedValue(undefined);
    });

    it('should create unit test files for all source files', async () => {
      // @ts-ignore
      await agent.writeUnitTests('test-worktree', mockUncoveredFunctions);

      expect(fs.mkdir).toHaveBeenCalledWith(path.join(process.cwd(), 'tests', 'unit'), {
        recursive: true,
      });

      // @ts-ignore
      expect(agent.createUnitTestFile).toHaveBeenCalledTimes(2);
      // @ts-ignore
      expect(agent.createUnitTestFile).toHaveBeenCalledWith(
        'src/test.ts',
        path.join(process.cwd(), 'tests', 'unit'),
      );
    });

    it('should handle errors during test writing', async () => {
      const testError = new Error('Write failed');
      // @ts-ignore
      agent.createUnitTestFile = vi.fn().mockRejectedValue(testError);

      await expect(agent.writeUnitTests('test-worktree', mockUncoveredFunctions)).rejects.toThrow(
        'Write failed',
      );
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to write unit tests:', testError);
    });
  });

  describe('writeIntegrationTests', () => {
    const mockCodeFiles = ['src/test.ts'];

    beforeEach(() => {
      const mockFs = vi.mocked(fs);
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      // @ts-ignore
      agent.createAgentPoolIntegrationTest = vi.fn().mockResolvedValue(undefined);
      // @ts-ignore
      agent.createGitHubIntegrationTest = vi.fn().mockResolvedValue(undefined);
      // @ts-ignore
      agent.createWorktreeManagerIntegrationTest = vi.fn().mockResolvedValue(undefined);
      // @ts-ignore
      agent.createQualityGatesIntegrationTest = vi.fn().mockResolvedValue(undefined);
    });

    it('should create all integration tests successfully', async () => {
      // @ts-ignore
      await agent.writeIntegrationTests('test-worktree', mockCodeFiles);

      expect(fs.mkdir).toHaveBeenCalledWith(path.join(process.cwd(), 'tests', 'integration'), {
        recursive: true,
      });

      // @ts-ignore
      expect(agent.createAgentPoolIntegrationTest).toHaveBeenCalled();
      // @ts-ignore
      expect(agent.createGitHubIntegrationTest).toHaveBeenCalled();
      // @ts-ignore
      expect(agent.createWorktreeManagerIntegrationTest).toHaveBeenCalled();
      // @ts-ignore
      expect(agent.createQualityGatesIntegrationTest).toHaveBeenCalled();

      expect(mockLogger.info).toHaveBeenCalledWith('Integration test suite created successfully');
    });

    it('should handle errors during integration test creation', async () => {
      const testError = new Error('Integration test creation failed');
      // @ts-ignore
      agent.createAgentPoolIntegrationTest = vi.fn().mockRejectedValue(testError);

      await expect(agent.writeIntegrationTests('test-worktree', mockCodeFiles)).rejects.toThrow(
        'Integration test creation failed',
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to write integration tests:',
        testError,
      );
    });
  });

  describe('writeE2ETests', () => {
    beforeEach(() => {
      const mockFs = vi.mocked(fs);
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      // @ts-ignore
      agent.createDashboardE2ETests = vi.fn().mockResolvedValue(undefined);
      // @ts-ignore
      agent.createAPIE2ETests = vi.fn().mockResolvedValue(undefined);
    });

    it('should create E2E tests when web directory exists', async () => {
      const mockFs = vi.mocked(fs);
      mockFs.access.mockResolvedValue(undefined);

      // @ts-ignore
      await agent.writeE2ETests('test-worktree');

      expect(fs.mkdir).toHaveBeenCalledWith(path.join(process.cwd(), 'tests', 'e2e'), {
        recursive: true,
      });

      // @ts-ignore
      expect(agent.createDashboardE2ETests).toHaveBeenCalled();
      // @ts-ignore
      expect(agent.createAPIE2ETests).toHaveBeenCalled();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'E2E test suite created for web dashboard and API',
      );
    });

    it('should skip E2E tests when web directory does not exist', async () => {
      const mockFs = vi.mocked(fs);
      mockFs.access.mockRejectedValue(new Error('Directory not found'));

      // @ts-ignore
      await agent.writeE2ETests('test-worktree');

      // @ts-ignore
      expect(agent.createDashboardE2ETests).not.toHaveBeenCalled();
      // @ts-ignore
      expect(agent.createAPIE2ETests).not.toHaveBeenCalled();

      expect(mockLogger.info).toHaveBeenCalledWith('No web interface detected, skipping E2E tests');
    });
  });

  describe('runTests', () => {
    it('should run tests successfully', async () => {
      const { execa } = require('execa');
      vi.mocked(execa).mockResolvedValue({
        stdout: 'All tests passed',
        stderr: '',
      });

      // @ts-ignore
      const result = await agent.runTests('test-worktree');

      expect(result.success).toBe(true);
      expect(result.output).toBe('All tests passed');
      expect(mockLogger.info).toHaveBeenCalledWith('Test suite execution completed successfully');
    });

    it('should handle test execution failures', async () => {
      const { execa } = require('execa');
      const testError = new Error('Test execution failed');
      vi.mocked(execa).mockRejectedValue(testError);

      // @ts-ignore
      await expect(agent.runTests('test-worktree')).rejects.toThrow(
        'Test execution failed: Error: Test execution failed',
      );
      expect(mockLogger.error).toHaveBeenCalledWith('Test execution failed:', testError);
    });
  });

  describe('generateCoverageReport', () => {
    const mockCoverageData = {
      total: {
        lines: { total: 100, covered: 96, pct: 96 },
        functions: { total: 50, covered: 48, pct: 96 },
        branches: { total: 75, covered: 70, pct: 93.33 },
        statements: { total: 120, covered: 115, pct: 95.83 },
      },
    };

    beforeEach(() => {
      const { execa } = require('execa');
      const mockFs = vi.mocked(fs);

      vi.mocked(execa).mockResolvedValue({
        stdout: 'Coverage generated',
        stderr: '',
      });

      mockFs.readFile.mockResolvedValue(JSON.stringify(mockCoverageData));
    });

    it('should generate coverage report successfully', async () => {
      // @ts-ignore
      const result = await agent.generateCoverageReport('test-worktree');

      expect(result.lines.percentage).toBe(96);
      expect(result.functions.percentage).toBe(96);
      expect(result.branches.percentage).toBe(93.33);
      expect(result.statements.percentage).toBe(95.83);

      expect(mockLogger.info).toHaveBeenCalledWith('Coverage Report Summary:');
      expect(mockLogger.info).toHaveBeenCalledWith('  Lines: 96/100 (96.00%)');
      expect(mockLogger.info).toHaveBeenCalledWith('  Functions: 48/50 (96.00%)');
      expect(mockLogger.info).toHaveBeenCalledWith('  Branches: 70/75 (93.33%)');
      expect(mockLogger.info).toHaveBeenCalledWith('  Statements: 115/120 (95.83%)');
    });

    it('should handle coverage generation errors', async () => {
      const { execa } = require('execa');
      const testError = new Error('Coverage generation failed');
      vi.mocked(execa).mockRejectedValue(testError);

      // @ts-ignore
      await expect(agent.generateCoverageReport('test-worktree')).rejects.toThrow(
        'Coverage generation failed',
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to generate coverage report:',
        testError,
      );
    });
  });

  describe('validateCoverageThresholds', () => {
    it('should pass validation when all thresholds are met', async () => {
      const passingCoverage: CoverageReport = {
        lines: { total: 100, covered: 96, percentage: 96 },
        functions: { total: 50, covered: 48, percentage: 96 },
        branches: { total: 75, covered: 70, percentage: 93.33 },
        statements: { total: 120, covered: 115, percentage: 95.83 },
        files: [],
      };

      // @ts-ignore
      await expect(agent.validateCoverageThresholds(passingCoverage)).resolves.not.toThrow();
      expect(mockLogger.info).toHaveBeenCalledWith('All coverage thresholds met successfully!');
    });

    it('should fail validation when thresholds are not met', async () => {
      const failingCoverage: CoverageReport = {
        lines: { total: 100, covered: 90, percentage: 90 }, // Below 95% threshold
        functions: { total: 50, covered: 45, percentage: 90 }, // Below 95% threshold
        branches: { total: 75, covered: 60, percentage: 80 }, // Below 90% threshold
        statements: { total: 120, covered: 110, percentage: 91.67 }, // Below 95% threshold
        files: [],
      };

      // @ts-ignore
      await expect(agent.validateCoverageThresholds(failingCoverage)).rejects.toThrow();

      const errorCall = mockLogger.error.mock.calls[0][0];
      expect(errorCall).toContain('Coverage validation failed:');
      expect(errorCall).toContain('Lines coverage 90.00% < 95%');
      expect(errorCall).toContain('Functions coverage 90.00% < 95%');
      expect(errorCall).toContain('Branches coverage 80.00% < 90%');
      expect(errorCall).toContain('Statements coverage 91.67% < 95%');
    });

    it('should pass validation for edge case values', async () => {
      const edgeCaseCoverage: CoverageReport = {
        lines: { total: 100, covered: 95, percentage: 95.0 }, // Exactly at threshold
        functions: { total: 50, covered: 47, percentage: 95.0 }, // Exactly at threshold
        branches: { total: 75, covered: 67, percentage: 90.0 }, // Exactly at threshold
        statements: { total: 120, covered: 114, percentage: 95.0 }, // Exactly at threshold
        files: [],
      };

      // @ts-ignore
      await expect(agent.validateCoverageThresholds(edgeCaseCoverage)).resolves.not.toThrow();
      expect(mockLogger.info).toHaveBeenCalledWith('All coverage thresholds met successfully!');
    });
  });

  describe('Helper Methods', () => {
    describe('extractFunctions', () => {
      it('should extract function declarations', () => {
        const content = `
          export function testFunction() {}
          export async function asyncFunction() {}
          function internalFunction() {}
        `;

        // @ts-ignore
        const functions = agent.extractFunctions(content, 'test.ts');

        expect(functions).toHaveLength(3);
        expect(functions.some((f) => f.includes('testFunction'))).toBe(true);
        expect(functions.some((f) => f.includes('asyncFunction'))).toBe(true);
        expect(functions.some((f) => f.includes('internalFunction'))).toBe(true);
      });

      it('should extract class declarations', () => {
        const content = `
          export class TestClass {}
          class InternalClass {}
        `;

        // @ts-ignore
        const functions = agent.extractFunctions(content, 'test.ts');

        expect(functions.some((f) => f.includes('TestClass'))).toBe(true);
        expect(functions.some((f) => f.includes('InternalClass'))).toBe(true);
      });

      it('should extract arrow functions', () => {
        const content = `
          const testArrow = () => {};
          const asyncArrow = async () => {};
        `;

        // @ts-ignore
        const functions = agent.extractFunctions(content, 'test.ts');

        expect(functions.some((f) => f.includes('testArrow'))).toBe(true);
        expect(functions.some((f) => f.includes('asyncArrow'))).toBe(true);
      });
    });

    describe('parseCoverageReport', () => {
      it('should parse coverage data correctly', () => {
        const mockData = {
          total: {
            lines: { total: 100, covered: 95, pct: 95 },
            functions: { total: 50, covered: 48, pct: 96 },
            branches: { total: 75, covered: 68, pct: 90.67 },
            statements: { total: 120, covered: 114, pct: 95 },
          },
          'src/test.ts': {
            lines: { pct: 95 },
            functions: { pct: 100 },
            branches: { pct: 90 },
            statements: { pct: 95 },
          },
        };

        // @ts-ignore
        const report = agent.parseCoverageReport(mockData);

        expect(report.lines.percentage).toBe(95);
        expect(report.functions.percentage).toBe(96);
        expect(report.branches.percentage).toBe(90.67);
        expect(report.statements.percentage).toBe(95);
        expect(report.files).toHaveLength(1);
        expect(report.files[0].path).toBe('src/test.ts');
      });
    });

    describe('extractClassName', () => {
      it('should extract class name from export statement', () => {
        const content = 'export class TestClass {}';

        // @ts-ignore
        const className = agent.extractClassName(content);

        expect(className).toBe('TestClass');
      });

      it('should return null when no class found', () => {
        const content = 'export function testFunction() {}';

        // @ts-ignore
        const className = agent.extractClassName(content);

        expect(className).toBeNull();
      });
    });

    describe('extractExportedFunctions', () => {
      it('should extract exported function names', () => {
        const content = `
          export function testFunction() {}
          export async function asyncFunction() {}
          export const constFunction = () => {};
          function internalFunction() {}
        `;

        // @ts-ignore
        const functions = agent.extractExportedFunctions(content);

        expect(functions).toContain('testFunction');
        expect(functions).toContain('asyncFunction');
        expect(functions).toContain('constFunction');
        expect(functions).not.toContain('internalFunction');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid worktree IDs gracefully', async () => {
      // @ts-ignore
      agent.preExecute = vi.fn();
      // @ts-ignore
      agent.handleError = vi.fn();

      const error = new Error('Invalid worktree');
      // @ts-ignore
      agent.analyzeChanges = vi.fn().mockRejectedValue(error);

      await agent.execute('', '');

      // @ts-ignore
      expect(agent.handleError).toHaveBeenCalledWith(error, '');
    });

    it('should handle file system errors during test creation', async () => {
      const mockFs = vi.mocked(fs);
      mockFs.mkdir.mockRejectedValue(new Error('Permission denied'));

      // @ts-ignore
      await expect(agent.writeUnitTests('test-worktree', [])).rejects.toThrow('Permission denied');
    });

    it('should handle malformed coverage data gracefully', () => {
      const invalidData = { invalid: 'data' };

      // @ts-ignore
      expect(() => agent.parseCoverageReport(invalidData)).toThrow();
    });
  });
});
