/**
 * OpenCode Provider - Executes queries using opencode CLI
 *
 * Extends CliProvider with OpenCode-specific configuration:
 * - Event normalization for OpenCode's stream-json format
 * - Model definitions for anthropic, openai, and google models
 * - NPX-based Windows execution strategy
 * - Platform-specific npm global installation paths
 *
 * Spawns the opencode CLI with --output-format stream-json for streaming responses.
 */

import * as path from 'path';
import * as os from 'os';
import { CliProvider, type CliSpawnConfig } from './cli-provider.js';
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
// OpenCode Stream Event Types
// =============================================================================

/**
 * Base interface for all OpenCode stream events
 * OpenCode uses underscore format: step_start, step_finish, text
 */
interface OpenCodeBaseEvent {
  /** Event type identifier */
  type: string;
  /** Timestamp of the event */
  timestamp?: number;
  /** Session ID */
  sessionID?: string;
  /** Part object containing the actual event data */
  part?: Record<string, unknown>;
}

/**
 * Text event - Text output from the model
 * Format: {"type":"text","part":{"text":"content",...}}
 */
export interface OpenCodeTextEvent extends OpenCodeBaseEvent {
  type: 'text';
  part: {
    type: 'text';
    text: string;
    [key: string]: unknown;
  };
}

/**
 * Tool call event - Request to execute a tool
 */
export interface OpenCodeToolCallEvent extends OpenCodeBaseEvent {
  type: 'tool_call';
  part: {
    type: 'tool-call';
    name: string;
    call_id?: string;
    args: unknown;
    [key: string]: unknown;
  };
}

/**
 * Tool result event - Output from a tool execution
 */
export interface OpenCodeToolResultEvent extends OpenCodeBaseEvent {
  type: 'tool_result';
  part: {
    type: 'tool-result';
    call_id?: string;
    output: string;
    [key: string]: unknown;
  };
}

/**
 * Tool error event - Tool execution failed
 */
export interface OpenCodeToolErrorEvent extends OpenCodeBaseEvent {
  type: 'tool_error';
  part: {
    type: 'tool-error';
    call_id?: string;
    error: string;
    [key: string]: unknown;
  };
}

/**
 * Start step event - Begins an agentic loop iteration
 * Format: {"type":"step_start","part":{...}}
 */
export interface OpenCodeStartStepEvent extends OpenCodeBaseEvent {
  type: 'step_start';
  part?: {
    type: 'step-start';
    [key: string]: unknown;
  };
}

/**
 * Finish step event - Completes an agentic loop iteration
 * Format: {"type":"step_finish","part":{"reason":"stop",...}}
 */
export interface OpenCodeFinishStepEvent extends OpenCodeBaseEvent {
  type: 'step_finish';
  part?: {
    type: 'step-finish';
    reason?: string;
    error?: string;
    [key: string]: unknown;
  };
}

/**
 * Union type of all OpenCode stream events
 */
export type OpenCodeStreamEvent =
  | OpenCodeTextEvent
  | OpenCodeToolCallEvent
  | OpenCodeToolResultEvent
  | OpenCodeToolErrorEvent
  | OpenCodeStartStepEvent
  | OpenCodeFinishStepEvent;

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
 */
export class OpencodeProvider extends CliProvider {
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
   * - '--format', 'json' for JSON streaming output
   * - '--model', '<model>' for model selection (if specified)
   * - Message passed via stdin (no positional args needed)
   *
   * The prompt is passed via stdin to avoid shell escaping issues.
   * OpenCode will read from stdin when no positional message arguments are provided.
   *
   * @param options - Execution options containing model, cwd, etc.
   * @returns Array of CLI arguments for opencode run
   */
  buildCliArgs(options: ExecuteOptions): string[] {
    const args: string[] = ['run'];

    // Add JSON output format for streaming
    args.push('--format', 'json');

    // Handle model selection
    // Strip 'opencode-' prefix if present, OpenCode uses native format
    if (options.model) {
      const model = stripProviderPrefix(options.model);
      args.push('--model', model);
    }

    // Note: Working directory is set via subprocess cwd option, not CLI args
    // Note: Message is passed via stdin, OpenCode reads from stdin automatically

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
   * - step_finish -> type: 'result', subtype: 'success' (or error if failed)
   * - tool_call -> type: 'assistant', content with type: 'tool_use'
   * - tool_result -> type: 'assistant', content with type: 'tool_result'
   * - tool_error -> type: 'error'
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

        // Skip if no text content
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
        // Start step is informational - no message needed
        return null;
      }

      case 'step_finish': {
        const finishEvent = openCodeEvent as OpenCodeFinishStepEvent;

        // Check if the step failed (either has error field or reason is 'error')
        if (finishEvent.part?.error || finishEvent.part?.reason === 'error') {
          return {
            type: 'error',
            session_id: finishEvent.sessionID,
            error: finishEvent.part?.error || 'Step execution failed',
          };
        }

        // Successful completion
        const result: { type: 'result'; subtype: 'success'; session_id?: string; result?: string } =
          {
            type: 'result',
            subtype: 'success',
          };

        if (finishEvent.sessionID) {
          result.session_id = finishEvent.sessionID;
        }

        // Safely handle arbitrary result payloads from CLI: ensure we assign a string.
        const rawResult =
          (finishEvent.part && (finishEvent.part as Record<string, unknown>).result) ?? undefined;
        if (rawResult !== undefined) {
          result.result = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult);
        }

