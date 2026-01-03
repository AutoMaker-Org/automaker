/**
 * Error handling utilities for standardized error classification
 *
 * Provides utilities for:
 * - Detecting abort/cancellation errors
 * - Detecting authentication errors
 * - Detecting rate limit and quota exhaustion errors
 * - Classifying errors by type
 * - Generating user-friendly error messages
 */

import type { ErrorType, ErrorInfo } from '@automaker/types';

/**
 * Check if an error is an abort/cancellation error
 *
 * @param error - The error to check
 * @returns True if the error is an abort error
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.message.includes('abort'));
}

/**
 * Check if an error is a user-initiated cancellation
 *
 * @param errorMessage - The error message to check
 * @returns True if the error is a user-initiated cancellation
 */
export function isCancellationError(errorMessage: string): boolean {
  const lowerMessage = errorMessage.toLowerCase();
  return (
    lowerMessage.includes('cancelled') ||
    lowerMessage.includes('canceled') ||
    lowerMessage.includes('stopped') ||
    lowerMessage.includes('aborted')
  );
}

/**
 * Check if an error is an authentication/API key error
 *
 * @param errorMessage - The error message to check
 * @returns True if the error is authentication-related
 */
export function isAuthenticationError(errorMessage: string): boolean {
  return (
    errorMessage.includes('Authentication failed') ||
    errorMessage.includes('Invalid API key') ||
    errorMessage.includes('authentication_failed') ||
    errorMessage.includes('Fix external API key')
  );
}

/**
 * Check if an error is a rate limit error (429 Too Many Requests)
 *
 * @param error - The error to check
 * @returns True if the error is a rate limit error
 */
export function isRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return message.includes('429') || message.includes('rate_limit');
}

/**
 * Check if an error indicates quota/usage exhaustion
 * This includes session limits, weekly limits, credit/billing issues, and overloaded errors
 *
 * @param error - The error to check
 * @returns True if the error indicates quota exhaustion
 */
export function isQuotaExhaustedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  const lowerMessage = message.toLowerCase();

  // Check for overloaded/capacity errors
  if (
    lowerMessage.includes('overloaded') ||
    lowerMessage.includes('overloaded_error') ||
    lowerMessage.includes('capacity')
  ) {
    return true;
  }

  // Check for usage/quota limit patterns
  if (
    lowerMessage.includes('limit reached') ||
    lowerMessage.includes('usage limit') ||
    lowerMessage.includes('quota exceeded') ||
    lowerMessage.includes('quota_exceeded') ||
    lowerMessage.includes('session limit') ||
    lowerMessage.includes('weekly limit') ||
    lowerMessage.includes('monthly limit')
  ) {
    return true;
  }

  // Check for billing/credit issues
  if (
    lowerMessage.includes('credit balance') ||
    lowerMessage.includes('insufficient credits') ||
    lowerMessage.includes('insufficient balance') ||
    lowerMessage.includes('no credits') ||
    lowerMessage.includes('out of credits') ||
    lowerMessage.includes('billing') ||
    lowerMessage.includes('payment required')
  ) {
    return true;
  }

  // Check for upgrade prompts (often indicates limit reached)
  if (lowerMessage.includes('/upgrade') || lowerMessage.includes('extra-usage')) {
    return true;
  }

  return false;
}

/**
 * Extract retry-after duration from rate limit error
 *
 * @param error - The error to extract retry-after from
 * @returns Number of seconds to wait, or undefined if not found
 */
export function extractRetryAfter(error: unknown): number | undefined {
  const message = error instanceof Error ? error.message : String(error || '');

  // Try to extract from Retry-After header format
  const retryMatch = message.match(/retry[_-]?after[:\s]+(\d+)/i);
  if (retryMatch) {
    return parseInt(retryMatch[1], 10);
  }

  // Try to extract from error message patterns
  const waitMatch = message.match(/wait[:\s]+(\d+)\s*(?:second|sec|s)/i);
  if (waitMatch) {
    return parseInt(waitMatch[1], 10);
  }

  return undefined;
}

/**
 * Classify an error into a specific type
 *
 * @param error - The error to classify
 * @returns Classified error information
 */
export function classifyError(error: unknown): ErrorInfo {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error');
  const isAbort = isAbortError(error);
  const isAuth = isAuthenticationError(message);
  const isCancellation = isCancellationError(message);
  const isRateLimit = isRateLimitError(error);
  const isQuotaExhausted = isQuotaExhaustedError(error);
  const retryAfter = isRateLimit ? (extractRetryAfter(error) ?? 60) : undefined;

  let type: ErrorType;
  if (isAuth) {
    type = 'authentication';
  } else if (isQuotaExhausted) {
    // Quota exhaustion takes priority over rate limit since it's more specific
    type = 'quota_exhausted';
  } else if (isRateLimit) {
    type = 'rate_limit';
  } else if (isAbort) {
    type = 'abort';
  } else if (isCancellation) {
    type = 'cancellation';
  } else if (error instanceof Error) {
    type = 'execution';
  } else {
    type = 'unknown';
  }

  return {
    type,
    message,
    isAbort,
    isAuth,
    isCancellation,
    isRateLimit,
    isQuotaExhausted,
    retryAfter,
    originalError: error,
  };
}

/**
 * Get a user-friendly error message
 *
 * @param error - The error to convert
 * @returns User-friendly error message
 */
export function getUserFriendlyErrorMessage(error: unknown): string {
  const info = classifyError(error);

  if (info.isAbort) {
    return 'Operation was cancelled';
  }

  if (info.isAuth) {
    return 'Authentication failed. Please check your API key.';
  }

  if (info.isQuotaExhausted) {
    return 'Usage limit reached. Auto Mode has been paused. Please wait for your quota to reset or upgrade your plan.';
  }

  if (info.isRateLimit) {
    const retryMsg = info.retryAfter
      ? ` Please wait ${info.retryAfter} seconds before retrying.`
      : ' Please reduce concurrency or wait before retrying.';
    return `Rate limit exceeded (429).${retryMsg}`;
  }

  return info.message;
}

/**
 * Extract error message from an unknown error value
 *
 * Simple utility for getting a string error message from any error type.
 * Returns the error's message property if it's an Error, otherwise
 * converts to string. Used throughout the codebase for consistent
 * error message extraction.
 *
 * @param error - The error value (Error object, string, or unknown)
 * @returns Error message string
 *
 * @example
 * ```typescript
 * try {
 *   throw new Error("Something went wrong");
 * } catch (error) {
 *   const message = getErrorMessage(error); // "Something went wrong"
 * }
 * ```
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
