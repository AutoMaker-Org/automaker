/**
 * POST /save-board-background endpoint - Save board background image
 */

import type { Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import { getErrorMessage, logError } from "../common.js";
import { getBoardDir } from "@automaker/platform";

export function createSaveBoardBackgroundHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { data, filename, mimeType, projectPath } = req.body as {
        data: string;
        filename: string;
        mimeType: string;
        projectPath: string;
      };

      if (!data || !filename || !projectPath) {
        res.status(400).json({
          success: false,
          error: "data, filename, and projectPath are required",
        });
        return;
      }

      // Get board directory
      const boardDir = getBoardDir(projectPath);
      await fs.mkdir(boardDir, { recursive: true });

      // Decode base64 data (remove data URL prefix if present)
      const base64Data = data.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");

      // Use a fixed filename for the board background (overwrite previous)
      const ext = path.extname(filename) || ".png";
      const uniqueFilename = `background${ext}`;
      const filePath = path.join(boardDir, uniqueFilename);

      // Write file
      await fs.writeFile(filePath, buffer);

      // Return the absolute path
      res.json({ success: true, path: filePath });
    } catch (error) {
      logError(error, "Save board background failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
