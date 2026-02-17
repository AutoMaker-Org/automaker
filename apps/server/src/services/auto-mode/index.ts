/**
 * Auto Mode Service Module
 *
 * Entry point for auto-mode functionality. Exports:
 * - GlobalAutoModeService: Global operations that span all projects
 * - AutoModeServiceFacade: Per-project facade for auto-mode operations
 * - createAutoModeFacade: Convenience factory function
 * - Types for route consumption
 */

// Main exports
export { GlobalAutoModeService } from './global-service.js';
export { AutoModeServiceFacade } from './facade.js';
export { AutoModeServiceCompat } from './compat.js';

// Convenience factory function
import { AutoModeServiceFacade } from './facade.js';
import type { FacadeOptions } from './types.js';

/**
 * Create an AutoModeServiceFacade instance for a specific project.
 *
 * This is a convenience wrapper around AutoModeServiceFacade.create().
 *
 * @param projectPath - The project path this facade operates on
 * @param options - Configuration options including events, settingsService, featureLoader
 * @returns A new AutoModeServiceFacade instance
 *
 * @example
 * ```typescript
 * import { createAutoModeFacade } from './services/auto-mode';
 *
 * const facade = createAutoModeFacade('/path/to/project', {
 *   events: eventEmitter,
 *   settingsService,
 * });
 *
 * // Start auto mode
 * await facade.startAutoLoop(null, 3);
 *
 * // Check status
 * const status = facade.getStatusForProject();
 * ```
 */
export function createAutoModeFacade(
  projectPath: string,
  options: FacadeOptions
): AutoModeServiceFacade {
  return AutoModeServiceFacade.create(projectPath, options);
}

// Type exports from types.ts
export type {
  FacadeOptions,
  SharedServices,
  AutoModeStatus,
  ProjectAutoModeStatus,
  WorktreeCapacityInfo,
  RunningAgentInfo,
  OrphanedFeatureInfo,
  FacadeError,
  GlobalAutoModeOperations,
} from './types.js';

// Re-export types from extracted services for route convenience
export type {
  AutoModeConfig,
  ProjectAutoLoopState,
  RunningFeature,
  AcquireParams,
  WorktreeInfo,
  PipelineContext,
  PipelineStatusInfo,
  PlanApprovalResult,
  ResolveApprovalResult,
  ExecutionState,
} from './types.js';
