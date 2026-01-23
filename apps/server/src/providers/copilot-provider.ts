/**
 * Copilot Provider - Executes queries using the GitHub Copilot SDK
 *
 * Uses the official @github/copilot-sdk for:
 * - Session management and streaming responses
 * - GitHub OAuth authentication (via gh CLI)
 * - Tool call handling and permission management
 * - Runtime model discovery
 *
 * Based on https://github.com/github/copilot-sdk
 */

import { execSync } from 'child_process';
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
// Note: validateBareModelId is not used because Copilot's bare model IDs
// legitimately contain prefixes like claude-, gemini-, gpt-
import {
  COPILOT_MODEL_MAP,
  type CopilotAuthStatus,
  type CopilotRuntimeModel,
} from '@automaker/types';
import { createLogger, isAbortError } from '@automaker/utils';
import { CopilotClient, type PermissionRequest } from '@github/copilot-sdk';
import {
  normalizeTodos,
  normalizeFilePathInput,
  normalizeCommandInput,
  normalizePatternInput,
} from './tool-normalization.js';

// Create logger for this module
const logger = createLogger('CopilotProvider');

// Default bare model (without copilot- prefix) for SDK calls
const DEFAULT_BARE_MODEL = 'claude-sonnet-4.5';

// =============================================================================
// SDK Event Types (from @github/copilot-sdk)
// =============================================================================

/**
 * SDK session event data types
 */
interface SdkEvent {
  type: string;
  data?: unknown;
}

interface SdkMessageEvent extends SdkEvent {
  type: 'assistant.message';
  data: {
    content: string;
  };
}

// Note: SdkMessageDeltaEvent is not used - we skip delta events to reduce noise
// The final assistant.message event contains the complete content

interface SdkToolExecutionStartEvent extends SdkEvent {
  type: 'tool.execution_start';
  data: {
    toolName: string;
    toolCallId: string;
    input?: Record<string, unknown>;
  };
}

interface SdkToolExecutionEndEvent extends SdkEvent {
  type: 'tool.execution_end';
  data: {
    toolName: string;
    toolCallId: string;
    result?: string;
    error?: string;
  };
}

interface SdkSessionIdleEvent extends SdkEvent {
  type: 'session.idle';
}

