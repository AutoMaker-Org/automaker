/**
 * GET /issues/:issueId - Get single issue details
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import type { LinearService } from '../../../services/linear-service.js';

const logger = createLogger('LinearIssue');

export function createGetIssueHandler(linearService: LinearService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { issueId } = req.params;

      if (!issueId) {
        res.status(400).json({
          success: false,
          error: 'issueId parameter is required',
        });
        return;
      }

      const result = await linearService.getIssue(issueId);
      res.json(result);
    } catch (error) {
      logger.error('Failed to get issue:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get issue',
      });
    }
  };
}
