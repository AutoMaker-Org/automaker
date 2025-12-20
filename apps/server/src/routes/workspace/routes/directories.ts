/**
 * GET /directories endpoint - List directories in workspace
 */

import type { Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import { addAllowedPath, getAllowedRootDirectory } from "../../../lib/security.js";
import { getErrorMessage, logError } from "../common.js";

export function createDirectoriesHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      // Prefer ALLOWED_ROOT_DIRECTORY, fall back to WORKSPACE_DIR for backward compatibility
      const allowedRootDirectory = getAllowedRootDirectory();
      const workspaceDir = process.env.WORKSPACE_DIR || allowedRootDirectory;

      if (!workspaceDir) {
        res.status(400).json({
          success: false,
          error: "Workspace directory is not configured (set ALLOWED_ROOT_DIRECTORY or WORKSPACE_DIR)",
        });
        return;
      }

      const resolvedWorkspaceDir = path.resolve(workspaceDir);

      // Check if directory exists
      try {
        await fs.stat(resolvedWorkspaceDir);
      } catch {
        res.status(400).json({
          success: false,
          error: "Workspace directory path does not exist",
        });
        return;
      }

      // Add workspace dir to allowed paths
      addAllowedPath(resolvedWorkspaceDir);

      // Read directory contents
      const entries = await fs.readdir(resolvedWorkspaceDir, { withFileTypes: true });

      // Filter to directories only and map to result format
      const directories = entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => ({
          name: entry.name,
          path: path.join(resolvedWorkspaceDir, entry.name),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      // Add each directory to allowed paths
      directories.forEach((dir) => addAllowedPath(dir.path));

      res.json({
        success: true,
        directories,
      });
    } catch (error) {
      logError(error, "List workspace directories failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
