/**
 * GET /sessions endpoint - List all active terminal sessions
 * POST /sessions endpoint - Create a new terminal session
 */

import type { Request, Response } from "express";
import { getTerminalService } from "../../../services/terminal-service.js";
import { getErrorMessage, logError } from "../common.js";
import { createLogger } from "@automaker/utils";

const logger = createLogger("Terminal");

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
  return (req: Request, res: Response): void => {
    try {
      const terminalService = getTerminalService();
      const { cwd, cols, rows, shell } = req.body;

      const session = terminalService.createSession({
        cwd,
        cols: cols || 80,
        rows: rows || 24,
        shell,
      });

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
      logError(error, "Create terminal session failed");
      res.status(500).json({
        success: false,
        error: "Failed to create terminal session",
        details: getErrorMessage(error),
      });
    }
  };
}
