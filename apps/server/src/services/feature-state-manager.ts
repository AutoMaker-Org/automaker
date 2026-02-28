/**
 * FeatureStateManager - Manages feature status updates with proper persistence
 *
 * Extracted from AutoModeService to provide a standalone service for:
 * - Updating feature status with proper disk persistence
 * - Handling corrupted JSON with backup recovery
 * - Emitting events AFTER successful persistence (prevent stale data on refresh)
 * - Resetting stuck features after server restart
 *
 * Key behaviors:
 * - Persist BEFORE emit (Pitfall 2 from research)
 * - Use readJsonWithRecovery for all reads
 * - markInterrupted preserves pipeline_* statuses
 */

import path from 'path';
import type { Feature, FeatureStatusWithPipeline, ParsedTask, PlanSpec } from '@automaker/types';
import { isPipelineStatus } from '@automaker/types';
import {
  atomicWriteJson,
  readJsonWithRecovery,
  logRecoveryWarning,
  DEFAULT_BACKUP_COUNT,
  createLogger,
} from '@automaker/utils';
import { getFeatureDir, getFeaturesDir } from '@automaker/platform';
import * as secureFs from '../lib/secure-fs.js';
import type { EventEmitter } from '../lib/events.js';
import type { AutoModeEventType } from './typed-event-bus.js';
import { getNotificationService } from './notification-service.js';
import { FeatureLoader } from './feature-loader.js';
import { pipelineService } from './pipeline-service.js';

const logger = createLogger('FeatureStateManager');

// Notification type constants
const NOTIFICATION_TYPE_WAITING_APPROVAL = 'feature_waiting_approval';
const NOTIFICATION_TYPE_VERIFIED = 'feature_verified';
const NOTIFICATION_TYPE_FEATURE_ERROR = 'feature_error';
const NOTIFICATION_TYPE_AUTO_MODE_ERROR = 'auto_mode_error';

// Notification title constants
const NOTIFICATION_TITLE_WAITING_APPROVAL = 'Feature Ready for Review';
const NOTIFICATION_TITLE_VERIFIED = 'Feature Verified';
const NOTIFICATION_TITLE_FEATURE_ERROR = 'Feature Failed';
const NOTIFICATION_TITLE_AUTO_MODE_ERROR = 'Auto Mode Error';

/**
 * Auto-mode event payload structure
 * This is the payload that comes with 'auto-mode:event' events
 */
interface AutoModeEventPayload {
  type?: string;
  featureId?: string;
  featureName?: string;
  passes?: boolean;
  executionMode?: 'auto' | 'manual';
  message?: string;
  error?: string;
  errorType?: string;
  projectPath?: string;
  /** Status field present when type === 'feature_status_changed' */
  status?: string;
}

/**
 * FeatureStateManager handles feature status updates with persistence guarantees.
 *
 * This service is responsible for:
 * 1. Updating feature status and persisting to disk BEFORE emitting events
 * 2. Handling corrupted JSON with automatic backup recovery
 * 3. Resetting stuck features after server restarts
 * 4. Managing justFinishedAt timestamps for UI badges
 */
export class FeatureStateManager {
  private events: EventEmitter;
  private featureLoader: FeatureLoader;
  private unsubscribe: (() => void) | null = null;

  constructor(events: EventEmitter, featureLoader: FeatureLoader) {
    this.events = events;
    this.featureLoader = featureLoader;

    // Subscribe to error events to create notifications
    this.unsubscribe = events.subscribe((type, payload) => {
      if (type === 'auto-mode:event') {
        this.handleAutoModeEventError(payload as AutoModeEventPayload);
      }
    });
  }

  /**
   * Cleanup subscriptions
   */
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  /**
   * Load a feature from disk with recovery support
   *
   * @param projectPath - Path to the project
   * @param featureId - ID of the feature to load
   * @returns The feature data, or null if not found/recoverable
   */
  async loadFeature(projectPath: string, featureId: string): Promise<Feature | null> {
    const featureDir = getFeatureDir(projectPath, featureId);
    const featurePath = path.join(featureDir, 'feature.json');

    try {
      const result = await readJsonWithRecovery<Feature | null>(featurePath, null, {
        maxBackups: DEFAULT_BACKUP_COUNT,
        autoRestore: true,
      });
      logRecoveryWarning(result, `Feature ${featureId}`, logger);
      return result.data;
    } catch {
      return null;
    }
  }

