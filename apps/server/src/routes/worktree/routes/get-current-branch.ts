/**
 * GET /current-branch endpoint - Get the current branch of a project
 */

import type { Request, Response } from 'express';
import { promisify } from 'util';
import { exec } from 'child_process';
import { createLogger } from '@automaker/utils';

const execAsync = promisify(exec);
const logger = createLogger('GetCurrentBranch');

export function createGetCurrentBranchHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as {
        projectPath: string;
      };

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      try {
        const { stdout } = await execAsync('git branch --show-current', { cwd: projectPath });
        const branch = stdout.trim();

        if (!branch) {
          // Might be in detached HEAD state, try to get branch from symbolic-ref
          try {
            const { stdout: refStdout } = await execAsync('git symbolic-ref --short HEAD', {
              cwd: projectPath,
            });
            const refBranch = refStdout.trim();
            if (refBranch) {
              res.json({ success: true, branch: refBranch });
              return;
            }
          } catch {
            // Fall through to default
          }

          // Default to main if we can't determine the branch
          res.json({ success: true, branch: 'main' });
          return;
        }

        res.json({ success: true, branch });
      } catch (error) {
        logger.error('Failed to get current branch:', error);
        // Return main as fallback
        res.json({ success: true, branch: 'main' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Get current branch failed:', message);
      res.status(500).json({ success: false, error: message });
    }
  };
}
