"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const orchestrator_1 = require("../../../src/core/orchestrator");
// Mock dependencies
vitest_1.vi.mock('../../../src/integrations/github');
vitest_1.vi.mock('../../../src/core/worktree-manager');
vitest_1.vi.mock('../../../src/agents/agent-pool');
vitest_1.vi.mock('../../../src/quality/quality-gates');
vitest_1.vi.mock('../../../src/protocols/protocol-enforcer');
(0, vitest_1.describe)('Orchestrator Unit Tests', () => {
    let orchestrator;
    let config;
    let mockEventEmitter;
    (0, vitest_1.beforeEach)(() => {
        config = {
            github: {
                token: 'test-token',
                owner: 'test-owner',
                repo: 'test-repo',
            },
            worktree: {
                basePath: './test-worktrees',
                maxWorktrees: 5,
                cleanupOnError: true,
            },
            agents: {
                maxConcurrent: 3,
                timeout: 10000,
                retryAttempts: 2,
            },
            quality: {
                linting: true,
                testing: true,
                coverage: 95,
                security: true,
                performance: true,
            },
            protocols: {
                nlnh: true,
                antihall: true,
                ryr: true,
                rulesPath: './test-rules',
            },
        };
        mockEventEmitter = {
            on: vitest_1.vi.fn(),
            off: vitest_1.vi.fn(),
            once: vitest_1.vi.fn(),
            emit: vitest_1.vi.fn(),
            addListener: vitest_1.vi.fn(),
            removeListener: vitest_1.vi.fn(),
        };
        orchestrator = new orchestrator_1.Orchestrator(config);
        // Mock EventEmitter methods
        Object.assign(orchestrator, mockEventEmitter);
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.describe)('Constructor', () => {
        (0, vitest_1.it)('should create instance successfully', () => {
            (0, vitest_1.expect)(orchestrator).toBeDefined();
            (0, vitest_1.expect)(orchestrator).toBeInstanceOf(orchestrator_1.Orchestrator);
        });
        (0, vitest_1.it)('should initialize with correct configuration', () => {
            // @ts-ignore - Access private config for testing
            (0, vitest_1.expect)(orchestrator.config).toEqual(config);
        });
        (0, vitest_1.it)('should validate required configuration fields', () => {
            (0, vitest_1.expect)(() => new orchestrator_1.Orchestrator({
                ...config,
                github: { ...config.github, token: '' },
            })).toThrow();
        });
    });
    (0, vitest_1.describe)('Initialization', () => {
        (0, vitest_1.it)('should initialize all components successfully', async () => {
            const initPromise = orchestrator.initialize();
            // Simulate initialization completion
            setTimeout(() => {
                // @ts-ignore
                orchestrator.emit('initialized');
            }, 10);
            await (0, vitest_1.expect)(initPromise).resolves.not.toThrow();
        });
        (0, vitest_1.it)('should handle initialization failures gracefully', async () => {
            const initError = new Error('GitHub API initialization failed');
            setTimeout(() => {
                // @ts-ignore
                orchestrator.emit('error', initError);
            }, 10);
            const initPromise = orchestrator.initialize();
            await (0, vitest_1.expect)(initPromise).rejects.toThrow('GitHub API initialization failed');
        });
        (0, vitest_1.it)('should validate GitHub connection during initialization', async () => {
            const { GitHubIntegration } = require('../../../src/integrations/github');
            const mockGitHub = {
                validateConnection: vitest_1.vi.fn().mockResolvedValue(true),
                getRepositoryInfo: vitest_1.vi.fn().mockResolvedValue({
                    name: 'test-repo',
                    owner: { login: 'test-owner' },
                }),
            };
            GitHubIntegration.mockImplementation(() => mockGitHub);
            await orchestrator.initialize();
            (0, vitest_1.expect)(mockGitHub.validateConnection).toHaveBeenCalled();
        });
    });
    (0, vitest_1.describe)('Execution Patterns', () => {
        (0, vitest_1.beforeEach)(async () => {
            await orchestrator.initialize();
        });
        (0, vitest_1.it)('should have default execution patterns defined', () => {
            const patterns = orchestrator.getAvailablePatterns();
            (0, vitest_1.expect)(patterns).toHaveLength(3);
            (0, vitest_1.expect)(patterns.map((p) => p.name)).toContain('feature-development');
            (0, vitest_1.expect)(patterns.map((p) => p.name)).toContain('bug-fix-sprint');
            (0, vitest_1.expect)(patterns.map((p) => p.name)).toContain('security-audit');
        });
        (0, vitest_1.it)('should select appropriate pattern based on epic labels', () => {
            const featureEpic = { labels: ['feature', 'enhancement'] };
            const bugEpic = { labels: ['bug', 'critical'] };
            const securityEpic = { labels: ['security', 'vulnerability'] };
            // @ts-ignore
            (0, vitest_1.expect)(orchestrator.selectExecutionPattern(featureEpic)).toBe('feature-development');
            // @ts-ignore
            (0, vitest_1.expect)(orchestrator.selectExecutionPattern(bugEpic)).toBe('bug-fix-sprint');
            // @ts-ignore
            (0, vitest_1.expect)(orchestrator.selectExecutionPattern(securityEpic)).toBe('security-audit');
        });
        (0, vitest_1.it)('should fallback to feature-development for unknown labels', () => {
            const unknownEpic = { labels: ['unknown', 'custom'] };
            // @ts-ignore
            (0, vitest_1.expect)(orchestrator.selectExecutionPattern(unknownEpic)).toBe('feature-development');
        });
        (0, vitest_1.it)('should customize pattern configuration', () => {
            const customPattern = {
                name: 'custom-pattern',
                description: 'Custom execution pattern',
                maxParallelAgents: 5,
                estimatedDuration: 30,
                agents: ['code-implementer', 'test-coverage-validator'],
            };
            orchestrator.addExecutionPattern(customPattern);
            const patterns = orchestrator.getAvailablePatterns();
            (0, vitest_1.expect)(patterns).toHaveLength(4);
            (0, vitest_1.expect)(patterns.find((p) => p.name === 'custom-pattern')).toBeDefined();
        });
    });
    (0, vitest_1.describe)('Parallel Execution', () => {
        const mockEpicId = 'epic-123';
        (0, vitest_1.beforeEach)(async () => {
            await orchestrator.initialize();
            // Mock GitHub integration
            const { GitHubIntegration } = require('../../../src/integrations/github');
            const mockGitHub = {
                getEpic: vitest_1.vi.fn().mockResolvedValue({
                    id: mockEpicId,
                    title: 'Test Epic',
                    description: 'Epic description',
                    labels: ['feature'],
                }),
                getEpicIssues: vitest_1.vi.fn().mockResolvedValue([
                    { id: 'issue-1', number: 1, title: 'Task 1', labels: ['code-implementer'] },
                    { id: 'issue-2', number: 2, title: 'Task 2', labels: ['test-coverage-validator'] },
                ]),
            };
            // @ts-ignore
            orchestrator.github = mockGitHub;
        });
        (0, vitest_1.it)('should start parallel execution successfully', async () => {
            const status = await orchestrator.startParallelExecution(mockEpicId);
            (0, vitest_1.expect)(status).toBeDefined();
            (0, vitest_1.expect)(status.epicId).toBe(mockEpicId);
            (0, vitest_1.expect)(status.status).toBe('running');
            (0, vitest_1.expect)(status.progress).toBe(0);
            (0, vitest_1.expect)(status.pattern).toBe('feature-development');
        });
        (0, vitest_1.it)('should assign agents to tasks based on labels', async () => {
            const status = await orchestrator.startParallelExecution(mockEpicId);
            (0, vitest_1.expect)(status.tasks).toHaveLength(2);
            (0, vitest_1.expect)(status.tasks[0].agentType).toBe('code-implementer');
            (0, vitest_1.expect)(status.tasks[1].agentType).toBe('test-coverage-validator');
        });
        (0, vitest_1.it)('should handle epic without issues', async () => {
            // @ts-ignore
            orchestrator.github.getEpicIssues.mockResolvedValue([]);
            const status = await orchestrator.startParallelExecution(mockEpicId);
            (0, vitest_1.expect)(status.tasks).toHaveLength(0);
            (0, vitest_1.expect)(status.status).toBe('completed');
        });
        (0, vitest_1.it)('should respect maximum concurrent agents limit', async () => {
            const manyIssues = Array.from({ length: 10 }, (_, i) => ({
                id: `issue-${i}`,
                number: i + 1,
                title: `Task ${i + 1}`,
                labels: ['code-implementer'],
            }));
            // @ts-ignore
            orchestrator.github.getEpicIssues.mockResolvedValue(manyIssues);
            const status = await orchestrator.startParallelExecution(mockEpicId);
            // Should be limited by maxConcurrent config (3)
            (0, vitest_1.expect)(status.tasks.filter((t) => t.status === 'running')).toHaveLength(3);
        });
        (0, vitest_1.it)('should emit progress events during execution', async () => {
            const progressSpy = vitest_1.vi.fn();
            orchestrator.on('execution:progress', progressSpy);
            await orchestrator.startParallelExecution(mockEpicId);
            // Wait for async events
            await new Promise((resolve) => setTimeout(resolve, 100));
            (0, vitest_1.expect)(progressSpy).toHaveBeenCalled();
            (0, vitest_1.expect)(progressSpy.mock.calls[0][0]).toHaveProperty('epicId', mockEpicId);
        });
        (0, vitest_1.it)('should handle agent execution failures gracefully', async () => {
            const { AgentPool } = require('../../../src/agents/agent-pool');
            const mockAgentPool = {
                executeAgent: vitest_1.vi.fn().mockRejectedValue(new Error('Agent execution failed')),
            };
            // @ts-ignore
            orchestrator.agentPool = mockAgentPool;
            const status = await orchestrator.startParallelExecution(mockEpicId);
            (0, vitest_1.expect)(status.tasks.some((t) => t.status === 'failed')).toBe(true);
        });
    });
    (0, vitest_1.describe)('Execution Management', () => {
        let executionId;
        (0, vitest_1.beforeEach)(async () => {
            await orchestrator.initialize();
            const { GitHubIntegration } = require('../../../src/integrations/github');
            const mockGitHub = {
                getEpic: vitest_1.vi.fn().mockResolvedValue({
                    id: 'epic-test',
                    title: 'Test Epic',
                    description: 'Test description',
                    labels: ['feature'],
                }),
                getEpicIssues: vitest_1.vi.fn().mockResolvedValue([]),
            };
            // @ts-ignore
            orchestrator.github = mockGitHub;
            const status = await orchestrator.startParallelExecution('epic-test');
            executionId = status.id;
        });
        (0, vitest_1.it)('should retrieve execution status by ID', () => {
            const status = orchestrator.getExecutionStatus(executionId);
            (0, vitest_1.expect)(status).toBeDefined();
            (0, vitest_1.expect)(status?.id).toBe(executionId);
        });
        (0, vitest_1.it)('should return null for non-existent execution ID', () => {
            const status = orchestrator.getExecutionStatus('non-existent');
            (0, vitest_1.expect)(status).toBeNull();
        });
        (0, vitest_1.it)('should list all active executions', () => {
            const executions = orchestrator.getAllExecutions();
            (0, vitest_1.expect)(executions).toHaveLength(1);
            (0, vitest_1.expect)(executions[0].id).toBe(executionId);
        });
        (0, vitest_1.it)('should stop execution successfully', async () => {
            await orchestrator.stopExecution(executionId);
            const status = orchestrator.getExecutionStatus(executionId);
            (0, vitest_1.expect)(status?.status).toBe('stopped');
        });
        (0, vitest_1.it)('should handle stopping non-existent execution', async () => {
            await (0, vitest_1.expect)(orchestrator.stopExecution('non-existent')).resolves.not.toThrow();
        });
        (0, vitest_1.it)('should clean up resources when stopping execution', async () => {
            const { WorktreeManager } = require('../../../src/core/worktree-manager');
            const mockWorktreeManager = {
                cleanup: vitest_1.vi.fn(),
            };
            // @ts-ignore
            orchestrator.worktreeManager = mockWorktreeManager;
            await orchestrator.stopExecution(executionId);
            (0, vitest_1.expect)(mockWorktreeManager.cleanup).toHaveBeenCalled();
        });
    });
    (0, vitest_1.describe)('Quality Gates Integration', () => {
        (0, vitest_1.beforeEach)(async () => {
            await orchestrator.initialize();
        });
        (0, vitest_1.it)('should validate code quality before execution', async () => {
            const { QualityGates } = require('../../../src/quality/quality-gates');
            const mockQualityGates = {
                validateCode: vitest_1.vi.fn().mockResolvedValue({ passed: true, issues: [] }),
            };
            // @ts-ignore
            orchestrator.qualityGates = mockQualityGates;
            const validation = await orchestrator.validateQualityGates('test-worktree');
            (0, vitest_1.expect)(validation.passed).toBe(true);
            (0, vitest_1.expect)(mockQualityGates.validateCode).toHaveBeenCalledWith('test-worktree');
        });
        (0, vitest_1.it)('should fail execution if quality gates fail', async () => {
            const { QualityGates } = require('../../../src/quality/quality-gates');
            const mockQualityGates = {
                validateCode: vitest_1.vi.fn().mockResolvedValue({
                    passed: false,
                    issues: [
                        { type: 'typescript', message: 'Type error in file.ts' },
                        { type: 'eslint', message: 'Linting error' },
                    ],
                }),
            };
            // @ts-ignore
            orchestrator.qualityGates = mockQualityGates;
            await (0, vitest_1.expect)(orchestrator.validateQualityGates('test-worktree')).rejects.toThrow('Quality gate validation failed');
        });
        (0, vitest_1.it)('should enforce zero tolerance for TypeScript errors', async () => {
            const { QualityGates } = require('../../../src/quality/quality-gates');
            const mockQualityGates = {
                validateTypeScript: vitest_1.vi.fn().mockResolvedValue({
                    errors: [{ file: 'test.ts', line: 1, message: 'Type error' }],
                }),
            };
            // @ts-ignore
            orchestrator.qualityGates = mockQualityGates;
            await (0, vitest_1.expect)(orchestrator.validateTypeScript('test-worktree')).rejects.toThrow('TypeScript validation failed');
        });
        (0, vitest_1.it)('should enforce zero tolerance for ESLint errors', async () => {
            const { QualityGates } = require('../../../src/quality/quality-gates');
            const mockQualityGates = {
                validateESLint: vitest_1.vi.fn().mockResolvedValue({
                    errorCount: 1,
                    warningCount: 0,
                    results: [{ filePath: 'test.ts', messages: [{ severity: 2, message: 'Error' }] }],
                }),
            };
            // @ts-ignore
            orchestrator.qualityGates = mockQualityGates;
            await (0, vitest_1.expect)(orchestrator.validateESLint('test-worktree')).rejects.toThrow('ESLint validation failed');
        });
    });
    (0, vitest_1.describe)('Protocol Enforcement', () => {
        (0, vitest_1.beforeEach)(async () => {
            await orchestrator.initialize();
        });
        (0, vitest_1.it)('should enforce NLNH protocol', () => {
            const { ProtocolEnforcer } = require('../../../src/protocols/protocol-enforcer');
            const mockProtocolEnforcer = {
                enforceNLNH: vitest_1.vi.fn().mockReturnValue(true),
            };
            // @ts-ignore
            orchestrator.protocolEnforcer = mockProtocolEnforcer;
            const result = orchestrator.enforceNLNHProtocol('test-statement');
            (0, vitest_1.expect)(result).toBe(true);
            (0, vitest_1.expect)(mockProtocolEnforcer.enforceNLNH).toHaveBeenCalledWith('test-statement');
        });
        (0, vitest_1.it)('should enforce AntiHall protocol', async () => {
            const { ProtocolEnforcer } = require('../../../src/protocols/protocol-enforcer');
            const mockProtocolEnforcer = {
                validateCodeExists: vitest_1.vi.fn().mockResolvedValue(true),
            };
            // @ts-ignore
            orchestrator.protocolEnforcer = mockProtocolEnforcer;
            const result = await orchestrator.validateCodeExists('testFunction');
            (0, vitest_1.expect)(result).toBe(true);
            (0, vitest_1.expect)(mockProtocolEnforcer.validateCodeExists).toHaveBeenCalledWith('testFunction');
        });
        (0, vitest_1.it)('should enforce RYR protocol on session start', () => {
            const { ProtocolEnforcer } = require('../../../src/protocols/protocol-enforcer');
            const mockProtocolEnforcer = {
                loadRules: vitest_1.vi.fn(),
                validateRules: vitest_1.vi.fn().mockReturnValue(true),
            };
            // @ts-ignore
            orchestrator.protocolEnforcer = mockProtocolEnforcer;
            orchestrator.enforceRYRProtocol();
            (0, vitest_1.expect)(mockProtocolEnforcer.loadRules).toHaveBeenCalled();
            (0, vitest_1.expect)(mockProtocolEnforcer.validateRules).toHaveBeenCalled();
        });
    });
    (0, vitest_1.describe)('Performance Metrics', () => {
        (0, vitest_1.beforeEach)(async () => {
            await orchestrator.initialize();
        });
        (0, vitest_1.it)('should track execution performance metrics', async () => {
            const startTime = Date.now();
            const status = await orchestrator.startParallelExecution('epic-perf-test');
            (0, vitest_1.expect)(status.metrics).toBeDefined();
            (0, vitest_1.expect)(status.metrics.startTime).toBeGreaterThanOrEqual(startTime);
            (0, vitest_1.expect)(status.metrics.estimatedDuration).toBeGreaterThan(0);
        });
        (0, vitest_1.it)('should calculate execution progress accurately', () => {
            const execution = {
                id: 'test-exec',
                epicId: 'test-epic',
                status: 'running',
                progress: 50,
                pattern: 'feature-development',
                tasks: [
                    { id: 'task-1', status: 'completed', progress: 100, agentType: 'code-implementer' },
                    { id: 'task-2', status: 'running', progress: 50, agentType: 'test-coverage-validator' },
                    { id: 'task-3', status: 'pending', progress: 0, agentType: 'code-quality-reviewer' },
                ],
                metrics: {
                    startTime: Date.now(),
                    estimatedDuration: 60,
                },
            };
            // @ts-ignore
            const progress = orchestrator.calculateOverallProgress(execution);
            (0, vitest_1.expect)(progress).toBe(50); // (100 + 50 + 0) / 3
        });
        (0, vitest_1.it)('should provide performance analytics', () => {
            const analytics = orchestrator.getPerformanceAnalytics();
            (0, vitest_1.expect)(analytics).toHaveProperty('averageExecutionTime');
            (0, vitest_1.expect)(analytics).toHaveProperty('successRate');
            (0, vitest_1.expect)(analytics).toHaveProperty('agentPerformance');
            (0, vitest_1.expect)(analytics).toHaveProperty('patternEfficiency');
        });
    });
    (0, vitest_1.describe)('Error Handling', () => {
        (0, vitest_1.it)('should handle GitHub API errors gracefully', async () => {
            const { GitHubIntegration } = require('../../../src/integrations/github');
            const mockGitHub = {
                getEpic: vitest_1.vi.fn().mockRejectedValue(new Error('GitHub API error')),
            };
            // @ts-ignore
            orchestrator.github = mockGitHub;
            await (0, vitest_1.expect)(orchestrator.startParallelExecution('epic-error')).rejects.toThrow('GitHub API error');
        });
        (0, vitest_1.it)('should handle worktree creation failures', async () => {
            const { WorktreeManager } = require('../../../src/core/worktree-manager');
            const mockWorktreeManager = {
                createWorktree: vitest_1.vi.fn().mockRejectedValue(new Error('Worktree creation failed')),
            };
            // @ts-ignore
            orchestrator.worktreeManager = mockWorktreeManager;
            await (0, vitest_1.expect)(orchestrator.createWorktree('test-branch')).rejects.toThrow('Worktree creation failed');
        });
        (0, vitest_1.it)('should handle agent pool failures', async () => {
            const { AgentPool } = require('../../../src/agents/agent-pool');
            const mockAgentPool = {
                initialize: vitest_1.vi.fn().mockRejectedValue(new Error('Agent pool initialization failed')),
            };
            AgentPool.mockImplementation(() => mockAgentPool);
            await (0, vitest_1.expect)(new orchestrator_1.Orchestrator(config).initialize()).rejects.toThrow('Agent pool initialization failed');
        });
        (0, vitest_1.it)('should provide detailed error information', async () => {
            const error = new Error('Test error');
            error.stack = 'Error stack trace';
            try {
                throw error;
            }
            catch (e) {
                const errorInfo = orchestrator.formatError(e);
                (0, vitest_1.expect)(errorInfo).toHaveProperty('message', 'Test error');
                (0, vitest_1.expect)(errorInfo).toHaveProperty('stack');
                (0, vitest_1.expect)(errorInfo).toHaveProperty('timestamp');
            }
        });
    });
    (0, vitest_1.describe)('Shutdown', () => {
        (0, vitest_1.beforeEach)(async () => {
            await orchestrator.initialize();
        });
        (0, vitest_1.it)('should shutdown gracefully', async () => {
            const { WorktreeManager } = require('../../../src/core/worktree-manager');
            const { AgentPool } = require('../../../src/agents/agent-pool');
            const mockWorktreeManager = { cleanup: vitest_1.vi.fn() };
            const mockAgentPool = { shutdown: vitest_1.vi.fn() };
            // @ts-ignore
            orchestrator.worktreeManager = mockWorktreeManager;
            // @ts-ignore
            orchestrator.agentPool = mockAgentPool;
            await orchestrator.shutdown();
            (0, vitest_1.expect)(mockWorktreeManager.cleanup).toHaveBeenCalled();
            (0, vitest_1.expect)(mockAgentPool.shutdown).toHaveBeenCalled();
        });
        (0, vitest_1.it)('should stop all running executions on shutdown', async () => {
            // Start an execution
            const status = await orchestrator.startParallelExecution('epic-shutdown');
            await orchestrator.shutdown();
            const finalStatus = orchestrator.getExecutionStatus(status.id);
            (0, vitest_1.expect)(finalStatus?.status).toBe('stopped');
        });
        (0, vitest_1.it)('should handle shutdown errors gracefully', async () => {
            const { AgentPool } = require('../../../src/agents/agent-pool');
            const mockAgentPool = {
                shutdown: vitest_1.vi.fn().mockRejectedValue(new Error('Shutdown failed')),
            };
            // @ts-ignore
            orchestrator.agentPool = mockAgentPool;
            // Should not throw despite shutdown error
            await (0, vitest_1.expect)(orchestrator.shutdown()).resolves.not.toThrow();
        });
        (0, vitest_1.it)('should emit shutdown event', async () => {
            const shutdownSpy = vitest_1.vi.fn();
            orchestrator.on('shutdown', shutdownSpy);
            await orchestrator.shutdown();
            (0, vitest_1.expect)(shutdownSpy).toHaveBeenCalled();
        });
    });
});
//# sourceMappingURL=orchestrator.test.js.map