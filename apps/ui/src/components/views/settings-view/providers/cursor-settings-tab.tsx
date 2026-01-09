import { useState } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/app-store';
import type { CursorModelId } from '@automaker/types';
import {
  CursorCliStatus,
  CursorCliStatusSkeleton,
  CursorPermissionsSkeleton,
  ModelConfigSkeleton,
} from '../cli-status/cursor-cli-status';
import { useCursorStatus } from '../hooks/use-cursor-status';
import { useCursorPermissions } from '../hooks/use-cursor-permissions';
import { CursorPermissionsSection } from './cursor-permissions-section';
import { CursorModelConfiguration } from './cursor-model-configuration';

export function CursorSettingsTab() {
  // Global settings from store
  const {
    enabledCursorModels,
    cursorDefaultModel,
    setCursorDefaultModel,
    toggleCursorModel,
    currentProject,
  } = useAppStore();

  // Custom hooks for data fetching
  const { status, isLoading, loadData } = useCursorStatus();
  const {
    permissions,
    isLoadingPermissions,
    isSavingPermissions,
    copiedConfig,
    loadPermissions,
    applyProfile,
    copyConfig,
  } = useCursorPermissions(currentProject?.path);

  // Local state for model configuration saving
  const [isSaving, setIsSaving] = useState(false);

  const handleDefaultModelChange = (model: CursorModelId) => {
    setIsSaving(true);
    try {
      setCursorDefaultModel(model);
      toast.success('Default model updated');
    } catch (error) {
      toast.error('Failed to update default model');
    } finally {
      setIsSaving(false);
    }
  };

  const handleModelToggle = (model: CursorModelId, enabled: boolean) => {
    setIsSaving(true);
    try {
      toggleCursorModel(model, enabled);
    } catch (error) {
      toast.error('Failed to update models');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <CursorCliStatusSkeleton />
        <CursorPermissionsSkeleton />
        <ModelConfigSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* CLI Status */}
      <CursorCliStatus status={status} isChecking={isLoading} onRefresh={loadData} />

      {/* CLI Permissions Section */}
      <CursorPermissionsSection
        status={status}
        permissions={permissions}
        isLoadingPermissions={isLoadingPermissions}
        isSavingPermissions={isSavingPermissions}
        copiedConfig={copiedConfig}
        currentProject={currentProject}
        onApplyProfile={applyProfile}
        onCopyConfig={copyConfig}
        onLoadPermissions={loadPermissions}
      />

      {/* Model Configuration - Always show (global settings) */}
      {status?.installed && (
        <CursorModelConfiguration
          enabledCursorModels={enabledCursorModels}
          cursorDefaultModel={cursorDefaultModel}
          isSaving={isSaving}
          onDefaultModelChange={handleDefaultModelChange}
          onModelToggle={handleModelToggle}
        />
      )}
    </div>
  );
}

export default CursorSettingsTab;
