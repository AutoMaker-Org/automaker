/**
 * POST /rebase endpoint - Rebase the current branch onto a target branch
 *
 * Rebases the current worktree branch onto a specified target branch
 * (e.g., origin/main) for a linear history. Detects conflicts and
 * returns structured conflict information for AI-assisted resolution.
 *
 * Git business logic is delegated to rebase-service.ts.
 * Events are emitted at key lifecycle points for WebSocket subscribers.
 *
 * Note: Git repository validation (isGitRepo, hasCommits) is handled by
 * the requireValidWorktree middleware in index.ts
 */

import type { Request, Response } from 'express';
import path from 'path';
import { getErrorMessage, logError, isValidBranchName, isValidRemoteName } from '../common.js';
import type { EventEmitter } from '../../../lib/events.js';
import { runRebase } from '../../../services/rebase-service.js';

export function createRebaseHandler(events: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, ontoBranch, remote } = req.body as {
        worktreePath: string;
        /** The branch/ref to rebase onto (e.g., 'origin/main', 'main') */
        ontoBranch: string;
        /** Remote name to fetch from before rebasing (defaults to 'origin') */
        remote?: string;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath is required',
        });
        return;
      }

      if (!ontoBranch) {
        res.status(400).json({
          success: false,
          error: 'ontoBranch is required',
        });
        return;
      }

      // Normalize the path to prevent path traversal and ensure consistent paths
      const resolvedWorktreePath = path.resolve(worktreePath);

      // Validate the branch name (allow remote refs like origin/main)
      if (!isValidBranchName(ontoBranch)) {
        res.status(400).json({
          success: false,
          error: `Invalid branch name: "${ontoBranch}"`,
        });
        return;
      }

      // Validate optional remote name to reject unsafe characters at the route layer
      if (remote !== undefined && !isValidRemoteName(remote)) {
        res.status(400).json({
          success: false,
          error: `Invalid remote name: "${remote}"`,
        });
        return;
      }

      // Emit started event
      events.emit('rebase:started', {
        worktreePath: resolvedWorktreePath,
        ontoBranch,
      });

      // Execute the rebase via the service
      const result = await runRebase(resolvedWorktreePath, ontoBranch, { remote });

      if (result.success) {
        // Emit success event
        events.emit('rebase:success', {
          worktreePath: resolvedWorktreePath,
          branch: result.branch,
          ontoBranch: result.ontoBranch,
        });

        res.json({
          success: true,
          result: {
            branch: result.branch,
            ontoBranch: result.ontoBranch,
            message: result.message,
          },
        });
      } else if (result.hasConflicts) {
        // Emit conflict event
        events.emit('rebase:conflict', {
          worktreePath: resolvedWorktreePath,
          ontoBranch,
          conflictFiles: result.conflictFiles,
          aborted: result.aborted,
        });

        res.status(409).json({
          success: false,
          error: result.error,
          hasConflicts: true,
          conflictFiles: result.conflictFiles,
          aborted: result.aborted,
        });
      } else {
        // Emit failure event for non-conflict failures
        events.emit('rebase:failure', {
          worktreePath: resolvedWorktreePath,
          branch: result.branch,
          ontoBranch: result.ontoBranch,
          error: result.error,
        });

        res.status(500).json({
          success: false,
          error: result.error ?? 'Rebase failed',
          hasConflicts: false,
        });
      }
    } catch (error) {
      // Emit failure event
      events.emit('rebase:failure', {
        error: getErrorMessage(error),
      });

      logError(error, 'Rebase failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
