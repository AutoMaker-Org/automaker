import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GitBranch, ChevronDown, CircleDot, Check } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import type { WorktreeInfo } from '../types';

interface WorktreeMobileDropdownProps {
  worktrees: WorktreeInfo[];
  isWorktreeSelected: (worktree: WorktreeInfo) => boolean;
  hasRunningFeatures: (worktree: WorktreeInfo) => boolean;
  isActivating: boolean;
  branchCardCounts?: Record<string, number>;
  onSelectWorktree: (worktree: WorktreeInfo) => void;
}

export function WorktreeMobileDropdown({
  worktrees,
  isWorktreeSelected,
  hasRunningFeatures,
  isActivating,
  branchCardCounts,
  onSelectWorktree,
}: WorktreeMobileDropdownProps) {
  // Find the currently selected worktree to display in the trigger
  const selectedWorktree = worktrees.find((w) => isWorktreeSelected(w));
  const displayBranch = selectedWorktree?.branch || 'Select branch';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 gap-2 font-mono text-xs bg-secondary/50 hover:bg-secondary flex-1 min-w-0"
          disabled={isActivating}
        >
          <GitBranch className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{displayBranch}</span>
          {isActivating ? (
            <Spinner size="xs" className="shrink-0" />
          ) : (
            <ChevronDown className="w-3 h-3 shrink-0 ml-auto" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 max-h-80 overflow-y-auto">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Branches & Worktrees
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {worktrees.map((worktree) => {
          const isSelected = isWorktreeSelected(worktree);
          const isRunning = hasRunningFeatures(worktree);
          const cardCount = branchCardCounts?.[worktree.branch];
          const hasChanges = worktree.hasChanges;
          const changedFilesCount = worktree.changedFilesCount;

          return (
            <DropdownMenuItem
              key={worktree.path}
              onClick={() => onSelectWorktree(worktree)}
              className={cn('flex items-center gap-2 cursor-pointer', isSelected && 'bg-accent')}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {isSelected ? (
                  <Check className="w-3.5 h-3.5 shrink-0 text-primary" />
                ) : (
                  <div className="w-3.5 h-3.5 shrink-0" />
                )}
                {isRunning && <Spinner size="xs" className="shrink-0" />}
                <span className={cn('font-mono text-xs truncate', isSelected && 'font-medium')}>
                  {worktree.branch}
                </span>
                {worktree.isMain && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                    main
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {cardCount !== undefined && cardCount > 0 && (
                  <span className="inline-flex items-center justify-center h-4 min-w-[1rem] px-1 text-[10px] font-medium rounded bg-background/80 text-foreground border border-border">
                    {cardCount}
                  </span>
                )}
                {hasChanges && (
                  <span
                    className={cn(
                      'inline-flex items-center justify-center h-4 min-w-[1rem] px-1 text-[10px] font-medium rounded border',
                      'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30'
                    )}
                    title={`${changedFilesCount ?? 'Some'} uncommitted file${changedFilesCount !== 1 ? 's' : ''}`}
                  >
                    <CircleDot className="w-2.5 h-2.5 mr-0.5" />
                    {changedFilesCount ?? '!'}
                  </span>
                )}
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
