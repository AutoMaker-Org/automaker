/**
 * Shared types for AI model providers
 *
 * Re-exports types from @automaker/types for consistency across the codebase.
 */

// Re-export all provider types from @automaker/types
export type {
  ProviderConfig,
  ConversationMessage,
  ExecuteOptions,
  McpServerConfig,
  McpStdioServerConfig,
  McpSSEServerConfig,
  McpHttpServerConfig,
} from '@automaker/types';

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
