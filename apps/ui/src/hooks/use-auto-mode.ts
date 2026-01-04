import { useEffect, useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import type { AutoModeEvent } from '@/types/electron';

// Type guard for plan_approval_required event
function isPlanApprovalEvent(
  event: AutoModeEvent
): event is Extract<AutoModeEvent, { type: 'plan_approval_required' }> {
  return event.type === 'plan_approval_required';
}

/**
 * Hook for managing auto mode (scoped per project)
 */
export function useAutoMode() {
  const {
    autoModeByProject,
    setAutoModeRunning,
    addRunningTask,
    removeRunningTask,
    currentProject,
    addAutoModeActivity,
    maxConcurrency,
    projects,
    setPendingPlanApproval,
    setAutoModePaused,
    openAutoModePauseDialog,
  } = useAppStore(
    useShallow((state) => ({
      autoModeByProject: state.autoModeByProject,
      setAutoModeRunning: state.setAutoModeRunning,
      addRunningTask: state.addRunningTask,
      removeRunningTask: state.removeRunningTask,
      currentProject: state.currentProject,
      addAutoModeActivity: state.addAutoModeActivity,
      maxConcurrency: state.maxConcurrency,
      projects: state.projects,
      setPendingPlanApproval: state.setPendingPlanApproval,
      setAutoModePaused: state.setAutoModePaused,
      openAutoModePauseDialog: state.openAutoModePauseDialog,
    }))
  );

  // Helper to look up project ID from path
  const getProjectIdFromPath = useCallback(
    (path: string): string | undefined => {
      const project = projects.find((p) => p.path === path);
      return project?.id;
    },
    [projects]
  );

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
    const api = getElectronAPI();
    if (!api?.autoMode) return;

    const unsubscribe = api.autoMode.onEvent((event: AutoModeEvent) => {
      console.log('[AutoMode Event]', event);

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
        console.warn('[AutoMode] Could not determine project for event:', event);
        return;
      }

      switch (event.type) {
        case 'auto_mode_feature_start':
          if (event.featureId) {
            addRunningTask(eventProjectId, event.featureId);
            addAutoModeActivity({
              featureId: event.featureId,
              type: 'start',
              message: `Started working on feature`,
            });
          }
          break;

        case 'auto_mode_feature_complete':
          // Feature completed - remove from running tasks and UI will reload features on its own
          if (event.featureId) {
            console.log('[AutoMode] Feature completed:', event.featureId, 'passes:', event.passes);
            removeRunningTask(eventProjectId, event.featureId);
            addAutoModeActivity({
              featureId: event.featureId,
              type: 'complete',
              message: event.passes
                ? 'Feature completed successfully'
                : 'Feature completed with failures',
              passes: event.passes,
            });
          }
          break;

        case 'auto_mode_paused_failures':
          // Auto mode has been paused due to consecutive failures (likely usage limits)
          console.log('[AutoMode] Paused due to failures:', event.message);

          // Set auto mode to OFF for this project
          if (eventProjectId) {
            setAutoModeRunning(eventProjectId, false);

            // Set the paused state for visibility
            setAutoModePaused(eventProjectId, {
              pausedAt: new Date().toISOString(),
              reason: 'usage_limit',
              suggestedResumeAt: event.suggestedResumeAt,
              lastKnownUsage: event.lastKnownUsage,
            });
          }

          // Open the pause dialog to show user-friendly message and allow scheduling resume
          openAutoModePauseDialog({
            message: event.message || 'Auto Mode paused due to usage limits.',
            errorType: event.errorType || 'quota_exhausted',
            originalError: event.originalError,
            failureCount: event.failureCount,
            projectPath: event.projectPath,
            suggestedResumeAt: event.suggestedResumeAt,
          });
          break;

        case 'auto_mode_error':
          if (event.featureId && event.error) {
            // Check if this is a user-initiated cancellation or abort (not a real error)
            if (event.errorType === 'cancellation' || event.errorType === 'abort') {
              // User cancelled/aborted the feature - just log as info, not an error
              console.log('[AutoMode] Feature cancelled/aborted:', event.error);
              // Remove from running tasks
              if (eventProjectId) {
                removeRunningTask(eventProjectId, event.featureId);
              }
              break;
            }

            // Check if this is a quota/rate limit error - defer to pause dialog instead of toast spam
            if (event.errorType === 'rate_limit' || event.errorType === 'quota_exhausted') {
              console.log('[AutoMode] Quota/rate limit error, deferring to pause dialog');
              // Remove from running tasks
              if (eventProjectId) {
                removeRunningTask(eventProjectId, event.featureId);
              }
              break;
            }

            // Real error - log and show to user
            console.error('[AutoMode Error]', event.error);

            // Check for authentication errors and provide a more helpful message
            const isAuthError =
              event.errorType === 'authentication' ||
              event.error.includes('Authentication failed') ||
              event.error.includes('Invalid API key');

            const errorMessage = isAuthError
              ? `Authentication failed: Please check your API key in Settings or run 'claude login' in terminal to re-authenticate.`
              : event.error;

            addAutoModeActivity({
              featureId: event.featureId,
              type: 'error',
              message: errorMessage,
              errorType: isAuthError ? 'authentication' : 'execution',
            });

            // Remove the task from running since it failed
            if (eventProjectId) {
              removeRunningTask(eventProjectId, event.featureId);
            }
          }
          break;

        case 'auto_mode_progress':
          // Log progress updates (throttle to avoid spam)
          if (event.featureId && event.content && event.content.length > 10) {
            addAutoModeActivity({
              featureId: event.featureId,
              type: 'progress',
              message: event.content.substring(0, 200), // Limit message length
            });
          }
          break;

        case 'auto_mode_tool':
          // Log tool usage
          if (event.featureId && event.tool) {
            addAutoModeActivity({
              featureId: event.featureId,
              type: 'tool',
              message: `Using tool: ${event.tool}`,
              tool: event.tool,
            });
          }
          break;

        case 'auto_mode_phase':
          // Log phase transitions (Planning, Action, Verification)
          if (event.featureId && event.phase && event.message) {
            console.log(`[AutoMode] Phase: ${event.phase} for ${event.featureId}`);
            addAutoModeActivity({
              featureId: event.featureId,
              type: event.phase,
              message: event.message,
              phase: event.phase,
            });
          }
          break;

        case 'plan_approval_required':
          // Plan requires user approval before proceeding
          if (isPlanApprovalEvent(event)) {
            console.log(`[AutoMode] Plan approval required for ${event.featureId}`);
            setPendingPlanApproval({
              featureId: event.featureId,
              projectPath: event.projectPath || currentProject?.path || '',
              planContent: event.planContent,
              planningMode: event.planningMode,
            });
          }
          break;

        case 'planning_started':
          // Log when planning phase begins
          if (event.featureId && event.mode && event.message) {
            console.log(`[AutoMode] Planning started (${event.mode}) for ${event.featureId}`);
            addAutoModeActivity({
              featureId: event.featureId,
              type: 'planning',
              message: event.message,
              phase: 'planning',
            });
          }
          break;

        case 'plan_approved':
          // Log when plan is approved by user
          if (event.featureId) {
            console.log(`[AutoMode] Plan approved for ${event.featureId}`);
            addAutoModeActivity({
              featureId: event.featureId,
              type: 'action',
              message: event.hasEdits
                ? 'Plan approved with edits, starting implementation...'
                : 'Plan approved, starting implementation...',
              phase: 'action',
            });
          }
          break;

        case 'plan_auto_approved':
          // Log when plan is auto-approved (requirePlanApproval=false)
          if (event.featureId) {
            console.log(`[AutoMode] Plan auto-approved for ${event.featureId}`);
            addAutoModeActivity({
              featureId: event.featureId,
              type: 'action',
              message: 'Plan auto-approved, starting implementation...',
              phase: 'action',
            });
          }
          break;

        case 'plan_revision_requested':
          // Log when user requests plan revision with feedback
          if (event.featureId) {
            const revisionEvent = event as Extract<
              AutoModeEvent,
              { type: 'plan_revision_requested' }
            >;
            console.log(
              `[AutoMode] Plan revision requested for ${event.featureId} (v${revisionEvent.planVersion})`
            );
            addAutoModeActivity({
              featureId: event.featureId,
              type: 'planning',
              message: `Revising plan based on feedback (v${revisionEvent.planVersion})...`,
              phase: 'planning',
            });
          }
          break;

        case 'auto_mode_task_started':
          // Task started - show which task is being worked on
          if (event.featureId && 'taskId' in event && 'taskDescription' in event) {
            const taskEvent = event as Extract<AutoModeEvent, { type: 'auto_mode_task_started' }>;
            console.log(
              `[AutoMode] Task ${taskEvent.taskId} started for ${event.featureId}: ${taskEvent.taskDescription}`
            );
            addAutoModeActivity({
              featureId: event.featureId,
              type: 'progress',
              message: `▶ Starting ${taskEvent.taskId}: ${taskEvent.taskDescription}`,
            });
          }
          break;

        case 'auto_mode_task_complete':
          // Task completed - show progress
          if (event.featureId && 'taskId' in event) {
            const taskEvent = event as Extract<AutoModeEvent, { type: 'auto_mode_task_complete' }>;
            console.log(
              `[AutoMode] Task ${taskEvent.taskId} completed for ${event.featureId} (${taskEvent.tasksCompleted}/${taskEvent.tasksTotal})`
            );
            addAutoModeActivity({
              featureId: event.featureId,
              type: 'progress',
              message: `✓ ${taskEvent.taskId} done (${taskEvent.tasksCompleted}/${taskEvent.tasksTotal})`,
            });
          }
          break;

        case 'auto_mode_phase_complete':
          // Phase completed (for full mode with phased tasks)
          if (event.featureId && 'phaseNumber' in event) {
            const phaseEvent = event as Extract<
              AutoModeEvent,
              { type: 'auto_mode_phase_complete' }
            >;
            console.log(
              `[AutoMode] Phase ${phaseEvent.phaseNumber} completed for ${event.featureId}`
            );
            addAutoModeActivity({
              featureId: event.featureId,
              type: 'action',
              message: `Phase ${phaseEvent.phaseNumber} completed`,
              phase: 'action',
            });
          }
          break;
      }
    });

    return unsubscribe;
  }, [
    projectId,
    addRunningTask,
    removeRunningTask,
    addAutoModeActivity,
    getProjectIdFromPath,
    setPendingPlanApproval,
    currentProject?.path,
  ]);

  // Start auto mode - UI only, feature pickup is handled in board-view.tsx
  const start = useCallback(() => {
    if (!currentProject) {
      console.error('No project selected');
      return;
    }

    setAutoModeRunning(currentProject.id, true);
    console.log(`[AutoMode] Started with maxConcurrency: ${maxConcurrency}`);
  }, [currentProject, setAutoModeRunning, maxConcurrency]);

  // Stop auto mode - UI only, running tasks continue until natural completion
  const stop = useCallback(() => {
    if (!currentProject) {
      console.error('No project selected');
      return;
    }

    setAutoModeRunning(currentProject.id, false);
    // NOTE: We intentionally do NOT clear running tasks here.
    // Stopping auto mode only turns off the toggle to prevent new features
    // from being picked up. Running tasks will complete naturally and be
    // removed via the auto_mode_feature_complete event.
    console.log('[AutoMode] Stopped - running tasks will continue');
  }, [currentProject, setAutoModeRunning]);

  // Stop a specific feature
  const stopFeature = useCallback(
    async (featureId: string) => {
      if (!currentProject) {
        console.error('No project selected');
        return;
      }

      try {
        const api = getElectronAPI();
        if (!api?.autoMode?.stopFeature) {
          throw new Error('Stop feature API not available');
        }

        const result = await api.autoMode.stopFeature(featureId);

        if (result.success) {
          removeRunningTask(currentProject.id, featureId);
          console.log('[AutoMode] Feature stopped successfully:', featureId);
          addAutoModeActivity({
            featureId,
            type: 'complete',
            message: 'Feature stopped by user',
            passes: false,
          });
        } else {
          console.error('[AutoMode] Failed to stop feature:', result.error);
          throw new Error(result.error || 'Failed to stop feature');
        }
      } catch (error) {
        console.error('[AutoMode] Error stopping feature:', error);
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
