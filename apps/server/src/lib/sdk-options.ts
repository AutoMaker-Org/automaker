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
import { DEFAULT_MODELS, CLAUDE_MODEL_MAP, type McpServerConfig } from '@automaker/types';
import { isPathAllowed, PathNotAllowedError, getAllowedRootDirectory } from '@automaker/platform';

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
  fullAccess: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'WebSearch', 'WebFetch'] as const,

  /** Tools for chat/interactive mode */
  chat: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'WebSearch', 'WebFetch'] as const,
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
 */
function getBaseOptions(): Partial<Options> {
  return {
    permissionMode: 'acceptEdits',
  };
}

/**
 * MCP permission options result
 */
interface McpPermissionOptions {
  /** Whether tools should be restricted to a preset */
  shouldRestrictTools: boolean;
  /** Options to spread when MCP bypass is enabled */
  bypassOptions: Partial<Options>;
  /** Options to spread for MCP servers */
  mcpServerOptions: Partial<Options>;
}

/**
 * Build MCP-related options based on configuration.
 * Centralizes the logic for determining permission modes and tool restrictions
 * when MCP servers are configured.
 *
 * @param config - The SDK options config
 * @returns Object with MCP permission settings to spread into final options
 */
function buildMcpOptions(config: CreateSdkOptionsConfig): McpPermissionOptions {
  const hasMcpServers = config.mcpServers && Object.keys(config.mcpServers).length > 0;
  // Default to true - this is a deliberate design choice for ease of use with MCP servers.
  // Users can disable these in settings for stricter security.
  const mcpAutoApprove = config.mcpAutoApproveTools ?? true;
  const mcpUnrestricted = config.mcpUnrestrictedTools ?? true;

  // Determine if we should bypass permissions based on settings
  const shouldBypassPermissions = hasMcpServers && mcpAutoApprove;
  // Determine if we should restrict tools (only when no MCP or unrestricted is disabled)
  const shouldRestrictTools = !hasMcpServers || !mcpUnrestricted;

  return {
    shouldRestrictTools,
    // Only include bypass options when MCP is configured and auto-approve is enabled
    bypassOptions: shouldBypassPermissions
      ? {
          permissionMode: 'bypassPermissions' as const,
          // Required flag when using bypassPermissions mode
          allowDangerouslySkipPermissions: true,
        }
      : {},
    // Include MCP servers if configured
    mcpServerOptions: config.mcpServers ? { mcpServers: config.mcpServers } : {},
  };
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

  /** Enable sandbox mode for bash command isolation */
  enableSandboxMode?: boolean;

  /** MCP servers to make available to the agent */
  mcpServers?: Record<string, McpServerConfig>;

  /** Auto-approve MCP tool calls without permission prompts */
  mcpAutoApproveTools?: boolean;

  /** Allow unrestricted tools when MCP servers are enabled */
  mcpUnrestrictedTools?: boolean;
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

  return {
    ...getBaseOptions(),
    // Override permissionMode - feature generation only needs read-only tools
    permissionMode: 'default',
    model: getModelForUseCase('features', config.model),
    maxTurns: MAX_TURNS.quick,
    cwd: config.cwd,
    allowedTools: [...TOOL_PRESETS.readOnly],
    ...claudeMdOptions,
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

  return {
    ...getBaseOptions(),
    model: getModelForUseCase('suggestions', config.model),
    maxTurns: MAX_TURNS.extended,
    cwd: config.cwd,
    allowedTools: [...TOOL_PRESETS.readOnly],
    ...claudeMdOptions,
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
 * - Sandbox mode controlled by enableSandboxMode setting
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

  return {
    ...getBaseOptions(),
    model: getModelForUseCase('chat', effectiveModel),
    maxTurns: MAX_TURNS.standard,
    cwd: config.cwd,
    // Only restrict tools if no MCP servers configured or unrestricted is disabled
    ...(mcpOptions.shouldRestrictTools && { allowedTools: [...TOOL_PRESETS.chat] }),
    // Apply MCP bypass options if configured
    ...mcpOptions.bypassOptions,
    ...(config.enableSandboxMode && {
      sandbox: {
        enabled: true,
        autoAllowBashIfSandboxed: true,
      },
    }),
    ...claudeMdOptions,
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
 * - Sandbox mode controlled by enableSandboxMode setting
 * - When autoLoadClaudeMd is true, uses preset mode and settingSources for CLAUDE.md loading
 */
export function createAutoModeOptions(config: CreateSdkOptionsConfig): Options {
  // Validate working directory before creating options
  validateWorkingDirectory(config.cwd);

  // Build CLAUDE.md auto-loading options if enabled
  const claudeMdOptions = buildClaudeMdOptions(config);

  // Build MCP-related options
  const mcpOptions = buildMcpOptions(config);

  return {
    ...getBaseOptions(),
    model: getModelForUseCase('auto', config.model),
    maxTurns: MAX_TURNS.maximum,
    cwd: config.cwd,
    // Only restrict tools if no MCP servers configured or unrestricted is disabled
    ...(mcpOptions.shouldRestrictTools && { allowedTools: [...TOOL_PRESETS.fullAccess] }),
    // Apply MCP bypass options if configured
    ...mcpOptions.bypassOptions,
    ...(config.enableSandboxMode && {
      sandbox: {
        enabled: true,
        autoAllowBashIfSandboxed: true,
      },
    }),
    ...claudeMdOptions,
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
    sandbox?: { enabled: boolean; autoAllowBashIfSandboxed?: boolean };
  }
): Options {
  // Validate working directory before creating options
  validateWorkingDirectory(config.cwd);

  // Build CLAUDE.md auto-loading options if enabled
  const claudeMdOptions = buildClaudeMdOptions(config);

  // Build MCP-related options
  const mcpOptions = buildMcpOptions(config);

  // For custom options: use explicit allowedTools if provided, otherwise use preset based on MCP settings
  const effectiveAllowedTools = config.allowedTools
    ? [...config.allowedTools]
    : mcpOptions.shouldRestrictTools
      ? [...TOOL_PRESETS.readOnly]
      : undefined;

  return {
    ...getBaseOptions(),
    model: getModelForUseCase('default', config.model),
    maxTurns: config.maxTurns ?? MAX_TURNS.maximum,
    cwd: config.cwd,
    ...(effectiveAllowedTools && { allowedTools: effectiveAllowedTools }),
    ...(config.sandbox && { sandbox: config.sandbox }),
    // Apply MCP bypass options if configured
    ...mcpOptions.bypassOptions,
    ...claudeMdOptions,
    ...(config.abortController && { abortController: config.abortController }),
    ...mcpOptions.mcpServerOptions,
  };
}
