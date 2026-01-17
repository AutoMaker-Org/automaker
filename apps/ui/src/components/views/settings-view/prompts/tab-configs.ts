import {
  MessageSquareText,
  Bot,
  KanbanSquare,
  Sparkles,
  GitCommitHorizontal,
  Type,
  CheckCircle,
  Lightbulb,
  FileCode,
  FileText,
  Wand2,
  Cog,
} from 'lucide-react';
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
} from '@automaker/prompts';
import type { TabConfig } from './types';

/**
 * Configuration for all prompt customization tabs.
 * Each tab defines its fields, banners, and optional sections.
 */
export const TAB_CONFIGS: TabConfig[] = [
  {
    id: 'auto-mode',
    label: 'Auto Mode',
    icon: Bot,
    title: 'Auto Mode Prompts',
    category: 'autoMode',
    banner: {
      type: 'info',
      title: 'Planning Mode Markers',
      description:
        'Planning prompts use special markers like [PLAN_GENERATED] and [SPEC_GENERATED] to control the Auto Mode workflow. These markers must be preserved for proper functionality.',
    },
    fields: [
      {
        key: 'planningLite',
        label: 'Planning: Lite Mode',
        description: 'Quick planning outline without approval requirement',
        defaultValue: DEFAULT_AUTO_MODE_PROMPTS.planningLite,
        critical: true,
      },
      {
        key: 'planningLiteWithApproval',
        label: 'Planning: Lite with Approval',
        description: 'Planning outline that waits for user approval',
        defaultValue: DEFAULT_AUTO_MODE_PROMPTS.planningLiteWithApproval,
        critical: true,
      },
      {
        key: 'planningSpec',
        label: 'Planning: Spec Mode',
        description: 'Detailed specification with task breakdown',
        defaultValue: DEFAULT_AUTO_MODE_PROMPTS.planningSpec,
        critical: true,
      },
      {
        key: 'planningFull',
        label: 'Planning: Full SDD Mode',
        description: 'Comprehensive Software Design Document with phased implementation',
        defaultValue: DEFAULT_AUTO_MODE_PROMPTS.planningFull,
        critical: true,
      },
    ],
    sections: [
      {
        title: 'Interactive Planning (Claude Code CLI Only)',
        banner: {
          type: 'info',
          title: 'Clarification Questions',
          description:
            'When interactive planning is enabled (in Feature Defaults), this prompt guides the AI on how to ask clarification questions before generating a plan. Customize to change the types of questions asked.',
        },
        fields: [
          {
            key: 'clarificationInstructions',
            label: 'Clarification Instructions',
            description:
              'Instructions prepended to planning prompts that guide the AI on asking clarification questions. Enable interactive planning in Feature Defaults to use this.',
            defaultValue: DEFAULT_AUTO_MODE_PROMPTS.clarificationInstructions,
          },
        ],
      },
      {
        title: 'Template Prompts',
        banner: {
          type: 'info',
          title: 'Template Variables',
          description:
            'Template prompts use Handlebars syntax for variable substitution. Available variables include {{featureId}}, {{title}}, {{description}}, etc.',
        },
        fields: [
          {
            key: 'featurePromptTemplate',
            label: 'Feature Prompt Template',
            description:
              'Template for building feature implementation prompts. Variables: featureId, title, description, spec, imagePaths, dependencies, verificationInstructions',
            defaultValue: DEFAULT_AUTO_MODE_PROMPTS.featurePromptTemplate,
          },
          {
            key: 'followUpPromptTemplate',
            label: 'Follow-up Prompt Template',
            description:
              'Template for follow-up prompts when resuming work. Variables: featurePrompt, previousContext, followUpInstructions',
            defaultValue: DEFAULT_AUTO_MODE_PROMPTS.followUpPromptTemplate,
          },
          {
            key: 'continuationPromptTemplate',
            label: 'Continuation Prompt Template',
            description:
              'Template for continuation prompts. Variables: featurePrompt, previousContext',
            defaultValue: DEFAULT_AUTO_MODE_PROMPTS.continuationPromptTemplate,
          },
          {
            key: 'pipelineStepPromptTemplate',
            label: 'Pipeline Step Prompt Template',
            description:
              'Template for pipeline step execution prompts. Variables: stepName, featurePrompt, previousContext, stepInstructions',
            defaultValue: DEFAULT_AUTO_MODE_PROMPTS.pipelineStepPromptTemplate,
          },
        ],
      },
    ],
  },
  {
    id: 'agent',
    label: 'Agent',
    icon: MessageSquareText,
    title: 'Agent Runner Prompts',
    category: 'agent',
    fields: [
      {
        key: 'systemPrompt',
        label: 'System Prompt',
        description: "Defines the AI's role and behavior in interactive chat sessions",
        defaultValue: DEFAULT_AGENT_PROMPTS.systemPrompt,
      },
    ],
  },
  {
    id: 'backlog-plan',
    label: 'Backlog',
    icon: KanbanSquare,
    title: 'Backlog Planning Prompts',
    category: 'backlogPlan',
    banner: {
      type: 'warning',
      title: 'Warning: Critical Prompts',
      description:
        'Backlog plan prompts require a strict JSON output format. Modifying these prompts incorrectly can break the backlog planning feature and potentially corrupt your feature data. Only customize if you fully understand the expected output structure.',
    },
    fields: [
      {
        key: 'systemPrompt',
        label: 'System Prompt',
        description:
          'Defines how the AI modifies the feature backlog (Plan button on Kanban board)',
        defaultValue: DEFAULT_BACKLOG_PLAN_PROMPTS.systemPrompt,
        critical: true,
      },
      {
        key: 'userPromptTemplate',
        label: 'User Prompt Template',
        description:
          'Template for the user prompt sent to the AI. Variables: currentFeatures, userRequest',
        defaultValue: DEFAULT_BACKLOG_PLAN_PROMPTS.userPromptTemplate,
        critical: true,
      },
    ],
  },
  {
    id: 'enhancement',
    label: 'Enhancement',
    icon: Sparkles,
    title: 'Enhancement Prompts',
    category: 'enhancement',
    fields: [
      {
        key: 'improveSystemPrompt',
        label: 'Improve Mode',
        description: 'Transform vague requests into clear, actionable tasks',
        defaultValue: DEFAULT_ENHANCEMENT_PROMPTS.improveSystemPrompt,
      },
      {
        key: 'technicalSystemPrompt',
        label: 'Technical Mode',
        description: 'Add implementation details and technical specifications',
        defaultValue: DEFAULT_ENHANCEMENT_PROMPTS.technicalSystemPrompt,
      },
      {
        key: 'simplifySystemPrompt',
        label: 'Simplify Mode',
        description: 'Make verbose descriptions concise and focused',
        defaultValue: DEFAULT_ENHANCEMENT_PROMPTS.simplifySystemPrompt,
      },
      {
        key: 'acceptanceSystemPrompt',
        label: 'Acceptance Criteria Mode',
        description: 'Add testable acceptance criteria to descriptions',
        defaultValue: DEFAULT_ENHANCEMENT_PROMPTS.acceptanceSystemPrompt,
      },
      {
        key: 'uxReviewerSystemPrompt',
        label: 'User Experience Mode',
        description: 'Review and enhance from a user experience and design perspective',
        defaultValue: DEFAULT_ENHANCEMENT_PROMPTS.uxReviewerSystemPrompt,
      },
    ],
  },
  {
    id: 'commit-message',
    label: 'Commit',
    icon: GitCommitHorizontal,
    title: 'Commit Message Prompts',
    category: 'commitMessage',
    fields: [
      {
        key: 'systemPrompt',
        label: 'System Prompt',
        description:
          'Instructions for generating git commit messages from diffs. The AI will receive the git diff and generate a conventional commit message.',
        defaultValue: DEFAULT_COMMIT_MESSAGE_PROMPTS.systemPrompt,
      },
    ],
  },
  {
    id: 'title-generation',
    label: 'Title',
    icon: Type,
    title: 'Title Generation Prompts',
    category: 'titleGeneration',
    fields: [
      {
        key: 'systemPrompt',
        label: 'System Prompt',
        description:
          'Instructions for generating concise, descriptive feature titles from descriptions. Used when auto-generating titles for new features.',
        defaultValue: DEFAULT_TITLE_GENERATION_PROMPTS.systemPrompt,
      },
    ],
  },
  {
    id: 'issue-validation',
    label: 'Issues',
    icon: CheckCircle,
    title: 'Issue Validation Prompts',
    category: 'issueValidation',
    banner: {
      type: 'warning',
      title: 'Warning: Critical Prompt',
      description:
        'The issue validation prompt guides the AI through a structured validation process and expects specific output format. Modifying this prompt incorrectly may affect validation accuracy.',
    },
    fields: [
      {
        key: 'systemPrompt',
        label: 'System Prompt',
        description:
          'Instructions for validating GitHub issues against the codebase. Guides the AI to determine if issues are valid, invalid, or need clarification.',
        defaultValue: DEFAULT_ISSUE_VALIDATION_PROMPTS.systemPrompt,
        critical: true,
      },
    ],
  },
  {
    id: 'ideation',
    label: 'Ideation',
    icon: Lightbulb,
    title: 'Ideation Prompts',
    category: 'ideation',
    fields: [
      {
        key: 'ideationSystemPrompt',
        label: 'Ideation Chat System Prompt',
        description:
          'System prompt for AI-powered ideation chat conversations. Guides the AI to brainstorm and suggest feature ideas.',
        defaultValue: DEFAULT_IDEATION_PROMPTS.ideationSystemPrompt,
      },
      {
        key: 'suggestionsSystemPrompt',
        label: 'Suggestions System Prompt',
        description:
          'System prompt for generating structured feature suggestions. Used when generating batch suggestions from prompts.',
        defaultValue: DEFAULT_IDEATION_PROMPTS.suggestionsSystemPrompt,
        critical: true,
      },
    ],
  },
  {
    id: 'app-spec',
    label: 'App Spec',
    icon: FileCode,
    title: 'App Specification Prompts',
    category: 'appSpec',
    fields: [
      {
        key: 'generateSpecSystemPrompt',
        label: 'Generate Spec System Prompt',
        description: 'System prompt for generating project specifications from overview',
        defaultValue: DEFAULT_APP_SPEC_PROMPTS.generateSpecSystemPrompt,
      },
      {
        key: 'structuredSpecInstructions',
        label: 'Structured Spec Instructions',
        description: 'Instructions for structured specification output format',
        defaultValue: DEFAULT_APP_SPEC_PROMPTS.structuredSpecInstructions,
        critical: true,
      },
      {
        key: 'generateFeaturesFromSpecPrompt',
        label: 'Generate Features from Spec',
        description: 'Prompt for generating features from a project specification',
        defaultValue: DEFAULT_APP_SPEC_PROMPTS.generateFeaturesFromSpecPrompt,
        critical: true,
      },
    ],
  },
  {
    id: 'context-description',
    label: 'Context',
    icon: FileText,
    title: 'Context Description Prompts',
    category: 'contextDescription',
    fields: [
      {
        key: 'describeFilePrompt',
        label: 'Describe File Prompt',
        description: 'Prompt for generating descriptions of text files added as context',
        defaultValue: DEFAULT_CONTEXT_DESCRIPTION_PROMPTS.describeFilePrompt,
      },
      {
        key: 'describeImagePrompt',
        label: 'Describe Image Prompt',
        description: 'Prompt for generating descriptions of images added as context',
        defaultValue: DEFAULT_CONTEXT_DESCRIPTION_PROMPTS.describeImagePrompt,
      },
    ],
  },
  {
    id: 'suggestions',
    label: 'Suggestions',
    icon: Wand2,
    title: 'Suggestions Prompts',
    category: 'suggestions',
    fields: [
      {
        key: 'featuresPrompt',
        label: 'Features Suggestion Prompt',
        description: 'Prompt for analyzing the project and suggesting new features',
        defaultValue: DEFAULT_SUGGESTIONS_PROMPTS.featuresPrompt,
      },
      {
        key: 'refactoringPrompt',
        label: 'Refactoring Suggestion Prompt',
        description: 'Prompt for identifying refactoring opportunities',
        defaultValue: DEFAULT_SUGGESTIONS_PROMPTS.refactoringPrompt,
      },
      {
        key: 'securityPrompt',
        label: 'Security Suggestion Prompt',
        description: 'Prompt for analyzing security vulnerabilities',
        defaultValue: DEFAULT_SUGGESTIONS_PROMPTS.securityPrompt,
      },
      {
        key: 'performancePrompt',
        label: 'Performance Suggestion Prompt',
        description: 'Prompt for identifying performance issues',
        defaultValue: DEFAULT_SUGGESTIONS_PROMPTS.performancePrompt,
      },
      {
        key: 'baseTemplate',
        label: 'Base Template',
        description: 'Base template applied to all suggestion types',
        defaultValue: DEFAULT_SUGGESTIONS_PROMPTS.baseTemplate,
      },
    ],
  },
  {
    id: 'task-execution',
    label: 'Tasks',
    icon: Cog,
    title: 'Task Execution Prompts',
    category: 'taskExecution',
    banner: {
      type: 'info',
      title: 'Template Variables',
      description:
        'Task execution prompts use Handlebars syntax for variable substitution. Variables include {{taskId}}, {{taskDescription}}, {{completedTasks}}, etc.',
    },
    fields: [
      {
        key: 'taskPromptTemplate',
        label: 'Task Prompt Template',
        description: 'Template for building individual task execution prompts',
        defaultValue: DEFAULT_TASK_EXECUTION_PROMPTS.taskPromptTemplate,
      },
      {
        key: 'implementationInstructions',
        label: 'Implementation Instructions',
        description: 'Instructions appended to feature implementation prompts',
        defaultValue: DEFAULT_TASK_EXECUTION_PROMPTS.implementationInstructions,
      },
      {
        key: 'playwrightVerificationInstructions',
        label: 'Playwright Verification Instructions',
        description: 'Instructions for automated Playwright verification (when enabled)',
        defaultValue: DEFAULT_TASK_EXECUTION_PROMPTS.playwrightVerificationInstructions,
      },
      {
        key: 'learningExtractionSystemPrompt',
        label: 'Learning Extraction System Prompt',
        description: 'System prompt for extracting learnings/ADRs from implementation output',
        defaultValue: DEFAULT_TASK_EXECUTION_PROMPTS.learningExtractionSystemPrompt,
        critical: true,
      },
      {
        key: 'learningExtractionUserPromptTemplate',
        label: 'Learning Extraction User Template',
        description:
          'User prompt template for learning extraction. Variables: featureTitle, implementationLog',
        defaultValue: DEFAULT_TASK_EXECUTION_PROMPTS.learningExtractionUserPromptTemplate,
        critical: true,
      },
      {
        key: 'planRevisionTemplate',
        label: 'Plan Revision Template',
        description:
          'Template for prompting plan revisions. Variables: planVersion, previousPlan, userFeedback',
        defaultValue: DEFAULT_TASK_EXECUTION_PROMPTS.planRevisionTemplate,
      },
      {
        key: 'continuationAfterApprovalTemplate',
        label: 'Continuation After Approval Template',
        description:
          'Template for continuation after plan approval. Variables: userFeedback, approvedPlan',
        defaultValue: DEFAULT_TASK_EXECUTION_PROMPTS.continuationAfterApprovalTemplate,
      },
      {
        key: 'resumeFeatureTemplate',
        label: 'Resume Feature Template',
        description:
          'Template for resuming interrupted features. Variables: featurePrompt, previousContext',
        defaultValue: DEFAULT_TASK_EXECUTION_PROMPTS.resumeFeatureTemplate,
      },
      {
        key: 'projectAnalysisPrompt',
        label: 'Project Analysis Prompt',
        description: 'Prompt for AI-powered project analysis',
        defaultValue: DEFAULT_TASK_EXECUTION_PROMPTS.projectAnalysisPrompt,
      },
    ],
  },
];
