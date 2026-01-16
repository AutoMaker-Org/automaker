/**
 * PUT /:sessionId endpoint - Update a session
 */

import type { Request, Response } from 'express';
import { AgentService } from '../../../services/agent-service.js';
import { getErrorMessage, logError } from '../common.js';
import { getStringParam } from '../../../lib/request-utils/index.js';

export function createUpdateHandler(agentService: AgentService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = getStringParam(req.params.sessionId);
      if (!sessionId) {
        res.status(400).json({ success: false, error: 'sessionId is required' });
        return;
      }
      const { name, tags, model } = req.body as {
        name?: string;
        tags?: string[];
        model?: string;
      };

      const session = await agentService.updateSession(sessionId, {
        name,
        tags,
        model,
      });
      if (!session) {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      res.json({ success: true, session });
    } catch (error) {
      logError(error, 'Update session failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
