/**
 * Issue Validation Schema and System Prompt
 *
 * Defines the JSON schema for Claude's structured output and
 * the system prompt that guides the validation process.
 */

/**
 * JSON Schema for issue validation structured output.
 * Used with Claude SDK's outputFormat option to ensure reliable parsing.
 */
export const issueValidationSchema = {
  type: 'object',
  properties: {
    verdict: {
      type: 'string',
      enum: ['valid', 'invalid', 'needs_clarification'],
      description: 'The validation verdict for the issue',
    },
    confidence: {
      type: 'string',
      enum: ['high', 'medium', 'low'],
      description: 'How confident the AI is in its assessment',
    },
    reasoning: {
      type: 'string',
      description: 'Detailed explanation of the verdict',
    },
    bugConfirmed: {
      type: 'boolean',
      description: 'For bug reports: whether the bug was confirmed in the codebase',
    },
    relatedFiles: {
      type: 'array',
      items: { type: 'string' },
      description: 'Files related to the issue found during analysis',
    },
    suggestedFix: {
      type: 'string',
      description: 'Suggested approach to fix or implement the issue',
    },
    missingInfo: {
      type: 'array',
      items: { type: 'string' },
      description: 'Information needed when verdict is needs_clarification',
    },
    estimatedComplexity: {
      type: 'string',
      enum: ['trivial', 'simple', 'moderate', 'complex', 'very_complex'],
      description: 'Estimated effort to address the issue',
    },
  },
  required: ['verdict', 'confidence', 'reasoning'],
  additionalProperties: false,
} as const;

/**
 * System prompt that guides Claude in validating GitHub issues.
 * Instructs the model to use read-only tools to analyze the codebase.
 */
export const ISSUE_VALIDATION_SYSTEM_PROMPT = `You are an expert code analyst validating GitHub issues against a codebase.

Your task is to analyze a GitHub issue and determine if it's valid by scanning the codebase.

## Validation Process

1. **Read the issue carefully** - Understand what is being reported or requested
2. **Search the codebase** - Use Glob to find relevant files by pattern, Grep to search for keywords
3. **Examine the code** - Use Read to look at the actual implementation in relevant files
4. **Form your verdict** - Based on your analysis, determine if the issue is valid

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

## Response Guidelines

- **Always include relatedFiles** when you find relevant code
- **Set bugConfirmed to true** only if you can definitively confirm a bug exists in the code
- **Provide a suggestedFix** when you have a clear idea of how to address the issue
- **Use missingInfo** when the verdict is needs_clarification to list what's needed
- **Set estimatedComplexity** to help prioritize:
  - trivial: Simple text changes, one-line fixes
  - simple: Small changes to one file
  - moderate: Changes to multiple files or moderate logic changes
  - complex: Significant refactoring or new feature implementation
  - very_complex: Major architectural changes or cross-cutting concerns

Be thorough in your analysis but focus on files that are directly relevant to the issue.`;

/**
 * Build the user prompt for issue validation.
 *
 * Creates a structured prompt that includes the issue details for Claude
 * to analyze against the codebase.
 *
 * @param issueNumber - The GitHub issue number
 * @param issueTitle - The issue title
 * @param issueBody - The issue body/description
 * @param issueLabels - Optional array of label names
 * @returns Formatted prompt string for the validation request
 */
export function buildValidationPrompt(
  issueNumber: number,
  issueTitle: string,
  issueBody: string,
  issueLabels?: string[]
): string {
  const labelsSection = issueLabels?.length ? `\n\n**Labels:** ${issueLabels.join(', ')}` : '';

  return `Please validate the following GitHub issue by analyzing the codebase:

## Issue #${issueNumber}: ${issueTitle}
${labelsSection}

### Description

${issueBody || '(No description provided)'}

---

Scan the codebase to verify this issue. Look for the files, components, or functionality mentioned. Determine if this issue is valid, invalid, or needs clarification.`;
}
