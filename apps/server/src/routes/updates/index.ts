/**
 * Update routes - HTTP API for checking and applying updates
 *
 * Provides endpoints for:
 * - Checking if updates are available from upstream
 * - Pulling updates from upstream
 * - Getting current installation info
 */

import { Router } from 'express';
import type { SettingsService } from '../../services/settings-service.js';
import type { EventEmitter } from '../../lib/events.js';
import { createCheckHandler } from './routes/check.js';
import { createPullHandler } from './routes/pull.js';
import { createInfoHandler } from './routes/info.js';

export function createUpdatesRoutes(
  settingsService: SettingsService,
  events: EventEmitter
): Router {
  const router = Router();

  // GET /api/updates/check - Check if updates are available
  router.get('/check', createCheckHandler(settingsService));

  // POST /api/updates/pull - Pull updates from upstream (events for progress streaming)
  router.post('/pull', createPullHandler(settingsService, events));

  // GET /api/updates/info - Get current installation info
  router.get('/info', createInfoHandler(settingsService));

  return router;
}
