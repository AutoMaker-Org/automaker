import { useState, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { ProjectCard } from './project-card';
import { EmptyState } from './empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, FolderOpen } from 'lucide-react';
import { getElectronAPI } from '@/lib/electron';
import { initializeProject, hasAppSpec, hasAutomakerDir } from '@/lib/project-init';
import type { ThemeMode } from '@/store/app-store';
import { toast } from 'sonner';
import { OnboardingWizard } from '@/components/dialogs/onboarding-wizard';
import { useOSDetection } from '@/hooks/use-os-detection';

const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

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
  const {
    projects,
    trashedProjects,
    currentProject,
    upsertAndSetCurrentProject,
    theme: globalTheme,
  } = useAppStore();
  const { os } = useOSDetection();
  const appMode = import.meta.env.VITE_APP_MODE || '?';
  const versionSuffix = `${getOSAbbreviation(os)}${appMode}`;

  const [searchQuery, setSearchQuery] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingMode, setOnboardingMode] = useState<'new' | 'existing'>('new');
  const [pendingProjectPath, setPendingProjectPath] = useState<string | undefined>(undefined);

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sort by last opened (most recent first)
  const sortedProjects = [...filteredProjects].sort((a, b) => {
    const aTime = a.lastOpened ? new Date(a.lastOpened).getTime() : 0;
    const bTime = b.lastOpened ? new Date(b.lastOpened).getTime() : 0;
    return bTime - aTime;
  });

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
          // Show onboarding for project that needs setup
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

  const handleNewProject = useCallback(() => {
    setPendingProjectPath(undefined);
    setOnboardingMode('new');
    setShowOnboarding(true);
  }, []);

  const handleProjectClick = useCallback(
    (projectId: string) => {
      const project = projects.find((p) => p.id === projectId);
      if (project) {
        upsertAndSetCurrentProject(
          project.path,
          project.name,
          project.theme as ThemeMode | undefined
        );
        navigate({ to: '/board' });
      }
    },
    [projects, upsertAndSetCurrentProject, navigate]
  );

  // Show empty state for new users
  if (projects.length === 0) {
    return (
      <div className="flex-1 flex flex-col">
        {/* Branding Header */}
        <div className="flex items-center gap-2 p-6">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 256 256"
            role="img"
            aria-label="Automaker Logo"
            className="size-9"
          >
            <defs>
              <linearGradient
                id="dashboard-empty-logo-bg"
                x1="0"
                y1="0"
                x2="256"
                y2="256"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" style={{ stopColor: 'var(--brand-400)' }} />
                <stop offset="100%" style={{ stopColor: 'var(--brand-600)' }} />
              </linearGradient>
              <filter id="dashboard-empty-logo-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow
                  dx="0"
                  dy="4"
                  stdDeviation="4"
                  floodColor="#000000"
                  floodOpacity="0.25"
                />
              </filter>
            </defs>
            <rect
              x="16"
              y="16"
              width="224"
              height="224"
              rx="56"
              fill="url(#dashboard-empty-logo-bg)"
            />
            <g
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="20"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#dashboard-empty-logo-shadow)"
            >
              <path d="M92 92 L52 128 L92 164" />
              <path d="M144 72 L116 184" />
              <path d="M164 92 L204 128 L164 164" />
            </g>
          </svg>
          <div className="flex flex-col">
            <span className="font-bold text-foreground text-xl tracking-tight leading-none">
              automaker<span className="text-brand-500">.</span>
            </span>
            <span className="text-[0.625rem] text-muted-foreground leading-none font-medium mt-0.5">
              v{appVersion} {versionSuffix}
            </span>
          </div>
        </div>
        <EmptyState onNewProject={handleNewProject} onOpenFolder={handleOpenFolder} />
        <OnboardingWizard
          open={showOnboarding}
          onOpenChange={setShowOnboarding}
          mode={onboardingMode}
          initialPath={pendingProjectPath}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* Branding Header */}
      <div className="flex items-center gap-2 mb-8">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 256 256"
          role="img"
          aria-label="Automaker Logo"
          className="size-9"
        >
          <defs>
            <linearGradient
              id="dashboard-logo-bg"
              x1="0"
              y1="0"
              x2="256"
              y2="256"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" style={{ stopColor: 'var(--brand-400)' }} />
              <stop offset="100%" style={{ stopColor: 'var(--brand-600)' }} />
            </linearGradient>
            <filter id="dashboard-logo-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow
                dx="0"
                dy="4"
                stdDeviation="4"
                floodColor="#000000"
                floodOpacity="0.25"
              />
            </filter>
          </defs>
          <rect x="16" y="16" width="224" height="224" rx="56" fill="url(#dashboard-logo-bg)" />
          <g
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="20"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#dashboard-logo-shadow)"
          >
            <path d="M92 92 L52 128 L92 164" />
            <path d="M144 72 L116 184" />
            <path d="M164 92 L204 128 L164 164" />
          </g>
        </svg>
        <div className="flex flex-col">
          <span className="font-bold text-foreground text-xl tracking-tight leading-none">
            automaker<span className="text-brand-500">.</span>
          </span>
          <span className="text-[0.625rem] text-muted-foreground leading-none font-medium mt-0.5">
            v{appVersion} {versionSuffix}
          </span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold">Projects</h1>
            <p className="text-muted-foreground mt-1">
              {projects.length} project{projects.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleOpenFolder}>
              <FolderOpen className="h-4 w-4 mr-2" />
              Open Folder
            </Button>
            <Button onClick={handleNewProject}>
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Project Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => handleProjectClick(project.id)}
            />
          ))}
        </div>

        {/* No results */}
        {filteredProjects.length === 0 && searchQuery && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No projects matching "{searchQuery}"</p>
          </div>
        )}
      </div>

      <OnboardingWizard
        open={showOnboarding}
        onOpenChange={setShowOnboarding}
        mode={onboardingMode}
        initialPath={pendingProjectPath}
      />
    </div>
  );
}
