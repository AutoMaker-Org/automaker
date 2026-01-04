/**
 * Shared types for AI model providers
 *
 * Re-exports types from @automaker/types for consistency across the codebase.
 * All provider types are defined in @automaker/types to avoid duplication.
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
  ContentBlock,
  ProviderMessage,
  InstallationStatus,
  ValidationResult,
  ModelDefinition,
} from '@automaker/types';
