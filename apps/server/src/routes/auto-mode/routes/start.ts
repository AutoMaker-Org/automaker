/**
 * POST /start endpoint - Start auto mode loop for a project
 */

import type { Request, Response } from 'express';
import type { AutoModeService } from '../../../services/auto-mode-service.js';
import { createLogger } from '@automaker/utils';
import { getErrorMessage, logError } from '../common.js';

const logger = createLogger('AutoMode');

export function createStartHandler(autoModeService: AutoModeService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, branchName, maxConcurrency } = req.body as {
        projectPath: string;
        branchName?: string | null;
        maxConcurrency?: number;
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

      // Check if already running
      if (autoModeService.isAutoLoopRunningForProject(projectPath, normalizedBranchName)) {
        res.json({
          success: true,
          message: `Auto mode is already running for ${worktreeDesc}`,
          alreadyRunning: true,
          branchName: normalizedBranchName,
        });
        return;
      }

      // Start the auto loop for this project/worktree
      const resolvedMaxConcurrency = await autoModeService.startAutoLoopForProject(
        projectPath,
        normalizedBranchName,
        maxConcurrency
      );

      logger.info(
        `Started auto loop for ${worktreeDesc} in project: ${projectPath} with maxConcurrency: ${resolvedMaxConcurrency}`
      );

      res.json({
        success: true,
        message: `Auto mode started with max ${resolvedMaxConcurrency} concurrent features`,
        branchName: normalizedBranchName,
      });
    } catch (error) {
      logError(error, 'Start auto mode failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
