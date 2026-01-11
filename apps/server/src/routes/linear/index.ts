/**
 * Linear routes - HTTP API for Linear integration
 */

import { Router } from 'express';
import { LinearService } from '../../services/linear-service.js';
import type { SettingsService } from '../../services/settings-service.js';
import type { FeatureLoader } from '../../services/feature-loader.js';
import { createCheckConnectionHandler } from './routes/connection.js';
import { createListTeamsHandler } from './routes/teams.js';
import { createListProjectsHandler } from './routes/projects.js';
import { createListIssuesHandler } from './routes/issues.js';
import { createGetIssueHandler } from './routes/issue.js';
import { createImportIssuesHandler } from './routes/import.js';

export function createLinearRoutes(
  settingsService: SettingsService,
  featureLoader: FeatureLoader
): Router {
  const router = Router();
  const linearService = new LinearService(settingsService);

  // Connection check
  router.get('/connection', createCheckConnectionHandler(linearService));

  // Teams
  router.get('/teams', createListTeamsHandler(linearService));

  // Projects (requires teamId query param)
  router.get('/projects', createListProjectsHandler(linearService));

  // Issues (POST with filters in body)
  router.post('/issues', createListIssuesHandler(linearService));

  // Single issue
  router.get('/issues/:issueId', createGetIssueHandler(linearService));

  // Import issues to features
  router.post('/import', createImportIssuesHandler(linearService, featureLoader));

  return router;
}
