/**
 * GET /info endpoint - Get current installation info
 *
 * Returns current commit, branch, and configuration info.
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
  hasLocalChanges,
  getErrorMessage,
  logError,
} from '../common.js';

export interface UpdateInfo {
  automakerPath: string;
  isGitRepo: boolean;
  gitAvailable: boolean;
  currentCommit: string | null;
  currentCommitShort: string | null;
  currentBranch: string | null;
  hasLocalChanges: boolean;
  upstreamUrl: string;
  autoUpdateEnabled: boolean;
  checkIntervalMinutes: number;
}

export function createInfoHandler(settingsService: SettingsService) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const automakerPath = getAutomakerRoot();

      // Get settings
      const settings = await settingsService.getGlobalSettings();
      const autoUpdateSettings = settings.autoUpdate || {
        enabled: true,
        checkIntervalMinutes: 15,
        upstreamUrl: 'https://github.com/AutoMaker-Org/automaker.git',
      };

      // Check if git is available
      const gitAvailable = await isGitAvailable();

      if (!gitAvailable) {
        const result: UpdateInfo = {
          automakerPath,
          isGitRepo: false,
          gitAvailable: false,
          currentCommit: null,
          currentCommitShort: null,
          currentBranch: null,
          hasLocalChanges: false,
          upstreamUrl: autoUpdateSettings.upstreamUrl,
          autoUpdateEnabled: autoUpdateSettings.enabled,
          checkIntervalMinutes: autoUpdateSettings.checkIntervalMinutes,
        };

        res.json({
          success: true,
          result,
        });
        return;
      }

      // Check if it's a git repo
      const isRepo = await isGitRepo(automakerPath);

      if (!isRepo) {
        const result: UpdateInfo = {
          automakerPath,
          isGitRepo: false,
          gitAvailable: true,
          currentCommit: null,
          currentCommitShort: null,
          currentBranch: null,
          hasLocalChanges: false,
          upstreamUrl: autoUpdateSettings.upstreamUrl,
          autoUpdateEnabled: autoUpdateSettings.enabled,
          checkIntervalMinutes: autoUpdateSettings.checkIntervalMinutes,
        };

        res.json({
          success: true,
          result,
        });
        return;
      }

      // Get git info
      const currentCommit = await getCurrentCommit(automakerPath);
      const currentCommitShort = await getShortCommit(automakerPath);

      // Get current branch
      const { stdout: branchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: automakerPath,
        env: execEnv,
      });
      const currentBranch = branchOutput.trim();

      // Check for local changes
      const localChanges = await hasLocalChanges(automakerPath);

      const result: UpdateInfo = {
        automakerPath,
        isGitRepo: true,
        gitAvailable: true,
        currentCommit,
        currentCommitShort,
        currentBranch,
        hasLocalChanges: localChanges,
        upstreamUrl: autoUpdateSettings.upstreamUrl,
        autoUpdateEnabled: autoUpdateSettings.enabled,
        checkIntervalMinutes: autoUpdateSettings.checkIntervalMinutes,
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
