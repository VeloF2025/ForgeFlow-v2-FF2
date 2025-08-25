import { Octokit } from '@octokit/rest';
import { graphql } from '@octokit/graphql';
import type { GitHubConfig, Epic, Issue } from '../types';
import { LogContext } from '../utils/logger';

export class GitHubIntegration {
  private config: GitHubConfig;
  private octokit: Octokit;
  private graphqlClient: typeof graphql;
  private logger: LogContext;

  constructor(config: GitHubConfig) {
    this.config = config;
    this.logger = new LogContext('GitHubIntegration');

    this.octokit = new Octokit({
      auth: config.token,
      baseUrl: config.apiUrl || 'https://api.github.com',
    });

    this.graphqlClient = graphql.defaults({
      headers: {
        authorization: `token ${config.token}`,
      },
    });
  }

  async validateConnection(): Promise<void> {
    try {
      const { data } = await this.octokit.users.getAuthenticated();
      this.logger.info(`Connected to GitHub as: ${data.login}`);

      await this.octokit.repos.get({
        owner: this.config.owner,
        repo: this.config.repo,
      });

      this.logger.info(`Repository validated: ${this.config.owner}/${this.config.repo}`);
    } catch (error) {
      this.logger.error('Failed to validate GitHub connection', error);
      throw new Error(`GitHub connection validation failed: ${String(error)}`);
    }
  }

  async getEpic(epicId: string): Promise<Epic> {
    try {
      const issueNumber = this.extractIssueNumber(epicId);

      const { data } = await this.octokit.issues.get({
        owner: this.config.owner,
        repo: this.config.repo,
        issue_number: issueNumber,
      });

      return this.mapIssueToEpic(data);
    } catch (error) {
      this.logger.error(`Failed to get epic: ${epicId}`, error);
      throw error;
    }
  }

  async getEpicIssues(epicId: string): Promise<Issue[]> {
    try {
      const query = `
        query($owner: String!, $repo: String!, $milestone: String) {
          repository(owner: $owner, name: $repo) {
            issues(
              first: 100,
              states: OPEN,
              filterBy: { milestone: $milestone }
            ) {
              nodes {
                id
                number
                title
                body
                state
                createdAt
                updatedAt
                labels(first: 10) {
                  nodes {
                    name
                  }
                }
                assignees(first: 5) {
                  nodes {
                    login
                  }
                }
                milestone {
                  title
                }
              }
            }
          }
        }
      `;

      const variables = {
        owner: this.config.owner,
        repo: this.config.repo,
        milestone: epicId,
      };

      const response: any = await this.graphqlClient(query, variables);
      const issues = response.repository.issues.nodes;

      return issues.map(this.mapGraphQLIssue);
    } catch (error) {
      this.logger.error(`Failed to get epic issues: ${epicId}`, error);
      throw error;
    }
  }

  async createIssue(issue: Partial<Issue>): Promise<Issue> {
    try {
      const { data } = await this.octokit.issues.create({
        owner: this.config.owner,
        repo: this.config.repo,
        title: issue.title || 'New Issue',
        body: issue.body || '',
        labels: issue.labels,
        milestone: issue.milestone ? parseInt(issue.milestone, 10) : undefined,
      });

      return this.mapApiIssue(data);
    } catch (error) {
      this.logger.error('Failed to create issue', error);
      throw error;
    }
  }

  async updateIssue(issueNumber: number, updates: Partial<Issue>): Promise<Issue> {
    try {
      const { data } = await this.octokit.issues.update({
        owner: this.config.owner,
        repo: this.config.repo,
        issue_number: issueNumber,
        title: updates.title,
        body: updates.body,
        state: updates.state,
        labels: updates.labels,
      });

      return this.mapApiIssue(data);
    } catch (error) {
      this.logger.error(`Failed to update issue #${issueNumber}`, error);
      throw error;
    }
  }

  async addIssueComment(issueNumber: number, comment: string): Promise<void> {
    try {
      await this.octokit.issues.createComment({
        owner: this.config.owner,
        repo: this.config.repo,
        issue_number: issueNumber,
        body: comment,
      });

      this.logger.debug(`Added comment to issue #${issueNumber}`);
    } catch (error) {
      this.logger.error(`Failed to add comment to issue #${issueNumber}`, error);
      throw error;
    }
  }

