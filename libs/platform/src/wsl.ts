/**
 * WSL (Windows Subsystem for Linux) utilities
 *
 * Provides cross-platform support for CLI tools that are only available
 * on Linux/macOS. On Windows, these tools can be accessed via WSL.
 *
 * @example
 * ```typescript
 * import { isWslAvailable, findCliInWsl, createWslCommand } from '@automaker/platform';
 *
 * // Check if WSL is available
 * if (process.platform === 'win32' && isWslAvailable()) {
 *   // Find a CLI tool installed in WSL
 *   const cliPath = findCliInWsl('cursor-agent');
 *   if (cliPath) {
 *     // Create command/args for spawning via WSL
 *     const { command, args } = createWslCommand(cliPath, ['--version']);
 *     // command = 'wsl.exe', args = ['cursor-agent', '--version']
 *   }
 * }
 * ```
 */

import { execSync } from 'child_process';
import * as path from 'path';

/**
 * Get the full path to wsl.exe
 * This is needed because spawn() may not find wsl.exe in PATH
 */
function getWslExePath(): string {
  // wsl.exe is in System32 on Windows
  const systemRoot = process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows';
  return path.join(systemRoot, 'System32', 'wsl.exe');
}

/** Result of finding a CLI in WSL */
export interface WslCliResult {
  /** Path to the CLI inside WSL (Linux path) */
  wslPath: string;
  /** The WSL distribution where it was found (if detected) */
  distribution?: string;
}

/** Options for WSL operations */
export interface WslOptions {
  /** Specific WSL distribution to use (default: use default distro) */
  distribution?: string;
  /** Timeout for WSL commands in milliseconds (default: 10000) */
  timeout?: number;
  /** Custom logger function */
  logger?: (message: string) => void;
}

// Cache WSL availability to avoid repeated checks
let wslAvailableCache: boolean | null = null;

/**
 * Check if WSL is available on the current system
 *
 * Returns false immediately on non-Windows platforms.
 * On Windows, checks if wsl.exe exists and can execute commands.
 *
 * Results are cached after first check.
 */
