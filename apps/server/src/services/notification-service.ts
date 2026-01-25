/**
 * Notification Service - Handles reading/writing notifications to JSON files
 *
 * Provides persistent storage for project-level notifications in
 * {projectPath}/.automaker/notifications.json
 *
 * Notifications alert users when:
 * - Features reach specific statuses (waiting_approval, verified)
 * - Long-running operations complete (spec generation)
 */

import { createLogger } from '@automaker/utils';
import * as secureFs from '../lib/secure-fs.js';
import { getNotificationsPath, ensureAutomakerDir } from '@automaker/platform';
import type { Notification, NotificationsFile, NotificationType } from '@automaker/types';
import { DEFAULT_NOTIFICATIONS_FILE } from '@automaker/types';
import type { EventEmitter } from '../lib/events.js';
import { randomUUID } from 'crypto';

const logger = createLogger('NotificationService');

/**
 * Atomic file write - write to temp file then rename
 */
async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  const content = JSON.stringify(data, null, 2);

  try {
    await secureFs.writeFile(tempPath, content, 'utf-8');
    await secureFs.rename(tempPath, filePath);
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await secureFs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Safely read JSON file with fallback to default
 */
async function readJsonFile<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    const content = (await secureFs.readFile(filePath, 'utf-8')) as string;
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return defaultValue;
    }
    logger.error(`Error reading ${filePath}:`, error);
    return defaultValue;
  }
}

/**
 * Input for creating a new notification
 */
export interface CreateNotificationInput {
  type: NotificationType;
  title: string;
  message: string;
  featureId?: string;
  projectPath: string;
}

/**
 * NotificationService - Manages persistent storage of notifications
 *
 * Handles reading and writing notifications to JSON files with atomic operations
 * for reliability. Each project has its own notifications.json file.
 */
export class NotificationService {
  private events: EventEmitter | null = null;

  /**
   * Set the event emitter for broadcasting notification events
   */
  setEventEmitter(events: EventEmitter): void {
    this.events = events;
  }

  /**
   * Get all notifications for a project
   *
   * @param projectPath - Absolute path to project directory
   * @returns Promise resolving to array of notifications
   */
  async getNotifications(projectPath: string): Promise<Notification[]> {
    const notificationsPath = getNotificationsPath(projectPath);
    const file = await readJsonFile<NotificationsFile>(
      notificationsPath,
      DEFAULT_NOTIFICATIONS_FILE
    );
    // Filter out dismissed notifications and sort by date (newest first)
    return file.notifications
      .filter((n) => !n.dismissed)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Get unread notification count for a project
   *
   * @param projectPath - Absolute path to project directory
   * @returns Promise resolving to unread count
   */
  async getUnreadCount(projectPath: string): Promise<number> {
    const notifications = await this.getNotifications(projectPath);
    return notifications.filter((n) => !n.read).length;
  }

  /**
   * Create a new notification
   *
   * @param input - Notification creation input
   * @returns Promise resolving to the created notification
   */
  async createNotification(input: CreateNotificationInput): Promise<Notification> {
    const { projectPath, type, title, message, featureId } = input;

    // Ensure automaker directory exists
    await ensureAutomakerDir(projectPath);

    const notificationsPath = getNotificationsPath(projectPath);
    const file = await readJsonFile<NotificationsFile>(
      notificationsPath,
      DEFAULT_NOTIFICATIONS_FILE
    );

    const notification: Notification = {
      id: randomUUID(),
      type,
      title,
      message,
      createdAt: new Date().toISOString(),
      read: false,
      dismissed: false,
      featureId,
      projectPath,
    };

    file.notifications.push(notification);
    await atomicWriteJson(notificationsPath, file);

    logger.info(`Created notification: ${title} for project ${projectPath}`);

    // Emit event for real-time updates
    if (this.events) {
      this.events.emit('notification:created', notification);
    }

    return notification;
  }

  /**
   * Mark a notification as read
   *
   * @param projectPath - Absolute path to project directory
   * @param notificationId - ID of the notification to mark as read
   * @returns Promise resolving to the updated notification or null if not found
   */
  async markAsRead(projectPath: string, notificationId: string): Promise<Notification | null> {
    const notificationsPath = getNotificationsPath(projectPath);
    const file = await readJsonFile<NotificationsFile>(
      notificationsPath,
      DEFAULT_NOTIFICATIONS_FILE
    );

    const notification = file.notifications.find((n) => n.id === notificationId);
    if (!notification) {
      return null;
    }

    notification.read = true;
    await atomicWriteJson(notificationsPath, file);

    logger.info(`Marked notification ${notificationId} as read`);
    return notification;
  }

  /**
   * Mark all notifications as read for a project
   *
   * @param projectPath - Absolute path to project directory
   * @returns Promise resolving to number of notifications marked as read
   */
  async markAllAsRead(projectPath: string): Promise<number> {
    const notificationsPath = getNotificationsPath(projectPath);
    const file = await readJsonFile<NotificationsFile>(
      notificationsPath,
      DEFAULT_NOTIFICATIONS_FILE
    );

    let count = 0;
    for (const notification of file.notifications) {
      if (!notification.read && !notification.dismissed) {
        notification.read = true;
        count++;
      }
    }

    if (count > 0) {
      await atomicWriteJson(notificationsPath, file);
      logger.info(`Marked ${count} notifications as read`);
    }

    return count;
  }

  /**
   * Dismiss a notification
   *
   * @param projectPath - Absolute path to project directory
   * @param notificationId - ID of the notification to dismiss
   * @returns Promise resolving to true if notification was dismissed
   */
  async dismissNotification(projectPath: string, notificationId: string): Promise<boolean> {
    const notificationsPath = getNotificationsPath(projectPath);
    const file = await readJsonFile<NotificationsFile>(
      notificationsPath,
      DEFAULT_NOTIFICATIONS_FILE
    );

    const notification = file.notifications.find((n) => n.id === notificationId);
    if (!notification) {
      return false;
    }

    notification.dismissed = true;
    await atomicWriteJson(notificationsPath, file);

    logger.info(`Dismissed notification ${notificationId}`);
    return true;
  }

  /**
   * Dismiss all notifications for a project
   *
   * @param projectPath - Absolute path to project directory
   * @returns Promise resolving to number of notifications dismissed
   */
  async dismissAll(projectPath: string): Promise<number> {
    const notificationsPath = getNotificationsPath(projectPath);
    const file = await readJsonFile<NotificationsFile>(
      notificationsPath,
      DEFAULT_NOTIFICATIONS_FILE
    );

    let count = 0;
    for (const notification of file.notifications) {
      if (!notification.dismissed) {
        notification.dismissed = true;
        count++;
      }
    }

    if (count > 0) {
      await atomicWriteJson(notificationsPath, file);
      logger.info(`Dismissed ${count} notifications`);
    }

    return count;
  }
}

// Singleton instance
let notificationServiceInstance: NotificationService | null = null;

/**
 * Get the singleton notification service instance
 */
export function getNotificationService(): NotificationService {
  if (!notificationServiceInstance) {
    notificationServiceInstance = new NotificationService();
  }
  return notificationServiceInstance;
}
