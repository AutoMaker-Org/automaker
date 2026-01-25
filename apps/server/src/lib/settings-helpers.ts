/**
 * Helper utilities for loading settings and context file handling across different parts of the server
 */

import type { SettingsService } from '../services/settings-service.js';
import type { ContextFilesResult, ContextFileInfo } from '@automaker/utils';
import { createLogger } from '@automaker/utils';
import type {
  MCPServerConfig,
  McpServerConfig,
  PromptCustomization,
  ClaudeApiProfile,
  ClaudeCompatibleProvider,
  PhaseModelKey,
  PhaseModelEntry,
  Credentials,
} from '@automaker/types';
import { DEFAULT_PHASE_MODELS } from '@automaker/types';
import {
  mergeAutoModePrompts,
  mergeAgentPrompts,
  mergeBacklogPlanPrompts,
  mergeEnhancementPrompts,
  mergeCommitMessagePrompts,
  mergeTitleGenerationPrompts,
  mergeIssueValidationPrompts,
  mergeIdeationPrompts,
  mergeAppSpecPrompts,
  mergeContextDescriptionPrompts,
  mergeSuggestionsPrompts,
  mergeTaskExecutionPrompts,
} from '@automaker/prompts';

const logger = createLogger('SettingsHelper');

/**
 * Get the autoLoadClaudeMd setting, with project settings taking precedence over global.
 * Returns false if settings service is not available.
 *
 * @param projectPath - Path to the project
 * @param settingsService - Optional settings service instance
 * @param logPrefix - Prefix for log messages (e.g., '[DescribeImage]')
 * @returns Promise resolving to the autoLoadClaudeMd setting value
 */
export async function getAutoLoadClaudeMdSetting(
  projectPath: string,
  settingsService?: SettingsService | null,
  logPrefix = '[SettingsHelper]'
): Promise<boolean> {
  if (!settingsService) {
    logger.info(`${logPrefix} SettingsService not available, autoLoadClaudeMd disabled`);
    return false;
  }

  try {
    // Check project settings first (takes precedence)
    const projectSettings = await settingsService.getProjectSettings(projectPath);
    if (projectSettings.autoLoadClaudeMd !== undefined) {
      logger.info(
        `${logPrefix} autoLoadClaudeMd from project settings: ${projectSettings.autoLoadClaudeMd}`
      );
      return projectSettings.autoLoadClaudeMd;
    }

    // Fall back to global settings
    const globalSettings = await settingsService.getGlobalSettings();
    const result = globalSettings.autoLoadClaudeMd ?? false;
    logger.info(`${logPrefix} autoLoadClaudeMd from global settings: ${result}`);
    return result;
  } catch (error) {
    logger.error(`${logPrefix} Failed to load autoLoadClaudeMd setting:`, error);
    throw error;
  }
}

/**
 * Filters out CLAUDE.md from context files when autoLoadClaudeMd is enabled
 * and rebuilds the formatted prompt without it.
 *
 * When autoLoadClaudeMd is true, the SDK handles CLAUDE.md loading via settingSources,
 * so we need to exclude it from the manual context loading to avoid duplication.
 * Other context files (CODE_QUALITY.md, CONVENTIONS.md, etc.) are preserved.
 *
 * @param contextResult - Result from loadContextFiles
 * @param autoLoadClaudeMd - Whether SDK auto-loading is enabled
 * @returns Filtered context prompt (empty string if no non-CLAUDE.md files)
 */
export function filterClaudeMdFromContext(
  contextResult: ContextFilesResult,
  autoLoadClaudeMd: boolean
): string {
  // If autoLoadClaudeMd is disabled, return the original prompt unchanged
  if (!autoLoadClaudeMd || contextResult.files.length === 0) {
    return contextResult.formattedPrompt;
  }

  // Filter out CLAUDE.md (case-insensitive)
  const nonClaudeFiles = contextResult.files.filter((f) => f.name.toLowerCase() !== 'claude.md');

  // If all files were CLAUDE.md, return empty string
  if (nonClaudeFiles.length === 0) {
    return '';
  }

  // Rebuild prompt without CLAUDE.md using the same format as loadContextFiles
  const formattedFiles = nonClaudeFiles.map((file) => formatContextFileEntry(file));

  return `# Project Context Files

The following context files provide project-specific rules, conventions, and guidelines.
Each file serves a specific purpose - use the description to understand when to reference it.
If you need more details about a context file, you can read the full file at the path provided.

**IMPORTANT**: You MUST follow the rules and conventions specified in these files.
- Follow ALL commands exactly as shown (e.g., if the project uses \`pnpm\`, NEVER use \`npm\` or \`npx\`)
- Follow ALL coding conventions, commit message formats, and architectural patterns specified
- Reference these rules before running ANY shell commands or making commits

---

${formattedFiles.join('\n\n---\n\n')}

---

**REMINDER**: Before taking any action, verify you are following the conventions specified above.
`;
}

