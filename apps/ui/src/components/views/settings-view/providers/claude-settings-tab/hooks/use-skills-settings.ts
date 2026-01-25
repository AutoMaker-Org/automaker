/**
 * Skills Settings Hook - Manages Skills configuration state
 *
 * Provides state management for enabling/disabling Skills and
 * configuring which sources to load Skills from (user/project).
 */

import { useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { toast } from 'sonner';
import { useUpdateGlobalSettings } from '@/hooks/mutations';

export function useSkillsSettings() {
  const enabled = useAppStore((state) => state.enableSkills);
  const sources = useAppStore((state) => state.skillsSources);

  // React Query mutation (disable default toast)
  const updateSettingsMutation = useUpdateGlobalSettings({ showSuccessToast: false });

  const updateEnabled = useCallback(
    (newEnabled: boolean) => {
      updateSettingsMutation.mutate(
        { enableSkills: newEnabled },
        {
          onSuccess: () => {
            useAppStore.setState({ enableSkills: newEnabled });
            toast.success(newEnabled ? 'Skills enabled' : 'Skills disabled');
          },
        }
      );
    },
    [updateSettingsMutation]
  );

  const updateSources = useCallback(
    (newSources: Array<'user' | 'project'>) => {
      updateSettingsMutation.mutate(
        { skillsSources: newSources },
        {
          onSuccess: () => {
            useAppStore.setState({ skillsSources: newSources });
            toast.success('Skills sources updated');
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
