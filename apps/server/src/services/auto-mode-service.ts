/**
 * Auto Mode Service - Autonomous feature implementation using Claude Agent SDK
 *
 * Manages:
 * - Worktree creation for isolated development
 * - Feature execution with Claude
 * - Concurrent execution with max concurrency limits
 * - Progress streaming via events
 * - Verification and merge workflows
 */

import { ProviderFactory } from "../providers/provider-factory.js";
import type { ExecuteOptions } from "../providers/types.js";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import type { EventEmitter } from "../lib/events.js";
import { buildPromptWithImages } from "../lib/prompt-builder.js";
import { resolveModelString, DEFAULT_MODELS } from "../lib/model-resolver.js";
import { createAutoModeOptions } from "../lib/sdk-options.js";
import { isAbortError, classifyError } from "../lib/error-handler.js";
import { generateTitleFromPrompt } from "./title-generator.js";
import type { FeaturePromptEntry } from "./feature-loader.js";

const execAsync = promisify(exec);

interface Feature {
  id: string;
  category: string;
  description: string;
  title?: string; // AI-generated short title from the prompt
  steps?: string[];
  status: string;
  priority?: number;
  spec?: string;
  model?: string; // Model to use for this feature
  imagePaths?: Array<
    | string
    | {
        path: string;
        filename?: string;
        mimeType?: string;
        [key: string]: unknown;
      }
  >;
  promptHistory?: FeaturePromptEntry[]; // History of all prompts sent for this feature
  updatedAt?: string; // ISO timestamp for when the feature was last updated
}

interface RunningFeature {
  featureId: string;
  projectPath: string;
  worktreePath: string | null;
  branchName: string | null;
  abortController: AbortController;
  isAutoMode: boolean;
  startTime: number;
}

interface AutoModeConfig {
  maxConcurrency: number;
  useWorktrees: boolean;
  projectPath: string;
}

export class AutoModeService {
  private events: EventEmitter;
  private runningFeatures = new Map<string, RunningFeature>();
  private autoLoopRunning = false;
  private autoLoopAbortController: AbortController | null = null;
  private config: AutoModeConfig | null = null;

  constructor(events: EventEmitter) {
    this.events = events;
  }

  /**
   * Start the auto mode loop - continuously picks and executes pending features
   */
  async startAutoLoop(projectPath: string, maxConcurrency = 3): Promise<void> {
    if (this.autoLoopRunning) {
      throw new Error("Auto mode is already running");
    }

    this.autoLoopRunning = true;
    this.autoLoopAbortController = new AbortController();
    this.config = {
      maxConcurrency,
      useWorktrees: true,
      projectPath,
    };

    this.emitAutoModeEvent("auto_mode_started", {
      message: `Auto mode started with max ${maxConcurrency} concurrent features`,
      projectPath,
    });

    // Run the loop in the background
    this.runAutoLoop().catch((error) => {
      console.error("[AutoMode] Loop error:", error);
      this.emitAutoModeEvent("auto_mode_error", {
        error: error.message,
      });
    });
  }

  private async runAutoLoop(): Promise<void> {
    while (
      this.autoLoopRunning &&
      this.autoLoopAbortController &&
      !this.autoLoopAbortController.signal.aborted
    ) {
      try {
        // Check if we have capacity
        if (this.runningFeatures.size >= (this.config?.maxConcurrency || 3)) {
          await this.sleep(5000);
          continue;
        }

        // Load pending features
        const pendingFeatures = await this.loadPendingFeatures(
          this.config!.projectPath
        );

        if (pendingFeatures.length === 0) {
          this.emitAutoModeEvent("auto_mode_idle", {
            message: "No pending features - auto mode idle",
            projectPath: this.config!.projectPath,
          });
          await this.sleep(10000);
          continue;
        }

        // Find a feature not currently running
        const nextFeature = pendingFeatures.find(
          (f) => !this.runningFeatures.has(f.id)
        );

        if (nextFeature) {
          // Start feature execution in background
          this.executeFeature(
            this.config!.projectPath,
            nextFeature.id,
            this.config!.useWorktrees,
            true
          ).catch((error) => {
            console.error(`[AutoMode] Feature ${nextFeature.id} error:`, error);
          });
        }

        await this.sleep(2000);
      } catch (error) {
        console.error("[AutoMode] Loop iteration error:", error);
        await this.sleep(5000);
      }
    }

    this.autoLoopRunning = false;
  }

