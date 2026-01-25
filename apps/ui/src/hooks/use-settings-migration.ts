/**
 * Settings Migration Hook and Sync Functions
 *
 * Handles migrating user settings from localStorage to persistent file-based storage
 * on app startup. Also provides utility functions for syncing individual setting
 * categories to the server.
 *
 * Migration flow:
 * 1. useSettingsMigration() hook fetches settings from the server API
 * 2. Checks if `localStorageMigrated` flag is true - if so, skips migration
 * 3. If migration needed: merges localStorage data with server data, preferring more complete data
 * 4. Sets `localStorageMigrated: true` in server settings to prevent re-migration
 * 5. Hydrates the Zustand store with the merged/fetched settings
 * 6. Returns a promise that resolves when hydration is complete
 *
 * IMPORTANT: localStorage values are intentionally NOT deleted after migration.
 * This allows users to switch back to older versions of Automaker if needed.
 *
 * Sync functions for incremental updates:
 * - syncSettingsToServer: Writes global settings to file
 * - syncCredentialsToServer: Writes API keys to file
 * - syncProjectSettingsToServer: Writes project-specific overrides
 */

import { useEffect, useState, useRef } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { getHttpApiClient, waitForApiKeyInit } from '@/lib/http-api-client';
import { getItem, setItem } from '@/lib/storage';
import { useAppStore, THEME_STORAGE_KEY } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';
import {
  DEFAULT_OPENCODE_MODEL,
  DEFAULT_MAX_CONCURRENCY,
  getAllOpencodeModelIds,
  getAllCursorModelIds,
  migrateCursorModelIds,
  migratePhaseModelEntry,
  type GlobalSettings,
  type CursorModelId,
} from '@automaker/types';

const logger = createLogger('SettingsMigration');

/**
 * State returned by useSettingsMigration hook
 */
interface MigrationState {
  /** Whether migration/hydration has completed */
  checked: boolean;
  /** Whether migration actually occurred (localStorage -> server) */
  migrated: boolean;
  /** Error message if migration failed (null if success/no-op) */
  error: string | null;
}

/**
 * localStorage keys that may contain settings to migrate
 */
const LOCALSTORAGE_KEYS = [
  'automaker-storage',
  'automaker-setup',
  'worktree-panel-collapsed',
  'file-browser-recent-folders',
  'automaker:lastProjectDir',
] as const;

// NOTE: We intentionally do NOT clear any localStorage keys after migration.
// This allows users to switch back to older versions of Automaker that relied on localStorage.
// The `localStorageMigrated` flag in server settings prevents re-migration on subsequent app loads.

// Global promise that resolves when migration is complete
// This allows useSettingsSync to wait for hydration before starting sync
let migrationCompleteResolve: (() => void) | null = null;
let migrationCompletePromise: Promise<void> | null = null;
let migrationCompleted = false;

/**
 * Signal that migration/hydration is complete.
 * Call this after hydrating the store from server settings.
 * This unblocks useSettingsSync so it can start syncing changes.
 */
export function signalMigrationComplete(): void {
  migrationCompleted = true;
  if (migrationCompleteResolve) {
    migrationCompleteResolve();
  }
}

/**
 * Get a promise that resolves when migration/hydration is complete
 * Used by useSettingsSync to coordinate timing
 */
export function waitForMigrationComplete(): Promise<void> {
  // If migration already completed before anything started waiting, resolve immediately.
  if (migrationCompleted) {
    return Promise.resolve();
  }
  if (!migrationCompletePromise) {
    migrationCompletePromise = new Promise((resolve) => {
      migrationCompleteResolve = resolve;
    });
  }
  return migrationCompletePromise;
}

/**
 * Reset migration state when auth is lost (logout/session expired).
 * This ensures that on re-login, the sync hook properly waits for
 * fresh settings hydration before starting to sync.
 */
export function resetMigrationState(): void {
  migrationCompleted = false;
  migrationCompletePromise = null;
  migrationCompleteResolve = null;
}

/**
 * Parse localStorage data into settings object
 *
 * Checks for settings in multiple locations:
 * 1. automaker-settings-cache: Fresh server settings cached from last fetch
 * 2. automaker-storage: Zustand-persisted app store state (legacy)
 * 3. automaker-setup: Setup wizard state (legacy)
 * 4. Standalone keys: worktree-panel-collapsed, file-browser-recent-folders, etc.
 *
 * @returns Merged settings object or null if no settings found
 */
