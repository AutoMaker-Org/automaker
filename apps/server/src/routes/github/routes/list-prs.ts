/**
 * POST /list-prs endpoint - List pull requests for a project (GitHub or Gitea)
 */

import type { Request, Response } from 'express';
import { execAsync, execEnv, getErrorMessage, logError } from './common.js';
import { checkGitHubRemote } from './check-github-remote.js';
import { detectForgeCached } from '../../../lib/forge-detector.js';
import { GiteaClient } from '../../../lib/gitea-client.js';
import type { SettingsService } from '../../../services/settings-service.js';

const OPEN_PRS_LIMIT = 100;
const MERGED_PRS_LIMIT = 50;
const PR_LIST_FIELDS =
  'number,title,state,author,createdAt,labels,url,isDraft,headRefName,reviewDecision,mergeable,body';
const PR_STATE_OPEN = 'open';
const PR_STATE_MERGED = 'merged';
const GH_PR_LIST_COMMAND = 'gh pr list';
const GH_STATE_FLAG = '--state';
const GH_JSON_FLAG = '--json';
const GH_LIMIT_FLAG = '--limit';

export interface GitHubLabel {
  name: string;
  color: string;
}

export interface GitHubAuthor {
  login: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  state: string;
  author: GitHubAuthor;
  createdAt: string;
  labels: GitHubLabel[];
  url: string;
  isDraft: boolean;
  headRefName: string;
  reviewDecision: string | null;
  mergeable: string;
  body: string;
}

export interface ListPRsResult {
  success: boolean;
  openPRs?: GitHubPR[];
  mergedPRs?: GitHubPR[];
  error?: string;
}

export function createListPRsHandler(settingsService?: SettingsService) {
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

        const [openPRs, mergedPRs] = await Promise.all([
          client.listPRs('open', OPEN_PRS_LIMIT),
          client.listPRs('closed', MERGED_PRS_LIMIT),
        ]);

        // Filter merged PRs from closed (Gitea returns all closed, including merged)
        const actualMergedPRs = mergedPRs.filter((pr) => pr.state === 'MERGED');

        res.json({
          success: true,
          openPRs,
          mergedPRs: actualMergedPRs,
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

      const repoQualifier =
        remoteStatus.owner && remoteStatus.repo ? `${remoteStatus.owner}/${remoteStatus.repo}` : '';
      const repoFlag = repoQualifier ? `-R ${repoQualifier}` : '';

      const [openResult, mergedResult] = await Promise.all([
        execAsync(
          [
            GH_PR_LIST_COMMAND,
            repoFlag,
            `${GH_STATE_FLAG} ${PR_STATE_OPEN}`,
            `${GH_JSON_FLAG} ${PR_LIST_FIELDS}`,
            `${GH_LIMIT_FLAG} ${OPEN_PRS_LIMIT}`,
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
            GH_PR_LIST_COMMAND,
            repoFlag,
            `${GH_STATE_FLAG} ${PR_STATE_MERGED}`,
            `${GH_JSON_FLAG} ${PR_LIST_FIELDS}`,
            `${GH_LIMIT_FLAG} ${MERGED_PRS_LIMIT}`,
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
      const { stdout: mergedStdout } = mergedResult;

      const openPRs: GitHubPR[] = JSON.parse(openStdout || '[]');
      const mergedPRs: GitHubPR[] = JSON.parse(mergedStdout || '[]');

      res.json({
        success: true,
        openPRs,
        mergedPRs,
      });
    } catch (error) {
      logError(error, 'List PRs failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