  /**
   * Stop the auto mode loop
   */
  async stopAutoLoop(): Promise<number> {
    const wasRunning = this.autoLoopRunning;
    this.autoLoopRunning = false;
    if (this.autoLoopAbortController) {
      this.autoLoopAbortController.abort();
      this.autoLoopAbortController = null;
    }

    // Emit stop event immediately when user explicitly stops
    if (wasRunning) {
      this.emitAutoModeEvent("auto_mode_stopped", {
        message: "Auto mode stopped",
        projectPath: this.config?.projectPath,
      });
    }

    return this.runningFeatures.size;
  }

  /**
   * Execute a single feature
   */
  async executeFeature(
    projectPath: string,
    featureId: string,
    useWorktrees = true,
    isAutoMode = false
  ): Promise<void> {
    if (this.runningFeatures.has(featureId)) {
      throw new Error(`Feature ${featureId} is already running`);
    }

    const abortController = new AbortController();
    const branchName = `feature/${featureId}`;
    let worktreePath: string | null = null;

    // Setup worktree if enabled
    if (useWorktrees) {
      worktreePath = await this.setupWorktree(
        projectPath,
        featureId,
        branchName
      );
    }

    const workDir = worktreePath || projectPath;

    this.runningFeatures.set(featureId, {
      featureId,
      projectPath,
      worktreePath,
      branchName,
      abortController,
      isAutoMode,
      startTime: Date.now(),
    });

    // Emit feature start event
    this.emitAutoModeEvent("auto_mode_feature_start", {
      featureId,
      projectPath,
      feature: {
        id: featureId,
        title: "Loading...",
        description: "Feature is starting",
      },
    });

    try {
      // Load feature details
      const feature = await this.loadFeature(projectPath, featureId);
      if (!feature) {
        throw new Error(`Feature ${featureId} not found`);
      }

      // Generate a title from the description if not already set
      if (!feature.title && feature.description) {
        console.log(`[AutoMode] Generating title for feature ${featureId}...`);
        const generatedTitle = await generateTitleFromPrompt(feature.description);
        if (generatedTitle) {
          feature.title = generatedTitle;
          console.log(`[AutoMode] Generated title: "${generatedTitle}"`);
        }
      }

      // Track the initial prompt in prompt history
      const promptEntry: FeaturePromptEntry = {
        prompt: feature.description,
        timestamp: new Date().toISOString(),
        type: "initial",
      };
      feature.promptHistory = feature.promptHistory || [];
      // Only add if this is the first run (no previous entries)
      if (feature.promptHistory.length === 0) {
        feature.promptHistory.push(promptEntry);
      }

      // Update feature status to in_progress and save title + prompt history
      await this.updateFeatureWithTitleAndPrompt(
        projectPath,
        featureId,
        "in_progress",
        feature.title,
        feature.promptHistory
      );

      // Build the prompt
      const prompt = this.buildFeaturePrompt(feature);

      // Extract image paths from feature
      const imagePaths = feature.imagePaths?.map((img) =>
        typeof img === "string" ? img : img.path
      );

      // Get model from feature
      const model = resolveModelString(feature.model, DEFAULT_MODELS.claude);
      console.log(
        `[AutoMode] Executing feature ${featureId} with model: ${model}`
      );

      // Run the agent with the feature's model and images
      await this.runAgent(
        workDir,
        featureId,
        prompt,
        abortController,
        imagePaths,
        model
      );

      // Mark as waiting_approval for user review
      await this.updateFeatureStatus(
        projectPath,
        featureId,
        "waiting_approval"
      );

      this.emitAutoModeEvent("auto_mode_feature_complete", {
        featureId,
        passes: true,
        message: `Feature completed in ${Math.round(
          (Date.now() - this.runningFeatures.get(featureId)!.startTime) / 1000
        )}s`,
        projectPath,
      });
    } catch (error) {
      const errorInfo = classifyError(error);

      if (errorInfo.isAbort) {
        this.emitAutoModeEvent("auto_mode_feature_complete", {
          featureId,
          passes: false,
          message: "Feature stopped by user",
          projectPath,
        });
      } else {
        console.error(`[AutoMode] Feature ${featureId} failed:`, error);
        await this.updateFeatureStatus(projectPath, featureId, "backlog");
        this.emitAutoModeEvent("auto_mode_error", {
          featureId,
          error: errorInfo.message,
          errorType: errorInfo.isAuth ? "authentication" : "execution",
          projectPath,
        });
      }
    } finally {
      this.runningFeatures.delete(featureId);
    }
  }

