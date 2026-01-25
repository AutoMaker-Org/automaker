/**
 * POST /merge endpoint - Merge feature (merge worktree branch into a target branch)
 *
 * Allows merging a worktree branch into any target branch (defaults to 'main').
 *
 * Note: Git repository validation (isGitRepo, hasCommits) is handled by
 * the requireValidProject middleware in index.ts
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getErrorMessage, logError, isValidBranchName, execGitCommand } from '../common.js';
import { createLogger } from '@automaker/utils';

const execAsync = promisify(exec);
const logger = createLogger('Worktree');

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

      // Validate source branch exists
      try {
        await execAsync(`git rev-parse --verify ${branchName}`, { cwd: projectPath });
      } catch {
        res.status(400).json({
          success: false,
          error: `Branch "${branchName}" does not exist`,
        });
        return;
      }

      // Validate target branch exists
      try {
        await execAsync(`git rev-parse --verify ${mergeTo}`, { cwd: projectPath });
      } catch {
        res.status(400).json({
          success: false,
          error: `Target branch "${mergeTo}" does not exist`,
        });
        return;
      }

      // Merge the feature branch into the target branch
      const mergeCmd = options?.squash
        ? `git merge --squash ${branchName}`
        : `git merge ${branchName} -m "${options?.message || `Merge ${branchName} into ${mergeTo}`}"`;

      try {
        await execAsync(mergeCmd, { cwd: projectPath });
      } catch (mergeError: unknown) {
        // Check if this is a merge conflict
        const err = mergeError as { stdout?: string; stderr?: string; message?: string };
        const output = `${err.stdout || ''} ${err.stderr || ''} ${err.message || ''}`;
        const hasConflicts =
          output.includes('CONFLICT') || output.includes('Automatic merge failed');

        if (hasConflicts) {
          // Return conflict-specific error message that frontend can detect
          res.status(409).json({
            success: false,
            error: `Merge CONFLICT: Automatic merge of "${branchName}" into "${mergeTo}" failed. Please resolve conflicts manually.`,
            hasConflicts: true,
          });
          return;
        }

        // Re-throw non-conflict errors to be handled by outer catch
        throw mergeError;
      }

      // If squash merge, need to commit
      if (options?.squash) {
        await execAsync(`git commit -m "${options?.message || `Merge ${branchName} (squash)`}"`, {
          cwd: projectPath,
        });
      }

      // Optionally delete the worktree and branch after merging
      let worktreeDeleted = false;
      let branchDeleted = false;

      if (options?.deleteWorktreeAndBranch) {
        // Remove the worktree
        try {
          await execGitCommand(['worktree', 'remove', worktreePath, '--force'], projectPath);
          worktreeDeleted = true;
        } catch {
          // Try with prune if remove fails
          try {
            await execGitCommand(['worktree', 'prune'], projectPath);
            worktreeDeleted = true;
          } catch {
            logger.warn(`Failed to remove worktree: ${worktreePath}`);
          }
        }

        // Delete the branch (but not main/master)
        if (branchName !== 'main' && branchName !== 'master') {
          if (!isValidBranchName(branchName)) {
            logger.warn(`Invalid branch name detected, skipping deletion: ${branchName}`);
          } else {
            try {
              await execGitCommand(['branch', '-D', branchName], projectPath);
              branchDeleted = true;
            } catch {
              logger.warn(`Failed to delete branch: ${branchName}`);
            }
          }
        }
      }

      res.json({
        success: true,
        mergedBranch: branchName,
        targetBranch: mergeTo,
        deleted: options?.deleteWorktreeAndBranch ? { worktreeDeleted, branchDeleted } : undefined,
      });
    } catch (error) {
      logError(error, 'Merge worktree failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
