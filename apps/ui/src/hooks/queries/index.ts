/**
 * Query Hooks Barrel Export
 *
 * Central export point for all React Query hooks.
 * Import from this file for cleaner imports across the app.
 *
 * @example
 * ```tsx
 * import { useFeatures, useGitHubIssues, useClaudeUsage } from '@/hooks/queries';
 * ```
 */

// Features
export { useFeatures, useFeature, useAgentOutput } from './use-features';

// GitHub
export {
  useGitHubIssues,
  useGitHubPRs,
  useGitHubValidations,
  useGitHubRemote,
  useGitHubIssueComments,
} from './use-github';

// Usage
export { useClaudeUsage, useCodexUsage } from './use-usage';

// Running Agents
export { useRunningAgents, useRunningAgentsCount } from './use-running-agents';

// Worktrees
export {
  useWorktrees,
  useWorktreeInfo,
  useWorktreeStatus,
  useWorktreeDiffs,
  useWorktreeBranches,
  useWorktreeInitScript,
  useAvailableEditors,
} from './use-worktrees';

// Settings
export {
  useGlobalSettings,
  useProjectSettings,
  useSettingsStatus,
  useCredentials,
  useDiscoveredAgents,
} from './use-settings';

// Models
export {
  useAvailableModels,
  useCodexModels,
  useOpencodeModels,
  useOpencodeProviders,
  useModelProviders,
} from './use-models';

// CLI Status
export {
  useClaudeCliStatus,
  useCursorCliStatus,
  useCodexCliStatus,
  useOpencodeCliStatus,
  useGitHubCliStatus,
  useApiKeysStatus,
  usePlatformInfo,
} from './use-cli-status';

// Ideation
export { useIdeationPrompts, useIdeas, useIdea } from './use-ideation';

// Sessions
export { useSessions, useSessionHistory, useSessionQueue } from './use-sessions';

// Git
export { useGitDiffs } from './use-git';

// Pipeline
export { usePipelineConfig } from './use-pipeline';

// Spec
export { useSpecFile, useSpecRegenerationStatus } from './use-spec';

// Cursor Permissions
export { useCursorPermissionsQuery } from './use-cursor-permissions';
export type { CursorPermissionsData } from './use-cursor-permissions';

// Workspace
export { useWorkspaceDirectories } from './use-workspace';
