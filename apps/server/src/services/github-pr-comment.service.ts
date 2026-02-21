/**
 * GitHub PR Comment Service
 *
 * Domain logic for resolving/unresolving PR review threads via the
 * GitHub GraphQL API. Extracted from the route handler so the route
 * only deals with request/response plumbing.
 */

import { spawn } from 'child_process';
import { execEnv } from '../lib/exec-utils.js';

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
export async function executeReviewThreadMutation(
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

  // Declare timeoutId before registering the error handler to avoid TDZ confusion
  let timeoutId: NodeJS.Timeout | undefined;

  const response = await new Promise<GraphQLMutationResponse>((res, rej) => {
    const gh = spawn('gh', ['api', 'graphql', '--input', '-'], {
      cwd: projectPath,
      env: execEnv,
    });

    gh.on('error', (err) => {
      clearTimeout(timeoutId);
      rej(err);
    });

    timeoutId = setTimeout(() => {
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
