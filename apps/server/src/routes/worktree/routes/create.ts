/**
 * POST /create endpoint - Create a new git worktree
 *
 * This endpoint handles worktree creation with proper checks:
 * 1. First checks if git already has a worktree for the branch (anywhere)
 * 2. If found, returns the existing worktree (no error)
 * 3. Syncs the base branch from its remote tracking branch (fast-forward only)
 * 4. Only creates a new worktree if none exists for the branch
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import * as secureFs from '../../../lib/secure-fs.js';
import type { EventEmitter } from '../../../lib/events.js';
import type { SettingsService } from '../../../services/settings-service.js';
import { WorktreeService } from '../../../services/worktree-service.js';
import { isGitRepo } from '@automaker/git-utils';
import {
  getErrorMessage,
  logError,
  normalizePath,
  ensureInitialCommit,
  isValidBranchName,
} from '../common.js';
import { execGitCommand } from '../../../lib/git.js';
import { trackBranch } from './branch-tracking.js';
import { createLogger } from '@automaker/utils';
import { runInitScript } from '../../../services/init-script-service.js';

const logger = createLogger('Worktree');

/** Timeout for git fetch operations (30 seconds) */
const FETCH_TIMEOUT_MS = 30_000;

const execAsync = promisify(exec);

// ============================================================================
// Remote Sync Types & Helpers
// ============================================================================

/**
 * Result of attempting to sync a base branch with its remote.
 */
interface BaseBranchSyncResult {
  /** Whether the sync was attempted */
  attempted: boolean;
  /** Whether the sync succeeded */
  synced: boolean;
  /** The remote that was synced from (e.g. 'origin') */
  remote?: string;
  /** The commit hash the base branch points to after sync */
  commitHash?: string;
  /** Human-readable message about the sync result */
  message?: string;
  /** Whether the branch had diverged (local commits ahead of remote) */
  diverged?: boolean;
  /** Whether the user can proceed with a stale local copy */
  canProceedWithStale?: boolean;
}

/**
 * Detect the remote tracking branch for a given local branch.
 *
 * @param projectPath - Path to the git repository
 * @param branchName - Local branch name to check (e.g. 'main')
 * @returns Object with remote name and remote branch, or null if no tracking branch
 */
async function getTrackingBranch(
  projectPath: string,
  branchName: string
): Promise<{ remote: string; remoteBranch: string } | null> {
  try {
    // git rev-parse --abbrev-ref <branch>@{upstream} returns e.g. "origin/main"
    const upstream = await execGitCommand(
      ['rev-parse', '--abbrev-ref', `${branchName}@{upstream}`],
      projectPath
    );
    const trimmed = upstream.trim();
    // Parse "origin/main" into remote="origin", remoteBranch="main"
    const slashIndex = trimmed.indexOf('/');
    if (slashIndex > 0) {
      return {
        remote: trimmed.substring(0, slashIndex),
        remoteBranch: trimmed.substring(slashIndex + 1),
      };
    }
    return null;
  } catch {
    // No upstream tracking branch configured
    return null;
  }
}

/**
 * Check whether a branch is checked out in the main worktree (i.e., the
 * current HEAD of the project). We can only do a fast-forward merge on a
 * branch that is currently checked out. For branches that are NOT checked
 * out, we use `git fetch` + `git update-ref` instead.
 */
async function isBranchCheckedOut(projectPath: string, branchName: string): Promise<boolean> {
  try {
    const headBranch = await execGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], projectPath);
    return headBranch.trim() === branchName;
  } catch {
    return false;
  }
}

/**
 * Sync a local base branch with its remote tracking branch using fast-forward only.
 *
 * This function:
 * 1. Detects the remote tracking branch for the given local branch
 * 2. Fetches latest from that remote
 * 3. Attempts a fast-forward-only update of the local branch
 * 4. If the branch has diverged, reports the divergence and allows proceeding with stale copy
 * 5. If no remote tracking branch exists, skips silently
 *
 * @param projectPath - Path to the git repository
 * @param branchName - The local branch name to sync (e.g. 'main')
 * @returns Sync result with status information
 */
