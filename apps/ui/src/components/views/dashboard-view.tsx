import { useState, useCallback } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { useNavigate } from '@tanstack/react-router';
import { useAppStore, type ThemeMode } from '@/store/app-store';
import { useOSDetection } from '@/hooks/use-os-detection';
import { getElectronAPI, isElectron } from '@/lib/electron';
import { initializeProject } from '@/lib/project-init';
import { getHttpApiClient } from '@/lib/http-api-client';
import { isMac } from '@/lib/utils';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { NewProjectModal } from '@/components/dialogs/new-project-modal';
import { WorkspacePickerModal } from '@/components/dialogs/workspace-picker-modal';
import type { StarterTemplate } from '@/lib/templates';
import {
  FolderOpen,
  Plus,
  Folder,
  Star,
  Clock,
  Loader2,
  ChevronDown,
  MessageSquare,
  Settings,
  MoreVertical,
  Trash2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const logger = createLogger('DashboardView');

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

export function DashboardView() {
  const navigate = useNavigate();
  const { os } = useOSDetection();
  const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
  const appMode = import.meta.env.VITE_APP_MODE || '?';
  const versionSuffix = `${getOSAbbreviation(os)}${appMode}`;

  const {
    projects,
    trashedProjects,
    currentProject,
    upsertAndSetCurrentProject,
    addProject,
    setCurrentProject,
    toggleProjectFavorite,
    moveProjectToTrash,
    theme: globalTheme,
  } = useAppStore();

  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [projectToRemove, setProjectToRemove] = useState<{ id: string; name: string } | null>(null);

  // Sort projects: favorites first, then by last opened
  const sortedProjects = [...projects].sort((a, b) => {
    // Favorites first
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    // Then by last opened
    const dateA = a.lastOpened ? new Date(a.lastOpened).getTime() : 0;
    const dateB = b.lastOpened ? new Date(b.lastOpened).getTime() : 0;
    return dateB - dateA;
  });

  const favoriteProjects = sortedProjects.filter((p) => p.isFavorite);
  const recentProjects = sortedProjects.filter((p) => !p.isFavorite);

  /**
   * Initialize project and navigate to board
   */
  const initializeAndOpenProject = useCallback(
    async (path: string, name: string) => {
      setIsOpening(true);
      try {
        const initResult = await initializeProject(path);

        if (!initResult.success) {
          toast.error('Failed to initialize project', {
            description: initResult.error || 'Unknown error occurred',
          });
          return;
        }

        const trashedProject = trashedProjects.find((p) => p.path === path);
        const effectiveTheme =
          (trashedProject?.theme as ThemeMode | undefined) ||
          (currentProject?.theme as ThemeMode | undefined) ||
          globalTheme;
        upsertAndSetCurrentProject(path, name, effectiveTheme);

        toast.success('Project opened', {
          description: `Opened ${name}`,
        });

        navigate({ to: '/board' });
      } catch (error) {
        logger.error('[Dashboard] Failed to open project:', error);
        toast.error('Failed to open project', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        setIsOpening(false);
      }
    },
    [trashedProjects, currentProject, globalTheme, upsertAndSetCurrentProject, navigate]
  );

  const handleOpenProject = useCallback(async () => {
    try {
      const httpClient = getHttpApiClient();
      const configResult = await httpClient.workspace.getConfig();

      if (configResult.success && configResult.configured) {
        setShowWorkspacePicker(true);
      } else {
        const api = getElectronAPI();
        const result = await api.openDirectory();

        if (!result.canceled && result.filePaths[0]) {
          const path = result.filePaths[0];
          const name = path.split(/[/\\]/).filter(Boolean).pop() || 'Untitled Project';
          await initializeAndOpenProject(path, name);
        }
      }
    } catch (error) {
      logger.error('[Dashboard] Failed to check workspace config:', error);
      const api = getElectronAPI();
      const result = await api.openDirectory();

      if (!result.canceled && result.filePaths[0]) {
        const path = result.filePaths[0];
        const name = path.split(/[/\\]/).filter(Boolean).pop() || 'Untitled Project';
        await initializeAndOpenProject(path, name);
      }
    }
  }, [initializeAndOpenProject]);

  const handleWorkspaceSelect = useCallback(
    async (path: string, name: string) => {
      setShowWorkspacePicker(false);
      await initializeAndOpenProject(path, name);
    },
    [initializeAndOpenProject]
  );

  const handleProjectClick = useCallback(
    async (project: { id: string; name: string; path: string }) => {
      await initializeAndOpenProject(project.path, project.name);
    },
    [initializeAndOpenProject]
  );

  const handleToggleFavorite = useCallback(
    (e: React.MouseEvent, projectId: string) => {
      e.stopPropagation();
      toggleProjectFavorite(projectId);
    },
    [toggleProjectFavorite]
  );

  const handleRemoveProject = useCallback(
    (e: React.MouseEvent, project: { id: string; name: string }) => {
      e.stopPropagation();
      setProjectToRemove(project);
    },
    []
  );

  const handleConfirmRemove = useCallback(() => {
    if (projectToRemove) {
      moveProjectToTrash(projectToRemove.id);
      toast.success('Project removed', {
        description: `${projectToRemove.name} has been removed from your projects list`,
      });
      setProjectToRemove(null);
    }
  }, [projectToRemove, moveProjectToTrash]);

  const handleNewProject = () => {
    setShowNewProjectModal(true);
  };

  const handleInteractiveMode = () => {
    navigate({ to: '/interview' });
  };

  const handleCreateBlankProject = async (projectName: string, parentDir: string) => {
    setIsCreating(true);
    try {
      const api = getElectronAPI();
      const projectPath = `${parentDir}/${projectName}`;

      const parentExists = await api.exists(parentDir);
      if (!parentExists) {
        toast.error('Parent directory does not exist', {
          description: `Cannot create project in non-existent directory: ${parentDir}`,
        });
        return;
      }

      const parentStat = await api.stat(parentDir);
      if (parentStat && !parentStat.stats?.isDirectory) {
        toast.error('Parent path is not a directory', {
          description: `${parentDir} is not a directory`,
        });
        return;
      }

      const mkdirResult = await api.mkdir(projectPath);
      if (!mkdirResult.success) {
        toast.error('Failed to create project directory', {
          description: mkdirResult.error || 'Unknown error occurred',
        });
        return;
      }

      const initResult = await initializeProject(projectPath);
      if (!initResult.success) {
        toast.error('Failed to initialize project', {
          description: initResult.error || 'Unknown error occurred',
        });
        return;
      }

      await api.writeFile(
        `${projectPath}/.automaker/app_spec.txt`,
        `<project_specification>
  <project_name>${projectName}</project_name>

  <overview>
    Describe your project here. This file will be analyzed by an AI agent
    to understand your project structure and tech stack.
  </overview>

  <technology_stack>
    <!-- The AI agent will fill this in after analyzing your project -->
  </technology_stack>

  <core_capabilities>
    <!-- List core features and capabilities -->
  </core_capabilities>

  <implemented_features>
    <!-- The AI agent will populate this based on code analysis -->
  </implemented_features>
</project_specification>`
      );

      const project = {
        id: `project-${Date.now()}`,
        name: projectName,
        path: projectPath,
        lastOpened: new Date().toISOString(),
      };

      addProject(project);
      setCurrentProject(project);
      setShowNewProjectModal(false);

      toast.success('Project created', {
        description: `Created ${projectName}`,
      });

      navigate({ to: '/board' });
    } catch (error) {
      logger.error('Failed to create project:', error);
      toast.error('Failed to create project', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateFromTemplate = async (
    template: StarterTemplate,
    projectName: string,
    parentDir: string
  ) => {
    setIsCreating(true);
    try {
      const httpClient = getHttpApiClient();
      const api = getElectronAPI();

      const cloneResult = await httpClient.templates.clone(
        template.repoUrl,
        projectName,
        parentDir
      );
      if (!cloneResult.success || !cloneResult.projectPath) {
        toast.error('Failed to clone template', {
          description: cloneResult.error || 'Unknown error occurred',
        });
        return;
      }

      const projectPath = cloneResult.projectPath;
      const initResult = await initializeProject(projectPath);
      if (!initResult.success) {
        toast.error('Failed to initialize project', {
          description: initResult.error || 'Unknown error occurred',
        });
        return;
      }

      await api.writeFile(
        `${projectPath}/.automaker/app_spec.txt`,
        `<project_specification>
  <project_name>${projectName}</project_name>

  <overview>
    This project was created from the "${template.name}" starter template.
    ${template.description}
  </overview>

  <technology_stack>
    ${template.techStack.map((tech) => `<technology>${tech}</technology>`).join('\n    ')}
  </technology_stack>

  <core_capabilities>
    ${template.features.map((feature) => `<capability>${feature}</capability>`).join('\n    ')}
  </core_capabilities>

  <implemented_features>
    <!-- The AI agent will populate this based on code analysis -->
  </implemented_features>
</project_specification>`
      );

      const project = {
        id: `project-${Date.now()}`,
        name: projectName,
        path: projectPath,
        lastOpened: new Date().toISOString(),
      };

      addProject(project);
      setCurrentProject(project);
      setShowNewProjectModal(false);

      toast.success('Project created from template', {
        description: `Created ${projectName} from ${template.name}`,
      });

      navigate({ to: '/board' });
    } catch (error) {
      logger.error('Failed to create project from template:', error);
      toast.error('Failed to create project', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateFromCustomUrl = async (
    repoUrl: string,
    projectName: string,
    parentDir: string
  ) => {
    setIsCreating(true);
    try {
      const httpClient = getHttpApiClient();
      const api = getElectronAPI();

      const cloneResult = await httpClient.templates.clone(repoUrl, projectName, parentDir);
      if (!cloneResult.success || !cloneResult.projectPath) {
        toast.error('Failed to clone repository', {
          description: cloneResult.error || 'Unknown error occurred',
        });
        return;
      }

      const projectPath = cloneResult.projectPath;
      const initResult = await initializeProject(projectPath);
      if (!initResult.success) {
        toast.error('Failed to initialize project', {
          description: initResult.error || 'Unknown error occurred',
        });
        return;
      }

      await api.writeFile(
        `${projectPath}/.automaker/app_spec.txt`,
        `<project_specification>
  <project_name>${projectName}</project_name>

  <overview>
    This project was cloned from ${repoUrl}.
    The AI agent will analyze the project structure.
  </overview>

  <technology_stack>
    <!-- The AI agent will fill this in after analyzing your project -->
  </technology_stack>

  <core_capabilities>
    <!-- List core features and capabilities -->
  </core_capabilities>

  <implemented_features>
    <!-- The AI agent will populate this based on code analysis -->
  </implemented_features>
</project_specification>`
      );

      const project = {
        id: `project-${Date.now()}`,
        name: projectName,
        path: projectPath,
        lastOpened: new Date().toISOString(),
      };

      addProject(project);
      setCurrentProject(project);
      setShowNewProjectModal(false);

      toast.success('Project created from repository', {
        description: `Created ${projectName}`,
      });

      navigate({ to: '/board' });
    } catch (error) {
      logger.error('Failed to create project from custom URL:', error);
      toast.error('Failed to create project', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const hasProjects = projects.length > 0;

  return (
    <div className="flex-1 flex flex-col h-screen content-bg" data-testid="dashboard-view">
      {/* Header with logo */}
      <header className="shrink-0 border-b border-border bg-glass backdrop-blur-md">
        {/* Electron titlebar drag region */}
        {isElectron() && (
          <div
            className={`absolute top-0 left-0 right-0 h-6 titlebar-drag-region z-40 pointer-events-none ${isMac ? 'pl-20' : ''}`}
            aria-hidden="true"
          />
        )}
        <div className="px-8 py-4 flex items-center justify-between">
          <div
            className="flex items-center gap-3 cursor-pointer group titlebar-no-drag"
            onClick={() => navigate({ to: '/dashboard' })}
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
                  id="bg-dashboard"
                  x1="0"
                  y1="0"
                  x2="256"
                  y2="256"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" style={{ stopColor: 'var(--brand-400)' }} />
                  <stop offset="100%" style={{ stopColor: 'var(--brand-600)' }} />
                </linearGradient>
                <filter id="iconShadow-dashboard" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow
                    dx="0"
                    dy="4"
                    stdDeviation="4"
                    floodColor="#000000"
                    floodOpacity="0.25"
                  />
                </filter>
              </defs>
              <rect x="16" y="16" width="224" height="224" rx="56" fill="url(#bg-dashboard)" />
              <g
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="20"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#iconShadow-dashboard)"
              >
                <path d="M92 92 L52 128 L92 164" />
                <path d="M144 72 L116 184" />
                <path d="M164 92 L204 128 L164 164" />
              </g>
            </svg>
            <div className="flex flex-col">
              <span className="font-bold text-foreground text-2xl tracking-tight leading-none">
                automaker<span className="text-brand-500">.</span>
              </span>
              <span className="text-xs text-muted-foreground leading-none font-medium mt-1">
                v{appVersion} {versionSuffix}
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ to: '/settings' })}
            className="titlebar-no-drag"
          >
            <Settings className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-6xl mx-auto">
          {/* No projects - show getting started */}
          {!hasProjects && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold text-foreground mb-3">Welcome to Automaker</h2>
                <p className="text-lg text-muted-foreground max-w-xl mx-auto">
                  Your autonomous AI development studio. Get started by creating a new project or
                  opening an existing one.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
                {/* New Project Card */}
                <div
                  className="group relative rounded-xl border border-border bg-card/80 backdrop-blur-sm hover:bg-card hover:border-brand-500/30 hover:shadow-xl hover:shadow-brand-500/5 transition-all duration-300 hover:-translate-y-1"
                  data-testid="new-project-card"
                >
                  <div className="absolute inset-0 rounded-xl bg-linear-to-br from-brand-500/5 via-transparent to-purple-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="relative p-6 h-full flex flex-col">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="w-12 h-12 rounded-xl bg-linear-to-br from-brand-500 to-brand-600 shadow-lg shadow-brand-500/25 flex items-center justify-center group-hover:scale-105 group-hover:shadow-brand-500/40 transition-all duration-300 shrink-0">
                        <Plus className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-foreground mb-1.5">
                          New Project
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          Create a new project from scratch with AI-powered development
                        </p>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          className="w-full mt-5 bg-linear-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white border-0 shadow-md shadow-brand-500/20 hover:shadow-brand-500/30 transition-all"
                          data-testid="create-new-project"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Create Project
                          <ChevronDown className="w-4 h-4 ml-2" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem
                          onClick={handleNewProject}
                          data-testid="quick-setup-option"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Quick Setup
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={handleInteractiveMode}
                          data-testid="interactive-mode-option"
                        >
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Interactive Mode
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Open Project Card */}
                <div
                  className="group relative rounded-xl border border-border bg-card/80 backdrop-blur-sm hover:bg-card hover:border-blue-500/30 hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300 cursor-pointer hover:-translate-y-1"
                  onClick={handleOpenProject}
                  data-testid="open-project-card"
                >
                  <div className="absolute inset-0 rounded-xl bg-linear-to-br from-blue-500/5 via-transparent to-cyan-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="relative p-6 h-full flex flex-col">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="w-12 h-12 rounded-xl bg-muted border border-border flex items-center justify-center group-hover:bg-blue-500/10 group-hover:border-blue-500/30 group-hover:scale-105 transition-all duration-300 shrink-0">
                        <FolderOpen className="w-6 h-6 text-muted-foreground group-hover:text-blue-500 transition-colors duration-300" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-foreground mb-1.5">
                          Open Project
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          Open an existing project folder to continue working
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      className="w-full mt-5 bg-secondary/80 hover:bg-secondary text-foreground border border-border hover:border-blue-500/30 transition-all"
                      data-testid="open-existing-project"
                    >
                      <FolderOpen className="w-4 h-4 mr-2" />
                      Browse Folder
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Has projects - show project list */}
          {hasProjects && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Quick actions header */}
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-foreground">Your Projects</h2>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleOpenProject}>
                    <FolderOpen className="w-4 h-4 mr-2" />
                    Open Folder
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button className="bg-linear-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white">
                        <Plus className="w-4 h-4 mr-2" />
                        New Project
                        <ChevronDown className="w-4 h-4 ml-2" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem onClick={handleNewProject}>
                        <Plus className="w-4 h-4 mr-2" />
                        Quick Setup
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleInteractiveMode}>
                        <MessageSquare className="w-4 h-4 mr-2" />
                        Interactive Mode
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Favorites section */}
              {favoriteProjects.length > 0 && (
                <div>
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                      <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">Favorites</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {favoriteProjects.map((project) => (
                      <div
                        key={project.id}
                        className="group relative rounded-xl border border-yellow-500/30 bg-card/60 backdrop-blur-sm hover:bg-card hover:border-yellow-500/50 hover:shadow-lg hover:shadow-yellow-500/5 transition-all duration-300 cursor-pointer hover:-translate-y-0.5"
                        onClick={() => handleProjectClick(project)}
                        data-testid={`project-card-${project.id}`}
                      >
                        <div className="absolute inset-0 rounded-xl bg-linear-to-br from-yellow-500/5 to-amber-600/5 opacity-0 group-hover:opacity-100 transition-all duration-300" />
                        <div className="relative p-4">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center group-hover:bg-yellow-500/20 transition-all duration-300 shrink-0">
                              <Folder className="w-5 h-5 text-yellow-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-foreground truncate group-hover:text-yellow-500 transition-colors duration-300">
                                {project.name}
                              </p>
                              <p className="text-xs text-muted-foreground/70 truncate mt-1">
                                {project.path}
                              </p>
                              {project.lastOpened && (
                                <p className="text-xs text-muted-foreground mt-1.5">
                                  {new Date(project.lastOpened).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => handleToggleFavorite(e, project.id)}
                                className="p-1.5 rounded-lg hover:bg-yellow-500/20 transition-colors"
                                title="Remove from favorites"
                              >
                                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                              </button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    onClick={(e) => e.stopPropagation()}
                                    className="p-1.5 rounded-lg hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
                                    title="More options"
                                  >
                                    <MoreVertical className="w-4 h-4 text-muted-foreground" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={(e) => handleRemoveProject(e, project)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Remove from Automaker
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent projects section */}
              {recentProjects.length > 0 && (
                <div>
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">Recent Projects</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {recentProjects.map((project) => (
                      <div
                        key={project.id}
                        className="group relative rounded-xl border border-border bg-card/60 backdrop-blur-sm hover:bg-card hover:border-brand-500/40 hover:shadow-lg hover:shadow-brand-500/5 transition-all duration-300 cursor-pointer hover:-translate-y-0.5"
                        onClick={() => handleProjectClick(project)}
                        data-testid={`project-card-${project.id}`}
                      >
                        <div className="absolute inset-0 rounded-xl bg-linear-to-br from-brand-500/0 to-purple-600/0 group-hover:from-brand-500/5 group-hover:to-purple-600/5 transition-all duration-300" />
                        <div className="relative p-4">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-lg bg-muted/80 border border-border flex items-center justify-center group-hover:bg-brand-500/10 group-hover:border-brand-500/30 transition-all duration-300 shrink-0">
                              <Folder className="w-5 h-5 text-muted-foreground group-hover:text-brand-500 transition-colors duration-300" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-foreground truncate group-hover:text-brand-500 transition-colors duration-300">
                                {project.name}
                              </p>
                              <p className="text-xs text-muted-foreground/70 truncate mt-1">
                                {project.path}
                              </p>
                              {project.lastOpened && (
                                <p className="text-xs text-muted-foreground mt-1.5">
                                  {new Date(project.lastOpened).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => handleToggleFavorite(e, project.id)}
                                className="p-1.5 rounded-lg hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
                                title="Add to favorites"
                              >
                                <Star className="w-4 h-4 text-muted-foreground hover:text-yellow-500" />
                              </button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    onClick={(e) => e.stopPropagation()}
                                    className="p-1.5 rounded-lg hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
                                    title="More options"
                                  >
                                    <MoreVertical className="w-4 h-4 text-muted-foreground" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={(e) => handleRemoveProject(e, project)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Remove from Automaker
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <NewProjectModal
        open={showNewProjectModal}
        onOpenChange={setShowNewProjectModal}
        onCreateBlankProject={handleCreateBlankProject}
        onCreateFromTemplate={handleCreateFromTemplate}
        onCreateFromCustomUrl={handleCreateFromCustomUrl}
        isCreating={isCreating}
      />

      <WorkspacePickerModal
        open={showWorkspacePicker}
        onOpenChange={setShowWorkspacePicker}
        onSelect={handleWorkspaceSelect}
      />

      {/* Remove project confirmation dialog */}
      <Dialog open={!!projectToRemove} onOpenChange={(open) => !open && setProjectToRemove(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove <strong>{projectToRemove?.name}</strong> from
              Automaker?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              This will only remove the project from your Automaker projects list. The project files
              on your computer will not be deleted.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectToRemove(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmRemove}>
              <Trash2 className="w-4 h-4 mr-2" />
              Remove Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Loading overlay */}
      {isOpening && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          data-testid="project-opening-overlay"
        >
          <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-card border border-border shadow-2xl">
            <Loader2 className="w-10 h-10 text-brand-500 animate-spin" />
            <p className="text-foreground font-medium">Opening project...</p>
          </div>
        </div>
      )}
    </div>
  );
}
