/**
 * POST /move endpoint - Move (rename) file or directory to a new location
 */

import type { Request, Response } from 'express';
import * as secureFs from '../../../lib/secure-fs.js';
import path from 'path';
import { PathNotAllowedError } from '@automaker/platform';
import { mkdirSafe } from '@automaker/utils';
import { getErrorMessage, logError } from '../common.js';

export function createMoveHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { sourcePath, destinationPath, overwrite } = req.body as {
        sourcePath: string;
        destinationPath: string;
        overwrite?: boolean;
      };

      if (!sourcePath || !destinationPath) {
        res
          .status(400)
          .json({ success: false, error: 'sourcePath and destinationPath are required' });
        return;
      }

      // Prevent moving to same location or into its own descendant
      const resolvedSrc = path.resolve(sourcePath);
      const resolvedDest = path.resolve(destinationPath);
      if (resolvedDest === resolvedSrc) {
        // No-op: source and destination are the same
        res.json({ success: true });
        return;
      }
      if (resolvedDest.startsWith(resolvedSrc + path.sep)) {
        res.status(400).json({
          success: false,
          error: 'Cannot move a folder into one of its own descendants',
        });
        return;
      }

      // Check if destination already exists
      try {
        await secureFs.stat(destinationPath);
        // Destination exists
        if (!overwrite) {
          res.status(409).json({
            success: false,
            error: 'Destination already exists',
            exists: true,
          });
          return;
        }
        // If overwrite is true, remove the existing destination first
        await secureFs.rm(destinationPath, { recursive: true });
      } catch {
        // Destination doesn't exist - good to proceed
      }

      // Ensure parent directory exists
      await mkdirSafe(path.dirname(path.resolve(destinationPath)));

      // Use rename for the move operation
      await secureFs.rename(sourcePath, destinationPath);

      res.json({ success: true });
    } catch (error) {
      if (error instanceof PathNotAllowedError) {
        res.status(403).json({ success: false, error: getErrorMessage(error) });
        return;
      }

      logError(error, 'Move file failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
