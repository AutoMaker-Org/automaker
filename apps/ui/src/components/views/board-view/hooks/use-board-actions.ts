import { useCallback } from 'react';
import {
  Feature,
  FeatureImage,
  AgentModel,
  ThinkingLevel,
  PlanningMode,
  useAppStore,
} from '@/store/app-store';
import type { WorktreeCategory } from '@automaker/types';
import {
  FeatureImagePath as DescriptionImagePath,
  FeatureTextFilePath as DescriptionTextFilePath,
} from '@/components/ui/description-image-dropzone';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';
import { useAutoMode } from '@/hooks/use-auto-mode';
import { truncateDescription } from '@/lib/utils';
import { getBlockingDependencies } from '@automaker/dependency-resolver';

interface UseBoardActionsProps {
  currentProject: { path: string; id: string } | null;
  features: Feature[];
  runningAutoTasks: string[];
  loadFeatures: () => Promise<void>;
  persistFeatureCreate: (feature: Feature) => Promise<void>;
  persistFeatureUpdate: (featureId: string, updates: Partial<Feature>) => Promise<void>;
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
  const {
    addFeature,
    updateFeature,
    removeFeature,
    moveFeature,
    useWorktrees,
    enableDependencyBlocking,
    isPrimaryWorktreeBranch,
    getPrimaryWorktreeBranch,
  } = useAppStore();
  const autoMode = useAutoMode();

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
      model: AgentModel;
      planningModel?: AgentModel;
      thinkingLevel: ThinkingLevel;
      branchName: string;
      priority: number;
      planningMode: PlanningMode;
      requirePlanApproval: boolean;
      dependencies?: string[];
      implementationEndpointPreset?: 'default' | 'zai' | 'custom';
      implementationEndpointUrl?: string;
      enabledMcpServers?: string[];
      worktreeCategory?: WorktreeCategory;
    }) => {
      // Empty string means "unassigned" (show only on primary worktree) - convert to undefined
      // Non-empty string is the actual branch name (for non-primary worktrees)
      const finalBranchName = featureData.branchName || undefined;

      // If worktrees enabled and a branch is specified, create the worktree now
      // This ensures the worktree exists before the feature starts
      if (useWorktrees && finalBranchName && currentProject) {
        try {
          const api = getElectronAPI();
          if (api?.worktree?.create) {
            const result = await api.worktree.create(currentProject.path, finalBranchName);
            if (result.success && result.worktree) {
              console.log(
                `[Board] Worktree for branch "${finalBranchName}" ${
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
              console.error(
                `[Board] Failed to create worktree for branch "${finalBranchName}":`,
                result.error
              );
              toast.error('Failed to create worktree', {
                description: result.error || 'An error occurred',
              });
            }
          }
        } catch (error) {
          console.error('[Board] Error creating worktree:', error);
          toast.error('Failed to create worktree', {
            description: error instanceof Error ? error.message : 'An error occurred',
          });
        }
      }

      // Check if we need to generate a title
      const needsTitleGeneration = !featureData.title.trim() && featureData.description.trim();

      const newFeatureData = {
        ...featureData,
        title: featureData.title,
        titleGenerating: needsTitleGeneration,
        status: 'backlog' as const,
        branchName: finalBranchName,
        dependencies: featureData.dependencies || [],
        worktreeCategory: featureData.worktreeCategory,
      };
      const createdFeature = addFeature(newFeatureData);
      // Must await to ensure feature exists on server before user can drag it
      await persistFeatureCreate(createdFeature);
      saveCategory(featureData.category);

      // Generate title in the background if needed (non-blocking)
      if (needsTitleGeneration) {
        const api = getElectronAPI();
        if (api?.features?.generateTitle) {
          api.features
            .generateTitle(featureData.description)
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
              console.error('[Board] Error generating title:', error);
              // Clear generating flag on error
              const titleUpdates = { titleGenerating: false };
              updateFeature(createdFeature.id, titleUpdates);
              persistFeatureUpdate(createdFeature.id, titleUpdates);
            });
        }
      }
    },
    [
      addFeature,
      persistFeatureCreate,
      persistFeatureUpdate,
      updateFeature,
      saveCategory,
      useWorktrees,
      currentProject,
      onWorktreeCreated,
      onWorktreeAutoSelect,
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
        model: AgentModel;
        planningModel?: AgentModel;
        thinkingLevel: ThinkingLevel;
        imagePaths: DescriptionImagePath[];
        textFilePaths: DescriptionTextFilePath[];
        branchName: string;
        priority: number;
        planningMode?: PlanningMode;
        requirePlanApproval?: boolean;
        implementationEndpointPreset?: 'default' | 'zai' | 'custom';
        implementationEndpointUrl?: string;
        enabledMcpServers?: string[];
        worktreeCategory?: WorktreeCategory;
      }
    ) => {
      const finalBranchName = updates.branchName || undefined;

      // If worktrees enabled and a branch is specified, create the worktree now
      // This ensures the worktree exists before the feature starts
      if (useWorktrees && finalBranchName && currentProject) {
        try {
          const api = getElectronAPI();
          if (api?.worktree?.create) {
            const result = await api.worktree.create(currentProject.path, finalBranchName);
            if (result.success) {
              console.log(
                `[Board] Worktree for branch "${finalBranchName}" ${
                  result.worktree?.isNew ? 'created' : 'already exists'
                }`
              );
              // Refresh worktree list in UI
              onWorktreeCreated?.();
            } else {
              console.error(
                `[Board] Failed to create worktree for branch "${finalBranchName}":`,
                result.error
              );
              toast.error('Failed to create worktree', {
                description: result.error || 'An error occurred',
              });
            }
          }
        } catch (error) {
          console.error('[Board] Error creating worktree:', error);
          toast.error('Failed to create worktree', {
            description: error instanceof Error ? error.message : 'An error occurred',
          });
        }
      }

      const finalUpdates = {
        ...updates,
        title: updates.title,
        branchName: finalBranchName,
      };

      updateFeature(featureId, finalUpdates);
      persistFeatureUpdate(featureId, finalUpdates);
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
      useWorktrees,
      currentProject,
      onWorktreeCreated,
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
          console.error('[Board] Error stopping feature before delete:', error);
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
              console.log(`[Board] Deleted image: ${imagePathObj.path}`);
            } catch (error) {
              console.error(`[Board] Failed to delete image ${imagePathObj.path}:`, error);
            }
          }
        } catch (error) {
          console.error(`[Board] Error deleting images for feature ${featureId}:`, error);
        }
      }

      removeFeature(featureId);
      persistFeatureDelete(featureId);
    },
    [features, runningAutoTasks, autoMode, removeFeature, persistFeatureDelete]
  );

  const handleRunFeature = useCallback(
    async (feature: Feature) => {
      if (!currentProject) return;

      try {
        const api = getElectronAPI();
        if (!api?.autoMode) {
          console.error('Auto mode API not available');
          return;
        }

        // Server derives workDir from feature.branchName at execution time
        const result = await api.autoMode.runFeature(
          currentProject.path,
          feature.id,
          useWorktrees
          // No worktreePath - server derives from feature.branchName
        );

        if (result.success) {
          console.log(
            '[Board] Feature run started successfully, branch:',
            feature.branchName || 'default'
          );
        } else {
          console.error('[Board] Failed to run feature:', result.error);
          await loadFeatures();
        }
      } catch (error) {
        console.error('[Board] Error running feature:', error);
        await loadFeatures();
      }
    },
    [currentProject, useWorktrees, loadFeatures]
  );

  const handleStartImplementation = useCallback(
    async (feature: Feature) => {
      if (!autoMode.canStartNewTask) {
        toast.error('Concurrency limit reached', {
          description: `You can only have ${autoMode.maxConcurrency} task${
            autoMode.maxConcurrency > 1 ? 's' : ''
          } running at a time. Wait for a task to complete or increase the limit.`,
        });
        return false;
      }

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

      const updates = {
        status: 'in_progress' as const,
        startedAt: new Date().toISOString(),
      };
      updateFeature(feature.id, updates);
      // Must await to ensure feature status is persisted before starting agent
      await persistFeatureUpdate(feature.id, updates);
      console.log('[Board] Feature moved to in_progress, starting agent...');
      await handleRunFeature(feature);
      return true;
    },
    [
      autoMode,
      enableDependencyBlocking,
      features,
      updateFeature,
      persistFeatureUpdate,
      handleRunFeature,
    ]
  );

  const handleVerifyFeature = useCallback(
    async (feature: Feature) => {
      if (!currentProject) return;

      try {
        const api = getElectronAPI();
        if (!api?.autoMode) {
          console.error('Auto mode API not available');
          return;
        }

        const result = await api.autoMode.verifyFeature(currentProject.path, feature.id);

        if (result.success) {
          console.log('[Board] Feature verification started successfully');
        } else {
          console.error('[Board] Failed to verify feature:', result.error);
          await loadFeatures();
        }
      } catch (error) {
        console.error('[Board] Error verifying feature:', error);
        await loadFeatures();
      }
    },
    [currentProject, loadFeatures]
  );

  const handleResumeFeature = useCallback(
    async (feature: Feature) => {
      if (!currentProject) return;

      try {
        const api = getElectronAPI();
        if (!api?.autoMode) {
          console.error('Auto mode API not available');
          return;
        }

        const result = await api.autoMode.resumeFeature(
          currentProject.path,
          feature.id,
          useWorktrees
        );

        if (result.success) {
          console.log('[Board] Feature resume started successfully');
        } else {
          console.error('[Board] Failed to resume feature:', result.error);
          await loadFeatures();
        }
      } catch (error) {
        console.error('[Board] Error resuming feature:', error);
        await loadFeatures();
      }
    },
    [currentProject, loadFeatures, useWorktrees]
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

    const api = getElectronAPI();
    if (!api?.autoMode?.followUpFeature) {
      console.error('Follow-up feature API not available');
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
    persistFeatureUpdate(featureId, updates);

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
    api.autoMode
      .followUpFeature(
        currentProject.path,
        followUpFeature.id,
        followUpPrompt,
        imagePaths
        // No worktreePath - server derives from feature.branchName
      )
      .catch((error) => {
        console.error('[Board] Error sending follow-up:', error);
        toast.error('Failed to send follow-up', {
          description: error instanceof Error ? error.message : 'An error occurred',
        });
        loadFeatures();
      });
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
    loadFeatures,
  ]);

  const handleCommitFeature = useCallback(
    async (feature: Feature) => {
      if (!currentProject) return;

      try {
        const api = getElectronAPI();
        if (!api?.autoMode?.commitFeature) {
          console.error('Commit feature API not available');
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
          console.error('[Board] Failed to commit feature:', result.error);
          toast.error('Failed to commit feature', {
            description: result.error || 'An error occurred',
          });
          await loadFeatures();
        }
      } catch (error) {
        console.error('[Board] Error committing feature:', error);
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
          console.error('Worktree API not available');
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
          console.error('[Board] Failed to merge feature:', result.error);
          toast.error('Failed to merge feature', {
            description: result.error || 'An error occurred',
          });
        }
      } catch (error) {
        console.error('[Board] Error merging feature:', error);
        toast.error('Failed to merge feature', {
          description: error instanceof Error ? error.message : 'An error occurred',
        });
      }
    },
    [currentProject, loadFeatures]
  );

  // Stage changes from feature worktree to main branch (no commit)
  const handleStageChanges = useCallback(
    async (
      feature: Feature
    ): Promise<{
      success: boolean;
      staged?: boolean;
      suggestedMessage?: string;
      diffSummary?: string;
      filesChanged?: number;
      insertions?: number;
      deletions?: number;
      error?: string;
    } | null> => {
      if (!currentProject) return null;

      try {
        const api = getElectronAPI();
        if (!api?.worktree?.stageChanges) {
          console.error('Stage Changes API not available');
          toast.error('Stage Changes not available', {
            description: 'This feature is not available in the current version.',
          });
          return null;
        }

        const result = await api.worktree.stageChanges(currentProject.path, feature.id);

        if (result.success && result.staged) {
          return {
            success: true,
            staged: true,
            suggestedMessage: result.suggestedMessage,
            diffSummary: result.diffSummary,
            filesChanged: result.filesChanged,
            insertions: result.insertions,
            deletions: result.deletions,
          };
        } else if (result.success && !result.allConflictsResolved) {
          toast.warning('Unresolved conflicts', {
            description:
              'Some conflicts could not be automatically resolved. Please resolve manually.',
          });
          return {
            success: false,
            error: result.error || 'Unresolved conflicts',
          };
        } else {
          console.error('[Board] Failed to stage changes:', result.error);
          toast.error('Failed to stage changes', {
            description: result.error || 'An error occurred',
          });
          return {
            success: false,
            error: result.error,
          };
        }
      } catch (error) {
        console.error('[Board] Error staging changes:', error);
        toast.error('Failed to stage changes', {
          description: error instanceof Error ? error.message : 'An error occurred',
        });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'An error occurred',
        };
      }
    },
    [currentProject]
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
      const updates = {
        status: 'verified' as const,
      };
      updateFeature(feature.id, updates);
      persistFeatureUpdate(feature.id, updates);

      toast.success('Feature restored', {
        description: `Moved back to verified: ${truncateDescription(feature.description)}`,
      });
    },
    [updateFeature, persistFeatureUpdate]
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
        console.error('[Board] Error stopping feature:', error);
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
      const aBlocked = enableDependencyBlocking
        ? getBlockingDependencies(a, features).length > 0
        : false;
      const bBlocked = enableDependencyBlocking
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
      if (!enableDependencyBlocking) return true;
      return getBlockingDependencies(f, features).length === 0;
    });

    if (!featureToStart) {
      toast.info('No eligible features', {
        description:
          'All backlog features have unmet dependencies. Complete their dependencies first.',
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
  ]);

  const handleArchiveAllVerified = useCallback(async () => {
    const verifiedFeatures = features.filter((f) => f.status === 'verified');

    for (const feature of verifiedFeatures) {
      const isRunning = runningAutoTasks.includes(feature.id);
      if (isRunning) {
        try {
          await autoMode.stopFeature(feature.id);
        } catch (error) {
          console.error('[Board] Error stopping feature before archive:', error);
        }
      }
      // Archive the feature by setting status to completed
      const updates = {
        status: 'completed' as const,
      };
      updateFeature(feature.id, updates);
      persistFeatureUpdate(feature.id, updates);
    }

    toast.success('All verified features archived', {
      description: `Archived ${verifiedFeatures.length} feature(s).`,
    });
  }, [features, runningAutoTasks, autoMode, updateFeature, persistFeatureUpdate]);

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
    handleStageChanges,
    handleCompleteFeature,
    handleUnarchiveFeature,
    handleViewOutput,
    handleOutputModalNumberKeyPress,
    handleForceStopFeature,
    handleStartNextFeatures,
    handleArchiveAllVerified,
  };
}