export function parseLocalStorageSettings(): Partial<GlobalSettings> | null {
  try {
    // First, check for fresh server settings cache (updated whenever server settings are fetched)
    // This prevents stale data when switching between modes
    const settingsCache = getItem('automaker-settings-cache');
    if (settingsCache) {
      try {
        const cached = JSON.parse(settingsCache) as GlobalSettings;
        const cacheProjectCount = cached?.projects?.length ?? 0;
        logger.info(`[CACHE_LOADED] projects=${cacheProjectCount}, theme=${cached?.theme}`);
        return cached;
      } catch (e) {
        logger.warn('Failed to parse settings cache, falling back to old storage');
      }
    } else {
      logger.info('[CACHE_EMPTY] No settings cache found in localStorage');
    }

    // Fall back to old Zustand persisted storage
    const automakerStorage = getItem('automaker-storage');
    if (!automakerStorage) {
      return null;
    }

    const parsed = JSON.parse(automakerStorage) as Record<string, unknown>;
    // Zustand persist stores state under 'state' key
    const state = (parsed.state as Record<string, unknown> | undefined) || parsed;

    // Setup wizard state (previously stored in its own persist key)
    const automakerSetup = getItem('automaker-setup');
    const setupParsed = automakerSetup
      ? (JSON.parse(automakerSetup) as Record<string, unknown>)
      : null;
    const setupState =
      (setupParsed?.state as Record<string, unknown> | undefined) || setupParsed || {};

    // Also check for standalone localStorage keys
    const worktreePanelCollapsed = getItem('worktree-panel-collapsed');
    const recentFolders = getItem('file-browser-recent-folders');
    const lastProjectDir = getItem('automaker:lastProjectDir');

    return {
      setupComplete: setupState.setupComplete as boolean,
      isFirstRun: setupState.isFirstRun as boolean,
      skipClaudeSetup: setupState.skipClaudeSetup as boolean,
      theme: state.theme as GlobalSettings['theme'],
      sidebarOpen: state.sidebarOpen as boolean,
      chatHistoryOpen: state.chatHistoryOpen as boolean,
      maxConcurrency: state.maxConcurrency as number,
      defaultSkipTests: state.defaultSkipTests as boolean,
      enableDependencyBlocking: state.enableDependencyBlocking as boolean,
      skipVerificationInAutoMode: state.skipVerificationInAutoMode as boolean,
      useWorktrees: state.useWorktrees as boolean,
      defaultPlanningMode: state.defaultPlanningMode as GlobalSettings['defaultPlanningMode'],
      defaultRequirePlanApproval: state.defaultRequirePlanApproval as boolean,
      muteDoneSound: state.muteDoneSound as boolean,
      enhancementModel: state.enhancementModel as GlobalSettings['enhancementModel'],
      validationModel: state.validationModel as GlobalSettings['validationModel'],
      phaseModels: state.phaseModels as GlobalSettings['phaseModels'],
      enabledCursorModels: state.enabledCursorModels as GlobalSettings['enabledCursorModels'],
      cursorDefaultModel: state.cursorDefaultModel as GlobalSettings['cursorDefaultModel'],
      enabledOpencodeModels: state.enabledOpencodeModels as GlobalSettings['enabledOpencodeModels'],
      opencodeDefaultModel: state.opencodeDefaultModel as GlobalSettings['opencodeDefaultModel'],
      enabledDynamicModelIds:
        state.enabledDynamicModelIds as GlobalSettings['enabledDynamicModelIds'],
      disabledProviders: (state.disabledProviders ?? []) as GlobalSettings['disabledProviders'],
      autoLoadClaudeMd: state.autoLoadClaudeMd as boolean,
      keyboardShortcuts: state.keyboardShortcuts as GlobalSettings['keyboardShortcuts'],
      mcpServers: state.mcpServers as GlobalSettings['mcpServers'],
      promptCustomization: state.promptCustomization as GlobalSettings['promptCustomization'],
      eventHooks: state.eventHooks as GlobalSettings['eventHooks'],
      projects: state.projects as GlobalSettings['projects'],
      trashedProjects: state.trashedProjects as GlobalSettings['trashedProjects'],
      currentProjectId: (state.currentProject as { id?: string } | null)?.id ?? null,
      projectHistory: state.projectHistory as GlobalSettings['projectHistory'],
      projectHistoryIndex: state.projectHistoryIndex as number,
      lastSelectedSessionByProject:
        state.lastSelectedSessionByProject as GlobalSettings['lastSelectedSessionByProject'],
      // UI State from standalone localStorage keys or Zustand state
      worktreePanelCollapsed:
        worktreePanelCollapsed === 'true' || (state.worktreePanelCollapsed as boolean),
      lastProjectDir: lastProjectDir || (state.lastProjectDir as string),
      recentFolders: recentFolders ? JSON.parse(recentFolders) : (state.recentFolders as string[]),
      // Claude API Profiles (legacy)
      claudeApiProfiles: (state.claudeApiProfiles as GlobalSettings['claudeApiProfiles']) ?? [],
      activeClaudeApiProfileId:
        (state.activeClaudeApiProfileId as GlobalSettings['activeClaudeApiProfileId']) ?? null,
      // Claude Compatible Providers (new system)
      claudeCompatibleProviders:
        (state.claudeCompatibleProviders as GlobalSettings['claudeCompatibleProviders']) ?? [],
    };
  } catch (error) {
    logger.error('Failed to parse localStorage settings:', error);
    return null;
  }
}

