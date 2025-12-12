const path = require("path");
const fs = require("fs/promises");

/**
 * Feature Loader - Handles loading and managing features from individual feature folders
 * Each feature is stored in .automaker/features/{featureId}/feature.json
 */
class FeatureLoader {
  /**
   * Get the features directory path
   */
  getFeaturesDir(projectPath) {
    return path.join(projectPath, ".automaker", "features");
  }

  /**
   * Get the path to a specific feature folder
   */
  getFeatureDir(projectPath, featureId) {
    return path.join(this.getFeaturesDir(projectPath), featureId);
  }

  /**
   * Get the path to a feature's feature.json file
   */
  getFeatureJsonPath(projectPath, featureId) {
    return path.join(
      this.getFeatureDir(projectPath, featureId),
      "feature.json"
    );
  }

  /**
   * Get the path to a feature's agent-output.md file
   */
  getAgentOutputPath(projectPath, featureId) {
    return path.join(
      this.getFeatureDir(projectPath, featureId),
      "agent-output.md"
    );
  }

  /**
   * Generate a new feature ID
   */
  generateFeatureId() {
    return `feature-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 11)}`;
  }

  /**
   * Ensure all image paths for a feature are stored within the feature directory
   */
  async ensureFeatureImages(projectPath, featureId, feature) {
    if (
      !feature ||
      !Array.isArray(feature.imagePaths) ||
      feature.imagePaths.length === 0
    ) {
      return;
    }

    const featureDir = this.getFeatureDir(projectPath, featureId);
    const featureImagesDir = path.join(featureDir, "images");
    await fs.mkdir(featureImagesDir, { recursive: true });

    const updatedImagePaths = [];

    for (const entry of feature.imagePaths) {
      const isStringEntry = typeof entry === "string";
      const currentPathValue = isStringEntry ? entry : entry.path;

      if (!currentPathValue) {
        updatedImagePaths.push(entry);
        continue;
      }

      let resolvedCurrentPath = currentPathValue;
      if (!path.isAbsolute(resolvedCurrentPath)) {
        resolvedCurrentPath = path.join(projectPath, resolvedCurrentPath);
      }
      resolvedCurrentPath = path.normalize(resolvedCurrentPath);

      // Skip if file doesn't exist
      try {
        await fs.access(resolvedCurrentPath);
      } catch {
        console.warn(
          `[FeatureLoader] Image file missing for ${featureId}: ${resolvedCurrentPath}`
        );
        updatedImagePaths.push(entry);
        continue;
      }

      const relativeToFeatureImages = path.relative(
        featureImagesDir,
        resolvedCurrentPath
      );
      const alreadyInFeatureDir =
        relativeToFeatureImages === "" ||
        (!relativeToFeatureImages.startsWith("..") &&
          !path.isAbsolute(relativeToFeatureImages));

      let finalPath = resolvedCurrentPath;

      if (!alreadyInFeatureDir) {
        const originalName = path.basename(resolvedCurrentPath);
        let targetPath = path.join(featureImagesDir, originalName);

        // Avoid overwriting files by appending a counter if needed
        let counter = 1;
        while (true) {
          try {
            await fs.access(targetPath);
            const parsed = path.parse(originalName);
            targetPath = path.join(
              featureImagesDir,
              `${parsed.name}-${counter}${parsed.ext}`
            );
            counter += 1;
          } catch {
            break;
          }
        }

        try {
          await fs.rename(resolvedCurrentPath, targetPath);
          finalPath = targetPath;
        } catch (error) {
          console.warn(
            `[FeatureLoader] Failed to move image ${resolvedCurrentPath}: ${error.message}`
          );
          updatedImagePaths.push(entry);
          continue;
        }
      }

      updatedImagePaths.push(
        isStringEntry ? finalPath : { ...entry, path: finalPath }
      );
    }

    feature.imagePaths = updatedImagePaths;
  }

