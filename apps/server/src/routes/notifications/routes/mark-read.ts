/**
 * POST /api/notifications/mark-read - Mark notification(s) as read
 *
 * Request body: { projectPath: string, notificationId?: string }
 * - If notificationId provided: marks that notification as read
 * - If notificationId not provided: marks all notifications as read
 *
 * Response: { success: true, count?: number, notification?: Notification }
 */

import type { Request, Response } from 'express';
import type { NotificationService } from '../../../services/notification-service.js';
import { getErrorMessage, logError } from '../common.js';

/**
 * Create handler for POST /api/notifications/mark-read
 *
 * @param notificationService - Instance of NotificationService
 * @returns Express request handler
 */
export function createMarkReadHandler(notificationService: NotificationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, notificationId } = req.body;

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      // If notificationId provided, mark single notification
      if (notificationId) {
        const notification = await notificationService.markAsRead(projectPath, notificationId);
        if (!notification) {
          res.status(404).json({ success: false, error: 'Notification not found' });
          return;
        }
        res.json({ success: true, notification });
        return;
      }

      // Otherwise mark all as read
      const count = await notificationService.markAllAsRead(projectPath);
      res.json({ success: true, count });
    } catch (error) {
      logError(error, 'Mark read failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
