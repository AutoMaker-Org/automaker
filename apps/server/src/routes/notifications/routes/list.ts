/**
 * POST /api/notifications/list - List all notifications for a project
 *
 * Request body: { projectPath: string }
 * Response: { success: true, notifications: Notification[] }
 */

import type { Request, Response } from 'express';
import type { NotificationService } from '../../../services/notification-service.js';
import { getErrorMessage, logError } from '../common.js';

/**
 * Create handler for POST /api/notifications/list
 *
 * @param notificationService - Instance of NotificationService
 * @returns Express request handler
 */
export function createListHandler(notificationService: NotificationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body;

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const notifications = await notificationService.getNotifications(projectPath);

      res.json({
        success: true,
        notifications,
      });
    } catch (error) {
      logError(error, 'List notifications failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
