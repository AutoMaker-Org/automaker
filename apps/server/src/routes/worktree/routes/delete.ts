/**
 * POST /delete endpoint - Delete a git worktree
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { isGitRepo } from '@automaker/git-utils';
import { getErrorMessage, logError, isValidBranchName, execGitCommand } from '../common.js';
import { createLogger } from '@automaker/utils';

const execAsync = promisify(exec);
const logger = createLogger('Worktree');

export function createDeleteHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, worktreePath, deleteBranch } = req.body as {
        projectPath: string;
        worktreePath: string;
        deleteBranch?: boolean; // Whether to also delete the branch
      };

      if (!projectPath || !worktreePath) {
        res.status(400).json({
          success: false,
          error: 'projectPath and worktreePath required',
        });
        return;
      }

      if (!(await isGitRepo(projectPath))) {
        res.status(400).json({
          success: false,
          error: 'Not a git repository',
        });
        return;
      }

      // Get branch name before removing worktree
      let branchName: string | null = null;
      try {
        const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
          cwd: worktreePath,
        });
        branchName = stdout.trim();
      } catch {
        // Could not get branch name
      }

      // Remove the worktree (using array arguments to prevent injection)
      try {
        await execGitCommand(['worktree', 'remove', worktreePath, '--force'], projectPath);
      } catch (error) {
        // Try with prune if remove fails
        await execGitCommand(['worktree', 'prune'], projectPath);
      }

      // Optionally delete the branch
      let branchDeleted = false;
      if (deleteBranch && branchName && branchName !== 'main' && branchName !== 'master') {
        // Validate branch name to prevent command injection
        if (!isValidBranchName(branchName)) {
          logger.warn(`Invalid branch name detected, skipping deletion: ${branchName}`);
        } else {
          try {
            await execGitCommand(['branch', '-D', branchName], projectPath);
            branchDeleted = true;
          } catch {
            // Branch deletion failed, not critical
            logger.warn(`Failed to delete branch: ${branchName}`);
          }
        }
      }

      res.json({
        success: true,
        deleted: {
          worktreePath,
          branch: branchDeleted ? branchName : null,
          branchDeleted,
        },
      });
    } catch (error) {
      logError(error, 'Delete worktree failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
