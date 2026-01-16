/**
 * POST /sessions/:id/resize endpoint - Resize a terminal session
 */

import type { Request, Response } from 'express';
import { getTerminalService } from '../../../services/terminal-service.js';
import { getStringParam } from '../../../lib/request-utils/index.js';

export function createSessionResizeHandler() {
  return (req: Request, res: Response): void => {
    const terminalService = getTerminalService();
    const id = getStringParam(req.params.id);
    const { cols, rows } = req.body;

    if (!cols || !rows) {
      res.status(400).json({
        success: false,
        error: 'cols and rows are required',
      });
      return;
    }

    const resized = terminalService.resize(id, cols, rows);

    if (!resized) {
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
