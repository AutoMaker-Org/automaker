/**
 * Spec Regeneration routes - HTTP API for AI-powered spec generation
 */

import { Router } from 'express';
import type { EventEmitter } from '../../lib/events.js';
import { createCreateHandler } from './routes/create.js';
import { createGenerateHandler } from './routes/generate.js';
import { createGenerateFeaturesHandler } from './routes/generate-features.js';
import { createStopHandler } from './routes/stop.js';
import { createStatusHandler } from './routes/status.js';

export function createSpecRegenerationRoutes(events: EventEmitter): Router {
  const router = Router();

  router.post('/create', createCreateHandler(events));
  router.post('/generate', createGenerateHandler(events));
  router.post('/generate-features', createGenerateFeaturesHandler(events));
  router.post('/stop', createStopHandler());
  router.get('/status', createStatusHandler());

  return router;
}
