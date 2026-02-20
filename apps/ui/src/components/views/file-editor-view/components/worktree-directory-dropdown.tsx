/**
 * WorktreeDirectoryDropdown
 *
 * A dropdown for the file editor header that allows the user to select which
 * worktree directory to work from (or the main project directory).
 *
 * Reads the current worktree selection from the app store so that when a user
 * is on a worktree in the board view and then navigates to the file editor,
 * it defaults to that worktree directory.
 */

import { useMemo } from 'react';
import { GitBranch, ChevronDown, Check, FolderRoot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAppStore } from '@/store/app-store';
import { useWorktrees } from '@/hooks/queries';
import { pathsEqual } from '@/lib/utils';

interface WorktreeDirectoryDropdownProps {
  projectPath: string;
}

// Stable empty array to avoid creating a new reference every render when there are no worktrees.
// Zustand compares selector results by reference; returning `[]` inline (e.g. via `?? []`) creates
// a new array on every call, causing `forceStoreRerender` to trigger an infinite update loop.
const EMPTY_WORKTREES: never[] = [];

export function WorktreeDirectoryDropdown({ projectPath }: WorktreeDirectoryDropdownProps) {
  // Select primitive/stable values directly from the store to prevent infinite re-renders.
  // Computed selectors that return new arrays/objects on every call (e.g. via `?? []`)
  // are compared by reference, causing Zustand to force re-renders on every store update.
  const currentWorktree = useAppStore((s) => s.currentWorktreeByProject[projectPath] ?? null);
  const setCurrentWorktree = useAppStore((s) => s.setCurrentWorktree);
  const worktreesInStore = useAppStore((s) => s.worktreesByProject[projectPath] ?? EMPTY_WORKTREES);
  const useWorktreesEnabled = useAppStore((s) => {
    const projectOverride = s.useWorktreesByProject[projectPath];
    return projectOverride !== undefined ? projectOverride : s.useWorktrees;
  });

  // Fetch worktrees from query
  const { data } = useWorktrees(projectPath);
  const worktrees = useMemo(() => data?.worktrees ?? [], [data?.worktrees]);

  // Also consider store worktrees as fallback
  const effectiveWorktrees = worktrees.length > 0 ? worktrees : worktreesInStore;

  // Don't render if worktrees are not enabled or only the main branch exists
  if (!useWorktreesEnabled || effectiveWorktrees.length <= 1) {
    return null;
  }

  const currentWorktreePath = currentWorktree?.path ?? null;
  const currentBranch = currentWorktree?.branch ?? 'main';

  // Find main worktree
  const mainWorktree = effectiveWorktrees.find((w) => w.isMain);
  const otherWorktrees = effectiveWorktrees.filter((w) => !w.isMain);

  // Determine display name for the selected worktree
  const selectedIsMain = currentWorktreePath === null;
  const selectedBranchName = selectedIsMain ? (mainWorktree?.branch ?? 'main') : currentBranch;

  // Truncate long branch names for the trigger button
  const maxTriggerLength = 20;
  const displayName =
    selectedBranchName.length > maxTriggerLength
      ? `${selectedBranchName.slice(0, maxTriggerLength)}...`
      : selectedBranchName;

  const handleSelectWorktree = (worktreePath: string | null, branch: string) => {
    setCurrentWorktree(projectPath, worktreePath, branch);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 max-w-[200px] text-xs"
          title={`Working directory: ${selectedBranchName}`}
        >
          <GitBranch className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{displayName}</span>
          <ChevronDown className="w-3 h-3 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[240px]">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Working Directory
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Main directory */}
        {mainWorktree && (
          <DropdownMenuItem
            onClick={() => handleSelectWorktree(null, mainWorktree.branch)}
            className="gap-2"
          >
            <FolderRoot className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <span className="truncate block text-sm">{mainWorktree.branch}</span>
              <span className="text-xs text-muted-foreground">Main directory</span>
            </div>
            {selectedIsMain && <Check className="w-3.5 h-3.5 shrink-0 text-primary" />}
          </DropdownMenuItem>
        )}

        {/* Worktree directories */}
        {otherWorktrees.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Worktrees
            </DropdownMenuLabel>
            {otherWorktrees.map((wt) => {
              const isSelected =
                currentWorktreePath !== null && pathsEqual(wt.path, currentWorktreePath);
              return (
                <DropdownMenuItem
                  key={wt.path}
                  onClick={() => handleSelectWorktree(wt.path, wt.branch)}
                  className="gap-2"
                >
                  <GitBranch className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <span className="truncate block text-sm">{wt.branch}</span>
                    {wt.hasChanges && (
                      <span className="text-xs text-amber-500">
                        {wt.changedFilesCount ?? ''} change{wt.changedFilesCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-primary" />}
                </DropdownMenuItem>
              );
            })}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
