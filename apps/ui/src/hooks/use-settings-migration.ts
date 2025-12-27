/**
 * Settings Migration Hook and Sync Functions
 *
 * Handles migrating user settings from localStorage to persistent file-based storage
 * on app startup. Also provides utility functions for syncing individual setting
 * categories to the server.
 *
 * Migration flow:
 * 1. useSettingsMigration() hook checks server for existing settings files
 * 2. If none exist, collects localStorage data and sends to /api/settings/migrate
 * 3. After successful migration, clears deprecated localStorage keys
 * 4. Maintains automaker-storage in localStorage as fast cache for Zustand
 *
 * Sync functions for incremental updates:
 * - syncSettingsToServer: Writes global settings to file
 * - syncCredentialsToServer: Writes API keys to file
 * - syncProjectSettingsToServer: Writes project-specific overrides
 */

import { useEffect, useState, useRef } from 'react';
import { getHttpApiClient } from '@/lib/http-api-client';
import { isElectron } from '@/lib/electron';
import { getItem, removeItem } from '@/lib/storage';

/**
 * State returned by useSettingsMigration hook
 */
interface MigrationState {
  /** Whether migration check has completed */
  checked: boolean;
  /** Whether migration actually occurred */
  migrated: boolean;
  /** Error message if migration failed (null if success/no-op) */
  error: string | null;
}

/**
 * localStorage keys that may contain settings to migrate
 *
 * These keys are collected and sent to the server for migration.
 * The automaker-storage key is handled specially as it's still used by Zustand.
 */
const LOCALSTORAGE_KEYS = [
  'automaker-storage',
  'automaker-setup',
  'worktree-panel-collapsed',
  'file-browser-recent-folders',
  'automaker:lastProjectDir',
] as const;

/**
 * localStorage keys to remove after successful migration
 *
 * automaker-storage is intentionally NOT in this list because Zustand still uses it
 * as a cache. These other keys have been migrated and are no longer needed.
 */
const KEYS_TO_CLEAR_AFTER_MIGRATION = [
  'worktree-panel-collapsed',
  'file-browser-recent-folders',
  'automaker:lastProjectDir',
  // Legacy keys from older versions
  'automaker_projects',
  'automaker_current_project',
  'automaker_trashed_projects',
] as const;

/**
 * React hook to handle settings migration from localStorage to file-based storage
 *
 * Runs automatically once on component mount. Returns state indicating whether
 * migration check is complete, whether migration occurred, and any errors.
 *
 * Only runs in Electron mode (isElectron() must be true). Web mode uses different
 * storage mechanisms.
 *
 * The hook uses a ref to ensure it only runs once despite multiple mounts.
 *
 * @returns MigrationState with checked, migrated, and error fields
 */
