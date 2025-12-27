/**
 * POST /pull endpoint - Pull latest changes for a worktree/branch
 *
 * Note: Git repository validation (isGitRepo, hasCommits) is handled by
 * the requireValidWorktree middleware in index.ts
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getErrorMessage, logError } from '../common.js';

const execAsync = promisify(exec);

export function createPullHandler() {
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

      // Get current branch name
      const { stdout: branchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: worktreePath,
      });
      const branchName = branchOutput.trim();

      // Fetch latest from remote
      await execAsync('git fetch origin', { cwd: worktreePath });

      // Check if there are local changes that would be overwritten
      const { stdout: status } = await execAsync('git status --porcelain', {
        cwd: worktreePath,
      });
      const hasLocalChanges = status.trim().length > 0;

      if (hasLocalChanges) {
        res.status(400).json({
          success: false,
          error: 'You have local changes. Please commit them before pulling.',
        });
        return;
      }

      // Pull latest changes
      try {
        const { stdout: pullOutput } = await execAsync(`git pull origin ${branchName}`, {
          cwd: worktreePath,
        });

        // Check if we pulled any changes
        const alreadyUpToDate = pullOutput.includes('Already up to date');

        res.json({
          success: true,
          result: {
            branch: branchName,
            pulled: !alreadyUpToDate,
            message: alreadyUpToDate ? 'Already up to date' : 'Pulled latest changes',
          },
        });
      } catch (pullError: unknown) {
        const err = pullError as { stderr?: string; message?: string };
        const errorMsg = err.stderr || err.message || 'Pull failed';

        // Check for common errors
        if (errorMsg.includes('no tracking information')) {
          res.status(400).json({
            success: false,
            error: `Branch '${branchName}' has no upstream branch. Push it first or set upstream with: git branch --set-upstream-to=origin/${branchName}`,
          });
          return;
        }

        res.status(500).json({
          success: false,
          error: errorMsg,
        });
      }
    } catch (error) {
      logError(error, 'Pull failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
