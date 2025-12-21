/**
 * POST /validate-path endpoint - Validate and add path to allowed list
 */

import type { Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import { isPathAllowed } from "@automaker/platform";
import { getErrorMessage, logError } from "../common.js";

export function createValidatePathHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { filePath } = req.body as { filePath: string };

      if (!filePath) {
        res.status(400).json({ success: false, error: "filePath is required" });
        return;
      }

      const resolvedPath = path.resolve(filePath);

      // Check if path exists
      try {
        const stats = await fs.stat(resolvedPath);

        if (!stats.isDirectory()) {
          res
            .status(400)
            .json({ success: false, error: "Path is not a directory" });
          return;
        }

        res.json({
          success: true,
          path: resolvedPath,
          isAllowed: isPathAllowed(resolvedPath),
        });
      } catch {
        res.status(400).json({ success: false, error: "Path does not exist" });
      }
    } catch (error) {
      logError(error, "Validate path failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
