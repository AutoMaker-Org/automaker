/**
 * Init Script Service - Executes worktree initialization scripts
 *
 * Runs the .automaker/worktree-init.sh script after worktree creation.
 * Uses Git Bash on Windows for cross-platform shell script compatibility.
 */

import { spawn } from 'child_process';
import path from 'path';
import { createLogger } from '@automaker/utils';
import { systemPathExists, getShellPaths, findGitBashPath } from '@automaker/platform';
import { findCommand } from '../lib/cli-detection.js';
import type { EventEmitter } from '../lib/events.js';
import { readWorktreeMetadata, writeWorktreeMetadata } from '../lib/worktree-metadata.js';
import * as secureFs from '../lib/secure-fs.js';

const logger = createLogger('InitScript');

export interface InitScriptOptions {
  /** Absolute path to the project root */
  projectPath: string;
  /** Absolute path to the worktree directory */
  worktreePath: string;
  /** Branch name for this worktree */
  branch: string;
  /** Event emitter for streaming output */
  emitter: EventEmitter;
}

interface ShellCommand {
  shell: string;
  args: string[];
}

/**
 * Init Script Service
 *
 * Handles execution of worktree initialization scripts with cross-platform
 * shell detection and proper streaming of output via WebSocket events.
 */
export class InitScriptService {
  private cachedShellCommand: ShellCommand | null | undefined = undefined;

  /**
   * Get the path to the init script for a project
   */
  getInitScriptPath(projectPath: string): string {
    return path.join(projectPath, '.automaker', 'worktree-init.sh');
  }

  /**
   * Check if the init script has already been run for a worktree
   */
  async hasInitScriptRun(projectPath: string, branch: string): Promise<boolean> {
    const metadata = await readWorktreeMetadata(projectPath, branch);
    return metadata?.initScriptRan === true;
  }

  /**
   * Find the appropriate shell for running scripts
   * Uses findGitBashPath() on Windows to avoid WSL bash, then falls back to PATH
   */
  async findShellCommand(): Promise<ShellCommand | null> {
    // Return cached result if available
    if (this.cachedShellCommand !== undefined) {
      return this.cachedShellCommand;
    }

    if (process.platform === 'win32') {
      // On Windows, prioritize Git Bash over WSL bash (C:\Windows\System32\bash.exe)
      // WSL bash may not be properly configured and causes ENOENT errors

      // First try known Git Bash installation paths
      const gitBashPath = await findGitBashPath();
      if (gitBashPath) {
        logger.debug(`Found Git Bash at: ${gitBashPath}`);
        this.cachedShellCommand = { shell: gitBashPath, args: [] };
        return this.cachedShellCommand;
      }

      // Fall back to finding bash in PATH, but skip WSL bash
      const bashInPath = await findCommand(['bash']);
      if (bashInPath && !bashInPath.toLowerCase().includes('system32')) {
        logger.debug(`Found bash in PATH at: ${bashInPath}`);
        this.cachedShellCommand = { shell: bashInPath, args: [] };
        return this.cachedShellCommand;
      }

      logger.warn('Git Bash not found. WSL bash was skipped to avoid compatibility issues.');
      this.cachedShellCommand = null;
      return null;
    }

    // Unix-like systems: use getShellPaths() and check existence
    const shellPaths = getShellPaths();
    const posixShells = shellPaths.filter(
      (p) => p.includes('bash') || p === '/bin/sh' || p === '/usr/bin/sh'
    );

    for (const shellPath of posixShells) {
      try {
        if (systemPathExists(shellPath)) {
          this.cachedShellCommand = { shell: shellPath, args: [] };
          return this.cachedShellCommand;
        }
      } catch {
        // Path not allowed or doesn't exist, continue
      }
    }

    // Ultimate fallback
    if (systemPathExists('/bin/sh')) {
      this.cachedShellCommand = { shell: '/bin/sh', args: [] };
      return this.cachedShellCommand;
    }

    this.cachedShellCommand = null;
    return null;
  }

