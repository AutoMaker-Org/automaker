/**
 * Gemini Provider - Executes queries using the Gemini CLI
 *
 * Extends CliProvider with Gemini-specific:
 * - Event normalization for Gemini's JSONL streaming format
 * - Google account and API key authentication support
 * - Thinking level configuration
 *
 * Based on https://github.com/google-gemini/gemini-cli
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
  ContentBlock,
} from './types.js';
import { validateBareModelId } from '@automaker/types';
import { GEMINI_MODEL_MAP, type GeminiAuthStatus } from '@automaker/types';
import { createLogger, isAbortError } from '@automaker/utils';
import { spawnJSONLProcess } from '@automaker/platform';
import { normalizeTodos } from './tool-normalization.js';

// Create logger for this module
const logger = createLogger('GeminiProvider');

// =============================================================================
// Gemini Stream Event Types
// =============================================================================

/**
 * Base event structure from Gemini CLI --output-format stream-json
 *
 * Actual CLI output format:
 * {"type":"init","timestamp":"...","session_id":"...","model":"..."}
 * {"type":"message","timestamp":"...","role":"user","content":"..."}
 * {"type":"message","timestamp":"...","role":"assistant","content":"...","delta":true}
 * {"type":"tool_use","timestamp":"...","tool_name":"...","tool_id":"...","parameters":{...}}
 * {"type":"tool_result","timestamp":"...","tool_id":"...","status":"success","output":"..."}
 * {"type":"result","timestamp":"...","status":"success","stats":{...}}
 */
interface GeminiStreamEvent {
  type: 'init' | 'message' | 'tool_use' | 'tool_result' | 'result' | 'error';
  timestamp?: string;
  session_id?: string;
}

interface GeminiInitEvent extends GeminiStreamEvent {
  type: 'init';
  session_id: string;
  model: string;
}

interface GeminiMessageEvent extends GeminiStreamEvent {
  type: 'message';
  role: 'user' | 'assistant';
  content: string;
  delta?: boolean;
  session_id?: string;
}

interface GeminiToolUseEvent extends GeminiStreamEvent {
  type: 'tool_use';
  tool_id: string;
  tool_name: string;
  parameters: Record<string, unknown>;
  session_id?: string;
}

interface GeminiToolResultEvent extends GeminiStreamEvent {
  type: 'tool_result';
  tool_id: string;
  status: 'success' | 'error';
  output: string;
  session_id?: string;
}

interface GeminiResultEvent extends GeminiStreamEvent {
  type: 'result';
  status: 'success' | 'error';
  stats?: {
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    cached?: number;
    input?: number;
    duration_ms?: number;
    tool_calls?: number;
  };
  error?: string;
  session_id?: string;
}

// =============================================================================
// Error Codes
// =============================================================================

export enum GeminiErrorCode {
  NOT_INSTALLED = 'GEMINI_NOT_INSTALLED',
  NOT_AUTHENTICATED = 'GEMINI_NOT_AUTHENTICATED',
  RATE_LIMITED = 'GEMINI_RATE_LIMITED',
  MODEL_UNAVAILABLE = 'GEMINI_MODEL_UNAVAILABLE',
  NETWORK_ERROR = 'GEMINI_NETWORK_ERROR',
  PROCESS_CRASHED = 'GEMINI_PROCESS_CRASHED',
  TIMEOUT = 'GEMINI_TIMEOUT',
  UNKNOWN = 'GEMINI_UNKNOWN_ERROR',
}

export interface GeminiError extends Error {
  code: GeminiErrorCode;
  recoverable: boolean;
  suggestion?: string;
}

// =============================================================================
// Tool Name Normalization
// =============================================================================

/**
 * Gemini CLI tool name to standard tool name mapping
 * This allows the UI to properly categorize and display Gemini tool calls
 */
const GEMINI_TOOL_NAME_MAP: Record<string, string> = {
  write_todos: 'TodoWrite',
  read_file: 'Read',
  read_many_files: 'Read',
  replace: 'Edit',
  write_file: 'Write',
  run_shell_command: 'Bash',
  search_file_content: 'Grep',
  glob: 'Glob',
  list_directory: 'Ls',
  web_fetch: 'WebFetch',
  google_web_search: 'WebSearch',
};

/**
 * Normalize Gemini tool names to standard tool names
 */
