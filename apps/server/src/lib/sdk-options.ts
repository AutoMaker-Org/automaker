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
 *
 * SECURITY: All factory functions validate the working directory (cwd) against
 * ALLOWED_ROOT_DIRECTORY before returning options. This provides a centralized
 * security check that applies to ALL AI model invocations, regardless of provider.
 */

import type { Options } from '@anthropic-ai/claude-agent-sdk';
import path from 'path';
import { resolveModelString } from '@automaker/model-resolver';
import { createLogger } from '@automaker/utils';

const logger = createLogger('SdkOptions');
import {
  DEFAULT_MODELS,
  CLAUDE_MODEL_MAP,
  type McpServerConfig,
  type ThinkingLevel,
  getThinkingTokenBudget,
} from '@automaker/types';
import { isPathAllowed, PathNotAllowedError, getAllowedRootDirectory } from '@automaker/platform';

/**
 * Result of sandbox compatibility check
 */
export interface SandboxCompatibilityResult {
  /** Whether sandbox mode can be enabled for this path */
  enabled: boolean;
  /** Optional message explaining why sandbox is disabled */
  message?: string;
}

/**
 * Check if a working directory is compatible with sandbox mode.
 * Some paths (like cloud storage mounts) may not work with sandboxed execution.
 *
 * @param cwd - The working directory to check
 * @param sandboxRequested - Whether sandbox mode was requested by settings
 * @returns Object indicating if sandbox can be enabled and why not if disabled
 */
export function checkSandboxCompatibility(
  cwd: string,
  sandboxRequested: boolean
): SandboxCompatibilityResult {
  if (!sandboxRequested) {
    return { enabled: false };
  }

  const resolvedCwd = path.resolve(cwd);

  // Check for cloud storage paths that may not be compatible with sandbox
  const cloudStoragePatterns = [
    // macOS mounted volumes
    /^\/Volumes\/GoogleDrive/i,
    /^\/Volumes\/Dropbox/i,
    /^\/Volumes\/OneDrive/i,
    /^\/Volumes\/iCloud/i,
    // macOS home directory
    /^\/Users\/[^/]+\/Google Drive/i,
    /^\/Users\/[^/]+\/Dropbox/i,
    /^\/Users\/[^/]+\/OneDrive/i,
    /^\/Users\/[^/]+\/Library\/Mobile Documents/i, // iCloud
    // Linux home directory
    /^\/home\/[^/]+\/Google Drive/i,
    /^\/home\/[^/]+\/Dropbox/i,
    /^\/home\/[^/]+\/OneDrive/i,
    // Windows
    /^C:\\Users\\[^\\]+\\Google Drive/i,
    /^C:\\Users\\[^\\]+\\Dropbox/i,
    /^C:\\Users\\[^\\]+\\OneDrive/i,
  ];

  for (const pattern of cloudStoragePatterns) {
    if (pattern.test(resolvedCwd)) {
      return {
        enabled: false,
        message: `Sandbox disabled: Cloud storage path detected (${resolvedCwd}). Sandbox mode may not work correctly with cloud-synced directories.`,
      };
    }
  }

  return { enabled: true };
}

/**
 * Validate that a working directory is allowed by ALLOWED_ROOT_DIRECTORY.
 * This is the centralized security check for ALL AI model invocations.
 *
 * @param cwd - The working directory to validate
 * @throws PathNotAllowedError if the directory is not within ALLOWED_ROOT_DIRECTORY
 *
 * This function is called by all create*Options() factory functions to ensure
 * that AI models can only operate within allowed directories. This applies to:
 * - All current models (Claude, future models)
 * - All invocation types (chat, auto-mode, spec generation, etc.)
 */
export function validateWorkingDirectory(cwd: string): void {
  const resolvedCwd = path.resolve(cwd);

  if (!isPathAllowed(resolvedCwd)) {
    const allowedRoot = getAllowedRootDirectory();
    throw new PathNotAllowedError(
      `Working directory "${cwd}" (resolved: ${resolvedCwd}) is not allowed. ` +
        (allowedRoot
          ? `Must be within ALLOWED_ROOT_DIRECTORY: ${allowedRoot}`
          : 'ALLOWED_ROOT_DIRECTORY is configured but path is not within allowed directories.')
    );
  }
}

