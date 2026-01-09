/**
 * POST /session/stop - Stop an ideation session
 */

import type { Request, Response } from 'express';
import type { EventEmitter } from '../../../lib/events.js';
import type { IdeationService } from '../../../services/ideation-service.js';
import { getErrorMessage, logError } from '../common.js';

export function createSessionStopHandler(events: EventEmitter, ideationService: IdeationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, projectPath } = req.body as {
        sessionId: string;
        projectPath?: string;
      };

      if (!sessionId) {
        res.status(400).json({ success: false, error: 'sessionId is required' });
        return;
      }

      await ideationService.stopSession(sessionId);

      // Emit session stopped event for frontend notification
      // Note: The service also emits 'ideation:session-ended' internally,
      // but we emit here as well for route-level consistency with other routes
      events.emit('ideation:session-ended', {
        sessionId,
        projectPath,
      });

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Stop session failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
