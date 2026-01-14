/**
 * Centralized constants for test utilities
 * This file contains all shared constants like URLs, timeouts, and selectors
 */

// ============================================================================
// API Configuration
// ============================================================================

/**
 * Base URL for the API server
 */
export const API_BASE_URL = 'http://localhost:3008';

/**
 * API endpoints for worktree operations
 */
export const API_ENDPOINTS = {
  worktree: {
    create: `${API_BASE_URL}/api/worktree/create`,
    delete: `${API_BASE_URL}/api/worktree/delete`,
    list: `${API_BASE_URL}/api/worktree/list`,
    commit: `${API_BASE_URL}/api/worktree/commit`,
    switchBranch: `${API_BASE_URL}/api/worktree/switch-branch`,
    listBranches: `${API_BASE_URL}/api/worktree/list-branches`,
    status: `${API_BASE_URL}/api/worktree/status`,
    info: `${API_BASE_URL}/api/worktree/info`,
  },
  fs: {
    browse: `${API_BASE_URL}/api/fs/browse`,
    read: `${API_BASE_URL}/api/fs/read`,
    write: `${API_BASE_URL}/api/fs/write`,
  },
  features: {
    list: `${API_BASE_URL}/api/features/list`,
    create: `${API_BASE_URL}/api/features/create`,
    update: `${API_BASE_URL}/api/features/update`,
    delete: `${API_BASE_URL}/api/features/delete`,
  },
} as const;

// ============================================================================
// Timeout Configuration
// ============================================================================

/**
 * Default timeouts in milliseconds
 */
export const TIMEOUTS = {
  /** Default timeout for element visibility checks */
  default: 5000,
  /** Short timeout for quick checks */
  short: 2000,
  /** Medium timeout for standard operations */
  medium: 10000,
  /** Long timeout for slow operations */
  long: 30000,
  /** Extra long timeout for very slow operations */
  extraLong: 60000,
  /** Timeout for animations to complete */
  animation: 300,
  /** Small delay for UI to settle */
  settle: 500,
  /** Delay for network operations */
  network: 1000,
} as const;

// ============================================================================
// Test ID Selectors
// ============================================================================

/**
 * Common data-testid selectors organized by component/view
 */
export const TEST_IDS = {
  // Sidebar & Navigation
  sidebar: 'sidebar',
  navBoard: 'nav-board',
  navSpec: 'nav-spec',
  navContext: 'nav-context',
  navAgent: 'nav-agent',
  settingsButton: 'settings-button',
  openProjectButton: 'open-project-button',

  // Views
  boardView: 'board-view',
  specView: 'spec-view',
  contextView: 'context-view',
  agentView: 'agent-view',
  settingsView: 'settings-view',
  welcomeView: 'welcome-view',
  setupView: 'setup-view',

  // Board View Components
  addFeatureButton: 'add-feature-button',
  addFeatureDialog: 'add-feature-dialog',
  confirmAddFeature: 'confirm-add-feature',
  featureBranchInput: 'feature-input',
  featureCategoryInput: 'feature-category-input',
  worktreeSelector: 'worktree-selector',

  // Spec Editor
  specEditor: 'spec-editor',

  // File Browser Dialog
  pathInput: 'path-input',
  goToPathButton: 'go-to-path-button',

  // Context View
  contextFileList: 'context-file-list',
  addContextButton: 'add-context-button',
} as const;

// ============================================================================
// CSS Selectors
// ============================================================================

/**
 * Common CSS selectors for elements that don't have data-testid
 */
export const CSS_SELECTORS = {
  /** CodeMirror editor content area */
  codeMirrorContent: '.cm-content',
  /** Dialog elements */
  dialog: '[role="dialog"]',
  /** Sonner toast notifications */
  toast: '[data-sonner-toast]',
  toastError: '[data-sonner-toast][data-type="error"]',
  toastSuccess: '[data-sonner-toast][data-type="success"]',
  /** Command/combobox input (shadcn-ui cmdk) */
  commandInput: '[cmdk-input]',
  /** Radix dialog overlay */
  dialogOverlay: '[data-radix-dialog-overlay]',
} as const;

// ============================================================================
// Storage Keys
// ============================================================================

/**
 * localStorage keys used by the application
 */
export const STORAGE_KEYS = {
  appStorage: 'automaker-storage',
  setupStorage: 'automaker-setup',
} as const;

// ============================================================================
// Branch Name Utilities
// ============================================================================

/**
 * Sanitize a branch name to create a valid worktree directory name
 * @param branchName - The branch name to sanitize
 * @returns Sanitized name suitable for directory paths
 */
export function sanitizeBranchName(branchName: string): string {
  return branchName.replace(/[^a-zA-Z0-9_-]/g, '-');
}

// ============================================================================
// Default Values
// ============================================================================

/**
 * Default values used in test setup
 */
export const DEFAULTS = {
  projectName: 'Test Project',
  projectPath: '/mock/test-project',
  theme: 'dark' as const,
  maxConcurrency: 3,
} as const;
