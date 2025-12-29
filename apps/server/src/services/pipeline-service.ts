/**
 * Pipeline Service - Handles reading/writing pipeline configuration
 *
 * Provides persistent storage for:
 * - Pipeline configuration ({projectPath}/.automaker/pipeline.json)
 */

import path from 'path';
import { createLogger } from '@automaker/utils';
import * as secureFs from '../lib/secure-fs.js';
import { ensureAutomakerDir } from '@automaker/platform';
import type { PipelineConfig, PipelineStep, FeatureStatusWithPipeline } from '@automaker/types';

const logger = createLogger('PipelineService');

// Default empty pipeline config
const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  version: 1,
  steps: [],
};

/**
 * Atomic file write - write to temp file then rename
 */
async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  const content = JSON.stringify(data, null, 2);

  try {
    await secureFs.writeFile(tempPath, content, 'utf-8');
    await secureFs.rename(tempPath, filePath);
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await secureFs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Safely read JSON file with fallback to default
 */
async function readJsonFile<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    const content = (await secureFs.readFile(filePath, 'utf-8')) as string;
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return defaultValue;
    }
    logger.error(`Error reading ${filePath}:`, error);
    return defaultValue;
  }
}

/**
 * Generate a unique ID for pipeline steps
 */
function generateStepId(): string {
  return `step_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Get the pipeline config file path for a project
 */
function getPipelineConfigPath(projectPath: string): string {
  return path.join(projectPath, '.automaker', 'pipeline.json');
}

/**
 * PipelineService - Manages pipeline configuration for workflow automation
 *
 * Handles reading and writing pipeline config to JSON files with atomic operations.
 * Pipeline steps define custom columns that appear between "in_progress" and
 * "waiting_approval/verified" columns in the kanban board.
 */
export class PipelineService {
  /**
   * Get pipeline configuration for a project
   *
   * @param projectPath - Absolute path to the project
   * @returns Promise resolving to PipelineConfig (empty steps array if no config exists)
   */
  async getPipelineConfig(projectPath: string): Promise<PipelineConfig> {
    const configPath = getPipelineConfigPath(projectPath);
    const config = await readJsonFile<PipelineConfig>(configPath, DEFAULT_PIPELINE_CONFIG);

    // Ensure version is set
    return {
      ...DEFAULT_PIPELINE_CONFIG,
      ...config,
    };
  }

  /**
   * Save entire pipeline configuration
   *
   * @param projectPath - Absolute path to the project
   * @param config - Complete PipelineConfig to save
   */
  async savePipelineConfig(projectPath: string, config: PipelineConfig): Promise<void> {
    await ensureAutomakerDir(projectPath);
    const configPath = getPipelineConfigPath(projectPath);
    await atomicWriteJson(configPath, config);
    logger.info(`Pipeline config saved for project: ${projectPath}`);
  }

  /**
   * Add a new pipeline step
   *
   * @param projectPath - Absolute path to the project
   * @param step - Step data (without id, createdAt, updatedAt)
   * @returns Promise resolving to the created PipelineStep
   */
  async addStep(
    projectPath: string,
    step: Omit<PipelineStep, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<PipelineStep> {
    const config = await this.getPipelineConfig(projectPath);
    const now = new Date().toISOString();

    const newStep: PipelineStep = {
      ...step,
      id: generateStepId(),
      createdAt: now,
      updatedAt: now,
    };

    config.steps.push(newStep);

    // Normalize order values
    config.steps.sort((a, b) => a.order - b.order);
    config.steps.forEach((s, index) => {
      s.order = index;
    });

    await this.savePipelineConfig(projectPath, config);
    logger.info(`Pipeline step added: ${newStep.name} (${newStep.id})`);

    return newStep;
  }

  /**
   * Update an existing pipeline step
   *
   * @param projectPath - Absolute path to the project
   * @param stepId - ID of the step to update
   * @param updates - Partial step data to merge
   */
  async updateStep(
    projectPath: string,
    stepId: string,
    updates: Partial<Omit<PipelineStep, 'id' | 'createdAt'>>
  ): Promise<PipelineStep> {
    const config = await this.getPipelineConfig(projectPath);
    const stepIndex = config.steps.findIndex((s) => s.id === stepId);

    if (stepIndex === -1) {
      throw new Error(`Pipeline step not found: ${stepId}`);
    }

    config.steps[stepIndex] = {
      ...config.steps[stepIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await this.savePipelineConfig(projectPath, config);
    logger.info(`Pipeline step updated: ${stepId}`);

    return config.steps[stepIndex];
  }

  /**
   * Delete a pipeline step
   *
   * @param projectPath - Absolute path to the project
   * @param stepId - ID of the step to delete
   */
  async deleteStep(projectPath: string, stepId: string): Promise<void> {
    const config = await this.getPipelineConfig(projectPath);
    const stepIndex = config.steps.findIndex((s) => s.id === stepId);

    if (stepIndex === -1) {
      throw new Error(`Pipeline step not found: ${stepId}`);
    }

    config.steps.splice(stepIndex, 1);

    // Normalize order values after deletion
    config.steps.forEach((s, index) => {
      s.order = index;
    });

    await this.savePipelineConfig(projectPath, config);
    logger.info(`Pipeline step deleted: ${stepId}`);
  }

  /**
   * Reorder pipeline steps
   *
   * @param projectPath - Absolute path to the project
   * @param stepIds - Array of step IDs in the desired order
   */
  async reorderSteps(projectPath: string, stepIds: string[]): Promise<void> {
    const config = await this.getPipelineConfig(projectPath);

    // Validate all step IDs exist
    const existingIds = new Set(config.steps.map((s) => s.id));
    for (const id of stepIds) {
      if (!existingIds.has(id)) {
        throw new Error(`Pipeline step not found: ${id}`);
      }
    }

    // Create a map for quick lookup
    const stepMap = new Map(config.steps.map((s) => [s.id, s]));

    // Reorder steps based on stepIds array
    config.steps = stepIds.map((id, index) => {
      const step = stepMap.get(id)!;
      return { ...step, order: index, updatedAt: new Date().toISOString() };
    });

    await this.savePipelineConfig(projectPath, config);
    logger.info(`Pipeline steps reordered`);
  }

  /**
   * Get the next status in the pipeline flow
   *
   * Determines what status a feature should transition to based on current status.
   * Flow: in_progress -> pipeline_step_0 -> pipeline_step_1 -> ... -> final status
   *
   * @param currentStatus - Current feature status
   * @param config - Pipeline configuration (or null if no pipeline)
   * @param skipTests - Whether to skip tests (affects final status)
   * @returns The next status in the pipeline flow
   */
  getNextStatus(
    currentStatus: FeatureStatusWithPipeline,
    config: PipelineConfig | null,
    skipTests: boolean
  ): FeatureStatusWithPipeline {
    const steps = config?.steps || [];

    // Sort steps by order
    const sortedSteps = [...steps].sort((a, b) => a.order - b.order);

    // If no pipeline steps, use original logic
    if (sortedSteps.length === 0) {
      if (currentStatus === 'in_progress') {
        return skipTests ? 'waiting_approval' : 'verified';
      }
      return currentStatus;
    }

    // Coming from in_progress -> go to first pipeline step
    if (currentStatus === 'in_progress') {
      return `pipeline_${sortedSteps[0].id}`;
    }

    // Coming from a pipeline step -> go to next step or final status
    if (currentStatus.startsWith('pipeline_')) {
      const currentStepId = currentStatus.replace('pipeline_', '');
      const currentIndex = sortedSteps.findIndex((s) => s.id === currentStepId);

      if (currentIndex === -1) {
        // Step not found, go to final status
        return skipTests ? 'waiting_approval' : 'verified';
      }

      if (currentIndex < sortedSteps.length - 1) {
        // Go to next step
        return `pipeline_${sortedSteps[currentIndex + 1].id}`;
      }

      // Last step completed, go to final status
      return skipTests ? 'waiting_approval' : 'verified';
    }

    // For other statuses, don't change
    return currentStatus;
  }

  /**
   * Get a specific pipeline step by ID
   *
   * @param projectPath - Absolute path to the project
   * @param stepId - ID of the step to retrieve
   * @returns The pipeline step or null if not found
   */
  async getStep(projectPath: string, stepId: string): Promise<PipelineStep | null> {
    const config = await this.getPipelineConfig(projectPath);
    return config.steps.find((s) => s.id === stepId) || null;
  }

  /**
   * Check if a status is a pipeline status
   */
  isPipelineStatus(status: FeatureStatusWithPipeline): boolean {
    return status.startsWith('pipeline_');
  }

  /**
   * Extract step ID from a pipeline status
   */
  getStepIdFromStatus(status: FeatureStatusWithPipeline): string | null {
    if (!this.isPipelineStatus(status)) {
      return null;
    }
    return status.replace('pipeline_', '');
  }
}

// Export singleton instance
export const pipelineService = new PipelineService();
