/**
 * POST /deauth-claude endpoint - Sign out from Claude CLI
 */

import type { Request, Response } from 'express';
import { logError } from '../common.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Marker file location must be consistent with:
// - get-claude-status.ts (reads from .automaker/)
// - auth-claude.ts (deletes from .automaker/)
// - provider-factory.ts (checks in .automaker/)
const AUTOMAKER_DIR = '.automaker';
const DISCONNECTED_MARKER = '.claude-disconnected';

export function createDeauthClaudeHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const projectRoot = process.cwd();
      const automakerDir = path.join(projectRoot, AUTOMAKER_DIR);
      const markerPath = path.join(automakerDir, DISCONNECTED_MARKER);

      // Ensure .automaker directory exists
      await fs.mkdir(automakerDir, { recursive: true });

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

      // Return generic error to client (security: don't expose paths)
      // Detailed diagnostics are in server logs
      const nodeError = error as NodeJS.ErrnoException;
      let userMessage = 'Failed to disconnect Claude CLI';
      if (nodeError.code === 'EACCES') {
        userMessage = 'Permission denied. Check directory permissions.';
      } else if (nodeError.code === 'ENOSPC') {
        userMessage = 'No space left on device.';
      } else if (nodeError.code === 'EROFS') {
        userMessage = 'Read-only filesystem. Check volume mounts.';
      }

      res.status(500).json({
        success: false,
        error: userMessage,
      });
    }
  };
}
