import { useState, useCallback, useEffect, startTransition } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { useNavigate, useLocation } from '@tanstack/react-router';
import { PanelLeftClose, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { useNotificationsStore } from '@/store/notifications-store';
import { useKeyboardShortcuts, useKeyboardShortcutsConfig } from '@/hooks/use-keyboard-shortcuts';
import { getElectronAPI } from '@/lib/electron';
import { initializeProject, hasAppSpec, hasAutomakerDir } from '@/lib/project-init';
import { toast } from 'sonner';
import { useIsCompact } from '@/hooks/use-media-query';
import type { Project } from '@/lib/electron';

// Sidebar components
import {
  SidebarNavigation,
  CollapseToggleButton,
  MobileSidebarToggle,
  SidebarHeader,
  SidebarFooter,
} from './components';
import { SIDEBAR_FEATURE_FLAGS } from './constants';
import {
  useSidebarAutoCollapse,
  useRunningAgents,
  useSpecRegeneration,
  useNavigation,
  useProjectCreation,
  useSetupDialog,
  useTrashOperations,
  useUnviewedValidations,
} from './hooks';
import { TrashDialog, OnboardingDialog } from './dialogs';

// Reuse dialogs from project-switcher
import { ProjectContextMenu } from '../project-switcher/components/project-context-menu';
import { EditProjectDialog } from '../project-switcher/components/edit-project-dialog';

// Import shared dialogs
import { DeleteProjectDialog } from '@/components/views/settings-view/components/delete-project-dialog';
import { RemoveFromAutomakerDialog } from '@/components/views/settings-view/components/remove-from-automaker-dialog';
import { NewProjectModal } from '@/components/dialogs/new-project-modal';
import { CreateSpecDialog } from '@/components/views/spec-view/dialogs';

const logger = createLogger('Sidebar');

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    projects,
    trashedProjects,
    currentProject,
    sidebarOpen,
    sidebarStyle,
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
    removeProject,
    specCreatingForProject,
    setSpecCreatingForProject,
    setCurrentProject,
  } = useAppStore();

  const isCompact = useIsCompact();

  // Environment variable flags for hiding sidebar items
  const { hideTerminal, hideRunningAgents, hideContext, hideSpecEditor, hideWiki } =
    SIDEBAR_FEATURE_FLAGS;

  // Get customizable keyboard shortcuts
  const shortcuts = useKeyboardShortcutsConfig();

  // Get unread notifications count
  const unreadNotificationsCount = useNotificationsStore((s) => s.unreadCount);

  // State for context menu
  const [contextMenuProject, setContextMenuProject] = useState<Project | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(
    null
  );
  const [editDialogProject, setEditDialogProject] = useState<Project | null>(null);

  // State for delete project confirmation dialog
  const [showDeleteProjectDialog, setShowDeleteProjectDialog] = useState(false);
  // State for remove from automaker confirmation dialog
  const [showRemoveFromAutomakerDialog, setShowRemoveFromAutomakerDialog] = useState(false);

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

  // Auto-collapse sidebar on small screens
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

  // Context menu handlers
  const handleContextMenu = useCallback((project: Project, event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenuProject(project);
    setContextMenuPosition({ x: event.clientX, y: event.clientY });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenuProject(null);
    setContextMenuPosition(null);
  }, []);

  const handleEditProject = useCallback(
    (project: Project) => {
      setEditDialogProject(project);
      handleCloseContextMenu();
    },
    [handleCloseContextMenu]
  );

  /**
   * Opens the system folder selection dialog and initializes the selected project.
   */
  const handleOpenFolder = useCallback(async () => {
    const api = getElectronAPI();
    const result = await api.openDirectory();

    if (!result.canceled && result.filePaths[0]) {
      const path = result.filePaths[0];
      const name = path.split(/[/\\]/).filter(Boolean).pop() || 'Untitled Project';

      try {
        const hadAutomakerDir = await hasAutomakerDir(path);
        const initResult = await initializeProject(path);

        if (!initResult.success) {
          toast.error('Failed to initialize project', {
            description: initResult.error || 'Unknown error occurred',
          });
          return;
        }

        upsertAndSetCurrentProject(path, name);
        const specExists = await hasAppSpec(path);

        if (!hadAutomakerDir && !specExists) {
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

        navigate({ to: '/board' });
      } catch (error) {
        logger.error('Failed to open project:', error);
        toast.error('Failed to open project', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }, [upsertAndSetCurrentProject, navigate, setSetupProjectPath, setShowSetupDialog]);

  const handleNewProject = useCallback(() => {
    setShowNewProjectModal(true);
  }, [setShowNewProjectModal]);

  // Navigation sections and keyboard shortcuts
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

  const switchProjectSafely = useCallback(
    async (targetProject: Project) => {
      // Ensure .automaker directory structure exists before switching
      const initResult = await initializeProject(targetProject.path);
      if (!initResult.success) {
        logger.error('Failed to initialize project during switch:', initResult.error);
        toast.warning(
          `Could not fully initialize project: ${initResult.error ?? 'Unknown error'}. Some features may not work correctly.`
        );
        // Continue with switch despite init failure — project may already be partially initialized
      }

      // Batch project switch + navigation to prevent multi-render cascades.
      startTransition(() => {
        setCurrentProject(targetProject);
        navigate({ to: '/board' });
      });
    },
    [setCurrentProject, navigate]
  );

  // Keyboard shortcuts for project switching (1-9, 0)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      const key = event.key;
      let projectIndex: number | null = null;

      if (key >= '1' && key <= '9') {
        projectIndex = parseInt(key, 10) - 1;
      } else if (key === '0') {
        projectIndex = 9;
      }

      if (projectIndex !== null && projectIndex < projects.length) {
        const targetProject = projects[projectIndex];
        if (targetProject && targetProject.id !== currentProject?.id) {
          void switchProjectSafely(targetProject);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [projects, currentProject, switchProjectSafely]);

  const isActiveRoute = (id: string) => {
    const routePath = id === 'welcome' ? '/' : `/${id}`;
    return location.pathname === routePath;
  };

  // Track if nav can scroll down
  const [canScrollDown, setCanScrollDown] = useState(false);

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
          // Width based on state
          !shouldHideSidebar &&
            (sidebarOpen
              ? 'fixed inset-y-0 left-0 w-[17rem] lg:relative lg:w-[17rem]'
              : 'relative w-14')
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
          {/* Only show header in unified mode - in discord mode, ProjectSwitcher has the logo */}
          {sidebarStyle === 'unified' && (
            <SidebarHeader
              sidebarOpen={sidebarOpen}
              currentProject={currentProject}
              onNewProject={handleNewProject}
              onOpenFolder={handleOpenFolder}
              onProjectContextMenu={handleContextMenu}
              setShowRemoveFromAutomakerDialog={setShowRemoveFromAutomakerDialog}
            />
          )}

          <SidebarNavigation
            currentProject={currentProject}
            sidebarOpen={sidebarOpen}
            sidebarStyle={sidebarStyle}
            navSections={navSections}
            isActiveRoute={isActiveRoute}
            navigate={navigate}
            onScrollStateChange={setCanScrollDown}
          />
        </div>

        {/* Scroll indicator - shows there's more content below */}
        {canScrollDown && (
          <div
            className={cn(
              'relative flex justify-center py-2 border-t border-border/30',
              'bg-gradient-to-t from-background via-background/95 to-transparent',
              '-mt-8 pt-8',
              'pointer-events-none'
            )}
          >
            <div className="pointer-events-auto flex flex-col items-center gap-0.5">
              <ChevronDown
                className={cn(
                  'w-4 h-4 text-brand-500/70 animate-bounce',
                  sidebarOpen ? 'block' : 'w-3 h-3'
                )}
              />
              {sidebarOpen && (
                <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wide">
                  Scroll
                </span>
              )}
            </div>
          </div>
        )}

        <SidebarFooter
          sidebarOpen={sidebarOpen}
          isActiveRoute={isActiveRoute}
          navigate={navigate}
          hideRunningAgents={hideRunningAgents}
          hideWiki={hideWiki}
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

        {/* Remove from Automaker Confirmation Dialog */}
        <RemoveFromAutomakerDialog
          open={showRemoveFromAutomakerDialog}
          onOpenChange={setShowRemoveFromAutomakerDialog}
          project={currentProject}
          onConfirm={removeProject}
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

      {/* Context Menu */}
      {contextMenuProject && contextMenuPosition && (
        <ProjectContextMenu
          project={contextMenuProject}
          position={contextMenuPosition}
          onClose={handleCloseContextMenu}
          onEdit={handleEditProject}
        />
      )}

      {/* Edit Project Dialog */}
      {editDialogProject && (
        <EditProjectDialog
          project={editDialogProject}
          open={!!editDialogProject}
          onOpenChange={(open) => !open && setEditDialogProject(null)}
        />
      )}
    </>
  );
}
