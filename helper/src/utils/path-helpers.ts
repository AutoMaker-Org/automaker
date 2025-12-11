import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

export interface PlatformInfo {
  isMac: boolean;
  isWindows: boolean;
  isLinux: boolean;
  isWSL: boolean;
  platform: NodeJS.Platform;
}

export function detectPlatform(): PlatformInfo {
  const platform = os.platform();
  const isWindows = platform === 'win32';
  const isMac = platform === 'darwin';
  const isLinux = platform === 'linux';
  
  const isWSL = isLinux && (
    !!process.env.WSL_DISTRO_NAME ||
    !!process.env.WSL_INTEROP ||
    (fs.existsSync('/proc/version') &&
    fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft'))
  );

  return {
    isMac,
    isWindows,
    isLinux,
    isWSL,
    platform
  };
}

export function getAppDataDirectory(appName: string = 'Automaker'): string {
  const { isMac, isWindows, isLinux, isWSL } = detectPlatform();
  const home = os.homedir();
  
  if (isMac) {
    return path.join(home, 'Library', 'Application Support', appName);
  } else if (isWindows) {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), appName);
  } else if (isLinux || isWSL) {
    return path.join(home, '.config', appName.toLowerCase());
  }
  
  return path.join(home, `.${appName.toLowerCase()}`);
}

export function getTempDirectory(): string {
  const { isWindows } = detectPlatform();
  
  if (isWindows) {
    return process.env.TEMP || process.env.TMP || path.join(os.homedir(), 'AppData', 'Local', 'Temp');
  }
  
  return process.env.TMPDIR || '/tmp';
}

export function isPathSafe(filePath: string, basePath: string): boolean {
  const normalizedPath = path.normalize(filePath);
  const normalizedBase = path.normalize(basePath);
  const resolved = path.resolve(normalizedBase, normalizedPath);
  
  return resolved.startsWith(normalizedBase);
}