/**
 * Mutations Barrel Export
 *
 * Central export point for all React Query mutations.
 *
 * @example
 * ```tsx
 * import { useCreateFeature, useStartFeature, useCommitWorktree } from '@/hooks/mutations';
 * ```
 */

// Feature mutations
export {
  useCreateFeature,
  useUpdateFeature,
  useDeleteFeature,
  useGenerateTitle,
  useBatchUpdateFeatures,
} from './use-feature-mutations';

// Auto mode mutations
export {
  useStartFeature,
  useResumeFeature,
  useStopFeature,
  useVerifyFeature,
  useApprovePlan,
  useFollowUpFeature,
  useCommitFeature,
  useAnalyzeProject,
  useStartAutoMode,
  useStopAutoMode,
} from './use-auto-mode-mutations';

// Settings mutations
export {
  useUpdateGlobalSettings,
  useUpdateProjectSettings,
  useSaveCredentials,
} from './use-settings-mutations';

// Worktree mutations
export {
  useCreateWorktree,
  useDeleteWorktree,
  useCommitWorktree,
  usePushWorktree,
  usePullWorktree,
  useCreatePullRequest,
  useMergeWorktree,
  useSwitchBranch,
  useCheckoutBranch,
  useGenerateCommitMessage,
  useOpenInEditor,
  useInitGit,
  useSetInitScript,
  useDeleteInitScript,
} from './use-worktree-mutations';

// GitHub mutations
export {
  useValidateIssue,
  useMarkValidationViewed,
  useGetValidationStatus,
} from './use-github-mutations';

// Ideation mutations
export { useGenerateIdeationSuggestions } from './use-ideation-mutations';

// Spec mutations
export {
  useCreateSpec,
  useRegenerateSpec,
  useGenerateFeatures,
  useSaveSpec,
} from './use-spec-mutations';

// Cursor Permissions mutations
export { useApplyCursorProfile, useCopyCursorConfig } from './use-cursor-permissions-mutations';
