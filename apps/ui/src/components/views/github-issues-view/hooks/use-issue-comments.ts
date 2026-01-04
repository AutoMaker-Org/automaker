import { useState, useEffect, useCallback, useRef } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { getElectronAPI, GitHubComment } from '@/lib/electron';

const logger = createLogger('IssueComments');
import { useAppStore } from '@/store/app-store';

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
  const [comments, setComments] = useState<GitHubComment[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [endCursor, setEndCursor] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const fetchComments = useCallback(
    async (cursor?: string) => {
      if (!currentProject?.path || !issueNumber) {
        return;
      }

      const isLoadingMore = !!cursor;

      try {
        if (isMountedRef.current) {
          setError(null);
          if (isLoadingMore) {
            setLoadingMore(true);
          } else {
            setLoading(true);
          }
        }

        const api = getElectronAPI();
        if (api.github) {
          const result = await api.github.getIssueComments(
            currentProject.path,
            issueNumber,
            cursor
          );

          if (isMountedRef.current) {
            if (result.success) {
              if (isLoadingMore) {
                // Append new comments
                setComments((prev) => [...prev, ...(result.comments || [])]);
              } else {
                // Replace all comments
                setComments(result.comments || []);
              }
              setTotalCount(result.totalCount || 0);
              setHasNextPage(result.hasNextPage || false);
              setEndCursor(result.endCursor);
            } else {
              setError(result.error || 'Failed to fetch comments');
            }
          }
        }
      } catch (err) {
        if (isMountedRef.current) {
          logger.error('Error fetching comments:', err);
          setError(err instanceof Error ? err.message : 'Failed to fetch comments');
        }
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [currentProject?.path, issueNumber]
  );

  // Reset and fetch when issue changes
  useEffect(() => {
    isMountedRef.current = true;

    if (issueNumber) {
      // Reset state when issue changes
      setComments([]);
      setTotalCount(0);
      setHasNextPage(false);
      setEndCursor(undefined);
      setError(null);
      fetchComments();
    } else {
      // Clear comments when no issue is selected
      setComments([]);
      setTotalCount(0);
      setHasNextPage(false);
      setEndCursor(undefined);
      setLoading(false);
      setError(null);
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [issueNumber, fetchComments]);

  const loadMore = useCallback(() => {
    if (hasNextPage && endCursor && !loadingMore) {
      fetchComments(endCursor);
    }
  }, [hasNextPage, endCursor, loadingMore, fetchComments]);

  const refresh = useCallback(() => {
    setComments([]);
    setEndCursor(undefined);
    fetchComments();
  }, [fetchComments]);

  return {
    comments,
    totalCount,
    loading,
    loadingMore,
    hasNextPage,
    error,
    loadMore,
    refresh,
  };
}
