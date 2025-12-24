/**
 * POST /validate endpoint - Validate beads installation and initialization
 */

import type { Request, Response } from 'express';
import { BeadsService } from '../../../services/beads-service.js';
import { getErrorMessage, logError } from '../common.js';

/**
 * Creates an Express route handler that validates beads installation or a specific project and sends a JSON response.
 *
 * @param beadsService - Service used to check installation, get version, or validate a project
 * @returns An Express request handler that responds with `{ success: true, ... }` on success (either `{ installed, version }` or the project validation result) and with HTTP 500 and `{ success: false, error }` on failure
 */
export function createValidateHandler(beadsService: BeadsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath?: string };

      if (projectPath) {
        // Validate specific project
        const result = await beadsService.validateBeadsInProject(projectPath);
        res.json({ success: true, ...result });
      } else {
        // Just check if installed
        const installed = await beadsService.isBeadsInstalled();
        const version = await beadsService.getBeadsVersion();
        res.json({ success: true, installed, version });
      }
    } catch (error) {
      logError(error, 'Validate beads failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
