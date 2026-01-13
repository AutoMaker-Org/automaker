/**
 * @automaker/types
 * Shared type definitions for AutoMaker
 */

// Provider types
export type {
  ProviderConfig,
  ConversationMessage,
  ExecuteOptions,
  ContentBlock,
  ProviderMessage,
  InstallationStatus,
  ValidationResult,
  ModelDefinition,
  McpServerConfig,
  McpStdioServerConfig,
  McpSSEServerConfig,
  McpHttpServerConfig,
  AgentDefinition,
  ReasoningEffort,
} from './provider.js';

// Codex CLI types
export type {
  CodexSandboxMode,
  CodexApprovalPolicy,
  CodexCliConfig,
  CodexAuthStatus,
} from './codex.js';
export * from './codex-models.js';

// Codex App-Server JSON-RPC types
export type {
  AppServerModelResponse,
  AppServerModel,
  AppServerReasoningEffort,
  AppServerAccountResponse,
  AppServerAccount,
  AppServerRateLimitsResponse,
  AppServerRateLimits,
  AppServerRateLimitWindow,
  JsonRpcRequest,
  JsonRpcResponse,
} from './codex-app-server.js';

// Feature types
export type {
  Feature,
  FeatureImagePath,
  FeatureTextFilePath,
  FeatureStatus,
  DescriptionHistoryEntry,
} from './feature.js';

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
export {
  CLAUDE_MODEL_MAP,
  CODEX_MODEL_MAP,
  CODEX_MODEL_IDS,
  REASONING_CAPABLE_MODELS,
  supportsReasoningEffort,
  getAllCodexModelIds,
  DEFAULT_MODELS,
  type ModelAlias,
  type CodexModelId,
  type AgentModel,
} from './model.js';

// Event types
export type { EventType, EventCallback } from './event.js';

// Spec types
export type { SpecOutput } from './spec.js';
export { specOutputSchema } from './spec.js';

// Enhancement types
export type { EnhancementMode, EnhancementExample } from './enhancement.js';

// Prompt customization types
export type {
  CustomPrompt,
  AutoModePrompts,
  AgentPrompts,
  BacklogPlanPrompts,
  EnhancementPrompts,
  PromptCustomization,
  ResolvedAutoModePrompts,
  ResolvedAgentPrompts,
  ResolvedBacklogPlanPrompts,
  ResolvedEnhancementPrompts,
} from './prompts.js';
export { DEFAULT_PROMPT_CUSTOMIZATION } from './prompts.js';

// Settings types and constants
export type {
  ThemeMode,
  PlanningMode,
  ThinkingLevel,
  ModelProvider,
  PhaseModelEntry,
  PhaseModelConfig,
  PhaseModelKey,
  KeyboardShortcuts,
  MCPToolInfo,
  MCPServerConfig,
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
  DEFAULT_PHASE_MODELS,
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_CREDENTIALS,
  DEFAULT_PROJECT_SETTINGS,
  SETTINGS_VERSION,
  CREDENTIALS_VERSION,
  PROJECT_SETTINGS_VERSION,
  THINKING_TOKEN_BUDGET,
  getThinkingTokenBudget,
} from './settings.js';

// Model display constants
export type { ModelOption, ThinkingLevelOption, ReasoningEffortOption } from './model-display.js';
export {
  CLAUDE_MODELS,
  THINKING_LEVELS,
  THINKING_LEVEL_LABELS,
  REASONING_EFFORT_LEVELS,
  REASONING_EFFORT_LABELS,
  getModelDisplayName,
} from './model-display.js';

// Issue validation types
export type {
  IssueValidationVerdict,
  IssueValidationConfidence,
  IssueComplexity,
  PRRecommendation,
  PRAnalysis,
  LinkedPRInfo,
  IssueValidationInput,
  IssueValidationRequest,
  IssueValidationResult,
  IssueValidationResponse,
  IssueValidationErrorResponse,
  IssueValidationEvent,
  StoredValidation,
  GitHubCommentAuthor,
  GitHubComment,
  IssueCommentsResult,
} from './issue-validation.js';

// Backlog plan types
export type {
  BacklogChange,
  DependencyUpdate,
  BacklogPlanResult,
  BacklogPlanEvent,
  BacklogPlanRequest,
  BacklogPlanApplyResult,
} from './backlog-plan.js';

// Cursor types
export * from './cursor-models.js';
export * from './cursor-cli.js';

// OpenCode types
export * from './opencode-models.js';

// Provider utilities
export {
  PROVIDER_PREFIXES,
  isCursorModel,
  isClaudeModel,
  isCodexModel,
  isOpencodeModel,
  getModelProvider,
  stripProviderPrefix,
  addProviderPrefix,
  getBareModelId,
  normalizeModelString,
  validateBareModelId,
} from './provider-utils.js';

// Pipeline types
export type {
  PipelineStep,
  PipelineConfig,
  PipelineStatus,
  FeatureStatusWithPipeline,
} from './pipeline.js';

// Port configuration
export { STATIC_PORT, SERVER_PORT, RESERVED_PORTS } from './ports.js';

// Editor types
export type { EditorInfo } from './editor.js';

// Ideation types
export type {
  IdeaCategory,
  IdeaStatus,
  ImpactLevel,
  EffortLevel,
  IdeaAttachment,
  Idea,
  IdeationSessionStatus,
  IdeationSession,
  IdeationMessage,
  IdeationSessionWithMessages,
  PromptCategory,
  IdeationPrompt,
  AnalysisFileInfo,
  AnalysisSuggestion,
  ProjectAnalysisResult,
  StartSessionOptions,
  SendMessageOptions,
  CreateIdeaInput,
  UpdateIdeaInput,
  ConvertToFeatureOptions,
  IdeationEventType,
  IdeationStreamEvent,
  IdeationAnalysisEvent,
} from './ideation.js';
