import { createRootRoute, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect, useState, useCallback, useDeferredValue, useRef } from 'react';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createLogger } from '@automaker/utils/logger';
import { Sidebar } from '@/components/layout/sidebar';
import { ProjectSwitcher } from '@/components/layout/project-switcher';
import {
  FileBrowserProvider,
  useFileBrowser,
  setGlobalFileBrowser,
} from '@/contexts/file-browser-context';
import { useAppStore, getStoredTheme, type ThemeMode } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';
import { useAuthStore } from '@/store/auth-store';
import { getElectronAPI, isElectron } from '@/lib/electron';
import { isMac } from '@/lib/utils';
import { initializeProject } from '@/lib/project-init';
import {
  initApiKey,
  verifySession,
  checkSandboxEnvironment,
  getServerUrlSync,
  getHttpApiClient,
  handleServerOffline,
} from '@/lib/http-api-client';
import {
  hydrateStoreFromSettings,
  parseLocalStorageSettings,
  signalMigrationComplete,
  performSettingsMigration,
} from '@/hooks/use-settings-migration';
import { queryClient } from '@/lib/query-client';
import { createIDBPersister, PERSIST_MAX_AGE_MS, PERSIST_THROTTLE_MS } from '@/lib/query-persist';
import { Toaster } from 'sonner';
import { ThemeOption, themeOptions } from '@/config/theme-options';
import { SandboxRiskDialog } from '@/components/dialogs/sandbox-risk-dialog';
import { SandboxRejectionScreen } from '@/components/dialogs/sandbox-rejection-screen';
import { LoadingState } from '@/components/ui/loading-state';
import { useProjectSettingsLoader } from '@/hooks/use-project-settings-loader';
import { useIsCompact } from '@/hooks/use-media-query';
import type { Project } from '@/lib/electron';
import type { GlobalSettings } from '@automaker/types';
import { syncUICache, restoreFromUICache } from '@/store/ui-cache-store';
import { setItem } from '@/lib/storage';

const logger = createLogger('RootLayout');
const IS_DEV = import.meta.env.DEV;
const SERVER_READY_MAX_ATTEMPTS = 8;
const SERVER_READY_BACKOFF_BASE_MS = 250;
const SERVER_READY_MAX_DELAY_MS = 1500;
const SERVER_READY_TIMEOUT_MS = 2000;
const NO_STORE_CACHE_MODE: RequestCache = 'no-store';
const AUTO_OPEN_HISTORY_INDEX = 0;
const SINGLE_PROJECT_COUNT = 1;
const DEFAULT_LAST_OPENED_TIME_MS = 0;

// IndexedDB persister for React Query cache (survives tab discard)
const idbPersister = createIDBPersister();

/** Options for PersistQueryClientProvider */
const persistOptions = {
  persister: idbPersister,
  maxAge: PERSIST_MAX_AGE_MS,
  // Throttle IndexedDB writes to prevent excessive I/O on every query state change.
  // Without this, every query update triggers an IndexedDB write — especially costly on mobile.
  throttleTime: PERSIST_THROTTLE_MS,
  // Build hash injected by Vite — same hash used by swCacheBuster for the SW CACHE_NAME.
  // When the app is rebuilt, this changes and both the IDB query cache and SW cache
  // are invalidated together, preventing stale data from surviving a deployment.
  // In dev mode this is a stable hash of the package version so the cache persists
  // across hot reloads.
  buster: typeof __APP_BUILD_HASH__ !== 'undefined' ? __APP_BUILD_HASH__ : '',
  dehydrateOptions: {
    shouldDehydrateQuery: (query: { state: { status: string } }) =>
      query.state.status === 'success',
  },
};
const AUTO_OPEN_STATUS = {
  idle: 'idle',
  opening: 'opening',
  done: 'done',
} as const;
type AutoOpenStatus = (typeof AUTO_OPEN_STATUS)[keyof typeof AUTO_OPEN_STATUS];

// Apply stored theme immediately on page load (before React hydration)
// This prevents flash of default theme on login/setup pages
function applyStoredTheme(): void {
  const storedTheme = getStoredTheme();
  if (storedTheme) {
    const root = document.documentElement;
    // Remove all theme classes (themeOptions doesn't include 'system' which is only in ThemeMode)
    const themeClasses = themeOptions.map((option) => option.value);
    root.classList.remove(...themeClasses);

    // Apply the stored theme
    if (storedTheme === 'dark') {
      root.classList.add('dark');
    } else if (storedTheme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.add(isDark ? 'dark' : 'light');
    } else if (storedTheme !== 'light') {
      root.classList.add(storedTheme);
    } else {
      root.classList.add('light');
    }
  }
}

// Apply stored theme immediately (runs synchronously before render)
applyStoredTheme();

