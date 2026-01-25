/**
 * Issue Validation Schema and Prompt Building
 *
 * Defines the JSON schema for Claude's structured output and
 * helper functions for building validation prompts.
 *
 * Note: The system prompt is now centralized in @automaker/prompts
 * and accessed via getPromptCustomization() in validate-issue.ts
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