async function syncBaseBranch(
  projectPath: string,
  branchName: string
): Promise<BaseBranchSyncResult> {
  // Skip if the branch is a remote ref like "origin/main" — those are already
  // updated by the fetch --all that runs before this function.
  if (branchName.includes('/')) {
    // Get the commit hash of the remote ref for logging
    try {
      const commitHash = await execGitCommand(['rev-parse', '--short', branchName], projectPath);
      return {
        attempted: false,
        synced: true,
        commitHash: commitHash.trim(),
        message: `Using remote ref ${branchName} (already fetched)`,
      };
    } catch {
      return { attempted: false, synced: false, message: `Remote ref ${branchName} not found` };
    }
  }

  // Check if the branch exists locally
  try {
    await execGitCommand(['rev-parse', '--verify', branchName], projectPath);
  } catch {
    // Branch doesn't exist locally — nothing to sync
    return {
      attempted: false,
      synced: false,
      message: `Local branch '${branchName}' does not exist`,
    };
  }

  // Detect remote tracking branch
  const tracking = await getTrackingBranch(projectPath, branchName);
  if (!tracking) {
    // No remote tracking branch — skip silently
    logger.info(`Branch '${branchName}' has no remote tracking branch, skipping sync`);
    try {
      const commitHash = await execGitCommand(['rev-parse', '--short', branchName], projectPath);
      return {
        attempted: false,
        synced: false,
        commitHash: commitHash.trim(),
        message: `Branch '${branchName}' has no remote tracking branch`,
      };
    } catch {
      return {
        attempted: false,
        synced: false,
        message: `Branch '${branchName}' has no remote tracking branch`,
      };
    }
  }

  logger.info(
    `Syncing base branch '${branchName}' from ${tracking.remote}/${tracking.remoteBranch}`
  );

  // Fetch the specific remote (may have already been fetched by --all, but
  // this ensures we have the very latest for this specific remote)
  try {
    const fetchController = new AbortController();
    const fetchTimer = setTimeout(() => fetchController.abort(), FETCH_TIMEOUT_MS);
    try {
      await execGitCommand(
        ['fetch', tracking.remote, tracking.remoteBranch, '--quiet'],
        projectPath,
        undefined,
        fetchController
      );
    } finally {
      clearTimeout(fetchTimer);
    }
  } catch (fetchErr) {
    // Fetch failed — network error, auth error, etc.
    // Allow proceeding with stale local copy
    const errMsg = getErrorMessage(fetchErr);
    logger.warn(`Failed to fetch ${tracking.remote}/${tracking.remoteBranch}: ${errMsg}`);
    try {
      const commitHash = await execGitCommand(['rev-parse', '--short', branchName], projectPath);
      return {
        attempted: true,
        synced: false,
        remote: tracking.remote,
        commitHash: commitHash.trim(),
        message: `Failed to fetch from remote: ${errMsg}. Proceeding with local copy.`,
        canProceedWithStale: true,
      };
    } catch {
      return {
        attempted: true,
        synced: false,
        remote: tracking.remote,
        message: `Failed to fetch from remote: ${errMsg}. Proceeding with local copy.`,
        canProceedWithStale: true,
      };
    }
  }

  // Check if the local branch is behind, ahead, or diverged from the remote
  const remoteRef = `${tracking.remote}/${tracking.remoteBranch}`;
  try {
    // Count commits ahead and behind
    const revListOutput = await execGitCommand(
      ['rev-list', '--left-right', '--count', `${branchName}...${remoteRef}`],
      projectPath
    );
    const parts = revListOutput.trim().split(/\s+/);
    const ahead = parseInt(parts[0], 10) || 0;
    const behind = parseInt(parts[1], 10) || 0;

    if (ahead === 0 && behind === 0) {
      // Already up to date
      const commitHash = await execGitCommand(['rev-parse', '--short', branchName], projectPath);
      logger.info(`Branch '${branchName}' is already up to date with ${remoteRef}`);
      return {
        attempted: true,
        synced: true,
        remote: tracking.remote,
        commitHash: commitHash.trim(),
        message: `Branch '${branchName}' is already up to date`,
      };
    }

    if (ahead > 0 && behind > 0) {
      // Branch has diverged — cannot fast-forward
      const commitHash = await execGitCommand(['rev-parse', '--short', branchName], projectPath);
      logger.warn(
        `Branch '${branchName}' has diverged from ${remoteRef} (${ahead} ahead, ${behind} behind)`
      );
      return {
        attempted: true,
        synced: false,
        remote: tracking.remote,
        commitHash: commitHash.trim(),
        message: `Branch '${branchName}' has diverged from ${remoteRef} (${ahead} commit(s) ahead, ${behind} behind). Using local copy to avoid overwriting local commits.`,
        diverged: true,
        canProceedWithStale: true,
      };
    }

    if (ahead > 0 && behind === 0) {
      // Local is ahead — nothing to pull, already has everything from remote plus more
      const commitHash = await execGitCommand(['rev-parse', '--short', branchName], projectPath);
      logger.info(`Branch '${branchName}' is ${ahead} commit(s) ahead of ${remoteRef}`);
      return {
        attempted: true,
        synced: true,
        remote: tracking.remote,
        commitHash: commitHash.trim(),
        message: `Branch '${branchName}' is ${ahead} commit(s) ahead of remote`,
      };
    }

    // behind > 0 && ahead === 0 — can fast-forward
    logger.info(
      `Branch '${branchName}' is ${behind} commit(s) behind ${remoteRef}, fast-forwarding`
    );

    // Determine whether the branch is currently checked out
    const checkedOut = await isBranchCheckedOut(projectPath, branchName);

    if (checkedOut) {
      // Branch is the current HEAD — use git merge --ff-only
      try {
        await execGitCommand(['merge', '--ff-only', remoteRef], projectPath);
      } catch (mergeErr) {
        const errMsg = getErrorMessage(mergeErr);
        logger.warn(`Fast-forward merge failed for '${branchName}': ${errMsg}`);
        const commitHash = await execGitCommand(['rev-parse', '--short', branchName], projectPath);
        return {
          attempted: true,
          synced: false,
          remote: tracking.remote,
          commitHash: commitHash.trim(),
          message: `Fast-forward merge failed: ${errMsg}. Proceeding with local copy.`,
          canProceedWithStale: true,
        };
      }
    } else {
      // Branch is NOT checked out — use git update-ref to fast-forward without checkout
      // This is safe because we already verified the branch is strictly behind (ahead === 0)
      try {
        const remoteCommit = await execGitCommand(['rev-parse', remoteRef], projectPath);
        await execGitCommand(
          ['update-ref', `refs/heads/${branchName}`, remoteCommit.trim()],
          projectPath
        );
      } catch (updateErr) {
        const errMsg = getErrorMessage(updateErr);
        logger.warn(`update-ref failed for '${branchName}': ${errMsg}`);
        const commitHash = await execGitCommand(['rev-parse', '--short', branchName], projectPath);
        return {
          attempted: true,
          synced: false,
          remote: tracking.remote,
          commitHash: commitHash.trim(),
          message: `Failed to fast-forward branch: ${errMsg}. Proceeding with local copy.`,
          canProceedWithStale: true,
        };
      }
    }

    // Successfully fast-forwarded
    const commitHash = await execGitCommand(['rev-parse', '--short', branchName], projectPath);
    logger.info(`Successfully synced '${branchName}' to ${commitHash.trim()} from ${remoteRef}`);
    return {
      attempted: true,
      synced: true,
      remote: tracking.remote,
      commitHash: commitHash.trim(),
      message: `Fast-forwarded '${branchName}' by ${behind} commit(s) from ${remoteRef}`,
    };
  } catch (err) {
    // Unexpected error during rev-list or merge — proceed with stale
    const errMsg = getErrorMessage(err);
    logger.warn(`Unexpected error syncing '${branchName}': ${errMsg}`);
    try {
      const commitHash = await execGitCommand(['rev-parse', '--short', branchName], projectPath);
      return {
        attempted: true,
        synced: false,
        remote: tracking.remote,
        commitHash: commitHash.trim(),
        message: `Sync failed: ${errMsg}. Proceeding with local copy.`,
        canProceedWithStale: true,
      };
    } catch {
      return {
        attempted: true,
        synced: false,
        remote: tracking.remote,
        message: `Sync failed: ${errMsg}. Proceeding with local copy.`,
        canProceedWithStale: true,
      };
    }
  }
}

