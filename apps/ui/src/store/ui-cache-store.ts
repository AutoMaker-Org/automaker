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
    // Sanitize on write: only persist entries where path is null (main branch).
    // Non-null paths point to worktree directories on disk that may be deleted
    // while the app is not running. Persisting stale paths can cause crash loops
    // on restore (the board renders with an invalid selection, the error boundary
    // reloads, which restores the same bad cache). This mirrors the sanitization
    // in restoreFromUICache() for defense-in-depth.
    const sanitized: Record<string, { path: string | null; branch: string }> = {};
    for (const [projectPath, worktree] of Object.entries(appState.currentWorktreeByProject)) {
      if (
        typeof worktree === 'object' &&
        worktree !== null &&
        'path' in worktree &&
        worktree.path === null
      ) {
        sanitized[projectPath] = worktree;
      }
    }
    update.cachedCurrentWorktreeByProject = sanitized;
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
  // IMPORTANT: Only restore entries where path is null (main branch selection).
  // Non-null paths point to worktree directories on disk that may have been
  // deleted while the PWA was evicted. Restoring a stale worktree path causes
  // the board to render with an invalid selection, and if the server can't
  // validate it fast enough, the app enters an unrecoverable crash loop
  // (the error boundary reloads, which restores the same bad cache).
  // Main branch (path=null) is always valid and safe to restore.
  if (
    cache.cachedCurrentWorktreeByProject &&
    Object.keys(cache.cachedCurrentWorktreeByProject).length > 0
  ) {
    const sanitized: Record<string, { path: string | null; branch: string }> = {};
    for (const [projectPath, worktree] of Object.entries(cache.cachedCurrentWorktreeByProject)) {
      if (
        typeof worktree === 'object' &&
        worktree !== null &&
        'path' in worktree &&
        worktree.path === null
      ) {
        // Main branch selection — always safe to restore
        sanitized[projectPath] = worktree;
      }
      // Non-null paths are dropped; the app will re-discover actual worktrees
      // from the server and the validation effect in use-worktrees will handle
      // resetting to main if the cached worktree no longer exists.
      // Null/malformed entries are also dropped to prevent crashes.
    }
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
