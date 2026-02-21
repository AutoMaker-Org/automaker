/**
 * POST /resolve-pr-comment endpoint - Resolve or unresolve a GitHub PR review thread
 *
 * Uses the GitHub GraphQL API to resolve or unresolve a review thread
 * identified by its GraphQL node ID (threadId).
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from './common.js';
import { checkGitHubRemote } from './check-github-remote.js';
import { executeReviewThreadMutation } from '../../../services/github-pr-comment.service.js';

export interface ResolvePRCommentResult {
  success: boolean;
  isResolved?: boolean;
  error?: string;
}

interface ResolvePRCommentRequest {
  projectPath: string;
  threadId: string;
  resolve: boolean;
}

export function createResolvePRCommentHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, threadId, resolve } = req.body as ResolvePRCommentRequest;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!threadId) {
        res.status(400).json({ success: false, error: 'threadId is required' });
        return;
      }

      if (typeof resolve !== 'boolean') {
        res.status(400).json({ success: false, error: 'resolve must be a boolean' });
        return;
      }

      // Check if this is a GitHub repo
      const remoteStatus = await checkGitHubRemote(projectPath);
      if (!remoteStatus.hasGitHubRemote) {
        res.status(400).json({
          success: false,
          error: 'Project does not have a GitHub remote',
        });
        return;
      }

      const result = await executeReviewThreadMutation(projectPath, threadId, resolve);

      res.json({
        success: true,
        isResolved: result.isResolved,
      });
    } catch (error) {
      logError(error, 'Resolve PR comment failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