interface SdkSessionErrorEvent extends SdkEvent {
  type: 'session.error';
  data: {
    message: string;
    code?: string;
  };
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
  CLI_ERROR = 'COPILOT_CLI_ERROR',
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
 *
 * Maps Copilot CLI tool names to our standard tool names for consistent UI display.
 * Tool names are case-insensitive (normalized to lowercase before lookup).
 */
const COPILOT_TOOL_NAME_MAP: Record<string, string> = {
  // File operations
  read_file: 'Read',
  read: 'Read',
  view: 'Read', // Copilot uses 'view' for reading files
  read_many_files: 'Read',
  write_file: 'Write',
  write: 'Write',
  create_file: 'Write',
  edit_file: 'Edit',
  edit: 'Edit',
  replace: 'Edit',
  patch: 'Edit',
  // Shell operations
  run_shell: 'Bash',
  run_shell_command: 'Bash',
  shell: 'Bash',
  bash: 'Bash',
  execute: 'Bash',
  terminal: 'Bash',
  // Search operations
  search: 'Grep',
  grep: 'Grep',
  search_file_content: 'Grep',
  find_files: 'Glob',
  glob: 'Glob',
  list_dir: 'Ls',
  list_directory: 'Ls',
  ls: 'Ls',
  // Web operations
  web_fetch: 'WebFetch',
  fetch: 'WebFetch',
  web_search: 'WebSearch',
  search_web: 'WebSearch',
  google_web_search: 'WebSearch',
  // Todo operations
  todo_write: 'TodoWrite',
  write_todos: 'TodoWrite',
  update_todos: 'TodoWrite',
  // Planning/intent operations (Copilot-specific)
  report_intent: 'ReportIntent', // Keep as-is, it's a planning tool
  think: 'Think',
  plan: 'Plan',
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
 * Maps Copilot's parameter names to our standard parameter names.
 * Uses shared utilities from tool-normalization.ts for common normalizations.
 */
function normalizeCopilotToolInput(
  toolName: string,
  input: Record<string, unknown>
): Record<string, unknown> {
  const normalizedName = normalizeCopilotToolName(toolName);

  // Normalize todo_write / write_todos: ensure proper format
  if (normalizedName === 'TodoWrite' && Array.isArray(input.todos)) {
    return { todos: normalizeTodos(input.todos) };
  }

  // Normalize file path parameters for Read/Write/Edit tools
  if (normalizedName === 'Read' || normalizedName === 'Write' || normalizedName === 'Edit') {
    return normalizeFilePathInput(input);
  }

  // Normalize shell command parameters for Bash tool
  if (normalizedName === 'Bash') {
    return normalizeCommandInput(input);
  }

  // Normalize search parameters for Grep tool
  if (normalizedName === 'Grep') {
    return normalizePatternInput(input);
  }

  return input;
}

/**
 * CopilotProvider - Integrates GitHub Copilot SDK as an AI provider
 *
 * Features:
 * - GitHub OAuth authentication
 * - SDK-based session management
 * - Runtime model discovery
 * - Tool call normalization
 * - Per-execution working directory support
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
      npxPackage: '@github/copilot', // Official GitHub Copilot CLI package
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
   *
   * Note: CopilotProvider does not yet support vision/image inputs.
   * If non-text content is provided, an error is thrown.
   */
  private extractPromptText(options: ExecuteOptions): string {
    if (typeof options.prompt === 'string') {
      return options.prompt;
    } else if (Array.isArray(options.prompt)) {
      // Check for non-text content (images, etc.) which we don't support yet
      const hasNonText = options.prompt.some((p) => p.type !== 'text');
      if (hasNonText) {
        throw new Error(
          'CopilotProvider does not yet support non-text prompt parts (e.g., images). ' +
            'Please use text-only prompts or switch to a provider that supports vision.'
        );
      }
      return options.prompt
        .filter((p) => p.type === 'text' && p.text)
        .map((p) => p.text)
        .join('\n');
    } else {
      throw new Error('Invalid prompt format');
    }
  }

  /**
   * Not used with SDK approach - kept for interface compatibility
   */
  buildCliArgs(_options: ExecuteOptions): string[] {
    return [];
  }

  /**
   * Convert SDK event to AutoMaker ProviderMessage format
   */
  normalizeEvent(event: unknown): ProviderMessage | null {
    const sdkEvent = event as SdkEvent;

    switch (sdkEvent.type) {
      case 'assistant.message': {
        const messageEvent = sdkEvent as SdkMessageEvent;
        return {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: messageEvent.data.content }],
          },
        };
      }

      case 'assistant.message_delta': {
        // Skip delta events - they create too much noise
        // The final assistant.message event has the complete content
        return null;
      }

