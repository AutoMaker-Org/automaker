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
  CommitMessagePrompts,
  TitleGenerationPrompts,
  IssueValidationPrompts,
  IdeationPrompts,
  AppSpecPrompts,
  ContextDescriptionPrompts,
  SuggestionsPrompts,
  TaskExecutionPrompts,
  CustomPrompt,
  ResolvedAutoModePrompts,
  ResolvedAgentPrompts,
  ResolvedBacklogPlanPrompts,
  ResolvedEnhancementPrompts,
  ResolvedCommitMessagePrompts,
  ResolvedTitleGenerationPrompts,
  ResolvedIssueValidationPrompts,
  ResolvedIdeationPrompts,
  ResolvedAppSpecPrompts,
  ResolvedContextDescriptionPrompts,
  ResolvedSuggestionsPrompts,
  ResolvedTaskExecutionPrompts,
} from '@automaker/types';
import {
  DEFAULT_AUTO_MODE_PROMPTS,
  DEFAULT_AGENT_PROMPTS,
  DEFAULT_BACKLOG_PLAN_PROMPTS,
  DEFAULT_ENHANCEMENT_PROMPTS,
  DEFAULT_COMMIT_MESSAGE_PROMPTS,
  DEFAULT_TITLE_GENERATION_PROMPTS,
  DEFAULT_ISSUE_VALIDATION_PROMPTS,
  DEFAULT_IDEATION_PROMPTS,
  DEFAULT_APP_SPEC_PROMPTS,
  DEFAULT_CONTEXT_DESCRIPTION_PROMPTS,
  DEFAULT_SUGGESTIONS_PROMPTS,
  DEFAULT_TASK_EXECUTION_PROMPTS,
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
    clarificationInstructions: resolvePrompt(
      custom?.clarificationInstructions,
      DEFAULT_AUTO_MODE_PROMPTS.clarificationInstructions
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
 * Merge custom Commit Message prompts with defaults
 * Custom prompts override defaults only when enabled=true
 */
export function mergeCommitMessagePrompts(
  custom?: CommitMessagePrompts
): ResolvedCommitMessagePrompts {
  return {
    systemPrompt: resolvePrompt(custom?.systemPrompt, DEFAULT_COMMIT_MESSAGE_PROMPTS.systemPrompt),
  };
}

/**
 * Merge custom Title Generation prompts with defaults
 * Custom prompts override defaults only when enabled=true
 */
export function mergeTitleGenerationPrompts(
  custom?: TitleGenerationPrompts
): ResolvedTitleGenerationPrompts {
  return {
    systemPrompt: resolvePrompt(
      custom?.systemPrompt,
      DEFAULT_TITLE_GENERATION_PROMPTS.systemPrompt
    ),
  };
}

/**
 * Merge custom Issue Validation prompts with defaults
 * Custom prompts override defaults only when enabled=true
 */
export function mergeIssueValidationPrompts(
  custom?: IssueValidationPrompts
): ResolvedIssueValidationPrompts {
  return {
    systemPrompt: resolvePrompt(
      custom?.systemPrompt,
      DEFAULT_ISSUE_VALIDATION_PROMPTS.systemPrompt
    ),
  };
}

/**
 * Merge custom Ideation prompts with defaults
 * Custom prompts override defaults only when enabled=true
 */
export function mergeIdeationPrompts(custom?: IdeationPrompts): ResolvedIdeationPrompts {
  return {
    ideationSystemPrompt: resolvePrompt(
      custom?.ideationSystemPrompt,
      DEFAULT_IDEATION_PROMPTS.ideationSystemPrompt
    ),
    suggestionsSystemPrompt: resolvePrompt(
      custom?.suggestionsSystemPrompt,
      DEFAULT_IDEATION_PROMPTS.suggestionsSystemPrompt
    ),
  };
}

/**
 * Merge custom App Spec prompts with defaults
 * Custom prompts override defaults only when enabled=true
 */
export function mergeAppSpecPrompts(custom?: AppSpecPrompts): ResolvedAppSpecPrompts {
  return {
    generateSpecSystemPrompt: resolvePrompt(
      custom?.generateSpecSystemPrompt,
      DEFAULT_APP_SPEC_PROMPTS.generateSpecSystemPrompt
    ),
    structuredSpecInstructions: resolvePrompt(
      custom?.structuredSpecInstructions,
      DEFAULT_APP_SPEC_PROMPTS.structuredSpecInstructions
    ),
    generateFeaturesFromSpecPrompt: resolvePrompt(
      custom?.generateFeaturesFromSpecPrompt,
      DEFAULT_APP_SPEC_PROMPTS.generateFeaturesFromSpecPrompt
    ),
  };
}

/**
 * Merge custom Context Description prompts with defaults
 * Custom prompts override defaults only when enabled=true
 */
export function mergeContextDescriptionPrompts(
  custom?: ContextDescriptionPrompts
): ResolvedContextDescriptionPrompts {
  return {
    describeFilePrompt: resolvePrompt(
      custom?.describeFilePrompt,
      DEFAULT_CONTEXT_DESCRIPTION_PROMPTS.describeFilePrompt
    ),
    describeImagePrompt: resolvePrompt(
      custom?.describeImagePrompt,
      DEFAULT_CONTEXT_DESCRIPTION_PROMPTS.describeImagePrompt
    ),
  };
}

/**
 * Merge custom Suggestions prompts with defaults
 * Custom prompts override defaults only when enabled=true
 */
export function mergeSuggestionsPrompts(custom?: SuggestionsPrompts): ResolvedSuggestionsPrompts {
  return {
    featuresPrompt: resolvePrompt(
      custom?.featuresPrompt,
      DEFAULT_SUGGESTIONS_PROMPTS.featuresPrompt
    ),
    refactoringPrompt: resolvePrompt(
      custom?.refactoringPrompt,
      DEFAULT_SUGGESTIONS_PROMPTS.refactoringPrompt
    ),
    securityPrompt: resolvePrompt(
      custom?.securityPrompt,
      DEFAULT_SUGGESTIONS_PROMPTS.securityPrompt
    ),
    performancePrompt: resolvePrompt(
      custom?.performancePrompt,
      DEFAULT_SUGGESTIONS_PROMPTS.performancePrompt
    ),
    baseTemplate: resolvePrompt(custom?.baseTemplate, DEFAULT_SUGGESTIONS_PROMPTS.baseTemplate),
  };
}

/**
 * Merge custom Task Execution prompts with defaults
 * Custom prompts override defaults only when enabled=true
 */
export function mergeTaskExecutionPrompts(
  custom?: TaskExecutionPrompts
): ResolvedTaskExecutionPrompts {
  return {
    taskPromptTemplate: resolvePrompt(
      custom?.taskPromptTemplate,
      DEFAULT_TASK_EXECUTION_PROMPTS.taskPromptTemplate
    ),
    implementationInstructions: resolvePrompt(
      custom?.implementationInstructions,
      DEFAULT_TASK_EXECUTION_PROMPTS.implementationInstructions
    ),
    playwrightVerificationInstructions: resolvePrompt(
      custom?.playwrightVerificationInstructions,
      DEFAULT_TASK_EXECUTION_PROMPTS.playwrightVerificationInstructions
    ),
    learningExtractionSystemPrompt: resolvePrompt(
      custom?.learningExtractionSystemPrompt,
      DEFAULT_TASK_EXECUTION_PROMPTS.learningExtractionSystemPrompt
    ),
    learningExtractionUserPromptTemplate: resolvePrompt(
      custom?.learningExtractionUserPromptTemplate,
      DEFAULT_TASK_EXECUTION_PROMPTS.learningExtractionUserPromptTemplate
    ),
    planRevisionTemplate: resolvePrompt(
      custom?.planRevisionTemplate,
      DEFAULT_TASK_EXECUTION_PROMPTS.planRevisionTemplate
    ),
    continuationAfterApprovalTemplate: resolvePrompt(
      custom?.continuationAfterApprovalTemplate,
      DEFAULT_TASK_EXECUTION_PROMPTS.continuationAfterApprovalTemplate
    ),
    resumeFeatureTemplate: resolvePrompt(
      custom?.resumeFeatureTemplate,
      DEFAULT_TASK_EXECUTION_PROMPTS.resumeFeatureTemplate
    ),
    projectAnalysisPrompt: resolvePrompt(
      custom?.projectAnalysisPrompt,
      DEFAULT_TASK_EXECUTION_PROMPTS.projectAnalysisPrompt
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
    commitMessage: mergeCommitMessagePrompts(custom?.commitMessage),
    titleGeneration: mergeTitleGenerationPrompts(custom?.titleGeneration),
    issueValidation: mergeIssueValidationPrompts(custom?.issueValidation),
    ideation: mergeIdeationPrompts(custom?.ideation),
    appSpec: mergeAppSpecPrompts(custom?.appSpec),
    contextDescription: mergeContextDescriptionPrompts(custom?.contextDescription),
    suggestions: mergeSuggestionsPrompts(custom?.suggestions),
    taskExecution: mergeTaskExecutionPrompts(custom?.taskExecution),
  };
}
