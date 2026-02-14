/**
 * POST /git-diff endpoint - Get git diff for a specific file
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { isGitRepo } from '@automaker/git-utils';
import { getErrorMessage, logError } from '../common.js';

const execAsync = promisify(exec);

export function createGitDiffHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { repoPath, filePath } = req.body as { repoPath: string; filePath?: string };

      if (!repoPath) {
        res.status(400).json({ success: false, error: 'repoPath is required' });
        return;
      }

      const isRepo = await isGitRepo(repoPath);
      if (!isRepo) {
        res.json({ success: true, diff: '', hunks: [] });
        return;
      }

      // Get diff for a specific file or all files
      const diffCmd = filePath ? `git diff HEAD -- "${filePath}"` : 'git diff HEAD';

      const { stdout: diff } = await execAsync(diffCmd, {
        cwd: repoPath,
        maxBuffer: 10 * 1024 * 1024,
      });

      // Parse diff into hunks for gutter display
      const hunks = parseDiffHunks(diff);

      res.json({ success: true, diff, hunks });
    } catch (error) {
      logError(error, 'Git diff failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  changes: DiffChange[];
}

export interface DiffChange {
  type: 'add' | 'delete' | 'context';
  line: number;
  content: string;
}

/**
 * Parse a unified diff string into structured hunks
 */
function parseDiffHunks(diff: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const lines = diff.split('\n');

  let currentHunk: DiffHunk | null = null;
  let newLineNum = 0;

  for (const line of lines) {
    // Match hunk header: @@ -oldStart,oldLines +newStart,newLines @@
    const hunkMatch = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
    if (hunkMatch) {
      currentHunk = {
        oldStart: parseInt(hunkMatch[1]),
        oldLines: parseInt(hunkMatch[2] || '1'),
        newStart: parseInt(hunkMatch[3]),
        newLines: parseInt(hunkMatch[4] || '1'),
        changes: [],
      };
      newLineNum = currentHunk.newStart;
      hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith('+') && !line.startsWith('+++')) {
      currentHunk.changes.push({
        type: 'add',
        line: newLineNum,
        content: line.slice(1),
      });
      newLineNum++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      currentHunk.changes.push({
        type: 'delete',
        line: newLineNum,
        content: line.slice(1),
      });
      // Don't increment newLineNum for deleted lines
    } else if (line.startsWith(' ')) {
      currentHunk.changes.push({
        type: 'context',
        line: newLineNum,
        content: line.slice(1),
      });
      newLineNum++;
    }
  }

  return hunks;
}
