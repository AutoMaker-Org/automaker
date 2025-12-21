/**
 * POST /approve-plan endpoint - Approve or reject a generated plan/spec
 */

import type { Request, Response } from "express";
import type { AutoModeService } from "../../../services/auto-mode-service.js";
import { createLogger } from "@automaker/utils";
import { getErrorMessage, logError } from "../common.js";

const logger = createLogger("AutoMode");

export function createApprovePlanHandler(autoModeService: AutoModeService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { featureId, approved, editedPlan, feedback, projectPath } = req.body as {
        featureId: string;
        approved: boolean;
        editedPlan?: string;
        feedback?: string;
        projectPath?: string;
      };

      if (!featureId) {
        res.status(400).json({
          success: false,
          error: "featureId is required",
        });
        return;
      }

      if (typeof approved !== "boolean") {
        res.status(400).json({
          success: false,
          error: "approved must be a boolean",
        });
        return;
      }

      // Note: We no longer check hasPendingApproval here because resolvePlanApproval
      // can handle recovery when pending approval is not in Map but feature has planSpec.status='generated'
      // This supports cases where the server restarted while waiting for approval

      logger.info(
        `[AutoMode] Plan ${approved ? "approved" : "rejected"} for feature ${featureId}${
          editedPlan ? " (with edits)" : ""
        }${feedback ? ` - Feedback: ${feedback}` : ""}`
      );

      // Resolve the pending approval (with recovery support)
      const result = await autoModeService.resolvePlanApproval(
        featureId,
        approved,
        editedPlan,
        feedback,
        projectPath
      );

      if (!result.success) {
        res.status(500).json({
          success: false,
          error: result.error,
        });
        return;
      }

      res.json({
        success: true,
        approved,
        message: approved
          ? "Plan approved - implementation will continue"
          : "Plan rejected - feature execution stopped",
      });
    } catch (error) {
      logError(error, "Approve plan failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
