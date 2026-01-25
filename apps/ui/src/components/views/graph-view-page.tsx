// @ts-nocheck
import { useState, useCallback, useMemo, useEffect } from 'react';
import { useAppStore, Feature } from '@/store/app-store';
import { useShallow } from 'zustand/react/shallow';
import { GraphView } from './graph-view';
import {
  EditFeatureDialog,
  AddFeatureDialog,
  AgentOutputModal,
  BacklogPlanDialog,
} from './board-view/dialogs';
import {
  useBoardFeatures,
  useBoardActions,
  useBoardBackground,
  useBoardPersistence,
} from './board-view/hooks';
import { useWorktrees } from './board-view/worktree-panel/hooks';
import { useAutoMode } from '@/hooks/use-auto-mode';
import { pathsEqual } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';
import { getElectronAPI } from '@/lib/electron';
import { createLogger } from '@automaker/utils/logger';
import { toast } from 'sonner';
import type { BacklogPlanResult } from '@automaker/types';

const logger = createLogger('GraphViewPage');

// Stable empty array to avoid infinite loop in selector
const EMPTY_WORKTREES: ReturnType<ReturnType<typeof useAppStore.getState>['getWorktrees']> = [];

export function GraphViewPage() {
  const {
    currentProject,
    updateFeature,
    getCurrentWorktree,
    getWorktrees,
    setWorktrees,
    setCurrentWorktree,
    defaultSkipTests,
    addFeatureUseSelectedWorktreeBranch,
    planUseSelectedWorktreeBranch,
    setPlanUseSelectedWorktreeBranch,
  } = useAppStore(
    useShallow((state) => ({
      currentProject: state.currentProject,
      updateFeature: state.updateFeature,
      getCurrentWorktree: state.getCurrentWorktree,
      getWorktrees: state.getWorktrees,
      setWorktrees: state.setWorktrees,
      setCurrentWorktree: state.setCurrentWorktree,
      defaultSkipTests: state.defaultSkipTests,
      addFeatureUseSelectedWorktreeBranch: state.addFeatureUseSelectedWorktreeBranch,
      planUseSelectedWorktreeBranch: state.planUseSelectedWorktreeBranch,
      setPlanUseSelectedWorktreeBranch: state.setPlanUseSelectedWorktreeBranch,
    }))
  );

  // Ensure worktrees are loaded when landing directly on graph view
  useWorktrees({ projectPath: currentProject?.path ?? '' });

  const worktreesByProject = useAppStore((s) => s.worktreesByProject);
  const worktrees = useMemo(
    () =>
      currentProject
        ? (worktreesByProject[currentProject.path] ?? EMPTY_WORKTREES)
        : EMPTY_WORKTREES,
    [currentProject, worktreesByProject]
  );

  // Load features
  const {
    features: hookFeatures,
    isLoading,
    persistedCategories,
    loadFeatures,
    saveCategory,
  } = useBoardFeatures({ currentProject });

  // Auto mode hook
  const autoMode = useAutoMode();
  const runningAutoTasks = autoMode.runningTasks;

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog states
  const [editingFeature, setEditingFeature] = useState<Feature | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [spawnParentFeature, setSpawnParentFeature] = useState<Feature | null>(null);
  const [showOutputModal, setShowOutputModal] = useState(false);
  const [outputFeature, setOutputFeature] = useState<Feature | null>(null);
  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [pendingBacklogPlan, setPendingBacklogPlan] = useState<BacklogPlanResult | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);

  // Worktree refresh key
  const [worktreeRefreshKey, setWorktreeRefreshKey] = useState(0);

  // Get current worktree info
  const currentWorktreeInfo = currentProject ? getCurrentWorktree(currentProject.path) : null;
  const currentWorktreePath = currentWorktreeInfo?.path ?? null;

  // Get the branch for the currently selected worktree
  const selectedWorktree = useMemo(() => {
    if (currentWorktreePath === null) {
      return worktrees.find((w) => w.isMain);
    } else {
      return worktrees.find((w) => !w.isMain && pathsEqual(w.path, currentWorktreePath));
    }
  }, [worktrees, currentWorktreePath]);

  const currentWorktreeBranch = selectedWorktree?.branch ?? null;
  const selectedWorktreeBranch =
    currentWorktreeBranch || worktrees.find((w) => w.isMain)?.branch || 'main';

  // Branch suggestions
  const [branchSuggestions, setBranchSuggestions] = useState<string[]>([]);

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

  // Listen for backlog plan events (for background generation)
  useEffect(() => {
    const api = getElectronAPI();
    if (!api?.backlogPlan) {
      logger.debug('Backlog plan API not available for event subscription');
      return;
    }

    const unsubscribe = api.backlogPlan.onEvent(
      (event: { type: string; result?: BacklogPlanResult; error?: string }) => {
        logger.debug('Backlog plan event received', {
          type: event.type,
          hasResult: Boolean(event.result),
          hasError: Boolean(event.error),
        });
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

  // Load any saved plan from disk when opening the graph view
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

  // Branch card counts
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

  // Category suggestions
  const categorySuggestions = useMemo(() => {
    const featureCategories = hookFeatures.map((f) => f.category).filter(Boolean);
    const allCategories = [...featureCategories, ...persistedCategories];
    return [...new Set(allCategories)].sort();
  }, [hookFeatures, persistedCategories]);

  // Use persistence hook
  const { persistFeatureCreate, persistFeatureUpdate, persistFeatureDelete } = useBoardPersistence({
    currentProject,
  });

  // Follow-up state (simplified for graph view)
  const [followUpFeature, setFollowUpFeature] = useState<Feature | null>(null);
  const [followUpPrompt, setFollowUpPrompt] = useState('');
  const [followUpImagePaths, setFollowUpImagePaths] = useState<any[]>([]);
  const [followUpPreviewMap, setFollowUpPreviewMap] = useState<Map<string, string>>(new Map());

  // In-progress features for shortcuts
  const inProgressFeaturesForShortcuts = useMemo(() => {
    return hookFeatures.filter((f) => {
      const isRunning = runningAutoTasks.includes(f.id);
      return isRunning || f.status === 'in_progress';
    });
  }, [hookFeatures, runningAutoTasks]);

  // Simple feature update handler for graph view (dependencies, etc.)
  const handleGraphUpdateFeature = useCallback(
    async (featureId: string, updates: Partial<Feature>) => {
      logger.info('handleGraphUpdateFeature called', { featureId, updates });
      updateFeature(featureId, updates);
      await persistFeatureUpdate(featureId, updates);
      logger.info('handleGraphUpdateFeature completed');
    },
    [updateFeature, persistFeatureUpdate]
  );

  // Board actions hook
  const {
    handleAddFeature,
    handleUpdateFeature,
    handleDeleteFeature,
    handleStartImplementation,
    handleResumeFeature,
    handleViewOutput,
    handleForceStopFeature,
    handleOutputModalNumberKeyPress,
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
    setShowFollowUpDialog: () => {},
    inProgressFeaturesForShortcuts,
    outputFeature,
    projectPath: currentProject?.path || null,
    onWorktreeCreated: () => setWorktreeRefreshKey((k) => k + 1),
    onWorktreeAutoSelect: (newWorktree) => {
      if (!currentProject) return;
      const currentWorktrees = getWorktrees(currentProject.path);
      const existingWorktree = currentWorktrees.find((w) => w.branch === newWorktree.branch);

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
      setCurrentWorktree(currentProject.path, newWorktree.path, newWorktree.branch);
    },
    currentWorktreeBranch,
  });

  // Handle add and start feature
  const handleAddAndStartFeature = useCallback(
    async (featureData: Parameters<typeof handleAddFeature>[0]) => {
      const featuresBeforeIds = new Set(useAppStore.getState().features.map((f) => f.id));
      await handleAddFeature(featureData);

      const latestFeatures = useAppStore.getState().features;
      const newFeature = latestFeatures.find((f) => !featuresBeforeIds.has(f.id));

      if (newFeature) {
        await handleStartImplementation(newFeature);
      }
    },
    [handleAddFeature, handleStartImplementation]
  );

  if (!currentProject) {
    return (
      <div className="flex-1 flex items-center justify-center" data-testid="graph-view-no-project">
        <p className="text-muted-foreground">No project selected</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center" data-testid="graph-view-loading">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden content-bg relative"
      data-testid="graph-view-page"
    >
      {/* Graph View Content */}
      <GraphView
        features={hookFeatures}
        runningAutoTasks={runningAutoTasks}
        currentWorktreePath={currentWorktreePath}
        currentWorktreeBranch={currentWorktreeBranch}
        projectPath={currentProject?.path || null}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onEditFeature={(feature) => setEditingFeature(feature)}
        onViewOutput={handleViewOutput}
        onStartTask={handleStartImplementation}
        onStopTask={handleForceStopFeature}
        onResumeTask={handleResumeFeature}
        onUpdateFeature={handleGraphUpdateFeature}
        onSpawnTask={(feature) => {
          setSpawnParentFeature(feature);
          setShowAddDialog(true);
        }}
        onDeleteTask={(feature) => handleDeleteFeature(feature.id)}
        onAddFeature={() => setShowAddDialog(true)}
        onOpenPlanDialog={() => setShowPlanDialog(true)}
        hasPendingPlan={Boolean(pendingBacklogPlan)}
        planUseSelectedWorktreeBranch={planUseSelectedWorktreeBranch}
        onPlanUseSelectedWorktreeBranchChange={setPlanUseSelectedWorktreeBranch}
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
        isMaximized={false}
        allFeatures={hookFeatures}
      />

      {/* Add Feature Dialog (for spawning) */}
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
        isMaximized={false}
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
    </div>
  );
}