/**
 * Check if localStorage has more complete data than server
 *
 * Compares the completeness of data to determine if a migration is needed.
 * Returns true if localStorage has projects but server doesn't, indicating
 * the localStorage data should be merged with server settings.
 *
 * @param localSettings Settings loaded from localStorage
 * @param serverSettings Settings loaded from server
 * @returns true if localStorage has more data that should be preserved
 */
export function localStorageHasMoreData(
  localSettings: Partial<GlobalSettings> | null,
  serverSettings: GlobalSettings | null
): boolean {
  if (!localSettings) return false;
  if (!serverSettings) return true;

  // Check if localStorage has projects that server doesn't
  const localProjects = localSettings.projects || [];
  const serverProjects = serverSettings.projects || [];

  if (localProjects.length > 0 && serverProjects.length === 0) {
    logger.info(`localStorage has ${localProjects.length} projects, server has none - will merge`);
    return true;
  }

  return false;
}

/**
 * Merge localStorage settings with server settings
 *
 * Intelligently combines settings from both sources:
 * - Prefers server data as the base
 * - Uses localStorage values when server has empty arrays/objects
 * - Specific handling for: projects, trashedProjects, mcpServers, recentFolders, etc.
 *
 * @param serverSettings Settings from server API (base)
 * @param localSettings Settings from localStorage (fallback)
 * @returns Merged GlobalSettings object ready to hydrate the store
 */