  /**
   * Stop a specific feature
   */
  async stopFeature(featureId: string): Promise<boolean> {
    const running = this.runningFeatures.get(featureId);
    if (!running) {
      return false;
    }

    running.abortController.abort();
    return true;
  }

  /**
   * Resume a feature (continues from saved context)
   */
  async resumeFeature(
    projectPath: string,
    featureId: string,
    useWorktrees = true
  ): Promise<void> {
    // Check if context exists
    const contextPath = path.join(
      projectPath,
      ".automaker",
      "features",
      featureId,
      "agent-output.md"
    );

    let hasContext = false;
    try {
      await fs.access(contextPath);
      hasContext = true;
    } catch {
      // No context
    }

    if (hasContext) {
      // Load previous context and continue
      const context = await fs.readFile(contextPath, "utf-8");
      return this.executeFeatureWithContext(
        projectPath,
        featureId,
        context,
        useWorktrees
      );
    }

    // No context, start fresh
    return this.executeFeature(projectPath, featureId, useWorktrees, false);
  }

  /**
   * Follow up on a feature with additional instructions
   */
  async followUpFeature(
    projectPath: string,
    featureId: string,
    prompt: string,
    imagePaths?: string[]
  ): Promise<void> {
    if (this.runningFeatures.has(featureId)) {
      throw new Error(`Feature ${featureId} is already running`);
    }

    const abortController = new AbortController();

    // Check if worktree exists
    const worktreePath = path.join(
      projectPath,
      ".automaker",
      "worktrees",
      featureId
    );
    let workDir = projectPath;

    try {
      await fs.access(worktreePath);
      workDir = worktreePath;
    } catch {
      // No worktree, use project path
    }

    // Load feature info for context
    const feature = await this.loadFeature(projectPath, featureId);

    // Load previous agent output if it exists
    const contextPath = path.join(
      projectPath,
      ".automaker",
      "features",
      featureId,
      "agent-output.md"
    );
    let previousContext = "";
    try {
      previousContext = await fs.readFile(contextPath, "utf-8");
    } catch {
      // No previous context
    }

    // Build complete prompt with feature info, previous context, and follow-up instructions
    let fullPrompt = `## Follow-up on Feature Implementation

${feature ? this.buildFeaturePrompt(feature) : `**Feature ID:** ${featureId}`}
`;

    if (previousContext) {
      fullPrompt += `
## Previous Agent Work
The following is the output from the previous implementation attempt:

${previousContext}
`;
    }

    fullPrompt += `
## Follow-up Instructions
${prompt}

## Task
Address the follow-up instructions above. Review the previous work and make the requested changes or fixes.`;

    this.runningFeatures.set(featureId, {
      featureId,
      projectPath,
      worktreePath: workDir !== projectPath ? worktreePath : null,
      branchName: `feature/${featureId}`,
      abortController,
      isAutoMode: false,
      startTime: Date.now(),
    });

    this.emitAutoModeEvent("auto_mode_feature_start", {
      featureId,
      projectPath,
      feature: feature || {
        id: featureId,
        title: "Follow-up",
        description: prompt.substring(0, 100),
      },
    });

    try {
      // Get model from feature (already loaded above)
      const model = resolveModelString(feature?.model, DEFAULT_MODELS.claude);
      console.log(
        `[AutoMode] Follow-up for feature ${featureId} using model: ${model}`
      );

      // Track the follow-up prompt in prompt history
      const followUpEntry: FeaturePromptEntry = {
        prompt: prompt,
        timestamp: new Date().toISOString(),
        type: "follow_up",
      };
      const currentHistory = feature?.promptHistory || [];
      const updatedHistory = [...currentHistory, followUpEntry];

      // Update feature status to in_progress and add follow-up prompt to history
      await this.updateFeatureWithTitleAndPrompt(
        projectPath,
        featureId,
        "in_progress",
        feature?.title,
        updatedHistory
      );

      // Copy follow-up images to feature folder
      const copiedImagePaths: string[] = [];
      if (imagePaths && imagePaths.length > 0) {
        const featureImagesDir = path.join(
          projectPath,
          ".automaker",
          "features",
          featureId,
          "images"
        );

        await fs.mkdir(featureImagesDir, { recursive: true });

        for (const imagePath of imagePaths) {
          try {
            // Get the filename from the path
            const filename = path.basename(imagePath);
            const destPath = path.join(featureImagesDir, filename);

            // Copy the image
            await fs.copyFile(imagePath, destPath);

            // Store the relative path (like FeatureLoader does)
            const relativePath = path.join(
              ".automaker",
              "features",
              featureId,
              "images",
              filename
            );
            copiedImagePaths.push(relativePath);
          } catch (error) {
            console.error(
              `[AutoMode] Failed to copy follow-up image ${imagePath}:`,
              error
            );
          }
        }
      }

      // Update feature object with new follow-up images BEFORE building prompt
      if (copiedImagePaths.length > 0 && feature) {
        const currentImagePaths = feature.imagePaths || [];
        const newImagePaths = copiedImagePaths.map((p) => ({
          path: p,
          filename: path.basename(p),
          mimeType: "image/png", // Default, could be improved
        }));

        feature.imagePaths = [...currentImagePaths, ...newImagePaths];
      }

      // Combine original feature images with new follow-up images
      const allImagePaths: string[] = [];

      // Add all images from feature (now includes both original and new)
      if (feature?.imagePaths) {
        const allPaths = feature.imagePaths.map((img) =>
          typeof img === "string" ? img : img.path
        );
        allImagePaths.push(...allPaths);
      }

      // Save updated feature.json with new images
      if (copiedImagePaths.length > 0 && feature) {
        const featurePath = path.join(
          projectPath,
          ".automaker",
          "features",
          featureId,
          "feature.json"
        );

        try {
          await fs.writeFile(featurePath, JSON.stringify(feature, null, 2));
        } catch (error) {
          console.error(`[AutoMode] Failed to save feature.json:`, error);
        }
      }

      // Use fullPrompt (already built above) with model and all images
      await this.runAgent(
        workDir,
        featureId,
        fullPrompt,
        abortController,
        allImagePaths.length > 0 ? allImagePaths : imagePaths,
        model
      );

      // Mark as waiting_approval for user review
      await this.updateFeatureStatus(
        projectPath,
        featureId,
        "waiting_approval"
      );

      this.emitAutoModeEvent("auto_mode_feature_complete", {
        featureId,
        passes: true,
        message: "Follow-up completed successfully",
        projectPath,
      });
    } catch (error) {
      if (!isAbortError(error)) {
        this.emitAutoModeEvent("auto_mode_error", {
          featureId,
          error: (error as Error).message,
          projectPath,
        });
      }
    } finally {
      this.runningFeatures.delete(featureId);
    }
  }

