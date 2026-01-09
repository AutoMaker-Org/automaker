// @ts-nocheck
import { useMemo, useCallback } from 'react';
import { useSetupStore } from '@/store/setup-store';
import { getElectronAPI } from '@/lib/electron';
import { CliSetupStep } from './cli-setup-step';
import type { CodexAuthStatus } from '@/store/setup-store';

interface CodexSetupStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export function CodexSetupStep({ onNext, onBack, onSkip }: CodexSetupStepProps) {
  const {
    codexCliStatus,
    codexAuthStatus,
    setCodexCliStatus,
    setCodexAuthStatus,
    setCodexInstallProgress,
  } = useSetupStore();

  const statusApi = useCallback(
    () => getElectronAPI().setup?.getCodexStatus() || Promise.reject(),
    []
  );

  const installApi = useCallback(
    () => getElectronAPI().setup?.installCodex() || Promise.reject(),
    []
  );

  const verifyAuthApi = useCallback(
    (method: 'cli' | 'api_key', apiKey?: string) =>
      getElectronAPI().setup?.verifyCodexAuth(method, apiKey) || Promise.reject(),
    []
  );

  const config = useMemo(
    () => ({
      cliType: 'codex' as const,
      displayName: 'Codex',
      cliLabel: 'Codex CLI',
      cliDescription: 'Use Codex CLI login',
      apiKeyLabel: 'OpenAI API Key',
      apiKeyDescription: 'Optional API key for Codex',
      apiKeyProvider: 'openai' as const,
      apiKeyPlaceholder: 'sk-...',
      apiKeyDocsUrl: 'https://platform.openai.com/api-keys',
      apiKeyDocsLabel: 'Get one from OpenAI',
      apiKeyHelpText: "Don't have an API key?",
      installCommands: {
        macos: 'npm install -g @openai/codex',
        windows: 'npm install -g @openai/codex',
      },
      cliLoginCommand: 'codex login',
      testIds: {
        installButton: 'install-codex-button',
        verifyCliButton: 'verify-codex-cli-button',
        verifyApiKeyButton: 'verify-codex-api-key-button',
        apiKeyInput: 'openai-api-key-input',
        saveApiKeyButton: 'save-openai-key-button',
        deleteApiKeyButton: 'delete-openai-key-button',
        nextButton: 'codex-next-button',
      },
      buildCliAuthStatus: (_previous: CodexAuthStatus | null) => ({
        authenticated: true,
        method: 'cli_authenticated',
        hasAuthFile: true,
      }),
      buildApiKeyAuthStatus: (_previous: CodexAuthStatus | null) => ({
        authenticated: true,
        method: 'api_key',
        hasApiKey: true,
      }),
      buildClearedAuthStatus: (_previous: CodexAuthStatus | null) => ({
        authenticated: false,
        method: 'none',
      }),
      statusApi,
      installApi,
      verifyAuthApi,
    }),
    [installApi, statusApi, verifyAuthApi]
  );

  return (
    <CliSetupStep
      config={config}
      state={{
        cliStatus: codexCliStatus,
        authStatus: codexAuthStatus,
        setCliStatus: setCodexCliStatus,
        setAuthStatus: setCodexAuthStatus,
        setInstallProgress: setCodexInstallProgress,
        getStoreState: () => useSetupStore.getState().codexCliStatus,
      }}
      onNext={onNext}
      onBack={onBack}
      onSkip={onSkip}
    />
  );
}
