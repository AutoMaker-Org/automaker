"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  PointerSensor,
  useSensor,
  useSensors,
  rectIntersection,
  pointerWithin,
} from "@dnd-kit/core";
import { useAppStore, Feature } from "@/store/app-store";
import { getElectronAPI } from "@/lib/electron";
import { BoardBackgroundModal } from "@/components/dialogs/board-background-modal";
import { RefreshCw } from "lucide-react";
import { useAutoMode } from "@/hooks/use-auto-mode";
import { useKeyboardShortcutsConfig } from "@/hooks/use-keyboard-shortcuts";
import { useWindowState } from "@/hooks/use-window-state";
// Board-view specific imports
import { BoardHeader } from "./board-view/board-header";
import { BoardSearchBar } from "./board-view/board-search-bar";
import { BoardControls } from "./board-view/board-controls";
import { KanbanBoard } from "./board-view/kanban-board";
import {
  AddFeatureDialog,
  AgentOutputModal,
  CompletedFeaturesModal,
  DeleteAllVerifiedDialog,
  DeleteCompletedFeatureDialog,
  EditFeatureDialog,
  FeatureSuggestionsDialog,
  FollowUpDialog,
} from "./board-view/dialogs";
import { CreateWorktreeDialog } from "./board-view/dialogs/create-worktree-dialog";
import { DeleteWorktreeDialog } from "./board-view/dialogs/delete-worktree-dialog";
import { CommitWorktreeDialog } from "./board-view/dialogs/commit-worktree-dialog";
import { CreatePRDialog } from "./board-view/dialogs/create-pr-dialog";
import { CreateBranchDialog } from "./board-view/dialogs/create-branch-dialog";
import { WorktreeSelector } from "./board-view/components";
import { COLUMNS } from "./board-view/constants";
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
  useSuggestionsState,
} from "./board-view/hooks";

