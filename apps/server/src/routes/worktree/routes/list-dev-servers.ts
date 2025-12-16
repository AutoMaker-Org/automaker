/**
 * POST /list-dev-servers endpoint - List all running dev servers
 *
 * Returns information about all worktree dev servers currently running,
 * including their ports and URLs.
 */

import type { Request, Response } from "express";
import { getDevServerService } from "../../../services/dev-server-service.js";
import { getErrorMessage, logError } from "../common.js";

export function createListDevServersHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const devServerService = getDevServerService();
      const result = devServerService.listDevServers();

      res.json({
        success: true,
        result: {
          servers: result.result.servers,
        },
      });
    } catch (error) {
      logError(error, "List dev servers failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