/**
 * Find an existing worktree for a given branch by checking git worktree list
 */
async function findExistingWorktreeForBranch(
  projectPath: string,
  branchName: string
): Promise<{ path: string; branch: string } | null> {
  try {
    const { stdout } = await execAsync('git worktree list --porcelain', {
      cwd: projectPath,
    });

    const lines = stdout.split('\n');
    let currentPath: string | null = null;
    let currentBranch: string | null = null;

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        currentPath = line.slice(9);
      } else if (line.startsWith('branch ')) {
        currentBranch = line.slice(7).replace('refs/heads/', '');
      } else if (line === '' && currentPath && currentBranch) {
        // End of a worktree entry
        if (currentBranch === branchName) {
          // Resolve to absolute path - git may return relative paths
          // Critical for cross-platform compatibility (Windows, macOS, Linux)
          const resolvedPath = path.isAbsolute(currentPath)
            ? path.resolve(currentPath)
            : path.resolve(projectPath, currentPath);
          return { path: resolvedPath, branch: currentBranch };
        }
        currentPath = null;
        currentBranch = null;
      }
    }

    // Check the last entry (if file doesn't end with newline)
    if (currentPath && currentBranch && currentBranch === branchName) {
      // Resolve to absolute path for cross-platform compatibility
      const resolvedPath = path.isAbsolute(currentPath)
        ? path.resolve(currentPath)
        : path.resolve(projectPath, currentPath);
      return { path: resolvedPath, branch: currentBranch };
    }

    return null;
  } catch {
    return null;
  }
}

