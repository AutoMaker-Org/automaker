/**
 * Browser-compatible version of path helpers
 * This file provides the same API but works in the browser environment
 */

export interface PlatformInfo {
  isMac: boolean;
  isWindows: boolean;
  isLinux: boolean;
  isWSL: boolean;
  platform: string;
}

/**
 * Detect the platform from the browser's user agent
 */
export function detectPlatform(): PlatformInfo {
  const userAgent = navigator.userAgent.toLowerCase();
  const platform = navigator.platform.toLowerCase();
  
  const isMac = platform.includes('mac') || userAgent.includes('mac');
  const isWindows = platform.includes('win') || userAgent.includes('windows');
  const isLinux = platform.includes('linux') || userAgent.includes('linux');
  
  // WSL detection is more complex in browser, check for specific markers
  const isWSL = isWindows && userAgent.includes('linux');
  
  return {
    isMac,
    isWindows,
    isLinux,
    isWSL,
    platform: platform
  };
}

/**
 * Normalize path separators based on detected platform
 */
export function normalizePath(filePath: string): string {
  if (!filePath) return filePath;
  
  const { isWindows } = detectPlatform();
  
  if (isWindows) {
    return filePath.replace(/\//g, '\\');
  } else {
    return filePath.replace(/\\/g, '/');
  }
}

/**
 * Convert a WSL path to Windows path (browser version)
 */
export function toWindowsPath(wslPath: string): string {
  if (!wslPath) return wslPath;
  
  const mountMatch = wslPath.match(/^\/mnt\/([a-z])\/(.*)/i);
  if (mountMatch) {
    const [, driveLetter, restPath] = mountMatch;
    return `${driveLetter.toUpperCase()}:\\${restPath.replace(/\//g, '\\')}`;
  }
  
  return wslPath;
}

/**
 * Convert a Windows path to WSL path (browser version)
 */
export function toWSLPath(windowsPath: string): string {
  if (!windowsPath) return windowsPath;
  
  const driveMatch = windowsPath.match(/^([a-zA-Z]):\\/);
  if (driveMatch) {
    const [, driveLetter] = driveMatch;
    const restPath = windowsPath.slice(3).replace(/\\/g, '/');
    return `/mnt/${driveLetter.toLowerCase()}/${restPath}`;
  }
  
  return windowsPath;
}

/**
 * Get the default project root directory based on platform detection
 */
export function getDefaultProjectRoot(): string {
  const { isMac, isWindows, isLinux, isWSL } = detectPlatform();
  
  // We can't access the actual home directory in browser,
  // so we return platform-appropriate patterns
  if (isMac) {
    return '~/Documents/Automaker/projects';
  } else if (isWindows) {
    return '%USERPROFILE%\\Documents\\Automaker\\projects';
  } else if (isLinux || isWSL) {
    return '~/automaker/projects';
  }
  
  return '~/Automaker/projects';
}

/**
 * Browser-compatible path joining
 */
function join(...segments: string[]): string {
  const { isWindows } = detectPlatform();
  const separator = isWindows ? '\\' : '/';
  
  return segments
    .filter(Boolean)
    .join(separator)
    .replace(/[\\\/]+/g, separator);
}

/**
 * Check if a path is absolute
 */
function isAbsolute(filePath: string): boolean {
  if (!filePath) return false;
  
  // Windows absolute paths
  if (/^[a-zA-Z]:[\\/]/.test(filePath)) return true;
  
  // Unix absolute paths
  if (filePath.startsWith('/')) return true;
  
  // UNC paths
  if (filePath.startsWith('\\\\')) return true;
  
  return false;
}

/**
 * Ensure a path is absolute
 */
export function ensureAbsolutePath(filePath: string, basePath?: string): string {
  if (isAbsolute(filePath)) {
    return normalizePath(filePath);
  }
  
  const base = basePath || getDefaultProjectRoot();
  return normalizePath(join(base, filePath));
}

/**
 * Check if a path needs WSL conversion
 */
export function needsWSLConversion(filePath: string): boolean {
  const { isWSL } = detectPlatform();
  if (!isWSL) return false;
  
  return /^[a-zA-Z]:\\/.test(filePath);
}

/**
 * Smart path conversion for the platform
 */
export function convertPathForPlatform(filePath: string, forceConversion = false): string {
  const { isWSL } = detectPlatform();
  
  if (!isWSL || !forceConversion) {
    return normalizePath(filePath);
  }
  
  if (needsWSLConversion(filePath)) {
    return toWSLPath(filePath);
  }
  
  return normalizePath(filePath);
}

/**
 * Get platform-specific temp directory pattern
 */
export function getTempDirectory(): string {
  const { isWindows } = detectPlatform();
  
  if (isWindows) {
    return '%TEMP%';
  }
  
  return '/tmp';
}

/**
 * Get platform-specific app data directory pattern
 */
export function getAppDataDirectory(appName: string = 'Automaker'): string {
  const { isMac, isWindows, isLinux, isWSL } = detectPlatform();
  
  if (isMac) {
    return `~/Library/Application Support/${appName}`;
  } else if (isWindows) {
    return `%APPDATA%\\${appName}`;
  } else if (isLinux || isWSL) {
    return `~/.config/${appName.toLowerCase()}`;
  }
  
  return `~/.${appName.toLowerCase()}`;
}

/**
 * Simple path safety validation
 */
export function isPathSafe(filePath: string, basePath: string): boolean {
  // Check for directory traversal patterns
  if (filePath.includes('..')) {
    return false;
  }
  
  // Ensure the path would be within the base
  const normalizedPath = normalizePath(filePath);
  const normalizedBase = normalizePath(basePath);
  
  return normalizedPath.startsWith(normalizedBase);
}