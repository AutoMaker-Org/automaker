/**
 * Context Loader - Loads project context files for agent prompts
 *
 * Provides a shared utility to load context files from .automaker/context/
 * and memory files from .automaker/memory/, formatting them as system prompt
 * content. Used by both auto-mode-service and agent-service to ensure all
 * agents are aware of project context and past learnings.
 *
 * Context files contain project-specific rules, conventions, and guidelines
 * that agents must follow when working on the project.
 *
 * Memory files contain learnings from past agent work, including decisions,
 * gotchas, and patterns that should inform future work.
 */

import path from 'path';
import { secureFs } from '@automaker/platform';
import {
  getMemoryDir,
  parseFrontmatter,
  initializeMemoryFolder,
  extractTerms,
  calculateUsageScore,
  countMatches,
  incrementUsageStat,
  type MemoryFsModule,
  type MemoryMetadata,
} from './memory-loader.js';

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
 * Memory file info (from .automaker/memory/)
 */
export interface MemoryFileInfo {
  name: string;
  path: string;
  content: string;
  category: string;
}

/**
 * Result of loading context files
 */
export interface ContextFilesResult {
  files: ContextFileInfo[];
  memoryFiles: MemoryFileInfo[];
  formattedPrompt: string;
}

/**
 * File system module interface for context loading
 * Compatible with secureFs from @automaker/platform
 * Includes write methods needed for memory initialization
 */
export interface ContextFsModule {
  access: (path: string) => Promise<void>;
  readdir: (path: string) => Promise<string[]>;
  readFile: (path: string, encoding?: BufferEncoding) => Promise<string | Buffer>;
  // Write methods needed for memory operations
  writeFile: (path: string, content: string) => Promise<void>;
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<string | undefined>;
  appendFile: (path: string, content: string) => Promise<void>;
}

/**
 * Task context for smart memory selection
 */
export interface TaskContext {
  /** Title or name of the current task/feature */
  title: string;
  /** Description of what the task involves */
  description?: string;
}

/**
 * Options for loading context files
 */
