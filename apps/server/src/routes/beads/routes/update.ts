/**
 * POST /update endpoint - Update an existing beads issue
 */

import type { Request, Response } from 'express';
import { BeadsService } from '../../../services/beads-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createUpdateHandler(beadsService: BeadsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, issueId, updates } = req.body as {
        projectPath: string;
        issueId: string;
        updates: {
          title?: string;
          description?: string;
          status?: string;
          type?: string;
          priority?: number;
          labels?: string[];
        };
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!issueId) {
        res.status(400).json({ success: false, error: 'issueId is required' });
        return;
      }

      if (!updates) {
        res.status(400).json({ success: false, error: 'updates are required' });
        return;
      }

      const updatedIssue = await beadsService.updateIssue(projectPath, issueId, updates);
      res.json({ success: true, issue: updatedIssue });
    } catch (error) {
      logError(error, 'Update issue failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