  /**
   * Get all features for a project
   */
  async getAll(projectPath) {
    try {
      const featuresDir = this.getFeaturesDir(projectPath);

      // Check if features directory exists
      try {
        await fs.access(featuresDir);
      } catch {
        // Directory doesn't exist, return empty array
        return [];
      }

      // Read all feature directories
      const entries = await fs.readdir(featuresDir, { withFileTypes: true });
      const featureDirs = entries.filter((entry) => entry.isDirectory());

      // Load each feature
      const features = [];
      for (const dir of featureDirs) {
        const featureId = dir.name;
        const featureJsonPath = this.getFeatureJsonPath(projectPath, featureId);

        try {
          // Read feature.json directly - handle ENOENT in catch block
          // This avoids TOCTOU race condition from checking with fs.access first
          const content = await fs.readFile(featureJsonPath, "utf-8");
          const feature = JSON.parse(content);
          
          // Validate that the feature has required fields
          if (!feature.id) {
            console.warn(
              `[FeatureLoader] Feature ${featureId} missing required 'id' field, skipping`
            );
            continue;
          }
          
          features.push(feature);
        } catch (error) {
          // Handle different error types appropriately
          if (error.code === "ENOENT") {
            // File doesn't exist - this is expected for incomplete feature directories
            // Skip silently (feature.json not yet created or was removed)
            continue;
          } else if (error instanceof SyntaxError) {
            // JSON parse error - log as warning since file exists but is malformed
            console.warn(
              `[FeatureLoader] Failed to parse feature.json for ${featureId}: ${error.message}`
            );
          } else {
            // Other errors - log as error
            console.error(
              `[FeatureLoader] Failed to load feature ${featureId}:`,
              error.message || error
            );
          }
          // Continue loading other features
        }
      }

      // Sort by creation order (feature IDs contain timestamp)
      features.sort((a, b) => {
        const aTime = a.id ? parseInt(a.id.split("-")[1] || "0") : 0;
        const bTime = b.id ? parseInt(b.id.split("-")[1] || "0") : 0;
        return aTime - bTime;
      });

      return features;
    } catch (error) {
      console.error("[FeatureLoader] Failed to get all features:", error);
      return [];
    }
  }

