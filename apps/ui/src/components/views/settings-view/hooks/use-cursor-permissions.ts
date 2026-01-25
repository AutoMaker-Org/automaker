import { useState, useCallback, useEffect } from 'react';
import { useCursorPermissionsQuery, type CursorPermissionsData } from '@/hooks/queries';
import { useApplyCursorProfile, useCopyCursorConfig } from '@/hooks/mutations';

// Re-export for backward compatibility
export type PermissionsData = CursorPermissionsData;

/**
 * Custom hook for managing Cursor CLI permissions
 * Handles loading permissions data, applying profiles, and copying configs
 */
export function useCursorPermissions(projectPath?: string) {
  const [copiedConfig, setCopiedConfig] = useState(false);

  // React Query hooks
  const permissionsQuery = useCursorPermissionsQuery(projectPath);
  const applyProfileMutation = useApplyCursorProfile(projectPath);
  const copyConfigMutation = useCopyCursorConfig();

  // Apply a permission profile
  const applyProfile = useCallback(
    (profileId: 'strict' | 'development', scope: 'global' | 'project') => {
      applyProfileMutation.mutate({ profileId, scope });
    },
    [applyProfileMutation]
  );

  // Copy example config to clipboard
  const copyConfig = useCallback(
    (profileId: 'strict' | 'development') => {
      copyConfigMutation.mutate(profileId, {
        onSuccess: () => {
          setCopiedConfig(true);
          setTimeout(() => setCopiedConfig(false), 2000);
        },
      });
    },
    [copyConfigMutation]
  );

  // Load permissions (refetch)
  const loadPermissions = useCallback(() => {
    permissionsQuery.refetch();
  }, [permissionsQuery]);

  return {
    permissions: permissionsQuery.data ?? null,
    isLoadingPermissions: permissionsQuery.isLoading,
    isSavingPermissions: applyProfileMutation.isPending,
    copiedConfig,
    loadPermissions,
    applyProfile,
    copyConfig,
  };
}
