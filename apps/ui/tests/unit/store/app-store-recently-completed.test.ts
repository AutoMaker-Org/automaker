/**
 * Unit tests for recentlyCompletedFeatures store functionality
 * These tests verify the race condition protection for completed features
 * appearing in backlog during cache refresh windows.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from '@testing-library/react';
import { useAppStore } from '../../../src/store/app-store';

describe('recentlyCompletedFeatures store', () => {
  beforeEach(() => {
    // Reset the store to a clean state before each test
    useAppStore.setState({
      recentlyCompletedFeatures: new Set<string>(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have an empty Set for recentlyCompletedFeatures', () => {
      const state = useAppStore.getState();
      expect(state.recentlyCompletedFeatures).toBeInstanceOf(Set);
      expect(state.recentlyCompletedFeatures.size).toBe(0);
    });
  });

  describe('addRecentlyCompletedFeature', () => {
    it('should add a feature ID to the recentlyCompletedFeatures set', () => {
      const { addRecentlyCompletedFeature } = useAppStore.getState();

      act(() => {
        addRecentlyCompletedFeature('feature-123');
      });

      const state = useAppStore.getState();
      expect(state.recentlyCompletedFeatures.has('feature-123')).toBe(true);
    });

    it('should add multiple feature IDs to the set', () => {
      const { addRecentlyCompletedFeature } = useAppStore.getState();

      act(() => {
        addRecentlyCompletedFeature('feature-1');
        addRecentlyCompletedFeature('feature-2');
        addRecentlyCompletedFeature('feature-3');
      });

      const state = useAppStore.getState();
      expect(state.recentlyCompletedFeatures.size).toBe(3);
      expect(state.recentlyCompletedFeatures.has('feature-1')).toBe(true);
      expect(state.recentlyCompletedFeatures.has('feature-2')).toBe(true);
      expect(state.recentlyCompletedFeatures.has('feature-3')).toBe(true);
    });

    it('should not duplicate feature IDs when adding the same ID twice', () => {
      const { addRecentlyCompletedFeature } = useAppStore.getState();

      act(() => {
        addRecentlyCompletedFeature('feature-123');
        addRecentlyCompletedFeature('feature-123');
      });

      const state = useAppStore.getState();
      expect(state.recentlyCompletedFeatures.size).toBe(1);
      expect(state.recentlyCompletedFeatures.has('feature-123')).toBe(true);
    });

    it('should create a new Set instance on each addition (immutability)', () => {
      const { addRecentlyCompletedFeature } = useAppStore.getState();
      const originalSet = useAppStore.getState().recentlyCompletedFeatures;

      act(() => {
        addRecentlyCompletedFeature('feature-123');
      });

      const newSet = useAppStore.getState().recentlyCompletedFeatures;
      // The Set should be a new instance (immutability for React re-renders)
      expect(newSet).not.toBe(originalSet);
    });
  });

  describe('clearRecentlyCompletedFeatures', () => {
    it('should clear all feature IDs from the set', () => {
      const { addRecentlyCompletedFeature, clearRecentlyCompletedFeatures } =
        useAppStore.getState();

      // Add some features first
      act(() => {
        addRecentlyCompletedFeature('feature-1');
        addRecentlyCompletedFeature('feature-2');
      });

      expect(useAppStore.getState().recentlyCompletedFeatures.size).toBe(2);

      // Clear the set
      act(() => {
        clearRecentlyCompletedFeatures();
      });

      const state = useAppStore.getState();
      expect(state.recentlyCompletedFeatures.size).toBe(0);
    });

    it('should work when called on an already empty set', () => {
      const { clearRecentlyCompletedFeatures } = useAppStore.getState();

      // Should not throw when called on empty set
      expect(() => {
        act(() => {
          clearRecentlyCompletedFeatures();
        });
      }).not.toThrow();

      expect(useAppStore.getState().recentlyCompletedFeatures.size).toBe(0);
    });
  });

  describe('race condition scenario simulation', () => {
    it('should track recently completed features until cache refresh clears them', () => {
      const { addRecentlyCompletedFeature, clearRecentlyCompletedFeatures } =
        useAppStore.getState();

      // Simulate feature completing
      act(() => {
        addRecentlyCompletedFeature('feature-completed');
      });

      // Feature should be tracked
      expect(useAppStore.getState().recentlyCompletedFeatures.has('feature-completed')).toBe(true);

      // Simulate cache refresh completing with updated status
      act(() => {
        clearRecentlyCompletedFeatures();
      });

      // Feature should no longer be tracked
      expect(useAppStore.getState().recentlyCompletedFeatures.has('feature-completed')).toBe(false);
    });

    it('should handle multiple features completing simultaneously', () => {
      const { addRecentlyCompletedFeature, clearRecentlyCompletedFeatures } =
        useAppStore.getState();

      // Simulate multiple features completing (e.g., batch completion)
      act(() => {
        addRecentlyCompletedFeature('feature-1');
        addRecentlyCompletedFeature('feature-2');
        addRecentlyCompletedFeature('feature-3');
      });

      expect(useAppStore.getState().recentlyCompletedFeatures.size).toBe(3);

      // All should be protected from backlog during race condition window
      expect(useAppStore.getState().recentlyCompletedFeatures.has('feature-1')).toBe(true);
      expect(useAppStore.getState().recentlyCompletedFeatures.has('feature-2')).toBe(true);
      expect(useAppStore.getState().recentlyCompletedFeatures.has('feature-3')).toBe(true);

      // After cache refresh, all are cleared
      act(() => {
        clearRecentlyCompletedFeatures();
      });

      expect(useAppStore.getState().recentlyCompletedFeatures.size).toBe(0);
    });
  });
});
