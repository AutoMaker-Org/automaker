/**
 * POST /send endpoint - Send a message
 */

import type { Request, Response } from "express";
import { AgentService } from "../../../services/agent-service.js";
import { createLogger } from "@automaker/utils";
import { getErrorMessage, logError } from "../common.js";
const logger = createLogger("Agent");

export function createSendHandler(agentService: AgentService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, message, workingDirectory, imagePaths, model } =
        req.body as {
          sessionId: string;
          message: string;
          workingDirectory?: string;
          imagePaths?: string[];
          model?: string;
        };

      if (!sessionId || !message) {
        res.status(400).json({
          success: false,
          error: "sessionId and message are required",
        });
        return;
      }

      // Start the message processing (don't await - it streams via WebSocket)
      agentService
        .sendMessage({
          sessionId,
          message,
          workingDirectory,
          imagePaths,
          model,
        })
        .catch((error) => {
          logError(error, "Send message failed (background)");
        });

      // Return immediately - responses come via WebSocket
      res.json({ success: true, message: "Message sent" });
    } catch (error) {
      logError(error, "Send message failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
