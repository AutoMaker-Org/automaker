import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronDown, FolderOpen, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorktreeGroup, WorktreeInfo, DevServerInfo, PRInfo, GitRepoStatus } from '../types';
import { WorktreeActionsDropdown } from './worktree-actions-dropdown';

/**
 * Extracts the suffix from a branch name (everything after the first slash).
 * If no slash exists, returns the full branch name.
 *
 * @param branch - The full branch name (e.g., "feature/mcp-integration")
 * @returns The suffix portion (e.g., "mcp-integration") or the full branch if no prefix
 *
 * @example
 * getBranchSuffix("feature/mcp-integration") // "mcp-integration"
 * getBranchSuffix("fix/worktree-bug") // "worktree-bug"
 * getBranchSuffix("main") // "main"
 */
function getBranchSuffix(branch: string): string {
  const slashIndex = branch.indexOf('/');
  if (slashIndex === -1) {
    return branch;
  }
  return branch.substring(slashIndex + 1);
}

interface WorktreeFolderGroupProps {
  group: WorktreeGroup;
  selectedWorktreePath?: string;
  cardCounts?: Record<string, number>; // Map of branch name to unarchived card count
  hasChangesMap?: Record<string, boolean>; // Map of worktree path to hasChanges status
  changedFilesCountMap?: Record<string, number>; // Map of worktree path to changedFilesCount
  onSelectWorktree: (worktree: WorktreeInfo) => void;

  // Action dropdown state (keyed by worktree path)
  devServerInfoMap?: Record<string, DevServerInfo>; // Map of worktree path to dev server info
  isDevServerRunningMap?: Record<string, boolean>; // Map of worktree path to dev server running status
  isPullingMap?: Record<string, boolean>; // Map of worktree path to pulling status
  isPushingMap?: Record<string, boolean>; // Map of worktree path to pushing status
  isStartingDevServerMap?: Record<string, boolean>; // Map of worktree path to starting dev server status
  aheadCountMap?: Record<string, number>; // Map of worktree path to ahead count
  behindCountMap?: Record<string, number>; // Map of worktree path to behind count
  gitRepoStatus?: GitRepoStatus; // Git repo status (shared across all worktrees)
  defaultEditorName?: string; // Default editor name for "Open in Editor" action

  // Action handlers
  onActionsDropdownOpenChange?: (open: boolean) => void;
  onPull?: (worktree: WorktreeInfo) => void;
  onPush?: (worktree: WorktreeInfo) => void;
  onOpenInEditor?: (worktree: WorktreeInfo) => void;
  onCommit?: (worktree: WorktreeInfo) => void;
  onCreatePR?: (worktree: WorktreeInfo) => void;
  onAddressPRComments?: (worktree: WorktreeInfo, prInfo: PRInfo) => void;
  onResolveConflicts?: (worktree: WorktreeInfo) => void;
  onDeleteWorktree?: (worktree: WorktreeInfo) => void;
  onStartDevServer?: (worktree: WorktreeInfo) => void;
  onStopDevServer?: (worktree: WorktreeInfo) => void;
  onOpenDevServerUrl?: (worktree: WorktreeInfo) => void;
  onOpenDevServerInElectron?: (worktree: WorktreeInfo) => void;
}

