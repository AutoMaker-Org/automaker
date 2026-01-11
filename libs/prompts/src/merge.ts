/**
 * Prompt Merging Utilities
 *
 * Merges user-customized prompts with built-in defaults.
 * Used by services to get effective prompts at runtime.
 *
 * Custom prompts have an `enabled` flag - when true, the custom value is used.
 * When false or undefined, the default is used instead.
 */

import type {
  PromptCustomization,
  AutoModePrompts,
  AgentPrompts,
  BacklogPlanPrompts,
  EnhancementPrompts,
  CustomPrompt,
  ResolvedAutoModePrompts,
  ResolvedAgentPrompts,
  ResolvedBacklogPlanPrompts,
  ResolvedEnhancementPrompts,
} from '@automaker/types';
import {
  DEFAULT_AUTO_MODE_PROMPTS,
  DEFAULT_AGENT_PROMPTS,
  DEFAULT_BACKLOG_PLAN_PROMPTS,
  DEFAULT_ENHANCEMENT_PROMPTS,
} from './defaults.js';

/**
 * Resolve a custom prompt to its effective string value
 * Returns the custom value if enabled=true, otherwise returns the default
 */
function resolvePrompt(custom: CustomPrompt | undefined, defaultValue: string): string {
  return custom?.enabled ? custom.value : defaultValue;
}

/**
 * Merge custom Auto Mode prompts with defaults
 * Custom prompts override defaults only when enabled=true
 */
export function mergeAutoModePrompts(custom?: AutoModePrompts): ResolvedAutoModePrompts {
  return {
    planningLite: resolvePrompt(custom?.planningLite, DEFAULT_AUTO_MODE_PROMPTS.planningLite),
    planningLiteWithApproval: resolvePrompt(
      custom?.planningLiteWithApproval,
      DEFAULT_AUTO_MODE_PROMPTS.planningLiteWithApproval
    ),
    planningSpec: resolvePrompt(custom?.planningSpec, DEFAULT_AUTO_MODE_PROMPTS.planningSpec),
    planningFull: resolvePrompt(custom?.planningFull, DEFAULT_AUTO_MODE_PROMPTS.planningFull),
    featurePromptTemplate: resolvePrompt(
      custom?.featurePromptTemplate,
      DEFAULT_AUTO_MODE_PROMPTS.featurePromptTemplate
    ),
    followUpPromptTemplate: resolvePrompt(
      custom?.followUpPromptTemplate,
      DEFAULT_AUTO_MODE_PROMPTS.followUpPromptTemplate
    ),
    continuationPromptTemplate: resolvePrompt(
      custom?.continuationPromptTemplate,
      DEFAULT_AUTO_MODE_PROMPTS.continuationPromptTemplate
    ),
    pipelineStepPromptTemplate: resolvePrompt(
      custom?.pipelineStepPromptTemplate,
      DEFAULT_AUTO_MODE_PROMPTS.pipelineStepPromptTemplate
    ),
  };
}

/**
 * Merge custom Agent prompts with defaults
 * Custom prompts override defaults only when enabled=true
 */
export function mergeAgentPrompts(custom?: AgentPrompts): ResolvedAgentPrompts {
  return {
    systemPrompt: resolvePrompt(custom?.systemPrompt, DEFAULT_AGENT_PROMPTS.systemPrompt),
  };
}

/**
 * Merge custom Backlog Plan prompts with defaults
 * Custom prompts override defaults only when enabled=true
 */
export function mergeBacklogPlanPrompts(custom?: BacklogPlanPrompts): ResolvedBacklogPlanPrompts {
  return {
    systemPrompt: resolvePrompt(custom?.systemPrompt, DEFAULT_BACKLOG_PLAN_PROMPTS.systemPrompt),
    userPromptTemplate: resolvePrompt(
      custom?.userPromptTemplate,
      DEFAULT_BACKLOG_PLAN_PROMPTS.userPromptTemplate
    ),
  };
}

/**
 * Merge custom Enhancement prompts with defaults
 * Custom prompts override defaults only when enabled=true
 */
export function mergeEnhancementPrompts(custom?: EnhancementPrompts): ResolvedEnhancementPrompts {
  return {
    improveSystemPrompt: resolvePrompt(
      custom?.improveSystemPrompt,
      DEFAULT_ENHANCEMENT_PROMPTS.improveSystemPrompt
    ),
    technicalSystemPrompt: resolvePrompt(
      custom?.technicalSystemPrompt,
      DEFAULT_ENHANCEMENT_PROMPTS.technicalSystemPrompt
    ),
    simplifySystemPrompt: resolvePrompt(
      custom?.simplifySystemPrompt,
      DEFAULT_ENHANCEMENT_PROMPTS.simplifySystemPrompt
    ),
    acceptanceSystemPrompt: resolvePrompt(
      custom?.acceptanceSystemPrompt,
      DEFAULT_ENHANCEMENT_PROMPTS.acceptanceSystemPrompt
    ),
    uxReviewerSystemPrompt: resolvePrompt(
      custom?.uxReviewerSystemPrompt,
      DEFAULT_ENHANCEMENT_PROMPTS.uxReviewerSystemPrompt
    ),
  };
}

/**
 * Merge all custom prompts with defaults
 * Returns a complete PromptCustomization with all fields populated
 */
export function mergeAllPrompts(custom?: PromptCustomization) {
  return {
    autoMode: mergeAutoModePrompts(custom?.autoMode),
    agent: mergeAgentPrompts(custom?.agent),
    backlogPlan: mergeBacklogPlanPrompts(custom?.backlogPlan),
    enhancement: mergeEnhancementPrompts(custom?.enhancement),
  };
}
