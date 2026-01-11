/**
 * GET /teams - List all Linear teams
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import type { LinearService } from '../../../services/linear-service.js';

const logger = createLogger('LinearTeams');

export function createListTeamsHandler(linearService: LinearService) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const result = await linearService.getTeams();
      res.json(result);
    } catch (error) {
      logger.error('Failed to list teams:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list teams',
      });
    }
  };
}
