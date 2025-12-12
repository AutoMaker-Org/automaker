const featureLoader = require("./services/feature-loader");
const featureExecutor = require("./services/feature-executor");
const featureVerifier = require("./services/feature-verifier");
const contextManager = require("./services/context-manager");
const projectAnalyzer = require("./services/project-analyzer");
const worktreeManager = require("./services/worktree-manager");

/**
 * Auto Mode Service - Autonomous feature implementation
 * Automatically picks and implements features from the kanban board
 *
 * This service acts as the main orchestrator, delegating work to specialized services:
 * - featureLoader: Loading and selecting features
 * - featureExecutor: Implementing features
 * - featureVerifier: Running tests and verification
 * - contextManager: Managing context files
 * - projectAnalyzer: Analyzing project structure
 */
class AutoModeService {
  constructor() {
    // Track multiple concurrent feature executions
    this.runningFeatures = new Map(); // featureId -> { abortController, query, projectPath, sendToRenderer }

    // Per-project auto loop state (keyed by projectPath)
    this.projectLoops = new Map(); // projectPath -> { isRunning, interval, abortController, sendToRenderer, maxConcurrency }

    this.checkIntervalMs = 5000; // Check every 5 seconds
    this.maxConcurrency = 3; // Default max concurrency (global default)
  }

  /**
   * Get or create project loop state
   */
  getProjectLoopState(projectPath) {
    if (!this.projectLoops.has(projectPath)) {
      this.projectLoops.set(projectPath, {
        isRunning: false,
        interval: null,
        abortController: null,
        sendToRenderer: null,
        maxConcurrency: this.maxConcurrency,
      });
    }
    return this.projectLoops.get(projectPath);
  }

  /**
   * Check if any project has auto mode running
   */
  hasAnyAutoLoopRunning() {
    for (const [, state] of this.projectLoops) {
      if (state.isRunning) return true;
    }
    return false;
  }

  /**
   * Get running features for a specific project
   */
  getRunningFeaturesForProject(projectPath) {
    const features = [];
    for (const [featureId, execution] of this.runningFeatures) {
      if (execution.projectPath === projectPath) {
        features.push(featureId);
      }
    }
    return features;
  }

  /**
   * Count running features for a specific project
   */
  getRunningCountForProject(projectPath) {
    let count = 0;
    for (const [, execution] of this.runningFeatures) {
      if (execution.projectPath === projectPath) {
        count++;
      }
    }
    return count;
  }

  /**
   * Helper to create execution context with isActive check
   */
  createExecutionContext(featureId) {
    const context = {
      abortController: null,
      query: null,
      projectPath: null, // Original project path
      worktreePath: null, // Path to worktree (where agent works)
      branchName: null, // Feature branch name
      sendToRenderer: null,
      isActive: () => this.runningFeatures.has(featureId),
    };
    return context;
  }

  /**
   * Helper to emit event with projectPath included
   */
  emitEvent(projectPath, sendToRenderer, event) {
    if (sendToRenderer) {
      sendToRenderer({
        ...event,
        projectPath,
      });
    }
  }

  /**
   * Setup worktree for a feature
   * Creates an isolated git worktree where the agent can work
   * @param {Object} feature - The feature object
   * @param {string} projectPath - Path to the project
   * @param {Function} sendToRenderer - Function to send events to the renderer
   * @param {boolean} useWorktreesEnabled - Whether worktrees are enabled in settings (default: false)
   */
  async setupWorktreeForFeature(feature, projectPath, sendToRenderer, useWorktreesEnabled = false) {
    // If worktrees are disabled in settings, skip entirely
    if (!useWorktreesEnabled) {
      console.log(`[AutoMode] Worktrees disabled in settings, working directly on main project`);
      return { useWorktree: false, workPath: projectPath };
    }

    // Check if worktrees are enabled (project must be a git repo)
    const isGit = await worktreeManager.isGitRepo(projectPath);
    if (!isGit) {
      console.log(`[AutoMode] Project is not a git repo, skipping worktree creation`);
      return { useWorktree: false, workPath: projectPath };
    }

    this.emitEvent(projectPath, sendToRenderer, {
      type: "auto_mode_progress",
      featureId: feature.id,
      content: "Creating isolated worktree for feature...\n",
    });

    const result = await worktreeManager.createWorktree(projectPath, feature);

    if (!result.success) {
      console.warn(`[AutoMode] Failed to create worktree: ${result.error}. Falling back to main project.`);
      this.emitEvent(projectPath, sendToRenderer, {
        type: "auto_mode_progress",
        featureId: feature.id,
        content: `Warning: Could not create worktree (${result.error}). Working directly on main project.\n`,
      });
      return { useWorktree: false, workPath: projectPath };
    }

    console.log(`[AutoMode] Created worktree at: ${result.worktreePath}, branch: ${result.branchName}`);
    this.emitEvent(projectPath, sendToRenderer, {
      type: "auto_mode_progress",
      featureId: feature.id,
      content: `Working in isolated branch: ${result.branchName}\n`,
    });

    // Update feature with worktree info
    await featureLoader.updateFeatureWorktree(
      feature.id,
      projectPath,
      result.worktreePath,
      result.branchName
    );

    return {
      useWorktree: true,
      workPath: result.worktreePath,
      branchName: result.branchName,
      baseBranch: result.baseBranch,
    };
  }

