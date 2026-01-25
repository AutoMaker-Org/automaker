/**
 * Subagents Settings Hook - Manages Subagents configuration state
 *
 * Provides state management for enabling/disabling Subagents and
 * configuring which sources to load Subagents from (user/project).
 */

import { useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { toast } from 'sonner';
import { useUpdateGlobalSettings } from '@/hooks/mutations';

export function useSubagentsSettings() {
  const enabled = useAppStore((state) => state.enableSubagents);
  const sources = useAppStore((state) => state.subagentsSources);

  // React Query mutation (disable default toast)
  const updateSettingsMutation = useUpdateGlobalSettings({ showSuccessToast: false });

  const updateEnabled = useCallback(
    (newEnabled: boolean) => {
      updateSettingsMutation.mutate(
        { enableSubagents: newEnabled },
        {
          onSuccess: () => {
            useAppStore.setState({ enableSubagents: newEnabled });
            toast.success(newEnabled ? 'Subagents enabled' : 'Subagents disabled');
          },
        }
      );
    },
    [updateSettingsMutation]
  );

  const updateSources = useCallback(
    (newSources: Array<'user' | 'project'>) => {
      updateSettingsMutation.mutate(
        { subagentsSources: newSources },
        {
          onSuccess: () => {
            useAppStore.setState({ subagentsSources: newSources });
            toast.success('Subagents sources updated');
          },
        }
      );
    },
    [updateSettingsMutation]
  );

  return {
    enabled,
    sources,
    updateEnabled,
    updateSources,
    isLoading: updateSettingsMutation.isPending,
  };
}
