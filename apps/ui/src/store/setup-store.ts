import { create } from 'zustand';
// Note: persist middleware removed - settings now sync via API (use-settings-sync.ts)

// CLI Installation Status
export interface CliStatus {
  installed: boolean;
  path: string | null;
  version: string | null;
  method: string;
  hasApiKey?: boolean;
  error?: string;
}

// GitHub CLI Status
export interface GhCliStatus {
  installed: boolean;
  authenticated: boolean;
  version: string | null;
  path: string | null;
  user: string | null;
  error?: string;
}

// Cursor CLI Status
export interface CursorCliStatus {
  installed: boolean;
  version?: string | null;
  path?: string | null;
  auth?: {
    authenticated: boolean;
    method: string;
  };
  installCommand?: string;
  loginCommand?: string;
  error?: string;
}

// Codex CLI Status
export interface CodexCliStatus {
  installed: boolean;
  version?: string | null;
  path?: string | null;
  auth?: {
    authenticated: boolean;
    method: string;
  };
  installCommand?: string;
  loginCommand?: string;
  error?: string;
}

// OpenCode CLI Status
export interface OpencodeCliStatus {
  installed: boolean;
  version?: string | null;
  path?: string | null;
  auth?: {
    authenticated: boolean;
    method: string;
  };
  installCommand?: string;
  loginCommand?: string;
  error?: string;
}

// Codex Auth Method
export type CodexAuthMethod =
  | 'api_key_env' // OPENAI_API_KEY environment variable
  | 'api_key' // Manually stored API key
  | 'cli_authenticated' // Codex CLI is installed and authenticated
  | 'none';

// Codex Auth Status
export interface CodexAuthStatus {
  authenticated: boolean;
  method: CodexAuthMethod;
  hasAuthFile?: boolean;
  hasApiKey?: boolean;
  hasEnvApiKey?: boolean;
  error?: string;
}

// Claude Auth Method - all possible authentication sources
export type ClaudeAuthMethod =
  | 'oauth_token_env'
  | 'oauth_token' // Stored OAuth token from claude login
  | 'api_key_env' // ANTHROPIC_API_KEY environment variable
  | 'api_key' // Manually stored API key
  | 'credentials_file' // Generic credentials file detection
  | 'cli_authenticated' // Claude CLI is installed and has active sessions/activity
  | 'none';

// Claude Auth Status
export interface ClaudeAuthStatus {
  authenticated: boolean;
  method: ClaudeAuthMethod;
  hasCredentialsFile?: boolean;
  oauthTokenValid?: boolean;
  apiKeyValid?: boolean;
  hasEnvOAuthToken?: boolean;
  hasEnvApiKey?: boolean;
  error?: string;
}

// Installation Progress
export interface InstallProgress {
  isInstalling: boolean;
  currentStep: string;
  progress: number; // 0-100
  output: string[];
  error?: string;
}

export type SetupStep =
  | 'welcome'
  | 'theme'
  | 'providers'
  | 'claude_detect'
  | 'claude_auth'
  | 'cursor'
  | 'codex'
  | 'opencode'
  | 'github'
  | 'complete';

export interface SetupState {
  // Setup wizard state
  isFirstRun: boolean;
  setupComplete: boolean;
  currentStep: SetupStep;

  // Claude CLI state
  claudeCliStatus: CliStatus | null;
  claudeAuthStatus: ClaudeAuthStatus | null;
  claudeInstallProgress: InstallProgress;
  claudeIsVerifying: boolean;

  // GitHub CLI state
  ghCliStatus: GhCliStatus | null;

  // Cursor CLI state
  cursorCliStatus: CursorCliStatus | null;

  // Codex CLI state
  codexCliStatus: CliStatus | null;
  codexAuthStatus: CodexAuthStatus | null;
  codexInstallProgress: InstallProgress;

  // OpenCode CLI state
  opencodeCliStatus: OpencodeCliStatus | null;

  // Setup preferences
  skipClaudeSetup: boolean;
}

export interface SetupActions {
  // Setup flow
  setCurrentStep: (step: SetupStep) => void;
  setSetupComplete: (complete: boolean) => void;
  completeSetup: () => void;
  resetSetup: () => void;
  setIsFirstRun: (isFirstRun: boolean) => void;

