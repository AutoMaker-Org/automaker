/**
 * POST /api/notifications/dismiss - Dismiss notification(s)
 *
 * Request body: { projectPath: string, notificationId?: string }
 * - If notificationId provided: dismisses that notification
 * - If notificationId not provided: dismisses all notifications
 *
 * Response: { success: true, dismissed: boolean | count: number }
 */

import type { Request, Response } from 'express';
import type { NotificationService } from '../../../services/notification-service.js';
import { getErrorMessage, logError } from '../common.js';

/**
 * Create handler for POST /api/notifications/dismiss
 *
 * @param notificationService - Instance of NotificationService
 * @returns Express request handler
 */
export function createDismissHandler(notificationService: NotificationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, notificationId } = req.body;

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      // If notificationId provided, dismiss single notification
      if (notificationId) {
        const dismissed = await notificationService.dismissNotification(
          projectPath,
          notificationId
        );
        if (!dismissed) {
          res.status(404).json({ success: false, error: 'Notification not found' });
          return;
        }
        res.json({ success: true, dismissed: true });
        return;
      }

      // Otherwise dismiss all
      const count = await notificationService.dismissAll(projectPath);
      res.json({ success: true, count });
    } catch (error) {
      logError(error, 'Dismiss failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
