import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Orchestrator } from '../../src/core/orchestrator';
import { GitHubIntegration } from '../../src/integrations/github';
import { WorktreeManager } from '../../src/core/worktree-manager';
import { AgentPool } from '../../src/agents/agent-pool';
import type { OrchestratorConfig } from '../../src/types';

// Mock implementations
vi.mock('../../src/integrations/github');
vi.mock('../../src/core/worktree-manager');
vi.mock('../../src/agents/agent-pool');
vi.mock('../../src/quality/quality-gates');
vi.mock('../../src/protocols/protocol-enforcer');

describe('Orchestrator Integration Tests', () => {
  let orchestrator: Orchestrator;
  let config: OrchestratorConfig;

  beforeAll(() => {
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize successfully with valid config', async () => {
      orchestrator = new Orchestrator(config);
      expect(orchestrator).toBeDefined();

      await new Promise((resolve) => {
        orchestrator.once('initialized', resolve);
      });
    });

    it('should validate all components during initialization', async () => {
      const mockGitHub = vi.mocked(GitHubIntegration);
      const mockWorktree = vi.mocked(WorktreeManager);
      const mockAgentPool = vi.mocked(AgentPool);

      orchestrator = new Orchestrator(config);

      await new Promise((resolve) => {
        orchestrator.once('initialized', resolve);
      });

      expect(mockGitHub).toHaveBeenCalled();
      expect(mockWorktree).toHaveBeenCalled();
      expect(mockAgentPool).toHaveBeenCalled();
    });
  });

  describe('Execution Patterns', () => {
    beforeEach(async () => {
      orchestrator = new Orchestrator(config);
      await new Promise((resolve) => {
        orchestrator.once('initialized', resolve);
      });
    });

    it('should have default execution patterns', () => {
      const patterns = orchestrator.getAvailablePatterns();

      expect(patterns).toHaveLength(3);
      expect(patterns.map((p) => p.name)).toContain('feature-development');
      expect(patterns.map((p) => p.name)).toContain('bug-fix-sprint');
      expect(patterns.map((p) => p.name)).toContain('security-audit');
    });

    it('should select appropriate pattern based on epic labels', async () => {
      const mockGetEpic = vi.fn().mockResolvedValue({
        id: 'epic-1',
        title: 'Test Epic',
        description: 'Test description',
        labels: ['bug'],
      });

      vi.mocked(GitHubIntegration).prototype.getEpic = mockGetEpic;

      const status = await orchestrator.startParallelExecution('epic-1');

      expect(status.pattern).toBe('bug-fix-sprint');
    });
  });

  describe('Parallel Execution', () => {
    beforeEach(async () => {
      orchestrator = new Orchestrator(config);
      await new Promise((resolve) => {
        orchestrator.once('initialized', resolve);
      });
    });

    it('should start parallel execution for an epic', async () => {
      const mockGetEpic = vi.fn().mockResolvedValue({
        id: 'epic-1',
        title: 'Test Epic',
        description: 'Test description',
        labels: ['feature'],
      });

      const mockGetEpicIssues = vi.fn().mockResolvedValue([
        { id: 'issue-1', number: 1, title: 'Issue 1', labels: ['code-implementer'] },
        { id: 'issue-2', number: 2, title: 'Issue 2', labels: ['test-coverage-validator'] },
      ]);

      vi.mocked(GitHubIntegration).prototype.getEpic = mockGetEpic;
      vi.mocked(GitHubIntegration).prototype.getEpicIssues = mockGetEpicIssues;

      const status = await orchestrator.startParallelExecution('epic-1');

      expect(status).toBeDefined();
      expect(status.epicId).toBe('epic-1');
      expect(status.status).toBe('running');
      expect(status.progress).toBe(0);
    });

    it('should emit progress events during execution', async () => {
      const progressEvents: any[] = [];

      orchestrator.on('execution:progress', (status) => {
        progressEvents.push(status);
      });

      const mockGetEpic = vi.fn().mockResolvedValue({
        id: 'epic-1',
        title: 'Test Epic',
        description: 'Test description',
      });

      vi.mocked(GitHubIntegration).prototype.getEpic = mockGetEpic;
      vi.mocked(GitHubIntegration).prototype.getEpicIssues = vi.fn().mockResolvedValue([]);

      await orchestrator.startParallelExecution('epic-1');

      // Wait for execution to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(progressEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Execution Management', () => {
    let executionId: string;

    beforeEach(async () => {
      orchestrator = new Orchestrator(config);
      await new Promise((resolve) => {
        orchestrator.once('initialized', resolve);
      });

      const mockGetEpic = vi.fn().mockResolvedValue({
        id: 'epic-1',
        title: 'Test Epic',
        description: 'Test description',
      });

      vi.mocked(GitHubIntegration).prototype.getEpic = mockGetEpic;
      vi.mocked(GitHubIntegration).prototype.getEpicIssues = vi.fn().mockResolvedValue([]);

      const status = await orchestrator.startParallelExecution('epic-1');
      executionId = status.id;
    });

    it('should get execution status by ID', () => {
      const status = orchestrator.getExecutionStatus(executionId);

      expect(status).toBeDefined();
      expect(status?.id).toBe(executionId);
      expect(status?.status).toBe('running');
    });

    it('should get all executions', () => {
      const executions = orchestrator.getAllExecutions();

      expect(executions).toHaveLength(1);
      expect(executions[0].id).toBe(executionId);
    });

    it('should stop an execution', async () => {
      await orchestrator.stopExecution(executionId);

      const status = orchestrator.getExecutionStatus(executionId);
      expect(status?.status).toBe('stopped');
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      orchestrator = new Orchestrator(config);
      await new Promise((resolve) => {
        orchestrator.once('initialized', resolve);
      });
    });

    it('should handle GitHub API errors gracefully', async () => {
      const mockGetEpic = vi.fn().mockRejectedValue(new Error('GitHub API error'));
      vi.mocked(GitHubIntegration).prototype.getEpic = mockGetEpic;

      await expect(orchestrator.startParallelExecution('epic-1')).rejects.toThrow(
        'GitHub API error',
      );
    });

    it('should handle missing execution pattern', async () => {
      const mockGetEpic = vi.fn().mockResolvedValue({
        id: 'epic-1',
        title: 'Test Epic',
        description: 'Test description',
        labels: ['unknown-label'],
      });

      vi.mocked(GitHubIntegration).prototype.getEpic = mockGetEpic;
      vi.mocked(GitHubIntegration).prototype.getEpicIssues = vi.fn().mockResolvedValue([]);

      const status = await orchestrator.startParallelExecution('epic-1', 'non-existent-pattern');

      // Should fall back to feature-development pattern
      expect(status.pattern).toBe('feature-development');
    });
  });

  describe('Shutdown', () => {
    beforeEach(async () => {
      orchestrator = new Orchestrator(config);
      await new Promise((resolve) => {
        orchestrator.once('initialized', resolve);
      });
    });

    it('should shutdown gracefully', async () => {
      const mockCleanup = vi.fn();
      const mockShutdown = vi.fn();

      vi.mocked(WorktreeManager).prototype.cleanup = mockCleanup;
      vi.mocked(AgentPool).prototype.shutdown = mockShutdown;

      await orchestrator.shutdown();

      expect(mockCleanup).toHaveBeenCalled();
      expect(mockShutdown).toHaveBeenCalled();
    });

    it('should stop all running executions on shutdown', async () => {
      const mockGetEpic = vi.fn().mockResolvedValue({
        id: 'epic-1',
        title: 'Test Epic',
        description: 'Test description',
      });

      vi.mocked(GitHubIntegration).prototype.getEpic = mockGetEpic;
      vi.mocked(GitHubIntegration).prototype.getEpicIssues = vi.fn().mockResolvedValue([]);

      const status = await orchestrator.startParallelExecution('epic-1');

      await orchestrator.shutdown();

      const finalStatus = orchestrator.getExecutionStatus(status.id);
      expect(finalStatus?.status).toBe('stopped');
    });
  });

  afterAll(async () => {
    if (orchestrator) {
      await orchestrator.shutdown();
    }
  });
});
