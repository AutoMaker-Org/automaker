/**
 * GitHub PRs View
 *
 * Displays pull requests using React Query for data fetching.
 */

import { useState, useCallback } from 'react';
import { GitPullRequest, RefreshCw, ExternalLink, GitMerge, X } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { getElectronAPI, type GitHubPR } from '@/lib/electron';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/markdown';
import { cn } from '@/lib/utils';
import { useGitHubPRs } from '@/hooks/queries';

export function GitHubPRsView() {
  const [selectedPR, setSelectedPR] = useState<GitHubPR | null>(null);
  const { currentProject } = useAppStore();

  const {
    data,
    isLoading: loading,
    isFetching: refreshing,
    error,
    refetch,
  } = useGitHubPRs(currentProject?.path);

  const openPRs = data?.openPRs ?? [];
  const mergedPRs = data?.mergedPRs ?? [];

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleOpenInGitHub = useCallback((url: string) => {
    const api = getElectronAPI();
    api.openExternalLink(url);
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getReviewStatus = (pr: GitHubPR) => {
    if (pr.isDraft) return { label: 'Draft', color: 'text-muted-foreground', bg: 'bg-muted' };
    switch (pr.reviewDecision) {
      case 'APPROVED':
        return { label: 'Approved', color: 'text-green-500', bg: 'bg-green-500/10' };
      case 'CHANGES_REQUESTED':
        return { label: 'Changes requested', color: 'text-orange-500', bg: 'bg-orange-500/10' };
      case 'REVIEW_REQUIRED':
        return { label: 'Review required', color: 'text-yellow-500', bg: 'bg-yellow-500/10' };
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
        <div className="p-4 rounded-full bg-destructive/10 mb-4">
          <GitPullRequest className="h-12 w-12 text-destructive" />
        </div>
        <h2 className="text-lg font-medium mb-2">Failed to Load Pull Requests</h2>
        <p className="text-muted-foreground max-w-md mb-4">
          {error instanceof Error ? error.message : 'Failed to fetch pull requests'}
        </p>
        <Button variant="outline" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
      </div>
    );
  }

  const totalPRs = openPRs.length + mergedPRs.length;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* PR List */}
      <div
        className={cn(
          'flex flex-col overflow-hidden border-r border-border',
          selectedPR ? 'w-80' : 'flex-1'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <GitPullRequest className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Pull Requests</h1>
              <p className="text-xs text-muted-foreground">
                {totalPRs === 0
                  ? 'No pull requests found'
                  : `${openPRs.length} open, ${mergedPRs.length} merged`}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? <Spinner size="sm" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>

        {/* PR List */}
        <div className="flex-1 overflow-auto">
          {totalPRs === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <div className="p-4 rounded-full bg-muted/50 mb-4">
                <GitPullRequest className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="text-base font-medium mb-2">No Pull Requests</h2>
              <p className="text-sm text-muted-foreground">
                This repository has no pull requests yet.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {/* Open PRs */}
              {openPRs.map((pr) => (
                <PRRow
                  key={pr.number}
                  pr={pr}
                  isSelected={selectedPR?.number === pr.number}
                  onClick={() => setSelectedPR(pr)}
                  onOpenExternal={() => handleOpenInGitHub(pr.url)}
                  formatDate={formatDate}
                  getReviewStatus={getReviewStatus}
                />
              ))}

              {/* Merged PRs Section */}
              {mergedPRs.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-muted/30 text-xs font-medium text-muted-foreground">
                    Merged ({mergedPRs.length})
                  </div>
                  {mergedPRs.map((pr) => (
                    <PRRow
                      key={pr.number}
                      pr={pr}
                      isSelected={selectedPR?.number === pr.number}
                      onClick={() => setSelectedPR(pr)}
                      onOpenExternal={() => handleOpenInGitHub(pr.url)}
                      formatDate={formatDate}
                      getReviewStatus={getReviewStatus}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* PR Detail Panel */}
      {selectedPR && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Detail Header */}
          <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2 min-w-0">
              {selectedPR.state === 'MERGED' ? (
                <GitMerge className="h-4 w-4 text-purple-500 shrink-0" />
              ) : (
                <GitPullRequest className="h-4 w-4 text-green-500 shrink-0" />
              )}
              <span className="text-sm font-medium truncate">
                #{selectedPR.number} {selectedPR.title}
              </span>
              {selectedPR.isDraft && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-muted text-muted-foreground">
                  Draft
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenInGitHub(selectedPR.url)}
              >
                <ExternalLink className="h-4 w-4 mr-1" />
                Open in GitHub
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedPR(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* PR Detail Content */}
          <div className="flex-1 overflow-auto p-6">
            {/* Title */}
            <h1 className="text-xl font-bold mb-2">{selectedPR.title}</h1>

            {/* Meta info */}
            <div className="flex items-center gap-3 text-sm text-muted-foreground mb-4 flex-wrap">
              <span
                className={cn(
                  'px-2 py-0.5 rounded-full text-xs font-medium',
                  selectedPR.state === 'MERGED'
                    ? 'bg-purple-500/10 text-purple-500'
                    : selectedPR.isDraft
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-green-500/10 text-green-500'
                )}
              >
                {selectedPR.state === 'MERGED' ? 'Merged' : selectedPR.isDraft ? 'Draft' : 'Open'}
              </span>
              {getReviewStatus(selectedPR) && (
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-full text-xs font-medium',
                    getReviewStatus(selectedPR)!.bg,
                    getReviewStatus(selectedPR)!.color
                  )}
                >
                  {getReviewStatus(selectedPR)!.label}
                </span>
              )}
              <span>
                #{selectedPR.number} opened {formatDate(selectedPR.createdAt)} by{' '}
                <span className="font-medium text-foreground">{selectedPR.author.login}</span>
              </span>
            </div>

            {/* Branch info */}
            {selectedPR.headRefName && (
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs text-muted-foreground">Branch:</span>
                <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">
                  {selectedPR.headRefName}
                </span>
              </div>
            )}

            {/* Labels */}
            {selectedPR.labels.length > 0 && (
              <div className="flex items-center gap-2 mb-6 flex-wrap">
                {selectedPR.labels.map((label) => (
                  <span
                    key={label.name}
                    className="px-2 py-0.5 text-xs font-medium rounded-full"
                    style={{
                      backgroundColor: `#${label.color}20`,
                      color: `#${label.color}`,
                      border: `1px solid #${label.color}40`,
                    }}
                  >
                    {label.name}
                  </span>
                ))}
              </div>
            )}

            {/* Body */}
            {selectedPR.body ? (
              <Markdown className="text-sm">{selectedPR.body}</Markdown>
            ) : (
              <p className="text-sm text-muted-foreground italic">No description provided.</p>
            )}

            {/* Open in GitHub CTA */}
            <div className="mt-8 p-4 rounded-lg bg-muted/50 border border-border">
              <p className="text-sm text-muted-foreground mb-3">
                View code changes, comments, and reviews on GitHub.
              </p>
              <Button onClick={() => handleOpenInGitHub(selectedPR.url)}>
                <ExternalLink className="h-4 w-4 mr-2" />
                View Full PR on GitHub
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface PRRowProps {
  pr: GitHubPR;
  isSelected: boolean;
  onClick: () => void;
  onOpenExternal: () => void;
  formatDate: (date: string) => string;
  getReviewStatus: (pr: GitHubPR) => { label: string; color: string; bg: string } | null;
}

function PRRow({
  pr,
  isSelected,
  onClick,
  onOpenExternal,
  formatDate,
  getReviewStatus,
}: PRRowProps) {
  const reviewStatus = getReviewStatus(pr);

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 cursor-pointer hover:bg-accent/50 transition-colors',
        isSelected && 'bg-accent'
      )}
      onClick={onClick}
    >
      {pr.state === 'MERGED' ? (
        <GitMerge className="h-4 w-4 text-purple-500 mt-0.5 shrink-0" />
      ) : (
        <GitPullRequest className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{pr.title}</span>
          {pr.isDraft && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-muted text-muted-foreground shrink-0">
              Draft
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-xs text-muted-foreground">
            #{pr.number} opened {formatDate(pr.createdAt)} by {pr.author.login}
          </span>
          {pr.headRefName && (
            <span className="text-xs text-muted-foreground font-mono bg-muted px-1 rounded">
              {pr.headRefName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {/* Review Status */}
          {reviewStatus && (
            <span
              className={cn(
                'px-1.5 py-0.5 text-[10px] font-medium rounded',
                reviewStatus.bg,
                reviewStatus.color
              )}
            >
              {reviewStatus.label}
            </span>
          )}

          {/* Labels */}
          {pr.labels.map((label) => (
            <span
              key={label.name}
              className="px-1.5 py-0.5 text-[10px] font-medium rounded-full"
              style={{
                backgroundColor: `#${label.color}20`,
                color: `#${label.color}`,
                border: `1px solid #${label.color}40`,
              }}
            >
              {label.name}
            </span>
          ))}
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 opacity-0 group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onOpenExternal();
        }}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
