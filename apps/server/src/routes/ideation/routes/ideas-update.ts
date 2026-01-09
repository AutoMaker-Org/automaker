/**
 * POST /ideas/update - Update an idea
 */

import type { Request, Response } from 'express';
import type { EventEmitter } from '../../../lib/events.js';
import type { IdeationService } from '../../../services/ideation-service.js';
import type { UpdateIdeaInput } from '@automaker/types';
import { getErrorMessage, logError } from '../common.js';

export function createIdeasUpdateHandler(events: EventEmitter, ideationService: IdeationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, ideaId, updates } = req.body as {
        projectPath: string;
        ideaId: string;
        updates: UpdateIdeaInput;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!ideaId) {
        res.status(400).json({ success: false, error: 'ideaId is required' });
        return;
      }

      if (!updates) {
        res.status(400).json({ success: false, error: 'updates is required' });
        return;
      }

      const idea = await ideationService.updateIdea(projectPath, ideaId, updates);
      if (!idea) {
        res.status(404).json({ success: false, error: 'Idea not found' });
        return;
      }

      // Emit idea updated event for frontend notification
      events.emit('ideation:idea-updated', {
        projectPath,
        ideaId,
        idea,
      });

      res.json({ success: true, idea });
    } catch (error) {
      logError(error, 'Update idea failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
