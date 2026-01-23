import { useState, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAppStore } from '@/store/app-store';
import { CopilotCliStatus, CopilotCliStatusSkeleton } from '../cli-status/copilot-cli-status';
import { CopilotModelConfiguration } from './copilot-model-configuration';
import { ProviderToggle } from './provider-toggle';
import { useCopilotCliStatus } from '@/hooks/queries';
import { queryKeys } from '@/lib/query-keys';
import type { CliStatus as SharedCliStatus } from '../shared/types';
import type { CopilotAuthStatus } from '../cli-status/copilot-cli-status';
import type { CopilotModelId } from '@automaker/types';

export function CopilotSettingsTab() {
  const queryClient = useQueryClient();
  const { enabledCopilotModels, copilotDefaultModel, setCopilotDefaultModel, toggleCopilotModel } =
    useAppStore();

  const [isSaving, setIsSaving] = useState(false);

  // React Query hooks for data fetching
  const {
    data: cliStatusData,
    isLoading: isCheckingCopilotCli,
    refetch: refetchCliStatus,
  } = useCopilotCliStatus();

  const isCliInstalled = cliStatusData?.installed ?? false;

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
      // Server sends installCommand (singular), transform to expected format
      installCommands: cliStatusData.installCommand
        ? { npm: cliStatusData.installCommand }
        : cliStatusData.installCommands,
    };
  }, [cliStatusData]);

  // Transform auth status to the expected format
  const authStatus = useMemo((): CopilotAuthStatus | null => {
    if (!cliStatusData?.auth) return null;
    return {
      authenticated: cliStatusData.auth.authenticated,
      method: (cliStatusData.auth.method as CopilotAuthStatus['method']) || 'none',
      login: cliStatusData.auth.login,
      host: cliStatusData.auth.host,
      error: cliStatusData.auth.error,
    };
  }, [cliStatusData]);

  // Refresh all copilot-related queries
  const handleRefreshCopilotCli = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.cli.copilot() });
    await refetchCliStatus();
    toast.success('Copilot CLI refreshed');
  }, [queryClient, refetchCliStatus]);

  const handleDefaultModelChange = useCallback(
    (model: CopilotModelId) => {
      setIsSaving(true);
      try {
        setCopilotDefaultModel(model);
        toast.success('Default model updated');
      } catch {
        toast.error('Failed to update default model');
      } finally {
        setIsSaving(false);
      }
    },
    [setCopilotDefaultModel]
  );

  const handleModelToggle = useCallback(
    (model: CopilotModelId, enabled: boolean) => {
      setIsSaving(true);
      try {
        toggleCopilotModel(model, enabled);
      } catch {
        toast.error('Failed to update models');
      } finally {
        setIsSaving(false);
      }
    },
    [toggleCopilotModel]
  );

  // Show skeleton only while checking CLI status initially
  if (!cliStatus && isCheckingCopilotCli) {
    return (
      <div className="space-y-6">
        <CopilotCliStatusSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Provider Visibility Toggle */}
      <ProviderToggle provider="copilot" providerLabel="GitHub Copilot" />

      <CopilotCliStatus
        status={cliStatus}
        authStatus={authStatus}
        isChecking={isCheckingCopilotCli}
        onRefresh={handleRefreshCopilotCli}
      />

      {/* Model Configuration - Only show when CLI is installed */}
      {isCliInstalled && (
        <CopilotModelConfiguration
          enabledCopilotModels={enabledCopilotModels}
          copilotDefaultModel={copilotDefaultModel}
          isSaving={isSaving}
          onDefaultModelChange={handleDefaultModelChange}
          onModelToggle={handleModelToggle}
        />
      )}
    </div>
  );
}

export default CopilotSettingsTab;
