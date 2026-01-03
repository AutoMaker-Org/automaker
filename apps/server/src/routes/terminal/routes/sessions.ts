/**
 * GET /sessions endpoint - List all active terminal sessions
 * POST /sessions endpoint - Create a new terminal session
 */

import type { Request, Response } from 'express';
import { getTerminalService } from '../../../services/terminal-service.js';
import { getErrorMessage, logError } from '../common.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('Terminal');

export function createSessionsListHandler() {
  return (_req: Request, res: Response): void => {
    const terminalService = getTerminalService();
    const sessions = terminalService.getAllSessions();
    res.json({
      success: true,
      data: sessions,
    });
  };
}

export function createSessionsCreateHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const terminalService = getTerminalService();
      const { cwd, cols, rows, shell } = req.body;

      const session = await terminalService.createSession({
        cwd,
        cols: cols || 80,
        rows: rows || 24,
        shell,
      });

      // Check if session creation was refused due to limit
      if (!session) {
        const maxSessions = terminalService.getMaxSessions();
        const currentSessions = terminalService.getSessionCount();
        logger.warn(`Session limit reached: ${currentSessions}/${maxSessions}`);
        res.status(429).json({
          success: false,
          error: 'Maximum terminal sessions reached',
          details: `Server limit is ${maxSessions} concurrent sessions. Please close unused terminals.`,
          currentSessions,
          maxSessions,
        });
        return;
      }

      res.json({
        success: true,
        data: {
          id: session.id,
          cwd: session.cwd,
          shell: session.shell,
          createdAt: session.createdAt,
        },
      });
    } catch (error) {
      logError(error, 'Create terminal session failed');
      res.status(500).json({
        success: false,
        error: 'Failed to create terminal session',
        details: getErrorMessage(error),
      });
    }
  };
}
