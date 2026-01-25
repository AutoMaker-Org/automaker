/**
 * Notifications routes - HTTP API for project-level notifications
 *
 * Provides endpoints for:
 * - Listing notifications
 * - Getting unread count
 * - Marking notifications as read
 * - Dismissing notifications
 *
 * All endpoints use handler factories that receive the NotificationService instance.
 * Mounted at /api/notifications in the main server.
 */

import { Router } from 'express';
import type { NotificationService } from '../../services/notification-service.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createListHandler } from './routes/list.js';
import { createUnreadCountHandler } from './routes/unread-count.js';
import { createMarkReadHandler } from './routes/mark-read.js';
import { createDismissHandler } from './routes/dismiss.js';

/**
 * Create notifications router with all endpoints
 *
 * Endpoints:
 * - POST /list - List all notifications for a project
 * - POST /unread-count - Get unread notification count
 * - POST /mark-read - Mark notification(s) as read
 * - POST /dismiss - Dismiss notification(s)
 *
 * @param notificationService - Instance of NotificationService
 * @returns Express Router configured with all notification endpoints
 */
export function createNotificationsRoutes(notificationService: NotificationService): Router {
  const router = Router();

  // List notifications
  router.post('/list', validatePathParams('projectPath'), createListHandler(notificationService));

  // Get unread count
  router.post(
    '/unread-count',
    validatePathParams('projectPath'),
    createUnreadCountHandler(notificationService)
  );

  // Mark as read (single or all)
  router.post(
    '/mark-read',
    validatePathParams('projectPath'),
    createMarkReadHandler(notificationService)
  );

  // Dismiss (single or all)
  router.post(
    '/dismiss',
    validatePathParams('projectPath'),
    createDismissHandler(notificationService)
  );

  return router;
}
