/**
 * POST /diffs endpoint - Get diffs for the main project
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';
import { getGitRepositoryDiffs } from '../../common.js';

export function createDiffsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath required' });
        return;
      }

      try {
        const result = await getGitRepositoryDiffs(projectPath);
        res.json({
          success: true,
          diff: result.diff,
          files: result.files,
          hasChanges: result.hasChanges,
          ...(result.mergeState ? { mergeState: result.mergeState } : {}),
        });
      } catch (innerError) {
        logError(innerError, 'Git diff failed');
        res.json({ success: true, diff: '', files: [], hasChanges: false });
      }
    } catch (error) {
      logError(error, 'Get diffs failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
