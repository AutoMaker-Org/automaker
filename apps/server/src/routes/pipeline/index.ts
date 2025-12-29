/**
 * Pipeline routes - HTTP API for pipeline configuration management
 *
 * Provides endpoints for:
 * - Getting pipeline configuration
 * - Saving pipeline configuration
 * - Adding, updating, deleting, and reordering pipeline steps
 *
 * All endpoints use handler factories that receive the PipelineService instance.
 * Mounted at /api/pipeline in the main server.
 */

import { Router } from 'express';
import type { PipelineService } from '../../services/pipeline-service.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createGetConfigHandler } from './routes/get-config.js';
import { createSaveConfigHandler } from './routes/save-config.js';
import { createAddStepHandler } from './routes/add-step.js';
import { createUpdateStepHandler } from './routes/update-step.js';
import { createDeleteStepHandler } from './routes/delete-step.js';
import { createReorderStepsHandler } from './routes/reorder-steps.js';

/**
 * Create pipeline router with all endpoints
 *
 * Endpoints:
 * - POST /config - Get pipeline configuration
 * - POST /config/save - Save entire pipeline configuration
 * - POST /steps/add - Add a new pipeline step
 * - POST /steps/update - Update an existing pipeline step
 * - POST /steps/delete - Delete a pipeline step
 * - POST /steps/reorder - Reorder pipeline steps
 *
 * @param pipelineService - Instance of PipelineService for file I/O
 * @returns Express Router configured with all pipeline endpoints
 */
export function createPipelineRoutes(pipelineService: PipelineService): Router {
  const router = Router();

  // Get pipeline configuration
  router.post(
    '/config',
    validatePathParams('projectPath'),
    createGetConfigHandler(pipelineService)
  );

  // Save entire pipeline configuration
  router.post(
    '/config/save',
    validatePathParams('projectPath'),
    createSaveConfigHandler(pipelineService)
  );

  // Pipeline step operations
  router.post(
    '/steps/add',
    validatePathParams('projectPath'),
    createAddStepHandler(pipelineService)
  );
  router.post(
    '/steps/update',
    validatePathParams('projectPath'),
    createUpdateStepHandler(pipelineService)
  );
  router.post(
    '/steps/delete',
    validatePathParams('projectPath'),
    createDeleteStepHandler(pipelineService)
  );
  router.post(
    '/steps/reorder',
    validatePathParams('projectPath'),
    createReorderStepsHandler(pipelineService)
  );

  return router;
}
