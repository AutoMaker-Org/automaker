/**
 * Provider types for server-side code
 *
 * This file re-exports types from @automaker/types for consistency.
 * Server-specific types that don't belong in the shared package are defined here.
 */

// Re-export all provider types from shared package
export type {
  ProviderConfig,
  ConversationMessage,
  SystemPromptPreset,
  ThinkingConfig,
  ExecuteOptions,
  TextBlock,
  ToolUseBlock,
  ThinkingBlock,
  ToolResultBlock,
  ContentBlock,
  LegacyContentBlock,
  ProviderMessage,
  InstallationStatus,
  ValidationResult,
  ModelDefinition,
} from '@automaker/types';

// Import ProviderFeature from base-provider (server-specific)
import type { ProviderFeature } from './base-provider.js';

// Re-export for convenience
export type { ProviderFeature } from './base-provider.js';
