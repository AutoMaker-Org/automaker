/**
 * AutoLoopCoordinator - Manages the auto-mode loop lifecycle and failure tracking
 */

import type { Feature } from '@automaker/types';
import { createLogger, classifyError } from '@automaker/utils';
import type { TypedEventBus } from './typed-event-bus.js';
import type { ConcurrencyManager } from './concurrency-manager.js';
import type { SettingsService } from './settings-service.js';
import { DEFAULT_MAX_CONCURRENCY } from '@automaker/types';

const logger = createLogger('AutoLoopCoordinator');

const CONSECUTIVE_FAILURE_THRESHOLD = 3;
const FAILURE_WINDOW_MS = 60000;

export interface AutoModeConfig {
  maxConcurrency: number;
  useWorktrees: boolean;
  projectPath: string;
  branchName: string | null;
}

export interface ProjectAutoLoopState {
  abortController: AbortController;
  config: AutoModeConfig;
  isRunning: boolean;
  consecutiveFailures: { timestamp: number; error: string }[];
  pausedDueToFailures: boolean;
  hasEmittedIdleEvent: boolean;
  branchName: string | null;
}

/**
 * Generate a unique key for a worktree auto-loop instance.
 *
 * When branchName is null, this represents the main worktree (uses '__main__' sentinel).
 * The string 'main' is also normalized to '__main__' for consistency.
 * Named branches always use their exact name.
 */
export function getWorktreeAutoLoopKey(projectPath: string, branchName: string | null): string {
  const normalizedBranch = branchName === 'main' ? null : branchName;
  return `${projectPath}::${normalizedBranch ?? '__main__'}`;
}

export type ExecuteFeatureFn = (
  projectPath: string,
  featureId: string,
  useWorktrees: boolean,
  isAutoMode: boolean
) => Promise<void>;
export type LoadPendingFeaturesFn = (
  projectPath: string,
  branchName: string | null
) => Promise<Feature[]>;
export type SaveExecutionStateFn = (
  projectPath: string,
  branchName: string | null,
  maxConcurrency: number
) => Promise<void>;
export type ClearExecutionStateFn = (
  projectPath: string,
  branchName: string | null
) => Promise<void>;
export type ResetStuckFeaturesFn = (projectPath: string) => Promise<void>;
export type IsFeatureFinishedFn = (feature: Feature) => boolean;

export class AutoLoopCoordinator {
  private autoLoopsByProject = new Map<string, ProjectAutoLoopState>();

  constructor(
    private eventBus: TypedEventBus,
    private concurrencyManager: ConcurrencyManager,
    private settingsService: SettingsService | null,
    private executeFeatureFn: ExecuteFeatureFn,
    private loadPendingFeaturesFn: LoadPendingFeaturesFn,
    private saveExecutionStateFn: SaveExecutionStateFn,
    private clearExecutionStateFn: ClearExecutionStateFn,
    private resetStuckFeaturesFn: ResetStuckFeaturesFn,
    private isFeatureFinishedFn: IsFeatureFinishedFn,
    private isFeatureRunningFn: (featureId: string) => boolean
  ) {}

  /**
   * Start the auto mode loop for a specific project/worktree (supports multiple concurrent projects and worktrees)
   * @param projectPath - The project to start auto mode for
   * @param branchName - The branch name for worktree scoping, null for main worktree
   * @param maxConcurrency - Maximum concurrent features (default: DEFAULT_MAX_CONCURRENCY)
   */
  async startAutoLoopForProject(
    projectPath: string,
    branchName: string | null = null,
    maxConcurrency?: number
  ): Promise<number> {
    const resolvedMaxConcurrency = await this.resolveMaxConcurrency(
      projectPath,
      branchName,
      maxConcurrency
    );

    // Use worktree-scoped key
    const worktreeKey = getWorktreeAutoLoopKey(projectPath, branchName);

    // Check if this project/worktree already has an active autoloop
    const existingState = this.autoLoopsByProject.get(worktreeKey);
    if (existingState?.isRunning) {
      const worktreeDesc = branchName ? `worktree ${branchName}` : 'main worktree';
      throw new Error(
        `Auto mode is already running for ${worktreeDesc} in project: ${projectPath}`
      );
    }

    // Create new project/worktree autoloop state
    const abortController = new AbortController();
    const config: AutoModeConfig = {
      maxConcurrency: resolvedMaxConcurrency,
      useWorktrees: true,
      projectPath,
      branchName,
    };

    const projectState: ProjectAutoLoopState = {
      abortController,
      config,
      isRunning: true,
      consecutiveFailures: [],
      pausedDueToFailures: false,
      hasEmittedIdleEvent: false,
      branchName,
    };

    this.autoLoopsByProject.set(worktreeKey, projectState);
    try {
      await this.resetStuckFeaturesFn(projectPath);
    } catch {
      /* ignore */
    }
    this.eventBus.emitAutoModeEvent('auto_mode_started', {
      message: `Auto mode started with max ${resolvedMaxConcurrency} concurrent features`,
      projectPath,
      branchName,
      maxConcurrency: resolvedMaxConcurrency,
    });
    await this.saveExecutionStateFn(projectPath, branchName, resolvedMaxConcurrency);
    this.runAutoLoopForProject(worktreeKey).catch((error) => {
      const errorInfo = classifyError(error);
      this.eventBus.emitAutoModeEvent('auto_mode_error', {
        error: errorInfo.message,
        errorType: errorInfo.type,
        projectPath,
        branchName,
      });
    });
    return resolvedMaxConcurrency;
  }

