/**
 * POST /ideas/create - Create a new idea
 */

import type { Request, Response } from 'express';
import type { EventEmitter } from '../../../lib/events.js';
import type { IdeationService } from '../../../services/ideation-service.js';
import type { CreateIdeaInput } from '@automaker/types';
import { getErrorMessage, logError } from '../common.js';

export function createIdeasCreateHandler(events: EventEmitter, ideationService: IdeationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, idea } = req.body as {
        projectPath: string;
        idea: CreateIdeaInput;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!idea) {
        res.status(400).json({ success: false, error: 'idea is required' });
        return;
      }

      if (!idea.title || !idea.description || !idea.category) {
        res.status(400).json({
          success: false,
          error: 'idea must have title, description, and category',
        });
        return;
      }

      const created = await ideationService.createIdea(projectPath, idea);

      // Emit idea created event for frontend notification
      events.emit('ideation:idea-created', {
        projectPath,
        idea: created,
      });

      res.json({ success: true, idea: created });
    } catch (error) {
      logError(error, 'Create idea failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
