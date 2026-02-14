/**
 * POST /search-files endpoint - Recursively search for files by name with fuzzy matching
 */

import type { Request, Response } from 'express';
import { promises as fs } from 'fs';
import { join, relative } from 'path';
import { getErrorMessage, logError } from '../common.js';

/** Directories to skip during recursive search */
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

/** Maximum number of results to return */
const MAX_RESULTS = 100;

/** Maximum depth to traverse */
const MAX_DEPTH = 20;

interface FileSearchResult {
  path: string; // Absolute path
  relativePath: string; // Relative to rootPath
  name: string; // File name
  isDirectory: boolean;
  score: number; // Fuzzy match score (lower = better)
}

/**
 * Simple fuzzy match scoring.
 * Returns a score (lower is better) or -1 if no match.
 * Prefers:
 *   - Exact matches
 *   - Prefix matches
 *   - Consecutive character matches
 *   - Shorter file names
 */
function fuzzyScore(query: string, target: string): number {
  const lowerQuery = query.toLowerCase();
  const lowerTarget = target.toLowerCase();

  // Exact match
  if (lowerTarget === lowerQuery) return 0;

  // Exact substring match
  const substringIndex = lowerTarget.indexOf(lowerQuery);
  if (substringIndex !== -1) {
    // Prefix match is best (score 1), otherwise position-based
    return substringIndex === 0 ? 1 : 2 + substringIndex;
  }

  // Fuzzy character matching
  let queryIdx = 0;
  let score = 0;
  let lastMatchIdx = -1;
  let consecutiveBonus = 0;

  for (let i = 0; i < lowerTarget.length && queryIdx < lowerQuery.length; i++) {
    if (lowerTarget[i] === lowerQuery[queryIdx]) {
      // Consecutive match bonus
      if (lastMatchIdx === i - 1) {
        consecutiveBonus += 1;
      }
      // Word boundary bonus (after /, -, _, .)
      const prevChar = i > 0 ? lowerTarget[i - 1] : '/';
      const isBoundary =
        prevChar === '/' || prevChar === '-' || prevChar === '_' || prevChar === '.';
      score += isBoundary ? 0 : i - (lastMatchIdx === -1 ? 0 : lastMatchIdx);
      lastMatchIdx = i;
      queryIdx++;
    }
  }

  // All query chars matched?
  if (queryIdx < lowerQuery.length) return -1;

  // Final score: gap penalty minus consecutive bonus, plus length penalty
  return Math.max(
    10,
    score - consecutiveBonus * 2 + (lowerTarget.length - lowerQuery.length) * 0.5
  );
}

/**
 * Recursively walk a directory collecting matching files.
 */
async function walkAndMatch(
  rootPath: string,
  dirPath: string,
  query: string,
  results: FileSearchResult[],
  depth: number,
  fileTypeFilter?: string[],
  showModifiedOnly?: boolean
): Promise<void> {
  if (depth > MAX_DEPTH || results.length >= MAX_RESULTS) return;

  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return; // Permission denied or gone
  }

  for (const entry of entries) {
    if (results.length >= MAX_RESULTS) return;

    if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;

    const fullPath = join(dirPath, entry.name);
    const relPath = relative(rootPath, fullPath);

    if (entry.isDirectory()) {
      await walkAndMatch(
        rootPath,
        fullPath,
        query,
        results,
        depth + 1,
        fileTypeFilter,
        showModifiedOnly
      );
    } else {
      // Check file type filter
      if (fileTypeFilter && fileTypeFilter.length > 0) {
        const ext = entry.name.includes('.') ? entry.name.split('.').pop()?.toLowerCase() : '';
        if (ext && !fileTypeFilter.includes(ext)) continue;
      }

      // Score against both file name and relative path
      const nameScore = fuzzyScore(query, entry.name);
      const pathScore = fuzzyScore(query, relPath);
      const bestScore =
        nameScore === -1 && pathScore === -1
          ? -1
          : nameScore === -1
            ? pathScore
            : pathScore === -1
              ? nameScore
              : Math.min(nameScore, pathScore);

      if (bestScore >= 0) {
        results.push({
          path: fullPath,
          relativePath: relPath,
          name: entry.name,
          isDirectory: false,
          score: bestScore,
        });
      }
    }
  }
}

export function createSearchFilesHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { rootPath, query, fileTypes, limit } = req.body as {
        rootPath: string;
        query: string;
        fileTypes?: string[];
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

      const results: FileSearchResult[] = [];
      await walkAndMatch(rootPath, rootPath, query.trim(), results, 0, fileTypes);

      // Sort by score (lower = better match)
      results.sort((a, b) => a.score - b.score);

      // Apply limit
      const maxResults = Math.min(limit || MAX_RESULTS, MAX_RESULTS);
      const trimmed = results.slice(0, maxResults);

      res.json({ success: true, results: trimmed });
    } catch (error) {
      logError(error, 'File search failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
