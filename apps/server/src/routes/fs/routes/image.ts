/**
 * GET /image endpoint - Serve image files
 *
 * Requires authentication via auth middleware:
 * - apiKey query parameter (Electron mode)
 * - token query parameter (web mode)
 * - session cookie (web mode)
 * - X-API-Key header (Electron mode)
 * - X-Session-Token header (web mode)
 */

import type { Request, Response } from 'express';
import * as secureFs from '../../../lib/secure-fs.js';
import path from 'path';
import { PathNotAllowedError } from '@automaker/platform';
import { getErrorMessage, logError } from '../common.js';

export function createImageHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { path: imagePath, projectPath } = req.query as {
        path?: string;
        projectPath?: string;
      };

      if (!imagePath) {
        res.status(400).json({ success: false, error: 'path is required' });
        return;
      }

      // Resolve full path
      const fullPath = path.isAbsolute(imagePath)
        ? imagePath
        : projectPath
          ? path.join(projectPath, imagePath)
          : imagePath;

      // Check if file exists
      try {
        await secureFs.access(fullPath);
      } catch (accessError) {
        if (accessError instanceof PathNotAllowedError) {
          res.status(403).json({ success: false, error: 'Path not allowed' });
          return;
        }
        res.status(404).json({ success: false, error: 'Image not found' });
        return;
      }

      // Read the file
      const buffer = await secureFs.readFile(fullPath);

      // Determine MIME type from extension
      const ext = path.extname(fullPath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.bmp': 'image/bmp',
      };

      res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(buffer);
    } catch (error) {
      logError(error, 'Serve image failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
