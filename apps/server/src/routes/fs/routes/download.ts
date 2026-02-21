/**
 * POST /download endpoint - Download a file, or GET /download for streaming
 * For folders, creates a zip archive on the fly
 */

import type { Request, Response } from 'express';
import * as secureFs from '../../../lib/secure-fs.js';
import path from 'path';
import { PathNotAllowedError } from '@automaker/platform';
import { getErrorMessage, logError } from '../common.js';
import { createReadStream } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';

const execFileAsync = promisify(execFile);

/**
 * Get total size of a directory recursively
 */
async function getDirectorySize(dirPath: string): Promise<number> {
  let totalSize = 0;
  const entries = await secureFs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      totalSize += await getDirectorySize(entryPath);
    } else {
      const stats = await secureFs.stat(entryPath);
      totalSize += Number(stats.size);
    }
  }

  return totalSize;
}

export function createDownloadHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { filePath } = req.body as { filePath: string };

      if (!filePath) {
        res.status(400).json({ success: false, error: 'filePath is required' });
        return;
      }

      const stats = await secureFs.stat(filePath);
      const fileName = path.basename(filePath);

      if (stats.isDirectory()) {
        // For directories, create a zip archive
        const dirSize = await getDirectorySize(filePath);
        const MAX_DIR_SIZE = 100 * 1024 * 1024; // 100MB limit

        if (dirSize > MAX_DIR_SIZE) {
          res.status(413).json({
            success: false,
            error: `Directory is too large to download (${(dirSize / (1024 * 1024)).toFixed(1)}MB). Maximum size is ${MAX_DIR_SIZE / (1024 * 1024)}MB.`,
            size: dirSize,
          });
          return;
        }

        // Create a temporary zip file
        const zipFileName = `${fileName}.zip`;
        const tmpZipPath = path.join(tmpdir(), `automaker-download-${Date.now()}-${zipFileName}`);

        try {
          // Use system zip command (available on macOS and Linux)
          // Use execFile to avoid shell injection via user-provided paths
          await execFileAsync('zip', ['-r', tmpZipPath, fileName], {
            cwd: path.dirname(filePath),
            maxBuffer: 50 * 1024 * 1024,
          });

          const zipStats = await secureFs.stat(tmpZipPath);

          res.setHeader('Content-Type', 'application/zip');
          res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
          res.setHeader('Content-Length', zipStats.size.toString());
          res.setHeader('X-Directory-Size', dirSize.toString());

          const stream = createReadStream(tmpZipPath);
          stream.pipe(res);

          stream.on('end', async () => {
            // Cleanup temp file
            try {
              await secureFs.rm(tmpZipPath);
            } catch {
              // Ignore cleanup errors
            }
          });

          stream.on('error', async (err) => {
            logError(err, 'Download stream error');
            try {
              await secureFs.rm(tmpZipPath);
            } catch {
              // Ignore cleanup errors
            }
            if (!res.headersSent) {
              res.status(500).json({ success: false, error: 'Stream error during download' });
            }
          });
        } catch (zipError) {
          // Cleanup on zip failure
          try {
            await secureFs.rm(tmpZipPath);
          } catch {
            // Ignore
          }
          throw zipError;
        }
      } else {
        // For individual files, stream directly
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Length', stats.size.toString());

        const stream = createReadStream(filePath);
        stream.pipe(res);

        stream.on('error', (err) => {
          logError(err, 'Download stream error');
          if (!res.headersSent) {
            res.status(500).json({ success: false, error: 'Stream error during download' });
          }
        });
      }
    } catch (error) {
      if (error instanceof PathNotAllowedError) {
        res.status(403).json({ success: false, error: getErrorMessage(error) });
        return;
      }

      logError(error, 'Download failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
