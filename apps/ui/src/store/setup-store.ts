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
  | 'claude_detect'
  | 'claude_auth'
  | 'cursor'
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

  // GitHub CLI state
  ghCliStatus: GhCliStatus | null;

  // Cursor CLI state
  cursorCliStatus: CursorCliStatus | null;

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

  // GitHub CLI
  setGhCliStatus: (status: GhCliStatus | null) => void;

  // Cursor CLI
  setCursorCliStatus: (status: CursorCliStatus | null) => void;

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

  ghCliStatus: null,
  cursorCliStatus: null,

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

      // Cursor CLI
      setCursorCliStatus: (status) => set({ cursorCliStatus: status }),

      // Preferences
      setSkipClaudeSetup: (skip) => set({ skipClaudeSetup: skip }),
    }),
    {
      name: 'automaker-setup',
      version: 1, // Add version field for proper hydration (matches app-store pattern)
      partialize: (state) => ({
        isFirstRun: state.isFirstRun,
        setupComplete: state.setupComplete,
        skipClaudeSetup: state.skipClaudeSetup,
        claudeAuthStatus: state.claudeAuthStatus,
      }),
    }
  )
);
