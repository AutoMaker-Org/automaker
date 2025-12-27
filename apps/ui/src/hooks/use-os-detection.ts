import { useMemo } from 'react';

export type OperatingSystem = 'mac' | 'windows' | 'linux' | 'unknown';

export interface OSDetectionResult {
  readonly os: OperatingSystem;
  readonly isMac: boolean;
  readonly isWindows: boolean;
  readonly isLinux: boolean;
}

function detectOS(): OperatingSystem {
  // Check Electron's process.platform first (most reliable in Electron apps)
  if (typeof process !== 'undefined' && process.platform) {
    if (process.platform === 'darwin') return 'mac';
    if (process.platform === 'win32') return 'windows';
    if (process.platform === 'linux') return 'linux';
  }

  if (typeof navigator === 'undefined') {
    return 'unknown';
  }

  // Fallback: use modern userAgentData API with fallback to navigator.platform
  const nav = navigator as Navigator & { userAgentData?: { platform: string } };
  const platform = (nav.userAgentData?.platform ?? navigator.platform ?? '').toLowerCase();

  if (platform.includes('mac')) return 'mac';
  if (platform.includes('win')) return 'windows';
  if (platform.includes('linux') || platform.includes('x11')) return 'linux';
  return 'unknown';
}

/**
 * Hook to detect the user's operating system.
 * Returns OS information and convenience boolean flags.
 */
export function useOSDetection(): OSDetectionResult {
  return useMemo(() => {
    const os = detectOS();
    return {
      os,
      isMac: os === 'mac',
      isWindows: os === 'windows',
      isLinux: os === 'linux',
    };
  }, []);
}
