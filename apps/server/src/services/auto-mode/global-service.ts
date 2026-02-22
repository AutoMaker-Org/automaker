/**
 * GlobalAutoModeService - Global operations for auto-mode that span across all projects
 *
 * This service manages global state and operations that are not project-specific:
 * - Overall status (all running features across all projects)
 * - Active auto loop projects and worktrees
 * - Graceful shutdown (mark all features as interrupted)
 *
 * Per-project operations should use AutoModeServiceFacade instead.
 */

import path from 'path';
import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../../lib/events.js';
import { TypedEventBus } from '../typed-event-bus.js';
import { ConcurrencyManager } from '../concurrency-manager.js';
import { WorktreeResolver } from '../worktree-resolver.js';
import { AutoLoopCoordinator } from '../auto-loop-coordinator.js';
import { FeatureStateManager } from '../feature-state-manager.js';
import { FeatureLoader } from '../feature-loader.js';
import type { SettingsService } from '../settings-service.js';
import type { SharedServices, AutoModeStatus, RunningAgentInfo } from './types.js';

const logger = createLogger('GlobalAutoModeService');

/**
 * GlobalAutoModeService provides global operations for auto-mode.
 *
 * Created once at server startup, shared across all facades.
 */
export class GlobalAutoModeService {
  private readonly eventBus: TypedEventBus;
  private readonly concurrencyManager: ConcurrencyManager;
  private readonly autoLoopCoordinator: AutoLoopCoordinator;
  private readonly worktreeResolver: WorktreeResolver;
  private readonly featureStateManager: FeatureStateManager;
  private readonly featureLoader: FeatureLoader;

  constructor(
    events: EventEmitter,
    settingsService: SettingsService | null,
    featureLoader: FeatureLoader = new FeatureLoader()
  ) {
    this.featureLoader = featureLoader;
    this.eventBus = new TypedEventBus(events);
    this.worktreeResolver = new WorktreeResolver();
    this.concurrencyManager = new ConcurrencyManager((p) =>
      this.worktreeResolver.getCurrentBranch(p)
    );
    this.featureStateManager = new FeatureStateManager(events, featureLoader);

    // Create AutoLoopCoordinator with callbacks
    // IMPORTANT: This coordinator is for MONITORING ONLY (getActiveProjects, getActiveWorktrees).
    // Facades MUST create their own AutoLoopCoordinator for actual execution.
    // The executeFeatureFn here is a safety guard - it should never be called.
    this.autoLoopCoordinator = new AutoLoopCoordinator(
      this.eventBus,
      this.concurrencyManager,
      settingsService,
      // executeFeatureFn - throws because facades must use their own coordinator for execution
      async () => {
        throw new Error(
          'executeFeatureFn not available in GlobalAutoModeService. ' +
            'Facades must create their own AutoLoopCoordinator for execution.'
        );
      },
      // getBacklogFeaturesFn
      async (pPath, branchName) => {
        const features = await featureLoader.getAll(pPath);
        // For main worktree (branchName === null), resolve the actual primary branch name
        // so features with branchName matching the primary branch are included
        let primaryBranch: string | null = null;
        if (branchName === null) {
          primaryBranch = await this.worktreeResolver.getCurrentBranch(pPath);
        }
        return features.filter(
          (f) =>
            (f.status === 'backlog' || f.status === 'ready') &&
            (branchName === null
              ? !f.branchName || (primaryBranch && f.branchName === primaryBranch)
              : f.branchName === branchName)
        );
      },
      // saveExecutionStateFn - placeholder
      async () => {},
      // clearExecutionStateFn - placeholder
      async () => {},
      // resetStuckFeaturesFn
      (pPath) => this.featureStateManager.resetStuckFeatures(pPath),
      // isFeatureDoneFn
      (feature) =>
        feature.status === 'completed' ||
        feature.status === 'verified' ||
        feature.status === 'waiting_approval',
      // isFeatureRunningFn
      (featureId) => this.concurrencyManager.isRunning(featureId)
    );
  }

  /**
   * Get the shared services for use by facades.
   * This allows facades to share state with the global service.
   */
  getSharedServices(): SharedServices {
    return {
      eventBus: this.eventBus,
      concurrencyManager: this.concurrencyManager,
      autoLoopCoordinator: this.autoLoopCoordinator,
      worktreeResolver: this.worktreeResolver,
    };
  }

  // ===========================================================================
  // GLOBAL STATUS (3 methods)
  // ===========================================================================

  /**
   * Get global status (all projects combined)
   */
  getStatus(): AutoModeStatus {
    const allRunning = this.concurrencyManager.getAllRunning();
    return {
      isRunning: allRunning.length > 0,
      runningFeatures: allRunning.map((rf) => rf.featureId),
      runningCount: allRunning.length,
    };
  }

  /**
   * Get all active auto loop projects (unique project paths)
   */
  getActiveAutoLoopProjects(): string[] {
    return this.autoLoopCoordinator.getActiveProjects();
  }

  /**
   * Get all active auto loop worktrees
   */
  getActiveAutoLoopWorktrees(): Array<{ projectPath: string; branchName: string | null }> {
    return this.autoLoopCoordinator.getActiveWorktrees();
  }

  // ===========================================================================
  // RUNNING AGENTS (1 method)
  // ===========================================================================

  /**
   * Get detailed info about all running agents
   */
  async getRunningAgents(): Promise<RunningAgentInfo[]> {
    const agents = await Promise.all(
      this.concurrencyManager.getAllRunning().map(async (rf) => {
        let title: string | undefined;
        let description: string | undefined;
        let branchName: string | undefined;

        try {
          const feature = await this.featureLoader.get(rf.projectPath, rf.featureId);
          if (feature) {
            title = feature.title;
            description = feature.description;
            branchName = feature.branchName ?? undefined;
          }
        } catch {
          // Silently ignore
        }

        return {
          featureId: rf.featureId,
          projectPath: rf.projectPath,
          projectName: path.basename(rf.projectPath),
          isAutoMode: rf.isAutoMode,
          model: rf.model,
          provider: rf.provider,
          title,
          description,
          branchName,
        };
      })
    );
    return agents;
  }

  // ===========================================================================
  // LIFECYCLE (1 method)
  // ===========================================================================

  /**
   * Mark all running features as interrupted.
   * Called during graceful shutdown.
   *
   * @param reason - Optional reason for the interruption
   */
  async markAllRunningFeaturesInterrupted(reason?: string): Promise<void> {
    const allRunning = this.concurrencyManager.getAllRunning();

    for (const rf of allRunning) {
      await this.featureStateManager.markFeatureInterrupted(rf.projectPath, rf.featureId, reason);
    }

    if (allRunning.length > 0) {
      logger.info(
        `Marked ${allRunning.length} running feature(s) as interrupted: ${reason || 'no reason provided'}`
      );
    }
  }

  /**
   * Reconcile all feature states for a project on server startup.
   *
   * Resets features stuck in transient states (in_progress, interrupted, pipeline_*)
   * back to a resting state and emits events so the UI reflects corrected states.
   *
   * This should be called during server initialization to handle:
   * - Clean shutdown: features already marked as interrupted
   * - Forced kill / crash: features left in in_progress or pipeline_* states
   *
   * @param projectPath - The project path to reconcile
   * @returns The number of features that were reconciled
   */
  async reconcileFeatureStates(projectPath: string): Promise<number> {
    return this.featureStateManager.reconcileAllFeatureStates(projectPath);
  }
}
