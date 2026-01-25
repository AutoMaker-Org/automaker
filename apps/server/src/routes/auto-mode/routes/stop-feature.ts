/**
 * POST /stop-feature endpoint - Stop a specific feature
 */

import type { Request, Response } from 'express';
import type { AutoModeService } from '../../../services/auto-mode-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createStopFeatureHandler(autoModeService: AutoModeService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { featureId, waitForCleanup } = req.body as {
        featureId: string;
        waitForCleanup?: boolean;
      };

      if (!featureId) {
        res.status(400).json({ success: false, error: 'featureId is required' });
        return;
      }

      // Default to waiting for cleanup unless explicitly set to false
      const shouldWait = waitForCleanup !== false;
      const stopped = await autoModeService.stopFeature(featureId, shouldWait);
      res.json({ success: true, stopped });
    } catch (error) {
      logError(error, 'Stop feature failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
