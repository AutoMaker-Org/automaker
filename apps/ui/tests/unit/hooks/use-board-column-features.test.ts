/**
 * Unit tests for useBoardColumnFeatures hook
 * These tests verify the column filtering logic, including the race condition
 * protection for recently completed features appearing in backlog.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBoardColumnFeatures } from '../../../src/components/views/board-view/hooks/use-board-column-features';
import { useAppStore } from '../../../src/store/app-store';
import type { Feature } from '@automaker/types';

// Helper to create mock features
function createMockFeature(id: string, status: string, options: Partial<Feature> = {}): Feature {
  return {
    id,
    title: `Feature ${id}`,
    category: 'test',
    description: `Description for ${id}`,
    status,
    ...options,
  };
}

describe('useBoardColumnFeatures', () => {
  const defaultProps = {
    features: [] as Feature[],
    runningAutoTasks: [] as string[],
    runningAutoTasksAllWorktrees: [] as string[],
    searchQuery: '',
    currentWorktreePath: null as string | null,
    currentWorktreeBranch: null as string | null,
    projectPath: '/test/project' as string | null,
  };

  beforeEach(() => {
    // Reset store state
    useAppStore.setState({
      recentlyCompletedFeatures: new Set<string>(),
    });
    // Suppress console.debug in tests
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('basic column mapping', () => {
    it('should map backlog features to backlog column', () => {
      const features = [createMockFeature('feat-1', 'backlog')];

      const { result } = renderHook(() =>
        useBoardColumnFeatures({
          ...defaultProps,
          features,
        })
      );

      expect(result.current.columnFeaturesMap.backlog).toHaveLength(1);
      expect(result.current.columnFeaturesMap.backlog[0].id).toBe('feat-1');
    });

    it('should map merge_conflict features to backlog column', () => {
      const features = [createMockFeature('feat-1', 'merge_conflict')];

      const { result } = renderHook(() =>
        useBoardColumnFeatures({
          ...defaultProps,
          features,
        })
      );

      expect(result.current.columnFeaturesMap.backlog).toHaveLength(1);
      expect(result.current.columnFeaturesMap.backlog[0].id).toBe('feat-1');
    });

    it('should map in_progress features to in_progress column', () => {
      const features = [createMockFeature('feat-1', 'in_progress')];

      const { result } = renderHook(() =>
        useBoardColumnFeatures({
          ...defaultProps,
          features,
        })
      );

      expect(result.current.columnFeaturesMap.in_progress).toHaveLength(1);
      expect(result.current.columnFeaturesMap.in_progress[0].id).toBe('feat-1');
    });

    it('should map verified features to verified column', () => {
      const features = [createMockFeature('feat-1', 'verified')];

      const { result } = renderHook(() =>
        useBoardColumnFeatures({
          ...defaultProps,
          features,
        })
      );

      expect(result.current.columnFeaturesMap.verified).toHaveLength(1);
      expect(result.current.columnFeaturesMap.verified[0].id).toBe('feat-1');
    });

    it('should map completed features to completed column', () => {
      const features = [createMockFeature('feat-1', 'completed')];

      const { result } = renderHook(() =>
        useBoardColumnFeatures({
          ...defaultProps,
          features,
        })
      );

      expect(result.current.columnFeaturesMap.completed).toHaveLength(1);
      expect(result.current.columnFeaturesMap.completed[0].id).toBe('feat-1');
    });
  });

  describe('race condition protection for running tasks', () => {
    it('should place running features in in_progress even if status is backlog', () => {
      const features = [createMockFeature('feat-1', 'backlog')];

      const { result } = renderHook(() =>
        useBoardColumnFeatures({
          ...defaultProps,
          features,
          runningAutoTasksAllWorktrees: ['feat-1'],
        })
      );

      // Should be in in_progress due to running task protection
      expect(result.current.columnFeaturesMap.in_progress).toHaveLength(1);
      expect(result.current.columnFeaturesMap.backlog).toHaveLength(0);
    });

    it('should place running ready features in in_progress', () => {
      const features = [createMockFeature('feat-1', 'ready')];

      const { result } = renderHook(() =>
        useBoardColumnFeatures({
          ...defaultProps,
          features,
          runningAutoTasksAllWorktrees: ['feat-1'],
        })
      );

      expect(result.current.columnFeaturesMap.in_progress).toHaveLength(1);
      expect(result.current.columnFeaturesMap.backlog).toHaveLength(0);
    });

    it('should place running interrupted features in in_progress', () => {
      const features = [createMockFeature('feat-1', 'interrupted')];

      const { result } = renderHook(() =>
        useBoardColumnFeatures({
          ...defaultProps,
          features,
          runningAutoTasksAllWorktrees: ['feat-1'],
        })
      );

      expect(result.current.columnFeaturesMap.in_progress).toHaveLength(1);
      expect(result.current.columnFeaturesMap.backlog).toHaveLength(0);
    });
  });

  describe('recently completed features race condition protection', () => {
    it('should NOT place recently completed features in backlog (stale cache race condition)', () => {
      const features = [createMockFeature('feat-1', 'backlog')];

      // Simulate the race condition: feature just completed but cache still has status=backlog
      useAppStore.setState({
        recentlyCompletedFeatures: new Set(['feat-1']),
      });

      const { result } = renderHook(() =>
        useBoardColumnFeatures({
          ...defaultProps,
          features,
          // Feature is no longer in running tasks (was just removed)
          runningAutoTasksAllWorktrees: [],
        })
      );

      // Feature should NOT appear in backlog due to race condition protection
      expect(result.current.columnFeaturesMap.backlog).toHaveLength(0);
      // And not in in_progress since it's not running
      expect(result.current.columnFeaturesMap.in_progress).toHaveLength(0);
    });

    it('should allow recently completed features with verified status to go to verified column', () => {
      const features = [createMockFeature('feat-1', 'verified')];

      // Feature is both recently completed AND has correct status
      useAppStore.setState({
        recentlyCompletedFeatures: new Set(['feat-1']),
      });

      const { result } = renderHook(() =>
        useBoardColumnFeatures({
          ...defaultProps,
          features,
          runningAutoTasksAllWorktrees: [],
        })
      );

      // Feature should be in verified (status takes precedence)
      expect(result.current.columnFeaturesMap.verified).toHaveLength(1);
      expect(result.current.columnFeaturesMap.backlog).toHaveLength(0);
    });

    it('should protect multiple recently completed features from appearing in backlog', () => {
      const features = [
        createMockFeature('feat-1', 'backlog'),
        createMockFeature('feat-2', 'backlog'),
        createMockFeature('feat-3', 'backlog'),
      ];

      // Multiple features just completed but cache has stale status
      useAppStore.setState({
        recentlyCompletedFeatures: new Set(['feat-1', 'feat-2', 'feat-3']),
      });

      const { result } = renderHook(() =>
        useBoardColumnFeatures({
          ...defaultProps,
          features,
          runningAutoTasksAllWorktrees: [],
        })
      );

      // None should appear in backlog
      expect(result.current.columnFeaturesMap.backlog).toHaveLength(0);
    });

    it('should only protect recently completed features, not all backlog features', () => {
      const features = [
        createMockFeature('feat-completed', 'backlog'), // Recently completed
        createMockFeature('feat-normal', 'backlog'), // Normal backlog feature
      ];

      // Only one feature is recently completed
      useAppStore.setState({
        recentlyCompletedFeatures: new Set(['feat-completed']),
      });

      const { result } = renderHook(() =>
        useBoardColumnFeatures({
          ...defaultProps,
          features,
          runningAutoTasksAllWorktrees: [],
        })
      );

      // Normal feature should still appear in backlog
      expect(result.current.columnFeaturesMap.backlog).toHaveLength(1);
      expect(result.current.columnFeaturesMap.backlog[0].id).toBe('feat-normal');
    });

    it('should protect ready status features that are recently completed', () => {
      const features = [createMockFeature('feat-1', 'ready')];

      useAppStore.setState({
        recentlyCompletedFeatures: new Set(['feat-1']),
      });

      const { result } = renderHook(() =>
        useBoardColumnFeatures({
          ...defaultProps,
          features,
          runningAutoTasksAllWorktrees: [],
        })
      );

      // Should not appear in backlog (ready normally goes to backlog)
      expect(result.current.columnFeaturesMap.backlog).toHaveLength(0);
    });

    it('should protect interrupted status features that are recently completed', () => {
      const features = [createMockFeature('feat-1', 'interrupted')];

      useAppStore.setState({
        recentlyCompletedFeatures: new Set(['feat-1']),
      });

      const { result } = renderHook(() =>
        useBoardColumnFeatures({
          ...defaultProps,
          features,
          runningAutoTasksAllWorktrees: [],
        })
      );

      // Should not appear in backlog (interrupted normally goes to backlog)
      expect(result.current.columnFeaturesMap.backlog).toHaveLength(0);
    });
  });

  describe('recently completed features clearing on cache refresh', () => {
    it('should clear recently completed features when features list updates with terminal status', async () => {
      const {
        addRecentlyCompletedFeature,
        clearRecentlyCompletedFeatures: _clearRecentlyCompletedFeatures,
      } = useAppStore.getState();

      // Add feature to recently completed
      act(() => {
        addRecentlyCompletedFeature('feat-1');
      });

      expect(useAppStore.getState().recentlyCompletedFeatures.has('feat-1')).toBe(true);

      // Simulate cache refresh with updated feature status
      const features = [createMockFeature('feat-1', 'verified')];

      const { rerender } = renderHook((props) => useBoardColumnFeatures(props), {
        initialProps: {
          ...defaultProps,
          features: [],
        },
      });

      // Rerender with the new features (simulating cache refresh)
      rerender({
        ...defaultProps,
        features,
      });

      // The useEffect should detect that feat-1 now has verified status
      // and clear the recentlyCompletedFeatures
      // Note: This happens asynchronously in the useEffect
      await vi.waitFor(() => {
        expect(useAppStore.getState().recentlyCompletedFeatures.has('feat-1')).toBe(false);
      });
    });

    it('should clear recently completed when completed status is detected', async () => {
      const { addRecentlyCompletedFeature } = useAppStore.getState();

      act(() => {
        addRecentlyCompletedFeature('feat-1');
      });

      const features = [createMockFeature('feat-1', 'completed')];

      renderHook(() =>
        useBoardColumnFeatures({
          ...defaultProps,
          features,
        })
      );

      await vi.waitFor(() => {
        expect(useAppStore.getState().recentlyCompletedFeatures.has('feat-1')).toBe(false);
      });
    });
  });

  describe('combined running task and recently completed protection', () => {
    it('should prioritize running task protection over recently completed for same feature', () => {
      const features = [createMockFeature('feat-1', 'backlog')];

      // Feature is both in running tasks AND recently completed
      useAppStore.setState({
        recentlyCompletedFeatures: new Set(['feat-1']),
      });

      const { result } = renderHook(() =>
        useBoardColumnFeatures({
          ...defaultProps,
          features,
          runningAutoTasksAllWorktrees: ['feat-1'],
        })
      );

      // Running task protection should win - feature goes to in_progress
      expect(result.current.columnFeaturesMap.in_progress).toHaveLength(1);
      expect(result.current.columnFeaturesMap.backlog).toHaveLength(0);
    });

    it('should handle mixed scenario with running, recently completed, and normal features', () => {
      const features = [
        createMockFeature('feat-running', 'backlog'), // Running but status stale
        createMockFeature('feat-completed', 'backlog'), // Just completed but status stale
        createMockFeature('feat-normal', 'backlog'), // Normal backlog feature
      ];

      useAppStore.setState({
        recentlyCompletedFeatures: new Set(['feat-completed']),
      });

      const { result } = renderHook(() =>
        useBoardColumnFeatures({
          ...defaultProps,
          features,
          runningAutoTasksAllWorktrees: ['feat-running'],
        })
      );

      // Running feature -> in_progress
      expect(result.current.columnFeaturesMap.in_progress).toHaveLength(1);
      expect(result.current.columnFeaturesMap.in_progress[0].id).toBe('feat-running');

      // Normal feature -> backlog
      expect(result.current.columnFeaturesMap.backlog).toHaveLength(1);
      expect(result.current.columnFeaturesMap.backlog[0].id).toBe('feat-normal');

      // Recently completed feature -> nowhere (protected from backlog flash)
      const allColumns = Object.values(result.current.columnFeaturesMap).flat();
      const completedFeature = allColumns.find((f) => f.id === 'feat-completed');
      expect(completedFeature).toBeUndefined();
    });
  });

  describe('debug logging', () => {
    it('should log debug message when recently completed feature is skipped from backlog', () => {
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      const features = [createMockFeature('feat-1', 'backlog')];

      useAppStore.setState({
        recentlyCompletedFeatures: new Set(['feat-1']),
      });

      renderHook(() =>
        useBoardColumnFeatures({
          ...defaultProps,
          features,
          runningAutoTasksAllWorktrees: [],
        })
      );

      expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('feat-1 recently completed'));
    });
  });
});
