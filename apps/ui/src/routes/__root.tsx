import { createRootRoute, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect, useState, useCallback, useDeferredValue, useRef } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { Sidebar } from '@/components/layout/sidebar';
import {
  FileBrowserProvider,
  useFileBrowser,
  setGlobalFileBrowser,
} from '@/contexts/file-browser-context';
import { useAppStore, getStoredTheme } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';
import { useAuthStore } from '@/store/auth-store';
import { getElectronAPI, isElectron } from '@/lib/electron';
import { isMac } from '@/lib/utils';
import {
  initApiKey,
  verifySession,
  checkSandboxEnvironment,
  getServerUrlSync,
  getHttpApiClient,
} from '@/lib/http-api-client';
import {
  hydrateStoreFromSettings,
  signalMigrationComplete,
  performSettingsMigration,
} from '@/hooks/use-settings-migration';
import { Toaster } from 'sonner';
import { ThemeOption, themeOptions } from '@/config/theme-options';
import { SandboxRiskDialog } from '@/components/dialogs/sandbox-risk-dialog';
import { SandboxRejectionScreen } from '@/components/dialogs/sandbox-rejection-screen';
import { LoadingState } from '@/components/ui/loading-state';
import { useProjectSettingsLoader } from '@/hooks/use-project-settings-loader';

const logger = createLogger('RootLayout');

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

