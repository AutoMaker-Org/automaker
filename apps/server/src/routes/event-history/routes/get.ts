/**
 * POST /api/event-history/get - Get a single event by ID
 *
 * Request body: { projectPath: string, eventId: string }
 * Response: { success: true, event: StoredEvent } or { success: false, error: string }
 */

import type { Request, Response } from 'express';
import type { EventHistoryService } from '../../../services/event-history-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createGetHandler(eventHistoryService: EventHistoryService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, eventId } = req.body as {
        projectPath: string;
        eventId: string;
      };

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!eventId || typeof eventId !== 'string') {
        res.status(400).json({ success: false, error: 'eventId is required' });
        return;
      }

      const event = await eventHistoryService.getEvent(projectPath, eventId);

      if (!event) {
        res.status(404).json({ success: false, error: 'Event not found' });
        return;
      }

      res.json({
        success: true,
        event,
      });
    } catch (error) {
      logError(error, 'Get event failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
