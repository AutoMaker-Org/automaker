import { useState, useCallback, useEffect } from 'react';
import { Plus, Bug, FolderOpen, BookOpen } from 'lucide-react';
import { useNavigate, useLocation } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { useOSDetection } from '@/hooks/use-os-detection';
import { ProjectSwitcherItem } from './components/project-switcher-item';
import { ProjectContextMenu } from './components/project-context-menu';
import { EditProjectDialog } from './components/edit-project-dialog';
import { NotificationBell } from './components/notification-bell';
import { NewProjectModal } from '@/components/dialogs/new-project-modal';
import { OnboardingDialog } from '@/components/layout/sidebar/dialogs';
import { useProjectCreation } from '@/components/layout/sidebar/hooks';
import { SIDEBAR_FEATURE_FLAGS } from '@/components/layout/sidebar/constants';
import type { Project } from '@/lib/electron';
import { getElectronAPI } from '@/lib/electron';
import { initializeProject, hasAppSpec, hasAutomakerDir } from '@/lib/project-init';
import { toast } from 'sonner';
import { CreateSpecDialog } from '@/components/views/spec-view/dialogs';
import type { FeatureCount } from '@/components/views/spec-view/types';

function getOSAbbreviation(os: string): string {
  switch (os) {
    case 'mac':
      return 'M';
    case 'windows':
      return 'W';
    case 'linux':
      return 'L';
    default:
      return '?';
  }
}

