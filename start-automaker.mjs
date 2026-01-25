#!/usr/bin/env node
/**
 * Cross-platform launcher for Automaker
 * Works on Windows (CMD, PowerShell, Git Bash) and Unix (macOS, Linux)
 */

import { spawn, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { platform } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isWindows = platform() === 'win32';
const args = process.argv.slice(2);

/**
 * Detect the bash variant by checking $OSTYPE
 * This is more reliable than path-based detection since bash.exe in PATH
 * could be Git Bash, WSL, or something else
 * @param {string} bashPath - Path to bash executable
 * @returns {'WSL' | 'MSYS' | 'CYGWIN' | 'UNKNOWN'} The detected bash variant
 */
function detectBashVariant(bashPath) {
  try {
    const result = spawnSync(bashPath, ['-c', 'echo $OSTYPE'], {
      stdio: 'pipe',
      timeout: 2000,
    });
    if (result.status === 0) {
      const ostype = result.stdout.toString().trim();
      // WSL reports 'linux-gnu' or similar Linux identifier
      if (ostype === 'linux-gnu' || ostype.startsWith('linux')) return 'WSL';
      // MSYS2/Git Bash reports 'msys' or 'mingw*'
      if (ostype.startsWith('msys') || ostype.startsWith('mingw')) return 'MSYS';
      // Cygwin reports 'cygwin'
      if (ostype.startsWith('cygwin')) return 'CYGWIN';
    }
  } catch {
    // Fall through to path-based detection
  }
  // Fallback to path-based detection if $OSTYPE check fails
  const lower = bashPath.toLowerCase();
  if (lower.includes('cygwin')) return 'CYGWIN';
  if (lower.includes('system32')) return 'WSL';
  // Default to MSYS (Git Bash) as it's the most common
  return 'MSYS';
}

/**
 * Convert Windows path to Unix-style for the detected bash variant
 * @param {string} windowsPath - Windows-style path (e.g., C:\path\to\file)
 * @param {string} bashCmd - Path to bash executable (used to detect variant)
 * @returns {string} Unix-style path appropriate for the bash variant
 */
function convertPathForBash(windowsPath, bashCmd) {
  // Input validation
  if (!windowsPath || typeof windowsPath !== 'string') {
    throw new Error('convertPathForBash: invalid windowsPath');
  }
  if (!bashCmd || typeof bashCmd !== 'string') {
    throw new Error('convertPathForBash: invalid bashCmd');
  }

  let unixPath = windowsPath.replace(/\\/g, '/');
  if (/^[A-Za-z]:/.test(unixPath)) {
    const drive = unixPath[0].toLowerCase();
    const pathPart = unixPath.slice(2);

    // Detect bash variant via $OSTYPE (more reliable than path-based)
    const variant = detectBashVariant(bashCmd);
    switch (variant) {
      case 'CYGWIN':
        // Cygwin expects /cygdrive/c/path format
        return `/cygdrive/${drive}${pathPart}`;
      case 'WSL':
        // WSL expects /mnt/c/path format
        return `/mnt/${drive}${pathPart}`;
      case 'MSYS':
      default:
        // MSYS2/Git Bash expects /c/path format
        return `/${drive}${pathPart}`;
    }
  }
  return unixPath;
}

/**
 * Find bash executable on Windows
 */
function findBashOnWindows() {
  const possiblePaths = [
    // Git Bash (most common)
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    // MSYS2
    'C:\\msys64\\usr\\bin\\bash.exe',
    'C:\\msys32\\usr\\bin\\bash.exe',
    // Cygwin
    'C:\\cygwin64\\bin\\bash.exe',
    'C:\\cygwin\\bin\\bash.exe',
    // WSL bash (available in PATH on Windows 10+)
    'bash.exe',
  ];

  for (const bashPath of possiblePaths) {
    if (bashPath === 'bash.exe') {
      // Check if bash is in PATH
      try {
        const result = spawnSync('where', ['bash.exe'], { stdio: 'pipe' });
        if (result?.status === 0) {
          return 'bash.exe';
        }
      } catch (err) {
        // where command failed, continue checking other paths
      }
    } else if (existsSync(bashPath)) {
      return bashPath;
    }
  }

  return null;
}

/**
 * Run the bash script
 */
function runBashScript() {
  const scriptPath = join(__dirname, 'start-automaker.sh');

  if (!existsSync(scriptPath)) {
    console.error('Error: start-automaker.sh not found');
    process.exit(1);
  }

  let bashCmd;
  let bashArgs;

  if (isWindows) {
    bashCmd = findBashOnWindows();

    if (!bashCmd) {
      console.error('Error: Could not find bash on Windows.');
      console.error('Please install Git for Windows from https://git-scm.com/download/win');
      console.error('');
      console.error('Alternatively, you can run these commands directly:');
      console.error('  npm run dev:web      - Web browser mode');
      console.error('  npm run dev:electron - Desktop app mode');
      process.exit(1);
    }

    // Convert Windows path to appropriate Unix-style for the detected bash variant
    const unixPath = convertPathForBash(scriptPath, bashCmd);
    bashArgs = [unixPath, ...args];
  } else {
    bashCmd = '/bin/bash';
    bashArgs = [scriptPath, ...args];
  }

  const child = spawn(bashCmd, bashArgs, {
    stdio: 'inherit',
    env: {
      ...process.env,
      // Ensure proper terminal handling
      TERM: process.env.TERM || 'xterm-256color',
    },
    // shell: false ensures signals are forwarded directly to the child process
    shell: false,
  });

  child.on('error', (err) => {
    if (err.code === 'ENOENT') {
      console.error(`Error: Could not find bash at "${bashCmd}"`);
      console.error('Please ensure Git Bash or another bash shell is installed.');
    } else {
      console.error('Error launching Automaker:', err.message);
    }
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      // Process was killed by a signal - exit with 1 to indicate abnormal termination
      // (Unix convention is 128 + signal number, but we use 1 for simplicity)
      process.exit(1);
    }
    process.exit(code ?? 0);
  });

  // Forward signals to child process (guard against race conditions)
  process.on('SIGINT', () => {
    if (!child.killed) child.kill('SIGINT');
  });
  process.on('SIGTERM', () => {
    if (!child.killed) child.kill('SIGTERM');
  });
}

runBashScript();
