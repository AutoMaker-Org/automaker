/**
 * POST /analyze - Analyze project and generate suggestions
 */

import type { Request, Response } from 'express';
import type { IdeationService } from '../../../services/ideation-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createAnalyzeHandler(ideationService: IdeationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      // Start analysis - results come via WebSocket events
      ideationService.analyzeProject(projectPath).catch((error) => {
        logError(error, 'Analyze project failed (async)');
      });

      res.json({ success: true, message: 'Analysis started' });
    } catch (error) {
      logError(error, 'Analyze project failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

export function createGetAnalysisHandler(ideationService: IdeationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const result = await ideationService.getCachedAnalysis(projectPath);
      res.json({ success: true, result });
    } catch (error) {
      logError(error, 'Get analysis failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
