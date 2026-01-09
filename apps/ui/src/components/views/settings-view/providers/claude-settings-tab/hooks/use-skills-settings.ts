/**
 * Skills Settings Hook - Manages Skills configuration state
 *
 * Provides state management for enabling/disabling Skills and
 * configuring which sources to load Skills from (user/project).
 */

import { useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { toast } from 'sonner';
import { getElectronAPI } from '@/lib/electron';

export function useSkillsSettings() {
  const enabled = useAppStore((state) => state.enableSkills);
  const sources = useAppStore((state) => state.skillsSources);
  const [isLoading, setIsLoading] = useState(false);

  const updateEnabled = async (newEnabled: boolean) => {
    setIsLoading(true);
    try {
      const api = getElectronAPI();
      if (!api.settings) {
        throw new Error('Settings API not available');
      }
      await api.settings.updateGlobal({ enableSkills: newEnabled });
      // Update local store after successful server update
      useAppStore.setState({ enableSkills: newEnabled });
      toast.success(newEnabled ? 'Skills enabled' : 'Skills disabled');
    } catch (error) {
      toast.error('Failed to update skills settings');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateSources = async (newSources: Array<'user' | 'project'>) => {
    setIsLoading(true);
    try {
      const api = getElectronAPI();
      if (!api.settings) {
        throw new Error('Settings API not available');
      }
      await api.settings.updateGlobal({ skillsSources: newSources });
      // Update local store after successful server update
      useAppStore.setState({ skillsSources: newSources });
      toast.success('Skills sources updated');
    } catch (error) {
      toast.error('Failed to update skills sources');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    enabled,
    sources,
    updateEnabled,
    updateSources,
    isLoading,
  };
}
