import { useEffect, useRef, useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { GitBranch, Plus, RefreshCw } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { pathsEqual } from '@/lib/utils';
import { toast } from 'sonner';
import { getHttpApiClient } from '@/lib/http-api-client';
import { useIsMobile } from '@/hooks/use-media-query';
import { useWorktreeInitScript, useProjectSettings } from '@/hooks/queries';
import { useTestRunnerEvents } from '@/hooks/use-test-runners';
import { useTestRunnersStore } from '@/store/test-runners-store';
import type {
  TestRunnerStartedEvent,
  TestRunnerOutputEvent,
  TestRunnerCompletedEvent,
} from '@/types/electron';
import type { WorktreePanelProps, WorktreeInfo, TestSessionInfo } from './types';
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
  WorktreeDropdown,
} from './components';
import { useAppStore } from '@/store/app-store';
import { ViewWorktreeChangesDialog, PushToRemoteDialog, MergeWorktreeDialog } from '../dialogs';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TestLogsPanel } from '@/components/ui/test-logs-panel';
import { Undo2 } from 'lucide-react';
import { getElectronAPI } from '@/lib/electron';

/** Threshold for switching from tabs to dropdown layout (number of worktrees) */
const WORKTREE_DROPDOWN_THRESHOLD = 3;

