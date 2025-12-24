/**
 * POST /update endpoint - Update an existing beads issue
 */

import type { Request, Response } from 'express';
import { BeadsService } from '../../../services/beads-service.js';
import { getErrorMessage, logError } from '../common.js';

/**
 * Create an Express route handler that updates an existing beads issue.
 *
 * @param beadsService - Service used to perform the issue update
 * @returns An Express request handler that validates `projectPath`, `issueId`, and `updates` from the request body, calls the service to apply changes, and sends JSON responses: on success `{ success: true, issue }`, on validation failure a 400 with `{ success: false, error }`, and on unexpected errors a 500 with `{ success: false, error }`.
 */
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