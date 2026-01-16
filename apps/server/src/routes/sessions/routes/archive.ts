/**
 * POST /:sessionId/archive endpoint - Archive a session
 */

import type { Request, Response } from 'express';
import { AgentService } from '../../../services/agent-service.js';
import { getErrorMessage, logError } from '../common.js';
import { getStringParam } from '../../../lib/request-utils/index.js';

export function createArchiveHandler(agentService: AgentService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = getStringParam(req.params.sessionId);
      if (!sessionId) {
        res.status(400).json({ success: false, error: 'sessionId is required' });
        return;
      }
      const success = await agentService.archiveSession(sessionId);

      if (!success) {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Archive session failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
