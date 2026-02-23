import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
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
import { DEFAULT_TERMINAL_SCRIPTS } from '@/components/views/project-settings-view/terminal-scripts-constants';
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
  WorktreeDropdown,
  DevServerLogsPanel,
  WorktreeMobileDropdown,
  WorktreeActionsDropdown,
  BranchSwitchDropdown,
} from './components';
import { useAppStore } from '@/store/app-store';
import {
  ViewWorktreeChangesDialog,
  ViewCommitsDialog,
  PushToRemoteDialog,
  MergeWorktreeDialog,
  DiscardWorktreeChangesDialog,
  SelectRemoteDialog,
  StashChangesDialog,
  ViewStashesDialog,
  CherryPickDialog,
  GitPullDialog,
} from '../dialogs';
import { StashConfirmDialog } from '../dialogs/stash-confirm-dialog';
import type { SelectRemoteOperation } from '../dialogs';
import { TestLogsPanel } from '@/components/ui/test-logs-panel';
import { getElectronAPI } from '@/lib/electron';

// Stable empty array to avoid creating a new [] reference on every render
// when pinnedWorktreeBranchesByProject[projectPath] is undefined
const EMPTY_BRANCHES: string[] = [];

export function WorktreePanel({
  projectPath,
  onCreateWorktree,
  onDeleteWorktree,
  onCommit,
  onCreatePR,
  onChangePRNumber,
  onCreateBranch,
  onAddressPRComments,
  onAutoAddressPRComments,
  onResolveConflicts,
  onCreateMergeConflictResolutionFeature,
  onBranchSwitchConflict,
  onStashPopConflict,
  onStashApplyConflict,
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
    getTrackingRemote,
    remotesWithBranch,
    isLoadingBranches,
    branchFilter,
    setBranchFilter,
    resetBranchFilter,
    fetchBranches,
    pruneStaleEntries,
    gitRepoStatus,
  } = useBranches();

  const {
    isPulling,
    isPushing,
    isSyncing,
    isSwitching,
    isActivating,
    handleSwitchBranch,
    handlePull: _handlePull,
    handlePush,
    handleSync,
    handleSetTracking,
    handleOpenInIntegratedTerminal,
    handleRunTerminalScript,
    handleOpenInEditor,
    handleOpenInExternalTerminal,
    pendingSwitch,
    confirmPendingSwitch,
    cancelPendingSwitch,
  } = useWorktreeActions({
    onBranchSwitchConflict: onBranchSwitchConflict,
    onStashPopConflict: onStashPopConflict,
  });

  const { hasRunningFeatures } = useRunningFeatures({
    runningFeatureIds,
    features,
  });

  // Pinned worktrees count from store
  const pinnedWorktreesCount = useAppStore(
    (state) => state.pinnedWorktreesCountByProject[projectPath] ?? 0
  );
  const pinnedWorktreeBranchesRaw = useAppStore(
    (state) => state.pinnedWorktreeBranchesByProject[projectPath]
  );
  const pinnedWorktreeBranches = pinnedWorktreeBranchesRaw ?? EMPTY_BRANCHES;
  const setPinnedWorktreeBranches = useAppStore((state) => state.setPinnedWorktreeBranches);
  const swapPinnedWorktreeBranch = useAppStore((state) => state.swapPinnedWorktreeBranch);

  // Resolve pinned worktrees from explicit branch assignments
  // Shows exactly pinnedWorktreesCount slots, each with a specific worktree.
  // Main worktree is always slot 0. Other slots can be swapped by the user.
  const pinnedWorktrees = useMemo(() => {
    const mainWt = worktrees.find((w) => w.isMain);
    const otherWts = worktrees.filter((w) => !w.isMain);

    // Slot 0 is always main worktree
    const result: WorktreeInfo[] = mainWt ? [mainWt] : [];

    // pinnedWorktreesCount represents only non-main worktrees; main is always shown separately
    const otherSlotCount = Math.max(0, pinnedWorktreesCount);

    if (otherSlotCount > 0 && otherWts.length > 0) {
      // Use explicit branch assignments if available
      const assignedBranches = pinnedWorktreeBranches;
      const usedBranches = new Set<string>();

      for (let i = 0; i < otherSlotCount; i++) {
        const assignedBranch = assignedBranches[i];
        let wt: WorktreeInfo | undefined;

        // Try to find the explicitly assigned worktree
        if (assignedBranch) {
          wt = otherWts.find((w) => w.branch === assignedBranch && !usedBranches.has(w.branch));
        }

        // Fall back to next available worktree if assigned one doesn't exist
        if (!wt) {
          wt = otherWts.find((w) => !usedBranches.has(w.branch));
        }

        if (wt) {
          result.push(wt);
          usedBranches.add(wt.branch);
        }
      }
    }

    return result;
  }, [worktrees, pinnedWorktreesCount, pinnedWorktreeBranches]);

  // All non-main worktrees available for swapping into slots
  const availableWorktreesForSwap = useMemo(() => {
    return worktrees.filter((w) => !w.isMain);
  }, [worktrees]);

  // Handle swapping a worktree in a specific slot
  const handleSwapWorktreeSlot = useCallback(
    (slotIndex: number, newBranch: string) => {
      swapPinnedWorktreeBranch(projectPath, slotIndex, newBranch);
    },
    [projectPath, swapPinnedWorktreeBranch]
  );

  // Initialize pinned branch assignments when worktrees change
  // This ensures new worktrees get default slot assignments
  // Read store state directly inside the effect to avoid a dependency cycle
  // (the effect writes to the same state it would otherwise depend on)
  useEffect(() => {
    const mainWt = worktrees.find((w) => w.isMain);
    const otherWts = worktrees.filter((w) => !w.isMain);
    const otherSlotCount = Math.max(0, pinnedWorktreesCount);

    const storedBranches = useAppStore.getState().pinnedWorktreeBranchesByProject[projectPath];
    if (otherSlotCount > 0 && otherWts.length > 0) {
      const existing = storedBranches ?? [];
      if (existing.length < otherSlotCount) {
        const used = new Set(existing.filter(Boolean));
        const filled = [...existing];
        for (const wt of otherWts) {
          if (filled.length >= otherSlotCount) break;
          if (!used.has(wt.branch)) {
            filled.push(wt.branch);
            used.add(wt.branch);
          }
        }
        if (filled.length > 0) {
          setPinnedWorktreeBranches(projectPath, filled);
        }
      }
    }
  }, [worktrees, pinnedWorktreesCount, projectPath, setPinnedWorktreeBranches]);

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

  // Get terminal quick scripts from project settings (or fall back to defaults)
  const terminalScripts = useMemo(() => {
    const configured = projectSettings?.terminalScripts;
    if (configured && configured.length > 0) {
      return configured;
    }
    return DEFAULT_TERMINAL_SCRIPTS;
  }, [projectSettings?.terminalScripts]);

  // Navigate to project settings to edit scripts
  const navigate = useNavigate();
  const handleEditScripts = useCallback(() => {
    navigate({ to: '/project-settings', search: { section: 'commands-scripts' } });
  }, [navigate]);

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

  // View commits dialog state
  const [viewCommitsDialogOpen, setViewCommitsDialogOpen] = useState(false);
  const [viewCommitsWorktree, setViewCommitsWorktree] = useState<WorktreeInfo | null>(null);

  // Discard changes confirmation dialog state
  const [discardChangesDialogOpen, setDiscardChangesDialogOpen] = useState(false);
  const [discardChangesWorktree, setDiscardChangesWorktree] = useState<WorktreeInfo | null>(null);

  // Log panel state management
  const [logPanelOpen, setLogPanelOpen] = useState(false);
  const [logPanelWorktree, setLogPanelWorktree] = useState<WorktreeInfo | null>(null);

  // Push to remote dialog state
  const [pushToRemoteDialogOpen, setPushToRemoteDialogOpen] = useState(false);
  const [pushToRemoteWorktree, setPushToRemoteWorktree] = useState<WorktreeInfo | null>(null);

  // Integrate branch dialog state
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeWorktree, setMergeWorktree] = useState<WorktreeInfo | null>(null);

  // Select remote dialog state (for pull/push with multiple remotes)
  const [selectRemoteDialogOpen, setSelectRemoteDialogOpen] = useState(false);
  const [selectRemoteWorktree, setSelectRemoteWorktree] = useState<WorktreeInfo | null>(null);
  const [selectRemoteOperation, setSelectRemoteOperation] = useState<SelectRemoteOperation>('pull');

  // Stash dialog states
  const [stashChangesDialogOpen, setStashChangesDialogOpen] = useState(false);
  const [stashChangesWorktree, setStashChangesWorktree] = useState<WorktreeInfo | null>(null);
  const [viewStashesDialogOpen, setViewStashesDialogOpen] = useState(false);
  const [viewStashesWorktree, setViewStashesWorktree] = useState<WorktreeInfo | null>(null);

  // Cherry-pick dialog states
  const [cherryPickDialogOpen, setCherryPickDialogOpen] = useState(false);
  const [cherryPickWorktree, setCherryPickWorktree] = useState<WorktreeInfo | null>(null);

  // Pull dialog states
  const [pullDialogOpen, setPullDialogOpen] = useState(false);
  const [pullDialogWorktree, setPullDialogWorktree] = useState<WorktreeInfo | null>(null);
  const [pullDialogRemote, setPullDialogRemote] = useState<string | undefined>(undefined);

  // Remotes cache: maps worktree path -> list of remotes (fetched when dropdown opens)
  const [remotesCache, setRemotesCache] = useState<
    Record<string, Array<{ name: string; url: string }>>
  >({});

  const isMobile = useIsMobile();

  // NOTE: Periodic polling is handled by React Query's refetchInterval
  // in hooks/queries/use-worktrees.ts (30s). No separate setInterval needed.

  // Prune stale tracking-remote cache entries and remotes cache when worktrees change
  useEffect(() => {
    const activePaths = new Set(worktrees.map((w) => w.path));
    pruneStaleEntries(activePaths);
    setRemotesCache((prev) => {
      const next: typeof prev = {};
      for (const key of Object.keys(prev)) {
        if (activePaths.has(key)) {
          next[key] = prev[key];
        }
      }
      return next;
    });
  }, [worktrees, pruneStaleEntries]);

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
      // Fetch remotes for the submenu when the dropdown opens, but only if not already cached
      if (!remotesCache[worktree.path]) {
        const api = getHttpApiClient();
        api.worktree
          .listRemotes(worktree.path)
          .then((result) => {
            if (result.success && result.result) {
              setRemotesCache((prev) => ({
                ...prev,
                [worktree.path]: result.result!.remotes.map((r) => ({ name: r.name, url: r.url })),
              }));
            }
          })
          .catch((err) => {
            console.warn('Failed to fetch remotes for worktree:', err);
          });
      }
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

  const handleViewCommits = useCallback((worktree: WorktreeInfo) => {
    setViewCommitsWorktree(worktree);
    setViewCommitsDialogOpen(true);
  }, []);

  const handleDiscardChanges = useCallback((worktree: WorktreeInfo) => {
    setDiscardChangesWorktree(worktree);
    setDiscardChangesDialogOpen(true);
  }, []);

  const handleDiscardCompleted = useCallback(() => {
    fetchWorktrees({ silent: true });
  }, [fetchWorktrees]);

  // Handle stash changes dialog
  const handleStashChanges = useCallback((worktree: WorktreeInfo) => {
    setStashChangesWorktree(worktree);
    setStashChangesDialogOpen(true);
  }, []);

  const handleStashCompleted = useCallback(() => {
    fetchWorktrees({ silent: true });
  }, [fetchWorktrees]);

  // Handle view stashes dialog
  const handleViewStashes = useCallback((worktree: WorktreeInfo) => {
    setViewStashesWorktree(worktree);
    setViewStashesDialogOpen(true);
  }, []);

  const handleStashApplied = useCallback(() => {
    fetchWorktrees({ silent: true });
  }, [fetchWorktrees]);

  // Handle cherry-pick dialog
  const handleCherryPick = useCallback((worktree: WorktreeInfo) => {
    setCherryPickWorktree(worktree);
    setCherryPickDialogOpen(true);
  }, []);

  const handleCherryPicked = useCallback(() => {
    fetchWorktrees({ silent: true });
  }, [fetchWorktrees]);

  // Handle aborting an in-progress merge/rebase/cherry-pick
  const handleAbortOperation = useCallback(
    async (worktree: WorktreeInfo) => {
      try {
        const api = getHttpApiClient();
        const result = await api.worktree.abortOperation(worktree.path);
        if (result.success && result.result) {
          toast.success(result.result.message || 'Operation aborted successfully');
          fetchWorktrees({ silent: true });
        } else {
          toast.error(result.error || 'Failed to abort operation');
        }
      } catch (error) {
        toast.error('Failed to abort operation', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
    [fetchWorktrees]
  );

  // Handle continuing an in-progress merge/rebase/cherry-pick after conflict resolution
  const handleContinueOperation = useCallback(
    async (worktree: WorktreeInfo) => {
      try {
        const api = getHttpApiClient();
        const result = await api.worktree.continueOperation(worktree.path);
        if (result.success && result.result) {
          toast.success(result.result.message || 'Operation continued successfully');
          fetchWorktrees({ silent: true });
        } else {
          toast.error(result.error || 'Failed to continue operation');
        }
      } catch (error) {
        toast.error('Failed to continue operation', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
    [fetchWorktrees]
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

  // Handle opening the push to remote dialog
  const handlePushNewBranch = useCallback((worktree: WorktreeInfo) => {
    setPushToRemoteWorktree(worktree);
    setPushToRemoteDialogOpen(true);
  }, []);

  // Keep a ref to pullDialogWorktree so handlePullCompleted can access the current
  // value without including it in the dependency array. If pullDialogWorktree were
  // a dep of handlePullCompleted, changing it would recreate the callback, which
  // would propagate into GitPullDialog's onPulled prop and ultimately re-trigger
  // the pull-check effect inside the dialog (causing the flow to run twice).
  const pullDialogWorktreeRef = useRef(pullDialogWorktree);
  useEffect(() => {
    pullDialogWorktreeRef.current = pullDialogWorktree;
  }, [pullDialogWorktree]);

  // Handle pull completed - refresh branches and worktrees
  const handlePullCompleted = useCallback(() => {
    // Refresh branch data (ahead/behind counts, tracking) and worktree list
    // after GitPullDialog completes the pull operation
    if (pullDialogWorktreeRef.current) {
      fetchBranches(pullDialogWorktreeRef.current.path);
    }
    fetchWorktrees({ silent: true });
  }, [fetchWorktrees, fetchBranches]);

  // Wrapper for onCommit that works with the pull dialog's simpler WorktreeInfo.
  // Uses the full pullDialogWorktree when available (via ref to avoid making it
  // a dep that would cascade into handleSuccessfulPull → checkForLocalChanges recreations).
  const handleCommitMerge = useCallback(
    (_simpleWorktree: { path: string; branch: string; isMain: boolean }) => {
      // Prefer the full worktree object we already have (from ref)
      if (pullDialogWorktreeRef.current) {
        onCommit(pullDialogWorktreeRef.current);
      }
    },
    [onCommit]
  );

  // Handle pull with remote selection when multiple remotes exist
  // Now opens the pull dialog which handles stash management and conflict resolution
  // If the branch has a tracked remote, pull from it directly (skip the remote selection dialog)
  const handlePullWithRemoteSelection = useCallback(
    async (worktree: WorktreeInfo) => {
      // If the branch already tracks a remote, pull from it directly — no dialog needed
      const tracked = getTrackingRemote(worktree.path);
      if (tracked) {
        setPullDialogRemote(tracked);
        setPullDialogWorktree(worktree);
        setPullDialogOpen(true);
        return;
      }

      try {
        const api = getHttpApiClient();
        const result = await api.worktree.listRemotes(worktree.path);

        if (result.success && result.result && result.result.remotes.length > 1) {
          // Multiple remotes and no tracking remote - show selection dialog
          setSelectRemoteWorktree(worktree);
          setSelectRemoteOperation('pull');
          setSelectRemoteDialogOpen(true);
        } else if (result.success && result.result && result.result.remotes.length === 1) {
          // Exactly one remote - open pull dialog directly with that remote
          const remoteName = result.result.remotes[0].name;
          setPullDialogRemote(remoteName);
          setPullDialogWorktree(worktree);
          setPullDialogOpen(true);
        } else {
          // No remotes - open pull dialog with default
          setPullDialogRemote(undefined);
          setPullDialogWorktree(worktree);
          setPullDialogOpen(true);
        }
      } catch {
        // If listing remotes fails, open pull dialog with default
        setPullDialogRemote(undefined);
        setPullDialogWorktree(worktree);
        setPullDialogOpen(true);
      }
    },
    [getTrackingRemote]
  );

  // Handle push with remote selection when multiple remotes exist
  // If the branch has a tracked remote, push to it directly (skip the remote selection dialog)
  const handlePushWithRemoteSelection = useCallback(
    async (worktree: WorktreeInfo) => {
      // If the branch already tracks a remote, push to it directly — no dialog needed
      const tracked = getTrackingRemote(worktree.path);
      if (tracked) {
        handlePush(worktree, tracked);
        return;
      }

      try {
        const api = getHttpApiClient();
        const result = await api.worktree.listRemotes(worktree.path);

        if (result.success && result.result && result.result.remotes.length > 1) {
          // Multiple remotes and no tracking remote - show selection dialog
          setSelectRemoteWorktree(worktree);
          setSelectRemoteOperation('push');
          setSelectRemoteDialogOpen(true);
        } else if (result.success && result.result && result.result.remotes.length === 1) {
          // Exactly one remote - use it directly
          const remoteName = result.result.remotes[0].name;
          handlePush(worktree, remoteName);
        } else {
          // No remotes - proceed with default behavior
          handlePush(worktree);
        }
      } catch {
        // If listing remotes fails, fall back to default behavior
        handlePush(worktree);
      }
    },
    [handlePush, getTrackingRemote]
  );

  // Handle confirming remote selection for pull/push
  const handleConfirmSelectRemote = useCallback(
    async (worktree: WorktreeInfo, remote: string) => {
      if (selectRemoteOperation === 'pull') {
        // Open the pull dialog — let GitPullDialog manage the pull operation
        // via its useEffect and onPulled callback (handlePullCompleted)
        setPullDialogRemote(remote);
        setPullDialogWorktree(worktree);
        setPullDialogOpen(true);
      } else {
        await handlePush(worktree, remote);
        fetchBranches(worktree.path);
        fetchWorktrees({ silent: true });
      }
    },
    [selectRemoteOperation, handlePush, fetchBranches, fetchWorktrees]
  );

  // Handle pull with a specific remote selected from the submenu (bypasses the remote selection dialog)
  const handlePullWithSpecificRemote = useCallback((worktree: WorktreeInfo, remote: string) => {
    // Open the pull dialog — let GitPullDialog manage the pull operation
    // via its useEffect and onPulled callback (handlePullCompleted)
    setPullDialogRemote(remote);
    setPullDialogWorktree(worktree);
    setPullDialogOpen(true);
  }, []);

  // Handle push to a specific remote selected from the submenu (bypasses the remote selection dialog)
  const handlePushWithSpecificRemote = useCallback(
    async (worktree: WorktreeInfo, remote: string) => {
      await handlePush(worktree, remote);
      fetchBranches(worktree.path);
      fetchWorktrees({ silent: true });
    },
    [handlePush, fetchBranches, fetchWorktrees]
  );

  // Handle sync (pull + push) with optional remote selection
  const handleSyncWithRemoteSelection = useCallback(
    (worktree: WorktreeInfo) => {
      handleSync(worktree);
    },
    [handleSync]
  );

  // Handle sync with a specific remote selected from the submenu
  const handleSyncWithSpecificRemote = useCallback(
    (worktree: WorktreeInfo, remote: string) => {
      handleSync(worktree, remote);
    },
    [handleSync]
  );

  // Handle set tracking branch for a specific remote
  const handleSetTrackingForRemote = useCallback(
    (worktree: WorktreeInfo, remote: string) => {
      handleSetTracking(worktree, remote);
    },
    [handleSetTracking]
  );

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

  // Handle integration completion - refresh worktrees and reassign features if branch was deleted
  const handleIntegrated = useCallback(
    (integratedWorktree: WorktreeInfo, deletedBranch: boolean) => {
      fetchWorktrees();
      // If the branch was deleted, notify parent to reassign features to main
      if (deletedBranch && onBranchDeletedDuringMerge) {
        onBranchDeletedDuringMerge(integratedWorktree.branch);
      }
    },
    [fetchWorktrees, onBranchDeletedDuringMerge]
  );

  const mainWorktree = worktrees.find((w) => w.isMain);

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
            trackingRemote={getTrackingRemote(selectedWorktree.path)}
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
            remotes={remotesCache[selectedWorktree.path]}
            onOpenChange={handleActionsDropdownOpenChange(selectedWorktree)}
            onPull={handlePullWithRemoteSelection}
            onPush={handlePushWithRemoteSelection}
            onPushNewBranch={handlePushNewBranch}
            onPullWithRemote={handlePullWithSpecificRemote}
            onPushWithRemote={handlePushWithSpecificRemote}
            isSyncing={isSyncing}
            onSync={handleSyncWithRemoteSelection}
            onSyncWithRemote={handleSyncWithSpecificRemote}
            onSetTracking={handleSetTrackingForRemote}
            remotesWithBranch={remotesWithBranch}
            onOpenInEditor={handleOpenInEditor}
            onOpenInIntegratedTerminal={handleOpenInIntegratedTerminal}
            onOpenInExternalTerminal={handleOpenInExternalTerminal}
            onViewChanges={handleViewChanges}
            onViewCommits={handleViewCommits}
            onDiscardChanges={handleDiscardChanges}
            onCommit={onCommit}
            onCreatePR={onCreatePR}
            onChangePRNumber={onChangePRNumber}
            onAddressPRComments={onAddressPRComments}
            onAutoAddressPRComments={onAutoAddressPRComments}
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
            onStashChanges={handleStashChanges}
            onViewStashes={handleViewStashes}
            onCherryPick={handleCherryPick}
            onAbortOperation={handleAbortOperation}
            onContinueOperation={handleContinueOperation}
            hasInitScript={hasInitScript}
            terminalScripts={terminalScripts}
            onRunTerminalScript={handleRunTerminalScript}
            onEditScripts={handleEditScripts}
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

        {/* View Commits Dialog */}
        <ViewCommitsDialog
          open={viewCommitsDialogOpen}
          onOpenChange={setViewCommitsDialogOpen}
          worktree={viewCommitsWorktree}
        />

        {/* Discard Changes Dialog */}
        <DiscardWorktreeChangesDialog
          open={discardChangesDialogOpen}
          onOpenChange={setDiscardChangesDialogOpen}
          worktree={discardChangesWorktree}
          onDiscarded={handleDiscardCompleted}
        />

        {/* Stash Changes Dialog */}
        <StashChangesDialog
          open={stashChangesDialogOpen}
          onOpenChange={setStashChangesDialogOpen}
          worktree={stashChangesWorktree}
          onStashed={handleStashCompleted}
        />

        {/* Stash Confirm Dialog for Branch Switching */}
        <StashConfirmDialog
          open={!!pendingSwitch}
          onOpenChange={(isOpen) => {
            if (!isOpen) cancelPendingSwitch();
          }}
          operationDescription={
            pendingSwitch ? `switch to branch '${pendingSwitch.branchName}'` : ''
          }
          changesInfo={pendingSwitch?.changesInfo ?? null}
          onConfirm={confirmPendingSwitch}
          isLoading={isSwitching}
        />

        {/* View Stashes Dialog */}
        <ViewStashesDialog
          open={viewStashesDialogOpen}
          onOpenChange={setViewStashesDialogOpen}
          worktree={viewStashesWorktree}
          onStashApplied={handleStashApplied}
          onStashApplyConflict={onStashApplyConflict}
        />

        {/* Cherry Pick Dialog */}
        <CherryPickDialog
          open={cherryPickDialogOpen}
          onOpenChange={setCherryPickDialogOpen}
          worktree={cherryPickWorktree}
          onCherryPicked={handleCherryPicked}
          onCreateConflictResolutionFeature={onCreateMergeConflictResolutionFeature}
        />

        {/* Git Pull Dialog */}
        <GitPullDialog
          open={pullDialogOpen}
          onOpenChange={setPullDialogOpen}
          worktree={pullDialogWorktree}
          remote={pullDialogRemote}
          onPulled={handlePullCompleted}
          onCreateConflictResolutionFeature={onCreateMergeConflictResolutionFeature}
          onCommitMerge={handleCommitMerge}
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

        {/* Select Remote Dialog (for pull/push with multiple remotes) */}
        <SelectRemoteDialog
          open={selectRemoteDialogOpen}
          onOpenChange={setSelectRemoteDialogOpen}
          worktree={selectRemoteWorktree}
          operation={selectRemoteOperation}
          onConfirm={handleConfirmSelectRemote}
        />

        {/* Integrate Branch Dialog */}
        <MergeWorktreeDialog
          open={mergeDialogOpen}
          onOpenChange={setMergeDialogOpen}
          projectPath={projectPath}
          worktree={mergeWorktree}
          onIntegrated={handleIntegrated}
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

  // Desktop view: pinned worktrees as individual tabs (each slot can be swapped)

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-border bg-glass/50 backdrop-blur-sm">
      <GitBranch className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className="text-sm text-muted-foreground mr-2 shrink-0">Worktree:</span>

      {/* When only 1 pinned slot (main only) and there are other worktrees,
          use a compact dropdown to switch between them without highlighting main */}
      {pinnedWorktreesCount === 0 && availableWorktreesForSwap.length > 0 ? (
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
          branches={branches}
          filteredBranches={filteredBranches}
          branchFilter={branchFilter}
          isLoadingBranches={isLoadingBranches}
          isSwitching={isSwitching}
          onBranchDropdownOpenChange={handleBranchDropdownOpenChange}
          onBranchFilterChange={setBranchFilter}
          onSwitchBranch={handleSwitchBranch}
          onCreateBranch={onCreateBranch}
          isPulling={isPulling}
          isPushing={isPushing}
          isStartingDevServer={isStartingDevServer}
          aheadCount={aheadCount}
          behindCount={behindCount}
          hasRemoteBranch={hasRemoteBranch}
          getTrackingRemote={getTrackingRemote}
          gitRepoStatus={gitRepoStatus}
          hasTestCommand={hasTestCommand}
          isStartingTests={isStartingTests}
          hasInitScript={hasInitScript}
          onActionsDropdownOpenChange={handleActionsDropdownOpenChange}
          onPull={handlePullWithRemoteSelection}
          onPush={handlePushWithRemoteSelection}
          onPushNewBranch={handlePushNewBranch}
          onPullWithRemote={handlePullWithSpecificRemote}
          onPushWithRemote={handlePushWithSpecificRemote}
          remotesCache={remotesCache}
          onOpenInEditor={handleOpenInEditor}
          onOpenInIntegratedTerminal={handleOpenInIntegratedTerminal}
          onOpenInExternalTerminal={handleOpenInExternalTerminal}
          onViewChanges={handleViewChanges}
          onViewCommits={handleViewCommits}
          onDiscardChanges={handleDiscardChanges}
          onCommit={onCommit}
          onCreatePR={onCreatePR}
          onChangePRNumber={onChangePRNumber}
          onAddressPRComments={onAddressPRComments}
          onAutoAddressPRComments={onAutoAddressPRComments}
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
          onStashChanges={handleStashChanges}
          onViewStashes={handleViewStashes}
          onCherryPick={handleCherryPick}
          onAbortOperation={handleAbortOperation}
          onContinueOperation={handleContinueOperation}
          terminalScripts={terminalScripts}
          onRunTerminalScript={handleRunTerminalScript}
          onEditScripts={handleEditScripts}
          highlightTrigger={false}
        />
      ) : pinnedWorktreesCount === 0 ? (
        /* Only main worktree, no others exist - render main tab without highlight */
        mainWorktree && (
          <WorktreeTab
            worktree={mainWorktree}
            cardCount={branchCardCounts?.[mainWorktree.branch]}
            hasChanges={mainWorktree.hasChanges}
            changedFilesCount={mainWorktree.changedFilesCount}
            isSelected={false}
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
            trackingRemote={getTrackingRemote(mainWorktree.path)}
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
            onPull={handlePullWithRemoteSelection}
            onPush={handlePushWithRemoteSelection}
            onPushNewBranch={handlePushNewBranch}
            onPullWithRemote={handlePullWithSpecificRemote}
            onPushWithRemote={handlePushWithSpecificRemote}
            isSyncing={isSyncing}
            onSync={handleSyncWithRemoteSelection}
            onSyncWithRemote={handleSyncWithSpecificRemote}
            onSetTracking={handleSetTrackingForRemote}
            remotesWithBranch={remotesWithBranch}
            remotes={remotesCache[mainWorktree.path]}
            onOpenInEditor={handleOpenInEditor}
            onOpenInIntegratedTerminal={handleOpenInIntegratedTerminal}
            onOpenInExternalTerminal={handleOpenInExternalTerminal}
            onViewChanges={handleViewChanges}
            onViewCommits={handleViewCommits}
            onDiscardChanges={handleDiscardChanges}
            onCommit={onCommit}
            onCreatePR={onCreatePR}
            onChangePRNumber={onChangePRNumber}
            onAddressPRComments={onAddressPRComments}
            onAutoAddressPRComments={onAutoAddressPRComments}
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
            onStashChanges={handleStashChanges}
            onViewStashes={handleViewStashes}
            onCherryPick={handleCherryPick}
            onAbortOperation={handleAbortOperation}
            onContinueOperation={handleContinueOperation}
            hasInitScript={hasInitScript}
            hasTestCommand={hasTestCommand}
            terminalScripts={terminalScripts}
            onRunTerminalScript={handleRunTerminalScript}
            onEditScripts={handleEditScripts}
          />
        )
      ) : (
        /* Multiple pinned slots - show individual tabs */
        pinnedWorktrees.map((worktree, index) => {
          const hasOtherWorktrees = worktrees.length > 1;
          const effectiveIsSelected =
            isWorktreeSelected(worktree) && (hasOtherWorktrees || !worktree.isMain);

          // Slot index for swap (0-based, excluding main which is always slot 0)
          const slotIndex = worktree.isMain ? -1 : index - (pinnedWorktrees[0]?.isMain ? 1 : 0);

          return (
            <WorktreeTab
              key={worktree.path}
              worktree={worktree}
              cardCount={branchCardCounts?.[worktree.branch]}
              hasChanges={worktree.hasChanges}
              changedFilesCount={worktree.changedFilesCount}
              isSelected={effectiveIsSelected}
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
              trackingRemote={getTrackingRemote(worktree.path)}
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
              onPull={handlePullWithRemoteSelection}
              onPush={handlePushWithRemoteSelection}
              onPushNewBranch={handlePushNewBranch}
              onPullWithRemote={handlePullWithSpecificRemote}
              onPushWithRemote={handlePushWithSpecificRemote}
              remotes={remotesCache[worktree.path]}
              onOpenInEditor={handleOpenInEditor}
              onOpenInIntegratedTerminal={handleOpenInIntegratedTerminal}
              onOpenInExternalTerminal={handleOpenInExternalTerminal}
              onViewChanges={handleViewChanges}
              onViewCommits={handleViewCommits}
              onDiscardChanges={handleDiscardChanges}
              onCommit={onCommit}
              onCreatePR={onCreatePR}
              onChangePRNumber={onChangePRNumber}
              onAddressPRComments={onAddressPRComments}
              onAutoAddressPRComments={onAutoAddressPRComments}
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
              onStashChanges={handleStashChanges}
              onViewStashes={handleViewStashes}
              onCherryPick={handleCherryPick}
              onAbortOperation={handleAbortOperation}
              onContinueOperation={handleContinueOperation}
              hasInitScript={hasInitScript}
              hasTestCommand={hasTestCommand}
              terminalScripts={terminalScripts}
              onRunTerminalScript={handleRunTerminalScript}
              onEditScripts={handleEditScripts}
              availableWorktreesForSwap={!worktree.isMain ? availableWorktreesForSwap : undefined}
              slotIndex={slotIndex >= 0 ? slotIndex : undefined}
              onSwapWorktree={slotIndex >= 0 ? handleSwapWorktreeSlot : undefined}
              pinnedBranches={pinnedWorktrees.map((w) => w.branch)}
              isSyncing={isSyncing}
              onSync={handleSyncWithRemoteSelection}
              onSyncWithRemote={handleSyncWithSpecificRemote}
              onSetTracking={handleSetTrackingForRemote}
            />
          );
        })
      )}

      {/* Create and refresh buttons */}
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

      {/* View Changes Dialog */}
      <ViewWorktreeChangesDialog
        open={viewChangesDialogOpen}
        onOpenChange={setViewChangesDialogOpen}
        worktree={viewChangesWorktree}
        projectPath={projectPath}
      />

      {/* View Commits Dialog */}
      <ViewCommitsDialog
        open={viewCommitsDialogOpen}
        onOpenChange={setViewCommitsDialogOpen}
        worktree={viewCommitsWorktree}
      />

      {/* Discard Changes Dialog */}
      <DiscardWorktreeChangesDialog
        open={discardChangesDialogOpen}
        onOpenChange={setDiscardChangesDialogOpen}
        worktree={discardChangesWorktree}
        onDiscarded={handleDiscardCompleted}
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

      {/* Select Remote Dialog (for pull/push with multiple remotes) */}
      <SelectRemoteDialog
        open={selectRemoteDialogOpen}
        onOpenChange={setSelectRemoteDialogOpen}
        worktree={selectRemoteWorktree}
        operation={selectRemoteOperation}
        onConfirm={handleConfirmSelectRemote}
      />

      {/* Integrate Branch Dialog */}
      <MergeWorktreeDialog
        open={mergeDialogOpen}
        onOpenChange={setMergeDialogOpen}
        projectPath={projectPath}
        worktree={mergeWorktree}
        onIntegrated={handleIntegrated}
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

      {/* Stash Changes Dialog */}
      <StashChangesDialog
        open={stashChangesDialogOpen}
        onOpenChange={setStashChangesDialogOpen}
        worktree={stashChangesWorktree}
        onStashed={handleStashCompleted}
      />

      {/* Stash Confirm Dialog for Branch Switching */}
      <StashConfirmDialog
        open={!!pendingSwitch}
        onOpenChange={(isOpen) => {
          if (!isOpen) cancelPendingSwitch();
        }}
        operationDescription={pendingSwitch ? `switch to branch '${pendingSwitch.branchName}'` : ''}
        changesInfo={pendingSwitch?.changesInfo ?? null}
        onConfirm={confirmPendingSwitch}
        isLoading={isSwitching}
      />

      {/* View Stashes Dialog */}
      <ViewStashesDialog
        open={viewStashesDialogOpen}
        onOpenChange={setViewStashesDialogOpen}
        worktree={viewStashesWorktree}
        onStashApplied={handleStashApplied}
        onStashApplyConflict={onStashApplyConflict}
      />

      {/* Cherry Pick Dialog */}
      <CherryPickDialog
        open={cherryPickDialogOpen}
        onOpenChange={setCherryPickDialogOpen}
        worktree={cherryPickWorktree}
        onCherryPicked={handleCherryPicked}
        onCreateConflictResolutionFeature={onCreateMergeConflictResolutionFeature}
      />

      {/* Git Pull Dialog */}
      <GitPullDialog
        open={pullDialogOpen}
        onOpenChange={setPullDialogOpen}
        worktree={pullDialogWorktree}
        remote={pullDialogRemote}
        onPulled={handlePullCompleted}
        onCommitMerge={handleCommitMerge}
        onCreateConflictResolutionFeature={onCreateMergeConflictResolutionFeature}
      />
    </div>
  );
}
