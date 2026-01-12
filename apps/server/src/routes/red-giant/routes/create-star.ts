/**
 * POST /stars/create endpoint - Create a new Red Giant star
 */

import type { Request, Response } from 'express';
import { RedGiantService } from '../../../services/red-giant-service.js';

export function createCreateStarHandler(redGiantService: RedGiantService) {
  return (req: Request, res: Response): void => {
    try {
      const { name, mass } = req.body as {
        name: string;
        mass: number;
      };

      if (!name || !mass) {
        res.status(400).json({
          success: false,
          error: 'name and mass are required',
        });
        return;
      }

      if (mass <= 0) {
        res.status(400).json({
          success: false,
          error: 'mass must be greater than 0',
        });
        return;
      }

      const star = redGiantService.createRedGiant(name, mass);
      res.json({ success: true, star });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  };
}
