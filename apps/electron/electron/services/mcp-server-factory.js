const { createSdkMcpServer, tool } = require("@anthropic-ai/claude-agent-sdk");
const { z } = require("zod");
const featureLoader = require("./feature-loader");

/**
 * MCP Server Factory - Creates custom MCP servers with tools
 */
class McpServerFactory {
  /**
   * Create a custom MCP server with the UpdateFeatureStatus tool
   * This tool allows Claude Code to safely update feature status without
   * directly modifying feature files, preventing race conditions
   * and accidental state corruption.
   */
  createFeatureToolsServer(updateFeatureStatusCallback, projectPath) {
    return createSdkMcpServer({
      name: "automaker-tools",
      version: "1.0.0",
      tools: [
        tool(
          "UpdateFeatureStatus",
          "Create or update a feature. Use this tool to create new features with detailed information or update existing feature status. When creating features, provide comprehensive description, category, and implementation steps.",
          {
            featureId: z.string().describe("The ID of the feature (lowercase, hyphens for spaces). Example: 'user-authentication', 'budget-tracking'"),
            status: z.enum(["backlog", "todo", "in_progress", "verified"]).describe("The status for the feature. Use 'backlog' or 'todo' for new features."),
            summary: z.string().optional().describe("A brief summary of what was implemented/changed or what the feature does."),
            description: z.string().optional().describe("A detailed description of the feature. Be comprehensive - explain what the feature does, its purpose, and key functionality."),
            category: z.string().optional().describe("The category/phase for this feature. Example: 'Phase 1: Foundation', 'Phase 2: Core Logic', 'Phase 3: Polish', 'Authentication', 'UI/UX'"),
            steps: z.array(z.string()).optional().describe("Array of implementation steps. Each step should be a clear, actionable task. Example: ['Set up database schema', 'Create API endpoints', 'Build UI components', 'Add validation']")
          },
          async (args) => {
            try {
              console.log(`[McpServerFactory] UpdateFeatureStatus tool called: featureId=${args.featureId}, status=${args.status}, summary=${args.summary || "(none)"}, category=${args.category || "(none)"}, steps=${args.steps?.length || 0}`);
              console.log(`[Feature Creation] Creating/updating feature "${args.featureId}" with status "${args.status}"`);

              // Load the feature to check skipTests flag
              const features = await featureLoader.loadFeatures(projectPath);
              const feature = features.find((f) => f.id === args.featureId);

              if (!feature) {
                console.log(`[Feature Creation] Feature ${args.featureId} not found - this might be a new feature being created`);
                // This might be a new feature - try to proceed anyway
              }

              // If agent tries to mark as verified but feature has skipTests=true, convert to waiting_approval
              let finalStatus = args.status;
              // Convert 'todo' to 'backlog' for consistency, but only for new features
              if (!feature && finalStatus === "todo") {
                finalStatus = "backlog";
              }
              if (feature && args.status === "verified" && feature.skipTests === true) {
                console.log(`[McpServerFactory] Feature ${args.featureId} has skipTests=true, converting verified -> waiting_approval`);
                finalStatus = "waiting_approval";
              }

              // Call the provided callback to update feature status
              await updateFeatureStatusCallback(
                args.featureId, 
                finalStatus, 
                projectPath, 
                {
                  summary: args.summary,
                  description: args.description,
                  category: args.category,
                  steps: args.steps,
                }
              );

              const statusMessage = finalStatus !== args.status
                ? `Successfully created/updated feature ${args.featureId} to status "${finalStatus}" (converted from "${args.status}")${args.summary ? ` - ${args.summary}` : ""}`
                : `Successfully created/updated feature ${args.featureId} to status "${finalStatus}"${args.summary ? ` - ${args.summary}` : ""}`;

              console.log(`[Feature Creation] ✓ ${statusMessage}`);

              return {
                content: [{
                  type: "text",
                  text: statusMessage
                }]
              };
            } catch (error) {
              console.error("[McpServerFactory] UpdateFeatureStatus tool error:", error);
              console.error(`[Feature Creation] ✗ Failed to create/update feature ${args.featureId}: ${error.message}`);
              return {
                content: [{
                  type: "text",
                  text: `Failed to update feature status: ${error.message}`
                }]
              };
            }
          }
        )
      ]
    });
  }
}

module.exports = new McpServerFactory();
