/**
 * Copilot Provider - Executes queries using the GitHub Copilot SDK
 *
 * Extends CliProvider with Copilot-specific:
 * - SDK-based execution via JSON-RPC over CLI
 * - GitHub OAuth authentication support
 * - Tool call normalization for AutoMaker UI
 *
 * Based on https://github.com/github/copilot-sdk
 */

import { execSync, spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { CliProvider, type CliSpawnConfig, type CliErrorInfo } from './cli-provider.js';
import type {
  ProviderConfig,
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
} from './types.js';
import { validateBareModelId } from '@automaker/types';
import {
  COPILOT_MODEL_MAP,
  type CopilotAuthStatus,
  type CopilotRuntimeModel,
} from '@automaker/types';
import { createLogger, isAbortError } from '@automaker/utils';
import { spawnJSONLProcess } from '@automaker/platform';

// Create logger for this module
const logger = createLogger('CopilotProvider');

// =============================================================================
// Copilot Stream Event Types (SDK JSON-RPC output)
// =============================================================================

/**
 * Base event structure from Copilot SDK JSON-RPC
 *
 * The SDK operates the Copilot CLI in server mode, communicating via JSON-RPC.
 * Events are streamed as JSONL.
 */
interface CopilotStreamEvent {
  type:
    | 'session.start'
    | 'assistant.message'
    | 'tool.use'
    | 'tool.result'
    | 'session.idle'
    | 'session.error'
    | 'error';
  sessionId?: string;
  timestamp?: string;
}

interface CopilotSessionStartEvent extends CopilotStreamEvent {
  type: 'session.start';
  sessionId: string;
  model?: string;
}

interface CopilotMessageEvent extends CopilotStreamEvent {
  type: 'assistant.message';
  content: string;
  delta?: boolean;
}

interface CopilotToolUseEvent extends CopilotStreamEvent {
  type: 'tool.use';
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

interface CopilotToolResultEvent extends CopilotStreamEvent {
  type: 'tool.result';
  toolCallId: string;
  resultType: 'success' | 'failure' | 'rejected' | 'denied';
  content?: string;
  error?: string;
}

interface CopilotIdleEvent extends CopilotStreamEvent {
  type: 'session.idle';
}

interface CopilotErrorEvent extends CopilotStreamEvent {
  type: 'session.error' | 'error';
  error: string;
  code?: string;
}

// =============================================================================
// Error Codes
// =============================================================================

export enum CopilotErrorCode {
  NOT_INSTALLED = 'COPILOT_NOT_INSTALLED',
  NOT_AUTHENTICATED = 'COPILOT_NOT_AUTHENTICATED',
  RATE_LIMITED = 'COPILOT_RATE_LIMITED',
  MODEL_UNAVAILABLE = 'COPILOT_MODEL_UNAVAILABLE',
  NETWORK_ERROR = 'COPILOT_NETWORK_ERROR',
  PROCESS_CRASHED = 'COPILOT_PROCESS_CRASHED',
  TIMEOUT = 'COPILOT_TIMEOUT',
  SDK_ERROR = 'COPILOT_SDK_ERROR',
  UNKNOWN = 'COPILOT_UNKNOWN_ERROR',
}

export interface CopilotError extends Error {
  code: CopilotErrorCode;
  recoverable: boolean;
  suggestion?: string;
}

// =============================================================================
// Tool Name Normalization
// =============================================================================

/**
 * Copilot SDK tool name to standard tool name mapping
 * The SDK uses standard tool names similar to Claude, but we normalize for consistency
 */
const COPILOT_TOOL_NAME_MAP: Record<string, string> = {
  // File operations
  read_file: 'Read',
  read: 'Read',
  write_file: 'Write',
  write: 'Write',
  edit_file: 'Edit',
  edit: 'Edit',
  // Shell operations
  run_shell: 'Bash',
  shell: 'Bash',
  bash: 'Bash',
  execute: 'Bash',
  // Search operations
  search: 'Grep',
  grep: 'Grep',
  find_files: 'Glob',
  glob: 'Glob',
  list_dir: 'Ls',
  ls: 'Ls',
  // Web operations
  web_fetch: 'WebFetch',
  fetch: 'WebFetch',
  web_search: 'WebSearch',
  search_web: 'WebSearch',
  // Todo operations
  todo_write: 'TodoWrite',
  write_todos: 'TodoWrite',
  update_todos: 'TodoWrite',
};

/**
 * Normalize Copilot tool names to standard tool names
 */
function normalizeCopilotToolName(copilotToolName: string): string {
  const lowerName = copilotToolName.toLowerCase();
  return COPILOT_TOOL_NAME_MAP[lowerName] || copilotToolName;
}

/**
 * Normalize Copilot tool input parameters to standard format
 *
 * Copilot SDK uses similar formats to Claude, but with potential variations
 */
function normalizeCopilotToolInput(
  toolName: string,
  input: Record<string, unknown>
): Record<string, unknown> {
  const normalizedName = normalizeCopilotToolName(toolName);

  // Normalize todo_write / write_todos: ensure proper format
  if (normalizedName === 'TodoWrite' && Array.isArray(input.todos)) {
    return {
      todos: input.todos.map((todo: { description?: string; content?: string; status?: string }) => ({
        content: todo.content || todo.description || '',
        status: todo.status === 'cancelled' ? 'completed' : todo.status || 'pending',
        activeForm: todo.content || todo.description || '',
      })),
    };
  }

  // Normalize file path parameters
  if (normalizedName === 'Read' || normalizedName === 'Write' || normalizedName === 'Edit') {
    if (input.path && !input.file_path) {
      return { ...input, file_path: input.path };
    }
  }

  return input;
}

/**
 * CopilotProvider - Integrates GitHub Copilot SDK as an AI provider
 *
 * Features:
 * - GitHub OAuth authentication
 * - JSON-RPC communication with Copilot CLI
 * - Runtime model discovery
 * - Tool call normalization
 * - Streaming responses
 */
export class CopilotProvider extends CliProvider {
  private runtimeModels: CopilotRuntimeModel[] | null = null;

  constructor(config: ProviderConfig = {}) {
    super(config);
    // Trigger CLI detection on construction
    this.ensureCliDetected();
  }

  // ==========================================================================
  // CliProvider Abstract Method Implementations
  // ==========================================================================

  getName(): string {
    return 'copilot';
  }

  getCliName(): string {
    return 'copilot';
  }

  getSpawnConfig(): CliSpawnConfig {
    return {
      windowsStrategy: 'npx', // Copilot CLI can be run via npx
      npxPackage: '@github/copilot-sdk', // Official GitHub Copilot SDK package
      commonPaths: {
        linux: [
          path.join(os.homedir(), '.local/bin/copilot'),
          '/usr/local/bin/copilot',
          path.join(os.homedir(), '.npm-global/bin/copilot'),
        ],
        darwin: [
          path.join(os.homedir(), '.local/bin/copilot'),
          '/usr/local/bin/copilot',
          '/opt/homebrew/bin/copilot',
          path.join(os.homedir(), '.npm-global/bin/copilot'),
        ],
        win32: [
          path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'copilot.cmd'),
          path.join(os.homedir(), '.npm-global', 'copilot.cmd'),
        ],
      },
    };
  }

  /**
   * Extract prompt text from ExecuteOptions
   */
  private extractPromptText(options: ExecuteOptions): string {
    if (typeof options.prompt === 'string') {
      return options.prompt;
    } else if (Array.isArray(options.prompt)) {
      return options.prompt
        .filter((p) => p.type === 'text' && p.text)
        .map((p) => p.text)
        .join('\n');
    } else {
      throw new Error('Invalid prompt format');
    }
  }

  buildCliArgs(options: ExecuteOptions): string[] {
    // Model comes in stripped of provider prefix (e.g., 'gpt-4o' from 'copilot-gpt-4o')
    const bareModel = options.model || 'gpt-4o';
    const cliArgs: string[] = [];

    // Use server mode for JSON-RPC communication
    cliArgs.push('--mode', 'server');

    // Streaming JSON output format
    cliArgs.push('--output-format', 'jsonl');

    // Model selection
    if (bareModel && bareModel !== 'auto') {
      cliArgs.push('--model', bareModel);
    }

    // Enable all first-party tools (equivalent to --allow-all)
    cliArgs.push('--tools', 'all');

    // Set working directory for file operations
    if (options.cwd) {
      cliArgs.push('--cwd', options.cwd);
    }

    return cliArgs;
  }

  /**
   * Convert Copilot event to AutoMaker ProviderMessage format
   */
  normalizeEvent(event: unknown): ProviderMessage | null {
    const copilotEvent = event as CopilotStreamEvent;

    switch (copilotEvent.type) {
      case 'session.start': {
        const startEvent = copilotEvent as CopilotSessionStartEvent;
        logger.debug(
          `Copilot session start: sessionId=${startEvent.sessionId}, model=${startEvent.model}`
        );
        return null; // Session start is internal
      }

      case 'assistant.message': {
        const messageEvent = copilotEvent as CopilotMessageEvent;
        return {
          type: 'assistant',
          session_id: copilotEvent.sessionId,
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: messageEvent.content }],
          },
        };
      }

      case 'tool.use': {
        const toolEvent = copilotEvent as CopilotToolUseEvent;
        const normalizedName = normalizeCopilotToolName(toolEvent.toolName);
        const normalizedInput = normalizeCopilotToolInput(
          toolEvent.toolName,
          toolEvent.arguments as Record<string, unknown>
        );

        return {
          type: 'assistant',
          session_id: copilotEvent.sessionId,
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                name: normalizedName,
                tool_use_id: toolEvent.toolCallId,
                input: normalizedInput,
              },
            ],
          },
        };
      }

      case 'tool.result': {
        const toolResultEvent = copilotEvent as CopilotToolResultEvent;
        const isError =
          toolResultEvent.resultType === 'failure' || toolResultEvent.resultType === 'rejected';
        const content = isError
          ? `[ERROR] ${toolResultEvent.error || toolResultEvent.content || 'Tool failed'}`
          : toolResultEvent.content || '';

        return {
          type: 'assistant',
          session_id: copilotEvent.sessionId,
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_result',
                tool_use_id: toolResultEvent.toolCallId,
                content,
              },
            ],
          },
        };
      }

      case 'session.idle': {
        logger.debug('Copilot session idle');
        return {
          type: 'result',
          subtype: 'success',
          session_id: copilotEvent.sessionId,
        };
      }

      case 'session.error':
      case 'error': {
        const errorEvent = copilotEvent as CopilotErrorEvent;
        return {
          type: 'error',
          session_id: copilotEvent.sessionId,
          error: errorEvent.error || 'Unknown error',
        };
      }

      default:
        logger.debug(`Unknown Copilot event type: ${copilotEvent.type}`);
        return null;
    }
  }

  // ==========================================================================
  // CliProvider Overrides
  // ==========================================================================

  /**
   * Override error mapping for Copilot-specific error codes
   */
  protected mapError(stderr: string, exitCode: number | null): CliErrorInfo {
    const lower = stderr.toLowerCase();

    if (
      lower.includes('not authenticated') ||
      lower.includes('please log in') ||
      lower.includes('unauthorized') ||
      lower.includes('login required') ||
      lower.includes('authentication required') ||
      lower.includes('github login')
    ) {
      return {
        code: CopilotErrorCode.NOT_AUTHENTICATED,
        message: 'GitHub Copilot is not authenticated',
        recoverable: true,
        suggestion:
          'Run "gh auth login" or "copilot auth login" to authenticate with GitHub',
      };
    }

    if (
      lower.includes('rate limit') ||
      lower.includes('too many requests') ||
      lower.includes('429') ||
      lower.includes('quota exceeded')
    ) {
      return {
        code: CopilotErrorCode.RATE_LIMITED,
        message: 'Copilot API rate limit exceeded',
        recoverable: true,
        suggestion: 'Wait a few minutes and try again',
      };
    }

    if (
      lower.includes('model not available') ||
      lower.includes('invalid model') ||
      lower.includes('unknown model') ||
      lower.includes('model not found') ||
      lower.includes('not found') && lower.includes('404')
    ) {
      return {
        code: CopilotErrorCode.MODEL_UNAVAILABLE,
        message: 'Requested model is not available',
        recoverable: true,
        suggestion: 'Try using "gpt-4o" or select a different model',
      };
    }

    if (
      lower.includes('network') ||
      lower.includes('connection') ||
      lower.includes('econnrefused') ||
      lower.includes('timeout')
    ) {
      return {
        code: CopilotErrorCode.NETWORK_ERROR,
        message: 'Network connection error',
        recoverable: true,
        suggestion: 'Check your internet connection and try again',
      };
    }

    if (exitCode === 137 || lower.includes('killed') || lower.includes('sigterm')) {
      return {
        code: CopilotErrorCode.PROCESS_CRASHED,
        message: 'Copilot CLI process was terminated',
        recoverable: true,
        suggestion: 'The process may have run out of memory. Try a simpler task.',
      };
    }

    return {
      code: CopilotErrorCode.UNKNOWN,
      message: stderr || `Copilot CLI exited with code ${exitCode}`,
      recoverable: false,
    };
  }

  /**
   * Override install instructions for Copilot-specific guidance
   */
  protected getInstallInstructions(): string {
    return 'Install with: npm install -g @github/copilot-sdk (or visit https://github.com/github/copilot-sdk)';
  }

  /**
   * Execute a prompt using Copilot SDK with streaming
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    this.ensureCliDetected();

    // Validate that model doesn't have a provider prefix
    validateBareModelId(options.model, 'CopilotProvider');

    if (!this.cliPath) {
      throw this.createError(
        CopilotErrorCode.NOT_INSTALLED,
        'Copilot CLI is not installed',
        true,
        this.getInstallInstructions()
      );
    }

    // Extract prompt text to pass as positional argument
    const promptText = this.extractPromptText(options);

    // Build CLI args and append the prompt
    const cliArgs = this.buildCliArgs(options);
    cliArgs.push('--prompt', promptText);

    const subprocessOptions = this.buildSubprocessOptions(options, cliArgs);

    let sessionId: string | undefined;

    logger.debug(`CopilotProvider.executeQuery called with model: "${options.model}"`);

    try {
      for await (const rawEvent of spawnJSONLProcess(subprocessOptions)) {
        const event = rawEvent as CopilotStreamEvent;

        // Capture session ID from start event
        if (event.type === 'session.start') {
          const startEvent = event as CopilotSessionStartEvent;
          sessionId = startEvent.sessionId;
          logger.debug(`Session started: ${sessionId}, model: ${startEvent.model}`);
        }

        // Normalize and yield the event
        const normalized = this.normalizeEvent(event);
        if (normalized) {
          if (!normalized.session_id && sessionId) {
            normalized.session_id = sessionId;
          }
          yield normalized;
        }
      }
    } catch (error) {
      if (isAbortError(error)) {
        logger.debug('Query aborted');
        return;
      }

      // Map CLI errors to CopilotError
      if (error instanceof Error && 'stderr' in error) {
        const errorInfo = this.mapError(
          (error as { stderr?: string }).stderr || error.message,
          (error as { exitCode?: number | null }).exitCode ?? null
        );
        throw this.createError(
          errorInfo.code as CopilotErrorCode,
          errorInfo.message,
          errorInfo.recoverable,
          errorInfo.suggestion
        );
      }
      throw error;
    }
  }

  // ==========================================================================
  // Copilot-Specific Methods
  // ==========================================================================

  /**
   * Create a CopilotError with details
   */
  private createError(
    code: CopilotErrorCode,
    message: string,
    recoverable: boolean = false,
    suggestion?: string
  ): CopilotError {
    const error = new Error(message) as CopilotError;
    error.code = code;
    error.recoverable = recoverable;
    error.suggestion = suggestion;
    error.name = 'CopilotError';
    return error;
  }

  /**
   * Get Copilot CLI version
   */
  async getVersion(): Promise<string | null> {
    this.ensureCliDetected();
    if (!this.cliPath) return null;

    try {
      const result = execSync(`"${this.cliPath}" --version`, {
        encoding: 'utf8',
        timeout: 5000,
        stdio: 'pipe',
      }).trim();
      return result;
    } catch {
      return null;
    }
  }

  /**
   * Check authentication status
   *
   * Uses GitHub CLI (gh) to check Copilot authentication status.
   * The Copilot SDK relies on gh auth for authentication.
   */
  async checkAuth(): Promise<CopilotAuthStatus> {
    this.ensureCliDetected();
    if (!this.cliPath) {
      logger.debug('checkAuth: CLI not found');
      return { authenticated: false, method: 'none' };
    }

    logger.debug('checkAuth: Starting credential check');

    // Try to check GitHub CLI authentication status first
    // The Copilot SDK uses gh auth for authentication
    try {
      const ghStatus = execSync('gh auth status --hostname github.com', {
        encoding: 'utf8',
        timeout: 10000,
        stdio: 'pipe',
      });

      logger.debug(`checkAuth: gh auth status output: ${ghStatus.substring(0, 200)}`);

      // Parse gh auth status output
      const loggedInMatch = ghStatus.match(/Logged in to github\.com account (\S+)/);
      if (loggedInMatch) {
        return {
          authenticated: true,
          method: 'oauth',
          login: loggedInMatch[1],
          host: 'github.com',
        };
      }

      // Check for token auth
      if (ghStatus.includes('Logged in') || ghStatus.includes('Token:')) {
        return {
          authenticated: true,
          method: 'oauth',
          host: 'github.com',
        };
      }
    } catch (ghError) {
      logger.debug(`checkAuth: gh auth status failed: ${ghError}`);
    }

    // Try Copilot-specific auth check if gh is not available
    try {
      const result = execSync(`"${this.cliPath}" auth status`, {
        encoding: 'utf8',
        timeout: 10000,
        stdio: 'pipe',
      });

      logger.debug(`checkAuth: copilot auth status output: ${result.substring(0, 200)}`);

      if (result.includes('authenticated') || result.includes('logged in')) {
        return {
          authenticated: true,
          method: 'cli',
        };
      }
    } catch (copilotError) {
      logger.debug(`checkAuth: copilot auth status failed: ${copilotError}`);
    }

    // Check for GITHUB_TOKEN environment variable
    if (process.env.GITHUB_TOKEN) {
      logger.debug('checkAuth: Found GITHUB_TOKEN environment variable');
      return {
        authenticated: true,
        method: 'oauth',
        statusMessage: 'Using GITHUB_TOKEN environment variable',
      };
    }

    // Check for gh config file
    const ghConfigPath = path.join(os.homedir(), '.config', 'gh', 'hosts.yml');
    try {
      await fs.access(ghConfigPath);
      const content = await fs.readFile(ghConfigPath, 'utf8');
      if (content.includes('github.com') && content.includes('oauth_token')) {
        logger.debug('checkAuth: Found gh config with oauth_token');
        return {
          authenticated: true,
          method: 'oauth',
          host: 'github.com',
        };
      }
    } catch {
      logger.debug('checkAuth: No gh config found');
    }

    // No credentials found
    logger.debug('checkAuth: No valid credentials found');
    return {
      authenticated: false,
      method: 'none',
      error:
        'No authentication configured. Run "gh auth login" or install GitHub Copilot extension.',
    };
  }

  /**
   * Fetch available models from the SDK at runtime
   */
  async fetchRuntimeModels(): Promise<CopilotRuntimeModel[]> {
    this.ensureCliDetected();
    if (!this.cliPath) {
      return [];
    }

    try {
      // Try to list models using the SDK
      const result = execSync(`"${this.cliPath}" models list --format json`, {
        encoding: 'utf8',
        timeout: 15000,
        stdio: 'pipe',
      });

      const models = JSON.parse(result) as CopilotRuntimeModel[];
      this.runtimeModels = models;
      logger.debug(`Fetched ${models.length} runtime models from Copilot SDK`);
      return models;
    } catch (error) {
      logger.debug(`Failed to fetch runtime models: ${error}`);
      return [];
    }
  }

  /**
   * Detect installation status (required by BaseProvider)
   */
  async detectInstallation(): Promise<InstallationStatus> {
    const installed = await this.isInstalled();
    const version = installed ? await this.getVersion() : undefined;
    const auth = await this.checkAuth();

    return {
      installed,
      version: version || undefined,
      path: this.cliPath || undefined,
      method: 'cli',
      authenticated: auth.authenticated,
    };
  }

  /**
   * Get the detected CLI path (public accessor for status endpoints)
   */
  getCliPath(): string | null {
    this.ensureCliDetected();
    return this.cliPath;
  }

  /**
   * Get available Copilot models
   *
   * Returns both static model definitions and runtime-discovered models
   */
  getAvailableModels(): ModelDefinition[] {
    // Start with static model definitions - explicitly typed to allow runtime models
    const staticModels: ModelDefinition[] = Object.entries(COPILOT_MODEL_MAP).map(
      ([id, config]) => ({
        id, // Full model ID with copilot- prefix
        name: config.label,
        modelString: id.replace('copilot-', ''), // Bare model for SDK
        provider: 'copilot',
        description: config.description,
        supportsTools: config.supportsTools,
        supportsVision: config.supportsVision,
        contextWindow: config.contextWindow,
      })
    );

    // Add runtime models if available (discovered via SDK)
    if (this.runtimeModels) {
      for (const runtimeModel of this.runtimeModels) {
        // Skip if already in static list
        const staticId = `copilot-${runtimeModel.id}`;
        if (staticModels.some((m) => m.id === staticId)) {
          continue;
        }

        staticModels.push({
          id: staticId,
          name: runtimeModel.name || runtimeModel.id,
          modelString: runtimeModel.id,
          provider: 'copilot',
          description: `Dynamic model: ${runtimeModel.name || runtimeModel.id}`,
          supportsTools: true,
          supportsVision: runtimeModel.capabilities?.supportsVision ?? false,
          contextWindow: runtimeModel.capabilities?.maxInputTokens,
        });
      }
    }

    return staticModels;
  }

  /**
   * Check if a feature is supported
   */
  supportsFeature(feature: string): boolean {
    const supported = ['tools', 'text', 'streaming', 'vision'];
    return supported.includes(feature);
  }
}
