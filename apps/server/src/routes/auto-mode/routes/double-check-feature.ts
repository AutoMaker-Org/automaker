/**
 * POST /double-check-feature endpoint - Run double-check verification on a feature
 */

import type { Request, Response } from 'express';
import type { AutoModeService } from '../../../services/auto-mode-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createDoubleCheckFeatureHandler(autoModeService: AutoModeService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId } = req.body as {
        projectPath: string;
        featureId: string;
      };

      if (!projectPath || !featureId) {
        res.status(400).json({
          success: false,
          error: 'projectPath and featureId are required',
        });
        return;
      }

      const result = await autoModeService.doubleCheckFeature(projectPath, featureId);
      res.json({
        success: true,
        passed: result.passed,
        summary: result.summary,
        discrepancies: result.discrepancies,
      });
    } catch (error) {
      logError(error, 'Double-check feature failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
