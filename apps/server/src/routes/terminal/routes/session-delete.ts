/**
 * DELETE /sessions/:id endpoint - Kill a terminal session
 */

import type { Request, Response } from 'express';
import { getTerminalService } from '../../../services/terminal-service.js';
import { getStringParam } from '../../../lib/request-utils/index.js';

export function createSessionDeleteHandler() {
  return (req: Request, res: Response): void => {
    const terminalService = getTerminalService();
    const id = getStringParam(req.params.id);
    const killed = terminalService.killSession(id);

    if (!killed) {
      res.status(404).json({
        success: false,
        error: 'Session not found',
      });
      return;
    }

    res.json({
      success: true,
    });
  };
}
