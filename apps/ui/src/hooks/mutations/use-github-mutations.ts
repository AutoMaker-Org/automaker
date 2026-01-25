/**
 * GitHub Mutation Hooks
 *
 * React Query mutations for GitHub operations like validating issues.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getElectronAPI, GitHubIssue, GitHubComment } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import { toast } from 'sonner';
import type { LinkedPRInfo, ModelId } from '@automaker/types';
import { resolveModelString } from '@automaker/model-resolver';

/**
 * Input for validating a GitHub issue
 */
interface ValidateIssueInput {
  issue: GitHubIssue;
  model?: ModelId;
  thinkingLevel?: number;
  reasoningEffort?: string;
  comments?: GitHubComment[];
  linkedPRs?: LinkedPRInfo[];
}

/**
 * Validate a GitHub issue with AI
 *
 * This mutation triggers an async validation process. Results are delivered
 * via WebSocket events (issue_validation_complete, issue_validation_error).
 *
 * @param projectPath - Path to the project
 * @returns Mutation for validating issues
 *
 * @example
 * ```tsx
 * const validateMutation = useValidateIssue(projectPath);
 *
 * validateMutation.mutate({
 *   issue,
 *   model: 'sonnet',
 *   comments,
 *   linkedPRs,
 * });
 * ```
 */
export function useValidateIssue(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ValidateIssueInput) => {
      const { issue, model, thinkingLevel, reasoningEffort, comments, linkedPRs } = input;

      const api = getElectronAPI();
      if (!api.github?.validateIssue) {
        throw new Error('Validation API not available');
      }

      const validationInput = {
        issueNumber: issue.number,
        issueTitle: issue.title,
        issueBody: issue.body || '',
        issueLabels: issue.labels.map((l) => l.name),
        comments,
        linkedPRs,
      };

      // Resolve model alias to canonical model identifier
      const resolvedModel = model ? resolveModelString(model) : undefined;

      const result = await api.github.validateIssue(
        projectPath,
        validationInput,
        resolvedModel,
        thinkingLevel,
        reasoningEffort
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to start validation');
      }

      return { issueNumber: issue.number };
    },
    onSuccess: (_, variables) => {
      toast.info(`Starting validation for issue #${variables.issue.number}`, {
        description: 'You will be notified when the analysis is complete',
      });
    },
    onError: (error) => {
      toast.error('Failed to validate issue', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
    // Note: We don't invalidate queries here because the actual result
    // comes through WebSocket events which handle cache invalidation
  });
}

/**
 * Mark a validation as viewed
 *
 * @param projectPath - Path to the project
 * @returns Mutation for marking validation as viewed
 *
 * @example
 * ```tsx
 * const markViewedMutation = useMarkValidationViewed(projectPath);
 * markViewedMutation.mutate(issueNumber);
 * ```
 */
export function useMarkValidationViewed(projectPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (issueNumber: number) => {
      const api = getElectronAPI();
      if (!api.github?.markValidationViewed) {
        throw new Error('Mark viewed API not available');
      }

      const result = await api.github.markValidationViewed(projectPath, issueNumber);

      if (!result.success) {
        throw new Error(result.error || 'Failed to mark as viewed');
      }

      return { issueNumber };
    },
    onSuccess: () => {
      // Invalidate validations cache to refresh the viewed state
      queryClient.invalidateQueries({
        queryKey: queryKeys.github.validations(projectPath),
      });
    },
    // Silent mutation - no toast needed for marking as viewed
  });
}

/**
 * Get running validation status
 *
 * @param projectPath - Path to the project
 * @returns Mutation for getting validation status (returns running issue numbers)
 */
export function useGetValidationStatus(projectPath: string) {
  return useMutation({
    mutationFn: async () => {
      const api = getElectronAPI();
      if (!api.github?.getValidationStatus) {
        throw new Error('Validation status API not available');
      }

      const result = await api.github.getValidationStatus(projectPath);

      if (!result.success) {
        throw new Error(result.error || 'Failed to get validation status');
      }

      return result.runningIssues ?? [];
    },
  });
}
