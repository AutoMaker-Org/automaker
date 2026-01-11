import { useState, useEffect, useCallback, useRef } from 'react';
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

  // Use ref for cursor to avoid dependency cycles
  const cursorRef = useRef<string | undefined>(undefined);

  // Track current fetch to prevent race conditions
  const fetchIdRef = useRef(0);

  const fetchIssues = useCallback(
    async (isRefresh = false, loadMore = false) => {
      const api = getElectronAPI();
      if (!api.linear || !teamId || !enabled) return;

      const currentFetchId = ++fetchIdRef.current;

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
          ...(loadMore && cursorRef.current ? { cursor: cursorRef.current } : {}),
        };

        const result = await api.linear.getIssues(requestFilters);

        // Ignore stale responses
        if (currentFetchId !== fetchIdRef.current) {
          return;
        }

        if (result.success && result.issues) {
          if (loadMore) {
            setIssues((prev) => [...prev, ...result.issues!]);
          } else {
            setIssues(result.issues);
          }

          if (result.pageInfo) {
            setHasMore(result.pageInfo.hasNextPage);
            cursorRef.current = result.pageInfo.endCursor;
          } else {
            setHasMore(false);
            cursorRef.current = undefined;
          }
        } else {
          setError(result.error || 'Failed to fetch issues');
        }
      } catch (err) {
        // Ignore errors from stale requests
        if (currentFetchId !== fetchIdRef.current) {
          return;
        }
        logger.error('Failed to fetch issues:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch issues');
      } finally {
        // Only update loading state if this is still the current request
        if (currentFetchId === fetchIdRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [teamId, projectId, filters, enabled]
  );

  // Reset and fetch when team/project changes
  useEffect(() => {
    if (teamId && enabled) {
      setIssues([]);
      cursorRef.current = undefined;
      setHasMore(false);
      fetchIssues(false, false);
    } else {
      setIssues([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, projectId, enabled]);

  // Refetch when filters change
  useEffect(() => {
    if (teamId && enabled) {
      cursorRef.current = undefined;
      setHasMore(false);
      fetchIssues(false, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const refresh = useCallback(() => {
    cursorRef.current = undefined;
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
