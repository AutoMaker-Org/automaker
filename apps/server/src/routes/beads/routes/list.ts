/**
 * POST /list endpoint - List all beads issues for a project
 */

import type { Request, Response } from 'express';
import { BeadsService } from '../../../services/beads-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createListHandler(beadsService: BeadsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, filters } = req.body as {
        projectPath: string;
        filters?: {
          status?: string[];
          type?: string[];
          labels?: string[];
          priorityMin?: number;
          priorityMax?: number;
          titleContains?: string;
          descContains?: string;
          ids?: string[];
        };
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const issues = await beadsService.listIssues(projectPath, filters);
      res.json({ success: true, issues });
    } catch (error) {
      logError(error, 'List issues failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
