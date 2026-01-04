import { useState, useCallback, useEffect } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { createLogger } from '@automaker/utils/logger';
import { router } from './utils/router';
import { SplashScreen } from './components/splash-screen';
import { useSettingsMigration } from './hooks/use-settings-migration';
import { useCursorStatusInit } from './hooks/use-cursor-status-init';
import './styles/global.css';
import './styles/theme-imports';

const logger = createLogger('App');

export default function App() {
  const [showSplash, setShowSplash] = useState(() => {
    // Only show splash once per session
    if (sessionStorage.getItem('automaker-splash-shown')) {
      return false;
    }
    return true;
  });

  // Clear accumulated PerformanceMeasure entries to prevent memory leak in dev mode
  // React's internal scheduler creates performance marks/measures that accumulate without cleanup
  useEffect(() => {
    if (import.meta.env.DEV) {
      const clearPerfEntries = () => {
        performance.clearMarks();
        performance.clearMeasures();
      };
      const interval = setInterval(clearPerfEntries, 5000);
      return () => clearInterval(interval);
    }
  }, []);

  // Run settings migration on startup (localStorage -> file storage)
  const migrationState = useSettingsMigration();
  if (migrationState.migrated) {
    logger.info('Settings migrated to file storage');
  }

  // Initialize Cursor CLI status at startup
  useCursorStatusInit();

  const handleSplashComplete = useCallback(() => {
    sessionStorage.setItem('automaker-splash-shown', 'true');
    setShowSplash(false);
  }, []);

  return (
    <>
      <RouterProvider router={router} />
      {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
    </>
  );
}
