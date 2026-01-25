/**
 * POST /api/notifications/unread-count - Get unread notification count
 *
 * Request body: { projectPath: string }
 * Response: { success: true, count: number }
 */

import type { Request, Response } from 'express';
import type { NotificationService } from '../../../services/notification-service.js';
import { getErrorMessage, logError } from '../common.js';

/**
 * Create handler for POST /api/notifications/unread-count
 *
 * @param notificationService - Instance of NotificationService
 * @returns Express request handler
 */
export function createUnreadCountHandler(notificationService: NotificationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body;

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const count = await notificationService.getUnreadCount(projectPath);

      res.json({
        success: true,
        count,
      });
    } catch (error) {
      logError(error, 'Get unread count failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
