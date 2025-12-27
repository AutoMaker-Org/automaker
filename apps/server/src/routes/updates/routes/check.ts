/**
 * GET /check endpoint - Check if updates are available
 *
 * Compares local HEAD commit with the remote upstream branch.
 */

import type { Request, Response } from 'express';
import type { SettingsService } from '../../../services/settings-service.js';
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

export interface UpdateCheckResult {
  updateAvailable: boolean;
  localCommit: string;
  localCommitShort: string;
  remoteCommit: string | null;
  remoteCommitShort: string | null;
  upstreamUrl: string;
  automakerPath: string;
  error?: string;
}

export function createCheckHandler(settingsService: SettingsService) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const automakerPath = getAutomakerRoot();

      // Check if git is available
      if (!(await isGitAvailable())) {
        res.status(500).json({
          success: false,
          error: 'Git is not installed or not available in PATH',
        });
        return;
      }

      // Check if automaker directory is a git repo
      if (!(await isGitRepo(automakerPath))) {
        res.status(500).json({
          success: false,
          error: 'Automaker installation is not a git repository',
        });
        return;
      }

      // Get settings for upstream URL
      const settings = await settingsService.getGlobalSettings();
      const upstreamUrl =
        settings.autoUpdate?.upstreamUrl || 'https://github.com/AutoMaker-Org/automaker.git';

      // Get local commit
      const localCommit = await getCurrentCommit(automakerPath);
      const localCommitShort = await getShortCommit(automakerPath);

      // Fetch from upstream (use a temporary remote name to avoid conflicts)
      const tempRemoteName = 'automaker-update-check';

      try {
        // Remove temp remote if it exists (ignore errors)
        try {
          await execAsync(`git remote remove ${tempRemoteName}`, {
            cwd: automakerPath,
            env: execEnv,
          });
        } catch {
          // Remote doesn't exist, that's fine
        }

        // Add temporary remote
        await execAsync(`git remote add ${tempRemoteName} "${upstreamUrl}"`, {
          cwd: automakerPath,
          env: execEnv,
        });

        // Fetch from the temporary remote
        await execAsync(`git fetch ${tempRemoteName} main`, {
          cwd: automakerPath,
          env: execEnv,
        });

        // Get remote commit
        const { stdout: remoteCommitOutput } = await execAsync(
          `git rev-parse ${tempRemoteName}/main`,
          { cwd: automakerPath, env: execEnv }
        );
        const remoteCommit = remoteCommitOutput.trim();

        // Get short remote commit
        const { stdout: remoteCommitShortOutput } = await execAsync(
          `git rev-parse --short ${tempRemoteName}/main`,
          { cwd: automakerPath, env: execEnv }
        );
        const remoteCommitShort = remoteCommitShortOutput.trim();

        // Clean up temp remote
        await execAsync(`git remote remove ${tempRemoteName}`, {
          cwd: automakerPath,
          env: execEnv,
        });

        // Check if remote is ahead of local (update available)
        // git merge-base --is-ancestor <commit1> <commit2> returns 0 if commit1 is ancestor of commit2
        let updateAvailable = false;
        if (localCommit !== remoteCommit) {
          try {
            // Check if local is already an ancestor of remote (remote is ahead)
            await execAsync(`git merge-base --is-ancestor ${localCommit} ${remoteCommit}`, {
              cwd: automakerPath,
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
          localCommit,
          localCommitShort,
          remoteCommit,
          remoteCommitShort,
          upstreamUrl,
          automakerPath,
        };

        res.json({
          success: true,
          result,
        });
      } catch (fetchError) {
        // Clean up temp remote on error
        try {
          await execAsync(`git remote remove ${tempRemoteName}`, {
            cwd: automakerPath,
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
            localCommit,
            localCommitShort,
            remoteCommit: null,
            remoteCommitShort: null,
            upstreamUrl,
            automakerPath,
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
