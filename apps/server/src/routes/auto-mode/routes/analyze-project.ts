/**
 * POST /analyze-project endpoint - Analyze project
 */

import type { Request, Response } from "express";
import type { AutoModeService } from "../../../services/auto-mode-service.js";
import { createLogger } from "@automaker/utils";
import { getErrorMessage, logError } from "../common.js";

const logger = createLogger("AutoMode");

export function createAnalyzeProjectHandler(autoModeService: AutoModeService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res
          .status(400)
          .json({ success: false, error: "projectPath is required" });
        return;
      }

      // Start analysis in background
      autoModeService.analyzeProject(projectPath).catch((error) => {
        logger.error(`[AutoMode] Project analysis error:`, error);
      });

      res.json({ success: true, message: "Project analysis started" });
    } catch (error) {
      logError(error, "Analyze project failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