  /**
   * Run the worktree initialization script
   * Non-blocking - returns immediately after spawning
   */
  async runInitScript(options: InitScriptOptions): Promise<void> {
    const { projectPath, worktreePath, branch, emitter } = options;

    const scriptPath = this.getInitScriptPath(projectPath);

    // Check if script exists using secureFs (respects ALLOWED_ROOT_DIRECTORY)
    try {
      await secureFs.access(scriptPath);
    } catch {
      logger.debug(`No init script found at ${scriptPath}`);
      return;
    }

    // Check if already run
    if (await this.hasInitScriptRun(projectPath, branch)) {
      logger.info(`Init script already ran for branch "${branch}", skipping`);
      return;
    }

    // Get shell command
    const shellCmd = await this.findShellCommand();
    if (!shellCmd) {
      const error =
        process.platform === 'win32'
          ? 'Git Bash not found. Please install Git for Windows to run init scripts.'
          : 'No shell found (/bin/bash or /bin/sh)';
      logger.error(error);

      // Update metadata with error, preserving existing metadata
      const existingMetadata = await readWorktreeMetadata(projectPath, branch);
      await writeWorktreeMetadata(projectPath, branch, {
        branch,
        createdAt: existingMetadata?.createdAt || new Date().toISOString(),
        pr: existingMetadata?.pr,
        initScriptRan: true,
        initScriptStatus: 'failed',
        initScriptError: error,
      });

      emitter.emit('worktree:init-completed', {
        projectPath,
        worktreePath,
        branch,
        success: false,
        error,
      });
      return;
    }

    logger.info(`Running init script for branch "${branch}" in ${worktreePath}`);
    logger.debug(`Using shell: ${shellCmd.shell}`);

    // Update metadata to mark as running
    const existingMetadata = await readWorktreeMetadata(projectPath, branch);
    await writeWorktreeMetadata(projectPath, branch, {
      branch,
      createdAt: existingMetadata?.createdAt || new Date().toISOString(),
      pr: existingMetadata?.pr,
      initScriptRan: false,
      initScriptStatus: 'running',
    });

    // Emit started event
    emitter.emit('worktree:init-started', {
      projectPath,
      worktreePath,
      branch,
    });

    // Build safe environment - only pass necessary variables, not all of process.env
    // This prevents exposure of sensitive credentials like ANTHROPIC_API_KEY
    const safeEnv: Record<string, string> = {
      // Automaker-specific variables
      AUTOMAKER_PROJECT_PATH: projectPath,
      AUTOMAKER_WORKTREE_PATH: worktreePath,
      AUTOMAKER_BRANCH: branch,

      // Essential system variables
      PATH: process.env.PATH || '',
      HOME: process.env.HOME || '',
      USER: process.env.USER || '',
      TMPDIR: process.env.TMPDIR || process.env.TEMP || process.env.TMP || '/tmp',

      // Shell and locale
      SHELL: process.env.SHELL || '',
      LANG: process.env.LANG || 'en_US.UTF-8',
      LC_ALL: process.env.LC_ALL || '',

      // Force color output even though we're not a TTY
      FORCE_COLOR: '1',
      npm_config_color: 'always',
      CLICOLOR_FORCE: '1',

      // Git configuration
      GIT_TERMINAL_PROMPT: '0',
    };

    // Platform-specific additions
    if (process.platform === 'win32') {
      safeEnv.USERPROFILE = process.env.USERPROFILE || '';
      safeEnv.APPDATA = process.env.APPDATA || '';
      safeEnv.LOCALAPPDATA = process.env.LOCALAPPDATA || '';
      safeEnv.SystemRoot = process.env.SystemRoot || 'C:\\Windows';
      safeEnv.TEMP = process.env.TEMP || '';
    }

    // Spawn the script with safe environment
    const child = spawn(shellCmd.shell, [...shellCmd.args, scriptPath], {
      cwd: worktreePath,
      env: safeEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Stream stdout
    child.stdout?.on('data', (data: Buffer) => {
      const content = data.toString();
      emitter.emit('worktree:init-output', {
        projectPath,
        branch,
        type: 'stdout',
        content,
      });
    });

    // Stream stderr
    child.stderr?.on('data', (data: Buffer) => {
      const content = data.toString();
      emitter.emit('worktree:init-output', {
        projectPath,
        branch,
        type: 'stderr',
        content,
      });
    });

    // Handle completion
    child.on('exit', async (code) => {
      const success = code === 0;
      const status = success ? 'success' : 'failed';

      logger.info(`Init script for branch "${branch}" ${status} with exit code ${code}`);

      // Update metadata
      const metadata = await readWorktreeMetadata(projectPath, branch);
      await writeWorktreeMetadata(projectPath, branch, {
        branch,
        createdAt: metadata?.createdAt || new Date().toISOString(),
        pr: metadata?.pr,
        initScriptRan: true,
        initScriptStatus: status,
        initScriptError: success ? undefined : `Exit code: ${code}`,
      });

      // Emit completion event
      emitter.emit('worktree:init-completed', {
        projectPath,
        worktreePath,
        branch,
        success,
        exitCode: code,
      });
    });

    child.on('error', async (error) => {
      logger.error(`Init script error for branch "${branch}":`, error);

      // Update metadata
      const metadata = await readWorktreeMetadata(projectPath, branch);
      await writeWorktreeMetadata(projectPath, branch, {
        branch,
        createdAt: metadata?.createdAt || new Date().toISOString(),
        pr: metadata?.pr,
        initScriptRan: true,
        initScriptStatus: 'failed',
        initScriptError: error.message,
      });

      // Emit completion with error
      emitter.emit('worktree:init-completed', {
        projectPath,
        worktreePath,
        branch,
        success: false,
        error: error.message,
      });
    });
  }

  /**
   * Force re-run the worktree initialization script
   * Ignores the initScriptRan flag - useful for testing or re-setup
   */
  async forceRunInitScript(options: InitScriptOptions): Promise<void> {
    const { projectPath, branch } = options;

    // Reset the initScriptRan flag so the script will run
    const metadata = await readWorktreeMetadata(projectPath, branch);
    if (metadata) {
      await writeWorktreeMetadata(projectPath, branch, {
        ...metadata,
        initScriptRan: false,
        initScriptStatus: undefined,
        initScriptError: undefined,
      });
    }

    // Now run the script
    await this.runInitScript(options);
  }
}

// Singleton instance for convenience
let initScriptService: InitScriptService | null = null;

/**
 * Get the singleton InitScriptService instance
 */
export function getInitScriptService(): InitScriptService {
  if (!initScriptService) {
    initScriptService = new InitScriptService();
  }
  return initScriptService;
}

// Export convenience functions that use the singleton
export const getInitScriptPath = (projectPath: string) =>
  getInitScriptService().getInitScriptPath(projectPath);

export const hasInitScriptRun = (projectPath: string, branch: string) =>
  getInitScriptService().hasInitScriptRun(projectPath, branch);

export const runInitScript = (options: InitScriptOptions) =>
  getInitScriptService().runInitScript(options);

export const forceRunInitScript = (options: InitScriptOptions) =>
  getInitScriptService().forceRunInitScript(options);