  /**
   * Verify a feature's implementation
   */
  async verifyFeature(
    projectPath: string,
    featureId: string
  ): Promise<boolean> {
    const worktreePath = path.join(
      projectPath,
      ".automaker",
      "worktrees",
      featureId
    );
    let workDir = projectPath;

    try {
      await fs.access(worktreePath);
      workDir = worktreePath;
    } catch {
      // No worktree
    }

    // Run verification - check if tests pass, build works, etc.
    const verificationChecks = [
      { cmd: "npm run lint", name: "Lint" },
      { cmd: "npm run typecheck", name: "Type check" },
      { cmd: "npm test", name: "Tests" },
      { cmd: "npm run build", name: "Build" },
    ];

    let allPassed = true;
    const results: Array<{ check: string; passed: boolean; output?: string }> =
      [];

    for (const check of verificationChecks) {
      try {
        const { stdout, stderr } = await execAsync(check.cmd, {
          cwd: workDir,
          timeout: 120000,
        });
        results.push({
          check: check.name,
          passed: true,
          output: stdout || stderr,
        });
      } catch (error) {
        allPassed = false;
        results.push({
          check: check.name,
          passed: false,
          output: (error as Error).message,
        });
        break; // Stop on first failure
      }
    }

    this.emitAutoModeEvent("auto_mode_feature_complete", {
      featureId,
      passes: allPassed,
      message: allPassed
        ? "All verification checks passed"
        : `Verification failed: ${
            results.find((r) => !r.passed)?.check || "Unknown"
          }`,
    });

    return allPassed;
  }

