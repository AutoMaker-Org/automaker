/**
 * Spec Regeneration Service Interface
 * Handles project specification generation and regeneration
 */

import type { ServiceResult, Subscription, IService } from "../types";
import type { SpecRegenerationEvent } from "../types/events";

export interface SpecRegenerationStatus {
  isRunning: boolean;
  currentPhase?: string;
}

export interface ISpecRegenerationService extends IService {
  /**
   * Create initial project specification
   */
  create(
    projectPath: string,
    projectOverview: string,
    generateFeatures?: boolean
  ): Promise<ServiceResult>;

  /**
   * Regenerate project specification
   */
  generate(
    projectPath: string,
    projectDefinition: string
  ): Promise<ServiceResult>;

  /**
   * Generate features from existing specification
   */
  generateFeatures(projectPath: string): Promise<ServiceResult>;

  /**
   * Stop spec generation
   */
  stop(): Promise<ServiceResult>;

  /**
   * Get generation status
   */
  status(): Promise<ServiceResult<SpecRegenerationStatus>>;

  /**
   * Subscribe to spec regeneration events
   */
  onEvent(callback: (event: SpecRegenerationEvent) => void): Subscription;
}

// Re-export SpecRegenerationEvent for convenience
export type { SpecRegenerationEvent } from "../types/events";
