/**
 * POST /list endpoint - List all beads issues for a project
 */

import type { Request, Response } from 'express';
import { BeadsService } from '../../../services/beads-service.js';
import { getErrorMessage, logError } from '../common.js';

/**
 * Creates an Express handler that lists bead issues for a given project.
 *
 * The returned async middleware expects req.body to contain `projectPath` (string) and an optional
 * `filters` object with any of: `status`, `type`, `labels`, `priorityMin`, `priorityMax`,
 * `titleContains`, `descContains`, and `ids`. If `projectPath` is missing the handler responds with
 * HTTP 400 and an error JSON; on success it responds with `{ success: true, issues }`; on failure it
 * logs the error and responds with HTTP 500 and a standardized error message.
 *
 * @returns An Express-compatible async middleware (req, res) that lists issues for the specified project.
 */
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