  /**
   * Start auto mode for a specific project - continuously implement features
   * Each project can have its own independent auto mode loop
   */
  async start({ projectPath, sendToRenderer, maxConcurrency }) {
    const projectState = this.getProjectLoopState(projectPath);

    if (projectState.isRunning) {
      throw new Error(`Auto mode loop is already running for project: ${projectPath}`);
    }

    projectState.isRunning = true;
    projectState.maxConcurrency = maxConcurrency || 3;
    projectState.sendToRenderer = sendToRenderer;

    console.log(
      `[AutoMode] Starting auto mode for project: ${projectPath} with max concurrency: ${projectState.maxConcurrency}`
    );

    // Start the periodic checking loop for this project
    this.runPeriodicLoopForProject(projectPath);

    return { success: true };
  }

  /**
   * Stop auto mode for a specific project - stops the auto loop but lets running features complete
   * This only turns off the auto toggle to prevent picking up new features.
   * Running tasks will continue until they complete naturally.
   */
  async stop({ projectPath }) {
    console.log(`[AutoMode] Stopping auto mode for project: ${projectPath} (letting running features complete)`);

    const projectState = this.projectLoops.get(projectPath);
    if (!projectState) {
      console.log(`[AutoMode] No auto mode state found for project: ${projectPath}`);
      return { success: true, runningFeatures: 0 };
    }

    projectState.isRunning = false;

    // Clear the interval timer for this project
    if (projectState.interval) {
      clearInterval(projectState.interval);
      projectState.interval = null;
    }

    // Abort auto loop if running
    if (projectState.abortController) {
      projectState.abortController.abort();
      projectState.abortController = null;
    }

    // NOTE: We intentionally do NOT abort running features here.
    // Stopping auto mode should only turn off the toggle to prevent new features
    // from being picked up. Running features will complete naturally.
    // Use stopFeature() to cancel a specific running feature if needed.

    const runningCount = this.getRunningCountForProject(projectPath);
    console.log(`[AutoMode] Auto loop stopped for ${projectPath}. ${runningCount} feature(s) still running and will complete.`);

    return { success: true, runningFeatures: runningCount };
  }

  /**
   * Get status of auto mode (global and per-project)
   */
  getStatus({ projectPath } = {}) {
    // If projectPath is specified, return status for that project
    if (projectPath) {
      const projectState = this.projectLoops.get(projectPath);
      return {
        autoLoopRunning: projectState?.isRunning || false,
        runningFeatures: this.getRunningFeaturesForProject(projectPath),
        runningCount: this.getRunningCountForProject(projectPath),
      };
    }

    // Otherwise return global status
    const allRunningProjects = [];
    for (const [path, state] of this.projectLoops) {
      if (state.isRunning) {
        allRunningProjects.push(path);
      }
    }

    return {
      autoLoopRunning: this.hasAnyAutoLoopRunning(),
      runningProjects: allRunningProjects,
      runningFeatures: Array.from(this.runningFeatures.keys()),
      runningCount: this.runningFeatures.size,
    };
  }

  /**
   * Get status for all projects with auto mode
   */
  getAllProjectStatuses() {
    const statuses = {};
    for (const [projectPath, state] of this.projectLoops) {
      statuses[projectPath] = {
        isRunning: state.isRunning,
        runningFeatures: this.getRunningFeaturesForProject(projectPath),
        runningCount: this.getRunningCountForProject(projectPath),
        maxConcurrency: state.maxConcurrency,
      };
    }
    return statuses;
  }