export function mergeSettings(
  serverSettings: GlobalSettings,
  localSettings: Partial<GlobalSettings> | null
): GlobalSettings {
  if (!localSettings) return serverSettings;

  // Start with server settings
  const merged = { ...serverSettings };

  // For arrays, prefer the one with more items (if server is empty, use local)
  if (
    (!serverSettings.projects || serverSettings.projects.length === 0) &&
    localSettings.projects &&
    localSettings.projects.length > 0
  ) {
    merged.projects = localSettings.projects;
  }

  if (
    (!serverSettings.trashedProjects || serverSettings.trashedProjects.length === 0) &&
    localSettings.trashedProjects &&
    localSettings.trashedProjects.length > 0
  ) {
    merged.trashedProjects = localSettings.trashedProjects;
  }

  if (
    (!serverSettings.mcpServers || serverSettings.mcpServers.length === 0) &&
    localSettings.mcpServers &&
    localSettings.mcpServers.length > 0
  ) {
    merged.mcpServers = localSettings.mcpServers;
  }

  if (
    (!serverSettings.recentFolders || serverSettings.recentFolders.length === 0) &&
    localSettings.recentFolders &&
    localSettings.recentFolders.length > 0
  ) {
    merged.recentFolders = localSettings.recentFolders;
  }

  if (
    (!serverSettings.projectHistory || serverSettings.projectHistory.length === 0) &&
    localSettings.projectHistory &&
    localSettings.projectHistory.length > 0
  ) {
    merged.projectHistory = localSettings.projectHistory;
    merged.projectHistoryIndex = localSettings.projectHistoryIndex ?? -1;
  }

  // For objects, merge if server is empty
  if (
    (!serverSettings.lastSelectedSessionByProject ||
      Object.keys(serverSettings.lastSelectedSessionByProject).length === 0) &&
    localSettings.lastSelectedSessionByProject &&
    Object.keys(localSettings.lastSelectedSessionByProject).length > 0
  ) {
    merged.lastSelectedSessionByProject = localSettings.lastSelectedSessionByProject;
  }

  // For simple values, use localStorage if server value is default/undefined
  if (!serverSettings.lastProjectDir && localSettings.lastProjectDir) {
    merged.lastProjectDir = localSettings.lastProjectDir;
  }

  // Preserve current project ID from localStorage if server doesn't have one
  if (!serverSettings.currentProjectId && localSettings.currentProjectId) {
    merged.currentProjectId = localSettings.currentProjectId;
  }

  // Claude API Profiles - preserve from localStorage if server is empty
  if (
    (!serverSettings.claudeApiProfiles || serverSettings.claudeApiProfiles.length === 0) &&
    localSettings.claudeApiProfiles &&
    localSettings.claudeApiProfiles.length > 0
  ) {
    merged.claudeApiProfiles = localSettings.claudeApiProfiles;
  }

  // Active Claude API Profile ID - preserve from localStorage if server doesn't have one
  if (!serverSettings.activeClaudeApiProfileId && localSettings.activeClaudeApiProfileId) {
    merged.activeClaudeApiProfileId = localSettings.activeClaudeApiProfileId;
  }

  // Claude Compatible Providers - preserve from localStorage if server is empty
  if (
    (!serverSettings.claudeCompatibleProviders ||
      serverSettings.claudeCompatibleProviders.length === 0) &&
    localSettings.claudeCompatibleProviders &&
    localSettings.claudeCompatibleProviders.length > 0
  ) {
    merged.claudeCompatibleProviders = localSettings.claudeCompatibleProviders;
  }

  return merged;
}

/**
 * Perform settings migration from localStorage to server (async function version)
 *
 * This is the core migration logic extracted for use outside of React hooks.
 * Call this from __root.tsx during app initialization.
 *
 * Flow:
 * 1. If server has localStorageMigrated flag, skip migration (already done)
 * 2. Check if localStorage has more data than server
 * 3. If yes, merge them and sync merged state back to server
 * 4. Set localStorageMigrated flag to prevent re-migration
 *
 * @param serverSettings Settings fetched from the server API
 * @returns Promise resolving to {settings, migrated} - final settings and whether migration occurred
 */
export async function performSettingsMigration(
  serverSettings: GlobalSettings
): Promise<{ settings: GlobalSettings; migrated: boolean }> {
  // Get localStorage data
  const localSettings = parseLocalStorageSettings();
  const localProjects = localSettings?.projects?.length ?? 0;
  const serverProjects = serverSettings.projects?.length ?? 0;

  logger.info('[MIGRATION_CHECK]', {
    localStorageProjects: localProjects,
    serverProjects: serverProjects,
    localStorageMigrated: serverSettings.localStorageMigrated,
    dataSourceMismatch: localProjects !== serverProjects,
  });

  // Check if migration has already been completed
  if (serverSettings.localStorageMigrated) {
    logger.info('[MIGRATION_SKIP] Using server settings only (migration already completed)');
    return { settings: serverSettings, migrated: false };
  }

  // Check if localStorage has more data than server
  if (localStorageHasMoreData(localSettings, serverSettings)) {
    // First-time migration: merge localStorage data with server settings
    const mergedSettings = mergeSettings(serverSettings, localSettings);
    logger.info('Merged localStorage data with server settings (first-time migration)');

    // Sync merged settings to server with migration marker
    try {
      const api = getHttpApiClient();
      const updates = {
        ...mergedSettings,
        localStorageMigrated: true,
      };

      const result = await api.settings.updateGlobal(updates);
      if (result.success) {
        logger.info('Synced merged settings to server with migration marker');
      } else {
        logger.warn('Failed to sync merged settings to server:', result.error);
      }
    } catch (error) {
      logger.error('Failed to sync merged settings:', error);
    }

    return { settings: mergedSettings, migrated: true };
  }

  // No migration needed, but mark as migrated to prevent future checks
  if (!serverSettings.localStorageMigrated) {
    try {
      const api = getHttpApiClient();
      await api.settings.updateGlobal({ localStorageMigrated: true });
      logger.info('Marked settings as migrated (no data to migrate)');
    } catch (error) {
      logger.warn('Failed to set migration marker:', error);
    }
  }

  return { settings: serverSettings, migrated: false };
}

