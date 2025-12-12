import { useEffect, useCallback, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "@/store/app-store";
import { services, isBootstrapped } from "@/services";
import type { AutoModeEvent } from "@/services/types/events";

/**
 * Hook for managing auto mode (scoped per project)
 */
export function useAutoMode() {
  const {
    autoModeByProject,
    setAutoModeRunning,
    addRunningTask,
    removeRunningTask,
    clearRunningTasks,
    currentProject,
    addAutoModeActivity,
    maxConcurrency,
    projects,
  } = useAppStore(
    useShallow((state) => ({
      autoModeByProject: state.autoModeByProject,
      setAutoModeRunning: state.setAutoModeRunning,
      addRunningTask: state.addRunningTask,
      removeRunningTask: state.removeRunningTask,
      clearRunningTasks: state.clearRunningTasks,
      currentProject: state.currentProject,
      addAutoModeActivity: state.addAutoModeActivity,
      maxConcurrency: state.maxConcurrency,
      projects: state.projects,
    }))
  );

  // Helper to look up project ID from path
  const getProjectIdFromPath = useCallback((path: string): string | undefined => {
    const project = projects.find(p => p.path === path);
    return project?.id;
  }, [projects]);

  // Get project-specific auto mode state
  const projectId = currentProject?.id;
  const projectAutoModeState = useMemo(() => {
    if (!projectId) return { isRunning: false, runningTasks: [] };
    return autoModeByProject[projectId] || { isRunning: false, runningTasks: [] };
  }, [autoModeByProject, projectId]);

  const isAutoModeRunning = projectAutoModeState.isRunning;
  const runningAutoTasks = projectAutoModeState.runningTasks;

  // Check if we can start a new task based on concurrency limit
  const canStartNewTask = runningAutoTasks.length < maxConcurrency;

  // Handle auto mode events - listen globally for all projects
  useEffect(() => {
    if (!isBootstrapped()) return;

    const { unsubscribe } = services.autoMode.onEvent((event: AutoModeEvent) => {
      console.log("[AutoMode Event]", event);

      // Events include projectPath from backend - use it to look up project ID
      // Fall back to current projectId if not provided in event
      let eventProjectId: string | undefined;
      if ('projectPath' in event && event.projectPath) {
        eventProjectId = getProjectIdFromPath(event.projectPath);
      }
      if (!eventProjectId && 'projectId' in event && event.projectId) {
        eventProjectId = event.projectId;
      }
      if (!eventProjectId) {
        eventProjectId = projectId;
      }

      // Skip event if we couldn't determine the project
      if (!eventProjectId) {
        console.warn("[AutoMode] Could not determine project for event:", event);
        return;
      }

      switch (event.type) {
        case "auto_mode_feature_start":
          if (event.featureId) {
            addRunningTask(eventProjectId, event.featureId);
            addAutoModeActivity({
              featureId: event.featureId,
              type: "start",
              message: `Started working on feature`,
            });
          }
          break;

        case "auto_mode_feature_complete":
          // Feature completed - remove from running tasks and UI will reload features on its own
          if (event.featureId) {
            console.log(
              "[AutoMode] Feature completed:",
              event.featureId,
              "passes:",
              event.passes
            );
            removeRunningTask(eventProjectId, event.featureId);
            addAutoModeActivity({
              featureId: event.featureId,
              type: "complete",
              message: event.passes
                ? "Feature completed successfully"
                : "Feature completed with failures",
              passes: event.passes,
            });
          }
          break;

        case "auto_mode_complete":
          // All features completed for this project
          setAutoModeRunning(eventProjectId, false);
          clearRunningTasks(eventProjectId);
          console.log("[AutoMode] All features completed!");
          break;

        case "auto_mode_error":
          console.error("[AutoMode Error]", event.error);
          if (event.featureId && event.error) {
            addAutoModeActivity({
              featureId: event.featureId,
              type: "error",
              message: event.error,
            });
          }
          break;

        case "auto_mode_progress":
          // Log progress updates (throttle to avoid spam)
          if (event.featureId && event.content && event.content.length > 10) {
            addAutoModeActivity({
              featureId: event.featureId,
              type: "progress",
              message: event.content.substring(0, 200), // Limit message length
            });
          }
          break;

        case "auto_mode_tool":
          // Log tool usage
          if (event.featureId && event.tool) {
            addAutoModeActivity({
              featureId: event.featureId,
              type: "tool",
              message: `Using tool: ${event.tool}`,
              tool: event.tool,
            });
          }
          break;

        case "auto_mode_phase":
          // Log phase transitions (Planning, Action, Verification)
          if (event.featureId && event.phase && event.message) {
            console.log(
              `[AutoMode] Phase: ${event.phase} for ${event.featureId}`
            );
            addAutoModeActivity({
              featureId: event.featureId,
              type: event.phase,
              message: event.message,
              phase: event.phase,
            });
          }
          break;
      }
    });

    return () => unsubscribe();
  }, [
    projectId,
    addRunningTask,
    removeRunningTask,
    clearRunningTasks,
    setAutoModeRunning,
    addAutoModeActivity,
    getProjectIdFromPath,
  ]);

  // Restore auto mode for all projects that were running when app was closed
  // This runs once on mount to restart auto loops for persisted running states
  useEffect(() => {
    if (!isBootstrapped()) return;

    // Find all projects that have auto mode marked as running
    const projectsToRestart: Array<{ projectId: string; projectPath: string }> = [];
    for (const [projectId, state] of Object.entries(autoModeByProject)) {
      if (state.isRunning) {
        // Find the project path for this project ID
        const project = projects.find(p => p.id === projectId);
        if (project) {
          projectsToRestart.push({ projectId, projectPath: project.path });
        }
      }
    }

    // Restart auto mode for each project
    for (const { projectId, projectPath } of projectsToRestart) {
      console.log(`[AutoMode] Restoring auto mode for project: ${projectPath}`);
      services.autoMode.start(projectPath, maxConcurrency).then(result => {
        if (!result.success) {
          console.error(`[AutoMode] Failed to restore auto mode for ${projectPath}:`, result.error);
          // Mark as not running if we couldn't restart
          setAutoModeRunning(projectId, false);
        } else {
          console.log(`[AutoMode] Restored auto mode for ${projectPath}`);
        }
      }).catch(error => {
        console.error(`[AutoMode] Error restoring auto mode for ${projectPath}:`, error);
        setAutoModeRunning(projectId, false);
      });
    }
    // Only run once on mount - intentionally empty dependency array
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start auto mode
  const start = useCallback(async () => {
    if (!currentProject) {
      console.error("No project selected");
      return;
    }

    if (!isBootstrapped()) {
      throw new Error("Services not initialized");
    }

    try {
      const result = await services.autoMode.start(currentProject.path, maxConcurrency);

      if (result.success) {
        setAutoModeRunning(currentProject.id, true);
        console.log(`[AutoMode] Started successfully with maxConcurrency: ${maxConcurrency}`);
      } else {
        console.error("[AutoMode] Failed to start:", result.error);
        throw new Error(result.error || "Failed to start auto mode");
      }
    } catch (error) {
      console.error("[AutoMode] Error starting:", error);
      if (currentProject) {
        setAutoModeRunning(currentProject.id, false);
      }
      throw error;
    }
  }, [currentProject, setAutoModeRunning, maxConcurrency]);

  // Stop auto mode - only turns off the toggle, running tasks continue
  const stop = useCallback(async () => {
    if (!currentProject) {
      console.error("No project selected");
      return;
    }

    if (!isBootstrapped()) {
      throw new Error("Services not initialized");
    }

    try {
      const result = await services.autoMode.stop(currentProject.path);

      if (result.success) {
        setAutoModeRunning(currentProject.id, false);
        // NOTE: We intentionally do NOT clear running tasks here.
        // Stopping auto mode only turns off the toggle to prevent new features
        // from being picked up. Running tasks will complete naturally and be
        // removed via the auto_mode_feature_complete event.
        console.log("[AutoMode] Stopped successfully - running tasks will continue");
      } else {
        console.error("[AutoMode] Failed to stop:", result.error);
        throw new Error(result.error || "Failed to stop auto mode");
      }
    } catch (error) {
      console.error("[AutoMode] Error stopping:", error);
      throw error;
    }
  }, [currentProject, setAutoModeRunning]);

  // Stop a specific feature
  const stopFeature = useCallback(
    async (featureId: string) => {
      if (!currentProject) {
        console.error("No project selected");
        return;
      }

      if (!isBootstrapped()) {
        throw new Error("Services not initialized");
      }

      try {
        const result = await services.autoMode.stopFeature(featureId);

        if (result.success) {
          removeRunningTask(currentProject.id, featureId);
          console.log("[AutoMode] Feature stopped successfully:", featureId);
          addAutoModeActivity({
            featureId,
            type: "complete",
            message: "Feature stopped by user",
            passes: false,
          });
        } else {
          console.error("[AutoMode] Failed to stop feature:", result.error);
          throw new Error(result.error || "Failed to stop feature");
        }
      } catch (error) {
        console.error("[AutoMode] Error stopping feature:", error);
        throw error;
      }
    },
    [currentProject, removeRunningTask, addAutoModeActivity]
  );

  return {
    isRunning: isAutoModeRunning,
    runningTasks: runningAutoTasks,
    maxConcurrency,
    canStartNewTask,
    start,
    stop,
    stopFeature,
  };
}
