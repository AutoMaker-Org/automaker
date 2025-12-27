/**
 * POST /switch-branch endpoint - Switch to an existing branch
 *
 * Simple branch switching.
 * If there are uncommitted changes, the switch will fail and
 * the user should commit first.
 *
 * Note: Git repository validation (isGitRepo, hasCommits) is handled by
 * the requireValidWorktree middleware in index.ts
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getErrorMessage, logError } from '../common.js';

const execAsync = promisify(exec);

/**
 * Check if there are uncommitted changes in the working directory
 * Excludes .worktrees/ directory which is created by automaker
 */
async function hasUncommittedChanges(cwd: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync('git status --porcelain', { cwd });
    const lines = stdout
      .trim()
      .split('\n')
      .filter((line) => {
        if (!line.trim()) return false;
        // Exclude .worktrees/ directory (created by automaker)
        if (line.includes('.worktrees/') || line.endsWith('.worktrees')) return false;
        return true;
      });
    return lines.length > 0;
  } catch {
    return false;
  }
}

/**
 * Get a summary of uncommitted changes for user feedback
 * Excludes .worktrees/ directory
 */
async function getChangesSummary(cwd: string): Promise<string> {
  try {
    const { stdout } = await execAsync('git status --short', { cwd });
    const lines = stdout
      .trim()
      .split('\n')
      .filter((line) => {
        if (!line.trim()) return false;
        // Exclude .worktrees/ directory
        if (line.includes('.worktrees/') || line.endsWith('.worktrees')) return false;
        return true;
      });
    if (lines.length === 0) return '';
    if (lines.length <= 5) return lines.join(', ');
    return `${lines.slice(0, 5).join(', ')} and ${lines.length - 5} more files`;
  } catch {
    return 'unknown changes';
  }
}

export function createSwitchBranchHandler() {
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

      // Get current branch
      const { stdout: currentBranchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: worktreePath,
      });
      const previousBranch = currentBranchOutput.trim();

      if (previousBranch === branchName) {
        res.json({
          success: true,
          result: {
            previousBranch,
            currentBranch: branchName,
            message: `Already on branch '${branchName}'`,
          },
        });
        return;
      }

      // Check if branch exists
      try {
        await execAsync(`git rev-parse --verify ${branchName}`, {
          cwd: worktreePath,
        });
      } catch {
        res.status(400).json({
          success: false,
          error: `Branch '${branchName}' does not exist`,
        });
        return;
      }

      // Check for uncommitted changes
      if (await hasUncommittedChanges(worktreePath)) {
        const summary = await getChangesSummary(worktreePath);
        res.status(400).json({
          success: false,
          error: `Cannot switch branches: you have uncommitted changes (${summary}). Please commit your changes first.`,
          code: 'UNCOMMITTED_CHANGES',
        });
        return;
      }

      // Switch to the target branch
      await execAsync(`git checkout "${branchName}"`, { cwd: worktreePath });

      res.json({
        success: true,
        result: {
          previousBranch,
          currentBranch: branchName,
          message: `Switched to branch '${branchName}'`,
        },
      });
    } catch (error) {
      logError(error, 'Switch branch failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
