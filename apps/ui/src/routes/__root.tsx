import { createRootRoute, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect, useState, useCallback, useDeferredValue, useRef } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import {
  FileBrowserProvider,
  useFileBrowser,
  setGlobalFileBrowser,
} from '@/contexts/file-browser-context';
import { useAppStore } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';
import { useAuthStore } from '@/store/auth-store';
import { getElectronAPI, isElectron } from '@/lib/electron';
import { isMac } from '@/lib/utils';
import {
  initApiKey,
  isElectronMode,
  verifySession,
  checkSandboxEnvironment,
  getServerUrlSync,
} from '@/lib/http-api-client';
import { Toaster } from 'sonner';
import { ThemeOption, themeOptions } from '@/config/theme-options';
import { SandboxRiskDialog } from '@/components/dialogs/sandbox-risk-dialog';
import { SandboxRejectionScreen } from '@/components/dialogs/sandbox-rejection-screen';

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
  const [setupHydrated, setSetupHydrated] = useState(
    () => useSetupStore.persist?.hasHydrated?.() ?? false
  );
  const authChecked = useAuthStore((s) => s.authChecked);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { openFileBrowser } = useFileBrowser();

  const isSetupRoute = location.pathname === '/setup';
  const isLoginRoute = location.pathname === '/login';

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

  // Check sandbox environment on mount
  useEffect(() => {
    // Skip if already decided
    if (sandboxStatus !== 'pending') {
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
        console.error('[Sandbox] Failed to check environment:', error);
        // On error, assume not containerized and show warning
        if (skipSandboxWarning) {
          setSandboxStatus('confirmed');
        } else {
          setSandboxStatus('needs-confirmation');
        }
      }
    };

    checkSandbox();
  }, [sandboxStatus, skipSandboxWarning]);

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
          console.error('[Sandbox] quit() not available on electronAPI');
        }
      } catch (error) {
        console.error('[Sandbox] Failed to quit app:', error);
      }
    } else {
      // In web mode, show rejection screen
      setSandboxStatus('denied');
    }
  }, []);

  // Ref to prevent concurrent auth checks from running
  const authCheckRunning = useRef(false);

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

        // In Electron mode, we're always authenticated via header
        if (isElectronMode()) {
          useAuthStore.getState().setAuthState({ isAuthenticated: true, authChecked: true });
          return;
        }

        // In web mode, verify the session cookie is still valid
        // by making a request to an authenticated endpoint
        const isValid = await verifySession();

        if (isValid) {
          useAuthStore.getState().setAuthState({ isAuthenticated: true, authChecked: true });
          return;
        }

        // Session is invalid or expired - treat as not authenticated
        useAuthStore.getState().setAuthState({ isAuthenticated: false, authChecked: true });
      } catch (error) {
        console.error('Failed to initialize auth:', error);
        // On error, treat as not authenticated
        useAuthStore.getState().setAuthState({ isAuthenticated: false, authChecked: true });
      } finally {
        authCheckRunning.current = false;
      }
    };

    initAuth();
  }, []); // Runs once per load; auth state drives routing rules

  // Wait for setup store hydration before enforcing routing rules
  useEffect(() => {
    if (useSetupStore.persist?.hasHydrated?.()) {
      setSetupHydrated(true);
      return;
    }

    const unsubscribe = useSetupStore.persist?.onFinishHydration?.(() => {
      setSetupHydrated(true);
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  // Routing rules (web mode):
  // - If not authenticated: force /login (even /setup is protected)
  // - If authenticated but setup incomplete: force /setup
  useEffect(() => {
    if (!setupHydrated) return;

    // Wait for auth check to complete before enforcing any redirects
    if (!isElectronMode() && !authChecked) return;

    // Unauthenticated -> force /login
    if (!isElectronMode() && !isAuthenticated) {
      if (location.pathname !== '/login') {
        navigate({ to: '/login' });
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
  }, [authChecked, isAuthenticated, setupComplete, setupHydrated, location.pathname, navigate]);

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
        console.error('IPC connection failed:', error);
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

  // Show rejection screen if user denied sandbox risk (web mode only)
  if (sandboxStatus === 'denied' && !isElectron()) {
    return <SandboxRejectionScreen />;
  }

  // Show loading while checking sandbox environment
  if (sandboxStatus === 'pending') {
    return (
      <main className="flex h-screen items-center justify-center" data-testid="app-container">
        <div className="text-muted-foreground">Checking environment...</div>
      </main>
    );
  }

  // Show login page (full screen, no sidebar)
  if (isLoginRoute) {
    return (
      <main className="h-screen overflow-hidden" data-testid="app-container">
        <Outlet />
        {/* Show sandbox dialog on top of login page if needed */}
        <SandboxRiskDialog
          open={sandboxStatus === 'needs-confirmation'}
          onConfirm={handleSandboxConfirm}
          onDeny={handleSandboxDeny}
        />
      </main>
    );
  }

  // Wait for auth check before rendering protected routes (web mode only)
  if (!isElectronMode() && !authChecked) {
    return (
      <main className="flex h-screen items-center justify-center" data-testid="app-container">
        <div className="text-muted-foreground">Loading...</div>
      </main>
    );
  }

  // Redirect to login if not authenticated (web mode)
  // Show loading state while navigation to login is in progress
  if (!isElectronMode() && !isAuthenticated) {
    return (
      <main className="flex h-screen items-center justify-center" data-testid="app-container">
        <div className="text-muted-foreground">Redirecting to login...</div>
      </main>
    );
  }

  // Show setup page (full screen, no sidebar) - authenticated only
  if (isSetupRoute) {
    return (
      <main className="h-screen overflow-hidden" data-testid="app-container">
        <Outlet />
        {/* Show sandbox dialog on top of setup page if needed */}
        <SandboxRiskDialog
          open={sandboxStatus === 'needs-confirmation'}
          onConfirm={handleSandboxConfirm}
          onDeny={handleSandboxDeny}
        />
      </main>
    );
  }

  return (
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

      {/* Show sandbox dialog if needed */}
      <SandboxRiskDialog
        open={sandboxStatus === 'needs-confirmation'}
        onConfirm={handleSandboxConfirm}
        onDeny={handleSandboxDeny}
      />
    </main>
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
