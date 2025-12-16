/**
 * POST /write endpoint - Write file
 */

import type { Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import { validatePath } from "../../../lib/security.js";
import { getErrorMessage, logError } from "../common.js";
import { mkdirSafe } from "../../../lib/fs-utils.js";

export function createWriteHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { filePath, content } = req.body as {
        filePath: string;
        content: string;
      };

      if (!filePath) {
        res.status(400).json({ success: false, error: "filePath is required" });
        return;
      }

      const resolvedPath = validatePath(filePath);

      // Ensure parent directory exists (symlink-safe)
      await mkdirSafe(path.dirname(resolvedPath));
      await fs.writeFile(resolvedPath, content, "utf-8");

      res.json({ success: true });
    } catch (error) {
      logError(error, "Write file failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
