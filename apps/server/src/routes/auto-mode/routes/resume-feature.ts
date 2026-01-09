/**
 * POST /resume-feature endpoint - Resume a feature
 */

import type { Request, Response } from 'express';
import type { AutoModeService } from '../../../services/auto-mode-service.js';
import { createLogger } from '@automaker/utils';
import { getErrorMessage, logError } from '../common.js';

const logger = createLogger('AutoMode');

export function createResumeFeatureHandler(autoModeService: AutoModeService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId, useWorktrees } = req.body as {
        projectPath: string;
        featureId: string;
        useWorktrees?: boolean;
      };

      if (!projectPath || !featureId) {
        res.status(400).json({
          success: false,
          error: 'projectPath and featureId are required',
        });
        return;
      }

      // Start resume in background
      // Default to false - worktrees should only be used when explicitly enabled
      autoModeService
        .resumeFeature(projectPath, featureId, useWorktrees ?? false)
        .catch((error) => {
          logger.error(`Resume feature ${featureId} error:`, error);
        });

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Resume feature failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
