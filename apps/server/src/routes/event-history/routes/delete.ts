/**
 * POST /api/event-history/delete - Delete an event by ID
 *
 * Request body: { projectPath: string, eventId: string }
 * Response: { success: true } or { success: false, error: string }
 */

import type { Request, Response } from 'express';
import type { EventHistoryService } from '../../../services/event-history-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createDeleteHandler(eventHistoryService: EventHistoryService) {
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

      const deleted = await eventHistoryService.deleteEvent(projectPath, eventId);

      if (!deleted) {
        res.status(404).json({ success: false, error: 'Event not found' });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Delete event failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
