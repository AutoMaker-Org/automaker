/**
 * POST /model endpoint - Change model for session
 */

import type { Request, Response } from 'express';
import { AgentService } from '../../../services/agent-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createModelHandler(_agentService: AgentService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, model } = req.body as { sessionId: string; model: string };

      if (!sessionId) {
        res.status(400).json({ success: false, error: 'sessionId is required' });
        return;
      }

      if (!model) {
        res.status(400).json({ success: false, error: 'model is required' });
        return;
      }

      // Model changes are not yet implemented
      res.json({ success: true, message: 'Model change acknowledged' });
    } catch (error) {
      logError(error, 'Change model failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
