/**
 * Features routes - HTTP API for feature management
 */

import { Router } from 'express';
import { FeatureLoader } from '../../services/feature-loader.js';
import type { SettingsService } from '../../services/settings-service.js';
import type { AutoModeServiceCompat } from '../../services/auto-mode/index.js';
import type { EventEmitter } from '../../lib/events.js';
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
import { createExportHandler } from './routes/export.js';
import { createImportHandler, createConflictCheckHandler } from './routes/import.js';

export function createFeaturesRoutes(
  featureLoader: FeatureLoader,
  settingsService?: SettingsService,
  events?: EventEmitter,
  autoModeService?: AutoModeServiceCompat
): Router {
  const router = Router();

  router.post(
    '/list',
    validatePathParams('projectPath'),
    createListHandler(featureLoader, autoModeService)
  );
  router.post('/get', validatePathParams('projectPath'), createGetHandler(featureLoader));
  router.post(
    '/create',
    validatePathParams('projectPath'),
    createCreateHandler(featureLoader, events)
  );
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
  router.post('/generate-title', createGenerateTitleHandler(settingsService));
  router.post('/export', validatePathParams('projectPath'), createExportHandler(featureLoader));
  router.post('/import', validatePathParams('projectPath'), createImportHandler(featureLoader));
  router.post(
    '/check-conflicts',
    validatePathParams('projectPath'),
    createConflictCheckHandler(featureLoader)
  );

  return router;
}
