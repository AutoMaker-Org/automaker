// @ts-nocheck
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createLogger } from '@automaker/utils/logger';
import {
  PointerSensor,
  useSensor,
  useSensors,
  rectIntersection,
  pointerWithin,
  type PointerEvent as DndPointerEvent,
} from '@dnd-kit/core';

// Custom pointer sensor that ignores drag events from within dialogs
class DialogAwarePointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent: event }: { nativeEvent: DndPointerEvent }) => {
        // Don't start drag if the event originated from inside a dialog
        if ((event.target as Element)?.closest?.('[role="dialog"]')) {
          return false;
        }
        return true;
      },
    },
  ];
}
import { useAppStore, Feature } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { getHttpApiClient } from '@/lib/http-api-client';
import type { AutoModeEvent } from '@/types/electron';
import type { ModelAlias, CursorModelId, BacklogPlanResult } from '@automaker/types';
import { pathsEqual } from '@/lib/utils';
import { toast } from 'sonner';
import { getBlockingDependencies } from '@automaker/dependency-resolver';
import { BoardBackgroundModal } from '@/components/dialogs/board-background-modal';
import { RefreshCw } from 'lucide-react';
import { useAutoMode } from '@/hooks/use-auto-mode';
import { useKeyboardShortcutsConfig } from '@/hooks/use-keyboard-shortcuts';
import { useWindowState } from '@/hooks/use-window-state';
// Board-view specific imports
import { BoardHeader } from './board-view/board-header';
import { KanbanBoard } from './board-view/kanban-board';
import {
  AddFeatureDialog,
  AgentOutputModal,
  BacklogPlanDialog,
  CompletedFeaturesModal,
  ArchiveAllVerifiedDialog,
  DeleteCompletedFeatureDialog,
  EditFeatureDialog,
  FollowUpDialog,
  PlanApprovalDialog,
} from './board-view/dialogs';
import { PipelineSettingsDialog } from './board-view/dialogs/pipeline-settings-dialog';
import { CreateWorktreeDialog } from './board-view/dialogs/create-worktree-dialog';
import { DeleteWorktreeDialog } from './board-view/dialogs/delete-worktree-dialog';
import { CommitWorktreeDialog } from './board-view/dialogs/commit-worktree-dialog';
import { CreatePRDialog } from './board-view/dialogs/create-pr-dialog';
import { CreateBranchDialog } from './board-view/dialogs/create-branch-dialog';
import { WorktreePanel } from './board-view/worktree-panel';
import type { PRInfo, WorktreeInfo } from './board-view/worktree-panel/types';
import { COLUMNS } from './board-view/constants';
import {
  useBoardFeatures,
  useBoardDragDrop,
  useBoardActions,
  useBoardKeyboardShortcuts,
  useBoardColumnFeatures,
  useBoardEffects,
  useBoardBackground,
  useBoardPersistence,
  useFollowUpState,
  useSelectionMode,
} from './board-view/hooks';
import { SelectionActionBar } from './board-view/components';
import { MassEditDialog } from './board-view/dialogs';

// Stable empty array to avoid infinite loop in selector
const EMPTY_WORKTREES: ReturnType<ReturnType<typeof useAppStore.getState>['getWorktrees']> = [];

const logger = createLogger('Board');

