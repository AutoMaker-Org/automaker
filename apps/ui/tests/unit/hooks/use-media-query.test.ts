/**
 * Unit tests for useMediaQuery, useIsMobile, useIsTablet, and useIsCompact hooks
 * These tests verify the responsive detection behavior for terminal shortcuts bar
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useMediaQuery,
  useIsMobile,
  useIsTablet,
  useIsCompact,
} from '../../../src/hooks/use-media-query.ts';

/**
 * Creates a mock matchMedia implementation for testing
 * @param matchingQuery - The query that should match. If null, no queries match.
 */
function createMatchMediaMock(matchingQuery: string | null = null) {
  return vi.fn().mockImplementation((query: string) => ({
    matches: matchingQuery !== null && query === matchingQuery,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

/**
 * Creates a mock matchMedia that tracks event listeners for testing cleanup
 */
function createTrackingMatchMediaMock() {
  const listeners: Array<(e: MediaQueryListEvent) => void> = [];
  return {
    matchMedia: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((_event: string, listener: (e: MediaQueryListEvent) => void) => {
        listeners.push(listener);
      }),
      removeEventListener: vi.fn((_event: string, listener: (e: MediaQueryListEvent) => void) => {
        const index = listeners.indexOf(listener);
        if (index > -1) listeners.splice(index, 1);
      }),
      dispatchEvent: vi.fn(),
    })),
    listeners,
  };
}

/**
 * Creates a mock matchMedia that matches multiple queries (for testing viewport combinations)
 * @param queries - Array of queries that should match
 */
function createMultiQueryMatchMediaMock(queries: string[] = []) {
  return vi.fn().mockImplementation((query: string) => ({
    matches: queries.includes(query),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe('useMediaQuery', () => {
  let mockData: ReturnType<typeof createTrackingMatchMediaMock>;

  beforeEach(() => {
    mockData = createTrackingMatchMediaMock();
    window.matchMedia = mockData.matchMedia;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return false by default', () => {
    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));
    expect(result.current).toBe(false);
  });

  it('should return true when media query matches', () => {
    window.matchMedia = createMatchMediaMock('(max-width: 768px)');

    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));
    expect(result.current).toBe(true);
  });

  it('should update when media query changes', () => {
    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));

    // Initial state is false
    expect(result.current).toBe(false);

    // Simulate a media query change event
    act(() => {
      const listener = mockData.listeners[0];
      if (listener) {
        listener({ matches: true, media: '(max-width: 768px)' } as MediaQueryListEvent);
      }
    });

    expect(result.current).toBe(true);
  });

  it('should cleanup event listener on unmount', () => {
    const { unmount } = renderHook(() => useMediaQuery('(max-width: 768px)'));

    expect(mockData.listeners.length).toBe(1);

    unmount();

    expect(mockData.listeners.length).toBe(0);
  });
});

describe('useIsMobile', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return true when viewport is <= 768px', () => {
    window.matchMedia = createMatchMediaMock('(max-width: 768px)');

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('should return false when viewport is > 768px', () => {
    window.matchMedia = createMatchMediaMock(null);

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });
});

describe('useIsTablet', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return true when viewport is <= 1024px (tablet or smaller)', () => {
    window.matchMedia = createMatchMediaMock('(max-width: 1024px)');

    const { result } = renderHook(() => useIsTablet());
    expect(result.current).toBe(true);
  });

  it('should return false when viewport is > 1024px (desktop)', () => {
    window.matchMedia = createMatchMediaMock(null);

    const { result } = renderHook(() => useIsTablet());
    expect(result.current).toBe(false);
  });
});

describe('useIsCompact', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return true when viewport is <= 1240px', () => {
    window.matchMedia = createMatchMediaMock('(max-width: 1240px)');

    const { result } = renderHook(() => useIsCompact());
    expect(result.current).toBe(true);
  });

  it('should return false when viewport is > 1240px', () => {
    window.matchMedia = createMatchMediaMock(null);

    const { result } = renderHook(() => useIsCompact());
    expect(result.current).toBe(false);
  });
});

describe('Responsive Viewport Combinations', () => {
  // Test the logic that TerminalPanel uses: showShortcutsBar = isMobile || isTablet

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should show shortcuts bar on mobile viewport (< 768px)', () => {
    // Mobile: matches both mobile and tablet queries (since 768px < 1024px)
    window.matchMedia = createMultiQueryMatchMediaMock([
      '(max-width: 768px)',
      '(max-width: 1024px)',
    ]);

    const { result: mobileResult } = renderHook(() => useIsMobile());
    const { result: tabletResult } = renderHook(() => useIsTablet());

    // Mobile is always tablet (since 768px < 1024px)
    expect(mobileResult.current).toBe(true);
    expect(tabletResult.current).toBe(true);

    // showShortcutsBar = isMobile || isTablet = true
    expect(mobileResult.current || tabletResult.current).toBe(true);
  });

  it('should show shortcuts bar on tablet viewport (768px - 1024px)', () => {
    // Tablet: matches tablet query but not mobile (viewport > 768px but <= 1024px)
    window.matchMedia = createMultiQueryMatchMediaMock(['(max-width: 1024px)']);

    const { result: mobileResult } = renderHook(() => useIsMobile());
    const { result: tabletResult } = renderHook(() => useIsTablet());

    // Tablet is not mobile (viewport > 768px but <= 1024px)
    expect(mobileResult.current).toBe(false);
    expect(tabletResult.current).toBe(true);

    // showShortcutsBar = isMobile || isTablet = true
    expect(mobileResult.current || tabletResult.current).toBe(true);
  });

  it('should hide shortcuts bar on desktop viewport (> 1024px)', () => {
    // Desktop: matches neither mobile nor tablet
    window.matchMedia = createMultiQueryMatchMediaMock([]);

    const { result: mobileResult } = renderHook(() => useIsMobile());
    const { result: tabletResult } = renderHook(() => useIsTablet());

    // Desktop is neither mobile nor tablet
    expect(mobileResult.current).toBe(false);
    expect(tabletResult.current).toBe(false);

    // showShortcutsBar = isMobile || isTablet = false
    expect(mobileResult.current || tabletResult.current).toBe(false);
  });
});
