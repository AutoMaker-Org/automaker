/**
 * POST /read endpoint - Read file
 */

import type { Request, Response } from "express";
import fs from "fs/promises";
import { validatePath, PathNotAllowedError } from "@automaker/platform";
import { getErrorMessage, logError } from "../common.js";

// Optional files that are expected to not exist in new projects
// Don't log ENOENT errors for these to reduce noise
const OPTIONAL_FILES = ["categories.json", "app_spec.txt"];

function isOptionalFile(filePath: string): boolean {
  return OPTIONAL_FILES.some((optionalFile) => filePath.endsWith(optionalFile));
}

function isENOENT(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export function createReadHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { filePath } = req.body as { filePath: string };

      if (!filePath) {
        res.status(400).json({ success: false, error: "filePath is required" });
        return;
      }

      const resolvedPath = validatePath(filePath);
      const content = await fs.readFile(resolvedPath, "utf-8");

      res.json({ success: true, content });
    } catch (error) {
      // Path not allowed - return 403 Forbidden
      if (error instanceof PathNotAllowedError) {
        res.status(403).json({ success: false, error: getErrorMessage(error) });
        return;
      }

      // Don't log ENOENT errors for optional files (expected to be missing in new projects)
      const shouldLog = !(isENOENT(error) && isOptionalFile(req.body?.filePath || ""));
      if (shouldLog) {
        logError(error, "Read file failed");
      }
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
