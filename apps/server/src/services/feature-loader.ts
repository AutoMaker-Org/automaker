/**
 * Feature Loader - Handles loading and managing features from individual feature folders
 * Each feature is stored in .automaker/features/{featureId}/feature.json
 */

import path from 'path';
import type { Feature, PipelineConfig } from '@automaker/types';
import { createLogger } from '@automaker/utils';
import * as secureFs from '../lib/secure-fs.js';
import {
  getFeaturesDir,
  getFeatureDir,
  getFeatureImagesDir,
  ensureAutomakerDir,
} from '@automaker/platform';
import { PipelineConfigService } from './pipeline-config-service.js';

const logger = createLogger('FeatureLoader');

// Re-export Feature type for convenience
export type { Feature };

export class FeatureLoader {
  private pipelineConfigCache = new Map<string, PipelineConfig | null>();

  /**
   * Get the features directory path
   */
  getFeaturesDir(projectPath: string): string {
    return getFeaturesDir(projectPath);
  }

  /**
   * Get the images directory path for a feature
   */
  getFeatureImagesDir(projectPath: string, featureId: string): string {
    return getFeatureImagesDir(projectPath, featureId);
  }

  /**
   * Delete images that were removed from a feature
   */
  private async deleteOrphanedImages(
    projectPath: string,
    oldPaths: Array<string | { path: string; [key: string]: unknown }> | undefined,
    newPaths: Array<string | { path: string; [key: string]: unknown }> | undefined
  ): Promise<void> {
    if (!oldPaths || oldPaths.length === 0) {
      return;
    }

    // Build sets of paths for comparison
    const oldPathSet = new Set(oldPaths.map((p) => (typeof p === 'string' ? p : p.path)));
    const newPathSet = new Set((newPaths || []).map((p) => (typeof p === 'string' ? p : p.path)));

    // Find images that were removed
    for (const oldPath of oldPathSet) {
      if (!newPathSet.has(oldPath)) {
        try {
          // Paths are now absolute
          await secureFs.unlink(oldPath);
          console.log(`[FeatureLoader] Deleted orphaned image: ${oldPath}`);
        } catch (error) {
          // Ignore errors when deleting (file may already be gone)
          logger.warn(`[FeatureLoader] Failed to delete image: ${oldPath}`, error);
        }
      }
    }
  }

  /**
   * Copy images from temp directory to feature directory and update paths
   */
  private async migrateImages(
    projectPath: string,
    featureId: string,
    imagePaths?: Array<string | { path: string; [key: string]: unknown }>
  ): Promise<Array<string | { path: string; [key: string]: unknown }> | undefined> {
    if (!imagePaths || imagePaths.length === 0) {
      return imagePaths;
    }

    const featureImagesDir = this.getFeatureImagesDir(projectPath, featureId);
    await secureFs.mkdir(featureImagesDir, { recursive: true });

    const updatedPaths: Array<string | { path: string; [key: string]: unknown }> = [];

    for (const imagePath of imagePaths) {
      try {
        const originalPath = typeof imagePath === 'string' ? imagePath : imagePath.path;

        // Skip if already in feature directory (already absolute path in external storage)
        if (originalPath.includes(`/features/${featureId}/images/`)) {
          updatedPaths.push(imagePath);
          continue;
        }

        // Resolve the full path
        const fullOriginalPath = path.isAbsolute(originalPath)
          ? originalPath
          : path.join(projectPath, originalPath);

        // Check if file exists
        try {
          await secureFs.access(fullOriginalPath);
        } catch {
          logger.warn(`[FeatureLoader] Image not found, skipping: ${fullOriginalPath}`);
          continue;
        }

        // Get filename and create new path in external storage
        const filename = path.basename(originalPath);
        const newPath = path.join(featureImagesDir, filename);

        // Copy the file
        await secureFs.copyFile(fullOriginalPath, newPath);
        console.log(`[FeatureLoader] Copied image: ${originalPath} -> ${newPath}`);

        // Try to delete the original temp file
        try {
          await secureFs.unlink(fullOriginalPath);
        } catch {
          // Ignore errors when deleting temp file
        }

        // Update the path in the result (use absolute path)
        if (typeof imagePath === 'string') {
          updatedPaths.push(newPath);
        } else {
          updatedPaths.push({ ...imagePath, path: newPath });
        }
      } catch (error) {
        logger.error(`Failed to migrate image:`, error);
        // Rethrow error to let caller decide how to handle it
        // Keeping original path could lead to broken references
        throw error;
      }
    }

    return updatedPaths;
  }

