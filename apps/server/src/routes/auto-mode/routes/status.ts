/**
 * POST /status endpoint - Get auto mode status
 *
 * If projectPath is provided, returns per-project status including autoloop state.
 * If no projectPath, returns global status for backward compatibility.
 */

import type { Request, Response } from 'express';
import type { AutoModeServiceCompat } from '../../../services/auto-mode/index.js';
import { getErrorMessage, logError } from '../common.js';

/**
 * Create status handler.
 */
export function createStatusHandler(autoModeService: AutoModeServiceCompat) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, branchName } = req.body as {
        projectPath?: string;
        branchName?: string | null;
      };

      // If projectPath is provided, return per-project/worktree status
      if (projectPath) {
        // Normalize branchName: undefined becomes null
        const normalizedBranchName = branchName ?? null;

        const projectStatus = await autoModeService.getStatusForProject(
          projectPath,
          normalizedBranchName
        );
        res.json({
          success: true,
          isRunning: projectStatus.runningCount > 0,
          isAutoLoopRunning: projectStatus.isAutoLoopRunning,
          runningFeatures: projectStatus.runningFeatures,
          runningCount: projectStatus.runningCount,
          maxConcurrency: projectStatus.maxConcurrency,
          projectPath,
          branchName: normalizedBranchName,
        });
        return;
      }

      // Global status for backward compatibility
      const status = autoModeService.getStatus();
      const activeProjects = autoModeService.getActiveAutoLoopProjects();
      const activeWorktrees = autoModeService.getActiveAutoLoopWorktrees();
      res.json({
        success: true,
        ...status,
        activeAutoLoopProjects: activeProjects,
        activeAutoLoopWorktrees: activeWorktrees,
      });
    } catch (error) {
      logError(error, 'Get status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
