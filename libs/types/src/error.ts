/**
 * Error type classification
 */
export type ErrorType = "authentication" | "cancellation" | "abort" | "execution" | "unknown";

/**
 * Classified error information
 */
export interface ErrorInfo {
  type: ErrorType;
  message: string;
  isAbort: boolean;
  isAuth: boolean;
  isCancellation: boolean;
  originalError: unknown;
}