  /**
   * Run a specific feature by ID
   * @param {string} projectPath - Path to the project
   * @param {string} featureId - ID of the feature to run
   * @param {Function} sendToRenderer - Function to send events to renderer
   * @param {boolean} useWorktrees - Whether to use git worktree isolation (default: false)
   */
  async runFeature({ projectPath, featureId, sendToRenderer, useWorktrees = false }) {
    // Check if this specific feature is already running
    if (this.runningFeatures.has(featureId)) {
      throw new Error(`Feature ${featureId} is already running`);
    }

    console.log(`[AutoMode] Running specific feature: ${featureId} (worktrees: ${useWorktrees})`);

    // Register this feature as running
    const execution = this.createExecutionContext(featureId);
    execution.projectPath = projectPath;
    execution.sendToRenderer = sendToRenderer;
    this.runningFeatures.set(featureId, execution);

    try {
      // Load features
      const features = await featureLoader.loadFeatures(projectPath);
      const feature = features.find((f) => f.id === featureId);

      if (!feature) {
        throw new Error(`Feature ${featureId} not found`);
      }

      console.log(`[AutoMode] Running feature: ${feature.description}`);

      // Setup worktree for isolated work (if enabled)
      const worktreeSetup = await this.setupWorktreeForFeature(feature, projectPath, sendToRenderer, useWorktrees);
      execution.worktreePath = worktreeSetup.workPath;
      execution.branchName = worktreeSetup.branchName;

      // Determine working path (worktree or main project)
      const workPath = worktreeSetup.workPath;

      // Update feature status to in_progress
      await featureLoader.updateFeatureStatus(
        featureId,
        "in_progress",
        projectPath
      );

      this.emitEvent(projectPath, sendToRenderer, {
        type: "auto_mode_feature_start",
        featureId: feature.id,
        feature: { ...feature, worktreePath: worktreeSetup.workPath, branchName: worktreeSetup.branchName },
      });

      // Implement the feature (agent works in worktree)
      const result = await featureExecutor.implementFeature(
        feature,
        workPath, // Use worktree path instead of main project
        sendToRenderer,
        execution
      );

      // Update feature status based on result
      // For skipTests features, go to waiting_approval on success instead of verified
      // On failure, ALL features go to waiting_approval so user can review and decide next steps
      // This prevents infinite retry loops when the same issue keeps failing
      let newStatus;
      if (result.passes) {
        newStatus = feature.skipTests ? "waiting_approval" : "verified";
      } else {
        // On failure, go to waiting_approval for user review
        // Don't automatically move back to backlog to avoid infinite retry loops
        // (especially when hitting rate limits or persistent errors)
        newStatus = "waiting_approval";
      }
      await featureLoader.updateFeatureStatus(
        feature.id,
        newStatus,
        projectPath
      );

      // Keep context file for viewing output later (deleted only when card is removed)

      this.emitEvent(projectPath, sendToRenderer, {
        type: "auto_mode_feature_complete",
        featureId: feature.id,
        passes: result.passes,
        message: result.message,
      });

      return { success: true, passes: result.passes };
    } catch (error) {
      console.error("[AutoMode] Error running feature:", error);

      // Write error to context file
      try {
        await contextManager.writeToContextFile(
          projectPath,
          featureId,
          `\n\n❌ ERROR: ${error.message}\n\n${error.stack || ''}\n`
        );
      } catch (contextError) {
        console.error("[AutoMode] Failed to write error to context:", contextError);
      }

      // Update feature status to waiting_approval so user can review the error
      try {
        await featureLoader.updateFeatureStatus(
          featureId,
          "waiting_approval",
          projectPath,
          { error: error.message }
        );
      } catch (statusError) {
        console.error("[AutoMode] Failed to update feature status after error:", statusError);
      }

      this.emitEvent(projectPath, sendToRenderer, {
        type: "auto_mode_error",
        error: error.message,
        featureId: featureId,
      });
      throw error;
    } finally {
      // Clean up this feature's execution
      this.runningFeatures.delete(featureId);
    }
  }

  /**
   * Verify a specific feature by running its tests
   */
  async verifyFeature({ projectPath, featureId, sendToRenderer }) {
    console.log(`[AutoMode] verifyFeature called with:`, {
      projectPath,
      featureId,
    });

    // Check if this specific feature is already running
    if (this.runningFeatures.has(featureId)) {
      throw new Error(`Feature ${featureId} is already running`);
    }

    console.log(`[AutoMode] Verifying feature: ${featureId}`);

    // Register this feature as running
    const execution = this.createExecutionContext(featureId);
    execution.projectPath = projectPath;
    execution.sendToRenderer = sendToRenderer;
    this.runningFeatures.set(featureId, execution);

    try {
      // Load features
      const features = await featureLoader.loadFeatures(projectPath);
      const feature = features.find((f) => f.id === featureId);

      if (!feature) {
        throw new Error(`Feature ${featureId} not found`);
      }

      console.log(`[AutoMode] Verifying feature: ${feature.description}`);

      this.emitEvent(projectPath, sendToRenderer, {
        type: "auto_mode_feature_start",
        featureId: feature.id,
        feature: feature,
      });

      // Verify the feature by running tests
      const result = await featureVerifier.verifyFeatureTests(
        feature,
        projectPath,
        sendToRenderer,
        execution
      );

      // Update feature status based on result
      const newStatus = result.passes ? "verified" : "in_progress";
      await featureLoader.updateFeatureStatus(
        featureId,
        newStatus,
        projectPath
      );

      // Keep context file for viewing output later (deleted only when card is removed)

      this.emitEvent(projectPath, sendToRenderer, {
        type: "auto_mode_feature_complete",
        featureId: feature.id,
        passes: result.passes,
        message: result.message,
      });

      return { success: true, passes: result.passes };
    } catch (error) {
      console.error("[AutoMode] Error verifying feature:", error);

      // Write error to context file
      try {
        await contextManager.writeToContextFile(
          projectPath,
          featureId,
          `\n\n❌ ERROR: ${error.message}\n\n${error.stack || ''}\n`
        );
      } catch (contextError) {
        console.error("[AutoMode] Failed to write error to context:", contextError);
      }

      // Update feature status to waiting_approval so user can review the error
      try {
        await featureLoader.updateFeatureStatus(
          featureId,
          "waiting_approval",
          projectPath,
          { error: error.message }
        );
      } catch (statusError) {
        console.error("[AutoMode] Failed to update feature status after error:", statusError);
      }

      this.emitEvent(projectPath, sendToRenderer, {
        type: "auto_mode_error",
        error: error.message,
        featureId: featureId,
      });
      throw error;
    } finally {
      // Clean up this feature's execution
      this.runningFeatures.delete(featureId);
    }
  }

