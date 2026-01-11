/**
 * POST /open-in-editor endpoint - Open a worktree directory in the default code editor
 * GET /default-editor endpoint - Get the name of the default code editor
 * POST /refresh-editors endpoint - Clear editor cache and re-detect available editors
 *
 * This module uses @automaker/platform for cross-platform editor detection and launching.
 */

import type { Request, Response } from 'express';
import { isAbsolute } from 'path';
import {
  clearEditorCache,
  detectAllEditors,
  detectDefaultEditor,
  openInEditor,
  openInFileManager,
} from '@automaker/platform';
import { createLogger } from '@automaker/utils';
import { getErrorMessage, logError } from '../common.js';

const logger = createLogger('open-in-editor');

export function createGetAvailableEditorsHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const editors = await detectAllEditors();
      res.json({
        success: true,
        result: {
          editors,
        },
      });
    } catch (error) {
      logError(error, 'Get available editors failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

export function createGetDefaultEditorHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const editor = await detectDefaultEditor();
      res.json({
        success: true,
        result: {
          editorName: editor.name,
          editorCommand: editor.command,
        },
      });
    } catch (error) {
      logError(error, 'Get default editor failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

/**
 * Handler to refresh the editor cache and re-detect available editors
 * Useful when the user has installed/uninstalled editors
 */
export function createRefreshEditorsHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      // Clear the cache
      clearEditorCache();

      // Re-detect editors (this will repopulate the cache)
      const editors = await detectAllEditors();

      logger.info(`Editor cache refreshed, found ${editors.length} editors`);

      res.json({
        success: true,
        result: {
          editors,
          message: `Found ${editors.length} available editors`,
        },
      });
    } catch (error) {
      logError(error, 'Refresh editors failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

export function createOpenInEditorHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { worktreePath, editorCommand } = req.body as {
        worktreePath: string;
        editorCommand?: string;
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

      try {
        // Use the platform utility to open in editor
        const result = await openInEditor(worktreePath, editorCommand);
        res.json({
          success: true,
          result: {
            message: `Opened ${worktreePath} in ${result.editorName}`,
            editorName: result.editorName,
          },
        });
      } catch (editorError) {
        // If the specified editor fails, try opening in default file manager as fallback
        logger.warn(
          `Failed to open in editor, falling back to file manager: ${getErrorMessage(editorError)}`
        );

        try {
          const result = await openInFileManager(worktreePath);
          res.json({
            success: true,
            result: {
              message: `Opened ${worktreePath} in ${result.editorName}`,
              editorName: result.editorName,
            },
          });
        } catch (fallbackError) {
          // Both editor and file manager failed
          throw fallbackError;
        }
      }
    } catch (error) {
      logError(error, 'Open in editor failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
