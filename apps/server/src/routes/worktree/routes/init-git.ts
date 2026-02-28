/**
 * POST /init-git endpoint - Initialize a git repository in a directory
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as secureFs from '../../../lib/secure-fs.js';
import { join } from 'path';
import { getErrorMessage, logError } from '../common.js';

const execAsync = promisify(exec);

export function createInitGitHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as {
        projectPath: string;
      };

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath required',
        });
        return;
      }

      // Check if .git already exists
      const gitDirPath = join(projectPath, '.git');
      try {
        await secureFs.access(gitDirPath);
        // .git exists
        res.json({
          success: true,
          result: {
            initialized: false,
            message: 'Git repository already exists',
          },
        });
        return;
      } catch {
        // .git doesn't exist, continue with initialization
      }

      // Initialize git with 'main' as the default branch (matching GitHub's standard since 2020)
      // Run commands sequentially so failures can be handled and partial state cleaned up.
      let gitDirCreated = false;
      try {
        // Step 1: initialize the repository
        try {
          await execAsync(`git init --initial-branch=main`, { cwd: projectPath });
        } catch (initError: unknown) {
          const stderr =
            initError && typeof initError === 'object' && 'stderr' in initError
              ? String((initError as { stderr?: string }).stderr)
              : '';
          // Idempotent: if .git was created by a concurrent request or a stale lock exists,
          // treat as "repo already exists" instead of failing
          if (
            /could not lock config file.*File exists|fatal: could not set 'core\.repositoryformatversion'/.test(
              stderr
            )
          ) {
            try {
              await secureFs.access(gitDirPath);
              res.json({
                success: true,
                result: {
                  initialized: false,
                  message: 'Git repository already exists',
                },
              });
              return;
            } catch {
              // .git still missing, rethrow original error
            }
          }
          throw initError;
        }
        gitDirCreated = true;

        // Step 2: ensure user.name and user.email are set so the commit can succeed.
        // Check the global/system config first; only set locally if missing.
        let userName = '';
        let userEmail = '';
        try {
          ({ stdout: userName } = await execAsync(`git config user.name`, { cwd: projectPath }));
        } catch {
          // not set globally – will configure locally below
        }
        try {
          ({ stdout: userEmail } = await execAsync(`git config user.email`, {
            cwd: projectPath,
          }));
        } catch {
          // not set globally – will configure locally below
        }

        if (!userName.trim()) {
          await execAsync(`git config user.name "Automaker"`, { cwd: projectPath });
        }
        if (!userEmail.trim()) {
          await execAsync(`git config user.email "automaker@localhost"`, { cwd: projectPath });
        }

        // Step 3: create the initial empty commit
        await execAsync(`git commit --allow-empty -m "Initial commit"`, { cwd: projectPath });
      } catch (error: unknown) {
        // Clean up the partial .git directory so subsequent runs behave deterministically
        if (gitDirCreated) {
          try {
            await secureFs.rm(gitDirPath, { recursive: true, force: true });
          } catch {
            // best-effort cleanup; ignore errors
          }
        }
        throw error;
      }

      res.json({
        success: true,
        result: {
          initialized: true,
          message: 'Git repository initialized with initial commit',
        },
      });
    } catch (error) {
      logError(error, 'Init git failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
