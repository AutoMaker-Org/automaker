/**
 * Settings Sync Hook - API-First Settings Management
 *
 * This hook provides automatic settings synchronization to the server.
 * It subscribes to Zustand store changes and syncs to API with debouncing.
 *
 * IMPORTANT: This hook waits for useSettingsMigration to complete before
 * starting to sync. This prevents overwriting server data with empty state
 * during the initial hydration phase.
 *
 * The server's settings.json file is the single source of truth.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { getHttpApiClient, waitForApiKeyInit } from '@/lib/http-api-client';
import { setItem } from '@/lib/storage';
import { useAppStore, type ThemeMode, THEME_STORAGE_KEY } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';
import { useAuthStore } from '@/store/auth-store';
import { waitForMigrationComplete, resetMigrationState } from './use-settings-migration';
import {
  DEFAULT_OPENCODE_MODEL,
  DEFAULT_MAX_CONCURRENCY,
  getAllOpencodeModelIds,
  getAllCursorModelIds,
  migrateCursorModelIds,
  migrateOpencodeModelIds,
  migratePhaseModelEntry,
  type GlobalSettings,
  type CursorModelId,
  type OpencodeModelId,
} from '@automaker/types';

const logger = createLogger('SettingsSync');

// Debounce delay for syncing settings to server (ms)
const SYNC_DEBOUNCE_MS = 1000;

// Fields to sync to server (subset of AppState that should be persisted)
const SETTINGS_FIELDS_TO_SYNC = [
  'theme',
  'fontFamilySans',
  'fontFamilyMono',
  'terminalFontFamily', // Maps to terminalState.fontFamily
  'openTerminalMode', // Maps to terminalState.openTerminalMode
  'sidebarOpen',
  'chatHistoryOpen',
  'maxConcurrency',
  'autoModeByWorktree', // Per-worktree auto mode settings (only maxConcurrency is persisted)
  'defaultSkipTests',
  'enableDependencyBlocking',
  'skipVerificationInAutoMode',
  'useWorktrees',
  'defaultPlanningMode',
  'defaultRequirePlanApproval',
  'defaultFeatureModel',
  'muteDoneSound',
  'serverLogLevel',
  'enableRequestLogging',
  'enhancementModel',
  'validationModel',
  'phaseModels',
  'enabledCursorModels',
  'cursorDefaultModel',
  'enabledOpencodeModels',
  'opencodeDefaultModel',
  'enabledDynamicModelIds',
  'disabledProviders',
  'autoLoadClaudeMd',
  'keyboardShortcuts',
  'mcpServers',
  'defaultEditorCommand',
  'defaultTerminalId',
  'promptCustomization',
  'eventHooks',
  'claudeApiProfiles',
  'activeClaudeApiProfileId',
  'projects',
  'trashedProjects',
  'currentProjectId', // ID of currently open project
  'projectHistory',
  'projectHistoryIndex',
  'lastSelectedSessionByProject',
  // UI State (previously in localStorage)
  'worktreePanelCollapsed',
  'lastProjectDir',
  'recentFolders',
] as const;

// Fields from setup store to sync
const SETUP_FIELDS_TO_SYNC = ['isFirstRun', 'setupComplete', 'skipClaudeSetup'] as const;

/**
 * Helper to extract a settings field value from app state
 *
 * Handles special cases where store fields don't map directly to settings:
 * - currentProjectId: Extract from currentProject?.id
 * - terminalFontFamily: Extract from terminalState.fontFamily
 * - Other fields: Direct access
 *
 * @param field The settings field to extract
 * @param appState Current app store state
 * @returns The value of the field in the app state
 */
function getSettingsFieldValue(
  field: (typeof SETTINGS_FIELDS_TO_SYNC)[number],
  appState: ReturnType<typeof useAppStore.getState>
): unknown {
  if (field === 'currentProjectId') {
    return appState.currentProject?.id ?? null;
  }
  if (field === 'terminalFontFamily') {
    return appState.terminalState.fontFamily;
  }
  if (field === 'openTerminalMode') {
    return appState.terminalState.openTerminalMode;
  }
  if (field === 'autoModeByWorktree') {
    // Only persist settings (maxConcurrency), not runtime state (isRunning, runningTasks)
    const autoModeByWorktree = appState.autoModeByWorktree;
    const persistedSettings: Record<string, { maxConcurrency: number; branchName: string | null }> =
      {};
    for (const [key, value] of Object.entries(autoModeByWorktree)) {
      persistedSettings[key] = {
        maxConcurrency: value.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
        branchName: value.branchName,
      };
    }
    return persistedSettings;
  }
  return appState[field as keyof typeof appState];
}

