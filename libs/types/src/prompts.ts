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

  /**
   * Instructions for clarification questions during planning (Claude provider only).
   * When enabled and non-empty, prepended to planning prompts to guide the AI
   * on when and how to use the AskUserQuestion tool for gathering requirements.
   * Only applied when requirePlanApproval is enabled.
   */
  clarificationInstructions?: CustomPrompt;
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
 * CommitMessagePrompts - Customizable prompts for AI commit message generation
 *
 * Controls how the AI generates git commit messages from diffs.
 */
export interface CommitMessagePrompts {
  /** System prompt for generating commit messages */
  systemPrompt?: CustomPrompt;
}

/**
 * TitleGenerationPrompts - Customizable prompts for AI feature title generation
 *
 * Controls how the AI generates short, descriptive titles for features.
 */
export interface TitleGenerationPrompts {
  /** System prompt for generating feature titles from descriptions */
  systemPrompt?: CustomPrompt;
}

/**
 * IssueValidationPrompts - Customizable prompts for GitHub issue validation
 *
 * Controls how the AI validates GitHub issues against the codebase,
 * determining if issues are valid, invalid, or need clarification.
 */
export interface IssueValidationPrompts {
  /** System prompt for validating GitHub issues against codebase */
  systemPrompt?: CustomPrompt;
}

/**
 * IdeationPrompts - Customizable prompts for AI-powered ideation and brainstorming
 *
 * Controls how the AI generates feature ideas and suggestions for the project.
 */
export interface IdeationPrompts {
  /** System prompt for ideation chat conversations */
  ideationSystemPrompt?: CustomPrompt;

  /** System prompt for generating feature suggestions */
  suggestionsSystemPrompt?: CustomPrompt;
}

/**
 * AppSpecPrompts - Customizable prompts for project specification generation
 *
 * Controls how the AI generates project specifications and features from specs.
 */
export interface AppSpecPrompts {
  /** System prompt for generating project specifications */
  generateSpecSystemPrompt?: CustomPrompt;

  /** Instructions for structured specification output format */
  structuredSpecInstructions?: CustomPrompt;

  /** System prompt for generating features from a specification */
  generateFeaturesFromSpecPrompt?: CustomPrompt;
}

/**
 * ContextDescriptionPrompts - Customizable prompts for context file/image descriptions
 *
 * Controls how the AI describes context files and images.
 */
export interface ContextDescriptionPrompts {
  /** System prompt for describing text files added as context */
  describeFilePrompt?: CustomPrompt;

  /** System prompt for describing images added as context */
  describeImagePrompt?: CustomPrompt;
}

/**
 * SuggestionsPrompts - Customizable prompts for generating various suggestions
 *
 * Controls how the AI generates feature, refactoring, security, and performance suggestions.
 */
export interface SuggestionsPrompts {
  /** Prompt for generating new feature suggestions */
  featuresPrompt?: CustomPrompt;

  /** Prompt for generating refactoring suggestions */
  refactoringPrompt?: CustomPrompt;

  /** Prompt for generating security suggestions */
  securityPrompt?: CustomPrompt;

  /** Prompt for generating performance suggestions */
  performancePrompt?: CustomPrompt;

  /** Base template for all suggestion types */
  baseTemplate?: CustomPrompt;
}

/**
 * TaskExecutionPrompts - Customizable prompts for Auto Mode task execution
 *
 * Controls how the AI executes tasks, extracts learnings, and handles continuations.
 */
export interface TaskExecutionPrompts {
  /** Template for building task execution prompts */
  taskPromptTemplate?: CustomPrompt;

  /** Instructions appended to feature implementation prompts */
  implementationInstructions?: CustomPrompt;

  /** Instructions for Playwright verification (when enabled) */
  playwrightVerificationInstructions?: CustomPrompt;

  /** System prompt for extracting learnings/ADRs from implementation */
  learningExtractionSystemPrompt?: CustomPrompt;

  /** User prompt template for learning extraction */
  learningExtractionUserPromptTemplate?: CustomPrompt;

  /** Template for prompting plan revisions */
  planRevisionTemplate?: CustomPrompt;

  /** Template for continuation after plan approval */
  continuationAfterApprovalTemplate?: CustomPrompt;

  /** Template for resuming interrupted features */
  resumeFeatureTemplate?: CustomPrompt;

  /** Template for project analysis */
  projectAnalysisPrompt?: CustomPrompt;
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

  /** Commit message prompts (AI-generated commit messages) */
  commitMessage?: CommitMessagePrompts;

  /** Title generation prompts (AI-generated feature titles) */
  titleGeneration?: TitleGenerationPrompts;

  /** Issue validation prompts (GitHub issue validation) */
  issueValidation?: IssueValidationPrompts;

  /** Ideation prompts (AI-powered brainstorming and suggestions) */
  ideation?: IdeationPrompts;

  /** App specification prompts (project spec generation) */
  appSpec?: AppSpecPrompts;

  /** Context description prompts (file/image descriptions) */
  contextDescription?: ContextDescriptionPrompts;

  /** Suggestions prompts (features, refactoring, security, performance) */
  suggestions?: SuggestionsPrompts;

  /** Task execution prompts (Auto Mode task execution, learning extraction) */
  taskExecution?: TaskExecutionPrompts;
}

/**
 * Default empty prompt customization (all undefined → use built-in defaults)
 */
export const DEFAULT_PROMPT_CUSTOMIZATION: PromptCustomization = {
  autoMode: {},
  agent: {},
  backlogPlan: {},
  enhancement: {},
  commitMessage: {},
  titleGeneration: {},
  issueValidation: {},
  ideation: {},
  appSpec: {},
  contextDescription: {},
  suggestions: {},
  taskExecution: {},
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
  /** Optional clarification instructions - empty string means disabled */
  clarificationInstructions: string;
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

export interface ResolvedCommitMessagePrompts {
  systemPrompt: string;
}

export interface ResolvedTitleGenerationPrompts {
  systemPrompt: string;
}

export interface ResolvedIssueValidationPrompts {
  systemPrompt: string;
}

export interface ResolvedIdeationPrompts {
  ideationSystemPrompt: string;
  suggestionsSystemPrompt: string;
}

export interface ResolvedAppSpecPrompts {
  generateSpecSystemPrompt: string;
  structuredSpecInstructions: string;
  generateFeaturesFromSpecPrompt: string;
}

export interface ResolvedContextDescriptionPrompts {
  describeFilePrompt: string;
  describeImagePrompt: string;
}

export interface ResolvedSuggestionsPrompts {
  featuresPrompt: string;
  refactoringPrompt: string;
  securityPrompt: string;
  performancePrompt: string;
  baseTemplate: string;
}

export interface ResolvedTaskExecutionPrompts {
  taskPromptTemplate: string;
  implementationInstructions: string;
  playwrightVerificationInstructions: string;
  learningExtractionSystemPrompt: string;
  learningExtractionUserPromptTemplate: string;
  planRevisionTemplate: string;
  continuationAfterApprovalTemplate: string;
  resumeFeatureTemplate: string;
  projectAnalysisPrompt: string;
}