/**
 * Format a single context file entry for the prompt
 * (Matches the format used in @automaker/utils/context-loader.ts)
 */
function formatContextFileEntry(file: ContextFileInfo): string {
  const header = `## ${file.name}`;
  const pathInfo = `**Path:** \`${file.path}\``;
  const descriptionInfo = file.description ? `\n**Purpose:** ${file.description}` : '';
  return `${header}\n${pathInfo}${descriptionInfo}\n\n${file.content}`;
}

/**
 * Get enabled MCP servers from global settings, converted to SDK format.
 * Returns an empty object if settings service is not available or no servers are configured.
 *
 * @param settingsService - Optional settings service instance
 * @param logPrefix - Prefix for log messages (e.g., '[AgentService]')
 * @returns Promise resolving to MCP servers in SDK format (keyed by name)
 */
export async function getMCPServersFromSettings(
  settingsService?: SettingsService | null,
  logPrefix = '[SettingsHelper]'
): Promise<Record<string, McpServerConfig>> {
  if (!settingsService) {
    return {};
  }

  try {
    const globalSettings = await settingsService.getGlobalSettings();
    const mcpServers = globalSettings.mcpServers || [];

    // Filter to only enabled servers and convert to SDK format
    const enabledServers = mcpServers.filter((s) => s.enabled !== false);

    if (enabledServers.length === 0) {
      return {};
    }

    // Convert settings format to SDK format (keyed by name)
    const sdkServers: Record<string, McpServerConfig> = {};
    for (const server of enabledServers) {
      sdkServers[server.name] = convertToSdkFormat(server);
    }

    logger.info(
      `${logPrefix} Loaded ${enabledServers.length} MCP server(s): ${enabledServers.map((s) => s.name).join(', ')}`
    );

    return sdkServers;
  } catch (error) {
    logger.error(`${logPrefix} Failed to load MCP servers setting:`, error);
    return {};
  }
}

/**
 * Convert a settings MCPServerConfig to SDK McpServerConfig format.
 * Validates required fields and throws informative errors if missing.
 */
function convertToSdkFormat(server: MCPServerConfig): McpServerConfig {
  if (server.type === 'sse') {
    if (!server.url) {
      throw new Error(`SSE MCP server "${server.name}" is missing a URL.`);
    }
    return {
      type: 'sse',
      url: server.url,
      headers: server.headers,
    };
  }

  if (server.type === 'http') {
    if (!server.url) {
      throw new Error(`HTTP MCP server "${server.name}" is missing a URL.`);
    }
    return {
      type: 'http',
      url: server.url,
      headers: server.headers,
    };
  }

  // Default to stdio
  if (!server.command) {
    throw new Error(`Stdio MCP server "${server.name}" is missing a command.`);
  }
  return {
    type: 'stdio',
    command: server.command,
    args: server.args,
    env: server.env,
  };
}

/**
 * Get prompt customization from global settings and merge with defaults.
 * Returns prompts merged with built-in defaults - custom prompts override defaults.
 *
 * @param settingsService - Optional settings service instance
 * @param logPrefix - Prefix for log messages
 * @returns Promise resolving to merged prompts for all categories
 */
