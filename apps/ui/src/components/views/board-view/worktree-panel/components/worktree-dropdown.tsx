import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  GitBranch,
  ChevronDown,
  CircleDot,
  Globe,
  GitPullRequest,
  FlaskConical,
  AlertTriangle,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import type {
  WorktreeInfo,
  BranchInfo,
  DevServerInfo,
  PRInfo,
  GitRepoStatus,
  TestSessionInfo,
} from '../types';
import { WorktreeDropdownItem } from './worktree-dropdown-item';
import { BranchSwitchDropdown } from './branch-switch-dropdown';
import { WorktreeActionsDropdown } from './worktree-actions-dropdown';
import {
  truncateBranchName,
  getPRBadgeStyles,
  getChangesBadgeStyles,
  getConflictBadgeStyles,
  getConflictTypeLabel,
  getTestStatusStyles,
} from './worktree-indicator-utils';

export interface WorktreeDropdownProps {
  /** List of all worktrees to display in the dropdown */
  worktrees: WorktreeInfo[];
  /** Function to check if a worktree is currently selected */
  isWorktreeSelected: (worktree: WorktreeInfo) => boolean;
  /** Function to check if a worktree has running features/processes */
  hasRunningFeatures: (worktree: WorktreeInfo) => boolean;
  /** Whether worktree activation is in progress */
  isActivating: boolean;
  /** Map of branch names to card counts */
  branchCardCounts?: Record<string, number>;
  /** Function to check if dev server is running for a worktree */
  isDevServerRunning: (worktree: WorktreeInfo) => boolean;
  /** Function to get dev server info for a worktree */
  getDevServerInfo: (worktree: WorktreeInfo) => DevServerInfo | undefined;
  /** Function to check if auto-mode is running for a worktree */
  isAutoModeRunningForWorktree: (worktree: WorktreeInfo) => boolean;
  /** Function to check if tests are running for a worktree */
  isTestRunningForWorktree: (worktree: WorktreeInfo) => boolean;
  /** Function to get test session info for a worktree */
  getTestSessionInfo: (worktree: WorktreeInfo) => TestSessionInfo | undefined;
  /** Callback when a worktree is selected */
  onSelectWorktree: (worktree: WorktreeInfo) => void;

  // Branch switching props
  branches: BranchInfo[];
  filteredBranches: BranchInfo[];
  branchFilter: string;
  isLoadingBranches: boolean;
  isSwitching: boolean;
  onBranchDropdownOpenChange: (worktree: WorktreeInfo) => (open: boolean) => void;
  onBranchFilterChange: (value: string) => void;
  onSwitchBranch: (worktree: WorktreeInfo, branchName: string) => void;
  onCreateBranch: (worktree: WorktreeInfo) => void;

  // Action dropdown props
  isPulling: boolean;
  isPushing: boolean;
  isStartingDevServer: boolean;
  aheadCount: number;
  behindCount: number;
  hasRemoteBranch: boolean;
  /** The name of the remote that the current branch is tracking (e.g. "origin"), if any */
  trackingRemote?: string;
  /** Per-worktree tracking remote lookup */
  getTrackingRemote?: (worktreePath: string) => string | undefined;
  gitRepoStatus: GitRepoStatus;
  hasTestCommand: boolean;
  isStartingTests: boolean;
  hasInitScript: boolean;
  onActionsDropdownOpenChange: (worktree: WorktreeInfo) => (open: boolean) => void;
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
  onAddressPRComments: (worktree: WorktreeInfo, prInfo: PRInfo) => void;
  onResolveConflicts: (worktree: WorktreeInfo) => void;
  onMerge: (worktree: WorktreeInfo) => void;
  onDeleteWorktree: (worktree: WorktreeInfo) => void;
  onStartDevServer: (worktree: WorktreeInfo) => void;
  onStopDevServer: (worktree: WorktreeInfo) => void;
  onOpenDevServerUrl: (worktree: WorktreeInfo) => void;
  onViewDevServerLogs: (worktree: WorktreeInfo) => void;
  onRunInitScript: (worktree: WorktreeInfo) => void;
  onToggleAutoMode: (worktree: WorktreeInfo) => void;
  onStartTests: (worktree: WorktreeInfo) => void;
  onStopTests: (worktree: WorktreeInfo) => void;
  onViewTestLogs: (worktree: WorktreeInfo) => void;
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
  /** Remotes cache: maps worktree path to list of remotes */
  remotesCache?: Record<string, Array<{ name: string; url: string }>>;
  /** Pull from a specific remote, bypassing the remote selection dialog */
  onPullWithRemote?: (worktree: WorktreeInfo, remote: string) => void;
  /** Push to a specific remote, bypassing the remote selection dialog */
  onPushWithRemote?: (worktree: WorktreeInfo, remote: string) => void;
}

