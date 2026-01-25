/**
 * POST /info endpoint - Get worktree info
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import * as secureFs from '../../../lib/secure-fs.js';
import { getErrorMessage, logError, normalizePath } from '../common.js';

const execAsync = promisify(exec);

export function createInfoHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId } = req.body as {
        projectPath: string;
        featureId: string;
      };

      if (!projectPath || !featureId) {
        res.status(400).json({
          success: false,
          error: 'projectPath and featureId required',
        });
        return;
      }

      // Check if worktree exists (git worktrees are stored in project directory)
      // Sanitize featureId the same way it's sanitized when creating worktrees
      // (see create.ts: branchName.replace(/[^a-zA-Z0-9_-]/g, '-'))
      const sanitizedFeatureId = featureId.replace(/[^a-zA-Z0-9_-]/g, '-');
      const worktreePath = path.join(projectPath, '.worktrees', sanitizedFeatureId);
      try {
        await secureFs.access(worktreePath);
        const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
          cwd: worktreePath,
        });
        res.json({
          success: true,
          worktreePath: normalizePath(worktreePath),
          branchName: stdout.trim(),
        });
      } catch {
        res.json({ success: true, worktreePath: null, branchName: null });
      }
    } catch (error) {
      logError(error, 'Get worktree info failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
