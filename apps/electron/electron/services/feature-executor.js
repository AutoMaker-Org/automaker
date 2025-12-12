const { query, AbortError } = require("@anthropic-ai/claude-agent-sdk");
const promptBuilder = require("./prompt-builder");
const contextManager = require("./context-manager");
const featureLoader = require("./feature-loader");
const mcpServerFactory = require("./mcp-server-factory");
const { ModelRegistry } = require("./model-registry");
const { ModelProviderFactory } = require("./model-provider");

// Model name mappings for Claude (legacy - kept for backwards compatibility)
const MODEL_MAP = {
  haiku: "claude-haiku-4-5",
  sonnet: "claude-sonnet-4-20250514",
  opus: "claude-opus-4-5-20251101",
};

// Thinking level to budget_tokens mapping
// These values control how much "thinking time" the model gets for extended thinking
const THINKING_BUDGET_MAP = {
  none: null, // No extended thinking
  low: 4096, // Light thinking
  medium: 16384, // Moderate thinking
  high: 65536, // Deep thinking
  ultrathink: 262144, // Ultra-deep thinking (maximum reasoning)
};

/**
 * Feature Executor - Handles feature implementation using Claude Agent SDK
 * Now supports multiple model providers (Claude, Codex/OpenAI)
 */
class FeatureExecutor {
  /**
   * Get the model string based on feature's model setting
   * Supports both Claude and Codex/OpenAI models
   */
  getModelString(feature) {
    const modelKey = feature.model || "opus"; // Default to opus

    // First check if this is a Codex model - they use the model key directly as the string
    if (ModelRegistry.isCodexModel(modelKey)) {
      const model = ModelRegistry.getModel(modelKey);
      if (model && model.modelString) {
        console.log(
          `[FeatureExecutor] getModelString: modelKey=${modelKey}, modelString=${model.modelString} (Codex model)`
        );
        return model.modelString;
      }
      // If model exists in registry but somehow no modelString, use the key itself
      console.log(
        `[FeatureExecutor] getModelString: modelKey=${modelKey}, modelString=${modelKey} (Codex fallback)`
      );
      return modelKey;
    }

    // For Claude models, use the registry lookup
    let modelString = ModelRegistry.getModelString(modelKey);

    // Fallback to MODEL_MAP if registry doesn't have it (legacy support)
    if (!modelString) {
      modelString = MODEL_MAP[modelKey];
    }

    // Final fallback to opus for Claude models only
    if (!modelString) {
      modelString = MODEL_MAP.opus;
    }

    // Validate model string format - ensure it's not incorrectly constructed
    // Prevent incorrect formats like "claude-haiku-4-20250514" (mixing haiku with sonnet date)
    if (modelString.includes("haiku") && modelString.includes("20250514")) {
      console.error(
        `[FeatureExecutor] Invalid model string detected: ${modelString}, using correct format`
      );
      modelString = MODEL_MAP.haiku || "claude-haiku-4-5";
    }

    console.log(
      `[FeatureExecutor] getModelString: modelKey=${modelKey}, modelString=${modelString}`
    );
    return modelString;
  }

  /**
   * Determine if the feature uses a Codex/OpenAI model
   */
  isCodexModel(feature) {
    const modelKey = feature.model || "opus";
    return ModelRegistry.isCodexModel(modelKey);
  }

  /**
   * Get the appropriate provider for the feature's model
   */
  getProvider(feature) {
    const modelKey = feature.model || "opus";
    return ModelProviderFactory.getProviderForModel(modelKey);
  }

  /**
   * Get thinking configuration based on feature's thinkingLevel
   */
  getThinkingConfig(feature) {
    const modelId = feature.model || "opus";
    // Skip thinking config for models that don't support it (e.g., Codex CLI)
    if (!ModelRegistry.modelSupportsThinking(modelId)) {
      return null;
    }

    const level = feature.thinkingLevel || "none";
    const budgetTokens = THINKING_BUDGET_MAP[level];

    if (budgetTokens === null) {
      return null; // No extended thinking
    }

    return {
      type: "enabled",
      budget_tokens: budgetTokens,
    };
  }

