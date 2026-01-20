// @ts-nocheck
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createLogger } from '@automaker/utils/logger';
import {
  DndContext,
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
import { Spinner } from '@/components/ui/spinner';
import { useShallow } from 'zustand/react/shallow';
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
  DependencyLinkDialog,
  EditFeatureDialog,
  FollowUpDialog,
  PlanApprovalDialog,
  PullResolveConflictsDialog,
} from './board-view/dialogs';
import type { DependencyLinkType } from './board-view/dialogs';
import { PipelineSettingsDialog } from './board-view/dialogs/pipeline-settings-dialog';
import { CreateWorktreeDialog } from './board-view/dialogs/create-worktree-dialog';
import { DeleteWorktreeDialog } from './board-view/dialogs/delete-worktree-dialog';
import { CommitWorktreeDialog } from './board-view/dialogs/commit-worktree-dialog';
import { CreatePRDialog } from './board-view/dialogs/create-pr-dialog';
import { CreateBranchDialog } from './board-view/dialogs/create-branch-dialog';
import { WorktreePanel } from './board-view/worktree-panel';
import type { PRInfo, WorktreeInfo, MergeConflictInfo } from './board-view/worktree-panel/types';
import { COLUMNS, getColumnsWithPipeline } from './board-view/constants';
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
  useListViewState,
} from './board-view/hooks';
import { SelectionActionBar, ListView } from './board-view/components';
import { MassEditDialog } from './board-view/dialogs';
import { InitScriptIndicator } from './board-view/init-script-indicator';
import { useInitScriptEvents } from '@/hooks/use-init-script-events';
import { usePipelineConfig } from '@/hooks/queries';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { useAutoModeQueryInvalidation } from '@/hooks/use-query-invalidation';

// Stable empty array to avoid infinite loop in selector
const EMPTY_WORKTREES: ReturnType<ReturnType<typeof useAppStore.getState>['getWorktrees']> = [];

const logger = createLogger('Board');

