/**
 * POST /follow-up-feature endpoint - Follow up on a feature
 */

import type { Request, Response } from "express";
import type { AutoModeService } from "../../../services/auto-mode-service.js";
import { createLogger } from "../../../lib/logger.js";
import { getErrorMessage, logError } from "../common.js";

const logger = createLogger("AutoMode");

export function createFollowUpFeatureHandler(autoModeService: AutoModeService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId, prompt, imagePaths, worktreePath } = req.body as {
        projectPath: string;
        featureId: string;
        prompt: string;
        imagePaths?: string[];
        worktreePath?: string;
      };

      if (!projectPath || !featureId || !prompt) {
        res.status(400).json({
          success: false,
          error: "projectPath, featureId, and prompt are required",
        });
        return;
      }

      // Start follow-up in background, using the feature's worktreePath for correct branch
      autoModeService
        .followUpFeature(projectPath, featureId, prompt, imagePaths, worktreePath)
        .catch((error) => {
          logger.error(
            `[AutoMode] Follow up feature ${featureId} error:`,
            error
          );
        });

      res.json({ success: true });
    } catch (error) {
      logError(error, "Follow up feature failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