/**
 * React hook to handle settings hydration from server on startup
 *
 * Runs automatically once on component mount. Returns state indicating whether
 * hydration is complete, whether data was migrated from localStorage, and any errors.
 *
 * Works in both Electron and web modes - both need to hydrate from the server API.
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
      try {
        // Wait for API key to be initialized before making any API calls
        await waitForApiKeyInit();

        const api = getHttpApiClient();

        // Always try to get localStorage data first (in case we need to merge/migrate)
        const localSettings = parseLocalStorageSettings();
        logger.info(`localStorage has ${localSettings?.projects?.length ?? 0} projects`);

        // Check if server has settings files
        const status = await api.settings.getStatus();

        if (!status.success) {
          logger.error('Failed to get settings status:', status);

          // Even if status check fails, try to use localStorage data if available
          if (localSettings) {
            logger.info('Using localStorage data as fallback');
            hydrateStoreFromSettings(localSettings as GlobalSettings);
          }

          signalMigrationComplete();

          setState({
            checked: true,
            migrated: false,
            error: 'Failed to check settings status',
          });
          return;
        }

        // Try to get global settings from server
        let serverSettings: GlobalSettings | null = null;
        try {
          const global = await api.settings.getGlobal();
          if (global.success && global.settings) {
            serverSettings = global.settings as unknown as GlobalSettings;
            logger.info(`Server has ${serverSettings.projects?.length ?? 0} projects`);

            // Update localStorage with fresh server data to keep cache in sync
            // This prevents stale localStorage data from being used when switching between modes
            try {
              setItem('automaker-settings-cache', JSON.stringify(serverSettings));
              logger.debug('Updated localStorage with fresh server settings');
            } catch (storageError) {
              logger.warn('Failed to update localStorage cache:', storageError);
            }
          }
        } catch (error) {
          logger.error('Failed to fetch server settings:', error);
        }

        // Determine what settings to use
        let finalSettings: GlobalSettings;
        let needsSync = false;

        if (serverSettings) {
          // Check if migration has already been completed
          if (serverSettings.localStorageMigrated) {
            logger.info('localStorage migration already completed, using server settings only');
            finalSettings = serverSettings;
            // Don't set needsSync - no migration needed
          } else if (localStorageHasMoreData(localSettings, serverSettings)) {
            // First-time migration: merge localStorage data with server settings
            finalSettings = mergeSettings(serverSettings, localSettings);
            needsSync = true;
            logger.info('Merged localStorage data with server settings (first-time migration)');
          } else {
            finalSettings = serverSettings;
          }
        } else if (localSettings) {
          // No server settings, use localStorage (first run migration)
          finalSettings = localSettings as GlobalSettings;
          needsSync = true;
          logger.info(
            'Using localStorage settings (no server settings found - first-time migration)'
          );
        } else {
          // No settings anywhere, use defaults
          logger.info('No settings found, using defaults');
          signalMigrationComplete();
          setState({ checked: true, migrated: false, error: null });
          return;
        }

        // Hydrate the store
        hydrateStoreFromSettings(finalSettings);
        logger.info('Store hydrated with settings');

        // If we merged data or used localStorage, sync to server with migration marker
        if (needsSync) {
          try {
            const updates = buildSettingsUpdateFromStore();
            // Mark migration as complete so we don't re-migrate on next app load
            // This preserves localStorage values for users who want to downgrade
            (updates as Record<string, unknown>).localStorageMigrated = true;

            const result = await api.settings.updateGlobal(updates);
            if (result.success) {
              logger.info('Synced merged settings to server with migration marker');
              // NOTE: We intentionally do NOT clear localStorage values
              // This allows users to switch back to older versions of Automaker
            } else {
              logger.warn('Failed to sync merged settings to server:', result.error);
            }
          } catch (error) {
            logger.error('Failed to sync merged settings:', error);
          }
        }

        // Signal that migration is complete
        signalMigrationComplete();

        setState({ checked: true, migrated: needsSync, error: null });
      } catch (error) {
        logger.error('Migration/hydration failed:', error);

        // Signal that migration is complete (even on error)
        signalMigrationComplete();

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
 * Hydrate the Zustand store from settings object
 */
