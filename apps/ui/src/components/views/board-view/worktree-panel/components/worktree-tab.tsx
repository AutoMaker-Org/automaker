import { Button } from '@/components/ui/button';
import { RefreshCw, Globe, Loader2, CircleDot, GitPullRequest } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { WorktreeInfo, BranchInfo, DevServerInfo, PRInfo, GitRepoStatus } from '../types';
import { BranchSwitchDropdown } from './branch-switch-dropdown';
import { WorktreeActionsDropdown } from './worktree-actions-dropdown';

interface WorktreeTabProps {
  worktree: WorktreeInfo;
  cardCount?: number; // Number of unarchived cards for this branch
  hasChanges?: boolean; // Whether the worktree has uncommitted changes
  changedFilesCount?: number; // Number of files with uncommitted changes
  isSelected: boolean;
  isRunning: boolean;
  isActivating: boolean;
  isDevServerRunning: boolean;
  devServerInfo?: DevServerInfo;
  defaultEditorName: string;
  branches: BranchInfo[];
  filteredBranches: BranchInfo[];
  branchFilter: string;
  isLoadingBranches: boolean;
  isSwitching: boolean;
  isPulling: boolean;
  isPushing: boolean;
  isStartingDevServer: boolean;
  aheadCount: number;
  behindCount: number;
  gitRepoStatus: GitRepoStatus;
  onSelectWorktree: (worktree: WorktreeInfo) => void;
  onBranchDropdownOpenChange: (open: boolean) => void;
  onActionsDropdownOpenChange: (open: boolean) => void;
  onBranchFilterChange: (value: string) => void;
  onSwitchBranch: (worktree: WorktreeInfo, branchName: string) => void;
  onCreateBranch: (worktree: WorktreeInfo) => void;
  onPull: (worktree: WorktreeInfo) => void;
  onPush: (worktree: WorktreeInfo) => void;
  onOpenInEditor: (worktree: WorktreeInfo) => void;
  onCommit: (worktree: WorktreeInfo) => void;
  onCreatePR: (worktree: WorktreeInfo) => void;
  onAddressPRComments: (worktree: WorktreeInfo, prInfo: PRInfo) => void;
  onResolveConflicts: (worktree: WorktreeInfo) => void;
  onDeleteWorktree: (worktree: WorktreeInfo) => void;
  onStartDevServer: (worktree: WorktreeInfo) => void;
  onStopDevServer: (worktree: WorktreeInfo) => void;
  onOpenDevServerUrl: (worktree: WorktreeInfo) => void;
}

