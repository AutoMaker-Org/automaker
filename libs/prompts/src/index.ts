/**
 * @automaker/prompts
 * AI prompt templates for AutoMaker
 */

// Enhancement prompts
export {
  IMPROVE_SYSTEM_PROMPT,
  TECHNICAL_SYSTEM_PROMPT,
  SIMPLIFY_SYSTEM_PROMPT,
  ACCEPTANCE_SYSTEM_PROMPT,
  IMPROVE_EXAMPLES,
  TECHNICAL_EXAMPLES,
  SIMPLIFY_EXAMPLES,
  ACCEPTANCE_EXAMPLES,
  getEnhancementPrompt,
  getSystemPrompt,
  getExamples,
  buildUserPrompt,
  isValidEnhancementMode,
  getAvailableEnhancementModes,
} from './enhancement.js';

// Re-export types from @automaker/types
export type { EnhancementMode, EnhancementExample } from '@automaker/types';

// Default prompts
export {
  DEFAULT_AUTO_MODE_PLANNING_LITE,
  DEFAULT_AUTO_MODE_PLANNING_LITE_WITH_APPROVAL,
  DEFAULT_AUTO_MODE_PLANNING_SPEC,
  DEFAULT_AUTO_MODE_PLANNING_FULL,
  DEFAULT_AUTO_MODE_FEATURE_PROMPT_TEMPLATE,
  DEFAULT_AUTO_MODE_FOLLOW_UP_PROMPT_TEMPLATE,
  DEFAULT_AUTO_MODE_CONTINUATION_PROMPT_TEMPLATE,
  DEFAULT_AUTO_MODE_PIPELINE_STEP_PROMPT_TEMPLATE,
  DEFAULT_AUTO_MODE_PROMPTS,
  DEFAULT_AGENT_SYSTEM_PROMPT,
  DEFAULT_AGENT_PROMPTS,
  DEFAULT_BACKLOG_PLAN_SYSTEM_PROMPT,
  DEFAULT_BACKLOG_PLAN_USER_PROMPT_TEMPLATE,
  DEFAULT_BACKLOG_PLAN_PROMPTS,
  DEFAULT_ENHANCEMENT_PROMPTS,
  DEFAULT_PROMPTS,
} from './defaults.js';

// Prompt merging utilities
export {
  mergeAutoModePrompts,
  mergeAgentPrompts,
  mergeBacklogPlanPrompts,
  mergeEnhancementPrompts,
  mergeAllPrompts,
} from './merge.js';

// Re-export resolved prompt types from @automaker/types
export type {
  ResolvedAutoModePrompts,
  ResolvedAgentPrompts,
  ResolvedBacklogPlanPrompts,
  ResolvedEnhancementPrompts,
} from '@automaker/types';