export function hydrateStoreFromSettings(settings: GlobalSettings): void {
  const current = useAppStore.getState();

  // Migrate Cursor models to canonical format
  // IMPORTANT: Always use ALL available Cursor models to ensure new models are visible
  // Users who had old settings with a subset of models should still see all available models
  const allCursorModels = getAllCursorModelIds();
  const migratedCursorDefault = migrateCursorModelIds([
    settings.cursorDefaultModel ?? current.cursorDefaultModel ?? 'cursor-auto',
  ])[0];
  const validCursorModelIds = new Set(allCursorModels);
  const sanitizedCursorDefaultModel = validCursorModelIds.has(migratedCursorDefault)
    ? migratedCursorDefault
    : ('cursor-auto' as CursorModelId);

  const validOpencodeModelIds = new Set(getAllOpencodeModelIds());
  const incomingEnabledOpencodeModels =
    settings.enabledOpencodeModels ?? current.enabledOpencodeModels;
  const sanitizedOpencodeDefaultModel = validOpencodeModelIds.has(
    settings.opencodeDefaultModel ?? current.opencodeDefaultModel
  )
    ? (settings.opencodeDefaultModel ?? current.opencodeDefaultModel)
    : DEFAULT_OPENCODE_MODEL;
  const sanitizedEnabledOpencodeModels = Array.from(
    new Set(incomingEnabledOpencodeModels.filter((modelId) => validOpencodeModelIds.has(modelId)))
  );

  if (!sanitizedEnabledOpencodeModels.includes(sanitizedOpencodeDefaultModel)) {
    sanitizedEnabledOpencodeModels.push(sanitizedOpencodeDefaultModel);
  }

  const persistedDynamicModelIds =
    settings.enabledDynamicModelIds ?? current.enabledDynamicModelIds;
  const sanitizedDynamicModelIds = persistedDynamicModelIds.filter(
    (modelId) => !modelId.startsWith('amazon-bedrock/')
  );

  // Convert ProjectRef[] to Project[] (minimal data, features will be loaded separately)
  const projects = (settings.projects ?? []).map((ref) => ({
    id: ref.id,
    name: ref.name,
    path: ref.path,
    lastOpened: ref.lastOpened,
    theme: ref.theme,
    fontFamilySans: ref.fontFamilySans,
    fontFamilyMono: ref.fontFamilyMono,
    isFavorite: ref.isFavorite,
    icon: ref.icon,
    customIconPath: ref.customIconPath,
    features: [], // Features are loaded separately when project is opened
  }));

  // Find the current project by ID
  let currentProject = null;
  if (settings.currentProjectId) {
    currentProject = projects.find((p) => p.id === settings.currentProjectId) ?? null;
    if (currentProject) {
      logger.info(`Restoring current project: ${currentProject.name} (${currentProject.id})`);
    }
  }

  // Save theme to localStorage for fallback when server settings aren't available
  const storedTheme = (currentProject?.theme as string | undefined) || settings.theme;
  if (storedTheme) {
    setItem(THEME_STORAGE_KEY, storedTheme);
  }

  // Restore autoModeByWorktree settings (only maxConcurrency is persisted, runtime state is reset)
  const restoredAutoModeByWorktree: Record<
    string,
    {
      isRunning: boolean;
      runningTasks: string[];
      branchName: string | null;
      maxConcurrency: number;
    }
  > = {};
  if ((settings as Record<string, unknown>).autoModeByWorktree) {
    const persistedSettings = (settings as Record<string, unknown>).autoModeByWorktree as Record<
      string,
      { maxConcurrency?: number; branchName?: string | null }
    >;
    for (const [key, value] of Object.entries(persistedSettings)) {
      restoredAutoModeByWorktree[key] = {
        isRunning: false, // Always start with auto mode off
        runningTasks: [], // No running tasks on startup
        branchName: value.branchName ?? null,
        maxConcurrency: value.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
      };
    }
  }

  useAppStore.setState({
    theme: settings.theme as unknown as import('@/store/app-store').ThemeMode,
    fontFamilySans: settings.fontFamilySans ?? null,
    fontFamilyMono: settings.fontFamilyMono ?? null,
    sidebarOpen: settings.sidebarOpen ?? true,
    chatHistoryOpen: settings.chatHistoryOpen ?? false,
    maxConcurrency: settings.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
    autoModeByWorktree: restoredAutoModeByWorktree,
    defaultSkipTests: settings.defaultSkipTests ?? true,
    enableDependencyBlocking: settings.enableDependencyBlocking ?? true,
    skipVerificationInAutoMode: settings.skipVerificationInAutoMode ?? false,
    useWorktrees: settings.useWorktrees ?? true,
    defaultPlanningMode: settings.defaultPlanningMode ?? 'skip',
    defaultRequirePlanApproval: settings.defaultRequirePlanApproval ?? false,
    defaultFeatureModel: migratePhaseModelEntry(settings.defaultFeatureModel) ?? {
      model: 'claude-opus',
    },
    muteDoneSound: settings.muteDoneSound ?? false,
    serverLogLevel: settings.serverLogLevel ?? 'info',
    enableRequestLogging: settings.enableRequestLogging ?? true,
    enhancementModel: settings.enhancementModel ?? 'claude-sonnet',
    validationModel: settings.validationModel ?? 'claude-opus',
    phaseModels: settings.phaseModels ?? current.phaseModels,
    enabledCursorModels: allCursorModels, // Always use ALL cursor models
    cursorDefaultModel: sanitizedCursorDefaultModel,
    enabledOpencodeModels: sanitizedEnabledOpencodeModels,
    opencodeDefaultModel: sanitizedOpencodeDefaultModel,
    enabledDynamicModelIds: sanitizedDynamicModelIds,
    disabledProviders: settings.disabledProviders ?? [],
    autoLoadClaudeMd: settings.autoLoadClaudeMd ?? false,
    skipSandboxWarning: settings.skipSandboxWarning ?? false,
    keyboardShortcuts: {
      ...current.keyboardShortcuts,
      ...(settings.keyboardShortcuts as unknown as Partial<typeof current.keyboardShortcuts>),
    },
    mcpServers: settings.mcpServers ?? [],
    promptCustomization: settings.promptCustomization ?? {},
    eventHooks: settings.eventHooks ?? [],
    claudeCompatibleProviders: settings.claudeCompatibleProviders ?? [],
    claudeApiProfiles: settings.claudeApiProfiles ?? [],
    activeClaudeApiProfileId: settings.activeClaudeApiProfileId ?? null,
    projects,
    currentProject,
    trashedProjects: settings.trashedProjects ?? [],
    projectHistory: settings.projectHistory ?? [],
    projectHistoryIndex: settings.projectHistoryIndex ?? -1,
    lastSelectedSessionByProject: settings.lastSelectedSessionByProject ?? {},
    // UI State
    worktreePanelCollapsed: settings.worktreePanelCollapsed ?? false,
    lastProjectDir: settings.lastProjectDir ?? '',
    recentFolders: settings.recentFolders ?? [],
    // Terminal font (nested in terminalState)
    ...(settings.terminalFontFamily && {
      terminalState: {
        ...current.terminalState,
        fontFamily: settings.terminalFontFamily,
      },
    }),
  });

  // Hydrate setup wizard state from global settings (API-backed)
  useSetupStore.setState({
    setupComplete: settings.setupComplete ?? false,
    isFirstRun: settings.isFirstRun ?? true,
    skipClaudeSetup: settings.skipClaudeSetup ?? false,
    currentStep: settings.setupComplete ? 'complete' : 'welcome',
  });
}