/**
 * Tool presets for different use cases
 */
export const TOOL_PRESETS = {
  /** Read-only tools for analysis */
  readOnly: ['Read', 'Glob', 'Grep'] as const,

  /** Tools for spec generation that needs to read the codebase */
  specGeneration: ['Read', 'Glob', 'Grep'] as const,

  /** Full tool access for feature implementation */
  fullAccess: [
    'Read',
    'Write',
    'Edit',
    'Glob',
    'Grep',
    'Bash',
    'WebSearch',
    'WebFetch',
    'TodoWrite',
  ] as const,

  /** Tools for chat/interactive mode */
  chat: [
    'Read',
    'Write',
    'Edit',
    'Glob',
    'Grep',
    'Bash',
    'WebSearch',
    'WebFetch',
    'TodoWrite',
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
  useCase: 'spec' | 'features' | 'suggestions' | 'chat' | 'auto' | 'default',
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
    spec: CLAUDE_MODEL_MAP['haiku'], // used to generate app specs
    features: CLAUDE_MODEL_MAP['haiku'], // used to generate features from app specs
    suggestions: CLAUDE_MODEL_MAP['haiku'], // used for suggestions
    chat: CLAUDE_MODEL_MAP['haiku'], // used for chat
    auto: CLAUDE_MODEL_MAP['opus'], // used to implement kanban cards
    default: CLAUDE_MODEL_MAP['opus'],
  };

  return resolveModelString(defaultModels[useCase] || DEFAULT_MODELS.claude);
}

/**
 * Base options that apply to all SDK calls
 * AUTONOMOUS MODE: Always bypass permissions for fully autonomous operation
 */
function getBaseOptions(): Partial<Options> {
  return {
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
  };
}

/**
 * MCP options result
 */
interface McpOptions {
  /** Options to spread for MCP servers */
  mcpServerOptions: Partial<Options>;
}

/**
 * Build MCP-related options based on configuration.
 *
 * @param config - The SDK options config
 * @returns Object with MCP server settings to spread into final options
 */
function buildMcpOptions(config: CreateSdkOptionsConfig): McpOptions {
  return {
    // Include MCP servers if configured
    mcpServerOptions: config.mcpServers ? { mcpServers: config.mcpServers } : {},
  };
}

/**
 * Build thinking options for SDK configuration.
 * Converts ThinkingLevel to maxThinkingTokens for the Claude SDK.
 *
 * @param thinkingLevel - The thinking level to convert
 * @returns Object with maxThinkingTokens if thinking is enabled
 */
function buildThinkingOptions(thinkingLevel?: ThinkingLevel): Partial<Options> {
  const maxThinkingTokens = getThinkingTokenBudget(thinkingLevel);
  logger.debug(
    `buildThinkingOptions: thinkingLevel="${thinkingLevel}" -> maxThinkingTokens=${maxThinkingTokens}`
  );
  return maxThinkingTokens ? { maxThinkingTokens } : {};
}

/**
 * Build system prompt configuration based on autoLoadClaudeMd setting.
 * When autoLoadClaudeMd is true:
 * - Uses preset mode with 'claude_code' to enable CLAUDE.md auto-loading
 * - If there's a custom systemPrompt, appends it to the preset
 * - Sets settingSources to ['project'] for SDK to load CLAUDE.md files
 *
 * @param config - The SDK options config
 * @returns Object with systemPrompt and settingSources for SDK options
 */
function buildClaudeMdOptions(config: CreateSdkOptionsConfig): {
  systemPrompt?: string | SystemPromptConfig;
  settingSources?: Array<'user' | 'project' | 'local'>;
} {
  if (!config.autoLoadClaudeMd) {
    // Standard mode - just pass through the system prompt as-is
    return config.systemPrompt ? { systemPrompt: config.systemPrompt } : {};
  }

  // Auto-load CLAUDE.md mode - use preset with settingSources
  const result: {
    systemPrompt: SystemPromptConfig;
    settingSources: Array<'user' | 'project' | 'local'>;
  } = {
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
    },
    // Load both user (~/.claude/CLAUDE.md) and project (.claude/CLAUDE.md) settings
    settingSources: ['user', 'project'],
  };

  // If there's a custom system prompt, append it to the preset
  if (config.systemPrompt) {
    result.systemPrompt.append = config.systemPrompt;
  }

  return result;
}