export function BoardView() {
  const {
    currentProject,
    maxConcurrency: legacyMaxConcurrency,
    setMaxConcurrency: legacySetMaxConcurrency,
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
    planUseSelectedWorktreeBranch,
    addFeatureUseSelectedWorktreeBranch,
    isPrimaryWorktreeBranch,
    getPrimaryWorktreeBranch,
    setPipelineConfig,
  } = useAppStore(
    useShallow((state) => ({
      currentProject: state.currentProject,
      maxConcurrency: state.maxConcurrency,
      setMaxConcurrency: state.setMaxConcurrency,
      defaultSkipTests: state.defaultSkipTests,
      specCreatingForProject: state.specCreatingForProject,
      setSpecCreatingForProject: state.setSpecCreatingForProject,
      pendingPlanApproval: state.pendingPlanApproval,
      setPendingPlanApproval: state.setPendingPlanApproval,
      updateFeature: state.updateFeature,
      getCurrentWorktree: state.getCurrentWorktree,
      setCurrentWorktree: state.setCurrentWorktree,
      getWorktrees: state.getWorktrees,
      setWorktrees: state.setWorktrees,
      useWorktrees: state.useWorktrees,
      enableDependencyBlocking: state.enableDependencyBlocking,
      skipVerificationInAutoMode: state.skipVerificationInAutoMode,
      planUseSelectedWorktreeBranch: state.planUseSelectedWorktreeBranch,
      addFeatureUseSelectedWorktreeBranch: state.addFeatureUseSelectedWorktreeBranch,
      isPrimaryWorktreeBranch: state.isPrimaryWorktreeBranch,
      getPrimaryWorktreeBranch: state.getPrimaryWorktreeBranch,
      setPipelineConfig: state.setPipelineConfig,
    }))
  );
  // Fetch pipeline config via React Query
  const { data: pipelineConfig } = usePipelineConfig(currentProject?.path);
  const queryClient = useQueryClient();

  // Subscribe to auto mode events for React Query cache invalidation
  useAutoModeQueryInvalidation(currentProject?.path);
  // Subscribe to worktreePanelVisibleByProject to trigger re-renders when it changes
  const worktreePanelVisibleByProject = useAppStore((state) => state.worktreePanelVisibleByProject);
  // Subscribe to showInitScriptIndicatorByProject to trigger re-renders when it changes
  const showInitScriptIndicatorByProject = useAppStore(
    (state) => state.showInitScriptIndicatorByProject
  );
  const getShowInitScriptIndicator = useAppStore((state) => state.getShowInitScriptIndicator);
  const getDefaultDeleteBranch = useAppStore((state) => state.getDefaultDeleteBranch);
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
  const [showPullResolveConflictsDialog, setShowPullResolveConflictsDialog] = useState(false);
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
    selectionTarget,
    selectedFeatureIds,
    selectedCount,
    toggleSelectionMode,
    toggleFeatureSelection,
    selectAll,
    clearSelection,
    exitSelectionMode,
  } = useSelectionMode();
  const [showMassEditDialog, setShowMassEditDialog] = useState(false);

  // View mode state (kanban vs list)
  const { viewMode, setViewMode, isListView, sortConfig, setSortColumn } = useListViewState();

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

  // Window state hook for compact dialog mode
  const { isMaximized } = useWindowState();

  // Init script events hook - subscribe to worktree init script events
  useInitScriptEvents(currentProject?.path ?? null);

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

  // Custom collision detection that prioritizes specific drop targets (cards, worktrees) over columns
  const collisionDetectionStrategy = useCallback((args: any) => {
    const pointerCollisions = pointerWithin(args);

    // Priority 1: Specific drop targets (cards for dependency links, worktrees)
    // These need to be detected even if they are inside a column
    const specificTargetCollisions = pointerCollisions.filter((collision: any) => {
      const id = String(collision.id);
      return id.startsWith('card-drop-') || id.startsWith('worktree-drop-');
    });

    if (specificTargetCollisions.length > 0) {
      return specificTargetCollisions;
    }

    // Priority 2: Columns
    const columnCollisions = pointerCollisions.filter((collision: any) =>
      COLUMNS.some((col) => col.id === collision.id)
    );

    // If we found a column collision, use that
    if (columnCollisions.length > 0) {
      return columnCollisions;
    }

    // Priority 3: Fallback to rectangle intersection
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

  // Auto mode hook - pass current worktree to get worktree-specific state
  // Must be after selectedWorktree is defined
  const autoMode = useAutoMode(selectedWorktree ?? undefined);
  // Get runningTasks from the hook (scoped to current project/worktree)
  const runningAutoTasks = autoMode.runningTasks;
  // Get worktree-specific maxConcurrency from the hook
  const maxConcurrency = autoMode.maxConcurrency;
  // Get worktree-specific setter
  const setMaxConcurrencyForWorktree = useAppStore((state) => state.setMaxConcurrencyForWorktree);

  // Get the current branch from the selected worktree (not from store which may be stale)
  const currentWorktreeBranch = selectedWorktree?.branch ?? null;

  // Get the branch for the currently selected worktree (for defaulting new features)
  // Use the branch from selectedWorktree, or fall back to main worktree's branch
  const selectedWorktreeBranch =
    currentWorktreeBranch || worktrees.find((w) => w.isMain)?.branch || 'main';

  // Get in-progress features for keyboard shortcuts (needed before actions hook)
  // Must be after runningAutoTasks is defined
  const inProgressFeaturesForShortcuts = useMemo(() => {
    return hookFeatures.filter((f) => {
      const isRunning = runningAutoTasks.includes(f.id);
      return isRunning || f.status === 'in_progress';
    });
  }, [hookFeatures, runningAutoTasks]);

  // Calculate unarchived card counts per branch
  const branchCardCounts = useMemo(() => {
    // Use primary worktree branch as default for features without branchName
    const primaryBranch = worktrees.find((w) => w.isMain)?.branch || 'main';
    return hookFeatures.reduce(
      (counts, feature) => {
        if (feature.status !== 'completed') {
          const branch = feature.branchName ?? primaryBranch;
          counts[branch] = (counts[branch] || 0) + 1;
        }
        return counts;
      },
      {} as Record<string, number>
    );
  }, [hookFeatures, worktrees]);

  // Helper function to add and select a worktree
  const addAndSelectWorktree = useCallback(
    (worktreeResult: { path: string; branch: string }) => {
      if (!currentProject) return;

      const currentWorktrees = getWorktrees(currentProject.path);
      const existingWorktree = currentWorktrees.find((w) => w.branch === worktreeResult.branch);

      // Only add if it doesn't already exist (to avoid duplicates)
      if (!existingWorktree) {
        const newWorktreeInfo = {
          path: worktreeResult.path,
          branch: worktreeResult.branch,
          isMain: false,
          isCurrent: false,
          hasWorktree: true,
        };
        setWorktrees(currentProject.path, [...currentWorktrees, newWorktreeInfo]);
      }
      // Select the worktree (whether it existed or was just added)
      setCurrentWorktree(currentProject.path, worktreeResult.path, worktreeResult.branch);
    },
    [currentProject, getWorktrees, setWorktrees, setCurrentWorktree]
  );

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
    onWorktreeAutoSelect: addAndSelectWorktree,
    currentWorktreeBranch,
  });

  // Handler for bulk updating multiple features
  const handleBulkUpdate = useCallback(
    async (updates: Partial<Feature>, workMode: 'current' | 'auto' | 'custom') => {
      if (!currentProject || selectedFeatureIds.size === 0) return;

      try {
        // Determine final branch name based on work mode:
        // - 'current': Use selected worktree branch if available, otherwise undefined (work on main)
        // - 'auto': Auto-generate branch name based on current branch
        // - 'custom': Use the provided branch name
        let finalBranchName: string | undefined;

        if (workMode === 'current') {
          // If a worktree is selected, use its branch; otherwise work on main (undefined = no branch assignment)
          finalBranchName = currentWorktreeBranch || undefined;
        } else if (workMode === 'auto') {
          // Auto-generate a branch name based on primary branch (main/master) and timestamp
          // Always use primary branch to avoid nested feature/feature/... paths
          const baseBranch = getPrimaryWorktreeBranch(currentProject.path) || 'main';
          const timestamp = Date.now();
          const randomSuffix = Math.random().toString(36).substring(2, 6);
          finalBranchName = `feature/${baseBranch}-${timestamp}-${randomSuffix}`;
        } else {
          // Custom mode - use provided branch name
          finalBranchName = updates.branchName || undefined;
        }

        // Create worktree for 'auto' or 'custom' modes when we have a branch name
        if ((workMode === 'auto' || workMode === 'custom') && finalBranchName) {
          try {
            const electronApi = getElectronAPI();
            if (electronApi?.worktree?.create) {
              const result = await electronApi.worktree.create(
                currentProject.path,
                finalBranchName
              );
              if (result.success && result.worktree) {
                logger.info(
                  `Worktree for branch "${finalBranchName}" ${
                    result.worktree?.isNew ? 'created' : 'already exists'
                  }`
                );
                // Auto-select the worktree when creating/using it for bulk update
                addAndSelectWorktree(result.worktree);
                // Refresh worktree list in UI
                setWorktreeRefreshKey((k) => k + 1);
              } else if (!result.success) {
                logger.error(
                  `Failed to create worktree for branch "${finalBranchName}":`,
                  result.error
                );
                toast.error('Failed to create worktree', {
                  description: result.error || 'An error occurred',
                });
                return; // Don't proceed with update if worktree creation failed
              }
            }
          } catch (error) {
            logger.error('Error creating worktree:', error);
            toast.error('Failed to create worktree', {
              description: error instanceof Error ? error.message : 'An error occurred',
            });
            return; // Don't proceed with update if worktree creation failed
          }
        }

        // Use the final branch name in updates
        const finalUpdates = {
          ...updates,
          branchName: finalBranchName,
        };

        const api = getHttpApiClient();
        const featureIds = Array.from(selectedFeatureIds);
        const result = await api.features.bulkUpdate(currentProject.path, featureIds, finalUpdates);

        if (result.success) {
          // Invalidate React Query cache to refetch features with server-updated values
          loadFeatures();
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
    [
      currentProject,
      selectedFeatureIds,
      loadFeatures,
      exitSelectionMode,
      getPrimaryWorktreeBranch,
      addAndSelectWorktree,
      currentWorktreeBranch,
      setWorktreeRefreshKey,
    ]
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

  // Get waiting_approval feature IDs in current branch for "Select All"
  const allSelectableWaitingApprovalFeatureIds = useMemo(() => {
    return hookFeatures
      .filter((f) => {
        // Only waiting_approval features
        if (f.status !== 'waiting_approval') return false;

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

  // Handler for bulk verifying multiple features
  const handleBulkVerify = useCallback(async () => {
    if (!currentProject || selectedFeatureIds.size === 0) return;

    try {
      const api = getHttpApiClient();
      const featureIds = Array.from(selectedFeatureIds);
      const updates = { status: 'verified' as const };

      // Use bulk update API for efficient batch processing
      const result = await api.features.bulkUpdate(currentProject.path, featureIds, updates);

      if (result.success) {
        // Invalidate React Query cache to refetch features with server-updated values
        loadFeatures();
        toast.success(`Verified ${result.updatedCount} features`);
        exitSelectionMode();
      } else {
        toast.error('Failed to verify some features', {
          description: `${result.failedCount} features failed to verify`,
        });
      }
    } catch (error) {
      logger.error('Bulk verify failed:', error);
      toast.error('Failed to verify features');
    }
  }, [currentProject, selectedFeatureIds, loadFeatures, exitSelectionMode]);

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
        workMode: 'custom' as const, // Use the worktree's branch
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

  // Handler for resolving conflicts - opens dialog to select remote branch, then creates a feature
  const handleResolveConflicts = useCallback((worktree: WorktreeInfo) => {
    setSelectedWorktreeForAction(worktree);
    setShowPullResolveConflictsDialog(true);
  }, []);

  // Handler called when user confirms the pull & resolve conflicts dialog
  const handleConfirmResolveConflicts = useCallback(
    async (worktree: WorktreeInfo, remoteBranch: string) => {
      const description = `Pull latest from ${remoteBranch} and resolve conflicts. Merge ${remoteBranch} into the current branch (${worktree.branch}), resolving any merge conflicts that arise. After resolving conflicts, ensure the code compiles and tests pass.`;

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
        workMode: 'custom' as const, // Use the worktree's branch
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

  // Handler called when merge fails due to conflicts and user wants to create a feature to resolve them
  const handleCreateMergeConflictResolutionFeature = useCallback(
    async (conflictInfo: MergeConflictInfo) => {
      const description = `Resolve merge conflicts when merging "${conflictInfo.sourceBranch}" into "${conflictInfo.targetBranch}". The merge was started but encountered conflicts that need to be resolved manually. After resolving all conflicts, ensure the code compiles and tests pass, then complete the merge by committing the resolved changes.`;

      // Create the feature
      const featureData = {
        title: `Resolve Merge Conflicts: ${conflictInfo.sourceBranch} → ${conflictInfo.targetBranch}`,
        category: 'Maintenance',
        description,
        images: [],
        imagePaths: [],
        skipTests: defaultSkipTests,
        model: 'opus' as const,
        thinkingLevel: 'none' as const,
        branchName: conflictInfo.targetBranch,
        workMode: 'custom' as const, // Use the target branch where conflicts need to be resolved
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

  // NOTE: Auto mode polling loop has been moved to the backend.
  // The frontend now just toggles the backend's auto loop via API calls.
  // See use-auto-mode.ts for the start/stop logic that calls the backend.

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

  // Load any saved plan from disk when opening the board
  useEffect(() => {
    if (!currentProject || pendingBacklogPlan) return;

    let isActive = true;
    const loadSavedPlan = async () => {
      const api = getElectronAPI();
      if (!api?.backlogPlan) return;

      const result = await api.backlogPlan.status(currentProject.path);
      if (
        isActive &&
        result.success &&
        result.savedPlan?.result &&
        result.savedPlan.result.changes?.length > 0
      ) {
        setPendingBacklogPlan(result.savedPlan.result);
      }
    };

    loadSavedPlan();
    return () => {
      isActive = false;
    };
  }, [currentProject, pendingBacklogPlan]);

  // Use keyboard shortcuts hook (after actions hook)
  useBoardKeyboardShortcuts({
    features: hookFeatures,
    runningAutoTasks,
    onAddFeature: () => setShowAddDialog(true),
    onStartNextFeatures: handleStartNextFeatures,
    onViewOutput: handleViewOutput,
  });

  // Use drag and drop hook
  const {
    activeFeature,
    handleDragStart,
    handleDragEnd,
    pendingDependencyLink,
    clearPendingDependencyLink,
  } = useBoardDragDrop({
    features: hookFeatures,
    currentProject,
    runningAutoTasks,
    persistFeatureUpdate,
    handleStartImplementation,
  });

  // Handle dependency link creation
  const handleCreateDependencyLink = useCallback(
    async (linkType: DependencyLinkType) => {
      if (!pendingDependencyLink || !currentProject) return;

      const { draggedFeature, targetFeature } = pendingDependencyLink;

      if (linkType === 'parent') {
        // Dragged feature depends on target (target is parent)
        // Add targetFeature.id to draggedFeature.dependencies
        const currentDeps = draggedFeature.dependencies || [];
        if (!currentDeps.includes(targetFeature.id)) {
          const newDeps = [...currentDeps, targetFeature.id];
          updateFeature(draggedFeature.id, { dependencies: newDeps });
          await persistFeatureUpdate(draggedFeature.id, { dependencies: newDeps });
          toast.success('Dependency link created', {
            description: `"${draggedFeature.description.slice(0, 30)}..." now depends on "${targetFeature.description.slice(0, 30)}..."`,
          });
        }
      } else {
        // Target feature depends on dragged (dragged is parent)
        // Add draggedFeature.id to targetFeature.dependencies
        const currentDeps = targetFeature.dependencies || [];
        if (!currentDeps.includes(draggedFeature.id)) {
          const newDeps = [...currentDeps, draggedFeature.id];
          updateFeature(targetFeature.id, { dependencies: newDeps });
          await persistFeatureUpdate(targetFeature.id, { dependencies: newDeps });
          toast.success('Dependency link created', {
            description: `"${targetFeature.description.slice(0, 30)}..." now depends on "${draggedFeature.description.slice(0, 30)}..."`,
          });
        }
      }

      clearPendingDependencyLink();
    },
    [
      pendingDependencyLink,
      currentProject,
      updateFeature,
      persistFeatureUpdate,
      clearPendingDependencyLink,
    ]
  );

  // Use column features hook
  const { getColumnFeatures, completedFeatures } = useBoardColumnFeatures({
    features: hookFeatures,
    runningAutoTasks,
    searchQuery,
    currentWorktreePath,
    currentWorktreeBranch,
    projectPath: currentProject?.path || null,
  });

  // Build columnFeaturesMap for ListView
  // pipelineConfig is now from usePipelineConfig React Query hook at the top
  const columnFeaturesMap = useMemo(() => {
    const columns = getColumnsWithPipeline(pipelineConfig);
    const map: Record<string, typeof hookFeatures> = {};
    for (const column of columns) {
      map[column.id] = getColumnFeatures(column.id as any);
    }
    return map;
  }, [pipelineConfig, getColumnFeatures]);

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
        <Spinner size="lg" />
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
        onConcurrencyChange={(newMaxConcurrency) => {
          if (currentProject && selectedWorktree) {
            const branchName = selectedWorktree.isMain ? null : selectedWorktree.branch;
            setMaxConcurrencyForWorktree(currentProject.id, branchName, newMaxConcurrency);
            // Also update backend if auto mode is running
            if (autoMode.isRunning) {
              // Restart auto mode with new concurrency (backend will handle this)
              autoMode.stop().then(() => {
                autoMode.start().catch((error) => {
                  logger.error('[AutoMode] Failed to restart with new concurrency:', error);
                });
              });
            }
          }
        }}
        isAutoModeRunning={autoMode.isRunning}
        onAutoModeToggle={(enabled) => {
          if (enabled) {
            autoMode.start().catch((error) => {
              logger.error('[AutoMode] Failed to start:', error);
            });
          } else {
            autoMode.stop().catch((error) => {
              logger.error('[AutoMode] Failed to stop:', error);
            });
          }
        }}
        onOpenPlanDialog={() => setShowPlanDialog(true)}
        hasPendingPlan={Boolean(pendingBacklogPlan)}
        onOpenPendingPlan={() => setShowPlanDialog(true)}
        isMounted={isMounted}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isCreatingSpec={isCreatingSpec}
        creatingSpecProjectPath={creatingSpecProjectPath}
        onShowBoardBackground={() => setShowBoardBackgroundModal(true)}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {/* DndContext wraps both WorktreePanel and main content area to enable drag-to-worktree */}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetectionStrategy}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
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
            onCreateMergeConflictResolutionFeature={handleCreateMergeConflictResolutionFeature}
            onBranchDeletedDuringMerge={(branchName) => {
              // Reset features that were assigned to the deleted branch (same logic as onDeleted in DeleteWorktreeDialog)
              hookFeatures.forEach((feature) => {
                if (feature.branchName === branchName) {
                  // Reset the feature's branch assignment - update both local state and persist
                  const updates = {
                    branchName: null as unknown as string | undefined,
                  };
                  updateFeature(feature.id, updates);
                  persistFeatureUpdate(feature.id, updates);
                }
              });
              setWorktreeRefreshKey((k) => k + 1);
            }}
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
          {/* View Content - Kanban Board or List View */}
          {isListView ? (
            <ListView
              columnFeaturesMap={columnFeaturesMap}
              allFeatures={hookFeatures}
              sortConfig={sortConfig}
              onSortChange={setSortColumn}
              actionHandlers={{
                onEdit: (feature) => setEditingFeature(feature),
                onDelete: (featureId) => handleDeleteFeature(featureId),
                onViewOutput: handleViewOutput,
                onVerify: handleVerifyFeature,
                onResume: handleResumeFeature,
                onForceStop: handleForceStopFeature,
                onManualVerify: handleManualVerify,
                onFollowUp: handleOpenFollowUp,
                onImplement: handleStartImplementation,
                onComplete: handleCompleteFeature,
                onViewPlan: (feature) => setViewPlanFeature(feature),
                onApprovePlan: handleOpenApprovalDialog,
                onSpawnTask: (feature) => {
                  setSpawnParentFeature(feature);
                  setShowAddDialog(true);
                },
              }}
              runningAutoTasks={runningAutoTasks}
              pipelineConfig={pipelineConfig}
              onAddFeature={() => setShowAddDialog(true)}
              isSelectionMode={isSelectionMode}
              selectedFeatureIds={selectedFeatureIds}
              onToggleFeatureSelection={toggleFeatureSelection}
              onRowClick={(feature) => {
                if (feature.status === 'backlog') {
                  setEditingFeature(feature);
                } else {
                  handleViewOutput(feature);
                }
              }}
              className="transition-opacity duration-200"
            />
          ) : (
            <KanbanBoard
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
              onShowCompletedModal={() => setShowCompletedModal(true)}
              completedCount={completedFeatures.length}
              pipelineConfig={pipelineConfig}
              onOpenPipelineSettings={() => setShowPipelineSettings(true)}
              isSelectionMode={isSelectionMode}
              selectionTarget={selectionTarget}
              selectedFeatureIds={selectedFeatureIds}
              onToggleFeatureSelection={toggleFeatureSelection}
              onToggleSelectionMode={toggleSelectionMode}
              viewMode={viewMode}
              isDragging={activeFeature !== null}
              onAiSuggest={() => setShowPlanDialog(true)}
              className="transition-opacity duration-200"
            />
          )}
        </div>
      </DndContext>

      {/* Selection Action Bar */}
      {isSelectionMode && (
        <SelectionActionBar
          selectedCount={selectedCount}
          totalCount={
            selectionTarget === 'waiting_approval'
              ? allSelectableWaitingApprovalFeatureIds.length
              : allSelectableFeatureIds.length
          }
          onEdit={selectionTarget === 'backlog' ? () => setShowMassEditDialog(true) : undefined}
          onDelete={selectionTarget === 'backlog' ? handleBulkDelete : undefined}
          onVerify={selectionTarget === 'waiting_approval' ? handleBulkVerify : undefined}
          onClear={clearSelection}
          onSelectAll={() =>
            selectAll(
              selectionTarget === 'waiting_approval'
                ? allSelectableWaitingApprovalFeatureIds
                : allSelectableFeatureIds
            )
          }
          mode={selectionTarget === 'waiting_approval' ? 'waiting_approval' : 'backlog'}
        />
      )}

      {/* Mass Edit Dialog */}
      <MassEditDialog
        open={showMassEditDialog}
        onClose={() => setShowMassEditDialog(false)}
        selectedFeatures={selectedFeatures}
        onApply={handleBulkUpdate}
        branchSuggestions={branchSuggestions}
        branchCardCounts={branchCardCounts}
        currentBranch={currentWorktreeBranch || undefined}
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
        // When setting is enabled and a non-main worktree is selected, pass its branch to default to 'custom' work mode
        selectedNonMainWorktreeBranch={
          addFeatureUseSelectedWorktreeBranch && currentWorktreePath !== null
            ? currentWorktreeBranch || undefined
            : undefined
        }
        // When the worktree setting is disabled, force 'current' branch mode
        forceCurrentBranchMode={!addFeatureUseSelectedWorktreeBranch}
      />

      {/* Dependency Link Dialog */}
      <DependencyLinkDialog
        open={Boolean(pendingDependencyLink)}
        onOpenChange={(open) => !open && clearPendingDependencyLink()}
        draggedFeature={pendingDependencyLink?.draggedFeature || null}
        targetFeature={pendingDependencyLink?.targetFeature || null}
        onLink={handleCreateDependencyLink}
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
        branchName={outputFeature?.branchName}
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
        pipelineConfig={pipelineConfig}
        onSave={async (config) => {
          const api = getHttpApiClient();
          const result = await api.pipeline.saveConfig(currentProject.path, config);
          if (!result.success) {
            throw new Error(result.error || 'Failed to save pipeline config');
          }
          // Invalidate React Query cache to refetch updated config
          queryClient.invalidateQueries({
            queryKey: queryKeys.pipeline.config(currentProject.path),
          });
          // Also update Zustand for backward compatibility
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
        currentBranch={planUseSelectedWorktreeBranch ? selectedWorktreeBranch : undefined}
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
        defaultDeleteBranch={getDefaultDeleteBranch(currentProject.path)}
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

      {/* Pull & Resolve Conflicts Dialog */}
      <PullResolveConflictsDialog
        open={showPullResolveConflictsDialog}
        onOpenChange={setShowPullResolveConflictsDialog}
        worktree={selectedWorktreeForAction}
        onConfirm={handleConfirmResolveConflicts}
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
        defaultBaseBranch={selectedWorktreeBranch}
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

      {/* Init Script Indicator - floating overlay for worktree init script status */}
      {getShowInitScriptIndicator(currentProject.path) && (
        <InitScriptIndicator projectPath={currentProject.path} />
      )}
    </div>
  );
}
