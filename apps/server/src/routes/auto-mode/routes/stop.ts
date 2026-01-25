/**
 * POST /stop endpoint - Stop auto mode loop for a project
 */

import type { Request, Response } from 'express';
import type { AutoModeService } from '../../../services/auto-mode-service.js';
import { createLogger } from '@automaker/utils';
import { getErrorMessage, logError } from '../common.js';

const logger = createLogger('AutoMode');

export function createStopHandler(autoModeService: AutoModeService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, branchName } = req.body as {
        projectPath: string;
        branchName?: string | null;
      };

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      // Normalize branchName: undefined becomes null
      const normalizedBranchName = branchName ?? null;
      const worktreeDesc = normalizedBranchName
        ? `worktree ${normalizedBranchName}`
        : 'main worktree';

      // Check if running
      if (!autoModeService.isAutoLoopRunningForProject(projectPath, normalizedBranchName)) {
        res.json({
          success: true,
          message: `Auto mode is not running for ${worktreeDesc}`,
          wasRunning: false,
          branchName: normalizedBranchName,
        });
        return;
      }

      // Stop the auto loop for this project/worktree
      const runningCount = await autoModeService.stopAutoLoopForProject(
        projectPath,
        normalizedBranchName
      );

      logger.info(
        `Stopped auto loop for ${worktreeDesc} in project: ${projectPath}, ${runningCount} features still running`
      );

      res.json({
        success: true,
        message: 'Auto mode stopped',
        runningFeaturesCount: runningCount,
        branchName: normalizedBranchName,
      });
    } catch (error) {
      logError(error, 'Stop auto mode failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
