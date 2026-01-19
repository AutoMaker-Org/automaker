import { useEffect, useRef, useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { GitBranch, Plus, RefreshCw } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn, pathsEqual } from '@/lib/utils';
import { toast } from 'sonner';
import { getHttpApiClient } from '@/lib/http-api-client';
import { useIsMobile } from '@/hooks/use-media-query';
import type { WorktreePanelProps, WorktreeInfo } from './types';
import {
  useWorktrees,
  useDevServers,
  useBranches,
  useWorktreeActions,
  useRunningFeatures,
} from './hooks';
import {
  WorktreeTab,
  DevServerLogsPanel,
  WorktreeMobileDropdown,
  WorktreeActionsDropdown,
  BranchSwitchDropdown,
} from './components';

export function WorktreePanel({
  projectPath,
  onCreateWorktree,
  onDeleteWorktree,
  onCommit,
  onCreatePR,
  onCreateBranch,
  onAddressPRComments,
  onResolveConflicts,
  onMerge,
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

  const {
    isStartingDevServer,
    getWorktreeKey,
    isDevServerRunning,
    getDevServerInfo,
    handleStartDevServer,
    handleStopDevServer,
    handleOpenDevServerUrl,
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
    handleOpenInIntegratedTerminal,
    handleOpenInEditor,
    handleOpenInExternalTerminal,
  } = useWorktreeActions({
    fetchWorktrees,
    fetchBranches,
  });

  const { hasRunningFeatures } = useRunningFeatures({
    runningFeatureIds,
    features,
  });

  // Track whether init script exists for the project
  const [hasInitScript, setHasInitScript] = useState(false);

  // Log panel state management
  const [logPanelOpen, setLogPanelOpen] = useState(false);
  const [logPanelWorktree, setLogPanelWorktree] = useState<WorktreeInfo | null>(null);

  useEffect(() => {
    if (!projectPath) {
      setHasInitScript(false);
      return;
    }

    const checkInitScript = async () => {
      try {
        const api = getHttpApiClient();
        const result = await api.worktree.getInitScript(projectPath);
        setHasInitScript(result.success && result.exists);
      } catch {
        setHasInitScript(false);
      }
    };

    checkInitScript();
  }, [projectPath]);

  const isMobile = useIsMobile();

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

  const handleRunInitScript = useCallback(
    async (worktree: WorktreeInfo) => {
      if (!projectPath) return;

      try {
        const api = getHttpApiClient();
        const result = await api.worktree.runInitScript(
          projectPath,
          worktree.path,
          worktree.branch
        );

        if (!result.success) {
          toast.error('Failed to run init script', {
            description: result.error,
          });
        }
        // Success feedback will come via WebSocket events (init-started, init-output, init-completed)
      } catch (error) {
        toast.error('Failed to run init script', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
    [projectPath]
  );

  // Handle opening the log panel for a specific worktree
  const handleViewDevServerLogs = useCallback((worktree: WorktreeInfo) => {
    setLogPanelWorktree(worktree);
    setLogPanelOpen(true);
  }, []);

  // Handle closing the log panel
  const handleCloseLogPanel = useCallback(() => {
    setLogPanelOpen(false);
    // Keep logPanelWorktree set for smooth close animation
  }, []);

  const mainWorktree = worktrees.find((w) => w.isMain);
  const nonMainWorktrees = worktrees.filter((w) => !w.isMain);

  // Mobile view: single dropdown for all worktrees
  if (isMobile) {
    // Find the currently selected worktree for the actions menu
    const selectedWorktree = worktrees.find((w) => isWorktreeSelected(w)) || mainWorktree;

    return (
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-glass/50 backdrop-blur-sm">
        <WorktreeMobileDropdown
          worktrees={worktrees}
          isWorktreeSelected={isWorktreeSelected}
          hasRunningFeatures={hasRunningFeatures}
          isActivating={isActivating}
          branchCardCounts={branchCardCounts}
          onSelectWorktree={handleSelectWorktree}
        />

        {/* Branch switch dropdown for the selected worktree */}
        {selectedWorktree && (
          <BranchSwitchDropdown
            worktree={selectedWorktree}
            isSelected={true}
            standalone={true}
            branches={branches}
            filteredBranches={filteredBranches}
            branchFilter={branchFilter}
            isLoadingBranches={isLoadingBranches}
            isSwitching={isSwitching}
            onOpenChange={handleBranchDropdownOpenChange(selectedWorktree)}
            onFilterChange={setBranchFilter}
            onSwitchBranch={handleSwitchBranch}
            onCreateBranch={onCreateBranch}
          />
        )}

        {/* Actions menu for the selected worktree */}
        {selectedWorktree && (
          <WorktreeActionsDropdown
            worktree={selectedWorktree}
            isSelected={true}
            standalone={true}
            aheadCount={aheadCount}
            behindCount={behindCount}
            isPulling={isPulling}
            isPushing={isPushing}
            isStartingDevServer={isStartingDevServer}
            isDevServerRunning={isDevServerRunning(selectedWorktree)}
            devServerInfo={getDevServerInfo(selectedWorktree)}
            gitRepoStatus={gitRepoStatus}
            onOpenChange={handleActionsDropdownOpenChange(selectedWorktree)}
            onPull={handlePull}
            onPush={handlePush}
            onOpenInEditor={handleOpenInEditor}
            onOpenInIntegratedTerminal={handleOpenInIntegratedTerminal}
            onOpenInExternalTerminal={handleOpenInExternalTerminal}
            onCommit={onCommit}
            onCreatePR={onCreatePR}
            onAddressPRComments={onAddressPRComments}
            onResolveConflicts={onResolveConflicts}
            onMerge={onMerge}
            onDeleteWorktree={onDeleteWorktree}
            onStartDevServer={handleStartDevServer}
            onStopDevServer={handleStopDevServer}
            onOpenDevServerUrl={handleOpenDevServerUrl}
            onViewDevServerLogs={handleViewDevServerLogs}
            onRunInitScript={handleRunInitScript}
            hasInitScript={hasInitScript}
          />
        )}

        {useWorktreesEnabled && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground shrink-0"
              onClick={onCreateWorktree}
              title="Create new worktree"
            >
              <Plus className="w-4 h-4" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground shrink-0"
              onClick={async () => {
                const removedWorktrees = await fetchWorktrees();
                if (removedWorktrees && removedWorktrees.length > 0 && onRemovedWorktrees) {
                  onRemovedWorktrees(removedWorktrees);
                }
              }}
              disabled={isLoading}
              title="Refresh worktrees"
            >
              {isLoading ? <Spinner size="xs" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </Button>
          </>
        )}
      </div>
    );
  }

  // Desktop view: full tabs layout
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-glass/50 backdrop-blur-sm">
      <GitBranch className="w-4 h-4 text-muted-foreground" />
      <span className="text-sm text-muted-foreground mr-2">Branch:</span>

      <div className="flex items-center gap-2">
        {mainWorktree && (
          <WorktreeTab
            key={mainWorktree.path}
            worktree={mainWorktree}
            cardCount={branchCardCounts?.[mainWorktree.branch]}
            hasChanges={mainWorktree.hasChanges}
            changedFilesCount={mainWorktree.changedFilesCount}
            isSelected={isWorktreeSelected(mainWorktree)}
            isRunning={hasRunningFeatures(mainWorktree)}
            isActivating={isActivating}
            isDevServerRunning={isDevServerRunning(mainWorktree)}
            devServerInfo={getDevServerInfo(mainWorktree)}
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
            onBranchDropdownOpenChange={handleBranchDropdownOpenChange(mainWorktree)}
            onActionsDropdownOpenChange={handleActionsDropdownOpenChange(mainWorktree)}
            onBranchFilterChange={setBranchFilter}
            onSwitchBranch={handleSwitchBranch}
            onCreateBranch={onCreateBranch}
            onPull={handlePull}
            onPush={handlePush}
            onOpenInEditor={handleOpenInEditor}
            onOpenInIntegratedTerminal={handleOpenInIntegratedTerminal}
            onOpenInExternalTerminal={handleOpenInExternalTerminal}
            onCommit={onCommit}
            onCreatePR={onCreatePR}
            onAddressPRComments={onAddressPRComments}
            onResolveConflicts={onResolveConflicts}
            onMerge={onMerge}
            onDeleteWorktree={onDeleteWorktree}
            onStartDevServer={handleStartDevServer}
            onStopDevServer={handleStopDevServer}
            onOpenDevServerUrl={handleOpenDevServerUrl}
            onViewDevServerLogs={handleViewDevServerLogs}
            onRunInitScript={handleRunInitScript}
            hasInitScript={hasInitScript}
          />
        )}
      </div>

      {/* Worktrees section - show if enabled OR if worktrees exist (so users can navigate to them) */}
      {(useWorktreesEnabled || nonMainWorktrees.length > 0) && (
        <>
          <div className="w-px h-5 bg-border mx-2" />
          <GitBranch className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground mr-2">Worktrees:</span>

          <div className="flex items-center gap-2 flex-wrap">
            {nonMainWorktrees.map((worktree) => {
              const cardCount = branchCardCounts?.[worktree.branch];
              return (
                <WorktreeTab
                  key={worktree.path}
                  worktree={worktree}
                  cardCount={cardCount}
                  hasChanges={worktree.hasChanges}
                  changedFilesCount={worktree.changedFilesCount}
                  isSelected={isWorktreeSelected(worktree)}
                  isRunning={hasRunningFeatures(worktree)}
                  isActivating={isActivating}
                  isDevServerRunning={isDevServerRunning(worktree)}
                  devServerInfo={getDevServerInfo(worktree)}
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
                  onOpenInIntegratedTerminal={handleOpenInIntegratedTerminal}
                  onOpenInExternalTerminal={handleOpenInExternalTerminal}
                  onCommit={onCommit}
                  onCreatePR={onCreatePR}
                  onAddressPRComments={onAddressPRComments}
                  onResolveConflicts={onResolveConflicts}
                  onMerge={onMerge}
                  onDeleteWorktree={onDeleteWorktree}
                  onStartDevServer={handleStartDevServer}
                  onStopDevServer={handleStopDevServer}
                  onOpenDevServerUrl={handleOpenDevServerUrl}
                  onViewDevServerLogs={handleViewDevServerLogs}
                  onRunInitScript={handleRunInitScript}
                  hasInitScript={hasInitScript}
                />
              );
            })}

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
              {isLoading ? <Spinner size="xs" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </>
      )}

      {/* Dev Server Logs Panel */}
      <DevServerLogsPanel
        open={logPanelOpen}
        onClose={handleCloseLogPanel}
        worktree={logPanelWorktree}
        onStopDevServer={handleStopDevServer}
        onOpenDevServerUrl={handleOpenDevServerUrl}
      />
    </div>
  );
}
