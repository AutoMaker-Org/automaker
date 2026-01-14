/**
 * Prompt Customization Types
 *
 * Defines the structure for customizable AI prompts used throughout the application.
 * Allows users to modify prompts for Auto Mode, Agent Runner, and Backlog Planning.
 */

/**
 * CustomPrompt - A custom prompt with its value and enabled state
 *
 * The value is always preserved even when disabled, so users don't lose their work.
 */
export interface CustomPrompt {
  /** The custom prompt text */
  value: string;

  /** Whether this custom prompt should be used (when false, default is used instead) */
  enabled: boolean;
}

/**
 * AutoModePrompts - Customizable prompts for Auto Mode feature implementation
 *
 * Controls how the AI plans and implements features in autonomous mode.
 */
export interface AutoModePrompts {
  /** Planning mode: Quick outline without approval (lite mode) */
  planningLite?: CustomPrompt;

  /** Planning mode: Quick outline with approval required (lite with approval) */
  planningLiteWithApproval?: CustomPrompt;

  /** Planning mode: Detailed specification with task breakdown (spec mode) */
  planningSpec?: CustomPrompt;

  /** Planning mode: Comprehensive Software Design Document (full SDD mode) */
  planningFull?: CustomPrompt;

  /** Template for building feature implementation prompts */
  featurePromptTemplate?: CustomPrompt;

  /** Template for follow-up prompts when resuming work */
  followUpPromptTemplate?: CustomPrompt;

  /** Template for continuation prompts */
  continuationPromptTemplate?: CustomPrompt;

  /** Template for pipeline step execution prompts */
  pipelineStepPromptTemplate?: CustomPrompt;
}

/**
 * AgentPrompts - Customizable prompts for Agent Runner (chat mode)
 *
 * Controls the AI's behavior in interactive chat sessions.
 */
export interface AgentPrompts {
  /** System prompt defining the agent's role and behavior in chat */
  systemPrompt?: CustomPrompt;
}

/**
 * BacklogPlanPrompts - Customizable prompts for Kanban board planning
 *
 * Controls how the AI modifies the feature backlog via the Plan button.
 */
export interface BacklogPlanPrompts {
  /** System prompt for backlog plan generation (defines output format and rules) */
  systemPrompt?: CustomPrompt;

  /** Template for user prompt (includes current features and user request) */
  userPromptTemplate?: CustomPrompt;
}

/**
 * EnhancementPrompts - Customizable prompts for feature description enhancement
 *
 * Controls how the AI enhances feature titles and descriptions.
 */
export interface EnhancementPrompts {
  /** System prompt for "improve" mode (vague → clear) */
  improveSystemPrompt?: CustomPrompt;

  /** System prompt for "technical" mode (add technical details) */
  technicalSystemPrompt?: CustomPrompt;

  /** System prompt for "simplify" mode (verbose → concise) */
  simplifySystemPrompt?: CustomPrompt;

  /** System prompt for "acceptance" mode (add acceptance criteria) */
  acceptanceSystemPrompt?: CustomPrompt;

  /** System prompt for "ux-reviewer" mode (UX and design perspective) */
  uxReviewerSystemPrompt?: CustomPrompt;
}

/**
 * PromptCustomization - Complete set of customizable prompts
 *
 * All fields are optional. Undefined values fall back to built-in defaults.
 * Stored in GlobalSettings to allow user customization.
 */
export interface PromptCustomization {
  /** Auto Mode prompts (feature implementation) */
  autoMode?: AutoModePrompts;

  /** Agent Runner prompts (interactive chat) */
  agent?: AgentPrompts;

  /** Backlog planning prompts (Plan button) */
  backlogPlan?: BacklogPlanPrompts;

  /** Enhancement prompts (feature description improvement) */
  enhancement?: EnhancementPrompts;
}

/**
 * Default empty prompt customization (all undefined → use built-in defaults)
 */
export const DEFAULT_PROMPT_CUSTOMIZATION: PromptCustomization = {
  autoMode: {},
  agent: {},
  backlogPlan: {},
  enhancement: {},
};

/**
 * Resolved prompt types - all fields are required strings (ready to use)
 * Used for default prompts and merged prompts after resolving custom values
 */
export interface ResolvedAutoModePrompts {
  planningLite: string;
  planningLiteWithApproval: string;
  planningSpec: string;
  planningFull: string;
  featurePromptTemplate: string;
  followUpPromptTemplate: string;
  continuationPromptTemplate: string;
  pipelineStepPromptTemplate: string;
}

export interface ResolvedAgentPrompts {
  systemPrompt: string;
}

export interface ResolvedBacklogPlanPrompts {
  systemPrompt: string;
  userPromptTemplate: string;
}

export interface ResolvedEnhancementPrompts {
  improveSystemPrompt: string;
  technicalSystemPrompt: string;
  simplifySystemPrompt: string;
  acceptanceSystemPrompt: string;
  uxReviewerSystemPrompt: string;
}
