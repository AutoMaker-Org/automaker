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
    prAnalysis: {
      type: 'object',
      properties: {
        hasOpenPR: {
          type: 'boolean',
          description: 'Whether there is an open PR linked to this issue',
        },
        prFixesIssue: {
          type: 'boolean',
          description: 'Whether the PR appears to fix the issue based on the diff',
        },
        prNumber: {
          type: 'number',
          description: 'The PR number that was analyzed',
        },
        prSummary: {
          type: 'string',
          description: 'Brief summary of what the PR changes',
        },
        recommendation: {
          type: 'string',
          enum: ['wait_for_merge', 'pr_needs_work', 'no_pr'],
          description:
            'Recommendation: wait for PR to merge, PR needs more work, or no relevant PR',
        },
      },
      description: 'Analysis of linked pull requests if any exist',
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
 * Comment data structure for validation prompt
 */
export interface ValidationComment {
  author: string;
  createdAt: string;
  body: string;
}

/**
 * Linked PR data structure for validation prompt
 */
export interface ValidationLinkedPR {
  number: number;
  title: string;
  state: string;
}

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
 * @param comments - Optional array of comments to include in analysis
 * @param linkedPRs - Optional array of linked pull requests
 * @returns Formatted prompt string for the validation request
 */
export function buildValidationPrompt(
  issueNumber: number,
  issueTitle: string,
  issueBody: string,
  issueLabels?: string[],
  comments?: ValidationComment[],
  linkedPRs?: ValidationLinkedPR[]
): string {
  const labelsSection = issueLabels?.length ? `\n\n**Labels:** ${issueLabels.join(', ')}` : '';

  let linkedPRsSection = '';
  if (linkedPRs && linkedPRs.length > 0) {
    const prsText = linkedPRs
      .map((pr) => `- PR #${pr.number} (${pr.state}): ${pr.title}`)
      .join('\n');
    linkedPRsSection = `\n\n### Linked Pull Requests\n\n${prsText}`;
  }

  let commentsSection = '';
  if (comments && comments.length > 0) {
    // Limit to most recent 10 comments to control prompt size
    const recentComments = comments.slice(-10);
    const commentsText = recentComments
      .map(
        (c) => `**${c.author}** (${new Date(c.createdAt).toISOString().slice(0, 10)}):\n${c.body}`
      )
      .join('\n\n---\n\n');

    commentsSection = `\n\n### Comments (${comments.length} total${comments.length > 10 ? ', showing last 10' : ''})\n\n${commentsText}`;
  }

  const hasWorkInProgress =
    linkedPRs && linkedPRs.some((pr) => pr.state === 'open' || pr.state === 'OPEN');
  const workInProgressNote = hasWorkInProgress
    ? '\n\n**Note:** This issue has an open pull request linked. Consider that someone may already be working on a fix.'
    : '';

  return `Please validate the following GitHub issue by analyzing the codebase:

## Issue #${issueNumber}: ${issueTitle}
${labelsSection}
${linkedPRsSection}

### Description

${issueBody || '(No description provided)'}
${commentsSection}
${workInProgressNote}

---

Scan the codebase to verify this issue. Look for the files, components, or functionality mentioned. Determine if this issue is valid, invalid, or needs clarification.${comments && comments.length > 0 ? ' Consider the context provided in the comments as well.' : ''}${hasWorkInProgress ? ' Also note in your analysis if there is already work in progress on this issue.' : ''}`;
}
