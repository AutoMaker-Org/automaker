/**
 * POST /deauth-claude endpoint - Sign out from Claude CLI
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Use DATA_DIR for Docker compatibility (fixes #395)
// Default to ./data resolved to absolute path for consistent behavior
const DATA_DIR = process.env.DATA_DIR || path.resolve('./data');

export function createDeauthClaudeHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      // Create a marker file to indicate the CLI is disconnected from the app
      // Use DATA_DIR instead of process.cwd() for Docker write permissions
      const markerPath = path.join(DATA_DIR, '.claude-disconnected');

      // Ensure DATA_DIR exists (fixes #395 - Docker permission error)
      // mkdir with recursive: true is idempotent
      await fs.mkdir(DATA_DIR, { recursive: true });

      // Create the marker file with timestamp
      await fs.writeFile(
        markerPath,
        JSON.stringify({
          disconnectedAt: new Date().toISOString(),
          message: 'Claude CLI is disconnected from the app',
        })
      );

      res.json({
        success: true,
        message: 'Claude CLI is now disconnected from the app',
      });
    } catch (error) {
      logError(error, 'Deauth Claude failed');

      // Provide specific error messages for common file system errors
      const nodeError = error as NodeJS.ErrnoException;
      let message = 'Failed to disconnect Claude CLI from the app';
      if (nodeError.code === 'EACCES') {
        message = `Permission denied writing to DATA_DIR (${DATA_DIR}). Check directory permissions.`;
      } else if (nodeError.code === 'ENOENT') {
        message = `DATA_DIR path does not exist: ${DATA_DIR}`;
      } else if (nodeError.code === 'ENOSPC') {
        message = 'No space left on device';
      }

      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        message,
      });
    }
  };
}
