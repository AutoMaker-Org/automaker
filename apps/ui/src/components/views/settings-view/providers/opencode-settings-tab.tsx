import { useState, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAppStore } from '@/store/app-store';
import { OpencodeCliStatus, OpencodeCliStatusSkeleton } from '../cli-status/opencode-cli-status';
import { OpencodeModelConfiguration } from './opencode-model-configuration';
import { ProviderToggle } from './provider-toggle';
import { useOpencodeCliStatus, useOpencodeProviders, useOpencodeModels } from '@/hooks/queries';
import { queryKeys } from '@/lib/query-keys';
import type { CliStatus as SharedCliStatus } from '../shared/types';
import type { OpencodeModelId } from '@automaker/types';
import type { OpencodeAuthStatus, OpenCodeProviderInfo } from '../cli-status/opencode-cli-status';

export function OpencodeSettingsTab() {
  const queryClient = useQueryClient();
  const {
    enabledOpencodeModels,
    opencodeDefaultModel,
    setOpencodeDefaultModel,
    toggleOpencodeModel,
    enabledDynamicModelIds,
    toggleDynamicModel,
  } = useAppStore();

  const [isSaving, setIsSaving] = useState(false);

  // React Query hooks for data fetching
  const {
    data: cliStatusData,
    isLoading: isCheckingOpencodeCli,
    refetch: refetchCliStatus,
  } = useOpencodeCliStatus();

  const isCliInstalled = cliStatusData?.installed ?? false;

  const { data: providersData = [], isFetching: isFetchingProviders } = useOpencodeProviders();

  const { data: modelsData = [], isFetching: isFetchingModels } = useOpencodeModels();

  // Transform CLI status to the expected format
  const cliStatus = useMemo((): SharedCliStatus | null => {
    if (!cliStatusData) return null;
    return {
      success: cliStatusData.success ?? false,
      status: cliStatusData.installed ? 'installed' : 'not_installed',
      method: cliStatusData.auth?.method,
      version: cliStatusData.version,
      path: cliStatusData.path,
      recommendation: cliStatusData.recommendation,
      installCommands: cliStatusData.installCommands,
    };
  }, [cliStatusData]);

  // Transform auth status to the expected format
  const authStatus = useMemo((): OpencodeAuthStatus | null => {
    if (!cliStatusData?.auth) return null;
    return {
      authenticated: cliStatusData.auth.authenticated,
      method: (cliStatusData.auth.method as OpencodeAuthStatus['method']) || 'none',
      hasApiKey: cliStatusData.auth.hasApiKey,
      hasEnvApiKey: cliStatusData.auth.hasEnvApiKey,
      hasOAuthToken: cliStatusData.auth.hasOAuthToken,
      error: cliStatusData.auth.error,
    };
  }, [cliStatusData]);

  // Refresh all opencode-related queries
  const handleRefreshOpencodeCli = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.cli.opencode() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.models.opencodeProviders() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.models.opencode() }),
    ]);
    await refetchCliStatus();
    toast.success('OpenCode CLI refreshed');
  }, [queryClient, refetchCliStatus]);

  const handleDefaultModelChange = useCallback(
    (model: OpencodeModelId) => {
      setIsSaving(true);
      try {
        setOpencodeDefaultModel(model);
        toast.success('Default model updated');
      } catch {
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
      } catch {
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
      } catch {
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

  const isLoadingDynamicModels = isFetchingProviders || isFetchingModels;

  return (
    <div className="space-y-6">
      {/* Provider Visibility Toggle */}
      <ProviderToggle provider="opencode" providerLabel="OpenCode" />

      <OpencodeCliStatus
        status={cliStatus}
        authStatus={authStatus}
        providers={providersData as OpenCodeProviderInfo[]}
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
          providers={providersData as OpenCodeProviderInfo[]}
          dynamicModels={modelsData}
          enabledDynamicModelIds={enabledDynamicModelIds}
          onDynamicModelToggle={handleDynamicModelToggle}
          isLoadingDynamicModels={isLoadingDynamicModels}
        />
      )}
    </div>
  );
}

export default OpencodeSettingsTab;
