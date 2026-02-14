/**
 * POST /git-stage endpoint - Stage or unstage files
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { isGitRepo } from '@automaker/git-utils';
import { getErrorMessage, logError } from '../common.js';

const execAsync = promisify(exec);

export function createGitStageHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { repoPath, filePath, action } = req.body as {
        repoPath: string;
        filePath: string;
        action: 'stage' | 'unstage';
      };

      if (!repoPath) {
        res.status(400).json({ success: false, error: 'repoPath is required' });
        return;
      }

      if (!filePath) {
        res.status(400).json({ success: false, error: 'filePath is required' });
        return;
      }

      if (!action || !['stage', 'unstage'].includes(action)) {
        res.status(400).json({ success: false, error: 'action must be "stage" or "unstage"' });
        return;
      }

      const isRepo = await isGitRepo(repoPath);
      if (!isRepo) {
        res.status(400).json({ success: false, error: 'Not a git repository' });
        return;
      }

      const cmd =
        action === 'stage' ? `git add -- "${filePath}"` : `git reset HEAD -- "${filePath}"`;

      await execAsync(cmd, { cwd: repoPath });

      res.json({ success: true });
    } catch (error) {
      logError(error, `Git ${req.body?.action || 'stage'} failed`);
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