  /**
   * Prepare for ultrathink execution - validate and warn
   */
  prepareForUltrathink(feature, thinkingConfig) {
    if (feature.thinkingLevel !== "ultrathink") {
      return { ready: true };
    }

    const warnings = [];
    const recommendations = [];

    // Check CLI installation
    const claudeCliDetector = require("./claude-cli-detector");
    const cliInfo = claudeCliDetector.getInstallationInfo();

    if (cliInfo.status === "not_installed") {
      warnings.push(
        "Claude Code CLI not detected - ultrathink may have timeout issues"
      );
      recommendations.push(
        "Install Claude Code CLI for optimal ultrathink performance"
      );
    }

    // Validate budget tokens
    if (thinkingConfig && thinkingConfig.budget_tokens > 32000) {
      warnings.push(
        `Ultrathink budget (${thinkingConfig.budget_tokens} tokens) exceeds recommended 32K - may cause long-running requests`
      );
      recommendations.push(
        "Consider using batch processing for budgets above 32K"
      );
    }

    // Cost estimate (rough)
    const estimatedCost = ((thinkingConfig?.budget_tokens || 0) / 1000) * 0.015; // Rough estimate
    if (estimatedCost > 1.0) {
      warnings.push(
        `Estimated cost: ~$${estimatedCost.toFixed(2)} per execution`
      );
    }

    // Time estimate
    warnings.push("Ultrathink tasks typically take 45-180 seconds");

    return {
      ready: true,
      warnings,
      recommendations,
      estimatedCost,
      estimatedTime: "45-180 seconds",
      cliInfo,
    };
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Implement a single feature using Claude Agent SDK
   * Uses a Plan-Act-Verify loop with detailed phase logging
   */
  async implementFeature(feature, projectPath, sendToRenderer, execution) {
    console.log(`[FeatureExecutor] Implementing: ${feature.description}`);

    // Declare variables outside try block so they're available in catch
    let modelString;
    let providerName;
    let isCodex;

    try {
      // Save the initial git state before starting implementation
      // This allows us to track only files changed during this session when committing
      await contextManager.saveInitialGitState(projectPath, feature.id);

      // ========================================
      // PHASE 1: PLANNING
      // ========================================
      const planningMessage = `📋 Planning implementation for: ${feature.description}\n`;
      await contextManager.writeToContextFile(
        projectPath,
        feature.id,
        planningMessage
      );

      sendToRenderer({
        type: "auto_mode_phase",
        featureId: feature.id,
        phase: "planning",
        message: `Planning implementation for: ${feature.description}`,
      });
      console.log(
        `[FeatureExecutor] Phase: PLANNING for ${feature.description}`
      );

      const abortController = new AbortController();
      execution.abortController = abortController;

      // Create custom MCP server with UpdateFeatureStatus tool
      const featureToolsServer = mcpServerFactory.createFeatureToolsServer(
        featureLoader.updateFeatureStatus.bind(featureLoader),
        projectPath
      );

      // Ensure feature has a model set (for backward compatibility with old features)
      if (!feature.model) {
        console.warn(
          `[FeatureExecutor] Feature ${feature.id} missing model property, defaulting to 'opus'`
        );
        feature.model = "opus";
      }

      // Get model and thinking configuration from feature settings
      const modelString = this.getModelString(feature);
      const thinkingConfig = this.getThinkingConfig(feature);

      // Prepare for ultrathink if needed
      if (feature.thinkingLevel === "ultrathink") {
        const preparation = this.prepareForUltrathink(feature, thinkingConfig);

        console.log(`[FeatureExecutor] Ultrathink preparation:`, preparation);

        // Log warnings
        if (preparation.warnings && preparation.warnings.length > 0) {
          preparation.warnings.forEach((warning) => {
            console.warn(`[FeatureExecutor] ⚠️ ${warning}`);
          });
        }

        // Send preparation info to renderer
        sendToRenderer({
          type: "auto_mode_ultrathink_preparation",
          featureId: feature.id,
          warnings: preparation.warnings || [],
          recommendations: preparation.recommendations || [],
          estimatedCost: preparation.estimatedCost,
          estimatedTime: preparation.estimatedTime,
        });
      }

      providerName = this.isCodexModel(feature) ? "Codex/OpenAI" : "Claude";
      console.log(
        `[FeatureExecutor] Using provider: ${providerName}, model: ${modelString}, thinking: ${
          feature.thinkingLevel || "none"
        }`
      );

      // Note: Claude Agent SDK handles authentication automatically - it can use:
      // 1. CLAUDE_CODE_OAUTH_TOKEN env var (for SDK mode)
      // 2. Claude CLI's own authentication (if CLI is installed)
      // 3. ANTHROPIC_API_KEY (fallback)
      // We don't need to validate here - let the SDK/CLI handle auth errors

      // Configure options for the SDK query
      const options = {
        model: modelString,
        systemPrompt: promptBuilder.getCodingPrompt(),
        maxTurns: 1000,
        cwd: projectPath,
        mcpServers: {
          "automaker-tools": featureToolsServer,
        },
        allowedTools: [
          "Read",
          "Write",
          "Edit",
          "Glob",
          "Grep",
          "Bash",
          "WebSearch",
          "WebFetch",
          "mcp__automaker-tools__UpdateFeatureStatus",
        ],
        permissionMode: "acceptEdits",
        sandbox: {
          enabled: true,
          autoAllowBashIfSandboxed: true,
        },
        abortController: abortController,
      };

      // Add thinking configuration if enabled
      if (thinkingConfig) {
        options.thinking = thinkingConfig;
      }

      // Build the prompt for this specific feature
      let prompt = await promptBuilder.buildFeaturePrompt(feature, projectPath);

      // Add images to prompt if feature has imagePaths
      if (feature.imagePaths && feature.imagePaths.length > 0) {
        const contentBlocks = [];

        // Add text block
        contentBlocks.push({
          type: "text",
          text: prompt,
        });

        // Add image blocks
        const fs = require("fs");
        const path = require("path");
        for (const imagePathObj of feature.imagePaths) {
          try {
            const imagePath = imagePathObj.path;
            const imageBuffer = fs.readFileSync(imagePath);
            const base64Data = imageBuffer.toString("base64");
            const ext = path.extname(imagePath).toLowerCase();
            const mimeTypeMap = {
              ".jpg": "image/jpeg",
              ".jpeg": "image/jpeg",
              ".png": "image/png",
              ".gif": "image/gif",
              ".webp": "image/webp",
            };
            const mediaType =
              mimeTypeMap[ext] || imagePathObj.mimeType || "image/png";

            contentBlocks.push({
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64Data,
              },
            });

            console.log(
              `[FeatureExecutor] Added image to prompt: ${imagePath}`
            );
          } catch (error) {
            console.error(
              `[FeatureExecutor] Failed to load image ${imagePathObj.path}:`,
              error
            );
          }
        }

        // Wrap content blocks in async generator for SDK (required format for multimodal prompts)
        prompt = (async function* () {
          yield {
            type: "user",
            session_id: "",
            message: {
              role: "user",
              content: contentBlocks,
            },
            parent_tool_use_id: null,
          };
        })();
      }

      // Planning: Analyze the codebase and create implementation plan
      sendToRenderer({
        type: "auto_mode_progress",
        featureId: feature.id,
        content:
          "Analyzing codebase structure and creating implementation plan...",
      });

      // Small delay to show planning phase
      await this.sleep(500);

      // ========================================
      // PHASE 2: ACTION
      // ========================================
      const actionMessage = `⚡ Executing implementation for: ${feature.description}\n`;
      await contextManager.writeToContextFile(
        projectPath,
        feature.id,
        actionMessage
      );

      sendToRenderer({
        type: "auto_mode_phase",
        featureId: feature.id,
        phase: "action",
        message: `Executing implementation for: ${feature.description}`,
      });
      console.log(`[FeatureExecutor] Phase: ACTION for ${feature.description}`);

      // Send query - use appropriate provider based on model
      let currentQuery;
      isCodex = this.isCodexModel(feature);

      // Ensure provider auth is available (especially for Claude SDK)
      const provider = this.getProvider(feature);
      if (provider?.ensureAuthEnv && !provider.ensureAuthEnv()) {
        // Check if CLI is installed to provide better error message
        let authMsg =
          "Missing Anthropic auth. Go to Settings > Setup to configure your Claude authentication.";
        try {
          const claudeCliDetector = require("./claude-cli-detector");
          const detection = claudeCliDetector.detectClaudeInstallation();
          if (detection.installed && detection.method === "cli") {
            authMsg =
              "Claude CLI is installed but not authenticated. Go to Settings > Setup to provide your subscription token (from `claude setup-token`) or API key.";
          } else {
            authMsg =
              "Missing Anthropic auth. Go to Settings > Setup to configure your Claude authentication, or set ANTHROPIC_API_KEY environment variable.";
          }
        } catch (err) {
          // Fallback to default message
        }
        console.error(`[FeatureExecutor] ${authMsg}`);
        throw new Error(authMsg);
      }

      // Validate that model string matches the provider
      if (isCodex) {
        // Ensure model string is actually a Codex model, not a Claude model
        if (modelString.startsWith("claude-")) {
          console.error(
            `[FeatureExecutor] ERROR: Codex provider selected but Claude model string detected: ${modelString}`
          );
          console.error(
            `[FeatureExecutor] Feature model: ${
              feature.model || "not set"
            }, modelString: ${modelString}`
          );
          throw new Error(
            `Invalid model configuration: Codex provider cannot use Claude model '${modelString}'. Please check feature model setting.`
          );
        }

        // Use Codex provider for OpenAI models
        console.log(
          `[FeatureExecutor] Using Codex provider for model: ${modelString}`
        );
        // Pass MCP server config to Codex provider so it can configure Codex CLI TOML
        currentQuery = provider.executeQuery({
          prompt,
          model: modelString,
          cwd: projectPath,
          systemPrompt: promptBuilder.getCodingPrompt(),
          maxTurns: 20, // Codex CLI typically uses fewer turns
          allowedTools: options.allowedTools,
          mcpServers: {
            "automaker-tools": featureToolsServer,
          },
          abortController: abortController,
          env: {
            OPENAI_API_KEY: process.env.OPENAI_API_KEY,
          },
        });
      } else {
        // Ensure model string is actually a Claude model, not a Codex model
        if (
          !modelString.startsWith("claude-") &&
          !modelString.match(/^(gpt-|o\d)/)
        ) {
          console.warn(
            `[FeatureExecutor] WARNING: Claude provider selected but unexpected model string: ${modelString}`
          );
        }

        // Use Claude SDK (original implementation)
        currentQuery = query({ prompt, options });
      }

      execution.query = currentQuery;

      // Stream responses
      let responseText = "";
      let hasStartedToolUse = false;
      for await (const msg of currentQuery) {
        // Check if this specific feature was aborted
        if (!execution.isActive()) break;

        // Handle error messages
        if (msg.type === "error") {
          const errorMsg = `\n❌ Error: ${msg.error}\n`;
          await contextManager.writeToContextFile(
            projectPath,
            feature.id,
            errorMsg
          );
          sendToRenderer({
            type: "auto_mode_error",
            featureId: feature.id,
            error: msg.error,
          });
          throw new Error(msg.error);
        }

        if (msg.type === "assistant" && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === "text") {
              responseText += block.text;

              // Write to context file
              await contextManager.writeToContextFile(
                projectPath,
                feature.id,
                block.text
              );

              // Stream progress to renderer
              sendToRenderer({
                type: "auto_mode_progress",
                featureId: feature.id,
                content: block.text,
              });
            } else if (block.type === "thinking") {
              // Handle thinking output from Codex O-series models
              const thinkingMsg = `\n💭 Thinking: ${block.thinking?.substring(
                0,
                200
              )}...\n`;
              await contextManager.writeToContextFile(
                projectPath,
                feature.id,
                thinkingMsg
              );
              sendToRenderer({
                type: "auto_mode_progress",
                featureId: feature.id,
                content: thinkingMsg,
              });
            } else if (block.type === "tool_use") {
              // First tool use indicates we're actively implementing
              if (!hasStartedToolUse) {
                hasStartedToolUse = true;
                const startMsg = "Starting code implementation...\n";
                await contextManager.writeToContextFile(
                  projectPath,
                  feature.id,
                  startMsg
                );
                sendToRenderer({
                  type: "auto_mode_progress",
                  featureId: feature.id,
                  content: startMsg,
                });
              }

              // Write tool use to context file
              const toolMsg = `\n🔧 Tool: ${block.name}\n`;
              await contextManager.writeToContextFile(
                projectPath,
                feature.id,
                toolMsg
              );

              // Notify about tool use
              sendToRenderer({
                type: "auto_mode_tool",
                featureId: feature.id,
                tool: block.name,
                input: block.input,
              });
            }
          }
        }
      }