  /**
   * Commit feature changes
   */
  async commitFeature(
    projectPath: string,
    featureId: string
  ): Promise<string | null> {
    const worktreePath = path.join(
      projectPath,
      ".automaker",
      "worktrees",
      featureId
    );
    let workDir = projectPath;

    try {
      await fs.access(worktreePath);
      workDir = worktreePath;
    } catch {
      // No worktree
    }

    try {
      // Check for changes
      const { stdout: status } = await execAsync("git status --porcelain", {
        cwd: workDir,
      });
      if (!status.trim()) {
        return null; // No changes
      }

      // Load feature for commit message
      const feature = await this.loadFeature(projectPath, featureId);
      const commitMessage = feature
        ? `feat: ${this.extractTitleFromDescription(
            feature.description
          )}\n\nImplemented by Automaker auto-mode`
        : `feat: Feature ${featureId}`;

      // Stage and commit
      await execAsync("git add -A", { cwd: workDir });
      await execAsync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, {
        cwd: workDir,
      });

      // Get commit hash
      const { stdout: hash } = await execAsync("git rev-parse HEAD", {
        cwd: workDir,
      });

      this.emitAutoModeEvent("auto_mode_feature_complete", {
        featureId,
        passes: true,
        message: `Changes committed: ${hash.trim().substring(0, 8)}`,
      });

      return hash.trim();
    } catch (error) {
      console.error(`[AutoMode] Commit failed for ${featureId}:`, error);
      return null;
    }
  }

  /**
   * Check if context exists for a feature
   */
  async contextExists(
    projectPath: string,
    featureId: string
  ): Promise<boolean> {
    const contextPath = path.join(
      projectPath,
      ".automaker",
      "features",
      featureId,
      "agent-output.md"
    );

    try {
      await fs.access(contextPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Analyze project to gather context
   */
  async analyzeProject(projectPath: string): Promise<void> {
    const abortController = new AbortController();

    const analysisFeatureId = `analysis-${Date.now()}`;
    this.emitAutoModeEvent("auto_mode_feature_start", {
      featureId: analysisFeatureId,
      projectPath,
      feature: {
        id: analysisFeatureId,
        title: "Project Analysis",
        description: "Analyzing project structure",
      },
    });

    const prompt = `Analyze this project and provide a summary of:
1. Project structure and architecture
2. Main technologies and frameworks used
3. Key components and their responsibilities
4. Build and test commands
5. Any existing conventions or patterns

Format your response as a structured markdown document.`;

    try {
      // Use default Claude model for analysis (can be overridden in the future)
      const analysisModel = resolveModelString(
        undefined,
        DEFAULT_MODELS.claude
      );
      const provider = ProviderFactory.getProviderForModel(analysisModel);

      const options: ExecuteOptions = {
        prompt,
        model: analysisModel,
        maxTurns: 5,
        cwd: projectPath,
        allowedTools: ["Read", "Glob", "Grep"],
        abortController,
      };

      const stream = provider.executeQuery(options);
      let analysisResult = "";

      for await (const msg of stream) {
        if (msg.type === "assistant" && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === "text") {
              analysisResult = block.text || "";
              this.emitAutoModeEvent("auto_mode_progress", {
                featureId: analysisFeatureId,
                content: block.text,
                projectPath,
              });
            }
          }
        } else if (msg.type === "result" && msg.subtype === "success") {
          analysisResult = msg.result || analysisResult;
        }
      }

      // Save analysis
      const analysisPath = path.join(
        projectPath,
        ".automaker",
        "project-analysis.md"
      );
      await fs.mkdir(path.dirname(analysisPath), { recursive: true });
      await fs.writeFile(analysisPath, analysisResult);

      this.emitAutoModeEvent("auto_mode_feature_complete", {
        featureId: analysisFeatureId,
        passes: true,
        message: "Project analysis completed",
        projectPath,
      });
    } catch (error) {
      this.emitAutoModeEvent("auto_mode_error", {
        featureId: analysisFeatureId,
        error: (error as Error).message,
        projectPath,
      });
    }
  }

  /**
   * Get current status
   */
  getStatus(): {
    isRunning: boolean;
    autoLoopRunning: boolean;
    runningFeatures: string[];
    runningCount: number;
  } {
    return {
      isRunning: this.autoLoopRunning || this.runningFeatures.size > 0,
      autoLoopRunning: this.autoLoopRunning,
      runningFeatures: Array.from(this.runningFeatures.keys()),
      runningCount: this.runningFeatures.size,
    };
  }

  /**
   * Get detailed info about all running agents
   */
  getRunningAgents(): Array<{
    featureId: string;
    projectPath: string;
    projectName: string;
    isAutoMode: boolean;
  }> {
    return Array.from(this.runningFeatures.values()).map((rf) => ({
      featureId: rf.featureId,
      projectPath: rf.projectPath,
      projectName: path.basename(rf.projectPath),
      isAutoMode: rf.isAutoMode,
    }));
  }

  // Private helpers

  private async setupWorktree(
    projectPath: string,
    featureId: string,
    branchName: string
  ): Promise<string> {
    const worktreesDir = path.join(projectPath, ".automaker", "worktrees");
    const worktreePath = path.join(worktreesDir, featureId);

    await fs.mkdir(worktreesDir, { recursive: true });

    // Check if worktree already exists
    try {
      await fs.access(worktreePath);
      return worktreePath;
    } catch {
      // Create new worktree
    }

    // Create branch if it doesn't exist
    try {
      await execAsync(`git branch ${branchName}`, { cwd: projectPath });
    } catch {
      // Branch may already exist
    }

    // Create worktree
    try {
      await execAsync(`git worktree add "${worktreePath}" ${branchName}`, {
        cwd: projectPath,
      });
    } catch (error) {
      // Worktree creation failed, fall back to direct execution
      console.error(`[AutoMode] Worktree creation failed:`, error);
      return projectPath;
    }

    return worktreePath;
  }

  private async loadFeature(
    projectPath: string,
    featureId: string
  ): Promise<Feature | null> {
    const featurePath = path.join(
      projectPath,
      ".automaker",
      "features",
      featureId,
      "feature.json"
    );

    try {
      const data = await fs.readFile(featurePath, "utf-8");
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  private async updateFeatureStatus(
    projectPath: string,
    featureId: string,
    status: string
  ): Promise<void> {
    const featurePath = path.join(
      projectPath,
      ".automaker",
      "features",
      featureId,
      "feature.json"
    );

    try {
      const data = await fs.readFile(featurePath, "utf-8");
      const feature = JSON.parse(data);
      feature.status = status;
      feature.updatedAt = new Date().toISOString();
      // Set justFinishedAt timestamp when moving to waiting_approval (agent just completed)
      // Badge will show for 2 minutes after this timestamp
      if (status === "waiting_approval") {
        feature.justFinishedAt = new Date().toISOString();
      } else {
        // Clear the timestamp when moving to other statuses
        feature.justFinishedAt = undefined;
      }
      await fs.writeFile(featurePath, JSON.stringify(feature, null, 2));
    } catch {
      // Feature file may not exist
    }
  }

  /**
   * Update feature with title, prompt history, and status
   * Used when starting a feature to save generated title and track prompts
   */
  private async updateFeatureWithTitleAndPrompt(
    projectPath: string,
    featureId: string,
    status: string,
    title?: string,
    promptHistory?: FeaturePromptEntry[]
  ): Promise<void> {
    const featurePath = path.join(
      projectPath,
      ".automaker",
      "features",
      featureId,
      "feature.json"
    );

    try {
      const data = await fs.readFile(featurePath, "utf-8");
      const feature = JSON.parse(data);
      feature.status = status;
      feature.updatedAt = new Date().toISOString();

      // Set title if provided
      if (title) {
        feature.title = title;
      }

      // Set prompt history if provided
      if (promptHistory) {
        feature.promptHistory = promptHistory;
      }

      // Handle justFinishedAt timestamp
      if (status === "waiting_approval") {
        feature.justFinishedAt = new Date().toISOString();
      } else {
        feature.justFinishedAt = undefined;
      }

      await fs.writeFile(featurePath, JSON.stringify(feature, null, 2));
    } catch (error) {
      console.error(`[AutoMode] Failed to update feature ${featureId}:`, error);
    }
  }

  private async loadPendingFeatures(projectPath: string): Promise<Feature[]> {
    const featuresDir = path.join(projectPath, ".automaker", "features");

    try {
      const entries = await fs.readdir(featuresDir, { withFileTypes: true });
      const features: Feature[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const featurePath = path.join(
            featuresDir,
            entry.name,
            "feature.json"
          );
          try {
            const data = await fs.readFile(featurePath, "utf-8");
            const feature = JSON.parse(data);
            if (
              feature.status === "pending" ||
              feature.status === "ready" ||
              feature.status === "backlog"
            ) {
              features.push(feature);
            }
          } catch {
            // Skip invalid features
          }
        }
      }

      // Sort by priority
      return features.sort((a, b) => (a.priority || 999) - (b.priority || 999));
    } catch {
      return [];
    }
  }

  /**
   * Extract a title from feature description (first line or truncated)
   */
  private extractTitleFromDescription(description: string): string {
    if (!description || !description.trim()) {
      return "Untitled Feature";
    }

    // Get first line, or first 60 characters if no newline
    const firstLine = description.split("\n")[0].trim();
    if (firstLine.length <= 60) {
      return firstLine;
    }

    // Truncate to 60 characters and add ellipsis
    return firstLine.substring(0, 57) + "...";
  }

  /**
   * Extract image paths from feature's imagePaths array
   * Handles both string paths and objects with path property
   */
  private extractImagePaths(
    imagePaths:
      | Array<string | { path: string; [key: string]: unknown }>
      | undefined,
    projectPath: string
  ): string[] {
    if (!imagePaths || imagePaths.length === 0) {
      return [];
    }

    return imagePaths
      .map((imgPath) => {
        const pathStr = typeof imgPath === "string" ? imgPath : imgPath.path;
        // Resolve relative paths to absolute paths
        return path.isAbsolute(pathStr)
          ? pathStr
          : path.join(projectPath, pathStr);
      })
      .filter((p) => p); // Filter out any empty paths
  }

  private buildFeaturePrompt(feature: Feature): string {
    const title = this.extractTitleFromDescription(feature.description);

    let prompt = `## Feature Implementation Task

**Feature ID:** ${feature.id}
**Title:** ${title}
**Description:** ${feature.description}
`;

    if (feature.spec) {
      prompt += `
**Specification:**
${feature.spec}
`;
    }

    // Add images note (like old implementation)
    if (feature.imagePaths && feature.imagePaths.length > 0) {
      const imagesList = feature.imagePaths
        .map((img, idx) => {
          const path = typeof img === "string" ? img : img.path;
          const filename =
            typeof img === "string"
              ? path.split("/").pop()
              : img.filename || path.split("/").pop();
          const mimeType =
            typeof img === "string" ? "image/*" : img.mimeType || "image/*";
          return `   ${
            idx + 1
          }. ${filename} (${mimeType})\n      Path: ${path}`;
        })
        .join("\n");

      prompt += `
**📎 Context Images Attached:**
The user has attached ${feature.imagePaths.length} image(s) for context. These images are provided both visually (in the initial message) and as files you can read:

${imagesList}

You can use the Read tool to view these images at any time during implementation. Review them carefully before implementing.
`;
    }

    prompt += `
## Instructions

Implement this feature by:
1. First, explore the codebase to understand the existing structure
2. Plan your implementation approach
3. Write the necessary code changes
4. Add or update tests as needed
5. Ensure the code follows existing patterns and conventions

When done, summarize what you implemented and any notes for the developer.`;

    return prompt;
  }

  private async runAgent(
    workDir: string,
    featureId: string,
    prompt: string,
    abortController: AbortController,
    imagePaths?: string[],
    model?: string
  ): Promise<void> {
    // Build SDK options using centralized configuration for feature implementation
    const sdkOptions = createAutoModeOptions({
      cwd: workDir,
      model: model,
      abortController,
    });

    // Extract model, maxTurns, and allowedTools from SDK options
    const finalModel = sdkOptions.model!;
    const maxTurns = sdkOptions.maxTurns;
    const allowedTools = sdkOptions.allowedTools as string[] | undefined;

    console.log(
      `[AutoMode] runAgent called for feature ${featureId} with model: ${finalModel}`
    );

    // Get provider for this model
    const provider = ProviderFactory.getProviderForModel(finalModel);

    console.log(
      `[AutoMode] Using provider "${provider.getName()}" for model "${finalModel}"`
    );

    // Build prompt content with images using utility
    const { content: promptContent } = await buildPromptWithImages(
      prompt,
      imagePaths,
      workDir,
      false // don't duplicate paths in text
    );

    const options: ExecuteOptions = {
      prompt: promptContent,
      model: finalModel,
      maxTurns: maxTurns,
      cwd: workDir,
      allowedTools: allowedTools,
      abortController,
    };

    // Execute via provider
    const stream = provider.executeQuery(options);
    let responseText = "";
    const outputPath = path.join(
      workDir,
      ".automaker",
      "features",
      featureId,
      "agent-output.md"
    );

    for await (const msg of stream) {
      if (msg.type === "assistant" && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "text") {
            responseText += block.text || "";

            // Check for authentication errors in the response
            if (
              block.text &&
              (block.text.includes("Invalid API key") ||
                block.text.includes("authentication_failed") ||
                block.text.includes("Fix external API key"))
            ) {
              throw new Error(
                "Authentication failed: Invalid or expired API key. " +
                  "Please check your ANTHROPIC_API_KEY or GOOGLE_API_KEY, or run 'claude login' to re-authenticate."
              );
            }

            this.emitAutoModeEvent("auto_mode_progress", {
              featureId,
              content: block.text,
            });
          } else if (block.type === "tool_use") {
            this.emitAutoModeEvent("auto_mode_tool", {
              featureId,
              tool: block.name,
              input: block.input,
            });
          }
        }
      } else if (msg.type === "error") {
        // Handle error messages
        throw new Error(msg.error || "Unknown error");
      } else if (msg.type === "result" && msg.subtype === "success") {
        responseText = msg.result || responseText;
      }
    }

    // Save agent output
    try {
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, responseText);
    } catch {
      // May fail if directory doesn't exist
    }
  }

  private async executeFeatureWithContext(
    projectPath: string,
    featureId: string,
    context: string,
    useWorktrees: boolean
  ): Promise<void> {
    const feature = await this.loadFeature(projectPath, featureId);
    if (!feature) {
      throw new Error(`Feature ${featureId} not found`);
    }

    const prompt = `## Continuing Feature Implementation

${this.buildFeaturePrompt(feature)}

## Previous Context
The following is the output from a previous implementation attempt. Continue from where you left off:

${context}

## Instructions
Review the previous work and continue the implementation. If the feature appears complete, verify it works correctly.`;

    return this.executeFeature(projectPath, featureId, useWorktrees, false);
  }

  /**
   * Emit an auto-mode event wrapped in the correct format for the client.
   * All auto-mode events are sent as type "auto-mode:event" with the actual
   * event type and data in the payload.
   */
  private emitAutoModeEvent(
    eventType: string,
    data: Record<string, unknown>
  ): void {
    // Wrap the event in auto-mode:event format expected by the client
    this.events.emit("auto-mode:event", {
      type: eventType,
      ...data,
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