async function waitForServerReady(): Promise<boolean> {
  const serverUrl = getServerUrlSync();

  for (let attempt = 1; attempt <= SERVER_READY_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(`${serverUrl}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(SERVER_READY_TIMEOUT_MS),
        cache: NO_STORE_CACHE_MODE,
      });

      if (response.ok) {
        return true;
      }
    } catch (error) {
      logger.warn(`Server readiness check failed (attempt ${attempt})`, error);
    }

    const delayMs = Math.min(SERVER_READY_MAX_DELAY_MS, SERVER_READY_BACKOFF_BASE_MS * attempt);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return false;
}

function getProjectLastOpenedMs(project: Project): number {
  if (!project.lastOpened) return DEFAULT_LAST_OPENED_TIME_MS;
  const parsed = Date.parse(project.lastOpened);
  return Number.isNaN(parsed) ? DEFAULT_LAST_OPENED_TIME_MS : parsed;
}

function selectAutoOpenProject(
  currentProject: Project | null,
  projects: Project[],
  projectHistory: string[]
): Project | null {
  if (currentProject) return currentProject;

  if (projectHistory.length > 0) {
    const historyProjectId = projectHistory[AUTO_OPEN_HISTORY_INDEX];
    const historyProject = projects.find((project) => project.id === historyProjectId);
    if (historyProject) {
      return historyProject;
    }
  }

  if (projects.length === SINGLE_PROJECT_COUNT) {
    return projects[AUTO_OPEN_HISTORY_INDEX] ?? null;
  }

  if (projects.length > SINGLE_PROJECT_COUNT) {
    let latestProject: Project | null = projects[AUTO_OPEN_HISTORY_INDEX] ?? null;
    let latestTimestamp = latestProject
      ? getProjectLastOpenedMs(latestProject)
      : DEFAULT_LAST_OPENED_TIME_MS;

    for (const project of projects) {
      const openedAt = getProjectLastOpenedMs(project);
      if (openedAt > latestTimestamp) {
        latestTimestamp = openedAt;
        latestProject = project;
      }
    }

    return latestProject;
  }

  return null;
}

function RootLayoutContent() {
  const location = useLocation();

  // IMPORTANT: Use individual selectors instead of bare useAppStore() to prevent
  // re-rendering on every store mutation. The bare call subscribes to the ENTIRE store,
  // which during initialization causes cascading re-renders as multiple effects write
  // to the store (settings hydration, project settings, auto-open, etc.). With enough
  // rapid mutations, React hits the maximum update depth limit (error #185).
  //
  // Each selector only triggers a re-render when its specific slice of state changes.
  const projects = useAppStore((s) => s.projects);
  const currentProject = useAppStore((s) => s.currentProject);
  const projectHistory = useAppStore((s) => s.projectHistory);
  const sidebarStyle = useAppStore((s) => s.sidebarStyle);
  const skipSandboxWarning = useAppStore((s) => s.skipSandboxWarning);
  // Subscribe to theme and font state to trigger re-renders when they change
  const theme = useAppStore((s) => s.theme);
  const fontFamilySans = useAppStore((s) => s.fontFamilySans);
  const fontFamilyMono = useAppStore((s) => s.fontFamilyMono);
  // Subscribe to previewTheme so that getEffectiveTheme() re-renders when
  // hover previews change the document theme. Without this, the selector
  // for getEffectiveTheme (a stable function ref) won't trigger re-renders.
  const previewTheme = useAppStore((s) => s.previewTheme);
  void previewTheme; // Used only for subscription
  // Actions (stable references from Zustand - never change between renders)
  const setIpcConnected = useAppStore((s) => s.setIpcConnected);
  const upsertAndSetCurrentProject = useAppStore((s) => s.upsertAndSetCurrentProject);
  const getEffectiveTheme = useAppStore((s) => s.getEffectiveTheme);
  const getEffectiveFontSans = useAppStore((s) => s.getEffectiveFontSans);
  const getEffectiveFontMono = useAppStore((s) => s.getEffectiveFontMono);
  const setSkipSandboxWarning = useAppStore((s) => s.setSkipSandboxWarning);
  const fetchCodexModels = useAppStore((s) => s.fetchCodexModels);

  const setupComplete = useSetupStore((s) => s.setupComplete);
  const codexCliStatus = useSetupStore((s) => s.codexCliStatus);
  const navigate = useNavigate();
  const [isMounted, setIsMounted] = useState(false);
  const [streamerPanelOpen, setStreamerPanelOpen] = useState(false);
  const authChecked = useAuthStore((s) => s.authChecked);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const settingsLoaded = useAuthStore((s) => s.settingsLoaded);
  const { openFileBrowser } = useFileBrowser();

  // Load project settings when switching projects
  useProjectSettingsLoader();

  const isSetupRoute = location.pathname === '/setup';
  const isLoginRoute = location.pathname === '/login';
  const isLoggedOutRoute = location.pathname === '/logged-out';
  const isDashboardRoute = location.pathname === '/dashboard';
  const isRootRoute = location.pathname === '/';
  const [autoOpenStatus, setAutoOpenStatus] = useState<AutoOpenStatus>(AUTO_OPEN_STATUS.idle);
  const autoOpenCandidate = selectAutoOpenProject(currentProject, projects, projectHistory);
  const canAutoOpen =
    authChecked &&
    isAuthenticated &&
    settingsLoaded &&
    setupComplete &&
    !isLoginRoute &&
    !isLoggedOutRoute &&
    !isSetupRoute &&
    !!autoOpenCandidate;
  // Only block the UI with "Opening project..." when on the root route.
  // When already on /board or /dashboard, auto-open runs silently in the background —
  // blocking here would cause a visible flash when switching back to the PWA.
  const shouldAutoOpen = canAutoOpen && autoOpenStatus !== AUTO_OPEN_STATUS.done && isRootRoute;
  const shouldBlockForSettings =
    authChecked && isAuthenticated && !settingsLoaded && !isLoginRoute && !isLoggedOutRoute;

  // Sandbox environment check state
  type SandboxStatus = 'pending' | 'containerized' | 'needs-confirmation' | 'denied' | 'confirmed';
  // Always start from pending on a fresh page load so the user sees the prompt
  // each time the app is launched/refreshed (unless running in a container).
  const [sandboxStatus, setSandboxStatus] = useState<SandboxStatus>('pending');

  // Hidden streamer panel - opens with "\" key
  const handleStreamerPanelShortcut = useCallback((event: KeyboardEvent) => {
    const activeElement = document.activeElement;
    if (activeElement) {
      const tagName = activeElement.tagName.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
        return;
      }
      if (activeElement.getAttribute('contenteditable') === 'true') {
        return;
      }
      const role = activeElement.getAttribute('role');
      if (role === 'textbox' || role === 'searchbox' || role === 'combobox') {
        return;
      }
      // Don't intercept when focused inside a terminal
      if (activeElement.closest('.xterm') || activeElement.closest('[data-terminal-container]')) {
        return;
      }
    }

    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }

    if (event.key === '\\') {
      event.preventDefault();
      setStreamerPanelOpen((prev) => !prev);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleStreamerPanelShortcut);
    return () => {
      window.removeEventListener('keydown', handleStreamerPanelShortcut);
    };
  }, [handleStreamerPanelShortcut]);

  const effectiveTheme = getEffectiveTheme();
  // Defer the theme value to keep UI responsive during rapid hover changes
  const deferredTheme = useDeferredValue(effectiveTheme);

  // Get effective theme and fonts for the current project
  // Note: theme/fontFamilySans/fontFamilyMono are destructured above to ensure re-renders when they change
  void theme; // Used for subscription
  void fontFamilySans; // Used for subscription
  void fontFamilyMono; // Used for subscription
  const effectiveFontSans = getEffectiveFontSans();
  const effectiveFontMono = getEffectiveFontMono();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Sync critical UI state to the persistent UI cache store
  // This keeps the cache up-to-date so tab discard recovery is instant
  useEffect(() => {
    const unsubscribe = useAppStore.subscribe((state) => {
      syncUICache({
        currentProject: state.currentProject,
        sidebarOpen: state.sidebarOpen,
        sidebarStyle: state.sidebarStyle,
        worktreePanelCollapsed: state.worktreePanelCollapsed,
        collapsedNavSections: state.collapsedNavSections,
        currentWorktreeByProject: state.currentWorktreeByProject,
      });
    });
    return unsubscribe;
  }, []);

  // Check sandbox environment only after user is authenticated, setup is complete, and settings are loaded
  useEffect(() => {
    // Skip if already decided
    if (sandboxStatus !== 'pending') {
      return;
    }

    // Don't check sandbox until user is authenticated, has completed setup, and settings are loaded
    // CRITICAL: settingsLoaded must be true to ensure skipSandboxWarning has been hydrated from server
    if (!authChecked || !isAuthenticated || !setupComplete || !settingsLoaded) {
      return;
    }

    const checkSandbox = async () => {
      try {
        const result = await checkSandboxEnvironment();

        if (result.isContainerized) {
          // Running in a container, no warning needed
          setSandboxStatus('containerized');
        } else if (result.skipSandboxWarning || skipSandboxWarning) {
          // Skip if env var is set OR if user preference is set
          setSandboxStatus('confirmed');
        } else {
          // Not containerized, show warning dialog
          setSandboxStatus('needs-confirmation');
        }
      } catch (error) {
        logger.error('Failed to check environment:', error);
        // On error, assume not containerized and show warning
        if (skipSandboxWarning) {
          setSandboxStatus('confirmed');
        } else {
          setSandboxStatus('needs-confirmation');
        }
      }
    };

    checkSandbox();
  }, [
    sandboxStatus,
    skipSandboxWarning,
    authChecked,
    isAuthenticated,
    setupComplete,
    settingsLoaded,
  ]);

  // Handle sandbox risk confirmation
  const handleSandboxConfirm = useCallback(
    (skipInFuture: boolean) => {
      if (skipInFuture) {
        setSkipSandboxWarning(true);
      }
      setSandboxStatus('confirmed');
    },
    [setSkipSandboxWarning]
  );

  // Handle sandbox risk denial
  const handleSandboxDeny = useCallback(async () => {
    if (isElectron()) {
      // In Electron mode, quit the application
      // Use window.electronAPI directly since getElectronAPI() returns the HTTP client
      try {
        const electronAPI = window.electronAPI;
        if (electronAPI?.quit) {
          await electronAPI.quit();
        } else {
          logger.error('quit() not available on electronAPI');
        }
      } catch (error) {
        logger.error('Failed to quit app:', error);
      }
    } else {
      // In web mode, show rejection screen
      setSandboxStatus('denied');
    }
  }, []);

  // Ref to prevent concurrent auth checks from running
  const authCheckRunning = useRef(false);

  // Global listener for 401/403 responses during normal app usage.
  // This is triggered by the HTTP client whenever an authenticated request returns 401/403.
  // Works for ALL modes (unified flow)
  useEffect(() => {
    const handleLoggedOut = () => {
      logger.warn('automaker:logged-out event received!');
      // Only update auth state — the centralized routing effect will handle
      // navigation to /logged-out when it detects isAuthenticated is false
      useAuthStore.getState().setAuthState({ isAuthenticated: false, authChecked: true });
    };

    window.addEventListener('automaker:logged-out', handleLoggedOut);
    return () => {
      window.removeEventListener('automaker:logged-out', handleLoggedOut);
    };
  }, []);

  // Global listener for server offline/connection errors.
  // This is triggered when a connection error is detected (e.g., server stopped).
  // Redirects to login page which will detect server is offline and show error UI.
  useEffect(() => {
    const handleServerOffline = () => {
      logger.warn('automaker:server-offline event received!');
      useAuthStore.getState().setAuthState({ isAuthenticated: false, authChecked: true });

      // Navigate to login - the login page will detect server is offline and show appropriate UI
      if (location.pathname !== '/login' && location.pathname !== '/logged-out') {
        navigate({ to: '/login' });
      }
    };

    window.addEventListener('automaker:server-offline', handleServerOffline);
    return () => {
      window.removeEventListener('automaker:server-offline', handleServerOffline);
    };
  }, [location.pathname, navigate]);

  // Initialize authentication
  // - Electron mode: Uses API key from IPC (header-based auth)
  // - Web mode: Uses HTTP-only session cookie
  //
  // Optimizations applied:
  // 1. Instant hydration from localStorage settings cache (optimistic)
  // 2. Parallelized server checks: verifySession + fetchSettings fire together
  // 3. Server settings reconcile in background after optimistic render
  useEffect(() => {
    // Prevent concurrent auth checks
    if (authCheckRunning.current) {
      return;
    }

    const initAuth = async () => {
      authCheckRunning.current = true;

      try {
        // OPTIMIZATION: Restore UI layout from the UI cache store immediately.
        // This gives instant visual continuity (sidebar state, nav sections, etc.)
        // before server settings arrive. Will be reconciled by hydrateStoreFromSettings().
        restoreFromUICache((state) => useAppStore.setState(state));

        // OPTIMIZATION: Immediately hydrate from localStorage settings cache
        // This gives the user an instant UI while server data loads in the background
        const cachedSettings = parseLocalStorageSettings();
        let optimisticallyHydrated = false;
        if (cachedSettings && cachedSettings.projects && cachedSettings.projects.length > 0) {
          logger.info('[FAST_HYDRATE] Optimistically hydrating from localStorage cache');
          hydrateStoreFromSettings(cachedSettings as GlobalSettings);
          optimisticallyHydrated = true;
        }

        // OPTIMIZATION: Take the fast path BEFORE any async work when localStorage is warm.
        //
        // Previously the fast path check came after `await initApiKey()`. Even though
        // initApiKey() is a no-op in web mode, the `await` still yields to the microtask
        // queue — adding one unnecessary event loop tick before authChecked becomes true.
        // By moving this check before any `await`, we set authChecked synchronously within
        // the same React render cycle, eliminating a frame of spinner on mobile.
        //
        // The background verify (waitForServerReady + verifySession) still runs after the
        // `await initApiKey()` below, so Electron mode still gets its server URL before
        // any API calls are made.
        if (optimisticallyHydrated) {
          logger.info(
            '[FAST_HYDRATE] localStorage settings warm — marking auth complete optimistically'
          );
          signalMigrationComplete();
          useAuthStore.getState().setAuthState({
            isAuthenticated: true,
            authChecked: true,
            settingsLoaded: true,
          });

          // OPTIMIZATION: Skip the blocking "Opening project..." auto-open screen
          // when restoring from cache. On a warm restart (PWA memory eviction, tab
          // discard, page reload), currentProject is already restored from the UI
          // cache (restoreFromUICache ran above). The auto-open effect calls
          // initializeProject() which makes 5+ blocking HTTP calls to verify the
          // .automaker directory structure — this is needed for first-time opens
          // but redundant for returning users. Marking auto-open as done lets the
          // routing effect navigate to /board immediately without the detour.
          const restoredProject = useAppStore.getState().currentProject;
          if (restoredProject) {
            logger.info(
              '[FAST_HYDRATE] Project already restored from cache — skipping auto-open',
              restoredProject.name
            );
            setAutoOpenStatus(AUTO_OPEN_STATUS.done);
          }

          // Initialize API key then start background verification.
          // We do this AFTER marking auth complete so the spinner is already gone.
          // In web mode initApiKey() is a no-op; in Electron it fetches the IPC server URL.
          await initApiKey();

          // Background verify: confirm session is still valid + fetch fresh settings.
          // The UI is already rendered from cached data — this reconciles stale state.
          //
          // IMPORTANT: We skip waitForServerReady() here intentionally.
          // waitForServerReady() uses cache:'no-store' (bypasses the service worker)
          // and makes a dedicated /api/health round trip before any real work.
          // On mobile cellular (100-300ms RTT) that pre-flight adds visible delay.
          // Instead we fire verifySession + getGlobal directly — both already handle
          // server-down gracefully via their .catch() wrappers. If the server isn't
          // up yet the catches return null/failure and we simply keep the cached session.
          //
          // IMPORTANT: Distinguish definitive auth failures (401/403 → false) from
          // transient errors (timeouts, network failures → null/throw). Only a definitive
          // failure should reset isAuthenticated — transient errors keep the user logged in.
          void (async () => {
            try {
              const api = getHttpApiClient();
              const [sessionValid, settingsResult] = await Promise.all([
                // verifySession() returns true (valid), false (401/403), or throws (transient).
                // Map throws → null so we can distinguish "definitively invalid" from "couldn't check".
                verifySession().catch((err) => {
                  logger.debug('[FAST_HYDRATE] Background verify threw (transient):', err?.message);
                  return null;
                }),
                api.settings.getGlobal().catch(() => ({ success: false, settings: null }) as const),
              ]);

              if (sessionValid === false) {
                // Session is definitively expired (server returned 401/403) — log them out
                logger.warn('[FAST_HYDRATE] Background verify: session invalid, logging out');
                useAuthStore.getState().setAuthState({ isAuthenticated: false, authChecked: true });
                return;
              }

              // Server responded — mark IPC connected (replaces the separate health check)
              if (sessionValid === true) {
                setIpcConnected(true);
              }

              if (sessionValid === null) {
                // Transient error (timeout, network, 5xx) — keep the user logged in.
                // The next real API call will detect an expired session if needed.
                logger.info(
                  '[FAST_HYDRATE] Background verify inconclusive — keeping session active'
                );
              }
              // Update the localStorage cache with fresh server data so the NEXT
              // cold start uses up-to-date settings. But do NOT call
              // hydrateStoreFromSettings() here — the store was already hydrated
              // from localStorage cache moments ago. Re-hydrating from the server
              // response would create new object references for projects, settings
              // arrays, etc., which triggers useSettingsSync's store subscriber
              // to fire an immediate sync-back POST, causing a visible re-render
              // flash (board → spinner → board) on mobile.
              //
              // The localStorage cache and server data are nearly always identical
              // (the sync hook wrote the cache from the last successful sync).
              // Any genuine differences (e.g., settings changed on another device)
              // will be picked up on the next user interaction or the sync hook's
              // periodic reconciliation.
              if (settingsResult.success && settingsResult.settings) {
                try {
                  const { settings: finalSettings } = await performSettingsMigration(
                    settingsResult.settings as unknown as Parameters<
                      typeof performSettingsMigration
                    >[0]
                  );
                  // Persist fresh server data to localStorage for the next cold start
                  setItem('automaker-settings-cache', JSON.stringify(finalSettings));
                  logger.info(
                    '[FAST_HYDRATE] Background reconcile: cache updated (store untouched)'
                  );
                } catch (e) {
                  logger.debug('[FAST_HYDRATE] Failed to update cache:', e);
                }
              }
            } catch (error) {
              // Outer catch for unexpected errors — do NOT reset auth state.
              // If the session is truly expired, the next API call will handle it.
              logger.warn(
                '[FAST_HYDRATE] Background verify failed (server may be restarting):',
                error
              );
            }
          })();

          return; // Auth is done — foreground initAuth exits here
        }

        // Initialize API key for Electron mode (needed before any server calls)
        await initApiKey();

        // Cold start path: server not yet confirmed running, wait for it
        // (Only reached when localStorage has no cached settings)
        const serverReady = await waitForServerReady();
        if (!serverReady) {
          handleServerOffline();
          return;
        }

        // OPTIMIZATION: Fire verifySession and fetchSettings in parallel
        // instead of waiting for session verification before fetching settings
        const api = getHttpApiClient();
        const [sessionValid, settingsResult] = await Promise.all([
          // verifySession() returns true (valid), false (401/403), or throws (transient).
          // Map throws → null (matching background verify behaviour) so transient
          // failures don't cause unnecessary logouts on cold start.
          verifySession().catch((error) => {
            logger.warn('Session verification threw (transient, keeping session):', error?.message);
            return null;
          }),
          api.settings.getGlobal().catch((error) => {
            logger.warn('Settings fetch failed during parallel init:', error);
            return { success: false, settings: null } as const;
          }),
        ]);

        if (sessionValid === true || sessionValid === null) {
          // Settings were fetched in parallel - use them directly
          if (settingsResult.success && settingsResult.settings) {
            const { settings: finalSettings, migrated } = await performSettingsMigration(
              settingsResult.settings as unknown as Parameters<typeof performSettingsMigration>[0]
            );

            if (migrated) {
              logger.info('Settings migration from localStorage completed');
            }

            // Hydrate store with the final settings (reconcile with optimistic data)
            hydrateStoreFromSettings(finalSettings);

            // CRITICAL: Wait for React to render the hydrated state before
            // signaling completion. Zustand updates are synchronous, but React
            // hasn't necessarily re-rendered yet. This prevents race conditions
            // where useSettingsSync reads state before the UI has updated.
            await new Promise((resolve) => setTimeout(resolve, 0));

            // Signal that settings hydration is complete FIRST.
            signalMigrationComplete();

            // Now mark auth as checked AND settings as loaded.
            useAuthStore.getState().setAuthState({
              isAuthenticated: true,
              authChecked: true,
              settingsLoaded: true,
            });

            return;
          }

          // Settings weren't available in parallel response - retry with backoff
          try {
            const maxAttempts = 6;
            const baseDelayMs = 250;
            let lastError: unknown = settingsResult;

            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
              const delayMs = Math.min(1500, baseDelayMs * attempt);
              logger.warn(
                `Settings not ready (attempt ${attempt}/${maxAttempts}); retrying in ${delayMs}ms...`,
                lastError
              );
              await new Promise((resolve) => setTimeout(resolve, delayMs));

              try {
                const retryResult = await api.settings.getGlobal();
                if (retryResult.success && retryResult.settings) {
                  const { settings: finalSettings, migrated } = await performSettingsMigration(
                    retryResult.settings as unknown as Parameters<
                      typeof performSettingsMigration
                    >[0]
                  );

                  if (migrated) {
                    logger.info('Settings migration from localStorage completed');
                  }

                  hydrateStoreFromSettings(finalSettings);
                  await new Promise((resolve) => setTimeout(resolve, 0));
                  signalMigrationComplete();

                  useAuthStore.getState().setAuthState({
                    isAuthenticated: true,
                    authChecked: true,
                    settingsLoaded: true,
                  });

                  return;
                }

                lastError = retryResult;
              } catch (error) {
                lastError = error;
              }
            }

            throw lastError ?? new Error('Failed to load settings');
          } catch (error) {
            logger.error('Failed to fetch settings after valid session:', error);

            // If optimistically hydrated, allow the user to continue with cached data
            if (optimisticallyHydrated) {
              logger.info('[FAST_HYDRATE] Using optimistic cache as fallback (server unavailable)');
              signalMigrationComplete();
              useAuthStore.getState().setAuthState({
                isAuthenticated: true,
                authChecked: true,
                settingsLoaded: true,
              });
              return;
            }

            // If we can't load settings, we must NOT start syncing defaults to the server.
            // Only update auth state — the routing effect handles navigation to /logged-out.
            // Calling navigate() here AND in the routing effect causes duplicate navigations
            // that can trigger React error #185 (maximum update depth exceeded) on cold start.
            useAuthStore.getState().setAuthState({ isAuthenticated: false, authChecked: true });
            signalMigrationComplete();
            return;
          }
        } else {
          // Session is definitively invalid (server returned 401/403) - treat as not authenticated.
          // Only update auth state — the routing effect handles navigation to /logged-out.
          // Calling navigate() here AND in the routing effect causes duplicate navigations
          // that can trigger React error #185 (maximum update depth exceeded) on cold start.
          useAuthStore.getState().setAuthState({ isAuthenticated: false, authChecked: true });
          // Signal migration complete so sync hook doesn't hang (nothing to sync when not authenticated)
          signalMigrationComplete();
        }
      } catch (error) {
        logger.error('Failed to initialize auth:', error);
        // On error, treat as not authenticated.
        // Only update auth state — the routing effect handles navigation to /logged-out.
        // Calling navigate() here AND in the routing effect causes duplicate navigations
        // that can trigger React error #185 (maximum update depth exceeded) on cold start.
        useAuthStore.getState().setAuthState({ isAuthenticated: false, authChecked: true });
        // Signal migration complete so sync hook doesn't hang
        signalMigrationComplete();
      } finally {
        authCheckRunning.current = false;
      }
    };

    initAuth();
  }, []); // Runs once per load; auth state drives routing rules

  // Note: Settings are now loaded in __root.tsx after successful session verification
  // This ensures a unified flow across all modes (Electron, web, external server)

  // Routing rules (ALL modes - unified flow):
  // - If not authenticated: force /logged-out (even /setup is protected)
  // - If authenticated but setup incomplete: force /setup
  // - If authenticated and setup complete: allow access to app
  useEffect(() => {
    logger.debug('Routing effect triggered:', {
      authChecked,
      isAuthenticated,
      settingsLoaded,
      setupComplete,
      pathname: location.pathname,
    });

    // Wait for auth check to complete before enforcing any redirects
    if (!authChecked) {
      logger.debug('Auth not checked yet, skipping routing');
      return;
    }

    // Unauthenticated -> force /logged-out (but allow /login so user can authenticate)
    if (!isAuthenticated) {
      logger.warn('Not authenticated, redirecting to /logged-out. Auth state:', {
        authChecked,
        isAuthenticated,
        settingsLoaded,
        currentPath: location.pathname,
      });
      if (location.pathname !== '/logged-out' && location.pathname !== '/login') {
        navigate({ to: '/logged-out' });
      }
      return;
    }

    // Wait for settings to be loaded before making setupComplete-based routing decisions
    // This prevents redirecting to /setup before we know the actual setupComplete value
    if (!settingsLoaded) return;

    // Authenticated -> determine whether setup is required
    if (!setupComplete && location.pathname !== '/setup') {
      navigate({ to: '/setup' });
      return;
    }

    // Setup complete but user is still on /setup -> go to dashboard
    if (setupComplete && location.pathname === '/setup') {
      navigate({ to: '/dashboard' });
    }
  }, [authChecked, isAuthenticated, settingsLoaded, setupComplete, location.pathname, navigate]);

  // Fallback: If auth is checked and authenticated but settings not loaded,
  // it means login-view or another component set auth state before __root.tsx's
  // auth flow completed. Load settings now to prevent sync with empty state.
  useEffect(() => {
    // Only trigger if auth is valid but settings aren't loaded yet
    // This handles the case where login-view sets authChecked=true before we finish our auth flow
    if (!authChecked || !isAuthenticated || settingsLoaded) {
      logger.debug('Fallback skipped:', { authChecked, isAuthenticated, settingsLoaded });
      return;
    }

    logger.info('Auth valid but settings not loaded - triggering fallback load');

    const loadSettings = async () => {
      const api = getHttpApiClient();
      try {
        logger.debug('Fetching settings in fallback...');
        const settingsResult = await api.settings.getGlobal();
        logger.debug('Settings fetched:', settingsResult.success ? 'success' : 'failed');
        if (settingsResult.success && settingsResult.settings) {
          const { settings: finalSettings } = await performSettingsMigration(
            settingsResult.settings as unknown as Parameters<typeof performSettingsMigration>[0]
          );
          logger.debug('Settings migrated, hydrating stores...');
          hydrateStoreFromSettings(finalSettings);
          await new Promise((resolve) => setTimeout(resolve, 0));
          signalMigrationComplete();
          logger.debug('Setting settingsLoaded=true');
          useAuthStore.getState().setAuthState({ settingsLoaded: true });
          logger.info('Fallback settings load completed successfully');
        }
      } catch (error) {
        logger.error('Failed to load settings in fallback:', error);
      }
    };

    loadSettings();
  }, [authChecked, isAuthenticated, settingsLoaded]);

  useEffect(() => {
    setGlobalFileBrowser(openFileBrowser);
  }, [openFileBrowser]);

  // Test IPC connection on mount.
  // For returning users on the fast-hydrate path, the background IIFE in initAuth
  // already calls waitForServerReady() which performs a health check. Doing a second
  // concurrent health check wastes a connection slot on mobile's limited TCP pool.
  // Instead, set ipcConnected optimistically for returning users (auth already marked
  // true at module load time) and let the background verify surface any real failures.
  useEffect(() => {
    // Returning users: auth store was pre-populated from localStorage at module load.
    // The background verify IIFE in initAuth handles the real health check.
    // Optimistically mark connected — if the server is truly down, the next API call
    // (triggered by the background verify) will surface the error.
    const { authChecked: alreadyChecked, isAuthenticated: alreadyAuthed } = useAuthStore.getState();
    if (!isElectron() && alreadyChecked && alreadyAuthed) {
      setIpcConnected(true);
      return;
    }

    const testConnection = async () => {
      try {
        if (isElectron()) {
          const api = getElectronAPI();
          const result = await api.ping();
          setIpcConnected(result === 'pong');
          return;
        }

        // Web mode: check backend availability without instantiating the full HTTP client
        const response = await fetch(`${getServerUrlSync()}/api/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(2000),
        });
        setIpcConnected(response.ok);
      } catch (error) {
        logger.error('IPC connection failed:', error);
        setIpcConnected(false);
      }
    };

    testConnection();
  }, [setIpcConnected]);

  // Redirect from welcome page based on project state
  useEffect(() => {
    if (isMounted && isRootRoute) {
      if (!settingsLoaded || shouldAutoOpen) {
        return;
      }
      if (currentProject) {
        // Project is selected, go to board
        navigate({ to: '/board' });
      } else {
        // No project selected, go to dashboard
        navigate({ to: '/dashboard' });
      }
    }
  }, [isMounted, currentProject, isRootRoute, navigate, shouldAutoOpen, settingsLoaded]);

  // Auto-open the most recent project on startup
  useEffect(() => {
    if (!canAutoOpen) return;
    if (autoOpenStatus !== AUTO_OPEN_STATUS.idle) return;

    if (!autoOpenCandidate) return;

    setAutoOpenStatus(AUTO_OPEN_STATUS.opening);

    const openProject = async () => {
      try {
        const initResult = await initializeProject(autoOpenCandidate.path);
        if (!initResult.success) {
          logger.warn('Auto-open project failed:', initResult.error);
          if (isRootRoute) {
            navigate({ to: '/dashboard' });
          }
          return;
        }

        if (!currentProject || currentProject.id !== autoOpenCandidate.id) {
          upsertAndSetCurrentProject(
            autoOpenCandidate.path,
            autoOpenCandidate.name,
            autoOpenCandidate.theme as ThemeMode | undefined
          );
        }

        if (isRootRoute) {
          navigate({ to: '/board' });
        }
      } catch (error) {
        logger.error('Auto-open project crashed:', error);
        if (isRootRoute) {
          navigate({ to: '/dashboard' });
        }
      } finally {
        setAutoOpenStatus(AUTO_OPEN_STATUS.done);
      }
    };

    void openProject();
  }, [
    canAutoOpen,
    autoOpenStatus,
    autoOpenCandidate,
    currentProject,
    navigate,
    upsertAndSetCurrentProject,
    isRootRoute,
  ]);

  // Bootstrap Codex models on app startup (after auth completes)
  useEffect(() => {
    // Only fetch if authenticated and Codex CLI is available
    if (!authChecked || !isAuthenticated) return;

    const isCodexAvailable = codexCliStatus?.installed && codexCliStatus?.hasApiKey;
    if (!isCodexAvailable) return;

    // Fetch models in the background
    fetchCodexModels().catch((error) => {
      logger.warn('Failed to bootstrap Codex models:', error);
    });
  }, [authChecked, isAuthenticated, codexCliStatus, fetchCodexModels]);

  // Apply theme class to document - use deferred value to avoid blocking UI
  useEffect(() => {
    const root = document.documentElement;
    // Remove all theme classes dynamically from themeOptions
    const themeClasses = themeOptions
      .map((option) => option.value)
      .filter((theme) => theme !== ('system' as ThemeOption['value']));
    root.classList.remove(...themeClasses);

    if (deferredTheme === 'dark') {
      root.classList.add('dark');
    } else if (deferredTheme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.add(isDark ? 'dark' : 'light');
    } else if (deferredTheme && deferredTheme !== 'light') {
      root.classList.add(deferredTheme);
    } else {
      root.classList.add('light');
    }
  }, [deferredTheme]);

  // Apply font CSS variables for project-specific font overrides
  useEffect(() => {
    const root = document.documentElement;

    if (effectiveFontSans) {
      root.style.setProperty('--font-sans', effectiveFontSans);
    } else {
      root.style.removeProperty('--font-sans');
    }

    if (effectiveFontMono) {
      root.style.setProperty('--font-mono', effectiveFontMono);
    } else {
      root.style.removeProperty('--font-mono');
    }
  }, [effectiveFontSans, effectiveFontMono]);

  // Show sandbox rejection screen if user denied the risk warning
  if (sandboxStatus === 'denied') {
    return <SandboxRejectionScreen />;
  }

  // Show sandbox risk dialog if not containerized and user hasn't confirmed
  // The dialog is rendered as an overlay while the main content is blocked
  const showSandboxDialog = sandboxStatus === 'needs-confirmation';

  // Show login page (full screen, no sidebar)
  // Note: No sandbox dialog here - it only shows after login and setup complete
  if (isLoginRoute || isLoggedOutRoute) {
    return (
      <main className="h-full overflow-hidden" data-testid="app-container">
        <Outlet />
      </main>
    );
  }

  // Wait for auth check before rendering protected routes (ALL modes - unified flow).
  // The visual here intentionally matches the inline HTML app shell (index.html)
  // so the transition from HTML → React is seamless — no layout shift, no flash.
  if (!authChecked) {
    return (
      <main
        className="flex h-full flex-col items-center justify-center gap-6"
        data-testid="app-container"
      >
        <svg
          className="h-14 w-14 opacity-90"
          viewBox="0 0 256 256"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <rect className="fill-foreground/[0.08]" x="16" y="16" width="224" height="224" rx="56" />
          <g
            className="stroke-foreground/70"
            fill="none"
            strokeWidth="20"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M92 92 L52 128 L92 164" />
            <path d="M144 72 L116 184" />
            <path d="M164 92 L204 128 L164 164" />
          </g>
        </svg>
        {/* Pure CSS spinner — no icon dependencies, so vendor-icons can be deferred/prefetched.
            Matches the HTML app shell in index.html for a seamless HTML→React transition. */}
        <div
          role="status"
          aria-label="Loading"
          className="h-4 w-4 animate-spin rounded-full border-2 border-foreground/10 border-t-foreground/50"
        />
      </main>
    );
  }

  // Redirect to logged-out if not authenticated (ALL modes - unified flow)
  // Show loading state while navigation is in progress
  if (!isAuthenticated) {
    return (
      <main className="flex h-full items-center justify-center" data-testid="app-container">
        <LoadingState message="Redirecting..." />
      </main>
    );
  }

  if (shouldBlockForSettings) {
    return (
      <main className="flex h-full items-center justify-center" data-testid="app-container">
        <LoadingState message="Loading settings..." />
      </main>
    );
  }

  if (shouldAutoOpen) {
    return (
      <main className="flex h-full items-center justify-center" data-testid="app-container">
        <LoadingState message="Opening project..." />
      </main>
    );
  }

  // Show setup page (full screen, no sidebar) - authenticated only
  if (isSetupRoute) {
    return (
      <main className="h-full overflow-hidden" data-testid="app-container">
        <Outlet />
      </main>
    );
  }

  // Show dashboard page (full screen, no sidebar) - authenticated only
  if (isDashboardRoute) {
    return (
      <>
        <main className="h-full overflow-hidden" data-testid="app-container">
          <Outlet />
          <Toaster richColors position="bottom-right" />
        </main>
        <SandboxRiskDialog
          open={showSandboxDialog}
          onConfirm={handleSandboxConfirm}
          onDeny={handleSandboxDeny}
        />
      </>
    );
  }

  return (
    <>
      <main className="flex h-full overflow-hidden" data-testid="app-container">
        {/* Full-width titlebar drag region for Electron window dragging */}
        {isElectron() && (
          <div
            className={`fixed top-0 left-0 right-0 h-6 titlebar-drag-region z-40 pointer-events-none ${isMac ? 'pl-20' : ''}`}
            aria-hidden="true"
          />
        )}
        {/* Discord-style layout: narrow project switcher + expandable sidebar */}
        {sidebarStyle === 'discord' && <ProjectSwitcher />}
        <Sidebar />
        <div
          className="flex-1 flex flex-col overflow-hidden transition-all duration-300"
          style={{ marginRight: streamerPanelOpen ? '250px' : '0' }}
        >
          <Outlet />
        </div>

        {/* Hidden streamer panel - opens with "\" key, pushes content */}
        <div
          className={`fixed top-0 right-0 h-full w-[250px] bg-background border-l border-border transition-transform duration-300 ${
            streamerPanelOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        />
        <Toaster richColors position="bottom-right" />
      </main>
      <SandboxRiskDialog
        open={showSandboxDialog}
        onConfirm={handleSandboxConfirm}
        onDeny={handleSandboxDeny}
      />
    </>
  );
}

function RootLayout() {
  // Hide devtools on compact screens (mobile/tablet) to avoid overlap with UI controls
  const isCompact = useIsCompact();
  // Get the user's preference for showing devtools from the app store
  const showQueryDevtools = useAppStore((state) => state.showQueryDevtools);

  // Show devtools only if: in dev mode, user setting enabled, and not compact screen
  const shouldShowDevtools = IS_DEV && showQueryDevtools && !isCompact;

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <FileBrowserProvider>
        <RootLayoutContent />
      </FileBrowserProvider>
      {shouldShowDevtools && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
      )}
    </PersistQueryClientProvider>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
});
