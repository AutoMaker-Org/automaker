import { Page } from '@playwright/test';

/**
 * Store version constants - centralized to avoid hardcoding across tests
 * These MUST match the versions used in the actual stores
 */
const STORE_VERSIONS = {
  APP_STORE: 2, // Must match app-store.ts persist version
  SETUP_STORE: 1, // Must match setup-store.ts persist version
} as const;

/**
 * Project interface for test setup
 */
export interface TestProject {
  id: string;
  name: string;
  path: string;
  lastOpened?: string;
}

/**
 * Options for setting up the welcome view
 */
export interface WelcomeViewSetupOptions {
  /** Directory path to pre-configure as the workspace directory */
  workspaceDir?: string;
  /** Recent projects to show (but not as current project) */
  recentProjects?: TestProject[];
}

/**
 * Set up localStorage to show the welcome view with no current project
 * This is the cleanest way to test project creation flows
 *
 * @param page - Playwright page
 * @param options - Configuration options
 */
export async function setupWelcomeView(
  page: Page,
  options?: WelcomeViewSetupOptions
): Promise<void> {
  await page.addInitScript(
    ({
      opts,
      versions,
    }: {
      opts: WelcomeViewSetupOptions | undefined;
      versions: typeof STORE_VERSIONS;
    }) => {
      // Set up empty app state (no current project) - shows welcome view
      const appState = {
        state: {
          projects: opts?.recentProjects || [],
          currentProject: null,
          currentView: 'welcome',
          theme: 'dark',
          sidebarOpen: true,
          skipSandboxWarning: true,
          apiKeys: { anthropic: '', google: '' },
          chatSessions: [],
          chatHistoryOpen: false,
          maxConcurrency: 3,
        },
        version: versions.APP_STORE,
      };
      localStorage.setItem('automaker-storage', JSON.stringify(appState));

      // Mark setup as complete to skip the setup wizard
      const setupState = {
        state: {
          isFirstRun: false,
          setupComplete: true,
          skipClaudeSetup: false,
        },
        version: versions.SETUP_STORE,
      };
      localStorage.setItem('automaker-setup', JSON.stringify(setupState));

      // Set workspace directory if provided
      if (opts?.workspaceDir) {
        localStorage.setItem('automaker:lastProjectDir', opts.workspaceDir);
      }

      // Disable splash screen in tests
      sessionStorage.setItem('automaker-splash-shown', 'true');

      // Set up a mechanism to keep currentProject null even after settings hydration
      // Settings API might restore a project, so we override it after hydration
      // Use a flag to indicate we want welcome view
      sessionStorage.setItem('automaker-test-welcome-view', 'true');

      // Override currentProject after a short delay to ensure it happens after settings hydration
      setTimeout(() => {
        const storage = localStorage.getItem('automaker-storage');
        if (storage) {
          try {
            const state = JSON.parse(storage);
            if (state.state && sessionStorage.getItem('automaker-test-welcome-view') === 'true') {
              state.state.currentProject = null;
              state.state.currentView = 'welcome';
              localStorage.setItem('automaker-storage', JSON.stringify(state));
            }
          } catch {
            // Ignore parse errors
          }
        }
      }, 2000); // Wait 2 seconds for settings hydration to complete
    },
    { opts: options, versions: STORE_VERSIONS }
  );
}

/**
 * Set up localStorage with a project at a real filesystem path
 * Use this when testing with actual files on disk
 *
 * @param page - Playwright page
 * @param projectPath - Absolute path to the project directory
 * @param projectName - Display name for the project
 * @param options - Additional options
 */
export async function setupRealProject(
  page: Page,
  projectPath: string,
  projectName: string,
  options?: {
    /** Set as current project (opens board view) or just add to recent projects */
    setAsCurrent?: boolean;
    /** Additional recent projects to include */
    additionalProjects?: TestProject[];
  }
): Promise<void> {
  await page.addInitScript(
    ({
      path,
      name,
      opts,
      versions,
    }: {
      path: string;
      name: string;
      opts: typeof options;
      versions: typeof STORE_VERSIONS;
    }) => {
      const projectId = `project-${Date.now()}`;
      const project: TestProject = {
        id: projectId,
        name: name,
        path: path,
        lastOpened: new Date().toISOString(),
      };

      const allProjects = [project, ...(opts?.additionalProjects || [])];
      const currentProject = opts?.setAsCurrent !== false ? project : null;

      const appState = {
        state: {
          projects: allProjects,
          currentProject: currentProject,
          currentView: currentProject ? 'board' : 'welcome',
          theme: 'dark',
          sidebarOpen: true,
          skipSandboxWarning: true,
          apiKeys: { anthropic: '', google: '' },
          chatSessions: [],
          chatHistoryOpen: false,
          maxConcurrency: 3,
        },
        version: versions.APP_STORE,
      };
      localStorage.setItem('automaker-storage', JSON.stringify(appState));

      // Mark setup as complete
      const setupState = {
        state: {
          isFirstRun: false,
          setupComplete: true,
          skipClaudeSetup: false,
        },
        version: versions.SETUP_STORE,
      };
      localStorage.setItem('automaker-setup', JSON.stringify(setupState));

      // Disable splash screen in tests
      sessionStorage.setItem('automaker-splash-shown', 'true');
    },
    { path: projectPath, name: projectName, opts: options, versions: STORE_VERSIONS }
  );
}