/**
 * System prompt configuration for SDK options
 * When using preset mode with claude_code, CLAUDE.md files are automatically loaded
 */
export interface SystemPromptConfig {
  /** Use preset mode with claude_code to enable CLAUDE.md auto-loading */
  type: 'preset';
  /** The preset to use - 'claude_code' enables CLAUDE.md loading */
  preset: 'claude_code';
  /** Optional additional prompt to append to the preset */
  append?: string;
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
    type: 'json_schema';
    schema: Record<string, unknown>;
  };

  /** Enable auto-loading of CLAUDE.md files via SDK's settingSources */
  autoLoadClaudeMd?: boolean;

  /** MCP servers to make available to the agent */
  mcpServers?: Record<string, McpServerConfig>;

  /** Extended thinking level for Claude models */
  thinkingLevel?: ThinkingLevel;
}

// Re-export MCP types from @automaker/types for convenience
export type {
  McpServerConfig,
  McpStdioServerConfig,
  McpSSEServerConfig,
  McpHttpServerConfig,
} from '@automaker/types';

/**
 * Create SDK options for spec generation
 *
 * Configuration:
 * - Uses read-only tools for codebase analysis
 * - Extended turns for thorough exploration
 * - Opus model by default (can be overridden)
 * - When autoLoadClaudeMd is true, uses preset mode and settingSources for CLAUDE.md loading
 */
