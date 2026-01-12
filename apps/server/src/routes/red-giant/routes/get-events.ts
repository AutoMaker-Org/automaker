/**
 * POST /events endpoint - Get evolution events
 */

import type { Request, Response } from 'express';
import { RedGiantService } from '../../../services/red-giant-service.js';

export function createGetEventsHandler(redGiantService: RedGiantService) {
  return (req: Request, res: Response): void => {
    try {
      const { limit, starId } = req.body as {
        limit?: number;
        starId?: string;
      };

      const events = redGiantService.getEvents(limit, starId);
      res.json({ success: true, events, count: events.length });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  };
}
