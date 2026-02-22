// @ts-nocheck - feature update logic with partial updates and image/file handling
import { useCallback } from 'react';
import {
  Feature,
  FeatureImage,
  ModelAlias,
  ThinkingLevel,
  PlanningMode,
  useAppStore,
} from '@/store/app-store';
import type { ReasoningEffort } from '@automaker/types';
import { FeatureImagePath as DescriptionImagePath } from '@/components/ui/description-image-dropzone';
import { getElectronAPI } from '@/lib/electron';
import { isConnectionError, handleServerOffline, getHttpApiClient } from '@/lib/http-api-client';
import { toast } from 'sonner';
import { useAutoMode } from '@/hooks/use-auto-mode';
import { useVerifyFeature, useResumeFeature } from '@/hooks/mutations';
import { truncateDescription } from '@/lib/utils';
import { getBlockingDependencies } from '@automaker/dependency-resolver';
import { createLogger } from '@automaker/utils/logger';

const logger = createLogger('BoardActions');

const MAX_DUPLICATES = 50;

interface UseBoardActionsProps {
  currentProject: { path: string; id: string } | null;
  features: Feature[];
  runningAutoTasks: string[];
  loadFeatures: () => Promise<void>;
  persistFeatureCreate: (feature: Feature) => Promise<void>;
  persistFeatureUpdate: (
    featureId: string,
    updates: Partial<Feature>,
    descriptionHistorySource?: 'enhance' | 'edit',
    enhancementMode?: 'improve' | 'technical' | 'simplify' | 'acceptance' | 'ux-reviewer',
    preEnhancementDescription?: string
  ) => Promise<void>;
  persistFeatureDelete: (featureId: string) => Promise<void>;
  saveCategory: (category: string) => Promise<void>;
  setEditingFeature: (feature: Feature | null) => void;
  setShowOutputModal: (show: boolean) => void;
  setOutputFeature: (feature: Feature | null) => void;
  followUpFeature: Feature | null;
  followUpPrompt: string;
  followUpImagePaths: DescriptionImagePath[];
  setFollowUpFeature: (feature: Feature | null) => void;
  setFollowUpPrompt: (prompt: string) => void;
  setFollowUpImagePaths: (paths: DescriptionImagePath[]) => void;
  setFollowUpPreviewMap: (map: Map<string, string>) => void;
  setShowFollowUpDialog: (show: boolean) => void;
  inProgressFeaturesForShortcuts: Feature[];
  outputFeature: Feature | null;
  projectPath: string | null;
  onWorktreeCreated?: () => void;
  onWorktreeAutoSelect?: (worktree: { path: string; branch: string }) => void;
  currentWorktreeBranch: string | null; // Branch name of the selected worktree for filtering
}

