/**
 * POST /api/event-history/list - List events for a project
 *
 * Request body: {
 *   projectPath: string,
 *   filter?: {
 *     trigger?: EventHookTrigger,
 *     featureId?: string,
 *     since?: string,
 *     until?: string,
 *     limit?: number,
 *     offset?: number
 *   }
 * }
 * Response: { success: true, events: StoredEventSummary[], total: number }
 */

import type { Request, Response } from 'express';
import type { EventHistoryService } from '../../../services/event-history-service.js';
import type { EventHistoryFilter } from '@automaker/types';
import { getErrorMessage, logError } from '../common.js';

export function createListHandler(eventHistoryService: EventHistoryService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, filter } = req.body as {
        projectPath: string;
        filter?: EventHistoryFilter;
      };

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const events = await eventHistoryService.getEvents(projectPath, filter);
      const total = await eventHistoryService.getEventCount(projectPath, {
        ...filter,
        limit: undefined,
        offset: undefined,
      });

      res.json({
        success: true,
        events,
        total,
      });
    } catch (error) {
      logError(error, 'List events failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
