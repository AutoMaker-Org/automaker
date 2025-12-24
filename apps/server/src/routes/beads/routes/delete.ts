/**
 * POST /delete endpoint - Delete a beads issue
 */

import type { Request, Response } from 'express';
import { BeadsService } from '../../../services/beads-service.js';
import { getErrorMessage, logError } from '../common.js';

/**
 * Create an Express POST /delete handler that deletes a beads issue.
 *
 * @param beadsService - Service used to perform issue deletion
 * @returns An Express request handler that validates `projectPath` and `issueId` from the request body, optionally accepts `force`, invokes `beadsService.deleteIssue`, responds with `{ success: true }` on success, and returns structured JSON errors with appropriate HTTP status codes on validation failure or internal errors
 */
export function createDeleteHandler(beadsService: BeadsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, issueId, force } = req.body as {
        projectPath: string;
        issueId: string;
        force?: boolean;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!issueId) {
        res.status(400).json({ success: false, error: 'issueId is required' });
        return;
      }

      await beadsService.deleteIssue(projectPath, issueId, force);
      res.json({ success: true });
    } catch (error) {
      logError(error, 'Delete issue failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}