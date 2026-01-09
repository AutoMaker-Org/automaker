import { useState, useCallback } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { toast } from 'sonner';

const logger = createLogger('CursorPermissions');
import { getHttpApiClient } from '@/lib/http-api-client';
import type { CursorPermissionProfile } from '@automaker/types';

export interface PermissionsData {
  activeProfile: CursorPermissionProfile | null;
  effectivePermissions: { allow: string[]; deny: string[] } | null;
  hasProjectConfig: boolean;
  availableProfiles: Array<{
    id: string;
    name: string;
    description: string;
    permissions: { allow: string[]; deny: string[] };
  }>;
}

/**
 * Custom hook for managing Cursor CLI permissions
 * Handles loading permissions data, applying profiles, and copying configs
 */
export function useCursorPermissions(projectPath?: string) {
  const [permissions, setPermissions] = useState<PermissionsData | null>(null);
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);

  // Load permissions data
  const loadPermissions = useCallback(async () => {
    setIsLoadingPermissions(true);
    try {
      const api = getHttpApiClient();
      const result = await api.setup.getCursorPermissions(projectPath);

      if (result.success) {
        setPermissions({
          activeProfile: result.activeProfile || null,
          effectivePermissions: result.effectivePermissions || null,
          hasProjectConfig: result.hasProjectConfig || false,
          availableProfiles: result.availableProfiles || [],
        });
      }
    } catch (error) {
      logger.error('Failed to load Cursor permissions:', error);
    } finally {
      setIsLoadingPermissions(false);
    }
  }, [projectPath]);

  // Apply a permission profile
  const applyProfile = useCallback(
    async (profileId: 'strict' | 'development', scope: 'global' | 'project') => {
      setIsSavingPermissions(true);
      try {
        const api = getHttpApiClient();
        const result = await api.setup.applyCursorPermissionProfile(
          profileId,
          scope,
          scope === 'project' ? projectPath : undefined
        );

        if (result.success) {
          toast.success(result.message || `Applied ${profileId} profile`);
          await loadPermissions();
        } else {
          toast.error(result.error || 'Failed to apply profile');
        }
      } catch (error) {
        toast.error('Failed to apply profile');
      } finally {
        setIsSavingPermissions(false);
      }
    },
    [projectPath, loadPermissions]
  );

  // Copy example config to clipboard
  const copyConfig = useCallback(async (profileId: 'strict' | 'development') => {
    try {
      const api = getHttpApiClient();
      const result = await api.setup.getCursorExampleConfig(profileId);

      if (result.success && result.config) {
        await navigator.clipboard.writeText(result.config);
        setCopiedConfig(true);
        toast.success('Config copied to clipboard');
        setTimeout(() => setCopiedConfig(false), 2000);
      }
    } catch (error) {
      toast.error('Failed to copy config');
    }
  }, []);

  return {
    permissions,
    isLoadingPermissions,
    isSavingPermissions,
    copiedConfig,
    loadPermissions,
    applyProfile,
    copyConfig,
  };
}