  // Claude CLI
  setClaudeCliStatus: (status: CliStatus | null) => void;
  setClaudeAuthStatus: (status: ClaudeAuthStatus | null) => void;
  setClaudeInstallProgress: (progress: Partial<InstallProgress>) => void;
  resetClaudeInstallProgress: () => void;
  setClaudeIsVerifying: (isVerifying: boolean) => void;

  // GitHub CLI
  setGhCliStatus: (status: GhCliStatus | null) => void;

  // Cursor CLI
  setCursorCliStatus: (status: CursorCliStatus | null) => void;

  // Codex CLI
  setCodexCliStatus: (status: CliStatus | null) => void;
  setCodexAuthStatus: (status: CodexAuthStatus | null) => void;
  setCodexInstallProgress: (progress: Partial<InstallProgress>) => void;
  resetCodexInstallProgress: () => void;

  // OpenCode CLI
  setOpencodeCliStatus: (status: OpencodeCliStatus | null) => void;

  // Preferences
  setSkipClaudeSetup: (skip: boolean) => void;
}

const initialInstallProgress: InstallProgress = {
  isInstalling: false,
  currentStep: '',
  progress: 0,
  output: [],
};

// Check if setup should be skipped (for E2E testing)
const shouldSkipSetup = import.meta.env.VITE_SKIP_SETUP === 'true';

const initialState: SetupState = {
  isFirstRun: !shouldSkipSetup,
  setupComplete: shouldSkipSetup,
  currentStep: shouldSkipSetup ? 'complete' : 'welcome',

  claudeCliStatus: null,
  claudeAuthStatus: null,
  claudeInstallProgress: { ...initialInstallProgress },
  claudeIsVerifying: false,

  ghCliStatus: null,
  cursorCliStatus: null,

  codexCliStatus: null,
  codexAuthStatus: null,
  codexInstallProgress: { ...initialInstallProgress },

  opencodeCliStatus: null,

  skipClaudeSetup: shouldSkipSetup,
};

export const useSetupStore = create<SetupState & SetupActions>()((set, get) => ({
  ...initialState,

  // Setup flow
  setCurrentStep: (step) => set({ currentStep: step }),

  setSetupComplete: (complete) =>
    set({
      setupComplete: complete,
      currentStep: complete ? 'complete' : 'welcome',
    }),

  completeSetup: () => set({ setupComplete: true, currentStep: 'complete' }),

  resetSetup: () =>
    set({
      ...initialState,
      isFirstRun: false, // Don't reset first run flag
    }),

  setIsFirstRun: (isFirstRun) => set({ isFirstRun }),

  // Claude CLI
  setClaudeCliStatus: (status) => set({ claudeCliStatus: status }),

  setClaudeAuthStatus: (status) => set({ claudeAuthStatus: status }),

  setClaudeInstallProgress: (progress) =>
    set({
      claudeInstallProgress: {
        ...get().claudeInstallProgress,
        ...progress,
      },
    }),

  resetClaudeInstallProgress: () =>
    set({
      claudeInstallProgress: { ...initialInstallProgress },
    }),

  setClaudeIsVerifying: (isVerifying) => set({ claudeIsVerifying: isVerifying }),

  // GitHub CLI
  setGhCliStatus: (status) => set({ ghCliStatus: status }),

  // Cursor CLI
  setCursorCliStatus: (status) => set({ cursorCliStatus: status }),

  // Codex CLI
  setCodexCliStatus: (status) => set({ codexCliStatus: status }),

  setCodexAuthStatus: (status) => set({ codexAuthStatus: status }),

  setCodexInstallProgress: (progress) =>
    set({
      codexInstallProgress: {
        ...get().codexInstallProgress,
        ...progress,
      },
    }),

  resetCodexInstallProgress: () =>
    set({
      codexInstallProgress: { ...initialInstallProgress },
    }),

  // OpenCode CLI
  setOpencodeCliStatus: (status) => set({ opencodeCliStatus: status }),

  // Preferences
  setSkipClaudeSetup: (skip) => set({ skipClaudeSetup: skip }),
}));