        return result;
      }

      case 'tool_call': {
        const toolEvent = openCodeEvent as OpenCodeToolCallEvent;

        if (!toolEvent.part) {
          return null;
        }

        // Generate a tool use ID if not provided
        const toolUseId = toolEvent.part.call_id || generateToolUseId();

        const content: ContentBlock[] = [
          {
            type: 'tool_use',
            name: toolEvent.part.name,
            tool_use_id: toolUseId,
            input: toolEvent.part.args,
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

        if (!resultEvent.part) {
          return null;
        }

        const content: ContentBlock[] = [
          {
            type: 'tool_result',
            tool_use_id: resultEvent.part.call_id,
            content: resultEvent.part.output,
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

      case 'tool_error': {
        const errorEvent = openCodeEvent as OpenCodeToolErrorEvent;

        return {
          type: 'error',
          session_id: errorEvent.sessionID,
          error: errorEvent.part?.error || 'Tool execution failed',
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
   * Returns model definitions for supported AI providers:
   * - Anthropic Claude models (Sonnet, Opus, Haiku)
   * - OpenAI GPT-4o
   * - Google Gemini 2.5 Pro
   */
  getAvailableModels(): ModelDefinition[] {
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
      // Amazon Bedrock - Claude Models
      {
        id: 'amazon-bedrock/anthropic.claude-sonnet-4-5-20250929-v1:0',
        name: 'Claude Sonnet 4.5 (Bedrock)',
        modelString: 'amazon-bedrock/anthropic.claude-sonnet-4-5-20250929-v1:0',
        provider: 'opencode',
        description: 'Latest Claude Sonnet via AWS Bedrock - fast and intelligent',
        supportsTools: true,
        supportsVision: true,
        tier: 'premium',
        default: true,
      },
      {
        id: 'amazon-bedrock/anthropic.claude-opus-4-5-20251101-v1:0',
        name: 'Claude Opus 4.5 (Bedrock)',
        modelString: 'amazon-bedrock/anthropic.claude-opus-4-5-20251101-v1:0',
        provider: 'opencode',
        description: 'Most capable Claude model via AWS Bedrock',
        supportsTools: true,
        supportsVision: true,
        tier: 'premium',
      },
      {
        id: 'amazon-bedrock/anthropic.claude-haiku-4-5-20251001-v1:0',
        name: 'Claude Haiku 4.5 (Bedrock)',
        modelString: 'amazon-bedrock/anthropic.claude-haiku-4-5-20251001-v1:0',
        provider: 'opencode',
        description: 'Fastest Claude model via AWS Bedrock',
        supportsTools: true,
        supportsVision: true,
        tier: 'standard',
      },
      // Amazon Bedrock - DeepSeek Models
      {
        id: 'amazon-bedrock/deepseek.r1-v1:0',
        name: 'DeepSeek R1 (Bedrock)',
        modelString: 'amazon-bedrock/deepseek.r1-v1:0',
        provider: 'opencode',
        description: 'DeepSeek R1 reasoning model - excellent for coding',
        supportsTools: true,
        supportsVision: false,
        tier: 'premium',
      },
      // Amazon Bedrock - Amazon Nova Models
      {
        id: 'amazon-bedrock/amazon.nova-pro-v1:0',
        name: 'Amazon Nova Pro (Bedrock)',
        modelString: 'amazon-bedrock/amazon.nova-pro-v1:0',
        provider: 'opencode',
        description: 'Amazon Nova Pro - balanced performance',
        supportsTools: true,
        supportsVision: true,
        tier: 'standard',
      },
      // Amazon Bedrock - Meta Llama Models
      {
        id: 'amazon-bedrock/meta.llama4-maverick-17b-instruct-v1:0',
        name: 'Llama 4 Maverick 17B (Bedrock)',
        modelString: 'amazon-bedrock/meta.llama4-maverick-17b-instruct-v1:0',
        provider: 'opencode',
        description: 'Meta Llama 4 Maverick via AWS Bedrock',
        supportsTools: true,
        supportsVision: false,
        tier: 'standard',
      },
      // Amazon Bedrock - Qwen Models
      {
        id: 'amazon-bedrock/qwen.qwen3-coder-480b-a35b-v1:0',
        name: 'Qwen3 Coder 480B (Bedrock)',
        modelString: 'amazon-bedrock/qwen.qwen3-coder-480b-a35b-v1:0',
        provider: 'opencode',
        description: 'Qwen3 Coder 480B - excellent for coding',
        supportsTools: true,
        supportsVision: false,
        tier: 'premium',
      },
    ];
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
