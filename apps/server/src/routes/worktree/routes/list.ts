/**
 * POST /list endpoint - List all git worktrees
 *
 * Returns actual git worktrees from `git worktree list`.
 * Also scans .worktrees/ directory to discover worktrees that may have been
 * created externally or whose git state was corrupted.
 * Does NOT include tracked branches - only real worktrees with separate directories.
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import * as secureFs from '../../../lib/secure-fs.js';
import { isGitRepo } from '@automaker/git-utils';
import { getErrorMessage, logError, normalizePath, execEnv, isGhCliAvailable } from '../common.js';
import {
  readAllWorktreeMetadata,
  updateWorktreePRInfo,
  type WorktreePRInfo,
} from '../../../lib/worktree-metadata.js';
import { createLogger } from '@automaker/utils';
import { validatePRState } from '@automaker/types';
import {
  checkGitHubRemote,
  type GitHubRemoteStatus,
} from '../../github/routes/check-github-remote.js';

const execAsync = promisify(exec);
const logger = createLogger('Worktree');

/**
 * Cache for GitHub remote status per project path.
 * This prevents repeated "no git remotes found" warnings when polling
 * projects that don't have a GitHub remote configured.
 */
interface GitHubRemoteCacheEntry {
  status: GitHubRemoteStatus;
  checkedAt: number;
}

const githubRemoteCache = new Map<string, GitHubRemoteCacheEntry>();
const GITHUB_REMOTE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
  isCurrent: boolean; // Is this the currently checked out branch in main?
  hasWorktree: boolean; // Always true for items in this list
  hasChanges?: boolean;
  changedFilesCount?: number;
  pr?: WorktreePRInfo; // PR info if a PR has been created for this branch
}

async function getCurrentBranch(cwd: string): Promise<string> {
  try {
    const { stdout } = await execAsync('git branch --show-current', { cwd });
    return stdout.trim();
  } catch {
    return '';
  }
}

/**
 * Scan the .worktrees directory to discover worktrees that may exist on disk
 * but are not registered with git (e.g., created externally or corrupted state).
 */
async function scanWorktreesDirectory(
  projectPath: string,
  knownWorktreePaths: Set<string>
): Promise<Array<{ path: string; branch: string }>> {
  const discovered: Array<{ path: string; branch: string }> = [];
  const worktreesDir = path.join(projectPath, '.worktrees');

  try {
    // Check if .worktrees directory exists
    await secureFs.access(worktreesDir);
  } catch {
    // .worktrees directory doesn't exist
    return discovered;
  }

  try {
    const entries = await secureFs.readdir(worktreesDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const worktreePath = path.join(worktreesDir, entry.name);
      const normalizedPath = normalizePath(worktreePath);

      // Skip if already known from git worktree list
      if (knownWorktreePaths.has(normalizedPath)) continue;

      // Check if this is a valid git repository
      const gitPath = path.join(worktreePath, '.git');
      try {
        const gitStat = await secureFs.stat(gitPath);

        // Git worktrees have a .git FILE (not directory) that points to the parent repo
        // Regular repos have a .git DIRECTORY
        if (gitStat.isFile() || gitStat.isDirectory()) {
          // Try to get the branch name
          const branch = await getCurrentBranch(worktreePath);
          if (branch) {
            logger.info(
              `Discovered worktree in .worktrees/ not in git worktree list: ${entry.name} (branch: ${branch})`
            );
            discovered.push({
              path: normalizedPath,
              branch,
            });
          } else {
            // Try to get branch from HEAD if branch --show-current fails (detached HEAD)
            try {
              const { stdout: headRef } = await execAsync('git rev-parse --abbrev-ref HEAD', {
                cwd: worktreePath,
              });
              const headBranch = headRef.trim();
              if (headBranch && headBranch !== 'HEAD') {
                logger.info(
                  `Discovered worktree in .worktrees/ not in git worktree list: ${entry.name} (branch: ${headBranch})`
                );
                discovered.push({
                  path: normalizedPath,
                  branch: headBranch,
                });
              }
            } catch {
              // Can't determine branch, skip this directory
            }
          }
        }
      } catch {
        // Not a git repo, skip
      }
    }
  } catch (error) {
    logger.warn(`Failed to scan .worktrees directory: ${getErrorMessage(error)}`);
  }

  return discovered;
}

