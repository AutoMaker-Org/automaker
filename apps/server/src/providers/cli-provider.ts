/**
 * CliProvider - Abstract base class for CLI-based AI providers
 *
 * Provides common infrastructure for CLI tools that spawn subprocesses
 * and stream JSONL output. Handles:
 * - Platform-specific CLI detection (PATH, common locations)
 * - Windows execution strategies (WSL, npx, direct, cmd)
 * - JSONL subprocess spawning and streaming
 * - Error mapping infrastructure
 *
 * @example
 * ```typescript
 * class CursorProvider extends CliProvider {
 *   getCliName(): string { return 'cursor-agent'; }
 *   getSpawnConfig(): CliSpawnConfig {
 *     return {
 *       windowsStrategy: 'wsl',
 *       commonPaths: {
 *         linux: ['~/.local/bin/cursor-agent'],
 *         darwin: ['~/.local/bin/cursor-agent'],
 *       }
 *     };
 *   }
 *   // ... implement abstract methods
 * }
 * ```
 */

import {
  createWslCommand,
  findCliInWsl,
  isWslAvailable,
  spawnJSONLProcess,
  windowsToWslPath,
  type SubprocessOptions,
  type WslCliResult,
} from '@automaker/platform';
import { calculateReasoningTimeout } from '@automaker/types';
import { createLogger, isAbortError } from '@automaker/utils';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BaseProvider } from './base-provider.js';
import type { ExecuteOptions, ProviderConfig, ProviderMessage } from './types.js';

/**
 * Spawn strategy for CLI tools on Windows
 *
 * Different CLI tools require different execution strategies:
 * - 'wsl': Requires WSL, CLI only available on Linux/macOS (e.g., cursor-agent)
 * - 'npx': Installed globally via npm/npx, use `npx <package>` to run
 * - 'direct': Native Windows binary, can spawn directly
 * - 'cmd': Windows batch file (.cmd/.bat), needs cmd.exe shell
 */
export type SpawnStrategy = 'wsl' | 'npx' | 'direct' | 'cmd';

/**
 * Configuration for CLI tool spawning
 */
export interface CliSpawnConfig {
  /** How to spawn on Windows */
  windowsStrategy: SpawnStrategy;

  /** NPX package name (required if windowsStrategy is 'npx') */
  npxPackage?: string;

  /** Preferred WSL distribution (if windowsStrategy is 'wsl') */
  wslDistribution?: string;

  /**
   * Common installation paths per platform
   * Use ~ for home directory (will be expanded)
   * Keys: 'linux', 'darwin', 'win32'
   */
  commonPaths: Record<string, string[]>;

  /** Version check command (defaults to --version) */
  versionCommand?: string;
}

/**
 * CLI error information for consistent error handling
 */
export interface CliErrorInfo {
  code: string;
  message: string;
  recoverable: boolean;
  suggestion?: string;
}

/**
 * Detection result from CLI path finding
 */
export interface CliDetectionResult {
  /** Path to the CLI (or 'npx' for npx strategy) */
  cliPath: string | null;
  /** Whether using WSL mode */
  useWsl: boolean;
  /** WSL path if using WSL */
  wslCliPath?: string;
  /** WSL distribution if using WSL */
  wslDistribution?: string;
  /** Detected strategy used */
  strategy: SpawnStrategy | 'native';
}

// Create logger for CLI operations
const cliLogger = createLogger('CliProvider');

/**
 * Base timeout for CLI operations in milliseconds.
 * CLI tools have longer startup and processing times compared to direct API calls,
 * so we use a higher base timeout (120s) than the default provider timeout (30s).
 * This is multiplied by reasoning effort multipliers when applicable.
 * @see calculateReasoningTimeout from @automaker/types
 */
const CLI_BASE_TIMEOUT_MS = 120000;

/**
 * Abstract base class for CLI-based providers
 *
 * Subclasses must implement:
 * - getCliName(): CLI executable name
 * - getSpawnConfig(): Platform-specific spawn configuration
 * - buildCliArgs(): Convert ExecuteOptions to CLI arguments
 * - normalizeEvent(): Convert CLI output to ProviderMessage
 */
export abstract class CliProvider extends BaseProvider {
  // CLI detection results (cached after first detection)
  protected cliPath: string | null = null;
  protected useWsl: boolean = false;
  protected wslCliPath: string | null = null;
  protected wslDistribution: string | undefined = undefined;
  protected detectedStrategy: SpawnStrategy | 'native' = 'native';

  // NPX args (used when strategy is 'npx')
  protected npxArgs: string[] = [];

  constructor(config: ProviderConfig = {}) {
    super(config);
    // Detection happens lazily on first use
  }

