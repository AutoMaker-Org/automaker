/**
 * POST /clarification-response endpoint - Submit answers to clarification questions
 *
 * Used during interactive planning mode when the AI agent asks clarification
 * questions via the AskUserQuestion tool.
 */

import type { Request, Response } from 'express';
import type { AutoModeService } from '../../../services/auto-mode-service.js';
import { createLogger } from '@automaker/utils';
import { getErrorMessage, logError } from '../common.js';

const logger = createLogger('AutoMode');

export function createClarificationResponseHandler(autoModeService: AutoModeService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { featureId, projectPath, requestId, answers } = req.body as {
        featureId: string;
        projectPath: string;
        requestId: string;
        answers: Record<string, string>;
      };

      if (!featureId) {
        res.status(400).json({
          success: false,
          error: 'featureId is required',
        });
        return;
      }

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      if (!requestId) {
        res.status(400).json({
          success: false,
          error: 'requestId is required',
        });
        return;
      }

      if (!answers || typeof answers !== 'object') {
        res.status(400).json({
          success: false,
          error: 'answers object is required',
        });
        return;
      }

      logger.info(
        `[AutoMode] Clarification response received for feature ${featureId}, requestId=${requestId}`
      );

      // Resolve the pending clarification
      const result = await autoModeService.resolveClarification(
        featureId,
        requestId,
        answers,
        projectPath
      );

      if (!result.success) {
        res.status(500).json({
          success: false,
          error: result.error,
        });
        return;
      }

      res.json({
        success: true,
        message: 'Clarification response submitted - agent will continue',
      });
    } catch (error) {
      logError(error, 'Clarification response failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