export function useBoardActions({
  currentProject,
  features,
  runningAutoTasks,
  loadFeatures,
  persistFeatureCreate,
  persistFeatureUpdate,
  persistFeatureDelete,
  saveCategory,
  setEditingFeature,
  setShowOutputModal,
  setOutputFeature,
  followUpFeature,
  followUpPrompt,
  followUpImagePaths,
  setFollowUpFeature,
  setFollowUpPrompt,
  setFollowUpImagePaths,
  setFollowUpPreviewMap,
  setShowFollowUpDialog,
  inProgressFeaturesForShortcuts,
  outputFeature,
  projectPath,
  onWorktreeCreated,
  onWorktreeAutoSelect,
  currentWorktreeBranch,
}: UseBoardActionsProps) {
  // IMPORTANT: Use individual selectors instead of bare useAppStore() to prevent
  // subscribing to the entire store. Bare useAppStore() causes the host component
  // (BoardView) to re-render on EVERY store change, which cascades through effects
  // and triggers React error #185 (maximum update depth exceeded).
  const addFeature = useAppStore((s) => s.addFeature);
  const updateFeature = useAppStore((s) => s.updateFeature);
  const removeFeature = useAppStore((s) => s.removeFeature);
  const moveFeature = useAppStore((s) => s.moveFeature);
  const worktreesEnabled = useAppStore((s) => s.useWorktrees);
  const enableDependencyBlocking = useAppStore((s) => s.enableDependencyBlocking);
  const skipVerificationInAutoMode = useAppStore((s) => s.skipVerificationInAutoMode);
  const isPrimaryWorktreeBranch = useAppStore((s) => s.isPrimaryWorktreeBranch);
  const getPrimaryWorktreeBranch = useAppStore((s) => s.getPrimaryWorktreeBranch);
  const autoMode = useAutoMode();

  // React Query mutations for feature operations
  const verifyFeatureMutation = useVerifyFeature(currentProject?.path ?? '');
  const resumeFeatureMutation = useResumeFeature(currentProject?.path ?? '');

  // Worktrees are created when adding/editing features with a branch name
  // This ensures the worktree exists before the feature starts execution

  const handleAddFeature = useCallback(
    async (featureData: {
      title: string;
      category: string;
      description: string;
      images: FeatureImage[];
      imagePaths: DescriptionImagePath[];
      skipTests: boolean;
      model: ModelAlias;
      thinkingLevel: ThinkingLevel;
      branchName: string;
      priority: number;
      planningMode: PlanningMode;
      requirePlanApproval: boolean;
      dependencies?: string[];
      childDependencies?: string[]; // Feature IDs that should depend on this feature
      workMode?: 'current' | 'auto' | 'custom';
      initialStatus?: 'backlog' | 'in_progress'; // Skip backlog flash when creating & starting immediately
    }) => {
      const workMode = featureData.workMode || 'current';

      // For auto worktree mode, we need a title for the branch name.
      // If no title provided, generate one from the description first.
      let titleForBranch = featureData.title;
      let titleWasGenerated = false;

      if (workMode === 'auto' && !featureData.title.trim() && featureData.description.trim()) {
        // Generate title first so we can use it for the branch name
        const api = getElectronAPI();
        if (api?.features?.generateTitle) {
          try {
            const result = await api.features.generateTitle(featureData.description);
            if (result.success && result.title) {
              titleForBranch = result.title;
              titleWasGenerated = true;
            }
          } catch (error) {
            logger.error('Error generating title for branch name:', error);
          }
        }
        // If title generation failed, fall back to first part of description
        if (!titleForBranch.trim()) {
          titleForBranch = featureData.description.substring(0, 60);
        }
      }

      // Determine final branch name based on work mode:
      // - 'current': Use current worktree's branch (or undefined if on main)
      // - 'auto': Auto-generate branch name based on feature title
      // - 'custom': Use the provided branch name
      let finalBranchName: string | undefined;

      if (workMode === 'current') {
        // Work directly on current branch - use the current worktree's branch if not on main
        // This ensures features created on a non-main worktree are associated with that worktree
        finalBranchName = currentWorktreeBranch || undefined;
      } else if (workMode === 'auto') {
        // Auto-generate a branch name based on feature title and timestamp
        // Create a slug from the title: lowercase, replace non-alphanumeric with hyphens
        const titleSlug =
          titleForBranch
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric sequences with hyphens
            .substring(0, 50) // Limit length first
            .replace(/^-|-$/g, '') || 'untitled'; // Then remove leading/trailing hyphens, with fallback
        const randomSuffix = Math.random().toString(36).substring(2, 6);
        finalBranchName = `feature/${titleSlug}-${randomSuffix}`;
      } else {
        // Custom mode - use provided branch name
        finalBranchName = featureData.branchName || undefined;
      }

      // Create worktree for 'auto' or 'custom' modes when we have a branch name
      if ((workMode === 'auto' || workMode === 'custom') && finalBranchName && currentProject) {
        try {
          const api = getElectronAPI();
          if (api?.worktree?.create) {
            const result = await api.worktree.create(currentProject.path, finalBranchName);
            if (result.success && result.worktree) {
              logger.info(
                `Worktree for branch "${finalBranchName}" ${
                  result.worktree?.isNew ? 'created' : 'already exists'
                }`
              );
              // Auto-select the worktree when creating a feature for it
              onWorktreeAutoSelect?.({
                path: result.worktree.path,
                branch: result.worktree.branch,
              });
              // Refresh worktree list in UI
              onWorktreeCreated?.();
            } else if (!result.success) {
              logger.error(
                `Failed to create worktree for branch "${finalBranchName}":`,
                result.error
              );
              toast.error('Failed to create worktree', {
                description: result.error || 'An error occurred',
              });
            }
          }
        } catch (error) {
          logger.error('Error creating worktree:', error);
          toast.error('Failed to create worktree', {
            description: error instanceof Error ? error.message : 'An error occurred',
          });
        }
      }

      // Check if we need to generate a title (only if we didn't already generate it for the branch name)
      const needsTitleGeneration =
        !titleWasGenerated && !featureData.title.trim() && featureData.description.trim();

      const {
        initialStatus: requestedStatus,
        workMode: _workMode,
        childDependencies,
        ...restFeatureData
      } = featureData;
      const initialStatus = requestedStatus || 'backlog';
      const newFeatureData = {
        ...restFeatureData,
        title: titleWasGenerated ? titleForBranch : featureData.title,
        titleGenerating: needsTitleGeneration,
        status: initialStatus,
        branchName: finalBranchName,
        dependencies: featureData.dependencies || [],
        ...(initialStatus === 'in_progress' ? { startedAt: new Date().toISOString() } : {}),
      };
      const createdFeature = addFeature(newFeatureData);
      // Must await to ensure feature exists on server before user can drag it
      try {
        await persistFeatureCreate(createdFeature);
      } catch (error) {
        // Remove the feature from state if server creation failed (e.g., duplicate title)
        removeFeature(createdFeature.id);
        throw error;
      }
      saveCategory(featureData.category);

      // Handle child dependencies - update other features to depend on this new feature
      if (childDependencies && childDependencies.length > 0) {
        for (const childId of childDependencies) {
          const childFeature = features.find((f) => f.id === childId);
          if (childFeature) {
            const childDeps = childFeature.dependencies || [];
            if (!childDeps.includes(createdFeature.id)) {
              const newDeps = [...childDeps, createdFeature.id];
              updateFeature(childId, { dependencies: newDeps });
              persistFeatureUpdate(childId, { dependencies: newDeps });
            }
          }
        }
      }

      // Generate title in the background if needed (non-blocking)
      if (needsTitleGeneration) {
        const api = getElectronAPI();
        if (api?.features?.generateTitle) {
          api.features
            .generateTitle(featureData.description, projectPath ?? undefined)
            .then((result) => {
              if (result.success && result.title) {
                const titleUpdates = {
                  title: result.title,
                  titleGenerating: false,
                };
                updateFeature(createdFeature.id, titleUpdates);
                persistFeatureUpdate(createdFeature.id, titleUpdates);
              } else {
                // Clear generating flag even if failed
                const titleUpdates = { titleGenerating: false };
                updateFeature(createdFeature.id, titleUpdates);
                persistFeatureUpdate(createdFeature.id, titleUpdates);
              }
            })
            .catch((error) => {
              logger.error('Error generating title:', error);
              // Clear generating flag on error
              const titleUpdates = { titleGenerating: false };
              updateFeature(createdFeature.id, titleUpdates);
              persistFeatureUpdate(createdFeature.id, titleUpdates);
            });
        }
      }

      return createdFeature;
    },
    [
      addFeature,
      removeFeature,
      persistFeatureCreate,
      persistFeatureUpdate,
      updateFeature,
      saveCategory,
      currentProject,
      projectPath,
      onWorktreeCreated,
      onWorktreeAutoSelect,
      features,
      currentWorktreeBranch,
    ]
  );

  const handleUpdateFeature = useCallback(
    async (
      featureId: string,
      updates: {
        title: string;
        category: string;
        description: string;
        skipTests: boolean;
        model: ModelAlias;
        thinkingLevel: ThinkingLevel;
        reasoningEffort: ReasoningEffort;
        imagePaths: DescriptionImagePath[];
        branchName: string;
        priority: number;
        planningMode?: PlanningMode;
        requirePlanApproval?: boolean;
        workMode?: 'current' | 'auto' | 'custom';
        dependencies?: string[];
        childDependencies?: string[]; // Feature IDs that should depend on this feature
      },
      descriptionHistorySource?: 'enhance' | 'edit',
      enhancementMode?: 'improve' | 'technical' | 'simplify' | 'acceptance' | 'ux-reviewer',
      preEnhancementDescription?: string
    ) => {
      const workMode = updates.workMode || 'current';

      // For auto worktree mode, we need a title for the branch name.
      // If no title provided, generate one from the description first.
      let titleForBranch = updates.title;
      let titleWasGenerated = false;

      if (workMode === 'auto' && !updates.title.trim() && updates.description.trim()) {
        // Generate title first so we can use it for the branch name
        const api = getElectronAPI();
        if (api?.features?.generateTitle) {
          try {
            const result = await api.features.generateTitle(updates.description);
            if (result.success && result.title) {
              titleForBranch = result.title;
              titleWasGenerated = true;
            }
          } catch (error) {
            logger.error('Error generating title for branch name:', error);
          }
        }
        // If title generation failed, fall back to first part of description
        if (!titleForBranch.trim()) {
          titleForBranch = updates.description.substring(0, 60);
        }
      }

      // Determine final branch name based on work mode
      let finalBranchName: string | undefined;

      if (workMode === 'current') {
        // Work directly on current branch - use the current worktree's branch if not on main
        // This ensures features updated on a non-main worktree are associated with that worktree
        finalBranchName = currentWorktreeBranch || undefined;
      } else if (workMode === 'auto') {
        // Preserve existing branch name if one exists (avoid orphaning worktrees on edit)
        if (updates.branchName?.trim()) {
          finalBranchName = updates.branchName;
        } else {
          // Auto-generate a branch name based on feature title
          // Create a slug from the title: lowercase, replace non-alphanumeric with hyphens
          const titleSlug =
            titleForBranch
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric sequences with hyphens
              .substring(0, 50) // Limit length first
              .replace(/^-|-$/g, '') || 'untitled'; // Then remove leading/trailing hyphens, with fallback
          const randomSuffix = Math.random().toString(36).substring(2, 6);
          finalBranchName = `feature/${titleSlug}-${randomSuffix}`;
        }
      } else {
        finalBranchName = updates.branchName || undefined;
      }

      // Create worktree for 'auto' or 'custom' modes when we have a branch name
      if ((workMode === 'auto' || workMode === 'custom') && finalBranchName && currentProject) {
        try {
          const api = getElectronAPI();
          if (api?.worktree?.create) {
            const result = await api.worktree.create(currentProject.path, finalBranchName);
            if (result.success) {
              logger.info(
                `Worktree for branch "${finalBranchName}" ${
                  result.worktree?.isNew ? 'created' : 'already exists'
                }`
              );
              // Refresh worktree list in UI
              onWorktreeCreated?.();
            } else {
              logger.error(
                `Failed to create worktree for branch "${finalBranchName}":`,
                result.error
              );
              toast.error('Failed to create worktree', {
                description: result.error || 'An error occurred',
              });
            }
          }
        } catch (error) {
          logger.error('Error creating worktree:', error);
          toast.error('Failed to create worktree', {
            description: error instanceof Error ? error.message : 'An error occurred',
          });
        }
      }

      // Separate child dependencies from the main updates (they affect other features)
      const { childDependencies, ...restUpdates } = updates;

      const finalUpdates = {
        ...restUpdates,
        title: titleWasGenerated ? titleForBranch : updates.title,
        branchName: finalBranchName,
      };

      updateFeature(featureId, finalUpdates);
      persistFeatureUpdate(
        featureId,
        finalUpdates,
        descriptionHistorySource,
        enhancementMode,
        preEnhancementDescription
      );

      // Handle child dependency changes
      // This updates other features' dependencies arrays
      if (childDependencies !== undefined) {
        // Find current child dependencies (features that have this feature in their dependencies)
        const currentChildDeps = features
          .filter((f) => f.dependencies?.includes(featureId))
          .map((f) => f.id);

        // Find features to add this feature as a dependency (new child deps)
        const toAdd = childDependencies.filter((id) => !currentChildDeps.includes(id));
        // Find features to remove this feature as a dependency (removed child deps)
        const toRemove = currentChildDeps.filter((id) => !childDependencies.includes(id));

        // Add this feature as a dependency to new child features
        for (const childId of toAdd) {
          const childFeature = features.find((f) => f.id === childId);
          if (childFeature) {
            const childDeps = childFeature.dependencies || [];
            if (!childDeps.includes(featureId)) {
              const newDeps = [...childDeps, featureId];
              updateFeature(childId, { dependencies: newDeps });
              persistFeatureUpdate(childId, { dependencies: newDeps });
            }
          }
        }

        // Remove this feature as a dependency from removed child features
        for (const childId of toRemove) {
          const childFeature = features.find((f) => f.id === childId);
          if (childFeature) {
            const childDeps = childFeature.dependencies || [];
            const newDeps = childDeps.filter((depId) => depId !== featureId);
            updateFeature(childId, { dependencies: newDeps });
            persistFeatureUpdate(childId, { dependencies: newDeps });
          }
        }
      }

      if (updates.category) {
        saveCategory(updates.category);
      }
      setEditingFeature(null);
    },
    [
      updateFeature,
      persistFeatureUpdate,
      saveCategory,
      setEditingFeature,
      currentProject,
      onWorktreeCreated,
      features,
      currentWorktreeBranch,
    ]
  );

  const handleDeleteFeature = useCallback(
    async (featureId: string) => {
      const feature = features.find((f) => f.id === featureId);
      if (!feature) return;

      const isRunning = runningAutoTasks.includes(featureId);

      if (isRunning) {
        try {
          await autoMode.stopFeature(featureId);
          toast.success('Agent stopped', {
            description: `Stopped and deleted: ${truncateDescription(feature.description)}`,
          });
        } catch (error) {
          logger.error('Error stopping feature before delete:', error);
          toast.error('Failed to stop agent', {
            description: 'The feature will still be deleted.',
          });
        }
      }

      if (feature.imagePaths && feature.imagePaths.length > 0) {
        try {
          const api = getElectronAPI();
          for (const imagePathObj of feature.imagePaths) {
            try {
              await api.deleteFile(imagePathObj.path);
              logger.info(`Deleted image: ${imagePathObj.path}`);
            } catch (error) {
              logger.error(`Failed to delete image ${imagePathObj.path}:`, error);
            }
          }
        } catch (error) {
          logger.error(`Error deleting images for feature ${featureId}:`, error);
        }
      }

      removeFeature(featureId);
      await persistFeatureDelete(featureId);
    },
    [features, runningAutoTasks, autoMode, removeFeature, persistFeatureDelete]
  );

  const handleRunFeature = useCallback(
    async (feature: Feature) => {
      if (!currentProject) {
        throw new Error('No project selected');
      }

      const api = getElectronAPI();
      if (!api?.autoMode) {
        throw new Error('Auto mode API not available');
      }

      // Server derives workDir from feature.branchName at execution time
      const result = await api.autoMode.runFeature(
        currentProject.path,
        feature.id,
        worktreesEnabled
        // No worktreePath - server derives from feature.branchName
      );

      if (result.success) {
        logger.info('Feature run started successfully, branch:', feature.branchName || 'default');
      } else {
        // Throw error so caller can handle rollback
        throw new Error(result.error || 'Failed to start feature');
      }
    },
    [currentProject, worktreesEnabled]
  );

  const handleStartImplementation = useCallback(
    async (feature: Feature) => {
      // Note: No concurrency limit check here. Manual feature starts should never
      // be blocked by the auto mode concurrency limit. The concurrency limit only
      // governs how many features the auto-loop picks up automatically.

      // Check for blocking dependencies and show warning if enabled
      if (enableDependencyBlocking) {
        const blockingDeps = getBlockingDependencies(feature, features);
        if (blockingDeps.length > 0) {
          const depDescriptions = blockingDeps
            .map((depId) => {
              const dep = features.find((f) => f.id === depId);
              return dep ? truncateDescription(dep.description, 40) : depId;
            })
            .join(', ');

          toast.warning('Starting feature with incomplete dependencies', {
            description: `This feature depends on: ${depDescriptions}`,
          });
        }
      }

      // Skip status update if feature was already created with in_progress status
      // (e.g., via "Make" button which creates directly as in_progress to avoid backlog flash)
      const alreadyInProgress = feature.status === 'in_progress';

      if (!alreadyInProgress) {
        const updates = {
          status: 'in_progress' as const,
          startedAt: new Date().toISOString(),
        };
        updateFeature(feature.id, updates);

        try {
          // Must await to ensure feature status is persisted before starting agent
          await persistFeatureUpdate(feature.id, updates);
        } catch (error) {
          // Rollback to backlog if persist fails (e.g., server offline)
          logger.error('Failed to update feature status, rolling back to backlog:', error);
          const rollbackUpdates = {
            status: 'backlog' as const,
            startedAt: undefined,
          };
          updateFeature(feature.id, rollbackUpdates);
          persistFeatureUpdate(feature.id, rollbackUpdates).catch((persistError) => {
            logger.error('Failed to persist rollback:', persistError);
          });

          if (isConnectionError(error)) {
            handleServerOffline();
            return false;
          }

          toast.error('Failed to start feature', {
            description:
              error instanceof Error ? error.message : 'Server may be offline. Please try again.',
          });
          return false;
        }
      }

      try {
        logger.info('Feature moved to in_progress, starting agent...');
        await handleRunFeature(feature);
        return true;
      } catch (error) {
        // Rollback to backlog if run fails
        logger.error('Failed to start feature, rolling back to backlog:', error);
        const rollbackUpdates = {
          status: 'backlog' as const,
          startedAt: undefined,
        };
        updateFeature(feature.id, rollbackUpdates);

        // Also persist the rollback so it survives page refresh
        persistFeatureUpdate(feature.id, rollbackUpdates).catch((persistError) => {
          logger.error('Failed to persist rollback:', persistError);
        });

        // If server is offline (connection refused), redirect to login page
        if (isConnectionError(error)) {
          handleServerOffline();
          return false;
        }

        toast.error('Failed to start feature', {
          description:
            error instanceof Error ? error.message : 'Server may be offline. Please try again.',
        });
        return false;
      }
    },
    [enableDependencyBlocking, features, updateFeature, persistFeatureUpdate, handleRunFeature]
  );

  const handleVerifyFeature = useCallback(
    async (feature: Feature) => {
      if (!currentProject) return;
      try {
        const result = await verifyFeatureMutation.mutateAsync(feature.id);
        if (result.passes) {
          // Immediately move card to verified column (optimistic update)
          moveFeature(feature.id, 'verified');
          persistFeatureUpdate(feature.id, {
            status: 'verified',
            justFinishedAt: undefined,
          });
          toast.success('Verification passed', {
            description: `Verified: ${truncateDescription(feature.description)}`,
          });
        } else {
          toast.error('Verification failed', {
            description: `Tests did not pass for: ${truncateDescription(feature.description)}`,
          });
        }
      } catch {
        // Error toast is already shown by the mutation's onError handler
      }
    },
    [currentProject, verifyFeatureMutation, moveFeature, persistFeatureUpdate]
  );

  const handleResumeFeature = useCallback(
    async (feature: Feature) => {
      logger.info('handleResumeFeature called for feature:', feature.id);
      if (!currentProject) {
        logger.error('No current project');
        return;
      }
      resumeFeatureMutation.mutate({ featureId: feature.id, useWorktrees: worktreesEnabled });
    },
    [currentProject, resumeFeatureMutation, worktreesEnabled]
  );

  const handleManualVerify = useCallback(
    (feature: Feature) => {
      moveFeature(feature.id, 'verified');
      persistFeatureUpdate(feature.id, {
        status: 'verified',
        justFinishedAt: undefined,
      });
      toast.success('Feature verified', {
        description: `Marked as verified: ${truncateDescription(feature.description)}`,
      });
    },
    [moveFeature, persistFeatureUpdate]
  );

  const handleMoveBackToInProgress = useCallback(
    (feature: Feature) => {
      const updates = {
        status: 'in_progress' as const,
        startedAt: new Date().toISOString(),
      };
      updateFeature(feature.id, updates);
      persistFeatureUpdate(feature.id, updates);
      toast.info('Feature moved back', {
        description: `Moved back to In Progress: ${truncateDescription(feature.description)}`,
      });
    },
    [updateFeature, persistFeatureUpdate]
  );

  const handleOpenFollowUp = useCallback(
    (feature: Feature) => {
      setFollowUpFeature(feature);
      setFollowUpPrompt('');
      setFollowUpImagePaths([]);
      setShowFollowUpDialog(true);
    },
    [setFollowUpFeature, setFollowUpPrompt, setFollowUpImagePaths, setShowFollowUpDialog]
  );

  const handleSendFollowUp = useCallback(async () => {
    if (!currentProject || !followUpFeature || !followUpPrompt.trim()) return;

    const featureId = followUpFeature.id;
    const featureDescription = followUpFeature.description;
    const previousStatus = followUpFeature.status;

    const api = getElectronAPI();
    if (!api?.autoMode?.followUpFeature) {
      logger.error('Follow-up feature API not available');
      toast.error('Follow-up not available', {
        description: 'This feature is not available in the current version.',
      });
      return;
    }

    const updates = {
      status: 'in_progress' as const,
      startedAt: new Date().toISOString(),
      justFinishedAt: undefined,
    };
    updateFeature(featureId, updates);

    try {
      await persistFeatureUpdate(featureId, updates);

      setShowFollowUpDialog(false);
      setFollowUpFeature(null);
      setFollowUpPrompt('');
      setFollowUpImagePaths([]);
      setFollowUpPreviewMap(new Map());

      toast.success('Follow-up started', {
        description: `Continuing work on: ${truncateDescription(featureDescription)}`,
      });

      const imagePaths = followUpImagePaths.map((img) => img.path);
      // Server derives workDir from feature.branchName at execution time
      const result = await api.autoMode.followUpFeature(
        currentProject.path,
        followUpFeature.id,
        followUpPrompt,
        imagePaths,
        worktreesEnabled
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to send follow-up');
      }
    } catch (error) {
      // Rollback to previous status if follow-up fails
      logger.error('Error sending follow-up, rolling back:', error);
      const rollbackUpdates = {
        status: previousStatus as 'backlog' | 'in_progress' | 'waiting_approval' | 'verified',
        startedAt: undefined,
      };
      updateFeature(featureId, rollbackUpdates);

      // If server is offline (connection refused), redirect to login page
      if (isConnectionError(error)) {
        handleServerOffline();
        return;
      }

      toast.error('Failed to send follow-up', {
        description:
          error instanceof Error ? error.message : 'Server may be offline. Please try again.',
      });
    }
  }, [
    currentProject,
    followUpFeature,
    followUpPrompt,
    followUpImagePaths,
    updateFeature,
    persistFeatureUpdate,
    setShowFollowUpDialog,
    setFollowUpFeature,
    setFollowUpPrompt,
    setFollowUpImagePaths,
    setFollowUpPreviewMap,
    worktreesEnabled,
  ]);

  const handleCommitFeature = useCallback(
    async (feature: Feature) => {
      if (!currentProject) return;

      try {
        const api = getElectronAPI();
        if (!api?.autoMode?.commitFeature) {
          logger.error('Commit feature API not available');
          toast.error('Commit not available', {
            description: 'This feature is not available in the current version.',
          });
          return;
        }

        // Server derives workDir from feature.branchName
        const result = await api.autoMode.commitFeature(
          currentProject.path,
          feature.id
          // No worktreePath - server derives from feature.branchName
        );

        if (result.success) {
          moveFeature(feature.id, 'verified');
          persistFeatureUpdate(feature.id, { status: 'verified' });
          toast.success('Feature committed', {
            description: `Committed and verified: ${truncateDescription(feature.description)}`,
          });
          // Refresh worktree selector to update commit counts
          onWorktreeCreated?.();
        } else {
          logger.error('Failed to commit feature:', result.error);
          toast.error('Failed to commit feature', {
            description: result.error || 'An error occurred',
          });
          await loadFeatures();
        }
      } catch (error) {
        logger.error('Error committing feature:', error);
        toast.error('Failed to commit feature', {
          description: error instanceof Error ? error.message : 'An error occurred',
        });
        await loadFeatures();
      }
    },
    [currentProject, moveFeature, persistFeatureUpdate, loadFeatures, onWorktreeCreated]
  );

  const handleMergeFeature = useCallback(
    async (feature: Feature) => {
      if (!currentProject) return;

      try {
        const api = getElectronAPI();
        if (!api?.worktree?.mergeFeature) {
          logger.error('Worktree API not available');
          toast.error('Merge not available', {
            description: 'This feature is not available in the current version.',
          });
          return;
        }

        const result = await api.worktree.mergeFeature(currentProject.path, feature.id);

        if (result.success) {
          await loadFeatures();
          toast.success('Feature merged', {
            description: `Changes merged to main branch: ${truncateDescription(
              feature.description
            )}`,
          });
        } else {
          logger.error('Failed to merge feature:', result.error);
          toast.error('Failed to merge feature', {
            description: result.error || 'An error occurred',
          });
        }
      } catch (error) {
        logger.error('Error merging feature:', error);
        toast.error('Failed to merge feature', {
          description: error instanceof Error ? error.message : 'An error occurred',
        });
      }
    },
    [currentProject, loadFeatures]
  );

  const handleCompleteFeature = useCallback(
    (feature: Feature) => {
      const updates = {
        status: 'completed' as const,
      };
      updateFeature(feature.id, updates);
      persistFeatureUpdate(feature.id, updates);

      toast.success('Feature completed', {
        description: `Archived: ${truncateDescription(feature.description)}`,
      });
    },
    [updateFeature, persistFeatureUpdate]
  );

  const handleUnarchiveFeature = useCallback(
    (feature: Feature) => {
      // Determine the branch to restore to:
      // - If the feature had a branch assigned, keep it (preserves worktree context)
      // - If no branch was assigned, it will show on the primary worktree
      const featureBranch = feature.branchName;
      const branchLabel = featureBranch ?? 'primary worktree';

      // Check if the feature will be visible on the current worktree view
      const willBeVisibleOnCurrentView = !featureBranch
        ? !currentWorktreeBranch ||
          (projectPath ? isPrimaryWorktreeBranch(projectPath, currentWorktreeBranch) : true)
        : featureBranch === currentWorktreeBranch;

      const updates: Partial<Feature> = {
        status: 'verified' as const,
      };
      updateFeature(feature.id, updates);
      persistFeatureUpdate(feature.id, updates);

      if (willBeVisibleOnCurrentView) {
        toast.success('Feature restored', {
          description: `Moved back to verified: ${truncateDescription(feature.description)}`,
        });
      } else {
        toast.success('Feature restored', {
          description: `Moved back to verified on branch "${branchLabel}": ${truncateDescription(feature.description)}`,
        });
      }
    },
    [
      updateFeature,
      persistFeatureUpdate,
      currentWorktreeBranch,
      projectPath,
      isPrimaryWorktreeBranch,
    ]
  );

  const handleViewOutput = useCallback(
    (feature: Feature) => {
      setOutputFeature(feature);
      setShowOutputModal(true);
    },
    [setOutputFeature, setShowOutputModal]
  );

  const handleOutputModalNumberKeyPress = useCallback(
    (key: string) => {
      const index = key === '0' ? 9 : parseInt(key, 10) - 1;
      const targetFeature = inProgressFeaturesForShortcuts[index];

      if (!targetFeature) {
        return;
      }

      if (targetFeature.id === outputFeature?.id) {
        setShowOutputModal(false);
      } else {
        setOutputFeature(targetFeature);
      }
    },
    [inProgressFeaturesForShortcuts, outputFeature?.id, setShowOutputModal, setOutputFeature]
  );

  const handleForceStopFeature = useCallback(
    async (feature: Feature) => {
      try {
        await autoMode.stopFeature(feature.id);

        const targetStatus =
          feature.skipTests && feature.status === 'waiting_approval'
            ? 'waiting_approval'
            : 'backlog';

        if (targetStatus !== feature.status) {
          moveFeature(feature.id, targetStatus);
          // Must await to ensure file is written before user can restart
          await persistFeatureUpdate(feature.id, { status: targetStatus });
        }

        toast.success('Agent stopped', {
          description:
            targetStatus === 'waiting_approval'
              ? `Stopped commit - returned to waiting approval: ${truncateDescription(
                  feature.description
                )}`
              : `Stopped working on: ${truncateDescription(feature.description)}`,
        });
      } catch (error) {
        logger.error('Error stopping feature:', error);
        toast.error('Failed to stop agent', {
          description: error instanceof Error ? error.message : 'An error occurred',
        });
      }
    },
    [autoMode, moveFeature, persistFeatureUpdate]
  );

  const handleStartNextFeatures = useCallback(async () => {
    // Filter backlog features by the currently selected worktree branch
    // This ensures "G" only starts features from the filtered list
    const primaryBranch = projectPath ? getPrimaryWorktreeBranch(projectPath) : null;
    const backlogFeatures = features.filter((f) => {
      if (f.status !== 'backlog') return false;

      // Determine the feature's branch (default to primary branch if not set)
      const featureBranch = f.branchName || primaryBranch || 'main';

      // If no worktree is selected (currentWorktreeBranch is null or matches primary),
      // show features with no branch or primary branch
      if (
        !currentWorktreeBranch ||
        (projectPath && isPrimaryWorktreeBranch(projectPath, currentWorktreeBranch))
      ) {
        return (
          !f.branchName || (projectPath && isPrimaryWorktreeBranch(projectPath, featureBranch))
        );
      }

      // Otherwise, only show features matching the selected worktree branch
      return featureBranch === currentWorktreeBranch;
    });

    const availableSlots = useAppStore.getState().maxConcurrency - runningAutoTasks.length;

    if (availableSlots <= 0) {
      toast.error('Concurrency limit reached', {
        description: 'Wait for a task to complete or increase the concurrency limit.',
      });
      return;
    }

    if (backlogFeatures.length === 0) {
      const isOnPrimaryBranch =
        !currentWorktreeBranch ||
        (projectPath && isPrimaryWorktreeBranch(projectPath, currentWorktreeBranch));
      toast.info('Backlog empty', {
        description: !isOnPrimaryBranch
          ? `No features in backlog for branch "${currentWorktreeBranch}".`
          : 'No features in backlog to start.',
      });
      return;
    }

    // Sort by priority (lower number = higher priority, priority 1 is highest)
    // Features with blocking dependencies are sorted to the end
    const sortedBacklog = [...backlogFeatures].sort((a, b) => {
      const aBlocked =
        enableDependencyBlocking && !skipVerificationInAutoMode
          ? getBlockingDependencies(a, features).length > 0
          : false;
      const bBlocked =
        enableDependencyBlocking && !skipVerificationInAutoMode
          ? getBlockingDependencies(b, features).length > 0
          : false;

      // Blocked features go to the end
      if (aBlocked && !bBlocked) return 1;
      if (!aBlocked && bBlocked) return -1;

      // Within same blocked/unblocked group, sort by priority
      return (a.priority || 999) - (b.priority || 999);
    });

    // Find the first feature without blocking dependencies
    const featureToStart = sortedBacklog.find((f) => {
      if (!enableDependencyBlocking || skipVerificationInAutoMode) return true;
      return getBlockingDependencies(f, features).length === 0;
    });

    if (!featureToStart) {
      toast.info('No eligible features', {
        description:
          'All backlog features have unmet dependencies. Complete their dependencies first (or enable "Skip verification requirement" in Auto Mode settings).',
      });
      return;
    }

    // Start only one feature per keypress (user must press again for next)
    // Simplified: No worktree creation on client - server derives workDir from feature.branchName
    await handleStartImplementation(featureToStart);
  }, [
    features,
    runningAutoTasks,
    handleStartImplementation,
    currentWorktreeBranch,
    projectPath,
    isPrimaryWorktreeBranch,
    getPrimaryWorktreeBranch,
    enableDependencyBlocking,
    skipVerificationInAutoMode,
  ]);

  const handleArchiveAllVerified = useCallback(async () => {
    const verifiedFeatures = features.filter((f) => f.status === 'verified');
    if (verifiedFeatures.length === 0) return;

    // Optimistically update all features in the UI immediately
    for (const feature of verifiedFeatures) {
      updateFeature(feature.id, { status: 'completed' as const });
    }

    // Stop any running features in parallel (non-blocking for the UI)
    const runningVerified = verifiedFeatures.filter((f) => runningAutoTasks.includes(f.id));
    if (runningVerified.length > 0) {
      await Promise.allSettled(
        runningVerified.map((feature) =>
          autoMode.stopFeature(feature.id).catch((error) => {
            logger.error('Error stopping feature before archive:', error);
          })
        )
      );
    }

    // Use bulk update API for a single server request instead of N individual calls
    try {
      if (currentProject) {
        const api = getHttpApiClient();
        const featureIds = verifiedFeatures.map((f) => f.id);
        const result = await api.features.bulkUpdate(currentProject.path, featureIds, {
          status: 'completed' as const,
        });

        if (result.success) {
          // Refresh features from server to sync React Query cache
          loadFeatures();
          toast.success('All verified features archived', {
            description: `Archived ${verifiedFeatures.length} feature(s).`,
          });
        } else {
          logger.error('Bulk archive failed:', result);
          // Reload features to sync state with server
          loadFeatures();
        }
      }
    } catch (error) {
      logger.error('Failed to bulk archive features:', error);
      // Reload features to sync state with server on error
      loadFeatures();
    }
  }, [features, runningAutoTasks, autoMode, updateFeature, currentProject, loadFeatures]);

  const handleDuplicateFeature = useCallback(
    async (feature: Feature, asChild: boolean = false) => {
      // Copy all feature data, stripping id, status (handled by create), and runtime/state fields.
      // Also strip initialStatus and workMode which are transient creation parameters that
      // should not carry over to duplicates (initialStatus: 'in_progress' would cause
      // the duplicate to immediately appear in "In Progress" instead of "Backlog").
      const {
        id: _id,
        status: _status,
        initialStatus: _initialStatus,
        workMode: _workMode,
        startedAt: _startedAt,
        error: _error,
        summary: _summary,
        spec: _spec,
        passes: _passes,
        planSpec: _planSpec,
        descriptionHistory: _descriptionHistory,
        titleGenerating: _titleGenerating,
        ...featureData
      } = feature;
      const duplicatedFeatureData = {
        ...featureData,
        // If duplicating as child, set source as dependency; otherwise keep existing
        ...(asChild && { dependencies: [feature.id] }),
      };

      // Reuse the existing handleAddFeature logic
      await handleAddFeature(duplicatedFeatureData);

      toast.success(asChild ? 'Duplicated as child' : 'Feature duplicated', {
        description: `Created copy of: ${truncateDescription(feature.description || feature.title || '')}`,
      });
    },
    [handleAddFeature]
  );

  const handleDuplicateAsChildMultiple = useCallback(
    async (feature: Feature, count: number) => {
      // Guard: reject non-positive counts
      if (count <= 0) {
        toast.error('Invalid duplicate count', {
          description: 'Count must be a positive number.',
        });
        return;
      }

      // Cap count to prevent runaway API calls
      const effectiveCount = Math.min(count, MAX_DUPLICATES);

      // Create a chain of duplicates, each a child of the previous, so they execute sequentially
      let parentFeature = feature;
      let successCount = 0;

      for (let i = 0; i < effectiveCount; i++) {
        const {
          id: _id,
          status: _status,
          initialStatus: _initialStatus,
          workMode: _workMode,
          startedAt: _startedAt,
          error: _error,
          summary: _summary,
          spec: _spec,
          passes: _passes,
          planSpec: _planSpec,
          descriptionHistory: _descriptionHistory,
          titleGenerating: _titleGenerating,
          ...featureData
        } = parentFeature;

        const duplicatedFeatureData = {
          ...featureData,
          // Each duplicate depends on the previous one in the chain
          dependencies: [parentFeature.id],
        };

        try {
          const newFeature = await handleAddFeature(duplicatedFeatureData);

          // Use the returned feature directly as the parent for the next iteration,
          // avoiding a fragile assumption that the newest feature is the last item in the store
          if (newFeature) {
            parentFeature = newFeature;
          }
          successCount++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          toast.error(
            `Failed after creating ${successCount} of ${effectiveCount} duplicate${effectiveCount !== 1 ? 's' : ''}`,
            {
              description: errorMessage,
            }
          );
          return;
        }
      }

      if (successCount === effectiveCount) {
        toast.success(`Created ${successCount} chained duplicate${successCount !== 1 ? 's' : ''}`, {
          description: `Created ${successCount} sequential ${successCount !== 1 ? 'copies' : 'copy'} of: ${truncateDescription(feature.description || feature.title || '')}`,
        });
      } else {
        toast.info(
          `Partially created ${successCount} of ${effectiveCount} chained duplicate${effectiveCount !== 1 ? 's' : ''}`,
          {
            description: `Created ${successCount} sequential ${successCount !== 1 ? 'copies' : 'copy'} of: ${truncateDescription(feature.description || feature.title || '')}`,
          }
        );
      }
    },
    [handleAddFeature]
  );

  return {
    handleAddFeature,
    handleUpdateFeature,
    handleDeleteFeature,
    handleStartImplementation,
    handleVerifyFeature,
    handleResumeFeature,
    handleManualVerify,
    handleMoveBackToInProgress,
    handleOpenFollowUp,
    handleSendFollowUp,
    handleCommitFeature,
    handleMergeFeature,
    handleCompleteFeature,
    handleUnarchiveFeature,
    handleViewOutput,
    handleOutputModalNumberKeyPress,
    handleForceStopFeature,
    handleStartNextFeatures,
    handleArchiveAllVerified,
    handleDuplicateFeature,
    handleDuplicateAsChildMultiple,
  };
}
