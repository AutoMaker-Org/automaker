/**
 * OpenCode Provider - Executes queries using opencode CLI
 *
 * Extends CliProvider with OpenCode-specific configuration:
 * - Event normalization for OpenCode's stream-json format
 * - Dynamic model discovery via `opencode models` CLI command
 * - NPX-based Windows execution strategy
 * - Platform-specific npm global installation paths
 *
 * Spawns the opencode CLI with --output-format stream-json for streaming responses.
 */

import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { CliProvider, type CliSpawnConfig } from './cli-provider.js';

const execFileAsync = promisify(execFile);
import type {
  ProviderConfig,
  ExecuteOptions,
  ProviderMessage,
  ModelDefinition,
  InstallationStatus,
  ContentBlock,
} from '@automaker/types';
import { stripProviderPrefix } from '@automaker/types';
import { type SubprocessOptions, getOpenCodeAuthIndicators } from '@automaker/platform';
import { createLogger } from '@automaker/utils';

// Create logger for OpenCode operations
const opencodeLogger = createLogger('OpencodeProvider');

// =============================================================================
// OpenCode Auth Types
// =============================================================================

export interface OpenCodeAuthStatus {
  authenticated: boolean;
  method: 'api_key' | 'oauth' | 'none';
  hasOAuthToken?: boolean;
  hasApiKey?: boolean;
}

// =============================================================================
// OpenCode Dynamic Model Types
// =============================================================================

/**
 * Model information from `opencode models` CLI output
 */
export interface OpenCodeModelInfo {
  /** Full model ID (e.g., "copilot/claude-sonnet-4-5") */
  id: string;
  /** Provider name (e.g., "copilot", "anthropic", "openai") */
  provider: string;
  /** Model name without provider prefix */
  name: string;
  /** Display name for UI */
  displayName?: string;
}

/**
 * Provider information from `opencode auth list` CLI output
 */
export interface OpenCodeProviderInfo {
  /** Provider ID (e.g., "copilot", "anthropic") */
  id: string;
  /** Human-readable name */
  name: string;
  /** Whether the provider is authenticated */
  authenticated: boolean;
  /** Authentication method if authenticated */
  authMethod?: 'oauth' | 'api_key';
}

/** Cache duration for dynamic model fetching (5 minutes) */
const MODEL_CACHE_DURATION_MS = 5 * 60 * 1000;
const OPENCODE_MODEL_ID_SEPARATOR = '/';
const OPENCODE_MODEL_ID_PATTERN = /^[a-z0-9.-]+\/\S+$/;
const OPENCODE_PROVIDER_PATTERN = /^[a-z0-9.-]+$/;
const OPENCODE_MODEL_NAME_PATTERN = /^[a-zA-Z0-9._:/-]+$/;

// =============================================================================
// OpenCode Stream Event Types
// =============================================================================

/**
 * Part object within OpenCode events
 */
interface OpenCodePart {
  id?: string;
  sessionID?: string;
  messageID?: string;
  type: string;
  text?: string;
  reason?: string;
  error?: string;
  name?: string;
  args?: unknown;
  call_id?: string;
  output?: string;
  tokens?: {
    input?: number;
    output?: number;
    reasoning?: number;
  };
}

/**
 * Base interface for all OpenCode stream events
 * Format: {"type":"event_type","timestamp":...,"sessionID":"...","part":{...}}
 */
interface OpenCodeBaseEvent {
  /** Event type identifier (step_start, text, step_finish, tool_call, etc.) */
  type: string;
  /** Unix timestamp */
  timestamp?: number;
  /** Session identifier */
  sessionID?: string;
  /** Event details */
  part?: OpenCodePart;
}

/**
 * Text event - Text output from the model
 */
export interface OpenCodeTextEvent extends OpenCodeBaseEvent {
  type: 'text';
  part: OpenCodePart & { type: 'text'; text: string };
}

/**
 * Step start event - Begins an agentic loop iteration
 */
export interface OpenCodeStepStartEvent extends OpenCodeBaseEvent {
  type: 'step_start';
  part: OpenCodePart & { type: 'step-start' };
}

/**
 * Step finish event - Completes an agentic loop iteration
 */
export interface OpenCodeStepFinishEvent extends OpenCodeBaseEvent {
  type: 'step_finish';
  part: OpenCodePart & { type: 'step-finish'; reason?: string };
}

