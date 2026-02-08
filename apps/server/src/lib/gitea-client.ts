/**
 * Gitea REST API v1 Client
 *
 * Provides methods to interact with Gitea instances, mapping responses to the
 * same shape as GitHub types so the UI works unchanged.
 */

import { createLogger } from '@automaker/utils';
import type { SettingsService } from '../services/settings-service.js';
import type {
  GitHubIssue,
  GitHubLabel,
  GitHubAuthor,
  GitHubAssignee,
  LinkedPullRequest,
} from '../routes/github/routes/list-issues.js';
import type { GitHubPR } from '../routes/github/routes/list-prs.js';
import type { PRComment, PRInfo } from '../routes/worktree/routes/pr-info.js';
import type { GitHubComment, IssueCommentsResult } from '@automaker/types';

const logger = createLogger('GiteaClient');

// Gitea API response types (subset of fields we use)
interface GiteaUser {
  id: number;
  login: string;
  full_name?: string;
  avatar_url?: string;
}

interface GiteaLabel {
  id: number;
  name: string;
  color: string;
}

interface GiteaIssue {
  number: number;
  title: string;
  state: string;
  user: GiteaUser;
  created_at: string;
  labels: GiteaLabel[];
  html_url: string;
  body: string;
  assignees: GiteaUser[] | null;
  pull_request?: { merged: boolean } | null;
}

interface GiteaPullRequest {
  number: number;
  title: string;
  state: string;
  user: GiteaUser;
  created_at: string;
  labels: GiteaLabel[];
  html_url: string;
  body: string;
  head: { ref: string; label: string };
  base: { ref: string; label: string };
  draft?: boolean;
  mergeable?: boolean;
  merged?: boolean;
}

interface GiteaComment {
  id: number;
  user: GiteaUser;
  body: string;
  created_at: string;
  updated_at: string;
}

interface GiteaPRReviewComment {
  id: number;
  user: GiteaUser;
  body: string;
  path: string;
  line?: number;
  created_at: string;
}

export interface GiteaClientOptions {
  baseUrl: string;
  owner: string;
  repo: string;
  settingsService?: SettingsService;
}

export class GiteaClient {
  private baseUrl: string;
  private owner: string;
  private repo: string;
  private settingsService?: SettingsService;

  constructor({ baseUrl, owner, repo, settingsService }: GiteaClientOptions) {
    this.baseUrl = baseUrl;
    this.owner = owner;
    this.repo = repo;
    this.settingsService = settingsService;
  }

  /**
   * Resolve Gitea API token from:
   * 1. credentials.json (via settingsService)
   * 2. GITEA_TOKEN environment variable
   */
  private async getToken(): Promise<string | null> {
    // 1. Check credentials.json
    if (this.settingsService) {
      try {
        const credentials = await this.settingsService.getCredentials();
        if (credentials.apiKeys.gitea) {
          return credentials.apiKeys.gitea;
        }
      } catch {
        // Credentials not available
      }
    }

    // 2. Check environment variable
    if (process.env.GITEA_TOKEN) {
      return process.env.GITEA_TOKEN;
    }

    return null;
  }