export function isWslAvailable(options: WslOptions = {}): boolean {
  const { timeout = 5000, logger = () => {} } = options;

  // Only relevant on Windows
  if (process.platform !== 'win32') {
    return false;
  }

  // Return cached result if available
  if (wslAvailableCache !== null) {
    return wslAvailableCache;
  }

  try {
    // Try to run a simple command via WSL
    execSync('wsl.exe echo ok', {
      encoding: 'utf8',
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    wslAvailableCache = true;
    logger('WSL is available');
    return true;
  } catch {
    // Try wsl --status as fallback
    try {
      execSync('wsl.exe --status', {
        encoding: 'utf8',
        timeout,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      wslAvailableCache = true;
      logger('WSL is available (via --status)');
      return true;
    } catch {
      wslAvailableCache = false;
      logger('WSL is not available');
      return false;
    }
  }
}

/**
 * Clear the WSL availability cache
 * Useful for testing or when WSL state may have changed
 */
export function clearWslCache(): void {
  wslAvailableCache = null;
}

/**
 * Get the default WSL distribution name
 */
export function getDefaultWslDistribution(options: WslOptions = {}): string | null {
  const { timeout = 5000 } = options;

  if (!isWslAvailable(options)) {
    return null;
  }

  try {
    // wsl -l -q returns distributions, first one marked with (Default)
    const result = execSync('wsl.exe -l -q', {
      encoding: 'utf16le', // WSL list output uses UTF-16LE on Windows
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    }).trim();

    // First non-empty line is the default
    const lines = result.split(/\r?\n/).filter((l) => l.trim());
    return lines[0]?.replace(/\0/g, '').trim() || null;
  } catch {
    return null;
  }
}

/**
 * Get all available WSL distributions
 */
export function getWslDistributions(options: WslOptions = {}): string[] {
  const { timeout = 5000, logger = () => {} } = options;

  if (!isWslAvailable(options)) {
    return [];
  }

  try {
    const result = execSync('wsl.exe -l -q', {
      encoding: 'utf16le', // WSL list output uses UTF-16LE on Windows
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    }).trim();

    const distributions = result
      .split(/\r?\n/)
      .map((l) => l.replace(/\0/g, '').trim())
      .filter((l) => l && !l.includes('docker-desktop')); // Exclude docker-desktop as it's minimal

    logger(`Found WSL distributions: ${distributions.join(', ')}`);
    return distributions;
  } catch {
    return [];
  }
}

/**
 * Find a CLI tool installed in WSL
 *
 * Searches for the CLI using 'which' inside WSL, then checks common paths.
 * If no distribution is specified, tries all available distributions (excluding docker-desktop).
 *
 * @param cliName - Name of the CLI to find (e.g., 'cursor-agent')
 * @param options - WSL options
 * @returns The Linux path to the CLI and the distribution where found, or null if not found
 */
export function findCliInWsl(cliName: string, options: WslOptions = {}): WslCliResult | null {
  const { distribution, timeout = 10000, logger = () => {} } = options;

  if (!isWslAvailable(options)) {
    return null;
  }

  // Helper to search in a specific distribution
  const searchInDistribution = (distro: string | undefined): WslCliResult | null => {
    const wslPrefix = distro ? `wsl.exe -d ${distro}` : 'wsl.exe';
    const distroLabel = distro || 'default';

    // Try 'which' first (works if PATH is set up correctly)
    try {
      const result = execSync(`${wslPrefix} which ${cliName}`, {
        encoding: 'utf8',
        timeout,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      }).trim();

      if (result && !result.includes('not found') && result.startsWith('/')) {
        logger(`Found ${cliName} in WSL (${distroLabel}) via 'which': ${result}`);
        return { wslPath: result, distribution: distro };
      }
    } catch {
      // Not found via which, continue to path checks
    }

    // Check common installation paths using sh -c for better compatibility
    // Use $HOME instead of ~ for reliable expansion
    const commonPaths = ['$HOME/.local/bin', '/usr/local/bin', '/usr/bin'];

    for (const basePath of commonPaths) {
      try {
        // Use sh -c to properly expand $HOME and test if executable
        const checkCmd = `${wslPrefix} sh -c "test -x ${basePath}/${cliName} && echo ${basePath}/${cliName}"`;
        const result = execSync(checkCmd, {
          encoding: 'utf8',
          timeout,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        }).trim();

        if (result && result.startsWith('/')) {
          logger(`Found ${cliName} in WSL (${distroLabel}) at: ${result}`);
          return { wslPath: result, distribution: distro };
        }
      } catch {
        // Path doesn't exist or not executable, continue
      }
    }

    return null;
  };

  // If a specific distribution is requested, only search there
  if (distribution) {
    return searchInDistribution(distribution);
  }

  // Try available distributions (excluding docker-desktop and similar minimal distros)
  const distributions = getWslDistributions(options);

  // Prioritize common user distributions
  const priorityDistros = ['Ubuntu', 'Debian', 'openSUSE', 'Fedora', 'Arch'];
  const sortedDistros = distributions.sort((a, b) => {
    const aIndex = priorityDistros.findIndex((p) => a.toLowerCase().includes(p.toLowerCase()));
    const bIndex = priorityDistros.findIndex((p) => b.toLowerCase().includes(p.toLowerCase()));
    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  logger(`Searching for ${cliName} in WSL distributions: ${sortedDistros.join(', ')}`);

  for (const distro of sortedDistros) {
    const result = searchInDistribution(distro);
    if (result) {
      return result;
    }
  }

  // Fallback: try default distribution as last resort
  const defaultResult = searchInDistribution(undefined);
  if (defaultResult) {
    return defaultResult;
  }

  logger(`${cliName} not found in any WSL distribution`);
  return null;
}

/**
 * Execute a command in WSL and return the output
 *
 * @param command - Command to execute (can include arguments)
 * @param options - WSL options
 * @returns Command output, or null if failed
 */
export function execInWsl(command: string, options: WslOptions = {}): string | null {
  const { distribution, timeout = 30000 } = options;

  if (!isWslAvailable(options)) {
    return null;
  }

  const wslPrefix = distribution ? `wsl.exe -d ${distribution}` : 'wsl.exe';

  try {
    return execSync(`${wslPrefix} ${command}`, {
      encoding: 'utf8',
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Create command and arguments for spawning a process via WSL
 *
 * This is useful for constructing spawn() calls that work through WSL.
 * Uses the full path to wsl.exe to ensure spawn() can find it.
 *
 * @param wslCliPath - The Linux path to the CLI inside WSL
 * @param args - Arguments to pass to the CLI
 * @param options - WSL options
 * @returns Object with command (full path to wsl.exe) and modified args
 *
 * @example
 * ```typescript
 * const { command, args } = createWslCommand('/home/user/.local/bin/cursor-agent', ['-p', 'hello']);
 * // command = 'C:\\Windows\\System32\\wsl.exe'
 * // args = ['/home/user/.local/bin/cursor-agent', '-p', 'hello']
 *
 * spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
 * ```
 */
export function createWslCommand(
  wslCliPath: string,
  args: string[],
  options: WslOptions = {}
): { command: string; args: string[] } {
  const { distribution } = options;
  // Use full path to wsl.exe to ensure spawn() can find it
  const wslExe = getWslExePath();

  if (distribution) {
    return {
      command: wslExe,
      args: ['-d', distribution, wslCliPath, ...args],
    };
  }

  return {
    command: wslExe,
    args: [wslCliPath, ...args],
  };
}

/**
 * Convert a Windows path to a WSL path
 *
 * @param windowsPath - Windows path (e.g., 'C:\\Users\\foo\\project')
 * @returns WSL path (e.g., '/mnt/c/Users/foo/project')
 */
export function windowsToWslPath(windowsPath: string): string {
  // Handle UNC paths
  if (windowsPath.startsWith('\\\\')) {
    // UNC paths are not directly supported, return as-is
    return windowsPath;
  }

  // Extract drive letter and convert
  const match = windowsPath.match(/^([A-Za-z]):\\(.*)$/);
  if (match) {
    const [, drive, rest] = match;
    const wslPath = `/mnt/${drive.toLowerCase()}/${rest.replace(/\\/g, '/')}`;
    return wslPath;
  }

  // Already a Unix-style path or relative path
  return windowsPath.replace(/\\/g, '/');
}

/**
 * Convert a WSL path to a Windows path
 *
 * @param wslPath - WSL path (e.g., '/mnt/c/Users/foo/project')
 * @returns Windows path (e.g., 'C:\\Users\\foo\\project'), or original if not a /mnt/ path
 */
export function wslToWindowsPath(wslPath: string): string {
  const match = wslPath.match(/^\/mnt\/([a-z])\/(.*)$/);
  if (match) {
    const [, drive, rest] = match;
    return `${drive.toUpperCase()}:\\${rest.replace(/\//g, '\\')}`;
  }

  // Not a /mnt/ path, return as-is
  return wslPath;
}
