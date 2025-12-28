/**
 * Updates Store
 *
 * Centralized state management for the auto-update feature.
 * Single source of truth for update status, operations, and state.
 *
 * Uses interface -> implementation pattern for easy DI in the future.
 */

import { create } from 'zustand';
import { getElectronAPI } from '@/lib/electron';
import type {
  UpdateInfo,
  UpdateCheckResult,
  UpdatePullResult,
  UpdateApiResponse,
} from '@automaker/types';

// ============================================================================
// Interfaces (for DI)
// ============================================================================

/**
 * Interface for the updates API client.
 * Implement this interface to swap the update mechanism (e.g., git -> HTTP downloads).
 */
export interface IUpdatesApiClient {
  /** Fetch current installation info */
  getInfo(): Promise<UpdateApiResponse<UpdateInfo>>;

  /** Check if updates are available */
  checkForUpdates(): Promise<UpdateApiResponse<UpdateCheckResult>>;

  /** Pull/download updates */
  pullUpdates(): Promise<UpdateApiResponse<UpdatePullResult>>;
}

/**
 * Interface for update event emitter.
 * Allows decoupling event emission from the store.
 */
export interface IUpdateEventEmitter {
  emitUpdatePulled(detail: { newVersion: string; alreadyUpToDate: boolean }): void;
}

// ============================================================================
// Default Implementations
// ============================================================================

/**
 * Default API client using the Electron/HTTP API
 */
const createDefaultApiClient = (): IUpdatesApiClient => ({
  async getInfo() {
    const api = getElectronAPI();
    if (!api.updates?.info) {
      return { success: false, error: 'Updates API not available' };
    }
    return api.updates.info();
  },

  async checkForUpdates() {
    const api = getElectronAPI();
    if (!api.updates?.check) {
      return { success: false, error: 'Updates API not available' };
    }
    return api.updates.check();
  },

  async pullUpdates() {
    const api = getElectronAPI();
    if (!api.updates?.pull) {
      return { success: false, error: 'Updates API not available' };
    }
    return api.updates.pull();
  },
});

/**
 * Default event emitter using window custom events
 */
const createDefaultEventEmitter = (): IUpdateEventEmitter => ({
  emitUpdatePulled(detail) {
    window.dispatchEvent(new CustomEvent('automaker:update-pulled', { detail }));
  },
});

// ============================================================================
// State Types
// ============================================================================

interface UpdatesState {
  // Installation info from /api/updates/info
  info: UpdateInfo | null;

  // Update availability
  updateAvailable: boolean;
  remoteVersion: string | null;
  remoteVersionShort: string | null;

  // Loading states
  isLoadingInfo: boolean;
  isChecking: boolean;
  isPulling: boolean;

  // Error state
  error: string | null;

  // Timestamps
  lastChecked: Date | null;
  lastPulled: Date | null;
}

interface UpdatesActions {
  /** Fetch current installation info */
  fetchInfo: () => Promise<UpdateInfo | null>;

  /** Check for updates (returns true if update available) */
  checkForUpdates: () => Promise<boolean>;

  /** Pull updates (returns result) */
  pullUpdates: () => Promise<UpdatePullResult | null>;

  /** Clear error */
  clearError: () => void;

  /** Reset state */
  reset: () => void;

  /** Set custom API client (for DI/testing) */
  setApiClient: (client: IUpdatesApiClient) => void;

  /** Set custom event emitter (for DI/testing) */
  setEventEmitter: (emitter: IUpdateEventEmitter) => void;
}

export type UpdatesStore = UpdatesState & UpdatesActions;

// ============================================================================
// Initial State
// ============================================================================

const initialState: UpdatesState = {
  info: null,
  updateAvailable: false,
  remoteVersion: null,
  remoteVersionShort: null,
  isLoadingInfo: false,
  isChecking: false,
  isPulling: false,
  error: null,
  lastChecked: null,
  lastPulled: null,
};

// ============================================================================
// Store Factory
// ============================================================================

