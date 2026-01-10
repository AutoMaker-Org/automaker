import { useState, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { useAppStore, type ThemeMode } from '@/store/app-store';
import type { Project } from '@/lib/electron';
import { ProjectSwitcher } from './project-switcher';
import { PinnedProjects } from './pinned-projects';
import { TopBarActions } from './top-bar-actions';
import { OnboardingWizard } from '@/components/dialogs/onboarding-wizard';
import { getElectronAPI } from '@/lib/electron';
import { initializeProject, hasAppSpec, hasAutomakerDir } from '@/lib/project-init';
import { toast } from 'sonner';

export function TopBar() {
  const navigate = useNavigate();
  const {
    currentProject,
    projects,
    pinnedProjectIds,
    trashedProjects,
    theme: globalTheme,
    upsertAndSetCurrentProject,
  } = useAppStore();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingMode, setOnboardingMode] = useState<'new' | 'existing'>('new');
  const [pendingProjectPath, setPendingProjectPath] = useState<string | undefined>(undefined);

  const pinnedProjects = projects.filter((p) => pinnedProjectIds.includes(p.id));

  const handleLogoClick = useCallback(() => {
    navigate({ to: '/dashboard' });
  }, [navigate]);

  const handleNewProject = useCallback(() => {
    setPendingProjectPath(undefined);
    setOnboardingMode('new');
    setShowOnboarding(true);
  }, []);

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

        const trashedProject = trashedProjects.find((p) => p.path === path);
        const effectiveTheme =
          (trashedProject?.theme as ThemeMode | undefined) ||
          (currentProject?.theme as ThemeMode | undefined) ||
          globalTheme;

        upsertAndSetCurrentProject(path, name, effectiveTheme);

        const specExists = await hasAppSpec(path);

        if (!hadAutomakerDir || !specExists) {
          setPendingProjectPath(path);
          setOnboardingMode(hadAutomakerDir ? 'existing' : 'new');
          setShowOnboarding(true);
        } else {
          navigate({ to: '/board' });
          toast.success('Project opened', { description: `Opened ${name}` });
        }
      } catch (error) {
        toast.error('Failed to open project', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }, [trashedProjects, currentProject, globalTheme, upsertAndSetCurrentProject, navigate]);

  return (
    <header
      className={cn(
        'flex items-center h-12 px-4 border-b border-border/60',
        'bg-gradient-to-r from-sidebar/95 via-sidebar/90 to-sidebar/95 backdrop-blur-xl',
        'shadow-sm'
      )}
    >
      {/* Logo */}
      <button
        onClick={handleLogoClick}
        className="flex items-center gap-2 mr-4 hover:opacity-80 transition-opacity"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className="h-7 w-7">
          <defs>
            <linearGradient
              id="topbar-logo-bg"
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
          <rect x="16" y="16" width="224" height="224" rx="56" fill="url(#topbar-logo-bg)" />
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

      {/* Pinned Projects */}
      <PinnedProjects pinnedProjects={pinnedProjects} currentProject={currentProject} />

      {/* Project Dropdown */}
      <ProjectSwitcher
        isOpen={isDropdownOpen}
        onOpenChange={setIsDropdownOpen}
        currentProject={currentProject}
        projects={projects}
        pinnedProjectIds={pinnedProjectIds}
        onNewProject={handleNewProject}
        onOpenFolder={handleOpenFolder}
      />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Actions */}
      <TopBarActions currentProject={currentProject} />

      {/* Onboarding Wizard */}
      <OnboardingWizard
        open={showOnboarding}
        onOpenChange={setShowOnboarding}
        mode={onboardingMode}
        initialPath={pendingProjectPath}
      />
    </header>
  );
}
