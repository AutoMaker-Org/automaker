/**
 * POST /list-files endpoint - Recursively list project files with filtering
 *
 * Used by the file mention feature to provide fuzzy search over project files.
 * Respects .gitignore and skips common directories like node_modules.
 */

import type { Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs/promises';
import { PathNotAllowedError } from '@automaker/platform';
import { getErrorMessage, logError } from '../common.js';

// Default file extensions to include (common code files)
const DEFAULT_EXTENSIONS = [
  // JavaScript/TypeScript
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  // Web
  '.html',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.vue',
  '.svelte',
  // Data/Config
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.xml',
  '.env',
  // Documentation
  '.md',
  '.mdx',
  '.txt',
  '.rst',
  // Python
  '.py',
  '.pyi',
  // Go
  '.go',
  // Rust
  '.rs',
  // Java/Kotlin
  '.java',
  '.kt',
  '.kts',
  // C/C++
  '.c',
  '.cpp',
  '.cc',
  '.h',
  '.hpp',
  // C#
  '.cs',
  // Ruby
  '.rb',
  // PHP
  '.php',
  // Shell
  '.sh',
  '.bash',
  '.zsh',
  // SQL
  '.sql',
  // GraphQL
  '.graphql',
  '.gql',
];

// Files without extensions to include
const INCLUDE_FILES_WITHOUT_EXT = [
  'Dockerfile',
  'Makefile',
  'Jenkinsfile',
  'Procfile',
  'Gemfile',
  'Rakefile',
  '.gitignore',
  '.gitattributes',
  '.prettierrc',
  '.eslintrc',
  '.babelrc',
  '.editorconfig',
  '.dockerignore',
  '.nvmrc',
  '.node-version',
];

// Directories to always skip
const SKIP_DIRECTORIES = [
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'out',
  'target',
  '.next',
  '.nuxt',
  '.output',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  'venv',
  '.venv',
  'env',
  '.env',
  'vendor',
  'coverage',
  '.coverage',
  '.nyc_output',
  '.cache',
  '.parcel-cache',
  '.turbo',
  '.vercel',
  '.netlify',
  'tmp',
  'temp',
  '.tmp',
  '.temp',
  'logs',
  '.automaker',
];

interface FileInfo {
  relativePath: string;
  absolutePath: string;
  extension: string;
  size: number;
}

interface ListFilesRequest {
  path: string;
  extensions?: string[];
  maxDepth?: number;
  maxFiles?: number;
}

interface ListFilesResponse {
  success: boolean;
  files?: FileInfo[];
  truncated?: boolean;
  error?: string;
}

/**
 * Parse a basic .gitignore file and return a list of patterns
 */
async function parseGitignore(projectPath: string): Promise<string[]> {
  try {
    const gitignorePath = path.join(projectPath, '.gitignore');
    const content = await fs.readFile(gitignorePath, 'utf-8');
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  } catch {
    return [];
  }
}

/**
 * Simple gitignore pattern matching
 * Supports basic patterns like: *.log, /dist, build/, pattern/**
 */
function matchesGitignore(relativePath: string, patterns: string[]): boolean {
  const pathParts = relativePath.split('/');
  const fileName = pathParts[pathParts.length - 1];

  for (const pattern of patterns) {
    // Skip empty patterns
    if (!pattern) continue;

    // Handle directory-only patterns (ending with /)
    const isDirectoryPattern = pattern.endsWith('/');
    const cleanPattern = isDirectoryPattern ? pattern.slice(0, -1) : pattern;

    // Handle negation patterns (we don't support them, skip)
    if (cleanPattern.startsWith('!')) continue;

    // Handle root-relative patterns (starting with /)
    const isRootRelative = cleanPattern.startsWith('/');
    const patternToMatch = isRootRelative ? cleanPattern.slice(1) : cleanPattern;

    // Handle ** glob (match any depth)
    if (patternToMatch.includes('**')) {
      const parts = patternToMatch.split('**');
      if (parts.length === 2) {
        const [prefix, suffix] = parts;
        const prefixMatch = !prefix || relativePath.startsWith(prefix);
        const suffixMatch = !suffix || relativePath.endsWith(suffix.replace(/^\//, ''));
        if (prefixMatch && suffixMatch) return true;
      }
    }

    // Handle simple wildcard patterns (*.ext)
    if (patternToMatch.startsWith('*.')) {
      const ext = patternToMatch.slice(1);
      if (fileName.endsWith(ext)) return true;
      continue;
    }

    // Handle exact matches and directory patterns
    if (isRootRelative) {
      // Match from root
      if (relativePath === patternToMatch || relativePath.startsWith(patternToMatch + '/')) {
        return true;
      }
    } else {
      // Match anywhere in path
      for (let i = 0; i < pathParts.length; i++) {
        const subPath = pathParts.slice(i).join('/');
        if (subPath === patternToMatch || subPath.startsWith(patternToMatch + '/')) {
          return true;
        }
        // Also match just the directory/file name
        if (pathParts[i] === patternToMatch) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Recursively list files in a directory
 */
async function listFilesRecursive(
  basePath: string,
  currentPath: string,
  extensions: Set<string>,
  gitignorePatterns: string[],
  maxDepth: number,
  maxFiles: number,
  currentDepth: number,
  files: FileInfo[]
): Promise<boolean> {
  // Check if we've hit the max files limit
  if (files.length >= maxFiles) {
    return true; // truncated
  }

  // Check depth limit
  if (currentDepth > maxDepth) {
    return false;
  }

  let entries;
  try {
    entries = await fs.readdir(currentPath, { withFileTypes: true });
  } catch {
    // Skip directories we can't read
    return false;
  }

  // Sort entries: directories first, then files, alphabetically
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  let truncated = false;

  for (const entry of entries) {
    if (files.length >= maxFiles) {
      return true; // truncated
    }

    const fullPath = path.join(currentPath, entry.name);
    const relativePath = path.relative(basePath, fullPath);

    // Skip hidden files/directories (except allowed ones)
    if (entry.name.startsWith('.') && !INCLUDE_FILES_WITHOUT_EXT.includes(entry.name)) {
      // Check if it's a directory we should skip
      if (entry.isDirectory()) continue;
    }

    // Check gitignore patterns
    if (matchesGitignore(relativePath, gitignorePatterns)) {
      continue;
    }

    if (entry.isDirectory()) {
      // Skip common directories
      if (SKIP_DIRECTORIES.includes(entry.name.toLowerCase())) {
        continue;
      }

      // Recurse into directory
      const childTruncated = await listFilesRecursive(
        basePath,
        fullPath,
        extensions,
        gitignorePatterns,
        maxDepth,
        maxFiles,
        currentDepth + 1,
        files
      );
      if (childTruncated) {
        truncated = true;
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      const shouldInclude = extensions.has(ext) || INCLUDE_FILES_WITHOUT_EXT.includes(entry.name);

      if (shouldInclude) {
        try {
          const stats = await fs.stat(fullPath);
          files.push({
            relativePath: relativePath.replace(/\\/g, '/'), // Normalize path separators
            absolutePath: fullPath,
            extension: ext || entry.name, // Use filename for files without extension
            size: stats.size,
          });
        } catch {
          // Skip files we can't stat
        }
      }
    }
  }

  return truncated;
}

export function createListFilesHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        path: projectPath,
        extensions,
        maxDepth = 15,
        maxFiles = 5000,
      } = req.body as ListFilesRequest;

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'path is required',
        } as ListFilesResponse);
        return;
      }

      // Validate path exists and is a directory
      try {
        const stats = await fs.stat(projectPath);
        if (!stats.isDirectory()) {
          res.status(400).json({
            success: false,
            error: 'Path is not a directory',
          } as ListFilesResponse);
          return;
        }
      } catch {
        res.status(400).json({
          success: false,
          error: 'Path does not exist',
        } as ListFilesResponse);
        return;
      }

      // Parse gitignore
      const gitignorePatterns = await parseGitignore(projectPath);

      // Determine extensions to use
      const extensionSet = new Set(
        (extensions || DEFAULT_EXTENSIONS).map((e) =>
          e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`
        )
      );

      // List files
      const files: FileInfo[] = [];
      const truncated = await listFilesRecursive(
        projectPath,
        projectPath,
        extensionSet,
        gitignorePatterns,
        maxDepth,
        maxFiles,
        0,
        files
      );

      res.json({
        success: true,
        files,
        truncated,
      } as ListFilesResponse);
    } catch (error) {
      // Path not allowed - return 403 Forbidden
      if (error instanceof PathNotAllowedError) {
        res.status(403).json({
          success: false,
          error: getErrorMessage(error),
        } as ListFilesResponse);
        return;
      }

      logError(error, 'List files failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      } as ListFilesResponse);
    }
  };
}
