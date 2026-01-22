/**
 * Scheduler Service - Manages recurring feature schedules
 *
 * This service:
 * - Periodically checks for scheduled features that are due to run
 * - Triggers execution when crontab schedules match
 * - Updates schedule metadata (lastRun, nextRun, runCount)
 */

import { CronExpressionParser } from 'cron-parser';
import type { Feature, FeatureSchedule } from '@automaker/types';
import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../lib/events.js';
import { FeatureLoader } from './feature-loader.js';
import { AutoModeService } from './auto-mode-service.js';
import type { SettingsService } from './settings-service.js';

const logger = createLogger('SchedulerService');

// Check interval: 60 seconds
const CHECK_INTERVAL_MS = 60 * 1000;

export class SchedulerService {
  private events: EventEmitter;
  private featureLoader: FeatureLoader;
  private autoModeService: AutoModeService;
  private settingsService: SettingsService;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  constructor(
    events: EventEmitter,
    featureLoader: FeatureLoader,
    autoModeService: AutoModeService,
    settingsService: SettingsService
  ) {
    this.events = events;
    this.featureLoader = featureLoader;
    this.autoModeService = autoModeService;
    this.settingsService = settingsService;
  }

  /**
   * Start the scheduler service
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Scheduler already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting scheduler service');

    // Run initial check
    this.checkScheduledFeatures().catch((err) => {
      logger.error('Error in initial schedule check:', err);
    });

    // Set up periodic checks
    this.checkInterval = setInterval(() => {
      this.checkScheduledFeatures().catch((err) => {
        logger.error('Error in periodic schedule check:', err);
      });
    }, CHECK_INTERVAL_MS);
  }

  /**
   * Stop the scheduler service
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    logger.info('Scheduler service stopped');
  }

  /**
   * Calculate the next run time from a crontab expression
   */
  calculateNextRun(crontab: string, fromDate?: Date): Date | null {
    try {
      const interval = CronExpressionParser.parse(crontab, {
        currentDate: fromDate || new Date(),
      });
      return interval.next().toDate();
    } catch (err) {
      logger.warn(`Invalid crontab expression: ${crontab}`, err);
      return null;
    }
  }

  /**
   * Check if a scheduled feature is due to run
   */
  private isFeatureDue(schedule: FeatureSchedule): boolean {
    if (!schedule.enabled || !schedule.nextRun) {
      return false;
    }

    const now = new Date();
    const nextRun = new Date(schedule.nextRun);
    return now >= nextRun;
  }

  /**
   * Check all projects for scheduled features that need to run
   */
  private async checkScheduledFeatures(): Promise<void> {
    try {
      const globalSettings = await this.settingsService.getGlobalSettings();
      const projects = globalSettings.projects || [];

      for (const project of projects) {
        await this.checkProjectSchedules(project.path);
      }
    } catch (err) {
      logger.error('Error checking scheduled features:', err);
    }
  }

  /**
   * Check a single project for scheduled features
   */
  private async checkProjectSchedules(projectPath: string): Promise<void> {
    try {
      const features = await this.featureLoader.getAll(projectPath);
      const scheduledFeatures = features.filter(
        (f) => f.status === 'scheduled' && f.schedule?.enabled
      );

      if (scheduledFeatures.length === 0) {
        return;
      }

      logger.info(`Checking ${scheduledFeatures.length} scheduled features in ${projectPath}`);

      for (const feature of scheduledFeatures) {
        const isDue = this.isFeatureDue(feature.schedule!);
        const nextRun = feature.schedule?.nextRun
          ? new Date(feature.schedule.nextRun).toISOString()
          : 'not set';
        logger.debug(`Feature ${feature.id}: nextRun=${nextRun}, isDue=${isDue}`);

        if (isDue) {
          await this.triggerScheduledFeature(projectPath, feature);
        }
      }
    } catch (err) {
      logger.error(`Error checking schedules for ${projectPath}:`, err);
    }
  }

