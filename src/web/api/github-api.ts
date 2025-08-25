import type { Request, Response } from 'express';
import { GitHubIntegration } from '../../integrations/github';
import { loadConfig } from '../../utils/config';
import { logger } from '../../utils/logger';
import { metrics } from '../../monitoring/metrics';

let githubIntegration: GitHubIntegration | null = null;

const initializeGitHub = async (): Promise<GitHubIntegration> => {
  if (!githubIntegration) {
    try {
      const config = await loadConfig();
      githubIntegration = new GitHubIntegration(config.github);
      await githubIntegration.validateConnection();
    } catch (error) {
      logger.error('Failed to initialize GitHub integration', error);
      throw error;
    }
  }
  return githubIntegration;
};

// Get authenticated user repositories
export const getRepositories = async (req: Request, res: Response): Promise<void> => {
  try {
    const { includeArchived = 'false', activeOnly = 'false' } = req.query;
    const github = await initializeGitHub();

    const { data } = await github['octokit'].repos.listForAuthenticatedUser({
      visibility: 'all',
      affiliation: 'owner,collaborator',
      sort: 'updated',
      per_page: 100,
    });

    let repositories = data.map((repo) => ({
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
      archived: repo.archived,
      disabled: repo.disabled,
      pushedAt: repo.pushed_at,
    }));

    // Filter based on query parameters
    if (includeArchived === 'false') {
      repositories = repositories.filter((repo) => !repo.archived);
    }

    if (activeOnly === 'true') {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      repositories = repositories.filter(
        (repo) => new Date(repo.pushedAt || repo.updatedAt) > sixMonthsAgo,
      );
    }

    res.json({
      repositories,
      total: repositories.length,
      filters: {
        includeArchived: includeArchived === 'true',
        activeOnly: activeOnly === 'true',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to fetch repositories', error);
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
};

// Get repository issues
export const getRepositoryIssues = async (req: Request, res: Response): Promise<void> => {
  try {
    const { owner, repo } = req.params;
    const { state = 'open', labels, page = 1, per_page = 30 } = req.query;

    const github = await initializeGitHub();
    const { data } = await github['octokit'].issues.listForRepo({
      owner,
      repo,
      state: state as 'open' | 'closed' | 'all',
      labels: labels as string,
      page: parseInt(page as string, 10),
      per_page: parseInt(per_page as string, 10),
      sort: 'updated',
      direction: 'desc',
    });

    const issues = data.map((issue) => ({
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      labels: issue.labels.map((label) => (typeof label === 'string' ? label : label.name)),
      assignee: issue.assignee?.login,
      assignees: issue.assignees?.map((a) => a.login) || [],
      milestone: issue.milestone?.title,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      closedAt: issue.closed_at,
      url: issue.html_url,
      isPullRequest: !!issue.pull_request,
    }));

    res.json({
      issues,
      repository: { owner, repo },
      pagination: {
        page: parseInt(page as string, 10),
        per_page: parseInt(per_page as string, 10),
        total: issues.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to fetch repository issues', error);
    res.status(500).json({ error: 'Failed to fetch repository issues' });
  }
};

// Get repository milestones (epics)
export const getRepositoryMilestones = async (req: Request, res: Response): Promise<void> => {
  try {
    const { owner, repo } = req.params;
    const { state = 'open' } = req.query;

    const github = await initializeGitHub();
    const { data } = await github['octokit'].issues.listMilestones({
      owner,
      repo,
      state: state as 'open' | 'closed' | 'all',
      sort: 'due_on',
      direction: 'asc',
    });

    const milestones = data.map((milestone) => ({
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

    res.json({
      milestones,
      repository: { owner, repo },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to fetch repository milestones', error);
    res.status(500).json({ error: 'Failed to fetch repository milestones' });
  }
};

// Get authenticated user info
export const getUserInfo = async (req: Request, res: Response): Promise<void> => {
  try {
    const github = await initializeGitHub();
    const { data } = await github['octokit'].users.getAuthenticated();

    const userInfo = {
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

    res.json({
      user: userInfo,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to fetch user info', error);
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
};

// Get repository statistics
export const getRepositoryStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { owner, repo } = req.params;
    const github = await initializeGitHub();

    // Get multiple API calls in parallel
    const [repoData, languagesData, contributorsData] = await Promise.all([
      github['octokit'].repos.get({ owner, repo }),
      github['octokit'].repos.listLanguages({ owner, repo }),
      github['octokit'].repos.listContributors({ owner, repo, per_page: 10 }),
    ]);

    const stats = {
      repository: {
        name: repoData.data.name,
        fullName: repoData.data.full_name,
        description: repoData.data.description,
        language: repoData.data.language,
        size: repoData.data.size,
        stars: repoData.data.stargazers_count,
        watchers: repoData.data.watchers_count,
        forks: repoData.data.forks_count,
        issues: repoData.data.open_issues_count,
        defaultBranch: repoData.data.default_branch,
        createdAt: repoData.data.created_at,
        updatedAt: repoData.data.updated_at,
        pushedAt: repoData.data.pushed_at,
      },
      languages: languagesData.data,
      contributors: contributorsData.data.map((contributor) => ({
        login: contributor.login,
        contributions: contributor.contributions,
        avatarUrl: contributor.avatar_url,
        url: contributor.html_url,
      })),
      timestamp: new Date().toISOString(),
    };

    res.json(stats);
  } catch (error) {
    logger.error('Failed to fetch repository stats', error);
    res.status(500).json({ error: 'Failed to fetch repository stats' });
  }
};

// Search repositories
export const searchRepositories = async (req: Request, res: Response): Promise<void> => {
  try {
    const { q, sort = 'updated', order = 'desc', page = 1, per_page = 30 } = req.query;

    if (!q || typeof q !== 'string') {
      res.status(400).json({ error: 'Search query is required' });
      return;
    }

    const github = await initializeGitHub();
    const { data } = await github['octokit'].search.repos({
      q: q,
      sort: sort as 'stars' | 'forks' | 'help-wanted-issues' | 'updated',
      order: order as 'desc' | 'asc',
      page: parseInt(page as string, 10),
      per_page: parseInt(per_page as string, 10),
    });

    const repositories = data.items.map((repo) => ({
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
    }));

    res.json({
      repositories,
      totalCount: data.total_count,
      incompleteResults: data.incomplete_results,
      pagination: {
        page: parseInt(page as string, 10),
        per_page: parseInt(per_page as string, 10),
        total: data.total_count,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to search repositories', error);
    res.status(500).json({ error: 'Failed to search repositories' });
  }
};

// Get repository pulls/branches for ForgeFlow analysis
export const getRepositoryPulls = async (req: Request, res: Response): Promise<void> => {
  try {
    const { owner, repo } = req.params;
    const { state = 'open', page = 1, per_page = 30 } = req.query;

    const github = await initializeGitHub();
    const { data } = await github['octokit'].pulls.list({
      owner,
      repo,
      state: state as 'open' | 'closed' | 'all',
      page: parseInt(page as string, 10),
      per_page: parseInt(per_page as string, 10),
      sort: 'updated',
      direction: 'desc',
    });

    const pulls = data.map((pr) => ({
      id: pr.id,
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      draft: pr.draft,
      mergeable: (pr as any).mergeable,
      mergeableState: (pr as any).mergeable_state,
      merged: (pr as any).merged,
      mergedAt: (pr as any).merged_at,
      headBranch: pr.head.ref,
      baseBranch: pr.base.ref,
      author: {
        login: pr.user.login,
        avatarUrl: pr.user.avatar_url,
      },
      assignees:
        pr.assignees?.map((a) => ({
          login: a.login,
          avatarUrl: a.avatar_url,
        })) || [],
      reviewers:
        pr.requested_reviewers?.map((r) => ({
          login: r.login,
          avatarUrl: r.avatar_url,
        })) || [],
      labels: pr.labels.map((label) => ({
        name: label.name,
        color: label.color,
        description: label.description,
      })),
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      url: pr.html_url,
    }));

    res.json({
      pulls,
      repository: { owner, repo },
      pagination: {
        page: parseInt(page as string, 10),
        per_page: parseInt(per_page as string, 10),
        total: pulls.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to fetch repository pulls', error);
    res.status(500).json({ error: 'Failed to fetch repository pulls' });
  }
};

// Get repository branches with commit information
export const getRepositoryBranches = async (req: Request, res: Response): Promise<void> => {
  try {
    const { owner, repo } = req.params;
    const { protected_only = false, page = 1, per_page = 30 } = req.query;

    const github = await initializeGitHub();
    const { data } = await github['octokit'].repos.listBranches({
      owner,
      repo,
      protected: protected_only === 'true',
      page: parseInt(page as string, 10),
      per_page: parseInt(per_page as string, 10),
    });

    const branches = data.map((branch) => ({
      name: branch.name,
      protected: branch.protected,
      commit: {
        sha: branch.commit.sha,
        url: branch.commit.url,
        author: {
          login: (branch.commit as any).commit?.author?.name,
          email: (branch.commit as any).commit?.author?.email,
          date: (branch.commit as any).commit?.author?.date,
        },
        message: (branch.commit as any).commit?.message,
      },
    }));

    res.json({
      branches,
      repository: { owner, repo },
      pagination: {
        page: parseInt(page as string, 10),
        per_page: parseInt(per_page as string, 10),
        total: branches.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to fetch repository branches', error);
    res.status(500).json({ error: 'Failed to fetch repository branches' });
  }
};

// Get repository commit activity and statistics
export const getRepositoryActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const { owner, repo } = req.params;
    const { since, until, per_page = 30 } = req.query;

    const github = await initializeGitHub();

    // Get recent commits
    const commitsParams: any = {
      owner,
      repo,
      per_page: parseInt(per_page as string, 10),
    };

    if (since) commitsParams.since = since;
    if (until) commitsParams.until = until;

    const [commitsData, statsData] = await Promise.all([
      github['octokit'].repos.listCommits(commitsParams),
      github['octokit'].repos.getCommitActivityStats({ owner, repo }),
    ]);

    const commits = commitsData.data.map((commit) => ({
      sha: commit.sha,
      message: commit.commit.message,
      author: {
        login: commit.author?.login,
        avatarUrl: commit.author?.avatar_url,
        name: commit.commit.author?.name,
        email: commit.commit.author?.email,
        date: commit.commit.author?.date,
      },
      stats: {
        additions: commit.stats?.additions || 0,
        deletions: commit.stats?.deletions || 0,
        total: commit.stats?.total || 0,
      },
      url: commit.html_url,
    }));

    const activityStats = statsData.data || [];

    res.json({
      commits,
      activityStats,
      repository: { owner, repo },
      summary: {
        totalCommits: commits.length,
        totalAdditions: commits.reduce((sum, c) => sum + c.stats.additions, 0),
        totalDeletions: commits.reduce((sum, c) => sum + c.stats.deletions, 0),
        uniqueAuthors: [...new Set(commits.map((c) => c.author.login).filter(Boolean))].length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to fetch repository activity', error);
    res.status(500).json({ error: 'Failed to fetch repository activity' });
  }
};

// Create a new issue with ForgeFlow integration
export const createRepositoryIssue = async (req: Request, res: Response): Promise<void> => {
  try {
    const { owner, repo } = req.params;
    const { title, body, labels, assignees, milestone } = req.body;

    if (!title) {
      res.status(400).json({ error: 'Issue title is required' });
      return;
    }

    const github = await initializeGitHub();
    const { data } = await github['octokit'].issues.create({
      owner,
      repo,
      title,
      body: body || '',
      labels: labels || [],
      assignees: assignees || [],
      milestone: milestone ? parseInt(milestone, 10) : undefined,
    });

    const issue = {
      id: data.id,
      number: data.number,
      title: data.title,
      body: data.body,
      state: data.state,
      labels: data.labels.map((label) => (typeof label === 'string' ? label : label.name)),
      assignee: data.assignee?.login,
      assignees: data.assignees?.map((a) => a.login) || [],
      milestone: data.milestone?.title,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      url: data.html_url,
    };

    res.status(201).json({
      issue,
      repository: { owner, repo },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to create repository issue', error);
    res.status(500).json({ error: 'Failed to create repository issue' });
  }
};

// Update an existing issue
export const updateRepositoryIssue = async (req: Request, res: Response): Promise<void> => {
  try {
    const { owner, repo, issue_number } = req.params;
    const { title, body, state, labels, assignees } = req.body;

    const github = await initializeGitHub();
    const { data } = await github['octokit'].issues.update({
      owner,
      repo,
      issue_number: parseInt(issue_number, 10),
      title,
      body,
      state: state as 'open' | 'closed',
      labels,
      assignees,
    });

    const issue = {
      id: data.id,
      number: data.number,
      title: data.title,
      body: data.body,
      state: data.state,
      labels: data.labels.map((label) => (typeof label === 'string' ? label : label.name)),
      assignee: data.assignee?.login,
      assignees: data.assignees?.map((a) => a.login) || [],
      milestone: data.milestone?.title,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      url: data.html_url,
    };

    res.json({
      issue,
      repository: { owner, repo },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to update repository issue', error);
    res.status(500).json({ error: 'Failed to update repository issue' });
  }
};

// Get repository insights and analytics
export const getRepositoryInsights = async (req: Request, res: Response): Promise<void> => {
  try {
    const { owner, repo } = req.params;
    const github = await initializeGitHub();

    // Parallel API calls for comprehensive insights
    const [repoData, tagsData, releasesData, codeFrequencyData] = await Promise.all([
      github['octokit'].repos.get({ owner, repo }),
      github['octokit'].repos.listTags({ owner, repo, per_page: 10 }),
      github['octokit'].repos.listReleases({ owner, repo, per_page: 10 }),
      github['octokit'].repos.getCodeFrequencyStats({ owner, repo }).catch(() => ({ data: [] })),
    ]);

    const insights = {
      repository: {
        name: repoData.data.name,
        fullName: repoData.data.full_name,
        description: repoData.data.description,
        topics: repoData.data.topics || [],
        language: repoData.data.language,
        size: repoData.data.size,
        stars: repoData.data.stargazers_count,
        watchers: repoData.data.watchers_count,
        forks: repoData.data.forks_count,
        issues: repoData.data.open_issues_count,
        hasWiki: repoData.data.has_wiki,
        hasProjects: repoData.data.has_projects,
        hasDiscussions: repoData.data.has_discussions,
        isArchived: repoData.data.archived,
        visibility: repoData.data.private ? 'private' : 'public',
        defaultBranch: repoData.data.default_branch,
        createdAt: repoData.data.created_at,
        updatedAt: repoData.data.updated_at,
        pushedAt: repoData.data.pushed_at,
      },
      tags: tagsData.data.map((tag) => ({
        name: tag.name,
        commit: {
          sha: tag.commit.sha,
          url: tag.commit.url,
        },
      })),
      releases: releasesData.data.map((release) => ({
        id: release.id,
        name: release.name,
        tagName: release.tag_name,
        draft: release.draft,
        prerelease: release.prerelease,
        publishedAt: release.published_at,
        author: {
          login: release.author.login,
          avatarUrl: release.author.avatar_url,
        },
        assets: release.assets.length,
        downloadCount: release.assets.reduce((sum, asset) => sum + asset.download_count, 0),
      })),
      codeFrequency: codeFrequencyData.data || [],
      forgeflowCompatible: {
        hasIssues: repoData.data.has_issues,
        hasProjects: repoData.data.has_projects,
        defaultBranch: repoData.data.default_branch,
        allowsForking: !repoData.data.private,
        topics: repoData.data.topics || [],
      },
    };

    res.json({
      insights,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to fetch repository insights', error);
    res.status(500).json({ error: 'Failed to fetch repository insights' });
  }
};

// Archive a repository (makes it read-only)
export const archiveRepository = async (req: Request, res: Response): Promise<void> => {
  try {
    const { owner, repo } = req.params;
    const github = await initializeGitHub();

    // Archive the repository
    const { data } = await github['octokit'].repos.update({
      owner,
      repo,
      archived: true,
    });

    logger.info(`Repository archived successfully: ${owner}/${repo}`);

    res.json({
      success: true,
      repository: {
        id: data.id,
        name: data.name,
        fullName: data.full_name,
        archived: data.archived,
        archivedAt: new Date().toISOString(),
      },
      message: 'Repository has been archived and is now read-only',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to archive repository', error);
    res.status(500).json({
      error: 'Failed to archive repository',
      details: (error as Error).message,
    });
  }
};

// Unarchive a repository (makes it writable again)
export const unarchiveRepository = async (req: Request, res: Response): Promise<void> => {
  try {
    const { owner, repo } = req.params;
    const github = await initializeGitHub();

    // Unarchive the repository
    const { data } = await github['octokit'].repos.update({
      owner,
      repo,
      archived: false,
    });

    logger.info(`Repository unarchived successfully: ${owner}/${repo}`);

    res.json({
      success: true,
      repository: {
        id: data.id,
        name: data.name,
        fullName: data.full_name,
        archived: data.archived,
        unarchivedAt: new Date().toISOString(),
      },
      message: 'Repository has been unarchived and is now writable',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to unarchive repository', error);
    res.status(500).json({
      error: 'Failed to unarchive repository',
      details: (error as Error).message,
    });
  }
};

// Delete a repository (DANGEROUS - permanent action)
export const deleteRepository = async (req: Request, res: Response): Promise<void> => {
  try {
    const { owner, repo } = req.params;
    const { confirmDelete } = req.body;

    // Safety check - require explicit confirmation
    if (confirmDelete !== `${owner}/${repo}`) {
      res.status(400).json({
        error: 'Delete confirmation failed',
        message: `To delete this repository, you must provide confirmDelete: "${owner}/${repo}"`,
        required: `${owner}/${repo}`,
        provided: confirmDelete,
      });
      return;
    }

    const github = await initializeGitHub();

    // Get repository info before deletion for logging
    const { data: repoData } = await github['octokit'].repos.get({ owner, repo });

    // Delete the repository
    await github['octokit'].repos.delete({
      owner,
      repo,
    });

    logger.warn(`Repository deleted permanently: ${owner}/${repo}`, {
      repositoryId: repoData.id,
      stars: repoData.stargazers_count,
      forks: repoData.forks_count,
      size: repoData.size,
    });

    res.json({
      success: true,
      repository: {
        id: repoData.id,
        name: repoData.name,
        fullName: repoData.full_name,
        deletedAt: new Date().toISOString(),
      },
      message: 'Repository has been permanently deleted',
      warning: 'This action cannot be undone',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to delete repository', error);
    res.status(500).json({
      error: 'Failed to delete repository',
      details: (error as Error).message,
    });
  }
};

// Get repository management options and recommendations
export const getRepositoryManagementOptions = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { owner, repo } = req.params;
    const github = await initializeGitHub();

    const { data } = await github['octokit'].repos.get({ owner, repo });

    // Calculate activity score and recommendations
    const lastPushDate = new Date(data.pushed_at || data.updated_at);
    const daysSinceLastPush = Math.floor(
      (Date.now() - lastPushDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    const isStale = daysSinceLastPush > 180; // 6 months
    const isVeryStale = daysSinceLastPush > 365; // 1 year
    const hasActivity =
      data.stargazers_count > 0 || data.forks_count > 0 || data.open_issues_count > 0;

    let recommendation = 'keep';
    let reason = 'Repository appears to be active or valuable';

    if (data.archived) {
      recommendation = 'already-archived';
      reason = 'Repository is already archived';
    } else if (isVeryStale && !hasActivity) {
      recommendation = 'delete';
      reason = `No activity for ${Math.floor(daysSinceLastPush / 30)} months and no community engagement`;
    } else if (isStale && !hasActivity) {
      recommendation = 'archive';
      reason = `Stale repository (${Math.floor(daysSinceLastPush / 30)} months since last push) with minimal engagement`;
    } else if (data.size === 0 && daysSinceLastPush > 30) {
      recommendation = 'delete';
      reason = 'Empty repository with no recent activity';
    }

    const options = {
      repository: {
        id: data.id,
        name: data.name,
        fullName: data.full_name,
        size: data.size,
        stars: data.stargazers_count,
        forks: data.forks_count,
        issues: data.open_issues_count,
        archived: data.archived,
        private: data.private,
        lastPush: data.pushed_at,
        daysSinceLastPush,
      },
      analysis: {
        isStale,
        isVeryStale,
        hasActivity,
        isEmpty: data.size === 0,
        activityScore: Math.max(0, 100 - daysSinceLastPush / 3.65), // 0-100 scale
      },
      recommendation: {
        action: recommendation,
        reason,
        confidence:
          recommendation === 'delete' ? 'high' : recommendation === 'archive' ? 'medium' : 'low',
      },
      availableActions: data.archived ? ['unarchive'] : ['archive', 'delete'],
      warnings: {
        delete: 'Deletion is permanent and cannot be undone',
        archive: 'Archived repositories become read-only',
        hasStars: data.stargazers_count > 0,
        hasForks: data.forks_count > 0,
        hasIssues: data.open_issues_count > 0,
      },
    };

    res.json({
      options,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get repository management options', error);
    res.status(500).json({
      error: 'Failed to get repository management options',
      details: (error as Error).message,
    });
  }
};
