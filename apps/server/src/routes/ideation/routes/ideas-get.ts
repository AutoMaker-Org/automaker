/**
 * POST /ideas/get - Get a single idea
 */

import type { Request, Response } from 'express';
import type { IdeationService } from '../../../services/ideation-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createIdeasGetHandler(ideationService: IdeationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, ideaId } = req.body as {
        projectPath: string;
        ideaId: string;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!ideaId) {
        res.status(400).json({ success: false, error: 'ideaId is required' });
        return;
      }

      const idea = await ideationService.getIdea(projectPath, ideaId);
      if (!idea) {
        res.status(404).json({ success: false, error: 'Idea not found' });
        return;
      }

      res.json({ success: true, idea });
    } catch (error) {
      logError(error, 'Get idea failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