export function createSpecGenerationOptions(config: CreateSdkOptionsConfig): Options {
  // Validate working directory before creating options
  validateWorkingDirectory(config.cwd);

  // Build CLAUDE.md auto-loading options if enabled
  const claudeMdOptions = buildClaudeMdOptions(config);

  // Build thinking options
  const thinkingOptions = buildThinkingOptions(config.thinkingLevel);

  return {
    ...getBaseOptions(),
    // Override permissionMode - spec generation only needs read-only tools
    // Using "acceptEdits" can cause Claude to write files to unexpected locations
    // See: https://github.com/AutoMaker-Org/automaker/issues/149
    permissionMode: 'default',
    model: getModelForUseCase('spec', config.model),
    maxTurns: MAX_TURNS.maximum,
    cwd: config.cwd,
    allowedTools: [...TOOL_PRESETS.specGeneration],
    ...claudeMdOptions,
    ...thinkingOptions,
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
 * - When autoLoadClaudeMd is true, uses preset mode and settingSources for CLAUDE.md loading
 */
export function createFeatureGenerationOptions(config: CreateSdkOptionsConfig): Options {
  // Validate working directory before creating options
  validateWorkingDirectory(config.cwd);

  // Build CLAUDE.md auto-loading options if enabled
  const claudeMdOptions = buildClaudeMdOptions(config);

  // Build thinking options
  const thinkingOptions = buildThinkingOptions(config.thinkingLevel);

  return {
    ...getBaseOptions(),
    // Override permissionMode - feature generation only needs read-only tools
    permissionMode: 'default',
    model: getModelForUseCase('features', config.model),
    maxTurns: MAX_TURNS.quick,
    cwd: config.cwd,
    allowedTools: [...TOOL_PRESETS.readOnly],
    ...claudeMdOptions,
    ...thinkingOptions,
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
 * - When autoLoadClaudeMd is true, uses preset mode and settingSources for CLAUDE.md loading
 */
export function createSuggestionsOptions(config: CreateSdkOptionsConfig): Options {
  // Validate working directory before creating options
  validateWorkingDirectory(config.cwd);

  // Build CLAUDE.md auto-loading options if enabled
  const claudeMdOptions = buildClaudeMdOptions(config);

  // Build thinking options
  const thinkingOptions = buildThinkingOptions(config.thinkingLevel);

  return {
    ...getBaseOptions(),
    model: getModelForUseCase('suggestions', config.model),
    maxTurns: MAX_TURNS.extended,
    cwd: config.cwd,
    allowedTools: [...TOOL_PRESETS.readOnly],
    ...claudeMdOptions,
    ...thinkingOptions,
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
 * - When autoLoadClaudeMd is true, uses preset mode and settingSources for CLAUDE.md loading
 */
export function createChatOptions(config: CreateSdkOptionsConfig): Options {
  // Validate working directory before creating options
  validateWorkingDirectory(config.cwd);

  // Model priority: explicit model > session model > chat default
  const effectiveModel = config.model || config.sessionModel;

  // Build CLAUDE.md auto-loading options if enabled
  const claudeMdOptions = buildClaudeMdOptions(config);

  // Build MCP-related options
  const mcpOptions = buildMcpOptions(config);

  // Build thinking options
  const thinkingOptions = buildThinkingOptions(config.thinkingLevel);

  return {
    ...getBaseOptions(),
    model: getModelForUseCase('chat', effectiveModel),
    maxTurns: MAX_TURNS.standard,
    cwd: config.cwd,
    allowedTools: [...TOOL_PRESETS.chat],
    ...claudeMdOptions,
    ...thinkingOptions,
    ...(config.abortController && { abortController: config.abortController }),
    ...mcpOptions.mcpServerOptions,
  };
}

/**
 * Create SDK options for autonomous feature building/implementation
 *
 * Configuration:
 * - Full tool access for code modification and implementation
 * - Extended turns for thorough feature implementation
 * - Uses default model (can be overridden)
 * - When autoLoadClaudeMd is true, uses preset mode and settingSources for CLAUDE.md loading
 */
export function createAutoModeOptions(config: CreateSdkOptionsConfig): Options {
  // Validate working directory before creating options
  validateWorkingDirectory(config.cwd);

  // Build CLAUDE.md auto-loading options if enabled
  const claudeMdOptions = buildClaudeMdOptions(config);

  // Build MCP-related options
  const mcpOptions = buildMcpOptions(config);

  // Build thinking options
  const thinkingOptions = buildThinkingOptions(config.thinkingLevel);

  return {
    ...getBaseOptions(),
    model: getModelForUseCase('auto', config.model),
    maxTurns: MAX_TURNS.maximum,
    cwd: config.cwd,
    allowedTools: [...TOOL_PRESETS.fullAccess],
    ...claudeMdOptions,
    ...thinkingOptions,
    ...(config.abortController && { abortController: config.abortController }),
    ...mcpOptions.mcpServerOptions,
  };
}

/**
 * Create custom SDK options with explicit configuration
 *
 * Use this when the preset options don't fit your use case.
 * When autoLoadClaudeMd is true, uses preset mode and settingSources for CLAUDE.md loading
 */
export function createCustomOptions(
  config: CreateSdkOptionsConfig & {
    maxTurns?: number;
    allowedTools?: readonly string[];
  }
): Options {
  // Validate working directory before creating options
  validateWorkingDirectory(config.cwd);

  // Build CLAUDE.md auto-loading options if enabled
  const claudeMdOptions = buildClaudeMdOptions(config);

  // Build MCP-related options
  const mcpOptions = buildMcpOptions(config);

  // Build thinking options
  const thinkingOptions = buildThinkingOptions(config.thinkingLevel);

  // For custom options: use explicit allowedTools if provided, otherwise default to readOnly
  const effectiveAllowedTools = config.allowedTools
    ? [...config.allowedTools]
    : [...TOOL_PRESETS.readOnly];

  return {
    ...getBaseOptions(),
    model: getModelForUseCase('default', config.model),
    maxTurns: config.maxTurns ?? MAX_TURNS.maximum,
    cwd: config.cwd,
    allowedTools: effectiveAllowedTools,
    ...claudeMdOptions,
    ...thinkingOptions,
    ...(config.abortController && { abortController: config.abortController }),
    ...mcpOptions.mcpServerOptions,
  };
}
