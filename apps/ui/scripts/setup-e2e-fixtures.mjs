#!/usr/bin/env node

/**
 * Setup script for E2E test fixtures
 * Creates the necessary test fixture directories and files before running Playwright tests
 * Also resets the server's settings.json to a known state for test isolation
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve workspace root (apps/ui/scripts -> workspace root)
const WORKSPACE_ROOT = path.resolve(__dirname, '../../..');
const FIXTURE_PATH = path.join(WORKSPACE_ROOT, 'test/fixtures/projectA');
const SPEC_FILE_PATH = path.join(FIXTURE_PATH, '.automaker/app_spec.txt');
const SERVER_SETTINGS_PATH = path.join(WORKSPACE_ROOT, 'apps/server/data/settings.json');
// Create a shared test workspace directory that will be used as default for project creation
const TEST_WORKSPACE_DIR = path.join(os.tmpdir(), 'automaker-e2e-workspace');

const SPEC_CONTENT = `<app_spec>
  <name>Test Project A</name>
  <description>A test fixture project for Playwright testing</description>
  <tech_stack>
    <item>TypeScript</item>
    <item>React</item>
  </tech_stack>
</app_spec>
`;

// Clean settings.json for E2E tests - no current project so localStorage can control state
const E2E_SETTINGS = {
  version: 4,
  setupComplete: true,
  isFirstRun: false,
  skipClaudeSetup: false,
  theme: 'dark',
  sidebarOpen: true,
  chatHistoryOpen: false,
  maxConcurrency: 3,
  defaultSkipTests: true,
  enableDependencyBlocking: true,
  skipVerificationInAutoMode: false,
  useWorktrees: true,
  defaultPlanningMode: 'skip',
  defaultRequirePlanApproval: false,
  muteDoneSound: false,
  phaseModels: {
    enhancementModel: { model: 'sonnet' },
    fileDescriptionModel: { model: 'haiku' },
    imageDescriptionModel: { model: 'haiku' },
    validationModel: { model: 'sonnet' },
    specGenerationModel: { model: 'opus' },
    featureGenerationModel: { model: 'sonnet' },
    backlogPlanningModel: { model: 'sonnet' },
    projectAnalysisModel: { model: 'sonnet' },
    suggestionsModel: { model: 'sonnet' },
  },
  enhancementModel: 'sonnet',
  validationModel: 'opus',
  enabledCursorModels: ['auto', 'composer-1'],
  cursorDefaultModel: 'auto',
  keyboardShortcuts: {
    board: 'K',
    agent: 'A',
    spec: 'D',
    context: 'C',
    settings: 'S',
    terminal: 'T',
    toggleSidebar: '`',
    addFeature: 'N',
    addContextFile: 'N',
    startNext: 'G',
    newSession: 'N',
    openProject: 'O',
    projectPicker: 'P',
    cyclePrevProject: 'Q',
    cycleNextProject: 'E',
    splitTerminalRight: 'Alt+D',
    splitTerminalDown: 'Alt+S',
    closeTerminal: 'Alt+W',
    tools: 'T',
    ideation: 'I',
    githubIssues: 'G',
    githubPrs: 'R',
    newTerminalTab: 'Alt+T',
  },
  // Default test project using the fixture path - tests can override via route mocking if needed
  projects: [
    {
      id: 'e2e-default-project',
      name: 'E2E Test Project',
      path: FIXTURE_PATH,
      lastOpened: new Date().toISOString(),
    },
  ],
  trashedProjects: [],
  currentProjectId: 'e2e-default-project',
  projectHistory: [],
  projectHistoryIndex: 0,
  lastProjectDir: TEST_WORKSPACE_DIR,
  recentFolders: [],
  worktreePanelCollapsed: false,
  lastSelectedSessionByProject: {},
  autoLoadClaudeMd: false,
  skipSandboxWarning: true,
  codexAutoLoadAgents: false,
  codexSandboxMode: 'workspace-write',
  codexApprovalPolicy: 'on-request',
  codexEnableWebSearch: false,
  codexEnableImages: true,
  codexAdditionalDirs: [],
  mcpServers: [],
  enableSandboxMode: false,
  mcpAutoApproveTools: true,
  mcpUnrestrictedTools: true,
  promptCustomization: {},
  localStorageMigrated: true,
};

function setupFixtures() {
  console.log('Setting up E2E test fixtures...');
  console.log(`Workspace root: ${WORKSPACE_ROOT}`);
  console.log(`Fixture path: ${FIXTURE_PATH}`);
  console.log(`Test workspace dir: ${TEST_WORKSPACE_DIR}`);

  // Create test workspace directory for project creation tests
  if (!fs.existsSync(TEST_WORKSPACE_DIR)) {
    fs.mkdirSync(TEST_WORKSPACE_DIR, { recursive: true });
    console.log(`Created test workspace directory: ${TEST_WORKSPACE_DIR}`);
  }

  // Create fixture directory
  const specDir = path.dirname(SPEC_FILE_PATH);
  if (!fs.existsSync(specDir)) {
    fs.mkdirSync(specDir, { recursive: true });
    console.log(`Created directory: ${specDir}`);
  }

  // Create app_spec.txt
  fs.writeFileSync(SPEC_FILE_PATH, SPEC_CONTENT);
  console.log(`Created fixture file: ${SPEC_FILE_PATH}`);

  // Reset server settings.json to a clean state for E2E tests
  const settingsDir = path.dirname(SERVER_SETTINGS_PATH);
  if (!fs.existsSync(settingsDir)) {
    fs.mkdirSync(settingsDir, { recursive: true });
    console.log(`Created directory: ${settingsDir}`);
  }
  fs.writeFileSync(SERVER_SETTINGS_PATH, JSON.stringify(E2E_SETTINGS, null, 2));
  console.log(`Reset server settings: ${SERVER_SETTINGS_PATH}`);

  console.log('E2E test fixtures setup complete!');
}

setupFixtures();
