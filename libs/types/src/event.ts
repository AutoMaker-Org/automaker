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
  | 'github-poller:started'
  | 'github-poller:stopped'
  | 'github-poller:poll-complete'
  | 'github-poller:poll-error'
  | 'github-poller:issue-claimed'
  // Orchestrator events
  | 'orchestrator:started'
  | 'orchestrator:stopped'
  | 'orchestrator:poll'
  | 'orchestrator:error'
  | 'orchestrator:research-started'
  | 'orchestrator:research-completed'
  | 'orchestrator:task-created'
  | 'orchestrator:task-updated'
  | 'orchestrator:state-changed'
  | 'orchestrator:invalid-transition'
  | 'orchestrator:validation-failed'
  | 'orchestrator:pr-created'
  | 'orchestrator:pr-comment-analysis'
  | 'orchestrator:phase-changed';

export type EventCallback = (type: EventType, payload: unknown) => void;
