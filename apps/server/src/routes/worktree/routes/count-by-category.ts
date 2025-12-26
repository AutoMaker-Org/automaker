/**
 * POST /count-by-category endpoint - Count worktrees by category
 *
 * This endpoint counts existing worktrees in each category folder (feature, bugfix, etc.)
 * within the .worktrees directory. Used to determine the next sequential number
 * when creating new worktrees with the pattern {category}/{NNN}-{title}.
 */

import type { Request, Response } from 'express';
import path from 'path';
import * as secureFs from '../../../lib/secure-fs.js';
import { isGitRepo, getErrorMessage, logError } from '../common.js';
import type { WorktreeCategory } from '@automaker/types';

/**
 * All valid worktree categories
 */
const WORKTREE_CATEGORIES: WorktreeCategory[] = [
  'feature',
  'bugfix',
  'hotfix',
  'refactor',
  'chore',
  'docs',
];

/**
 * Response type for count-by-category endpoint
 */
export interface CountByCategoryResponse {
  success: boolean;
  counts?: Record<WorktreeCategory, number>;
  error?: string;
}

/**
 * Count worktrees in a specific category folder
 */
async function countWorktreesInCategory(
  worktreesDir: string,
  category: WorktreeCategory
): Promise<number> {
  const categoryPath = path.join(worktreesDir, category);

  try {
    const entries = await secureFs.readdir(categoryPath, { withFileTypes: true });
    // Count only directories (each worktree is a directory)
    return entries.filter((entry) => entry.isDirectory()).length;
  } catch {
    // Category folder doesn't exist yet - count is 0
    return 0;
  }
}

export function createCountByCategoryHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as {
        projectPath: string;
      };

      if (!projectPath) {
        res.status(400).json({
          success: false,
          error: 'projectPath required',
        });
        return;
      }

      if (!(await isGitRepo(projectPath))) {
        res.status(400).json({
          success: false,
          error: 'Not a git repository',
        });
        return;
      }

      const worktreesDir = path.join(projectPath, '.worktrees');

      // Count worktrees in each category
      const counts = {} as Record<WorktreeCategory, number>;

      for (const category of WORKTREE_CATEGORIES) {
        counts[category] = await countWorktreesInCategory(worktreesDir, category);
      }

      res.json({
        success: true,
        counts,
      });
    } catch (error) {
      logError(error, 'Count worktrees by category failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
