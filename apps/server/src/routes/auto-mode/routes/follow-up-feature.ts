/**
 * POST /follow-up-feature endpoint - Follow up on a feature
 */

import type { Request, Response } from 'express';
import type { AutoModeService } from '../../../services/auto-mode-service.js';
import { createLogger } from '@automaker/utils';
import { getErrorMessage, logError } from '../common.js';

const logger = createLogger('AutoMode');

export function createFollowUpFeatureHandler(autoModeService: AutoModeService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId, prompt, imagePaths, useWorktrees } = req.body as {
        projectPath: string;
        featureId: string;
        prompt: string;
        imagePaths?: string[];
        useWorktrees?: boolean;
      };

      if (!projectPath || !featureId || !prompt) {
        res.status(400).json({
          success: false,
          error: 'projectPath, featureId, and prompt are required',
        });
        return;
      }

      // Start follow-up in background
      // followUpFeature derives workDir from feature.branchName
      autoModeService
        // Default to false to match run-feature/resume-feature behavior.
        // Worktrees should only be used when explicitly enabled by the user.
        .followUpFeature(projectPath, featureId, prompt, imagePaths, useWorktrees ?? false)
        .catch((error) => {
          logger.error(`[AutoMode] Follow up feature ${featureId} error:`, error);
        })
        .finally(() => {
          // Release the starting slot when follow-up completes (success or error)
          // Note: The feature should be in runningFeatures by this point
        });

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Follow up feature failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
