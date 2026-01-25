/**
 * POST /push endpoint - Push a worktree branch to remote
 *
 * Note: Git repository validation (isGitRepo, hasCommits) is handled by
 * the requireValidWorktree middleware in index.ts
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getErrorMessage, logError } from '../common.js';

const execAsync = promisify(exec);

export function createPushHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, force, remote } = req.body as {
        worktreePath: string;
        force?: boolean;
        remote?: string;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath required',
        });
        return;
      }

      // Get branch name
      const { stdout: branchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: worktreePath,
      });
      const branchName = branchOutput.trim();

      // Use specified remote or default to 'origin'
      const targetRemote = remote || 'origin';

      // Push the branch
      const forceFlag = force ? '--force' : '';
      try {
        await execAsync(`git push -u ${targetRemote} ${branchName} ${forceFlag}`, {
          cwd: worktreePath,
        });
      } catch {
        // Try setting upstream
        await execAsync(`git push --set-upstream ${targetRemote} ${branchName} ${forceFlag}`, {
          cwd: worktreePath,
        });
      }

      res.json({
        success: true,
        result: {
          branch: branchName,
          pushed: true,
          message: `Successfully pushed ${branchName} to ${targetRemote}`,
        },
      });
    } catch (error) {
      logError(error, 'Push worktree failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
