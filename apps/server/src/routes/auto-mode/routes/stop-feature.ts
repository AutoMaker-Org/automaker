/**
 * POST /stop-feature endpoint - Stop a specific feature
 */

import type { Request, Response } from 'express';
import type { AutoModeServiceCompat } from '../../../services/auto-mode/index.js';
import { getErrorMessage, logError } from '../common.js';

export function createStopFeatureHandler(autoModeService: AutoModeServiceCompat) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { featureId } = req.body as { featureId: string };

      if (!featureId) {
        res.status(400).json({ success: false, error: 'featureId is required' });
        return;
      }

      const stopped = await autoModeService.stopFeature(featureId);
      res.json({ success: true, stopped });
    } catch (error) {
      logError(error, 'Stop feature failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
