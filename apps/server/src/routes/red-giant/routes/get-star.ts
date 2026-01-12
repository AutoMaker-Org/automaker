/**
 * POST /stars/get endpoint - Get a single Red Giant star
 */

import type { Request, Response } from 'express';
import { RedGiantService } from '../../../services/red-giant-service.js';

export function createGetStarHandler(redGiantService: RedGiantService) {
  return (req: Request, res: Response): void => {
    try {
      const { starId } = req.body as {
        starId: string;
      };

      if (!starId) {
        res.status(400).json({
          success: false,
          error: 'starId is required',
        });
        return;
      }

      const star = redGiantService.getStar(starId);
      if (!star) {
        res.status(404).json({ success: false, error: 'Star not found' });
        return;
      }

      res.json({ success: true, star });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  };
}