  async createPullRequest(params: {
    title: string;
    body: string;
    head: string;
    base: string;
    draft?: boolean;
  }): Promise<number> {
    try {
      const { data } = await this.octokit.pulls.create({
        owner: this.config.owner,
        repo: this.config.repo,
        title: params.title,
        body: params.body,
        head: params.head,
        base: params.base,
        draft: params.draft || false,
      });

      this.logger.info(`Created PR #${data.number}: ${params.title}`);
      return data.number;
    } catch (error) {
      this.logger.error('Failed to create pull request', error);
      throw error;
    }
  }

  async mergePullRequest(
    prNumber: number,
    mergeMethod: 'merge' | 'squash' | 'rebase' = 'squash',
  ): Promise<void> {
    try {
      await this.octokit.pulls.merge({
        owner: this.config.owner,
        repo: this.config.repo,
        pull_number: prNumber,
        merge_method: mergeMethod,
      });

      this.logger.info(`Merged PR #${prNumber}`);
    } catch (error) {
      this.logger.error(`Failed to merge PR #${prNumber}`, error);
      throw error;
    }
  }

  async createLabel(name: string, color: string, description?: string): Promise<void> {
    try {
      await this.octokit.issues.createLabel({
        owner: this.config.owner,
        repo: this.config.repo,
        name,
        color,
        description,
      });

      this.logger.debug(`Created label: ${name}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('already_exists')) {
        this.logger.debug(`Label already exists: ${name}`);
      } else {
        this.logger.error(`Failed to create label: ${name}`, error);
        throw error;
      }
    }
  }

  async ensureLabels(): Promise<void> {
    const labels = [
      { name: 'epic', color: '7057ff', description: 'Epic issue' },
      { name: 'strategic-planner', color: '0075ca', description: 'Strategic planning agent' },
      { name: 'system-architect', color: '0075ca', description: 'System architecture agent' },
      { name: 'code-implementer', color: '008672', description: 'Code implementation agent' },
      { name: 'test-coverage-validator', color: 'd73a4a', description: 'Test coverage agent' },
      { name: 'security-auditor', color: 'b60205', description: 'Security audit agent' },
      {
        name: 'performance-optimizer',
        color: 'fbca04',
        description: 'Performance optimization agent',
      },
      { name: 'ui-ux-optimizer', color: '5319e7', description: 'UI/UX optimization agent' },
      { name: 'database-architect', color: '006b75', description: 'Database architecture agent' },
      {
        name: 'deployment-automation',
        color: '0e8a16',
        description: 'Deployment automation agent',
      },
      { name: 'code-quality-reviewer', color: 'd93f0b', description: 'Code quality review agent' },
      {
        name: 'antihallucination-validator',
        color: 'e99695',
        description: 'Anti-hallucination validator',
      },
    ];

    for (const label of labels) {
      await this.createLabel(label.name, label.color, label.description);
    }

    this.logger.info('All agent labels ensured');
  }

  private extractIssueNumber(epicId: string): number {
    const match = epicId.match(/\d+/);
    if (!match) {
      throw new Error(`Invalid epic ID format: ${epicId}`);
    }
    return parseInt(match[0], 10);
  }

  private mapIssueToEpic(issue: any): Epic {
    return {
      id: issue.id.toString(),
      title: issue.title,
      description: issue.body || '',
      labels: issue.labels?.map((l: any) => l.name) || [],
      milestone: issue.milestone?.title,
      createdAt: new Date(issue.created_at),
      updatedAt: new Date(issue.updated_at),
    };
  }

  private mapApiIssue(issue: any): Issue {
    return {
      id: issue.id.toString(),
      number: issue.number,
      title: issue.title,
      body: issue.body || '',
      labels: issue.labels?.map((l: any) => l.name) || [],
      assignee: issue.assignee?.login,
      state: issue.state as 'open' | 'closed',
      milestone: issue.milestone?.title,
      createdAt: new Date(issue.created_at),
      updatedAt: new Date(issue.updated_at),
    };
  }

  private mapGraphQLIssue(issue: any): Issue {
    return {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body || '',
      labels: issue.labels?.nodes?.map((l: any) => l.name) || [],
      assignee: issue.assignees?.nodes?.[0]?.login,
      state: issue.state.toLowerCase() as 'open' | 'closed',
      milestone: issue.milestone?.title,
      createdAt: new Date(issue.createdAt),
      updatedAt: new Date(issue.updatedAt),
    };
  }
}
