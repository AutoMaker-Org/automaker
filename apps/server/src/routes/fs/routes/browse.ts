/**
 * POST /browse endpoint - Browse directories for file browser UI
 */

import type { Request, Response } from 'express';
import * as secureFs from '../../../lib/secure-fs.js';
import os from 'os';
import path from 'path';
import { getAllowedRootDirectory, PathNotAllowedError, isPathAllowed } from '@automaker/platform';
import { getErrorMessage, logError } from '../common.js';

export function createBrowseHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { dirPath } = req.body as { dirPath?: string };

      // Default to ALLOWED_ROOT_DIRECTORY if set, otherwise home directory
      const defaultPath = getAllowedRootDirectory() || os.homedir();
      const targetPath = dirPath ? path.resolve(dirPath) : defaultPath;

      // Detect available drives on Windows
      const detectDrives = async (): Promise<string[]> => {
        if (os.platform() !== 'win32') {
          return [];
        }

        const drives: string[] = [];
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

        for (const letter of letters) {
          const drivePath = `${letter}:\\`;
          try {
            await secureFs.access(drivePath);
            drives.push(drivePath);
          } catch {
            // Drive doesn't exist, skip it
          }
        }

        return drives;
      };

      // Get parent directory - only if it's within the allowed root
      const parentPath = path.dirname(targetPath);

      // Determine if parent navigation should be allowed:
      // 1. Must have a different parent (not at filesystem root)
      // 2. If ALLOWED_ROOT_DIRECTORY is set, parent must be within it
      const hasParent = parentPath !== targetPath && isPathAllowed(parentPath);

      // Security: Don't expose parent path outside allowed root
      const safeParentPath = hasParent ? parentPath : null;

      // Get available drives
      const drives = await detectDrives();

      try {
        const stats = await secureFs.stat(targetPath);

        if (!stats.isDirectory()) {
          res.status(400).json({ success: false, error: 'Path is not a directory' });
          return;
        }

        // Read directory contents
        const entries = await secureFs.readdir(targetPath, { withFileTypes: true });

        // Filter for directories only and add parent directory option
        const directories = entries
          .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
          .map((entry) => ({
            name: entry.name,
            path: path.join(targetPath, entry.name),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        res.json({
          success: true,
          currentPath: targetPath,
          parentPath: safeParentPath,
          directories,
          drives,
        });
      } catch (error) {
        // Handle permission errors gracefully - still return path info so user can navigate away
        const errorMessage = error instanceof Error ? error.message : 'Failed to read directory';
        const isPermissionError = errorMessage.includes('EPERM') || errorMessage.includes('EACCES');

        if (isPermissionError) {
          // Return success with empty directories so user can still navigate to parent
          res.json({
            success: true,
            currentPath: targetPath,
            parentPath: safeParentPath,
            directories: [],
            drives,
            warning:
              'Permission denied - grant Full Disk Access to Terminal in System Preferences > Privacy & Security',
          });
        } else {
          res.status(400).json({
            success: false,
            error: errorMessage,
          });
        }
      }
    } catch (error) {
      // Path not allowed - return 403 Forbidden
      if (error instanceof PathNotAllowedError) {
        res.status(403).json({ success: false, error: getErrorMessage(error) });
        return;
      }

      logError(error, 'Browse directories failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
