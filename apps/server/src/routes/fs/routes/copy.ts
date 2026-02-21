/**
 * POST /copy endpoint - Copy file or directory to a new location
 */

import type { Request, Response } from 'express';
import * as secureFs from '../../../lib/secure-fs.js';
import path from 'path';
import { PathNotAllowedError } from '@automaker/platform';
import { mkdirSafe } from '@automaker/utils';
import { getErrorMessage, logError } from '../common.js';

/**
 * Recursively copy a directory and its contents
 */
async function copyDirectoryRecursive(src: string, dest: string): Promise<void> {
  await mkdirSafe(dest);
  const entries = await secureFs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryRecursive(srcPath, destPath);
    } else {
      await secureFs.copyFile(srcPath, destPath);
    }
  }
}

export function createCopyHandler() {
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

      // Prevent copying a folder into itself or its own descendant (infinite recursion)
      const resolvedSrc = path.resolve(sourcePath);
      const resolvedDest = path.resolve(destinationPath);
      if (resolvedDest === resolvedSrc || resolvedDest.startsWith(resolvedSrc + path.sep)) {
        res.status(400).json({
          success: false,
          error: 'Cannot copy a folder into itself or one of its own descendants',
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
        // If overwrite is true, remove the existing destination first to avoid merging
        await secureFs.rm(destinationPath, { recursive: true });
      } catch {
        // Destination doesn't exist - good to proceed
      }

      // Ensure parent directory exists
      await mkdirSafe(path.dirname(path.resolve(destinationPath)));

      // Check if source is a directory
      const stats = await secureFs.stat(sourcePath);

      if (stats.isDirectory()) {
        await copyDirectoryRecursive(sourcePath, destinationPath);
      } else {
        await secureFs.copyFile(sourcePath, destinationPath);
      }

      res.json({ success: true });
    } catch (error) {
      if (error instanceof PathNotAllowedError) {
        res.status(403).json({ success: false, error: getErrorMessage(error) });
        return;
      }

      logError(error, 'Copy file failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