  /**
   * Resume a feature that has previous context - loads existing context and continues implementation
   */
  async resumeFeature({ projectPath, featureId, sendToRenderer }) {
    console.log(`[AutoMode] resumeFeature called with:`, {
      projectPath,
      featureId,
    });

    // Check if this specific feature is already running
    if (this.runningFeatures.has(featureId)) {
      throw new Error(`Feature ${featureId} is already running`);
    }

    console.log(`[AutoMode] Resuming feature: ${featureId}`);

    // Register this feature as running
    const execution = this.createExecutionContext(featureId);
    execution.projectPath = projectPath;
    execution.sendToRenderer = sendToRenderer;
    this.runningFeatures.set(featureId, execution);

    try {
      // Load features
      const features = await featureLoader.loadFeatures(projectPath);
      const feature = features.find((f) => f.id === featureId);

      if (!feature) {
        throw new Error(`Feature ${featureId} not found`);
      }

      console.log(`[AutoMode] Resuming feature: ${feature.description}`);

      this.emitEvent(projectPath, sendToRenderer, {
        type: "auto_mode_feature_start",
        featureId: feature.id,
        feature: feature,
      });

      // Read existing context
      const previousContext = await contextManager.readContextFile(
        projectPath,
        featureId
      );

      // Resume implementation with context
      const result = await featureExecutor.resumeFeatureWithContext(
        feature,
        projectPath,
        sendToRenderer,
        previousContext,
        execution
      );

      // If the agent ends early without finishing, automatically re-run
      let attempts = 0;
      const maxAttempts = 3;
      let finalResult = result;

      while (!finalResult.passes && attempts < maxAttempts) {
        // Check if feature is still in progress (not verified)
        const updatedFeatures = await featureLoader.loadFeatures(projectPath);
        const updatedFeature = updatedFeatures.find((f) => f.id === featureId);

        if (updatedFeature && updatedFeature.status === "in_progress") {
          attempts++;
          console.log(
            `[AutoMode] Feature ended early, auto-retrying (attempt ${attempts}/${maxAttempts})...`
          );

          // Update context file with retry message
          await contextManager.writeToContextFile(
            projectPath,
            featureId,
            `\n\n🔄 Auto-retry #${attempts} - Continuing implementation...\n\n`
          );

          this.emitEvent(projectPath, sendToRenderer, {
            type: "auto_mode_progress",
            featureId: feature.id,
            content: `\n🔄 Auto-retry #${attempts} - Agent ended early, continuing...\n`,
          });

          // Read updated context
          const retryContext = await contextManager.readContextFile(
            projectPath,
            featureId
          );

          // Resume again with full context
          finalResult = await featureExecutor.resumeFeatureWithContext(
            feature,
            projectPath,
            sendToRenderer,
            retryContext,
            execution
          );
        } else {
          break;
        }
      }

      // Update feature status based on final result
      // For skipTests features, go to waiting_approval on success instead of verified
      // On failure, go to waiting_approval so user can review and decide next steps
      let newStatus;
      if (finalResult.passes) {
        newStatus = feature.skipTests ? "waiting_approval" : "verified";
      } else {
        // On failure after all retry attempts, go to waiting_approval for user review
        newStatus = "waiting_approval";
      }
      await featureLoader.updateFeatureStatus(
        featureId,
        newStatus,
        projectPath
      );

      // Keep context file for viewing output later (deleted only when card is removed)

      this.emitEvent(projectPath, sendToRenderer, {
        type: "auto_mode_feature_complete",
        featureId: feature.id,
        passes: finalResult.passes,
        message: finalResult.message,
      });

      return { success: true, passes: finalResult.passes };
    } catch (error) {
      console.error("[AutoMode] Error resuming feature:", error);

      // Write error to context file
      try {
        await contextManager.writeToContextFile(
          projectPath,
          featureId,
          `\n\n❌ ERROR: ${error.message}\n\n${error.stack || ''}\n`
        );
      } catch (contextError) {
        console.error("[AutoMode] Failed to write error to context:", contextError);
      }

      // Update feature status to waiting_approval so user can review the error
      try {
        await featureLoader.updateFeatureStatus(
          featureId,
          "waiting_approval",
          projectPath,
          { error: error.message }
        );
      } catch (statusError) {
        console.error("[AutoMode] Failed to update feature status after error:", statusError);
      }

      this.emitEvent(projectPath, sendToRenderer, {
        type: "auto_mode_error",
        error: error.message,
        featureId: featureId,
      });
      throw error;
    } finally {
      // Clean up this feature's execution
      this.runningFeatures.delete(featureId);
    }
  }

