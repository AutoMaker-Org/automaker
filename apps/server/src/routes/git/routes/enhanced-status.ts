/**
 * POST /enhanced-status endpoint - Get enhanced git status with diff stats per file
 * Returns per-file status with lines added/removed and staged/unstaged differentiation
 */

import type { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getErrorMessage, logError } from '../common.js';

const execAsync = promisify(exec);

interface EnhancedFileStatus {
  path: string;
  indexStatus: string;
  workTreeStatus: string;
  isConflicted: boolean;
  isStaged: boolean;
  isUnstaged: boolean;
  linesAdded: number;
  linesRemoved: number;
  statusLabel: string;
}

function getStatusLabel(indexStatus: string, workTreeStatus: string): string {
  // Check for conflicts
  if (
    indexStatus === 'U' ||
    workTreeStatus === 'U' ||
    (indexStatus === 'A' && workTreeStatus === 'A') ||
    (indexStatus === 'D' && workTreeStatus === 'D')
  ) {
    return 'Conflicted';
  }

  const hasStaged = indexStatus !== ' ' && indexStatus !== '?';
  const hasUnstaged = workTreeStatus !== ' ' && workTreeStatus !== '?';

  if (hasStaged && hasUnstaged) return 'Staged + Modified';
  if (hasStaged) return 'Staged';

  const statusChar = workTreeStatus !== ' ' ? workTreeStatus : indexStatus;
  switch (statusChar) {
    case 'M':
      return 'Modified';
    case 'A':
      return 'Added';
    case 'D':
      return 'Deleted';
    case 'R':
      return 'Renamed';
    case 'C':
      return 'Copied';
    case '?':
      return 'Untracked';
    default:
      return statusChar || '';
  }
}

export function createEnhancedStatusHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath required' });
        return;
      }

      try {
        // Get current branch
        const { stdout: branchRaw } = await execAsync('git rev-parse --abbrev-ref HEAD', {
          cwd: projectPath,
        });
        const branch = branchRaw.trim();

        // Get porcelain status for all files
        const { stdout: statusOutput } = await execAsync('git status --porcelain', {
          cwd: projectPath,
        });

        // Get diff numstat for working tree changes
        let workTreeStats: Record<string, { added: number; removed: number }> = {};
        try {
          const { stdout: numstatRaw } = await execAsync('git diff --numstat', {
            cwd: projectPath,
            maxBuffer: 10 * 1024 * 1024,
          });
          for (const line of numstatRaw.trim().split('\n').filter(Boolean)) {
            const parts = line.split('\t');
            if (parts.length >= 3) {
              const added = parseInt(parts[0], 10) || 0;
              const removed = parseInt(parts[1], 10) || 0;
              workTreeStats[parts[2]] = { added, removed };
            }
          }
        } catch {
          // Ignore
        }

        // Get diff numstat for staged changes
        let stagedStats: Record<string, { added: number; removed: number }> = {};
        try {
          const { stdout: stagedNumstatRaw } = await execAsync('git diff --numstat --cached', {
            cwd: projectPath,
            maxBuffer: 10 * 1024 * 1024,
          });
          for (const line of stagedNumstatRaw.trim().split('\n').filter(Boolean)) {
            const parts = line.split('\t');
            if (parts.length >= 3) {
              const added = parseInt(parts[0], 10) || 0;
              const removed = parseInt(parts[1], 10) || 0;
              stagedStats[parts[2]] = { added, removed };
            }
          }
        } catch {
          // Ignore
        }

        // Parse status and build enhanced file list
        const files: EnhancedFileStatus[] = [];

        for (const line of statusOutput.split('\n').filter(Boolean)) {
          if (line.length < 4) continue;

          const indexStatus = line[0];
          const workTreeStatus = line[1];
          const filePath = line.substring(3).trim();

          // Handle renamed files (format: "R  old -> new")
          const actualPath = filePath.includes(' -> ')
            ? filePath.split(' -> ')[1].trim()
            : filePath;

          const isConflicted =
            indexStatus === 'U' ||
            workTreeStatus === 'U' ||
            (indexStatus === 'A' && workTreeStatus === 'A') ||
            (indexStatus === 'D' && workTreeStatus === 'D');

          const isStaged = indexStatus !== ' ' && indexStatus !== '?';
          const isUnstaged = workTreeStatus !== ' ' && workTreeStatus !== '?';

          // Combine diff stats from both working tree and staged
          const wtStats = workTreeStats[actualPath] || { added: 0, removed: 0 };
          const stStats = stagedStats[actualPath] || { added: 0, removed: 0 };

          files.push({
            path: actualPath,
            indexStatus,
            workTreeStatus,
            isConflicted,
            isStaged,
            isUnstaged,
            linesAdded: wtStats.added + stStats.added,
            linesRemoved: wtStats.removed + stStats.removed,
            statusLabel: getStatusLabel(indexStatus, workTreeStatus),
          });
        }

        res.json({
          success: true,
          branch,
          files,
        });
      } catch (innerError) {
        logError(innerError, 'Git enhanced status failed');
        res.json({ success: true, branch: '', files: [] });
      }
    } catch (error) {
      logError(error, 'Get enhanced status failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