export async function getPromptCustomization(
  settingsService?: SettingsService | null,
  logPrefix = '[PromptHelper]'
): Promise<{
  autoMode: ReturnType<typeof mergeAutoModePrompts>;
  agent: ReturnType<typeof mergeAgentPrompts>;
  backlogPlan: ReturnType<typeof mergeBacklogPlanPrompts>;
  enhancement: ReturnType<typeof mergeEnhancementPrompts>;
  commitMessage: ReturnType<typeof mergeCommitMessagePrompts>;
  titleGeneration: ReturnType<typeof mergeTitleGenerationPrompts>;
  issueValidation: ReturnType<typeof mergeIssueValidationPrompts>;
  ideation: ReturnType<typeof mergeIdeationPrompts>;
  appSpec: ReturnType<typeof mergeAppSpecPrompts>;
  contextDescription: ReturnType<typeof mergeContextDescriptionPrompts>;
  suggestions: ReturnType<typeof mergeSuggestionsPrompts>;
  taskExecution: ReturnType<typeof mergeTaskExecutionPrompts>;
}> {
  let customization: PromptCustomization = {};

  if (settingsService) {
    try {
      const globalSettings = await settingsService.getGlobalSettings();
      customization = globalSettings.promptCustomization || {};
      logger.info(`${logPrefix} Loaded prompt customization from settings`);
    } catch (error) {
      logger.error(`${logPrefix} Failed to load prompt customization:`, error);
      // Fall through to use empty customization (all defaults)
    }
  } else {
    logger.info(`${logPrefix} SettingsService not available, using default prompts`);
  }

  return {
    autoMode: mergeAutoModePrompts(customization.autoMode),
    agent: mergeAgentPrompts(customization.agent),
    backlogPlan: mergeBacklogPlanPrompts(customization.backlogPlan),
    enhancement: mergeEnhancementPrompts(customization.enhancement),
    commitMessage: mergeCommitMessagePrompts(customization.commitMessage),
    titleGeneration: mergeTitleGenerationPrompts(customization.titleGeneration),
    issueValidation: mergeIssueValidationPrompts(customization.issueValidation),
    ideation: mergeIdeationPrompts(customization.ideation),
    appSpec: mergeAppSpecPrompts(customization.appSpec),
    contextDescription: mergeContextDescriptionPrompts(customization.contextDescription),
    suggestions: mergeSuggestionsPrompts(customization.suggestions),
    taskExecution: mergeTaskExecutionPrompts(customization.taskExecution),
  };
}

/**
 * Get Skills configuration from settings.
 * Returns configuration for enabling skills and which sources to load from.
 *
 * @param settingsService - Settings service instance
 * @returns Skills configuration with enabled state, sources, and tool inclusion flag
 */
export async function getSkillsConfiguration(settingsService: SettingsService): Promise<{
  enabled: boolean;
  sources: Array<'user' | 'project'>;
  shouldIncludeInTools: boolean;
}> {
  const settings = await settingsService.getGlobalSettings();
  const enabled = settings.enableSkills ?? true; // Default enabled
  const sources = settings.skillsSources ?? ['user', 'project']; // Default both sources

  return {
    enabled,
    sources,
    shouldIncludeInTools: enabled && sources.length > 0,
  };
}

/**
 * Get Subagents configuration from settings.
 * Returns configuration for enabling subagents and which sources to load from.
 *
 * @param settingsService - Settings service instance
 * @returns Subagents configuration with enabled state, sources, and tool inclusion flag
 */
export async function getSubagentsConfiguration(settingsService: SettingsService): Promise<{
  enabled: boolean;
  sources: Array<'user' | 'project'>;
  shouldIncludeInTools: boolean;
}> {
  const settings = await settingsService.getGlobalSettings();
  const enabled = settings.enableSubagents ?? true; // Default enabled
  const sources = settings.subagentsSources ?? ['user', 'project']; // Default both sources

  return {
    enabled,
    sources,
    shouldIncludeInTools: enabled && sources.length > 0,
  };
}

/**
 * Get custom subagents from settings, merging global and project-level definitions.
 * Project-level subagents take precedence over global ones with the same name.
 *
 * @param settingsService - Settings service instance
 * @param projectPath - Path to the project for loading project-specific subagents
 * @returns Record of agent names to definitions, or undefined if none configured
 */
export async function getCustomSubagents(
  settingsService: SettingsService,
  projectPath?: string
): Promise<Record<string, import('@automaker/types').AgentDefinition> | undefined> {
  // Get global subagents
  const globalSettings = await settingsService.getGlobalSettings();
  const globalSubagents = globalSettings.customSubagents || {};

  // If no project path, return only global subagents
  if (!projectPath) {
    return Object.keys(globalSubagents).length > 0 ? globalSubagents : undefined;
  }

  // Get project-specific subagents
  const projectSettings = await settingsService.getProjectSettings(projectPath);
  const projectSubagents = projectSettings.customSubagents || {};

  // Merge: project-level takes precedence
  const merged = {
    ...globalSubagents,
    ...projectSubagents,
  };

  return Object.keys(merged).length > 0 ? merged : undefined;
}

