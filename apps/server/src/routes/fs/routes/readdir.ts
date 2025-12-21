/**
 * POST /readdir endpoint - Read directory
 */

import type { Request, Response } from "express";
import fs from "fs/promises";
import { validatePath, PathNotAllowedError } from "@automaker/platform";
import { getErrorMessage, logError } from "../common.js";

export function createReaddirHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { dirPath } = req.body as { dirPath: string };

      if (!dirPath) {
        res.status(400).json({ success: false, error: "dirPath is required" });
        return;
      }

      const resolvedPath = validatePath(dirPath);
      const entries = await fs.readdir(resolvedPath, { withFileTypes: true });

      const result = entries.map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
      }));

      res.json({ success: true, entries: result });
    } catch (error) {
      // Path not allowed - return 403 Forbidden
      if (error instanceof PathNotAllowedError) {
        res.status(403).json({ success: false, error: getErrorMessage(error) });
        return;
      }

      logError(error, "Read directory failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