/**
 * Get cached GitHub remote status for a project, or check and cache it.
 * Returns null if gh CLI is not available.
 */
async function getGitHubRemoteStatus(projectPath: string): Promise<GitHubRemoteStatus | null> {
  // Check if gh CLI is available first
  const ghAvailable = await isGhCliAvailable();
  if (!ghAvailable) {
    return null;
  }

  const now = Date.now();
  const cached = githubRemoteCache.get(projectPath);

  // Return cached result if still valid
  if (cached && now - cached.checkedAt < GITHUB_REMOTE_CACHE_TTL_MS) {
    return cached.status;
  }

  // Check GitHub remote and cache the result
  const status = await checkGitHubRemote(projectPath);
  githubRemoteCache.set(projectPath, {
    status,
    checkedAt: Date.now(),
  });

  return status;
}

/**
 * Fetch all PRs from GitHub and create a map of branch name to PR info.
 * Uses --state all to include merged/closed PRs, allowing detection of
 * state changes (e.g., when a PR is merged on GitHub).
 *
 * This also allows detecting PRs that were created outside the app.
 *
 * Uses cached GitHub remote status to avoid repeated warnings when the
 * project doesn't have a GitHub remote configured.
 */
async function fetchGitHubPRs(projectPath: string): Promise<Map<string, WorktreePRInfo>> {
  const prMap = new Map<string, WorktreePRInfo>();

  try {
    // Check GitHub remote status (uses cache to avoid repeated warnings)
    const remoteStatus = await getGitHubRemoteStatus(projectPath);

    // If gh CLI not available or no GitHub remote, return empty silently
    if (!remoteStatus || !remoteStatus.hasGitHubRemote) {
      return prMap;
    }

    // Use -R flag with owner/repo for more reliable PR fetching
    const repoFlag =
      remoteStatus.owner && remoteStatus.repo
        ? `-R ${remoteStatus.owner}/${remoteStatus.repo}`
        : '';

    // Fetch all PRs from GitHub (including merged/closed to detect state changes)
    const { stdout } = await execAsync(
      `gh pr list ${repoFlag} --state all --json number,title,url,state,headRefName,createdAt --limit 1000`,
      { cwd: projectPath, env: execEnv, timeout: 15000 }
    );

    const prs = JSON.parse(stdout || '[]') as Array<{
      number: number;
      title: string;
      url: string;
      state: string;
      headRefName: string;
      createdAt: string;
    }>;

    for (const pr of prs) {
      prMap.set(pr.headRefName, {
        number: pr.number,
        url: pr.url,
        title: pr.title,
        // GitHub CLI returns state as uppercase: OPEN, MERGED, CLOSED
        state: validatePRState(pr.state),
        createdAt: pr.createdAt,
      });
    }
  } catch (error) {
    // Silently fail - PR detection is optional
    logger.warn(`Failed to fetch GitHub PRs: ${getErrorMessage(error)}`);
  }

  return prMap;
}