export function createCreateHandler(events: EventEmitter, settingsService?: SettingsService) {
  const worktreeService = new WorktreeService();

  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, branchName, baseBranch } = req.body as {
        projectPath: string;
        branchName: string;
        baseBranch?: string; // Optional base branch to create from (defaults to current HEAD). Can be a remote branch like "origin/main".
      };

      if (!projectPath || !branchName) {
        res.status(400).json({
          success: false,
          error: 'projectPath and branchName required',
        });
        return;
      }

      // Validate branch name to prevent command injection
      if (!isValidBranchName(branchName)) {
        res.status(400).json({
          success: false,
          error:
            'Invalid branch name. Branch names must contain only letters, numbers, dots, hyphens, underscores, and forward slashes.',
        });
        return;
      }

      // Validate base branch if provided
      if (baseBranch && !isValidBranchName(baseBranch) && baseBranch !== 'HEAD') {
        res.status(400).json({
          success: false,
          error:
            'Invalid base branch name. Branch names must contain only letters, numbers, dots, hyphens, underscores, and forward slashes.',
        });
        return;
      }

      if (!(await isGitRepo(projectPath))) {
        res.status(400).json({
          success: false,
          error: 'Not a git repository',
        });
        return;
      }

      // Ensure the repository has at least one commit so worktree commands referencing HEAD succeed
      // Pass git identity env vars so commits work without global git config
      const gitEnv = {
        GIT_AUTHOR_NAME: 'Automaker',
        GIT_AUTHOR_EMAIL: 'automaker@localhost',
        GIT_COMMITTER_NAME: 'Automaker',
        GIT_COMMITTER_EMAIL: 'automaker@localhost',
      };
      await ensureInitialCommit(projectPath, gitEnv);

      // First, check if git already has a worktree for this branch (anywhere)
      const existingWorktree = await findExistingWorktreeForBranch(projectPath, branchName);
      if (existingWorktree) {
        // Worktree already exists, return it as success (not an error)
        // This handles manually created worktrees or worktrees from previous runs
        logger.info(
          `Found existing worktree for branch "${branchName}" at: ${existingWorktree.path}`
        );

        // Track the branch so it persists in the UI
        await trackBranch(projectPath, branchName);

        res.json({
          success: true,
          worktree: {
            path: normalizePath(existingWorktree.path),
            branch: branchName,
            isNew: false, // Not newly created
          },
        });
        return;
      }

      // Sanitize branch name for directory usage
      const sanitizedName = branchName.replace(/[^a-zA-Z0-9_-]/g, '-');
      const worktreesDir = path.join(projectPath, '.worktrees');
      const worktreePath = path.join(worktreesDir, sanitizedName);

      // Create worktrees directory if it doesn't exist
      await secureFs.mkdir(worktreesDir, { recursive: true });

      // Fetch latest from all remotes before creating the worktree.
      // This ensures remote refs are up-to-date for:
      // - Remote base branches (e.g. "origin/main")
      // - Existing remote branches being checked out as worktrees
      // - Branch existence checks against fresh remote state
      logger.info('Fetching from all remotes before creating worktree');
      try {
        const controller = new AbortController();
        const timerId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
          await execGitCommand(['fetch', '--all', '--quiet'], projectPath, undefined, controller);
        } finally {
          clearTimeout(timerId);
        }
      } catch (fetchErr) {
        // Non-fatal: log but continue — refs might already be cached locally
        logger.warn(`Failed to fetch from remotes: ${getErrorMessage(fetchErr)}`);
      }

      // Sync the base branch with its remote tracking branch (fast-forward only).
      // This ensures the new worktree starts from an up-to-date state rather than
      // a potentially stale local copy. If the sync fails or the branch has diverged,
      // we proceed with the local copy and inform the user.
      const effectiveBase = baseBranch || 'HEAD';
      let syncResult: BaseBranchSyncResult = { attempted: false, synced: false };

      // Only sync if the base is a real branch (not 'HEAD')
      if (effectiveBase !== 'HEAD') {
        logger.info(`Syncing base branch '${effectiveBase}' before creating worktree`);
        syncResult = await syncBaseBranch(projectPath, effectiveBase);
        if (syncResult.attempted) {
          if (syncResult.synced) {
            logger.info(`Base branch sync result: ${syncResult.message}`);
          } else {
            logger.warn(`Base branch sync result: ${syncResult.message}`);
          }
        }
      } else {
        // When using HEAD, try to sync the currently checked-out branch
        try {
          const currentBranch = await execGitCommand(
            ['rev-parse', '--abbrev-ref', 'HEAD'],
            projectPath
          );
          const trimmedBranch = currentBranch.trim();
          if (trimmedBranch && trimmedBranch !== 'HEAD') {
            logger.info(
              `Syncing current branch '${trimmedBranch}' (HEAD) before creating worktree`
            );
            syncResult = await syncBaseBranch(projectPath, trimmedBranch);
            if (syncResult.attempted) {
              if (syncResult.synced) {
                logger.info(`HEAD branch sync result: ${syncResult.message}`);
              } else {
                logger.warn(`HEAD branch sync result: ${syncResult.message}`);
              }
            }
          }
        } catch {
          // Could not determine HEAD branch — skip sync
        }
      }

      // Check if branch exists (using array arguments to prevent injection)
      let branchExists = false;
      try {
        await execGitCommand(['rev-parse', '--verify', branchName], projectPath);
        branchExists = true;
      } catch {
        // Branch doesn't exist
      }

      // Create worktree (using array arguments to prevent injection)
      if (branchExists) {
        // Use existing branch
        await execGitCommand(['worktree', 'add', worktreePath, branchName], projectPath);
      } else {
        // Create new branch from base or HEAD
        const base = baseBranch || 'HEAD';
        await execGitCommand(
          ['worktree', 'add', '-b', branchName, worktreePath, base],
          projectPath
        );
      }

      // Note: We intentionally do NOT symlink .automaker to worktrees
      // Features and config are always accessed from the main project path
      // This avoids symlink loop issues when activating worktrees

      // Track the branch so it persists in the UI even after worktree is removed
      await trackBranch(projectPath, branchName);

      // Resolve to absolute path for cross-platform compatibility
      // normalizePath converts to forward slashes for API consistency
      const absoluteWorktreePath = path.resolve(worktreePath);

      // Get the commit hash the new worktree is based on for logging
      let baseCommitHash: string | undefined;
      try {
        const hash = await execGitCommand(['rev-parse', '--short', 'HEAD'], absoluteWorktreePath);
        baseCommitHash = hash.trim();
      } catch {
        // Non-critical — just for logging
      }

      if (baseCommitHash) {
        logger.info(`New worktree for '${branchName}' based on commit ${baseCommitHash}`);
      }

      // Copy configured files into the new worktree before responding
      // This runs synchronously to ensure files are in place before any init script
      try {
        await worktreeService.copyConfiguredFiles(
          projectPath,
          absoluteWorktreePath,
          settingsService,
          events
        );
      } catch (copyErr) {
        // Log but don't fail worktree creation – files may be partially copied
        logger.warn('Some configured files failed to copy to worktree:', copyErr);
      }

      // Respond immediately (non-blocking)
      res.json({
        success: true,
        worktree: {
          path: normalizePath(absoluteWorktreePath),
          branch: branchName,
          isNew: !branchExists,
          baseCommitHash,
          ...(syncResult.attempted
            ? {
                syncResult: {
                  synced: syncResult.synced,
                  remote: syncResult.remote,
                  message: syncResult.message,
                  diverged: syncResult.diverged,
                },
              }
            : {}),
        },
      });

      // Trigger init script asynchronously after response
      // runInitScript internally checks if script exists and hasn't already run
      runInitScript({
        projectPath,
        worktreePath: absoluteWorktreePath,
        branch: branchName,
        emitter: events,
      }).catch((err) => {
        logger.error(`Init script failed for ${branchName}:`, err);
      });
    } catch (error) {
      logError(error, 'Create worktree failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
