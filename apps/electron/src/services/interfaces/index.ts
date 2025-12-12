/**
 * Service Interfaces - Export all interface definitions
 */

// File System
export type {
  IFileSystemService,
  FileEntry,
  FileStats,
} from "./IFileSystemService";

// Agent
export type {
  IAgentService,
  AgentStartResult,
  AgentHistoryResult,
  StreamEvent,
} from "./IAgentService";

// Sessions
export type {
  ISessionsService,
  SessionListItem,
  SessionCreateResult,
} from "./ISessionsService";

// Auto Mode
export type {
  IAutoModeService,
  AutoModeStatus,
  AutoModeStopResult,
  AutoModeRunResult,
  AutoModeContextResult,
  AutoModeAnalyzeResult,
  AutoModeEvent,
} from "./IAutoModeService";

// Worktree
export type {
  IWorktreeService,
  WorktreeInfo,
  WorktreeStatus,
  WorktreeDiffs,
  WorktreeRevertResult,
  WorktreeMergeResult,
  WorktreeListItem,
  FileStatus,
  FileDiff,
} from "./IWorktreeService";

// Git
export type { IGitService } from "./IGitService";

// Suggestions
export type {
  ISuggestionsService,
  SuggestionType,
  SuggestionsStatus,
  SuggestionsEvent,
  FeatureSuggestion,
} from "./ISuggestionsService";

// Spec Regeneration
export type {
  ISpecRegenerationService,
  SpecRegenerationStatus,
  SpecRegenerationEvent,
} from "./ISpecRegenerationService";

// Setup
export type {
  ISetupService,
  CLIStatus,
  CLIAuthStatus,
  PlatformInfo,
  InstallResult,
  AuthClaudeResult,
  AuthCodexResult,
  ApiKeysStatus,
  ConfigureCodexMcpResult,
  InstallProgressEvent,
  AuthProgressEvent,
} from "./ISetupService";

// Features
export type { IFeaturesService, Feature } from "./IFeaturesService";

// Running Agents
export type {
  IRunningAgentsService,
  RunningAgent,
  RunningAgentsResult,
} from "./IRunningAgentsService";

// Dialog
export type {
  IDialogService,
  DialogResult,
  OpenFileOptions,
} from "./IDialogService";

// App
export type { IAppService, SaveImageResult } from "./IAppService";

// Model
export type {
  IModelService,
  ModelDefinition,
  ProviderStatus,
} from "./IModelService";