/**
 * Set up a mock project in localStorage to bypass the welcome screen
 * This simulates having opened a project before
 */
export async function setupMockProject(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const mockProject = {
      id: 'test-project-1',
      name: 'Test Project',
      path: '/mock/test-project',
      lastOpened: new Date().toISOString(),
    };

    const mockState = {
      state: {
        projects: [mockProject],
        currentProject: mockProject,
        theme: 'dark',
        sidebarOpen: true,
        apiKeys: { anthropic: '', google: '' },
        chatSessions: [],
        chatHistoryOpen: false,
        maxConcurrency: 3,
      },
      version: 2, // Must match app-store.ts persist version
    };

    localStorage.setItem('automaker-storage', JSON.stringify(mockState));

    // Disable splash screen in tests
    sessionStorage.setItem('automaker-splash-shown', 'true');
  });
}

/**
 * Set up a mock project with custom concurrency value
 */
export async function setupMockProjectWithConcurrency(
  page: Page,
  concurrency: number
): Promise<void> {
  await page.addInitScript((maxConcurrency: number) => {
    const mockProject = {
      id: 'test-project-1',
      name: 'Test Project',
      path: '/mock/test-project',
      lastOpened: new Date().toISOString(),
    };

    const mockState = {
      state: {
        projects: [mockProject],
        currentProject: mockProject,
        theme: 'dark',
        sidebarOpen: true,
        apiKeys: { anthropic: '', google: '' },
        chatSessions: [],
        chatHistoryOpen: false,
        maxConcurrency: maxConcurrency,
      },
      version: 2, // Must match app-store.ts persist version
    };

    localStorage.setItem('automaker-storage', JSON.stringify(mockState));
  }, concurrency);
}

/**
 * Set up a mock project with specific running tasks to simulate concurrency limit
 */
export async function setupMockProjectAtConcurrencyLimit(
  page: Page,
  maxConcurrency: number = 1,
  runningTasks: string[] = ['running-task-1']
): Promise<void> {
  await page.addInitScript(
    ({ maxConcurrency, runningTasks }: { maxConcurrency: number; runningTasks: string[] }) => {
      const mockProject = {
        id: 'test-project-1',
        name: 'Test Project',
        path: '/mock/test-project',
        lastOpened: new Date().toISOString(),
      };

      const mockState = {
        state: {
          projects: [mockProject],
          currentProject: mockProject,
          theme: 'dark',
          sidebarOpen: true,
          apiKeys: { anthropic: '', google: '' },
          chatSessions: [],
          chatHistoryOpen: false,
          maxConcurrency: maxConcurrency,
          isAutoModeRunning: false,
          runningAutoTasks: runningTasks,
          autoModeActivityLog: [],
        },
        version: 2, // Must match app-store.ts persist version
      };

      localStorage.setItem('automaker-storage', JSON.stringify(mockState));

      // Disable splash screen in tests
      sessionStorage.setItem('automaker-splash-shown', 'true');
    },
    { maxConcurrency, runningTasks }
  );
}

/**
 * Set up a mock project with features in different states
 */
