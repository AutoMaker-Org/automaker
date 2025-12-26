/**
 * POST /queue/add endpoint - Add a prompt to the queue
 */

import type { Request, Response } from 'express';
import { AgentService } from '../../../services/agent-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createQueueAddHandler(agentService: AgentService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, message, imagePaths, model } = req.body as {
        sessionId: string;
        message: string;
        imagePaths?: string[];
        model?: string;
      };

      if (!sessionId || !message) {
        res.status(400).json({
          success: false,
          error: 'sessionId and message are required',
        });
        return;
      }

      const result = await agentService.addToQueue(sessionId, { message, imagePaths, model });
      res.json(result);
    } catch (error) {
      logError(error, 'Add to queue failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
