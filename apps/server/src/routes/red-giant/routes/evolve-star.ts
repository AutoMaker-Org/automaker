/**
 * POST /stars/evolve endpoint - Evolve a Red Giant star forward in time
 */

import type { Request, Response } from 'express';
import { RedGiantService } from '../../../services/red-giant-service.js';

export function createEvolveStarHandler(redGiantService: RedGiantService) {
  return (req: Request, res: Response): void => {
    try {
      const { starId, timeStep } = req.body as {
        starId: string;
        timeStep: number;
      };

      if (!starId) {
        res.status(400).json({
          success: false,
          error: 'starId is required',
        });
        return;
      }

      if (!timeStep || timeStep <= 0) {
        res.status(400).json({
          success: false,
          error: 'timeStep must be greater than 0',
        });
        return;
      }

      const star = redGiantService.evolveStar(starId, timeStep);
      res.json({ success: true, star });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  };
}