export async function setupMockProjectWithFeatures(
  page: Page,
  options?: {
    maxConcurrency?: number;
    runningTasks?: string[];
    features?: Array<{
      id: string;
      category: string;
      description: string;
      status: 'backlog' | 'in_progress' | 'verified';
      steps?: string[];
    }>;
  }
): Promise<void> {
  await page.addInitScript((opts: typeof options) => {
    const mockProject = {
      id: 'test-project-1',
      name: 'Test Project',
      path: '/mock/test-project',
      lastOpened: new Date().toISOString(),
    };

    const mockFeatures = opts?.features || [];

    const mockState = {
      state: {
        projects: [mockProject],
        currentProject: mockProject,
        theme: 'dark',
        sidebarOpen: true,
        apiKeys: { anthropic: '', google: '' },
        chatSessions: [],
        chatHistoryOpen: false,
        maxConcurrency: opts?.maxConcurrency ?? 3,
        isAutoModeRunning: false,
        runningAutoTasks: opts?.runningTasks ?? [],
        autoModeActivityLog: [],
        features: mockFeatures,
      },
      version: 2, // Must match app-store.ts persist version
    };

    localStorage.setItem('automaker-storage', JSON.stringify(mockState));

    // Also store features in a global variable that the mock electron API can use
    // This is needed because the board-view loads features from the file system
    (window as any).__mockFeatures = mockFeatures;

    // Disable splash screen in tests
    sessionStorage.setItem('automaker-splash-shown', 'true');
  }, options);
}

/**
 * Set up a mock project with a feature context file
 * This simulates an agent having created context for a feature
 */
export async function setupMockProjectWithContextFile(
  page: Page,
  featureId: string,
  contextContent: string = '# Agent Context\n\nPrevious implementation work...'
): Promise<void> {
  await page.addInitScript(
    ({ featureId, contextContent }: { featureId: string; contextContent: string }) => {
      const mockProject = {
        id: 'test-project-1',
        name: 'Test Project',
        path: '/mock/test-project',
        lastOpened: new Date().toISOString(),
      };

      const mockState = {
        state: {
          projects: [mockProject],
          currentProject: mockProject,
          theme: 'dark',
          sidebarOpen: true,
          apiKeys: { anthropic: '', google: '' },
          chatSessions: [],
          chatHistoryOpen: false,
          maxConcurrency: 3,
        },
        version: 2, // Must match app-store.ts persist version
      };

      localStorage.setItem('automaker-storage', JSON.stringify(mockState));

      // Disable splash screen in tests
      sessionStorage.setItem('automaker-splash-shown', 'true');

      // Set up mock file system with a context file for the feature
      // This will be used by the mock electron API
      // Now uses features/{id}/agent-output.md path
      (window as any).__mockContextFile = {
        featureId,
        path: `/mock/test-project/.automaker/features/${featureId}/agent-output.md`,
        content: contextContent,
      };
    },
    { featureId, contextContent }
  );
}

/**
 * Set up a mock project with features that have startedAt timestamps
 */
export async function setupMockProjectWithInProgressFeatures(
  page: Page,
  options?: {
    maxConcurrency?: number;
    runningTasks?: string[];
    features?: Array<{
      id: string;
      category: string;
      description: string;
      status: 'backlog' | 'in_progress' | 'verified';
      steps?: string[];
      startedAt?: string;
    }>;
  }
): Promise<void> {
  await page.addInitScript((opts: typeof options) => {
    const mockProject = {
      id: 'test-project-1',
      name: 'Test Project',
      path: '/mock/test-project',
      lastOpened: new Date().toISOString(),
    };

    const mockFeatures = opts?.features || [];

    const mockState = {
      state: {
        projects: [mockProject],
        currentProject: mockProject,
        theme: 'dark',
        sidebarOpen: true,
        apiKeys: { anthropic: '', google: '' },
        chatSessions: [],
        chatHistoryOpen: false,
        maxConcurrency: opts?.maxConcurrency ?? 3,
        isAutoModeRunning: false,
        runningAutoTasks: opts?.runningTasks ?? [],
        autoModeActivityLog: [],
        features: mockFeatures,
      },
      version: 2, // Must match app-store.ts persist version
    };

    localStorage.setItem('automaker-storage', JSON.stringify(mockState));

    // Also store features in a global variable that the mock electron API can use
    // This is needed because the board-view loads features from the file system
    (window as any).__mockFeatures = mockFeatures;
  }, options);
}

/**
 * Set up a mock project with a specific current view for route persistence testing
 */
export async function setupMockProjectWithView(page: Page, view: string): Promise<void> {
  await page.addInitScript((currentView: string) => {
    const mockProject = {
      id: 'test-project-1',
      name: 'Test Project',
      path: '/mock/test-project',
      lastOpened: new Date().toISOString(),
    };

    const mockState = {
      state: {
        projects: [mockProject],
        currentProject: mockProject,
        currentView: currentView,
        theme: 'dark',
        sidebarOpen: true,
        apiKeys: { anthropic: '', google: '' },
        chatSessions: [],
        chatHistoryOpen: false,
        maxConcurrency: 3,
      },
      version: 2, // Must match app-store.ts persist version
    };

    localStorage.setItem('automaker-storage', JSON.stringify(mockState));
  }, view);
}

