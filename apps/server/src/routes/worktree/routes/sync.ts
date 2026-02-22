/**
 * POST /sync endpoint - Pull then push a worktree branch
 *
 * Performs a full sync operation: pull latest from remote, then push
 * local commits. Handles divergence automatically.
 *
 * Git business logic is delegated to sync-service.ts.
 *
 * Note: Git repository validation (isGitRepo, hasCommits) is handled by
 * the requireValidWorktree middleware in index.ts
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';
import { performSync } from '../../../services/sync-service.js';

export function createSyncHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, remote } = req.body as {
        worktreePath: string;
        remote?: string;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath required',
        });
        return;
      }

      const result = await performSync(worktreePath, { remote });

      if (!result.success) {
        const statusCode = result.hasConflicts ? 409 : 500;
        res.status(statusCode).json({
          success: false,
          error: result.error,
          hasConflicts: result.hasConflicts,
          conflictFiles: result.conflictFiles,
          conflictSource: result.conflictSource,
          pulled: result.pulled,
          pushed: result.pushed,
        });
        return;
      }

      res.json({
        success: true,
        result: {
          branch: result.branch,
          pulled: result.pulled,
          pushed: result.pushed,
          isFastForward: result.isFastForward,
          isMerge: result.isMerge,
          autoResolved: result.autoResolved,
          message: result.message,
        },
      });
    } catch (error) {
      logError(error, 'Sync worktree failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
