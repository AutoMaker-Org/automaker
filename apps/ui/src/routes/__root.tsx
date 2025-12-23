import { createRootRoute, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect, useState, useCallback, useDeferredValue } from 'react';
import { AppLayout } from '@/components/layout/app-layout';
import {
  FileBrowserProvider,
  useFileBrowser,
  setGlobalFileBrowser,
} from '@/contexts/file-browser-context';
import { useAppStore } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';
import { getElectronAPI } from '@/lib/electron';
import { Toaster } from 'sonner';
import { ThemeOption, themeOptions } from '@/config/theme-options';

function RootLayoutContent() {
  const location = useLocation();
  const { setIpcConnected, currentProject, getEffectiveTheme } = useAppStore();
  const { setupComplete } = useSetupStore();
  const navigate = useNavigate();
  const [isMounted, setIsMounted] = useState(false);
  const [streamerPanelOpen, setStreamerPanelOpen] = useState(false);
  const [setupHydrated, setSetupHydrated] = useState(
    () => useSetupStore.persist?.hasHydrated?.() ?? false
  );
  const { openFileBrowser } = useFileBrowser();

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

  // Redirect first-run users (or anyone who reopened the wizard) to /setup
  useEffect(() => {
    if (!setupHydrated) return;

    if (!setupComplete && location.pathname !== '/setup') {
      navigate({ to: '/setup' });
    } else if (setupComplete && location.pathname === '/setup') {
      navigate({ to: '/' });
    }
  }, [setupComplete, setupHydrated, location.pathname, navigate]);

  useEffect(() => {
    setGlobalFileBrowser(openFileBrowser);
  }, [openFileBrowser]);

  // Test IPC connection on mount
  useEffect(() => {
    const testConnection = async () => {
      try {
        const api = getElectronAPI();
        const result = await api.ping();
        setIpcConnected(result === 'pong');
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

  // Setup view is full-screen without sidebar
  const isSetupRoute = location.pathname === '/setup';

  if (isSetupRoute) {
    return (
      <main className="h-screen overflow-hidden" data-testid="app-container">
        <Outlet />
      </main>
    );
  }

  return (
    <AppLayout>
      <div
        className="h-full flex flex-col overflow-hidden transition-all duration-300"
        style={{ marginRight: streamerPanelOpen ? '250px' : '0' }}
      >
        <Outlet />
      </div>

      {/* Hidden streamer panel - opens with "\" key, pushes content */}
      <div
        className={`fixed top-0 right-0 h-full w-[250px] bg-background border-l border-border transition-transform duration-300 z-50 ${
          streamerPanelOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      />
      <Toaster richColors position="bottom-right" />
    </AppLayout>
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
