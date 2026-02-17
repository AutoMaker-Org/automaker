/**
 * ConcurrencyManager - Manages running feature slots with lease-based reference counting
 *
 * Extracted from AutoModeService to provide a standalone service for tracking
 * running feature execution with proper lease counting to support nested calls
 * (e.g., resumeFeature -> executeFeature).
 *
 * Key behaviors:
 * - acquire() with existing entry + allowReuse: increment leaseCount, return existing
 * - acquire() with existing entry + no allowReuse: throw Error('already running')
 * - release() decrements leaseCount, only deletes at 0
 * - release() with force:true bypasses leaseCount check
 */

import type { ModelProvider } from '@automaker/types';

/**
 * Function type for getting the current branch of a project.
 * Injected to allow for testing and decoupling from git operations.
 */
export type GetCurrentBranchFn = (projectPath: string) => Promise<string | null>;

/**
 * Represents a running feature execution with all tracking metadata
 */
export interface RunningFeature {
  featureId: string;
  projectPath: string;
  worktreePath: string | null;
  branchName: string | null;
  abortController: AbortController;
  isAutoMode: boolean;
  startTime: number;
  leaseCount: number;
  model?: string;
  provider?: ModelProvider;
}

/**
 * Parameters for acquiring a running feature slot
 */
export interface AcquireParams {
  featureId: string;
  projectPath: string;
  isAutoMode: boolean;
  allowReuse?: boolean;
  abortController?: AbortController;
}

/**
 * ConcurrencyManager manages the running features Map with lease-based reference counting.
 *
 * This supports nested execution patterns where a feature may be acquired multiple times
 * (e.g., during resume operations) and should only be released when all references are done.
 */
export class ConcurrencyManager {
  private runningFeatures = new Map<string, RunningFeature>();
  private getCurrentBranch: GetCurrentBranchFn;

  /**
   * @param getCurrentBranch - Function to get the current branch for a project.
   *                           If not provided, defaults to returning 'main'.
   */
  constructor(getCurrentBranch?: GetCurrentBranchFn) {
    this.getCurrentBranch = getCurrentBranch ?? (() => Promise.resolve('main'));
  }

  /**
   * Acquire a slot in the runningFeatures map for a feature.
   * Implements reference counting via leaseCount to support nested calls
   * (e.g., resumeFeature -> executeFeature).
   *
   * @param params.featureId - ID of the feature to track
   * @param params.projectPath - Path to the project
   * @param params.isAutoMode - Whether this is an auto-mode execution
   * @param params.allowReuse - If true, allows incrementing leaseCount for already-running features
   * @param params.abortController - Optional abort controller to use
   * @returns The RunningFeature entry (existing or newly created)
   * @throws Error if feature is already running and allowReuse is false
   */
  acquire(params: AcquireParams): RunningFeature {
    const existing = this.runningFeatures.get(params.featureId);
    if (existing) {
      if (!params.allowReuse) {
        throw new Error('already running');
      }
      existing.leaseCount += 1;
      return existing;
    }

    const abortController = params.abortController ?? new AbortController();
    const entry: RunningFeature = {
      featureId: params.featureId,
      projectPath: params.projectPath,
      worktreePath: null,
      branchName: null,
      abortController,
      isAutoMode: params.isAutoMode,
      startTime: Date.now(),
      leaseCount: 1,
    };
    this.runningFeatures.set(params.featureId, entry);
    return entry;
  }

  /**
   * Release a slot in the runningFeatures map for a feature.
   * Decrements leaseCount and only removes the entry when it reaches zero,
   * unless force option is used.
   *
   * @param featureId - ID of the feature to release
   * @param options.force - If true, immediately removes the entry regardless of leaseCount
   */
  release(featureId: string, options?: { force?: boolean }): void {
    const entry = this.runningFeatures.get(featureId);
    if (!entry) {
      return;
    }

    if (options?.force) {
      this.runningFeatures.delete(featureId);
      return;
    }

    entry.leaseCount -= 1;
    if (entry.leaseCount <= 0) {
      this.runningFeatures.delete(featureId);
    }
  }

  /**
   * Check if a feature is currently running
   *
   * @param featureId - ID of the feature to check
   * @returns true if the feature is in the runningFeatures map
   */
  isRunning(featureId: string): boolean {
    return this.runningFeatures.has(featureId);
  }

  /**
   * Get the RunningFeature entry for a feature
   *
   * @param featureId - ID of the feature
   * @returns The RunningFeature entry or undefined if not running
   */
  getRunningFeature(featureId: string): RunningFeature | undefined {
    return this.runningFeatures.get(featureId);
  }

  /**
   * Get count of running features for a specific project
   *
   * @param projectPath - The project path to count features for
   * @returns Number of running features for the project
   */
  getRunningCount(projectPath: string): number {
    let count = 0;
    for (const [, feature] of this.runningFeatures) {
      if (feature.projectPath === projectPath) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get count of running features for a specific worktree
   *
   * @param projectPath - The project path
   * @param branchName - The branch name, or null for main worktree
   *                     (features without branchName or matching primary branch)
   * @returns Number of running features for the worktree
   */
  async getRunningCountForWorktree(
    projectPath: string,
    branchName: string | null
  ): Promise<number> {
    // Get the actual primary branch name for the project
    const primaryBranch = await this.getCurrentBranch(projectPath);

    let count = 0;
    for (const [, feature] of this.runningFeatures) {
      // Filter by project path AND branchName to get accurate worktree-specific count
      const featureBranch = feature.branchName ?? null;
      if (branchName === null) {
        // Main worktree: match features with branchName === null OR branchName matching primary branch
        const isPrimaryBranch =
          featureBranch === null || (primaryBranch && featureBranch === primaryBranch);
        if (feature.projectPath === projectPath && isPrimaryBranch) {
          count++;
        }
      } else {
        // Feature worktree: exact match
        if (feature.projectPath === projectPath && featureBranch === branchName) {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Get all currently running features
   *
   * @returns Array of all RunningFeature entries
   */
  getAllRunning(): RunningFeature[] {
    return Array.from(this.runningFeatures.values());
  }

  /**
   * Get running feature IDs for a specific worktree, with proper primary branch normalization.
   *
   * When branchName is null (main worktree), matches features with branchName === null
   * OR branchName matching the primary branch (e.g., "main", "master").
   *
   * @param projectPath - The project path
   * @param branchName - The branch name, or null for main worktree
   * @returns Array of feature IDs running in the specified worktree
   */
  async getRunningFeaturesForWorktree(
    projectPath: string,
    branchName: string | null
  ): Promise<string[]> {
    const primaryBranch = await this.getCurrentBranch(projectPath);
    const featureIds: string[] = [];

    for (const [, feature] of this.runningFeatures) {
      if (feature.projectPath !== projectPath) continue;
      const featureBranch = feature.branchName ?? null;

      if (branchName === null) {
        // Main worktree: match features with null branchName OR primary branch name
        const isPrimaryBranch =
          featureBranch === null || (primaryBranch && featureBranch === primaryBranch);
        if (isPrimaryBranch) featureIds.push(feature.featureId);
      } else {
        // Feature worktree: exact match
        if (featureBranch === branchName) featureIds.push(feature.featureId);
      }
    }

    return featureIds;
  }

  /**
   * Update properties of a running feature
   *
   * @param featureId - ID of the feature to update
   * @param updates - Partial RunningFeature properties to update
   */
  updateRunningFeature(featureId: string, updates: Partial<RunningFeature>): void {
    const entry = this.runningFeatures.get(featureId);
    if (!entry) {
      return;
    }

    Object.assign(entry, updates);
  }
}
