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
import { createCheckHandler } from './routes/check.js';
import { createPullHandler } from './routes/pull.js';
import { createInfoHandler } from './routes/info.js';

/**
 * Create an Express Router that exposes API endpoints for update operations.
 *
 * @returns An Express Router with the routes:
 * - GET `/check` — checks for available updates
 * - POST `/pull` — pulls updates from upstream
 * - GET `/info` — returns current installation info
 */
export function createUpdatesRoutes(settingsService: SettingsService): Router {
  const router = Router();

  // GET /api/updates/check - Check if updates are available
  router.get('/check', createCheckHandler(settingsService));

  // POST /api/updates/pull - Pull updates from upstream
  router.post('/pull', createPullHandler(settingsService));

  // GET /api/updates/info - Get current installation info
  router.get('/info', createInfoHandler(settingsService));

  return router;
}