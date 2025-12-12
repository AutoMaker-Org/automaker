const { query, AbortError } = require("@anthropic-ai/claude-agent-sdk");
const promptBuilder = require("./prompt-builder");
const contextManager = require("./context-manager");
const featureLoader = require("./feature-loader");
const mcpServerFactory = require("./mcp-server-factory");

/**
 * Feature Verifier - Handles feature verification by running tests
 */
class FeatureVerifier {
  /**
   * Verify feature tests (runs tests and checks if they pass)
   */
  async verifyFeatureTests(feature, projectPath, sendToRenderer, execution) {
    console.log(
      `[FeatureVerifier] Verifying tests for: ${feature.description}`
    );

    try {
      const verifyMsg = `\n✅ Verifying tests for: ${feature.description}\n`;
      await contextManager.writeToContextFile(
        projectPath,
        feature.id,
        verifyMsg
      );

      sendToRenderer({
        type: "auto_mode_phase",
        featureId: feature.id,
        phase: "verification",
        message: `Verifying tests for: ${feature.description}`,
      });

      const abortController = new AbortController();
      execution.abortController = abortController;

      // Create custom MCP server with UpdateFeatureStatus tool
      const featureToolsServer = mcpServerFactory.createFeatureToolsServer(
        featureLoader.updateFeatureStatus.bind(featureLoader),
        projectPath
      );

      const options = {
        model: "claude-opus-4-5-20251101",
        systemPrompt: await promptBuilder.getVerificationPrompt(projectPath),
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
          "mcp__automaker-tools__UpdateFeatureStatus",
        ],
        permissionMode: "acceptEdits",
        sandbox: {
          enabled: true,
          autoAllowBashIfSandboxed: true,
        },
        abortController: abortController,
      };

      const prompt = await promptBuilder.buildVerificationPrompt(
        feature,
        projectPath
      );

      const runningTestsMsg =
        "Running Playwright tests to verify feature implementation...\n";
      await contextManager.writeToContextFile(
        projectPath,
        feature.id,
        runningTestsMsg
      );

      sendToRenderer({
        type: "auto_mode_progress",
        featureId: feature.id,
        content: runningTestsMsg,
      });

      const currentQuery = query({ prompt, options });
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

      // Re-load features to check if it was marked as verified or waiting_approval (for skipTests)
      const updatedFeatures = await featureLoader.loadFeatures(projectPath);
      const updatedFeature = updatedFeatures.find((f) => f.id === feature.id);
      // For skipTests features, waiting_approval is also considered a success
      const passes =
        updatedFeature?.status === "verified" ||
        (updatedFeature?.skipTests &&
          updatedFeature?.status === "waiting_approval");

      const finalMsg = passes
        ? "✓ Verification successful: All tests passed\n"
        : "✗ Tests failed or not all passing - feature remains in progress\n";

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
        console.log("[FeatureVerifier] Verification aborted");
        if (execution) {
          execution.abortController = null;
          execution.query = null;
        }
        return {
          passes: false,
          message: "Verification aborted",
        };
      }

      console.error("[FeatureVerifier] Error verifying feature:", error);
      if (execution) {
        execution.abortController = null;
        execution.query = null;
      }
      throw error;
    }
  }
}

module.exports = new FeatureVerifier();
