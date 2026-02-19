/**
 * POST /merge endpoint - Merge feature (merge worktree branch into a target branch)
 *
 * Allows merging a worktree branch into any target branch (defaults to 'main').
 *
 * Note: Git repository validation (isGitRepo, hasCommits) is handled by
 * the requireValidProject middleware in index.ts
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';
import type { EventEmitter } from '../../../lib/events.js';
import { performMerge } from '../../../services/merge-service.js';

export function createMergeHandler(events: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, branchName, worktreePath, targetBranch, options } = req.body as {
        projectPath: string;
        branchName: string;
        worktreePath: string;
        targetBranch?: string; // Branch to merge into (defaults to 'main')
        options?: {
          squash?: boolean;
          message?: string;
          deleteWorktreeAndBranch?: boolean;
          remote?: string;
        };
      };

      if (!projectPath || !branchName || !worktreePath) {
        res.status(400).json({
          success: false,
          error: 'projectPath, branchName, and worktreePath are required',
        });
        return;
      }

      // Determine the target branch (default to 'main')
      const mergeTo = targetBranch || 'main';

      // Delegate all merge logic to the service
      const result = await performMerge(
        projectPath,
        branchName,
        worktreePath,
        mergeTo,
        options,
        events
      );

      if (!result.success) {
        if (result.hasConflicts) {
          // Return conflict-specific error message that frontend can detect
          res.status(409).json({
            success: false,
            error: result.error,
            hasConflicts: true,
            conflictFiles: result.conflictFiles,
          });
          return;
        }

        // Non-conflict service errors (e.g. branch not found, invalid name)
        res.status(400).json({
          success: false,
          error: result.error,
        });
        return;
      }

      res.json({
        success: true,
        mergedBranch: result.mergedBranch,
        targetBranch: result.targetBranch,
        deleted: result.deleted,
      });
    } catch (error) {
      logError(error, 'Merge worktree failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
