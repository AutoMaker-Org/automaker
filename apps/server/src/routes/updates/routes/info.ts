/**
 * GET /info endpoint - Get current installation info
 *
 * Returns current version, branch, and configuration info.
 */

import type { Request, Response } from 'express';
import type { SettingsService } from '../../../services/settings-service.js';
import { DEFAULT_AUTO_UPDATE_SETTINGS, type UpdateInfo } from '@automaker/types';
import {
  execAsync,
  execEnv,
  getAutomakerRoot,
  getCurrentCommit,
  getShortCommit,
  isGitRepo,
  isGitAvailable,
  hasLocalChanges,
  getErrorMessage,
  logError,
} from '../common.js';

export function createInfoHandler(settingsService: SettingsService) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const installPath = getAutomakerRoot();

      // Get settings
      const settings = await settingsService.getGlobalSettings();
      const autoUpdateSettings = settings.autoUpdate || DEFAULT_AUTO_UPDATE_SETTINGS;

      // Check if git is available
      const gitAvailable = await isGitAvailable();

      if (!gitAvailable) {
        const result: UpdateInfo = {
          installPath,
          currentVersion: null,
          currentVersionShort: null,
          currentBranch: null,
          hasLocalChanges: false,
          sourceUrl: autoUpdateSettings.upstreamUrl,
          autoUpdateEnabled: autoUpdateSettings.enabled,
          checkIntervalMinutes: autoUpdateSettings.checkIntervalMinutes,
          updateType: 'git',
          mechanismInfo: {
            isGitRepo: false,
            gitAvailable: false,
          },
        };

        res.json({
          success: true,
          result,
        });
        return;
      }

      // Check if it's a git repo
      const isRepo = await isGitRepo(installPath);

      if (!isRepo) {
        const result: UpdateInfo = {
          installPath,
          currentVersion: null,
          currentVersionShort: null,
          currentBranch: null,
          hasLocalChanges: false,
          sourceUrl: autoUpdateSettings.upstreamUrl,
          autoUpdateEnabled: autoUpdateSettings.enabled,
          checkIntervalMinutes: autoUpdateSettings.checkIntervalMinutes,
          updateType: 'git',
          mechanismInfo: {
            isGitRepo: false,
            gitAvailable: true,
          },
        };

        res.json({
          success: true,
          result,
        });
        return;
      }

      // Get git info
      const currentVersion = await getCurrentCommit(installPath);
      const currentVersionShort = await getShortCommit(installPath);

      // Get current branch
      const { stdout: branchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: installPath,
        env: execEnv,
      });
      const currentBranch = branchOutput.trim();

      // Check for local changes
      const localChanges = await hasLocalChanges(installPath);

      const result: UpdateInfo = {
        installPath,
        currentVersion,
        currentVersionShort,
        currentBranch,
        hasLocalChanges: localChanges,
        sourceUrl: autoUpdateSettings.upstreamUrl,
        autoUpdateEnabled: autoUpdateSettings.enabled,
        checkIntervalMinutes: autoUpdateSettings.checkIntervalMinutes,
        updateType: 'git',
        mechanismInfo: {
          isGitRepo: true,
          gitAvailable: true,
        },
      };

      res.json({
        success: true,
        result,
      });
    } catch (error) {
      logError(error, 'Failed to get update info');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
