/**
 * GET /config endpoint - Get workspace configuration status
 */

import type { Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import { addAllowedPath, getAllowedRootDirectory } from "../../../lib/security.js";
import { getErrorMessage, logError } from "../common.js";

export function createConfigHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      // Prefer ALLOWED_ROOT_DIRECTORY, fall back to WORKSPACE_DIR for backward compatibility
      const allowedRootDirectory = getAllowedRootDirectory();
      const workspaceDir = process.env.WORKSPACE_DIR || allowedRootDirectory;

      if (!workspaceDir) {
        res.json({
          success: true,
          configured: false,
        });
        return;
      }

      // Check if the directory exists
      try {
        const resolvedWorkspaceDir = path.resolve(workspaceDir);
        const stats = await fs.stat(resolvedWorkspaceDir);
        if (!stats.isDirectory()) {
          res.json({
            success: true,
            configured: false,
            error: "Configured workspace directory is not a valid directory",
          });
          return;
        }

        // Add workspace dir to allowed paths
        addAllowedPath(resolvedWorkspaceDir);

        res.json({
          success: true,
          configured: true,
          workspaceDir: resolvedWorkspaceDir,
        });
      } catch {
        res.json({
          success: true,
          configured: false,
          error: "Configured workspace directory path does not exist",
        });
      }
    } catch (error) {
      logError(error, "Get workspace config failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
