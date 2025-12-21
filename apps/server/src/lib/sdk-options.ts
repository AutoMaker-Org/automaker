/**
 * SDK Options Factory - Centralized configuration for Claude Agent SDK
 *
 * Provides presets for common use cases:
 * - Spec generation: Long-running analysis with read-only tools
 * - Feature generation: Quick JSON generation from specs
 * - Feature building: Autonomous feature implementation with full tool access
 * - Suggestions: Analysis with read-only tools
 * - Chat: Full tool access for interactive coding
 *
 * Uses model-resolver for consistent model handling across the application.
 */

import type { Options } from "@anthropic-ai/claude-agent-sdk";
import { resolveModelString } from "@automaker/model-resolver";
import { DEFAULT_MODELS, CLAUDE_MODEL_MAP } from "@automaker/types";

/**
 * Tool presets for different use cases
 */
export const TOOL_PRESETS = {
  /** Read-only tools for analysis */
  readOnly: ["Read", "Glob", "Grep"] as const,

  /** Tools for spec generation that needs to read the codebase */
  specGeneration: ["Read", "Glob", "Grep"] as const,

  /** Full tool access for feature implementation */
  fullAccess: [
    "Read",
    "Write",
    "Edit",
    "Glob",
    "Grep",
    "Bash",
    "WebSearch",
    "WebFetch",
  ] as const,

  /** Tools for chat/interactive mode */
  chat: [
    "Read",
    "Write",
    "Edit",
    "Glob",
    "Grep",
    "Bash",
    "WebSearch",
    "WebFetch",
  ] as const,
} as const;

/**
 * Max turns presets for different use cases
 */
export const MAX_TURNS = {
  /** Quick operations that shouldn't need many iterations */
  quick: 50,

  /** Standard operations */
  standard: 100,

  /** Long-running operations like full spec generation */
  extended: 250,

  /** Very long operations that may require extensive exploration */
  maximum: 1000,
} as const;

/**
 * Model presets for different use cases
 *
 * These can be overridden via environment variables:
 * - AUTOMAKER_MODEL_SPEC: Model for spec generation
 * - AUTOMAKER_MODEL_FEATURES: Model for feature generation
 * - AUTOMAKER_MODEL_SUGGESTIONS: Model for suggestions
 * - AUTOMAKER_MODEL_CHAT: Model for chat
 * - AUTOMAKER_MODEL_DEFAULT: Fallback model for all operations
 */
export function getModelForUseCase(
  useCase: "spec" | "features" | "suggestions" | "chat" | "auto" | "default",
  explicitModel?: string
): string {
  // Explicit model takes precedence
  if (explicitModel) {
    return resolveModelString(explicitModel);
  }

  // Check environment variable override for this use case
  const envVarMap: Record<string, string | undefined> = {
    spec: process.env.AUTOMAKER_MODEL_SPEC,
    features: process.env.AUTOMAKER_MODEL_FEATURES,
    suggestions: process.env.AUTOMAKER_MODEL_SUGGESTIONS,
    chat: process.env.AUTOMAKER_MODEL_CHAT,
    auto: process.env.AUTOMAKER_MODEL_AUTO,
    default: process.env.AUTOMAKER_MODEL_DEFAULT,
  };

  const envModel = envVarMap[useCase] || envVarMap.default;
  if (envModel) {
    return resolveModelString(envModel);
  }

  const defaultModels: Record<string, string> = {
    spec: CLAUDE_MODEL_MAP["haiku"], // used to generate app specs
    features: CLAUDE_MODEL_MAP["haiku"], // used to generate features from app specs
    suggestions: CLAUDE_MODEL_MAP["haiku"], // used for suggestions
    chat: CLAUDE_MODEL_MAP["haiku"], // used for chat
    auto: CLAUDE_MODEL_MAP["opus"], // used to implement kanban cards
    default: CLAUDE_MODEL_MAP["opus"],
  };

  return resolveModelString(defaultModels[useCase] || DEFAULT_MODELS.claude);
}

/**
 * Base options that apply to all SDK calls
 */
function getBaseOptions(): Partial<Options> {
  return {
    permissionMode: "acceptEdits",
  };
}

/**
 * Options configuration for creating SDK options
 */
export interface CreateSdkOptionsConfig {
  /** Working directory for the agent */
  cwd: string;

  /** Optional explicit model override */
  model?: string;

  /** Optional session model (used as fallback if explicit model not provided) */
  sessionModel?: string;

  /** Optional system prompt */
  systemPrompt?: string;

  /** Optional abort controller for cancellation */
  abortController?: AbortController;

  /** Optional output format for structured outputs */
  outputFormat?: {
    type: "json_schema";
    schema: Record<string, unknown>;
  };
}

/**
 * Create SDK options for spec generation
 *
 * Configuration:
 * - Uses read-only tools for codebase analysis
 * - Extended turns for thorough exploration
 * - Opus model by default (can be overridden)
 */
