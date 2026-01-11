import { useMemo, useState, useEffect } from 'react';
import type { NavigateOptions } from '@tanstack/react-router';
import {
  FileText,
  LayoutGrid,
  Bot,
  BookOpen,
  Terminal,
  CircleDot,
  GitPullRequest,
  Lightbulb,
  Brain,
  Network,
} from 'lucide-react';
import type { NavSection, NavItem } from '../types';
import type { KeyboardShortcut } from '@/hooks/use-keyboard-shortcuts';
import type { Project } from '@/lib/electron';
import { getElectronAPI } from '@/lib/electron';

interface UseNavigationProps {
  shortcuts: {
    toggleSidebar: string;
    openProject: string;
    projectPicker: string;
    cyclePrevProject: string;
    cycleNextProject: string;
    spec: string;
    context: string;
    memory: string;
    board: string;
    graph: string;
    agent: string;
    terminal: string;
    settings: string;
    ideation: string;
    githubIssues: string;
    githubPrs: string;
  };
  hideSpecEditor: boolean;
  hideContext: boolean;
  hideTerminal: boolean;
  currentProject: Project | null;
  projects: Project[];
  projectHistory: string[];
  navigate: (opts: NavigateOptions) => void;
  toggleSidebar: () => void;
  handleOpenFolder: () => void;
  setIsProjectPickerOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  cyclePrevProject: () => void;
  cycleNextProject: () => void;
  /** Count of unviewed validations to show on GitHub Issues nav item */
  unviewedValidationsCount?: number;
  /** Whether spec generation is currently running for the current project */
  isSpecGenerating?: boolean;
}

export function useNavigation({
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
  setIsProjectPickerOpen,
  cyclePrevProject,
  cycleNextProject,
  unviewedValidationsCount,
  isSpecGenerating,
}: UseNavigationProps) {
  // Track if current project has a GitHub remote
  const [hasGitHubRemote, setHasGitHubRemote] = useState(false);

  useEffect(() => {
    async function checkGitHubRemote() {
      if (!currentProject?.path) {
        setHasGitHubRemote(false);
        return;
      }

      try {
        const api = getElectronAPI();
        if (api.github) {
          const result = await api.github.checkRemote(currentProject.path);
          setHasGitHubRemote(result.success && result.hasGitHubRemote === true);
        }
      } catch {
        setHasGitHubRemote(false);
      }
    }

    checkGitHubRemote();
  }, [currentProject?.path]);

  // Build navigation sections
  const navSections: NavSection[] = useMemo(() => {
    const allToolsItems: NavItem[] = [
      {
        id: 'ideation',
        label: 'Ideation',
        icon: Lightbulb,
        shortcut: shortcuts.ideation,
      },
      {
        id: 'spec',
        label: 'Spec Editor',
        icon: FileText,
        shortcut: shortcuts.spec,
        isLoading: isSpecGenerating,
      },
      {
        id: 'context',
        label: 'Context',
        icon: BookOpen,
        shortcut: shortcuts.context,
      },
      {
        id: 'memory',
        label: 'Memory',
        icon: Brain,
        shortcut: shortcuts.memory,
      },
    ];

    // Filter out hidden items
    const visibleToolsItems = allToolsItems.filter((item) => {
      if (item.id === 'spec' && hideSpecEditor) {
        return false;
      }
      if (item.id === 'context' && hideContext) {
        return false;
      }
      return true;
    });

    // Build project items - Terminal is conditionally included
    const projectItems: NavItem[] = [
      {
        id: 'board',
        label: 'Kanban Board',
        icon: LayoutGrid,
        shortcut: shortcuts.board,
      },
      {
        id: 'graph',
        label: 'Graph View',
        icon: Network,
        shortcut: shortcuts.graph,
      },
      {
        id: 'agent',
        label: 'Agent Runner',
        icon: Bot,
        shortcut: shortcuts.agent,
      },
    ];

    // Add Terminal to Project section if not hidden
    if (!hideTerminal) {
      projectItems.push({
        id: 'terminal',
        label: 'Terminal',
        icon: Terminal,
        shortcut: shortcuts.terminal,
      });
    }

    const sections: NavSection[] = [
      {
        label: 'Project',
        items: projectItems,
      },
      {
        label: 'Tools',
        items: visibleToolsItems,
      },
    ];

    // Add GitHub section if project has a GitHub remote
    if (hasGitHubRemote) {
      sections.push({
        label: 'GitHub',
        items: [
          {
            id: 'github-issues',
            label: 'Issues',
            icon: CircleDot,
            shortcut: shortcuts.githubIssues,
            count: unviewedValidationsCount,
          },
          {
            id: 'github-prs',
            label: 'Pull Requests',
            icon: GitPullRequest,
            shortcut: shortcuts.githubPrs,
          },
        ],
      });
    }

    return sections;
  }, [
    shortcuts,
    hideSpecEditor,
    hideContext,
    hideTerminal,
    hasGitHubRemote,
    unviewedValidationsCount,
    isSpecGenerating,
  ]);

  // Build keyboard shortcuts for navigation
  const navigationShortcuts: KeyboardShortcut[] = useMemo(() => {
    const shortcutsList: KeyboardShortcut[] = [];

    // Sidebar toggle shortcut - always available
    shortcutsList.push({
      key: shortcuts.toggleSidebar,
      action: () => toggleSidebar(),
      description: 'Toggle sidebar',
    });

    // Open project shortcut - opens the folder selection dialog directly
    shortcutsList.push({
      key: shortcuts.openProject,
      action: () => handleOpenFolder(),
      description: 'Open folder selection dialog',
    });

    // Project picker shortcut - only when we have projects
    if (projects.length > 0) {
      shortcutsList.push({
        key: shortcuts.projectPicker,
        action: () => setIsProjectPickerOpen((prev) => !prev),
        description: 'Toggle project picker',
      });
    }

    // Project cycling shortcuts - only when we have project history
    if (projectHistory.length > 1) {
      shortcutsList.push({
        key: shortcuts.cyclePrevProject,
        action: () => cyclePrevProject(),
        description: 'Cycle to previous project (MRU)',
      });
      shortcutsList.push({
        key: shortcuts.cycleNextProject,
        action: () => cycleNextProject(),
        description: 'Cycle to next project (LRU)',
      });
    }

    // Only enable nav shortcuts if there's a current project
    if (currentProject) {
      navSections.forEach((section) => {
        section.items.forEach((item) => {
          if (item.shortcut) {
            shortcutsList.push({
              key: item.shortcut,
              // Cast to router path type; ids are constrained to known routes
              action: () => navigate({ to: `/${item.id}` as unknown as '/' }),
              description: `Navigate to ${item.label}`,
            });
          }
        });
      });

      // Add settings shortcut
      shortcutsList.push({
        key: shortcuts.settings,
        action: () => navigate({ to: '/settings' }),
        description: 'Navigate to Settings',
      });
    }

    return shortcutsList;
  }, [
    shortcuts,
    currentProject,
    navigate,
    toggleSidebar,
    projects.length,
    handleOpenFolder,
    projectHistory.length,
    cyclePrevProject,
    cycleNextProject,
    navSections,
    setIsProjectPickerOpen,
  ]);

  return {
    navSections,
    navigationShortcuts,
  };
}
