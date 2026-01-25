/**
 * GitHub Issues Hook
 *
 * React Query-based hook for fetching GitHub issues.
 */

import { useAppStore } from '@/store/app-store';
import { useGitHubIssues as useGitHubIssuesQuery } from '@/hooks/queries';

export function useGithubIssues() {
  const { currentProject } = useAppStore();

  const {
    data,
    isLoading: loading,
    isFetching: refreshing,
    error,
    refetch: refresh,
  } = useGitHubIssuesQuery(currentProject?.path);

  return {
    openIssues: data?.openIssues ?? [],
    closedIssues: data?.closedIssues ?? [],
    loading,
    refreshing,
    error: error instanceof Error ? error.message : error ? String(error) : null,
    refresh,
  };
}
