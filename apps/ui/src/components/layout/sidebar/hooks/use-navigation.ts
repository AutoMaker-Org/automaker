import { useMemo, useState, useEffect } from 'react';
import type { NavigateOptions } from '@tanstack/react-router';
import {
  FileText,
  Folder,
  LayoutGrid,
  Bot,
  BookOpen,
  Terminal,
  CircleDot,
  GitPullRequest,
  Lightbulb,
  Brain,
  Network,
  Bell,
  Settings,
  Home,
  BotMessageSquare,
} from 'lucide-react';
import type { NavSection, NavItem } from '../types';
import type { KeyboardShortcut } from '@/hooks/use-keyboard-shortcuts';
import type { Project } from '@/lib/electron';
import { getElectronAPI } from '@/lib/electron';

// Section labels for consistency
const SECTION_LABELS = {
  DASHBOARD: '',
  PROJECT: 'Project',
  TOOLS: 'Tools',
  GITHUB: 'GitHub',
} as const;

// Navigation item IDs
const NAV_ITEM_IDS = {
  OVERVIEW: 'overview',
  BOARD: 'board',
  GRAPH: 'graph',
  FILE_EDITOR: 'file-editor',
  AGENT: 'agent',
  TERMINAL: 'terminal',
  IDEATION: 'ideation',
  SPEC: 'spec',
  CONTEXT: 'context',
  MEMORY: 'memory',
  AUTOMATIONS: 'automations',
  GITHUB_ISSUES: 'github-issues',
  GITHUB_PRS: 'github-prs',
  NOTIFICATIONS: 'notifications',
  PROJECT_SETTINGS: 'project-settings',
} as const;

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
    projectSettings: string;
    ideation: string;
    githubIssues: string;
    githubPrs: string;
    notifications: string;
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
  cyclePrevProject: () => void;
  cycleNextProject: () => void;
  /** Count of unviewed validations to show on GitHub Issues nav item */
  unviewedValidationsCount?: number;
  /** Count of unread notifications to show on Notifications nav item */
  unreadNotificationsCount?: number;
  /** Whether spec generation is currently running for the current project */
  isSpecGenerating?: boolean;
}

