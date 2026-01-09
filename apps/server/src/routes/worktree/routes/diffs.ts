/**
 * POST /diffs endpoint - Get diffs for a worktree
 */

import type { Request, Response } from 'express';
import path from 'path';
import * as secureFs from '../../../lib/secure-fs.js';
import { getErrorMessage, logError } from '../common.js';
import { getGitRepositoryDiffs } from '../../common.js';

export function createDiffsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId, useWorktrees } = req.body as {
        projectPath: string;
        featureId: string;
        useWorktrees?: boolean;
      };

      if (!projectPath || !featureId) {
        res.status(400).json({
          success: false,
          error: 'projectPath and featureId required',
        });
        return;
      }

      // If worktrees aren't enabled, don't probe .worktrees at all.
      // This avoids noisy logs that make it look like features are "running in worktrees".
      if (useWorktrees === false) {
        const result = await getGitRepositoryDiffs(projectPath);
        res.json({
          success: true,
          diff: result.diff,
          files: result.files,
          hasChanges: result.hasChanges,
        });
        return;
      }

      // Git worktrees are stored in project directory
      const worktreePath = path.join(projectPath, '.worktrees', featureId);

      try {
        // Check if worktree exists
        await secureFs.access(worktreePath);

        // Get diffs from worktree
        const result = await getGitRepositoryDiffs(worktreePath);
        res.json({
          success: true,
          diff: result.diff,
          files: result.files,
          hasChanges: result.hasChanges,
        });
      } catch (innerError) {
        // Worktree doesn't exist - fallback to main project path
        const code = (innerError as NodeJS.ErrnoException | undefined)?.code;
        // ENOENT is expected when a feature has no worktree; don't log as an error.
        if (code && code !== 'ENOENT') {
          logError(innerError, 'Worktree access failed, falling back to main project');
        }

        try {
          const result = await getGitRepositoryDiffs(projectPath);
          res.json({
            success: true,
            diff: result.diff,
            files: result.files,
            hasChanges: result.hasChanges,
          });
        } catch (fallbackError) {
          logError(fallbackError, 'Fallback to main project also failed');
          res.json({ success: true, diff: '', files: [], hasChanges: false });
        }
      }
    } catch (error) {
      logError(error, 'Get worktree diffs failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
