/**
 * POST /list-issues endpoint - List issues for a project (GitHub or Gitea)
 */

import { spawn } from 'child_process';
import type { Request, Response } from 'express';
import { execAsync, execEnv, getErrorMessage, logError } from './common.js';
import { checkGitHubRemote } from './check-github-remote.js';
import { detectForgeCached } from '../../../lib/forge-detector.js';
import { GiteaClient } from '../../../lib/gitea-client.js';
import { createLogger } from '@automaker/utils';
import type { SettingsService } from '../../../services/settings-service.js';

const logger = createLogger('ListIssues');
const OPEN_ISSUES_LIMIT = 100;
const CLOSED_ISSUES_LIMIT = 50;
const ISSUE_LIST_FIELDS = 'number,title,state,author,createdAt,labels,url,body,assignees';
const ISSUE_STATE_OPEN = 'open';
const ISSUE_STATE_CLOSED = 'closed';
const GH_ISSUE_LIST_COMMAND = 'gh issue list';
const GH_STATE_FLAG = '--state';
const GH_JSON_FLAG = '--json';
const GH_LIMIT_FLAG = '--limit';
const LINKED_PRS_BATCH_SIZE = 20;
const LINKED_PRS_TIMELINE_ITEMS = 10;

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
  for (let i = 0; i < issueNumbers.length; i += LINKED_PRS_BATCH_SIZE) {
    const batch = issueNumbers.slice(i, i + LINKED_PRS_BATCH_SIZE);

    const issueQueries = batch
      .map(
        (num, idx) => `
        issue${idx}: issueOrPullRequest(number: ${num}) {
          ... on Issue {
            number
            timelineItems(
              first: ${LINKED_PRS_TIMELINE_ITEMS}
              itemTypes: [CROSS_REFERENCED_EVENT, CONNECTED_EVENT]
            ) {
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
          }
          ... on PullRequest {
            number
            timelineItems(
              first: ${LINKED_PRS_TIMELINE_ITEMS}
              itemTypes: [CROSS_REFERENCED_EVENT, CONNECTED_EVENT]
            ) {
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
      logger.warn(
        'Failed to fetch linked PRs via GraphQL:',
        error instanceof Error ? error.message : error
      );
    }
  }

  return linkedPRsMap;
}

export function createListIssuesHandler(settingsService?: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      // Detect forge type
      const forgeInfo = await detectForgeCached(projectPath);

      if (forgeInfo.type === 'gitea') {
        // Gitea path
        if (!forgeInfo.baseUrl || !forgeInfo.owner || !forgeInfo.repo) {
          res.status(400).json({
            success: false,
            error: 'Could not determine Gitea repository details',
          });
          return;
        }

        const client = new GiteaClient({
          baseUrl: forgeInfo.baseUrl,
          owner: forgeInfo.owner,
          repo: forgeInfo.repo,
          settingsService,
        });

        const [openIssues, closedIssues] = await Promise.all([
          client.listIssues('open', OPEN_ISSUES_LIMIT),
          client.listIssues('closed', CLOSED_ISSUES_LIMIT),
        ]);

        res.json({
          success: true,
          openIssues,
          closedIssues,
        });
        return;
      }

      // GitHub path (default)
      const remoteStatus = await checkGitHubRemote(projectPath);
      if (!remoteStatus.hasGitHubRemote) {
        res.status(400).json({
          success: false,
          error: 'Project does not have a supported git remote (GitHub or Gitea)',
        });
        return;
      }

      // Fetch open and closed issues in parallel (now including assignees)
      const repoQualifier =
        remoteStatus.owner && remoteStatus.repo ? `${remoteStatus.owner}/${remoteStatus.repo}` : '';
      const repoFlag = repoQualifier ? `-R ${repoQualifier}` : '';
      const [openResult, closedResult] = await Promise.all([
        execAsync(
          [
            GH_ISSUE_LIST_COMMAND,
            repoFlag,
            `${GH_STATE_FLAG} ${ISSUE_STATE_OPEN}`,
            `${GH_JSON_FLAG} ${ISSUE_LIST_FIELDS}`,
            `${GH_LIMIT_FLAG} ${OPEN_ISSUES_LIMIT}`,
          ]
            .filter(Boolean)
            .join(' '),
          {
            cwd: projectPath,
            env: execEnv,
          }
        ),
        execAsync(
          [
            GH_ISSUE_LIST_COMMAND,
            repoFlag,
            `${GH_STATE_FLAG} ${ISSUE_STATE_CLOSED}`,
            `${GH_JSON_FLAG} ${ISSUE_LIST_FIELDS}`,
            `${GH_LIMIT_FLAG} ${CLOSED_ISSUES_LIMIT}`,
          ]
            .filter(Boolean)
            .join(' '),
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
      logError(error, 'List issues failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
