/**
 * Update Notifier Component
 *
 * Responsible for displaying toast notifications related to updates.
 * Subscribes to the updates store and reacts to state changes.
 *
 * This component handles the UI notifications, keeping them separate
 * from the business logic in the store.
 */

import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { useUpdatesStore } from '@/store/updates-store';
import { useUpdatePolling } from '@/hooks/use-update-polling';
import { useAppStore } from '@/store/app-store';
import { getRepoDisplayName } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface UpdateNotifierProps {
  /** Custom handler for update available (for testing/DI) */
  onUpdateAvailable?: (remoteVersion: string) => void;

  /** Custom handler for update installed (for testing/DI) */
  onUpdateInstalled?: (newVersion: string, alreadyUpToDate: boolean) => void;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Update Notifier - handles toast notifications for updates.
 *
 * Place this component at the app root level to enable update notifications.
 * It subscribes to the updates store and shows toasts when:
 * - An update is available (persistent toast with "Update Now" button)
 * - An update is installed (toast with "Restart Now" / "Later" buttons)
 */
export function UpdateNotifier({ onUpdateAvailable, onUpdateInstalled }: UpdateNotifierProps = {}) {
  // Store state
  const { updateAvailable, remoteVersionShort, pullUpdates, isPulling } = useUpdatesStore();

  const { autoUpdate } = useAppStore();

  // Start polling
  useUpdatePolling();

  // Track shown toasts to avoid duplicates
  const shownToastForCommitRef = useRef<string | null>(null);
  const toastIdRef = useRef<string | number | null>(null);

  // Handle "Update Now" click
  const handleUpdateNow = useCallback(async () => {
    const result = await pullUpdates();

    if (result) {
      // Dismiss the "update available" toast
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
        toastIdRef.current = null;
      }

      // Call custom handler if provided
      if (onUpdateInstalled) {
        onUpdateInstalled(result.newVersionShort, result.alreadyUpToDate);
        return;
      }

      // Show appropriate toast based on result
      if (result.alreadyUpToDate) {
        toast.success('Already up to date!');
      } else {
        toast.success('Update installed!', {
          description: result.message,
          duration: Infinity,
          action: {
            label: 'Restart Now',
            onClick: () => {
              window.location.reload();
            },
          },
          cancel: {
            label: 'Later',
            onClick: () => {
              // Just dismiss - user will restart manually later
            },
          },
        });
      }
    }
  }, [pullUpdates, onUpdateInstalled]);

  // Show toast when update becomes available
  useEffect(() => {
    if (!updateAvailable || !remoteVersionShort) {
      return;
    }

    // Don't show toast if we've already shown it for this version
    if (shownToastForCommitRef.current === remoteVersionShort) {
      return;
    }

    shownToastForCommitRef.current = remoteVersionShort;

    // Call custom handler if provided
    if (onUpdateAvailable) {
      onUpdateAvailable(remoteVersionShort);
      return;
    }

    // Dismiss any existing toast
    if (toastIdRef.current) {
      toast.dismiss(toastIdRef.current);
    }

    // Extract repo name for display
    const repoName = getRepoDisplayName(autoUpdate.upstreamUrl);

    // Show persistent toast with update button
    toastIdRef.current = toast.info('Update Available', {
      description: `New version (${remoteVersionShort}) available from ${repoName}`,
      duration: Infinity,
      action: {
        label: isPulling ? 'Updating...' : 'Update Now',
        onClick: handleUpdateNow,
      },
      cancel: {
        label: 'Later',
        onClick: () => {
          // Dismiss toast - won't show again for this version until a new version appears
          shownToastForCommitRef.current = remoteVersionShort;
        },
      },
    });
  }, [
    updateAvailable,
    remoteVersionShort,
    autoUpdate.upstreamUrl,
    isPulling,
    handleUpdateNow,
    onUpdateAvailable,
  ]);

  // Clean up toast on unmount
  useEffect(() => {
    return () => {
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
      }
    };
  }, []);

  // Reset shown toast when update is no longer available
  useEffect(() => {
    if (!updateAvailable) {
      shownToastForCommitRef.current = null;
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
        toastIdRef.current = null;
      }
    }
  }, [updateAvailable]);

  // This component doesn't render anything visible
  return null;
}
