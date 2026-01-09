/**
 * Subagents Settings Hook - Manages Subagents configuration state
 *
 * Provides state management for enabling/disabling Subagents and
 * configuring which sources to load Subagents from (user/project).
 */

import { useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { toast } from 'sonner';
import { getElectronAPI } from '@/lib/electron';

export function useSubagentsSettings() {
  const enabled = useAppStore((state) => state.enableSubagents);
  const sources = useAppStore((state) => state.subagentsSources);
  const [isLoading, setIsLoading] = useState(false);

  const updateEnabled = async (newEnabled: boolean) => {
    setIsLoading(true);
    try {
      const api = getElectronAPI();
      if (!api.settings) {
        throw new Error('Settings API not available');
      }
      await api.settings.updateGlobal({ enableSubagents: newEnabled });
      // Update local store after successful server update
      useAppStore.setState({ enableSubagents: newEnabled });
      toast.success(newEnabled ? 'Subagents enabled' : 'Subagents disabled');
    } catch (error) {
      toast.error('Failed to update subagents settings');
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
      await api.settings.updateGlobal({ subagentsSources: newSources });
      // Update local store after successful server update
      useAppStore.setState({ subagentsSources: newSources });
      toast.success('Subagents sources updated');
    } catch (error) {
      toast.error('Failed to update subagents sources');
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
