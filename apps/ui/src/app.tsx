import { useState, useCallback } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './utils/router';
import { SplashScreen } from './components/splash-screen';
import { useSettingsMigration } from './hooks/use-settings-migration';
import './styles/global.css';
import './styles/theme-imports';

import { Shell } from './components/layout/shell';

export default function App() {
  const [showSplash, setShowSplash] = useState(() => {
    // Only show splash once per session
    if (sessionStorage.getItem('automaker-splash-shown')) {
      return false;
    }
    return true;
  });

  // Run settings migration on startup (localStorage -> file storage)
  const migrationState = useSettingsMigration();
  if (migrationState.migrated) {
    console.log('[App] Settings migrated to file storage');
  }

  const handleSplashComplete = useCallback(() => {
    sessionStorage.setItem('automaker-splash-shown', 'true');
    setShowSplash(false);
  }, []);

  return (
    <Shell>
      <RouterProvider router={router} />
      {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
    </Shell>
  );
}
