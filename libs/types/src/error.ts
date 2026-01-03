/**
 * Error type classification
 */
export type ErrorType =
  | 'authentication'
  | 'cancellation'
  | 'abort'
  | 'execution'
  | 'rate_limit'
  | 'quota_exhausted'
  | 'unknown';

/**
 * Classified error information
 */
export interface ErrorInfo {
  type: ErrorType;
  message: string;
  isAbort: boolean;
  isAuth: boolean;
  isCancellation: boolean;
  isRateLimit: boolean;
  isQuotaExhausted: boolean; // Session/weekly usage limit reached
  retryAfter?: number; // Seconds to wait before retrying (for rate limit errors)
  originalError: unknown;
}
