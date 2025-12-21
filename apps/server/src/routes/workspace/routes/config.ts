/**
 * GET /config endpoint - Get workspace configuration status
 */

import type { Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import {
  getAllowedRootDirectory,
  getDataDirectory,
} from "@automaker/platform";
import { getErrorMessage, logError } from "../common.js";

export function createConfigHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const allowedRootDirectory = getAllowedRootDirectory();
      const dataDirectory = getDataDirectory();

      if (!allowedRootDirectory) {
        // When ALLOWED_ROOT_DIRECTORY is not set, return DATA_DIR as default directory
        res.json({
          success: true,
          configured: false,
          defaultDir: dataDirectory || null,
        });
        return;
      }

      // Check if the directory exists
      try {
        const resolvedWorkspaceDir = path.resolve(allowedRootDirectory);
        const stats = await fs.stat(resolvedWorkspaceDir);
        if (!stats.isDirectory()) {
          res.json({
            success: true,
            configured: false,
            error: "ALLOWED_ROOT_DIRECTORY is not a valid directory",
          });
          return;
        }

        res.json({
          success: true,
          configured: true,
          workspaceDir: resolvedWorkspaceDir,
          defaultDir: resolvedWorkspaceDir,
        });
      } catch {
        res.json({
          success: true,
          configured: false,
          error: "ALLOWED_ROOT_DIRECTORY path does not exist",
        });
      }
    } catch (error) {
      logError(error, "Get workspace config failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
