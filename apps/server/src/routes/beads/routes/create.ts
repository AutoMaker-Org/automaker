/**
 * POST /create endpoint - Create a new beads issue
 */

import type { Request, Response } from 'express';
import { BeadsService } from '../../../services/beads-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createCreateHandler(beadsService: BeadsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, issue } = req.body as {
        projectPath: string;
        issue: {
          title: string;
          description?: string;
          type?: string;
          priority?: number;
          labels?: string[];
        };
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!issue?.title) {
        res.status(400).json({ success: false, error: 'issue.title is required' });
        return;
      }

      const createdIssue = await beadsService.createIssue(projectPath, issue);
      res.json({ success: true, issue: createdIssue });
    } catch (error) {
      logError(error, 'Create issue failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
