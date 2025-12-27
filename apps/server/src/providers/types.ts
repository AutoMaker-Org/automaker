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
 * SDK-compatible MCP server configuration for stdio transport.
 * Matches @anthropic-ai/claude-agent-sdk McpStdioServerConfig.
 * Note: 'type' field is optional for stdio (defaults to 'stdio').
 */
export interface StdioMcpSdkConfig {
  type?: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * SDK-compatible MCP server configuration for HTTP transport.
 * Matches @anthropic-ai/claude-agent-sdk McpHttpServerConfig.
 * Note: 'type' field is REQUIRED for HTTP configs.
 */
export interface HttpMcpSdkConfig {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}

/**
 * Union type for SDK-compatible MCP server configurations.
 * Passed directly to Claude SDK mcpServers option.
 */
export type McpSdkConfig = StdioMcpSdkConfig | HttpMcpSdkConfig;

/**
 * Options for executing a query via a provider
 */
export interface ExecuteOptions {
  prompt: string | Array<{ type: string; text?: string; source?: object }>;
  model: string;
  cwd: string;
  systemPrompt?: string | { type: 'preset'; preset: 'claude_code'; append?: string };
  maxTurns?: number;
  allowedTools?: string[];
  mcpServers?: Record<string, McpSdkConfig>;
  abortController?: AbortController;
  conversationHistory?: ConversationMessage[]; // Previous messages for context
  sdkSessionId?: string; // Claude SDK session ID for resuming conversations
  providerConfig?: ProviderConfig; // Optional provider configuration (e.g., env vars)
  settingSources?: Array<'user' | 'project' | 'local'>; // Claude filesystem settings to load
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
