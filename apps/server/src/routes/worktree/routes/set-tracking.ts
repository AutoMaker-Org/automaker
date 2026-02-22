/**
 * POST /set-tracking endpoint - Set the upstream tracking branch for a worktree
 *
 * Sets `git branch --set-upstream-to=<remote>/<branch>` for the current branch.
 *
 * Note: Git repository validation (isGitRepo, hasCommits) is handled by
 * the requireValidWorktree middleware in index.ts
 */

import type { Request, Response } from 'express';
import { execGitCommand } from '@automaker/git-utils';
import { getErrorMessage, logError } from '../common.js';
import { getCurrentBranch } from '../../../lib/git.js';

export function createSetTrackingHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, remote, branch } = req.body as {
        worktreePath: string;
        remote: string;
        branch?: string;
      };

      if (!worktreePath) {
        res.status(400).json({ success: false, error: 'worktreePath required' });
        return;
      }

      if (!remote) {
        res.status(400).json({ success: false, error: 'remote required' });
        return;
      }

      // Get current branch if not provided
      let targetBranch = branch;
      if (!targetBranch) {
        try {
          targetBranch = await getCurrentBranch(worktreePath);
        } catch (err) {
          res.status(400).json({
            success: false,
            error: `Failed to get current branch: ${getErrorMessage(err)}`,
          });
          return;
        }

        if (targetBranch === 'HEAD') {
          res.status(400).json({
            success: false,
            error: 'Cannot set tracking in detached HEAD state.',
          });
          return;
        }
      }

      // Set upstream tracking (pass local branch name as final arg to be explicit)
      await execGitCommand(
        ['branch', '--set-upstream-to', `${remote}/${targetBranch}`, targetBranch],
        worktreePath
      );

      res.json({
        success: true,
        result: {
          branch: targetBranch,
          remote,
          upstream: `${remote}/${targetBranch}`,
          message: `Set tracking branch to ${remote}/${targetBranch}`,
        },
      });
    } catch (error) {
      logError(error, 'Set tracking branch failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
