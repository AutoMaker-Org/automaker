/**
 * POST /commit-feature endpoint - Commit feature changes
 */

import type { Request, Response } from "express";
import type { AutoModeService } from "../../../services/auto-mode-service.js";
import { getErrorMessage, logError } from "../common.js";

export function createCommitFeatureHandler(autoModeService: AutoModeService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId, worktreePath } = req.body as {
        projectPath: string;
        featureId: string;
        worktreePath?: string;
      };

      if (!projectPath || !featureId) {
        res
          .status(400)
          .json({
            success: false,
            error: "projectPath and featureId are required",
          });
        return;
      }

      const commitHash = await autoModeService.commitFeature(
        projectPath,
        featureId,
        worktreePath
      );
      res.json({ success: true, commitHash });
    } catch (error) {
      logError(error, "Commit feature failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