/**
 * Set up an empty localStorage (no projects) to show welcome screen
 */
export async function setupEmptyLocalStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const mockState = {
      state: {
        projects: [],
        currentProject: null,
        currentView: 'welcome',
        theme: 'dark',
        sidebarOpen: true,
        apiKeys: { anthropic: '', google: '' },
        chatSessions: [],
        chatHistoryOpen: false,
        maxConcurrency: 3,
      },
      version: 2, // Must match app-store.ts persist version
    };
    localStorage.setItem('automaker-storage', JSON.stringify(mockState));

    // Disable splash screen in tests
    sessionStorage.setItem('automaker-splash-shown', 'true');
  });
}

/**
 * Set up mock projects in localStorage but with no current project (for recent projects list)
 */
export async function setupMockProjectsWithoutCurrent(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const mockProjects = [
      {
        id: 'test-project-1',
        name: 'Test Project 1',
        path: '/mock/test-project-1',
        lastOpened: new Date().toISOString(),
      },
      {
        id: 'test-project-2',
        name: 'Test Project 2',
        path: '/mock/test-project-2',
        lastOpened: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
      },
    ];

    const mockState = {
      state: {
        projects: mockProjects,
        currentProject: null,
        currentView: 'welcome',
        theme: 'dark',
        sidebarOpen: true,
        apiKeys: { anthropic: '', google: '' },
        chatSessions: [],
        chatHistoryOpen: false,
        maxConcurrency: 3,
      },
      version: 2, // Must match app-store.ts persist version
    };

    localStorage.setItem('automaker-storage', JSON.stringify(mockState));

    // Disable splash screen in tests
    sessionStorage.setItem('automaker-splash-shown', 'true');
  });
}

/**
 * Set up a mock project with features that have skipTests enabled
 */
export async function setupMockProjectWithSkipTestsFeatures(
  page: Page,
  options?: {
    maxConcurrency?: number;
    runningTasks?: string[];
    features?: Array<{
      id: string;
      category: string;
      description: string;
      status: 'backlog' | 'in_progress' | 'verified';
      steps?: string[];
      startedAt?: string;
      skipTests?: boolean;
    }>;
  }
): Promise<void> {
  await page.addInitScript((opts: typeof options) => {
    const mockProject = {
      id: 'test-project-1',
      name: 'Test Project',
      path: '/mock/test-project',
      lastOpened: new Date().toISOString(),
    };

    const mockFeatures = opts?.features || [];

    const mockState = {
      state: {
        projects: [mockProject],
        currentProject: mockProject,
        theme: 'dark',
        sidebarOpen: true,
        apiKeys: { anthropic: '', google: '' },
        chatSessions: [],
        chatHistoryOpen: false,
        maxConcurrency: opts?.maxConcurrency ?? 3,
        isAutoModeRunning: false,
        runningAutoTasks: opts?.runningTasks ?? [],
        autoModeActivityLog: [],
        features: mockFeatures,
      },
      version: 2, // Must match app-store.ts persist version
    };

    localStorage.setItem('automaker-storage', JSON.stringify(mockState));

    // Disable splash screen in tests
    sessionStorage.setItem('automaker-splash-shown', 'true');
  }, options);
}

/**
 * Set up a mock state with multiple projects
 */
export async function setupMockMultipleProjects(
  page: Page,
  projectCount: number = 3
): Promise<void> {
  await page.addInitScript((count: number) => {
    const mockProjects = [];
    for (let i = 0; i < count; i++) {
      mockProjects.push({
        id: `test-project-${i + 1}`,
        name: `Test Project ${i + 1}`,
        path: `/mock/test-project-${i + 1}`,
        lastOpened: new Date(Date.now() - i * 86400000).toISOString(),
      });
    }

    const mockState = {
      state: {
        projects: mockProjects,
        currentProject: mockProjects[0],
        currentView: 'board',
        theme: 'dark',
        sidebarOpen: true,
        apiKeys: { anthropic: '', google: '' },
        chatSessions: [],
        chatHistoryOpen: false,
        maxConcurrency: 3,
      },
      version: 2, // Must match app-store.ts persist version
    };

    localStorage.setItem('automaker-storage', JSON.stringify(mockState));
  }, projectCount);
}

/**
 * Set up a mock project with agent output content in the context file
 */