export interface LoadContextFilesOptions {
  /** Project path to load context from */
  projectPath: string;
  /** Optional custom secure fs module (for dependency injection) */
  fsModule?: ContextFsModule;
  /** Whether to include memory files from .automaker/memory/ (default: true) */
  includeMemory?: boolean;
  /** Whether to initialize memory folder if it doesn't exist (default: true) */
  initializeMemory?: boolean;
  /** Task context for smart memory selection - if not provided, only loads high-importance files */
  taskContext?: TaskContext;
  /** Maximum number of memory files to load (default: 5) */
  maxMemoryFiles?: number;
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
 * and optionally memory files from .automaker/memory/
 *
 * This function loads all .md and .txt files from the context directory,
 * along with their metadata (descriptions), and formats them into a
 * system prompt that can be prepended to agent prompts.
 *
 * By default, it also loads memory files containing learnings from past
 * agent work, which helps agents make better decisions.
 *
 * @param options - Configuration options
 * @returns Promise resolving to context files, memory files, and formatted prompt
 *
 * @example
 * ```typescript
 * const { formattedPrompt, files, memoryFiles } = await loadContextFiles({
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
  const {
    projectPath,
    fsModule = secureFs,
    includeMemory = true,
    initializeMemory = true,
    taskContext,
    maxMemoryFiles = 5,
  } = options;
  const contextDir = path.resolve(getContextDir(projectPath));

  const files: ContextFileInfo[] = [];
  const memoryFiles: MemoryFileInfo[] = [];

  // Load context files
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

    if (textFiles.length > 0) {
      // Load metadata for descriptions
      const metadata = await loadContextMetadata(contextDir, fsModule);

      // Load each file with its content and metadata
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
    }
  } catch {
    // Context directory doesn't exist or is inaccessible - that's fine
  }

  // Load memory files if enabled (with smart selection)
  if (includeMemory) {
    const memoryDir = getMemoryDir(projectPath);

    // Initialize memory folder if needed
    if (initializeMemory) {
      try {
        await initializeMemoryFolder(projectPath, fsModule as MemoryFsModule);
      } catch {
        // Initialization failed, continue without memory
      }
    }

    try {
      await fsModule.access(memoryDir);
      const allMemoryFiles = await fsModule.readdir(memoryDir);

      // Filter for markdown memory files (except _index.md, case-insensitive)
      const memoryMdFiles = allMemoryFiles.filter((f) => {
        const lower = f.toLowerCase();
        return lower.endsWith('.md') && lower !== '_index.md';
      });

      // Extract terms from task context for matching
      const taskTerms = taskContext
        ? extractTerms(taskContext.title + ' ' + (taskContext.description || ''))
        : [];

      // Score and load memory files
      const scoredFiles: Array<{
        fileName: string;
        filePath: string;
        body: string;
        metadata: MemoryMetadata;
        score: number;
      }> = [];

      for (const fileName of memoryMdFiles) {
        const filePath = path.join(memoryDir, fileName);
        try {
          const rawContent = await fsModule.readFile(filePath, 'utf-8');
          const { metadata, body } = parseFrontmatter(rawContent as string);

          // Skip empty files
          if (!body.trim()) continue;

          // Calculate relevance score
          let score = 0;

          if (taskTerms.length > 0) {
            // Match task terms against file metadata
            const tagScore = countMatches(metadata.tags, taskTerms) * 3;
            const relevantToScore = countMatches(metadata.relevantTo, taskTerms) * 2;
            const summaryTerms = extractTerms(metadata.summary);
            const summaryScore = countMatches(summaryTerms, taskTerms);
            // Split category name on hyphens/underscores for better matching
            // e.g., "authentication-decisions" matches "authentication"
            const categoryTerms = fileName
              .replace('.md', '')
              .split(/[-_]/)
              .filter((t) => t.length > 2);
            const categoryScore = countMatches(categoryTerms, taskTerms) * 4;

            // Usage-based scoring (files that helped before rank higher)
            const usageScore = calculateUsageScore(metadata.usageStats);

            score =
              (tagScore + relevantToScore + summaryScore + categoryScore) *
              metadata.importance *
              usageScore;
          } else {
            // No task context - use importance as score
            score = metadata.importance;
          }

          scoredFiles.push({ fileName, filePath, body, metadata, score });
        } catch (error) {
          console.warn(`[ContextLoader] Failed to read memory file ${fileName}:`, error);
        }
      }

      // Sort by score (highest first)
      scoredFiles.sort((a, b) => b.score - a.score);

      // Select files to load:
      // 1. Always include gotchas.md if it exists (unless maxMemoryFiles=0)
      // 2. Include high-importance files (importance >= 0.9)
      // 3. Include top scoring files up to maxMemoryFiles
      const selectedFiles = new Set<string>();

      // Skip selection if maxMemoryFiles is 0
      if (maxMemoryFiles > 0) {
        // Always include gotchas.md
        const gotchasFile = scoredFiles.find((f) => f.fileName === 'gotchas.md');
        if (gotchasFile) {
          selectedFiles.add('gotchas.md');
        }

        // Add high-importance files
        for (const file of scoredFiles) {
          if (file.metadata.importance >= 0.9 && selectedFiles.size < maxMemoryFiles) {
            selectedFiles.add(file.fileName);
          }
        }

        // Add top scoring files (if we have task context and room)
        if (taskTerms.length > 0) {
          for (const file of scoredFiles) {
            if (file.score > 0 && selectedFiles.size < maxMemoryFiles) {
              selectedFiles.add(file.fileName);
            }
          }
        }
      }

      // Load selected files and increment loaded stat
      for (const file of scoredFiles) {
        if (selectedFiles.has(file.fileName)) {
          memoryFiles.push({
            name: file.fileName,
            path: file.filePath,
            content: file.body,
            category: file.fileName.replace('.md', ''),
          });

          // Increment the 'loaded' stat for this file (CRITICAL FIX)
          // This makes calculateUsageScore work correctly
          try {
            await incrementUsageStat(file.filePath, 'loaded', fsModule as MemoryFsModule);
          } catch {
            // Non-critical - continue even if stat update fails
          }
        }
      }

      if (memoryFiles.length > 0) {
        const selectedNames = memoryFiles.map((f) => f.category).join(', ');
        console.log(`[ContextLoader] Selected memory files: ${selectedNames}`);
      }
    } catch {
      // Memory directory doesn't exist - that's fine
    }
  }

  // Build combined prompt
  const contextPrompt = buildContextPrompt(files);
  const memoryPrompt = buildMemoryPrompt(memoryFiles);
  const formattedPrompt = [contextPrompt, memoryPrompt].filter(Boolean).join('\n\n');

  const loadedItems = [];
  if (files.length > 0) {
    loadedItems.push(`${files.length} context file(s)`);
  }
  if (memoryFiles.length > 0) {
    loadedItems.push(`${memoryFiles.length} memory file(s)`);
  }
  if (loadedItems.length > 0) {
    console.log(`[ContextLoader] Loaded ${loadedItems.join(' and ')}`);
  }

  return { files, memoryFiles, formattedPrompt };
}

/**
 * Build a formatted prompt from memory files
 */
function buildMemoryPrompt(memoryFiles: MemoryFileInfo[]): string {
  if (memoryFiles.length === 0) {
    return '';
  }

  const sections = memoryFiles.map((file) => {
    return `## ${file.category.toUpperCase()}

${file.content}`;
  });

  return `# Project Memory

The following learnings and decisions from previous work are available.
**IMPORTANT**: Review these carefully before making changes that could conflict with past decisions.

---

${sections.join('\n\n---\n\n')}

---
`;
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