  // ==========================================================================
  // Abstract methods - must be implemented by subclasses
  // ==========================================================================

  /**
   * Get the CLI executable name (e.g., 'cursor-agent', 'aider')
   */
  abstract getCliName(): string;

  /**
   * Get spawn configuration for this CLI
   */
  abstract getSpawnConfig(): CliSpawnConfig;

  /**
   * Build CLI arguments from execution options
   * @param options Execution options
   * @returns Array of CLI arguments
   */
  abstract buildCliArgs(options: ExecuteOptions): string[];

  /**
   * Normalize a raw CLI event to ProviderMessage format
   * @param event Raw event from CLI JSONL output
   * @returns Normalized ProviderMessage or null to skip
   */
  abstract normalizeEvent(event: unknown): ProviderMessage | null;

  // ==========================================================================
  // Optional overrides
  // ==========================================================================

  /**
   * Map CLI stderr/exit code to error info
   * Override to provide CLI-specific error mapping
   */
  protected mapError(stderr: string, exitCode: number | null): CliErrorInfo {
    const lower = stderr.toLowerCase();

    // Common authentication errors
    if (
      lower.includes('not authenticated') ||
      lower.includes('please log in') ||
      lower.includes('unauthorized')
    ) {
      return {
        code: 'NOT_AUTHENTICATED',
        message: `${this.getCliName()} is not authenticated`,
        recoverable: true,
        suggestion: `Run "${this.getCliName()} login" to authenticate`,
      };
    }

    // Rate limiting
    if (
      lower.includes('rate limit') ||
      lower.includes('too many requests') ||
      lower.includes('429')
    ) {
      return {
        code: 'RATE_LIMITED',
        message: 'API rate limit exceeded',
        recoverable: true,
        suggestion: 'Wait a few minutes and try again',
      };
    }

    // Network errors
    if (
      lower.includes('network') ||
      lower.includes('connection') ||
      lower.includes('econnrefused') ||
      lower.includes('timeout')
    ) {
      return {
        code: 'NETWORK_ERROR',
        message: 'Network connection error',
        recoverable: true,
        suggestion: 'Check your internet connection and try again',
      };
    }

    // Process killed
    if (exitCode === 137 || lower.includes('killed') || lower.includes('sigterm')) {
      return {
        code: 'PROCESS_CRASHED',
        message: 'Process was terminated',
        recoverable: true,
        suggestion: 'The process may have run out of memory. Try a simpler task.',
      };
    }

    // Generic error
    return {
      code: 'UNKNOWN_ERROR',
      message: stderr || `Process exited with code ${exitCode}`,
      recoverable: false,
    };
  }

  /**
   * Get installation instructions for this CLI
   * Override to provide CLI-specific instructions
   */
  protected getInstallInstructions(): string {
    const cliName = this.getCliName();
    const config = this.getSpawnConfig();

    if (process.platform === 'win32') {
      switch (config.windowsStrategy) {
        case 'wsl':
          return `${cliName} requires WSL on Windows. Install WSL, then run inside WSL to install.`;
        case 'npx':
          return `Install with: npm install -g ${config.npxPackage || cliName}`;
        case 'cmd':
        case 'direct':
          return `${cliName} is not installed. Check the documentation for installation instructions.`;
      }
    }

    return `${cliName} is not installed. Check the documentation for installation instructions.`;
  }

  // ==========================================================================
  // CLI Detection
  // ==========================================================================

  /**
   * Expand ~ to home directory in path
   */
  private expandPath(p: string): string {
    if (p.startsWith('~')) {
      return path.join(os.homedir(), p.slice(1));
    }
    return p;
  }

  /**
   * Find CLI in PATH using 'which' (Unix) or 'where' (Windows)
   */
  private findCliInPath(): string | null {
    const cliName = this.getCliName();

    try {
      const command = process.platform === 'win32' ? 'where' : 'which';
      const result = execSync(`${command} ${cliName}`, {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      })
        .trim()
        .split('\n')[0];

      if (result && fs.existsSync(result)) {
        cliLogger.debug(`Found ${cliName} in PATH: ${result}`);
        return result;
      }
    } catch {
      // Not in PATH
    }

    return null;
  }

  /**
   * Find CLI in common installation paths for current platform
   */
  private findCliInCommonPaths(): string | null {
    const config = this.getSpawnConfig();
    const cliName = this.getCliName();
    const platform = process.platform as 'linux' | 'darwin' | 'win32';
    const paths = config.commonPaths[platform] || [];

    for (const p of paths) {
      const expandedPath = this.expandPath(p);
      if (fs.existsSync(expandedPath)) {
        cliLogger.debug(`Found ${cliName} at: ${expandedPath}`);
        return expandedPath;
      }
    }

    return null;
  }

