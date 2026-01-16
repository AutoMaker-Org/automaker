/**
 * DELETE /:sessionId endpoint - Delete a session
 */

import type { Request, Response } from 'express';
import { AgentService } from '../../../services/agent-service.js';
import { getErrorMessage, logError } from '../common.js';
import { getStringParam } from '../../../lib/request-utils.js';

export function createDeleteHandler(agentService: AgentService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = getStringParam(req.params.sessionId);
      const success = await agentService.deleteSession(sessionId);

      if (!success) {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Delete session failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
