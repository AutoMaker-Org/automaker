/**
 * Init Script routes - Read/write/run the worktree-init.sh file
 *
 * POST /init-script - Read the init script content
 * PUT /init-script - Write content to the init script file
 * DELETE /init-script - Delete the init script file
 * POST /run-init-script - Run the init script for a worktree
 */

import type { Request, Response } from 'express';
import path from 'path';
import * as secureFs from '../../../lib/secure-fs.js';
import { getErrorMessage, logError, isValidBranchName } from '../common.js';
import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../../../lib/events.js';
import { forceRunInitScript } from '../../../services/init-script-service.js';

const logger = createLogger('InitScript');

/** Fixed path for init script within .automaker directory */
const INIT_SCRIPT_FILENAME = 'worktree-init.sh';

/** Maximum allowed size for init scripts (1MB) */
const MAX_SCRIPT_SIZE_BYTES = 1024 * 1024;

/**
 * Get the full path to the init script for a project
 */
function getInitScriptPath(projectPath: string): string {
  return path.join(projectPath, '.automaker', INIT_SCRIPT_FILENAME);
}

/**
 * GET /init-script - Read the init script content
 */
export function createGetInitScriptHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const rawProjectPath = req.query.projectPath;

      // Validate projectPath is a non-empty string (not an array or undefined)
      if (!rawProjectPath || typeof rawProjectPath !== 'string') {
        res.status(400).json({
          success: false,
          error: 'projectPath query parameter is required',
        });
        return;
      }

      const projectPath = rawProjectPath.trim();
      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath cannot be empty',
        });
        return;
      }

      const scriptPath = getInitScriptPath(projectPath);

      try {
        const content = await secureFs.readFile(scriptPath, 'utf-8');
        res.json({
          success: true,
          exists: true,
          content: content as string,
          path: scriptPath,
        });
      } catch {
        // File doesn't exist
        res.json({
          success: true,
          exists: false,
          content: '',
          path: scriptPath,
        });
      }
    } catch (error) {
      logError(error, 'Read init script failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

/**
 * PUT /init-script - Write content to the init script file
 */
export function createPutInitScriptHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, content } = req.body as {
        projectPath: string;
        content: string;
      };

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      if (typeof content !== 'string') {
        res.status(400).json({
          success: false,
          error: 'content must be a string',
        });
        return;
      }

      // Validate script size to prevent disk exhaustion
      const sizeBytes = Buffer.byteLength(content, 'utf-8');
      if (sizeBytes > MAX_SCRIPT_SIZE_BYTES) {
        res.status(400).json({
          success: false,
          error: `Script size (${Math.round(sizeBytes / 1024)}KB) exceeds maximum allowed size (${Math.round(MAX_SCRIPT_SIZE_BYTES / 1024)}KB)`,
        });
        return;
      }

      // Log warning if potentially dangerous patterns are detected (non-blocking)
      const dangerousPatterns = [
        /rm\s+-rf\s+\/(?!\s*\$)/i, // rm -rf / (not followed by variable)
        /curl\s+.*\|\s*(?:bash|sh)/i, // curl | bash
        /wget\s+.*\|\s*(?:bash|sh)/i, // wget | sh
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(content)) {
          logger.warn(
            `Init script contains potentially dangerous pattern: ${pattern.source}. User responsibility to verify script safety.`
          );
        }
      }

      const scriptPath = getInitScriptPath(projectPath);
      const automakerDir = path.dirname(scriptPath);

      // Ensure .automaker directory exists
      await secureFs.mkdir(automakerDir, { recursive: true });

      // Write the script content
      await secureFs.writeFile(scriptPath, content, 'utf-8');

      logger.info(`Wrote init script to ${scriptPath}`);

      res.json({
        success: true,
        path: scriptPath,
      });
    } catch (error) {
      logError(error, 'Write init script failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

/**
 * DELETE /init-script - Delete the init script file
 */
export function createDeleteInitScriptHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      const scriptPath = getInitScriptPath(projectPath);

      await secureFs.rm(scriptPath, { force: true });
      logger.info(`Deleted init script at ${scriptPath}`);
      res.json({
        success: true,
      });
    } catch (error) {
      logError(error, 'Delete init script failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

/**
 * POST /run-init-script - Run (or re-run) the init script for a worktree
 */
export function createRunInitScriptHandler(events: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, worktreePath, branch } = req.body as {
        projectPath: string;
        worktreePath: string;
        branch: string;
      };

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath is required',
        });
        return;
      }

      if (!worktreePath) {
        res.status(400).json({
          success: false,
          error: 'worktreePath is required',
        });
        return;
      }

      if (!branch) {
        res.status(400).json({
          success: false,
          error: 'branch is required',
        });
        return;
      }

      // Validate branch name to prevent injection via environment variables
      if (!isValidBranchName(branch)) {
        res.status(400).json({
          success: false,
          error:
            'Invalid branch name. Branch names must contain only letters, numbers, dots, hyphens, underscores, and forward slashes.',
        });
        return;
      }

      const scriptPath = getInitScriptPath(projectPath);

      // Check if script exists
      try {
        await secureFs.access(scriptPath);
      } catch {
        res.status(404).json({
          success: false,
          error: 'No init script found. Create one in Settings > Worktrees.',
        });
        return;
      }

      logger.info(`Running init script for branch "${branch}" (forced)`);

      // Run the script asynchronously (non-blocking)
      forceRunInitScript({
        projectPath,
        worktreePath,
        branch,
        emitter: events,
      });

      // Return immediately - progress will be streamed via WebSocket events
      res.json({
        success: true,
        message: 'Init script started',
      });
    } catch (error) {
      logError(error, 'Run init script failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
