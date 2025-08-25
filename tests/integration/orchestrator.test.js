"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const orchestrator_1 = require("../../src/core/orchestrator");
const github_1 = require("../../src/integrations/github");
const worktree_manager_1 = require("../../src/core/worktree-manager");
const agent_pool_1 = require("../../src/agents/agent-pool");
// Mock implementations
vitest_1.vi.mock('../../src/integrations/github');
vitest_1.vi.mock('../../src/core/worktree-manager');
vitest_1.vi.mock('../../src/agents/agent-pool');
vitest_1.vi.mock('../../src/quality/quality-gates');
vitest_1.vi.mock('../../src/protocols/protocol-enforcer');
(0, vitest_1.describe)('Orchestrator Integration Tests', () => {
    let orchestrator;
    let config;
    (0, vitest_1.beforeAll)(() => {
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
                coverage: 80,
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
    });
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.describe)('Initialization', () => {
        (0, vitest_1.it)('should initialize successfully with valid config', async () => {
            orchestrator = new orchestrator_1.Orchestrator(config);
            (0, vitest_1.expect)(orchestrator).toBeDefined();
            await new Promise((resolve) => {
                orchestrator.once('initialized', resolve);
            });
        });
        (0, vitest_1.it)('should validate all components during initialization', async () => {
            const mockGitHub = vitest_1.vi.mocked(github_1.GitHubIntegration);
            const mockWorktree = vitest_1.vi.mocked(worktree_manager_1.WorktreeManager);
            const mockAgentPool = vitest_1.vi.mocked(agent_pool_1.AgentPool);
            orchestrator = new orchestrator_1.Orchestrator(config);
            await new Promise((resolve) => {
                orchestrator.once('initialized', resolve);
            });
            (0, vitest_1.expect)(mockGitHub).toHaveBeenCalled();
            (0, vitest_1.expect)(mockWorktree).toHaveBeenCalled();
            (0, vitest_1.expect)(mockAgentPool).toHaveBeenCalled();
        });
    });
    (0, vitest_1.describe)('Execution Patterns', () => {
        (0, vitest_1.beforeEach)(async () => {
            orchestrator = new orchestrator_1.Orchestrator(config);
            await new Promise((resolve) => {
                orchestrator.once('initialized', resolve);
            });
        });
        (0, vitest_1.it)('should have default execution patterns', () => {
            const patterns = orchestrator.getAvailablePatterns();
            (0, vitest_1.expect)(patterns).toHaveLength(3);
            (0, vitest_1.expect)(patterns.map((p) => p.name)).toContain('feature-development');
            (0, vitest_1.expect)(patterns.map((p) => p.name)).toContain('bug-fix-sprint');
            (0, vitest_1.expect)(patterns.map((p) => p.name)).toContain('security-audit');
        });
        (0, vitest_1.it)('should select appropriate pattern based on epic labels', async () => {
            const mockGetEpic = vitest_1.vi.fn().mockResolvedValue({
                id: 'epic-1',
                title: 'Test Epic',
                description: 'Test description',
                labels: ['bug'],
            });
            vitest_1.vi.mocked(github_1.GitHubIntegration).prototype.getEpic = mockGetEpic;
            const status = await orchestrator.startParallelExecution('epic-1');
            (0, vitest_1.expect)(status.pattern).toBe('bug-fix-sprint');
        });
    });
    (0, vitest_1.describe)('Parallel Execution', () => {
        (0, vitest_1.beforeEach)(async () => {
            orchestrator = new orchestrator_1.Orchestrator(config);
            await new Promise((resolve) => {
                orchestrator.once('initialized', resolve);
            });
        });
        (0, vitest_1.it)('should start parallel execution for an epic', async () => {
            const mockGetEpic = vitest_1.vi.fn().mockResolvedValue({
                id: 'epic-1',
                title: 'Test Epic',
                description: 'Test description',
                labels: ['feature'],
            });
            const mockGetEpicIssues = vitest_1.vi.fn().mockResolvedValue([
                { id: 'issue-1', number: 1, title: 'Issue 1', labels: ['code-implementer'] },
                { id: 'issue-2', number: 2, title: 'Issue 2', labels: ['test-coverage-validator'] },
            ]);
            vitest_1.vi.mocked(github_1.GitHubIntegration).prototype.getEpic = mockGetEpic;
            vitest_1.vi.mocked(github_1.GitHubIntegration).prototype.getEpicIssues = mockGetEpicIssues;
            const status = await orchestrator.startParallelExecution('epic-1');
            (0, vitest_1.expect)(status).toBeDefined();
            (0, vitest_1.expect)(status.epicId).toBe('epic-1');
            (0, vitest_1.expect)(status.status).toBe('running');
            (0, vitest_1.expect)(status.progress).toBe(0);
        });
        (0, vitest_1.it)('should emit progress events during execution', async () => {
            const progressEvents = [];
            orchestrator.on('execution:progress', (status) => {
                progressEvents.push(status);
            });
            const mockGetEpic = vitest_1.vi.fn().mockResolvedValue({
                id: 'epic-1',
                title: 'Test Epic',
                description: 'Test description',
            });
            vitest_1.vi.mocked(github_1.GitHubIntegration).prototype.getEpic = mockGetEpic;
            vitest_1.vi.mocked(github_1.GitHubIntegration).prototype.getEpicIssues = vitest_1.vi.fn().mockResolvedValue([]);
            await orchestrator.startParallelExecution('epic-1');
            // Wait for execution to process
            await new Promise((resolve) => setTimeout(resolve, 100));
            (0, vitest_1.expect)(progressEvents.length).toBeGreaterThan(0);
        });
    });
    (0, vitest_1.describe)('Execution Management', () => {
        let executionId;
        (0, vitest_1.beforeEach)(async () => {
            orchestrator = new orchestrator_1.Orchestrator(config);
            await new Promise((resolve) => {
                orchestrator.once('initialized', resolve);
            });
            const mockGetEpic = vitest_1.vi.fn().mockResolvedValue({
                id: 'epic-1',
                title: 'Test Epic',
                description: 'Test description',
            });
            vitest_1.vi.mocked(github_1.GitHubIntegration).prototype.getEpic = mockGetEpic;
            vitest_1.vi.mocked(github_1.GitHubIntegration).prototype.getEpicIssues = vitest_1.vi.fn().mockResolvedValue([]);
            const status = await orchestrator.startParallelExecution('epic-1');
            executionId = status.id;
        });
        (0, vitest_1.it)('should get execution status by ID', () => {
            const status = orchestrator.getExecutionStatus(executionId);
            (0, vitest_1.expect)(status).toBeDefined();
            (0, vitest_1.expect)(status?.id).toBe(executionId);
            (0, vitest_1.expect)(status?.status).toBe('running');
        });
        (0, vitest_1.it)('should get all executions', () => {
            const executions = orchestrator.getAllExecutions();
            (0, vitest_1.expect)(executions).toHaveLength(1);
            (0, vitest_1.expect)(executions[0].id).toBe(executionId);
        });
        (0, vitest_1.it)('should stop an execution', async () => {
            await orchestrator.stopExecution(executionId);
            const status = orchestrator.getExecutionStatus(executionId);
            (0, vitest_1.expect)(status?.status).toBe('stopped');
        });
    });
    (0, vitest_1.describe)('Error Handling', () => {
        (0, vitest_1.beforeEach)(async () => {
            orchestrator = new orchestrator_1.Orchestrator(config);
            await new Promise((resolve) => {
                orchestrator.once('initialized', resolve);
            });
        });
        (0, vitest_1.it)('should handle GitHub API errors gracefully', async () => {
            const mockGetEpic = vitest_1.vi.fn().mockRejectedValue(new Error('GitHub API error'));
            vitest_1.vi.mocked(github_1.GitHubIntegration).prototype.getEpic = mockGetEpic;
            await (0, vitest_1.expect)(orchestrator.startParallelExecution('epic-1')).rejects.toThrow('GitHub API error');
        });
        (0, vitest_1.it)('should handle missing execution pattern', async () => {
            const mockGetEpic = vitest_1.vi.fn().mockResolvedValue({
                id: 'epic-1',
                title: 'Test Epic',
                description: 'Test description',
                labels: ['unknown-label'],
            });
            vitest_1.vi.mocked(github_1.GitHubIntegration).prototype.getEpic = mockGetEpic;
            vitest_1.vi.mocked(github_1.GitHubIntegration).prototype.getEpicIssues = vitest_1.vi.fn().mockResolvedValue([]);
            const status = await orchestrator.startParallelExecution('epic-1', 'non-existent-pattern');
            // Should fall back to feature-development pattern
            (0, vitest_1.expect)(status.pattern).toBe('feature-development');
        });
    });
    (0, vitest_1.describe)('Shutdown', () => {
        (0, vitest_1.beforeEach)(async () => {
            orchestrator = new orchestrator_1.Orchestrator(config);
            await new Promise((resolve) => {
                orchestrator.once('initialized', resolve);
            });
        });
        (0, vitest_1.it)('should shutdown gracefully', async () => {
            const mockCleanup = vitest_1.vi.fn();
            const mockShutdown = vitest_1.vi.fn();
            vitest_1.vi.mocked(worktree_manager_1.WorktreeManager).prototype.cleanup = mockCleanup;
            vitest_1.vi.mocked(agent_pool_1.AgentPool).prototype.shutdown = mockShutdown;
            await orchestrator.shutdown();
            (0, vitest_1.expect)(mockCleanup).toHaveBeenCalled();
            (0, vitest_1.expect)(mockShutdown).toHaveBeenCalled();
        });
        (0, vitest_1.it)('should stop all running executions on shutdown', async () => {
            const mockGetEpic = vitest_1.vi.fn().mockResolvedValue({
                id: 'epic-1',
                title: 'Test Epic',
                description: 'Test description',
            });
            vitest_1.vi.mocked(github_1.GitHubIntegration).prototype.getEpic = mockGetEpic;
            vitest_1.vi.mocked(github_1.GitHubIntegration).prototype.getEpicIssues = vitest_1.vi.fn().mockResolvedValue([]);
            const status = await orchestrator.startParallelExecution('epic-1');
            await orchestrator.shutdown();
            const finalStatus = orchestrator.getExecutionStatus(status.id);
            (0, vitest_1.expect)(finalStatus?.status).toBe('stopped');
        });
    });
    (0, vitest_1.afterAll)(async () => {
        if (orchestrator) {
            await orchestrator.shutdown();
        }
    });
});
//# sourceMappingURL=orchestrator.test.js.map