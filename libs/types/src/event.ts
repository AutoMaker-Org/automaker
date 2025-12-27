/**
 * Event types for AutoMaker event system
 */

export type EventType =
  | 'agent:stream'
  | 'auto-mode:event'
  | 'auto-mode:started'
  | 'auto-mode:stopped'
  | 'auto-mode:idle'
  | 'auto-mode:error'
  | 'feature:started'
  | 'feature:completed'
  | 'feature:stopped'
  | 'feature:error'
  | 'feature:progress'
  | 'feature:tool-use'
  | 'feature:follow-up-started'
  | 'feature:follow-up-completed'
  | 'feature:verified'
  | 'feature:committed'
  | 'project:analysis-started'
  | 'project:analysis-progress'
  | 'project:analysis-completed'
  | 'project:analysis-error'
  | 'suggestions:event'
  | 'spec-regeneration:event'
  | 'merge-gatekeeper:monitoring-started'
  | 'merge-gatekeeper:monitoring-stopped'
  | 'merge-gatekeeper:ready-for-merge'
  | 'merge-gatekeeper:progress'
  | 'merge-gatekeeper:merged'
  | 'merge-gatekeeper:rejected'
  | 'merge-gatekeeper:error'
  | 'merge-gatekeeper:kanban-task-update';

export type EventCallback = (type: EventType, payload: unknown) => void;
