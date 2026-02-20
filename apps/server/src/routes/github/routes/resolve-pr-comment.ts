/**
 * POST /resolve-pr-comment endpoint - Resolve or unresolve a GitHub PR review thread
 *
 * Uses the GitHub GraphQL API to resolve or unresolve a review thread
 * identified by its GraphQL node ID (threadId).
 */

import { spawn } from 'child_process';
import type { Request, Response } from 'express';
import { execEnv, getErrorMessage, logError } from './common.js';
import { checkGitHubRemote } from './check-github-remote.js';

export interface ResolvePRCommentResult {
  success: boolean;
  isResolved?: boolean;
  error?: string;
}

interface ResolvePRCommentRequest {
  projectPath: string;
  threadId: string;
  resolve: boolean;
}

/** Timeout for GitHub GraphQL API requests in milliseconds */
const GITHUB_API_TIMEOUT_MS = 30000;

interface GraphQLMutationResponse {
  data?: {
    resolveReviewThread?: {
      thread?: { isResolved: boolean; id: string } | null;
    } | null;
    unresolveReviewThread?: {
      thread?: { isResolved: boolean; id: string } | null;
    } | null;
  };
  errors?: Array<{ message: string }>;
}

/**
 * Execute a GraphQL mutation to resolve or unresolve a review thread.
 */
async function executeReviewThreadMutation(
  projectPath: string,
  threadId: string,
  resolve: boolean
): Promise<{ isResolved: boolean }> {
  const mutationName = resolve ? 'resolveReviewThread' : 'unresolveReviewThread';

  const mutation = `
    mutation ${resolve ? 'ResolveThread' : 'UnresolveThread'}($threadId: ID!) {
      ${mutationName}(input: { threadId: $threadId }) {
        thread {
          id
          isResolved
        }
      }
    }`;

  const variables = { threadId };
  const requestBody = JSON.stringify({ query: mutation, variables });

  const response = await new Promise<GraphQLMutationResponse>((res, rej) => {
    const gh = spawn('gh', ['api', 'graphql', '--input', '-'], {
      cwd: projectPath,
      env: execEnv,
    });

    const timeoutId = setTimeout(() => {
      gh.kill();
      rej(new Error('GitHub GraphQL API request timed out'));
    }, GITHUB_API_TIMEOUT_MS);

    let stdout = '';
    let stderr = '';
    gh.stdout.on('data', (data: Buffer) => (stdout += data.toString()));
    gh.stderr.on('data', (data: Buffer) => (stderr += data.toString()));

    gh.on('close', (code) => {
      clearTimeout(timeoutId);
      if (code !== 0) {
        return rej(new Error(`gh process exited with code ${code}: ${stderr}`));
      }
      try {
        res(JSON.parse(stdout));
      } catch (e) {
        rej(e);
      }
    });

    gh.stdin.write(requestBody);
    gh.stdin.end();
  });

  if (response.errors && response.errors.length > 0) {
    throw new Error(response.errors[0].message);
  }

  const threadData = resolve
    ? response.data?.resolveReviewThread?.thread
    : response.data?.unresolveReviewThread?.thread;

  if (!threadData) {
    throw new Error('No thread data returned from GitHub API');
  }

  return { isResolved: threadData.isResolved };
}

export function createResolvePRCommentHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, threadId, resolve } = req.body as ResolvePRCommentRequest;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!threadId) {
        res.status(400).json({ success: false, error: 'threadId is required' });
        return;
      }

      if (typeof resolve !== 'boolean') {
        res.status(400).json({ success: false, error: 'resolve must be a boolean' });
        return;
      }

      // Check if this is a GitHub repo
      const remoteStatus = await checkGitHubRemote(projectPath);
      if (!remoteStatus.hasGitHubRemote) {
        res.status(400).json({
          success: false,
          error: 'Project does not have a GitHub remote',
        });
        return;
      }

      const result = await executeReviewThreadMutation(projectPath, threadId, resolve);

      res.json({
        success: true,
        isResolved: result.isResolved,
      });
    } catch (error) {
      logError(error, 'Resolve PR comment failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