function normalizeGeminiToolName(geminiToolName: string): string {
  return GEMINI_TOOL_NAME_MAP[geminiToolName] || geminiToolName;
}

/**
 * Normalize Gemini tool input parameters to standard format
 *
 * Uses shared normalizeTodos utility for consistent todo normalization.
 *
 * Gemini `write_todos` format:
 * {"todos": [{"description": "Task text", "status": "pending|in_progress|completed|cancelled"}]}
 *
 * Claude `TodoWrite` format:
 * {"todos": [{"content": "Task text", "status": "pending|in_progress|completed", "activeForm": "..."}]}
 */
function normalizeGeminiToolInput(
  toolName: string,
  input: Record<string, unknown>
): Record<string, unknown> {
  // Normalize write_todos using shared utility
  if (toolName === 'write_todos' && Array.isArray(input.todos)) {
    return { todos: normalizeTodos(input.todos) };
  }
  return input;
}

/**
 * GeminiProvider - Integrates Gemini CLI as an AI provider
 *
 * Features:
 * - Google account OAuth login support
 * - API key authentication (GEMINI_API_KEY)
 * - Vertex AI support
 * - Thinking level configuration
 * - Streaming JSON output
 */
export class GeminiProvider extends CliProvider {
  constructor(config: ProviderConfig = {}) {
    super(config);
    // Trigger CLI detection on construction
    this.ensureCliDetected();
  }

  // ==========================================================================
  // CliProvider Abstract Method Implementations
  // ==========================================================================

  getName(): string {
    return 'gemini';
  }

  getCliName(): string {
    return 'gemini';
  }

