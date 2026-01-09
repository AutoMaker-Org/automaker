import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/app-store';
import {
  OpencodeCliStatus,
  OpencodeCliStatusSkeleton,
  OpencodeModelConfigSkeleton,
} from '../cli-status/opencode-cli-status';
import { OpencodeModelConfiguration } from './opencode-model-configuration';
import { getElectronAPI } from '@/lib/electron';
import { createLogger } from '@automaker/utils/logger';
import type { CliStatus as SharedCliStatus } from '../shared/types';
import type { OpencodeModelId } from '@automaker/types';
import type { OpencodeAuthStatus } from '../cli-status/opencode-cli-status';

const logger = createLogger('OpencodeSettings');

export function OpencodeSettingsTab() {
  const {
    enabledOpencodeModels,
    opencodeDefaultModel,
    setOpencodeDefaultModel,
    toggleOpencodeModel,
  } = useAppStore();

  const [isCheckingOpencodeCli, setIsCheckingOpencodeCli] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [cliStatus, setCliStatus] = useState<SharedCliStatus | null>(null);
  const [authStatus, setAuthStatus] = useState<OpencodeAuthStatus | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Load OpenCode CLI status on mount
  useEffect(() => {
    const checkOpencodeStatus = async () => {
      setIsCheckingOpencodeCli(true);
      try {
        const api = getElectronAPI();
        if (api?.setup?.getOpencodeStatus) {
          const result = await api.setup.getOpencodeStatus();
          setCliStatus({
            success: result.success,
            status: result.installed ? 'installed' : 'not_installed',
            method: result.auth?.method,
            version: result.version,
            path: result.path,
            recommendation: result.recommendation,
            installCommands: result.installCommands,
          });
          // Set auth status if available
          if (result.auth) {
            setAuthStatus({
              authenticated: result.auth.authenticated,
              method: (result.auth.method as OpencodeAuthStatus['method']) || 'none',
              hasApiKey: result.auth.hasApiKey,
              hasEnvApiKey: result.auth.hasEnvApiKey,
              hasOAuthToken: result.auth.hasOAuthToken,
            });
          }
        } else {
          // Fallback for web mode or when API is not available
          setCliStatus({
            success: false,
            status: 'not_installed',
            recommendation: 'OpenCode CLI detection is only available in desktop mode.',
          });
        }
      } catch (error) {
        logger.error('Failed to check OpenCode CLI status:', error);
        setCliStatus({
          success: false,
          status: 'not_installed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        setIsCheckingOpencodeCli(false);
        setIsInitialLoading(false);
      }
    };
    checkOpencodeStatus();
  }, []);

  const handleRefreshOpencodeCli = useCallback(async () => {
    setIsCheckingOpencodeCli(true);
    try {
      const api = getElectronAPI();
      if (api?.setup?.getOpencodeStatus) {
        const result = await api.setup.getOpencodeStatus();
        setCliStatus({
          success: result.success,
          status: result.installed ? 'installed' : 'not_installed',
          method: result.auth?.method,
          version: result.version,
          path: result.path,
          recommendation: result.recommendation,
          installCommands: result.installCommands,
        });
        // Update auth status if available
        if (result.auth) {
          setAuthStatus({
            authenticated: result.auth.authenticated,
            method: (result.auth.method as OpencodeAuthStatus['method']) || 'none',
            hasApiKey: result.auth.hasApiKey,
            hasEnvApiKey: result.auth.hasEnvApiKey,
            hasOAuthToken: result.auth.hasOAuthToken,
          });
        }
      }
    } catch (error) {
      logger.error('Failed to refresh OpenCode CLI status:', error);
      toast.error('Failed to refresh OpenCode CLI status');
    } finally {
      setIsCheckingOpencodeCli(false);
    }
  }, []);

  const handleDefaultModelChange = useCallback(
    (model: OpencodeModelId) => {
      setIsSaving(true);
      try {
        setOpencodeDefaultModel(model);
        toast.success('Default model updated');
      } catch (error) {
        toast.error('Failed to update default model');
      } finally {
        setIsSaving(false);
      }
    },
    [setOpencodeDefaultModel]
  );

  const handleModelToggle = useCallback(
    (model: OpencodeModelId, enabled: boolean) => {
      setIsSaving(true);
      try {
        toggleOpencodeModel(model, enabled);
      } catch (error) {
        toast.error('Failed to update models');
      } finally {
        setIsSaving(false);
      }
    },
    [toggleOpencodeModel]
  );

  // Show loading skeleton during initial load
  if (isInitialLoading) {
    return (
      <div className="space-y-6">
        <OpencodeCliStatusSkeleton />
        <OpencodeModelConfigSkeleton />
      </div>
    );
  }

  const isCliInstalled = cliStatus?.success && cliStatus?.status === 'installed';

  return (
    <div className="space-y-6">
      <OpencodeCliStatus
        status={cliStatus}
        authStatus={authStatus}
        isChecking={isCheckingOpencodeCli}
        onRefresh={handleRefreshOpencodeCli}
      />

      {/* Model Configuration - Only show when CLI is installed */}
      {isCliInstalled && (
        <OpencodeModelConfiguration
          enabledOpencodeModels={enabledOpencodeModels}
          opencodeDefaultModel={opencodeDefaultModel}
          isSaving={isSaving}
          onDefaultModelChange={handleDefaultModelChange}
          onModelToggle={handleModelToggle}
        />
      )}
    </div>
  );
}

export default OpencodeSettingsTab;
