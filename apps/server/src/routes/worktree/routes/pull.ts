/**
 * POST /pull endpoint - Pull latest changes for a worktree/branch
 *
 * Enhanced pull flow with stash management and conflict detection:
 * 1. Checks for uncommitted local changes (staged and unstaged)
 * 2. If local changes exist AND stashIfNeeded is true, automatically stashes them
 * 3. Performs the git pull
 * 4. If changes were stashed, attempts to reapply via git stash pop
 * 5. Detects merge conflicts from both pull and stash reapplication
 * 6. Returns structured conflict information for AI-assisted resolution
 *
 * Git business logic is delegated to pull-service.ts.
 *
 * Note: Git repository validation (isGitRepo, hasCommits) is handled by
 * the requireValidWorktree middleware in index.ts
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';
import { performPull } from '../../../services/pull-service.js';
import type { PullResult } from '../../../services/pull-service.js';

export function createPullHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, remote, stashIfNeeded } = req.body as {
        worktreePath: string;
        remote?: string;
        /** When true, automatically stash local changes before pulling and reapply after */
        stashIfNeeded?: boolean;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath required',
        });
        return;
      }

      // Execute the pull via the service
      const result = await performPull(worktreePath, { remote, stashIfNeeded });

      // Map service result to HTTP response
      mapResultToResponse(res, result);
    } catch (error) {
      logError(error, 'Pull failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

/**
 * Map a PullResult from the service to the appropriate HTTP response.
 *
 * - Successful results (including local-changes-detected info) → 200
 * - Validation/state errors (detached HEAD, no upstream) → 400
 * - Operational errors (fetch/stash/pull failures) → 500
 */
function mapResultToResponse(res: Response, result: PullResult): void {
  if (!result.success && result.error) {
    // Determine the appropriate HTTP status for errors
    const statusCode = isClientError(result.error) ? 400 : 500;
    res.status(statusCode).json({
      success: false,
      error: result.error,
      ...(result.stashRecoveryFailed && { stashRecoveryFailed: true }),
    });
    return;
  }

  // Success case (includes partial success like local changes detected, conflicts, etc.)
  res.json({
    success: true,
    result: {
      branch: result.branch,
      pulled: result.pulled,
      hasLocalChanges: result.hasLocalChanges,
      localChangedFiles: result.localChangedFiles,
      hasConflicts: result.hasConflicts,
      conflictSource: result.conflictSource,
      conflictFiles: result.conflictFiles,
      stashed: result.stashed,
      stashRestored: result.stashRestored,
      message: result.message,
      isMerge: result.isMerge,
      isFastForward: result.isFastForward,
      mergeAffectedFiles: result.mergeAffectedFiles,
    },
  });
}

/**
 * Determine whether an error message represents a client error (400)
 * vs a server error (500).
 *
 * Client errors are validation issues or invalid git state that the user
 * needs to resolve (e.g. detached HEAD, no upstream, no tracking info).
 */
function isClientError(errorMessage: string): boolean {
  return (
    errorMessage.includes('detached HEAD') ||
    errorMessage.includes('has no upstream branch') ||
    errorMessage.includes('no tracking information')
  );
}
