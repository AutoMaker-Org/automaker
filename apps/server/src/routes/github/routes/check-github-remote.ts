/**
 * POST /check-remote endpoint - Check if project has a supported git forge remote (GitHub or Gitea)
 */

import type { Request, Response } from 'express';
import type { ForgeType } from '@automaker/types';
import { execAsync, execEnv, getErrorMessage, logError } from './common.js';
import { detectForgeCached } from '../../../lib/forge-detector.js';

const GIT_REMOTE_ORIGIN_COMMAND = 'git remote get-url origin';
const GH_REPO_VIEW_COMMAND = 'gh repo view --json name,owner';
const GITHUB_REPO_URL_PREFIX = 'https://github.com/';
const GITHUB_HTTPS_REMOTE_REGEX = /https:\/\/github\.com\/([^/]+)\/([^/.]+)/;
const GITHUB_SSH_REMOTE_REGEX = /git@github\.com:([^/]+)\/([^/.]+)/;

interface GhRepoViewResponse {
  name?: string;
  owner?: {
    login?: string;
  };
}

async function resolveRepoFromGh(projectPath: string): Promise<{
  owner: string;
  repo: string;
} | null> {
  try {
    const { stdout } = await execAsync(GH_REPO_VIEW_COMMAND, {
      cwd: projectPath,
      env: execEnv,
    });

    const data = JSON.parse(stdout) as GhRepoViewResponse;
    const owner = typeof data.owner?.login === 'string' ? data.owner.login : null;
    const repo = typeof data.name === 'string' ? data.name : null;

    if (!owner || !repo) {
      return null;
    }

    return { owner, repo };
  } catch {
    return null;
  }
}

export interface GitHubRemoteStatus {
  hasGitHubRemote: boolean;
  remoteUrl: string | null;
  owner: string | null;
  repo: string | null;
  /** Whether any supported forge remote was detected */
  hasRemote?: boolean;
  /** Detected forge type */
  forgeType?: ForgeType;
  /** Base URL of the forge (e.g., 'https://github.com' or 'https://gitea.example.com') */
  baseUrl?: string | null;
}

export async function checkGitHubRemote(projectPath: string): Promise<GitHubRemoteStatus> {
  const status: GitHubRemoteStatus = {
    hasGitHubRemote: false,
    remoteUrl: null,
    owner: null,
    repo: null,
    hasRemote: false,
    forgeType: 'unknown',
    baseUrl: null,
  };

  try {
    // Use forge detector for comprehensive detection (includes Gitea)
    const forgeInfo = await detectForgeCached(projectPath);

    status.remoteUrl = forgeInfo.remoteUrl;
    status.owner = forgeInfo.owner;
    status.repo = forgeInfo.repo;
    status.forgeType = forgeInfo.type;
    status.baseUrl = forgeInfo.baseUrl;

    if (forgeInfo.type === 'github') {
      status.hasGitHubRemote = true;
      status.hasRemote = true;

      // Try to resolve owner/repo from gh CLI for more accuracy
      const ghRepo = await resolveRepoFromGh(projectPath);
      if (ghRepo) {
        status.owner = ghRepo.owner;
        status.repo = ghRepo.repo;
        if (!status.remoteUrl) {
          status.remoteUrl = `${GITHUB_REPO_URL_PREFIX}${ghRepo.owner}/${ghRepo.repo}`;
        }
      }
    } else if (forgeInfo.type === 'gitea') {
      status.hasRemote = true;
    }
  } catch {
    // No remote or not a git repo - that's okay
  }

  return status;
}

export function createCheckGitHubRemoteHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const status = await checkGitHubRemote(projectPath);
      res.json({
        success: true,
        ...status,
      });
    } catch (error) {
      logError(error, 'Check forge remote failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
