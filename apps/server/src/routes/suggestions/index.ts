/**
 * Suggestions routes - HTTP API for AI-powered feature suggestions
 */

import { Router } from 'express';
import type { EventEmitter } from '../../lib/events.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createGenerateHandler } from './routes/generate.js';
import { createStopHandler } from './routes/stop.js';
import { createStatusHandler } from './routes/status.js';
import type { SettingsService } from '../../services/settings-service.js';

export function createSuggestionsRoutes(
  events: EventEmitter,
  settingsService?: SettingsService
): Router {
  const router = Router();

  router.post(
    '/generate',
    validatePathParams('projectPath'),
    createGenerateHandler(events, settingsService)
  );
  router.post('/stop', createStopHandler());
  router.get('/status', createStatusHandler());

  return router;
}