export function createListHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, includeDetails, forceRefreshGitHub } = req.body as {
        projectPath: string;
        includeDetails?: boolean;
        forceRefreshGitHub?: boolean;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath required' });
        return;
      }

      // Clear GitHub remote cache if force refresh requested
      // This allows users to re-check for GitHub remote after adding one
      if (forceRefreshGitHub) {
        githubRemoteCache.delete(projectPath);
      }

      if (!(await isGitRepo(projectPath))) {
        res.json({ success: true, worktrees: [] });
        return;
      }

      // Get current branch in main directory
      const currentBranch = await getCurrentBranch(projectPath);

      // Get actual worktrees from git
      const { stdout } = await execAsync('git worktree list --porcelain', {
        cwd: projectPath,
      });

      const worktrees: WorktreeInfo[] = [];
      const removedWorktrees: Array<{ path: string; branch: string }> = [];
      const lines = stdout.split('\n');
      let current: { path?: string; branch?: string } = {};
      let isFirst = true;

      // First pass: detect removed worktrees
      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          current.path = normalizePath(line.slice(9));
        } else if (line.startsWith('branch ')) {
          current.branch = line.slice(7).replace('refs/heads/', '');
        } else if (line === '') {
          if (current.path && current.branch) {
            const isMainWorktree = isFirst;
            // Check if the worktree directory actually exists
            // Skip checking/pruning the main worktree (projectPath itself)
            let worktreeExists = false;
            try {
              await secureFs.access(current.path);
              worktreeExists = true;
            } catch {
              worktreeExists = false;
            }
            if (!isMainWorktree && !worktreeExists) {
              // Worktree directory doesn't exist - it was manually deleted
              removedWorktrees.push({
                path: current.path,
                branch: current.branch,
              });
            } else {
              // Worktree exists (or is main worktree), add it to the list
              worktrees.push({
                path: current.path,
                branch: current.branch,
                isMain: isMainWorktree,
                isCurrent: current.branch === currentBranch,
                hasWorktree: true,
              });
              isFirst = false;
            }
          }
          current = {};
        }
      }

      // Prune removed worktrees from git (only if any were detected)
      if (removedWorktrees.length > 0) {
        try {
          await execAsync('git worktree prune', { cwd: projectPath });
        } catch {
          // Prune failed, but we'll still report the removed worktrees
        }
      }

      // Scan .worktrees directory to discover worktrees that exist on disk
      // but are not registered with git (e.g., created externally)
      const knownPaths = new Set(worktrees.map((w) => w.path));
      const discoveredWorktrees = await scanWorktreesDirectory(projectPath, knownPaths);

      // Add discovered worktrees to the list
      for (const discovered of discoveredWorktrees) {
        worktrees.push({
          path: discovered.path,
          branch: discovered.branch,
          isMain: false,
          isCurrent: discovered.branch === currentBranch,
          hasWorktree: true,
        });
      }

      // Read all worktree metadata to get PR info
      const allMetadata = await readAllWorktreeMetadata(projectPath);

      // If includeDetails is requested, fetch change status for each worktree
      if (includeDetails) {
        for (const worktree of worktrees) {
          try {
            const { stdout: statusOutput } = await execAsync('git status --porcelain', {
              cwd: worktree.path,
            });
            const changedFiles = statusOutput
              .trim()
              .split('\n')
              .filter((line) => line.trim());
            worktree.hasChanges = changedFiles.length > 0;
            worktree.changedFilesCount = changedFiles.length;
          } catch {
            worktree.hasChanges = false;
            worktree.changedFilesCount = 0;
          }
        }
      }

      // Assign PR info to each worktree, preferring fresh GitHub data over cached metadata.
      // Only fetch GitHub PRs if includeDetails is requested (performance optimization).
      // Uses --state all to detect merged/closed PRs, limited to 1000 recent PRs.
      const githubPRs = includeDetails
        ? await fetchGitHubPRs(projectPath)
        : new Map<string, WorktreePRInfo>();

      for (const worktree of worktrees) {
        const metadata = allMetadata.get(worktree.branch);
        const githubPR = githubPRs.get(worktree.branch);

        if (githubPR) {
          // Prefer fresh GitHub data (it has the current state)
          worktree.pr = githubPR;

          // Sync metadata with GitHub state when:
          // 1. No metadata exists for this PR (PR created externally)
          // 2. State has changed (e.g., merged/closed on GitHub)
          const needsSync = !metadata?.pr || metadata.pr.state !== githubPR.state;
          if (needsSync) {
            // Fire and forget - don't block the response
            updateWorktreePRInfo(projectPath, worktree.branch, githubPR).catch((err) => {
              logger.warn(
                `Failed to update PR info for ${worktree.branch}: ${getErrorMessage(err)}`
              );
            });
          }
        } else if (metadata?.pr) {
          // Fall back to stored metadata (for PRs not in recent GitHub response)
          worktree.pr = metadata.pr;
        }
      }

      res.json({
        success: true,
        worktrees,
        removedWorktrees: removedWorktrees.length > 0 ? removedWorktrees : undefined,
      });
    } catch (error) {
      logError(error, 'List worktrees failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
