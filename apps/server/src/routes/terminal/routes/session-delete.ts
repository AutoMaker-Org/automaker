/**
 * DELETE /sessions/:id endpoint - Kill a terminal session
 */

import type { Request, Response } from 'express';
import { getTerminalService } from '../../../services/terminal-service.js';

export function createSessionDeleteHandler() {
  return (req: Request, res: Response): void => {
    const terminalService = getTerminalService();
    const id = req.params.id as string;
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