/**
 * Tool call event - Request to execute a tool
 */
export interface OpenCodeToolCallEvent extends OpenCodeBaseEvent {
  type: 'tool_call';
  part: OpenCodePart & { type: 'tool-call'; name: string; args?: unknown };
}

/**
 * Tool result event - Output from a tool execution
 */
export interface OpenCodeToolResultEvent extends OpenCodeBaseEvent {
  type: 'tool_result';
  part: OpenCodePart & { type: 'tool-result'; output: string };
}

/**
 * Error details object in error events
 */
interface OpenCodeErrorDetails {
  name?: string;
  message?: string;
  data?: {
    message?: string;
    statusCode?: number;
    isRetryable?: boolean;
  };
}

/**
 * Error event - An error occurred
 */
export interface OpenCodeErrorEvent extends OpenCodeBaseEvent {
  type: 'error';
  part?: OpenCodePart & { error: string };
  error?: string | OpenCodeErrorDetails;
}

/**
 * Tool error event - A tool execution failed
 */
export interface OpenCodeToolErrorEvent extends OpenCodeBaseEvent {
  type: 'tool_error';
  part?: OpenCodePart & { error: string };
}

/**
 * Union type of all OpenCode stream events
 */
export type OpenCodeStreamEvent =
  | OpenCodeTextEvent
  | OpenCodeStepStartEvent
  | OpenCodeStepFinishEvent
  | OpenCodeToolCallEvent
  | OpenCodeToolResultEvent
  | OpenCodeErrorEvent
  | OpenCodeToolErrorEvent;

// =============================================================================
// Tool Use ID Generation
// =============================================================================

/** Counter for generating unique tool use IDs when call_id is not provided */
let toolUseIdCounter = 0;

/**
 * Generate a unique tool use ID for tool calls without explicit IDs
 */
function generateToolUseId(): string {
  toolUseIdCounter += 1;
  return `opencode-tool-${toolUseIdCounter}`;
}

/**
 * Reset the tool use ID counter (useful for testing)
 */
export function resetToolUseIdCounter(): void {
  toolUseIdCounter = 0;
}

// =============================================================================
// Provider Implementation
// =============================================================================

/**
 * OpencodeProvider - Integrates opencode CLI as an AI provider
 *
 * OpenCode is an npm-distributed CLI tool that provides access to
 * multiple AI model providers through a unified interface.
 *
 * Supports dynamic model discovery via `opencode models` CLI command,
 * enabling access to 75+ providers including GitHub Copilot, Google,
 * Anthropic, OpenAI, and more based on user authentication.
 */
export class OpencodeProvider extends CliProvider {
  // ==========================================================================
  // Dynamic Model Cache
  // ==========================================================================

  /** Cached model definitions */
  private cachedModels: ModelDefinition[] | null = null;

  /** Timestamp when cache expires */
  private modelsCacheExpiry: number = 0;

  /** Cached authenticated providers */
  private cachedProviders: OpenCodeProviderInfo[] | null = null;

  /** Whether model refresh is in progress */
  private isRefreshing: boolean = false;

  /** Promise that resolves when current refresh completes */
  private refreshPromise: Promise<ModelDefinition[]> | null = null;

  constructor(config: ProviderConfig = {}) {
    super(config);
  }

  // ==========================================================================
  // CliProvider Abstract Method Implementations
  // ==========================================================================

  getName(): string {
    return 'opencode';
  }

  getCliName(): string {
    return 'opencode';
  }

