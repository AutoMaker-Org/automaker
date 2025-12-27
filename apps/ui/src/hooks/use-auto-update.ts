import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';

/**
 * Hook for automatic update checking.
 *
 * Polls the server at the configured interval to check for updates.
 * Shows a persistent toast when an update is available.
 */
export function useAutoUpdate() {
  const { autoUpdate } = useAppStore();
  const [isChecking, setIsChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [remoteCommit, setRemoteCommit] = useState<string | null>(null);
  const [isPulling, setIsPulling] = useState(false);

  // Track if we've already shown the toast for this update
  const shownToastForCommitRef = useRef<string | null>(null);
  const toastIdRef = useRef<string | number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Pull updates
  const pullUpdate = useCallback(async () => {
    setIsPulling(true);

    try {
      const api = getElectronAPI();
      if (!api.updates?.pull) {
        toast.error('Updates API not available');
        return false;
      }

      const result = await api.updates.pull();

      if (!result.success) {
        toast.error(result.error || 'Failed to pull updates');
        return false;
      }

      if (result.result) {
        if (result.result.alreadyUpToDate) {
          toast.success('Already up to date!');
          return true;
        }

        setUpdateAvailable(false);
        shownToastForCommitRef.current = null;

        // Dismiss the update available toast if it's showing
        if (toastIdRef.current) {
          toast.dismiss(toastIdRef.current);
          toastIdRef.current = null;
        }

        // Emit event so other components (like UpdatesSection) can refresh
        window.dispatchEvent(
          new CustomEvent('automaker:update-pulled', {
            detail: { newCommit: result.result.newCommitShort },
          })
        );

        // Show restart toast
        toast.success('Update installed!', {
          description: result.result.message,
          duration: Infinity,
          action: {
            label: 'Restart Now',
            onClick: () => {
              window.location.reload();
            },
          },
        });

        return true;
      }

      return false;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to pull updates';
      toast.error(message);
      return false;
    } finally {
      setIsPulling(false);
    }
  }, []);

  // Check for updates
  const checkForUpdates = useCallback(async () => {
    if (isChecking || isPulling) return;

    setIsChecking(true);

    try {
      const api = getElectronAPI();
      if (!api.updates?.check) {
        return;
      }

      const result = await api.updates.check();

      if (!result.success || !result.result) {
        return;
      }

      if (result.result.error) {
        // Network error or similar - silently ignore, will retry next interval
        console.warn('Update check failed:', result.result.error);
        return;
      }

      if (result.result.updateAvailable && result.result.remoteCommitShort) {
        setUpdateAvailable(true);
        setRemoteCommit(result.result.remoteCommitShort);

        // Only show toast if we haven't shown it for this commit yet
        if (shownToastForCommitRef.current !== result.result.remoteCommit) {
          shownToastForCommitRef.current = result.result.remoteCommit;

          // Dismiss any existing toast
          if (toastIdRef.current) {
            toast.dismiss(toastIdRef.current);
          }

          // Extract repo name for display
          const repoMatch = result.result.upstreamUrl.match(/github\.com[/:]([^/]+\/[^/.]+)/);
          const repoName = repoMatch ? repoMatch[1] : 'upstream';

          // Show persistent toast with update button
          toastIdRef.current = toast.info('Update Available', {
            description: `New version (${result.result.remoteCommitShort}) available from ${repoName}`,
            duration: Infinity,
            action: {
              label: 'Update Now',
              onClick: async () => {
                await pullUpdate();
              },
            },
          });
        }
      } else {
        setUpdateAvailable(false);
        setRemoteCommit(null);
      }
    } catch (err) {
      console.warn('Update check failed:', err);
    } finally {
      setIsChecking(false);
    }
  }, [isChecking, isPulling, pullUpdate]);

  // Set up polling interval
  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Don't set up polling if auto-update is disabled
    if (!autoUpdate.enabled) {
      return;
    }

    // Check immediately on mount/enable
    checkForUpdates();

    // Set up interval
    const intervalMs = autoUpdate.checkIntervalMinutes * 60 * 1000;
    intervalRef.current = setInterval(checkForUpdates, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoUpdate.enabled, autoUpdate.checkIntervalMinutes, checkForUpdates]);

  // Clean up toast on unmount
  useEffect(() => {
    return () => {
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
      }
    };
  }, []);

  return {
    isChecking,
    updateAvailable,
    remoteCommit,
    isPulling,
    checkNow: checkForUpdates,
    pullUpdate,
  };
}
