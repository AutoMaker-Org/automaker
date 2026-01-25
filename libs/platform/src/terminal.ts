/**
 * Cross-platform terminal detection and launching utilities
 *
 * Handles:
 * - Detecting available external terminals on the system
 * - Cross-platform terminal launching
 * - Caching of detected terminals for performance
 */

import { execFile, spawn, type ChildProcess } from 'child_process';
import { promisify } from 'util';
import { homedir } from 'os';
import { join } from 'path';
import { access } from 'fs/promises';
import type { TerminalInfo } from '@automaker/types';

const execFileAsync = promisify(execFile);

// Platform detection
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const isLinux = process.platform === 'linux';

// Cache with TTL for terminal detection
let cachedTerminals: TerminalInfo[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if the terminal cache is still valid
 */
function isCacheValid(): boolean {
  return cachedTerminals !== null && Date.now() - cacheTimestamp < CACHE_TTL_MS;
}

/**
 * Clear the terminal detection cache
 * Useful when terminals may have been installed/uninstalled
 */
export function clearTerminalCache(): void {
  cachedTerminals = null;
  cacheTimestamp = 0;
}

/**
 * Check if a CLI command exists in PATH
 * Uses platform-specific command lookup (where on Windows, which on Unix)
 */
async function commandExists(cmd: string): Promise<boolean> {
  try {
    const whichCmd = isWindows ? 'where' : 'which';
    await execFileAsync(whichCmd, [cmd]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a macOS app bundle exists and return the path if found
 * Checks /Applications, /System/Applications (for built-in apps), and ~/Applications
 */
async function findMacApp(appName: string): Promise<string | null> {
  if (!isMac) return null;

  // Check /Applications first (third-party apps)
  const appPath = join('/Applications', `${appName}.app`);
  try {
    await access(appPath);
    return appPath;
  } catch {
    // Not in /Applications
  }

  // Check /System/Applications (built-in macOS apps like Terminal on Catalina+)
  const systemAppPath = join('/System/Applications', `${appName}.app`);
  try {
    await access(systemAppPath);
    return systemAppPath;
  } catch {
    // Not in /System/Applications
  }

  // Check ~/Applications (used by some installers)
  const userAppPath = join(homedir(), 'Applications', `${appName}.app`);
  try {
    await access(userAppPath);
    return userAppPath;
  } catch {
    return null;
  }
}

/**
 * Check if a Windows path exists
 */
async function windowsPathExists(path: string): Promise<boolean> {
  if (!isWindows) return false;

  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Terminal definition with CLI command and platform-specific identifiers
 */
interface TerminalDefinition {
  id: string;
  name: string;
  /** CLI command (cross-platform, checked via which/where) */
  cliCommand?: string;
  /** Alternative CLI commands to check */
  cliAliases?: readonly string[];
  /** macOS app bundle name */
  macAppName?: string;
  /** Windows executable paths to check */
  windowsPaths?: readonly string[];
  /** Linux binary paths to check */
  linuxPaths?: readonly string[];
  /** Platform restriction */
  platform?: 'darwin' | 'win32' | 'linux';
}

/**
 * List of supported terminals in priority order
 */
const SUPPORTED_TERMINALS: TerminalDefinition[] = [
  // macOS terminals
  {
    id: 'iterm2',
    name: 'iTerm2',
    cliCommand: 'iterm2',
    macAppName: 'iTerm',
    platform: 'darwin',
  },
  {
    id: 'warp',
    name: 'Warp',
    cliCommand: 'warp',
    macAppName: 'Warp',
    platform: 'darwin',
  },
  {
    id: 'ghostty',
    name: 'Ghostty',
    cliCommand: 'ghostty',
    macAppName: 'Ghostty',
  },
  {
    id: 'rio',
    name: 'Rio',
    cliCommand: 'rio',
    macAppName: 'Rio',
  },
  {
    id: 'alacritty',
    name: 'Alacritty',
    cliCommand: 'alacritty',
    macAppName: 'Alacritty',
  },
  {
    id: 'wezterm',
    name: 'WezTerm',
    cliCommand: 'wezterm',
    macAppName: 'WezTerm',
  },
  {
    id: 'kitty',
    name: 'Kitty',
    cliCommand: 'kitty',
    macAppName: 'kitty',
  },
  {
    id: 'hyper',
    name: 'Hyper',
    cliCommand: 'hyper',
    macAppName: 'Hyper',
  },
  {
    id: 'tabby',
    name: 'Tabby',
    cliCommand: 'tabby',
    macAppName: 'Tabby',
  },
  {
    id: 'terminal-macos',
    name: 'System Terminal',
    macAppName: 'Utilities/Terminal',
    platform: 'darwin',
  },

  // Windows terminals
  {
    id: 'windows-terminal',
    name: 'Windows Terminal',
    cliCommand: 'wt',
    windowsPaths: [join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'wt.exe')],
    platform: 'win32',
  },
  {
    id: 'powershell',
    name: 'PowerShell',
    cliCommand: 'pwsh',
    cliAliases: ['powershell'],
    windowsPaths: [
      join(
        process.env.SYSTEMROOT || 'C:\\Windows',
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe'
      ),
    ],
    platform: 'win32',
  },
  {
    id: 'cmd',
    name: 'Command Prompt',
    cliCommand: 'cmd',
    windowsPaths: [join(process.env.SYSTEMROOT || 'C:\\Windows', 'System32', 'cmd.exe')],
    platform: 'win32',
  },
  {
    id: 'git-bash',
    name: 'Git Bash',
    windowsPaths: [
      join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Git', 'git-bash.exe'),
      join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Git', 'git-bash.exe'),
    ],
    platform: 'win32',
  },

  // Linux terminals
  {
    id: 'gnome-terminal',
    name: 'GNOME Terminal',
    cliCommand: 'gnome-terminal',
    platform: 'linux',
  },
  {
    id: 'konsole',
    name: 'Konsole',
    cliCommand: 'konsole',
    platform: 'linux',
  },
  {
    id: 'xfce4-terminal',
    name: 'XFCE4 Terminal',
    cliCommand: 'xfce4-terminal',
    platform: 'linux',
  },
  {
    id: 'tilix',
    name: 'Tilix',
    cliCommand: 'tilix',
    platform: 'linux',
  },
  {
    id: 'terminator',
    name: 'Terminator',
    cliCommand: 'terminator',
    platform: 'linux',
  },
  {
    id: 'foot',
    name: 'Foot',
    cliCommand: 'foot',
    platform: 'linux',
  },
  {
    id: 'xterm',
    name: 'XTerm',
    cliCommand: 'xterm',
    platform: 'linux',
  },
];

/**
 * Try to find a terminal - checks CLI, macOS app bundle, or Windows paths
 * Returns TerminalInfo if found, null otherwise
 */
async function findTerminal(definition: TerminalDefinition): Promise<TerminalInfo | null> {
  // Skip if terminal is for a different platform
  if (definition.platform) {
    if (definition.platform === 'darwin' && !isMac) return null;
    if (definition.platform === 'win32' && !isWindows) return null;
    if (definition.platform === 'linux' && !isLinux) return null;
  }

  // Try CLI command first (works on all platforms)
  const cliCandidates = [definition.cliCommand, ...(definition.cliAliases ?? [])].filter(
    Boolean
  ) as string[];
  for (const cliCommand of cliCandidates) {
    if (await commandExists(cliCommand)) {
      return {
        id: definition.id,
        name: definition.name,
        command: cliCommand,
      };
    }
  }

  // Try macOS app bundle
  if (isMac && definition.macAppName) {
    const appPath = await findMacApp(definition.macAppName);
    if (appPath) {
      return {
        id: definition.id,
        name: definition.name,
        command: `open -a "${appPath}"`,
      };
    }
  }

  // Try Windows paths
  if (isWindows && definition.windowsPaths) {
    for (const windowsPath of definition.windowsPaths) {
      if (await windowsPathExists(windowsPath)) {
        return {
          id: definition.id,
          name: definition.name,
          command: windowsPath,
        };
      }
    }
  }

  return null;
}

/**
 * Detect all available external terminals on the system
 * Results are cached for 5 minutes for performance
 */
export async function detectAllTerminals(): Promise<TerminalInfo[]> {
  // Return cached result if still valid
  if (isCacheValid() && cachedTerminals) {
    return cachedTerminals;
  }

  // Check all terminals in parallel for better performance
  const terminalChecks = SUPPORTED_TERMINALS.map((def) => findTerminal(def));
  const results = await Promise.all(terminalChecks);

  // Filter out null results (terminals not found)
  const terminals = results.filter((t): t is TerminalInfo => t !== null);

  // Update cache
  cachedTerminals = terminals;
  cacheTimestamp = Date.now();

  return terminals;
}

/**
 * Detect the default (first available) external terminal on the system
 * Returns the highest priority terminal that is installed, or null if none found
 */
export async function detectDefaultTerminal(): Promise<TerminalInfo | null> {
  const terminals = await detectAllTerminals();
  return terminals[0] ?? null;
}

/**
 * Find a specific terminal by ID
 * Returns the terminal info if available, null otherwise
 */
export async function findTerminalById(id: string): Promise<TerminalInfo | null> {
  const terminals = await detectAllTerminals();
  return terminals.find((t) => t.id === id) ?? null;
}

/**
 * Open a directory in the specified external terminal
 *
 * Handles cross-platform differences:
 * - On macOS, uses 'open -a' for app bundles or direct command with --directory flag
 * - On Windows, uses spawn with shell:true
 * - On Linux, uses direct execution with working directory
 *
 * @param targetPath - The directory path to open
 * @param terminalId - The terminal ID to use (optional, uses default if not specified)
 * @returns Promise that resolves with terminal info when launched, rejects on error
 */
export async function openInExternalTerminal(
  targetPath: string,
  terminalId?: string
): Promise<{ terminalName: string }> {
  // Determine which terminal to use
  let terminal: TerminalInfo | null;

  if (terminalId) {
    terminal = await findTerminalById(terminalId);
    if (!terminal) {
      // Fall back to default if specified terminal not found
      terminal = await detectDefaultTerminal();
    }
  } else {
    terminal = await detectDefaultTerminal();
  }

  if (!terminal) {
    throw new Error('No external terminal available');
  }

  // Execute the terminal
  await executeTerminalCommand(terminal, targetPath);

  return { terminalName: terminal.name };
}

/**
 * Execute a terminal command to open at a specific path
 * Handles platform-specific differences in command execution
 */
async function executeTerminalCommand(terminal: TerminalInfo, targetPath: string): Promise<void> {
  const { id, command } = terminal;

  // Handle 'open -a "AppPath"' style commands (macOS app bundles)
  if (command.startsWith('open -a ')) {
    const appPath = command.replace('open -a ', '').replace(/"/g, '');

    // Different terminals have different ways to open at a directory
    if (id === 'iterm2') {
      // iTerm2: Use AppleScript to open a new window at the path
      await execFileAsync('osascript', [
        '-e',
        `tell application "iTerm"
          create window with default profile
          tell current session of current window
            write text "cd ${escapeShellArg(targetPath)}"
          end tell
        end tell`,
      ]);
    } else if (id === 'terminal-macos') {
      // macOS Terminal: Use AppleScript
      await execFileAsync('osascript', [
        '-e',
        `tell application "Terminal"
          do script "cd ${escapeShellArg(targetPath)}"
          activate
        end tell`,
      ]);
    } else if (id === 'warp') {
      // Warp: Open app and use AppleScript to cd
      await execFileAsync('open', ['-a', appPath, targetPath]);
    } else {
      // Generic: Just open the app with the directory as argument
      await execFileAsync('open', ['-a', appPath, targetPath]);
    }
    return;
  }

  // Handle different terminals based on their ID
  switch (id) {
    case 'iterm2':
      // iTerm2 CLI mode
      await execFileAsync('osascript', [
        '-e',
        `tell application "iTerm"
          create window with default profile
          tell current session of current window
            write text "cd ${escapeShellArg(targetPath)}"
          end tell
        end tell`,
      ]);
      break;

    case 'ghostty':
      // Ghostty: uses --working-directory=PATH format (single arg)
      await spawnDetached(command, [`--working-directory=${targetPath}`]);
      break;

    case 'alacritty':
      // Alacritty: uses --working-directory flag
      await spawnDetached(command, ['--working-directory', targetPath]);
      break;

    case 'wezterm':
      // WezTerm: uses start --cwd flag
      await spawnDetached(command, ['start', '--cwd', targetPath]);
      break;

    case 'kitty':
      // Kitty: uses --directory flag
      await spawnDetached(command, ['--directory', targetPath]);
      break;

    case 'hyper':
      // Hyper: open at directory by setting cwd
      await spawnDetached(command, [targetPath]);
      break;

    case 'tabby':
      // Tabby: open at directory
      await spawnDetached(command, ['open', targetPath]);
      break;

    case 'rio':
      // Rio: uses --working-dir flag
      await spawnDetached(command, ['--working-dir', targetPath]);
      break;

    case 'windows-terminal':
      // Windows Terminal: uses -d flag for directory
      await spawnDetached(command, ['-d', targetPath], { shell: true });
      break;

    case 'powershell':
    case 'cmd':
      // PowerShell/CMD: Start in directory with /K to keep open
      await spawnDetached('start', [command, '/K', `cd /d "${targetPath}"`], {
        shell: true,
      });
      break;

    case 'git-bash':
      // Git Bash: uses --cd flag
      await spawnDetached(command, ['--cd', targetPath], { shell: true });
      break;

    case 'gnome-terminal':
      // GNOME Terminal: uses --working-directory flag
      await spawnDetached(command, ['--working-directory', targetPath]);
      break;

    case 'konsole':
      // Konsole: uses --workdir flag
      await spawnDetached(command, ['--workdir', targetPath]);
      break;

    case 'xfce4-terminal':
      // XFCE4 Terminal: uses --working-directory flag
      await spawnDetached(command, ['--working-directory', targetPath]);
      break;

    case 'tilix':
      // Tilix: uses --working-directory flag
      await spawnDetached(command, ['--working-directory', targetPath]);
      break;

    case 'terminator':
      // Terminator: uses --working-directory flag
      await spawnDetached(command, ['--working-directory', targetPath]);
      break;

    case 'foot':
      // Foot: uses --working-directory flag
      await spawnDetached(command, ['--working-directory', targetPath]);
      break;

    case 'xterm':
      // XTerm: uses -e to run a shell in the directory
      await spawnDetached(command, [
        '-e',
        'sh',
        '-c',
        `cd ${escapeShellArg(targetPath)} && $SHELL`,
      ]);
      break;

    default:
      // Generic fallback: try to run the command with the directory as argument
      await spawnDetached(command, [targetPath]);
  }
}

/**
 * Spawn a detached process that won't block the parent
 */
function spawnDetached(
  command: string,
  args: string[],
  options: { shell?: boolean } = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(command, args, {
      shell: options.shell ?? false,
      stdio: 'ignore',
      detached: true,
    });

    // Unref to allow the parent process to exit independently
    child.unref();

    child.on('error', (err) => {
      reject(err);
    });

    // Resolve after a small delay to catch immediate spawn errors
    // Terminals run in background, so we don't wait for them to exit
    setTimeout(() => resolve(), 100);
  });
}

/**
 * Escape a string for safe use in shell commands
 */
function escapeShellArg(arg: string): string {
  // Escape single quotes by ending the quoted string, adding escaped quote, and starting new quoted string
  return `'${arg.replace(/'/g, "'\\''")}'`;
}
