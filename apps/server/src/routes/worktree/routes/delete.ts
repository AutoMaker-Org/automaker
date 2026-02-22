/**
 * POST /delete endpoint - Delete a git worktree
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import { isGitRepo } from '@automaker/git-utils';
import { getErrorMessage, logError, isValidBranchName } from '../common.js';
import { execGitCommand } from '../../../lib/git.js';
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
        // Could not get branch name - worktree directory may already be gone
        logger.debug('Could not determine branch for worktree, directory may be missing');
      }

      // Remove the worktree (using array arguments to prevent injection)
      let removeSucceeded = false;
      try {
        await execGitCommand(['worktree', 'remove', worktreePath, '--force'], projectPath);
        removeSucceeded = true;
      } catch (removeError) {
        // `git worktree remove` can fail if the directory is already missing
        // or in a bad state. Try pruning stale worktree entries as a fallback.
        logger.debug('git worktree remove failed, trying prune', {
          error: getErrorMessage(removeError),
        });
        try {
          await execGitCommand(['worktree', 'prune'], projectPath);

          // Verify the specific worktree is no longer registered after prune.
          // `git worktree prune` exits 0 even if worktreePath was never registered,
          // so we must explicitly check the worktree list to avoid false positives.
          const { stdout: listOut } = await execAsync('git worktree list --porcelain', {
            cwd: projectPath,
          });
          // Parse porcelain output and check for an exact path match.
          // Using substring .includes() can produce false positives when one
          // worktree path is a prefix of another (e.g. /foo vs /foobar).
          const stillRegistered = listOut
            .split('\n')
            .filter((line) => line.startsWith('worktree '))
            .map((line) => line.slice('worktree '.length).trim())
            .some((registeredPath) => registeredPath === worktreePath);
          if (stillRegistered) {
            // Prune didn't clean up our entry - treat as failure
            throw removeError;
          }
          removeSucceeded = true;
        } catch (pruneError) {
          // If pruneError is the original removeError re-thrown, propagate it
          if (pruneError === removeError) {
            throw removeError;
          }
          logger.warn('git worktree prune also failed', {
            error: getErrorMessage(pruneError),
          });
          // If both remove and prune fail, still try to return success
          // if the worktree directory no longer exists (it may have been
          // manually deleted already).
          let dirExists = false;
          try {
            await fs.access(worktreePath);
            dirExists = true;
          } catch {
            // Directory doesn't exist
          }
          if (dirExists) {
            // Directory still exists - this is a real failure
            throw removeError;
          }
          // Directory is gone, treat as success
          removeSucceeded = true;
        }
      }

      // Optionally delete the branch (only if worktree was successfully removed)
      let branchDeleted = false;
      if (
        removeSucceeded &&
        deleteBranch &&
        branchName &&
        branchName !== 'main' &&
        branchName !== 'master'
      ) {
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
