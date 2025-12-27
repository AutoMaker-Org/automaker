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
import type { SettingsService } from '../../services/settings-service.js';

export function createSpecRegenerationRoutes(
  events: EventEmitter,
  settingsService?: SettingsService
): Router {
  const router = Router();

  router.post('/create', createCreateHandler(events));
  router.post('/generate', createGenerateHandler(events, settingsService));
  router.post('/generate-features', createGenerateFeaturesHandler(events, settingsService));
  router.post('/stop', createStopHandler());
  router.get('/status', createStatusHandler());

  return router;
}
