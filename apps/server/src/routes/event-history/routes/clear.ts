/**
 * POST /api/event-history/clear - Clear all events for a project
 *
 * Request body: { projectPath: string }
 * Response: { success: true, cleared: number }
 */

import type { Request, Response } from 'express';
import type { EventHistoryService } from '../../../services/event-history-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createClearHandler(eventHistoryService: EventHistoryService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const cleared = await eventHistoryService.clearEvents(projectPath);

      res.json({
        success: true,
        cleared,
      });
    } catch (error) {
      logError(error, 'Clear events failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
