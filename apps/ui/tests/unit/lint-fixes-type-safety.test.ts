/**
 * Tests verifying type safety improvements from lint fixes.
 * These test that the `any` → proper type conversions in test utilities
 * and mock patterns continue to work correctly.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Feature } from '@automaker/types';

describe('Lint fix type safety - Feature casting patterns', () => {
  // The lint fix changed `} as any` to `} as unknown as Feature` in test files.
  // This verifies the cast pattern works correctly with partial data.

  it('should allow partial Feature objects via unknown cast', () => {
    const feature = {
      id: 'test-1',
      status: 'backlog',
      error: undefined,
    } as unknown as Feature;

    expect(feature.id).toBe('test-1');
    expect(feature.status).toBe('backlog');
    expect(feature.error).toBeUndefined();
  });

  it('should allow merge_conflict status via unknown cast', () => {
    const feature = {
      id: 'test-2',
      status: 'merge_conflict',
      error: 'Merge conflict detected',
    } as unknown as Feature;

    expect(feature.status).toBe('merge_conflict');
    expect(feature.error).toBe('Merge conflict detected');
  });

  it('should allow features with all required fields', () => {
    const feature = {
      id: 'test-3',
      title: 'Test Feature',
      category: 'test',
      description: 'A test feature',
      status: 'in_progress',
    } as unknown as Feature;

    expect(feature.title).toBe('Test Feature');
    expect(feature.description).toBe('A test feature');
  });
});

describe('Lint fix type safety - Mock function patterns', () => {
  // The lint fix changed `(selector?: any)` to `(selector?: unknown)` and
  // `(selector: (state: any) => any)` to `(selector: (state: Record<string, unknown>) => unknown)`

  it('should work with unknown selector type for store mocks', () => {
    const mockStore = vi.fn().mockImplementation((selector?: unknown) => {
      if (typeof selector === 'function') {
        const state = { claudeCompatibleProviders: [] };
        return (selector as (s: Record<string, unknown>) => unknown)(state);
      }
      return undefined;
    });

    const result = mockStore((state: Record<string, unknown>) => state.claudeCompatibleProviders);
    expect(result).toEqual([]);
  });

  it('should work with typed selector for store mocks', () => {
    const state = {
      claudeCompatibleProviders: [{ id: 'test-provider', name: 'Test', models: [] }],
    };

    const mockStore = vi
      .fn()
      .mockImplementation((selector: (state: Record<string, unknown>) => unknown) =>
        selector(state)
      );

    const providers = mockStore((s: Record<string, unknown>) => s.claudeCompatibleProviders);
    expect(providers).toHaveLength(1);
  });

  it('should work with ReturnType<typeof vi.fn> for matchMedia mock', () => {
    // Pattern used in agent-output-modal-responsive.test.tsx
    const mockMatchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('min-width: 640px'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    (window.matchMedia as ReturnType<typeof vi.fn>) = mockMatchMedia;

    const result = window.matchMedia('(min-width: 640px)');
    expect(result.matches).toBe(true);

    const smallResult = window.matchMedia('(max-width: 320px)');
    expect(smallResult.matches).toBe(false);
  });
});

describe('Lint fix type safety - globalThis vs global patterns', () => {
  // The lint fix changed `global.ResizeObserver` to `globalThis.ResizeObserver`

  it('should support ResizeObserver mock via globalThis', () => {
    // Must use `function` keyword (not arrow) for vi.fn mock that's used with `new`
    const mockObserver = vi.fn().mockImplementation(function () {
      return {
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      };
    });

    globalThis.ResizeObserver = mockObserver as unknown as typeof ResizeObserver;

    const observer = new ResizeObserver(() => {});
    expect(observer.observe).toBeDefined();
    expect(observer.disconnect).toBeDefined();
  });

  it('should support IntersectionObserver mock via globalThis', () => {
    const mockObserver = vi.fn().mockImplementation(function () {
      return {
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      };
    });

    globalThis.IntersectionObserver = mockObserver as unknown as typeof IntersectionObserver;

    const observer = new IntersectionObserver(() => {});
    expect(observer.observe).toBeDefined();
    expect(observer.disconnect).toBeDefined();
  });
});
