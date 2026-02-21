import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Check, CircleDot, Globe, GitPullRequest, FlaskConical, AlertTriangle } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import type { WorktreeInfo, DevServerInfo, TestSessionInfo } from '../types';
import {
  truncateBranchName,
  getPRBadgeStyles,
  getChangesBadgeStyles,
  getConflictBadgeStyles,
  getConflictTypeLabel,
  getTestStatusStyles,
} from './worktree-indicator-utils';

/**
 * Maximum characters for branch name before truncation in dropdown items.
 * Set to 28 to accommodate longer names in the wider dropdown menu while
 * still fitting comfortably with all status indicators.
 */
const MAX_ITEM_BRANCH_NAME_LENGTH = 28;

export interface WorktreeDropdownItemProps {
  /** The worktree to display */
  worktree: WorktreeInfo;
  /** Whether this worktree is currently selected */
  isSelected: boolean;
  /** Whether this worktree has running features/processes */
  isRunning: boolean;
  /** Number of cards associated with this worktree's branch */
  cardCount?: number;
  /** Whether the dev server is running for this worktree */
  devServerRunning?: boolean;
  /** Dev server information if running */
  devServerInfo?: DevServerInfo;
  /** Whether auto-mode is running for this worktree */
  isAutoModeRunning?: boolean;
  /** Whether tests are running for this worktree */
  isTestRunning?: boolean;
  /** Test session info for this worktree */
  testSessionInfo?: TestSessionInfo;
  /** Callback when the worktree is selected */
  onSelect: () => void;
}

/**
 * A dropdown menu item component for displaying an individual worktree entry.
 *
 * Features:
 * - Selection indicator (checkmark when selected)
 * - Running status indicator (spinner)
 * - Branch name with tooltip for long names
 * - Main branch badge
 * - Dev server status indicator
 * - Auto mode indicator
 * - Test status indicator
 * - Card count badge
 * - Uncommitted changes indicator
 * - PR status badge
 */
export function WorktreeDropdownItem({
  worktree,
  isSelected,
  isRunning,
  cardCount,
  devServerRunning,
  devServerInfo,
  isAutoModeRunning = false,
  isTestRunning = false,
  testSessionInfo,
  onSelect,
}: WorktreeDropdownItemProps) {
  const { hasChanges, changedFilesCount, pr } = worktree;

  // Truncate long branch names using shared utility
  const { truncated: truncatedBranch, isTruncated: isBranchNameTruncated } = truncateBranchName(
    worktree.branch,
    MAX_ITEM_BRANCH_NAME_LENGTH
  );

  const branchNameElement = (
    <span className={cn('font-mono text-xs truncate', isSelected && 'font-medium')}>
      {truncatedBranch}
    </span>
  );

  return (
    <DropdownMenuItem
      onSelect={onSelect}
      className={cn('flex items-center gap-2 cursor-pointer pr-2', isSelected && 'bg-accent')}
      aria-current={isSelected ? 'true' : undefined}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {/* Selection indicator */}
        {isSelected ? (
          <Check className="w-3.5 h-3.5 shrink-0 text-primary" />
        ) : (
          <div className="w-3.5 h-3.5 shrink-0" />
        )}

        {/* Running indicator */}
        {isRunning && <Spinner size="xs" className="shrink-0" />}

        {/* Branch name with optional tooltip */}
        {isBranchNameTruncated ? (
          <Tooltip>
            <TooltipTrigger asChild>{branchNameElement}</TooltipTrigger>
            <TooltipContent>
              <p className="font-mono text-xs">{worktree.branch}</p>
            </TooltipContent>
          </Tooltip>
        ) : (
          branchNameElement
        )}

        {/* Main badge */}
        {worktree.isMain && (
          <span className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
            main
          </span>
        )}
      </div>

      {/* Right side indicators - ordered consistently with dropdown trigger */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Card count badge */}
        {cardCount !== undefined && cardCount > 0 && (
          <span className="inline-flex items-center justify-center h-4 min-w-[1rem] px-1 text-[10px] font-medium rounded bg-background/80 text-foreground border border-border">
            {cardCount}
          </span>
        )}

        {/* Uncommitted changes indicator */}
        {hasChanges && (
          <span
            className={cn(
              'inline-flex items-center justify-center h-4 min-w-[1rem] px-1 text-[10px] font-medium rounded border',
              getChangesBadgeStyles()
            )}
            title={`${changedFilesCount ?? 'Some'} uncommitted file${changedFilesCount !== 1 ? 's' : ''}`}
          >
            <CircleDot className="w-2.5 h-2.5 mr-0.5" />
            {changedFilesCount ?? '!'}
          </span>
        )}

        {/* Dev server indicator - hidden when URL detection explicitly failed */}
        {devServerRunning && devServerInfo?.urlDetected !== false && (
          <span
            className="inline-flex items-center justify-center h-4 w-4 text-green-500"
            title={`Dev server running on port ${devServerInfo?.port}`}
          >
            <Globe className="w-3 h-3" />
          </span>
        )}

        {/* Test running indicator */}
        {isTestRunning && (
          <span
            className="inline-flex items-center justify-center h-4 w-4 text-blue-500"
            title="Tests Running"
          >
            <FlaskConical className="w-3 h-3 animate-pulse" />
          </span>
        )}

        {/* Last test result indicator (when not running) */}
        {!isTestRunning && testSessionInfo && (
          <span
            className={cn(
              'inline-flex items-center justify-center h-4 w-4',
              getTestStatusStyles(testSessionInfo.status)
            )}
            title={`Last test: ${testSessionInfo.status}`}
          >
            <FlaskConical className="w-3 h-3" />
          </span>
        )}

        {/* Auto mode indicator */}
        {isAutoModeRunning && (
          <span className="flex items-center justify-center h-4 px-0.5" title="Auto Mode Running">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          </span>
        )}

        {/* Conflict indicator */}
        {worktree.hasConflicts && (
          <span
            className={cn(
              'inline-flex items-center justify-center h-4 min-w-[1rem] px-1 text-[10px] font-medium rounded border',
              getConflictBadgeStyles()
            )}
            title={`${getConflictTypeLabel(worktree.conflictType)} conflicts${worktree.conflictFiles?.length ? ` (${worktree.conflictFiles.length} files)` : ''}`}
          >
            <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
            {getConflictTypeLabel(worktree.conflictType)}
          </span>
        )}

        {/* PR indicator */}
        {pr && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 h-4 px-1 text-[10px] font-medium rounded border',
              getPRBadgeStyles(pr.state)
            )}
            title={`PR #${pr.number}: ${pr.title}`}
          >
            <GitPullRequest className="w-2.5 h-2.5" />#{pr.number}
          </span>
        )}
      </div>
    </DropdownMenuItem>
  );
}
