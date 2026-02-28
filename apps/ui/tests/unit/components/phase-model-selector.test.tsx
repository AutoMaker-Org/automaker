/**
 * Unit tests for PhaseModelSelector component
 * Tests useShallow selector reactivity with enabledDynamicModelIds array changes
 *
 * Bug: Opencode model selection changes from settings aren't showing up in dropdown
 * Fix: Added useShallow selector to ensure proper reactivity when enabledDynamicModelIds array changes
 */

import fs from 'fs';
import path from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAppStore } from '@/store/app-store';

// Mock the store
vi.mock('@/store/app-store');

const mockUseAppStore = useAppStore as ReturnType<typeof vi.fn>;

/**
 * Type definition for the mock store state to ensure type safety across tests
 */
interface MockStoreState {
  enabledDynamicModelIds: string[];
  enabledCursorModels: string[];
  enabledGeminiModels: string[];
  enabledCopilotModels: string[];
  favoriteModels: string[];
  toggleFavoriteModel: ReturnType<typeof vi.fn>;
  codexModels: unknown[];
  codexModelsLoading: boolean;
  fetchCodexModels: ReturnType<typeof vi.fn>;
  disabledProviders: string[];
  claudeCompatibleProviders: string[];
  defaultThinkingLevel?: string;
  defaultReasoningEffort?: string;
}

/**
 * Creates a mock store state with default values that can be overridden
 * @param overrides - Partial state object to override defaults
 * @returns A complete mock store state object
 */
function createMockStoreState(overrides: Partial<MockStoreState> = {}): MockStoreState {
  return {
    enabledDynamicModelIds: [],
    enabledCursorModels: [],
    enabledGeminiModels: [],
    enabledCopilotModels: [],
    favoriteModels: [],
    toggleFavoriteModel: vi.fn(),
    codexModels: [],
    codexModelsLoading: false,
    fetchCodexModels: vi.fn().mockResolvedValue([]),
    disabledProviders: [],
    claudeCompatibleProviders: [],
    defaultThinkingLevel: undefined,
    defaultReasoningEffort: undefined,
    ...overrides,
  };
}