  /**
   * New periodic loop for a specific project - checks available slots and starts features up to max concurrency
   * This loop continues running even if there are no backlog items
   */
  runPeriodicLoopForProject(projectPath) {
    const projectState = this.getProjectLoopState(projectPath);

    console.log(
      `[AutoMode] Starting periodic loop for ${projectPath} with interval: ${this.checkIntervalMs}ms`
    );

    // Initial check immediately
    this.checkAndStartFeaturesForProject(projectPath);

    // Then check periodically
    projectState.interval = setInterval(() => {
      if (projectState.isRunning) {
        this.checkAndStartFeaturesForProject(projectPath);
      }
    }, this.checkIntervalMs);
  }

  /**
   * Check how many features are running for a specific project and start new ones if under max concurrency
   */
  async checkAndStartFeaturesForProject(projectPath) {
    const projectState = this.projectLoops.get(projectPath);
    if (!projectState || !projectState.isRunning) {
      return;
    }

    const sendToRenderer = projectState.sendToRenderer;
    const maxConcurrency = projectState.maxConcurrency;

    try {
      // Check how many are currently running FOR THIS PROJECT
      const currentRunningCount = this.getRunningCountForProject(projectPath);

      console.log(
        `[AutoMode] [${projectPath}] Checking features - Running: ${currentRunningCount}/${maxConcurrency}`
      );

      // Calculate available slots for this project
      const availableSlots = maxConcurrency - currentRunningCount;

      if (availableSlots <= 0) {
        console.log(`[AutoMode] [${projectPath}] At max concurrency, waiting...`);
        return;
      }

      // Load features from backlog
      const features = await featureLoader.loadFeatures(projectPath);
      const backlogFeatures = features.filter((f) => f.status === "backlog");

      if (backlogFeatures.length === 0) {
        console.log(`[AutoMode] [${projectPath}] No backlog features available, waiting...`);
        return;
      }

      // Grab up to availableSlots features from backlog
      const featuresToStart = backlogFeatures.slice(0, availableSlots);

      console.log(
        `[AutoMode] [${projectPath}] Starting ${featuresToStart.length} feature(s) from backlog`
      );

      // Start each feature (don't await - run in parallel like drag operations)
      for (const feature of featuresToStart) {
        this.startFeatureAsync(feature, projectPath, sendToRenderer);
      }
    } catch (error) {
      console.error(`[AutoMode] [${projectPath}] Error checking/starting features:`, error);
    }
  }

  /**
   * Start a feature asynchronously (similar to drag operation)
   * @param {Object} feature - The feature to start
   * @param {string} projectPath - Path to the project
   * @param {Function} sendToRenderer - Function to send events to renderer
   * @param {boolean} useWorktrees - Whether to use git worktree isolation (default: false)
   */
  async startFeatureAsync(feature, projectPath, sendToRenderer, useWorktrees = false) {
    const featureId = feature.id;

    // Skip if already running
    if (this.runningFeatures.has(featureId)) {
      console.log(`[AutoMode] Feature ${featureId} already running, skipping`);
      return;
    }

    try {
      console.log(
        `[AutoMode] Starting feature: ${feature.description.slice(0, 50)}... (worktrees: ${useWorktrees})`
      );

      // Register this feature as running
      const execution = this.createExecutionContext(featureId);
      execution.projectPath = projectPath;
      execution.sendToRenderer = sendToRenderer;
      this.runningFeatures.set(featureId, execution);

      // Setup worktree for isolated work (if enabled)
      const worktreeSetup = await this.setupWorktreeForFeature(feature, projectPath, sendToRenderer, useWorktrees);
      execution.worktreePath = worktreeSetup.workPath;
      execution.branchName = worktreeSetup.branchName;

      // Determine working path (worktree or main project)
      const workPath = worktreeSetup.workPath;

      // Update status to in_progress with timestamp
      await featureLoader.updateFeatureStatus(
        featureId,
        "in_progress",
        projectPath
      );

      this.emitEvent(projectPath, sendToRenderer, {
        type: "auto_mode_feature_start",
        featureId: feature.id,
        feature: { ...feature, worktreePath: worktreeSetup.workPath, branchName: worktreeSetup.branchName },
      });

      // Implement the feature (agent works in worktree)
      const result = await featureExecutor.implementFeature(
        feature,
        workPath, // Use worktree path instead of main project
        sendToRenderer,
        execution
      );

      // Update feature status based on result
      // For skipTests features, go to waiting_approval on success instead of verified
      // On failure, ALL features go to waiting_approval so user can review and decide next steps
      // This prevents infinite retry loops when the same issue keeps failing
      let newStatus;
      if (result.passes) {
        newStatus = feature.skipTests ? "waiting_approval" : "verified";
      } else {
        // On failure, go to waiting_approval for user review
        // Don't automatically move back to backlog to avoid infinite retry loops
        // (especially when hitting rate limits or persistent errors)
        newStatus = "waiting_approval";
      }
      await featureLoader.updateFeatureStatus(
        feature.id,
        newStatus,
        projectPath
      );

      // Keep context file for viewing output later (deleted only when card is removed)

      this.emitEvent(projectPath, sendToRenderer, {
        type: "auto_mode_feature_complete",
        featureId: feature.id,
        passes: result.passes,
        message: result.message,
      });
    } catch (error) {
      console.error(`[AutoMode] Error running feature ${featureId}:`, error);

      // Write error to context file
      try {
        await contextManager.writeToContextFile(
          projectPath,
          featureId,
          `\n\n❌ ERROR: ${error.message}\n\n${error.stack || ''}\n`
        );
      } catch (contextError) {
        console.error("[AutoMode] Failed to write error to context:", contextError);
      }

      // Update feature status to waiting_approval so user can review the error
      try {
        await featureLoader.updateFeatureStatus(
          featureId,
          "waiting_approval",
          projectPath,
          { error: error.message }
        );
      } catch (statusError) {
        console.error("[AutoMode] Failed to update feature status after error:", statusError);
      }

      this.emitEvent(projectPath, sendToRenderer, {
        type: "auto_mode_error",
        error: error.message,
        featureId: featureId,
      });
    } finally {
      // Clean up this feature's execution
      this.runningFeatures.delete(featureId);
    }
  }

