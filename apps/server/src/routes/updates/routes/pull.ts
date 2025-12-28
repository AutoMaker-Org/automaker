/**
 * POST /pull endpoint - Pull updates from upstream
 *
 * Executes git pull from the configured upstream repository.
 */

import type { Request, Response } from 'express';
import type { SettingsService } from '../../../services/settings-service.js';
import type { UpdatePullResult } from '@automaker/types';
import {
  execAsync,
  execEnv,
  getAutomakerRoot,
  getCurrentCommit,
  getShortCommit,
  isGitRepo,
  isGitAvailable,
  isValidGitUrl,
  hasLocalChanges,
  withTempGitRemote,
  getErrorMessage,
  logError,
} from '../common.js';

export function createPullHandler(settingsService: SettingsService) {
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

      // Check for local changes
      if (await hasLocalChanges(installPath)) {
        res.status(400).json({
          success: false,
          error: 'You have local uncommitted changes. Please commit or stash them before updating.',
        });
        return;
      }

      // Get settings for upstream URL
      const settings = await settingsService.getGlobalSettings();
      const sourceUrl =
        settings.autoUpdate?.upstreamUrl || 'https://github.com/AutoMaker-Org/automaker.git';

      // Validate URL to prevent command injection
      if (!isValidGitUrl(sourceUrl)) {
        res.status(400).json({
          success: false,
          error: 'Invalid upstream URL format',
        });
        return;
      }

      try {
        const result = await withTempGitRemote(installPath, sourceUrl, async (tempRemoteName) => {
          // Get current version before pull
          const previousVersion = await getCurrentCommit(installPath);
          const previousVersionShort = await getShortCommit(installPath);

          // Fetch first
          await execAsync(`git fetch ${tempRemoteName} main`, {
            cwd: installPath,
            env: execEnv,
          });

          // Merge the fetched changes
          const { stdout: mergeOutput } = await execAsync(
            `git merge ${tempRemoteName}/main --ff-only`,
            { cwd: installPath, env: execEnv }
          );

          // Get new version after merge
          const newVersion = await getCurrentCommit(installPath);
          const newVersionShort = await getShortCommit(installPath);

          const alreadyUpToDate =
            mergeOutput.includes('Already up to date') || previousVersion === newVersion;

          return {
            success: true,
            previousVersion,
            previousVersionShort,
            newVersion,
            newVersionShort,
            alreadyUpToDate,
            message: alreadyUpToDate
              ? 'Already up to date'
              : `Updated from ${previousVersionShort} to ${newVersionShort}`,
          } satisfies UpdatePullResult;
        });

        res.json({
          success: true,
          result,
        });
      } catch (pullError) {
        const errorMsg = getErrorMessage(pullError);
        logError(pullError, 'Failed to pull updates');

        // Check for common errors
        if (errorMsg.includes('not possible to fast-forward')) {
          res.status(400).json({
            success: false,
            error:
              'Cannot fast-forward merge. Your local branch has diverged from upstream. Please resolve manually.',
          });
          return;
        }

        if (errorMsg.includes('CONFLICT')) {
          res.status(400).json({
            success: false,
            error: 'Merge conflict detected. Please resolve conflicts manually.',
          });
          return;
        }

        res.status(500).json({
          success: false,
          error: `Failed to pull updates: ${errorMsg}`,
        });
      }
    } catch (error) {
      logError(error, 'Update pull failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