export function useSettingsMigration(): MigrationState {
  const [state, setState] = useState<MigrationState>({
    checked: false,
    migrated: false,
    error: null,
  });
  const migrationAttempted = useRef(false);

  useEffect(() => {
    // Only run once
    if (migrationAttempted.current) return;
    migrationAttempted.current = true;

    async function checkAndMigrate() {
      // Only run migration in Electron mode (web mode uses different storage)
      if (!isElectron()) {
        setState({ checked: true, migrated: false, error: null });
        return;
      }

      try {
        const api = getHttpApiClient();

        // Check if server has settings files
        const status = await api.settings.getStatus();

        if (!status.success) {
          console.error('[Settings Migration] Failed to get status:', status);
          setState({
            checked: true,
            migrated: false,
            error: 'Failed to check settings status',
          });
          return;
        }

        // If settings files already exist, no migration needed
        if (!status.needsMigration) {
          console.log('[Settings Migration] Settings files exist, no migration needed');
          setState({ checked: true, migrated: false, error: null });
          return;
        }

        // Check if we have localStorage data to migrate
        const automakerStorage = getItem('automaker-storage');
        if (!automakerStorage) {
          console.log('[Settings Migration] No localStorage data to migrate');
          setState({ checked: true, migrated: false, error: null });
          return;
        }

        console.log('[Settings Migration] Starting migration...');

        // Collect all localStorage data
        const localStorageData: Record<string, string> = {};
        for (const key of LOCALSTORAGE_KEYS) {
          const value = getItem(key);
          if (value) {
            localStorageData[key] = value;
          }
        }

        // Send to server for migration
        const result = await api.settings.migrate(localStorageData);

        if (result.success) {
          console.log('[Settings Migration] Migration successful:', {
            globalSettings: result.migratedGlobalSettings,
            credentials: result.migratedCredentials,
            projects: result.migratedProjectCount,
          });

          // Clear old localStorage keys (but keep automaker-storage for Zustand)
          for (const key of KEYS_TO_CLEAR_AFTER_MIGRATION) {
            removeItem(key);
          }

          setState({ checked: true, migrated: true, error: null });
        } else {
          console.warn('[Settings Migration] Migration had errors:', result.errors);
          setState({
            checked: true,
            migrated: false,
            error: result.errors.join(', '),
          });
        }
      } catch (error) {
        console.error('[Settings Migration] Migration failed:', error);
        setState({
          checked: true,
          migrated: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    checkAndMigrate();
  }, []);

  return state;
}

/**
 * Sync current global settings to file-based server storage
 *
 * Reads the current Zustand state from localStorage and sends all global settings
 * to the server to be written to {dataDir}/settings.json.
 *
 * Call this when important global settings change (theme, UI preferences, profiles, etc.)
 * Safe to call from store subscribers or change handlers.
 *
 * Only functions in Electron mode. Returns false if not in Electron or on error.
 *
 * @returns Promise resolving to true if sync succeeded, false otherwise
 */
export async function syncSettingsToServer(): Promise<boolean> {
  if (!isElectron()) return false;

  try {
    const api = getHttpApiClient();
    const automakerStorage = getItem('automaker-storage');

    if (!automakerStorage) {
      return false;
    }

    const parsed = JSON.parse(automakerStorage);
    const state = parsed.state || parsed;

    // Extract settings to sync
    const updates = {
      theme: state.theme,
      sidebarOpen: state.sidebarOpen,
      chatHistoryOpen: state.chatHistoryOpen,
      kanbanCardDetailLevel: state.kanbanCardDetailLevel,
      maxConcurrency: state.maxConcurrency,
      defaultSkipTests: state.defaultSkipTests,
      enableDependencyBlocking: state.enableDependencyBlocking,
      useWorktrees: state.useWorktrees,
      showProfilesOnly: state.showProfilesOnly,
      defaultPlanningMode: state.defaultPlanningMode,
      defaultRequirePlanApproval: state.defaultRequirePlanApproval,
      defaultAIProfileId: state.defaultAIProfileId,
      muteDoneSound: state.muteDoneSound,
      enhancementModel: state.enhancementModel,
      validationModel: state.validationModel,
      autoLoadClaudeMd: state.autoLoadClaudeMd,
      keyboardShortcuts: state.keyboardShortcuts,
      aiProfiles: state.aiProfiles,
      projects: state.projects,
      trashedProjects: state.trashedProjects,
      projectHistory: state.projectHistory,
      projectHistoryIndex: state.projectHistoryIndex,
      lastSelectedSessionByProject: state.lastSelectedSessionByProject,
    };

    const result = await api.settings.updateGlobal(updates);
    return result.success;
  } catch (error) {
    console.error('[Settings Sync] Failed to sync settings:', error);
    return false;
  }
}

/**
 * Sync API credentials to file-based server storage
 *
 * Sends API keys (partial update supported) to the server to be written to
 * {dataDir}/credentials.json. Credentials are kept separate from settings for security.
 *
 * Call this when API keys are added or updated in settings UI.
 * Only requires providing the keys that have changed.
 *
 * Only functions in Electron mode. Returns false if not in Electron or on error.
 *
 * @param apiKeys - Partial credential object with optional anthropic, google, openai keys
 * @returns Promise resolving to true if sync succeeded, false otherwise
 */
export async function syncCredentialsToServer(apiKeys: {
  anthropic?: string;
  google?: string;
  openai?: string;
  zai?: string;
}): Promise<boolean> {
  if (!isElectron()) return false;

  try {
    const api = getHttpApiClient();
    const result = await api.settings.updateCredentials({ apiKeys });
    return result.success;
  } catch (error) {
    console.error('[Settings Sync] Failed to sync credentials:', error);
    return false;
  }
}

/**
 * Sync project-specific settings to file-based server storage
 *
 * Sends project settings (theme, worktree config, board customization) to the server
 * to be written to {projectPath}/.automaker/settings.json.
 *
 * These settings override global settings for specific projects.
 * Supports partial updates - only include fields that have changed.
 *
 * Call this when project settings are modified in the board or settings UI.
 * Only functions in Electron mode. Returns false if not in Electron or on error.
 *
 * @param projectPath - Absolute path to project directory
 * @param updates - Partial ProjectSettings with optional theme, worktree, and board settings
 * @returns Promise resolving to true if sync succeeded, false otherwise
 */
export async function syncProjectSettingsToServer(
  projectPath: string,
  updates: {
    theme?: string;
    useWorktrees?: boolean;
    boardBackground?: Record<string, unknown>;
    currentWorktree?: { path: string | null; branch: string };
    worktrees?: Array<{
      path: string;
      branch: string;
      isMain: boolean;
      hasChanges?: boolean;
      changedFilesCount?: number;
    }>;
    worktreeSetupScript?: string;
  }
): Promise<boolean> {
  if (!isElectron()) return false;

  try {
    const api = getHttpApiClient();
    const result = await api.settings.updateProject(projectPath, updates);
    return result.success;
  } catch (error) {
    console.error('[Settings Sync] Failed to sync project settings:', error);
    return false;
  }
}
