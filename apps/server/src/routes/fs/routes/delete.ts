/**
 * POST /delete endpoint - Delete file
 */

import type { Request, Response } from "express";
import fs from "fs/promises";
import { validatePath, PathNotAllowedError } from "@automaker/platform";
import { getErrorMessage, logError } from "../common.js";

export function createDeleteHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { filePath } = req.body as { filePath: string };

      if (!filePath) {
        res.status(400).json({ success: false, error: "filePath is required" });
        return;
      }

      const resolvedPath = validatePath(filePath);
      await fs.rm(resolvedPath, { recursive: true });

      res.json({ success: true });
    } catch (error) {
      // Path not allowed - return 403 Forbidden
      if (error instanceof PathNotAllowedError) {
        res.status(403).json({ success: false, error: getErrorMessage(error) });
        return;
      }

      logError(error, "Delete file failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
