import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { useSpecFile, useSpecRegenerationStatus } from '@/hooks/queries';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';

export function useSpecLoading() {
  const { currentProject, setAppSpec } = useAppStore();
  const queryClient = useQueryClient();
  const [specExists, setSpecExists] = useState(true);

  // React Query hooks
  const specFileQuery = useSpecFile(currentProject?.path);
  const statusQuery = useSpecRegenerationStatus(currentProject?.path);

  const isGenerationRunning = statusQuery.data?.isRunning ?? false;

  // Update app store and specExists when spec file data changes
  useEffect(() => {
    if (specFileQuery.data && !isGenerationRunning) {
      setAppSpec(specFileQuery.data.content);
      setSpecExists(specFileQuery.data.exists);
    }
  }, [specFileQuery.data, setAppSpec, isGenerationRunning]);

  // Manual reload function (invalidates cache)
  const loadSpec = useCallback(async () => {
    if (!currentProject?.path) return;

    // Fetch fresh status data to avoid stale cache issues
    // Using fetchQuery ensures we get the latest data before checking
    const statusData = await queryClient.fetchQuery<{ isRunning: boolean }>({
      queryKey: queryKeys.specRegeneration.status(currentProject.path),
      staleTime: 0, // Force fresh fetch
    });

    if (statusData?.isRunning) {
      return;
    }

    // Invalidate and refetch spec file
    await queryClient.invalidateQueries({
      queryKey: queryKeys.spec.file(currentProject.path),
    });
  }, [currentProject?.path, queryClient]);

  return {
    isLoading: specFileQuery.isLoading,
    specExists,
    setSpecExists,
    isGenerationRunning,
    loadSpec,
  };
}