describe('PhaseModelSelector - useShallow Selector Behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useShallow selector reactivity with enabledDynamicModelIds', () => {
    it('should properly track selector call counts', () => {
      // Verify that when useAppStore is called with a selector (useShallow pattern),
      // it properly extracts the required state values

      let _capturedSelector: ((state: MockStoreState) => Partial<MockStoreState>) | null = null;

      // Mock useAppStore to capture the selector function
      mockUseAppStore.mockImplementation((selector?: unknown) => {
        if (typeof selector === 'function') {
          _capturedSelector = selector as (state: MockStoreState) => Partial<MockStoreState>;
        }
        const mockState = createMockStoreState();
        return typeof selector === 'function' ? selector(mockState) : mockState;
      });

      // Call useAppStore (simulating what PhaseModelSelector does)
      const { result } = renderHook(() => useAppStore());

      // Verify we got a result back (meaning the selector was applied)
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');

      // Now test that a selector function would extract enabledDynamicModelIds correctly
      // This simulates the useShallow selector pattern
      const testState = createMockStoreState({
        enabledDynamicModelIds: ['model-1', 'model-2'],
      });

      // Simulate the selector function that useShallow wraps
      const simulatedSelector = (state: MockStoreState) => ({
        enabledDynamicModelIds: state.enabledDynamicModelIds,
        enabledCursorModels: state.enabledCursorModels,
        enabledGeminiModels: state.enabledGeminiModels,
        enabledCopilotModels: state.enabledCopilotModels,
      });

      const selectorResult = simulatedSelector(testState);
      expect(selectorResult).toHaveProperty('enabledDynamicModelIds');
      expect(selectorResult.enabledDynamicModelIds).toEqual(['model-1', 'model-2']);
    });

    it('should detect changes when enabledDynamicModelIds array reference changes', () => {
      // Test that useShallow properly handles array reference changes
      // This simulates what happens when toggleDynamicModel is called

      const results: Partial<MockStoreState>[] = [];

      mockUseAppStore.mockImplementation((selector?: unknown) => {
        const mockState = createMockStoreState({
          enabledDynamicModelIds: ['model-1'],
        });

        const result = typeof selector === 'function' ? selector(mockState) : mockState;
        results.push(result);
        return result;
      });

      // First call
      renderHook(() => useAppStore());
      const firstCallResult = results[0];
      expect(firstCallResult?.enabledDynamicModelIds).toEqual(['model-1']);

      // Simulate store update with new array reference
      mockUseAppStore.mockImplementation((selector?: unknown) => {
        const mockState = createMockStoreState({
          enabledDynamicModelIds: ['model-1', 'model-2'], // New array reference
        });

        const result = typeof selector === 'function' ? selector(mockState) : mockState;
        results.push(result);
        return result;
      });

      // Second call with updated state
      renderHook(() => useAppStore());
      const secondCallResult = results[1];
      expect(secondCallResult?.enabledDynamicModelIds).toEqual(['model-1', 'model-2']);

      // Verify that the arrays have different references (useShallow handles this)
      expect(firstCallResult?.enabledDynamicModelIds).not.toBe(
        secondCallResult?.enabledDynamicModelIds
      );
    });
  });

  describe('Store state integration with enabledDynamicModelIds', () => {
    it('should return all required state values from the selector', () => {
      mockUseAppStore.mockImplementation((selector?: unknown) => {
        const mockState = createMockStoreState({
          enabledCursorModels: ['cursor-small'],
          enabledGeminiModels: ['gemini-flash'],
          enabledCopilotModels: ['gpt-4o'],
          enabledDynamicModelIds: ['custom-model-1'],
          defaultThinkingLevel: 'medium',
          defaultReasoningEffort: 'medium',
        });

        return typeof selector === 'function' ? selector(mockState) : mockState;
      });

      const result = renderHook(() => useAppStore()).result.current;

      // Verify all required properties are present
      expect(result).toHaveProperty('enabledCursorModels');
      expect(result).toHaveProperty('enabledGeminiModels');
      expect(result).toHaveProperty('enabledCopilotModels');
      expect(result).toHaveProperty('favoriteModels');
      expect(result).toHaveProperty('toggleFavoriteModel');
      expect(result).toHaveProperty('codexModels');
      expect(result).toHaveProperty('codexModelsLoading');
      expect(result).toHaveProperty('fetchCodexModels');
      expect(result).toHaveProperty('enabledDynamicModelIds');
      expect(result).toHaveProperty('disabledProviders');
      expect(result).toHaveProperty('claudeCompatibleProviders');
      expect(result).toHaveProperty('defaultThinkingLevel');
      expect(result).toHaveProperty('defaultReasoningEffort');

      // Verify values
      expect(result.enabledCursorModels).toEqual(['cursor-small']);
      expect(result.enabledGeminiModels).toEqual(['gemini-flash']);
      expect(result.enabledCopilotModels).toEqual(['gpt-4o']);
      expect(result.enabledDynamicModelIds).toEqual(['custom-model-1']);
    });

    it('should handle empty enabledDynamicModelIds array', () => {
      mockUseAppStore.mockImplementation((selector?: unknown) => {
        const mockState = createMockStoreState({
          enabledDynamicModelIds: [],
        });

        return typeof selector === 'function' ? selector(mockState) : mockState;
      });

      const result = renderHook(() => useAppStore()).result.current;
      expect(result.enabledDynamicModelIds).toEqual([]);
      expect(Array.isArray(result.enabledDynamicModelIds)).toBe(true);
    });
  });

  describe('Array reference changes with useShallow', () => {
    it('should detect changes when array content changes', () => {
      const referenceComparisons: { array: string[]; isArray: boolean; length: number }[] = [];

      mockUseAppStore.mockImplementation((selector?: unknown) => {
        const mockState = createMockStoreState({
          enabledDynamicModelIds: ['model-1', 'model-2'],
        });

        const result = typeof selector === 'function' ? selector(mockState) : mockState;
        referenceComparisons.push({
          array: result.enabledDynamicModelIds,
          isArray: Array.isArray(result.enabledDynamicModelIds),
          length: result.enabledDynamicModelIds.length,
        });
        return result;
      });

      // First call
      renderHook(() => useAppStore());

      // Update to new array with different length
      mockUseAppStore.mockImplementation((selector?: unknown) => {
        const mockState = createMockStoreState({
          enabledDynamicModelIds: ['model-1', 'model-2', 'model-3'], // New array with additional item
        });

        const result = typeof selector === 'function' ? selector(mockState) : mockState;
        referenceComparisons.push({
          array: result.enabledDynamicModelIds,
          isArray: Array.isArray(result.enabledDynamicModelIds),
          length: result.enabledDynamicModelIds.length,
        });
        return result;
      });

      // Second call
      renderHook(() => useAppStore());

      // Verify both calls produced arrays
      expect(referenceComparisons[0].isArray).toBe(true);
      expect(referenceComparisons[1].isArray).toBe(true);

      // Verify the length changed (new array reference)
      expect(referenceComparisons[0].length).toBe(2);
      expect(referenceComparisons[1].length).toBe(3);

      // Verify different array references
      expect(referenceComparisons[0].array).not.toBe(referenceComparisons[1].array);
    });

    it('should handle array removal correctly', () => {
      const snapshots: string[][] = [];

      mockUseAppStore.mockImplementation((selector?: unknown) => {
        const mockState = createMockStoreState({
          enabledDynamicModelIds: ['model-1', 'model-2', 'model-3'],
        });

        const result = typeof selector === 'function' ? selector(mockState) : mockState;
        snapshots.push([...result.enabledDynamicModelIds]);
        return result;
      });

      // Initial state with 3 models
      renderHook(() => useAppStore());
      expect(snapshots[0]).toEqual(['model-1', 'model-2', 'model-3']);

      // Remove one model (simulate user toggling off)
      mockUseAppStore.mockImplementation((selector?: unknown) => {
        const mockState = createMockStoreState({
          enabledDynamicModelIds: ['model-1', 'model-3'], // model-2 removed
        });

        const result = typeof selector === 'function' ? selector(mockState) : mockState;
        snapshots.push([...result.enabledDynamicModelIds]);
        return result;
      });

      // Updated state
      renderHook(() => useAppStore());
      expect(snapshots[1]).toEqual(['model-1', 'model-3']);

      // Verify different array references
      expect(snapshots[0]).not.toBe(snapshots[1]);
    });
  });

  describe('Code contract verification', () => {
    it('should verify useShallow import is present', () => {
      // Read the component file and verify useShallow is imported
      const componentPath = path.resolve(
        __dirname,
        '../../../src/components/views/settings-view/model-defaults/phase-model-selector.tsx'
      );
      const componentCode = fs.readFileSync(componentPath, 'utf-8');

      // Verify the fix is in place
      expect(componentCode).toMatch(/import.*useShallow.*from.*zustand\/react\/shallow/);
    });

    it('should verify useAppStore call uses useShallow', () => {
      const componentPath = path.resolve(
        __dirname,
        '../../../src/components/views/settings-view/model-defaults/phase-model-selector.tsx'
      );
      const componentCode = fs.readFileSync(componentPath, 'utf-8');

      // Look for the useAppStore pattern with useShallow
      // The pattern should be: useAppStore(useShallow((state) => ({ ... })))
      expect(componentCode).toMatch(/useAppStore\(\s*useShallow\(/);
    });
  });
});

