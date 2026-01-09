/**
 * Shared types for AI model providers
 */

import type { ThinkingLevel } from './settings.js';
import type { CodexSandboxMode, CodexApprovalPolicy } from './codex.js';

/**
 * Reasoning effort levels for Codex/OpenAI models
 * Controls the computational intensity and reasoning tokens used.
 * Based on OpenAI API documentation:
 * - 'none': No reasoning (GPT-5.1 models only)
 * - 'minimal': Very quick reasoning
 * - 'low': Quick responses for simpler queries
 * - 'medium': Balance between depth and speed (default)
 * - 'high': Maximizes reasoning depth for critical tasks
 * - 'xhigh': Highest level, supported by gpt-5.1-codex-max and newer
 */
export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

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
 * System prompt preset configuration for CLAUDE.md auto-loading
 */
export interface SystemPromptPreset {
  type: 'preset';
  preset: 'claude_code';
  append?: string;
}

/**
 * MCP server configuration types for SDK options
 * Matches the Claude Agent SDK's McpServerConfig types
 */
export type McpServerConfig = McpStdioServerConfig | McpSSEServerConfig | McpHttpServerConfig;

/**
 * Stdio-based MCP server (subprocess)
 * Note: `type` is optional and defaults to 'stdio' to match SDK behavior
 * and allow simpler configs like { command: "node", args: ["server.js"] }
 */
export interface McpStdioServerConfig {
  type?: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/** SSE-based MCP server */
export interface McpSSEServerConfig {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
}

/** HTTP-based MCP server */
export interface McpHttpServerConfig {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}

/**
 * Subagent definition for specialized task delegation
 */
export interface AgentDefinition {
  /** Natural language description of when to use this agent */
  description: string;
  /** System prompt defining the agent's role and behavior */
  prompt: string;
  /** Restricted tool list (if omitted, inherits all tools) */
  tools?: string[];
  /** Model override for this agent */
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
}

/**
 * Options for executing a query via a provider
 */
export interface ExecuteOptions {
  prompt: string | Array<{ type: string; text?: string; source?: object }>;
  /** Bare model ID without provider prefix (e.g., "gpt-5.1-codex-max", "composer-1") */
  model: string;
  /** Original model ID with provider prefix for logging (e.g., "codex-gpt-5.1-codex-max") */
  originalModel?: string;
  cwd: string;
  systemPrompt?: string | SystemPromptPreset;
  maxTurns?: number;
  allowedTools?: string[];
  mcpServers?: Record<string, McpServerConfig>;
  /** If true, allows all MCP tools unrestricted (no approval needed). Default: false */
  mcpUnrestrictedTools?: boolean;
  /** If true, automatically approves all MCP tool calls. Default: undefined (uses approval policy) */
  mcpAutoApproveTools?: boolean;
  abortController?: AbortController;
  conversationHistory?: ConversationMessage[]; // Previous messages for context
  sdkSessionId?: string; // Claude SDK session ID for resuming conversations
  settingSources?: Array<'user' | 'project' | 'local'>; // Sources for CLAUDE.md loading
  /**
   * If true, the provider should run in read-only mode (no file modifications).
   * For Cursor CLI, this omits the --force flag, making it suggest-only.
   * Default: false (allows edits)
   */
  readOnly?: boolean;
  /**
   * Extended thinking level for Claude models.
   * Controls the amount of reasoning tokens allocated.
   * Only applies to Claude models; Cursor models handle thinking internally.
   */
  thinkingLevel?: ThinkingLevel;
  /**
   * Custom subagents for specialized task delegation
   * Key: agent name, Value: agent definition
   */
  agents?: Record<string, AgentDefinition>;
  /**
   * Reasoning effort for Codex/OpenAI models with reasoning capabilities.
   * Controls how many reasoning tokens the model generates before responding.
   * Supported values: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
   * - none: No reasoning tokens (fastest)
   * - minimal/low: Quick reasoning for simple tasks
   * - medium: Balanced reasoning (default)
   * - high: Extended reasoning for complex tasks
   * - xhigh: Maximum reasoning for quality-critical tasks
   * Only applies to models that support reasoning (gpt-5.1-codex-max+, o3-mini, o4-mini)
   */
  reasoningEffort?: ReasoningEffort;
  codexSettings?: {
    autoLoadAgents?: boolean;
    sandboxMode?: CodexSandboxMode;
    approvalPolicy?: CodexApprovalPolicy;
    enableWebSearch?: boolean;
    enableImages?: boolean;
    additionalDirs?: string[];
    threadId?: string;
  };
  outputFormat?: {
    type: 'json_schema';
    schema: Record<string, unknown>;
  };
}

/**
 * Content block in a provider message (matches Claude SDK format)
 */
export interface ContentBlock {
  type: 'text' | 'tool_use' | 'thinking' | 'tool_result';
  text?: string;
  thinking?: string;
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
  /**
   * How the provider was installed/detected
   * - cli: Direct CLI binary
   * - wsl: CLI accessed via Windows Subsystem for Linux
   * - npm: Installed via npm
   * - brew: Installed via Homebrew
   * - sdk: Using SDK library
   */
  method?: 'cli' | 'wsl' | 'npm' | 'brew' | 'sdk';
  hasApiKey?: boolean;
  hasOAuthToken?: boolean;
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
  tier?: 'basic' | 'standard' | 'premium';
  default?: boolean;
  hasReasoning?: boolean;
}
