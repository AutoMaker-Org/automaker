/**
 * UI Cache Store - Persisted UI State for Instant Restore
 *
 * This lightweight Zustand store persists critical UI state to localStorage
 * so that after a tab discard, the user sees their previous UI configuration
 * instantly without waiting for the server.
 *
 * This is NOT a replacement for the app-store or the API-first settings sync.
 * It's a fast cache layer that provides instant visual continuity during:
 * - Tab discard recovery
 * - Page reloads
 * - App restarts
 *
 * The app-store remains the source of truth. This cache is reconciled
 * when server settings are loaded (hydrateStoreFromSettings overwrites everything).
 *
 * Only stores UI-visual state that affects what the user sees immediately:
 * - Selected project ID (to restore board context)
 * - Sidebar state (open/closed, style)
 * - View preferences (board view mode, collapsed sections)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAppStore } from '@/store/app-store';

interface UICacheState {
  /** ID of the currently selected project */
  cachedProjectId: string | null;
  /** Whether sidebar is open */
  cachedSidebarOpen: boolean;
  /** Sidebar style (unified or discord) */
  cachedSidebarStyle: 'unified' | 'discord';
  /** Whether worktree panel is collapsed */
  cachedWorktreePanelCollapsed: boolean;
  /** Collapsed nav sections */
  cachedCollapsedNavSections: Record<string, boolean>;
  /** Selected worktree per project (path + branch) for instant restore on PWA reload */
  cachedCurrentWorktreeByProject: Record<string, { path: string | null; branch: string }>;
}

interface UICacheActions {
  /** Update the cached UI state from the main app store */
  updateFromAppStore: (state: Partial<UICacheState>) => void;
}

const STORE_NAME = 'automaker-ui-cache';

export const useUICacheStore = create<UICacheState & UICacheActions>()(
  persist(
    (set) => ({
      cachedProjectId: null,
      cachedSidebarOpen: true,
      cachedSidebarStyle: 'unified',
      cachedWorktreePanelCollapsed: false,
      cachedCollapsedNavSections: {},
      cachedCurrentWorktreeByProject: {},

      updateFromAppStore: (state) => set(state),
    }),
    {
      name: STORE_NAME,
      version: 2,
      partialize: (state) => ({
        cachedProjectId: state.cachedProjectId,
        cachedSidebarOpen: state.cachedSidebarOpen,
        cachedSidebarStyle: state.cachedSidebarStyle,
        cachedWorktreePanelCollapsed: state.cachedWorktreePanelCollapsed,
        cachedCollapsedNavSections: state.cachedCollapsedNavSections,
        cachedCurrentWorktreeByProject: state.cachedCurrentWorktreeByProject,
      }),
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Record<string, unknown>;
        if (version < 2) {
          // Migration from v1: add cachedCurrentWorktreeByProject
          state.cachedCurrentWorktreeByProject = {};
        }
        return state as unknown as UICacheState & UICacheActions;
      },
    }
  )
);

/**
 * Check whether an unknown value is a valid cached worktree entry.
 * Accepts objects with a non-empty string branch and a path that is null or a string.
 */
function isValidCachedWorktreeEntry(
  worktree: unknown
): worktree is { path: string | null; branch: string } {
  return (
    typeof worktree === 'object' &&
    worktree !== null &&
    typeof (worktree as Record<string, unknown>).branch === 'string' &&
    ((worktree as Record<string, unknown>).branch as string).trim().length > 0 &&
    ((worktree as Record<string, unknown>).path === null ||
      typeof (worktree as Record<string, unknown>).path === 'string')
  );
}

/**
 * Filter a raw worktree map, discarding entries that fail structural validation.
 */
function sanitizeCachedWorktreeByProject(
  raw: Record<string, unknown>
): Record<string, { path: string | null; branch: string }> {
  const sanitized: Record<string, { path: string | null; branch: string }> = {};
  for (const [key, worktree] of Object.entries(raw)) {
    if (isValidCachedWorktreeEntry(worktree)) {
      sanitized[key] = worktree;
    }
  }
  return sanitized;
}

/**
 * Sync critical UI state from the main app store to the UI cache.
 * Call this whenever the app store changes to keep the cache up to date.
 *
 * This is intentionally a function (not a hook) so it can be called
 * from store subscriptions without React.
 */
