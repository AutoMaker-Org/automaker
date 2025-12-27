/**
 * Shared types for AI model providers
 */

/**
 * Configuration for a provider instance
 */
export interface ProviderConfig {
  apiKey?: string;
  cliPath?: string;
  env?: Record<string, string>;
}

/**
 * Message in conversation history
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; source?: object }>;
}

/**
 * Thinking configuration for providers that support extended thinking
 * Used by Zai (GLM-4.7) and similar providers
 */
export interface ThinkingConfig {
  /** Enable or disable thinking mode */
  type: 'enabled' | 'disabled';
  /** Whether to clear previous thinking content (false = preserved thinking) */
  clear_thinking?: boolean;
}

/**
 * Provider feature type for capability checking
 */
export type ProviderFeature = 'tools' | 'text' | 'vision' | 'mcp' | 'browser' | 'extendedThinking';

/**
 * Options for executing a query via a provider
 *
 * This interface supports all providers through a common set of options,
 * with provider-specific fields noted below.
 */
export interface ExecuteOptions {
  // === Required for all providers ===

  /**
   * The prompt to send to the model
   * Can be a simple string or an array of content blocks (for multimodal input)
   */
  prompt: string | Array<{ type: string; text?: string; source?: object }>;

  /**
   * Model identifier (e.g., "claude-opus-4-5-20251101", "glm-4.7")
   * The provider is determined automatically from the model prefix
   */
  model: string;

  /**
   * Current working directory for file operations
   * Used by tools like Read, Write, Glob, Grep, and Bash
   */
  cwd: string;

  // === Common optional fields ===

  /**
   * System prompt to guide the model's behavior
   * Can be a simple string or a preset configuration
   */
  systemPrompt?: string | { type: 'preset'; preset: 'claude_code'; append?: string };

  /**
   * Maximum number of conversation turns (tool call cycles)
   * Default: 20
   */
  maxTurns?: number;

  /**
   * Whitelist of tools the model is allowed to use
   * Common tools: Read, Write, Edit, Glob, Grep, Bash
   * Claude also supports: WebSearch, WebFetch, MCP tools
   */
  allowedTools?: string[];

  /**
   * Abort controller for cancelling the request
   */
  abortController?: AbortController;

  /**
   * Previous messages for context in multi-turn conversations
   */
  conversationHistory?: ConversationMessage[];

  /**
   * Structured output configuration
   * When provided, the model will respond with JSON matching the schema
   * - Claude: Native support via SDK
   * - Zai: Via prompt engineering + JSON response format
   */
  outputFormat?: {
    type: 'json_schema';
    schema: Record<string, unknown>;
  };

  // === Claude-specific fields ===

  /**
   * [Claude] SDK session ID for resuming conversations
   * Enables conversation continuity across requests
   */
  sdkSessionId?: string;

  /**
   * [Claude] Filesystem setting sources to load
   * Controls which CLAUDE.md files are loaded (user, project, local)
   */
  settingSources?: Array<'user' | 'project' | 'local'>;

  /**
   * [Claude] MCP servers to connect to
   * Maps server name to server configuration
   */
  mcpServers?: Record<string, unknown>;

  // === Zai-specific fields ===

  /**
   * [Zai] Thinking mode configuration for GLM models
   * Enables extended reasoning with preserved context across turns
   * - type: 'enabled' | 'disabled'
   * - clear_thinking: false preserves thinking, true clears it
   */
  thinking?: ThinkingConfig;
}

/**
 * Content block in a provider message (matches Claude SDK format)
 */
export interface ContentBlock {
  type: 'text' | 'tool_use' | 'thinking' | 'tool_result' | 'reasoning';
  text?: string;
  thinking?: string;
  reasoning_content?: string; // Zai's reasoning field from thinking mode
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string;
}

/**
 * Message returned by a provider (matches Claude SDK streaming format)
 */
export interface ProviderMessage {
  type: 'assistant' | 'user' | 'error' | 'result';
  subtype?: 'success' | 'error';
  session_id?: string;
  message?: {
    role: 'user' | 'assistant';
    content: ContentBlock[];
  };
  result?: string;
  error?: string;
  parent_tool_use_id?: string | null;
}

/**
 * Installation status for a provider
 */
export interface InstallationStatus {
  installed: boolean;
  path?: string;
  version?: string;
  method?: 'cli' | 'npm' | 'brew' | 'sdk';
  hasApiKey?: boolean;
  authenticated?: boolean;
  error?: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Model definition
 */
export interface ModelDefinition {
  id: string;
  name: string;
  modelString: string;
  provider: string;
  description: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsVision?: boolean;
  supportsTools?: boolean;
  supportsExtendedThinking?: boolean; // For Claude extended thinking and Zai thinking mode
  tier?: 'basic' | 'standard' | 'premium' | 'vision';
  default?: boolean;
}
