/**
 * POST /pr-review-comments endpoint - Fetch review comments for a GitHub PR
 *
 * Fetches both regular PR comments and inline code review comments
 * for a specific pull request, providing file path and line context.
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from './common.js';
import { checkGitHubRemote } from './check-github-remote.js';
import {
  fetchPRReviewComments,
  fetchReviewThreadResolvedStatus,
  type PRReviewComment,
  type ListPRReviewCommentsResult,
} from '../../../services/pr-review-comments.service.js';

// Re-export types so existing callers continue to work
export type { PRReviewComment, ListPRReviewCommentsResult };
// Re-export service functions so existing callers continue to work
export { fetchPRReviewComments, fetchReviewThreadResolvedStatus };

interface ListPRReviewCommentsRequest {
  projectPath: string;
  prNumber: number;
}

export function createListPRReviewCommentsHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, prNumber } = req.body as ListPRReviewCommentsRequest;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!prNumber || typeof prNumber !== 'number') {
        res
          .status(400)
          .json({ success: false, error: 'prNumber is required and must be a number' });
        return;
      }

      // Check if this is a GitHub repo and get owner/repo
      const remoteStatus = await checkGitHubRemote(projectPath);
      if (!remoteStatus.hasGitHubRemote || !remoteStatus.owner || !remoteStatus.repo) {
        res.status(400).json({
          success: false,
          error: 'Project does not have a GitHub remote',
        });
        return;
      }

      const comments = await fetchPRReviewComments(
        projectPath,
        remoteStatus.owner,
        remoteStatus.repo,
        prNumber
      );

      res.json({
        success: true,
        comments,
        totalCount: comments.length,
      });
    } catch (error) {
      logError(error, 'Fetch PR review comments failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
