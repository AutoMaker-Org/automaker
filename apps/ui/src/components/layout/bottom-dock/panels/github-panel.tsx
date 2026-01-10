import { useState, useCallback, useEffect, useRef } from 'react';
import { CircleDot, GitPullRequest, RefreshCw, ExternalLink, Loader2 } from 'lucide-react';
import { getElectronAPI, GitHubIssue, GitHubPR } from '@/lib/electron';
import { useAppStore, GitHubCacheIssue, GitHubCachePR } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type GitHubTab = 'issues' | 'prs';

// Cache duration: 5 minutes
const CACHE_DURATION_MS = 5 * 60 * 1000;

export function GitHubPanel() {
  const { currentProject, getGitHubCache, setGitHubCache, setGitHubCacheFetching } = useAppStore();
  const [activeTab, setActiveTab] = useState<GitHubTab>('issues');
  const fetchingRef = useRef(false);

  const projectPath = currentProject?.path || '';
  const cache = getGitHubCache(projectPath);

  const issues = cache?.issues || [];
  const prs = cache?.prs || [];
  const isFetching = cache?.isFetching || false;
  const lastFetched = cache?.lastFetched || null;
  const hasCache = issues.length > 0 || prs.length > 0 || lastFetched !== null;

  const fetchData = useCallback(
    async (isBackgroundRefresh = false) => {
      if (!projectPath || fetchingRef.current) return;

      fetchingRef.current = true;
      if (!isBackgroundRefresh) {
        setGitHubCacheFetching(projectPath, true);
      }

      try {
        const api = getElectronAPI();
        const fetchedIssues: GitHubCacheIssue[] = [];
        const fetchedPrs: GitHubCachePR[] = [];

        // Fetch issues
        if (api.github?.listIssues) {
          const issuesResult = await api.github.listIssues(projectPath);
          if (issuesResult.success && issuesResult.openIssues) {
            // Map to cache format
            fetchedIssues.push(
              ...issuesResult.openIssues.slice(0, 20).map((issue: GitHubIssue) => ({
                number: issue.number,
                title: issue.title,
                url: issue.url,
                author: issue.author,
              }))
            );
          }
        }

        // Fetch PRs
        if (api.github?.listPRs) {
          const prsResult = await api.github.listPRs(projectPath);
          if (prsResult.success && prsResult.openPRs) {
            // Map to cache format
            fetchedPrs.push(
              ...prsResult.openPRs.slice(0, 20).map((pr: GitHubPR) => ({
                number: pr.number,
                title: pr.title,
                url: pr.url,
                author: pr.author,
              }))
            );
          }
        }

        setGitHubCache(projectPath, { issues: fetchedIssues, prs: fetchedPrs });
      } catch (error) {
        console.error('Error fetching GitHub data:', error);
        // On error, just mark as not fetching but keep existing cache
        setGitHubCacheFetching(projectPath, false);
      } finally {
        fetchingRef.current = false;
      }
    },
    [projectPath, setGitHubCache, setGitHubCacheFetching]
  );

  // Initial fetch or refresh if cache is stale
  useEffect(() => {
    if (!projectPath) return;

    const isCacheStale = !lastFetched || Date.now() - lastFetched > CACHE_DURATION_MS;

    if (!hasCache) {
      // No cache, do initial fetch (show spinner)
      fetchData(false);
    } else if (isCacheStale && !isFetching) {
      // Cache is stale, refresh in background (no spinner, show cached data)
      fetchData(true);
    }
  }, [projectPath, hasCache, lastFetched, isFetching, fetchData]);

  // Auto-refresh interval
  useEffect(() => {
    if (!projectPath) return;

    const interval = setInterval(() => {
      const currentCache = getGitHubCache(projectPath);
      const isStale =
        !currentCache?.lastFetched || Date.now() - currentCache.lastFetched > CACHE_DURATION_MS;

      if (isStale && !fetchingRef.current) {
        fetchData(true);
      }
    }, CACHE_DURATION_MS);

    return () => clearInterval(interval);
  }, [projectPath, getGitHubCache, fetchData]);

  const handleRefresh = useCallback(() => {
    fetchData(false);
  }, [fetchData]);

  const handleOpenInGitHub = useCallback((url: string) => {
    const api = getElectronAPI();
    api.openExternalLink(url);
  }, []);

  // Only show loading spinner if no cached data AND fetching
  if (!hasCache && isFetching) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with tabs */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('issues')}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors',
              activeTab === 'issues'
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <CircleDot className="h-3 w-3" />
            Issues ({issues.length})
          </button>
          <button
            onClick={() => setActiveTab('prs')}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors',
              activeTab === 'prs'
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <GitPullRequest className="h-3 w-3" />
            PRs ({prs.length})
          </button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={handleRefresh}
          disabled={isFetching}
        >
          <RefreshCw className={cn('h-3 w-3', isFetching && 'animate-spin')} />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-2 space-y-1">
          {activeTab === 'issues' ? (
            issues.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No open issues</p>
            ) : (
              issues.map((issue) => (
                <div
                  key={issue.number}
                  className="flex items-start gap-2 p-2 rounded-md hover:bg-accent/50 cursor-pointer group"
                  onClick={() => handleOpenInGitHub(issue.url)}
                >
                  <CircleDot className="h-3.5 w-3.5 mt-0.5 text-green-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{issue.title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      #{issue.number} opened by {issue.author?.login}
                    </p>
                  </div>
                  <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 text-muted-foreground" />
                </div>
              ))
            )
          ) : prs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No open pull requests</p>
          ) : (
            prs.map((pr) => (
              <div
                key={pr.number}
                className="flex items-start gap-2 p-2 rounded-md hover:bg-accent/50 cursor-pointer group"
                onClick={() => handleOpenInGitHub(pr.url)}
              >
                <GitPullRequest className="h-3.5 w-3.5 mt-0.5 text-purple-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{pr.title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    #{pr.number} by {pr.author?.login}
                  </p>
                </div>
                <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 text-muted-foreground" />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
