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
import type { GlobalSettings } from '@automaker/types';

const logger = createLogger('SettingsSync');

// Debounce delay for syncing settings to server (ms)
const SYNC_DEBOUNCE_MS = 1000;

// Fields to sync to server (subset of AppState that should be persisted)
const SETTINGS_FIELDS_TO_SYNC = [
  'theme',
  'sidebarOpen',
  'chatHistoryOpen',
  'maxConcurrency',
  'defaultSkipTests',
  'enableDependencyBlocking',
  'skipVerificationInAutoMode',
  'useWorktrees',
  'defaultPlanningMode',
  'defaultRequirePlanApproval',
  'muteDoneSound',
  'enhancementModel',
  'validationModel',
  'phaseModels',
  'enabledCursorModels',
  'cursorDefaultModel',
  'autoLoadClaudeMd',
  'keyboardShortcuts',
  'mcpServers',
  'defaultEditorCommand',
  'promptCustomization',
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
      logger.debug('syncToServer check:', {
        authChecked: auth.authChecked,
        isAuthenticated: auth.isAuthenticated,
        settingsLoaded: auth.settingsLoaded,
        projectsCount: useAppStore.getState().projects?.length ?? 0,
      });
      if (!auth.authChecked || !auth.isAuthenticated || !auth.settingsLoaded) {
        logger.debug('Sync skipped: not authenticated or settings not loaded');
        return;
      }

      setState((s) => ({ ...s, syncing: true }));
      const api = getHttpApiClient();
      const appState = useAppStore.getState();

      logger.debug('Syncing to server:', { projectsCount: appState.projects?.length ?? 0 });

      // Build updates object from current state
      const updates: Record<string, unknown> = {};
      for (const field of SETTINGS_FIELDS_TO_SYNC) {
        if (field === 'currentProjectId') {
          // Special handling: extract ID from currentProject object
          updates[field] = appState.currentProject?.id ?? null;
        } else {
          updates[field] = appState[field as keyof typeof appState];
        }
      }

      // Include setup wizard state (lives in a separate store)
      const setupState = useSetupStore.getState();
      for (const field of SETUP_FIELDS_TO_SYNC) {
        updates[field] = setupState[field as keyof typeof setupState];
      }

      // Create a hash of the updates to avoid redundant syncs
      const updateHash = JSON.stringify(updates);
      if (updateHash === lastSyncedRef.current) {
        logger.debug('Sync skipped: no changes');
        setState((s) => ({ ...s, syncing: false }));
        return;
      }

      logger.info('Sending settings update:', { projects: updates.projects });

      const result = await api.settings.updateGlobal(updates);
      if (result.success) {
        lastSyncedRef.current = updateHash;
        logger.debug('Settings synced to server');
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
          if (field === 'currentProjectId') {
            updates[field] = appState.currentProject?.id ?? null;
          } else {
            updates[field] = appState[field as keyof typeof appState];
          }
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

      // Check if any synced field changed
      let changed = false;
      for (const field of SETTINGS_FIELDS_TO_SYNC) {
        if (field === 'currentProjectId') {
          // Special handling: compare currentProject IDs
          if (newState.currentProject?.id !== prevState.currentProject?.id) {
            changed = true;
            break;
          }
        } else {
          const key = field as keyof typeof newState;
          if (newState[key] !== prevState[key]) {
            changed = true;
            break;
          }
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
      if (field === 'currentProjectId') {
        updates[field] = appState.currentProject?.id ?? null;
      } else {
        updates[field] = appState[field as keyof typeof appState];
      }
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

    // Save theme to localStorage for fallback when server settings aren't available
    if (serverSettings.theme) {
      setItem(THEME_STORAGE_KEY, serverSettings.theme);
    }

    useAppStore.setState({
      theme: serverSettings.theme as unknown as ThemeMode,
      sidebarOpen: serverSettings.sidebarOpen,
      chatHistoryOpen: serverSettings.chatHistoryOpen,
      maxConcurrency: serverSettings.maxConcurrency,
      defaultSkipTests: serverSettings.defaultSkipTests,
      enableDependencyBlocking: serverSettings.enableDependencyBlocking,
      skipVerificationInAutoMode: serverSettings.skipVerificationInAutoMode,
      useWorktrees: serverSettings.useWorktrees,
      defaultPlanningMode: serverSettings.defaultPlanningMode,
      defaultRequirePlanApproval: serverSettings.defaultRequirePlanApproval,
      muteDoneSound: serverSettings.muteDoneSound,
      enhancementModel: serverSettings.enhancementModel,
      validationModel: serverSettings.validationModel,
      phaseModels: serverSettings.phaseModels,
      enabledCursorModels: serverSettings.enabledCursorModels,
      cursorDefaultModel: serverSettings.cursorDefaultModel,
      autoLoadClaudeMd: serverSettings.autoLoadClaudeMd ?? false,
      keyboardShortcuts: {
        ...currentAppState.keyboardShortcuts,
        ...(serverSettings.keyboardShortcuts as unknown as Partial<
          typeof currentAppState.keyboardShortcuts
        >),
      },
      mcpServers: serverSettings.mcpServers,
      defaultEditorCommand: serverSettings.defaultEditorCommand ?? null,
      promptCustomization: serverSettings.promptCustomization ?? {},
      projects: serverSettings.projects,
      trashedProjects: serverSettings.trashedProjects,
      projectHistory: serverSettings.projectHistory,
      projectHistoryIndex: serverSettings.projectHistoryIndex,
      lastSelectedSessionByProject: serverSettings.lastSelectedSessionByProject,
      // UI State (previously in localStorage)
      worktreePanelCollapsed: serverSettings.worktreePanelCollapsed ?? false,
      lastProjectDir: serverSettings.lastProjectDir ?? '',
      recentFolders: serverSettings.recentFolders ?? [],
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
