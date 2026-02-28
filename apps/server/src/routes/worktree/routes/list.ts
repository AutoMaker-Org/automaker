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
import {
  getErrorMessage,
  logError,
  normalizePath,
  execEnv,
  isGhCliAvailable,
  execGitCommand,
} from '../common.js';
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

/** True when git (or shell) could not be spawned (e.g. ENOENT in sandboxed CI). */
function isSpawnENOENT(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; errno?: number; syscall?: string };
  // Accept ENOENT with or without syscall so wrapped/reexported errors are handled.
  // Node may set syscall to 'spawn' or 'spawn git' (or other command name).
  if (e.code === 'ENOENT' || e.errno === -2) {
    return (
      e.syscall === 'spawn' ||
      (typeof e.syscall === 'string' && e.syscall.startsWith('spawn')) ||
      e.syscall === undefined
    );
  }
  return false;
}

/**
 * Cache for GitHub remote status per project path.
 * This prevents repeated "no git remotes found" warnings when polling
 * projects that don't have a GitHub remote configured.
 */
interface GitHubRemoteCacheEntry {
  status: GitHubRemoteStatus;
  checkedAt: number;
}

interface GitHubPRCacheEntry {
  prs: Map<string, WorktreePRInfo>;
  fetchedAt: number;
}

const githubRemoteCache = new Map<string, GitHubRemoteCacheEntry>();
const githubPRCache = new Map<string, GitHubPRCacheEntry>();
const GITHUB_REMOTE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const GITHUB_PR_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes - avoid hitting GitHub on every poll

interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
  isCurrent: boolean; // Is this the currently checked out branch in main?
  hasWorktree: boolean; // Always true for items in this list
  hasChanges?: boolean;
  changedFilesCount?: number;
  pr?: WorktreePRInfo; // PR info if a PR has been created for this branch
  /** Whether there are actual unresolved conflict files (conflictFiles.length > 0) */
  hasConflicts?: boolean;
  /** Type of git operation in progress (merge/rebase/cherry-pick), set independently of hasConflicts */
  conflictType?: 'merge' | 'rebase' | 'cherry-pick';
  /** List of files with conflicts */
  conflictFiles?: string[];
}

/**
 * Detect if a merge, rebase, or cherry-pick is in progress for a worktree.
 * Checks for the presence of state files/directories that git creates
 * during these operations.
 */
async function detectConflictState(worktreePath: string): Promise<{
  hasConflicts: boolean;
  conflictType?: 'merge' | 'rebase' | 'cherry-pick';
  conflictFiles?: string[];
}> {
  try {
    // Find the canonical .git directory for this worktree (execGitCommand avoids /bin/sh in CI)
    const gitDirRaw = await execGitCommand(['rev-parse', '--git-dir'], worktreePath);
    const gitDir = path.resolve(worktreePath, gitDirRaw.trim());

    // Check for merge, rebase, and cherry-pick state files/directories
    const [mergeHeadExists, rebaseMergeExists, rebaseApplyExists, cherryPickHeadExists] =
      await Promise.all([
        secureFs
          .access(path.join(gitDir, 'MERGE_HEAD'))
          .then(() => true)
          .catch(() => false),
        secureFs
          .access(path.join(gitDir, 'rebase-merge'))
          .then(() => true)
          .catch(() => false),
        secureFs
          .access(path.join(gitDir, 'rebase-apply'))
          .then(() => true)
          .catch(() => false),
        secureFs
          .access(path.join(gitDir, 'CHERRY_PICK_HEAD'))
          .then(() => true)
          .catch(() => false),
      ]);

    let conflictType: 'merge' | 'rebase' | 'cherry-pick' | undefined;
    if (rebaseMergeExists || rebaseApplyExists) {
      conflictType = 'rebase';
    } else if (mergeHeadExists) {
      conflictType = 'merge';
    } else if (cherryPickHeadExists) {
      conflictType = 'cherry-pick';
    }

    if (!conflictType) {
      return { hasConflicts: false };
    }

    // Get list of conflicted files using machine-readable git status
    let conflictFiles: string[] = [];
    try {
      const statusOutput = await execGitCommand(
        ['diff', '--name-only', '--diff-filter=U'],
        worktreePath
      );
      conflictFiles = statusOutput
        .trim()
        .split('\n')
        .filter((f) => f.trim().length > 0);
    } catch {
      // Fall back to empty list if diff fails
    }

    return {
      hasConflicts: conflictFiles.length > 0,
      conflictType,
      conflictFiles,
    };
  } catch {
    // If anything fails, assume no conflicts
    return { hasConflicts: false };
  }
}

async function getCurrentBranch(cwd: string): Promise<string> {
  try {
    const stdout = await execGitCommand(['branch', '--show-current'], cwd);
    return stdout.trim();
  } catch {
    return '';
  }
}

