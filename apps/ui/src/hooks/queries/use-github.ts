/**
 * GitHub Query Hooks
 *
 * React Query hooks for fetching GitHub issues, PRs, and validations.
 */

import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { getElectronAPI } from '@/lib/electron';
import { queryKeys } from '@/lib/query-keys';
import { STALE_TIMES } from '@/lib/query-client';
import type { GitHubIssue, GitHubPR, GitHubComment, IssueValidation } from '@/lib/electron';

interface GitHubIssuesResult {
  openIssues: GitHubIssue[];
  closedIssues: GitHubIssue[];
}

interface GitHubPRsResult {
  openPRs: GitHubPR[];
  mergedPRs: GitHubPR[];
}

/**
 * Fetch GitHub issues for a project
 *
 * @param projectPath - Path to the project
 * @returns Query result with open and closed issues
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useGitHubIssues(currentProject?.path);
 * const { openIssues, closedIssues } = data ?? { openIssues: [], closedIssues: [] };
 * ```
 */
export function useGitHubIssues(projectPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.github.issues(projectPath ?? ''),
    queryFn: async (): Promise<GitHubIssuesResult> => {
      if (!projectPath) throw new Error('No project path');
      const api = getElectronAPI();
      const result = await api.github.listIssues(projectPath);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch issues');
      }
      return {
        openIssues: result.openIssues ?? [],
        closedIssues: result.closedIssues ?? [],
      };
    },
    enabled: !!projectPath,
    staleTime: STALE_TIMES.GITHUB,
  });
}

/**
 * Fetch GitHub PRs for a project
 *
 * @param projectPath - Path to the project
 * @returns Query result with open and merged PRs
 */
export function useGitHubPRs(projectPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.github.prs(projectPath ?? ''),
    queryFn: async (): Promise<GitHubPRsResult> => {
      if (!projectPath) throw new Error('No project path');
      const api = getElectronAPI();
      const result = await api.github.listPRs(projectPath);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch PRs');
      }
      return {
        openPRs: result.openPRs ?? [],
        mergedPRs: result.mergedPRs ?? [],
      };
    },
    enabled: !!projectPath,
    staleTime: STALE_TIMES.GITHUB,
  });
}

/**
 * Fetch GitHub validations for a project
 *
 * @param projectPath - Path to the project
 * @param issueNumber - Optional issue number to filter by
 * @returns Query result with validations
 */
export function useGitHubValidations(projectPath: string | undefined, issueNumber?: number) {
  return useQuery({
    queryKey: issueNumber
      ? queryKeys.github.validation(projectPath ?? '', issueNumber)
      : queryKeys.github.validations(projectPath ?? ''),
    queryFn: async (): Promise<IssueValidation[]> => {
      if (!projectPath) throw new Error('No project path');
      const api = getElectronAPI();
      const result = await api.github.getValidations(projectPath, issueNumber);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch validations');
      }
      return result.validations ?? [];
    },
    enabled: !!projectPath,
    staleTime: STALE_TIMES.GITHUB,
  });
}

/**
 * Check GitHub remote for a project
 *
 * @param projectPath - Path to the project
 * @returns Query result with remote info
 */
export function useGitHubRemote(projectPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.github.remote(projectPath ?? ''),
    queryFn: async () => {
      if (!projectPath) throw new Error('No project path');
      const api = getElectronAPI();
      const result = await api.github.checkRemote(projectPath);
      if (!result.success) {
        throw new Error(result.error || 'Failed to check remote');
      }
      return {
        hasRemote: result.hasRemote ?? false,
        owner: result.owner,
        repo: result.repo,
        url: result.url,
      };
    },
    enabled: !!projectPath,
    staleTime: STALE_TIMES.GITHUB,
  });
}

/**
 * Fetch comments for a GitHub issue with pagination support
 *
 * Uses useInfiniteQuery for proper "load more" pagination.
 *
 * @param projectPath - Path to the project
 * @param issueNumber - Issue number
 * @returns Infinite query result with comments and pagination helpers
 *
 * @example
 * ```tsx
 * const {
 *   data,
 *   isLoading,
 *   isFetchingNextPage,
 *   hasNextPage,
 *   fetchNextPage,
 *   refetch,
 * } = useGitHubIssueComments(projectPath, issueNumber);
 *
 * // Get all comments flattened
 * const comments = data?.pages.flatMap(page => page.comments) ?? [];
 * ```
 */
export function useGitHubIssueComments(
  projectPath: string | undefined,
  issueNumber: number | undefined
) {
  return useInfiniteQuery({
    queryKey: queryKeys.github.issueComments(projectPath ?? '', issueNumber ?? 0),
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
      if (!projectPath || !issueNumber) throw new Error('Missing project path or issue number');
      const api = getElectronAPI();
      const result = await api.github.getIssueComments(projectPath, issueNumber, pageParam);
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch comments');
      }
      return {
        comments: (result.comments ?? []) as GitHubComment[],
        totalCount: result.totalCount ?? 0,
        hasNextPage: result.hasNextPage ?? false,
        endCursor: result.endCursor as string | undefined,
      };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.endCursor : undefined),
    enabled: !!projectPath && !!issueNumber,
    staleTime: STALE_TIMES.GITHUB,
  });
}
