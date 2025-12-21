/**
 * Business logic for generating suggestions
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { EventEmitter } from "../../lib/events.js";
import { createLogger } from "@automaker/utils";
import { createSuggestionsOptions } from "../../lib/sdk-options.js";

const logger = createLogger("Suggestions");

/**
 * JSON Schema for suggestions output
 */
const suggestionsSchema = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          category: { type: "string" },
          description: { type: "string" },
          steps: {
            type: "array",
            items: { type: "string" },
          },
          priority: { 
            type: "number",
            minimum: 1,
            maximum: 3,
          },
          reasoning: { type: "string" },
        },
        required: ["category", "description", "steps", "priority", "reasoning"],
      },
    },
  },
  required: ["suggestions"],
  additionalProperties: false,
};

export async function generateSuggestions(
  projectPath: string,
  suggestionType: string,
  events: EventEmitter,
  abortController: AbortController
): Promise<void> {
  const typePrompts: Record<string, string> = {
    features:
      "Analyze this project and suggest new features that would add value.",
    refactoring: "Analyze this project and identify refactoring opportunities.",
    security:
      "Analyze this project for security vulnerabilities and suggest fixes.",
    performance:
      "Analyze this project for performance issues and suggest optimizations.",
  };

  const prompt = `${typePrompts[suggestionType] || typePrompts.features}

Look at the codebase and provide 3-5 concrete suggestions.

For each suggestion, provide:
1. A category (e.g., "User Experience", "Security", "Performance")
2. A clear description of what to implement
3. Concrete steps to implement it
4. Priority (1=high, 2=medium, 3=low)
5. Brief reasoning for why this would help

The response will be automatically formatted as structured JSON.`;

  events.emit("suggestions:event", {
    type: "suggestions_progress",
    content: `Starting ${suggestionType} analysis...\n`,
  });

  const options = createSuggestionsOptions({
    cwd: projectPath,
    abortController,
    outputFormat: {
      type: "json_schema",
      schema: suggestionsSchema,
    },
  });

  const stream = query({ prompt, options });
  let responseText = "";
  let structuredOutput: { suggestions: Array<Record<string, unknown>> } | null = null;

  for await (const msg of stream) {
    if (msg.type === "assistant" && msg.message.content) {
      for (const block of msg.message.content) {
        if (block.type === "text") {
          responseText += block.text;
          events.emit("suggestions:event", {
            type: "suggestions_progress",
            content: block.text,
          });
        } else if (block.type === "tool_use") {
          events.emit("suggestions:event", {
            type: "suggestions_tool",
            tool: block.name,
            input: block.input,
          });
        }
      }
    } else if (msg.type === "result" && msg.subtype === "success") {
      // Check for structured output
      const resultMsg = msg as any;
      if (resultMsg.structured_output) {
        structuredOutput = resultMsg.structured_output as {
          suggestions: Array<Record<string, unknown>>;
        };
        logger.debug("Received structured output:", structuredOutput);
      }
    } else if (msg.type === "result") {
      const resultMsg = msg as any;
      if (resultMsg.subtype === "error_max_structured_output_retries") {
        logger.error("Failed to produce valid structured output after retries");
        throw new Error("Could not produce valid suggestions output");
      } else if (resultMsg.subtype === "error_max_turns") {
        logger.error("Hit max turns limit before completing suggestions generation");
        logger.warn(`Response text length: ${responseText.length} chars`);
        // Still try to parse what we have
      }
    }
  }

  // Use structured output if available, otherwise fall back to parsing text
  try {
    if (structuredOutput && structuredOutput.suggestions) {
      // Use structured output directly
      events.emit("suggestions:event", {
        type: "suggestions_complete",
        suggestions: structuredOutput.suggestions.map(
          (s: Record<string, unknown>, i: number) => ({
            ...s,
            id: s.id || `suggestion-${Date.now()}-${i}`,
          })
        ),
      });
    } else {
      // Fallback: try to parse from text (for backwards compatibility)
      logger.warn("No structured output received, attempting to parse from text");
      const jsonMatch = responseText.match(/\{[\s\S]*"suggestions"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        events.emit("suggestions:event", {
          type: "suggestions_complete",
          suggestions: parsed.suggestions.map(
            (s: Record<string, unknown>, i: number) => ({
              ...s,
              id: s.id || `suggestion-${Date.now()}-${i}`,
            })
          ),
        });
      } else {
        throw new Error("No valid JSON found in response");
      }
    }
  } catch (error) {
    // Log the parsing error for debugging
    logger.error("Failed to parse suggestions JSON from AI response:", error);
    // Return generic suggestions if parsing fails
    events.emit("suggestions:event", {
      type: "suggestions_complete",
      suggestions: [
        {
          id: `suggestion-${Date.now()}-0`,
          category: "Analysis",
          description: "Review the AI analysis output for insights",
          steps: ["Review the generated analysis"],
          priority: 1,
          reasoning:
            "The AI provided analysis but suggestions need manual review",
        },
      ],
    });
  }
}