  /**
   * Detect CLI installation using appropriate strategy
   */
  protected detectCli(): CliDetectionResult {
    const config = this.getSpawnConfig();
    const cliName = this.getCliName();
    const wslLogger = (msg: string) => cliLogger.debug(msg);

    // Windows - use configured strategy
    if (process.platform === 'win32') {
      switch (config.windowsStrategy) {
        case 'wsl': {
          // Check WSL for CLI
          if (isWslAvailable({ logger: wslLogger })) {
            const wslResult: WslCliResult | null = findCliInWsl(cliName, {
              logger: wslLogger,
              distribution: config.wslDistribution,
            });
            if (wslResult) {
              cliLogger.debug(
                `Using ${cliName} via WSL (${wslResult.distribution || 'default'}): ${wslResult.wslPath}`
              );
              return {
                cliPath: 'wsl.exe',
                useWsl: true,
                wslCliPath: wslResult.wslPath,
                wslDistribution: wslResult.distribution,
                strategy: 'wsl',
              };
            }
          }
          cliLogger.debug(`${cliName} not found (WSL not available or CLI not installed in WSL)`);
          return { cliPath: null, useWsl: false, strategy: 'wsl' };
        }

        case 'npx': {
          // For npx, we don't need to find the CLI, just return npx
          cliLogger.debug(`Using ${cliName} via npx (package: ${config.npxPackage})`);
          return {
            cliPath: 'npx',
            useWsl: false,
            strategy: 'npx',
          };
        }

        case 'direct':
        case 'cmd': {
          // Native Windows - check PATH and common paths
          const pathResult = this.findCliInPath();
          if (pathResult) {
            return { cliPath: pathResult, useWsl: false, strategy: config.windowsStrategy };
          }

          const commonResult = this.findCliInCommonPaths();
          if (commonResult) {
            return { cliPath: commonResult, useWsl: false, strategy: config.windowsStrategy };
          }

          cliLogger.debug(`${cliName} not found on Windows`);
          return { cliPath: null, useWsl: false, strategy: config.windowsStrategy };
        }
      }
    }

    // Linux/macOS - native execution
    const pathResult = this.findCliInPath();
    if (pathResult) {
      return { cliPath: pathResult, useWsl: false, strategy: 'native' };
    }

    const commonResult = this.findCliInCommonPaths();
    if (commonResult) {
      return { cliPath: commonResult, useWsl: false, strategy: 'native' };
    }

    cliLogger.debug(`${cliName} not found`);
    return { cliPath: null, useWsl: false, strategy: 'native' };
  }

  /**
   * Ensure CLI is detected (lazy initialization)
   */
  protected ensureCliDetected(): void {
    if (this.cliPath !== null || this.detectedStrategy !== 'native') {
      return; // Already detected
    }

    const result = this.detectCli();
    this.cliPath = result.cliPath;
    this.useWsl = result.useWsl;
    this.wslCliPath = result.wslCliPath || null;
    this.wslDistribution = result.wslDistribution;
    this.detectedStrategy = result.strategy;

    // Set up npx args if using npx strategy
    const config = this.getSpawnConfig();
    if (result.strategy === 'npx' && config.npxPackage) {
      this.npxArgs = [config.npxPackage];
    }
  }

  /**
   * Check if CLI is installed
   */
  async isInstalled(): Promise<boolean> {
    this.ensureCliDetected();
    return this.cliPath !== null;
  }

  // ==========================================================================
  // Subprocess Spawning
  // ==========================================================================