/**
 * Maximum characters for branch name before truncation in the dropdown trigger.
 * Set to 24 to keep the trigger compact while showing enough context for identification.
 */
const MAX_TRIGGER_BRANCH_NAME_LENGTH = 24;

/**
 * A dropdown component for displaying and switching between worktrees.
 * Used when there are 3+ worktrees to avoid horizontal tab wrapping.
 *
 * Features:
 * - Compact dropdown trigger showing current worktree with indicators
 * - Grouped display (main branch + worktrees)
 * - Full status indicators (PR, dev server, auto mode, changes)
 * - Branch switch dropdown integration
 * - Actions dropdown integration
 * - Tooltip for truncated branch names
 */
export function WorktreeDropdown({
  worktrees,
  isWorktreeSelected,
  hasRunningFeatures,
  isActivating,
  branchCardCounts,
  isDevServerRunning,
  getDevServerInfo,
  isAutoModeRunningForWorktree,
  isTestRunningForWorktree,
  getTestSessionInfo,
  onSelectWorktree,
  // Branch switching props
  branches,
  filteredBranches,
  branchFilter,
  isLoadingBranches,
  isSwitching,
  onBranchDropdownOpenChange,
  onBranchFilterChange,
  onSwitchBranch,
  onCreateBranch,
  // Action dropdown props
  isPulling,
  isPushing,
  isStartingDevServer,
  aheadCount,
  behindCount,
  hasRemoteBranch,
  trackingRemote,
  getTrackingRemote,
  gitRepoStatus,
  hasTestCommand,
  isStartingTests,
  hasInitScript,
  onActionsDropdownOpenChange,
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
  onAddressPRComments,
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
  remotesCache,
  onPullWithRemote,
  onPushWithRemote,
}: WorktreeDropdownProps) {
  // Find the currently selected worktree to display in the trigger
  const selectedWorktree = worktrees.find((w) => isWorktreeSelected(w));
  const displayBranch = selectedWorktree?.branch || 'Select worktree';
  const { truncated: truncatedBranch, isTruncated: isBranchNameTruncated } = truncateBranchName(
    displayBranch,
    MAX_TRIGGER_BRANCH_NAME_LENGTH
  );

  // Separate main worktree from others for grouping
  const mainWorktree = worktrees.find((w) => w.isMain);
  const otherWorktrees = worktrees.filter((w) => !w.isMain);

  // Get status info for selected worktree - memoized to prevent unnecessary recalculations
  const selectedStatus = useMemo(() => {
    if (!selectedWorktree) {
      return {
        devServerRunning: false,
        devServerInfo: undefined,
        autoModeRunning: false,
        isRunning: false,
        testRunning: false,
        testSessionInfo: undefined,
      };
    }
    return {
      devServerRunning: isDevServerRunning(selectedWorktree),
      devServerInfo: getDevServerInfo(selectedWorktree),
      autoModeRunning: isAutoModeRunningForWorktree(selectedWorktree),
      isRunning: hasRunningFeatures(selectedWorktree),
      testRunning: isTestRunningForWorktree(selectedWorktree),
      testSessionInfo: getTestSessionInfo(selectedWorktree),
    };
  }, [
    selectedWorktree,
    isDevServerRunning,
    getDevServerInfo,
    isAutoModeRunningForWorktree,
    hasRunningFeatures,
    isTestRunningForWorktree,
    getTestSessionInfo,
  ]);

  // Build trigger button with all indicators - memoized for performance
  const triggerButton = useMemo(
    () => (
      <Button
        variant="outline"
        size="sm"
        className={cn(
          'h-7 px-3 gap-1.5 font-mono text-xs bg-secondary/50 hover:bg-secondary min-w-0 border-r-0 rounded-r-none'
        )}
        disabled={isActivating}
      >
        {/* Running/Activating indicator */}
        {(selectedStatus.isRunning || isActivating) && <Spinner size="xs" className="shrink-0" />}

        {/* Branch icon */}
        <GitBranch className="w-3.5 h-3.5 shrink-0" />

        {/* Branch name with optional tooltip */}
        <span className="truncate max-w-[150px]">{truncatedBranch}</span>

        {/* Card count badge */}
        {selectedWorktree &&
          branchCardCounts?.[selectedWorktree.branch] !== undefined &&
          branchCardCounts[selectedWorktree.branch] > 0 && (
            <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 text-[10px] font-medium rounded bg-background/80 text-foreground border border-border shrink-0">
              {branchCardCounts[selectedWorktree.branch]}
            </span>
          )}

        {/* Uncommitted changes indicator */}
        {selectedWorktree?.hasChanges && (
          <span
            className={cn(
              'inline-flex items-center justify-center h-4 min-w-4 px-1 text-[10px] font-medium rounded border shrink-0',
              getChangesBadgeStyles()
            )}
          >
            <CircleDot className="w-2.5 h-2.5 mr-0.5" />
            {selectedWorktree.changedFilesCount ?? '!'}
          </span>
        )}

        {/* Dev server indicator */}
        {selectedStatus.devServerRunning && (
          <span
            className="inline-flex items-center justify-center h-4 w-4 text-green-500 shrink-0"
            title={`Dev server running on port ${selectedStatus.devServerInfo?.port}`}
          >
            <Globe className="w-3 h-3" />
          </span>
        )}

        {/* Test running indicator */}
        {selectedStatus.testRunning && (
          <span
            className="inline-flex items-center justify-center h-4 w-4 text-blue-500 shrink-0"
            title="Tests Running"
          >
            <FlaskConical className="w-3 h-3 animate-pulse" />
          </span>
        )}

        {/* Last test result indicator (when not running) */}
        {!selectedStatus.testRunning && selectedStatus.testSessionInfo && (
          <span
            className={cn(
              'inline-flex items-center justify-center h-4 w-4 shrink-0',
              getTestStatusStyles(selectedStatus.testSessionInfo.status)
            )}
            title={`Last test: ${selectedStatus.testSessionInfo.status}`}
          >
            <FlaskConical className="w-3 h-3" />
          </span>
        )}

        {/* Auto mode indicator */}
        {selectedStatus.autoModeRunning && (
          <span
            className="flex items-center justify-center h-4 px-0.5 shrink-0"
            title="Auto Mode Running"
          >
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          </span>
        )}

        {/* Conflict indicator */}
        {selectedWorktree?.hasConflicts && (
          <span
            className={cn(
              'inline-flex items-center justify-center h-4 min-w-4 px-1 text-[10px] font-medium rounded border shrink-0',
              getConflictBadgeStyles()
            )}
            title={`${getConflictTypeLabel(selectedWorktree.conflictType)} conflicts detected`}
          >
            <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
            {getConflictTypeLabel(selectedWorktree.conflictType)}
          </span>
        )}

        {/* PR badge */}
        {selectedWorktree?.pr && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 h-4 px-1 text-[10px] font-medium rounded border shrink-0',
              getPRBadgeStyles(selectedWorktree.pr.state)
            )}
          >
            <GitPullRequest className="w-2.5 h-2.5" />#{selectedWorktree.pr.number}
          </span>
        )}

        {/* Dropdown chevron */}
        <ChevronDown className="w-3 h-3 shrink-0 ml-auto" />
      </Button>
    ),
    [isActivating, selectedStatus, truncatedBranch, selectedWorktree, branchCardCounts]
  );

  // Wrap trigger button with dropdown trigger first to ensure ref is passed correctly
  const dropdownTrigger = <DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>;

  const triggerWithTooltip = isBranchNameTruncated ? (
    <Tooltip>
      <TooltipTrigger asChild>{dropdownTrigger}</TooltipTrigger>
      <TooltipContent>
        <p className="font-mono text-xs">{displayBranch}</p>
      </TooltipContent>
    </Tooltip>
  ) : (
    dropdownTrigger
  );

  return (
    <div className="flex items-center">
      <DropdownMenu>
        {triggerWithTooltip}
        <DropdownMenuContent
          align="start"
          className="w-80 max-h-96 overflow-y-auto"
          aria-label="Worktree selection"
        >
          {/* Main worktree section */}
          {mainWorktree && (
            <>
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Main Branch
              </DropdownMenuLabel>
              <WorktreeDropdownItem
                worktree={mainWorktree}
                isSelected={isWorktreeSelected(mainWorktree)}
                isRunning={hasRunningFeatures(mainWorktree)}
                cardCount={branchCardCounts?.[mainWorktree.branch]}
                devServerRunning={isDevServerRunning(mainWorktree)}
                devServerInfo={getDevServerInfo(mainWorktree)}
                isAutoModeRunning={isAutoModeRunningForWorktree(mainWorktree)}
                isTestRunning={isTestRunningForWorktree(mainWorktree)}
                testSessionInfo={getTestSessionInfo(mainWorktree)}
                onSelect={() => onSelectWorktree(mainWorktree)}
              />
            </>
          )}

          {/* Other worktrees section */}
          {otherWorktrees.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Worktrees ({otherWorktrees.length})
              </DropdownMenuLabel>
              <DropdownMenuGroup>
                {otherWorktrees.map((worktree) => (
                  <WorktreeDropdownItem
                    key={worktree.path}
                    worktree={worktree}
                    isSelected={isWorktreeSelected(worktree)}
                    isRunning={hasRunningFeatures(worktree)}
                    cardCount={branchCardCounts?.[worktree.branch]}
                    devServerRunning={isDevServerRunning(worktree)}
                    devServerInfo={getDevServerInfo(worktree)}
                    isAutoModeRunning={isAutoModeRunningForWorktree(worktree)}
                    isTestRunning={isTestRunningForWorktree(worktree)}
                    testSessionInfo={getTestSessionInfo(worktree)}
                    onSelect={() => onSelectWorktree(worktree)}
                  />
                ))}
              </DropdownMenuGroup>
            </>
          )}

          {/* Empty state */}
          {worktrees.length === 0 && (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              No worktrees available
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Branch switch dropdown for main branch (only when main is selected) */}
      {selectedWorktree?.isMain && (
        <BranchSwitchDropdown
          worktree={selectedWorktree}
          isSelected={true}
          branches={branches}
          filteredBranches={filteredBranches}
          branchFilter={branchFilter}
          isLoadingBranches={isLoadingBranches}
          isSwitching={isSwitching}
          onOpenChange={onBranchDropdownOpenChange(selectedWorktree)}
          onFilterChange={onBranchFilterChange}
          onSwitchBranch={onSwitchBranch}
          onCreateBranch={onCreateBranch}
        />
      )}

      {/* Actions dropdown for the selected worktree */}
      {selectedWorktree && (
        <WorktreeActionsDropdown
          worktree={selectedWorktree}
          isSelected={true}
          aheadCount={aheadCount}
          behindCount={behindCount}
          hasRemoteBranch={hasRemoteBranch}
          trackingRemote={
            getTrackingRemote ? getTrackingRemote(selectedWorktree.path) : trackingRemote
          }
          isPulling={isPulling}
          isPushing={isPushing}
          isStartingDevServer={isStartingDevServer}
          isDevServerRunning={isDevServerRunning(selectedWorktree)}
          devServerInfo={getDevServerInfo(selectedWorktree)}
          gitRepoStatus={gitRepoStatus}
          isLoadingGitStatus={isLoadingBranches}
          isAutoModeRunning={isAutoModeRunningForWorktree(selectedWorktree)}
          hasTestCommand={hasTestCommand}
          isStartingTests={isStartingTests}
          isTestRunning={isTestRunningForWorktree(selectedWorktree)}
          testSessionInfo={getTestSessionInfo(selectedWorktree)}
          remotes={remotesCache?.[selectedWorktree.path]}
          onOpenChange={onActionsDropdownOpenChange(selectedWorktree)}
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
          onAddressPRComments={onAddressPRComments}
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
        />
      )}
    </div>
  );
}