/** Result from getActiveClaudeApiProfile */
export interface ActiveClaudeApiProfileResult {
  /** The active profile, or undefined if using direct Anthropic API */
  profile: ClaudeApiProfile | undefined;
  /** Credentials for resolving 'credentials' apiKeySource */
  credentials: import('@automaker/types').Credentials | undefined;
}

/**
 * Get the active Claude API profile and credentials from settings.
 * Checks project settings first for per-project overrides, then falls back to global settings.
 * Returns both the profile and credentials for resolving 'credentials' apiKeySource.
 *
 * @deprecated Use getProviderById and getPhaseModelWithOverrides instead for the new provider system.
 * This function is kept for backward compatibility during migration.
 *
 * @param settingsService - Optional settings service instance
 * @param logPrefix - Prefix for log messages (e.g., '[AgentService]')
 * @param projectPath - Optional project path for per-project override
 * @returns Promise resolving to object with profile and credentials
 */
export async function getActiveClaudeApiProfile(
  settingsService?: SettingsService | null,
  logPrefix = '[SettingsHelper]',
  projectPath?: string
): Promise<ActiveClaudeApiProfileResult> {
  if (!settingsService) {
    return { profile: undefined, credentials: undefined };
  }

  try {
    const globalSettings = await settingsService.getGlobalSettings();
    const credentials = await settingsService.getCredentials();
    const profiles = globalSettings.claudeApiProfiles || [];

    // Check for project-level override first
    let activeProfileId: string | null | undefined;
    let isProjectOverride = false;

    if (projectPath) {
      const projectSettings = await settingsService.getProjectSettings(projectPath);
      // undefined = use global, null = explicit no profile, string = specific profile
      if (projectSettings.activeClaudeApiProfileId !== undefined) {
        activeProfileId = projectSettings.activeClaudeApiProfileId;
        isProjectOverride = true;
      }
    }

    // Fall back to global if project doesn't specify
    if (activeProfileId === undefined && !isProjectOverride) {
      activeProfileId = globalSettings.activeClaudeApiProfileId;
    }

    // No active profile selected - use direct Anthropic API
    if (!activeProfileId) {
      if (isProjectOverride && activeProfileId === null) {
        logger.info(`${logPrefix} Project explicitly using Direct Anthropic API`);
      }
      return { profile: undefined, credentials };
    }

    // Find the active profile by ID
    const activeProfile = profiles.find((p) => p.id === activeProfileId);

    if (activeProfile) {
      const overrideSuffix = isProjectOverride ? ' (project override)' : '';
      logger.info(`${logPrefix} Using Claude API profile: ${activeProfile.name}${overrideSuffix}`);
      return { profile: activeProfile, credentials };
    } else {
      logger.warn(
        `${logPrefix} Active profile ID "${activeProfileId}" not found, falling back to direct Anthropic API`
      );
      return { profile: undefined, credentials };
    }
  } catch (error) {
    logger.error(`${logPrefix} Failed to load Claude API profile:`, error);
    return { profile: undefined, credentials: undefined };
  }
}

// ============================================================================
// New Provider System Helpers
// ============================================================================

/** Result from getProviderById */
export interface ProviderByIdResult {
  /** The provider, or undefined if not found */
  provider: ClaudeCompatibleProvider | undefined;
  /** Credentials for resolving 'credentials' apiKeySource */
  credentials: Credentials | undefined;
}

/**
 * Get a ClaudeCompatibleProvider by its ID.
 * Returns the provider configuration and credentials for API key resolution.
 *
 * @param providerId - The provider ID to look up
 * @param settingsService - Settings service instance
 * @param logPrefix - Prefix for log messages
 * @returns Promise resolving to object with provider and credentials
 */