  /**
   * Update feature status with proper persistence and event ordering.
   *
   * IMPORTANT: Persists to disk BEFORE emitting events to prevent stale data
   * on client refresh (Pitfall 2 from research).
   *
   * @param projectPath - Path to the project
   * @param featureId - ID of the feature to update
   * @param status - New status value
   */
  async updateFeatureStatus(projectPath: string, featureId: string, status: string): Promise<void> {
    const featureDir = getFeatureDir(projectPath, featureId);
    const featurePath = path.join(featureDir, 'feature.json');

    try {
      // Use recovery-enabled read for corrupted file handling
      const result = await readJsonWithRecovery<Feature | null>(featurePath, null, {
        maxBackups: DEFAULT_BACKUP_COUNT,
        autoRestore: true,
      });

      logRecoveryWarning(result, `Feature ${featureId}`, logger);

      const feature = result.data;
      if (!feature) {
        logger.warn(`Feature ${featureId} not found or could not be recovered`);
        return;
      }

      feature.status = status;
      feature.updatedAt = new Date().toISOString();

      // Handle justFinishedAt timestamp based on status
      const shouldSetJustFinishedAt = status === 'waiting_approval';
      const shouldClearJustFinishedAt = status !== 'waiting_approval';
      if (shouldSetJustFinishedAt) {
        feature.justFinishedAt = new Date().toISOString();
      } else if (shouldClearJustFinishedAt) {
        feature.justFinishedAt = undefined;
      }

      // Finalize in-progress tasks when reaching terminal states (waiting_approval or verified)
      if (status === 'waiting_approval' || status === 'verified') {
        this.finalizeInProgressTasks(feature, featureId, status);
      }

      // PERSIST BEFORE EMIT (Pitfall 2)
      await atomicWriteJson(featurePath, feature, { backupCount: DEFAULT_BACKUP_COUNT });

      // Emit status change event so UI can react without polling
      this.emitAutoModeEvent('feature_status_changed', {
        featureId,
        projectPath,
        status,
      });

      // Create notifications for important status changes
      // Wrapped in try-catch so failures don't block syncFeatureToAppSpec below
      try {
        const notificationService = getNotificationService();
        const displayName = this.getFeatureDisplayName(feature, featureId);

        if (status === 'waiting_approval') {
          await notificationService.createNotification({
            type: NOTIFICATION_TYPE_WAITING_APPROVAL,
            title: displayName,
            message: NOTIFICATION_TITLE_WAITING_APPROVAL,
            featureId,
            projectPath,
          });
        } else if (status === 'verified') {
          await notificationService.createNotification({
            type: NOTIFICATION_TYPE_VERIFIED,
            title: displayName,
            message: NOTIFICATION_TITLE_VERIFIED,
            featureId,
            projectPath,
          });
        }
      } catch (notificationError) {
        logger.warn(`Failed to create notification for feature ${featureId}:`, notificationError);
      }

      // Sync completed/verified features to app_spec.txt
      if (status === 'verified' || status === 'completed') {
        try {
          await this.featureLoader.syncFeatureToAppSpec(projectPath, feature);
        } catch (syncError) {
          // Log but don't fail the status update if sync fails
          logger.warn(`Failed to sync feature ${featureId} to app_spec.txt:`, syncError);
        }
      }
    } catch (error) {
      logger.error(`Failed to update feature status for ${featureId}:`, error);
    }
  }