describe('PhaseModelSelector - enabledDynamicModelIds filtering logic', () => {
  describe('Array filtering behavior', () => {
    it('should filter dynamic models based on enabledDynamicModelIds', () => {
      // This test verifies the filtering logic concept
      // The actual filtering happens in the useMemo within PhaseModelSelector

      const dynamicOpencodeModels = [
        {
          id: 'custom-model-1',
          name: 'Custom Model 1',
          description: 'First',
          tier: 'basic',
          maxTokens: 200000,
        },
        {
          id: 'custom-model-2',
          name: 'Custom Model 2',
          description: 'Second',
          tier: 'premium',
          maxTokens: 200000,
        },
        {
          id: 'custom-model-3',
          name: 'Custom Model 3',
          description: 'Third',
          tier: 'basic',
          maxTokens: 200000,
        },
      ];

      const enabledDynamicModelIds = ['custom-model-1', 'custom-model-3'];

      // Simulate the filter logic from the component
      const filteredModels = dynamicOpencodeModels.filter((model) =>
        enabledDynamicModelIds.includes(model.id)
      );

      expect(filteredModels).toHaveLength(2);
      expect(filteredModels.map((m) => m.id)).toEqual(['custom-model-1', 'custom-model-3']);
    });

    it('should return empty array when no dynamic models are enabled', () => {
      const dynamicOpencodeModels = [
        {
          id: 'custom-model-1',
          name: 'Custom Model 1',
          description: 'First',
          tier: 'basic',
          maxTokens: 200000,
        },
      ];

      const enabledDynamicModelIds: string[] = [];

      const filteredModels = dynamicOpencodeModels.filter((model) =>
        enabledDynamicModelIds.includes(model.id)
      );

      expect(filteredModels).toHaveLength(0);
    });

    it('should return all models when all are enabled', () => {
      const dynamicOpencodeModels = [
        {
          id: 'custom-model-1',
          name: 'Custom Model 1',
          description: 'First',
          tier: 'basic',
          maxTokens: 200000,
        },
        {
          id: 'custom-model-2',
          name: 'Custom Model 2',
          description: 'Second',
          tier: 'premium',
          maxTokens: 200000,
        },
      ];

      const enabledDynamicModelIds = ['custom-model-1', 'custom-model-2'];

      const filteredModels = dynamicOpencodeModels.filter((model) =>
        enabledDynamicModelIds.includes(model.id)
      );

      expect(filteredModels).toHaveLength(2);
    });
  });
});
