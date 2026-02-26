/**
 * Unit tests for useGuidedPrompts hook
 * Tests memoization of prompts and categories arrays to ensure
 * they maintain referential stability when underlying data hasn't changed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock the queries module
vi.mock('@/hooks/queries', () => ({
  useIdeationPrompts: vi.fn(),
}));

// Must import after mock setup
import { useGuidedPrompts } from '../../../src/hooks/use-guided-prompts';
import { useIdeationPrompts } from '@/hooks/queries';

const mockUseIdeationPrompts = vi.mocked(useIdeationPrompts);

describe('useGuidedPrompts', () => {
  const mockPrompts = [
    { id: 'p1', category: 'feature' as const, title: 'Prompt 1', prompt: 'Do thing 1' },
    { id: 'p2', category: 'bugfix' as const, title: 'Prompt 2', prompt: 'Do thing 2' },
  ];

  const mockCategories = [
    { id: 'feature' as const, label: 'Feature', description: 'Feature prompts' },
    { id: 'bugfix' as const, label: 'Bug Fix', description: 'Bug fix prompts' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty arrays when data is undefined', () => {
    mockUseIdeationPrompts.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    } as ReturnType<typeof useIdeationPrompts>);

    const { result } = renderHook(() => useGuidedPrompts());

    expect(result.current.prompts).toEqual([]);
    expect(result.current.categories).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('should return prompts and categories when data is available', () => {
    mockUseIdeationPrompts.mockReturnValue({
      data: { prompts: mockPrompts, categories: mockCategories },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as ReturnType<typeof useIdeationPrompts>);

    const { result } = renderHook(() => useGuidedPrompts());

    expect(result.current.prompts).toEqual(mockPrompts);
    expect(result.current.categories).toEqual(mockCategories);
    expect(result.current.isLoading).toBe(false);
  });

  it('should memoize prompts array reference when data has not changed', () => {
    const stableData = { prompts: mockPrompts, categories: mockCategories };

    mockUseIdeationPrompts.mockReturnValue({
      data: stableData,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as ReturnType<typeof useIdeationPrompts>);

    const { result, rerender } = renderHook(() => useGuidedPrompts());

    const firstPrompts = result.current.prompts;
    const firstCategories = result.current.categories;

    // Re-render with same data
    rerender();

    // References should be stable (same object, not a new empty array on each render)
    expect(result.current.prompts).toBe(firstPrompts);
    expect(result.current.categories).toBe(firstCategories);
  });

  it('should update prompts reference when data.prompts changes', () => {
    const refetchFn = vi.fn();
    mockUseIdeationPrompts.mockReturnValue({
      data: { prompts: mockPrompts, categories: mockCategories },
      isLoading: false,
      error: null,
      refetch: refetchFn,
    } as ReturnType<typeof useIdeationPrompts>);

    const { result, rerender } = renderHook(() => useGuidedPrompts());

    const firstPrompts = result.current.prompts;

    // Update with new prompts array
    const newPrompts = [
      ...mockPrompts,
      { id: 'p3', category: 'feature' as const, title: 'Prompt 3', prompt: 'Do thing 3' },
    ];
    mockUseIdeationPrompts.mockReturnValue({
      data: { prompts: newPrompts, categories: mockCategories },
      isLoading: false,
      error: null,
      refetch: refetchFn,
    } as ReturnType<typeof useIdeationPrompts>);

    rerender();

    // Reference should be different since data.prompts changed
    expect(result.current.prompts).not.toBe(firstPrompts);
    expect(result.current.prompts).toEqual(newPrompts);
  });

  it('should filter prompts by category', () => {
    mockUseIdeationPrompts.mockReturnValue({
      data: { prompts: mockPrompts, categories: mockCategories },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as ReturnType<typeof useIdeationPrompts>);

    const { result } = renderHook(() => useGuidedPrompts());

    const featurePrompts = result.current.getPromptsByCategory('feature' as const);
    expect(featurePrompts).toHaveLength(1);
    expect(featurePrompts[0].id).toBe('p1');
  });

  it('should find prompt by id', () => {
    mockUseIdeationPrompts.mockReturnValue({
      data: { prompts: mockPrompts, categories: mockCategories },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as ReturnType<typeof useIdeationPrompts>);

    const { result } = renderHook(() => useGuidedPrompts());

    expect(result.current.getPromptById('p2')?.title).toBe('Prompt 2');
    expect(result.current.getPromptById('nonexistent')).toBeUndefined();
  });

  it('should find category by id', () => {
    mockUseIdeationPrompts.mockReturnValue({
      data: { prompts: mockPrompts, categories: mockCategories },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as ReturnType<typeof useIdeationPrompts>);

    const { result } = renderHook(() => useGuidedPrompts());

    expect(result.current.getCategoryById('feature' as const)?.label).toBe('Feature');
    expect(result.current.getCategoryById('nonexistent' as never)).toBeUndefined();
  });

  it('should convert error to string', () => {
    mockUseIdeationPrompts.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Test error'),
      refetch: vi.fn(),
    } as ReturnType<typeof useIdeationPrompts>);

    const { result } = renderHook(() => useGuidedPrompts());

    expect(result.current.error).toBe('Test error');
  });

  it('should return null error when no error', () => {
    mockUseIdeationPrompts.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as ReturnType<typeof useIdeationPrompts>);

    const { result } = renderHook(() => useGuidedPrompts());

    expect(result.current.error).toBeNull();
  });

  it('should memoize empty arrays when data is undefined across renders', () => {
    mockUseIdeationPrompts.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    } as ReturnType<typeof useIdeationPrompts>);

    const { result, rerender } = renderHook(() => useGuidedPrompts());

    const firstPrompts = result.current.prompts;
    const firstCategories = result.current.categories;

    rerender();

    // Empty arrays should be referentially stable too (via useMemo)
    expect(result.current.prompts).toBe(firstPrompts);
    expect(result.current.categories).toBe(firstCategories);
  });
});
