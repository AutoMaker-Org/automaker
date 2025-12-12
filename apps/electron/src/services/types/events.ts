/**
 * Event type definitions for the EventBus
 */

import type { Message } from "@/types/electron";

// Agent stream events
export interface StreamEvent {
  type: "message" | "stream" | "tool_use" | "complete" | "error";
  sessionId: string;
  message?: Message;
  messageId?: string;
  content?: string;
  isComplete?: boolean;
  tool?: {
    name: string;
    input: unknown;
  };
  toolUses?: Array<{
    name: string;
    input: unknown;
  }>;
  error?: string;
}

// Auto mode events
export type AutoModeEventType =
  | "auto_mode_feature_start"
  | "auto_mode_progress"
  | "auto_mode_tool"
  | "auto_mode_feature_complete"
  | "auto_mode_error"
  | "auto_mode_complete"
  | "auto_mode_phase"
  | "auto_mode_ultrathink_preparation";

export interface AutoModeEvent {
  type: AutoModeEventType;
  featureId?: string;
  projectPath?: string;
  content?: string;
  tool?: string;
  input?: unknown;
  passes?: boolean;
  message?: string;
  error?: string;
  phase?: "planning" | "action" | "verification";
  feature?: unknown;
  warnings?: string[];
  recommendations?: string[];
  estimatedCost?: number;
  estimatedTime?: string;
}

// Suggestions events
export interface SuggestionsEvent {
  type:
    | "suggestions_progress"
    | "suggestions_tool"
    | "suggestions_complete"
    | "suggestions_error";
  content?: string;
  tool?: string;
  input?: unknown;
  suggestions?: FeatureSuggestion[];
  error?: string;
}

export interface FeatureSuggestion {
  id: string;
  category: string;
  description: string;
  steps: string[];
  priority: number;
  reasoning: string;
}

// Spec regeneration events
export type SpecRegenerationEvent =
  | { type: "spec_regeneration_progress"; content: string }
  | { type: "spec_regeneration_tool"; tool: string; input: unknown }
  | { type: "spec_regeneration_complete"; message: string }
  | { type: "spec_regeneration_error"; error: string };

// Setup events
export interface InstallProgressEvent {
  cli: "claude" | "codex";
  stage?: string;
  message?: string;
  progress?: number;
}

export interface AuthProgressEvent {
  cli: "claude" | "codex";
  stage?: string;
  message?: string;
}

/**
 * Event map defining all event types and their payloads
 */
export interface EventMap {
  "agent:stream": StreamEvent;
  "auto-mode:event": AutoModeEvent;
  "suggestions:event": SuggestionsEvent;
  "spec-regeneration:event": SpecRegenerationEvent;
  "setup:install-progress": InstallProgressEvent;
  "setup:auth-progress": AuthProgressEvent;
}

export type EventName = keyof EventMap;
