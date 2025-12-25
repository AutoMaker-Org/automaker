/**
 * File Mention Utilities
 *
 * Utilities for parsing, formatting, and managing file mentions (@path/to/file.ts)
 * and cross-project mentions (@@project:path/to/file.ts) in feature descriptions.
 */

import type { Project } from '@/lib/electron';

/**
 * File reference representing a mentioned file
 */
export interface FileReference {
  /** Unique identifier for the reference */
  id: string;
  /** Type of reference: current project or external project */
  type: 'current' | 'external';
  /** Project name (for external references) */
  projectName?: string;
  /** Absolute path to the project root */
  projectPath: string;
  /** Relative path within the project */
  relativePath: string;
  /** Full absolute path to the file */
  absolutePath: string;
  /** File extension (e.g., '.ts') */
  extension: string;
}

/**
 * File item from the server list-files endpoint
 */
export interface FileItem {
  relativePath: string;
  absolutePath: string;
  extension: string;
  size: number;
}

/**
 * Regex patterns for detecting mentions
 */
export const MENTION_PATTERNS = {
  /** Matches @@ for cross-project mentions (at word boundary or start) */
  CROSS_PROJECT_TRIGGER: /(?:^|[\s\n])@@$/,
  /** Matches @ for current project mentions (at word boundary or start, not followed by another @) */
  CURRENT_PROJECT_TRIGGER: /(?:^|[\s\n])@(?!@)$/,
  /** Matches a complete current project file reference: @path/to/file.ext */
  CURRENT_PROJECT_REF: /@([^\s@:]+)/g,
  /** Matches a complete cross-project file reference: @@project:path/to/file.ext */
  CROSS_PROJECT_REF: /@@([^:@\s]+):([^\s@]+)/g,
};

/**
 * File extension to icon mapping
 */
export const FILE_ICONS: Record<string, string> = {
  // JavaScript/TypeScript
  '.ts': 'typescript',
  '.tsx': 'react',
  '.js': 'javascript',
  '.jsx': 'react',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  // Web
  '.html': 'html',
  '.css': 'css',
  '.scss': 'sass',
  '.sass': 'sass',
  '.less': 'less',
  '.vue': 'vue',
  '.svelte': 'svelte',
  // Data/Config
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.env': 'env',
  // Documentation
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.txt': 'text',
  // Python
  '.py': 'python',
  '.pyi': 'python',
  // Go
  '.go': 'go',
  // Rust
  '.rs': 'rust',
  // Java/Kotlin
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  // C/C++
  '.c': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  // C#
  '.cs': 'csharp',
  // Ruby
  '.rb': 'ruby',
  // PHP
  '.php': 'php',
  // Shell
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  // SQL
  '.sql': 'database',
  // GraphQL
  '.graphql': 'graphql',
  '.gql': 'graphql',
  // Config files
  Dockerfile: 'docker',
  Makefile: 'makefile',
  '.gitignore': 'git',
};

/**
 * Get the icon type for a file extension
 */
export function getFileIconType(extension: string): string {
  return FILE_ICONS[extension] || FILE_ICONS[extension.toLowerCase()] || 'file';
}

/**
 * Generate a unique ID for a file reference
 */
