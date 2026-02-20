/**
 * POST /pr-review-comments endpoint - Fetch review comments for a GitHub PR
 *
 * Fetches both regular PR comments and inline code review comments
 * for a specific pull request, providing file path and line context.
 */

import { spawn } from 'child_process';
import type { Request, Response } from 'express';
import { execAsync, execEnv, getErrorMessage, logError } from './common.js';
import { checkGitHubRemote } from './check-github-remote.js';

export interface PRReviewComment {
  id: string;
  author: string;
  avatarUrl?: string;
  body: string;
  path?: string;
  line?: number;
  createdAt: string;
  updatedAt?: string;
  isReviewComment: boolean;
  /** Whether this is an outdated review comment (code has changed since) */
  isOutdated?: boolean;
  /** Whether the review thread containing this comment has been resolved */
  isResolved?: boolean;
  /** The GraphQL node ID of the review thread (used for resolve/unresolve mutations) */
  threadId?: string;
  /** The diff hunk context for the comment */
  diffHunk?: string;
  /** The side of the diff (LEFT or RIGHT) */
  side?: string;
  /** The commit ID the comment was made on */
  commitId?: string;
}

export interface ListPRReviewCommentsResult {
  success: boolean;
  comments?: PRReviewComment[];
  totalCount?: number;
  error?: string;
}

interface ListPRReviewCommentsRequest {
  projectPath: string;
  prNumber: number;
}

/** Timeout for GitHub GraphQL API requests in milliseconds */
const GITHUB_API_TIMEOUT_MS = 30000;

interface GraphQLReviewThreadComment {
  databaseId: number;
}

interface GraphQLReviewThread {
  id: string;
  isResolved: boolean;
  comments: {
    nodes: GraphQLReviewThreadComment[];
  };
}

interface GraphQLResponse {
  data?: {
    repository?: {
      pullRequest?: {
        reviewThreads?: {
          nodes: GraphQLReviewThread[];
        };
      } | null;
    };
  };
  errors?: Array<{ message: string }>;
}

interface ReviewThreadInfo {
  isResolved: boolean;
  threadId: string;
}

/**
 * Fetch review thread resolved status and thread IDs using GitHub GraphQL API.
 * Returns a map of comment ID (string) -> { isResolved, threadId }.
 */
async function fetchReviewThreadResolvedStatus(
  projectPath: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<Map<string, ReviewThreadInfo>> {
  const resolvedMap = new Map<string, ReviewThreadInfo>();

  const query = `
    query GetPRReviewThreads(
      $owner: String!
      $repo: String!
      $prNumber: Int!
    ) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $prNumber) {
          reviewThreads(first: 100) {
            nodes {
              id
              isResolved
              comments(first: 100) {
                nodes {
                  databaseId
                }
              }
            }
          }
        }
      }
    }`;

  const variables = { owner, repo, prNumber };
  const requestBody = JSON.stringify({ query, variables });

  try {
    const response = await new Promise<GraphQLResponse>((resolve, reject) => {
      const gh = spawn('gh', ['api', 'graphql', '--input', '-'], {
        cwd: projectPath,
        env: execEnv,
      });

      const timeoutId = setTimeout(() => {
        gh.kill();
        reject(new Error('GitHub GraphQL API request timed out'));
      }, GITHUB_API_TIMEOUT_MS);

      let stdout = '';
      let stderr = '';
      gh.stdout.on('data', (data: Buffer) => (stdout += data.toString()));
      gh.stderr.on('data', (data: Buffer) => (stderr += data.toString()));

      gh.on('close', (code) => {
        clearTimeout(timeoutId);
        if (code !== 0) {
          return reject(new Error(`gh process exited with code ${code}: ${stderr}`));
        }
        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          reject(e);
        }
      });

      gh.stdin.write(requestBody);
      gh.stdin.end();
    });

    if (response.errors && response.errors.length > 0) {
      throw new Error(response.errors[0].message);
    }

    const threads = response.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [];
    for (const thread of threads) {
      const info: ReviewThreadInfo = { isResolved: thread.isResolved, threadId: thread.id };
      for (const comment of thread.comments.nodes) {
        resolvedMap.set(String(comment.databaseId), info);
      }
    }
  } catch (error) {
    // Log but don't fail — resolved status is best-effort
    logError(error, 'Failed to fetch PR review thread resolved status');
  }

  return resolvedMap;
}

