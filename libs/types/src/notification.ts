/**
 * Notification Types - Types for project-level notification system
 *
 * Notifications alert users when features reach specific statuses
 * or when long-running operations complete.
 */

/**
 * NotificationType - Types of notifications that can be created
 */
export type NotificationType =
  | 'feature_waiting_approval'
  | 'feature_verified'
  | 'spec_regeneration_complete'
  | 'agent_complete';

/**
 * Notification - A single notification entry
 */
export interface Notification {
  /** Unique identifier for the notification */
  id: string;
  /** Type of notification */
  type: NotificationType;
  /** Short title for display */
  title: string;
  /** Longer descriptive message */
  message: string;
  /** ISO timestamp when notification was created */
  createdAt: string;
  /** Whether the notification has been read */
  read: boolean;
  /** Whether the notification has been dismissed */
  dismissed: boolean;
  /** Associated feature ID if applicable */
  featureId?: string;
  /** Project path this notification belongs to */
  projectPath: string;
}

/**
 * NotificationsFile - Structure of the notifications.json file
 */
export interface NotificationsFile {
  /** Version for future migrations */
  version: number;
  /** List of notifications */
  notifications: Notification[];
}

/** Current version of the notifications file schema */
export const NOTIFICATIONS_VERSION = 1;

/** Default notifications file structure */
export const DEFAULT_NOTIFICATIONS_FILE: NotificationsFile = {
  version: NOTIFICATIONS_VERSION,
  notifications: [],
};
