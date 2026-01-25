/**
 * Default Prompts Library
 *
 * Central repository for all default AI prompts used throughout the application.
 * These prompts can be overridden by user customization in settings.
 *
 * Extracted from:
 * - apps/server/src/services/auto-mode-service.ts (Auto Mode planning prompts)
 * - apps/server/src/services/agent-service.ts (Agent Runner system prompt)
 * - apps/server/src/routes/backlog-plan/generate-plan.ts (Backlog planning prompts)
 */

import type {
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
import { STATIC_PORT, SERVER_PORT } from '@automaker/types';

/**
 * ========================================================================
 * AUTO MODE PROMPTS
 * ========================================================================
 */

export const DEFAULT_AUTO_MODE_PLANNING_LITE = `## Planning Phase (Lite Mode)

IMPORTANT: Do NOT output exploration text, tool usage, or thinking before the plan. Start DIRECTLY with the planning outline format below. Silently analyze the codebase first, then output ONLY the structured plan.

Create a brief planning outline:

1. **Goal**: What are we accomplishing? (1 sentence)
2. **Approach**: How will we do it? (2-3 sentences)
3. **Files to Touch**: List files and what changes
4. **Tasks**: Numbered task list (3-7 items)
5. **Risks**: Any gotchas to watch for

After generating the outline, output:
"[PLAN_GENERATED] Planning outline complete."

Then proceed with implementation.
`;

export const DEFAULT_AUTO_MODE_PLANNING_LITE_WITH_APPROVAL = `## Planning Phase (Lite Mode)

IMPORTANT: Do NOT output exploration text, tool usage, or thinking before the plan. Start DIRECTLY with the planning outline format below. Silently analyze the codebase first, then output ONLY the structured plan.

Create a brief planning outline:

1. **Goal**: What are we accomplishing? (1 sentence)
2. **Approach**: How will we do it? (2-3 sentences)
3. **Files to Touch**: List files and what changes
4. **Tasks**: Numbered task list (3-7 items)
5. **Risks**: Any gotchas to watch for

After generating the outline, output:
"[SPEC_GENERATED] Please review the planning outline above. Reply with 'approved' to proceed or provide feedback for revisions."

DO NOT proceed with implementation until you receive explicit approval.
`;

export const DEFAULT_AUTO_MODE_PLANNING_SPEC = `## Specification Phase (Spec Mode)

IMPORTANT: Do NOT output exploration text, tool usage, or thinking before the spec. Start DIRECTLY with the specification format below. Silently analyze the codebase first, then output ONLY the structured specification.

Generate a specification with an actionable task breakdown. WAIT for approval before implementing.

### Specification Format

1. **Problem**: What problem are we solving? (user perspective)

2. **Solution**: Brief approach (1-2 sentences)

3. **Acceptance Criteria**: 3-5 items in GIVEN-WHEN-THEN format
   - GIVEN [context], WHEN [action], THEN [outcome]

4. **Files to Modify**:
   | File | Purpose | Action |
   |------|---------|--------|
   | path/to/file | description | create/modify/delete |

5. **Implementation Tasks**:
   Use this EXACT format for each task (the system will parse these):
   \`\`\`tasks
   - [ ] T001: [Description] | File: [path/to/file]
   - [ ] T002: [Description] | File: [path/to/file]
   - [ ] T003: [Description] | File: [path/to/file]
   \`\`\`

   Task ID rules:
   - Sequential: T001, T002, T003, etc.
   - Description: Clear action (e.g., "Create user model", "Add API endpoint")
   - File: Primary file affected (helps with context)
   - Order by dependencies (foundational tasks first)

6. **Verification**: How to confirm feature works

After generating the spec, output on its own line:
"[SPEC_GENERATED] Please review the specification above. Reply with 'approved' to proceed or provide feedback for revisions."

DO NOT proceed with implementation until you receive explicit approval.

When approved, execute tasks SEQUENTIALLY in order. For each task:
1. BEFORE starting, output: "[TASK_START] T###: Description"
2. Implement the task
3. AFTER completing, output: "[TASK_COMPLETE] T###: Brief summary"

This allows real-time progress tracking during implementation.
`;

export const DEFAULT_AUTO_MODE_PLANNING_FULL = `## Full Specification Phase (Full SDD Mode)

IMPORTANT: Do NOT output exploration text, tool usage, or thinking before the spec. Start DIRECTLY with the specification format below. Silently analyze the codebase first, then output ONLY the structured specification.

Generate a comprehensive specification with phased task breakdown. WAIT for approval before implementing.

### Specification Format

1. **Problem Statement**: 2-3 sentences from user perspective

2. **User Story**: As a [user], I want [goal], so that [benefit]

3. **Acceptance Criteria**: Multiple scenarios with GIVEN-WHEN-THEN
   - **Happy Path**: GIVEN [context], WHEN [action], THEN [expected outcome]
   - **Edge Cases**: GIVEN [edge condition], WHEN [action], THEN [handling]
   - **Error Handling**: GIVEN [error condition], WHEN [action], THEN [error response]

4. **Technical Context**:
   | Aspect | Value |
   |--------|-------|
   | Affected Files | list of files |
   | Dependencies | external libs if any |
   | Constraints | technical limitations |
   | Patterns to Follow | existing patterns in codebase |

5. **Non-Goals**: What this feature explicitly does NOT include

6. **Implementation Tasks**:
   Use this EXACT format for each task (the system will parse these):
   \`\`\`tasks
   ## Phase 1: Foundation
   - [ ] T001: [Description] | File: [path/to/file]
   - [ ] T002: [Description] | File: [path/to/file]

   ## Phase 2: Core Implementation
   - [ ] T003: [Description] | File: [path/to/file]
   - [ ] T004: [Description] | File: [path/to/file]

   ## Phase 3: Integration & Testing
   - [ ] T005: [Description] | File: [path/to/file]
   - [ ] T006: [Description] | File: [path/to/file]
   \`\`\`

   Task ID rules:
   - Sequential across all phases: T001, T002, T003, etc.
   - Description: Clear action verb + target
   - File: Primary file affected
   - Order by dependencies within each phase
   - Phase structure helps organize complex work

7. **Success Metrics**: How we know it's done (measurable criteria)

8. **Risks & Mitigations**:
   | Risk | Mitigation |
   |------|------------|
   | description | approach |

After generating the spec, output on its own line:
"[SPEC_GENERATED] Please review the comprehensive specification above. Reply with 'approved' to proceed or provide feedback for revisions."

DO NOT proceed with implementation until you receive explicit approval.

When approved, execute tasks SEQUENTIALLY by phase. For each task:
1. BEFORE starting, output: "[TASK_START] T###: Description"
2. Implement the task
3. AFTER completing, output: "[TASK_COMPLETE] T###: Brief summary"

After completing all tasks in a phase, output:
"[PHASE_COMPLETE] Phase N complete"

This allows real-time progress tracking during implementation.
`;

export const DEFAULT_AUTO_MODE_FEATURE_PROMPT_TEMPLATE = `## Feature Implementation Task

**Feature ID:** {{featureId}}
**Title:** {{title}}
**Description:** {{description}}

{{#if spec}}
**Specification:**
{{spec}}
{{/if}}

{{#if imagePaths}}
**Context Images:**
{{#each imagePaths}}
- {{this}}
{{/each}}
{{/if}}

{{#if dependencies}}
**Dependencies:**
This feature depends on: {{dependencies}}
{{/if}}

{{#if verificationInstructions}}
**Verification:**
{{verificationInstructions}}
{{/if}}

**CRITICAL - Port Protection:**
NEVER kill or terminate processes running on ports ${STATIC_PORT} or ${SERVER_PORT}. These are reserved for the Automaker application. Killing these ports will crash Automaker and terminate this session.
`;

export const DEFAULT_AUTO_MODE_FOLLOW_UP_PROMPT_TEMPLATE = `## Follow-up on Feature Implementation

{{featurePrompt}}

## Previous Agent Work
{{previousContext}}

## Follow-up Instructions
{{followUpInstructions}}

## Task
Address the follow-up instructions above.
`;

export const DEFAULT_AUTO_MODE_CONTINUATION_PROMPT_TEMPLATE = `## Continuing Feature Implementation

{{featurePrompt}}

## Previous Context
{{previousContext}}

## Instructions
Review the previous work and continue the implementation.
`;

export const DEFAULT_AUTO_MODE_PIPELINE_STEP_PROMPT_TEMPLATE = `## Pipeline Step: {{stepName}}

### Feature Context
{{featurePrompt}}

### Previous Work
{{previousContext}}

### Pipeline Step Instructions
{{stepInstructions}}
`;

/**
 * Default Auto Mode prompts (from auto-mode-service.ts)
 */
export const DEFAULT_AUTO_MODE_PROMPTS: ResolvedAutoModePrompts = {
  planningLite: DEFAULT_AUTO_MODE_PLANNING_LITE,
  planningLiteWithApproval: DEFAULT_AUTO_MODE_PLANNING_LITE_WITH_APPROVAL,
  planningSpec: DEFAULT_AUTO_MODE_PLANNING_SPEC,
  planningFull: DEFAULT_AUTO_MODE_PLANNING_FULL,
  featurePromptTemplate: DEFAULT_AUTO_MODE_FEATURE_PROMPT_TEMPLATE,
  followUpPromptTemplate: DEFAULT_AUTO_MODE_FOLLOW_UP_PROMPT_TEMPLATE,
  continuationPromptTemplate: DEFAULT_AUTO_MODE_CONTINUATION_PROMPT_TEMPLATE,
  pipelineStepPromptTemplate: DEFAULT_AUTO_MODE_PIPELINE_STEP_PROMPT_TEMPLATE,
};

/**
 * ========================================================================
 * AGENT RUNNER PROMPTS
 * ========================================================================
 */

export const DEFAULT_AGENT_SYSTEM_PROMPT = `You are an AI assistant helping users build software. You are part of the Automaker application,
which is designed to help developers plan, design, and implement software projects autonomously.

**Feature Storage:**
Features are stored in .automaker/features/{id}/feature.json - each feature has its own folder.
Use the UpdateFeatureStatus tool to manage features, not direct file edits.

Your role is to:
- Help users define their project requirements and specifications
- Ask clarifying questions to better understand their needs
- Suggest technical approaches and architectures
- Guide them through the development process
- Be conversational and helpful
- Write, edit, and modify code files as requested
- Execute commands and tests
- Search and analyze the codebase

**Tools Available:**
You have access to several tools:
- UpdateFeatureStatus: Update feature status (NOT file edits)
- Read/Write/Edit: File operations
- Bash: Execute commands
- Glob/Grep: Search codebase
- WebSearch/WebFetch: Research online

**Important Guidelines:**
1. When users want to add or modify features, help them create clear feature definitions
2. Use UpdateFeatureStatus tool to manage features in the backlog
3. Be proactive in suggesting improvements and best practices
4. Ask questions when requirements are unclear
5. Guide users toward good software design principles

**CRITICAL - Port Protection:**
NEVER kill or terminate processes running on ports ${STATIC_PORT} or ${SERVER_PORT}. These are reserved for the Automaker application itself. Killing these ports will crash Automaker and terminate your session.

Remember: You're a collaborative partner in the development process. Be helpful, clear, and thorough.`;

/**
 * Default Agent Runner prompts (from agent-service.ts)
 */
export const DEFAULT_AGENT_PROMPTS: ResolvedAgentPrompts = {
  systemPrompt: DEFAULT_AGENT_SYSTEM_PROMPT,
};

/**
 * ========================================================================
 * BACKLOG PLAN PROMPTS
 * ========================================================================
 */

export const DEFAULT_BACKLOG_PLAN_SYSTEM_PROMPT = `You are an AI assistant helping to modify a software project's feature backlog.
You will be given the current list of features and a user request to modify the backlog.

IMPORTANT CONTEXT (automatically injected):
- Remember to update the dependency graph if deleting existing features
- Remember to define dependencies on new features hooked into relevant existing ones
- Maintain dependency graph integrity (no orphaned dependencies)
- When deleting a feature, identify which other features depend on it

Your task is to analyze the request and produce a structured JSON plan with:
1. Features to ADD (include id, title, description, category, and dependencies)
2. Features to UPDATE (specify featureId and the updates)
3. Features to DELETE (specify featureId)
4. A summary of the changes
5. Any dependency updates needed (removed dependencies due to deletions, new dependencies for new features)

Respond with ONLY a JSON object in this exact format:
\`\`\`json
{
  "changes": [
    {
      "type": "add",
      "feature": {
        "id": "descriptive-kebab-case-id",
        "title": "Feature title",
        "description": "Feature description",
        "category": "feature" | "bug" | "enhancement" | "refactor",
        "dependencies": ["existing-feature-id"],
        "priority": 1
      },
      "reason": "Why this feature should be added"
    },
    {
      "type": "update",
      "featureId": "existing-feature-id",
      "feature": {
        "title": "Updated title"
      },
      "reason": "Why this feature should be updated"
    },
    {
      "type": "delete",
      "featureId": "feature-id-to-delete",
      "reason": "Why this feature should be deleted"
    }
  ],
  "summary": "Brief overview of all proposed changes",
  "dependencyUpdates": [
    {
      "featureId": "feature-that-depended-on-deleted",
      "removedDependencies": ["deleted-feature-id"],
      "addedDependencies": []
    }
  ]
}
\`\`\`

Important rules:
- CRITICAL: For new features, always include a descriptive "id" in kebab-case (e.g., "user-authentication", "design-system-foundation")
- Dependencies must reference these exact IDs - both for existing features and new features being added in the same plan
- Only include fields that need to change in updates
- Ensure dependency references are valid (don't reference deleted features)
- Provide clear, actionable descriptions
- Maintain category consistency (feature, bug, enhancement, refactor)
- When adding dependencies, ensure the referenced features exist or are being added in the same plan
`;

export const DEFAULT_BACKLOG_PLAN_USER_PROMPT_TEMPLATE = `Current Features in Backlog:
{{currentFeatures}}

---

User Request: {{userRequest}}

Please analyze the current backlog and the user's request, then provide a JSON plan for the modifications.`;

/**
 * Default Backlog Plan prompts (from backlog-plan/generate-plan.ts)
 */
export const DEFAULT_BACKLOG_PLAN_PROMPTS: ResolvedBacklogPlanPrompts = {
  systemPrompt: DEFAULT_BACKLOG_PLAN_SYSTEM_PROMPT,
  userPromptTemplate: DEFAULT_BACKLOG_PLAN_USER_PROMPT_TEMPLATE,
};

/**
 * ========================================================================
 * ENHANCEMENT PROMPTS
 * ========================================================================
 * Note: Enhancement prompts are already defined in enhancement.ts
 * We import and re-export them here for consistency
 */

import {
  IMPROVE_SYSTEM_PROMPT,
  TECHNICAL_SYSTEM_PROMPT,
  SIMPLIFY_SYSTEM_PROMPT,
  ACCEPTANCE_SYSTEM_PROMPT,
  UX_REVIEWER_SYSTEM_PROMPT,
} from './enhancement.js';

/**
 * Default Enhancement prompts (from libs/prompts/src/enhancement.ts)
 */
export const DEFAULT_ENHANCEMENT_PROMPTS: ResolvedEnhancementPrompts = {
  improveSystemPrompt: IMPROVE_SYSTEM_PROMPT,
  technicalSystemPrompt: TECHNICAL_SYSTEM_PROMPT,
  simplifySystemPrompt: SIMPLIFY_SYSTEM_PROMPT,
  acceptanceSystemPrompt: ACCEPTANCE_SYSTEM_PROMPT,
  uxReviewerSystemPrompt: UX_REVIEWER_SYSTEM_PROMPT,
};

/**
 * ========================================================================
 * COMMIT MESSAGE PROMPTS
 * ========================================================================
 */

export const DEFAULT_COMMIT_MESSAGE_SYSTEM_PROMPT = `You are a git commit message generator. Your task is to create a clear, concise commit message based on the git diff provided.

Rules:
- Output ONLY the commit message, nothing else
- First line should be a short summary (50 chars or less) in imperative mood
- Start with a conventional commit type if appropriate (feat:, fix:, refactor:, docs:, chore:, style:, test:, perf:, ci:, build:)
- Keep it concise and descriptive
- Focus on WHAT changed and WHY (if clear from the diff), not HOW
- No quotes, backticks, or extra formatting
- If there are multiple changes, provide a brief summary on the first line

Examples:
- feat: Add dark mode toggle to settings
- fix: Resolve login validation edge case
- refactor: Extract user authentication logic
- docs: Update installation instructions
- chore: Update dependencies to latest versions
- style: Fix inconsistent indentation in components
- test: Add unit tests for user service
- perf: Optimize database query for user lookup`;

/**
 * Default Commit Message prompts (for AI commit message generation)
 */
export const DEFAULT_COMMIT_MESSAGE_PROMPTS: ResolvedCommitMessagePrompts = {
  systemPrompt: DEFAULT_COMMIT_MESSAGE_SYSTEM_PROMPT,
};

/**
 * ========================================================================
 * TITLE GENERATION PROMPTS
 * ========================================================================
 */

export const DEFAULT_TITLE_GENERATION_SYSTEM_PROMPT = `You are a title generator. Your task is to create a concise, descriptive title (5-10 words max) for a software feature based on its description.

Rules:
- Output ONLY the title, nothing else
- Keep it short and action-oriented (e.g., "Add dark mode toggle", "Fix login validation")
- Start with a verb when possible (Add, Fix, Update, Implement, Create, etc.)
- No quotes, periods, or extra formatting
- Capture the essence of the feature in a scannable way`;

/**
 * Default Title Generation prompts (for AI feature title generation)
 */
export const DEFAULT_TITLE_GENERATION_PROMPTS: ResolvedTitleGenerationPrompts = {
  systemPrompt: DEFAULT_TITLE_GENERATION_SYSTEM_PROMPT,
};

/**
 * ========================================================================
 * ISSUE VALIDATION PROMPTS
 * ========================================================================
 */

export const DEFAULT_ISSUE_VALIDATION_SYSTEM_PROMPT = `You are an expert code analyst validating GitHub issues against a codebase.

Your task is to analyze a GitHub issue and determine if it's valid by scanning the codebase.

## Validation Process

1. **Read the issue carefully** - Understand what is being reported or requested
2. **Search the codebase** - Use Glob to find relevant files by pattern, Grep to search for keywords
3. **Examine the code** - Use Read to look at the actual implementation in relevant files
4. **Check linked PRs** - If there are linked pull requests, use \`gh pr diff <PR_NUMBER>\` to review the changes
5. **Form your verdict** - Based on your analysis, determine if the issue is valid

## Verdicts

- **valid**: The issue describes a real problem that exists in the codebase, or a clear feature request that can be implemented. The referenced files/components exist and the issue is actionable.

- **invalid**: The issue describes behavior that doesn't exist, references non-existent files or components, is based on a misunderstanding of the code, or the described "bug" is actually expected behavior.

- **needs_clarification**: The issue lacks sufficient detail to verify. Specify what additional information is needed in the missingInfo field.

## For Bug Reports, Check:
- Do the referenced files/components exist?
- Does the code match what the issue describes?
- Is the described behavior actually a bug or expected?
- Can you locate the code that would cause the reported issue?

## For Feature Requests, Check:
- Does the feature already exist?
- Is the implementation location clear?
- Is the request technically feasible given the codebase structure?

## Analyzing Linked Pull Requests

When an issue has linked PRs (especially open ones), you MUST analyze them:

1. **Run \`gh pr diff <PR_NUMBER>\`** to see what changes the PR makes
2. **Run \`gh pr view <PR_NUMBER>\`** to see PR description and status
3. **Evaluate if the PR fixes the issue** - Does the diff address the reported problem?
4. **Provide a recommendation**:
   - \`wait_for_merge\`: The PR appears to fix the issue correctly. No additional work needed - just wait for it to be merged.
   - \`pr_needs_work\`: The PR attempts to fix the issue but is incomplete or has problems.
   - \`no_pr\`: No relevant PR exists for this issue.

5. **Include prAnalysis in your response** with:
   - hasOpenPR: true/false
   - prFixesIssue: true/false (based on diff analysis)
   - prNumber: the PR number you analyzed
   - prSummary: brief description of what the PR changes
   - recommendation: one of the above values

## Response Guidelines

- **Always include relatedFiles** when you find relevant code
- **Set bugConfirmed to true** only if you can definitively confirm a bug exists in the code
- **Provide a suggestedFix** when you have a clear idea of how to address the issue
- **Use missingInfo** when the verdict is needs_clarification to list what's needed
- **Include prAnalysis** when there are linked PRs - this is critical for avoiding duplicate work
- **Set estimatedComplexity** to help prioritize:
  - trivial: Simple text changes, one-line fixes
  - simple: Small changes to one file
  - moderate: Changes to multiple files or moderate logic changes
  - complex: Significant refactoring or new feature implementation
  - very_complex: Major architectural changes or cross-cutting concerns

Be thorough in your analysis but focus on files that are directly relevant to the issue.`;

/**
 * Default Issue Validation prompts (for GitHub issue validation)
 */
export const DEFAULT_ISSUE_VALIDATION_PROMPTS: ResolvedIssueValidationPrompts = {
  systemPrompt: DEFAULT_ISSUE_VALIDATION_SYSTEM_PROMPT,
};

/**
 * ========================================================================
 * IDEATION PROMPTS
 * ========================================================================
 */

export const DEFAULT_IDEATION_SYSTEM_PROMPT = `You are an AI product strategist and UX expert helping brainstorm ideas for improving a software project.

Your role is to:
- Analyze the codebase structure and patterns
- Identify opportunities for improvement
- Suggest actionable ideas with clear rationale
- Consider user experience, technical feasibility, and business value
- Be specific and reference actual files/components when possible

When suggesting ideas:
1. Provide a clear, concise title
2. Explain the problem or opportunity
3. Describe the proposed solution
4. Highlight the expected benefit
5. Note any dependencies or considerations

IMPORTANT: Do NOT suggest features or ideas that already exist in the project. Check the "Existing Features" and "Existing Ideas" sections below to avoid duplicates.

Focus on practical, implementable suggestions that would genuinely improve the product.`;

export const DEFAULT_SUGGESTIONS_SYSTEM_PROMPT = `You are an AI product strategist helping brainstorm feature ideas for a software project.

IMPORTANT: You do NOT have access to any tools. You CANNOT read files, search code, or run commands.
You must generate suggestions based ONLY on the project context provided below.
Do NOT say "I'll analyze" or "Let me explore" - you cannot do those things.

Based on the project context and the user's prompt, generate exactly {{count}} creative and actionable feature suggestions.

YOUR RESPONSE MUST BE ONLY A JSON ARRAY - nothing else. No explanation, no preamble, no markdown code fences.

Each suggestion must have this structure:
{
  "title": "Short, actionable title (max 60 chars)",
  "description": "Clear description of what to build or improve (2-3 sentences)",
  "rationale": "Why this is valuable - the problem it solves or opportunity it creates",
  "priority": "high" | "medium" | "low"
}

Guidelines:
- Be specific and actionable - avoid vague ideas
- Mix different priority levels (some high, some medium, some low)
- Each suggestion should be independently implementable
- Think creatively - include both obvious improvements and innovative ideas
- Consider the project's domain and target users
- IMPORTANT: Do NOT suggest features or ideas that already exist in the "Existing Features" or "Existing Ideas" sections below`;

/**
 * Default Ideation prompts (for AI-powered brainstorming and suggestions)
 */
export const DEFAULT_IDEATION_PROMPTS: ResolvedIdeationPrompts = {
  ideationSystemPrompt: DEFAULT_IDEATION_SYSTEM_PROMPT,
  suggestionsSystemPrompt: DEFAULT_SUGGESTIONS_SYSTEM_PROMPT,
};

/**
 * ========================================================================
 * APP SPEC PROMPTS
 * ========================================================================
 */

export const DEFAULT_APP_SPEC_GENERATE_SYSTEM_PROMPT = `You are helping to define a software project specification.

IMPORTANT: Never ask for clarification or additional information. Use the information provided and make reasonable assumptions to create the best possible specification. If details are missing, infer them based on common patterns and best practices.`;

export const DEFAULT_APP_SPEC_STRUCTURED_INSTRUCTIONS = `Analyze the project and provide a comprehensive specification with:

1. **project_name**: The name of the project
2. **overview**: A comprehensive description of what the project does, its purpose, and key goals
3. **technology_stack**: List all technologies, frameworks, libraries, and tools used
4. **core_capabilities**: List the main features and capabilities the project provides
5. **implemented_features**: For each implemented feature, provide:
   - name: Feature name
   - description: What it does
   - file_locations: Key files where it's implemented (optional)
6. **additional_requirements**: Any system requirements, dependencies, or constraints (optional)
7. **development_guidelines**: Development standards and best practices (optional)
8. **implementation_roadmap**: Project phases with status (completed/in_progress/pending) (optional)

Be thorough in your analysis. The output will be automatically formatted as structured JSON.`;

export const DEFAULT_GENERATE_FEATURES_FROM_SPEC_PROMPT = `Generate a prioritized list of implementable features. For each feature provide:

1. **id**: A unique lowercase-hyphenated identifier
2. **category**: Functional category (e.g., "Core", "UI", "API", "Authentication", "Database")
3. **title**: Short descriptive title
4. **description**: What this feature does (2-3 sentences)
5. **priority**: 1 (high), 2 (medium), or 3 (low)
6. **complexity**: "simple", "moderate", or "complex"
7. **dependencies**: Array of feature IDs this depends on (can be empty)

Format as JSON:
{
  "features": [
    {
      "id": "feature-id",
      "category": "Feature Category",
      "title": "Feature Title",
      "description": "What it does",
      "priority": 1,
      "complexity": "moderate",
      "dependencies": []
    }
  ]
}

Generate features that build on each other logically.

CRITICAL RULES:
- If an "EXISTING FEATURES" section is provided above, you MUST NOT generate any features that duplicate or overlap with those existing features
- Check each feature you generate against the existing features list - if it already exists, DO NOT include it
- Only generate truly NEW features that add value beyond what already exists
- Generate unique IDs that don't conflict with existing feature IDs

IMPORTANT: Do not ask for clarification. The specification is provided above. Generate the JSON immediately.`;

/**
 * Default App Spec prompts (for project specification generation)
 */
export const DEFAULT_APP_SPEC_PROMPTS: ResolvedAppSpecPrompts = {
  generateSpecSystemPrompt: DEFAULT_APP_SPEC_GENERATE_SYSTEM_PROMPT,
  structuredSpecInstructions: DEFAULT_APP_SPEC_STRUCTURED_INSTRUCTIONS,
  generateFeaturesFromSpecPrompt: DEFAULT_GENERATE_FEATURES_FROM_SPEC_PROMPT,
};

/**
 * ========================================================================
 * CONTEXT DESCRIPTION PROMPTS
 * ========================================================================
 */

export const DEFAULT_DESCRIBE_FILE_PROMPT = `Analyze the following file and provide a 1-2 sentence description suitable for use as context in an AI coding assistant. Focus on what the file contains, its purpose, and why an AI agent might want to use this context in the future (e.g., "API documentation for the authentication endpoints", "Configuration file for database connections", "Coding style guidelines for the project").

Respond with ONLY the description text, no additional formatting, preamble, or explanation.`;

export const DEFAULT_DESCRIBE_IMAGE_PROMPT = `Describe this image in 1-2 sentences suitable for use as context in an AI coding assistant. Focus on what the image shows and its purpose (e.g., "UI mockup showing login form with email/password fields", "Architecture diagram of microservices", "Screenshot of error message in terminal").

Respond with ONLY the description text, no additional formatting, preamble, or explanation.`;

/**
 * Default Context Description prompts (for file/image descriptions)
 */
export const DEFAULT_CONTEXT_DESCRIPTION_PROMPTS: ResolvedContextDescriptionPrompts = {
  describeFilePrompt: DEFAULT_DESCRIBE_FILE_PROMPT,
  describeImagePrompt: DEFAULT_DESCRIBE_IMAGE_PROMPT,
};

/**
 * ========================================================================
 * SUGGESTIONS PROMPTS
 * ========================================================================
 */

export const DEFAULT_SUGGESTIONS_FEATURES_PROMPT =
  'Analyze this project and suggest new features that would add value.';
export const DEFAULT_SUGGESTIONS_REFACTORING_PROMPT =
  'Analyze this project and identify refactoring opportunities.';
export const DEFAULT_SUGGESTIONS_SECURITY_PROMPT =
  'Analyze this project for security vulnerabilities and suggest fixes.';
export const DEFAULT_SUGGESTIONS_PERFORMANCE_PROMPT =
  'Analyze this project for performance issues and suggest optimizations.';

export const DEFAULT_SUGGESTIONS_BASE_TEMPLATE = `Look at the codebase and provide 3-5 concrete suggestions.

For each suggestion, provide:
1. A category (e.g., "User Experience", "Security", "Performance")
2. A clear description of what to implement
3. Priority (1=high, 2=medium, 3=low)
4. Brief reasoning for why this would help

The response will be automatically formatted as structured JSON.`;

/**
 * Default Suggestions prompts (for features, refactoring, security, performance)
 */
export const DEFAULT_SUGGESTIONS_PROMPTS: ResolvedSuggestionsPrompts = {
  featuresPrompt: DEFAULT_SUGGESTIONS_FEATURES_PROMPT,
  refactoringPrompt: DEFAULT_SUGGESTIONS_REFACTORING_PROMPT,
  securityPrompt: DEFAULT_SUGGESTIONS_SECURITY_PROMPT,
  performancePrompt: DEFAULT_SUGGESTIONS_PERFORMANCE_PROMPT,
  baseTemplate: DEFAULT_SUGGESTIONS_BASE_TEMPLATE,
};

/**
 * ========================================================================
 * TASK EXECUTION PROMPTS
 * ========================================================================
 */

export const DEFAULT_TASK_PROMPT_TEMPLATE = `# Task Execution: {{taskId}}

You are executing a specific task as part of a larger feature implementation.

## Your Current Task

**Task ID:** {{taskId}}
**Description:** {{taskDescription}}
{{#if filePath}}**Primary File:** {{filePath}}{{/if}}
{{#if phase}}**Phase:** {{phase}}{{/if}}

## Context

{{#if completedTasks}}
### Already Completed ({{completedTasksCount}} tasks)
{{#each completedTasks}}
- [x] {{id}}: {{description}}
{{/each}}
{{/if}}

{{#if remainingTasks}}
### Remaining Tasks ({{remainingTasksCount}} tasks)
{{#each remainingTasks}}
- [ ] {{id}}: {{description}}
{{/each}}
{{/if}}

{{#if userFeedback}}
## User Feedback
{{userFeedback}}
{{/if}}

## Instructions

1. Focus ONLY on completing task {{taskId}}: "{{taskDescription}}"
2. Do not work on other tasks
3. Use the existing codebase patterns
4. When done, summarize what you implemented

Begin implementing task {{taskId}} now.`;

export const DEFAULT_IMPLEMENTATION_INSTRUCTIONS = `## Instructions

Implement this feature by:
1. First, explore the codebase to understand the existing structure
2. Plan your implementation approach
3. Write the necessary code changes
4. Ensure the code follows existing patterns and conventions

When done, wrap your final summary in <summary> tags like this:

<summary>
## Summary: [Feature Title]

### Changes Implemented
- [List of changes made]

### Files Modified
- [List of files]

### Notes for Developer
- [Any important notes]
</summary>

This helps parse your summary correctly in the output logs.`;

export const DEFAULT_PLAYWRIGHT_VERIFICATION_INSTRUCTIONS = `## Verification with Playwright (REQUIRED)

After implementing the feature, you MUST verify it works correctly using Playwright:

1. **Create a temporary Playwright test** to verify the feature works as expected
2. **Run the test** to confirm the feature is working
3. **Delete the test file** after verification - this is a temporary verification test, not a permanent test suite addition

Example verification workflow:
\`\`\`bash
# Create a simple verification test
npx playwright test my-verification-test.spec.ts

# After successful verification, delete the test
rm my-verification-test.spec.ts
\`\`\`

The test should verify the core functionality of the feature. If the test fails, fix the implementation and re-test.

When done, include in your summary:

### Verification Status
- [Describe how the feature was verified with Playwright]`;

export const DEFAULT_LEARNING_EXTRACTION_SYSTEM_PROMPT =
  'You are a JSON extraction assistant. You MUST respond with ONLY valid JSON, no explanations, no markdown, no other text. Extract learnings from the provided implementation context and return them as JSON.';

export const DEFAULT_LEARNING_EXTRACTION_USER_TEMPLATE = `You are an Architecture Decision Record (ADR) extractor. Analyze this implementation and return ONLY JSON with learnings. No explanations.

Feature: "{{featureTitle}}"

Implementation log:
{{implementationLog}}

Extract MEANINGFUL learnings - not obvious things. For each, capture:
- DECISIONS: Why this approach vs alternatives? What would break if changed?
- GOTCHAS: What was unexpected? What's the root cause? How to avoid?
- PATTERNS: Why this pattern? What problem does it solve? Trade-offs?

JSON format ONLY (no markdown, no text):
{"learnings": [{
  "category": "architecture|api|ui|database|auth|testing|performance|security|gotchas",
  "type": "decision|gotcha|pattern",
  "content": "What was done/learned",
  "context": "Problem being solved or situation faced",
  "why": "Reasoning - why this approach",
  "rejected": "Alternative considered and why rejected",
  "tradeoffs": "What became easier/harder",
  "breaking": "What breaks if this is changed/removed"
}]}

IMPORTANT: Only include NON-OBVIOUS learnings with real reasoning. Skip trivial patterns.
If nothing notable: {"learnings": []}`;

export const DEFAULT_PLAN_REVISION_TEMPLATE = `The user has requested revisions to the plan/specification.

## Previous Plan (v{{planVersion}})
{{previousPlan}}

## User Feedback
{{userFeedback}}

## Instructions
Please regenerate the specification incorporating the user's feedback.
Keep the same format with the \`\`\`tasks block for task definitions.
After generating the revised spec, output:
"[SPEC_GENERATED] Please review the revised specification above."`;

export const DEFAULT_CONTINUATION_AFTER_APPROVAL_TEMPLATE = `The plan/specification has been approved. Now implement it.
{{#if userFeedback}}

## User Feedback
{{userFeedback}}
{{/if}}

## Approved Plan

{{approvedPlan}}

## Instructions

Implement all the changes described in the plan above.`;

export const DEFAULT_RESUME_FEATURE_TEMPLATE = `## Continuing Feature Implementation

{{featurePrompt}}

## Previous Context
The following is the output from a previous implementation attempt. Continue from where you left off:

{{previousContext}}

## Instructions
Review the previous work and continue the implementation. If the feature appears complete, verify it works correctly.`;

export const DEFAULT_PROJECT_ANALYSIS_PROMPT = `Analyze this project and provide a summary of:
1. Project structure and architecture
2. Main technologies and frameworks used
3. Key components and their responsibilities
4. Build and test commands
5. Any existing conventions or patterns

Format your response as a structured markdown document.`;

/**
 * Default Task Execution prompts (for Auto Mode task execution, learning extraction)
 */
export const DEFAULT_TASK_EXECUTION_PROMPTS: ResolvedTaskExecutionPrompts = {
  taskPromptTemplate: DEFAULT_TASK_PROMPT_TEMPLATE,
  implementationInstructions: DEFAULT_IMPLEMENTATION_INSTRUCTIONS,
  playwrightVerificationInstructions: DEFAULT_PLAYWRIGHT_VERIFICATION_INSTRUCTIONS,
  learningExtractionSystemPrompt: DEFAULT_LEARNING_EXTRACTION_SYSTEM_PROMPT,
  learningExtractionUserPromptTemplate: DEFAULT_LEARNING_EXTRACTION_USER_TEMPLATE,
  planRevisionTemplate: DEFAULT_PLAN_REVISION_TEMPLATE,
  continuationAfterApprovalTemplate: DEFAULT_CONTINUATION_AFTER_APPROVAL_TEMPLATE,
  resumeFeatureTemplate: DEFAULT_RESUME_FEATURE_TEMPLATE,
  projectAnalysisPrompt: DEFAULT_PROJECT_ANALYSIS_PROMPT,
};

/**
 * ========================================================================
 * COMBINED DEFAULTS
 * ========================================================================
 */

/**
 * All default prompts in one object for easy access
 */
export const DEFAULT_PROMPTS = {
  autoMode: DEFAULT_AUTO_MODE_PROMPTS,
  agent: DEFAULT_AGENT_PROMPTS,
  backlogPlan: DEFAULT_BACKLOG_PLAN_PROMPTS,
  enhancement: DEFAULT_ENHANCEMENT_PROMPTS,
  commitMessage: DEFAULT_COMMIT_MESSAGE_PROMPTS,
  titleGeneration: DEFAULT_TITLE_GENERATION_PROMPTS,
  issueValidation: DEFAULT_ISSUE_VALIDATION_PROMPTS,
  ideation: DEFAULT_IDEATION_PROMPTS,
  appSpec: DEFAULT_APP_SPEC_PROMPTS,
  contextDescription: DEFAULT_CONTEXT_DESCRIPTION_PROMPTS,
  suggestions: DEFAULT_SUGGESTIONS_PROMPTS,
  taskExecution: DEFAULT_TASK_EXECUTION_PROMPTS,
} as const;