/**
 * Build settings update object from current store state
 */
function buildSettingsUpdateFromStore(): Record<string, unknown> {
  const state = useAppStore.getState();
  const setupState = useSetupStore.getState();

  // Only persist settings (maxConcurrency), not runtime state (isRunning, runningTasks)
  const persistedAutoModeByWorktree: Record<
    string,
    { maxConcurrency: number; branchName: string | null }
  > = {};
  for (const [key, value] of Object.entries(state.autoModeByWorktree)) {
    persistedAutoModeByWorktree[key] = {
      maxConcurrency: value.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
      branchName: value.branchName,
    };
  }

  return {
    setupComplete: setupState.setupComplete,
    isFirstRun: setupState.isFirstRun,
    skipClaudeSetup: setupState.skipClaudeSetup,
    theme: state.theme,
    sidebarOpen: state.sidebarOpen,
    chatHistoryOpen: state.chatHistoryOpen,
    maxConcurrency: state.maxConcurrency,
    autoModeByWorktree: persistedAutoModeByWorktree,
    defaultSkipTests: state.defaultSkipTests,
    enableDependencyBlocking: state.enableDependencyBlocking,
    skipVerificationInAutoMode: state.skipVerificationInAutoMode,
    useWorktrees: state.useWorktrees,
    defaultPlanningMode: state.defaultPlanningMode,
    defaultRequirePlanApproval: state.defaultRequirePlanApproval,
    muteDoneSound: state.muteDoneSound,
    serverLogLevel: state.serverLogLevel,
    enableRequestLogging: state.enableRequestLogging,
    enhancementModel: state.enhancementModel,
    validationModel: state.validationModel,
    phaseModels: state.phaseModels,
    enabledDynamicModelIds: state.enabledDynamicModelIds,
    disabledProviders: state.disabledProviders,
    autoLoadClaudeMd: state.autoLoadClaudeMd,
    skipSandboxWarning: state.skipSandboxWarning,
    keyboardShortcuts: state.keyboardShortcuts,
    mcpServers: state.mcpServers,
    promptCustomization: state.promptCustomization,
    eventHooks: state.eventHooks,
    claudeCompatibleProviders: state.claudeCompatibleProviders,
    claudeApiProfiles: state.claudeApiProfiles,
    activeClaudeApiProfileId: state.activeClaudeApiProfileId,
    projects: state.projects,
    trashedProjects: state.trashedProjects,
    currentProjectId: state.currentProject?.id ?? null,
    projectHistory: state.projectHistory,
    projectHistoryIndex: state.projectHistoryIndex,
    lastSelectedSessionByProject: state.lastSelectedSessionByProject,
    worktreePanelCollapsed: state.worktreePanelCollapsed,
    lastProjectDir: state.lastProjectDir,
    recentFolders: state.recentFolders,
    terminalFontFamily: state.terminalState.fontFamily,
  };
}