export function ProjectSwitcher() {
  const navigate = useNavigate();
  const location = useLocation();
  const { hideWiki } = SIDEBAR_FEATURE_FLAGS;
  const isWikiActive = location.pathname === '/wiki';
  const {
    projects,
    currentProject,
    setCurrentProject,
    upsertAndSetCurrentProject,
    specCreatingForProject,
    setSpecCreatingForProject,
  } = useAppStore();
  const [contextMenuProject, setContextMenuProject] = useState<Project | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(
    null
  );
  const [editDialogProject, setEditDialogProject] = useState<Project | null>(null);

  // Setup dialog state for opening existing projects
  const [showSetupDialog, setShowSetupDialog] = useState(false);
  const [setupProjectPath, setSetupProjectPath] = useState<string | null>(null);
  const [projectOverview, setProjectOverview] = useState('');
  const [generateFeatures, setGenerateFeatures] = useState(true);
  const [analyzeProject, setAnalyzeProject] = useState(true);
  const [featureCount, setFeatureCount] = useState<FeatureCount>(50);

  // Derive isCreatingSpec from store state
  const isCreatingSpec = specCreatingForProject !== null;

  // Version info
  const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
  const { os } = useOSDetection();
  const appMode = import.meta.env.VITE_APP_MODE || '?';
  const versionSuffix = `${getOSAbbreviation(os)}${appMode}`;

  // Project creation state and handlers
  const {
    showNewProjectModal,
    setShowNewProjectModal,
    isCreatingProject,
    showOnboardingDialog,
    setShowOnboardingDialog,
    newProjectName,
    handleCreateBlankProject,
    handleCreateFromTemplate,
    handleCreateFromCustomUrl,
  } = useProjectCreation({
    upsertAndSetCurrentProject,
  });

  const handleContextMenu = (project: Project, event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenuProject(project);
    setContextMenuPosition({ x: event.clientX, y: event.clientY });
  };

  const handleCloseContextMenu = () => {
    setContextMenuProject(null);
    setContextMenuPosition(null);
  };

  const handleEditProject = (project: Project) => {
    setEditDialogProject(project);
    handleCloseContextMenu();
  };

  const handleProjectClick = useCallback(
    (project: Project) => {
      setCurrentProject(project);
      // Navigate to board view when switching projects
      navigate({ to: '/board' });
    },
    [setCurrentProject, navigate]
  );

  const handleNewProject = () => {
    // Open the new project modal
    setShowNewProjectModal(true);
  };

  const handleOnboardingSkip = () => {
    setShowOnboardingDialog(false);
    navigate({ to: '/board' });
  };

  const handleBugReportClick = useCallback(() => {
    const api = getElectronAPI();
    api.openExternalLink('https://github.com/AutoMaker-Org/automaker/issues');
  }, []);

  const handleWikiClick = useCallback(() => {
    navigate({ to: '/wiki' });
  }, [navigate]);

  /**
   * Opens the system folder selection dialog and initializes the selected project.
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

        // Navigate to board view
        navigate({ to: '/board' });
      } catch (error) {
        console.error('Failed to open project:', error);
        toast.error('Failed to open project', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }, [upsertAndSetCurrentProject, navigate]);

  // Handler for creating initial spec from the setup dialog
  const handleCreateInitialSpec = useCallback(async () => {
    if (!setupProjectPath) return;

    setSpecCreatingForProject(setupProjectPath);
    setShowSetupDialog(false);

    try {
      const api = getElectronAPI();
      if (!api.specRegeneration) {
        toast.error('Spec regeneration not available');
        setSpecCreatingForProject(null);
        return;
      }
      await api.specRegeneration.create(
        setupProjectPath,
        projectOverview,
        generateFeatures,
        analyzeProject,
        featureCount
      );
    } catch (error) {
      console.error('Failed to generate spec:', error);
      toast.error('Failed to generate spec', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
      setSpecCreatingForProject(null);
    }
  }, [
    setupProjectPath,
    projectOverview,
    generateFeatures,
    analyzeProject,
    featureCount,
    setSpecCreatingForProject,
  ]);

  const handleSkipSetup = useCallback(() => {
    setShowSetupDialog(false);
    setSetupProjectPath(null);
  }, []);

  // Keyboard shortcuts for project switching (1-9, 0)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if user is typing in an input, textarea, or contenteditable
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Ignore if modifier keys are pressed (except for standalone number keys)
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      // Map key to project index: "1" -> 0, "2" -> 1, ..., "9" -> 8, "0" -> 9
      const key = event.key;
      let projectIndex: number | null = null;

      if (key >= '1' && key <= '9') {
        projectIndex = parseInt(key, 10) - 1; // "1" -> 0, "9" -> 8
      } else if (key === '0') {
        projectIndex = 9; // "0" -> 9
      }

      if (projectIndex !== null && projectIndex < projects.length) {
        const targetProject = projects[projectIndex];
        if (targetProject && targetProject.id !== currentProject?.id) {
          handleProjectClick(targetProject);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [projects, currentProject, handleProjectClick]);

  return (
    <>
      <aside
        className={cn(
          'flex-shrink-0 flex flex-col w-16 z-50 relative',
          // Glass morphism background with gradient
          'bg-gradient-to-b from-sidebar/95 via-sidebar/85 to-sidebar/90 backdrop-blur-2xl',
          // Premium border with subtle glow
          'border-r border-border/60 shadow-[1px_0_20px_-5px_rgba(0,0,0,0.1)]'
        )}
        data-testid="project-switcher"
      >
        {/* Automaker Logo and Version */}
        <div className="flex flex-col items-center pt-3 pb-2 px-2">
          <button
            onClick={() => navigate({ to: '/dashboard' })}
            className="group flex flex-col items-center gap-0.5"
            title="Go to Dashboard"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 256 256"
              role="img"
              aria-label="Automaker Logo"
              className="size-10 group-hover:rotate-12 transition-transform duration-300 ease-out"
            >
              <defs>
                <linearGradient
                  id="bg-switcher"
                  x1="0"
                  y1="0"
                  x2="256"
                  y2="256"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" style={{ stopColor: 'var(--brand-400)' }} />
                  <stop offset="100%" style={{ stopColor: 'var(--brand-600)' }} />
                </linearGradient>
              </defs>
              <rect x="16" y="16" width="224" height="224" rx="56" fill="url(#bg-switcher)" />
              <g
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="20"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M92 92 L52 128 L92 164" />
                <path d="M144 72 L116 184" />
                <path d="M164 92 L204 128 L164 164" />
              </g>
            </svg>
            <span className="text-[0.625rem] text-muted-foreground leading-none font-medium">
              v{appVersion} {versionSuffix}
            </span>
          </button>

          {/* Notification Bell */}
          <div className="flex justify-center mt-2">
            <NotificationBell projectPath={currentProject?.path ?? null} />
          </div>
          <div className="w-full h-px bg-border mt-3" />
        </div>

        {/* Projects List */}
        <div className="flex-1 overflow-y-auto pt-1 pb-3 px-2 space-y-2">
          {projects.map((project, index) => (
            <ProjectSwitcherItem
              key={project.id}
              project={project}
              isActive={currentProject?.id === project.id}
              hotkeyIndex={index < 10 ? index : undefined}
              onClick={() => handleProjectClick(project)}
              onContextMenu={(e) => handleContextMenu(project, e)}
            />
          ))}

          {/* Horizontal rule and Add Project Button - only show if there are projects */}
          {projects.length > 0 && (
            <>
              <div className="w-full h-px bg-border my-2" />
              <button
                onClick={handleNewProject}
                className={cn(
                  'w-full aspect-square rounded-xl flex items-center justify-center',
                  'transition-all duration-200 ease-out',
                  'text-muted-foreground hover:text-foreground',
                  'hover:bg-accent/50 border border-transparent hover:border-border/40',
                  'hover:shadow-sm hover:scale-105 active:scale-95'
                )}
                title="New Project"
                data-testid="new-project-button"
              >
                <Plus className="w-5 h-5" />
              </button>
              <button
                onClick={handleOpenFolder}
                className={cn(
                  'w-full aspect-square rounded-xl flex items-center justify-center',
                  'transition-all duration-200 ease-out',
                  'text-muted-foreground hover:text-foreground',
                  'hover:bg-accent/50 border border-transparent hover:border-border/40',
                  'hover:shadow-sm hover:scale-105 active:scale-95'
                )}
                title="Open Project"
                data-testid="open-project-button"
              >
                <FolderOpen className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Add Project Button - when no projects, show without rule */}
          {projects.length === 0 && (
            <>
              <button
                onClick={handleNewProject}
                className={cn(
                  'w-full aspect-square rounded-xl flex items-center justify-center',
                  'transition-all duration-200 ease-out',
                  'text-muted-foreground hover:text-foreground',
                  'hover:bg-accent/50 border border-transparent hover:border-border/40',
                  'hover:shadow-sm hover:scale-105 active:scale-95'
                )}
                title="New Project"
                data-testid="new-project-button"
              >
                <Plus className="w-5 h-5" />
              </button>
              <button
                onClick={handleOpenFolder}
                className={cn(
                  'w-full aspect-square rounded-xl flex items-center justify-center',
                  'transition-all duration-200 ease-out',
                  'text-muted-foreground hover:text-foreground',
                  'hover:bg-accent/50 border border-transparent hover:border-border/40',
                  'hover:shadow-sm hover:scale-105 active:scale-95'
                )}
                title="Open Project"
                data-testid="open-project-button"
              >
                <FolderOpen className="w-5 h-5" />
              </button>
            </>
          )}
        </div>

        {/* Wiki and Bug Report Buttons at the very bottom */}
        <div className="p-2 border-t border-border/40 space-y-2">
          {/* Wiki Button */}
          {!hideWiki && (
            <button
              onClick={handleWikiClick}
              className={cn(
                'w-full aspect-square rounded-xl flex items-center justify-center',
                'transition-all duration-200 ease-out',
                isWikiActive
                  ? [
                      'bg-gradient-to-r from-brand-500/20 via-brand-500/15 to-brand-600/10',
                      'text-foreground',
                      'border border-brand-500/30',
                      'shadow-md shadow-brand-500/10',
                    ]
                  : [
                      'text-muted-foreground hover:text-foreground',
                      'hover:bg-accent/50 border border-transparent hover:border-border/40',
                      'hover:shadow-sm hover:scale-105 active:scale-95',
                    ]
              )}
              title="Wiki"
              data-testid="wiki-button"
            >
              <BookOpen
                className={cn('w-5 h-5', isWikiActive && 'text-brand-500 drop-shadow-sm')}
              />
            </button>
          )}
          {/* Bug Report Button */}
          <button
            onClick={handleBugReportClick}
            className={cn(
              'w-full aspect-square rounded-xl flex items-center justify-center',
              'transition-all duration-200 ease-out',
              'text-muted-foreground hover:text-foreground',
              'hover:bg-accent/50 border border-transparent hover:border-border/40',
              'hover:shadow-sm hover:scale-105 active:scale-95'
            )}
            title="Report Bug / Feature Request"
            data-testid="bug-report-button"
          >
            <Bug className="w-5 h-5" />
          </button>
        </div>
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

      {/* New Project Modal */}
      <NewProjectModal
        open={showNewProjectModal}
        onOpenChange={setShowNewProjectModal}
        onCreateBlankProject={handleCreateBlankProject}
        onCreateFromTemplate={handleCreateFromTemplate}
        onCreateFromCustomUrl={handleCreateFromCustomUrl}
        isCreating={isCreatingProject}
      />

      {/* Onboarding Dialog */}
      <OnboardingDialog
        open={showOnboardingDialog}
        onOpenChange={setShowOnboardingDialog}
        newProjectName={newProjectName}
        onSkip={handleOnboardingSkip}
        onGenerateSpec={handleOnboardingSkip}
      />

      {/* Setup Dialog for Open Project */}
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
    </>
  );
}