  /**
   * Mark a feature as interrupted due to server restart or other interruption.
   *
   * This is a convenience helper that updates the feature status to 'interrupted',
   * indicating the feature was in progress but execution was disrupted (e.g., server
   * restart, process crash, or manual stop). Features with this status can be
   * resumed later using the resume functionality.
   *
   * Note: Features with pipeline_* statuses are preserved rather than overwritten
   * to 'interrupted'. This ensures that resumePipelineFeature() can pick up from
   * the correct pipeline step after a restart.
   *
   * @param projectPath - Path to the project
   * @param featureId - ID of the feature to mark as interrupted
   * @param reason - Optional reason for the interruption (logged for debugging)
   */
  async markFeatureInterrupted(
    projectPath: string,
    featureId: string,
    reason?: string
  ): Promise<void> {
    // Load the feature to check its current status
    const feature = await this.loadFeature(projectPath, featureId);
    const currentStatus = feature?.status;

    // Preserve pipeline_* statuses so resumePipelineFeature can resume from the correct step
    if (isPipelineStatus(currentStatus)) {
      logger.info(
        `Feature ${featureId} was in ${currentStatus}; preserving pipeline status for resume`
      );
      return;
    }

    if (reason) {
      logger.info(`Marking feature ${featureId} as interrupted: ${reason}`);
    } else {
      logger.info(`Marking feature ${featureId} as interrupted`);
    }

    await this.updateFeatureStatus(projectPath, featureId, 'interrupted');
  }

  /**
   * Shared helper that scans features in a project directory and resets any stuck
   * in transient states (in_progress, interrupted) back to resting states.
   * Pipeline_* statuses are preserved so they can be resumed.
   *
   * Also resets:
   * - generating planSpec status back to pending
   * - in_progress tasks back to pending
   *
   * @param projectPath - The project path to scan
   * @param callerLabel - Label for log messages (e.g., 'resetStuckFeatures', 'reconcileAllFeatureStates')
   * @returns Object with reconciledFeatures (id + status info), reconciledCount, and scanned count
   */
  private async scanAndResetFeatures(
    projectPath: string,
    callerLabel: string
  ): Promise<{
    reconciledFeatures: Array<{
      id: string;
      previousStatus: string | undefined;
      newStatus: string | undefined;
    }>;
    reconciledFeatureIds: string[];
    reconciledCount: number;
    scanned: number;
  }> {
    const featuresDir = getFeaturesDir(projectPath);
    let scanned = 0;
    let reconciledCount = 0;
    const reconciledFeatureIds: string[] = [];
    const reconciledFeatures: Array<{
      id: string;
      previousStatus: string | undefined;
      newStatus: string | undefined;
    }> = [];

    try {
      const entries = await secureFs.readdir(featuresDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        scanned++;
        const featurePath = path.join(featuresDir, entry.name, 'feature.json');
        const result = await readJsonWithRecovery<Feature | null>(featurePath, null, {
          maxBackups: DEFAULT_BACKUP_COUNT,
          autoRestore: true,
        });

        const feature = result.data;
        if (!feature) continue;

        let needsUpdate = false;
        const originalStatus = feature.status;

        // Reset features in active execution states back to a resting state
        // After a server restart, no processes are actually running
        const isActiveState = originalStatus === 'in_progress' || originalStatus === 'interrupted';

        if (isActiveState) {
          const hasApprovedPlan = feature.planSpec?.status === 'approved';
          feature.status = hasApprovedPlan ? 'ready' : 'backlog';
          needsUpdate = true;
          logger.info(
            `[${callerLabel}] Reset feature ${feature.id} from ${originalStatus} to ${feature.status}`
          );
        }

        // Handle pipeline_* statuses separately: preserve them so they can be resumed
        // but still count them as needing attention if they were stuck.
        if (isPipelineStatus(originalStatus)) {
          // We don't change the status, but we still want to reset planSpec/task states
          // if they were stuck in transient generation/execution modes.
          // No feature.status change here.
          logger.debug(
            `[${callerLabel}] Preserving pipeline status for feature ${feature.id}: ${originalStatus}`
          );
        }

        // Reset generating planSpec status back to pending (spec generation was interrupted)
        if (feature.planSpec?.status === 'generating') {
          feature.planSpec.status = 'pending';
          needsUpdate = true;
          logger.info(
            `[${callerLabel}] Reset feature ${feature.id} planSpec status from generating to pending`
          );
        }

        // Reset any in_progress tasks back to pending (task execution was interrupted)
        if (feature.planSpec?.tasks) {
          for (const task of feature.planSpec.tasks) {
            if (task.status === 'in_progress') {
              task.status = 'pending';
              needsUpdate = true;
              logger.info(
                `[${callerLabel}] Reset task ${task.id} for feature ${feature.id} from in_progress to pending`
              );
              // Clear currentTaskId if it points to this reverted task
              if (feature.planSpec?.currentTaskId === task.id) {
                feature.planSpec.currentTaskId = undefined;
                logger.info(
                  `[${callerLabel}] Cleared planSpec.currentTaskId for feature ${feature.id} (was pointing to reverted task ${task.id})`
                );
              }
            }
          }
        }

        if (needsUpdate) {
          feature.updatedAt = new Date().toISOString();
          await atomicWriteJson(featurePath, feature, { backupCount: DEFAULT_BACKUP_COUNT });
          reconciledCount++;
          reconciledFeatureIds.push(feature.id);
          reconciledFeatures.push({
            id: feature.id,
            previousStatus: originalStatus,
            newStatus: feature.status,
          });
        }
      }
    } catch (error) {
      // If features directory doesn't exist, that's fine
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error(`[${callerLabel}] Error resetting features for ${projectPath}:`, error);
      }
    }

