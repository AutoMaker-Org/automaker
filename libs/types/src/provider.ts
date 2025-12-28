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
 * Options for executing a query via a provider
 */
export interface ExecuteOptions {
  prompt: string | Array<{ type: string; text?: string; source?: object }>;
  model: string;
  cwd: string;
  systemPrompt?: string | SystemPromptPreset;
  maxTurns?: number;
  allowedTools?: string[];
  mcpServers?: Record<string, McpServerConfig>;
  mcpAutoApproveTools?: boolean; // Auto-approve MCP tool calls without permission prompts
  mcpUnrestrictedTools?: boolean; // Allow unrestricted tools when MCP servers are enabled
  abortController?: AbortController;
  conversationHistory?: ConversationMessage[]; // Previous messages for context
  sdkSessionId?: string; // Claude SDK session ID for resuming conversations
  settingSources?: Array<'user' | 'project' | 'local'>; // Sources for CLAUDE.md loading
  sandbox?: { enabled: boolean; autoAllowBashIfSandboxed?: boolean }; // Sandbox configuration
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
  tier?: 'basic' | 'standard' | 'premium';
  default?: boolean;
}
