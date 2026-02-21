/**
 * GitHub PRs View
 *
 * Displays pull requests using React Query for data fetching.
 */

import { useState, useCallback } from 'react';
import {
  GitPullRequest,
  RefreshCw,
  ExternalLink,
  GitMerge,
  X,
  MessageSquare,
  MoreHorizontal,
  Zap,
  ArrowLeft,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { getElectronAPI, type GitHubPR } from '@/lib/electron';
import { useAppStore, type Feature } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/markdown';
import { cn, generateUUID } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-media-query';
import { useGitHubPRs } from '@/hooks/queries';
import { useCreateFeature } from '@/hooks/mutations/use-feature-mutations';
import { PRCommentResolutionDialog } from '@/components/dialogs';
import { resolveModelString } from '@automaker/model-resolver';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function GitHubPRsView() {
  const [selectedPR, setSelectedPR] = useState<GitHubPR | null>(null);
  const [commentDialogPR, setCommentDialogPR] = useState<GitHubPR | null>(null);
  const { currentProject } = useAppStore();
  const isMobile = useIsMobile();

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

  const createFeature = useCreateFeature(currentProject?.path ?? '');

  const handleAutoAddressComments = useCallback(
    async (pr: GitHubPR) => {
      if (!pr.number || !currentProject?.path) {
        toast.error('Cannot address PR comments', {
          description: 'No PR number or project available.',
        });
        return;
      }

      const featureId = `pr-${pr.number}-${generateUUID()}`;
      const feature: Feature = {
        id: featureId,
        title: `Address PR #${pr.number} Review Comments`,
        category: 'bug-fix',
        description: `Read the review requests on PR #${pr.number} and address any feedback the best you can.`,
        steps: [],
        status: 'backlog',
        model: resolveModelString('opus'),
        thinkingLevel: 'none',
        planningMode: 'skip',
        ...(pr.headRefName ? { branchName: pr.headRefName } : {}),
      };

      try {
        await createFeature.mutateAsync(feature);

        // Start the feature immediately after creation
        const api = getElectronAPI();
        if (api.autoMode?.runFeature) {
          try {
            await api.autoMode.runFeature(currentProject.path, featureId);
            toast.success('Feature created and started', {
              description: `Addressing review comments on PR #${pr.number}`,
            });
          } catch (runError) {
            toast.error('Feature created but failed to start', {
              description:
                runError instanceof Error
                  ? runError.message
                  : 'An error occurred while starting the feature',
            });
          }
        } else {
          toast.error('Cannot start feature', {
            description:
              'Feature API is not available. The feature was created but could not be started.',
          });
        }
      } catch (error) {
        toast.error('Failed to create feature', {
          description: error instanceof Error ? error.message : 'An error occurred',
        });
      }
    },
    [currentProject, createFeature]
  );

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
      {/* PR List - hidden on mobile when a PR is selected */}
      <div
        className={cn(
          'flex flex-col overflow-hidden border-r border-border',
          selectedPR ? 'w-80' : 'flex-1',
          isMobile && selectedPR && 'hidden'
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
                  onManageComments={() => setCommentDialogPR(pr)}
                  onAutoAddressComments={() => handleAutoAddressComments(pr)}
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
                      onManageComments={() => setCommentDialogPR(pr)}
                      onAutoAddressComments={() => handleAutoAddressComments(pr)}
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
      {selectedPR &&
        (() => {
          const reviewStatus = getReviewStatus(selectedPR);
          return (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Detail Header */}
              <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {isMobile && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedPR(null)}
                      className="shrink-0 -ml-1"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  )}
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
                <div className={cn('flex items-center gap-2 shrink-0', isMobile && 'gap-1')}>
                  {!isMobile && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCommentDialogPR(selectedPR)}
                    >
                      <MessageSquare className="h-4 w-4 mr-1" />
                      Manage Comments
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenInGitHub(selectedPR.url)}
                  >
                    <ExternalLink className="h-4 w-4" />
                    {!isMobile && <span className="ml-1">Open in GitHub</span>}
                  </Button>
                  {!isMobile && (
                    <Button variant="ghost" size="sm" onClick={() => setSelectedPR(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* PR Detail Content */}
              <div className={cn('flex-1 overflow-auto', isMobile ? 'p-4' : 'p-6')}>
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
                    {selectedPR.state === 'MERGED'
                      ? 'Merged'
                      : selectedPR.isDraft
                        ? 'Draft'
                        : 'Open'}
                  </span>
                  {reviewStatus && (
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-full text-xs font-medium',
                        reviewStatus.bg,
                        reviewStatus.color
                      )}
                    >
                      {reviewStatus.label}
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

                {/* Review Comments CTA */}
                <div className="mt-8 p-4 rounded-lg bg-blue-500/5 border border-blue-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-medium">Review Comments</span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Manage review comments individually or let AI address all feedback
                    automatically.
                  </p>
                  <div className={cn('flex gap-2', isMobile ? 'flex-col' : 'items-center')}>
                    <Button variant="outline" onClick={() => setCommentDialogPR(selectedPR)}>
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Manage Review Comments
                    </Button>
                    <Button variant="outline" onClick={() => handleAutoAddressComments(selectedPR)}>
                      <Zap className="h-4 w-4 mr-2" />
                      Address Review Comments
                    </Button>
                  </div>
                </div>

                {/* Open in GitHub CTA */}
                <div className="mt-4 p-4 rounded-lg bg-muted/50 border border-border">
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
          );
        })()}

      {/* PR Comment Resolution Dialog */}
      {commentDialogPR && (
        <PRCommentResolutionDialog
          open={!!commentDialogPR}
          onOpenChange={(open) => {
            if (!open) setCommentDialogPR(null);
          }}
          pr={commentDialogPR}
        />
      )}
    </div>
  );
}

interface PRRowProps {
  pr: GitHubPR;
  isSelected: boolean;
  onClick: () => void;
  onOpenExternal: () => void;
  onManageComments: () => void;
  onAutoAddressComments: () => void;
  formatDate: (date: string) => string;
  getReviewStatus: (pr: GitHubPR) => { label: string; color: string; bg: string } | null;
}

function PRRow({
  pr,
  isSelected,
  onClick,
  onOpenExternal,
  onManageComments,
  onAutoAddressComments,
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

      {/* Actions dropdown menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 h-7 w-7 p-0"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onManageComments();
            }}
            className="text-xs text-blue-500 focus:text-blue-600"
          >
            <MessageSquare className="h-3.5 w-3.5 mr-2" />
            Manage PR Comments
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onAutoAddressComments();
            }}
            className="text-xs text-blue-500 focus:text-blue-600"
          >
            <Zap className="h-3.5 w-3.5 mr-2" />
            Address PR Comments
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onOpenExternal();
            }}
            className="text-xs"
          >
            <ExternalLink className="h-3.5 w-3.5 mr-2" />
            Open in GitHub
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
