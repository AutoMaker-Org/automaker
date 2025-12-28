import { useState, useEffect, useCallback, useRef } from 'react';
import { getElectronAPI, GitHubIssue } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';

export function useGithubIssues() {
  const { currentProject } = useAppStore();
  const [openIssues, setOpenIssues] = useState<GitHubIssue[]>([]);
  const [closedIssues, setClosedIssues] = useState<GitHubIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const fetchIssues = useCallback(async () => {
    if (!currentProject?.path) {
      if (isMountedRef.current) {
        setError('No project selected');
        setLoading(false);
      }
      return;
    }

    try {
      if (isMountedRef.current) {
        setError(null);
      }
      const api = getElectronAPI();
      if (api.github) {
        const result = await api.github.listIssues(currentProject.path);
        if (isMountedRef.current) {
          if (result.success) {
            setOpenIssues(result.openIssues || []);
            setClosedIssues(result.closedIssues || []);
          } else {
            setError(result.error || 'Failed to fetch issues');
          }
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        console.error('[GitHubIssuesView] Error fetching issues:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch issues');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [currentProject?.path]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchIssues();

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchIssues]);

  const refresh = useCallback(() => {
    if (isMountedRef.current) {
      setRefreshing(true);
    }
    fetchIssues();
  }, [fetchIssues]);

  return {
    openIssues,
    closedIssues,
    loading,
    refreshing,
    error,
    refresh,
  };
}
