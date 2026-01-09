/**
 * POST /ideas/list - List all ideas for a project
 */

import type { Request, Response } from 'express';
import type { IdeationService } from '../../../services/ideation-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createIdeasListHandler(ideationService: IdeationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const ideas = await ideationService.getIdeas(projectPath);
      res.json({ success: true, ideas });
    } catch (error) {
      logError(error, 'List ideas failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
