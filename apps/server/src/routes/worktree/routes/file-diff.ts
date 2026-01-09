/**
 * POST /file-diff endpoint - Get diff for a specific file
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import * as secureFs from '../../../lib/secure-fs.js';
import { getErrorMessage, logError } from '../common.js';
import { generateSyntheticDiffForNewFile } from '../../common.js';

const execAsync = promisify(exec);

export function createFileDiffHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId, filePath, useWorktrees } = req.body as {
        projectPath: string;
        featureId: string;
        filePath: string;
        useWorktrees?: boolean;
      };

      if (!projectPath || !featureId || !filePath) {
        res.status(400).json({
          success: false,
          error: 'projectPath, featureId, and filePath required',
        });
        return;
      }

      // If worktrees aren't enabled, don't probe .worktrees at all.
      if (useWorktrees === false) {
        res.json({ success: true, diff: '', filePath });
        return;
      }

      // Git worktrees are stored in project directory
      const worktreePath = path.join(projectPath, '.worktrees', featureId);

      try {
        await secureFs.access(worktreePath);

        // First check if the file is untracked
        const { stdout: status } = await execAsync(`git status --porcelain -- "${filePath}"`, {
          cwd: worktreePath,
        });

        const isUntracked = status.trim().startsWith('??');

        let diff: string;
        if (isUntracked) {
          // Generate synthetic diff for untracked file
          diff = await generateSyntheticDiffForNewFile(worktreePath, filePath);
        } else {
          // Use regular git diff for tracked files
          const result = await execAsync(`git diff HEAD -- "${filePath}"`, {
            cwd: worktreePath,
            maxBuffer: 10 * 1024 * 1024,
          });
          diff = result.stdout;
        }

        res.json({ success: true, diff, filePath });
      } catch (innerError) {
        const code = (innerError as NodeJS.ErrnoException | undefined)?.code;
        // ENOENT is expected when a feature has no worktree; don't log as an error.
        if (code && code !== 'ENOENT') {
          logError(innerError, 'Worktree file diff failed');
        }
        res.json({ success: true, diff: '', filePath });
      }
    } catch (error) {
      logError(error, 'Get worktree file diff failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
