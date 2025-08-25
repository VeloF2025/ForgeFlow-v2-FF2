import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Orchestrator } from '../../../src/core/orchestrator';
import type { OrchestratorConfig, ExecutionStatus } from '../../../src/types';

// Mock dependencies
vi.mock('../../../src/integrations/github');
vi.mock('../../../src/core/worktree-manager');
vi.mock('../../../src/agents/agent-pool');
vi.mock('../../../src/quality/quality-gates');
vi.mock('../../../src/protocols/protocol-enforcer');

describe('Orchestrator Unit Tests', () => {
  let orchestrator: Orchestrator;
  let config: OrchestratorConfig;
  let mockEventEmitter: any;

  beforeEach(() => {
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
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      emit: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    };

    orchestrator = new Orchestrator(config);

    // Mock EventEmitter methods
    Object.assign(orchestrator, mockEventEmitter);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create instance successfully', () => {
      expect(orchestrator).toBeDefined();
      expect(orchestrator).toBeInstanceOf(Orchestrator);
    });

    it('should initialize with correct configuration', () => {
      // @ts-ignore - Access private config for testing
      expect(orchestrator.config).toEqual(config);
    });

    it('should validate required configuration fields', () => {
      expect(
        () =>
          new Orchestrator({
            ...config,
            github: { ...config.github, token: '' },
          }),
      ).toThrow();
    });
  });

  describe('Initialization', () => {
    it('should initialize all components successfully', async () => {
      const initPromise = orchestrator.initialize();

      // Simulate initialization completion
      setTimeout(() => {
        // @ts-ignore
        orchestrator.emit('initialized');
      }, 10);

      await expect(initPromise).resolves.not.toThrow();
    });

    it('should handle initialization failures gracefully', async () => {
      const initError = new Error('GitHub API initialization failed');

      setTimeout(() => {
        // @ts-ignore
        orchestrator.emit('error', initError);
      }, 10);

      const initPromise = orchestrator.initialize();
      await expect(initPromise).rejects.toThrow('GitHub API initialization failed');
    });

    it('should validate GitHub connection during initialization', async () => {
      const { GitHubIntegration } = require('../../../src/integrations/github');
      const mockGitHub = {
        validateConnection: vi.fn().mockResolvedValue(true),
        getRepositoryInfo: vi.fn().mockResolvedValue({
          name: 'test-repo',
          owner: { login: 'test-owner' },
        }),
      };

      GitHubIntegration.mockImplementation(() => mockGitHub);

      await orchestrator.initialize();

      expect(mockGitHub.validateConnection).toHaveBeenCalled();
    });
  });

  describe('Execution Patterns', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it('should have default execution patterns defined', () => {
      const patterns = orchestrator.getAvailablePatterns();

      expect(patterns).toHaveLength(3);
      expect(patterns.map((p) => p.name)).toContain('feature-development');
      expect(patterns.map((p) => p.name)).toContain('bug-fix-sprint');
      expect(patterns.map((p) => p.name)).toContain('security-audit');
    });

    it('should select appropriate pattern based on epic labels', () => {
      const featureEpic = { labels: ['feature', 'enhancement'] };
      const bugEpic = { labels: ['bug', 'critical'] };
      const securityEpic = { labels: ['security', 'vulnerability'] };

      // @ts-ignore
      expect(orchestrator.selectExecutionPattern(featureEpic)).toBe('feature-development');
      // @ts-ignore
      expect(orchestrator.selectExecutionPattern(bugEpic)).toBe('bug-fix-sprint');
      // @ts-ignore
      expect(orchestrator.selectExecutionPattern(securityEpic)).toBe('security-audit');
    });

    it('should fallback to feature-development for unknown labels', () => {
      const unknownEpic = { labels: ['unknown', 'custom'] };

      // @ts-ignore
      expect(orchestrator.selectExecutionPattern(unknownEpic)).toBe('feature-development');
    });

    it('should customize pattern configuration', () => {
      const customPattern = {
        name: 'custom-pattern',
        description: 'Custom execution pattern',
        maxParallelAgents: 5,
        estimatedDuration: 30,
        agents: ['code-implementer', 'test-coverage-validator'],
      };

      orchestrator.addExecutionPattern(customPattern);

      const patterns = orchestrator.getAvailablePatterns();
      expect(patterns).toHaveLength(4);
      expect(patterns.find((p) => p.name === 'custom-pattern')).toBeDefined();
    });
  });

  describe('Parallel Execution', () => {
    const mockEpicId = 'epic-123';

    beforeEach(async () => {
      await orchestrator.initialize();

      // Mock GitHub integration
      const { GitHubIntegration } = require('../../../src/integrations/github');
      const mockGitHub = {
        getEpic: vi.fn().mockResolvedValue({
          id: mockEpicId,
          title: 'Test Epic',
          description: 'Epic description',
          labels: ['feature'],
        }),
        getEpicIssues: vi.fn().mockResolvedValue([
          { id: 'issue-1', number: 1, title: 'Task 1', labels: ['code-implementer'] },
          { id: 'issue-2', number: 2, title: 'Task 2', labels: ['test-coverage-validator'] },
        ]),
      };

      // @ts-ignore
      orchestrator.github = mockGitHub;
    });

    it('should start parallel execution successfully', async () => {
      const status = await orchestrator.startParallelExecution(mockEpicId);

      expect(status).toBeDefined();
      expect(status.epicId).toBe(mockEpicId);
      expect(status.status).toBe('running');
      expect(status.progress).toBe(0);
      expect(status.pattern).toBe('feature-development');
    });

    it('should assign agents to tasks based on labels', async () => {
      const status = await orchestrator.startParallelExecution(mockEpicId);

      expect(status.tasks).toHaveLength(2);
      expect(status.tasks[0].agentType).toBe('code-implementer');
      expect(status.tasks[1].agentType).toBe('test-coverage-validator');
    });

    it('should handle epic without issues', async () => {
      // @ts-ignore
      orchestrator.github.getEpicIssues.mockResolvedValue([]);

      const status = await orchestrator.startParallelExecution(mockEpicId);

      expect(status.tasks).toHaveLength(0);
      expect(status.status).toBe('completed');
    });

    it('should respect maximum concurrent agents limit', async () => {
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
      expect(status.tasks.filter((t) => t.status === 'running')).toHaveLength(3);
    });

    it('should emit progress events during execution', async () => {
      const progressSpy = vi.fn();
      orchestrator.on('execution:progress', progressSpy);

      await orchestrator.startParallelExecution(mockEpicId);

      // Wait for async events
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(progressSpy).toHaveBeenCalled();
      expect(progressSpy.mock.calls[0][0]).toHaveProperty('epicId', mockEpicId);
    });

    it('should handle agent execution failures gracefully', async () => {
      const { AgentPool } = require('../../../src/agents/agent-pool');
      const mockAgentPool = {
        executeAgent: vi.fn().mockRejectedValue(new Error('Agent execution failed')),
      };

      // @ts-ignore
      orchestrator.agentPool = mockAgentPool;

      const status = await orchestrator.startParallelExecution(mockEpicId);

      expect(status.tasks.some((t) => t.status === 'failed')).toBe(true);
    });
  });

  describe('Execution Management', () => {
    let executionId: string;

    beforeEach(async () => {
      await orchestrator.initialize();

      const { GitHubIntegration } = require('../../../src/integrations/github');
      const mockGitHub = {
        getEpic: vi.fn().mockResolvedValue({
          id: 'epic-test',
          title: 'Test Epic',
          description: 'Test description',
          labels: ['feature'],
        }),
        getEpicIssues: vi.fn().mockResolvedValue([]),
      };

      // @ts-ignore
      orchestrator.github = mockGitHub;

      const status = await orchestrator.startParallelExecution('epic-test');
      executionId = status.id;
    });

    it('should retrieve execution status by ID', () => {
      const status = orchestrator.getExecutionStatus(executionId);

      expect(status).toBeDefined();
      expect(status?.id).toBe(executionId);
    });

    it('should return null for non-existent execution ID', () => {
      const status = orchestrator.getExecutionStatus('non-existent');

      expect(status).toBeNull();
    });

    it('should list all active executions', () => {
      const executions = orchestrator.getAllExecutions();

      expect(executions).toHaveLength(1);
      expect(executions[0].id).toBe(executionId);
    });

    it('should stop execution successfully', async () => {
      await orchestrator.stopExecution(executionId);

      const status = orchestrator.getExecutionStatus(executionId);
      expect(status?.status).toBe('stopped');
    });

    it('should handle stopping non-existent execution', async () => {
      await expect(orchestrator.stopExecution('non-existent')).resolves.not.toThrow();
    });

    it('should clean up resources when stopping execution', async () => {
      const { WorktreeManager } = require('../../../src/core/worktree-manager');
      const mockWorktreeManager = {
        cleanup: vi.fn(),
      };

      // @ts-ignore
      orchestrator.worktreeManager = mockWorktreeManager;

      await orchestrator.stopExecution(executionId);

      expect(mockWorktreeManager.cleanup).toHaveBeenCalled();
    });
  });

  describe('Quality Gates Integration', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it('should validate code quality before execution', async () => {
      const { QualityGates } = require('../../../src/quality/quality-gates');
      const mockQualityGates = {
        validateCode: vi.fn().mockResolvedValue({ passed: true, issues: [] }),
      };

      // @ts-ignore
      orchestrator.qualityGates = mockQualityGates;

      const validation = await orchestrator.validateQualityGates('test-worktree');

      expect(validation.passed).toBe(true);
      expect(mockQualityGates.validateCode).toHaveBeenCalledWith('test-worktree');
    });

    it('should fail execution if quality gates fail', async () => {
      const { QualityGates } = require('../../../src/quality/quality-gates');
      const mockQualityGates = {
        validateCode: vi.fn().mockResolvedValue({
          passed: false,
          issues: [
            { type: 'typescript', message: 'Type error in file.ts' },
            { type: 'eslint', message: 'Linting error' },
          ],
        }),
      };

      // @ts-ignore
      orchestrator.qualityGates = mockQualityGates;

      await expect(orchestrator.validateQualityGates('test-worktree')).rejects.toThrow(
        'Quality gate validation failed',
      );
    });

    it('should enforce zero tolerance for TypeScript errors', async () => {
      const { QualityGates } = require('../../../src/quality/quality-gates');
      const mockQualityGates = {
        validateTypeScript: vi.fn().mockResolvedValue({
          errors: [{ file: 'test.ts', line: 1, message: 'Type error' }],
        }),
      };

      // @ts-ignore
      orchestrator.qualityGates = mockQualityGates;

      await expect(orchestrator.validateTypeScript('test-worktree')).rejects.toThrow(
        'TypeScript validation failed',
      );
    });

    it('should enforce zero tolerance for ESLint errors', async () => {
      const { QualityGates } = require('../../../src/quality/quality-gates');
      const mockQualityGates = {
        validateESLint: vi.fn().mockResolvedValue({
          errorCount: 1,
          warningCount: 0,
          results: [{ filePath: 'test.ts', messages: [{ severity: 2, message: 'Error' }] }],
        }),
      };

      // @ts-ignore
      orchestrator.qualityGates = mockQualityGates;

      await expect(orchestrator.validateESLint('test-worktree')).rejects.toThrow(
        'ESLint validation failed',
      );
    });
  });

  describe('Protocol Enforcement', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it('should enforce NLNH protocol', () => {
      const { ProtocolEnforcer } = require('../../../src/protocols/protocol-enforcer');
      const mockProtocolEnforcer = {
        enforceNLNH: vi.fn().mockReturnValue(true),
      };

      // @ts-ignore
      orchestrator.protocolEnforcer = mockProtocolEnforcer;

      const result = orchestrator.enforceNLNHProtocol('test-statement');

      expect(result).toBe(true);
      expect(mockProtocolEnforcer.enforceNLNH).toHaveBeenCalledWith('test-statement');
    });

    it('should enforce AntiHall protocol', async () => {
      const { ProtocolEnforcer } = require('../../../src/protocols/protocol-enforcer');
      const mockProtocolEnforcer = {
        validateCodeExists: vi.fn().mockResolvedValue(true),
      };

      // @ts-ignore
      orchestrator.protocolEnforcer = mockProtocolEnforcer;

      const result = await orchestrator.validateCodeExists('testFunction');

      expect(result).toBe(true);
      expect(mockProtocolEnforcer.validateCodeExists).toHaveBeenCalledWith('testFunction');
    });

    it('should enforce RYR protocol on session start', () => {
      const { ProtocolEnforcer } = require('../../../src/protocols/protocol-enforcer');
      const mockProtocolEnforcer = {
        loadRules: vi.fn(),
        validateRules: vi.fn().mockReturnValue(true),
      };

      // @ts-ignore
      orchestrator.protocolEnforcer = mockProtocolEnforcer;

      orchestrator.enforceRYRProtocol();

      expect(mockProtocolEnforcer.loadRules).toHaveBeenCalled();
      expect(mockProtocolEnforcer.validateRules).toHaveBeenCalled();
    });
  });

  describe('Performance Metrics', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it('should track execution performance metrics', async () => {
      const startTime = Date.now();

      const status = await orchestrator.startParallelExecution('epic-perf-test');

      expect(status.metrics).toBeDefined();
      expect(status.metrics.startTime).toBeGreaterThanOrEqual(startTime);
      expect(status.metrics.estimatedDuration).toBeGreaterThan(0);
    });

    it('should calculate execution progress accurately', () => {
      const execution: ExecutionStatus = {
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

      expect(progress).toBe(50); // (100 + 50 + 0) / 3
    });

    it('should provide performance analytics', () => {
      const analytics = orchestrator.getPerformanceAnalytics();

      expect(analytics).toHaveProperty('averageExecutionTime');
      expect(analytics).toHaveProperty('successRate');
      expect(analytics).toHaveProperty('agentPerformance');
      expect(analytics).toHaveProperty('patternEfficiency');
    });
  });

  describe('Error Handling', () => {
    it('should handle GitHub API errors gracefully', async () => {
      const { GitHubIntegration } = require('../../../src/integrations/github');
      const mockGitHub = {
        getEpic: vi.fn().mockRejectedValue(new Error('GitHub API error')),
      };

      // @ts-ignore
      orchestrator.github = mockGitHub;

      await expect(orchestrator.startParallelExecution('epic-error')).rejects.toThrow(
        'GitHub API error',
      );
    });

    it('should handle worktree creation failures', async () => {
      const { WorktreeManager } = require('../../../src/core/worktree-manager');
      const mockWorktreeManager = {
        createWorktree: vi.fn().mockRejectedValue(new Error('Worktree creation failed')),
      };

      // @ts-ignore
      orchestrator.worktreeManager = mockWorktreeManager;

      await expect(orchestrator.createWorktree('test-branch')).rejects.toThrow(
        'Worktree creation failed',
      );
    });

    it('should handle agent pool failures', async () => {
      const { AgentPool } = require('../../../src/agents/agent-pool');
      const mockAgentPool = {
        initialize: vi.fn().mockRejectedValue(new Error('Agent pool initialization failed')),
      };

      AgentPool.mockImplementation(() => mockAgentPool);

      await expect(new Orchestrator(config).initialize()).rejects.toThrow(
        'Agent pool initialization failed',
      );
    });

    it('should provide detailed error information', async () => {
      const error = new Error('Test error');
      error.stack = 'Error stack trace';

      try {
        throw error;
      } catch (e) {
        const errorInfo = orchestrator.formatError(e);

        expect(errorInfo).toHaveProperty('message', 'Test error');
        expect(errorInfo).toHaveProperty('stack');
        expect(errorInfo).toHaveProperty('timestamp');
      }
    });
  });

  describe('Shutdown', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it('should shutdown gracefully', async () => {
      const { WorktreeManager } = require('../../../src/core/worktree-manager');
      const { AgentPool } = require('../../../src/agents/agent-pool');

      const mockWorktreeManager = { cleanup: vi.fn() };
      const mockAgentPool = { shutdown: vi.fn() };

      // @ts-ignore
      orchestrator.worktreeManager = mockWorktreeManager;
      // @ts-ignore
      orchestrator.agentPool = mockAgentPool;

      await orchestrator.shutdown();

      expect(mockWorktreeManager.cleanup).toHaveBeenCalled();
      expect(mockAgentPool.shutdown).toHaveBeenCalled();
    });

    it('should stop all running executions on shutdown', async () => {
      // Start an execution
      const status = await orchestrator.startParallelExecution('epic-shutdown');

      await orchestrator.shutdown();

      const finalStatus = orchestrator.getExecutionStatus(status.id);
      expect(finalStatus?.status).toBe('stopped');
    });

    it('should handle shutdown errors gracefully', async () => {
      const { AgentPool } = require('../../../src/agents/agent-pool');
      const mockAgentPool = {
        shutdown: vi.fn().mockRejectedValue(new Error('Shutdown failed')),
      };

      // @ts-ignore
      orchestrator.agentPool = mockAgentPool;

      // Should not throw despite shutdown error
      await expect(orchestrator.shutdown()).resolves.not.toThrow();
    });

    it('should emit shutdown event', async () => {
      const shutdownSpy = vi.fn();
      orchestrator.on('shutdown', shutdownSpy);

      await orchestrator.shutdown();

      expect(shutdownSpy).toHaveBeenCalled();
    });
  });
});