/**
 * Sync current global settings to file-based server storage
 *
 * Reads the current Zustand state and sends all global settings
 * to the server to be written to {dataDir}/settings.json.
 *
 * @returns Promise resolving to true if sync succeeded, false otherwise
 */
export async function syncSettingsToServer(): Promise<boolean> {
  try {
    const api = getHttpApiClient();
    const updates = buildSettingsUpdateFromStore();
    const result = await api.settings.updateGlobal(updates);
    return result.success;
  } catch (error) {
    logger.error('Failed to sync settings:', error);
    return false;
  }
}

/**
 * Sync API credentials to file-based server storage
 *
 * @param apiKeys - Partial credential object with optional anthropic, google, openai keys
 * @returns Promise resolving to true if sync succeeded, false otherwise
 */
export async function syncCredentialsToServer(apiKeys: {
  anthropic?: string;
  google?: string;
  openai?: string;
}): Promise<boolean> {
  try {
    const api = getHttpApiClient();
    const result = await api.settings.updateCredentials({ apiKeys });
    return result.success;
  } catch (error) {
    logger.error('Failed to sync credentials:', error);
    return false;
  }
}

/**
 * Sync project-specific settings to file-based server storage
 *
 * @param projectPath - Absolute path to project directory
 * @param updates - Partial ProjectSettings
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
  }
): Promise<boolean> {
  try {
    const api = getHttpApiClient();
    const result = await api.settings.updateProject(projectPath, updates);
    return result.success;
  } catch (error) {
    logger.error('Failed to sync project settings:', error);
    return false;
  }
}

/**
 * Load MCP servers from server settings file into the store
 *
 * @returns Promise resolving to true if load succeeded, false otherwise
 */
export async function loadMCPServersFromServer(): Promise<boolean> {
  try {
    const api = getHttpApiClient();
    const result = await api.settings.getGlobal();

    if (!result.success || !result.settings) {
      logger.error('Failed to load settings:', result.error);
      return false;
    }

    const mcpServers = result.settings.mcpServers || [];
    useAppStore.setState({ mcpServers });

    logger.info(`Loaded ${mcpServers.length} MCP servers from server`);
    return true;
  } catch (error) {
    logger.error('Failed to load MCP servers:', error);
    return false;
  }
}
