/**
 * Model Configuration - Centralized model settings for the app
 *
 * Models can be overridden via environment variables:
 * - AUTOMAKER_MODEL_CHAT: Model for chat interactions
 * - AUTOMAKER_MODEL_DEFAULT: Fallback model for all operations
 */

// Import shared model constants and types
import { CLAUDE_MODEL_MAP, DEFAULT_MODELS } from "@automaker/types";
import { resolveModelString } from "@automaker/model-resolver";

// Re-export for backward compatibility
export { CLAUDE_MODEL_MAP, DEFAULT_MODELS, resolveModelString };

/**
 * Get the model for chat operations
 *
 * Priority:
 * 1. Explicit model parameter
 * 2. AUTOMAKER_MODEL_CHAT environment variable
 * 3. AUTOMAKER_MODEL_DEFAULT environment variable
 * 4. Default chat model
 */
export function getChatModel(explicitModel?: string): string {
  if (explicitModel) {
    return resolveModelString(explicitModel);
  }

  const envModel =
    import.meta.env.AUTOMAKER_MODEL_CHAT || import.meta.env.AUTOMAKER_MODEL_DEFAULT;

  if (envModel) {
    return resolveModelString(envModel);
  }

  return DEFAULT_MODELS.claude;
}

/**
 * Default allowed tools for chat interactions
 */
export const CHAT_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "Bash",
  "WebSearch",
  "WebFetch",
] as const;

/**
 * Default max turns for chat
 */
export const CHAT_MAX_TURNS = 1000;