export function WorktreeTab({
  worktree,
  cardCount,
  hasChanges,
  changedFilesCount,
  isSelected,
  isRunning,
  isActivating,
  isDevServerRunning,
  devServerInfo,
  defaultEditorName,
  branches,
  filteredBranches,
  branchFilter,
  isLoadingBranches,
  isSwitching,
  isPulling,
  isPushing,
  isStartingDevServer,
  aheadCount,
  behindCount,
  gitRepoStatus,
  onSelectWorktree,
  onBranchDropdownOpenChange,
  onActionsDropdownOpenChange,
  onBranchFilterChange,
  onSwitchBranch,
  onCreateBranch,
  onPull,
  onPush,
  onOpenInEditor,
  onCommit,
  onCreatePR,
  onAddressPRComments,
  onResolveConflicts,
  onDeleteWorktree,
  onStartDevServer,
  onStopDevServer,
  onOpenDevServerUrl,
}: WorktreeTabProps) {
  let prBadge: JSX.Element | null = null;
  if (worktree.pr) {
    const prState = worktree.pr.state?.toLowerCase() ?? 'open';
    const prStateClasses = (() => {
      // When selected (active tab), use high contrast solid background (paper-like)
      if (isSelected) {
        return 'bg-background text-foreground border-transparent shadow-sm';
      }

      // When not selected, use the colored variants
      switch (prState) {
        case 'open':
        case 'reopened':
          return 'bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 dark:border-emerald-500/40 hover:bg-emerald-500/25';
        case 'draft':
          return 'bg-amber-500/15 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30 dark:border-amber-500/40 hover:bg-amber-500/25';
        case 'merged':
          return 'bg-purple-500/15 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30 dark:border-purple-500/40 hover:bg-purple-500/25';
        case 'closed':
          return 'bg-rose-500/15 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30 dark:border-rose-500/40 hover:bg-rose-500/25';
        default:
          return 'bg-muted text-muted-foreground border-border/60 hover:bg-muted/80';
      }
    })();

    const prLabel = `Pull Request #${worktree.pr.number}, ${prState}${worktree.pr.title ? `: ${worktree.pr.title}` : ''}`;

    // Helper to get status icon color for the selected state
    const getStatusColorClass = () => {
      if (!isSelected) return '';
      switch (prState) {
        case 'open':
        case 'reopened':
          return 'text-emerald-600 dark:text-emerald-500';
        case 'draft':
          return 'text-amber-600 dark:text-amber-500';
        case 'merged':
          return 'text-purple-600 dark:text-purple-500';
        case 'closed':
          return 'text-rose-600 dark:text-rose-500';
        default:
          return 'text-muted-foreground';
      }
    };

    prBadge = (
      <span
        role="button"
        tabIndex={0}
        className={cn(
          'ml-1.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background',
          'cursor-pointer hover:opacity-80 active:opacity-70',
          prStateClasses
        )}
        title={`${prLabel} - Click to open`}
        aria-label={`${prLabel} - Click to open pull request`}
        onClick={(e) => {
          e.stopPropagation(); // Prevent triggering worktree selection
          if (worktree.pr?.url) {
            window.open(worktree.pr.url, '_blank', 'noopener,noreferrer');
          }
        }}
        onKeyDown={(e) => {
          // Prevent event from bubbling to parent button
          e.stopPropagation();
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (worktree.pr?.url) {
              window.open(worktree.pr.url, '_blank', 'noopener,noreferrer');
            }
          }
        }}
      >
        <GitPullRequest className={cn('w-3 h-3', getStatusColorClass())} aria-hidden="true" />
        <span aria-hidden="true" className={isSelected ? 'text-foreground font-semibold' : ''}>
          PR #{worktree.pr.number}
        </span>
        <span className={cn('capitalize', getStatusColorClass())} aria-hidden="true">
          {prState}
        </span>
      </span>
    );
  }

  return (
    <div className="flex items-center rounded-md">
      {worktree.isMain ? (
        <>
          <Button
            variant={isSelected ? 'default' : 'outline'}
            size="sm"
            className={cn(
              'h-7 px-3 text-xs font-mono gap-1.5 border-r-0 rounded-l-md rounded-r-none',
              isSelected && 'bg-primary text-primary-foreground',
              !isSelected && 'bg-secondary/50 hover:bg-secondary'
            )}
            onClick={() => onSelectWorktree(worktree)}
            disabled={isActivating}
            title={`Click to preview ${worktree.branch}`}
            aria-label={worktree.branch}
            data-testid={`worktree-branch-${worktree.branch}`}
          >
            {isRunning && <Loader2 className="w-3 h-3 animate-spin" />}
            {isActivating && !isRunning && <RefreshCw className="w-3 h-3 animate-spin" />}
            {worktree.branch}
            {cardCount !== undefined && cardCount > 0 && (
              <span className="inline-flex items-center justify-center h-4 min-w-[1rem] px-1 text-[10px] font-medium rounded bg-background/80 text-foreground border border-border">
                {cardCount}
              </span>
            )}
            {hasChanges && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        'inline-flex items-center justify-center h-4 min-w-[1rem] px-1 text-[10px] font-medium rounded border',
                        isSelected
                          ? 'bg-amber-500 text-amber-950 border-amber-400'
                          : 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30'
                      )}
                    >
                      <CircleDot className="w-2.5 h-2.5 mr-0.5" />
                      {changedFilesCount ?? '!'}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {changedFilesCount ?? 'Some'} uncommitted file
                      {changedFilesCount !== 1 ? 's' : ''}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {prBadge}
          </Button>
          <BranchSwitchDropdown
            worktree={worktree}
            isSelected={isSelected}
            branches={branches}
            filteredBranches={filteredBranches}
            branchFilter={branchFilter}
            isLoadingBranches={isLoadingBranches}
            isSwitching={isSwitching}
            onOpenChange={onBranchDropdownOpenChange}
            onFilterChange={onBranchFilterChange}
            onSwitchBranch={onSwitchBranch}
            onCreateBranch={onCreateBranch}
          />
        </>
      ) : (
        <Button
          variant={isSelected ? 'default' : 'outline'}
          size="sm"
          className={cn(
            'h-7 px-3 text-xs font-mono gap-1.5 rounded-l-md rounded-r-none border-r-0',
            isSelected && 'bg-primary text-primary-foreground',
            !isSelected && 'bg-secondary/50 hover:bg-secondary',
            !worktree.hasWorktree && !isSelected && 'opacity-70'
          )}
          onClick={() => onSelectWorktree(worktree)}
          disabled={isActivating}
          title={
            worktree.hasWorktree
              ? "Click to switch to this worktree's branch"
              : 'Click to switch to this branch'
          }
        >
          {isRunning && <Loader2 className="w-3 h-3 animate-spin" />}
          {isActivating && !isRunning && <RefreshCw className="w-3 h-3 animate-spin" />}
          {worktree.branch}
          {cardCount !== undefined && cardCount > 0 && (
            <span className="inline-flex items-center justify-center h-4 min-w-[1rem] px-1 text-[10px] font-medium rounded bg-background/80 text-foreground border border-border">
              {cardCount}
            </span>
          )}
          {hasChanges && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      'inline-flex items-center justify-center h-4 min-w-[1rem] px-1 text-[10px] font-medium rounded border',
                      isSelected
                        ? 'bg-amber-500 text-amber-950 border-amber-400'
                        : 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30'
                    )}
                  >
                    <CircleDot className="w-2.5 h-2.5 mr-0.5" />
                    {changedFilesCount ?? '!'}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {changedFilesCount ?? 'Some'} uncommitted file
                    {changedFilesCount !== 1 ? 's' : ''}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {prBadge}
        </Button>
      )}

      {isDevServerRunning && (
        <Button
          variant={isSelected ? 'default' : 'outline'}
          size="sm"
          className={cn(
            'h-7 w-7 p-0 rounded-none border-r-0',
            isSelected && 'bg-primary text-primary-foreground',
            !isSelected && 'bg-secondary/50 hover:bg-secondary',
            'text-green-500'
          )}
          onClick={() => onOpenDevServerUrl(worktree)}
          title={`Open dev server (port ${devServerInfo?.port})`}
        >
          <Globe className="w-3 h-3" />
        </Button>
      )}

      <WorktreeActionsDropdown
        worktree={worktree}
        isSelected={isSelected}
        defaultEditorName={defaultEditorName}
        aheadCount={aheadCount}
        behindCount={behindCount}
        isPulling={isPulling}
        isPushing={isPushing}
        isStartingDevServer={isStartingDevServer}
        isDevServerRunning={isDevServerRunning}
        devServerInfo={devServerInfo}
        gitRepoStatus={gitRepoStatus}
        onOpenChange={onActionsDropdownOpenChange}
        onPull={onPull}
        onPush={onPush}
        onOpenInEditor={onOpenInEditor}
        onCommit={onCommit}
        onCreatePR={onCreatePR}
        onAddressPRComments={onAddressPRComments}
        onResolveConflicts={onResolveConflicts}
        onDeleteWorktree={onDeleteWorktree}
        onStartDevServer={onStartDevServer}
        onStopDevServer={onStopDevServer}
        onOpenDevServerUrl={onOpenDevServerUrl}
      />
    </div>
  );
}