      case 'tool.execution_start': {
        const toolEvent = sdkEvent as SdkToolExecutionStartEvent;
        const normalizedName = normalizeCopilotToolName(toolEvent.data.toolName);
        const normalizedInput = toolEvent.data.input
          ? normalizeCopilotToolInput(toolEvent.data.toolName, toolEvent.data.input)
          : {};

        return {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                name: normalizedName,
                tool_use_id: toolEvent.data.toolCallId,
                input: normalizedInput,
              },
            ],
          },
        };
      }

      case 'tool.execution_end': {
        const toolResultEvent = sdkEvent as SdkToolExecutionEndEvent;
        const isError = !!toolResultEvent.data.error;
        const content = isError
          ? `[ERROR] ${toolResultEvent.data.error}`
          : toolResultEvent.data.result || '';

        return {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_result',
                tool_use_id: toolResultEvent.data.toolCallId,
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
        };
      }

      case 'session.error': {
        const errorEvent = sdkEvent as SdkSessionErrorEvent;
        return {
          type: 'error',
          error: errorEvent.data.message || 'Unknown error',
        };
      }

      default:
        logger.debug(`Unknown Copilot SDK event type: ${sdkEvent.type}`);
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
        suggestion: 'Run "gh auth login" or "copilot auth login" to authenticate with GitHub',
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
      (lower.includes('not found') && lower.includes('404'))
    ) {
      return {
        code: CopilotErrorCode.MODEL_UNAVAILABLE,
        message: 'Requested model is not available',
        recoverable: true,
        suggestion: `Try using "${DEFAULT_BARE_MODEL}" or select a different model`,
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
    return 'Install with: npm install -g @github/copilot (or visit https://github.com/github/copilot)';
  }

  /**
   * Execute a prompt using Copilot SDK with real-time streaming
   *
   * Creates a new CopilotClient for each execution with the correct working directory.
   * Streams tool execution events in real-time for UI display.
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    this.ensureCliDetected();

    // Note: We don't use validateBareModelId here because Copilot's model IDs
    // legitimately contain prefixes like claude-, gemini-, gpt- which are the
    // actual model names from the Copilot CLI. We only need to ensure the
    // copilot- prefix has been stripped by the ProviderFactory.
    if (options.model?.startsWith('copilot-')) {
      throw new Error(
        `[CopilotProvider] Model ID should not have 'copilot-' prefix. Got: '${options.model}'. ` +
          `The ProviderFactory should strip this prefix before passing to the provider.`
      );
    }

    if (!this.cliPath) {
      throw this.createError(
        CopilotErrorCode.NOT_INSTALLED,
        'Copilot CLI is not installed',
        true,
        this.getInstallInstructions()
      );
    }

    const promptText = this.extractPromptText(options);
    const bareModel = options.model || DEFAULT_BARE_MODEL;
    const workingDirectory = options.cwd || process.cwd();

    logger.debug(
      `CopilotProvider.executeQuery called with model: "${bareModel}", cwd: "${workingDirectory}"`
    );
    logger.debug(`Prompt length: ${promptText.length} characters`);

    // Create a client for this execution with the correct working directory
    const client = new CopilotClient({
      logLevel: 'warning',
      autoRestart: false,
      cwd: workingDirectory,
    });

    // Use an async queue to bridge callback-based SDK events to async generator
    const eventQueue: SdkEvent[] = [];
    let resolveWaiting: (() => void) | null = null;
    let sessionComplete = false;
    let sessionError: Error | null = null;

    const pushEvent = (event: SdkEvent) => {
      eventQueue.push(event);
      if (resolveWaiting) {
        resolveWaiting();
        resolveWaiting = null;
      }
    };

    const waitForEvent = (): Promise<void> => {
      if (eventQueue.length > 0 || sessionComplete) {
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        resolveWaiting = resolve;
      });
    };

    try {
      await client.start();
      logger.debug(`CopilotClient started with cwd: ${workingDirectory}`);

      // Create session with streaming enabled for real-time events
      const session = await client.createSession({
        model: bareModel,
        streaming: true,
        // AUTONOMOUS MODE: Auto-approve all permission requests.
        // AutoMaker is designed for fully autonomous AI agent operation.
        // Security boundary is provided by Docker containerization (see CLAUDE.md).
        // User is warned about this at app startup.
        onPermissionRequest: async (
          request: PermissionRequest
        ): Promise<{ kind: 'approved' } | { kind: 'denied-interactively-by-user' }> => {
          logger.debug(`Permission request: ${request.kind}`);
          return { kind: 'approved' };
        },
      });

      const sessionId = session.sessionId;
      logger.debug(`Session created: ${sessionId}`);

      // Set up event handler to push events to queue
      session.on((event: SdkEvent) => {
        logger.debug(`SDK event: ${event.type}`);

        if (event.type === 'session.idle') {
          sessionComplete = true;
          pushEvent(event);
        } else if (event.type === 'session.error') {
          const errorEvent = event as SdkSessionErrorEvent;
          sessionError = new Error(errorEvent.data.message);
          sessionComplete = true;
          pushEvent(event);
        } else {
          // Push all other events (tool.execution_start, tool.execution_end, assistant.message, etc.)
          pushEvent(event);
        }
      });

      // Send the prompt (non-blocking)
      await session.send({ prompt: promptText });

      // Process events as they arrive
      while (!sessionComplete || eventQueue.length > 0) {
        await waitForEvent();

        // Check for errors first (before processing events to avoid race condition)
        if (sessionError) {
          await session.destroy();
          await client.stop();
          throw sessionError;
        }

        // Process all queued events
        while (eventQueue.length > 0) {
          const event = eventQueue.shift()!;
          const normalized = this.normalizeEvent(event);
          if (normalized) {
            // Add session_id if not present
            if (!normalized.session_id) {
              normalized.session_id = sessionId;
            }
            yield normalized;
          }
        }
      }

      // Cleanup
      await session.destroy();
      await client.stop();
      logger.debug('CopilotClient stopped successfully');
    } catch (error) {
      // Ensure client is stopped on error
      try {
        await client.stop();
      } catch (cleanupError) {
        // Log but don't throw cleanup errors - the original error is more important
        logger.debug(`Failed to stop client during cleanup: ${cleanupError}`);
      }

      if (isAbortError(error)) {
        logger.debug('Query aborted');
        return;
      }

      // Map errors to CopilotError
      if (error instanceof Error) {
        logger.error(`Copilot SDK error: ${error.message}`);
        const errorInfo = this.mapError(error.message, null);
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
   * The Copilot CLI relies on gh auth for authentication.
   */
  async checkAuth(): Promise<CopilotAuthStatus> {
    this.ensureCliDetected();
    if (!this.cliPath) {
      logger.debug('checkAuth: CLI not found');
      return { authenticated: false, method: 'none' };
    }

    logger.debug('checkAuth: Starting credential check');

    // Try to check GitHub CLI authentication status first
    // The Copilot CLI uses gh auth for authentication
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
   * Fetch available models from the CLI at runtime
   */
  async fetchRuntimeModels(): Promise<CopilotRuntimeModel[]> {
    this.ensureCliDetected();
    if (!this.cliPath) {
      return [];
    }

    try {
      // Try to list models using the CLI
      const result = execSync(`"${this.cliPath}" models list --format json`, {
        encoding: 'utf8',
        timeout: 15000,
        stdio: 'pipe',
      });

      const models = JSON.parse(result) as CopilotRuntimeModel[];
      this.runtimeModels = models;
      logger.debug(`Fetched ${models.length} runtime models from Copilot CLI`);
      return models;
    } catch (error) {
      // Clear cache on failure to avoid returning stale data
      this.runtimeModels = null;
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
        modelString: id.replace('copilot-', ''), // Bare model for CLI
        provider: 'copilot',
        description: config.description,
        supportsTools: config.supportsTools,
        supportsVision: config.supportsVision,
        contextWindow: config.contextWindow,
      })
    );

    // Add runtime models if available (discovered via CLI)
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
   *
   * Note: Vision is NOT currently supported - the SDK doesn't handle image inputs yet.
   * This may change in future versions of the Copilot SDK.
   */
  supportsFeature(feature: string): boolean {
    const supported = ['tools', 'text', 'streaming'];
    return supported.includes(feature);
  }

  /**
   * Check if runtime models have been cached
   */
  hasCachedModels(): boolean {
    return this.runtimeModels !== null && this.runtimeModels.length > 0;
  }

  /**
   * Clear the runtime model cache
   */
  clearModelCache(): void {
    this.runtimeModels = null;
    logger.debug('Cleared Copilot model cache');
  }

  /**
   * Refresh models from CLI and return all available models
   */
  async refreshModels(): Promise<ModelDefinition[]> {
    logger.debug('Refreshing Copilot models from CLI');
    await this.fetchRuntimeModels();
    return this.getAvailableModels();
  }
}
