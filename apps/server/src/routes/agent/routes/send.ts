/**
 * POST /send endpoint - Send a message
 */

import type { Request, Response } from 'express';
import type { ThinkingLevel } from '@automaker/types';
import { AgentService } from '../../../services/agent-service.js';
import { createLogger } from '@automaker/utils';
import { getErrorMessage, logError } from '../common.js';
const logger = createLogger('Agent');

export function createSendHandler(agentService: AgentService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, message, workingDirectory, imagePaths, model, thinkingLevel } =
        req.body as {
          sessionId: string;
          message: string;
          workingDirectory?: string;
          imagePaths?: string[];
          model?: string;
          thinkingLevel?: ThinkingLevel;
        };

      logger.debug('Received request:', {
        sessionId,
        messageLength: message?.length,
        workingDirectory,
        imageCount: imagePaths?.length || 0,
        model,
        thinkingLevel,
      });

      if (!sessionId || !message) {
        logger.warn('Validation failed - missing sessionId or message');
        res.status(400).json({
          success: false,
          error: 'sessionId and message are required',
        });
        return;
      }

      logger.debug('Validation passed, calling agentService.sendMessage()');

      // Start the message processing (don't await - it streams via WebSocket)
      agentService
        .sendMessage({
          sessionId,
          message,
          workingDirectory,
          imagePaths,
          model,
          thinkingLevel,
        })
        .catch((error) => {
          logger.error('Background error in sendMessage():', error);
          logError(error, 'Send message failed (background)');
        });

      logger.debug('Returning immediate response to client');

      // Return immediately - responses come via WebSocket
      res.json({ success: true, message: 'Message sent' });
    } catch (error) {
      logger.error('Synchronous error:', error);
      logError(error, 'Send message failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
