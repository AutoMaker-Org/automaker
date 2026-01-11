import { useState, useEffect, useCallback } from 'react';
import { getElectronAPI, LinearIssue, LinearIssueFilters } from '@/lib/electron';
import { createLogger } from '@automaker/utils/logger';

const logger = createLogger('useLinearIssues');

interface UseLinearIssuesOptions {
  teamId: string | null;
  projectId?: string | null;
  enabled?: boolean;
}

export function useLinearIssues({ teamId, projectId, enabled = true }: UseLinearIssuesOptions) {
  const [issues, setIssues] = useState<LinearIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<LinearIssueFilters>({});
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const fetchIssues = useCallback(
    async (isRefresh = false, loadMore = false) => {
      const api = getElectronAPI();
      if (!api.linear || !teamId || !enabled) return;

      try {
        if (isRefresh) {
          setRefreshing(true);
        } else if (!loadMore) {
          setLoading(true);
        }
        setError(null);

        const requestFilters: LinearIssueFilters = {
          ...filters,
          teamId,
          ...(projectId ? { projectId } : {}),
          ...(loadMore && cursor ? { cursor } : {}),
        };

        const result = await api.linear.getIssues(requestFilters);

        if (result.success && result.issues) {
          if (loadMore) {
            setIssues((prev) => [...prev, ...result.issues!]);
          } else {
            setIssues(result.issues);
          }

          if (result.pageInfo) {
            setHasMore(result.pageInfo.hasNextPage);
            setCursor(result.pageInfo.endCursor);
          } else {
            setHasMore(false);
            setCursor(undefined);
          }
        } else {
          setError(result.error || 'Failed to fetch issues');
        }
      } catch (err) {
        logger.error('Failed to fetch issues:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch issues');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [teamId, projectId, filters, cursor, enabled]
  );

  // Reset and fetch when team/project changes
  useEffect(() => {
    if (teamId && enabled) {
      setIssues([]);
      setCursor(undefined);
      setHasMore(false);
      fetchIssues(false, false);
    } else {
      setIssues([]);
    }
  }, [teamId, projectId, enabled, fetchIssues]);

  // Refetch when filters change
  useEffect(() => {
    if (teamId && enabled) {
      setCursor(undefined);
      setHasMore(false);
      fetchIssues(false, false);
    }
  }, [filters, teamId, enabled, fetchIssues]);

  const refresh = useCallback(() => {
    setCursor(undefined);
    setHasMore(false);
    fetchIssues(true, false);
  }, [fetchIssues]);

  const loadMore = useCallback(() => {
    if (hasMore && !loading && !refreshing) {
      fetchIssues(false, true);
    }
  }, [hasMore, loading, refreshing, fetchIssues]);

  const updateFilters = useCallback((newFilters: Partial<LinearIssueFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({});
  }, []);

  return {
    issues,
    loading,
    refreshing,
    error,
    filters,
    hasMore,
    refresh,
    loadMore,
    updateFilters,
    resetFilters,
  };
}