  /**
   * Analyze a new project - scans codebase and updates app_spec.txt
   * This is triggered when opening a project for the first time
   */
  async analyzeProject({ projectPath, sendToRenderer }) {
    console.log(`[AutoMode] Analyzing project at: ${projectPath}`);

    const analysisId = `project-analysis-${Date.now()}`;

    // Check if already analyzing this project
    if (this.runningFeatures.has(analysisId)) {
      throw new Error("Project analysis is already running");
    }

    // Register as running
    const execution = this.createExecutionContext(analysisId);
    execution.projectPath = projectPath;
    execution.sendToRenderer = sendToRenderer;
    this.runningFeatures.set(analysisId, execution);

    try {
      this.emitEvent(projectPath, sendToRenderer, {
        type: "auto_mode_feature_start",
        featureId: analysisId,
        feature: {
          id: analysisId,
          category: "Project Analysis",
          description: "Analyzing project structure and tech stack",
        },
      });

      // Perform the analysis
      const result = await projectAnalyzer.runProjectAnalysis(
        projectPath,
        analysisId,
        sendToRenderer,
        execution
      );

      this.emitEvent(projectPath, sendToRenderer, {
        type: "auto_mode_feature_complete",
        featureId: analysisId,
        passes: result.success,
        message: result.message,
      });

      return { success: true, message: result.message };
    } catch (error) {
      console.error("[AutoMode] Error analyzing project:", error);
      this.emitEvent(projectPath, sendToRenderer, {
        type: "auto_mode_error",
        error: error.message,
        featureId: analysisId,
      });
      throw error;
    } finally {
      this.runningFeatures.delete(analysisId);
    }
  }

  /**
   * Stop a specific feature by ID
   */
  async stopFeature({ featureId }) {
    if (!this.runningFeatures.has(featureId)) {
      return { success: false, error: `Feature ${featureId} is not running` };
    }

    console.log(`[AutoMode] Stopping feature: ${featureId}`);

    const execution = this.runningFeatures.get(featureId);
    if (execution && execution.abortController) {
      execution.abortController.abort();
    }

    // Clean up
    this.runningFeatures.delete(featureId);

    return { success: true };
  }

  /**
   * Follow-up on a feature with additional prompt
   * This continues work on a feature that's in waiting_approval status
   */
  async followUpFeature({
    projectPath,
    featureId,
    prompt,
    imagePaths,
    sendToRenderer,
  }) {
    // Check if this feature is already running
    if (this.runningFeatures.has(featureId)) {
      throw new Error(`Feature ${featureId} is already running`);
    }

    console.log(
      `[AutoMode] Follow-up on feature: ${featureId} with prompt: ${prompt}`
    );

    // Register this feature as running
    const execution = this.createExecutionContext(featureId);
    execution.projectPath = projectPath;
    execution.sendToRenderer = sendToRenderer;
    this.runningFeatures.set(featureId, execution);

    // Start the async work in the background (don't await)
    // This allows the API to return immediately so the modal can close
    this.runFollowUpWork({
      projectPath,
      featureId,
      prompt,
      imagePaths,
      sendToRenderer,
      execution,
    }).catch((error) => {
      console.error("[AutoMode] Follow-up work error:", error);
      this.runningFeatures.delete(featureId);
    });

    // Return immediately so the frontend can close the modal
    return { success: true };
  }