export async function getProviderById(
  providerId: string,
  settingsService: SettingsService,
  logPrefix = '[SettingsHelper]'
): Promise<ProviderByIdResult> {
  try {
    const globalSettings = await settingsService.getGlobalSettings();
    const credentials = await settingsService.getCredentials();
    const providers = globalSettings.claudeCompatibleProviders || [];

    const provider = providers.find((p) => p.id === providerId);

    if (provider) {
      if (provider.enabled === false) {
        logger.warn(`${logPrefix} Provider "${provider.name}" (${providerId}) is disabled`);
      } else {
        logger.debug(`${logPrefix} Found provider: ${provider.name}`);
      }
      return { provider, credentials };
    } else {
      logger.warn(`${logPrefix} Provider not found: ${providerId}`);
      return { provider: undefined, credentials };
    }
  } catch (error) {
    logger.error(`${logPrefix} Failed to load provider by ID:`, error);
    return { provider: undefined, credentials: undefined };
  }
}

/** Result from getPhaseModelWithOverrides */
export interface PhaseModelWithOverridesResult {
  /** The resolved phase model entry */
  phaseModel: PhaseModelEntry;
  /** Whether a project override was applied */
  isProjectOverride: boolean;
  /** The provider if providerId is set and found */
  provider: ClaudeCompatibleProvider | undefined;
  /** Credentials for API key resolution */
  credentials: Credentials | undefined;
}

/**
 * Get the phase model configuration for a specific phase, applying project overrides if available.
 * Also resolves the provider if the phase model has a providerId.
 *
 * @param phase - The phase key (e.g., 'enhancementModel', 'specGenerationModel')
 * @param settingsService - Optional settings service instance (returns defaults if undefined)
 * @param projectPath - Optional project path for checking overrides
 * @param logPrefix - Prefix for log messages
 * @returns Promise resolving to phase model with provider info
 */
export async function getPhaseModelWithOverrides(
  phase: PhaseModelKey,
  settingsService?: SettingsService | null,
  projectPath?: string,
  logPrefix = '[SettingsHelper]'
): Promise<PhaseModelWithOverridesResult> {
  // Handle undefined settingsService gracefully
  if (!settingsService) {
    logger.info(`${logPrefix} SettingsService not available, using default for ${phase}`);
    return {
      phaseModel: DEFAULT_PHASE_MODELS[phase] || { model: 'sonnet' },
      isProjectOverride: false,
      provider: undefined,
      credentials: undefined,
    };
  }

  try {
    const globalSettings = await settingsService.getGlobalSettings();
    const credentials = await settingsService.getCredentials();
    const globalPhaseModels = globalSettings.phaseModels || {};

    // Start with global phase model
    let phaseModel = globalPhaseModels[phase];
    let isProjectOverride = false;

    // Check for project override
    if (projectPath) {
      const projectSettings = await settingsService.getProjectSettings(projectPath);
      const projectOverrides = projectSettings.phaseModelOverrides || {};

      if (projectOverrides[phase]) {
        phaseModel = projectOverrides[phase];
        isProjectOverride = true;
        logger.debug(`${logPrefix} Using project override for ${phase}`);
      }
    }

    // If no phase model found, use per-phase default
    if (!phaseModel) {
      phaseModel = DEFAULT_PHASE_MODELS[phase] || { model: 'sonnet' };
      logger.debug(`${logPrefix} No ${phase} configured, using default: ${phaseModel.model}`);
    }

    // Resolve provider if providerId is set
    let provider: ClaudeCompatibleProvider | undefined;
    if (phaseModel.providerId) {
      const providers = globalSettings.claudeCompatibleProviders || [];
      provider = providers.find((p) => p.id === phaseModel.providerId);

      if (provider) {
        if (provider.enabled === false) {
          logger.warn(
            `${logPrefix} Provider "${provider.name}" for ${phase} is disabled, falling back to direct API`
          );
          provider = undefined;
        } else {
          logger.debug(`${logPrefix} Using provider "${provider.name}" for ${phase}`);
        }
      } else {
        logger.warn(
          `${logPrefix} Provider ${phaseModel.providerId} not found for ${phase}, falling back to direct API`
        );
      }
    }

    return {
      phaseModel,
      isProjectOverride,
      provider,
      credentials,
    };
  } catch (error) {
    logger.error(`${logPrefix} Failed to get phase model with overrides:`, error);
    // Return a safe default
    return {
      phaseModel: { model: 'sonnet' },
      isProjectOverride: false,
      provider: undefined,
      credentials: undefined,
    };
  }
}