export function BoardView() {
  const {
    currentProject,
    maxConcurrency,
    setMaxConcurrency,
    defaultSkipTests,
    specCreatingForProject,
    setSpecCreatingForProject,
    pendingPlanApproval,
    setPendingPlanApproval,
    updateFeature,
    getCurrentWorktree,
    setCurrentWorktree,
    getWorktrees,
    setWorktrees,
    useWorktrees,
    enableDependencyBlocking,
    skipVerificationInAutoMode,
    isPrimaryWorktreeBranch,
    getPrimaryWorktreeBranch,
    setPipelineConfig,
  } = useAppStore();
  // Subscribe to pipelineConfigByProject to trigger re-renders when it changes
  const pipelineConfigByProject = useAppStore((state) => state.pipelineConfigByProject);
  // Subscribe to worktreePanelVisibleByProject to trigger re-renders when it changes
  const worktreePanelVisibleByProject = useAppStore((state) => state.worktreePanelVisibleByProject);
  const shortcuts = useKeyboardShortcutsConfig();
  const {
    features: hookFeatures,
    isLoading,
    persistedCategories,
    loadFeatures,
    saveCategory,
  } = useBoardFeatures({ currentProject });
  const [editingFeature, setEditingFeature] = useState<Feature | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [showOutputModal, setShowOutputModal] = useState(false);
  const [outputFeature, setOutputFeature] = useState<Feature | null>(null);
  const [featuresWithContext, setFeaturesWithContext] = useState<Set<string>>(new Set());
  const [showArchiveAllVerifiedDialog, setShowArchiveAllVerifiedDialog] = useState(false);
  const [showBoardBackgroundModal, setShowBoardBackgroundModal] = useState(false);
  const [showCompletedModal, setShowCompletedModal] = useState(false);
  const [deleteCompletedFeature, setDeleteCompletedFeature] = useState<Feature | null>(null);
  // State for viewing plan in read-only mode
  const [viewPlanFeature, setViewPlanFeature] = useState<Feature | null>(null);

  // State for spawn task mode
  const [spawnParentFeature, setSpawnParentFeature] = useState<Feature | null>(null);

  // Worktree dialog states
  const [showCreateWorktreeDialog, setShowCreateWorktreeDialog] = useState(false);
  const [showDeleteWorktreeDialog, setShowDeleteWorktreeDialog] = useState(false);
  const [showCommitWorktreeDialog, setShowCommitWorktreeDialog] = useState(false);
  const [showCreatePRDialog, setShowCreatePRDialog] = useState(false);
  const [showCreateBranchDialog, setShowCreateBranchDialog] = useState(false);
  const [selectedWorktreeForAction, setSelectedWorktreeForAction] = useState<{
    path: string;
    branch: string;
    isMain: boolean;
    hasChanges?: boolean;
    changedFilesCount?: number;
  } | null>(null);
  const [worktreeRefreshKey, setWorktreeRefreshKey] = useState(0);

  // Backlog plan dialog state
  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [pendingBacklogPlan, setPendingBacklogPlan] = useState<BacklogPlanResult | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);

  // Pipeline settings dialog state
  const [showPipelineSettings, setShowPipelineSettings] = useState(false);

  // Follow-up state hook
  const {
    showFollowUpDialog,
    followUpFeature,
    followUpPrompt,
    followUpImagePaths,
    followUpPreviewMap,
    followUpPromptHistory,
    setShowFollowUpDialog,
    setFollowUpFeature,
    setFollowUpPrompt,
    setFollowUpImagePaths,
    setFollowUpPreviewMap,
    handleFollowUpDialogChange,
    addToPromptHistory,
  } = useFollowUpState();

  // Selection mode hook for mass editing
  const {
    isSelectionMode,
    selectedFeatureIds,
    selectedCount,
    toggleSelectionMode,
    toggleFeatureSelection,
    selectAll,
    clearSelection,
    exitSelectionMode,
  } = useSelectionMode();
  const [showMassEditDialog, setShowMassEditDialog] = useState(false);

  // Search filter for Kanban cards
  const [searchQuery, setSearchQuery] = useState('');
  // Plan approval loading state
  const [isPlanApprovalLoading, setIsPlanApprovalLoading] = useState(false);
  // Derive spec creation state from store - check if current project is the one being created
  const isCreatingSpec = specCreatingForProject === currentProject?.path;
  const creatingSpecProjectPath = specCreatingForProject ?? undefined;

  const checkContextExists = useCallback(
    async (featureId: string): Promise<boolean> => {
      if (!currentProject) return false;

      try {
        const api = getElectronAPI();
        if (!api?.autoMode?.contextExists) {
          return false;
        }

        const result = await api.autoMode.contextExists(currentProject.path, featureId);

        return result.success && result.exists === true;
      } catch (error) {
        logger.error('Error checking context:', error);
        return false;
      }
    },
    [currentProject]
  );

  // Use board effects hook
  useBoardEffects({
    currentProject,
    specCreatingForProject,
    setSpecCreatingForProject,
    checkContextExists,
    features: hookFeatures,
    isLoading,
    featuresWithContext,
    setFeaturesWithContext,
  });

  // Load pipeline config when project changes
  useEffect(() => {
    if (!currentProject?.path) return;

    const loadPipelineConfig = async () => {
      try {
        const api = getHttpApiClient();
        const result = await api.pipeline.getConfig(currentProject.path);
        if (result.success && result.config) {
          setPipelineConfig(currentProject.path, result.config);
        }
      } catch (error) {
        logger.error('Failed to load pipeline config:', error);
      }
    };

    loadPipelineConfig();
  }, [currentProject?.path, setPipelineConfig]);

  // Auto mode hook
  const autoMode = useAutoMode();
  // Get runningTasks from the hook (scoped to current project)
  const runningAutoTasks = autoMode.runningTasks;

  // Window state hook for compact dialog mode
  const { isMaximized } = useWindowState();

  // Keyboard shortcuts hook will be initialized after actions hook

  // Prevent hydration issues
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const sensors = useSensors(
    useSensor(DialogAwarePointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Get unique categories from existing features AND persisted categories for autocomplete suggestions
  const categorySuggestions = useMemo(() => {
    const featureCategories = hookFeatures.map((f) => f.category).filter(Boolean);
    // Merge feature categories with persisted categories
    const allCategories = [...featureCategories, ...persistedCategories];
    return [...new Set(allCategories)].sort();
  }, [hookFeatures, persistedCategories]);

  // Branch suggestions for the branch autocomplete
  // Shows all local branches as suggestions, but users can type any new branch name
  // When the feature is started, a worktree will be created if needed
  const [branchSuggestions, setBranchSuggestions] = useState<string[]>([]);

  // Fetch branches when project changes or worktrees are created/modified
  useEffect(() => {
    const fetchBranches = async () => {
      if (!currentProject) {
        setBranchSuggestions([]);
        return;
      }

      try {
        const api = getElectronAPI();
        if (!api?.worktree?.listBranches) {
          setBranchSuggestions([]);
          return;
        }

        const result = await api.worktree.listBranches(currentProject.path);
        if (result.success && result.result?.branches) {
          const localBranches = result.result.branches
            .filter((b) => !b.isRemote)
            .map((b) => b.name);
          setBranchSuggestions(localBranches);
        }
      } catch (error) {
        logger.error('Error fetching branches:', error);
        setBranchSuggestions([]);
      }
    };

    fetchBranches();
  }, [currentProject, worktreeRefreshKey]);

  // Calculate unarchived card counts per branch
  const branchCardCounts = useMemo(() => {
    return hookFeatures.reduce(
      (counts, feature) => {
        if (feature.status !== 'completed') {
          const branch = feature.branchName ?? 'main';
          counts[branch] = (counts[branch] || 0) + 1;
        }
        return counts;
      },
      {} as Record<string, number>
    );
  }, [hookFeatures]);

  // Custom collision detection that prioritizes columns over cards
  const collisionDetectionStrategy = useCallback((args: any) => {
    // First, check if pointer is within a column
    const pointerCollisions = pointerWithin(args);
    const columnCollisions = pointerCollisions.filter((collision: any) =>
      COLUMNS.some((col) => col.id === collision.id)
    );

    // If we found a column collision, use that
    if (columnCollisions.length > 0) {
      return columnCollisions;
    }

    // Otherwise, use rectangle intersection for cards
    return rectIntersection(args);
  }, []);

  // Use persistence hook
  const { persistFeatureCreate, persistFeatureUpdate, persistFeatureDelete } = useBoardPersistence({
    currentProject,
  });

  // Memoize the removed worktrees handler to prevent infinite loops
  const handleRemovedWorktrees = useCallback(
    (removedWorktrees: Array<{ path: string; branch: string }>) => {
      // Reset features that were assigned to the removed worktrees (by branch)
      hookFeatures.forEach((feature) => {
        const matchesRemovedWorktree = removedWorktrees.some((removed) => {
          // Match by branch name since worktreePath is no longer stored
          return feature.branchName === removed.branch;
        });

        if (matchesRemovedWorktree) {
          // Reset the feature's branch assignment - update both local state and persist
          const updates = { branchName: null as unknown as string | undefined };
          updateFeature(feature.id, updates);
          persistFeatureUpdate(feature.id, updates);
        }
      });
    },
    [hookFeatures, updateFeature, persistFeatureUpdate]
  );

  // Get in-progress features for keyboard shortcuts (needed before actions hook)
  const inProgressFeaturesForShortcuts = useMemo(() => {
    return hookFeatures.filter((f) => {
      const isRunning = runningAutoTasks.includes(f.id);
      return isRunning || f.status === 'in_progress';
    });
  }, [hookFeatures, runningAutoTasks]);

  // Get current worktree info (path) for filtering features
  // This needs to be before useBoardActions so we can pass currentWorktreeBranch
  const currentWorktreeInfo = currentProject ? getCurrentWorktree(currentProject.path) : null;
  const currentWorktreePath = currentWorktreeInfo?.path ?? null;
  const worktreesByProject = useAppStore((s) => s.worktreesByProject);
  const worktrees = useMemo(
    () =>
      currentProject
        ? (worktreesByProject[currentProject.path] ?? EMPTY_WORKTREES)
        : EMPTY_WORKTREES,
    [currentProject, worktreesByProject]
  );

  // Get the branch for the currently selected worktree
  // Find the worktree that matches the current selection, or use main worktree
  const selectedWorktree = useMemo(() => {
    if (currentWorktreePath === null) {
      // Primary worktree selected - find the main worktree
      return worktrees.find((w) => w.isMain);
    } else {
      // Specific worktree selected - find it by path
      return worktrees.find((w) => !w.isMain && pathsEqual(w.path, currentWorktreePath));
    }
  }, [worktrees, currentWorktreePath]);

  // Get the current branch from the selected worktree (not from store which may be stale)
  const currentWorktreeBranch = selectedWorktree?.branch ?? null;

  // Get the branch for the currently selected worktree (for defaulting new features)
  // Use the branch from selectedWorktree, or fall back to main worktree's branch
  const selectedWorktreeBranch =
    currentWorktreeBranch || worktrees.find((w) => w.isMain)?.branch || 'main';

  // Extract all action handlers into a hook
  const {
    handleAddFeature,
    handleUpdateFeature,
    handleDeleteFeature,
    handleStartImplementation,
    handleVerifyFeature,
    handleResumeFeature,
    handleManualVerify,
    handleMoveBackToInProgress,
    handleOpenFollowUp,
    handleSendFollowUp,
    handleCommitFeature,
    handleMergeFeature,
    handleCompleteFeature,
    handleUnarchiveFeature,
    handleViewOutput,
    handleOutputModalNumberKeyPress,
    handleForceStopFeature,
    handleStartNextFeatures,
    handleArchiveAllVerified,
  } = useBoardActions({
    currentProject,
    features: hookFeatures,
    runningAutoTasks,
    loadFeatures,
    persistFeatureCreate,
    persistFeatureUpdate,
    persistFeatureDelete,
    saveCategory,
    setEditingFeature,
    setShowOutputModal,
    setOutputFeature,
    followUpFeature,
    followUpPrompt,
    followUpImagePaths,
    setFollowUpFeature,
    setFollowUpPrompt,
    setFollowUpImagePaths,
    setFollowUpPreviewMap,
    setShowFollowUpDialog,
    inProgressFeaturesForShortcuts,
    outputFeature,
    projectPath: currentProject?.path || null,
    onWorktreeCreated: () => setWorktreeRefreshKey((k) => k + 1),
    onWorktreeAutoSelect: (newWorktree) => {
      if (!currentProject) return;
      // Check if worktree already exists in the store (by branch name)
      const currentWorktrees = getWorktrees(currentProject.path);
      const existingWorktree = currentWorktrees.find((w) => w.branch === newWorktree.branch);

      // Only add if it doesn't already exist (to avoid duplicates)
      if (!existingWorktree) {
        const newWorktreeInfo = {
          path: newWorktree.path,
          branch: newWorktree.branch,
          isMain: false,
          isCurrent: false,
          hasWorktree: true,
        };
        setWorktrees(currentProject.path, [...currentWorktrees, newWorktreeInfo]);
      }
      // Select the worktree (whether it existed or was just added)
      setCurrentWorktree(currentProject.path, newWorktree.path, newWorktree.branch);
    },
    currentWorktreeBranch,
  });

  // Handler for bulk updating multiple features
  const handleBulkUpdate = useCallback(
    async (updates: Partial<Feature>) => {
      if (!currentProject || selectedFeatureIds.size === 0) return;

      try {
        const api = getHttpApiClient();
        const featureIds = Array.from(selectedFeatureIds);
        const result = await api.features.bulkUpdate(currentProject.path, featureIds, updates);

        if (result.success) {
          // Update local state
          featureIds.forEach((featureId) => {
            updateFeature(featureId, updates);
          });
          toast.success(`Updated ${result.updatedCount} features`);
          exitSelectionMode();
        } else {
          toast.error('Failed to update some features', {
            description: `${result.failedCount} features failed to update`,
          });
        }
      } catch (error) {
        logger.error('Bulk update failed:', error);
        toast.error('Failed to update features');
      }
    },
    [currentProject, selectedFeatureIds, updateFeature, exitSelectionMode]
  );

  // Handler for bulk deleting multiple features
  const handleBulkDelete = useCallback(async () => {
    if (!currentProject || selectedFeatureIds.size === 0) return;

    try {
      const api = getHttpApiClient();
      const featureIds = Array.from(selectedFeatureIds);
      const result = await api.features.bulkDelete(currentProject.path, featureIds);

      const successfullyDeletedIds =
        result.results?.filter((r) => r.success).map((r) => r.featureId) ?? [];

      if (successfullyDeletedIds.length > 0) {
        // Delete from local state without calling the API again
        successfullyDeletedIds.forEach((featureId) => {
          useAppStore.getState().removeFeature(featureId);
        });
        toast.success(`Deleted ${successfullyDeletedIds.length} features`);
      }

      if (result.failedCount && result.failedCount > 0) {
        toast.error('Failed to delete some features', {
          description: `${result.failedCount} features failed to delete`,
        });
      }

      // Exit selection mode and reload if the operation was at least partially processed.
      if (result.results) {
        exitSelectionMode();
        loadFeatures();
      } else if (!result.success) {
        toast.error('Failed to delete features', { description: result.error });
      }
    } catch (error) {
      logger.error('Bulk delete failed:', error);
      toast.error('Failed to delete features');
    }
  }, [currentProject, selectedFeatureIds, exitSelectionMode, loadFeatures]);

  // Get selected features for mass edit dialog
  const selectedFeatures = useMemo(() => {
    return hookFeatures.filter((f) => selectedFeatureIds.has(f.id));
  }, [hookFeatures, selectedFeatureIds]);

  // Get backlog feature IDs in current branch for "Select All"
  const allSelectableFeatureIds = useMemo(() => {
    return hookFeatures
      .filter((f) => {
        // Only backlog features
        if (f.status !== 'backlog') return false;

        // Filter by current worktree branch
        const featureBranch = f.branchName;
        if (!featureBranch) {
          // No branch assigned - only selectable on primary worktree
          return currentWorktreePath === null;
        }
        if (currentWorktreeBranch === null) {
          // Viewing main but branch hasn't been initialized
          return currentProject?.path
            ? isPrimaryWorktreeBranch(currentProject.path, featureBranch)
            : false;
        }
        // Match by branch name
        return featureBranch === currentWorktreeBranch;
      })
      .map((f) => f.id);
  }, [
    hookFeatures,
    currentWorktreePath,
    currentWorktreeBranch,
    currentProject?.path,
    isPrimaryWorktreeBranch,
  ]);

  // Handler for addressing PR comments - creates a feature and starts it automatically
  const handleAddressPRComments = useCallback(
    async (worktree: WorktreeInfo, prInfo: PRInfo) => {
      // Use a simple prompt that instructs the agent to read and address PR feedback
      // The agent will fetch the PR comments directly, which is more reliable and up-to-date
      const prNumber = prInfo.number;
      const description = `Read the review requests on PR #${prNumber} and address any feedback the best you can.`;

      // Create the feature
      const featureData = {
        title: `Address PR #${prNumber} Review Comments`,
        category: 'PR Review',
        description,
        images: [],
        imagePaths: [],
        skipTests: defaultSkipTests,
        model: 'opus' as const,
        thinkingLevel: 'none' as const,
        branchName: worktree.branch,
        priority: 1, // High priority for PR feedback
        planningMode: 'skip' as const,
        requirePlanApproval: false,
      };

      // Capture existing feature IDs before adding
      const featuresBeforeIds = new Set(useAppStore.getState().features.map((f) => f.id));
      await handleAddFeature(featureData);

      // Find the newly created feature by looking for an ID that wasn't in the original set
      const latestFeatures = useAppStore.getState().features;
      const newFeature = latestFeatures.find((f) => !featuresBeforeIds.has(f.id));

      if (newFeature) {
        await handleStartImplementation(newFeature);
      } else {
        logger.error('Could not find newly created feature to start it automatically.');
        toast.error('Failed to auto-start feature', {
          description: 'The feature was created but could not be started automatically.',
        });
      }
    },
    [handleAddFeature, handleStartImplementation, defaultSkipTests]
  );

  // Handler for resolving conflicts - creates a feature to pull from origin/main and resolve conflicts
  const handleResolveConflicts = useCallback(
    async (worktree: WorktreeInfo) => {
      const description = `Pull latest from origin/main and resolve conflicts. Merge origin/main into the current branch (${worktree.branch}), resolving any merge conflicts that arise. After resolving conflicts, ensure the code compiles and tests pass.`;

      // Create the feature
      const featureData = {
        title: `Resolve Merge Conflicts`,
        category: 'Maintenance',
        description,
        images: [],
        imagePaths: [],
        skipTests: defaultSkipTests,
        model: 'opus' as const,
        thinkingLevel: 'none' as const,
        branchName: worktree.branch,
        priority: 1, // High priority for conflict resolution
        planningMode: 'skip' as const,
        requirePlanApproval: false,
      };

      // Capture existing feature IDs before adding
      const featuresBeforeIds = new Set(useAppStore.getState().features.map((f) => f.id));
      await handleAddFeature(featureData);

      // Find the newly created feature by looking for an ID that wasn't in the original set
      const latestFeatures = useAppStore.getState().features;
      const newFeature = latestFeatures.find((f) => !featuresBeforeIds.has(f.id));

      if (newFeature) {
        await handleStartImplementation(newFeature);
      } else {
        logger.error('Could not find newly created feature to start it automatically.');
        toast.error('Failed to auto-start feature', {
          description: 'The feature was created but could not be started automatically.',
        });
      }
    },
    [handleAddFeature, handleStartImplementation, defaultSkipTests]
  );

  // Handler for "Make" button - creates a feature and immediately starts it
  const handleAddAndStartFeature = useCallback(
    async (featureData: Parameters<typeof handleAddFeature>[0]) => {
      // Capture existing feature IDs before adding
      const featuresBeforeIds = new Set(useAppStore.getState().features.map((f) => f.id));
      await handleAddFeature(featureData);

      // Find the newly created feature by looking for an ID that wasn't in the original set
      const latestFeatures = useAppStore.getState().features;
      const newFeature = latestFeatures.find((f) => !featuresBeforeIds.has(f.id));

      if (newFeature) {
        await handleStartImplementation(newFeature);
      } else {
        logger.error('Could not find newly created feature to start it automatically.');
        toast.error('Failed to auto-start feature', {
          description: 'The feature was created but could not be started automatically.',
        });
      }
    },
    [handleAddFeature, handleStartImplementation]
  );

  // Client-side auto mode: periodically check for backlog items and move them to in-progress
  // Use a ref to track the latest auto mode state so async operations always check the current value
  const autoModeRunningRef = useRef(autoMode.isRunning);
  useEffect(() => {
    autoModeRunningRef.current = autoMode.isRunning;
  }, [autoMode.isRunning]);

  // Use a ref to track the latest features to avoid effect re-runs when features change
  const hookFeaturesRef = useRef(hookFeatures);
  useEffect(() => {
    hookFeaturesRef.current = hookFeatures;
  }, [hookFeatures]);

  // Use a ref to track running tasks to avoid effect re-runs that clear pendingFeaturesRef
  const runningAutoTasksRef = useRef(runningAutoTasks);
  useEffect(() => {
    runningAutoTasksRef.current = runningAutoTasks;
  }, [runningAutoTasks]);

  // Keep latest start handler without retriggering the auto mode effect
  const handleStartImplementationRef = useRef(handleStartImplementation);
  useEffect(() => {
    handleStartImplementationRef.current = handleStartImplementation;
  }, [handleStartImplementation]);

  // Track features that are pending (started but not yet confirmed running)
  const pendingFeaturesRef = useRef<Set<string>>(new Set());

  // Listen to auto mode events to remove features from pending when they start running
  useEffect(() => {
    const api = getElectronAPI();
    if (!api?.autoMode) return;

    const unsubscribe = api.autoMode.onEvent((event: AutoModeEvent) => {
      if (!currentProject) return;

      // Only process events for the current project
      const eventProjectPath = 'projectPath' in event ? event.projectPath : undefined;
      if (eventProjectPath && eventProjectPath !== currentProject.path) {
        return;
      }

      switch (event.type) {
        case 'auto_mode_feature_start':
          // Feature is now confirmed running - remove from pending
          if (event.featureId) {
            pendingFeaturesRef.current.delete(event.featureId);
          }
          break;

        case 'auto_mode_feature_complete':
        case 'auto_mode_error':
          // Feature completed or errored - remove from pending if still there
          if (event.featureId) {
            pendingFeaturesRef.current.delete(event.featureId);
          }
          break;
      }
    });

    return unsubscribe;
  }, [currentProject]);

  // Listen for backlog plan events (for background generation)
  useEffect(() => {
    const api = getElectronAPI();
    if (!api?.backlogPlan) return;

    const unsubscribe = api.backlogPlan.onEvent(
      (event: { type: string; result?: BacklogPlanResult; error?: string }) => {
        if (event.type === 'backlog_plan_complete') {
          setIsGeneratingPlan(false);
          if (event.result && event.result.changes?.length > 0) {
            setPendingBacklogPlan(event.result);
            toast.success('Plan ready! Click to review.', {
              duration: 10000,
              action: {
                label: 'Review',
                onClick: () => setShowPlanDialog(true),
              },
            });
          } else {
            toast.info('No changes generated. Try again with a different prompt.');
          }
        } else if (event.type === 'backlog_plan_error') {
          setIsGeneratingPlan(false);
          toast.error(`Plan generation failed: ${event.error}`);
        }
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    logger.info(
      '[AutoMode] Effect triggered - isRunning:',
      autoMode.isRunning,
      'hasProject:',
      !!currentProject
    );
    if (!autoMode.isRunning || !currentProject) {
      return;
    }

    logger.info('[AutoMode] Starting auto mode polling loop for project:', currentProject.path);
    let isChecking = false;
    let isActive = true; // Track if this effect is still active

    const checkAndStartFeatures = async () => {
      // Check if auto mode is still running and effect is still active
      // Use ref to get the latest value, not the closure value
      if (!isActive || !autoModeRunningRef.current || !currentProject) {
        return;
      }

      // Prevent concurrent executions
      if (isChecking) {
        return;
      }

      isChecking = true;
      try {
        // Double-check auto mode is still running before proceeding
        if (!isActive || !autoModeRunningRef.current || !currentProject) {
          logger.debug(
            '[AutoMode] Skipping check - isActive:',
            isActive,
            'autoModeRunning:',
            autoModeRunningRef.current,
            'hasProject:',
            !!currentProject
          );
          return;
        }

        // Count currently running tasks + pending features
        // Use ref to get the latest running tasks without causing effect re-runs
        const currentRunning = runningAutoTasksRef.current.length + pendingFeaturesRef.current.size;
        const availableSlots = maxConcurrency - currentRunning;
        logger.debug(
          '[AutoMode] Checking features - running:',
          currentRunning,
          'available slots:',
          availableSlots
        );

        // No available slots, skip check
        if (availableSlots <= 0) {
          return;
        }

        // Filter backlog features by the currently selected worktree branch
        // This logic mirrors use-board-column-features.ts for consistency.
        // HOWEVER: auto mode should still run even if the user is viewing a non-primary worktree,
        // so we fall back to "all backlog features" when none are visible in the current view.
        // Use ref to get the latest features without causing effect re-runs
        const currentFeatures = hookFeaturesRef.current;
        const backlogFeaturesInView = currentFeatures.filter((f) => {
          if (f.status !== 'backlog') return false;

          const featureBranch = f.branchName;

          // Features without branchName are considered unassigned (show only on primary worktree)
          if (!featureBranch) {
            // No branch assigned - show only when viewing primary worktree
            const isViewingPrimary = currentWorktreePath === null;
            return isViewingPrimary;
          }

          if (currentWorktreeBranch === null) {
            // We're viewing main but branch hasn't been initialized yet
            // Show features assigned to primary worktree's branch
            return currentProject.path
              ? isPrimaryWorktreeBranch(currentProject.path, featureBranch)
              : false;
          }

          // Match by branch name
          return featureBranch === currentWorktreeBranch;
        });

        const backlogFeatures =
          backlogFeaturesInView.length > 0
            ? backlogFeaturesInView
            : currentFeatures.filter((f) => f.status === 'backlog');

        logger.debug(
          '[AutoMode] Features - total:',
          currentFeatures.length,
          'backlog in view:',
          backlogFeaturesInView.length,
          'backlog total:',
          backlogFeatures.length
        );

        if (backlogFeatures.length === 0) {
          logger.debug(
            '[AutoMode] No backlog features found, statuses:',
            currentFeatures.map((f) => f.status).join(', ')
          );
          return;
        }

        // Sort by priority (lower number = higher priority, priority 1 is highest)
        const sortedBacklog = [...backlogFeatures].sort(
          (a, b) => (a.priority || 999) - (b.priority || 999)
        );

        // Filter out features with blocking dependencies if dependency blocking is enabled
        // NOTE: skipVerificationInAutoMode means "ignore unmet dependency verification" so we
        // should NOT exclude blocked features in that mode.
        const eligibleFeatures =
          enableDependencyBlocking && !skipVerificationInAutoMode
            ? sortedBacklog.filter((f) => {
                const blockingDeps = getBlockingDependencies(f, currentFeatures);
                if (blockingDeps.length > 0) {
                  logger.debug('[AutoMode] Feature', f.id, 'blocked by deps:', blockingDeps);
                }
                return blockingDeps.length === 0;
              })
            : sortedBacklog;

        logger.debug(
          '[AutoMode] Eligible features after dep check:',
          eligibleFeatures.length,
          'dependency blocking enabled:',
          enableDependencyBlocking
        );

        // Start features up to available slots
        const featuresToStart = eligibleFeatures.slice(0, availableSlots);
        const startImplementation = handleStartImplementationRef.current;
        if (!startImplementation) {
          return;
        }

        logger.info(
          '[AutoMode] Starting',
          featuresToStart.length,
          'features:',
          featuresToStart.map((f) => f.id).join(', ')
        );

        for (const feature of featuresToStart) {
          // Check again before starting each feature
          if (!isActive || !autoModeRunningRef.current || !currentProject) {
            return;
          }

          // Simplified: No worktree creation on client - server derives workDir from feature.branchName
          // If feature has no branchName, assign it to the primary branch so it can run consistently
          // even when the user is viewing a non-primary worktree.
          if (!feature.branchName) {
            const primaryBranch =
              (currentProject.path ? getPrimaryWorktreeBranch(currentProject.path) : null) ||
              'main';
            await persistFeatureUpdate(feature.id, {
              branchName: primaryBranch,
            });
          }

          // Final check before starting implementation
          if (!isActive || !autoModeRunningRef.current || !currentProject) {
            return;
          }

          // Start the implementation - server will derive workDir from feature.branchName
          const started = await startImplementation(feature);

          // If successfully started, track it as pending until we receive the start event
          if (started) {
            pendingFeaturesRef.current.add(feature.id);
          }
        }
      } finally {
        isChecking = false;
      }
    };

    // Check immediately, then every 3 seconds
    checkAndStartFeatures();
    const interval = setInterval(checkAndStartFeatures, 3000);

    return () => {
      // Mark as inactive to prevent any pending async operations from continuing
      isActive = false;
      clearInterval(interval);
      // Clear pending features when effect unmounts or dependencies change
      pendingFeaturesRef.current.clear();
    };
  }, [
    autoMode.isRunning,
    currentProject,
    // runningAutoTasks is accessed via runningAutoTasksRef to prevent effect re-runs
    // that would clear pendingFeaturesRef and cause concurrency issues
    maxConcurrency,
    // hookFeatures is accessed via hookFeaturesRef to prevent effect re-runs
    currentWorktreeBranch,
    currentWorktreePath,
    getPrimaryWorktreeBranch,
    isPrimaryWorktreeBranch,
    enableDependencyBlocking,
    skipVerificationInAutoMode,
    persistFeatureUpdate,
  ]);

  // Use keyboard shortcuts hook (after actions hook)
  useBoardKeyboardShortcuts({
    features: hookFeatures,
    runningAutoTasks,
    onAddFeature: () => setShowAddDialog(true),
    onStartNextFeatures: handleStartNextFeatures,
    onViewOutput: handleViewOutput,
  });

  // Use drag and drop hook
  const { activeFeature, handleDragStart, handleDragEnd } = useBoardDragDrop({
    features: hookFeatures,
    currentProject,
    runningAutoTasks,
    persistFeatureUpdate,
    handleStartImplementation,
  });

  // Use column features hook
  const { getColumnFeatures, completedFeatures } = useBoardColumnFeatures({
    features: hookFeatures,
    runningAutoTasks,
    searchQuery,
    currentWorktreePath,
    currentWorktreeBranch,
    projectPath: currentProject?.path || null,
  });

  // Use background hook
  const { backgroundSettings, backgroundImageStyle } = useBoardBackground({
    currentProject,
  });

  // Find feature for pending plan approval
  const pendingApprovalFeature = useMemo(() => {
    if (!pendingPlanApproval) return null;
    return hookFeatures.find((f) => f.id === pendingPlanApproval.featureId) || null;
  }, [pendingPlanApproval, hookFeatures]);

  // Handle plan approval
  const handlePlanApprove = useCallback(
    async (editedPlan?: string) => {
      if (!pendingPlanApproval || !currentProject) return;

      const featureId = pendingPlanApproval.featureId;
      setIsPlanApprovalLoading(true);
      try {
        const api = getElectronAPI();
        if (!api?.autoMode?.approvePlan) {
          throw new Error('Plan approval API not available');
        }

        const result = await api.autoMode.approvePlan(
          pendingPlanApproval.projectPath,
          pendingPlanApproval.featureId,
          true,
          editedPlan
        );

        if (result.success) {
          // Immediately update local feature state to hide "Approve Plan" button
          // Get current feature to preserve version
          const currentFeature = hookFeatures.find((f) => f.id === featureId);
          updateFeature(featureId, {
            planSpec: {
              status: 'approved',
              content: editedPlan || pendingPlanApproval.planContent,
              version: currentFeature?.planSpec?.version || 1,
              approvedAt: new Date().toISOString(),
              reviewedByUser: true,
            },
          });
          // Reload features from server to ensure sync
          loadFeatures();
        } else {
          logger.error('Failed to approve plan:', result.error);
        }
      } catch (error) {
        logger.error('Error approving plan:', error);
      } finally {
        setIsPlanApprovalLoading(false);
        setPendingPlanApproval(null);
      }
    },
    [
      pendingPlanApproval,
      currentProject,
      setPendingPlanApproval,
      updateFeature,
      loadFeatures,
      hookFeatures,
    ]
  );

  // Handle plan rejection
  const handlePlanReject = useCallback(
    async (feedback?: string) => {
      if (!pendingPlanApproval || !currentProject) return;

      const featureId = pendingPlanApproval.featureId;
      setIsPlanApprovalLoading(true);
      try {
        const api = getElectronAPI();
        if (!api?.autoMode?.approvePlan) {
          throw new Error('Plan approval API not available');
        }

        const result = await api.autoMode.approvePlan(
          pendingPlanApproval.projectPath,
          pendingPlanApproval.featureId,
          false,
          undefined,
          feedback
        );

        if (result.success) {
          // Immediately update local feature state
          // Get current feature to preserve version
          const currentFeature = hookFeatures.find((f) => f.id === featureId);
          updateFeature(featureId, {
            status: 'backlog',
            planSpec: {
              status: 'rejected',
              content: pendingPlanApproval.planContent,
              version: currentFeature?.planSpec?.version || 1,
              reviewedByUser: true,
            },
          });
          // Reload features from server to ensure sync
          loadFeatures();
        } else {
          logger.error('Failed to reject plan:', result.error);
        }
      } catch (error) {
        logger.error('Error rejecting plan:', error);
      } finally {
        setIsPlanApprovalLoading(false);
        setPendingPlanApproval(null);
      }
    },
    [
      pendingPlanApproval,
      currentProject,
      setPendingPlanApproval,
      updateFeature,
      loadFeatures,
      hookFeatures,
    ]
  );

  // Handle opening approval dialog from feature card button
  const handleOpenApprovalDialog = useCallback(
    (feature: Feature) => {
      if (!feature.planSpec?.content || !currentProject) return;

      // Determine the planning mode for approval (skip should never have a plan requiring approval)
      const mode = feature.planningMode;
      const approvalMode: 'lite' | 'spec' | 'full' =
        mode === 'lite' || mode === 'spec' || mode === 'full' ? mode : 'spec';

      // Re-open the approval dialog with the feature's plan data
      setPendingPlanApproval({
        featureId: feature.id,
        projectPath: currentProject.path,
        planContent: feature.planSpec.content,
        planningMode: approvalMode,
      });
    },
    [currentProject, setPendingPlanApproval]
  );

  if (!currentProject) {
    return (
      <div className="flex-1 flex items-center justify-center" data-testid="board-view-no-project">
        <p className="text-muted-foreground">No project selected</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center" data-testid="board-view-loading">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden content-bg relative"
      data-testid="board-view"
    >
      {/* Header */}
      <BoardHeader
        projectPath={currentProject.path}
        maxConcurrency={maxConcurrency}
        runningAgentsCount={runningAutoTasks.length}
        onConcurrencyChange={setMaxConcurrency}
        isAutoModeRunning={autoMode.isRunning}
        onAutoModeToggle={(enabled) => {
          if (enabled) {
            autoMode.start();
          } else {
            autoMode.stop();
          }
        }}
        onOpenPlanDialog={() => setShowPlanDialog(true)}
        isMounted={isMounted}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isCreatingSpec={isCreatingSpec}
        creatingSpecProjectPath={creatingSpecProjectPath}
        onShowBoardBackground={() => setShowBoardBackgroundModal(true)}
        onShowCompletedModal={() => setShowCompletedModal(true)}
        completedCount={completedFeatures.length}
      />

      {/* Worktree Panel - conditionally rendered based on visibility setting */}
      {(worktreePanelVisibleByProject[currentProject.path] ?? true) && (
        <WorktreePanel
          refreshTrigger={worktreeRefreshKey}
          projectPath={currentProject.path}
          onCreateWorktree={() => setShowCreateWorktreeDialog(true)}
          onDeleteWorktree={(worktree) => {
            setSelectedWorktreeForAction(worktree);
            setShowDeleteWorktreeDialog(true);
          }}
          onCommit={(worktree) => {
            setSelectedWorktreeForAction(worktree);
            setShowCommitWorktreeDialog(true);
          }}
          onCreatePR={(worktree) => {
            setSelectedWorktreeForAction(worktree);
            setShowCreatePRDialog(true);
          }}
          onCreateBranch={(worktree) => {
            setSelectedWorktreeForAction(worktree);
            setShowCreateBranchDialog(true);
          }}
          onAddressPRComments={handleAddressPRComments}
          onResolveConflicts={handleResolveConflicts}
          onRemovedWorktrees={handleRemovedWorktrees}
          runningFeatureIds={runningAutoTasks}
          branchCardCounts={branchCardCounts}
          features={hookFeatures.map((f) => ({
            id: f.id,
            branchName: f.branchName,
          }))}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* View Content - Kanban Board */}
        <KanbanBoard
          sensors={sensors}
          collisionDetectionStrategy={collisionDetectionStrategy}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          activeFeature={activeFeature}
          getColumnFeatures={getColumnFeatures}
          backgroundImageStyle={backgroundImageStyle}
          backgroundSettings={backgroundSettings}
          onEdit={(feature) => setEditingFeature(feature)}
          onDelete={(featureId) => handleDeleteFeature(featureId)}
          onViewOutput={handleViewOutput}
          onVerify={handleVerifyFeature}
          onResume={handleResumeFeature}
          onForceStop={handleForceStopFeature}
          onManualVerify={handleManualVerify}
          onMoveBackToInProgress={handleMoveBackToInProgress}
          onFollowUp={handleOpenFollowUp}
          onComplete={handleCompleteFeature}
          onImplement={handleStartImplementation}
          onViewPlan={(feature) => setViewPlanFeature(feature)}
          onApprovePlan={handleOpenApprovalDialog}
          onSpawnTask={(feature) => {
            setSpawnParentFeature(feature);
            setShowAddDialog(true);
          }}
          featuresWithContext={featuresWithContext}
          runningAutoTasks={runningAutoTasks}
          onArchiveAllVerified={() => setShowArchiveAllVerifiedDialog(true)}
          onAddFeature={() => setShowAddDialog(true)}
          pipelineConfig={
            currentProject?.path ? pipelineConfigByProject[currentProject.path] || null : null
          }
          onOpenPipelineSettings={() => setShowPipelineSettings(true)}
          isSelectionMode={isSelectionMode}
          selectedFeatureIds={selectedFeatureIds}
          onToggleFeatureSelection={toggleFeatureSelection}
          onToggleSelectionMode={toggleSelectionMode}
        />
      </div>

      {/* Selection Action Bar */}
      {isSelectionMode && (
        <SelectionActionBar
          selectedCount={selectedCount}
          totalCount={allSelectableFeatureIds.length}
          onEdit={() => setShowMassEditDialog(true)}
          onDelete={handleBulkDelete}
          onClear={clearSelection}
          onSelectAll={() => selectAll(allSelectableFeatureIds)}
        />
      )}

      {/* Mass Edit Dialog */}
      <MassEditDialog
        open={showMassEditDialog}
        onClose={() => setShowMassEditDialog(false)}
        selectedFeatures={selectedFeatures}
        onApply={handleBulkUpdate}
      />

      {/* Board Background Modal */}
      <BoardBackgroundModal
        open={showBoardBackgroundModal}
        onOpenChange={setShowBoardBackgroundModal}
      />

      {/* Completed Features Modal */}
      <CompletedFeaturesModal
        open={showCompletedModal}
        onOpenChange={setShowCompletedModal}
        completedFeatures={completedFeatures}
        onUnarchive={handleUnarchiveFeature}
        onDelete={(feature) => setDeleteCompletedFeature(feature)}
      />

      {/* Delete Completed Feature Confirmation Dialog */}
      <DeleteCompletedFeatureDialog
        feature={deleteCompletedFeature}
        onClose={() => setDeleteCompletedFeature(null)}
        onConfirm={async () => {
          if (deleteCompletedFeature) {
            await handleDeleteFeature(deleteCompletedFeature.id);
            setDeleteCompletedFeature(null);
          }
        }}
      />

      {/* Add Feature Dialog */}
      <AddFeatureDialog
        open={showAddDialog}
        onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) {
            setSpawnParentFeature(null);
          }
        }}
        onAdd={handleAddFeature}
        onAddAndStart={handleAddAndStartFeature}
        categorySuggestions={categorySuggestions}
        branchSuggestions={branchSuggestions}
        branchCardCounts={branchCardCounts}
        defaultSkipTests={defaultSkipTests}
        defaultBranch={selectedWorktreeBranch}
        currentBranch={currentWorktreeBranch || undefined}
        isMaximized={isMaximized}
        parentFeature={spawnParentFeature}
        allFeatures={hookFeatures}
      />

      {/* Edit Feature Dialog */}
      <EditFeatureDialog
        feature={editingFeature}
        onClose={() => setEditingFeature(null)}
        onUpdate={handleUpdateFeature}
        categorySuggestions={categorySuggestions}
        branchSuggestions={branchSuggestions}
        branchCardCounts={branchCardCounts}
        currentBranch={currentWorktreeBranch || undefined}
        isMaximized={isMaximized}
        allFeatures={hookFeatures}
      />

      {/* Agent Output Modal */}
      <AgentOutputModal
        open={showOutputModal}
        onClose={() => setShowOutputModal(false)}
        featureDescription={outputFeature?.description || ''}
        featureId={outputFeature?.id || ''}
        featureStatus={outputFeature?.status}
        onNumberKeyPress={handleOutputModalNumberKeyPress}
      />

      {/* Archive All Verified Dialog */}
      <ArchiveAllVerifiedDialog
        open={showArchiveAllVerifiedDialog}
        onOpenChange={setShowArchiveAllVerifiedDialog}
        verifiedCount={getColumnFeatures('verified').length}
        onConfirm={async () => {
          await handleArchiveAllVerified();
          setShowArchiveAllVerifiedDialog(false);
        }}
      />

      {/* Pipeline Settings Dialog */}
      <PipelineSettingsDialog
        open={showPipelineSettings}
        onClose={() => setShowPipelineSettings(false)}
        projectPath={currentProject.path}
        pipelineConfig={pipelineConfigByProject[currentProject.path] || null}
        onSave={async (config) => {
          const api = getHttpApiClient();
          const result = await api.pipeline.saveConfig(currentProject.path, config);
          if (!result.success) {
            throw new Error(result.error || 'Failed to save pipeline config');
          }
          setPipelineConfig(currentProject.path, config);
        }}
      />

      {/* Follow-Up Prompt Dialog */}
      <FollowUpDialog
        open={showFollowUpDialog}
        onOpenChange={handleFollowUpDialogChange}
        feature={followUpFeature}
        prompt={followUpPrompt}
        imagePaths={followUpImagePaths}
        previewMap={followUpPreviewMap}
        onPromptChange={setFollowUpPrompt}
        onImagePathsChange={setFollowUpImagePaths}
        onPreviewMapChange={setFollowUpPreviewMap}
        onSend={handleSendFollowUp}
        isMaximized={isMaximized}
        promptHistory={followUpPromptHistory}
        onHistoryAdd={addToPromptHistory}
      />

      {/* Backlog Plan Dialog */}
      <BacklogPlanDialog
        open={showPlanDialog}
        onClose={() => setShowPlanDialog(false)}
        projectPath={currentProject.path}
        onPlanApplied={loadFeatures}
        pendingPlanResult={pendingBacklogPlan}
        setPendingPlanResult={setPendingBacklogPlan}
        isGeneratingPlan={isGeneratingPlan}
        setIsGeneratingPlan={setIsGeneratingPlan}
      />

      {/* Plan Approval Dialog */}
      <PlanApprovalDialog
        open={pendingPlanApproval !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingPlanApproval(null);
          }
        }}
        feature={pendingApprovalFeature}
        planContent={pendingPlanApproval?.planContent || ''}
        onApprove={handlePlanApprove}
        onReject={handlePlanReject}
        isLoading={isPlanApprovalLoading}
      />

      {/* View Plan Dialog (read-only) */}
      {viewPlanFeature && viewPlanFeature.planSpec?.content && (
        <PlanApprovalDialog
          open={true}
          onOpenChange={(open) => !open && setViewPlanFeature(null)}
          feature={viewPlanFeature}
          planContent={viewPlanFeature.planSpec.content}
          onApprove={() => setViewPlanFeature(null)}
          onReject={() => setViewPlanFeature(null)}
          viewOnly={true}
        />
      )}

      {/* Create Worktree Dialog */}
      <CreateWorktreeDialog
        open={showCreateWorktreeDialog}
        onOpenChange={setShowCreateWorktreeDialog}
        projectPath={currentProject.path}
        onCreated={(newWorktree) => {
          // Add the new worktree to the store immediately to avoid race condition
          // when deriving currentWorktreeBranch for filtering
          const currentWorktrees = getWorktrees(currentProject.path);
          const newWorktreeInfo = {
            path: newWorktree.path,
            branch: newWorktree.branch,
            isMain: false,
            isCurrent: false,
            hasWorktree: true,
          };
          setWorktrees(currentProject.path, [...currentWorktrees, newWorktreeInfo]);

          // Now set the current worktree with both path and branch
          setCurrentWorktree(currentProject.path, newWorktree.path, newWorktree.branch);

          // Trigger refresh to get full worktree details (hasChanges, etc.)
          setWorktreeRefreshKey((k) => k + 1);
        }}
      />

      {/* Delete Worktree Dialog */}
      <DeleteWorktreeDialog
        open={showDeleteWorktreeDialog}
        onOpenChange={setShowDeleteWorktreeDialog}
        projectPath={currentProject.path}
        worktree={selectedWorktreeForAction}
        affectedFeatureCount={
          selectedWorktreeForAction
            ? hookFeatures.filter((f) => f.branchName === selectedWorktreeForAction.branch).length
            : 0
        }
        onDeleted={(deletedWorktree, _deletedBranch) => {
          // Reset features that were assigned to the deleted worktree (by branch)
          hookFeatures.forEach((feature) => {
            // Match by branch name since worktreePath is no longer stored
            if (feature.branchName === deletedWorktree.branch) {
              // Reset the feature's branch assignment - update both local state and persist
              const updates = {
                branchName: null as unknown as string | undefined,
              };
              updateFeature(feature.id, updates);
              persistFeatureUpdate(feature.id, updates);
            }
          });

          setWorktreeRefreshKey((k) => k + 1);
          setSelectedWorktreeForAction(null);
        }}
      />

      {/* Commit Worktree Dialog */}
      <CommitWorktreeDialog
        open={showCommitWorktreeDialog}
        onOpenChange={setShowCommitWorktreeDialog}
        worktree={selectedWorktreeForAction}
        onCommitted={() => {
          setWorktreeRefreshKey((k) => k + 1);
          setSelectedWorktreeForAction(null);
        }}
      />

      {/* Create PR Dialog */}
      <CreatePRDialog
        open={showCreatePRDialog}
        onOpenChange={setShowCreatePRDialog}
        worktree={selectedWorktreeForAction}
        projectPath={currentProject?.path || null}
        onCreated={(prUrl) => {
          // If a PR was created and we have the worktree branch, update all features on that branch with the PR URL
          if (prUrl && selectedWorktreeForAction?.branch) {
            const branchName = selectedWorktreeForAction.branch;
            const featuresToUpdate = hookFeatures.filter((f) => f.branchName === branchName);

            // Update local state synchronously
            featuresToUpdate.forEach((feature) => {
              updateFeature(feature.id, { prUrl });
            });

            // Persist changes asynchronously and in parallel
            Promise.all(
              featuresToUpdate.map((feature) => persistFeatureUpdate(feature.id, { prUrl }))
            ).catch((err) => logger.error('Error in handleMove:', err));
          }
          setWorktreeRefreshKey((k) => k + 1);
          setSelectedWorktreeForAction(null);
        }}
      />

      {/* Create Branch Dialog */}
      <CreateBranchDialog
        open={showCreateBranchDialog}
        onOpenChange={setShowCreateBranchDialog}
        worktree={selectedWorktreeForAction}
        onCreated={() => {
          setWorktreeRefreshKey((k) => k + 1);
          setSelectedWorktreeForAction(null);
        }}
      />
    </div>
  );
}
