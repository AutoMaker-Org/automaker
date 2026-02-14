/**
 * POST /search-content endpoint - Search file contents (grep-like)
 */

import type { Request, Response } from 'express';
import { promises as fs } from 'fs';
import { join, relative } from 'path';
import { getErrorMessage, logError } from '../common.js';

/** Directories to skip during search */
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.DS_Store',
  '.automaker',
  'dist',
  'build',
  '.next',
  '.cache',
  '.turbo',
  '__pycache__',
  '.vscode',
  '.idea',
  '.svn',
  '.hg',
  'coverage',
  '.nyc_output',
  '.parcel-cache',
]);

/** Binary file extensions to skip */
const BINARY_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'bmp',
  'ico',
  'webp',
  'svg',
  'mp3',
  'mp4',
  'avi',
  'mov',
  'mkv',
  'wav',
  'flac',
  'zip',
  'tar',
  'gz',
  'bz2',
  'xz',
  '7z',
  'rar',
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'eot',
  'exe',
  'dll',
  'so',
  'dylib',
  'bin',
  'lock',
]);

/** Maximum results */
const MAX_RESULTS = 50;
/** Maximum depth */
const MAX_DEPTH = 20;
/** Maximum file size to search (1MB) */
const MAX_FILE_SIZE = 1024 * 1024;
/** Context lines before/after match */
const CONTEXT_LINES = 1;

interface ContentMatch {
  path: string;
  relativePath: string;
  name: string;
  matches: Array<{
    line: number;
    content: string;
    preview: string; // surrounding context
  }>;
}

/**
 * Search file content for a pattern
 */
async function searchFileContent(
  filePath: string,
  pattern: RegExp,
  maxMatchesPerFile: number
): Promise<Array<{ line: number; content: string; preview: string }>> {
  let content: string;
  try {
    // Check size first
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_FILE_SIZE) return [];
    content = await fs.readFile(filePath, 'utf-8');
  } catch {
    return [];
  }

  const lines = content.split('\n');
  const matches: Array<{ line: number; content: string; preview: string }> = [];

  for (let i = 0; i < lines.length && matches.length < maxMatchesPerFile; i++) {
    if (pattern.test(lines[i])) {
      // Build preview with context
      const start = Math.max(0, i - CONTEXT_LINES);
      const end = Math.min(lines.length - 1, i + CONTEXT_LINES);
      const previewLines = lines.slice(start, end + 1);

      matches.push({
        line: i + 1, // 1-indexed
        content: lines[i].trim(),
        preview: previewLines.join('\n'),
      });
    }
  }

  return matches;
}

/**
 * Recursively walk and search file contents
 */
async function walkAndSearch(
  rootPath: string,
  dirPath: string,
  pattern: RegExp,
  results: ContentMatch[],
  depth: number,
  fileTypes?: string[],
  maxMatchesPerFile: number = 5
): Promise<void> {
  if (depth > MAX_DEPTH || results.length >= MAX_RESULTS) return;

  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= MAX_RESULTS) return;

    if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;

    const fullPath = join(dirPath, entry.name);

    if (entry.isDirectory()) {
      await walkAndSearch(
        rootPath,
        fullPath,
        pattern,
        results,
        depth + 1,
        fileTypes,
        maxMatchesPerFile
      );
    } else {
      // Skip binary files
      const ext = entry.name.includes('.') ? entry.name.split('.').pop()?.toLowerCase() || '' : '';
      if (BINARY_EXTENSIONS.has(ext)) continue;

      // Check file type filter
      if (fileTypes && fileTypes.length > 0 && ext && !fileTypes.includes(ext)) continue;

      const matches = await searchFileContent(fullPath, pattern, maxMatchesPerFile);
      if (matches.length > 0) {
        results.push({
          path: fullPath,
          relativePath: relative(rootPath, fullPath),
          name: entry.name,
          matches,
        });
      }
    }
  }
}

export function createSearchContentHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { rootPath, query, fileTypes, caseSensitive, useRegex, limit } = req.body as {
        rootPath: string;
        query: string;
        fileTypes?: string[];
        caseSensitive?: boolean;
        useRegex?: boolean;
        limit?: number;
      };

      if (!rootPath) {
        res.status(400).json({ success: false, error: 'rootPath is required' });
        return;
      }

      if (!query || query.trim().length === 0) {
        res.json({ success: true, results: [] });
        return;
      }

      // Build regex pattern
      let pattern: RegExp;
      try {
        const flags = caseSensitive ? 'g' : 'gi';
        if (useRegex) {
          pattern = new RegExp(query, flags);
        } else {
          // Escape regex special chars for literal search
          const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          pattern = new RegExp(escaped, flags);
        }
      } catch {
        res.status(400).json({ success: false, error: 'Invalid search pattern' });
        return;
      }

      const results: ContentMatch[] = [];
      await walkAndSearch(rootPath, rootPath, pattern, results, 0, fileTypes);

      // Apply limit
      const maxResults = Math.min(limit || MAX_RESULTS, MAX_RESULTS);
      const trimmed = results.slice(0, maxResults);

      res.json({ success: true, results: trimmed });
    } catch (error) {
      logError(error, 'Content search failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