  /**
   * Build subprocess options based on detected strategy
   */
  protected buildSubprocessOptions(options: ExecuteOptions, cliArgs: string[]): SubprocessOptions {
    this.ensureCliDetected();

    if (!this.cliPath) {
      throw new Error(`${this.getCliName()} CLI not found. ${this.getInstallInstructions()}`);
    }

    const cwd = options.cwd || process.cwd();

    // Filter undefined values from process.env
    const filteredEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        filteredEnv[key] = value;
      }
    }

    // Calculate dynamic timeout based on reasoning effort.
    // This addresses GitHub issue #530 where reasoning models with 'xhigh' effort would timeout.
    const timeout = calculateReasoningTimeout(options.reasoningEffort, CLI_BASE_TIMEOUT_MS);

    // WSL strategy
    if (this.useWsl && this.wslCliPath) {
      const wslCwd = windowsToWslPath(cwd);
      const wslCmd = createWslCommand(this.wslCliPath, cliArgs, {
        distribution: this.wslDistribution,
      });

      // Add --cd flag to change directory inside WSL
      let args: string[];
      if (this.wslDistribution) {
        args = ['-d', this.wslDistribution, '--cd', wslCwd, this.wslCliPath, ...cliArgs];
      } else {
        args = ['--cd', wslCwd, this.wslCliPath, ...cliArgs];
      }

      cliLogger.debug(`WSL spawn: ${wslCmd.command} ${args.slice(0, 6).join(' ')}...`);

      return {
        command: wslCmd.command,
        args,
        cwd, // Windows cwd for spawn
        env: filteredEnv,
        abortController: options.abortController,
        timeout,
      };
    }

    // NPX strategy
    if (this.detectedStrategy === 'npx') {
      const allArgs = [...this.npxArgs, ...cliArgs];
      cliLogger.debug(`NPX spawn: npx ${allArgs.slice(0, 6).join(' ')}...`);

      return {
        command: 'npx',
        args: allArgs,
        cwd,
        env: filteredEnv,
        abortController: options.abortController,
        timeout,
      };
    }

    // Direct strategy (native Unix or Windows direct/cmd)
    cliLogger.debug(`Direct spawn: ${this.cliPath} ${cliArgs.slice(0, 6).join(' ')}...`);

    return {
      command: this.cliPath,
      args: cliArgs,
      cwd,
      env: filteredEnv,
      abortController: options.abortController,
      timeout,
    };
  }

  /**
   * Execute a query using the CLI with JSONL streaming
   *
   * This is a default implementation that:
   * 1. Builds CLI args from options
   * 2. Spawns the subprocess with appropriate strategy
   * 3. Streams and normalizes events
   *
   * Subclasses can override for custom behavior.
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    this.ensureCliDetected();

    if (!this.cliPath) {
      throw new Error(`${this.getCliName()} CLI not found. ${this.getInstallInstructions()}`);
    }

    // Many CLI-based providers do not support a separate "system" message.
    // If a systemPrompt is provided, embed it into the prompt so downstream models
    // still receive critical formatting/schema instructions (e.g., JSON-only outputs).
    const effectiveOptions = this.embedSystemPromptIntoPrompt(options);

    const cliArgs = this.buildCliArgs(effectiveOptions);
    const subprocessOptions = this.buildSubprocessOptions(effectiveOptions, cliArgs);

    try {
      for await (const rawEvent of spawnJSONLProcess(subprocessOptions)) {
        const normalized = this.normalizeEvent(rawEvent);
        if (normalized) {
          yield normalized;
        }
      }
    } catch (error) {
      if (isAbortError(error)) {
        cliLogger.debug('Query aborted');
        return;
      }

      // Map CLI errors
      if (error instanceof Error && 'stderr' in error) {
        const errorInfo = this.mapError(
          (error as { stderr?: string }).stderr || error.message,
          (error as { exitCode?: number | null }).exitCode ?? null
        );

        const cliError = new Error(errorInfo.message) as Error & CliErrorInfo;
        cliError.code = errorInfo.code;
        cliError.recoverable = errorInfo.recoverable;
        cliError.suggestion = errorInfo.suggestion;
        throw cliError;
      }

      throw error;
    }
  }

  /**
   * Embed system prompt text into the user prompt for CLI providers.
   *
   * Most CLI providers we integrate with only accept a single prompt via stdin/args.
   * When upstream code supplies `options.systemPrompt`, we prepend it to the prompt
   * content and clear `systemPrompt` to avoid any accidental double-injection by
   * subclasses.
   */
  protected embedSystemPromptIntoPrompt(options: ExecuteOptions): ExecuteOptions {
    if (!options.systemPrompt) {
      return options;
    }

    // Only string system prompts can be reliably embedded for CLI providers.
    // Presets are provider-specific (e.g., Claude SDK) and cannot be represented
    // universally. If a preset is provided, we only embed its optional `append`.
    const systemText =
      typeof options.systemPrompt === 'string'
        ? options.systemPrompt
        : options.systemPrompt.append
          ? options.systemPrompt.append
          : '';

    if (!systemText) {
      return { ...options, systemPrompt: undefined };
    }

    // Preserve original prompt structure.
    if (typeof options.prompt === 'string') {
      return {
        ...options,
        prompt: `${systemText}\n\n---\n\n${options.prompt}`,
        systemPrompt: undefined,
      };
    }

    if (Array.isArray(options.prompt)) {
      return {
        ...options,
        prompt: [{ type: 'text', text: systemText }, ...options.prompt],
        systemPrompt: undefined,
      };
    }

    // Should be unreachable due to ExecuteOptions typing, but keep safe.
    return { ...options, systemPrompt: undefined };
  }
}
