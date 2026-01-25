/**
 * Event History Service - Stores and retrieves event records for debugging and replay
 *
 * Provides persistent storage for events in {projectPath}/.automaker/events/
 * Each event is stored as a separate JSON file with an index for quick listing.
 *
 * Features:
 * - Store events when they occur
 * - List and filter historical events
 * - Replay events to test hook configurations
 * - Delete old events to manage disk space
 */

import { createLogger } from '@automaker/utils';
import * as secureFs from '../lib/secure-fs.js';
import {
  getEventHistoryDir,
  getEventHistoryIndexPath,
  getEventPath,
  ensureEventHistoryDir,
} from '@automaker/platform';
import type {
  StoredEvent,
  StoredEventIndex,
  StoredEventSummary,
  EventHistoryFilter,
  EventHookTrigger,
} from '@automaker/types';
import { DEFAULT_EVENT_HISTORY_INDEX } from '@automaker/types';
import { randomUUID } from 'crypto';

const logger = createLogger('EventHistoryService');

/** Maximum events to keep in the index (oldest are pruned) */
const MAX_EVENTS_IN_INDEX = 1000;

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
 * Input for storing a new event
 */
export interface StoreEventInput {
  trigger: EventHookTrigger;
  projectPath: string;
  featureId?: string;
  featureName?: string;
  error?: string;
  errorType?: string;
  passes?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * EventHistoryService - Manages persistent storage of events
 */
export class EventHistoryService {
  /**
   * Store a new event to history
   *
   * @param input - Event data to store
   * @returns Promise resolving to the stored event
   */
  async storeEvent(input: StoreEventInput): Promise<StoredEvent> {
    const { projectPath, trigger, featureId, featureName, error, errorType, passes, metadata } =
      input;

    // Ensure events directory exists
    await ensureEventHistoryDir(projectPath);

    const eventId = `evt-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const timestamp = new Date().toISOString();
    const projectName = this.extractProjectName(projectPath);

    const event: StoredEvent = {
      id: eventId,
      trigger,
      timestamp,
      projectPath,
      projectName,
      featureId,
      featureName,
      error,
      errorType,
      passes,
      metadata,
    };

    // Write the full event to its own file
    const eventPath = getEventPath(projectPath, eventId);
    await atomicWriteJson(eventPath, event);

    // Update the index
    await this.addToIndex(projectPath, event);

    logger.info(`Stored event ${eventId} (${trigger}) for project ${projectName}`);

    return event;
  }

  /**
   * Get all events for a project with optional filtering
   *
   * @param projectPath - Absolute path to project directory
   * @param filter - Optional filter criteria
   * @returns Promise resolving to array of event summaries
   */
  async getEvents(projectPath: string, filter?: EventHistoryFilter): Promise<StoredEventSummary[]> {
    const indexPath = getEventHistoryIndexPath(projectPath);
    const index = await readJsonFile<StoredEventIndex>(indexPath, DEFAULT_EVENT_HISTORY_INDEX);

    let events = [...index.events];

    // Apply filters
    if (filter) {
      if (filter.trigger) {
        events = events.filter((e) => e.trigger === filter.trigger);
      }
      if (filter.featureId) {
        events = events.filter((e) => e.featureId === filter.featureId);
      }
      if (filter.since) {
        const sinceDate = new Date(filter.since).getTime();
        events = events.filter((e) => new Date(e.timestamp).getTime() >= sinceDate);
      }
      if (filter.until) {
        const untilDate = new Date(filter.until).getTime();
        events = events.filter((e) => new Date(e.timestamp).getTime() <= untilDate);
      }
    }

    // Sort by timestamp (newest first)
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply pagination
    if (filter?.offset) {
      events = events.slice(filter.offset);
    }
    if (filter?.limit) {
      events = events.slice(0, filter.limit);
    }

    return events;
  }

  /**
   * Get a single event by ID
   *
   * @param projectPath - Absolute path to project directory
   * @param eventId - Event identifier
   * @returns Promise resolving to the full event or null if not found
   */
  async getEvent(projectPath: string, eventId: string): Promise<StoredEvent | null> {
    const eventPath = getEventPath(projectPath, eventId);
    try {
      const content = (await secureFs.readFile(eventPath, 'utf-8')) as string;
      return JSON.parse(content) as StoredEvent;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      logger.error(`Error reading event ${eventId}:`, error);
      return null;
    }
  }

  /**
   * Delete an event by ID
   *
   * @param projectPath - Absolute path to project directory
   * @param eventId - Event identifier
   * @returns Promise resolving to true if deleted
   */
  async deleteEvent(projectPath: string, eventId: string): Promise<boolean> {
    // Remove from index
    const indexPath = getEventHistoryIndexPath(projectPath);
    const index = await readJsonFile<StoredEventIndex>(indexPath, DEFAULT_EVENT_HISTORY_INDEX);

    const initialLength = index.events.length;
    index.events = index.events.filter((e) => e.id !== eventId);

    if (index.events.length === initialLength) {
      return false; // Event not found in index
    }

    await atomicWriteJson(indexPath, index);

    // Delete the event file
    const eventPath = getEventPath(projectPath, eventId);
    try {
      await secureFs.unlink(eventPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error(`Error deleting event file ${eventId}:`, error);
      }
    }

    logger.info(`Deleted event ${eventId}`);
    return true;
  }

  /**
   * Clear all events for a project
   *
   * @param projectPath - Absolute path to project directory
   * @returns Promise resolving to number of events cleared
   */
  async clearEvents(projectPath: string): Promise<number> {
    const indexPath = getEventHistoryIndexPath(projectPath);
    const index = await readJsonFile<StoredEventIndex>(indexPath, DEFAULT_EVENT_HISTORY_INDEX);

    const count = index.events.length;

    // Delete all event files
    for (const event of index.events) {
      const eventPath = getEventPath(projectPath, event.id);
      try {
        await secureFs.unlink(eventPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          logger.error(`Error deleting event file ${event.id}:`, error);
        }
      }
    }

    // Reset the index
    await atomicWriteJson(indexPath, DEFAULT_EVENT_HISTORY_INDEX);

    logger.info(`Cleared ${count} events for project`);
    return count;
  }

  /**
   * Get event count for a project
   *
   * @param projectPath - Absolute path to project directory
   * @param filter - Optional filter criteria
   * @returns Promise resolving to event count
   */
  async getEventCount(projectPath: string, filter?: EventHistoryFilter): Promise<number> {
    const events = await this.getEvents(projectPath, {
      ...filter,
      limit: undefined,
      offset: undefined,
    });
    return events.length;
  }

  /**
   * Add an event to the index (internal)
   */
  private async addToIndex(projectPath: string, event: StoredEvent): Promise<void> {
    const indexPath = getEventHistoryIndexPath(projectPath);
    const index = await readJsonFile<StoredEventIndex>(indexPath, DEFAULT_EVENT_HISTORY_INDEX);

    const summary: StoredEventSummary = {
      id: event.id,
      trigger: event.trigger,
      timestamp: event.timestamp,
      featureName: event.featureName,
      featureId: event.featureId,
    };

    // Add to beginning (newest first)
    index.events.unshift(summary);

    // Prune old events if over limit
    if (index.events.length > MAX_EVENTS_IN_INDEX) {
      const removed = index.events.splice(MAX_EVENTS_IN_INDEX);
      // Delete the pruned event files
      for (const oldEvent of removed) {
        const eventPath = getEventPath(projectPath, oldEvent.id);
        try {
          await secureFs.unlink(eventPath);
        } catch {
          // Ignore deletion errors for pruned events
        }
      }
      logger.info(`Pruned ${removed.length} old events from history`);
    }

    await atomicWriteJson(indexPath, index);
  }

  /**
   * Extract project name from path
   */
  private extractProjectName(projectPath: string): string {
    const parts = projectPath.split(/[/\\]/);
    return parts[parts.length - 1] || projectPath;
  }
}

// Singleton instance
let eventHistoryServiceInstance: EventHistoryService | null = null;

/**
 * Get the singleton event history service instance
 */
export function getEventHistoryService(): EventHistoryService {
  if (!eventHistoryServiceInstance) {
    eventHistoryServiceInstance = new EventHistoryService();
  }
  return eventHistoryServiceInstance;
}
