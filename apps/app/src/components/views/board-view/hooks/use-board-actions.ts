import { useCallback } from "react";
import { Feature, FeatureImage, AgentModel, ThinkingLevel, useAppStore } from "@/store/app-store";
import { FeatureImagePath as DescriptionImagePath } from "@/components/ui/description-image-dropzone";
import { getElectronAPI } from "@/lib/electron";
import { toast } from "sonner";
import { useAutoMode } from "@/hooks/use-auto-mode";
import { truncateDescription } from "@/lib/utils";

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
}: UseBoardActionsProps) {
  const { addFeature, updateFeature, removeFeature, moveFeature, useWorktrees } = useAppStore();
  const autoMode = useAutoMode();

  /**
   * Get or create the worktree path for a feature based on its branchName.
   * - If branchName is "main" or empty, returns the project path
   * - Otherwise, creates a worktree for that branch if needed
   */
  const getOrCreateWorktreeForFeature = useCallback(
    async (feature: Feature): Promise<string | null> => {
      if (!projectPath) return null;

      const branchName = feature.branchName || "main";

      // If targeting main branch, use the project path directly
      if (branchName === "main" || branchName === "master") {
        return projectPath;
      }

      // For other branches, create a worktree if it doesn't exist
      try {
        const api = getElectronAPI();
        if (!api?.worktree?.create) {
          console.error("[BoardActions] Worktree API not available");
          return projectPath;
        }

        // Try to create the worktree (will return existing if already exists)
        const result = await api.worktree.create(projectPath, branchName);

        if (result.success && result.worktree) {
          console.log(
            `[BoardActions] Worktree ready for branch "${branchName}": ${result.worktree.path}`
          );
          if (result.worktree.isNew) {
            toast.success(`Worktree created for branch "${branchName}"`, {
              description: "A new worktree was created for this feature.",
            });
          }
          return result.worktree.path;
        } else {
          console.error("[BoardActions] Failed to create worktree:", result.error);
          toast.error("Failed to create worktree", {
            description: result.error || "Could not create worktree for this branch.",
          });
          return projectPath; // Fall back to project path
        }
      } catch (error) {
        console.error("[BoardActions] Error creating worktree:", error);
        toast.error("Error creating worktree", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
        return projectPath; // Fall back to project path
      }
    },
    [projectPath]
  );

  const handleAddFeature = useCallback(
    (featureData: {
      category: string;
      description: string;
      steps: string[];
      images: FeatureImage[];
      imagePaths: DescriptionImagePath[];
      skipTests: boolean;
      model: AgentModel;
      thinkingLevel: ThinkingLevel;
      branchName: string;
    }) => {
      const newFeatureData = {
        ...featureData,
        status: "backlog" as const,
      };
      const createdFeature = addFeature(newFeatureData);
      persistFeatureCreate(createdFeature);
      saveCategory(featureData.category);
    },
    [addFeature, persistFeatureCreate, saveCategory]
  );

  const handleUpdateFeature = useCallback(
    (
      featureId: string,
      updates: {
        category: string;
        description: string;
        steps: string[];
        skipTests: boolean;
        model: AgentModel;
        thinkingLevel: ThinkingLevel;
        imagePaths: DescriptionImagePath[];
        branchName: string;
      }
    ) => {
      updateFeature(featureId, updates);
      persistFeatureUpdate(featureId, updates);
      if (updates.category) {
        saveCategory(updates.category);
      }
      setEditingFeature(null);
    },
    [updateFeature, persistFeatureUpdate, saveCategory, setEditingFeature]
  );

  const handleDeleteFeature = useCallback(
    async (featureId: string) => {
      const feature = features.find((f) => f.id === featureId);
      if (!feature) return;

      const isRunning = runningAutoTasks.includes(featureId);

      if (isRunning) {
        try {
          await autoMode.stopFeature(featureId);
          toast.success("Agent stopped", {
            description: `Stopped and deleted: ${truncateDescription(feature.description)}`,
          });
        } catch (error) {
          console.error("[Board] Error stopping feature before delete:", error);
          toast.error("Failed to stop agent", {
            description: "The feature will still be deleted.",
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
          console.error("Auto mode API not available");
          return;
        }

        // Use the feature's assigned worktreePath (set when moving to in_progress)
        // This ensures work happens in the correct worktree based on the feature's branchName
        const featureWorktreePath = feature.worktreePath;

        const result = await api.autoMode.runFeature(
          currentProject.path,
          feature.id,
          useWorktrees,
          featureWorktreePath || undefined
        );

        if (result.success) {
          console.log("[Board] Feature run started successfully in worktree:", featureWorktreePath || "main");
        } else {
          console.error("[Board] Failed to run feature:", result.error);
          await loadFeatures();
        }
      } catch (error) {
        console.error("[Board] Error running feature:", error);
        await loadFeatures();
      }
    },
    [currentProject, useWorktrees, loadFeatures]
  );

  const handleStartImplementation = useCallback(
    async (feature: Feature) => {
      if (!autoMode.canStartNewTask) {
        toast.error("Concurrency limit reached", {
          description: `You can only have ${autoMode.maxConcurrency} task${
            autoMode.maxConcurrency > 1 ? "s" : ""
          } running at a time. Wait for a task to complete or increase the limit.`,
        });
        return false;
      }

      const updates = {
        status: "in_progress" as const,
        startedAt: new Date().toISOString(),
      };
      updateFeature(feature.id, updates);
      persistFeatureUpdate(feature.id, updates);
      console.log("[Board] Feature moved to in_progress, starting agent...");
      await handleRunFeature(feature);
      return true;
    },
    [autoMode, updateFeature, persistFeatureUpdate, handleRunFeature]
  );

  const handleVerifyFeature = useCallback(
    async (feature: Feature) => {
      if (!currentProject) return;

      try {
        const api = getElectronAPI();
        if (!api?.autoMode) {
          console.error("Auto mode API not available");
          return;
        }

        const result = await api.autoMode.verifyFeature(currentProject.path, feature.id);

        if (result.success) {
          console.log("[Board] Feature verification started successfully");
        } else {
          console.error("[Board] Failed to verify feature:", result.error);
          await loadFeatures();
        }
      } catch (error) {
        console.error("[Board] Error verifying feature:", error);
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
          console.error("Auto mode API not available");
          return;
        }

        const result = await api.autoMode.resumeFeature(currentProject.path, feature.id);

        if (result.success) {
          console.log("[Board] Feature resume started successfully");
        } else {
          console.error("[Board] Failed to resume feature:", result.error);
          await loadFeatures();
        }
      } catch (error) {
        console.error("[Board] Error resuming feature:", error);
        await loadFeatures();
      }
    },
    [currentProject, loadFeatures]
  );

  const handleManualVerify = useCallback(
    (feature: Feature) => {
      moveFeature(feature.id, "verified");
      persistFeatureUpdate(feature.id, {
        status: "verified",
        justFinishedAt: undefined,
      });
      toast.success("Feature verified", {
        description: `Marked as verified: ${truncateDescription(feature.description)}`,
      });
    },
    [moveFeature, persistFeatureUpdate]
  );

  const handleMoveBackToInProgress = useCallback(
    (feature: Feature) => {
      const updates = {
        status: "in_progress" as const,
        startedAt: new Date().toISOString(),
      };
      updateFeature(feature.id, updates);
      persistFeatureUpdate(feature.id, updates);
      toast.info("Feature moved back", {
        description: `Moved back to In Progress: ${truncateDescription(feature.description)}`,
      });
    },
    [updateFeature, persistFeatureUpdate]
  );

  const handleOpenFollowUp = useCallback(
    (feature: Feature) => {
      setFollowUpFeature(feature);
      setFollowUpPrompt("");
      setFollowUpImagePaths([]);
      setShowFollowUpDialog(true);
    },
    [setFollowUpFeature, setFollowUpPrompt, setFollowUpImagePaths, setShowFollowUpDialog]
  );

  const handleSendFollowUp = useCallback(async () => {
    if (!currentProject || !followUpFeature || !followUpPrompt.trim()) return;

    const featureId = followUpFeature.id;
    const featureDescription = followUpFeature.description;
    const prompt = followUpPrompt;

    const api = getElectronAPI();
    if (!api?.autoMode?.followUpFeature) {
      console.error("Follow-up feature API not available");
      toast.error("Follow-up not available", {
        description: "This feature is not available in the current version.",
      });
      return;
    }

    const updates = {
      status: "in_progress" as const,
      startedAt: new Date().toISOString(),
      justFinishedAt: undefined,
    };
    updateFeature(featureId, updates);
    persistFeatureUpdate(featureId, updates);

    setShowFollowUpDialog(false);
    setFollowUpFeature(null);
    setFollowUpPrompt("");
    setFollowUpImagePaths([]);
    setFollowUpPreviewMap(new Map());

      toast.success("Follow-up started", {
        description: `Continuing work on: ${truncateDescription(featureDescription)}`,
      });

    const imagePaths = followUpImagePaths.map((img) => img.path);
    // Use the feature's worktreePath to ensure work happens in the correct branch
    const featureWorktreePath = followUpFeature.worktreePath;
    api.autoMode
      .followUpFeature(currentProject.path, followUpFeature.id, followUpPrompt, imagePaths, featureWorktreePath)
      .catch((error) => {
        console.error("[Board] Error sending follow-up:", error);
        toast.error("Failed to send follow-up", {
          description: error instanceof Error ? error.message : "An error occurred",
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
          console.error("Commit feature API not available");
          toast.error("Commit not available", {
            description: "This feature is not available in the current version.",
          });
          return;
        }

        // Pass the feature's worktreePath to ensure commits happen in the correct worktree
        const result = await api.autoMode.commitFeature(currentProject.path, feature.id, feature.worktreePath);

        if (result.success) {
          moveFeature(feature.id, "verified");
          persistFeatureUpdate(feature.id, { status: "verified" });
          toast.success("Feature committed", {
            description: `Committed and verified: ${truncateDescription(feature.description)}`,
          });
          // Refresh worktree selector to update commit counts
          onWorktreeCreated?.();
        } else {
          console.error("[Board] Failed to commit feature:", result.error);
          toast.error("Failed to commit feature", {
            description: result.error || "An error occurred",
          });
          await loadFeatures();
        }
      } catch (error) {
        console.error("[Board] Error committing feature:", error);
        toast.error("Failed to commit feature", {
          description: error instanceof Error ? error.message : "An error occurred",
        });
        await loadFeatures();
      }
    },
    [currentProject, moveFeature, persistFeatureUpdate, loadFeatures, onWorktreeCreated]
  );

  const handleRevertFeature = useCallback(
    async (feature: Feature) => {
      if (!currentProject) return;

      try {
        const api = getElectronAPI();
        if (!api?.worktree?.revertFeature) {
          console.error("Worktree API not available");
          toast.error("Revert not available", {
            description: "This feature is not available in the current version.",
          });
          return;
        }

        const result = await api.worktree.revertFeature(currentProject.path, feature.id);

        if (result.success) {
          await loadFeatures();
          toast.success("Feature reverted", {
            description: `All changes discarded. Moved back to backlog: ${truncateDescription(feature.description)}`,
          });
        } else {
          console.error("[Board] Failed to revert feature:", result.error);
          toast.error("Failed to revert feature", {
            description: result.error || "An error occurred",
          });
        }
      } catch (error) {
        console.error("[Board] Error reverting feature:", error);
        toast.error("Failed to revert feature", {
          description: error instanceof Error ? error.message : "An error occurred",
        });
      }
    },
    [currentProject, loadFeatures]
  );

  const handleMergeFeature = useCallback(
    async (feature: Feature) => {
      if (!currentProject) return;

      try {
        const api = getElectronAPI();
        if (!api?.worktree?.mergeFeature) {
          console.error("Worktree API not available");
          toast.error("Merge not available", {
            description: "This feature is not available in the current version.",
          });
          return;
        }

        const result = await api.worktree.mergeFeature(currentProject.path, feature.id);

        if (result.success) {
          await loadFeatures();
          toast.success("Feature merged", {
            description: `Changes merged to main branch: ${truncateDescription(feature.description)}`,
          });
        } else {
          console.error("[Board] Failed to merge feature:", result.error);
          toast.error("Failed to merge feature", {
            description: result.error || "An error occurred",
          });
        }
      } catch (error) {
        console.error("[Board] Error merging feature:", error);
        toast.error("Failed to merge feature", {
          description: error instanceof Error ? error.message : "An error occurred",
        });
      }
    },
    [currentProject, loadFeatures]
  );

  const handleCompleteFeature = useCallback(
    (feature: Feature) => {
      const updates = {
        status: "completed" as const,
      };
      updateFeature(feature.id, updates);
      persistFeatureUpdate(feature.id, updates);

      toast.success("Feature completed", {
        description: `Archived: ${truncateDescription(feature.description)}`,
      });
    },
    [updateFeature, persistFeatureUpdate]
  );

  const handleUnarchiveFeature = useCallback(
    (feature: Feature) => {
      const updates = {
        status: "verified" as const,
      };
      updateFeature(feature.id, updates);
      persistFeatureUpdate(feature.id, updates);

      toast.success("Feature restored", {
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
      const index = key === "0" ? 9 : parseInt(key, 10) - 1;
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
          feature.skipTests && feature.status === "waiting_approval"
            ? "waiting_approval"
            : "backlog";

        if (targetStatus !== feature.status) {
          moveFeature(feature.id, targetStatus);
          persistFeatureUpdate(feature.id, { status: targetStatus });
        }

        toast.success("Agent stopped", {
          description:
            targetStatus === "waiting_approval"
              ? `Stopped commit - returned to waiting approval: ${truncateDescription(feature.description)}`
              : `Stopped working on: ${truncateDescription(feature.description)}`,
        });
      } catch (error) {
        console.error("[Board] Error stopping feature:", error);
        toast.error("Failed to stop agent", {
          description: error instanceof Error ? error.message : "An error occurred",
        });
      }
    },
    [autoMode, moveFeature, persistFeatureUpdate]
  );

  const handleStartNextFeatures = useCallback(async () => {
    const backlogFeatures = features.filter((f) => f.status === "backlog");
    const availableSlots =
      useAppStore.getState().maxConcurrency - runningAutoTasks.length;

    if (availableSlots <= 0) {
      toast.error("Concurrency limit reached", {
        description:
          "Wait for a task to complete or increase the concurrency limit.",
      });
      return;
    }

    if (backlogFeatures.length === 0) {
      toast.info("Backlog empty", {
        description: "No features in backlog to start.",
      });
      return;
    }

    // Start only one feature per keypress (user must press again for next)
    const featuresToStart = backlogFeatures.slice(0, 1);

    for (const feature of featuresToStart) {
      // Get or create worktree based on the feature's assigned branch (same as drag-to-in-progress)
      const worktreePath = await getOrCreateWorktreeForFeature(feature);
      if (worktreePath) {
        await persistFeatureUpdate(feature.id, { worktreePath });
      }
      // Refresh worktree selector after creating worktree
      onWorktreeCreated?.();
      // Start the implementation
      // Pass feature with worktreePath so handleRunFeature uses the correct path
      await handleStartImplementation({ ...feature, worktreePath: worktreePath || undefined });
    }
  }, [features, runningAutoTasks, handleStartImplementation, getOrCreateWorktreeForFeature, persistFeatureUpdate, onWorktreeCreated]);

  const handleDeleteAllVerified = useCallback(async () => {
    const verifiedFeatures = features.filter((f) => f.status === "verified");

    for (const feature of verifiedFeatures) {
      const isRunning = runningAutoTasks.includes(feature.id);
      if (isRunning) {
        try {
          await autoMode.stopFeature(feature.id);
        } catch (error) {
          console.error(
            "[Board] Error stopping feature before delete:",
            error
          );
        }
      }
      removeFeature(feature.id);
      persistFeatureDelete(feature.id);
    }

    toast.success("All verified features deleted", {
      description: `Deleted ${verifiedFeatures.length} feature(s).`,
    });
  }, [features, runningAutoTasks, autoMode, removeFeature, persistFeatureDelete]);

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
    handleRevertFeature,
    handleMergeFeature,
    handleCompleteFeature,
    handleUnarchiveFeature,
    handleViewOutput,
    handleOutputModalNumberKeyPress,
    handleForceStopFeature,
    handleStartNextFeatures,
    handleDeleteAllVerified,
  };
}
