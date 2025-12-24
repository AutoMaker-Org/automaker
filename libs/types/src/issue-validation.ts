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
 * Issue data for validation (without projectPath)
 * Used by UI when calling the validation API
 */
export interface IssueValidationInput {
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  issueLabels?: string[];
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
