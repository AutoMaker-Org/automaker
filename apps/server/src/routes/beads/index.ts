/**
 * Beads routes - HTTP API for Beads issue tracker integration
 */

import { Router } from 'express';
import { BeadsService } from '../../services/beads-service.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createListHandler } from './routes/list.js';
import { createCreateHandler } from './routes/create.js';
import { createUpdateHandler } from './routes/update.js';
import { createDeleteHandler } from './routes/delete.js';
import { createReadyWorkHandler } from './routes/ready.js';
import { createValidateHandler } from './routes/validate.js';

/**
 * Create an Express Router configured with Beads-related POST endpoints.
 *
 * @param beadsService - Service used by route handlers to perform Beads operations
 * @returns The configured Express Router containing the Beads endpoints (POST /list, /create, /update, /delete, /ready, and /validate)
 */
export function createBeadsRoutes(beadsService: BeadsService): Router {
  const router = Router();

  router.post('/list', validatePathParams('projectPath'), createListHandler(beadsService));
  router.post('/create', validatePathParams('projectPath'), createCreateHandler(beadsService));
  router.post('/update', validatePathParams('projectPath'), createUpdateHandler(beadsService));
  router.post('/delete', validatePathParams('projectPath'), createDeleteHandler(beadsService));
  router.post('/ready', validatePathParams('projectPath'), createReadyWorkHandler(beadsService));
  router.post('/validate', createValidateHandler(beadsService));

  return router;
}
