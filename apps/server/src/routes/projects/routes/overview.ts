/**
 * GET /overview endpoint - Get aggregate status for all projects
 *
 * Returns a complete overview of all projects including:
 * - Individual project status (features, auto-mode state)
 * - Aggregate metrics across all projects
 * - Recent activity feed (placeholder for future implementation)
 */

import type { Request, Response } from 'express';
import type { FeatureLoader } from '../../../services/feature-loader.js';
import type {
  AutoModeServiceCompat,
  RunningAgentInfo,
  ProjectAutoModeStatus,
} from '../../../services/auto-mode/index.js';
import type { SettingsService } from '../../../services/settings-service.js';
import type { NotificationService } from '../../../services/notification-service.js';
import type {
  ProjectStatus,
  AggregateStatus,
  MultiProjectOverview,
  FeatureStatusCounts,
  AggregateFeatureCounts,
  AggregateProjectCounts,
  ProjectHealthStatus,
  Feature,
  ProjectRef,
} from '@automaker/types';
import { getErrorMessage, logError } from '../common.js';

/**
 * Compute feature status counts from a list of features
 */
function computeFeatureCounts(features: Feature[]): FeatureStatusCounts {
  const counts: FeatureStatusCounts = {
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    verified: 0,
  };

  for (const feature of features) {
    switch (feature.status) {
      case 'pending':
      case 'ready':
        counts.pending++;
        break;
      case 'running':
      case 'generating_spec':
      case 'in_progress':
        counts.running++;
        break;
      case 'waiting_approval':
        // waiting_approval means agent finished, needs human review - count as pending
        counts.pending++;
        break;
      case 'completed':
        counts.completed++;
        break;
      case 'failed':
        counts.failed++;
        break;
      case 'verified':
        counts.verified++;
        break;
      default:
        // Unknown status, treat as pending
        counts.pending++;
    }
  }

  return counts;
}

/**
 * Determine the overall health status of a project based on its feature statuses
 */
function computeHealthStatus(
  featureCounts: FeatureStatusCounts,
  isAutoModeRunning: boolean
): ProjectHealthStatus {
  const totalFeatures =
    featureCounts.pending +
    featureCounts.running +
    featureCounts.completed +
    featureCounts.failed +
    featureCounts.verified;

  // If there are failed features, the project has errors
  if (featureCounts.failed > 0) {
    return 'error';
  }

  // If there are running features or auto mode is running with pending work
  if (featureCounts.running > 0 || (isAutoModeRunning && featureCounts.pending > 0)) {
    return 'active';
  }

  // Pending work but no active execution
  if (featureCounts.pending > 0) {
    return 'waiting';
  }

  // If all features are completed or verified
  if (totalFeatures > 0 && featureCounts.pending === 0 && featureCounts.running === 0) {
    return 'completed';
  }

  // Default to idle
  return 'idle';
}

/**
 * Get the most recent activity timestamp from features
 */
function getLastActivityAt(features: Feature[]): string | undefined {
  if (features.length === 0) {
    return undefined;
  }

  let latestTimestamp: number = 0;

  for (const feature of features) {
    // Check startedAt timestamp (the main timestamp available on Feature)
    if (feature.startedAt) {
      const timestamp = new Date(feature.startedAt).getTime();
      if (!isNaN(timestamp) && timestamp > latestTimestamp) {
        latestTimestamp = timestamp;
      }
    }

    // Also check planSpec timestamps if available
    if (feature.planSpec?.generatedAt) {
      const timestamp = new Date(feature.planSpec.generatedAt).getTime();
      if (!isNaN(timestamp) && timestamp > latestTimestamp) {
        latestTimestamp = timestamp;
      }
    }
    if (feature.planSpec?.approvedAt) {
      const timestamp = new Date(feature.planSpec.approvedAt).getTime();
      if (!isNaN(timestamp) && timestamp > latestTimestamp) {
        latestTimestamp = timestamp;
      }
    }
  }

  return latestTimestamp > 0 ? new Date(latestTimestamp).toISOString() : undefined;
}

