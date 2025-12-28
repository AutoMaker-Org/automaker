/**
 * GET /check endpoint - Check if updates are available
 *
 * Compares local version with the remote upstream version.
 */

import type { Request, Response } from 'express';
import type { SettingsService } from '../../../services/settings-service.js';
import type { UpdateCheckResult } from '@automaker/types';
import {
  execAsync,
  execEnv,
  getAutomakerRoot,
  getCurrentCommit,
  getShortCommit,
  isGitRepo,
  isGitAvailable,
  getErrorMessage,
  logError,
} from '../common.js';

export function createCheckHandler(settingsService: SettingsService) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const installPath = getAutomakerRoot();

      // Check if git is available
      if (!(await isGitAvailable())) {
        res.status(500).json({
          success: false,
          error: 'Git is not installed or not available in PATH',
        });
        return;
      }

      // Check if automaker directory is a git repo
      if (!(await isGitRepo(installPath))) {
        res.status(500).json({
          success: false,
          error: 'Automaker installation is not a git repository',
        });
        return;
      }

      // Get settings for upstream URL
      const settings = await settingsService.getGlobalSettings();
      const sourceUrl =
        settings.autoUpdate?.upstreamUrl || 'https://github.com/AutoMaker-Org/automaker.git';

      // Get local version
      const localVersion = await getCurrentCommit(installPath);
      const localVersionShort = await getShortCommit(installPath);

      // Fetch from upstream (use a temporary remote name to avoid conflicts)
      const tempRemoteName = 'automaker-update-check';

      try {
        // Remove temp remote if it exists (ignore errors)
        try {
          await execAsync(`git remote remove ${tempRemoteName}`, {
            cwd: installPath,
            env: execEnv,
          });
        } catch {
          // Remote doesn't exist, that's fine
        }

        // Add temporary remote
        await execAsync(`git remote add ${tempRemoteName} "${sourceUrl}"`, {
          cwd: installPath,
          env: execEnv,
        });

        // Fetch from the temporary remote
        await execAsync(`git fetch ${tempRemoteName} main`, {
          cwd: installPath,
          env: execEnv,
        });

        // Get remote version
        const { stdout: remoteVersionOutput } = await execAsync(
          `git rev-parse ${tempRemoteName}/main`,
          { cwd: installPath, env: execEnv }
        );
        const remoteVersion = remoteVersionOutput.trim();

        // Get short remote version
        const { stdout: remoteVersionShortOutput } = await execAsync(
          `git rev-parse --short ${tempRemoteName}/main`,
          { cwd: installPath, env: execEnv }
        );
        const remoteVersionShort = remoteVersionShortOutput.trim();

        // Clean up temp remote
        await execAsync(`git remote remove ${tempRemoteName}`, {
          cwd: installPath,
          env: execEnv,
        });

        // Check if remote is ahead of local (update available)
        // git merge-base --is-ancestor <commit1> <commit2> returns 0 if commit1 is ancestor of commit2
        let updateAvailable = false;
        if (localVersion !== remoteVersion) {
          try {
            // Check if local is already an ancestor of remote (remote is ahead)
            await execAsync(`git merge-base --is-ancestor ${localVersion} ${remoteVersion}`, {
              cwd: installPath,
              env: execEnv,
            });
            // If we get here (exit code 0), local is ancestor of remote, so update is available
            updateAvailable = true;
          } catch {
            // Exit code 1 means local is NOT an ancestor of remote
            // This means either local is ahead, or branches have diverged
            // In either case, we don't show "update available"
            updateAvailable = false;
          }
        }

        const result: UpdateCheckResult = {
          updateAvailable,
          localVersion,
          localVersionShort,
          remoteVersion,
          remoteVersionShort,
          sourceUrl,
          installPath,
        };

        res.json({
          success: true,
          result,
        });
      } catch (fetchError) {
        // Clean up temp remote on error
        try {
          await execAsync(`git remote remove ${tempRemoteName}`, {
            cwd: installPath,
            env: execEnv,
          });
        } catch {
          // Ignore cleanup errors
        }

        const errorMsg = getErrorMessage(fetchError);
        logError(fetchError, 'Failed to fetch from upstream');

        res.json({
          success: true,
          result: {
            updateAvailable: false,
            localVersion,
            localVersionShort,
            remoteVersion: null,
            remoteVersionShort: null,
            sourceUrl,
            installPath,
            error: `Could not fetch from upstream: ${errorMsg}`,
          } satisfies UpdateCheckResult,
        });
      }
    } catch (error) {
      logError(error, 'Update check failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