/**
 * Create the updates store with optional dependency injection.
 *
 * @param apiClient - Custom API client (defaults to Electron/HTTP API)
 * @param eventEmitter - Custom event emitter (defaults to window events)
 */
export const createUpdatesStore = (
  apiClient: IUpdatesApiClient = createDefaultApiClient(),
  eventEmitter: IUpdateEventEmitter = createDefaultEventEmitter()
) => {
  // Mutable references for DI
  let _apiClient = apiClient;
  let _eventEmitter = eventEmitter;

  return create<UpdatesStore>((set, get) => ({
    ...initialState,

    setApiClient: (client: IUpdatesApiClient) => {
      _apiClient = client;
    },

    setEventEmitter: (emitter: IUpdateEventEmitter) => {
      _eventEmitter = emitter;
    },

    fetchInfo: async () => {
      const { isLoadingInfo } = get();
      if (isLoadingInfo) return null;

      set({ isLoadingInfo: true, error: null });

      try {
        const response = await _apiClient.getInfo();

        if (!response.success || !response.result) {
          set({
            isLoadingInfo: false,
            error: response.error || 'Failed to fetch update info',
          });
          return null;
        }

        set({ isLoadingInfo: false, info: response.result });
        return response.result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch update info';
        set({ isLoadingInfo: false, error: message });
        return null;
      }
    },

    checkForUpdates: async () => {
      const { isChecking, isPulling } = get();
      if (isChecking || isPulling) return false;

      set({ isChecking: true, error: null });

      try {
        const response = await _apiClient.checkForUpdates();

        if (!response.success || !response.result) {
          set({
            isChecking: false,
            error: response.error || 'Failed to check for updates',
            lastChecked: new Date(),
          });
          return false;
        }

        const result = response.result;

        // Handle error from the check itself (e.g., network issues)
        if (result.error) {
          set({
            isChecking: false,
            error: result.error,
            lastChecked: new Date(),
          });
          return false;
        }

        set({
          isChecking: false,
          updateAvailable: result.updateAvailable,
          remoteVersion: result.remoteVersion,
          remoteVersionShort: result.remoteVersionShort,
          lastChecked: new Date(),
        });

        return result.updateAvailable;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to check for updates';
        set({ isChecking: false, error: message, lastChecked: new Date() });
        return false;
      }
    },

    pullUpdates: async () => {
      const { isPulling, isChecking } = get();
      if (isPulling || isChecking) return null;

      set({ isPulling: true, error: null });

      try {
        const response = await _apiClient.pullUpdates();

        if (!response.success || !response.result) {
          set({
            isPulling: false,
            error: response.error || 'Failed to pull updates',
          });
          return null;
        }

        const result = response.result;

        // Update state after successful pull
        set({
          isPulling: false,
          updateAvailable: false,
          remoteVersion: null,
          remoteVersionShort: null,
          lastPulled: new Date(),
        });

        // Refresh info to get new commit
        get().fetchInfo();

        // Emit event for other components
        _eventEmitter.emitUpdatePulled({
          newVersion: result.newVersionShort,
          alreadyUpToDate: result.alreadyUpToDate,
        });

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to pull updates';
        set({ isPulling: false, error: message });
        return null;
      }
    },

    clearError: () => {
      set({ error: null });
    },

    reset: () => {
      set(initialState);
    },
  }));
};

// ============================================================================
// Default Store Instance
// ============================================================================

/**
 * Default store instance using the default API client.
 * Use createUpdatesStore() for custom DI.
 */
export const useUpdatesStore = createUpdatesStore();

// ============================================================================
// Selectors
// ============================================================================

export const selectUpdateInfo = (state: UpdatesStore) => state.info;
export const selectUpdateAvailable = (state: UpdatesStore) => state.updateAvailable;
export const selectIsLoading = (state: UpdatesStore) =>
  state.isLoadingInfo || state.isChecking || state.isPulling;
export const selectError = (state: UpdatesStore) => state.error;
