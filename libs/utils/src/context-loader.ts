/**
 * Context Loader - Loads project context files for agent prompts
 *
 * Provides a shared utility to load context files from .automaker/context/
 * and format them as system prompt content. Used by both auto-mode-service
 * and agent-service to ensure all agents are aware of project context.
 *
 * Context files contain project-specific rules, conventions, and guidelines
 * that agents must follow when working on the project.
 */

import path from 'path';
import { secureFs } from '@automaker/platform';

/**
 * Metadata structure for context files
 * Stored in {projectPath}/.automaker/context/context-metadata.json
 */
export interface ContextMetadata {
  files: Record<string, { description: string }>;
}

/**
 * Individual context file with metadata
 */
export interface ContextFileInfo {
  name: string;
  path: string;
  content: string;
  description?: string;
}

/**
 * Result of loading context files
 */
export interface ContextFilesResult {
  files: ContextFileInfo[];
  formattedPrompt: string;
}

/**
 * File system module interface for context loading
 * Compatible with secureFs from @automaker/platform
 */
export interface ContextFsModule {
  access: (path: string) => Promise<void>;
  readdir: (path: string) => Promise<string[]>;
  readFile: (path: string, encoding?: BufferEncoding) => Promise<string | Buffer>;
}

/**
 * Options for loading context files
 */
export interface LoadContextFilesOptions {
  /** Project path to load context from */
  projectPath: string;
  /** Optional custom secure fs module (for dependency injection) */
  fsModule?: ContextFsModule;
}

/**
 * Get the context directory path for a project
 */
function getContextDir(projectPath: string): string {
  return path.join(projectPath, '.automaker', 'context');
}

/**
 * Load context metadata from the metadata file
 */
async function loadContextMetadata(
  contextDir: string,
  fsModule: ContextFsModule
): Promise<ContextMetadata> {
  const metadataPath = path.join(contextDir, 'context-metadata.json');
  try {
    const content = await fsModule.readFile(metadataPath, 'utf-8');
    return JSON.parse(content as string);
  } catch {
    // Metadata file doesn't exist yet - that's fine
    return { files: {} };
  }
}

/**
 * Format a single context file entry for the prompt
 */
function formatContextFileEntry(file: ContextFileInfo): string {
  const header = `## ${file.name}`;
  const pathInfo = `**Path:** \`${file.path}\``;

  let descriptionInfo = '';
  if (file.description) {
    descriptionInfo = `\n**Purpose:** ${file.description}`;
  }

  return `${header}\n${pathInfo}${descriptionInfo}\n\n${file.content}`;
}

/**
 * Build the formatted system prompt from context files
 */
function buildContextPrompt(files: ContextFileInfo[]): string {
  if (files.length === 0) {
    return '';
  }

  const formattedFiles = files.map(formatContextFileEntry);

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
 * Load context files from a project's .automaker/context/ directory
 *
 * This function loads all .md and .txt files from the context directory,
 * along with their metadata (descriptions), and formats them into a
 * system prompt that can be prepended to agent prompts.
 *
 * @param options - Configuration options
 * @returns Promise resolving to context files and formatted prompt
 *
 * @example
 * ```typescript
 * const { formattedPrompt, files } = await loadContextFiles({
 *   projectPath: '/path/to/project'
 * });
 *
 * // Use as system prompt
 * const executeOptions = {
 *   prompt: userPrompt,
 *   systemPrompt: formattedPrompt,
 * };
 * ```
 */
export async function loadContextFiles(
  options: LoadContextFilesOptions
): Promise<ContextFilesResult> {
  const { projectPath, fsModule = secureFs } = options;
  const contextDir = path.resolve(getContextDir(projectPath));

  try {
    // Check if directory exists
    await fsModule.access(contextDir);

    // Read directory contents
    const allFiles = await fsModule.readdir(contextDir);

    // Filter for text-based context files (case-insensitive for cross-platform)
    const textFiles = allFiles.filter((f) => {
      const lower = f.toLowerCase();
      return (lower.endsWith('.md') || lower.endsWith('.txt')) && f !== 'context-metadata.json';
    });

    if (textFiles.length === 0) {
      return { files: [], formattedPrompt: '' };
    }

    // Load metadata for descriptions
    const metadata = await loadContextMetadata(contextDir, fsModule);

    // Load each file with its content and metadata
    const files: ContextFileInfo[] = [];
    for (const fileName of textFiles) {
      const filePath = path.join(contextDir, fileName);
      try {
        const content = await fsModule.readFile(filePath, 'utf-8');
        files.push({
          name: fileName,
          path: filePath,
          content: content as string,
          description: metadata.files[fileName]?.description,
        });
      } catch (error) {
        console.warn(`[ContextLoader] Failed to read context file ${fileName}:`, error);
      }
    }

    const formattedPrompt = buildContextPrompt(files);

    console.log(
      `[ContextLoader] Loaded ${files.length} context file(s): ${files.map((f) => f.name).join(', ')}`
    );

    return { files, formattedPrompt };
  } catch {
    // Context directory doesn't exist or is inaccessible - this is fine
    return { files: [], formattedPrompt: '' };
  }
}

/**
 * Get a summary of available context files (names and descriptions only)
 * Useful for informing the agent about what context is available without
 * loading full content.
 */
export async function getContextFilesSummary(
  options: LoadContextFilesOptions
): Promise<Array<{ name: string; path: string; description?: string }>> {
  const { projectPath, fsModule = secureFs } = options;
  const contextDir = path.resolve(getContextDir(projectPath));

  try {
    await fsModule.access(contextDir);
    const allFiles = await fsModule.readdir(contextDir);

    const textFiles = allFiles.filter((f) => {
      const lower = f.toLowerCase();
      return (lower.endsWith('.md') || lower.endsWith('.txt')) && f !== 'context-metadata.json';
    });

    if (textFiles.length === 0) {
      return [];
    }

    const metadata = await loadContextMetadata(contextDir, fsModule);

    return textFiles.map((fileName) => ({
      name: fileName,
      path: path.join(contextDir, fileName),
      description: metadata.files[fileName]?.description,
    }));
  } catch {
    return [];
  }
}