export function WorktreeFolderGroup({
  group,
  selectedWorktreePath,
  cardCounts = {},
  hasChangesMap = {},
  changedFilesCountMap = {},
  onSelectWorktree,
  // Action dropdown state
  devServerInfoMap = {},
  isDevServerRunningMap = {},
  isPullingMap = {},
  isPushingMap = {},
  isStartingDevServerMap = {},
  aheadCountMap = {},
  behindCountMap = {},
  gitRepoStatus = { isGitRepo: true, hasCommits: true },
  defaultEditorName = 'Editor',
  // Action handlers
  onActionsDropdownOpenChange,
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
  onOpenDevServerInElectron,
}: WorktreeFolderGroupProps) {
  const worktreeCount = group.worktrees.length;
  const folderLabel = group.folderName;

  // Build dropdown menu items
  const dropdownItems = group.worktrees.map((worktree) => {
    const isSelected = worktree.path === selectedWorktreePath;
    const cardCount = cardCounts[worktree.branch];
    const hasChanges = hasChangesMap[worktree.path];
    const changedFilesCount = changedFilesCountMap[worktree.path];
    // Display only the suffix (e.g., "mcp-integration" instead of "feature/mcp-integration")
    const branchSuffix = getBranchSuffix(worktree.branch);

    // Get action dropdown state for this worktree
    const devServerInfo = devServerInfoMap[worktree.path];
    const isDevServerRunning = isDevServerRunningMap[worktree.path] ?? false;
    const isPulling = isPullingMap[worktree.path] ?? false;
    const isPushing = isPushingMap[worktree.path] ?? false;
    const isStartingDevServer = isStartingDevServerMap[worktree.path] ?? false;
    const aheadCount = aheadCountMap[worktree.path] ?? 0;
    const behindCount = behindCountMap[worktree.path] ?? 0;

    return (
      <div
        key={worktree.path}
        className={cn('flex items-center gap-1 px-2 py-1 rounded-sm', isSelected && 'bg-accent')}
      >
        {/* Clickable worktree selection area */}
        <div
          className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer hover:opacity-80"
          onClick={() => onSelectWorktree(worktree)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelectWorktree(worktree);
            }
          }}
        >
          <span className="flex-1 text-xs font-mono truncate" title={worktree.branch}>
            {branchSuffix}
          </span>
          {cardCount !== undefined && cardCount > 0 && (
            <span className="inline-flex items-center justify-center h-4 min-w-[1rem] px-1 text-[10px] font-medium rounded bg-background/80 text-foreground border border-border shrink-0">
              {cardCount}
            </span>
          )}
          {hasChanges && (
            <span
              className="inline-flex items-center justify-center h-4 min-w-[1rem] px-1 text-[10px] font-medium rounded border bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30 shrink-0"
              title={`${changedFilesCount ?? 'Some'} uncommitted file${changedFilesCount !== 1 ? 's' : ''}`}
            >
              {changedFilesCount ?? '!'}
            </span>
          )}
          {/* Dev server status indicator */}
          {isDevServerRunning && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="inline-flex items-center justify-center h-4 w-4 text-green-500 shrink-0 cursor-pointer hover:opacity-80"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onOpenDevServerUrl) {
                        onOpenDevServerUrl(worktree);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        if (onOpenDevServerUrl) {
                          onOpenDevServerUrl(worktree);
                        }
                      }
                    }}
                  >
                    <Globe className="w-3 h-3" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    Dev server running{devServerInfo?.port ? ` on port ${devServerInfo.port}` : ''}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {/* Actions dropdown (three dots menu) */}
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
          onOpenChange={onActionsDropdownOpenChange ?? (() => {})}
          onPull={onPull ?? (() => {})}
          onPush={onPush ?? (() => {})}
          onOpenInEditor={onOpenInEditor ?? (() => {})}
          onCommit={onCommit ?? (() => {})}
          onCreatePR={onCreatePR ?? (() => {})}
          onAddressPRComments={onAddressPRComments ?? (() => {})}
          onResolveConflicts={onResolveConflicts ?? (() => {})}
          onDeleteWorktree={onDeleteWorktree ?? (() => {})}
          onStartDevServer={onStartDevServer ?? (() => {})}
          onStopDevServer={onStopDevServer ?? (() => {})}
          onOpenDevServerUrl={onOpenDevServerUrl ?? (() => {})}
          onOpenDevServerInElectron={onOpenDevServerInElectron ?? (() => {})}
        />
      </div>
    );
  });

  return (
    <div className="flex items-center self-stretch">
      <DropdownMenu>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-7 px-3 text-xs font-medium gap-1.5 border-r-0 rounded-l-md rounded-r-none',
                    'bg-secondary/50 hover:bg-secondary'
                  )}
                  aria-label={`${folderLabel} folder with ${worktreeCount} worktrees`}
                >
                  <FolderOpen className="w-3 h-3 shrink-0" />
                  <span className="truncate max-w-[100px]" title={folderLabel}>
                    {folderLabel}
                  </span>
                  <span className="inline-flex items-center justify-center h-4 min-w-[1rem] px-1 text-[10px] font-medium rounded bg-background/80 text-foreground border border-border shrink-0">
                    {worktreeCount}
                  </span>
                  <ChevronDown className="w-3 h-3 opacity-50 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {worktreeCount} worktree{worktreeCount !== 1 ? 's' : ''} in {folderLabel}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DropdownMenuContent align="start" className="min-w-[200px] max-w-[300px]">
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-b mb-1">
            {folderLabel} ({worktreeCount})
          </div>
          <div className="max-h-[300px] overflow-y-auto">{dropdownItems}</div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