  /**
   * Internal method to run follow-up work asynchronously
   */
  async runFollowUpWork({
    projectPath,
    featureId,
    prompt,
    imagePaths,
    sendToRenderer,
    execution,
  }) {
    try {
      // Load features
      const features = await featureLoader.loadFeatures(projectPath);
      const feature = features.find((f) => f.id === featureId);

      if (!feature) {
        throw new Error(`Feature ${featureId} not found`);
      }

      console.log(`[AutoMode] Following up on feature: ${feature.description}`);

      // Update status to in_progress
      await featureLoader.updateFeatureStatus(
        featureId,
        "in_progress",
        projectPath
      );

      this.emitEvent(projectPath, sendToRenderer, {
        type: "auto_mode_feature_start",
        featureId: feature.id,
        feature: feature,
      });

      // Read existing context and append follow-up prompt
      const previousContext = await contextManager.readContextFile(
        projectPath,
        featureId
      );

      // Append follow-up prompt to context
      const followUpContext = `${previousContext}\n\n## Follow-up Instructions\n\n${prompt}`;
      await contextManager.writeToContextFile(
        projectPath,
        featureId,
        `\n\n## Follow-up Instructions\n\n${prompt}`
      );

      // Resume implementation with follow-up context and optional images
      const result = await featureExecutor.resumeFeatureWithContext(
        { ...feature, followUpPrompt: prompt, followUpImages: imagePaths },
        projectPath,
        sendToRenderer,
        followUpContext,
        execution
      );

      // For skipTests features, go to waiting_approval on success instead of verified
      // On failure, go to waiting_approval so user can review and decide next steps
      const newStatus = result.passes
        ? feature.skipTests
          ? "waiting_approval"
          : "verified"
        : "waiting_approval";

      await featureLoader.updateFeatureStatus(
        feature.id,
        newStatus,
        projectPath
      );

      // Keep context file for viewing output later (deleted only when card is removed)

      this.emitEvent(projectPath, sendToRenderer, {
        type: "auto_mode_feature_complete",
        featureId: feature.id,
        passes: result.passes,
        message: result.message,
      });
    } catch (error) {
      console.error("[AutoMode] Error in follow-up:", error);

      // Write error to context file
      try {
        await contextManager.writeToContextFile(
          projectPath,
          featureId,
          `\n\n❌ ERROR: ${error.message}\n\n${error.stack || ''}\n`
        );
      } catch (contextError) {
        console.error("[AutoMode] Failed to write error to context:", contextError);
      }

      // Update feature status to waiting_approval so user can review the error
      try {
        await featureLoader.updateFeatureStatus(
          featureId,
          "waiting_approval",
          projectPath,
          { error: error.message }
        );
      } catch (statusError) {
        console.error("[AutoMode] Failed to update feature status after error:", statusError);
      }

      this.emitEvent(projectPath, sendToRenderer, {
        type: "auto_mode_error",
        error: error.message,
        featureId: featureId,
      });
    } finally {
      this.runningFeatures.delete(featureId);
    }
  }

