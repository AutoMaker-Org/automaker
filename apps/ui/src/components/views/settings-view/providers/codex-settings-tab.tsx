import { useState, useCallback, useEffect } from 'react';
import { useAppStore } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';
import { CodexCliStatus } from '../cli-status/codex-cli-status';
import { CodexSettings } from '../codex/codex-settings';
import { CodexUsageSection } from '../codex/codex-usage-section';
import { CodexModelConfiguration } from './codex-model-configuration';
import { getElectronAPI } from '@/lib/electron';
import { createLogger } from '@automaker/utils/logger';
import type { CliStatus as SharedCliStatus } from '../shared/types';
import type { CodexModelId } from '@automaker/types';

const logger = createLogger('CodexSettings');

export function CodexSettingsTab() {
  const {
    codexAutoLoadAgents,
    codexSandboxMode,
    codexApprovalPolicy,
    codexEnableWebSearch,
    codexEnableImages,
    enabledCodexModels,
    codexDefaultModel,
    setCodexAutoLoadAgents,
    setCodexSandboxMode,
    setCodexApprovalPolicy,
    setCodexEnableWebSearch,
    setCodexEnableImages,
    setEnabledCodexModels,
    setCodexDefaultModel,
    toggleCodexModel,
  } = useAppStore();

  const {
    codexAuthStatus,
    codexCliStatus: setupCliStatus,
    setCodexCliStatus,
    setCodexAuthStatus,
  } = useSetupStore();

  const [isCheckingCodexCli, setIsCheckingCodexCli] = useState(false);
  const [displayCliStatus, setDisplayCliStatus] = useState<SharedCliStatus | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const codexCliStatus: SharedCliStatus | null =
    displayCliStatus ||
    (setupCliStatus
      ? {
          success: true,
          status: setupCliStatus.installed ? 'installed' : 'not_installed',
          method: setupCliStatus.method,
          version: setupCliStatus.version || undefined,
          path: setupCliStatus.path || undefined,
        }
      : null);

  // Load Codex CLI status and auth status on mount
  useEffect(() => {
    const checkCodexStatus = async () => {
      const api = getElectronAPI();
      if (api?.setup?.getCodexStatus) {
        try {
          const result = await api.setup.getCodexStatus();
          setDisplayCliStatus({
            success: result.success,
            status: result.installed ? 'installed' : 'not_installed',
            method: result.auth?.method,
            version: result.version,
            path: result.path,
            recommendation: result.recommendation,
            installCommands: result.installCommands,
          });
          setCodexCliStatus({
            installed: result.installed,
            version: result.version,
            path: result.path,
            method: result.auth?.method || 'none',
          });
          if (result.auth) {
            setCodexAuthStatus({
              authenticated: result.auth.authenticated,
              method: result.auth.method as
                | 'cli_authenticated'
                | 'api_key'
                | 'api_key_env'
                | 'none',
              hasAuthFile: result.auth.method === 'cli_authenticated',
              hasApiKey: result.auth.hasApiKey,
            });
          }
        } catch (error) {
          logger.error('Failed to check Codex CLI status:', error);
        }
      }
    };
    checkCodexStatus();
  }, [setCodexCliStatus, setCodexAuthStatus]);

  const handleRefreshCodexCli = useCallback(async () => {
    setIsCheckingCodexCli(true);
    try {
      const api = getElectronAPI();
      if (api?.setup?.getCodexStatus) {
        const result = await api.setup.getCodexStatus();
        setDisplayCliStatus({
          success: result.success,
          status: result.installed ? 'installed' : 'not_installed',
          method: result.auth?.method,
          version: result.version,
          path: result.path,
          recommendation: result.recommendation,
          installCommands: result.installCommands,
        });
        setCodexCliStatus({
          installed: result.installed,
          version: result.version,
          path: result.path,
          method: result.auth?.method || 'none',
        });
        if (result.auth) {
          setCodexAuthStatus({
            authenticated: result.auth.authenticated,
            method: result.auth.method as 'cli_authenticated' | 'api_key' | 'api_key_env' | 'none',
            hasAuthFile: result.auth.method === 'cli_authenticated',
            hasApiKey: result.auth.hasApiKey,
          });
        }
      }
    } catch (error) {
      logger.error('Failed to refresh Codex CLI status:', error);
    } finally {
      setIsCheckingCodexCli(false);
    }
  }, [setCodexCliStatus, setCodexAuthStatus]);

  const handleDefaultModelChange = useCallback(
    (model: CodexModelId) => {
      setIsSaving(true);
      try {
        setCodexDefaultModel(model);
      } finally {
        setIsSaving(false);
      }
    },
    [setCodexDefaultModel]
  );

  const handleModelToggle = useCallback(
    (model: CodexModelId, enabled: boolean) => {
      setIsSaving(true);
      try {
        toggleCodexModel(model, enabled);
      } finally {
        setIsSaving(false);
      }
    },
    [toggleCodexModel]
  );

  const showUsageTracking = codexAuthStatus?.authenticated ?? false;
  const authStatusToDisplay = codexAuthStatus;

  return (
    <div className="space-y-6">
      <CodexCliStatus
        status={codexCliStatus}
        authStatus={authStatusToDisplay}
        isChecking={isCheckingCodexCli}
        onRefresh={handleRefreshCodexCli}
      />

      {showUsageTracking && <CodexUsageSection />}

      <CodexModelConfiguration
        enabledCodexModels={enabledCodexModels}
        codexDefaultModel={codexDefaultModel}
        isSaving={isSaving}
        onDefaultModelChange={handleDefaultModelChange}
        onModelToggle={handleModelToggle}
      />

      <CodexSettings
        autoLoadCodexAgents={codexAutoLoadAgents}
        codexEnableWebSearch={codexEnableWebSearch}
        codexEnableImages={codexEnableImages}
        onAutoLoadCodexAgentsChange={setCodexAutoLoadAgents}
        onCodexEnableWebSearchChange={setCodexEnableWebSearch}
        onCodexEnableImagesChange={setCodexEnableImages}
      />
    </div>
  );
}

export default CodexSettingsTab;
