/**
 * POST /send endpoint - Send a message
 */

import type { Request, Response } from 'express';
import { AgentService } from '../../../services/agent-service.js';
import { createLogger } from '@automaker/utils';
import { getErrorMessage, logError } from '../common.js';
const logger = createLogger('Agent');

export function createSendHandler(agentService: AgentService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, message, workingDirectory, imagePaths, model } = req.body as {
        sessionId: string;
        message: string;
        workingDirectory?: string;
        imagePaths?: string[];
        model?: string;
      };

      console.log('[Send Handler] Received request:', {
        sessionId,
        messageLength: message?.length,
        workingDirectory,
        imageCount: imagePaths?.length || 0,
        model,
      });

      if (!sessionId || !message) {
        console.log('[Send Handler] ERROR: Validation failed - missing sessionId or message');
        res.status(400).json({
          success: false,
          error: 'sessionId and message are required',
        });
        return;
      }

      console.log('[Send Handler] Validation passed, calling agentService.sendMessage()');

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
          console.error('[Send Handler] ERROR: Background error in sendMessage():', error);
          logError(error, 'Send message failed (background)');
        });

      console.log('[Send Handler] Returning immediate response to client');

      // Return immediately - responses come via WebSocket
      res.json({ success: true, message: 'Message sent' });
    } catch (error) {
      console.error('[Send Handler] ERROR: Synchronous error:', error);
      logError(error, 'Send message failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
