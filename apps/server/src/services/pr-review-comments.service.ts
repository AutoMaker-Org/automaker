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
  /** Whether the comment author is a bot/app account */
  isBot?: boolean;
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

/** Maximum number of pagination pages to prevent infinite loops */
const MAX_PAGINATION_PAGES = 20;

interface GraphQLReviewThreadComment {
  databaseId: number;
}

interface GraphQLReviewThread {
  id: string;
  isResolved: boolean;
  comments: {
    pageInfo?: {
      hasNextPage: boolean;
      endCursor?: string | null;
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
            endCursor?: string | null;
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
 * Execute a GraphQL query via the `gh` CLI and return the parsed response.
 */
async function executeGraphQL(projectPath: string, requestBody: string): Promise<GraphQLResponse> {
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

    gh.stdin.on('error', () => {
      // Ignore stdin errors (e.g. when the child process is killed)
    });
    gh.stdin.write(requestBody);
    gh.stdin.end();
  });

  if (response.errors && response.errors.length > 0) {
    throw new Error(response.errors[0].message);
  }

  return response;
}

/**
 * Fetch review thread resolved status and thread IDs using GitHub GraphQL API.
 * Uses cursor-based pagination to handle PRs with more than 100 review threads.
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
      $cursor: String
    ) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $prNumber) {
          reviewThreads(first: 100, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              isResolved
              comments(first: 100) {
                pageInfo {
                  hasNextPage
                  endCursor
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

  try {
    let cursor: string | null = null;
    let pageCount = 0;

    do {
      const variables = { owner, repo, prNumber, cursor };
      const requestBody = JSON.stringify({ query, variables });
      const response = await executeGraphQL(projectPath, requestBody);

      const reviewThreads = response.data?.repository?.pullRequest?.reviewThreads;
      const threads = reviewThreads?.nodes ?? [];

      for (const thread of threads) {
        if (thread.comments.pageInfo?.hasNextPage) {
          logger.debug(
            `Review thread ${thread.id} in PR #${prNumber} has >100 comments — ` +
              'some comments may be missing resolved status'
          );
        }
        const info: ReviewThreadInfo = { isResolved: thread.isResolved, threadId: thread.id };
        for (const comment of thread.comments.nodes) {
          resolvedMap.set(String(comment.databaseId), info);
        }
      }

      const pageInfo = reviewThreads?.pageInfo;
      if (pageInfo?.hasNextPage && pageInfo.endCursor) {
        cursor = pageInfo.endCursor;
        pageCount++;
        logger.debug(
          `Fetching next page of review threads for PR #${prNumber} (page ${pageCount + 1})`
        );
      } else {
        cursor = null;
      }
    } while (cursor && pageCount < MAX_PAGINATION_PAGES);

    if (pageCount >= MAX_PAGINATION_PAGES) {
      logger.warn(
        `PR #${prNumber} in ${owner}/${repo} has more than ${MAX_PAGINATION_PAGES * 100} review threads — ` +
          'pagination limit reached. Some comments may be missing resolved status.'
      );
    }
  } catch (error) {
    // Log but don't fail — resolved status is best-effort
    logError(error, 'Failed to fetch PR review thread resolved status');
  }

  return resolvedMap;
}

/**
 * Fetch all comments for a PR (regular, inline review, and review body comments)
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
  // Uses the REST API issues endpoint instead of `gh pr view --json comments`
  // because the latter uses GraphQL internally where bot/app authors can return
  // null, causing bot comments to be silently dropped or display as "unknown".
  try {
    const issueCommentsEndpoint = `repos/${owner}/${repo}/issues/${prNumber}/comments`;
    const { stdout: commentsOutput } = await execFileAsync(
      'gh',
      ['api', issueCommentsEndpoint, '--paginate'],
      {
        cwd: projectPath,
        env: execEnv,
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer for large PRs
        timeout: GITHUB_API_TIMEOUT_MS,
      }
    );

    const commentsData = JSON.parse(commentsOutput);
    const regularComments = (Array.isArray(commentsData) ? commentsData : []).map(
      (c: {
        id: number;
        user: { login: string; avatar_url?: string; type?: string } | null;
        body: string;
        created_at: string;
        updated_at?: string;
        performed_via_github_app?: { slug: string } | null;
      }) => ({
        id: String(c.id),
        author: c.user?.login || c.performed_via_github_app?.slug || 'unknown',
        avatarUrl: c.user?.avatar_url,
        body: c.body,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        isReviewComment: false,
        isOutdated: false,
        isBot: c.user?.type === 'Bot' || !!c.performed_via_github_app,
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
      ['api', reviewsEndpoint, '--paginate'],
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
        user: { login: string; avatar_url?: string; type?: string } | null;
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
        performed_via_github_app?: { slug: string } | null;
      }) => ({
        id: String(c.id),
        author: c.user?.login || c.performed_via_github_app?.slug || 'unknown',
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
        isBot: c.user?.type === 'Bot' || !!c.performed_via_github_app,
        diffHunk: c.diff_hunk,
        side: c.side,
        commitId: c.commit_id,
      })
    );

    allComments.push(...reviewComments);
  } catch (error) {
    logError(error, 'Failed to fetch inline review comments');
  }

  // 3. Fetch review body comments (summary text submitted with each review)
  // These are the top-level comments written when submitting a review
  // (Approve, Request Changes, Comment). They are separate from inline code comments
  // and issue-level comments. Only include reviews that have a non-empty body.
  try {
    const reviewsEndpoint = `repos/${owner}/${repo}/pulls/${prNumber}/reviews`;
    const { stdout: reviewBodiesOutput } = await execFileAsync(
      'gh',
      ['api', reviewsEndpoint, '--paginate'],
      {
        cwd: projectPath,
        env: execEnv,
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer for large PRs
        timeout: GITHUB_API_TIMEOUT_MS,
      }
    );

    const reviewBodiesData = JSON.parse(reviewBodiesOutput);
    const reviewBodyComments = (Array.isArray(reviewBodiesData) ? reviewBodiesData : [])
      .filter(
        (r: { body?: string; state?: string }) =>
          r.body && r.body.trim().length > 0 && r.state !== 'PENDING'
      )
      .map(
        (r: {
          id: number;
          user: { login: string; avatar_url?: string; type?: string } | null;
          body: string;
          state: string;
          submitted_at: string;
          performed_via_github_app?: { slug: string } | null;
        }) => ({
          id: `review-${r.id}`,
          author: r.user?.login || r.performed_via_github_app?.slug || 'unknown',
          avatarUrl: r.user?.avatar_url,
          body: r.body,
          createdAt: r.submitted_at,
          isReviewComment: false,
          isOutdated: false,
          isResolved: false,
          isBot: r.user?.type === 'Bot' || !!r.performed_via_github_app,
        })
      );

    allComments.push(...reviewBodyComments);
  } catch (error) {
    logError(error, 'Failed to fetch review body comments');
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
