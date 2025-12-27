/**
 * Helper utilities for loading settings and context file handling across different parts of the server
 */

import type { SettingsService } from '../services/settings-service.js';
import type { ContextFilesResult, ContextFileInfo } from '@automaker/utils';

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
    console.log(`${logPrefix} SettingsService not available, autoLoadClaudeMd disabled`);
    return false;
  }

  try {
    // Check project settings first (takes precedence)
    const projectSettings = await settingsService.getProjectSettings(projectPath);
    if (projectSettings.autoLoadClaudeMd !== undefined) {
      console.log(
        `${logPrefix} autoLoadClaudeMd from project settings: ${projectSettings.autoLoadClaudeMd}`
      );
      return projectSettings.autoLoadClaudeMd;
    }

    // Fall back to global settings
    const globalSettings = await settingsService.getGlobalSettings();
    const result = globalSettings.autoLoadClaudeMd ?? false;
    console.log(`${logPrefix} autoLoadClaudeMd from global settings: ${result}`);
    return result;
  } catch (error) {
    console.error(`${logPrefix} Failed to load autoLoadClaudeMd setting:`, error);
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