  private async runAutoLoopForProject(worktreeKey: string): Promise<void> {
    const projectState = this.autoLoopsByProject.get(worktreeKey);
    if (!projectState) return;
    const { projectPath, branchName } = projectState.config;
    let iterationCount = 0;

    while (projectState.isRunning && !projectState.abortController.signal.aborted) {
      iterationCount++;
      try {
        const runningCount = await this.getRunningCountForWorktree(projectPath, branchName);
        if (runningCount >= projectState.config.maxConcurrency) {
          await this.sleep(5000, projectState.abortController.signal);
          continue;
        }
        const pendingFeatures = await this.loadPendingFeaturesFn(projectPath, branchName);
        if (pendingFeatures.length === 0) {
          if (runningCount === 0 && !projectState.hasEmittedIdleEvent) {
            this.eventBus.emitAutoModeEvent('auto_mode_idle', {
              message: 'No pending features - auto mode idle',
              projectPath,
              branchName,
            });
            projectState.hasEmittedIdleEvent = true;
          }
          await this.sleep(10000, projectState.abortController.signal);
          continue;
        }
        const nextFeature = pendingFeatures.find(
          (f) => !this.isFeatureRunningFn(f.id) && !this.isFeatureFinishedFn(f)
        );
        if (nextFeature) {
          projectState.hasEmittedIdleEvent = false;
          this.executeFeatureFn(
            projectPath,
            nextFeature.id,
            projectState.config.useWorktrees,
            true
          ).catch((error) => {
            const errorInfo = classifyError(error);
            logger.error(`Auto-loop feature ${nextFeature.id} failed:`, errorInfo.message);
            if (this.trackFailureAndCheckPauseForProject(projectPath, branchName, errorInfo)) {
              this.signalShouldPauseForProject(projectPath, branchName, errorInfo);
            }
          });
        }
        await this.sleep(2000, projectState.abortController.signal);
      } catch {
        if (projectState.abortController.signal.aborted) break;
        await this.sleep(5000, projectState.abortController.signal);
      }
    }
    projectState.isRunning = false;
  }

  async stopAutoLoopForProject(
    projectPath: string,
    branchName: string | null = null
  ): Promise<number> {
    const worktreeKey = getWorktreeAutoLoopKey(projectPath, branchName);
    const projectState = this.autoLoopsByProject.get(worktreeKey);
    if (!projectState) return 0;
    const wasRunning = projectState.isRunning;
    projectState.isRunning = false;
    projectState.abortController.abort();
    await this.clearExecutionStateFn(projectPath, branchName);
    if (wasRunning)
      this.eventBus.emitAutoModeEvent('auto_mode_stopped', {
        message: 'Auto mode stopped',
        projectPath,
        branchName,
      });
    this.autoLoopsByProject.delete(worktreeKey);
    return await this.getRunningCountForWorktree(projectPath, branchName);
  }

  isAutoLoopRunningForProject(projectPath: string, branchName: string | null = null): boolean {
    const worktreeKey = getWorktreeAutoLoopKey(projectPath, branchName);
    const projectState = this.autoLoopsByProject.get(worktreeKey);
    return projectState?.isRunning ?? false;
  }

  /**
   * Get auto loop config for a specific project/worktree
   * @param projectPath - The project path
   * @param branchName - The branch name, or null for main worktree
   */
  getAutoLoopConfigForProject(
    projectPath: string,
    branchName: string | null = null
  ): AutoModeConfig | null {
    const worktreeKey = getWorktreeAutoLoopKey(projectPath, branchName);
    const projectState = this.autoLoopsByProject.get(worktreeKey);
    return projectState?.config ?? null;
  }

  /**
   * Get all active auto loop worktrees with their project paths and branch names
   */
  getActiveWorktrees(): Array<{ projectPath: string; branchName: string | null }> {
    const activeWorktrees: Array<{ projectPath: string; branchName: string | null }> = [];
    for (const [, state] of this.autoLoopsByProject) {
      if (state.isRunning) {
        activeWorktrees.push({
          projectPath: state.config.projectPath,
          branchName: state.branchName,
        });
      }
    }
    return activeWorktrees;
  }

  getActiveProjects(): string[] {
    const activeProjects = new Set<string>();
    for (const [, state] of this.autoLoopsByProject) {
      if (state.isRunning) activeProjects.add(state.config.projectPath);
    }
    return Array.from(activeProjects);
  }

  async getRunningCountForWorktree(
    projectPath: string,
    branchName: string | null
  ): Promise<number> {
    return this.concurrencyManager.getRunningCountForWorktree(projectPath, branchName);
  }