export function syncUICache(appState: {
  currentProject?: { id: string } | null;
  sidebarOpen?: boolean;
  sidebarStyle?: 'unified' | 'discord';
  worktreePanelCollapsed?: boolean;
  collapsedNavSections?: Record<string, boolean>;
  currentWorktreeByProject?: Record<string, { path: string | null; branch: string }>;
}): void {
  const update: Partial<UICacheState> = {};

  if ('currentProject' in appState) {
    update.cachedProjectId = appState.currentProject?.id ?? null;
  }
  if ('sidebarOpen' in appState) {
    update.cachedSidebarOpen = appState.sidebarOpen;
  }
  if ('sidebarStyle' in appState) {
    update.cachedSidebarStyle = appState.sidebarStyle;
  }
  if ('worktreePanelCollapsed' in appState) {
    update.cachedWorktreePanelCollapsed = appState.worktreePanelCollapsed;
  }
  if ('collapsedNavSections' in appState) {
    update.cachedCollapsedNavSections = appState.collapsedNavSections;
  }
  if ('currentWorktreeByProject' in appState && appState.currentWorktreeByProject) {
    // Persist all valid worktree selections (both main branch and feature worktrees).
    // Validation against actual worktrees happens at restore time in:
    // 1. restoreFromUICache() - early restore with validation
    // 2. use-worktrees.ts - runtime validation that resets to main if deleted
    // This allows users to have their feature worktree selection persist across refreshes.
    update.cachedCurrentWorktreeByProject = sanitizeCachedWorktreeByProject(
      appState.currentWorktreeByProject as Record<string, unknown>
    );
  }

  if (Object.keys(update).length > 0) {
    useUICacheStore.getState().updateFromAppStore(update);
  }
}

/**
 * Restore cached UI state into the main app store.
 * Call this early during initialization — before server settings arrive —
 * so the user sees their previous UI layout instantly on tab discard recovery
 * or page reload, instead of a flash of default state.
 *
 * This is reconciled later when hydrateStoreFromSettings() overwrites
 * the app store with authoritative server data.
 *
 * @param appStoreSetState - The setState function from the app store
 */
export function restoreFromUICache(
  appStoreSetState: (state: Record<string, unknown>) => void
): boolean {
  const cache = useUICacheStore.getState();

  // Only restore if we have meaningful cached data (not just defaults)
  if (cache.cachedProjectId === null) {
    return false;
  }

  // Attempt to resolve the cached project ID to a full project object.
  // At early startup the projects array may be empty (server data not yet loaded),
  // but if projects are already in the store (e.g. optimistic hydration has run)
  // this will restore the project context immediately so tab-discard recovery
  // does not lose the selected project when cached settings are missing.
  const existingProjects = useAppStore.getState().projects;
  const cachedProject = existingProjects.find((p) => p.id === cache.cachedProjectId) ?? null;

  const stateUpdate: Record<string, unknown> = {
    sidebarOpen: cache.cachedSidebarOpen,
    sidebarStyle: cache.cachedSidebarStyle,
    worktreePanelCollapsed: cache.cachedWorktreePanelCollapsed,
    collapsedNavSections: cache.cachedCollapsedNavSections,
  };

  // Restore last selected worktree per project so the board doesn't
  // reset to main branch after PWA memory eviction or tab discard.
  //
  // Restore all valid worktree selections (both main branch and feature worktrees).
  // The validation effect in use-worktrees.ts will handle resetting to main branch
  // if the cached worktree no longer exists when worktree data loads.
  if (
    cache.cachedCurrentWorktreeByProject &&
    Object.keys(cache.cachedCurrentWorktreeByProject).length > 0
  ) {
    // Validate structure only - keep both null (main) and non-null (worktree) paths
    // Runtime validation in use-worktrees.ts handles deleted worktrees gracefully
    const sanitized = sanitizeCachedWorktreeByProject(
      cache.cachedCurrentWorktreeByProject as Record<string, unknown>
    );
    if (Object.keys(sanitized).length > 0) {
      stateUpdate.currentWorktreeByProject = sanitized;
    }
  }

  // Restore the project context when the project object is available.
  // When projects are not yet loaded (empty array), currentProject remains
  // null and will be properly set later by hydrateStoreFromSettings().
  if (cachedProject !== null) {
    stateUpdate.currentProject = cachedProject;
  }

  appStoreSetState(stateUpdate);

  return true;
}
