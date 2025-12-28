/**
 * Update Polling Hook
 *
 * Handles the background polling logic for checking updates.
 * Separated from the store to follow single responsibility principle.
 *
 * This hook only manages WHEN to check, not HOW to check.
 * The actual check logic lives in the updates-store.
 */

import { useEffect, useRef, useCallback } from 'react';
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
 * Manages periodic background checks for updates and exposes controls and status.
 *
 * @param options - Optional overrides for testing or dependency injection:
 *   - `onCheck`: override the function used to perform an update check
 *   - `enabled`: force polling enabled or disabled
 *   - `intervalMinutes`: override the polling interval in minutes
 * @returns An object with polling status and controls:
 *   - `isPollingActive`: `true` when polling is enabled, `false` otherwise
 *   - `checkNow`: a function that triggers an immediate update check and returns `true` if an update was found, `false` otherwise
 *   - `lastChecked`: timestamp of the last performed check, or `null` if never checked
 */
export function useUpdatePolling(options: UseUpdatePollingOptions = {}): UseUpdatePollingResult {
  const { autoUpdate } = useAppStore();
  const { checkForUpdates, lastChecked } = useUpdatesStore();

  // Allow overrides for testing
  const isEnabled = options.enabled ?? autoUpdate.enabled;
  const intervalMinutes = options.intervalMinutes ?? autoUpdate.checkIntervalMinutes;

  // Stabilize the check function reference to prevent interval resets
  const onCheckRef = useRef(options.onCheck ?? checkForUpdates);
  onCheckRef.current = options.onCheck ?? checkForUpdates;

  const stableOnCheck = useCallback(() => onCheckRef.current(), []);

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
    stableOnCheck();

    // Set up interval
    const intervalMs = intervalMinutes * 60 * 1000;
    intervalRef.current = setInterval(stableOnCheck, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isEnabled, intervalMinutes, stableOnCheck]);

  return {
    isPollingActive: isEnabled,
    checkNow: stableOnCheck,
    lastChecked,
  };
}