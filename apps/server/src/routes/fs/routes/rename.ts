/**
 * POST /rename endpoint - Rename/move file or directory
 */

import type { Request, Response } from 'express';
import * as secureFs from '../../../lib/secure-fs.js';
import { PathNotAllowedError } from '@automaker/platform';
import { getErrorMessage, logError } from '../common.js';

export function createRenameHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { oldPath, newPath } = req.body as {
        oldPath: string;
        newPath: string;
      };

      if (!oldPath) {
        res.status(400).json({ success: false, error: 'oldPath is required' });
        return;
      }

      if (!newPath) {
        res.status(400).json({ success: false, error: 'newPath is required' });
        return;
      }

      await secureFs.rename(oldPath, newPath);

      res.json({ success: true });
    } catch (error) {
      // Path not allowed - return 403 Forbidden
      if (error instanceof PathNotAllowedError) {
        res.status(403).json({ success: false, error: getErrorMessage(error) });
        return;
      }

      logError(error, 'Rename failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
