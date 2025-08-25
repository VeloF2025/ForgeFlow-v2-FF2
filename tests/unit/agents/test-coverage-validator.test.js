"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const test_coverage_validator_1 = require("../../../src/agents/test-coverage-validator");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
// Mock dependencies
vitest_1.vi.mock('execa');
vitest_1.vi.mock('globby');
vitest_1.vi.mock('fs', async () => {
    const actual = await vitest_1.vi.importActual('fs');
    return {
        ...actual,
        promises: {
            ...actual.promises,
            readFile: vitest_1.vi.fn(),
            writeFile: vitest_1.vi.fn(),
            mkdir: vitest_1.vi.fn(),
            access: vitest_1.vi.fn(),
            rmdir: vitest_1.vi.fn(),
        },
    };
});
(0, vitest_1.describe)('TestCoverageValidatorAgent', () => {
    let agent;
    let mockLogger;
    (0, vitest_1.beforeEach)(() => {
        agent = new test_coverage_validator_1.TestCoverageValidatorAgent();
        mockLogger = {
            info: vitest_1.vi.fn(),
            debug: vitest_1.vi.fn(),
            warn: vitest_1.vi.fn(),
            error: vitest_1.vi.fn(),
        };
        // @ts-ignore - Access private logger for testing
        agent.logger = mockLogger;
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.describe)('Constructor', () => {
        (0, vitest_1.it)('should create instance successfully', () => {
            (0, vitest_1.expect)(agent).toBeDefined();
            (0, vitest_1.expect)(agent).toBeInstanceOf(test_coverage_validator_1.TestCoverageValidatorAgent);
        });
        (0, vitest_1.it)('should initialize with correct capabilities', () => {
            // @ts-ignore - Access private capabilities for testing
            (0, vitest_1.expect)(agent.capabilities).toContain('test-writing');
            (0, vitest_1.expect)(agent.capabilities).toContain('coverage-analysis');
            (0, vitest_1.expect)(agent.capabilities).toContain('test-execution');
            (0, vitest_1.expect)(agent.capabilities).toContain('fixture-creation');
            (0, vitest_1.expect)(agent.capabilities).toContain('integration-testing');
            (0, vitest_1.expect)(agent.capabilities).toContain('e2e-testing');
        });
        (0, vitest_1.it)('should set coverage thresholds correctly', () => {
            // @ts-ignore - Access private coverageThresholds for testing
            const thresholds = agent.coverageThresholds;
            (0, vitest_1.expect)(thresholds.lines).toBe(95);
            (0, vitest_1.expect)(thresholds.functions).toBe(95);
            (0, vitest_1.expect)(thresholds.branches).toBe(90);
            (0, vitest_1.expect)(thresholds.statements).toBe(95);
        });
    });
    (0, vitest_1.describe)('execute', () => {
        const mockIssueId = 'test-issue-123';
        const mockWorktreeId = 'test-worktree-456';
        (0, vitest_1.beforeEach)(() => {
            // Mock the BaseAgent methods
            // @ts-ignore
            agent.preExecute = vitest_1.vi.fn();
            // @ts-ignore
            agent.reportProgress = vitest_1.vi.fn();
            // @ts-ignore
            agent.postExecute = vitest_1.vi.fn();
            // @ts-ignore
            agent.handleError = vitest_1.vi.fn();
            // Mock private methods
            // @ts-ignore
            agent.analyzeChanges = vitest_1.vi.fn().mockResolvedValue(['src/test.ts']);
            // @ts-ignore
            agent.calculateCoverage = vitest_1.vi.fn().mockResolvedValue(null);
            // @ts-ignore
            agent.identifyCoverageGaps = vitest_1.vi.fn().mockResolvedValue(['testFunction']);
            // @ts-ignore
            agent.writeUnitTests = vitest_1.vi.fn().mockResolvedValue(undefined);
            // @ts-ignore
            agent.writeIntegrationTests = vitest_1.vi.fn().mockResolvedValue(undefined);
            // @ts-ignore
            agent.writeE2ETests = vitest_1.vi.fn().mockResolvedValue(undefined);
            // @ts-ignore
            agent.runTests = vitest_1.vi.fn().mockResolvedValue({ success: true });
            // @ts-ignore
            agent.generateCoverageReport = vitest_1.vi.fn().mockResolvedValue({
                lines: { total: 100, covered: 96, percentage: 96 },
                functions: { total: 50, covered: 48, percentage: 96 },
                branches: { total: 75, covered: 70, percentage: 93.33 },
                statements: { total: 120, covered: 115, percentage: 95.83 },
                files: [],
            });
            // @ts-ignore
            agent.validateCoverageThresholds = vitest_1.vi.fn().mockResolvedValue(undefined);
        });
        (0, vitest_1.it)('should execute successfully with valid inputs', async () => {
            await agent.execute(mockIssueId, mockWorktreeId);
            // @ts-ignore
            (0, vitest_1.expect)(agent.preExecute).toHaveBeenCalledWith(mockIssueId, mockWorktreeId);
            // @ts-ignore
            (0, vitest_1.expect)(agent.reportProgress).toHaveBeenCalledWith(mockIssueId, 100, 'Test coverage validation complete - 95%+ achieved');
            // @ts-ignore
            (0, vitest_1.expect)(agent.postExecute).toHaveBeenCalledWith(mockIssueId, true);
        });
        (0, vitest_1.it)('should handle errors gracefully', async () => {
            const testError = new Error('Test execution failed');
            // @ts-ignore
            agent.analyzeChanges = vitest_1.vi.fn().mockRejectedValue(testError);
            await agent.execute(mockIssueId, mockWorktreeId);
            // @ts-ignore
            (0, vitest_1.expect)(agent.handleError).toHaveBeenCalledWith(testError, mockIssueId);
        });
        (0, vitest_1.it)('should call all execution steps in correct order', async () => {
            await agent.execute(mockIssueId, mockWorktreeId);
            const progressCalls = agent.reportProgress.mock.calls;
            (0, vitest_1.expect)(progressCalls[0]).toEqual([mockIssueId, 5, 'Analyzing code changes']);
            (0, vitest_1.expect)(progressCalls[1]).toEqual([mockIssueId, 15, 'Calculating current coverage']);
            (0, vitest_1.expect)(progressCalls[2]).toEqual([mockIssueId, 25, 'Identifying coverage gaps']);
            (0, vitest_1.expect)(progressCalls[3]).toEqual([mockIssueId, 40, 'Writing unit tests']);
            (0, vitest_1.expect)(progressCalls[4]).toEqual([mockIssueId, 55, 'Creating integration tests']);
            (0, vitest_1.expect)(progressCalls[5]).toEqual([mockIssueId, 70, 'Implementing E2E scenarios']);
            (0, vitest_1.expect)(progressCalls[6]).toEqual([mockIssueId, 85, 'Running comprehensive test suite']);
            (0, vitest_1.expect)(progressCalls[7]).toEqual([mockIssueId, 95, 'Generating coverage report']);
            (0, vitest_1.expect)(progressCalls[8]).toEqual([mockIssueId, 98, 'Validating coverage thresholds']);
            (0, vitest_1.expect)(progressCalls[9]).toEqual([
                mockIssueId,
                100,
                'Test coverage validation complete - 95%+ achieved',
            ]);
        });
    });
    (0, vitest_1.describe)('analyzeChanges', () => {
        (0, vitest_1.beforeEach)(() => {
            const { glob } = require('globby');
            vitest_1.vi.mocked(glob).mockResolvedValue([
                'src/agents/test-agent.ts',
                'src/core/orchestrator.ts',
                'src/utils/logger.ts',
            ]);
        });
        (0, vitest_1.it)('should find source files requiring coverage', async () => {
            // @ts-ignore
            const result = await agent.analyzeChanges('test-worktree');
            (0, vitest_1.expect)(result).toHaveLength(3);
            (0, vitest_1.expect)(result).toContain('src/agents/test-agent.ts');
            (0, vitest_1.expect)(result).toContain('src/core/orchestrator.ts');
            (0, vitest_1.expect)(result).toContain('src/utils/logger.ts');
            (0, vitest_1.expect)(mockLogger.debug).toHaveBeenCalledWith('Found 3 source files requiring coverage');
        });
        (0, vitest_1.it)('should exclude test files and types', async () => {
            const { glob } = require('globby');
            (0, vitest_1.expect)(glob).toHaveBeenCalledWith(['src/**/*.ts', '!src/**/*.test.ts', '!src/**/*.spec.ts', '!src/**/types/**'], {
                cwd: process.cwd(),
                absolute: true,
            });
        });
        (0, vitest_1.it)('should handle errors gracefully', async () => {
            const { glob } = require('globby');
            const testError = new Error('Glob failed');
            vitest_1.vi.mocked(glob).mockRejectedValue(testError);
            await (0, vitest_1.expect)(agent.analyzeChanges('test-worktree')).rejects.toThrow('Glob failed');
            (0, vitest_1.expect)(mockLogger.error).toHaveBeenCalledWith('Failed to analyze code changes:', testError);
        });
    });
    (0, vitest_1.describe)('calculateCoverage', () => {
        (0, vitest_1.beforeEach)(() => {
            const { execa } = require('execa');
            const mockFs = vitest_1.vi.mocked(fs_1.promises);
            vitest_1.vi.mocked(execa).mockResolvedValue({
                exitCode: 0,
                stdout: 'Coverage completed',
                stderr: '',
            });
            mockFs.readFile.mockResolvedValue(JSON.stringify({
                total: {
                    lines: { total: 100, covered: 95, pct: 95 },
                    functions: { total: 50, covered: 48, pct: 96 },
                    branches: { total: 75, covered: 68, pct: 90.67 },
                    statements: { total: 120, covered: 114, pct: 95 },
                },
            }));
        });
        (0, vitest_1.it)('should calculate coverage successfully', async () => {
            // @ts-ignore
            const result = await agent.calculateCoverage('test-worktree');
            (0, vitest_1.expect)(result).toBeDefined();
            (0, vitest_1.expect)(result?.lines.percentage).toBe(95);
            (0, vitest_1.expect)(result?.functions.percentage).toBe(96);
            (0, vitest_1.expect)(result?.branches.percentage).toBe(90.67);
            (0, vitest_1.expect)(result?.statements.percentage).toBe(95);
        });
        (0, vitest_1.it)('should handle coverage analysis failure gracefully', async () => {
            const { execa } = require('execa');
            vitest_1.vi.mocked(execa).mockResolvedValue({
                exitCode: 1,
                stdout: '',
                stderr: 'Test failed',
            });
            // @ts-ignore
            const result = await agent.calculateCoverage('test-worktree');
            (0, vitest_1.expect)(result).toBeNull();
            (0, vitest_1.expect)(mockLogger.warn).toHaveBeenCalledWith('Coverage analysis failed, proceeding with comprehensive testing');
        });
        (0, vitest_1.it)('should handle JSON parse errors gracefully', async () => {
            const mockFs = vitest_1.vi.mocked(fs_1.promises);
            mockFs.readFile.mockResolvedValue('invalid json');
            // @ts-ignore
            const result = await agent.calculateCoverage('test-worktree');
            (0, vitest_1.expect)(result).toBeNull();
            (0, vitest_1.expect)(mockLogger.warn).toHaveBeenCalledWith('Could not parse coverage report, continuing with gap analysis');
        });
    });
    (0, vitest_1.describe)('identifyCoverageGaps', () => {
        const mockCodeFiles = ['src/test.ts', 'src/another.ts'];
        const mockCoverage = {
            lines: { total: 100, covered: 95, percentage: 95 },
            functions: { total: 50, covered: 45, percentage: 90 },
            branches: { total: 75, covered: 68, percentage: 90.67 },
            statements: { total: 120, covered: 114, percentage: 95 },
            files: [
                { path: 'src/test.ts', lines: 95, functions: 90, branches: 85, statements: 95 },
                { path: 'src/another.ts', lines: 98, functions: 100, branches: 95, statements: 96 },
            ],
        };
        (0, vitest_1.beforeEach)(() => {
            const mockFs = vitest_1.vi.mocked(fs_1.promises);
            mockFs.readFile.mockImplementation((filePath) => {
                if (filePath.includes('test.ts')) {
                    return Promise.resolve('export function testFunc() {}');
                }
                return Promise.resolve('export class TestClass {}');
            });
            // @ts-ignore
            agent.extractFunctions = vitest_1.vi.fn().mockImplementation((content, filePath) => {
                if (content.includes('testFunc')) {
                    return ['testFunc'];
                }
                return ['TestClass'];
            });
        });
        (0, vitest_1.it)('should identify uncovered functions when coverage data is available', async () => {
            // @ts-ignore
            const result = await agent.identifyCoverageGaps(mockCodeFiles, mockCoverage);
            (0, vitest_1.expect)(result).toContain('testFunc'); // Functions coverage < threshold
            (0, vitest_1.expect)(result).not.toContain('TestClass'); // Functions coverage >= threshold
        });
        (0, vitest_1.it)('should assume all functions need tests when no coverage data', async () => {
            // @ts-ignore
            const result = await agent.identifyCoverageGaps(mockCodeFiles, null);
            (0, vitest_1.expect)(result).toContain('testFunc');
            (0, vitest_1.expect)(result).toContain('TestClass');
        });
        (0, vitest_1.it)('should handle file read errors gracefully', async () => {
            const mockFs = vitest_1.vi.mocked(fs_1.promises);
            mockFs.readFile.mockRejectedValue(new Error('File not found'));
            // @ts-ignore
            const result = await agent.identifyCoverageGaps(mockCodeFiles, null);
            (0, vitest_1.expect)(result).toEqual([]);
            (0, vitest_1.expect)(mockLogger.warn).toHaveBeenCalledWith('Failed to analyze file src/test.ts:', vitest_1.expect.any(Error));
        });
    });
    (0, vitest_1.describe)('writeUnitTests', () => {
        const mockUncoveredFunctions = ['testFunc1', 'testFunc2'];
        (0, vitest_1.beforeEach)(() => {
            const { glob } = require('globby');
            const mockFs = vitest_1.vi.mocked(fs_1.promises);
            vitest_1.vi.mocked(glob).mockResolvedValue(['src/test.ts', 'src/another.ts']);
            mockFs.mkdir.mockResolvedValue(undefined);
            // @ts-ignore
            agent.createUnitTestFile = vitest_1.vi.fn().mockResolvedValue(undefined);
        });
        (0, vitest_1.it)('should create unit test files for all source files', async () => {
            // @ts-ignore
            await agent.writeUnitTests('test-worktree', mockUncoveredFunctions);
            (0, vitest_1.expect)(fs_1.promises.mkdir).toHaveBeenCalledWith(path_1.default.join(process.cwd(), 'tests', 'unit'), {
                recursive: true,
            });
            // @ts-ignore
            (0, vitest_1.expect)(agent.createUnitTestFile).toHaveBeenCalledTimes(2);
            // @ts-ignore
            (0, vitest_1.expect)(agent.createUnitTestFile).toHaveBeenCalledWith('src/test.ts', path_1.default.join(process.cwd(), 'tests', 'unit'));
        });
        (0, vitest_1.it)('should handle errors during test writing', async () => {
            const testError = new Error('Write failed');
            // @ts-ignore
            agent.createUnitTestFile = vitest_1.vi.fn().mockRejectedValue(testError);
            await (0, vitest_1.expect)(agent.writeUnitTests('test-worktree', mockUncoveredFunctions)).rejects.toThrow('Write failed');
            (0, vitest_1.expect)(mockLogger.error).toHaveBeenCalledWith('Failed to write unit tests:', testError);
        });
    });
    (0, vitest_1.describe)('writeIntegrationTests', () => {
        const mockCodeFiles = ['src/test.ts'];
        (0, vitest_1.beforeEach)(() => {
            const mockFs = vitest_1.vi.mocked(fs_1.promises);
            mockFs.mkdir.mockResolvedValue(undefined);
            mockFs.writeFile.mockResolvedValue(undefined);
            // @ts-ignore
            agent.createAgentPoolIntegrationTest = vitest_1.vi.fn().mockResolvedValue(undefined);
            // @ts-ignore
            agent.createGitHubIntegrationTest = vitest_1.vi.fn().mockResolvedValue(undefined);
            // @ts-ignore
            agent.createWorktreeManagerIntegrationTest = vitest_1.vi.fn().mockResolvedValue(undefined);
            // @ts-ignore
            agent.createQualityGatesIntegrationTest = vitest_1.vi.fn().mockResolvedValue(undefined);
        });
        (0, vitest_1.it)('should create all integration tests successfully', async () => {
            // @ts-ignore
            await agent.writeIntegrationTests('test-worktree', mockCodeFiles);
            (0, vitest_1.expect)(fs_1.promises.mkdir).toHaveBeenCalledWith(path_1.default.join(process.cwd(), 'tests', 'integration'), {
                recursive: true,
            });
            // @ts-ignore
            (0, vitest_1.expect)(agent.createAgentPoolIntegrationTest).toHaveBeenCalled();
            // @ts-ignore
            (0, vitest_1.expect)(agent.createGitHubIntegrationTest).toHaveBeenCalled();
            // @ts-ignore
            (0, vitest_1.expect)(agent.createWorktreeManagerIntegrationTest).toHaveBeenCalled();
            // @ts-ignore
            (0, vitest_1.expect)(agent.createQualityGatesIntegrationTest).toHaveBeenCalled();
            (0, vitest_1.expect)(mockLogger.info).toHaveBeenCalledWith('Integration test suite created successfully');
        });
        (0, vitest_1.it)('should handle errors during integration test creation', async () => {
            const testError = new Error('Integration test creation failed');
            // @ts-ignore
            agent.createAgentPoolIntegrationTest = vitest_1.vi.fn().mockRejectedValue(testError);
            await (0, vitest_1.expect)(agent.writeIntegrationTests('test-worktree', mockCodeFiles)).rejects.toThrow('Integration test creation failed');
            (0, vitest_1.expect)(mockLogger.error).toHaveBeenCalledWith('Failed to write integration tests:', testError);
        });
    });
    (0, vitest_1.describe)('writeE2ETests', () => {
        (0, vitest_1.beforeEach)(() => {
            const mockFs = vitest_1.vi.mocked(fs_1.promises);
            mockFs.mkdir.mockResolvedValue(undefined);
            mockFs.writeFile.mockResolvedValue(undefined);
            // @ts-ignore
            agent.createDashboardE2ETests = vitest_1.vi.fn().mockResolvedValue(undefined);
            // @ts-ignore
            agent.createAPIE2ETests = vitest_1.vi.fn().mockResolvedValue(undefined);
        });
        (0, vitest_1.it)('should create E2E tests when web directory exists', async () => {
            const mockFs = vitest_1.vi.mocked(fs_1.promises);
            mockFs.access.mockResolvedValue(undefined);
            // @ts-ignore
            await agent.writeE2ETests('test-worktree');
            (0, vitest_1.expect)(fs_1.promises.mkdir).toHaveBeenCalledWith(path_1.default.join(process.cwd(), 'tests', 'e2e'), {
                recursive: true,
            });
            // @ts-ignore
            (0, vitest_1.expect)(agent.createDashboardE2ETests).toHaveBeenCalled();
            // @ts-ignore
            (0, vitest_1.expect)(agent.createAPIE2ETests).toHaveBeenCalled();
            (0, vitest_1.expect)(mockLogger.info).toHaveBeenCalledWith('E2E test suite created for web dashboard and API');
        });
        (0, vitest_1.it)('should skip E2E tests when web directory does not exist', async () => {
            const mockFs = vitest_1.vi.mocked(fs_1.promises);
            mockFs.access.mockRejectedValue(new Error('Directory not found'));
            // @ts-ignore
            await agent.writeE2ETests('test-worktree');
            // @ts-ignore
            (0, vitest_1.expect)(agent.createDashboardE2ETests).not.toHaveBeenCalled();
            // @ts-ignore
            (0, vitest_1.expect)(agent.createAPIE2ETests).not.toHaveBeenCalled();
            (0, vitest_1.expect)(mockLogger.info).toHaveBeenCalledWith('No web interface detected, skipping E2E tests');
        });
    });
    (0, vitest_1.describe)('runTests', () => {
        (0, vitest_1.it)('should run tests successfully', async () => {
            const { execa } = require('execa');
            vitest_1.vi.mocked(execa).mockResolvedValue({
                stdout: 'All tests passed',
                stderr: '',
            });
            // @ts-ignore
            const result = await agent.runTests('test-worktree');
            (0, vitest_1.expect)(result.success).toBe(true);
            (0, vitest_1.expect)(result.output).toBe('All tests passed');
            (0, vitest_1.expect)(mockLogger.info).toHaveBeenCalledWith('Test suite execution completed successfully');
        });
        (0, vitest_1.it)('should handle test execution failures', async () => {
            const { execa } = require('execa');
            const testError = new Error('Test execution failed');
            vitest_1.vi.mocked(execa).mockRejectedValue(testError);
            // @ts-ignore
            await (0, vitest_1.expect)(agent.runTests('test-worktree')).rejects.toThrow('Test execution failed: Error: Test execution failed');
            (0, vitest_1.expect)(mockLogger.error).toHaveBeenCalledWith('Test execution failed:', testError);
        });
    });
    (0, vitest_1.describe)('generateCoverageReport', () => {
        const mockCoverageData = {
            total: {
                lines: { total: 100, covered: 96, pct: 96 },
                functions: { total: 50, covered: 48, pct: 96 },
                branches: { total: 75, covered: 70, pct: 93.33 },
                statements: { total: 120, covered: 115, pct: 95.83 },
            },
        };
        (0, vitest_1.beforeEach)(() => {
            const { execa } = require('execa');
            const mockFs = vitest_1.vi.mocked(fs_1.promises);
            vitest_1.vi.mocked(execa).mockResolvedValue({
                stdout: 'Coverage generated',
                stderr: '',
            });
            mockFs.readFile.mockResolvedValue(JSON.stringify(mockCoverageData));
        });
        (0, vitest_1.it)('should generate coverage report successfully', async () => {
            // @ts-ignore
            const result = await agent.generateCoverageReport('test-worktree');
            (0, vitest_1.expect)(result.lines.percentage).toBe(96);
            (0, vitest_1.expect)(result.functions.percentage).toBe(96);
            (0, vitest_1.expect)(result.branches.percentage).toBe(93.33);
            (0, vitest_1.expect)(result.statements.percentage).toBe(95.83);
            (0, vitest_1.expect)(mockLogger.info).toHaveBeenCalledWith('Coverage Report Summary:');
            (0, vitest_1.expect)(mockLogger.info).toHaveBeenCalledWith('  Lines: 96/100 (96.00%)');
            (0, vitest_1.expect)(mockLogger.info).toHaveBeenCalledWith('  Functions: 48/50 (96.00%)');
            (0, vitest_1.expect)(mockLogger.info).toHaveBeenCalledWith('  Branches: 70/75 (93.33%)');
            (0, vitest_1.expect)(mockLogger.info).toHaveBeenCalledWith('  Statements: 115/120 (95.83%)');
        });
        (0, vitest_1.it)('should handle coverage generation errors', async () => {
            const { execa } = require('execa');
            const testError = new Error('Coverage generation failed');
            vitest_1.vi.mocked(execa).mockRejectedValue(testError);
            // @ts-ignore
            await (0, vitest_1.expect)(agent.generateCoverageReport('test-worktree')).rejects.toThrow('Coverage generation failed');
            (0, vitest_1.expect)(mockLogger.error).toHaveBeenCalledWith('Failed to generate coverage report:', testError);
        });
    });
    (0, vitest_1.describe)('validateCoverageThresholds', () => {
        (0, vitest_1.it)('should pass validation when all thresholds are met', async () => {
            const passingCoverage = {
                lines: { total: 100, covered: 96, percentage: 96 },
                functions: { total: 50, covered: 48, percentage: 96 },
                branches: { total: 75, covered: 70, percentage: 93.33 },
                statements: { total: 120, covered: 115, percentage: 95.83 },
                files: [],
            };
            // @ts-ignore
            await (0, vitest_1.expect)(agent.validateCoverageThresholds(passingCoverage)).resolves.not.toThrow();
            (0, vitest_1.expect)(mockLogger.info).toHaveBeenCalledWith('All coverage thresholds met successfully!');
        });
        (0, vitest_1.it)('should fail validation when thresholds are not met', async () => {
            const failingCoverage = {
                lines: { total: 100, covered: 90, percentage: 90 }, // Below 95% threshold
                functions: { total: 50, covered: 45, percentage: 90 }, // Below 95% threshold
                branches: { total: 75, covered: 60, percentage: 80 }, // Below 90% threshold
                statements: { total: 120, covered: 110, percentage: 91.67 }, // Below 95% threshold
                files: [],
            };
            // @ts-ignore
            await (0, vitest_1.expect)(agent.validateCoverageThresholds(failingCoverage)).rejects.toThrow();
            const errorCall = mockLogger.error.mock.calls[0][0];
            (0, vitest_1.expect)(errorCall).toContain('Coverage validation failed:');
            (0, vitest_1.expect)(errorCall).toContain('Lines coverage 90.00% < 95%');
            (0, vitest_1.expect)(errorCall).toContain('Functions coverage 90.00% < 95%');
            (0, vitest_1.expect)(errorCall).toContain('Branches coverage 80.00% < 90%');
            (0, vitest_1.expect)(errorCall).toContain('Statements coverage 91.67% < 95%');
        });
        (0, vitest_1.it)('should pass validation for edge case values', async () => {
            const edgeCaseCoverage = {
                lines: { total: 100, covered: 95, percentage: 95.0 }, // Exactly at threshold
                functions: { total: 50, covered: 47, percentage: 95.0 }, // Exactly at threshold
                branches: { total: 75, covered: 67, percentage: 90.0 }, // Exactly at threshold
                statements: { total: 120, covered: 114, percentage: 95.0 }, // Exactly at threshold
                files: [],
            };
            // @ts-ignore
            await (0, vitest_1.expect)(agent.validateCoverageThresholds(edgeCaseCoverage)).resolves.not.toThrow();
            (0, vitest_1.expect)(mockLogger.info).toHaveBeenCalledWith('All coverage thresholds met successfully!');
        });
    });
    (0, vitest_1.describe)('Helper Methods', () => {
        (0, vitest_1.describe)('extractFunctions', () => {
            (0, vitest_1.it)('should extract function declarations', () => {
                const content = `
          export function testFunction() {}
          export async function asyncFunction() {}
          function internalFunction() {}
        `;
                // @ts-ignore
                const functions = agent.extractFunctions(content, 'test.ts');
                (0, vitest_1.expect)(functions).toHaveLength(3);
                (0, vitest_1.expect)(functions.some((f) => f.includes('testFunction'))).toBe(true);
                (0, vitest_1.expect)(functions.some((f) => f.includes('asyncFunction'))).toBe(true);
                (0, vitest_1.expect)(functions.some((f) => f.includes('internalFunction'))).toBe(true);
            });
            (0, vitest_1.it)('should extract class declarations', () => {
                const content = `
          export class TestClass {}
          class InternalClass {}
        `;
                // @ts-ignore
                const functions = agent.extractFunctions(content, 'test.ts');
                (0, vitest_1.expect)(functions.some((f) => f.includes('TestClass'))).toBe(true);
                (0, vitest_1.expect)(functions.some((f) => f.includes('InternalClass'))).toBe(true);
            });
            (0, vitest_1.it)('should extract arrow functions', () => {
                const content = `
          const testArrow = () => {};
          const asyncArrow = async () => {};
        `;
                // @ts-ignore
                const functions = agent.extractFunctions(content, 'test.ts');
                (0, vitest_1.expect)(functions.some((f) => f.includes('testArrow'))).toBe(true);
                (0, vitest_1.expect)(functions.some((f) => f.includes('asyncArrow'))).toBe(true);
            });
        });
        (0, vitest_1.describe)('parseCoverageReport', () => {
            (0, vitest_1.it)('should parse coverage data correctly', () => {
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
                (0, vitest_1.expect)(report.lines.percentage).toBe(95);
                (0, vitest_1.expect)(report.functions.percentage).toBe(96);
                (0, vitest_1.expect)(report.branches.percentage).toBe(90.67);
                (0, vitest_1.expect)(report.statements.percentage).toBe(95);
                (0, vitest_1.expect)(report.files).toHaveLength(1);
                (0, vitest_1.expect)(report.files[0].path).toBe('src/test.ts');
            });
        });
        (0, vitest_1.describe)('extractClassName', () => {
            (0, vitest_1.it)('should extract class name from export statement', () => {
                const content = 'export class TestClass {}';
                // @ts-ignore
                const className = agent.extractClassName(content);
                (0, vitest_1.expect)(className).toBe('TestClass');
            });
            (0, vitest_1.it)('should return null when no class found', () => {
                const content = 'export function testFunction() {}';
                // @ts-ignore
                const className = agent.extractClassName(content);
                (0, vitest_1.expect)(className).toBeNull();
            });
        });
        (0, vitest_1.describe)('extractExportedFunctions', () => {
            (0, vitest_1.it)('should extract exported function names', () => {
                const content = `
          export function testFunction() {}
          export async function asyncFunction() {}
          export const constFunction = () => {};
          function internalFunction() {}
        `;
                // @ts-ignore
                const functions = agent.extractExportedFunctions(content);
                (0, vitest_1.expect)(functions).toContain('testFunction');
                (0, vitest_1.expect)(functions).toContain('asyncFunction');
                (0, vitest_1.expect)(functions).toContain('constFunction');
                (0, vitest_1.expect)(functions).not.toContain('internalFunction');
            });
        });
    });
    (0, vitest_1.describe)('Error Handling', () => {
        (0, vitest_1.it)('should handle invalid worktree IDs gracefully', async () => {
            // @ts-ignore
            agent.preExecute = vitest_1.vi.fn();
            // @ts-ignore
            agent.handleError = vitest_1.vi.fn();
            const error = new Error('Invalid worktree');
            // @ts-ignore
            agent.analyzeChanges = vitest_1.vi.fn().mockRejectedValue(error);
            await agent.execute('', '');
            // @ts-ignore
            (0, vitest_1.expect)(agent.handleError).toHaveBeenCalledWith(error, '');
        });
        (0, vitest_1.it)('should handle file system errors during test creation', async () => {
            const mockFs = vitest_1.vi.mocked(fs_1.promises);
            mockFs.mkdir.mockRejectedValue(new Error('Permission denied'));
            // @ts-ignore
            await (0, vitest_1.expect)(agent.writeUnitTests('test-worktree', [])).rejects.toThrow('Permission denied');
        });
        (0, vitest_1.it)('should handle malformed coverage data gracefully', () => {
            const invalidData = { invalid: 'data' };
            // @ts-ignore
            (0, vitest_1.expect)(() => agent.parseCoverageReport(invalidData)).toThrow();
        });
    });
});
//# sourceMappingURL=test-coverage-validator.test.js.map