  getSpawnConfig(): CliSpawnConfig {
    return {
      windowsStrategy: 'npx',
      npxPackage: 'opencode-ai@latest',
      commonPaths: {
        linux: [
          path.join(os.homedir(), '.opencode/bin/opencode'),
          path.join(os.homedir(), '.npm-global/bin/opencode'),
          '/usr/local/bin/opencode',
          '/usr/bin/opencode',
          path.join(os.homedir(), '.local/bin/opencode'),
        ],
        darwin: [
          path.join(os.homedir(), '.opencode/bin/opencode'),
          path.join(os.homedir(), '.npm-global/bin/opencode'),
          '/usr/local/bin/opencode',
          '/opt/homebrew/bin/opencode',
          path.join(os.homedir(), '.local/bin/opencode'),
        ],
        win32: [
          path.join(os.homedir(), '.opencode', 'bin', 'opencode.exe'),
          path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'opencode.cmd'),
          path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'opencode'),
          path.join(process.env.APPDATA || '', 'npm', 'opencode.cmd'),
        ],
      },
    };
  }

  /**
   * Build CLI arguments for the `opencode run` command
   *
   * Arguments built:
   * - 'run' subcommand for executing queries
   * - '--format', 'json' for JSONL streaming output
   * - '-c', '<cwd>' for working directory (using opencode's -c flag)
   * - '--model', '<model>' for model selection (if specified)
   *
   * The prompt is passed via stdin (piped) to avoid shell escaping issues.
   * OpenCode CLI automatically reads from stdin when input is piped.
   *
   * @param options - Execution options containing model, cwd, etc.
   * @returns Array of CLI arguments for opencode run
   */
  buildCliArgs(options: ExecuteOptions): string[] {
    const args: string[] = ['run'];

    // Add JSON output format for JSONL parsing (not 'stream-json')
    args.push('--format', 'json');

    // Handle model selection
    // Strip 'opencode-' prefix if present, OpenCode uses format like 'anthropic/claude-sonnet-4-5'
    if (options.model) {
      const model = stripProviderPrefix(options.model);
      args.push('--model', model);
    }

    // Note: OpenCode reads from stdin automatically when input is piped
    // No '-' argument needed

    return args;
  }

  // ==========================================================================
  // Prompt Handling
  // ==========================================================================

  /**
   * Extract prompt text from ExecuteOptions for passing via stdin
   *
   * Handles both string prompts and array-based prompts with content blocks.
   * For array prompts with images, extracts only text content (images would
   * need separate handling via file paths if OpenCode supports them).
   *
   * @param options - Execution options containing the prompt
   * @returns Plain text prompt string
   */
  private extractPromptText(options: ExecuteOptions): string {
    if (typeof options.prompt === 'string') {
      return options.prompt;
    }

    // Array-based prompt - extract text content
    if (Array.isArray(options.prompt)) {
      return options.prompt
        .filter((block) => block.type === 'text' && block.text)
        .map((block) => block.text)
        .join('\n');
    }

    throw new Error('Invalid prompt format: expected string or content block array');
  }

  /**
   * Build subprocess options with stdin data for prompt
   *
   * Extends the base class method to add stdinData containing the prompt.
   * This allows passing prompts via stdin instead of CLI arguments,
   * avoiding shell escaping issues with special characters.
   *
   * @param options - Execution options
   * @param cliArgs - CLI arguments from buildCliArgs
   * @returns SubprocessOptions with stdinData set
   */
  protected buildSubprocessOptions(options: ExecuteOptions, cliArgs: string[]): SubprocessOptions {
    const subprocessOptions = super.buildSubprocessOptions(options, cliArgs);

    // Pass prompt via stdin to avoid shell interpretation of special characters
    // like $(), backticks, quotes, etc. that may appear in prompts or file content
    subprocessOptions.stdinData = this.extractPromptText(options);

    return subprocessOptions;
  }

  /**
   * Normalize a raw CLI event to ProviderMessage format
   *
   * Maps OpenCode event types to the standard ProviderMessage structure:
   * - text -> type: 'assistant', content with type: 'text'
   * - step_start -> null (informational, no message needed)
   * - step_finish with reason 'stop' -> type: 'result', subtype: 'success'
   * - step_finish with error -> type: 'error'
   * - tool_call -> type: 'assistant', content with type: 'tool_use'
   * - tool_result -> type: 'assistant', content with type: 'tool_result'
   * - error -> type: 'error'
   *
   * @param event - Raw event from OpenCode CLI JSONL output
   * @returns Normalized ProviderMessage or null to skip the event
   */
  normalizeEvent(event: unknown): ProviderMessage | null {
    if (!event || typeof event !== 'object') {
      return null;
    }

    const openCodeEvent = event as OpenCodeStreamEvent;

    switch (openCodeEvent.type) {
      case 'text': {
        const textEvent = openCodeEvent as OpenCodeTextEvent;

        // Skip empty text
        if (!textEvent.part?.text) {
          return null;
        }

        const content: ContentBlock[] = [
          {
            type: 'text',
            text: textEvent.part.text,
          },
        ];

        return {
          type: 'assistant',
          session_id: textEvent.sessionID,
          message: {
            role: 'assistant',
            content,
          },
        };
      }

      case 'step_start': {
        // Step start is informational - no message needed
        return null;
      }

      case 'step_finish': {
        const finishEvent = openCodeEvent as OpenCodeStepFinishEvent;

        // Check if the step failed - either by error property or reason='error'
        if (finishEvent.part?.error) {
          return {
            type: 'error',
            session_id: finishEvent.sessionID,
            error: finishEvent.part.error,
          };
        }

        // Check if reason indicates error (even without explicit error text)
        if (finishEvent.part?.reason === 'error') {
          return {
            type: 'error',
            session_id: finishEvent.sessionID,
            error: 'Step execution failed',
          };
        }

        // Successful completion (reason: 'stop' or 'end_turn')
        return {
          type: 'result',
          subtype: 'success',
          session_id: finishEvent.sessionID,
          result: (finishEvent.part as OpenCodePart & { result?: string })?.result,
        };
      }

      case 'tool_error': {
        const toolErrorEvent = openCodeEvent as OpenCodeBaseEvent;

        // Extract error message from part.error
        const errorMessage = toolErrorEvent.part?.error || 'Tool execution failed';

        return {
          type: 'error',
          session_id: toolErrorEvent.sessionID,
          error: errorMessage,
        };
      }

      case 'tool_call': {
        const toolEvent = openCodeEvent as OpenCodeToolCallEvent;

        // Generate a tool use ID if not provided
        const toolUseId = toolEvent.part?.call_id || generateToolUseId();

        const content: ContentBlock[] = [
          {
            type: 'tool_use',
            name: toolEvent.part?.name || 'unknown',
            tool_use_id: toolUseId,
            input: toolEvent.part?.args,
          },
        ];

        return {
          type: 'assistant',
          session_id: toolEvent.sessionID,
          message: {
            role: 'assistant',
            content,
          },
        };
      }

      case 'tool_result': {
        const resultEvent = openCodeEvent as OpenCodeToolResultEvent;

        const content: ContentBlock[] = [
          {
            type: 'tool_result',
            tool_use_id: resultEvent.part?.call_id,
            content: resultEvent.part?.output || '',
          },
        ];

        return {
          type: 'assistant',
          session_id: resultEvent.sessionID,
          message: {
            role: 'assistant',
            content,
          },
        };
      }

      case 'error': {
        const errorEvent = openCodeEvent as OpenCodeErrorEvent;

        // Extract error message from various formats
        let errorMessage = 'Unknown error';
        if (errorEvent.error) {
          if (typeof errorEvent.error === 'string') {
            errorMessage = errorEvent.error;
          } else {
            // Error is an object with name/data structure
            errorMessage =
              errorEvent.error.data?.message ||
              errorEvent.error.message ||
              errorEvent.error.name ||
              'Unknown error';
          }
        } else if (errorEvent.part?.error) {
          errorMessage = errorEvent.part.error;
        }

        return {
          type: 'error',
          session_id: errorEvent.sessionID,
          error: errorMessage,
        };
      }

      default: {
        // Unknown event type - skip it
        return null;
      }
    }
  }

  // ==========================================================================
  // Model Configuration
  // ==========================================================================

  /**
   * Get available models for OpenCode
   *
   * Returns cached models if available and not expired.
   * Falls back to default models if cache is empty or CLI is unavailable.
   *
   * Use `refreshModels()` to force a fresh fetch from the CLI.
   */
  getAvailableModels(): ModelDefinition[] {
    // Return cached models if available and not expired
    if (this.cachedModels && Date.now() < this.modelsCacheExpiry) {
      return this.cachedModels;
    }

    // Return cached models even if expired (better than nothing)
    if (this.cachedModels) {
      // Trigger background refresh
      this.refreshModels().catch((err) => {
        opencodeLogger.debug(`Background model refresh failed: ${err}`);
      });
      return this.cachedModels;
    }

    // Return default models while cache is empty
    return this.getDefaultModels();
  }

  /**
   * Get default hardcoded models (fallback when CLI is unavailable)
   */
  private getDefaultModels(): ModelDefinition[] {
    return [
      // OpenCode Free Tier Models
      {
        id: 'opencode/big-pickle',
        name: 'Big Pickle (Free)',
        modelString: 'opencode/big-pickle',
        provider: 'opencode',
        description: 'OpenCode free tier model - great for general coding',
        supportsTools: true,
        supportsVision: false,
        tier: 'basic',
        default: true,
      },
      {
        id: 'opencode/glm-4.7-free',
        name: 'GLM 4.7 Free',
        modelString: 'opencode/glm-4.7-free',
        provider: 'opencode',
        description: 'OpenCode free tier GLM model',
        supportsTools: true,
        supportsVision: false,
        tier: 'basic',
      },
      {
        id: 'opencode/gpt-5-nano',
        name: 'GPT-5 Nano (Free)',
        modelString: 'opencode/gpt-5-nano',
        provider: 'opencode',
        description: 'Fast and lightweight free tier model',
        supportsTools: true,
        supportsVision: false,
        tier: 'basic',
      },
      {
        id: 'opencode/grok-code',
        name: 'Grok Code (Free)',
        modelString: 'opencode/grok-code',
        provider: 'opencode',
        description: 'OpenCode free tier Grok model for coding',
        supportsTools: true,
        supportsVision: false,
        tier: 'basic',
      },
      {
        id: 'opencode/minimax-m2.1-free',
        name: 'MiniMax M2.1 Free',
        modelString: 'opencode/minimax-m2.1-free',
        provider: 'opencode',
        description: 'OpenCode free tier MiniMax model',
        supportsTools: true,
        supportsVision: false,
        tier: 'basic',
      },
    ];
  }

  // ==========================================================================
  // Dynamic Model Discovery
  // ==========================================================================

  /**
   * Refresh models from OpenCode CLI
   *
   * Fetches available models using `opencode models` command and updates cache.
   * Returns the updated model definitions.
   */
  async refreshModels(): Promise<ModelDefinition[]> {
    // If refresh is in progress, wait for existing promise instead of busy-waiting
    if (this.isRefreshing && this.refreshPromise) {
      opencodeLogger.debug('Model refresh already in progress, waiting for completion...');
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    opencodeLogger.debug('Starting model refresh from OpenCode CLI');

    this.refreshPromise = this.doRefreshModels();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
      this.isRefreshing = false;
    }
  }

  /**
   * Internal method that performs the actual model refresh
   */
  private async doRefreshModels(): Promise<ModelDefinition[]> {
    try {
      const models = await this.fetchModelsFromCli();

      if (models.length > 0) {
        this.cachedModels = models;
        this.modelsCacheExpiry = Date.now() + MODEL_CACHE_DURATION_MS;
        opencodeLogger.debug(`Cached ${models.length} models from OpenCode CLI`);
      } else {
        // Keep existing cache if fetch returned nothing
        opencodeLogger.debug('No models returned from CLI, keeping existing cache');
      }

      return this.cachedModels || this.getDefaultModels();
    } catch (error) {
      opencodeLogger.debug(`Model refresh failed: ${error}`);
      // Return existing cache or defaults on error
      return this.cachedModels || this.getDefaultModels();
    }
  }

  /**
   * Fetch models from OpenCode CLI using `opencode models` command
   *
   * Uses async execFile to avoid blocking the event loop.
   */
  private async fetchModelsFromCli(): Promise<ModelDefinition[]> {
    this.ensureCliDetected();

    if (!this.cliPath) {
      opencodeLogger.debug('OpenCode CLI not available for model fetch');
      return [];
    }

    try {
      let command: string;
      let args: string[];

      if (this.detectedStrategy === 'npx') {
        // NPX strategy: execute npx with opencode-ai package
        command = 'npx';
        args = ['opencode-ai@latest', 'models'];
        opencodeLogger.debug(`Executing: ${command} ${args.join(' ')}`);
      } else if (this.useWsl && this.wslCliPath) {
        // WSL strategy: execute via wsl.exe
        command = 'wsl.exe';
        args = this.wslDistribution
          ? ['-d', this.wslDistribution, this.wslCliPath, 'models']
          : [this.wslCliPath, 'models'];
        opencodeLogger.debug(`Executing: ${command} ${args.join(' ')}`);
      } else {
        // Direct CLI execution
        command = this.cliPath;
        args = ['models'];
        opencodeLogger.debug(`Executing: ${command} ${args.join(' ')}`);
      }

      const { stdout } = await execFileAsync(command, args, {
        encoding: 'utf-8',
        timeout: 30000,
        windowsHide: true,
      });

      opencodeLogger.debug(
        `Models output (${stdout.length} chars): ${stdout.substring(0, 200)}...`
      );
      return this.parseModelsOutput(stdout);
    } catch (error) {
      opencodeLogger.error(`Failed to fetch models from CLI: ${error}`);
      return [];
    }
  }

  /**
   * Parse the output of `opencode models` command
   *
   * OpenCode CLI output format (one model per line):
   * opencode/big-pickle
   * opencode/glm-4.7-free
   * anthropic/claude-3-5-haiku-20241022
   * github-copilot/claude-3.5-sonnet
   * ...
   */
  private parseModelsOutput(output: string): ModelDefinition[] {
    // Parse line-based format (one model ID per line)
    const lines = output.split('\n');
    const models: ModelDefinition[] = [];

    // Regex to validate "provider/model-name" format
    // Provider: lowercase letters, numbers, dots, hyphens
    // Model name: non-whitespace (supports nested paths like openrouter/anthropic/claude)
    const modelIdRegex = OPENCODE_MODEL_ID_PATTERN;

    for (const line of lines) {
      // Remove ANSI escape codes if any
      const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, '').trim();

      // Skip empty lines
      if (!cleanLine) continue;

      // Validate format using regex for robustness
      if (modelIdRegex.test(cleanLine)) {
        const separatorIndex = cleanLine.indexOf(OPENCODE_MODEL_ID_SEPARATOR);
        if (separatorIndex <= 0 || separatorIndex === cleanLine.length - 1) {
          continue;
        }

        const provider = cleanLine.slice(0, separatorIndex);
        const name = cleanLine.slice(separatorIndex + 1);

        if (!OPENCODE_PROVIDER_PATTERN.test(provider) || !OPENCODE_MODEL_NAME_PATTERN.test(name)) {
          continue;
        }

        models.push(
          this.modelInfoToDefinition({
            id: cleanLine,
            provider,
            name,
          })
        );
      }
    }

    opencodeLogger.debug(`Parsed ${models.length} models from CLI output`);
    return models;
  }

  /**
   * Convert OpenCodeModelInfo to ModelDefinition
   */
  private modelInfoToDefinition(model: OpenCodeModelInfo): ModelDefinition {
    const displayName = model.displayName || this.formatModelDisplayName(model);
    const tier = this.inferModelTier(model.id);

    return {
      id: model.id,
      name: displayName,
      modelString: model.id,
      provider: model.provider, // Use the actual provider (github-copilot, google, etc.)
      description: `${model.name} via ${this.formatProviderName(model.provider)}`,
      supportsTools: true,
      supportsVision: this.modelSupportsVision(model.id),
      tier,
      // Mark Claude Sonnet as default if available
      default: model.id.includes('claude-sonnet-4'),
    };
  }

  /**
   * Format provider name for display
   */
  private formatProviderName(provider: string): string {
    const providerNames: Record<string, string> = {
      'github-copilot': 'GitHub Copilot',
      google: 'Google AI',
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      openrouter: 'OpenRouter',
      opencode: 'OpenCode',
      ollama: 'Ollama',
      lmstudio: 'LM Studio',
      azure: 'Azure OpenAI',
      xai: 'xAI',
      deepseek: 'DeepSeek',
    };
    return (
      providerNames[provider] ||
      provider.charAt(0).toUpperCase() + provider.slice(1).replace(/-/g, ' ')
    );
  }

  /**
   * Format a display name for a model
   */
  private formatModelDisplayName(model: OpenCodeModelInfo): string {
    // Capitalize and format the model name
    const formattedName = model.name
      .split('-')
      .map((part) => {
        // Handle version numbers like "4-5" -> "4.5"
        if (/^\d+$/.test(part)) {
          return part;
        }
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(' ')
      .replace(/(\d)\s+(\d)/g, '$1.$2'); // "4 5" -> "4.5"

    // Format provider name
    const providerNames: Record<string, string> = {
      copilot: 'GitHub Copilot',
      anthropic: 'Anthropic',
      openai: 'OpenAI',
      google: 'Google',
      'amazon-bedrock': 'AWS Bedrock',
      bedrock: 'AWS Bedrock',
      openrouter: 'OpenRouter',
      opencode: 'OpenCode',
      azure: 'Azure',
      ollama: 'Ollama',
      lmstudio: 'LM Studio',
    };

    const providerDisplay = providerNames[model.provider] || model.provider;
    return `${formattedName} (${providerDisplay})`;
  }

  /**
   * Infer model tier based on model ID
   */
  private inferModelTier(modelId: string): 'basic' | 'standard' | 'premium' {
    const lowerModelId = modelId.toLowerCase();

    // Premium tier: flagship models
    if (
      lowerModelId.includes('opus') ||
      lowerModelId.includes('gpt-5') ||
      lowerModelId.includes('o3') ||
      lowerModelId.includes('o4') ||
      lowerModelId.includes('gemini-2') ||
      lowerModelId.includes('deepseek-r1')
    ) {
      return 'premium';
    }

    // Basic tier: free or lightweight models
    if (
      lowerModelId.includes('free') ||
      lowerModelId.includes('nano') ||
      lowerModelId.includes('mini') ||
      lowerModelId.includes('haiku') ||
      lowerModelId.includes('flash')
    ) {
      return 'basic';
    }

    // Standard tier: everything else
    return 'standard';
  }

  /**
   * Check if a model supports vision based on model ID
   */
  private modelSupportsVision(modelId: string): boolean {
    const lowerModelId = modelId.toLowerCase();

    // Models known to support vision
    const visionModels = ['claude', 'gpt-4', 'gpt-5', 'gemini', 'nova', 'llama-3', 'llama-4'];

    return visionModels.some((vm) => lowerModelId.includes(vm));
  }

  /**
   * Fetch authenticated providers from OpenCode CLI
   *
   * Runs `opencode auth list` to get the list of authenticated providers.
   * Uses async execFile to avoid blocking the event loop.
   */
  async fetchAuthenticatedProviders(): Promise<OpenCodeProviderInfo[]> {
    this.ensureCliDetected();

    if (!this.cliPath) {
      opencodeLogger.debug('OpenCode CLI not available for provider fetch');
      return [];
    }

    try {
      let command: string;
      let args: string[];

      if (this.detectedStrategy === 'npx') {
        // NPX strategy
        command = 'npx';
        args = ['opencode-ai@latest', 'auth', 'list'];
        opencodeLogger.debug(`Executing: ${command} ${args.join(' ')}`);
      } else if (this.useWsl && this.wslCliPath) {
        // WSL strategy
        command = 'wsl.exe';
        args = this.wslDistribution
          ? ['-d', this.wslDistribution, this.wslCliPath, 'auth', 'list']
          : [this.wslCliPath, 'auth', 'list'];
        opencodeLogger.debug(`Executing: ${command} ${args.join(' ')}`);
      } else {
        // Direct CLI execution
        command = this.cliPath;
        args = ['auth', 'list'];
        opencodeLogger.debug(`Executing: ${command} ${args.join(' ')}`);
      }

      const { stdout } = await execFileAsync(command, args, {
        encoding: 'utf-8',
        timeout: 15000,
        windowsHide: true,
      });

      opencodeLogger.debug(
        `Auth list output (${stdout.length} chars): ${stdout.substring(0, 200)}...`
      );
      const providers = this.parseProvidersOutput(stdout);
      this.cachedProviders = providers;
      return providers;
    } catch (error) {
      opencodeLogger.error(`Failed to fetch providers from CLI: ${error}`);
      return this.cachedProviders || [];
    }
  }

  /**
   * Parse the output of `opencode auth list` command
   *
   * OpenCode CLI output format:
   * ┌  Credentials ~/.local/share/opencode/auth.json
   * │
   * ●  Anthropic oauth
   * │
   * ●  GitHub Copilot oauth
   * │
   * └  4 credentials
   *
   * Each line with ● contains: provider name and auth method (oauth/api)
   */
  private parseProvidersOutput(output: string): OpenCodeProviderInfo[] {
    const lines = output.split('\n');
    const providers: OpenCodeProviderInfo[] = [];

    // Provider name to ID mapping
    const providerIdMap: Record<string, string> = {
      anthropic: 'anthropic',
      'github copilot': 'github-copilot',
      copilot: 'github-copilot',
      google: 'google',
      openai: 'openai',
      openrouter: 'openrouter',
      azure: 'azure',
      bedrock: 'amazon-bedrock',
      'amazon bedrock': 'amazon-bedrock',
      ollama: 'ollama',
      'lm studio': 'lmstudio',
      lmstudio: 'lmstudio',
      opencode: 'opencode',
      'z.ai coding plan': 'z-ai',
      'z.ai': 'z-ai',
    };

    for (const line of lines) {
      // Look for lines with ● which indicate authenticated providers
      // Format: "●  Provider Name auth_method"
      if (line.includes('●')) {
        // Remove ANSI escape codes and the ● symbol
        const cleanLine = line
          .replace(/\x1b\[[0-9;]*m/g, '') // Remove ANSI codes
          .replace(/●/g, '') // Remove ● symbol
          .trim();

        if (!cleanLine) continue;

        // Parse "Provider Name auth_method" format
        // Auth method is the last word (oauth, api, etc.)
        const parts = cleanLine.split(/\s+/);
        if (parts.length >= 2) {
          const authMethod = parts[parts.length - 1].toLowerCase();
          const providerName = parts.slice(0, -1).join(' ');

          // Determine auth method type
          let authMethodType: 'oauth' | 'api_key' | undefined;
          if (authMethod === 'oauth') {
            authMethodType = 'oauth';
          } else if (authMethod === 'api' || authMethod === 'api_key') {
            authMethodType = 'api_key';
          }

          // Get provider ID from name
          const providerNameLower = providerName.toLowerCase();
          const providerId =
            providerIdMap[providerNameLower] || providerNameLower.replace(/\s+/g, '-');

          providers.push({
            id: providerId,
            name: providerName,
            authenticated: true, // If it's listed with ●, it's authenticated
            authMethod: authMethodType,
          });
        }
      }
    }

    opencodeLogger.debug(`Parsed ${providers.length} providers from auth list`);
    return providers;
  }

  /**
   * Get cached authenticated providers
   */
  getCachedProviders(): OpenCodeProviderInfo[] | null {
    return this.cachedProviders;
  }

  /**
   * Clear the model cache, forcing a refresh on next access
   */
  clearModelCache(): void {
    this.cachedModels = null;
    this.modelsCacheExpiry = 0;
    this.cachedProviders = null;
    opencodeLogger.debug('Model cache cleared');
  }

  /**
   * Check if we have cached models (not just defaults)
   */
  hasCachedModels(): boolean {
    return this.cachedModels !== null && this.cachedModels.length > 0;
  }

  // ==========================================================================
  // Feature Support
  // ==========================================================================

  /**
   * Check if a feature is supported by OpenCode
   *
   * Supported features:
   * - tools: Function calling / tool use
   * - text: Text generation
   * - vision: Image understanding
   */
  supportsFeature(feature: string): boolean {
    const supportedFeatures = ['tools', 'text', 'vision'];
    return supportedFeatures.includes(feature);
  }

  // ==========================================================================
  // Authentication
  // ==========================================================================

  /**
   * Check authentication status for OpenCode CLI
   *
   * Checks for authentication via:
   * - OAuth token in auth file
   * - API key in auth file
   */
  async checkAuth(): Promise<OpenCodeAuthStatus> {
    const authIndicators = await getOpenCodeAuthIndicators();

    // Check for OAuth token
    if (authIndicators.hasOAuthToken) {
      return {
        authenticated: true,
        method: 'oauth',
        hasOAuthToken: true,
        hasApiKey: authIndicators.hasApiKey,
      };
    }

    // Check for API key
    if (authIndicators.hasApiKey) {
      return {
        authenticated: true,
        method: 'api_key',
        hasOAuthToken: false,
        hasApiKey: true,
      };
    }

    return {
      authenticated: false,
      method: 'none',
      hasOAuthToken: false,
      hasApiKey: false,
    };
  }

  // ==========================================================================
  // Installation Detection
  // ==========================================================================

  /**
   * Detect OpenCode installation status
   *
   * Checks if the opencode CLI is available either through:
   * - Direct installation (npm global)
   * - NPX (fallback on Windows)
   * Also checks authentication status.
   */
  async detectInstallation(): Promise<InstallationStatus> {
    this.ensureCliDetected();

    const installed = await this.isInstalled();
    const auth = await this.checkAuth();

    return {
      installed,
      path: this.cliPath || undefined,
      method: this.detectedStrategy === 'npx' ? 'npm' : 'cli',
      authenticated: auth.authenticated,
      hasApiKey: auth.hasApiKey,
      hasOAuthToken: auth.hasOAuthToken,
    };
  }
}
