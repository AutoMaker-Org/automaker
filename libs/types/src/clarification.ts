/**
 * Clarification Types - Types for interactive planning mode clarification questions
 *
 * Supports the AskUserQuestion tool flow where AI agents can ask clarification
 * questions during the planning phase before implementation begins.
 */

/**
 * ClarificationOption - A single option for a clarification question
 */
export interface ClarificationOption {
  /** The display text for this option that the user will see and select */
  label: string;
  /** Explanation of what this option means or what will happen if chosen */
  description: string;
}

/**
 * ClarificationQuestion - A single clarification question from the AI agent
 */
export interface ClarificationQuestion {
  /** The complete question to ask the user */
  question: string;
  /** Very short label displayed as a chip/tag (max 12 chars) */
  header: string;
  /** The available choices for this question (2-4 options) */
  options: ClarificationOption[];
  /** Whether multiple options can be selected */
  multiSelect: boolean;
}

/**
 * ClarificationRequest - A request for clarification from the AI agent
 */
export interface ClarificationRequest {
  /** The feature ID this clarification is for */
  featureId: string;
  /** The project path */
  projectPath: string;
  /** The questions being asked (1-4 questions) */
  questions: ClarificationQuestion[];
  /** Unique identifier for this clarification request */
  requestId: string;
  /** ISO timestamp when the request was created */
  timestamp: string;
  /** The tool_use_id from the Claude SDK, used for providing the tool result */
  toolUseId: string;
}

/**
 * ClarificationAnswer - An answer to a clarification question
 */
export interface ClarificationAnswer {
  /** The question header or index this answer corresponds to */
  questionHeader: string;
  /** The selected option label(s) - single string for single-select, array for multi-select */
  selectedOptions: string[];
  /** Custom text input if "Other" was selected */
  customText?: string;
}

/**
 * ClarificationResponse - The user's response to clarification questions
 */
export interface ClarificationResponse {
  /** The feature ID this response is for */
  featureId: string;
  /** The project path */
  projectPath: string;
  /** The request ID this response corresponds to */
  requestId: string;
  /** The answers to the questions */
  answers: Record<string, string>;
  /** ISO timestamp when the response was submitted */
  timestamp: string;
}
