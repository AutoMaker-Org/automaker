/**
 * POST /delete-board-background endpoint - Delete board background image
 */

import type { Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import { getErrorMessage, logError } from "../common.js";
import { getBoardDir } from "@automaker/platform";

export function createDeleteBoardBackgroundHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: "projectPath is required",
        });
        return;
      }

      // Get board directory
      const boardDir = getBoardDir(projectPath);

      try {
        // Try to remove all background files in the board directory
        const files = await fs.readdir(boardDir);
        for (const file of files) {
          if (file.startsWith("background")) {
            await fs.unlink(path.join(boardDir, file));
          }
        }
      } catch {
        // Directory may not exist, that's fine
      }

      res.json({ success: true });
    } catch (error) {
      logError(error, "Delete board background failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
