/**
 * POST /session/get - Get an ideation session with messages
 */

import type { Request, Response } from 'express';
import type { IdeationService } from '../../../services/ideation-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createSessionGetHandler(ideationService: IdeationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, sessionId } = req.body as {
        projectPath: string;
        sessionId: string;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!sessionId) {
        res.status(400).json({ success: false, error: 'sessionId is required' });
        return;
      }

      const session = await ideationService.getSession(projectPath, sessionId);
      if (!session) {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }

      const isRunning = ideationService.isSessionRunning(sessionId);

      res.json({
        success: true,
        session: { ...session, isRunning },
        messages: session.messages,
      });
    } catch (error) {
      logError(error, 'Get session failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
