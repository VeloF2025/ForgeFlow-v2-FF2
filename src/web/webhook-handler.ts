import type { Request, Response } from 'express';
import crypto from 'crypto';
import type { Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger';
import { metrics } from '../monitoring/metrics';

export interface WebhookPayload {
  action: string;
  number?: number;
  issue?: {
    id: number;
    number: number;
    title: string;
    body: string;
    state: string;
    labels: Array<{ name: string; color: string }>;
    assignee: { login: string } | null;
    milestone: { title: string } | null;
    created_at: string;
    updated_at: string;
  };
  pull_request?: {
    id: number;
    number: number;
    title: string;
    body: string;
    state: string;
    draft: boolean;
    merged: boolean;
    merge_commit_sha: string | null;
    head: { ref: string };
    base: { ref: string };
    created_at: string;
    updated_at: string;
  };
  repository: {
    id: number;
    name: string;
    full_name: string;
    owner: { login: string };
    private: boolean;
    html_url: string;
  };
  sender: {
    login: string;
    avatar_url: string;
  };
}

export class GitHubWebhookHandler {
  private secret: string;
  private io: SocketIOServer;
  private isRunning: boolean = false;

  constructor(secret: string, io: SocketIOServer) {
    this.secret = secret;
    this.io = io;
  }

  // Start the webhook handler
  public start(): void {
    if (this.isRunning) {
      logger.warn('Webhook handler is already running');
      return;
    }
    this.isRunning = true;
    logger.info('GitHub webhook handler started');
  }

  // Stop the webhook handler
  public stop(): void {
    if (!this.isRunning) {
      logger.warn('Webhook handler is not running');
      return;
    }
    this.isRunning = false;
    logger.info('GitHub webhook handler stopped');
  }

  // Verify webhook signature
  private verifySignature(payload: string, signature: string): boolean {
    if (!this.secret) {
      logger.warn('No webhook secret configured, skipping signature verification');
      return true;
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.secret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(`sha256=${expectedSignature}`),
      Buffer.from(signature),
    );
  }

  // Main webhook handler
  public handle = async (req: Request, res: Response): Promise<void> => {
    try {
      const signature = req.get('X-Hub-Signature-256') || '';
      const event = req.get('X-GitHub-Event') || '';
      const payload = JSON.stringify(req.body);

      // Verify webhook signature
      if (!this.verifySignature(payload, signature)) {
        logger.error('Invalid webhook signature');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }

      // Parse webhook payload
      const webhookPayload: WebhookPayload = req.body;

      logger.info(`Received GitHub webhook: ${event} for ${webhookPayload.repository.full_name}`);

      // Process different event types
      switch (event) {
        case 'issues':
          await this.handleIssuesEvent(webhookPayload);
          break;
        case 'pull_request':
          await this.handlePullRequestEvent(webhookPayload);
          break;
        case 'push':
          await this.handlePushEvent(webhookPayload);
          break;
        case 'repository':
          await this.handleRepositoryEvent(webhookPayload);
          break;
        case 'milestone':
          await this.handleMilestoneEvent(webhookPayload);
          break;
        case 'ping':
          await this.handlePingEvent(webhookPayload);
          break;
        default:
          logger.debug(`Unhandled webhook event: ${event}`);
      }

      // Record webhook metrics
      metrics.incrementExecution('webhook', 'completed');

      res.status(200).json({
        message: 'Webhook processed successfully',
        event,
        repository: webhookPayload.repository.full_name,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to process webhook', error);
      metrics.incrementError('webhook', 'error');
      res.status(500).json({ error: 'Failed to process webhook' });
    }
  };

  // Handle issues events (opened, closed, edited, etc.)
  private async handleIssuesEvent(payload: WebhookPayload): Promise<void> {
    if (!payload.issue) return;

    const issueData = {
      action: payload.action,
      issue: {
        id: payload.issue.id,
        number: payload.issue.number,
        title: payload.issue.title,
        body: payload.issue.body,
        state: payload.issue.state,
        labels: payload.issue.labels.map((l) => ({ name: l.name, color: l.color })),
        assignee: payload.issue.assignee?.login,
        milestone: payload.issue.milestone?.title,
        createdAt: payload.issue.created_at,
        updatedAt: payload.issue.updated_at,
      },
      repository: {
        name: payload.repository.name,
        fullName: payload.repository.full_name,
        owner: payload.repository.owner.login,
      },
      sender: payload.sender,
      timestamp: new Date().toISOString(),
    };

    // Broadcast to clients subscribed to GitHub events
    this.io.to('github').emit('github:issues', issueData);
    this.io.to(`repo:${payload.repository.full_name}`).emit('github:issues', issueData);

    // Check if this issue is related to ForgeFlow execution
    if (this.isForgeFlowRelated(payload.issue.labels)) {
      this.io.to('executions').emit('github:forgeflow:issue', issueData);

      // Trigger execution if this is a new epic or high-priority issue
      if (payload.action === 'opened' && this.shouldTriggerExecution(payload.issue)) {
        await this.triggerForgeFlowExecution(payload.issue, payload.repository);
      }
    }

    logger.info(
      `Processed issues webhook: ${payload.action} #${payload.issue.number} in ${payload.repository.full_name}`,
    );
  }

  // Handle pull request events
  private async handlePullRequestEvent(payload: WebhookPayload): Promise<void> {
    if (!payload.pull_request) return;

    const prData = {
      action: payload.action,
      pullRequest: {
        id: payload.pull_request.id,
        number: payload.pull_request.number,
        title: payload.pull_request.title,
        body: payload.pull_request.body,
        state: payload.pull_request.state,
        draft: payload.pull_request.draft,
        merged: payload.pull_request.merged,
        mergeCommitSha: payload.pull_request.merge_commit_sha,
        headBranch: payload.pull_request.head.ref,
        baseBranch: payload.pull_request.base.ref,
        createdAt: payload.pull_request.created_at,
        updatedAt: payload.pull_request.updated_at,
      },
      repository: {
        name: payload.repository.name,
        fullName: payload.repository.full_name,
        owner: payload.repository.owner.login,
      },
      sender: payload.sender,
      timestamp: new Date().toISOString(),
    };

    this.io.to('github').emit('github:pull_request', prData);
    this.io.to(`repo:${payload.repository.full_name}`).emit('github:pull_request', prData);

    // If this PR is from ForgeFlow, update execution status
    if (this.isForgeFlowPR(payload.pull_request.head.ref)) {
      this.io.to('executions').emit('github:forgeflow:pr', prData);

      if (payload.action === 'closed' && payload.pull_request.merged) {
        await this.handleForgeFlowPRMerged(payload.pull_request, payload.repository);
      }
    }

    logger.info(
      `Processed PR webhook: ${payload.action} #${payload.pull_request.number} in ${payload.repository.full_name}`,
    );
  }

  // Handle push events
  private async handlePushEvent(payload: any): Promise<void> {
    const pushData = {
      ref: payload.ref,
      commits: payload.commits.map((commit: any) => ({
        id: commit.id,
        message: commit.message,
        author: commit.author,
        timestamp: commit.timestamp,
        url: commit.url,
      })),
      repository: {
        name: payload.repository.name,
        fullName: payload.repository.full_name,
        owner: payload.repository.owner.login,
      },
      pusher: payload.pusher,
      timestamp: new Date().toISOString(),
    };

    this.io.to('github').emit('github:push', pushData);
    this.io.to(`repo:${payload.repository.full_name}`).emit('github:push', pushData);

    // If push is to a ForgeFlow branch, update execution status
    if (this.isForgeFlowBranch(payload.ref)) {
      this.io.to('executions').emit('github:forgeflow:push', pushData);
    }

    logger.info(
      `Processed push webhook: ${payload.commits.length} commits to ${payload.ref} in ${payload.repository.full_name}`,
    );
  }

  // Handle repository events
  private async handleRepositoryEvent(payload: WebhookPayload): Promise<void> {
    const repoData = {
      action: payload.action,
      repository: {
        id: payload.repository.id,
        name: payload.repository.name,
        fullName: payload.repository.full_name,
        owner: payload.repository.owner.login,
        private: payload.repository.private,
        url: payload.repository.html_url,
      },
      sender: payload.sender,
      timestamp: new Date().toISOString(),
    };

    this.io.to('github').emit('github:repository', repoData);

    logger.info(
      `Processed repository webhook: ${payload.action} for ${payload.repository.full_name}`,
    );
  }

  // Handle milestone events
  private async handleMilestoneEvent(payload: any): Promise<void> {
    const milestoneData = {
      action: payload.action,
      milestone: {
        id: payload.milestone.id,
        number: payload.milestone.number,
        title: payload.milestone.title,
        description: payload.milestone.description,
        state: payload.milestone.state,
        openIssues: payload.milestone.open_issues,
        closedIssues: payload.milestone.closed_issues,
        dueOn: payload.milestone.due_on,
        createdAt: payload.milestone.created_at,
        updatedAt: payload.milestone.updated_at,
      },
      repository: {
        name: payload.repository.name,
        fullName: payload.repository.full_name,
        owner: payload.repository.owner.login,
      },
      sender: payload.sender,
      timestamp: new Date().toISOString(),
    };

    this.io.to('github').emit('github:milestone', milestoneData);
    this.io.to(`repo:${payload.repository.full_name}`).emit('github:milestone', milestoneData);

    logger.info(
      `Processed milestone webhook: ${payload.action} "${payload.milestone.title}" in ${payload.repository.full_name}`,
    );
  }

  // Handle ping events
  private async handlePingEvent(payload: WebhookPayload): Promise<void> {
    const pingData = {
      zen: (payload as any).zen,
      hook: (payload as any).hook,
      repository: {
        name: payload.repository.name,
        fullName: payload.repository.full_name,
        owner: payload.repository.owner.login,
      },
      timestamp: new Date().toISOString(),
    };

    this.io.to('github').emit('github:ping', pingData);

    logger.info(`Processed ping webhook from ${payload.repository.full_name}`);
  }

  // Helper methods
  private isForgeFlowRelated(labels: Array<{ name: string }>): boolean {
    const forgeflowLabels = [
      'epic',
      'forgeflow',
      'strategic-planner',
      'system-architect',
      'code-implementer',
      'test-coverage-validator',
      'security-auditor',
      'performance-optimizer',
      'ui-ux-optimizer',
      'database-architect',
      'deployment-automation',
      'code-quality-reviewer',
      'antihallucination-validator',
    ];

    return labels.some((label) =>
      forgeflowLabels.some((ff) => label.name.toLowerCase().includes(ff)),
    );
  }

  private shouldTriggerExecution(issue: { labels: Array<{ name: string }> }): boolean {
    return issue.labels.some(
      (label) =>
        label.name.toLowerCase().includes('epic') ||
        label.name.toLowerCase().includes('auto-execute'),
    );
  }

  private isForgeFlowPR(branchName: string): boolean {
    return branchName.startsWith('forgeflow/') || branchName.includes('ff-');
  }

  private isForgeFlowBranch(ref: string): boolean {
    return ref.includes('forgeflow') || ref.includes('ff-');
  }

  // Integration with ForgeFlow execution
  private async triggerForgeFlowExecution(
    issue: { id: number; number: number; title: string; labels: Array<{ name: string }> },
    repository: { full_name: string },
  ): Promise<void> {
    try {
      // This would integrate with the orchestrator to start an execution
      const executionEvent = {
        type: 'execution:trigger',
        source: 'github_webhook',
        epicId: issue.id.toString(),
        issueNumber: issue.number,
        title: issue.title,
        repository: repository.full_name,
        labels: issue.labels.map((l) => l.name),
        timestamp: new Date().toISOString(),
      };

      this.io.to('executions').emit('github:execution:trigger', executionEvent);

      logger.info(
        `Triggered ForgeFlow execution for issue #${issue.number} in ${repository.full_name}`,
      );
    } catch (error) {
      logger.error('Failed to trigger ForgeFlow execution', error);
    }
  }

  private async handleForgeFlowPRMerged(
    pr: { number: number; head: { ref: string } },
    repository: { full_name: string },
  ): Promise<void> {
    try {
      const completionEvent = {
        type: 'execution:pr_merged',
        prNumber: pr.number,
        branch: pr.head.ref,
        repository: repository.full_name,
        timestamp: new Date().toISOString(),
      };

      this.io.to('executions').emit('github:execution:completed', completionEvent);

      logger.info(`ForgeFlow PR #${pr.number} merged in ${repository.full_name}`);
    } catch (error) {
      logger.error('Failed to handle ForgeFlow PR merge', error);
    }
  }
}

// Factory function to create webhook handler with config object (for CLI)
export const createWebhookHandler = (config: {
  secret: string;
  port: number;
  orchestrator: any;
}): GitHubWebhookHandler => {
  // For now, we'll create a mock SocketIO server since it's not being passed in the CLI
  // This will be properly integrated when the web server is running
  const mockIO = {
    to: () => ({ emit: () => {} }),
  } as any;

  return new GitHubWebhookHandler(config.secret, mockIO);
};

// Factory function to create webhook handler with direct parameters (for server)
export const createWebhookHandlerWithIO = (secret: string, io: any): GitHubWebhookHandler => {
  return new GitHubWebhookHandler(secret, io);
};
