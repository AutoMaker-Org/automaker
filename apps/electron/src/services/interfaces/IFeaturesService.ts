/**
 * Features Service Interface
 * CRUD operations for project features
 */

import type { ServiceResult, IService } from "../types";
import type { Feature } from "@/store/app-store";

export interface IFeaturesService extends IService {
  /**
   * Get all features for a project
   */
  getAll(projectPath: string): Promise<ServiceResult<Feature[]>>;

  /**
   * Get a single feature by ID
   */
  get(projectPath: string, featureId: string): Promise<ServiceResult<Feature>>;

  /**
   * Create a new feature
   */
  create(projectPath: string, feature: Feature): Promise<ServiceResult<Feature>>;

  /**
   * Update a feature
   */
  update(
    projectPath: string,
    featureId: string,
    updates: Partial<Feature>
  ): Promise<ServiceResult<Feature>>;

  /**
   * Delete a feature
   */
  delete(projectPath: string, featureId: string): Promise<ServiceResult>;

  /**
   * Get agent output/logs for a feature
   */
  getAgentOutput(
    projectPath: string,
    featureId: string
  ): Promise<ServiceResult<string | null>>;
}

// Re-export Feature type for convenience
export type { Feature } from "@/store/app-store";
