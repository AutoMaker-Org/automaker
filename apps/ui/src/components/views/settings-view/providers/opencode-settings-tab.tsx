import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/app-store';
import { OpencodeCliStatus, OpencodeCliStatusSkeleton } from '../cli-status/opencode-cli-status';
import { OpencodeModelConfiguration } from './opencode-model-configuration';
import { getElectronAPI } from '@/lib/electron';
import { createLogger } from '@automaker/utils/logger';
import type { CliStatus as SharedCliStatus } from '../shared/types';
import type { OpencodeModelId } from '@automaker/types';
import type { OpencodeAuthStatus, OpenCodeProviderInfo } from '../cli-status/opencode-cli-status';

const logger = createLogger('OpencodeSettings');

export function OpencodeSettingsTab() {
  const {
    enabledOpencodeModels,
    opencodeDefaultModel,
    setOpencodeDefaultModel,
    toggleOpencodeModel,
    setDynamicOpencodeModels,
    dynamicOpencodeModels,
    enabledDynamicModelIds,
    toggleDynamicModel,
    cachedOpencodeProviders,
    setCachedOpencodeProviders,
  } = useAppStore();

  const [isCheckingOpencodeCli, setIsCheckingOpencodeCli] = useState(false);
  const [isLoadingDynamicModels, setIsLoadingDynamicModels] = useState(false);
  const [cliStatus, setCliStatus] = useState<SharedCliStatus | null>(null);
  const [authStatus, setAuthStatus] = useState<OpencodeAuthStatus | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Phase 1: Load CLI status quickly on mount
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
      }
    };
    checkOpencodeStatus();
  }, []);

  // Phase 2: Load dynamic models and providers in background (only if not cached)
  useEffect(() => {
    const loadDynamicContent = async () => {
      const api = getElectronAPI();
      const isInstalled = cliStatus?.success && cliStatus?.status === 'installed';

      if (!isInstalled || !api?.setup) return;

      // Skip if already have cached data
      const needsProviders = cachedOpencodeProviders.length === 0;
      const needsModels = dynamicOpencodeModels.length === 0;

      if (!needsProviders && !needsModels) return;

      setIsLoadingDynamicModels(true);
      try {
        // Load providers if needed
        if (needsProviders && api.setup.getOpencodeProviders) {
          const providersResult = await api.setup.getOpencodeProviders();
          if (providersResult.success && providersResult.providers) {
            setCachedOpencodeProviders(providersResult.providers);
          }
        }

        // Load models if needed
        if (needsModels && api.setup.getOpencodeModels) {
          const modelsResult = await api.setup.getOpencodeModels();
          if (modelsResult.success && modelsResult.models) {
            setDynamicOpencodeModels(modelsResult.models);
          }
        }
      } catch (error) {
        logger.error('Failed to load dynamic content:', error);
      } finally {
        setIsLoadingDynamicModels(false);
      }
    };
    loadDynamicContent();
  }, [cliStatus?.success, cliStatus?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefreshOpencodeCli = useCallback(async () => {
    setIsCheckingOpencodeCli(true);
    setIsLoadingDynamicModels(true);
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
        if (result.auth) {
          setAuthStatus({
            authenticated: result.auth.authenticated,
            method: (result.auth.method as OpencodeAuthStatus['method']) || 'none',
            hasApiKey: result.auth.hasApiKey,
            hasEnvApiKey: result.auth.hasEnvApiKey,
            hasOAuthToken: result.auth.hasOAuthToken,
          });
        }

        if (result.installed) {
          // Refresh providers
          if (api?.setup?.getOpencodeProviders) {
            const providersResult = await api.setup.getOpencodeProviders();
            if (providersResult.success && providersResult.providers) {
              setCachedOpencodeProviders(providersResult.providers);
            }
          }

          // Refresh dynamic models
          if (api?.setup?.refreshOpencodeModels) {
            const modelsResult = await api.setup.refreshOpencodeModels();
            if (modelsResult.success && modelsResult.models) {
              setDynamicOpencodeModels(modelsResult.models);
            }
          }

          toast.success('OpenCode CLI refreshed');
        }
      }
    } catch (error) {
      logger.error('Failed to refresh OpenCode CLI status:', error);
      toast.error('Failed to refresh OpenCode CLI status');
    } finally {
      setIsCheckingOpencodeCli(false);
      setIsLoadingDynamicModels(false);
    }
  }, [setDynamicOpencodeModels, setCachedOpencodeProviders]);

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

  const handleDynamicModelToggle = useCallback(
    (modelId: string, enabled: boolean) => {
      setIsSaving(true);
      try {
        toggleDynamicModel(modelId, enabled);
      } catch (error) {
        toast.error('Failed to update dynamic model');
      } finally {
        setIsSaving(false);
      }
    },
    [toggleDynamicModel]
  );

  // Show skeleton only while checking CLI status initially
  if (!cliStatus && isCheckingOpencodeCli) {
    return (
      <div className="space-y-6">
        <OpencodeCliStatusSkeleton />
      </div>
    );
  }

  const isCliInstalled = cliStatus?.success && cliStatus?.status === 'installed';

  return (
    <div className="space-y-6">
      <OpencodeCliStatus
        status={cliStatus}
        authStatus={authStatus}
        providers={cachedOpencodeProviders as OpenCodeProviderInfo[]}
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
          dynamicModels={dynamicOpencodeModels}
          enabledDynamicModelIds={enabledDynamicModelIds}
          onDynamicModelToggle={handleDynamicModelToggle}
          isLoadingDynamicModels={isLoadingDynamicModels}
        />
      )}
    </div>
  );
}

export default OpencodeSettingsTab;
