import type { JSX } from 'react';
import { Button } from '@/components/ui/button';
import { Globe, CircleDot, GitPullRequest, AlertTriangle } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDroppable } from '@dnd-kit/core';
import type {
  WorktreeInfo,
  BranchInfo,
  DevServerInfo,
  PRInfo,
  GitRepoStatus,
  TestSessionInfo,
} from '../types';
import { BranchSwitchDropdown } from './branch-switch-dropdown';
import { WorktreeActionsDropdown } from './worktree-actions-dropdown';
import { getConflictBadgeStyles, getConflictTypeLabel } from './worktree-indicator-utils';

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
  hasRemoteBranch: boolean;
  /** The name of the remote that the current branch is tracking (e.g. "origin"), if any */
  trackingRemote?: string;
  gitRepoStatus: GitRepoStatus;
  /** Whether auto mode is running for this worktree */
  isAutoModeRunning?: boolean;
  /** Whether tests are being started for this worktree */
  isStartingTests?: boolean;
  /** Whether tests are currently running for this worktree */
  isTestRunning?: boolean;
  /** Active test session info for this worktree */
  testSessionInfo?: TestSessionInfo;
  onSelectWorktree: (worktree: WorktreeInfo) => void;
  onBranchDropdownOpenChange: (open: boolean) => void;
  onActionsDropdownOpenChange: (open: boolean) => void;
  onBranchFilterChange: (value: string) => void;
  onSwitchBranch: (worktree: WorktreeInfo, branchName: string) => void;
  onCreateBranch: (worktree: WorktreeInfo) => void;
  onPull: (worktree: WorktreeInfo) => void;
  onPush: (worktree: WorktreeInfo) => void;
  onPushNewBranch: (worktree: WorktreeInfo) => void;
  onOpenInEditor: (worktree: WorktreeInfo, editorCommand?: string) => void;
  onOpenInIntegratedTerminal: (worktree: WorktreeInfo, mode?: 'tab' | 'split') => void;
  onOpenInExternalTerminal: (worktree: WorktreeInfo, terminalId?: string) => void;
  onViewChanges: (worktree: WorktreeInfo) => void;
  onViewCommits: (worktree: WorktreeInfo) => void;
  onDiscardChanges: (worktree: WorktreeInfo) => void;
  onCommit: (worktree: WorktreeInfo) => void;
  onCreatePR: (worktree: WorktreeInfo) => void;
  onChangePRNumber?: (worktree: WorktreeInfo) => void;
  onAddressPRComments: (worktree: WorktreeInfo, prInfo: PRInfo) => void;
  onAutoAddressPRComments: (worktree: WorktreeInfo, prInfo: PRInfo) => void;
  onResolveConflicts: (worktree: WorktreeInfo) => void;
  onMerge: (worktree: WorktreeInfo) => void;
  onDeleteWorktree: (worktree: WorktreeInfo) => void;
  onStartDevServer: (worktree: WorktreeInfo) => void;
  onStopDevServer: (worktree: WorktreeInfo) => void;
  onOpenDevServerUrl: (worktree: WorktreeInfo) => void;
  onViewDevServerLogs: (worktree: WorktreeInfo) => void;
  onRunInitScript: (worktree: WorktreeInfo) => void;
  onToggleAutoMode?: (worktree: WorktreeInfo) => void;
  /** Start running tests for this worktree */
  onStartTests?: (worktree: WorktreeInfo) => void;
  /** Stop running tests for this worktree */
  onStopTests?: (worktree: WorktreeInfo) => void;
  /** View test logs for this worktree */
  onViewTestLogs?: (worktree: WorktreeInfo) => void;
  /** Stash changes for this worktree */
  onStashChanges?: (worktree: WorktreeInfo) => void;
  /** View stashes for this worktree */
  onViewStashes?: (worktree: WorktreeInfo) => void;
  /** Cherry-pick commits from another branch */
  onCherryPick?: (worktree: WorktreeInfo) => void;
  /** Abort an in-progress merge/rebase/cherry-pick */
  onAbortOperation?: (worktree: WorktreeInfo) => void;
  /** Continue an in-progress merge/rebase/cherry-pick after resolving conflicts */
  onContinueOperation?: (worktree: WorktreeInfo) => void;
  hasInitScript: boolean;
  /** Whether a test command is configured in project settings */
  hasTestCommand?: boolean;
  /** List of available remotes for this worktree (used to show remote submenu) */
  remotes?: Array<{ name: string; url: string }>;
  /** Pull from a specific remote, bypassing the remote selection dialog */
  onPullWithRemote?: (worktree: WorktreeInfo, remote: string) => void;
  /** Push to a specific remote, bypassing the remote selection dialog */
  onPushWithRemote?: (worktree: WorktreeInfo, remote: string) => void;
  /** Terminal quick scripts configured for the project */
  terminalScripts?: import('@/components/views/project-settings-view/terminal-scripts-constants').TerminalScript[];
  /** Callback to run a terminal quick script in a new terminal session */
  onRunTerminalScript?: (worktree: WorktreeInfo, command: string) => void;
  /** Callback to open the script editor UI */
  onEditScripts?: () => void;
  /** Whether sync is in progress */
  isSyncing?: boolean;
  /** Sync (pull + push) callback */
  onSync?: (worktree: WorktreeInfo) => void;
  /** Sync with a specific remote */
  onSyncWithRemote?: (worktree: WorktreeInfo, remote: string) => void;
  /** Set tracking branch to a specific remote */
  onSetTracking?: (worktree: WorktreeInfo, remote: string) => void;
  /** List of remote names that have a branch matching the current branch name */
  remotesWithBranch?: string[];
  /** Available worktrees for swapping into this slot (non-main only) */
  availableWorktreesForSwap?: WorktreeInfo[];
  /** The slot index for this tab in the pinned list (0-based, excluding main) */
  slotIndex?: number;
  /** Callback when user swaps this slot to a different worktree */
  onSwapWorktree?: (slotIndex: number, newBranch: string) => void;
  /** List of currently pinned branch names (to show which are pinned in the swap dropdown) */
  pinnedBranches?: string[];
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
  hasRemoteBranch,
  trackingRemote,
  gitRepoStatus,
  isAutoModeRunning = false,
  isStartingTests = false,
  isTestRunning = false,
  testSessionInfo,
  onSelectWorktree,
  onBranchDropdownOpenChange,
  onActionsDropdownOpenChange,
  onBranchFilterChange,
  onSwitchBranch,
  onCreateBranch,
  onPull,
  onPush,
  onPushNewBranch,
  onOpenInEditor,
  onOpenInIntegratedTerminal,
  onOpenInExternalTerminal,
  onViewChanges,
  onViewCommits,
  onDiscardChanges,
  onCommit,
  onCreatePR,
  onChangePRNumber,
  onAddressPRComments,
  onAutoAddressPRComments,
  onResolveConflicts,
  onMerge,
  onDeleteWorktree,
  onStartDevServer,
  onStopDevServer,
  onOpenDevServerUrl,
  onViewDevServerLogs,
  onRunInitScript,
  onToggleAutoMode,
  onStartTests,
  onStopTests,
  onViewTestLogs,
  onStashChanges,
  onViewStashes,
  onCherryPick,
  onAbortOperation,
  onContinueOperation,
  hasInitScript,
  hasTestCommand = false,
  remotes,
  onPullWithRemote,
  onPushWithRemote,
  terminalScripts,
  onRunTerminalScript,
  onEditScripts,
  isSyncing = false,
  onSync,
  onSyncWithRemote,
  onSetTracking,
  remotesWithBranch,
  availableWorktreesForSwap,
  slotIndex,
  onSwapWorktree,
  pinnedBranches,
}: WorktreeTabProps) {
  // Make the worktree tab a drop target for feature cards
  const { setNodeRef, isOver } = useDroppable({
    id: `worktree-drop-${worktree.branch}`,
    data: {
      type: 'worktree',
      branch: worktree.branch,
      path: worktree.path,
      isMain: worktree.isMain,
    },
  });
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
    <div
      ref={setNodeRef}
      className={cn(
        'flex items-center rounded-md transition-all duration-150',
        isOver && 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-105'
      )}
    >
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
            {isRunning && <Spinner size="xs" variant={isSelected ? 'foreground' : 'primary'} />}
            {isActivating && !isRunning && (
              <Spinner size="xs" variant={isSelected ? 'foreground' : 'primary'} />
            )}
            {worktree.branch}
            {cardCount !== undefined && cardCount > 0 && (
              <span className="inline-flex items-center justify-center h-4 min-w-[1rem] px-1 text-[10px] font-medium rounded bg-background/80 text-foreground border border-border">
                {cardCount}
              </span>
            )}
            {hasChanges && (
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
            )}
            {worktree.hasConflicts && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      'inline-flex items-center justify-center h-4 min-w-[1rem] px-1 text-[10px] font-medium rounded border',
                      isSelected ? 'bg-red-500 text-white border-red-400' : getConflictBadgeStyles()
                    )}
                  >
                    <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                    {getConflictTypeLabel(worktree.conflictType)}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {getConflictTypeLabel(worktree.conflictType)} conflicts detected
                    {worktree.conflictFiles && worktree.conflictFiles.length > 0
                      ? ` (${worktree.conflictFiles.length} file${worktree.conflictFiles.length !== 1 ? 's' : ''})`
                      : ''}
                  </p>
                </TooltipContent>
              </Tooltip>
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
          {isRunning && <Spinner size="xs" variant={isSelected ? 'foreground' : 'primary'} />}
          {isActivating && !isRunning && (
            <Spinner size="xs" variant={isSelected ? 'foreground' : 'primary'} />
          )}
          {worktree.branch}
          {cardCount !== undefined && cardCount > 0 && (
            <span className="inline-flex items-center justify-center h-4 min-w-[1rem] px-1 text-[10px] font-medium rounded bg-background/80 text-foreground border border-border">
              {cardCount}
            </span>
          )}
          {hasChanges && (
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
          )}
          {worktree.hasConflicts && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    'inline-flex items-center justify-center h-4 min-w-[1rem] px-1 text-[10px] font-medium rounded border',
                    isSelected ? 'bg-red-500 text-white border-red-400' : getConflictBadgeStyles()
                  )}
                >
                  <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                  {getConflictTypeLabel(worktree.conflictType)}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {getConflictTypeLabel(worktree.conflictType)} conflicts detected
                  {worktree.conflictFiles && worktree.conflictFiles.length > 0
                    ? ` (${worktree.conflictFiles.length} file${worktree.conflictFiles.length !== 1 ? 's' : ''})`
                    : ''}
                </p>
              </TooltipContent>
            </Tooltip>
          )}
          {prBadge}
        </Button>
      )}

      {isDevServerRunning && devServerInfo?.urlDetected !== false && (
        <Tooltip>
          <TooltipTrigger asChild>
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
              aria-label={`Open dev server on port ${devServerInfo?.port} in browser`}
            >
              <Globe className="w-3 h-3" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Open dev server (:{devServerInfo?.port})</p>
          </TooltipContent>
        </Tooltip>
      )}

      {isAutoModeRunning && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                'flex items-center justify-center h-7 px-1.5 rounded-none border-r-0',
                isSelected ? 'bg-primary text-primary-foreground' : 'bg-secondary/50'
              )}
            >
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>Auto Mode Running</p>
          </TooltipContent>
        </Tooltip>
      )}

      <WorktreeActionsDropdown
        worktree={worktree}
        isSelected={isSelected}
        aheadCount={aheadCount}
        behindCount={behindCount}
        hasRemoteBranch={hasRemoteBranch}
        trackingRemote={trackingRemote}
        isPulling={isPulling}
        isPushing={isPushing}
        isStartingDevServer={isStartingDevServer}
        isDevServerRunning={isDevServerRunning}
        devServerInfo={devServerInfo}
        gitRepoStatus={gitRepoStatus}
        isLoadingGitStatus={isLoadingBranches}
        isAutoModeRunning={isAutoModeRunning}
        hasTestCommand={hasTestCommand}
        isStartingTests={isStartingTests}
        isTestRunning={isTestRunning}
        testSessionInfo={testSessionInfo}
        remotes={remotes}
        onOpenChange={onActionsDropdownOpenChange}
        onPull={onPull}
        onPush={onPush}
        onPushNewBranch={onPushNewBranch}
        onPullWithRemote={onPullWithRemote}
        onPushWithRemote={onPushWithRemote}
        onOpenInEditor={onOpenInEditor}
        onOpenInIntegratedTerminal={onOpenInIntegratedTerminal}
        onOpenInExternalTerminal={onOpenInExternalTerminal}
        onViewChanges={onViewChanges}
        onViewCommits={onViewCommits}
        onDiscardChanges={onDiscardChanges}
        onCommit={onCommit}
        onCreatePR={onCreatePR}
        onChangePRNumber={onChangePRNumber}
        onAddressPRComments={onAddressPRComments}
        onAutoAddressPRComments={onAutoAddressPRComments}
        onResolveConflicts={onResolveConflicts}
        onMerge={onMerge}
        onDeleteWorktree={onDeleteWorktree}
        onStartDevServer={onStartDevServer}
        onStopDevServer={onStopDevServer}
        onOpenDevServerUrl={onOpenDevServerUrl}
        onViewDevServerLogs={onViewDevServerLogs}
        onRunInitScript={onRunInitScript}
        onToggleAutoMode={onToggleAutoMode}
        onStartTests={onStartTests}
        onStopTests={onStopTests}
        onViewTestLogs={onViewTestLogs}
        onStashChanges={onStashChanges}
        onViewStashes={onViewStashes}
        onCherryPick={onCherryPick}
        onAbortOperation={onAbortOperation}
        onContinueOperation={onContinueOperation}
        hasInitScript={hasInitScript}
        terminalScripts={terminalScripts}
        onRunTerminalScript={onRunTerminalScript}
        onEditScripts={onEditScripts}
        isSyncing={isSyncing}
        onSync={onSync}
        onSyncWithRemote={onSyncWithRemote}
        onSetTracking={onSetTracking}
        remotesWithBranch={remotesWithBranch}
        availableWorktreesForSwap={availableWorktreesForSwap}
        slotIndex={slotIndex}
        onSwapWorktree={onSwapWorktree}
        pinnedBranches={pinnedBranches}
      />
    </div>
  );
}