  /**
   * Trigger a scheduled feature to run
   */
  private async triggerScheduledFeature(projectPath: string, feature: Feature): Promise<void> {
    logger.info(`Triggering scheduled feature: ${feature.title || feature.id}`);

    try {
      // Check if the feature is already running (prevent concurrent execution)
      const { runningFeatures } = this.autoModeService.getStatus();
      if (runningFeatures.includes(feature.id)) {
        logger.warn(`Feature ${feature.id} is already running, skipping scheduled execution`);
        return;
      }

      // Check worktree capacity before starting
      const capacity = await this.autoModeService.checkWorktreeCapacity(projectPath, feature.id);
      if (!capacity.hasCapacity) {
        logger.warn(
          `Scheduler: Agent limit reached for feature ${feature.id}, will retry next cycle`
        );
        return;
      }

      // Clear agent output if keepPriorContext is false (start fresh)
      // Default is true (keep context) if not specified
      if (feature.schedule?.keepPriorContext === false) {
        logger.info(`Clearing agent output for feature ${feature.id} (start fresh mode)`);
        await this.featureLoader.deleteAgentOutput(projectPath, feature.id);
        await this.featureLoader.deleteRawOutput(projectPath, feature.id);
      }

      // Emit feature:started event for UI update
      this.events.emit('feature:started', {
        featureId: feature.id,
        featureName: feature.title,
        projectPath,
        triggeredBy: 'scheduler',
      });

      // Directly execute the feature (this works even if auto-mode is off)
      // Use worktrees based on the feature's branchName
      const useWorktrees = !!feature.branchName;

      logger.info(`Scheduler starting execution of feature ${feature.id}`);

      // Execute in background - don't await
      this.autoModeService
        .executeFeature(projectPath, feature.id, useWorktrees, false)
        .catch((err) => {
          logger.error(`Scheduler: Feature ${feature.id} execution error:`, err);
        });
    } catch (err) {
      logger.error(`Error triggering scheduled feature ${feature.id}:`, err);
    }
  }

  /**
   * Handle feature completion - update schedule if feature has one
   * Called by auto-mode service when a feature completes
   */
  async handleFeatureCompletion(
    projectPath: string,
    featureId: string,
    feature: Feature
  ): Promise<{ shouldMoveToScheduled: boolean; updatedSchedule?: FeatureSchedule }> {
    if (!feature.schedule?.enabled) {
      return { shouldMoveToScheduled: false };
    }

    const now = new Date();
    const nextRun = this.calculateNextRun(feature.schedule.crontab, now);

    if (!nextRun) {
      logger.warn(`Could not calculate next run for feature ${featureId}`);
      return { shouldMoveToScheduled: false };
    }

    const updatedSchedule: FeatureSchedule = {
      ...feature.schedule,
      lastRun: now.toISOString(),
      nextRun: nextRun.toISOString(),
      runCount: (feature.schedule.runCount || 0) + 1,
    };

    logger.info(`Feature ${featureId} completed with schedule. Next run: ${nextRun.toISOString()}`);

    return {
      shouldMoveToScheduled: true,
      updatedSchedule,
    };
  }

  /**
   * Recalculate next run times for all scheduled features
   * Called on server startup to handle missed schedules
   */
  async recalculateNextRunTimes(): Promise<void> {
    logger.info('Recalculating next run times for scheduled features');

    try {
      const globalSettings = await this.settingsService.getGlobalSettings();
      const projects = globalSettings.projects || [];

      for (const project of projects) {
        await this.recalculateProjectSchedules(project.path);
      }
    } catch (err) {
      logger.error('Error recalculating next run times:', err);
    }
  }

  /**
   * Recalculate next run times for a single project
   * Note: If a feature's nextRun is in the past, we keep it so it gets executed
   */
  private async recalculateProjectSchedules(projectPath: string): Promise<void> {
    try {
      const features = await this.featureLoader.getAll(projectPath);
      const scheduledFeatures = features.filter(
        (f) => f.status === 'scheduled' && f.schedule?.enabled
      );

      const now = new Date();

      for (const feature of scheduledFeatures) {
        // If nextRun is in the past, keep it so scheduler will trigger it
        if (feature.schedule?.nextRun) {
          const existingNextRun = new Date(feature.schedule.nextRun);
          if (existingNextRun <= now) {
            logger.info(
              `Feature ${feature.id} has past-due schedule (${existingNextRun.toISOString()}), will be triggered`
            );
            continue; // Don't update, let the scheduler pick it up
          }
        }

        // Only recalculate if nextRun is missing or in the future
        const nextRun = this.calculateNextRun(feature.schedule!.crontab);
        if (nextRun) {
          await this.featureLoader.update(projectPath, feature.id, {
            schedule: {
              ...feature.schedule!,
              nextRun: nextRun.toISOString(),
            },
          });
        }
      }
    } catch (err) {
      logger.error(`Error recalculating schedules for ${projectPath}:`, err);
    }
  }
}

// Singleton instance (created and managed by server index)
let schedulerService: SchedulerService | null = null;

export function getSchedulerService(): SchedulerService | null {
  return schedulerService;
}

export function setSchedulerService(service: SchedulerService): void {
  schedulerService = service;
}
