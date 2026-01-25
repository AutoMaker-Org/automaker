/**
 * Terminal endpoints for opening worktree directories in terminals
 *
 * POST /open-in-terminal - Open in system default terminal (integrated)
 * GET /available-terminals - List all available external terminals
 * GET /default-terminal - Get the default external terminal
 * POST /refresh-terminals - Clear terminal cache and re-detect
 * POST /open-in-external-terminal - Open a directory in an external terminal
 */

import type { Request, Response } from 'express';
import { isAbsolute } from 'path';
import {
  openInTerminal,
  clearTerminalCache,
  detectAllTerminals,
  detectDefaultTerminal,
  openInExternalTerminal,
} from '@automaker/platform';
import { createLogger } from '@automaker/utils';
import { getErrorMessage, logError } from '../common.js';

const logger = createLogger('open-in-terminal');

/**
 * Handler to open in system default terminal (integrated terminal behavior)
 */
export function createOpenInTerminalHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath } = req.body as {
        worktreePath: string;
      };

      if (!worktreePath || typeof worktreePath !== 'string') {
        res.status(400).json({
          success: false,
          error: 'worktreePath required and must be a string',
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

/**
 * Handler to get all available external terminals
 */
export function createGetAvailableTerminalsHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const terminals = await detectAllTerminals();
      res.json({
        success: true,
        result: {
          terminals,
        },
      });
    } catch (error) {
      logError(error, 'Get available terminals failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

/**
 * Handler to get the default external terminal
 */
export function createGetDefaultTerminalHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const terminal = await detectDefaultTerminal();
      res.json({
        success: true,
        result: terminal
          ? {
              terminalId: terminal.id,
              terminalName: terminal.name,
              terminalCommand: terminal.command,
            }
          : null,
      });
    } catch (error) {
      logError(error, 'Get default terminal failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

/**
 * Handler to refresh the terminal cache and re-detect available terminals
 * Useful when the user has installed/uninstalled terminals
 */
export function createRefreshTerminalsHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      // Clear the cache
      clearTerminalCache();

      // Re-detect terminals (this will repopulate the cache)
      const terminals = await detectAllTerminals();

      logger.info(`Terminal cache refreshed, found ${terminals.length} terminals`);

      res.json({
        success: true,
        result: {
          terminals,
          message: `Found ${terminals.length} available external terminals`,
        },
      });
    } catch (error) {
      logError(error, 'Refresh terminals failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

/**
 * Handler to open a directory in an external terminal
 */
export function createOpenInExternalTerminalHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, terminalId } = req.body as {
        worktreePath: string;
        terminalId?: string;
      };

      if (!worktreePath || typeof worktreePath !== 'string') {
        res.status(400).json({
          success: false,
          error: 'worktreePath required and must be a string',
        });
        return;
      }

      if (!isAbsolute(worktreePath)) {
        res.status(400).json({
          success: false,
          error: 'worktreePath must be an absolute path',
        });
        return;
      }

      const result = await openInExternalTerminal(worktreePath, terminalId);
      res.json({
        success: true,
        result: {
          message: `Opened ${worktreePath} in ${result.terminalName}`,
          terminalName: result.terminalName,
        },
      });
    } catch (error) {
      logError(error, 'Open in external terminal failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
