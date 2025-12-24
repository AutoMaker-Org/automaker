/**
 * @automaker/types
 * Shared type definitions for AutoMaker
 */

// Provider types
export type {
  ProviderConfig,
  ConversationMessage,
  StdioMcpSdkConfig,
  HttpMcpSdkConfig,
  McpSdkConfig,
  ExecuteOptions,
  ContentBlock,
  ProviderMessage,
  InstallationStatus,
  ValidationResult,
  ModelDefinition,
} from './provider.js';

// Feature types
export type { Feature, FeatureImagePath, FeatureTextFilePath, FeatureStatus } from './feature.js';

// Session types
export type {
  AgentSession,
  SessionListItem,
  CreateSessionParams,
  UpdateSessionParams,
} from './session.js';

// Error types
export type { ErrorType, ErrorInfo } from './error.js';

// Image types
export type { ImageData, ImageContentBlock } from './image.js';

// Model types and constants
export { CLAUDE_MODEL_MAP, DEFAULT_MODELS, type ModelAlias, type AgentModel } from './model.js';

// Event types
export type { EventType, EventCallback } from './event.js';

// Spec types
export type { SpecOutput } from './spec.js';
export { specOutputSchema } from './spec.js';

// Enhancement types
export type { EnhancementMode, EnhancementExample } from './enhancement.js';

// Settings types and constants
export type {
  ThemeMode,
  KanbanCardDetailLevel,
  PlanningMode,
  ThinkingLevel,
  ModelProvider,
  McpTransportType,
  StdioMcpConfig,
  HttpMcpConfig,
  McpServerConfig,
  KeyboardShortcuts,
  AIProfile,
  ProjectRef,
  TrashedProjectRef,
  ChatSessionRef,
  GlobalSettings,
  Credentials,
  BoardBackgroundSettings,
  WorktreeInfo,
  ProjectSettings,
} from './settings.js';
export {
  DEFAULT_KEYBOARD_SHORTCUTS,
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_CREDENTIALS,
  DEFAULT_PROJECT_SETTINGS,
  SETTINGS_VERSION,
  CREDENTIALS_VERSION,
  PROJECT_SETTINGS_VERSION,
} from './settings.js';

// Model display constants
export type { ModelOption, ThinkingLevelOption } from './model-display.js';
export {
  CLAUDE_MODELS,
  THINKING_LEVELS,
  THINKING_LEVEL_LABELS,
  getModelDisplayName,
} from './model-display.js';
