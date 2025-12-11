import { useEffect, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "@/store/app-store";
import { getElectronAPI } from "@/lib/electron";
import type { AutoModeEvent } from "@/types/electron";

/**
 * Hook for managing auto mode
 */
export function useAutoMode() {
  const {
    isAutoModeRunning,
    setAutoModeRunning,
    runningAutoTasks,
    addRunningTask,
    removeRunningTask,
    clearRunningTasks,
    currentProject,
    addAutoModeActivity,
    maxConcurrency,
  } = useAppStore(
    useShallow((state) => ({
      isAutoModeRunning: state.isAutoModeRunning,
      setAutoModeRunning: state.setAutoModeRunning,
      runningAutoTasks: state.runningAutoTasks,
      addRunningTask: state.addRunningTask,
      removeRunningTask: state.removeRunningTask,
      clearRunningTasks: state.clearRunningTasks,
      currentProject: state.currentProject,
      addAutoModeActivity: state.addAutoModeActivity,
      maxConcurrency: state.maxConcurrency,
    }))
  );

  // Check if we can start a new task based on concurrency limit
  const canStartNewTask = runningAutoTasks.length < maxConcurrency;

  // Handle auto mode events
  useEffect(() => {
    const setupEventListener = async () => {
      const api = await getElectronAPI();
      if (!api) {
        console.error("Failed to get Electron API");
        return;
      }
      if (!api.autoMode) return;

      const unsubscribe = api.autoMode.onEvent((event: AutoModeEvent) => {
      console.log("[AutoMode Event]", event);

      switch (event.type) {
        case "auto_mode_feature_start":
          addRunningTask(event.featureId);
          addAutoModeActivity({
            featureId: event.featureId,
            type: "start",
            message: `Started working on feature`,
          });
          break;

        case "auto_mode_feature_complete":
          // Feature completed - remove from running tasks and UI will reload features on its own
          console.log(
            "[AutoMode] Feature completed:",
            event.featureId,
            "passes:",
            event.passes
          );
          removeRunningTask(event.featureId);
          addAutoModeActivity({
            featureId: event.featureId,
            type: "complete",
            message: event.passes
              ? "Feature completed successfully"
              : "Feature completed with failures",
            passes: event.passes,
          });
          break;

        case "auto_mode_complete":
          // All features completed
          setAutoModeRunning(false);
          clearRunningTasks();
          console.log("[AutoMode] All features completed!");
          break;

        case "auto_mode_error":
          console.error("[AutoMode Error]", event.error);
          if (event.featureId) {
            addAutoModeActivity({
              featureId: event.featureId,
              type: "error",
              message: event.error,
            });
          }
          break;

        case "auto_mode_progress":
          // Log progress updates (throttle to avoid spam)
          if (event.content && event.content.length > 10) {
            addAutoModeActivity({
              featureId: event.featureId,
              type: "progress",
              message: event.content.substring(0, 200), // Limit message length
            });
          }
          break;

        case "auto_mode_tool":
          // Log tool usage
          addAutoModeActivity({
            featureId: event.featureId,
            type: "tool",
            message: `Using tool: ${event.tool}`,
            tool: event.tool,
          });
          break;

        case "auto_mode_phase":
          // Log phase transitions (Planning, Action, Verification)
          console.log(
            `[AutoMode] Phase: ${event.phase} for ${event.featureId}`
          );
          addAutoModeActivity({
            featureId: event.featureId,
            type: event.phase,
            message: event.message,
            phase: event.phase,
          });
          break;
      }
      });

      return unsubscribe;
    };

    const cleanup = setupEventListener();
    return () => {
      cleanup.then(unsubscribe => unsubscribe?.());
    };
  }, [
    addRunningTask,
    removeRunningTask,
    clearRunningTasks,
    setAutoModeRunning,
    addAutoModeActivity,
  ]);

  // Start auto mode
  const start = useCallback(async () => {
    if (!currentProject) {
      console.error("No project selected");
      return;
    }

    try {
      const api = await getElectronAPI();
      if (!api) {
        console.error("Failed to get Electron API");
        return;
      }
      if (!api.autoMode) {
        throw new Error("Auto mode API not available");
      }

      const result = await api.autoMode.start(currentProject.path, maxConcurrency);

      if (result.success) {
        setAutoModeRunning(true);
        console.log(`[AutoMode] Started successfully with maxConcurrency: ${maxConcurrency}`);
      } else {
        console.error("[AutoMode] Failed to start:", result.error);
        throw new Error(result.error || "Failed to start auto mode");
      }
    } catch (error) {
      console.error("[AutoMode] Error starting:", error);
      setAutoModeRunning(false);
      throw error;
    }
  }, [currentProject, setAutoModeRunning, maxConcurrency]);

  // Stop auto mode
  const stop = useCallback(async () => {
    try {
      const api = await getElectronAPI();
      if (!api) {
        console.error("Failed to get Electron API");
        return;
      }
      if (!api.autoMode) {
        throw new Error("Auto mode API not available");
      }

      const result = await api.autoMode.stop();

      if (result.success) {
        setAutoModeRunning(false);
        clearRunningTasks();
        console.log("[AutoMode] Stopped successfully");
      } else {
        console.error("[AutoMode] Failed to stop:", result.error);
        throw new Error(result.error || "Failed to stop auto mode");
      }
    } catch (error) {
      console.error("[AutoMode] Error stopping:", error);
      throw error;
    }
  }, [setAutoModeRunning, clearRunningTasks]);

  // Stop a specific feature
  const stopFeature = useCallback(
    async (featureId: string) => {
      try {
        const api = await getElectronAPI();
        if (!api) {
          console.error("Failed to get Electron API");
          return;
        }
        if (!api.autoMode?.stopFeature) {
          throw new Error("Stop feature API not available");
        }

        const result = await api.autoMode.stopFeature(featureId);

        if (result.success) {
          removeRunningTask(featureId);
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
    [removeRunningTask, addAutoModeActivity]
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