/**
 * Helper to check if a settings field changed between states
 *
 * Compares field values between old and new state, handling special cases:
 * - currentProjectId: Compare currentProject?.id values
 * - terminalFontFamily: Compare terminalState.fontFamily values
 * - Other fields: Direct reference equality check
 *
 * @param field The settings field to check
 * @param newState New app store state
 * @param prevState Previous app store state
 * @returns true if the field value changed between states
 */
function hasSettingsFieldChanged(
  field: (typeof SETTINGS_FIELDS_TO_SYNC)[number],
  newState: ReturnType<typeof useAppStore.getState>,
  prevState: ReturnType<typeof useAppStore.getState>
): boolean {
  if (field === 'currentProjectId') {
    return newState.currentProject?.id !== prevState.currentProject?.id;
  }
  if (field === 'terminalFontFamily') {
    return newState.terminalState.fontFamily !== prevState.terminalState.fontFamily;
  }
  if (field === 'openTerminalMode') {
    return newState.terminalState.openTerminalMode !== prevState.terminalState.openTerminalMode;
  }
  const key = field as keyof typeof newState;
  return newState[key] !== prevState[key];
}

interface SettingsSyncState {
  /** Whether initial settings have been loaded from API */
  loaded: boolean;
  /** Whether there was an error loading settings */
  error: string | null;
  /** Whether settings are currently being synced to server */
  syncing: boolean;
}

/**
 * Hook to sync settings changes to server with debouncing
 *
 * Usage: Call this hook once at the app root level (e.g., in App.tsx)
 * AFTER useSettingsMigration.
 *
 * @returns SettingsSyncState with loaded, error, and syncing fields
 */
