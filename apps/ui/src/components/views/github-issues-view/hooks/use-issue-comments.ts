import { useMemo, useCallback } from 'react';
import type { GitHubComment } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import { useGitHubIssueComments } from '@/hooks/queries';

interface UseIssueCommentsResult {
  comments: GitHubComment[];
  totalCount: number;
  loading: boolean;
  loadingMore: boolean;
  hasNextPage: boolean;
  error: string | null;
  loadMore: () => void;
  refresh: () => void;
}

export function useIssueComments(issueNumber: number | null): UseIssueCommentsResult {
  const { currentProject } = useAppStore();

  // Use React Query infinite query
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage, refetch, error } =
    useGitHubIssueComments(currentProject?.path, issueNumber ?? undefined);

  // Flatten all pages into a single comments array
  const comments = useMemo(() => {
    return data?.pages.flatMap((page) => page.comments) ?? [];
  }, [data?.pages]);

  // Get total count from the first page
  const totalCount = data?.pages[0]?.totalCount ?? 0;

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const refresh = useCallback(() => {
    refetch();
  }, [refetch]);

  return {
    comments,
    totalCount,
    loading: isLoading,
    loadingMore: isFetchingNextPage,
    hasNextPage: hasNextPage ?? false,
    error: error instanceof Error ? error.message : null,
    loadMore,
    refresh,
  };
}