function normalizeBranchFromHeadRef(headRef: string): string | null {
  let normalized = headRef.trim();
  const prefixes = ['refs/heads/', 'refs/remotes/origin/', 'refs/remotes/', 'refs/'];

  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length);
      break;
    }
  }

  // Return the full branch name, including any slashes (e.g., "feature/my-branch")
  return normalized || null;
}

/**
 * Attempt to recover the branch name for a worktree in detached HEAD state.
 * This happens during rebase operations where git detaches HEAD from the branch.
 * We look at git state files (rebase-merge/head-name, rebase-apply/head-name)
 * to determine which branch the operation is targeting.
 *
 * Note: merge conflicts do NOT detach HEAD, so `git worktree list --porcelain`
 * still includes the `branch` line for merge conflicts. This recovery is
 * specifically for rebase and cherry-pick operations.
 */
async function recoverBranchForDetachedWorktree(worktreePath: string): Promise<string | null> {
  try {
    const gitDirRaw = await execGitCommand(['rev-parse', '--git-dir'], worktreePath);
    const gitDir = path.resolve(worktreePath, gitDirRaw.trim());

    // During a rebase, the original branch is stored in rebase-merge/head-name
    try {
      const headNamePath = path.join(gitDir, 'rebase-merge', 'head-name');
      const headName = (await secureFs.readFile(headNamePath, 'utf-8')) as string;
      const branch = normalizeBranchFromHeadRef(headName);
      if (branch) return branch;
    } catch {
      // Not a rebase-merge
    }

    // rebase-apply also stores the original branch in head-name
    try {
      const headNamePath = path.join(gitDir, 'rebase-apply', 'head-name');
      const headName = (await secureFs.readFile(headNamePath, 'utf-8')) as string;
      const branch = normalizeBranchFromHeadRef(headName);
      if (branch) return branch;
    } catch {
      // Not a rebase-apply
    }

    return null;
  } catch {
    return null;
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
            let headBranch: string | null = null;
            try {
              const headRef = await execGitCommand(
                ['rev-parse', '--abbrev-ref', 'HEAD'],
                worktreePath
              );
              const ref = headRef.trim();
              if (ref && ref !== 'HEAD') {
                headBranch = ref;
              }
            } catch (error) {
              // Can't determine branch from HEAD ref (including timeout) - fall back to detached HEAD recovery
              logger.debug(
                `Failed to resolve HEAD ref for ${worktreePath}: ${getErrorMessage(error)}`
              );
            }

            // If HEAD is detached (rebase/merge in progress), try recovery from git state files
            if (!headBranch) {
              headBranch = await recoverBranchForDetachedWorktree(worktreePath);
            }

            if (headBranch) {
              logger.info(
                `Discovered worktree in .worktrees/ not in git worktree list: ${entry.name} (branch: ${headBranch})`
              );
              discovered.push({
                path: normalizedPath,
                branch: headBranch,
              });
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
 * project doesn't have a GitHub remote configured. Results are cached
 * briefly to avoid hammering GitHub on frequent worktree polls.
 */
async function fetchGitHubPRs(
  projectPath: string,
  forceRefresh = false
): Promise<Map<string, WorktreePRInfo>> {
  const now = Date.now();
  const cached = githubPRCache.get(projectPath);

  // Return cached result if valid and not forcing refresh
  if (!forceRefresh && cached && now - cached.fetchedAt < GITHUB_PR_CACHE_TTL_MS) {
    return cached.prs;
  }

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

    // Only update cache on successful fetch
    githubPRCache.set(projectPath, {
      prs: prMap,
      fetchedAt: Date.now(),
    });
  } catch (error) {
    // On fetch failure, return stale cached data if available to avoid
    // repeated API calls during GitHub API flakiness or temporary outages
    if (cached) {
      logger.warn(`Failed to fetch GitHub PRs, returning stale cache: ${getErrorMessage(error)}`);
      // Extend cache TTL to avoid repeated retries during outages
      githubPRCache.set(projectPath, { prs: cached.prs, fetchedAt: Date.now() });
      return cached.prs;
    }
    // No cache available, log warning and return empty map
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

      // Get actual worktrees from git (execGitCommand avoids /bin/sh in sandboxed CI)
      const stdout = await execGitCommand(['worktree', 'list', '--porcelain'], projectPath);

      const worktrees: WorktreeInfo[] = [];
      const removedWorktrees: Array<{ path: string; branch: string }> = [];
      let hasMissingWorktree = false;
      const lines = stdout.split('\n');
      let current: { path?: string; branch?: string; isDetached?: boolean } = {};
      let isFirst = true;

      // First pass: detect removed worktrees
      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          current.path = normalizePath(line.slice(9));
        } else if (line.startsWith('branch ')) {
          current.branch = line.slice(7).replace('refs/heads/', '');
        } else if (line.startsWith('detached')) {
          // Worktree is in detached HEAD state (e.g., during rebase)
          current.isDetached = true;
        } else if (line === '') {
          if (current.path) {
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
              hasMissingWorktree = true;
              // Worktree directory doesn't exist - it was manually deleted
              // Only add to removed list if we know the branch name
              if (current.branch) {
                removedWorktrees.push({
                  path: current.path,
                  branch: current.branch,
                });
              }
            } else if (current.branch) {
              // Normal case: worktree with a known branch
              worktrees.push({
                path: current.path,
                branch: current.branch,
                isMain: isMainWorktree,
                isCurrent: current.branch === currentBranch,
                hasWorktree: true,
              });
              isFirst = false;
            } else if (current.isDetached && worktreeExists) {
              // Detached HEAD (e.g., rebase in progress) - try to recover branch name.
              // This is critical: without this, worktrees undergoing rebase/merge
              // operations would silently disappear from the UI.
              const recoveredBranch = await recoverBranchForDetachedWorktree(current.path);
              worktrees.push({
                path: current.path,
                branch: recoveredBranch || `(detached)`,
                isMain: isMainWorktree,
                isCurrent: false,
                hasWorktree: true,
              });
              isFirst = false;
            }
          }
          current = {};
        }
      }

      // Prune removed worktrees from git (only if any missing worktrees were detected)
      if (hasMissingWorktree) {
        try {
          await execGitCommand(['worktree', 'prune'], projectPath);
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

      // If includeDetails is requested, fetch change status and conflict state for each worktree
      if (includeDetails) {
        for (const worktree of worktrees) {
          try {
            const statusOutput = await execGitCommand(['status', '--porcelain'], worktree.path);
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

          // Detect merge/rebase/cherry-pick in progress
          try {
            const conflictState = await detectConflictState(worktree.path);
            // Always propagate conflictType so callers know an operation is in progress,
            // even when there are no unresolved conflict files yet.
            if (conflictState.conflictType) {
              worktree.conflictType = conflictState.conflictType;
            }
            // hasConflicts is true only when there are actual unresolved files
            worktree.hasConflicts = conflictState.hasConflicts;
            worktree.conflictFiles = conflictState.conflictFiles;
          } catch {
            // Ignore conflict detection errors
          }
        }
      }

      // Assign PR info to each worktree.
      // Only fetch GitHub PRs if includeDetails is requested (performance optimization).
      // Uses --state all to detect merged/closed PRs, limited to 1000 recent PRs.
      const githubPRs = includeDetails
        ? await fetchGitHubPRs(projectPath, forceRefreshGitHub)
        : new Map<string, WorktreePRInfo>();

      for (const worktree of worktrees) {
        // Skip PR assignment for the main worktree - it's not meaningful to show
        // PRs on the main branch tab, and can be confusing if someone created
        // a PR from main to another branch
        if (worktree.isMain) {
          continue;
        }

        const metadata = allMetadata.get(worktree.branch);
        const githubPR = githubPRs.get(worktree.branch);

        const metadataPR = metadata?.pr;
        // Preserve explicit user-selected PR tracking from metadata when it differs
        // from branch-derived GitHub PR lookup. This allows "Change PR Number" to
        // persist instead of being overwritten by gh pr list for the branch.
        const hasManualOverride =
          !!metadataPR && !!githubPR && metadataPR.number !== githubPR.number;

        if (hasManualOverride) {
          worktree.pr = metadataPR;
        } else if (githubPR) {
          // Use fresh GitHub data when there is no explicit override.
          worktree.pr = githubPR;

          // Sync metadata when missing or stale so fallback data stays current.
          const needsSync =
            !metadataPR ||
            metadataPR.number !== githubPR.number ||
            metadataPR.state !== githubPR.state ||
            metadataPR.title !== githubPR.title ||
            metadataPR.url !== githubPR.url ||
            metadataPR.createdAt !== githubPR.createdAt;
          if (needsSync) {
            // Fire and forget - don't block the response
            updateWorktreePRInfo(projectPath, worktree.branch, githubPR).catch((err) => {
              logger.warn(
                `Failed to update PR info for ${worktree.branch}: ${getErrorMessage(err)}`
              );
            });
          }
        } else if (metadataPR && metadataPR.state === 'OPEN') {
          // Fall back to stored metadata only if the PR is still OPEN
          worktree.pr = metadataPR;
        }
      }

      res.json({
        success: true,
        worktrees,
        removedWorktrees: removedWorktrees.length > 0 ? removedWorktrees : undefined,
      });
    } catch (error) {
      // When git is unavailable (e.g. sandboxed E2E, PATH without git), return minimal list so UI still loads
      if (isSpawnENOENT(error)) {
        const projectPathFromBody = (req.body as { projectPath?: string })?.projectPath;
        const mainPath = projectPathFromBody ? normalizePath(projectPathFromBody) : undefined;
        if (mainPath) {
          res.json({
            success: true,
            worktrees: [
              {
                path: mainPath,
                branch: 'main',
                isMain: true,
                isCurrent: true,
                hasWorktree: true,
              },
            ],
          });
          return;
        }
      }
      logError(error, 'List worktrees failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
