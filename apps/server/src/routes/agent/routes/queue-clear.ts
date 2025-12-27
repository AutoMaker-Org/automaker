/**
 * POST /queue/clear endpoint - Clear all prompts from the queue
 */

import type { Request, Response } from 'express';
import { AgentService } from '../../../services/agent-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createQueueClearHandler(agentService: AgentService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.body as { sessionId: string };

      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: 'sessionId is required',
        });
        return;
      }

      const result = await agentService.clearQueue(sessionId);
      res.json(result);
    } catch (error) {
      logError(error, 'Clear queue failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