export function useSettingsSync(): SettingsSyncState {
  const [state, setState] = useState<SettingsSyncState>({
    loaded: false,
    error: null,
    syncing: false,
  });

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authChecked = useAuthStore((s) => s.authChecked);
  const settingsLoaded = useAuthStore((s) => s.settingsLoaded);

  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedRef = useRef<string>('');
  const isInitializedRef = useRef(false);

  // If auth is lost (logout / session expired), immediately stop syncing and
  // reset initialization so we can safely re-init after the next login.
  useEffect(() => {
    if (!authChecked) return;

    if (!isAuthenticated) {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
      lastSyncedRef.current = '';
      isInitializedRef.current = false;

      // Reset migration state so next login properly waits for fresh hydration
      resetMigrationState();

      setState({ loaded: false, error: null, syncing: false });
    }
  }, [authChecked, isAuthenticated]);

  // Debounced sync function
  const syncToServer = useCallback(async () => {
    try {
      // Never sync when not authenticated or settings not loaded
      // The settingsLoaded flag ensures we don't sync default empty state before hydration
      const auth = useAuthStore.getState();
      logger.debug('[SYNC_CHECK] Auth state:', {
        authChecked: auth.authChecked,
        isAuthenticated: auth.isAuthenticated,
        settingsLoaded: auth.settingsLoaded,
        projectsCount: useAppStore.getState().projects?.length ?? 0,
      });
      if (!auth.authChecked || !auth.isAuthenticated || !auth.settingsLoaded) {
        logger.warn('[SYNC_SKIPPED] Not ready:', {
          authChecked: auth.authChecked,
          isAuthenticated: auth.isAuthenticated,
          settingsLoaded: auth.settingsLoaded,
        });
        return;
      }

      setState((s) => ({ ...s, syncing: true }));
      const api = getHttpApiClient();
      const appState = useAppStore.getState();

      logger.info('[SYNC_START] Syncing to server:', {
        projectsCount: appState.projects?.length ?? 0,
      });

      // Build updates object from current state
      const updates: Record<string, unknown> = {};
      for (const field of SETTINGS_FIELDS_TO_SYNC) {
        updates[field] = getSettingsFieldValue(field, appState);
      }

      // Include setup wizard state (lives in a separate store)
      const setupState = useSetupStore.getState();
      for (const field of SETUP_FIELDS_TO_SYNC) {
        updates[field] = setupState[field as keyof typeof setupState];
      }

      // Create a hash of the updates to avoid redundant syncs
      const updateHash = JSON.stringify(updates);
      if (updateHash === lastSyncedRef.current) {
        logger.debug('[SYNC_SKIP_IDENTICAL] No changes from last sync');
        setState((s) => ({ ...s, syncing: false }));
        return;
      }

      logger.info('[SYNC_SEND] Sending settings update to server:', {
        projects: (updates.projects as any)?.length ?? 0,
        trashedProjects: (updates.trashedProjects as any)?.length ?? 0,
      });

      const result = await api.settings.updateGlobal(updates);
      logger.info('[SYNC_RESPONSE] Server response:', { success: result.success });
      if (result.success) {
        lastSyncedRef.current = updateHash;
        logger.debug('Settings synced to server');

        // Update localStorage cache with synced settings to keep it fresh
        // This prevents stale data when switching between Electron and web modes
        try {
          setItem('automaker-settings-cache', JSON.stringify(updates));
          logger.debug('Updated localStorage cache after sync');
        } catch (storageError) {
          logger.warn('Failed to update localStorage cache after sync:', storageError);
        }
      } else {
        logger.error('Failed to sync settings:', result.error);
      }
    } catch (error) {
      logger.error('Failed to sync settings to server:', error);
    } finally {
      setState((s) => ({ ...s, syncing: false }));
    }
  }, []);

  // Schedule debounced sync
  const scheduleSyncToServer = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    syncTimeoutRef.current = setTimeout(() => {
      syncToServer();
    }, SYNC_DEBOUNCE_MS);
  }, [syncToServer]);

  // Immediate sync helper for critical state (e.g., current project selection)
  const syncNow = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }
    void syncToServer();
  }, [syncToServer]);

  // Initialize sync - WAIT for settings to be loaded and migration to complete
  useEffect(() => {
    // Don't initialize syncing until:
    // 1. Auth has been checked
    // 2. User is authenticated
    // 3. Settings have been loaded from server (settingsLoaded flag)
    // This prevents syncing empty/default state before hydration completes.
    logger.debug('useSettingsSync initialization check:', {
      authChecked,
      isAuthenticated,
      settingsLoaded,
      stateLoaded: state.loaded,
    });
    if (!authChecked || !isAuthenticated || !settingsLoaded) return;
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    async function initializeSync() {
      try {
        // Wait for API key to be ready
        await waitForApiKeyInit();

        // CRITICAL: Wait for migration/hydration to complete before we start syncing
        // This is a backup to the settingsLoaded flag for extra safety
        logger.info('Waiting for migration to complete before starting sync...');
        await waitForMigrationComplete();

        // Wait for React to finish rendering after store hydration.
        // Zustand's subscribe() fires during setState(), which happens BEFORE React's
        // render completes. Use a small delay to ensure all pending state updates
        // have propagated through the React tree before we read state.
        await new Promise((resolve) => setTimeout(resolve, 50));

        logger.info('Migration complete, initializing sync');

        // Read state - at this point React has processed the store update
        const appState = useAppStore.getState();
        const setupState = useSetupStore.getState();

        logger.info('Initial state read:', { projectsCount: appState.projects?.length ?? 0 });

        // Store the initial state hash to avoid immediate re-sync
        // (migration has already hydrated the store from server/localStorage)
        const updates: Record<string, unknown> = {};
        for (const field of SETTINGS_FIELDS_TO_SYNC) {
          updates[field] = getSettingsFieldValue(field, appState);
        }
        for (const field of SETUP_FIELDS_TO_SYNC) {
          updates[field] = setupState[field as keyof typeof setupState];
        }
        lastSyncedRef.current = JSON.stringify(updates);

        logger.info('Settings sync initialized');
        setState({ loaded: true, error: null, syncing: false });
      } catch (error) {
        logger.error('Failed to initialize settings sync:', error);
        setState({
          loaded: true,
          error: error instanceof Error ? error.message : 'Unknown error',
          syncing: false,
        });
      }
    }

    initializeSync();
  }, [authChecked, isAuthenticated, settingsLoaded]);

  // Subscribe to store changes and sync to server
  useEffect(() => {
    if (!state.loaded || !authChecked || !isAuthenticated || !settingsLoaded) return;

    // Subscribe to app store changes
    const unsubscribeApp = useAppStore.subscribe((newState, prevState) => {
      const auth = useAuthStore.getState();
      logger.debug('Store subscription fired:', {
        prevProjects: prevState.projects?.length ?? 0,
        newProjects: newState.projects?.length ?? 0,
        authChecked: auth.authChecked,
        isAuthenticated: auth.isAuthenticated,
        settingsLoaded: auth.settingsLoaded,
        loaded: state.loaded,
      });

      // Don't sync if settings not loaded yet
      if (!auth.settingsLoaded) {
        logger.debug('Store changed but settings not loaded, skipping sync');
        return;
      }

      // If the current project changed, sync immediately so we can restore on next launch
      if (newState.currentProject?.id !== prevState.currentProject?.id) {
        logger.debug('Current project changed, syncing immediately');
        syncNow();
        return;
      }

      // If projects array changed (by reference, meaning content changed), sync immediately
      // This is critical - projects list changes must sync right away to prevent loss
      // when switching between Electron and web modes or closing the app
      if (newState.projects !== prevState.projects) {
        logger.info('[PROJECTS_CHANGED] Projects array changed, syncing immediately', {
          prevCount: prevState.projects?.length ?? 0,
          newCount: newState.projects?.length ?? 0,
          prevProjects: prevState.projects?.map((p) => p.name) ?? [],
          newProjects: newState.projects?.map((p) => p.name) ?? [],
        });
        syncNow();
        return;
      }

      // Check if any other synced field changed
      let changed = false;
      for (const field of SETTINGS_FIELDS_TO_SYNC) {
        if (field === 'projects') continue; // Already handled above
        if (hasSettingsFieldChanged(field, newState, prevState)) {
          changed = true;
          break;
        }
      }

      if (changed) {
        logger.debug('Store changed, scheduling sync');
        scheduleSyncToServer();
      }
    });

    // Subscribe to setup store changes
    const unsubscribeSetup = useSetupStore.subscribe((newState, prevState) => {
      let changed = false;
      for (const field of SETUP_FIELDS_TO_SYNC) {
        const key = field as keyof typeof newState;
        if (newState[key] !== prevState[key]) {
          changed = true;
          break;
        }
      }

      if (changed) {
        // Setup store changes also trigger a sync of all settings
        scheduleSyncToServer();
      }
    });

    return () => {
      unsubscribeApp();
      unsubscribeSetup();
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [state.loaded, authChecked, isAuthenticated, settingsLoaded, scheduleSyncToServer, syncNow]);

  // Best-effort flush on tab close / backgrounding
  useEffect(() => {
    if (!state.loaded || !authChecked || !isAuthenticated || !settingsLoaded) return;

    const handleBeforeUnload = () => {
      // Fire-and-forget; may not complete in all browsers, but helps in Electron/webview
      syncNow();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        syncNow();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [state.loaded, authChecked, isAuthenticated, settingsLoaded, syncNow]);

  return state;
}

/**
 * Manually trigger a sync to server
 * Use this when you need immediate persistence (e.g., before app close)
 */
export async function forceSyncSettingsToServer(): Promise<boolean> {
  try {
    const api = getHttpApiClient();
    const appState = useAppStore.getState();

    const updates: Record<string, unknown> = {};
    for (const field of SETTINGS_FIELDS_TO_SYNC) {
      updates[field] = getSettingsFieldValue(field, appState);
    }
    const setupState = useSetupStore.getState();
    for (const field of SETUP_FIELDS_TO_SYNC) {
      updates[field] = setupState[field as keyof typeof setupState];
    }

    const result = await api.settings.updateGlobal(updates);
    return result.success;
  } catch (error) {
    logger.error('Failed to force sync settings:', error);
    return false;
  }
}

/**
 * Fetch latest settings from server and update store
 * Use this to refresh settings if they may have been modified externally
 */
export async function refreshSettingsFromServer(): Promise<boolean> {
  try {
    const api = getHttpApiClient();
    const result = await api.settings.getGlobal();

    if (!result.success || !result.settings) {
      return false;
    }

    const serverSettings = result.settings as unknown as GlobalSettings;
    const currentAppState = useAppStore.getState();

    // Cursor models - ALWAYS use ALL available models to ensure new models are visible
    const allCursorModels = getAllCursorModelIds();
    const validCursorModelIds = new Set(allCursorModels);

    // Migrate Cursor default model
    const migratedCursorDefault = migrateCursorModelIds([
      serverSettings.cursorDefaultModel ?? 'cursor-auto',
    ])[0];
    const sanitizedCursorDefault = validCursorModelIds.has(migratedCursorDefault)
      ? migratedCursorDefault
      : ('cursor-auto' as CursorModelId);

    // Migrate OpenCode models to canonical format
    const migratedOpencodeModels = migrateOpencodeModelIds(
      serverSettings.enabledOpencodeModels ?? []
    );
    const validOpencodeModelIds = new Set(getAllOpencodeModelIds());
    const sanitizedEnabledOpencodeModels = migratedOpencodeModels.filter((id) =>
      validOpencodeModelIds.has(id)
    );

    // Migrate OpenCode default model
    const migratedOpencodeDefault = migrateOpencodeModelIds([
      serverSettings.opencodeDefaultModel ?? DEFAULT_OPENCODE_MODEL,
    ])[0];
    const sanitizedOpencodeDefaultModel = validOpencodeModelIds.has(migratedOpencodeDefault)
      ? migratedOpencodeDefault
      : DEFAULT_OPENCODE_MODEL;

    if (!sanitizedEnabledOpencodeModels.includes(sanitizedOpencodeDefaultModel)) {
      sanitizedEnabledOpencodeModels.push(sanitizedOpencodeDefaultModel);
    }

    const persistedDynamicModelIds =
      serverSettings.enabledDynamicModelIds ?? currentAppState.enabledDynamicModelIds;
    const sanitizedDynamicModelIds = persistedDynamicModelIds.filter(
      (modelId) => !modelId.startsWith('amazon-bedrock/')
    );

    // Migrate phase models to canonical format
    const migratedPhaseModels = serverSettings.phaseModels
      ? {
          enhancementModel: migratePhaseModelEntry(serverSettings.phaseModels.enhancementModel),
          fileDescriptionModel: migratePhaseModelEntry(
            serverSettings.phaseModels.fileDescriptionModel
          ),
          imageDescriptionModel: migratePhaseModelEntry(
            serverSettings.phaseModels.imageDescriptionModel
          ),
          validationModel: migratePhaseModelEntry(serverSettings.phaseModels.validationModel),
          specGenerationModel: migratePhaseModelEntry(
            serverSettings.phaseModels.specGenerationModel
          ),
          featureGenerationModel: migratePhaseModelEntry(
            serverSettings.phaseModels.featureGenerationModel
          ),
          backlogPlanningModel: migratePhaseModelEntry(
            serverSettings.phaseModels.backlogPlanningModel
          ),
          projectAnalysisModel: migratePhaseModelEntry(
            serverSettings.phaseModels.projectAnalysisModel
          ),
          suggestionsModel: migratePhaseModelEntry(serverSettings.phaseModels.suggestionsModel),
          memoryExtractionModel: migratePhaseModelEntry(
            serverSettings.phaseModels.memoryExtractionModel
          ),
          commitMessageModel: migratePhaseModelEntry(serverSettings.phaseModels.commitMessageModel),
        }
      : undefined;

    // Save theme to localStorage for fallback when server settings aren't available
    if (serverSettings.theme) {
      setItem(THEME_STORAGE_KEY, serverSettings.theme);
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
    if (serverSettings.autoModeByWorktree) {
      const persistedSettings = serverSettings.autoModeByWorktree as Record<
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
      theme: serverSettings.theme as unknown as ThemeMode,
      sidebarOpen: serverSettings.sidebarOpen,
      chatHistoryOpen: serverSettings.chatHistoryOpen,
      maxConcurrency: serverSettings.maxConcurrency,
      autoModeByWorktree: restoredAutoModeByWorktree,
      defaultSkipTests: serverSettings.defaultSkipTests,
      enableDependencyBlocking: serverSettings.enableDependencyBlocking,
      skipVerificationInAutoMode: serverSettings.skipVerificationInAutoMode,
      useWorktrees: serverSettings.useWorktrees,
      defaultPlanningMode: serverSettings.defaultPlanningMode,
      defaultRequirePlanApproval: serverSettings.defaultRequirePlanApproval,
      defaultFeatureModel: serverSettings.defaultFeatureModel
        ? migratePhaseModelEntry(serverSettings.defaultFeatureModel)
        : { model: 'claude-opus' },
      muteDoneSound: serverSettings.muteDoneSound,
      serverLogLevel: serverSettings.serverLogLevel ?? 'info',
      enableRequestLogging: serverSettings.enableRequestLogging ?? true,
      enhancementModel: serverSettings.enhancementModel,
      validationModel: serverSettings.validationModel,
      phaseModels: migratedPhaseModels ?? serverSettings.phaseModels,
      enabledCursorModels: allCursorModels, // Always use ALL cursor models
      cursorDefaultModel: sanitizedCursorDefault,
      enabledOpencodeModels: sanitizedEnabledOpencodeModels,
      opencodeDefaultModel: sanitizedOpencodeDefaultModel,
      enabledDynamicModelIds: sanitizedDynamicModelIds,
      disabledProviders: serverSettings.disabledProviders ?? [],
      autoLoadClaudeMd: serverSettings.autoLoadClaudeMd ?? false,
      keyboardShortcuts: {
        ...currentAppState.keyboardShortcuts,
        ...(serverSettings.keyboardShortcuts as unknown as Partial<
          typeof currentAppState.keyboardShortcuts
        >),
      },
      mcpServers: serverSettings.mcpServers,
      defaultEditorCommand: serverSettings.defaultEditorCommand ?? null,
      defaultTerminalId: serverSettings.defaultTerminalId ?? null,
      promptCustomization: serverSettings.promptCustomization ?? {},
      claudeApiProfiles: serverSettings.claudeApiProfiles ?? [],
      activeClaudeApiProfileId: serverSettings.activeClaudeApiProfileId ?? null,
      projects: serverSettings.projects,
      trashedProjects: serverSettings.trashedProjects,
      projectHistory: serverSettings.projectHistory,
      projectHistoryIndex: serverSettings.projectHistoryIndex,
      lastSelectedSessionByProject: serverSettings.lastSelectedSessionByProject,
      // UI State (previously in localStorage)
      worktreePanelCollapsed: serverSettings.worktreePanelCollapsed ?? false,
      lastProjectDir: serverSettings.lastProjectDir ?? '',
      recentFolders: serverSettings.recentFolders ?? [],
      // Event hooks
      eventHooks: serverSettings.eventHooks ?? [],
      // Terminal settings (nested in terminalState)
      ...((serverSettings.terminalFontFamily || serverSettings.openTerminalMode) && {
        terminalState: {
          ...currentAppState.terminalState,
          ...(serverSettings.terminalFontFamily && {
            fontFamily: serverSettings.terminalFontFamily,
          }),
          ...(serverSettings.openTerminalMode && {
            openTerminalMode: serverSettings.openTerminalMode,
          }),
        },
      }),
    });

    // Also refresh setup wizard state
    useSetupStore.setState({
      setupComplete: serverSettings.setupComplete ?? false,
      isFirstRun: serverSettings.isFirstRun ?? true,
      skipClaudeSetup: serverSettings.skipClaudeSetup ?? false,
      currentStep: serverSettings.setupComplete ? 'complete' : 'welcome',
    });

    logger.info('Settings refreshed from server');
    return true;
  } catch (error) {
    logger.error('Failed to refresh settings from server:', error);
    return false;
  }
}