export function BoardView() {
  const {
    currentProject,
    maxConcurrency,
    setMaxConcurrency,
    defaultSkipTests,
    showProfilesOnly,
    aiProfiles,
    kanbanCardDetailLevel,
    setKanbanCardDetailLevel,
    specCreatingForProject,
    setSpecCreatingForProject,
    getCurrentWorktree,
    setCurrentWorktree,
  } = useAppStore();
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
  const [featuresWithContext, setFeaturesWithContext] = useState<Set<string>>(
    new Set()
  );
  const [showDeleteAllVerifiedDialog, setShowDeleteAllVerifiedDialog] =
    useState(false);
  const [showBoardBackgroundModal, setShowBoardBackgroundModal] =
    useState(false);
  const [showCompletedModal, setShowCompletedModal] = useState(false);
  const [deleteCompletedFeature, setDeleteCompletedFeature] =
    useState<Feature | null>(null);

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

  // Follow-up state hook
  const {
    showFollowUpDialog,
    followUpFeature,
    followUpPrompt,
    followUpImagePaths,
    followUpPreviewMap,
    setShowFollowUpDialog,
    setFollowUpFeature,
    setFollowUpPrompt,
    setFollowUpImagePaths,
    setFollowUpPreviewMap,
    handleFollowUpDialogChange,
  } = useFollowUpState();

  // Suggestions state hook
  const {
    showSuggestionsDialog,
    suggestionsCount,
    featureSuggestions,
    isGeneratingSuggestions,
    setShowSuggestionsDialog,
    setSuggestionsCount,
    setFeatureSuggestions,
    setIsGeneratingSuggestions,
    updateSuggestions,
    closeSuggestionsDialog,
  } = useSuggestionsState();
  // Search filter for Kanban cards
  const [searchQuery, setSearchQuery] = useState("");
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

        const result = await api.autoMode.contextExists(
          currentProject.path,
          featureId
        );

        return result.success && result.exists === true;
      } catch (error) {
        console.error("[Board] Error checking context:", error);
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
    setSuggestionsCount,
    setFeatureSuggestions,
    setIsGeneratingSuggestions,
    checkContextExists,
    features: hookFeatures,
    isLoading,
    setFeaturesWithContext,
  });

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
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Get unique categories from existing features AND persisted categories for autocomplete suggestions
  const categorySuggestions = useMemo(() => {
    const featureCategories = hookFeatures
      .map((f) => f.category)
      .filter(Boolean);
    // Merge feature categories with persisted categories
    const allCategories = [...featureCategories, ...persistedCategories];
    return [...new Set(allCategories)].sort();
  }, [hookFeatures, persistedCategories]);

  // Branch suggestions for the branch autocomplete
  const [branchSuggestions, setBranchSuggestions] = useState<string[]>([]);

  // Fetch branches when project changes
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
        console.error("[BoardView] Error fetching branches:", error);
        setBranchSuggestions([]);
      }
    };

    fetchBranches();
  }, [currentProject]);

  // Custom collision detection that prioritizes columns over cards
  const collisionDetectionStrategy = useCallback(
    (args: any) => {
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
    },
    []
  );

  // Use persistence hook
  const {
    persistFeatureCreate,
    persistFeatureUpdate,
    persistFeatureDelete,
  } = useBoardPersistence({ currentProject });

  // Get in-progress features for keyboard shortcuts (needed before actions hook)
  const inProgressFeaturesForShortcuts = useMemo(() => {
    return hookFeatures.filter((f) => {
      const isRunning = runningAutoTasks.includes(f.id);
      return isRunning || f.status === "in_progress";
    });
  }, [hookFeatures, runningAutoTasks]);

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
    handleRevertFeature,
    handleMergeFeature,
    handleCompleteFeature,
    handleUnarchiveFeature,
    handleViewOutput,
    handleOutputModalNumberKeyPress,
    handleForceStopFeature,
    handleStartNextFeatures,
    handleDeleteAllVerified,
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
  });

  // Use keyboard shortcuts hook (after actions hook)
  useBoardKeyboardShortcuts({
    features: hookFeatures,
    runningAutoTasks,
    onAddFeature: () => setShowAddDialog(true),
    onStartNextFeatures: handleStartNextFeatures,
    onViewOutput: handleViewOutput,
  });

  // Use drag and drop hook
  // Get current worktree path and branch for filtering features
  const currentWorktreePath = currentProject ? getCurrentWorktree(currentProject.path) : null;
  const worktrees = useAppStore((s) => currentProject ? s.getWorktrees(currentProject.path) : []);
  const currentWorktreeBranch = currentWorktreePath
    ? worktrees.find(w => w.path === currentWorktreePath)?.branch || null
    : null;

  const { activeFeature, handleDragStart, handleDragEnd } = useBoardDragDrop({
    features: hookFeatures,
    currentProject,
    runningAutoTasks,
    persistFeatureUpdate,
    handleStartImplementation,
    projectPath: currentProject?.path || null,
    onWorktreeCreated: () => setWorktreeRefreshKey((k) => k + 1),
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

  if (!currentProject) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        data-testid="board-view-no-project"
      >
        <p className="text-muted-foreground">No project selected</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        data-testid="board-view-loading"
      >
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
        projectName={currentProject.name}
        maxConcurrency={maxConcurrency}
        onConcurrencyChange={setMaxConcurrency}
        isAutoModeRunning={autoMode.isRunning}
        onStartAutoMode={() => autoMode.start()}
        onStopAutoMode={() => autoMode.stop()}
        onAddFeature={() => setShowAddDialog(true)}
        addFeatureShortcut={{
          key: shortcuts.addFeature,
          action: () => setShowAddDialog(true),
          description: "Add new feature",
        }}
        isMounted={isMounted}
      />

      {/* Worktree Selector */}
      <WorktreeSelector
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
        runningFeatureIds={runningAutoTasks}
        features={hookFeatures.map(f => ({ id: f.id, worktreePath: f.worktreePath }))}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Search Bar Row */}
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <BoardSearchBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            isCreatingSpec={isCreatingSpec}
            creatingSpecProjectPath={creatingSpecProjectPath ?? undefined}
            currentProjectPath={currentProject?.path}
          />

          {/* Board Background & Detail Level Controls */}
          <BoardControls
            isMounted={isMounted}
            onShowBoardBackground={() => setShowBoardBackgroundModal(true)}
            onShowCompletedModal={() => setShowCompletedModal(true)}
            completedCount={completedFeatures.length}
            kanbanCardDetailLevel={kanbanCardDetailLevel}
            onDetailLevelChange={setKanbanCardDetailLevel}
          />
        </div>
        {/* Kanban Columns */}
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
          onCommit={handleCommitFeature}
          onComplete={handleCompleteFeature}
          onImplement={handleStartImplementation}
          featuresWithContext={featuresWithContext}
          runningAutoTasks={runningAutoTasks}
          shortcuts={shortcuts}
          onStartNextFeatures={handleStartNextFeatures}
          onShowSuggestions={() => setShowSuggestionsDialog(true)}
          suggestionsCount={suggestionsCount}
          onDeleteAllVerified={() => setShowDeleteAllVerifiedDialog(true)}
        />
      </div>

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
        onOpenChange={setShowAddDialog}
        onAdd={handleAddFeature}
        categorySuggestions={categorySuggestions}
        branchSuggestions={branchSuggestions}
        defaultSkipTests={defaultSkipTests}
        isMaximized={isMaximized}
        showProfilesOnly={showProfilesOnly}
        aiProfiles={aiProfiles}
      />

      {/* Edit Feature Dialog */}
      <EditFeatureDialog
        feature={editingFeature}
        onClose={() => setEditingFeature(null)}
        onUpdate={handleUpdateFeature}
        categorySuggestions={categorySuggestions}
        branchSuggestions={branchSuggestions}
        isMaximized={isMaximized}
        showProfilesOnly={showProfilesOnly}
        aiProfiles={aiProfiles}
      />

      {/* Agent Output Modal */}
      <AgentOutputModal
        open={showOutputModal}
        onClose={() => setShowOutputModal(false)}
        featureDescription={outputFeature?.description || ""}
        featureId={outputFeature?.id || ""}
        featureStatus={outputFeature?.status}
        onNumberKeyPress={handleOutputModalNumberKeyPress}
      />

      {/* Delete All Verified Dialog */}
      <DeleteAllVerifiedDialog
        open={showDeleteAllVerifiedDialog}
        onOpenChange={setShowDeleteAllVerifiedDialog}
        verifiedCount={getColumnFeatures("verified").length}
        onConfirm={async () => {
          await handleDeleteAllVerified();
          setShowDeleteAllVerifiedDialog(false);
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
      />

      {/* Feature Suggestions Dialog */}
      <FeatureSuggestionsDialog
        open={showSuggestionsDialog}
        onClose={closeSuggestionsDialog}
        projectPath={currentProject.path}
        suggestions={featureSuggestions}
        setSuggestions={updateSuggestions}
        isGenerating={isGeneratingSuggestions}
        setIsGenerating={setIsGeneratingSuggestions}
      />

      {/* Create Worktree Dialog */}
      <CreateWorktreeDialog
        open={showCreateWorktreeDialog}
        onOpenChange={setShowCreateWorktreeDialog}
        projectPath={currentProject.path}
        onCreated={(worktreePath) => {
          setWorktreeRefreshKey((k) => k + 1);
          // Auto-select the newly created worktree
          setCurrentWorktree(currentProject.path, worktreePath);
        }}
      />

      {/* Delete Worktree Dialog */}
      <DeleteWorktreeDialog
        open={showDeleteWorktreeDialog}
        onOpenChange={setShowDeleteWorktreeDialog}
        projectPath={currentProject.path}
        worktree={selectedWorktreeForAction}
        onDeleted={() => {
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
        onCreated={() => {
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