export function WorktreePanel({
  projectPath,
  onCreateWorktree,
  onDeleteWorktree,
  onCommit,
  onCreatePR,
  onCreateBranch,
  onAddressPRComments,
  onResolveConflicts,
  onCreateMergeConflictResolutionFeature,
  onBranchDeletedDuringMerge,
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
    hasRemoteBranch,
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
  } = useWorktreeActions();

  const { hasRunningFeatures } = useRunningFeatures({
    runningFeatureIds,
    features,
  });

  // Auto-mode state management using the store
  // Use separate selectors to avoid creating new object references on each render
  const autoModeByWorktree = useAppStore((state) => state.autoModeByWorktree);
  const currentProject = useAppStore((state) => state.currentProject);
  const setAutoModeRunning = useAppStore((state) => state.setAutoModeRunning);
  const getMaxConcurrencyForWorktree = useAppStore((state) => state.getMaxConcurrencyForWorktree);

  // Helper to generate worktree key for auto-mode (inlined to avoid selector issues)
  const getAutoModeWorktreeKey = useCallback(
    (projectId: string, branchName: string | null): string => {
      return `${projectId}::${branchName ?? '__main__'}`;
    },
    []
  );

  // Helper to check if auto-mode is running for a specific worktree
  const isAutoModeRunningForWorktree = useCallback(
    (worktree: WorktreeInfo): boolean => {
      if (!currentProject) return false;
      const branchName = worktree.isMain ? null : worktree.branch;
      const key = getAutoModeWorktreeKey(currentProject.id, branchName);
      return autoModeByWorktree[key]?.isRunning ?? false;
    },
    [currentProject, autoModeByWorktree, getAutoModeWorktreeKey]
  );

  // Handler to toggle auto-mode for a worktree
  const handleToggleAutoMode = useCallback(
    async (worktree: WorktreeInfo) => {
      if (!currentProject) return;

      const api = getHttpApiClient();
      const branchName = worktree.isMain ? null : worktree.branch;
      const isRunning = isAutoModeRunningForWorktree(worktree);

      try {
        if (isRunning) {
          const result = await api.autoMode.stop(projectPath, branchName);
          if (result.success) {
            setAutoModeRunning(currentProject.id, branchName, false);
            const desc = branchName ? `worktree ${branchName}` : 'main branch';
            toast.success(`Auto Mode stopped for ${desc}`);
          } else {
            toast.error(result.error || 'Failed to stop Auto Mode');
          }
        } else {
          const maxConcurrency = getMaxConcurrencyForWorktree(currentProject.id, branchName);
          const result = await api.autoMode.start(projectPath, branchName, maxConcurrency);
          if (result.success) {
            setAutoModeRunning(currentProject.id, branchName, true, maxConcurrency);
            const desc = branchName ? `worktree ${branchName}` : 'main branch';
            toast.success(`Auto Mode started for ${desc}`);
          } else {
            toast.error(result.error || 'Failed to start Auto Mode');
          }
        }
      } catch (error) {
        toast.error('Error toggling Auto Mode');
        console.error('Auto mode toggle error:', error);
      }
    },
    [
      currentProject,
      projectPath,
      isAutoModeRunningForWorktree,
      setAutoModeRunning,
      getMaxConcurrencyForWorktree,
    ]
  );

  // Check if init script exists for the project using React Query
  const { data: initScriptData } = useWorktreeInitScript(projectPath);
  const hasInitScript = initScriptData?.exists ?? false;

  // Check if test command is configured in project settings
  const { data: projectSettings } = useProjectSettings(projectPath);
  const hasTestCommand = !!projectSettings?.testCommand;

  // Test runner state management
  // Use the test runners store to get global state for all worktrees
  const testRunnersStore = useTestRunnersStore();
  const [isStartingTests, setIsStartingTests] = useState(false);

  // Subscribe to test runner events to update store state in real-time
  // This ensures the UI updates when tests start, output is received, or tests complete
  useTestRunnerEvents(
    // onStarted - a new test run has begun
    useCallback(
      (event: TestRunnerStartedEvent) => {
        testRunnersStore.startSession({
          sessionId: event.sessionId,
          worktreePath: event.worktreePath,
          command: event.command,
          status: 'running',
          testFile: event.testFile,
          startedAt: event.timestamp,
        });
      },
      [testRunnersStore]
    ),
    // onOutput - test output received
    useCallback(
      (event: TestRunnerOutputEvent) => {
        testRunnersStore.appendOutput(event.sessionId, event.content);
      },
      [testRunnersStore]
    ),
    // onCompleted - test run finished
    useCallback(
      (event: TestRunnerCompletedEvent) => {
        testRunnersStore.completeSession(
          event.sessionId,
          event.status,
          event.exitCode,
          event.duration
        );
        // Show toast notification for test completion
        const statusEmoji =
          event.status === 'passed' ? '✅' : event.status === 'failed' ? '❌' : '⏹️';
        const statusText =
          event.status === 'passed' ? 'passed' : event.status === 'failed' ? 'failed' : 'stopped';
        toast(`${statusEmoji} Tests ${statusText}`, {
          description: `Exit code: ${event.exitCode ?? 'N/A'}`,
          duration: 4000,
        });
      },
      [testRunnersStore]
    )
  );

  // Test logs panel state
  const [testLogsPanelOpen, setTestLogsPanelOpen] = useState(false);
  const [testLogsPanelWorktree, setTestLogsPanelWorktree] = useState<WorktreeInfo | null>(null);

  // Helper to check if tests are running for a specific worktree
  const isTestRunningForWorktree = useCallback(
    (worktree: WorktreeInfo): boolean => {
      return testRunnersStore.isWorktreeRunning(worktree.path);
    },
    [testRunnersStore]
  );

  // Helper to get test session info for a specific worktree
  const getTestSessionInfo = useCallback(
    (worktree: WorktreeInfo): TestSessionInfo | undefined => {
      const session = testRunnersStore.getActiveSession(worktree.path);
      if (!session) {
        // Check for completed sessions to show last result
        const allSessions = Object.values(testRunnersStore.sessions).filter(
          (s) => s.worktreePath === worktree.path
        );
        const lastSession = allSessions.sort(
          (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
        )[0];
        if (lastSession) {
          return {
            sessionId: lastSession.sessionId,
            worktreePath: lastSession.worktreePath,
            command: lastSession.command,
            status: lastSession.status as TestSessionInfo['status'],
            testFile: lastSession.testFile,
            startedAt: lastSession.startedAt,
            finishedAt: lastSession.finishedAt,
            exitCode: lastSession.exitCode,
            duration: lastSession.duration,
          };
        }
        return undefined;
      }
      return {
        sessionId: session.sessionId,
        worktreePath: session.worktreePath,
        command: session.command,
        status: session.status as TestSessionInfo['status'],
        testFile: session.testFile,
        startedAt: session.startedAt,
        finishedAt: session.finishedAt,
        exitCode: session.exitCode,
        duration: session.duration,
      };
    },
    [testRunnersStore]
  );

  // Handler to start tests for a worktree
  const handleStartTests = useCallback(
    async (worktree: WorktreeInfo) => {
      setIsStartingTests(true);
      try {
        const api = getElectronAPI();
        if (!api?.worktree?.startTests) {
          toast.error('Test runner API not available');
          return;
        }

        const result = await api.worktree.startTests(worktree.path, { projectPath });
        if (result.success) {
          toast.success('Tests started', {
            description: `Running tests in ${worktree.branch}`,
          });
        } else {
          toast.error('Failed to start tests', {
            description: result.error || 'Unknown error',
          });
        }
      } catch (error) {
        toast.error('Failed to start tests', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        setIsStartingTests(false);
      }
    },
    [projectPath]
  );

  // Handler to stop tests for a worktree
  const handleStopTests = useCallback(
    async (worktree: WorktreeInfo) => {
      try {
        const session = testRunnersStore.getActiveSession(worktree.path);
        if (!session) {
          toast.error('No active test session to stop');
          return;
        }

        const api = getElectronAPI();
        if (!api?.worktree?.stopTests) {
          toast.error('Test runner API not available');
          return;
        }

        const result = await api.worktree.stopTests(session.sessionId);
        if (result.success) {
          toast.success('Tests stopped', {
            description: `Stopped tests in ${worktree.branch}`,
          });
        } else {
          toast.error('Failed to stop tests', {
            description: result.error || 'Unknown error',
          });
        }
      } catch (error) {
        toast.error('Failed to stop tests', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
    [testRunnersStore]
  );

  // Handler to view test logs for a worktree
  const handleViewTestLogs = useCallback((worktree: WorktreeInfo) => {
    setTestLogsPanelWorktree(worktree);
    setTestLogsPanelOpen(true);
  }, []);

  // Handler to close test logs panel
  const handleCloseTestLogsPanel = useCallback(() => {
    setTestLogsPanelOpen(false);
  }, []);

  // View changes dialog state
  const [viewChangesDialogOpen, setViewChangesDialogOpen] = useState(false);
  const [viewChangesWorktree, setViewChangesWorktree] = useState<WorktreeInfo | null>(null);

  // Discard changes confirmation dialog state
  const [discardChangesDialogOpen, setDiscardChangesDialogOpen] = useState(false);
  const [discardChangesWorktree, setDiscardChangesWorktree] = useState<WorktreeInfo | null>(null);

  // Log panel state management
  const [logPanelOpen, setLogPanelOpen] = useState(false);
  const [logPanelWorktree, setLogPanelWorktree] = useState<WorktreeInfo | null>(null);

  // Push to remote dialog state
  const [pushToRemoteDialogOpen, setPushToRemoteDialogOpen] = useState(false);
  const [pushToRemoteWorktree, setPushToRemoteWorktree] = useState<WorktreeInfo | null>(null);

  // Merge branch dialog state
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeWorktree, setMergeWorktree] = useState<WorktreeInfo | null>(null);

  const isMobile = useIsMobile();

  // Periodic interval check (30 seconds) to detect branch changes on disk
  // Reduced polling to lessen repeated worktree list calls while keeping UI reasonably fresh
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      fetchWorktrees({ silent: true });
    }, 30000);

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

  const handleViewChanges = useCallback((worktree: WorktreeInfo) => {
    setViewChangesWorktree(worktree);
    setViewChangesDialogOpen(true);
  }, []);

  const handleDiscardChanges = useCallback((worktree: WorktreeInfo) => {
    setDiscardChangesWorktree(worktree);
    setDiscardChangesDialogOpen(true);
  }, []);

  const handleConfirmDiscardChanges = useCallback(async () => {
    if (!discardChangesWorktree) return;

    try {
      const api = getHttpApiClient();
      const result = await api.worktree.discardChanges(discardChangesWorktree.path);

      if (result.success) {
        toast.success('Changes discarded', {
          description: `Discarded changes in ${discardChangesWorktree.branch}`,
        });
        // Refresh worktrees to update the changes status
        fetchWorktrees({ silent: true });
      } else {
        toast.error('Failed to discard changes', {
          description: result.error || 'Unknown error',
        });
      }
    } catch (error) {
      toast.error('Failed to discard changes', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, [discardChangesWorktree, fetchWorktrees]);

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

  // Handle opening the push to remote dialog
  const handlePushNewBranch = useCallback((worktree: WorktreeInfo) => {
    setPushToRemoteWorktree(worktree);
    setPushToRemoteDialogOpen(true);
  }, []);

  // Handle confirming the push to remote dialog
  const handleConfirmPushToRemote = useCallback(
    async (worktree: WorktreeInfo, remote: string) => {
      try {
        const api = getElectronAPI();
        if (!api?.worktree?.push) {
          toast.error('Push API not available');
          return;
        }
        const result = await api.worktree.push(worktree.path, false, remote);
        if (result.success && result.result) {
          toast.success(result.result.message);
          fetchBranches(worktree.path);
          fetchWorktrees();
        } else {
          toast.error(result.error || 'Failed to push changes');
        }
      } catch {
        toast.error('Failed to push changes');
      }
    },
    [fetchBranches, fetchWorktrees]
  );

  // Handle opening the merge dialog
  const handleMerge = useCallback((worktree: WorktreeInfo) => {
    setMergeWorktree(worktree);
    setMergeDialogOpen(true);
  }, []);

  // Handle merge completion - refresh worktrees and reassign features if branch was deleted
  const handleMerged = useCallback(
    (mergedWorktree: WorktreeInfo, deletedBranch: boolean) => {
      fetchWorktrees();
      // If the branch was deleted, notify parent to reassign features to main
      if (deletedBranch && onBranchDeletedDuringMerge) {
        onBranchDeletedDuringMerge(mergedWorktree.branch);
      }
    },
    [fetchWorktrees, onBranchDeletedDuringMerge]
  );

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
            hasRemoteBranch={hasRemoteBranch}
            isPulling={isPulling}
            isPushing={isPushing}
            isStartingDevServer={isStartingDevServer}
            isDevServerRunning={isDevServerRunning(selectedWorktree)}
            devServerInfo={getDevServerInfo(selectedWorktree)}
            gitRepoStatus={gitRepoStatus}
            isAutoModeRunning={isAutoModeRunningForWorktree(selectedWorktree)}
            hasTestCommand={hasTestCommand}
            isStartingTests={isStartingTests}
            isTestRunning={isTestRunningForWorktree(selectedWorktree)}
            testSessionInfo={getTestSessionInfo(selectedWorktree)}
            onOpenChange={handleActionsDropdownOpenChange(selectedWorktree)}
            onPull={handlePull}
            onPush={handlePush}
            onPushNewBranch={handlePushNewBranch}
            onOpenInEditor={handleOpenInEditor}
            onOpenInIntegratedTerminal={handleOpenInIntegratedTerminal}
            onOpenInExternalTerminal={handleOpenInExternalTerminal}
            onViewChanges={handleViewChanges}
            onDiscardChanges={handleDiscardChanges}
            onCommit={onCommit}
            onCreatePR={onCreatePR}
            onAddressPRComments={onAddressPRComments}
            onResolveConflicts={onResolveConflicts}
            onMerge={handleMerge}
            onDeleteWorktree={onDeleteWorktree}
            onStartDevServer={handleStartDevServer}
            onStopDevServer={handleStopDevServer}
            onOpenDevServerUrl={handleOpenDevServerUrl}
            onViewDevServerLogs={handleViewDevServerLogs}
            onRunInitScript={handleRunInitScript}
            onToggleAutoMode={handleToggleAutoMode}
            onStartTests={handleStartTests}
            onStopTests={handleStopTests}
            onViewTestLogs={handleViewTestLogs}
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

        {/* View Changes Dialog */}
        <ViewWorktreeChangesDialog
          open={viewChangesDialogOpen}
          onOpenChange={setViewChangesDialogOpen}
          worktree={viewChangesWorktree}
          projectPath={projectPath}
        />

        {/* Discard Changes Confirmation Dialog */}
        <ConfirmDialog
          open={discardChangesDialogOpen}
          onOpenChange={setDiscardChangesDialogOpen}
          onConfirm={handleConfirmDiscardChanges}
          title="Discard Changes"
          description={`Are you sure you want to discard all changes in "${discardChangesWorktree?.branch}"? This will reset staged changes, discard modifications to tracked files, and remove untracked files. This action cannot be undone.`}
          icon={Undo2}
          iconClassName="text-destructive"
          confirmText="Discard Changes"
          confirmVariant="destructive"
        />

        {/* Dev Server Logs Panel */}
        <DevServerLogsPanel
          open={logPanelOpen}
          onClose={handleCloseLogPanel}
          worktree={logPanelWorktree}
          onStopDevServer={handleStopDevServer}
          onOpenDevServerUrl={handleOpenDevServerUrl}
        />

        {/* Push to Remote Dialog */}
        <PushToRemoteDialog
          open={pushToRemoteDialogOpen}
          onOpenChange={setPushToRemoteDialogOpen}
          worktree={pushToRemoteWorktree}
          onConfirm={handleConfirmPushToRemote}
        />

        {/* Merge Branch Dialog */}
        <MergeWorktreeDialog
          open={mergeDialogOpen}
          onOpenChange={setMergeDialogOpen}
          projectPath={projectPath}
          worktree={mergeWorktree}
          onMerged={handleMerged}
          onCreateConflictResolutionFeature={onCreateMergeConflictResolutionFeature}
        />

        {/* Test Logs Panel */}
        <TestLogsPanel
          open={testLogsPanelOpen}
          onClose={handleCloseTestLogsPanel}
          worktreePath={testLogsPanelWorktree?.path ?? null}
          branch={testLogsPanelWorktree?.branch}
          onStopTests={
            testLogsPanelWorktree ? () => handleStopTests(testLogsPanelWorktree) : undefined
          }
        />
      </div>
    );
  }

  // Use dropdown layout when worktree count meets or exceeds the threshold
  const useDropdownLayout = worktrees.length >= WORKTREE_DROPDOWN_THRESHOLD;

  // Desktop view: full tabs layout or dropdown layout depending on worktree count
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-glass/50 backdrop-blur-sm">
      <GitBranch className="w-4 h-4 text-muted-foreground" />
      <span className="text-sm text-muted-foreground mr-2">
        {useDropdownLayout ? 'Worktree:' : 'Branch:'}
      </span>

      {/* Dropdown layout for 3+ worktrees */}
      {useDropdownLayout ? (
        <>
          <WorktreeDropdown
            worktrees={worktrees}
            isWorktreeSelected={isWorktreeSelected}
            hasRunningFeatures={hasRunningFeatures}
            isActivating={isActivating}
            branchCardCounts={branchCardCounts}
            isDevServerRunning={isDevServerRunning}
            getDevServerInfo={getDevServerInfo}
            isAutoModeRunningForWorktree={isAutoModeRunningForWorktree}
            isTestRunningForWorktree={isTestRunningForWorktree}
            getTestSessionInfo={getTestSessionInfo}
            onSelectWorktree={handleSelectWorktree}
            // Branch switching props
            branches={branches}
            filteredBranches={filteredBranches}
            branchFilter={branchFilter}
            isLoadingBranches={isLoadingBranches}
            isSwitching={isSwitching}
            onBranchDropdownOpenChange={handleBranchDropdownOpenChange}
            onBranchFilterChange={setBranchFilter}
            onSwitchBranch={handleSwitchBranch}
            onCreateBranch={onCreateBranch}
            // Action dropdown props
            isPulling={isPulling}
            isPushing={isPushing}
            isStartingDevServer={isStartingDevServer}
            aheadCount={aheadCount}
            behindCount={behindCount}
            hasRemoteBranch={hasRemoteBranch}
            gitRepoStatus={gitRepoStatus}
            hasTestCommand={hasTestCommand}
            isStartingTests={isStartingTests}
            hasInitScript={hasInitScript}
            onActionsDropdownOpenChange={handleActionsDropdownOpenChange}
            onPull={handlePull}
            onPush={handlePush}
            onPushNewBranch={handlePushNewBranch}
            onOpenInEditor={handleOpenInEditor}
            onOpenInIntegratedTerminal={handleOpenInIntegratedTerminal}
            onOpenInExternalTerminal={handleOpenInExternalTerminal}
            onViewChanges={handleViewChanges}
            onDiscardChanges={handleDiscardChanges}
            onCommit={onCommit}
            onCreatePR={onCreatePR}
            onAddressPRComments={onAddressPRComments}
            onResolveConflicts={onResolveConflicts}
            onMerge={handleMerge}
            onDeleteWorktree={onDeleteWorktree}
            onStartDevServer={handleStartDevServer}
            onStopDevServer={handleStopDevServer}
            onOpenDevServerUrl={handleOpenDevServerUrl}
            onViewDevServerLogs={handleViewDevServerLogs}
            onRunInitScript={handleRunInitScript}
            onToggleAutoMode={handleToggleAutoMode}
            onStartTests={handleStartTests}
            onStopTests={handleStopTests}
            onViewTestLogs={handleViewTestLogs}
          />

          {useWorktreesEnabled && (
            <>
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
            </>
          )}
        </>
      ) : (
        /* Standard tabs layout for 1-2 worktrees */
        <>
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
                hasRemoteBranch={hasRemoteBranch}
                gitRepoStatus={gitRepoStatus}
                isAutoModeRunning={isAutoModeRunningForWorktree(mainWorktree)}
                isStartingTests={isStartingTests}
                isTestRunning={isTestRunningForWorktree(mainWorktree)}
                testSessionInfo={getTestSessionInfo(mainWorktree)}
                onSelectWorktree={handleSelectWorktree}
                onBranchDropdownOpenChange={handleBranchDropdownOpenChange(mainWorktree)}
                onActionsDropdownOpenChange={handleActionsDropdownOpenChange(mainWorktree)}
                onBranchFilterChange={setBranchFilter}
                onSwitchBranch={handleSwitchBranch}
                onCreateBranch={onCreateBranch}
                onPull={handlePull}
                onPush={handlePush}
                onPushNewBranch={handlePushNewBranch}
                onOpenInEditor={handleOpenInEditor}
                onOpenInIntegratedTerminal={handleOpenInIntegratedTerminal}
                onOpenInExternalTerminal={handleOpenInExternalTerminal}
                onViewChanges={handleViewChanges}
                onDiscardChanges={handleDiscardChanges}
                onCommit={onCommit}
                onCreatePR={onCreatePR}
                onAddressPRComments={onAddressPRComments}
                onResolveConflicts={onResolveConflicts}
                onMerge={handleMerge}
                onDeleteWorktree={onDeleteWorktree}
                onStartDevServer={handleStartDevServer}
                onStopDevServer={handleStopDevServer}
                onOpenDevServerUrl={handleOpenDevServerUrl}
                onViewDevServerLogs={handleViewDevServerLogs}
                onRunInitScript={handleRunInitScript}
                onToggleAutoMode={handleToggleAutoMode}
                onStartTests={handleStartTests}
                onStopTests={handleStopTests}
                onViewTestLogs={handleViewTestLogs}
                hasInitScript={hasInitScript}
                hasTestCommand={hasTestCommand}
              />
            )}
          </div>

          {/* Worktrees section - only show if enabled and not using dropdown layout */}
          {useWorktreesEnabled && (
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
                      hasRemoteBranch={hasRemoteBranch}
                      gitRepoStatus={gitRepoStatus}
                      isAutoModeRunning={isAutoModeRunningForWorktree(worktree)}
                      isStartingTests={isStartingTests}
                      isTestRunning={isTestRunningForWorktree(worktree)}
                      testSessionInfo={getTestSessionInfo(worktree)}
                      onSelectWorktree={handleSelectWorktree}
                      onBranchDropdownOpenChange={handleBranchDropdownOpenChange(worktree)}
                      onActionsDropdownOpenChange={handleActionsDropdownOpenChange(worktree)}
                      onBranchFilterChange={setBranchFilter}
                      onSwitchBranch={handleSwitchBranch}
                      onCreateBranch={onCreateBranch}
                      onPull={handlePull}
                      onPush={handlePush}
                      onPushNewBranch={handlePushNewBranch}
                      onOpenInEditor={handleOpenInEditor}
                      onOpenInIntegratedTerminal={handleOpenInIntegratedTerminal}
                      onOpenInExternalTerminal={handleOpenInExternalTerminal}
                      onViewChanges={handleViewChanges}
                      onDiscardChanges={handleDiscardChanges}
                      onCommit={onCommit}
                      onCreatePR={onCreatePR}
                      onAddressPRComments={onAddressPRComments}
                      onResolveConflicts={onResolveConflicts}
                      onMerge={handleMerge}
                      onDeleteWorktree={onDeleteWorktree}
                      onStartDevServer={handleStartDevServer}
                      onStopDevServer={handleStopDevServer}
                      onOpenDevServerUrl={handleOpenDevServerUrl}
                      onViewDevServerLogs={handleViewDevServerLogs}
                      onRunInitScript={handleRunInitScript}
                      onToggleAutoMode={handleToggleAutoMode}
                      onStartTests={handleStartTests}
                      onStopTests={handleStopTests}
                      onViewTestLogs={handleViewTestLogs}
                      hasInitScript={hasInitScript}
                      hasTestCommand={hasTestCommand}
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
        </>
      )}

      {/* View Changes Dialog */}
      <ViewWorktreeChangesDialog
        open={viewChangesDialogOpen}
        onOpenChange={setViewChangesDialogOpen}
        worktree={viewChangesWorktree}
        projectPath={projectPath}
      />

      {/* Discard Changes Confirmation Dialog */}
      <ConfirmDialog
        open={discardChangesDialogOpen}
        onOpenChange={setDiscardChangesDialogOpen}
        onConfirm={handleConfirmDiscardChanges}
        title="Discard Changes"
        description={`Are you sure you want to discard all changes in "${discardChangesWorktree?.branch}"? This will reset staged changes, discard modifications to tracked files, and remove untracked files. This action cannot be undone.`}
        icon={Undo2}
        iconClassName="text-destructive"
        confirmText="Discard Changes"
        confirmVariant="destructive"
      />

      {/* Dev Server Logs Panel */}
      <DevServerLogsPanel
        open={logPanelOpen}
        onClose={handleCloseLogPanel}
        worktree={logPanelWorktree}
        onStopDevServer={handleStopDevServer}
        onOpenDevServerUrl={handleOpenDevServerUrl}
      />

      {/* Push to Remote Dialog */}
      <PushToRemoteDialog
        open={pushToRemoteDialogOpen}
        onOpenChange={setPushToRemoteDialogOpen}
        worktree={pushToRemoteWorktree}
        onConfirm={handleConfirmPushToRemote}
      />

      {/* Merge Branch Dialog */}
      <MergeWorktreeDialog
        open={mergeDialogOpen}
        onOpenChange={setMergeDialogOpen}
        projectPath={projectPath}
        worktree={mergeWorktree}
        onMerged={handleMerged}
        onCreateConflictResolutionFeature={onCreateMergeConflictResolutionFeature}
      />

      {/* Test Logs Panel */}
      <TestLogsPanel
        open={testLogsPanelOpen}
        onClose={handleCloseTestLogsPanel}
        worktreePath={testLogsPanelWorktree?.path ?? null}
        branch={testLogsPanelWorktree?.branch}
        onStopTests={
          testLogsPanelWorktree ? () => handleStopTests(testLogsPanelWorktree) : undefined
        }
      />
    </div>
  );
}
