/**
 * Update Polling Hook
 *
 * Handles the background polling logic for checking updates.
 * Separated from the store to follow single responsibility principle.
 *
 * This hook only manages WHEN to check, not HOW to check.
 * The actual check logic lives in the updates-store.
 */

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/app-store';
import { useUpdatesStore } from '@/store/updates-store';

// ============================================================================
// Types
// ============================================================================

export interface UseUpdatePollingOptions {
  /** Override the check function (for testing/DI) */
  onCheck?: () => Promise<boolean>;

  /** Override enabled state (for testing) */
  enabled?: boolean;

  /** Override interval in minutes (for testing) */
  intervalMinutes?: number;
}

export interface UseUpdatePollingResult {
  /** Whether polling is currently active */
  isPollingActive: boolean;

  /** Manually trigger a check */
  checkNow: () => Promise<boolean>;

  /** Last check timestamp */
  lastChecked: Date | null;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for background update polling.
 *
 * @param options - Optional overrides for testing/DI
 * @returns Polling state and controls
 */
export function useUpdatePolling(options: UseUpdatePollingOptions = {}): UseUpdatePollingResult {
  const { autoUpdate } = useAppStore();
  const { checkForUpdates, lastChecked } = useUpdatesStore();

  // Allow overrides for testing
  const isEnabled = options.enabled ?? autoUpdate.enabled;
  const intervalMinutes = options.intervalMinutes ?? autoUpdate.checkIntervalMinutes;
  const onCheck = options.onCheck ?? checkForUpdates;

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Don't set up polling if disabled
    if (!isEnabled) {
      return;
    }

    // Check immediately on enable
    onCheck();

    // Set up interval
    const intervalMs = intervalMinutes * 60 * 1000;
    intervalRef.current = setInterval(onCheck, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isEnabled, intervalMinutes, onCheck]);

  return {
    isPollingActive: isEnabled,
    checkNow: onCheck,
    lastChecked,
  };
}
