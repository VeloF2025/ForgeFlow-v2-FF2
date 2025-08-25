import { GitHubIntegration } from '../../integrations/github';
import { loadConfig } from '../../utils/config';
import { logger } from '../../utils/logger';
import type { OrchestratorConfig } from '../../types';

// GitHub API Service - Real Data Integration
export class GitHubAPIService {
  private static instance: GitHubAPIService;
  private githubIntegration: GitHubIntegration | null = null;
  private isInitialized = false;
  private initializationError: string | null = null;

  static getInstance(): GitHubAPIService {
    if (!GitHubAPIService.instance) {
      GitHubAPIService.instance = new GitHubAPIService();
    }
    return GitHubAPIService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      const config: OrchestratorConfig = await loadConfig();

      if (!config.github.token) {
        throw new Error(
          'GitHub token not configured. Please set GITHUB_TOKEN environment variable.',
        );
      }

      this.githubIntegration = new GitHubIntegration(config.github);
      await this.githubIntegration.validateConnection();

      this.isInitialized = true;
      this.initializationError = null;

      logger.info('GitHub API Service initialized successfully');
    } catch (error) {
      this.initializationError =
        error instanceof Error ? error.message : 'Unknown initialization error';
      logger.error('Failed to initialize GitHub API Service:', error);
      throw error;
    }
  }

  getIntegration(): GitHubIntegration {
    if (!this.isInitialized || !this.githubIntegration) {
      throw new Error(
        this.initializationError || 'GitHub API Service not initialized. Call initialize() first.',
      );
    }
    return this.githubIntegration;
  }

  isReady(): boolean {
    return this.isInitialized && this.githubIntegration !== null;
  }

  getErrorMessage(): string | null {
    return this.initializationError;
  }

  // Utility methods for common GitHub operations
  async getUserInfo() {
    const integration = this.getIntegration();
    // Access the private octokit property using array notation
    const { data } = await (integration as any).octokit.users.getAuthenticated();
    return {
      id: data.id,
      login: data.login,
      name: data.name,
      email: data.email,
      avatarUrl: data.avatar_url,
      company: data.company,
      location: data.location,
      publicRepos: data.public_repos,
      privateRepos: data.total_private_repos,
      followers: data.followers,
      following: data.following,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      url: data.html_url,
    };
  }

  async getRepositories(
    options: {
      visibility?: 'all' | 'public' | 'private';
      affiliation?: string;
      sort?: 'created' | 'updated' | 'pushed' | 'full_name';
      per_page?: number;
    } = {},
  ) {
    const integration = this.getIntegration();
    const { data } = await (integration as any).octokit.repos.listForAuthenticatedUser({
      visibility: options.visibility || 'all',
      affiliation: options.affiliation || 'owner,collaborator',
      sort: options.sort || 'updated',
      per_page: options.per_page || 50,
    });

    return data.map((repo: any) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      private: repo.private,
      language: repo.language,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      issues: repo.open_issues_count,
      updatedAt: repo.updated_at,
      url: repo.html_url,
      cloneUrl: repo.clone_url,
      defaultBranch: repo.default_branch,
      size: repo.size,
    }));
  }

  async getRepositoryIssues(
    owner: string,
    repo: string,
    options: {
      state?: 'open' | 'closed' | 'all';
      labels?: string;
      page?: number;
      per_page?: number;
    } = {},
  ) {
    const integration = this.getIntegration();
    const { data } = await (integration as any).octokit.issues.listForRepo({
      owner,
      repo,
      state: options.state || 'open',
      labels: options.labels,
      page: options.page || 1,
      per_page: options.per_page || 30,
      sort: 'updated',
      direction: 'desc',
    });

    return data.map((issue: any) => ({
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      labels: issue.labels.map((label: any) => (typeof label === 'string' ? label : label.name)),
      assignee: issue.assignee?.login,
      assignees: issue.assignees?.map((a: any) => a.login) || [],
      milestone: issue.milestone?.title,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      closedAt: issue.closed_at,
      url: issue.html_url,
      isPullRequest: !!issue.pull_request,
    }));
  }

  async getRepositoryMilestones(
    owner: string,
    repo: string,
    options: {
      state?: 'open' | 'closed' | 'all';
    } = {},
  ) {
    const integration = this.getIntegration();
    const { data } = await (integration as any).octokit.issues.listMilestones({
      owner,
      repo,
      state: options.state || 'open',
      sort: 'due_on',
      direction: 'asc',
    });

    return data.map((milestone: any) => ({
      id: milestone.id,
      number: milestone.number,
      title: milestone.title,
      description: milestone.description,
      state: milestone.state,
      openIssues: milestone.open_issues,
      closedIssues: milestone.closed_issues,
      totalIssues: milestone.open_issues + milestone.closed_issues,
      progress:
        milestone.open_issues + milestone.closed_issues > 0
          ? (milestone.closed_issues / (milestone.open_issues + milestone.closed_issues)) * 100
          : 0,
      dueOn: milestone.due_on,
      createdAt: milestone.created_at,
      updatedAt: milestone.updated_at,
      url: milestone.html_url,
    }));
  }

  async searchRepositories(
    query: string,
    options: {
      sort?: 'stars' | 'forks' | 'help-wanted-issues' | 'updated';
      order?: 'desc' | 'asc';
      page?: number;
      per_page?: number;
    } = {},
  ) {
    const integration = this.getIntegration();
    const { data } = await (integration as any).octokit.search.repos({
      q: query,
      sort: options.sort || 'updated',
      order: options.order || 'desc',
      page: options.page || 1,
      per_page: options.per_page || 30,
    });

    return {
      repositories: data.items.map((repo: any) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        private: repo.private,
        language: repo.language,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        issues: repo.open_issues_count,
        updatedAt: repo.updated_at,
        url: repo.html_url,
        owner: {
          login: repo.owner.login,
          avatarUrl: repo.owner.avatar_url,
        },
      })),
      totalCount: data.total_count,
      incompleteResults: data.incomplete_results,
    };
  }
}

// Export singleton instance
export const githubApiService = GitHubAPIService.getInstance();