  trackFailureAndCheckPauseForProject(
    projectPath: string,
    branchNameOrError: string | null | { type: string; message: string },
    errorInfo?: { type: string; message: string }
  ): boolean {
    // Support both old (projectPath, errorInfo) and new (projectPath, branchName, errorInfo) signatures
    let branchName: string | null;
    let actualErrorInfo: { type: string; message: string };
    if (
      typeof branchNameOrError === 'object' &&
      branchNameOrError !== null &&
      'type' in branchNameOrError
    ) {
      // Old signature: (projectPath, errorInfo)
      branchName = null;
      actualErrorInfo = branchNameOrError;
    } else {
      // New signature: (projectPath, branchName, errorInfo)
      branchName = branchNameOrError;
      actualErrorInfo = errorInfo!;
    }
    const projectState = this.autoLoopsByProject.get(
      getWorktreeAutoLoopKey(projectPath, branchName)
    );
    if (!projectState) return false;
    const now = Date.now();
    projectState.consecutiveFailures.push({ timestamp: now, error: actualErrorInfo.message });
    projectState.consecutiveFailures = projectState.consecutiveFailures.filter(
      (f) => now - f.timestamp < FAILURE_WINDOW_MS
    );
    return (
      projectState.consecutiveFailures.length >= CONSECUTIVE_FAILURE_THRESHOLD ||
      actualErrorInfo.type === 'quota_exhausted' ||
      actualErrorInfo.type === 'rate_limit'
    );
  }

  signalShouldPauseForProject(
    projectPath: string,
    branchNameOrError: string | null | { type: string; message: string },
    errorInfo?: { type: string; message: string }
  ): void {
    // Support both old (projectPath, errorInfo) and new (projectPath, branchName, errorInfo) signatures
    let branchName: string | null;
    let actualErrorInfo: { type: string; message: string };
    if (
      typeof branchNameOrError === 'object' &&
      branchNameOrError !== null &&
      'type' in branchNameOrError
    ) {
      branchName = null;
      actualErrorInfo = branchNameOrError;
    } else {
      branchName = branchNameOrError;
      actualErrorInfo = errorInfo!;
    }

    const projectState = this.autoLoopsByProject.get(
      getWorktreeAutoLoopKey(projectPath, branchName)
    );
    if (!projectState || projectState.pausedDueToFailures) return;
    projectState.pausedDueToFailures = true;
    const failureCount = projectState.consecutiveFailures.length;
    this.eventBus.emitAutoModeEvent('auto_mode_paused_failures', {
      message:
        failureCount >= CONSECUTIVE_FAILURE_THRESHOLD
          ? `Auto Mode paused: ${failureCount} consecutive failures detected.`
          : 'Auto Mode paused: Usage limit or API error detected.',
      errorType: actualErrorInfo.type,
      originalError: actualErrorInfo.message,
      failureCount,
      projectPath,
      branchName,
    });
    this.stopAutoLoopForProject(projectPath, branchName);
  }

  resetFailureTrackingForProject(projectPath: string, branchName: string | null = null): void {
    const projectState = this.autoLoopsByProject.get(
      getWorktreeAutoLoopKey(projectPath, branchName)
    );
    if (projectState) {
      projectState.consecutiveFailures = [];
      projectState.pausedDueToFailures = false;
    }
  }

  recordSuccessForProject(projectPath: string, branchName: string | null = null): void {
    const projectState = this.autoLoopsByProject.get(
      getWorktreeAutoLoopKey(projectPath, branchName)
    );
    if (projectState) projectState.consecutiveFailures = [];
  }

  async resolveMaxConcurrency(
    projectPath: string,
    branchName: string | null,
    provided?: number
  ): Promise<number> {
    if (typeof provided === 'number' && Number.isFinite(provided)) return provided;
    if (!this.settingsService) return DEFAULT_MAX_CONCURRENCY;
    try {
      const settings = await this.settingsService.getGlobalSettings();
      const globalMax =
        typeof settings.maxConcurrency === 'number'
          ? settings.maxConcurrency
          : DEFAULT_MAX_CONCURRENCY;
      const projectId = settings.projects?.find((p) => p.path === projectPath)?.id;
      const autoModeByWorktree = settings.autoModeByWorktree;
      if (projectId && autoModeByWorktree && typeof autoModeByWorktree === 'object') {
        const normalizedBranch =
          branchName === null || branchName === 'main' ? '__main__' : branchName;
        const worktreeId = `${projectId}::${normalizedBranch}`;
        if (
          worktreeId in autoModeByWorktree &&
          typeof autoModeByWorktree[worktreeId]?.maxConcurrency === 'number'
        ) {
          return autoModeByWorktree[worktreeId].maxConcurrency;
        }
      }
      return globalMax;
    } catch {
      return DEFAULT_MAX_CONCURRENCY;
    }
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('Aborted'));
        return;
      }
      const onAbort = () => {
        clearTimeout(timeout);
        reject(new Error('Aborted'));
      };
      const timeout = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal?.addEventListener('abort', onAbort);
    });
  }
}
