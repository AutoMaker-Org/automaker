/**
 * POST /stars/list endpoint - List Red Giant stars with optional filters
 */

import type { Request, Response } from 'express';
import { RedGiantService } from '../../../services/red-giant-service.js';

export function createListStarsHandler(redGiantService: RedGiantService) {
  return (req: Request, res: Response): void => {
    try {
      const { status, phase } = req.body as {
        status?: string;
        phase?: string;
      };

      let stars: ReturnType<typeof redGiantService.getAllStars>;

      if (status) {
        stars = redGiantService.getStarsByStatus(status);
      } else if (phase) {
        stars = redGiantService.getStarsByPhase(phase);
      } else {
        stars = redGiantService.getAllStars();
      }

      res.json({ success: true, stars, count: stars.length });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  };
}
