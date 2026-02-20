/**
 * POST /checkout-branch endpoint - Create and checkout a new branch
 *
 * Supports automatic stash handling: when `stashChanges` is true, local changes
 * are stashed before creating the branch and reapplied after. If the stash pop
 * results in merge conflicts, returns a special response so the UI can create a
 * conflict resolution task.
 *
 * Git business logic is delegated to checkout-branch-service.ts when stash
 * handling is requested. Otherwise, falls back to the original simple flow.
 *
 * Note: Git repository validation (isGitRepo, hasCommits) is handled by
 * the requireValidWorktree middleware in index.ts.
 * Path validation (ALLOWED_ROOT_DIRECTORY) is handled by validatePathParams
 * middleware in index.ts.
 */

import type { Request, Response } from 'express';
import path from 'path';
import { stat } from 'fs/promises';
import { getErrorMessage, logError, isValidBranchName } from '../common.js';
import { execGitCommand } from '../../../lib/git.js';
import type { EventEmitter } from '../../../lib/events.js';
import { performCheckoutBranch } from '../../../services/checkout-branch-service.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('CheckoutBranchRoute');

/** Timeout for git fetch operations (30 seconds) */
const FETCH_TIMEOUT_MS = 30_000;

/**
 * Fetch latest from all remotes (silently, with timeout).
 * Non-fatal: fetch errors are logged and swallowed so the workflow continues.
 */
async function fetchRemotes(cwd: string): Promise<void> {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    await execGitCommand(['fetch', '--all', '--quiet'], cwd, undefined, controller);
  } catch (error) {
    if (error instanceof Error && error.message === 'Process aborted') {
      logger.warn(
        `fetchRemotes timed out after ${FETCH_TIMEOUT_MS}ms - continuing without latest remote refs`
      );
    } else {
      logger.warn(`fetchRemotes failed: ${getErrorMessage(error)} - continuing with local refs`);
    }
    // Non-fatal: continue with locally available refs
  } finally {
    clearTimeout(timerId);
  }
}

export function createCheckoutBranchHandler(events?: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, branchName, baseBranch, stashChanges, includeUntracked } = req.body as {
        worktreePath: string;
        branchName: string;
        baseBranch?: string;
        /** When true, stash local changes before checkout and reapply after */
        stashChanges?: boolean;
        /** When true, include untracked files in the stash (defaults to true) */
        includeUntracked?: boolean;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath required',
        });
        return;
      }

      if (!branchName) {
        res.status(400).json({
          success: false,
          error: 'branchName required',
        });
        return;
      }

      // Validate branch name using shared allowlist: /^[a-zA-Z0-9._\-/]+$/
      if (!isValidBranchName(branchName)) {
        res.status(400).json({
          success: false,
          error:
            'Invalid branch name. Must contain only letters, numbers, dots, dashes, underscores, or slashes.',
        });
        return;
      }

      // Validate base branch if provided
      if (baseBranch && !isValidBranchName(baseBranch) && baseBranch !== 'HEAD') {
        res.status(400).json({
          success: false,
          error:
            'Invalid base branch name. Must contain only letters, numbers, dots, dashes, underscores, or slashes.',
        });
        return;
      }

      // Resolve and validate worktreePath to prevent traversal attacks.
      const resolvedPath = path.resolve(worktreePath);
      try {
        const stats = await stat(resolvedPath);
        if (!stats.isDirectory()) {
          res.status(400).json({
            success: false,
            error: 'worktreePath is not a directory',
          });
          return;
        }
      } catch {
        res.status(400).json({
          success: false,
          error: 'worktreePath does not exist or is not accessible',
        });
        return;
      }

      // Use the service for stash-aware checkout
      if (stashChanges) {
        const result = await performCheckoutBranch(
          resolvedPath,
          branchName,
          baseBranch,
          {
            stashChanges: true,
            includeUntracked: includeUntracked ?? true,
          },
          events
        );

        if (!result.success) {
          const statusCode = isBranchError(result.error) ? 400 : 500;
          res.status(statusCode).json({
            success: false,
            error: result.error,
            ...(result.stashPopConflicts !== undefined && {
              stashPopConflicts: result.stashPopConflicts,
            }),
            ...(result.stashPopConflictMessage && {
              stashPopConflictMessage: result.stashPopConflictMessage,
            }),
          });
          return;
        }

        res.json({
          success: true,
          result: result.result,
        });
        return;
      }

      // Original simple flow (no stash handling)
      // Fetch latest remote refs before creating the branch so that
      // base branch validation works for remote references like "origin/main"
      await fetchRemotes(resolvedPath);

      const currentBranchOutput = await execGitCommand(
        ['rev-parse', '--abbrev-ref', 'HEAD'],
        resolvedPath
      );
      const currentBranch = currentBranchOutput.trim();

      // Check if branch already exists
      try {
        await execGitCommand(['rev-parse', '--verify', branchName], resolvedPath);
        res.status(400).json({
          success: false,
          error: `Branch '${branchName}' already exists`,
        });
        return;
      } catch {
        // Branch doesn't exist, good to create
      }

      // If baseBranch is provided, verify it exists before using it
      if (baseBranch) {
        try {
          await execGitCommand(['rev-parse', '--verify', baseBranch], resolvedPath);
        } catch {
          res.status(400).json({
            success: false,
            error: `Base branch '${baseBranch}' does not exist`,
          });
          return;
        }
      }

      // Create and checkout the new branch
      const checkoutArgs = ['checkout', '-b', branchName];
      if (baseBranch) {
        checkoutArgs.push(baseBranch);
      }
      await execGitCommand(checkoutArgs, resolvedPath);

      res.json({
        success: true,
        result: {
          previousBranch: currentBranch,
          newBranch: branchName,
          message: `Created and checked out branch '${branchName}'`,
        },
      });
    } catch (error) {
      events?.emit('switch:error', {
        error: getErrorMessage(error),
      });

      logError(error, 'Checkout branch failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

/**
 * Determine whether an error message represents a client error (400).
 * Stash failures are server-side errors and are intentionally excluded here
 * so they are returned as HTTP 500 rather than HTTP 400.
 */
function isBranchError(error?: string): boolean {
  if (!error) return false;
  return error.includes('already exists') || error.includes('does not exist');
}
