import * as path from 'path';
import { platform, homedir } from 'os';

export interface PlatformInfo {
  isMac: boolean;
  isWindows: boolean;
  isLinux: boolean;
  isWSL: boolean;
  platform: NodeJS.Platform;
}

/**
 * Detect the current platform and WSL status
 */
export function detectPlatform(): PlatformInfo {
  const plat = platform();
  const isWindows = plat === 'win32';
  const isMac = plat === 'darwin';
  const isLinux = plat === 'linux';
  
  // Detect WSL by checking for WSL-specific environment variables or files
  const isWSL = isLinux && (
    !!process.env.WSL_DISTRO_NAME ||
    !!process.env.WSL_INTEROP ||
    // Check for WSL-specific file
    require('fs').existsSync('/proc/version') &&
    require('fs').readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft')
  );

  return {
    isMac,
    isWindows,
    isLinux,
    isWSL,
    platform: plat
  };
}

/**
 * Normalize path separators for the current platform
 */
export function normalizePath(filePath: string): string {
  if (!filePath) return filePath;
  
  const { isWindows } = detectPlatform();
  
  if (isWindows) {
    // Convert forward slashes to backslashes on Windows
    return filePath.replace(/\//g, '\\');
  } else {
    // Convert backslashes to forward slashes on Unix-like systems
    return filePath.replace(/\\/g, '/');
  }
}

/**
 * Convert a WSL path to Windows path (e.g., /mnt/c/Users -> C:\Users)
 * Only use when explicitly needed for interop
 */
export function toWindowsPath(wslPath: string): string {
  if (!wslPath) return wslPath;
  
  // Check if it's a WSL mount path
  const mountMatch = wslPath.match(/^\/mnt\/([a-z])\/(.*)/i);
  if (mountMatch) {
    const [, driveLetter, restPath] = mountMatch;
    return `${driveLetter.toUpperCase()}:\\${restPath.replace(/\//g, '\\')}`;
  }
  
  // If not a mount path, try using wslpath if available
  try {
    const { execSync } = require('child_process');
    return execSync(`wslpath -w "${wslPath}"`, { encoding: 'utf8' }).trim();
  } catch {
    // Fallback: return as-is
    return wslPath;
  }
}

/**
 * Convert a Windows path to WSL path (e.g., C:\Users -> /mnt/c/Users)
 * Only use when explicitly needed for interop
 */
export function toWSLPath(windowsPath: string): string {
  if (!windowsPath) return windowsPath;
  
  // Check if it's a Windows drive path
  const driveMatch = windowsPath.match(/^([a-zA-Z]):\\/);
  if (driveMatch) {
    const [, driveLetter] = driveMatch;
    const restPath = windowsPath.slice(3).replace(/\\/g, '/');
    return `/mnt/${driveLetter.toLowerCase()}/${restPath}`;
  }
  
  // If not a drive path, try using wslpath if available
  try {
    const { execSync } = require('child_process');
    return execSync(`wslpath -u "${windowsPath}"`, { encoding: 'utf8' }).trim();
  } catch {
    // Fallback: return as-is
    return windowsPath;
  }
}

/**
 * Get the default project root directory for the current platform
 */
export function getDefaultProjectRoot(): string {
  const { isMac, isWindows, isLinux, isWSL } = detectPlatform();
  const home = homedir();
  
  if (isMac) {
    // macOS: ~/Documents/Automaker/projects
    return path.join(home, 'Documents', 'Automaker', 'projects');
  } else if (isWindows) {
    // Windows: %USERPROFILE%\Documents\Automaker\projects
    return path.join(home, 'Documents', 'Automaker', 'projects');
  } else if (isLinux || isWSL) {
    // Linux/WSL: ~/automaker/projects
    return path.join(home, 'automaker', 'projects');
  }
  
  // Fallback
  return path.join(home, 'Automaker', 'projects');
}

/**
 * Ensure a path is absolute, using the default project root if needed
 */
export function ensureAbsolutePath(filePath: string, basePath?: string): string {
  if (path.isAbsolute(filePath)) {
    return normalizePath(filePath);
  }
  
  const base = basePath || getDefaultProjectRoot();
  return normalizePath(path.join(base, filePath));
}

/**
 * Check if a path needs WSL conversion based on the context
 */
export function needsWSLConversion(filePath: string): boolean {
  const { isWSL } = detectPlatform();
  if (!isWSL) return false;
  
  // Check if it's a Windows-style path in WSL environment
  return /^[a-zA-Z]:\\/.test(filePath);
}

/**
 * Smart path conversion that handles WSL scenarios automatically
 */
export function convertPathForPlatform(filePath: string, forceConversion = false): string {
  const { isWSL } = detectPlatform();
  
  if (!isWSL || !forceConversion) {
    return normalizePath(filePath);
  }
  
  // In WSL, convert Windows paths to WSL paths
  if (needsWSLConversion(filePath)) {
    return toWSLPath(filePath);
  }
  
  return normalizePath(filePath);
}

/**
 * Get platform-specific temp directory
 */
export function getTempDirectory(): string {
  const { isWindows } = detectPlatform();
  
  if (isWindows) {
    return process.env.TEMP || process.env.TMP || path.join(homedir(), 'AppData', 'Local', 'Temp');
  }
  
  return process.env.TMPDIR || '/tmp';
}

/**
 * Get platform-specific app data directory
 */
export function getAppDataDirectory(appName: string = 'Automaker'): string {
  const { isMac, isWindows, isLinux, isWSL } = detectPlatform();
  const home = homedir();
  
  if (isMac) {
    return path.join(home, 'Library', 'Application Support', appName);
  } else if (isWindows) {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), appName);
  } else if (isLinux || isWSL) {
    return path.join(home, '.config', appName.toLowerCase());
  }
  
  // Fallback
  return path.join(home, `.${appName.toLowerCase()}`);
}

/**
 * Validate that a path is safe (prevent directory traversal attacks)
 */
export function isPathSafe(filePath: string, basePath: string): boolean {
  const normalizedPath = path.normalize(filePath);
  const normalizedBase = path.normalize(basePath);
  
  // Check if the resolved path is within the base path
  const resolved = path.resolve(normalizedBase, normalizedPath);
  return resolved.startsWith(normalizedBase);
}