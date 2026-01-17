/**
 * Cross-platform editor detection and launching utilities
 *
 * Handles:
 * - Detecting available code editors on the system
 * - Cross-platform editor launching (handles Windows .cmd files)
 * - Caching of detected editors for performance
 */

import { execFile, spawn, type ChildProcess } from 'child_process';
import { promisify } from 'util';
import { homedir } from 'os';
import { join } from 'path';
import { access } from 'fs/promises';
import type { EditorInfo } from '@automaker/types';
const execFileAsync = promisify(execFile);

// Platform detection
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';

// Cache with TTL for editor detection
let cachedEditors: EditorInfo[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if the editor cache is still valid
 */
function isCacheValid(): boolean {
  return cachedEditors !== null && Date.now() - cacheTimestamp < CACHE_TTL_MS;
}

/**
 * Clear the editor detection cache
 * Useful when editors may have been installed/uninstalled
 */
export function clearEditorCache(): void {
  cachedEditors = null;
  cacheTimestamp = 0;
}

/**
 * Check if a CLI command exists in PATH
 * Uses platform-specific command lookup (where on Windows, which on Unix)
 */
export async function commandExists(cmd: string): Promise<boolean> {
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
 * Checks both /Applications and ~/Applications
 */
async function findMacApp(appName: string): Promise<string | null> {
  if (!isMac) return null;

  // Check /Applications first
  const systemAppPath = join('/Applications', `${appName}.app`);
  try {
    await access(systemAppPath);
    return systemAppPath;
  } catch {
    // Not in /Applications
  }

  // Check ~/Applications (used by JetBrains Toolbox and others)
  const userAppPath = join(homedir(), 'Applications', `${appName}.app`);
  try {
    await access(userAppPath);
    return userAppPath;
  } catch {
    return null;
  }
}

/**
 * Editor definition with CLI command and macOS app bundle name
 */
interface EditorDefinition {
  name: string;
  cliCommand: string;
  cliAliases?: readonly string[];
  macAppName: string;
  /** If true, only available on macOS */
  macOnly?: boolean;
}

const ANTIGRAVITY_CLI_COMMANDS = ['antigravity', 'agy'] as const;
const [PRIMARY_ANTIGRAVITY_COMMAND, ...LEGACY_ANTIGRAVITY_COMMANDS] = ANTIGRAVITY_CLI_COMMANDS;

/**
 * List of supported editors in priority order
 */
const SUPPORTED_EDITORS: EditorDefinition[] = [
  { name: 'Cursor', cliCommand: 'cursor', macAppName: 'Cursor' },
  { name: 'VS Code', cliCommand: 'code', macAppName: 'Visual Studio Code' },
  {
    name: 'VS Code Insiders',
    cliCommand: 'code-insiders',
    macAppName: 'Visual Studio Code - Insiders',
  },
  { name: 'Kiro', cliCommand: 'kiro', macAppName: 'Kiro' },
  { name: 'Zed', cliCommand: 'zed', macAppName: 'Zed' },
  { name: 'Sublime Text', cliCommand: 'subl', macAppName: 'Sublime Text' },
  { name: 'Windsurf', cliCommand: 'windsurf', macAppName: 'Windsurf' },
  { name: 'Trae', cliCommand: 'trae', macAppName: 'Trae' },
  { name: 'Rider', cliCommand: 'rider', macAppName: 'Rider' },
  { name: 'WebStorm', cliCommand: 'webstorm', macAppName: 'WebStorm' },
  { name: 'Xcode', cliCommand: 'xed', macAppName: 'Xcode', macOnly: true },
  { name: 'Android Studio', cliCommand: 'studio', macAppName: 'Android Studio' },
  {
    name: 'Antigravity',
    cliCommand: PRIMARY_ANTIGRAVITY_COMMAND,
    cliAliases: LEGACY_ANTIGRAVITY_COMMANDS,
    macAppName: 'Antigravity',
  },
];

/**
 * Check if Xcode is fully installed (not just Command Line Tools)
 * xed command requires full Xcode.app, not just CLT
 */
async function isXcodeFullyInstalled(): Promise<boolean> {
  if (!isMac) return false;

  try {
    // Check if xcode-select points to full Xcode, not just CommandLineTools
    const { stdout } = await execFileAsync('xcode-select', ['-p']);
    const devPath = stdout.trim();

    // Full Xcode path: /Applications/Xcode.app/Contents/Developer
    // Command Line Tools: /Library/Developer/CommandLineTools
    const isPointingToXcode = devPath.includes('Xcode.app');

    if (!isPointingToXcode && devPath.includes('CommandLineTools')) {
      // Check if xed command exists (indicates CLT are installed)
      const xedExists = await commandExists('xed');

      // Check if Xcode.app actually exists
      const xcodeAppPath = await findMacApp('Xcode');

      if (xedExists && xcodeAppPath) {
        console.warn(
          'Xcode is installed but xcode-select is pointing to Command Line Tools. ' +
            'To use Xcode as an editor, run: sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer'
        );
      }
    }

    return isPointingToXcode;
  } catch {
    return false;
  }
}

/**
 * Try to find an editor - checks CLI first, then macOS app bundle
 * Returns EditorInfo if found, null otherwise
 */
async function findEditor(definition: EditorDefinition): Promise<EditorInfo | null> {
  // Skip macOS-only editors on other platforms
  if (definition.macOnly && !isMac) {
    return null;
  }

  // Special handling for Xcode: verify full installation, not just xed command
  if (definition.name === 'Xcode') {
    if (!(await isXcodeFullyInstalled())) {
      return null;
    }
  }

  // Try CLI command first (works on all platforms)
  const cliCandidates = [definition.cliCommand, ...(definition.cliAliases ?? [])];
  for (const cliCommand of cliCandidates) {
    if (await commandExists(cliCommand)) {
      return { name: definition.name, command: cliCommand };
    }
  }

  // Try macOS app bundle (checks /Applications and ~/Applications)
  if (isMac) {
    const appPath = await findMacApp(definition.macAppName);
    if (appPath) {
      // Use 'open -a' with full path for apps not in /Applications
      return { name: definition.name, command: `open -a "${appPath}"` };
    }
  }

  return null;
}

/**
 * Get the platform-specific file manager
 */
function getFileManagerInfo(): EditorInfo {
  if (isMac) {
    return { name: 'Finder', command: 'open' };
  } else if (isWindows) {
    return { name: 'Explorer', command: 'explorer' };
  } else {
    return { name: 'File Manager', command: 'xdg-open' };
  }
}

/**
 * Detect all available code editors on the system
 * Results are cached for 5 minutes for performance
 */
export async function detectAllEditors(): Promise<EditorInfo[]> {
  // Return cached result if still valid
  if (isCacheValid() && cachedEditors) {
    return cachedEditors;
  }

  // Check all editors in parallel for better performance
  const editorChecks = SUPPORTED_EDITORS.map((def) => findEditor(def));
  const results = await Promise.all(editorChecks);

  // Filter out null results (editors not found)
  const editors = results.filter((e): e is EditorInfo => e !== null);

  // Always add file manager as fallback
  editors.push(getFileManagerInfo());

  // Update cache
  cachedEditors = editors;
  cacheTimestamp = Date.now();

  return editors;
}

/**
 * Detect the default (first available) code editor on the system
 * Returns the highest priority editor that is installed
 */
export async function detectDefaultEditor(): Promise<EditorInfo> {
  const editors = await detectAllEditors();
  // Return first editor (highest priority) - always exists due to file manager fallback
  return editors[0];
}

/**
 * Find a specific editor by command
 * Returns the editor info if available, null otherwise
 */
export async function findEditorByCommand(command: string): Promise<EditorInfo | null> {
  const editors = await detectAllEditors();
  return editors.find((e) => e.command === command) ?? null;
}

/**
 * Open a path in the specified editor
 *
 * Handles cross-platform differences:
 * - On Windows, uses spawn with shell:true to handle .cmd batch scripts
 * - On macOS, handles 'open -a' style commands for app bundles
 * - On Linux, uses direct execution
 *
 * @param targetPath - The file or directory path to open
 * @param editorCommand - The editor command to use (optional, uses default if not specified)
 * @returns Promise that resolves with editor info when launched, rejects on error
 */
export async function openInEditor(
  targetPath: string,
  editorCommand?: string
): Promise<{ editorName: string }> {
  // Determine which editor to use
  let editor: EditorInfo;

  if (editorCommand) {
    const found = await findEditorByCommand(editorCommand);
    if (found) {
      editor = found;
    } else {
      // Fall back to default if specified editor not found
      editor = await detectDefaultEditor();
    }
  } else {
    editor = await detectDefaultEditor();
  }

  // Execute the editor
  await executeEditorCommand(editor.command, targetPath);

  return { editorName: editor.name };
}

/**
 * Execute an editor command with a path argument
 * Handles platform-specific differences in command execution
 */
async function executeEditorCommand(command: string, targetPath: string): Promise<void> {
  // Handle 'open -a "AppPath"' style commands (macOS app bundles)
  if (command.startsWith('open -a ')) {
    const appPath = command.replace('open -a ', '').replace(/"/g, '');
    await execFileAsync('open', ['-a', appPath, targetPath]);
    return;
  }

  // On Windows, editor CLI commands are typically .cmd batch scripts
  // spawn with shell:true is required to execute them properly
  if (isWindows) {
    return new Promise((resolve, reject) => {
      const child: ChildProcess = spawn(command, [targetPath], {
        shell: true,
        stdio: 'ignore',
        detached: true,
      });

      // Unref to allow the parent process to exit independently
      child.unref();

      child.on('error', (err) => {
        reject(err);
      });

      // Resolve after a small delay to catch immediate spawn errors
      // Editors run in background, so we don't wait for them to exit
      setTimeout(() => resolve(), 100);
    });
  }

  // Unix/macOS: use execFile for direct execution
  await execFileAsync(command, [targetPath]);
}

/**
 * Open a path in the platform's default file manager
 * Always available as a fallback option
 */
export async function openInFileManager(targetPath: string): Promise<{ editorName: string }> {
  const fileManager = getFileManagerInfo();
  await execFileAsync(fileManager.command, [targetPath]);
  return { editorName: fileManager.name };
}

/**
 * Get the platform-specific terminal information
 */
function getTerminalInfo(): { name: string; command: string; args: string[] } {
  if (isMac) {
    // On macOS, use Terminal.app with AppleScript to open in a specific directory
    return {
      name: 'Terminal',
      command: 'open',
      args: ['-a', 'Terminal'],
    };
  } else if (isWindows) {
    // On Windows, use Windows Terminal if available, otherwise cmd
    return {
      name: 'Windows Terminal',
      command: 'wt',
      args: ['-d'],
    };
  } else {
    // On Linux, try common terminal emulators in order of preference
    return {
      name: 'Terminal',
      command: 'x-terminal-emulator',
      args: ['--working-directory'],
    };
  }
}

/**
 * Open a terminal in the specified directory
 *
 * Handles cross-platform differences:
 * - On macOS, uses Terminal.app via 'open -a Terminal' or AppleScript for directory
 * - On Windows, uses Windows Terminal (wt) or falls back to cmd
 * - On Linux, uses x-terminal-emulator or common terminal emulators
 *
 * @param targetPath - The directory path to open the terminal in
 * @returns Promise that resolves with terminal info when launched, rejects on error
 */
export async function openInTerminal(targetPath: string): Promise<{ terminalName: string }> {
  if (isMac) {
    // Use AppleScript to open Terminal.app in the specified directory
    const script = `
      tell application "Terminal"
        do script "cd ${targetPath.replace(/"/g, '\\"').replace(/\$/g, '\\$')}"
        activate
      end tell
    `;
    await execFileAsync('osascript', ['-e', script]);
    return { terminalName: 'Terminal' };
  } else if (isWindows) {
    // Try Windows Terminal first
    try {
      return await new Promise((resolve, reject) => {
        const child: ChildProcess = spawn('wt', ['-d', targetPath], {
          shell: true,
          stdio: 'ignore',
          detached: true,
        });
        child.unref();

        child.on('error', () => {
          reject(new Error('Windows Terminal not available'));
        });

        setTimeout(() => resolve({ terminalName: 'Windows Terminal' }), 100);
      });
    } catch {
      // Fall back to cmd
      return await new Promise((resolve, reject) => {
        const child: ChildProcess = spawn(
          'cmd',
          ['/c', 'start', 'cmd', '/k', `cd /d "${targetPath}"`],
          {
            shell: true,
            stdio: 'ignore',
            detached: true,
          }
        );
        child.unref();

        child.on('error', (err) => {
          reject(err);
        });

        setTimeout(() => resolve({ terminalName: 'Command Prompt' }), 100);
      });
    }
  } else {
    // Linux: Try common terminal emulators in order
    const terminals = [
      {
        name: 'GNOME Terminal',
        command: 'gnome-terminal',
        args: ['--working-directory', targetPath],
      },
      { name: 'Konsole', command: 'konsole', args: ['--workdir', targetPath] },
      {
        name: 'xfce4-terminal',
        command: 'xfce4-terminal',
        args: ['--working-directory', targetPath],
      },
      { name: 'xterm', command: 'xterm', args: ['-e', `cd "${targetPath}" && $SHELL`] },
      {
        name: 'x-terminal-emulator',
        command: 'x-terminal-emulator',
        args: ['--working-directory', targetPath],
      },
    ];

    for (const terminal of terminals) {
      if (await commandExists(terminal.command)) {
        await execFileAsync(terminal.command, terminal.args);
        return { terminalName: terminal.name };
      }
    }

    throw new Error('No terminal emulator found');
  }
}
