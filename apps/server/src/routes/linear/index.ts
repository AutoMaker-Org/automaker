/**
 * Linear routes - HTTP API for Linear integration
 */

import { Router } from 'express';
import type { EventEmitter } from '../../lib/events.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { LinearService } from '../../services/linear-service.js';
import type { SettingsService } from '../../services/settings-service.js';
import type { FeatureLoader } from '../../services/feature-loader.js';
import { createCheckConnectionHandler } from './routes/connection.js';
import { createListTeamsHandler } from './routes/teams.js';
import { createListProjectsHandler } from './routes/projects.js';
import { createListIssuesHandler } from './routes/issues.js';
import { createGetIssueHandler } from './routes/issue.js';
import { createImportIssuesHandler } from './routes/import.js';
import { createValidateLinearIssueHandler } from './routes/validate-issue.js';
import {
  createLinearValidationStatusHandler,
  createLinearValidationStopHandler,
  createGetLinearValidationsHandler,
  createDeleteLinearValidationHandler,
  createLinearMarkViewedHandler,
} from './routes/validation-endpoints.js';

export function createLinearRoutes(
  settingsService: SettingsService,
  featureLoader: FeatureLoader,
  events: EventEmitter
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

  // Issue validation
  router.post(
    '/validate-issue',
    validatePathParams('projectPath'),
    createValidateLinearIssueHandler(events, settingsService)
  );

  // Validation management endpoints
  router.post(
    '/validation-status',
    validatePathParams('projectPath'),
    createLinearValidationStatusHandler()
  );
  router.post(
    '/validation-stop',
    validatePathParams('projectPath'),
    createLinearValidationStopHandler()
  );
  router.post(
    '/validations',
    validatePathParams('projectPath'),
    createGetLinearValidationsHandler()
  );
  router.post(
    '/validation-delete',
    validatePathParams('projectPath'),
    createDeleteLinearValidationHandler()
  );
  router.post(
    '/validation-mark-viewed',
    validatePathParams('projectPath'),
    createLinearMarkViewedHandler(events)
  );

  return router;
}
