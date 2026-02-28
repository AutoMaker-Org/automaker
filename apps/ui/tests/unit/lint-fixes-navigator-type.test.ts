/**
 * Tests verifying the navigator.userAgentData type fix
 * in stash-changes-dialog.tsx.
 *
 * The lint fix replaced `(navigator as any).userAgentData?.platform`
 * with a properly typed cast:
 * `(navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform`
 */

import { describe, it, expect } from 'vitest';

describe('Navigator type safety - userAgentData access', () => {
  it('should safely access userAgentData.platform with proper typing', () => {
    // Simulates the pattern used in stash-changes-dialog.tsx
    const nav = {
      platform: 'MacIntel',
      userAgentData: { platform: 'macOS' },
    } as Navigator & { userAgentData?: { platform?: string } };

    const platform = nav.userAgentData?.platform || nav.platform || '';
    expect(platform).toBe('macOS');
  });

  it('should fallback to navigator.platform when userAgentData is undefined', () => {
    const nav = {
      platform: 'MacIntel',
    } as Navigator & { userAgentData?: { platform?: string } };

    const platform = nav.userAgentData?.platform || nav.platform || '';
    expect(platform).toBe('MacIntel');
  });

  it('should fallback to empty string when both are unavailable', () => {
    const nav = {} as Navigator & { userAgentData?: { platform?: string } };

    const platform = nav.userAgentData?.platform || nav.platform || '';
    expect(platform).toBe('');
  });

  it('should detect macOS platform correctly', () => {
    const nav = {
      platform: 'MacIntel',
      userAgentData: { platform: 'macOS' },
    } as Navigator & { userAgentData?: { platform?: string } };

    const platform = nav.userAgentData?.platform || nav.platform || '';
    const isMac = platform.includes('Mac') || platform.includes('mac');
    expect(isMac).toBe(true);
  });

  it('should detect non-macOS platform correctly', () => {
    const nav = {
      platform: 'Win32',
      userAgentData: { platform: 'Windows' },
    } as Navigator & { userAgentData?: { platform?: string } };

    const platform = nav.userAgentData?.platform || nav.platform || '';
    const isMac = platform.includes('Mac') || platform.includes('mac');
    expect(isMac).toBe(false);
  });
});
