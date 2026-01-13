/**
 * Feature Loader - Handles loading and managing features from individual feature folders
 * Each feature is stored in .automaker/features/{featureId}/feature.json
 */

import path from 'path';
import type { Feature, DescriptionHistoryEntry } from '@automaker/types';
import { createLogger } from '@automaker/utils';
import * as secureFs from '../lib/secure-fs.js';
import {
  getFeaturesDir,
  getFeatureDir,
  getFeatureImagesDir,
  ensureAutomakerDir,
} from '@automaker/platform';

const logger = createLogger('FeatureLoader');

// Re-export Feature type for convenience
export type { Feature };

export class FeatureLoader {
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
          logger.info(`Deleted orphaned image: ${oldPath}`);
        } catch (error) {
          // Ignore errors when deleting (file may already be gone)
          logger.warn(`Failed to delete image: ${oldPath}`, error);
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
          logger.warn(`Image not found, skipping: ${fullOriginalPath}`);
          continue;
        }

        // Get filename and create new path in external storage
        const filename = path.basename(originalPath);
        const newPath = path.join(featureImagesDir, filename);

        // Copy the file
        await secureFs.copyFile(fullOriginalPath, newPath);
        logger.info(`Copied image: ${originalPath} -> ${newPath}`);

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
   * Get the path to a feature's raw-output.jsonl file
   */
  getRawOutputPath(projectPath: string, featureId: string): string {
    return path.join(this.getFeatureDir(projectPath, featureId), 'raw-output.jsonl');
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

      // Load all features concurrently (secureFs has built-in concurrency limiting)
      const featurePromises = featureDirs.map(async (dir) => {
        const featureId = dir.name;
        const featureJsonPath = this.getFeatureJsonPath(projectPath, featureId);

        try {
          const content = (await secureFs.readFile(featureJsonPath, 'utf-8')) as string;
          const feature = JSON.parse(content);

          if (!feature.id) {
            logger.warn(`Feature ${featureId} missing required 'id' field, skipping`);
            return null;
          }

          return feature as Feature;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
          } else if (error instanceof SyntaxError) {
            logger.warn(`Failed to parse feature.json for ${featureId}: ${error.message}`);
          } else {
            logger.error(`Failed to load feature ${featureId}:`, (error as Error).message);
          }
          return null;
        }
      });

      const results = await Promise.all(featurePromises);
      const features = results.filter((f): f is Feature => f !== null);

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
      return JSON.parse(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      logger.error(`Failed to get feature ${featureId}:`, error);
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

    // Initialize description history with the initial description
    const initialHistory: DescriptionHistoryEntry[] = [];
    if (featureData.description && featureData.description.trim()) {
      initialHistory.push({
        description: featureData.description,
        timestamp: new Date().toISOString(),
        source: 'initial',
      });
    }

    // Ensure feature has required fields
    const feature: Feature = {
      category: featureData.category || 'Uncategorized',
      description: featureData.description || '',
      ...featureData,
      id: featureId,
      imagePaths: migratedImagePaths,
      descriptionHistory: initialHistory,
    };

    // Write feature.json
    await secureFs.writeFile(featureJsonPath, JSON.stringify(feature, null, 2), 'utf-8');

    logger.info(`Created feature ${featureId}`);
    return feature;
  }

  /**
   * Update a feature (partial updates supported)
   * @param projectPath - Path to the project
   * @param featureId - ID of the feature to update
   * @param updates - Partial feature updates
   * @param descriptionHistorySource - Source of description change ('enhance' or 'edit')
   * @param enhancementMode - Enhancement mode if source is 'enhance'
   * @param preEnhancementDescription - Description before enhancement (for restoring original)
   */
  async update(
    projectPath: string,
    featureId: string,
    updates: Partial<Feature>,
    descriptionHistorySource?: 'enhance' | 'edit',
    enhancementMode?: 'improve' | 'technical' | 'simplify' | 'acceptance' | 'ux-reviewer',
    preEnhancementDescription?: string
  ): Promise<Feature> {
    const feature = await this.get(projectPath, featureId);
    if (!feature) {
      throw new Error(`Feature ${featureId} not found`);
    }

    // Handle image path changes
    let updatedImagePaths = updates.imagePaths;
    if (updates.imagePaths !== undefined) {
      // Delete orphaned images (images that were removed)
      await this.deleteOrphanedImages(projectPath, feature.imagePaths, updates.imagePaths);

      // Migrate any new images
      updatedImagePaths = await this.migrateImages(projectPath, featureId, updates.imagePaths);
    }

    // Track description history if description changed
    let updatedHistory = feature.descriptionHistory || [];
    if (
      updates.description !== undefined &&
      updates.description !== feature.description &&
      updates.description.trim()
    ) {
      const timestamp = new Date().toISOString();

      // If this is an enhancement and we have the pre-enhancement description,
      // add the original text to history first (so user can restore to it)
      if (
        descriptionHistorySource === 'enhance' &&
        preEnhancementDescription &&
        preEnhancementDescription.trim()
      ) {
        // Check if this pre-enhancement text is different from the last history entry
        const lastEntry = updatedHistory[updatedHistory.length - 1];
        if (!lastEntry || lastEntry.description !== preEnhancementDescription) {
          const preEnhanceEntry: DescriptionHistoryEntry = {
            description: preEnhancementDescription,
            timestamp,
            source: updatedHistory.length === 0 ? 'initial' : 'edit',
          };
          updatedHistory = [...updatedHistory, preEnhanceEntry];
        }
      }

      // Add the new/enhanced description to history
      const historyEntry: DescriptionHistoryEntry = {
        description: updates.description,
        timestamp,
        source: descriptionHistorySource || 'edit',
        ...(descriptionHistorySource === 'enhance' && enhancementMode ? { enhancementMode } : {}),
      };
      updatedHistory = [...updatedHistory, historyEntry];
    }

    // Merge updates
    const updatedFeature: Feature = {
      ...feature,
      ...updates,
      ...(updatedImagePaths !== undefined ? { imagePaths: updatedImagePaths } : {}),
      descriptionHistory: updatedHistory,
    };

    // Write back to file
    const featureJsonPath = this.getFeatureJsonPath(projectPath, featureId);
    await secureFs.writeFile(featureJsonPath, JSON.stringify(updatedFeature, null, 2), 'utf-8');

    logger.info(`Updated feature ${featureId}`);
    return updatedFeature;
  }

  /**
   * Delete a feature
   */
  async delete(projectPath: string, featureId: string): Promise<boolean> {
    try {
      const featureDir = this.getFeatureDir(projectPath, featureId);
      await secureFs.rm(featureDir, { recursive: true, force: true });
      logger.info(`Deleted feature ${featureId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete feature ${featureId}:`, error);
      return false;
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
      logger.error(`Failed to get agent output for ${featureId}:`, error);
      throw error;
    }
  }

  /**
   * Get raw output for a feature (JSONL format for debugging)
   */
  async getRawOutput(projectPath: string, featureId: string): Promise<string | null> {
    try {
      const rawOutputPath = this.getRawOutputPath(projectPath, featureId);
      const content = (await secureFs.readFile(rawOutputPath, 'utf-8')) as string;
      return content;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      logger.error(`Failed to get raw output for ${featureId}:`, error);
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
