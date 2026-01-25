/**
 * Feature Loader - Handles loading and managing features from individual feature folders
 * Each feature is stored in .automaker/features/{featureId}/feature.json
 */

import path from 'path';
import type { Feature, DescriptionHistoryEntry } from '@automaker/types';
import {
  createLogger,
  atomicWriteJson,
  readJsonWithRecovery,
  logRecoveryWarning,
  DEFAULT_BACKUP_COUNT,
} from '@automaker/utils';
import * as secureFs from '../lib/secure-fs.js';
import {
  getFeaturesDir,
  getFeatureDir,
  getFeatureImagesDir,
  getAppSpecPath,
  ensureAutomakerDir,
} from '@automaker/platform';
import { addImplementedFeature, type ImplementedFeature } from '../lib/xml-extractor.js';

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

      // Load all features concurrently with automatic recovery from backups
      const featurePromises = featureDirs.map(async (dir) => {
        const featureId = dir.name;
        const featureJsonPath = this.getFeatureJsonPath(projectPath, featureId);

        // Use recovery-enabled read to handle corrupted files
        const result = await readJsonWithRecovery<Feature | null>(featureJsonPath, null, {
          maxBackups: DEFAULT_BACKUP_COUNT,
          autoRestore: true,
        });

        logRecoveryWarning(result, `Feature ${featureId}`, logger);

        const feature = result.data;

        if (!feature) {
          return null;
        }

        if (!feature.id) {
          logger.warn(`Feature ${featureId} missing required 'id' field, skipping`);
          return null;
        }

        return feature;
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
   * Normalize a title for comparison (case-insensitive, trimmed)
   */
  private normalizeTitle(title: string): string {
    return title.toLowerCase().trim();
  }

  /**
   * Find a feature by its title (case-insensitive match)
   * @param projectPath - Path to the project
   * @param title - Title to search for
   * @returns The matching feature or null if not found
   */
  async findByTitle(projectPath: string, title: string): Promise<Feature | null> {
    if (!title || !title.trim()) {
      return null;
    }

    const normalizedTitle = this.normalizeTitle(title);
    const features = await this.getAll(projectPath);

    for (const feature of features) {
      if (feature.title && this.normalizeTitle(feature.title) === normalizedTitle) {
        return feature;
      }
    }

    return null;
  }

  /**
   * Check if a title already exists on another feature (for duplicate detection)
   * @param projectPath - Path to the project
   * @param title - Title to check
   * @param excludeFeatureId - Optional feature ID to exclude from the check (for updates)
   * @returns The duplicate feature if found, null otherwise
   */
  async findDuplicateTitle(
    projectPath: string,
    title: string,
    excludeFeatureId?: string
  ): Promise<Feature | null> {
    if (!title || !title.trim()) {
      return null;
    }

    const normalizedTitle = this.normalizeTitle(title);
    const features = await this.getAll(projectPath);

    for (const feature of features) {
      // Skip the feature being updated (if provided)
      if (excludeFeatureId && feature.id === excludeFeatureId) {
        continue;
      }

      if (feature.title && this.normalizeTitle(feature.title) === normalizedTitle) {
        return feature;
      }
    }

    return null;
  }

  /**
   * Get a single feature by ID
   * Uses automatic recovery from backups if the main file is corrupted
   */
  async get(projectPath: string, featureId: string): Promise<Feature | null> {
    const featureJsonPath = this.getFeatureJsonPath(projectPath, featureId);

    // Use recovery-enabled read to handle corrupted files
    const result = await readJsonWithRecovery<Feature | null>(featureJsonPath, null, {
      maxBackups: DEFAULT_BACKUP_COUNT,
      autoRestore: true,
    });

    logRecoveryWarning(result, `Feature ${featureId}`, logger);

    return result.data;
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

    // Write feature.json atomically with backup support
    await atomicWriteJson(featureJsonPath, feature, { backupCount: DEFAULT_BACKUP_COUNT });

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

    // Write back to file atomically with backup support
    const featureJsonPath = this.getFeatureJsonPath(projectPath, featureId);
    await atomicWriteJson(featureJsonPath, updatedFeature, { backupCount: DEFAULT_BACKUP_COUNT });

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

  /**
   * Sync a completed feature to the app_spec.txt implemented_features section
   *
   * When a feature is completed, this method adds it to the implemented_features
   * section of the project's app_spec.txt file. This keeps the spec in sync
   * with the actual state of the codebase.
   *
   * @param projectPath - Path to the project
   * @param feature - The feature to sync (must have title or description)
   * @param fileLocations - Optional array of file paths where the feature was implemented
   * @returns True if the spec was updated, false if no spec exists or feature was skipped
   */
  async syncFeatureToAppSpec(
    projectPath: string,
    feature: Feature,
    fileLocations?: string[]
  ): Promise<boolean> {
    try {
      const appSpecPath = getAppSpecPath(projectPath);

      // Read the current app_spec.txt
      let specContent: string;
      try {
        specContent = (await secureFs.readFile(appSpecPath, 'utf-8')) as string;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          logger.info(`No app_spec.txt found for project, skipping sync for feature ${feature.id}`);
          return false;
        }
        throw error;
      }

      // Build the implemented feature entry
      const featureName = feature.title || `Feature: ${feature.id}`;
      const implementedFeature: ImplementedFeature = {
        name: featureName,
        description: feature.description,
        ...(fileLocations && fileLocations.length > 0 ? { file_locations: fileLocations } : {}),
      };

      // Add the feature to the implemented_features section
      const updatedSpecContent = addImplementedFeature(specContent, implementedFeature);

      // Check if the content actually changed (feature might already exist)
      if (updatedSpecContent === specContent) {
        logger.info(`Feature "${featureName}" already exists in app_spec.txt, skipping`);
        return false;
      }

      // Write the updated spec back to the file
      await secureFs.writeFile(appSpecPath, updatedSpecContent, 'utf-8');

      logger.info(`Synced feature "${featureName}" to app_spec.txt`);
      return true;
    } catch (error) {
      logger.error(`Failed to sync feature ${feature.id} to app_spec.txt:`, error);
      throw error;
    }
  }
}
