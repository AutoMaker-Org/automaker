/**
 * POST /open-in-terminal endpoint - Open a terminal in a worktree directory
 *
 * This module uses @automaker/platform for cross-platform terminal launching.
 */

import type { Request, Response } from 'express';
import { isAbsolute } from 'path';
import { openInTerminal } from '@automaker/platform';
import { getErrorMessage, logError } from '../common.js';

export function createOpenInTerminalHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath } = req.body as {
        worktreePath: string;
      };

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath required',
        });
        return;
      }

      // Security: Validate that worktreePath is an absolute path
      if (!isAbsolute(worktreePath)) {
        res.status(400).json({
          success: false,
          error: 'worktreePath must be an absolute path',
        });
        return;
      }

      // Use the platform utility to open in terminal
      const result = await openInTerminal(worktreePath);
      res.json({
        success: true,
        result: {
          message: `Opened terminal in ${worktreePath}`,
          terminalName: result.terminalName,
        },
      });
    } catch (error) {
      logError(error, 'Open in terminal failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