/** Result from getProviderByModelId */
export interface ProviderByModelIdResult {
  /** The provider that contains this model, or undefined if not found */
  provider: ClaudeCompatibleProvider | undefined;
  /** The model configuration if found */
  modelConfig: import('@automaker/types').ProviderModel | undefined;
  /** Credentials for API key resolution */
  credentials: Credentials | undefined;
  /** The resolved Claude model ID to use for API calls (from mapsToClaudeModel) */
  resolvedModel: string | undefined;
}

/**
 * Find a ClaudeCompatibleProvider by one of its model IDs.
 * Searches through all enabled providers to find one that contains the specified model.
 * This is useful when you have a model string from the UI but need the provider config.
 *
 * Also resolves the `mapsToClaudeModel` field to get the actual Claude model ID to use
 * when calling the API (e.g., "GLM-4.5-Air" -> "claude-haiku-4-5").
 *
 * @param modelId - The model ID to search for (e.g., "GLM-4.7", "MiniMax-M2.1")
 * @param settingsService - Settings service instance
 * @param logPrefix - Prefix for log messages
 * @returns Promise resolving to object with provider, model config, credentials, and resolved model
 */
export async function getProviderByModelId(
  modelId: string,
  settingsService: SettingsService,
  logPrefix = '[SettingsHelper]'
): Promise<ProviderByModelIdResult> {
  try {
    const globalSettings = await settingsService.getGlobalSettings();
    const credentials = await settingsService.getCredentials();
    const providers = globalSettings.claudeCompatibleProviders || [];

    // Search through all enabled providers for this model
    for (const provider of providers) {
      // Skip disabled providers
      if (provider.enabled === false) {
        continue;
      }

      // Check if this provider has the model
      const modelConfig = provider.models?.find(
        (m) => m.id === modelId || m.id.toLowerCase() === modelId.toLowerCase()
      );

      if (modelConfig) {
        logger.info(`${logPrefix} Found model "${modelId}" in provider "${provider.name}"`);

        // Resolve the mapped Claude model if specified
        let resolvedModel: string | undefined;
        if (modelConfig.mapsToClaudeModel) {
          // Import resolveModelString to convert alias to full model ID
          const { resolveModelString } = await import('@automaker/model-resolver');
          resolvedModel = resolveModelString(modelConfig.mapsToClaudeModel);
          logger.info(
            `${logPrefix} Model "${modelId}" maps to Claude model "${modelConfig.mapsToClaudeModel}" -> "${resolvedModel}"`
          );
        }

        return { provider, modelConfig, credentials, resolvedModel };
      }
    }

    // Model not found in any provider
    logger.debug(`${logPrefix} Model "${modelId}" not found in any provider`);
    return {
      provider: undefined,
      modelConfig: undefined,
      credentials: undefined,
      resolvedModel: undefined,
    };
  } catch (error) {
    logger.error(`${logPrefix} Failed to find provider by model ID:`, error);
    return {
      provider: undefined,
      modelConfig: undefined,
      credentials: undefined,
      resolvedModel: undefined,
    };
  }
}

/**
 * Get all enabled provider models for use in model dropdowns.
 * Returns models from all enabled ClaudeCompatibleProviders.
 *
 * @param settingsService - Settings service instance
 * @param logPrefix - Prefix for log messages
 * @returns Promise resolving to array of provider models with their provider info
 */
export async function getAllProviderModels(
  settingsService: SettingsService,
  logPrefix = '[SettingsHelper]'
): Promise<
  Array<{
    providerId: string;
    providerName: string;
    model: import('@automaker/types').ProviderModel;
  }>
> {
  try {
    const globalSettings = await settingsService.getGlobalSettings();
    const providers = globalSettings.claudeCompatibleProviders || [];

    const allModels: Array<{
      providerId: string;
      providerName: string;
      model: import('@automaker/types').ProviderModel;
    }> = [];

    for (const provider of providers) {
      // Skip disabled providers
      if (provider.enabled === false) {
        continue;
      }

      for (const model of provider.models || []) {
        allModels.push({
          providerId: provider.id,
          providerName: provider.name,
          model,
        });
      }
    }

    logger.debug(
      `${logPrefix} Found ${allModels.length} models from ${providers.length} providers`
    );
    return allModels;
  } catch (error) {
    logger.error(`${logPrefix} Failed to get all provider models:`, error);
    return [];
  }
}
