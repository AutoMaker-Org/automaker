import { useState, useCallback, startTransition } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ChevronsUpDown, Folder, Plus, FolderOpen, LogOut } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn, isMac } from '@/lib/utils';
import { formatShortcut } from '@/store/app-store';
import { isElectron, type Project } from '@/lib/electron';
import { initializeProject } from '@/lib/project-init';
import { MACOS_ELECTRON_TOP_PADDING_CLASS } from '../constants';
import { getAuthenticatedImageUrl } from '@/lib/api-fetch';
import { useAppStore } from '@/store/app-store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface SidebarHeaderProps {
  sidebarOpen: boolean;
  currentProject: Project | null;
  onNewProject: () => void;
  onOpenFolder: () => void;
  onProjectContextMenu: (project: Project, event: React.MouseEvent) => void;
  setShowRemoveFromAutomakerDialog: (show: boolean) => void;
}

export function SidebarHeader({
  sidebarOpen,
  currentProject,
  onNewProject,
  onOpenFolder,
  onProjectContextMenu,
  setShowRemoveFromAutomakerDialog,
}: SidebarHeaderProps) {
  const navigate = useNavigate();
  const projects = useAppStore((s) => s.projects);
  const setCurrentProject = useAppStore((s) => s.setCurrentProject);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleLogoClick = useCallback(() => {
    navigate({ to: '/overview' });
  }, [navigate]);

  const handleProjectSelect = useCallback(
    async (project: Project) => {
      if (project.id === currentProject?.id) {
        setDropdownOpen(false);
        navigate({ to: '/board' });
        return;
      }
      try {
        // Ensure .automaker directory structure exists before switching
        await initializeProject(project.path);
      } catch (error) {
        console.error('Failed to initialize project during switch:', error);
        // Continue with switch even if initialization fails -
        // the project may already be initialized
      }

      // Batch project switch + navigation to prevent multi-render cascades.
      startTransition(() => {
        setCurrentProject(project);
        setDropdownOpen(false);
        navigate({ to: '/board' });
      });
    },
    [currentProject?.id, setCurrentProject, navigate]
  );

  const getIconComponent = (project: Project): LucideIcon => {
    if (project.icon && project.icon in LucideIcons) {
      return (LucideIcons as unknown as Record<string, LucideIcon>)[project.icon];
    }
    return Folder;
  };

  const renderProjectIcon = (project: Project, size: 'sm' | 'md' = 'md') => {
    const IconComponent = getIconComponent(project);
    const sizeClasses = size === 'sm' ? 'w-6 h-6' : 'w-8 h-8';
    const iconSizeClasses = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';

    if (project.customIconPath) {
      return (
        <img
          src={getAuthenticatedImageUrl(project.customIconPath, project.path)}
          alt={project.name}
          className={cn(sizeClasses, 'rounded-lg object-cover ring-1 ring-border/50')}
        />
      );
    }

    return (
      <div
        className={cn(
          sizeClasses,
          'rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center'
        )}
      >
        <IconComponent className={cn(iconSizeClasses, 'text-brand-500')} />
      </div>
    );
  };

  // Collapsed state - show logo only
  if (!sidebarOpen) {
    return (
      <div
        className={cn(
          'shrink-0 flex flex-col items-center relative px-2 pt-3 pb-2',
          isMac && isElectron() && MACOS_ELECTRON_TOP_PADDING_CLASS
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleLogoClick}
              className="group flex flex-col items-center"
              data-testid="logo-button"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 256 256"
                role="img"
                aria-label="Automaker Logo"
                className="size-8 group-hover:rotate-12 transition-transform duration-300 ease-out"
              >
                <defs>
                  <linearGradient
                    id="bg-collapsed"
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
                <rect x="16" y="16" width="224" height="224" rx="56" fill="url(#bg-collapsed)" />
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
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            Go to Dashboard
          </TooltipContent>
        </Tooltip>

        {/* Collapsed project icon with dropdown */}
        {currentProject && (
          <>
            <div className="w-full h-px bg-border/40 my-2" />
            <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button
                      onContextMenu={(e) => onProjectContextMenu(currentProject, e)}
                      className="p-1 rounded-lg hover:bg-accent/50 transition-colors"
                      data-testid="collapsed-project-button"
                    >
                      {renderProjectIcon(currentProject)}
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {currentProject.name}
                </TooltipContent>
              </Tooltip>
              <DropdownMenuContent
                align="start"
                side="right"
                sideOffset={8}
                className="w-64"
                data-testid="collapsed-project-dropdown-content"
              >
                <div className="px-2 py-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Projects</span>
                </div>
                {projects.map((project, index) => {
                  const isActive = currentProject?.id === project.id;
                  const hotkeyLabel = index < 9 ? `${index + 1}` : index === 9 ? '0' : undefined;

                  return (
                    <DropdownMenuItem
                      key={project.id}
                      onClick={() => handleProjectSelect(project)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDropdownOpen(false);
                        onProjectContextMenu(project, e);
                      }}
                      className="flex items-center gap-3 cursor-pointer"
                      data-testid={`collapsed-project-item-${project.id}`}
                    >
                      {renderProjectIcon(project, 'sm')}
                      <span
                        className={cn(
                          'flex-1 truncate',
                          isActive && 'font-semibold text-foreground'
                        )}
                      >
                        {project.name}
                      </span>
                      {hotkeyLabel && (
                        <span className="text-xs text-muted-foreground">
                          {formatShortcut(`Cmd+${hotkeyLabel}`, true)}
                        </span>
                      )}
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setDropdownOpen(false);
                    onNewProject();
                  }}
                  className="cursor-pointer"
                  data-testid="collapsed-new-project-dropdown-item"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  <span>New Project</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setDropdownOpen(false);
                    onOpenFolder();
                  }}
                  className="cursor-pointer"
                  data-testid="collapsed-open-project-dropdown-item"
                >
                  <FolderOpen className="w-4 h-4 mr-2" />
                  <span>Open Project</span>
                </DropdownMenuItem>
                {currentProject && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        setDropdownOpen(false);
                        setShowRemoveFromAutomakerDialog(true);
                      }}
                      className="cursor-pointer text-muted-foreground focus:text-foreground"
                      data-testid="collapsed-remove-from-automaker-dropdown-item"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      <span>Remove from Automaker</span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
    );
  }

  // Expanded state - show logo + project dropdown
  return (
    <div
      className={cn(
        'shrink-0 flex flex-col relative px-3 pt-3 pb-2',
        isMac && isElectron() && MACOS_ELECTRON_TOP_PADDING_CLASS
      )}
    >
      {/* Header with logo and project dropdown */}
      <div className="flex items-center gap-3">
        {/* Logo */}
        <button
          onClick={handleLogoClick}
          className="group flex items-center shrink-0 titlebar-no-drag"
          title="Go to Dashboard"
          data-testid="logo-button"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 256 256"
            role="img"
            aria-label="Automaker Logo"
            className="h-8 w-8 group-hover:rotate-12 transition-transform duration-300 ease-out"
          >
            <defs>
              <linearGradient
                id="bg-header"
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
            <rect x="16" y="16" width="224" height="224" rx="56" fill="url(#bg-header)" />
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
        </button>

        {/* Project Dropdown */}
        {currentProject ? (
          <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  'flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg min-w-0',
                  'hover:bg-accent/50 transition-colors titlebar-no-drag',
                  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1'
                )}
                onContextMenu={(e) => onProjectContextMenu(currentProject, e)}
                data-testid="project-dropdown-trigger"
              >
                {renderProjectIcon(currentProject, 'sm')}
                <span className="flex-1 text-sm font-semibold text-foreground truncate text-left">
                  {currentProject.name}
                </span>
                <ChevronsUpDown className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              side="bottom"
              sideOffset={8}
              className="w-64"
              data-testid="project-dropdown-content"
            >
              <div className="px-2 py-1.5">
                <span className="text-xs font-medium text-muted-foreground">Projects</span>
              </div>
              {projects.map((project, index) => {
                const isActive = currentProject?.id === project.id;
                const hotkeyLabel = index < 9 ? `${index + 1}` : index === 9 ? '0' : undefined;

                return (
                  <DropdownMenuItem
                    key={project.id}
                    onClick={() => handleProjectSelect(project)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDropdownOpen(false);
                      onProjectContextMenu(project, e);
                    }}
                    className="flex items-center gap-3 cursor-pointer"
                    data-testid={`project-item-${project.id}`}
                  >
                    {renderProjectIcon(project, 'sm')}
                    <span
                      className={cn('flex-1 truncate', isActive && 'font-semibold text-foreground')}
                    >
                      {project.name}
                    </span>
                    {hotkeyLabel && (
                      <span className="text-xs text-muted-foreground">
                        {formatShortcut(`Cmd+${hotkeyLabel}`, true)}
                      </span>
                    )}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setDropdownOpen(false);
                  onNewProject();
                }}
                className="cursor-pointer"
                data-testid="new-project-dropdown-item"
              >
                <Plus className="w-4 h-4 mr-2" />
                <span>New Project</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setDropdownOpen(false);
                  onOpenFolder();
                }}
                className="cursor-pointer"
                data-testid="open-project-dropdown-item"
              >
                <FolderOpen className="w-4 h-4 mr-2" />
                <span>Open Project</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setDropdownOpen(false);
                  setShowRemoveFromAutomakerDialog(true);
                }}
                className="cursor-pointer text-muted-foreground focus:text-foreground"
                data-testid="remove-from-automaker-dropdown-item"
              >
                <LogOut className="w-4 h-4 mr-2" />
                <span>Remove from Automaker</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex-1 flex items-center gap-2">
            <button
              onClick={onNewProject}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg',
                'text-sm text-muted-foreground hover:text-foreground',
                'hover:bg-accent/50 transition-colors titlebar-no-drag'
              )}
              data-testid="new-project-button"
            >
              <Plus className="w-4 h-4" />
              <span>New Project</span>
            </button>
            <button
              onClick={onOpenFolder}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg',
                'text-sm text-muted-foreground hover:text-foreground',
                'hover:bg-accent/50 transition-colors titlebar-no-drag'
              )}
              data-testid="open-project-button"
            >
              <FolderOpen className="w-4 h-4" />
              <span>Open</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