  /**
   * Commit changes for a feature without doing additional work
   * This marks the feature as verified and commits the changes
   */
  async commitFeature({ projectPath, featureId, sendToRenderer }) {
    console.log(`[AutoMode] Committing feature: ${featureId}`);

    // Register briefly as running for the commit operation
    const execution = this.createExecutionContext(featureId);
    execution.projectPath = projectPath;
    execution.sendToRenderer = sendToRenderer;
    this.runningFeatures.set(featureId, execution);

    try {
      // Load feature to get description for commit message
      const features = await featureLoader.loadFeatures(projectPath);
      const feature = features.find((f) => f.id === featureId);

      if (!feature) {
        throw new Error(`Feature ${featureId} not found`);
      }

      this.emitEvent(projectPath, sendToRenderer, {
        type: "auto_mode_feature_start",
        featureId: feature.id,
        feature: { ...feature, description: "Committing changes..." },
      });

      this.emitEvent(projectPath, sendToRenderer, {
        type: "auto_mode_phase",
        featureId,
        phase: "action",
        message: "Committing changes to git...",
      });

      // Run git commit via the agent
      await featureExecutor.commitChangesOnly(
        feature,
        projectPath,
        sendToRenderer,
        execution
      );

      // Update status to verified
      await featureLoader.updateFeatureStatus(
        featureId,
        "verified",
        projectPath
      );

      // Keep context file for viewing output later (deleted only when card is removed)

      this.emitEvent(projectPath, sendToRenderer, {
        type: "auto_mode_feature_complete",
        featureId: feature.id,
        passes: true,
        message: "Changes committed successfully",
      });

      return { success: true };
    } catch (error) {
      console.error("[AutoMode] Error committing feature:", error);
      this.emitEvent(projectPath, sendToRenderer, {
        type: "auto_mode_error",
        error: error.message,
        featureId: featureId,
      });
      throw error;
    } finally {
      this.runningFeatures.delete(featureId);
    }
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Revert feature changes by removing the worktree
   * This effectively discards all changes made by the agent
   */
  async revertFeature({ projectPath, featureId, sendToRenderer }) {
    console.log(`[AutoMode] Reverting feature: ${featureId}`);

    try {
      // Stop the feature if it's running
      if (this.runningFeatures.has(featureId)) {
        await this.stopFeature({ featureId });
      }

      // Remove the worktree and delete the branch
      const result = await worktreeManager.removeWorktree(projectPath, featureId, true);

      if (!result.success) {
        throw new Error(result.error || "Failed to remove worktree");
      }

      // Clear worktree info from feature
      await featureLoader.updateFeatureWorktree(featureId, projectPath, null, null);

      // Update feature status back to backlog
      await featureLoader.updateFeatureStatus(featureId, "backlog", projectPath);

      // Delete context file
      await contextManager.deleteContextFile(projectPath, featureId);

      this.emitEvent(projectPath, sendToRenderer, {
        type: "auto_mode_feature_complete",
        featureId: featureId,
        passes: false,
        message: "Feature reverted - all changes discarded",
      });

      console.log(`[AutoMode] Feature ${featureId} reverted successfully`);
      return { success: true, removedPath: result.removedPath };
    } catch (error) {
      console.error("[AutoMode] Error reverting feature:", error);
      this.emitEvent(projectPath, sendToRenderer, {
        type: "auto_mode_error",
        error: error.message,
        featureId: featureId,
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Merge feature worktree changes back to main branch
   */
  async mergeFeature({ projectPath, featureId, options = {}, sendToRenderer }) {
    console.log(`[AutoMode] Merging feature: ${featureId}`);

    try {
      // Load feature to get worktree info
      const features = await featureLoader.loadFeatures(projectPath);
      const feature = features.find((f) => f.id === featureId);

      if (!feature) {
        throw new Error(`Feature ${featureId} not found`);
      }

      this.emitEvent(projectPath, sendToRenderer, {
        type: "auto_mode_progress",
        featureId: featureId,
        content: "Merging feature branch into main...\n",
      });

      // Merge the worktree
      const result = await worktreeManager.mergeWorktree(projectPath, featureId, {
        ...options,
        cleanup: true, // Remove worktree after successful merge
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to merge worktree");
      }

      // Clear worktree info from feature
      await featureLoader.updateFeatureWorktree(featureId, projectPath, null, null);

      // Update feature status to verified
      await featureLoader.updateFeatureStatus(featureId, "verified", projectPath);

      this.emitEvent(projectPath, sendToRenderer, {
        type: "auto_mode_feature_complete",
        featureId: featureId,
        passes: true,
        message: `Feature merged into ${result.intoBranch}`,
      });

      console.log(`[AutoMode] Feature ${featureId} merged successfully`);
      return { success: true, mergedBranch: result.mergedBranch };
    } catch (error) {
      console.error("[AutoMode] Error merging feature:", error);
      this.emitEvent(projectPath, sendToRenderer, {
        type: "auto_mode_error",
        error: error.message,
        featureId: featureId,
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get worktree info for a feature
   */
  async getWorktreeInfo({ projectPath, featureId }) {
    return await worktreeManager.getWorktreeInfo(projectPath, featureId);
  }

  /**
   * Get worktree status (changed files, commits, etc.)
   */
  async getWorktreeStatus({ projectPath, featureId }) {
    const worktreeInfo = await worktreeManager.getWorktreeInfo(projectPath, featureId);
    if (!worktreeInfo.success) {
      return { success: false, error: "Worktree not found" };
    }
    return await worktreeManager.getWorktreeStatus(worktreeInfo.worktreePath);
  }

  /**
   * List all feature worktrees
   */
  async listWorktrees({ projectPath }) {
    const worktrees = await worktreeManager.getAllFeatureWorktrees(projectPath);
    return { success: true, worktrees };
  }

  /**
   * Get file diffs for a feature worktree
   */
  async getFileDiffs({ projectPath, featureId }) {
    const worktreeInfo = await worktreeManager.getWorktreeInfo(projectPath, featureId);
    if (!worktreeInfo.success) {
      return { success: false, error: "Worktree not found" };
    }
    return await worktreeManager.getFileDiffs(worktreeInfo.worktreePath);
  }

  /**
   * Get diff for a specific file in a feature worktree
   */
  async getFileDiff({ projectPath, featureId, filePath }) {
    const worktreeInfo = await worktreeManager.getWorktreeInfo(projectPath, featureId);
    if (!worktreeInfo.success) {
      return { success: false, error: "Worktree not found" };
    }
    return await worktreeManager.getFileDiff(worktreeInfo.worktreePath, filePath);
  }
}

// Export singleton instance
module.exports = new AutoModeService();
