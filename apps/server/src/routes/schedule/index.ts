/**
 * Schedule routes - API endpoints for crontab schedule management
 *
 * Routes:
 * - POST /validate - Validate a crontab expression and get next run time
 * - GET /presets - Get available schedule presets
 */

import { Router } from 'express';
import { createValidateHandler } from './routes/validate.js';
import { createPresetsHandler } from './routes/presets.js';

export function createScheduleRoutes(): Router {
  const router = Router();

  // Validate crontab expression
  router.post('/validate', createValidateHandler());

  // Get available presets
  router.get('/presets', createPresetsHandler());

  return router;
}
