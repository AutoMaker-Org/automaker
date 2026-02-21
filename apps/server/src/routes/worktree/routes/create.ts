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
import {
  syncBaseBranch,
  type BaseBranchSyncResult,
} from '../../../services/branch-sync-service.js';

const logger = createLogger('Worktree');

/** Timeout for git fetch operations (30 seconds) */
const FETCH_TIMEOUT_MS = 30_000;

const execAsync = promisify(exec);

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
      // Pass skipFetch=true because we already fetched all remotes above.
      if (effectiveBase !== 'HEAD') {
        logger.info(`Syncing base branch '${effectiveBase}' before creating worktree`);
        syncResult = await syncBaseBranch(projectPath, effectiveBase, true);
        if (syncResult.attempted) {
          if (syncResult.synced) {
            logger.info(`Base branch sync result: ${syncResult.message}`);
          } else {
            logger.warn(`Base branch sync result: ${syncResult.message}`);
          }
        }
      } else {
        // When using HEAD, try to sync the currently checked-out branch
        // Pass skipFetch=true because we already fetched all remotes above.
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
            syncResult = await syncBaseBranch(projectPath, trimmedBranch, true);
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
