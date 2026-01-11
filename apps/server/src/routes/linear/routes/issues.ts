/**
 * POST /issues - List issues with filters
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import type { LinearIssueFilters } from '@automaker/types';
import type { LinearService } from '../../../services/linear-service.js';

const logger = createLogger('LinearIssues');

export function createListIssuesHandler(linearService: LinearService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const filters = req.body as LinearIssueFilters;
      const result = await linearService.getIssues(filters);
      res.json(result);
    } catch (error) {
      logger.error('Failed to list issues:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list issues',
      });
    }
  };
}
