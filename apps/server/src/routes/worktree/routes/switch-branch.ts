/**
 * POST /switch-branch endpoint - Switch to an existing branch
 *
 * Handles branch switching with automatic stash/reapply of local changes.
 * If there are uncommitted changes, they are stashed before switching and
 * reapplied after. If the stash pop results in merge conflicts, returns
 * a special response code so the UI can create a conflict resolution task.
 *
 * For remote branches (e.g., "origin/feature"), automatically creates a
 * local tracking branch and checks it out.
 *
 * Also fetches the latest remote refs before switching to ensure accurate branch detection.
 *
 * Git business logic is delegated to worktree-branch-service.ts.
 * Events are emitted at key lifecycle points for WebSocket subscribers.
 *
 * Note: Git repository validation (isGitRepo, hasCommits) is handled by
 * the requireValidWorktree middleware in index.ts
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError, isValidBranchName } from '../common.js';
import type { EventEmitter } from '../../../lib/events.js';
import { performSwitchBranch } from '../../../services/worktree-branch-service.js';

export function createSwitchBranchHandler(events?: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, branchName } = req.body as {
        worktreePath: string;
        branchName: string;
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

      // Validate branch name using shared allowlist to prevent Git option injection
      if (!isValidBranchName(branchName)) {
        res.status(400).json({
          success: false,
          error: 'Invalid branch name',
        });
        return;
      }

      // Execute the branch switch via the service
      const result = await performSwitchBranch(worktreePath, branchName, events);

      // Map service result to HTTP response
      if (!result.success) {
        // Determine status code based on error type
        const statusCode = isBranchNotFoundError(result.error) ? 400 : 500;
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
    } catch (error) {
      events?.emit('switch:error', {
        error: getErrorMessage(error),
      });

      logError(error, 'Switch branch failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

/**
 * Determine whether an error message represents a client error (400)
 * vs a server error (500).
 *
 * Client errors are validation issues like non-existent branches or
 * unparseable remote branch names.
 */
function isBranchNotFoundError(error?: string): boolean {
  if (!error) return false;
  return error.includes('does not exist') || error.includes('Failed to parse remote branch name');
}
