/**
 * POST /checkout-branch endpoint - Create and checkout a new branch
 *
 * Note: Git repository validation (isGitRepo, hasCommits) is handled by
 * the requireValidWorktree middleware in index.ts
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getErrorMessage, logError } from '../common.js';

const execAsync = promisify(exec);

export function createCheckoutBranchHandler() {
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

      // Validate branch name (basic validation)
      const invalidChars = /[\s~^:?*\[\\]/;
      if (invalidChars.test(branchName)) {
        res.status(400).json({
          success: false,
          error: 'Branch name contains invalid characters',
        });
        return;
      }

      // Get current branch for reference
      const { stdout: currentBranchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: worktreePath,
      });
      const currentBranch = currentBranchOutput.trim();

      // Check if branch already exists
      try {
        await execAsync(`git rev-parse --verify ${branchName}`, {
          cwd: worktreePath,
        });
        // Branch exists
        res.status(400).json({
          success: false,
          error: `Branch '${branchName}' already exists`,
        });
        return;
      } catch {
        // Branch doesn't exist, good to create
      }

      // Create and checkout the new branch
      await execAsync(`git checkout -b ${branchName}`, {
        cwd: worktreePath,
      });

      res.json({
        success: true,
        result: {
          previousBranch: currentBranch,
          newBranch: branchName,
          message: `Created and checked out branch '${branchName}'`,
        },
      });
    } catch (error) {
      logError(error, 'Checkout branch failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
