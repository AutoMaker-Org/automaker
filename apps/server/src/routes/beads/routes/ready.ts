/**
 * POST /ready endpoint - Get ready work (issues with no open blockers)
 */

import type { Request, Response } from 'express';
import { BeadsService } from '../../../services/beads-service.js';
import { getErrorMessage, logError } from '../common.js';

/**
 * Creates an Express handler that returns "ready work" issues for a project.
 *
 * The handler expects `projectPath` (required) and `limit` (optional) in the request body.
 * If `projectPath` is missing, it responds with HTTP 400 and an error payload.
 * On success it responds with `{ success: true, issues }`. On failure it logs the error
 * and responds with HTTP 500 and a user-facing error message.
 *
 * @param beadsService - Service used to fetch ready-work issues for a given project
 * @returns An Express middleware function that processes ready-work requests
 */
export function createReadyWorkHandler(beadsService: BeadsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, limit } = req.body as {
        projectPath: string;
        limit?: number;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const issues = await beadsService.getReadyWork(projectPath, limit);
      res.json({ success: true, issues });
    } catch (error) {
      logError(error, 'Get ready work failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
