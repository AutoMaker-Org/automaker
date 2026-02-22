import { useEffect, useCallback, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { createLogger } from '@automaker/utils/logger';
import { DEFAULT_MAX_CONCURRENCY } from '@automaker/types';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import type { AutoModeEvent } from '@/types/electron';
import type { WorktreeInfo } from '@/components/views/board-view/worktree-panel/types';
import { getGlobalEventsRecent } from '@/hooks/use-event-recency';

const logger = createLogger('AutoMode');

const AUTO_MODE_SESSION_KEY = 'automaker:autoModeRunningByWorktreeKey';

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((id) => set.has(id));
}
const AUTO_MODE_POLLING_INTERVAL = 30000;

/**
 * Generate a worktree key for session storage
 * @param projectPath - The project path
 * @param branchName - The branch name, or null for main worktree
 */
function getWorktreeSessionKey(projectPath: string, branchName: string | null): string {
  return `${projectPath}::${branchName ?? '__main__'}`;
}

function readAutoModeSession(): Record<string, boolean> {
  try {
    if (typeof window === 'undefined') return {};
    const raw = window.sessionStorage?.getItem(AUTO_MODE_SESSION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, boolean>;
  } catch {
    return {};
  }
}

function writeAutoModeSession(next: Record<string, boolean>): void {
  try {
    if (typeof window === 'undefined') return;
    window.sessionStorage?.setItem(AUTO_MODE_SESSION_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors (private mode, disabled storage, etc.)
  }
}

function setAutoModeSessionForWorktree(
  projectPath: string,
  branchName: string | null,
  running: boolean
): void {
  const worktreeKey = getWorktreeSessionKey(projectPath, branchName);
  const current = readAutoModeSession();
  const next = { ...current, [worktreeKey]: running };
  writeAutoModeSession(next);
}

// Type guard for plan_approval_required event
function isPlanApprovalEvent(
  event: AutoModeEvent
): event is Extract<AutoModeEvent, { type: 'plan_approval_required' }> {
  return event.type === 'plan_approval_required';
}

/**
 * Hook for managing auto mode (scoped per worktree)
 * @param worktree - Optional worktree info. If not provided, uses main worktree (branchName = null)
 */
export function useAutoMode(worktree?: WorktreeInfo) {
  const {
    autoModeByWorktree,
    setAutoModeRunning,
    addRunningTask,
    removeRunningTask,
    currentProject,
    addAutoModeActivity,
    projects,
    setPendingPlanApproval,
    getWorktreeKey,
    getMaxConcurrencyForWorktree,
    setMaxConcurrencyForWorktree,
    isPrimaryWorktreeBranch,
    globalMaxConcurrency,
  } = useAppStore(
    useShallow((state) => ({
      autoModeByWorktree: state.autoModeByWorktree,
      setAutoModeRunning: state.setAutoModeRunning,
      addRunningTask: state.addRunningTask,
      removeRunningTask: state.removeRunningTask,
      currentProject: state.currentProject,
      addAutoModeActivity: state.addAutoModeActivity,
      projects: state.projects,
      setPendingPlanApproval: state.setPendingPlanApproval,
      getWorktreeKey: state.getWorktreeKey,
      getMaxConcurrencyForWorktree: state.getMaxConcurrencyForWorktree,
      setMaxConcurrencyForWorktree: state.setMaxConcurrencyForWorktree,
      isPrimaryWorktreeBranch: state.isPrimaryWorktreeBranch,
      globalMaxConcurrency: state.maxConcurrency,
    }))
  );

  // Derive branchName from worktree:
  // If worktree is provided, use its branch name (even for main worktree, as it might be on a feature branch)
  // If not provided, default to null (main worktree default)
  // IMPORTANT: Depend on primitive values (isMain, branch) instead of the worktree object
  // reference to avoid re-computing when the parent passes a new object with the same values.
  // This prevents a cascading re-render loop: new worktree ref → new branchName useMemo →
  // new refreshStatus callback → effect re-fires → store update → re-render → React error #185.
  const worktreeIsMain = worktree?.isMain;
  const worktreeBranch = worktree?.branch;
  const hasWorktree = worktree !== undefined;
  const branchName = useMemo(() => {
    if (!hasWorktree) return null;
    return worktreeIsMain ? null : worktreeBranch || null;
  }, [hasWorktree, worktreeIsMain, worktreeBranch]);

  // Helper to look up project ID from path
  const getProjectIdFromPath = useCallback(
    (path: string): string | undefined => {
      const project = projects.find((p) => p.path === path);
      return project?.id;
    },
    [projects]
  );

  // Get worktree-specific auto mode state
  const projectId = currentProject?.id;
  const worktreeAutoModeState = useMemo(() => {
    if (!projectId)
      return {
        isRunning: false,
        runningTasks: [],
        branchName: null,
        maxConcurrency: DEFAULT_MAX_CONCURRENCY,
      };
    const key = getWorktreeKey(projectId, branchName);
    return (
      autoModeByWorktree[key] || {
        isRunning: false,
        runningTasks: [],
        branchName,
        maxConcurrency: DEFAULT_MAX_CONCURRENCY,
      }
    );
  }, [autoModeByWorktree, projectId, branchName, getWorktreeKey]);

  const isAutoModeRunning = worktreeAutoModeState.isRunning;
  const runningAutoTasks = worktreeAutoModeState.runningTasks;
  // Use the subscribed worktreeAutoModeState.maxConcurrency (from the reactive
  // autoModeByWorktree store slice) so canStartNewTask stays reactive when
  // refreshStatus updates worktree state or when the global setting changes.
  // Falls back to the subscribed globalMaxConcurrency (also reactive) when no
  // per-worktree value is set, and to DEFAULT_MAX_CONCURRENCY when no project.
  const maxConcurrency = projectId
    ? (worktreeAutoModeState.maxConcurrency ?? globalMaxConcurrency)
    : DEFAULT_MAX_CONCURRENCY;

  // Check if we can start a new task based on concurrency limit
  const canStartNewTask = runningAutoTasks.length < maxConcurrency;

  // Ref to prevent refreshStatus and WebSocket handlers from overwriting optimistic state
  // during start/stop transitions.
  const isTransitioningRef = useRef(false);
  // Tracks specifically a restart-for-concurrency transition. When true, the
  // auto_mode_started WebSocket handler will clear isTransitioningRef, ensuring
  // delayed auto_mode_stopped events that arrive after the HTTP calls complete
  // (but before the WebSocket events) are still suppressed.
  const isRestartTransitionRef = useRef(false);
  // Safety timeout ID to clear the transition flag if the auto_mode_started event never arrives
  const restartSafetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use refs for mutable state in refreshStatus to avoid unstable callback identity.
  // This prevents the useEffect that calls refreshStatus on mount from re-firing
  // every time isAutoModeRunning or runningAutoTasks changes, which was a source of
  // flickering as refreshStatus would race with WebSocket events and optimistic updates.
  const isAutoModeRunningRef = useRef(isAutoModeRunning);
  const runningAutoTasksRef = useRef(runningAutoTasks);
  useEffect(() => {
    isAutoModeRunningRef.current = isAutoModeRunning;
  }, [isAutoModeRunning]);
  useEffect(() => {
    runningAutoTasksRef.current = runningAutoTasks;
  }, [runningAutoTasks]);

  // Clean up safety timeout on unmount to prevent timer leaks and misleading log warnings
  useEffect(() => {
    return () => {
      if (restartSafetyTimeoutRef.current) {
        clearTimeout(restartSafetyTimeoutRef.current);
        restartSafetyTimeoutRef.current = null;
      }
      isRestartTransitionRef.current = false;
    };
  }, []);

  const refreshStatus = useCallback(async () => {
    if (!currentProject) return;

    // Skip sync when user is in the middle of start/stop - avoids race where
    // refreshStatus runs before the API call completes and overwrites optimistic state
    if (isTransitioningRef.current) return;

    try {
      const api = getElectronAPI();
      if (!api?.autoMode?.status) return;

      const result = await api.autoMode.status(currentProject.path, branchName);
      if (result.success && result.isAutoLoopRunning !== undefined) {
        const backendIsRunning = result.isAutoLoopRunning;
        const backendRunningFeatures = result.runningFeatures ?? [];
        // Read latest state from refs to avoid stale closure values
        const currentIsRunning = isAutoModeRunningRef.current;
        const currentRunningTasks = runningAutoTasksRef.current;
        const needsSync =
          backendIsRunning !== currentIsRunning ||
          // Also sync when backend has runningFeatures we're missing (handles missed WebSocket events)
          (backendIsRunning &&
            Array.isArray(backendRunningFeatures) &&
            backendRunningFeatures.length > 0 &&
            !arraysEqual(backendRunningFeatures, currentRunningTasks)) ||
          // Also sync when UI has stale running tasks but backend has none
          // (handles server restart where features were reconciled to backlog/ready)
          (!backendIsRunning &&
            currentRunningTasks.length > 0 &&
            backendRunningFeatures.length === 0);

        if (needsSync) {
          const worktreeDesc = branchName ? `worktree ${branchName}` : 'main worktree';
          if (backendIsRunning !== currentIsRunning) {
            logger.info(
              `[AutoMode] Syncing UI state with backend for ${worktreeDesc} in ${currentProject.path}: ${backendIsRunning ? 'ON' : 'OFF'}`
            );
          }
          setAutoModeRunning(
            currentProject.id,
            branchName,
            backendIsRunning,
            result.maxConcurrency,
            backendRunningFeatures
          );
          setAutoModeSessionForWorktree(currentProject.path, branchName, backendIsRunning);
        }
      }
    } catch (error) {
      logger.error('Error syncing auto mode state with backend:', error);
    }
  }, [branchName, currentProject, setAutoModeRunning]);

  // On mount (and when refreshStatus identity changes, e.g. project switch),
  // query backend for current auto loop status and sync UI state.
  // This handles cases where the backend is still running after a page refresh.
  //
  // IMPORTANT: Debounce with a short delay to prevent a synchronous cascade
  // during project switches. Without this, the sequence is:
  //   refreshStatus() → setAutoModeRunning() → store update → re-render →
  //   other effects fire → more store updates → React error #185.
  // The 150ms delay lets React settle the initial mount renders before we
  // trigger additional store mutations from the API response.
  useEffect(() => {
    const timer = setTimeout(() => void refreshStatus(), 150);
    return () => clearTimeout(timer);
  }, [refreshStatus]);

  // Periodic polling fallback when WebSocket events are stale.
  useEffect(() => {
    if (!currentProject) return;

    const interval = setInterval(() => {
      if (getGlobalEventsRecent()) return;
      void refreshStatus();
    }, AUTO_MODE_POLLING_INTERVAL);

    return () => clearInterval(interval);
  }, [currentProject, refreshStatus]);

  // Handle auto mode events - listen globally for all projects/worktrees
  useEffect(() => {
    const api = getElectronAPI();
    if (!api?.autoMode) return;

    const unsubscribe = api.autoMode.onEvent((event: AutoModeEvent) => {
      logger.info('Event:', event);

      // Events include projectPath and branchName from backend
      // Use them to look up project ID and determine the worktree
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

      // Extract branchName from event, defaulting to null (main worktree)
      const rawEventBranchName: string | null =
        'branchName' in event && event.branchName !== undefined ? event.branchName : null;

      // Get projectPath for worktree lookup
      const eventProjectPath = 'projectPath' in event ? event.projectPath : currentProject?.path;

      // Normalize branchName: convert primary worktree branch to null for consistent key lookup
      // This handles cases where the main branch is named something other than 'main' (e.g., 'master', 'develop')
      const eventBranchName: string | null =
        eventProjectPath &&
        rawEventBranchName &&
        isPrimaryWorktreeBranch(eventProjectPath, rawEventBranchName)
          ? null
          : rawEventBranchName;

      // Skip event if we couldn't determine the project
      if (!eventProjectId) {
        logger.warn('Could not determine project for event:', event);
        return;
      }

      switch (event.type) {
        case 'auto_mode_started':
          // Backend started auto loop - update UI state
          {
            const worktreeDesc = eventBranchName ? `worktree ${eventBranchName}` : 'main worktree';
            logger.info(`[AutoMode] Backend started auto loop for ${worktreeDesc}`);
            if (eventProjectId) {
              // Extract maxConcurrency from event if available, otherwise use current or default
              const eventMaxConcurrency =
                'maxConcurrency' in event && typeof event.maxConcurrency === 'number'
                  ? event.maxConcurrency
                  : getMaxConcurrencyForWorktree(eventProjectId, eventBranchName);
              // Always apply start events even during transitions - this confirms the optimistic state
              setAutoModeRunning(eventProjectId, eventBranchName, true, eventMaxConcurrency);
            }
            // If we were in a restart transition (concurrency change), the arrival of
            // auto_mode_started confirms the restart is complete. Clear the transition
            // flags so future auto_mode_stopped events are processed normally.
            // Only clear transition refs when the event is for this hook's worktree,
            // to avoid events for worktree B incorrectly affecting worktree A's state.
            if (isRestartTransitionRef.current && eventBranchName === branchName) {
              logger.debug(`[AutoMode] Restart transition complete for ${worktreeDesc}`);
              isTransitioningRef.current = false;
              isRestartTransitionRef.current = false;
              if (restartSafetyTimeoutRef.current) {
                clearTimeout(restartSafetyTimeoutRef.current);
                restartSafetyTimeoutRef.current = null;
              }
            }
          }
          break;

        case 'auto_mode_resuming_features':
          // Backend is resuming features from saved state
          if (eventProjectId && 'features' in event && Array.isArray(event.features)) {
            logger.info(`[AutoMode] Resuming ${event.features.length} feature(s) from saved state`);
            // Use per-feature branchName if available, fallback to event-level branchName
            event.features.forEach((feature: { id: string; branchName?: string | null }) => {
              const featureBranchName = feature.branchName ?? eventBranchName;
              addRunningTask(eventProjectId, featureBranchName, feature.id);
            });
          } else if (eventProjectId && 'featureIds' in event && Array.isArray(event.featureIds)) {
            // Fallback for older event format without per-feature branchName
            logger.info(
              `[AutoMode] Resuming ${event.featureIds.length} feature(s) from saved state (legacy format)`
            );
            event.featureIds.forEach((featureId: string) => {
              addRunningTask(eventProjectId, eventBranchName, featureId);
            });
          }
          break;

        case 'auto_mode_stopped':
          // Backend stopped auto loop - update UI state.
          // Skip during transitions (e.g., restartWithConcurrency) to avoid flickering the toggle
          // off between stop and start. The transition handler will set the correct final state.
          // Only suppress (and only apply transition guard) when the event is for this hook's
          // worktree, to avoid worktree B's stop events being incorrectly suppressed by
          // worktree A's transition state.
          {
            const worktreeDesc = eventBranchName ? `worktree ${eventBranchName}` : 'main worktree';
            if (eventBranchName === branchName && isTransitioningRef.current) {
              logger.info(
                `[AutoMode] Backend stopped auto loop for ${worktreeDesc} (ignored during transition)`
              );
            } else {
              logger.info(`[AutoMode] Backend stopped auto loop for ${worktreeDesc}`);
              if (eventProjectId) {
                setAutoModeRunning(eventProjectId, eventBranchName, false);
              }
            }
          }
          break;

        case 'auto_mode_feature_start':
          if (event.featureId) {
            addRunningTask(eventProjectId, eventBranchName, event.featureId);
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
            logger.info('Feature completed:', event.featureId, 'passes:', event.passes);
            removeRunningTask(eventProjectId, eventBranchName, event.featureId);
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

        case 'auto_mode_error':
          if (event.featureId && event.error) {
            // Check if this is a user-initiated cancellation or abort (not a real error)
            if (event.errorType === 'cancellation' || event.errorType === 'abort') {
              // User cancelled/aborted the feature - just log as info, not an error
              logger.info('Feature cancelled/aborted:', event.error);
              // Remove from running tasks
              if (eventProjectId) {
                removeRunningTask(eventProjectId, eventBranchName, event.featureId);
              }
              break;
            }

            // Real error - log and show to user
            logger.error('Error:', event.error);

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
              removeRunningTask(eventProjectId, eventBranchName, event.featureId);
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
            logger.debug(`[AutoMode] Phase: ${event.phase} for ${event.featureId}`);
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
            logger.debug(`[AutoMode] Plan approval required for ${event.featureId}`);
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
            logger.debug(`[AutoMode] Planning started (${event.mode}) for ${event.featureId}`);
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
            logger.debug(`[AutoMode] Plan approved for ${event.featureId}`);
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
            logger.debug(`[AutoMode] Plan auto-approved for ${event.featureId}`);
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
            logger.debug(
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
            logger.debug(
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
            logger.debug(
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
            logger.debug(
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

        case 'auto_mode_task_status':
          // Task status updated - update planSpec.tasks in real-time
          if (event.featureId && 'taskId' in event && 'tasks' in event) {
            const statusEvent = event as Extract<AutoModeEvent, { type: 'auto_mode_task_status' }>;
            logger.debug(
              `[AutoMode] Task ${statusEvent.taskId} status updated to ${statusEvent.status} for ${event.featureId}`
            );
            // The planSpec.tasks array update is handled by query invalidation
            // which will refetch the feature data
          }
          break;

        case 'auto_mode_summary':
          // Summary extracted and saved
          if (event.featureId && 'summary' in event) {
            const summaryEvent = event as Extract<AutoModeEvent, { type: 'auto_mode_summary' }>;
            logger.debug(
              `[AutoMode] Summary saved for ${event.featureId}: ${summaryEvent.summary.substring(0, 100)}...`
            );
            addAutoModeActivity({
              featureId: event.featureId,
              type: 'progress',
              message: `Summary: ${summaryEvent.summary.substring(0, 100)}...`,
            });
          }
          break;
      }
    });

    return unsubscribe;
  }, [
    projectId,
    branchName,
    addRunningTask,
    removeRunningTask,
    addAutoModeActivity,
    getProjectIdFromPath,
    setPendingPlanApproval,
    setAutoModeRunning,
    currentProject?.path,
    getMaxConcurrencyForWorktree,
    isPrimaryWorktreeBranch,
  ]);

  // Start auto mode - calls backend to start the auto loop for this worktree
  const start = useCallback(async () => {
    if (!currentProject) {
      logger.error('No project selected');
      return;
    }

    isTransitioningRef.current = true;
    try {
      const api = getElectronAPI();
      if (!api?.autoMode?.start) {
        throw new Error('Start auto mode API not available');
      }

      const worktreeDesc = branchName ? `worktree ${branchName}` : 'main worktree';
      logger.info(`[AutoMode] Starting auto loop for ${worktreeDesc} in ${currentProject.path}`);

      // Optimistically update UI state (backend will confirm via event)
      const currentMaxConcurrency = getMaxConcurrencyForWorktree(currentProject.id, branchName);
      setAutoModeSessionForWorktree(currentProject.path, branchName, true);
      setAutoModeRunning(currentProject.id, branchName, true, currentMaxConcurrency);

      // Call backend to start the auto loop (pass current max concurrency)
      const result = await api.autoMode.start(
        currentProject.path,
        branchName,
        currentMaxConcurrency
      );

      if (!result.success) {
        // Revert UI state on failure
        setAutoModeSessionForWorktree(currentProject.path, branchName, false);
        setAutoModeRunning(currentProject.id, branchName, false);
        logger.error('Failed to start auto mode:', result.error);
        throw new Error(result.error || 'Failed to start auto mode');
      }

      logger.debug(`[AutoMode] Started successfully for ${worktreeDesc}`);
      // Sync with backend after a short delay to get runningFeatures if events were delayed.
      // The delay ensures the backend has fully processed the start before we poll status,
      // avoiding a race where status returns stale data and briefly flickers the toggle.
      setTimeout(() => void refreshStatus(), 500);
    } catch (error) {
      // Revert UI state on error
      setAutoModeSessionForWorktree(currentProject.path, branchName, false);
      setAutoModeRunning(currentProject.id, branchName, false);
      logger.error('Error starting auto mode:', error);
      throw error;
    } finally {
      isTransitioningRef.current = false;
    }
  }, [currentProject, branchName, setAutoModeRunning, getMaxConcurrencyForWorktree, refreshStatus]);

  // Stop auto mode - calls backend to stop the auto loop for this worktree
  const stop = useCallback(async () => {
    if (!currentProject) {
      logger.error('No project selected');
      return;
    }

    isTransitioningRef.current = true;
    try {
      const api = getElectronAPI();
      if (!api?.autoMode?.stop) {
        throw new Error('Stop auto mode API not available');
      }

      const worktreeDesc = branchName ? `worktree ${branchName}` : 'main worktree';
      logger.info(`[AutoMode] Stopping auto loop for ${worktreeDesc} in ${currentProject.path}`);

      // Optimistically update UI state (backend will confirm via event)
      setAutoModeSessionForWorktree(currentProject.path, branchName, false);
      setAutoModeRunning(currentProject.id, branchName, false);

      // Call backend to stop the auto loop
      const result = await api.autoMode.stop(currentProject.path, branchName);

      if (!result.success) {
        // Revert UI state on failure
        setAutoModeSessionForWorktree(currentProject.path, branchName, true);
        setAutoModeRunning(currentProject.id, branchName, true);
        logger.error('Failed to stop auto mode:', result.error);
        throw new Error(result.error || 'Failed to stop auto mode');
      }

      // NOTE: Running tasks will continue until natural completion.
      // The backend stops picking up new features but doesn't abort running ones.
      logger.info(`Stopped ${worktreeDesc} - running tasks will continue`);
      // Sync with backend after a short delay to confirm stopped state
      setTimeout(() => void refreshStatus(), 500);
    } catch (error) {
      // Revert UI state on error
      setAutoModeSessionForWorktree(currentProject.path, branchName, true);
      setAutoModeRunning(currentProject.id, branchName, true);
      logger.error('Error stopping auto mode:', error);
      throw error;
    } finally {
      isTransitioningRef.current = false;
    }
  }, [currentProject, branchName, setAutoModeRunning, refreshStatus]);

  // Restart auto mode with new concurrency without flickering the toggle.
  // Unlike stop() + start(), this keeps isRunning=true throughout the transition
  // so the toggle switch never visually turns off.
  //
  // IMPORTANT: isTransitioningRef is NOT cleared in the finally block here.
  // Instead, it stays true until the auto_mode_started WebSocket event arrives,
  // which confirms the backend restart is complete. This prevents a race condition
  // where a delayed auto_mode_stopped WebSocket event (sent by the backend during
  // stop()) arrives after the HTTP calls complete but before the WebSocket events,
  // which would briefly set isRunning=false and cause a visible toggle flicker.
  // A safety timeout ensures the flag is cleared even if the event never arrives.
  const restartWithConcurrency = useCallback(async () => {
    if (!currentProject) {
      logger.error('No project selected');
      return;
    }

    // Clear any previous safety timeout
    if (restartSafetyTimeoutRef.current) {
      clearTimeout(restartSafetyTimeoutRef.current);
      restartSafetyTimeoutRef.current = null;
    }

    isTransitioningRef.current = true;
    isRestartTransitionRef.current = true;
    try {
      const api = getElectronAPI();
      if (!api?.autoMode?.stop || !api?.autoMode?.start) {
        throw new Error('Auto mode API not available');
      }

      const worktreeDesc = branchName ? `worktree ${branchName}` : 'main worktree';
      logger.info(
        `[AutoMode] Restarting with new concurrency for ${worktreeDesc} in ${currentProject.path}`
      );

      // Stop backend without updating UI state (keep isRunning=true)
      const stopResult = await api.autoMode.stop(currentProject.path, branchName);

      if (!stopResult.success) {
        logger.error('Failed to stop auto mode during restart:', stopResult.error);
        // Don't throw - try to start anyway since the goal is to update concurrency
      }

      // Start backend with the new concurrency (UI state stays isRunning=true)
      const currentMaxConcurrency = getMaxConcurrencyForWorktree(currentProject.id, branchName);
      const startResult = await api.autoMode.start(
        currentProject.path,
        branchName,
        currentMaxConcurrency
      );

      if (!startResult.success) {
        // If start fails, we need to revert UI state since we're actually stopped now
        isTransitioningRef.current = false;
        isRestartTransitionRef.current = false;
        setAutoModeSessionForWorktree(currentProject.path, branchName, false);
        setAutoModeRunning(currentProject.id, branchName, false);
        logger.error('Failed to restart auto mode with new concurrency:', startResult.error);
        throw new Error(startResult.error || 'Failed to restart auto mode');
      }

      logger.debug(`[AutoMode] Restarted successfully for ${worktreeDesc}`);

      // Don't clear isTransitioningRef here - let the auto_mode_started WebSocket
      // event handler clear it. Set a safety timeout in case the event never arrives.
      restartSafetyTimeoutRef.current = setTimeout(() => {
        if (isRestartTransitionRef.current) {
          logger.warn('[AutoMode] Restart transition safety timeout - clearing transition flag');
          isTransitioningRef.current = false;
          isRestartTransitionRef.current = false;
          restartSafetyTimeoutRef.current = null;
        }
      }, 5000);
    } catch (error) {
      // On error, clear the transition flags immediately
      isTransitioningRef.current = false;
      isRestartTransitionRef.current = false;
      // Revert UI state since the backend may be stopped after a partial restart
      if (currentProject) {
        setAutoModeSessionForWorktree(currentProject.path, branchName, false);
        setAutoModeRunning(currentProject.id, branchName, false);
      }
      logger.error('Error restarting auto mode:', error);
      throw error;
    }
  }, [currentProject, branchName, setAutoModeRunning, getMaxConcurrencyForWorktree]);

  // Stop a specific feature
  const stopFeature = useCallback(
    async (featureId: string) => {
      if (!currentProject) {
        logger.error('No project selected');
        return;
      }

      try {
        const api = getElectronAPI();
        if (!api?.autoMode?.stopFeature) {
          throw new Error('Stop feature API not available');
        }

        const result = await api.autoMode.stopFeature(featureId);

        if (result.success) {
          removeRunningTask(currentProject.id, branchName, featureId);
          logger.info('Feature stopped successfully:', featureId);
          addAutoModeActivity({
            featureId,
            type: 'complete',
            message: 'Feature stopped by user',
            passes: false,
          });
        } else {
          logger.error('Failed to stop feature:', result.error);
          throw new Error(result.error || 'Failed to stop feature');
        }
      } catch (error) {
        logger.error('Error stopping feature:', error);
        throw error;
      }
    },
    [currentProject, branchName, removeRunningTask, addAutoModeActivity]
  );

  return {
    isRunning: isAutoModeRunning,
    runningTasks: runningAutoTasks,
    maxConcurrency,
    canStartNewTask,
    branchName,
    start,
    stop,
    stopFeature,
    restartWithConcurrency,
    refreshStatus,
  };
}
