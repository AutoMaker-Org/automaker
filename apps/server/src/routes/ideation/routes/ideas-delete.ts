/**
 * POST /ideas/delete - Delete an idea
 */

import type { Request, Response } from 'express';
import type { EventEmitter } from '../../../lib/events.js';
import type { IdeationService } from '../../../services/ideation-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createIdeasDeleteHandler(events: EventEmitter, ideationService: IdeationService) {
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

      await ideationService.deleteIdea(projectPath, ideaId);

      // Emit idea deleted event for frontend notification
      events.emit('ideation:idea-deleted', {
        projectPath,
        ideaId,
      });

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Delete idea failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
