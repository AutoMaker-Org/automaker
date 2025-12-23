import { useState, useCallback } from 'react';
import { useNavigate, useLocation } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { useAppStore, type ThemeMode } from '@/store/app-store';
import { useKeyboardShortcuts, useKeyboardShortcutsConfig } from '@/hooks/use-keyboard-shortcuts';
import { getElectronAPI } from '@/lib/electron';
import { initializeProject, hasAppSpec, hasAutomakerDir } from '@/lib/project-init';
import { toast } from 'sonner';
import { DeleteProjectDialog } from '@/components/views/settings-view/components/delete-project-dialog';
import { NewProjectModal } from '@/components/dialogs/new-project-modal';
import { CreateSpecDialog } from '@/components/views/spec-view/dialogs';

// Local imports from subfolder
import {
  CollapseToggleButton,
  SidebarHeader,
  ProjectActions,
  SidebarNavigation,
  ProjectSelectorWithOptions,
} from './sidebar/components';
import { Hud } from './hud';
import { FloatingDock } from './floating-dock';
import { TrashDialog, OnboardingDialog } from './sidebar/dialogs';
import { SIDEBAR_FEATURE_FLAGS } from './sidebar/constants';
import {
  useSidebarAutoCollapse,
  useRunningAgents,
  useSpecRegeneration,
  useNavigation,
  useProjectCreation,
  useSetupDialog,
  useTrashDialog,
  useProjectTheme,
} from './sidebar/hooks';

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    projects,
    trashedProjects,
    currentProject,
    sidebarOpen,
    projectHistory,
    upsertAndSetCurrentProject,
    toggleSidebar,
    restoreTrashedProject,
    deleteTrashedProject,
    emptyTrash,
    cyclePrevProject,
    cycleNextProject,
    moveProjectToTrash,
    specCreatingForProject,
    setSpecCreatingForProject,
  } = useAppStore();

  // Environment variable flags for hiding sidebar items
  const { hideTerminal, hideWiki, hideRunningAgents, hideContext, hideSpecEditor, hideAiProfiles } =
    SIDEBAR_FEATURE_FLAGS;

  // Get customizable keyboard shortcuts
  const shortcuts = useKeyboardShortcutsConfig();

  // State for project picker (needed for keyboard shortcuts)
  const [isProjectPickerOpen, setIsProjectPickerOpen] = useState(false);

  // State for delete project confirmation dialog
  const [showDeleteProjectDialog, setShowDeleteProjectDialog] = useState(false);

  // Project theme management (must come before useProjectCreation which uses globalTheme)
  const { globalTheme } = useProjectTheme();

  // Project creation state and handlers
  const {
    showNewProjectModal,
    setShowNewProjectModal,
    isCreatingProject,
    showOnboardingDialog,
    setShowOnboardingDialog,
    newProjectName,
    setNewProjectName,
    newProjectPath,
    setNewProjectPath,
    handleCreateBlankProject,
    handleCreateFromTemplate,
    handleCreateFromCustomUrl,
  } = useProjectCreation({
    trashedProjects,
    currentProject,
    globalTheme,
    upsertAndSetCurrentProject,
  });

  // Setup dialog state and handlers
  const {
    showSetupDialog,
    setShowSetupDialog,
    setupProjectPath,
    setSetupProjectPath,
    projectOverview,
    setProjectOverview,
    generateFeatures,
    setGenerateFeatures,
    analyzeProject,
    setAnalyzeProject,
    featureCount,
    setFeatureCount,
    handleCreateInitialSpec,
    handleSkipSetup,
    handleOnboardingGenerateSpec,
    handleOnboardingSkip,
  } = useSetupDialog({
    setSpecCreatingForProject,
    newProjectPath,
    setNewProjectName,
    setNewProjectPath,
    setShowOnboardingDialog,
  });

  // Derive isCreatingSpec from store state
  const isCreatingSpec = specCreatingForProject !== null;
  const creatingSpecProjectPath = specCreatingForProject;

  // Auto-collapse sidebar on small screens and update Electron window minWidth
  useSidebarAutoCollapse({ sidebarOpen, toggleSidebar });

  // Running agents count
  const { runningAgentsCount } = useRunningAgents();

  // Trash dialog and operations
  const {
    showTrashDialog,
    setShowTrashDialog,
    activeTrashId,
    isEmptyingTrash,
    handleRestoreProject,
    handleDeleteProjectFromDisk,
    handleEmptyTrash,
  } = useTrashDialog({
    restoreTrashedProject,
    deleteTrashedProject,
    emptyTrash,
    trashedProjects,
  });

  // Spec regeneration events
  useSpecRegeneration({
    creatingSpecProjectPath,
    setupProjectPath,
    setSpecCreatingForProject,
    setShowSetupDialog,
    setProjectOverview,
    setSetupProjectPath,
    setNewProjectName,
    setNewProjectPath,
  });

  /**
   * Opens the system folder selection dialog and initializes the selected project.
   * Used by both the 'O' keyboard shortcut and the folder icon button.
   */
  const handleOpenFolder = useCallback(async () => {
    const api = getElectronAPI();
    const result = await api.openDirectory();

    if (!result.canceled && result.filePaths[0]) {
      const path = result.filePaths[0];
      // Extract folder name from path (works on both Windows and Mac/Linux)
      const name = path.split(/[/\\]/).filter(Boolean).pop() || 'Untitled Project';

      try {
        // Check if this is a brand new project (no .automaker directory)
        const hadAutomakerDir = await hasAutomakerDir(path);

        // Initialize the .automaker directory structure
        const initResult = await initializeProject(path);

        if (!initResult.success) {
          toast.error('Failed to initialize project', {
            description: initResult.error || 'Unknown error occurred',
          });
          return;
        }

        // Upsert project and set as current (handles both create and update cases)
        // Theme preservation is handled by the store action
        const trashedProject = trashedProjects.find((p) => p.path === path);
        const effectiveTheme =
          (trashedProject?.theme as ThemeMode | undefined) ||
          (currentProject?.theme as ThemeMode | undefined) ||
          globalTheme;
        upsertAndSetCurrentProject(path, name, effectiveTheme);

        // Check if app_spec.txt exists
        const specExists = await hasAppSpec(path);

        if (!hadAutomakerDir && !specExists) {
          // This is a brand new project - show setup dialog
          setSetupProjectPath(path);
          setShowSetupDialog(true);
          toast.success('Project opened', {
            description: `Opened ${name}. Let's set up your app specification!`,
          });
        } else if (initResult.createdFiles && initResult.createdFiles.length > 0) {
          toast.success(initResult.isNewProject ? 'Project initialized' : 'Project updated', {
            description: `Set up ${initResult.createdFiles.length} file(s) in .automaker`,
          });
        } else {
          toast.success('Project opened', {
            description: `Opened ${name}`,
          });
        }
      } catch (error) {
        console.error('[Sidebar] Failed to open project:', error);
        toast.error('Failed to open project', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }, [trashedProjects, upsertAndSetCurrentProject, currentProject, globalTheme]);

  // Navigation sections and keyboard shortcuts (defined after handlers)
  const { navSections, navigationShortcuts } = useNavigation({
    shortcuts,
    hideSpecEditor,
    hideContext,
    hideTerminal,
    hideAiProfiles,
    currentProject,
    projects,
    projectHistory,
    navigate,
    toggleSidebar,
    handleOpenFolder,
    setIsProjectPickerOpen,
    cyclePrevProject,
    cycleNextProject,
  });

  // Register keyboard shortcuts
  useKeyboardShortcuts(navigationShortcuts);

  const isActiveRoute = (id: string) => {
    // Map view IDs to route paths
    const routePath = id === 'welcome' ? '/' : `/${id}`;
    return location.pathname === routePath;
  };

  return (
    <>
      {/* Heads-Up Display (Top Bar) */}
      <Hud
        onOpenProjectPicker={() => setIsProjectPickerOpen(true)}
        onOpenFolder={handleOpenFolder}
      />

      {/* Floating Navigation Dock */}
      <FloatingDock />

      {/* Project Selector Dialog (Hidden logic, controlled by state) */}
      <div className="hidden">
        <ProjectSelectorWithOptions
          sidebarOpen={true}
          isProjectPickerOpen={isProjectPickerOpen}
          setIsProjectPickerOpen={setIsProjectPickerOpen}
          setShowDeleteProjectDialog={setShowDeleteProjectDialog}
        />
      </div>

      {/* Dialogs & Modals - Preservation of Logic */}
      <TrashDialog
        open={showTrashDialog}
        onOpenChange={setShowTrashDialog}
        trashedProjects={trashedProjects}
        activeTrashId={activeTrashId}
        handleRestoreProject={handleRestoreProject}
        handleDeleteProjectFromDisk={handleDeleteProjectFromDisk}
        deleteTrashedProject={deleteTrashedProject}
        handleEmptyTrash={handleEmptyTrash}
        isEmptyingTrash={isEmptyingTrash}
      />

      <CreateSpecDialog
        open={showSetupDialog}
        onOpenChange={setShowSetupDialog}
        projectOverview={projectOverview}
        onProjectOverviewChange={setProjectOverview}
        generateFeatures={generateFeatures}
        onGenerateFeaturesChange={setGenerateFeatures}
        analyzeProject={analyzeProject}
        onAnalyzeProjectChange={setAnalyzeProject}
        featureCount={featureCount}
        onFeatureCountChange={setFeatureCount}
        onCreateSpec={handleCreateInitialSpec}
        onSkip={handleSkipSetup}
        isCreatingSpec={isCreatingSpec}
        showSkipButton={true}
        title="Set Up Your Project"
        description="We didn't find an app_spec.txt file. Let us help you generate your app_spec.txt to help describe your project for our system. We'll analyze your project's tech stack and create a comprehensive specification."
      />

      <OnboardingDialog
        open={showOnboardingDialog}
        onOpenChange={setShowOnboardingDialog}
        newProjectName={newProjectName}
        onSkip={handleOnboardingSkip}
        onGenerateSpec={handleOnboardingGenerateSpec}
      />

      <DeleteProjectDialog
        open={showDeleteProjectDialog}
        onOpenChange={setShowDeleteProjectDialog}
        project={currentProject}
        onConfirm={moveProjectToTrash}
      />

      <NewProjectModal
        open={showNewProjectModal}
        onOpenChange={setShowNewProjectModal}
        onCreateBlankProject={handleCreateBlankProject}
        onCreateFromTemplate={handleCreateFromTemplate}
        onCreateFromCustomUrl={handleCreateFromCustomUrl}
        isCreating={isCreatingProject}
      />
    </>
  );
}
