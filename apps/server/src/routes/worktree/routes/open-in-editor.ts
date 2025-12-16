/**
 * POST /open-in-editor endpoint - Open a worktree directory in VS Code
 */

import type { Request, Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import { getErrorMessage, logError } from "../common.js";

const execAsync = promisify(exec);

export function createOpenInEditorHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath } = req.body as {
        worktreePath: string;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: "worktreePath required",
        });
        return;
      }

      // Try to open in VS Code
      try {
        await execAsync(`code "${worktreePath}"`);
        res.json({
          success: true,
          result: {
            message: `Opened ${worktreePath} in VS Code`,
          },
        });
      } catch {
        // If 'code' command fails, try 'cursor' (for Cursor editor)
        try {
          await execAsync(`cursor "${worktreePath}"`);
          res.json({
            success: true,
            result: {
              message: `Opened ${worktreePath} in Cursor`,
            },
          });
        } catch {
          // If both fail, try opening in default file manager
          const platform = process.platform;
          let openCommand: string;

          if (platform === "darwin") {
            openCommand = `open "${worktreePath}"`;
          } else if (platform === "win32") {
            openCommand = `explorer "${worktreePath}"`;
          } else {
            openCommand = `xdg-open "${worktreePath}"`;
          }

          await execAsync(openCommand);
          res.json({
            success: true,
            result: {
              message: `Opened ${worktreePath} in file manager`,
            },
          });
        }
      }
    } catch (error) {
      logError(error, "Open in editor failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
