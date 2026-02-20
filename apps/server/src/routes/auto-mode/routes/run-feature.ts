/**
 * POST /run-feature endpoint - Run a single feature
 */

import type { Request, Response } from 'express';
import type { AutoModeServiceCompat } from '../../../services/auto-mode/index.js';
import { createLogger } from '@automaker/utils';
import { getErrorMessage, logError } from '../common.js';

const logger = createLogger('AutoMode');

export function createRunFeatureHandler(autoModeService: AutoModeServiceCompat) {
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

      // Note: No concurrency limit check here. Manual feature starts always run
      // immediately and bypass the concurrency limit. Their presence IS counted
      // by the auto-loop coordinator when deciding whether to dispatch new auto-mode tasks.

      // Start execution in background
      // executeFeature derives workDir from feature.branchName
      autoModeService
        .executeFeature(projectPath, featureId, useWorktrees ?? false, false)
        .catch((error) => {
          logger.error(`Feature ${featureId} error:`, error);
        });

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Run feature failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
