/**
 * POST /validate-path endpoint - Validate and add path to allowed list
 */

import type { Request, Response } from 'express';
import * as secureFs from '../../../lib/secure-fs.js';
import path from 'path';
import { isPathAllowed, PathNotAllowedError, getAllowedRootDirectory } from '@automaker/platform';
import { getErrorMessage, logError } from '../common.js';

export function createValidatePathHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { filePath } = req.body as { filePath: string };

      if (!filePath) {
        res.status(400).json({ success: false, error: 'filePath is required' });
        return;
      }

      const resolvedPath = path.resolve(filePath);

      // Validate path against ALLOWED_ROOT_DIRECTORY before checking if it exists
      if (!isPathAllowed(resolvedPath)) {
        const allowedRoot = getAllowedRootDirectory();
        const errorMessage = allowedRoot
          ? `Path not allowed: ${filePath}. Must be within ALLOWED_ROOT_DIRECTORY: ${allowedRoot}`
          : `Path not allowed: ${filePath}`;
        res.status(403).json({
          success: false,
          error: errorMessage,
          isAllowed: false,
        });
        return;
      }

      // Check if path exists
      try {
        const stats = await secureFs.stat(resolvedPath);

        if (!stats.isDirectory()) {
          res.status(400).json({ success: false, error: 'Path is not a directory' });
          return;
        }

        res.json({
          success: true,
          path: resolvedPath,
          isAllowed: true,
        });
      } catch {
        res.status(400).json({ success: false, error: 'Path does not exist' });
      }
    } catch (error) {
      logError(error, 'Validate path failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