function RootLayoutContent() {
  const location = useLocation();
  const {
    setIpcConnected,
    currentProject,
    getEffectiveTheme,
    skipSandboxWarning,
    setSkipSandboxWarning,
  } = useAppStore();
  const { setupComplete } = useSetupStore();
  const navigate = useNavigate();
  const [isMounted, setIsMounted] = useState(false);
  const [streamerPanelOpen, setStreamerPanelOpen] = useState(false);
  const authChecked = useAuthStore((s) => s.authChecked);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { openFileBrowser } = useFileBrowser();

  // Load project settings when switching projects
  useProjectSettingsLoader();

  const isSetupRoute = location.pathname === '/setup';
  const isLoginRoute = location.pathname === '/login';
  const isLoggedOutRoute = location.pathname === '/logged-out';

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

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Check sandbox environment only after user is authenticated and setup is complete
  useEffect(() => {
    // Skip if already decided
    if (sandboxStatus !== 'pending') {
      return;
    }

    // Don't check sandbox until user is authenticated and has completed setup
    if (!authChecked || !isAuthenticated || !setupComplete) {
      return;
    }

    const checkSandbox = async () => {
      try {
        const result = await checkSandboxEnvironment();

        if (result.isContainerized) {
          // Running in a container, no warning needed
          setSandboxStatus('containerized');
        } else if (skipSandboxWarning) {
          // User opted to skip the warning, auto-confirm
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
  }, [sandboxStatus, skipSandboxWarning, authChecked, isAuthenticated, setupComplete]);

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
      useAuthStore.getState().setAuthState({ isAuthenticated: false, authChecked: true });

      if (location.pathname !== '/logged-out') {
        navigate({ to: '/logged-out' });
      }
    };

    window.addEventListener('automaker:logged-out', handleLoggedOut);
    return () => {
      window.removeEventListener('automaker:logged-out', handleLoggedOut);
    };
  }, [location.pathname, navigate]);

  // Initialize authentication
  // - Electron mode: Uses API key from IPC (header-based auth)
  // - Web mode: Uses HTTP-only session cookie
  useEffect(() => {
    // Prevent concurrent auth checks
    if (authCheckRunning.current) {
      return;
    }

    const initAuth = async () => {
      authCheckRunning.current = true;

      try {
        // Initialize API key for Electron mode
        await initApiKey();

        // 1. Verify session (Single Request, ALL modes)
        let isValid = false;
        try {
          isValid = await verifySession();
        } catch (error) {
          logger.warn('Session verification failed (likely network/server issue):', error);
          isValid = false;
        }

        if (isValid) {
          // 2. Load settings (and hydrate stores) before marking auth as checked.
          // This prevents useSettingsSync from pushing default/empty state to the server
          // when the backend is still starting up or temporarily unavailable.
          const api = getHttpApiClient();
          try {
            const maxAttempts = 8;
            const baseDelayMs = 250;
            let lastError: unknown = null;

            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
              try {
                const settingsResult = await api.settings.getGlobal();
                if (settingsResult.success && settingsResult.settings) {
                  const { settings: finalSettings, migrated } = await performSettingsMigration(
                    settingsResult.settings as unknown as Parameters<
                      typeof performSettingsMigration
                    >[0]
                  );

                  if (migrated) {
                    logger.info('Settings migration from localStorage completed');
                  }

                  // Hydrate store with the final settings (merged if migration occurred)
                  hydrateStoreFromSettings(finalSettings);

                  // Signal that settings hydration is complete so useSettingsSync can start
                  signalMigrationComplete();

                  // Mark auth as checked only after settings hydration succeeded.
                  useAuthStore
                    .getState()
                    .setAuthState({ isAuthenticated: true, authChecked: true });
                  return;
                }

                lastError = settingsResult;
              } catch (error) {
                lastError = error;
              }

              const delayMs = Math.min(1500, baseDelayMs * attempt);
              logger.warn(
                `Settings not ready (attempt ${attempt}/${maxAttempts}); retrying in ${delayMs}ms...`,
                lastError
              );
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            }

            throw lastError ?? new Error('Failed to load settings');
          } catch (error) {
            logger.error('Failed to fetch settings after valid session:', error);
            // If we can't load settings, we must NOT start syncing defaults to the server.
            // Treat as not authenticated for now (backend likely unavailable) and unblock sync hook.
            useAuthStore.getState().setAuthState({ isAuthenticated: false, authChecked: true });
            signalMigrationComplete();
            if (location.pathname !== '/logged-out' && location.pathname !== '/login') {
              navigate({ to: '/logged-out' });
            }
            return;
          }
        } else {
          // Session is invalid or expired - treat as not authenticated
          useAuthStore.getState().setAuthState({ isAuthenticated: false, authChecked: true });
          // Signal migration complete so sync hook doesn't hang (nothing to sync when not authenticated)
          signalMigrationComplete();

          // Redirect to logged-out if not already there or login
          if (location.pathname !== '/logged-out' && location.pathname !== '/login') {
            navigate({ to: '/logged-out' });
          }
        }
      } catch (error) {
        logger.error('Failed to initialize auth:', error);
        // On error, treat as not authenticated
        useAuthStore.getState().setAuthState({ isAuthenticated: false, authChecked: true });
        // Signal migration complete so sync hook doesn't hang
        signalMigrationComplete();
        if (location.pathname !== '/logged-out' && location.pathname !== '/login') {
          navigate({ to: '/logged-out' });
        }
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
    // Wait for auth check to complete before enforcing any redirects
    if (!authChecked) return;

    // Unauthenticated -> force /logged-out (but allow /login so user can authenticate)
    if (!isAuthenticated) {
      if (location.pathname !== '/logged-out' && location.pathname !== '/login') {
        navigate({ to: '/logged-out' });
      }
      return;
    }

    // Authenticated -> determine whether setup is required
    if (!setupComplete && location.pathname !== '/setup') {
      navigate({ to: '/setup' });
      return;
    }

    // Setup complete but user is still on /setup -> go to app
    if (setupComplete && location.pathname === '/setup') {
      navigate({ to: '/' });
    }
  }, [authChecked, isAuthenticated, setupComplete, location.pathname, navigate]);

  useEffect(() => {
    setGlobalFileBrowser(openFileBrowser);
  }, [openFileBrowser]);

  // Test IPC connection on mount
  useEffect(() => {
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

  // Restore to board view if a project was previously open
  useEffect(() => {
    if (isMounted && currentProject && location.pathname === '/') {
      navigate({ to: '/board' });
    }
  }, [isMounted, currentProject, location.pathname, navigate]);

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
      <main className="h-screen overflow-hidden" data-testid="app-container">
        <Outlet />
      </main>
    );
  }

  // Wait for auth check before rendering protected routes (ALL modes - unified flow)
  if (!authChecked) {
    return (
      <main className="flex h-screen items-center justify-center" data-testid="app-container">
        <LoadingState message="Loading..." />
      </main>
    );
  }

  // Redirect to logged-out if not authenticated (ALL modes - unified flow)
  // Show loading state while navigation is in progress
  if (!isAuthenticated) {
    return (
      <main className="flex h-screen items-center justify-center" data-testid="app-container">
        <LoadingState message="Redirecting..." />
      </main>
    );
  }

  // Show setup page (full screen, no sidebar) - authenticated only
  if (isSetupRoute) {
    return (
      <main className="h-screen overflow-hidden" data-testid="app-container">
        <Outlet />
      </main>
    );
  }

  return (
    <>
      <main className="flex h-screen overflow-hidden" data-testid="app-container">
        {/* Full-width titlebar drag region for Electron window dragging */}
        {isElectron() && (
          <div
            className={`fixed top-0 left-0 right-0 h-6 titlebar-drag-region z-40 pointer-events-none ${isMac ? 'pl-20' : ''}`}
            aria-hidden="true"
          />
        )}
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
  return (
    <FileBrowserProvider>
      <RootLayoutContent />
    </FileBrowserProvider>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
});
