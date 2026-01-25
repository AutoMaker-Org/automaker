import { useState, useCallback } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { useNavigate, useLocation } from '@tanstack/react-router';

const logger = createLogger('Sidebar');
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { useNotificationsStore } from '@/store/notifications-store';
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
  SidebarNavigation,
  SidebarFooter,
  MobileSidebarToggle,
} from './sidebar/components';
import { useIsCompact } from '@/hooks/use-media-query';
import { PanelLeftClose } from 'lucide-react';
import { TrashDialog, OnboardingDialog } from './sidebar/dialogs';
import { SIDEBAR_FEATURE_FLAGS } from './sidebar/constants';
import {
  useSidebarAutoCollapse,
  useRunningAgents,
  useSpecRegeneration,
  useNavigation,
  useProjectCreation,
  useSetupDialog,
  useTrashOperations,
  useUnviewedValidations,
} from './sidebar/hooks';

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    projects,
    trashedProjects,
    currentProject,
    sidebarOpen,
    mobileSidebarHidden,
    projectHistory,
    upsertAndSetCurrentProject,
    toggleSidebar,
    toggleMobileSidebarHidden,
    restoreTrashedProject,
    deleteTrashedProject,
    emptyTrash,
    cyclePrevProject,
    cycleNextProject,
    moveProjectToTrash,
    specCreatingForProject,
    setSpecCreatingForProject,
  } = useAppStore();

  const isCompact = useIsCompact();

  // Environment variable flags for hiding sidebar items
  const { hideTerminal, hideRunningAgents, hideContext, hideSpecEditor } = SIDEBAR_FEATURE_FLAGS;

  // Get customizable keyboard shortcuts
  const shortcuts = useKeyboardShortcutsConfig();

  // Get unread notifications count
  const unreadNotificationsCount = useNotificationsStore((s) => s.unreadCount);

  // State for delete project confirmation dialog
  const [showDeleteProjectDialog, setShowDeleteProjectDialog] = useState(false);

  // State for trash dialog
  const [showTrashDialog, setShowTrashDialog] = useState(false);

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
  // Check if the current project is specifically the one generating spec
  const isCurrentProjectGeneratingSpec =
    specCreatingForProject !== null && specCreatingForProject === currentProject?.path;

  // Auto-collapse sidebar on small screens and update Electron window minWidth
  useSidebarAutoCollapse({ sidebarOpen, toggleSidebar });

  // Running agents count
  const { runningAgentsCount } = useRunningAgents();

  // Unviewed validations count
  const { count: unviewedValidationsCount } = useUnviewedValidations(currentProject);

  // Trash operations
  const {
    activeTrashId,
    isEmptyingTrash,
    handleRestoreProject,
    handleDeleteProjectFromDisk,
    handleEmptyTrash,
  } = useTrashOperations({
    restoreTrashedProject,
    deleteTrashedProject,
    emptyTrash,
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
        // Theme handling (trashed project recovery or undefined for global) is done by the store
        upsertAndSetCurrentProject(path, name);

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
        logger.error('Failed to open project:', error);
        toast.error('Failed to open project', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }, [upsertAndSetCurrentProject]);

  // Navigation sections and keyboard shortcuts (defined after handlers)
  const { navSections, navigationShortcuts } = useNavigation({
    shortcuts,
    hideSpecEditor,
    hideContext,
    hideTerminal,
    currentProject,
    projects,
    projectHistory,
    navigate,
    toggleSidebar,
    handleOpenFolder,
    cyclePrevProject,
    cycleNextProject,
    unviewedValidationsCount,
    unreadNotificationsCount,
    isSpecGenerating: isCurrentProjectGeneratingSpec,
  });

  // Register keyboard shortcuts
  useKeyboardShortcuts(navigationShortcuts);

  const isActiveRoute = (id: string) => {
    // Map view IDs to route paths
    const routePath = id === 'welcome' ? '/' : `/${id}`;
    return location.pathname === routePath;
  };

  // Check if sidebar should be completely hidden on mobile
  const shouldHideSidebar = isCompact && mobileSidebarHidden;

  return (
    <>
      {/* Floating toggle to show sidebar on mobile when hidden */}
      <MobileSidebarToggle />

      {/* Mobile backdrop overlay */}
      {sidebarOpen && !shouldHideSidebar && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={toggleSidebar}
          data-testid="sidebar-backdrop"
        />
      )}
      <aside
        className={cn(
          'flex-shrink-0 flex flex-col z-30',
          // Glass morphism background with gradient
          'bg-gradient-to-b from-sidebar/95 via-sidebar/85 to-sidebar/90 backdrop-blur-2xl',
          // Premium border with subtle glow
          'border-r border-border/60 shadow-[1px_0_20px_-5px_rgba(0,0,0,0.1)]',
          // Smooth width transition
          'transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          // Mobile: completely hidden when mobileSidebarHidden is true
          shouldHideSidebar && 'hidden',
          // Mobile: overlay when open, collapsed when closed
          !shouldHideSidebar &&
            (sidebarOpen ? 'fixed inset-y-0 left-0 w-72 lg:relative lg:w-72' : 'relative w-16')
        )}
        data-testid="sidebar"
      >
        <CollapseToggleButton
          sidebarOpen={sidebarOpen}
          toggleSidebar={toggleSidebar}
          shortcut={shortcuts.toggleSidebar}
        />

        {/* Floating hide button on right edge - only visible on compact screens when sidebar is collapsed */}
        {!sidebarOpen && isCompact && (
          <button
            onClick={toggleMobileSidebarHidden}
            className={cn(
              'absolute -right-6 top-1/2 -translate-y-1/2 z-40',
              'flex items-center justify-center w-6 h-10 rounded-r-lg',
              'bg-card/95 backdrop-blur-sm border border-l-0 border-border/80',
              'text-muted-foreground hover:text-brand-500 hover:bg-accent/80',
              'shadow-lg hover:shadow-xl hover:shadow-brand-500/10',
              'transition-all duration-200',
              'hover:w-8 active:scale-95'
            )}
            aria-label="Hide sidebar"
            data-testid="sidebar-mobile-hide"
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
        )}

        <div className="flex-1 flex flex-col overflow-hidden">
          <SidebarHeader
            sidebarOpen={sidebarOpen}
            currentProject={currentProject}
            onClose={toggleSidebar}
            onExpand={toggleSidebar}
          />

          <SidebarNavigation
            currentProject={currentProject}
            sidebarOpen={sidebarOpen}
            navSections={navSections}
            isActiveRoute={isActiveRoute}
            navigate={navigate}
          />
        </div>

        <SidebarFooter
          sidebarOpen={sidebarOpen}
          isActiveRoute={isActiveRoute}
          navigate={navigate}
          hideRunningAgents={hideRunningAgents}
          runningAgentsCount={runningAgentsCount}
          shortcuts={{ settings: shortcuts.settings }}
        />
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

        {/* New Project Setup Dialog */}
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

        {/* Delete Project Confirmation Dialog */}
        <DeleteProjectDialog
          open={showDeleteProjectDialog}
          onOpenChange={setShowDeleteProjectDialog}
          project={currentProject}
          onConfirm={moveProjectToTrash}
        />

        {/* New Project Modal */}
        <NewProjectModal
          open={showNewProjectModal}
          onOpenChange={setShowNewProjectModal}
          onCreateBlankProject={handleCreateBlankProject}
          onCreateFromTemplate={handleCreateFromTemplate}
          onCreateFromCustomUrl={handleCreateFromCustomUrl}
          isCreating={isCreatingProject}
        />
      </aside>
    </>
  );
}
