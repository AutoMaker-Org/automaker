const { query, AbortError } = require("@anthropic-ai/claude-agent-sdk");
const promptBuilder = require("./prompt-builder");

/**
 * Project Analyzer - Scans codebase and updates app_spec.txt
 */
class ProjectAnalyzer {
  /**
   * Run the project analysis using Claude Agent SDK
   */
  async runProjectAnalysis(projectPath, analysisId, sendToRenderer, execution) {
    console.log(`[ProjectAnalyzer] Running project analysis for: ${projectPath}`);

    try {
      sendToRenderer({
        type: "auto_mode_phase",
        featureId: analysisId,
        phase: "planning",
        message: "Scanning project structure...",
      });

      const abortController = new AbortController();
      execution.abortController = abortController;

      const options = {
        model: "claude-sonnet-4-20250514",
        systemPrompt: promptBuilder.getProjectAnalysisSystemPrompt(),
        maxTurns: 50,
        cwd: projectPath,
        allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
        permissionMode: "acceptEdits",
        sandbox: {
          enabled: true,
          autoAllowBashIfSandboxed: true,
        },
        abortController: abortController,
      };

      const prompt = promptBuilder.buildProjectAnalysisPrompt(projectPath);

      sendToRenderer({
        type: "auto_mode_progress",
        featureId: analysisId,
        content: "Starting project analysis...\n",
      });

      const currentQuery = query({ prompt, options });
      execution.query = currentQuery;

      let responseText = "";
      for await (const msg of currentQuery) {
        if (!execution.isActive()) break;

        if (msg.type === "assistant" && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === "text") {
              responseText += block.text;
              sendToRenderer({
                type: "auto_mode_progress",
                featureId: analysisId,
                content: block.text,
              });
            } else if (block.type === "tool_use") {
              sendToRenderer({
                type: "auto_mode_tool",
                featureId: analysisId,
                tool: block.name,
                input: block.input,
              });
            }
          }
        }
      }

      execution.query = null;
      execution.abortController = null;

      sendToRenderer({
        type: "auto_mode_phase",
        featureId: analysisId,
        phase: "verification",
        message: "Project analysis complete",
      });

      return {
        success: true,
        message: "Project analyzed successfully",
      };
    } catch (error) {
      if (error instanceof AbortError || error?.name === "AbortError") {
        console.log("[ProjectAnalyzer] Project analysis aborted");
        if (execution) {
          execution.abortController = null;
          execution.query = null;
        }
        return {
          success: false,
          message: "Analysis aborted",
        };
      }

      console.error("[ProjectAnalyzer] Error in project analysis:", error);
      if (execution) {
        execution.abortController = null;
        execution.query = null;
      }
      throw error;
    }
  }
}

module.exports = new ProjectAnalyzer();
