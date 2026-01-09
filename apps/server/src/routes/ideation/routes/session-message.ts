/**
 * POST /session/message - Send a message in an ideation session
 */

import type { Request, Response } from 'express';
import type { IdeationService } from '../../../services/ideation-service.js';
import type { SendMessageOptions } from '@automaker/types';
import { getErrorMessage, logError } from '../common.js';

export function createSessionMessageHandler(ideationService: IdeationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, message, options } = req.body as {
        sessionId: string;
        message: string;
        options?: SendMessageOptions;
      };

      if (!sessionId) {
        res.status(400).json({ success: false, error: 'sessionId is required' });
        return;
      }

      if (!message) {
        res.status(400).json({ success: false, error: 'message is required' });
        return;
      }

      // This is async but we don't await - responses come via WebSocket
      ideationService.sendMessage(sessionId, message, options).catch((error) => {
        logError(error, 'Send message failed (async)');
      });

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Send message failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