    return { reconciledFeatures, reconciledFeatureIds, reconciledCount, scanned };
  }

  /**
   * Reset features that were stuck in transient states due to server crash.
   * Called when auto mode is enabled to clean up from previous session.
   *
   * Resets:
   * - in_progress features back to ready (if has plan) or backlog (if no plan)
   * - interrupted features back to ready (if has plan) or backlog (if no plan)
   * - generating planSpec status back to pending
   * - in_progress tasks back to pending
   *
   * Preserves:
   * - pipeline_* statuses (so resumePipelineFeature can resume from correct step)
   *
   * @param projectPath - The project path to reset features for
   */
  async resetStuckFeatures(projectPath: string): Promise<void> {
    const { reconciledCount, scanned } = await this.scanAndResetFeatures(
      projectPath,
      'resetStuckFeatures'
    );

    logger.info(
      `[resetStuckFeatures] Scanned ${scanned} features, reset ${reconciledCount} features for ${projectPath}`
    );
  }

  /**
   * Reconcile all feature states on server startup.
   *
   * This method resets all features stuck in transient states (in_progress,
   * interrupted, pipeline_*) and emits events so connected UI clients
   * immediately reflect the corrected states.
   *
   * Should be called once during server initialization, before the UI is served,
   * to ensure feature state consistency after any type of restart (clean, forced, crash).
   *
   * @param projectPath - The project path to reconcile features for
   * @returns The number of features that were reconciled
   */
  async reconcileAllFeatureStates(projectPath: string): Promise<number> {
    logger.info(`[reconcileAllFeatureStates] Starting reconciliation for ${projectPath}`);

    const { reconciledFeatures, reconciledFeatureIds, reconciledCount, scanned } =
      await this.scanAndResetFeatures(projectPath, 'reconcileAllFeatureStates');

    // Emit per-feature status change events so UI invalidates its cache
    for (const { id, previousStatus, newStatus } of reconciledFeatures) {
      this.emitAutoModeEvent('feature_status_changed', {
        featureId: id,
        projectPath,
        status: newStatus,
        previousStatus,
        reason: 'server_restart_reconciliation',
      });
    }

    // Emit a bulk reconciliation event for the UI
    if (reconciledCount > 0) {
      this.emitAutoModeEvent('features_reconciled', {
        projectPath,
        reconciledCount,
        reconciledFeatureIds,
        message: `Reconciled ${reconciledCount} feature(s) after server restart`,
      });
    }

    logger.info(
      `[reconcileAllFeatureStates] Scanned ${scanned} features, reconciled ${reconciledCount} for ${projectPath}`
    );

    return reconciledCount;
  }

  /**
   * Update the planSpec of a feature with partial updates.
   *
   * @param projectPath - The project path
   * @param featureId - The feature ID
   * @param updates - Partial PlanSpec updates to apply
   */
  async updateFeaturePlanSpec(
    projectPath: string,
    featureId: string,
    updates: Partial<PlanSpec>
  ): Promise<void> {
    const featureDir = getFeatureDir(projectPath, featureId);
    const featurePath = path.join(featureDir, 'feature.json');

    try {
      const result = await readJsonWithRecovery<Feature | null>(featurePath, null, {
        maxBackups: DEFAULT_BACKUP_COUNT,
        autoRestore: true,
      });

      logRecoveryWarning(result, `Feature ${featureId}`, logger);

      const feature = result.data;
      if (!feature) {
        logger.warn(`Feature ${featureId} not found or could not be recovered`);
        return;
      }

      // Initialize planSpec if it doesn't exist
      if (!feature.planSpec) {
        feature.planSpec = {
          status: 'pending',
          version: 1,
          reviewedByUser: false,
        };
      }

      // Capture old content BEFORE applying updates for version comparison
      const oldContent = feature.planSpec.content;

      // Apply updates
      Object.assign(feature.planSpec, updates);

      // If content is being updated and it's different from old content, increment version
      if (updates.content !== undefined && updates.content !== oldContent) {
        feature.planSpec.version = (feature.planSpec.version || 0) + 1;
      }

      feature.updatedAt = new Date().toISOString();

      // PERSIST BEFORE EMIT
      await atomicWriteJson(featurePath, feature, { backupCount: DEFAULT_BACKUP_COUNT });

      // Emit event for UI update
      this.emitAutoModeEvent('plan_spec_updated', {
        featureId,
        projectPath,
        planSpec: feature.planSpec,
      });
    } catch (error) {
      logger.error(`Failed to update planSpec for ${featureId}:`, error);
    }
  }

  /**
   * Save the extracted summary to a feature's summary field.
   * This is called after agent execution completes to save a summary
   * extracted from the agent's output using <summary> tags.
   *
   * For pipeline features (status starts with pipeline_), summaries are accumulated
   * across steps with a header identifying each step. For non-pipeline features,
   * the summary is replaced entirely.
   *
   * @param projectPath - The project path
   * @param featureId - The feature ID
   * @param summary - The summary text to save
   */
  async saveFeatureSummary(projectPath: string, featureId: string, summary: string): Promise<void> {
    const featureDir = getFeatureDir(projectPath, featureId);
    const featurePath = path.join(featureDir, 'feature.json');
    const normalizedSummary = summary.trim();

    try {
      const result = await readJsonWithRecovery<Feature | null>(featurePath, null, {
        maxBackups: DEFAULT_BACKUP_COUNT,
        autoRestore: true,
      });

      logRecoveryWarning(result, `Feature ${featureId}`, logger);

      const feature = result.data;
      if (!feature) {
        logger.warn(`Feature ${featureId} not found or could not be recovered`);
        return;
      }

      if (!normalizedSummary) {
        logger.debug(
          `[saveFeatureSummary] Skipping empty summary for feature ${featureId} (status="${feature.status}")`
        );
        return;
      }

      // For pipeline features, accumulate summaries across steps
      if (isPipelineStatus(feature.status)) {
        // If we already have a non-phase summary (typically the initial implementation
        // summary from in_progress), normalize it into a named phase before appending
        // pipeline step summaries. This keeps the format consistent for UI phase parsing.
        const implementationHeader = '### Implementation';
        if (feature.summary && !feature.summary.trimStart().startsWith('### ')) {
          feature.summary = `${implementationHeader}\n\n${feature.summary.trim()}`;
        }

        const stepName = await this.getPipelineStepName(projectPath, feature.status);
        const stepHeader = `### ${stepName}`;
        const stepSection = `${stepHeader}\n\n${normalizedSummary}`;

        if (feature.summary) {
          // Check if this step already exists in the summary (e.g., if retried)
          // Use section splitting to only match real section boundaries, not text in body content
          const separator = '\n\n---\n\n';
          const sections = feature.summary.split(separator);
          let replaced = false;
          const updatedSections = sections.map((section) => {
            if (section.startsWith(`${stepHeader}\n\n`)) {
              replaced = true;
              return stepSection;
            }
            return section;
          });

          if (replaced) {
            feature.summary = updatedSections.join(separator);
            logger.info(
              `[saveFeatureSummary] Updated existing pipeline step summary for feature ${featureId}: step="${stepName}"`
            );
          } else {
            // Append as a new section
            feature.summary = `${feature.summary}${separator}${stepSection}`;
            logger.info(
              `[saveFeatureSummary] Appended new pipeline step summary for feature ${featureId}: step="${stepName}"`
            );
          }
        } else {
          feature.summary = stepSection;
          logger.info(
            `[saveFeatureSummary] Initialized pipeline summary for feature ${featureId}: step="${stepName}"`
          );
        }
      } else {
        feature.summary = normalizedSummary;
      }

      feature.updatedAt = new Date().toISOString();

      // PERSIST BEFORE EMIT
      await atomicWriteJson(featurePath, feature, { backupCount: DEFAULT_BACKUP_COUNT });

      // Emit event for UI update
      this.emitAutoModeEvent('auto_mode_summary', {
        featureId,
        projectPath,
        summary: feature.summary,
      });
    } catch (error) {
      logger.error(`Failed to save summary for ${featureId}:`, error);
    }
  }

  /**
   * Look up the pipeline step name from the current pipeline status.
   *
   * @param projectPath - The project path
   * @param status - The current pipeline status (e.g., 'pipeline_abc123')
   * @returns The step name, or a fallback based on the step ID
   */
  private async getPipelineStepName(projectPath: string, status: string): Promise<string> {
    try {
      const stepId = pipelineService.getStepIdFromStatus(status as FeatureStatusWithPipeline);
      if (stepId) {
        const step = await pipelineService.getStep(projectPath, stepId);
        if (step) return step.name;
      }
    } catch (error) {
      logger.debug(
        `[getPipelineStepName] Failed to look up step name for status "${status}", using fallback:`,
        error
      );
    }
    // Fallback: derive a human-readable name from the status suffix
    // e.g., 'pipeline_code_review' → 'Code Review'
    const suffix = status.replace('pipeline_', '');
    return suffix
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Update the status of a specific task within planSpec.tasks
   *
   * @param projectPath - The project path
   * @param featureId - The feature ID
   * @param taskId - The task ID to update
   * @param status - The new task status
   */
  async updateTaskStatus(
    projectPath: string,
    featureId: string,
    taskId: string,
    status: ParsedTask['status'],
    summary?: string
  ): Promise<void> {
    const featureDir = getFeatureDir(projectPath, featureId);
    const featurePath = path.join(featureDir, 'feature.json');

    try {
      const result = await readJsonWithRecovery<Feature | null>(featurePath, null, {
        maxBackups: DEFAULT_BACKUP_COUNT,
        autoRestore: true,
      });

      logRecoveryWarning(result, `Feature ${featureId}`, logger);

      const feature = result.data;
      if (!feature || !feature.planSpec?.tasks) {
        logger.warn(`Feature ${featureId} not found or has no tasks`);
        return;
      }

      // Find and update the task
      const task = feature.planSpec.tasks.find((t) => t.id === taskId);
      if (task) {
        task.status = status;
        if (summary) {
          task.summary = summary;
        }
        feature.updatedAt = new Date().toISOString();

        // PERSIST BEFORE EMIT
        await atomicWriteJson(featurePath, feature, { backupCount: DEFAULT_BACKUP_COUNT });

        // Emit event for UI update
        this.emitAutoModeEvent('auto_mode_task_status', {
          featureId,
          projectPath,
          taskId,
          status,
          summary,
          tasks: feature.planSpec.tasks,
        });
      } else {
        const availableIds = feature.planSpec.tasks.map((t) => t.id).join(', ');
        logger.warn(
          `[updateTaskStatus] Task ${taskId} not found in feature ${featureId} (${projectPath}). Available task IDs: [${availableIds}]`
        );
      }
    } catch (error) {
      logger.error(`Failed to update task ${taskId} status for ${featureId}:`, error);
    }
  }

  /**
   * Get the display name for a feature, preferring title over feature ID.
   * Empty string titles are treated as missing and fallback to featureId.
   *
   * @param feature - The feature to get the display name for
   * @param featureId - The feature ID to use as fallback
   * @returns The display name (title or feature ID)
   */
  private getFeatureDisplayName(feature: Feature, featureId: string): string {
    // Use title if it's a non-empty string, otherwise fallback to featureId
    return feature.title && feature.title.trim() ? feature.title : featureId;
  }

  /**
   * Handle auto-mode events to create error notifications.
   * This listens for error events and creates notifications to alert users.
   */
  private async handleAutoModeEventError(payload: AutoModeEventPayload): Promise<void> {
    if (!payload.type) return;

    // Only handle error events
    if (payload.type !== 'auto_mode_error' && payload.type !== 'auto_mode_feature_complete') {
      return;
    }

    // For auto_mode_feature_complete, only notify on failures (passes === false)
    if (payload.type === 'auto_mode_feature_complete' && payload.passes !== false) {
      return;
    }

    // Get project path - handle different event formats
    const projectPath = payload.projectPath;
    if (!projectPath) return;

    try {
      const notificationService = getNotificationService();

      // Determine notification type and title based on event type
      // Only auto_mode_feature_complete events should create feature_error notifications
      const isFeatureError = payload.type === 'auto_mode_feature_complete';
      const notificationType = isFeatureError
        ? NOTIFICATION_TYPE_FEATURE_ERROR
        : NOTIFICATION_TYPE_AUTO_MODE_ERROR;
      const notificationTitle = isFeatureError
        ? NOTIFICATION_TITLE_FEATURE_ERROR
        : NOTIFICATION_TITLE_AUTO_MODE_ERROR;

      // Build error message
      let errorMessage = payload.message || 'An error occurred';
      if (payload.error) {
        errorMessage = payload.error;
      }

      // Use feature title as notification title when available, fall back to gesture name
      let title = notificationTitle;
      if (payload.featureId) {
        const displayName = await this.getFeatureDisplayNameById(projectPath, payload.featureId);
        if (displayName) {
          title = displayName;
          errorMessage = `${notificationTitle}: ${errorMessage}`;
        }
      }

      await notificationService.createNotification({
        type: notificationType,
        title,
        message: errorMessage,
        featureId: payload.featureId,
        projectPath,
      });
    } catch (notificationError) {
      logger.warn(`Failed to create error notification:`, notificationError);
    }
  }

  /**
   * Get feature display name by loading the feature directly.
   */
  private async getFeatureDisplayNameById(
    projectPath: string,
    featureId: string
  ): Promise<string | null> {
    const feature = await this.loadFeature(projectPath, featureId);
    if (!feature) return null;
    return this.getFeatureDisplayName(feature, featureId);
  }

  /**
   * Finalize in-progress tasks when a feature reaches a terminal state.
   * Marks in_progress tasks as completed but leaves pending tasks untouched.
   *
   * @param feature - The feature whose tasks should be finalized
   * @param featureId - The feature ID for logging
   * @param targetStatus - The status the feature is transitioning to
   */
  private finalizeInProgressTasks(feature: Feature, featureId: string, targetStatus: string): void {
    if (!feature.planSpec?.tasks) {
      return;
    }

    let tasksFinalized = 0;
    let tasksPending = 0;

    for (const task of feature.planSpec.tasks) {
      if (task.status === 'in_progress') {
        task.status = 'completed';
        tasksFinalized++;
      } else if (task.status === 'pending') {
        tasksPending++;
      }
    }

    // Update tasksCompleted count to reflect actual completed tasks
    feature.planSpec.tasksCompleted = feature.planSpec.tasks.filter(
      (t) => t.status === 'completed'
    ).length;
    feature.planSpec.currentTaskId = undefined;

    if (tasksFinalized > 0) {
      logger.info(
        `[updateFeatureStatus] Finalized ${tasksFinalized} in_progress tasks for feature ${featureId} moving to ${targetStatus}`
      );
    }

    if (tasksPending > 0) {
      logger.warn(
        `[updateFeatureStatus] Feature ${featureId} moving to ${targetStatus} with ${tasksPending} pending (never started) tasks out of ${feature.planSpec.tasks.length} total`
      );
    }
  }

  /**
   * Emit an auto-mode event via the event emitter
   *
   * @param eventType - The event type (e.g., 'auto_mode_summary')
   * @param data - The event payload
   */
  private emitAutoModeEvent(eventType: AutoModeEventType, data: Record<string, unknown>): void {
    // Wrap the event in auto-mode:event format expected by the client
    this.events.emit('auto-mode:event', {
      type: eventType,
      ...data,
    });
  }
}
