/**
 * POST /mkdir endpoint - Create directory
 * Handles symlinks safely to avoid ELOOP errors
 */

import type { Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import { addAllowedPath } from "../../../lib/security.js";
import { getErrorMessage, logError } from "../common.js";

export function createMkdirHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { dirPath } = req.body as { dirPath: string };

      if (!dirPath) {
        res.status(400).json({ success: false, error: "dirPath is required" });
        return;
      }

      const resolvedPath = path.resolve(dirPath);

      // Check if path already exists using lstat (doesn't follow symlinks)
      try {
        const stats = await fs.lstat(resolvedPath);
        // Path exists - if it's a directory or symlink, consider it success
        if (stats.isDirectory() || stats.isSymbolicLink()) {
          addAllowedPath(resolvedPath);
          res.json({ success: true });
          return;
        }
        // It's a file - can't create directory
        res.status(400).json({
          success: false,
          error: "Path exists and is not a directory",
        });
        return;
      } catch (statError: any) {
        // ENOENT means path doesn't exist - we should create it
        if (statError.code !== "ENOENT") {
          // Some other error (could be ELOOP in parent path)
          throw statError;
        }
      }

      // Path doesn't exist, create it
      await fs.mkdir(resolvedPath, { recursive: true });

      // Add the new directory to allowed paths for tracking
      addAllowedPath(resolvedPath);

      res.json({ success: true });
    } catch (error: any) {
      // Handle ELOOP specifically
      if (error.code === "ELOOP") {
        logError(error, "Create directory failed - symlink loop detected");
        res.status(400).json({
          success: false,
          error: "Cannot create directory: symlink loop detected in path",
        });
        return;
      }
      logError(error, "Create directory failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
