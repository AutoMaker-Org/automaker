/**
 * Issue Validation Types
 *
 * Types for validating GitHub issues against the codebase using Claude SDK.
 */

import type { AgentModel } from './model.js';

/**
 * Verdict from issue validation
 */
export type IssueValidationVerdict = 'valid' | 'invalid' | 'needs_clarification';

/**
 * Confidence level of the validation
 */
export type IssueValidationConfidence = 'high' | 'medium' | 'low';

/**
 * Complexity estimation for valid issues
 */
export type IssueComplexity = 'trivial' | 'simple' | 'moderate' | 'complex' | 'very_complex';

/**
 * Recommendation for PR-related action
 */
export type PRRecommendation = 'wait_for_merge' | 'pr_needs_work' | 'no_pr';

/**
 * Analysis of a linked pull request
 */
export interface PRAnalysis {
  /** Whether there is an open PR linked to this issue */
  hasOpenPR: boolean;
  /** Whether the PR appears to fix the issue based on the diff */
  prFixesIssue?: boolean;
  /** The PR number that was analyzed */
  prNumber?: number;
  /** Brief summary of what the PR changes */
  prSummary?: string;
  /** Recommendation: wait for PR to merge, PR needs more work, or no relevant PR */
  recommendation: PRRecommendation;
}

/**
 * Linked PR info for validation
 */
export interface LinkedPRInfo {
  number: number;
  title: string;
  state: string;
}

/**
 * Issue data for validation (without projectPath)
 * Used by UI when calling the validation API
 */
export interface IssueValidationInput {
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  issueLabels?: string[];
  /** Comments to include in validation analysis */
  comments?: GitHubComment[];
  /** Linked pull requests for this issue */
  linkedPRs?: LinkedPRInfo[];
}

/**
 * Full request payload for issue validation endpoint
 * Includes projectPath for server-side handling
 */
export interface IssueValidationRequest extends IssueValidationInput {
  projectPath: string;
}

/**
 * Result from Claude's issue validation analysis
 */
export interface IssueValidationResult {
  /** Whether the issue is valid, invalid, or needs clarification */
  verdict: IssueValidationVerdict;
  /** How confident the AI is in its assessment */
  confidence: IssueValidationConfidence;
  /** Detailed explanation of the verdict */
  reasoning: string;
  /** For bug reports: whether the bug was confirmed in the codebase */
  bugConfirmed?: boolean;
  /** Files related to the issue found during analysis */
  relatedFiles?: string[];
  /** Suggested approach to fix or implement */
  suggestedFix?: string;
  /** Information that's missing and needed for validation (when verdict = needs_clarification) */
  missingInfo?: string[];
  /** Estimated effort to address the issue */
  estimatedComplexity?: IssueComplexity;
  /** Analysis of linked pull requests (if any) */
  prAnalysis?: PRAnalysis;
}

/**
 * Successful response from validate-issue endpoint
 */
export interface IssueValidationResponse {
  success: true;
  issueNumber: number;
  validation: IssueValidationResult;
}

/**
 * Error response from validate-issue endpoint
 */
export interface IssueValidationErrorResponse {
  success: false;
  error: string;
}

/**
 * Events emitted during async issue validation
 */
export type IssueValidationEvent =
  | {
      type: 'issue_validation_start';
      issueNumber: number;
      issueTitle: string;
      projectPath: string;
    }
  | {
      type: 'issue_validation_progress';
      issueNumber: number;
      content: string;
      projectPath: string;
    }
  | {
      type: 'issue_validation_complete';
      issueNumber: number;
      issueTitle: string;
      result: IssueValidationResult;
      projectPath: string;
      /** Model used for validation (opus, sonnet, haiku) */
      model: AgentModel;
    }
  | {
      type: 'issue_validation_error';
      issueNumber: number;
      error: string;
      projectPath: string;
    }
  | {
      type: 'issue_validation_viewed';
      issueNumber: number;
      projectPath: string;
    };

/**
 * Stored validation data with metadata for cache
 */
export interface StoredValidation {
  /** GitHub issue number */
  issueNumber: number;
  /** Issue title at time of validation */
  issueTitle: string;
  /** ISO timestamp when validation was performed */
  validatedAt: string;
  /** Model used for validation (opus, sonnet, haiku) */
  model: AgentModel;
  /** The validation result */
  result: IssueValidationResult;
  /** ISO timestamp when user viewed this validation (undefined = not yet viewed) */
  viewedAt?: string;
}

/**
 * Author of a GitHub comment
 */
export interface GitHubCommentAuthor {
  login: string;
  avatarUrl?: string;
}

/**
 * A comment on a GitHub issue
 */
export interface GitHubComment {
  /** Unique comment ID */
  id: string;
  /** Author of the comment */
  author: GitHubCommentAuthor;
  /** Comment body (markdown) */
  body: string;
  /** ISO timestamp when comment was created */
  createdAt: string;
  /** ISO timestamp when comment was last updated */
  updatedAt?: string;
}

/**
 * Result from fetching issue comments
 */
export interface IssueCommentsResult {
  /** List of comments */
  comments: GitHubComment[];
  /** Total number of comments on the issue */
  totalCount: number;
  /** Whether there are more comments to fetch */
  hasNextPage: boolean;
  /** Cursor for pagination (pass to next request) */
  endCursor?: string;
}
