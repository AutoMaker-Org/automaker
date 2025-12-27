/**
 * GitHub routes - HTTP API for GitHub integration
 */

import { Router } from 'express';
import { createCheckGitHubRemoteHandler } from './routes/check-github-remote.js';
import { createListIssuesHandler } from './routes/list-issues.js';
import { createListPRsHandler } from './routes/list-prs.js';
import mergeRequestRouter from './routes/merge-request.js';

export function createGitHubRoutes(): Router {
  const router = Router();

  router.post('/check-remote', createCheckGitHubRemoteHandler());
  router.post('/issues', createListIssuesHandler());
  router.post('/prs', createListPRsHandler());

  // Merge Gatekeeper routes
  router.use('/merge-request', mergeRequestRouter);

  return router;
}