  /**
   * Make an authenticated request to the Gitea API.
   */
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = await this.getToken();
    const url = `${this.baseUrl}/api/v1${path}`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (token) {
      headers['Authorization'] = `token ${token}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`Gitea API error ${response.status}: ${response.statusText} - ${errorBody}`);
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * List issues for the repository.
   * Filters out pull requests (Gitea returns PRs mixed with issues).
   */
  async listIssues(
    state: 'open' | 'closed',
    limit: number
  ): Promise<GitHubIssue[]> {
    const giteaIssues = await this.request<GiteaIssue[]>(
      `/repos/${this.owner}/${this.repo}/issues?type=issues&state=${state}&limit=${limit}&sort=created&direction=desc`
    );

    return giteaIssues
      .filter((issue) => !issue.pull_request)
      .map((issue) => this.mapIssue(issue));
  }

  /**
   * List pull requests for the repository.
   */
  async listPRs(
    state: 'open' | 'closed',
    limit: number
  ): Promise<GitHubPR[]> {
    const giteaPRs = await this.request<GiteaPullRequest[]>(
      `/repos/${this.owner}/${this.repo}/pulls?state=${state}&limit=${limit}&sort=created&direction=desc`
    );

    return giteaPRs.map((pr) => this.mapPR(pr));
  }

  /**
   * Create a pull request.
   */
  async createPR(
    title: string,
    body: string,
    head: string,
    base: string
  ): Promise<{ number: number; url: string; state: string }> {
    const pr = await this.request<GiteaPullRequest>(
      `/repos/${this.owner}/${this.repo}/pulls`,
      {
        method: 'POST',
        body: JSON.stringify({ title, body, head, base }),
      }
    );

    return {
      number: pr.number,
      url: pr.html_url,
      state: pr.state.toUpperCase(),
    };
  }

  /**
   * Get a PR by branch name (head ref).
   */
  async getPRByBranch(
    branch: string
  ): Promise<{ number: number; url: string; title: string; state: string } | null> {
    const prs = await this.request<GiteaPullRequest[]>(
      `/repos/${this.owner}/${this.repo}/pulls?state=open&limit=50`
    );

    const match = prs.find((pr) => pr.head.ref === branch);
    if (!match) return null;

    return {
      number: match.number,
      url: match.html_url,
      title: match.title,
      state: match.state.toUpperCase(),
    };
  }

  /**
   * Get a specific PR by number.
   */
  async getPR(prNumber: number): Promise<PRInfo | null> {
    try {
      const pr = await this.request<GiteaPullRequest>(
        `/repos/${this.owner}/${this.repo}/pulls/${prNumber}`
      );

      // Get comments
      const [issueComments, reviewComments] = await Promise.all([
        this.listPRIssueComments(prNumber),
        this.listPRReviewComments(prNumber),
      ]);

      return {
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        state: pr.state.toUpperCase(),
        author: pr.user.login,
        body: pr.body || '',
        comments: issueComments,
        reviewComments,
      };
    } catch {
      return null;
    }
  }

  /**
   * List comments on an issue.
   */
  async listIssueComments(issueNumber: number): Promise<IssueCommentsResult> {
    const comments = await this.request<GiteaComment[]>(
      `/repos/${this.owner}/${this.repo}/issues/${issueNumber}/comments`
    );

    return {
      comments: comments.map((c) => this.mapComment(c)),
      totalCount: comments.length,
      hasNextPage: false,
      endCursor: undefined,
    };
  }

  /**
   * List issue-style comments on a PR (not inline review comments).
   */
  private async listPRIssueComments(prNumber: number): Promise<PRComment[]> {
    try {
      const comments = await this.request<GiteaComment[]>(
        `/repos/${this.owner}/${this.repo}/issues/${prNumber}/comments`
      );

      return comments.map((c) => ({
        id: c.id,
        author: c.user.login,
        body: c.body,
        createdAt: c.created_at,
        isReviewComment: false,
      }));
    } catch {
      return [];
    }
  }

  /**
   * List inline review comments on a PR.
   */
  private async listPRReviewComments(prNumber: number): Promise<PRComment[]> {
    try {
      const comments = await this.request<GiteaPRReviewComment[]>(
        `/repos/${this.owner}/${this.repo}/pulls/${prNumber}/comments`
      );

      return comments.map((c) => ({
        id: c.id,
        author: c.user.login,
        body: c.body,
        path: c.path,
        line: c.line,
        createdAt: c.created_at,
        isReviewComment: true,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Map a Gitea issue to the GitHub issue shape.
   */
  private mapIssue(issue: GiteaIssue): GitHubIssue {
    return {
      number: issue.number,
      title: issue.title,
      state: issue.state,
      author: {
        login: issue.user.login,
        avatarUrl: issue.user.avatar_url,
      },
      createdAt: issue.created_at,
      labels: (issue.labels || []).map((l) => ({
        name: l.name,
        color: l.color,
      })),
      url: issue.html_url,
      body: issue.body || '',
      assignees: (issue.assignees || []).map((a) => ({
        login: a.login,
        avatarUrl: a.avatar_url,
      })),
    };
  }

  /**
   * Map a Gitea PR to the GitHub PR shape.
   */
  private mapPR(pr: GiteaPullRequest): GitHubPR {
    return {
      number: pr.number,
      title: pr.title,
      state: pr.merged ? 'MERGED' : pr.state.toUpperCase(),
      author: { login: pr.user.login },
      createdAt: pr.created_at,
      labels: (pr.labels || []).map((l) => ({
        name: l.name,
        color: l.color,
      })),
      url: pr.html_url,
      isDraft: pr.draft || false,
      headRefName: pr.head.ref,
      reviewDecision: null,
      mergeable: pr.mergeable ? 'MERGEABLE' : 'UNKNOWN',
      body: pr.body || '',
    };
  }

  /**
   * Map a Gitea comment to the GitHubComment shape.
   */
  private mapComment(comment: GiteaComment): GitHubComment {
    return {
      id: String(comment.id),
      author: {
        login: comment.user.login,
        avatarUrl: comment.user.avatar_url,
      },
      body: comment.body,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
    };
  }
}
