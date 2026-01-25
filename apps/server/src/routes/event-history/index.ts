/**
 * Event History routes - HTTP API for event history management
 *
 * Provides endpoints for:
 * - Listing events with filtering
 * - Getting individual event details
 * - Deleting events
 * - Clearing all events
 * - Replaying events to test hooks
 *
 * Mounted at /api/event-history in the main server.
 */

import { Router } from 'express';
import type { EventHistoryService } from '../../services/event-history-service.js';
import type { SettingsService } from '../../services/settings-service.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createListHandler } from './routes/list.js';
import { createGetHandler } from './routes/get.js';
import { createDeleteHandler } from './routes/delete.js';
import { createClearHandler } from './routes/clear.js';
import { createReplayHandler } from './routes/replay.js';

/**
 * Create event history router with all endpoints
 *
 * Endpoints:
 * - POST /list - List events with optional filtering
 * - POST /get - Get a single event by ID
 * - POST /delete - Delete an event by ID
 * - POST /clear - Clear all events for a project
 * - POST /replay - Replay an event to trigger hooks
 *
 * @param eventHistoryService - Instance of EventHistoryService
 * @param settingsService - Instance of SettingsService (for replay)
 * @returns Express Router configured with all event history endpoints
 */
export function createEventHistoryRoutes(
  eventHistoryService: EventHistoryService,
  settingsService: SettingsService
): Router {
  const router = Router();

  // List events with filtering
  router.post('/list', validatePathParams('projectPath'), createListHandler(eventHistoryService));

  // Get single event
  router.post('/get', validatePathParams('projectPath'), createGetHandler(eventHistoryService));

  // Delete event
  router.post(
    '/delete',
    validatePathParams('projectPath'),
    createDeleteHandler(eventHistoryService)
  );

  // Clear all events
  router.post('/clear', validatePathParams('projectPath'), createClearHandler(eventHistoryService));

  // Replay event
  router.post(
    '/replay',
    validatePathParams('projectPath'),
    createReplayHandler(eventHistoryService, settingsService)
  );

  return router;
}
