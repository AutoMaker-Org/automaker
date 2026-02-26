import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../../src/store/app-store';
import {
  useUICacheStore,
  syncUICache,
  restoreFromUICache,
} from '../../../src/store/ui-cache-store';

function resetUICacheStore() {
  useUICacheStore.setState({
    cachedProjectId: null,
    cachedSidebarOpen: true,
    cachedSidebarStyle: 'unified',
    cachedWorktreePanelCollapsed: false,
    cachedCollapsedNavSections: {},
    cachedCurrentWorktreeByProject: {},
  });
}

describe('ui-cache-store worktree state hardening', () => {
  beforeEach(() => {
    resetUICacheStore();
    useAppStore.setState({ projects: [] as unknown[], currentProject: null });
  });

  it('syncUICache persists only structurally valid worktree entries', () => {
    syncUICache({
      currentWorktreeByProject: {
        '/valid-main': { path: null, branch: 'main' },
        '/valid-feature': { path: '/valid/.worktrees/feature-a', branch: 'feature/a' },
        '/invalid-empty-branch': { path: '/x', branch: '' },
        '/invalid-path-type': { path: 123 as unknown, branch: 'feature/b' } as {
          path: unknown;
          branch: string;
        },
        '/invalid-shape': { path: '/x' } as unknown as { path: string; branch: string },
      },
    });

    expect(useUICacheStore.getState().cachedCurrentWorktreeByProject).toEqual({
      '/valid-main': { path: null, branch: 'main' },
      '/valid-feature': { path: '/valid/.worktrees/feature-a', branch: 'feature/a' },
    });
  });

  it('restoreFromUICache sanitizes worktree map and restores resolved project context', () => {
    useAppStore.setState({
      projects: [{ id: 'project-1', name: 'Project One', path: '/project-1' }] as unknown[],
    });

    useUICacheStore.setState({
      cachedProjectId: 'project-1',
      cachedSidebarOpen: false,
      cachedSidebarStyle: 'discord',
      cachedWorktreePanelCollapsed: true,
      cachedCollapsedNavSections: { a: true },
      cachedCurrentWorktreeByProject: {
        '/valid': { path: '/valid/.worktrees/feature-a', branch: 'feature/a' },
        '/invalid': { path: 123 as unknown, branch: 'feature/b' } as unknown as {
          path: string | null;
          branch: string;
        },
      },
    });

    const appStoreSetState = vi.fn();
    const didRestore = restoreFromUICache(appStoreSetState);

    expect(didRestore).toBe(true);
    expect(appStoreSetState).toHaveBeenCalledTimes(1);

    const restoredState = appStoreSetState.mock.calls[0][0] as Record<string, unknown>;
    expect(restoredState.currentWorktreeByProject).toEqual({
      '/valid': { path: '/valid/.worktrees/feature-a', branch: 'feature/a' },
    });
    expect(restoredState.currentProject).toEqual({
      id: 'project-1',
      name: 'Project One',
      path: '/project-1',
    });
  });

  it('restoreFromUICache returns false when there is no cached project context', () => {
    const appStoreSetState = vi.fn();

    const didRestore = restoreFromUICache(appStoreSetState);

    expect(didRestore).toBe(false);
    expect(appStoreSetState).not.toHaveBeenCalled();
  });
});
