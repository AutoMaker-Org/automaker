import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { GitBranch, Plus, RefreshCw, PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { cn, pathsEqual } from '@/lib/utils';
import { getItem, setItem } from '@/lib/storage';
import type { WorktreePanelProps, WorktreeInfo } from './types';
import {
  useWorktrees,
  useDevServers,
  useBranches,
  useWorktreeActions,
  useDefaultEditor,
  useRunningFeatures,
  useWorktreeGroups,
} from './hooks';
import { WorktreeTab, WorktreeFolderGroup } from './components';

const WORKTREE_PANEL_COLLAPSED_KEY = 'worktree-panel-collapsed';

export function WorktreePanel({
  projectPath,
  onCreateWorktree,
  onDeleteWorktree,
  onCommit,
  onCreatePR,
  onCreateBranch,
  onAddressPRComments,
  onResolveConflicts,
  onRemovedWorktrees,
  runningFeatureIds = [],
  features = [],
  branchCardCounts,
  refreshTrigger = 0,
}: WorktreePanelProps) {
  const {
    isLoading,
    worktrees,
    currentWorktree,
    currentWorktreePath,
    useWorktreesEnabled,
    fetchWorktrees,
    handleSelectWorktree,
  } = useWorktrees({ projectPath, refreshTrigger, onRemovedWorktrees });

  // Group worktrees by folder
  const { groups, individualWorktrees } = useWorktreeGroups({ worktrees, projectPath });

  const {
    isStartingDevServer,
    getWorktreeKey,
    isDevServerRunning,
    getDevServerInfo,
    handleStartDevServer,
    handleStopDevServer,
    handleOpenDevServerUrl,
    handleOpenDevServerInElectron,
  } = useDevServers({ projectPath });

  const {
    branches,
    filteredBranches,
    aheadCount,
    behindCount,
    isLoadingBranches,
    branchFilter,
    setBranchFilter,
    resetBranchFilter,
    fetchBranches,
    gitRepoStatus,
  } = useBranches();

  const {
    isPulling,
    isPushing,
    isSwitching,
    isActivating,
    handleSwitchBranch,
    handlePull,
    handlePush,
    handleOpenInEditor,
  } = useWorktreeActions({
    fetchWorktrees,
    fetchBranches,
  });

  const { defaultEditorName } = useDefaultEditor();

  const { hasRunningFeatures } = useRunningFeatures({
    runningFeatureIds,
    features,
  });

  // Collapse state with localStorage persistence
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = getItem(WORKTREE_PANEL_COLLAPSED_KEY);
    return saved === 'true';
  });

  useEffect(() => {
    setItem(WORKTREE_PANEL_COLLAPSED_KEY, String(isCollapsed));
  }, [isCollapsed]);

  const toggleCollapsed = () => setIsCollapsed((prev) => !prev);

  // Periodic interval check (5 seconds) to detect branch changes on disk
  // Reduced from 1s to 5s to minimize GPU/CPU usage from frequent re-renders
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      fetchWorktrees({ silent: true });
    }, 5000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchWorktrees]);

  // Get the currently selected worktree for collapsed view
  const selectedWorktree = worktrees.find((w) => {
    if (
      currentWorktree === null ||
      currentWorktree === undefined ||
      currentWorktree.path === null
    ) {
      return w.isMain;
    }
    return pathsEqual(w.path, currentWorktreePath);
  });

  const isWorktreeSelected = (worktree: WorktreeInfo) => {
    return worktree.isMain
      ? currentWorktree === null || currentWorktree === undefined || currentWorktree.path === null
      : pathsEqual(worktree.path, currentWorktreePath);
  };

  const handleBranchDropdownOpenChange = (worktree: WorktreeInfo) => (open: boolean) => {
    if (open) {
      fetchBranches(worktree.path);
      resetBranchFilter();
    }
  };

  const handleActionsDropdownOpenChange = (worktree: WorktreeInfo) => (open: boolean) => {
    if (open) {
      fetchBranches(worktree.path);
    }
  };

  // Helper function to create hasChanges map for folder groups
  const createHasChangesMap = () => {
    const map: Record<string, boolean> = {};
    worktrees.forEach((w) => {
      if (w.hasChanges) {
        map[w.path] = true;
      }
    });
    return map;
  };

  const createChangedFilesCountMap = () => {
    const map: Record<string, number> = {};
    worktrees.forEach((w) => {
      if (w.changedFilesCount !== undefined) {
        map[w.path] = w.changedFilesCount;
      }
    });
    return map;
  };

  // Helper functions to create maps for folder group action dropdowns
  const createDevServerInfoMap = () => {
    const map: Record<string, ReturnType<typeof getDevServerInfo>> = {};
    worktrees.forEach((w) => {
      const info = getDevServerInfo(w);
      if (info) {
        map[w.path] = info;
      }
    });
    return map;
  };

  const createIsDevServerRunningMap = () => {
    const map: Record<string, boolean> = {};
    worktrees.forEach((w) => {
      map[w.path] = isDevServerRunning(w);
    });
    return map;
  };

  const createIsPullingMap = () => {
    const map: Record<string, boolean> = {};
    worktrees.forEach((w) => {
      map[w.path] = isPulling === w.path;
    });
    return map;
  };

  const createIsPushingMap = () => {
    const map: Record<string, boolean> = {};
    worktrees.forEach((w) => {
      map[w.path] = isPushing === w.path;
    });
    return map;
  };

  const createIsStartingDevServerMap = () => {
    const map: Record<string, boolean> = {};
    worktrees.forEach((w) => {
      const key = getWorktreeKey(w);
      map[w.path] = isStartingDevServer === key;
    });
    return map;
  };

  const createAheadCountMap = () => {
    const map: Record<string, number> = {};
    worktrees.forEach((w) => {
      // aheadCount is shared state from useBranches, apply to current worktree
      if (w.path === currentWorktreePath) {
        map[w.path] = aheadCount;
      } else {
        map[w.path] = 0;
      }
    });
    return map;
  };

  const createBehindCountMap = () => {
    const map: Record<string, number> = {};
    worktrees.forEach((w) => {
      // behindCount is shared state from useBranches, apply to current worktree
      if (w.path === currentWorktreePath) {
        map[w.path] = behindCount;
      } else {
        map[w.path] = 0;
      }
    });
    return map;
  };

  // Collapsed view - just show current branch and toggle
  if (isCollapsed) {
    return (
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border bg-glass/50 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
          onClick={toggleCollapsed}
          title="Expand worktree panel"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </Button>
        <GitBranch className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Branch:</span>
        <span className="text-sm font-mono font-medium">{selectedWorktree?.branch ?? 'main'}</span>
        {selectedWorktree?.hasChanges && (
          <span className="inline-flex items-center justify-center h-4 min-w-[1rem] px-1 text-[10px] font-medium rounded border bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30">
            {selectedWorktree.changedFilesCount ?? '!'}
          </span>
        )}
      </div>
    );
  }

  // Expanded view - full worktree panel
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-glass/50 backdrop-blur-sm">
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
        onClick={toggleCollapsed}
        title="Collapse worktree panel"
      >
        <PanelLeftClose className="w-4 h-4" />
      </Button>

      <GitBranch className="w-4 h-4 text-muted-foreground" />
      <span className="text-sm text-muted-foreground mr-2">Branch:</span>

      {/* Individual worktrees (main worktree + root-level worktrees) */}
      <div className="flex items-center gap-2">
        {individualWorktrees.map((worktree) => (
          <WorktreeTab
            key={worktree.path}
            worktree={worktree}
            cardCount={branchCardCounts?.[worktree.branch]}
            hasChanges={worktree.hasChanges}
            changedFilesCount={worktree.changedFilesCount}
            isSelected={isWorktreeSelected(worktree)}
            isRunning={hasRunningFeatures(worktree)}
            isActivating={isActivating}
            isDevServerRunning={isDevServerRunning(worktree)}
            devServerInfo={getDevServerInfo(worktree)}
            defaultEditorName={defaultEditorName}
            branches={branches}
            filteredBranches={filteredBranches}
            branchFilter={branchFilter}
            isLoadingBranches={isLoadingBranches}
            isSwitching={isSwitching}
            isPulling={isPulling}
            isPushing={isPushing}
            isStartingDevServer={isStartingDevServer}
            aheadCount={aheadCount}
            behindCount={behindCount}
            gitRepoStatus={gitRepoStatus}
            onSelectWorktree={handleSelectWorktree}
            onBranchDropdownOpenChange={handleBranchDropdownOpenChange(worktree)}
            onActionsDropdownOpenChange={handleActionsDropdownOpenChange(worktree)}
            onBranchFilterChange={setBranchFilter}
            onSwitchBranch={handleSwitchBranch}
            onCreateBranch={onCreateBranch}
            onPull={handlePull}
            onPush={handlePush}
            onOpenInEditor={handleOpenInEditor}
            onCommit={onCommit}
            onCreatePR={onCreatePR}
            onAddressPRComments={onAddressPRComments}
            onResolveConflicts={onResolveConflicts}
            onDeleteWorktree={onDeleteWorktree}
            onStartDevServer={handleStartDevServer}
            onStopDevServer={handleStopDevServer}
            onOpenDevServerUrl={handleOpenDevServerUrl}
            onOpenDevServerInElectron={handleOpenDevServerInElectron}
          />
        ))}
      </div>

      {/* Worktrees section - only show if enabled */}
      {useWorktreesEnabled && (
        <>
          <div className="w-px h-5 bg-border mx-2" />
          <GitBranch className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground mr-2">Worktrees:</span>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Folder groups */}
            {groups.map((group) => (
              <WorktreeFolderGroup
                key={group.folderPath}
                group={group}
                selectedWorktreePath={currentWorktreePath}
                cardCounts={branchCardCounts}
                hasChangesMap={createHasChangesMap()}
                changedFilesCountMap={createChangedFilesCountMap()}
                onSelectWorktree={handleSelectWorktree}
                // Action dropdown state maps
                devServerInfoMap={createDevServerInfoMap()}
                isDevServerRunningMap={createIsDevServerRunningMap()}
                isPullingMap={createIsPullingMap()}
                isPushingMap={createIsPushingMap()}
                isStartingDevServerMap={createIsStartingDevServerMap()}
                aheadCountMap={createAheadCountMap()}
                behindCountMap={createBehindCountMap()}
                gitRepoStatus={gitRepoStatus}
                defaultEditorName={defaultEditorName}
                // Action handlers
                onActionsDropdownOpenChange={(open) => {
                  // When any folder group action dropdown opens, fetch branches
                  if (open && group.worktrees.length > 0) {
                    fetchBranches(group.worktrees[0].path);
                  }
                }}
                onPull={handlePull}
                onPush={handlePush}
                onOpenInEditor={handleOpenInEditor}
                onCommit={onCommit}
                onCreatePR={onCreatePR}
                onAddressPRComments={onAddressPRComments}
                onResolveConflicts={onResolveConflicts}
                onDeleteWorktree={onDeleteWorktree}
                onStartDevServer={handleStartDevServer}
                onStopDevServer={handleStopDevServer}
                onOpenDevServerUrl={handleOpenDevServerUrl}
                onOpenDevServerInElectron={handleOpenDevServerInElectron}
              />
            ))}

            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={onCreateWorktree}
              title="Create new worktree"
            >
              <Plus className="w-4 h-4" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={async () => {
                const removedWorktrees = await fetchWorktrees();
                if (removedWorktrees && removedWorktrees.length > 0 && onRemovedWorktrees) {
                  onRemovedWorktrees(removedWorktrees);
                }
              }}
              disabled={isLoading}
              title="Refresh worktrees"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