export function createOverviewHandler(
  featureLoader: FeatureLoader,
  autoModeService: AutoModeServiceCompat,
  settingsService: SettingsService,
  notificationService: NotificationService
) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      // Get all projects from settings
      const settings = await settingsService.getGlobalSettings();
      const projectRefs: ProjectRef[] = settings.projects || [];

      // Get all running agents once to count live running features per project
      const allRunningAgents: RunningAgentInfo[] = await autoModeService.getRunningAgents();

      // Collect project statuses in parallel
      const projectStatusPromises = projectRefs.map(async (projectRef): Promise<ProjectStatus> => {
        try {
          // Load features for this project
          const features = await featureLoader.getAll(projectRef.path);
          const featureCounts = computeFeatureCounts(features);
          const totalFeatures = features.length;

          // Get auto-mode status for this project (main worktree, branchName = null)
          const autoModeStatus: ProjectAutoModeStatus = await autoModeService.getStatusForProject(
            projectRef.path,
            null
          );
          const isAutoModeRunning = autoModeStatus.isAutoLoopRunning;

          // Count live running features for this project (across all branches)
          // This ensures we only count features that are actually running in memory
          const liveRunningCount = allRunningAgents.filter(
            (agent) => agent.projectPath === projectRef.path
          ).length;
          featureCounts.running = liveRunningCount;

          // Get notification count for this project
          let unreadNotificationCount = 0;
          try {
            const notifications = await notificationService.getNotifications(projectRef.path);
            unreadNotificationCount = notifications.filter((n) => !n.read).length;
          } catch {
            // Ignore notification errors - project may not have any notifications yet
          }

          // Compute health status
          const healthStatus = computeHealthStatus(featureCounts, isAutoModeRunning);

          // Get last activity timestamp
          const lastActivityAt = getLastActivityAt(features);

          return {
            projectId: projectRef.id,
            projectName: projectRef.name,
            projectPath: projectRef.path,
            healthStatus,
            featureCounts,
            totalFeatures,
            lastActivityAt,
            isAutoModeRunning,
            activeBranch: autoModeStatus.branchName ?? undefined,
            unreadNotificationCount,
          };
        } catch (error) {
          logError(error, `Failed to load project status: ${projectRef.name}`);
          // Return a minimal status for projects that fail to load
          return {
            projectId: projectRef.id,
            projectName: projectRef.name,
            projectPath: projectRef.path,
            healthStatus: 'error' as ProjectHealthStatus,
            featureCounts: {
              pending: 0,
              running: 0,
              completed: 0,
              failed: 0,
              verified: 0,
            },
            totalFeatures: 0,
            isAutoModeRunning: false,
            unreadNotificationCount: 0,
          };
        }
      });

      const projectStatuses = await Promise.all(projectStatusPromises);

      // Compute aggregate metrics
      const aggregateFeatureCounts: AggregateFeatureCounts = {
        total: 0,
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
        verified: 0,
      };

      const aggregateProjectCounts: AggregateProjectCounts = {
        total: projectStatuses.length,
        active: 0,
        idle: 0,
        waiting: 0,
        withErrors: 0,
        allCompleted: 0,
      };

      let totalUnreadNotifications = 0;
      let projectsWithAutoModeRunning = 0;

      for (const status of projectStatuses) {
        // Aggregate feature counts
        aggregateFeatureCounts.total += status.totalFeatures;
        aggregateFeatureCounts.pending += status.featureCounts.pending;
        aggregateFeatureCounts.running += status.featureCounts.running;
        aggregateFeatureCounts.completed += status.featureCounts.completed;
        aggregateFeatureCounts.failed += status.featureCounts.failed;
        aggregateFeatureCounts.verified += status.featureCounts.verified;

        // Aggregate project counts by health status
        switch (status.healthStatus) {
          case 'active':
            aggregateProjectCounts.active++;
            break;
          case 'idle':
            aggregateProjectCounts.idle++;
            break;
          case 'waiting':
            aggregateProjectCounts.waiting++;
            break;
          case 'error':
            aggregateProjectCounts.withErrors++;
            break;
          case 'completed':
            aggregateProjectCounts.allCompleted++;
            break;
        }

        // Aggregate notifications
        totalUnreadNotifications += status.unreadNotificationCount;

        // Count projects with auto-mode running
        if (status.isAutoModeRunning) {
          projectsWithAutoModeRunning++;
        }
      }

      const aggregateStatus: AggregateStatus = {
        projectCounts: aggregateProjectCounts,
        featureCounts: aggregateFeatureCounts,
        totalUnreadNotifications,
        projectsWithAutoModeRunning,
        computedAt: new Date().toISOString(),
      };

      // Build the response (recentActivity is empty for now - can be populated later)
      const overview: MultiProjectOverview = {
        projects: projectStatuses,
        aggregate: aggregateStatus,
        recentActivity: [], // Placeholder for future activity feed implementation
        generatedAt: new Date().toISOString(),
      };

      res.json({
        success: true,
        ...overview,
      });
    } catch (error) {
      logError(error, 'Get project overview failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
