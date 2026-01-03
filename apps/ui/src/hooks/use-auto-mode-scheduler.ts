import { useEffect, useRef, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { toast } from 'sonner';

/**
 * Hook that manages scheduled auto mode resumes.
 *
 * This hook:
 * 1. Checks for pending scheduled resumes on app load
 * 2. Sets timeouts to automatically resume auto mode at the scheduled time
 * 3. Handles project changes and clears outdated schedules
 * 4. Provides a way to cancel scheduled resumes
 */
export function useAutoModeScheduler() {
  const {
    autoModeResumeByProject,
    setAutoModeRunning,
    clearAutoModeResumeSchedule,
    clearAutoModePaused,
    setAutoModePaused,
    openAutoModePauseDialog,
    currentProject,
    projects,
  } = useAppStore(
    useShallow((state) => ({
      autoModeResumeByProject: state.autoModeResumeByProject,
      setAutoModeRunning: state.setAutoModeRunning,
      clearAutoModeResumeSchedule: state.clearAutoModeResumeSchedule,
      clearAutoModePaused: state.clearAutoModePaused,
      setAutoModePaused: state.setAutoModePaused,
      openAutoModePauseDialog: state.openAutoModePauseDialog,
      currentProject: state.currentProject,
      projects: state.projects,
    }))
  );

  // Track active timeouts per project
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Resume auto mode for a specific project (after checking usage limits)
  const resumeAutoMode = useCallback(
    async (projectId: string, projectPath?: string, projectName?: string) => {
      console.log(`[AutoModeScheduler] Attempting to resume auto mode for project: ${projectId}`);

      // Clear the schedule first
      clearAutoModeResumeSchedule(projectId);

      // Check usage limits before actually starting
      try {
        const api = getElectronAPI();
        if (api?.claude?.getUsage) {
          const usage = await api.claude.getUsage();
          if (!('error' in usage)) {
            const isAtLimit = usage.sessionPercentage >= 100 || usage.weeklyPercentage >= 100;
            if (isAtLimit) {
              console.log(`[AutoModeScheduler] Still at usage limit, re-pausing`);

              // Determine suggested resume time
              let suggestedResumeAt: string | undefined;
              if (usage.sessionPercentage >= 100 && usage.sessionResetTime) {
                suggestedResumeAt = usage.sessionResetTime;
              } else if (usage.weeklyPercentage >= 100 && usage.weeklyResetTime) {
                suggestedResumeAt = usage.weeklyResetTime;
              }

              // Keep paused state with updated times
              if (projectPath) {
                setAutoModePaused(projectPath, {
                  pausedAt: new Date().toISOString(),
                  reason: 'usage_limit',
                  suggestedResumeAt,
                  lastKnownUsage: usage,
                });
              }

              // Show dialog with updated info
              openAutoModePauseDialog({
                message:
                  'Usage limit is still reached. Please wait longer for your quota to reset.',
                errorType: 'quota_exhausted',
                projectPath,
                suggestedResumeAt,
              });

              toast.warning('Auto Mode Still Paused', {
                description: 'Usage limit is still reached. Please reschedule.',
                duration: 5000,
              });

              return;
            }
          }
        }
      } catch (error) {
        console.warn('[AutoModeScheduler] Failed to check usage limits:', error);
        // Continue with resume anyway
      }

      // Clear paused state since we're resuming
      if (projectPath) {
        clearAutoModePaused(projectPath);
      }

      // Enable auto mode
      setAutoModeRunning(projectId, true);

      // Show a toast notification
      toast.success('Auto Mode Resumed', {
        description: projectName
          ? `Auto Mode has been automatically resumed for "${projectName}".`
          : 'Auto Mode has been automatically resumed as scheduled.',
        duration: 5000,
      });
    },
    [
      setAutoModeRunning,
      clearAutoModeResumeSchedule,
      clearAutoModePaused,
      setAutoModePaused,
      openAutoModePauseDialog,
    ]
  );

  // Schedule a resume for a project
  const scheduleResume = useCallback(
    (projectId: string, resumeAt: Date, projectPath?: string, projectName?: string) => {
      const now = Date.now();
      const delay = resumeAt.getTime() - now;

      // Clear any existing timeout for this project
      const existingTimeout = timeoutsRef.current.get(projectId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        timeoutsRef.current.delete(projectId);
      }

      if (delay <= 0) {
        // Resume immediately if the time has already passed
        console.log(
          `[AutoModeScheduler] Scheduled time already passed, resuming now for: ${projectId}`
        );
        resumeAutoMode(projectId, projectPath, projectName);
        return;
      }

      // Schedule the resume
      console.log(
        `[AutoModeScheduler] Scheduling resume in ${Math.round(delay / 1000 / 60)} minutes for: ${projectId}`
      );

      const timeout = setTimeout(() => {
        timeoutsRef.current.delete(projectId);
        resumeAutoMode(projectId, projectPath, projectName);
      }, delay);

      timeoutsRef.current.set(projectId, timeout);
    },
    [resumeAutoMode]
  );

  // Cancel a scheduled resume for a project
  const cancelScheduledResume = useCallback(
    (projectId: string) => {
      const timeout = timeoutsRef.current.get(projectId);
      if (timeout) {
        clearTimeout(timeout);
        timeoutsRef.current.delete(projectId);
      }
      clearAutoModeResumeSchedule(projectId);
      console.log(`[AutoModeScheduler] Cancelled scheduled resume for: ${projectId}`);
    },
    [clearAutoModeResumeSchedule]
  );

  // On mount and when schedules change, set up timeouts
  useEffect(() => {
    // Process all scheduled resumes
    Object.entries(autoModeResumeByProject).forEach(([projectId, schedule]) => {
      if (!schedule?.resumeAt) return;

      const resumeTime = new Date(schedule.resumeAt);
      if (isNaN(resumeTime.getTime())) {
        console.warn(
          `[AutoModeScheduler] Invalid resumeAt for project ${projectId}:`,
          schedule.resumeAt
        );
        clearAutoModeResumeSchedule(projectId);
        return;
      }

      // Find project for the toast and path
      const project = projects.find((p) => p.id === projectId);
      const projectName = project?.name;
      const projectPath = project?.path;

      // Schedule or immediately resume
      scheduleResume(projectId, resumeTime, projectPath, projectName);
    });

    // Cleanup function to clear all timeouts
    return () => {
      timeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
      timeoutsRef.current.clear();
    };
  }, [autoModeResumeByProject, projects, scheduleResume, clearAutoModeResumeSchedule]);

  // Get schedule for current project
  const currentProjectSchedule = currentProject?.id
    ? autoModeResumeByProject[currentProject.id]
    : null;

  // Check if current project has a pending scheduled resume
  const hasScheduledResume = !!currentProjectSchedule?.resumeAt;

  // Get the scheduled resume time for current project
  const scheduledResumeAt = currentProjectSchedule?.resumeAt
    ? new Date(currentProjectSchedule.resumeAt)
    : null;

  return {
    hasScheduledResume,
    scheduledResumeAt,
    cancelScheduledResume: currentProject?.id
      ? () => cancelScheduledResume(currentProject.id)
      : undefined,
  };
}
