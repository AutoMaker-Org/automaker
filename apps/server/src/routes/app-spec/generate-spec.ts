/**
 * Generate app_spec.txt from project overview
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import path from "path";
import fs from "fs/promises";
import type { EventEmitter } from "../../lib/events.js";
import { getAppSpecFormatInstruction } from "../../lib/app-spec-format.js";
import { createLogger } from "../../lib/logger.js";
import { createSpecGenerationOptions } from "../../lib/sdk-options.js";
import { logAuthStatus } from "./common.js";
import { generateFeaturesFromSpec } from "./generate-features-from-spec.js";
import { ensureAutomakerDir, getAppSpecPath } from "../../lib/automaker-paths.js";

const logger = createLogger("SpecRegeneration");

export async function generateSpec(
  projectPath: string,
  projectOverview: string,
  events: EventEmitter,
  abortController: AbortController,
  generateFeatures?: boolean,
  analyzeProject?: boolean,
  maxFeatures?: number
): Promise<void> {
  logger.info("========== generateSpec() started ==========");
  logger.info("projectPath:", projectPath);
  logger.info("projectOverview length:", `${projectOverview.length} chars`);
  logger.info("projectOverview preview:", projectOverview.substring(0, 300));
  logger.info("generateFeatures:", generateFeatures);
  logger.info("analyzeProject:", analyzeProject);
  logger.info("maxFeatures:", maxFeatures);

  // Build the prompt based on whether we should analyze the project
  let analysisInstructions = "";
  let techStackDefaults = "";

  if (analyzeProject !== false) {
    // Default to true - analyze the project
    analysisInstructions = `Based on this overview, analyze the project directory (if it exists) and create a comprehensive specification. Use the Read, Glob, and Grep tools to explore the codebase and understand:
- Existing technologies and frameworks
- Project structure and architecture
- Current features and capabilities
- Code patterns and conventions`;
  } else {
    // Use default tech stack
    techStackDefaults = `Default Technology Stack:
- Framework: TanStack Start (React-based full-stack framework)
- Database: PostgreSQL with Drizzle ORM
- UI Components: shadcn/ui
- Styling: Tailwind CSS
- Frontend: React

Use these technologies as the foundation for the specification.`;
  }

  const prompt = `You are helping to define a software project specification.

IMPORTANT: Never ask for clarification or additional information. Use the information provided and make reasonable assumptions to create the best possible specification. If details are missing, infer them based on common patterns and best practices.

Project Overview:
${projectOverview}

${techStackDefaults}

${analysisInstructions}

${getAppSpecFormatInstruction()}`;

  logger.info("========== PROMPT BEING SENT ==========");
  logger.info(`Prompt length: ${prompt.length} chars`);
  logger.info(`Prompt preview (first 500 chars):\n${prompt.substring(0, 500)}`);
  logger.info("========== END PROMPT PREVIEW ==========");

  events.emit("spec-regeneration:event", {
    type: "spec_progress",
    content: "Starting spec generation...\n",
  });

  const options = createSpecGenerationOptions({
    cwd: projectPath,
    abortController,
  });

  logger.debug("SDK Options:", JSON.stringify(options, null, 2));
  logger.info("Calling Claude Agent SDK query()...");

  // Log auth status right before the SDK call
  logAuthStatus("Right before SDK query()");

  let stream;
  try {
    stream = query({ prompt, options });
    logger.debug("query() returned stream successfully");
  } catch (queryError) {
    logger.error("❌ query() threw an exception:");
    logger.error("Error:", queryError);
    throw queryError;
  }

  let responseText = "";
  let messageCount = 0;

  logger.info("Starting to iterate over stream...");

  try {
    for await (const msg of stream) {
      messageCount++;
      logger.info(
        `Stream message #${messageCount}: type=${msg.type}, subtype=${
          (msg as any).subtype
        }`
      );

      if (msg.type === "assistant") {
        // Log the full message structure to debug
        logger.info(`Assistant msg keys: ${Object.keys(msg).join(", ")}`);
        const msgAny = msg as any;
        if (msgAny.message) {
          logger.info(
            `msg.message keys: ${Object.keys(msgAny.message).join(", ")}`
          );
          if (msgAny.message.content) {
            logger.info(
              `msg.message.content length: ${msgAny.message.content.length}`
            );
            for (const block of msgAny.message.content) {
              logger.info(
                `Block keys: ${Object.keys(block).join(", ")}, type: ${
                  block.type
                }`
              );
              if (block.type === "text") {
                responseText += block.text;
                logger.info(
                  `Text block received (${block.text.length} chars), total now: ${responseText.length} chars`
                );
                logger.info(`Text preview: ${block.text.substring(0, 200)}...`);
                events.emit("spec-regeneration:event", {
                  type: "spec_regeneration_progress",
                  content: block.text,
                  projectPath: projectPath,
                });
              } else if (block.type === "tool_use") {
                logger.info("Tool use:", block.name);
                events.emit("spec-regeneration:event", {
                  type: "spec_tool",
                  tool: block.name,
                  input: block.input,
                });
              }
            }
          } else {
            logger.warn("msg.message.content is falsy");
          }
        } else {
          logger.warn("msg.message is falsy");
          // Log full message to see structure
          logger.info(
            `Full assistant msg: ${JSON.stringify(msg).substring(0, 1000)}`
          );
        }
      } else if (msg.type === "result" && (msg as any).subtype === "success") {
        logger.info("Received success result");
        logger.info(`Result value: "${(msg as any).result}"`);
        logger.info(
          `Current responseText length before result: ${responseText.length}`
        );
        // Only use result if it has content, otherwise keep accumulated text
        if ((msg as any).result && (msg as any).result.length > 0) {
          logger.info("Using result value as responseText");
          responseText = (msg as any).result;
        } else {
          logger.info("Result is empty, keeping accumulated responseText");
        }
      } else if (msg.type === "result") {
        // Handle all result types
        const subtype = (msg as any).subtype;
        logger.info(`Result message: subtype=${subtype}`);
        if (subtype === "error_max_turns") {
          logger.error(
            "❌ Hit max turns limit! Claude used too many tool calls."
          );
          logger.info(`responseText so far: ${responseText.length} chars`);
        }
      } else if ((msg as { type: string }).type === "error") {
        logger.error("❌ Received error message from stream:");
        logger.error("Error message:", JSON.stringify(msg, null, 2));
      } else if (msg.type === "user") {
        // Log user messages (tool results)
        logger.info(
          `User message (tool result): ${JSON.stringify(msg).substring(0, 500)}`
        );
      }
    }
  } catch (streamError) {
    logger.error("❌ Error while iterating stream:");
    logger.error("Stream error:", streamError);
    throw streamError;
  }

  logger.info(`Stream iteration complete. Total messages: ${messageCount}`);
  logger.info(`Response text length: ${responseText.length} chars`);
  logger.info("========== FINAL RESPONSE TEXT ==========");
  logger.info(responseText || "(empty)");
  logger.info("========== END RESPONSE TEXT ==========");

  if (!responseText || responseText.trim().length === 0) {
    logger.error("❌ WARNING: responseText is empty! Nothing to save.");
  }

  // Save spec to external automaker directory
  const specDir = await ensureAutomakerDir(projectPath);
  const specPath = await getAppSpecPath(projectPath);

  logger.info("Saving spec to:", specPath);
  logger.info(`Content to save (${responseText.length} chars)`);

  await fs.writeFile(specPath, responseText);

  // Verify the file was written
  const savedContent = await fs.readFile(specPath, "utf-8");
  logger.info(`Verified saved file: ${savedContent.length} chars`);
  if (savedContent.length === 0) {
    logger.error("❌ File was saved but is empty!");
  }

  logger.info("Spec saved successfully");

  // Emit spec completion event
  if (generateFeatures) {
    // If features will be generated, emit intermediate completion
    events.emit("spec-regeneration:event", {
      type: "spec_regeneration_progress",
      content: "[Phase: spec_complete] Spec created! Generating features...\n",
      projectPath: projectPath,
    });
  } else {
    // If no features, emit final completion
    events.emit("spec-regeneration:event", {
      type: "spec_regeneration_complete",
      message: "Spec regeneration complete!",
      projectPath: projectPath,
    });
  }

  // If generate features was requested, generate them from the spec
  if (generateFeatures) {
    logger.info("Starting feature generation from spec...");
    // Create a new abort controller for feature generation
    const featureAbortController = new AbortController();
    try {
      await generateFeaturesFromSpec(
        projectPath,
        events,
        featureAbortController,
        maxFeatures
      );
      // Final completion will be emitted by generateFeaturesFromSpec -> parseAndCreateFeatures
    } catch (featureError) {
      logger.error("Feature generation failed:", featureError);
      // Don't throw - spec generation succeeded, feature generation is optional
      events.emit("spec-regeneration:event", {
        type: "spec_regeneration_error",
        error: (featureError as Error).message || "Feature generation failed",
        projectPath: projectPath,
      });
    }
  }

  logger.debug("========== generateSpec() completed ==========");
}
