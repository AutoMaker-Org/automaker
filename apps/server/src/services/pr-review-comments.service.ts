/**
 * PR Review Comments Service
 *
 * Domain logic for fetching PR review comments, enriching them with
 * resolved-thread status, and sorting. Extracted from the route handler
 * so the route only deals with request/response plumbing.
 */

import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@automaker/utils';
import { execEnv, logError } from '../lib/exec-utils.js';

const execFileAsync = promisify(execFile);

// ── Public types (re-exported for callers) ──

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

// ── Internal types ──

/** Timeout for GitHub GraphQL API requests in milliseconds */
const GITHUB_API_TIMEOUT_MS = 30000;

interface GraphQLReviewThreadComment {
  databaseId: number;
}

interface GraphQLReviewThread {
  id: string;
  isResolved: boolean;
  comments: {
    pageInfo?: {
      hasNextPage: boolean;
    };
    nodes: GraphQLReviewThreadComment[];
  };
}

interface GraphQLResponse {
  data?: {
    repository?: {
      pullRequest?: {
        reviewThreads?: {
          nodes: GraphQLReviewThread[];
          pageInfo?: {
            hasNextPage: boolean;
          };
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

// ── Logger ──

const logger = createLogger('PRReviewCommentsService');

// ── Service functions ──

/**
 * Fetch review thread resolved status and thread IDs using GitHub GraphQL API.
 * Returns a map of comment ID (string) -> { isResolved, threadId }.
 */
export async function fetchReviewThreadResolvedStatus(
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
            pageInfo {
              hasNextPage
            }
            nodes {
              id
              isResolved
              comments(first: 100) {
                pageInfo {
                  hasNextPage
                }
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
    let timeoutId: NodeJS.Timeout | undefined;

    const response = await new Promise<GraphQLResponse>((resolve, reject) => {
      const gh = spawn('gh', ['api', 'graphql', '--input', '-'], {
        cwd: projectPath,
        env: execEnv,
      });

      gh.on('error', (err) => {
        clearTimeout(timeoutId);
        reject(err);
      });

      timeoutId = setTimeout(() => {
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

    // Check if reviewThreads data was truncated (more than 100 threads)
    const pageInfo = response.data?.repository?.pullRequest?.reviewThreads?.pageInfo;
    if (pageInfo?.hasNextPage) {
      logger.warn(
        `PR #${prNumber} in ${owner}/${repo} has more than 100 review threads — ` +
          'results are truncated. Some comments may be missing resolved status.'
      );
      // TODO: Implement cursor-based pagination by iterating with
      // reviewThreads.nodes pageInfo.endCursor across spawn calls.
    }

    const threads = response.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [];
    for (const thread of threads) {
      if (thread.comments.pageInfo?.hasNextPage) {
        logger.warn(
          `Review thread ${thread.id} in PR #${prNumber} has more than 100 comments — ` +
            'comment list is truncated. Some comments may be missing resolved status.'
        );
      }
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
export async function fetchPRReviewComments(
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
    const { stdout: commentsOutput } = await execFileAsync(
      'gh',
      ['pr', 'view', String(prNumber), '-R', `${owner}/${repo}`, '--json', 'comments'],
      {
        cwd: projectPath,
        env: execEnv,
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer for large PRs
        timeout: GITHUB_API_TIMEOUT_MS,
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
    const { stdout: reviewsOutput } = await execFileAsync(
      'gh',
      ['api', reviewsEndpoint, '--paginate', '--slurp', '--jq', 'add // []'],
      {
        cwd: projectPath,
        env: execEnv,
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer for large PRs
        timeout: GITHUB_API_TIMEOUT_MS,
      }
    );

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
        line: c.line ?? c.original_line,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        isReviewComment: true,
        // A review comment is "outdated" if position is null (code has changed)
        isOutdated: c.position === null,
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
  for (const comment of allComments) {
    if (comment.isReviewComment && resolvedMap.has(comment.id)) {
      const info = resolvedMap.get(comment.id)!;
      comment.isResolved = info.isResolved;
      comment.threadId = info.threadId;
    }
  }

  // Sort by createdAt descending (newest first)
  allComments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return allComments;
}
