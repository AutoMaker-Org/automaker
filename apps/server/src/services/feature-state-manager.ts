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
import type { Feature, ParsedTask, PlanSpec } from '@automaker/types';
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
import { getNotificationService } from './notification-service.js';
import { FeatureLoader } from './feature-loader.js';

const logger = createLogger('FeatureStateManager');

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

  constructor(events: EventEmitter, featureLoader: FeatureLoader) {
    this.events = events;
    this.featureLoader = featureLoader;
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

      // Set justFinishedAt timestamp when moving to waiting_approval (agent just completed)
      // Badge will show for 2 minutes after this timestamp
      if (status === 'waiting_approval') {
        feature.justFinishedAt = new Date().toISOString();

        // Finalize task statuses when feature is done:
        // - Mark any in_progress tasks as completed (agent finished but didn't explicitly complete them)
        // - Do NOT mark pending tasks as completed (they were never started)
        // - Clear currentTaskId since no task is actively running
        // This prevents cards in "waiting for review" from appearing to still have running tasks
        if (feature.planSpec?.tasks) {
          let tasksFinalized = 0;
          for (const task of feature.planSpec.tasks) {
            if (task.status === 'in_progress') {
              task.status = 'completed';
              tasksFinalized++;
            }
          }
          if (tasksFinalized > 0) {
            logger.info(
              `[updateFeatureStatus] Finalized ${tasksFinalized} in_progress tasks for feature ${featureId} moving to waiting_approval`
            );
          }
          // Update tasksCompleted count to reflect actual completed tasks
          feature.planSpec.tasksCompleted = feature.planSpec.tasks.filter(
            (t) => t.status === 'completed'
          ).length;
          feature.planSpec.currentTaskId = undefined;
        }
      } else if (status === 'verified') {
        // Also finalize in_progress tasks when moving directly to verified (skipTests=false)
        // Do NOT mark pending tasks as completed - they were never started
        if (feature.planSpec?.tasks) {
          for (const task of feature.planSpec.tasks) {
            if (task.status === 'in_progress') {
              task.status = 'completed';
            }
          }
          feature.planSpec.tasksCompleted = feature.planSpec.tasks.filter(
            (t) => t.status === 'completed'
          ).length;
          feature.planSpec.currentTaskId = undefined;
        }
        // Clear the timestamp when moving to other statuses
        feature.justFinishedAt = undefined;
      } else {
        // Clear the timestamp when moving to other statuses
        feature.justFinishedAt = undefined;
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
        if (status === 'waiting_approval') {
          await notificationService.createNotification({
            type: 'feature_waiting_approval',
            title: 'Feature Ready for Review',
            message: `"${feature.name || featureId}" is ready for your review and approval.`,
            featureId,
            projectPath,
          });
        } else if (status === 'verified') {
          await notificationService.createNotification({
            type: 'feature_verified',
            title: 'Feature Verified',
            message: `"${feature.name || featureId}" has been verified and is complete.`,
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
    if (currentStatus && currentStatus.startsWith('pipeline_')) {
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
   * Reset features that were stuck in transient states due to server crash.
   * Called when auto mode is enabled to clean up from previous session.
   *
   * Resets:
   * - in_progress features back to ready (if has plan) or backlog (if no plan)
   * - generating planSpec status back to pending
   * - in_progress tasks back to pending
   *
   * @param projectPath - The project path to reset features for
   */
  async resetStuckFeatures(projectPath: string): Promise<void> {
    const featuresDir = getFeaturesDir(projectPath);
    let featuresScanned = 0;
    let featuresReset = 0;

    try {
      const entries = await secureFs.readdir(featuresDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        featuresScanned++;
        const featurePath = path.join(featuresDir, entry.name, 'feature.json');
        const result = await readJsonWithRecovery<Feature | null>(featurePath, null, {
          maxBackups: DEFAULT_BACKUP_COUNT,
          autoRestore: true,
        });

        const feature = result.data;
        if (!feature) continue;

        let needsUpdate = false;

        // Reset in_progress features back to ready/backlog
        if (feature.status === 'in_progress') {
          const hasApprovedPlan = feature.planSpec?.status === 'approved';
          feature.status = hasApprovedPlan ? 'ready' : 'backlog';
          needsUpdate = true;
          logger.info(
            `[resetStuckFeatures] Reset feature ${feature.id} from in_progress to ${feature.status}`
          );
        }

        // Reset generating planSpec status back to pending (spec generation was interrupted)
        if (feature.planSpec?.status === 'generating') {
          feature.planSpec.status = 'pending';
          needsUpdate = true;
          logger.info(
            `[resetStuckFeatures] Reset feature ${feature.id} planSpec status from generating to pending`
          );
        }

        // Reset any in_progress tasks back to pending (task execution was interrupted)
        if (feature.planSpec?.tasks) {
          for (const task of feature.planSpec.tasks) {
            if (task.status === 'in_progress') {
              task.status = 'pending';
              needsUpdate = true;
              logger.info(
                `[resetStuckFeatures] Reset task ${task.id} for feature ${feature.id} from in_progress to pending`
              );
              // Clear currentTaskId if it points to this reverted task
              if (feature.planSpec?.currentTaskId === task.id) {
                feature.planSpec.currentTaskId = undefined;
                logger.info(
                  `[resetStuckFeatures] Cleared planSpec.currentTaskId for feature ${feature.id} (was pointing to reverted task ${task.id})`
                );
              }
            }
          }
        }

        if (needsUpdate) {
          feature.updatedAt = new Date().toISOString();
          await atomicWriteJson(featurePath, feature, { backupCount: DEFAULT_BACKUP_COUNT });
          featuresReset++;
        }
      }

      logger.info(
        `[resetStuckFeatures] Scanned ${featuresScanned} features, reset ${featuresReset} features for ${projectPath}`
      );
    } catch (error) {
      // If features directory doesn't exist, that's fine
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error(`[resetStuckFeatures] Error resetting features for ${projectPath}:`, error);
      }
    }
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
   * @param projectPath - The project path
   * @param featureId - The feature ID
   * @param summary - The summary text to save
   */
  async saveFeatureSummary(projectPath: string, featureId: string, summary: string): Promise<void> {
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

      feature.summary = summary;
      feature.updatedAt = new Date().toISOString();

      // PERSIST BEFORE EMIT
      await atomicWriteJson(featurePath, feature, { backupCount: DEFAULT_BACKUP_COUNT });

      // Emit event for UI update
      this.emitAutoModeEvent('auto_mode_summary', {
        featureId,
        projectPath,
        summary,
      });
    } catch (error) {
      logger.error(`Failed to save summary for ${featureId}:`, error);
    }
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
    status: ParsedTask['status']
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
        feature.updatedAt = new Date().toISOString();

        // PERSIST BEFORE EMIT
        await atomicWriteJson(featurePath, feature, { backupCount: DEFAULT_BACKUP_COUNT });

        // Emit event for UI update
        this.emitAutoModeEvent('auto_mode_task_status', {
          featureId,
          projectPath,
          taskId,
          status,
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
   * Emit an auto-mode event via the event emitter
   *
   * @param eventType - The event type (e.g., 'auto_mode_summary')
   * @param data - The event payload
   */
  private emitAutoModeEvent(eventType: string, data: Record<string, unknown>): void {
    // Wrap the event in auto-mode:event format expected by the client
    this.events.emit('auto-mode:event', {
      type: eventType,
      ...data,
    });
  }
}
