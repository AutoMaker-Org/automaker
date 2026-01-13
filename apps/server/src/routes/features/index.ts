/**
 * Features routes - HTTP API for feature management
 */

import { Router } from 'express';
import { FeatureLoader } from '../../services/feature-loader.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createListHandler } from './routes/list.js';
import { createGetHandler } from './routes/get.js';
import { createCreateHandler } from './routes/create.js';
import { createUpdateHandler } from './routes/update.js';
import { createBulkUpdateHandler } from './routes/bulk-update.js';
import { createBulkDeleteHandler } from './routes/bulk-delete.js';
import { createDeleteHandler } from './routes/delete.js';
import { createAgentOutputHandler, createRawOutputHandler } from './routes/agent-output.js';
import { createGenerateTitleHandler } from './routes/generate-title.js';

export function createFeaturesRoutes(featureLoader: FeatureLoader): Router {
  const router = Router();

  router.post('/list', validatePathParams('projectPath'), createListHandler(featureLoader));
  router.post('/get', validatePathParams('projectPath'), createGetHandler(featureLoader));
  router.post('/create', validatePathParams('projectPath'), createCreateHandler(featureLoader));
  router.post('/update', validatePathParams('projectPath'), createUpdateHandler(featureLoader));
  router.post(
    '/bulk-update',
    validatePathParams('projectPath'),
    createBulkUpdateHandler(featureLoader)
  );
  router.post(
    '/bulk-delete',
    validatePathParams('projectPath'),
    createBulkDeleteHandler(featureLoader)
  );
  router.post('/delete', validatePathParams('projectPath'), createDeleteHandler(featureLoader));
  router.post('/agent-output', createAgentOutputHandler(featureLoader));
  router.post('/raw-output', createRawOutputHandler(featureLoader));
  router.post('/generate-title', createGenerateTitleHandler());

  return router;
}
