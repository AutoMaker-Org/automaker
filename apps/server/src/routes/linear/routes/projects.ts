/**
 * GET /projects - List projects for a Linear team
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import type { LinearService } from '../../../services/linear-service.js';

const logger = createLogger('LinearProjects');

export function createListProjectsHandler(linearService: LinearService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { teamId } = req.query;

      if (!teamId || typeof teamId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'teamId query parameter is required',
        });
        return;
      }

      const result = await linearService.getProjects(teamId);
      res.json(result);
    } catch (error) {
      logger.error('Failed to list projects:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list projects',
      });
    }
  };
}
