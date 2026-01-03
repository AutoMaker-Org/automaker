import { describe, it, expect } from 'vitest';
import {
  isAbortError,
  isCancellationError,
  isAuthenticationError,
  isRateLimitError,
  isQuotaExhaustedError,
  extractRetryAfter,
  classifyError,
  getUserFriendlyErrorMessage,
} from '../src/error-handler';

describe('error-handler.ts', () => {
  describe('isAbortError', () => {
    it("should return true for Error with name 'AbortError'", () => {
      const error = new Error('Operation aborted');
      error.name = 'AbortError';
      expect(isAbortError(error)).toBe(true);
    });

    it("should return true for Error with message containing 'abort'", () => {
      const error = new Error('Request was aborted');
      expect(isAbortError(error)).toBe(true);
    });

    it('should return false for regular Error', () => {
      const error = new Error('Something went wrong');
      expect(isAbortError(error)).toBe(false);
    });

    it('should return false for non-Error values', () => {
      expect(isAbortError('abort')).toBe(false);
      expect(isAbortError(null)).toBe(false);
      expect(isAbortError(undefined)).toBe(false);
      expect(isAbortError({})).toBe(false);
    });

    it('should handle Error with both AbortError name and abort message', () => {
      const error = new Error('abort');
      error.name = 'AbortError';
      expect(isAbortError(error)).toBe(true);
    });
  });

  describe('isCancellationError', () => {
    it("should return true for 'cancelled' message", () => {
      expect(isCancellationError('Operation cancelled')).toBe(true);
      expect(isCancellationError('CANCELLED')).toBe(true);
    });

    it("should return true for 'canceled' message (US spelling)", () => {
      expect(isCancellationError('Operation canceled')).toBe(true);
      expect(isCancellationError('CANCELED')).toBe(true);
    });

    it("should return true for 'stopped' message", () => {
      expect(isCancellationError('Process stopped')).toBe(true);
      expect(isCancellationError('STOPPED')).toBe(true);
    });

    it("should return true for 'aborted' message", () => {
      expect(isCancellationError('Request aborted')).toBe(true);
      expect(isCancellationError('ABORTED')).toBe(true);
    });

    it('should return false for non-cancellation messages', () => {
      expect(isCancellationError('Something went wrong')).toBe(false);
      expect(isCancellationError('Error occurred')).toBe(false);
      expect(isCancellationError('')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isCancellationError('CaNcElLeD')).toBe(true);
      expect(isCancellationError('StOpPeD')).toBe(true);
    });
  });

  describe('isAuthenticationError', () => {
    it("should return true for 'Authentication failed' message", () => {
      expect(isAuthenticationError('Authentication failed')).toBe(true);
    });

    it("should return true for 'Invalid API key' message", () => {
      expect(isAuthenticationError('Invalid API key provided')).toBe(true);
    });

    it("should return true for 'authentication_failed' message", () => {
      expect(isAuthenticationError('Error: authentication_failed')).toBe(true);
    });

    it("should return true for 'Fix external API key' message", () => {
      expect(isAuthenticationError('Fix external API key configuration')).toBe(true);
    });

    it('should return false for non-authentication errors', () => {
      expect(isAuthenticationError('Something went wrong')).toBe(false);
      expect(isAuthenticationError('Network error')).toBe(false);
      expect(isAuthenticationError('')).toBe(false);
    });

    it('should be case-sensitive', () => {
      expect(isAuthenticationError('authentication failed')).toBe(false);
      expect(isAuthenticationError('AUTHENTICATION FAILED')).toBe(false);
    });
  });

  describe('isRateLimitError', () => {
    it('should return true for errors with 429 status code', () => {
      const error = new Error('Error: 429 Too Many Requests');
      expect(isRateLimitError(error)).toBe(true);
    });

    it('should return true for errors with rate_limit in message', () => {
      const error = new Error('rate_limit_error: Too many requests');
      expect(isRateLimitError(error)).toBe(true);
    });

    it('should return true for string errors with 429', () => {
      expect(isRateLimitError('429 - rate limit exceeded')).toBe(true);
    });

    it('should return false for non-rate-limit errors', () => {
      const error = new Error('Something went wrong');
      expect(isRateLimitError(error)).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isRateLimitError(null)).toBe(false);
      expect(isRateLimitError(undefined)).toBe(false);
    });
  });

  describe('isQuotaExhaustedError', () => {
    it('should return true for overloaded errors', () => {
      expect(isQuotaExhaustedError(new Error('overloaded_error: service is busy'))).toBe(true);
      expect(isQuotaExhaustedError(new Error('Server is overloaded'))).toBe(true);
      expect(isQuotaExhaustedError(new Error('At capacity'))).toBe(true);
    });

    it('should return true for usage limit errors', () => {
      expect(isQuotaExhaustedError(new Error('limit reached'))).toBe(true);
      expect(isQuotaExhaustedError(new Error('Usage limit exceeded'))).toBe(true);
      expect(isQuotaExhaustedError(new Error('quota exceeded'))).toBe(true);
      expect(isQuotaExhaustedError(new Error('quota_exceeded'))).toBe(true);
      expect(isQuotaExhaustedError(new Error('session limit reached'))).toBe(true);
      expect(isQuotaExhaustedError(new Error('weekly limit hit'))).toBe(true);
      expect(isQuotaExhaustedError(new Error('monthly limit reached'))).toBe(true);
    });

    it('should return true for billing/credit errors', () => {
      expect(isQuotaExhaustedError(new Error('credit balance is too low'))).toBe(true);
      expect(isQuotaExhaustedError(new Error('insufficient credits'))).toBe(true);
      expect(isQuotaExhaustedError(new Error('insufficient balance'))).toBe(true);
      expect(isQuotaExhaustedError(new Error('no credits remaining'))).toBe(true);
      expect(isQuotaExhaustedError(new Error('out of credits'))).toBe(true);
      expect(isQuotaExhaustedError(new Error('billing issue detected'))).toBe(true);
      expect(isQuotaExhaustedError(new Error('payment required'))).toBe(true);
    });

    it('should return true for upgrade prompts', () => {
      expect(isQuotaExhaustedError(new Error('Please /upgrade your plan'))).toBe(true);
      expect(isQuotaExhaustedError(new Error('extra-usage not enabled'))).toBe(true);
    });

    it('should return false for regular errors', () => {
      expect(isQuotaExhaustedError(new Error('Something went wrong'))).toBe(false);
      expect(isQuotaExhaustedError(new Error('Network error'))).toBe(false);
      expect(isQuotaExhaustedError(new Error(''))).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isQuotaExhaustedError(null)).toBe(false);
      expect(isQuotaExhaustedError(undefined)).toBe(false);
    });

    it('should handle string errors', () => {
      expect(isQuotaExhaustedError('overloaded')).toBe(true);
      expect(isQuotaExhaustedError('regular error')).toBe(false);
    });
  });

  describe('extractRetryAfter', () => {
    it('should extract retry-after from error message', () => {
      const error = new Error('Rate limit exceeded. retry-after: 60');
      expect(extractRetryAfter(error)).toBe(60);
    });

    it('should extract from retry_after format', () => {
      const error = new Error('retry_after: 120 seconds');
      expect(extractRetryAfter(error)).toBe(120);
    });

    it('should extract from wait format', () => {
      const error = new Error('Please wait: 30 seconds before retrying');
      expect(extractRetryAfter(error)).toBe(30);
    });

    it('should return undefined for rate limit errors without explicit retry-after', () => {
      const error = new Error('429 rate_limit_error');
      expect(extractRetryAfter(error)).toBeUndefined();
    });

    it('should return undefined for non-rate-limit errors', () => {
      const error = new Error('Something went wrong');
      expect(extractRetryAfter(error)).toBeUndefined();
    });

    it('should handle string errors', () => {
      expect(extractRetryAfter('retry-after: 45')).toBe(45);
    });
  });

  describe('classifyError', () => {
    it('should classify authentication errors', () => {
      const error = new Error('Authentication failed');
      const result = classifyError(error);

      expect(result.type).toBe('authentication');
      expect(result.isAuth).toBe(true);
      expect(result.isAbort).toBe(false);
      expect(result.isCancellation).toBe(false);
      expect(result.isRateLimit).toBe(false);
      expect(result.isQuotaExhausted).toBe(false);
      expect(result.message).toBe('Authentication failed');
      expect(result.originalError).toBe(error);
    });

    it('should classify quota exhausted errors', () => {
      const error = new Error('overloaded_error: service is busy');
      const result = classifyError(error);

      expect(result.type).toBe('quota_exhausted');
      expect(result.isQuotaExhausted).toBe(true);
      expect(result.isRateLimit).toBe(false);
      expect(result.isAuth).toBe(false);
    });

    it('should classify credit balance errors as quota exhausted', () => {
      const error = new Error('credit balance is too low');
      const result = classifyError(error);

      expect(result.type).toBe('quota_exhausted');
      expect(result.isQuotaExhausted).toBe(true);
    });

    it('should classify usage limit errors as quota exhausted', () => {
      const error = new Error('usage limit reached');
      const result = classifyError(error);

      expect(result.type).toBe('quota_exhausted');
      expect(result.isQuotaExhausted).toBe(true);
    });

    it('should classify rate limit errors', () => {
      const error = new Error('Error: 429 rate_limit_error');
      const result = classifyError(error);

      expect(result.type).toBe('rate_limit');
      expect(result.isRateLimit).toBe(true);
      expect(result.isAuth).toBe(false);
      expect(result.retryAfter).toBe(60); // Default
    });

    it('should extract retryAfter from rate limit errors', () => {
      const error = new Error('429 - retry-after: 120');
      const result = classifyError(error);

      expect(result.type).toBe('rate_limit');
      expect(result.isRateLimit).toBe(true);
      expect(result.retryAfter).toBe(120);
    });

    it('should classify abort errors', () => {
      const error = new Error('aborted');
      const result = classifyError(error);

      expect(result.type).toBe('abort');
      expect(result.isAbort).toBe(true);
      expect(result.isAuth).toBe(false);
      expect(result.message).toBe('aborted');
    });

    it('should classify AbortError by name', () => {
      const error = new Error('Request cancelled');
      error.name = 'AbortError';
      const result = classifyError(error);

      expect(result.type).toBe('abort');
      expect(result.isAbort).toBe(true);
    });

    it('should classify cancellation errors', () => {
      const error = new Error('Operation cancelled');
      const result = classifyError(error);

      expect(result.type).toBe('cancellation');
      expect(result.isCancellation).toBe(true);
      expect(result.isAbort).toBe(false);
    });

    it('should classify execution errors (regular Error)', () => {
      const error = new Error('Something went wrong');
      const result = classifyError(error);

      expect(result.type).toBe('execution');
      expect(result.isAuth).toBe(false);
      expect(result.isAbort).toBe(false);
      expect(result.isCancellation).toBe(false);
    });

    it('should classify unknown errors (non-Error)', () => {
      const result = classifyError('string error');

      expect(result.type).toBe('unknown');
      expect(result.message).toBe('string error');
    });

    it('should handle null/undefined errors', () => {
      const result1 = classifyError(null);
      expect(result1.type).toBe('unknown');
      expect(result1.message).toBe('Unknown error');

      const result2 = classifyError(undefined);
      expect(result2.type).toBe('unknown');
      expect(result2.message).toBe('Unknown error');
    });

    it('should prioritize authentication over rate limit', () => {
      const error = new Error('Authentication failed - 429');
      const result = classifyError(error);

      expect(result.type).toBe('authentication');
      expect(result.isAuth).toBe(true);
      expect(result.isRateLimit).toBe(true); // Both flags can be true
    });

    it('should prioritize rate limit over abort', () => {
      const error = new Error('429 rate_limit - aborted');
      const result = classifyError(error);

      expect(result.type).toBe('rate_limit');
      expect(result.isRateLimit).toBe(true);
      expect(result.isAbort).toBe(true);
    });

    it('should prioritize authentication over abort', () => {
      const error = new Error('Authentication failed - aborted');
      const result = classifyError(error);

      expect(result.type).toBe('authentication');
      expect(result.isAuth).toBe(true);
      expect(result.isAbort).toBe(true); // Both flags can be true
    });

    it('should prioritize abort over cancellation', () => {
      const error = new Error('Request cancelled');
      error.name = 'AbortError';
      const result = classifyError(error);

      expect(result.type).toBe('abort');
      expect(result.isAbort).toBe(true);
      expect(result.isCancellation).toBe(true); // Both flags can be true
    });

    it('should convert object errors to string', () => {
      const result = classifyError({ code: 500, message: 'Server error' });
      expect(result.message).toContain('Object');
    });

    it('should convert number errors to string', () => {
      const result = classifyError(404);
      expect(result.message).toBe('404');
      expect(result.type).toBe('unknown');
    });
  });

  describe('getUserFriendlyErrorMessage', () => {
    it('should return friendly message for abort errors', () => {
      const error = new Error('abort');
      const message = getUserFriendlyErrorMessage(error);

      expect(message).toBe('Operation was cancelled');
    });

    it('should return friendly message for AbortError by name', () => {
      const error = new Error('Something');
      error.name = 'AbortError';
      const message = getUserFriendlyErrorMessage(error);

      expect(message).toBe('Operation was cancelled');
    });

    it('should return friendly message for authentication errors', () => {
      const error = new Error('Authentication failed');
      const message = getUserFriendlyErrorMessage(error);

      expect(message).toBe('Authentication failed. Please check your API key.');
    });

    it('should return friendly message for quota exhausted errors', () => {
      const error = new Error('overloaded_error');
      const message = getUserFriendlyErrorMessage(error);

      expect(message).toContain('Usage limit reached');
      expect(message).toContain('Auto Mode has been paused');
    });

    it('should return friendly message for rate limit errors', () => {
      const error = new Error('429 rate_limit_error');
      const message = getUserFriendlyErrorMessage(error);

      expect(message).toContain('Rate limit exceeded');
      expect(message).toContain('60 seconds');
    });

    it('should include custom retry-after in rate limit message', () => {
      const error = new Error('429 - retry-after: 120');
      const message = getUserFriendlyErrorMessage(error);

      expect(message).toContain('Rate limit exceeded');
      expect(message).toContain('120 seconds');
    });

    it('should prioritize abort message over auth', () => {
      const error = new Error('Authentication failed - abort');
      const message = getUserFriendlyErrorMessage(error);

      // Auth is checked first in classifyError, but abort check happens before auth in getUserFriendlyErrorMessage
      expect(message).toBe('Operation was cancelled');
    });

    it('should return original message for other errors', () => {
      const error = new Error('Network timeout');
      const message = getUserFriendlyErrorMessage(error);

      expect(message).toBe('Network timeout');
    });

    it('should handle non-Error values', () => {
      expect(getUserFriendlyErrorMessage('string error')).toBe('string error');
      expect(getUserFriendlyErrorMessage(null)).toBe('Unknown error');
      expect(getUserFriendlyErrorMessage(undefined)).toBe('Unknown error');
    });

    it('should return original message for cancellation errors', () => {
      const error = new Error('Operation cancelled by user');
      const message = getUserFriendlyErrorMessage(error);

      expect(message).toBe('Operation cancelled by user');
    });

    it('should handle Error without message', () => {
      const error = new Error();
      const message = getUserFriendlyErrorMessage(error);

      expect(message).toBe('');
    });
  });
});
