/**
 * POST /discard-changes endpoint - Discard all uncommitted changes in a worktree
 *
 * This performs a destructive operation that:
 * 1. Resets staged changes (git reset HEAD)
 * 2. Discards modified tracked files (git checkout .)
 * 3. Removes untracked files and directories (git clean -fd)
 *
 * Note: Git repository validation (isGitRepo) is handled by
 * the requireGitRepoOnly middleware in index.ts
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getErrorMessage, logError } from '../common.js';

const execAsync = promisify(exec);

export function createDiscardChangesHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath } = req.body as {
        worktreePath: string;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath required',
        });
        return;
      }

      // Check for uncommitted changes first
      const { stdout: status } = await execAsync('git status --porcelain', {
        cwd: worktreePath,
      });

      if (!status.trim()) {
        res.json({
          success: true,
          result: {
            discarded: false,
            message: 'No changes to discard',
          },
        });
        return;
      }

      // Count the files that will be affected
      const lines = status.trim().split('\n').filter(Boolean);
      const fileCount = lines.length;

      // Get branch name before discarding
      const { stdout: branchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: worktreePath,
      });
      const branchName = branchOutput.trim();

      // Discard all changes:
      // 1. Reset any staged changes
      await execAsync('git reset HEAD', { cwd: worktreePath }).catch(() => {
        // Ignore errors - might fail if there's nothing staged
      });

      // 2. Discard changes in tracked files
      await execAsync('git checkout .', { cwd: worktreePath }).catch(() => {
        // Ignore errors - might fail if there are no tracked changes
      });

      // 3. Remove untracked files and directories
      await execAsync('git clean -fd', { cwd: worktreePath }).catch(() => {
        // Ignore errors - might fail if there are no untracked files
      });

      // Verify all changes were discarded
      const { stdout: finalStatus } = await execAsync('git status --porcelain', {
        cwd: worktreePath,
      });

      if (finalStatus.trim()) {
        // Some changes couldn't be discarded (possibly ignored files or permission issues)
        const remainingCount = finalStatus.trim().split('\n').filter(Boolean).length;
        res.json({
          success: true,
          result: {
            discarded: true,
            filesDiscarded: fileCount - remainingCount,
            filesRemaining: remainingCount,
            branch: branchName,
            message: `Discarded ${fileCount - remainingCount} files, ${remainingCount} files could not be removed`,
          },
        });
      } else {
        res.json({
          success: true,
          result: {
            discarded: true,
            filesDiscarded: fileCount,
            filesRemaining: 0,
            branch: branchName,
            message: `Discarded ${fileCount} ${fileCount === 1 ? 'file' : 'files'}`,
          },
        });
      }
    } catch (error) {
      logError(error, 'Discard changes failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
