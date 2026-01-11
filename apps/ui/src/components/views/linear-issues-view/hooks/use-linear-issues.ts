import { useState, useEffect, useCallback, useRef } from 'react';
import { getElectronAPI, LinearIssue, LinearIssueFilters } from '@/lib/electron';
import { createLogger } from '@automaker/utils/logger';

const logger = createLogger('useLinearIssues');

// Silent refresh interval in milliseconds (30 seconds)
const SILENT_REFRESH_INTERVAL = 30 * 1000;

interface UseLinearIssuesOptions {
  teamId: string | null;
  projectId?: string | null;
  enabled?: boolean;
  /** Enable automatic background refresh */
  autoRefresh?: boolean;
  /** Custom refresh interval in milliseconds (default: 30s) */
  refreshInterval?: number;
}

export function useLinearIssues({
  teamId,
  projectId,
  enabled = true,
  autoRefresh = false,
  refreshInterval = SILENT_REFRESH_INTERVAL,
}: UseLinearIssuesOptions) {
  const [issues, setIssues] = useState<LinearIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<LinearIssueFilters>({});
  const [hasMore, setHasMore] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  // Use ref for cursor to avoid dependency cycles
  const cursorRef = useRef<string | undefined>(undefined);

  // Track current fetch to prevent race conditions
  const fetchIdRef = useRef(0);

  const fetchIssues = useCallback(
    async (isRefresh = false, loadMore = false, isSilent = false) => {
      const api = getElectronAPI();
      if (!api.linear || !teamId || !enabled) return;

      const currentFetchId = ++fetchIdRef.current;

      try {
        // Silent refresh doesn't show any loading indicators
        if (!isSilent) {
          if (isRefresh) {
            setRefreshing(true);
          } else if (!loadMore) {
            setLoading(true);
          }
        }

        // Don't clear error on silent refresh
        if (!isSilent) {
          setError(null);
        }

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
          } else if (isSilent) {
            // Silent refresh: merge new issues intelligently
            setIssues((prev) => {
              const existingIds = new Set(prev.map((i) => i.id));
              const newIssues = result.issues!.filter((i) => !existingIds.has(i.id));

              // Update existing issues with new data and prepend truly new ones
              const updatedIssues = prev.map((existing) => {
                const updated = result.issues!.find((i) => i.id === existing.id);
                return updated || existing;
              });

              // Prepend new issues at the top
              if (newIssues.length > 0) {
                logger.debug(`Silent refresh: ${newIssues.length} new issues found`);
                return [...newIssues, ...updatedIssues];
              }

              return updatedIssues;
            });
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

          // Mark initial load as complete
          if (!initialLoadComplete) {
            setInitialLoadComplete(true);
          }
        } else if (!isSilent) {
          // Only set error on non-silent refresh
          setError(result.error || 'Failed to fetch issues');
        }
      } catch (err) {
        // Ignore errors from stale requests
        if (currentFetchId !== fetchIdRef.current) {
          return;
        }
        // Only log and set error on non-silent refresh
        if (!isSilent) {
          logger.error('Failed to fetch issues:', err);
          setError(err instanceof Error ? err.message : 'Failed to fetch issues');
        } else {
          logger.debug('Silent refresh failed:', err);
        }
      } finally {
        // Only update loading state if this is still the current request
        if (currentFetchId === fetchIdRef.current && !isSilent) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [teamId, projectId, filters, enabled, initialLoadComplete]
  );

  // Reset and fetch when team/project changes
  useEffect(() => {
    if (teamId && enabled) {
      setIssues([]);
      cursorRef.current = undefined;
      setHasMore(false);
      setInitialLoadComplete(false);
      fetchIssues(false, false);
    } else {
      setIssues([]);
      setInitialLoadComplete(false);
    }
  }, [teamId, projectId, enabled]);

  // Refetch when filters change
  useEffect(() => {
    if (teamId && enabled) {
      cursorRef.current = undefined;
      setHasMore(false);
      setInitialLoadComplete(false);
      fetchIssues(false, false);
    }
  }, [filters]);

  // Silent background refresh interval
  useEffect(() => {
    if (!autoRefresh || !enabled || !teamId || !initialLoadComplete) {
      return;
    }

    const intervalId = setInterval(() => {
      // Only run silent refresh if not currently loading/refreshing
      if (!loading && !refreshing) {
        logger.debug('Running silent refresh...');
        fetchIssues(false, false, true);
      }
    }, refreshInterval);

    return () => {
      clearInterval(intervalId);
    };
  }, [
    autoRefresh,
    enabled,
    teamId,
    refreshInterval,
    loading,
    refreshing,
    fetchIssues,
    initialLoadComplete,
  ]);

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
