/**
 * POST /metrics endpoint - Get Red Giant service metrics
 */

import type { Request, Response } from 'express';
import { RedGiantService } from '../../../services/red-giant-service.js';

export function createGetMetricsHandler(redGiantService: RedGiantService) {
  return (_req: Request, res: Response): void => {
    try {
      const metrics = redGiantService.getMetrics();
      res.json({ success: true, metrics });
    } catch (error) {
      res.status(500).json({ success: false, error: String(error) });
    }
  };
}