export async function setupMockProjectWithAgentOutput(
  page: Page,
  featureId: string,
  outputContent: string
): Promise<void> {
  await page.addInitScript(
    ({ featureId, outputContent }: { featureId: string; outputContent: string }) => {
      const mockProject = {
        id: 'test-project-1',
        name: 'Test Project',
        path: '/mock/test-project',
        lastOpened: new Date().toISOString(),
      };

      const mockState = {
        state: {
          projects: [mockProject],
          currentProject: mockProject,
          theme: 'dark',
          sidebarOpen: true,
          apiKeys: { anthropic: '', google: '' },
          chatSessions: [],
          chatHistoryOpen: false,
          maxConcurrency: 3,
        },
        version: 2, // Must match app-store.ts persist version
      };

      localStorage.setItem('automaker-storage', JSON.stringify(mockState));

      // Disable splash screen in tests
      sessionStorage.setItem('automaker-splash-shown', 'true');

      // Set up mock file system with output content for the feature
      // Now uses features/{id}/agent-output.md path
      (window as any).__mockContextFile = {
        featureId,
        path: `/mock/test-project/.automaker/features/${featureId}/agent-output.md`,
        content: outputContent,
      };
    },
    { featureId, outputContent }
  );
}

/**
 * Set up a mock project with features that include waiting_approval status
 */
export async function setupMockProjectWithWaitingApprovalFeatures(
  page: Page,
  options?: {
    maxConcurrency?: number;
    runningTasks?: string[];
    features?: Array<{
      id: string;
      category: string;
      description: string;
      status: 'backlog' | 'in_progress' | 'waiting_approval' | 'verified';
      steps?: string[];
      startedAt?: string;
      skipTests?: boolean;
    }>;
  }
): Promise<void> {
  await page.addInitScript((opts: typeof options) => {
    const mockProject = {
      id: 'test-project-1',
      name: 'Test Project',
      path: '/mock/test-project',
      lastOpened: new Date().toISOString(),
    };

    const mockFeatures = opts?.features || [];

    const mockState = {
      state: {
        projects: [mockProject],
        currentProject: mockProject,
        theme: 'dark',
        sidebarOpen: true,
        apiKeys: { anthropic: '', google: '' },
        chatSessions: [],
        chatHistoryOpen: false,
        maxConcurrency: opts?.maxConcurrency ?? 3,
        isAutoModeRunning: false,
        runningAutoTasks: opts?.runningTasks ?? [],
        autoModeActivityLog: [],
        features: mockFeatures,
      },
      version: 2, // Must match app-store.ts persist version
    };

    localStorage.setItem('automaker-storage', JSON.stringify(mockState));

    // Also store features in a global variable that the mock electron API can use
    (window as any).__mockFeatures = mockFeatures;
  }, options);
}

/**
 * Set up the app store to show setup view (simulate first run)
 */
export async function setupFirstRun(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Clear any existing setup state to simulate first run
    localStorage.removeItem('automaker-setup');
    localStorage.removeItem('automaker-storage');

    // Set up the setup store state for first run
    const setupState = {
      state: {
        isFirstRun: true,
        setupComplete: false,
        currentStep: 'welcome',
        claudeCliStatus: null,
        claudeAuthStatus: null,
        claudeInstallProgress: {
          isInstalling: false,
          currentStep: '',
          progress: 0,
          output: [],
        },
        skipClaudeSetup: false,
      },
      version: 2, // Must match app-store.ts persist version
    };

    localStorage.setItem('automaker-setup', JSON.stringify(setupState));

    // Also set up app store to show setup view
    const appState = {
      state: {
        projects: [],
        currentProject: null,
        theme: 'dark',
        sidebarOpen: true,
        apiKeys: { anthropic: '', google: '' },
        chatSessions: [],
        chatHistoryOpen: false,
        maxConcurrency: 3,
        isAutoModeRunning: false,
        runningAutoTasks: [],
        autoModeActivityLog: [],
        currentView: 'setup',
      },
      version: 2, // Must match app-store.ts persist version
    };

    localStorage.setItem('automaker-storage', JSON.stringify(appState));

    // Disable splash screen in tests
    sessionStorage.setItem('automaker-splash-shown', 'true');
  });
}

/**
 * Set up the app to skip the setup wizard (setup already complete)
 */
export async function setupComplete(page: Page): Promise<void> {
  await page.addInitScript((versions: typeof STORE_VERSIONS) => {
    // Mark setup as complete
    const setupState = {
      state: {
        isFirstRun: false,
        setupComplete: true,
        currentStep: 'complete',
        skipClaudeSetup: false,
      },
      version: versions.SETUP_STORE,
    };

    localStorage.setItem('automaker-setup', JSON.stringify(setupState));

    // Disable splash screen in tests
    sessionStorage.setItem('automaker-splash-shown', 'true');
  }, STORE_VERSIONS);
}
