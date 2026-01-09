/**
 * Helper utilities for loading settings and context file handling across different parts of the server
 */

import type { SettingsService } from '../services/settings-service.js';
import type { ContextFilesResult, ContextFileInfo } from '@automaker/utils';
import { createLogger } from '@automaker/utils';
import type { MCPServerConfig, McpServerConfig, PromptCustomization } from '@automaker/types';
import {
  mergeAutoModePrompts,
  mergeAgentPrompts,
  mergeBacklogPlanPrompts,
  mergeEnhancementPrompts,
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
