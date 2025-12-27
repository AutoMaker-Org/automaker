/**
 * POST /queue/remove endpoint - Remove a prompt from the queue
 */

import type { Request, Response } from 'express';
import { AgentService } from '../../../services/agent-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createQueueRemoveHandler(agentService: AgentService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, promptId } = req.body as {
        sessionId: string;
        promptId: string;
      };

      if (!sessionId || !promptId) {
        res.status(400).json({
          success: false,
          error: 'sessionId and promptId are required',
        });
        return;
      }

      const result = await agentService.removeFromQueue(sessionId, promptId);
      res.json(result);
    } catch (error) {
      logError(error, 'Remove from queue failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
