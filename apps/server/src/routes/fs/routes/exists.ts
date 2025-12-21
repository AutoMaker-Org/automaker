/**
 * POST /exists endpoint - Check if file/directory exists
 */

import type { Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import { isPathAllowed, PathNotAllowedError } from "@automaker/platform";
import { getErrorMessage, logError } from "../common.js";

export function createExistsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { filePath } = req.body as { filePath: string };

      if (!filePath) {
        res.status(400).json({ success: false, error: "filePath is required" });
        return;
      }

      const resolvedPath = path.resolve(filePath);

      // Validate that the path is allowed
      if (!isPathAllowed(resolvedPath)) {
        throw new PathNotAllowedError(filePath);
      }

      try {
        await fs.access(resolvedPath);
        res.json({ success: true, exists: true });
      } catch {
        res.json({ success: true, exists: false });
      }
    } catch (error) {
      // Path not allowed - return 403 Forbidden
      if (error instanceof PathNotAllowedError) {
        res.status(403).json({ success: false, error: getErrorMessage(error) });
        return;
      }

      logError(error, "Check exists failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
