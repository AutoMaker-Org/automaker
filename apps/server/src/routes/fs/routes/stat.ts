/**
 * POST /stat endpoint - Get file stats
 */

import type { Request, Response } from 'express';
import * as secureFs from '../../../lib/secure-fs.js';
import { PathNotAllowedError } from '@automaker/platform';
import { getErrorMessage, logError } from '../common.js';

export function createStatHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { filePath } = req.body as { filePath: string };

      if (!filePath) {
        res.status(400).json({ success: false, error: 'filePath is required' });
        return;
      }

      const stats = await secureFs.stat(filePath);

      res.json({
        success: true,
        stats: {
          isDirectory: stats.isDirectory(),
          isFile: stats.isFile(),
          size: stats.size,
          mtime: stats.mtime,
        },
      });
    } catch (error) {
      // Path not allowed - return 403 Forbidden
      if (error instanceof PathNotAllowedError) {
        res.status(403).json({ success: false, error: getErrorMessage(error) });
        return;
      }

      // File or directory does not exist - return 404 so UI can handle missing paths
      const code =
        error && typeof error === 'object' && 'code' in error
          ? (error as { code: string }).code
          : '';
      if (code === 'ENOENT') {
        res.status(404).json({ success: false, error: 'File or directory not found' });
        return;
      }

      logError(error, 'Get file stats failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
