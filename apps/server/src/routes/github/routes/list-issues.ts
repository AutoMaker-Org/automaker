/**
 * POST /list-issues endpoint - List GitHub issues for a project
 */

import { spawn } from 'child_process';
import type { Request, Response } from 'express';
import { execAsync, execEnv, getErrorMessage, logError } from './common.js';
import { checkGitHubRemote } from './check-github-remote.js';

export interface GitHubLabel {
  name: string;
  color: string;
}

export interface GitHubAuthor {
  login: string;
  avatarUrl?: string;
}

export interface GitHubAssignee {
  login: string;
  avatarUrl?: string;
}

export interface LinkedPullRequest {
  number: number;
  title: string;
  state: string;
  url: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  author: GitHubAuthor;
  createdAt: string;
  labels: GitHubLabel[];
  url: string;
  body: string;
  assignees: GitHubAssignee[];
  linkedPRs?: LinkedPullRequest[];
}

export interface ListIssuesResult {
  success: boolean;
  openIssues?: GitHubIssue[];
  closedIssues?: GitHubIssue[];
  error?: string;
}

/**
 * Fetch linked PRs for a list of issues using GitHub GraphQL API
 */
async function fetchLinkedPRs(
  projectPath: string,
  owner: string,
  repo: string,
  issueNumbers: number[]
): Promise<Map<number, LinkedPullRequest[]>> {
  const linkedPRsMap = new Map<number, LinkedPullRequest[]>();

  if (issueNumbers.length === 0) {
    return linkedPRsMap;
  }

  // Build GraphQL query for batch fetching linked PRs
  // We fetch up to 20 issues at a time to avoid query limits
  const batchSize = 20;
  for (let i = 0; i < issueNumbers.length; i += batchSize) {
    const batch = issueNumbers.slice(i, i + batchSize);

    const issueQueries = batch
      .map(
        (num, idx) => `
        issue${idx}: issue(number: ${num}) {
          number
          timelineItems(first: 10, itemTypes: [CROSS_REFERENCED_EVENT, CONNECTED_EVENT]) {
            nodes {
              ... on CrossReferencedEvent {
                source {
                  ... on PullRequest {
                    number
                    title
                    state
                    url
                  }
                }
              }
              ... on ConnectedEvent {
                subject {
                  ... on PullRequest {
                    number
                    title
                    state
                    url
                  }
                }
              }
            }
          }
        }`
      )
      .join('\n');

    const query = `{
      repository(owner: "${owner}", name: "${repo}") {
        ${issueQueries}
      }
    }`;

    try {
      // Use spawn with stdin to avoid shell injection vulnerabilities
      // --input - reads the JSON request body from stdin
      const requestBody = JSON.stringify({ query });
      const response = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const gh = spawn('gh', ['api', 'graphql', '--input', '-'], {
          cwd: projectPath,
          env: execEnv,
        });

        let stdout = '';
        let stderr = '';
        gh.stdout.on('data', (data: Buffer) => (stdout += data.toString()));
        gh.stderr.on('data', (data: Buffer) => (stderr += data.toString()));

        gh.on('close', (code) => {
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

      const repoData = (response?.data as Record<string, unknown>)?.repository as Record<
        string,
        unknown
      > | null;

      if (repoData) {
        batch.forEach((issueNum, idx) => {
          const issueData = repoData[`issue${idx}`] as {
            timelineItems?: {
              nodes?: Array<{
                source?: { number?: number; title?: string; state?: string; url?: string };
                subject?: { number?: number; title?: string; state?: string; url?: string };
              }>;
            };
          } | null;
          if (issueData?.timelineItems?.nodes) {
            const linkedPRs: LinkedPullRequest[] = [];
            const seenPRs = new Set<number>();

            for (const node of issueData.timelineItems.nodes) {
              const pr = node?.source || node?.subject;
              if (pr?.number && !seenPRs.has(pr.number)) {
                seenPRs.add(pr.number);
                linkedPRs.push({
                  number: pr.number,
                  title: pr.title || '',
                  state: (pr.state || '').toLowerCase(),
                  url: pr.url || '',
                });
              }
            }

            if (linkedPRs.length > 0) {
              linkedPRsMap.set(issueNum, linkedPRs);
            }
          }
        });
      }
    } catch (error) {
      // If GraphQL fails, continue without linked PRs
      console.warn(
        'Failed to fetch linked PRs via GraphQL:',
        error instanceof Error ? error.message : error
      );
    }
  }

  return linkedPRsMap;
}

export function createListIssuesHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      // First check if this is a GitHub repo
      const remoteStatus = await checkGitHubRemote(projectPath);
      if (!remoteStatus.hasGitHubRemote) {
        res.status(400).json({
          success: false,
          error: 'Project does not have a GitHub remote',
        });
        return;
      }

      // Fetch open and closed issues in parallel (now including assignees)
      const [openResult, closedResult] = await Promise.all([
        execAsync(
          'gh issue list --state open --json number,title,state,author,createdAt,labels,url,body,assignees --limit 100',
          {
            cwd: projectPath,
            env: execEnv,
          }
        ),
        execAsync(
          'gh issue list --state closed --json number,title,state,author,createdAt,labels,url,body,assignees --limit 50',
          {
            cwd: projectPath,
            env: execEnv,
          }
        ),
      ]);

      const { stdout: openStdout } = openResult;
      const { stdout: closedStdout } = closedResult;

      const openIssues: GitHubIssue[] = JSON.parse(openStdout || '[]');
      const closedIssues: GitHubIssue[] = JSON.parse(closedStdout || '[]');

      // Fetch linked PRs for open issues (more relevant for active work)
      if (remoteStatus.owner && remoteStatus.repo && openIssues.length > 0) {
        const linkedPRsMap = await fetchLinkedPRs(
          projectPath,
          remoteStatus.owner,
          remoteStatus.repo,
          openIssues.map((i) => i.number)
        );

        // Attach linked PRs to issues
        for (const issue of openIssues) {
          const linkedPRs = linkedPRsMap.get(issue.number);
          if (linkedPRs) {
            issue.linkedPRs = linkedPRs;
          }
        }
      }

      res.json({
        success: true,
        openIssues,
        closedIssues,
      });
    } catch (error) {
      logError(error, 'List GitHub issues failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