  /**
   * Handle image updates during feature update - delete orphaned images and migrate new ones
   */
  private async handleImageUpdates(
    projectPath: string,
    featureId: string,
    existingPaths: Array<string | { path: string; [key: string]: unknown }> | undefined,
    newPaths: Array<string | { path: string; [key: string]: unknown }> | undefined
  ): Promise<Array<string | { path: string; [key: string]: unknown }> | undefined> {
    // Delete images that were removed
    await this.deleteOrphanedImages(projectPath, existingPaths, newPaths);

    // Migrate any new images from temp to feature directory
    return this.migrateImages(projectPath, featureId, newPaths);
  }

  /**
   * Get the path to a specific feature folder
   */
  getFeatureDir(projectPath: string, featureId: string): string {
    return getFeatureDir(projectPath, featureId);
  }

  /**
   * Get the path to a feature's feature.json file
   */
  getFeatureJsonPath(projectPath: string, featureId: string): string {
    return path.join(this.getFeatureDir(projectPath, featureId), 'feature.json');
  }

  /**
   * Get the path to a feature's agent-output.md file
   */
  getAgentOutputPath(projectPath: string, featureId: string): string {
    return path.join(this.getFeatureDir(projectPath, featureId), 'agent-output.md');
  }

  /**
   * Generate a new feature ID
   */
  generateFeatureId(): string {
    return `feature-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Get all features for a project
   */
  async getAll(projectPath: string): Promise<Feature[]> {
    try {
      const featuresDir = this.getFeaturesDir(projectPath);

      // Check if features directory exists
      try {
        await secureFs.access(featuresDir);
      } catch {
        return [];
      }

      // Read all feature directories
      const entries = (await secureFs.readdir(featuresDir, {
        withFileTypes: true,
      })) as any[];
      const featureDirs = entries.filter((entry) => entry.isDirectory());

      // Load each feature
      const features: Feature[] = [];
      for (const dir of featureDirs) {
        const featureId = dir.name;
        const featureJsonPath = this.getFeatureJsonPath(projectPath, featureId);

        try {
          const content = (await secureFs.readFile(featureJsonPath, 'utf-8')) as string;
          const feature = JSON.parse(content);

          if (!feature.id) {
            logger.warn(
              `[FeatureLoader] Feature ${featureId} missing required 'id' field, skipping`
            );
            continue;
          }

          features.push(feature);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            continue;
          } else if (error instanceof SyntaxError) {
            logger.warn(
              `[FeatureLoader] Failed to parse feature.json for ${featureId}: ${error.message}`
            );
          } else {
            logger.error(
              `[FeatureLoader] Failed to load feature ${featureId}:`,
              (error as Error).message
            );
          }
        }
      }

      // Sort by creation order (feature IDs contain timestamp)
      features.sort((a, b) => {
        const aTime = a.id ? parseInt(a.id.split('-')[1] || '0') : 0;
        const bTime = b.id ? parseInt(b.id.split('-')[1] || '0') : 0;
        return aTime - bTime;
      });

      return features;
    } catch (error) {
      logger.error('Failed to get all features:', error);
      return [];
    }
  }

  /**
   * Get a single feature by ID
   */
  async get(projectPath: string, featureId: string): Promise<Feature | null> {
    try {
      const featureJsonPath = this.getFeatureJsonPath(projectPath, featureId);
      const content = (await secureFs.readFile(featureJsonPath, 'utf-8')) as string;
      const feature: Feature = JSON.parse(content);

      // Load pipeline configuration if feature has pipeline steps
      if (feature.pipelineSteps && Object.keys(feature.pipelineSteps).length > 0) {
        const pipelineConfig = await this.loadPipelineConfig(projectPath);

        // Validate and sanitize pipeline steps
        if (pipelineConfig) {
          feature.pipelineSteps = this.validatePipelineSteps(feature.pipelineSteps, pipelineConfig);
        }
      }

      return feature;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      logger.error(`[FeatureLoader] Failed to get feature ${featureId}:`, error);
      throw error;
    }
  }

  /**
   * Create a new feature
   */
  async create(projectPath: string, featureData: Partial<Feature>): Promise<Feature> {
    const featureId = featureData.id || this.generateFeatureId();
    const featureDir = this.getFeatureDir(projectPath, featureId);
    const featureJsonPath = this.getFeatureJsonPath(projectPath, featureId);

    // Ensure automaker directory exists
    await ensureAutomakerDir(projectPath);

    // Create feature directory
    await secureFs.mkdir(featureDir, { recursive: true });

    // Migrate images from temp directory to feature directory
    const migratedImagePaths = await this.migrateImages(
      projectPath,
      featureId,
      featureData.imagePaths
    );

    // Ensure feature has required fields
    const feature: Feature = {
      category: featureData.category || 'Uncategorized',
      description: featureData.description || '',
      ...featureData,
      id: featureId,
      imagePaths: migratedImagePaths,
    };

    // Write feature.json
    await secureFs.writeFile(featureJsonPath, JSON.stringify(feature, null, 2), 'utf-8');

    logger.info(`Created feature ${featureId}`);
    return feature;
  }

  /**
   * Update a feature (partial updates supported)
   */
  async update(
    projectPath: string,
    featureId: string,
    updates: Partial<Feature>
  ): Promise<Feature> {
    const featureJsonPath = this.getFeatureJsonPath(projectPath, featureId);

    // Load existing feature
    const existing = await this.get(projectPath, featureId);
    if (!existing) {
      throw new Error(`Feature ${featureId} not found`);
    }

    // Handle image path updates
    const updatedImagePaths = await this.handleImageUpdates(
      projectPath,
      featureId,
      existing.imagePaths,
      updates.imagePaths
    );

    // Merge updates
    const updated: Feature = {
      ...existing,
      ...updates,
      imagePaths: updatedImagePaths,
      updatedAt: new Date().toISOString(),
    };

    // Write updated feature
    await secureFs.writeFile(featureJsonPath, JSON.stringify(updated, null, 2), 'utf-8');

    logger.info(`Updated feature ${featureId}`);
    return updated;
  }

  /**
   * Delete a feature
   */
  async delete(projectPath: string, featureId: string): Promise<boolean> {
    try {
      const featureDir = this.getFeatureDir(projectPath, featureId);
      await secureFs.rm(featureDir, { recursive: true, force: true });
      console.log(`[FeatureLoader] Deleted feature ${featureId}`);
      return true;
    } catch (error) {
      logger.error(`[FeatureLoader] Failed to delete feature ${featureId}:`, error);
      return false;
    }
  }

  /**
   * Load pipeline configuration for a project with caching
   */
  private async loadPipelineConfig(projectPath: string): Promise<PipelineConfig | null> {
    // Check cache first
    if (this.pipelineConfigCache.has(projectPath)) {
      return this.pipelineConfigCache.get(projectPath)!;
    }

    try {
      const configService = new PipelineConfigService(projectPath);
      const config = await configService.loadPipelineConfig();
      this.pipelineConfigCache.set(projectPath, config);
      return config;
    } catch (error) {
      logger.warn(`[FeatureLoader] Failed to load pipeline config: ${error}`);
      this.pipelineConfigCache.set(projectPath, null);
      return null;
    }
  }

  /**
   * Validate and sanitize pipeline steps against configuration
   */
  private validatePipelineSteps(
    pipelineSteps: Record<string, any>,
    pipelineConfig: PipelineConfig
  ): Record<string, any> {
    const validatedSteps: Record<string, any> = {};
    const configStepIds = new Set(pipelineConfig.steps.map((s) => s.id));

    // Validate each step
    for (const [stepId, stepData] of Object.entries(pipelineSteps)) {
      // Check if step exists in configuration
      if (!configStepIds.has(stepId)) {
        logger.warn(`[FeatureLoader] Unknown pipeline step: ${stepId}`);
        continue;
      }

      // Sanitize step data
      const configStep = pipelineConfig.steps.find((s) => s.id === stepId)!;
      validatedSteps[stepId] = {
        id: stepId,
        type: configStep.type,
        status: stepData.status || 'pending',
        startedAt: stepData.startedAt,
        completedAt: stepData.completedAt,
        result: stepData.result,
        // Remove any extra fields
      };
    }

    return validatedSteps;
  }

  /**
   * Clear pipeline configuration cache
   */
  clearPipelineConfigCache(projectPath?: string): void {
    if (projectPath) {
      this.pipelineConfigCache.delete(projectPath);
    } else {
      this.pipelineConfigCache.clear();
    }
  }

  /**
   * Get agent output for a feature
   */
  async getAgentOutput(projectPath: string, featureId: string): Promise<string | null> {
    try {
      const agentOutputPath = this.getAgentOutputPath(projectPath, featureId);
      const content = (await secureFs.readFile(agentOutputPath, 'utf-8')) as string;
      return content;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      logger.error(`[FeatureLoader] Failed to get agent output for ${featureId}:`, error);
      throw error;
    }
  }

  /**
   * Save agent output for a feature
   */
  async saveAgentOutput(projectPath: string, featureId: string, content: string): Promise<void> {
    const featureDir = this.getFeatureDir(projectPath, featureId);
    await secureFs.mkdir(featureDir, { recursive: true });

    const agentOutputPath = this.getAgentOutputPath(projectPath, featureId);
    await secureFs.writeFile(agentOutputPath, content, 'utf-8');
  }

  /**
   * Delete agent output for a feature
   */
  async deleteAgentOutput(projectPath: string, featureId: string): Promise<void> {
    try {
      const agentOutputPath = this.getAgentOutputPath(projectPath, featureId);
      await secureFs.unlink(agentOutputPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