      execution.query = null;
      execution.abortController = null;

      // ========================================
      // PHASE 3: VERIFICATION
      // ========================================
      const verificationMessage = `✅ Verifying implementation for: ${feature.description}\n`;
      await contextManager.writeToContextFile(
        projectPath,
        feature.id,
        verificationMessage
      );

      sendToRenderer({
        type: "auto_mode_phase",
        featureId: feature.id,
        phase: "verification",
        message: `Verifying implementation for: ${feature.description}`,
      });
      console.log(
        `[FeatureExecutor] Phase: VERIFICATION for ${feature.description}`
      );

      const checkingMsg =
        "Verifying implementation and checking test results...\n";
      await contextManager.writeToContextFile(
        projectPath,
        feature.id,
        checkingMsg
      );
      sendToRenderer({
        type: "auto_mode_progress",
        featureId: feature.id,
        content: checkingMsg,
      });

      // Re-load features to check if it was marked as verified or waiting_approval (for skipTests)
      const updatedFeatures = await featureLoader.loadFeatures(projectPath);
      const updatedFeature = updatedFeatures.find((f) => f.id === feature.id);
      // For skipTests features, waiting_approval is also considered a success
      const passes =
        updatedFeature?.status === "verified" ||
        (updatedFeature?.skipTests &&
          updatedFeature?.status === "waiting_approval");

