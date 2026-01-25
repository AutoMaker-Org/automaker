/**
 * Event History Types - Stored event records for debugging and replay
 *
 * Events are stored on disk to allow users to:
 * - View historical events for debugging
 * - Replay events with custom hooks
 * - Test hook configurations against past events
 */

import type { EventHookTrigger } from './settings.js';

/**
 * StoredEvent - A single event record stored on disk
 *
 * Contains all information needed to replay the event or inspect what happened.
 */
export interface StoredEvent {
  /** Unique identifier for this event record */
  id: string;
  /** The hook trigger type this event maps to */
  trigger: EventHookTrigger;
  /** ISO timestamp when the event occurred */
  timestamp: string;
  /** ID of the feature involved (if applicable) */
  featureId?: string;
  /** Name of the feature involved (if applicable) */
  featureName?: string;
  /** Path to the project where the event occurred */
  projectPath: string;
  /** Name of the project (extracted from path) */
  projectName: string;
  /** Error message if this was an error event */
  error?: string;
  /** Error classification if applicable */
  errorType?: string;
  /** Whether the feature passed (for completion events) */
  passes?: boolean;
  /** Additional context/metadata for the event */
  metadata?: Record<string, unknown>;
}

/**
 * StoredEventIndex - Quick lookup index for event history
 *
 * Stored separately for fast listing without loading full event data.
 */
export interface StoredEventIndex {
  /** Version for future migrations */
  version: number;
  /** Array of event summaries for quick listing */
  events: StoredEventSummary[];
}

/**
 * StoredEventSummary - Minimal event info for listing
 */
export interface StoredEventSummary {
  /** Event ID */
  id: string;
  /** Trigger type */
  trigger: EventHookTrigger;
  /** When it occurred */
  timestamp: string;
  /** Feature name for display (if applicable) */
  featureName?: string;
  /** Feature ID (if applicable) */
  featureId?: string;
}

/**
 * EventHistoryFilter - Options for filtering event history
 */
export interface EventHistoryFilter {
  /** Filter by trigger type */
  trigger?: EventHookTrigger;
  /** Filter by feature ID */
  featureId?: string;
  /** Filter events after this timestamp */
  since?: string;
  /** Filter events before this timestamp */
  until?: string;
  /** Maximum number of events to return */
  limit?: number;
  /** Number of events to skip (for pagination) */
  offset?: number;
}

/**
 * EventReplayResult - Result of replaying an event
 */
export interface EventReplayResult {
  /** Event that was replayed */
  eventId: string;
  /** Number of hooks that were triggered */
  hooksTriggered: number;
  /** Results from each hook execution */
  hookResults: EventReplayHookResult[];
}

/**
 * EventReplayHookResult - Result of a single hook execution during replay
 */
export interface EventReplayHookResult {
  /** Hook ID */
  hookId: string;
  /** Hook name (if set) */
  hookName?: string;
  /** Whether the hook executed successfully */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Execution time in milliseconds */
  durationMs: number;
}

/** Current version of the event history index schema */
export const EVENT_HISTORY_VERSION = 1;

/** Default empty event history index */
export const DEFAULT_EVENT_HISTORY_INDEX: StoredEventIndex = {
  version: EVENT_HISTORY_VERSION,
  events: [],
};