export function createSpecGenerationOptions(
  config: CreateSdkOptionsConfig
): Options {
  return {
    ...getBaseOptions(),
    // Override permissionMode - spec generation only needs read-only tools
    // Using "acceptEdits" can cause Claude to write files to unexpected locations
    // See: https://github.com/AutoMaker-Org/automaker/issues/149
    permissionMode: "default",
    model: getModelForUseCase("spec", config.model),
    maxTurns: MAX_TURNS.maximum,
    cwd: config.cwd,
    allowedTools: [...TOOL_PRESETS.specGeneration],
    ...(config.systemPrompt && { systemPrompt: config.systemPrompt }),
    ...(config.abortController && { abortController: config.abortController }),
    ...(config.outputFormat && { outputFormat: config.outputFormat }),
  };
}

/**
 * Create SDK options for feature generation from specs
 *
 * Configuration:
 * - Uses read-only tools (just needs to read the spec)
 * - Quick turns since it's mostly JSON generation
 * - Sonnet model by default for speed
 */
export function createFeatureGenerationOptions(
  config: CreateSdkOptionsConfig
): Options {
  return {
    ...getBaseOptions(),
    // Override permissionMode - feature generation only needs read-only tools
    permissionMode: "default",
    model: getModelForUseCase("features", config.model),
    maxTurns: MAX_TURNS.quick,
    cwd: config.cwd,
    allowedTools: [...TOOL_PRESETS.readOnly],
    ...(config.systemPrompt && { systemPrompt: config.systemPrompt }),
    ...(config.abortController && { abortController: config.abortController }),
  };
}

/**
 * Create SDK options for generating suggestions
 *
 * Configuration:
 * - Uses read-only tools for analysis
 * - Standard turns to allow thorough codebase exploration and structured output generation
 * - Opus model by default for thorough analysis
 */
export function createSuggestionsOptions(
  config: CreateSdkOptionsConfig
): Options {
  return {
    ...getBaseOptions(),
    model: getModelForUseCase("suggestions", config.model),
    maxTurns: MAX_TURNS.extended,
    cwd: config.cwd,
    allowedTools: [...TOOL_PRESETS.readOnly],
    ...(config.systemPrompt && { systemPrompt: config.systemPrompt }),
    ...(config.abortController && { abortController: config.abortController }),
    ...(config.outputFormat && { outputFormat: config.outputFormat }),
  };
}

/**
 * Create SDK options for chat/interactive mode
 *
 * Configuration:
 * - Full tool access for code modification
 * - Standard turns for interactive sessions
 * - Model priority: explicit model > session model > chat default
 * - Sandbox enabled for bash safety
 */
export function createChatOptions(config: CreateSdkOptionsConfig): Options {
  // Model priority: explicit model > session model > chat default
  const effectiveModel = config.model || config.sessionModel;

  return {
    ...getBaseOptions(),
    model: getModelForUseCase("chat", effectiveModel),
    maxTurns: MAX_TURNS.standard,
    cwd: config.cwd,
    allowedTools: [...TOOL_PRESETS.chat],
    sandbox: {
      enabled: true,
      autoAllowBashIfSandboxed: true,
    },
    ...(config.systemPrompt && { systemPrompt: config.systemPrompt }),
    ...(config.abortController && { abortController: config.abortController }),
  };
}

/**
 * Create SDK options for autonomous feature building/implementation
 *
 * Configuration:
 * - Full tool access for code modification and implementation
 * - Extended turns for thorough feature implementation
 * - Uses default model (can be overridden)
 * - Sandbox enabled for bash safety
 */
export function createAutoModeOptions(config: CreateSdkOptionsConfig): Options {
  return {
    ...getBaseOptions(),
    model: getModelForUseCase("auto", config.model),
    maxTurns: MAX_TURNS.maximum,
    cwd: config.cwd,
    allowedTools: [...TOOL_PRESETS.fullAccess],
    sandbox: {
      enabled: true,
      autoAllowBashIfSandboxed: true,
    },
    ...(config.systemPrompt && { systemPrompt: config.systemPrompt }),
    ...(config.abortController && { abortController: config.abortController }),
  };
}

/**
 * Create custom SDK options with explicit configuration
 *
 * Use this when the preset options don't fit your use case.
 */
export function createCustomOptions(
  config: CreateSdkOptionsConfig & {
    maxTurns?: number;
    allowedTools?: readonly string[];
    sandbox?: { enabled: boolean; autoAllowBashIfSandboxed?: boolean };
  }
): Options {
  return {
    ...getBaseOptions(),
    model: getModelForUseCase("default", config.model),
    maxTurns: config.maxTurns ?? MAX_TURNS.maximum,
    cwd: config.cwd,
    allowedTools: config.allowedTools
      ? [...config.allowedTools]
      : [...TOOL_PRESETS.readOnly],
    ...(config.sandbox && { sandbox: config.sandbox }),
    ...(config.systemPrompt && { systemPrompt: config.systemPrompt }),
    ...(config.abortController && { abortController: config.abortController }),
  };
}
