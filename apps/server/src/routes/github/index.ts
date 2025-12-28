/**
 * GitHub routes - HTTP API for GitHub integration
 */

import { Router } from 'express';
import { createCheckGitHubRemoteHandler } from './routes/check-github-remote.js';
import { createListIssuesHandler } from './routes/list-issues.js';
import { createListPRsHandler } from './routes/list-prs.js';
import { PRWatcherService } from '../../services/github-pr-watcher.js';
import { GitHubIssuePollerService } from '../../services/github-issue-poller-service.js';
import {
  createPRCommentHandler,
  createPRCommentStatusHandler,
  createTestWebhookHandler,
} from './routes/pr-comment-handler.js';
import {
  createStartAutoClaimHandler,
  createStopAutoClaimHandler,
  createGetAutoClaimStatusHandler,
} from './routes/auto-claim.js';

interface GitHubRoutesServices {
  prWatcherService?: PRWatcherService;
  pollerService?: GitHubIssuePollerService;
}

export function createGitHubRoutes(services?: GitHubRoutesServices): Router {
  const router = Router();

  router.post('/check-remote', createCheckGitHubRemoteHandler());
  router.post('/issues', createListIssuesHandler());
  router.post('/prs', createListPRsHandler());

  // Webhook endpoints for PR comment monitoring (require prWatcherService)
  if (services?.prWatcherService) {
    router.post('/webhook/pr-comment', createPRCommentHandler(services.prWatcherService));
    router.get(
      '/webhook/pr-comment/status/:commentId',
      createPRCommentStatusHandler(services.prWatcherService)
    );
    router.post('/webhook/test', createTestWebhookHandler());
  }

  // Auto-claim routes (require pollerService)
  if (services?.pollerService) {
    router.post('/auto-claim/start', createStartAutoClaimHandler(services.pollerService));
    router.post('/auto-claim/stop', createStopAutoClaimHandler(services.pollerService));
    router.get('/auto-claim/status', createGetAutoClaimStatusHandler(services.pollerService));
  }

  return router;
}
