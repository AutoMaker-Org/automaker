import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// CLI Installation Status
export interface CliStatus {
  installed: boolean;
  path: string | null;
  version: string | null;
  method: string;
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

// Cursor Auth Method
export type CursorAuthMethod = 'api_key_env' | 'api_key' | 'config_file' | 'none';

// Cursor Auth Status
export interface CursorAuthStatus {
  authenticated: boolean;
  method: CursorAuthMethod;
  hasApiKey?: boolean;
  apiKeyValid?: boolean;
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
  | 'cursor_setup'
  | 'codex_setup'
  | 'opencode_setup'
  | 'claude_detect'
  | 'claude_auth'
  | 'github'
  | 'complete';

export interface SetupState {
  // Setup wizard state
  isFirstRun: boolean;
  setupComplete: boolean;
  currentStep: SetupStep;

  // Cursor CLI state
  cursorCliStatus: CliStatus | null;
  cursorAuthStatus: CursorAuthStatus | null;
  cursorInstallProgress: InstallProgress;

  // Claude CLI state
  claudeCliStatus: CliStatus | null;
  claudeAuthStatus: ClaudeAuthStatus | null;
  claudeInstallProgress: InstallProgress;

  // GitHub CLI state
  ghCliStatus: GhCliStatus | null;

  // Setup preferences
  skipCursorSetup: boolean;
  skipCodexSetup: boolean;
  skipOpenCodeSetup: boolean;
  skipClaudeSetup: boolean;
}

export interface SetupActions {
  // Setup flow
  setCurrentStep: (step: SetupStep) => void;
  setSetupComplete: (complete: boolean) => void;
  completeSetup: () => void;
  resetSetup: () => void;
  setIsFirstRun: (isFirstRun: boolean) => void;

  // Cursor CLI
  setCursorCliStatus: (status: CliStatus | null) => void;
  setCursorAuthStatus: (status: CursorAuthStatus | null) => void;
  setCursorInstallProgress: (progress: Partial<InstallProgress>) => void;
  resetCursorInstallProgress: () => void;

  // Claude CLI
  setClaudeCliStatus: (status: CliStatus | null) => void;
  setClaudeAuthStatus: (status: ClaudeAuthStatus | null) => void;
  setClaudeInstallProgress: (progress: Partial<InstallProgress>) => void;
  resetClaudeInstallProgress: () => void;

  // GitHub CLI
  setGhCliStatus: (status: GhCliStatus | null) => void;

  // Preferences
  setSkipCursorSetup: (skip: boolean) => void;
  setSkipCodexSetup: (skip: boolean) => void;
  setSkipOpenCodeSetup: (skip: boolean) => void;
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

  cursorCliStatus: null,
  cursorAuthStatus: null,
  cursorInstallProgress: { ...initialInstallProgress },

  claudeCliStatus: null,
  claudeAuthStatus: null,
  claudeInstallProgress: { ...initialInstallProgress },

  ghCliStatus: null,

  skipCursorSetup: shouldSkipSetup,
  skipCodexSetup: shouldSkipSetup,
  skipOpenCodeSetup: shouldSkipSetup,
  skipClaudeSetup: shouldSkipSetup,
};

export const useSetupStore = create<SetupState & SetupActions>()(
  persist(
    (set, get) => ({
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

      // Cursor CLI
      setCursorCliStatus: (status) => set({ cursorCliStatus: status }),

      setCursorAuthStatus: (status) => set({ cursorAuthStatus: status }),

      setCursorInstallProgress: (progress) =>
        set({
          cursorInstallProgress: {
            ...get().cursorInstallProgress,
            ...progress,
          },
        }),

      resetCursorInstallProgress: () =>
        set({
          cursorInstallProgress: { ...initialInstallProgress },
        }),

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

      // GitHub CLI
      setGhCliStatus: (status) => set({ ghCliStatus: status }),

      // Preferences
      setSkipCursorSetup: (skip) => set({ skipCursorSetup: skip }),
      setSkipCodexSetup: (skip) => set({ skipCodexSetup: skip }),
      setSkipOpenCodeSetup: (skip) => set({ skipOpenCodeSetup: skip }),
      setSkipClaudeSetup: (skip) => set({ skipClaudeSetup: skip }),
    }),
    {
      name: 'automaker-setup',
      version: 1, // Add version field for proper hydration (matches app-store pattern)
      partialize: (state) => ({
        isFirstRun: state.isFirstRun,
        setupComplete: state.setupComplete,
        skipCursorSetup: state.skipCursorSetup,
        skipCodexSetup: state.skipCodexSetup,
        skipOpenCodeSetup: state.skipOpenCodeSetup,
        skipClaudeSetup: state.skipClaudeSetup,
        claudeAuthStatus: state.claudeAuthStatus,
      }),
    }
  )
);
