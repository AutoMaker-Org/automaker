/**
 * Middleware for worktree route validation
 */

import type { Request, Response, NextFunction } from 'express';
import { isGitRepo, hasCommits } from './common.js';

interface ValidationOptions {
  /** Check if the path is a git repository (default: true) */
  requireGitRepo?: boolean;
  /** Check if the repository has at least one commit (default: true) */
  requireCommits?: boolean;
  /** The name of the request body field containing the path (default: 'worktreePath') */
  pathField?: 'worktreePath' | 'projectPath';
}

/**
 * Middleware factory to validate that a path is a valid git repository with commits.
 * This reduces code duplication across route handlers.
 *
 * @param options - Validation options
 * @returns Express middleware function
 */
export function requireValidGitRepo(options: ValidationOptions = {}) {
  const { requireGitRepo = true, requireCommits = true, pathField = 'worktreePath' } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const repoPath = req.body[pathField] as string | undefined;

    if (!repoPath) {
      // Let the route handler deal with missing path validation
      next();
      return;
    }

    if (requireGitRepo && !(await isGitRepo(repoPath))) {
      res.status(400).json({
        success: false,
        error: 'Not a git repository',
        code: 'NOT_GIT_REPO',
      });
      return;
    }

    if (requireCommits && !(await hasCommits(repoPath))) {
      res.status(400).json({
        success: false,
        error: 'Repository has no commits yet',
        code: 'NO_COMMITS',
      });
      return;
    }

    next();
  };
}

/**
 * Middleware to validate git repo for worktreePath field
 */
export const requireValidWorktree = requireValidGitRepo({ pathField: 'worktreePath' });

/**
 * Middleware to validate git repo for projectPath field
 */
export const requireValidProject = requireValidGitRepo({ pathField: 'projectPath' });

/**
 * Middleware to validate git repo without requiring commits (for commit route)
 */
export const requireGitRepoOnly = requireValidGitRepo({
  pathField: 'worktreePath',
  requireCommits: false,
});
