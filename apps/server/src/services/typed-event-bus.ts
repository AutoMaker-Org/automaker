/**
 * TypedEventBus - Type-safe event emission wrapper for AutoModeService
 *
 * This class wraps the existing EventEmitter to provide type-safe event emission,
 * specifically encapsulating the `emitAutoModeEvent` pattern used throughout AutoModeService.
 *
 * Key behavior:
 * - emitAutoModeEvent wraps events in 'auto-mode:event' format for frontend consumption
 * - Preserves all existing event emission patterns for backward compatibility
 * - Frontend receives events in the exact same format as before (no breaking changes)
 */

import type { EventEmitter, EventType, EventCallback } from '../lib/events.js';

/**
 * Auto-mode event types that can be emitted through the TypedEventBus.
 * These correspond to the event types expected by the frontend.
 */
export type AutoModeEventType =
  | 'auto_mode_started'
  | 'auto_mode_stopped'
  | 'auto_mode_idle'
  | 'auto_mode_error'
  | 'auto_mode_paused_failures'
  | 'auto_mode_feature_start'
  | 'auto_mode_feature_complete'
  | 'auto_mode_feature_resuming'
  | 'auto_mode_progress'
  | 'auto_mode_tool'
  | 'auto_mode_task_started'
  | 'auto_mode_task_complete'
  | 'auto_mode_task_status'
  | 'auto_mode_phase_complete'
  | 'auto_mode_summary'
  | 'auto_mode_resuming_features'
  | 'planning_started'
  | 'plan_approval_required'
  | 'plan_approved'
  | 'plan_auto_approved'
  | 'plan_rejected'
  | 'plan_revision_requested'
  | 'plan_revision_warning'
  | 'pipeline_step_started'
  | 'pipeline_step_complete'
  | string; // Allow other strings for extensibility

/**
 * TypedEventBus wraps an EventEmitter to provide type-safe event emission
 * with the auto-mode event wrapping pattern.
 */
export class TypedEventBus {
  private events: EventEmitter;

  /**
   * Create a TypedEventBus wrapping an existing EventEmitter.
   * @param events - The underlying EventEmitter to wrap
   */
  constructor(events: EventEmitter) {
    this.events = events;
  }

  /**
   * Emit a raw event directly to subscribers.
   * Use this for non-auto-mode events that don't need wrapping.
   * @param type - The event type
   * @param payload - The event payload
   */
  emit(type: EventType, payload: unknown): void {
    this.events.emit(type, payload);
  }

  /**
   * Emit an auto-mode event wrapped in the correct format for the client.
   * All auto-mode events are sent as type "auto-mode:event" with the actual
   * event type and data in the payload.
   *
   * This produces the exact same event format that the frontend expects:
   * { type: eventType, ...data }
   *
   * @param eventType - The auto-mode event type (e.g., 'auto_mode_started')
   * @param data - Additional data to include in the event payload
   */
  emitAutoModeEvent(eventType: AutoModeEventType, data: Record<string, unknown>): void {
    // Wrap the event in auto-mode:event format expected by the client
    this.events.emit('auto-mode:event', {
      type: eventType,
      ...data,
    });
  }

  /**
   * Subscribe to all events from the underlying emitter.
   * @param callback - Function called with (type, payload) for each event
   * @returns Unsubscribe function
   */
  subscribe(callback: EventCallback): () => void {
    return this.events.subscribe(callback);
  }

  /**
   * Get the underlying EventEmitter for cases where direct access is needed.
   * Use sparingly - prefer the typed methods when possible.
   * @returns The wrapped EventEmitter
   */
  getUnderlyingEmitter(): EventEmitter {
    return this.events;
  }
}
