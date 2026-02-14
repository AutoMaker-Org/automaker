/**
 * POST /git-status endpoint - Get git status for a repository
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { isGitRepo, parseGitStatus } from '@automaker/git-utils';
import { getErrorMessage, logError } from '../common.js';

const execAsync = promisify(exec);

export function createGitStatusHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { repoPath } = req.body as { repoPath: string };

      if (!repoPath) {
        res.status(400).json({ success: false, error: 'repoPath is required' });
        return;
      }

      const isRepo = await isGitRepo(repoPath);
      if (!isRepo) {
        res.json({ success: true, isGitRepo: false, files: [] });
        return;
      }

      const { stdout: status } = await execAsync('git status --porcelain', {
        cwd: repoPath,
      });

      const files = parseGitStatus(status);

      res.json({ success: true, isGitRepo: true, files });
    } catch (error) {
      logError(error, 'Git status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
