import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/app-store';
import { Settings, FolderOpen, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProjectIdentitySection } from './project-identity-section';
import { ProjectThemeSection } from './project-theme-section';
import { WorktreePreferencesSection } from './worktree-preferences-section';
import { ProjectModelsSection } from './project-models-section';
import { DangerZoneSection } from '../settings-view/danger-zone/danger-zone-section';
import { DeleteProjectDialog } from '../settings-view/components/delete-project-dialog';
import { ProjectSettingsNavigation } from './components/project-settings-navigation';
import { useProjectSettingsView } from './hooks/use-project-settings-view';
import type { Project as ElectronProject } from '@/lib/electron';

// Breakpoint constant for mobile (matches Tailwind lg breakpoint)
const LG_BREAKPOINT = 1024;

// Convert to the shared types used by components
interface SettingsProject {
  id: string;
  name: string;
  path: string;
  theme?: string;
  icon?: string;
  customIconPath?: string;
}

export function ProjectSettingsView() {
  const { currentProject, moveProjectToTrash } = useAppStore();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Use project settings view navigation hook
  const { activeView, navigateTo } = useProjectSettingsView();

  // Mobile navigation state - default to showing on desktop, hidden on mobile
  const [showNavigation, setShowNavigation] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= LG_BREAKPOINT;
    }
    return true;
  });

  // Auto-close navigation on mobile when a section is selected
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < LG_BREAKPOINT) {
      setShowNavigation(false);
    }
  }, [activeView]);

  // Handle window resize to show/hide navigation appropriately
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= LG_BREAKPOINT) {
        setShowNavigation(true);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Convert electron Project to settings-view Project type
  const convertProject = (project: ElectronProject | null): SettingsProject | null => {
    if (!project) return null;
    return {
      id: project.id,
      name: project.name,
      path: project.path,
      theme: project.theme,
      icon: project.icon,
      customIconPath: project.customIconPath,
    };
  };

  const settingsProject = convertProject(currentProject);

  // Render the active section based on current view
  const renderActiveSection = () => {
    if (!currentProject) return null;

    switch (activeView) {
      case 'identity':
        return <ProjectIdentitySection project={currentProject} />;
      case 'theme':
        return <ProjectThemeSection project={currentProject} />;
      case 'worktrees':
        return <WorktreePreferencesSection project={currentProject} />;
      case 'claude':
        return <ProjectModelsSection project={currentProject} />;
      case 'danger':
        return (
          <DangerZoneSection
            project={settingsProject}
            onDeleteClick={() => setShowDeleteDialog(true)}
          />
        );
      default:
        return <ProjectIdentitySection project={currentProject} />;
    }
  };

  // Show message if no project is selected
  if (!currentProject) {
    return (
      <div
        className="flex-1 flex flex-col overflow-hidden content-bg"
        data-testid="project-settings-view"
      >
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted/50 flex items-center justify-center">
              <FolderOpen className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">No Project Selected</h2>
            <p className="text-sm text-muted-foreground">
              Select a project from the sidebar to configure project-specific settings.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden content-bg"
      data-testid="project-settings-view"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-glass backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Settings className="w-5 h-5 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-bold">Project Settings</h1>
            <p className="text-sm text-muted-foreground">
              Configure settings for {currentProject.name}
            </p>
          </div>
        </div>
        {/* Mobile menu button - far right */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowNavigation(!showNavigation)}
          className="lg:hidden h-8 w-8 p-0"
          aria-label={showNavigation ? 'Close navigation menu' : 'Open navigation menu'}
        >
          {showNavigation ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </Button>
      </div>

      {/* Content Area with Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Side Navigation */}
        <ProjectSettingsNavigation
          activeSection={activeView}
          onNavigate={navigateTo}
          isOpen={showNavigation}
          onClose={() => setShowNavigation(false)}
        />

        {/* Content Panel - Shows only the active section */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="max-w-4xl mx-auto">{renderActiveSection()}</div>
        </div>
      </div>

      {/* Delete Project Confirmation Dialog */}
      <DeleteProjectDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        project={currentProject}
        onConfirm={moveProjectToTrash}
      />
    </div>
  );
}
