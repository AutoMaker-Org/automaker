/**
 * POST /issue-comments endpoint - Fetch comments for a GitHub issue
 */

import { spawn } from 'child_process';
import type { Request, Response } from 'express';
import type { GitHubComment, IssueCommentsResult } from '@automaker/types';
import { execEnv, getErrorMessage, logError } from './common.js';
import { checkGitHubRemote } from './check-github-remote.js';

interface ListCommentsRequest {
  projectPath: string;
  issueNumber: number;
  cursor?: string;
}

interface GraphQLComment {
  id: string;
  author: {
    login: string;
    avatarUrl?: string;
  } | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

interface GraphQLResponse {
  data?: {
    repository?: {
      issue?: {
        comments: {
          totalCount: number;
          pageInfo: {
            hasNextPage: boolean;
            endCursor: string | null;
          };
          nodes: GraphQLComment[];
        };
      };
    };
  };
  errors?: Array<{ message: string }>;
}

/** Timeout for GitHub API requests in milliseconds */
const GITHUB_API_TIMEOUT_MS = 30000;

/**
 * Validate cursor format (GraphQL cursors are typically base64 strings)
 */
function isValidCursor(cursor: string): boolean {
  return /^[A-Za-z0-9+/=]+$/.test(cursor);
}

/**
 * Fetch comments for a specific issue using GitHub GraphQL API
 */
async function fetchIssueComments(
  projectPath: string,
  owner: string,
  repo: string,
  issueNumber: number,
  cursor?: string
): Promise<IssueCommentsResult> {
  // Validate cursor format to prevent potential injection
  if (cursor && !isValidCursor(cursor)) {
    throw new Error('Invalid cursor format');
  }

  // Use GraphQL variables instead of string interpolation for safety
  const query = `
    query GetIssueComments($owner: String!, $repo: String!, $issueNumber: Int!, $cursor: String) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issueNumber) {
          comments(first: 50, after: $cursor) {
            totalCount
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              author {
                login
                avatarUrl
              }
              body
              createdAt
              updatedAt
            }
          }
        }
      }
    }`;

  const variables = {
    owner,
    repo,
    issueNumber,
    cursor: cursor || null,
  };

  const requestBody = JSON.stringify({ query, variables });

  const response = await new Promise<GraphQLResponse>((resolve, reject) => {
    const gh = spawn('gh', ['api', 'graphql', '--input', '-'], {
      cwd: projectPath,
      env: execEnv,
    });

    // Add timeout to prevent hanging indefinitely
    const timeoutId = setTimeout(() => {
      gh.kill();
      reject(new Error('GitHub API request timed out'));
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

  const commentsData = response.data?.repository?.issue?.comments;

  if (!commentsData) {
    throw new Error('Issue not found or no comments data available');
  }

  const comments: GitHubComment[] = commentsData.nodes.map((node) => ({
    id: node.id,
    author: {
      login: node.author?.login || 'ghost',
      avatarUrl: node.author?.avatarUrl,
    },
    body: node.body,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  }));

  return {
    comments,
    totalCount: commentsData.totalCount,
    hasNextPage: commentsData.pageInfo.hasNextPage,
    endCursor: commentsData.pageInfo.endCursor || undefined,
  };
}

export function createListCommentsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, issueNumber, cursor } = req.body as ListCommentsRequest;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!issueNumber || typeof issueNumber !== 'number') {
        res
          .status(400)
          .json({ success: false, error: 'issueNumber is required and must be a number' });
        return;
      }

      // First check if this is a GitHub repo and get owner/repo
      const remoteStatus = await checkGitHubRemote(projectPath);
      if (!remoteStatus.hasGitHubRemote || !remoteStatus.owner || !remoteStatus.repo) {
        res.status(400).json({
          success: false,
          error: 'Project does not have a GitHub remote',
        });
        return;
      }

      const result = await fetchIssueComments(
        projectPath,
        remoteStatus.owner,
        remoteStatus.repo,
        issueNumber,
        cursor
      );

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      logError(error, `Fetch comments for issue failed`);
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