/**
 * Fetch all comments for a PR (both regular and inline review comments)
 */
async function fetchPRReviewComments(
  projectPath: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PRReviewComment[]> {
  const allComments: PRReviewComment[] = [];

  // Fetch review thread resolved status in parallel with comment fetching
  const resolvedStatusPromise = fetchReviewThreadResolvedStatus(projectPath, owner, repo, prNumber);

  // 1. Fetch regular PR comments (issue-level comments)
  try {
    const { stdout: commentsOutput } = await execAsync(
      `gh pr view ${prNumber} -R ${owner}/${repo} --json comments`,
      {
        cwd: projectPath,
        env: execEnv,
      }
    );

    const commentsData = JSON.parse(commentsOutput);
    const regularComments = (commentsData.comments || []).map(
      (c: {
        id: string;
        author: { login: string; avatarUrl?: string };
        body: string;
        createdAt: string;
        updatedAt?: string;
      }) => ({
        id: String(c.id),
        author: c.author?.login || 'unknown',
        avatarUrl: c.author?.avatarUrl,
        body: c.body,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        isReviewComment: false,
        isOutdated: false,
        // Regular PR comments are not part of review threads, so not resolvable
        isResolved: false,
      })
    );

    allComments.push(...regularComments);
  } catch (error) {
    logError(error, 'Failed to fetch regular PR comments');
  }

  // 2. Fetch inline review comments (code-level comments with file/line info)
  try {
    const reviewsEndpoint = `repos/${owner}/${repo}/pulls/${prNumber}/comments`;
    const { stdout: reviewsOutput } = await execAsync(`gh api ${reviewsEndpoint} --paginate`, {
      cwd: projectPath,
      env: execEnv,
    });

    const reviewsData = JSON.parse(reviewsOutput);
    const reviewComments = (Array.isArray(reviewsData) ? reviewsData : []).map(
      (c: {
        id: number;
        user: { login: string; avatar_url?: string };
        body: string;
        path: string;
        line?: number;
        original_line?: number;
        created_at: string;
        updated_at?: string;
        diff_hunk?: string;
        side?: string;
        commit_id?: string;
        position?: number | null;
      }) => ({
        id: String(c.id),
        author: c.user?.login || 'unknown',
        avatarUrl: c.user?.avatar_url,
        body: c.body,
        path: c.path,
        line: c.line || c.original_line,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        isReviewComment: true,
        // A review comment is "outdated" if position is null (code has changed)
        isOutdated: c.position === null && !c.line,
        // isResolved will be filled in below from GraphQL data
        isResolved: false,
        diffHunk: c.diff_hunk,
        side: c.side,
        commitId: c.commit_id,
      })
    );

    allComments.push(...reviewComments);
  } catch (error) {
    logError(error, 'Failed to fetch inline review comments');
  }

  // Wait for resolved status and apply to inline review comments
  const resolvedMap = await resolvedStatusPromise;
  if (resolvedMap.size > 0) {
    for (const comment of allComments) {
      if (comment.isReviewComment && resolvedMap.has(comment.id)) {
        const info = resolvedMap.get(comment.id);
        comment.isResolved = info?.isResolved ?? false;
        comment.threadId = info?.threadId;
      }
    }
  }

  // Sort by createdAt descending (newest first)
  allComments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return allComments;
}

export function createListPRReviewCommentsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, prNumber } = req.body as ListPRReviewCommentsRequest;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!prNumber || typeof prNumber !== 'number') {
        res
          .status(400)
          .json({ success: false, error: 'prNumber is required and must be a number' });
        return;
      }

      // Check if this is a GitHub repo and get owner/repo
      const remoteStatus = await checkGitHubRemote(projectPath);
      if (!remoteStatus.hasGitHubRemote || !remoteStatus.owner || !remoteStatus.repo) {
        res.status(400).json({
          success: false,
          error: 'Project does not have a GitHub remote',
        });
        return;
      }

      const comments = await fetchPRReviewComments(
        projectPath,
        remoteStatus.owner,
        remoteStatus.repo,
        prNumber
      );

      res.json({
        success: true,
        comments,
        totalCount: comments.length,
      });
    } catch (error) {
      logError(error, 'Fetch PR review comments failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