export function useNavigation({
  shortcuts,
  hideSpecEditor,
  hideContext,
  hideTerminal,
  currentProject,
  projects: _projects,
  projectHistory,
  navigate,
  toggleSidebar,
  handleOpenFolder,
  cyclePrevProject,
  cycleNextProject,
  unviewedValidationsCount,
  unreadNotificationsCount,
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
    // Define all Tools section items with their properties
    // Note: Automations is intentionally the last item in the Tools section
    const allToolsItems: NavItem[] = [
      {
        id: NAV_ITEM_IDS.IDEATION,
        label: 'Ideation',
        icon: Lightbulb,
        shortcut: shortcuts.ideation,
      },
      {
        id: NAV_ITEM_IDS.SPEC,
        label: 'Spec Editor',
        icon: FileText,
        shortcut: shortcuts.spec,
        isLoading: isSpecGenerating,
      },
      {
        id: NAV_ITEM_IDS.CONTEXT,
        label: 'Context',
        icon: BookOpen,
        shortcut: shortcuts.context,
      },
      {
        id: NAV_ITEM_IDS.MEMORY,
        label: 'Memory',
        icon: Brain,
        shortcut: shortcuts.memory,
      },
      {
        id: NAV_ITEM_IDS.AUTOMATIONS,
        label: 'Automations',
        icon: BotMessageSquare,
        // Note: No keyboard shortcut for Automations - can be added in the future
      },
    ];

    // Filter out hidden items based on user settings
    // Terminal is not in Tools items, so we don't check hideTerminal here
    const visibleToolsItems = allToolsItems.filter((item) => {
      if (item.id === NAV_ITEM_IDS.SPEC && hideSpecEditor) {
        return false;
      }
      if (item.id === NAV_ITEM_IDS.CONTEXT && hideContext) {
        return false;
      }
      return true;
    });

    // Build project items - includes main project navigation items
    // Terminal and File Editor are conditionally included based on settings
    const projectItems: NavItem[] = [
      {
        id: NAV_ITEM_IDS.BOARD,
        label: 'Kanban Board',
        icon: LayoutGrid,
        shortcut: shortcuts.board,
      },
      {
        id: NAV_ITEM_IDS.GRAPH,
        label: 'Graph View',
        icon: Network,
        shortcut: shortcuts.graph,
      },
      {
        id: NAV_ITEM_IDS.FILE_EDITOR,
        label: 'File Editor',
        icon: Folder,
      },
      {
        id: NAV_ITEM_IDS.AGENT,
        label: 'Agent Runner',
        icon: Bot,
        shortcut: shortcuts.agent,
      },
    ];

    // Conditionally add Terminal to Project section if not hidden
    if (!hideTerminal) {
      projectItems.push({
        id: NAV_ITEM_IDS.TERMINAL,
        label: 'Terminal',
        icon: Terminal,
        shortcut: shortcuts.terminal,
      });
    }

    const sections: NavSection[] = [
      // Dashboard - standalone at top (links to projects overview)
      {
        label: SECTION_LABELS.DASHBOARD,
        items: [
          {
            id: NAV_ITEM_IDS.OVERVIEW,
            label: 'Dashboard',
            icon: Home,
          },
        ],
      },
      // Project section - expanded by default
      {
        label: SECTION_LABELS.PROJECT,
        items: projectItems,
        collapsible: true,
        defaultCollapsed: false,
      },
      // Tools section - collapsed by default, contains Automations as last item
      {
        label: SECTION_LABELS.TOOLS,
        items: visibleToolsItems,
        collapsible: true,
        defaultCollapsed: true,
      },
    ];

    // Add GitHub section if project has a GitHub remote
    if (hasGitHubRemote) {
      sections.push({
        label: SECTION_LABELS.GITHUB,
        items: [
          {
            id: NAV_ITEM_IDS.GITHUB_ISSUES,
            label: 'Issues',
            icon: CircleDot,
            shortcut: shortcuts.githubIssues,
            count: unviewedValidationsCount,
          },
          {
            id: NAV_ITEM_IDS.GITHUB_PRS,
            label: 'Pull Requests',
            icon: GitPullRequest,
            shortcut: shortcuts.githubPrs,
          },
        ],
        collapsible: true,
        defaultCollapsed: true,
      });
    }

    // Add Notifications and Project Settings as a standalone section (no label for visual separation)
    sections.push({
      label: SECTION_LABELS.DASHBOARD,
      items: [
        {
          id: NAV_ITEM_IDS.NOTIFICATIONS,
          label: 'Notifications',
          icon: Bell,
          shortcut: shortcuts.notifications,
          count: unreadNotificationsCount,
        },
        {
          id: NAV_ITEM_IDS.PROJECT_SETTINGS,
          label: 'Project Settings',
          icon: Settings,
          shortcut: shortcuts.projectSettings,
        },
      ],
    });

    return sections;
  }, [
    shortcuts,
    hideSpecEditor,
    hideContext,
    hideTerminal,
    hasGitHubRemote,
    unviewedValidationsCount,
    unreadNotificationsCount,
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

      // Add global settings shortcut
      shortcutsList.push({
        key: shortcuts.settings,
        action: () => navigate({ to: '/settings' }),
        description: 'Navigate to Global Settings',
      });
    }

    return shortcutsList;
  }, [
    shortcuts,
    currentProject,
    navigate,
    toggleSidebar,
    handleOpenFolder,
    projectHistory.length,
    cyclePrevProject,
    cycleNextProject,
    navSections,
  ]);

  return {
    navSections,
    navigationShortcuts,
  };
}