      // Send verification result
      const resultMsg = passes
        ? "✓ Verification successful: All tests passed\n"
        : "✗ Verification: Tests need attention\n";

      await contextManager.writeToContextFile(
        projectPath,
        feature.id,
        resultMsg
      );
      sendToRenderer({
        type: "auto_mode_progress",
        featureId: feature.id,
        content: resultMsg,
      });

      return {
        passes,
        message: responseText.substring(0, 500), // First 500 chars
      };
    } catch (error) {
      if (error instanceof AbortError || error?.name === "AbortError") {
        console.log("[FeatureExecutor] Feature run aborted");
        if (execution) {
          execution.abortController = null;
          execution.query = null;
        }
        return {
          passes: false,
          message: "Auto mode aborted",
        };
      }

      console.error("[FeatureExecutor] Error implementing feature:", error);

      // Safely get model info for error logging (may not be set if error occurred early)
      const modelInfo = modelString
        ? {
            message: error.message,
            stack: error.stack,
            name: error.name,
            code: error.code,
            model: modelString,
            provider: providerName || "unknown",
            isCodex: isCodex !== undefined ? isCodex : "unknown",
          }
        : {
            message: error.message,
            stack: error.stack,
            name: error.name,
            code: error.code,
            model: "not initialized",
            provider: "unknown",
            isCodex: "unknown",
          };

      console.error("[FeatureExecutor] Error details:", modelInfo);

      // Check if this is a Claude CLI process error
      if (error.message && error.message.includes("process exited with code")) {
        const modelDisplay = modelString
          ? `Model: ${modelString}`
          : "Model: not initialized";
        const errorMsg =
          `Claude Code CLI failed with exit code 1. This might be due to:\n` +
          `- Invalid or unsupported model (${modelDisplay})\n` +
          `- Missing or invalid CLAUDE_CODE_OAUTH_TOKEN\n` +
          `- Claude CLI configuration issue\n` +
          `- Model not available in your Claude account\n\n` +
          `Original error: ${error.message}`;

        await contextManager.writeToContextFile(
          projectPath,
          feature.id,
          `\n❌ ${errorMsg}\n`
        );
        sendToRenderer({
          type: "auto_mode_error",
          featureId: feature.id,
          error: errorMsg,
        });
      }

      // Clean up
      if (execution) {
        execution.abortController = null;
        execution.query = null;
      }

      throw error;
    }
  }

  /**
   * Resume feature implementation with previous context
   */
  async resumeFeatureWithContext(
    feature,
    projectPath,
    sendToRenderer,
    previousContext,
    execution
  ) {
    console.log(
      `[FeatureExecutor] Resuming with context for: ${feature.description}`
    );

    try {
      const resumeMessage = `\n🔄 Resuming implementation for: ${feature.description}\n`;
      await contextManager.writeToContextFile(
        projectPath,
        feature.id,
        resumeMessage
      );

      sendToRenderer({
        type: "auto_mode_phase",
        featureId: feature.id,
        phase: "action",
        message: `Resuming implementation for: ${feature.description}`,
      });

      const abortController = new AbortController();
      execution.abortController = abortController;

      // Determine if we're in TDD mode (skipTests=false means TDD mode)
      const isTDD = !feature.skipTests;

      // Create custom MCP server with UpdateFeatureStatus tool
      const featureToolsServer = mcpServerFactory.createFeatureToolsServer(
        featureLoader.updateFeatureStatus.bind(featureLoader),
        projectPath
      );

      // Ensure feature has a model set (for backward compatibility with old features)
      if (!feature.model) {
        console.warn(
          `[FeatureExecutor] Feature ${feature.id} missing model property, defaulting to 'opus'`
        );
        feature.model = "opus";
      }

      // Get model and thinking configuration from feature settings
      const modelString = this.getModelString(feature);
      const thinkingConfig = this.getThinkingConfig(feature);

      // Prepare for ultrathink if needed
      if (feature.thinkingLevel === "ultrathink") {
        const preparation = this.prepareForUltrathink(feature, thinkingConfig);

        console.log(`[FeatureExecutor] Ultrathink preparation:`, preparation);

        // Log warnings
        if (preparation.warnings && preparation.warnings.length > 0) {
          preparation.warnings.forEach((warning) => {
            console.warn(`[FeatureExecutor] ⚠️ ${warning}`);
          });
        }

        // Send preparation info to renderer
        sendToRenderer({
          type: "auto_mode_ultrathink_preparation",
          featureId: feature.id,
          warnings: preparation.warnings || [],
          recommendations: preparation.recommendations || [],
          estimatedCost: preparation.estimatedCost,
          estimatedTime: preparation.estimatedTime,
        });
      }

      const isCodex = this.isCodexModel(feature);
      const providerName = isCodex ? "Codex/OpenAI" : "Claude";
      console.log(
        `[FeatureExecutor] Resuming with provider: ${providerName}, model: ${modelString}, thinking: ${
          feature.thinkingLevel || "none"
        }`
      );

      const options = {
        model: modelString,
        systemPrompt: promptBuilder.getVerificationPrompt(),
        maxTurns: 1000,
        cwd: projectPath,
        mcpServers: {
          "automaker-tools": featureToolsServer,
        },
        allowedTools: [
          "Read",
          "Write",
          "Edit",
          "Glob",
          "Grep",
          "Bash",
          "WebSearch",
          "WebFetch",
          "mcp__automaker-tools__UpdateFeatureStatus",
        ],
        permissionMode: "acceptEdits",
        sandbox: {
          enabled: true,
          autoAllowBashIfSandboxed: true,
        },
        abortController: abortController,
      };

      // Add thinking configuration if enabled
      if (thinkingConfig) {
        options.thinking = thinkingConfig;
      }

      // Build prompt with previous context
      let prompt = await promptBuilder.buildResumePrompt(
        feature,
        previousContext,
        projectPath
      );

      // Add images to prompt if feature has imagePaths or followUpImages
      const imagePaths = feature.followUpImages || feature.imagePaths;
      if (imagePaths && imagePaths.length > 0) {
        const contentBlocks = [];

        // Add text block
        contentBlocks.push({
          type: "text",
          text: prompt,
        });

        // Add image blocks
        const fs = require("fs");
        const path = require("path");
        for (const imagePathObj of imagePaths) {
          try {
            // Handle both string paths and FeatureImagePath objects
            const imagePath =
              typeof imagePathObj === "string"
                ? imagePathObj
                : imagePathObj.path;
            const imageBuffer = fs.readFileSync(imagePath);
            const base64Data = imageBuffer.toString("base64");
            const ext = path.extname(imagePath).toLowerCase();
            const mimeTypeMap = {
              ".jpg": "image/jpeg",
              ".jpeg": "image/jpeg",
              ".png": "image/png",
              ".gif": "image/gif",
              ".webp": "image/webp",
            };
            const mediaType =
              typeof imagePathObj === "string"
                ? mimeTypeMap[ext] || "image/png"
                : mimeTypeMap[ext] || imagePathObj.mimeType || "image/png";

            contentBlocks.push({
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64Data,
              },
            });

            console.log(
              `[FeatureExecutor] Added image to resume prompt: ${imagePath}`
            );
          } catch (error) {
            const errorPath =
              typeof imagePathObj === "string"
                ? imagePathObj
                : imagePathObj.path;
            console.error(
              `[FeatureExecutor] Failed to load image ${errorPath}:`,
              error
            );
          }
        }

        // Wrap content blocks in async generator for SDK (required format for multimodal prompts)
        prompt = (async function* () {
          yield {
            type: "user",
            session_id: "",
            message: {
              role: "user",
              content: contentBlocks,
            },
            parent_tool_use_id: null,
          };
        })();
      }

      // Use appropriate provider based on model type
      let currentQuery;
      if (isCodex) {
        // Validate that model string is actually a Codex model
        if (modelString.startsWith("claude-")) {
          console.error(
            `[FeatureExecutor] ERROR: Codex provider selected but Claude model string detected: ${modelString}`
          );
          throw new Error(
            `Invalid model configuration: Codex provider cannot use Claude model '${modelString}'. Please check feature model setting.`
          );
        }

        console.log(
          `[FeatureExecutor] Using Codex provider for resume with model: ${modelString}`
        );
        const provider = this.getProvider(feature);
        currentQuery = provider.executeQuery({
          prompt,
          model: modelString,
          cwd: projectPath,
          systemPrompt: promptBuilder.getVerificationPrompt(),
          maxTurns: 20,
          allowedTools: options.allowedTools,
          abortController: abortController,
          env: {
            OPENAI_API_KEY: process.env.OPENAI_API_KEY,
          },
        });
      } else {
        // Use Claude SDK
        currentQuery = query({ prompt, options });
      }
      execution.query = currentQuery;

      let responseText = "";
      for await (const msg of currentQuery) {
        // Check if this specific feature was aborted
        if (!execution.isActive()) break;

        if (msg.type === "assistant" && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === "text") {
              responseText += block.text;

              await contextManager.writeToContextFile(
                projectPath,
                feature.id,
                block.text
              );

              sendToRenderer({
                type: "auto_mode_progress",
                featureId: feature.id,
                content: block.text,
              });
            } else if (block.type === "tool_use") {
              const toolMsg = `\n🔧 Tool: ${block.name}\n`;
              await contextManager.writeToContextFile(
                projectPath,
                feature.id,
                toolMsg
              );

              sendToRenderer({
                type: "auto_mode_tool",
                featureId: feature.id,
                tool: block.name,
                input: block.input,
              });
            }
          }
        }
      }

      execution.query = null;
      execution.abortController = null;

      // Check if feature was marked as verified or waiting_approval (for skipTests)
      const updatedFeatures = await featureLoader.loadFeatures(projectPath);
      const updatedFeature = updatedFeatures.find((f) => f.id === feature.id);
      // For skipTests features, waiting_approval is also considered a success
      const passes =
        updatedFeature?.status === "verified" ||
        (updatedFeature?.skipTests &&
          updatedFeature?.status === "waiting_approval");

      const finalMsg = passes
        ? "✓ Feature successfully verified and completed\n"
        : "⚠ Feature still in progress - may need additional work\n";

      await contextManager.writeToContextFile(
        projectPath,
        feature.id,
        finalMsg
      );

      sendToRenderer({
        type: "auto_mode_progress",
        featureId: feature.id,
        content: finalMsg,
      });

      return {
        passes,
        message: responseText.substring(0, 500),
      };
    } catch (error) {
      if (error instanceof AbortError || error?.name === "AbortError") {
        console.log("[FeatureExecutor] Resume aborted");
        if (execution) {
          execution.abortController = null;
          execution.query = null;
        }
        return {
          passes: false,
          message: "Resume aborted",
        };
      }

      console.error("[FeatureExecutor] Error resuming feature:", error);
      if (execution) {
        execution.abortController = null;
        execution.query = null;
      }
      throw error;
    }
  }

  /**
   * Commit changes for a feature without doing additional work
   * Analyzes changes and creates a proper conventional commit message
   */
  async commitChangesOnly(feature, projectPath, sendToRenderer, execution) {
    console.log(
      `[FeatureExecutor] Committing changes for: ${feature.description}`
    );

    try {
      const commitMessage = `\n📝 Committing changes for: ${feature.description}\n`;
      await contextManager.writeToContextFile(
        projectPath,
        feature.id,
        commitMessage
      );

      sendToRenderer({
        type: "auto_mode_progress",
        featureId: feature.id,
        content: "Analyzing changes and creating commit...",
      });

      // Get the files that were changed during this AI session
      const changedFiles = await contextManager.getFilesChangedDuringSession(
        projectPath,
        feature.id
      );

      // Combine new files and modified files into a single list of files to commit
      const sessionFiles = [
        ...changedFiles.newFiles,
        ...changedFiles.modifiedFiles,
      ];

      console.log(
        `[FeatureExecutor] Files changed during session: ${sessionFiles.length}`,
        sessionFiles
      );

      const abortController = new AbortController();
      execution.abortController = abortController;

      // Create custom MCP server with UpdateFeatureStatus tool
      const featureToolsServer = mcpServerFactory.createFeatureToolsServer(
        featureLoader.updateFeatureStatus.bind(featureLoader),
        projectPath
      );

      const options = {
        model: "claude-sonnet-4-20250514", // Use sonnet for commit task
        systemPrompt: `You are a git commit assistant that creates professional conventional commit messages.

IMPORTANT RULES:
- DO NOT modify any code
- DO NOT write tests
- DO NOT do anything except analyzing changes and committing them
- Use the git command line tools via Bash
- Create proper conventional commit messages based on what was actually changed
- ONLY commit the specific files that were changed during the AI session (provided in the prompt)
- DO NOT use 'git add .' - only add the specific files listed`,
        maxTurns: 15, // Allow some turns to analyze and commit
        cwd: projectPath,
        mcpServers: {
          "automaker-tools": featureToolsServer,
        },
        allowedTools: ["Bash", "mcp__automaker-tools__UpdateFeatureStatus"],
        permissionMode: "acceptEdits",
        sandbox: {
          enabled: false, // Need to run git commands
        },
        abortController: abortController,
      };

      // Build the file list section for the prompt
      let fileListSection = "";
      if (sessionFiles.length > 0) {
        fileListSection = `
**Files Changed During This AI Session:**
The following files were modified or created during this feature implementation:
${sessionFiles.map((f) => `- ${f}`).join("\n")}

**CRITICAL:** Only commit these specific files listed above. Do NOT use \`git add .\` or \`git add -A\`.
Instead, add each file individually or use: \`git add ${sessionFiles.map((f) => `"${f}"`).join(" ")}\`
`;
      } else {
        fileListSection = `
**Note:** No specific files were tracked for this session. Please run \`git status\` to see what files have been modified, and only stage files that appear to be related to this feature implementation. Be conservative - if a file doesn't seem related to this feature, don't include it.
`;
      }

      // Prompt that guides the agent to create a proper conventional commit
      const prompt = `Please commit the changes for this feature with a proper conventional commit message.

**Feature Context:**
Category: ${feature.category}
Description: ${feature.description}
${fileListSection}
**Your Task:**

1. First, run \`git status\` to see the current state of the repository
2. Run \`git diff\` on the specific files listed above to see the actual changes
3. Run \`git log --oneline -5\` to see recent commit message styles in this repo
4. Analyze the changes in the files and draft a proper conventional commit message:
   - Use conventional commit format: \`type(scope): description\`
   - Types: feat, fix, refactor, style, docs, test, chore
   - The description should be concise (under 72 chars) and focus on "what" was done
   - Summarize the nature of the changes (new feature, enhancement, bug fix, etc.)
   - Make sure the commit message accurately reflects the actual code changes
5. Stage ONLY the specific files that were changed during this session (listed above)
   - DO NOT use \`git add .\` or \`git add -A\`
   - Add files individually: \`git add "path/to/file1" "path/to/file2"\`
6. Create the commit with a message ending with:
   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude Sonnet 4 <noreply@anthropic.com>

Use a HEREDOC for the commit message to ensure proper formatting:
\`\`\`bash
git commit -m "$(cat <<'EOF'
type(scope): Short description here

Optional longer description if needed.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4 <noreply@anthropic.com>
EOF
)"
\`\`\`

**IMPORTANT:**
- DO NOT use the feature description verbatim as the commit message
- Analyze the actual code changes to determine the appropriate commit message
- The commit message should be professional and follow conventional commit standards
- DO NOT modify any code or run tests - ONLY commit the existing changes
- ONLY stage the specific files listed above - do not commit unrelated changes`;

      const currentQuery = query({ prompt, options });
      execution.query = currentQuery;

      let responseText = "";
      for await (const msg of currentQuery) {
        if (!execution.isActive()) break;

        if (msg.type === "assistant" && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === "text") {
              responseText += block.text;

              await contextManager.writeToContextFile(
                projectPath,
                feature.id,
                block.text
              );

              sendToRenderer({
                type: "auto_mode_progress",
                featureId: feature.id,
                content: block.text,
              });
            } else if (block.type === "tool_use") {
              const toolMsg = `\n🔧 Tool: ${block.name}\n`;
              await contextManager.writeToContextFile(
                projectPath,
                feature.id,
                toolMsg
              );

              sendToRenderer({
                type: "auto_mode_tool",
                featureId: feature.id,
                tool: block.name,
                input: block.input,
              });
            }
          }
        }
      }

      execution.query = null;
      execution.abortController = null;

      const finalMsg = "✓ Changes committed successfully\n";
      await contextManager.writeToContextFile(
        projectPath,
        feature.id,
        finalMsg
      );

      sendToRenderer({
        type: "auto_mode_progress",
        featureId: feature.id,
        content: finalMsg,
      });

      return {
        passes: true,
        message: responseText.substring(0, 500),
      };
    } catch (error) {
      if (error instanceof AbortError || error?.name === "AbortError") {
        console.log("[FeatureExecutor] Commit aborted");
        if (execution) {
          execution.abortController = null;
          execution.query = null;
        }
        return {
          passes: false,
          message: "Commit aborted",
        };
      }

      console.error("[FeatureExecutor] Error committing feature:", error);
      if (execution) {
        execution.abortController = null;
        execution.query = null;
      }
      throw error;
    }
  }
}

module.exports = new FeatureExecutor();