  /**
   * Get a single feature by ID
   */
  async get(projectPath, featureId) {
    try {
      const featureJsonPath = this.getFeatureJsonPath(projectPath, featureId);
      const content = await fs.readFile(featureJsonPath, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      if (error.code === "ENOENT") {
        return null;
      }
      console.error(
        `[FeatureLoader] Failed to get feature ${featureId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Create a new feature
   */
  async create(projectPath, featureData) {
    const featureId = featureData.id || this.generateFeatureId();
    const featureDir = this.getFeatureDir(projectPath, featureId);
    const featureJsonPath = this.getFeatureJsonPath(projectPath, featureId);

    // Ensure features directory exists
    const featuresDir = this.getFeaturesDir(projectPath);
    await fs.mkdir(featuresDir, { recursive: true });

    // Create feature directory
    await fs.mkdir(featureDir, { recursive: true });

    // Ensure feature has an ID
    const feature = { ...featureData, id: featureId };

    // Move any uploaded images into the feature directory
    await this.ensureFeatureImages(projectPath, featureId, feature);

    // Write feature.json
    await fs.writeFile(
      featureJsonPath,
      JSON.stringify(feature, null, 2),
      "utf-8"
    );

    console.log(`[FeatureLoader] Created feature ${featureId}`);
    return feature;
  }

  /**
   * Update a feature (partial updates supported)
   */
  async update(projectPath, featureId, updates) {
    try {
      const feature = await this.get(projectPath, featureId);
      if (!feature) {
        throw new Error(`Feature ${featureId} not found`);
      }

      // Merge updates
      const updatedFeature = { ...feature, ...updates };

      // Move any new images into the feature directory
      await this.ensureFeatureImages(projectPath, featureId, updatedFeature);

      // Write back to file
      const featureJsonPath = this.getFeatureJsonPath(projectPath, featureId);
      await fs.writeFile(
        featureJsonPath,
        JSON.stringify(updatedFeature, null, 2),
        "utf-8"
      );

      console.log(`[FeatureLoader] Updated feature ${featureId}`);
      return updatedFeature;
    } catch (error) {
      console.error(
        `[FeatureLoader] Failed to update feature ${featureId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Delete a feature and its entire folder
   */
  async delete(projectPath, featureId) {
    try {
      const featureDir = this.getFeatureDir(projectPath, featureId);
      await fs.rm(featureDir, { recursive: true, force: true });
      console.log(`[FeatureLoader] Deleted feature ${featureId}`);
    } catch (error) {
      if (error.code === "ENOENT") {
        // Feature doesn't exist, that's fine
        return;
      }
      console.error(
        `[FeatureLoader] Failed to delete feature ${featureId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get agent output for a feature
   */
  async getAgentOutput(projectPath, featureId) {
    try {
      const agentOutputPath = this.getAgentOutputPath(projectPath, featureId);
      const content = await fs.readFile(agentOutputPath, "utf-8");
      return content;
    } catch (error) {
      if (error.code === "ENOENT") {
        return null;
      }
      console.error(
        `[FeatureLoader] Failed to get agent output for ${featureId}:`,
        error
      );
      return null;
    }
  }

  // ============================================================================
  // Legacy methods for backward compatibility (used by backend services)
  // ============================================================================

  /**
   * Load all features for a project (legacy API)
   * Features are stored in .automaker/features/{id}/feature.json
   */
  async loadFeatures(projectPath) {
    return await this.getAll(projectPath);
  }

  /**
   * Update feature status (legacy API)
   * Features are stored in .automaker/features/{id}/feature.json
   * Creates the feature if it doesn't exist.
   * @param {string} featureId - The ID of the feature to update
   * @param {string} status - The new status
   * @param {string} projectPath - Path to the project
   * @param {Object} options - Options object for optional parameters
   * @param {string} [options.summary] - Optional summary of what was done
   * @param {string} [options.error] - Optional error message if feature errored
   * @param {string} [options.description] - Optional detailed description
   * @param {string} [options.category] - Optional category/phase
   * @param {string[]} [options.steps] - Optional array of implementation steps
   */
  async updateFeatureStatus(featureId, status, projectPath, options = {}) {
    const { summary, error, description, category, steps } = options;
    // Check if feature exists
    const existingFeature = await this.get(projectPath, featureId);
    
    if (!existingFeature) {
      // Feature doesn't exist - create it with all required fields
      console.log(`[FeatureLoader] Feature ${featureId} not found - creating new feature`);
      const newFeature = {
        id: featureId,
        title: featureId.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
        description: description || summary || '', // Use provided description, fall back to summary
        category: category || "Uncategorized",
        steps: steps || [],
        status: status,
        images: [],
        imagePaths: [],
        skipTests: false, // Auto-generated features should run tests by default
        model: "sonnet",
        thinkingLevel: "none",
        summary: summary || description || '',
        createdAt: new Date().toISOString(),
      };
      if (error !== undefined) {
        newFeature.error = error;
      }
      await this.create(projectPath, newFeature);
      console.log(
        `[FeatureLoader] Created feature ${featureId}: status=${status}, category=${category || "Uncategorized"}, steps=${steps?.length || 0}${
          summary ? `, summary="${summary}"` : ""
        }`
      );
      return;
    }

    // Feature exists - update it
    const updates = { status };
    if (summary !== undefined) {
      updates.summary = summary;
      // Also update description if it's empty or not set
      if (!existingFeature.description) {
        updates.description = summary;
      }
    }
    if (description !== undefined) {
      updates.description = description;
    }
    if (category !== undefined) {
      updates.category = category;
    }
    if (steps !== undefined && Array.isArray(steps)) {
      updates.steps = steps;
    }
    if (error !== undefined) {
      updates.error = error;
    } else {
      // Clear error if not provided
      if (existingFeature.error) {
        updates.error = undefined;
      }
    }
    
    // Ensure required fields exist (for features created before this fix)
    if (!existingFeature.category && !updates.category) updates.category = "Uncategorized";
    if (!existingFeature.steps && !updates.steps) updates.steps = [];
    if (!existingFeature.images) updates.images = [];
    if (!existingFeature.imagePaths) updates.imagePaths = [];
    if (existingFeature.skipTests === undefined) updates.skipTests = false;
    if (!existingFeature.model) updates.model = "sonnet";
    if (!existingFeature.thinkingLevel) updates.thinkingLevel = "none";

    await this.update(projectPath, featureId, updates);
    console.log(
      `[FeatureLoader] Updated feature ${featureId}: status=${status}${
        category ? `, category="${category}"` : ""
      }${steps ? `, steps=${steps.length}` : ""}${
        summary ? `, summary="${summary}"` : ""
      }`
    );
  }

  /**
   * Select the next feature to implement
   * Prioritizes: earlier features in the list that are not verified or waiting_approval
   */
  selectNextFeature(features) {
    // Find first feature that is in backlog or in_progress status
    // Skip verified and waiting_approval (which needs user input)
    return features.find(
      (f) => f.status !== "verified" && f.status !== "waiting_approval"
    );
  }

  /**
   * Update worktree info for a feature (legacy API)
   * Features are stored in .automaker/features/{id}/feature.json
   * @param {string} featureId - The ID of the feature to update
   * @param {string} projectPath - Path to the project
   * @param {string|null} worktreePath - Path to the worktree (null to clear)
   * @param {string|null} branchName - Name of the feature branch (null to clear)
   */
  async updateFeatureWorktree(
    featureId,
    projectPath,
    worktreePath,
    branchName
  ) {
    const updates = {};
    if (worktreePath) {
      updates.worktreePath = worktreePath;
      updates.branchName = branchName;
    } else {
      updates.worktreePath = null;
      updates.branchName = null;
    }

    await this.update(projectPath, featureId, updates);
    console.log(
      `[FeatureLoader] Updated feature ${featureId}: worktreePath=${worktreePath}, branchName=${branchName}`
    );
  }
}

module.exports = new FeatureLoader();
