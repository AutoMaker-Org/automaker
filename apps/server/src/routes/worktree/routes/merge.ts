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
import { mergeWorktreeBranch, cleanupWorktree } from '@automaker/git-utils';

export function createMergeHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, branchName, worktreePath, targetBranch, options } = req.body as {
        projectPath: string;
        branchName: string;
        worktreePath: string;
        targetBranch?: string; // Branch to merge into (defaults to 'main')
        options?: { squash?: boolean; message?: string; deleteWorktreeAndBranch?: boolean };
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

      // Merge using shared utility
      const result = await mergeWorktreeBranch(projectPath, branchName, mergeTo, {
        squash: options?.squash,
        message: options?.message,
      });

      if (!result.success) {
        if (result.hasConflicts) {
          res.status(409).json({
            success: false,
            error: result.error,
            hasConflicts: true,
          });
          return;
        }

        res.status(400).json({
          success: false,
          error: result.error,
        });
        return;
      }

      // Optionally delete the worktree and branch after merging
      let deleted: { worktreeDeleted: boolean; branchDeleted: boolean } | undefined;

      if (options?.deleteWorktreeAndBranch) {
        deleted = await cleanupWorktree(projectPath, worktreePath, branchName);
      }

      res.json({
        success: true,
        mergedBranch: branchName,
        targetBranch: mergeTo,
        deleted,
      });
    } catch (error) {
      logError(error, 'Merge worktree failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