export function generateFileReferenceId(): string {
  return `fref-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a file reference from a file item
 */
export function createFileReference(
  fileItem: FileItem,
  projectPath: string,
  projectName?: string
): FileReference {
  return {
    id: generateFileReferenceId(),
    type: projectName ? 'external' : 'current',
    projectName,
    projectPath,
    relativePath: fileItem.relativePath,
    absolutePath: fileItem.absolutePath,
    extension: fileItem.extension,
  };
}

/**
 * Format a file reference as a mention string
 *
 * @example
 * formatFileReferenceAsText({ type: 'current', relativePath: 'src/file.ts' })
 * // Returns: '@src/file.ts'
 *
 * formatFileReferenceAsText({ type: 'external', projectName: 'api', relativePath: 'src/file.ts' })
 * // Returns: '@@api:src/file.ts'
 */
export function formatFileReferenceAsText(ref: FileReference): string {
  if (ref.type === 'external' && ref.projectName) {
    return `@@${ref.projectName}:${ref.relativePath}`;
  }
  return `@${ref.relativePath}`;
}

/**
 * Parse mention trigger from text at cursor position
 * Returns the trigger type and the search query after the trigger
 */
export function parseMentionTrigger(
  text: string,
  cursorPosition: number
): { type: 'current' | 'cross-project' | null; query: string; startIndex: number } {
  // Get text up to cursor
  const textUpToCursor = text.slice(0, cursorPosition);

  // Find the last @ or @@ before cursor
  let lastAtIndex = -1;
  let isCrossProject = false;

  // Search backwards for @ or @@
  for (let i = textUpToCursor.length - 1; i >= 0; i--) {
    const char = textUpToCursor[i];
    if (char === '@') {
      // Check if it's @@
      if (i > 0 && textUpToCursor[i - 1] === '@') {
        lastAtIndex = i - 1;
        isCrossProject = true;
        break;
      }
      // Single @ - check it's at word boundary
      if (i === 0 || /[\s\n]/.test(textUpToCursor[i - 1])) {
        lastAtIndex = i;
        isCrossProject = false;
        break;
      }
    }
    // Stop if we hit whitespace (no trigger in this word)
    if (/[\s\n]/.test(char)) {
      break;
    }
  }

  if (lastAtIndex === -1) {
    return { type: null, query: '', startIndex: -1 };
  }

  // Extract query after trigger
  const triggerLength = isCrossProject ? 2 : 1;
  const query = textUpToCursor.slice(lastAtIndex + triggerLength);

  // Don't trigger if query contains spaces (user has moved on)
  if (query.includes(' ') || query.includes('\n')) {
    return { type: null, query: '', startIndex: -1 };
  }

  return {
    type: isCrossProject ? 'cross-project' : 'current',
    query,
    startIndex: lastAtIndex,
  };
}

/**
 * Parse all file references from text
 */
export function parseFileReferencesFromText(
  text: string,
  _currentProjectPath: string,
  projects: Project[]
): Array<{
  type: 'current' | 'external';
  path: string;
  projectName?: string;
  start: number;
  end: number;
}> {
  const references: Array<{
    type: 'current' | 'external';
    path: string;
    projectName?: string;
    start: number;
    end: number;
  }> = [];

  // Find cross-project references first (@@project:path)
  let match;
  const crossProjectRegex = /@@([^:@\s]+):([^\s@]+)/g;
  while ((match = crossProjectRegex.exec(text)) !== null) {
    const projectName = match[1];
    const path = match[2];
    // Verify project exists
    if (projects.some((p) => p.name === projectName)) {
      references.push({
        type: 'external',
        projectName,
        path,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  // Find current project references (@path)
  const currentProjectRegex = /@([^\s@:]+)/g;
  while ((match = currentProjectRegex.exec(text)) !== null) {
    // Skip if this is part of a @@ reference
    if (match.index > 0 && text[match.index - 1] === '@') {
      continue;
    }
    references.push({
      type: 'current',
      path: match[1],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // Sort by position
  references.sort((a, b) => a.start - b.start);

  return references;
}

/**
 * Replace a mention trigger with a file reference in text
 */
export function replaceMentionWithReference(
  text: string,
  startIndex: number,
  cursorPosition: number,
  reference: FileReference
): { newText: string; newCursorPosition: number } {
  const before = text.slice(0, startIndex);
  const after = text.slice(cursorPosition);
  const refText = formatFileReferenceAsText(reference);

  // Add a space after the reference for easier continued typing
  const newText = before + refText + ' ' + after;
  const newCursorPosition = before.length + refText.length + 1;

  return { newText, newCursorPosition };
}

/**
 * Get display name for a file (just the filename)
 */
export function getFileName(relativePath: string): string {
  const parts = relativePath.split('/');
  return parts[parts.length - 1];
}

/**
 * Get parent directory path
 */
export function getParentPath(relativePath: string): string {
  const parts = relativePath.split('/');
  if (parts.length <= 1) return '';
  return parts.slice(0, -1).join('/');
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Check if text ends with a mention trigger at cursor position
 */
export function hasMentionTrigger(text: string, cursorPosition: number): boolean {
  const result = parseMentionTrigger(text, cursorPosition);
  return result.type !== null;
}

/**
 * Get editor command for opening a file
 */
export function getEditorCommand(
  editor: string,
  filePath: string
): { command: string; args: string[] } {
  switch (editor) {
    case 'cursor':
      return { command: 'cursor', args: [filePath] };
    case 'code':
      return { command: 'code', args: [filePath] };
    case 'vim':
      return { command: 'vim', args: [filePath] };
    case 'nvim':
      return { command: 'nvim', args: [filePath] };
    case 'zed':
      return { command: 'zed', args: [filePath] };
    case 'sublime':
      return { command: 'subl', args: [filePath] };
    case 'atom':
      return { command: 'atom', args: [filePath] };
    default:
      // Default to cursor
      return { command: 'cursor', args: [filePath] };
  }
}

/**
 * Remove all file references (@path and @@project:path) from text
 */
export function removeFileReferencesFromText(text: string): string {
  // Remove @@project:path patterns first
  let cleaned = text.replace(/@@[^:@\s]+:[^\s@]+/g, '');
  // Remove @path patterns (but not @@ - use negative lookbehind)
  cleaned = cleaned.replace(/(?<!@)@[^\s@:]+/g, '');
  // Clean up extra whitespace (multiple spaces become one, trim)
  cleaned = cleaned.replace(/[ \t]+/g, ' ').trim();
  // Clean up multiple newlines
  cleaned = cleaned.replace(/\n\s*\n/g, '\n');
  return cleaned;
}

/**
 * Extract file references from text and create FileReference objects
 * Used when loading existing feature descriptions in edit mode
 * Note: Deduplicates references based on their path to avoid UI bugs
 */
export function extractFileReferencesFromText(
  text: string,
  currentProjectPath: string | null,
  projects: Array<{ name: string; path: string }>
): FileReference[] {
  const references: FileReference[] = [];
  // Track seen paths to deduplicate (format: "@@project:path" or "@path")
  const seenPaths = new Set<string>();

  // Find cross-project references (@@project:path)
  const crossProjectRegex = /@@([^:@\s]+):([^\s@]+)/g;
  let match;
  while ((match = crossProjectRegex.exec(text)) !== null) {
    const projectName = match[1];
    const relativePath = match[2];
    const project = projects.find((p) => p.name === projectName);

    if (project) {
      const pathKey = `@@${projectName}:${relativePath}`;
      if (!seenPaths.has(pathKey)) {
        seenPaths.add(pathKey);
        references.push({
          id: generateFileReferenceId(),
          type: 'external',
          projectName,
          projectPath: project.path,
          relativePath,
          absolutePath: `${project.path}/${relativePath}`,
          extension: relativePath.includes('.') ? `.${relativePath.split('.').pop()}` : '',
        });
      }
    }
  }

  // Find current project references (@path)
  const currentProjectRegex = /(?<!@)@([^\s@:]+)/g;
  while ((match = currentProjectRegex.exec(text)) !== null) {
    const relativePath = match[1];

    if (currentProjectPath) {
      const pathKey = `@${relativePath}`;
      if (!seenPaths.has(pathKey)) {
        seenPaths.add(pathKey);
        references.push({
          id: generateFileReferenceId(),
          type: 'current',
          projectPath: currentProjectPath,
          relativePath,
          absolutePath: `${currentProjectPath}/${relativePath}`,
          extension: relativePath.includes('.') ? `.${relativePath.split('.').pop()}` : '',
        });
      }
    }
  }

  return references;
}