  getSpawnConfig(): CliSpawnConfig {
    return {
      windowsStrategy: 'npx', // Gemini CLI can be run via npx
      npxPackage: '@google/gemini-cli', // Official Google Gemini CLI package
      commonPaths: {
        linux: [
          path.join(os.homedir(), '.local/bin/gemini'),
          '/usr/local/bin/gemini',
          path.join(os.homedir(), '.npm-global/bin/gemini'),
        ],
        darwin: [
          path.join(os.homedir(), '.local/bin/gemini'),
          '/usr/local/bin/gemini',
          '/opt/homebrew/bin/gemini',
          path.join(os.homedir(), '.npm-global/bin/gemini'),
        ],
        win32: [
          path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'gemini.cmd'),
          path.join(os.homedir(), '.npm-global', 'gemini.cmd'),
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
    // Model comes in stripped of provider prefix (e.g., '2.5-flash' from 'gemini-2.5-flash')
    // We need to add 'gemini-' back since it's part of the actual CLI model name
    const bareModel = options.model || '2.5-flash';
    const cliArgs: string[] = [];

    // Streaming JSON output format for real-time updates
    cliArgs.push('--output-format', 'stream-json');

    // Model selection - Gemini CLI expects full model names like "gemini-2.5-flash"
    // Unlike Cursor CLI where 'cursor-' is just a routing prefix, for Gemini CLI
    // the 'gemini-' is part of the actual model name Google expects
    if (bareModel && bareModel !== 'auto') {
      // Add gemini- prefix if not already present (handles edge cases)
      const cliModel = bareModel.startsWith('gemini-') ? bareModel : `gemini-${bareModel}`;
      cliArgs.push('--model', cliModel);
    }

    // Disable sandbox mode for faster execution (sandbox adds overhead)
    cliArgs.push('--sandbox', 'false');

    // YOLO mode for automatic approval (required for non-interactive use)
    // Use explicit approval-mode for clearer semantics
    cliArgs.push('--approval-mode', 'yolo');

    // Explicitly include the working directory in allowed workspace directories
    // This ensures Gemini CLI allows file operations in the project directory,
    // even if it has a different workspace cached from a previous session
    if (options.cwd) {
      cliArgs.push('--include-directories', options.cwd);
    }

    // Note: Gemini CLI doesn't have a --thinking-level flag.
    // Thinking capabilities are determined by the model selection (e.g., gemini-2.5-pro).
    // The model handles thinking internally based on the task complexity.

    // The prompt will be passed as the last positional argument
    // We'll append it in executeQuery after extracting the text

    return cliArgs;
  }

  /**
   * Convert Gemini event to AutoMaker ProviderMessage format
   */
  normalizeEvent(event: unknown): ProviderMessage | null {
    const geminiEvent = event as GeminiStreamEvent;

    switch (geminiEvent.type) {
      case 'init': {
        // Init event - capture session but don't yield a message
        const initEvent = geminiEvent as GeminiInitEvent;
        logger.debug(
          `Gemini init event: session=${initEvent.session_id}, model=${initEvent.model}`
        );
        return null;
      }

      case 'message': {
        const messageEvent = geminiEvent as GeminiMessageEvent;

        // Skip user messages - already handled by caller
        if (messageEvent.role === 'user') {
          return null;
        }

        // Handle assistant messages
        if (messageEvent.role === 'assistant') {
          return {
            type: 'assistant',
            session_id: messageEvent.session_id,
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: messageEvent.content }],
            },
          };
        }

        return null;
      }

      case 'tool_use': {
        const toolEvent = geminiEvent as GeminiToolUseEvent;
        const normalizedName = normalizeGeminiToolName(toolEvent.tool_name);
        const normalizedInput = normalizeGeminiToolInput(
          toolEvent.tool_name,
          toolEvent.parameters as Record<string, unknown>
        );

        return {
          type: 'assistant',
          session_id: toolEvent.session_id,
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                name: normalizedName,
                tool_use_id: toolEvent.tool_id,
                input: normalizedInput,
              },
            ],
          },
        };
      }

      case 'tool_result': {
        const toolResultEvent = geminiEvent as GeminiToolResultEvent;
        // If tool result is an error, prefix with error indicator
        const content =
          toolResultEvent.status === 'error'
            ? `[ERROR] ${toolResultEvent.output}`
            : toolResultEvent.output;
        return {
          type: 'assistant',
          session_id: toolResultEvent.session_id,
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_result',
                tool_use_id: toolResultEvent.tool_id,
                content,
              },
            ],
          },
        };
      }

      case 'result': {
        const resultEvent = geminiEvent as GeminiResultEvent;

        if (resultEvent.status === 'error') {
          return {
            type: 'error',
            session_id: resultEvent.session_id,
            error: resultEvent.error || 'Unknown error',
          };
        }

        // Success result - include stats for logging
        logger.debug(
          `Gemini result: status=${resultEvent.status}, tokens=${resultEvent.stats?.total_tokens}`
        );
        return {
          type: 'result',
          subtype: 'success',
          session_id: resultEvent.session_id,
        };
      }

      case 'error': {
        const errorEvent = geminiEvent as GeminiResultEvent;
        return {
          type: 'error',
          session_id: errorEvent.session_id,
          error: errorEvent.error || 'Unknown error',
        };
      }

      default:
        logger.debug(`Unknown Gemini event type: ${geminiEvent.type}`);
        return null;
    }
  }

  // ==========================================================================
  // CliProvider Overrides
  // ==========================================================================

  /**
   * Override error mapping for Gemini-specific error codes
   */
  protected mapError(stderr: string, exitCode: number | null): CliErrorInfo {
    const lower = stderr.toLowerCase();

    if (
      lower.includes('not authenticated') ||
      lower.includes('please log in') ||
      lower.includes('unauthorized') ||
      lower.includes('login required') ||
      lower.includes('error authenticating') ||
      lower.includes('loadcodeassist') ||
      (lower.includes('econnrefused') && lower.includes('8888'))
    ) {
      return {
        code: GeminiErrorCode.NOT_AUTHENTICATED,
        message: 'Gemini CLI is not authenticated',
        recoverable: true,
        suggestion:
          'Run "gemini" interactively to log in, or set GEMINI_API_KEY environment variable',
      };
    }

    if (
      lower.includes('rate limit') ||
      lower.includes('too many requests') ||
      lower.includes('429') ||
      lower.includes('quota exceeded')
    ) {
      return {
        code: GeminiErrorCode.RATE_LIMITED,
        message: 'Gemini API rate limit exceeded',
        recoverable: true,
        suggestion: 'Wait a few minutes and try again. Free tier: 60 req/min, 1000 req/day',
      };
    }

    if (
      lower.includes('model not available') ||
      lower.includes('invalid model') ||
      lower.includes('unknown model') ||
      lower.includes('modelnotfounderror') ||
      lower.includes('model not found') ||
      (lower.includes('not found') && lower.includes('404'))
    ) {
      return {
        code: GeminiErrorCode.MODEL_UNAVAILABLE,
        message: 'Requested model is not available',
        recoverable: true,
        suggestion: 'Try using "gemini-2.5-flash" or select a different model',
      };
    }

    if (
      lower.includes('network') ||
      lower.includes('connection') ||
      lower.includes('econnrefused') ||
      lower.includes('timeout')
    ) {
      return {
        code: GeminiErrorCode.NETWORK_ERROR,
        message: 'Network connection error',
        recoverable: true,
        suggestion: 'Check your internet connection and try again',
      };
    }

    if (exitCode === 137 || lower.includes('killed') || lower.includes('sigterm')) {
      return {
        code: GeminiErrorCode.PROCESS_CRASHED,
        message: 'Gemini CLI process was terminated',
        recoverable: true,
        suggestion: 'The process may have run out of memory. Try a simpler task.',
      };
    }

    return {
      code: GeminiErrorCode.UNKNOWN,
      message: stderr || `Gemini CLI exited with code ${exitCode}`,
      recoverable: false,
    };
  }

  /**
   * Override install instructions for Gemini-specific guidance
   */
  protected getInstallInstructions(): string {
    return 'Install with: npm install -g @google/gemini-cli (or visit https://github.com/google-gemini/gemini-cli)';
  }

  /**
   * Execute a prompt using Gemini CLI with streaming
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    this.ensureCliDetected();

    // Validate that model doesn't have a provider prefix
    validateBareModelId(options.model, 'GeminiProvider');

    if (!this.cliPath) {
      throw this.createError(
        GeminiErrorCode.NOT_INSTALLED,
        'Gemini CLI is not installed',
        true,
        this.getInstallInstructions()
      );
    }

    // Extract prompt text to pass as positional argument
    const promptText = this.extractPromptText(options);

    // Build CLI args and append the prompt as the last positional argument
    const cliArgs = this.buildCliArgs(options);
    cliArgs.push(promptText); // Gemini CLI uses positional args for the prompt

    const subprocessOptions = this.buildSubprocessOptions(options, cliArgs);

    let sessionId: string | undefined;

    logger.debug(`GeminiProvider.executeQuery called with model: "${options.model}"`);

    try {
      for await (const rawEvent of spawnJSONLProcess(subprocessOptions)) {
        const event = rawEvent as GeminiStreamEvent;

        // Capture session ID from init event
        if (event.type === 'init') {
          const initEvent = event as GeminiInitEvent;
          sessionId = initEvent.session_id;
          logger.debug(`Session started: ${sessionId}, model: ${initEvent.model}`);
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

      // Map CLI errors to GeminiError
      if (error instanceof Error && 'stderr' in error) {
        const errorInfo = this.mapError(
          (error as { stderr?: string }).stderr || error.message,
          (error as { exitCode?: number | null }).exitCode ?? null
        );
        throw this.createError(
          errorInfo.code as GeminiErrorCode,
          errorInfo.message,
          errorInfo.recoverable,
          errorInfo.suggestion
        );
      }
      throw error;
    }
  }

  // ==========================================================================
  // Gemini-Specific Methods
  // ==========================================================================

  /**
   * Create a GeminiError with details
   */
  private createError(
    code: GeminiErrorCode,
    message: string,
    recoverable: boolean = false,
    suggestion?: string
  ): GeminiError {
    const error = new Error(message) as GeminiError;
    error.code = code;
    error.recoverable = recoverable;
    error.suggestion = suggestion;
    error.name = 'GeminiError';
    return error;
  }

  /**
   * Get Gemini CLI version
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
   * Uses a fast credential check approach:
   * 1. Check for GEMINI_API_KEY environment variable
   * 2. Check for Google Cloud credentials
   * 3. Check for Gemini settings file with stored credentials
   * 4. Quick CLI auth test with --help (fast, doesn't make API calls)
   */
  async checkAuth(): Promise<GeminiAuthStatus> {
    this.ensureCliDetected();
    if (!this.cliPath) {
      logger.debug('checkAuth: CLI not found');
      return { authenticated: false, method: 'none' };
    }

    logger.debug('checkAuth: Starting credential check');

    // Determine the likely auth method based on environment
    const hasApiKey = !!process.env.GEMINI_API_KEY;
    const hasEnvApiKey = hasApiKey;
    const hasVertexAi = !!(
      process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_CLOUD_PROJECT
    );

    logger.debug(`checkAuth: hasApiKey=${hasApiKey}, hasVertexAi=${hasVertexAi}`);

    // Check for Gemini credentials file (~/.gemini/settings.json)
    const geminiConfigDir = path.join(os.homedir(), '.gemini');
    const settingsPath = path.join(geminiConfigDir, 'settings.json');
    let hasCredentialsFile = false;
    let authType: string | null = null;

    try {
      await fs.access(settingsPath);
      logger.debug(`checkAuth: Found settings file at ${settingsPath}`);
      try {
        const content = await fs.readFile(settingsPath, 'utf8');
        const settings = JSON.parse(content);

        // Auth config is at security.auth.selectedType (e.g., "oauth-personal", "oauth-adc", "api-key")
        const selectedType = settings?.security?.auth?.selectedType;
        if (selectedType) {
          hasCredentialsFile = true;
          authType = selectedType;
          logger.debug(`checkAuth: Settings file has auth config, selectedType=${selectedType}`);
        } else {
          logger.debug(`checkAuth: Settings file found but no auth type configured`);
        }
      } catch (e) {
        logger.debug(`checkAuth: Failed to parse settings file: ${e}`);
      }
    } catch {
      logger.debug('checkAuth: No settings file found');
    }

    // If we have an API key, we're authenticated
    if (hasApiKey) {
      logger.debug('checkAuth: Using API key authentication');
      return {
        authenticated: true,
        method: 'api_key',
        hasApiKey,
        hasEnvApiKey,
        hasCredentialsFile,
      };
    }

    // If we have Vertex AI credentials, we're authenticated
    if (hasVertexAi) {
      logger.debug('checkAuth: Using Vertex AI authentication');
      return {
        authenticated: true,
        method: 'vertex_ai',
        hasApiKey,
        hasEnvApiKey,
        hasCredentialsFile,
      };
    }

    // Check if settings file indicates configured authentication
    if (hasCredentialsFile && authType) {
      // OAuth types: "oauth-personal", "oauth-adc"
      // API key type: "api-key"
      // Code assist: "code-assist" (requires IDE integration)
      if (authType.startsWith('oauth')) {
        logger.debug(`checkAuth: OAuth authentication configured (${authType})`);
        return {
          authenticated: true,
          method: 'google_login',
          hasApiKey,
          hasEnvApiKey,
          hasCredentialsFile,
        };
      }

      if (authType === 'api-key') {
        logger.debug('checkAuth: API key authentication configured in settings');
        return {
          authenticated: true,
          method: 'api_key',
          hasApiKey,
          hasEnvApiKey,
          hasCredentialsFile,
        };
      }

      if (authType === 'code-assist' || authType === 'codeassist') {
        logger.debug('checkAuth: Code Assist auth configured but requires local server');
        return {
          authenticated: false,
          method: 'google_login',
          hasApiKey,
          hasEnvApiKey,
          hasCredentialsFile,
          error:
            'Code Assist authentication requires IDE integration. Please use "gemini" CLI to log in with a different method, or set GEMINI_API_KEY.',
        };
      }

      // Unknown auth type but something is configured
      logger.debug(`checkAuth: Unknown auth type configured: ${authType}`);
      return {
        authenticated: true,
        method: 'google_login',
        hasApiKey,
        hasEnvApiKey,
        hasCredentialsFile,
      };
    }

    // No credentials found
    logger.debug('checkAuth: No valid credentials found');
    return {
      authenticated: false,
      method: 'none',
      hasApiKey,
      hasEnvApiKey,
      hasCredentialsFile,
      error:
        'No authentication configured. Run "gemini" interactively to log in, or set GEMINI_API_KEY.',
    };
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
      hasApiKey: !!process.env.GEMINI_API_KEY,
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
   * Get available Gemini models
   */
  getAvailableModels(): ModelDefinition[] {
    return Object.entries(GEMINI_MODEL_MAP).map(([id, config]) => ({
      id, // Full model ID with gemini- prefix (e.g., 'gemini-2.5-flash')
      name: config.label,
      modelString: id, // Same as id - CLI uses the full model name
      provider: 'gemini',
      description: config.description,
      supportsTools: true,
      supportsVision: config.supportsVision,
      contextWindow: config.contextWindow,
    }));
  }

  /**
   * Check if a feature is supported
   */
  supportsFeature(feature: string): boolean {
    const supported = ['tools', 'text', 'streaming', 'vision', 'thinking'];
    return supported.includes(feature);
  }
}
