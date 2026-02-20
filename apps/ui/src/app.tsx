import { useState, useCallback, useEffect } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { createLogger } from '@automaker/utils/logger';
import { router } from './utils/router';
import { SplashScreen } from './components/splash-screen';
import { useSettingsSync } from './hooks/use-settings-sync';
import { useCursorStatusInit } from './hooks/use-cursor-status-init';
import { useProviderAuthInit } from './hooks/use-provider-auth-init';
import { useMobileVisibility, useMobileOnlineManager } from './hooks/use-mobile-visibility';
import { useAppStore } from './store/app-store';
import { TooltipProvider } from '@/components/ui/tooltip';
import './styles/global.css';
import './styles/theme-imports';
import './styles/font-imports';
import { loadUserFonts, preloadAllFonts } from './styles/font-imports';

const logger = createLogger('App');

// Key for localStorage to persist splash screen preference
const DISABLE_SPLASH_KEY = 'automaker-disable-splash';

export default function App() {
  const disableSplashScreen = useAppStore((state) => state.disableSplashScreen);

  const [showSplash, setShowSplash] = useState(() => {
    // Check localStorage for user preference (available synchronously)
    const savedPreference = localStorage.getItem(DISABLE_SPLASH_KEY);
    if (savedPreference === 'true') {
      return false;
    }
    // Only show splash once per browser session.
    // Uses localStorage (not sessionStorage) so tab restores after discard
    // don't replay the splash — sessionStorage is cleared when a tab is discarded.
    // The flag is written on splash complete and cleared when the tab is fully closed
    // (via the 'pagehide' + persisted=false event, which fires on true tab close but
    // not on discard/background). This gives "once per actual session" semantics.
    if (localStorage.getItem('automaker-splash-shown-session')) {
      return false;
    }
    return true;
  });

  // Sync the disableSplashScreen setting to localStorage for fast access on next startup
  useEffect(() => {
    localStorage.setItem(DISABLE_SPLASH_KEY, String(disableSplashScreen));
  }, [disableSplashScreen]);

  // Load user-selected custom fonts on startup, then preload remaining fonts during idle time.
  // Uses requestIdleCallback where available for better mobile performance - this ensures
  // font loading doesn't compete with critical rendering and input handling.
  useEffect(() => {
    // Immediately load any fonts the user has configured
    loadUserFonts();

    // After the app is fully interactive, preload remaining fonts
    // so font picker previews work instantly.
    // Use requestIdleCallback on mobile for better scheduling - it yields to
    // user interactions and critical rendering, unlike setTimeout which may fire
    // during a busy frame and cause jank.
    const schedulePreload =
      typeof requestIdleCallback !== 'undefined'
        ? () => requestIdleCallback(() => preloadAllFonts(), { timeout: 5000 })
        : () => setTimeout(() => preloadAllFonts(), 3000);

    const timer = setTimeout(() => {
      schedulePreload();
    }, 2000); // Wait 2s after mount, then use idle callback for the actual loading

    return () => clearTimeout(timer);
  }, []);

  // Clear accumulated PerformanceMeasure entries to prevent memory leak in dev mode
  // React's internal scheduler creates performance marks/measures that accumulate without cleanup
  useEffect(() => {
    if (import.meta.env.DEV) {
      const clearPerfEntries = () => {
        // Check if window.performance is available before calling its methods
        if (window.performance) {
          window.performance.clearMarks();
          window.performance.clearMeasures();
        }
      };
      const interval = setInterval(clearPerfEntries, 5000);
      return () => clearInterval(interval);
    }
  }, []);

  // Settings are now loaded in __root.tsx after successful session verification
  // This ensures a unified flow: verify session → load settings → redirect
  // We no longer block router rendering here - settings loading happens in __root.tsx

  // Sync settings changes back to server (API-first persistence)
  const settingsSyncState = useSettingsSync();
  if (settingsSyncState.error) {
    logger.error('Settings sync error:', settingsSyncState.error);
  }

  // Initialize Cursor CLI status at startup
  useCursorStatusInit();

  // Initialize Provider auth status at startup (for Claude/Codex usage display)
  useProviderAuthInit();

  // Mobile-specific: Manage React Query focus/online state based on page visibility.
  // Prevents the "blank screen + reload" cycle caused by aggressive refetching
  // when the mobile PWA is switched away from and back to.
  useMobileVisibility();
  useMobileOnlineManager();

  const handleSplashComplete = useCallback(() => {
    // Mark splash as shown for this session (survives tab discard/restore)
    localStorage.setItem('automaker-splash-shown-session', 'true');
    setShowSplash(false);
  }, []);

  // Clear the splash-shown flag when the tab is truly closed (not just discarded).
  // `pagehide` with persisted=false fires on real navigation/close but NOT on discard,
  // so discarded tabs that are restored skip the splash while true re-opens show it.
  useEffect(() => {
    const handlePageHide = (e: PageTransitionEvent) => {
      if (!e.persisted) {
        // Tab is being closed or navigating away (not going into bfcache)
        localStorage.removeItem('automaker-splash-shown-session');
      }
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <RouterProvider router={router} />
      {showSplash && !disableSplashScreen && <SplashScreen onComplete={handleSplashComplete} />}
    </TooltipProvider>
  );
}
